import { useMemo, useState, useEffect, useRef } from "react";
import { sanitizePositions, fmtEur } from "../lib/finance";
import { load } from "../lib/storage";
import { DEFAULT_POSITIONS, DEFAULT_PROFIL } from "../constants/config";
import { TABS } from "../constants/tabs";
import { fetchWithProxy } from "../lib/api";

const SNAPSHOTS_KEY = "bourse_snapshots";


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

// ── Cellule label / valeur ─────────────────────────────────────────────────────
function Row({ label, value, color, last }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      gap: "12px",
      padding: "10px 0",
      borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.08)",
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

  // Reconstitue le portefeuille à une date passée en annulant les transactions postérieures,
  // puis fetche les prix historiques Yahoo pour calculer V0 avec les bonnes lignes
  useEffect(() => {
    let cancelled = false;
    async function computeHistoricalRefs() {
      try {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm   = String(now.getMonth() + 1).padStart(2, "0");
        const targets = [
          { key: "jan1",  date: `${yyyy}-01-01` },
          { key: "mois1", date: `${yyyy}-${mm}-01` },
        ];
        const tickerCache = (() => { try { return JSON.parse(localStorage.getItem("bourse_isin_ticker_cache") || "{}"); } catch { return {}; } })();
        const allOps = (() => { try { return JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]").filter(o => !account || (o.compte || "PEA") === account); } catch { return []; } })();

        const computeV0 = async (targetDate) => {
          // Reconstituer les quantités à targetDate : partir de l'état actuel et annuler les ops postérieures
          const qtyMap = {};
          for (const p of positions) {
            if (p.isin) qtyMap[p.isin] = { isin: p.isin, nom: p.nom, quantite: p.quantite };
          }
          for (const op of allOps.filter(o => o.date > targetDate)) {
            const isin = op.isin; if (!isin) continue;
            const qty = parseFloat(op.quantite) || 0;
            if (!qtyMap[isin]) qtyMap[isin] = { isin, nom: op.titre || op.nom || isin, quantite: 0 };
            if (op.type === "ACHAT")  qtyMap[isin].quantite -= qty; // annuler l'achat
            if (op.type === "VENTE")  qtyMap[isin].quantite += qty; // annuler la vente
          }
          const hist = Object.values(qtyMap).filter(p => p.quantite > 0.001 && p.isin && tickerCache[p.isin]);
          if (!hist.length) return null;

          const targetTs = Math.floor(new Date(targetDate).getTime() / 1000);
          const results = await Promise.all(hist.map(async (pos) => {
            try {
              const ticker = tickerCache[pos.isin];
              const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${targetTs - 86400 * 5}&period2=${targetTs + 86400 * 5}&interval=1d`;
              const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
              if (!res.ok) return null;
              const json = await res.json();
              const result = json?.chart?.result?.[0];
              const timestamps = result?.timestamp || [];
              const closes = result?.indicators?.quote?.[0]?.close || [];
              let best = null, bestDiff = Infinity;
              for (let i = 0; i < timestamps.length; i++) {
                const diff = Math.abs(timestamps[i] - targetTs);
                if (diff < bestDiff && closes[i] != null) { bestDiff = diff; best = closes[i]; }
              }
              return bestDiff <= 7 * 86400 ? best * pos.quantite : null;
            } catch { return null; }
          }));

          const valid = results.filter(r => r != null);
          // Exiger au moins 50% de couverture
          return valid.length >= hist.length * 0.5 ? valid.reduce((s, v) => s + v, 0) : null;
        };

        const [jan1, mois1] = await Promise.all(targets.map(t => computeV0(t.date)));
        if (!cancelled) setHistRefs({ jan1, mois1, loading: false });
      } catch {
        if (!cancelled) setHistRefs({ jan1: null, mois1: null, loading: false });
      }
    }
    computeHistoricalRefs();
    return () => { cancelled = true; };
  }, [positions, account]);

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
  const modifiedDietz = (v0, fromDate) => {
    if (!v0 || v0 <= 0) return null;
    const cf = calcDeltaCapital(account, fromDate, today);
    return (currentValue - v0 - cf) / v0 * 100;
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

  const pfYtd  = modifiedDietz(v0Jan1,  `${yyyy}-01-01`);
  const pfMois = modifiedDietz(v0Mois1, `${yyyy}-${mm}-01`);

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
      <Row label={`Ma performance ${yyyy}`}        value={loadingYtd  ? "…" : fmtPct(pfYtd)}  color={pctColor(pfYtd)}  />
      <Row label={`Ma performance ${moisLabel}`}   value={loadingMois ? "…" : fmtPct(pfMois)} color={pctColor(pfMois)} />
      <Row label="Ma performance de la veille"     value={fmtPct(pfVeille)} color={pctColor(pfVeille)} />
      <div style={{ height: "1px", background: "rgba(255,255,255,0.12)", margin: "4px 0" }} />
      <Row label={`Performance ${yyyy} du CAC 40`} value={cac.loading ? "…" : fmtPct(cac.ytd)}   color={pctColor(cac.ytd)}  />
      <Row label={`Perf. mensuelle du CAC 40`}     value={cac.loading ? "…" : fmtPct(cac.mois)}  color={pctColor(cac.mois)} last />
    </Card>
  );
}

// ── Courbe d'évolution ────────────────────────────────────────────────────────
const PERIODS = [
  { label: "1M",  days: 30  },
  { label: "3M",  days: 90  },
  { label: "6M",  days: 180 },
  { label: "1A",  days: 365 },
  { label: "Tout", days: 9999 },
];

function CourbeEvolution({ hidden }) {
  const [period, setPeriod] = useState(30);
  const [hover, setHover]   = useState(null); // { idx, x, y }
  const svgRef = useRef(null);
  const blur = hidden ? { filter: "blur(6px)", userSelect: "none", pointerEvents: "none" } : {};

  const { points, current, first, investi } = useMemo(() => {
    try {
      const snaps = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]");
      const cutoff = new Date(Date.now() - period * 86400000).toISOString().slice(0, 10);
      const filtered = snaps.filter(s => period >= 9999 || s.date >= cutoff);
      if (filtered.length < 2) return { points: null };
      return {
        points:  filtered,
        current: filtered[filtered.length - 1].valeur,
        first:   filtered[0].valeur,
        investi: filtered[filtered.length - 1].capitalVerse || filtered[filtered.length - 1].investi || 0,
      };
    } catch { return { points: null }; }
  }, [period]);

  if (!points) return (
    <div style={{ background: "linear-gradient(145deg,#0d1f33 0%,#1a3a5c 100%)", borderRadius: "16px", padding: "28px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>
      Aucun snapshot · prenez-en un depuis l'onglet Historique.
    </div>
  );

  const delta    = current - first;
  const perf     = (delta / first) * 100;
  const pvLatent = investi > 0 ? current - investi : null;
  const isUp     = delta >= 0;
  const lineClr  = isUp ? "#6ee7b7" : "#f87171";

  const W = 600; const H = 130;
  const padT = 16, padB = 10, padL = 12, padR = 48;
  const values = points.map(p => p.valeur);
  const minV = Math.min(...values), maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const toX = i => padL + (i / (points.length - 1)) * (W - padL - padR);
  const toY = v => padT + (1 - (v - minV) / range) * (H - padT - padB);

  const pts    = points.map((p, i) => [toX(i), toY(p.valeur)]);
  const smooth = pts.map(([x,y], i) => `${i===0?"M":"L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaD  = `${smooth} L${pts[pts.length-1][0].toFixed(1)},${H-padB} L${pts[0][0].toFixed(1)},${H-padB} Z`;

  const yTicks = [minV, (minV+maxV)/2, maxV].map(v => ({ v, y: toY(v), label: v >= 1000 ? (v/1000).toFixed(1)+"k" : v.toFixed(0) }));
  const xDates = [0, Math.floor((points.length-1)/2), points.length-1].map(i => ({ i, x: toX(i), label: points[i].date.slice(5).replace("-","/") }));

  return (
    <div style={{ background: "linear-gradient(145deg,#0d1f33 0%,#1a3a5c 100%)", borderRadius: "16px", padding: "18px 18px 16px", boxShadow: "0 8px 28px rgba(8,20,40,0.45)" }}>

      {/* Titre + sélecteur */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.32)", fontWeight: "700", letterSpacing: "1.4px", textTransform: "uppercase" }}>
          Évolution du portefeuille
        </div>
        <div style={{ display: "flex", gap: "2px" }}>
          {PERIODS.map(({ label, days }) => (
            <button key={days} onClick={() => setPeriod(days)}
              style={{ padding: "3px 8px", borderRadius: "6px", border: "none", background: period === days ? "rgba(255,255,255,0.14)" : "transparent", color: period === days ? "#fff" : "rgba(255,255,255,0.3)", fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 3 métriques */}
      <div style={{ display: "grid", gridTemplateColumns: pvLatent !== null ? "1fr 1fr 1fr" : "1fr 1fr", gap: "8px", marginBottom: "14px", ...blur }}>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "10px", padding: "10px 12px" }}>
          <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.32)", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "4px" }}>Valeur actuelle</div>
          <div style={{ fontSize: "16px", fontWeight: "900", color: "#fff", letterSpacing: "-0.02em" }}>{fmtEur(current)}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "10px", padding: "10px 12px" }}>
          <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.32)", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "4px" }}>Croissance · versements inclus</div>
          <div style={{ fontSize: "15px", fontWeight: "800", color: lineClr }}>{isUp?"+":""}{fmtEur(delta)}</div>
          <div style={{ fontSize: "10px", color: lineClr, opacity: 0.8 }}>{isUp?"+":""}{perf.toFixed(2)} %</div>
        </div>
        {pvLatent !== null && (
          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "10px", padding: "10px 12px" }}>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.32)", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "4px" }}>Gain vs capital versé</div>
            <div style={{ fontSize: "15px", fontWeight: "800", color: pvLatent >= 0 ? "#6ee7b7" : "#f87171" }}>{pvLatent>=0?"+":""}{fmtEur(pvLatent)}</div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>achats − ventes réels</div>
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
          {yTicks.map(({ y }, i) => (
            <line key={i} x1={padL} y1={y.toFixed(1)} x2={W-padR} y2={y.toFixed(1)}
              stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 6"/>
          ))}
          <path d={smooth} fill="none" stroke={lineClr} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>

          {/* Crosshair */}
          {hover && (
            <line x1={hover.x.toFixed(1)} y1={padT} x2={hover.x.toFixed(1)} y2={H - padB}
              stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="3 3"/>
          )}
        </svg>

        {/* Tooltip Boursorama-style */}
        {hover && (() => {
          const p    = points[hover.idx];
          const date = new Date(p.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
          // pctX : % de largeur du conteneur = même ratio que le viewBox SVG (preserveAspectRatio none)
          const pctX   = (hover.x / W) * 100;
          // svgY en px réels : le SVG a height={H} donc 1:1
          const svgYpx = hover.y;
          const onLeft = hover.x > W * 0.62;
          const flagW  = 116;
          const dateW  = 100;
          // Flag valeur : centré verticalement sur le point, décalé à gauche ou droite
          const flagTop = Math.max(padT, Math.min(H - padB - 26, svgYpx - 13));
          // Date : fixée dans la bande padB, en bas du SVG
          const dateTop = H - padB - 22;
          return (
            <>
              {/* Flag valeur */}
              <div style={{
                position: "absolute",
                top: `${flagTop}px`,
                ...(onLeft
                  ? { left: `calc(${pctX}% - ${flagW + 10}px)` }
                  : { left: `calc(${pctX}% + 10px)` }
                ),
                width: `${flagW}px`,
                background: "rgba(8,20,40,0.95)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: "6px",
                padding: "5px 9px",
                pointerEvents: "none",
                zIndex: 10,
                textAlign: "center",
              }}>
                <span style={{ fontSize: "13px", fontWeight: "800", color: "#fff", whiteSpace: "nowrap" }}>{fmtEur(p.valeur)}</span>
              </div>

              {/* Date — boîte colorée en bas du SVG, centrée sur le crosshair */}
              <div style={{
                position: "absolute",
                top: `${dateTop}px`,
                left: `calc(${pctX}% - ${dateW / 2}px)`,
                width: `${dateW}px`,
                background: isUp ? "rgba(110,231,183,0.15)" : "rgba(248,113,113,0.15)",
                border: `1px solid ${isUp ? "rgba(110,231,183,0.45)" : "rgba(248,113,113,0.45)"}`,
                borderRadius: "5px",
                padding: "3px 0",
                pointerEvents: "none",
                zIndex: 10,
                textAlign: "center",
              }}>
                <span style={{ fontSize: "10px", fontWeight: "700", color: isUp ? "#6ee7b7" : "#f87171", whiteSpace: "nowrap" }}>{date}</span>
              </div>
            </>
          );
        })()}

        {/* Labels Y */}
        <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: `${padR}px`, display: "flex", flexDirection: "column", justifyContent: "space-between", paddingBottom: `${padB}px`, paddingTop: `${padT - 6}px`, boxSizing: "border-box" }}>
          {[...yTicks].reverse().map(({ label }, i) => (
            <span key={i} style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", fontWeight: "500", lineHeight: 1, display: "block", textAlign: "right", paddingRight: "4px" }}>
              {label}
            </span>
          ))}
        </div>

        {/* Labels X — positionnés au % exact de la coordonnée SVG */}
        <div style={{ position: "relative", height: "18px", marginTop: "4px" }}>
          {xDates.map(({ label, x, i: idx }) => {
            const pct = (x / W) * 100;
            return (
              <span key={idx} style={{
                position: "absolute",
                left: `${pct}%`,
                transform: idx === 0 ? "none" : idx === points.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                fontSize: "10px", color: "rgba(255,255,255,0.35)", fontWeight: "500", whiteSpace: "nowrap",
              }}>
                {label}
              </span>
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
      <CourbeEvolution hidden={hidden} />
    </div>
  );
}
