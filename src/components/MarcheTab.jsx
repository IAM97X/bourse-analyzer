import { useState, useEffect, useRef, useCallback } from "react";
import { C, shadow } from "../constants/theme";
import { sanitizePositions, fmtEur, isETFName, linReg } from "../lib/finance";
import { ISIN_SECTEUR, detectSecteurNom } from "./PortfolioPieChart";
import { load, save } from "../lib/storage";
import { UI, DEFAULT_POSITIONS } from "../constants/config";
import { StockProjectionChart, PriceEvolutionChart } from "./StockPanels";
import { callClaude, enqueueApi, getKey, hasAI, fetchWithProxy } from "../lib/api";
import { COURTIERS, getCourtierForAccount } from "../constants/courtiers";
import { ThinkingSpinner } from "./UI";
import AppLogo from "./AppLogo";
import Tooltip from "./Tooltip";

const AI_POTENTIEL_KEY = "bourse_ai_potentiel";

const TICKER_CACHE_KEY_M = "bourse_isin_ticker_cache";
const STEP_MS = 7 * 24 * 3600 * 1000; // 1 semaine

const GLOBAL_HORIZONS = [
  { label: "6 mois",  weeks: 26 },
  { label: "12 mois", weeks: 52 },
  { label: "3 ans",   weeks: 156 },
];

