import { useState } from "react";
import { C, shadow } from "../constants/theme";
import { fmtEur, fmtCours } from "../lib/finance";
import { load, save } from "../lib/storage";

export const CAPTURES_KEY = "bourse_captures";

// ─── Captures ─────────────────────────────────────────────────────────────────

export function makeCapture(positions, account) {
  const ts      = new Date();
  const dateStr = ts.toISOString().slice(0, 10);
  const timeStr = ts.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const rows    = positions.map(p => {
    const cours  = p.dernierCours || p.pru;
    const valeur = cours * p.quantite;
    const pru    = p.pru;
    const pvEur  = (cours - pru) * p.quantite;
    const pvPct  = pru > 0 ? ((cours / pru) - 1) * 100 : 0;
    return { nom: p.nom, isin: p.isin || "", ticker: p.ticker || "", quantite: p.quantite, pru, cours, valeur, pvEur, pvPct: +pvPct.toFixed(2), secteur: p.secteur || "" };
  });
  const totalActuel  = rows.reduce((s, r) => s + r.valeur, 0);
  const totalInvesti = rows.reduce((s, r) => s + r.pru * r.quantite, 0);
  return {
    id: ts.getTime(),
    label: `${dateStr} ${timeStr}`,
    date: dateStr,
    time: timeStr,
    timestamp: ts.toISOString(),
    account,
    positions: rows,
    summary: {
      nbPositions: rows.length,
      totalActuel: +totalActuel.toFixed(2),
      totalInvesti: +totalInvesti.toFixed(2),
      totalPV: +(totalActuel - totalInvesti).toFixed(2),
      totalPVpct: totalInvesti > 0 ? +((totalActuel - totalInvesti) / totalInvesti * 100).toFixed(2) : 0,
    },
  };
}

export function downloadCapture(capture, format = "json") {
  const slug = `capture_${capture.account}_${capture.date}_${capture.time.replace(":", "h")}`;
  if (format === "json") {
    const blob = new Blob([JSON.stringify(capture, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `${slug}.json` });
    a.click(); URL.revokeObjectURL(url);
  } else {
    const header = "Nom;ISIN;Ticker;Quantité;PRU (€);Cours (€);Valeur (€);P/V (€);P/V (%);Secteur\n";
    const rows   = capture.positions.map(r =>
      [r.nom, r.isin, r.ticker, r.quantite, r.pru, r.cours, r.valeur, r.pvEur.toFixed(2), r.pvPct, r.secteur].join(";")
    ).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `${slug}.csv` });
    a.click(); URL.revokeObjectURL(url);
  }
}

