import { useState } from "react";
import { C, shadow } from "../constants/theme";
import { fmtEur, fmtPct, linReg } from "../lib/finance";
import { load } from "../lib/storage";
import { fetchWithProxy } from "../lib/api";
import { useIsMobile } from "../context/mobile";
import { StatBox, ThinkingSpinner } from "./UI";

const TICKER_CACHE_KEY = "bourse_isin_ticker_cache";
const DEFAULT_POSITIONS = [];

// ─── Projection Tab ───────────────────────────────────────────────────────────
const INFLATION_RATE = 0.025; // CPI européen ~2,5 %/an

export default function ProjectionTab({ profil, account = "PEA" }) {
  const isMobile = useIsMobile();
  const [tooltip, setTooltip]       = useState(null);
  const [showInflation, setShowInflation] = useState(false);
  const [inflationRate, setInflationRate] = useState(() => parseFloat(localStorage.getItem("bourse_inflation_rate") || "2.5"));
  const [impotSortie,   setImpotSortie]   = useState(() => parseFloat(localStorage.getItem("bourse_impot_sortie")  || "30"));
  const [horizonYears, setHorizonYears]   = useState(30);  // 10 | 20 | 30
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
    { label: "Réaliste",         taux: 0.07,    color: C.navy,     icon: "◆" },
    { label: "Optimiste",        taux: 0.12,    color: C.green,    icon: "▲" },
    { label: "Mon portefeuille", taux: tauxReel, color: C.goldDark, icon: "★" },
  ];

  // Valeur projetée : part de la valeur de marché actuelle + DCA futurs
  const proj    = (taux, mois) => {
    const r = Math.pow(1 + taux, 1 / 12) - 1;
    return totalActuel * Math.pow(1 + r, mois) +
      (r > 0 ? dcaMensuel * (Math.pow(1 + r, mois) - 1) / r : dcaMensuel * mois);
  };
  // Capital réellement sorti de poche : coût historique + DCA futurs
  const investi = (mois) => totalInvesti + dcaMensuel * mois;

  const HORIZONS_TABLE = [6, 12, 36, 60, 120, 240, 360];
  const durLabel = m => m >= 24 ? `${m / 12} ans` : m === 12 ? "1 an" : `${m} mois`;
  const fmtVal  = v => v >= 1000000 ? `${(v / 1000000).toFixed(2)}M€` : `${Math.round(v / 1000)}k€`;

  if (totalActuel === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.inkSubtle }}>
      <div style={{ fontSize: "32px", marginBottom: "14px", opacity: 0.2 }}>📈</div>
      <div style={{ fontSize: "14px", fontWeight: "600" }}>Aucune position · Ajoutez des positions dans l'onglet Portefeuille</div>
    </div>
  );

  // ── SVG constants ──
  const MAX_MOIS = horizonYears * 12;
  const W = 720, H = 340;
  const PAD = { top: 24, right: 66, bottom: 46, left: 72 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const pts    = Array.from({ length: MAX_MOIS / 3 + 1 }, (_, i) => i * 3);
  const scenariosWithHist = histProj ? [...SCENARIOS, { label: "Projection historique", taux: histProj.taux, color: "#7C3AED", icon: "⬟" }] : SCENARIOS;
  const allVals = [...scenariosWithHist.flatMap(sc => pts.map(m => proj(sc.taux, m))), totalActuel];
  const maxV   = Math.max(...allVals);
  const xS     = m => PAD.left + (m / MAX_MOIS) * innerW;
  const yS     = v => PAD.top  + (1 - v / (maxV || 1)) * innerH;
  const yTicks = Array.from({ length: 6 }, (_, i) => i * maxV / 5);
  const annees = Array.from({ length: horizonYears + 1 }, (_, i) => i);
  const step5  = horizonYears <= 10 ? 1 : horizonYears <= 20 ? 2 : 5;
  const JALONS = annees.filter(a => a > 0 && a % step5 === 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
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
            {/* Horizon selector */}
            <div style={{ display: "flex", background: C.snowOff, borderRadius: "10px", padding: "2px", border: `1px solid ${C.border}` }}>
              {[10, 20, 30].map(y => (
                <button key={y} onClick={() => { setHorizonYears(y); setTooltip(null); }}
                  style={{ padding: "5px 14px", borderRadius: "8px", border: "none", fontSize: "11px", fontWeight: "700", fontFamily: "Inter,sans-serif", cursor: "pointer", transition: "all 0.15s",
                    background: horizonYears === y ? C.navy : "transparent",
                    color: horizonYears === y ? "#fff" : C.inkMuted,
                    boxShadow: horizonYears === y ? shadow.pill : "none" }}>
                  {y} ans
                </button>
              ))}
            </div>
            {/* Inflation configurable */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", background: showInflation ? C.goldLight : C.snowOff, border: `1px solid ${showInflation ? C.gold : C.border}`, borderRadius: "10px", padding: "4px 8px", cursor: "pointer" }} onClick={() => setShowInflation(v => !v)}>
              <span style={{ fontSize: "10px", fontWeight: "700", color: showInflation ? C.goldDark : C.inkSubtle }}>Inflation</span>
              <input type="number" min="0" max="20" step="0.1" value={inflationRate}
                onClick={e => e.stopPropagation()}
                onChange={e => { const v = parseFloat(e.target.value) || 0; setInflationRate(v); localStorage.setItem("bourse_inflation_rate", v); }}
                style={{ width: "36px", border: "none", background: "transparent", fontSize: "10px", fontWeight: "700", color: showInflation ? C.goldDark : C.inkSubtle, textAlign: "center", outline: "none", fontFamily: "Inter,sans-serif" }} />
              <span style={{ fontSize: "10px", fontWeight: "700", color: showInflation ? C.goldDark : C.inkSubtle }}>%</span>
            </div>
            {/* Impôt de sortie */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "4px 8px" }}>
              <span style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle }}>Impôt sortie</span>
              <input type="number" min="0" max="50" step="0.1" value={impotSortie}
                onChange={e => { const v = parseFloat(e.target.value) || 0; setImpotSortie(v); localStorage.setItem("bourse_impot_sortie", v); }}
                style={{ width: "32px", border: "none", background: "transparent", fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textAlign: "center", outline: "none", fontFamily: "Inter,sans-serif" }} />
              <span style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle }}>%</span>
            </div>
            {/* Projection historique */}
            <button onClick={() => histProj ? setHistProj(null) : computeHistoricalProj()} disabled={loadingHist}
              style={{ padding: "6px 12px", borderRadius: "10px", fontSize: "10px", fontWeight: "700", fontFamily: "Inter,sans-serif", cursor: "pointer", border: `1px solid ${histProj ? "rgba(124,58,237,0.4)" : C.border}`, background: histProj ? "rgba(124,58,237,0.08)" : C.snowOff, color: histProj ? "#7C3AED" : C.inkMuted, opacity: loadingHist ? 0.6 : 1 }}>
              {loadingHist ? <span style={{ display:"inline-flex", alignItems:"center", gap:"5px" }}><ThinkingSpinner size={12} color="#7C3AED" /> Calcul…</span> : histProj ? `⬟ ${(histProj.taux * 100).toFixed(1)}%/an ×` : "⬟ Projection historique"}
            </button>
          </div>
        </div>

        {histError && <div style={{ fontSize: "11px", color: C.red, background: C.redLight, borderRadius: "8px", padding: "8px 12px", marginBottom: "12px" }}>⚠ {histError}</div>}

        {/* SVG */}
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
            onMouseLeave={() => setTooltip(null)}>
            <defs>
              {/* Gradient pour chaque scénario */}
              {[
                { id: "gPess",  color: C.red  },
                { id: "gReal",  color: C.navy },
                { id: "gOpti",  color: C.green },
                { id: "gPort",  color: C.goldDark },
                { id: "gHist",  color: "#7C3AED" },
                { id: "gInvest", color: "#A0A09C" },
              ].map(({ id, color }) => (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.01" />
                </linearGradient>
              ))}
            </defs>

            {/* Fond zone investie */}
            {(() => {
              const line = pts.map((m, i) => `${i === 0 ? "M" : "L"}${xS(m).toFixed(1)},${yS(investi(m)).toFixed(1)}`).join(" ");
              const area = `${line} L${xS(MAX_MOIS).toFixed(1)},${yS(0).toFixed(1)} L${xS(0).toFixed(1)},${yS(0).toFixed(1)} Z`;
              return (
                <g>
                  <path d={area} fill="url(#gInvest)" />
                  <path d={line} fill="none" stroke="#C0C0BC" strokeWidth="1.5" strokeDasharray="5,4" />
                </g>
              );
            })()}

            {/* Grille Y */}
            {yTicks.map((v, i) => {
              const y = yS(v);
              return (
                <g key={i}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                    stroke={i === 0 ? "#C8C8C4" : C.border} strokeWidth={i === 0 ? "1" : "0.5"} strokeDasharray={i > 0 ? "3,4" : ""} />
                  <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="9" fill={C.inkSubtle} fontFamily="Inter, sans-serif">
                    {v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}€
                  </text>
                </g>
              );
            })}

            {/* Grille X */}
            {annees.map(a => {
              const m = a * 12, x = xS(m);
              const isJalon = a % step5 === 0;
              return (
                <g key={a}>
                  <line x1={x} x2={x} y1={PAD.top} y2={H - PAD.bottom}
                    stroke={isJalon ? "#D0D0CC" : C.border} strokeWidth={isJalon ? "0.8" : "0.3"}
                    strokeDasharray={isJalon ? "" : "2,4"} />
                  {isJalon && <text x={x} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="10"
                    fill={C.inkMuted} fontFamily="Inter, sans-serif" fontWeight="600">
                    {a === 0 ? "Auj." : `${a} ans`}
                  </text>}
                </g>
              );
            })}

            {/* Courbes scénarios + areas */}
            {(() => {
              const gradIds = ["gPess","gReal","gOpti","gPort","gHist"];
              return scenariosWithHist.map((sc, si) => {
                const isHistorical = si === 4;
                const isDashed     = si === 3;
                const line = pts.map((m, i) => `${i === 0 ? "M" : "L"}${xS(m).toFixed(1)},${yS(proj(sc.taux, m)).toFixed(1)}`).join(" ");
                const area = `${line} L${xS(MAX_MOIS).toFixed(1)},${yS(0).toFixed(1)} L${xS(0).toFixed(1)},${yS(0).toFixed(1)} Z`;
                const valFin = proj(sc.taux, MAX_MOIS);
                return (
                  <g key={`${sc.taux}-${si}`}>
                    <path d={area} fill={`url(#${gradIds[si]})`} />
                    <path d={line} fill="none" stroke={sc.color}
                      strokeWidth={isHistorical ? "2.5" : isDashed ? "2" : "2.5"}
                      strokeDasharray={isDashed ? "7,4" : isHistorical ? "8,4" : ""}
                      strokeLinejoin="round" opacity={isHistorical ? 0.9 : 0.88} />
                    <circle cx={xS(MAX_MOIS)} cy={yS(valFin)} r="4.5"
                      fill={isDashed || isHistorical ? C.snow : sc.color} stroke={sc.color} strokeWidth="2" />
                    <text x={W - PAD.right + 6} y={yS(valFin) + 4} fontSize="9" fill={sc.color}
                      fontFamily="Inter, sans-serif" fontWeight="800">
                      {valFin >= 1000000 ? `${(valFin / 1000000).toFixed(2)}M` : `${Math.round(valFin / 1000)}k`}€
                    </text>
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
              return <path d={inflLine} fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="5,4" strokeLinejoin="round" opacity="0.8" />;
            })()}

            {/* Points interactifs aux jalons */}
            {JALONS.map(a => {
              const m = a * 12, x = xS(m);
              const isHovered = tooltip?.annee === a;
              return (
                <g key={a} style={{ cursor: "pointer" }}
                  onMouseEnter={() => setTooltip({ annee: a, xPct: xS(m) / W * 100 })}>
                  <rect x={x - 14} y={PAD.top} width={28} height={innerH} fill="transparent" />
                  {isHovered && <line x1={x} x2={x} y1={PAD.top} y2={H - PAD.bottom}
                    stroke={C.navy} strokeWidth="1" opacity="0.15" strokeDasharray="4,3" />}
                  {scenariosWithHist.map((sc, si) => (
                    <circle key={si} cx={x} cy={yS(proj(sc.taux, m))} r={isHovered ? 5 : 3}
                      fill={isHovered ? sc.color : C.snow} stroke={sc.color} strokeWidth="2"
                      style={{ transition: "r 0.12s" }} />
                  ))}
                  <circle cx={x} cy={yS(investi(m))} r={isHovered ? 3.5 : 2}
                    fill={isHovered ? "#A0A09C" : C.snow} stroke="#A0A09C" strokeWidth="1.5" />
                </g>
              );
            })}

            {/* Point de départ */}
            <circle cx={xS(0)} cy={yS(totalActuel)} r="5.5" fill={C.snow} stroke={C.navy} strokeWidth="2.5" />
            <text x={xS(0) + 10} y={yS(totalActuel) - 8} fontSize="9.5" fill={C.navy}
              fontFamily="Inter, sans-serif" fontWeight="800">{fmtEur(totalActuel)}</text>
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
                  return (
                    <div key={si} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "10px", color: sc.color, fontWeight: "700" }}>{sc.icon} {sc.label}</span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "13px", color: sc.color, fontWeight: "800" }}>{fmtVal(v)}</div>
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
              <span style={{ fontSize: "10px", color: sc.color, fontWeight: "700" }}>{sc.icon} {sc.label} ({sc.taux >= 0 ? "+" : ""}{(sc.taux*100).toFixed(1)}%)</span>
            </div>
          ))}
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

      {/* ── Tableau ── */}
      <div className="ba-table-wrap" style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden", boxShadow: shadow.card }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: "11px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1.5px" }}>
          Tableau de projection détaillé
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `130px repeat(${HORIZONS_TABLE.length}, 1fr)`, borderBottom: `1px solid ${C.border}`, padding: "10px 16px", background: C.snowOff }}>
          <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase" }}>Scénario</div>
          {HORIZONS_TABLE.map(m => (
            <div key={m} style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", textAlign: "center" }}>{durLabel(m)}</div>
          ))}
        </div>
        {/* Coût réel */}
        <div style={{ display: "grid", gridTemplateColumns: `130px repeat(${HORIZONS_TABLE.length}, 1fr)`, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.snowOff }}>
          <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600" }}>💰 Coût réel</div>
          {HORIZONS_TABLE.map(m => (
            <div key={m} style={{ fontSize: "11px", color: C.inkMuted, textAlign: "center" }}>{fmtEur(investi(m))}</div>
          ))}
        </div>
        {SCENARIOS.map((sc, si) => (
          <div key={sc.taux} style={{ display: "grid", gridTemplateColumns: `130px repeat(${HORIZONS_TABLE.length}, 1fr)`, padding: "12px 16px", borderBottom: si < SCENARIOS.length - 1 ? `1px solid ${C.border}` : "none", background: si === 1 ? C.navyLight + "50" : si === 3 ? "#FBF0E430" : "transparent" }}>
            <div>
              <div style={{ fontSize: "11px", color: sc.color, fontWeight: "700" }}>{sc.icon} {sc.label}</div>
              <div style={{ fontSize: "9px", color: sc.color, opacity: 0.7, fontWeight: "600" }}>
                +{Math.round(sc.taux * 100)}%/an{si === 3 ? " (P/V CSV)" : ""}
                {inflationRate > 0 && <span style={{ opacity: 0.6 }}> · réel {((sc.taux - inflationRate / 100) * 100).toFixed(1)}%</span>}
              </div>
            </div>
            {HORIZONS_TABLE.map(m => {
              const v    = proj(sc.taux, m);
              const inv  = investi(m);
              const mult = inv > 0 ? v / inv : 1;
              const gains = Math.max(0, v - inv);
              const netApresImpot = v - gains * (impotSortie / 100);
              const multReel = inv > 0 ? (v / Math.pow(1 + inflationRate / 100, m / 12)) / inv : 1;
              return (
                <div key={m} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: sc.color }}>{fmtEur(v)}</div>
                  <div style={{ fontSize: "9px", color: sc.color, opacity: 0.65 }}>×{mult.toFixed(1)}{inflationRate > 0 && <span> · ×{multReel.toFixed(1)} réel</span>}</div>
                  {impotSortie > 0 && <div style={{ fontSize: "9px", color: C.inkSubtle, opacity: 0.8 }}>{fmtEur(netApresImpot)} net</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ fontSize: "10px", color: C.inkSubtle, textAlign: "center", lineHeight: "1.7" }}>
        Base : capital de marché actuel {fmtEur(totalActuel)} · coût historique {fmtEur(totalInvesti)} · DCA {dcaMensuel > 0 ? fmtEur(dcaMensuel) + "/mois" : "non configuré"}<br />
        ×N = multiplicateur nominal · ×N réel = ajusté inflation {inflationRate}% · "net" = après impôt de sortie {impotSortie}% sur les gains · ⚠ Projections indicatives, non garanties.
      </div>

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
        // Si on connaît la date : ancienneté calculée automatiquement
        const ancienneteEffective = agePEARetrait !== null
          ? (agePEARetrait >= 5 ? "apres5" : "avant5")
          : retraitAnciennete; // sinon valeur manuelle
        const ancienneteInconsistante = agePEARetrait !== null && ancienneteEffective !== retraitAnciennete;

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

        const inp  = { width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: "8px", fontSize: "13px", outline: "none", background: C.snow, color: C.ink, fontFamily: "Inter,sans-serif", boxSizing: "border-box" };
        const row  = { display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "2px" : "0", padding: "9px 0", borderBottom: `1px solid ${C.border}` };
        const lbl  = { fontSize: "12px", color: C.inkMuted };
        const val  = (c = C.ink) => ({ fontSize: "13px", fontWeight: "700", color: c, flexShrink: 0 });

        return (
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden", boxShadow: shadow.card }}>
            {/* Header */}
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "10px", background: C.navyLight }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.navy, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6"/>
                  <path d="M8 5 L8 8 L10.5 9.5"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: C.navy }}>Simulateur de retrait PEA</div>
                <div style={{ fontSize: "10px", color: C.inkMuted, marginTop: "1px" }}>Calcul de la fiscalité applicable selon l'ancienneté du plan</div>
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
                      <button key={h} onClick={() => setRetraitHorizon(h)}
                        style={{ padding: "4px 9px", borderRadius: "16px", border: `1.5px solid ${retraitHorizon === h ? C.navy : C.border}`, background: retraitHorizon === h ? C.navyLight : C.snow, color: retraitHorizon === h ? C.navy : C.inkMuted, fontSize: "10px", fontWeight: retraitHorizon === h ? "700" : "500", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
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
                            style={{ flex: 1, padding: "5px 2px", borderRadius: "8px", border: `1.5px solid ${retraitTauxAn === t ? col : C.border}`, background: retraitTauxAn === t ? col + "18" : C.snow, color: retraitTauxAn === t ? col : C.inkMuted, fontSize: "9px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif", textAlign: "center" }}>
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

                <div>
                  <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "6px" }}>Ancienneté du PEA</div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {[["avant5","Moins de 5 ans"],["apres5","5 ans et plus"]].map(([v, label]) => (
                      <button key={v} onClick={() => setRetraitAnciennete(v)}
                        style={{ flex: 1, padding: "8px 6px", borderRadius: "8px", border: `1.5px solid ${retraitAnciennete === v ? C.navy : C.border}`, background: retraitAnciennete === v ? C.navyLight : C.snow, color: retraitAnciennete === v ? C.navy : C.inkMuted, fontSize: "11px", fontWeight: retraitAnciennete === v ? "700" : "400", cursor: "pointer", fontFamily: "Inter,sans-serif", transition: "all 0.15s" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {retraitAnciennete === "avant5" && (
                  <div>
                    <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "6px" }}>Régime d'imposition (IR)</div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[["pfu","Flat Tax 30 %"],["bareme","Barème progressif"]].map(([v, label]) => (
                        <button key={v} onClick={() => setRetraitRegime(v)}
                          style={{ flex: 1, padding: "8px 6px", borderRadius: "8px", border: `1.5px solid ${retraitRegime === v ? C.navy : C.border}`, background: retraitRegime === v ? C.navyLight : C.snow, color: retraitRegime === v ? C.navy : C.inkMuted, fontSize: "11px", fontWeight: retraitRegime === v ? "700" : "400", cursor: "pointer", fontFamily: "Inter,sans-serif", transition: "all 0.15s" }}>
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
                              style={{ padding: "5px 10px", borderRadius: "6px", border: `1.5px solid ${retraitTMI === tmi ? C.navy : C.border}`, background: retraitTMI === tmi ? C.navy : C.snow, color: retraitTMI === tmi ? "#fff" : C.inkMuted, fontSize: "11px", fontWeight: "600", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
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
                    <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #C9A96E 100%)`, borderRadius: "12px", padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-end" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "10px" : "0" }}>
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
