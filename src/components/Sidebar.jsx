import { useState } from "react";
import { C } from "../constants/theme";
import { TABS } from "../constants/tabs";
import { load, save } from "../lib/storage";
import { fmtEur, sanitizePositions } from "../lib/finance";
import { useIsMobile } from "../context/mobile";
import AppLogo from "./AppLogo";

const IconHome = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 1.5L1.5 7v7.5h4.5V10h4v4.5H14.5V7L8 1.5z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    <path d="M6 14.5v-4.5h4v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconPositions = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="9" width="3" height="5.5" rx="1" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="6.5" y="5.5" width="3" height="9" rx="1" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="11.5" y="1.5" width="3" height="13" rx="1" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);
const IconPie = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 8 L8 2 A6 6 0 0 1 14 8 Z" fill="currentColor" fillOpacity="0.5"/>
    <path d="M8 8 L14 8 A6 6 0 1 1 8 2 Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);
const IconSwap = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 5h10M9 2.5L12 5l-3 2.5"/>
    <path d="M14 11H4M7 8.5L4 11l3 2.5"/>
  </svg>
);
const IconTrending = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1.5,12 5,8 8,10 14.5,3.5"/>
    <polyline points="10.5,3.5 14.5,3.5 14.5,7.5"/>
    <line x1="1.5" y1="14.5" x2="14.5" y2="14.5" strokeOpacity="0.3"/>
  </svg>
);
const IconTarget = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" fillOpacity="0"/>
    <circle cx="8" cy="8" r="3.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.3"/>
    <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
  </svg>
);
const IconWave = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M1 11.5 C3 11.5 3.5 4.5 6 5.5 C8.5 6.5 8.5 12.5 11 9.5 C13 7 13.5 8 15 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
    <path d="M1 11.5 C3 11.5 3.5 4.5 6 5.5 C8.5 6.5 8.5 12.5 11 9.5 C13 7 13.5 8 15 7 L15 14.5 L1 14.5 Z" fill="currentColor" fillOpacity="0.1"/>
  </svg>
);
export const IconChat = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 3.5C2 2.67 2.67 2 3.5 2h9C13.33 2 14 2.67 14 3.5v6c0 .83-.67 1.5-1.5 1.5H9L6.5 14V11H3.5C2.67 11 2 10.33 2 9.5z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <circle cx="5.5" cy="6.5" r="0.8" fill="currentColor"/>
    <circle cx="8" cy="6.5" r="0.8" fill="currentColor"/>
    <circle cx="10.5" cy="6.5" r="0.8" fill="currentColor"/>
  </svg>
);
const IconAutopilot = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M9.5 1.5 L5.5 8.5 H8.5 L6.5 14.5 L13 7 H9.5 L12 1.5 Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round"/>
  </svg>
);
const IconGear = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="8" cy="8" r="2.2"/>
    <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.6 3.6l.9.9M11.5 11.5l.9.9M12.4 3.6l-.9.9M4.5 11.5l-.9.9"/>
  </svg>
);
const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="5.5" r="2.8" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M2 14c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="currentColor" fillOpacity="0.1"/>
  </svg>
);
const IconBrain = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 2.5C6.2 2.5 4.8 3.8 4.6 5.4C3.5 5.7 2.5 6.8 2.5 8.2C2.5 9.6 3.5 10.7 4.8 11L5.2 12C5.5 12.8 6.3 13.2 7.1 13L8 12.7L8.9 13C9.7 13.2 10.5 12.8 10.8 12L11.2 11C12.5 10.7 13.5 9.6 13.5 8.2C13.5 6.8 12.5 5.7 11.4 5.4C11.2 3.8 9.8 2.5 8 2.5Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <line x1="8" y1="2.5" x2="8" y2="12.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeOpacity="0.5"/>
    <path d="M5.5 5.8C6.2 6.8 7 7.2 8 7.2C9 7.2 9.8 6.8 10.5 5.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
);
const IconMore = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="3.5" cy="8" r="1.5" fill="currentColor"/>
    <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
    <circle cx="12.5" cy="8" r="1.5" fill="currentColor"/>
  </svg>
);

export const NAV_GROUPS = [
  { items: [
    { key: TABS.HOME,       label: "Accueil",   icon: <IconHome/>,      group: [TABS.HOME] },
    { key: TABS.PORTFOLIO,  label: "Positions", icon: <IconPositions/>, group: [TABS.PORTFOLIO, TABS.HISTORIQUE, TABS.OPERATIONS] },
    { key: TABS.DCA,        label: "DCA",       icon: <IconTarget/>,    group: [TABS.DCA, TABS.PROJECTION] },
    { key: TABS.MARCHE,     label: "IA",        icon: <IconBrain/>,     group: [TABS.MARCHE, TABS.CHAT, TABS.AUTOPILOT], featured: true },
    { key: TABS.PLUS,       label: "Compte",    icon: <IconMore/>,      group: [TABS.PLUS, TABS.PROFIL, TABS.SETTINGS] },
  ]},
];

