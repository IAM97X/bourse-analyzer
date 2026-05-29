import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { C, shadow } from "../constants/theme";
import { SYSTEM_PROMPT, MARKET_SCORING_PROMPT } from "../constants/prompts";
import { load, save } from "../lib/storage";
import { callClaude, enqueueApi, hasClaudeKey, hasAI, fetchWithProxy } from "../lib/api";
import { computeRSI } from "../lib/finance";
import { fetchYahooAnalysts, fetchGoogleNewsRSS, formatExternalContext } from "../lib/market";
import { useIsMobile } from "../context/mobile";
import { UI, DEFAULT_PROFIL } from "../constants/config";
import { TABS } from "../constants/tabs";
import { Card } from "./UI";
import AppLogo from "./AppLogo";
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

const TICKER_CACHE_KEY = "bourse_isin_ticker_cache";

const PORTFOLIO_TABS = [TABS.PORTFOLIO, TABS.HISTORIQUE, TABS.OPERATIONS];
const DCA_TABS  = [TABS.DCA, TABS.PROJECTION];
const IA_TABS   = [TABS.MARCHE, TABS.CHAT, TABS.AUTOPILOT, TABS.AI_PORTFOLIO];
const PLUS_TABS = [TABS.PLUS, TABS.PROFIL, TABS.SETTINGS];

const TAB_LABELS = {
  [TABS.HOME]:       "Accueil",
  [TABS.PORTFOLIO]:  "Positions",
  [TABS.DCA]:        "Plan DCA",
  [TABS.AUTOPILOT]:  "Autopilot Atlas",
  [TABS.PROJECTION]: "Simulateur",
  [TABS.MARCHE]:        "Signaux IA",
  [TABS.CHAT]:          "Conseiller Privé",
  [TABS.AI_PORTFOLIO]:  "Portefeuille IA",
  [TABS.HISTORIQUE]: "Répartition",
  [TABS.OPERATIONS]: "Transactions",
  [TABS.PROFIL]:     "Profil investisseur",
  [TABS.SETTINGS]:   "Paramètres",
  [TABS.PLUS]:       "Plus",
};

