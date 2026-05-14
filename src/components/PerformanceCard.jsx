import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { sanitizePositions, fmtPct } from "../lib/finance";
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

function PerfRow({ label, value, note }) {
  const color = perfColor(value);
  const formatted = value === null ? "—" : (value >= 0 ? "+" : "") + value.toFixed(2) + " %";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
      <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.85)", fontWeight: "600", lineHeight: "1.35" }}>
        {label}{note && <sup style={{ fontSize: "9px", opacity: 0.6, marginLeft: "2px" }}>{note}</sup>}
      </span>
      <span style={{ fontSize: "14px", fontWeight: "800", color, minWidth: "80px", textAlign: "right" }}>
        {formatted}
      </span>
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

  const perfYtd    = perf(snapYtd);
  const perfMois   = perf(snapMois);
  const perfVeille = perf(snapVeille);

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

      <PerfRow label={`Ma performance ${yyyy}`}      value={perfYtd}    note="1" />
      <PerfRow label={`Ma performance ${moisLabel}`} value={perfMois}   note="2" />
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
