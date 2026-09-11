"""
agents/voice_agent.py
Voice box for KAI Nuvari — Speech-to-Text + Text-to-Speech pipeline.

Architecture:
    Browser mic → WebM/Opus audio → POST /agents/voice/transcribe
                                        → Groq Whisper STT → text
    text → POST /agents/voice/speak    → edge-tts → MP3 audio bytes
    text → POST /agents/voice/chat     → KAI agent → answer text
                                        → edge-tts → streaming MP3

STT:  Groq Whisper API  (cloud, fast, same key already in .env)
TTS:  edge-tts          (Microsoft Edge TTS, no API key, high quality)
      Voice: en-US-AvaMultilingualNeural  (warm, natural, default)
      Fallback voices: en-US-AndrewNeural, en-GB-SoniaNeural

Env vars:
    GROQ_API_KEY   — for Whisper transcription
    VOICE_NAME     — edge-tts voice (default: en-US-AvaMultilingualNeural)
    VOICE_RATE     — speech rate e.g. '+10%' faster, '-10%' slower (default '+0%')
    VOICE_PITCH    — pitch e.g. '+5Hz' (default '+0Hz')
"""

from __future__ import annotations
import os
import io
import json
import asyncio
import tempfile
import time
from typing import AsyncIterator
import httpx
import edge_tts
from dotenv import load_dotenv
from .base import AgentBase, groq_complete, groq_stream

load_dotenv()

# ── TTS config ────────────────────────────────────────────────────────────────

VOICE_NAME  = os.getenv("VOICE_NAME",  "en-US-AvaMultilingualNeural")
VOICE_RATE  = os.getenv("VOICE_RATE",  "+0%")
VOICE_PITCH = os.getenv("VOICE_PITCH", "+0Hz")

# Available voices (KAI-curated selection)
AVAILABLE_VOICES = {
    "ava":    "en-US-AvaMultilingualNeural",      # warm, professional (default)
    "andrew": "en-US-AndrewMultilingualNeural",   # calm, measured
    "emma":   "en-US-EmmaMultilingualNeural",     # friendly, energetic
    "sonia":  "en-GB-SoniaNeural",                # British, clear
    "ryan":   "en-GB-RyanNeural",                 # British male
    "jenny":  "en-US-JennyNeural",                # US female, warm
    "guy":    "en-US-GuyNeural",                  # US male, deep
}

# ── STT (Groq Whisper) ────────────────────────────────────────────────────────

GROQ_API_KEY  = os.getenv("GROQ_API_KEY", "")
GROQ_STT_URL  = "https://api.groq.com/openai/v1/audio/transcriptions"
WHISPER_MODEL = "whisper-large-v3-turbo"   # fastest Groq Whisper model

STT_SYSTEM = """You are transcribing voice input for KAI Nuvari — a DeFi and 
conservation finance assistant on Hedera blockchain. The user may ask about 
HBAR, KBAR, HTS tokens, conservation NFTs, x402 payments, or DeFi operations.
Transcribe accurately, preserving blockchain terms like account IDs (0.0.XXXXX),
token names, and financial figures."""


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    Transcribe audio bytes using Groq Whisper API.
    Accepts WebM, MP3, WAV, M4A, OGG. Returns transcribed text.
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not set — cannot transcribe audio")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            GROQ_STT_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            files={"file": (filename, audio_bytes, _mime_type(filename))},
            data={
                "model":           WHISPER_MODEL,
                "language":        "en",
                "response_format": "json",
                "prompt":          "KAI Nuvari, HBAR, KBAR, Hedera, HTS, NFT, DeFi, x402",
            },
        )
        resp.raise_for_status()
        result = resp.json()
        return result.get("text", "").strip()


def _mime_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    return {
        "webm": "audio/webm",
        "mp3":  "audio/mpeg",
        "wav":  "audio/wav",
        "m4a":  "audio/mp4",
        "ogg":  "audio/ogg",
        "flac": "audio/flac",
    }.get(ext, "audio/webm")


# ── TTS (edge-tts) ────────────────────────────────────────────────────────────

async def synthesize_speech(
    text:   str,
    voice:  str | None = None,
    rate:   str | None = None,
    pitch:  str | None = None,
) -> bytes:
    """
    Synthesize text to speech using edge-tts.
    Returns MP3 audio bytes ready to stream to the browser.
    """
    voice = voice or VOICE_NAME
    rate  = rate  or VOICE_RATE
    pitch = pitch or VOICE_PITCH

    communicate = edge_tts.Communicate(text, voice=voice, rate=rate, pitch=pitch)

    audio = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.write(chunk["data"])

    audio.seek(0)
    return audio.read()


async def synthesize_speech_stream(
    text:  str,
    voice: str | None = None,
    rate:  str | None = None,
    pitch: str | None = None,
) -> AsyncIterator[bytes]:
    """
    Streaming TTS — yields MP3 chunks as they are generated.
    Use this for long responses to reduce time-to-first-audio.
    """
    voice = voice or VOICE_NAME
    rate  = rate  or VOICE_RATE
    pitch = pitch or VOICE_PITCH

    communicate = edge_tts.Communicate(text, voice=voice, rate=rate, pitch=pitch)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]


