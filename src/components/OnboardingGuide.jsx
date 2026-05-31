import { useState } from "react";
import { C } from "../constants/theme";
import AppLogo from "./AppLogo";

export const ONBOARDING_KEY = "bourse_onboarding_v1";

const STEPS = [
  {
    visual: null,
    tag: null,
    title: "Bienvenue sur BourseNext",
    body: "Votre tableau de bord d'investissement personnel. Suivez votre portefeuille, pilotez vos DCA et laissez l'IA travailler pour vous.",
    cta: "Découvrir →",
  },
  {
    visual: null,
    tag: "Vue d'ensemble",
    title: "Votre patrimoine en un coup d'œil",
    body: "L'accueil affiche votre patrimoine total, vos plus-values PEA et CTO en temps réel. C'est votre point de départ à chaque connexion.",
    cta: "Suivant →",
  },
  {
    visual: null,
    tag: "Positions & Marché",
    title: "Suivez vos titres en temps réel",
    body: "Ajoutez vos positions (ISIN, PRU, quantité) — les cours sont mis à jour automatiquement. L'onglet Marché analyse corrélations et performance vs indices.",
    cta: "Suivant →",
  },
  {
    visual: null,
    tag: "DCA & Projection",
    title: "Construisez votre avenir",
    body: "Définissez votre versement mensuel, visualisez votre capital dans 10, 20 ou 30 ans, et simulez votre retraite avec fiscalité PEA intégrée.",
    cta: "Suivant →",
  },
  {
    visual: null,
    tag: "Intelligence Artificielle",
    title: "L'IA analyse, vous décidez",
    body: "Scoring marché en temps réel, Autopilot pour scanner tout votre portefeuille, et un assistant financier disponible 24h/24 pour répondre à vos questions.",
    cta: "Suivant →",
  },
  {
    visual: null,
    tag: "Profil & Clé API",
    title: "Prêt en 2 minutes",
    body: "Renseignez votre profil investisseur et ajoutez votre clé Claude (Anthropic) pour activer toutes les fonctionnalités IA. Vos données restent dans votre navigateur.",
    cta: "Commencer →",
  },
];

export default function OnboardingGuide({ onDone }) {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const s = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const next = () => {
    if (isLast) finish();
    else setStep(v => v + 1);
  };
  const prev = () => setStep(v => v - 1);
  const finish = () => {
    setExiting(true);
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
    setTimeout(onDone, 260);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(8,12,22,0.94)",
      padding: "20px",
      opacity: exiting ? 0 : 1,
      transition: "opacity 0.26s ease",
    }}>
      <style>{`
        @keyframes ob-in { from { opacity:0; transform:translateY(18px) scale(0.97); } to { opacity:1; transform:none; } }
      `}</style>

      <div key={step} style={{
        background: "#fff",
        borderRadius: "28px",
        padding: "36px 32px 28px",
        maxWidth: "420px",
        width: "100%",
        boxShadow: "0 40px 100px rgba(0,0,0,0.4)",
        textAlign: "center",
        animation: "ob-in 0.28s cubic-bezier(0.34,1.56,0.64,1)",
      }}>

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "5px", marginBottom: "28px" }}>
          {STEPS.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              width: i === step ? "22px" : "6px", height: "6px",
              borderRadius: "3px",
              background: i < step ? C.navy : i === step ? C.accent : C.border,
              transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
              cursor: "pointer",
              opacity: i > step ? 0.4 : 1,
            }} />
          ))}
        </div>

        {/* Visual / Icon */}
        {isFirst ? (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
            <div style={{ width: "80px", height: "80px", borderRadius: "24px", background: "linear-gradient(135deg, #E8F0FB, #D0E4F7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AppLogo size={44} />
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: "20px" }}>
            {s.tag && (
              <span style={{ display: "inline-block", fontSize: "10px", fontWeight: "700", color: C.accent, background: "rgba(59,130,246,0.09)", borderRadius: "6px", padding: "3px 9px", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "12px" }}>
                {s.tag}
              </span>
            )}
            <div style={{ width: "72px", height: "72px", borderRadius: "22px", background: "linear-gradient(135deg, #E8F0FB, #D0E4F7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "30px", margin: "0 auto 0" }}>
              {s.visual}
            </div>
          </div>
        )}

        {/* Title */}
        <div style={{ fontSize: "19px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", marginBottom: "10px", lineHeight: "1.25" }}>
          {s.title}
        </div>

        {/* Body */}
        <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.7", marginBottom: "28px" }}>
          {s.body}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          {!isFirst && (
            <button onClick={prev} style={{
              flex: 1, padding: "12px", borderRadius: "14px",
              border: `1px solid ${C.border}`, background: C.snowOff,
              color: C.inkMuted, fontSize: "13px", fontWeight: "600",
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>
              ← Retour
            </button>
          )}
          <button onClick={next} style={{
            flex: 2, padding: "12px", borderRadius: "14px",
            border: "none",
            background: `linear-gradient(135deg, ${C.navy} 0%, #2563EB 100%)`,
            color: "#fff", fontSize: "13px", fontWeight: "700",
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            boxShadow: "0 4px 14px rgba(26,74,138,0.35)",
          }}>
            {s.cta}
          </button>
        </div>

        {/* Skip */}
        {!isLast && (
          <button onClick={finish} style={{
            marginTop: "14px", background: "none", border: "none",
            color: C.inkSubtle, fontSize: "11px", cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Passer l'introduction
          </button>
        )}
      </div>
    </div>
  );
}
