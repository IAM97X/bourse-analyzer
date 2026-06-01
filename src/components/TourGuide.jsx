import { useState } from "react";
import { C, shadow } from "../constants/theme";
import { TABS } from "../constants/tabs";

const TOUR_KEY = "boursenext_tour_v1";

const STEPS = [
  {
    tab: TABS.OVERVIEW,
    title: "Vos deux portefeuilles",
    body: "Cette page résume votre PEA et votre CTO : valeur totale, gains, capital investi. Cliquez sur un compte pour y entrer.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  },
  {
    tab: TABS.HOME,
    title: "Accueil — vue d'ensemble",
    body: "Voyez en un coup d'œil combien vaut votre portefeuille, ce que vous avez gagné ou perdu, et comment il évolue dans le temps.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  },
  {
    tab: TABS.PORTFOLIO,
    title: "Portefeuille — vos positions",
    body: "Ajoutez vos actions et ETF. L'app affiche automatiquement les cours du jour et calcule vos gains ou pertes.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  },
  {
    tab: TABS.MARCHE,
    title: "Signaux IA — scoring dynamique",
    body: "L'IA lit les actualités et analyse chaque action de votre portefeuille. Elle vous dit si c'est le bon moment pour acheter, attendre ou vendre.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>,
  },
  {
    tab: TABS.AUTOPILOT,
    title: "Opportunités",
    body: "Indiquez votre budget mensuel. L'IA choisit automatiquement les meilleures actions où investir ce mois-ci.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  },
  {
    tab: TABS.CHAT,
    title: "Conseiller Privé",
    body: "Posez n'importe quelle question sur la bourse ou vos actions. L'IA connaît votre portefeuille et vous répond en tenant compte de votre situation.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  },
  {
    tab: TABS.AI_PORTFOLIO,
    title: "Portefeuille Autonome",
    body: "L'agent IA investit en parallèle de vous avec un capital fictif. Suivez ses décisions jour après jour — et comparez votre performance à la sienne.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a9 9 0 0 1 9 9c0 4.97-4.03 9-9 9S3 15.97 3 11a9 9 0 0 1 9-9z"/><path d="M12 6v6l4 2"/></svg>,
  },
  {
    tab: TABS.PORTFOLIO,
    title: "Prêt à commencer",
    body: "Ajoutez votre première position dans Portefeuille. Ce guide est accessible à tout moment via le bouton « ? » en bas de la sidebar.",
    isLast: true,
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  },
];

export function shouldShowTour() {
  try { return !localStorage.getItem(TOUR_KEY); } catch { return false; }
}

export function markTourDone() {
  try { localStorage.setItem(TOUR_KEY, "1"); } catch {}
}

export default function TourGuide({ onDone, changeTab, currentTab }) {
  const initialStep = STEPS.findIndex(s => s.tab === currentTab);
  const [step, setStep] = useState(initialStep >= 0 ? initialStep : 0);

  const goTo = (i) => {
    if (i < 0 || i >= STEPS.length) return;
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
  const iconColor = isLast ? C.green : C.accent;
  const iconBg = isLast ? "rgba(39,174,96,0.09)" : C.navyLight;

  return (
    <>
      <div style={{
        position: "fixed", inset: 0, zIndex: 1500,
        background: "rgba(4,14,28,0.22)",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "fixed",
        bottom: mobile ? "16px" : "28px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1501,
        width: mobile ? "calc(100vw - 32px)" : "400px",
        background: "#fff",
        borderRadius: "20px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}>
        {/* Barre de progression */}
        <div style={{ height: "2px", background: C.border }}>
          <div style={{
            height: "100%",
            width: `${((step + 1) / STEPS.length) * 100}%`,
            background: isLast ? C.green : C.accent,
            transition: "width 0.35s ease",
          }} />
        </div>

        <div style={{ padding: mobile ? "18px 20px 16px" : "20px 24px 18px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: "300", color: C.ink, fontFamily: "'DM Sans', sans-serif" }}>
                Bourse<span style={{ fontWeight: "800", backgroundImage: `linear-gradient(135deg, #0F2D5E 0%, ${C.accent} 50%, #7BBFE8 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Next</span>
              </span>
              <span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "500" }}>Guide · {step + 1}/{STEPS.length}</span>
            </div>
            <button onClick={finish} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkSubtle, display: "flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Contenu */}
          <div style={{ display: "flex", gap: "14px", marginBottom: "20px", alignItems: "flex-start" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: iconColor }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: "800", color: C.ink, letterSpacing: "-0.02em", marginBottom: "6px", lineHeight: 1.3 }}>{s.title}</div>
              <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.65 }}>{s.body}</div>
            </div>
          </div>

          {/* Boutons */}
          <div style={{ display: "flex", gap: "8px" }}>
            {step > 0 && (
              <button onClick={() => goTo(step - 1)} style={{
                flex: 1, padding: "10px", borderRadius: "12px",
                border: `1px solid ${C.border}`, background: C.snowOff,
                color: C.inkMuted, fontSize: "12px", fontWeight: "600",
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}>← Retour</button>
            )}
            <button onClick={() => isLast ? finish() : goTo(step + 1)} style={{
              flex: 2, padding: "10px", borderRadius: "12px",
              border: "none",
              background: isLast ? `linear-gradient(135deg, #059669, #10B981)` : C.accentGrad,
              color: "#fff", fontSize: "12px", fontWeight: "700",
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              boxShadow: shadow.pill,
            }}>
              {isLast ? "Commencer →" : "Suivant →"}
            </button>
          </div>

          {!isLast && (
            <button onClick={finish} style={{
              marginTop: "10px", background: "none", border: "none",
              color: C.inkSubtle, fontSize: "11px", cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", display: "block", width: "100%", textAlign: "center",
            }}>Passer l'introduction</button>
          )}
        </div>
      </div>
    </>
  );
}
