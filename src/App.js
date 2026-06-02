import { useState, useRef, useEffect, useCallback, useMemo, Component } from "react";
import { createPortal } from "react-dom";
import { C, shadow } from "./constants/theme";
import { SYSTEM_PROMPT, PORTFOLIO_PROMPT, ETF_DCA_PROMPT, MARKET_SCORING_PROMPT, AVIS_PARSE_PROMPT, SUGGESTIONS } from "./constants/prompts";
import { MARKETS_CFG, MARKET_HOLIDAYS, getMarketStatus } from "./constants/markets";
import { COURTIERS, COURTIERS_DETAIL, calcFraisCourtage, tauxFraisCourtage } from "./constants/courtiers";
import { AUTOPILOT_UNIVERSE, fetchYahooPrices } from "./constants/universe";
import { LOGO_DB, resolveLogoUrl, avatarColor, deriveBaseName, buildLogoSources } from "./constants/logos";
import CompanyAvatar from "./components/CompanyAvatar";
import MarketStatusBar from "./components/MarketStatusBar";
import DashboardBar from "./components/DashboardBar";
import Sidebar, { IconChat, NAV_GROUPS } from "./components/Sidebar";
import AutopilotIA from "./components/AutopilotIA";
import ChatTab, { AIAssistant } from "./components/ChatTab";
import PortfolioPieChart, { ISIN_SECTEUR } from "./components/PortfolioPieChart";
import { StatBox, Card, LoadingPanel, ErrorPanel } from "./components/UI";
import ProjectionTab from "./components/ProjectionTab";
import PortfolioChart, { InfoTip } from "./components/PortfolioChart";
import HistoriqueTab, { OperationsTab } from "./components/HistoriqueTab";
import StratégieDCATab from "./components/StratégieDCATab";
import { PriceRangeBar, LiveMarketPanel, SellSimulator, StockProjectionChart, PriceEvolutionChart } from "./components/StockPanels";
import ProfilTab, { ParametresTab } from "./components/ProfilTab";
import { TabNav, SignalBadge } from "./components/TabNav";
import OnboardingGuide, { ONBOARDING_KEY } from "./components/OnboardingGuide";
import { ETFResultPanel, ResultPanel, PortfolioResult } from "./components/ResultPanels";
import CapturesPanel, { makeCapture, downloadCapture, CAPTURES_KEY } from "./components/CapturesPanel";
import DividendesCard from "./components/DividendesCard";
import MarcheTab from "./components/MarcheTab";
import PortfolioTab from "./components/PortfolioTab";
import { UI, SIGNAL_CONFIG, RISQUE_PCT, DEFAULT_PROFIL, DEFAULT_POSITIONS, MOIS_FR, SECTEUR_MAP, translateSecteur } from "./constants/config";
import { MobileCtx, TabletCtx, useIsMobile, useIsTablet, MobileProvider } from "./context/mobile";
import { TABS } from "./constants/tabs";
import { save, load, supabase, setSyncUserId, pullFromCloud } from "./lib/storage";
import { parsePrice, fmtEur, fmtCours, fmtPct, fmtPV, getCachedCours, setCachedCours, sanitizePositions, isETFName, computeRiskScore, PROFIL_RANK, getMIC, getEuronextUrl, linReg } from "./lib/finance";
import { delay, CLAUDE_MODELS, getKey, ANTHROPIC_API_KEY, GOOGLE_API_KEY, GOOGLE_CX, hasClaudeKey, CLAUDE_ENDPOINT, enqueueApi, callClaude, callClaudeHaiku, callClaudeConversation, callGoogleSearch, fetchWithProxy } from "./lib/api";
import { fetchYahooAnalysts, fetchGoogleNewsRSS, formatExternalContext } from "./lib/market";
import PWAInstallBanner from "./components/PWAInstallBanner";
import AuthPage from "./components/AuthPage";
import BourseAnalyzerInner from "./components/BourseAnalyzerInner";
import LandingPage from "./components/LandingPage";
import { loadDemoData, isDemoMode } from "./constants/demoData";
import { SubscriptionProvider } from "./context/subscription";





