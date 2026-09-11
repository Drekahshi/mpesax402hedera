/**
 * useVoiceChat.ts
 * React hook for KAI voice chat — mic recording, STT, TTS playback.
 *
 * Flow:
 *   1. startRecording()   → browser MediaRecorder captures mic → WebM/Opus
 *   2. stopRecording()    → blob sent to /agents/voice/transcribe (Groq Whisper)
 *   3. transcript text    → sent to /agents/voice/chat/stream
 *   4. stream yields:
 *        {type:'text', chunk}  → appended to responseText (for chat UI)
 *        {type:'audio', data}  → base64 MP3 chunks queued for playback
 *   5. Audio plays via Web Audio API (seamless streaming)
 *   6. onTranscript(text) callback fires with the transcribed text
 *   7. onResponse(text, audioBlob) callback fires when complete
 *
 * State machine:
 *   idle → recording → transcribing → thinking → speaking → idle
 *
 * Usage:
 *   const voice = useVoiceChat({ onTranscript, onResponse })
 *   <button onMouseDown={voice.startRecording} onMouseUp={voice.stopRecording} />
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type VoiceState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error';

export interface VoiceChatOptions {
  /** Fired when Whisper returns a transcript */
  onTranscript?: (text: string) => void;
  /** Fired when agent text + audio are both complete */
  onResponse?: (text: string) => void;
  /** Fired when any error occurs */
  onError?: (err: string) => void;
  /** KAI voice backend base URL (default: http://127.0.0.1:8000) */
  backendUrl?: string;
  /** edge-tts voice key (e.g. 'ava', 'andrew') or full voice name */
  voice?: string;
  /** Auto-play spoken response. Default true. */
  autoPlay?: boolean;
}

export interface VoiceChatReturn {
  state:           VoiceState;
  transcript:      string;
  responseText:    string;
  error:           string | null;
  isRecording:     boolean;
  isSpeaking:      boolean;
  startRecording:  () => Promise<void>;
  stopRecording:   () => Promise<void>;
  speakText:       (text: string) => Promise<void>;
  stopSpeaking:    () => void;
  reset:           () => void;
  recordingLevel:  number;   // 0–100 microphone volume level
}

// ── Voice name resolution ─────────────────────────────────────────────────────

const VOICE_MAP: Record<string, string> = {
  ava:    'en-US-AvaMultilingualNeural',
  andrew: 'en-US-AndrewMultilingualNeural',
  emma:   'en-US-EmmaMultilingualNeural',
  sonia:  'en-GB-SoniaNeural',
  ryan:   'en-GB-RyanNeural',
  jenny:  'en-US-JennyNeural',
  guy:    'en-US-GuyNeural',
};

