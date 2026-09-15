"""
agents/x402_payer.py
x402 payment EXECUTION — the outbound (payer) side.

This module gives the agent the ability to autonomously PAY for services
that are protected by x402. The receiving side (verification) is in
x402_rails.py; this module handles the complementary payer flow:

    1. Make an outbound HTTP request to a paid endpoint
    2. Receive HTTP 402 — extract payment requirements from `accepts`
    3. Sign an EIP-3009 TransferWithAuthorization with the agent's EOA key
    4. Encode the signed payload into an X-PAYMENT base64 header
    5. Retry the original request with the X-PAYMENT header attached
    6. On success, optionally log to HCS and record the payment channel

For the Hedera path the flow is:
    1. Receive 402 with hederaPayment block
    2. Transfer HBAR or KBAR via Next.js operator API
    3. Retry with X-PAYMENT-NETWORK: hedera + X-HEDERA-PAYER header

Security design (PRD Section 8):
    - Supply keys (KAIBAR mint) are NEVER used here — only the agent's EOA
      spend key is used for token payment authorisations
    - Per-tx and daily caps are enforced before signing
    - No private key is ever logged or included in return values

Env vars:
    AGENT_PRIVATE_KEY  — agent EOA (Ethereum) for EIP-3009 signing
    PRIVATE_KEY        — fallback operator key
    NEXT_PUBLIC_CENTS_ADDRESS — CENTS token on Sepolia
    USDC_SEPOLIA_ADDRESS      — USDC token on Sepolia
    CHAIN_ID
    SEPOLIA_RPC_URL
    NEXTJS_OPERATOR_URL — Next.js base (for Hedera transfers)
    INTERNAL_SERVICE_KEY — shared secret required by /api/hedera
"""

from __future__ import annotations
import os
import json
import time
import base64
import hashlib
import asyncio
from dataclasses import dataclass, field
from typing import Any
import httpx
from eth_account import Account
from eth_account.messages import encode_typed_data
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

CHAIN_ID      = int(os.getenv("CHAIN_ID", "11155111"))
SEPOLIA_RPC   = os.getenv("SEPOLIA_RPC_URL", "https://rpc.sepolia.org")
PAYMENT_TOKEN = os.getenv("USDC_SEPOLIA_ADDRESS", "") or os.getenv("NEXT_PUBLIC_CENTS_ADDRESS", "")
TREASURY_ADDR = os.getenv("WALLET_ADDRESS", "")
# NOTE: deliberately NOT AGENT_BASE_URL (that's this agent's own public
# service endpoint elsewhere, default :8000). This is the Next.js server
# holding the real operator key, default :3000 — see hedera_rails.py.
NEXTJS_OPERATOR_URL = os.getenv("NEXTJS_OPERATOR_URL", "http://127.0.0.1:3000")
INTERNAL_SERVICE_KEY = os.getenv("INTERNAL_SERVICE_KEY", "")

# Per-tx safety caps (enforced before any signing)
MAX_PER_TX_USD   = float(os.getenv("X402_MAX_PER_TX_USD",   "1.00"))
MAX_DAILY_USD    = float(os.getenv("X402_MAX_DAILY_USD",    "10.00"))
MAX_HBAR_PER_TX  = float(os.getenv("X402_MAX_HBAR_PER_TX",  "5.0"))

# EIP-3009 TransferWithAuthorization type (matches ERC-20 tokens that support it)
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

# ── Daily spend tracker (in-process; replace with Redis/DB in production) ─────

@dataclass
class _DailySpend:
    date_str: str
    total_usd: float = 0.0
    total_hbar: float = 0.0

_daily_spend = _DailySpend(date_str=time.strftime("%Y-%m-%d"))

