import { useState } from "react";

export const ONBOARDING_KEY = "bourse_onboarding_v2";

const SVGChart = () => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
    <rect x="3"  y="26" width="8" height="15" rx="3" fill="white" fillOpacity="0.9"/>
    <rect x="14" y="18" width="8" height="23" rx="3" fill="white"/>
    <rect x="25" y="9"  width="8" height="32" rx="3" fill="white"/>
    <rect x="36" y="20" width="6" height="21" rx="3" fill="white" fillOpacity="0.7"/>
  </svg>
);

const SVGAI = () => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
    <circle cx="22" cy="22" r="9" stroke="white" strokeWidth="2.5"/>
    <circle cx="22" cy="22" r="3.5" fill="white"/>
    <line x1="22" y1="6"  x2="22" y2="13" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="22" y1="31" x2="22" y2="38" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="6"  y1="22" x2="13" y2="22" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="31" y1="22" x2="38" y2="22" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
    <line x1="11.5" y1="11.5" x2="16.5" y2="16.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6"/>
    <line x1="27.5" y1="27.5" x2="32.5" y2="32.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6"/>
  </svg>
);

const SVGTrend = () => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
    <polyline points="4,34 14,22 22,28 32,14 40,16" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <polyline points="32,14 40,14 40,22" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="4" y1="38" x2="40" y2="38" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.35"/>
  </svg>
);

const SVGCheck = () => (
  <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
    <path d="M8 22L17 31L36 12" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const SVGInfo = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2.5"/>
  </svg>
);

