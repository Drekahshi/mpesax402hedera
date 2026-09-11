"""
Agent 6: Policy Recommender
Analyses a user profile (age, holdings, risk tolerance, goals) and recommends
the most suitable KAI securities, insurance, and community products.
Pure Groq reasoning — no external APIs.
"""

from __future__ import annotations
import json
from typing import AsyncIterator
from .base import AgentBase

# All available KAI products
PRODUCTS = {
    "securities": [
        {"id": "trust",   "name": "KAI Trust",        "apy": "15.2%", "token": "NVR",    "lock": "5 years",   "risk": "medium", "min_age": 18,  "desc": "Time-locked token trust for beneficiaries"},
        {"id": "pension", "name": "KAI Pension",   "apy": "12.8%", "token": "YTOKEN", "lock": "until 60",  "risk": "low",    "min_age": 18,  "desc": "Long-term retirement savings"},
        {"id": "mmf",     "name": "Money Market Fund","apy": "7.5%",  "token": "yBOB",   "lock": "none",      "risk": "very low","min_age": 18, "desc": "Instant liquidity stablecoin basket"},
        {"id": "rwa",     "name": "RWA Tokenization", "apy": "18.0%", "token": "YGOLD",  "lock": "secondary", "risk": "medium", "min_age": 21,  "desc": "Tokenize land, property, or commodity"},
    ],
    "insurance": [
        {"id": "crop",    "name": "Crop Insurance",   "apy": "8.5%",  "token": "YGOLD",  "trigger": "weather","risk": "low",    "desc": "Parametric weather-triggered payout"},
        {"id": "forest",  "name": "Forest Protection","apy": "10.2%", "token": "GAMI",   "trigger": "satellite","risk":"low",   "desc": "Cover for tokenized forest hectares"},
        {"id": "medical", "name": "Medical Pool",     "apy": "5.0%",  "token": "CENTS",  "trigger": "receipt","risk": "very low","desc": "Community health emergency coverage"},
    ],
    "community": [
        {"id": "honey",    "name": "Forest Honey Reserve",     "apy": "14.0%", "token": "GAMI",   "risk": "medium"},
        {"id": "beads",    "name": "Cultural Beadwork NFT",    "apy": "11.5%", "token": "NVR",    "risk": "medium"},
        {"id": "milk",     "name": "Pastoral Milk Pool",       "apy": "7.2%",  "token": "yBOB",   "risk": "low"},
        {"id": "medicine", "name": "Traditional Medicine",     "apy": "16.0%", "token": "GAMI",   "risk": "high"},
        {"id": "seeds",    "name": "Heritage Seed Bank",       "apy": "6.5%",  "token": "NVR",    "risk": "low"},
        {"id": "weaving",  "name": "Textile & Weaving Co-op",  "apy": "10.5%", "token": "YTOKEN", "risk": "medium"},
    ],
    "vaults": [
        {"id": "nvr_vault",    "name": "NVR Vault",    "apy": "15.2%", "token": "NVR",    "risk": "medium"},
        {"id": "ybob_vault",   "name": "yBOB Vault",   "apy": "7.5%",  "token": "yBOB",   "risk": "very low"},
        {"id": "ytoken_vault", "name": "YTOKEN Vault", "apy": "14.8%", "token": "YTOKEN", "risk": "medium"},
        {"id": "ygold_vault",  "name": "YGOLD Vault",  "apy": "12.4%", "token": "YGOLD",  "risk": "low"},
        {"id": "gami_vault",   "name": "GAMI Vault",   "apy": "22.0%", "token": "GAMI",   "risk": "high"},
        {"id": "cents_vault",  "name": "CENTS Vault",  "apy": "6.5%",  "token": "CENTS",  "risk": "very low"},
    ],
}

SYSTEM = """You are a KAI Nuvari DeFi financial advisor. You provide personalised product
recommendations based on a user's profile and the available KAI products.

Produce a recommendation report with exactly these sections:

## Personalised KAI Policy Recommendations

### Profile Summary
(Restate the user's key characteristics: age, risk tolerance, goals, current holdings)

### Top Recommendations (Ranked)
For each recommendation:
**#N: [Product Name]** ([Category])
- Why it fits: (1-2 sentences)
- Expected yield: (APY)
- Token used: (ERC-20 symbol)
- Risk level: (very low / low / medium / high)
- Suggested allocation: (% of portfolio)

### Products to Avoid
(Products that don't fit the profile and why)

### Suggested Portfolio Allocation
(Pie chart in text: % to each category — securities, insurance, community, vaults)

### Next Steps
(3 concrete actions the user should take on the KAI platform)

Be specific. Match the user's age, risk tolerance, and goals to the right products.
A conservative 60-year-old gets different advice than an aggressive 25-year-old farmer."""


class PolicyRecommenderAgent(AgentBase):
    name = "policy_recommender"
    description = "Recommends KAI products based on user profile"

    async def run(
        self,
        age: int = 30,
        risk_tolerance: str = "medium",      # very low, low, medium, high
        goals: list[str] | None = None,
        occupation: str = "general",
        monthly_income_usd: float = 500.0,
        current_holdings: dict | None = None,
        location: str = "Kenya",
        question: str | None = None,
    ) -> dict:
        goals            = goals or ["savings", "yield"]
        current_holdings = current_holdings or {}

        profile = {
            "age":                 age,
            "risk_tolerance":      risk_tolerance,
            "goals":               goals,
            "occupation":          occupation,
            "monthly_income_usd":  monthly_income_usd,
            "current_holdings":    current_holdings,
            "location":            location,
        }

        prompt = f"""User Profile:
{json.dumps(profile, indent=2)}

Available KAI Products:
{json.dumps(PRODUCTS, indent=2)}

{f"User question: {question}" if question else ""}

Provide personalised product recommendations for this user."""

        report = await self.complete(prompt, system=SYSTEM)
        return {
            "agent":   self.name,
            "profile": profile,
            "report":  report,
        }

    async def stream(
        self,
        age: int = 30,
        risk_tolerance: str = "medium",
        goals: list[str] | None = None,
        occupation: str = "general",
        monthly_income_usd: float = 500.0,
        current_holdings: dict | None = None,
        location: str = "Kenya",
        question: str | None = None,
    ) -> AsyncIterator[str]:
        goals            = goals or ["savings", "yield"]
        current_holdings = current_holdings or {}

        profile = {
            "age": age, "risk_tolerance": risk_tolerance, "goals": goals,
            "occupation": occupation, "monthly_income_usd": monthly_income_usd,
            "current_holdings": current_holdings, "location": location,
        }
        prompt = f"""User Profile:
{json.dumps(profile, indent=2)}

Available KAI Products:
{json.dumps(PRODUCTS, indent=2)}

{f"User question: {question}" if question else ""}

Provide personalised product recommendations."""

        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
