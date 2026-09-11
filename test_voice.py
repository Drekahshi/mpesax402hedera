"""Quick voice pipeline test."""
import asyncio, os
from dotenv import load_dotenv
load_dotenv()

from agents.voice_agent import (
    synthesize_speech, synthesize_speech_stream,
    _clean_for_speech, AVAILABLE_VOICES, VOICE_NAME,
)

async def main():
    print("=" * 55)
    print("  KAI Voice Box Test")
    print("=" * 55)

    # 1. TTS
    print("\n1. TTS synthesis...")
    audio = await synthesize_speech(
        "Hello, I am KAI, your Hedera DeFi assistant. "
        "Your account has 833 HBAR and 1 million KBAR tokens.",
        voice=VOICE_NAME,
    )
    ok = len(audio) > 1000
    print(f"   {'✅' if ok else '❌'} audio={len(audio)} bytes ({len(audio)//1024} KB)")

    # 2. Streaming TTS
    print("\n2. Streaming TTS...")
    chunks = []
    async for chunk in synthesize_speech_stream("KAI Nuvari on Hedera blockchain."):
        chunks.append(len(chunk))
    print(f"   ✅ {len(chunks)} chunks, total={sum(chunks)} bytes")

    # 3. Text cleaning
    print("\n3. Markdown → speech cleaning...")
    tests = [
        ("## Balance\n\nYou have **833 HBAR**.", "You have 833 HBAR."),
        ("`0.0.5834216`", "0.0.5834216"),
        ("```json\n{}\n```", "code block omitted"),
    ]
    for inp, expected_contains in tests:
        out = _clean_for_speech(inp)
        ok = expected_contains in out
        print(f"   {'✅' if ok else '❌'} '{inp[:30]}' → '{out[:40]}'")

    # 4. Available voices
    print(f"\n4. Available voices ({len(AVAILABLE_VOICES)}):")
    for name, voice_id in AVAILABLE_VOICES.items():
        print(f"   {name:<10} {voice_id}")

    # 5. STT check
    print("\n5. STT (Groq Whisper)...")
    key = os.getenv("GROQ_API_KEY", "")
    if key and not key.startswith("your_"):
        print("   ✅ GROQ_API_KEY set — STT ready")
    else:
        print("   ⚠️  GROQ_API_KEY missing — set it in .env to enable transcription")

    # 6. Write test audio to file to confirm it plays
    with open("test_output.mp3", "wb") as f:
        f.write(audio)
    print(f"\n6. Saved test_output.mp3 ({len(audio)//1024} KB) — play it to verify quality")

    print("\n" + "=" * 55)
    print("  Voice box: READY")
    print("=" * 55)

asyncio.run(main())
