import { useState } from "react";
import { C } from "../constants/theme";

export const ONBOARDING_KEY = "bourse_onboarding_v2";

const IconChart = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <rect x="2"  y="18" width="5" height="8"  rx="1.5" fill="#2D6CB5" opacity="0.9"/>
    <rect x="9"  y="13" width="5" height="13" rx="1.5" fill="#2D6CB5"/>
    <rect x="16" y="7"  width="5" height="19" rx="1.5" fill="#4B9DD8"/>
    <rect x="23" y="15" width="3" height="11" rx="1.5" fill="#2D6CB5" opacity="0.6"/>
  </svg>
);

const IconAI = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="6" stroke="#2D6CB5" strokeWidth="1.8"/>
    <circle cx="14" cy="14" r="2.5" fill="#2D6CB5"/>
    <line x1="14" y1="3"  x2="14" y2="8"  stroke="#2D6CB5" strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="14" y1="20" x2="14" y2="25" stroke="#2D6CB5" strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="3"  y1="14" x2="8"  y2="14" stroke="#2D6CB5" strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="20" y1="14" x2="25" y2="14" stroke="#2D6CB5" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const IconTrend = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="2"  y="22" width="5" height="8"  rx="1.5" fill="#2D6CB5" opacity="0.4"/>
    <rect x="9"  y="16" width="5" height="14" rx="1.5" fill="#2D6CB5" opacity="0.65"/>
    <rect x="16" y="10" width="5" height="20" rx="1.5" fill="#2D6CB5" opacity="0.85"/>
    <rect x="23" y="4"  width="5" height="26" rx="1.5" fill="#2D6CB5"/>
    <polyline points="3,20 10,14 17,8 25,4" stroke="#4B9DD8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconCheck = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="11" stroke="#2D6CB5" strokeWidth="1.8"/>
    <path d="M8 14l4 4 8-8" stroke="#2D6CB5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconInfo = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="11" stroke="#B45309" strokeWidth="1.8"/>
    <line x1="14" y1="9"  x2="14" y2="14" stroke="#B45309" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="14" cy="18.5" r="1.2" fill="#B45309"/>
  </svg>
);

const SLIDES = [
  {
    type: "welcome",
    title: "Bienvenue sur BourseNext",
    desc: "Quelques secondes pour découvrir ce que l'app peut faire pour votre portefeuille.",
  },
  {
    type: "disclaimer",
    Icon: IconInfo,
    title: "Information légale",
  },
  {
    type: "feature",
    Icon: IconChart,
    title: "Suivi de portefeuille",
    desc: "Positions, cours en temps réel, plus-values et répartition sectorielle — PEA et CTO séparément.",
  },
  {
    type: "feature",
    Icon: IconAI,
    title: "Intelligence artificielle",
    desc: "Signaux marché, Opportunités, Conseiller Privé et Portefeuille Autonome — quatre outils intégrés.",
  },
  {
    type: "feature",
    Icon: IconTrend,
    title: "Plan DCA & Simulateur",
    desc: "Versements réguliers intelligents et simulation de la croissance de votre capital sur 1 à 30 ans.",
  },
  {
    type: "ready",
    Icon: IconCheck,
    title: "Tout est prêt",
    desc: "Commencez par ajouter vos positions dans Portefeuille. Relancez ce guide à tout moment via le bouton « ? » en bas de la sidebar.",
  },
];

export default function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const s = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  const finish = () => {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
    onComplete();
  };

  const next = () => { if (isLast) finish(); else setStep(v => v + 1); };
  const prev = () => { if (step > 0) setStep(v => v - 1); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,15,25,0.6)", backdropFilter: "blur(14px)", padding: "20px", fontFamily: "'DM Sans', Inter, sans-serif" }}>
      <style>{`
        @keyframes onb-in  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes bn-wave { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
      `}</style>
      <div style={{ width: "100%", maxWidth: "380px", background: "#fff", borderRadius: "24px", padding: "36px 32px 28px", boxShadow: "0 24px 60px rgba(0,0,0,0.18)", animation: "onb-in 0.3s ease" }}>

        {/* Icône */}
        <div style={{ marginBottom: "20px" }}>
          {s.type === "welcome"
            ? <div style={{ fontSize: "22px", fontWeight: "300", color: C.inkSoft, letterSpacing: "-0.01em", fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>
                Bourse<span style={{ fontWeight: "800", letterSpacing: "-0.04em", fontFamily: "'DM Sans', sans-serif", backgroundImage: C.accentGrad, backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "bn-wave 4s ease infinite" }}>Next</span>
              </div>
            : s.Icon && <s.Icon />
          }
        </div>

        {/* Titre */}
        <div style={{ fontSize: "20px", fontWeight: "700", color: "#111827", letterSpacing: "-0.02em", marginBottom: "12px", lineHeight: 1.25, fontFamily: "'DM Sans', sans-serif" }}>
          {s.title}
        </div>

        {/* Contenu */}
        {s.type === "disclaimer" ? (
          <div style={{ fontSize: "12.5px", color: "#6B7280", lineHeight: "1.85", marginBottom: "28px" }}>
            BourseNext est un <strong style={{ color: "#374151" }}>outil de suivi et d'aide à la décision</strong> — il ne constitue pas un conseil en investissement financier au sens de la réglementation AMF.
            <br/><br/>
            Les analyses IA sont fournies à titre <strong style={{ color: "#374151" }}>purement informatif</strong>. Elles ne tiennent pas compte de votre situation patrimoniale complète.
            <br/><br/>
            <strong style={{ color: "#374151" }}>Tout investissement comporte un risque de perte en capital.</strong>
          </div>
        ) : (
          <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: "1.7", margin: "0 0 32px" }}>
            {s.desc}
          </p>
        )}

        {/* Dots */}
        <div style={{ display: "flex", gap: "5px", marginBottom: "20px" }}>
          {SLIDES.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{ width: i === step ? "18px" : "6px", height: "6px", borderRadius: "3px", background: i === step ? "#2D6CB5" : "#E5E7EB", transition: "all 0.25s", cursor: "pointer" }} />
          ))}
        </div>

        {/* Boutons */}
        <div style={{ display: "flex", gap: "8px" }}>
          {step > 0 && (
            <button onClick={prev} style={{ padding: "11px 16px", borderRadius: "12px", border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>←</button>
          )}
          <button onClick={next} style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "none", background: "#2D6CB5", color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {isLast ? "Commencer" : s.type === "disclaimer" ? "J'ai compris" : "Suivant"}
          </button>
        </div>

        {step > 1 && !isLast && (
          <button onClick={finish} style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: "#9CA3AF", fontSize: "12px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Passer</button>
        )}
      </div>
    </div>
  );
}
