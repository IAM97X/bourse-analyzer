import { useState } from "react";
import { C, shadow } from "../constants/theme";
import { fmtEur, fmtPct, linReg } from "../lib/finance";
import { load, save } from "../lib/storage";
import { fetchWithProxy } from "../lib/api";
import { useIsMobile } from "../context/mobile";
import { StatBox, BNextLabel } from "./UI";

const TICKER_CACHE_KEY = "bourse_isin_ticker_cache";
const DEFAULT_POSITIONS = [];

// ─── Suivi Réel vs Projeté ────────────────────────────────────────────────────
function SuiviHistorique() {
  const [hoverIdx, setHoverIdx] = useState(null);
  const ref   = (() => { try { return JSON.parse(localStorage.getItem("bourse_projection_ref") || "null"); } catch { return null; } })();
  const allSnaps = (() => { try { return JSON.parse(localStorage.getItem("bourse_snapshots") || "[]"); } catch { return []; } })()
    .filter(s => s.valeur > 0 && s.date >= (ref?.date || ""));

  if (!ref || allSnaps.length < 2) return null;

  const monthDiff = (d1, d2) => {
    const a = new Date(d1), b = new Date(d2);
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  };
  const projRef = (mois) => {
    const r = Math.pow(1.07, 1 / 12) - 1;
    return ref.valeur * Math.pow(1 + r, mois) + (ref.dcaMensuel > 0 ? ref.dcaMensuel * (Math.pow(1 + r, mois) - 1) / r : 0);
  };
  const capitalInvesti = (mois) => ref.valeur + ref.dcaMensuel * mois;

  // Réduire à max 60 points (1 par semaine si données denses)
  const thin = (arr, max) => {
    if (arr.length <= max) return arr;
    const step = Math.ceil(arr.length / max);
    return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
  };
  const snaps = thin(allSnaps, 60);

  const points = snaps.map(s => {
    const mois = Math.max(0, monthDiff(ref.date, s.date));
    return { date: s.date, reel: s.valeur, projete: projRef(mois), investi: capitalInvesti(mois), mois };
  });

  const last    = points[points.length - 1];
  const first   = points[0];
  const delta   = last.reel - last.projete;
  const perfPct = first.reel > 0 ? (last.reel - first.reel) / first.reel * 100 : 0;

  // SVG
  const W = 720, H = 240, ML = 68, MR = 20, MT = 20, MB = 36;
  const CW = W - ML - MR, CH = H - MT - MB;
  const allVals = points.flatMap(p => [p.reel, p.projete, p.investi]);
  const minV = Math.min(...allVals) * 0.96;
  const maxV = Math.max(...allVals) * 1.04;
  const xS = i => ML + (i / Math.max(1, points.length - 1)) * CW;
  const yS = v => MT + (1 - (v - minV) / (maxV - minV)) * CH;
  const fmtK = v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M€` : v >= 1000 ? `${(v/1000).toFixed(0)}k€` : `${Math.round(v)}€`;

  const linePath = (key) => points.map((p, i) => `${i === 0 ? "M" : "L"}${xS(i).toFixed(1)},${yS(p[key]).toFixed(1)}`).join(" ");
  const areaPath = (key) => {
    const base = yS(minV);
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${xS(i).toFixed(1)},${yS(p[key]).toFixed(1)}`).join(" ")
      + ` L${xS(points.length-1).toFixed(1)},${base} L${xS(0).toFixed(1)},${base} Z`;
  };

  // Labels dates : afficher 5-6 dates max
  const labelStep = Math.max(1, Math.floor(points.length / 5));
  const labelPoints = points.filter((_, i) => i % labelStep === 0 || i === points.length - 1);

  const hovP = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px", boxShadow: shadow.card }}>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
        <div>
          <div style={{ fontSize: "11px", fontWeight: "700", color: C.inkSubtle, letterSpacing: "1px", marginBottom: "4px" }}>ÉVOLUTION RÉELLE DU PORTEFEUILLE</div>
          <div style={{ fontSize: "11px", color: C.inkSubtle }}>Depuis le {new Date(ref.date).toLocaleDateString("fr-FR")} · référence 7%/an + {fmtEur(ref.dcaMensuel)}/mois</div>
        </div>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {[
            { label: "Valeur actuelle", val: fmtEur(last.reel), color: C.navy },
            { label: "vs Projection", val: `${delta >= 0 ? "+" : ""}${fmtEur(Math.round(delta))}`, color: delta >= 0 ? C.green : C.red },
            { label: "Perf. période", val: `${perfPct >= 0 ? "+" : ""}${perfPct.toFixed(1)}%`, color: perfPct >= 0 ? C.green : C.red },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600" }}>{label}</div>
              <div style={{ fontSize: "16px", fontWeight: "800", color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SVG Chart */}
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}
          onMouseLeave={() => setHoverIdx(null)}>
          <defs>
            <linearGradient id="gradReel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.01" />
            </linearGradient>
            <linearGradient id="gradProj" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.navy} stopOpacity="0.07" />
              <stop offset="100%" stopColor={C.navy} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grille horizontale */}
          {[0, 0.25, 0.5, 0.75, 1].map(r => {
            const v = minV + r * (maxV - minV);
            const y = yS(v);
            return <g key={r}>
              <line x1={ML} x2={W - MR} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" />
              <text x={ML - 8} y={y + 4} fontSize="10" fill={C.inkSubtle} textAnchor="end" fontFamily="'DM Sans', sans-serif">{fmtK(v)}</text>
            </g>;
          })}

          {/* Zone capital investi */}
          <path d={areaPath("investi")} fill="rgba(200,200,200,0.15)" />
          <path d={linePath("investi")} fill="none" stroke="#ccc" strokeWidth="1.5" strokeDasharray="4,3" />

          {/* Zone projetée */}
          <path d={areaPath("projete")} fill="url(#gradProj)" />
          <path d={linePath("projete")} fill="none" stroke={C.navy} strokeWidth="1.5" strokeDasharray="6,3" opacity="0.5" />

          {/* Zone réelle */}
          <path d={areaPath("reel")} fill="url(#gradReel)" />
          <path d={linePath("reel")} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Labels dates */}
          {labelPoints.map((p, i) => {
            const idx = points.indexOf(p);
            const dt = new Date(p.date);
            const lbl = dt.toLocaleDateString("fr-FR", { month: "short", year: points.length > 30 ? "2-digit" : undefined });
            return <text key={i} x={xS(idx)} y={H - 6} fontSize="10" fill={C.inkSubtle} textAnchor="middle" fontFamily="'DM Sans', sans-serif">{lbl}</text>;
          })}

          {/* Zone hover invisible */}
          {points.map((p, i) => (
            <rect key={i} x={xS(i) - CW / points.length / 2} y={MT} width={CW / points.length} height={CH}
              fill="transparent" onMouseEnter={() => setHoverIdx(i)} />
          ))}

          {/* Tooltip hover */}
          {hovP && (() => {
            const idx = points.indexOf(hovP);
            const cx = xS(idx), cy = yS(hovP.reel);
            const d = hovP.reel - hovP.projete;
            const flip = cx > W * 0.65;
            const bx = flip ? cx - 148 : cx + 10;
            return <g>
              <line x1={cx} x2={cx} y1={MT} y2={MT + CH} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,2" />
              <circle cx={cx} cy={cy} r="5" fill="#16a34a" stroke="white" strokeWidth="2" />
              <circle cx={xS(idx)} cy={yS(hovP.projete)} r="4" fill={C.navy} stroke="white" strokeWidth="1.5" opacity="0.6" />
              <rect x={bx} y={cy - 38} width="140" height="70" rx="8" fill="white" stroke="#e5e7eb" strokeWidth="1" filter="drop-shadow(0 2px 6px rgba(0,0,0,0.08))" />
              <text x={bx + 10} y={cy - 20} fontSize="10" fill={C.inkSubtle} fontFamily="'DM Sans', sans-serif">{new Date(hovP.date).toLocaleDateString("fr-FR")}</text>
              <text x={bx + 10} y={cy - 5} fontSize="12" fontWeight="700" fill="#16a34a" fontFamily="'DM Sans', sans-serif">Réel : {fmtEur(Math.round(hovP.reel))}</text>
              <text x={bx + 10} y={cy + 10} fontSize="11" fill={C.navy} fontFamily="'DM Sans', sans-serif" opacity="0.7">Projeté : {fmtEur(Math.round(hovP.projete))}</text>
              <text x={bx + 10} y={cy + 25} fontSize="11" fontWeight="700" fill={d >= 0 ? "#16a34a" : C.red} fontFamily="'DM Sans', sans-serif">{d >= 0 ? "+" : ""}{fmtEur(Math.round(d))}</text>
            </g>;
          })()}
        </svg>
      </div>

      {/* Légende */}
      <div style={{ display: "flex", gap: "20px", marginTop: "10px", fontSize: "11px", flexWrap: "wrap" }}>
        {[
          { color: "#16a34a", dash: false, label: "Valeur réelle" },
          { color: C.navy, dash: true, label: "Projection réaliste (7%/an)" },
          { color: "#ccc", dash: true, label: "Capital investi" },
        ].map(({ color, dash, label }) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: "5px", color: C.inkSubtle }}>
            <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke={color} strokeWidth="2" strokeDasharray={dash ? "4,2" : "none"} /></svg>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Projection Tab ───────────────────────────────────────────────────────────
