import { useState, useRef, useMemo } from "react";
import ReactDOM from "react-dom";
import { C, shadow } from "../constants/theme";
import { fmtEur } from "../lib/finance";
import { load, save } from "../lib/storage";
import { fetchWithProxy } from "../lib/api";

const SNAPSHOTS_KEY = "bourse_snapshots";

// ─── Glossaire pédagogique ───────────────────────────────────────────────────
const GLOSSARY = {
  "Valeur du portefeuille": "La valeur totale de toutes vos positions au cours actuel du marché. Elle fluctue chaque jour selon les prix.",
  "Capital investi": "La somme d'argent que vous avez réellement versée pour acheter vos titres. À renseigner dans l'onglet Profil pour un calcul précis.",
  "Plus-value latente": "Le gain (ou la perte) sur vos investissements. 'Latente' signifie non réalisée : vous n'avez pas encore vendu, c'est une valeur théorique.",
  "Variation du jour": "L'évolution de votre portefeuille depuis la clôture d'hier. En vert = votre portefeuille a progressé aujourd'hui.",
  "PRU": "Prix de Revient Unitaire — le prix moyen auquel vous avez acheté un titre, frais inclus. Sert à calculer votre gain ou perte réelle.",
  "RSI": "Indice de Force Relative (0 à 100). Au-dessus de 70 = titre suracheté (risque de baisse). En dessous de 30 = titre survendu (opportunité possible). Autour de 50 = neutre.",
  "MA50": "Moyenne des cours sur les 50 derniers jours. Indique la tendance à court/moyen terme. Si le cours est au-dessus, c'est plutôt positif.",
  "MA200": "Moyenne des cours sur les 200 derniers jours. Indique la tendance long terme. Un des indicateurs les plus suivis par les professionnels.",
  "DCA": "Dollar Cost Averaging — stratégie d'investissement régulier (ex: 100€/mois). Permet de lisser le prix d'achat et de réduire l'impact des fluctuations.",
  "ETF": "Exchange Traded Fund — fonds coté en bourse qui réplique un indice (ex: CAC 40, S&P 500). Simple, diversifié et peu coûteux.",
  "ISIN": "Code à 12 caractères qui identifie un titre financier de façon unique dans le monde entier (ex: FR0000131104 pour Total).",
  "Signal": "Recommandation générée par l'IA (ACHAT, RENFORCER, ATTENDRE, PRUDENCE, VENDRE) basée sur l'analyse des actualités. Informatif uniquement, pas un conseil.",
  "Projection": "Extrapolation mathématique de la tendance passée vers le futur. La bande grisée représente l'incertitude. Non garantie, à titre illustratif.",
  "PEA": "Plan d'Épargne en Actions — enveloppe fiscale française avantageuse pour investir en bourse. Après 5 ans, les gains sont exonérés d'impôt sur le revenu.",
  "CTO": "Compte-Titres Ordinaire — compte boursier classique sans avantage fiscal particulier. Permet d'investir sur tous les marchés mondiaux.",
};

