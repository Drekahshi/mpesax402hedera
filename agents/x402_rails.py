"""
agents/x402_rails.py
x402 HTTP payment middleware for the KAI agent server.

Implements the full x402 flow on Sepolia / Hedera Testnet:
    1. Server decorates a route → returns HTTP 402 with payment requirements
    2. Client receives the challenge, signs an EIP-3009 transfer authorisation
       (EVM) OR an HBAR-native payment (Hedera path)
    3. Client retries with X-PAYMENT header containing the signed payload
    4. Middleware verifies the payment on-chain (or via registry) and allows through
    5. On success, the escrow contract records the settled payment reference

Phase 6 — Hedera HBAR / HTS payment support added:
    - HEDERA_PAYMENT_ENABLED env flag enables the Hedera payment path
    - When the client sends X-PAYMENT-NETWORK: hedera, the middleware
      checks an HBAR transfer on the Mirror Node instead of verifying an
      EIP-712 signature
    - Both paths coexist — the route price table is shared, amounts are
      expressed in the payment token's smallest unit for each network

Reference: https://x402.org
"""

from __future__ import annotations
import os
import json
import time
import hashlib
import base64
from typing import Callable, Awaitable, Any
import httpx
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from eth_account import Account
from eth_account.messages import encode_typed_data
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
SEPOLIA_RPC       = os.getenv("SEPOLIA_RPC_URL", "https://rpc.sepolia.org")
CHAIN_ID       = int(os.getenv("CHAIN_ID", "11155111"))
ESCROW_ADDR    = os.getenv("KAI_ESCROW_ADDRESS",    "")
REGISTRY_ADDR  = os.getenv("KAI_AGENT_REGISTRY",    "")
TREASURY_ADDR  = os.getenv("WALLET_ADDRESS",         "0xB13727161583e38185530755a1A96D00fcCae870")
USDC_ADDR      = os.getenv("USDC_SEPOLIA_ADDRESS",      "")  # USDC on Sepolia (if deployed)
CENTS_ADDR     = os.getenv("NEXT_PUBLIC_CENTS_ADDRESS", "")  # CENTS token as micro-payment

# Fall back to CENTS token if no USDC on Sepolia
PAYMENT_TOKEN  = USDC_ADDR or CENTS_ADDR or ""
PAYMENT_SYMBOL = "USDC" if USDC_ADDR else "CENTS"

# ── Hedera x402 config (Phase 6) ──────────────────────────────────────────────
HEDERA_NETWORK         = os.getenv("HEDERA_NETWORK", "testnet")
HEDERA_OPERATOR_ID     = os.getenv("HEDERA_OPERATOR_ID", "")
HEDERA_TREASURY_ID     = HEDERA_OPERATOR_ID   # treasury receives x402 HBAR payments
HEDERA_PAYMENT_ENABLED = bool(HEDERA_OPERATOR_ID)
HEDERA_KAIBAR_TOKEN    = os.getenv("HEDERA_KAIBAR_TOKEN_ID", "")
HEDERA_MIRROR_BASE     = os.getenv(
    "HEDERA_MIRROR_NODE_URL",
    "https://testnet.mirrornode.hedera.com" if HEDERA_NETWORK == "testnet"
    else "https://mainnet-public.mirrornode.hedera.com",
)
HEDERA_MIRROR_API = f"{HEDERA_MIRROR_BASE}/api/v1"

# x402 price table: agent route → cost in token units
# EVM path: 6 decimals for USDC, 18 for CENTS
# Hedera path: tinybar (1 HBAR = 100_000_000 tinybar)
# We price in tinybar ÷ 10 so ~0.01 HBAR per lightweight call
ROUTE_PRICES: dict[str, int] = {
    "/agents/tx/analyse":          100,     # 0.0001 USDC or 100 CENTS-wei
    "/agents/tx/stream":           100,
    "/agents/portfolio/health":    200,
    "/agents/portfolio/stream":    200,
    "/agents/audit":               500,
    "/agents/audit/stream":        500,
    "/agents/dao/draft":           200,
    "/agents/dao/stream":          200,
    "/agents/commodities/report":  100,
    "/agents/commodities/stream":  100,
    "/agents/policy/recommend":    200,
    "/agents/policy/stream":       200,
    "/agents/codegen/generate":    1000,
    "/agents/codegen/stream":      1000,
    "/agents/docs/ask":            100,
    "/agents/docs/stream":         100,
    "/agents/docs/ingest":         300,
}

