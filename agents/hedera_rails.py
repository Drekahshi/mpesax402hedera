"""
agents/hedera_rails.py
Phase 5 — Python Hedera agent wrapping HTS/HCS operations.

This is the Python-side Hedera infrastructure layer. It gives every
FastAPI endpoint a clean, policy-safe interface to native Hedera
operations without exposing the supply key to the reasoning loop.

Architecture (PRD Section 3.2):
  Needle (reasoning model) → calls these tool functions
  These functions → call Hedera REST APIs / Mirror Node
  Supply key → NEVER passed to or invoked from these functions directly;
                minting goes through server-side REST calls to a local
                "operator signer" path that reads the key from env.

Why REST, not hiero-sdk-python?
  The hiero-sdk-python package is not yet stable for all HTS operations
  and is not in requirements.txt. This module uses the Hedera REST API
  (Mirror Node for reads, the Hedera JSON-RPC relay for EVM calls) and
  the operator REST endpoint pattern. For a full SDK path, install
  `hiero-sdk-python` and swap the _hedera_rest calls for SDK objects.

Env vars:
  HEDERA_OPERATOR_ID    — e.g. 0.0.5834216
  HEDERA_OPERATOR_KEY   — ECDSA or ED25519 hex key
  HEDERA_NETWORK        — "testnet" or "mainnet"
  HEDERA_KAIBAR_TOKEN_ID   — 0.0.xxxxxx
  HEDERA_CONNFT_TOKEN_ID   — 0.0.xxxxxx
  HEDERA_AUDIT_TOPIC_ID    — 0.0.xxxxxx
  HEDERA_MIRROR_NODE_URL   — default: testnet mirror node
"""

from __future__ import annotations
import os
import json
import time
import hashlib
import asyncio
from dataclasses import dataclass, field
from typing import Any, AsyncIterator
import httpx
from dotenv import load_dotenv
from .base import AgentBase

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

NETWORK        = os.getenv("HEDERA_NETWORK", "testnet")
OPERATOR_ID    = os.getenv("HEDERA_OPERATOR_ID", "")
OPERATOR_KEY   = os.getenv("HEDERA_OPERATOR_KEY", "")
KAIBAR_TOKEN   = os.getenv("HEDERA_KAIBAR_TOKEN_ID", "")
CONNFT_TOKEN   = os.getenv("HEDERA_CONNFT_TOKEN_ID", "")
AUDIT_TOPIC    = os.getenv("HEDERA_AUDIT_TOPIC_ID", "")

MIRROR_BASE = os.getenv(
    "HEDERA_MIRROR_NODE_URL",
    "https://testnet.mirrornode.hedera.com" if NETWORK == "testnet"
    else "https://mainnet-public.mirrornode.hedera.com",
)
MIRROR_API = f"{MIRROR_BASE}/api/v1"

# HashScan explorer
EXPLORER = (
    "https://hashscan.io/testnet" if NETWORK == "testnet"
    else "https://hashscan.io/mainnet"
)

# Per-transaction mint caps (policy gate — PRD Section 8)
KAIBAR_PER_TX_CAP = 10_000   # KBAR
NFT_PER_TX_CAP    = 10        # serials


# ── Mirror Node helpers ───────────────────────────────────────────────────────

async def _mirror_get(path: str, params: dict | None = None) -> dict:
    """GET from Mirror Node REST API."""
    url = f"{MIRROR_API}{path}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url, params=params or {})
        r.raise_for_status()
        return r.json()


# ── Account & balance queries (Mirror Node) ───────────────────────────────────

async def get_account_info(account_id: str) -> dict:
    """Fetch HBAR balance and basic account metadata from Mirror Node."""
    data = await _mirror_get(f"/accounts/{account_id}")
    tinybar = data.get("balance", {}).get("balance", 0)
    tokens  = data.get("balance", {}).get("tokens", [])
    return {
        "account_id":   account_id,
        "hbar":         tinybar / 1e8,
        "tinybar":      tinybar,
        "evm_address":  data.get("evm_address"),
        "tokens":       [{"token_id": t["token_id"], "balance": t["balance"]} for t in tokens],
        "explorer":     f"{EXPLORER}/account/{account_id}",
    }