const INFLATION_RATE = 0.025; // CPI européen ~2,5 %/an

export default function ProjectionTab({ profil, account = "PEA" }) {
  const isMobile = useIsMobile();
  const [tooltip, setTooltip]       = useState(null);
  const [hoverRetraite, setHoverRetraite] = useState(false);
  const [hoverPlafond, setHoverPlafond] = useState(false);
  const [showInflation, setShowInflation] = useState(false);
  const [inflationRateStr, setInflationRateStr] = useState(() => localStorage.getItem("bourse_inflation_rate") || "2.5");
  const [impotSortieStr,   setImpotSortieStr]   = useState(() => localStorage.getItem("bourse_impot_sortie")  || "30");
  const inflationRate = parseFloat(inflationRateStr.replace(",", ".")) || 0;
  const impotSortie   = parseFloat(impotSortieStr.replace(",", "."))   || 0;
  const [horizonYears, setHorizonYears]   = useState(30);  // 10 | 15 | 20 | 30 | 40
  const [histWindow,   setHistWindow]     = useState(3);   // années d'historique affiché : 1 | 3 | 5
  const [ageRetraiteStr, setAgeRetraiteStr] = useState(() => localStorage.getItem("bourse_age_retraite") || "65");
  const ageRetraite = Math.min(75, Math.max(50, parseInt(ageRetraiteStr) || 65));
  const [retraiteDansStr, setRetraiteDansStr] = useState(() => localStorage.getItem("bourse_retraite_dans") || "");
  const [histProj, setHistProj]     = useState(null);      // { taux, detail: [{nom,taux}] }
  const [loadingHist, setLoadingHist] = useState(false);
  const [histError, setHistError]   = useState(null);
  // ── PEA retrait simulator state ──
  const [retraitMontant,    setRetraitMontant]    = useState("");
  const [retraitAnciennete, setRetraitAnciennete] = useState("apres5");
  const [retraitRegime,     setRetraitRegime]      = useState("pfu");
  const [retraitTMI,        setRetraitTMI]         = useState(30);
  const [retraitHorizon,    setRetraitHorizon]     = useState(0);   // années
  const [retraitTauxAn,     setRetraitTauxAn]      = useState(7);   // %/an

  const positions    = load("bourse_portfolio", DEFAULT_POSITIONS).filter(p => (p.compte || "PEA") === account);
  const dcaMensuel   = Number(profil?.dcaMensuel) || 0;

  // ── Données historiques pour courbe réelle ─────────────────────────────────
  const _projRef = (() => { try { return JSON.parse(localStorage.getItem("bourse_projection_ref") || "null"); } catch { return null; } })();
  const _snapHistory = (() => { try {
    const today = new Date(); today.setHours(0,0,0,0);
    // moisRel en mois fractionnaires (négatif = passé)
    const toMoisRel = d => (new Date(d) - today) / (1000*60*60*24*30.4375);
    const windowMois = histWindow * 12;
    const thin = (arr, max) => {
      if (arr.length <= max) return arr;
      const step = Math.ceil(arr.length / max);
      return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
    };
    const raw = JSON.parse(localStorage.getItem("bourse_snapshots") || "[]")
      .filter(s => s.valeur > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(s => ({ date: s.date, valeur: s.valeur, moisRel: toMoisRel(s.date) }))
      .filter(s => s.moisRel <= -0.03 && s.moisRel >= -windowMois); // au moins ~1 jour passé
    return thin(raw, 80);
  } catch { return []; } })();

  // ── Calcul de la projection historique ────────────────────────────────────
  const computeHistoricalProj = async () => {
    setLoadingHist(true); setHistError(null); setHistProj(null);
    const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
    const totalVal = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
    const eligible = positions.filter(p => {
      const ticker = (p.isin && tickerCache[p.isin]) || p.ticker;
      return !!ticker;
    });
    if (eligible.length === 0) {
      setHistError("Aucun ticker configuré · Ajoutez les tickers dans ✏ (tableau positions)");
      setLoadingHist(false); return;
    }
    const results = await Promise.all(eligible.map(async p => {
      const ticker = (p.isin && tickerCache[p.isin]) || p.ticker;
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&range=5y`;
        const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) return null;
        const json = await res.json();
        const r = json?.chart?.result?.[0];
        const cl = r?.indicators?.quote?.[0]?.close || [];
        const pts = cl.filter(v => v != null && v > 0);
        if (pts.length < 20) return null;
        const xs = pts.map((_, i) => i);
        const ys = pts.map(v => Math.log(v));
        const { b } = linReg(xs, ys);
        const tauxAnnuel = Math.exp(b * 52) - 1;
        const poids = (p.dernierCours || p.pru) * p.quantite / totalVal;
        return { nom: p.nom, taux: tauxAnnuel, poids };
      } catch { return null; }
    }));
    const valid = results.filter(Boolean);
    if (valid.length === 0) {
      setHistError("Impossible de récupérer les données historiques. Vérifiez votre connexion.");
      setLoadingHist(false); return;
    }
    const totalPoids = valid.reduce((s, r) => s + r.poids, 0);
    const tauxPondere = valid.reduce((s, r) => s + r.taux * (r.poids / totalPoids), 0);
    setHistProj({ taux: tauxPondere, detail: valid });
    setLoadingHist(false);
  };

  // ── Reconstruction historique depuis Yahoo Finance ─────────────────────────
  const [reconstructing, setReconstructing] = useState(false);
  const [reconstructMsg, setReconstructMsg] = useState(null);

  const reconstructSnapshots = async () => {
    setReconstructing(true);
    setReconstructMsg(null);

    const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();

    // 1. Charger TOUTES les transactions (passées + actuelles) pour obtenir tous les ISINs
    const allOps = (() => { try { return JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]"); } catch { return []; } })()
      .filter(o => o.date && (o.type === "ACHAT" || o.type === "VENTE") && o.isin && parseFloat(o.quantite) > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    const allISINs = [...new Set(allOps.map(o => o.isin))];

    // ISINs avec ticker connu
    const isinTicker = {};
    allISINs.forEach(isin => {
      const t = tickerCache[isin];
      if (t) isinTicker[isin] = t;
    });

    // Aussi inclure les positions actuelles avec ticker direct
    positions.forEach(p => {
      if (p.isin && !isinTicker[p.isin] && p.ticker) isinTicker[p.isin] = p.ticker;
    });

    const eligibleISINs = Object.keys(isinTicker);
    if (eligibleISINs.length === 0) {
      setReconstructMsg("Aucun ticker configuré. Ajoutez les tickers dans le tableau des positions.");
      setReconstructing(false); return;
    }

    // 2. Construire la chronologie de quantités pour chaque ISIN
    // qtyAtDate[isin] → [{ date, qty }] liste triée chronologiquement des changements
    const qtyChanges = {};
    allISINs.forEach(isin => { qtyChanges[isin] = []; });
    let runningQty = {};
    allISINs.forEach(isin => { runningQty[isin] = 0; });

    for (const op of allOps) {
      const q = parseFloat(op.quantite) || 0;
      if (op.type === "ACHAT") runningQty[op.isin] = (runningQty[op.isin] || 0) + q;
      else if (op.type === "VENTE") runningQty[op.isin] = Math.max(0, (runningQty[op.isin] || 0) - q);
      qtyChanges[op.isin].push({ date: op.date, qty: runningQty[op.isin] });
    }

    // Fonction : quantité d'un ISIN détenue à une date donnée (recherche binaire simplifiée)
    const qtyAt = (isin, dateStr) => {
      const changes = qtyChanges[isin] || [];
      let qty = 0;
      for (const c of changes) {
        if (c.date <= dateStr) qty = c.qty;
        else break;
      }
      return qty;
    };

    // 3. Fetcher les cours historiques pour chaque ticker
    const historicalPrices = {}; // ticker → { dateStr → close }
    let fetchedCount = 0;
    await Promise.all(eligibleISINs.map(async isin => {
      const ticker = isinTicker[isin];
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=10y`;
        const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(18000) });
        if (!res.ok) return;
        const json = await res.json();
        const r = json?.chart?.result?.[0];
        if (!r) return;
        const timestamps = r.timestamp || [];
        const closes = r.indicators?.quote?.[0]?.close || [];
        historicalPrices[ticker] = {};
        timestamps.forEach((ts, i) => {
          const close = closes[i];
          if (!close || close <= 0) return;
          historicalPrices[ticker][new Date(ts * 1000).toISOString().slice(0, 10)] = close;
        });
        fetchedCount++;
      } catch {}
    }));

    if (fetchedCount === 0) {
      setReconstructMsg("Impossible de récupérer les données. Vérifiez votre connexion.");
      setReconstructing(false); return;
    }

    // 4. Construire la valeur du PF pour chaque date disponible
    const allDates = [...new Set(Object.values(historicalPrices).flatMap(d => Object.keys(d)))].sort();
    const byDate = {};
    for (const dateStr of allDates) {
      let valeur = 0;
      let investi = 0;
      for (const isin of eligibleISINs) {
        const ticker = isinTicker[isin];
        const close = historicalPrices[ticker]?.[dateStr];
        if (!close) continue;
        const qty = qtyAt(isin, dateStr);
        valeur += close * qty;
      }
      // Capital investi = cumul achats jusqu'à cette date
      for (const op of allOps) {
        if (op.date > dateStr) break;
        if (op.type === "ACHAT") investi += (parseFloat(op.prixUnitaire) || 0) * (parseFloat(op.quantite) || 0) + (parseFloat(op.frais) || 0);
        else if (op.type === "VENTE") investi -= (parseFloat(op.prixUnitaire) || 0) * (parseFloat(op.quantite) || 0);
      }
      if (valeur > 0) byDate[dateStr] = { valeur, investi: Math.max(0, investi) };
    }

    // 5. Sauvegarder dans bourse_snapshots
    const existing = (() => { try { return JSON.parse(localStorage.getItem("bourse_snapshots") || "[]"); } catch { return []; } })();
    const existingByDate = Object.fromEntries(existing.map(s => [s.date, s]));
    Object.entries(byDate).forEach(([date, { valeur, investi }]) => {
      existingByDate[date] = { date, valeur, investi, coutBase: investi, capitalVerse: investi };
    });
    const sorted = Object.values(existingByDate).sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem("bourse_snapshots", JSON.stringify(sorted));

    const skipped = allISINs.length - eligibleISINs.length;
    setReconstructMsg(`✓ ${Object.keys(byDate).length} jours reconstruits · ${fetchedCount} ticker(s)${skipped > 0 ? ` · ${skipped} ISIN(s) sans ticker ignorés` : ""}`);
    setReconstructing(false);
    window.dispatchEvent(new Event("portfolioUpdated"));
  };

  if (positions.length === 0 && dcaMensuel <= 0) return (
    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "48px 28px", textAlign: "center", boxShadow: shadow.card }}>
      <div style={{ fontSize: "36px", marginBottom: "14px", lineHeight: 1 }}>⌁</div>
      <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, marginBottom: "8px" }}>Aucune projection disponible</div>
      <div style={{ fontSize: "12px", color: C.inkMuted, maxWidth: "400px", margin: "0 auto", lineHeight: "1.6" }}>
        Ajoutez des positions dans <strong>Positions</strong> ou configurez un versement DCA dans <strong>Paramètres</strong> pour projeter l'évolution de votre portefeuille.
      </div>
    </div>
  );
  const totalActuel  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);

  const pvPct    = totalInvesti > 0 ? (totalActuel - totalInvesti) / totalInvesti : 0;
  const tauxReel = Math.max(0, Math.min(pvPct, 2));

  const SCENARIOS = [
    { label: "Pessimiste",       taux: 0.03,    color: C.red,      icon: "▼" },
    { label: "Réaliste",         taux: 0.07,    color: "#2563EB",  icon: "◆" },
    { label: "Optimiste",        taux: 0.12,    color: C.green,    icon: "▲" },
    { label: "Mon portefeuille", taux: tauxReel, color: C.goldDark, icon: "★" },
  ];

  // ── DCA croissant + plafond ───────────────────────────────────────────────
  const PEA_PLAFOND = 150000;
  const isPEA = account === "PEA";
  const remainingPEA = isPEA ? Math.max(0, PEA_PLAFOND - totalInvesti) : Infinity;
  const dcaDureeConfig = profil?.dcaDuree ? parseInt(profil.dcaDuree) : Infinity;
  const dcaCroissanceMontant = parseFloat(profil?.dcaCroissanceMontant) || 0;
  const dcaCroissancePeriode = parseFloat(profil?.dcaCroissancePeriode) || 0; // en années

  // DCA au mois m (0-indexé) : augmente par paliers tous les dcaCroissancePeriode ans
  const dcaAtMois = (m) => {
    if (dcaMensuel <= 0) return 0;
    if (dcaCroissanceMontant <= 0 || dcaCroissancePeriode <= 0) return dcaMensuel;
    const periodeM = Math.round(dcaCroissancePeriode * 12);
    const paliers  = Math.floor(m / periodeM);
    return dcaMensuel + paliers * dcaCroissanceMontant;
  };

  // Mois avant d'atteindre le plafond PEA avec DCA croissant
  const moisPlafond = (() => {
    if (!isPEA || remainingPEA <= 0 || dcaMensuel <= 0) return remainingPEA <= 0 ? 0 : Infinity;
    let cumul = 0;
    for (let m = 0; m < 600; m++) {
      cumul += dcaAtMois(m);
      if (cumul >= remainingPEA) return m + 1;
    }
    return Infinity;
  })();

  const dcaStopsAt = Math.min(
    moisPlafond,
    dcaDureeConfig === 0 ? Infinity : (isFinite(dcaDureeConfig) ? dcaDureeConfig : Infinity)
  );

  // Projection mois par mois (gère DCA variable + arrêt)
  const proj = (taux, totalMois) => {
    const r = Math.pow(1 + taux, 1 / 12) - 1;
    // Optimisation : si DCA fixe et pas de plafond, formule fermée
    if (dcaCroissanceMontant <= 0 && dcaStopsAt === Infinity) {
      return totalActuel * Math.pow(1+r, totalMois) +
        (r > 0 ? dcaMensuel * (Math.pow(1+r, totalMois)-1)/r : dcaMensuel * totalMois);
    }
    let v = totalActuel;
    for (let m = 0; m < totalMois; m++) {
      const dca = m < dcaStopsAt ? dcaAtMois(m) : 0;
      v = v * (1 + r) + dca;
    }
    return v;
  };

  // Capital investi cumulé (avec DCA croissant, strictement plafonné)
  const investi = (totalMois) => {
    let total = totalInvesti;
    const cap = isPEA ? PEA_PLAFOND : Infinity;
    for (let m = 0; m < Math.min(totalMois, dcaStopsAt); m++) {
      const pmt = dcaAtMois(m);
      if (total + pmt >= cap) { total = cap; break; }
      total += pmt;
    }
    return total;
  };

  const HORIZONS_TABLE = [6, 12, 36, 60, 120, 240, 360];
  const durLabel = m => m >= 24 ? `${m / 12} ans` : m === 12 ? "1 an" : `${m} mois`;
  const fmtVal  = v => v >= 1000000 ? `${(v / 1000000).toFixed(2)}M€` : `${Math.round(v / 1000)}k€`;

  if (totalActuel === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.inkSubtle }}>
      <div style={{ fontSize: "14px", fontWeight: "600" }}>Aucune position · Ajoutez des positions dans l'onglet Portefeuille</div>
    </div>
  );

  // ── SVG constants ──
  const MAX_MOIS = horizonYears * 12;
  const W = 720, H = 340;
  const PAD = { top: 24, right: 68, bottom: 72, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const pts    = Array.from({ length: MAX_MOIS / 3 + 1 }, (_, i) => i * 3);
  const scenariosWithHist = histProj ? [...SCENARIOS, { label: "Projection historique", taux: histProj.taux, color: "#7C3AED", icon: "⬟" }] : SCENARIOS;
  // L'axe passé s'étend toujours selon la fenêtre historique choisie
  const pastMoisSnap = _snapHistory.length > 0 ? Math.max(0.5, Math.abs(_snapHistory[0].moisRel)) : 0;
  // Étendre seulement jusqu'à l'étendue réelle des données + 10% de marge, capé à la fenêtre choisie
  const pastMois = pastMoisSnap > 0
    ? Math.min(pastMoisSnap * 1.1, histWindow * 12)
    : 0;
  const TOTAL_MOIS = MAX_MOIS + pastMois;
  // Points passés pour les courbes de projection (remontée depuis aujourd'hui)
  const pastStep = Math.max(1, Math.floor(pastMois / 20));
  const pastPts  = Array.from({ length: Math.ceil(pastMois / pastStep) }, (_, i) => -pastMois + i * pastStep);
  const snapVals = _snapHistory.map(s => s.valeur);
  const allVals = [...scenariosWithHist.flatMap(sc => pts.map(m => proj(sc.taux, m))), totalActuel, ...snapVals];
  const maxV   = Math.max(...allVals);
  // xS: m=0 = today, m<0 = past, m>0 = future
  const xS     = m => PAD.left + ((m + pastMois) / TOTAL_MOIS) * innerW;
  const yS     = v => PAD.top  + (1 - v / (maxV || 1)) * innerH;
  const yTicks = Array.from({ length: 6 }, (_, i) => i * maxV / 5);
  const annees = Array.from({ length: horizonYears + 1 }, (_, i) => i);
  const step5  = horizonYears <= 10 ? 2 : horizonYears <= 15 ? 3 : 5;
  // Retraite marker
  const ageActuel = profil?.anneeNaissance ? new Date().getFullYear() - parseInt(profil.anneeNaissance) : null;
  const ansDuRetraiteDepuisAge = ageActuel !== null ? Math.max(0, ageRetraite - ageActuel) : null;
  const ansDuRetraiteDirect = parseInt(retraiteDansStr) || null;
  const ansDuRetraite = ansDuRetraiteDepuisAge ?? ansDuRetraiteDirect;
  // Plafond marker (en années)
  const ansDcaStops = dcaStopsAt < Infinity ? dcaStopsAt / 12 : null;
  const JALONS = annees.filter(a => a > 0 && a % step5 === 0 && a < horizonYears);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* En-tête */}
      <div className="ba-g4" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: "10px" }}>
        <StatBox label="Capital actuel"  value={fmtEur(totalActuel)} color={C.navy} sensitive />
        <StatBox label="Coût historique" value={fmtEur(totalInvesti)} sensitive />
        <StatBox label="P/V actuelle"    value={fmtPct(pvPct * 100)} color={totalActuel >= totalInvesti ? C.green : C.red} sensitive />
        <StatBox label="DCA mensuel"     value={dcaMensuel > 0 ? fmtEur(dcaMensuel) : "Non défini"} color={dcaMensuel > 0 ? C.navy : C.inkSubtle} sensitive />
      </div>


      {/* ── Graphique interactif ── */}
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "24px", boxShadow: shadow.float }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "800", color: C.ink, letterSpacing: "-0.02em" }}>Évolution projetée</div>
            <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px" }}>Survolez les jalons pour afficher les valeurs détaillées</div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {/* Historique selector */}
            <div style={{ display: "flex", background: "#ECFEFF", borderRadius: "10px", padding: "2px", border: "1px solid #A5F3FC" }}>
              {[1, 3, 5].map(y => (
                <button key={y} onClick={() => setHistWindow(y)}
                  style={{ padding: "5px 10px", borderRadius: "8px", border: "none", fontSize: "11px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", transition: "all 0.15s",
                    background: histWindow === y ? "#0891b2" : "transparent",
                    color: histWindow === y ? "#fff" : "#0891b2",
                    boxShadow: histWindow === y ? shadow.pill : "none" }}>
                  -{y} an{y > 1 ? "s" : ""}
                </button>
              ))}
            </div>
            {/* Horizon selector */}
            <div style={{ display: "flex", background: C.snowOff, borderRadius: "10px", padding: "2px", border: `1px solid ${C.border}` }}>
              {[10, 15, 20, 30, 40].map(y => (
                <button key={y} onClick={() => { setHorizonYears(y); setTooltip(null); }}
                  style={{ padding: "5px 14px", borderRadius: "8px", border: "none", fontSize: "11px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", transition: "all 0.15s",
                    background: horizonYears === y ? C.navy : "transparent",
                    color: horizonYears === y ? "#fff" : C.inkMuted,
                    boxShadow: horizonYears === y ? shadow.pill : "none" }}>
                  {y} ans
                </button>
              ))}
            </div>
            {/* Âge retraite */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "10px", padding: "4px 10px" }}>
              <span style={{ fontSize: "10px", fontWeight: "700", color: "#92400E" }}>Retraite</span>
              {ageActuel !== null ? (
                <>
                  <input type="number" min="50" max="80" step="1" value={ageRetraiteStr}
                    onChange={e => { setAgeRetraiteStr(e.target.value); const v = parseInt(e.target.value); if (v >= 50 && v <= 80) localStorage.setItem("bourse_age_retraite", String(v)); }}
                    style={{ width: "38px", padding: "2px 4px", borderRadius: "6px", border: "1px solid rgba(245,158,11,0.35)", background: "#FFFBEB", fontSize: "11px", fontWeight: "800", color: "#92400E", fontFamily: "'DM Sans', sans-serif", textAlign: "center", outline: "none" }} />
                  <span style={{ fontSize: "10px", color: "#92400E", fontWeight: "600" }}>ans</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: "10px", color: "#92400E" }}>dans</span>
                  <input type="number" min="1" max="50" step="1" placeholder="30" value={retraiteDansStr}
                    onChange={e => { setRetraiteDansStr(e.target.value); localStorage.setItem("bourse_retraite_dans", e.target.value); }}
                    style={{ width: "38px", padding: "2px 4px", borderRadius: "6px", border: "1px solid rgba(245,158,11,0.35)", background: "#FFFBEB", fontSize: "11px", fontWeight: "800", color: "#92400E", fontFamily: "'DM Sans', sans-serif", textAlign: "center", outline: "none" }} />
                  <span style={{ fontSize: "10px", color: "#92400E", fontWeight: "600" }}>ans</span>
                </>
              )}
            </div>
            {/* Inflation configurable */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", background: showInflation ? C.goldLight : C.snowOff, border: `1px solid ${showInflation ? C.gold : C.border}`, borderRadius: "10px", padding: "4px 8px", cursor: "pointer" }} onClick={() => setShowInflation(v => !v)}>
              <span style={{ fontSize: "10px", fontWeight: "700", color: showInflation ? C.goldDark : C.inkSubtle }}>Inflation</span>
              <input type="text" inputMode="decimal" value={inflationRateStr}
                onClick={e => e.stopPropagation()}
                onChange={e => { const raw = e.target.value; setInflationRateStr(raw); const v = parseFloat(raw.replace(",", ".")); if (!isNaN(v)) localStorage.setItem("bourse_inflation_rate", v); }}
                style={{ width: "36px", border: "none", background: "transparent", fontSize: "10px", fontWeight: "700", color: showInflation ? C.goldDark : C.inkSubtle, textAlign: "center", outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
              <span style={{ fontSize: "10px", fontWeight: "700", color: showInflation ? C.goldDark : C.inkSubtle }}>%</span>
            </div>
            {/* Impôt de sortie */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "4px 8px" }}>
              <span style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle }}>Impôt sortie</span>
              <input type="text" inputMode="decimal" value={impotSortieStr}
                onChange={e => { const raw = e.target.value; setImpotSortieStr(raw); const v = parseFloat(raw.replace(",", ".")); if (!isNaN(v)) save("bourse_impot_sortie", v); }}
                style={{ width: "32px", border: "none", background: "transparent", fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textAlign: "center", outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
              <span style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle }}>%</span>
            </div>
            {/* Projection historique */}
            <button onClick={() => histProj ? setHistProj(null) : computeHistoricalProj()} disabled={loadingHist}
              style={{ padding: "6px 12px", borderRadius: "10px", fontSize: "10px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", border: `1px solid ${histProj ? "rgba(124,58,237,0.4)" : C.border}`, background: histProj ? "rgba(124,58,237,0.08)" : C.snowOff, color: histProj ? "#7C3AED" : C.inkMuted, opacity: loadingHist ? 0.6 : 1 }}>
              {loadingHist ? <span style={{ display:"inline-flex", alignItems:"center", fontSize:"11px" }}><BNextLabel /></span> : histProj ? `⬟ ${(histProj.taux * 100).toFixed(1)}%/an ×` : "⬟ Projection historique"}
            </button>
            {/* Reconstruction historique */}
            <button onClick={reconstructSnapshots} disabled={reconstructing}
              style={{ padding: "6px 12px", borderRadius: "10px", fontSize: "10px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", border: `1px solid #A5F3FC`, background: "#ECFEFF", color: "#0891b2", opacity: reconstructing ? 0.6 : 1 }}>
              {reconstructing ? <span style={{ display:"inline-flex", alignItems:"center", fontSize:"11px" }}><BNextLabel /></span> : "↺ Reconstruire l'historique"}
            </button>
          </div>
        </div>

        {histError && <div style={{ fontSize: "11px", color: C.red, background: C.redLight, borderRadius: "8px", padding: "8px 12px", marginBottom: "12px" }}>⚠ {histError}</div>}
        {reconstructMsg && <div style={{ fontSize: "11px", color: reconstructMsg.startsWith("✓") ? "#0891b2" : C.red, background: reconstructMsg.startsWith("✓") ? "#ECFEFF" : C.redLight, borderRadius: "8px", padding: "8px 12px", marginBottom: "12px", border: `1px solid ${reconstructMsg.startsWith("✓") ? "#A5F3FC" : "transparent"}` }}>{reconstructMsg}</div>}

        {/* Bannière plafond PEA */}
        {isPEA && dcaMensuel > 0 && (() => {
          const versementsTotal = totalInvesti + dcaMensuel * Math.min(dcaDureeConfig === Infinity ? 9999 : dcaDureeConfig, moisPlafond === Infinity ? 9999 : moisPlafond);
          const plafondEstContrainte = moisPlafond < dcaDureeConfig; // PEA limit atteint avant la fin du DCA
          const dcaLimite = dcaDureeConfig < Infinity && dcaDureeConfig < moisPlafond;
          return (
            <div style={{ fontSize: "11px", color: "#4338CA", background: "#EDE9FE", border: "1px solid #C4B5FD", borderRadius: "10px", padding: "8px 14px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
              <span>
                <strong>Plafond PEA 150 000€</strong> · versé : <strong>{fmtEur(totalInvesti)}</strong> · reste : <strong>{fmtEur(Math.max(0, PEA_PLAFOND - totalInvesti))}</strong>
              </span>
              {remainingPEA === 0
                ? <span style={{ color: "#DC2626", fontWeight: "700" }}>⚠ Plafond atteint — versements impossibles</span>
                : plafondEstContrainte
                  ? <span>DCA stoppé par plafond dans <strong>~{Math.round(moisPlafond / 12 * 10) / 10} ans</strong> ({fmtEur(dcaMensuel)}/mois)</span>
                  : dcaLimite
                    ? <span>DCA configuré pour <strong>{Math.round(dcaDureeConfig / 12 * 10) / 10} ans</strong> · plafond PEA <strong>non atteint</strong> ({fmtEur(Math.max(0, PEA_PLAFOND - totalInvesti - dcaMensuel * dcaDureeConfig))} de marge)</span>
                    : <span>Plafond atteint dans <strong>~{Math.round(moisPlafond / 12 * 10) / 10} ans</strong> au rythme de {fmtEur(dcaMensuel)}/mois</span>
              }
            </div>
          );
        })()}

        {/* SVG — style fintech clair */}
        <div style={{ position: "relative", overflow: "visible", background: "#F7F9FC", borderRadius: "16px", padding: "8px 0 0 0", marginTop: "8px" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
            onMouseLeave={() => setTooltip(null)}>
            <defs>
              <linearGradient id="gReel" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0891b2" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#0891b2" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="gInvestFT" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#94A3B8" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Capital investi — zone grisée + ligne pointillée */}
            {(() => {
              const line = pts.map((m, i) => `${i === 0 ? "M" : "L"}${xS(m).toFixed(1)},${yS(investi(m)).toFixed(1)}`).join(" ");
              const area = line
                + ` L${xS(MAX_MOIS).toFixed(1)},${yS(0).toFixed(1)}`
                + ` L${xS(0).toFixed(1)},${yS(0).toFixed(1)} Z`;
              return (
                <g>
                  <path d={area} fill="#94A3B8" opacity="0.08" />
                  <path d={line} fill="none" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="4,5" strokeLinejoin="round" />
                </g>
              );
            })()}

            {/* Grille Y — lignes horizontales ultra-légères */}
            {yTicks.map((v, i) => {
              const y = yS(v);
              const label = v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v/1000)}k` : Math.round(v);
              return (
                <g key={i}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                    stroke={i === 0 ? "#CBD5E1" : "#E8ECF2"} strokeWidth={i === 0 ? "1" : "0.6"} />
                  <text x={PAD.left - 10} y={y + 3.5} textAnchor="end" fontSize="8.5"
                    fill="#94A3B8" fontFamily="'DM Sans', sans-serif" fontWeight="500">{label}€</text>
                </g>
              );
            })}

            {/* Grille X — traits jalons fins */}
            {annees.filter(a => a % step5 === 0).map(a => {
              const x = xS(a * 12);
              const anneeCalendaire = new Date().getFullYear() + a;
              return (
                <g key={a}>
                  <line x1={x} x2={x} y1={PAD.top} y2={H - PAD.bottom} stroke="#E8ECF2" strokeWidth="0.6" />
                  <text x={x} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="9"
                    fill={a === 0 ? "#475569" : "#94A3B8"} fontFamily="'DM Sans', sans-serif" fontWeight={a === 0 ? "700" : "500"}>
                    {a === 0 ? "Auj." : `${a} ans`}
                  </text>
                  {a > 0 && (
                    <text x={x} y={H - PAD.bottom + 56} textAnchor="middle" fontSize="8"
                      fill="#B0BAC9" fontFamily="'DM Sans', sans-serif" fontWeight="400">
                      {anneeCalendaire}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Label historique */}
            {pastMois > 0 && xS(0) - xS(-pastMois) > 70 && (() => {
              const y = Math.floor(pastMois / 12);
              return (
                <text x={xS(-pastMois)} y={H - PAD.bottom + 15} textAnchor="middle" fontSize="9"
                  fill="#94A3B8" fontFamily="'DM Sans', sans-serif">
                  {pastMois >= 12 ? `-${y} an${y > 1 ? "s" : ""}` : `-${pastMois}m`}
                </text>
              );
            })()}

            {/* Séparateur Aujourd'hui */}
            {pastMois > 0 && (
              <line x1={xS(0)} x2={xS(0)} y1={PAD.top} y2={H - PAD.bottom}
                stroke="#334155" strokeWidth="1" opacity="0.2" strokeDasharray="3,3" />
            )}

            {/* Marqueur Retraite — ligne + badge + zone hover */}
            {ansDuRetraite !== null && ansDuRetraite > 0 && ansDuRetraite <= horizonYears && (() => {
              const xR = xS(ansDuRetraite * 12), yB = H - PAD.bottom;
              return (
                <g>
                  <line x1={xR} x2={xR} y1={PAD.top} y2={yB}
                    stroke="#F59E0B" strokeWidth={hoverRetraite ? 1.8 : 0.8}
                    strokeDasharray="4,3" opacity={hoverRetraite ? 0.9 : 0.25} />
                  <rect x={xR - 30} y={yB + 22} width={60} height={12} rx="3" fill="#FFFBEB" stroke="#F59E0B" strokeWidth="0.8" opacity={hoverRetraite ? 1 : 0.5} />
                  <text x={xR} y={yB + 30} textAnchor="middle" fontSize="7" fill="#92400E" fontFamily="'DM Sans', sans-serif" fontWeight="700" opacity={hoverRetraite ? 1 : 0.5}>Retraite {ageActuel + ansDuRetraite} ans</text>
                </g>
              );
            })()}

            {/* Marqueur Plafond PEA / fin DCA */}
            {ansDcaStops !== null && ansDcaStops > 0 && ansDcaStops <= horizonYears && (() => {
              const xP = xS(ansDcaStops * 12), yB = H - PAD.bottom;
              const plafondEstContrainte = moisPlafond <= dcaDureeConfig;
              const label = isPEA && plafondEstContrainte ? "Plafond 150k€" : "Fin DCA";
              const couleur = isPEA && plafondEstContrainte ? "#8B5CF6" : "#6366F1";
              return (
                <g>
                  <line x1={xP} x2={xP} y1={PAD.top} y2={yB} stroke={couleur}
                    strokeWidth={hoverPlafond ? 1.8 : 0.8}
                    strokeDasharray="4,3" opacity={hoverPlafond ? 0.9 : 0.25} />
                  {(() => { const lw = label.length * 4.2 + 2; return (<>
                    <rect x={xP - lw/2} y={yB + 22} width={lw} height={12} rx="3"
                      fill="#EDE9FE" stroke={couleur} strokeWidth="0.8"
                      opacity={hoverPlafond ? 1 : 0.5} />
                    <text x={xP} y={yB + 30} textAnchor="middle" fontSize="7" fill={couleur}
                      fontFamily="'DM Sans', sans-serif" fontWeight="700" opacity={hoverPlafond ? 1 : 0.5}>{label}</text>
                  </>); })()}
                  <rect x={xP - 16} y={PAD.top} width={32} height={innerH} fill="transparent"
                    style={{ cursor: "crosshair" }}
                    onMouseEnter={() => { setHoverPlafond(true); setTooltip(null); }}
                    onMouseLeave={() => setHoverPlafond(false)} />
                </g>
              );
            })()}

            {/* Courbe réelle historique */}
            {(() => {
              const reelPts = [
                ..._snapHistory.filter(s => s.moisRel < 0),
                { valeur: totalActuel, moisRel: 0 },
              ];
              if (reelPts.length < 2) return null;
              const reelLine = reelPts.map((s, i) =>
                `${i === 0 ? "M" : "L"}${xS(s.moisRel).toFixed(1)},${yS(s.valeur).toFixed(1)}`
              ).join(" ");
              const reelArea = reelLine
                + ` L${xS(0).toFixed(1)},${yS(0).toFixed(1)}`
                + ` L${xS(reelPts[0].moisRel).toFixed(1)},${yS(0).toFixed(1)} Z`;
              return (
                <g>
                  <path d={reelArea} fill="url(#gReel)" />
                  <path d={reelLine} fill="none" stroke="#0891b2" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
                </g>
              );
            })()}

            {/* Courbes scénarios */}
            {(() => {
              const items = scenariosWithHist.map((sc, si) => {
                const valFin = proj(sc.taux, MAX_MOIS);
                return { sc, si, valFin, yExact: yS(valFin) };
              });
              const sorted = [...items].sort((a, b) => a.yExact - b.yExact);
              sorted[0].yLabel = sorted[0].yExact;
              for (let i = 1; i < sorted.length; i++) {
                sorted[i].yLabel = Math.max(sorted[i].yExact, sorted[i-1].yLabel + 13);
              }
              const labelMap = Object.fromEntries(sorted.map(s => [s.si, s.yLabel]));

              return items.map(({ sc, si, valFin, yExact }) => {
                const isHistorical = si === 4;
                const yLabel = labelMap[si] + 4;
                const line = pts.map((m, i) => `${i === 0 ? "M" : "L"}${xS(m).toFixed(1)},${yS(proj(sc.taux, m)).toFixed(1)}`).join(" ");
                const labelTxt = valFin >= 1000000 ? `${(valFin/1000000).toFixed(2)}M` : `${Math.round(valFin/1000)}k`;
                return (
                  <g key={`${sc.taux}-${si}`}>
                    <path d={line} fill="none" stroke={sc.color}
                      strokeWidth={si === 1 ? "2" : "1.5"}
                      strokeDasharray={isHistorical ? "7,4" : ""}
                      strokeLinejoin="round" strokeLinecap="round" />
                    {Math.abs(yLabel - yExact - 4) > 4 && (
                      <line x1={W - PAD.right + 2} y1={yExact} x2={W - PAD.right + 4} y2={yLabel}
                        stroke={sc.color} strokeWidth="0.8" opacity="0.4" />
                    )}
                    <text x={W - PAD.right + 7} y={yLabel} fontSize="8.5" fill={sc.color}
                      fontFamily="'DM Sans', sans-serif" fontWeight="700">{labelTxt}€</text>
                  </g>
                );
              });
            })()}

            {/* Courbe inflation-ajustée */}
            {showInflation && (() => {
              const inflLine = pts.map((m, i) => {
                const real = proj(SCENARIOS[1].taux, m) / Math.pow(1 + inflationRate / 100, m / 12);
                return `${i===0?"M":"L"}${xS(m).toFixed(1)},${yS(real).toFixed(1)}`;
              }).join(" ");
              return <path d={inflLine} fill="none" stroke="#F59E0B" strokeWidth="1.2" strokeDasharray="4,4" strokeLinejoin="round" opacity="0.7" />;
            })()}

            {/* Points jalons interactifs */}
            {JALONS.map(a => {
              const m = a * 12, x = xS(m);
              const isHovered = tooltip?.annee === a;
              return (
                <g key={a} style={{ cursor: "pointer" }}
                  onMouseEnter={() => setTooltip({ annee: a, xPct: xS(m) / W * 100 })}>
                  <rect x={x - 14} y={PAD.top} width={28} height={innerH} fill="transparent" />
                  {isHovered && <line x1={x} x2={x} y1={PAD.top} y2={H - PAD.bottom}
                    stroke="#334155" strokeWidth="0.8" opacity="0.2" />}
                  {scenariosWithHist.map((sc, si) => (
                    <circle key={si} cx={x} cy={yS(proj(sc.taux, m))}
                      r={isHovered ? 3.5 : 2}
                      fill={sc.color}
                      style={{ transition: "r 0.1s" }} />
                  ))}
                  <circle cx={x} cy={yS(investi(m))} r={isHovered ? 2.5 : 1.8}
                    fill={isHovered ? "#94A3B8" : "#F7F9FC"} stroke="#94A3B8" strokeWidth="1" />
                </g>
              );
            })}

            {/* Zone de capture hover retraite — dessinée après jalons pour priorité events */}
            {ansDuRetraite !== null && ansDuRetraite > 0 && ansDuRetraite <= horizonYears && (() => {
              const xR = xS(ansDuRetraite * 12);
              return (
                <rect x={xR - 16} y={PAD.top} width={32} height={innerH} fill="transparent" style={{ cursor: "crosshair" }}
                  onMouseEnter={() => { setHoverRetraite(true); setTooltip(null); }}
                  onMouseLeave={() => setHoverRetraite(false)} />
              );
            })()}

            {/* Dots + labels retraite — visibles au survol seulement */}
            {hoverRetraite && ansDuRetraite !== null && ansDuRetraite > 0 && ansDuRetraite <= horizonYears && (() => {
              const mR = ansDuRetraite * 12, xR = xS(mR);
              const GAP = 15, CLAMP_TOP = PAD.top + 4, CLAMP_BOT = H - PAD.bottom - 4;
              const retrItems = scenariosWithHist.map((sc, si) => ({
                sc, si, val: proj(sc.taux, mR), yExact: yS(proj(sc.taux, mR))
              })).sort((a, b) => a.yExact - b.yExact);
              retrItems[0].yLabel = retrItems[0].yExact;
              for (let i = 1; i < retrItems.length; i++) {
                retrItems[i].yLabel = Math.max(retrItems[i].yExact, retrItems[i-1].yLabel + GAP);
              }
              const overflow = retrItems[retrItems.length - 1].yLabel - CLAMP_BOT;
              if (overflow > 0) {
                for (let i = retrItems.length - 1; i >= 0; i--) {
                  retrItems[i].yLabel = Math.max(CLAMP_TOP + i * GAP, retrItems[i].yLabel - overflow);
                }
              }
              return (
                <g>
                  {retrItems.map(({ sc, yExact, yLabel, val }) => {
                    const labelTxt = val >= 1000000 ? `${(val/1000000).toFixed(2)}M€` : `${Math.round(val/1000)}k€`;
                    const lw = labelTxt.length * 5 + 2;
                    return (
                      <g key={sc.label}>
                        <circle cx={xR} cy={yExact} r="2.5" fill={sc.color} />
                        {Math.abs(yLabel - yExact) > 3 && (
                          <line x1={xR + 5} y1={yExact} x2={xR + 8} y2={yLabel}
                            stroke={sc.color} strokeWidth="0.7" opacity="0.4" />
                        )}
                        <rect x={xR + 9} y={yLabel - 7} width={lw} height={13} rx="3"
                          fill="white" stroke={sc.color} strokeWidth="0.9" />
                        <text x={xR + 9 + lw / 2} y={yLabel + 3} fontSize="7.5" fill={sc.color}
                          textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontWeight="700">{labelTxt}</text>
                      </g>
                    );
                  })}
                </g>
              );
            })()}

            {/* Point Aujourd'hui */}
            {(() => {
              const tx = xS(0) + 8, ty = yS(totalActuel) - 10;
              const label = fmtEur(totalActuel);
              const lw = label.length * 4.5 + 4;
              return (
                <g>
                  <circle cx={xS(0)} cy={yS(totalActuel)} r="3" fill="#334155" />
                  <rect x={tx - 2} y={ty - 9} width={lw} height={13} rx="3"
                    fill="white" stroke="#334155" strokeWidth="0.8" opacity="0.95" />
                  <text x={tx + lw/2 - 2} y={ty + 1} fontSize="9" fill="#1E293B"
                    textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontWeight="700">{label}</text>
                </g>
              );
            })()}
          </svg>

          {/* Tooltip */}
          {tooltip && (() => {
            const a = tooltip.annee, m = a * 12;
            const dateRef = new Date();
            dateRef.setFullYear(dateRef.getFullYear() + a);
            const dateLabel = dateRef.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
            const isRight = tooltip.xPct > 55;
            return (
              <div style={{ position: "absolute", top: "8px",
                left: isRight ? "auto" : `${Math.min(tooltip.xPct + 2, 65)}%`,
                right: isRight ? `${Math.max(100 - tooltip.xPct + 2, 2)}%` : "auto",
                background: "rgba(15,20,35,0.96)", backdropFilter: "blur(12px)", borderRadius: "14px", padding: "14px 16px",
                boxShadow: "0 12px 36px rgba(0,0,0,0.32)", zIndex: 10, minWidth: "210px", pointerEvents: "none",
                border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", marginBottom: "10px", fontWeight: "600" }}>
                  Dans <strong style={{ color: "#fff" }}>{a} ans</strong> · {dateLabel}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", paddingBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>Investi total</span>
                  <span style={{ fontSize: "11px", color: "#C0C0BC", fontWeight: "600" }}>{fmtEur(investi(m))}</span>
                </div>
                {scenariosWithHist.map((sc, si) => {
                  const v = proj(sc.taux, m);
                  const mult = investi(m) > 0 ? v / investi(m) : 1;
                  const real = v / Math.pow(1 + INFLATION_RATE, m / 12);
                  const tooltipColor = sc.color;
                  return (
                    <div key={si} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "10px", color: tooltipColor, fontWeight: "700" }}>{sc.icon} {sc.label}</span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "13px", color: tooltipColor, fontWeight: "800" }}>{fmtVal(v)}</div>
                        <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)" }}>×{mult.toFixed(1)} · {(sc.taux*100).toFixed(1)}%/an</div>
                        {showInflation && <div style={{ fontSize: "9px", color: "#D97706" }}>≈{fmtVal(real)} réels</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Légende */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "14px", flexWrap: "wrap" }}>
          {scenariosWithHist.map((sc, si) => (
            <div key={si} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke={sc.color} strokeWidth="2.5" strokeDasharray={si === 3 ? "5,3" : si === 4 ? "6,3" : ""} /></svg>
              <span style={{ fontSize: "10px", color: sc.color, fontWeight: "700" }}>
                {sc.icon} {sc.label} ({sc.taux >= 0 ? "+" : ""}{(sc.taux*100).toFixed(1)}%)
              </span>
            </div>
          ))}
          {_snapHistory.length >= 2 && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="#0891b2" strokeWidth="2.5" /></svg>
              <span style={{ fontSize: "10px", color: "#0891b2", fontWeight: "700" }}>Valeur réelle</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="#C0C0BC" strokeWidth="1.5" strokeDasharray="4,3" /></svg>
            <span style={{ fontSize: "10px", color: C.inkMuted, fontWeight: "600" }}>Capital investi</span>
          </div>
          {showInflation && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="5,4" /></svg>
              <span style={{ fontSize: "10px", color: "#D97706", fontWeight: "600" }}>Réaliste inflation-ajusté</span>
            </div>
          )}
        </div>

        {/* Détail projection historique */}
        {histProj && (
          <div style={{ marginTop: "14px", background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "12px", padding: "12px 16px" }}>
            <div style={{ fontSize: "10px", fontWeight: "700", color: "#7C3AED", marginBottom: "8px" }}>⬟ Détail par valeur — taux de croissance historique (régression 5 ans)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {histProj.detail.map((d, i) => (
                <div key={i} style={{ background: "rgba(124,58,237,0.08)", borderRadius: "8px", padding: "5px 10px", fontSize: "10px", color: "#7C3AED", fontWeight: "600" }}>
                  {d.nom.split(" ")[0]} · <strong>{d.taux >= 0 ? "+" : ""}{(d.taux * 100).toFixed(1)}%/an</strong>
                  <span style={{ opacity: 0.6 }}> ({(d.poids * 100).toFixed(0)}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Jalons de projection ── */}
      {(() => {
        const baseJalons = [
          { label: "1 an",  mois: 12 },
          { label: "5 ans", mois: 60 },
          { label: "10 ans", mois: 120 },
          { label: "20 ans", mois: 240 },
        ];
        const retraiteLabel = ageActuel !== null && ansDuRetraite !== null
          ? `Retraite · ${ageActuel + ansDuRetraite} ans`
          : ansDuRetraite !== null
            ? `Retraite · dans ${ansDuRetraite} ans`
            : null;
        const jalons = retraiteLabel && ansDuRetraite > 0 && !baseJalons.find(j => j.mois === ansDuRetraite * 12)
          ? [...baseJalons, { label: retraiteLabel, mois: ansDuRetraite * 12, isRetraite: true }]
          : baseJalons;
        const scen3 = [SCENARIOS[0], SCENARIOS[1], SCENARIOS[2]];
        return (
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px", boxShadow: shadow.card }}>
            <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "14px" }}>
              Jalons clés · {dcaMensuel > 0 ? `DCA ${fmtEur(dcaMensuel)}/mois` : "sans DCA"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${jalons.length}, 1fr)`, gap: "10px" }}>
              {jalons.map(({ label, mois, isRetraite }) => {
                const inv = investi(mois);
                const vals = scen3.map(sc => ({ ...sc, v: proj(sc.taux, mois) }));
                const maxVal = vals[2].v;
                return (
                  <div key={label} style={{
                    background: isRetraite ? "linear-gradient(135deg, #FFFBEB, #FEF3C7)" : C.snowOff,
                    border: `1px solid ${isRetraite ? "#D97706" : C.border}`,
                    borderRadius: "12px", padding: "14px 12px",
                  }}>
                    <div style={{ fontSize: "12px", fontWeight: "800", color: isRetraite ? "#92400E" : C.ink, marginBottom: "2px" }}>{label}</div>
                    <div style={{ fontSize: "10px", color: isRetraite ? "#B45309" : C.inkSubtle, marginBottom: "14px" }}>
                      Investi : <strong>{fmtVal(inv)}</strong>
                    </div>
                    {vals.map(({ label: scLabel, v, color, icon }) => {
                      const gains = Math.max(0, v - inv);
                      const net = v - gains * (impotSortie / 100);
                      const barW = maxVal > 0 ? Math.round(v / maxVal * 100) : 0;
                      return (
                        <div key={scLabel} style={{ marginBottom: "10px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                            <span style={{ fontSize: "9px", fontWeight: "700", color, opacity: 0.85 }}>{icon} {scLabel}</span>
                            <span style={{ fontSize: "12px", fontWeight: "800", color }}>{fmtVal(v)}</span>
                          </div>
                          <div style={{ height: "3px", background: C.border, borderRadius: "2px", overflow: "hidden" }}>
                            <div style={{ width: `${barW}%`, height: "100%", background: color, borderRadius: "2px" }} />
                          </div>
                          {impotSortie > 0 && (
                            <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "2px" }}>{fmtVal(net)} net</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "12px", textAlign: "center" }}>
              ⚠ Projections indicatives — Pessimiste +3%/an · Réaliste +7%/an · Optimiste +12%/an{impotSortie > 0 ? ` · impôt sortie ${impotSortie}% sur les gains` : ""}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════
           SIMULATEUR DE RETRAIT PEA
         ══════════════════════════════════════════════════════════ */}
      {(() => {
        const R = parseFloat(retraitMontant.replace(",", ".")) || 0;

        // Projection de la valeur et du capital investi à l'horizon choisi
        const mois = retraitHorizon * 12;
        const r    = retraitTauxAn / 100 / 12;
        const V = retraitHorizon === 0 ? totalActuel
          : (r === 0
            ? totalActuel + dcaMensuel * mois
            : totalActuel * Math.pow(1 + r, mois) + dcaMensuel * ((Math.pow(1 + r, mois) - 1) / r));
        const I       = totalInvesti + dcaMensuel * mois;
        const pvTotal = Math.max(0, V - I);

        // Proportion de plus-value dans le retrait (méthode proportionnelle légale)
        const pvRatio         = V > 0 ? pvTotal / V : 0;
        const pvImposable     = R * pvRatio;
        const capitalRecupere = R - pvImposable;

        // Ancienneté réelle à la date du retrait
        const dateOuv = load(account === "PEA" ? "bourse_pea_ouverture" : "bourse_cto_ouverture", null);
        const agePEAActuel = dateOuv ? (Date.now() - new Date(dateOuv).getTime()) / (1000*60*60*24*365) : null;
        const agePEARetrait = agePEAActuel !== null ? agePEAActuel + retraitHorizon : null;
        // Ancienneté : date ouverture > horizon ≥ 5 ans > manuel
        const ancienneteEffective = agePEARetrait !== null
          ? (agePEARetrait >= 5 ? "apres5" : "avant5")
          : retraitHorizon >= 5 ? "apres5"
          : retraitAnciennete;
        const ancienneteAuto = agePEARetrait !== null || retraitHorizon >= 5;
        const ancienneteInconsistante = false;

        // Taux effectifs selon ancienneté réelle + régime fiscal
        const PS_RATE = 0.172;
        let irRate = 0;
        if (ancienneteEffective === "avant5") {
          irRate = retraitRegime === "pfu" ? 0.128 : (retraitTMI / 100);
        }
        const montantPS   = pvImposable * PS_RATE;
        const montantIR   = pvImposable * irRate;
        const totalImpots = montantPS + montantIR;
        const montantNet  = R - totalImpots;
        const tauxEff     = R > 0 ? (totalImpots / R) * 100 : 0;

        const inp  = { width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: "8px", fontSize: "13px", outline: "none", background: C.snow, color: C.ink, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" };
        const row  = { display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "2px" : "0", padding: "9px 0", borderBottom: `1px solid ${C.border}` };
        const lbl  = { fontSize: "12px", color: C.inkMuted };
        const val  = (c = C.ink) => ({ fontSize: "13px", fontWeight: "700", color: c, flexShrink: 0 });

        return (
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden", boxShadow: shadow.card }}>
            {/* Header */}
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "10px", background: C.navyLight }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "linear-gradient(135deg, #2D6CB5, #4B9DD8)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6"/>
                  <path d="M8 5 L8 8 L10.5 9.5"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: C.navy }}>Simulateur de retrait {account}</div>
                <div style={{ fontSize: "10px", color: C.inkMuted, marginTop: "1px" }}>{isPEA ? "Calcul de la fiscalité applicable selon l'ancienneté du plan" : "Calcul de la fiscalité applicable sur les plus-values"}</div>
              </div>
            </div>

            <div style={{ padding: isMobile ? "14px 16px" : "18px 20px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "14px" : "18px" }}>
              {/* Colonne gauche — paramètres */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Horizon de retrait */}
                <div>
                  <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "6px" }}>Horizon de retrait</div>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {[0,1,2,3,5,7,10,15,20].map(h => (
                      <button key={h} onClick={() => {
                        setRetraitHorizon(h);
                        const dateOuvLocal = load(account === "PEA" ? "bourse_pea_ouverture" : "bourse_cto_ouverture", null);
                        const ageActuelLocal = dateOuvLocal ? (Date.now() - new Date(dateOuvLocal).getTime()) / (1000*60*60*24*365) : null;
                        const agePEAFutur = ageActuelLocal !== null ? ageActuelLocal + h : null;
                        const autoAnc = agePEAFutur !== null ? (agePEAFutur >= 5 ? "apres5" : "avant5") : (h >= 5 ? "apres5" : "avant5");
                        setRetraitAnciennete(autoAnc);
                      }}
                        style={{ padding: "4px 9px", borderRadius: "16px", border: `1.5px solid ${retraitHorizon === h ? C.navy : C.border}`, background: retraitHorizon === h ? C.navyLight : C.snow, color: retraitHorizon === h ? C.navy : C.inkMuted, fontSize: "10px", fontWeight: retraitHorizon === h ? "700" : "500", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                        {h === 0 ? "Maintenant" : `${h}a`}
                      </button>
                    ))}
                  </div>
                  {retraitHorizon > 0 && (
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ fontSize: "10px", color: C.inkMuted, fontWeight: "600", marginBottom: "5px" }}>Scénario de croissance</div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {[[-5,"Pess.","#EF4444"],[0,"Neutre",C.inkMuted],[7,"Base","#2563EB"],[12,"Opt.",C.green]].map(([t,label,col]) => (
                          <button key={t} onClick={() => setRetraitTauxAn(t)}
                            style={{ flex: 1, padding: "5px 2px", borderRadius: "8px", border: `1.5px solid ${retraitTauxAn === t ? col : C.border}`, background: retraitTauxAn === t ? col + "18" : C.snow, color: retraitTauxAn === t ? col : C.inkMuted, fontSize: "9px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textAlign: "center" }}>
                            <div>{label}</div>
                            <div style={{ opacity: 0.7 }}>{t >= 0 ? "+" : ""}{t}%</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "5px" }}>Montant du retrait souhaité (€)</div>
                  <input type="number" min="0" placeholder="ex : 10 000" value={retraitMontant}
                    onChange={e => setRetraitMontant(e.target.value)} style={inp} />
                </div>

                {isPEA && (
                <div>
                  <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "6px" }}>Ancienneté du PEA</div>
                  {ancienneteAuto ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: ancienneteEffective === "apres5" ? C.greenLight : C.goldLight, border: `1px solid ${ancienneteEffective === "apres5" ? "rgba(5,150,105,0.2)" : "rgba(217,119,6,0.2)"}`, borderRadius: "8px", padding: "8px 14px", fontSize: "11px", fontWeight: "700", color: ancienneteEffective === "apres5" ? C.green : C.goldDark }}>
                      {ancienneteEffective === "apres5" ? "✓ 5 ans et plus" : "Moins de 5 ans"}
                      <span style={{ fontSize: "10px", fontWeight: "400", opacity: 0.7 }}>— calculé automatiquement</span>
                    </div>
                  ) : (
                  <div style={{ display: "flex", gap: "6px" }}>
                    {[["avant5","Moins de 5 ans"],["apres5","5 ans et plus"]].map(([v, label]) => (
                      <button key={v} onClick={() => setRetraitAnciennete(v)}
                        style={{ flex: 1, padding: "8px 6px", borderRadius: "8px", border: `1.5px solid ${retraitAnciennete === v ? C.navy : C.border}`, background: retraitAnciennete === v ? C.navyLight : C.snow, color: retraitAnciennete === v ? C.navy : C.inkMuted, fontSize: "11px", fontWeight: retraitAnciennete === v ? "700" : "400", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  )}
                </div>
                )}

                {(!isPEA || ancienneteEffective === "avant5") && (
                  <div>
                    <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "6px" }}>Régime d'imposition (IR)</div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[["pfu","Flat Tax 30 %"],["bareme","Barème progressif"]].map(([v, label]) => (
                        <button key={v} onClick={() => setRetraitRegime(v)}
                          style={{ flex: 1, padding: "8px 6px", borderRadius: "8px", border: `1.5px solid ${retraitRegime === v ? C.navy : C.border}`, background: retraitRegime === v ? C.navyLight : C.snow, color: retraitRegime === v ? C.navy : C.inkMuted, fontSize: "11px", fontWeight: retraitRegime === v ? "700" : "400", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {retraitRegime === "bareme" && (
                      <div style={{ marginTop: "10px" }}>
                        <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "5px" }}>Votre tranche marginale d'imposition (TMI)</div>
                        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                          {[0, 11, 30, 41, 45].map(tmi => (
                            <button key={tmi} onClick={() => setRetraitTMI(tmi)}
                              style={{ padding: "5px 10px", borderRadius: "6px", border: `1.5px solid ${retraitTMI === tmi ? C.navy : C.border}`, background: retraitTMI === tmi ? C.navy : C.snow, color: retraitTMI === tmi ? "#fff" : C.inkMuted, fontSize: "11px", fontWeight: "600", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                              {tmi}%
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* État PEA de référence */}
                <div style={{ background: C.snowOff, borderRadius: "10px", padding: "11px 14px", fontSize: "11px", color: C.inkMuted, lineHeight: "1.7" }}>
                  <div style={{ fontWeight: "700", color: C.ink, marginBottom: "4px" }}>
                    Base de calcul {retraitHorizon > 0 ? `— projection dans ${retraitHorizon} an${retraitHorizon > 1 ? "s" : ""}` : "(portefeuille actuel)"}
                  </div>
                  <div>Valeur projetée : <strong style={{ color: C.ink }}>{fmtEur(V)}</strong>{retraitHorizon > 0 && <span style={{ color: C.inkSubtle }}> (vs {fmtEur(totalActuel)} aujourd'hui)</span>}</div>
                  <div>Capital investi : <strong style={{ color: C.ink }}>{fmtEur(I)}</strong>{retraitHorizon > 0 && dcaMensuel > 0 && <span style={{ color: C.inkSubtle }}> (incl. DCA)</span>}</div>
                  <div>Plus-value projetée : <strong style={{ color: pvTotal >= 0 ? C.green : C.red }}>{fmtEur(pvTotal)} ({pvTotal >= 0 ? "+" : ""}{V > 0 ? ((pvTotal/V)*100).toFixed(1) : 0}% de la valeur)</strong></div>
                  {retraitHorizon > 0 && (
                    <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: `1px solid ${C.border}`, fontSize: "10px", color: C.inkSubtle }}>
                      ⚠ Projection indicative à {retraitTauxAn >= 0 ? "+" : ""}{retraitTauxAn}%/an. Le ratio PV/valeur ({(pvRatio*100).toFixed(1)}%) détermine la part imposable selon la méthode proportionnelle légale.
                    </div>
                  )}
                </div>
              </div>

              {/* Colonne droite — résultats */}
              <div>
                {R <= 0 ? (
                  <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.inkSubtle, gap: "10px", padding: "20px 0" }}>
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={C.border} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="18" r="14"/>
                      <path d="M18 10 L18 20 M18 24 L18 26"/>
                    </svg>
                    <div style={{ fontSize: "12px", textAlign: "center" }}>Saisissez un montant de retrait<br/>pour voir le calcul fiscal</div>
                  </div>
                ) : (
                  <div>
                    {/* Correction automatique ancienneté */}
                    {ancienneteInconsistante && (
                      <div style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: "10px", padding: "10px 13px", marginBottom: "10px", fontSize: "11px", color: "#2563EB", lineHeight: "1.6" }}>
                        ℹ Dans {retraitHorizon} ans votre PEA aura <strong>{agePEARetrait?.toFixed(1)} ans</strong> → ancienneté corrigée automatiquement à <strong>{ancienneteEffective === "apres5" ? "5 ans et plus ✓" : "moins de 5 ans"}</strong>.
                      </div>
                    )}
                    {/* Avertissement < 5 ans */}
                    {ancienneteEffective === "avant5" && (
                      <div style={{ background: "rgba(220,38,38,0.06)", border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "10px", padding: "10px 13px", marginBottom: "14px", fontSize: "11px", color: C.red, lineHeight: "1.6" }}>
                        <strong>⚠ Attention</strong> : tout retrait avant 5 ans entraîne la <strong>clôture définitive du PEA</strong> (sauf licenciement, invalidité, décès du conjoint).
                      </div>
                    )}

                    <div style={{ background: C.snowOff, borderRadius: "12px", padding: "12px 16px", marginBottom: "14px" }}>
                      <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Décomposition du retrait</div>
                      <div style={row}>
                        <span style={lbl}>Retrait brut</span>
                        <span style={val()}>{fmtEur(R)}</span>
                      </div>
                      <div style={row}>
                        <span style={lbl}>Capital récupéré (non imposé)</span>
                        <span style={val(C.green)}>{fmtEur(capitalRecupere)}</span>
                      </div>
                      <div style={{ ...row, borderBottom: "none" }}>
                        <span style={lbl}>Plus-value imposable ({(pvRatio * 100).toFixed(1)}%)</span>
                        <span style={val(C.goldDark)}>{fmtEur(pvImposable)}</span>
                      </div>
                    </div>

                    <div style={{ background: C.snowOff, borderRadius: "12px", padding: "12px 16px", marginBottom: "14px" }}>
                      <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Fiscalité</div>
                      <div style={row}>
                        <span style={lbl}>Prélèvements sociaux (17,2%)</span>
                        <span style={val(C.red)}>− {fmtEur(montantPS)}</span>
                      </div>
                      <div style={row}>
                        <span style={lbl}>Impôt sur le revenu {ancienneteEffective === "avant5" ? `(${retraitRegime === "pfu" ? "12,8% PFU" : retraitTMI + "% TMI"})` : "(exonéré après 5 ans)"}</span>
                        <span style={val(ancienneteEffective === "apres5" ? C.green : C.red)}>{ancienneteEffective === "apres5" ? "0,00 €" : `− ${fmtEur(montantIR)}`}</span>
                      </div>
                      <div style={{ ...row, borderBottom: "none" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>Total prélèvements</span>
                        <span style={val(C.red)}>− {fmtEur(totalImpots)}</span>
                      </div>
                    </div>

                    {/* Résultat net */}
                    <div style={{ background: `linear-gradient(135deg, #1A3A6B 0%, #2D6CB5 60%, #4B9DD8 100%)`, borderRadius: "12px", padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-end" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "10px" : "0" }}>
                      <div>
                        <div style={{ fontSize: "10px", color: "rgba(193,232,255,0.8)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>Montant net reçu</div>
                        <div style={{ fontSize: isMobile ? "28px" : "22px", fontWeight: "800", color: "#FFFFFF", marginTop: "3px" }}>{fmtEur(montantNet)}</div>
                      </div>
                      <div style={{ textAlign: isMobile ? "left" : "right" }}>
                        <div style={{ fontSize: "10px", color: "rgba(193,232,255,0.8)", fontWeight: "600" }}>Taux effectif</div>
                        <div style={{ fontSize: "18px", fontWeight: "800", color: tauxEff > 20 ? "#FCA5A5" : "#86EFAC" }}>{tauxEff.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: "10px 20px", borderTop: `1px solid ${C.border}`, fontSize: "10px", color: C.inkSubtle, lineHeight: "1.6" }}>
              Calcul basé sur les règles fiscales françaises 2025 · Prélèvements sociaux au taux de 17,2% · PS = CSG 9,2% + CRDS 0,5% + prélèvement de solidarité 7,5% · Les taux TMI sont indicatifs (hors déductions CSG) · Consultez un conseiller fiscal pour votre situation personnelle.
            </div>
          </div>
        );
      })()}

    </div>
  );
}
