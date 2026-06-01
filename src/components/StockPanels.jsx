import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, shadow } from "../constants/theme";
import { fmtEur, fmtCours, sanitizePositions, getCachedCours, linReg, computeMA, computeRSI } from "../lib/finance";
import { load } from "../lib/storage";
import { fetchWithProxy } from "../lib/api";
import { fetchFMPHistoricalByTicker } from "../lib/market";
import { BNextLabel, LoadingPanel, ErrorPanel } from "./UI";
import { InfoTip } from "./PortfolioChart";
import CompanyAvatar from "./CompanyAvatar";
import { TABS } from "../constants/tabs";

const TICKER_CACHE_KEY = "bourse_isin_ticker_cache";

// ─── Price Range Bar ──────────────────────────────────────────────────────────
export function PriceRangeBar({ cours, objBas, objMoyen, objHaut }) {
  if (!cours) return null;
  const lo  = Math.min(cours, objBas  || cours) * 0.92;
  const hi  = Math.max(cours, objHaut || cours) * 1.08;
  const rng = hi - lo || 1;
  const pct = (v) => `${((v - lo) / rng * 100).toFixed(1)}%`;
  return (
    <div style={{ position: "relative", height: "14px", background: C.snowDim, borderRadius: "4px", overflow: "visible", marginTop: "4px" }}>
      {objBas && objHaut && (
        <div style={{ position: "absolute", left: pct(objBas), right: `${(100 - parseFloat(pct(objHaut))).toFixed(1)}%`, height: "100%", background: C.greenLight, borderRadius: "3px" }} />
      )}
      {objMoyen && <div style={{ position: "absolute", left: pct(objMoyen), transform: "translateX(-50%)", width: "2px", height: "100%", background: C.goldDark, borderRadius: "1px" }} />}
      <div style={{ position: "absolute", left: pct(cours), transform: "translateX(-50%)", width: "3px", height: "100%", background: C.navy, borderRadius: "1px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: C.inkSubtle, paddingTop: "18px" }}>
        {objBas   && <span style={{ color: C.red }}>{objBas.toFixed(3)}€</span>}
        <span style={{ color: C.navy }}>▲ {cours.toFixed(3)}€</span>
        {objMoyen && <span style={{ color: C.goldDark }}>⬤ {objMoyen.toFixed(3)}€</span>}
        {objHaut  && <span style={{ color: C.green }}>{objHaut.toFixed(3)}€</span>}
      </div>
    </div>
  );
}


// ─── Tab accent gradients ─────────────────────────────────────────────────────
const TAB_ACCENTS = {
  [TABS.PORTFOLIO]:  "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(33,37,40,0.05) 0%, transparent 70%)",
  [TABS.MARCHE]:     "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(8,145,178,0.07) 0%, transparent 70%)",
  [TABS.DCA]:        "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(217,119,6,0.07) 0%, transparent 70%)",
  [TABS.PROJECTION]: "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(5,150,105,0.07) 0%, transparent 70%)",
  [TABS.HISTORIQUE]: "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(124,58,237,0.07) 0%, transparent 70%)",
  [TABS.OPERATIONS]: "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(220,38,38,0.06) 0%, transparent 70%)",
  [TABS.PROFIL]:     "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(100,116,139,0.06) 0%, transparent 70%)",
};

// ─── Projection par valeur (historique + extrapolation tendancielle) ───────────
const PROJ_HORIZONS = [
  { label: "6 mois",  months: 6,  range: "1y",  interval: "1d" },
  { label: "12 mois", months: 12, range: "2y",  interval: "1d" },
  { label: "3 ans",   months: 36, range: "5y",  interval: "1wk" },
];

// ─── Live Market Panel ─────────────────────────────────────────────────────────
function fmtVol(v) {
  if (!v || v <= 0) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}

export function LiveMarketPanel({ pos, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState(null);

  const load_ = useCallback(async () => {
    setLoading(true); setErr(null); setData(null);

    // Résolution ticker : manuel → cache ISIN localStorage → recherche Yahoo Finance par ISIN
    const cache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
    if (pos.isin && pos.ticker) cache[pos.isin] = pos.ticker;
    let ticker = (pos.isin && cache[pos.isin]) || pos.ticker || null;

    // Auto-résolution via Yahoo Finance search si ISIN connu mais ticker absent du cache
    if (!ticker && pos.isin) {
      try {
        const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(pos.isin)}&quotesCount=3&newsCount=0`;
        const sRes = await fetchWithProxy(searchUrl, { signal: AbortSignal.timeout(10000) });
        if (sRes.ok) {
          const sJson = await sRes.json();
          const hit = (sJson?.quotes || []).find(q => ["EQUITY","ETF","MUTUALFUND"].includes(q.quoteType));
          if (hit?.symbol) {
            ticker = hit.symbol;
            try { cache[pos.isin] = ticker; localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(cache)); } catch {}
          }
        }
      } catch {}
    }

    if (!ticker) { setErr("Ticker Yahoo Finance introuvable · renseignez-le manuellement via ✏ dans le tableau."); setLoading(false); return; }
    try {
      const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=5m&range=1d`;
      const res  = await fetchWithProxy(url, { signal: AbortSignal.timeout(14000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const r    = json?.chart?.result?.[0];
      if (!r) throw new Error("Données indisponibles");

      const meta  = r.meta || {};
      const ts    = r.timestamp || [];
      const q     = r.indicators?.quote?.[0] || {};
      const pts   = ts.map((t, i) => ({
        t: t * 1000,
        close:  q.close?.[i]  ?? null,
        volume: q.volume?.[i] ?? 0,
        high:   q.high?.[i]   ?? null,
        low:    q.low?.[i]    ?? null,
      })).filter(p => p.close != null && p.close > 0);

      if (pts.length < 3) throw new Error("Données intraday insuffisantes");

      const last      = pts[pts.length - 1];
      const prevClose = meta.chartPreviousClose || meta.previousClose || pts[0].close;
      const change    = last.close - prevClose;
      const changePct = (change / prevClose) * 100;
      const totalVol  = pts.reduce((s, p) => s + p.volume, 0);
      const dayHigh   = Math.max(...pts.map(p => p.high ?? p.close));
      const dayLow    = Math.min(...pts.map(p => p.low  ?? p.close));

      // ── Volume Profile ──────────────────────────────────────────────
      const pMin = Math.min(...pts.map(p => p.close));
      const pMax = Math.max(...pts.map(p => p.close));
      const N    = 24;
      const bs   = (pMax - pMin) / N || 0.01;
      const bins = Array.from({ length: N }, (_, i) => ({
        lo: pMin + i * bs,
        hi: pMin + (i + 1) * bs,
        mid: pMin + (i + 0.5) * bs,
        vol: 0,
      }));
      for (const pt of pts) {
        const bi = Math.min(N - 1, Math.floor((pt.close - pMin) / bs));
        if (bi >= 0) bins[bi].vol += pt.volume;
      }
      const poc = bins.reduce((best, b) => b.vol > best.vol ? b : best);
      // Value Area — 70%
      const target = totalVol * 0.70;
      let vaVol = poc.vol, vaLo = bins.indexOf(poc), vaHi = vaLo;
      while (vaVol < target && (vaLo > 0 || vaHi < N - 1)) {
        const down = vaLo > 0 ? bins[vaLo - 1].vol : 0;
        const up   = vaHi < N - 1 ? bins[vaHi + 1].vol : 0;
        if (down >= up && vaLo > 0) { vaVol += down; vaLo--; }
        else if (vaHi < N - 1) { vaVol += up; vaHi++; }
        else break;
      }
      const VAH = bins[vaHi].hi;
      const VAL = bins[vaLo].lo;
      // HVN / LVN (excluding POC)
      const avgVol = totalVol / N;
      const hvn = bins.filter(b => b !== poc && b.vol > avgVol * 1.5).sort((a, b) => b.vol - a.vol)[0] || null;
      const lvn = bins.filter(b => b.vol > 0 && b.vol < avgVol * 0.35).sort((a, b) => a.vol - b.vol)[0] || null;

      setData({ pts, last, prevClose, change, changePct, totalVol, dayHigh, dayLow, poc, VAH, VAL, hvn, lvn });
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [pos.ticker]);

  useEffect(() => { load_(); }, [load_]);

  const up = data ? data.changePct >= 0 : true;

  // ── Sparkline SVG ───────────────────────────────────────────────────
  const Sparkline = ({ pts: P, W = 260, H = 64 }) => {
    if (!P || P.length < 2) return null;
    const prices = P.map(p => p.close);
    const mn = Math.min(...prices), mx = Math.max(...prices), range = mx - mn || 1;
    const px = 6, py = 6;
    const xs = i  => px + (i / (P.length - 1)) * (W - 2 * px);
    const ys = v  => H - py - ((v - mn) / range) * (H - 2 * py);
    const d  = prices.map((v, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
    const color = up ? C.green : C.red;
    // Gradient fill
    const fillId = `spk-fill-${pos.id}`;
    const areaD = `${d} L${xs(P.length - 1).toFixed(1)},${H} L${xs(0).toFixed(1)},${H} Z`;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${fillId})`}/>
        <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  };

  const headerBg = up
    ? "linear-gradient(135deg, rgba(5,150,105,0.06) 0%, transparent 60%)"
    : "linear-gradient(135deg, rgba(220,38,38,0.06) 0%, transparent 60%)";

  const pctColor = data ? (up ? C.green : C.red) : C.inkMuted;
  const heroGrad = up
    ? "linear-gradient(160deg, #0D2318 0%, #0F3322 60%, #0D1F15 100%)"
    : "linear-gradient(160deg, #1E0A0A 0%, #2D0F0F 60%, #1A0808 100%)";

  return (
    <div style={{ background: "#F8F9FA", minHeight: "100%", display: "flex", flexDirection: "column" }}>

      {/* ── Hero prix ── */}
      <div style={{ background: heroGrad, padding: "20px 22px 22px", position: "relative", overflow: "hidden" }}>
        {/* Motif décoratif */}
        <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "120px", height: "120px", borderRadius: "50%", background: up ? "rgba(39,174,96,0.08)" : "rgba(231,76,60,0.08)", pointerEvents: "none" }} />

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "rgba(255,255,255,0.5)", padding: "20px 0" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ animation: "spin 0.9s linear infinite" }} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
              <circle cx="9" cy="9" r="7" strokeOpacity="0.3"/><path d="M9 2 A7 7 0 0 1 16 9"/>
            </svg>
            <span style={{ fontSize: "13px", display:"inline-flex", alignItems:"center" }}><BNextLabel /></span>
          </div>
        )}
        {err && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "4px" }}>
            <div style={{ fontSize: "11px", color: "rgba(255,100,100,0.9)" }}>{err}</div>
            <button onClick={load_} style={{ alignSelf: "flex-start", fontSize: "11px", fontWeight: "700", color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Réessayer</button>
          </div>
        )}

        {data && (
          <>
            {/* Prix principal */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "36px", fontWeight: "900", color: "#fff", letterSpacing: "-1.5px", fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>
                  {fmtCours(data.last.close)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                  <span style={{ background: up ? "rgba(39,174,96,0.25)" : "rgba(231,76,60,0.25)", color: up ? "#6EE7B7" : "#FCA5A5", fontWeight: "800", fontSize: "13px", borderRadius: "20px", padding: "4px 12px" }}>
                    {up ? "▲" : "▼"} {up ? "+" : ""}{data.changePct.toFixed(2)}%
                  </span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", fontWeight: "500" }}>
                    {up ? "+" : ""}{fmtCours(data.change)} · Vol {fmtVol(data.totalVol)}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "4px" }}>Clôture préc.</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "rgba(255,255,255,0.75)" }}>{fmtCours(data.prevClose)}</div>
              </div>
            </div>

            {/* Chips Haut / Bas */}
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(255,255,255,0.07)", borderRadius: "8px", padding: "5px 10px" }}>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>Haut</span>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#6EE7B7" }}>{fmtCours(data.dayHigh)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(255,255,255,0.07)", borderRadius: "8px", padding: "5px 10px" }}>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>Bas</span>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#FCA5A5" }}>{fmtCours(data.dayLow)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(255,255,255,0.07)", borderRadius: "8px", padding: "5px 10px" }}>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>Vol</span>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "rgba(255,255,255,0.75)" }}>{fmtVol(data.totalVol)}</span>
              </div>
            </div>
          </>
        )}
        {!data && !loading && !err && (
          <div style={{ height: "80px" }} />
        )}
      </div>

      {/* ── Sparkline ── */}
      {data && (
        <div style={{ background: "#fff", padding: "0", borderBottom: `1px solid ${C.border}` }}>
          <Sparkline pts={data.pts} W={880} H={100}/>
        </div>
      )}

      {/* ── Volume Profile ── */}
      {data && (
        <div style={{ padding: "18px 20px", flex: 1 }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <div style={{ width: "3px", height: "14px", borderRadius: "2px", background: "linear-gradient(180deg,#F97316,#EA580C)" }} />
            <span style={{ fontSize: "10px", fontWeight: "800", color: C.ink, letterSpacing: "1.2px", textTransform: "uppercase" }}>Volume Profile · Journée</span>
          </div>

          {/* Grille 2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>

            {/* POC */}
            <div style={{ borderRadius: "16px", border: "1.5px solid rgba(249,115,22,0.35)", background: "linear-gradient(135deg,rgba(249,115,22,0.08),rgba(249,115,22,0.03))", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F97316", boxShadow: "0 0 6px rgba(249,115,22,0.5)" }} />
                <span style={{ fontSize: "10px", fontWeight: "700", color: "#C2410C", letterSpacing: "0.3px" }}>Point de contrôle</span>
              </div>
              <div style={{ fontSize: "20px", fontWeight: "900", color: "#EA580C", fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.5px" }}>{fmtCours(data.poc.mid)}</div>
              <div style={{ marginTop: "10px", height: "3px", borderRadius: "99px", background: "rgba(249,115,22,0.15)" }}>
                <div style={{ width: "65%", height: "100%", borderRadius: "99px", background: "linear-gradient(90deg,#F97316,#FDBA74)" }} />
              </div>
            </div>

            {/* VAH */}
            <div style={{ borderRadius: "16px", border: "1.5px solid rgba(34,211,238,0.3)", background: "linear-gradient(135deg,rgba(34,211,238,0.07),rgba(34,211,238,0.02))", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22D3EE", boxShadow: "0 0 6px rgba(34,211,238,0.4)" }} />
                <span style={{ fontSize: "10px", fontWeight: "700", color: "#0E7490", letterSpacing: "0.3px" }}>Zone haute</span>
              </div>
              <div style={{ fontSize: "20px", fontWeight: "900", color: "#0891B2", fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.5px" }}>{fmtCours(data.VAH)}</div>
              <div style={{ marginTop: "10px", height: "3px", borderRadius: "99px", background: "rgba(34,211,238,0.12)" }}>
                <div style={{ width: "45%", height: "100%", borderRadius: "99px", background: "linear-gradient(90deg,#22D3EE,#67E8F9)" }} />
              </div>
            </div>

            {/* VAL */}
            <div style={{ borderRadius: "16px", border: "1.5px solid rgba(34,211,238,0.3)", background: "linear-gradient(135deg,rgba(34,211,238,0.07),rgba(34,211,238,0.02))", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22D3EE", boxShadow: "0 0 6px rgba(34,211,238,0.4)" }} />
                <span style={{ fontSize: "10px", fontWeight: "700", color: "#0E7490", letterSpacing: "0.3px" }}>Zone basse</span>
              </div>
              <div style={{ fontSize: "20px", fontWeight: "900", color: "#0891B2", fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.5px" }}>{fmtCours(data.VAL)}</div>
              <div style={{ marginTop: "10px", height: "3px", borderRadius: "99px", background: "rgba(34,211,238,0.12)" }}>
                <div style={{ width: "45%", height: "100%", borderRadius: "99px", background: "linear-gradient(90deg,#22D3EE,#67E8F9)" }} />
              </div>
            </div>

            {/* HVN ou placeholder */}
            {data.hvn ? (
              <div style={{ borderRadius: "16px", border: "1.5px solid rgba(74,222,128,0.3)", background: "linear-gradient(135deg,rgba(74,222,128,0.07),rgba(74,222,128,0.02))", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4ADE80", boxShadow: "0 0 6px rgba(74,222,128,0.4)" }} />
                  <span style={{ fontSize: "10px", fontWeight: "700", color: "#15803D", letterSpacing: "0.3px" }}>Forte liquidité</span>
                </div>
                <div style={{ fontSize: "17px", fontWeight: "900", color: "#16A34A", fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.5px", lineHeight: 1.2 }}>
                  {fmtCours(data.hvn.lo)}<span style={{ fontSize: "13px", opacity: 0.5, margin: "0 2px" }}>–</span>{fmtCours(data.hvn.hi)}
                </div>
                <div style={{ marginTop: "10px", height: "3px", borderRadius: "99px", background: "rgba(74,222,128,0.15)" }}>
                  <div style={{ width: "70%", height: "100%", borderRadius: "99px", background: "linear-gradient(90deg,#4ADE80,#86EFAC)" }} />
                </div>
              </div>
            ) : data.lvn ? (
              <div style={{ borderRadius: "16px", border: "1.5px solid rgba(248,113,113,0.3)", background: "linear-gradient(135deg,rgba(248,113,113,0.07),rgba(248,113,113,0.02))", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F87171", boxShadow: "0 0 6px rgba(248,113,113,0.4)" }} />
                  <span style={{ fontSize: "10px", fontWeight: "700", color: "#B91C1C", letterSpacing: "0.3px" }}>Faible liquidité</span>
                </div>
                <div style={{ fontSize: "17px", fontWeight: "900", color: "#DC2626", fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.5px", lineHeight: 1.2 }}>
                  {fmtCours(data.lvn.lo)}<span style={{ fontSize: "13px", opacity: 0.5, margin: "0 2px" }}>–</span>{fmtCours(data.lvn.hi)}
                </div>
                <div style={{ marginTop: "10px", height: "3px", borderRadius: "99px", background: "rgba(248,113,113,0.15)" }}>
                  <div style={{ width: "40%", height: "100%", borderRadius: "99px", background: "linear-gradient(90deg,#F87171,#FCA5A5)" }} />
                </div>
              </div>
            ) : null}
          </div>

          {/* Légende compacte */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", padding: "10px 14px", background: C.cardGrad, borderRadius: "12px", border: `1px solid ${C.border}` }}>
            {[
              { color: "#F97316", label: "Point de contrôle" },
              { color: "#22D3EE", label: "Zone de valeur" },
              { color: "#4ADE80", label: "Forte liquidité" },
              { color: "#F87171", label: "Faible liquidité" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: "20px", height: "3px", borderRadius: "99px", background: color }}/>
                <span style={{ fontSize: "9px", color: C.inkMuted, fontWeight: "600" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Simulateur de vente ──────────────────────────────────────────────────────
export function SellSimulator({ pos, account = "PEA", onClose }) {
  const ouvertureKey = account === "PEA" ? "bourse_pea_ouverture" : "bourse_cto_ouverture";
  const dateOuverture = load(ouvertureKey, null);
  const anneesDetention = dateOuverture
    ? (Date.now() - new Date(dateOuverture).getTime()) / (1000 * 60 * 60 * 24 * 365)
    : null;

  const [qty, setQty]               = useState(pos.quantite);
  const [prixManuel, setPrixManuel] = useState(null); // null = auto-projeté
  const [regimeIR, setRegimeIR]     = useState(false);
  const [tmiBracket, setTmiBracket] = useState(30);
  const [horizonAns, setHorizonAns] = useState(0);
  const [tauxAnnuel, setTauxAnnuel] = useState(7); // %/an

  const coursActuel = pos.dernierCours || pos.pru || 0;

  // Prix projeté calculé directement (pas d'effet)
  const prixProj = horizonAns === 0
    ? coursActuel
    : parseFloat((coursActuel * Math.pow(1 + tauxAnnuel / 100, horizonAns)).toFixed(3));
  const prix    = prixManuel !== null ? prixManuel : prixProj;
  const setPrix = (v) => setPrixManuel(v);

  // Réinitialiser le prix manuel quand l'horizon ou le scénario change
  const changeHorizon = (h) => { setHorizonAns(h); setPrixManuel(null); };
  const changeTaux    = (t) => { setTauxAnnuel(t); setPrixManuel(null); };

  // Ancienneté PEA à la date de retrait projetée
  const anneesDetentionFuture = anneesDetention !== null ? anneesDetention + horizonAns : null;
  const peaExonere = account === "PEA" && anneesDetentionFuture !== null && anneesDetentionFuture >= 5;

  const pru       = pos.pru || 0;
  const qtyNum    = Math.max(0, Math.min(pos.quantite, Number(qty) || 0));
  const prixNum   = Number(prix) || 0;
  const montantBrut = qtyNum * prixNum;
  const coutRevient = qtyNum * pru;
  const pvBrute   = montantBrut - coutRevient;
  const isPV      = pvBrute >= 0;

  // Calcul fiscal
  let impot = 0, detailFiscal = "";
  if (pvBrute > 0) {
    if (account === "PEA") {
      if (peaExonere) {
        impot = pvBrute * 0.172;
        detailFiscal = "PEA > 5 ans : 17,2% PS uniquement (exonération IR)";
      } else {
        impot = pvBrute * 0.30;
        detailFiscal = `PEA < 5 ans : 30% flat tax (IR + PS)`;
      }
    } else {
      if (regimeIR) {
        const taux = tmiBracket / 100 + 0.172;
        impot = pvBrute * taux;
        detailFiscal = `Barème IR ${tmiBracket}% + 17,2% PS = ${(taux * 100).toFixed(1)}%`;
      } else {
        impot = pvBrute * 0.30;
        detailFiscal = "Flat tax 30% (PFU : 12,8% IR + 17,2% PS)";
      }
    }
  }
  const gainNet   = pvBrute - impot;
  const pvRestant = (pos.quantite - qtyNum) > 0 ? (pos.dernierCours || pos.pru) * (pos.quantite - qtyNum) - pru * (pos.quantite - qtyNum) : 0;

  const row = (label, val, color, bold) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: "12px", color: C.inkMuted }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: bold ? "800" : "600", color: color || C.ink }}>{val}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", padding: "16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.snow, borderRadius: "24px", width: "100%", maxWidth: "520px", padding: "24px 24px 32px", boxShadow: "0 8px 64px rgba(0,0,0,0.22)", animation: "fadeIn 0.2s ease", maxHeight: "90vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "800", color: C.ink, letterSpacing: "-0.02em" }}>Simulateur de vente</div>
            <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>{pos.nom} · {pos.quantite} titres en portefeuille</div>
          </div>
          <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.snowDim, border: "none", cursor: "pointer", fontSize: "14px", color: C.inkMuted }}>✕</button>
        </div>

        {/* Horizon de retrait */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "8px" }}>Horizon de retrait</label>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {[0,1,2,3,5,7,10].map(h => (
              <button key={h} onClick={() => changeHorizon(h)}
                style={{ padding: "5px 11px", borderRadius: "20px", border: `1px solid ${horizonAns === h ? C.accent : C.border}`, background: horizonAns === h ? C.accent : C.snowOff, color: horizonAns === h ? "#fff" : C.inkMuted, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                {h === 0 ? "Maintenant" : `${h} an${h > 1 ? "s" : ""}`}
              </button>
            ))}
          </div>
          {horizonAns > 0 && (
            <div style={{ marginTop: "10px" }}>
              <label style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "6px" }}>Scénario de croissance annuelle</label>
              <div style={{ display: "flex", gap: "5px" }}>
                {[[-8,"Pessimiste","#EF4444"],[0,"Neutre",C.inkMuted],[7,"Base","#2563EB"],[15,"Optimiste",C.green]].map(([t, label, col]) => (
                  <button key={t} onClick={() => changeTaux(t)}
                    style={{ flex: 1, padding: "6px 4px", borderRadius: "10px", border: `1px solid ${tauxAnnuel === t ? col : C.border}`, background: tauxAnnuel === t ? `${col}18` : C.snowOff, color: tauxAnnuel === t ? col : C.inkMuted, fontSize: "10px", fontWeight: "700", cursor: "pointer", textAlign: "center" }}>
                    <div>{label}</div>
                    <div style={{ fontSize: "9px", opacity: 0.8 }}>{t >= 0 ? "+" : ""}{t}%/an</div>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: "8px", background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", borderRadius: "10px", padding: "8px 12px", fontSize: "11px", color: C.inkMuted, display: "flex", justifyContent: "space-between" }}>
                <span>Prix projeté dans {horizonAns} an{horizonAns > 1 ? "s" : ""}</span>
                <strong style={{ color: C.navy }}>{fmtCours(coursActuel * Math.pow(1 + tauxAnnuel / 100, horizonAns))} €</strong>
              </div>
              {account === "PEA" && anneesDetentionFuture !== null && (
                <div style={{ marginTop: "6px", fontSize: "10px", color: peaExonere ? C.green : C.red, padding: "6px 12px", background: peaExonere ? "rgba(5,150,105,0.06)" : "rgba(220,38,38,0.06)", borderRadius: "8px", border: `1px solid ${peaExonere ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)"}` }}>
                  {peaExonere
                    ? `✓ À cette date votre PEA aura ${anneesDetentionFuture.toFixed(1)} ans → exonération IR (17,2% PS uniquement)`
                    : `⚠ À cette date votre PEA aura ${anneesDetentionFuture.toFixed(1)} ans → flat tax 30% encore applicable`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
          <div>
            <label style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "6px" }}>Titres à vendre</label>
            <input type="number" min="1" max={pos.quantite} value={qty}
              onChange={e => setQty(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "12px", border: `1px solid ${C.border}`, fontSize: "15px", fontWeight: "700", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }} />
            <input type="range" min="1" max={pos.quantite} value={qtyNum}
              onChange={e => setQty(e.target.value)}
              style={{ width: "100%", marginTop: "8px", accentColor: C.accent }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: C.inkSubtle }}>
              <span>1</span><span style={{ cursor: "pointer", color: C.accent, fontWeight: "700" }} onClick={() => setQty(pos.quantite)}>Tout vendre ({pos.quantite})</span>
            </div>
          </div>
          <div>
            <label style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "6px" }}>Prix de vente (€)</label>
            <input type="number" step="0.001" value={prix}
              onChange={e => setPrix(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "12px", border: `1px solid ${C.border}`, fontSize: "15px", fontWeight: "700", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }} />
            {pos.dernierCours && <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "6px" }}>Cours actuel : <strong style={{ color: C.accent, cursor: "pointer" }} onClick={() => setPrix(pos.dernierCours)}>{fmtCours(pos.dernierCours)}</strong></div>}
          </div>
        </div>

        {/* Résultats */}
        <div style={{ background: C.cardGrad, borderRadius: "16px", padding: "16px 18px", marginBottom: "16px" }}>
          {horizonAns > 0 && (
            <div style={{ fontSize: "10px", color: C.inkSubtle, background: C.snowOff, borderRadius: "8px", padding: "6px 10px", marginBottom: "10px", lineHeight: "1.5" }}>
              ⚠ Prix projeté = <strong>{fmtCours(coursActuel)} €</strong> × (1 + {tauxAnnuel}%)^{horizonAns} ans = <strong style={{ color: C.navy }}>{fmtCours(prixProj)} €</strong> — estimation, pas une garantie.
            </div>
          )}
          {row("Montant de vente estimé", fmtEur(montantBrut))}
          {row("Capital investi — PRU × qté", `− ${fmtEur(coutRevient)}`, C.inkMuted)}
          <div style={{ fontSize: "9px", color: C.inkSubtle, marginBottom: "4px", paddingLeft: "2px" }}>
            Le PRU ({fmtCours(pos.pru)} €) est celui que vous avez saisi dans le portefeuille — vérifiez qu'il reflète bien votre coût moyen réel.
          </div>
          {row("Plus-value brute", `${isPV ? "+" : ""}${fmtEur(pvBrute)}`, isPV ? C.green : C.red)}
          {pvBrute > 0 && row("Impôt estimé", `− ${fmtEur(impot)}`, C.red)}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", marginTop: "4px" }}>
            <span style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>Gain net après impôt</span>
            <span style={{ fontSize: "18px", fontWeight: "900", color: gainNet >= 0 ? C.green : C.red }}>{gainNet >= 0 ? "+" : ""}{fmtEur(gainNet)}</span>
          </div>
        </div>

        {/* Fiscalité détail */}
        <div style={{ background: isPV ? "rgba(245,158,11,0.07)" : C.snowOff, border: `1px solid ${isPV ? "rgba(245,158,11,0.2)" : C.border}`, borderRadius: "12px", padding: "12px 16px", marginBottom: "14px", fontSize: "11px", color: C.inkMuted, lineHeight: "1.6" }}>
          <div style={{ fontWeight: "700", color: C.goldDark, marginBottom: "4px" }}>⚖ Régime fiscal applicable</div>
          {detailFiscal || (account === "PEA" ? "PEA : exonération IR après 5 ans, 17,2% PS uniquement" : "CTO : flat tax 30% par défaut")}
          {account === "CTO" && pvBrute > 0 && (
            <div style={{ marginTop: "10px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input type="checkbox" checked={regimeIR} onChange={e => setRegimeIR(e.target.checked)} style={{ accentColor: C.accent }} />
                <span>Opter pour le barème progressif de l'IR</span>
              </label>
              {regimeIR && (
                <div style={{ marginTop: "8px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {[11, 30, 41, 45].map(t => (
                    <button key={t} onClick={() => setTmiBracket(t)}
                      style={{ padding: "4px 10px", borderRadius: "20px", border: `1px solid ${tmiBracket === t ? C.accent : C.border}`, background: tmiBracket === t ? C.accent : C.snowOff, color: tmiBracket === t ? "#fff" : C.inkMuted, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                      TMI {t}%
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!peaExonere && account === "PEA" && anneesDetentionFuture !== null && (
            <div style={{ marginTop: "6px", color: C.red }}>
              ⚠ PEA {horizonAns > 0 ? `dans ${horizonAns} an${horizonAns>1?"s":""}` : "actuellement"} à {anneesDetentionFuture.toFixed(1)} ans — flat tax 30%
              {horizonAns === 0 && anneesDetention !== null && anneesDetention < 5 && (
                <span style={{ color: C.inkMuted }}> · Exonération dans {(5 - anneesDetention).toFixed(1)} ans</span>
              )}
            </div>
          )}
          {account === "PEA" && !dateOuverture && <div style={{ marginTop: "6px" }}>→ Renseignez la date d'ouverture dans <strong>Profil</strong> pour un calcul précis.</div>}
        </div>

        {/* Position restante */}
        {qtyNum < pos.quantite && (
          <div style={{ background: C.cardGradGreen, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "10px 16px", fontSize: "11px", color: C.inkMuted, marginBottom: "4px" }}>
            Après cette vente : <strong style={{ color: C.ink }}>{pos.quantite - qtyNum} titres</strong> restants · P/V latente résiduelle : <strong style={{ color: pvRestant >= 0 ? C.green : C.red }}>{pvRestant >= 0 ? "+" : ""}{fmtEur(pvRestant)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Projection par valeur (historique + extrapolation tendancielle) ───────────
// (kept for use in Signaux & Actualités tab)
export function StockProjectionChart({ pos, onClose }) {
  const [hidx, setHidx]         = useState(1); // 12 mois par défaut
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [hoverFrac, setHoverFrac] = useState(null);
  const [showMA50, setShowMA50] = useState(true);
  const [showMA200, setShowMA200] = useState(true);
  const svgRef = useRef(null);

  // Dimensions SVG
  const VW = 800, VH = 240, ML = 62, MR = 24, MT = 15, MB = 35;
  const CW = VW - ML - MR, CH = VH - MT - MB;

  useEffect(() => {
    const h = PROJ_HORIZONS[hidx];
    let cancelled = false;
    setLoading(true); setChartData(null); setError(null);

    const run = async () => {
      // Résolution du ticker
      const cache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
      if (pos.isin && pos.ticker) cache[pos.isin] = pos.ticker;
      const ticker = (pos.isin && cache[pos.isin]) || pos.ticker;
      if (!ticker) {
        if (!cancelled) { setError("Ticker Yahoo Finance non configuré · Cliquez sur ✏ dans le tableau pour le définir"); setLoading(false); }
        return;
      }

      try {
        // Historique affiché selon la période choisie
        const urlDisplay = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${h.interval}&range=${h.range}`;

        const resDisplay = await fetchWithProxy(urlDisplay, { signal: AbortSignal.timeout(15000) });
        if (!resDisplay.ok) throw new Error(`HTTP ${resDisplay.status}`);
        const jsonDisplay = await resDisplay.json();

        const r = jsonDisplay?.chart?.result?.[0];
        if (!r) throw new Error("Données indisponibles");
        const ts = r.timestamp || [];
        const cl = r.indicators?.quote?.[0]?.close || [];
        const vol = r.indicators?.quote?.[0]?.volume || [];
        const rawPts = ts
          .map((t, j) => ({ date: t * 1000, price: cl[j], volume: vol[j] || 0 }))
          .filter(p => p.price != null && p.price > 0);
        if (rawPts.length < 10) throw new Error("Données insuffisantes (< 10 points)");

        // Régression sur 5 ans FMP (stable) — fallback sur données affichées si indispo
        let regBase = rawPts;
        try {
          const toDate = new Date().toISOString().slice(0, 10);
          const fromDate = new Date(Date.now() - 5 * 365 * 86400000).toISOString().slice(0, 10);
          const daily = await fetchFMPHistoricalByTicker(ticker, fromDate, toDate);
          if (daily.length >= 10) regBase = daily.map(d => ({ date: new Date(d.date + "T00:00:00").getTime(), price: d.close }));
        } catch {}

        // Régression linéaire sur log(prix) → modèle de croissance exponentielle
        const xs = regBase.map((_, i) => i);
        const ys = regBase.map(p => Math.log(p.price));
        const { a, b, sigma } = linReg(xs, ys);

        // Pas moyen basé sur les données d'affichage pour que la projection démarre au bon endroit
        const stepMs = (rawPts[rawPts.length - 1].date - rawPts[0].date) / (rawPts.length - 1);
        const stepsForward = Math.round((h.months * 30.44 * 24 * 3600 * 1000) / stepMs);
        const lastIdx = rawPts.length - 1;
        const lastDate = rawPts[lastIdx].date;

        // Recaler la régression au dernier prix réel (évite le décalage de niveau)
        const lastLogPrice = Math.log(rawPts[lastIdx].price);
        const regLastIdx   = regBase.length - 1;
        const regOffset    = lastLogPrice - (a + b * regLastIdx);

        // Calcul des points projetés avec bande d'incertitude ±1σ√t
        // La pente vient des 5 ans, recalée au dernier prix réel (regOffset)
        // sigma plafonné à 0.15 pour éviter que la bande explose sur les valeurs très volatiles
        const sigmaC = Math.min(sigma, 0.15);
        const projDates = [], projMid = [], projHi = [], projLo = [];
        for (let s = 1; s <= stepsForward; s++) {
          const xi = regLastIdx + s;
          const logMid = a + b * xi + regOffset;
          projDates.push(lastDate + s * stepMs);
          projMid.push(Math.exp(logMid));
          projHi.push(Math.exp(logMid + sigmaC * Math.sqrt(s)));
          projLo.push(Math.exp(logMid - sigmaC * Math.sqrt(s)));
        }

        if (!cancelled) {
          const priceArr = rawPts.map(p => p.price);
          const volumeArr = rawPts.map(p => p.volume);
          setChartData({
            dates: rawPts.map(p => p.date),
            prices: priceArr,
            volumes: volumeArr,
            ma50:  computeMA(priceArr, 50),
            ma200: computeMA(priceArr, 200),
            rsi:   computeRSI(priceArr, 14),
            projDates, projMid, projHi, projLo,
          });
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [hidx, pos]);

  // ── Calcul des échelles ──────────────────────────────────────────────────
  const allDates  = chartData ? [...chartData.dates, ...chartData.projDates] : [];
  // Pour l'échelle Y : on exclut projHi/projLo (qui peuvent être larges) et on se base
  // sur les prix réels + la courbe médiane de projection uniquement
  const allPrices = chartData ? [...chartData.prices, ...chartData.projMid] : [];
  const xMin = allDates[0] || 0;
  const xMax = allDates[allDates.length - 1] || 1;
  const yMin_raw = allPrices.length ? Math.min(...allPrices) : 0;
  const yMax_raw = allPrices.length ? Math.max(...allPrices) : 1;
  const yPad = (yMax_raw - yMin_raw) * 0.12;
  const yMin = Math.max(0, yMin_raw - yPad);
  const yMax = yMax_raw + yPad;

  const xScale = t => ML + (t - xMin) / (Math.max(xMax - xMin, 1)) * CW;
  const yScale = p => MT + (1 - (p - yMin) / (Math.max(yMax - yMin, 0.01))) * CH;

  // Graduations Y (prix)
  const priceRange = yMax_raw - yMin_raw;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(priceRange / 5, 0.01))));
  const niceStep = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(s => s >= priceRange / 5) || magnitude * 10;
  const gridPrices = [];
  for (let v = Math.ceil(yMin / niceStep) * niceStep; v <= yMax + 0.001; v += niceStep) {
    gridPrices.push(Math.round(v * 1000) / 1000);
  }

  // Étiquettes X (6 points sur la timeline complète)
  const xLabels = allDates.length > 1 ? Array.from({ length: 6 }, (_, i) => {
    const idx = Math.round(i * (allDates.length - 1) / 5);
    return { t: allDates[idx] };
  }) : [];

  // Hover
  const handleMouseMove = (e) => {
    if (!svgRef.current || !chartData) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width * VW - ML) / CW));
    setHoverFrac(frac);
  };
  const hoverT = hoverFrac != null ? xMin + hoverFrac * (xMax - xMin) : null;
  const isInProj = hoverT != null && chartData && hoverT > chartData.dates[chartData.dates.length - 1];
  const hoverHistIdx = hoverT != null && chartData
    ? chartData.dates.reduce((bi, t, i) => Math.abs(t - hoverT) < Math.abs(chartData.dates[bi] - hoverT) ? i : bi, 0)
    : null;
  const hoverProjIdx = hoverT != null && chartData && chartData.projDates.length
    ? chartData.projDates.reduce((bi, t, i) => Math.abs(t - hoverT) < Math.abs(chartData.projDates[bi] - hoverT) ? i : bi, 0)
    : null;

  // Performance finale projetée
  const finalProj = chartData?.projMid?.[chartData.projMid.length - 1];
  const lastPrice = chartData?.prices?.[chartData.prices.length - 1];
  const finalPct  = finalProj && lastPrice ? ((finalProj - lastPrice) / lastPrice) * 100 : null;

  return (
    <div style={{ background: C.snow, borderRadius: "16px", overflow: "hidden", marginTop: "16px", boxShadow: "0 8px 32px rgba(30,58,95,0.12)", border: `1px solid ${C.border}` }}>
      {/* En-tête gradient */}
      <div style={{ background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "14px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em" }}>{pos.nom}</span>
          {finalPct != null && (
            <span style={{ fontSize: "11px", fontWeight: "700", padding: "3px 10px", borderRadius: "20px",
              color: finalPct >= 0 ? "#4ADE80" : "#F87171",
              background: finalPct >= 0 ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
              border: `1px solid ${finalPct >= 0 ? "rgba(74,222,128,0.30)" : "rgba(248,113,113,0.30)"}`,
            }}>
              {PROJ_HORIZONS[hidx].label} : {finalPct >= 0 ? "+" : ""}{finalPct.toFixed(1)}%
              {finalProj && <span style={{ fontWeight: "500", marginLeft: "4px", opacity: 0.8 }}>{fmtCours(finalProj)} €</span>}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
          {PROJ_HORIZONS.map((h, i) => (
            <button key={h.label} onClick={() => setHidx(i)} style={{
              padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
              fontSize: "11px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif",
              background: i === hidx ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)",
              color: i === hidx ? "#fff" : "rgba(255,255,255,0.45)",
              boxShadow: i === hidx ? "0 2px 8px rgba(0,0,0,0.25)" : "none",
              transition: "all 0.15s",
            }}>{h.label}</button>
          ))}
          <button onClick={() => setShowMA50(v => !v)} style={{ padding: "4px 9px", borderRadius: "6px", border: `1px solid ${showMA50 ? "rgba(245,158,11,0.55)" : "rgba(255,255,255,0.12)"}`, cursor: "pointer", fontSize: "10px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif", background: showMA50 ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.05)", color: showMA50 ? "#F59E0B" : "rgba(255,255,255,0.4)", transition: "all 0.15s" }}>MA50</button>
          <button onClick={() => setShowMA200(v => !v)} style={{ padding: "4px 9px", borderRadius: "6px", border: `1px solid ${showMA200 ? "rgba(139,92,246,0.55)" : "rgba(255,255,255,0.12)"}`, cursor: "pointer", fontSize: "10px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif", background: showMA200 ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.05)", color: showMA200 ? "#A78BFA" : "rgba(255,255,255,0.4)", transition: "all 0.15s" }}>MA200</button>
          {onClose && (
            <button onClick={onClose} style={{ marginLeft: "2px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif" }}>✕</button>
          )}
        </div>
      </div>

      {/* Corps */}
      <div style={{ padding: "16px 20px 20px" }}>
      {loading && <LoadingPanel label="Chargement des données historiques…" />}
      {error && (
        <div style={{ fontSize: "12px", color: C.inkMuted, padding: "20px 0", textAlign: "center", lineHeight: "1.6" }}>{error}</div>
      )}

      {!loading && !error && chartData && (
        <>
          <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
            style={{ width: "100%", height: "auto", cursor: "crosshair", display: "block", userSelect: "none" }}
            onMouseMove={handleMouseMove} onMouseLeave={() => setHoverFrac(null)}>

            <defs>
              <linearGradient id="priceAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1E3A5F" stopOpacity="0.22"/>
                <stop offset="85%" stopColor="#1E3A5F" stopOpacity="0.02"/>
                <stop offset="100%" stopColor="#1E3A5F" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="projAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2D5986" stopOpacity="0.12"/>
                <stop offset="100%" stopColor="#2D5986" stopOpacity="0"/>
              </linearGradient>
            </defs>

            {/* Fond zone graphique */}
            <rect x={ML} y={MT} width={CW} height={CH} fill={C.snowOff} rx="4" opacity="0.5" />

            {/* Grille horizontale */}
            {gridPrices.map(v => (
              <g key={v}>
                <line x1={ML} x2={ML + CW} y1={yScale(v)} y2={yScale(v)} stroke="rgba(148,163,184,0.3)" strokeWidth="1" strokeDasharray="4,4" />
                <text x={ML - 6} y={yScale(v) + 4} textAnchor="end" fontSize="10" fill="#94A3B8" fontFamily="'DM Sans', sans-serif" fontWeight="500">
                  {v >= 1000 ? (v / 1000).toFixed(1) + "k" : v >= 100 ? v.toFixed(0) : v.toFixed(1)}€
                </text>
              </g>
            ))}

            {/* Étiquettes X (dates) */}
            {xLabels.map(({ t }, i) => (
              <text key={i} x={xScale(t)} y={MT + CH + 22} textAnchor="middle" fontSize="9" fill="#94A3B8" fontFamily="'DM Sans', sans-serif">
                {new Date(t).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })}
              </text>
            ))}

            {/* Séparateur "aujourd'hui" */}
            {(() => {
              const todayX = xScale(chartData.dates[chartData.dates.length - 1]);
              return <>
                <line x1={todayX} x2={todayX} y1={MT} y2={MT + CH} stroke="rgba(148,163,184,0.5)" strokeWidth="1" strokeDasharray="4,3" />
                <text x={todayX} y={MT - 4} textAnchor="middle" fontSize="8" fill="#94A3B8" fontFamily="'DM Sans', sans-serif" fontWeight="600">Auj.</text>
              </>;
            })()}

            {/* Area fill historique */}
            <polygon
              points={[
                `${xScale(chartData.dates[0]).toFixed(1)},${(MT+CH).toFixed(1)}`,
                ...chartData.dates.map((t, i) => `${xScale(t).toFixed(1)},${yScale(chartData.prices[i]).toFixed(1)}`),
                `${xScale(chartData.dates[chartData.dates.length-1]).toFixed(1)},${(MT+CH).toFixed(1)}`,
              ].join(" ")}
              fill="url(#priceAreaGrad)" />

            {/* Bande d'incertitude projection */}
            {chartData.projDates.length > 0 && (() => {
              const bandPts = [
                ...chartData.projDates.map((t, i) => `${xScale(t).toFixed(1)},${yScale(chartData.projHi[i]).toFixed(1)}`),
                ...[...chartData.projDates].reverse().map((t, i) => {
                  const ri = chartData.projDates.length - 1 - i;
                  return `${xScale(t).toFixed(1)},${yScale(chartData.projLo[ri]).toFixed(1)}`;
                }),
              ];
              return <polygon points={bandPts.join(" ")} fill="url(#projAreaGrad)" />;
            })()}

            {/* Ligne PRU */}
            {pos.pru > 0 && pos.pru >= yMin && pos.pru <= yMax && (
              <>
                <line x1={ML} x2={ML + CW} y1={yScale(pos.pru)} y2={yScale(pos.pru)} stroke={C.goldDark} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.85" />
                <text x={ML + CW + 3} y={yScale(pos.pru) + 4} fontSize="9" fill={C.goldDark} fontFamily="'DM Sans', sans-serif" fontWeight="600">PRU</text>
              </>
            )}

            {/* Cours historique */}
            <polyline
              points={chartData.dates.map((t, i) => `${xScale(t).toFixed(1)},${yScale(chartData.prices[i]).toFixed(1)}`).join(" ")}
              fill="none" stroke="#1E3A5F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* MA50 */}
            {showMA50 && chartData.ma50 && (
              <polyline
                points={chartData.dates.map((t, i) => chartData.ma50[i] != null ? `${xScale(t).toFixed(1)},${yScale(chartData.ma50[i]).toFixed(1)}` : null).filter(Boolean).join(" ")}
                fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            )}

            {/* MA200 */}
            {showMA200 && chartData.ma200 && (
              <polyline
                points={chartData.dates.map((t, i) => chartData.ma200[i] != null ? `${xScale(t).toFixed(1)},${yScale(chartData.ma200[i]).toFixed(1)}` : null).filter(Boolean).join(" ")}
                fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            )}

            {/* Projection tendancielle */}
            {chartData.projDates.length > 0 && (
              <polyline
                points={[
                  `${xScale(chartData.dates[chartData.dates.length - 1]).toFixed(1)},${yScale(chartData.prices[chartData.prices.length - 1]).toFixed(1)}`,
                  ...chartData.projDates.map((t, i) => `${xScale(t).toFixed(1)},${yScale(chartData.projMid[i]).toFixed(1)}`),
                ].join(" ")}
                fill="none" stroke="#2D5986" strokeWidth="2" strokeDasharray="7,5" strokeLinecap="round" opacity="0.85" />
            )}

            {/* Crosshair */}
            {hoverFrac != null && hoverT != null && (
              <>
                <line x1={xScale(hoverT)} x2={xScale(hoverT)} y1={MT} y2={MT + CH} stroke="rgba(148,163,184,0.6)" strokeWidth="1" strokeDasharray="3,3" />
                {!isInProj && hoverHistIdx != null && (
                  <circle cx={xScale(chartData.dates[hoverHistIdx])} cy={yScale(chartData.prices[hoverHistIdx])} r="5" fill="#1E3A5F" stroke="#fff" strokeWidth="2.5" />
                )}
                {isInProj && hoverProjIdx != null && (
                  <circle cx={xScale(chartData.projDates[hoverProjIdx])} cy={yScale(chartData.projMid[hoverProjIdx])} r="5" fill="#2D5986" stroke="#fff" strokeWidth="2.5" />
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
                    {new Date(chartData.dates[hoverHistIdx]).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span style={{ color: "#fff", fontWeight: "800", fontSize: "13px" }}>{fmtCours(chartData.prices[hoverHistIdx])} €</span>
                  {pos.pru > 0 && (
                    <span style={{ fontWeight: "700", color: chartData.prices[hoverHistIdx] >= pos.pru ? "#4ADE80" : "#F87171", background: chartData.prices[hoverHistIdx] >= pos.pru ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)", padding: "2px 8px", borderRadius: "6px" }}>
                      {((chartData.prices[hoverHistIdx] - pos.pru) / pos.pru * 100).toFixed(2)}% vs PRU
                    </span>
                  )}
                </>
              )}
              {isInProj && hoverProjIdx != null && (
                <>
                  <span style={{ color: "#A78BFA", fontWeight: "700" }}>Projection</span>
                  <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: "600" }}>
                    {new Date(chartData.projDates[hoverProjIdx]).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span style={{ color: "#fff", fontWeight: "800", fontSize: "13px" }}>{fmtCours(chartData.projMid[hoverProjIdx])} €</span>
                  <span style={{ color: "rgba(255,255,255,0.40)", fontWeight: "500" }}>
                    [{fmtCours(chartData.projLo[hoverProjIdx])} – {fmtCours(chartData.projHi[hoverProjIdx])}]
                  </span>
                </>
              )}
            </div>
          )}

          {/* Légende */}
          <div style={{ display: "flex", gap: "14px", marginTop: "12px", flexWrap: "wrap", fontSize: "10px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.inkMuted }}><span style={{ width: "18px", height: "2.5px", background: "#1E3A5F", borderRadius: "2px", display: "inline-block" }}/>Cours</span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.inkSubtle }}><span style={{ width: "18px", height: "1px", borderTop: "2px dashed #2D5986", display: "inline-block" }}/>Tendance</span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.inkSubtle }}><span style={{ width: "12px", height: "10px", background: "rgba(30,58,95,0.15)", borderRadius: "2px", display: "inline-block" }}/>±1σ</span>
            {pos.pru > 0 && <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.goldDark }}><span style={{ width: "18px", height: "1px", borderTop: "1.5px dashed #B8920A", display: "inline-block" }}/>PRU {fmtCours(pos.pru)} €</span>}
            {showMA50  && <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "#D97706" }}><span style={{ width: "18px", height: "2px", background: "#F59E0B", borderRadius: "2px", display: "inline-block" }}/>MA50</span>}
            {showMA200 && <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "#7C3AED" }}><span style={{ width: "18px", height: "2px", background: "#8B5CF6", borderRadius: "2px", display: "inline-block" }}/>MA200</span>}
          </div>
          <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "4px", opacity: 0.7 }}>
            ⚠ Projection extrapolée. Non garantie. Ne constitue pas un conseil en investissement.
          </div>

          {/* ── Volume ── */}
          {chartData.volumes && (() => {
            const VVW=800, VVH=55, VML=62, VMR=24, VMT=4, VMB=16;
            const VCW=VVW-VML-VMR, VCH=VVH-VMT-VMB;
            const maxVol = Math.max(...chartData.volumes.filter(v=>v>0), 1);
            const n = chartData.dates.length;
            const barW = Math.max(1, VCW / n - 0.5);
            return (
              <div style={{ marginTop: "12px" }}>
                <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "4px" }}>Volume</div>
                <svg viewBox={`0 0 ${VVW} ${VVH}`} style={{ width: "100%", height: "auto", display: "block" }}>
                  {chartData.dates.map((t, i) => {
                    const x = xScale(t) - barW / 2;
                    const h = (chartData.volumes[i] / maxVol) * VCH;
                    const isUp = i === 0 || chartData.prices[i] >= chartData.prices[i - 1];
                    return <rect key={i} x={x} y={VMT + VCH - h} width={barW} height={h} fill={isUp ? C.green : C.red} opacity="0.5" rx="0.5" />;
                  })}
                  <line x1={VML} x2={VML+VCW} y1={VMT+VCH} y2={VMT+VCH} stroke="rgba(148,163,184,0.3)" strokeWidth="1" />
                </svg>
              </div>
            );
          })()}

          {/* ── RSI ── */}
          {chartData.rsi && (() => {
            const RVW=800, RVH=70, RML=62, RMR=24, RMT=8, RMB=18;
            const RCW=RVW-RML-RMR, RCH=RVH-RMT-RMB;
            const rsiScale = v => RMT + (1 - v / 100) * RCH;
            const rsiPts = chartData.rsi
              .map((v, i) => v != null ? `${xScale(chartData.dates[i]).toFixed(1)},${rsiScale(v).toFixed(1)}` : null)
              .filter(Boolean);
            const lastRsi = chartData.rsi.filter(v => v != null).slice(-1)[0];
            const rsiColor = lastRsi >= 70 ? C.red : lastRsi <= 30 ? C.green : C.navy;
            return (
              <div style={{ marginTop: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                  <span style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", display: "flex", alignItems: "center" }}>RSI (14)<InfoTip term="RSI" position="top" /></span>
                  {lastRsi != null && (
                    <span style={{ fontSize: "9px", fontWeight: "800", color: rsiColor, background: rsiColor + "18", padding: "1px 5px", borderRadius: "4px" }}>
                      {lastRsi.toFixed(1)} {lastRsi >= 70 ? "Suracheté" : lastRsi <= 30 ? "Survendu" : "Neutre"}
                    </span>
                  )}
                </div>
                <svg viewBox={`0 0 ${RVW} ${RVH}`} style={{ width: "100%", height: "auto", display: "block" }}>
                  {/* Bandes 70/50/30 */}
                  <rect x={RML} y={rsiScale(70)} width={RCW} height={rsiScale(30)-rsiScale(70)} fill={C.snowOff} opacity="0.6" />
                  {[70, 50, 30].map(v => (
                    <g key={v}>
                      <line x1={RML} x2={RML+RCW} y1={rsiScale(v)} y2={rsiScale(v)} stroke={v===50?"#94A3B8":C.border} strokeWidth={v===50?"1":"0.8"} strokeDasharray={v===50?"":"3,3"} />
                      <text x={RML-4} y={rsiScale(v)+3} textAnchor="end" fontSize="8" fill={C.inkSubtle} fontFamily="'DM Sans', sans-serif">{v}</text>
                    </g>
                  ))}
                  {/* Ligne RSI */}
                  <polyline points={rsiPts.join(" ")} fill="none" stroke={rsiColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            );
          })()}
        </>
      )}
      </div>
    </div>
  );
}

// ─── Price Evolution Chart ────────────────────────────────────────────────────
function nicePctStep(range) {
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  const target = range / 5;
  return steps.find(s => s >= target) || 200;
}
const CHART_PERIODS = [
  { label: "J",  range: "1d",  interval: "5m"  },
  { label: "1J", range: "5d",  interval: "30m" },
  { label: "5J", range: "5d",  interval: "1d"  },
  { label: "3M", range: "3mo", interval: "1d"  },
  { label: "6M", range: "6mo", interval: "1d"  },
  { label: "1A", range: "1y",  interval: "1d"  },
  { label: "3A", range: "3y",  interval: "1wk" },
  { label: "5A", range: "5y",  interval: "1wk" },
];
const CHART_COLORS = ["#2563EB","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#06B6D4","#16A34A","#CCFF00","#6366F1","#0891B2","#DC2626"];

export function PriceEvolutionChart({ positions }) {
  const [pidx, setPidx]         = useState(4); // 6M par défaut
  const [series, setSeries]     = useState([]);
  const [missing, setMissing]   = useState([]);
  const [cacData, setCacData]   = useState(null);
  const [showCac, setShowCac]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [hoverFrac, setHoverFrac] = useState(null);
  const svgRef = useRef(null);

  const VW=800, VH=240, ML=52, MR=16, MT=12, MB=32;
  const CW=VW-ML-MR, CH=VH-MT-MB;

  useEffect(() => {
    const p = CHART_PERIODS[pidx];
    let cancelled = false;
    setLoading(true);
    setSeries([]);
    setMissing([]);

    const run = async () => {
      const cache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY)||"{}"); } catch { return {}; } })();
      for (const pos of positions) { if (pos.isin && pos.ticker) cache[pos.isin] = pos.ticker; }

      // Résultats indexés pour conserver l'ordre des positions
      const results = new Array(positions.length).fill(null);
      const missingList = [];
      await Promise.all(positions.map(async (pos, i) => {
        const ticker = (pos.isin && cache[pos.isin]) || pos.ticker;
        if (!ticker) { missingList.push({ nom: pos.nom, reason: "Ticker non configuré" }); return; }
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${p.interval}&range=${p.range}`;
          const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) { missingList.push({ nom: pos.nom, reason: `Erreur ${res.status}` }); return; }
          const data = await res.json();
          const r = data?.chart?.result?.[0];
          if (!r) { missingList.push({ nom: pos.nom, reason: "Données indisponibles" }); return; }
          const ts = r.timestamp || [];
          const cl = r.indicators?.quote?.[0]?.close || [];
          const pts = ts.map((t, j) => ({ date: t * 1000, close: cl[j] })).filter(pt => pt.close != null);
          if (pts.length < 2) { missingList.push({ nom: pos.nom, reason: `Historique insuffisant (${pts.length} pt)` }); return; }
          const first = pts[0].close;
          results[i] = {
            nom: pos.nom,
            ticker,
            color: CHART_COLORS[i % CHART_COLORS.length],
            points: pts.map(pt => ({ date: pt.date, pct: ((pt.close - first) / first) * 100 })),
          };
        } catch (e) { missingList.push({ nom: pos.nom, reason: "Timeout ou réseau" }); }
      }));

      // Fetch CAC 40 (^FCHI) en parallèle
      try {
        const cacUrl = `https://query1.finance.yahoo.com/v8/finance/chart/%5EFCHI?interval=${p.interval}&range=${p.range}`;
        const cacRes = await fetchWithProxy(cacUrl, { signal: AbortSignal.timeout(15000) });
        if (cacRes.ok) {
          const cacJson = await cacRes.json();
          const cr = cacJson?.chart?.result?.[0];
          if (cr) {
            const ts = cr.timestamp || [];
            const cl = cr.indicators?.quote?.[0]?.close || [];
            const pts = ts.map((t, j) => ({ date: t * 1000, close: cl[j] })).filter(pt => pt.close != null);
            if (pts.length >= 2) {
              const first = pts[0].close;
              if (!cancelled) setCacData(pts.map(pt => ({ date: pt.date, pct: ((pt.close - first) / first) * 100 })));
            }
          }
        }
      } catch {}

      if (!cancelled) { setSeries(results.filter(Boolean)); setMissing(missingList); setLoading(false); }
    };
    run();
    return () => { cancelled = true; };
  }, [pidx, positions]);

  const cacSeries = showCac && cacData
    ? { nom: "CAC 40", ticker: "^FCHI", color: "#CCFF00", points: cacData, dashed: true }
    : null;
  const displayedSeries = cacSeries ? [...series, cacSeries] : series;

  const allPcts = displayedSeries.flatMap(s => s.points.map(p => p.pct));
  const rawMin = allPcts.length ? Math.min(...allPcts) : -5;
  const rawMax = allPcts.length ? Math.max(...allPcts) : 5;
  const pad = Math.max(1, (rawMax - rawMin) * 0.08);
  const yMin = Math.min(rawMin - pad, -pad);
  const yMax = Math.max(rawMax + pad, pad);
  const step = nicePctStep(yMax - yMin);
  const gridVals = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + 0.001; v = Math.round((v + step) * 100) / 100) gridVals.push(Math.round(v * 100) / 100);

  const xScale = frac => ML + frac * CW;
  const yScale = pct  => MT + (1 - (pct - yMin) / (yMax - yMin)) * CH;

  const refSeries = displayedSeries.reduce((best, s) => s.points.length > (best?.points.length || 0) ? s : best, null);
  const xLabels = refSeries ? (() => {
    const pts = refSeries.points;
    const count = Math.min(6, pts.length);
    return Array.from({ length: count }, (_, i) => {
      const idx = Math.round(i * (pts.length - 1) / (count - 1));
      return { frac: idx / (pts.length - 1), date: pts[idx].date };
    });
  })() : [];

  const hoverInfo = hoverFrac != null ? displayedSeries.map(s => {
    const idx = Math.round(hoverFrac * (s.points.length - 1));
    const pt  = s.points[Math.max(0, Math.min(s.points.length - 1, idx))];
    return { ...s, pt };
  }) : null;
  const hoverDate = hoverFrac != null && refSeries
    ? refSeries.points[Math.round(hoverFrac * (refSeries.points.length - 1))]?.date
    : null;

  const handleMouseMove = (e) => {
    if (!svgRef.current || !displayedSeries.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width * VW - ML) / CW));
    setHoverFrac(frac);
  };

  return (
    <div style={{ background: C.snow, borderRadius: "16px", overflow: "hidden", marginTop: "20px", boxShadow: "0 8px 32px rgba(30,58,95,0.12)", border: `1px solid ${C.border}` }}>
      {/* En-tête gradient */}
      <div style={{ background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em" }}>Évolution comparative</span>
          {series.length > 0 && <span style={{ fontSize: "10px", fontWeight: "600", color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.08)", borderRadius: "5px", padding: "2px 7px" }}>{series.length} valeur{series.length > 1 ? "s" : ""}</span>}
        </div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
          {CHART_PERIODS.map((p, i) => (
            <button key={p.range} onClick={() => setPidx(i)} style={{
              padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
              fontSize: "11px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif",
              background: i === pidx ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)",
              color: i === pidx ? "#fff" : "rgba(255,255,255,0.45)",
              boxShadow: i === pidx ? "0 2px 8px rgba(0,0,0,0.25)" : "none",
              transition: "all 0.15s",
            }}>{p.label}</button>
          ))}
          <button onClick={() => setShowCac(v => !v)} style={{
            padding: "4px 9px", borderRadius: "6px", border: `1px solid ${showCac ? "rgba(204,255,0,0.5)" : "rgba(255,255,255,0.12)"}`,
            cursor: "pointer", fontSize: "10px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif",
            background: showCac ? "rgba(204,255,0,0.12)" : "rgba(255,255,255,0.05)",
            color: showCac ? "#CCFF00" : "rgba(255,255,255,0.4)", transition: "all 0.15s",
          }}>CAC 40</button>
        </div>
      </div>

      <div style={{ padding: "16px 20px 20px" }}>
      {loading && <LoadingPanel label="Chargement des données historiques…" />}

      {!loading && displayedSeries.length === 0 && series.length === 0 && (
        <div style={{ fontSize: "12px", color: C.inkMuted, padding: "24px 0", textAlign: "center" }}>
          Aucune donnée disponible · Configurez les tickers dans l'onglet Portefeuille (✏ → Ticker Yahoo Finance)
        </div>
      )}

      {!loading && (series.length > 0 || cacSeries) && (
        <>
          <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
            style={{ width: "100%", height: "auto", cursor: "crosshair", display: "block", userSelect: "none" }}
            onMouseMove={handleMouseMove} onMouseLeave={() => setHoverFrac(null)}>

            <defs>
              {displayedSeries.map(s => (
                <linearGradient key={s.ticker} id={`area-${s.ticker.replace(/[^a-zA-Z0-9]/g,"_")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={s.dashed ? "0.08" : "0.18"}/>
                  <stop offset="100%" stopColor={s.color} stopOpacity="0"/>
                </linearGradient>
              ))}
            </defs>

            {/* Fond zone */}
            <rect x={ML} y={MT} width={CW} height={CH} fill={C.snowOff} rx="4" opacity="0.5" />

            {/* Ligne 0% mise en valeur */}
            <line x1={ML} x2={ML+CW} y1={yScale(0)} y2={yScale(0)} stroke="rgba(148,163,184,0.6)" strokeWidth="1.5" />

            {/* Grille */}
            {gridVals.filter(v => v !== 0).map(v => (
              <g key={v}>
                <line x1={ML} x2={ML+CW} y1={yScale(v)} y2={yScale(v)} stroke="rgba(148,163,184,0.22)" strokeWidth="1" strokeDasharray="4,4" />
                <text x={ML-5} y={yScale(v)+4} textAnchor="end" fontSize="10" fill="#94A3B8" fontFamily="'DM Sans', sans-serif" fontWeight="500">
                  {v >= 0 ? "+" : ""}{v.toFixed(0)}%
                </text>
              </g>
            ))}
            <text x={ML-5} y={yScale(0)+4} textAnchor="end" fontSize="10" fill="#64748B" fontFamily="'DM Sans', sans-serif" fontWeight="700">0%</text>

            {xLabels.map(({ frac, date }, i) => (
              <text key={i} x={xScale(frac)} y={MT+CH+20} textAnchor="middle" fontSize="9" fill="#94A3B8" fontFamily="'DM Sans', sans-serif">
                {pidx === 0
                  ? new Date(date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                  : pidx === 1
                  ? new Date(date).toLocaleDateString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })
                  : new Date(date).toLocaleDateString("fr-FR", { month: "short", year: pidx >= 5 ? "numeric" : "2-digit" })}
              </text>
            ))}

            {/* Area fills */}
            {displayedSeries.filter(s => !s.dashed).map(s => (
              <polygon key={`area-${s.ticker}`}
                points={[
                  `${xScale(0).toFixed(1)},${yScale(0).toFixed(1)}`,
                  ...s.points.map((pt, i) => `${xScale(i/(s.points.length-1)).toFixed(1)},${yScale(pt.pct).toFixed(1)}`),
                  `${xScale(1).toFixed(1)},${yScale(0).toFixed(1)}`,
                ].join(" ")}
                fill={`url(#area-${s.ticker.replace(/[^a-zA-Z0-9]/g,"_")})`} />
            ))}

            {/* Courbes */}
            {displayedSeries.map(s => (
              <polyline key={s.ticker}
                points={s.points.map((pt, i) => `${xScale(i/(s.points.length-1)).toFixed(1)},${yScale(pt.pct).toFixed(1)}`).join(" ")}
                fill="none" stroke={s.color} strokeWidth={s.dashed ? "2" : "2.5"}
                strokeDasharray={s.dashed ? "8,5" : undefined}
                strokeLinecap="round" strokeLinejoin="round"
                opacity={s.dashed ? "0.8" : "1"} />
            ))}

            {hoverFrac != null && (
              <>
                <line x1={xScale(hoverFrac)} x2={xScale(hoverFrac)} y1={MT} y2={MT+CH}
                  stroke="rgba(148,163,184,0.6)" strokeWidth="1" strokeDasharray="3,3" />
                {hoverInfo?.map(s => (
                  <circle key={s.ticker} cx={xScale(hoverFrac)} cy={yScale(s.pt.pct)} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2.5" />
                ))}
              </>
            )}
          </svg>

          {/* Tooltip survol */}
          {hoverFrac != null && hoverInfo && (
            <div style={{ background: "#111214", borderRadius: "10px", padding: "10px 14px", marginTop: "8px", fontSize: "11px", boxShadow: "0 4px 16px rgba(17,18,20,0.18)" }}>
              {hoverDate && (
                <div style={{ fontWeight: "600", color: "rgba(255,255,255,0.45)", marginBottom: "8px", fontSize: "10px", letterSpacing: "0.5px" }}>
                  {new Date(hoverDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                {hoverInfo.map(s => (
                  <span key={s.ticker} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: s.color, flexShrink: 0, display: "inline-block", boxShadow: `0 0 6px ${s.color}60` }} />
                    <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: "500" }}>{s.nom.split(" ").slice(0,2).join(" ")}</span>
                    <span style={{ color: s.pt.pct >= 0 ? "#4ADE80" : "#F87171", fontWeight: "800" }}>
                      {s.pt.pct >= 0 ? "+" : ""}{s.pt.pct.toFixed(2)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Légende pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "14px" }}>
            {displayedSeries.map(s => {
              const last = s.points[s.points.length - 1];
              const isPos = last.pct >= 0;
              return (
                <div key={s.ticker} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "5px 12px", background: C.snowOff, borderRadius: "20px", border: `1px solid ${s.dashed ? s.color + "50" : C.border}` }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: s.color, flexShrink: 0, display: "inline-block" }} />
                  <span style={{ fontSize: "11px", fontWeight: "600", color: C.inkSoft }}>{s.nom.split(" ").slice(0,2).join(" ")}</span>
                  <span style={{ fontSize: "11px", fontWeight: "800", color: isPos ? C.green : C.red, background: isPos ? C.greenLight : C.redLight, padding: "1px 6px", borderRadius: "5px" }}>
                    {isPos ? "+" : ""}{last.pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Positions sans données */}
          {missing.length > 0 && (
            <div style={{ marginTop: "10px", padding: "8px 12px", background: "#FEF9C3", border: "1px solid #FDE047", borderRadius: "8px", fontSize: "10px", color: "#854D0E" }}>
              <span style={{ fontWeight: "700" }}>⚠ {missing.length} position{missing.length > 1 ? "s" : ""} sans données : </span>
              {missing.map((m, i) => (
                <span key={i}>{i > 0 ? " · " : ""}<strong>{m.nom.split(" ").slice(0,2).join(" ")}</strong> <span style={{ opacity: 0.7 }}>({m.reason})</span></span>
              ))}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
