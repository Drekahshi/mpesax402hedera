"use client";
import { Lock, ArrowRight } from "lucide-react";

export default function PensionCard({ balance, overflowReceived }: { balance: number, overflowReceived: number }) {
  return (
    <div className="glass" style={{ padding: "20px", borderRadius: "16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ background: "rgba(167, 139, 250, 0.2)", padding: "10px", borderRadius: "50%" }}>
            <Lock color="#A78BFA" size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: "#A78BFA" }}>KAI Flexible Pension</h3>
            <p style={{ margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>Lock-conditioned Compounding</p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "12px" }}>
        <div>
          <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>Pension Balance</p>
          <p style={{ margin: 0, fontSize: "18px", fontWeight: "bold", color: "#fff" }}>{balance.toFixed(4)} ETH</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>Auto-Routed Yield</p>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: "bold", color: "#A78BFA" }}>+{overflowReceived.toFixed(4)} ETH</p>
        </div>
      </div>

      <div style={{ padding: "12px", background: "rgba(255,255,255,0.05)", borderRadius: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>Progress to Next Milestone</span>
          <span style={{ fontSize: "11px", color: "#fff", fontWeight: "bold" }}>{Math.min((balance / 100) * 100, 100).toFixed(0)}%</span>
        </div>
        <div style={{ height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min((balance / 100) * 100, 100)}%`, background: "linear-gradient(90deg, #8B5CF6, #A78BFA)", transition: "width 0.5s ease" }}></div>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>Milestone: 0.1 ETH (Triggers Trust Sweep)</p>
      </div>
    </div>
  );
}