function resolveVoice(voice?: string): string {
  if (!voice) return 'en-US-AvaMultilingualNeural';
  return VOICE_MAP[voice.toLowerCase()] ?? voice;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVoiceChat(options: VoiceChatOptions = {}): VoiceChatReturn {
  const {
    onTranscript,
    onResponse,
    onError,
    backendUrl = 'http://127.0.0.1:8000',
    voice,
    autoPlay = true,
  } = options;

  const [state,        setState]       = useState<VoiceState>('idle');
  const [transcript,   setTranscript]  = useState('');
  const [responseText, setResponseText]= useState('');
  const [error,        setError]       = useState<string | null>(null);
  const [recLevel,     setRecLevel]    = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const audioContextRef  = useRef<AudioContext | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const audioQueueRef    = useRef<ArrayBuffer[]>([]);
  const isPlayingRef     = useRef(false);
  const animFrameRef     = useRef<number>(0);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioContextRef.current?.close();
    };
  }, []);

  const _setError = useCallback((msg: string) => {
    setError(msg);
    setState('error');
    onError?.(msg);
  }, [onError]);

  const reset = useCallback(() => {
    setState('idle');
    setTranscript('');
    setResponseText('');
    setError(null);
    setRecLevel(0);
    stopSpeaking();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mic level meter ───────────────────────────────────────────────────────

  const _startMicMeter = useCallback((stream: MediaStream) => {
    const ctx      = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);
    audioContextRef.current = ctx;
    analyserRef.current     = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setRecLevel(Math.round((avg / 255) * 100));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const _stopMicMeter = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setRecLevel(0);
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current     = null;
  }, []);

  // ── Recording ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (state === 'recording') return;
    setError(null);
    setTranscript('');
    setResponseText('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current  = stream;
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100); // collect every 100ms
      setState('recording');
      _startMicMeter(stream);
    } catch (e: unknown) {
      _setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow mic access and try again.'
          : `Could not start recording: ${e instanceof Error ? e.message : e}`,
      );
    }
  }, [state, _startMicMeter, _setError]);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || state !== 'recording') return;

    _stopMicMeter();
    streamRef.current?.getTracks().forEach(t => t.stop());

    await new Promise<void>(resolve => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
    if (blob.size < 1000) {
      _setError('Recording too short — please hold the button and speak.');
      return;
    }

    setState('transcribing');

    try {
      const form = new FormData();
      const ext  = recorder.mimeType.includes('ogg') ? 'ogg' : 'webm';
      form.append('file', blob, `recording.${ext}`);

      const res = await fetch(`${backendUrl}/agents/voice/transcribe`, {
        method: 'POST',
        body:   form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `STT API ${res.status}`);
      }

      const data = await res.json();
      const text = (data.text || '').trim();

      if (!text) {
        _setError('Could not hear anything — please try again.');
        return;
      }

      setTranscript(text);
      onTranscript?.(text);

      // Kick off agent + TTS
      await _sendVoiceChat(text);
    } catch (e: unknown) {
      _setError(`Transcription failed: ${e instanceof Error ? e.message : e}`);
    }
  }, [state, backendUrl, onTranscript, _stopMicMeter, _setError]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Agent + TTS stream ────────────────────────────────────────────────────

  const _sendVoiceChat = useCallback(async (text: string) => {
    setState('thinking');
    setResponseText('');
    audioQueueRef.current = [];
    isPlayingRef.current  = false;

    try {
      const res = await fetch(`${backendUrl}/agents/voice/chat/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, voice: resolveVoice(voice) }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Voice chat API ${res.status}`);
      }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf = '';
      let fullText = '';
      let hasAudio = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const evt = JSON.parse(line.slice(5).trim());

            if (evt.type === 'text' && evt.chunk) {
              fullText += evt.chunk;
              setResponseText(fullText);
              if (state !== 'speaking') setState('thinking');
            }

            if (evt.type === 'audio' && evt.data && autoPlay) {
              // Decode base64 MP3 chunk and queue for playback
              const binary = atob(evt.data);
              const bytes  = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              audioQueueRef.current.push(bytes.buffer);
              hasAudio = true;

              if (!isPlayingRef.current) {
                setState('speaking');
                _drainAudioQueue();
              }
            }

            if (evt.type === 'done') {
              onResponse?.(fullText);
              if (!hasAudio) setState('idle');
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch (e: unknown) {
      _setError(`Voice chat failed: ${e instanceof Error ? e.message : e}`);
    }
  }, [backendUrl, voice, autoPlay, onResponse, _setError]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Web Audio playback queue ──────────────────────────────────────────────

  const _drainAudioQueue = useCallback(async () => {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;

    // Lazy-create a playback AudioContext (separate from the recording one)
    let playCtx: AudioContext;
    try {
      playCtx = new AudioContext();
    } catch {
      isPlayingRef.current = false;
      return;
    }

    // Collect all queued chunks, then decode + play as one buffer
    // (polling loop: wait up to 8s for more chunks to arrive)
    let waited = 0;
    while (waited < 8000) {
      if (audioQueueRef.current.length > 0) {
        // Concatenate all pending chunks
        const chunks  = audioQueueRef.current.splice(0);
        const total   = chunks.reduce((s, b) => s + b.byteLength, 0);
        const concat  = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          concat.set(new Uint8Array(c), offset);
          offset += c.byteLength;
        }

        try {
          const decoded = await playCtx.decodeAudioData(concat.buffer);
          const source  = playCtx.createBufferSource();
          source.buffer = decoded;
          source.connect(playCtx.destination);
          currentSourceRef.current = source;

          await new Promise<void>(resolve => {
            source.onended = () => resolve();
            source.start(0);
          });
        } catch {
          // Chunk decode failed — skip (MP3 fragments may be incomplete)
        }

        waited = 0; // reset wait if we just played something
      } else {
        await new Promise(r => setTimeout(r, 80));
        waited += 80;
      }
    }

    isPlayingRef.current = false;
    await playCtx.close().catch(() => {});
    setState('idle');
  }, []);

  // ── Speak arbitrary text ──────────────────────────────────────────────────

  const speakText = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setState('speaking');
    try {
      const res = await fetch(`${backendUrl}/agents/voice/speak/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, voice: resolveVoice(voice) }),
      });
      if (!res.ok || !res.body) throw new Error(`TTS ${res.status}`);

      const reader  = res.body.getReader();
      const playCtx = new AudioContext();
      let buf = new Uint8Array(0);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Accumulate MP3 bytes
        const merged = new Uint8Array(buf.length + value.length);
        merged.set(buf);
        merged.set(value, buf.length);
        buf = merged;
      }

      if (buf.length > 0) {
        const decoded = await playCtx.decodeAudioData(buf.buffer);
        const source  = playCtx.createBufferSource();
        source.buffer = decoded;
        source.connect(playCtx.destination);
        currentSourceRef.current = source;
        await new Promise<void>(r => { source.onended = () => r(); source.start(0); });
        await playCtx.close().catch(() => {});
      }
    } catch (e: unknown) {
      _setError(`TTS failed: ${e instanceof Error ? e.message : e}`);
      return;
    }
    setState('idle');
  }, [backendUrl, voice, _setError]);

  const stopSpeaking = useCallback(() => {
    currentSourceRef.current?.stop();
    currentSourceRef.current = null;
    audioQueueRef.current    = [];
    isPlayingRef.current     = false;
    if (state === 'speaking') setState('idle');
  }, [state]);

  return {
    state,
    transcript,
    responseText,
    error,
    isRecording: state === 'recording',
    isSpeaking:  state === 'speaking',
    startRecording,
    stopRecording,
    speakText,
    stopSpeaking,
    reset,
    recordingLevel: recLevel,
  };
}
