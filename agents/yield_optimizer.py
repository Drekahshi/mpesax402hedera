"""
agents/yield_optimizer.py
KAI Yield Optimizer Agent.

Scans all KaiVault + KaiPool contracts on Sepolia for the best risk-adjusted
returns. Compares APY across all vaults, estimates LP fee yield, and
produces a ranked allocation recommendation based on the user's profile.
"""

from __future__ import annotations
import os
import json
import asyncio
from typing import AsyncIterator
import httpx
from .base import AgentBase

SEPOLIA_RPC = os.getenv("SEPOLIA_RPC_URL", "https://rpc.sepolia.org")

# ── Vault config ──────────────────────────────────────────────────────────────
VAULTS = {
    "NVR":    {"vault": "0xCB6198228E27f2200C9093024fB31527E0a3B7c0", "asset": "0x6489Ea8302b00A8eEd4D82a78A5f9e71Fe2DaC62", "apyBps": 1520, "risk": "medium",   "lock": "none",    "usd": 0.12},
    "yBOB":   {"vault": "0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2", "asset": "0xE4f6A3506616f7c8e445B20a5D93521bFeE97979", "apyBps": 750,  "risk": "very low",  "lock": "none",    "usd": 1.00},
    "YTOKEN": {"vault": "0x88e2d3049719C7C48AB3393FCe7DB24A81FEBcA2", "asset": "0xF550ACf387011BC0172F2a14656AcE65846b7fBC", "apyBps": 1480, "risk": "medium",   "lock": "none",    "usd": 0.27},
    "YGOLD":  {"vault": "0xdd3EEC62335E50fD8b83b8D1cE961ADb7bD01B5F", "asset": "0xEbA875e6cb6d19d8d31b3D29a2b2cE7457D5808A", "apyBps": 1240, "risk": "low",      "lock": "none",    "usd": 2.01},
    "GAMI":   {"vault": "0x9cDFf66853Db502DCDE9330dD1139fBE61d42a43", "asset": "0x199fC58F7Ce929f1dBDA89b9EB2391582a321e7d", "apyBps": 2200, "risk": "high",     "lock": "none",    "usd": 0.056},
    "CENTS":  {"vault": "0x96f69cBAAFb94DCEb3Bf4D120af594bCF2eE90BD", "asset": "0x1bd79052747A236Aca137380394da27771e95eeA", "apyBps": 650,  "risk": "very low",  "lock": "none",    "usd": 0.009},
}

POOLS = {
    "NVR/yBOB":    {"address": "0x362AE5Da53e3ff57E7FF9c12775ABBf94ec38C47", "fee_bps": 30, "risk": "low"},
    "YTOKEN/YGOLD":{"address": "0x62B367533301f2eF4484aEFF98cBF7FdBFD3ADf3", "fee_bps": 30, "risk": "medium"},
    "GAMI/CENTS":  {"address": "0xa9a93c9bAeF66B5407138C06E68211cE63bd96e0", "fee_bps": 30, "risk": "medium"},
}

# Securities yields
SECURITIES = {
    "KAI Pension": {"apy": 12.8, "token": "YTOKEN", "lock": "until 60",  "risk": "low"},
    "KAI Trust":      {"apy": 15.2, "token": "NVR",    "lock": "5 years",   "risk": "medium"},
    "MMF":            {"apy":  7.5, "token": "yBOB",   "lock": "none",      "risk": "very low"},
    "RWA":            {"apy": 18.0, "token": "YGOLD",  "lock": "secondary", "risk": "medium"},
    "Crop Insurance": {"apy":  8.5, "token": "YGOLD",  "lock": "seasonal",  "risk": "low"},
    "Forest Cover":   {"apy": 10.2, "token": "GAMI",   "lock": "seasonal",  "risk": "low"},
}

SYSTEM = """You are the KAI Yield Optimizer — an expert in maximising DeFi returns
within the KAI Nuvari ecosystem on Sepolia / Hedera Testnet.

When given a user profile and yield data, produce:

## Yield Optimization Report

### Current Yield Landscape
(ranked table: Product | APY | Risk | Lock | Token)

### Your Optimal Allocation
(based on risk tolerance, amount, and goals)
| Allocation | Product | APY | Amount | Expected Annual Return |

### Strategy Explanation
(why this allocation suits the user's profile)

### Risk-Adjusted Rankings
(Sharpe-like score: APY / risk_multiplier)

### Quick Wins
(actions to take TODAY for best immediate yield)

### What to Avoid
(products that don't suit this profile and why)

Always compare vault APY vs LP fee yield vs securities.
Be specific with percentages and expected KES/USD returns."""


async def _read_uint(addr: str, selector: str) -> int:
    body = {"jsonrpc": "2.0", "id": 1, "method": "eth_call",
            "params": [{"to": addr, "data": selector}, "latest"]}
    async with httpx.AsyncClient(timeout=10.0) as c:
        try:
            r = await c.post(SEPOLIA_RPC, json=body)
            res = r.json().get("result", "0x")
            return int(res, 16) if res and res != "0x" else 0
        except Exception:
            return 0