function GlobalProjectionChart({ positions, onClose }) {
  const [hidx, setHidx] = useState(1); // 12 mois par défaut
  const [state, setState] = useState({ status: "idle", data: null, error: null, progress: 0 });
  const [hoverFrac, setHoverFrac] = useState(null);
  const svgRef = useRef(null);

  const fmtK = v => v >= 1e6 ? `${(v/1e6).toFixed(2)}M€` : v >= 1e3 ? `${(v/1e3).toFixed(0)}k€` : `${Math.round(v)}€`;

  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const currentValue = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const pvPct = totalInvesti > 0 ? ((currentValue - totalInvesti) / totalInvesti * 100) : null;

  // Dimensions SVG (identiques à StockProjectionChart)
  const VW = 800, VH = 240, ML = 62, MR = 24, MT = 15, MB = 35;
  const CW = VW - ML - MR, CH = VH - MT - MB;

  useEffect(() => {
    const PROJ_WEEKS = GLOBAL_HORIZONS[hidx].weeks;
    let cancelled = false;
    setState({ status: "loading", data: null, error: null, progress: 0 });

    async function run() {
      const cache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY_M) || "{}"); } catch { return {}; } })();

      // Résoudre les tickers manquants
      const missing = positions.filter(p => p.isin && !p.ticker && !cache[p.isin]);
      await Promise.all(missing.map(async p => {
        try {
          const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(p.isin)}&quotesCount=5&newsCount=0`;
          const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return;
          const json = await res.json();
          const quotes = json?.quotes || [];
          const best = quotes.find(q => q.symbol && (q.exchDisp?.includes("Paris") || q.exchDisp?.includes("Euronext")))
            || quotes.find(q => q.symbol && q.quoteType === "EQUITY") || quotes[0];
          if (best?.symbol) cache[p.isin] = best.symbol;
        } catch {}
      }));
      try { localStorage.setItem(TICKER_CACHE_KEY_M, JSON.stringify(cache)); } catch {}

      // Pour chaque position : fetch Yahoo 5 ans hebdo → régression
      let done = 0;
      const results = await Promise.all(positions.map(async pos => {
        const ticker = pos.ticker || (pos.isin && cache[pos.isin]);
        if (!ticker) { done++; if (!cancelled) setState(s => ({ ...s, progress: done / positions.length })); return null; }

        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&range=5y`;
          const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) return null;
          const json = await res.json();
          const r = json?.chart?.result?.[0];
          if (!r) return null;
          const ts = r.timestamp || [];
          const cl = r.indicators?.quote?.[0]?.close || [];
          const pts = ts.map((t, i) => ({ t: t * 1000, p: cl[i] })).filter(x => x.p != null && x.p > 0);
          if (pts.length < 10) return null;

          // Régression log(prix)
          const xs = pts.map((_, i) => i);
          const ys = pts.map(x => Math.log(x.p));
          const { a, b, sigma } = linReg(xs, ys);
          const lastIdx = pts.length - 1;
          const lastPrice = pts[lastIdx].p;
          const lastDate = pts[lastIdx].t;
          const regOffset = Math.log(lastPrice) - (a + b * lastIdx);
          const sigmaC = Math.min(sigma, 0.15);

          // Projections hebdo sur PROJ_WEEKS semaines
          const projMid = [], projHi = [], projLo = [];
          for (let s = 1; s <= PROJ_WEEKS; s++) {
            const xi = lastIdx + s;
            const logMid = a + b * xi + regOffset;
            projMid.push(Math.exp(logMid));
            projHi.push(Math.exp(logMid + sigmaC * Math.sqrt(s)));
            projLo.push(Math.exp(logMid - sigmaC * Math.sqrt(s)));
          }

          done++;
          if (!cancelled) setState(s => ({ ...s, progress: done / positions.length }));
          return { pos, pts, lastDate, projMid, projHi, projLo };
        } catch { done++; return null; }
      }));

      if (cancelled) return;

      const valid = results.filter(Boolean);
      if (valid.length === 0) {
        setState({ status: "error", data: null, error: "Aucune donnée Yahoo disponible", progress: 1 });
        return;
      }

      // Historique : 12 mois glissants
      const now = Date.now();
      const histStart = now - 365 * 86400000;
      const steps = Math.ceil((now - histStart) / STEP_MS);
      const histDates = Array.from({ length: steps + 1 }, (_, i) => histStart + i * STEP_MS);

      const histPortfolio = histDates.map(d => {
        let val = 0;
        for (const r of valid) {
          const { pos, pts } = r;
          const idx = pts.findLastIndex ? pts.findLastIndex(p => p.t <= d) : [...pts].reverse().findIndex(p => p.t <= d);
          const price = idx >= 0
            ? (pts.findLastIndex ? pts[idx].p : pts[pts.length - 1 - idx]?.p ?? pos.dernierCours ?? pos.pru)
            : (pos.dernierCours || pos.pru);
          val += price * pos.quantite;
        }
        return { date: d, val };
      });

      // Projections : somme pondérée × quantité
      const projDates = Array.from({ length: PROJ_WEEKS + 1 }, (_, i) => now + i * STEP_MS);
      const projMid = projDates.map((_, i) => valid.reduce((s, r) => s + (i === 0 ? (r.pos.dernierCours || r.pos.pru) : r.projMid[i - 1] || r.projMid[r.projMid.length - 1]) * r.pos.quantite, 0));
      const projHi  = projDates.map((_, i) => valid.reduce((s, r) => s + (i === 0 ? (r.pos.dernierCours || r.pos.pru) : r.projHi[i - 1]  || r.projHi[r.projHi.length - 1])  * r.pos.quantite, 0));
      const projLo  = projDates.map((_, i) => valid.reduce((s, r) => s + (i === 0 ? (r.pos.dernierCours || r.pos.pru) : r.projLo[i - 1]  || r.projLo[r.projLo.length - 1])  * r.pos.quantite, 0));

      setState({ status: "done", data: { histPortfolio, projDates, projMid, projHi, projLo, validCount: valid.length }, error: null, progress: 1 });
    }

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.map(p => p.id).join(","), hidx]);

  // ── Rendu loading / error ──
  if (state.status === "loading") return (
    <div style={{ background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", borderRadius: "14px", padding: "28px", textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: "12px" }}>
      <ThinkingSpinner size={18} color="#a78bfa" />
      <div style={{ marginTop: "10px" }}>Calcul projection globale… {Math.round(state.progress * 100)}%</div>
    </div>
  );
  if (state.status === "error") return (
    <div style={{ background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", borderRadius: "14px", padding: "18px", color: "#f87171", fontSize: "12px" }}>
      {state.error}
      <button onClick={onClose} style={{ marginLeft: "12px", background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "13px" }}>✕</button>
    </div>
  );
  if (!state.data) return null;

  const { histPortfolio, projDates, projMid, projHi, projLo, validCount } = state.data;
  const PROJ_WEEKS = GLOBAL_HORIZONS[hidx].weeks;

  // ── Échelles ──
  const allDates  = [...histPortfolio.map(p => p.date), ...projDates];
  const allPrices = [...histPortfolio.map(p => p.val), ...projMid];
  const xMin = allDates[0] || 0;
  const xMax = allDates[allDates.length - 1] || 1;
  const yMin_raw = Math.min(...allPrices.filter(Boolean));
  const yMax_raw = Math.max(...allPrices.filter(Boolean));
  const yPad = (yMax_raw - yMin_raw) * 0.12;
  const yMin = Math.max(0, yMin_raw - yPad);
  const yMax = yMax_raw + yPad;

  const xScale = t => ML + (t - xMin) / Math.max(xMax - xMin, 1) * CW;
  const yScale = v => MT + (1 - (v - yMin) / Math.max(yMax - yMin, 0.01)) * CH;

  // Grille Y (5 niveaux réguliers)
  const priceRange = yMax_raw - yMin_raw;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(priceRange / 5, 0.01))));
  const niceStep = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(s => s >= priceRange / 5) || magnitude * 10;
  const gridPrices = [];
  for (let v = Math.ceil(yMin / niceStep) * niceStep; v <= yMax + 0.001; v += niceStep) {
    gridPrices.push(Math.round(v * 100) / 100);
  }

  // Labels X (6 points sur toute la timeline)
  const xLabels = allDates.length > 1
    ? Array.from({ length: 6 }, (_, i) => {
        const idx = Math.round(i * (allDates.length - 1) / 5);
        return { t: allDates[idx] };
      })
    : [];

  // Séparateur "Auj."
  const todayX = xScale(histPortfolio[histPortfolio.length - 1].date);

  // Area historique polygon
  const histPts = [
    `${xScale(histPortfolio[0].date).toFixed(1)},${(MT + CH).toFixed(1)}`,
    ...histPortfolio.map(p => `${xScale(p.date).toFixed(1)},${yScale(p.val).toFixed(1)}`),
    `${xScale(histPortfolio[histPortfolio.length - 1].date).toFixed(1)},${(MT + CH).toFixed(1)}`,
  ].join(" ");

  // Band ±1σ polygon
  const bandPts = [
    ...projDates.map((d, i) => `${xScale(d).toFixed(1)},${yScale(projHi[i]).toFixed(1)}`),
    ...[...projDates].reverse().map((d, i) => {
      const ri = projDates.length - 1 - i;
      return `${xScale(d).toFixed(1)},${yScale(projLo[ri]).toFixed(1)}`;
    }),
  ].join(" ");

  // PRU moyen pondéré du portefeuille
  const pruMoyen = totalInvesti > 0 ? totalInvesti / positions.reduce((s, p) => s + p.quantite, 0) : null;
  // Valeur PRU totale (PRU × quantité pour chaque position)
  const pruTotal = totalInvesti;

  // Hover
  const handleMouseMove = (e) => {
    if (!svgRef.current || !state.data) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width * VW - ML) / CW));
    setHoverFrac(frac);
  };
  const hoverT = hoverFrac != null ? xMin + hoverFrac * (xMax - xMin) : null;
  const isInProj = hoverT != null && hoverT > histPortfolio[histPortfolio.length - 1].date;
  const hoverHistIdx = hoverT != null && !isInProj
    ? histPortfolio.reduce((bi, p, i) => Math.abs(p.date - hoverT) < Math.abs(histPortfolio[bi].date - hoverT) ? i : bi, 0)
    : null;
  const hoverProjIdx = hoverT != null && isInProj && projDates.length
    ? projDates.reduce((bi, t, i) => Math.abs(t - hoverT) < Math.abs(projDates[bi] - hoverT) ? i : bi, 0)
    : null;

  // Performance finale projetée
  const finalProj = projMid[projMid.length - 1];
  const finalPct = finalProj && currentValue ? ((finalProj - currentValue) / currentValue * 100) : null;

  return (
    <div style={{ background: C.snow, borderRadius: "16px", overflow: "hidden", marginTop: "16px", boxShadow: "0 8px 32px rgba(30,58,95,0.12)", border: `1px solid ${C.border}` }}>

      {/* En-tête gradient */}
      <div style={{ background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "14px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em" }}>Portefeuille</span>
          {finalPct != null && (
            <span style={{
              fontSize: "11px", fontWeight: "700", padding: "3px 10px", borderRadius: "20px",
              color: finalPct >= 0 ? "#4ADE80" : "#F87171",
              background: finalPct >= 0 ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
              border: `1px solid ${finalPct >= 0 ? "rgba(74,222,128,0.30)" : "rgba(248,113,113,0.30)"}`,
            }}>
              {GLOBAL_HORIZONS[hidx].label} : {finalPct >= 0 ? "+" : ""}{finalPct.toFixed(1)}%
              {finalProj && <span style={{ fontWeight: "500", marginLeft: "4px", opacity: 0.8 }}>{fmtK(finalProj)}</span>}
            </span>
          )}
          {pvPct !== null && (
            <span style={{ fontSize: "11px", fontWeight: "700", color: pvPct >= 0 ? "#4ADE80" : "#F87171", opacity: 0.8 }}>
              {pvPct >= 0 ? "+" : ""}{pvPct.toFixed(2)}% vs PRU
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
          {GLOBAL_HORIZONS.map((h, i) => (
            <button key={h.label} onClick={() => setHidx(i)} style={{
              padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
              fontSize: "11px", fontWeight: "700", fontFamily: "Inter, sans-serif",
              background: i === hidx ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)",
              color: i === hidx ? "#fff" : "rgba(255,255,255,0.45)",
              boxShadow: i === hidx ? "0 2px 8px rgba(0,0,0,0.25)" : "none",
              transition: "all 0.15s",
            }}>{h.label}</button>
          ))}
          {onClose && (
            <button onClick={onClose} style={{ marginLeft: "2px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontFamily: "Inter, sans-serif" }}>✕</button>
          )}
        </div>
      </div>

      {/* Corps */}
      <div style={{ padding: "16px 20px 20px" }}>
        <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
          style={{ width: "100%", height: "auto", cursor: "crosshair", display: "block", userSelect: "none" }}
          onMouseMove={handleMouseMove} onMouseLeave={() => setHoverFrac(null)}>

          <defs>
            <linearGradient id="glb-hist-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1E3A5F" stopOpacity="0.22" />
              <stop offset="85%" stopColor="#1E3A5F" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#1E3A5F" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="glb-proj-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2D5986" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#2D5986" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Fond zone graphique */}
          <rect x={ML} y={MT} width={CW} height={CH} fill={C.snowOff} rx="4" opacity="0.5" />

          {/* Grille Y */}
          {gridPrices.map(v => (
            <g key={v}>
              <line x1={ML} x2={ML + CW} y1={yScale(v)} y2={yScale(v)} stroke="rgba(148,163,184,0.3)" strokeWidth="1" strokeDasharray="4,4" />
              <text x={ML - 6} y={yScale(v) + 4} textAnchor="end" fontSize="10" fill="#94A3B8" fontFamily="Inter,sans-serif" fontWeight="500">
                {fmtK(v)}
              </text>
            </g>
          ))}

          {/* Labels X */}
          {xLabels.map(({ t }, i) => (
            <text key={i} x={xScale(t)} y={MT + CH + 22} textAnchor="middle" fontSize="9" fill="#94A3B8" fontFamily="Inter,sans-serif">
              {new Date(t).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })}
            </text>
          ))}

          {/* Séparateur "Auj." */}
          <line x1={todayX} x2={todayX} y1={MT} y2={MT + CH} stroke="rgba(148,163,184,0.5)" strokeWidth="1" strokeDasharray="4,3" />
          <text x={todayX} y={MT - 4} textAnchor="middle" fontSize="8" fill="#94A3B8" fontFamily="Inter,sans-serif" fontWeight="600">Auj.</text>

          {/* Area fill historique */}
          <polygon points={histPts} fill="url(#glb-hist-grad)" />

          {/* Bande ±1σ projection */}
          {projDates.length > 0 && (
            <polygon points={bandPts} fill="rgba(45,89,134,0.12)" />
          )}

          {/* Ligne PRU total */}
          {pruTotal > 0 && pruTotal >= yMin && pruTotal <= yMax && (
            <>
              <line x1={ML} x2={ML + CW} y1={yScale(pruTotal)} y2={yScale(pruTotal)} stroke={C.goldDark} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.85" />
              <text x={ML + CW + 3} y={yScale(pruTotal) + 4} fontSize="9" fill={C.goldDark} fontFamily="Inter,sans-serif" fontWeight="600">PRU</text>
            </>
          )}

          {/* Courbe historique */}
          <polyline
            points={histPortfolio.map(p => `${xScale(p.date).toFixed(1)},${yScale(p.val).toFixed(1)}`).join(" ")}
            fill="none" stroke="#1E3A5F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Courbe projection médiane */}
          {projDates.length > 0 && (
            <polyline
              points={[
                `${xScale(histPortfolio[histPortfolio.length - 1].date).toFixed(1)},${yScale(histPortfolio[histPortfolio.length - 1].val).toFixed(1)}`,
                ...projDates.map((d, i) => `${xScale(d).toFixed(1)},${yScale(projMid[i]).toFixed(1)}`),
              ].join(" ")}
              fill="none" stroke="#2D5986" strokeWidth="2" strokeDasharray="7,5" strokeLinecap="round" opacity="0.85" />
          )}

          {/* Crosshair */}
          {hoverFrac != null && hoverT != null && (
            <>
              <line x1={xScale(hoverT)} x2={xScale(hoverT)} y1={MT} y2={MT + CH} stroke="rgba(148,163,184,0.6)" strokeWidth="1" strokeDasharray="3,3" />
              {!isInProj && hoverHistIdx != null && (
                <circle cx={xScale(histPortfolio[hoverHistIdx].date)} cy={yScale(histPortfolio[hoverHistIdx].val)} r="5" fill="#1E3A5F" stroke="#fff" strokeWidth="2.5" />
              )}
              {isInProj && hoverProjIdx != null && (
                <circle cx={xScale(projDates[hoverProjIdx])} cy={yScale(projMid[hoverProjIdx])} r="5" fill="#2D5986" stroke="#fff" strokeWidth="2.5" />
              )}
            </>
          )}
        </svg>

        {/* Infobulle hover */}
        {hoverFrac != null && (
          <div style={{ background: "#111214", borderRadius: "10px", padding: "10px 14px", marginTop: "8px", fontSize: "11px", display: "inline-flex", gap: "14px", flexWrap: "wrap", alignItems: "center", boxShadow: "0 4px 16px rgba(17,18,20,0.18)" }}>
            {!isInProj && hoverHistIdx != null && (
              <>
                <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: "600" }}>
                  {new Date(histPortfolio[hoverHistIdx].date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span style={{ color: "#fff", fontWeight: "800", fontSize: "13px" }}>{fmtK(histPortfolio[hoverHistIdx].val)}</span>
                {pruTotal > 0 && (
                  <span style={{
                    fontWeight: "700",
                    color: histPortfolio[hoverHistIdx].val >= pruTotal ? "#4ADE80" : "#F87171",
                    background: histPortfolio[hoverHistIdx].val >= pruTotal ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                    padding: "2px 8px", borderRadius: "6px",
                  }}>
                    {((histPortfolio[hoverHistIdx].val - pruTotal) / pruTotal * 100).toFixed(2)}% vs PRU
                  </span>
                )}
              </>
            )}
            {isInProj && hoverProjIdx != null && (
              <>
                <span style={{ color: "#A78BFA", fontWeight: "700" }}>Projection</span>
                <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: "600" }}>
                  {new Date(projDates[hoverProjIdx]).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span style={{ color: "#fff", fontWeight: "800", fontSize: "13px" }}>{fmtK(projMid[hoverProjIdx])}</span>
                {pruTotal > 0 && (
                  <span style={{
                    fontWeight: "700",
                    color: projMid[hoverProjIdx] >= pruTotal ? "#4ADE80" : "#F87171",
                    background: projMid[hoverProjIdx] >= pruTotal ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                    padding: "2px 8px", borderRadius: "6px",
                  }}>
                    {((projMid[hoverProjIdx] - pruTotal) / pruTotal * 100).toFixed(2)}% vs PRU
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Légende */}
        <div style={{ display: "flex", gap: "14px", marginTop: "12px", flexWrap: "wrap", fontSize: "10px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.inkMuted }}>
            <span style={{ width: "18px", height: "2.5px", background: "#1E3A5F", borderRadius: "2px", display: "inline-block" }} />
            Cours
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.inkSubtle }}>
            <span style={{ width: "18px", height: "1px", borderTop: "2px dashed #2D5986", display: "inline-block" }} />
            Tendance
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.inkSubtle }}>
            <span style={{ width: "12px", height: "10px", background: "rgba(30,58,95,0.15)", borderRadius: "2px", display: "inline-block" }} />
            ±1σ
          </span>
          {pruTotal > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.goldDark }}>
              <span style={{ width: "18px", height: "1px", borderTop: "1.5px dashed #B8920A", display: "inline-block" }} />
              PRU {fmtK(pruTotal)}
            </span>
          )}
          <span style={{ marginLeft: "auto", color: C.inkSubtle, fontSize: "9px" }}>
            {validCount} valeur{validCount > 1 ? "s" : ""} · régression Yahoo 5 ans
          </span>
        </div>

        <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "4px", opacity: 0.7 }}>
          ⚠ Projection extrapolée. Non garantie. Ne constitue pas un conseil en investissement.
        </div>
      </div>
    </div>
  );
}

