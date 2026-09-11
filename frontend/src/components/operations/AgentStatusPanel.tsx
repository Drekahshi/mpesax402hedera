"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle, AlertCircle, Clock } from "lucide-react";

interface AgentStatus {
  name: string;
  status: "idle" | "running" | "healthy" | "error";
  lastRun?: string;
  lastResult?: string;
}

export default function AgentStatusPanel() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/agents?view=status");
      const data = await res.json();
      if (data.agents) {
        setAgents(data.agents);
      }
    } catch (err) {
      console.error("Failed to fetch agent status", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 3 seconds for agent status
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: AgentStatus["status"]) => {
    switch (status) {
      case "running":
        return <Activity size={16} className="text-blue-400 animate-pulse" />;
      case "healthy":
        return <CheckCircle size={16} className="text-green-500" />;
      case "error":
        return <AlertCircle size={16} className="text-red-500" />;
      default:
        return <Clock size={16} className="text-gray-400" />;
    }
  };

  const getStatusColor = (status: AgentStatus["status"]) => {
    switch (status) {
      case "running": return "text-blue-400";
      case "healthy": return "text-green-500";
      case "error": return "text-red-500";
      default: return "text-gray-400";
    }
  };

  return (
    <div style={{
      background: "rgba(28, 61, 46, 0.4)",
      border: "1px solid rgba(201, 162, 75, 0.2)",
      borderRadius: "16px",
      padding: "20px",
      backdropFilter: "blur(10px)"
    }}>
      <h2 style={{ fontSize: "16px", fontWeight: "600", color: "#c9a24b", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: "8px" }}>
        <Activity size={18} />
        Autonomous Agent Swarm
      </h2>

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>Initializing agents...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {agents.map(agent => (
            <div key={agent.name} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px",
              background: "rgba(0,0,0,0.2)",
              borderRadius: "8px",
              borderLeft: `2px solid ${agent.status === "error" ? "#ef4444" : agent.status === "running" ? "#60a5fa" : agent.status === "healthy" ? "#22c55e" : "#9ca3af"}`
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  {getStatusIcon(agent.status)}
                  <span style={{ fontSize: "14px", fontWeight: "500", color: "#fff" }}>{agent.name}</span>
                </div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                  {agent.lastResult || "Standing by"}
                </div>
              </div>
              <div style={{ fontSize: "12px", fontWeight: "600" }} className={getStatusColor(agent.status)}>
                {agent.status.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
