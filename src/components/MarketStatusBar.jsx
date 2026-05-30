import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { MARKETS_CFG, getMarketStatus } from "../constants/markets";

export default function MarketStatusBar({ compact = false }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  return (
    <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap", marginBottom: "14px" }}>
      {MARKETS_CFG.map(cfg => {
        const { open, reason, hhmm } = getMarketStatus(cfg, now);
        return (
          <div key={cfg.id} style={{ background: C.snow, border: `1px solid ${open ? "rgba(22,163,74,0.25)" : C.border}`, borderRadius: "8px", padding: "5px 10px", display: "flex", alignItems: "center", gap: "6px", boxShadow: shadow.card }}>
            <span style={{ fontSize: "13px" }}>{cfg.flag}</span>
            <div>
              <div style={{ fontSize: "10px", fontWeight: "700", color: C.ink }}>{cfg.nom}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: open ? C.green : C.inkSubtle, display: "inline-block", flexShrink: 0, ...(open ? { animation: "marketPulse 3s ease-in-out infinite" } : {}) }} />
                <span style={{ fontSize: "9px", fontWeight: "600", color: open ? C.green : C.inkSubtle }}>{reason}</span>
                <span style={{ fontSize: "9px", color: C.inkSubtle }}>· {hhmm}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
