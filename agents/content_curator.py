"""
agents/content_curator.py
KAI Community Content Curator

Recommends relevant posts, guides, and audio content from the Community
Information Hub based on the user's hat, location, and current activity.

Integrates with the /hub page feed and the RAG knowledge base.
"""

from __future__ import annotations
from agents.base import AgentBase

# Simulated post index (replaced by DB query in production)
CONTENT_INDEX = [
    {"id": "p1", "title": "Protecting Bamboo in the Dry Season",     "category": "FORESTRY_MRV",  "type": "FIELD_JOURNAL",     "tags": ["bamboo","dry season","MRV"]},
    {"id": "p2", "title": "How Our Chama Earned 18% APY With yBOB",  "category": "CHAMA_SAVINGS", "type": "ARTICLE",            "tags": ["ybob","chama","yield"]},
    {"id": "p3", "title": "DAP Fertiliser Price Alert — Eldoret",    "category": "AGRI_MARKET",   "type": "MARKET_NEWS",        "tags": ["fertiliser","prices"]},
    {"id": "p4", "title": "KAI Smart Ledger Voice Guide for Traders","category": "MSME_GROWTH",   "type": "AUDIO_PODCAST",      "tags": ["ledger","voice","msme"]},
    {"id": "p5", "title": "Tokenise Your Unpaid Invoice — Step by Step","category":"MSME_GROWTH", "type": "EDUCATIONAL_GUIDE",  "tags": ["rwa","invoice","finance"]},
    {"id": "p6", "title": "Honey Harvest Season: Turkana Beekeepers","category": "FORESTRY_MRV",  "type": "FIELD_JOURNAL",      "tags": ["honey","gami","forest"]},
    {"id": "p7", "title": "Carbon Credits on Ethereum & Hedera — CFA Guide", "category": "FORESTRY_MRV",  "type": "ARTICLE",            "tags": ["carbon","blockchain","mrv"]},
    {"id": "p8", "title": "Group Investment Basics for SACCO Members","category":"CHAMA_SAVINGS",  "type": "AUDIO_PODCAST",      "tags": ["sacco","defi","audio"]},
]

HAT_CATEGORIES = {
    "FOREST_GUARDIAN": ["FORESTRY_MRV", "AGRI_MARKET"],
    "MSME_MERCHANT":   ["MSME_GROWTH",  "AGRI_MARKET"],
    "CHAMA_SAVER":     ["CHAMA_SAVINGS","MSME_GROWTH"],
}

SYSTEM = """You are the KAI Content Curator. Recommend 2-3 pieces of content from the
Knowledge Hub that are most relevant to the user's current situation. Be specific —
mention the article title and one concrete thing they will learn. Keep it under 100 words."""


class ContentCuratorAgent(AgentBase):
    name        = "content_curator"
    description = "Recommends hub articles, journals, and podcasts tailored to the user's hat and needs"

    def _filter(self, hat: str, interests: list[str]) -> list[dict]:
        cats = HAT_CATEGORIES.get(hat, [cat for cats in HAT_CATEGORIES.values() for cat in cats])
        # Score by category match + tag overlap
        scored = []
        for post in CONTENT_INDEX:
            score = 0
            if post["category"] in cats:
                score += 2
            for tag in post["tags"]:
                if any(i.lower() in tag.lower() for i in interests):
                    score += 1
            scored.append((score, post))
        scored.sort(key=lambda x: -x[0])
        return [p for _, p in scored[:4]]

    async def run(
        self,
        hat:       str  = "CHAMA_SAVER",
        interests: list = None,
        context:   str  = "",
        **kwargs,
    ) -> dict:
        interests = interests or []
        recommended = self._filter(hat, interests)

        titles = "\n".join(f"- {p['title']} [{p['type']}]" for p in recommended)
        prompt = f"""User is in {hat.replace('_',' ').title()} mode.
Interests: {', '.join(interests) or 'general KAI onboarding'}.
Context: {context or 'just getting started on KAI'}.

Available content:
{titles}

Recommend the top 2-3 pieces and explain in one sentence each why they are relevant."""

        ai_intro = await self.complete(prompt, system=SYSTEM)
        return {"recommended": recommended, "ai_introduction": ai_intro, "hat": hat}

    async def stream(self, hat="CHAMA_SAVER", interests=None, context="", **kwargs):
        interests = interests or []
        recommended = self._filter(hat, interests)
        titles = "\n".join(f"- {p['title']}" for p in recommended)
        prompt = f"""User is in {hat.replace('_',' ').title()} mode. Recommend these articles:
{titles}
Give a brief (under 80 words) personalised intro to why each one matters for them right now."""
        async for chunk in self.stream_response(prompt, system=SYSTEM):
            yield chunk