async def get_token_balance(account_id: str, token_id: str) -> dict:
    """Fetch a specific HTS token balance for an account."""
    data  = await _mirror_get(f"/accounts/{account_id}/tokens", {"token.id": token_id})
    items = data.get("tokens", [])
    if not items:
        return {"account_id": account_id, "token_id": token_id, "balance": 0}
    return {
        "account_id": account_id,
        "token_id":   token_id,
        "balance":    items[0].get("balance", 0),
    }


async def get_token_info(token_id: str) -> dict:
    """Fetch HTS token metadata from Mirror Node."""
    data = await _mirror_get(f"/tokens/{token_id}")
    return {
        "token_id":     data.get("token_id"),
        "name":         data.get("name"),
        "symbol":       data.get("symbol"),
        "decimals":     int(data.get("decimals", 0)),
        "total_supply": data.get("total_supply"),
        "max_supply":   data.get("max_supply"),
        "supply_type":  data.get("supply_type"),
        "token_type":   data.get("type"),
        "treasury":     data.get("treasury_account_id"),
        "explorer":     f"{EXPLORER}/token/{token_id}",
    }


async def get_nfts_for_account(account_id: str, token_id: str | None = None) -> list[dict]:
    """List NFT serials held by an account (optionally filtered by token)."""
    params: dict = {"limit": "100"}
    if token_id:
        params["token.id"] = token_id
    data  = await _mirror_get(f"/accounts/{account_id}/nfts", params)
    items = data.get("nfts", [])
    return [
        {
            "token_id":      item.get("token_id"),
            "serial_number": item.get("serial_number"),
            "account_id":    item.get("account_id"),
            "metadata":      _b64decode(item.get("metadata", "")),
            "created_at":    item.get("created_timestamp"),
        }
        for item in items
    ]


async def get_transaction_history(account_id: str, limit: int = 25) -> list[dict]:
    """Fetch recent transactions for a Hedera account."""
    data = await _mirror_get("/transactions", {"account.id": account_id, "limit": str(min(limit, 10)), "order": "desc"})
    return [
        {
            "transaction_id":      tx.get("transaction_id"),
            "type":                tx.get("name"),
            "result":              tx.get("result"),
            "consensus_timestamp": tx.get("consensus_timestamp"),
            "transfers":           tx.get("transfers", []),
            "token_transfers":     tx.get("token_transfers", []),
        }
        for tx in data.get("transactions", [])
    ]


async def get_hcs_messages(topic_id: str, limit: int = 25) -> list[dict]:
    """Fetch recent HCS messages from the audit topic."""
    data = await _mirror_get(f"/topics/{topic_id}/messages", {"limit": str(limit), "order": "desc"})
    return [
        {
            "sequence_number":     m.get("sequence_number"),
            "consensus_timestamp": m.get("consensus_timestamp"),
            "message":             _b64decode(m.get("message", "")),
            "running_hash":        m.get("running_hash"),
        }
        for m in data.get("messages", [])
    ]


# ── Operator REST helpers (mint/transfer via Hedera SDK REST proxy) ───────────
# These call the TypeScript SDK via a local HTTP endpoint (the Next.js API routes
# we will add in task 12 call into hederaClient.ts). This keeps the private key
# in the TypeScript/Next.js process and out of Python.

OPERATOR_API_BASE = os.getenv("AGENT_BASE_URL", "http://127.0.0.1:3000")


async def _operator_post(path: str, body: dict) -> dict:
    """POST to the KAI Next.js API operator endpoint."""
    url = f"{OPERATOR_API_BASE}{path}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(url, json=body, headers={"Content-Type": "application/json"})
        r.raise_for_status()
        return r.json()