function SidebarContent({ active, onChange, portfolioVersion, refreshAll, refreshing, toggleDark, toggleCompact, darkMode, compact, hidden, collapsed, toggleCollapse, onClose, account, onSwitchAccount, mobileCompact = false, marketScoringUi, hideCollapseButton = false }) {
  const isMobile = useIsMobile();
  const allPositions = sanitizePositions(load("bourse_portfolio", []));
  const positions    = allPositions.filter(p => (p.compte || "PEA") === (account || "PEA"));
  const totalActuel  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const pv    = totalActuel - totalInvesti;
  const pvPct = totalInvesti > 0 ? (pv / totalInvesti) * 100 : 0;
  const c = mobileCompact ? true : (isMobile ? false : collapsed);

  const handleNav = (key) => { onChange(key); if (onClose) onClose(); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.sb }}>
      <style>{`
        @keyframes bn-next-wave {
          0%,100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
      `}</style>
      {mobileCompact && (
        <div style={{ padding: "12px 0 10px", borderBottom: `1px solid ${C.sbBorder}`, display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <AppLogo size={34} />
        </div>
      )}
      {!mobileCompact && !isMobile && !c && (
        <div style={{ padding: "16px 14px 14px", borderBottom: `1px solid ${C.sbBorder}`, display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <AppLogo size={28} />
          <div style={{ fontSize: "15px", fontWeight: "300", color: C.ink, letterSpacing: "-0.02em", fontFamily: "Inter, sans-serif" }}>
            Bourse<span style={{ fontWeight: "900", letterSpacing: "-0.05em", backgroundImage: "linear-gradient(135deg, #2D6CB5, #5B9BD5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Next</span>
          </div>
        </div>
      )}
      {!mobileCompact && isMobile && (
        <div className="ba-sidebar-logo" style={{ padding: "18px 14px 16px", borderBottom: `1px solid ${C.sbBorder}`, display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <AppLogo size={38} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "19px", fontWeight: "300", color: C.ink, letterSpacing: "-0.02em", fontFamily: "Inter, sans-serif" }}>Bourse<span style={{ fontWeight: "900", letterSpacing: "-0.05em", backgroundImage: "linear-gradient(135deg, #2D6CB5, #5B9BD5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Next</span></div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", color: C.inkMuted, cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}>✕</button>
        </div>
      )}

      {onSwitchAccount && (
        <div style={{ padding: (c || mobileCompact) ? "10px 8px" : "10px 12px", borderBottom: `1px solid ${C.sbBorder}`, flexShrink: 0 }}>
          {c ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
              {["PEA","CTO"].map(acc => (
                <button key={acc} onClick={() => onSwitchAccount(acc)} title={acc}
                  style={{ width: "36px", height: "26px", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "9px", fontWeight: "800", fontFamily: "Inter,sans-serif", background: account === acc ? "linear-gradient(135deg, #080B0F 0%, #142641 40%, #1E3A5F 75%, #2D5986 100%)" : C.sbHover, color: account === acc ? "#fff" : C.sbText, boxShadow: account === acc ? "0 3px 10px rgba(30,58,95,0.40)" : "none" }}>
                  {acc}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
              {["PEA","CTO"].map(acc => (
                <button key={acc} onClick={() => onSwitchAccount(acc)}
                  style={{ flex: 1, height: "28px", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "700", fontFamily: "Inter,sans-serif", transition: "all 0.18s", background: account === acc ? "linear-gradient(135deg, #080B0F 0%, #142641 40%, #1E3A5F 75%, #2D5986 100%)" : "transparent", color: account === acc ? "#fff" : C.sbText, boxShadow: account === acc ? "0 3px 10px rgba(30,58,95,0.40)" : "none" }}>
                  {acc}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ba-sidebar-nav" style={{ flex: 1, overflowY: "auto", padding: "8px 8px", display: "flex", flexDirection: "column" }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} style={{ marginBottom: group.featured ? "2px" : "4px" }}>
            {group.label && !c && !group.featured && (
              <div className="ba-sidebar-group-label" style={{ padding: "0 10px", marginBottom: "6px", marginTop: gi > 0 ? "2px" : 0, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", color: C.inkMuted, fontFamily: "Inter,sans-serif", textTransform: "uppercase" }}>
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const { key, label, icon, group: itemGroup, featured: itemFeatured } = item;
              const isActive = (itemGroup || [key]).includes(active);
              const isFeatured = itemFeatured || group.featured;
              const isScoringLoading = (itemGroup || [key]).includes(TABS.MARCHE) && marketScoringUi === "loading";
              const handleClick = () => {
                if (key === TABS.PLUS) { handleNav(TABS.PLUS); return; }
                if ((itemGroup || [key]).includes(active)) { if (onClose) onClose(); return; }
                handleNav(key);
              };
              return (
                <button key={key} className={`ba-sidebar-item${isActive ? " ba-sidebar-item-active" : ""}`}
                  onClick={handleClick} title={c ? label : undefined}
                  style={{
                    width: "100%", display: "flex", alignItems: "center",
                    gap: 0,
                    padding: c ? "11px 0" : "7px 14px",
                    justifyContent: c ? "center" : "flex-start",
                    borderRadius: "10px",
                    background: isActive
                      ? "linear-gradient(135deg, #080B0F 0%, #142641 40%, #1E3A5F 75%, #2D5986 100%)"
                      : "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: isActive ? "#FFFFFF" : isFeatured ? C.ink : C.sbText,
                    fontSize: "13px",
                    fontWeight: isActive ? "700" : isFeatured ? "600" : "450",
                    fontFamily: "'Inter', 'Roboto', sans-serif",
                    textAlign: "left", marginBottom: "2px",
                    transition: "all 0.15s",
                    boxShadow: isActive ? "0 4px 16px rgba(30,58,95,0.35)" : "none",
                    letterSpacing: "-0.01em",
                    position: "relative",
                  }}>
                  {!isActive && isFeatured && !c && (
                    <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: "3px", height: "18px", borderRadius: "2px", background: "#B07D2E" }} />
                  )}
                  {c
                    ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                        {isFeatured
                          ? <span style={{ fontSize: "11px", fontWeight: "800", fontFamily: "Inter,sans-serif", color: isActive ? "#F5D97A" : "#B07D2E", letterSpacing: "0.5px" }}>IA</span>
                          : <span style={{ color: isActive ? "#fff" : C.inkSubtle, opacity: isActive ? 1 : 0.6 }}>{icon}</span>
                        }
                        {isScoringLoading && <span style={{ position: "absolute", top: "-3px", right: "-3px", width: "7px", height: "7px", borderRadius: "50%", background: "#B07D2E", animation: "pulse 1.2s ease-in-out infinite" }} />}
                      </span>
                    : <span style={{ flex: 1, paddingLeft: isFeatured && !isActive ? "10px" : 0, display: "flex", alignItems: "center", gap: "6px" }}>
                        {label}
                        {isScoringLoading && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#B07D2E", animation: "pulse 1.2s ease-in-out infinite", flexShrink: 0 }} />}
                      </span>
                  }
                  {!c && isFeatured && !isActive && <span style={{ fontSize: "10px", background: "#B07D2E", color: "#FFF8E7", borderRadius: "6px", padding: "2px 7px", fontWeight: "700", letterSpacing: "0.4px", flexShrink: 0 }}>IA</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {!mobileCompact && <div className="ba-sidebar-footer" style={{ padding: "10px 8px", borderTop: `1px solid ${C.sbBorder}`, display: "flex", gap: "5px", justifyContent: "center", flexShrink: 0 }}>
        {c ? (
          <button onClick={toggleCollapse} title="Déplier la sidebar"
            style={{ width: "34px", height: "34px", borderRadius: "8px", background: C.snowDim, border: `1px solid ${C.border}`, color: C.inkMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,2 10,7 5,12"/></svg>
          </button>
        ) : (<>
          <button onClick={toggleCompact} title={compact ? "Mode normal" : "Mode compact (zoom arrière)"}
            style={{ flex: 1, height: "32px", borderRadius: "8px", background: compact ? C.greenLight : C.snowDim, border: `1px solid ${compact ? C.green + "60" : C.border}`, color: compact ? C.greenDark : C.inkMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", transition: "all 0.2s" }}>
            {compact ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="7" x2="13" y2="7"/><line x1="7" y1="1" x2="7" y2="13"/><circle cx="7" cy="7" r="5.5"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="7" x2="13" y2="7"/><circle cx="7" cy="7" r="5.5"/></svg>
            )}
            <span style={{ fontSize: "9px", fontWeight: "700", fontFamily: "Inter,sans-serif" }}>{compact ? "Normal" : "Compact"}</span>
          </button>

          <button onClick={toggleDark} title={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}
            style={{ flex: 1, height: "32px", borderRadius: "8px", background: darkMode ? "#1E2A38" : C.snowDim, border: `1px solid ${darkMode ? "rgba(148,163,184,0.2)" : C.border}`, color: darkMode ? "#CBD5E1" : C.inkMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", transition: "all 0.2s" }}>
            {darkMode ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
            <span style={{ fontSize: "9px", fontWeight: "700", fontFamily: "Inter,sans-serif" }}>{darkMode ? "Clair" : "Sombre"}</span>
          </button>

          <button onClick={() => window.print()} title="Exporter en PDF"
            style={{ flex: 1, height: "32px", borderRadius: "8px", background: C.snowDim, border: `1px solid ${C.border}`, color: C.inkMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", transition: "all 0.2s" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span style={{ fontSize: "9px", fontWeight: "700", fontFamily: "Inter,sans-serif" }}>PDF</span>
          </button>
        </>)}
      </div>}

      {!c && !mobileCompact && positions.length > 0 && <div className="ba-sidebar-pfcard" style={{ padding: "12px 12px 14px", flexShrink: 0 }}>
        <div style={{ background: "linear-gradient(135deg, #111214 0%, #1A2744 60%, #1E3A5F 100%)", borderRadius: "16px", padding: "16px 18px", boxShadow: "0 6px 24px rgba(30,58,95,0.25)" }}>
          <div style={{ fontSize: "9px", fontWeight: "700", color: "rgba(193,232,255,0.65)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>Portefeuille {account || "PEA"}</div>
          <div style={{ fontSize: "20px", fontWeight: "900", color: "#fff", letterSpacing: "-0.5px", marginBottom: "4px", ...(hidden ? { filter: "blur(7px)", userSelect: "none" } : {}) }}>{fmtEur(totalActuel)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.85)", fontWeight: "600", ...(hidden ? { filter: "blur(7px)", userSelect: "none" } : {}) }}>{(pv >= 0 ? "+" : "") + fmtEur(pv)}</span>
            <span style={{ fontSize: "11px", background: "rgba(255,255,255,0.2)", borderRadius: "20px", padding: "2px 8px", color: "#fff", fontWeight: "700", ...(hidden ? { filter: "blur(7px)", userSelect: "none" } : {}) }}>{(pv >= 0 ? "+" : "") + pvPct.toFixed(1) + "%"}</span>
          </div>
        </div>
      </div>}
    </div>
  );
}

export default function Sidebar({ active, onChange, portfolioVersion, refreshAll, refreshing, refreshAgo, toggleDark, toggleCompact, darkMode, compact, hidden, mobileOpen, onMobileClose, account, onSwitchAccount, marketScoringUi, externalCollapsed, onExternalToggle }) {
  const isMobile = useIsMobile();
  const [internalCollapsed, setInternalCollapsed] = useState(() => load("bourse_sidebar_collapsed", true));
  const collapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;
  const toggleCollapse = onExternalToggle || (() => { const v = !internalCollapsed; setInternalCollapsed(v); save("bourse_sidebar_collapsed", v); });

  const sharedProps = { active, onChange, portfolioVersion, refreshAll, refreshing, toggleDark, toggleCompact, darkMode, compact, hidden, collapsed, toggleCollapse, account, onSwitchAccount, marketScoringUi, hideCollapseButton: externalCollapsed !== undefined };

  if (isMobile) {
    if (!mobileOpen) return null;
    return (
      <>
        <div onClick={onMobileClose} style={{ position: "fixed", inset: 0, background: "rgba(8,11,15,0.45)", zIndex: 998, backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)", animation: "fadeIn 0.18s ease" }} />
        <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: "272px", background: "rgba(248,249,250,0.97)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRight: `1px solid ${C.sbBorder}`, display: "flex", flexDirection: "column", zIndex: 999, boxShadow: "4px 0 24px rgba(8,11,15,0.18)", animation: "slideInLeft 0.22s cubic-bezier(0.4,0,0.2,1)" }}>
          <SidebarContent {...sharedProps} collapsed={false} mobileCompact={false} onClose={onMobileClose} />
        </div>
      </>
    );
  }

  return (
    <div className="ba-sidebar" style={{ width: collapsed ? "56px" : "224px", minWidth: collapsed ? "56px" : "224px", height: "100vh", background: "rgba(248,249,250,0.82)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRight: `1px solid ${C.sbBorder}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, zIndex: 20, overflow: "hidden", transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)" }}>
      <SidebarContent {...sharedProps} onClose={null} />
    </div>
  );
}
