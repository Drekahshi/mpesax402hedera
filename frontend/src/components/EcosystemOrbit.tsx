"use client";

export default function EcosystemOrbit() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "30px" }}>
      <div style={{ position: "relative", width: "100%", height: "200px" }}>
        
        {/* Center: Vault */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 10 }}>
          <div className="glass float" style={{ padding: "12px 20px", borderRadius: "100px", border: "2px solid #FFD700", background: "rgba(255,215,0,0.1)", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}></span>
            <span style={{ fontWeight: "bold", color: "#FFD700" }}>Vault Yield</span>
          </div>
        </div>

        {/* Orbit Lines */}
        <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 1 }}>
          <path d="M 50% 50% L 20% 20%" stroke="rgba(255,215,0,0.2)" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 50% 50% L 80% 20%" stroke="rgba(255,215,0,0.2)" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 50% 50% L 50% 85%" stroke="rgba(255,215,0,0.2)" strokeWidth="2" strokeDasharray="4 4" />
          
          {/* Animated particles */}
          <circle r="4" fill="#FFD700">
            <animateMotion dur="2s" repeatCount="indefinite" path="M 150 100 L 60 40" />
          </circle>
          <circle r="4" fill="#FFD700">
            <animateMotion dur="2.5s" repeatCount="indefinite" path="M 150 100 L 240 40" />
          </circle>
          <circle r="4" fill="#FFD700">
            <animateMotion dur="3s" repeatCount="indefinite" path="M 150 100 L 150 170" />
          </circle>
        </svg>

        {/* Nodes */}
        <div style={{ position: "absolute", top: "10%", left: "10%", transform: "translate(-50%, -50%)", zIndex: 10 }}>
          <div className="glass" style={{ padding: "8px 14px", borderRadius: "20px", border: "1px solid #22C55E", background: "rgba(34,197,94,0.1)" }}>
            <span style={{ color: "#22C55E", fontSize: "11px", fontWeight: "bold" }}>Insurance</span>
          </div>
        </div>

        <div style={{ position: "absolute", top: "10%", left: "90%", transform: "translate(-50%, -50%)", zIndex: 10 }}>
          <div className="glass" style={{ padding: "8px 14px", borderRadius: "20px", border: "1px solid #A78BFA", background: "rgba(167,139,250,0.1)" }}>
            <span style={{ color: "#A78BFA", fontSize: "11px", fontWeight: "bold" }}>Pension</span>
          </div>
        </div>

        <div style={{ position: "absolute", top: "90%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 10 }}>
          <div className="glass" style={{ padding: "8px 14px", borderRadius: "20px", border: "1px solid #3B82F6", background: "rgba(59,130,246,0.1)" }}>
            <span style={{ color: "#3B82F6", fontSize: "11px", fontWeight: "bold" }}>Trust</span>
          </div>
        </div>

      </div>
    </div>
  );
}
