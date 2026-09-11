"""
agents/indexer_balance.py
EVM Indexer API balance & portfolio agent.

Uses the EVM Indexer Indexer Data API to fetch:
  - Native ETH balance
  - All 6 KAI ecosystem token balances (ERC-20)
  - Recent transaction history
  - NFT holdings (Conservation NFTs)
  - Portfolio USD value estimate

Falls back to direct Sepolia JSON-RPC if EVM Indexer API key is not set.

Env vars:
  ETHERSCAN_API_KEY  — from app.etherscan.io
  SEPOLIA_RPC_URL     — fallback RPC
"""

from __future__ import annotations
import os
import json
from typing import AsyncIterator
import httpx
from .base import AgentBase

ETHERSCAN_KEY  = os.getenv("ETHERSCAN_API_KEY", "")
INDEXER_BASE = "https://api.sepolia.etherscan.io/api"
SEPOLIA_RPC     = os.getenv("SEPOLIA_RPC_URL", "https://rpc.sepolia.org")
CHAIN_ID     = "11155111"   # Sepolia
EXPLORER     = "https://sepolia.etherscan.io"

# ── KAI Ecosystem token addresses ─────────────────────────────────────────────
KAI_TOKENS = {
    "NVR":    {"address": "0x6489Ea8302b00A8eEd4D82a78A5f9e71Fe2DaC62", "decimals": 18, "usd": 0.12,  "emoji": "⚡"},
    "yBOB":   {"address": "0xE4f6A3506616f7c8e445B20a5D93521bFeE97979", "decimals": 18, "usd": 1.00,  "emoji": "🪙"},
    "YTOKEN": {"address": "0xF550ACf387011BC0172F2a14656AcE65846b7fBC", "decimals": 18, "usd": 0.27,  "emoji": "⚗️"},
    "YGOLD":  {"address": "0xEbA875e6cb6d19d8d31b3D29a2b2cE7457D5808A", "decimals": 18, "usd": 2.01,  "emoji": "🔒"},
    "GAMI":   {"address": "0x199fC58F7Ce929f1dBDA89b9EB2391582a321e7d", "decimals": 18, "usd": 0.056, "emoji": "🎮"},
    "CENTS":  {"address": "0x1bd79052747A236Aca137380394da27771e95eeA", "decimals": 18, "usd": 0.009, "emoji": "🪙"},
}

SYSTEM = """You are the KAI Portfolio Analyst. You have just retrieved live on-chain data for a wallet.

Present the results clearly:

## Wallet Portfolio — {address}

### ETH Balance
(native balance in ETH and USD)

### KAI Ecosystem Tokens
(table: Token | Balance | USD Value | % of portfolio)

### Total Portfolio Value
(ETH + all tokens in USD)

### Recent Transactions
(last 5 transactions with type, amount, and status)

### NFT Holdings
(Conservation NFTs if any)

### Insights
(any notable observations: large holdings, low ETH for gas, diversification)

Use exact numbers from the data. If any token balance is 0, still show it."""


# ── RPC helpers ───────────────────────────────────────────────────────────────

async def _rpc(method: str, params: list) -> str | None:
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    async with httpx.AsyncClient(timeout=15.0) as c:
        try:
            r = await c.post(SEPOLIA_RPC, json=body)
            return r.json().get("result")
        except Exception:
            return None


async def _erc20_balance(token_addr: str, wallet: str) -> int:
    """Read ERC-20 balanceOf via RPC."""
    selector = "0x70a08231"
    data = selector + "000000000000000000000000" + wallet.replace("0x", "").lower()
    result = await _rpc("eth_call", [{"to": token_addr, "data": data}, "latest"])
    if result and result != "0x":
        try:
            return int(result, 16)
        except ValueError:
            pass
    return 0


# ── EVM Indexer API helpers ───────────────────────────────────────────────────────

async def _indexer_get(path: str) -> dict:
    """Call EVM Indexer API with API key if available."""
    headers = {"x-indexer-api-key": ETHERSCAN_KEY} if ETHERSCAN_KEY else {}
    async with httpx.AsyncClient(timeout=20.0) as c:
        try:
            r = await c.get(f"{INDEXER_BASE}{path}", headers=headers)
            if r.status_code == 200:
                return r.json()
        except Exception:
            pass
    return {}


