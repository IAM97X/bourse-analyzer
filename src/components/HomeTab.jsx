import { useMemo, useState, useEffect, useRef } from "react";
import { sanitizePositions, fmtEur } from "../lib/finance";
import { load, save } from "../lib/storage";
import { DEFAULT_POSITIONS, DEFAULT_PROFIL } from "../constants/config";
import { COURTIERS, getCourtierForAccount } from "../constants/courtiers";
import { TABS } from "../constants/tabs";
import { fetchWithProxy, hasClaudeKey, hasAI } from "../lib/api";
import { fetchFMPHistorical } from "../lib/market";
import MarketStatusBar from "./MarketStatusBar";
import { AUTOPILOT_UNIVERSE } from "../constants/universe";

const SNAPSHOTS_KEY      = "bourse_snapshots";
const TICKER_CACHE_KEY   = "bourse_isin_ticker_cache";
const EVOLUTION_CSV_KEY  = "bourse_evolution_csv";

// Résout une liste d'ISINs en tickers Yahoo — utilise le cache, universe.js, puis Yahoo Search
const _universeAll = Object.values(AUTOPILOT_UNIVERSE).flat();
function tickerFromUniverse(isin) {
  const hit = _universeAll.find(u => u.isin === isin);
  return hit?.symbol || null;
}

