import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { load } from "../lib/storage";

const ORIVO_KEYFRAMES = `
  @keyframes orivo-e1 { from { transform: rotate(-28deg); } to { transform: rotate(332deg); } }
  @keyframes orivo-e2 { from { transform: rotate(0deg);   } to { transform: rotate(360deg); } }
  @keyframes orivo-e3 { from { transform: rotate(28deg);  } to { transform: rotate(388deg); } }
  @keyframes orivo-text-pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
`;

export function OrivoSpinner({ size = 52, label, sublabel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
      <style>{ORIVO_KEYFRAMES}</style>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <defs>
          <linearGradient id="ospbg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#040E1C"/>
            <stop offset="100%" stopColor="#0D2540"/>
          </linearGradient>
          <linearGradient id="ospe1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1A4A8A"/>
            <stop offset="100%" stopColor="#2D6CB5"/>
          </linearGradient>
          <linearGradient id="ospe2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2E72BE"/>
            <stop offset="100%" stopColor="#4B9DD8"/>
          </linearGradient>
          <linearGradient id="ospe3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4BA8E0"/>
            <stop offset="100%" stopColor="#85CFEF"/>
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#ospbg)"/>
        <ellipse cx="14" cy="16" rx="5.8" ry="9.5"
          stroke="url(#ospe1)" strokeWidth="2.2" fill="none"
          style={{ transformOrigin: "16px 16px", animation: "orivo-e1 1.8s linear infinite" }}/>
        <ellipse cx="16" cy="16" rx="5.8" ry="9.5"
          stroke="url(#ospe2)" strokeWidth="2.2" fill="none"
          style={{ transformOrigin: "16px 16px", animation: "orivo-e2 2.4s linear infinite" }}/>
        <ellipse cx="18" cy="16" rx="5.8" ry="9.5"
          stroke="url(#ospe3)" strokeWidth="2.2" fill="none"
          style={{ transformOrigin: "16px 16px", animation: "orivo-e3 3.2s linear infinite" }}/>
      </svg>
      {(label || sublabel) && (
        <div style={{ textAlign: "center" }}>
          {label && <div style={{ fontSize: "13px", color: C.ink, fontWeight: "700", fontFamily: "Inter,sans-serif", animation: "orivo-text-pulse 2s ease-in-out infinite" }}>{label}</div>}
          {sublabel && <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "4px" }}>{sublabel}</div>}
        </div>
      )}
    </div>
  );
}

export function StatBox({ label, value, color, sensitive }) {
  const hidden  = sensitive && load("bourse_hidden", false);
  const mobile  = window.innerWidth < 768;
  const blurStyle = hidden ? { filter: "blur(7px)", userSelect: "none", pointerEvents: "none" } : {};
  return (
    <div style={{ background: C.cardGrad, border: `1px solid ${C.border}`, borderRadius: "20px", padding: mobile ? "22px 14px" : "20px 16px", textAlign: "center", boxShadow: shadow.card }}>
      <div style={{ fontSize: mobile ? "10px" : "9px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "6px", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: mobile ? "16px" : "13px", fontWeight: "700", color: color || C.ink, wordBreak: "break-word", lineHeight: "1.3", ...blurStyle }}>{value || "—"}</div>
    </div>
  );
}

export function Card({ title, icon, accentColor, children }) {
  const mobile = window.innerWidth < 768;
  return (
    <div style={{ background: C.cardGrad, borderRadius: "22px", overflow: "hidden", marginBottom: "20px", boxShadow: shadow.card }}>
      <div style={{ padding: mobile ? "18px 22px 12px" : "22px 28px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
        {icon && <span style={{ fontSize: "14px", opacity: 0.6 }}>{icon}</span>}
        <span style={{ fontSize: "11px", fontWeight: "600", color: C.inkSubtle, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</span>
      </div>
      <div className="ba-card-body" style={{ padding: mobile ? "0 22px 20px" : "0 28px 26px" }}>{children}</div>
    </div>
  );
}

export function ThinkingSpinner({ size = 22, color = "#1A3A5C" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}>
      <path d="M12 1.5C10.8 1.5 9.75 2.1 9.75 3.75C9.75 5.1 10.5 6.3 12 6.75C13.5 6.3 14.25 5.1 14.25 3.75C14.25 2.1 13.2 1.5 12 1.5Z" fill={color} opacity="1"/>
      <path d="M22.5 12C22.5 10.8 21.9 9.75 20.25 9.75C18.9 9.75 17.7 10.5 17.25 12C17.7 13.5 18.9 14.25 20.25 14.25C21.9 14.25 22.5 13.2 22.5 12Z" fill={color} opacity="0.75"/>
      <path d="M12 22.5C13.2 22.5 14.25 21.9 14.25 20.25C14.25 18.9 13.5 17.7 12 17.25C10.5 17.7 9.75 18.9 9.75 20.25C9.75 21.9 10.8 22.5 12 22.5Z" fill={color} opacity="0.5"/>
      <path d="M1.5 12C1.5 13.2 2.1 14.25 3.75 14.25C5.1 14.25 6.3 13.5 6.75 12C6.3 10.5 5.1 9.75 3.75 9.75C2.1 9.75 1.5 10.8 1.5 12Z" fill={color} opacity="0.25"/>
    </svg>
  );
}

export function LoadingPanel({ label = "Analyse en cours…" }) {
  return (
    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "48px 32px", display: "flex", justifyContent: "center" }}>
      <OrivoSpinner size={52} label={label} />
    </div>
  );
}

export function ErrorPanel({ message, onRetry, retryLabel = "Réessayer" }) {
  const [countdown, setCountdown] = useState(null);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { setCountdown(null); onRetry?.(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, onRetry]);

  const isRetryable = message?.includes("temporairement");
  return (
    <div style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "16px", padding: "18px 20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
      <span style={{ color: C.red, fontSize: "13px", fontWeight: "500", flex: 1 }}>✕ {message}</span>
      {onRetry && (
        <button onClick={() => { if (countdown === null) { setCountdown(isRetryable ? 5 : 0); } }}
          style={{ background: C.red, border: "none", borderRadius: "8px", padding: "8px 16px", color: "#fff", fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}>
          {countdown !== null ? `${retryLabel} (${countdown}s)` : retryLabel}
        </button>
      )}
    </div>
  );
}

export function PersonalAdvice({ data, profil }) {
  const risk = profil?.risque || "equilibre";
  if (!data) return null;
  const advice = data.conseil_personnalise;
  if (!advice) return null;
  return (
    <div style={{ background: "linear-gradient(135deg, rgba(26,58,92,0.07) 0%, rgba(200,151,42,0.07) 100%)", border: `1px solid ${C.navyLight}`, borderRadius: "14px", padding: "16px 18px", marginTop: "14px" }}>
      <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
        Conseil personnalisé · profil {risk}
      </div>
      <div style={{ fontSize: "13px", color: C.ink, lineHeight: "1.65", fontStyle: "italic" }}>
        "{advice}"
      </div>
    </div>
  );
}
