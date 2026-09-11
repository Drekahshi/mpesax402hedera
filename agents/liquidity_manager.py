"""
agents/liquidity_manager.py
KAI Liquidity Position Manager.

Reads live pool reserves from all 3 KaiPool contracts on Sepolia, calculates
impermanent loss for any LP position, and recommends rebalancing strategies.

Capabilities:
  - get_pool_state()    — live reserves, spot price, LP supply
  - calculate_il()      — impermanent loss for a position
  - get_best_pool()     — which pool has best depth/fee ratio right now
  - position_value()    — USD value of LP shares
  - rebalance_advice()  — AI reasoning on when/how to rebalance
  - add_liquidity_sim() — simulate what adding X tokens would do to the pool
"""

from __future__ import annotations
import os
import json
import math
from typing import AsyncIterator
import httpx
from .base import AgentBase

SEPOLIA_RPC = os.getenv("SEPOLIA_RPC_URL", "https://rpc.sepolia.org")
EXPLORER = "https://sepolia.etherscan.io"

# ── Pool config (from defiAddresses.json) ─────────────────────────────────────
POOLS = {
    "NVR/yBOB": {
        "address": "0x362AE5Da53e3ff57E7FF9c12775ABBf94ec38C47",
        "tokenA": {"sym": "NVR",    "addr": "0x6489Ea8302b00A8eEd4D82a78A5f9e71Fe2DaC62", "usd": 0.12,  "decimals": 18},
        "tokenB": {"sym": "yBOB",   "addr": "0xE4f6A3506616f7c8e445B20a5D93521bFeE97979", "usd": 1.00,  "decimals": 18},
        "fee_bps": 30,
    },
    "YTOKEN/YGOLD": {
        "address": "0x62B367533301f2eF4484aEFF98cBF7FdBFD3ADf3",
        "tokenA": {"sym": "YTOKEN", "addr": "0xF550ACf387011BC0172F2a14656AcE65846b7fBC", "usd": 0.27,  "decimals": 18},
        "tokenB": {"sym": "YGOLD",  "addr": "0xEbA875e6cb6d19d8d31b3D29a2b2cE7457D5808A", "usd": 2.01,  "decimals": 18},
        "fee_bps": 30,
    },
    "GAMI/CENTS": {
        "address": "0xa9a93c9bAeF66B5407138C06E68211cE63bd96e0",
        "tokenA": {"sym": "GAMI",   "addr": "0x199fC58F7Ce929f1dBDA89b9EB2391582a321e7d", "usd": 0.056, "decimals": 18},
        "tokenB": {"sym": "CENTS",  "addr": "0x1bd79052747A236Aca137380394da27771e95eeA", "usd": 0.009, "decimals": 18},
        "fee_bps": 30,
    },
}

SYSTEM = """You are the KAI Liquidity Manager — an expert in AMM liquidity positions.

When given pool data and a user question, produce a clear response covering:

## Liquidity Analysis

### Pool States
(reserves, TVL, spot price for each pool)

### Your Position Analysis (if LP balance provided)
(token amounts you own, current USD value, IL since entry)

### Impermanent Loss Assessment
(IL % and USD loss/gain vs holding)

### Rebalancing Recommendation
- Stay: reasons to keep current position
- Adjust: specific actions to rebalance
- Exit: if IL too high

### Best Pool Right Now
(which pool offers best fee yield relative to risk)

### Action Items
(concrete next steps with amounts)

Use exact numbers. Explain IL clearly for non-technical users."""


# ── RPC helper ────────────────────────────────────────────────────────────────

async def _call(to: str, data: str) -> str:
    body = {"jsonrpc": "2.0", "id": 1, "method": "eth_call",
            "params": [{"to": to, "data": data}, "latest"]}
    async with httpx.AsyncClient(timeout=15.0) as c:
        r = await c.post(SEPOLIA_RPC, json=body)
        return r.json().get("result", "0x")


async def _read_uint(to: str, selector: str) -> int:
    from eth_utils import keccak  # use ethers-compatible keccak
    result = await _call(to, selector)
    if result and result != "0x":
        try: return int(result, 16)
        except: pass
    return 0


# Function selectors (keccak4)
SEL = {
    "reserveA":    "0xdc5fa6c5",
    "reserveB":    "0x19e36f3b",
    "totalSupply": "0x18160ddd",
}