async def mint_kaibar(recipient: str, amount: float, reason: str) -> dict:
    """
    Mint KAIBAR tokens and transfer to recipient.
    Policy gate: max KAIBAR_PER_TX_CAP per call.
    Delegates to /api/hedera (Next.js, holds the supply key).
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    if amount > KAIBAR_PER_TX_CAP:
        raise ValueError(f"Per-tx cap exceeded: max {KAIBAR_PER_TX_CAP} KBAR per call")
    if not KAIBAR_TOKEN:
        return {
            "simulated": True,
            "recipient": recipient,
            "amount":    amount,
            "reason":    reason,
            "note":      "HEDERA_KAIBAR_TOKEN_ID not set — run create-kaibar-token.ts first",
        }
    result = await _operator_post("/api/hedera", {
        "action":    "mint-kaibar",
        "recipient": recipient,
        "amount":    amount,
        "reason":    reason,
    })
    return result


async def mint_conservation_nft(
    recipient: str,
    conservation_id: str,
    event_type: str,
    metadata_pointer: str,
    count: int = 1,
) -> dict:
    """
    Mint Conservation NFT(s) for a verified conservation event.
    Idempotency key = conservation_id.
    """
    if count < 1 or count > NFT_PER_TX_CAP:
        raise ValueError(f"count must be 1–{NFT_PER_TX_CAP}")
    if not CONNFT_TOKEN:
        return {
            "simulated":       True,
            "recipient":       recipient,
            "conservation_id": conservation_id,
            "count":           count,
            "note":            "HEDERA_CONNFT_TOKEN_ID not set — run create-conservation-nft.ts first",
        }
    result = await _operator_post("/api/hedera", {
        "action":           "mint-connft",
        "recipient":        recipient,
        "conservation_id":  conservation_id,
        "event_type":       event_type,
        "metadata_pointer": metadata_pointer,
        "count":            count,
    })
    return result


async def transfer_hbar(to_account: str, amount_hbar: float, memo: str = "") -> dict:
    """Transfer HBAR from the operator account to a recipient."""
    if amount_hbar <= 0:
        raise ValueError("amount must be positive")
    result = await _operator_post("/api/hedera", {
        "action": "transfer-hbar",
        "to":     to_account,
        "amount": amount_hbar,
        "memo":   memo,
    })
    return result


async def associate_token(account_id: str, token_ids: list[str]) -> dict:
    """Associate HTS token(s) with an account so it can receive them."""
    result = await _operator_post("/api/hedera", {
        "action":     "associate-token",
        "accountId":  account_id,
        "tokenIds":   token_ids,
    })
    return result


async def swap_tokens(
    from_token: str,
    to_token: str,
    amount: float,
    recipient: str = "0.0.5834216",
) -> dict:
    """
    Swap HBAR or any KAI ecosystem token (NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS, KBAR).
    Calls the KAI Swap API router.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    result = await _operator_post("/api/swap", {
        "fromToken":  from_token,
        "toToken":    to_token,
        "fromAmount": amount,
        "recipient":  recipient,
    })
    return result


async def mint_ecosystem_token(
    symbol: str,
    recipient: str,
    amount: float,
    reason: str = "agent_incentive",
) -> dict:
    """
    Mint any KAI ecosystem token (NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS, KBAR)
    and transfer to the recipient on Hedera testnet.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    result = await _operator_post("/api/hedera", {
        "action":    "mint-token",
        "symbol":    symbol.upper(),
        "recipient": recipient,
        "amount":    amount,
        "reason":    reason,
    })
    return result



# ── HCS audit log ─────────────────────────────────────────────────────────────

async def log_hcs_event(event_type: str, payload: dict) -> dict:
    """Write a structured audit entry to the HCS topic via Next.js API."""
    if not AUDIT_TOPIC:
        return {"logged": False, "reason": "HEDERA_AUDIT_TOPIC_ID not set"}
    result = await _operator_post("/api/hedera/hcs-log", {
        "event":   event_type,
        "payload": payload,
    })
    return result


# ── HederaRailsAgent — the Groq-powered Hedera assistant ─────────────────────

SYSTEM_PROMPT = """You are the KAI Hedera Rails Agent — an expert in native Hedera infrastructure.

You help users with:
- HBAR and HTS token balances and transfers
- KAIBAR token minting and distribution
- Conservation NFT status and metadata
- HCS audit log queries
- Token association and account setup
- Understanding Hedera transaction history

