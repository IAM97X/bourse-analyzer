import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { MARKETS_CFG, getMarketStatus } from "../constants/markets";

export default function MarketStatusBar({ compact = false }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  return (
    <div style={{ display: "flex", gap: compact ? "6px" : "8px", overflowX: "auto", ...(compact ? {} : { marginBottom: "16px", paddingBottom: "2px" }) }}>
      {MARKETS_CFG.map(cfg => {
        const { open, reason, hhmm } = getMarketStatus(cfg, now);
        return (
          <div key={cfg.id} style={{ flexShrink: 0, background: C.snow, border: `1px solid ${open ? "rgba(22,163,74,0.25)" : C.border}`, borderRadius: compact ? "8px" : "10px", padding: compact ? "4px 8px" : "8px 12px", display: "flex", alignItems: "center", gap: compact ? "5px" : "8px", boxShadow: shadow.card }}>
            <span style={{ fontSize: compact ? "12px" : "16px" }}>{cfg.flag}</span>
            <div>
              <div style={{ fontSize: compact ? "10px" : "11px", fontWeight: "700", color: C.ink }}>{cfg.nom}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: open ? C.green : C.inkSubtle, display: "inline-block", flexShrink: 0, ...(open ? { animation: "marketPulse 3s ease-in-out infinite" } : {}) }} />
                <span style={{ fontSize: "9px", fontWeight: "600", color: open ? C.green : C.inkSubtle }}>{reason}</span>
                {!compact && <span style={{ fontSize: "10px", color: C.inkSubtle }}>· {hhmm}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
