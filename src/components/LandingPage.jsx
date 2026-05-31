import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import CompanyAvatar from "./CompanyAvatar";

/* ─── DATA ─────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    titre: "Suivi en temps réel",
    desc: "Cours mis à jour automatiquement, plus-values, historique de performance. PEA et CTO au même endroit.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
    titre: "Signaux IA",
    desc: "Scoring de chaque position avec recommandation ACHAT / RENFORCER / ATTENDRE. Basé sur les actualités du jour.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
    titre: "Agent IA autonome",
    desc: "Un agent gère son propre portefeuille en parallèle — même capital, mêmes règles. Comparez vos décisions aux siennes.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
      </svg>
    ),
    titre: "Plan DCA",
    desc: "Simulation de versements programmés, projection du patrimoine et allocation optimisée selon votre profil.",
  },
];

const MOCK_POSITIONS = [
  { nom: "LVMH Moët Hennessy", isin: "FR0000121014", qte: 15, pru: 620, cours: 698, signal: "ATTENDRE",  sigColor: C.goldDark, sigBg: C.goldLight },
  { nom: "ASML Holding",        isin: "NL0010273215", qte: 7,  pru: 680, cours: 812, signal: "RENFORCER", sigColor: C.accent,   sigBg: C.navyLight },
  { nom: "Amundi MSCI World",   isin: "LU1681043599", qte: 20, pru: 380, cours: 432, signal: "RENFORCER", sigColor: C.accent,   sigBg: C.navyLight },
];

const STATS = [
  { label: "Comptes supportés", value: "PEA & CTO" },
  { label: "Signaux IA quotidiens", value: "Illimités" },
  { label: "Agent autonome", value: "Inclus" },
];

const STEPS = [
  {
    num: "01",
    titre: "Ajoutez vos positions",
    desc: "Importez votre portefeuille PEA ou CTO en quelques secondes. Saisie manuelle ou import CSV Boursobank.",
  },
  {
    num: "02",
    titre: "Recevez vos signaux",
    desc: "L'IA analyse chaque valeur chaque jour et vous donne une recommandation claire basée sur les actualités.",
  },
  {
    num: "03",
    titre: "Suivez la performance",
    desc: "Comparez vos décisions à l'agent autonome, visualisez votre TWR et optimisez votre plan DCA.",
  },
];

/* ─── Graphe SVG mini ──────────────────────────────────────────────────── */
const MINI_CURVE = [0, 4, 2, 7, 5, 9, 6, 12, 10, 15, 11, 18, 16, 20];
function MiniChart() {
  const w = 280, h = 52;
  const pts = MINI_CURVE.map((y, i) => {
    const x = (i / (MINI_CURVE.length - 1)) * w;
    const yp = h - 4 - (y / 20) * (h - 8);
    return `${x},${yp}`;
  }).join(" ");
  const areaBot = `${w},${h} 0,${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="lp-chart-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2D6CB5" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#2D6CB5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pts} ${areaBot}`} fill="url(#lp-chart-grad)" />
      <polyline points={pts} fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* dernier point */}
      <circle cx={(MINI_CURVE.length - 1) / (MINI_CURVE.length - 1) * w} cy={h - 4 - (MINI_CURVE[MINI_CURVE.length - 1] / 20) * (h - 8)} r="3.5" fill={C.accent} />
    </svg>
  );
}