const SLIDES = [
  {
    type: "welcome",
    gradient: "linear-gradient(140deg, #1A3A6B 0%, #2D6CB5 60%, #4B9DD8 100%)",
  },
  {
    type: "disclaimer",
    gradient: "linear-gradient(140deg, #92400E 0%, #B45309 100%)",
  },
  {
    type: "feature",
    gradient: "linear-gradient(140deg, #1A3A6B 0%, #2D6CB5 100%)",
    Icon: SVGChart,
    title: "Suivi de portefeuille",
    desc: "Positions, cours en temps réel, plus-values et répartition sectorielle — PEA et CTO gérés séparément.",
  },
  {
    type: "feature",
    gradient: "linear-gradient(140deg, #3B0764 0%, #7C3AED 100%)",
    Icon: SVGAI,
    title: "Intelligence artificielle",
    desc: "Signaux marché, Autopilot DCA, Conseiller Privé et Portefeuille Autonome — quatre moteurs IA intégrés.",
  },
  {
    type: "feature",
    gradient: "linear-gradient(140deg, #064E3B 0%, #059669 100%)",
    Icon: SVGTrend,
    title: "Plan DCA & Simulateur",
    desc: "Versements réguliers intelligents et simulation de la croissance de votre capital sur 1 à 30 ans.",
  },
  {
    type: "ready",
    gradient: "linear-gradient(140deg, #1A3A6B 0%, #2D6CB5 60%, #4B9DD8 100%)",
    Icon: SVGCheck,
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
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,15,25,0.75)", backdropFilter: "blur(14px)", padding: "20px", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @keyframes onb-wave { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes onb-in   { from{opacity:0;transform:scale(0.96) translateY(12px)} to{opacity:1;transform:none} }
      `}</style>
      <div style={{ width: "100%", maxWidth: "400px", background: "#fff", borderRadius: "28px", overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.35)", animation: "onb-in 0.4s cubic-bezier(0.34,1.2,0.64,1)" }}>

        {/* Zone colorée */}
        <div style={{ background: s.gradient, padding: "40px 28px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "18px" }}>

          {s.type === "welcome" && (
            <>
              <div style={{ fontSize: "42px", fontWeight: "300", color: "rgba(255,255,255,0.9)", letterSpacing: "-0.03em", lineHeight: 1 }}>
                Bourse<span style={{ fontWeight: "900", letterSpacing: "-0.06em", backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.6), #fff, rgba(255,255,255,0.6))", backgroundSize: "200% 100%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "onb-wave 3s ease infinite" }}>Next</span>
              </div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", textAlign: "center" }}>
                Votre espace de suivi et d'analyse boursière
              </div>
            </>
          )}

          {s.type === "disclaimer" && (
            <>
              <div style={{ width: "60px", height: "60px", borderRadius: "18px", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SVGInfo />
              </div>
              <div style={{ fontSize: "21px", fontWeight: "700", color: "#fff", textAlign: "center", letterSpacing: "-0.02em" }}>Information légale</div>
            </>
          )}

          {(s.type === "feature" || s.type === "ready") && s.Icon && (
            <>
              <div style={{ width: "80px", height: "80px", borderRadius: "24px", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <s.Icon />
              </div>
              <div style={{ fontSize: "21px", fontWeight: "700", color: "#fff", textAlign: "center", letterSpacing: "-0.02em" }}>
                {s.type === "ready" ? "Tout est prêt" : s.title}
              </div>
            </>
          )}

          {/* Points de progression */}
          <div style={{ display: "flex", gap: "5px" }}>
            {SLIDES.map((_, i) => (
              <div key={i} onClick={() => setStep(i)} style={{ width: i === step ? "20px" : "6px", height: "6px", borderRadius: "3px", background: i === step ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.3)", transition: "all 0.3s ease", cursor: "pointer" }} />
            ))}
          </div>
        </div>

        {/* Zone blanche */}
        <div style={{ padding: "28px 28px 24px" }}>
          {s.type === "welcome" && (
            <p style={{ fontSize: "14px", color: "#4B5563", lineHeight: "1.7", margin: "0 0 28px", textAlign: "center" }}>
              Quelques secondes pour découvrir tout ce que BourseNext peut faire pour votre portefeuille.
            </p>
          )}

          {s.type === "disclaimer" && (
            <div style={{ fontSize: "12px", color: "#4B5563", lineHeight: "1.85", marginBottom: "24px" }}>
              BourseNext est un <strong style={{ color: "#1C1C1E" }}>outil de suivi et d'aide à la décision</strong> — il ne constitue pas un conseil en investissement financier au sens de la réglementation AMF.
              <br/><br/>
              Les analyses générées par l'IA sont fournies à titre <strong style={{ color: "#1C1C1E" }}>purement informatif</strong>. Elles ne tiennent pas compte de votre situation patrimoniale complète ni de votre tolérance au risque.
              <br/><br/>
              <strong style={{ color: "#1C1C1E" }}>Tout investissement comporte un risque de perte en capital.</strong> Consultez un conseiller financier agréé pour toute décision importante.
            </div>
          )}

          {s.type === "feature" && (
            <p style={{ fontSize: "14px", color: "#4B5563", lineHeight: "1.7", margin: "0 0 28px", textAlign: "center" }}>
              {s.desc}
            </p>
          )}

          {s.type === "ready" && (
            <p style={{ fontSize: "14px", color: "#4B5563", lineHeight: "1.7", margin: "0 0 28px", textAlign: "center" }}>
              Commencez par ajouter vos positions dans l'onglet <strong style={{ color: "#1C1C1E" }}>Portefeuille</strong>. Vous pouvez relancer ce guide à tout moment depuis la barre latérale.
            </p>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            {step > 0 && (
              <button onClick={prev} style={{ padding: "12px 16px", borderRadius: "14px", border: "1px solid #E5E5EA", background: "#F9F9F9", color: "#6C6C70", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>←</button>
            )}
            <button onClick={next} style={{ flex: 1, padding: "13px", borderRadius: "14px", border: "none", background: s.gradient, color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif", boxShadow: "0 4px 14px rgba(45,108,181,0.3)" }}>
              {isLast ? "Commencer →" : s.type === "disclaimer" ? "J'ai compris →" : "Suivant →"}
            </button>
          </div>

          {step > 1 && !isLast && (
            <button onClick={finish} style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: "#9CA3AF", fontSize: "12px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>Passer</button>
          )}
        </div>
      </div>
    </div>
  );
}
