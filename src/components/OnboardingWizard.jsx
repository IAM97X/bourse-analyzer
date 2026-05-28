import { useState } from "react";
import { C, shadow } from "../constants/theme";

export const ONBOARDING_KEY = "bourse_onboarding_v1";

const SLIDES = [
  {
    icon: "⚠️",
    title: "Information importante",
    desc: null, // rendered separately
    color: "rgba(245,158,11,0.07)",
    disclaimer: true,
  },
  {
    icon: "📊",
    title: "Suivez votre portefeuille",
    desc: "Ajoutez vos positions, consultez vos cours en temps réel, vos plus-values et la répartition sectorielle de votre portefeuille PEA ou CTO.",
    color: "rgba(30,58,95,0.06)",
  },
  {
    icon: "🧠",
    title: "L'IA analyse pour vous",
    desc: "Signaux IA, Autopilot, Conseiller privé et Portefeuille IA autonome — quatre outils pour analyser, recommander et agir sur votre portefeuille.",
    color: "rgba(59,130,246,0.06)",
  },
  {
    icon: "🎯",
    title: "Planifiez votre DCA",
    desc: "Définissez votre versement mensuel et laissez l'IA calculer le meilleur moment et les meilleures valeurs pour renforcer votre portefeuille.",
    color: "rgba(5,150,105,0.06)",
  },
  {
    icon: "⚙️",
    title: "Configurez à votre rythme",
    desc: "Renseignez votre profil, votre courtier et vos clés API dans Compte → Profil et Paramètres. Des infobulles vous guident partout dans l'app.",
    color: "rgba(245,158,11,0.06)",
  },
];

export default function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(0);

  const isLast = step === SLIDES.length - 1;
  const s = SLIDES[step];

  const finish = () => {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
    onComplete();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,15,25,0.72)", backdropFilter: "blur(8px)", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "28px", padding: "36px 28px 28px", maxWidth: "400px", width: "100%", boxShadow: shadow.float }}>

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginBottom: "32px" }}>
          {SLIDES.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{ width: i === step ? "22px" : "6px", height: "6px", borderRadius: "3px", background: i <= step ? C.navyPill : C.border, transition: "all 0.3s", cursor: "pointer" }} />
          ))}
        </div>

        {/* Icon */}
        <div style={{ width: "72px", height: "72px", borderRadius: "22px", background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", margin: "0 auto 20px" }}>
          {s.icon}
        </div>

        {/* Text */}
        <div style={{ fontSize: "20px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", textAlign: "center", marginBottom: "10px", lineHeight: 1.2 }}>
          {s.title}
        </div>
        {s.disclaimer ? (
          <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "14px", padding: "16px 18px", marginBottom: "24px", fontSize: "12px", color: "#78350F", lineHeight: "1.75" }}>
            Bourse Analyzer est un <strong>outil de suivi et d'aide à la décision</strong> — il ne constitue pas un conseil en investissement financier au sens de la réglementation AMF.<br/><br/>
            Les analyses, scores et recommandations générés par l'IA sont fournis à titre <strong>purement informatif</strong>. Ils ne tiennent pas compte de votre situation patrimoniale complète, de vos objectifs personnels ni de votre tolérance au risque individuelle.<br/><br/>
            <strong>Tout investissement comporte un risque de perte en capital.</strong> Les performances passées ne préjugent pas des performances futures. Consultez un conseiller financier agréé pour toute décision d'investissement importante.
          </div>
        ) : (
          <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.7", textAlign: "center", marginBottom: "32px" }}>
            {s.desc}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px" }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{ padding: "12px 16px", borderRadius: "14px", border: `1px solid ${C.border}`, background: C.snowOff, color: C.inkMuted, fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
              ←
            </button>
          )}
          <button onClick={isLast ? finish : () => setStep(s => s + 1)}
            style={{ flex: 1, padding: "13px", borderRadius: "14px", border: "none", background: `linear-gradient(135deg, ${C.navyPill} 0%, #2563EB 100%)`, color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif", boxShadow: shadow.pill }}>
            {isLast ? "Commencer →" : s.disclaimer ? "J'ai compris →" : "Suivant →"}
          </button>
        </div>

        {/* Skip — masqué sur la slide disclaimer */}
        {!s.disclaimer && (
          <button onClick={finish}
            style={{ display: "block", margin: "14px auto 0", background: "none", border: "none", color: C.inkSubtle, fontSize: "12px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            Passer →
          </button>
        )}

      </div>
    </div>
  );
}
