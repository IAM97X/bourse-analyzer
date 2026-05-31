import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { load } from "../lib/storage";
import AppLogo from "./AppLogo";

const BN_KEYFRAMES = `
  @keyframes bn-sp-rot1 { from{transform:rotate(-120deg)} to{transform:rotate(240deg)} }
  @keyframes bn-sp-rot2 { from{transform:rotate(30deg)}   to{transform:rotate(390deg)} }
  @keyframes bn-sp-rot3 { from{transform:rotate(150deg)}  to{transform:rotate(-210deg)} }
  @keyframes bn-sp-arc1 { 0%,100%{stroke-dasharray:8,74;stroke-dashoffset:0} 50%{stroke-dasharray:65,17;stroke-dashoffset:-28} }
  @keyframes bn-sp-arc2 { 0%,100%{stroke-dasharray:6,51;stroke-dashoffset:0} 50%{stroke-dasharray:44,13;stroke-dashoffset:-18} }
  @keyframes bn-sp-arc3 { 0%,100%{stroke-dasharray:4,31;stroke-dashoffset:0} 50%{stroke-dasharray:27,8;stroke-dashoffset:-11} }
  @keyframes bn-text-pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
  @keyframes bn-next-wave { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
`;

export function BNextLabel() {
  return (
    <>
      <style>{`@keyframes bn-next-wave{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`}</style>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: "300" }}>B</span>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: "800", letterSpacing: "-0.03em", backgroundImage: "linear-gradient(270deg,#0F2D5E,#2D6CB5,#7BBFE8,#2D6CB5,#0F2D5E)", backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "bn-next-wave 3s ease infinite" }}>Next</span>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: "300" }}>…</span>
    </>
  );
}

export function OrivoSpinner({ size = 52, label, sublabel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
      <style>{BN_KEYFRAMES}</style>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <defs>
          <linearGradient id="sp-g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1A3A6B"/><stop offset="100%" stopColor="#2563EB"/>
          </linearGradient>
          <linearGradient id="sp-g2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563EB"/><stop offset="100%" stopColor="#38BDF8"/>
          </linearGradient>
          <linearGradient id="sp-g3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38BDF8"/><stop offset="100%" stopColor="#7DD3FC"/>
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="13" stroke="url(#sp-g1)" strokeWidth="2.4" strokeLinecap="round" fill="none"
          style={{ transformOrigin:"16px 16px", animation:"bn-sp-rot1 2.8s linear infinite, bn-sp-arc1 1.4s ease-in-out infinite" }}/>
        <circle cx="16" cy="16" r="9"  stroke="url(#sp-g2)" strokeWidth="2"   strokeLinecap="round" fill="none"
          style={{ transformOrigin:"16px 16px", animation:"bn-sp-rot2 2.1s linear infinite, bn-sp-arc2 1.05s ease-in-out infinite" }}/>
        <circle cx="16" cy="16" r="5.5" stroke="url(#sp-g3)" strokeWidth="1.6" strokeLinecap="round" fill="none"
          style={{ transformOrigin:"16px 16px", animation:"bn-sp-rot3 1.6s linear infinite, bn-sp-arc3 0.8s ease-in-out infinite" }}/>
        <circle cx="16" cy="16" r="2" fill="#38BDF8" opacity="0.9"/>
      </svg>
      {(label || sublabel) && (
        <div style={{ textAlign: "center" }}>
          {label && <div style={{ fontSize: "13px", color: C.ink, fontWeight: "700", fontFamily: "'DM Sans', sans-serif", animation: "bn-text-pulse 2s ease-in-out infinite" }}>{label}</div>}
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
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: "14px", padding: mobile ? "18px 12px" : "16px 14px", textAlign: "center", boxShadow: shadow.card }}>
      <div style={{ fontSize: "9px", color: C.inkSubtle, letterSpacing: "0.08em", fontWeight: "500", marginBottom: "5px", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif" }}>{label}</div>
      <div style={{ fontSize: mobile ? "15px" : "13px", fontWeight: "600", color: color || C.ink, wordBreak: "break-word", lineHeight: "1.3", ...blurStyle }}>{value || "—"}</div>
    </div>
  );
}

export function Card({ title, icon, accentColor, children }) {
  const mobile = window.innerWidth < 768;
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: "16px", overflow: "hidden", marginBottom: "16px", boxShadow: shadow.card }}>
      <div style={{ padding: mobile ? "16px 20px 10px" : "18px 24px 10px", display: "flex", alignItems: "center", gap: "8px" }}>
        {icon && <span style={{ fontSize: "13px", opacity: 0.5 }}>{icon}</span>}
        <span style={{ fontSize: "10px", fontWeight: "600", color: C.inkSubtle, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif" }}>{title}</span>
      </div>
      <div className="ba-card-body" style={{ padding: mobile ? "0 20px 18px" : "0 24px 22px" }}>{children}</div>
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

export function LoadingPanel() {
  return (
    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "48px 32px", display: "flex", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
        <AppLogo size={52} animated={true} />
        <div style={{ fontSize: "14px", fontFamily: "'DM Sans', sans-serif" }}><BNextLabel /></div>
      </div>
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
          style={{ background: C.red, border: "none", borderRadius: "8px", padding: "8px 16px", color: "#fff", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}>
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
