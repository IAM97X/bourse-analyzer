import { useMemo, useState, useEffect, useRef } from "react";
import { sanitizePositions, fmtEur } from "../lib/finance";
import { load } from "../lib/storage";
import { DEFAULT_POSITIONS, DEFAULT_PROFIL } from "../constants/config";
import { TABS } from "../constants/tabs";
import { fetchWithProxy, hasFMPKey, FMP_KEY } from "../lib/api";
import { fetchFMPHistorical } from "../lib/market";

const SNAPSHOTS_KEY      = "bourse_snapshots";
const TICKER_CACHE_KEY   = "bourse_isin_ticker_cache";
const EVOLUTION_CSV_KEY  = "bourse_evolution_csv";

// Résout une liste d'ISINs en tickers Yahoo — utilise le cache, résout les manquants via Yahoo Search
async function resolveISINsToTickers(isins) {
  const cache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
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

// Fetche l'historique journalier pour un ISIN — FMP en priorité, Yahoo en fallback
async function fetchHistoricalByISIN(isin, ticker, fromDate, toDate) {
  // 1. FMP (ISIN direct, données Euronext fiables)
  if (hasFMPKey()) {
    try {
      const rows = await fetchFMPHistorical(isin, fromDate, toDate);
      if (rows.length > 0) {
        const map = {};
        for (const r of rows) map[r.date] = r.close;
        return map;
      }
    } catch {}
  }
  // 2. Yahoo Finance (fallback, nécessite ticker résolu)
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
      borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.08)",
      cursor: debug ? "help" : undefined,
    }}>
      <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", fontWeight: "400", lineHeight: "1.4", flex: "1" }}>
        {label}
      </span>
      <span style={{ fontSize: "13px", fontWeight: "700", color: color || "#fff", whiteSpace: "nowrap", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

// ── Carte dark ─────────────────────────────────────────────────────────────────
function Card({ children }) {
  return (
    <div style={{
      background: "linear-gradient(160deg, #112240 0%, #1a3a5c 100%)",
      borderRadius: "16px",
      padding: "18px 20px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
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
  const courtierLabel = {
    boursobank: "Boursobank",
    degiro:     "DEGIRO",
    fortuneo:   "Fortuneo",
    saxo:       "Saxo Banque",
    bourse_direct: "Bourse Direct",
    interactive_brokers: "Interactive Brokers",
  }[profil.courtier] || (profil.courtier || "—");

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
  { label: "1M",  days: 30  },
  { label: "3M",  days: 90  },
  { label: "6M",  days: 180 },
  { label: "1A",  days: 365 },
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
  const csvPoints = csvData?.rows ?? null;
  const csvBroker = csvData?.broker ?? null;
  const fileInputRef = useRef(null);
  const svgRef = useRef(null);
  const blur = hidden ? { filter: "blur(6px)", userSelect: "none", pointerEvents: "none" } : {};

  const handleCSVImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows, broker } = detectAndParseEvolutionCSV(ev.target.result);
      if (rows.length > 1) {
        const payload = { rows, broker, importedAt: Date.now() };
        try { localStorage.setItem(EVOLUTION_CSV_KEY, JSON.stringify(payload)); } catch {}
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

  // Priorité : CSV Boursobank > Yahoo reconstruit > Snapshots > Synthèse
  const dataSource = csvFiltered ? "boursobank" : yahooPoints ? "yahoo" : "snapshots";
  const rawPoints  = csvFiltered ?? yahooPoints ?? snapPoints ?? syntheticPoints;

  const { points, current, first, investi, perfCumFromCSV } = useMemo(() => {
    if (!rawPoints || rawPoints.length < 2) return { points: null };
    const last = rawPoints[rawPoints.length - 1];
    return {
      points:         rawPoints,
      current:        last.valeur,
      first:          rawPoints[0].valeur,
      investi:        last.capitalVerse || last.investi || 0,
      perfCumFromCSV: dataSource === "boursobank" ? (last.perfCumulee ?? null) : null,
    };
  }, [rawPoints, dataSource]);

  if (yahooLoading && !snapPoints) return (
    <div style={{ background: "linear-gradient(145deg,#0d1f33 0%,#1a3a5c 100%)", borderRadius: "16px", padding: "28px", textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: "12px" }}>
      Reconstruction depuis l'historique des transactions…
    </div>
  );

  if (!points) return (
    <div style={{ background: "linear-gradient(145deg,#0d1f33 0%,#1a3a5c 100%)", borderRadius: "16px", padding: "28px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>
      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSVImport} />
      <div style={{ marginBottom: "12px" }}>Aucune donnée disponible</div>
      <button onClick={() => fileInputRef.current?.click()}
        style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
        + Importer CSV Boursobank
      </button>
      <div style={{ marginTop: "8px", fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>Boursobank · Fortuneo · DEGIRO</div>
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

  const W = 600; const H = 140;
  const padT = 18, padB = 12, padL = 12, padR = 52;
  const values = points.map(p => p.valeur);
  const minV = Math.min(...values), maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const toX = i => padL + (i / (points.length - 1)) * (W - padL - padR);
  const toY = v => padT + (1 - (v - minV) / range) * (H - padT - padB);

  const pts = points.map((p, i) => [toX(i), toY(p.valeur)]);

  // Courbe bezier lissée (Catmull-Rom → bezier cubique)
  const catmullRom = (ps) => {
    if (ps.length < 2) return "";
    const t = 0.4;
    let d = `M${ps[0][0].toFixed(2)},${ps[0][1].toFixed(2)}`;
    for (let i = 0; i < ps.length - 1; i++) {
      const p0 = ps[Math.max(0, i - 1)];
      const p1 = ps[i];
      const p2 = ps[i + 1];
      const p3 = ps[Math.min(ps.length - 1, i + 2)];
      const cp1x = p1[0] + (p2[0] - p0[0]) * t / 2;
      const cp1y = p1[1] + (p2[1] - p0[1]) * t / 2;
      const cp2x = p2[0] - (p3[0] - p1[0]) * t / 2;
      const cp2y = p2[1] - (p3[1] - p1[1]) * t / 2;
      d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    return d;
  };

  const smoothPath = catmullRom(pts);
  const areaD = `${smoothPath} L${pts[pts.length-1][0].toFixed(2)},${H-padB} L${pts[0][0].toFixed(2)},${H-padB} Z`;

  const yTicks = [minV, (minV+maxV)/2, maxV].map(v => ({ v, y: toY(v), label: v >= 1000 ? (v/1000).toFixed(1)+"k" : v.toFixed(0) }));
  const xDates = [0, Math.floor((points.length-1)/2), points.length-1].map(i => ({ i, x: toX(i), label: points[i].date.slice(5).replace("-","/") }));

  // Couleurs thème clair
  const bg     = "#fff";
  const ink    = "#1a2d4a";
  const inkSub = "rgba(26,45,74,0.45)";
  const inkMut = "rgba(26,45,74,0.28)";
  const cardBg = "#f4f6f9";

  return (
    <div style={{ background: bg, borderRadius: "16px", padding: "18px 18px 16px", boxShadow: "0 2px 16px rgba(26,45,74,0.10)", border: "1px solid rgba(26,45,74,0.08)" }}>

      {/* Titre + sélecteur */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "10px", color: inkSub, fontWeight: "700", letterSpacing: "1.4px", textTransform: "uppercase" }}>
          Évolution du portefeuille
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {dataSource === "boursobank" && (
            <span style={{ fontSize: "9px", color: lineClrUp, fontWeight: "700", letterSpacing: "0.5px", background: `${lineClrUp}14`, padding: "2px 7px", borderRadius: "10px", border: `1px solid ${lineClrUp}33` }}>● {csvBroker || "CSV"}</span>
          )}
          {dataSource === "yahoo" && (
            <span style={{ fontSize: "9px", color: inkMut, fontWeight: "600", letterSpacing: "0.5px" }}>● Yahoo</span>
          )}
          {dataSource === "snapshots" && (
            <span style={{ fontSize: "9px", color: inkMut, fontWeight: "600", letterSpacing: "0.5px" }}>● Snapshots</span>
          )}
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSVImport} />
          <button onClick={() => fileInputRef.current?.click()}
            title={csvPoints ? `${csvPoints.length} jours importés (${csvBroker}) — cliquez pour mettre à jour` : "Importer export CSV de votre courtier"}
            style={{ padding: "3px 9px", borderRadius: "6px", border: `1px solid ${csvPoints ? lineClrUp+"44" : "rgba(26,45,74,0.15)"}`, background: csvPoints ? `${lineClrUp}12` : cardBg, color: csvPoints ? lineClrUp : inkSub, fontSize: "10px", fontWeight: "600", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            {csvPoints ? "↑ CSV" : "+ CSV"}
          </button>
          <div style={{ display: "flex", gap: "2px" }}>
            {PERIODS.map(({ label, days }) => (
              <button key={days} onClick={() => setPeriod(days)}
                style={{ padding: "3px 8px", borderRadius: "6px", border: "none", background: period === days ? ink : "transparent", color: period === days ? "#fff" : inkSub, fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Métriques */}
      <div style={{ display: "grid", gridTemplateColumns: pvLatent !== null && !flatPeriod ? "1fr 1fr 1fr" : "1fr 1fr", gap: "8px", marginBottom: "14px", ...blur }}>
        <div style={{ background: cardBg, borderRadius: "10px", padding: "10px 12px" }}>
          <div style={{ fontSize: "9px", color: inkMut, fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "4px" }}>Valeur actuelle</div>
          <div style={{ fontSize: "16px", fontWeight: "900", color: ink, letterSpacing: "-0.02em" }}>{fmtEur(current)}</div>
        </div>
        <div style={{ background: cardBg, borderRadius: "10px", padding: "10px 12px" }}>
          <div style={{ fontSize: "9px", color: inkMut, fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "4px" }}>
            {flatPeriod ? "Gain total · depuis achat" : dataSource === "boursobank" ? "Perf. cumulée · versements inclus" : "Croissance · versements inclus"}
          </div>
          <div style={{ fontSize: "15px", fontWeight: "800", color: lineClr }}>
            {flatPeriod ? <>{pvLatent >= 0 ? "+" : ""}{fmtEur(pvLatent)}</> : <>{isUp ? "+" : ""}{fmtEur(delta)}</>}
          </div>
          <div style={{ fontSize: "10px", color: lineClr, opacity: 0.85 }}>
            {flatPeriod
              ? (pvPct !== null ? `${pvPct >= 0 ? "+" : ""}${pvPct.toFixed(2)} % vs investi` : "achats − ventes réels")
              : perfCumFromCSV !== null ? `${perfCumFromCSV >= 0 ? "+" : ""}${perfCumFromCSV.toFixed(2)} %` : `${isUp ? "+" : ""}${perf.toFixed(2)} %`}
          </div>
        </div>
        {pvLatent !== null && !flatPeriod && (
          <div style={{ background: cardBg, borderRadius: "10px", padding: "10px 12px" }}>
            <div style={{ fontSize: "9px", color: inkMut, fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "4px" }}>Gain vs capital versé</div>
            <div style={{ fontSize: "15px", fontWeight: "800", color: pvLatent >= 0 ? lineClrUp : lineClrDown }}>{pvLatent >= 0 ? "+" : ""}{fmtEur(pvLatent)}</div>
            <div style={{ fontSize: "10px", color: inkMut }}>achats − ventes réels</div>
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
            <line key={i} x1={padL} y1={y.toFixed(1)} x2={W-padR} y2={y.toFixed(1)}
              stroke="rgba(26,45,74,0.07)" strokeWidth="1" strokeDasharray="4 6"/>
          ))}
          <path d={areaD} fill="url(#chartGradLight)"/>
          <path d={smoothPath} fill="none" stroke={lineClr} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
          {hover && (
            <line x1={hover.x.toFixed(1)} y1={padT} x2={hover.x.toFixed(1)} y2={H - padB}
              stroke="rgba(26,45,74,0.15)" strokeWidth="1"/>
          )}
          {hover && (
            <circle cx={hover.x.toFixed(1)} cy={toY(points[hover.idx].valeur).toFixed(1)} r="4"
              fill={lineClr} stroke="#fff" strokeWidth="2"/>
          )}
        </svg>

        {/* Tooltip */}
        {hover && (() => {
          const p     = points[hover.idx];
          const pDate = new Date(p.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
          const pctX  = (hover.x / W) * 100;
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
              <div style={{ fontSize: "10px", color: inkSub, fontWeight: "500", marginBottom: "4px", whiteSpace: "nowrap" }}>{pDate}</div>
              <div style={{ fontSize: "17px", fontWeight: "800", color: ink, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>{fmtEur(p.valeur)}</div>
              {perfDisplay !== null && (
                <div style={{ display: "inline-block", marginTop: "4px", background: `${pClr}14`, borderRadius: "6px", padding: "2px 7px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: pClr }}>{perfDisplay >= 0 ? "+" : ""}{perfDisplay.toFixed(2)} %</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Labels Y */}
        <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: `${padR}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", paddingBottom: `${padB}px`, paddingTop: `${padT - 6}px`, boxSizing: "border-box" }}>
          {[...yTicks].reverse().map(({ label }, i) => (
            <span key={i} style={{ fontSize: "10px", color: inkMut, fontWeight: "500", lineHeight: 1, display: "block", textAlign: "right", paddingRight: "4px" }}>{label}</span>
          ))}
        </div>

        {/* Labels X */}
        <div style={{ position: "relative", height: "18px", marginTop: "4px" }}>
          {xDates.map(({ label, x, i: idx }) => {
            const pct = (x / W) * 100;
            return (
              <span key={idx} style={{
                position: "absolute", left: `${pct}%`,
                transform: idx === 0 ? "none" : idx === points.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                fontSize: "10px", color: inkMut, fontWeight: "500", whiteSpace: "nowrap",
              }}>{label}</span>
            );
          })}
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
    <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.5)" }}>
      <div style={{ fontSize: "40px", marginBottom: "16px" }}>📂</div>
      <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff", marginBottom: "8px" }}>Portefeuille vide</div>
      <div style={{ fontSize: "13px", lineHeight: "1.6" }}>
        Ajoutez vos positions dans l'onglet <strong>Positions</strong> pour voir votre tableau de bord.
      </div>
      <button onClick={() => onTabChange(TABS.PORTFOLIO)}
        style={{ marginTop: "20px", background: "#1a3a5c", color: "#fff", border: "none", borderRadius: "12px", padding: "12px 24px", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
        Ajouter des positions →
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", marginBottom: "16px" }}>
        <ColCompte  account={account} profil={profil} />
        <ColValeur  positions={positions} especes={especes} cumul={cumul} hidden={hidden} />
        <ColPerfs   positions={positions} account={account} profil={profil} />
      </div>
      <CourbeEvolution hidden={hidden} positions={positions} account={account} />
    </div>
  );
}
