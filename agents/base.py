"""
agents/base.py
Shared utilities for all KAI agents.
Uses Google Gemini API with fallback to Groq or on-device Needle.
"""

from __future__ import annotations
import os
import json
import asyncio
from typing import AsyncIterator, Any
import httpx
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL     = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_URL       = "https://api.groq.com/openai/v1/chat/completions"
TIMEOUT        = 60.0

_OFFLINE_MSG = (
    "The AI model is currently unavailable. "
    "Check your GEMINI_API_KEY in .env.\n"
    "All other agent features continue to work without it."
)


# ─── Availability probe ───────────────────────────────────────────────────────

async def gemini_available() -> bool:
    """Return True if Gemini API key is set and reachable."""
    if not GEMINI_API_KEY:
        return False
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
        payload = {"contents": [{"parts": [{"text": "ping"}]}]}
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(url, json=payload)
            return r.status_code == 200
    except Exception:
        return False


async def groq_available() -> bool:
    """Return True if Gemini or Groq API key is set and reachable."""
    if GEMINI_API_KEY:
        return await gemini_available()
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

async def gemini_complete(
    prompt: str,
    system: str = "",
    model: str = GEMINI_MODEL,
) -> str:
    """Complete prompt using Google Gemini API."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
    contents = []
    if system:
        contents.append({"role": "user", "parts": [{"text": f"System Instructions: {system}"}]})
        contents.append({"role": "model", "parts": [{"text": "Understood. I will follow these instructions."}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 2048,
        }
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()

async def groq_complete(
    prompt: str,
    system: str = "",
    model: str = GROQ_MODEL,
) -> str:
    """
    Single blocking-style completion via Groq (OpenAI-compatible API).
    Falls back to on-device Needle 2 when GROQ_API_KEY is not set or offline.
    """
    if not GROQ_API_KEY:
        try:
            from agents.needle_harness import get_needle_harness
            h = get_needle_harness()
            res = h.run(prompt)
            if res.get("text"):
                return res["text"]
            if res.get("results"):
                return json.dumps(res["results"], indent=2)
        except Exception as err:
            return f"Needle on-device response: {err}"
        return _OFFLINE_MSG

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
    except Exception:
        # Fall back to Needle
        try:
            from agents.needle_harness import get_needle_harness
            h = get_needle_harness()
            res = h.run(prompt)
            if res.get("text"):
                return res["text"]
            if res.get("results"):
                return json.dumps(res["results"], indent=2)
        except Exception:
            pass
        return _OFFLINE_MSG


async def groq_stream(
    prompt: str,
    system: str = "",
    model: str = GROQ_MODEL,
) -> AsyncIterator[str]:
    """
    Stream tokens from Groq as SSE lines.
    Falls back to on-device Needle 2 when GROQ_API_KEY is not set or offline.
    """
    if not GROQ_API_KEY:
        try:
            from agents.needle_harness import get_needle_harness
            h = get_needle_harness()
            res = h.run(prompt)
            text = res.get("text")
            if not text and res.get("results"):
                text = json.dumps(res["results"], indent=2)
            elif not text:
                text = f"Query processed via on-device Needle 2 engine."
            for w in text.split(" "):
                yield f"data: {json.dumps({'token': w + ' '})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return
        except Exception as e:
            yield f"data: {json.dumps({'token': f'Needle on-device error: {e}'})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return

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

    except Exception:
        try:
            from agents.needle_harness import get_needle_harness
            h = get_needle_harness()
            res = h.run(prompt)
            text = res.get("text") or json.dumps(res.get("results", []), indent=2)
            for w in text.split(" "):
                yield f"data: {json.dumps({'token': w + ' '})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'token': _OFFLINE_MSG})}\n\n"
            yield f"data: {json.dumps({'done': True, 'error': 'groq_offline'})}\n\n"
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
