import { useState, useEffect, useCallback } from "react";
import { C, shadow } from "../constants/theme";
import { SYSTEM_PROMPT, MARKET_SCORING_PROMPT } from "../constants/prompts";
import { load, save } from "../lib/storage";
import { callClaude, enqueueApi, hasClaudeKey } from "../lib/api";
import { fetchYahooAnalysts, fetchGoogleNewsRSS, formatExternalContext } from "../lib/market";
import { useIsMobile } from "../context/mobile";
import { UI, DEFAULT_PROFIL } from "../constants/config";
import { TABS } from "../constants/tabs";
import { ThinkingSpinner, Card } from "./UI";
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
import OnboardingGuide, { ONBOARDING_KEY } from "./OnboardingGuide";
import PWAInstallBanner from "./PWAInstallBanner";
import HomeTab from "./HomeTab";

const TICKER_CACHE_KEY = "bourse_isin_ticker_cache";
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
  const [mobileNavOpen, setMobileNavOpen]       = useState(false);
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
  const [emojiPickerOpen, setEmojiPickerOpen]   = useState(false);
  const [emojiCat, setEmojiCat]                 = useState(0);
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


  // Ferme les popups emoji/compte au clic hors de la zone
  useEffect(() => {
    if (!emojiPickerOpen && !editingName) return;
    const close = (e) => {
      if (!e.target.closest("[data-emoji-picker]")) {
        setEmojiPickerOpen(false);
        setEditingName(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [emojiPickerOpen, editingName]);

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
      // Résoudre les tickers depuis le cache
      const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();

      // Fetcher Yahoo analystes + Google News RSS pour chaque position en parallèle
      const externalData = await Promise.all(positions.map(async (pos) => {
        const ticker = pos.ticker || (pos.isin && tickerCache[pos.isin]) || null;
        let analysts = null;
        let news = [];
        await Promise.all([
          ticker
            ? fetchYahooAnalysts(ticker).then(d => { analysts = d; }).catch(() => {})
            : Promise.resolve(),
          fetchGoogleNewsRSS(`"${pos.nom}" bourse action`).then(d => { news = d; }).catch(() => {}),
        ]);
        return { pos, analysts, news };
      }));

      // Construire le bloc de contexte par position
      const contextBlocks = externalData
        .map(({ pos, analysts, news }) => formatExternalContext(pos.nom, analysts, news))
        .join("\n\n");

      const posListe = positions.map(p =>
        `- ${p.nom}${p.isin ? ` (ISIN: ${p.isin})` : ""}${p.ticker ? ` [${p.ticker}]` : ""}, PRU ${p.pru}€, qté ${p.quantite}`
      ).join("\n");

      const userMsg = `Portefeuille PEA à analyser (DCA long terme, 10 ans) :\n${posListe}\n\nDONNÉES MARCHÉ EN TEMPS RÉEL :\n${contextBlocks}\n\nJSON uniquement.`;

      const data = await enqueueApi(() => callClaude(MARKET_SCORING_PROMPT, userMsg, false));
      const scores = data?.classement;
      if (scores && scores.length > 0) {
        save("bourse_market_scores", scores);
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

  const tabLabel = NAV_GROUPS.flatMap(g => g.items).find(i => i.key === activeTab)?.label || "";

  return (
    <div className={compact ? "ba-compact" : ""} style={{ display: "flex", minHeight: "100vh", background: "linear-gradient(160deg, #E6EFF8 0%, #E2EBF6 35%, #E5F1EC 65%, #EAE5F6 100%)", color: C.ink, fontFamily: "'Roboto', 'Inter', system-ui, sans-serif", filter: darkMode ? "invert(1) hue-rotate(200deg) saturate(0.9)" : "none" }}>

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
      />

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Top bar */}
        <div className="ba-topbar" style={{ height: "52px", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.75)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "0 16px" : "0 28px", position: "sticky", top: 0, zIndex: 10, flexShrink: 0, gap: "12px" }}>

          {/* ── MOBILE : hamburger | logo+onglet | avatar ── */}
          {isMobile ? (
            <>
              {/* Gauche : hamburger */}
              <button onClick={() => setMobileNavOpen(true)} title="Menu"
                style={{ width: "40px", height: "40px", background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", padding: 0, flexShrink: 0 }}>
                <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
              </button>
              {/* Centre : logo + nom onglet */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minWidth: 0 }}>
                <AppLogo size={22} />
                <span style={{ fontSize: "13px", fontWeight: "700", color: C.ink, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tabLabel}</span>
              </div>
              {/* Droite : avatar seul */}
              <div data-emoji-picker style={{ position: "relative", flexShrink: 0 }}>
                <div onClick={() => setEmojiPickerOpen(o => !o)} title="Compte"
                  style={{ width: "34px", height: "34px", borderRadius: "50%", background: C.sb, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", userSelect: "none" }}>
                  {avatarEmoji
                    ? <span style={{ fontSize: "16px", lineHeight: 1 }}>{avatarEmoji}</span>
                    : <span style={{ color: "#C1E8FF", fontWeight: "700", fontSize: "12px" }}>{(localUserName || "P")[0].toUpperCase()}</span>}
                </div>
                {emojiPickerOpen && (
                  <div style={{ position: "absolute", top: "44px", right: 0, background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", boxShadow: "0 8px 28px rgba(0,0,0,0.16)", zIndex: 9999, width: "240px", overflow: "hidden" }}>
                    {/* Nom + déconnexion */}
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
                      <button onClick={onLogout}
                        style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "7px", color: C.red, fontSize: "11px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer" }}>
                        🚪 Se déconnecter
                      </button>
                    </div>
                    {/* Sélecteur emoji */}
                    <div style={{ display: "flex", height: "200px" }}>
                      <div style={{ width: "34px", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "6px", gap: "2px", flexShrink: 0, overflowY: "auto" }}>
                        {AVATAR_EMOJI_CATS.map((cat, i) => (
                          <button key={i} onClick={() => setEmojiCat(i)} title={cat.label}
                            style={{ width: "26px", height: "26px", borderRadius: "7px", border: "none", background: emojiCat === i ? C.navyLight : "transparent", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {cat.icon}
                          </button>
                        ))}
                      </div>
                      <div style={{ flex: 1, overflowY: "auto", padding: "8px", display: "flex", flexWrap: "wrap", gap: "4px", alignContent: "flex-start" }}>
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
                )}
              </div>
            </>
          ) : (
            <>
              {/* ── DESKTOP : titre page | contrôles + compte ── */}
              {/* LEFT */}
              <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                <span style={{ fontSize: "16px", fontWeight: "700", color: C.ink, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tabLabel}</span>
              </div>
              {/* RIGHT */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                {refreshAgo && <span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "400" }}>{refreshAgo}</span>}
                <button onClick={refreshAll} disabled={refreshing} title={updateAvailable ? "Nouvelle version disponible — cliquer pour mettre à jour" : "Actualiser"}
                  style={{ position: "relative", width: "34px", height: "34px", background: updateAvailable ? C.green + "18" : "transparent", border: `1px solid ${updateAvailable ? C.green : C.border}`, borderRadius: "10px", cursor: refreshing ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", fontSize: "16px", color: updateAvailable ? C.green : C.inkMuted }}>
                  {refreshing ? <ThinkingSpinner size={16} color={C.green} /> : "↻"}
                  {updateAvailable && !refreshing && <span style={{ position: "absolute", top: "4px", right: "4px", width: "7px", height: "7px", borderRadius: "50%", background: C.green, boxShadow: `0 0 0 2px ${C.bg}` }} />}
                </button>
                <button onClick={toggleHidden} title={hiddenValues ? "Afficher" : "Masquer"}
                  style={{ width: "34px", height: "34px", background: hiddenValues ? C.navyLight : "transparent", border: `1px solid ${C.border}`, borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", transition: "all 0.15s" }}>
                  {hiddenValues ? "🙈" : "👁"}
                </button>
                <div data-emoji-picker style={{ display: "flex", alignItems: "center", gap: "8px", paddingLeft: "12px", borderLeft: `1px solid ${C.border}`, position: "relative" }}>
                  {/* Bouton emoji */}
                  <div onClick={() => setEmojiPickerOpen(o => !o)} title="Changer l'emoji"
                    style={{ width: "32px", height: "32px", borderRadius: "50%", background: C.sb, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", userSelect: "none" }}>
                    {avatarEmoji
                      ? <span style={{ fontSize: "16px", lineHeight: 1 }}>{avatarEmoji}</span>
                      : <span style={{ color: "#C1E8FF", fontWeight: "700", fontSize: "12px" }}>{(localUserName || "P")[0].toUpperCase()}</span>}
                  </div>
                  {/* Popup emoji */}
                  {emojiPickerOpen && (
                    <div style={{ position: "absolute", top: "44px", right: 0, background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", boxShadow: "0 8px 28px rgba(0,0,0,0.13)", zIndex: 9999, width: "220px", overflow: "hidden" }}>
                      <div style={{ display: "flex", height: "210px" }}>
                        <div style={{ width: "34px", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "6px", gap: "2px", flexShrink: 0, overflowY: "auto" }}>
                          {AVATAR_EMOJI_CATS.map((cat, i) => (
                            <button key={i} onClick={() => setEmojiCat(i)} title={cat.label}
                              style={{ width: "26px", height: "26px", borderRadius: "7px", border: "none", background: emojiCat === i ? C.navyLight : "transparent", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {cat.icon}
                            </button>
                          ))}
                        </div>
                        <div style={{ flex: 1, overflowY: "auto", padding: "8px", display: "flex", flexWrap: "wrap", gap: "4px", alignContent: "flex-start" }}>
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
                  )}
                  {/* Nom + déconnexion */}
                  <div style={{ position: "relative" }}>
                    <div onClick={() => setEditingName(o => !o)} style={{ lineHeight: 1, cursor: "pointer" }}>
                      <div style={{ fontSize: "12px", fontWeight: "600", color: C.ink }}>{localUserName || "Mon PEA"}</div>
                      <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "3px" }}>▾ Compte</div>
                    </div>
                    {editingName && (
                      <div style={{ position: "absolute", top: "36px", right: 0, background: C.snow, border: `1px solid ${C.border}`, borderRadius: "12px", boxShadow: "0 8px 28px rgba(0,0,0,0.13)", zIndex: 9999, width: "200px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                        <input
                          autoFocus
                          value={localUserName}
                          onChange={e => setLocalUserName(e.target.value)}
                          onBlur={() => {
                            const name = localUserName.trim() || "Utilisateur";
                            setLocalUserName(name);
                            try { const s = JSON.parse(localStorage.getItem("bourse_session") || "{}"); localStorage.setItem("bourse_session", JSON.stringify({ ...s, name })); } catch {}
                          }}
                          onKeyDown={e => { if (e.key === "Enter") { e.target.blur(); setEditingName(false); } if (e.key === "Escape") setEditingName(false); }}
                          placeholder="Votre prénom ou pseudo"
                          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 10px", fontSize: "12px", fontFamily: "Inter,sans-serif", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }}
                        />
                        <button onClick={onLogout}
                          style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "7px", color: C.red, fontSize: "11px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer" }}>
                          🚪 Se déconnecter
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="ba-content" style={{ flex: 1, overflowY: "auto", padding: "32px 36px", position: "relative" }}>
          <div className="ba-content-inner" style={{ position: "relative", maxWidth: "1200px", margin: "0 auto" }}>
          {/* Bannière sans clé Claude */}
          {!hasClaudeKey() && (
            <div style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.04))", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "18px", padding: "14px 20px", marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "18px" }}>🔑</span>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: "#92400E" }}>Fonctionnalités IA désactivées</div>
                  <div style={{ fontSize: "11px", color: "#A16207", marginTop: "1px" }}>Ajoutez une clé Claude pour activer l'analyse IA, le scoring de marché et l'assistant.</div>
                </div>
              </div>
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                style={{ fontSize: "11px", fontWeight: "700", color: "#92400E", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: "8px", padding: "6px 14px", textDecoration: "none", whiteSpace: "nowrap" }}>
                Obtenir une clé gratuite →
              </a>
            </div>
          )}
            {activeTab === TABS.HOME       && <HomeTab account={account} profil={profil} marketScores={marketScores} onTabChange={changeTab} hidden={hiddenValues} />}
            {activeTab === TABS.PORTFOLIO  && <><MarketStatusBar /><DashboardBar onTabChange={changeTab} hidden={hiddenValues} profil={profil} account={account} /><PortfolioTab profil={profil} marketScores={marketScores} marketScoringUi={marketScoringUi} onRunScoring={runMarketScoring} account={account} /></>}
{activeTab === TABS.MARCHE     && <MarcheTab profil={profil} portfolioVersion={portfolioVersion} account={account} marketScores={marketScores} marketScoringUi={marketScoringUi} onRunScoring={runMarketScoring} />}
            {activeTab === TABS.PROJECTION && <ProjectionTab profil={profil} account={account} />}
            {activeTab === TABS.HISTORIQUE && <HistoriqueTab portfolioVersion={portfolioVersion} account={account} />}
            {activeTab === TABS.DCA        && <StratégieDCATab profil={profil} portfolioVersion={portfolioVersion} marketScores={marketScores} marketScoringUi={marketScoringUi} onRunScoring={runMarketScoring} onSaveProfil={p => { setProfil(p); save("bourse_profil", p); }} account={account} />}
            {activeTab === TABS.OPERATIONS && <OperationsTab account={account} />}
            {activeTab === TABS.CHAT       && <ChatTab profil={profil} account={account} portfolioVersion={portfolioVersion} marketScores={marketScores} />}
            {activeTab === TABS.AUTOPILOT  && <AutopilotIA account={account} profil={profil} hidden={hiddenValues} />}
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
      {showOnboarding && <OnboardingGuide onDone={() => setShowOnboarding(false)} />}

      {/* ── Bottom navigation bar (mobile only — 5 tabs principaux) ── */}
      <nav className="ba-bottom-nav">
        {[
          { key: TABS.PORTFOLIO,  label: "Positions",  icon: NAV_GROUPS.flatMap(g=>g.items).find(i=>i.key===TABS.PORTFOLIO)?.icon  },
          { key: TABS.MARCHE,     label: "Signaux",    icon: NAV_GROUPS.flatMap(g=>g.items).find(i=>i.key===TABS.MARCHE)?.icon     },
          { key: TABS.AUTOPILOT,  label: "Autopilot",  icon: NAV_GROUPS.flatMap(g=>g.items).find(i=>i.key===TABS.AUTOPILOT)?.icon  },
          { key: TABS.DCA,        label: "DCA",        icon: NAV_GROUPS.flatMap(g=>g.items).find(i=>i.key===TABS.DCA)?.icon        },
        ].map(({ key, label, icon }) => {
          const isActive = activeTab === key;
          return (
            <button key={key} onClick={() => changeTab(key)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", background: "none", border: "none", cursor: "pointer", padding: "6px 2px" }}>
              <span style={{ width: "44px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "12px", background: isActive ? "linear-gradient(135deg,#1E3A5F,#2D5986)" : "transparent", color: isActive ? "#fff" : C.inkSubtle, fontSize: "16px", transition: "all 0.18s", boxShadow: isActive ? "0 3px 12px rgba(30,58,95,0.35)" : "none" }}>{icon}</span>
              <span style={{ fontSize: "10px", fontWeight: isActive ? "700" : "400", color: isActive ? C.navy : C.inkSubtle, fontFamily: "'Roboto', sans-serif" }}>{label}</span>
            </button>
          );
        })}
        {/* Bouton "Menu" ouvre le drawer */}
        <button onClick={() => setMobileNavOpen(true)}
          style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", background: "none", border: "none", cursor: "pointer", padding: "6px 2px" }}>
          <span style={{ width: "44px", height: "30px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "12px", background: "transparent", color: C.inkSubtle, fontSize: "18px" }}>⋯</span>
          <span style={{ fontSize: "10px", fontWeight: "400", color: C.inkSubtle, fontFamily: "'Roboto', sans-serif" }}>Menu</span>
        </button>
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
          .ba-tabnav { display: none !important; }
          .ba-content-inner { zoom: 1; }
          .ba-g4 { grid-template-columns: repeat(2, 1fr) !important; }
          .ba-tbl-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch; border-radius: 10px; }
          .ba-card-body { padding: 14px !important; }
          input, select, textarea { font-size: 16px !important; border-radius: 10px !important; }
          .ba-sidebar-item { min-height: 48px !important; }

          /* TopBar fixe en haut — reste visible en scrollant */
          .ba-topbar {
            position: fixed !important;
            top: 0; left: 0; right: 0;
            height: calc(54px + env(safe-area-inset-top, 0px)) !important;
            padding-top: env(safe-area-inset-top, 0px) !important;
            padding-left: 14px !important;
            padding-right: 14px !important;
            z-index: 200 !important;
          }

          /* Décale le contenu sous la topbar fixe + au-dessus de la bottom nav */
          .ba-content {
            padding: calc(54px + env(safe-area-inset-top, 0px) + 12px) 12px calc(72px + env(safe-area-inset-bottom, 0px)) 12px !important;
          }

          /* Toolbar portfolio */
          .ba-toolbar { gap: 6px !important; margin-bottom: 6px !important; flex-wrap: wrap !important; }
          .ba-toolbar > button { padding: 8px 10px !important; font-size: 11px !important; border-radius: 8px !important; }
          .ba-toolbar-status { width: 100%; order: 99; font-size: 10px; color: ${C.inkSubtle}; padding: 2px 0; }

          /* Grilles PerformanceGlobale */
          .ba-perf-kpi { grid-template-columns: repeat(2, 1fr) !important; }
          .ba-perf-breakdown { grid-template-columns: repeat(2, 1fr) !important; }

          /* Grille dashboard cards */
          .ba-dashboard-grid { grid-template-columns: repeat(2, 1fr) !important; }

          /* Bottom nav fixe en bas */
          .ba-bottom-nav {
            display: flex !important;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            height: calc(60px + env(safe-area-inset-bottom, 0px));
            padding-bottom: env(safe-area-inset-bottom, 0px);
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-top: 1px solid rgba(0,0,0,0.08);
            z-index: 200;
            box-shadow: 0 -4px 20px rgba(0,0,0,0.08);
          }
        }

        /* ── Bottom navigation — masquée sur desktop ── */
        .ba-bottom-nav { display: none; }


        /* ── Petit écran ── */
        @media (max-width: 480px) {
          .ba-g4 { grid-template-columns: repeat(2, 1fr) !important; }
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