def _check_caps(amount_usd: float = 0.0, amount_hbar: float = 0.0) -> None:
    """Raise ValueError if payment would exceed caps."""
    global _daily_spend
    today = time.strftime("%Y-%m-%d")
    if _daily_spend.date_str != today:
        _daily_spend = _DailySpend(date_str=today)

    if amount_usd > 0:
        if amount_usd > MAX_PER_TX_USD:
            raise ValueError(f"x402 per-tx cap exceeded: ${amount_usd:.4f} > ${MAX_PER_TX_USD}")
        if _daily_spend.total_usd + amount_usd > MAX_DAILY_USD:
            raise ValueError(
                f"x402 daily cap exceeded: ${_daily_spend.total_usd + amount_usd:.4f} > ${MAX_DAILY_USD}"
            )

    if amount_hbar > 0:
        if amount_hbar > MAX_HBAR_PER_TX:
            raise ValueError(f"HBAR per-tx cap exceeded: {amount_hbar} > {MAX_HBAR_PER_TX} HBAR")

def _record_spend(amount_usd: float = 0.0, amount_hbar: float = 0.0) -> None:
    _daily_spend.total_usd  += amount_usd
    _daily_spend.total_hbar += amount_hbar


# ═══════════════════════════════════════════════════════════════════════════════
# Task 1 — X402PaymentSigner
# Signs EIP-3009 TransferWithAuthorization with the agent's EOA private key
# ═══════════════════════════════════════════════════════════════════════════════

class X402PaymentSigner:
    """
    Signs EIP-3009 TransferWithAuthorization messages so the agent can
    autonomously authorise token payments (USDC, CENTS, or any ERC-20 that
    implements the EIP-3009 extension).

    The private key is the agent's EOA — loaded from env, never logged.
    Only the address is returned in public-facing dicts.
    """

    def __init__(self, private_key: str | None = None):
        pk = (
            private_key
            or os.getenv("AGENT_PRIVATE_KEY")
            or os.getenv("PRIVATE_KEY")
        )
        if not pk:
            raise ValueError(
                "No agent signing key found. Set AGENT_PRIVATE_KEY in .env"
            )
        pk = pk.strip().lstrip("0x")
        if len(pk) != 64:
            raise ValueError("Private key must be 64 hex characters (without 0x prefix)")
        self._account = Account.from_key("0x" + pk)
        self.address  = self._account.address

    def sign_transfer_with_authorization(
        self,
        token_address:  str,
        token_name:     str,
        to:             str,
        value:          int,        # in token's smallest unit
        valid_after:    int = 0,
        valid_before:   int | None = None,
        nonce:          bytes | None = None,
    ) -> dict:
        """
        Produce an EIP-712 TransferWithAuthorization signature.

        Returns a dict containing the authorization fields and the
        hex-encoded signature — ready to be assembled into an X-PAYMENT header.

        Args:
            token_address:  ERC-20 contract address (the verifyingContract)
            token_name:     Token name as used in its EIP-712 domain (e.g. "USD Coin")
            to:             Recipient address (the service treasury)
            value:          Amount in the token's smallest unit
            valid_after:    Unix timestamp — payment not valid before this
            valid_before:   Unix timestamp — payment expires at this time (default: now + 5min)
            nonce:          32-byte nonce (default: random)
        """
        if valid_before is None:
            valid_before = int(time.time()) + 300  # 5 minutes

        if nonce is None:
            nonce = os.urandom(32)

        nonce_hex = "0x" + nonce.hex()

        domain = {
            "name":              token_name,
            "version":           "2",
            "chainId":           CHAIN_ID,
            "verifyingContract": token_address,
        }

        message = {
            "from":        self.address,
            "to":          to,
            "value":       value,
            "validAfter":  valid_after,
            "validBefore": valid_before,
            "nonce":       nonce_hex,
        }

        signed = self._account.sign_typed_data(
            domain_data=domain,
            message_types={
                "TransferWithAuthorization": TRANSFER_AUTH_TYPES["TransferWithAuthorization"]
            },
            message_data=message,
        )

        return {
            "from":        self.address,
            "to":          to,
            "value":       value,
            "validAfter":  valid_after,
            "validBefore": valid_before,
            "nonce":       nonce_hex,
            "asset":       token_address,
            "tokenName":   token_name,
            "signature":   "0x" + signed.signature.hex(),
            "chainId":     CHAIN_ID,
        }

    def sign_hbar_payment_memo(self, route: str, amount_tinybar: int) -> str:
        """
        Produce a signed memo string for Hedera HBAR payments.
        The memo is stored on-chain to prove the agent authorised the payment.
        Format: x402:<route>:<amount>:<timestamp>:<sig_hex>
        """
        msg     = f"x402:{route}:{amount_tinybar}:{int(time.time())}"
        msg_hash = self._account.sign_message(
            encode_defunct(text=msg)  # type: ignore[name-defined]
        )
        return f"{msg}:{msg_hash.signature.hex()}"