function CapturesPanel({ account }) {
  const [captures, setCaptures] = useState(() => load(CAPTURES_KEY, []));
  const [expanded, setExpanded] = useState(null);

  const accountCaptures = captures.filter(c => c.account === account);

  const deleteCapture = (id) => {
    const next = captures.filter(c => c.id !== id);
    save(CAPTURES_KEY, next);
    setCaptures(next);
    if (expanded === id) setExpanded(null);
  };
  const clearAll = () => { save(CAPTURES_KEY, captures.filter(c => c.account !== account)); setCaptures(captures.filter(c => c.account !== account)); setExpanded(null); };

  if (accountCaptures.length === 0) return (
    <div style={{ background: C.snowOff, border: `1px dashed ${C.border}`, borderRadius: "12px", padding: "28px 20px", textAlign: "center", marginBottom: "20px" }}>
      <div style={{ fontSize: "28px", marginBottom: "10px", opacity: 0.35 }}>📂</div>
      <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink, marginBottom: "4px" }}>Aucune capture</div>
      <div style={{ fontSize: "11px", color: C.inkMuted }}>Cliquez sur <strong>📸 Capturer</strong> pour enregistrer l'état du portefeuille à l'instant T.</div>
    </div>
  );

  return (
    <div style={{ marginBottom: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ fontSize: "11px", fontWeight: "700", color: C.ink, letterSpacing: "0.5px" }}>
          📂 Captures — {account}
          <span style={{ marginLeft: "8px", fontSize: "10px", fontWeight: "600", color: C.inkSubtle, background: C.snowOff, borderRadius: "5px", padding: "1px 7px" }}>{accountCaptures.length}</span>
        </div>
        <button onClick={clearAll} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "4px 10px", fontSize: "10px", color: C.inkSubtle, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          Tout supprimer
        </button>
      </div>

      {/* Liste */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {[...accountCaptures].reverse().map(cap => {
          const isOpen  = expanded === cap.id;
          const pv      = cap.summary.totalPV;
          const pvPct   = cap.summary.totalPVpct;
          const pvColor = pv >= 0 ? C.green : C.red;
          return (
            <div key={cap.id} style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", overflow: "hidden", boxShadow: shadow.card }}>
              {/* Row */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : cap.id)}>
                <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "16px" }}>📸</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{cap.label}</div>
                  <div style={{ fontSize: "10px", color: C.inkSubtle }}>{cap.summary.nbPositions} position{cap.summary.nbPositions > 1 ? "s" : ""}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: "800", color: C.ink }}>{fmtEur(cap.summary.totalActuel)}</div>
                  <div style={{ fontSize: "10px", fontWeight: "700", color: pvColor }}>{pv >= 0 ? "+" : ""}{fmtEur(pv)} ({pvPct >= 0 ? "+" : ""}{pvPct}%)</div>
                </div>
                <span style={{ fontSize: "10px", color: C.inkSubtle, marginLeft: "4px" }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* Détail déroulant */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: "6px", padding: "10px 14px", background: C.snowOff, flexWrap: "wrap" }}>
                    <button onClick={() => downloadCapture(cap, "json")}
                      style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "7px", padding: "6px 12px", fontSize: "11px", fontWeight: "700", color: C.navy, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                      ↓ JSON
                    </button>
                    <button onClick={() => downloadCapture(cap, "csv")}
                      style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.15)`, borderRadius: "7px", padding: "6px 12px", fontSize: "11px", fontWeight: "700", color: C.green, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                      ↓ CSV
                    </button>
                    <button onClick={() => deleteCapture(cap.id)}
                      style={{ marginLeft: "auto", background: "none", border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "7px", padding: "6px 12px", fontSize: "11px", fontWeight: "700", color: C.red, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                      Supprimer
                    </button>
                  </div>

                  {/* Table positions */}
                  <div className="ba-tbl-scroll" style={{ overflowX: "auto" }}>
                    <div style={{ minWidth: "480px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 70px 80px 80px 70px", padding: "7px 14px", background: C.snowOff, borderBottom: `1px solid ${C.border}` }}>
                        {["Valeur","Qté","PRU","Cours","Valoris.","P/V %"].map(h => (
                          <div key={h} style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h}</div>
                        ))}
                      </div>
                      {cap.positions.map((r, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 70px 70px 80px 80px 70px", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{r.nom}</div>
                            {r.isin && <div style={{ fontSize: "9px", color: C.inkSubtle, fontFamily: "monospace" }}>{r.isin}</div>}
                          </div>
                          <div style={{ fontSize: "11px", color: C.inkMuted }}>{r.quantite}</div>
                          <div style={{ fontSize: "11px", color: C.inkMuted }}>{fmtCours(r.pru)}</div>
                          <div style={{ fontSize: "11px", color: C.navy, fontWeight: "600" }}>{fmtCours(r.cours)}</div>
                          <div style={{ fontSize: "11px", fontWeight: "700", color: C.ink }}>{fmtEur(r.valeur)}</div>
                          <div style={{ fontSize: "11px", fontWeight: "700", color: r.pvPct >= 0 ? C.green : C.red }}>{r.pvPct >= 0 ? "+" : ""}{r.pvPct}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


export default CapturesPanel;