async def fetch_portfolio(wallet: str) -> dict:
    """
    Fetch complete portfolio for a wallet.
    Uses EVM Indexer API if key is present, falls back to direct RPC.
    """
    wallet = wallet.strip()
    if not wallet.startswith("0x") or len(wallet) != 42:
        return {"error": f"Invalid address: {wallet}"}

    portfolio: dict = {
        "address":      wallet,
        "network":      "Sepolia / Hedera Testnet (testnet)",
        "explorer":     f"{EXPLORER}/address/{wallet}",
        "eth":         {},
        "tokens":       {},
        "transactions": [],
        "nfts":         [],
        "total_usd":    0.0,
        "source":       "indexer" if ETHERSCAN_KEY else "rpc",
    }

    # ── Native ETH balance ───────────────────────────────────────────────────
    if ETHERSCAN_KEY:
        data = await _indexer_get(
            f"/v1/chains/{CHAIN_ID}/addresses/{wallet}/balances:getNativeBalance"
        )
        raw_eth = int(data.get("nativeTokenBalance", {}).get("balance", "0"))
    else:
        result = await _rpc("eth_getBalance", [wallet, "latest"])
        raw_eth = int(result, 16) if result and result != "0x" else 0

    eth_bal = raw_eth / 1e18
    eth_usd = eth_bal * 26.0   # mock ETH price
    portfolio["eth"] = {
        "balance": round(eth_bal, 6),
        "usd":     round(eth_usd, 2),
        "raw_wei": raw_eth,
    }

    # ── ERC-20 token balances ─────────────────────────────────────────────────
    if ETHERSCAN_KEY:
        data = await _indexer_get(
            f"/v1/chains/{CHAIN_ID}/addresses/{wallet}/balances:listErc20Balances"
        )
        on_chain_bals: dict[str, int] = {}
        for item in data.get("erc20TokenBalances", []):
            addr = item.get("address","").lower()
            bal  = int(item.get("balance","0"))
            on_chain_bals[addr] = bal
    else:
        on_chain_bals = {}

    total_usd = eth_usd
    for sym, meta in KAI_TOKENS.items():
        addr = meta["address"].lower()
        if addr in on_chain_bals:
            raw = on_chain_bals[addr]
        else:
            raw = await _erc20_balance(meta["address"], wallet)

        bal = raw / (10 ** meta["decimals"])
        usd = bal * meta["usd"]
        total_usd += usd
        portfolio["tokens"][sym] = {
            "symbol":   sym,
            "emoji":    meta["emoji"],
            "address":  meta["address"],
            "balance":  round(bal, 6),
            "usd":      round(usd, 4),
            "price":    meta["usd"],
        }

    portfolio["total_usd"] = round(total_usd, 2)

    # ── Recent transactions (Indexer) ─────────────────────────────────────────
    if ETHERSCAN_KEY:
        tx_data = await _indexer_get(
            f"/v1/chains/{CHAIN_ID}/addresses/{wallet}/transactions?pageSize=5"
        )
        for tx in tx_data.get("transactions", [])[:5]:
            portfolio["transactions"].append({
                "hash":      tx.get("txHash",""),
                "type":      tx.get("txType","unknown"),
                "timestamp": tx.get("blockTimestamp",""),
                "status":    "success" if tx.get("txStatus") == "1" else "failed",
                "from":      tx.get("from",""),
                "to":        tx.get("to",""),
                "explorer":  f"{EXPLORER}/tx/{tx.get('txHash','')}",
            })
    else:
        # Fallback: just get tx count
        count_hex = await _rpc("eth_getTransactionCount", [wallet, "latest"])
        count = int(count_hex, 16) if count_hex else 0
        portfolio["transactions"] = [{"note": f"Tx count: {count}. Enable ETHERSCAN_API_KEY for full history."}]

    return portfolio


# ── Agent class ───────────────────────────────────────────────────────────────

class IndexerBalanceAgent(AgentBase):
    name = "indexer_balance"
    description = "Checks ETH + KAI token balances and portfolio via EVM Indexer API"

    async def run(self, address: str, question: str | None = None) -> dict:
        if not address:
            return {"error": "address is required"}

        data  = await fetch_portfolio(address)
        if "error" in data:
            return {"agent": self.name, **data}

        prompt = f"""Address: {address}
Question: {question or "Show me a full portfolio summary."}

Portfolio data:
{json.dumps(data, indent=2)}

{SYSTEM.replace('{address}', address)}"""

        report = await self.complete(prompt)
        return {
            "agent":     self.name,
            "address":   address,
            "portfolio": data,
            "report":    report,
            "source":    data.get("source"),
        }

    async def stream(self, address: str, question: str | None = None) -> AsyncIterator[str]:
        import json as _json
        data = await fetch_portfolio(address)
        if "error" in data:
            yield f'data: {_json.dumps({"token": data["error"]})}\n\n'
            return

        prompt = f"""Address: {address}
Question: {question or "Full portfolio summary."}

Portfolio:
{_json.dumps(data, indent=2)}"""

        async for chunk in self.stream_response(prompt, system=SYSTEM.replace("{address}", address)):
            yield chunk
