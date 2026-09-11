"use client";
import { Terminal, Activity } from "lucide-react";
import { useEffect, useRef } from "react";

export type LogMessage = {
  time: string;
  type: "request" | "response" | "info" | "success" | "error";
  content: string;
};

export default function X402Terminal({ logs }: { logs: LogMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div style={{ background: "#0D2B1F", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "16px", padding: "16px", height: "300px", display: "flex", flexDirection: "column", fontFamily: "monospace" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "12px" }}>
        <Terminal color="#22C55E" size={16} />
        <span style={{ color: "#22C55E", fontSize: "12px", fontWeight: "bold" }}>x402 Protocol Terminal (Live)</span>
        <Activity color="#22C55E" size={16} style={{ marginLeft: "auto", animation: "pulse-gold 2s infinite" }} />
      </div>
      
      <div style={{ flex: 1, overflowY: "auto", fontSize: "11px", display: "flex", flexDirection: "column", gap: "6px" }}>
        {logs.length === 0 && (
          <span style={{ color: "rgba(255,255,255,0.3)" }}>Waiting for HTTP 402 triggers...</span>
        )}
        {logs.map((log, i) => (
          <div key={i} style={{ display: "flex", gap: "8px" }}>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>[{log.time}]</span>
            <span style={{ 
              color: 
                log.type === "request" ? "#FDE047" : 
                log.type === "response" ? "#3B82F6" : 
                log.type === "error" ? "#EF4444" :
                log.type === "success" ? "#22C55E" : "rgba(255,255,255,0.8)"
            }}>
              {log.content}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
