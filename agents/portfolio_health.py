"""
Agent 2: Portfolio Health Analyst
Reads wallet token balances, vault share positions, and LP holdings from
Sepolia / Hedera Rails (X402) via JSON-RPC, then produces a structured health report.
No external APIs — all on-chain data + Groq reasoning.
"""

from __future__ import annotations
import os
import json
from typing import AsyncIterator
import httpx
from .base import AgentBase

SEPOLIA_RPC = os.getenv("SEPOLIA_RPC_URL", "https://rpc.sepolia.org")

SYSTEM = """You are a DeFi portfolio health analyst for the KAI Nuvari ecosystem on Sepolia / Hedera Testnet.
You receive a JSON snapshot of a wallet's on-chain holdings and produce a health report.

Structure your report exactly like this:
## Portfolio Health Report

### 1. Holdings Summary
(table of assets with amounts and estimated USD values)

### 2. Risk Assessment
- Concentration risk (is too much in one token?)
- Liquidity risk (locked vs liquid positions)
- Yield exposure (stable vs volatile yield)

### 3. Vault Positions
(vault deposits, share prices, accrued yield)

### 4. Recommendations
(3-5 specific, actionable suggestions)

### 5. Overall Health Score
(0-100 with brief justification)

Be specific with numbers. Flag any red flags clearly."""

# ERC-20 balanceOf selector
BAL_SELECTOR  = "0x70a08231"
# KaiVault sharePrice selector
PRICE_SELECTOR = "0x6e9a5233"
# KaiVault totalAssets selector  
ASSETS_SELECTOR = "0x01e1d114"

# Token USD mock prices (updated via community pricing agent)
TOKEN_PRICES = {
    "NVR":    0.12,
    "yBOB":   1.00,
    "YTOKEN": 0.27,
    "YGOLD":  2.01,
    "GAMI":   0.056,
    "CENTS":  0.009,
    "ETH":   26.00,
}


async def _rpc(method: str, params: list) -> str:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(SEPOLIA_RPC, json=payload)
        data = r.json()
        return data.get("result", "0x0")


def _pad_address(addr: str) -> str:
    """Pad address to 32 bytes for ABI encoding."""
    return "000000000000000000000000" + addr.replace("0x", "").lower()


async def _token_balance(token_addr: str, wallet: str) -> float:
    call_data = BAL_SELECTOR + _pad_address(wallet)
    result    = await _rpc("eth_call", [{"to": token_addr, "data": call_data}, "latest"])
    try:
        return int(result, 16) / 1e18
    except Exception:
        return 0.0


async def _vault_share_price(vault_addr: str) -> float:
    result = await _rpc("eth_call", [{"to": vault_addr, "data": PRICE_SELECTOR}, "latest"])
    try:
        return int(result, 16) / 1e18
    except Exception:
        return 1.0


async def _vault_balance(vault_addr: str, wallet: str) -> float:
    """Returns LP/share token balance in the vault."""
    return await _token_balance(vault_addr, wallet)


class PortfolioHealthAgent(AgentBase):
    name = "portfolio_health"
    description = "Analyses wallet holdings and produces a DeFi health report"

    async def _gather_holdings(self, wallet: str, token_map: dict, vault_map: dict) -> dict:
        """
        token_map: { "NVR": "0x...", "yBOB": "0x...", ... }
        vault_map: { "NVR": "0x...", "yBOB": "0x...", ... }  (KaiVault addresses)
        """
        # Native ETH balance
        eth_hex = await _rpc("eth_getBalance", [wallet, "latest"])
        eth_bal = int(eth_hex, 16) / 1e18

        # Token balances
        token_balances = {}
        for sym, addr in token_map.items():
            if addr:
                bal = await _token_balance(addr, wallet)
                token_balances[sym] = {
                    "balance":   round(bal, 6),
                    "usd_value": round(bal * TOKEN_PRICES.get(sym, 0), 2),
                }

        # Vault positions
        vault_positions = {}
        for sym, vault_addr in vault_map.items():
            if vault_addr:
                shares     = await _vault_balance(vault_addr, wallet)
                share_price = await _vault_share_price(vault_addr)
                asset_value = shares * share_price
                vault_positions[sym] = {
                    "shares":       round(shares, 6),
                    "share_price":  round(share_price, 8),
                    "asset_value":  round(asset_value, 6),
                    "usd_value":    round(asset_value * TOKEN_PRICES.get(sym, 0), 2),
                    "vault_addr":   vault_addr,
                }

        total_usd = (
            eth_bal * TOKEN_PRICES["ETH"]
            + sum(t["usd_value"] for t in token_balances.values())
            + sum(v["usd_value"] for v in vault_positions.values())
        )

        return {
            "wallet":          wallet,
            "eth":            {"balance": round(eth_bal, 6), "usd_value": round(eth_bal * TOKEN_PRICES["ETH"], 2)},
            "tokens":          token_balances,
            "vault_positions": vault_positions,
            "total_usd":       round(total_usd, 2),
            "network":         "Sepolia / Hedera Testnet Testnet",
        }

    async def run(
        self,
        wallet: str,
        token_map: dict | None = None,
        vault_map:  dict | None = None,
    ) -> dict:
        token_map = token_map or {}
        vault_map  = vault_map  or {}
        holdings  = await self._gather_holdings(wallet, token_map, vault_map)
        prompt    = f"Here is the portfolio snapshot:\n\n{json.dumps(holdings, indent=2)}\n\nProduce a full health report."
        report    = await self.complete(prompt, system=SYSTEM)
        return {
            "agent":    self.name,
            "wallet":   wallet,
            "snapshot": holdings,
            "report":   report,
        }

    async def stream(
        self,
        wallet: str,
        token_map: dict | None = None,
        vault_map:  dict | None = None,
    ) -> AsyncIterator[str]:
        token_map = token_map or {}
        vault_map  = vault_map  or {}
        holdings  = await self._gather_holdings(wallet, token_map, vault_map)
        prompt    = f"Here is the portfolio snapshot:\n\n{json.dumps(holdings, indent=2)}\n\nProduce a full health report."
        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