// ─── Euronext MIC helper ──────────────────────────────────────────────────────
// Pour un PEA, les valeurs éligibles sont principalement sur Euronext Paris.
// Certaines sociétés de droit néerlandais (Technip Energies, Airbus, Stellantis…) sont
// cotées sur Euronext Paris malgré un ISIN NL → on les force en XPAR.
const STORAGE_VERSION = "v4";
const TICKER_CACHE_KEY = "bourse_isin_ticker_cache";
const DEFAULT_SCREENING_STOCKS = [
  "Valneva", "Median Technologies", "Riber", "Guillemot", "Solutions 30",
  "Genomic Vision", "Obiz", "Osmoz Technologies", "NovaBay Pharmaceuticals",
  "Compagnie Lebon", "Hexaom", "Lectra", "Inventiva", "Ose Immunotherapeutics",
];

// ─── Storage version migration ────────────────────────────────────────────────
(function migrateStorage() {
  const stored = localStorage.getItem("bourse_storage_version");
  if (stored !== STORAGE_VERSION) {
    localStorage.removeItem("bourse_portfolio");
    localStorage.removeItem("bourse_cours_cache");
    localStorage.removeItem("bourse_cours_cache_v2");
    localStorage.setItem("bourse_storage_version", STORAGE_VERSION);
  }
})();

// ─── Ticker sanitization migration (one-shot) ─────────────────────────────────
(function migrateTickerSanitize() {
  if (localStorage.getItem("bourse_ticker_migration_v1") === "1") return;
  try {
    const raw = localStorage.getItem("bourse_portfolio");
    if (raw) {
      const portfolio = JSON.parse(raw);
      if (Array.isArray(portfolio)) {
        const clean = portfolio.map(p => {
          if (!p.ticker) return p;
          const t = String(p.ticker).replace(/[^A-Z0-9.\-^=]/gi, "");
          return t !== p.ticker ? { ...p, ticker: t } : p;
        });
        localStorage.setItem("bourse_portfolio", JSON.stringify(clean));
      }
    }
    const cache = localStorage.getItem("bourse_isin_ticker_cache");
    if (cache) {
      const obj = JSON.parse(cache);
      if (obj && typeof obj === "object") {
        let changed = false;
        const cleanCache = {};
        Object.entries(obj).forEach(([isin, ticker]) => {
          const t = String(ticker || "").replace(/[^A-Z0-9.\-^=]/gi, "");
          cleanCache[isin] = t;
          if (t !== ticker) changed = true;
        });
        if (changed) localStorage.setItem("bourse_isin_ticker_cache", JSON.stringify(cleanCache));
      }
    }
  } catch {}
  localStorage.setItem("bourse_ticker_migration_v1", "1");
})();

// ─── Error Boundary ──────────────────────────────────────────────────────────
class AppErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#fff", fontFamily: "'DM Sans', sans-serif", padding: "24px", textAlign: "center" }}>
        <div style={{ fontSize: "16px", fontWeight: "700", color: "#0F172A", marginBottom: "8px" }}>Une erreur s'est produite</div>
        <div style={{ fontSize: "12px", color: "#64748B", marginBottom: "8px", maxWidth: "500px", wordBreak: "break-word" }}>{this.state.error?.message || "Erreur inconnue"}</div>
        {process.env.NODE_ENV !== "production" && (
          <pre style={{ fontSize: "9px", color: "#94A3B8", maxWidth: "90vw", overflowX: "auto", textAlign: "left", background: "#F8FAFC", padding: "8px", borderRadius: "8px", marginBottom: "16px", whiteSpace: "pre-wrap" }}>{this.state.error?.stack}</pre>
        )}
        <button onClick={() => window.location.reload()} style={{ background: "#1E3A5F", color: "#fff", border: "none", borderRadius: "10px", padding: "10px 24px", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Recharger</button>
      </div>
    );
  }
}

// Détecte un vrai téléphone : appareil tactile + petite largeur d'écran
const isPhone = () => {
  const touch = window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches;
  return touch && window.screen.width < 768;
};

function MobileBlock() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "linear-gradient(135deg, #021024 0%, #052659 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "32px 24px", textAlign: "center", fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ fontSize: "28px", fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.02em" }}>
        <span style={{ fontWeight: "300", color: "rgba(193,232,255,0.85)" }}>Bourse</span>
        <span style={{ fontWeight: "800", background: "linear-gradient(135deg, #0F2D5E 0%, #2D6CB5 50%, #7BBFE8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Next</span>
      </div>
      <div style={{ marginTop: "28px", fontSize: "22px", fontWeight: "800", color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.2 }}>
        Application non disponible<br />sur mobile
      </div>
      <div style={{ marginTop: "14px", fontSize: "14px", color: "rgba(193,232,255,0.6)", lineHeight: 1.65, maxWidth: "300px" }}>
        BourseNext est optimisé pour les écrans de <strong style={{ color: "rgba(193,232,255,0.9)" }}>tablette et ordinateur</strong>.
      </div>
      <div style={{ marginTop: "32px", display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "14px 20px" }}>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "#fff" }}>Accède depuis un ordinateur</div>
          <div style={{ fontSize: "11px", color: "rgba(193,232,255,0.5)", marginTop: "2px" }}>ou une tablette (≥ 768 px)</div>
        </div>
      </div>
    </div>
  );
}

