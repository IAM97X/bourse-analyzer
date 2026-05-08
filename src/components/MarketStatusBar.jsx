import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { MARKETS_CFG, getMarketStatus } from "../constants/markets";

export default function MarketStatusBar() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  return (
    <div style={{ display: "flex", gap: "8px", overflowX: "auto", marginBottom: "16px", paddingBottom: "2px" }}>
      {MARKETS_CFG.map(cfg => {
        const { open, reason, hhmm } = getMarketStatus(cfg, now);
        return (
          <div key={cfg.id} style={{ flexShrink: 0, background: C.snow, border: `1px solid ${open ? "rgba(22,163,74,0.25)" : C.border}`, borderRadius: "10px", padding: "8px 12px", display: "flex", alignItems: "center", gap: "8px", boxShadow: shadow.card }}>
            <span style={{ fontSize: "16px" }}>{cfg.flag}</span>
            <div>
              <div style={{ fontSize: "11px", fontWeight: "700", color: C.ink }}>{cfg.nom}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: open ? C.green : C.inkSubtle, display: "inline-block", flexShrink: 0, ...(open ? { animation: "marketPulse 3s ease-in-out infinite" } : {}) }} />
                <span style={{ fontSize: "10px", fontWeight: "600", color: open ? C.green : C.inkSubtle }}>{reason}</span>
                <span style={{ fontSize: "10px", color: C.inkSubtle }}>· {hhmm}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
