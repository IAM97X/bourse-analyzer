import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { load } from "../lib/storage";

const BN_KEYFRAMES = `
  @keyframes sonic3d-sp { 0%,100%{transform:scaleY(0.08);opacity:0.5} 45%,55%{transform:scaleY(1);opacity:1} }
  @keyframes bn-text-pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
`;

const SP_RINGS = [
  { rx: 11,  ry: 4.2,  sw: 4.8, back: "#071828", front: "#1D4ED8", hl: "#60A5FA", delay: "0s"   },
  { rx: 7.5, ry: 2.85, sw: 4.2, back: "#0D2240", front: "#2563EB", hl: "#93C5FD", delay: "0.2s" },
  { rx: 4,   ry: 1.52, sw: 3.6, back: "#132E56", front: "#3B82F6", hl: "#BAE6FD", delay: "0.4s" },
];

export function OrivoSpinner({ size = 52, label, sublabel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
      <style>{BN_KEYFRAMES}</style>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        {SP_RINGS.map(({ rx, ry, sw, back, front, hl, delay }, i) => {
          const lx = 16 - rx, rx_ = 16 + rx;
          const hlx1 = 16 - rx * 0.5, hlx2 = 16 + rx * 0.5;
          const hly = 16 - ry * 0.87;
          return (
            <g key={i} vectorEffect="non-scaling-stroke"
              style={{ transformOrigin: "16px 16px", animation: `sonic3d-sp 1.8s ease-in-out infinite`, animationDelay: delay }}>
              <path d={`M ${rx_} 16 A ${rx} ${ry} 0 0 1 ${lx} 16`}
                stroke={back} strokeWidth={sw} strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke"/>
              <path d={`M ${lx} 16 A ${rx} ${ry} 0 0 1 ${rx_} 16`}
                stroke={front} strokeWidth={sw} strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke"/>
              <path d={`M ${hlx1} ${hly} A ${rx} ${ry} 0 0 1 ${hlx2} ${hly}`}
                stroke={hl} strokeWidth={sw * 0.38} strokeLinecap="round" fill="none"
                opacity="0.85" vectorEffect="non-scaling-stroke"/>
            </g>
          );
        })}
      </svg>
      {(label || sublabel) && (
        <div style={{ textAlign: "center" }}>
          {label && <div style={{ fontSize: "13px", color: C.ink, fontWeight: "700", fontFamily: "Inter,sans-serif", animation: "bn-text-pulse 2s ease-in-out infinite" }}>{label}</div>}
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
