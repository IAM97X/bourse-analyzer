import { useState, useEffect, useCallback } from "react";
import { C } from "../constants/theme";
import { LoadingPanel } from "./UI";
import AppLogo from "./AppLogo";
import { load, save } from "../lib/storage";
import { sanitizePositions, fmtEur } from "../lib/finance";
import { getKey } from "../lib/api";
import { fetchGoogleNewsRSS } from "../lib/market";
import { COURTIERS, COURTIERS_DETAIL, BOURSOMARKETS_ETFS, getCourtierForAccount } from "../constants/courtiers";
import { DEFAULT_PROFIL } from "../constants/config";
import { MARKETS_CFG, getMarketStatus } from "../constants/markets";
import { AUTOPILOT_UNIVERSE } from "../constants/universe";

const TICKER_ISIN_MAP = Object.fromEntries(
  [...(AUTOPILOT_UNIVERSE.PEA || []), ...(AUTOPILOT_UNIVERSE.CTO || [])]
    .filter(u => u.isin)
    .map(u => [u.symbol, u.isin])
);

const aiPfKey = (account) => `bourse_ai_portfolio_${account || "PEA"}`;

// Helpers pour lire l'identité de l'assistant IA (partagée avec le Conseiller)
const getAiEmoji = () => localStorage.getItem("bourse_ai_emoji") || "🤖";
const getAiName  = () => { try { return JSON.parse(localStorage.getItem("bourse_ai_config") || "{}").nom?.trim() || ""; } catch { return ""; } };

// Résout l'ISIN en ticker Yahoo via le cache existant
const isIsinFormat = (s) => s && /^[A-Z]{2}[A-Z0-9]{9,10}$/.test(s);
function resolveTickerFromCache(p) {
  const cache = (() => { try { return JSON.parse(localStorage.getItem("bourse_isin_ticker_cache") || "{}"); } catch { return {}; } })();
  if (p.ticker && !isIsinFormat(p.ticker)) return p.ticker; // ticker Yahoo valide
  return cache[p.isin] || cache[p.ticker] || p.ticker || p.isin || p.nom;
}

// JSON.stringify sans références circulaires ni fonctions
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_, val) => {
    if (typeof val === "function") return undefined;
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }
    return val;
  });
}

// ── Batch price fetch via /api/yahoo ──────────────────────────────────────────
async function fetchBatchPrices(symbols) {
  const prices = {};
  const chunks = [];
  for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
  await Promise.all(chunks.map(async chunk => {
    try {
      const res = await fetch(`/api/yahoo?symbols=${encodeURIComponent(chunk.join(","))}`, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) return;
      const data = await res.json();
      (data?.quoteResponse?.result || []).forEach(q => {
        if (q.regularMarketPrice) prices[q.symbol] = q.regularMarketPrice;
      });
    } catch {}
  }));
  return prices;
}

// ── Compute total portfolio value ─────────────────────────────────────────────
function totalValue(pf, prices) {
  return (pf.cash || 0) + (pf.positions || []).reduce((s, p) => {
    const c = prices?.[p.ticker] || p.dernier_cours || p.prix_achat_moyen || 0;
    return s + p.quantite * c;
  }, 0);
}

// ── Fee calculator (BoursoMarkets = 0€ si ≥200€) ─────────────────────────────
function calcFee(ticker, montant, courtierConstraints) {
  const { boursomarkets = false, frais } = courtierConstraints;
  if (boursomarkets && BOURSOMARKETS_ETFS[ticker] && montant >= 200) return 0;
  return frais ? frais(montant) : 0;
}

// ── Apply AI decisions to portfolio ──────────────────────────────────────────
function applyDecisions(portfolio, decisions, prices, courtierConstraints = {}) {
  const { minOrdre = 0, minOrdreETF = 0, fractionne = false } = courtierConstraints;
  let cash = portfolio.cash;
  let positions = (portfolio.positions || []).map(p => ({ ...p }));
  const newTrades = [];
  const cashMin = (portfolio.capital_initial || 0) * 0.05;

  for (const d of (decisions || [])) {
    if (d.action === "HOLD" || !d.quantite || d.quantite <= 0) continue;
    const prix = prices[d.ticker] || d.cours || 0;
    if (!prix) continue;

    if (d.action === "BUY") {
      const isETF = !!BOURSOMARKETS_ETFS[d.ticker];
      const minReq = isETF ? Math.max(minOrdre, minOrdreETF) : minOrdre;
      // Ajuster la quantité pour atteindre le minimum si nécessaire
      let qty = d.quantite;
      if (minReq > 0 && qty * prix < minReq) qty = Math.ceil(minReq / prix);
      if (!fractionne) qty = Math.floor(qty);
      if (qty <= 0) continue;
      const montant = qty * prix;
      if (montant < minReq) continue;
      if (!fractionne && !Number.isInteger(qty)) continue;
      const fee = calcFee(d.ticker, montant, courtierConstraints);
      if (montant + fee > cash - cashMin) continue;
      cash -= (montant + fee);
      const existing = positions.find(p => p.ticker === d.ticker);
      if (existing) {
        const tot = existing.quantite + qty;
        existing.prix_achat_moyen = (existing.prix_achat_moyen * existing.quantite + prix * qty) / tot;
        existing.quantite = tot;
        existing.dernier_cours = prix;
      } else {
        positions.push({ ticker: d.ticker, nom: d.nom, isin: d.isin || TICKER_ISIN_MAP[d.ticker] || "", quantite: qty, prix_achat_moyen: prix, dernier_cours: prix });
      }
      newTrades.push({ date: new Date().toISOString(), action: "BUY", ticker: d.ticker, nom: d.nom, quantite: qty, prix, montant, frais: fee, raison: d.raison || "" });
    } else if (d.action === "SELL") {
      const existing = positions.find(p => p.ticker === d.ticker);
      if (!existing || existing.quantite < d.quantite) continue;
      const montant = d.quantite * prix;
      const fee = calcFee(d.ticker, montant, courtierConstraints);
      cash += (montant - fee);
      existing.quantite -= d.quantite;
      existing.dernier_cours = prix;
      if (existing.quantite === 0) positions = positions.filter(p => p.ticker !== d.ticker);
      newTrades.push({ date: new Date().toISOString(), action: "SELL", ticker: d.ticker, nom: d.nom, quantite: d.quantite, prix, montant, frais: fee, raison: d.raison || "" });
    }
  }

  positions.forEach(p => { if (prices[p.ticker]) p.dernier_cours = prices[p.ticker]; });

  // Stop-loss automatique : vente forcée si position en perte > 15% depuis PRU
  const STOP_LOSS_THRESHOLD = 0.15;
  for (const p of [...positions]) {
    const cours = prices[p.ticker] || p.dernier_cours || p.prix_achat_moyen;
    const perte = (cours - p.prix_achat_moyen) / (p.prix_achat_moyen || 1);
    if (perte < -STOP_LOSS_THRESHOLD) {
      const montant = p.quantite * cours;
      const fee = calcFee(p.ticker, montant, courtierConstraints);
      cash += montant - fee;
      positions = positions.filter(pos => pos.ticker !== p.ticker);
      newTrades.push({ date: new Date().toISOString(), action: "STOP_LOSS", ticker: p.ticker, nom: p.nom, quantite: p.quantite, prix: cours, montant, frais: fee, raison: `🛑 Stop-loss : -${Math.abs(perte * 100).toFixed(1)}% depuis PRU ${p.prix_achat_moyen.toFixed(2)}€` });
    }
  }

  const valeur = cash + positions.reduce((s, p) => s + p.quantite * (p.dernier_cours || p.prix_achat_moyen), 0);
  const today = new Date().toISOString().slice(0, 10);
  const snapshots = [...(portfolio.snapshots || []).filter(s => s.date !== today), { date: today, valeur }].slice(-365);

  return { ...portfolio, cash, positions, trades: [...newTrades, ...(portfolio.trades || [])].slice(0, 100), snapshots, last_cycle: new Date().toISOString(), _executed: newTrades };
}

