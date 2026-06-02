import { useState, useEffect, useCallback, useRef, Component } from "react";
import { createPortal } from "react-dom";
import { C, shadow } from "../constants/theme";
import { SYSTEM_PROMPT, MARKET_SCORING_PROMPT, MARKET_SCORING_PROMPT_FALLBACK } from "../constants/prompts";
import { load, save } from "../lib/storage";
import { callClaude, enqueueApi, hasClaudeKey, hasAI, fetchWithProxy } from "../lib/api";
import { computeRSI, fmtEur, sanitizeTicker } from "../lib/finance";
import { fetchYahooAnalysts, fetchGoogleNewsRSS, formatExternalContext } from "../lib/market";
import { useIsMobile } from "../context/mobile";
import { UI, DEFAULT_PROFIL } from "../constants/config";
import { TABS } from "../constants/tabs";
import { Card } from "./UI";

import AutopilotIA from "./AutopilotIA";
import ChatTab, { AIAssistant } from "./ChatTab";
import MarketStatusBar from "./MarketStatusBar";
import DashboardBar from "./DashboardBar";
import Sidebar, { NAV_GROUPS } from "./Sidebar";
import PortfolioTab from "./PortfolioTab";
import MarcheTab from "./MarcheTab";
import StratégieDCATab from "./StratégieDCATab";
import ProjectionTab from "./ProjectionTab";
import HistoriqueTab, { OperationsTab } from "./HistoriqueTab";
import ProfilTab, { ParametresTab } from "./ProfilTab";
import AIPortfolioTab from "./AIPortfolioTab";
import OnboardingWizard, { ONBOARDING_KEY } from "./OnboardingWizard";
import TourGuide, { shouldShowTour, markTourDone } from "./TourGuide";
import PWAInstallBanner from "./PWAInstallBanner";
import HomeTab from "./HomeTab";
import OverviewTab from "./OverviewTab";
import { isDemoMode, clearDemoData } from "../constants/demoData";
import { useSubscription } from "../context/subscription";
import Paywall from "./Paywall";

class TabErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e) { if (process.env.NODE_ENV !== "production") console.error("[TabErrorBoundary]", e); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "300px", gap: "12px", fontFamily: "'DM Sans', sans-serif", textAlign: "center", padding: "40px" }}>
        <div style={{ fontSize: "15px", fontWeight: "700", color: "#0F172A" }}>Cet onglet a rencontré une erreur</div>
        <div style={{ fontSize: "12px", color: "#64748B", maxWidth: "400px" }}>{this.state.error?.message || "Erreur inattendue"}</div>
        <button onClick={() => this.setState({ error: null })}
          style={{ marginTop: "8px", background: "#2D6CB5", color: "#fff", border: "none", borderRadius: "10px", padding: "9px 20px", fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          Réessayer
        </button>
      </div>
    );
  }
}

const TICKER_CACHE_KEY = "bourse_isin_ticker_cache";

const DEMO_FREE_TABS = new Set([TABS.OVERVIEW, TABS.HOME, TABS.PORTFOLIO, TABS.MARCHE]);

const PORTFOLIO_TABS = [TABS.PORTFOLIO, TABS.HISTORIQUE, TABS.OPERATIONS];
const DCA_TABS  = [TABS.DCA, TABS.PROJECTION];
const IA_TABS   = [TABS.MARCHE, TABS.CHAT, TABS.AUTOPILOT, TABS.AI_PORTFOLIO];
const PLUS_TABS = [TABS.PLUS, TABS.PROFIL, TABS.SETTINGS];

const TAB_LABELS = {
  [TABS.OVERVIEW]:   "Vue d'ensemble",
  [TABS.HOME]:       "Accueil",
  [TABS.PORTFOLIO]:  "Positions",
  [TABS.DCA]:        "Plan DCA",
  [TABS.AUTOPILOT]:  "Opportunités",
  [TABS.PROJECTION]: "Simulateur",
  [TABS.MARCHE]:        "Signaux IA",
  [TABS.CHAT]:          "Conseiller Privé",
  [TABS.AI_PORTFOLIO]:  "Portefeuille IA",
  [TABS.HISTORIQUE]: "Répartition",
  [TABS.OPERATIONS]: "Transactions",
  [TABS.PROFIL]:     "Profil investisseur",
  [TABS.SETTINGS]:   "Paramètres",
  [TABS.PLUS]:       "Compte",
};

