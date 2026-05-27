import { useState, useEffect, useRef, useCallback } from "react";
import { C, shadow } from "../constants/theme";
import { parsePrice, fmtEur, fmtCours, sanitizePositions, isETFName, getEuronextUrl, getCachedCours, setCachedCours } from "../lib/finance";
import { load, save } from "../lib/storage";
import { getKey, enqueueApi, callClaude, fetchWithProxy } from "../lib/api";
import { useIsMobile, useIsTablet } from "../context/mobile";
import { UI, DEFAULT_POSITIONS, SIGNAL_CONFIG, translateSecteur } from "../constants/config";
import { fetchCoursAlphaVantage, fetchFMPQuote, parseBoursobankCSV, openLink, yahooFinanceUrl } from "../lib/market";
import { ThinkingSpinner } from "./UI";
import { LiveMarketPanel, SellSimulator, PriceRangeBar } from "./StockPanels";
import PortfolioPieChart, { ISIN_SECTEUR, detectSecteurNom } from "./PortfolioPieChart";
import DividendesCard from "./DividendesCard";
import CompanyAvatar from "./CompanyAvatar";
import CapturesPanel, { makeCapture, downloadCapture, CAPTURES_KEY } from "./CapturesPanel";
import MiniSparkline from "./MiniSparkline";
import { savePricePoint, loadPriceHistory } from "../lib/priceHistory";
import Tooltip from "./Tooltip";

const TICKER_CACHE_KEY = "bourse_isin_ticker_cache";

// ─── Swipeable card (mobile delete gesture) ───────────────────────────────────
function SwipeableCard({ children, onSwipeLeft, disabled }) {
  const [dx, setDx]         = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX  = useRef(null);
  const startY  = useRef(null);
  const dirLock = useRef(null);
  const THRESHOLD = 80;

  const onTouchStart = e => {
    startX.current  = e.touches[0].clientX;
    startY.current  = e.touches[0].clientY;
    dirLock.current = null;
  };
  const onTouchMove = e => {
    if (startX.current === null) return;
    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;
    if (!dirLock.current) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
      dirLock.current = Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
    }
    if (dirLock.current === "v") return;
    e.preventDefault();
    setDragging(true);
    setDx(Math.max(-THRESHOLD * 1.5, Math.min(0, deltaX)));
  };
  const onTouchEnd = () => {
    if (dx < -THRESHOLD) { onSwipeLeft?.(); }
    setDx(0);
    setDragging(false);
    startX.current = null;
  };

  if (disabled) return children;
  const reveal = Math.min(1, Math.abs(dx) / THRESHOLD);
  return (
    <div style={{ position: "relative", marginBottom: "14px", borderRadius: "18px", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: `rgba(220,38,38,${0.04 + reveal * 0.14})`, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "22px", borderRadius: "18px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", opacity: reveal, transform: `scale(${0.7 + reveal * 0.3})`, transition: "transform 0.1s" }}>
          <div style={{ fontSize: "20px" }}>🗑</div>
          <div style={{ fontSize: "9px", fontWeight: "800", color: C.red, letterSpacing: "1px" }}>SUPPRIMER</div>
        </div>
      </div>
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)", position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}