// ── Performance chart (SVG, 3 séries normalisées) ────────────────────────────
function PerformanceChart({ aiSnapshots, userSnapshots, benchmarkSnapshots, benchmarkLabel = "MSCI World", inceptionDate, height = 160 }) {
  const W = 600;

  const normalize = (snaps, key = "valeur") => {
    if (!snaps?.length) return [];
    const filtered = snaps.filter(s => s.date >= (inceptionDate || "2000-01-01")).sort((a, b) => a.date.localeCompare(b.date));
    if (filtered.length < 2) return [];
    const base = filtered[0][key];
    if (!base) return [];
    return filtered.map(s => ({ date: s.date, v: (s[key] / base) * 100 }));
  };

  const aiData    = normalize(aiSnapshots);
  const userData  = normalize(userSnapshots);
  const benchData = normalize(benchmarkSnapshots, "prix");

  if (aiData.length < 2) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkSubtle, fontSize: "12px" }}>
        Graphique disponible après le 2e cycle
      </div>
    );
  }

  const allSeries = [...aiData, ...userData, ...benchData];
  const allDates  = [...new Set(allSeries.map(d => d.date))].sort();
  const allVals   = allSeries.map(d => d.v);
  const minV = Math.min(94, ...allVals), maxV = Math.max(106, ...allVals);
  const range = maxV - minV || 1;

  const xOf = (date) => {
    const i = allDates.indexOf(date);
    return i < 0 ? null : (i / Math.max(1, allDates.length - 1)) * W;
  };
  const yOf = (v) => height - 24 - ((v - minV) / range) * (height - 36);
  const pts = (data) => data.map(d => { const x = xOf(d.date); return x === null ? null : `${x.toFixed(1)},${yOf(d.v).toFixed(1)}`; }).filter(Boolean).join(" ");
  const y100 = yOf(100);

  const lastAI    = aiData[aiData.length - 1];
  const lastUser  = userData[userData.length - 1];
  const lastBench = benchData[benchData.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="aiGradFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E3A5F" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="#1E3A5F" stopOpacity="0.01"/>
        </linearGradient>
      </defs>

      {/* Référence 100% */}
      <line x1="0" y1={y100} x2={W} y2={y100} stroke="#CBD5E1" strokeWidth="1" strokeDasharray="4 3"/>
      <text x="4" y={y100 - 4} fontSize="9" fill="#94A3B8" fontFamily="Inter,sans-serif">100%</text>

      {/* Benchmark */}
      {benchData.length > 1 && (
        <polyline points={pts(benchData)} fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="5 3" strokeLinecap="round" strokeLinejoin="round"/>
      )}

      {/* Courbe utilisateur */}
      {userData.length > 1 && (
        <polyline points={pts(userData)} fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      )}

      {/* Courbe IA (avec fill) */}
      {aiData.length > 1 && (() => {
        const firstX = (xOf(aiData[0].date) || 0).toFixed(1);
        const lastX  = (xOf(aiData[aiData.length - 1].date) || 0).toFixed(1);
        return (
          <>
            <polygon points={`${pts(aiData)} ${lastX},${height} ${firstX},${height}`} fill="url(#aiGradFill)"/>
            <polyline points={pts(aiData)} fill="none" stroke="#1E3A5F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </>
        );
      })()}

      {/* Labels dernière valeur */}
      {lastAI && (() => {
        const x = xOf(lastAI.date);
        if (x === null) return null;
        const diff = lastAI.v - 100;
        return <text x={Math.min(x + 4, W - 44)} y={yOf(lastAI.v) - 4} fontSize="9" fill="#1E3A5F" fontWeight="700" fontFamily="Inter,sans-serif">{diff >= 0 ? "+" : ""}{diff.toFixed(1)}%</text>;
      })()}
      {lastUser && userData.length > 1 && (() => {
        const x = xOf(lastUser.date);
        if (x === null) return null;
        const diff = lastUser.v - 100;
        return <text x={Math.min(x + 4, W - 44)} y={yOf(lastUser.v) + 12} fontSize="9" fill="#10B981" fontWeight="700" fontFamily="Inter,sans-serif">{diff >= 0 ? "+" : ""}{diff.toFixed(1)}%</text>;
      })()}
      {lastBench && benchData.length > 1 && (() => {
        const x = xOf(lastBench.date);
        if (x === null) return null;
        const diff = lastBench.v - 100;
        return <text x={Math.min(x + 4, W - 60)} y={yOf(lastBench.v) + 12} fontSize="9" fill="#F59E0B" fontWeight="700" fontFamily="Inter,sans-serif">{diff >= 0 ? "+" : ""}{diff.toFixed(1)}%</text>;
      })()}
    </svg>
  );
}

