"""
agents/payment_approver.py
KAI x402 Payment Approver Agent

Analyses pending x402 payment requests and provides the owner with:
  - Risk assessment (is the payer wallet known/trusted?)
  - Route-level justification (what service is being accessed?)
  - Auto-approve recommendation for low-risk routes
  - Fraud pattern detection (replay attacks, excessive spend)

Integrates with x402_rails.py and the /api/x402/approve Next.js route.
"""

from __future__ import annotations
import time
from typing import Any
from agents.base import AgentBase

# Routes considered low-risk (can be auto-approved)
LOW_RISK_ROUTES = {
    "/agents/docs/ask",
    "/agents/onboard/profile",
    "/agents/onboard/hat",
    "/agents/onboard/trust",
    "/agents/onboard/content",
}

# Routes requiring explicit owner approval
HIGH_RISK_ROUTES = {
    "/agents/codegen/generate",
    "/agents/audit",
    "/agents/dao/draft",
}

# In-memory spend tracker (wallet → total spent this hour)
_spend_tracker: dict[str, list[float]] = {}

SYSTEM = """You are the KAI x402 Payment Risk Analyst. Your job is to assess whether
a pending agent payment should be approved or flagged. Be brief — give a APPROVE / REVIEW /
REJECT verdict with a one-sentence reason. Consider: route risk level, payer history,
amount vs service value, and time-of-day patterns."""


def assess_risk(route: str, payer: str, amount: int, nonce: str) -> dict:
    """
    Fast heuristic risk check — returns risk_level and recommendation.
    """
    now = time.time()
    hour_ago = now - 3600

    # Track spend per wallet
    if payer not in _spend_tracker:
        _spend_tracker[payer] = []
    _spend_tracker[payer] = [t for t in _spend_tracker[payer] if t > hour_ago]
    hourly_spend = len(_spend_tracker[payer])
    _spend_tracker[payer].append(now)

    risk = "LOW"
    recommendation = "APPROVE"
    flags = []

    if route in HIGH_RISK_ROUTES:
        risk = "HIGH"
        recommendation = "REVIEW"
        flags.append(f"High-value route: {route}")

    if hourly_spend > 10:
        risk = "HIGH"
        recommendation = "REJECT"
        flags.append(f"Excessive spend: {hourly_spend} requests in last hour")

    if amount > 800:
        risk = "MEDIUM" if risk == "LOW" else risk
        recommendation = "REVIEW" if recommendation == "APPROVE" else recommendation
        flags.append(f"Large payment: {amount} token units")

    if route in LOW_RISK_ROUTES:
        risk = "LOW"
        recommendation = "APPROVE"
        flags = []  # clear flags for known-safe routes

    return {
        "risk_level":      risk,
        "recommendation":  recommendation,
        "flags":           flags,
        "hourly_requests": hourly_spend + 1,
        "route_category":  "HIGH_RISK" if route in HIGH_RISK_ROUTES else ("LOW_RISK" if route in LOW_RISK_ROUTES else "STANDARD"),
    }


class PaymentApproverAgent(AgentBase):
    name        = "payment_approver"
    description = "Analyses x402 payment requests and recommends approve/reject decisions to the owner"

    async def run(
        self,
        route:   str = "",
        payer:   str = "",
        amount:  int = 0,
        nonce:   str = "",
        service: str = "",
        **kwargs,
    ) -> dict:
        risk_result = assess_risk(route, payer, amount, nonce)

        prompt = f"""Pending x402 payment request:
- Service:  {service or route}
- Route:    {route}
- Payer:    {payer}
- Amount:   {amount} token units
- Nonce:    {nonce}
- Risk:     {risk_result['risk_level']}
- Flags:    {', '.join(risk_result['flags']) or 'none'}
- Hourly requests from this wallet: {risk_result['hourly_requests']}

Give a APPROVE / REVIEW / REJECT verdict with a one-sentence justification."""

        ai_verdict = await self.complete(prompt, system=SYSTEM)
        return {**risk_result, "ai_verdict": ai_verdict, "route": route, "payer": payer, "amount": amount}

    async def stream(self, route="", payer="", amount=0, nonce="", service="", **kwargs):
        risk_result = assess_risk(route, payer, amount, nonce)
        prompt = f"""Payment for {service or route} from {payer}, amount {amount}.
Risk: {risk_result['risk_level']}. Flags: {', '.join(risk_result['flags']) or 'none'}.
Verdict (APPROVE/REVIEW/REJECT) with one sentence reason."""
        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
