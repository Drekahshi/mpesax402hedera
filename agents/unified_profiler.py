"""
agents/unified_profiler.py
KAI Unified User Profiler & Onboarding Agent

Creates or updates a user's unified KAI profile by:
  1. Collecting identity signals (phone, wallet, language preference)
  2. Classifying their primary hat (Forest Guardian / MSME Merchant / Chama Saver)
  3. Setting up their initial trust score baseline
  4. Personalising the UI and recommending the first 3 actions to take

Aligned with the 3-hat architecture in docs/unified-user-profiling-system.md
"""

from __future__ import annotations
from agents.base import AgentBase
from agents.hat_switcher  import classify_hat, HAT_DESCRIPTIONS, HAT_ROUTES
from agents.trust_score   import compute_score

SYSTEM = """You are the KAI Onboarding Guide. You help new users of KAI Nuvari
get set up in under 3 minutes. You understand that users wear multiple hats
(Forest Guardian, MSME Merchant, Chama Saver) and that the platform works best
when all three are active. Be warm, encouraging, and practical. Use Swahili greetings
and local Kenyan context. Keep responses under 120 words."""

ONBOARDING_STEPS = {
    "FOREST_GUARDIAN": [
        "📍 Register your CFA group in the Profile tab",
        "🌳 Log your first patrol or seedling batch in the CFA Dashboard",
        "💰 Deposit community forest product earnings into the GAMI vault (14% APY)",
    ],
    "MSME_MERCHANT": [
        "🏪 Set up your SME business profile with M-Pesa till number",
        "📒 Record your first week of income and expenses in the MSME Ledger",
        "🪙 Convert KES 500+ in daily sales to yBOB for 7.5% APY returns",
    ],
    "CHAMA_SAVER": [
        "🤝 Register your Chama group name and monthly contribution amount",
        "💜 Connect your Chama wallet to the yBOB Balanced Vault (18% APY)",
        "📊 Invite other members using your referral code for bonus NVR tokens",
    ],
}


class UnifiedProfilerAgent(AgentBase):
    name        = "unified_profiler"
    description = "Onboards new users by building their unified KAI profile and first-action checklist"

    async def run(
        self,
        message:       str   = "",
        wallet_address:str   = "",
        phone_number:  str   = "",
        name:          str   = "Community Member",
        language:      str   = "SWAHILI",
        cfa_group:     str   = "",
        business_name: str   = "",
        chama_name:    str   = "",
        forest_score:  float = 0.0,
        msme_score:    float = 0.0,
        chama_score:   float = 0.0,
        **kwargs,
    ) -> dict:
        # 1. Classify primary hat from message or context
        hat_input = f"{message} {cfa_group} {business_name} {chama_name}"
        primary_hat, confidence = classify_hat(hat_input)

        # If all scores are 0, give a small baseline so new users start at Bronze+
        if forest_score == msme_score == chama_score == 0.0:
            forest_score = msme_score = chama_score = 10.0  # new user baseline

        # 2. Compute initial trust score
        trust = compute_score(forest_score, msme_score, chama_score)

        # 3. Get next steps for primary hat
        next_steps = ONBOARDING_STEPS[primary_hat]

        # 4. Build profile dict
        profile = {
            "name":           name,
            "wallet":         wallet_address,
            "phone":          phone_number,
            "language":       language,
            "primary_hat":    primary_hat,
            "hat_description":HAT_DESCRIPTIONS[primary_hat],
            "dashboard_route":HAT_ROUTES[primary_hat],
            "hat_confidence": confidence,
            "cfa_group":      cfa_group,
            "business_name":  business_name,
            "chama_name":     chama_name,
            "trust_score":    trust["score"],
            "trust_tier":     trust["tier"],
            "next_steps":     next_steps,
        }

        # 5. Generate personalised welcome
        prompt = f"""Welcome {name} to KAI Nuvari!

Primary hat detected: {HAT_DESCRIPTIONS[primary_hat]}
Dashboard: {HAT_ROUTES[primary_hat]}
Trust Score: {trust['score']} — {trust['tier']}

Their first 3 steps:
{chr(10).join(next_steps)}

In 3-4 sentences, give them a warm personalised welcome and get them excited
about their first action. Use "Karibu KAI!" as the opening. Reference their
specific hat and one real KAI feature that will benefit them most."""

        profile["welcome_message"] = await self.complete(prompt, system=SYSTEM)
        return profile

    async def stream(self, message="", name="Community Member", cfa_group="", business_name="", chama_name="", **kwargs):
        hat_input = f"{message} {cfa_group} {business_name} {chama_name}"
        primary_hat, _ = classify_hat(hat_input)
        steps = ONBOARDING_STEPS[primary_hat]
        prompt = f"""Welcome {name}! Primary hat: {HAT_DESCRIPTIONS[primary_hat]}.
First steps:
{chr(10).join(steps)}
Give a warm 3-sentence welcome. Start with "Karibu KAI!". Mention one specific benefit."""
        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
