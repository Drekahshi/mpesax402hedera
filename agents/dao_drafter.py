"""
Agent 4: DAO Proposal Drafter
Takes a plain-language idea and structures it into a formal KAI DAO
governance proposal with rationale, impact analysis, and vote parameters.
No external APIs — pure Groq reasoning.
"""

from __future__ import annotations
import json
from datetime import datetime, timedelta
from typing import AsyncIterator
from .base import AgentBase

SYSTEM = """You are a DAO governance expert for the KAI decentralised autonomous organisation
on Ethereum & Hedera (X402). You draft formal, professional governance proposals.

Every proposal you write MUST follow this exact structure:

---
## KAI DAO Proposal

**Proposal ID:** KIP-[AUTO]
**Title:** [Clear, concise title]
**Category:** [Treasury | Protocol | Community | Technical | Emergency]
**Status:** Draft
**Author:** [from input]
**Created:** [today's date]
**Voting Period:** [start] → [end] (5 days)
**Quorum Required:** 10% of circulating NVR
**Approval Threshold:** 60% YES votes

---

### Abstract
(2-3 sentence summary of what is being proposed)

### Motivation
(Why is this needed? What problem does it solve?)

### Specification
(Exact technical or operational changes to be made. Be specific with numbers,
addresses, percentages, timeframes.)

### Rationale
(Why this approach over alternatives? What tradeoffs were considered?)

### Impact Analysis
- **Treasury impact:** (ETH/token cost or revenue)
- **Token impact:** (effect on NVR supply/demand)
- **Community impact:** (who benefits, who is affected)
- **Risk factors:** (what could go wrong)

### Implementation Plan
(Step-by-step execution timeline if proposal passes)

### Vote Options
- ✅ **YES** — Approve and implement as specified
- ❌ **NO** — Reject proposal
- 🔄 **ABSTAIN** — Acknowledge but take no position

### References
(Links to relevant discussions, data, or prior proposals if any)

---
Be thorough, professional, and specific. Use exact numbers where possible."""


class DAODrafterAgent(AgentBase):
    name = "dao_drafter"
    description = "Converts plain-language ideas into formal KAI DAO proposals"

    async def run(
        self,
        idea: str,
        author: str = "Community Member",
        category: str = "Protocol",
        kip_number: int | None = None,
    ) -> dict:
        today     = datetime.utcnow().strftime("%Y-%m-%d")
        vote_end  = (datetime.utcnow() + timedelta(days=5)).strftime("%Y-%m-%d")
        kip       = f"KIP-{kip_number}" if kip_number else "KIP-TBD"

        prompt = f"""Draft a formal KAI DAO governance proposal for this idea:

"{idea}"

Author: {author}
Category: {category}
Proposal ID: {kip}
Today's date: {today}
Voting period ends: {vote_end}

Write the complete proposal following the required format."""

        proposal = await self.complete(prompt, system=SYSTEM)

        # Extract a short title for the response metadata
        title_line = next(
            (line for line in proposal.splitlines() if "**Title:**" in line),
            "**Title:** Untitled Proposal"
        )
        title = title_line.replace("**Title:**", "").strip()

        return {
            "agent":    self.name,
            "kip":      kip,
            "title":    title,
            "author":   author,
            "category": category,
            "created":  today,
            "proposal": proposal,
        }

    async def stream(
        self,
        idea: str,
        author: str = "Community Member",
        category: str = "Protocol",
        kip_number: int | None = None,
    ) -> AsyncIterator[str]:
        today    = datetime.utcnow().strftime("%Y-%m-%d")
        vote_end = (datetime.utcnow() + timedelta(days=5)).strftime("%Y-%m-%d")
        kip      = f"KIP-{kip_number}" if kip_number else "KIP-TBD"

        prompt = f"""Draft a formal KAI DAO governance proposal for this idea:

"{idea}"

Author: {author}
Category: {category}
Proposal ID: {kip}
Today's date: {today}
Voting period ends: {vote_end}

Write the complete proposal following the required format."""

        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
