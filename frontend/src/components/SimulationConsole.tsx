"use client";
import { Play, FastForward, Pause } from "lucide-react";

export default function SimulationConsole({ isPlaying, onTogglePlay, onFastForward }: { isPlaying: boolean, onTogglePlay: () => void, onFastForward: () => void }) {
  return (
    <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: "24px", padding: "12px", display: "flex", gap: "12px", alignItems: "center", justifyContent: "center", marginBottom: "20px", border: "1px solid rgba(255,215,0,0.2)" }}>
      <button 
        onClick={onTogglePlay}
        style={{ 
          background: isPlaying ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)", 
          border: isPlaying ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(34, 197, 94, 0.4)",
          color: isPlaying ? "#EF4444" : "#22C55E",
          padding: "10px 20px", borderRadius: "16px", display: "flex", gap: "8px", alignItems: "center", cursor: "pointer", fontWeight: "bold"
        }}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        {isPlaying ? "Pause Sim" : "Auto Sim"}
      </button>

      <button 
        onClick={onFastForward}
        className="btn-gold"
        style={{ 
          padding: "10px 20px", borderRadius: "16px", display: "flex", gap: "8px", alignItems: "center", cursor: "pointer"
        }}
      >
        <FastForward size={18} />
        Fast Forward Time (1 Cycle)
      </button>
    </div>
  );
}
