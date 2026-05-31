import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { TABS } from "../constants/tabs";

const TOUR_KEY = "boursenext_tour_v1";

const STEPS = [
  {
    tab: TABS.HOME,
    title: "Accueil — vue d'ensemble",
    body: "Valorisation totale, performances du jour et depuis l'achat, graphique d'évolution et résumé des signaux IA.",
  },
  {
    tab: TABS.PORTFOLIO,
    title: "Portefeuille — vos positions",
    body: "Ajoutez vos actions et ETF. Cours en temps réel, plus-values, répartition sectorielle et miniature par ligne.",
  },
  {
    tab: TABS.MARCHE,
    title: "Signaux IA — scoring dynamique",
    body: "L'IA analyse chaque valeur : actualités, RSI, signaux techniques. Score /20 avec recommandation ACHAT / RENFORCER / ATTENDRE / VENDRE.",
  },
  {
    tab: TABS.AUTOPILOT,
    title: "Autopilot Atlas — DCA intelligent",
    body: "Définissez votre budget mensuel. L'IA calcule les meilleures opportunités de renforcement dans l'univers PEA éligible.",
  },
  {
    tab: TABS.CHAT,
    title: "Conseiller Privé",
    body: "Posez toutes vos questions sur vos valeurs, la stratégie ou l'allocation. L'IA connaît votre portefeuille et vos analyses.",
  },
  {
    tab: TABS.AI_PORTFOLIO,
    title: "Portefeuille Autonome",
    body: "Un second portefeuille géré entièrement par l'IA — investissement, arbitrage et protection automatiques avec stop-loss.",
  },
  {
    tab: TABS.PORTFOLIO,
    title: "Prêt à commencer",
    body: "Ajoutez votre première position dans Portefeuille. Ce guide est accessible à tout moment via le bouton « ? » en bas de la sidebar.",
    isLast: true,
  },
];

export function shouldShowTour() {
  try { return !localStorage.getItem(TOUR_KEY); } catch { return false; }
}

export function markTourDone() {
  try { localStorage.setItem(TOUR_KEY, "1"); } catch {}
}

export default function TourGuide({ onDone, changeTab }) {
  const [step, setStep] = useState(0);
  const [animDir, setAnimDir] = useState(1);

  useEffect(() => {
    changeTab(STEPS[0].tab);
  }, []);

  const goTo = (i) => {
    if (i < 0 || i >= STEPS.length) return;
    setAnimDir(i > step ? 1 : -1);
    setStep(i);
    changeTab(STEPS[i].tab);
  };

  const finish = () => {
    markTourDone();
    onDone();
  };

  const s = STEPS[step];
  const isLast = !!s.isLast;
  const mobile = window.innerWidth < 768;

  return (
    <>
      {/* Overlay semi-transparent */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1500,
        background: "rgba(4,14,28,0.45)",
        backdropFilter: "blur(2px)",
        pointerEvents: "none",
      }} />

      {/* Bulle guide */}
      <div style={{
        position: "fixed",
        bottom: mobile ? "16px" : "28px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1501,
        width: mobile ? "calc(100vw - 32px)" : "420px",
        background: "#fff",
        borderRadius: "24px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.12)",
        overflow: "hidden",
        animation: "tourSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <style>{`
          @keyframes tourSlideUp {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
        `}</style>

        {/* Barre de progression */}
        <div style={{ height: "3px", background: C.border, position: "relative" }}>
          <div style={{
            position: "absolute", left: 0, top: 0, height: "100%",
            width: `${((step + 1) / STEPS.length) * 100}%`,
            background: `linear-gradient(90deg, ${C.navy} 0%, #2563EB 100%)`,
            transition: "width 0.4s ease",
            borderRadius: "0 2px 2px 0",
          }} />
        </div>

        <div style={{ padding: mobile ? "20px 20px 18px" : "24px 28px 20px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: "300", color: C.ink, letterSpacing: "-0.02em", fontFamily: "Inter, sans-serif" }}>
                Bourse<span style={{ fontWeight: "900", letterSpacing: "-0.05em", backgroundImage: "linear-gradient(135deg, #1A4A8A, #4B9DD8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Next</span>
              </span>
              <span style={{ fontSize: "10px", fontWeight: "600", color: C.inkSubtle, letterSpacing: "0.04em" }}>
                Guide · {step + 1}/{STEPS.length}
              </span>
            </div>
            <button onClick={finish} style={{ background: "none", border: "none", color: C.inkSubtle, fontSize: "18px", cursor: "pointer", lineHeight: 1, padding: "2px 6px", borderRadius: "6px" }} title="Fermer le guide">✕</button>
          </div>

          {/* Contenu */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, letterSpacing: "-0.02em", marginBottom: "8px", lineHeight: "1.3" }}>{s.title}</div>
            <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.65" }}>{s.body}</div>
          </div>

          {/* Points de progression */}
          <div style={{ display: "flex", justifyContent: "center", gap: "5px", marginBottom: "16px" }}>
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => goTo(i)} style={{
                width: i === step ? "18px" : "6px", height: "6px",
                borderRadius: "3px",
                background: i === step ? C.navy : i < step ? C.navyLight : C.border,
                border: "none", cursor: "pointer", padding: 0,
                transition: "all 0.3s ease",
              }} />
            ))}
          </div>

          {/* Boutons */}
          <div style={{ display: "flex", gap: "8px" }}>
            {step > 0 && (
              <button onClick={() => goTo(step - 1)} style={{
                flex: 1, padding: "11px", borderRadius: "14px",
                border: `1px solid ${C.border}`, background: C.snowOff,
                color: C.inkMuted, fontSize: "13px", fontWeight: "600",
                cursor: "pointer", fontFamily: "Inter,sans-serif",
              }}>← Retour</button>
            )}
            <button onClick={() => isLast ? finish() : goTo(step + 1)} style={{
              flex: 2, padding: "11px", borderRadius: "14px",
              border: "none",
              background: isLast
                ? `linear-gradient(135deg, #059669 0%, #10B981 100%)`
                : `linear-gradient(135deg, ${C.navy} 0%, #2563EB 100%)`,
              color: "#fff", fontSize: "13px", fontWeight: "700",
              cursor: "pointer", fontFamily: "Inter,sans-serif",
              boxShadow: shadow.pill,
            }}>
              {isLast ? "Commencer →" : "Suivant →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
