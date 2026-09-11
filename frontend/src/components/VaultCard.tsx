"use client";
import { useState } from "react";
import { Shield, TrendingUp, Zap } from "lucide-react";

export default function VaultCard({ balance, yieldEarned, onDeposit }: { balance: number, yieldEarned: number, onDeposit: (amount: number) => void }) {
  const [amount, setAmount] = useState("");

  return (
    <div className="glass" style={{ padding: "20px", borderRadius: "16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ background: "rgba(255, 215, 0, 0.2)", padding: "10px", borderRadius: "50%" }}>
            <TrendingUp color="#FFD700" size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: "#FFD700" }}>KAI Yield Vault</h3>
            <p style={{ margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>12% APY • Auto-compounding</p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>TVL</p>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: "bold", color: "#fff" }}>$2.4M</p>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", background: "rgba(0,0,0,0.2)", padding: "12px", borderRadius: "12px" }}>
        <div>
          <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>Your Deposit</p>
          <p style={{ margin: 0, fontSize: "18px", fontWeight: "bold", color: "#fff" }}>{balance.toFixed(2)} ETH</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>Yield Earned</p>
          <p style={{ margin: 0, fontSize: "18px", fontWeight: "bold", color: "#22C55E" }}>+{yieldEarned.toFixed(4)} ETH</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        <input 
          type="number" 
          placeholder="Amount (ETH)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ flex: 1, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", padding: "10px", color: "#fff", outline: "none" }}
        />
        <button 
          className="btn-gold" 
          style={{ padding: "10px 20px", borderRadius: "8px", fontWeight: "bold" }}
          onClick={() => {
            if (amount && !isNaN(Number(amount))) {
              onDeposit(Number(amount));
              setAmount("");
            }
          }}
        >
          Deposit
        </button>
      </div>
    </div>
  );
}
