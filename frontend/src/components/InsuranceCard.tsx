"use client";
import { ShieldAlert, ShieldCheck } from "lucide-react";

export default function InsuranceCard({ active, nextPremiumAmount, automatePremium, onToggleAutomate }: { active: boolean, nextPremiumAmount: number, automatePremium: boolean, onToggleAutomate: () => void }) {
  return (
    <div className="glass" style={{ padding: "20px", borderRadius: "16px", marginBottom: "16px", border: active ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(239,68,68,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ background: active ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)", padding: "10px", borderRadius: "50%" }}>
            {active ? <ShieldCheck color="#22C55E" size={24} /> : <ShieldAlert color="#EF4444" size={24} />}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: active ? "#22C55E" : "#EF4444" }}>Health & Agri Insurance</h3>
            <p style={{ margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>Parametric Risk Pool</p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ 
            padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold",
            background: active ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)", 
            color: active ? "#22C55E" : "#EF4444" 
          }}>
            {active ? "ACTIVE" : "LAPSED"}
          </span>
        </div>
      </div>

      <div style={{ background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "12px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>Coverage Amount</span>
          <span style={{ fontSize: "12px", fontWeight: "bold", color: "#fff" }}>$5,000 USD</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>Next Premium</span>
          <span style={{ fontSize: "12px", fontWeight: "bold", color: "#fff" }}>{nextPremiumAmount} ETH / cycle</span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "12px" }}>
        <div>
          <p style={{ margin: 0, fontSize: "13px", fontWeight: "bold", color: "#fff" }}>Automate via x402</p>
          <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>Pay premium automatically from Vault Yield</p>
        </div>
        <label style={{ position: "relative", display: "inline-block", width: "44px", height: "24px" }}>
          <input type="checkbox" checked={automatePremium} onChange={onToggleAutomate} style={{ opacity: 0, width: 0, height: 0 }} />
          <span style={{
            position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0,
            background: automatePremium ? "#22C55E" : "#4B5563", borderRadius: "34px", transition: "0.4s"
          }}>
            <span style={{
              position: "absolute", height: "18px", width: "18px", left: automatePremium ? "22px" : "3px", bottom: "3px",
              background: "#fff", borderRadius: "50%", transition: "0.4s"
            }}></span>
          </span>
        </label>
      </div>
    </div>
  );
}