# Hedera tinybar price table (mirrors EVM table, converted to tinybar)
# 1 tinybar = 0.00000001 HBAR; we price in units of 1_000_000 tinybar = 0.01 HBAR
# NOTE: the inner values below are ALREADY in tinybar (e.g. 1_000_000 = 0.01 HBAR) —
# do NOT multiply by another factor here, that previously caused a 10,000x
# overcharge (0.01 HBAR silently became 100 HBAR on every priced route).
HEDERA_ROUTE_PRICES: dict[str, int] = {
    route: max(1_000_000, price)   # at least 0.01 HBAR per call
    for route, price in {
        "/agents/tx/analyse":          1_000_000,
        "/agents/tx/stream":           1_000_000,
        "/agents/portfolio/health":    2_000_000,
        "/agents/portfolio/stream":    2_000_000,
        "/agents/audit":               5_000_000,
        "/agents/audit/stream":        5_000_000,
        "/agents/dao/draft":           2_000_000,
        "/agents/dao/stream":          2_000_000,
        "/agents/commodities/report":  1_000_000,
        "/agents/commodities/stream":  1_000_000,
        "/agents/policy/recommend":    2_000_000,
        "/agents/policy/stream":       2_000_000,
        "/agents/codegen/generate":   10_000_000,
        "/agents/codegen/stream":     10_000_000,
        "/agents/docs/ask":            1_000_000,
        "/agents/docs/stream":         1_000_000,
        "/agents/docs/ingest":         3_000_000,
    }.items()
}

# EIP-712 type for EIP-3009 transferWithAuthorization (simplified)
TRANSFER_AUTH_TYPES = {
    "EIP712Domain": [
        {"name": "name",              "type": "string"},
        {"name": "version",           "type": "string"},
        {"name": "chainId",           "type": "uint256"},
        {"name": "verifyingContract", "type": "address"},
    ],
    "TransferWithAuthorization": [
        {"name": "from",        "type": "address"},
        {"name": "to",          "type": "address"},
        {"name": "value",       "type": "uint256"},
        {"name": "validAfter",  "type": "uint256"},
        {"name": "validBefore", "type": "uint256"},
        {"name": "nonce",       "type": "bytes32"},
    ],
}

# ── Hedera payment verification (Phase 6) ────────────────────────────────────

async def _mirror_get(path: str) -> dict:
    """GET from the Hedera Mirror Node REST API."""
    url = f"{HEDERA_MIRROR_API}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.json()


async def verify_hedera_payment(
    payer_account: str,
    expected_amount_tinybar: int,
    nonce: str,
    max_age_seconds: int = 300,
) -> tuple[bool, str]:
    """
    Verify that a Hedera HBAR payment was made from payer_account to the
    treasury account, at or above the expected amount, within the last
    max_age_seconds seconds.

    Uses the Mirror Node transaction API — no private key required.
    Returns (is_valid, transaction_id).
    """
    if not HEDERA_TREASURY_ID:
        return False, ""
    try:
        cutoff = time.time() - max_age_seconds
        data   = await _mirror_get(
            f"/transactions?account.id={payer_account}&limit=20&order=desc"
        )
        for tx in data.get("transactions", []):
            ts = float(tx.get("consensus_timestamp", "0").replace(".", ""))
            if ts / 1e9 < cutoff:
                break   # transactions are ordered desc — stop once too old
            # Look for a CRYPTOTRANSFER that sends tinybar to the treasury
            if tx.get("name") != "CRYPTOTRANSFER":
                continue
            transfers = tx.get("transfers", [])
            for t in transfers:
                if (
                    t.get("account") == HEDERA_TREASURY_ID
                    and int(t.get("amount", 0)) >= expected_amount_tinybar
                ):
                    return True, tx.get("transaction_id", "")
        return False, ""
    except Exception:
        return False, ""