export default function BourseAnalyzer() {
  const [state, setState] = useState("loading"); // "loading" | "landing" | "auth" | "app"
  const [userName, setUserName] = useState("");
  const [loginKey, setLoginKey] = useState(0);
  const [userId, setUserId] = useState(null);
  const [authMode, setAuthMode] = useState("signin");
  const [isMobileScreen, setIsMobileScreen] = useState(() => isPhone());

  useEffect(() => {
    const check = () => setIsMobileScreen(isPhone());
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => { window.removeEventListener("resize", check); window.removeEventListener("orientationchange", check); };
  }, []);

  useEffect(() => {
    if (!supabase) {
      // Mode sans Supabase → localStorage session uniquement
      try {
        const s = JSON.parse(localStorage.getItem("bourse_session") || "null");
        if (s?.name) { setUserName(s.name); setState("app"); }
        else setState("landing");
      } catch { setState("landing"); }
      return;
    }

    // Récupérer la session Supabase active
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setSyncUserId(session.user.id);
        setUserId(session.user.id);
        const name = session.user.user_metadata?.display_name || session.user.email?.split("@")[0] || "Utilisateur";
        setUserName(name);
        await pullFromCloud(session.user.id);
        setState("app");
      } else {
        // Vérifier session locale (connexion sans compte)
        try {
          const s = JSON.parse(localStorage.getItem("bourse_session") || "null");
          if (s?.name && !s.uid) { setUserName(s.name); setState("app"); }
          else setState("landing");
        } catch { setState("landing"); }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setSyncUserId(null);
        setState("auth");
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        setSyncUserId(session.user.id);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  const handleSession = (name) => {
    setUserName(name);
    setLoginKey(k => k + 1);
    setState("app");
  };

  const handleLogout = async () => {
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await supabase.auth.signOut();
    }
    localStorage.removeItem("bourse_session");
    setSyncUserId(null);
    setState("landing");
  };

  const handleDemo = () => {
    loadDemoData();
    setUserName("Démo");
    setLoginKey(k => k + 1);
    setState("app");
  };

  if (isMobileScreen) return <MobileBlock />;

  if (state === "loading") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #021024 0%, #052659 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        @keyframes bn-next-wave { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes bn-load-in   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bn-load-pulse{ 0%,100%{opacity:0.35} 50%{opacity:0.7} }
      `}</style>
      <div style={{ textAlign: "center", animation: "bn-load-in 0.6s ease forwards" }}>
        <div style={{ fontSize: "36px", fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.02em" }}>
          <span style={{ fontWeight: "300", color: "rgba(193,232,255,0.85)" }}>Bourse</span>
          <span style={{ fontWeight: "800", letterSpacing: "-0.04em", backgroundImage: "linear-gradient(270deg, #0F2D5E, #2D6CB5, #7BBFE8, #2D6CB5, #0F2D5E)", backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "bn-next-wave 3s ease infinite" }}>Next</span>
        </div>
        <div style={{ marginTop: "8px", fontSize: "13px", color: "rgba(193,232,255,0.45)", fontFamily: "'DM Sans', sans-serif", fontWeight: "300", letterSpacing: "0.06em" }}>Soyez le prochain.</div>
        <div style={{ marginTop: "20px", fontSize: "12px", color: "rgba(193,232,255,0.5)", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", animation: "bn-load-pulse 1.8s ease-in-out infinite" }}>Chargement…</div>
      </div>
    </div>
  );

  if (state === "landing") return <LandingPage onLogin={() => { setAuthMode("signin"); setState("auth"); }} onRegister={() => { setAuthMode("signup"); setState("auth"); }} />;
  if (state === "auth") return <AuthPage onSession={handleSession} onBack={() => setState("landing")} initialMode={authMode} />;
  return (
    <AppErrorBoundary>
      <MobileProvider>
        <SubscriptionProvider userId={userId}>
          <BourseAnalyzerInner key={loginKey} userName={userName} onLogout={handleLogout} />
        </SubscriptionProvider>
      </MobileProvider>
    </AppErrorBoundary>
  );
}
