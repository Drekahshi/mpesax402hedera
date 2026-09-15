'use client';

/**
 * VoiceButton.tsx
 * Push-to-talk mic button + voice status indicator for the KAI chat page.
 *
 * Usage:
 *   <VoiceButton
 *     onTranscript={(text) => setInput(text)}
 *     onResponse={(text) => appendMessage(text)}
 *     backendUrl="http://127.0.0.1:8000"
 *     voice="ava"
 *   />
 *
 * Push and hold to record. Release to transcribe + get spoken response.
 * Click once (tap) to toggle continuous recording mode.
 */

import { useCallback, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, Loader2, X } from 'lucide-react';
import { useVoiceChat, type VoiceState } from '@/hooks/useVoiceChat';

interface VoiceButtonProps {
  onTranscript?: (text: string) => void;
  onResponse?:   (text: string) => void;
  backendUrl?:   string;
  voice?:        string;
  /** If true, show a full voice panel with transcript + response text */
  showPanel?:    boolean;
}

// ── State → display ───────────────────────────────────────────────────────────

const STATE_CONFIG: Record<VoiceState, {
  color:  string;
  bg:     string;
  border: string;
  icon:   React.ReactNode;
  label:  string;
  pulse:  boolean;
}> = {
  idle:         { color: '#10b981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.35)', icon: <Mic size={18} />,                        label: 'Hold to talk',    pulse: false },
  recording:    { color: '#f87171', bg: 'rgba(248,113,113,0.18)', border: 'rgba(248,113,113,0.60)', icon: <Mic size={18} />,                       label: 'Recording…',      pulse: true  },
  transcribing: { color: '#fbbf24', bg: 'rgba(251,191,36,0.14)',  border: 'rgba(251,191,36,0.45)', icon: <Loader2 size={18} className="spin" />,   label: 'Transcribing…',   pulse: false },
  thinking:     { color: '#a78bfa', bg: 'rgba(167,139,250,0.14)', border: 'rgba(167,139,250,0.45)', icon: <Loader2 size={18} className="spin" />,  label: 'KAI thinking…',   pulse: false },
  speaking:     { color: '#63b3ed', bg: 'rgba(99,179,237,0.14)',  border: 'rgba(99,179,237,0.45)', icon: <Volume2 size={18} />,                    label: 'KAI speaking…',   pulse: true  },
  error:        { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.40)', icon: <MicOff size={18} />,                    label: 'Error',           pulse: false },
};

// ── MicRing — animated level meter ────────────────────────────────────────────