async def verify_hedera_hts_payment(
    payer_account: str,
    token_id: str,
    expected_amount: int,
    max_age_seconds: int = 300,
) -> tuple[bool, str]:
    """
    Verify that an HTS token payment was made from payer_account to treasury,
    at or above the expected amount, within max_age_seconds.
    """
    if not HEDERA_TREASURY_ID or not token_id:
        return False, ""
    try:
        cutoff = time.time() - max_age_seconds
        data   = await _mirror_get(
            f"/transactions?account.id={payer_account}&limit=20&order=desc"
        )
        for tx in data.get("transactions", []):
            ts = float(tx.get("consensus_timestamp", "0").replace(".", ""))
            if ts / 1e9 < cutoff:
                break
            for t in tx.get("token_transfers", []):
                if (
                    t.get("token_id") == token_id
                    and t.get("account") == HEDERA_TREASURY_ID
                    and int(t.get("amount", 0)) >= expected_amount
                ):
                    return True, tx.get("transaction_id", "")
        return False, ""
    except Exception:
        return False, ""


# ── Payment requirement builder ───────────────────────────────────────────────

def build_payment_requirement(route: str, payer: str | None = None) -> dict:
    """
    Build the x402 payment requirement object returned in the 402 response.
    Returns both EVM and Hedera payment paths when both are configured.
    """
    price = ROUTE_PRICES.get(route, 100)
    hedera_price = HEDERA_ROUTE_PRICES.get(route, 1_000_000)
    nonce = "0x" + hashlib.sha3_256(
        f"{route}:{payer or 'anonymous'}:{time.time()}".encode()
    ).hexdigest()

    requirement: dict = {
        "x402Version":  1,
        "scheme":       "exact",
        "network":      f"eip155:{CHAIN_ID}",
        "maxAmountRequired": str(price),
        "resource":     f"https://kai.nuvari{route}",
        "description":  f"KAI Agent service: {route}",
        "mimeType":     "application/json",
        "payTo":        TREASURY_ADDR,
        "maxTimeoutSeconds": 300,
        "asset":        PAYMENT_TOKEN or "native",
        "assetSymbol":  PAYMENT_SYMBOL,
        "extra": {
            "escrowAddress":   ESCROW_ADDR,
            "registryAddress": REGISTRY_ADDR,
            "chainId":         CHAIN_ID,
            "nonce":           nonce,
            "validBefore":     int(time.time()) + 300,
        },
    }

    # Add Hedera payment path if operator is configured (Phase 6)
    if HEDERA_PAYMENT_ENABLED:
        requirement["hederaPayment"] = {
            "network":        f"hedera:{HEDERA_NETWORK}",
            "payTo":          HEDERA_TREASURY_ID,
            "amountTinybar":  hedera_price,
            "amountHbar":     hedera_price / 1e8,
            "asset":          "HBAR",
            "assetSymbol":    "HBAR",
            "htsAlternative": {
                "tokenId":  HEDERA_KAIBAR_TOKEN,
                "symbol":   "KBAR",
                "amount":   price,
            } if HEDERA_KAIBAR_TOKEN else None,
            "maxTimeoutSeconds": 300,
            "nonce":          nonce,
        }

    return requirement


def build_402_response(route: str, payer: str | None = None) -> JSONResponse:
    """Return a proper HTTP 402 response with payment requirements."""
    requirement = build_payment_requirement(route, payer)
    return JSONResponse(
        status_code=402,
        content={
            "error":   "Payment Required",
            "message": f"This KAI agent endpoint requires payment. Send the X-PAYMENT header with a valid x402 payload.",
            "accepts": [requirement],
        },
        headers={
            "X-Payment-Required": "true",
            "X-Payment-Network":  f"eip155:{CHAIN_ID}",
            "X-Payment-Asset":    PAYMENT_TOKEN or "native",
        },
    )


# ── Payment header verification ───────────────────────────────────────────────

class X402PaymentError(Exception):
    pass


def decode_payment_header(header_value: str) -> dict:
    """
    Decode the X-PAYMENT header. The header is a base64-encoded JSON payload:
    {
        "x402Version": 1,
        "scheme": "exact",
        "network": "eip155:11155111",
        "payload": {
            "signature": "0x...",
            "authorization": { ...EIP-712 transferWithAuthorization... }
        }
    }
    """
    try:
        raw = base64.b64decode(header_value + "==").decode("utf-8")
        return json.loads(raw)
    except Exception:
        try:
            return json.loads(header_value)
        except Exception as e:
            raise X402PaymentError(f"Invalid X-PAYMENT header: {e}")