async def scan_all_yields(wallet: str | None = None) -> dict:
    """Scan all yield-bearing products and return live data."""

    # Fetch vault TVLs
    tvl_calls = [_read_uint(v["vault"], "0x01e1d114") for v in VAULTS.values()]  # totalAssets()
    tvls = await asyncio.gather(*tvl_calls)

    vault_data = []
    for (sym, v), tvl_raw in zip(VAULTS.items(), tvls):
        tvl = tvl_raw / 1e18
        tvl_usd = tvl * v["usd"]
        apy = v["apyBps"] / 100
        vault_data.append({
            "product":     f"kvVault {sym}",
            "type":        "vault",
            "token":       sym,
            "apy_pct":     apy,
            "tvl_tokens":  round(tvl, 2),
            "tvl_usd":     round(tvl_usd, 2),
            "risk":        v["risk"],
            "lock":        v["lock"],
            "risk_score":  {"very low": 1, "low": 2, "medium": 3, "high": 4}.get(v["risk"], 3),
            "sharpe_proxy": round(apy / {"very low": 1, "low": 2, "medium": 3, "high": 4}.get(v["risk"], 3), 2),
        })

    # Pool data (static + reserves check)
    pool_data = []
    for pair, p in POOLS.items():
        rA = await _read_uint(p["address"], "0xdc5fa6c5")  # reserveA
        rB = await _read_uint(p["address"], "0x19e36f3b")  # reserveB
        tvl_raw = (rA + rB) / 1e18  # simplified
        # Estimated LP fee APY = assume 10% annual volume relative to TVL
        est_apy = (p["fee_bps"] / 100) * 10  # fee * volume_multiplier
        pool_data.append({
            "product":    f"LP {pair}",
            "type":       "amm_lp",
            "pair":       pair,
            "apy_pct":    round(est_apy, 1),
            "apy_note":   "variable — depends on swap volume",
            "tvl_tokens": round(tvl_raw, 2),
            "risk":       p["risk"],
            "lock":       "none",
            "il_risk":    "yes",
            "risk_score": {"low": 2, "medium": 3}.get(p["risk"], 3),
            "sharpe_proxy": round(est_apy / {"low": 2, "medium": 3}.get(p["risk"], 3), 2),
        })

    sec_data = [
        {
            "product":    name,
            "type":       "securities",
            "token":      s["token"],
            "apy_pct":    s["apy"],
            "risk":       s["risk"],
            "lock":       s["lock"],
            "risk_score": {"very low": 1, "low": 2, "medium": 3, "high": 4}.get(s["risk"], 3),
            "sharpe_proxy": round(s["apy"] / {"very low": 1, "low": 2, "medium": 3, "high": 4}.get(s["risk"], 3), 2),
        }
        for name, s in SECURITIES.items()
    ]

    all_products = vault_data + pool_data + sec_data
    all_products.sort(key=lambda x: x["sharpe_proxy"], reverse=True)

    return {
        "vaults":     vault_data,
        "pools":      pool_data,
        "securities": sec_data,
        "ranked":     all_products,
        "best_by_apy": max(all_products, key=lambda x: x["apy_pct"])["product"],
        "best_risk_adjusted": all_products[0]["product"],
        "wallet": wallet,
    }


class YieldOptimizerAgent(AgentBase):
    name = "yield_optimizer"
    description = "Scans all KAI vaults, pools, and securities for best risk-adjusted returns"

    async def run(
        self,
        question:        str = "What are the best yield opportunities right now?",
        risk_tolerance:  str = "medium",
        amount_usd:      float = 0.0,
        goals:           list[str] | None = None,
        wallet:          str | None = None,
    ) -> dict:
        goals = goals or ["yield", "capital_preservation"]
        data  = await scan_all_yields(wallet=wallet)

        prompt = f"""User Profile:
  Risk tolerance: {risk_tolerance}
  Investment amount: ${amount_usd:.2f} USD
  Goals: {', '.join(goals)}
  Wallet: {wallet or 'not provided'}

Question: {question}

Live KAI yield data:
{json.dumps(data, indent=2)}

Provide optimised yield recommendations."""

        report = await self.complete(prompt, system=SYSTEM)
        return {
            "agent":        self.name,
            "risk":         risk_tolerance,
            "amount_usd":   amount_usd,
            "yields":       data,
            "report":       report,
        }

    async def stream(
        self,
        question:       str = "Best yield opportunities",
        risk_tolerance: str = "medium",
        amount_usd:     float = 0.0,
        wallet:         str | None = None,
    ) -> AsyncIterator[str]:
        data = await scan_all_yields(wallet=wallet)
        prompt = f"""Risk: {risk_tolerance} | Amount: ${amount_usd:.2f}
Question: {question}

Yield data:
{json.dumps(data["ranked"][:10], indent=2)}"""

        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
