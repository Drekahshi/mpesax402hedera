"""
agents/base.py
Shared utilities for all KAI agents.
Uses Groq cloud API — no local LLM required.
"""

from __future__ import annotations
import os
import json
import asyncio
from typing import AsyncIterator, Any
import httpx
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
TIMEOUT      = 60.0

_OFFLINE_MSG = (
    "The AI model is currently unavailable. "
    "Check your GROQ_API_KEY in .env.\n"
    "All other agent features continue to work without it."
)


# ─── Availability probe ───────────────────────────────────────────────────────

async def groq_available() -> bool:
    """Return True if Groq API key is set and reachable."""
    if not GROQ_API_KEY:
        return False
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            )
            return r.status_code == 200
    except Exception:
        return False


# ─── Low-level helpers ────────────────────────────────────────────────────────

async def groq_complete(
    prompt: str,
    system: str = "",
    model: str = GROQ_MODEL,
) -> str:
    """
    Single blocking-style completion via Groq (OpenAI-compatible API).
    Returns a graceful fallback string when offline or errors.
    """
    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model":       model,
        "messages":    messages,
        "temperature": 0.3,
        "max_tokens":  2048,
    }

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(GROQ_URL, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
    except httpx.ConnectError:
        return _OFFLINE_MSG
    except httpx.TimeoutException:
        return "The AI model timed out. Try a shorter prompt."
    except httpx.HTTPStatusError as e:
        return f"Groq returned an error ({e.response.status_code}). Check your API key."
    except Exception as e:
        return f"AI model unavailable: {e}"


async def groq_stream(
    prompt: str,
    system: str = "",
    model: str = GROQ_MODEL,
) -> AsyncIterator[str]:
    """
    Stream tokens from Groq as SSE lines.
    Yields a single error SSE event when offline.
    """
    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model":       model,
        "messages":    messages,
        "temperature": 0.3,
        "max_tokens":  2048,
        "stream":      True,
    }

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            async with client.stream(
                "POST", GROQ_URL, json=payload, headers=headers
            ) as resp:
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        return
                    try:
                        chunk = json.loads(data_str)
                    except json.JSONDecodeError:
                        continue
                    token = (
                        chunk.get("choices", [{}])[0]
                        .get("delta", {})
                        .get("content", "")
                    )
                    if token:
                        yield f"data: {json.dumps({'token': token})}\n\n"

    except httpx.ConnectError:
        yield f"data: {json.dumps({'token': _OFFLINE_MSG})}\n\n"
        yield f"data: {json.dumps({'done': True, 'error': 'groq_offline'})}\n\n"
    except httpx.TimeoutException:
        msg = "AI model timed out. Try again."
        yield f"data: {json.dumps({'token': msg})}\n\n"
        yield f"data: {json.dumps({'done': True, 'error': 'timeout'})}\n\n"
    except Exception as e:
        msg = f"AI model unavailable: {e}"
        yield f"data: {json.dumps({'token': msg})}\n\n"
        yield f"data: {json.dumps({'done': True, 'error': str(e)})}\n\n"


# ─── Base class ───────────────────────────────────────────────────────────────

class AgentBase:
    """
    Base class for all KAI agents.
    Uses Groq cloud API when available; all agents return structured results
    even when the model is offline. Subclasses implement:
        async def run(self, **kwargs) -> dict
        async def stream(self, **kwargs) -> AsyncIterator[str]
    """

    name:        str = "base"
    description: str = ""

    def __init__(self, model: str = GROQ_MODEL):
        self.model = model

    async def complete(self, prompt: str, system: str = "") -> str:
        return await groq_complete(prompt, system=system, model=self.model)

    async def stream_response(
        self, prompt: str, system: str = ""
    ) -> AsyncIterator[str]:
        async for chunk in groq_stream(prompt, system=system, model=self.model):
            yield chunk

    async def is_model_available(self) -> bool:
        return await groq_available()

    async def run(self, **kwargs) -> dict:
        raise NotImplementedError

    async def stream(self, **kwargs) -> AsyncIterator[str]:
        raise NotImplementedError
