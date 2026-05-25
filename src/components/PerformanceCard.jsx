import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { sanitizePositions, fmtPct, modifiedDietz } from "../lib/finance";
import { load } from "../lib/storage";
import { fetchWithProxy } from "../lib/api";
import { DEFAULT_POSITIONS } from "../constants/config";

const SNAPSHOTS_KEY = "bourse_snapshots";

function findSnap(snapshots, targetDate) {
  // Trouve le snapshot le plus récent <= targetDate
  const target = targetDate;
  const before = snapshots.filter(s => s.date <= target);
  if (!before.length) return null;
  return before[before.length - 1]; // déjà trié par date asc
}

function perfColor(v) {
  if (v === null || v === undefined) return C.inkSubtle;
  return v >= 0 ? C.green : C.red;
}

function PerfRow({ label, value, note, twr }) {
  const color    = perfColor(value);
  const twrColor = perfColor(twr);
  const fmt = v => v === null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2) + " %";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
      <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.85)", fontWeight: "600", lineHeight: "1.35" }}>
        {label}{note && <sup style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>{note}</sup>}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {twr !== undefined && twr !== null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: twrColor, fontWeight: "700" }}>{fmt(twr)}</div>
            <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", fontWeight: "600", letterSpacing: "0.5px" }}>TWR</div>
          </div>
        )}
        <span style={{ fontSize: "14px", fontWeight: "800", color, minWidth: "72px", textAlign: "right" }}>
          {fmt(value)}
        </span>
      </div>
    </div>
  );
}

export default function PerformanceCard({ account = "PEA" }) {
  const [cac40Ytd,  setCac40Ytd]  = useState(null);
  const [cac40Mois, setCac40Mois] = useState(null);
  const [loading,   setLoading]   = useState(true);

  // Positions et valeur actuelle
  const positions    = sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS))
                         .filter(p => (p.compte || "PEA") === account);
  const currentValue = positions.reduce((s, p) => s + (p.dernierCours || p.pru || 0) * (p.quantite || 0), 0);

  // Snapshots
  const snapshots = (() => { try { return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]"); } catch { return []; } })();

  const now      = new Date();
  const yyyy     = now.getFullYear();
  const mm       = String(now.getMonth() + 1).padStart(2, "0");
  const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);

  const snapYtd   = findSnap(snapshots, `${yyyy}-01-01`);
  const snapMois  = findSnap(snapshots, `${yyyy}-${mm}-01`);
  const snapVeille = findSnap(snapshots, yesterday);

  const perf = (snap) => (snap && snap.valeur > 0 && currentValue > 0)
    ? (currentValue - snap.valeur) / snap.valeur * 100
    : null;

  // Fallback : si pas de snapshot YTD/mensuel, calculer depuis le PRU total
  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const perfDepuisAchat = totalInvesti > 0 ? (currentValue - totalInvesti) / totalInvesti * 100 : null;

  const perfYtd    = perf(snapYtd)    ?? perfDepuisAchat;
  const perfMois   = perf(snapMois)   ?? perfDepuisAchat;
  const perfVeille = perf(snapVeille);

  // ── TWR (Modified Dietz) ─────────────────────────────────────────────────
  const ops = (() => { try { return JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]").filter(o => (o.compte || "PEA") === account); } catch { return []; } })();

  const twrForPeriod = (snap, periodStart) => {
    if (!snap || snap.valeur <= 0 || currentValue <= 0) return null;
    const endDate = now.toISOString().slice(0, 10);
    // Cash flows : ACHAT = entrée (+), VENTE = sortie (-)
    const cfs = ops
      .filter(o => o.date >= periodStart && o.date <= endDate && (o.type === "ACHAT" || o.type === "VENTE"))
      .map(o => ({
        date:   o.date,
        amount: (o.type === "ACHAT" ? 1 : -1) * (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0),
      }));
    const r = modifiedDietz(snap.valeur, currentValue, cfs, periodStart, endDate);
    return r !== null ? r * 100 : null;
  };

  const twrYtd  = twrForPeriod(snapYtd,  `${yyyy}-01-01`);
  const twrMois = twrForPeriod(snapMois, `${yyyy}-${mm}-01`);
  const hasTwr  = twrYtd !== null || twrMois !== null;

  const moisLabel = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // Fetch CAC 40 YTD + mensuel
  useEffect(() => {
    let cancelled = false;
    async function fetchCac() {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/%5EFCHI?range=ytd&interval=1d`;
        const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error();
        const json = await res.json();
        const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean);
        if (!closes || closes.length < 2) return;
        const firstClose = closes[0];
        const lastClose  = closes[closes.length - 1];
        if (!cancelled) {
          setCac40Ytd((lastClose - firstClose) / firstClose * 100);
          // Perf mensuelle CAC 40 : dernier cours vs ~21 séances avant
          const moisClose = closes[Math.max(0, closes.length - 22)];
          setCac40Mois((lastClose - moisClose) / moisClose * 100);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    fetchCac();
    return () => { cancelled = true; };
  }, []);

  if (positions.length === 0) return null;

  return (
    <div style={{ background: `linear-gradient(135deg, #0d2137 0%, #1a3a5c 100%)`, borderRadius: "22px", padding: "22px 24px", marginBottom: "20px", boxShadow: "0 8px 32px rgba(10,25,47,0.35)" }}>
      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "14px" }}>
        Suivi des performances · {account}
      </div>

      <PerfRow label={`Ma performance ${yyyy}`}      value={perfYtd}    note="1" twr={twrYtd} />
      <PerfRow label={`Ma performance ${moisLabel}`} value={perfMois}   note="2" twr={twrMois} />
      <PerfRow label="Ma performance de la veille"   value={perfVeille} />

      <div style={{ margin: "10px 0 2px", borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: "10px" }} />

      <PerfRow label={`Performance ${yyyy} du CAC 40`}  value={loading ? null : cac40Ytd}  note="3" />
      <PerfRow label={`Performance ${moisLabel} du CAC 40`} value={loading ? null : cac40Mois} />

      {/* Notes */}
      <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "3px" }}>
        {[
          ["1", "Calculée depuis le 1er snapshot disponible de l'année"],
          ["2", "Calculée depuis le 1er snapshot disponible du mois"],
          ["3", "Source : Yahoo Finance · CAC 40 (^FCHI)"],
        ].map(([n, txt]) => (
          <div key={n} style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", lineHeight: "1.4" }}>
            <sup>{n}</sup> {txt}
          </div>
        ))}
      </div>
    </div>
  );
}
