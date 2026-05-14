import { useState } from "react";
import { C, shadow } from "../constants/theme";
import { fmtEur } from "../lib/finance";
import { save } from "../lib/storage";
import CompanyAvatar from "./CompanyAvatar";

// ─── Dividendes Card ─────────────────────────────────────────────────────────
const DIV_LOG_KEY = "bourse_dividendes_log";

function DividendesCard({ positions }) {
  const [log, setLog]         = useState(() => { try { return JSON.parse(localStorage.getItem(DIV_LOG_KEY) || "[]"); } catch { return []; } });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState({ date: new Date().toISOString().slice(0, 10), posId: "", montant: "" });

  const paying = positions.filter(p => p.dividendeAnnuel > 0);
  const totalAnnuelEstime = paying.reduce((s, p) => s + (p.dividendeAnnuel || 0) * p.quantite, 0);
  const totalInvesti      = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const rendementGlobal   = totalInvesti > 0 ? (totalAnnuelEstime / totalInvesti) * 100 : 0;
  const totalPercu        = log.reduce((s, e) => s + (parseFloat(e.montant) || 0), 0);

  const saveLog = (newLog) => { setLog(newLog); try { localStorage.setItem(DIV_LOG_KEY, JSON.stringify(newLog)); } catch {} };

  const addEntry = () => {
    const pos = positions.find(p => p.id === form.posId);
    if (!pos || !form.montant || !form.date) return;
    const entry = { id: Date.now(), date: form.date, posId: pos.id, nom: pos.nom, isin: pos.isin || "", montant: parseFloat(form.montant.replace(",", ".")) };
    saveLog([entry, ...log]);
    setShowForm(false);
    setForm({ date: new Date().toISOString().slice(0, 10), posId: "", montant: "" });
  };

  if (paying.length === 0 && log.length === 0) return null;

  const inp = { padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: "8px", fontSize: "12px", background: C.snow, color: C.ink, fontFamily: "Inter,sans-serif", outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "22px", overflow: "hidden", boxShadow: shadow.card, marginBottom: "20px" }}>
      {/* Header */}
      <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.greenLight }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="5.5" y1="7" x2="10.5" y2="7"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>Dividendes</div>
            <div style={{ fontSize: "10px", color: C.inkMuted }}>Revenus estimés · historique des versements</div>
          </div>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          style={{ fontSize: "11px", fontWeight: "700", color: C.green, background: "white", border: `1px solid ${C.green}40`, borderRadius: "8px", padding: "5px 12px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
          + Ajouter
        </button>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: `1px solid ${C.border}` }}>
        {[
          { label: "Revenu annuel estimé", value: fmtEur(totalAnnuelEstime), color: C.green },
          { label: "Rendement global", value: rendementGlobal.toFixed(2) + " %", color: C.navy },
          { label: "Total perçu (log)", value: fmtEur(totalPercu), color: C.goldDark },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: "14px 18px", borderRight: `1px solid ${C.border}`, textAlign: "center" }}>
            <div style={{ fontSize: "16px", fontWeight: "800", color, fontFamily: "Inter,sans-serif" }}>{value}</div>
            <div style={{ fontSize: "10px", color: C.inkMuted, marginTop: "3px" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Formulaire ajout */}
      {showForm && (
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.snowOff, display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 100px" }}>
            <div style={{ fontSize: "10px", color: C.inkMuted, fontWeight: "600", marginBottom: "4px" }}>Date</div>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
          </div>
          <div style={{ flex: "2 1 160px" }}>
            <div style={{ fontSize: "10px", color: C.inkMuted, fontWeight: "600", marginBottom: "4px" }}>Valeur</div>
            <select value={form.posId} onChange={e => setForm(f => ({ ...f, posId: e.target.value }))} style={inp}>
              <option value="">— Choisir —</option>
              {positions.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 100px" }}>
            <div style={{ fontSize: "10px", color: C.inkMuted, fontWeight: "600", marginBottom: "4px" }}>Montant net (€)</div>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} style={inp} />
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={addEntry} style={{ padding: "7px 14px", borderRadius: "8px", background: C.green, color: "white", border: "none", fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>Enregistrer</button>
            <button onClick={() => setShowForm(false)} style={{ padding: "7px 14px", borderRadius: "8px", background: C.snowOff, color: C.inkMuted, border: `1px solid ${C.border}`, fontSize: "12px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Table positions versantes */}
      {paying.length > 0 && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "36px 2fr 1fr 1fr 1fr 1fr", padding: "8px 20px", background: C.snowOff, borderBottom: `1px solid ${C.border}` }}>
            {["", "Société", "Div./action", "Rdt sur PRU", "Rdt cours act.", "Total annuel est."].map((h, i) => (
              <div key={i} style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h}</div>
            ))}
          </div>
          {paying.map(p => {
            const cours = p.dernierCours || p.pru;
            const rdtPru    = p.pru > 0 && p.dividendeAnnuel ? (p.dividendeAnnuel / p.pru) * 100 : null;
            const rdtCours  = cours > 0 && p.dividendeAnnuel ? (p.dividendeAnnuel / cours) * 100 : null;
            const totalAn   = (p.dividendeAnnuel || 0) * p.quantite;
            return (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "36px 2fr 1fr 1fr 1fr 1fr", padding: "10px 20px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                <CompanyAvatar nom={p.nom} isin={p.isin} size={26} />
                <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink, fontFamily: "Inter,sans-serif" }}>{p.nom}</div>
                <div style={{ fontSize: "12px", color: C.ink, fontWeight: "600" }}>{p.dividendeAnnuel ? fmtEur(p.dividendeAnnuel) : "—"}</div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: rdtPru != null ? C.green : C.inkSubtle }}>{rdtPru != null ? rdtPru.toFixed(2) + " %" : "—"}</div>
                <div style={{ fontSize: "12px", color: C.inkMuted }}>{rdtCours != null ? rdtCours.toFixed(2) + " %" : "—"}</div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: C.green }}>{totalAn > 0 ? fmtEur(totalAn) : "—"}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Log des versements reçus */}
      {log.length > 0 && (
        <div>
          <div style={{ padding: "10px 20px 6px", fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", borderTop: `1px solid ${C.border}`, background: C.snowOff }}>Historique reçu</div>
          {log.slice(0, 8).map(e => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "10px", color: C.inkSubtle, minWidth: "72px" }}>{e.date}</span>
                <span style={{ fontSize: "12px", fontWeight: "600", color: C.ink, fontFamily: "Inter,sans-serif" }}>{e.nom}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: C.green }}>+{fmtEur(e.montant)}</span>
                <button onClick={() => saveLog(log.filter(x => x.id !== e.id))}
                  style={{ background: "none", border: "none", color: C.inkSubtle, cursor: "pointer", fontSize: "12px", padding: "0 2px", lineHeight: 1 }}>✕</button>
              </div>
            </div>
          ))}
          {log.length > 8 && (
            <div style={{ padding: "8px 20px", fontSize: "10px", color: C.inkSubtle, textAlign: "center" }}>+ {log.length - 8} entrées supplémentaires</div>
          )}
        </div>
      )}

      <div style={{ padding: "8px 20px", fontSize: "10px", color: C.inkSubtle, lineHeight: "1.6", borderTop: `1px solid ${C.border}` }}>
        Dividendes/action : source Yahoo Finance lors du rafraîchissement · Dans un PEA, les dividendes sont crédités sans retenue à la source française (hors withholding étranger).
      </div>
    </div>
  );
}


export default DividendesCard;
