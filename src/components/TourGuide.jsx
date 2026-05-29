import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { TABS } from "../constants/tabs";
import AppLogo from "./AppLogo";

const TOUR_KEY = "boursenext_tour_v1";

const STEPS = [
  {
    tab: TABS.HOME,
    icon: "👋",
    title: "Bienvenue sur BourseNext",
    body: "Je suis ton guide. En moins d'une minute, je te montre tout ce que l'app peut faire pour toi. C'est parti !",
  },
  {
    tab: TABS.HOME,
    icon: "🏠",
    title: "Accueil — Ta vue d'ensemble",
    body: "Retrouve ici la valorisation totale de ton portefeuille, tes performances du jour, du mois et depuis l'achat, ainsi que le graphique d'évolution.",
  },
  {
    tab: TABS.PORTFOLIO,
    icon: "📊",
    title: "Portefeuille — Tes positions",
    body: "Ajoute tes actions, ETF et obligations. Cours en temps réel, plus-values, répartition sectorielle et sparklines par ligne.",
  },
  {
    tab: TABS.MARCHE,
    icon: "🧠",
    title: "Marché — Scoring IA dynamique",
    body: "L'IA analyse chaque valeur : actualités, RSI, signaux techniques. Score sur 20 avec recommandation ACHAT / RENFORCER / ATTENDRE / VENDRE.",
  },
  {
    tab: TABS.CHAT,
    icon: "💬",
    title: "Assistant IA — Ton conseiller 24h/24",
    body: "Pose toutes tes questions sur la bourse, tes valeurs ou tes stratégies. Gratuit avec une clé Gemini (Google AI Studio).",
  },
  {
    tab: TABS.AI_PORTFOLIO,
    icon: "🤖",
    title: "Portefeuille IA Autonome",
    body: "Un portefeuille géré entièrement par l'IA. Il investit, arbitre et protège automatiquement tes positions avec stop-loss et journal de décisions.",
  },
  {
    tab: TABS.AUTOPILOT,
    icon: "⚡",
    title: "Autopilot Atlas — DCA intelligent",
    body: "Définis ton budget mensuel et laisse l'IA trouver les meilleures opportunités d'investissement dans l'univers PEA éligible.",
  },
  {
    tab: TABS.PROFIL,
    icon: "⚙️",
    title: "Profil — Personnalise ton expérience",
    body: "Renseigne ton profil investisseur, ton courtier et tes clés API Gemini ou Claude pour débloquer toutes les fonctionnalités IA.",
  },
  {
    tab: TABS.PORTFOLIO,
    icon: "🎉",
    title: "Tu es prêt !",
    body: "Commence par ajouter ta première position dans l'onglet Portefeuille. BourseNext s'occupe du reste.",
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
              <AppLogo size={22} />
              <span style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Guide · {step + 1}/{STEPS.length}
              </span>
            </div>
            <button onClick={finish} style={{ background: "none", border: "none", color: C.inkSubtle, fontSize: "18px", cursor: "pointer", lineHeight: 1, padding: "2px 6px", borderRadius: "6px" }} title="Fermer le guide">✕</button>
          </div>

          {/* Contenu */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "20px" }}>
            <div style={{ width: "48px", height: "48px", flexShrink: 0, borderRadius: "16px", background: C.paleBlue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, letterSpacing: "-0.02em", marginBottom: "6px", lineHeight: "1.3" }}>{s.title}</div>
              <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.6" }}>{s.body}</div>
            </div>
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
