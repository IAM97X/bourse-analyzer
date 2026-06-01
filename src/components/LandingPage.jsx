import { useState, useEffect, useRef } from "react";
import { C, shadow } from "../constants/theme";

/* ─── Mock data ─────────────────────────────────────────────────────────── */

const SIG_COLOR  = { ACHAT: "#27AE60", RENFORCER: "#2D6CB5", ATTENDRE: "#E6B800", PRUDENCE: "#E74C3C", VENDRE: "#7B1111" };
const SIG_BG     = { ACHAT: "rgba(39,174,96,0.08)", RENFORCER: "rgba(45,108,181,0.08)", ATTENDRE: "rgba(255,215,0,0.10)", PRUDENCE: "rgba(231,76,60,0.08)", VENDRE: "rgba(123,17,17,0.08)" };
const SIG_PHRASE = { ACHAT: "Momentum favorable, à surveiller", RENFORCER: "Position solide, tu peux étoffer", ATTENDRE: "Pas d'action urgente", PRUDENCE: "Contexte dégradé, reste vigilant", VENDRE: "Signal négatif détecté" };

const SIGNAL_POSITIONS = [
  { nom: "ASML Holding",      signal: "RENFORCER", score: 14, pv: "+19.4 %", pvPos: true,  resume: "Cycle semi-conducteurs en reprise. Carnet de commandes record." },
  { nom: "Air Liquide",       signal: "ACHAT",     score: 17, pv: "+8.1 %",  pvPos: true,  resume: "Valorisation attractive. Dividende en hausse depuis 29 ans consécutifs." },
  { nom: "Amundi MSCI World", signal: "RENFORCER", score: 15, pv: "+13.7 %", pvPos: true,  resume: "Cœur de portefeuille. Renforcer le DCA mensuel en priorité." },
  { nom: "LVMH",              signal: "ATTENDRE",  score: 10, pv: "+12.6 %", pvPos: true,  resume: "Résultats T1 mitigés. Attendre les publications T2 avant d'agir." },
  { nom: "Worldline",         signal: "VENDRE",    score:  4, pv: "-54.2 %", pvPos: false, resume: "Révision en baisse des guidances. Risque bilan élevé, sortie conseillée." },
];

const SIGNAL_POSITIONS_CTO = [
  { nom: "NVIDIA",          signal: "ACHAT",     score: 18, pv: "+187.3 %", pvPos: true,  resume: "Leader IA incontesté. Datacenter en hypercroissance." },
  { nom: "Microsoft",       signal: "RENFORCER", score: 16, pv: "+28.4 %",  pvPos: true,  resume: "Intégration Copilot solide. Azure Cloud en accélération." },
  { nom: "iShares S&P 500", signal: "RENFORCER", score: 15, pv: "+21.1 %",  pvPos: true,  resume: "Cœur de CTO — diversification maximale. DCA recommandé." },
  { nom: "PayPal",          signal: "VENDRE",    score:  4, pv: "-73.4 %",  pvPos: false, resume: "Perte de parts de marché face à Apple Pay et Stripe. Modèle sous pression." },
  { nom: "TSMC",            signal: "ACHAT",     score: 17, pv: "+62.7 %",  pvPos: true,  resume: "Carnet de commandes record. Bénéficie du boom IA côté fonderies." },
];

const AGENT_POSITIONS = [
  { nom: "Amundi MSCI World",  signal: "RENFORCER", pv: "+13.7 %", poids: "28 %", note: "Cœur de portefeuille renforcé. Agent IA a augmenté le DCA mensuel de 20 %.", sigColor: "#2D6CB5", sigBg: "rgba(45,108,181,0.10)" },
  { nom: "Air Liquide",        signal: "ACHAT",     pv: "+8.1 %",  poids: "22 %", note: "Position initiée automatiquement. Opportunité de valorisation détectée.", sigColor: "#1E8449", sigBg: "rgba(39,174,96,0.10)"  },
  { nom: "ASML Holding",       signal: "RENFORCER", pv: "+19.4 %", poids: "24 %", note: "Poids relevé à 24 %. Momentum semi-conducteurs confirmé par Agent IA.",      sigColor: "#2D6CB5", sigBg: "rgba(45,108,181,0.10)" },
  { nom: "LVMH",               signal: "ATTENDRE",  pv: "+12.6 %", poids: "18 %", note: "Agent IA gèle les ordres jusqu'aux publications T2. Position maintenue.",    sigColor: "#B07D2E", sigBg: "rgba(255,215,0,0.10)"  },
  { nom: "Worldline",          signal: "VENDRE",    pv: "-54.2 %", poids: "8 %",  note: "Ordre de cession programmé. Agent IA redirige les fonds vers ASML.",         sigColor: "#DC2626", sigBg: "rgba(220,38,38,0.08)"  },
];