// ─── Composant tooltip pédagogique ───────────────────────────────────────────
export function InfoTip({ term, text, position = "top" }) {
  const [visible, setVisible] = useState(false);
  const [rect, setRect]       = useState(null);
  const btnRef  = useRef(null);
  const content = text || GLOSSARY[term] || term;

  const show = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setVisible(true);
  };
  const hide = () => setVisible(false);

  const tipStyle = rect ? {
    position: "fixed",
    left:  rect.left + rect.width / 2,
    ...(position === "top"
      ? { top: rect.top - 10,    transform: "translate(-50%, -100%)" }
      : { top: rect.bottom + 10, transform: "translateX(-50%)" }),
    background: "#111214", color: "#F8F9FA",
    borderRadius: "10px", padding: "10px 13px",
    fontSize: "11px", lineHeight: "1.55",
    width: "240px", zIndex: 99999,
    boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
    pointerEvents: "none",
    fontFamily: "'DM Sans', sans-serif", fontWeight: "400",
  } : {};

  return (
    <span style={{ display: "inline-flex", alignItems: "center", marginLeft: "5px" }}>
      <span
        ref={btnRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onTouchStart={e => { e.preventDefault(); visible ? hide() : show(); }}
        style={{ width: "15px", height: "15px", borderRadius: "50%", background: "rgba(148,163,184,0.2)", color: "#94A3B8", fontSize: "9px", fontWeight: "800", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "help", flexShrink: 0, userSelect: "none", border: "1px solid rgba(148,163,184,0.3)", fontFamily: "'DM Sans', sans-serif" }}>
        ?
      </span>
      {visible && rect && ReactDOM.createPortal(
        <span style={tipStyle}>
          <strong style={{ display: "block", marginBottom: "4px", color: "#fff", fontWeight: "700", fontSize: "12px" }}>{term}</strong>
          {content}
          <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", ...(position === "top" ? { top: "100%", borderTop: "5px solid #111214" } : { bottom: "100%", borderBottom: "5px solid #111214" }) }} />
        </span>,
        document.body
      )}
    </span>
  );
}

// ─── Portfolio Chart — graphique évolution portefeuille (Google Finance style) ─
async function resolveIsinToTicker(isin) {
  try {
    const res  = await fetchWithProxy(`https://query1.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=5&newsCount=0&enableFuzzyQuery=false`);
    const json = await res.json();
    const quotes = json.quotes || [];
    const eq = quotes.find(q => q.quoteType === "EQUITY" && q.symbol) || quotes.find(q => q.symbol);
    return eq?.symbol || null;
  } catch { return null; }
}