function MicRing({ level, active, color }: { level: number; active: boolean; color: string }) {
  const scale = 1 + (level / 100) * 0.4;
  return (
    <div style={{
      position:  'absolute',
      inset:     -4,
      borderRadius: '50%',
      border:    `2px solid ${color}`,
      opacity:   active ? 0.6 + (level / 100) * 0.4 : 0,
      transform: `scale(${active ? scale : 1})`,
      transition: 'transform 0.08s ease-out, opacity 0.15s',
      pointerEvents: 'none',
    }} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VoiceButton({
  onTranscript,
  onResponse,
  backendUrl = 'http://127.0.0.1:8000',
  voice = 'ava',
  showPanel = true,
}: VoiceButtonProps) {
  const [panelOpen, setPanelOpen]     = useState(false);
  const holdTimerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHoldRef                    = useRef(false);

  const {
    state, transcript, responseText, error,
    isRecording, isSpeaking,
    startRecording, stopRecording,
    stopSpeaking, reset,
    recordingLevel,
  } = useVoiceChat({
    onTranscript: (text) => { onTranscript?.(text); },
    onResponse:   (text) => { onResponse?.(text); },
    backendUrl,
    voice,
    autoPlay: true,
  });

  const cfg = STATE_CONFIG[state];
  const busy = state !== 'idle' && state !== 'error';

  // ── Hold-to-talk logic ────────────────────────────────────────────────────
  const handlePointerDown = useCallback(() => {
    if (busy && state !== 'recording') return;
    didHoldRef.current = false;

    holdTimerRef.current = setTimeout(async () => {
      didHoldRef.current = true;
      await startRecording();
    }, 120); // 120ms hold threshold
  }, [busy, state, startRecording]);

  const handlePointerUp = useCallback(async () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (didHoldRef.current && isRecording) {
      // Was holding — stop recording
      await stopRecording();
    } else if (!didHoldRef.current) {
      // Quick tap
      if (isSpeaking) {
        stopSpeaking();
      } else if (state === 'error') {
        reset();
      } else if (!busy) {
        // Short tap = toggle panel
        setPanelOpen(v => !v);
      }
    }
    didHoldRef.current = false;
  }, [isRecording, isSpeaking, busy, state, stopRecording, stopSpeaking, reset]);

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>

      {/* ── Main mic button ── */}
      <div style={{ position: 'relative' }}>
        <button
          aria-label={cfg.label}
          title={cfg.label}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}  // release if pointer leaves button
          style={{
            width:  44,
            height: 44,
            borderRadius: '50%',
            border: `2px solid ${cfg.border}`,
            background: cfg.bg,
            color:   cfg.color,
            cursor:  'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.18s',
            flexShrink: 0,
            position: 'relative',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            animation: cfg.pulse ? 'voice-pulse 1.2s ease-in-out infinite' : 'none',
            boxShadow: isRecording
              ? `0 0 0 0 ${cfg.color}40, 0 4px 16px ${cfg.color}30`
              : isSpeaking
                ? `0 0 12px ${cfg.color}40`
                : 'none',
          }}
        >
          {cfg.icon}
        </button>

        {/* Level ring (recording only) */}
        <MicRing level={recordingLevel} active={isRecording} color={cfg.color} />
      </div>

      {/* ── Status label ── */}
      {(busy || state === 'error') && (
        <span style={{
          marginTop:  5,
          fontSize:   9,
          fontWeight: 700,
          color:      cfg.color,
          whiteSpace: 'nowrap',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          animation:  cfg.pulse ? 'voice-fade 1.2s ease-in-out infinite' : 'none',
        }}>
          {cfg.label}
        </span>
      )}

      {/* ── Voice panel ── */}
      {showPanel && panelOpen && (
        <div style={{
          position: 'absolute',
          bottom:   56,
          right:    0,
          width:    300,
          borderRadius: 18,
          background: '#0d1a14',
          border: '1px solid rgba(16,185,129,0.25)',
          boxShadow: '0 16px 60px rgba(0,0,0,0.70)',
          padding: 16,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {/* Panel header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(16,185,129,0.15)',
                border: '1px solid rgba(16,185,129,0.30)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Mic size={13} color="#10b981" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#f0fdf4' }}>KAI Voice</span>
              <span style={{
                fontSize: 9, fontWeight: 700, color: cfg.color,
                background: cfg.bg, border: `1px solid ${cfg.border}`,
                borderRadius: 5, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: 0.6,
              }}>{state}</span>
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 4, borderRadius: 6 }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Hedera account id — needed for "buy NFT #x" voice purchases */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 9, fontWeight: 700, color: 'rgba(240,253,244,0.45)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Your Hedera account (for NFT purchases)
            </label>
            <input
              type="text"
              placeholder="0.0.xxxxxx"
              defaultValue={typeof window !== 'undefined' ? localStorage.getItem('kai_hedera_account_id') ?? '' : ''}
              onChange={(e) => {
                if (typeof window === 'undefined') return;
                const v = e.target.value.trim();
                if (v) localStorage.setItem('kai_hedera_account_id', v);
                else localStorage.removeItem('kai_hedera_account_id');
              }}
              style={{
                fontSize: 12, padding: '7px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(16,185,129,0.20)',
                color: '#f0fdf4', outline: 'none',
              }}
            />
          </div>

          {/* Instruction */}
          {state === 'idle' && !transcript && (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(16,185,129,0.05)',
              border: '1px solid rgba(16,185,129,0.15)',
            }}>
              <p style={{ fontSize: 11, color: 'rgba(240,253,244,0.60)', margin: 0, lineHeight: 1.6 }}>
                <strong style={{ color: '#86efac' }}>Hold</strong> the mic button to record.<br />
                <strong style={{ color: '#86efac' }}>Release</strong> to send to KAI.<br />
                <strong style={{ color: '#86efac' }}>Tap</strong> once to stop KAI speaking.
              </p>
            </div>
          )}

          {/* Recording level bar */}
          {isRecording && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ margin: 0, fontSize: 10, color: '#f87171', fontWeight: 700 }}>🔴 Recording…</p>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width:  `${recordingLevel}%`,
                  background: `linear-gradient(90deg, #f87171, #fb923c)`,
                  borderRadius: 3,
                  transition: 'width 0.08s ease-out',
                }} />
              </div>
            </div>
          )}

          {/* Transcript */}
          {transcript && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.8 }}>You said</p>
              <div style={{
                padding: '9px 12px', borderRadius: 10,
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.20)',
                fontSize: 13, color: '#f0fdf4', lineHeight: 1.5,
              }}>
                {transcript}
              </div>
            </div>
          )}

          {/* Response */}
          {responseText && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                KAI {isSpeaking ? '🔊 speaking…' : ''}
              </p>
              <div style={{
                padding: '9px 12px', borderRadius: 10,
                background: 'rgba(0,0,0,0.30)',
                border: '1px solid rgba(16,185,129,0.15)',
                fontSize: 12, color: 'rgba(240,253,244,0.80)', lineHeight: 1.6,
                maxHeight: 120, overflowY: 'auto',
              }}>
                {responseText}
              </div>
              {isSpeaking && (
                <button
                  onClick={stopSpeaking}
                  style={{
                    alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 7,
                    background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.30)',
                    color: '#f87171', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <X size={10} /> Stop
                </button>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: '9px 12px', borderRadius: 10,
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.25)',
              fontSize: 11, color: '#fca5a5', lineHeight: 1.5,
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <MicOff size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
              <button
                onClick={reset}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', flexShrink: 0 }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Voice selector */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['ava','andrew','emma','sonia'].map(v => (
              <span key={v} style={{
                padding: '3px 8px', borderRadius: 6,
                background: voice === v ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.05)',
                border: voice === v ? '1px solid rgba(16,185,129,0.40)' : '1px solid rgba(255,255,255,0.08)',
                color: voice === v ? '#86efac' : 'rgba(255,255,255,0.35)',
                fontSize: 10, fontWeight: 700, textTransform: 'capitalize',
                cursor: 'default',
              }}>{v}</span>
            ))}
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', alignSelf: 'center', marginLeft: 2 }}>
              pass voice= prop to change
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes voice-pulse {
          0%,100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
          50%      { box-shadow: 0 0 0 6px transparent; opacity: 0.85; }
        }
        @keyframes voice-fade {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.55; }
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
