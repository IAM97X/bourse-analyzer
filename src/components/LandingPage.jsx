import { useState } from "react";

const C = {
  navy:    "#1A3A6B",
  navyDk:  "#0F2D5E",
  accent:  "#2D6CB5",
  accentLt:"#4B9DD8",
  border:  "rgba(15,23,42,0.08)",
  ink:     "#0F172A",
  inkSub:  "#64748B",
  inkMut:  "#94A3B8",
  bg:      "#F8FAFC",
};

const FEATURES = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    titre: "Suivi en temps réel",
    desc: "Cours mis à jour automatiquement, plus-values, historique de performance. Votre portefeuille PEA et CTO au même endroit.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
      </svg>
    ),
    titre: "Analyse IA des positions",
    desc: "Scoring de chaque position, détection des opportunités, conseiller financier disponible 24h/24. Basé sur les actualités du jour.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
    titre: "Portefeuille IA autonome",
    desc: "Un agent IA gère son propre portefeuille en parallèle du vôtre — même capital, mêmes règles. Comparez vos décisions aux siennes.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
      </svg>
    ),
    titre: "Plan DCA intelligent",
    desc: "Simulateur de versements programmés, projection de votre patrimoine et stratégie d'allocation adaptée à votre profil.",
  },
];

export default function LandingPage({ onDemo, onLogin }) {
  const [loading, setLoading] = useState(false);

  const handleDemo = () => {
    setLoading(true);
    setTimeout(onDemo, 300);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#fff",
      fontFamily: "'DM Sans', sans-serif",
      color: C.ink,
      display: "flex",
      flexDirection: "column",
      overflowX: "hidden",
    }}>
      <style>{`
        @keyframes land-in  { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
        @keyframes land-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        .land-feat:hover { box-shadow: 0 8px 32px rgba(15,23,42,0.08); transform: translateY(-3px); border-color: rgba(45,108,181,0.25) !important; }
        .land-feat { transition: all 0.2s; }
        .land-cta-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(45,108,181,0.45) !important; }
        .land-cta-primary { transition: all 0.2s; }
        .land-cta-sec:hover { background: ${C.bg} !important; transform: translateY(-2px); }
        .land-cta-sec { transition: all 0.2s; }
        @media (max-width: 640px) {
          .land-grid { grid-template-columns: 1fr !important; }
          .land-stats { grid-template-columns: repeat(2,1fr) !important; }
          .land-nav-pad { padding: 14px 20px !important; }
          .land-hero-pad { padding: 60px 20px 40px !important; }
          .land-feat-pad { padding: 40px 20px 60px !important; }
        }
      `}</style>

      {/* Nav */}
      <nav className="land-nav-pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 48px", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <span style={{ fontSize: "19px", fontWeight: "800", letterSpacing: "-0.04em", color: C.navyDk, fontFamily: "'DM Sans', sans-serif" }}>
          Bourse<span style={{ color: C.accent }}>Next</span>
        </span>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button onClick={handleDemo} className="land-cta-sec" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.inkSub, padding: "8px 18px", borderRadius: "10px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Démo
          </button>
          <button onClick={onLogin} style={{ background: C.accent, border: "none", color: "#fff", padding: "8px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.18s" }}
            onMouseEnter={e => e.currentTarget.style.background = C.navyDk}
            onMouseLeave={e => e.currentTarget.style.background = C.accent}>
            Se connecter
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="land-hero-pad" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px 60px", textAlign: "center", animation: "land-in 0.5s ease forwards" }}>

        {/* Badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", background: "rgba(45,108,181,0.07)", border: "1px solid rgba(45,108,181,0.18)", borderRadius: "50px", padding: "5px 14px", fontSize: "11px", fontWeight: "700", color: C.accent, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "28px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
          Portefeuille boursier nouvelle génération
        </div>

        {/* Titre */}
        <h1 style={{ fontSize: "clamp(34px, 6vw, 64px)", fontWeight: "900", letterSpacing: "-0.04em", lineHeight: 1.08, margin: "0 0 20px", maxWidth: "760px", color: C.navyDk }}>
          Investissez mieux.<br />
          <span style={{ backgroundImage: `linear-gradient(90deg, ${C.accent}, ${C.accentLt})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Laissez l'IA travailler.
          </span>
        </h1>

        {/* Sous-titre */}
        <p style={{ fontSize: "clamp(15px, 2vw, 17px)", color: C.inkSub, lineHeight: 1.75, maxWidth: "540px", margin: "0 0 44px", fontWeight: "400" }}>
          Suivez votre portefeuille PEA et CTO, analysez vos positions avec l'IA et défiez un agent autonome qui gère son propre capital.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={handleDemo} disabled={loading} className="land-cta-primary" style={{
            padding: "14px 36px", borderRadius: "14px", border: "none",
            background: `linear-gradient(135deg, ${C.navyDk}, ${C.accent})`,
            color: "#fff", fontSize: "15px", fontWeight: "800",
            cursor: loading ? "default" : "pointer",
            fontFamily: "'DM Sans', sans-serif",
            boxShadow: "0 6px 28px rgba(45,108,181,0.35)",
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? "Chargement…" : "Essayer la démo"}
          </button>
          <button onClick={onLogin} className="land-cta-sec" style={{
            padding: "14px 36px", borderRadius: "14px",
            border: `1.5px solid ${C.border}`,
            background: "#fff",
            color: C.ink, fontSize: "15px", fontWeight: "700",
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>
            Créer un compte gratuit
          </button>
        </div>

        <p style={{ marginTop: "16px", fontSize: "12px", color: C.inkMut, fontWeight: "500" }}>
          Gratuit · Aucune carte bancaire · Données fictives en démo
        </p>

        {/* Mock UI */}
        <div style={{ marginTop: "64px", width: "100%", maxWidth: "860px", animation: "land-float 5s ease-in-out infinite" }}>
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: "20px", padding: "24px", boxShadow: "0 20px 60px rgba(15,23,42,0.09)" }}>
            {/* Fake header */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#FF5F57" }} />
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#FEBC2E" }} />
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#28C840" }} />
              <div style={{ flex: 1, height: "1px", background: C.border, marginLeft: "8px" }} />
            </div>
            {/* Stats */}
            <div className="land-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
              {[
                { label: "Patrimoine total", val: "36 100 €", color: C.navyDk },
                { label: "Plus-value", val: "+4 280 €", color: "#16A34A" },
                { label: "Performance", val: "+13.4%", color: "#16A34A" },
                { label: "vs IA agent", val: "-1.8%", color: C.accent },
              ].map(s => (
                <div key={s.label} style={{ background: C.bg, borderRadius: "12px", padding: "14px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: "9px", color: C.inkMut, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>{s.label}</div>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: s.color, letterSpacing: "-0.02em" }}>{s.val}</div>
                </div>
              ))}
            </div>
            {/* Chart */}
            <div style={{ height: "72px", background: C.bg, borderRadius: "10px", display: "flex", alignItems: "flex-end", padding: "8px 12px", gap: "3px", overflow: "hidden", border: `1px solid ${C.border}` }}>
              {[40,45,38,55,52,60,58,65,70,68,75,72,80,78,85,88,82,90,88,95].map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, background: `rgba(45,108,181,${0.18 + i * 0.025})`, borderRadius: "3px 3px 0 0" }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="land-feat-pad" style={{ padding: "60px 48px 80px", maxWidth: "1040px", margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: C.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>Fonctionnalités</div>
          <div style={{ fontSize: "clamp(22px, 3vw, 30px)", fontWeight: "800", letterSpacing: "-0.03em", color: C.navyDk }}>Tout ce dont vous avez besoin</div>
        </div>
        <div className="land-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "18px" }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="land-feat" style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: "18px", padding: "24px 20px" }}>
              <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(45,108,181,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, marginBottom: "16px" }}>
                {f.icon}
              </div>
              <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "9px", letterSpacing: "-0.02em", color: C.navyDk }}>{f.titre}</div>
              <div style={{ fontSize: "13px", color: C.inkSub, lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer CTA */}
      <div style={{ textAlign: "center", padding: "0 24px 80px", background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: "540px", margin: "0 auto", paddingTop: "64px" }}>
          <div style={{ fontSize: "clamp(22px, 3vw, 28px)", fontWeight: "800", letterSpacing: "-0.03em", color: C.navyDk, marginBottom: "16px" }}>
            Prêt à investir différemment ?
          </div>
          <p style={{ fontSize: "14px", color: C.inkSub, marginBottom: "28px", lineHeight: 1.7 }}>
            Accédez à votre tableau de bord en quelques secondes. Aucune installation.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={handleDemo} disabled={loading} style={{ padding: "13px 32px", borderRadius: "12px", border: "none", background: `linear-gradient(135deg, ${C.navyDk}, ${C.accent})`, color: "#fff", fontSize: "14px", fontWeight: "800", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 6px 24px rgba(45,108,181,0.3)" }}>
              {loading ? "Chargement…" : "Voir la démo"}
            </button>
            <button onClick={onLogin} style={{ padding: "13px 32px", borderRadius: "12px", border: `1.5px solid ${C.border}`, background: "#fff", color: C.ink, fontSize: "14px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Créer un compte
            </button>
          </div>
        </div>
        <div style={{ marginTop: "48px", fontSize: "12px", color: C.inkMut }}>
          © 2025 BourseNext · Données à titre indicatif uniquement
        </div>
      </div>
    </div>
  );
}