/* ─── Composant principal ──────────────────────────────────────────────── */
export default function LandingPage({ onDemo, onLogin }) {
  const [loading, setLoading] = useState(false);
  const [badgeAnim, setBadgeAnim] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBadgeAnim(true), 400);
    return () => clearTimeout(t);
  }, []);

  const handleDemo = () => {
    setLoading(true);
    setTimeout(onDemo, 300);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F5F5F7",
      fontFamily: "'DM Sans', sans-serif",
      color: C.ink,
      display: "flex",
      flexDirection: "column",
      overflowX: "hidden",
    }}>
      <style>{`
        @keyframes land-in      { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
        @keyframes land-float   { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes bn-wave      { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes badge-in     { from { opacity:0; transform:scale(0.85) translateY(-6px); } to { opacity:1; transform:none; } }
        @keyframes badge-pulse  { 0%,100% { box-shadow: 0 0 0 0 rgba(39,174,96,0.4); } 60% { box-shadow: 0 0 0 5px rgba(39,174,96,0); } }

        .land-feat { transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease; }
        .land-feat:hover { box-shadow: ${shadow.hover}; transform: translateY(-3px); border-color: rgba(45,108,181,0.2) !important; }

        .land-btn-cta { transition: box-shadow 0.18s ease, transform 0.18s ease; }
        .land-btn-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(45,108,181,0.45) !important; }

        .land-btn-sec { transition: background 0.15s ease, transform 0.15s ease; }
        .land-btn-sec:hover { background: ${C.snowDim} !important; transform: translateY(-1px); }

        .land-step-num { font-size: 40px; font-weight: 900; letter-spacing: -0.04em; color: ${C.accent}; opacity: 0.18; line-height: 1; font-family: 'DM Sans', sans-serif; }

        .badge-anim { animation: badge-in 0.45s cubic-bezier(0.16,1,0.3,1) forwards; }
        .dot-pulse  { animation: badge-pulse 2.2s ease infinite; }

        /* Nav link */
        .land-nav-link { font-size: 12px; font-weight: 600; color: ${C.inkMuted}; text-decoration: none; cursor: pointer; padding: 8px 12px; border-radius: 8px; transition: color 0.15s ease, background 0.15s ease; font-family: 'DM Sans', sans-serif; background: none; border: none; }
        .land-nav-link:hover { color: ${C.accent}; background: ${C.navyLight}; }

        /* Responsive */
        @media (max-width: 900px) {
          .land-hero-cols   { flex-direction: column !important; align-items: center !important; }
          .land-hero-text   { text-align: center !important; align-items: center !important; max-width: 100% !important; }
          .land-hero-mock   { width: 100% !important; max-width: 540px !important; margin-top: 40px !important; }
          .land-feat-cols   { flex-direction: column !important; }
          .land-feat-left   { max-width: 100% !important; margin-bottom: 32px !important; }
        }
        @media (max-width: 768px) {
          .land-grid-stats  { grid-template-columns: repeat(3, 1fr) !important; }
          .land-steps-grid  { grid-template-columns: 1fr !important; }
          .land-nav         { padding: 14px 20px !important; }
          .land-hero        { padding: 48px 20px 40px !important; }
          .land-section     { padding: 48px 20px !important; }
          .land-nav-links   { display: none !important; }
          .land-kpi-grid    { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .land-grid-stats  { grid-template-columns: 1fr !important; }
          .land-steps-grid  { grid-template-columns: 1fr !important; }
          .land-kpi-grid    { grid-template-columns: repeat(2, 1fr) !important; }
          .land-feat-grid   { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav className="land-nav" style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 48px",
        borderBottom: `1px solid ${C.border}`,
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <span style={{ fontSize: "20px", fontWeight: "300", color: C.inkSoft, letterSpacing: "-0.01em", fontFamily: "'DM Sans', sans-serif" }}>
          Bourse<span style={{
            fontWeight: "800", letterSpacing: "-0.04em",
            backgroundImage: C.accentGrad, backgroundSize: "300% 300%",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", animation: "bn-wave 4s ease infinite",
          }}>Next</span>
        </span>

        {/* Centre : lien Fonctionnalités */}
        <div className="land-nav-links" style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button
            className="land-nav-link"
            onClick={() => document.getElementById("lp-features")?.scrollIntoView({ behavior: "smooth" })}
          >
            Fonctionnalités
          </button>
        </div>

        {/* Droite : actions */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button onClick={handleDemo} className="land-btn-sec" style={{
            background: C.snowOff,
            border: `1px solid ${C.border}`,
            color: C.inkMuted,
            padding: "8px 18px", borderRadius: "50px",
            fontSize: "12px", fontWeight: "600",
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>
            Voir la démo
          </button>
          <button onClick={onLogin} className="land-btn-cta" style={{
            background: C.accentGrad, border: "none",
            color: C.snow,
            padding: "8px 20px", borderRadius: "50px",
            fontSize: "12px", fontWeight: "700",
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            boxShadow: shadow.pill,
          }}>
            Se connecter
          </button>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="land-hero" style={{ padding: "72px 48px 60px", animation: "land-in 0.5s ease forwards" }}>
        <div className="land-hero-cols" style={{
          display: "flex", alignItems: "center",
          gap: "56px", maxWidth: "1100px", margin: "0 auto",
        }}>

          {/* ── Colonne texte ── */}
          <div className="land-hero-text" style={{
            flex: "1 1 420px", maxWidth: "520px",
            display: "flex", flexDirection: "column", alignItems: "flex-start",
          }}>
            {/* Badge animé */}
            <div
              className={badgeAnim ? "badge-anim" : ""}
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                background: C.navyLight,
                border: `1px solid rgba(45,108,181,0.18)`,
                borderRadius: "50px", padding: "5px 14px",
                fontSize: "11px", fontWeight: "700",
                color: C.accent, letterSpacing: "0.05em",
                textTransform: "uppercase", marginBottom: "28px",
                opacity: badgeAnim ? 1 : 0,
              }}
            >
              <span className="dot-pulse" style={{
                width: "7px", height: "7px", borderRadius: "50%",
                background: C.green, display: "inline-block", flexShrink: 0,
              }} />
              Nouveau — Agent IA inclus
            </div>

            {/* Titre */}
            <h1 style={{
              fontSize: "clamp(30px, 5.5vw, 58px)",
              fontWeight: "900", letterSpacing: "-0.04em",
              lineHeight: 1.07, margin: "0 0 20px",
              color: C.ink, fontFamily: "'DM Sans', sans-serif",
            }}>
              Votre portefeuille.<br />
              <span style={{
                backgroundImage: C.accentGrad, backgroundSize: "300% 300%",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text", animation: "bn-wave 4s ease infinite",
              }}>
                Piloté par l'IA.
              </span>
            </h1>

            {/* Sous-titre */}
            <p style={{
              fontSize: "13px", color: C.inkMuted, lineHeight: 1.85,
              maxWidth: "440px", margin: "0 0 36px", fontWeight: "400",
            }}>
              Suivez votre portefeuille PEA et CTO, obtenez des signaux IA sur chaque position
              et défiez un agent autonome gérant son propre capital en parallèle.
            </p>

            {/* CTAs */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button onClick={handleDemo} disabled={loading} className="land-btn-cta" style={{
                padding: "13px 30px", borderRadius: "50px", border: "none",
                background: C.accentGrad, backgroundSize: "300% 300%",
                color: C.snow, fontSize: "13px", fontWeight: "700",
                cursor: loading ? "default" : "pointer",
                fontFamily: "'DM Sans', sans-serif",
                boxShadow: shadow.pill,
                opacity: loading ? 0.7 : 1,
              }}>
                {loading ? "Chargement…" : "Essayer la démo →"}
              </button>
              <button onClick={onLogin} className="land-btn-sec" style={{
                padding: "13px 28px", borderRadius: "50px",
                border: `1px solid ${C.border}`,
                background: C.snow,
                color: C.inkSoft, fontSize: "13px", fontWeight: "600",
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}>
                Créer un compte gratuit
              </button>
            </div>

            <p style={{ marginTop: "14px", fontSize: "11px", color: C.inkSubtle, fontWeight: "500" }}>
              Gratuit · Aucune carte bancaire · Données fictives en démo
            </p>
          </div>

          {/* ── Colonne mock UI ── */}
          <div className="land-hero-mock" style={{
            flex: "1 1 420px", maxWidth: "520px",
            animation: "land-float 5s ease-in-out infinite",
          }}>
            <div style={{
              background: C.snow, border: `1px solid ${C.border}`,
              borderRadius: "22px", padding: "22px 22px 18px",
              boxShadow: shadow.float,
            }}>
              {/* Topbar chrome */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "18px" }}>
                <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#FF5F57" }} />
                <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#FEBC2E" }} />
                <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#28C840" }} />
                <div style={{ flex: 1, height: "1px", background: C.border, marginLeft: "8px" }} />
                <div style={{ height: "14px", width: "56px", borderRadius: "4px", background: C.snowOff }} />
              </div>

              {/* KPIs */}
              <div className="land-kpi-grid" style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
                gap: "8px", marginBottom: "16px",
              }}>
                {[
                  { label: "Patrimoine",  val: "36 034 €", color: C.ink },
                  { label: "Plus-value",  val: "+4 934 €", color: C.green },
                  { label: "Performance", val: "+15.8%",   color: C.green },
                  { label: "IA vs vous",  val: "+1.8%",    color: C.accent },
                ].map(s => (
                  <div key={s.label} style={{
                    background: C.snowOff, borderRadius: "10px",
                    padding: "10px 12px", border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: "4px" }}>{s.label}</div>
                    <div style={{ fontSize: "15px", fontWeight: "800", color: s.color, letterSpacing: "-0.02em" }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Mini graphe */}
              <div style={{
                background: C.snowOff, borderRadius: "12px",
                padding: "12px 14px 10px",
                border: `1px solid ${C.border}`,
                marginBottom: "14px",
                display: "flex", flexDirection: "column", gap: "6px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.7px" }}>Évolution patrimoine</span>
                  <span style={{ fontSize: "11px", fontWeight: "800", color: C.green }}>+15.8%</span>
                </div>
                <MiniChart />
              </div>

              {/* Header colonnes */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto auto",
                gap: "8px", padding: "0 10px 5px",
              }}>
                {["Valeur", "Cours", "Qté", "P/V", "Total"].map(h => (
                  <span key={h} style={{
                    fontSize: "9px", fontWeight: "700", color: C.inkSubtle,
                    textTransform: "uppercase", letterSpacing: "0.7px",
                    textAlign: h === "Valeur" ? "left" : "right",
                    minWidth: h === "Valeur" ? undefined : h === "Total" ? "64px" : "40px",
                  }}>{h}</span>
                ))}
              </div>

              {/* Positions */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {MOCK_POSITIONS.map(p => {
                  const valeur = (p.cours * p.qte).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
                  const pv = p.cours - p.pru;
                  const pvPct = ((pv / p.pru) * 100).toFixed(1);
                  const pvColor = pv >= 0 ? C.green : C.red;
                  return (
                    <div key={p.nom} style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto auto auto",
                      gap: "8px", alignItems: "center",
                      background: C.snowOff, borderRadius: "9px",
                      padding: "8px 10px", border: `1px solid ${C.border}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
                        <CompanyAvatar nom={p.nom} isin={p.isin} size={28} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "11px", fontWeight: "700", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nom}</div>
                          <span style={{ fontSize: "9px", fontWeight: "700", color: p.sigColor, background: p.sigBg, padding: "1px 6px", borderRadius: "50px", letterSpacing: "0.3px" }}>{p.signal}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", minWidth: "40px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: C.ink }}>{p.cours} €</span>
                      </div>
                      <div style={{ textAlign: "right", minWidth: "40px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "600", color: C.inkMuted }}>{p.qte}</span>
                      </div>
                      <div style={{ textAlign: "right", minWidth: "40px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: pvColor }}>{pv >= 0 ? "+" : ""}{pvPct}%</span>
                      </div>
                      <div style={{ textAlign: "right", minWidth: "64px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: C.ink }}>{valeur} €</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <div style={{
        background: C.snow,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "28px 48px",
      }}>
        <div className="land-grid-stats" style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "1px",
          maxWidth: "680px",
          margin: "0 auto",
          background: C.border,
          borderRadius: "16px",
          overflow: "hidden",
          border: `1px solid ${C.border}`,
          boxShadow: shadow.card,
        }}>
          {STATS.map((s, i) => (
            <div key={i} style={{
              background: C.snow,
              padding: "20px 24px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>{s.label}</div>
              <div style={{ fontSize: "20px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <div id="lp-features" className="land-section" style={{ padding: "72px 48px", background: "#F5F5F7" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div className="land-feat-cols" style={{ display: "flex", gap: "64px", alignItems: "flex-start" }}>

            {/* Gauche : titre + desc + CTA */}
            <div className="land-feat-left" style={{ flex: "0 0 280px", maxWidth: "280px", paddingTop: "8px" }}>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.accent, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: "12px" }}>Fonctionnalités</div>
              <div style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "-0.03em", color: C.ink, lineHeight: 1.2, marginBottom: "16px" }}>
                Tout ce dont vous avez besoin
              </div>
              <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: 1.8, marginBottom: "28px" }}>
                Des outils professionnels conçus pour l'investisseur individuel. Simple, rapide, efficace.
              </p>
              <button onClick={handleDemo} className="land-btn-cta" style={{
                padding: "11px 22px", borderRadius: "50px", border: "none",
                background: C.accentGrad, backgroundSize: "300% 300%",
                color: C.snow, fontSize: "12px", fontWeight: "700",
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                boxShadow: shadow.pill,
              }}>
                Voir la démo →
              </button>
            </div>

            {/* Droite : grille 2×2 */}
            <div className="land-feat-grid" style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: "14px",
            }}>
              {FEATURES.map((f, i) => (
                <div key={i} className="land-feat" style={{
                  background: C.snow, border: `1px solid ${C.border}`,
                  borderRadius: "18px", padding: "22px 20px",
                  boxShadow: shadow.card,
                }}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "12px",
                    background: C.navyLight, display: "flex", alignItems: "center",
                    justifyContent: "center", color: C.accent, marginBottom: "14px",
                  }}>
                    {f.icon}
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "800", marginBottom: "8px", letterSpacing: "-0.02em", color: C.ink }}>{f.titre}</div>
                  <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.75 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Comment ça marche ─────────────────────────────────────────────── */}
      <div className="land-section" style={{
        padding: "72px 48px",
        background: C.snow,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "52px" }}>
            <div style={{ fontSize: "9px", fontWeight: "700", color: C.accent, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: "12px" }}>Comment ça marche</div>
            <div style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "-0.03em", color: C.ink }}>
              Opérationnel en 3 minutes
            </div>
          </div>

          <div className="land-steps-grid" style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "24px",
          }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{
                background: "#F5F5F7",
                border: `1px solid ${C.border}`,
                borderRadius: "20px",
                padding: "28px 24px",
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Numéro en arrière-plan */}
                <div className="land-step-num" style={{ marginBottom: "4px" }}>{s.num}</div>
                <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, letterSpacing: "-0.02em", marginBottom: "10px" }}>{s.titre}</div>
                <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.75 }}>{s.desc}</div>

                {/* Flèche si pas le dernier */}
                {i < STEPS.length - 1 && (
                  <div style={{
                    position: "absolute", right: "-12px", top: "50%",
                    transform: "translateY(-50%)",
                    width: "24px", height: "24px",
                    background: C.snow, border: `1px solid ${C.border}`,
                    borderRadius: "50%", display: "flex", alignItems: "center",
                    justifyContent: "center", zIndex: 2,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M3 2l4 3-4 3" stroke={C.inkSubtle} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer CTA ────────────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #EEF3FA, #F5F5F7)",
        padding: "80px 24px 96px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: "560px", margin: "0 auto" }}>
          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "7px",
            background: C.navyLight, border: `1px solid rgba(45,108,181,0.18)`,
            borderRadius: "50px", padding: "5px 14px",
            fontSize: "11px", fontWeight: "700",
            color: C.accent, letterSpacing: "0.05em",
            textTransform: "uppercase", marginBottom: "24px",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.green, display: "inline-block" }} />
            Gratuit pour commencer
          </div>

          <div style={{
            fontSize: "clamp(26px, 5vw, 38px)", fontWeight: "900",
            letterSpacing: "-0.04em", color: C.ink, marginBottom: "16px",
            lineHeight: 1.1, fontFamily: "'DM Sans', sans-serif",
          }}>
            Prêt à investir différemment ?
          </div>
          <p style={{ fontSize: "13px", color: C.inkMuted, marginBottom: "36px", lineHeight: 1.8 }}>
            Accédez à votre tableau de bord en quelques secondes.
            Aucune installation requise. Données fictives disponibles en démo.
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={handleDemo} disabled={loading} className="land-btn-cta" style={{
              padding: "14px 36px", borderRadius: "50px", border: "none",
              background: C.accentGrad, backgroundSize: "300% 300%",
              color: C.snow, fontSize: "13px", fontWeight: "700",
              cursor: loading ? "default" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
              boxShadow: shadow.pill,
              opacity: loading ? 0.7 : 1,
            }}>
              {loading ? "Chargement…" : "Voir la démo gratuitement →"}
            </button>
            <button onClick={onLogin} className="land-btn-sec" style={{
              padding: "14px 32px", borderRadius: "50px",
              border: `1px solid ${C.border}`,
              background: C.snow,
              color: C.inkSoft, fontSize: "13px", fontWeight: "600",
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>
              Créer un compte
            </button>
          </div>
        </div>
      </div>

      {/* ── Footer bas ────────────────────────────────────────────────────── */}
      <div style={{
        borderTop: `1px solid ${C.border}`,
        background: C.snow,
        padding: "20px 48px",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: "11px", color: C.inkSubtle }}>
          © 2025 BourseNext · Données à titre indicatif uniquement
        </span>
      </div>
    </div>
  );
}