// ─── Marché Tab ─────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return null;
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)  return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

function MarcheTab({ profil, portfolioVersion, account = "PEA", marketScores, marketScoringUi, onRunScoring }) {
  const [allPositions, setAllPositions] = useState(() => sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
  const positions = allPositions.filter(p => (p.compte || "PEA") === account);
  const [selectedPosId, setSelectedPosId] = useState("__global__");
  const [aiPotentiel, setAiPotentiel]   = useState(() => load(AI_POTENTIEL_KEY, null));
  const [aiPotLoading, setAiPotLoading] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const scoredAgo = timeAgo(load("bourse_market_scores_ts", null));

  useEffect(() => {
    setAllPositions(sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
    setSelectedPosId(null);
  }, [portfolioVersion]);

  if (positions.length === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.inkSubtle, fontSize: "13px" }}>
      Aucune position dans le portefeuille · Ajoutez des positions dans l'onglet Portefeuille
    </div>
  );

  const selectedPos = positions.find(p => p.id === selectedPosId) || null;
  const SIG_COLOR  = { ACHAT: C.green, RENFORCER: C.accent, ATTENDRE: C.gold, PRUDENCE: C.red, VENDRE: "#7B1111" };
  const SIG_BG     = { ACHAT: C.greenLight, RENFORCER: C.paleBlue, ATTENDRE: C.goldLight, PRUDENCE: C.redLight, VENDRE: "rgba(123,17,17,0.08)" };
  const SIG_PHRASE = { ACHAT: "Momentum favorable, à surveiller", RENFORCER: "Position solide, tu peux étoffer", ATTENDRE: "Pas d'action urgente", PRUDENCE: "Contexte dégradé, reste vigilant", VENDRE: "Signal négatif détecté" };

  const scores = Array.isArray(marketScores) ? marketScores : [];
  const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY_M) || "{}"); } catch { return {}; } })();
  const scoredPositions = positions.map(p => {
    const s = scores.find(sc => sc.isin === p.isin || sc.nom?.toLowerCase() === p.nom?.toLowerCase());
    const hasRealtime = !!(p.ticker || (p.isin && tickerCache[p.isin]));
    return { ...p, _score: s || null, _hasRealtime: hasRealtime };
  }).sort((a, b) => (b._score?.score_marche ?? -1) - (a._score?.score_marche ?? -1));
  const realtimeCount = scoredPositions.filter(p => p._hasRealtime).length;

  return (
    <div>
      {/* ── Scoring IA dynamique ── */}
      <div style={{ background: C.cardGrad, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "22px", boxShadow: shadow.card, marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "14px", color: C.ink }}>
              <Tooltip term="SCORING">Scoring IA Dynamique</Tooltip>
            </div>
            <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
              Analyse temps réel de chaque position — actualités + signaux marché
              {marketScoringUi === "loading" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#B07D2E", fontWeight: "600" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#B07D2E", display: "inline-block", animation: "pulse 1.2s ease-in-out infinite" }} />
                  Analyse en cours…
                </span>
              )}
              {marketScoringUi !== "loading" && scoredAgo && (
                <span style={{ color: C.inkSubtle, opacity: 0.7 }}>· Mis à jour {scoredAgo}</span>
              )}
              {marketScoringUi !== "loading" && scores.length > 0 && realtimeCount < positions.length && (
                <span style={{ color: "#B07D2E", fontWeight: "600" }} title="Ces positions n'ont pas de ticker Yahoo — scorées sur la base de connaissance Claude uniquement">
                  · ⚠ {positions.length - realtimeCount} sans ticker
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onRunScoring && onRunScoring(positions)}
            disabled={marketScoringUi === UI.LOADING}
            style={{ padding: "8px 18px", borderRadius: "12px", border: "none", cursor: marketScoringUi === UI.LOADING ? "not-allowed" : "pointer", background: marketScoringUi === UI.LOADING ? C.snowDim : "linear-gradient(135deg, #1A3A6B, #2D6CB5)", color: marketScoringUi === UI.LOADING ? C.inkSubtle : "#fff", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", boxShadow: marketScoringUi !== UI.LOADING ? shadow.pill : "none", transition: "all 0.15s" }}>
            {marketScoringUi === UI.LOADING
              ? <><AppLogo size={14} animated={true} /> Analyse en cours…</>
              : "Lancer le scoring IA"}
          </button>
        </div>

        {marketScoringUi === UI.IDLE && scores.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 0", color: C.inkSubtle, fontSize: "13px" }}>
            Cliquez sur "Lancer le scoring IA" pour analyser vos positions en temps réel.
          </div>
        )}

        {(marketScoringUi === UI.RESULT || scores.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {scoredPositions.map(pos => {
              const s = pos._score;
              if (!s) return (
                <div key={pos.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: C.snowOff, borderRadius: "12px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: C.inkMuted, minWidth: "120px" }}>{pos.nom}</div>
                  <div style={{ fontSize: "11px", color: C.inkSubtle }}>Non scoré — Lancez une analyse</div>
                </div>
              );
              const scoreBarColor = s.score_marche >= 16 ? C.green : s.score_marche >= 13 ? C.accent : s.score_marche >= 9 ? C.gold : s.score_marche >= 5 ? C.red : "#7B1111";
              // Dériver le signal depuis le score si incohérent (ex: ATTENDRE à 8/20)
              const derivedSignal = s.score_marche >= 16 ? "ACHAT" : s.score_marche >= 13 ? "RENFORCER" : s.score_marche >= 9 ? "ATTENDRE" : s.score_marche >= 5 ? "PRUDENCE" : "VENDRE";
              const signal = (s.signal && SIG_COLOR[s.signal] && (
                (s.signal === "ACHAT"      && s.score_marche >= 16) ||
                (s.signal === "RENFORCER"  && s.score_marche >= 13) ||
                (s.signal === "ATTENDRE"   && s.score_marche >= 9  && s.score_marche < 13) ||
                (s.signal === "PRUDENCE"   && s.score_marche >= 5  && s.score_marche < 9) ||
                (s.signal === "VENDRE"     && s.score_marche < 5)
              )) ? s.signal : derivedSignal;
              return (
                <div key={pos.id} style={{ padding: "14px 16px", background: SIG_BG[signal] || C.snowOff, borderRadius: "14px", border: `1px solid ${SIG_COLOR[signal] ? SIG_COLOR[signal] + "33" : C.border}`, display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: "100px" }}>
                      <div style={{ fontWeight: "700", fontSize: "13.5px", color: C.ink }}>{pos.nom}</div>
                      {SIG_PHRASE[signal] && (
                        <div style={{ fontSize: "11px", color: SIG_COLOR[signal], fontWeight: "500", marginTop: "2px", opacity: 0.85 }}>{SIG_PHRASE[signal]}</div>
                      )}
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: "800", color: SIG_COLOR[signal] || C.inkMuted, background: SIG_COLOR[signal] ? SIG_COLOR[signal] + "22" : C.snowDim, padding: "3px 10px", borderRadius: "20px", border: `1px solid ${SIG_COLOR[signal] || C.border}`, letterSpacing: "0.5px" }}>{signal}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ width: "80px", height: "6px", borderRadius: "3px", background: C.snowDim, overflow: "hidden" }}>
                        <div style={{ width: `${(s.score_marche / 20) * 100}%`, height: "100%", background: scoreBarColor, borderRadius: "3px", transition: "width 0.5s" }} />
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: scoreBarColor }}>{s.score_marche}/20</span>
                    </div>
                  </div>
                  {s.resume && <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>{s.resume}</div>}
                  {s.catalyseur_cle && (
                    <div style={{ fontSize: "11px", color: C.inkSubtle, display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ fontWeight: "700", color: C.inkMuted }}>Catalyseur :</span> {s.catalyseur_cle}
                    </div>
                  )}
                  {!pos._hasRealtime && (
                    <div style={{ fontSize: "10px", color: "#B07D2E", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: "6px", padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: "4px", alignSelf: "flex-start" }}
                      title="Aucun ticker Yahoo trouvé pour cette position — le score s'appuie sur la base de connaissance Claude sans données temps réel. Renseignez le ticker manuellement dans l'onglet Positions pour activer les données temps réel.">
                      ⚠ Base de connaissance uniquement — <strong>ajouter le ticker</strong> pour activer les données RT
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {marketScoringUi === UI.ERROR && (
          <div style={{ padding: "12px 14px", background: C.redLight, border: `1px solid rgba(231,76,60,0.25)`, borderRadius: "12px", color: C.red, fontSize: "12.5px" }}>
            Erreur lors du scoring — Vérifiez votre clé API et réessayez.
          </div>
        )}
      </div>

      {/* ── Potentiel du portefeuille (IA) ── */}
      {(() => {
        const totalVal = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
        const totalInv = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
        const pvPct    = totalInv > 0 ? (totalVal - totalInv) / totalInv * 100 : 0;
        const horizonMap = { court: { label: "< 2 ans", annees: 1 }, moyen: { label: "2–5 ans", annees: 3 }, long: { label: "5–10 ans", annees: 7 }, "tres-long": { label: "> 10 ans", annees: 15 } };
        const horizonInfo = horizonMap[profil?.horizon] || horizonMap.moyen;

        const analyzePortfolioPotentiel = async () => {
          setAiPotLoading(true);
          setAiPotentiel(null);
          save(AI_POTENTIEL_KEY, null);
          try {
            const scores = Array.isArray(marketScores) ? marketScores : [];
            const summary = positions.map(p => {
              const sig = scores.find(s => s.isin === p.isin || s.nom === p.nom);
              return {
                nom: p.nom, isin: p.isin || null, secteur: p.secteur || ISIN_SECTEUR[p.isin] || detectSecteurNom(p.nom) || null,
                pru: p.pru, quantite: p.quantite, cours: p.dernierCours || p.pru,
                pv_pct: p.pru > 0 ? +((( p.dernierCours || p.pru) - p.pru) / p.pru * 100).toFixed(1) : 0,
                signal_ia: sig?.signal || null, resume_ia: sig?.resume || null,
              };
            });
            const sys = `Tu es un analyste financier senior. Analyse le portefeuille et retourne UNIQUEMENT un JSON valide, sans markdown.`;
            const horizonAns = horizonInfo.annees || 10;
            const dcaMensuel = Number(profil?.dcaMensuel) || 0;
            const objectifEuros = Number(profil?.objectifEuros) || 0;
            const risque = profil?.risque || "equilibre";
            const courtierCfg = COURTIERS[getCourtierForAccount(profil, account)] || COURTIERS.boursobank;
            const minETF = courtierCfg.minOrdreETF || courtierCfg.minOrdre || 50;
            const minSC  = courtierCfg.minOrdreSmallCap || courtierCfg.minOrdre || 100;
            const fractionne = courtierCfg.fractionne || false;

            // Répartition ETF vs small caps selon profil risque
            const repartMatrix = {
              prudent:         { etfPct: 90, scPct: 10 },
              equilibre:       { etfPct: 70, scPct: 30 },
              dynamique:       { etfPct: 50, scPct: 50 },
              "tres-dynamique":{ etfPct: 30, scPct: 70 },
            };
            const repart = repartMatrix[risque] || repartMatrix.equilibre;

            // CAGR ETF (stable) et small caps (opportuniste)
            const cagrETF = { court: 6, moyen: 7, long: 8, "tres-long": 8 }[profil?.horizon || "moyen"] ?? 7;
            const cagrSC  = { court: 8, moyen: 11, long: 14, "tres-long": 15 }[profil?.horizon || "moyen"] ?? 11;
            // CAGR DCA pondéré selon répartition
            const dcaCagr = Math.round(cagrETF * repart.etfPct/100 + cagrSC * repart.scPct/100);

            // Capacité DCA : peut-on faire ETF + SC le même mois ?
            const peutFaireETF = dcaMensuel >= minETF;
            const peutFaireLesDeux = dcaMensuel >= (minETF + minSC);
            const ordresParMois = fractionne ? 2 : peutFaireLesDeux ? 2 : peutFaireETF ? 1 : Math.floor(dcaMensuel / Math.max(minSC, 1));
            const unSeulOrdre = ordresParMois <= 1;

            const dcaCible = fractionne
              ? `achat fractionné — ${repart.etfPct}% ETF (~${cagrETF}%/an) + ${repart.scPct}% small caps (~${cagrSC}%/an) → CAGR DCA pondéré ~${dcaCagr}%/an`
              : peutFaireLesDeux
              ? `2 ordres/mois possibles (min ETF ${minETF}€, min actions ${minSC}€) — ${repart.etfPct}% ETF + ${repart.scPct}% small caps → CAGR DCA pondéré ~${dcaCagr}%/an`
              : peutFaireETF
              ? `1 ordre/mois — alternance ETF (${repart.etfPct}% du temps, min ${minETF}€, ~${cagrETF}%/an) et small caps opportunistes (${repart.scPct}% du temps, min ${minSC}€, ~${cagrSC}%/an) → CAGR DCA pondéré ~${dcaCagr}%/an`
              : `1 ordre/mois sur actions uniquement (DCA ${fmtEur(dcaMensuel)} < min ETF ${minETF}€) — small caps ~${cagrSC}%/an`;

            const user = `Portefeuille : ${positions.length} positions, valeur actuelle ${fmtEur(totalVal)}, P/V global ${pvPct >= 0 ? "+" : ""}${pvPct.toFixed(1)}%.
Horizon : ${horizonInfo.label} (${horizonAns} ans). Profil investisseur : ${risque}.
DCA mensuel prévu : ${fmtEur(dcaMensuel)}/mois — investi ${dcaCible}.${objectifEuros > 0 ? `\nObjectif patrimonial : ${fmtEur(objectifEuros)}.` : ""}
Données positions : ${JSON.stringify(summary)}

Pour chaque position, estime un CAGR réaliste selon son type (ETF, small cap, large cap), secteur, signal IA.
Calcule valeur_projetee_position = valeur_actuelle × (1 + CAGR/100)^${horizonAns}.
Calcule cagr_portefeuille = CAGR moyen pondéré par valeur de toutes les positions.
Pour la valeur projetée TOTALE avec DCA, utilise un CAGR DCA pondéré entre le CAGR des positions ETF et celui des actions selon la composition du portefeuille : valeur_projetee_avec_dca = valeur_projetee_positions + DCA × ((1+r)^n - 1) / r avec r=cagr_dca/100/12, n=${horizonAns*12}. Le cagr_dca doit être un juste milieu entre cagr_portefeuille et le CAGR ETF (~${cagrETF}%/an) selon la part ETF du portefeuille (${repart.etfPct}%). Suggestion : cagr_dca ≈ ${dcaCagr}%.

Retourne ce JSON exact (aucun texte autour) :
{"score":7,"label":"Très bon","resume":"2-3 phrases synthèse incluant l'effet DCA et le profil ${risque}","valeur_actuelle":${Math.round(totalVal)},"valeur_projetee":12500,"valeur_projetee_avec_dca":45000,"cagr_portefeuille":6.5,"cagr_dca":${dcaCagr},"points_forts":["point 1","point 2"],"points_faibles":["point 1","point 2"],"positions":[{"nom":"nom exact","valeur_actuelle":1500,"cagr":8.5,"valeur_projetee":3240,"impact":"positif","raison":"courte raison"}]}`;
            const data = await enqueueApi(() => callClaude(sys, user, false, 4, false, 2000));
            setAiPotentiel(data);
            save(AI_POTENTIEL_KEY, data);
          } catch (e) {
            const err = { error: e.message || "Erreur analyse IA" };
            setAiPotentiel(err);
          }
          setAiPotLoading(false);
        };

        const ap = aiPotentiel;
        const apColor = ap?.score >= 7 ? C.green : ap?.score >= 5 ? C.gold : C.red;

        return (
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "20px 22px", boxShadow: shadow.card, marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ fontWeight: "700", fontSize: "14px", color: C.ink }}>Potentiel du portefeuille</div>
                <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>Analyse IA globale · horizon {horizonInfo.label}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {ap && !ap.error && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "52px", height: "52px", borderRadius: "14px", background: apColor + "18", border: `2px solid ${apColor}40` }}>
                    <div style={{ fontSize: "22px", fontWeight: "900", color: apColor, lineHeight: 1 }}>{ap.score}</div>
                    <div style={{ fontSize: "8px", fontWeight: "700", color: apColor }}>/10</div>
                  </div>
                )}
                <button
                  onClick={analyzePortfolioPotentiel}
                  disabled={aiPotLoading || !hasAI()}
                  style={{ padding: "8px 18px", borderRadius: "12px", border: "none", cursor: aiPotLoading ? "not-allowed" : "pointer", background: aiPotLoading ? C.snowDim : "linear-gradient(135deg, #2D6CB5, #4B9DD8, #2D6CB5)", color: aiPotLoading ? C.inkSubtle : "#fff", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                  {aiPotLoading
                    ? <><AppLogo size={14} animated={true} /> Analyse en cours…</>
                    : ap && !ap.error ? "🔄 Relancer" : "🤖 Analyser le potentiel"}
                </button>
              </div>
            </div>

            {ap?.error && <div style={{ fontSize: "11px", color: C.red, marginBottom: "10px" }}>⚠ {ap.error}</div>}

            {ap && !ap.error && (
              <>
                {ap.resume && (
                  <div style={{ background: apColor + "0D", border: `1px solid ${apColor}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "12px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "800", color: apColor, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Analyse IA · {ap.label}</div>
                    <div style={{ fontSize: "12px", color: C.ink, lineHeight: "1.65" }}>{ap.resume}</div>
                  </div>
                )}
                {ap.valeur_projetee > 0 && (
                  <div style={{ background: "linear-gradient(135deg,rgba(5,150,105,0.06) 0%,rgba(30,58,95,0.06) 100%)", border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "12px", padding: "12px 16px", marginBottom: "12px" }}>
                    {/* En-tête : horizon + CAGR */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "6px" }}>
                      <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600" }}>
                        Horizon <strong style={{ color: C.ink }}>{horizonInfo.annees} ans</strong>
                        {" · "}CAGR estimé <strong style={{ color: C.green }}>+{ap.cagr_portefeuille?.toFixed(1)}%/an</strong>
                      </div>
                      {Number(profil?.objectifEuros) > 0 && ap.valeur_projetee_avec_dca > 0 && (
                        <div style={{
                          fontSize: "11px", fontWeight: "800", padding: "2px 10px", borderRadius: "20px",
                          background: ap.valeur_projetee_avec_dca >= Number(profil.objectifEuros) ? "rgba(5,150,105,0.12)" : "rgba(220,38,38,0.10)",
                          color: ap.valeur_projetee_avec_dca >= Number(profil.objectifEuros) ? C.green : C.red,
                        }}>
                          {Math.round(ap.valeur_projetee_avec_dca / Number(profil.objectifEuros) * 100)}% de l'objectif
                        </div>
                      )}
                    </div>
                    {/* Grille 2 colonnes : sans DCA / avec DCA */}
                    <div style={{ display: "grid", gridTemplateColumns: ap.valeur_projetee_avec_dca > 0 ? "1fr 1fr" : "1fr", gap: "10px" }}>
                      <div style={{ background: "rgba(5,150,105,0.06)", borderRadius: "10px", padding: "10px 14px" }}>
                        <div style={{ fontSize: "9px", fontWeight: "700", color: C.green, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Positions seules</div>
                        <div style={{ fontSize: "20px", fontWeight: "900", color: C.green, lineHeight: 1 }}>{fmtEur(ap.valeur_projetee)}</div>
                        <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px" }}>depuis {fmtEur(ap.valeur_actuelle || totalVal)} actuels</div>
                      </div>
                      {ap.valeur_projetee_avec_dca > 0 && (
                        <div style={{ background: "rgba(30,58,95,0.07)", borderRadius: "10px", padding: "10px 14px" }}>
                          <div style={{ fontSize: "9px", fontWeight: "700", color: C.navy, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>
                            + DCA {fmtEur(Number(profil?.dcaMensuel)||0)}/mois
                          </div>
                          <div style={{ fontSize: "22px", fontWeight: "900", color: C.navy, lineHeight: 1 }}>{fmtEur(ap.valeur_projetee_avec_dca)}</div>
                          <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px" }}>
                            ×{(ap.valeur_projetee_avec_dca / (ap.valeur_actuelle || totalVal)).toFixed(1)} votre mise initiale
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {((ap.points_forts?.length > 0) || (ap.points_faibles?.length > 0)) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                    {ap.points_forts?.length > 0 && (
                      <div style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "10px", padding: "10px 12px" }}>
                        <div style={{ fontSize: "9px", fontWeight: "800", color: C.green, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>▲ Points forts</div>
                        {ap.points_forts.map((p, i) => <div key={i} style={{ fontSize: "11px", color: C.ink, marginBottom: "3px" }}>· {p}</div>)}
                      </div>
                    )}
                    {ap.points_faibles?.length > 0 && (
                      <div style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "10px", padding: "10px 12px" }}>
                        <div style={{ fontSize: "9px", fontWeight: "800", color: C.red, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>▼ Points faibles</div>
                        {ap.points_faibles.map((p, i) => <div key={i} style={{ fontSize: "11px", color: C.ink, marginBottom: "3px" }}>· {p}</div>)}
                      </div>
                    )}
                  </div>
                )}
                {ap.positions?.length > 0 && (
                  <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 14px" }}>
                    <div style={{ fontSize: "9px", fontWeight: "800", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Impact par ligne</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {ap.positions.map((p, i) => {
                        const ic = p.impact === "positif" ? C.green : p.impact === "negatif" ? C.red : C.inkSubtle;
                        const ib = p.impact === "positif" ? C.greenLight : p.impact === "negatif" ? C.redLight : "transparent";
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", background: ib, borderRadius: "6px", padding: "5px 8px" }}>
                            <span style={{ fontSize: "10px", fontWeight: "800", color: ic, flexShrink: 0 }}>{p.impact === "positif" ? "▲" : p.impact === "negatif" ? "▼" : "·"}</span>
                            <span style={{ fontSize: "11px", fontWeight: "700", color: C.ink, flexShrink: 0, minWidth: "120px" }}>{p.nom}</span>
                            {p.cagr != null && <span style={{ fontSize: "10px", fontWeight: "700", color: ic, flexShrink: 0, background: ic + "18", borderRadius: "4px", padding: "1px 5px" }}>~{p.cagr}%/an</span>}
                            {p.valeur_projetee != null && <span style={{ fontSize: "10px", color: C.inkSubtle, flexShrink: 0 }}>→ {fmtEur(p.valeur_projetee)}</span>}
                            <span style={{ fontSize: "11px", color: C.inkMuted, lineHeight: "1.4" }}>{p.raison}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
            {!ap && !aiPotLoading && (
              <div style={{ textAlign: "center", padding: "20px 0", color: C.inkSubtle, fontSize: "12px" }}>
                Cliquez sur "Analyser le potentiel" pour obtenir une évaluation IA approfondie.
              </div>
            )}
            <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "10px" }}>⚠ Score indicatif. Ne constitue pas un conseil en investissement.</div>
          </div>
        );
      })()}

      {/* ── Projection par valeur ── */}
      <div style={{ background: C.cardGradPurp, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "22px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>
          Projection par valeur
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          {/* Bouton Projection globale */}
          <button onClick={() => setSelectedPosId("__global__")} style={{
            padding: "6px 14px", borderRadius: "20px",
            border: `1.5px solid ${selectedPosId === "__global__" ? "#7C3AED" : C.border}`,
            background: selectedPosId === "__global__" ? "rgba(124,58,237,0.12)" : C.snowOff,
            color: selectedPosId === "__global__" ? "#7C3AED" : C.inkMuted,
            fontSize: "11px", fontWeight: selectedPosId === "__global__" ? "700" : "500",
            fontFamily: "Inter, sans-serif", cursor: "pointer",
          }}>
            Projection globale
          </button>
          {positions.map(pos => (
            <button key={pos.id} onClick={() => setSelectedPosId(pos.id === selectedPosId ? null : pos.id)} style={{
              padding: "6px 12px", borderRadius: "20px", border: `1px solid ${pos.id === selectedPosId ? C.navy : C.border}`,
              background: pos.id === selectedPosId ? C.navyLight : C.snowOff,
              color: pos.id === selectedPosId ? C.navy : C.inkMuted,
              fontSize: "11px", fontWeight: pos.id === selectedPosId ? "700" : "500",
              fontFamily: "Inter, sans-serif", cursor: "pointer",
            }}>
              {pos.nom.split(" ").slice(0,2).join(" ")}
            </button>
          ))}
        </div>
        {selectedPosId === "__global__"
          ? <GlobalProjectionChart positions={positions} onClose={() => setSelectedPosId(null)} />
          : selectedPos
            ? <StockProjectionChart pos={selectedPos} onClose={() => setSelectedPosId(null)} />
            : <div style={{ fontSize: "12px", color: C.inkSubtle, padding: "16px 0", textAlign: "center" }}>
                Sélectionnez une valeur ou "Projection globale" pour afficher sa projection
              </div>
        }
      </div>

      <div style={{ height: "20px" }} />
      <PriceEvolutionChart positions={positions} />
    </div>
  );
}






export default MarcheTab;
