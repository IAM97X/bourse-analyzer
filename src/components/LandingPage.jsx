import { useState } from "react";
import { C, shadow } from "../constants/theme";
import CompanyAvatar from "./CompanyAvatar";

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

export default function LandingPage({ onDemo, onLogin }) {
  const [loading, setLoading] = useState(false);

  const handleDemo = () => {
    setLoading(true);
    setTimeout(onDemo, 300);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F7", fontFamily: "'DM Sans', sans-serif", color: C.ink, display: "flex", flexDirection: "column", overflowX: "hidden" }}>
      <style>{`
        @keyframes land-in    { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @keyframes land-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes bn-wave    { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        .land-feat { transition: box-shadow 0.18s ease, transform 0.18s ease, border-color 0.18s ease; }
        .land-feat:hover { box-shadow: ${shadow.hover}; transform: translateY(-3px); border-color: rgba(45,108,181,0.2) !important; }
        .land-btn-cta { transition: box-shadow 0.18s ease, transform 0.18s ease; }
        .land-btn-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(45,108,181,0.4) !important; }
        .land-btn-sec { transition: background 0.15s ease, transform 0.15s ease; }
        .land-btn-sec:hover { background: ${C.snowDim} !important; transform: translateY(-1px); }
        @media (max-width: 768px) {
          .land-grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
          .land-grid-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .land-nav { padding: 14px 20px !important; }
          .land-hero { padding: 60px 20px 48px !important; }
          .land-section { padding: 48px 20px !important; }
        }
        @media (max-width: 480px) {
          .land-grid-4 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav className="land-nav" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 48px", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.85)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", position: "sticky", top: 0, zIndex: 100 }}>
        <span style={{ fontSize: "20px", fontWeight: "300", color: C.inkSoft, letterSpacing: "-0.01em", fontFamily: "'DM Sans', sans-serif" }}>
          Bourse<span style={{ fontWeight: "800", letterSpacing: "-0.04em", backgroundImage: `${C.accentGrad}`, backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "bn-wave 4s ease infinite" }}>Next</span>
        </span>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button onClick={handleDemo} className="land-btn-sec" style={{ background: C.snowOff, border: `1px solid ${C.border}`, color: C.inkMuted, padding: "8px 18px", borderRadius: "8px", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Voir la démo
          </button>
          <button onClick={onLogin} className="land-btn-cta" style={{ background: C.accentGrad, border: "none", color: C.snow, padding: "8px 20px", borderRadius: "50px", fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: shadow.pill }}>
            Se connecter
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="land-hero" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 24px 64px", textAlign: "center", animation: "land-in 0.5s ease forwards" }}>

        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", background: C.navyLight, border: `1px solid rgba(45,108,181,0.15)`, borderRadius: "50px", padding: "5px 14px", fontSize: "11px", fontWeight: "700", color: C.accent, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "28px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.green, display: "inline-block" }} />
          Portefeuille boursier nouvelle génération
        </div>

        {/* Titre */}
        <h1 style={{ fontSize: "clamp(32px, 6vw, 60px)", fontWeight: "900", letterSpacing: "-0.04em", lineHeight: 1.08, margin: "0 0 20px", maxWidth: "740px", color: C.ink, fontFamily: "'DM Sans', sans-serif" }}>
          Investissez mieux.<br />
          <span style={{ backgroundImage: C.accentGrad, backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "bn-wave 4s ease infinite" }}>
            Laissez l'IA travailler.
          </span>
        </h1>

        {/* Sous-titre */}
        <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: 1.8, maxWidth: "520px", margin: "0 0 40px", fontWeight: "400" }}>
          Suivez votre portefeuille PEA et CTO, obtenez des signaux IA sur chaque position et défiez un agent autonome gérant son propre capital.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={handleDemo} disabled={loading} className="land-btn-cta" style={{
            padding: "11px 28px", borderRadius: "50px", border: "none",
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
            padding: "11px 28px", borderRadius: "50px",
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

        {/* ── Mock UI ── */}
        <div style={{ marginTop: "60px", width: "100%", maxWidth: "820px", animation: "land-float 5s ease-in-out infinite" }}>
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "22px", boxShadow: shadow.float }}>

            {/* Fake topbar */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "18px" }}>
              <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#FF5F57" }} />
              <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#FEBC2E" }} />
              <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#28C840" }} />
              <div style={{ flex: 1, height: "1px", background: C.border, marginLeft: "8px" }} />
              <div style={{ height: "16px", width: "60px", borderRadius: "4px", background: C.snowOff }} />
            </div>

            {/* KPI row */}
            <div className="land-grid-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "18px" }}>
              {[
                { label: "Patrimoine",    val: "36 034 €",  color: C.ink },
                { label: "Plus-value",    val: "+4 934 €",  color: C.green },
                { label: "Performance",   val: "+15.8%",    color: C.green },
                { label: "IA vs vous",    val: "+1.8%",     color: C.accent },
              ].map(s => (
                <div key={s.label} style={{ background: C.snowOff, borderRadius: "10px", padding: "12px 14px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "5px" }}>{s.label}</div>
                  <div style={{ fontSize: "16px", fontWeight: "800", color: s.color, letterSpacing: "-0.02em" }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Header colonnes */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: "8px", padding: "0 12px 6px", alignItems: "center" }}>
              <span style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px" }}>Valeur</span>
              <span style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", textAlign: "right", minWidth: "52px" }}>Cours</span>
              <span style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", textAlign: "right", minWidth: "44px" }}>Qté</span>
              <span style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", textAlign: "right", minWidth: "52px" }}>P/V</span>
              <span style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", textAlign: "right", minWidth: "72px" }}>Signal</span>
            </div>
            {/* Positions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {MOCK_POSITIONS.map(p => {
                const valeur = (p.cours * p.qte).toLocaleString("fr-FR", { maximumFractionDigits: 0 });
                const pv = p.cours - p.pru;
                const pvPct = ((pv / p.pru) * 100).toFixed(1);
                const pvColor = pv >= 0 ? C.green : C.red;
                return (
                  <div key={p.nom} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: "8px", alignItems: "center", background: C.snowOff, borderRadius: "8px", padding: "8px 12px", border: `1px solid ${C.border}` }}>
                    {/* Nom + logo + signal */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <CompanyAvatar nom={p.nom} isin={p.isin} size={30} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nom}</div>
                        <span style={{ fontSize: "9px", fontWeight: "700", color: p.sigColor, background: p.sigBg, padding: "1px 6px", borderRadius: "50px", letterSpacing: "0.3px" }}>{p.signal}</span>
                      </div>
                    </div>
                    {/* Cours */}
                    <div style={{ textAlign: "right", minWidth: "52px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{p.cours} €</span>
                    </div>
                    {/* Qté */}
                    <div style={{ textAlign: "right", minWidth: "44px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "600", color: C.inkMuted }}>{p.qte}</span>
                    </div>
                    {/* P/V */}
                    <div style={{ textAlign: "right", minWidth: "52px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700", color: pvColor }}>{pv >= 0 ? "+" : ""}{pvPct}%</span>
                    </div>
                    {/* Valeur */}
                    <div style={{ textAlign: "right", minWidth: "72px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "800", color: C.ink }}>{valeur} €</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      <div className="land-section" style={{ padding: "64px 48px", background: C.snow, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "44px" }}>
            <div style={{ fontSize: "9px", fontWeight: "700", color: C.accent, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: "10px" }}>Fonctionnalités</div>
            <div style={{ fontSize: "20px", fontWeight: "800", letterSpacing: "-0.03em", color: C.ink }}>Tout ce dont vous avez besoin</div>
          </div>
          <div className="land-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="land-feat" style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "18px", padding: "22px 18px", boxShadow: shadow.card }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, marginBottom: "14px" }}>
                  {f.icon}
                </div>
                <div style={{ fontSize: "13px", fontWeight: "800", marginBottom: "8px", letterSpacing: "-0.02em", color: C.ink }}>{f.titre}</div>
                <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.7 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer CTA ── */}
      <div style={{ textAlign: "center", padding: "64px 24px 80px", background: "#F5F5F7" }}>
        <div style={{ maxWidth: "480px", margin: "0 auto" }}>
          <div style={{ fontSize: "20px", fontWeight: "800", letterSpacing: "-0.03em", color: C.ink, marginBottom: "12px" }}>
            Prêt à investir différemment ?
          </div>
          <p style={{ fontSize: "13px", color: C.inkMuted, marginBottom: "28px", lineHeight: 1.7 }}>
            Accédez à votre tableau de bord en quelques secondes. Aucune installation requise.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={handleDemo} disabled={loading} className="land-btn-cta" style={{ padding: "11px 28px", borderRadius: "50px", border: "none", background: C.accentGrad, backgroundSize: "300% 300%", color: C.snow, fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: shadow.pill }}>
              {loading ? "Chargement…" : "Voir la démo →"}
            </button>
            <button onClick={onLogin} className="land-btn-sec" style={{ padding: "11px 28px", borderRadius: "50px", border: `1px solid ${C.border}`, background: C.snow, color: C.inkSoft, fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Créer un compte
            </button>
          </div>
        </div>
        <div style={{ marginTop: "48px", fontSize: "11px", color: C.inkSubtle }}>
          © 2025 BourseNext · Données à titre indicatif uniquement
        </div>
      </div>
    </div>
  );
}