// ── Empty / Init state ────────────────────────────────────────────────────────
function EmptyState({ onInit, account, error }) {
  const userPositions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === account);
  const profil = load("bourse_profil", DEFAULT_PROFIL);
  const liquidites = account === "PEA" ? (profil.especesPEA || 0) : (profil.especesCTO || 0);
  const valeurPositions = userPositions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const capital = valeurPositions + liquidites;

  return (
    <div style={{ maxWidth: "480px", margin: "48px auto 0", textAlign: "center", animation: "fadeIn 0.3s ease" }}>
      <div style={{ fontSize: "52px", marginBottom: "12px", lineHeight: 1 }}>{getAiEmoji()}</div>
      <div style={{ fontSize: "22px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", marginBottom: "10px" }}>
        {getAiName() || "Portefeuille IA"}
      </div>
      <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: 1.7, marginBottom: "28px" }}>
        {getAiName() || "L'IA"} reprend votre portefeuille réel et vos liquidités, puis gère de façon autonome. {getAiName() ? `${getAiName()} tourne` : "Elle tourne"} 3 fois par jour — à l'ouverture, à midi et avant la clôture — avec les mêmes contraintes que vous : courtier, horaires Euronext, {account}.
      </div>

      {capital > 0 && (
        <div style={{ background: "linear-gradient(135deg, rgba(30,58,95,0.07), rgba(30,58,95,0.03))", border: "1px solid rgba(30,58,95,0.14)", borderRadius: "18px", padding: "22px 24px", marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>Point de départ — miroir {account}</div>
          <div style={{ fontSize: "32px", fontWeight: "900", color: C.ink, letterSpacing: "-0.04em" }}>{fmtEur(capital)}</div>
          <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "5px" }}>
            {fmtEur(capital - liquidites)} en positions · {fmtEur(liquidites)} de liquidités
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#B91C1C" }}>
          {error}
        </div>
      )}

      <button onClick={onInit} style={{ padding: "14px 36px", borderRadius: "14px", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", color: "#fff", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "700", fontFamily: "Inter,sans-serif", boxShadow: "0 6px 24px rgba(30,58,95,0.35)", transition: "transform 0.18s" }}
        onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
        onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
        Activer le Portefeuille IA →
      </button>

      <div style={{ marginTop: "20px", fontSize: "11px", color: C.inkSubtle, lineHeight: 1.7 }}>
        Cycles automatiques à 9h05 (ouverture), 12h30 (midi) et 17h15 (clôture), jours ouvrés.<br/>
        {profil.dcaMensuel > 0 && <>DCA de <strong>{fmtEur(profil.dcaMensuel)}</strong> injecté automatiquement le 1er de chaque mois.<br/></>}
        Déclenchez aussi un cycle manuellement à tout moment.
      </div>
    </div>
  );
}