const AGENT_POSITIONS_CTO = [
  { nom: "iShares S&P 500",   signal: "RENFORCER", pv: "+21.1 %",  poids: "27 %", note: "Socle CTO consolidé. Agent IA a porté l'allocation à 27 % ce trimestre.",    sigColor: "#2D6CB5", sigBg: "rgba(45,108,181,0.10)" },
  { nom: "NVIDIA",            signal: "ACHAT",     pv: "+187.3 %", poids: "30 %", note: "Plus forte conviction du portefeuille. Agent IA a renforcé après le repli.",  sigColor: "#1E8449", sigBg: "rgba(39,174,96,0.10)"  },
  { nom: "TSMC",              signal: "ACHAT",     pv: "+62.7 %",  poids: "12 %", note: "Position initiée par Agent IA. Fonderie stratégique du cycle IA.",            sigColor: "#1E8449", sigBg: "rgba(39,174,96,0.10)"  },
  { nom: "Microsoft",         signal: "RENFORCER", pv: "+28.4 %",  poids: "25 %", note: "DCA maintenu. Agent IA a détecté une fenêtre d'entrée sur repli de 4 %.",     sigColor: "#2D6CB5", sigBg: "rgba(45,108,181,0.10)" },
  { nom: "PayPal",            signal: "VENDRE",    pv: "-73.4 %",  poids: "6 %",  note: "Cession automatique en cours. Agent IA réalloue vers NVIDIA et TSMC.",        sigColor: "#DC2626", sigBg: "rgba(220,38,38,0.08)"  },
];

/* ─── Mini chart ────────────────────────────────────────────────────────── */
const MINI_CURVE = [0, 4, 2, 7, 5, 9, 6, 12, 10, 15, 11, 18, 16, 20];
function MiniChart({ color = "#0ea87e" }) {
  const w = 280, h = 48;
  const pts = MINI_CURVE.map((y, i) => {
    const x = (i / (MINI_CURVE.length - 1)) * w;
    const yp = h - 4 - (y / 20) * (h - 8);
    return `${x},${yp}`;
  }).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="lp-cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`${pts} ${w},${h} 0,${h}`} fill="url(#lp-cg)"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={w} cy={h - 4 - (MINI_CURVE[MINI_CURVE.length-1]/20)*(h-8)} r="3.5" fill={color}/>
    </svg>
  );
}

/* ─── Score bar ─────────────────────────────────────────────────────────── */
function ScoreBar({ score }) {
  const color = score >= 75 ? "#1E8449" : score >= 55 ? "#2D6CB5" : "#B07D2E";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ flex: 1, height: "4px", background: "rgba(0,0,0,0.06)", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: "2px" }}/>
      </div>
      <span style={{ fontSize: "9px", fontWeight: "700", color, minWidth: "24px", textAlign: "right" }}>{score}</span>
    </div>
  );
}