// ─── Portfolio Tab ─────────────────────────────────────────────────────────────
function PortfolioTab({ profil, marketScores, marketScoringUi, onRunScoring, account = "PEA" }) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [allPositions, setAllPositions] = useState(() => sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
  const positions = allPositions.filter(p => (p.compte || "PEA") === account);
  const setPositions = (updater) => setAllPositions(prev => {
    const next = typeof updater === "function" ? updater(prev) : updater;
    save("bourse_portfolio", next);
    return next;
  });
  const [showForm, setShowForm]         = useState(false);
  const [editId, setEditId]             = useState(null);
  const [form, setForm]                 = useState({ nom: "", isin: "", pru: "", quantite: "", alerteHaute: "", alerteBasse: "", ticker: "", dateAchat: "", compte: account });
  const [alerts, setAlerts]             = useState([]);
  const [portSaved, setPortSaved]       = useState(false);
  const [fetchingIds, setFetchingIds]   = useState(new Set());
  const [fetchErrors, setFetchErrors]   = useState({});
  const [lastImport, setLastImport]     = useState(() => load("bourse_last_import", null));
  const [vueTableau, setVueTableau]       = useState(true);
  const [selectedPosId, setSelectedPosId] = useState(null);
  const [sortCol, setSortCol]             = useState(null);
  const [sortDir, setSortDir]             = useState("desc");
  const [showCaptures, setShowCaptures]   = useState(false);
  const [captureFlash, setCaptureFlash]   = useState(false);
  const captureCount = load(CAPTURES_KEY, []).filter(c => c.account === account).length;
  const [searchText, setSearchText]       = useState("");
  const [editCoursId, setEditCoursId]     = useState(null);
  const [editCoursVal, setEditCoursVal]   = useState("");
  const [sellSimPos, setSellSimPos]       = useState(null);
  const [vendreDisclaimer, setVendreDisclaimer] = useState(null); // { pos, resume }
  const [showPotentielInfo, setShowPotentielInfo] = useState(false);

  const positionsRef      = useRef(allPositions);
  const countRef          = useRef(null);
  const isFirstRender     = useRef(true);
  const fetchAllCoursRef  = useRef(null);

  useEffect(() => { positionsRef.current = allPositions; }, [allPositions]);
  useEffect(() => {
    save("bourse_portfolio", allPositions);
    window.dispatchEvent(new CustomEvent("portfolioUpdated"));
  }, [allPositions]);

  // Auto-refresh au montage si des positions n'ont pas encore de cours
  useEffect(() => {
    const missing = positions.filter(p => !p.dernierCours || !p.lastFetch);
    if (missing.length > 0) {
      // Petit délai pour laisser fetchAllCoursRef se brancher (défini plus bas dans le même rendu)
      const t = setTimeout(() => fetchAllCoursRef.current?.(), 200);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setPortSaved(true);
    const t = setTimeout(() => setPortSaved(false), 2500);
    return () => clearTimeout(t);
  }, [positions]);

  const analyzePosition = useCallback(async (pos, forceRefresh = false) => {
    const cacheKey = pos.isin || pos.nom;
    if (!forceRefresh) {
      const cached = getCachedCours(cacheKey);
      if (cached) {
        savePricePoint(pos.id, cached);
        setPositions(prev => prev.map(p => p.id === pos.id ? { ...p, dernierCours: cached, lastFetch: Date.now() } : p));
        return;
      }
    }
    setFetchingIds(prev => new Set([...prev, pos.id]));
    setFetchErrors(prev => { const n = { ...prev }; delete n[pos.id]; return n; });
    try {
      // FMP en priorité (ISIN direct) → Alpha Vantage → fallback Claude
      let cours = null;
      if (getKey("fmp") && pos.isin) {
        try {
          const q = await fetchFMPQuote(pos.isin);
          cours = q.price;
        } catch (fmpErr) {
          console.warn("FMP:", fmpErr.message, "→ fallback Alpha Vantage");
        }
      }
      if (!cours && getKey("alphavantage")) {
        try {
          cours = await fetchCoursAlphaVantage(pos.nom, pos.isin);
        } catch (avErr) {
          console.warn("Alpha Vantage:", avErr.message, "→ fallback Claude");
        }
      }
      if (!cours) {
        const query = pos.isin
          ? `Cours actuel de ${pos.nom} ISIN ${pos.isin}. JSON: {"performance":{"cours_actuel":"32.140"}}`
          : `Cours actuel de ${pos.nom}. JSON: {"performance":{"cours_actuel":"32.140"}}`;
        const PRIX_PROMPT = `Tu es un assistant boursier. RÈGLE : appelle web_search("${pos.nom} ${pos.isin || ""} cours bourse") pour trouver le cours. Réponds UNIQUEMENT en JSON valide : {"performance":{"cours_actuel":"32.140"}} — point décimal, sans texte ni markdown.`;
        const data = await enqueueApi(() => callClaude(PRIX_PROMPT, query, true, 4, true));
        cours = parsePrice(data.performance?.cours_actuel);
      }
      if (cours && cours > 0 && (!pos.pru || cours < pos.pru * 50)) {
        setCachedCours(cacheKey, cours);
        savePricePoint(pos.id, cours);
        setPositions(prev => prev.map(p => p.id === pos.id ? { ...p, dernierCours: cours, lastFetch: Date.now() } : p));
        const newAlerts = [];
        if (pos.alerteHaute && cours >= pos.alerteHaute) newAlerts.push({ nom: pos.nom, type: "OBJECTIF ATTEINT", color: C.green, cours, seuil: pos.alerteHaute });
        if (pos.alerteBasse && cours <= pos.alerteBasse) newAlerts.push({ nom: pos.nom, type: "STOP-LOSS ATTEINT", color: C.red, cours, seuil: pos.alerteBasse });
        if (newAlerts.length > 0) {
          setAlerts(prev => [...prev, ...newAlerts]);
          // Web Notifications
          if ("Notification" in window) {
            Notification.requestPermission().then(perm => {
              if (perm === "granted") {
                newAlerts.forEach(a => new Notification(`Bourse — ${a.nom}`, { body: `${a.type} · ${fmtCours(a.cours)} (seuil ${fmtCours(a.seuil)})`, icon: "/favicon.ico" }));
              }
            });
          }
        }
      } else {
        setFetchErrors(prev => ({ ...prev, [pos.id]: "Cours introuvable" }));
      }
    } catch (err) {
      setFetchErrors(prev => ({ ...prev, [pos.id]: err.message || "Erreur API" }));
    } finally {
      setFetchingIds(prev => { const n = new Set(prev); n.delete(pos.id); return n; });
    }
  }, []);

  const analyzeAllRef = useRef(analyzePosition);
  useEffect(() => { analyzeAllRef.current = analyzePosition; }, [analyzePosition]);


  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const totalActuel  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const totalPV      = totalActuel - totalInvesti;
  const totalPVpct   = totalInvesti > 0 ? (totalPV / totalInvesti) * 100 : 0;

  const openForm = (pos = null) => {
    setForm(pos
      ? { nom: pos.nom, isin: pos.isin || "", pru: pos.pru, quantite: pos.quantite,
          alerteHaute: pos.alerteHaute ?? "", alerteBasse: pos.alerteBasse ?? "",
          ticker: pos.ticker || "", dateAchat: pos.dateAchat || "", compte: pos.compte || account }
      : { nom: "", isin: "", pru: "", quantite: "", alerteHaute: "", alerteBasse: "", ticker: "", dateAchat: new Date().toISOString().slice(0,10), compte: account });
    setEditId(pos ? pos.id : null); setShowForm(true);
  };

  const savePosition = () => {
    if (!form.nom || !form.pru || !form.quantite) return;
    const existing = editId ? positions.find(p => p.id === editId) : null;
    const isinClean = form.isin.trim().toUpperCase().replace(/\s/g, "");
    const tickerClean = form.ticker?.trim().toUpperCase() || null;
    // Si ticker manuel fourni, mettre à jour le cache ISIN→ticker
    if (tickerClean && isinClean) {
      try {
        const cache = JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}");
        cache[isinClean] = tickerClean;
        localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(cache));
      } catch {}
    }
    const pos = {
      id: editId || Date.now(), nom: form.nom.trim(),
      isin: isinClean || null,
      ticker: tickerClean,
      compte: form.compte || account,
      pru: parsePrice(String(form.pru)) || parseFloat(String(form.pru).replace(",", ".")) || 0,
      quantite: parseInt(form.quantite) || 0,
      alerteHaute: form.alerteHaute !== "" ? parseFloat(String(form.alerteHaute).replace(",", ".")) : null,
      alerteBasse: form.alerteBasse !== "" ? parseFloat(String(form.alerteBasse).replace(",", ".")) : null,
      dateAchat: form.dateAchat || null,
      dernierCours: existing?.dernierCours ?? null,
      lastFetch: existing?.lastFetch ?? null,
    };
    setAllPositions(prev => {
      const next = editId ? prev.map(p => p.id === editId ? pos : p) : [...prev, pos];
      // Auto-analyse IA de toutes les lignes après ajout/modification
      window.dispatchEvent(new CustomEvent("runMarketScoring", { detail: { positions: next } }));
      return next;
    });
    // Si la position n'a pas de cours, déclencher la récupération automatiquement
    if (!pos.dernierCours) {
      setTimeout(() => fetchAllCoursRef.current?.(), 300);
    }
    setShowForm(false);
  };


  // ─── Import CSV ──────────────────────────────────────────────────────────────
  const importCsvRef = useRef(null);
  const [csvImportMsg, setCsvImportMsg]   = useState(null);
  const [csvPreview, setCsvPreview]       = useState(null);
  const [coursLoading, setCoursLoading]   = useState(false);
  const [flashIds, setFlashIds]           = useState({});  // { [id]: "green"|"red" }
  const [coursMsg, setCoursMsg]           = useState(null);

  // ─── Rafraîchir les cours via Yahoo Finance (0 crédit Claude) ──────────────
  const fetchAllCours = async () => {
    setCoursLoading(true); setCoursMsg(null);
    const cache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
    const errors = [];

    // Pré-remplir le cache avec les tickers manuels définis sur les positions
    for (const pos of positionsRef.current) {
      if (pos.isin && pos.ticker) cache[pos.isin] = pos.ticker;
    }

    // Étape 1 : résoudre les tickers non encore cachés (1 req par ISIN inconnu)
    const needTicker = positionsRef.current.filter(p => p.isin && !cache[p.isin]);
    await Promise.all(needTicker.map(async (pos) => {
      try {
        const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(pos.isin)}&quotesCount=3&newsCount=0`;
        const res = await fetchWithProxy(searchUrl, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const hits = (json?.quotes || []).filter(q => ["EQUITY", "ETF", "MUTUALFUND"].includes(q.quoteType));
        if (!hits.length) throw new Error("introuvable — renseigner le ticker manuellement");
        cache[pos.isin] = hits[0].symbol;
      } catch (e) {
        errors.push(`${pos.nom} : ${e.message}`);
      }
    }));
    try { localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(cache)); } catch {}

    // Étape 2 : une seule requête batch pour tous les tickers résolus
    const resolved = positionsRef.current.filter(p => p.isin && cache[p.isin]);
    if (resolved.length > 0) {
      try {
        const symbols = resolved.map(p => cache[p.isin]).join(",");
        const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
        const res = await fetchWithProxy(quoteUrl, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const qMap = {};
        for (const q of (json?.quoteResponse?.result || [])) qMap[q.symbol] = q;
        const newFlash = {};
        setPositions(prev => {
          const next = prev.map(p => {
            const sym = p.isin && cache[p.isin];
            if (!sym) return p;
            const q = qMap[sym];
            if (!q?.regularMarketPrice) { errors.push(`${p.nom} : cours indisponible`); return p; }
            const sectorRaw = q.sector || null;
            const secteur = sectorRaw ? translateSecteur(sectorRaw) : (p.secteur || ISIN_SECTEUR[p.isin] || detectSecteurNom(p.nom) || null);
            const newPrice = q.regularMarketPrice;
            const prevPrice = p.dernierCours || p.pru;
            const deviation = prevPrice > 0 ? Math.abs(newPrice - prevPrice) / prevPrice : 0;
            if (deviation > 0.20) {
              errors.push(`${p.nom} : prix Yahoo suspect (${newPrice.toFixed(2)} vs ${prevPrice.toFixed(2)}, écart ${(deviation * 100).toFixed(0)}%) — ignoré`);
              return p;
            }
            if (p.dernierCours && newPrice !== p.dernierCours) {
              newFlash[p.id] = newPrice > p.dernierCours ? "green" : "red";
            }
            savePricePoint(p.id, newPrice);
            return { ...p, dernierCours: newPrice, intradayVariation: q.regularMarketChangePercent ?? null, lastFetch: Date.now(), dividendeAnnuel: q.trailingAnnualDividendRate ?? p.dividendeAnnuel ?? null, rendementDividende: q.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100 : (p.rendementDividende ?? null), ...(secteur && !p.secteur ? { secteur } : {}) };
          });
          if (Object.keys(newFlash).length > 0) {
            setFlashIds(newFlash);
            setTimeout(() => setFlashIds({}), 1500);
          }
          return next;
        });
      } catch (e) {
        errors.push(`Requête groupée : ${e.message}`);
      }
    }

    // Étape 3 : fetch secteur via assetProfile pour les positions sans secteur
    const needSecteur = positionsRef.current.filter(p => {
      const hasSecteur = p.secteur || ISIN_SECTEUR[p.isin];
      const ticker = p.isin && cache[p.isin];
      return !hasSecteur && ticker;
    });
    if (needSecteur.length > 0) {
      await Promise.all(needSecteur.map(async (pos) => {
        const ticker = cache[pos.isin];
        try {
          const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile,fundProfile`;
          const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
          const json = await res.json();
          const profile = json?.quoteSummary?.result?.[0];
          const sectorRaw = profile?.assetProfile?.sector || profile?.assetProfile?.industry || profile?.fundProfile?.categoryName || null;
          if (sectorRaw) {
            const secteur = translateSecteur(sectorRaw);
            setPositions(prev => prev.map(p => p.id === pos.id && !p.secteur ? { ...p, secteur } : p));
          }
        } catch {}
      }));
    }

    const okCount = resolved.length - errors.filter(e => !e.includes("introuvable")).length;
    setCoursMsg({
      ok: errors.length === 0,
      txt: `${okCount} cours mis à jour${errors.length ? ` · ${errors.length} erreur(s)` : ""}`,
      errors,
    });
    setTimeout(() => setCoursMsg(null), 6000);
    setCoursLoading(false);
  };
  fetchAllCoursRef.current = fetchAllCours;


  const applyImport = (parsed) => {
    // Remplacement STRICT : le portefeuille devient exactement ce que contient le CSV.
    // Les alertes et l'id existants sont préservés pour les positions connues.
    const newAlerts = [];
    const next = parsed.map((r, i) => {
      const existing = positions.find(p => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase());
      if (existing?.alerteHaute && r.dernierCours && r.dernierCours >= existing.alerteHaute)
        newAlerts.push({ nom: r.nom, type: "OBJECTIF ATTEINT", color: C.green, cours: r.dernierCours, seuil: existing.alerteHaute });
      if (existing?.alerteBasse && r.dernierCours && r.dernierCours <= existing.alerteBasse)
        newAlerts.push({ nom: r.nom, type: "STOP-LOSS ATTEINT", color: C.red, cours: r.dernierCours, seuil: existing.alerteBasse });
      return {
        id:               existing?.id ?? (Date.now() + i),
        nom:              r.nom,
        isin:             r.isin              ?? existing?.isin ?? "",
        quantite:         r.quantite          ?? existing?.quantite ?? 0,
        pru:              r.pru               ?? existing?.pru ?? 0,
        dernierCours:     r.dernierCours      ?? existing?.dernierCours ?? 0,
        intradayVariation: r.intradayVariation ?? null,
        alerteHaute:      existing?.alerteHaute  ?? null,
        alerteBasse:      existing?.alerteBasse  ?? null,
        lastFetch:        Date.now(),
        compte:           account,
      };
    });
    const removed = positions.filter(p => !parsed.find(r => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase())).length;
    // Merge : garder les positions des autres comptes + remplacer celles du compte courant
    setAllPositions(prev => [...prev.filter(p => (p.compte || "PEA") !== account), ...next]);
    if (newAlerts.length > 0) {
      setAlerts(prev => [...prev, ...newAlerts]);
      if ("Notification" in window) {
        Notification.requestPermission().then(perm => {
          if (perm === "granted") newAlerts.forEach(a => new Notification(`Bourse — ${a.nom}`, { body: `${a.type} · ${fmtCours(a.cours)}`, icon: "/favicon.ico" }));
        });
      }
    }
    // Snapshot CSV : uniquement si les cours réels sont disponibles (pas de PRU comme fallback)
    try {
      const withCours  = next.filter(p => (p.dernierCours || 0) > 0);
      const valeurCsv  = withCours.reduce((s, p) => s + p.dernierCours * (p.quantite || 0), 0);
      const investiCsv = withCours.reduce((s, p) => s + (p.pru || 0) * (p.quantite || 0), 0);
      if (valeurCsv > 0) {
        const today = new Date().toISOString().slice(0, 10);
        let snaps = (() => { try { return JSON.parse(localStorage.getItem("bourse_snapshots") || "[]"); } catch { return []; } })();
        snaps = snaps.filter(s => s.date !== today);
        snaps.push({ date: today, valeur: valeurCsv, investi: investiCsv, coutBase: investiCsv, capitalVerse: investiCsv, source: "csv" });
        snaps.sort((a, b) => a.date.localeCompare(b.date));
        localStorage.setItem("bourse_snapshots", JSON.stringify(snaps.slice(-365)));
      }
    } catch {}
    const now = Date.now(); setLastImport(now); save("bourse_last_import", now);
    const removedMsg = removed > 0 ? `, ${removed} supprimée(s)` : "";
    const alertMsg   = newAlerts.length > 0 ? ` — ⚠ ${newAlerts.length} alerte(s) !` : "";
    setCsvImportMsg({ ok: true, txt: `${parsed.length} positions importées${removedMsg}${alertMsg}` });
    setTimeout(() => setCsvImportMsg(null), 4000);
    setCsvPreview(null);
  };

  const handleCsvImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = parseBoursobankCSV(ev.target.result);
        if (!imported.length) { setCsvImportMsg({ ok: false, txt: "Aucune ligne reconnue dans le CSV." }); return; }
        const nouveaux = imported.filter(r => !positions.find(p => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase()));
        const updated  = imported.filter(r =>  positions.find(p => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase()));
        setCsvPreview({ parsed: imported, nouveaux, updated, file: file.name });
      } catch (err) {
        setCsvImportMsg({ ok: false, txt: "Erreur lecture CSV : " + err.message });
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };


  const inp = { background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "11px 16px", color: C.ink, fontSize: "13px", fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box", width: "100%", fontWeight: "500" };
  const lbl = { fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  const btnPrimary = { background: "linear-gradient(135deg, #111214 0%, #1E3A5F 100%)", border: "none", borderRadius: "50px", padding: "11px 22px", color: "#fff", fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 16px rgba(30,58,95,0.30)", letterSpacing: "0.02em" };
  const btnSecondary = (active) => ({ background: active ? C.redLight : C.snowOff, border: `1px solid ${active ? "rgba(220,38,38,0.2)" : C.border}`, borderRadius: "50px", padding: "11px 18px", color: active ? C.red : C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "600", cursor: "pointer" });

  return (
    <>
    <div>
      {/* Alertes */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ background: a.color === C.green ? C.greenLight : C.redLight, border: `1px solid ${a.color === C.green ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)"}`, borderRadius: "8px", padding: "12px 16px", marginBottom: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: a.color, fontWeight: "700" }}>🔔 {a.nom} · {a.type} ({fmtEur(a.cours)} / seuil {fmtEur(a.seuil)})</span>
              <button onClick={() => setAlerts(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.inkMuted, cursor: "pointer", fontSize: "16px" }}>✕</button>
            </div>
          ))}
        </div>
      )}


      {/* Toolbar */}
      <div className="ba-toolbar" style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => openForm()} style={btnPrimary}>+ Ajouter</button>

        <input ref={importCsvRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleCsvImport} />
        <button onClick={() => importCsvRef.current?.click()}
          style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "8px", padding: "9px 16px", color: C.goldDark, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer" }}>
          {isMobile ? "↑ CSV" : "↑ Import CSV"}
        </button>

        <button
          onClick={() => onRunScoring && onRunScoring(positions)}
          disabled={marketScoringUi === UI.LOADING || positions.length === 0}
          style={{ background: marketScoringUi === UI.LOADING ? C.snowOff : C.navyLight, border: `1px solid ${marketScoringUi === UI.LOADING ? C.border : "rgba(30,58,95,0.12)"}`, borderRadius: "8px", padding: "9px 16px", color: marketScoringUi === UI.LOADING ? C.inkSubtle : C.navy, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: marketScoringUi === UI.LOADING || positions.length === 0 ? "not-allowed" : "pointer" }}>
          {marketScoringUi === UI.LOADING ? <span style={{ display:"inline-flex", alignItems:"center", gap:"6px" }}><ThinkingSpinner size={13} color={C.inkSubtle} /> Analyse…</span> : isMobile ? "🤖" : "🤖 Analyser toutes mes lignes"}
        </button>

        {/* Bouton Capturer */}
        {positions.length > 0 && (
          <button
            onClick={() => {
              const cap = makeCapture(positions, account);
              const all = load(CAPTURES_KEY, []);
              save(CAPTURES_KEY, [...all, cap].slice(-100));
              downloadCapture(cap, "json");
              setCaptureFlash(true);
              setTimeout(() => setCaptureFlash(false), 1800);
              setShowCaptures(true);
            }}
            style={{ background: captureFlash ? "rgba(5,150,105,0.12)" : C.snowOff, border: `1px solid ${captureFlash ? "rgba(5,150,105,0.3)" : C.border}`, borderRadius: "8px", padding: "9px 14px", color: captureFlash ? C.green : C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer", transition: "all 0.3s ease", whiteSpace: "nowrap" }}>
            {captureFlash ? "✓ Capturé" : `📸${captureCount > 0 ? ` ${captureCount}` : ""}`}
          </button>
        )}

        {/* Voir les captures */}
        {captureCount > 0 && !showCaptures && (
          <button onClick={() => setShowCaptures(true)}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 14px", color: C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}>
            📂{isMobile ? "" : " Voir"}
          </button>
        )}

        <div style={{ marginLeft: "auto" }} />

        {/* Statut — ligne séparée sur mobile */}
        <div className="ba-toolbar-status">
          {coursMsg
            ? <span style={{ color: coursMsg.ok ? C.green : C.red, fontWeight: "600" }}>{coursMsg.ok ? "✓ " : "⚠ "}{coursMsg.txt}</span>
            : csvImportMsg
              ? <span style={{ color: csvImportMsg.ok ? C.green : C.red, fontWeight: "600" }}>{csvImportMsg.ok ? "✓ " : "⚠ "}{csvImportMsg.txt}</span>
              : lastImport
                ? <span style={{ color: C.inkSubtle }}>{`Import ${new Date(lastImport).toLocaleDateString("fr-FR")}`}</span>
                : <span style={{ color: C.inkSubtle }}>Aucun import</span>
          }
          {portSaved && <span style={{ color: C.green, fontWeight: "600", marginLeft: "8px" }}>✓ Sauvegardé</span>}
        </div>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "20px", marginBottom: "16px", boxShadow: shadow.card }}>
          <div style={{ fontSize: "12px", color: C.ink, fontWeight: "700", letterSpacing: "0.5px", marginBottom: "16px" }}>{editId ? "Modifier la position" : "Nouvelle position"}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1.5fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <div style={ isMobile ? { gridColumn: "1 / -1" } : {}}><label style={lbl}>Action / ETF</label><input style={inp} placeholder="Technip Energies" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} data-gramm="false" spellCheck="false" /></div>
            <div style={ isMobile ? { gridColumn: "1 / -1" } : {}}><label style={lbl}><Tooltip term="ISIN">ISIN</Tooltip> (optionnel)</label><input style={inp} placeholder="FR0014000MR3" value={form.isin} onChange={e => setForm(f => ({ ...f, isin: e.target.value }))} data-gramm="false" spellCheck="false" /></div>
            <div><label style={lbl}><Tooltip term="PRU">PRU</Tooltip> (€)</label><input style={inp} placeholder="32.14" value={form.pru} onChange={e => setForm(f => ({ ...f, pru: e.target.value }))} /></div>
            <div><label style={lbl}>Quantité</label><input style={inp} placeholder="11" value={form.quantite} onChange={e => setForm(f => ({ ...f, quantite: e.target.value }))} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            <div><label style={lbl}>Objectif / Alerte haute (€)</label><input style={inp} placeholder="Optionnel" value={form.alerteHaute} onChange={e => setForm(f => ({ ...f, alerteHaute: e.target.value }))} /></div>
            <div><label style={lbl}>Stop-loss / Alerte basse (€)</label><input style={inp} placeholder="Optionnel" value={form.alerteBasse} onChange={e => setForm(f => ({ ...f, alerteBasse: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Ticker Yahoo Finance <span style={{ color: C.inkSubtle, fontWeight: "500", textTransform: "none", letterSpacing: 0 }}>(si non trouvé auto)</span></label>
              <input style={inp} placeholder="ex: ALSMA.PA" value={form.ticker || ""} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} data-gramm="false" spellCheck="false" />
            </div>
            <div>
              <label style={lbl}>Date d'achat</label>
              <input style={inp} type="date" value={form.dateAchat || ""} onChange={e => setForm(f => ({ ...f, dateAchat: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={savePosition} style={btnPrimary}>Enregistrer</button>
            <button onClick={() => setShowForm(false)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 18px", color: C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Modal preview CSV */}
      {csvPreview && (
        <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "10px", padding: "16px 18px", marginBottom: "16px", boxShadow: shadow.card }}>
          <div style={{ fontSize: "12px", fontWeight: "800", color: C.navy, marginBottom: "6px" }}>Aperçu import CSV — {csvPreview.file}</div>
          <div style={{ fontSize: "10px", color: C.inkMuted, marginBottom: "10px" }}>Le portefeuille sera <strong>remplacé</strong> par les {csvPreview.parsed.length} positions du CSV. Les alertes existantes sont conservées.</div>
          <div style={{ display: "flex", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: C.green, fontWeight: "700" }}>✓ {csvPreview.updated.length} position(s) existante(s)</span>
            {csvPreview.nouveaux.length > 0 && <span style={{ fontSize: "11px", color: C.navy, fontWeight: "700" }}>+ {csvPreview.nouveaux.length} nouvelle(s)</span>}
            {positions.filter(p => !csvPreview.parsed.find(r => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase())).length > 0 &&
              <span style={{ fontSize: "11px", color: C.red, fontWeight: "700" }}>
                − {positions.filter(p => !csvPreview.parsed.find(r => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase())).length} supprimée(s)
              </span>}
          </div>
          <div style={{ maxHeight: "160px", overflowY: "auto", background: C.snow, borderRadius: "8px", marginBottom: "12px" }}>
            {csvPreview.parsed.map((r, i) => {
              const isNew = !positions.find(p => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase());
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px 80px 60px", padding: "6px 12px", borderBottom: `1px solid ${C.border}`, fontSize: "11px", background: isNew ? "#F0FFF4" : "transparent" }}>
                  <span style={{ fontWeight: "600", color: C.ink }}>{r.nom}{isNew && <span style={{ marginLeft: "6px", fontSize: "9px", color: C.green, fontWeight: "800" }}>NOUVEAU</span>}</span>
                  <span style={{ color: C.inkSubtle, fontFamily: "monospace", fontSize: "9px" }}>{r.quantite ?? "—"}</span>
                  <span style={{ color: C.inkSubtle, fontWeight: "600" }}>PRU {r.pru ? fmtCours(r.pru) : "—"}</span>
                  <span style={{ color: C.navy, fontWeight: "700" }}>{r.dernierCours ? fmtCours(r.dernierCours) : "—"}</span>
                  <span style={{ color: r.intradayVariation >= 0 ? C.green : C.red, fontWeight: "600" }}>{r.intradayVariation != null ? `${r.intradayVariation >= 0 ? "+" : ""}${r.intradayVariation.toFixed(2)}%` : ""}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => applyImport(csvPreview.parsed)}
              style={{ background: C.navy, border: "none", borderRadius: "8px", padding: "8px 18px", color: C.snow, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer" }}>
              Appliquer l'import
            </button>
            <button onClick={() => setCsvPreview(null)}
              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 16px", color: C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Panel Captures */}
      {showCaptures && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
            <button
              onClick={() => setShowCaptures(false)}
              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 14px", color: C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "600", cursor: "pointer" }}>
              ✕ Fermer
            </button>
          </div>
          <CapturesPanel account={account} />
        </div>
      )}

      {/* Liste positions */}
      <div style={{ marginBottom: "24px" }}>
        {positions.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px", color: C.inkSubtle, fontSize: "13px", background: C.snowOff, borderRadius: "10px", border: `1px solid ${C.border}` }}>Aucune position · Cliquez sur + Ajouter</div>
        )}

        {/* Barre recherche + export CSV */}
        {positions.length > 0 && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="🔍 Rechercher une valeur…"
              style={{ flex: 1, minWidth: "160px", fontSize: "12px", fontFamily: "Inter, sans-serif", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 12px", background: C.snow, color: C.ink, outline: "none" }}
            />
            <button onClick={() => {
              const cols = ["Nom","ISIN","PRU (€)","Quantité","Cours (€)","Valeur (€)","P/V %","Poids %"];
              const rows = positions.map(p => {
                const cours = p.dernierCours || p.pru;
                const valeur = cours * p.quantite;
                const invest = p.pru * p.quantite;
                const pvPct = invest > 0 ? ((valeur - invest) / invest * 100).toFixed(2) : "0";
                const poids = totalActuel > 0 ? (valeur / totalActuel * 100).toFixed(2) : "0";
                return [p.nom, p.isin || "", p.pru, p.quantite, cours, valeur.toFixed(2), pvPct, poids];
              });
              const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url;
              a.download = `portefeuille_${new Date().toISOString().slice(0,10)}.csv`;
              a.click(); URL.revokeObjectURL(url);
            }} style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 14px", fontSize: "11px", fontFamily: "Inter, sans-serif", fontWeight: "700", color: C.inkMuted, cursor: "pointer", whiteSpace: "nowrap" }}>
              ↓ Export CSV
            </button>
          </div>
        )}

        {/* Vue Tableau enrichi */}
        {positions.length > 0 && (() => {
          const toggleSort = (col) => {
            if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
            else { setSortCol(col); setSortDir("desc"); }
          };
          const sortIcon = (col) => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

          let displayPos = [...positions];
          if (searchText.trim()) {
            const q = searchText.toLowerCase();
            displayPos = displayPos.filter(p => p.nom.toLowerCase().includes(q) || (p.isin || "").toLowerCase().includes(q));
          }
          if (sortCol) {
            displayPos.sort((a, b) => {
              const ca = a.dernierCours || a.pru, cb = b.dernierCours || b.pru;
              const va = ca * a.quantite, vb = cb * b.quantite;
              const ia = a.pru * a.quantite, ib = b.pru * b.quantite;
              const map = { nom: [a.nom, b.nom], cours: [ca, cb], pru: [a.pru, b.pru], quantite: [a.quantite, b.quantite], investi: [ia, ib], valeur: [va, vb], pv: [(va-ia)/Math.max(ia,1), (vb-ib)/Math.max(ib,1)], poids: [va, vb] };
              const [av, bv] = map[sortCol] || [0, 0];
              const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
              return sortDir === "asc" ? cmp : -cmp;
            });
          }

          const totValeur  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
          const totInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
          const totPV      = totValeur - totInvesti;
          const totPVpct   = totInvesti > 0 ? (totPV / totInvesti) * 100 : 0;

          const th = { fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };
          const COL = "minmax(180px,1fr) 88px 68px 46px 82px 84px 95px 90px";

          return (
            <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "18px", boxShadow: shadow.card, marginBottom: "14px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <div style={{ minWidth: "860px" }}>
                {/* En-têtes */}
                <div style={{ display: "grid", gridTemplateColumns: COL, borderBottom: `1px solid ${C.border}`, padding: "9px 14px", background: C.snowOff, borderRadius: "18px 18px 0 0", gap: "6px" }}>
                  <div style={th} onClick={() => toggleSort("nom")}>Valeur{sortIcon("nom")}</div>
                  <div style={th} onClick={() => toggleSort("cours")}>Cours{sortIcon("cours")}</div>
                  <div style={th} onClick={() => toggleSort("pru")}>PRU{sortIcon("pru")}</div>
                  <div style={th} onClick={() => toggleSort("quantite")}>Qté{sortIcon("quantite")}</div>
                  <div style={th} onClick={() => toggleSort("investi")}>Investi{sortIcon("investi")}</div>
                  <div style={th} onClick={() => toggleSort("valeur")}>Valeur €{sortIcon("valeur")}</div>
                  <div style={th} onClick={() => toggleSort("pv")}>P/V{sortIcon("pv")}</div>
                  <div style={th}>Actions</div>
                </div>

                {/* Lignes */}
                {displayPos.map(pos => {
                  const cours  = pos.dernierCours || pos.pru;
                  const valeur = cours * pos.quantite;
                  const invest = pos.pru * pos.quantite;
                  const pv     = valeur - invest;
                  const pvPct  = invest > 0 ? pv / invest * 100 : 0;
                  const poids  = totalActuel > 0 ? valeur / totalActuel * 100 : 0;
                  const etf    = isETFName(pos.nom);
                  const sigEntry = marketScores?.find(s => s.isin === pos.isin || s.nom === pos.nom);
                  const sig    = sigEntry?.signal || "";
                  const sigColor = sig === "ACHAT" ? C.green : sig === "RENFORCER" ? C.navy : sig === "VENDRE" ? "#7B1111" : sig === "PRUDENCE" ? C.red : C.goldDark;
                  const concentration = !etf && poids > 20;
                  const euronextUrl = pos.isin ? getEuronextUrl(pos.isin, pos.nom) : null;
                  const priceHist = loadPriceHistory(pos.id);
                  return (
                    <div key={pos.id} onClick={() => setSelectedPosId(selectedPosId === pos.id ? null : pos.id)}
                      style={{ display: "grid", gridTemplateColumns: COL, alignItems: "center", padding: "10px 14px", gap: "6px", borderBottom: `1px solid ${C.border}`, background: selectedPosId === pos.id ? C.navyLight : concentration ? "#FFF8F5" : "transparent", cursor: "pointer", transition: "background 0.1s", animation: flashIds[pos.id] ? `flash${flashIds[pos.id] === "green" ? "Green" : "Red"} 1.5s ease-out` : "none" }}>

                      {/* Nom + avatar + signal + 📰 */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, overflow: "hidden" }}>
                        <div style={{ flexShrink: 0 }}><CompanyAvatar nom={pos.nom} isin={pos.isin} size={26} /></div>
                        <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: pos.nom.length > 35 ? "9px" : pos.nom.length > 22 ? "10px" : "11px", fontWeight: "700", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {pos.nom}{concentration && <span style={{ fontSize: "8px", color: C.red, marginLeft: "3px" }}>⚠</span>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px", flexWrap: "nowrap", overflow: "hidden" }}>
                            {pos.isin && <span style={{ fontSize: "8px", color: C.inkSubtle, fontWeight: "500", letterSpacing: "0.3px", flexShrink: 0 }}>{pos.isin}</span>}
                            {sig && <span style={{ fontSize: "8px", fontWeight: "700", color: sigColor, background: sigColor + "18", borderRadius: "3px", padding: "1px 4px", whiteSpace: "nowrap", flexShrink: 0 }}>{sig}</span>}
                            <button onClick={e => { e.stopPropagation(); openLink(yahooFinanceUrl(pos)); }} title="Actualités Yahoo Finance"
                              style={{ background: "#5F01D1", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "10px", fontWeight: "700", color: "#fff", fontFamily: "Inter,sans-serif", padding: "2px 6px", lineHeight: "16px", whiteSpace: "nowrap", flexShrink: 0 }}>
                              Yahoo
                            </button>
                            {euronextUrl && <a href={euronextUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              style={{ background: "#003087", border: "none", borderRadius: "4px", padding: "2px 6px", color: "#fff", fontSize: "10px", fontWeight: "700", textDecoration: "none", lineHeight: "16px", whiteSpace: "nowrap", flexShrink: 0 }}>Euronext</a>}
                          </div>
                        </div>
                      </div>

                      {/* Cours + variation */}
                      <div onClick={e => { e.stopPropagation(); setEditCoursId(pos.id); setEditCoursVal(String(cours)); }} style={{ cursor: "text" }}>
                        {editCoursId === pos.id
                          ? <input autoFocus value={editCoursVal}
                              style={{ width: "72px", fontSize: "12px", fontFamily: "Inter, sans-serif", color: C.navy, border: `1px solid ${C.navy}`, borderRadius: "4px", padding: "1px 5px", background: C.snowOff, outline: "none" }}
                              onChange={e => setEditCoursVal(e.target.value)}
                              onBlur={() => { const v = parseFloat(editCoursVal.replace(",",".")); if (v > 0) { savePricePoint(pos.id, v); setPositions(prev => prev.map(p => p.id === pos.id ? { ...p, dernierCours: v, lastFetch: Date.now() } : p)); } setEditCoursId(null); }}
                              onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditCoursId(null); }} />
                          : <>
                              <div style={{ fontSize: "12px", color: C.navy, fontWeight: "700" }}>{fmtCours(cours)}</div>
                              {pos.intradayVariation != null && <div style={{ fontSize: "9px", fontWeight: "700", color: pos.intradayVariation >= 0 ? C.green : C.red }}>{pos.intradayVariation >= 0 ? "+" : ""}{pos.intradayVariation.toFixed(2)}%</div>}
                              {priceHist.length >= 2 && <div style={{ marginTop: "3px" }}><MiniSparkline data={priceHist} posId={pos.id} width={48} height={14} /></div>}
                            </>
                        }
                      </div>

                      <div style={{ fontSize: "12px", color: C.inkMuted }}>{fmtCours(pos.pru)}</div>
                      <div style={{ fontSize: "12px", color: C.inkMuted, fontWeight: "600" }}>{pos.quantite}</div>
                      <div style={{ fontSize: "12px", color: C.inkMuted }}>{fmtEur(invest)}</div>

                      {/* Valeur totale */}
                      <div style={{ fontSize: "12px", color: C.navy, fontWeight: "700" }}>{fmtEur(valeur)}</div>

                      {/* P/V */}
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: "700", color: pv >= 0 ? C.green : C.red }}>{pv >= 0 ? "+" : ""}{pvPct.toFixed(1)}%</div>
                        <div style={{ fontSize: "9px", color: pv >= 0 ? C.green : C.red }}>{pv >= 0 ? "+" : ""}{fmtEur(pv)}</div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                        <button onClick={e => { e.stopPropagation(); setSellSimPos(pos); }}
                          style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "6px", padding: "5px 8px", color: C.greenDark, fontSize: "10px", fontFamily: "Inter,sans-serif", cursor: "pointer", fontWeight: "700" }}>€</button>
                        <button onClick={e => { e.stopPropagation(); openForm(pos); }}
                          style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 8px", color: C.inkMuted, fontSize: "10px", fontFamily: "Inter,sans-serif", cursor: "pointer" }}>✏</button>
                        <button onClick={e => { e.stopPropagation(); if (window.confirm(`Supprimer ${pos.nom} ?`)) setPositions(prev => prev.filter(p => p.id !== pos.id)); }}
                          style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "6px", padding: "5px 8px", color: C.red, fontSize: "10px", fontFamily: "Inter,sans-serif", cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                  );
                })}

                {/* Totaux */}
                <div style={{ display: "grid", gridTemplateColumns: COL, padding: "10px 14px", gap: "6px", background: C.snowOff, borderTop: `2px solid ${C.border}`, borderRadius: "0 0 18px 18px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: C.ink }}>TOTAL · {positions.length} position{positions.length > 1 ? "s" : ""}</div>
                  <div />
                  <div />
                  <div />
                  <div style={{ fontSize: "11px", fontWeight: "700", color: C.inkMuted }}>{fmtEur(totInvesti)}</div>
                  <div style={{ fontSize: "12px", fontWeight: "800", color: C.navy }}>{fmtEur(totValeur)}</div>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: "800", color: totPV >= 0 ? C.green : C.red }}>{totPV >= 0 ? "+" : ""}{totPVpct.toFixed(1)}%</div>
                    <div style={{ fontSize: "9px", color: totPV >= 0 ? C.green : C.red }}>{totPV >= 0 ? "+" : ""}{fmtEur(totPV)}</div>
                  </div>
                  <div />
                </div>
              </div>
            </div>
          );
        })()}

        {/* Drawer backdrop */}
        {selectedPosId && (
          <div onClick={() => setSelectedPosId(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 200, backdropFilter: "blur(3px)", transition: "opacity 0.2s" }} />
        )}
        {/* Drawer droit */}
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "460px", maxWidth: "100vw", zIndex: 201, background: "#F8F9FA", borderLeft: `1px solid ${C.border}`, boxShadow: "-16px 0 60px rgba(0,0,0,0.12)", overflowY: "auto", transform: selectedPosId ? "translateX(0)" : "translateX(100%)", transition: "transform 0.30s cubic-bezier(0.4,0,0.2,1)", display: "flex", flexDirection: "column" }}>
          {selectedPosId && (() => {
            const pos = positions.find(p => p.id === selectedPosId);
            if (!pos) return null;
            const cours = pos.dernierCours || pos.pru;
            const pvPct = pos.pru > 0 ? (cours - pos.pru) / pos.pru * 100 : 0;
            const up    = pvPct >= 0;
            return (
              <>
                {/* En-tête sticky */}
                <div style={{ padding: "16px 20px", background: "rgba(255,255,255,0.90)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "14px", flexShrink: 0, position: "sticky", top: 0, zIndex: 10 }}>
                  <CompanyAvatar nom={pos.nom} isin={pos.isin} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pos.nom.toUpperCase()}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px", flexWrap: "wrap" }}>
                      {pos.isin && <span style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", background: C.snowDim, borderRadius: "5px", padding: "2px 7px", letterSpacing: "0.6px" }}>{pos.isin}</span>}
                      {pos.ticker && <span style={{ fontSize: "9px", color: C.accent, fontWeight: "700", background: "rgba(30,58,95,0.08)", borderRadius: "5px", padding: "2px 7px" }}>{pos.ticker}</span>}
                      <span style={{ fontSize: "11px", fontWeight: "800", color: up ? C.green : C.red }}>{up ? "+" : ""}{pvPct.toFixed(2)}%</span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedPosId(null)} style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "10px", background: C.snowDim, border: "none", color: C.inkMuted, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>
                <LiveMarketPanel key={selectedPosId} pos={pos} onClose={() => setSelectedPosId(null)} />
              </>
            );
          })()}
        </div>

        {/* Vue Cartes — désactivée, remplacée par le tableau enrichi */}
        {false && <div style={isTablet ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" } : {}}>
        {positions.map(pos => {
          const cours  = pos.dernierCours || pos.pru;
          const valeur = cours * pos.quantite;
          const invest = pos.pru * pos.quantite;
          const pv     = valeur - invest;
          const pvPct  = invest > 0 ? (pv / invest) * 100 : 0;
          const poids  = totalActuel > 0 ? (valeur / totalActuel) * 100 : 0;
          const etf    = isETFName(pos.nom);
          // Alerte concentration : small-cap > 20% du portefeuille
          const alerteConcentration = !etf && poids > 20;
          const MARGIN = 0.03;
          let badge = null;
          if (pos.dernierCours) {
            if (pos.alerteHaute && pos.dernierCours >= pos.alerteHaute) badge = { label: "▲ Objectif", bg: C.greenLight, border: "rgba(5,150,105,0.2)", color: C.green };
            else if (pos.alerteHaute && pos.dernierCours >= pos.alerteHaute * (1 - MARGIN)) badge = { label: "≈ Objectif", bg: C.goldLight, border: "rgba(217,119,6,0.2)", color: C.goldDark };
            else if (pos.alerteBasse && pos.dernierCours <= pos.alerteBasse) badge = { label: "▼ Stop", bg: C.redLight, border: "rgba(220,38,38,0.2)", color: C.red };
            else if (pos.alerteBasse && pos.dernierCours <= pos.alerteBasse * (1 + MARGIN)) badge = { label: "≈ Stop", bg: C.redLight, border: "rgba(220,38,38,0.2)", color: C.red };
          }
          const isFetching = fetchingIds.has(pos.id);
          const fetchError = fetchErrors[pos.id];
          const ia = marketScores?.find(s => s.isin === pos.isin || s.nom === pos.nom);
          const sigColor = !ia?.signal ? null : ia.signal === "ACHAT" ? C.green : ia.signal === "RENFORCER" ? C.navy : ia.signal === "VENDRE" ? "#FF0000" : ia.signal === "PRUDENCE" ? C.red : C.goldDark;
          const borderAccent = pv >= 0 ? C.green : C.red;
          return (
            <SwipeableCard key={pos.id} disabled={!isMobile}
              onSwipeLeft={() => { if (window.confirm(`Supprimer ${pos.nom} ?`)) setPositions(prev => prev.filter(p => p.id !== pos.id)); }}>
            <div style={{ background: pv >= 0 ? C.cardGradGreen : C.cardGradRed, border: `1px solid ${C.border}`, borderLeft: `5px solid ${borderAccent}`, borderRadius: "18px", marginBottom: isTablet ? "0" : "14px", boxShadow: shadow.card, overflow: "hidden", transition: "border-color 0.3s, box-shadow 0.2s", animation: flashIds[pos.id] ? `flash${flashIds[pos.id] === "green" ? "Green" : "Red"} 1.5s ease-out` : "none" }}>
              {/* ── En-tête ── */}
              <div style={{ padding: isMobile ? "18px 16px 14px" : "16px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                {/* Gauche : logo + nom + badges */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minWidth: 0 }}>
                  <CompanyAvatar nom={pos.nom} isin={pos.isin} size={isMobile ? 38 : 34} />
                  <span style={{ fontSize: isMobile ? "17px" : "15px", fontWeight: "800", color: C.ink, letterSpacing: "-0.3px" }}>{pos.nom}</span>
                  {pos.isin && <span style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "2px 6px", letterSpacing: "0.8px", whiteSpace: "nowrap" }}>{pos.isin}</span>}
                  {/* Signal IA marché */}
                  {(() => {
                    if (!ia?.signal) {
                      if (marketScoringUi === UI.ERROR) return <span style={{ fontSize: "10px", color: C.red, fontStyle: "italic" }}>⚠ signal indisponible</span>;
                      if (marketScoringUi === UI.LOADING) return <span style={{ display:"inline-flex", alignItems:"center", gap:"4px", fontSize: "10px", color: C.inkSubtle }}><ThinkingSpinner size={11} color={C.inkSubtle} /> analyse…</span>;
                      return null;
                    }
                    if (ia.signal === "VENDRE") return (
                      <span onClick={() => setVendreDisclaimer({ pos, resume: ia.resume || "" })} style={{ fontSize: "10px", fontWeight: "900", color: "#FF0000", background: "#1A0000", border: "1.5px solid #FF0000", borderRadius: "5px", padding: "2px 8px", letterSpacing: "1px", cursor: "pointer", whiteSpace: "nowrap", animation: "vendreAlarm 0.8s ease-in-out infinite", boxShadow: "0 0 8px #FF000066" }}>
                        🚨 VENDRE
                      </span>
                    );
                    return <span title={ia.resume || ""} style={{ fontSize: "10px", fontWeight: "800", color: sigColor, background: sigColor + "18", border: `1px solid ${sigColor}40`, borderRadius: "5px", padding: "2px 8px", letterSpacing: "0.5px", cursor: "default", whiteSpace: "nowrap" }}>{ia.signal}</span>;
                  })()}
                  {badge && <span style={{ background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: "5px", padding: "2px 8px", fontSize: "10px", color: badge.color, fontWeight: "700", whiteSpace: "nowrap" }}>{badge.label}</span>}
                  {alerteConcentration && <span style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "5px", padding: "2px 8px", fontSize: "10px", color: C.red, fontWeight: "700", whiteSpace: "nowrap" }}>⚠ {poids.toFixed(0)}% concentr.</span>}
                </div>
                {/* Droite : cours + P/V + actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    {pos.dernierCours
                      ? <div style={{ fontSize: isMobile ? "20px" : "17px", fontWeight: "800", color: C.navy, letterSpacing: "-0.5px" }}>{fmtCours(pos.dernierCours)}</div>
                      : <div style={{ fontSize: isMobile ? "15px" : "13px", fontWeight: "600", color: C.inkSubtle }}>{isFetching ? "…" : "— €"}</div>}
                    {/* Variation du jour (CSV) */}
                    {pos.intradayVariation != null
                      ? <div style={{ fontSize: "11px", fontWeight: "700", color: pos.intradayVariation >= 0 ? C.green : C.red }}>
                          {pos.intradayVariation >= 0 ? "+" : ""}{pos.intradayVariation.toFixed(2)}% J {pos.intradayVariation >= 0 ? "▲" : "▼"}
                        </div>
                      : <div style={{ fontSize: "11px", fontWeight: "700", color: pv >= 0 ? C.green : C.red }}>
                          {pv >= 0 ? "+" : ""}{pvPct.toFixed(1)}% tot {pv >= 0 ? "▲" : "▼"}
                        </div>
                    }
                  </div>
                  <div style={{ width: "1px", height: "32px", background: C.border }} />
                  <div style={{ display: "flex", gap: "5px" }}>
                    {pos.isin && (() => {
                      const url = getEuronextUrl(pos.isin, pos.nom);
                      return (
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          style={{ background: "#003087", border: "none", borderRadius: "8px", padding: "7px 14px", color: "#fff", fontSize: "12px", fontWeight: "700", textDecoration: "none" }}>
                          Euronext
                        </a>
                      );
                    })()}
                    <button onClick={e => { e.stopPropagation(); openLink(yahooFinanceUrl(pos)); }} title="Actualités Yahoo Finance" style={{ background: "#5F01D1", border: "none", borderRadius: "8px", padding: "7px 14px", color: "#fff", fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer", fontWeight: "700" }}>Yahoo Finance</button>
                    <button onClick={() => setSellSimPos(pos)} title="Simuler une vente" style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "8px", padding: "7px 12px", color: C.greenDark, fontSize: "11px", fontFamily: "Inter, sans-serif", cursor: "pointer", fontWeight: "700" }}>€ Vendre</button>
                    <button onClick={() => openForm(pos)} style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 12px", color: C.inkMuted, fontSize: "11px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>✏</button>
                    <button onClick={() => { if (window.confirm(`Supprimer ${pos.nom} ?`)) setPositions(prev => prev.filter(p => p.id !== pos.id)); }} style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "7px 12px", color: C.red, fontSize: "11px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              </div>

              {/* ── Métriques ── */}
              <div style={{ padding: "12px 20px", display: "flex", gap: "0", flexWrap: "wrap" }}>
                {[
                  { label: "PRU", value: fmtCours(pos.pru), color: C.inkMuted },
                  { label: "Titres", value: String(pos.quantite), color: C.ink },
                  { label: "Investi", value: fmtEur(invest), color: C.ink },
                  { label: "Valeur", value: fmtEur(valeur), color: C.navy, bold: true },
                  { label: "P/V €", value: `${pv >= 0 ? "+" : ""}${fmtEur(pv)}`, color: pv >= 0 ? C.green : C.red, bold: true },
                  { label: "Poids", value: `${poids.toFixed(1)}%`, color: C.ink },
                ].map((m, i) => (
                  <div key={i} style={{ flex: "1 1 80px", minWidth: "70px", padding: "6px 10px", borderRight: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "3px" }}>{m.label}</div>
                    <div style={{ fontSize: "12px", fontWeight: m.bold ? "700" : "600", color: m.color, whiteSpace: "nowrap" }}>{m.value}</div>
                  </div>
                ))}
                {/* Barre poids */}
                <div style={{ flex: "2 1 120px", padding: "6px 10px" }}>
                  <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "5px" }}>Répartition</div>
                  <div style={{ background: C.snowOff, borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, poids)}%`, height: "100%", background: alerteConcentration ? C.red : pv >= 0 ? C.green : C.goldDark, borderRadius: "4px", transition: "width 0.4s" }} />
                  </div>
                  {(pos.alerteHaute || pos.alerteBasse) && (
                    <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                      {pos.alerteHaute && <span style={{ fontSize: "10px", color: C.inkSubtle }}>▲ <strong style={{ color: C.green }}>{fmtCours(pos.alerteHaute)}</strong></span>}
                      {pos.alerteBasse && <span style={{ fontSize: "10px", color: C.inkSubtle }}>▼ <strong style={{ color: C.red }}>{fmtCours(pos.alerteBasse)}</strong></span>}
                    </div>
                  )}
                </div>
              </div>
              {/* Statut fetch / timestamp */}
              {(isFetching || fetchError || pos.lastFetch) && (
                <div style={{ padding: "0 16px 8px", display: "flex", alignItems: "center", gap: "8px" }}>
                  {isFetching && <span style={{ display:"inline-flex", alignItems:"center", gap:"4px", fontSize: "10px", color: C.navy }}><ThinkingSpinner size={11} color={C.navy} /> actualisation cours…</span>}
                  {fetchError && !isFetching && <span style={{ fontSize: "10px", color: C.red }}>⚠ {fetchError}</span>}
                  {!isFetching && !fetchError && pos.lastFetch && <span style={{ fontSize: "10px", color: C.inkSubtle }}>↻ {new Date(pos.lastFetch).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              )}

            </div>
            </SwipeableCard>
          );
        })}
        </div>}
      </div>


      {/* ── Notation du potentiel ── */}
      {positions.length > 0 && (() => {
        const totalVal = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
        const totalInv = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
        const pvPct    = totalInv > 0 ? (totalVal - totalInv) / totalInv * 100 : 0;
        const nb       = positions.length;
        const scores   = Array.isArray(marketScores) ? marketScores : [];

        // Horizon
        const horizonMap = { court: { label: "< 2 ans", annees: 1 }, moyen: { label: "2–5 ans", annees: 3 }, long: { label: "5–10 ans", annees: 7 }, "tres-long": { label: "> 10 ans", annees: 15 } };
        const horizonInfo = horizonMap[profil?.horizon] || horizonMap.moyen;
        const isLong  = horizonInfo.annees >= 7;
        const isCourt = horizonInfo.annees <= 1;

        // Enrichir chaque position avec ses données IA
        const posWithSignal = positions.map(p => ({
          ...p,
          _sig: scores.find(s => s.isin === p.isin || s.nom?.toLowerCase() === p.nom?.toLowerCase()) || null,
          _poids: totalVal > 0 ? (p.dernierCours || p.pru) * p.quantite / totalVal * 100 : 0,
          _pvPct: p.pru > 0 ? ((p.dernierCours || p.pru) - p.pru) / p.pru * 100 : 0,
        }));
        const analyzed   = posWithSignal.filter(p => p._sig);
        const nbAnalyzed = analyzed.length;

        let score = 2;
        const factors = [];

        // Données IA
        const aiPot = load("bourse_ai_potentiel", null);
        const cagrIA         = aiPot?.cagr_portefeuille || null;
        const valProjeteeIA  = aiPot?.valeur_projetee_avec_dca || aiPot?.valeur_projetee || null;
        const posProjections = aiPot?.positions || [];
        const horizonAns     = horizonInfo.annees;
        const objectifEuros  = parseFloat(profil?.objectifEuros) || 0;

        // ── Projection locale — même formule que ProjectionTab (DCA croissant) ──
        const cagrActionBase = { prudent: 0.06, equilibre: 0.07, dynamique: 0.08, "tres-dynamique": 0.09 }[profil?.risque || "equilibre"] ?? 0.07;
        const cagrBasePos = p => isETFName(p.nom) ? 0.05 : cagrActionBase;
        const cagrMoyenBase = positions.length > 0
          ? positions.reduce((s, p) => s + cagrBasePos(p) * (p.dernierCours || p.pru) * p.quantite, 0) / Math.max(totalVal, 1)
          : 0.07;
        const dcaMensuel          = Number(profil?.dcaMensuel) || 0;
        const dcaCroissanceMontant = parseFloat(profil?.dcaCroissanceMontant) || 0;
        const dcaCroissancePeriode = parseFloat(profil?.dcaCroissancePeriode) || 0;
        const dcaAtMois = (m) => {
          if (dcaMensuel <= 0) return 0;
          if (dcaCroissanceMontant <= 0 || dcaCroissancePeriode <= 0) return dcaMensuel;
          const paliers = Math.floor(m / Math.round(dcaCroissancePeriode * 12));
          return dcaMensuel + paliers * dcaCroissanceMontant;
        };
        const nMois = horizonAns * 12;
        // Simulation mois par mois (identique à ProjectionTab)
        const projSimul = (taux) => {
          const r = Math.pow(1 + taux, 1 / 12) - 1;
          let v = totalVal;
          for (let m = 0; m < nMois; m++) v = v * (1 + r) + dcaAtMois(m);
          return v;
        };
        const projNeutreTotal = projSimul(cagrMoyenBase);

        // 1. Trajectoire — projection locale (DCA croissant) ; CAGR IA si dispo
        const cagrUsed  = cagrIA != null ? cagrIA / 100 : cagrMoyenBase;
        const projUsed  = projSimul(cagrUsed); // toujours cohérent avec le graphique
        const useIAProj = cagrIA != null;
        const trajLabel = useIAProj ? "Trajectoire (IA)" : "Trajectoire (neutre)";
        const trajSuffix = useIAProj && cagrIA != null ? ` · CAGR IA ~${cagrIA.toFixed(1)}%/an` : " — scénario conservateur";
        if (objectifEuros > 0) {
          const couv = projUsed / objectifEuros;
          // Seuils relevés : +3 seulement si marge >50% (évite sur-notation sur objectif bas)
          if      (couv >= 1.5) { score += 3; factors.push({ label: trajLabel, detail: `${fmtEur(Math.round(projUsed))} projetés · marge +${Math.round((couv-1)*100)}%${trajSuffix}`, delta: +3, ok: true }); }
          else if (couv >= 1.2) { score += 2; factors.push({ label: trajLabel, detail: `${fmtEur(Math.round(projUsed))} projetés · ${Math.round(couv*100)}% de l'objectif${trajSuffix}`, delta: +2, ok: true }); }
          else if (couv >= 1.0) { score += 1; factors.push({ label: trajLabel, detail: `Objectif atteint à ${Math.round(couv*100)}% — marge de sécurité faible${trajSuffix}`, delta: +1, ok: true }); }
          else if (couv >= 0.7) { score -= 1; factors.push({ label: trajLabel, detail: `${Math.round(couv*100)}% de l'objectif${trajSuffix}`, delta: -1, ok: false }); }
          else if (couv >= 0.4) { score -= 2; factors.push({ label: trajLabel, detail: `Seulement ${Math.round(couv*100)}% de l'objectif${trajSuffix}`, delta: -2, ok: false }); }
          else                  { score -= 3; factors.push({ label: trajLabel, detail: `Trajectoire insuffisante · ${Math.round(couv*100)}% de l'objectif${trajSuffix}`, delta: -3, ok: false }); }
        } else {
          const cagrNeutrePF = positions.length > 0
            ? positions.reduce((s, p) => s + cagrBasePos(p) * (p.dernierCours || p.pru) * p.quantite, 0) / Math.max(totalVal, 1) * 100
            : 6;
          const cagrAff = useIAProj && cagrIA != null ? cagrIA : cagrNeutrePF;
          const cagrLbl = useIAProj && cagrIA != null ? "CAGR IA" : "CAGR base";
          if      (cagrAff >= 7) { score += 1; factors.push({ label: trajLabel, detail: `${cagrLbl} ~${cagrAff.toFixed(1)}%/an · fixez un objectif pour affiner`, delta: +1, ok: true }); }
          else if (cagrAff >= 5) {             factors.push({ label: trajLabel, detail: `${cagrLbl} ~${cagrAff.toFixed(1)}%/an · fixez un objectif patrimonial`, delta: 0, ok: null }); }
          else                   { score -= 1; factors.push({ label: trajLabel, detail: `${cagrLbl} faible ~${cagrAff.toFixed(1)}%/an`, delta: -1, ok: false }); }
        }

        // 2. Alpha IA pondéré par conviction (score marché) × poids portefeuille
        if (posProjections.length > 0) {
          const alphaItems = posProjections.map(p => {
            const pos = positions.find(pos => pos.nom === p.nom);
            const base = pos ? cagrBasePos(pos) * 100 : cagrActionBase * 100;
            const rawAlpha = (p.cagr || 0) - base;
            const sig = scores.find(s => s.nom === p.nom || (pos?.isin && s.isin === pos.isin));
            const conviction = sig?.score_marche != null ? Math.max(0.1, sig.score_marche / 20) : 0.5;
            const valPos = pos ? (pos.dernierCours || pos.pru) * pos.quantite : 0;
            const poidsPF = totalVal > 0 ? valPos / totalVal : 1 / posProjections.length;
            const weight = conviction * poidsPF;
            return { alpha: rawAlpha, weight };
          });
          const sumWeights = alphaItems.reduce((s, i) => s + i.weight, 0);
          const avgAlphaPondere = sumWeights > 0
            ? alphaItems.reduce((s, i) => s + i.alpha * i.weight, 0) / sumWeights
            : 0;
          const nbAlphaFort = alphaItems.filter(i => i.alpha >= 6).length;
          if      (nbAlphaFort >= 2 || avgAlphaPondere >= 5) { score += 2; factors.push({ label: "Alpha IA (pondéré)", detail: `${nbAlphaFort} ligne(s) à fort alpha · moy. pondéré +${avgAlphaPondere.toFixed(1)}%`, delta: +2, ok: true }); }
          else if (nbAlphaFort >= 1 || avgAlphaPondere >= 2) { score += 1; factors.push({ label: "Alpha IA (pondéré)", detail: `Alpha modéré · moy. pondéré +${avgAlphaPondere.toFixed(1)}%`, delta: +1, ok: true }); }
          else if (avgAlphaPondere >= 0)                     {             factors.push({ label: "Alpha IA (pondéré)", detail: `Alpha faible · +${avgAlphaPondere.toFixed(1)}% pondéré`, delta: 0, ok: null }); }
          else                                               { score -= 1; factors.push({ label: "Alpha IA (pondéré)", detail: `Alpha négatif pondéré · ${avgAlphaPondere.toFixed(1)}%`, delta: -1, ok: false }); }
        } else {
          factors.push({ label: "Alpha IA (pondéré)", detail: "Lancez l'analyse Signaux IA pour mesurer le potentiel d'upside", delta: 0, ok: null });
        }

        // 3. Signaux directionnels — pondérés par poids dans le portefeuille
        if (nbAnalyzed > 0) {
          const totalValAnalyzed = analyzed.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
          const poidsAchat  = analyzed.filter(p => p._sig.signal === "ACHAT" || p._sig.signal === "RENFORCER")
            .reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
          const poidsVendre = analyzed.filter(p => p._sig.signal === "VENDRE")
            .reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
          const nbVendre = analyzed.filter(p => p._sig.signal === "VENDRE").length;
          const ratioVal = totalValAnalyzed > 0 ? poidsAchat / totalValAnalyzed : 0;
          const pctAchatAff = Math.round(ratioVal * 100);
          if      (ratioVal >= 0.75) { score += 2; factors.push({ label: "Signaux directionnels", detail: `${pctAchatAff}% du capital en ACHAT/RENFORCER`, delta: +2, ok: true }); }
          else if (ratioVal >= 0.5)  { score += 1; factors.push({ label: "Signaux directionnels", detail: `${pctAchatAff}% du capital en ACHAT/RENFORCER`, delta: +1, ok: true }); }
          else if (poidsVendre > 0)  { score -= nbVendre; factors.push({ label: "Signaux directionnels", detail: `${Math.round(poidsVendre/totalValAnalyzed*100)}% du capital en signal VENDRE`, delta: -nbVendre, ok: false }); }
          else                       { factors.push({ label: "Signaux directionnels", detail: "Signaux neutres sur le capital analysé", delta: 0, ok: null }); }
        } else {
          factors.push({ label: "Signaux directionnels", detail: "Non analysé", delta: 0, ok: null });
        }

        // 4. Catalyseurs — exige un catalyseur factuel (>30 chars, non générique)
        if (nbAnalyzed > 0) {
          const genericPhrases = ["à surveiller", "à confirmer", "potentiel de", "en attente", "possible", "pourrait"];
          const hasRealCatalyst = (sig) => {
            const c = sig?.catalyseur_cle?.trim() || "";
            if (c.length < 30) return false;
            if (genericPhrases.some(g => c.toLowerCase().includes(g))) return false;
            return true;
          };
          const totalValAnalyzed = analyzed.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
          const poidsCat = analyzed.filter(p => hasRealCatalyst(p._sig))
            .reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
          const ratioCatVal = totalValAnalyzed > 0 ? poidsCat / totalValAnalyzed : 0;
          const pctCat = Math.round(ratioCatVal * 100);
          // Max +1 (plus +2) — catalyseur est un signal, pas une certitude
          if      (ratioCatVal >= 0.6)  { score += 1; factors.push({ label: "Catalyseurs", detail: `${pctCat}% du capital avec catalyseur factuel`, delta: +1, ok: true }); }
          else if (ratioCatVal >= 0.3)  {             factors.push({ label: "Catalyseurs", detail: `${pctCat}% du capital — catalyseurs partiels`, delta: 0, ok: null }); }
          else if (ratioCatVal === 0)   { score -= 1; factors.push({ label: "Catalyseurs", detail: "Aucun catalyseur factuel identifié", delta: -1, ok: false }); }
          else                          {             factors.push({ label: "Catalyseurs", detail: `${pctCat}% du capital avec catalyseur — insuffisant`, delta: 0, ok: null }); }
        } else {
          factors.push({ label: "Catalyseurs", detail: "Lancez le scoring IA", delta: 0, ok: null });
        }

        // 5. Horizon — temps pour que le potentiel se réalise
        if      (isLong)  { score += 1; factors.push({ label: "Horizon", detail: `${horizonInfo.label} · temps favorable`, delta: +1, ok: true }); }
        else if (isCourt) { score -= 1; factors.push({ label: "Horizon", detail: `${horizonInfo.label} · fenêtre courte`, delta: -1, ok: false }); }
        else              {             factors.push({ label: "Horizon", detail: horizonInfo.label, delta: 0, ok: null }); }

        // 6. Diversification — concentration ligne + concentration sectorielle (seuils stricts)
        const maxPosPct = totalVal > 0 ? Math.max(...positions.map(p => ((p.dernierCours || p.pru) * p.quantite) / totalVal)) : 0;
        const nbPos = positions.length;
        const secteurMap = {};
        positions.forEach(p => {
          const sec = p.secteur || ISIN_SECTEUR[p.isin] || detectSecteurNom(p.nom) || (isETFName(p.nom) ? "ETF" : "Autre");
          secteurMap[sec] = (secteurMap[sec] || 0) + (p.dernierCours || p.pru) * p.quantite;
        });
        const nbSecteurs = Object.keys(secteurMap).length;
        const maxSecPct = totalVal > 0 ? Math.max(...Object.values(secteurMap)) / totalVal : 0;

        let divScore = 0;
        // Concentration par ligne (seuil abaissé : >40% = risque réel)
        if (nbPos < 3)                                  divScore -= 2;
        else if (nbPos < 5 || maxPosPct > 0.6)         divScore -= 2;
        else if (maxPosPct > 0.4)                       divScore -= 1;
        else if (nbPos >= 8 && maxPosPct <= 0.2)        divScore += 2;
        else if (nbPos >= 6 && maxPosPct <= 0.3)        divScore += 1;
        // Concentration sectorielle
        if      (maxSecPct > 0.65)                      divScore -= 1;
        else if (nbSecteurs >= 5 && maxSecPct <= 0.35)  divScore += 1;
        divScore = Math.max(-3, Math.min(2, divScore));
        score += divScore;
        const divDetail = nbPos < 3
          ? `${nbPos} positions — concentration critique`
          : `${nbPos} lignes · ${nbSecteurs} secteur(s) · max ${Math.round(maxPosPct*100)}%/ligne · max ${Math.round(maxSecPct*100)}%/secteur`;
        factors.push({ label: "Diversification", detail: divDetail, delta: divScore, ok: divScore > 0 ? true : divScore < 0 ? false : null });

        score = Math.min(10, Math.max(1, Math.round(score)));
        const scoreColor = score >= 7 ? C.green : score >= 5 ? C.gold : C.red;
        const scoreLabel = score >= 8 ? "Excellent" : score >= 7 ? "Très bon" : score >= 5 ? "Correct" : score >= 3 ? "Faible" : "Critique";

        // Score IA lu depuis localStorage (écrit par Signaux IA) — combiné 60% structurel + 40% IA
        const aiPotentiel  = aiPot; // déjà chargé dans les critères
        const aiScore10    = aiPotentiel?.score != null ? aiPotentiel.score : null; // déjà /10
        const displayScore = aiScore10 != null
          ? Math.min(10, Math.max(1, Math.round(score * 0.6 + aiScore10 * 0.4)))
          : score;
        const displayColor = displayScore >= 7 ? C.green : displayScore >= 5 ? C.gold : C.red;
        const displayLabel = displayScore >= 8 ? "Excellent" : displayScore >= 7 ? "Très bon" : displayScore >= 5 ? "Correct" : displayScore >= 3 ? "Faible" : "Critique";
        const displaySource = (() => {
          if (objectifEuros > 0)
            return `Objectif ${fmtEur(objectifEuros)} · projeté ${fmtEur(Math.round(projUsed))} sur ${horizonAns} ans${cagrIA != null ? ` · CAGR IA ~${cagrIA.toFixed(1)}%/an` : ""}`;
          if (projUsed > 0)
            return `Projeté ${fmtEur(Math.round(projUsed))} sur ${horizonAns} ans${cagrIA != null ? ` · CAGR IA ~${cagrIA.toFixed(1)}%/an` : ""}`;
          return `Score structurel · analysez dans Signaux IA pour enrichir`;
        })();

        return (
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "18px 22px", marginBottom: "16px", boxShadow: shadow.card }}>
            <div style={{ display: "flex", alignItems: "center", gap: "18px", marginBottom: "14px", flexWrap: "wrap" }}>
              {/* Score badge */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "68px", height: "68px", borderRadius: "18px", background: displayColor + "18", border: `2px solid ${displayColor}40`, flexShrink: 0 }}>
                <div style={{ fontSize: "26px", fontWeight: "900", color: displayColor, lineHeight: 1 }}>{displayScore}</div>
                <div style={{ fontSize: "9px", fontWeight: "700", color: displayColor, letterSpacing: "0.5px" }}>/10</div>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <div style={{ fontSize: "13px", fontWeight: "800", color: C.ink }}>Potentiel du portefeuille</div>
                  <div style={{ position: "relative", display: "inline-flex" }}>
                    <div onClick={() => setShowPotentielInfo(v => !v)}
                      style={{ width: "15px", height: "15px", borderRadius: "50%", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: "700", color: "#6366f1", cursor: "pointer", flexShrink: 0 }}>
                      i
                    </div>
                    {showPotentielInfo && (
                      <div onClick={() => setShowPotentielInfo(false)}
                        style={{ position: "absolute", left: "20px", top: "-4px", zIndex: 99, width: "280px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", cursor: "default" }}>
                        <div style={{ fontSize: "11px", fontWeight: "800", color: "#1e293b", marginBottom: "6px" }}>C'est quoi ce score ?</div>
                        <div style={{ fontSize: "11px", color: "#475569", lineHeight: "1.6", marginBottom: "8px" }}>
                          Une note sur 10 qui résume <strong>la santé de votre portefeuille</strong> : êtes-vous trop concentré sur un seul secteur ? Vos frais sont-ils raisonnables ? Votre niveau de risque correspond-il à votre objectif ?
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", marginBottom: "4px" }}>À quoi ça sert ?</div>
                        <div style={{ fontSize: "11px", color: "#475569", lineHeight: "1.6", marginBottom: "8px" }}>
                          À repérer simplement ce qui peut être amélioré — <strong>sans avoir besoin d'être expert</strong>. Plus le score est élevé, mieux votre portefeuille est équilibré pour le long terme.
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", marginBottom: "4px" }}>Comment l'obtenir ?</div>
                        <div style={{ fontSize: "11px", color: "#475569", lineHeight: "1.6" }}>
                          <div>① Importez votre fichier CSV — le score se calcule <strong>automatiquement</strong></div>
                          <div style={{ marginTop: "3px" }}>② Pour une analyse encore plus précise, activez <strong>Signaux IA</strong> (nécessite une clé Claude)</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: displayColor, marginTop: "3px" }}>{displayLabel}</div>
                <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px" }}>{displaySource}</div>
              </div>
              {/* Jauge segmentée */}
              <div style={{ flex: 1, minWidth: "180px" }}>
                {/* Barre 5 zones + curseur */}
                <div style={{ position: "relative", height: "12px", display: "flex", gap: "2px", marginBottom: "6px" }}>
                  {[
                    { color: "#ef4444", zone: [1,2] },
                    { color: "#f97316", zone: [3,4] },
                    { color: "#eab308", zone: [5,6] },
                    { color: "#84cc16", zone: [7,8] },
                    { color: "#22c55e", zone: [9,10] },
                  ].map((z, i) => {
                    const passed = displayScore > z.zone[1];
                    const active = displayScore >= z.zone[0] && displayScore <= z.zone[1];
                    const dim    = z.color + "26";
                    const fillPct = active
                      ? ((displayScore - z.zone[0] + 0.5) / 2 * 100).toFixed(1)
                      : null;
                    const bg = passed
                      ? z.color + "BF"
                      : active
                        ? `linear-gradient(to right, ${z.color} ${fillPct}%, ${dim} ${fillPct}%)`
                        : dim;
                    return (
                      <div key={i} style={{
                        flex: 1, height: "12px",
                        background: bg,
                        borderRadius: i === 0 ? "6px 0 0 6px" : i === 4 ? "0 6px 6px 0" : "0",
                        boxShadow: active ? `0 0 6px ${z.color}66` : "none",
                        transition: "background 0.3s",
                      }} />
                    );
                  })}
                  {/* Curseur */}
                  <div style={{ position: "absolute", top: "-5px", left: `calc(${(displayScore - 0.5) * 10}% - 1px)`, width: "2px", height: "22px", background: "#1e293b", borderRadius: "2px", boxShadow: "0 0 4px rgba(0,0,0,0.4)", transition: "left 0.4s" }} />
                </div>
                {/* Labels zones + ticks */}
                <div style={{ display: "flex" }}>
                  {[
                    { label: "Critique", color: "#ef4444", zone: [1,2] },
                    { label: "Faible",   color: "#f97316", zone: [3,4] },
                    { label: "Correct",  color: "#eab308", zone: [5,6] },
                    { label: "Très bon", color: "#84cc16", zone: [7,8] },
                    { label: "Excellent",color: "#22c55e", zone: [9,10] },
                  ].map((z, i) => {
                    const active = displayScore >= z.zone[0] && displayScore <= z.zone[1];
                    return (
                      <div key={i} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: "8px", fontWeight: active ? "800" : "500", color: active ? z.color : C.inkSubtle, letterSpacing: "0.2px" }}>{z.label}</div>
                        <div style={{ fontSize: "8px", color: active ? z.color : C.inkSubtle, opacity: active ? 0.8 : 0.5 }}>{z.zone[0]}–{z.zone[1]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Facteurs structurels */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "6px" }}>
              {factors.map((f, i) => (
                <div key={i} style={{ background: f.ok === true ? C.greenLight : f.ok === false ? C.redLight : C.snowOff, border: `1px solid ${f.ok === true ? "rgba(5,150,105,0.2)" : f.ok === false ? "rgba(220,38,38,0.2)" : C.border}`, borderRadius: "10px", padding: "7px 10px" }}>
                  <div style={{ fontSize: "9px", fontWeight: "700", color: f.ok === true ? C.green : f.ok === false ? C.red : C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.6px" }}>
                    {f.ok === true ? "▲ " : f.ok === false ? "▼ " : "· "}{f.label}
                  </div>
                  <div style={{ fontSize: "10px", color: C.inkMuted, marginTop: "2px", fontWeight: "500" }}>{f.detail}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "10px" }}>⚠ Score indicatif. Ne constitue pas un conseil en investissement.</div>
          </div>
        );
      })()}

      {/* ── Analyse de risque ── */}
      {positions.length > 0 && (() => {
        const seuils = { prudent: 5, equilibre: 10, dynamique: 15, "tres-dynamique": 20 };
        const seuil = seuils[profil?.risque] || 10;
        const risques = positions.map(p => {
          const valeur = (p.dernierCours || p.pru) * p.quantite;
          const poids  = totalActuel > 0 ? valeur / totalActuel * 100 : 0;
          const etf    = isETFName(p.nom);
          const statut = etf ? "ETF" : poids > seuil * 2 ? "ÉLEVÉ" : poids > seuil ? "MODÉRÉ" : "OK";
          return { ...p, valeur, poids, etf, statut };
        }).sort((a, b) => b.poids - a.poids);
        const nbAlerte = risques.filter(r => r.statut === "ÉLEVÉ").length;
        const nbModere = risques.filter(r => r.statut === "MODÉRÉ").length;
        return (
          <div style={{ background: C.snow, border: `1px solid ${nbAlerte > 0 ? "rgba(220,38,38,0.2)" : C.border}`, borderRadius: "20px", padding: "18px 22px", marginBottom: "20px", boxShadow: shadow.card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: "800", color: C.ink }}>⚖ Analyse de risque · seuil {seuil}% / ligne ({profil?.risque || "?"})</div>
              <div style={{ display: "flex", gap: "10px" }}>
                {nbAlerte > 0 && <span style={{ fontSize: "10px", fontWeight: "700", color: C.red, background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "5px", padding: "2px 8px" }}>⚠ {nbAlerte} ligne{nbAlerte>1?"s":""} > {seuil*2}%</span>}
                {nbModere > 0 && <span style={{ fontSize: "10px", fontWeight: "700", color: C.goldDark, background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "5px", padding: "2px 8px" }}>{nbModere} entre {seuil}–{seuil*2}%</span>}
                {nbAlerte === 0 && nbModere === 0 && <span style={{ fontSize: "10px", fontWeight: "700", color: C.green, background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "5px", padding: "2px 8px" }}>✓ Concentration OK</span>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {risques.map(r => (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 50px 80px", gap: "8px", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ height: "6px", borderRadius: "3px", background: r.statut === "ÉLEVÉ" ? C.red : r.statut === "MODÉRÉ" ? C.gold : r.etf ? C.navy : C.green, width: `${Math.min(100, r.poids * 3)}%`, minWidth: "4px", transition: "width 0.3s" }} />
                  </div>
                  <div style={{ fontSize: "10px", color: C.inkMuted, textAlign: "right" }}>{r.poids.toFixed(1)}%</div>
                  <div style={{ fontSize: "9px", fontWeight: "700", textAlign: "right",
                    color: r.statut === "ÉLEVÉ" ? C.red : r.statut === "MODÉRÉ" ? C.goldDark : r.etf ? C.navy : C.green }}>{r.nom.split(" ")[0]} · {r.statut}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Dividendes ── */}
      <DividendesCard positions={positions} />

    </div>

    {/* ── Sell Simulator Modal ── */}
    {sellSimPos && (
      <SellSimulator
        pos={sellSimPos}
        account={account}
        onClose={() => setSellSimPos(null)}
      />
    )}

    {/* ── Disclaimer VENDRE ── */}
    {vendreDisclaimer && (
      <div style={{ position: "fixed", inset: 0, zIndex: 950, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,0,0,0.72)", backdropFilter: "blur(6px)", padding: "20px" }}
        onClick={e => e.target === e.currentTarget && setVendreDisclaimer(null)}>
        <div style={{ background: "#fff", borderRadius: "24px", padding: "32px 28px", maxWidth: "420px", width: "100%", boxShadow: "0 32px 80px rgba(0,0,0,0.35)", animation: "fadeIn 0.2s ease" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "14px", background: "#1A0000", border: "2px solid #FF0000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>🚨</div>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "800", color: "#CC0000", letterSpacing: "-0.02em" }}>Signal VENDRE</div>
              <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>{vendreDisclaimer.pos.nom}</div>
            </div>
          </div>
          {/* Disclaimer */}
          <div style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.25)`, borderRadius: "14px", padding: "14px 16px", marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: "800", color: C.red, marginBottom: "6px" }}>⚠ Avertissement important</div>
            <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.65" }}>
              Ce signal est généré par une IA à des fins <strong>éducatives et informatives uniquement</strong>. Il ne constitue pas un conseil en investissement. L'IA peut se tromper et ne connaît pas votre situation personnelle. <strong>Consultez un conseiller financier agréé</strong> avant toute décision de vente.
            </div>
          </div>
          {/* Signal detail */}
          {vendreDisclaimer.resume && (
            <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 16px", marginBottom: "20px" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Analyse IA</div>
              <div style={{ fontSize: "12px", color: C.ink, lineHeight: "1.6" }}>{vendreDisclaimer.resume}</div>
            </div>
          )}
          {/* Buttons */}
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => setVendreDisclaimer(null)}
              style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `1px solid ${C.border}`, background: C.snowOff, color: C.inkMuted, fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
              Fermer
            </button>
            <button onClick={() => { setSellSimPos(vendreDisclaimer.pos); setVendreDisclaimer(null); }}
              style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "none", background: C.navy, color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
              Simuler la vente →
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}


export default PortfolioTab;