// Paris time helper — sv-SE outputs "YYYY-MM-DD HH:MM:SS", clean to parse
function getParisTime() {
  const now = new Date();
  const s = now.toLocaleString("sv-SE", { timeZone: "Europe/Paris" }); // "2026-05-28 11:30:00"
  const [date, time] = s.split(" ");
  const [h, m] = time.split(":").map(Number);
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(now);
  return { h, m, todayParis: date, isWeekend: dow === "Sat" || dow === "Sun" };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AIPortfolioTab({ account, hidden }) {
  const [aiPf, setAiPf]         = useState(() => load(aiPfKey(account), null));
  const [cycling, setCycling]   = useState(false);
  const [cycleLog, setCycleLog] = useState(null);
  const [error, setError]       = useState(null);
  const [prices, setPrices]     = useState({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Reload correct portfolio when account switches (PEA ↔ CTO)
  useEffect(() => {
    setAiPf(load(aiPfKey(account), null));
    setCycleLog(null);
    setError(null);
    setPrices({});
  }, [account]);

  // Refresh current position prices on mount / account change
  useEffect(() => {
    if (!aiPf?.positions?.length) return;
    setLoadingPrices(true);
    fetchBatchPrices(aiPf.positions.map(p => p.ticker))
      .then(p => setPrices(p))
      .catch(() => {})
      .finally(() => setLoadingPrices(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInit = useCallback(() => {
    const userPositions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === account);
    const profil = load("bourse_profil", DEFAULT_PROFIL);
    const liquidites = account === "PEA" ? (profil.especesPEA || 0) : (profil.especesCTO || 0);
    const valeurPositions = userPositions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
    const capital = valeurPositions + liquidites;
    if (capital <= 0) {
      setError("Ajoutez d'abord des positions à votre portefeuille pour définir le capital de départ.");
      return;
    }
    const aiPositions = userPositions.map(p => ({
      ticker: resolveTickerFromCache(p),
      nom: p.nom,
      isin: p.isin || "",
      quantite: p.quantite,
      prix_achat_moyen: p.pru,
      dernier_cours: p.dernierCours || p.pru,
    }));
    const today = new Date().toISOString().slice(0, 10);
    const newPf = {
      active: true, account, inception_date: today,
      capital_initial: Math.round(capital * 100) / 100,
      cash: Math.round(liquidites * 100) / 100,
      positions: aiPositions, trades: [],
      snapshots: [{ date: today, valeur: capital }],
      last_cycle: null, strategie_courante: null,
      last_morning_cycle: null, last_evening_cycle: null,
      last_dca_date: null,
      last_synced_liquidites: Math.round(liquidites * 100) / 100,
    };
    setAiPf(newPf);
    save(aiPfKey(account), newPf);
    setError(null);
  }, [account]);

  const handleRunCycle = useCallback(async (session = null) => {
    if (!aiPf || cycling) return;
    setCycling(true);
    setError(null);
    setCycleLog(null);

    // Charger le profil une seule fois
    const profil = load("bourse_profil", DEFAULT_PROFIL);

    // DCA mensuel : injecter l'apport le 1er de chaque mois
    const { todayParis } = getParisTime();
    const currentMonth = todayParis.slice(0, 7); // "YYYY-MM"
    const isFirstOfMonth = todayParis.slice(8, 10) === "01";
    const dcaMensuel = profil.dcaMensuel || 0;

    // Copie propre pour éviter toute référence circulaire React sur l'objet state
    let workingPf = JSON.parse(safeStringify(aiPf));
    let dcaInjected = false;

    if (isFirstOfMonth && dcaMensuel > 0 && workingPf.last_dca_date !== currentMonth) {
      workingPf = {
        ...workingPf,
        cash: workingPf.cash + dcaMensuel,
        last_dca_date: currentMonth,
        trades: [
          { date: new Date().toISOString(), action: "DCA", ticker: "—", nom: "Apport mensuel DCA", quantite: 0, prix: 0, montant: dcaMensuel, raison: `Versement DCA du 1er ${currentMonth} — +${dcaMensuel}€` },
          ...(workingPf.trades || [])
        ].slice(0, 100),
      };
      dcaInjected = true;
      setAiPf(workingPf);
      save(aiPfKey(account), workingPf);
    }

    // Sync liquidités réelles : si l'utilisateur a ajouté du cash sur son compte
    const currentLiquidites = account === "PEA" ? (profil.especesPEA || 0) : (profil.especesCTO || 0);
    const lastSynced = workingPf.last_synced_liquidites ?? null;
    const deltaLiquidites = lastSynced !== null ? Math.round((currentLiquidites - lastSynced) * 100) / 100 : 0;

    if (deltaLiquidites > 1) {
      workingPf = {
        ...workingPf,
        cash: Math.round((workingPf.cash + deltaLiquidites) * 100) / 100,
        last_synced_liquidites: currentLiquidites,
        trades: [
          { date: new Date().toISOString(), action: "DEPOT", ticker: "—", nom: "Liquidités synchronisées", quantite: 0, prix: 0, montant: deltaLiquidites, raison: `Nouveaux fonds détectés sur le ${account} — +${fmtEur(deltaLiquidites)}` },
          ...(workingPf.trades || [])
        ].slice(0, 100),
      };
      setAiPf(workingPf);
      save(aiPfKey(account), workingPf);
    } else if (lastSynced === null) {
      // Premier cycle : mémoriser la valeur de référence
      workingPf = { ...workingPf, last_synced_liquidites: currentLiquidites };
      save(aiPfKey(account), workingPf);
    }

    try {
      // 1. Fetch current prices for all universe symbols + current positions
      const PEA_TICKERS = [
        // ETFs BoursoMarkets
        "CW8.PA","EWLD.PA","PUST.PA","LYPS.PA","PANX.PA","PAEEM.PA","PCEU.PA","RS2K.PA","AASI.PA",
        // France CAC40/SBF120
        "MC.PA","RMS.PA","KER.PA","OR.PA","AI.PA","SU.PA","LR.PA","SGO.PA","DG.PA",
        "SAF.PA","AIR.PA","HO.PA","AM.PA","TTE.PA","ENGI.PA","VIE.PA",
        "SAN.PA","EL.PA","BIOR.PA","ERF.PA","VIRP.PA",
        "BNP.PA","GLE.PA","ACA.PA","AXA.PA",
        "CAP.PA","DSY.PA","PUB.PA","EDEN.PA","TEP.PA","STMPA.PA","SOI.PA",
        "ORA.PA","VIV.PA","ML.PA","RNO.PA","ALO.PA","CA.PA","UBI.PA",
        // Netherlands
        "ASML.AS","ADYEN.AS","BESI.AS","MT.AS","HEIA.AS","WKL.AS","INGA.AS",
        "ABN.AS","AKZA.AS","RAND.AS","IMCD.AS","NN.AS","PHIA.AS",
        // Germany
        "SAP.DE","SIE.DE","ALV.DE","ADS.DE","IFX.DE","BAS.DE","MRK.DE","DTE.DE","DHL.DE","BAYN.DE",
        // Spain
        "ITX.MC","IBE.MC","SAN.MC",
        // Belgium
        "UCB.BR","ABI.BR","KBC.BR",
      ];
      const CTO_EXTRA_TICKERS = [
        // ETFs World non-PEA
        "IWDA.AS","CSPX.AS","EQQQ.AS","VWCE.DE","VUSA.AS",
        // US Tech
        "NVDA","MSFT","AAPL","AMZN","GOOGL","META","TSLA","AVGO","TSM","ORCL","CRM","AMD","PLTR",
        // US Finance
        "JPM","BRK-B","V","MA","GS",
        // US Santé
        "LLY","UNH","JNJ","NVO",
        // US Consumer/Défense
        "COST","WMT","RTX","LMT",
        // UK
        "AZN.L","SHEL.L","HSBA.L","BP.L","RIO.L","ARM.L",
      ];
      const universeTickers = account === "CTO"
        ? [...PEA_TICKERS, ...CTO_EXTRA_TICKERS]
        : PEA_TICKERS;
      const allTickers = [...new Set([...universeTickers, ...(workingPf.positions || []).map(p => p.ticker)])];
      const freshPrices = await fetchBatchPrices(allTickers);
      setPrices(freshPrices);

      if (Object.keys(freshPrices).length < 5) {
        throw new Error("Impossible de récupérer les cours. Vérifiez votre connexion et réessayez.");
      }

      // 2. Call AI decision endpoint
      const courtierKey = getCourtierForAccount(profil, account);
      const courtierObj = COURTIERS[courtierKey] || COURTIERS.boursobank;
      const courtier_info = COURTIERS_DETAIL[courtierKey] || COURTIERS_DETAIL.boursobank;
      const autopilotRaw = load(`bourse_autopilot_last_${account}_${profil.risque || "equilibre"}`, null);
      const autopilot_context = autopilotRaw ? {
        resume: autopilotRaw.resume || null,
        score_marche: autopilotRaw.score_marche || null,
        opportunites: (autopilotRaw.opportunites || []).slice(0, 5).map(o => `${o.nom} (${o.symbol}) — ${o.signal || ""} — ${o.raison || ""}`),
        generated_at: autopilotRaw.generatedAt || null,
      } : null;

      // Contexte app complet
      const marketScoring = (() => { try { return JSON.parse(localStorage.getItem("bourse_market_scoring") || "[]"); } catch { return []; } })();
      const userPositions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === account);
      const snapshots = load("bourse_snapshots", []).slice(-20);
      const recentTrades = load("bourse_avis_operes", []).filter(o => (o.compte || "PEA") === account).slice(-15);
      const dividendes = load("bourse_dividendes", []).filter(d => (d.compte || "PEA") === account).slice(-10);
      const allocCible = load(`bourse_autopilot_alloc_${account}_${profil.risque || "equilibre"}`, null);

      // Actualités marché (Google News — 5 headlines max, silencieux si échec)
      let actualites = [];
      try {
        const newsRaw = await Promise.race([
          fetchGoogleNewsRSS("bourse CAC40 marchés financiers"),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000))
        ]);
        actualites = (newsRaw || []).slice(0, 5).map(n => `• ${n.title}`);
      } catch {}

      const app_context = {
        profil_investisseur: {
          risque: profil.risque || "equilibre",
          horizon: profil.horizon || "moyen",
          versements_pea: profil.versementsPEA || 0,
          versements_cto: profil.versementsCTO || 0,
          objectif: profil.objectif || null,
        },
        allocation_cible: allocCible || null,
        portefeuille_reel: userPositions.map(p => ({
          nom: p.nom, ticker: resolveTickerFromCache(p),
          quantite: p.quantite, pru: p.pru,
          cours: p.dernierCours || p.pru,
          perf_pct: p.pru > 0 ? +((((p.dernierCours || p.pru) - p.pru) / p.pru) * 100).toFixed(2) : 0,
        })),
        scoring_marche: marketScoring.slice(0, 10).map(s => `${s.nom} — ${s.signal || "?"} (${s.score_marche || "?"}/20) — ${s.resume || ""}`),
        historique_valeur: snapshots.map(s => `${s.date}: ${s.valeur?.toFixed(0)}€`),
        transactions_recentes: recentTrades.map(o => `${o.date} ${o.type} ${o.quantite}×${o.titre} à ${o.prixUnitaire}€`),
        dividendes_recus: dividendes.map(d => `${d.date} ${d.titre}: +${d.montant}€`),
        actualites_marche: actualites,
      };

      // Journal : mettre à jour les cours des positions OPEN avant l'appel IA
      const journalKey = `bourse_ai_journal_${account}`;
      const existingJournal = load(journalKey, []);
      const journalWithUpdatedPrices = existingJournal.map(e => {
        if (e.statut !== "OPEN" || !freshPrices[e.ticker]) return e;
        const pv_pct = +((freshPrices[e.ticker] - e.cours_entree) / e.cours_entree * 100).toFixed(2);
        return { ...e, cours_actuel: freshPrices[e.ticker], pv_pct };
      });

      const res = await fetch("/api/ai-portfolio-decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: safeStringify({ portfolio: workingPf, prices: freshPrices, account, session_type: session, courtier_info, dca_injected: dcaInjected, dca_amount: dcaInjected ? dcaMensuel : 0, courtier_min_ordre: courtierObj.minOrdre, courtier_min_etf: courtierObj.minOrdreETF, claude_key: getKey("anthropic") || undefined, gemini_key: getKey("gemini") || undefined, autopilot_context, app_context, market_open: getMarketStatus(MARKETS_CFG.find(m => m.id === "paris")).open, decision_journal: journalWithUpdatedPrices.slice(0, 15) }),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur serveur ${res.status}`);
      }
      const { decisions, strategie } = await res.json();
      if (!decisions) throw new Error("Réponse IA invalide");

      // 3. Apply trades locally (enforce courtier constraints)
      const updatedPf = applyDecisions(workingPf, decisions, freshPrices, courtierObj);
      updatedPf.strategie_courante = strategie || updatedPf.strategie_courante;
      const now = new Date().toISOString();
      if (session === "OUVERTURE") updatedPf.last_morning_cycle = now;
      else if (session === "MIDI") updatedPf.last_noon_cycle = now;
      else if (session === "CLÔTURE") updatedPf.last_evening_cycle = now;

      // 4. Mettre à jour le journal de décisions
      const executed = updatedPf._executed || [];
      const soldTickers = executed.filter(t => t.action === "SELL").map(t => t.ticker);
      const nowDate = now.slice(0, 10);
      const parisHeure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(now));

      const closedJournal = journalWithUpdatedPrices.map(e =>
        e.statut === "OPEN" && e.action === "BUY" && soldTickers.includes(e.ticker)
          ? { ...e, statut: "CLOSED", closed_at: nowDate }
          : e
      );
      const newEntries = executed.map((t, i) => ({
        id: Date.now() + i,
        date: nowDate,
        heure: parisHeure,
        session,
        action: t.action,
        ticker: t.ticker,
        nom: t.nom,
        quantite: t.quantite,
        cours_entree: t.prix,
        raison: t.raison || "",
        cours_actuel: t.prix,
        pv_pct: 0,
        statut: t.action === "BUY" ? "OPEN" : "CLOSED",
      }));
      const newJournal = [...newEntries, ...closedJournal].slice(0, 50);
      save(journalKey, newJournal);

      // Snapshot benchmark (CW8.PA PEA / IWDA.AS CTO)
      const benchTicker = account === "CTO" ? "IWDA.AS" : "CW8.PA";
      const benchPrice  = freshPrices[benchTicker];
      if (benchPrice) {
        const bSnaps = [...(updatedPf.benchmark_snapshots || []).filter(s => s.date !== nowDate), { date: nowDate, prix: benchPrice }].slice(-365);
        updatedPf.benchmark_snapshots = bSnaps;
      }

      setAiPf(updatedPf);
      save(aiPfKey(account), updatedPf);
      setCycleLog({ decisions, strategie, session, dca_injected: dcaInjected, dca_amount: dcaInjected ? dcaMensuel : 0 });
    } catch (e) {
      setError(e.message);
    } finally {
      setCycling(false);
    }
  }, [aiPf, cycling, account]);

  // Auto-trigger 3x/jour : 9h05 (ouverture), 12h30 (midi), 17h15 (clôture) — Paris, jours ouvrés
  useEffect(() => {
    if (!aiPf) return;
    const check = () => {
      if (cycling) return;
      const { h, m, todayParis, isWeekend } = getParisTime();
      if (isWeekend) return;
      if (h === 9 && m >= 5 && m <= 20 && !aiPf.last_morning_cycle?.startsWith(todayParis)) handleRunCycle("OUVERTURE");
      else if (h === 12 && m >= 30 && m <= 45 && !aiPf.last_noon_cycle?.startsWith(todayParis)) handleRunCycle("MIDI");
      else if (h === 17 && m >= 15 && m <= 30 && !aiPf.last_evening_cycle?.startsWith(todayParis)) handleRunCycle("CLÔTURE");
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [aiPf, cycling, handleRunCycle]);

  const handleReset = () => {
    if (!window.confirm("Réinitialiser le Portefeuille IA ? Toutes les données (trades, performance) seront perdues.")) return;
    setAiPf(null);
    save(aiPfKey(account), null);
    setCycleLog(null);
    setError(null);
    setPrices({});
  };

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!aiPf) return <EmptyState onInit={handleInit} account={account} error={error} />;

  // ── Derived values ──────────────────────────────────────────────────────────
  const val  = totalValue(aiPf, prices);
  const perf = aiPf.capital_initial > 0 ? ((val - aiPf.capital_initial) / aiPf.capital_initial) * 100 : 0;

  const userSnaps = (() => {
    const all = load("bourse_snapshots", []);
    return aiPf.inception_date ? all.filter(s => s.date >= aiPf.inception_date) : all;
  })();

  const userPerf = (() => {
    // Snapshots disponibles : perf depuis inception IA
    if (userSnaps.length >= 2) {
      const base = userSnaps[0].valeur, last = userSnaps[userSnaps.length - 1].valeur;
      return base > 0 ? ((last - base) / base) * 100 : null;
    }
    // Fallback : perf calculée depuis les positions réelles vs capital initial IA
    if (aiPf.capital_initial > 0) {
      const realPositions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === account);
      const currentUserVal = realPositions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0)
        + (account === "PEA" ? (load("bourse_profil", {}).especesPEA || 0) : (load("bourse_profil", {}).especesCTO || 0));
      return ((currentUserVal - aiPf.capital_initial) / aiPf.capital_initial) * 100;
    }
    return null;
  })();

  const fp = (p, fallback = "—") => p === null || p === undefined ? fallback : (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
  const perfColor = (p) => p === null ? C.inkMuted : p >= 0 ? "#059669" : "#DC2626";

  const nextCycleLabel = (() => {
    try {
      const { h, m, todayParis, isWeekend } = getParisTime();
      const morningDone = aiPf?.last_morning_cycle?.startsWith(todayParis);
      const noonDone    = aiPf?.last_noon_cycle?.startsWith(todayParis);
      const eveningDone = aiPf?.last_evening_cycle?.startsWith(todayParis);
      if (!isWeekend && (h < 9 || (h === 9 && m < 5)) && !morningDone) return "aujourd'hui à 9h05";
      if (!isWeekend && (h < 12 || (h === 12 && m < 30)) && !noonDone) return "aujourd'hui à 12h30";
      if (!isWeekend && (h < 17 || (h === 17 && m < 15)) && !eveningDone) return "aujourd'hui à 17h15";
      const next = new Date();
      do { next.setDate(next.getDate() + 1); } while (["Sat","Sun"].includes(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(next)));
      return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(next) + " à 9h05";
    } catch { return "prochain jour ouvré à 9h05"; }
  })();

  const inceptionFmt = aiPf.inception_date
    ? new Date(aiPf.inception_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "24px", lineHeight: 1 }}>{getAiEmoji()}</span>
            <span style={{ fontSize: "20px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>{getAiName() || "NextGen IA"}</span>
            <span style={{ fontSize: "10px", fontWeight: "800", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", color: "#C1E8FF", borderRadius: "6px", padding: "3px 8px", letterSpacing: "0.5px" }}>AUTO</span>
          </div>
          <div style={{ fontSize: "12px", color: C.inkMuted, marginTop: "3px" }}>
            Depuis le {inceptionFmt} · Capital {fmtEur(aiPf.capital_initial)} · {account}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button onClick={handleRunCycle} disabled={cycling}
            style={{ padding: "9px 18px", borderRadius: "10px", border: "none", cursor: cycling ? "default" : "pointer", fontSize: "12px", fontWeight: "700", fontFamily: "Inter,sans-serif", display: "flex", alignItems: "center", gap: "7px", background: cycling ? C.snowDim : "linear-gradient(135deg, #2D6CB5, #4B9DD8, #2D6CB5)", color: cycling ? C.inkMuted : "#fff", transition: "all 0.18s" }}>
            {cycling
              ? <><AppLogo size={16} animated={true} /> Analyse en cours…</>
              : "▶ Lancer un cycle"}
          </button>
          <button onClick={handleReset} title="Réinitialiser le portefeuille IA"
            style={{ width: "34px", height: "34px", borderRadius: "10px", background: C.snowDim, border: `1px solid ${C.border}`, cursor: "pointer", fontSize: "14px", color: C.inkMuted, transition: "all 0.15s" }}>↺</button>
        </div>
      </div>

      {/* ── Marché fermé ── */}
      {!getMarketStatus(MARKETS_CFG.find(m => m.id === "paris")).open && (
        <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: "12px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: "#92400E", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>⚠️</span>
          <span>Marché Paris fermé — un cycle lancé maintenant analysera le portefeuille mais n'exécutera aucun trade jusqu'à la prochaine ouverture.</span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "12px", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#B91C1C", lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {/* ── KPI row ── */}
      <div className="ba-g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "24px" }}>
        {[
          {
            label: "Valeur IA",
            value: hidden ? "••••" : fmtEur(val),
            sub: fp(perf),
            subColor: perfColor(perf),
          },
          {
            label: "Cash dispo",
            value: hidden ? "••••" : fmtEur(aiPf.cash),
            sub: `${aiPf.capital_initial > 0 ? ((aiPf.cash / aiPf.capital_initial) * 100).toFixed(0) : 0}% du capital`,
          },
          {
            label: "vs Votre portefeuille",
            value: userPerf !== null ? fp(perf - userPerf) : "—",
            sub: `IA ${fp(perf)} · Vous ${fp(userPerf)}`,
            subColor: userPerf !== null ? perfColor(perf - userPerf) : C.inkMuted,
          },
          {
            label: "Positions · Trades",
            value: `${aiPf.positions.length} · ${aiPf.trades?.length || 0}`,
            sub: aiPf.last_cycle ? `Dernier cycle ${new Date(aiPf.last_cycle).toLocaleDateString("fr-FR")}` : "Aucun cycle",
          },
        ].map(({ label, value, sub, subColor }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.72)", border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px", backdropFilter: "blur(8px)" }}>
            <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>{label}</div>
            <div style={{ fontSize: "18px", fontWeight: "800", color: C.ink, letterSpacing: "-0.01em" }}>{value}</div>
            {sub && <div style={{ fontSize: "11px", color: subColor || C.inkMuted, marginTop: "3px", fontWeight: "500" }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Chart ── */}
      {aiPf.snapshots?.length >= 2 && (
        <div style={{ background: "rgba(255,255,255,0.72)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 20px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>Performance comparée</span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#1E3A5F", fontWeight: "600" }}>
              <span style={{ width: "18px", height: "2.5px", background: "#1E3A5F", borderRadius: "2px", display: "inline-block" }}/>IA
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#10B981", fontWeight: "600" }}>
              <span style={{ width: "18px", height: "2px", background: "#10B981", borderRadius: "2px", display: "inline-block" }}/>Vous
            </span>
            {aiPf.benchmark_snapshots?.length >= 2 && (
              <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#F59E0B", fontWeight: "600" }}>
                <span style={{ width: "18px", height: "0px", borderTop: "2px dashed #F59E0B", display: "inline-block" }}/>{account === "CTO" ? "MSCI World" : "MSCI World"}
              </span>
            )}
            {loadingPrices && <span style={{ fontSize: "11px", color: C.inkSubtle }}>actualisation…</span>}
          </div>
          <PerformanceChart aiSnapshots={aiPf.snapshots} userSnapshots={userSnaps} benchmarkSnapshots={aiPf.benchmark_snapshots} inceptionDate={aiPf.inception_date} />
        </div>
      )}

      {/* ── Stratégie actuelle ── */}
      {aiPf.strategie_courante && (
        <div style={{ background: "linear-gradient(135deg,rgba(30,58,95,0.07),rgba(30,58,95,0.02))", border: "1px solid rgba(30,58,95,0.13)", borderRadius: "14px", padding: "14px 18px", marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", fontWeight: "700", color: "#1E3A5F", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "5px" }}>Stratégie en cours</div>
          <div style={{ fontSize: "13px", color: C.ink, lineHeight: 1.55 }}>{aiPf.strategie_courante}</div>
        </div>
      )}

      {/* ── Positions + Trades ── */}
      <div style={{ display: "grid", gridTemplateColumns: aiPf.positions.length > 0 && aiPf.trades?.length > 0 ? "1fr 1fr" : "1fr", gap: "20px", marginBottom: "20px" }}>

        {/* Positions */}
        {aiPf.positions.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.72)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink, marginBottom: "12px" }}>
              Positions ({aiPf.positions.length})
              <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: "500", color: C.inkMuted }}>
                {hidden ? "••••" : fmtEur(val - aiPf.cash)} investis
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              {[...aiPf.positions].sort((a, b) => {
                const va = a.quantite * (prices[a.ticker] || a.dernier_cours || a.prix_achat_moyen);
                const vb = b.quantite * (prices[b.ticker] || b.dernier_cours || b.prix_achat_moyen);
                return vb - va;
              }).map(p => {
                const cours = prices[p.ticker] || p.dernier_cours || p.prix_achat_moyen;
                const pvPct = ((cours - p.prix_achat_moyen) / (p.prix_achat_moyen || 1)) * 100;
                const valPos = p.quantite * cours;
                const pctPf  = val > 0 ? (valPos / val) * 100 : 0;
                return (
                  <div key={p.ticker} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 11px", background: C.snowDim, borderRadius: "10px" }}>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{p.nom}</div>
                      <div style={{ fontSize: "10px", color: C.inkMuted, marginTop: "1px" }}>
                        <a href={`https://finance.yahoo.com/lookup?s=${p.isin || TICKER_ISIN_MAP[p.ticker] || p.ticker}`} target="_blank" rel="noopener noreferrer" style={{ color: C.inkMuted, textDecoration: "underline", textDecorationStyle: "dotted" }}>{p.ticker}</a>
                        {" · "}{p.quantite} titres · {pctPf.toFixed(0)}% PF
                      </div>
                      <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px" }}>
                        Cours {hidden ? "••••" : fmtEur(cours)} · PRU {hidden ? "••••" : fmtEur(p.prix_achat_moyen)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{hidden ? "••••" : fmtEur(valPos)}</div>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: pvPct >= 0 ? "#059669" : "#DC2626" }}>
                        {pvPct >= 0 ? "+" : ""}{pvPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trades history */}
        {aiPf.trades?.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.72)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink, marginBottom: "12px" }}>Historique des trades</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "300px", overflowY: "auto" }}>
              {aiPf.trades.slice(0, 20).map((t, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "7px 9px", borderRadius: "9px", background: "#F8F9FA" }}>
                  <span style={{ flexShrink: 0, fontSize: "9px", fontWeight: "800", padding: "3px 6px", borderRadius: "5px", marginTop: "1px",
                    background: t.action === "BUY" ? "rgba(5,150,105,0.1)" : t.action === "DCA" || t.action === "DEPOT" ? "rgba(30,58,95,0.1)" : t.action === "STOP_LOSS" ? "rgba(234,179,8,0.15)" : "rgba(220,38,38,0.08)",
                    color: t.action === "BUY" ? "#059669" : t.action === "DCA" || t.action === "DEPOT" ? "#1E3A5F" : t.action === "STOP_LOSS" ? "#92400E" : "#DC2626" }}>
                    {t.action === "BUY" ? "ACHAT" : t.action === "DCA" ? "DCA" : t.action === "DEPOT" ? "DÉPÔT" : t.action === "STOP_LOSS" ? "STOP" : "VENTE"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", color: C.ink }}>
                      {t.nom}
                      {t.quantite > 0 && <span style={{ fontWeight: "400", color: C.inkMuted }}> ×{t.quantite} @ {fmtEur(t.prix)}</span>}
                      {t.montant > 0 && t.quantite === 0 && <span style={{ fontWeight: "600", color: "#1E3A5F" }}> +{fmtEur(t.montant)}</span>}
                    </div>
                    {t.raison && <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px", lineHeight: 1.35 }}>{t.raison}</div>}
                    <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "1px", display: "flex", gap: "8px" }}>
                      <span>{new Date(t.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                      {t.frais === 0 && (t.action === "BUY" || t.action === "SELL") && <span style={{ color: "#059669", fontWeight: "700" }}>0€ frais BM</span>}
                      {t.frais > 0 && <span>{fmtEur(t.frais)} frais</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Empty portfolio (no positions yet) ── */}
      {aiPf.positions.length === 0 && aiPf.trades?.length === 0 && !cycling && (
        <div style={{ textAlign: "center", padding: "32px", background: "rgba(255,255,255,0.6)", border: `1px solid ${C.border}`, borderRadius: "16px", marginBottom: "20px" }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>💤</div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: C.ink, marginBottom: "6px" }}>Aucune position pour l'instant</div>
          <div style={{ fontSize: "12px", color: C.inkMuted }}>Lancez un premier cycle pour que l'IA déploie son capital.</div>
        </div>
      )}

      {/* ── Last cycle decisions ── */}
      {cycleLog?.decisions?.length > 0 && (
        <div style={{ background: "rgba(30,58,95,0.04)", border: "1px solid rgba(30,58,95,0.1)", borderRadius: "16px", padding: "16px 18px", marginBottom: "20px" }}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "#1E3A5F", marginBottom: "10px" }}>
            Décisions du cycle — {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
          </div>

          {cycleLog.dca_injected && cycleLog.dca_amount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "7px 10px", background: "rgba(30,58,95,0.06)", borderRadius: "9px", marginBottom: "8px", fontSize: "12px" }}>
              <span style={{ fontSize: "9px", fontWeight: "800", padding: "2px 6px", borderRadius: "5px", background: "rgba(30,58,95,0.12)", color: "#1E3A5F" }}>DCA</span>
              <span style={{ fontWeight: "600", color: C.ink }}>Apport mensuel injecté</span>
              <span style={{ color: C.inkMuted }}>+{fmtEur(cycleLog.dca_amount)} ajoutés au cash</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {cycleLog.decisions.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "8px", fontSize: "12px" }}>
                <span style={{ flexShrink: 0, fontSize: "9px", fontWeight: "800", padding: "2px 6px", borderRadius: "5px",
                  background: d.action === "BUY" ? "rgba(5,150,105,0.1)" : d.action === "SELL" ? "rgba(220,38,38,0.08)" : "rgba(100,116,139,0.08)",
                  color: d.action === "BUY" ? "#059669" : d.action === "SELL" ? "#DC2626" : C.inkMuted }}>
                  {d.action === "BUY" ? "ACHAT" : d.action === "SELL" ? "VENTE" : "CONSERVER"}
                </span>
                <span style={{ fontWeight: "600", color: C.ink }}>{d.nom}</span>
                {d.quantite > 0 && <span style={{ color: C.inkMuted }}>×{d.quantite}{d.cours ? ` @ ${fmtEur(d.cours)}` : ""}</span>}
                <span style={{ color: C.inkSubtle, flex: 1, fontSize: "11px" }}>— {d.raison}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Journal de décisions ── */}
      {(() => {
        const journal = load(`bourse_ai_journal_${account}`, []);
        if (!journal.length) return null;
        const open   = journal.filter(e => e.statut === "OPEN");
        const closed = journal.filter(e => e.statut === "CLOSED");
        const Entry = ({ e }) => {
          const pvColor = e.pv_pct > 0 ? "#059669" : e.pv_pct < 0 ? "#DC2626" : C.inkMuted;
          const isClosed = e.statut === "CLOSED";
          return (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "9px", background: isClosed ? "rgba(100,116,139,0.04)" : "rgba(255,255,255,0.8)", opacity: isClosed ? 0.7 : 1, fontSize: "11px" }}>
              <span style={{ flexShrink: 0, fontSize: "9px", fontWeight: "800", padding: "2px 6px", borderRadius: "5px",
                background: e.action === "BUY" ? "rgba(5,150,105,0.1)" : "rgba(220,38,38,0.08)",
                color: e.action === "BUY" ? "#059669" : "#DC2626" }}>
                {e.action === "BUY" ? "ACHAT" : "VENTE"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: "700", color: C.ink }}>{e.nom}</span>
                <span style={{ color: C.inkMuted }}> ×{e.quantite} @ {fmtEur(e.cours_entree)}</span>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {e.pv_pct != null && (
                  <div style={{ fontSize: "11px", fontWeight: "700", color: pvColor }}>
                    {e.pv_pct >= 0 ? "+" : ""}{e.pv_pct}%
                  </div>
                )}
                <div style={{ fontSize: "9px", color: C.inkSubtle }}>{e.date} · {e.session}</div>
              </div>
              {isClosed && <span style={{ fontSize: "9px", color: C.inkSubtle, flexShrink: 0 }}>Clôturé</span>}
            </div>
          );
        };
        return (
          <div style={{ background: "rgba(255,255,255,0.72)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>Journal de décisions</div>
                <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px" }}>{open.length} position{open.length > 1 ? "s" : ""} ouverte{open.length > 1 ? "s" : ""} · {closed.length} clôturée{closed.length > 1 ? "s" : ""}</div>
              </div>
              <button onClick={() => { save(`bourse_ai_journal_${account}`, []); setAiPf(pf => ({ ...pf })); }}
                style={{ fontSize: "10px", color: C.inkSubtle, background: "none", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "4px 9px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                Effacer
              </button>
            </div>
            {open.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: closed.length ? "10px" : 0 }}>
                {open.map(e => <Entry key={e.id} e={e} />)}
              </div>
            )}
            {closed.length > 0 && (
              <>
                <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", margin: "8px 0 6px" }}>Décisions clôturées</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {closed.slice(0, 10).map(e => <Entry key={e.id} e={e} />)}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Cron info footer ── */}
      <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.5)", border: `1px solid ${C.border}`, borderRadius: "12px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ fontSize: "12px", color: C.inkMuted }}>
          <span>{getAiEmoji()} Cycle automatique : <strong>9h05 · 12h30 · 17h15 (Paris, jours ouvrés)</strong></span>
          <span style={{ marginLeft: "16px" }}>Prochain : <strong>{nextCycleLabel}</strong></span>
          {(() => {
            const dcaAmt = load("bourse_profil", DEFAULT_PROFIL).dcaMensuel || 0;
            if (!dcaAmt) return null;
            const lastDca = aiPf.last_dca_date;
            const { todayParis } = getParisTime();
            const currentMonth = todayParis.slice(0, 7);
            const dcaDone = lastDca === currentMonth;
            return (
              <span style={{ marginLeft: "16px" }}>
                💳 DCA <strong>{fmtEur(dcaAmt)}/mois</strong>
                {dcaDone
                  ? <span style={{ color: "#059669", marginLeft: "4px" }}>✓ injecté ce mois</span>
                  : <span style={{ color: C.inkSubtle, marginLeft: "4px" }}>· le 1er du mois</span>
                }
              </span>
            );
          })()}
        </div>
        {aiPf.last_cycle && (
          <span style={{ fontSize: "11px", color: C.inkSubtle }}>
            Dernier : {new Date(aiPf.last_cycle).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

    </div>
  );
}
