import { useState, useEffect, useCallback } from "react";
import { C } from "../constants/theme";
import { load, save } from "../lib/storage";
import { sanitizePositions, fmtEur } from "../lib/finance";
import { getKey } from "../lib/api";
import { COURTIERS, COURTIERS_DETAIL, BOURSOMARKETS_ETFS, getCourtierForAccount } from "../constants/courtiers";
import { DEFAULT_PROFIL } from "../constants/config";

const aiPfKey = (account) => `bourse_ai_portfolio_${account || "PEA"}`;

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
      const montant = d.quantite * prix;
      const isETF = !!BOURSOMARKETS_ETFS[d.ticker];
      const minReq = isETF ? Math.max(minOrdre, minOrdreETF) : minOrdre;
      if (montant < minReq) continue;
      if (!fractionne && !Number.isInteger(d.quantite)) continue;
      const fee = calcFee(d.ticker, montant, courtierConstraints);
      if (montant + fee > cash - cashMin) continue;
      cash -= (montant + fee);
      const existing = positions.find(p => p.ticker === d.ticker);
      if (existing) {
        const tot = existing.quantite + d.quantite;
        existing.prix_achat_moyen = (existing.prix_achat_moyen * existing.quantite + prix * d.quantite) / tot;
        existing.quantite = tot;
        existing.dernier_cours = prix;
      } else {
        positions.push({ ticker: d.ticker, nom: d.nom, quantite: d.quantite, prix_achat_moyen: prix, dernier_cours: prix });
      }
      newTrades.push({ date: new Date().toISOString(), action: "BUY", ticker: d.ticker, nom: d.nom, quantite: d.quantite, prix, montant, frais: fee, raison: d.raison || "" });
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

  const valeur = cash + positions.reduce((s, p) => s + p.quantite * (p.dernier_cours || p.prix_achat_moyen), 0);
  const today = new Date().toISOString().slice(0, 10);
  const snapshots = [...(portfolio.snapshots || []).filter(s => s.date !== today), { date: today, valeur }].slice(-365);

  return { ...portfolio, cash, positions, trades: [...newTrades, ...(portfolio.trades || [])].slice(0, 100), snapshots, last_cycle: new Date().toISOString() };
}