async function resolveISINsToTickers(isins) {
  const cache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
  // Lookup local via universe.js avant tout appel réseau
  for (const isin of isins) {
    if (isin && !cache[isin]) {
      const t = tickerFromUniverse(isin);
      if (t) cache[isin] = t;
    }
  }
  const missing = isins.filter(isin => isin && !cache[isin]);
  if (missing.length) {
    await Promise.all(missing.map(async (isin) => {
      try {
        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=5&newsCount=0`;
        const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const json = await res.json();
        const quotes = json?.quotes || [];
        // Préférer les actions/ETF sur marchés européens
        const best = quotes.find(q => q.symbol && (q.exchDisp?.includes("Paris") || q.exchDisp?.includes("Amsterdam") || q.exchDisp?.includes("Euronext")))
          || quotes.find(q => q.symbol && q.quoteType === "EQUITY")
          || quotes.find(q => q.symbol && q.quoteType === "ETF")
          || quotes[0];
        if (best?.symbol) cache[isin] = best.symbol;
      } catch {}
    }));
    try { localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(cache)); } catch {}
  }
  return cache;
}


function calcCapitalVerse(account) {
  try {
    const ops = JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]")
      .filter(o => !account || (o.compte || "PEA") === account);
    const achats = ops.filter(o => o.type === "ACHAT")
      .reduce((s, o) => s + (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0), 0);
    const ventes = ops.filter(o => o.type === "VENTE")
      .reduce((s, o) => s + (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0), 0);
    return Math.max(0, achats - ventes);
  } catch { return 0; }
}

function fmtPct(v) {
  if (v === null || v === undefined) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + " %";
}

// Fetche l'historique journalier pour un ISIN via Yahoo Finance
async function fetchHistoricalByISIN(isin, ticker, fromDate, toDate) {
  // Yahoo Finance (ticker résolu)
  if (!ticker) return {};
  try {
    const rangeParam = (() => {
      const days = (new Date(toDate) - new Date(fromDate)) / 86400000;
      return days <= 35 ? "1mo" : days <= 95 ? "3mo" : days <= 190 ? "6mo" : days <= 370 ? "1y" : "5y";
    })();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${rangeParam}&interval=1d`;
    const res  = await fetchWithProxy(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return {};
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const closes     = result?.indicators?.quote?.[0]?.close || [];
    const map = {};
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
        if (date >= fromDate && date <= toDate) map[date] = closes[i];
      }
    }
    return map;
  } catch { return {}; }
}

// ── Cellule label / valeur ─────────────────────────────────────────────────────
function Row({ label, value, color, last, debug }) {
  return (
    <div title={debug || undefined} style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: "12px",
      padding: "10px 0",
      borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.09)",
      cursor: debug ? "help" : undefined,
    }}>
      <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", fontWeight: "400", lineHeight: "1.4", flex: "1" }}>
        {label}
      </span>
      <span style={{ fontSize: "12px", fontWeight: "600", color: color || "#fff", whiteSpace: "nowrap", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

// ── Carte navy ─────────────────────────────────────────────────────────────────
function Card({ children }) {
  return (
    <div style={{
      background: "linear-gradient(160deg, #1A3A5C 0%, #2D5986 100%)",
      borderRadius: "16px",
      padding: "14px 18px",
      boxShadow: "0 4px 16px rgba(30,58,95,0.22)",
      minWidth: 0,
    }}>
      {children}
    </div>
  );
}

// ── Colonne 1 : Valeur portefeuille ────────────────────────────────────────────
function ColValeur({ positions, especes, cumul, hidden }) {
  const blur = hidden ? { filter: "blur(6px)", userSelect: "none", pointerEvents: "none" } : {};

  const titres       = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const total        = titres + especes;
  const pv           = titres - totalInvesti;
  const pvPct        = totalInvesti > 0 ? (pv / totalInvesti) * 100 : 0;
  const pvColor      = pv >= 0 ? "#4ade80" : "#f87171";
  const versements   = cumul || totalInvesti;
  const today        = new Date().toLocaleDateString("fr-FR");

  return (
    <Card>
      <div style={blur}>
        <Row label="Total Portefeuille (titres + espèces)" value={fmtEur(total)} />
        <Row label={`Solde Espèces disponible ${today}`}   value={fmtEur(especes)} />
        <Row label="Évaluation titres"                     value={fmtEur(titres)} />
        <Row
          label="Montant +/- values latentes"
          value={<>{(pv >= 0 ? "+" : "") + fmtEur(pv)}<br/><span style={{ color: pvColor }}>({(pv >= 0 ? "+" : "") + pvPct.toFixed(2)} %)</span></>}
          color={pvColor}
        />
        <Row label="Plafond de versement"  value={fmtEur(150_000)} />
        <Row label="Cumul des versements"  value={fmtEur(versements)} last />
      </div>
    </Card>
  );
}

// ── Colonne 2 : Infos compte ───────────────────────────────────────────────────
function ColCompte({ account, profil }) {
  const courtierKey = getCourtierForAccount(profil, account);
  const courtierLabel = COURTIERS[courtierKey]?.nom || courtierKey || "—";

  const risqueLabel = {
    prudent:    "Prudent",
    equilibre:  "Équilibré",
    dynamique:  "Dynamique",
    agressif:   "Agressif",
  }[profil.risque] || (profil.risque || "—");

  const horizonLabel = {
    court:  "Court terme",
    moyen:  "Moyen terme",
    long:   "Long terme",
  }[profil.horizon] || (profil.horizon || "—");

  const dcaLabel = profil.dcaMensuel > 0 ? fmtEur(profil.dcaMensuel) + " / mois" : "—";

  return (
    <Card>
      <Row label="Courtier"        value={courtierLabel} />
      <Row label="Type de compte"  value={account} />
      <Row label="Profil risque"   value={risqueLabel} />
      <Row label="Horizon"         value={horizonLabel} />
      <Row label="DCA mensuel"     value={dcaLabel} last />
    </Card>
  );
}

// ── Colonne 3 : Performances ───────────────────────────────────────────────────
// Trouve le meilleur snapshot autour d'une date — préfère source CSV
function findBestSnap(snapshots, targetDate, toleranceDays = 7) {
  const target = new Date(targetDate).getTime();
  const candidates = snapshots.filter(s => {
    const diff = Math.abs(new Date(s.date).getTime() - target) / 86400000;
    return diff <= toleranceDays;
  });
  if (!candidates.length) return null;
  // Préférer CSV, puis le plus proche
  const csv = candidates.filter(s => s.source === "csv");
  const pool = csv.length ? csv : candidates;
  return pool.reduce((best, s) => {
    const d = Math.abs(new Date(s.date).getTime() - target);
    const bd = Math.abs(new Date(best.date).getTime() - target);
    return d < bd ? s : best;
  });
}

// Calcule le capital net investi (achats - ventes) entre deux dates
function calcDeltaCapital(account, fromDate, toDate) {
  try {
    const ops = JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]")
      .filter(o => (!account || (o.compte || "PEA") === account) && o.date >= fromDate && o.date <= toDate);
    return ops.reduce((s, o) => {
      const montant = (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0);
      return s + (o.type === "ACHAT" ? montant : o.type === "VENTE" ? -montant : 0);
    }, 0);
  } catch { return 0; }
}

function ColPerfs({ positions, account, profil }) {
  const [cac, setCac] = useState({ ytd: null, mois: null, loading: true });
  const [histRefs, setHistRefs] = useState({ jan1: null, mois1: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    async function fetch40() {
      try {
        const url = "https://query2.finance.yahoo.com/v8/finance/chart/%5EFCHI?range=ytd&interval=1d";
        const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error();
        const json = await res.json();
        const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean);
        if (!closes || closes.length < 2) return;
        const n = closes.length;
        if (!cancelled) setCac({
          ytd:  (closes[n-1] - closes[0]) / closes[0] * 100,
          mois: n >= 22 ? (closes[n-1] - closes[n-22]) / closes[n-22] * 100 : null,
          loading: false,
        });
      } catch {
        if (!cancelled) setCac(c => ({ ...c, loading: false }));
      }
    }
    fetch40();
    return () => { cancelled = true; };
  }, []);

  // Reconstruction V0 (Jan 1 + mois 1) via Yahoo historique + transactions (approche forward)
  useEffect(() => {
    let cancelled = false;
    async function computeHistoricalRefs() {
      try {
        const now  = new Date();
        const yyyy = now.getFullYear();
        const mm   = String(now.getMonth() + 1).padStart(2, "0");
        const jan1Date  = `${yyyy}-01-01`;
        const mois1Date = `${yyyy}-${mm}-01`;

        const allOps = (() => { try { return JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]").filter(o => !account || (o.compte || "PEA") === account); } catch { return []; } })();

        // Tous les ISINs connus (positions actuelles + transactions historiques)
        const rawISINs = [...new Set([
          ...positions.map(p => p.isin),
          ...allOps.map(o => o.isin),
        ].filter(Boolean))];

        // Résolution ISIN → ticker (cache + Yahoo Search pour les manquants)
        const tickerCache = await resolveISINsToTickers(rawISINs);
        const allISINs = rawISINs.filter(isin => tickerCache[isin]);

        if (!allISINs.length) { if (!cancelled) setHistRefs({ jan1: null, mois1: null, loading: false }); return; }

        // Fetch prix historiques YTD — FMP (ISIN direct) prioritaire, Yahoo en fallback
        const now2 = new Date();
        const fromDate = `${now2.getFullYear()}-01-01`;
        const toDate   = now2.toISOString().slice(0, 10);
        const priceByIsin = {};
        await Promise.all(allISINs.map(async (isin) => {
          const map = await fetchHistoricalByISIN(isin, tickerCache[isin], fromDate, toDate);
          if (Object.keys(map).length > 0) priceByIsin[isin] = map;
        }));

        if (cancelled) return;

        // Calcule V0 à une date cible — approche BACKWARD :
        // On part des quantités ACTUELLES (connues exactement) et on annule
        // les transactions postérieures à targetDate (données récentes, donc plus complètes).
        const computeV0 = (targetDate) => {
          const getPriceAt = (isin) => {
            const prices = priceByIsin[isin];
            if (!prices) return null;
            let best = null, bestDiff = Infinity;
            for (const [d, p] of Object.entries(prices)) {
              const diff = (new Date(d) - new Date(targetDate)) / 86400000;
              if (diff >= 0 && diff <= 7 && diff < bestDiff) { best = p; bestDiff = diff; }
            }
            return best;
          };

          // Initialiser avec les quantités actuelles
          const qtyMap = {};
          for (const p of positions) {
            if (p.isin) qtyMap[p.isin] = p.quantite;
          }
          // Annuler toutes les transactions APRÈS targetDate
          for (const op of allOps) {
            if (op.date <= targetDate || !op.isin) continue;
            const q = parseFloat(op.quantite) || 0;
            if (!qtyMap[op.isin]) qtyMap[op.isin] = 0;
            if (op.type === "ACHAT")  qtyMap[op.isin] -= q; // annuler l'achat
            if (op.type === "VENTE")  qtyMap[op.isin] += q; // annuler la vente
          }

          let total = 0, covered = 0;
          for (const [isin, qty] of Object.entries(qtyMap)) {
            if (qty <= 0.001) continue;
            const price = getPriceAt(isin);
            if (!price) continue;
            total += qty * price;
            covered++;
          }
          return covered > 0 ? total : null;
        };

        const jan1  = computeV0(jan1Date);
        const mois1 = computeV0(mois1Date);
        if (!cancelled) setHistRefs({ jan1, mois1, loading: false });
      } catch {
        if (!cancelled) setHistRefs({ jan1: null, mois1: null, loading: false });
      }
    }
    computeHistoricalRefs();
    return () => { cancelled = true; };
  }, [account]);

  const snapshots = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]"); } catch { return []; }
  }, []);

  const currentValue = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const now   = new Date();
  const yyyy  = now.getFullYear();
  const mm    = String(now.getMonth() + 1).padStart(2, "0");
  const today = now.toISOString().slice(0, 10);
  const yest  = new Date(now - 86400000).toISOString().slice(0, 10);
  const moisLabel = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // Modified Dietz : (V1 - V0 - ΔCF) / V0
  const modifiedDietz = (v0, fromDate, label) => {
    if (!v0 || v0 <= 0) return null;
    const cf = calcDeltaCapital(account, fromDate, today);
    const result = (currentValue - v0 - cf) / v0 * 100;
    console.log(`[Perf ${label}] V1=${currentValue.toFixed(2)}€  V0=${v0.toFixed(2)}€  ΔCF=${cf.toFixed(2)}€  → ${result.toFixed(2)}%`);
    return result;
  };

  // Priorité : manuel (Profil) > Yahoo historique reconstruit > snapshot CSV > snapshot auto
  const refJan1  = profil?.valeurJan1  > 0 ? profil.valeurJan1  : null;
  const refMois1 = profil?.valeurMois1 > 0 ? profil.valeurMois1 : null;
  const snapJan1  = findBestSnap(snapshots, `${yyyy}-01-01`, 7);
  const snapMois1 = findBestSnap(snapshots, `${yyyy}-${mm}-01`, 5);
  const snapYest  = findBestSnap(snapshots, yest, 3);

  const v0Jan1  = refJan1  ?? histRefs.jan1  ?? snapJan1?.valeur  ?? null;
  const v0Mois1 = refMois1 ?? histRefs.mois1 ?? snapMois1?.valeur ?? null;
  const loadingYtd  = !refJan1  && histRefs.loading;
  const loadingMois = !refMois1 && histRefs.loading;

  const pfYtd  = modifiedDietz(v0Jan1,  `${yyyy}-01-01`, "YTD");
  const pfMois = modifiedDietz(v0Mois1, `${yyyy}-${mm}-01`, "Mois");

  // Performance de la veille : intradayVariation Yahoo (la plus fiable)
  const posWithIntraday = positions.filter(p => p.intradayVariation != null && (p.dernierCours || p.pru) > 0);
  const pfVeille = (() => {
    if (posWithIntraday.length > 0 && posWithIntraday.length >= positions.length * 0.5) {
      let valeurAujourd = 0, valeurHier = 0;
      for (const p of positions) {
        const cours = p.dernierCours || p.pru;
        const qty   = p.quantite || 0;
        valeurAujourd += cours * qty;
        if (p.intradayVariation != null) {
          valeurHier += (cours / (1 + p.intradayVariation / 100)) * qty;
        } else {
          valeurHier += cours * qty;
        }
      }
      return valeurHier > 0 ? (valeurAujourd - valeurHier) / valeurHier * 100 : null;
    }
    // Fallback : snapshot de la veille
    const v0 = snapYest?.valeur ?? null;
    if (!v0) return null;
    const cf = calcDeltaCapital(account, yest, today);
    return (currentValue - v0 - cf) / v0 * 100;
  })();

  const pctColor = v => v === null || v === undefined ? "#fff" : v >= 0 ? "#4ade80" : "#f87171";

  return (
    <Card>
      <Row label={`Ma performance ${yyyy}`}        value={loadingYtd  ? "…" : fmtPct(pfYtd)}  color={pctColor(pfYtd)}
        debug={v0Jan1  ? `V1=${currentValue.toFixed(0)}€  V0 jan.1=${v0Jan1.toFixed(0)}€  ΔCF=${calcDeltaCapital(account,`${yyyy}-01-01`,today).toFixed(0)}€` : undefined} />
      <Row label={`Ma performance ${moisLabel}`}   value={loadingMois ? "…" : fmtPct(pfMois)} color={pctColor(pfMois)}
        debug={v0Mois1 ? `V1=${currentValue.toFixed(0)}€  V0 mois.1=${v0Mois1.toFixed(0)}€  ΔCF=${calcDeltaCapital(account,`${yyyy}-${mm}-01`,today).toFixed(0)}€` : undefined} />
      <Row label="Ma performance de la veille"     value={fmtPct(pfVeille)} color={pctColor(pfVeille)} />
      <div style={{ height: "1px", background: "rgba(255,255,255,0.12)", margin: "4px 0" }} />
      <Row label={`Performance ${yyyy} du CAC 40`} value={cac.loading ? "…" : fmtPct(cac.ytd)}   color={pctColor(cac.ytd)}  />
      <Row label={`Perf. mensuelle du CAC 40`}     value={cac.loading ? "…" : fmtPct(cac.mois)}  color={pctColor(cac.mois)} last />
    </Card>
  );
}

// ── Parseur universel CSV évolution portefeuille (Boursobank, Fortuneo, DEGIRO…) ─
function detectAndParseEvolutionCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], broker: "inconnu" };

  // 1. Détection du séparateur
  const firstLine = lines[0];
  const sep = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";

  // 2. Parser une ligne CSV avec guillemets
  const parseLine = (line) => {
    const cols = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === sep && !inQ) { cols.push(cur.trim()); cur = ""; }
      else { cur += c; }
    }
    cols.push(cur.trim());
    return cols.map(c => c.replace(/^"|"$/g, "").trim());
  };

  const header = parseLine(lines[0]).map(h => h.toLowerCase());

  // 3. Détection broker
  let broker = "générique";
  if (header.some(h => h.includes("valorisation portefeuille"))) broker = "Boursobank";
  else if (header.some(h => h.includes("fortuneo") || h.includes("valeur liquidative"))) broker = "Fortuneo";
  else if (header.some(h => h.includes("degiro") || h.includes("valeur du portefeuille"))) broker = "DEGIRO";
  else if (header.some(h => h.includes("trade republic"))) broker = "Trade Republic";

  // 4. Index des colonnes clés
  const dateIdx = header.findIndex(h => h === "date" || h.startsWith("date"));
  const valueKeywords = ["valorisation", "valeur", "value", "montant", "total", "portefeuille", "liquidative", "portfolio"];
  let valueIdx = header.findIndex((h, i) => i !== dateIdx && valueKeywords.some(k => h.includes(k)));
  if (valueIdx < 0) valueIdx = dateIdx === 0 ? 1 : 0; // fallback : 2e colonne
  const perfCumKeywords = ["cumulée", "cumulee", "cumulative", "cum.", "total perf"];
  const perfCumIdx = header.findIndex(h => perfCumKeywords.some(k => h.includes(k)));

  // 5. Normalisation de date (ISO YYYY-MM-DD ou FR dd/mm/yyyy ou dd/mm/yy)
  const normalizeDate = (s) => {
    s = s.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
    const m3 = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if (m3) return `20${m3[3]}-${m3[2]}-${m3[1]}`;
    const m4 = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m4) return `${m4[3]}-${m4[2]}-${m4[1]}`;
    return null;
  };

  // 6. Parse des lignes de données
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length < 2) continue;
    const date = normalizeDate(cols[dateIdx >= 0 ? dateIdx : 0]);
    const rawVal = (cols[valueIdx] || "").replace(/\s/g, "").replace(",", ".");
    const valeur = parseFloat(rawVal);
    const rawPerf = perfCumIdx >= 0 ? (cols[perfCumIdx] || "").replace(",", ".").replace("%", "") : null;
    const perfCumulee = rawPerf !== null ? parseFloat(rawPerf) : null;
    if (!date || isNaN(valeur) || valeur <= 0) continue;
    rows.push({ date, valeur, perfCumulee: (perfCumulee !== null && !isNaN(perfCumulee)) ? perfCumulee : null });
  }

  return { rows, broker };
}