# ═══════════════════════════════════════════════════════════════════════════════
# Task 2 — build_payment_header()
# Encodes the signed authorization into the X-PAYMENT base64 header
# ═══════════════════════════════════════════════════════════════════════════════

def build_payment_header(
    authorization: dict,
    network: str | None = None,
) -> str:
    """
    Build the X-PAYMENT header value from a signed TransferWithAuthorization.

    The header is a base64-encoded JSON payload:
    {
        "x402Version": 1,
        "scheme":      "exact",
        "network":     "eip155:11155111",
        "payload": {
            "signature":     "0x...",
            "authorization": { ...EIP-712 fields... }
        }
    }

    Args:
        authorization: dict returned by X402PaymentSigner.sign_transfer_with_authorization()
        network:       e.g. "eip155:11155111" — defaults to configured CHAIN_ID
    """
    if network is None:
        network = f"eip155:{CHAIN_ID}"

    sig = authorization.pop("signature", "") if "signature" in authorization else ""

    payload = {
        "x402Version": 1,
        "scheme":      "exact",
        "network":     network,
        "payload": {
            "signature":     sig,
            "authorization": authorization,
        },
    }

    raw     = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    encoded = base64.b64encode(raw).decode("ascii")
    return encoded


def build_hedera_payment_headers(
    payer_account_id: str,
) -> dict[str, str]:
    """
    Build the request headers for a Hedera HBAR x402 payment.

    The server-side X402Middleware checks for these two headers and
    verifies the payment on the Mirror Node.
    """
    return {
        "X-PAYMENT-NETWORK": "hedera",
        "X-HEDERA-PAYER":    payer_account_id,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Task 3 — X402PaymentClient
# Outbound HTTP client that handles the 402 → sign → retry cycle
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class X402Receipt:
    """Record of a completed x402 payment."""
    route:        str
    paid:         bool
    network:      str
    payer:        str
    amount:       int
    amount_unit:  str   # "wei", "tinybar", etc.
    tx_hash:      str   = ""
    hedera_tx_id: str   = ""
    payment_ref:  str   = ""
    response_status: int = 200
    timestamp:    float = field(default_factory=time.time)


class X402PaymentClient:
    """
    Outbound HTTP client that autonomously handles x402 payment challenges.

    Flow:
        1. client.get(url) / client.post(url, json=...)
        2. If HTTP 200 → return response immediately (no payment needed)
        3. If HTTP 402 → extract payment requirement from `accepts[0]`
        4. Sign TransferWithAuthorization with the agent's key
        5. Retry the original request with X-PAYMENT header
        6. Return the final response + an X402Receipt

    Usage:
        async with X402PaymentClient() as client:
            response, receipt = await client.post(
                "http://localhost:8000/agents/tx/analyse",
                json={"tx_hash": "0x..."}
            )

    Caps:
        Per-tx and daily USD limits are enforced before signing.
        Set X402_MAX_PER_TX_USD and X402_MAX_DAILY_USD in .env.
    """

    def __init__(
        self,
        signer:        X402PaymentSigner | None = None,
        hedera_account: str | None = None,
        timeout:       float = 60.0,
    ):
        """
        Args:
            signer:          X402PaymentSigner instance; if None, attempts to build
                             one from AGENT_PRIVATE_KEY / PRIVATE_KEY env vars.
                             Pass None explicitly if only using the Hedera path.
            hedera_account:  Hedera account ID (0.0.XXXXXX) for HBAR payments.
                             Used when the endpoint offers a hederaPayment block.
            timeout:         HTTP request timeout in seconds.
        """
        self._signer         = signer
        self._hedera_account = hedera_account or os.getenv("HEDERA_OPERATOR_ID", "")
        self._timeout        = timeout
        self._http: httpx.AsyncClient | None = None
        self._receipts: list[X402Receipt] = []

    # ── Context manager ───────────────────────────────────────────────────────

    async def __aenter__(self) -> "X402PaymentClient":
        self._http = httpx.AsyncClient(timeout=self._timeout)
        return self

    async def __aexit__(self, *_) -> None:
        if self._http:
            await self._http.aclose()

    def _get_signer(self) -> X402PaymentSigner:
        if self._signer is None:
            self._signer = X402PaymentSigner()
        return self._signer

    # ── Public API ────────────────────────────────────────────────────────────

    async def get(self, url: str, **kwargs) -> tuple[httpx.Response, X402Receipt | None]:
        return await self._request("GET", url, **kwargs)

    async def post(self, url: str, **kwargs) -> tuple[httpx.Response, X402Receipt | None]:
        return await self._request("POST", url, **kwargs)

    @property
    def receipts(self) -> list[X402Receipt]:
        """All payment receipts from this session."""
        return list(self._receipts)

    # ── Core request loop ─────────────────────────────────────────────────────

    async def _request(
        self,
        method:  str,
        url:     str,
        headers: dict | None = None,
        **kwargs,
    ) -> tuple[httpx.Response, X402Receipt | None]:
        """
        Make a request, handling a 402 response if encountered.
        Returns (final_response, receipt_or_None).
        """
        assert self._http is not None, "Use async with X402PaymentClient() as client"

        base_headers = headers or {}

        # ── First attempt ─────────────────────────────────────────────────────
        resp = await self._http.request(method, url, headers=base_headers, **kwargs)

        if resp.status_code != 402:
            return resp, None

        # ── HTTP 402 — parse the payment requirement ──────────────────────────
        try:
            body    = resp.json()
            accepts = body.get("accepts", [])
            if not accepts:
                raise ValueError("402 response has no accepts block")
            req = accepts[0]
        except Exception as e:
            raise RuntimeError(f"Could not parse x402 402 response: {e}") from e

        # ── Choose payment path ───────────────────────────────────────────────
        hedera_req = req.get("hederaPayment")
        use_hedera = bool(hedera_req and self._hedera_account)

        if use_hedera:
            payment_headers, receipt = await self._pay_hedera(url, req, hedera_req)
        else:
            payment_headers, receipt = await self._pay_evm(url, req)

        # ── Retry with payment header ─────────────────────────────────────────
        retry_headers = {**base_headers, **payment_headers}
        retry_resp    = await self._http.request(method, url, headers=retry_headers, **kwargs)

        receipt.response_status = retry_resp.status_code
        self._receipts.append(receipt)
        return retry_resp, receipt

    # ── EVM payment path ──────────────────────────────────────────────────────

    async def _pay_evm(
        self,
        url: str,
        req: dict,
    ) -> tuple[dict, X402Receipt]:
        """Sign a TransferWithAuthorization and build the X-PAYMENT header."""
        signer = self._get_signer()

        token_address = req.get("asset") or PAYMENT_TOKEN
        token_name    = _guess_token_name(token_address)
        to_address    = req.get("payTo") or TREASURY_ADDR
        amount        = int(req.get("maxAmountRequired", "0"))
        valid_before  = req.get("extra", {}).get("validBefore") or (int(time.time()) + 300)

        if not token_address:
            raise RuntimeError(
                "x402 EVM payment requires a token address. "
                "Set USDC_SEPOLIA_ADDRESS or NEXT_PUBLIC_CENTS_ADDRESS in .env"
            )

        # Cap check (rough USD estimate — 1 unit of 6-decimal token = $0.000001)
        amount_usd_est = amount / 1_000_000 if token_name in ("USD Coin", "CENTS") else 0.0
        _check_caps(amount_usd=amount_usd_est)

        # Sign
        auth = signer.sign_transfer_with_authorization(
            token_address=token_address,
            token_name=token_name,
            to=to_address,
            value=amount,
            valid_before=int(valid_before),
        )
        sig            = auth.pop("signature")
        header_value   = build_payment_header({**auth, "signature": sig})
        _record_spend(amount_usd=amount_usd_est)

        return (
            {"X-PAYMENT": header_value, "X-Wallet-Address": signer.address},
            X402Receipt(
                route=url,
                paid=True,
                network=f"eip155:{CHAIN_ID}",
                payer=signer.address,
                amount=amount,
                amount_unit="token_wei",
                payment_ref=req.get("extra", {}).get("nonce", ""),
            ),
        )

    # ── Hedera payment path ───────────────────────────────────────────────────

    async def _pay_hedera(
        self,
        url: str,
        req: dict,
        hedera_req: dict,
    ) -> tuple[dict, X402Receipt]:
        """Transfer HBAR via the Next.js operator API, then build Hedera headers."""
        amount_tinybar = int(hedera_req.get("amountTinybar", 1_000_000))
        amount_hbar    = amount_tinybar / 1e8
        treasury       = hedera_req.get("payTo", "")

        _check_caps(amount_hbar=amount_hbar)

        # Delegate to Next.js operator API for the actual HBAR transfer
        try:
            async with httpx.AsyncClient(timeout=30.0) as h:
                r = await h.post(
                    f"{NEXTJS_OPERATOR_URL}/api/hedera",
                    json={
                        "action": "transfer-hbar",
                        "to":     treasury,
                        "amount": amount_hbar,
                        "memo":   f"x402:{url}",
                    },
                    headers={"X-Internal-Key": INTERNAL_SERVICE_KEY},
                )
                r.raise_for_status()
                result = r.json()
        except Exception as e:
            raise RuntimeError(f"Hedera HBAR transfer failed: {e}") from e

        _record_spend(amount_hbar=amount_hbar)
        hedera_tx_id = result.get("transactionId", "")

        headers = build_hedera_payment_headers(self._hedera_account)

        return (
            headers,
            X402Receipt(
                route=url,
                paid=True,
                network="hedera",
                payer=self._hedera_account,
                amount=amount_tinybar,
                amount_unit="tinybar",
                hedera_tx_id=hedera_tx_id,
            ),
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Task 4 — Broadcast helper
# Actually signs and broadcasts escrow deposits + settlements
# ═══════════════════════════════════════════════════════════════════════════════

async def broadcast_raw_tx(
    to:       str,
    data:     str,
    value:    int = 0,
    gas:      int = 200_000,
) -> dict:
    """
    Sign and broadcast an EVM transaction using the agent's EOA key.

    This is the missing eth_sendRawTransaction path that settle_payment_async
    and EscrowClient.build_deposit_tx were previously leaving as "TODO".

    Returns: { tx_hash, status, explorer_url }
    """
    signer = X402PaymentSigner()

    # Get current nonce
    nonce_resp = await _rpc("eth_getTransactionCount", [signer.address, "latest"])
    nonce      = int(nonce_resp, 16)

    # Get current gas price (EIP-1559 — maxFeePerGas)
    fee_resp   = await _rpc("eth_maxPriorityFeePerGas", [])
    priority   = int(fee_resp, 16) if fee_resp else 1_500_000_000  # 1.5 gwei fallback
    max_fee    = priority * 2

    # Build the transaction
    tx = {
        "chainId":              CHAIN_ID,
        "nonce":                nonce,
        "maxFeePerGas":         max_fee,
        "maxPriorityFeePerGas": priority,
        "gas":                  gas,
        "to":                   to,
        "value":                value,
        "data":                 data,
        "type":                 2,  # EIP-1559
    }

    signed = signer._account.sign_transaction(tx)
    raw_tx = "0x" + signed.raw_transaction.hex()

    result = await _rpc("eth_sendRawTransaction", [raw_tx])

    if result and result.startswith("0x"):
        return {
            "tx_hash":     result,
            "status":      "broadcast",
            "explorer_url": f"https://sepolia.etherscan.io/tx/{result}",
        }
    raise RuntimeError(f"eth_sendRawTransaction returned: {result}")


async def _rpc(method: str, params: list) -> str | None:
    """Minimal JSON-RPC call to Sepolia."""
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(SEPOLIA_RPC, json=payload)
        r.raise_for_status()
        result = r.json().get("result")
        return result


async def settle_and_broadcast(
    payment: dict,
    agent_address: str,
    service_desc:  str,
    auto_release_sec: int = 300,
) -> dict:
    """
    Replacement for settle_payment_async() that actually broadcasts the escrow tx.

    Signs and sends the KaiEscrow.deposit() transaction from the agent's EOA.
    Returns the real on-chain tx hash.
    """
    from agents.rails import ESCROW_ADDR, EscrowClient
    from agents.x402_rails import PAYMENT_TOKEN, TREASURY_ADDR

    if not ESCROW_ADDR:
        return {
            "settled": False,
            "reason":  "KAI_ESCROW_ADDRESS not set — run deploy-agent-infra.ts --network sepolia",
        }

    auth    = payment.get("payload", {}).get("authorization", {})
    payer   = auth.get("from", agent_address)
    amount  = int(auth.get("value", 0))

    payment_ref = "0x" + hashlib.sha3_256(
        json.dumps(payment, sort_keys=True).encode()
    ).hexdigest()[:64]

    # Build full ABI-encoded calldata for deposit()
    escrow = EscrowClient(ESCROW_ADDR)
    tx_data_obj = escrow.build_deposit_tx(
        payment_ref=payment_ref,
        provider=TREASURY_ADDR,
        agent=agent_address,
        token=PAYMENT_TOKEN or "0x0000000000000000000000000000000000000000",
        amount=amount,
        auto_release_sec=auto_release_sec,
        service_desc=service_desc,
    )

    if "error" in tx_data_obj:
        return {"settled": False, **tx_data_obj}

    try:
        result = await broadcast_raw_tx(
            to=ESCROW_ADDR,
            data=tx_data_obj["data"],
            value=int(tx_data_obj.get("value", "0x0"), 16),
        )
        return {
            "settled":        True,
            "tx_hash":        result["tx_hash"],
            "explorer_url":   result["explorer_url"],
            "payment_ref":    payment_ref,
            "payer":          payer,
            "agent":          agent_address,
            "amount":         amount,
            "service_desc":   service_desc,
            "auto_release_at": int(time.time()) + auto_release_sec,
        }
    except Exception as e:
        return {"settled": False, "error": str(e), "payment_ref": payment_ref}


# ── Spend status ──────────────────────────────────────────────────────────────

def get_daily_spend() -> dict:
    """Return today's accumulated spend for monitoring."""
    today = time.strftime("%Y-%m-%d")
    if _daily_spend.date_str != today:
        return {"date": today, "total_usd": 0.0, "total_hbar": 0.0}
    return {
        "date":       _daily_spend.date_str,
        "total_usd":  _daily_spend.total_usd,
        "total_hbar": _daily_spend.total_hbar,
        "caps": {
            "max_per_tx_usd":  MAX_PER_TX_USD,
            "max_daily_usd":   MAX_DAILY_USD,
            "max_hbar_per_tx": MAX_HBAR_PER_TX,
        },
    }


# ── Token name helper ─────────────────────────────────────────────────────────

_TOKEN_NAMES: dict[str, str] = {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USD Coin",   # USDC mainnet
    "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": "USD Coin",   # USDC Sepolia
    "0x1bd79052747a236aca137380394da27771e95eea": "Nuvari Cents", # CENTS Sepolia
}

def _guess_token_name(addr: str) -> str:
    if not addr:
        return "USD Coin"
    return _TOKEN_NAMES.get(addr.lower(), "USD Coin")


# ── Convenience: one-shot pay_and_call ────────────────────────────────────────

async def pay_and_call(
    url:            str,
    method:         str = "POST",
    json_body:      dict | None = None,
    hedera_account: str | None = None,
) -> tuple[dict, X402Receipt | None]:
    """
    One-shot helper: make an x402-protected call and handle payment automatically.

    Returns (response_json, receipt_or_None).

    Example:
        result, receipt = await pay_and_call(
            "http://localhost:8000/agents/tx/analyse",
            json_body={"tx_hash": "0x..."}
        )
    """
    async with X402PaymentClient(hedera_account=hedera_account) as client:
        resp, receipt = await client.post(url, json=json_body) if method == "POST" else \
                        await client.get(url)
        try:
            return resp.json(), receipt
        except Exception:
            return {"raw": resp.text, "status": resp.status_code}, receipt