/* ─── Reveal on scroll ──────────────────────────────────────────────────── */
function Reveal({ children, delay = 0, from = "bottom", className = "", style: sx = {} }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVis(true); },
      { threshold: 0.18, rootMargin: "0px 0px -60px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const tx = from === "left"  ? "translateX(-36px)"
           : from === "right" ? "translateX(36px)"
           : from === "up"    ? "translateY(-20px)"
           :                    "translateY(32px)";
  return (
    <div ref={ref} className={className} style={{
      opacity: vis ? 1 : 0,
      transform: vis ? "none" : tx,
      transition: `opacity 0.85s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.85s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      ...sx,
    }}>
      {children}
    </div>
  );
}

/* ─── Composant principal ───────────────────────────────────────────────── */
export default function LandingPage({ onLogin, onRegister }) {
  const [heroTab, setHeroTab] = useState("PEA");
  const [sigTab, setSigTab] = useState("PEA");
  const [agentTab, setAgentTab] = useState("PEA");
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const CTAPrimary = ({ label = "Créer un compte gratuit →", style = {} }) => (
    <button onClick={onRegister} className="land-btn-cta" style={{
      padding: "13px 30px", borderRadius: "50px", border: "none",
      background: C.accentGrad, backgroundSize: "300% 300%",
      color: "#fff", fontSize: "13px", fontWeight: "700",
      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
      boxShadow: shadow.pill, ...style,
    }}>{label}</button>
  );

  return (
    <div className="land-root" style={{ minHeight: "100vh", background: "#F5F5F7", fontFamily: "'DM Sans', sans-serif", color: C.ink, display: "flex", flexDirection: "column", overflowX: "hidden" }}>
      <style>{`
        @keyframes land-in    { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:none} }
        @keyframes land-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes bn-wave    { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes badge-in   { from{opacity:0;transform:scale(0.85) translateY(-6px)} to{opacity:1;transform:none} }
        @keyframes badge-pulse{ 0%,100%{box-shadow:0 0 0 0 rgba(39,174,96,0.4)} 60%{box-shadow:0 0 0 5px rgba(39,174,96,0)} }

        .land-btn-cta { transition: box-shadow 0.18s ease, transform 0.18s ease; }
        .land-btn-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(45,108,181,0.45) !important; }
        .land-btn-sec { transition: background 0.15s ease, transform 0.15s ease; }
        .land-btn-sec:hover { background: ${C.snowDim} !important; transform: translateY(-1px); }
        /* Force DM Sans sur tous les éléments interactifs */
        .land-root *, .land-root button, .land-root a, .land-root input { font-family: 'DM Sans', sans-serif; }
        .land-nav-link { font-size: 12px; font-weight: 600; color: ${C.inkMuted}; cursor: pointer; padding: 8px 12px; border-radius: 8px; transition: color 0.15s, background 0.15s; font-family: 'DM Sans', sans-serif; background: none; border: none; }
        .land-nav-link:hover { color: ${C.accent}; background: ${C.navyLight}; }
        .land-feat-hover { transition: box-shadow 0.18s, transform 0.18s; }
        .land-feat-hover:hover { box-shadow: ${shadow.hover}; transform: translateY(-2px); }

        @media (max-width: 960px) {
          .land-split { flex-direction: column !important; }
          .land-split-text { max-width: 100% !important; text-align: center !important; align-items: center !important; }
          .land-split-mock { width: 100% !important; max-width: 540px !important; margin: 0 auto !important; }
          .land-hero-cols { flex-direction: column !important; align-items: center !important; }
          .land-hero-text { text-align: center !important; align-items: center !important; max-width: 100% !important; }
          .land-hero-mock { width: 100% !important; max-width: 540px !important; margin-top: 40px !important; }
        }
        @media (max-width: 768px) {
          .land-nav { padding: 14px 20px !important; }
          .land-nav-links { display: none !important; }
          .land-hero { padding: 48px 20px 40px !important; }
          .land-section { padding: 56px 20px !important; }
          .land-api-cols { flex-direction: column !important; }
        }
      `}</style>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="land-nav" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 48px", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 100 }}>
        <span style={{ fontSize: "20px", fontWeight: "300", color: C.inkSoft, letterSpacing: "-0.01em" }}>
          Bourse<span style={{ fontWeight: "800", letterSpacing: "-0.04em", backgroundImage: C.accentGrad, backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "bn-wave 4s ease infinite" }}>Next</span>
        </span>
        <div className="land-nav-links" style={{ display: "flex", gap: "4px" }}>
          <button className="land-nav-link" onClick={() => document.getElementById("lp-synthese")?.scrollIntoView({ behavior: "smooth" })}>Synthèse</button>
          <button className="land-nav-link" onClick={() => document.getElementById("lp-signaux")?.scrollIntoView({ behavior: "smooth" })}>Signaux IA</button>
          <button className="land-nav-link" onClick={() => document.getElementById("lp-agent")?.scrollIntoView({ behavior: "smooth" })}>Agent IA</button>
          <button className="land-nav-link" onClick={() => document.getElementById("lp-tarifs")?.scrollIntoView({ behavior: "smooth" })}>Tarifs</button>
        </div>
        <button onClick={onLogin} className="land-btn-cta" style={{ background: C.accentGrad, border: "none", color: "#fff", padding: "8px 20px", borderRadius: "50px", fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: shadow.pill }}>
          Se connecter
        </button>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div className="land-hero" style={{ padding: "80px 48px 72px", background: "#fff", animation: "land-in 0.5s ease forwards", borderBottom: `1px solid ${C.border}` }}>
        <div className="land-hero-cols" style={{ display: "flex", alignItems: "center", gap: "56px", maxWidth: "1100px", margin: "0 auto" }}>

          <div className="land-hero-text" style={{ flex: "1 1 420px", maxWidth: "520px", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <h1 style={{ fontSize: "clamp(30px, 5.5vw, 56px)", fontWeight: "900", letterSpacing: "-0.04em", lineHeight: 1.07, margin: "0 0 20px", color: C.ink }}>
              Investissez avec méthode.<br />
              <span style={{ backgroundImage: C.accentGrad, backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "bn-wave 4s ease infinite" }}>
                L'IA vous guide.
              </span>
            </h1>

            <p style={{ fontSize: "14px", color: C.inkMuted, lineHeight: 1.85, maxWidth: "440px", margin: "0 0 36px" }}>
              Signaux quotidiens, performance exacte, agent autonome — BourseNext analyse votre portefeuille (PEA & CTO) et vous explique chaque décision. Essai gratuit 7 jours.
            </p>

            <CTAPrimary />
            <p style={{ marginTop: "12px", fontSize: "11px", color: C.inkSubtle }}>
              Sans carte bancaire · Vos données restent chez vous
            </p>
          </div>

          {/* Mock portefeuille */}
          <div className="land-hero-mock" style={{ flex: "1 1 420px", maxWidth: "520px", animation: "land-float 5s ease-in-out infinite" }}>
            <div style={{ background: "#F5F5F7", border: `1px solid ${C.border}`, borderRadius: "22px", padding: "20px 20px 16px", boxShadow: shadow.float }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "16px" }}>
                {["#FF5F57","#FEBC2E","#28C840"].map(c => <div key={c} style={{ width: "9px", height: "9px", borderRadius: "50%", background: c }}/>)}
                <div style={{ flex: 1, height: "1px", background: C.border, marginLeft: "8px" }}/>
                <div style={{ height: "14px", width: "56px", borderRadius: "4px", background: "rgba(0,0,0,0.07)" }}/>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: "800", color: C.ink, letterSpacing: "-0.02em" }}>Bonjour, Alex</div>
                  <div style={{ fontSize: "9px", color: C.inkSubtle }}>dimanche 1 juin 2026</div>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  {["PEA","CTO"].map(t => (
                    <button key={t} onClick={() => setHeroTab(t)} style={{ fontSize: "9px", fontWeight: "700", color: heroTab===t ? "#fff" : C.accent, background: heroTab===t ? "#2D6CB5" : "rgba(45,108,181,0.08)", padding: "3px 10px", borderRadius: "20px", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>{t}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", marginBottom: "10px" }}>
                {(heroTab === "PEA" ? [
                  [["Courtier","Boursobank"],["Compte","PEA"],["Profil","Dynamique"],["Horizon","Long terme"],["DCA","500 €/mois"]],
                  [["Total PF","36 034 €"],["Espèces","2 000 €"],["Titres","34 034 €"],["+/- values","+4 934 €","#4ade80"],["Perf.","+16.94 %","#4ade80"]],
                  [["Perf. 2026","+15.8 %","#4ade80"],["Perf. juin","+2.3 %","#4ade80"],["Veille","+0.4 %","#4ade80"],["CAC 40","+8.2 %","#4ade80"],["CAC mois","+1.1 %","#4ade80"]],
                ] : [
                  [["Courtier","Trade Republic"],["Compte","CTO"],["Profil","Offensif"],["Horizon","Long terme"],["DCA","300 €/mois"]],
                  [["Total PF","22 410 €"],["Espèces","1 200 €"],["Titres","21 210 €"],["+/- values","+8 210 €","#4ade80"],["Perf.","+57.83 %","#4ade80"]],
                  [["Perf. 2026","+34.2 %","#4ade80"],["Perf. juin","+4.1 %","#4ade80"],["Veille","+1.1 %","#4ade80"],["S&P 500","+18.4 %","#4ade80"],["S&P mois","+2.8 %","#4ade80"]],
                ]).map((rows, ci) => (
                  <div key={ci} style={{ background: "linear-gradient(160deg,#1A3A5C,#2D5986)", borderRadius: "10px", padding: "10px 12px", boxShadow: "0 4px 16px rgba(30,58,95,0.22)" }}>
                    {rows.map(([label, value, color], ri) => (
                      <div key={ri} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: ri < rows.length-1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                        <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{label}</span>
                        <span style={{ fontSize: "8px", fontWeight: "700", color: color || "#fff", lineHeight: 1.5 }}>{value}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ background: "#fff", borderRadius: "12px", padding: "10px 12px 8px", border: "1px solid rgba(26,45,74,0.07)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#1a2d4a", letterSpacing: "-0.02em" }}>{heroTab === "PEA" ? "36 034 €" : "22 410 €"}</div>
                    <div style={{ fontSize: "9px", color: "#0ea87e", fontWeight: "700", marginTop: "1px" }}>{heroTab === "PEA" ? "+4 934 € · +15.80 %" : "+8 210 € · +57.83 %"}</div>
                  </div>
                  <div style={{ display: "flex", gap: "2px", alignItems: "flex-start" }}>
                    {["1M","3M","1A","Tout"].map((p, i) => (
                      <span key={p} style={{ fontSize: "8px", fontWeight: "700", padding: "2px 6px", borderRadius: "4px", background: i===0 ? "#1a2d4a" : "#f0f2f5", color: i===0 ? "#fff" : "rgba(26,45,74,0.4)" }}>{p}</span>
                    ))}
                  </div>
                </div>
                <MiniChart/>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section Synthèse ────────────────────────────────────────────── */}
      <div id="lp-synthese" className="land-section" style={{ padding: "72px 48px", background: C.snow, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <Reveal from="bottom" style={{ textAlign: "center", marginBottom: "48px" }}>
            <div style={{ fontSize: "9px", fontWeight: "700", color: C.accent, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: "12px" }}>Synthèse</div>
            <div style={{ fontSize: "26px", fontWeight: "800", letterSpacing: "-0.03em", color: C.ink, lineHeight: 1.2 }}>
              Votre portefeuille PEA et CTO<br />centralisés en un seul endroit
            </div>
            <p style={{ fontSize: "13px", color: C.inkMuted, marginTop: "12px", maxWidth: "480px", margin: "12px auto 0", lineHeight: 1.8 }}>
              Valeur totale, plus-values latentes, performance YTD avec la méthode TWR — celle qu'utilisent les gérants de fonds. Pas une approximation.
            </p>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
            {[
              { titre: "Portefeuille unifié", desc: "PEA et CTO sur le même écran. Boursobank, Fortuneo, DEGIRO, Trade Republic — connectez votre courtier en important votre relevé ou saisissez vos positions en 2 minutes." },
              { titre: "Performance exacte (TWR)", desc: "La méthode Modified Dietz prend en compte vos versements et vos retraits. Votre vrai rendement — pas un chiffre qui flatte." },
              { titre: "Historique & graphiques", desc: "Évolution du patrimoine sur 1J, 1M, 1A ou depuis le début. Comparez votre courbe à celle du CAC 40 en temps réel." },
            ].map((f, i) => (
              <Reveal key={i} from="bottom" delay={i * 100} className="land-feat-hover" style={{ background: "#F5F5F7", border: `1px solid ${C.border}`, borderRadius: "18px", padding: "24px 22px", boxShadow: shadow.card }}>
                <div style={{ fontSize: "13px", fontWeight: "800", color: C.ink, marginBottom: "8px", letterSpacing: "-0.02em" }}>{f.titre}</div>
                <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.75 }}>{f.desc}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section Signaux IA ───────────────────────────────────────────── */}
      <div id="lp-signaux" className="land-section" style={{ padding: "72px 48px", background: "#F5F5F7", borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div className="land-split" style={{ display: "flex", alignItems: "center", gap: "64px" }}>

            {/* Texte */}
            <Reveal from="left" className="land-split-text" style={{ flex: "0 0 300px", maxWidth: "320px", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.accent, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: "12px" }}>Signaux IA</div>
              <div style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "-0.03em", color: C.ink, lineHeight: 1.2, marginBottom: "16px" }}>
                Chaque position analysée. Chaque matin.
              </div>
              <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: 1.85, marginBottom: "24px" }}>
                L'IA lit les actualités de chaque valeur en portefeuille et vous donne un signal clair : <strong style={{ color: "#1E8449" }}>ACHAT</strong>, <strong style={{ color: C.accent }}>RENFORCER</strong>, <strong style={{ color: "#B07D2E" }}>ATTENDRE</strong> ou <strong style={{ color: C.red }}>RÉDUIRE</strong>. Basé sur les faits du jour — pas un algorithme opaque.
              </p>
              <p style={{ fontSize: "12px", color: C.inkSubtle, lineHeight: 1.7, background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "24px" }}>
                Inclus dans votre abonnement — aucune clé API requise.
              </p>
            </Reveal>

            {/* Mock signaux */}
            <Reveal from="right" delay={80} className="land-split-mock" style={{ flex: 1, minWidth: 0 }}>
              <div style={{ background: "#fff", borderRadius: "20px", padding: "18px 18px 14px", border: `1px solid ${C.border}`, boxShadow: shadow.float }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "800", color: C.ink }}>Signaux du jour</div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {["PEA","CTO"].map(t => (
                      <button key={t} onClick={() => setSigTab(t)} style={{ fontSize: "9px", fontWeight: "700", color: sigTab===t ? "#fff" : C.accent, background: sigTab===t ? "#2D6CB5" : "rgba(45,108,181,0.08)", padding: "3px 10px", borderRadius: "20px", border: "none", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>{t}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {(sigTab === "PEA" ? SIGNAL_POSITIONS : SIGNAL_POSITIONS_CTO).map((p, i) => {
                    const sc = SIG_COLOR[p.signal]; const sb = SIG_BG[p.signal];
                    return (
                      <div key={i} style={{ padding: "12px 14px", background: sb, borderRadius: "14px", border: `1px solid ${sc}33`, display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <div style={{ flex: 1, minWidth: "80px" }}>
                            <div style={{ fontWeight: "700", fontSize: "12px", color: C.ink }}>{p.nom}</div>
                            <div style={{ fontSize: "10px", color: sc, fontWeight: "500", marginTop: "1px", opacity: 0.85 }}>{SIG_PHRASE[p.signal]}</div>
                          </div>
                          <span style={{ fontSize: "10px", fontWeight: "800", color: sc, background: sc + "22", padding: "3px 10px", borderRadius: "20px", border: `1px solid ${sc}`, letterSpacing: "0.5px" }}>{p.signal}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <div style={{ width: "60px", height: "5px", borderRadius: "3px", background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                              <div style={{ width: `${(p.score / 20) * 100}%`, height: "100%", background: sc, borderRadius: "3px" }}/>
                            </div>
                            <span style={{ fontSize: "11px", fontWeight: "700", color: sc }}>{p.score}/20</span>
                          </div>
                          <span style={{ fontSize: "10px", fontWeight: "700", color: p.pvPos ? "#27AE60" : "#7B1111", minWidth: "42px", textAlign: "right" }}>{p.pv}</span>
                        </div>
                        <div style={{ fontSize: "11px", color: C.inkMuted, lineHeight: 1.5 }}>{p.resume}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: "8px", padding: "8px 12px", background: C.navyLight, borderRadius: "8px", fontSize: "10px", color: C.accent, fontWeight: "600", textAlign: "center" }}>
                  Analyse générée par Claude · Mise à jour quotidienne
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* ── Section Agent IA ─────────────────────────────────────────────── */}
      <div id="lp-agent" className="land-section" style={{ padding: "72px 48px", background: C.snow, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div className="land-split" style={{ display: "flex", alignItems: "center", gap: "64px", flexDirection: "row-reverse" }}>

            {/* Texte */}
            <Reveal from="right" className="land-split-text" style={{ flex: "0 0 300px", maxWidth: "340px", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.accent, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: "12px" }}>Agent IA autonome</div>
              <div style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "-0.03em", color: C.ink, lineHeight: 1.2, marginBottom: "16px" }}>
                Même capital, mêmes règles.<br/>Qui fait mieux — vous ou l'IA ?
              </div>
              <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: 1.85, marginBottom: "20px" }}>
                Agent IA gère un portefeuille fictif en parallèle du vôtre. Chaque jour, il analyse, décide, arbitre. À vous de le battre — ou d'apprendre de ses choix.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                {[
                  "Comparez vos performances en temps réel — vous vs Agent IA",
                  "Capital 100 % fictif — aucun risque financier",
                  "Chaque décision expliquée en clair, sans jargon",
                ].map((txt, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px" }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 2.5" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <span style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.65 }}>{txt}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "12px", color: C.inkSubtle, lineHeight: 1.7, background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "24px" }}>
                Inclus dans votre abonnement — aucune clé API requise.
              </p>
            </Reveal>

            {/* Mock Agent IA agent */}
            <Reveal from="left" delay={80} className="land-split-mock" style={{ flex: 1, minWidth: 0 }}>
              <div style={{ background: "#F5F5F7", border: `1px solid ${C.border}`, borderRadius: "20px", padding: "16px", boxShadow: shadow.float, display: "flex", flexDirection: "column", gap: "10px" }}>

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "800", color: C.ink, letterSpacing: "-0.02em" }}>Agent IA</span>
                  <span style={{ fontSize: "10px", fontWeight: "800", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", color: "#C1E8FF", borderRadius: "6px", padding: "3px 8px", letterSpacing: "0.5px" }}>AUTO</span>
                  <div style={{ flex: 1 }}/>
                </div>
                <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "-6px" }}>Depuis le 31 mai 2026 · Capital 12 850,00 € · CTO</div>

                {/* Hero card navy */}
                <div style={{ background: "linear-gradient(135deg, #1A3A6B 0%, #2563EB 100%)", borderRadius: "14px", padding: "14px 16px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "0" }}>
                  {/* Perf left */}
                  <div style={{ paddingRight: "16px", borderRight: "1px solid rgba(255,255,255,0.15)", marginRight: "16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2px" }}>
                    <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>Agent IA</div>
                    <div style={{ fontSize: "22px", fontWeight: "800", color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.1 }}>+31.4%</div>
                    <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.45)", margin: "4px 0 2px" }}>VS</div>
                    <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>Vous</div>
                    <div style={{ fontSize: "18px", fontWeight: "800", color: "rgba(255,255,255,0.75)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>+12.4%</div>
                  </div>
                  {/* Quote right */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ fontSize: "9px", fontWeight: "700", color: "#27AE60", background: "rgba(39,174,96,0.18)", padding: "2px 8px", borderRadius: "20px", alignSelf: "flex-start" }}>L'IA MÈNE +19.0%</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ fontSize: "10px", fontWeight: "700", color: "#fff" }}>Agent IA</span>
                    </div>
                    <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.72)", fontStyle: "italic", lineHeight: 1.6 }}>
                      "J'ai soldé PayPal à -73 % pendant que tu hésitais. Couper une perte n'est pas un échec. C'est ce qui t'empêche d'en transformer une en catastrophe."
                    </div>
                    <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.35)", marginTop: "2px" }}>Depuis le 31 mai 2026 · CTO</div>
                  </div>
                </div>

                {/* 4 stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px" }}>
                  {[
                    { label: "Valeur IA",             val: "16 887,35 €", sub: "+31.4%",                 subColor: "#27AE60" },
                    { label: "Cash dispo",             val: "1 542,00 €",  sub: "12% du capital",           subColor: C.inkSubtle },
                    { label: "vs Votre portefeuille",  val: "+19.0%",      sub: "IA +31.4% · Vous +12.4%", subColor: "#27AE60" },
                    { label: "Positions · Trades",     val: "4 · 3",       sub: "Dernier cycle 01/06/2026",  subColor: C.inkSubtle },
                  ].map((s, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.72)", border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px", backdropFilter: "blur(8px)" }}>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>{s.label}</div>
                      <div style={{ fontSize: "18px", fontWeight: "800", color: C.ink, letterSpacing: "-0.01em" }}>{s.val}</div>
                      <div style={{ fontSize: "11px", color: s.subColor, marginTop: "3px", fontWeight: "500" }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Positions */}
                <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "10px", fontWeight: "700", color: C.ink }}>Positions (4)</span>
                    <span style={{ fontSize: "9px", color: C.inkSubtle }}>15 345,35 € investis</span>
                  </div>
                  {[
                    { nom: "NVIDIA CORP",               ticker: "NVDA",   titres: "12 titres", pf: "14% PF", cours: "178,40 €",  pru: "128,60 €", val: "2 140,80 €", pv: "+38.7%", pvPos: true },
                    { nom: "AMUNDI MSCI WORLD",         ticker: "CW8",    titres: "18 titres", pf: "57% PF", cours: "486,20 €",  pru: "401,30 €", val: "8 751,60 €", pv: "+21.2%", pvPos: true },
                    { nom: "ALLIANZ SE",                ticker: "ALV.DE", titres: "10 titres", pf: "24% PF", cours: "375,40 €",  pru: "310,50 €", val: "3 754,00 €", pv: "+20.9%", pvPos: true },
                    { nom: "MICROSOFT",                 ticker: "MSFT",   titres: "6 titres",  pf: "7% PF",  cours: "185,20 €",  pru: "148,30 €", val: "1 111,20 €", pv: "+24.9%", pvPos: true },
                  ].map((p, i) => (
                    <div key={i} style={{ padding: "10px 14px", borderBottom: i < 3 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>{p.nom}</div>
                        <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>
                          <span style={{ color: C.accent, fontWeight: "600" }}>{p.ticker}</span>
                          {" · "}{p.titres}{" · "}{p.pf}
                        </div>
                        <div style={{ fontSize: "11px", color: C.inkSubtle }}>Cours {p.cours} · PRU {p.pru}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>{p.val}</div>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: p.pvPos ? "#27AE60" : "#DC2626" }}>{p.pv}</div>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* ── Section Tarifs ───────────────────────────────────────────────── */}
      <div id="lp-tarifs" className="land-section" style={{ padding: "80px 48px", background: "#fff", borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: "860px", margin: "0 auto" }}>
          <Reveal from="bottom" style={{ textAlign: "center", marginBottom: "48px" }}>
            <div style={{ fontSize: "9px", fontWeight: "700", color: C.accent, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: "12px" }}>Tarifs</div>
            <div style={{ fontSize: "26px", fontWeight: "800", letterSpacing: "-0.03em", color: C.ink, lineHeight: 1.2 }}>
              Simple et transparent
            </div>
            <p style={{ fontSize: "13px", color: C.inkMuted, marginTop: "12px", maxWidth: "400px", margin: "12px auto 0", lineHeight: 1.8 }}>
              7 jours d'essai complet, sans carte bancaire. Ensuite, moins d'un café par mois.
            </p>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", maxWidth: "960px", margin: "0 auto" }}>
            {/* Essai */}
            <Reveal from="bottom" delay={0} style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "22px", padding: "28px 24px", boxShadow: shadow.card }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>Essai</div>
              <div style={{ fontSize: "30px", fontWeight: "900", color: C.ink, letterSpacing: "-0.04em", marginBottom: "4px" }}>Gratuit</div>
              <div style={{ fontSize: "11px", color: C.inkMuted, marginBottom: "20px" }}>7 jours · Sans carte bancaire</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {["Toutes les fonctionnalités", "Signaux IA quotidiens", "Agent IA autonome", "Projections & DCA", "Chat IA"].map((f, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d="M2.5 7l3 3 6-6" stroke={C.green} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span style={{ fontSize: "11px", color: C.inkMuted }}>{f}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Basique */}
            <Reveal from="bottom" delay={100} style={{ background: "#fff", border: `2px solid ${C.accent}`, borderRadius: "22px", padding: "28px 24px", boxShadow: shadow.float, position: "relative" }}>
              <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: C.accentGrad, color: "#fff", fontSize: "10px", fontWeight: "700", padding: "3px 12px", borderRadius: "20px", whiteSpace: "nowrap" }}>Le plus populaire</div>
              <div style={{ fontSize: "11px", fontWeight: "700", color: C.accent, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>Basique</div>
              <div style={{ fontSize: "30px", fontWeight: "900", color: C.ink, letterSpacing: "-0.04em", marginBottom: "4px" }}>
                2,99 €<span style={{ fontSize: "12px", fontWeight: "500", color: C.inkMuted, marginLeft: "4px" }}>/mois</span>
              </div>
              <div style={{ fontSize: "11px", color: C.inkMuted, marginBottom: "20px" }}>Sans engagement · Résiliable</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {["Signaux IA quotidiens", "Agent IA (2 cycles/jour)", "Projections & DCA", "Chat IA", "Synchronisation cloud", "50 analyses IA/jour"].map((f, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d="M2.5 7l3 3 6-6" stroke={C.green} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span style={{ fontSize: "11px", color: C.ink }}>{f}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* Pro */}
            <Reveal from="bottom" delay={200} style={{ background: "linear-gradient(160deg,#1A3A5C,#2D5986)", borderRadius: "22px", padding: "28px 24px", boxShadow: "0 12px 40px rgba(45,108,181,0.30)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: "-30px", right: "-30px", width: "100px", height: "100px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }}/>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>Pro</div>
              <div style={{ fontSize: "30px", fontWeight: "900", color: "#fff", letterSpacing: "-0.04em", marginBottom: "4px" }}>
                7,99 €<span style={{ fontSize: "12px", fontWeight: "500", color: "rgba(255,255,255,0.5)", marginLeft: "4px" }}>/mois</span>
              </div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "20px" }}>Sans engagement · Résiliable</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {["Tout le plan Basique", "500 analyses IA/jour", "Autopilot illimité", "Priorité sur les analyses", "Support prioritaire"].map((f, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d="M2.5 7l3 3 6-6" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.8)" }}>{f}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <p style={{ textAlign: "center", marginTop: "20px", fontSize: "11px", color: C.inkSubtle }}>
            Paiement sécurisé par Stripe · L'essai commence sans carte bancaire
          </p>
        </div>
      </div>

      {/* ── Footer CTA ───────────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg,#EEF3FA,#F5F5F7)", padding: "80px 24px 96px", textAlign: "center", borderTop: `1px solid ${C.border}` }}>
        <Reveal from="bottom" style={{ maxWidth: "520px", margin: "0 auto" }}>
          <div style={{ fontSize: "clamp(26px,5vw,38px)", fontWeight: "900", letterSpacing: "-0.04em", color: C.ink, marginBottom: "16px", lineHeight: 1.1 }}>
            Investissez avec méthode.<br/>
            <span style={{ backgroundImage: C.accentGrad, backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "bn-wave 4s ease infinite" }}>Pilotez votre patrimoine.</span>
          </div>
          <p style={{ fontSize: "13px", color: C.inkMuted, marginBottom: "32px", lineHeight: 1.85 }}>
            Créez votre compte, ajoutez vos positions et laissez BourseNext analyser votre portefeuille. L'IA vous explique chaque décision.
          </p>
          <CTAPrimary style={{ padding: "14px 40px", fontSize: "14px" }}/>
          <p style={{ marginTop: "14px", fontSize: "11px", color: C.inkSubtle }}>
            Sans carte bancaire · Essai gratuit 7 jours · Vos données restent chez vous
          </p>
        </Reveal>
      </div>

      {/* ── Footer bas ───────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${C.border}`, background: C.snow, padding: "20px 48px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: "11px", color: C.inkSubtle }}>© 2026 BourseNext · Données à titre indicatif uniquement</span>
      </div>

      {/* ── Scroll to top ─────────────────────────────────────────────────── */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        style={{
          position: "fixed", bottom: "32px", right: "32px", zIndex: 9999,
          width: "44px", height: "44px", borderRadius: "50%",
          background: C.accentGrad, border: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", boxShadow: shadow.pill,
          opacity: showTop ? 1 : 0, pointerEvents: showTop ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
        aria-label="Remonter en haut"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 12V4M4 7l4-4 4 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}