// ── Courbe d'évolution ────────────────────────────────────────────────────────
const PERIODS = [
  { label: "1J",   days: 1   },
  { label: "5J",   days: 5   },
  { label: "1S",   days: 7   },
  { label: "1M",   days: 30  },
  { label: "3M",   days: 90  },
  { label: "6M",   days: 180 },
  { label: "1A",   days: 365  },
  { label: "3A",   days: 1095 },
  { label: "5A",   days: 1825 },
  { label: "Tout", days: 9999 },
];

function CourbeEvolution({ hidden, positions, account }) {
  const [period, setPeriod]     = useState(30);
  const [hover, setHover]       = useState(null);
  const [yahooPoints, setYahooPoints] = useState(null);
  const [yahooLoading, setYahooLoading] = useState(false);
  const [csvData, setCsvData] = useState(() => {
    try {
      const d = JSON.parse(localStorage.getItem(EVOLUTION_CSV_KEY) || "null");
      return d && Array.isArray(d.rows) && d.rows.length > 1 ? d : null;
    } catch { return null; }
  });
  const csvPoints    = csvData?.rows ?? null;
  const csvBroker    = csvData?.broker ?? null;
  const csvImportedAt = csvData?.importedAt
    ? new Date(csvData.importedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;
  const fileInputRef = useRef(null);
  const svgRef = useRef(null);
  const blur = hidden ? { filter: "blur(6px)", userSelect: "none", pointerEvents: "none" } : {};

  const handleCSVImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (csvPoints) {
      const label = csvBroker ? `CSV ${csvBroker}` : "CSV existant";
      const when = csvImportedAt ? ` (importé le ${csvImportedAt})` : "";
      if (!window.confirm(`Remplacer le ${label}${when} ?`)) {
        e.target.value = "";
        return;
      }
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows, broker } = detectAndParseEvolutionCSV(ev.target.result);
      if (rows.length > 1) {
        const payload = { rows, broker, importedAt: Date.now() };
        save(EVOLUTION_CSV_KEY, payload);
        setCsvData(payload);
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  // Reconstruction depuis Yahoo + transactions
  useEffect(() => {
    let cancelled = false;
    setYahooLoading(true);
    async function buildYahooChart() {
      try {
        const allOps = (() => { try { return JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]").filter(o => !account || (o.compte || "PEA") === account); } catch { return []; } })();

        // Tous les ISINs connus (positions actuelles + historique transactions)
        const rawISINs = [...new Set([
          ...(positions || []).map(p => p.isin),
          ...allOps.map(o => o.isin),
        ].filter(Boolean))];

        // Résolution ISIN → ticker (cache + Yahoo Search pour les manquants)
        const tickerCache = await resolveISINsToTickers(rawISINs);
        const isinTickers = {};
        for (const isin of rawISINs) {
          if (tickerCache[isin]) isinTickers[isin] = tickerCache[isin];
        }
        if (!Object.keys(isinTickers).length) { if (!cancelled) { setYahooPoints(null); setYahooLoading(false); } return; }

        // ── 1J : intraday 5 min ────────────────────────────────────────────────
        if (period === 1) {
          const priceByIsinIntra = {};
          await Promise.all(Object.entries(isinTickers).map(async ([isin, ticker]) => {
            try {
              const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=5m&range=1d`;
              const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(12000) });
              if (!res.ok) return;
              const json = await res.json();
              const r = json?.chart?.result?.[0];
              const tss = r?.timestamp || [];
              const cls = r?.indicators?.quote?.[0]?.close || [];
              priceByIsinIntra[isin] = tss
                .map((t, i) => ({ ts: t * 1000, price: cls[i] }))
                .filter(p => p.price != null && isFinite(p.price));
            } catch {}
          }));
          const allTs = [...new Set(
            Object.values(priceByIsinIntra).flatMap(pts => pts.map(p => p.ts))
          )].sort((a, b) => a - b);
          if (allTs.length >= 2) {
            const lastP = {};
            const intraPts = [];
            for (const ts of allTs) {
              for (const [isin, pts] of Object.entries(priceByIsinIntra)) {
                const hit = pts.find(p => p.ts === ts);
                if (hit) lastP[isin] = hit.price;
              }
              let valeur = 0;
              for (const pos of (positions || [])) {
                if (!pos.isin || !lastP[pos.isin]) continue;
                valeur += pos.quantite * lastP[pos.isin];
              }
              if (valeur > 0) {
                const d = new Date(ts);
                const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
                intraPts.push({ ts, date: d.toISOString().slice(0, 10), time, valeur });
              }
            }
            if (!cancelled) { setYahooPoints(intraPts.length >= 2 ? intraPts : null); setYahooLoading(false); }
          } else {
            if (!cancelled) { setYahooPoints(null); setYahooLoading(false); }
          }
          return;
        }

        // ── 5J / 1S : closes journaliers Yahoo (trading days) + dernier cours actuel ─
        if (period <= 7) {
          const rangeIntra = period <= 5 ? "5d" : "7d";
          const priceMapByIsin = {};
          await Promise.all(Object.entries(isinTickers).map(async ([isin, ticker]) => {
            try {
              const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${rangeIntra}`;
              const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(12000) });
              if (!res.ok) return;
              const json = await res.json();
              const r = json?.chart?.result?.[0];
              const tss = r?.timestamp || [];
              const cls = r?.indicators?.quote?.[0]?.close || [];
              const map = {};
              for (let i = 0; i < tss.length; i++) {
                if (cls[i] != null && isFinite(cls[i]))
                  map[new Date(tss[i] * 1000).toISOString().slice(0, 10)] = cls[i];
              }
              if (Object.keys(map).length) priceMapByIsin[isin] = map;
            } catch {}
          }));
          const allDates = [...new Set(Object.values(priceMapByIsin).flatMap(m => Object.keys(m)))].sort();
          if (allDates.length >= 2) {
            const lastP = {};
            const dailyPts = [];
            for (const date of allDates) {
              for (const [isin, m] of Object.entries(priceMapByIsin)) {
                if (m[date] != null) lastP[isin] = m[date];
              }
              let valeur = 0;
              for (const pos of (positions || [])) {
                if (!pos.isin || !lastP[pos.isin]) continue;
                valeur += pos.quantite * lastP[pos.isin];
              }
              if (valeur > 0) dailyPts.push({ date, valeur });
            }
            // Ajouter le point courant (heure H) si plus récent que le dernier close
            const today = new Date().toISOString().slice(0, 10);
            const lastPt = dailyPts[dailyPts.length - 1];
            if (lastPt && lastPt.date < today) {
              const currentVal = (positions || []).reduce((s, pos) => {
                const price = pos.dernierCours || lastP[pos.isin] || pos.pru;
                return s + pos.quantite * price;
              }, 0);
              if (currentVal > 0) dailyPts.push({ date: today, valeur: currentVal });
            }
            if (!cancelled) { setYahooPoints(dailyPts.length >= 2 ? dailyPts : null); setYahooLoading(false); }
          } else {
            if (!cancelled) { setYahooPoints(null); setYahooLoading(false); }
          }
          return;
        }

        const rangeParam = period >= 9999 ? "5y" : period >= 365 ? "1y" : period >= 180 ? "6mo" : period >= 90 ? "3mo" : "1mo";

        // Fetch prix historiques — FMP (ISIN direct) prioritaire, Yahoo en fallback
        const chartFromDate = new Date(Date.now() - (period >= 9999 ? 5 * 365 : period) * 86400000).toISOString().slice(0, 10);
        const chartToDate   = new Date().toISOString().slice(0, 10);
        const priceByIsin = {};
        await Promise.all(Object.keys(isinTickers).map(async (isin) => {
          const map = await fetchHistoricalByISIN(isin, isinTickers[isin], chartFromDate, chartToDate);
          if (Object.keys(map).length > 0) priceByIsin[isin] = map;
        }));

        if (cancelled) return;

        // Union de toutes les dates disponibles
        const allDates = [...new Set(Object.values(priceByIsin).flatMap(m => Object.keys(m)))].sort();
        if (allDates.length < 2) { if (!cancelled) { setYahooPoints(null); setYahooLoading(false); } return; }

        // Pour chaque date, reconstruire la valeur du portefeuille
        const cutoff = new Date(Date.now() - period * 86400000).toISOString().slice(0, 10);
        const dates = period >= 9999 ? allDates : allDates.filter(d => d >= cutoff);
        if (dates.length < 2) { if (!cancelled) { setYahooPoints(null); setYahooLoading(false); } return; }

        // Approche BACKWARD pour chaque date :
        // quantité à date D = qty_actuelle - (achats après D) + (ventes après D)
        const currentQty = {};
        for (const p of (positions || [])) {
          if (p.isin) currentQty[p.isin] = p.quantite;
        }

        const lastPrice = {};
        const points = [];
        for (const date of dates) {
          let valeur = 0;
          for (const [isin, prices] of Object.entries(priceByIsin)) {
            if (prices[date] != null) lastPrice[isin] = prices[date];
            const price = lastPrice[isin];
            if (!price) continue;

            // Quantité à cette date (backward)
            let qty = currentQty[isin] || 0;
            for (const op of allOps) {
              if (op.isin !== isin || op.date <= date) continue;
              const q = parseFloat(op.quantite) || 0;
              if (op.type === "ACHAT")  qty -= q;
              else if (op.type === "VENTE") qty += q;
            }
            qty = Math.max(0, qty);
            if (qty > 0) valeur += qty * price;
          }
          if (valeur > 0) points.push({ date, valeur });
        }

        if (!cancelled) { setYahooPoints(points.length >= 2 ? points : null); setYahooLoading(false); }
      } catch { if (!cancelled) { setYahooPoints(null); setYahooLoading(false); } }
    }
    buildYahooChart();
    return () => { cancelled = true; };
  }, [period, account]); // positions intentionnellement exclus pour éviter les re-fetch

  // CSV Boursobank filtré par période
  const csvFiltered = useMemo(() => {
    if (!csvPoints) return null;
    const cutoff = new Date(Date.now() - period * 86400000).toISOString().slice(0, 10);
    const filtered = period >= 9999 ? csvPoints : csvPoints.filter(p => p.date >= cutoff);
    return filtered.length >= 2 ? filtered : null;
  }, [csvPoints, period]);

  // Fallback : snapshots localStorage
  const snapPoints = useMemo(() => {
    try {
      const snaps = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]");
      const cutoff = new Date(Date.now() - period * 86400000).toISOString().slice(0, 10);
      const filtered = snaps.filter(s => period >= 9999 || s.date >= cutoff);
      return filtered.length >= 2 ? filtered : null;
    } catch { return null; }
  }, [period]);

  // Synthèse minimale si aucune donnée : 2 points (hier + aujourd'hui) à partir du portfolio actuel
  const syntheticPoints = useMemo(() => {
    if (!positions || positions.length === 0) return null;
    const valeur  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
    const investi = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
    if (valeur <= 0) return null;
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return [
      { date: yesterday, valeur, investi, capitalVerse: investi },
      { date: today,     valeur, investi, capitalVerse: investi },
    ];
  }, [positions]);

  // Pour ≤7J : données intraday Yahoo prioritaires (CSV ne contient que des points journaliers)
  const dataSource = (period <= 7 && yahooPoints) ? "yahoo" : csvFiltered ? "boursobank" : yahooPoints ? "yahoo" : "snapshots";
  const rawPoints  = (period <= 7 && yahooPoints) ? yahooPoints : (csvFiltered ?? yahooPoints ?? snapPoints ?? syntheticPoints);

  const currentFromPositions = useMemo(
    () => positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0),
    [positions]
  );

  const { points, current, first, investi, perfCumFromCSV } = useMemo(() => {
    if (!rawPoints || rawPoints.length < 2) return { points: null };
    const last = rawPoints[rawPoints.length - 1];
    // Les snapshots stockent la valeur totale PEA+CTO — on force la valeur actuelle
    // depuis les positions filtrées pour que l'affichage soit correct par compte
    const currentVal = dataSource === "snapshots" ? currentFromPositions : last.valeur;
    return {
      points:         rawPoints,
      current:        currentVal,
      first:          rawPoints[0].valeur,
      investi:        last.capitalVerse || last.investi || 0,
      perfCumFromCSV: dataSource === "boursobank" ? (last.perfCumulee ?? null) : null,
    };
  }, [rawPoints, dataSource, currentFromPositions]);

  if (yahooLoading && !snapPoints) return (
    <div style={{ background: "linear-gradient(160deg, #1A3A5C 0%, #2D5986 100%)", borderRadius: "16px", padding: "28px", textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: "12px", boxShadow: "0 4px 16px rgba(30,58,95,0.22)" }}>
      Reconstruction depuis l'historique des transactions…
    </div>
  );

  if (!points) return (
    <div style={{ background: "linear-gradient(160deg, #1A3A5C 0%, #2D5986 100%)", borderRadius: "16px", padding: "28px", textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: "12px", boxShadow: "0 4px 16px rgba(30,58,95,0.22)" }}>
      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSVImport} />
      <div style={{ marginBottom: "12px" }}>Aucune donnée disponible</div>
      <button onClick={() => fileInputRef.current?.click()}
        style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
        + Importer CSV Boursobank
      </button>
      <div style={{ marginTop: "8px", fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>Boursobank · Fortuneo · DEGIRO</div>
    </div>
  );

  const delta    = current - first;
  const perf     = (delta / first) * 100;
  const pvLatent = investi > 0 ? current - investi : null;
  const pvPct    = pvLatent !== null && investi > 0 ? (pvLatent / investi) * 100 : null;
  // Quand le delta période est nul (historique insuffisant), on bascule sur le gain total
  const flatPeriod = Math.abs(delta) < 0.01 && pvLatent !== null;
  const isUp     = flatPeriod ? (pvLatent >= 0) : (delta >= 0);
  const lineClr  = isUp ? "#0ea87e" : "#e74c3c";
  const lineClrUp   = "#0ea87e";
  const lineClrDown = "#e74c3c";

  const W = 600; const H = 160;
  const padT = 12, padB = 12, padL = 8, padR = 8;
  const values = points.map(p => p.valeur);
  const minV = Math.min(...values), maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const toX = i => padL + (i / (points.length - 1)) * (W - padL - padR);
  const toY = v => padT + (1 - (v - minV) / range) * (H - padT - padB);

  const pts = points.map((p, i) => [toX(i), toY(p.valeur)]);

  const smoothPath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaD = `${smoothPath} L${pts[pts.length-1][0].toFixed(2)},${H-padB} L${pts[0][0].toFixed(2)},${H-padB} Z`;

  // Graduations Y — intervalles arrondis, ~5-6 ticks
  const niceStep = (() => {
    const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    const target = range / 5;
    return steps.find(s => s >= target) || steps[steps.length - 1];
  })();
  const yStart = Math.floor(minV / niceStep) * niceStep;
  const yEnd   = Math.ceil(maxV  / niceStep) * niceStep;
  const yTicks = [];
  for (let v = yStart; v <= yEnd; v += niceStep) {
    const y = toY(v);
    if (y >= padT - 4 && y <= H - padB + 4) {
      const label = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v) + " €";
      yTicks.push({ v, y, label });
    }
  }

  const xDates = (() => {
    // 1J intraday : heures au premier point de chaque heure
    if (period === 1 && points[0]?.time) {
      const seen = new Set();
      const labels = [];
      points.forEach((p, i) => {
        const hour = p.time?.slice(0, 2);
        if (hour && !seen.has(hour) && p.time?.endsWith("00")) { seen.add(hour); labels.push({ i, x: toX(i), label: p.time }); }
      });
      // Fallback si aucune heure ronde
      if (!labels.length) return [0, Math.floor((points.length-1)/2), points.length-1].map(i => ({ i, x: toX(i), label: points[i].time }));
      return labels;
    }
    // 5J/1S daily (≤ 7 points) : afficher chaque date
    if (period <= 7 && points.length <= 10) {
      return points.map((p, i) => ({ i, x: toX(i), label: p.date.slice(5).split("-").reverse().join("/") }));
    }
    // Autres périodes : 3 labels
    return [0, Math.floor((points.length - 1) / 2), points.length - 1].map(i => ({
      i, x: toX(i), label: points[i].date.slice(5).replace("-", "/"),
    }));
  })();

  // Couleurs thème clair
  const bg     = "#fff";
  const ink    = "#1a2d4a";
  const inkSub = "rgba(26,45,74,0.45)";
  const inkMut = "rgba(26,45,74,0.28)";
  const cardBg = "#f4f6f9";

  // Perf % à afficher dans le badge
  const perfBadge = flatPeriod
    ? (pvPct !== null ? pvPct : null)
    : (perfCumFromCSV !== null ? perfCumFromCSV : perf);
  const perfBadgeEur = flatPeriod ? pvLatent : delta;

  return (
    <div style={{ background: bg, borderRadius: "20px", padding: "12px 12px 10px", boxShadow: "0 2px 20px rgba(26,45,74,0.09)", border: "1px solid rgba(26,45,74,0.07)" }}>

      {/* Header : label + actions à droite */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", ...blur }}>
        <div style={{ fontSize: "10px", fontWeight: "600", color: inkMut, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Portefeuille {account}
        </div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {dataSource === "boursobank" && (
            <span style={{ fontSize: "9px", color: lineClrUp, fontWeight: "700", background: `${lineClrUp}14`, padding: "2px 7px", borderRadius: "5px", border: `1px solid ${lineClrUp}28`, display: "flex", alignItems: "center", gap: "4px" }}>
              <span>● {csvBroker || "CSV"}</span>
              {csvImportedAt && <span style={{ fontWeight: "500", opacity: 0.75 }}>· {csvImportedAt}</span>}
            </span>
          )}
          {dataSource === "yahoo"     && <span style={{ fontSize: "9px", color: inkMut, fontWeight: "600" }}>● Yahoo</span>}
          {dataSource === "snapshots" && <span style={{ fontSize: "9px", color: inkMut, fontWeight: "600" }}>● Snap</span>}
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSVImport} />
          <button onClick={() => fileInputRef.current?.click()}
            style={{ padding: "2px 7px", borderRadius: "5px", border: `1px solid ${csvPoints ? lineClrUp+"40" : "rgba(26,45,74,0.13)"}`, background: "transparent", color: csvPoints ? lineClrUp : inkSub, fontSize: "10px", fontWeight: "600", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {csvPoints ? "↑ CSV" : "+ CSV"}
          </button>
        </div>
      </div>

      {/* Valeur + perf */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "4px", flexWrap: "wrap", ...blur }}>
        <div style={{ fontSize: "20px", fontWeight: "700", color: ink, letterSpacing: "-0.03em", lineHeight: 1 }}>{fmtEur(current)}</div>
        {perfBadgeEur !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", color: lineClr }}>
              {perfBadgeEur >= 0 ? "+" : ""}{fmtEur(perfBadgeEur)}
            </span>
            {perfBadge !== null && (
              <span style={{ fontSize: "10px", fontWeight: "700", color: lineClr, background: `${lineClr}15`, borderRadius: "4px", padding: "1px 5px" }}>
                {perfBadge >= 0 ? "+" : ""}{perfBadge.toFixed(2)} %
              </span>
            )}
          </div>
        )}
      </div>

      {/* Courbe */}
      <div style={{ position: "relative", ...blur }}>
        <svg ref={svgRef} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", cursor: "crosshair" }}
          onMouseMove={e => {
            const rect = svgRef.current.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            const svgX = ratio * W;
            const idx = Math.max(0, Math.min(points.length - 1, Math.round((svgX - padL) / (W - padL - padR) * (points.length - 1))));
            setHover({ idx, x: toX(idx), y: toY(points[idx].valeur) });
          }}
          onMouseLeave={() => setHover(null)}
          onTouchMove={e => {
            e.preventDefault();
            const rect = svgRef.current.getBoundingClientRect();
            const ratio = (e.touches[0].clientX - rect.left) / rect.width;
            const svgX = ratio * W;
            const idx = Math.max(0, Math.min(points.length - 1, Math.round((svgX - padL) / (W - padL - padR) * (points.length - 1))));
            setHover({ idx, x: toX(idx), y: toY(points[idx].valeur) });
          }}
          onTouchEnd={() => setHover(null)}
        >
          <defs>
            <linearGradient id="chartGradLight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineClr} stopOpacity="0.14"/>
              <stop offset="100%" stopColor={lineClr} stopOpacity="0"/>
            </linearGradient>
          </defs>
          {yTicks.map(({ y }, i) => (
            <line key={i} x1="0" y1={y.toFixed(1)} x2={W - padR} y2={y.toFixed(1)}
              stroke="rgba(26,45,74,0.07)" strokeWidth="1" strokeDasharray="3 6"/>
          ))}
          <path d={areaD} fill="url(#chartGradLight)"/>
          <path d={smoothPath} fill="none" stroke={lineClr} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
          {hover && (
            <line x1={hover.x.toFixed(1)} y1={padT} x2={hover.x.toFixed(1)} y2={H - padB}
              stroke="rgba(26,45,74,0.15)" strokeWidth="1"/>
          )}
        </svg>

        {/* Tooltip */}
        {hover && (() => {
          const p      = points[hover.idx];
          const isIntraday1J = period === 1 && p.time;
          const pLabel = isIntraday1J
            ? p.time
            : new Date(p.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
          const pctX   = (hover.x / W) * 100;
          const onLeft = hover.x > W * 0.55;
          const perfPeriod = points[0].valeur > 0 ? (p.valeur - points[0].valeur) / points[0].valeur * 100 : null;
          const perfDisplay = (p.perfCumulee != null && p.perfCumulee > -100 && p.perfCumulee < 2000)
            ? p.perfCumulee
            : (perfPeriod !== null && perfPeriod > -100 && perfPeriod < 2000 ? perfPeriod : null);
          const pClr = (perfDisplay ?? 0) >= 0 ? lineClrUp : lineClrDown;
          return (
            <div style={{
              position: "absolute",
              top: `${Math.max(4, Math.min(H - 72, hover.y - 38))}px`,
              ...(onLeft ? { right: `calc(${100 - pctX}% + 14px)` } : { left: `calc(${pctX}% + 14px)` }),
              minWidth: "130px",
              background: "#fff",
              border: "1px solid rgba(26,45,74,0.12)",
              borderTop: `2.5px solid ${lineClr}`,
              borderRadius: "0 0 10px 10px",
              padding: "9px 13px",
              pointerEvents: "none",
              zIndex: 20,
              boxShadow: "0 4px 20px rgba(26,45,74,0.13)",
            }}>
              <div style={{ fontSize: "10px", color: inkSub, fontWeight: "500", marginBottom: "4px", whiteSpace: "nowrap" }}>{pLabel}</div>
              <div style={{ fontSize: "17px", fontWeight: "800", color: ink, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{fmtEur(p.valeur)}</div>
              {perfDisplay !== null && (
                <div style={{ display: "inline-block", marginTop: "4px", background: `${pClr}14`, borderRadius: "6px", padding: "2px 7px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: pClr }}>{perfDisplay >= 0 ? "+" : ""}{perfDisplay.toFixed(2)} %</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Labels X */}
        <div style={{ position: "relative", height: "18px", marginTop: "4px" }}>
          {xDates.map(({ label, x, i: idx }) => {
            const pct = (x / W) * 100;
            return (
              <span key={idx} style={{
                position: "absolute", left: `${pct}%`,
                transform: idx === 0 ? "none" : idx === points.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                fontSize: "11px", color: inkSub, fontWeight: "600", whiteSpace: "nowrap",
              }}>{label}</span>
            );
          })}
        </div>
      </div>

      {/* Période pills — centrées en bas */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: "10px" }}>
        <div style={{ display: "flex", background: "#f0f2f5", borderRadius: "8px", padding: "2px", gap: "1px" }}>
          {PERIODS.map(({ label, days }) => (
            <button key={days} onClick={() => setPeriod(days)}
              style={{ padding: "3px 10px", borderRadius: "6px", border: "none", background: period === days ? "#fff" : "transparent", color: period === days ? ink : inkSub, fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", boxShadow: period === days ? "0 1px 3px rgba(26,45,74,0.10)" : "none", transition: "all 0.15s" }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────────
export default function HomeTab({ account = "PEA", onTabChange, hidden, profil: profilProp }) {
  const allPositions = sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS));
  const positions    = allPositions.filter(p => (p.compte || "PEA") === account);
  const profil       = profilProp || load("bourse_profil", DEFAULT_PROFIL);
  const especes      = account === "CTO" ? (profil.especesCTO || 0) : (profil.especesPEA || 0);
  const cumul        = account === "CTO"
    ? (profil?.versementsCTO > 0 ? profil.versementsCTO : calcCapitalVerse(account))
    : (profil?.versementsPEA > 0 ? profil.versementsPEA : calcCapitalVerse(account));

  if (!positions.length) return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{ marginBottom: "14px", display: "flex", justifyContent: "center" }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
      <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>Portefeuille vide</div>
      <div style={{ fontSize: "13px", lineHeight: "1.6", color: "rgba(255,255,255,0.55)", marginBottom: "20px" }}>
        Ajoutez vos positions pour voir votre tableau de bord.
      </div>
      <button onClick={() => onTabChange(TABS.PORTFOLIO)}
        style={{ display: "block", width: "100%", maxWidth: "280px", margin: "0 auto 10px", background: "#1a3a5c", color: "#fff", border: "none", borderRadius: "12px", padding: "13px 24px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
        Ajouter ma première position →
      </button>
      {!hasAI() && (
        <button onClick={() => onTabChange(TABS.PROFIL)}
          style={{ display: "block", width: "100%", maxWidth: "280px", margin: "0 auto", background: "transparent", color: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: "12px", padding: "12px 24px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
          Activer l'IA (clé Claude) →
        </button>
      )}
    </div>
  );

  return (
    <div>
      <MarketStatusBar />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px", marginBottom: "16px" }}>
        <ColCompte  account={account} profil={profil} />
        <ColValeur  positions={positions} especes={especes} cumul={cumul} hidden={hidden} />
        <ColPerfs   positions={positions} account={account} profil={profil} />
      </div>
      <CourbeEvolution hidden={hidden} positions={positions} account={account} />
    </div>
  );
}
