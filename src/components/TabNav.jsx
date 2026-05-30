import { useMemo } from "react";
import { C, shadow } from "../constants/theme";
import { load } from "../lib/storage";
import { SIGNAL_CONFIG } from "../constants/config";
import { TABS } from "../constants/tabs";

export function TabNav({ active, onChange, portfolioVersion }) {
  const alertCount = useMemo(() => {
    const pos = load("bourse_portfolio", []);
    return pos.filter(p =>
      (p.alerteHaute  && p.dernierCours && p.dernierCours >= p.alerteHaute) ||
      (p.alerteBasse  && p.dernierCours && p.dernierCours <= p.alerteBasse)
    ).length;
  }, [portfolioVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = [
    { key: TABS.PORTFOLIO,  label: "Positions" },
    { key: TABS.MARCHE,     label: "Signaux IA" },
    { key: TABS.DCA,        label: "Plan DCA" },
    { key: TABS.PROJECTION, label: "Projection" },
    { key: TABS.HISTORIQUE, label: "Répartition" },
    { key: TABS.OPERATIONS, label: "Transactions" },
    { key: TABS.PROFIL,     label: "Profil" },
    { key: TABS.SETTINGS,   label: "Paramètres" },
  ];

  return (
    <div className="ba-tabnav" style={{ display: "flex", gap: "4px", marginBottom: "32px", background: "rgba(248,249,250,0.78)", borderRadius: "22px", padding: "6px", border: `1px solid rgba(255,255,255,0.6)`, position: "sticky", top: "0", zIndex: 50, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 2px 12px rgba(17,18,20,0.06)" }}>
      {tabs.map(({ key, label }, idx) => {
        const isActive = active === key;
        const badge = key === TABS.PORTFOLIO && alertCount > 0 ? alertCount : 0;
        return (
          <button key={key} onClick={() => onChange(key)}
            title={`Raccourci : ${idx + 1}`}
            style={{ flex: 1, padding: "11px 10px", background: isActive ? "linear-gradient(135deg, #1A4A8A, #4B9DD8, #85CFEF, #2D6CB5)" : "transparent", border: isActive ? "none" : "1px solid transparent", borderRadius: "16px", color: isActive ? "#fff" : C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer", fontWeight: isActive ? "700" : "400", boxShadow: isActive ? "0 2px 10px rgba(45,91,134,0.35)" : "none", transition: "all 0.2s ease", position: "relative", whiteSpace: "nowrap" }}>
            {label}
            {badge > 0 && (
              <span style={{ position: "absolute", top: "4px", right: "4px", background: C.red, color: "#fff", borderRadius: "50%", minWidth: "15px", height: "15px", fontSize: "8px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SignalBadge({ signal }) {
  const cfg = SIGNAL_CONFIG[signal] || SIGNAL_CONFIG.ATTENDRE;
  if (signal === "VENDRE") {
    return (
      <div style={{ background: "#FFF5F5", border: "2px solid #DC2626", borderRadius: "16px", padding: "14px 20px", textAlign: "center", animation: "vendreAlarm 0.8s ease-in-out infinite", boxShadow: "0 4px 24px rgba(220,38,38,0.3)" }}>
        <div style={{ fontSize: "22px", fontWeight: "900", color: "#DC2626", letterSpacing: "2px", textTransform: "uppercase" }}>🚨 ÉJECTEZ-VOUS 🚨</div>
        <div style={{ fontSize: "11px", color: "#DC2626", opacity: 0.75, fontWeight: "800", letterSpacing: "3px", marginTop: "4px" }}>⚠ VENDRE MAINTENANT ⚠</div>
      </div>
    );
  }
  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "16px", padding: "12px 20px", textAlign: "center" }}>
      <div style={{ fontSize: "18px", fontWeight: "800", color: cfg.color, letterSpacing: "1px" }}>{cfg.icon} {signal}</div>
      <div style={{ fontSize: "9px", color: cfg.color, opacity: 0.7, letterSpacing: "2px", marginTop: "2px", textTransform: "uppercase" }}>Signal</div>
    </div>
  );
}
