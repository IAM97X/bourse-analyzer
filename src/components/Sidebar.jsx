import { useState } from "react";
import { C } from "../constants/theme";
import { TABS } from "../constants/tabs";
import { load, save } from "../lib/storage";
import { fmtEur, sanitizePositions } from "../lib/finance";
import { useIsMobile } from "../context/mobile";
import AppLogo from "./AppLogo";

const IconHome = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7.5" height="7.5" rx="1"/>
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1"/>
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1"/>
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1"/>
  </svg>
);
const IconPositions = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <line x1="2" y1="12" x2="22" y2="12" strokeOpacity="0.3"/>
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
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="3"  y1="9"  x2="21" y2="9" strokeOpacity="0.35"/>
    <line x1="8"  y1="2"  x2="8"  y2="6"/>
    <line x1="16" y1="2"  x2="16" y2="6"/>
    <path d="M8 14l3 3 5-4"/>
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
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FFFFFF" }}>
      {mobileCompact && (
        <div style={{ padding: "12px 0 10px", borderBottom: "1px solid #E5E5EA", display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <AppLogo size={34} />
        </div>
      )}
      {!mobileCompact && !isMobile && !c && (
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #E5E5EA", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <AppLogo size={28} />
          <div style={{ fontSize: "15px", fontWeight: "300", color: "#1C1C1E", letterSpacing: "-0.02em", fontFamily: "Inter, sans-serif" }}>
            Bourse<span style={{ fontWeight: "900", letterSpacing: "-0.05em", backgroundImage: "linear-gradient(135deg, #2D6CB5, #5B9BD5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Next</span>
          </div>
        </div>
      )}
      {!mobileCompact && isMobile && (
        <div className="ba-sidebar-logo" style={{ padding: "20px 20px 16px", borderBottom: "1px solid #E5E5EA", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <AppLogo size={38} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "19px", fontWeight: "300", color: "#1C1C1E", letterSpacing: "-0.02em", fontFamily: "Inter, sans-serif" }}>Bourse<span style={{ fontWeight: "900", letterSpacing: "-0.05em", backgroundImage: "linear-gradient(135deg, #2D6CB5, #5B9BD5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Next</span></div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", color: "#6C6C70", cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}>✕</button>
        </div>
      )}

      {onSwitchAccount && (
        <div style={{ padding: (c || mobileCompact) ? "10px 8px" : "10px 16px", borderBottom: "1px solid #E5E5EA", flexShrink: 0 }}>
          {c ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
              {["PEA","CTO"].map(acc => (
                <button key={acc} onClick={() => onSwitchAccount(acc)} title={acc}
                  style={{ width: "36px", height: "26px", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "9px", fontWeight: "700", fontFamily: "Inter,sans-serif", background: account === acc ? "#F2F2F7" : "transparent", color: account === acc ? "#1C1C1E" : "#6C6C70" }}>
                  {acc}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", background: "#F2F2F7", borderRadius: "10px", padding: "3px", gap: "2px" }}>
              {["PEA","CTO"].map(acc => (
                <button key={acc} onClick={() => onSwitchAccount(acc)}
                  style={{ flex: 1, height: "28px", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "600", fontFamily: "Inter,sans-serif", transition: "all 0.18s", background: account === acc ? "#FFFFFF" : "transparent", color: account === acc ? "#1C1C1E" : "#6C6C70", boxShadow: account === acc ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                  {acc}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="ba-sidebar-nav" style={{ flex: 1, overflowY: "auto", padding: "8px 0", display: "flex", flexDirection: "column" }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} style={{ marginBottom: "2px" }}>
            {group.label && !c && !group.featured && (
              <div className="ba-sidebar-group-label" style={{ padding: "0 20px", marginBottom: "4px", marginTop: gi > 0 ? "2px" : 0, fontSize: "10px", fontWeight: "600", letterSpacing: "0.8px", color: "#8E8E93", fontFamily: "Inter,sans-serif", textTransform: "uppercase" }}>
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
                    padding: c ? "13px 0" : "11px 20px",
                    justifyContent: c ? "center" : "flex-start",
                    borderRadius: 0,
                    background: isActive ? "#F2F2F7" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: isActive ? "#1C1C1E" : "#6C6C70",
                    fontSize: "15px",
                    fontWeight: isActive ? "600" : "400",
                    fontFamily: "'Inter', 'Roboto', sans-serif",
                    textAlign: "left",
                    transition: "background 0.12s",
                    letterSpacing: "-0.01em",
                    position: "relative",
                  }}>
                  {c
                    ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                        {isFeatured
                          ? <span style={{ fontSize: "11px", fontWeight: "700", fontFamily: "Inter,sans-serif", color: isActive ? "#1C1C1E" : "#6C6C70", letterSpacing: "0.3px" }}>IA</span>
                          : <span style={{ color: isActive ? "#1C1C1E" : "#8E8E93" }}>{icon}</span>
                        }
                        {isScoringLoading && <span style={{ position: "absolute", top: "-3px", right: "-3px", width: "7px", height: "7px", borderRadius: "50%", background: "#B07D2E", animation: "pulse 1.2s ease-in-out infinite" }} />}
                      </span>
                    : <span style={{ flex: 1, display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ color: isActive ? "#1C1C1E" : "#8E8E93", display: "flex", alignItems: "center", flexShrink: 0 }}>{icon}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {label}
                          {isFeatured && !isActive && <span style={{ fontSize: "10px", background: "#F2F2F7", color: "#8E8E93", borderRadius: "5px", padding: "1px 6px", fontWeight: "600", letterSpacing: "0.3px", flexShrink: 0 }}>IA</span>}
                          {isScoringLoading && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#B07D2E", animation: "pulse 1.2s ease-in-out infinite", flexShrink: 0 }} />}
                        </span>
                      </span>
                  }
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {!mobileCompact && <div className="ba-sidebar-footer" style={{ padding: "10px 12px", borderTop: "1px solid #E5E5EA", display: "flex", gap: "5px", justifyContent: "center", flexShrink: 0 }}>
        {c ? (
          <button onClick={toggleCollapse} title="Déplier la sidebar"
            style={{ width: "34px", height: "34px", borderRadius: "8px", background: "#F2F2F7", border: "none", color: "#6C6C70", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,2 10,7 5,12"/></svg>
          </button>
        ) : (<>
          <button onClick={toggleCompact} title={compact ? "Mode normal" : "Mode compact (zoom arrière)"}
            style={{ flex: 1, height: "32px", borderRadius: "8px", background: compact ? "#E8F9EF" : "#F2F2F7", border: "none", color: compact ? "#1E8449" : "#6C6C70", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", transition: "all 0.2s" }}>
            {compact ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="7" x2="13" y2="7"/><line x1="7" y1="1" x2="7" y2="13"/><circle cx="7" cy="7" r="5.5"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="7" x2="13" y2="7"/><circle cx="7" cy="7" r="5.5"/></svg>
            )}
            <span style={{ fontSize: "9px", fontWeight: "600", fontFamily: "Inter,sans-serif" }}>{compact ? "Normal" : "Compact"}</span>
          </button>

          <button onClick={() => window.print()} title="Exporter en PDF"
            style={{ flex: 1, height: "32px", borderRadius: "8px", background: "#F2F2F7", border: "none", color: "#6C6C70", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", transition: "all 0.2s" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span style={{ fontSize: "9px", fontWeight: "600", fontFamily: "Inter,sans-serif" }}>PDF</span>
          </button>
        </>)}
      </div>}

      {!c && !mobileCompact && positions.length > 0 && <div className="ba-sidebar-pfcard" style={{ padding: "12px 12px 14px", flexShrink: 0 }}>
        <div style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2D5986 60%, #4A7FB5 100%)", borderRadius: "16px", padding: "16px 18px", boxShadow: "0 4px 16px rgba(30,58,95,0.18)" }}>
          <div style={{ fontSize: "9px", fontWeight: "700", color: "rgba(193,232,255,0.75)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>Portefeuille {account || "PEA"}</div>
          <div style={{ fontSize: "20px", fontWeight: "900", color: "#fff", letterSpacing: "-0.5px", marginBottom: "4px", ...(hidden ? { filter: "blur(7px)", userSelect: "none" } : {}) }}>{fmtEur(totalActuel)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.9)", fontWeight: "600", ...(hidden ? { filter: "blur(7px)", userSelect: "none" } : {}) }}>{(pv >= 0 ? "+" : "") + fmtEur(pv)}</span>
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
        <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: "272px", background: "#FFFFFF", borderRight: "1px solid #E5E5EA", display: "flex", flexDirection: "column", zIndex: 999, boxShadow: "4px 0 20px rgba(0,0,0,0.08)", animation: "slideInLeft 0.22s cubic-bezier(0.4,0,0.2,1)" }}>
          <SidebarContent {...sharedProps} collapsed={false} mobileCompact={false} onClose={onMobileClose} />
        </div>
      </>
    );
  }

  return (
    <div className="ba-sidebar" style={{ width: collapsed ? "56px" : "224px", minWidth: collapsed ? "56px" : "224px", height: "100vh", background: "#FFFFFF", borderRight: "1px solid #E5E5EA", display: "flex", flexDirection: "column", position: "sticky", top: 0, zIndex: 20, overflow: "hidden", transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)" }}>
      <SidebarContent {...sharedProps} onClose={null} />
    </div>
  );
}