def _clean_for_speech(text: str) -> str:
    """
    Strip markdown and code blocks from agent responses before TTS.
    Keeps the spoken output natural.
    """
    import re
    # Remove code fences
    text = re.sub(r"```[\s\S]*?```", "code block omitted", text)
    text = re.sub(r"`[^`]+`", lambda m: m.group(0)[1:-1], text)
    # Remove markdown headers
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # Remove bold/italic markers
    text = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,3}([^_]+)_{1,3}", r"\1", text)
    # Collapse multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Trim
    return text.strip()


# ── Voice chat pipeline ───────────────────────────────────────────────────────

VOICE_SYSTEM = """You are KAI — the voice assistant for KAI Nuvari, an 
AI-native DeFi and conservation finance platform on Hedera blockchain.

You are speaking to the user directly via voice. Keep your responses:
- Concise: 1–3 sentences unless detail is specifically needed
- Conversational: no markdown, no bullet lists, no code blocks  
- Actionable: tell the user what they can do, not just facts
- Warm: you're a knowledgeable companion, not a database

If the user asks about HBAR balances, KBAR tokens, NFTs, x402 payments,
conservation events, or Hedera transactions — give a clear spoken answer.
Numbers should be spoken naturally: say "833 HBAR" not "833.147794900".
"""


class VoiceAgent(AgentBase):
    """
    KAI Voice Agent — converts voice to text, processes with KAI agent,
    returns spoken audio response.
    """

    name        = "voice"
    description = "Voice interface: STT → KAI agent → TTS"

    async def transcribe(self, audio_bytes: bytes, filename: str = "audio.webm") -> str:
        """Transcribe audio to text via Groq Whisper."""
        return await transcribe_audio(audio_bytes, filename)

    async def speak(self, text: str, voice: str | None = None) -> bytes:
        """Convert text to MP3 audio via edge-tts."""
        clean = _clean_for_speech(text)
        return await synthesize_speech(clean, voice=voice)

    async def speak_stream(
        self,
        text: str,
        voice: str | None = None,
    ) -> AsyncIterator[bytes]:
        """Streaming TTS — yields audio chunks."""
        clean = _clean_for_speech(text)
        async for chunk in synthesize_speech_stream(clean, voice=voice):
            yield chunk

    async def voice_chat(
        self,
        text: str,
        voice: str | None = None,
    ) -> dict:
        """
        Full voice chat round-trip:
            user text → KAI agent response → TTS audio bytes

        Returns {text, audio_b64, audio_bytes_len, voice, duration_ms}
        """
        import base64
        t0 = time.time()

        # Get KAI's text response
        response_text = await groq_complete(
            prompt=text,
            system=VOICE_SYSTEM,
        )

        # Synthesize to speech
        audio_bytes = await self.speak(response_text, voice=voice)

        duration_ms = int((time.time() - t0) * 1000)

        return {
            "input":         text,
            "text":          response_text,
            "audio_b64":     base64.b64encode(audio_bytes).decode("ascii"),
            "audio_bytes":   len(audio_bytes),
            "content_type":  "audio/mpeg",
            "voice":         voice or VOICE_NAME,
            "duration_ms":   duration_ms,
        }

    async def voice_chat_stream(
        self,
        text: str,
        voice: str | None = None,
    ) -> AsyncIterator[str]:
        """
        Streaming voice chat — yields SSE events:
            {type: 'text', chunk: '...'} as Groq streams the response
            {type: 'audio', data: '<base64 MP3 chunk>'} as TTS streams
            {type: 'done'}
        """
        import base64

        # Collect the full text while streaming tokens
        full_text = []

        async for sse_line in groq_stream(text, system=VOICE_SYSTEM):
            if not sse_line.startswith("data: "):
                continue
            payload = json.loads(sse_line[6:])
            if payload.get("done"):
                break
            token = payload.get("token", "")
            if token:
                full_text.append(token)
                yield f"data: {json.dumps({'type': 'text', 'chunk': token})}\n\n"

        full_response = _clean_for_speech("".join(full_text))

        # Stream TTS audio chunks
        try:
            async for audio_chunk in synthesize_speech_stream(full_response, voice=voice):
                b64 = base64.b64encode(audio_chunk).decode("ascii")
                yield f"data: {json.dumps({'type': 'audio', 'data': b64})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'tts_error', 'error': str(e)})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'voice': voice or VOICE_NAME})}\n\n"

    async def run(self, text: str = "", **kwargs) -> dict:
        return await self.voice_chat(text)

    async def stream(self, text: str = "", **kwargs) -> AsyncIterator[str]:
        async for chunk in self.voice_chat_stream(text):
            yield chunk


# ── Singleton ─────────────────────────────────────────────────────────────────

voice_agent = VoiceAgent()