function PillBar({ pills, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: "8px", marginBottom: "28px", flexWrap: "wrap" }}>
      {pills.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <button key={key} onClick={() => onChange(key)}
            style={{
              padding: "8px 20px", borderRadius: "50px", cursor: "pointer",
              fontSize: "13px", fontWeight: isActive ? "700" : "500",
              fontFamily: "'Inter', sans-serif",
              background: isActive
                ? "linear-gradient(135deg, #080B0F 0%, #142641 40%, #1E3A5F 75%, #2D5986 100%)"
                : "rgba(255,255,255,0.75)",
              color: isActive ? "#fff" : "#0F172A",
              boxShadow: isActive ? "0 4px 16px rgba(30,58,95,0.3)" : "0 1px 4px rgba(0,0,0,0.06)",
              border: isActive ? "none" : "1px solid rgba(15,23,42,0.1)",
              transition: "all 0.18s",
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
        <span style={{ fontSize: "16px" }}>✨</span>
        <div>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "#1D4ED8" }}>IA Gemini active — gratuit</div>
          <div style={{ fontSize: "11px", color: "#3B82F6", marginTop: "1px" }}>Pour des analyses plus précises, ajoutez une clé Claude dans les Paramètres.</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button onClick={onSettings} style={{ fontSize: "11px", fontWeight: "700", color: "#1D4ED8", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "8px", padding: "5px 12px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
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
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem(ONBOARDING_KEY); } catch { return false; }
  });
  const [showTour, setShowTour] = useState(false);
  const [mobileNavOpen, setMobileNavOpen]       = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => load("bourse_sidebar_collapsed", true));
  const toggleSidebarCollapse = useCallback(() => setSidebarCollapsed(v => { const next = !v; save("bourse_sidebar_collapsed", next); return next; }), []);
  const [account, setAccount]                   = useState(() => load("bourse_account", "PEA"));
  const switchAccount = (acc) => { setAccount(acc); save("bourse_account", acc); setActiveTab(TABS.PORTFOLIO); };
  const [activeTab, setActiveTab]               = useState(() => load("bourse_active_tab", TABS.HOME));
  const changeTab = (tab) => { setActiveTab(tab); save("bourse_active_tab", tab); };
  const [profil, setProfil]                     = useState(() => load("bourse_profil", DEFAULT_PROFIL));
  const [darkMode, setDarkMode]                 = useState(() => load("bourse_dark", false));
  const [compact, setCompact]                   = useState(() => load("bourse_compact", false));
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  const [refreshing, setRefreshing]             = useState(false);
  const [lastRefresh, setLastRefresh]           = useState(null); // timestamp ms
  const [refreshAgo, setRefreshAgo]             = useState("");
  const [updateAvailable, setUpdateAvailable]   = useState(false);
  const [marketScores, setMarketScores]         = useState(() => load("bourse_market_scores", null));
  const [marketScoringUi, setMarketScoringUi]   = useState(() => load("bourse_market_scores", null)?.length > 0 ? UI.RESULT : UI.IDLE);
  const [hiddenValues, setHiddenValues]         = useState(() => load("bourse_hidden", false));
  const toggleDark    = () => setDarkMode(d => { save("bourse_dark", !d); return !d; });
  const toggleCompact = () => setCompact(c => { save("bourse_compact", !c); return !c; });
  const toggleHidden  = () => setHiddenValues(h => { save("bourse_hidden", !h); return !h; });
  const [localUserName, setLocalUserName]       = useState(userName || "");
  const [editingName, setEditingName]           = useState(false);
  const [avatarEmoji, setAvatarEmoji]           = useState(() => load("bourse_avatar_emoji", ""));
  const [aiName, setAiName]                     = useState(() => load("bourse_ai_name", ""));
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

  // Écoute les mises à jour du portefeuille → re-render de tous les onglets
  useEffect(() => {
    const handler = () => setPortfolioVersion(v => v + 1);
    window.addEventListener("portfolioUpdated", handler);
    return () => window.removeEventListener("portfolioUpdated", handler);
  }, []);

  // Auto-snapshot journalier — sauvegarde la valeur du PF à chaque visite de l'app
  useEffect(() => {
    try {
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

  // Actualisation générale : rafraîchit les cours + resync tous les onglets
  const refreshAll = useCallback(() => {
    if (updateAvailable) { window.location.reload(); return; }
    setRefreshing(true);
    setLastRefresh(Date.now());
    window.dispatchEvent(new CustomEvent("portfolioUpdated"));
    setTimeout(() => setRefreshing(false), 3000);
  }, [updateAvailable]);

  // ── Analyse IA de toutes les positions (scoring marché) ──────────────────────
  const runMarketScoring = useCallback(async (positions) => {
    if (!positions || positions.length === 0) return;
    setMarketScoringUi(UI.LOADING);
    try {
      // Résoudre les tickers : cache existant + résolution Yahoo Search pour les manquants
      const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
      const missingISINs = positions.filter(p => p.isin && !p.ticker && !tickerCache[p.isin]).map(p => p.isin);
      if (missingISINs.length > 0) {
        await Promise.all(missingISINs.map(async (isin) => {
          try {
            const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0`;
            const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) return;
            const json = await res.json();
            const quotes = json?.quotes || [];
            const best = quotes.find(q => q.symbol && (q.exchDisp?.includes("Paris") || q.exchDisp?.includes("Amsterdam") || q.exchDisp?.includes("Euronext")))
              || quotes.find(q => q.symbol && q.quoteType === "EQUITY")
              || quotes[0];
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
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=60d`;
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

      const userMsg = `Portefeuille PEA à analyser (DCA long terme, 10 ans) :\n${posListe}\n\nDONNÉES MARCHÉ EN TEMPS RÉEL :\n${contextBlocks}\n\nJSON uniquement.`;

      const data = await enqueueApi(() => callClaude(MARKET_SCORING_PROMPT, userMsg, false));
      const scores = data?.classement;
      if (scores && scores.length > 0) {
        save("bourse_market_scores", scores);
        save("bourse_market_scores_ts", Date.now());
        const hist = load("bourse_signal_history", []);
        hist.unshift({ date: new Date().toISOString(), scores });
        save("bourse_signal_history", hist.slice(0, 30));
        setMarketScores(scores);
        setMarketScoringUi(UI.RESULT);
      } else {
        setMarketScoringUi(UI.ERROR);
      }
    } catch {
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
      return n ? `${n} IA` : "Portefeuille IA";
    } catch { return "Portefeuille IA"; }
  })();
  const tabLabel = activeTab === TABS.AI_PORTFOLIO ? aiPortfolioLabel : (TAB_LABELS[activeTab] || "");

  return (
    <div className={compact ? "ba-compact" : ""} style={{ display: "flex", minHeight: "100vh", background: "linear-gradient(160deg, #E6EFF8 0%, #E2EBF6 35%, #E5F1EC 65%, #EAE5F6 100%)", color: C.ink, fontFamily: "'Roboto', 'Inter', system-ui, sans-serif", filter: darkMode ? "invert(1) hue-rotate(200deg) saturate(0.9)" : "none" }}>
      <style>{`@keyframes bn-next-wave { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }`}</style>

      {/* Sidebar */}
      <Sidebar
        active={activeTab} onChange={changeTab}
        portfolioVersion={portfolioVersion}
        refreshAll={refreshAll} refreshing={refreshing} refreshAgo={refreshAgo}
        toggleDark={toggleDark} toggleCompact={toggleCompact}
        darkMode={darkMode} compact={compact}
        hidden={hiddenValues}
        mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)}
        account={account} onSwitchAccount={switchAccount}
        marketScoringUi={marketScoringUi}
        externalCollapsed={sidebarCollapsed} onExternalToggle={toggleSidebarCollapse}
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
                  ? <AppLogo size={24} />
                  : <>
                      <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                      <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                      <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                    </>
                }
              </button>
              {/* Centre : logo + nom onglet */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minWidth: 0 }}>
                <AppLogo size={22} />
                <span style={{ fontSize: "13px", fontWeight: "700", color: C.ink, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tabLabel}</span>
              </div>
              {/* Droite : avatar seul */}
              <div data-emoji-picker style={{ position: "relative", flexShrink: 0 }}>
                <div ref={emojiTriggerRef} onClick={() => setEmojiPickerOpen(o => !o)} title="Compte"
                  style={{ width: "34px", height: "34px", borderRadius: "50%", background: C.sb, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", userSelect: "none" }}>
                  {avatarEmoji
                    ? <span style={{ fontSize: "16px", lineHeight: 1 }}>{avatarEmoji}</span>
                    : <span style={{ color: "#C1E8FF", fontWeight: "700", fontSize: "12px" }}>{(localUserName || "P")[0].toUpperCase()}</span>}
                </div>
                {emojiPickerOpen && createPortal(
                  <div data-emoji-picker style={{ position: "fixed", top: (emojiTriggerRef.current?.getBoundingClientRect().bottom ?? 52) + 8, left: Math.max(8, Math.min((emojiTriggerRef.current?.getBoundingClientRect().right ?? 240) - 240, window.innerWidth - 248)), background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", boxShadow: "0 8px 28px rgba(0,0,0,0.16)", zIndex: 99999, width: "240px" }}>
                    {/* Nom + IA + déconnexion */}
                    <div style={{ padding: "12px 12px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: "8px" }}>
                      <input
                        value={localUserName}
                        onChange={e => setLocalUserName(e.target.value)}
                        onBlur={() => {
                          const name = localUserName.trim() || "Utilisateur";
                          setLocalUserName(name);
                          try { const s = JSON.parse(localStorage.getItem("bourse_session") || "{}"); localStorage.setItem("bourse_session", JSON.stringify({ ...s, name })); } catch {}
                        }}
                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                        placeholder="Votre prénom ou pseudo"
                        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 10px", fontSize: "13px", fontFamily: "Inter,sans-serif", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }}
                      />
                      <input
                        value={aiName}
                        onChange={e => setAiName(e.target.value)}
                        onBlur={() => { save("bourse_ai_name", aiName.trim()); }}
                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                        placeholder="Nom de votre IA (ex : Atlas)"
                        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 10px", fontSize: "13px", fontFamily: "Inter,sans-serif", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }}
                      />
                      <button onClick={onLogout}
                        style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "7px", color: C.red, fontSize: "11px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer" }}>
                        🚪 Se déconnecter
                      </button>
                    </div>
                    {/* Sélecteur emoji */}
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
                        <button onClick={() => { pickEmoji(""); setEmojiPickerOpen(false); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "4px 8px", color: C.inkSubtle, fontSize: "10px", fontFamily: "Inter,sans-serif", cursor: "pointer" }}>✕ Retirer l'emoji</button>
                      </div>
                    )}
                  </div>
                  , document.body)}
              </div>
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
              {/* CENTER — logo + nom app (cliquable) + titre onglet */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                <div onClick={() => { changeTab(TABS.HOME); refreshAll(); }} title="Accueil · Actualiser"
                  style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "4px 8px", borderRadius: "10px", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.navyLight}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <AppLogo size={24} animated={refreshing} />
                  <span style={{ fontSize: "15px", fontWeight: "300", color: C.ink, letterSpacing: "-0.02em", fontFamily: "Inter, sans-serif" }}>
                    Bourse<span style={{ fontWeight: "900", letterSpacing: "-0.05em", background: "linear-gradient(135deg, #2D6CB5, #5B9BD5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", ...(refreshing ? { backgroundImage: "linear-gradient(135deg, #1A4A8A, #4B9DD8, #85CFEF, #2D6CB5, #1A4A8A)", backgroundSize: "300% 300%", animation: "bn-next-wave 2s ease-in-out infinite" } : {}) }}>Next</span>
                  </span>
                </div>
                {tabLabel && activeTab !== TABS.HOME && (
                  <span style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "500", paddingLeft: "6px", borderLeft: `1px solid ${C.border}` }}>{tabLabel}</span>
                )}
              </div>
              {/* RIGHT — emoji + compte séparés */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>

                {/* Bouton emoji avatar */}
                <div data-emoji-picker style={{ position: "relative" }}>
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
                          <button onClick={() => { pickEmoji(""); setEmojiPickerOpen(false); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "4px 8px", color: C.inkSubtle, fontSize: "10px", fontFamily: "Inter,sans-serif", cursor: "pointer" }}>✕ Retirer l'emoji</button>
                        </div>
                      )}
                    </div>
                  , document.body)}
                </div>

                {/* Bouton compte */}
                <div data-account-menu style={{ position: "relative" }}>
                  <div ref={accountTriggerRef} onClick={() => { setAccountMenuOpen(o => !o); setEmojiPickerOpen(false); }} title="Compte"
                    style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", borderRadius: "10px", background: C.navyLight, border: `1px solid ${C.border}`, cursor: "pointer", userSelect: "none" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: C.inkSoft, fontFamily: "Inter,sans-serif", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{localUserName || "Compte"}</span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke={C.inkSubtle} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  {accountMenuOpen && createPortal(
                    <div data-account-menu style={{ position: "fixed", top: (accountTriggerRef.current?.getBoundingClientRect().bottom ?? 52) + 8, right: 16, background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", boxShadow: "0 8px 28px rgba(0,0,0,0.13)", zIndex: 99999, width: "220px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <input autoFocus value={localUserName} onChange={e => setLocalUserName(e.target.value)}
                        onBlur={() => { const name = localUserName.trim() || "Utilisateur"; setLocalUserName(name); try { const s = JSON.parse(localStorage.getItem("bourse_session") || "{}"); localStorage.setItem("bourse_session", JSON.stringify({ ...s, name })); } catch {} }}
                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setAccountMenuOpen(false); }}
                        placeholder="Votre prénom ou pseudo"
                        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 10px", fontSize: "12px", fontFamily: "Inter,sans-serif", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }} />
                      <input value={aiName} onChange={e => setAiName(e.target.value)}
                        onBlur={() => { save("bourse_ai_name", aiName.trim()); }}
                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                        placeholder="Nom de votre IA (ex : Atlas)"
                        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 10px", fontSize: "12px", fontFamily: "Inter,sans-serif", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }} />
                      <button onClick={onLogout} style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "8px", color: C.red, fontSize: "11px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer" }}>🚪 Se déconnecter</button>
                    </div>
                  , document.body)}
                </div>

              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="ba-content" style={{ flex: 1, overflowY: "auto", padding: "32px 36px", position: "relative" }}>
          <div className="ba-content-inner" style={{ position: "relative", maxWidth: "1200px", margin: "0 auto" }}>
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
                  { key: TABS.MARCHE,        label: "Signaux IA" },
                  { key: TABS.AUTOPILOT,     label: "Autopilot Atlas" },
                  { key: TABS.CHAT,          label: "Conseiller" },
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
                  <div style={{ fontSize: "20px", fontWeight: "800", color: "#0F172A", letterSpacing: "-0.03em" }}>Compte</div>
                  <div style={{ fontSize: "12px", color: "#64748B", marginTop: "3px" }}>Profil et configuration</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "480px" }}>
                  {[
                    { key: TABS.PROFIL,   icon: "👤", label: "Profil",    desc: "Stratégie, horizon et préférences", color: "#FFF7ED", accent: "#F97316" },
                    { key: TABS.SETTINGS, icon: "⚙️", label: "Paramètres", desc: "Clés API, cloud et options",        color: "#F8FAFC", accent: "#64748B" },
                  ].map(({ key, icon, label, desc, color, accent }) => (
                    <button key={key} onClick={() => changeTab(key)} className="ba-card-hover"
                      style={{ display: "flex", alignItems: "center", gap: "14px", background: "rgba(255,255,255,0.85)", border: "1px solid rgba(15,23,42,0.07)", borderRadius: "14px", padding: "14px 16px", textAlign: "left", cursor: "pointer", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", width: "100%" }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>{icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "14px", fontWeight: "700", color: "#0F172A" }}>{label}</div>
                        <div style={{ fontSize: "12px", color: "#64748B", marginTop: "2px" }}>{desc}</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: "#CBD5E1" }}>
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

            {activeTab === TABS.HOME       && <HomeTab account={account} profil={profil} marketScores={marketScores} onTabChange={changeTab} hidden={hiddenValues} />}
            {PORTFOLIO_TABS.includes(activeTab) && <DashboardBar onTabChange={changeTab} hidden={hiddenValues} profil={profil} account={account} />}
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
          </div>
        </div>
      </div>

      {/* ── Assistant IA flottant ── */}
      <AIAssistant account={account} profil={profil} />

      {/* ── Bannière PWA iOS ── */}
      <PWAInstallBanner />

      {/* ── Onboarding Guide ── */}
      {showOnboarding && <OnboardingWizard onComplete={() => { setShowOnboarding(false); setShowTour(shouldShowTour()); }} />}

      {/* ── Tour interactif ── */}
      {showTour && <TourGuide changeTab={changeTab} onDone={() => { markTourDone(); setShowTour(false); }} />}

      {/* ── Bottom navigation bar (mobile only) ── */}
      <nav className="ba-bottom-nav">
        {NAV_GROUPS.flatMap(g => g.items).map(({ key, icon }) => {
          const SHORT = { portfolio: "Positions", marche: "Marchés", dca: "DCA", projection: "Projec.", historique: "Répart.", operations: "Opérat.", chat: "Conseil.", profil: "Config." };
          const isActive = activeTab === key;
          return (
            <button key={key} onClick={() => changeTab(key)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", background: "none", border: "none", cursor: "pointer", padding: "6px 2px", position: "relative" }}>
              <span style={{ width: "40px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: isActive ? "linear-gradient(135deg, #080B0F 0%, #142641 40%, #1E3A5F 75%, #2D5986 100%)" : "transparent", color: isActive ? "#fff" : C.inkSubtle, fontSize: "14px", transition: "all 0.18s", boxShadow: isActive ? "0 3px 12px rgba(30,58,95,0.45)" : "none" }}>{icon}</span>
              <span style={{ fontSize: "9px", fontWeight: isActive ? "500" : "400", color: isActive ? C.accent : C.inkSubtle, fontFamily: "'Roboto', sans-serif" }}>{SHORT[key] || key}</span>
            </button>
          );
        })}
      </nav>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');

        * { box-sizing: border-box; }
        html, body { margin: 0; background: linear-gradient(160deg, #E6EFF8 0%, #E2EBF6 35%, #E5F1EC 65%, #EAE5F6 100%); background-attachment: fixed; min-height: 100vh; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

        /* ── Animations ── */
        [style*="invert(1)"] svg, [style*="invert(1)"] canvas { filter: invert(1) hue-rotate(200deg) saturate(0.9); }
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
        .ba-btn-pill { background: ${C.accent}; color: #fff; border: none; border-radius: 50px; padding: 9px 22px; font-size: 12px; font-family: 'Roboto', inherit; font-weight: 600; cursor: pointer; box-shadow: ${shadow.pill}; transition: all 0.2s ease; white-space: nowrap; letter-spacing: 0.03em; }
        .ba-btn-pill:hover { background: #2D5986; box-shadow: 0 6px 20px rgba(30,58,95,0.40); transform: translateY(-2px); }

        /* ── Card hover ── */
        .ba-card-hover { transition: box-shadow 0.22s ease, transform 0.22s ease; }
        .ba-card-hover:hover { box-shadow: ${shadow.hover}; transform: translateY(-3px); }

        /* ── Densité globale ── */
        .ba-content-inner { zoom: 0.94; }

        /* ── Mode compact ── */
        .ba-compact > *:not(:first-child) { zoom: 0.93; }

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
          .ba-compact > *:not(:first-child) { zoom: 1; }
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
