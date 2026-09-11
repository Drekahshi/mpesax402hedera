"use client";
import { Users, FileText } from "lucide-react";

export default function TrustCard({ balance, beneficiaries }: { balance: number, beneficiaries: string[] }) {
  return (
    <div className="glass" style={{ padding: "20px", borderRadius: "16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ background: "rgba(59, 130, 246, 0.2)", padding: "10px", borderRadius: "50%" }}>
            <Users color="#3B82F6" size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: "#3B82F6" }}>KAI Programmable Trust</h3>
            <p style={{ margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>Digital Family Office</p>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "12px" }}>
        <div>
          <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>Trust Treasury</p>
          <p style={{ margin: 0, fontSize: "18px", fontWeight: "bold", color: "#fff" }}>{balance.toFixed(4)} ETH</p>
        </div>
      </div>

      <div style={{ padding: "12px", background: "rgba(255,255,255,0.05)", borderRadius: "12px" }}>
        <p style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: "bold", color: "#fff" }}>Beneficiary Rules</p>
        {beneficiaries.map((b, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <FileText size={12} color="rgba(255,255,255,0.6)" />
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.8)" }}>{b}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