You have access to live Mirror Node data which has been retrieved before this message.
Always cite specific account IDs, token IDs, and transaction IDs in your answers.
Be precise about HBAR vs HTS token amounts and decimal precision.
"""


class HederaRailsAgent(AgentBase):
    """
    AI-powered Hedera Rails assistant.
    Fetches live data from Mirror Node, then asks Groq to explain/analyse it.
    """

    name        = "hedera_rails"
    description = "Native Hedera account/token/NFT/HCS queries and analysis"

    async def run(
        self,
        account_id: str = "",
        question: str = "",
        action: str = "account",   # "account" | "kaibar" | "connft" | "hcs" | "tx"
    ) -> dict:
        data = await self._fetch_data(account_id, action)
        if "error" in data:
            return {"agent": self.name, **data}

        prompt = self._build_prompt(account_id, question, action, data)
        answer = await self.complete(prompt, system=SYSTEM_PROMPT)
        return {
            "agent":      self.name,
            "action":     action,
            "account_id": account_id,
            "data":       data,
            "answer":     answer,
            "network":    NETWORK,
            "explorer":   f"{EXPLORER}/account/{account_id}" if account_id else EXPLORER,
        }

    async def stream(
        self,
        account_id: str = "",
        question: str = "",
        action: str = "account",
    ) -> AsyncIterator[str]:
        import json as _json
        data = await self._fetch_data(account_id, action)
        if "error" in data:
            yield f'data: {_json.dumps({"token": data["error"]})}\n\n'
            return

        prompt = self._build_prompt(account_id, question, action, data)
        async for chunk in self.stream_response(prompt, system=SYSTEM_PROMPT):
            yield chunk

    async def _fetch_data(self, account_id: str, action: str) -> dict:
        try:
            if action == "account" and account_id:
                return await get_account_info(account_id)
            elif action == "kaibar" and account_id:
                if not KAIBAR_TOKEN:
                    return {"error": "HEDERA_KAIBAR_TOKEN_ID not configured"}
                return await get_token_balance(account_id, KAIBAR_TOKEN)
            elif action == "connft" and account_id:
                if not CONNFT_TOKEN:
                    return {"error": "HEDERA_CONNFT_TOKEN_ID not configured"}
                nfts = await get_nfts_for_account(account_id, CONNFT_TOKEN)
                return {"account_id": account_id, "nfts": nfts, "count": len(nfts)}
            elif action == "hcs":
                topic = AUDIT_TOPIC
                if not topic:
                    return {"error": "HEDERA_AUDIT_TOPIC_ID not configured"}
                msgs = await get_hcs_messages(topic, limit=10)
                return {"topic_id": topic, "messages": msgs}
            elif action == "tx" and account_id:
                txs = await get_transaction_history(account_id, limit=10)
                return {"account_id": account_id, "transactions": txs}
            elif action == "token_info":
                token_id = KAIBAR_TOKEN or CONNFT_TOKEN
                if not token_id:
                    return {"error": "No Hedera token IDs configured"}
                return await get_token_info(token_id)
            else:
                if account_id:
                    return await get_account_info(account_id)
                return {"network": NETWORK, "operator": OPERATOR_ID, "kaibar_token": KAIBAR_TOKEN, "connft_token": CONNFT_TOKEN, "audit_topic": AUDIT_TOPIC}
        except httpx.HTTPStatusError as e:
            return {"error": f"Mirror Node returned {e.response.status_code} for {account_id}"}
        except Exception as e:
            return {"error": str(e)}

    def _build_prompt(self, account_id: str, question: str, action: str, data: dict) -> str:
        return f"""Account: {account_id or "N/A"}
Action: {action}
Question: {question or "Summarise the Hedera data below."}

Live Hedera data:
{json.dumps(data, indent=2)}

Network: {NETWORK}
KAIBAR token: {KAIBAR_TOKEN or "not configured"}
Conservation NFT token: {CONNFT_TOKEN or "not configured"}
Audit topic: {AUDIT_TOPIC or "not configured"}"""


# ── Singleton ─────────────────────────────────────────────────────────────────

hedera_agent = HederaRailsAgent()


# ── Utility ───────────────────────────────────────────────────────────────────

def _b64decode(s: str) -> str:
    """Decode a base64 string to UTF-8, returning the original on failure."""
    if not s:
        return ""
    import base64
    try:
        return base64.b64decode(s + "==").decode("utf-8", errors="ignore")
    except Exception:
        return s