function PillBar({ pills, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: "6px", marginBottom: "28px", flexWrap: "wrap" }}>
      {pills.map(({ key, label, title }) => {
        const isActive = active === key;
        return (
          <button key={key} onClick={() => onChange(key)} title={title || undefined}
            style={{
              padding: "8px 18px", borderRadius: "50px", cursor: "pointer",
              fontSize: "13px", fontWeight: isActive ? "600" : "400",
              fontFamily: "'DM Sans', sans-serif",
              background: isActive ? "linear-gradient(135deg, #2D6CB5, #4B9DD8, #2D6CB5)" : "transparent",
              color: isActive ? "#FFFFFF" : "#6C6C70",
              border: isActive ? "none" : "1px solid rgba(0,0,0,0.1)",
              boxShadow: "none",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function GeminiBanner({ onDismiss, onSettings }) {
  return (
    <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.07), rgba(99,102,241,0.04))", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "16px", padding: "12px 16px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "#1D4ED8" }}>IA Gemini active — gratuit</div>
          <div style={{ fontSize: "11px", color: "#3B82F6", marginTop: "1px" }}>Pour des analyses plus précises, ajoutez une clé Claude dans les Paramètres.</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button onClick={onSettings} style={{ fontSize: "11px", fontWeight: "700", color: "#1D4ED8", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "8px", padding: "5px 12px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          Ajouter Claude
        </button>
        <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#93C5FD", cursor: "pointer", fontSize: "14px", padding: "2px 4px", lineHeight: 1 }} title="Fermer">×</button>
      </div>
    </div>
  );
}

const DEFAULT_SCREENING_STOCKS = [
  "Valneva", "Median Technologies", "Riber", "Guillemot", "Solutions 30",
  "Genomic Vision", "Obiz", "Osmoz Technologies", "NovaBay Pharmaceuticals",
  "Compagnie Lebon", "Hexaom", "Lectra", "Inventiva", "Ose Immunotherapeutics",
];

function BourseAnalyzerInner({ userName, onLogout }) {
  const isMobile = useIsMobile();
  const { status, premium, loading: subLoading } = useSubscription();
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !isDemoMode() && !localStorage.getItem(ONBOARDING_KEY); } catch { return false; }
  });
  const [showTour, setShowTour] = useState(false);
  const showGuide = useCallback(() => { if (!isDemoMode()) setShowTour(true); }, []);
  const [mobileNavOpen, setMobileNavOpen]       = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => load("bourse_sidebar_collapsed", true));
  const toggleSidebarCollapse = useCallback(() => setSidebarCollapsed(v => { const next = !v; save("bourse_sidebar_collapsed", next); return next; }), []);
  const [account, setAccount]                   = useState(() => load("bourse_account", "PEA"));
  const prevAccountRef                          = useRef(null);
  const [activeTab, setActiveTab]               = useState(() => {
    if (isDemoMode()) return TABS.OVERVIEW;
    const acc = load("bourse_account", "PEA");
    return load(`bourse_active_tab_${acc}`, TABS.OVERVIEW);
  });
  const _changeTab = (tab) => { setActiveTab(tab); save(`bourse_active_tab_${account}`, tab); };
  const switchAccount = (acc) => {
    prevAccountRef.current = account;
    save(`bourse_active_tab_${account}`, activeTab);
    const lastTab = load(`bourse_active_tab_${acc}`, TABS.HOME);
    setAccount(acc);
    save("bourse_account", acc);
    setActiveTab(lastTab);
  };
  const [profil, setProfil]                     = useState(() => load("bourse_profil", DEFAULT_PROFIL));
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  const [refreshing, setRefreshing]             = useState(true);
  const [showBrand, setShowBrand]               = useState(true);
  const brandTimerRef                           = useRef(null);
  const [lastRefresh, setLastRefresh]           = useState(null); // timestamp ms
  const [refreshAgo, setRefreshAgo]             = useState("");
  const [updateAvailable, setUpdateAvailable]   = useState(false);
  const [marketScores, setMarketScores]         = useState(() => load("bourse_market_scores", null));
  const [marketScoringUi, setMarketScoringUi]   = useState(() => load("bourse_market_scores", null)?.length > 0 ? UI.RESULT : UI.IDLE);
  const [hiddenValues, setHiddenValues]         = useState(() => load("bourse_hidden", false));
  const toggleHidden  = () => setHiddenValues(h => { save("bourse_hidden", !h); return !h; });
  const [localUserName, setLocalUserName]       = useState(userName || "");
  const [editingName, setEditingName]           = useState(false);
  const [avatarEmoji, setAvatarEmoji]           = useState(() => load("bourse_avatar_emoji", ""));
  const [aiName, setAiName]                     = useState(() => load("bourse_ai_name", "Agent"));
  const [emojiPickerOpen, setEmojiPickerOpen]   = useState(false);
  const [accountMenuOpen, setAccountMenuOpen]   = useState(false);
  const [emojiCat, setEmojiCat]                 = useState(0);
  const emojiTriggerRef                         = useRef(null);
  const accountTriggerRef                       = useRef(null);
  const AVATAR_EMOJI_CATS = [
    { icon: "😊", label: "Visages", emojis: ["😊","😎","🤩","😏","🥸","🤓","😇","🥳","😈","👻","💀","🤖","👽","🎭"] },
    { icon: "👩", label: "Femmes",  emojis: ["👸","🧙‍♀️","🦸‍♀️","🧝‍♀️","🧜‍♀️","🧚‍♀️","🧛‍♀️","🧟‍♀️","💃","👩‍💻","👩‍🚀","🧑‍🎤","🧑‍🎨","🧕"] },
    { icon: "🧙", label: "Hommes",  emojis: ["🧙","🦸","🥷","🧑‍💻","👨‍🚀","🧑‍🎤","🧑‍🎨","🧝","🧜","🧚","🧛","🧟","🕵️","🤴"] },
    { icon: "🦁", label: "Animaux", emojis: ["🦁","🐯","🦊","🐺","🦅","🦉","🐻","🐼","🦄","🐉","🦋","🐸","🦈","🦊","🐧","🦩","🐺","🦝","🦥","🐙"] },
    { icon: "⚡", label: "Nature",  emojis: ["🌟","⚡","🔥","❄️","🌊","🌪️","🌈","🌙","☀️","🌸","🌺","🌻","🌷","🍀","🌴","🍄","🌍","🏔️","🌌","🪐"] },
    { icon: "📈", label: "Bourse",  emojis: ["📈","📊","💹","💰","💎","🏆","🎯","👑","🧠","💪","🔮","🃏","🎲","🔑","💡","⚙️","🧬","🧪","🛡️","⚔️"] },
    { icon: "🚀", label: "Divers",  emojis: ["🚀","🛸","👾","🤖","🎸","🎹","🎺","🎵","🎪","🏹","🗡️","🌐","🔭","🎬","📸","🏋️","🧗","🏄‍♀️","🧘"] },
  ];
  const pickEmoji = (e) => { setAvatarEmoji(e); save("bourse_avatar_emoji", e); setEmojiPickerOpen(false); };


  // Ferme les popups au clic hors de la zone
  useEffect(() => {
    if (!emojiPickerOpen && !accountMenuOpen && !editingName) return;
    const close = (e) => {
      if (!e.target.closest("[data-emoji-picker]")) { setEmojiPickerOpen(false); setEditingName(false); }
      if (!e.target.closest("[data-account-menu]")) setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [emojiPickerOpen, accountMenuOpen, editingName]);

  // Animation au chargement initial de la page (1.6s puis disparition)
  useEffect(() => {
    const t = setTimeout(() => setRefreshing(false), 4500);
    return () => clearTimeout(t);
  }, []);

  // Affiche "BourseNext" pendant le refresh + 800ms après pour l'animation de sortie
  useEffect(() => {
    if (refreshing) {
      clearTimeout(brandTimerRef.current);
      setShowBrand(true);
    } else {
      brandTimerRef.current = setTimeout(() => setShowBrand(false), 800);
    }
    return () => clearTimeout(brandTimerRef.current);
  }, [refreshing]);

  // Écoute les mises à jour du portefeuille → re-render de tous les onglets
  useEffect(() => {
    const handler = () => setPortfolioVersion(v => v + 1);
    window.addEventListener("portfolioUpdated", handler);
    return () => window.removeEventListener("portfolioUpdated", handler);
  }, []);

  // Auto-snapshot journalier — sauvegarde la valeur du PF à chaque visite de l'app
  useEffect(() => {
    try {
      if (isDemoMode()) return;
      const today = new Date().toISOString().slice(0, 10);
      const positions = load("bourse_portfolio", []);
      const valeur = positions.reduce((s, p) => s + (p.dernierCours || p.pru || 0) * (p.quantite || 0), 0);
      if (valeur <= 0) return;
      const coutBase = positions.reduce((s, p) => s + (p.pru || 0) * (p.quantite || 0), 0);
      let snaps = (() => { try { return JSON.parse(localStorage.getItem("bourse_snapshots") || "[]"); } catch { return []; } })();

      // Nettoyage des snapshots aberrants : supprime tout snapshot qui s'écarte de >15%
      // d'au moins un de ses deux voisins (prev ET next)
      snaps = snaps.sort((a, b) => a.date.localeCompare(b.date));
      snaps = snaps.filter((s, i) => {
        const prev = snaps[i - 1];
        const next = snaps[i + 1];
        const SEUIL = 0.15;
        if (prev?.valeur > 0 && next?.valeur > 0) {
          // Aberrant si au-delà du seuil PAR RAPPORT aux deux voisins
          const dPrev = Math.abs(s.valeur - prev.valeur) / prev.valeur;
          const dNext = Math.abs(s.valeur - next.valeur) / next.valeur;
          return !(dPrev > SEUIL && dNext > SEUIL);
        }
        const ref = prev || next;
        if (!ref?.valeur) return true;
        return Math.abs(s.valeur - ref.valeur) / ref.valeur <= SEUIL;
      });

      if (snaps.some(s => s.date === today)) {
        localStorage.setItem("bourse_snapshots", JSON.stringify(snaps.slice(-365)));
        return;
      }
      // Détection d'anomalie sur le nouveau snapshot
      const recent = [...snaps].reverse().find(s => (new Date(today) - new Date(s.date)) / 86400000 <= 7);
      if (recent && recent.valeur > 0 && Math.abs(valeur - recent.valeur) / recent.valeur > 0.15) return;

      snaps.push({ date: today, valeur, investi: coutBase, coutBase, capitalVerse: coutBase });
      snaps.sort((a, b) => a.date.localeCompare(b.date));
      localStorage.setItem("bourse_snapshots", JSON.stringify(snaps.slice(-365)));
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mise à jour de l'affichage "il y a X min"
  useEffect(() => {
    if (!lastRefresh) return;
    const update = () => {
      const diff = Math.round((Date.now() - lastRefresh) / 60000);
      const ago = diff < 1 ? "à l'instant" : diff < 60 ? `il y a ${diff} min` : diff < 1440 ? `il y a ${Math.floor(diff/60)}h${diff%60 > 0 ? (diff%60)+"min" : ""}` : `il y a ${Math.floor(diff/1440)}j`;
      setRefreshAgo(ago);
    };
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [lastRefresh]);

  // Vérifie si une nouvelle version est déployée (hash du bundle JS)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const getCurrentHash = () => {
      const s = document.querySelector('script[src*="/static/js/main."]');
      return s ? s.src : null;
    };
    const check = async () => {
      try {
        const res = await fetch(window.location.origin + "/?_v=" + Date.now(), { cache: "no-store" });
        const html = await res.text();
        const match = html.match(/\/static\/js\/main\.[a-f0-9]+\.js/);
        if (!match) return;
        const remoteHash = match[0];
        const localSrc = getCurrentHash();
        if (localSrc && !localSrc.includes(remoteHash.split(".")[2])) {
          setUpdateAvailable(true);
        }
      } catch {}
    };
    check();
    const t = setInterval(check, 5 * 60 * 1000); // toutes les 5 min
    return () => clearInterval(t);
  }, []);

  // Actualisation douce : rafraîchit les cours + resync tous les onglets (sans recharger la page)
  const softRefresh = useCallback(() => {
    setRefreshing(true);
    setLastRefresh(Date.now());
    window.dispatchEvent(new CustomEvent("portfolioUpdated"));
    setTimeout(() => setRefreshing(false), 3000);
  }, []);

  // Actualisation générale : recharge la page si une mise à jour est disponible, sinon softRefresh
  const refreshAll = useCallback(() => {
    if (updateAvailable) { window.location.reload(); return; }
    softRefresh();
  }, [updateAvailable, softRefresh]);

  // ── Analyse IA de toutes les positions (scoring marché) ──────────────────────
  const runMarketScoring = useCallback(async (positions) => {
    if (!positions || positions.length === 0) return;
    if (isDemoMode()) return; // scores pré-chargés en mode démo
    setMarketScoringUi(UI.LOADING);
    try {
      // Résoudre les tickers : cache existant + résolution Yahoo Search pour les manquants
      const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
      const missingISINs = positions.filter(p => p.isin && !p.ticker && !tickerCache[p.isin]).map(p => p.isin);
      if (missingISINs.length > 0) {
        await Promise.all(missingISINs.map(async (isin) => {
          try {
            const isinSafe = String(isin || "").replace(/[^A-Z0-9]/gi, "").slice(0, 12);
            const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${isinSafe}&quotesCount=5&newsCount=0`;
            const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) return;
            const json = await res.json();
            const quotes = json?.quotes || [];
            const isPEAAccount = (account || "PEA") === "PEA";
            const best = isPEAAccount
              ? (quotes.find(q => q.symbol && (q.exchDisp?.includes("Paris") || q.exchDisp?.includes("Amsterdam") || q.exchDisp?.includes("Euronext")))
                  || quotes.find(q => q.symbol && q.quoteType === "EQUITY")
                  || quotes[0])
              : (quotes.find(q => q.symbol && (q.exchDisp?.includes("NYSE") || q.exchDisp?.includes("NASDAQ") || q.exchDisp?.includes("NasdaqGS") || q.exchDisp?.includes("NasdaqCM")))
                  || quotes.find(q => q.symbol && (q.exchDisp?.includes("Paris") || q.exchDisp?.includes("Euronext") || q.exchDisp?.includes("Xetra") || q.exchDisp?.includes("London")))
                  || quotes.find(q => q.symbol && q.quoteType === "EQUITY")
                  || quotes[0]);
            if (best?.symbol) tickerCache[isin] = best.symbol;
          } catch {}
        }));
        try { localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(tickerCache)); } catch {}
      }

      // Fetcher Yahoo analystes + Google News RSS pour chaque position en parallèle
      const externalData = await Promise.all(positions.map(async (pos) => {
        const ticker = pos.ticker || (pos.isin && tickerCache[pos.isin]) || null;
        let analysts = null;
        let news = [];

        // Stratégie multi-requêtes pour maximiser les résultats, surtout pour les micro-caps
        const fetchNewsWithFallbacks = async () => {
          // 1. Requête principale : nom seul (sans guillemets ni termes restrictifs)
          const q1 = `${pos.nom} bourse`;
          let items = await fetchGoogleNewsRSS(q1).catch(() => []);
          // 2. Si peu de résultats et ISIN disponible, essayer avec l'ISIN
          if (items.length < 2 && pos.isin) {
            const q2 = `${pos.isin} résultats actualité`;
            const items2 = await fetchGoogleNewsRSS(q2).catch(() => []);
            items = [...items, ...items2].filter((v, i, a) => a.findIndex(x => x.title === v.title) === i);
          }
          // 3. Si encore peu de résultats, essayer nom abrégé (1er mot) + secteur
          if (items.length < 2) {
            const shortName = pos.nom.split(" ")[0];
            const q3 = `${shortName} action résultats`;
            const items3 = await fetchGoogleNewsRSS(q3).catch(() => []);
            items = [...items, ...items3].filter((v, i, a) => a.findIndex(x => x.title === v.title) === i);
          }
          return items.slice(0, 6);
        };

        await Promise.all([
          ticker
            ? fetchYahooAnalysts(ticker).then(d => { analysts = d; }).catch(() => {})
            : Promise.resolve(),
          fetchNewsWithFallbacks().then(d => { news = d; }),
        ]);
        return { pos, analysts, news };
      }));

      // Fetch RSI14 + volume moyen 20j pour chaque position via Yahoo Finance chart
      const rsiData = await Promise.all(positions.map(async (pos) => {
        const ticker = pos.ticker || (pos.isin && tickerCache[pos.isin]) || null;
        if (!ticker) return { id: pos.id, rsi: null, volRatio: null };
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sanitizeTicker(ticker)}?interval=1d&range=60d`;
          const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(6000) });
          if (!res.ok) return { id: pos.id, rsi: null, volRatio: null };
          const json = await res.json();
          const result = json?.chart?.result?.[0];
          const closes = result?.indicators?.quote?.[0]?.close?.filter(v => v != null) ?? [];
          const volumes = result?.indicators?.quote?.[0]?.volume?.filter(v => v != null) ?? [];
          const rsiArr = computeRSI(closes, 14);
          const lastRsi = rsiArr.filter(v => v !== null).at(-1);
          const volAvg20 = volumes.length >= 20 ? volumes.slice(-21, -1).reduce((s, v) => s + v, 0) / 20 : null;
          const volLast = volumes.at(-1) ?? null;
          const volRatio = (volAvg20 && volLast) ? +(volLast / volAvg20).toFixed(2) : null;
          return { id: pos.id, rsi: lastRsi != null ? +lastRsi.toFixed(1) : null, volRatio };
        } catch { return { id: pos.id, rsi: null, volRatio: null }; }
      }));
      const rsiMap = Object.fromEntries(rsiData.map(r => [r.id, r]));

      // Construire le bloc de contexte par position
      const contextBlocks = externalData
        .map(({ pos, analysts, news }) => formatExternalContext(pos.nom, analysts, news))
        .join("\n\n");

      const posListe = positions.map(p => {
        const cours = p.dernierCours || p.pru;
        const valeur = (cours * p.quantite).toFixed(0);
        const pv = cours - p.pru;
        const pvPct = p.pru > 0 ? ((pv / p.pru) * 100).toFixed(1) : "0.0";
        const pvSign = pv >= 0 ? "+" : "";
        const rsi = rsiMap[p.id];
        const rsiStr = rsi?.rsi != null ? `, RSI14=${rsi.rsi}` : "";
        const volStr = rsi?.volRatio != null ? `, vol×${rsi.volRatio}` : "";
        return `- ${p.nom}${p.isin ? ` (ISIN: ${p.isin})` : ""}${p.ticker ? ` [${p.ticker}]` : ""}, PRU ${p.pru}€, cours ${cours}€, qté ${p.quantite}, valeur ${valeur}€, PV ${pvSign}${pvPct}%${rsiStr}${volStr}`;
      }).join("\n");

      const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
      const userMsg = `Date d'aujourd'hui : ${today}. Les catalyseurs doivent être les plus récents disponibles — évite tout événement antérieur à 12 mois sauf s'il est structurellement déterminant.\n\nPortefeuille PEA à analyser (DCA long terme, 10 ans) :\n${posListe}\n\nDONNÉES MARCHÉ EN TEMPS RÉEL :\n${contextBlocks}\n\nJSON uniquement.`;

      let data;
      let scoringError = null;
      try {
        const primary = await enqueueApi(() => callClaude(MARKET_SCORING_PROMPT, userMsg, true));
        // N'utiliser le résultat principal que s'il couvre toutes les positions
        const minExpected = positions.length;
        const findArr = (d) => [d?.classement, d?.scores, d?.positions].find(a => Array.isArray(a) && a.length >= minExpected);
        if (findArr(primary)) {
          data = primary;
        } else {
          throw new Error("primary_incomplete");
        }
      } catch (e1) {
        scoringError = e1;
        try {
          // Fallback : prompt sans web_search, données déjà incluses dans userMsg
          data = await enqueueApi(() => callClaude(MARKET_SCORING_PROMPT_FALLBACK, userMsg, false, 3, true, 4000));
          scoringError = null;
        } catch (e2) {
          scoringError = e2;
        }
      }
      // Extraire le tableau de scores quelle que soit la clé utilisée par Claude
      const scores = (() => {
        if (!data || typeof data !== "object") return null;
        if (Array.isArray(data.classement) && data.classement.length > 0) return data.classement;
        if (Array.isArray(data.scores)     && data.scores.length > 0)     return data.scores;
        if (Array.isArray(data.positions)  && data.positions.length > 0)  return data.positions;
        if (Array.isArray(data.ranking)    && data.ranking.length > 0)    return data.ranking;
        // Dernier recours : premier tableau trouvé dans l'objet
        for (const v of Object.values(data)) {
          if (Array.isArray(v) && v.length > 0 && v[0]?.nom) return v;
        }
        return null;
      })();

      if (scores && scores.length > 0) {
        // Enrichir chaque score avec l'id/nom/isin exact de la position source (même ordre)
        const enriched = scores.map((sc, i) => {
          const src = positions[i];
          if (!src) return sc;
          return { ...sc, _posId: src.id, _posNom: src.nom, _posIsin: src.isin || sc.isin };
        });
        save("bourse_market_scores", enriched);
        save("bourse_market_scores_ts", Date.now());
        const hist = load("bourse_signal_history", []);
        hist.unshift({ date: new Date().toISOString(), scores: enriched });
        save("bourse_signal_history", hist.slice(0, 30));
        setMarketScores(enriched);
        setMarketScoringUi(UI.RESULT);
        save("bourse_market_scores_error", null);
      } else {
        const dataStr = data ? JSON.stringify(data).slice(0, 200) : "null";
        const msg = scoringError?.message || `Réponse IA vide ou format inattendu · data=${dataStr}`;
        save("bourse_market_scores_error", msg);
        setMarketScoringUi(UI.ERROR);
      }
    } catch (outerErr) {
      save("bourse_market_scores_error", outerErr?.message || "Erreur inconnue");
      setMarketScoringUi(UI.ERROR);
    }
  }, []);

  // Ouvre l'onglet Chat avec un message pré-envoyé (depuis les tooltips du glossaire)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.tab) changeTab(e.detail.tab);
    };
    window.addEventListener("openChatWithQuery", handler);
    return () => window.removeEventListener("openChatWithQuery", handler);
  }, []);

  // Écoute l'événement "analyseAll" déclenché depuis PortfolioTab quand une position est sauvée
  useEffect(() => {
    const handler = (e) => {
      const positions = e.detail?.positions;
      if (positions) runMarketScoring(positions);
    };
    window.addEventListener("runMarketScoring", handler);
    return () => window.removeEventListener("runMarketScoring", handler);
  }, [runMarketScoring]);

  // Raccourcis clavier : R = actualiser · 1-7 = naviguer entre les onglets
  useEffect(() => {
    const tabKeys = [TABS.PORTFOLIO, TABS.MARCHE, TABS.DCA, TABS.PROJECTION, TABS.HISTORIQUE, TABS.OPERATIONS, TABS.PROFIL];
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.key === "r" || e.key === "R") { refreshAll(); return; }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= tabKeys.length) changeTab(tabKeys[num - 1]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refreshAll]);

  const aiPortfolioLabel = (() => {
    try {
      const n = JSON.parse(localStorage.getItem("bourse_ai_config") || "{}").nom?.trim();
      return n ? `${n} IA` : "Agent IA";
    } catch { return "Agent IA"; }
  })();
  const tabLabel = activeTab === TABS.AI_PORTFOLIO ? aiPortfolioLabel : (TAB_LABELS[activeTab] || "");

  const isDemo = isDemoMode();
  const [demoGate, setDemoGate] = useState(false);

  const changeTab = (tab) => {
    if (isDemo && !DEMO_FREE_TABS.has(tab)) { setDemoGate(true); return; }
    _changeTab(tab);
  };

  const isOverview = activeTab === TABS.OVERVIEW;

  if (isOverview) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F5F7", color: C.ink, fontFamily: "'DM Sans', sans-serif" }}>
        <style>{`
          @keyframes bn-next-wave { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        `}</style>
        {/* Logo en haut */}
        <div style={{ padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "20px", fontWeight: "300", color: C.inkSoft, letterSpacing: "-0.01em", fontFamily: "'DM Sans', sans-serif" }}>
            Bourse<span style={{ fontWeight: "800", letterSpacing: "-0.04em", fontFamily: "'DM Sans', sans-serif", backgroundImage: C.accentGrad, backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "bn-next-wave 4s ease infinite" }}>Next</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Bouton masquer/afficher valeurs */}
            <button onClick={toggleHidden} title={hiddenValues ? "Afficher les valeurs" : "Masquer les valeurs"}
              style={{ width: "36px", height: "36px", borderRadius: "50%", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.7)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: hiddenValues ? C.accent : C.inkSubtle }}>
              {hiddenValues
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
            {isDemo
              ? <button onClick={() => { clearDemoData(); window.location.reload(); }}
                  style={{ height: "36px", padding: "0 14px", borderRadius: "20px", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "12px", fontWeight: "600", color: C.inkMuted, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Accueil
                </button>
              : <button onClick={onLogout} title="Se déconnecter"
                  style={{ height: "36px", padding: "0 14px", borderRadius: "20px", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "12px", fontWeight: "600", color: C.inkMuted, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Déconnexion
                </button>
            }
          </div>
        </div>
        <OverviewTab onNavigate={changeTab} onSwitchAccount={switchAccount} hidden={hiddenValues} portfolioVersion={portfolioVersion} />
        {showTour && !isDemo && <TourGuide changeTab={changeTab} currentTab={activeTab} onDone={() => { setShowTour(false); }} />}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#F5F5F7", color: C.ink, fontFamily: "'DM Sans', sans-serif", paddingTop: isDemo ? "34px" : 0 }}>
      {!subLoading && status === "expired" && <Paywall />}
      <style>{`
        @keyframes bn-next-wave   { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes bn-brand-in    { from{opacity:0;transform:translateY(-6px) scale(0.92)} to{opacity:1;transform:none} }
        @keyframes bn-brand-out   { from{opacity:1;transform:none} to{opacity:0;transform:translateY(-6px) scale(0.92)} }
        @keyframes bn-account-in-right { from{opacity:0;transform:translateX(32px)}  to{opacity:1;transform:translateX(0)} }
        @keyframes bn-account-in-left  { from{opacity:0;transform:translateX(-32px)} to{opacity:1;transform:translateX(0)} }
      `}</style>

      {/* Modal gate démo */}
      {demoGate && (
        <div onClick={() => setDemoGate(false)} style={{ position: "fixed", inset: 0, zIndex: 99998, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "20px", padding: "32px 28px", maxWidth: "360px", width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔒</div>
            <div style={{ fontSize: "18px", fontWeight: "800", color: "#0F172A", letterSpacing: "-0.03em", marginBottom: "10px" }}>Fonctionnalité réservée</div>
            <div style={{ fontSize: "13px", color: "#64748B", lineHeight: 1.65, marginBottom: "24px" }}>
              Cette section n'est pas disponible en mode démo.<br/>Créez un compte gratuit pour tout débloquer.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => { clearDemoData(); window.location.reload(); }}
                style={{ padding: "12px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Créer un compte gratuit
              </button>
              <button
                onClick={() => setDemoGate(false)}
                style={{ padding: "10px", borderRadius: "12px", border: "1px solid #E2E8F0", background: "transparent", color: "#64748B", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Continuer la démo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bannière mode démo */}
      {isDemo && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, background: "linear-gradient(90deg, #1E3A5F, #2D6CB5)", padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "'DM Sans', sans-serif" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Mode démo — données fictives
          </span>
          <button
            onClick={() => { clearDemoData(); window.location.reload(); }}
            style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "4px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Accueil
          </button>
        </div>
      )}

      {/* Sidebar */}
      <Sidebar
        active={activeTab} onChange={changeTab}
        portfolioVersion={portfolioVersion}
        refreshAll={refreshAll} refreshing={refreshing} refreshAgo={refreshAgo}
        hidden={hiddenValues}
        mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)}
        account={account} onSwitchAccount={switchAccount}
        marketScoringUi={marketScoringUi}
        onShowGuide={isDemo ? undefined : showGuide}
        externalCollapsed={sidebarCollapsed} onExternalToggle={toggleSidebarCollapse}
        isDemo={isDemo} demoFreeTabs={DEMO_FREE_TABS}
      />

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Top bar */}
        <div className="ba-topbar" style={{ height: "52px", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.75)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "0 16px" : "0 28px", position: "sticky", top: 0, zIndex: 10, flexShrink: 0, gap: "12px" }}>

          {/* ── MOBILE : hamburger | logo+onglet | avatar ── */}
          {isMobile ? (
            <>
              {/* Gauche : hamburger */}
              <button onClick={() => setMobileNavOpen(o => !o)} title="Menu"
                style={{ width: "40px", height: "40px", background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", padding: 0, flexShrink: 0 }}>
                {mobileNavOpen
                  ? null
                  : <>
                      <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                      <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                      <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                    </>
                }
              </button>
              {/* Centre : logo + nom onglet */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minWidth: 0 }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: C.ink, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tabLabel}</span>
              </div>
              {/* Droite : avatar (masqué en démo) */}
              {!isDemo && <div data-emoji-picker style={{ position: "relative", flexShrink: 0 }}>
                    <div ref={emojiTriggerRef} onClick={() => setEmojiPickerOpen(o => !o)} title="Compte"
                      style={{ width: "34px", height: "34px", borderRadius: "50%", background: C.sb, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", userSelect: "none" }}>
                      {avatarEmoji
                        ? <span style={{ fontSize: "16px", lineHeight: 1 }}>{avatarEmoji}</span>
                        : <span style={{ color: "#C1E8FF", fontWeight: "700", fontSize: "12px" }}>{(localUserName || "P")[0].toUpperCase()}</span>}
                    </div>
                    {emojiPickerOpen && createPortal(
                      <div data-emoji-picker style={{ position: "fixed", top: (emojiTriggerRef.current?.getBoundingClientRect().bottom ?? 52) + 8, left: Math.max(8, Math.min((emojiTriggerRef.current?.getBoundingClientRect().right ?? 240) - 240, window.innerWidth - 248)), background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", boxShadow: "0 8px 28px rgba(0,0,0,0.16)", zIndex: 99999, width: "240px" }}>
                        <div style={{ padding: "12px 12px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: "8px" }}>
                          <input value={localUserName} onChange={e => setLocalUserName(e.target.value)}
                            onBlur={() => { const name = localUserName.trim() || "Utilisateur"; setLocalUserName(name); try { const s = JSON.parse(localStorage.getItem("bourse_session") || "{}"); localStorage.setItem("bourse_session", JSON.stringify({ ...s, name })); } catch {} }}
                            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                            placeholder="Votre prénom ou pseudo"
                            style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 10px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }} />
                          <input value={aiName} onChange={e => setAiName(e.target.value)}
                            onBlur={() => { save("bourse_ai_name", aiName.trim()); }}
                            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                            placeholder="Nom de votre IA (ex : Atlas)"
                            style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 10px", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }} />
                          <button onClick={onLogout} style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "7px", color: C.red, fontSize: "11px", fontFamily: "'DM Sans', sans-serif", fontWeight: "700", cursor: "pointer" }}>Se déconnecter</button>
                        </div>
                        <div style={{ display: "flex", height: "200px", overflow: "hidden", borderRadius: "0 0 14px 14px" }}>
                          <div style={{ width: "34px", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "6px", gap: "2px", flexShrink: 0, overflowY: "auto" }}>
                            {AVATAR_EMOJI_CATS.map((cat, i) => (
                              <button key={i} onClick={() => setEmojiCat(i)} title={cat.label}
                                style={{ width: "26px", height: "26px", borderRadius: "7px", border: "none", background: emojiCat === i ? C.navyLight : "transparent", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                {cat.icon}
                              </button>
                            ))}
                          </div>
                          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "8px", display: "flex", flexWrap: "wrap", gap: "4px", alignContent: "flex-start" }}>
                            {AVATAR_EMOJI_CATS[emojiCat].emojis.map(e => (
                              <button key={e} onClick={() => { pickEmoji(e); setEmojiPickerOpen(false); }}
                                style={{ width: "28px", height: "28px", borderRadius: "7px", border: avatarEmoji === e ? `2px solid ${C.navy}` : `1px solid ${C.border}`, background: avatarEmoji === e ? C.navyLight : C.snowOff, cursor: "pointer", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                {e}
                              </button>
                            ))}
                          </div>
                        </div>
                        {avatarEmoji && (
                          <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px" }}>
                            <button onClick={() => { pickEmoji(""); setEmojiPickerOpen(false); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "4px 8px", color: C.inkSubtle, fontSize: "10px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>✕ Retirer l'emoji</button>
                          </div>
                        )}
                      </div>
                    , document.body)}
                  </div>
              }
            </>
          ) : (
            <>
              {/* ── DESKTOP : hamburger | logo + titre | avatar ── */}
              {/* LEFT — hamburger toggle sidebar */}
              <button onClick={toggleSidebarCollapse} title="Menu"
                style={{ width: "36px", height: "36px", background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", padding: 0, flexShrink: 0 }}>
                <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
              </button>
              {/* CENTER — logo + onglet actif */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                {/* BourseNext — fondu entrant */}
                <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
                  {showBrand
                    ? <span key="brand" style={{ fontSize: "22px", fontWeight: "300", color: C.inkSoft, letterSpacing: "-0.01em", fontFamily: "'DM Sans', sans-serif", animation: refreshing ? "bn-brand-in 0.5s ease-out forwards" : "bn-brand-out 0.5s ease-in forwards" }}>
                        Bourse<span style={{ fontWeight: "800", letterSpacing: "-0.04em", fontFamily: "'DM Sans', sans-serif", backgroundImage: C.accentGrad, backgroundSize: "300% 300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "bn-next-wave 4s ease infinite" }}>Next</span>
                      </span>
                    : <span style={{ fontSize: "15px", fontWeight: "600", color: C.ink, letterSpacing: "-0.02em" }}>{tabLabel}</span>
                  }
                </div>
              </div>
              {/* RIGHT — CTA démo ou contrôles normaux */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>

                {/* Bouton emoji avatar — masqué en démo */}
                {!isDemo && <div data-emoji-picker style={{ position: "relative" }}>
                  <div ref={emojiTriggerRef} onClick={() => { setEmojiPickerOpen(o => !o); setAccountMenuOpen(false); }} title="Changer l'avatar"
                    style={{ width: "34px", height: "34px", borderRadius: "50%", background: C.navyLight, border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", userSelect: "none" }}>
                    {avatarEmoji
                      ? <span style={{ fontSize: "17px", lineHeight: 1 }}>{avatarEmoji}</span>
                      : <span style={{ fontSize: "13px" }}>🙂</span>}
                  </div>
                  {emojiPickerOpen && createPortal(
                    <div data-emoji-picker style={{ position: "fixed", top: (emojiTriggerRef.current?.getBoundingClientRect().bottom ?? 52) + 8, right: 60, background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", boxShadow: "0 8px 28px rgba(0,0,0,0.13)", zIndex: 99999, width: "236px" }}>
                      <div style={{ display: "flex", height: "200px", overflow: "hidden", borderRadius: "14px" }}>
                        <div style={{ width: "34px", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "6px", gap: "2px", flexShrink: 0, overflowY: "auto" }}>
                          {AVATAR_EMOJI_CATS.map((cat, i) => (
                            <button key={i} onClick={() => setEmojiCat(i)} title={cat.label}
                              style={{ width: "26px", height: "26px", borderRadius: "7px", border: "none", background: emojiCat === i ? C.navyLight : "transparent", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {cat.icon}
                            </button>
                          ))}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "8px", display: "flex", flexWrap: "wrap", gap: "4px", alignContent: "flex-start" }}>
                          {AVATAR_EMOJI_CATS[emojiCat].emojis.map(e => (
                            <button key={e} onClick={() => { pickEmoji(e); setEmojiPickerOpen(false); }}
                              style={{ width: "28px", height: "28px", borderRadius: "7px", border: avatarEmoji === e ? `2px solid ${C.navy}` : `1px solid ${C.border}`, background: avatarEmoji === e ? C.navyLight : C.snowOff, cursor: "pointer", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {e}
                            </button>
                          ))}
                        </div>
                      </div>
                      {avatarEmoji && (
                        <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px" }}>
                          <button onClick={() => { pickEmoji(""); setEmojiPickerOpen(false); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "4px 8px", color: C.inkSubtle, fontSize: "10px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>✕ Retirer l'emoji</button>
                        </div>
                      )}
                    </div>
                  , document.body)}
                </div>}

                {/* Bouton masquer valeurs */}
                <button onClick={toggleHidden} title={hiddenValues ? "Afficher les valeurs" : "Masquer les valeurs"}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", borderRadius: "10px", background: hiddenValues ? C.navyLight : "transparent", border: `1px solid ${hiddenValues ? C.accent : C.border}`, cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }}>
                  {hiddenValues ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.inkMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>

                {/* Bouton compte — masqué en démo */}
                {!isDemo && <div data-account-menu style={{ position: "relative" }}>
                  <div ref={accountTriggerRef} onClick={() => { setAccountMenuOpen(o => !o); setEmojiPickerOpen(false); }} title="Compte"
                    style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", borderRadius: "10px", background: C.navyLight, border: `1px solid ${C.border}`, cursor: "pointer", userSelect: "none" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: C.inkSoft, fontFamily: "'DM Sans', sans-serif", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{localUserName || "Compte"}</span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke={C.inkSubtle} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  {accountMenuOpen && createPortal(
                    <div data-account-menu style={{ position: "fixed", top: (accountTriggerRef.current?.getBoundingClientRect().bottom ?? 52) + 8, right: 16, background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", boxShadow: "0 8px 28px rgba(0,0,0,0.13)", zIndex: 99999, width: "220px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <input autoFocus value={localUserName} onChange={e => setLocalUserName(e.target.value)}
                        onBlur={() => { const name = localUserName.trim() || "Utilisateur"; setLocalUserName(name); try { const s = JSON.parse(localStorage.getItem("bourse_session") || "{}"); localStorage.setItem("bourse_session", JSON.stringify({ ...s, name })); } catch {} }}
                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setAccountMenuOpen(false); }}
                        placeholder="Votre prénom ou pseudo"
                        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 10px", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }} />
                      <input value={aiName} onChange={e => setAiName(e.target.value)}
                        onBlur={() => { save("bourse_ai_name", aiName.trim()); }}
                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                        placeholder="Nom de votre IA (ex : Atlas)"
                        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 10px", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }} />
                      <button onClick={onLogout} style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "8px", color: C.red, fontSize: "11px", fontFamily: "'DM Sans', sans-serif", fontWeight: "700", cursor: "pointer" }}>Se déconnecter</button>
                    </div>
                  , document.body)}
                  </div>
                }

              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="ba-content" style={{ flex: 1, overflowY: "auto", padding: "32px 36px", position: "relative" }}>
          {/* Bouton guide ? fixe en haut à droite */}
          {![TABS.PLUS, TABS.PROFIL, TABS.SETTINGS].includes(activeTab) && !isDemo && (
            <button onClick={showGuide} title="Guide interactif"
              style={{ position: "absolute", top: "24px", right: "28px", zIndex: 20, width: "28px", height: "28px", borderRadius: "50%", background: C.snow, border: `1px solid ${C.border}`, color: C.inkMuted, fontSize: "13px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: shadow.card }}>
              ?
            </button>
          )}
          <div key={account} className="ba-content-inner" style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", animation: `${prevAccountRef.current === "PEA" ? "bn-account-in-right" : prevAccountRef.current === "CTO" ? "bn-account-in-left" : "bn-account-in-right"} 0.75s cubic-bezier(0.16,1,0.3,1)` }}>
          {/* Bannière Gemini actif / Claude recommandé */}
          {!hasClaudeKey() && hasAI() && !load("bourse_gemini_banner_dismissed", false) && (
            <GeminiBanner onDismiss={() => { save("bourse_gemini_banner_dismissed", true); setPortfolioVersion(v => v + 1); }} onSettings={() => changeTab(TABS.SETTINGS)} />
          )}
            {/* Sub-pill navigation for Positions group */}
            {PORTFOLIO_TABS.includes(activeTab) && (
              <PillBar
                pills={[
                  { key: TABS.PORTFOLIO,  label: "Positions" },
                  { key: TABS.HISTORIQUE, label: "Répartition" },
                  { key: TABS.OPERATIONS, label: "Transactions" },
                ]}
                active={activeTab}
                onChange={changeTab}
              />
            )}

            {/* Sub-pill navigation for DCA group */}
            {DCA_TABS.includes(activeTab) && (
              <PillBar
                pills={[
                  { key: TABS.DCA,        label: "Plan DCA" },
                  { key: TABS.PROJECTION, label: "Simulateur" },
                ]}
                active={activeTab}
                onChange={changeTab}
              />
            )}

            {/* Sub-pill navigation for IA group */}
            {IA_TABS.includes(activeTab) && (
              <PillBar
                pills={[
                  { key: TABS.MARCHE,        label: "Signaux IA",    title: "Analyse IA de chaque position — signal quotidien ACHAT / RENFORCER / ATTENDRE" },
                  { key: TABS.AUTOPILOT,     label: "Opportunités",  title: "Scanne votre portefeuille et l'univers de valeurs éligibles pour identifier les meilleures opportunités d'achat selon votre profil, votre DCA et les signaux marché." },
                  { key: TABS.CHAT,          label: "Conseiller",    title: "Posez vos questions à votre conseiller financier IA" },
                  { key: TABS.AI_PORTFOLIO,  label: aiPortfolioLabel },
                ]}
                active={activeTab}
                onChange={changeTab}
              />
            )}

            {/* Plus — menu page */}
            {activeTab === TABS.PLUS && (
              <div style={{ animation: "fadeIn 0.3s ease" }}>
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", fontFamily: "'DM Sans', sans-serif" }}>Compte</div>
                  <div style={{ fontSize: "12px", color: C.inkSubtle, marginTop: "3px", fontFamily: "'DM Sans', sans-serif" }}>Profil et configuration</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "480px" }}>
                  {[
                    { key: TABS.PROFIL,   label: "Profil",     desc: "Mon profil · Stratégie · Objectif · Liquidités" },
                    { key: TABS.SETTINGS, label: "Paramètres", desc: "Compte · Assistant IA" },
                  ].map(({ key, label, desc }) => (
                    <button key={key} onClick={() => changeTab(key)} className="ba-card-hover"
                      style={{ display: "flex", alignItems: "center", gap: "14px", background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px 18px", textAlign: "left", cursor: "pointer", width: "100%", boxShadow: shadow.card, fontFamily: "'DM Sans', sans-serif" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink, fontFamily: "'DM Sans', sans-serif" }}>{label}</div>
                        <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px", fontFamily: "'DM Sans', sans-serif" }}>{desc}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: C.inkSubtle }}>
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Back button for Plus sub-tabs */}
            {[TABS.PROFIL, TABS.SETTINGS].includes(activeTab) && (
              <button onClick={() => changeTab(TABS.PLUS)}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "20px", background: "rgba(255,255,255,0.75)", border: "1px solid rgba(15,23,42,0.08)", borderRadius: "50px", padding: "7px 14px 7px 10px", cursor: "pointer", fontSize: "13px", fontWeight: "600", color: "#64748B", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Retour
              </button>
            )}

            <TabErrorBoundary key={activeTab}>
              {activeTab === TABS.HOME       && <HomeTab account={account} profil={profil} marketScores={marketScores} onTabChange={changeTab} hidden={hiddenValues} />}
              {PORTFOLIO_TABS.includes(activeTab) && activeTab !== TABS.HISTORIQUE && <DashboardBar onTabChange={changeTab} hidden={hiddenValues} profil={profil} account={account} />}
              {activeTab === TABS.PORTFOLIO  && <PortfolioTab profil={profil} marketScores={marketScores} marketScoringUi={marketScoringUi} onRunScoring={runMarketScoring} account={account} />}
              {activeTab === TABS.MARCHE     && <MarcheTab profil={profil} portfolioVersion={portfolioVersion} account={account} marketScores={marketScores} marketScoringUi={marketScoringUi} onRunScoring={runMarketScoring} />}
              {activeTab === TABS.PROJECTION && <ProjectionTab profil={profil} account={account} />}
              {activeTab === TABS.HISTORIQUE && <HistoriqueTab portfolioVersion={portfolioVersion} account={account} />}
              {activeTab === TABS.DCA        && <StratégieDCATab profil={profil} portfolioVersion={portfolioVersion} marketScores={marketScores} marketScoringUi={marketScoringUi} onRunScoring={runMarketScoring} onSaveProfil={p => { setProfil(p); save("bourse_profil", p); }} account={account} />}
              {activeTab === TABS.OPERATIONS && <OperationsTab account={account} />}
              {activeTab === TABS.CHAT       && <ChatTab profil={profil} account={account} portfolioVersion={portfolioVersion} marketScores={marketScores} />}
              {activeTab === TABS.AUTOPILOT    && <AutopilotIA account={account} profil={profil} hidden={hiddenValues} />}
              {activeTab === TABS.AI_PORTFOLIO && <AIPortfolioTab account={account} hidden={hiddenValues} />}
              {activeTab === TABS.PROFIL     && <ProfilTab profil={profil} onChange={setProfil} />}
              {activeTab === TABS.SETTINGS   && <ParametresTab profil={profil} onChange={setProfil} />}
            </TabErrorBoundary>
          </div>
        </div>
      </div>

      {/* ── Assistant IA flottant ── */}
      <AIAssistant account={account} profil={profil} />

      {/* ── Bannière PWA iOS ── */}
      <PWAInstallBanner />

      {/* ── Onboarding Guide ── */}
      {showOnboarding && !isDemo && <OnboardingWizard onComplete={() => { setShowOnboarding(false); setShowTour(shouldShowTour()); }} />}

      {/* ── Tour interactif ── */}
      {showTour && !isDemo && <TourGuide changeTab={changeTab} currentTab={activeTab} onDone={() => { setShowTour(false); }} />}

      {/* ── Bottom navigation bar (mobile only) ── */}
      <nav className="ba-bottom-nav">
        {NAV_GROUPS.flatMap(g => g.items).map(({ key, icon }) => {
          const SHORT = { portfolio: "Positions", marche: "Marchés", dca: "DCA", projection: "Projec.", historique: "Répart.", operations: "Opérat.", chat: "Conseil.", profil: "Config." };
          const isActive = activeTab === key;
          return (
            <button key={key} onClick={() => changeTab(key)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", background: "none", border: "none", cursor: "pointer", padding: "6px 2px", position: "relative" }}>
              <span style={{ width: "40px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: isActive ? "#F2F2F7" : "transparent", color: isActive ? "#1C1C1E" : C.inkSubtle, fontSize: "14px", transition: "all 0.18s" }}>{icon}</span>
              <span style={{ fontSize: "9px", fontWeight: isActive ? "500" : "400", color: isActive ? C.accent : C.inkSubtle, fontFamily: "'DM Sans', sans-serif" }}>{SHORT[key] || key}</span>
            </button>
          );
        })}
      </nav>

      <style>{`

        * { box-sizing: border-box; }
        html, body { margin: 0; background: #F5F5F7; background-attachment: fixed; min-height: 100vh; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

        /* ── Animations ── */
        @keyframes fadeIn    { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tabFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse     { 0%,100% { opacity: 0.3; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }
        .ba-tab-accent { animation: tabFadeIn 0.4s ease; }
        @keyframes spin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ba-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes loadingBounce { 0%,80%,100% { transform: scale(0.5); opacity: 0.35; } 40% { transform: scale(1); opacity: 1; } }
        @keyframes vendreAlarm { 0%,100% { opacity: 1; box-shadow: 0 0 14px rgba(220,38,38,0.45); } 50% { opacity: 0.7; box-shadow: 0 0 28px rgba(220,38,38,0.65); } }
        @keyframes flashGreen { 0% { background: rgba(5,150,105,0.1); } 100% { background: transparent; } }
        @keyframes flashRed   { 0% { background: rgba(220,38,38,0.08); } 100% { background: transparent; } }
        @keyframes slideInLeft { from { transform: translateX(-6px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

        /* ── Sidebar ── */
        .ba-sidebar-item:hover:not(.ba-sidebar-item-active) { background: rgba(30,58,95,0.06) !important; color: ${C.ink} !important; border-radius: 12px; }
        .ba-sidebar-item-active { box-shadow: 0 4px 16px rgba(30,58,95,0.30) !important; border-radius: 12px !important; }

        /* ── Inputs ── */
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input::placeholder { color: ${C.inkSubtle}; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: ${C.accent} !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.1) !important; transition: all 0.15s ease; }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(15,23,42,0.1); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(15,23,42,0.18); }

        /* ── Scrollbar sidebar ── */
        .ba-sidebar-nav::-webkit-scrollbar-thumb { background: rgba(30,58,95,0.12); }
        .ba-sidebar-nav::-webkit-scrollbar-thumb:hover { background: rgba(30,58,95,0.25); }

        /* ── Pill buttons ── */
        .ba-btn-pill { background: ${C.accent}; color: #fff; border: none; border-radius: 50px; padding: 8px 20px; font-size: 12px; font-family: 'Inter', inherit; font-weight: 500; cursor: pointer; box-shadow: ${shadow.pill}; transition: all 0.18s ease; white-space: nowrap; letter-spacing: 0.02em; }
        .ba-btn-pill:hover { background: #2D5986; box-shadow: ${shadow.hover}; transform: translateY(-1px); }

        /* ── Card hover ── */
        .ba-card-hover { transition: box-shadow 0.18s ease, transform 0.18s ease; }
        .ba-card-hover:hover { box-shadow: ${shadow.hover}; transform: translateY(-2px); }

        /* ── Densité globale ── */
        .ba-content-inner { zoom: 0.94; }

        /* ── Toolbar status ── */
        .ba-toolbar-status { font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; }

        /* ── Sidebar group labels ── */
        .ba-sidebar-group-label { font-size: 9px; font-weight: 700; color: ${C.inkSubtle}; letter-spacing: 1.2px; text-transform: uppercase; padding: 0 10px; margin-bottom: 4px; }

        /* ── Tab nav — horizontal scroll on narrow screens ── */
        @media (max-width: 1000px) {
          .ba-tabnav { overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
          .ba-tabnav::-webkit-scrollbar { display: none; }
          .ba-tabnav button { flex: 0 0 auto; font-size: 11px; padding: 9px 10px !important; }
        }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          html { font-size: 16px; }
          body { font-size: 16px; }
          .ba-sidebar { display: none !important; }
          .ba-content { padding: 16px 14px 24px 14px !important; }
          .ba-content-inner { zoom: 1; }
          .ba-topbar { height: 54px !important; padding: 0 14px !important; }
          .ba-g4 { grid-template-columns: repeat(2, 1fr) !important; }
          .ba-tbl-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch; border-radius: 10px; }
          .ba-card-body { padding: 14px !important; }
          input, select, textarea { font-size: 16px !important; border-radius: 10px !important; }
          .ba-sidebar-item { min-height: 48px !important; }

          /* Toolbar portfolio */
          .ba-toolbar { gap: 6px !important; margin-bottom: 6px !important; }
          .ba-toolbar > button { padding: 8px 10px !important; font-size: 11px !important; border-radius: 8px !important; }
          .ba-toolbar-status { width: 100%; order: 99; font-size: 10px; color: ${C.inkSubtle}; padding: 2px 0; }

          /* Grilles PerformanceGlobale */
          .ba-perf-kpi { grid-template-columns: repeat(2, 1fr) !important; }
          .ba-perf-breakdown { grid-template-columns: repeat(2, 1fr) !important; }

          /* Grille dashboard cards */
          .ba-dashboard-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }

        /* ── Bottom navigation — masquée (remplacée par le drawer hamburger) ── */
        .ba-bottom-nav { display: none !important; }

        /* ── Notch / Dynamic Island — padding top ── */
        @supports (padding-top: env(safe-area-inset-top)) {
          .ba-topbar {
            padding-top: env(safe-area-inset-top, 0px) !important;
            height: calc(54px + env(safe-area-inset-top, 0px)) !important;
          }
        }

        /* ── Petit écran ── */
        @media (max-width: 480px) {
          .ba-g4 { grid-template-columns: repeat(2, 1fr) !important; }
          .ba-content { padding: 12px 12px 80px 12px !important; }
          .ba-perf-kpi { grid-template-columns: repeat(2, 1fr) !important; }
          .ba-perf-breakdown { grid-template-columns: repeat(2, 1fr) !important; }
        }

        /* ── Export PDF ── */
        @media print {
          body { background: #fff !important; }
          .ba-sidebar { display: none !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

// ─── Auth Page (Supabase) ────────────────────────────────────────────────────
const LOCAL_PIN_KEY  = "bourse_local_pin";
const LOCAL_NAME_KEY = "bourse_local_name";


export default BourseAnalyzerInner;