async def get_pool_state(pair: str) -> dict:
    pool = POOLS.get(pair)
    if not pool:
        return {"error": f"Unknown pool: {pair}"}

    addr = pool["address"]
    rA, rB, ts = await asyncio.gather(
        _read_uint(addr, SEL["reserveA"]),
        _read_uint(addr, SEL["reserveB"]),
        _read_uint(addr, SEL["totalSupply"]),
    )

    tA, tB = pool["tokenA"], pool["tokenB"]
    bal_a = rA / (10 ** tA["decimals"])
    bal_b = rB / (10 ** tB["decimals"])
    tvl   = bal_a * tA["usd"] + bal_b * tB["usd"]
    price = (bal_b / bal_a) if bal_a > 0 else 0

    return {
        "pair":      pair,
        "address":   addr,
        "explorer":  f"{EXPLORER}/address/{addr}",
        "reserveA":  round(bal_a, 6),
        "reserveB":  round(bal_b, 6),
        "symbolA":   tA["sym"],
        "symbolB":   tB["sym"],
        "spot_price": round(price, 6),
        "price_unit": f"{tB['sym']} per {tA['sym']}",
        "tvl_usd":   round(tvl, 2),
        "lp_supply": ts / 1e18,
        "fee_bps":   pool["fee_bps"],
        "annual_fee_yield": f"~{(pool['fee_bps'] / 100 * 365):.1f}% (volume-dependent)",
    }


def calculate_il(
    initial_price: float,
    current_price: float,
    initial_a: float,
    initial_b: float,
) -> dict:
    """
    Calculate impermanent loss for a constant-product AMM position.
    IL = 2*sqrt(P_ratio) / (1 + P_ratio) - 1
    """
    if initial_price <= 0 or initial_b <= 0:
        return {"error": "Invalid inputs"}

    p_ratio = current_price / initial_price
    il_pct  = (2 * math.sqrt(p_ratio) / (1 + p_ratio)) - 1   # always ≤ 0
    il_pct  = round(il_pct * 100, 4)

    # Current pool amounts (assuming proportional share)
    pool_a = initial_a * math.sqrt(p_ratio)
    pool_b = initial_b * math.sqrt(p_ratio)

    # Hodl value vs pool value
    hodl_value = initial_a + initial_b * (current_price / initial_price)
    pool_value = pool_a + pool_b * (current_price / initial_price)

    return {
        "initial_price":  initial_price,
        "current_price":  current_price,
        "price_change_pct": round((p_ratio - 1) * 100, 2),
        "il_pct":         il_pct,
        "il_usd_estimate": round(hodl_value - pool_value, 4),
        "hodl_value":      round(hodl_value, 4),
        "pool_value":      round(pool_value, 4),
        "current_pool_a":  round(pool_a, 6),
        "current_pool_b":  round(pool_b, 6),
        "verdict": (
            "✅ Low IL — staying in pool is profitable with fees"
            if abs(il_pct) < 1 else
            "⚠️ Moderate IL — monitor closely"
            if abs(il_pct) < 5 else
            "❌ High IL — consider exiting or rebalancing"
        ),
    }


import asyncio


# ── Agent class ───────────────────────────────────────────────────────────────

class LiquidityManagerAgent(AgentBase):
    name = "liquidity_manager"
    description = "KAI LP position manager: IL calculation, pool analytics, rebalancing advice"

    async def run(
        self,
        question:      str = "Show all pools and best LP opportunity",
        pair:          str | None = None,
        lp_balance:    float = 0.0,
        initial_price: float = 0.0,
        wallet:        str | None = None,
    ) -> dict:
        # Fetch all pool states
        pairs = [pair] if pair else list(POOLS.keys())
        pool_states = await asyncio.gather(*[get_pool_state(p) for p in pairs])

        # Calculate IL if entry price provided
        il_data = None
        if initial_price > 0 and pair and lp_balance > 0:
            ps = next((s for s in pool_states if s.get("pair") == pair), None)
            if ps:
                il_data = calculate_il(
                    initial_price = initial_price,
                    current_price = ps["spot_price"],
                    initial_a = lp_balance / 2 / (ps.get("tvl_usd", 1) / ps.get("lp_supply", 1) or 1),
                    initial_b = lp_balance / 2,
                )

        data = {
            "pools":      pool_states,
            "il_analysis": il_data,
            "lp_balance":  lp_balance,
            "wallet":      wallet,
        }

        prompt = f"""Question: {question}

Live pool data:
{json.dumps(data, indent=2)}

Provide liquidity management advice."""

        report = await self.complete(prompt, system=SYSTEM)
        return {
            "agent":  self.name,
            "pools":  pool_states,
            "il":     il_data,
            "report": report,
        }

    async def stream(self, question: str = "Show all pools", pair: str | None = None) -> AsyncIterator[str]:
        pairs = [pair] if pair else list(POOLS.keys())
        pool_states = await asyncio.gather(*[get_pool_state(p) for p in pairs])
        prompt = f"""Question: {question}

Pool data:
{json.dumps(pool_states, indent=2)}"""

        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
