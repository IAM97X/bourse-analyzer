import { useState } from "react";
import { C, shadow } from "../constants/theme";

export const ONBOARDING_KEY = "bourse_onboarding_v1";

const ONBOARDING_STEPS = [
  { icon: "📊", title: "Bienvenue dans Orivo", body: "Votre compagnon d'investissement personnel. Suivez votre portefeuille, recevez des signaux IA et analysez vos performances." },
  { icon: "➕", title: "Ajoutez votre première position", body: "Cliquez sur « + Ajouter une position » dans l'onglet Portefeuille. Renseignez le nom, l'ISIN, le PRU et la quantité." },
  { icon: "🤖", title: "Signaux IA marché", body: "Cliquez sur « 🤖 Analyser toutes mes lignes » pour obtenir un avis IA sur chaque valeur : ACHAT, RENFORCER, PRUDENCE ou VENDRE." },
  { icon: "💬", title: "Votre assistant IA", body: "Posez vos questions dans l'onglet Assistant. Il vous explique les concepts financiers, analyse vos valeurs et répond 24h/24." },
  { icon: "⚙️", title: "Configurez votre profil", body: "Dans l'onglet Profil, renseignez votre horizon, tolérance au risque et les dates d'ouverture de vos comptes pour un calcul fiscal précis." },
];

export default function OnboardingGuide({ onDone }) {
  const [step, setStep] = useState(0);
  const s = ONBOARDING_STEPS[step];
  const isLast = step === ONBOARDING_STEPS.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,15,25,0.7)", backdropFilter: "blur(6px)", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "28px", padding: "36px 32px 28px", maxWidth: "400px", width: "100%", boxShadow: "0 32px 80px rgba(0,0,0,0.28)", textAlign: "center", animation: "fadeIn 0.3s ease" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginBottom: "28px" }}>
          {ONBOARDING_STEPS.map((_, i) => (
            <div key={i} style={{ width: i === step ? "20px" : "6px", height: "6px", borderRadius: "3px", background: i === step ? C.navy : C.border, transition: "all 0.3s" }} />
          ))}
        </div>
        <div style={{ width: "72px", height: "72px", borderRadius: "22px", background: C.paleBlue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", margin: "0 auto 20px" }}>{s.icon}</div>
        <div style={{ fontSize: "18px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", marginBottom: "12px", lineHeight: "1.3" }}>{s.title}</div>
        <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.65", marginBottom: "28px" }}>{s.body}</div>
        <div style={{ display: "flex", gap: "10px" }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{ flex: 1, padding: "12px", borderRadius: "14px", border: `1px solid ${C.border}`, background: C.snowOff, color: C.inkMuted, fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
              ← Retour
            </button>
          )}
          <button onClick={() => { if (isLast) { try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {} onDone(); } else setStep(s => s + 1); }}
            style={{ flex: 2, padding: "12px", borderRadius: "14px", border: "none", background: `linear-gradient(135deg, ${C.navy} 0%, #2563EB 100%)`, color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif", boxShadow: shadow.pill }}>
            {isLast ? "Commencer →" : "Suivant →"}
          </button>
        </div>
        {!isLast && (
          <button onClick={() => { try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {} onDone(); }}
            style={{ marginTop: "14px", background: "none", border: "none", color: C.inkSubtle, fontSize: "11px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            Passer l'introduction
          </button>
        )}
      </div>
    </div>
  );
}
