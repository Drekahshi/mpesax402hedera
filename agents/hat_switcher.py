"""
agents/hat_switcher.py
KAI Hat Switcher & Intent Classifier

Detects which of the 3 user roles (hats) a user is operating in based on
their message or context, then routes them to the correct sub-agent.

Hat 1 — Forest Guardian  : nursery, planting, MRV, carbon credits
Hat 2 — MSME Merchant    : ledger, anti-counterfeit, invoice financing
Hat 3 — Chama Saver      : group savings, yield pools, micro-loans
"""

from __future__ import annotations
import re
from agents.base import AgentBase

# ── Keyword routing ─────────────────────────────────────────────────────────

HAT_KEYWORDS: dict[str, list[str]] = {
    "FOREST_GUARDIAN": [
        "tree", "seedling", "nursery", "bamboo", "plant", "forest", "carbon",
        "patrol", "harvest", "zone", "guardian", "cfa", "biodiversity",
        "honey", "beehive", "seeds", "reforestation", "mau", "karura",
    ],
    "MSME_MERCHANT": [
        "ledger", "sale", "invoice", "stock", "inventory", "counterfeit",
        "scan", "qr", "receipt", "supplier", "debt", "credit", "loan",
        "business", "shop", "hardware", "fertiliser", "agro", "merchant",
        "turnover", "revenue", "paystack", "till", "mpesa",
    ],
    "CHAMA_SAVER": [
        "chama", "sacco", "savings", "pool", "vault", "yield", "contribution",
        "dues", "payout", "chairperson", "treasurer", "monthly", "deposit",
        "withdrawal", "group", "merry-go-round", "interest", "micro-loan",
        "ybob", "nvr", "gami", "defi",
    ],
}

HAT_DESCRIPTIONS = {
    "FOREST_GUARDIAN": "Forest Guardian — nursery management, patrol logs, carbon credit tracking",
    "MSME_MERCHANT":   "MSME Merchant — intelligent ledger, anti-counterfeit scanning, invoice financing",
    "CHAMA_SAVER":     "Chama Saver — group savings, DeFi yield routing, micro-loans",
}

HAT_ROUTES = {
    "FOREST_GUARDIAN": "/cfa",
    "MSME_MERCHANT":   "/sme",
    "CHAMA_SAVER":     "/saving",
}


def classify_hat(message: str) -> tuple[str, float]:
    """
    Returns (hat_key, confidence 0-1) based on keyword density.
    Falls back to CHAMA_SAVER as the most common entry point.
    """
    text   = message.lower()
    scores: dict[str, int] = {}
    for hat, keywords in HAT_KEYWORDS.items():
        scores[hat] = sum(1 for kw in keywords if re.search(r"\b" + re.escape(kw) + r"\b", text))

    best     = max(scores, key=lambda k: scores[k])
    total    = sum(scores.values())
    confidence = scores[best] / total if total > 0 else 0.0
    if confidence == 0.0:
        return "CHAMA_SAVER", 0.0   # default
    return best, round(confidence, 2)


SYSTEM = """You are the KAI Hat Switcher. You detect which role a community member
is operating in (Forest Guardian, MSME Merchant, or Chama Saver) based on their message,
and guide them to the right tools and dashboards. Be warm, brief, and practical."""


class HatSwitcherAgent(AgentBase):
    name        = "hat_switcher"
    description = "Classifies user intent into one of the 3 KAI hats and routes to the correct dashboard"

    async def run(self, message: str = "", user_name: str = "User", **kwargs) -> dict:
        hat, confidence = classify_hat(message)
        prompt = f"""{user_name} said: "{message}"

Detected hat: {hat} (confidence {confidence:.0%})
Description: {HAT_DESCRIPTIONS[hat]}
Dashboard route: {HAT_ROUTES[hat]}

In 2-3 sentences, confirm which mode they're in and tell them the one
most relevant action they can take right now."""

        explanation = await self.complete(prompt, system=SYSTEM)
        return {
            "detected_hat":   hat,
            "confidence":     confidence,
            "description":    HAT_DESCRIPTIONS[hat],
            "dashboard_route":HAT_ROUTES[hat],
            "all_scores": {k: sum(1 for kw in v if re.search(r"\b"+re.escape(kw)+r"\b", message.lower())) for k,v in HAT_KEYWORDS.items()},
            "ai_response":    explanation,
        }

    async def stream(self, message: str = "", user_name: str = "User", **kwargs):
        hat, confidence = classify_hat(message)
        prompt = f"""{user_name} said: "{message}"
Detected hat: {HAT_DESCRIPTIONS[hat]}. Confidence: {confidence:.0%}.
In 2-3 sentences, welcome them to {hat.replace('_',' ').title()} mode and
tell them the top action they should take right now on KAI."""
        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