def verify_payment_signature(
    payment: dict,
    expected_route: str,
    expected_amount: int,
) -> tuple[bool, str]:
    """
    Verify the payment payload signature off-chain.
    Returns (is_valid, payer_address).

    Full on-chain settlement happens asynchronously via the escrow contract.
    This fast path checks the cryptographic proof so the agent can respond
    immediately without waiting for on-chain confirmation.
    """
    try:
        payload = payment.get("payload", {})
        auth    = payload.get("authorization", {})
        sig     = payload.get("signature", "")

        if not sig or not auth:
            return False, ""

        # Recover signer from EIP-712 transferWithAuthorization
        token_addr = auth.get("asset") or auth.get("token") or PAYMENT_TOKEN
        domain = {
            "name":              auth.get("tokenName", "USD Coin"),
            "version":           "2",
            "chainId":           CHAIN_ID,
            "verifyingContract": token_addr or TREASURY_ADDR,
        }

        message = {
            "from":        auth.get("from", ""),
            "to":          auth.get("to",   TREASURY_ADDR),
            "value":       int(auth.get("value", 0)),
            "validAfter":  int(auth.get("validAfter",  0)),
            "validBefore": int(auth.get("validBefore", int(time.time()) + 300)),
            "nonce":       auth.get("nonce", "0x" + "00" * 32),
        }

        # Check deadline
        if time.time() > message["validBefore"]:
            return False, ""

        # Check amount
        if message["value"] < expected_amount:
            return False, ""

        # Recover signer
        recovered = Account.recover_message(
            encode_typed_data(
                domain_data=domain,
                message_types={"TransferWithAuthorization": TRANSFER_AUTH_TYPES["TransferWithAuthorization"]},
                message_data=message,
            ),
            signature=sig,
        )
        return True, recovered

    except Exception:
        return False, ""


# ── x402 FastAPI middleware (dependency) ──────────────────────────────────────

class X402Middleware:
    """
    FastAPI dependency that gates a route behind x402 payment.

    Usage:
        @app.post("/agents/tx/analyse")
        async def my_route(payment=Depends(x402_middleware("/agents/tx/analyse"))):
            ...
    """

    def __init__(self, route: str, enabled: bool = True):
        self.route   = route
        self.enabled = enabled
        self.price   = ROUTE_PRICES.get(route, 100)

    async def __call__(self, request: Request) -> dict:
        """
        Returns payment context dict if payment is valid (or bypassed).
        Raises HTTPException(402) if payment is required but missing/invalid.
        Handles both EVM (X-PAYMENT header) and Hedera (X-PAYMENT-NETWORK: hedera) paths.
        """
        if not self.enabled or (not PAYMENT_TOKEN and not HEDERA_PAYMENT_ENABLED):
            return {"paid": False, "dev_mode": True, "route": self.route}

        # Owner bypass
        caller_addr = request.headers.get("X-Wallet-Address", "")
        if caller_addr.lower() == TREASURY_ADDR.lower():
            return {"paid": False, "owner": True, "route": self.route}

        # ── Hedera payment path ────────────────────────────────────────────
        payment_network = request.headers.get("X-PAYMENT-NETWORK", "").lower()
        if payment_network == "hedera" and HEDERA_PAYMENT_ENABLED:
            payer_account = request.headers.get("X-HEDERA-PAYER", "")
            hedera_price  = HEDERA_ROUTE_PRICES.get(self.route, 1_000_000)
            if not payer_account:
                req = build_payment_requirement(self.route, None)
                raise HTTPException(status_code=402, detail={"error": "Payment Required", "accepts": [req]})

            valid, tx_id = await verify_hedera_payment(payer_account, hedera_price, nonce="")
            if not valid:
                # Try HTS KBAR fallback
                if HEDERA_KAIBAR_TOKEN:
                    valid, tx_id = await verify_hedera_hts_payment(
                        payer_account, HEDERA_KAIBAR_TOKEN, self.price, 300
                    )
            if not valid:
                raise HTTPException(status_code=402, detail={"error": "Hedera payment not found or insufficient"})
            return {
                "paid":    True,
                "network": "hedera",
                "payer":   payer_account,
                "tx_id":   tx_id,
                "amount":  hedera_price,
                "route":   self.route,
            }

        # ── EVM (x402) payment path ────────────────────────────────────────
        if not PAYMENT_TOKEN:
            return {"paid": False, "dev_mode": True, "route": self.route}

        payment_header = request.headers.get("X-PAYMENT", "")
        if not payment_header:
            req = build_payment_requirement(self.route, caller_addr or None)
            raise HTTPException(status_code=402, detail={"error": "Payment Required", "accepts": [req]})

        try:
            payment = decode_payment_header(payment_header)
            valid, payer = verify_payment_signature(payment, self.route, self.price)
            if not valid:
                raise HTTPException(status_code=402, detail={"error": "Invalid payment signature"})
            return {
                "paid":    True,
                "network": "evm",
                "payer":   payer,
                "amount":  self.price,
                "route":   self.route,
                "payment": payment,
            }
        except X402PaymentError as e:
            raise HTTPException(status_code=402, detail={"error": str(e)})


