"use client";

import { useEffect, useState, useRef } from "react";
import { Terminal, ShieldCheck, ExternalLink, ShieldAlert } from "lucide-react";

interface KaiEvent {
  id: string;
  type: string;
  timestamp: string;
  data: any;
  cycleId?: string;
}

export default function RealTimeTerminal() {
  const [events, setEvents] = useState<KaiEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onmessage = (e) => {
      try {
        const event: KaiEvent = JSON.parse(e.data);
        setEvents((prev) => {
          // Keep only the last 100 events to prevent DOM bloat
          const newEvents = [...prev, event];
          if (newEvents.length > 100) return newEvents.slice(newEvents.length - 100);
          return newEvents;
        });
      } catch (err) {
        console.error("Failed to parse SSE", err);
      }
    };

    es.onerror = () => {
      console.error("EventSource error");
    };

    return () => {
      es.close();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const renderEvent = (event: KaiEvent) => {
    const time = new Date(event.timestamp).toLocaleTimeString([], { hour12: false });
    
    let prefix = "[System]";
    let color = "#9ca3af";

    switch (event.type) {
      case "VaultCreated":
      case "YieldGenerated":
        prefix = "[Vault]";
        color = "#22c55e"; // green
        break;
      case "InsurancePremiumDue":
      case "PolicyActivated":
      case "PolicyExpired":
        prefix = "[Insurance]";
        color = "#3b82f6"; // blue
        break;
      case "PaymentRequirementsReceived":
      case "TransactionBuilt":
      case "TransactionSubmitted":
      case "ConsensusReached":
      case "ReceiptVerified":
        prefix = "[x402]";
        color = "#c9a24b"; // gold
        break;
      case "PensionUpdated":
      case "YieldRedirected":
        prefix = "[Pension]";
        color = "#8b5cf6"; // purple
        break;
      case "TrustRuleEvaluated":
      case "TrustExecuted":
      case "BeneficiaryUpdated":
        prefix = "[Trust]";
        color = "#f97316"; // orange
        break;
      case "AgentStarted":
      case "AgentCompleted":
      case "WorkflowStarted":
      case "WorkflowCompleted":
      case "WorkflowFailed":
        prefix = "[Agent]";
        color = "#ec4899"; // pink
        break;
    }

    let summary = "";
    if (event.type === "YieldGenerated") {
      summary = `Generated ${event.data.dailyYieldHbar.toFixed(4)} ETH yield for vault ${event.data.poolName}`;
    } else if (event.type === "InsurancePremiumDue") {
      summary = `Premium due: ${event.data.premiumHbar} ETH for ${event.data.poolType} policy`;
    } else if (event.type === "TransactionSubmitted") {
      summary = `Submitted transaction ${event.data.transactionId || event.data.method} to Sepolia / Hedera Testnet`;
    } else if (event.type === "ConsensusReached") {
      summary = `Consensus Reached for ${event.data.transactionId}`;
    } else if (event.type === "ReceiptVerified") {
      summary = `Verified transaction: ${event.data.transactionId}`;
    } else if (event.type === "PensionUpdated" && event.data.action === "contribution") {
      summary = `Swept ${event.data.amountHbar.toFixed(4)} ETH overflow into Pension Lock`;
    } else if (event.type === "WorkflowCompleted") {
      summary = `Automation cycle ${event.cycleId?.split("-")[0]} complete. Paid: ${event.data.premiumPaid} ETH, Yield: ${event.data.yieldHbar.toFixed(4)} ETH`;
    } else {
      summary = JSON.stringify(event.data);
    }

    return (
      <div key={event.id} style={{ display: "flex", gap: "12px", marginBottom: "8px", fontSize: "13px", lineHeight: "1.4", fontFamily: "monospace" }}>
        <div style={{ color: "rgba(255,255,255,0.4)", minWidth: "70px" }}>{time}</div>
        <div style={{ color, minWidth: "90px", fontWeight: "600" }}>{prefix}</div>
        <div style={{ color: "rgba(255,255,255,0.9)", wordBreak: "break-all" }}>
          {summary}
          
          {/* Display Verified Settlement Card if it's a receipt */}
          {event.type === "ReceiptVerified" && (
            <div style={{ 
              marginTop: "8px", 
              padding: "12px", 
              background: "rgba(0,0,0,0.3)", 
              border: "1px solid rgba(34, 197, 94, 0.4)", 
              borderRadius: "8px",
              fontFamily: "sans-serif"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#22c55e", fontWeight: "600", marginBottom: "8px" }}>
                <ShieldCheck size={16} /> Verified Settlement
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "4px", fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
                <div>Network:</div><div style={{ color: "#fff" }}>Sepolia / Hedera Testnet</div>
                <div>Amount:</div><div style={{ color: "#fff" }}>{event.data.amountHbar} ETH</div>
                <div>Status:</div><div style={{ color: "#fff" }}>SUCCESS</div>
                <div>Transaction ID:</div>
                <div>
                  <span style={{ color: "#fff" }}>{event.data.transactionId}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: "#0a110d",
      border: "1px solid rgba(201, 162, 75, 0.2)",
      borderRadius: "16px",
      display: "flex",
      flexDirection: "column",
      height: "400px",
      overflow: "hidden"
    }}>
      <div style={{
        padding: "12px 16px",
        background: "rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#c9a24b", fontSize: "14px", fontWeight: "600" }}>
          <Terminal size={16} /> Live Execution Terminal
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#22c55e" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }}></div>
          SSE Connected
        </div>
      </div>

      <div ref={scrollRef} style={{
        padding: "16px",
        overflowY: "auto",
        flex: 1,
        display: "flex",
        flexDirection: "column"
      }}>
        {events.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic", fontSize: "13px", margin: "auto" }}>
            Awaiting events... (Click "Fast Forward Time" to start)
          </div>
        ) : (
          events.map(renderEvent)
        )}
      </div>
    </div>
  );
}
