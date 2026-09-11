"""
agents/trust_score.py
KAI Trust Score Engine

Computes the unified KAI Trust Score for a user from three weighted components:
  Hat 1 - Forest Guardian  : tree survival rate   (20% weight)
  Hat 2 - MSME Merchant    : cash flow score       (35% weight)
  Hat 3 - Chama Saver      : chama repayment score (45% weight)

Score range 300-850, unlocking tiered platform privileges.
"""

from __future__ import annotations
from agents.base import AgentBase, groq_complete

SYSTEM = """You are the KAI Trust Score Advisor. Given a user's three activity scores,
calculate their unified trust score, explain what tier they are in, and give 3 specific
recommendations to improve their score. Be concise and practical for a Kenyan community
member. Use KES amounts and local context."""

TIER_TABLE = [
    (750, "🌟 Platinum Guardian", "Zero-collateral invoice financing, 2% loan rate, priority seed allocation"),
    (650, "🟢 Gold Member",       "80% LTV invoice tokenization, instant Chama yield withdrawals"),
    (550, "🟡 Silver Member",     "Standard nursery bounties, Paystack 1-click payouts"),
    (0,   "🟠 Bronze / New",      "6-month tree survival verification required before loan access"),
]


def compute_score(forest: float, msme: float, chama: float) -> dict:
    """
    Compute the unified KAI Trust Score from the three hat scores (0-100 each).
    Returns score (300-850 range), tier label, and privileges string.
    """
    # Weighted composite (0-100 range first)
    composite = (0.20 * forest) + (0.35 * msme) + (0.45 * chama)

    # Scale to 300-850
    score = int(300 + (composite / 100) * 550)
    score = max(300, min(850, score))

    # Tier lookup
    tier_label, privileges = "🟠 Bronze / New", TIER_TABLE[-1][2]
    for threshold, label, privs in TIER_TABLE:
        if score >= threshold:
            tier_label, privileges = label, privs
            break

    return {
        "score":           score,
        "tier":            tier_label,
        "privileges":      privileges,
        "components": {
            "forest_survival_score": round(forest, 1),
            "msme_cashflow_score":   round(msme,   1),
            "chama_repayment_score": round(chama,  1),
        },
        "weights": {"forest": "20%", "msme": "35%", "chama": "45%"},
    }


class TrustScoreAgent(AgentBase):
    name        = "trust_score"
    description = "Computes and explains the KAI Unified Trust Score from user activity"

    async def run(
        self,
        forest_score: float = 0.0,
        msme_score:   float = 0.0,
        chama_score:  float = 0.0,
        user_name:    str   = "Community Member",
        **kwargs,
    ) -> dict:
        result = compute_score(forest_score, msme_score, chama_score)

        prompt = f"""User profile for {user_name}:
- Forest Guardian score: {forest_score}/100 (tree planting & survival)
- MSME Merchant score:   {msme_score}/100  (cash flow & bookkeeping)
- Chama Saver score:     {chama_score}/100 (repayment & contributions)

Computed KAI Trust Score: {result['score']} — {result['tier']}
Privileges unlocked: {result['privileges']}

Explain this score in plain language, then give exactly 3 actionable steps
to improve it. Each step should take less than 30 days and be achievable in rural Kenya.
"""
        result["ai_explanation"] = await self.complete(prompt, system=SYSTEM)
        return result

    async def stream(self, forest_score=0.0, msme_score=0.0, chama_score=0.0, user_name="Community Member", **kwargs):
        result = compute_score(forest_score, msme_score, chama_score)
        prompt = f"""User {user_name}: Trust Score {result['score']} ({result['tier']}).
Forest={forest_score}, MSME={msme_score}, Chama={chama_score}.
Give 3 specific steps to improve the score in 30 days. Use KES amounts and local context."""
        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