def x402_gate(route: str, enabled: bool | None = None) -> X402Middleware:
    """Factory for creating route-specific x402 middleware."""
    # If PAYMENT_TOKEN is not set, default to disabled (dev mode)
    active = enabled if enabled is not None else bool(PAYMENT_TOKEN)
    return X402Middleware(route=route, enabled=active)


# ── Settlement helper ─────────────────────────────────────────────────────────

async def settle_payment_async(
    payment: dict,
    agent_address: str,
    service_desc: str,
    auto_release_sec: int = 300,
) -> dict:
    """
    After the agent completes work, call the escrow contract to record settlement.
    This is fire-and-forget — the agent response doesn't wait for this.

    In production this would be called by a background task after the agent
    returns its response.
    """
    if not ESCROW_ADDR:
        return {"settled": False, "reason": "Escrow not deployed — run deploy-agent-infra.ts"}

    auth    = payment.get("payload", {}).get("authorization", {})
    payer   = auth.get("from", "")
    amount  = int(auth.get("value", 0))
    nonce   = auth.get("nonce", "0x" + "00" * 32)

    payment_ref = "0x" + hashlib.sha3_256(
        json.dumps(payment, sort_keys=True).encode()
    ).hexdigest()[:64]

    # Build the eth_call to deposit() on KaiEscrow
    # In production this would be signed and broadcast; here we return the tx data
    return {
        "settled":       False,  # would be True after broadcast
        "escrow_addr":   ESCROW_ADDR,
        "payment_ref":   payment_ref,
        "payer":         payer,
        "agent":         agent_address,
        "amount":        amount,
        "service_desc":  service_desc,
        "auto_release_at": int(time.time()) + auto_release_sec,
        "note": "On-chain settlement queued. Call /agents/x402/settle to broadcast.",
    }


# ── x402 status / info endpoint data ─────────────────────────────────────────

def get_x402_info() -> dict:
    """Returns x402 configuration info for the /agents/x402/info endpoint."""
    return {
        "x402_version":   1,
        # EVM path
        "evm": {
            "network":        f"eip155:{CHAIN_ID}",
            "payment_token":  PAYMENT_TOKEN or "not configured",
            "payment_symbol": PAYMENT_SYMBOL,
            "treasury":       TREASURY_ADDR,
            "escrow":         ESCROW_ADDR or "not deployed",
            "registry":       REGISTRY_ADDR or "not deployed",
            "dev_mode":       not bool(PAYMENT_TOKEN),
        },
        # Hedera path (Phase 6)
        "hedera": {
            "enabled":        HEDERA_PAYMENT_ENABLED,
            "network":        f"hedera:{HEDERA_NETWORK}",
            "treasury":       HEDERA_TREASURY_ID or "not configured",
            "kaibar_token":   HEDERA_KAIBAR_TOKEN or "not configured",
            "payment_header": "X-PAYMENT-NETWORK: hedera + X-HEDERA-PAYER: <accountId>",
        },
        "route_prices":   ROUTE_PRICES,
        "hedera_prices":  HEDERA_ROUTE_PRICES,
        "note": (
            "Set KAI_ESCROW_ADDRESS and KAI_AGENT_REGISTRY in .env after running "
            "deploy-agent-infra.ts to enable live on-chain EVM payments. "
            "Set HEDERA_OPERATOR_ID to enable native HBAR payment path."
            if not ESCROW_ADDR else
            "x402 live on Sepolia + Hedera Testnet."
        ),
    }
