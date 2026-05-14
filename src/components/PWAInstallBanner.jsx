import { useState } from "react";
import { C, shadow } from "../constants/theme";
import { load, save } from "../lib/storage";

function PWAInstallBanner() {
  const isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  const [visible, setVisible] = useState(() => {
    if (!isIOS || isStandalone) return false;
    return !load("bourse_pwa_dismissed", false);
  });

  if (!visible) return null;

  const dismiss = () => { save("bourse_pwa_dismissed", true); setVisible(false); };

  return (
    <div style={{
      position: "fixed", bottom: "66px", left: "12px", right: "12px",
      background: C.snow, border: `1px solid ${C.border}`,
      borderRadius: "16px", padding: "14px 16px",
      boxShadow: "0 4px 24px rgba(30,58,95,0.12)",
      display: "flex", alignItems: "flex-start", gap: "12px",
      zIndex: 200, animation: "fadeIn 0.3s ease",
    }}>
      <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2v10M6 6l4-4 4 4" stroke="#1E3A5F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 13v4a1 1 0 001 1h12a1 1 0 001-1v-4" stroke="#1E3A5F" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink, marginBottom: "4px" }}>
          Protégez vos données
        </div>
        <div style={{ fontSize: "11px", color: C.inkMuted, lineHeight: "1.5" }}>
          Sur iOS, Safari peut effacer le stockage local. Ajoutez ce site à l'écran d'accueil pour un stockage durable.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "8px", background: C.snowOff, borderRadius: "8px", padding: "6px 10px" }}>
          <span style={{ fontSize: "10px", color: C.inkMuted }}>Appuyez sur</span>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
            <path d="M10 2v10M6 6l4-4 4 4" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 13v4a1 1 0 001 1h12a1 1 0 001-1v-4" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: "10px", color: C.inkMuted }}>puis</span>
          <span style={{ fontSize: "10px", fontWeight: "700", color: C.navy, background: C.navyLight, borderRadius: "5px", padding: "1px 6px" }}>Sur l'écran d'accueil</span>
        </div>
      </div>
      <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: C.inkMuted, flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}


export default PWAInstallBanner;
