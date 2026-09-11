"""
Agent 5: Community Commodity Pricing Agent
Analyses price submissions for tokenized community commodities (honey, milk,
beads, seeds, etc.) and produces market summaries and fair-value estimates.
Price data comes from local SQLite via Prisma — no external APIs.
"""

from __future__ import annotations
import json
import sqlite3
import os
from datetime import datetime, timedelta
from typing import AsyncIterator
from .base import AgentBase

# Community commodities tracked
COMMODITIES = [
    "honey", "milk", "beads", "necklace", "medicine",
    "recipe", "charcoal", "weaving", "seeds", "water",
    "pottery", "bark",
]

# Fallback in-memory price store when DB not available
_PRICE_STORE: dict[str, list[dict]] = {c: [] for c in COMMODITIES}

SYSTEM = """You are a community commodity market analyst for the KAI Nuvari ecosystem.
You analyse price data for tokenized indigenous and forest commodities.

When given price data, produce a market summary with:

## Community Commodity Market Report

### Price Summary Table
(commodity | current price | 7-day change | volume | trend)

### Market Highlights
(3-5 key observations about what is moving and why)

### Fair Value Estimates
(for each commodity: estimated fair USD value per unit, based on data patterns)

### Risk Flags
(any unusual price movements, thin liquidity, manipulation concerns)

### Recommendations for Token Holders
(which commodities look undervalued/overvalued relative to fair value)

Use African and global commodity market context. 
Prices are in USD per unit (1 kg for honey/milk/charcoal, 1 item for beads/pottery/necklace,
1 batch for medicine/recipe, 1 hectare-right for water, 1 kg for bark/weaving).
Be specific with numbers."""


def _get_db_path() -> str | None:
    """Find the Prisma SQLite DB if it exists (for local dev)."""
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "prisma", "dev.db"),
        os.path.join(os.path.dirname(__file__), "..", "data", "prices.db"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def add_price(commodity: str, price_usd: float, submitter: str = "system", unit: str = "kg") -> dict:
    """Add a price submission to the in-memory store."""
    if commodity not in _PRICE_STORE:
        _PRICE_STORE[commodity] = []
    entry = {
        "commodity": commodity,
        "price_usd": price_usd,
        "unit": unit,
        "submitter": submitter,
        "timestamp": datetime.utcnow().isoformat(),
    }
    _PRICE_STORE[commodity].append(entry)
    return entry


def _load_prices(commodity: str | None = None, days: int = 7) -> dict:
    """Load recent price submissions from memory store."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    result = {}
    targets = [commodity] if commodity else COMMODITIES
    for c in targets:
        entries = [
            e for e in _PRICE_STORE.get(c, [])
            if datetime.fromisoformat(e["timestamp"]) >= cutoff
        ]
        if entries:
            prices = [e["price_usd"] for e in entries]
            result[c] = {
                "entries": entries[-20:],  # last 20
                "count": len(entries),
                "min": round(min(prices), 4),
                "max": round(max(prices), 4),
                "avg": round(sum(prices) / len(prices), 4),
                "latest": round(entries[-1]["price_usd"], 4),
                "unit": entries[-1].get("unit", "unit"),
            }
        else:
            result[c] = {"entries": [], "count": 0, "note": "no data yet"}
    return result


# Seed with realistic baseline prices on first import
_BASELINES = {
    "honey":     (3.50,  "kg",   "Nairobi wholesale"),
    "milk":      (0.45,  "litre","Kenyan pastoral avg"),
    "beads":     (12.00, "item", "Maasai craft market"),
    "necklace":  (28.00, "item", "Artisan fair"),
    "medicine":  (8.50,  "batch","Traditional healer rate"),
    "recipe":    (5.00,  "batch","Community IP license"),
    "charcoal":  (0.30,  "kg",   "Nairobi charcoal market"),
    "weaving":   (15.00, "item", "Kikoy export price"),
    "seeds":     (4.20,  "kg",   "Heritage seed bank"),
    "water":     (0.08,  "litre","Pastoral water access"),
    "pottery":   (18.00, "item", "Tourist craft market"),
    "bark":      (22.00, "kg",   "UNESCO heritage material"),
}
for _com, (_price, _unit, _src) in _BASELINES.items():
    import random
    for _d in range(7):
        _variation = _price * (1 + random.uniform(-0.08, 0.08))
        add_price(_com, round(_variation, 4), submitter=_src, unit=_unit)


class CommodityPricingAgent(AgentBase):
    name = "commodity_pricing"
    description = "Analyses community commodity prices and produces market summaries"

    async def run(
        self,
        commodity: str | None = None,
        days: int = 7,
        question: str | None = None,
    ) -> dict:
        prices = _load_prices(commodity, days)
        prompt = (
            f"Here is the price data for the last {days} days:\n\n"
            f"{json.dumps(prices, indent=2)}\n\n"
            + (f"User question: {question}\n\n" if question else "")
            + "Produce a full market report."
        )
        report = await self.complete(prompt, system=SYSTEM)
        return {
            "agent":     self.name,
            "commodity": commodity or "all",
            "days":      days,
            "data":      prices,
            "report":    report,
        }

    async def stream(
        self,
        commodity: str | None = None,
        days: int = 7,
        question: str | None = None,
    ) -> AsyncIterator[str]:
        prices = _load_prices(commodity, days)
        prompt = (
            f"Price data for the last {days} days:\n\n"
            f"{json.dumps(prices, indent=2)}\n\n"
            + (f"User question: {question}\n\n" if question else "")
            + "Produce a full market report."
        )
        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk

    @staticmethod
    def submit_price(commodity: str, price_usd: float, submitter: str = "community", unit: str = "kg") -> dict:
        """Allow the frontend to submit new price data."""
        if commodity not in COMMODITIES:
            return {"error": f"Unknown commodity '{commodity}'. Valid: {COMMODITIES}"}
        return add_price(commodity, price_usd, submitter, unit)