// ── Performance chart (SVG, 3 séries normalisées) ────────────────────────────
function PerformanceChart({ aiSnapshots, userSnapshots, inceptionDate, height = 160 }) {
  const W = 600;

  const normalize = (snaps) => {
    if (!snaps?.length) return [];
    const filtered = snaps.filter(s => s.date >= (inceptionDate || "2000-01-01")).sort((a, b) => a.date.localeCompare(b.date));
    if (filtered.length < 2) return [];
    const base = filtered[0].valeur;
    if (!base) return [];
    return filtered.map(s => ({ date: s.date, v: (s.valeur / base) * 100 }));
  };

  const aiData   = normalize(aiSnapshots);
  const userData = normalize(userSnapshots);

  if (aiData.length < 2) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkSubtle, fontSize: "12px" }}>
        Graphique disponible après le 2e cycle
      </div>
    );
  }

  const allDates = [...new Set([...aiData, ...userData].map(d => d.date))].sort();
  const allVals  = [...aiData, ...userData].map(d => d.v);
  const minV = Math.min(94, ...allVals), maxV = Math.max(106, ...allVals);
  const range = maxV - minV || 1;

  const xOf = (date) => {
    const i = allDates.indexOf(date);
    return i < 0 ? null : (i / Math.max(1, allDates.length - 1)) * W;
  };
  const yOf = (v) => height - 24 - ((v - minV) / range) * (height - 36);
  const pts = (data) => data.map(d => { const x = xOf(d.date); return x === null ? null : `${x.toFixed(1)},${yOf(d.v).toFixed(1)}`; }).filter(Boolean).join(" ");
  const y100 = yOf(100);

  const lastAI   = aiData[aiData.length - 1];
  const lastUser = userData[userData.length - 1];

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
      <div style={{ fontSize: "52px", marginBottom: "20px", lineHeight: 1 }}>🤖</div>
      <div style={{ fontSize: "22px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", marginBottom: "10px" }}>Portefeuille IA autonome</div>
      <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: 1.7, marginBottom: "28px" }}>
        L'IA reprend votre portefeuille réel et vos liquidités, puis gère de façon autonome. Elle tourne 2 fois par jour — à l'ouverture et avant la clôture — avec les mêmes contraintes que vous : courtier, horaires Euronext, PEA.
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

      <button onClick={onInit} style={{ padding: "14px 36px", borderRadius: "14px", background: "linear-gradient(135deg, #080B0F 0%, #1E3A5F 100%)", color: "#fff", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "700", fontFamily: "Inter,sans-serif", boxShadow: "0 6px 24px rgba(30,58,95,0.35)", transition: "transform 0.18s" }}
        onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
        onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
        Activer le Portefeuille IA →
      </button>

      <div style={{ marginTop: "20px", fontSize: "11px", color: C.inkSubtle, lineHeight: 1.7 }}>
        Cycles automatiques à 9h05 (ouverture) et 17h15 (clôture), jours ouvrés.<br/>
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
      const res = await fetch("/api/ai-portfolio-decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: safeStringify({ portfolio: workingPf, prices: freshPrices, account, session_type: session, courtier_info, dca_injected: dcaInjected, dca_amount: dcaInjected ? dcaMensuel : 0, courtier_min_ordre: courtierObj.minOrdre, courtier_min_etf: courtierObj.minOrdreETF, claude_key: getKey("anthropic") || undefined }),
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
      else if (session === "CLÔTURE") updatedPf.last_evening_cycle = now;

      setAiPf(updatedPf);
      save(aiPfKey(account), updatedPf);
      setCycleLog({ decisions, strategie, session, dca_injected: dcaInjected, dca_amount: dcaInjected ? dcaMensuel : 0 });
    } catch (e) {
      setError(e.message);
    } finally {
      setCycling(false);
    }
  }, [aiPf, cycling, account]);

  // Auto-trigger 2x/jour : ouverture ~9h05 et clôture ~17h15 (Paris, jours ouvrés)
  useEffect(() => {
    if (!aiPf) return;
    const check = () => {
      if (cycling) return;
      const { h, m, todayParis, isWeekend } = getParisTime();
      if (isWeekend) return;
      if (h === 9 && m >= 5 && m <= 20 && !aiPf.last_morning_cycle?.startsWith(todayParis)) handleRunCycle("OUVERTURE");
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
    if (userSnaps.length < 2) return null;
    const base = userSnaps[0].valeur, last = userSnaps[userSnaps.length - 1].valeur;
    return base > 0 ? ((last - base) / base) * 100 : null;
  })();

  const fp = (p, fallback = "—") => p === null || p === undefined ? fallback : (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
  const perfColor = (p) => p === null ? C.inkMuted : p >= 0 ? "#059669" : "#DC2626";

  const nextCycleLabel = (() => {
    try {
      const { h, m, todayParis, isWeekend } = getParisTime();
      const morningDone = aiPf?.last_morning_cycle?.startsWith(todayParis);
      const eveningDone = aiPf?.last_evening_cycle?.startsWith(todayParis);
      if (!isWeekend && (h < 9 || (h === 9 && m < 5)) && !morningDone) return "aujourd'hui à 9h05";
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
            <span style={{ fontSize: "20px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>Portefeuille IA</span>
            <span style={{ fontSize: "10px", fontWeight: "800", background: "linear-gradient(135deg,#080B0F,#2D5986)", color: "#C1E8FF", borderRadius: "6px", padding: "3px 8px", letterSpacing: "0.5px" }}>AUTO</span>
          </div>
          <div style={{ fontSize: "12px", color: C.inkMuted, marginTop: "3px" }}>
            Depuis le {inceptionFmt} · Capital {fmtEur(aiPf.capital_initial)} · {account}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button onClick={handleRunCycle} disabled={cycling}
            style={{ padding: "9px 18px", borderRadius: "10px", border: "none", cursor: cycling ? "default" : "pointer", fontSize: "12px", fontWeight: "700", fontFamily: "Inter,sans-serif", display: "flex", alignItems: "center", gap: "7px", background: cycling ? C.snowDim : "linear-gradient(135deg,#080B0F 0%,#1E3A5F 100%)", color: cycling ? C.inkMuted : "#fff", transition: "all 0.18s" }}>
            {cycling
              ? <><span style={{ width: "12px", height: "12px", border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "ba-spin 0.7s linear infinite" }}/> Analyse en cours…</>
              : "▶ Lancer un cycle"}
          </button>
          <button onClick={handleReset} title="Réinitialiser le portefeuille IA"
            style={{ width: "34px", height: "34px", borderRadius: "10px", background: C.snowDim, border: `1px solid ${C.border}`, cursor: "pointer", fontSize: "14px", color: C.inkMuted, transition: "all 0.15s" }}>↺</button>
        </div>
      </div>

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
            {loadingPrices && <span style={{ fontSize: "11px", color: C.inkSubtle }}>actualisation…</span>}
          </div>
          <PerformanceChart aiSnapshots={aiPf.snapshots} userSnapshots={userSnaps} inceptionDate={aiPf.inception_date} />
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
                      <div style={{ fontSize: "10px", color: C.inkMuted, marginTop: "1px" }}>{p.ticker} · {p.quantite} titres · {pctPf.toFixed(0)}% PF</div>
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
                    background: t.action === "BUY" ? "rgba(5,150,105,0.1)" : t.action === "DCA" || t.action === "DEPOT" ? "rgba(30,58,95,0.1)" : "rgba(220,38,38,0.08)",
                    color: t.action === "BUY" ? "#059669" : t.action === "DCA" || t.action === "DEPOT" ? "#1E3A5F" : "#DC2626" }}>
                    {t.action === "BUY" ? "ACHAT" : t.action === "DCA" ? "DCA" : t.action === "DEPOT" ? "DÉPÔT" : "VENTE"}
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
          {cycleLog.strategie && (
            <div style={{ fontSize: "12px", color: C.ink, fontStyle: "italic", marginBottom: "10px", lineHeight: 1.5 }}>"{cycleLog.strategie}"</div>
          )}
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
                  {d.action === "BUY" ? "ACHAT" : d.action === "SELL" ? "VENTE" : "HOLD"}
                </span>
                <span style={{ fontWeight: "600", color: C.ink }}>{d.nom}</span>
                {d.quantite > 0 && <span style={{ color: C.inkMuted }}>×{d.quantite}{d.cours ? ` @ ${fmtEur(d.cours)}` : ""}</span>}
                <span style={{ color: C.inkSubtle, flex: 1, fontSize: "11px" }}>— {d.raison}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cron info footer ── */}
      <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.5)", border: `1px solid ${C.border}`, borderRadius: "12px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ fontSize: "12px", color: C.inkMuted }}>
          <span>🤖 Cycle automatique : <strong>ouverture 9h05 · clôture 17h15 (Paris, jours ouvrés)</strong></span>
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
