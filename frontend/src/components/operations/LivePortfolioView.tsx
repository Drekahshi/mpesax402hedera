"use client";

import { useEffect, useState } from "react";
import { Wallet, Shield, Lock, Users, ArrowUpRight, Activity } from "lucide-react";

export default function LivePortfolioView({ accountId }: { accountId: string }) {
  const [portfolio, setPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchPortfolio = async () => {
    try {
      const res = await fetch(`/api/portfolio?accountId=${accountId}`);
      const data = await res.json();
      if (data.portfolio) {
        setPortfolio(data.portfolio);
      }
    } catch (err) {
      console.error("Failed to fetch portfolio", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
    // Poll every 3 seconds to keep sync with fast-forward cycles
    const interval = setInterval(fetchPortfolio, 3000);
    return () => clearInterval(interval);
  }, [accountId]);

  if (loading || !portfolio) {
    return (
      <div style={{
        background: "rgba(28, 61, 46, 0.4)",
        border: "1px solid rgba(201, 162, 75, 0.2)",
        borderRadius: "16px",
        padding: "20px",
        backdropFilter: "blur(10px)",
        minHeight: "300px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading live portfolio...</p>
      </div>
    );
  }

  const { vaultPositions, insurancePolicies, pension, trust, summary, insights } = portfolio;
  
  // Aggregate Vault Yield
  const availableYield = vaultPositions.reduce((s: number, p: any) => s + p.yieldAvailableHbar, 0);
  const totalVault = summary.totalVaultValueHbar;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Overview Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        
        {/* Vault */}
        <div style={{
          background: "linear-gradient(135deg, rgba(28,61,46,0.8) 0%, rgba(10,30,20,0.9) 100%)",
          border: "1px solid rgba(201, 162, 75, 0.3)",
          borderRadius: "16px",
          padding: "20px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <h3 style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              <Wallet size={16} color="#c9a24b" /> KAI Vaults
            </h3>
            <span style={{ fontSize: "11px", background: "rgba(201,162,75,0.2)", color: "#c9a24b", padding: "2px 8px", borderRadius: "10px" }}>
              {vaultPositions.length} Active
            </span>
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
            {totalVault.toFixed(4)} <span style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)" }}>ETH</span>
          </div>
          <div style={{ fontSize: "13px", color: "#22c55e", display: "flex", alignItems: "center", gap: "4px" }}>
            <ArrowUpRight size={14} /> {availableYield.toFixed(4)} Available Yield
          </div>
        </div>

        {/* Insurance */}
        <div style={{
          background: "linear-gradient(135deg, rgba(28,61,46,0.8) 0%, rgba(10,30,20,0.9) 100%)",
          border: "1px solid rgba(201, 162, 75, 0.3)",
          borderRadius: "16px",
          padding: "20px"
        }}>
           <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <h3 style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              <Shield size={16} color="#3b82f6" /> Protection
            </h3>
             <span style={{ fontSize: "11px", background: "rgba(59,130,246,0.2)", color: "#60a5fa", padding: "2px 8px", borderRadius: "10px" }}>
              {insurancePolicies.length} Policies
            </span>
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
            {summary.totalCoverageHbar.toFixed(4)} <span style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)" }}>ETH</span>
          </div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
            Active Coverage
          </div>
        </div>

        {/* Pension */}
        <div style={{
          background: "linear-gradient(135deg, rgba(28,61,46,0.8) 0%, rgba(10,30,20,0.9) 100%)",
          border: "1px solid rgba(201, 162, 75, 0.3)",
          borderRadius: "16px",
          padding: "20px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <h3 style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              <Lock size={16} color="#8b5cf6" /> Pension Lock
            </h3>
             <span style={{ fontSize: "11px", background: "rgba(139,92,246,0.2)", color: "#a78bfa", padding: "2px 8px", borderRadius: "10px" }}>
              {pension ? `${pension.compoundPercent}% APY` : 'Setup Needed'}
            </span>
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
            {pension?.balanceHbar.toFixed(4) || "0.0000"} <span style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)" }}>ETH</span>
          </div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
             Projected: {pension?.projectedRetirementHbar.toFixed(4) || "0.0000"} ETH
          </div>
        </div>

        {/* Trust */}
        <div style={{
          background: "linear-gradient(135deg, rgba(28,61,46,0.8) 0%, rgba(10,30,20,0.9) 100%)",
          border: "1px solid rgba(201, 162, 75, 0.3)",
          borderRadius: "16px",
          padding: "20px"
        }}>
           <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <h3 style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              <Users size={16} color="#e05c2b" /> Family Trust
            </h3>
             <span style={{ fontSize: "11px", background: "rgba(224,92,43,0.2)", color: "#fb923c", padding: "2px 8px", borderRadius: "10px" }}>
              {trust?.status.toUpperCase() || 'Not Configured'}
            </span>
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#fff", marginBottom: "4px" }}>
            {trust?.balanceHbar.toFixed(4) || "0.0000"} <span style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)" }}>ETH</span>
          </div>
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
             {trust?.beneficiaries.length || 0} Beneficiaries
          </div>
        </div>
      </div>

      {/* AI Insights */}
      <div style={{
         background: "rgba(28, 61, 46, 0.3)",
         border: "1px dashed rgba(201, 162, 75, 0.4)",
         borderRadius: "12px",
         padding: "16px"
      }}>
        <h4 style={{ fontSize: "14px", color: "#c9a24b", margin: "0 0 12px 0", display: "flex", alignItems: "center", gap: "6px" }}>
          <Activity size={14} /> Agent Insights
        </h4>
        <ul style={{ margin: 0, paddingLeft: "20px", color: "rgba(255,255,255,0.8)", fontSize: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {insights.map((insight: string, idx: number) => (
            <li key={idx}>{insight}</li>
          ))}
          {insights.length === 0 && <li>All systems nominal. Portfolio is healthy.</li>}
        </ul>
      </div>

    </div>
  );
}