async function rebuildPortfolioHistory(account, onProgress) {
  const acc = account || "PEA";
  const progress = onProgress || (() => {});

  // ── Étape 1 : charger les transactions ────────────────────────────────────
  const ops = (() => { try { return JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]"); } catch { return []; } })()
    .filter(o => (o.compte || "PEA") === acc)
    .sort((a, b) => a.date < b.date ? -1 : 1);

  const portfolio = load("bourse_portfolio", []).filter(p => (p.compte || "PEA") === acc);

  // ── Étape 2 : mapping ISIN → ticker (cache + portfolio + résolution auto) ─
  const cache = (() => { try { return JSON.parse(localStorage.getItem("bourse_isin_ticker_cache") || "{}"); } catch { return {}; } })();
  const isinToTicker = { ...cache };
  portfolio.forEach(p => { if (p.isin && p.ticker) isinToTicker[p.isin] = p.ticker; });

  const allIsins = [...new Set([
    ...ops.map(o => o.isin).filter(Boolean),
    ...portfolio.map(p => p.isin).filter(Boolean),
  ])];

  // Résolution automatique des ISIN sans ticker connu
  const unresolved = allIsins.filter(isin => !isinToTicker[isin]);
  if (unresolved.length) {
    progress(`Résolution de ${unresolved.length} ISIN...`);
    for (let i = 0; i < unresolved.length; i++) {
      const isin = unresolved[i];
      const ticker = await resolveIsinToTicker(isin);
      if (ticker) {
        isinToTicker[isin] = ticker;
        cache[isin] = ticker;
      }
      progress(`Résolution ISIN ${i + 1}/${unresolved.length}${ticker ? ` → ${ticker}` : " (non trouvé)"}`);
    }
    try { localStorage.setItem("bourse_isin_ticker_cache", JSON.stringify(cache)); } catch {}
  }

  const resolvedIsins = allIsins.filter(isin => isinToTicker[isin]);
  const tickers = [...new Set(resolvedIsins.map(isin => isinToTicker[isin]))];
  if (!tickers.length) return { count: 0, resolved: 0, total: allIsins.length };

  // ── Étape 3 : cours historiques Yahoo Finance ──────────────────────────────
  progress(`Téléchargement des cours pour ${tickers.length} valeur(s)...`);
  const pricesByTicker = {};
  await Promise.all(tickers.map(async ticker => {
    try {
      const res  = await fetchWithProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5y`);
      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (!result) { pricesByTicker[ticker] = {}; return; }
      const ts     = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      pricesByTicker[ticker] = {};
      ts.forEach((t, i) => {
        if (closes[i] != null)
          pricesByTicker[ticker][new Date(t * 1000).toISOString().slice(0, 10)] = closes[i];
      });
    } catch { pricesByTicker[ticker] = {}; }
  }));

  // ── Étape 4 : rejouer les transactions jour par jour ──────────────────────
  const allDates = new Set(Object.values(pricesByTicker).flatMap(m => Object.keys(m)));
  const useOps   = ops.length > 0;
  const earliest = useOps
    ? ops[0].date
    : portfolio.map(p => p.dateAchat).filter(Boolean).sort()[0] || new Date().toISOString().slice(0, 10);
  const today  = new Date().toISOString().slice(0, 10);
  const sorted = [...allDates].filter(d => d >= earliest && d <= today).sort();

  progress(`Calcul de ${sorted.length} jours de marché...`);
  const synth = [];

  if (useOps) {
    // Méthode précise : rejouer les transactions chronologiquement
    const holdings = {}; // isin → { qte, pru } — état courant
    let opIdx = 0;
    for (const date of sorted) {
      // Appliquer toutes les transactions <= date
      while (opIdx < ops.length && ops[opIdx].date <= date) {
        const op   = ops[opIdx++];
        const isin = op.isin;
        if (!isin) continue;
        if (!holdings[isin]) holdings[isin] = { qte: 0, pru: 0 };
        const h    = holdings[isin];
        const qte  = parseFloat(op.quantite)    || 0;
        const prix = parseFloat(op.prixUnitaire) || 0;
        const frais= parseFloat(op.frais)        || 0;
        if (op.type === "ACHAT") {
          const total = h.pru * h.qte + prix * qte + frais;
          h.qte += qte;
          h.pru  = h.qte > 0 ? total / h.qte : 0;
        } else if (op.type === "VENTE") {
          h.qte = Math.max(0, h.qte - qte);
        }
      }
      let valeur = 0, investi = 0;
      for (const [isin, h] of Object.entries(holdings)) {
        if (h.qte <= 0) continue;
        const ticker = isinToTicker[isin];
        const price  = ticker ? pricesByTicker[ticker]?.[date] : null;
        if (!price) continue;
        valeur  += price * h.qte;
        investi += h.pru * h.qte;
      }
      if (valeur > 0) synth.push({ date, valeur, investi, source: "transactions" });
    }
  } else {
    // Fallback : positions actuelles avec dateAchat
    const withTicker = portfolio.filter(p => p.dateAchat && p.quantite > 0);
    for (const date of sorted) {
      let valeur = 0, investi = 0;
      for (const pos of withTicker) {
        if (pos.dateAchat > date) continue;
        const ticker = isinToTicker[pos.isin] || pos.ticker;
        const price  = ticker ? pricesByTicker[ticker]?.[date] : null;
        if (!price) continue;
        valeur  += price * pos.quantite;
        investi += (pos.pru || 0) * pos.quantite;
      }
      if (valeur > 0) synth.push({ date, valeur, investi, source: "positions" });
    }
  }

  // ── Étape 5 : fusionner (snapshots réels prioritaires) ────────────────────
  const existing = (() => { try { return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]"); } catch { return []; } })();
  const byDate   = {};
  synth.forEach(s   => byDate[s.date] = s);
  existing.forEach(s => byDate[s.date] = s);
  const merged = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-730);
  save(SNAPSHOTS_KEY, merged);
  return { count: merged.length, resolved: resolvedIsins.length, total: allIsins.length };
}

export default function PortfolioChart({ hidden, account }) {
  const PERIODS = [
    { label: "1 S", days: 7   },
    { label: "1 M", days: 30  },
    { label: "3 M", days: 90  },
    { label: "6 M", days: 180 },
    { label: "1 A", days: 365 },
    { label: "Max", days: 9999},
  ];
  const [pidx, setPidx]           = useState(() => { try { return parseInt(localStorage.getItem("bourse_chart_pidx") || "5", 10); } catch { return 5; } });
  const [hover, setHover]         = useState(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState(null);
  const [snapVersion, setSnapVersion] = useState(0);
  const [visibleCurves, setVisibleCurves] = useState({ valeur: true, verse: true, pv: true, drawdown: false });
  const svgRef = useRef(null);

  const changePidx = i => { setPidx(i); try { localStorage.setItem("bourse_chart_pidx", String(i)); } catch {} };
  const toggleCurve = k => setVisibleCurves(v => ({ ...v, [k]: !v[k] }));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allSnaps = useMemo(() => load("bourse_snapshots", []), [snapVersion]);
  const cutoff   = Date.now() - PERIODS[pidx].days * 86400000;
  const snaps    = allSnaps.filter(s => new Date(s.date).getTime() >= cutoff);
  const rawSnaps = snaps.length >= 2 ? snaps : (allSnaps.length >= 2 ? allSnaps : null);

  const displaySnaps = useMemo(() => {
    if (!rawSnaps || rawSnaps.length < 3) return rawSnaps || [];
    const gv = s => s.valeur || s.total || 0;
    return rawSnaps.filter((s, i, arr) => {
      if (i === 0 || i === arr.length - 1) return true;
      const v = gv(s);
      const neighbors = [];
      for (let j = Math.max(0, i - 2); j <= Math.min(arr.length - 1, i + 2); j++) {
        if (j !== i) neighbors.push(gv(arr[j]));
      }
      const sorted = [...neighbors].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      return med === 0 || Math.abs(v - med) / med < 0.20;
    });
  }, [rawSnaps]);

  if (displaySnaps.length < 2) return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "32px", textAlign: "center", marginTop: "16px", boxShadow: shadow.card }}>
      <div style={{ fontSize: "14px", fontWeight: "700", color: C.ink, marginBottom: "6px" }}>Historique en construction</div>
      <div style={{ fontSize: "12px", color: C.inkSubtle, marginBottom: "16px" }}>Clique sur <strong>Reconstituer</strong> pour générer l'historique depuis tes transactions.</div>
      <button onClick={async () => {
        setRebuilding(true);
        try {
          const r = await rebuildPortfolioHistory(account, m => setRebuildMsg(m));
          setSnapVersion(v => v + 1);
          setRebuildMsg(`${r.count} points générés`);
        } catch (e) { setRebuildMsg("Erreur : " + e.message); }
        setRebuilding(false);
      }} disabled={rebuilding} style={{ padding: "10px 24px", borderRadius: "10px", background: C.navy, color: "#fff", border: "none", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
        {rebuilding ? "Reconstitution…" : "Reconstituer l'historique"}
      </button>
      {rebuildMsg && <div style={{ marginTop: "10px", fontSize: "11px", color: C.green, fontWeight: "600" }}>{rebuildMsg}</div>}
    </div>
  );

  // ── Données ──────────────────────────────────────────────────────────────────
  const vals  = displaySnaps.map(s => s.valeur || s.total || 0);
  const dates = displaySnaps.map(s => new Date(s.date).getTime());

  // Capital versé — monotone croissant
  const cvVals = (() => {
    const raw = displaySnaps.map(s => s.capitalVerse || s.investi || 0);
    let mx = 0; return raw.map(v => { mx = Math.max(mx, v); return mx; });
  })();
  const hasCv = cvVals.some(v => v > 0);

  // Plus-value = valeur − capital versé
  const pvVals = displaySnaps.map((_, i) => vals[i] - (hasCv ? cvVals[i] : 0));

  // Echelle Y — inclut toutes les courbes visibles + marge au-dessus
  const allY = [
    ...vals,
    ...(hasCv ? cvVals : []),
  ];
  const rawMin = Math.min(...allY);
  const rawMax = Math.max(...allY);
  const span   = rawMax - rawMin || rawMax;
  const minV   = Math.max(0, rawMin - span * 0.08);
  const maxV   = rawMax + span * 0.14;
  const minT = dates[0], maxT = dates[dates.length - 1];

  // ── SVG ──────────────────────────────────────────────────────────────────────
  const VW = 800, VH = 260, ML = 8, MR = 70, MT = 16, MB = 32;
  const CW = VW - ML - MR, CH = VH - MT - MB;
  const xS = t => ML + ((t - minT) / (maxT - minT || 1)) * CW;
  const yS = v => MT + CH - ((v - minV) / (maxV - minV || 1)) * CH;
  const pts = arr => arr.map((v, i) => `${xS(dates[i]).toFixed(1)},${yS(v).toFixed(1)}`).join(" L ");

  const first = vals[0], last = vals[vals.length - 1];
  const isUp  = last >= first;
  const lineColor = isUp ? "#1D7A4A" : "#C0392B";

  // Zone gain/perte (entre valeur et capital versé) — clampée dans la zone SVG
  const clampY = y => Math.max(MT, Math.min(MT + CH, y));
  const pvZone = hasCv ? `M ${vals.map((v, i) => `${xS(dates[i]).toFixed(1)},${clampY(yS(v)).toFixed(1)}`).join(" L ")} L ${[...displaySnaps].reverse().map((_, ri) => { const i = displaySnaps.length - 1 - ri; return `${xS(dates[i]).toFixed(1)},${clampY(yS(cvVals[i])).toFixed(1)}`; }).join(" L ")} Z` : null;

  // Aire sous la courbe valeur
  const areaPath = `M ${xS(dates[0]).toFixed(1)},${MT+CH} L ${pts(vals)} L ${xS(dates[dates.length-1]).toFixed(1)},${MT+CH} Z`;

  const gridVals = Array.from({ length: 5 }, (_, i) => minV + (maxV - minV) * i / 4);
  const xLabels  = Array.from({ length: 5 }, (_, i) => ({ t: minT + (maxT - minT) * i / 4, x: xS(minT + (maxT - minT) * i / 4) }));
  const xFmt = pidx <= 1 ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" };

  const lastCV = cvVals[cvVals.length - 1] || 0;
  const lastPV = pvVals[pvVals.length - 1] || 0;

  // Variation période
  const dEur = last - first;
  const dPct = first > 0 ? (dEur / first) * 100 : 0;
  const pvEur = hasCv ? (last - lastCV) : 0;
  const pvPct = hasCv && lastCV > 0 ? (pvEur / lastCV) * 100 : 0;
  const blurStyle = hidden ? { filter: "blur(6px)", userSelect: "none" } : {};

  const handleMouseMove = e => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VW;
    const clamp = Math.max(ML, Math.min(ML + CW, svgX));
    const t = minT + ((clamp - ML) / CW) * (maxT - minT);
    let ci = 0;
    dates.forEach((d, i) => { if (Math.abs(d - t) < Math.abs(dates[ci] - t)) ci = i; });
    const snap = displaySnaps[ci];
    if (!snap) return;
    setHover({ x: xS(dates[ci]), y: yS(vals[ci]), val: vals[ci], date: snap.date, cv: cvVals[ci] || 0, pv: pvVals[ci] || 0 });
  };

  const pvLabel = lastPV >= 0 ? "Plus-value" : "Perte";
  const pvLegColor = lastPV >= 0 ? "#059669" : "#C0392B";
  const LEGEND = [
    { key: "valeur",    label: "Valeur",        color: lineColor,   dash: false },
    { key: "verse",     label: "Capital versé", color: "#C8972A",   dash: true  },
    { key: "pv",        label: pvLabel,         color: pvLegColor,  dash: false, fill: true },
    { key: "drawdown",  label: "Drawdown",      color: "#EF4444",   dash: false, fill: true },
  ];

  // Drawdown : (valeur - max_courant) / max_courant * 100
  const ddVals = (() => {
    let runMax = vals[0];
    return vals.map(v => { runMax = Math.max(runMax, v); return runMax > 0 ? (v - runMax) / runMax * 100 : 0; });
  })();
  const minDD = Math.min(...ddVals);
  const DDH = 60; // hauteur du strip drawdown
  const yDD = v => DDH - (v - minDD) / (0 - minDD || 1) * (DDH - 4);

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "20px 22px 16px", marginTop: "16px", boxShadow: shadow.card }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <div style={blurStyle}>
          <div style={{ fontSize: "30px", fontWeight: "800", color: C.ink, letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{fmtEur(last)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", fontWeight: "700", color: isUp ? "#1D7A4A" : "#C0392B" }}>
              {dEur >= 0 ? "+" : ""}{fmtEur(dEur)} ({dPct >= 0 ? "+" : ""}{dPct.toFixed(2)}%)
            </span>
            <span style={{ fontSize: "11px", color: C.inkSubtle }}>sur la période</span>
            {hasCv && <span style={{ fontSize: "11px", color: C.inkSubtle, borderLeft: `1px solid ${C.border}`, paddingLeft: "10px" }}>
              {pvEur >= 0 ? "PV totale" : "Perte totale"} <strong style={{ color: pvEur >= 0 ? "#1D7A4A" : "#C0392B" }}>{pvEur >= 0 ? "+" : ""}{fmtEur(pvEur)} ({pvPct >= 0 ? "+" : ""}{pvPct.toFixed(1)}%)</strong>
            </span>}
          </div>
          {displaySnaps.length >= 2 && (
            <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px" }}>
              {new Date(displaySnaps[0].date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} — {new Date(displaySnaps[displaySnaps.length-1].date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
              <span style={{ marginLeft: "8px", color: C.accent, fontWeight: "600" }}>· {displaySnaps.length} points</span>
            </div>
          )}
        </div>

        {/* Sélecteur période + Reconstituer */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
          <div style={{ display: "flex", gap: "2px", background: C.snowOff, borderRadius: "10px", padding: "3px" }}>
            {PERIODS.map((p, i) => (
              <button key={p.label} onClick={() => changePidx(i)}
                style={{ padding: "5px 11px", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "600", background: i === pidx ? "#fff" : "transparent", color: i === pidx ? C.ink : C.inkSubtle, boxShadow: i === pidx ? "0 1px 4px rgba(0,0,0,0.10)" : "none", transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif" }}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={async () => {
            setRebuilding(true); setRebuildMsg(null);
            try {
              const r = await rebuildPortfolioHistory(account, m => setRebuildMsg(m));
              setSnapVersion(v => v + 1);
              setRebuildMsg(`${r.count} points · ${r.resolved}/${r.total} ISIN`);
            } catch (e) { setRebuildMsg("Erreur"); }
            setRebuilding(false);
          }} disabled={rebuilding} style={{ fontSize: "10px", fontWeight: "600", color: C.inkSubtle, background: "transparent", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "4px 10px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {rebuilding ? "⟳ Reconstitution…" : "⟳ Reconstituer"}
          </button>
          {rebuildMsg && <span style={{ fontSize: "9px", color: C.green, fontWeight: "600" }}>{rebuildMsg}</span>}
        </div>
      </div>

      {/* ── SVG Chart ── */}
      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", height: "auto", cursor: "crosshair", display: "block" }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>

        {/* Grille */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={ML} x2={ML+CW} y1={yS(v)} y2={yS(v)} stroke="rgba(148,163,184,0.15)" strokeWidth="1" strokeDasharray="4,6" />
            <text x={ML+CW+6} y={yS(v)+4} fontSize="9" fill="#94A3B8" fontFamily="'DM Sans', sans-serif">
              {v >= 10000 ? (v/1000).toFixed(1)+"k" : Math.round(v)}
            </text>
          </g>
        ))}

        {/* Labels X */}
        {xLabels.map(({ t, x }, i) => (
          <text key={i} x={x} y={MT+CH+22} fontSize="9" fill="#94A3B8" fontFamily="'DM Sans', sans-serif"
            textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>
            {new Date(t).toLocaleDateString("fr-FR", xFmt)}
          </text>
        ))}

        {/* Aire valeur */}
        {visibleCurves.valeur && <path d={areaPath} fill={isUp ? "rgba(29,122,74,0.07)" : "rgba(192,57,43,0.07)"} />}

        {/* Zone gain/perte (fill entre valeur et capital versé) */}
        {visibleCurves.pv && hasCv && pvZone && (
          <path d={pvZone} fill={lastPV >= 0 ? "rgba(5,150,105,0.13)" : "rgba(200,70,50,0.09)"} />
        )}

        {/* Courbe capital versé */}
        {visibleCurves.verse && hasCv && (() => {
          const yCV = Math.max(MT + 10, Math.min(MT + CH - 10, yS(lastCV)));
          return (<>
            <polyline points={pts(cvVals)} fill="none" stroke="#C8972A" strokeWidth="2" strokeDasharray="7,5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
            <rect x={ML+CW+4} y={yCV-9} width="62" height="18" rx="5" fill="#C8972A" />
            <text x={ML+CW+35} y={yCV+4} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="'DM Sans', sans-serif">C. versé</text>
          </>);
        })()}

        {/* Courbe valeur principale */}
        {visibleCurves.valeur && (() => {
          const yLast = Math.max(MT + 10, Math.min(MT + CH - 10, yS(last)));
          return (<>
            <polyline points={pts(vals)} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={xS(dates[dates.length-1])} cy={yS(last)} r="4" fill={lineColor} stroke="#fff" strokeWidth="2" />
            <rect x={ML+CW+4} y={yLast-9} width="62" height="18" rx="5" fill={lineColor} />
            <text x={ML+CW+35} y={yLast+4} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="'DM Sans', sans-serif">Valeur</text>
          </>);
        })()}

        {/* Hover */}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={MT} y2={MT+CH} stroke="rgba(148,163,184,0.5)" strokeWidth="1" strokeDasharray="3,3" />
            <circle cx={hover.x} cy={hover.y} r="4.5" fill={lineColor} stroke="#fff" strokeWidth="2" />
            {(() => {
              const hasInfo = hover.cv > 0;
              const W = 160, H = hasInfo ? 88 : 44;
              const tx = Math.max(ML, Math.min(hover.x - W/2, ML + CW - W));
              const ty = Math.max(MT+2, hover.y - H - 10);
              const pvColor = hover.pv >= 0 ? "#4ADE80" : "#F87171";
              return (<>
                <rect x={tx} y={ty} width={W} height={H} rx="8" fill="#0F172A" opacity="0.96" />
                <text x={tx+W/2} y={ty+16} textAnchor="middle" fontSize="11" fill="#fff" fontFamily="'DM Sans', sans-serif" fontWeight="800">{fmtEur(hover.val)}</text>
                {hasInfo && <>
                  <line x1={tx+10} x2={tx+W-10} y1={ty+24} y2={ty+24} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <text x={tx+10} y={ty+38} fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="'DM Sans', sans-serif">Capital versé</text>
                  <text x={tx+W-10} y={ty+38} textAnchor="end" fontSize="9" fill="#FCD34D" fontFamily="'DM Sans', sans-serif" fontWeight="600">{fmtEur(hover.cv)}</text>
                  <text x={tx+10} y={ty+54} fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="'DM Sans', sans-serif">Plus-value</text>
                  <text x={tx+W-10} y={ty+54} textAnchor="end" fontSize="9" fill={pvColor} fontFamily="'DM Sans', sans-serif" fontWeight="600">{hover.pv >= 0 ? "+" : ""}{fmtEur(hover.pv)}</text>
                  <text x={tx+10} y={ty+70} fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="'DM Sans', sans-serif">Rendement</text>
                  <text x={tx+W-10} y={ty+70} textAnchor="end" fontSize="9" fill={pvColor} fontFamily="'DM Sans', sans-serif" fontWeight="600">{hover.cv > 0 ? ((hover.pv/hover.cv)*100).toFixed(1) : "—"}%</text>
                </>}
                <text x={tx+W/2} y={ty+H-6} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="'DM Sans', sans-serif">
                  {new Date(hover.date).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" })}
                </text>
              </>);
            })()}
          </>
        )}
      </svg>

      {/* ── Drawdown strip ── */}
      {visibleCurves.drawdown && (
        <div style={{ marginTop: "8px" }}>
          <div style={{ fontSize: "9px", color: "#EF4444", fontWeight: "700", marginBottom: "2px", fontFamily: "'DM Sans', sans-serif" }}>
            DRAWDOWN MAX {minDD.toFixed(1)}%
          </div>
          <svg viewBox={`0 0 ${VW} ${DDH}`} style={{ width: "100%", height: `${DDH}px`, display: "block" }}>
            <line x1={ML} x2={ML+CW} y1={yDD(0)} y2={yDD(0)} stroke="rgba(148,163,184,0.3)" strokeWidth="1" />
            <path d={`M ${ddVals.map((v, i) => `${xS(dates[i]).toFixed(1)},${yDD(v).toFixed(1)}`).join(" L ")} L ${xS(dates[dates.length-1]).toFixed(1)},${yDD(0).toFixed(1)} L ${xS(dates[0]).toFixed(1)},${yDD(0).toFixed(1)} Z`}
              fill="rgba(239,68,68,0.15)" />
            <polyline points={ddVals.map((v, i) => `${xS(dates[i]).toFixed(1)},${yDD(v).toFixed(1)}`).join(" ")}
              fill="none" stroke="#EF4444" strokeWidth="1.5" strokeLinejoin="round" />
            <text x={ML+CW+4} y={yDD(minDD)+4} fontSize="8" fill="#EF4444" fontFamily="'DM Sans', sans-serif" fontWeight="700">{minDD.toFixed(1)}%</text>
          </svg>
        </div>
      )}

      {/* ── Légende cliquable ── */}
      <div style={{ display: "flex", gap: "18px", justifyContent: "center", marginTop: "14px", flexWrap: "wrap" }}>
        {LEGEND.map(({ key, label, color, dash, fill }) => (
          <button key={key} onClick={() => toggleCurve(key)}
            style={{ display: "flex", alignItems: "center", gap: "7px", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: "8px", opacity: visibleCurves[key] ? 1 : 0.35, transition: "opacity 0.2s", fontFamily: "'DM Sans', sans-serif" }}>
            <svg width="24" height="10" style={{ flexShrink: 0 }}>
              {fill
                ? <rect x="0" y="2" width="24" height="6" rx="2" fill={color} opacity="0.35" />
                : <line x1="0" y1="5" x2="24" y2="5" stroke={color} strokeWidth="2.5" strokeDasharray={dash ? "7,4" : ""} strokeLinecap="round" />
              }
            </svg>
            <span style={{ fontSize: "11px", fontWeight: "600", color: visibleCurves[key] ? C.ink : C.inkSubtle }}>
              {label}
              {key === "valeur" && <span style={{ fontWeight: "400", color: C.inkSubtle, marginLeft: "4px" }}>{fmtEur(last)}</span>}
              {key === "verse"  && hasCv && <span style={{ fontWeight: "400", color: C.inkSubtle, marginLeft: "4px" }}>{fmtEur(lastCV)}</span>}
              {key === "pv"     && hasCv && <span style={{ fontWeight: "700", color: lastPV >= 0 ? "#059669" : "#C0392B", marginLeft: "4px" }}>{lastPV >= 0 ? "+" : ""}{fmtEur(lastPV)}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
