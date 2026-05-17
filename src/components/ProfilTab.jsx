import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { load, save } from "../lib/storage";
import { fmtEur } from "../lib/finance";

// ─── API Keys Section (réutilisée dans Paramètres) ────────────────────────────
export function ApiKeysSection() {
  const stored = () => { try { return JSON.parse(localStorage.getItem("bourse_api_keys") || "{}"); } catch { return {}; } };
  const [keys, setKeys]   = useState(stored);
  const [show, setShow]   = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem("bourse_api_keys", JSON.stringify(keys));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const inp = { width: "100%", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "10px 14px", color: C.ink, fontSize: "12px", fontFamily: "monospace", outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px", display: "block" };
  const hasKeys = keys.anthropic || keys.google;

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "18px", padding: "18px 20px", boxShadow: shadow.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setShow(s => !s)}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>🔑 Clés API</div>
          <div style={{ fontSize: "11px", color: C.inkMuted, marginTop: "2px" }}>
            {hasKeys ? "Configurées · stockées localement" : "Non configurées · fonctions IA désactivées"}
          </div>
        </div>
        <span style={{ fontSize: "12px", color: C.inkSubtle }}>{show ? "▲" : "▼"}</span>
      </div>
      {show && (
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "14px", padding: "12px 16px", fontSize: "11px", color: C.navy, lineHeight: "1.6" }}>
            Clés stockées <strong>uniquement dans votre navigateur</strong> (localStorage).
          </div>
          <div><label style={lbl}>Clé Anthropic (Claude IA) — <a href="https://console.anthropic.com/account/keys" target="_blank" rel="noreferrer" style={{ color: C.navy }}>console.anthropic.com</a></label>
            <input style={inp} type="password" placeholder="sk-ant-api03-…" value={keys.anthropic || ""} onChange={e => setKeys(k => ({ ...k, anthropic: e.target.value }))} autoComplete="off" spellCheck="false" /></div>
          <div><label style={lbl}>Clé Google Custom Search — <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ color: C.navy }}>console.cloud.google.com</a></label>
            <input style={inp} type="password" placeholder="AIzaSy…" value={keys.google || ""} onChange={e => setKeys(k => ({ ...k, google: e.target.value }))} autoComplete="off" spellCheck="false" /></div>
          <div><label style={lbl}>Google CX (Search Engine ID)</label>
            <input style={inp} type="text" placeholder="707b30d5e62e…" value={keys.cx || ""} onChange={e => setKeys(k => ({ ...k, cx: e.target.value }))} autoComplete="off" spellCheck="false" /></div>
          <div><label style={lbl}>Clé Financial Modeling Prep (cours & historique ISIN) — <a href="https://financialmodelingprep.com/developer/docs" target="_blank" rel="noreferrer" style={{ color: C.navy }}>financialmodelingprep.com</a></label>
            <input style={inp} type="password" placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value={keys.fmp || ""} onChange={e => setKeys(k => ({ ...k, fmp: e.target.value }))} autoComplete="off" spellCheck="false" /></div>
          <div><label style={lbl}>Clé Alpha Vantage (fallback) — <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noreferrer" style={{ color: C.navy }}>alphavantage.co</a></label>
            <input style={inp} type="password" placeholder="AREI4UOU…" value={keys.alphavantage || ""} onChange={e => setKeys(k => ({ ...k, alphavantage: e.target.value }))} autoComplete="off" spellCheck="false" /></div>
          <button onClick={handleSave} style={{ background: saved ? C.greenLight : C.navy, border: saved ? `1px solid rgba(5,150,105,0.2)` : "none", borderRadius: "12px", padding: "12px", color: saved ? C.green : "#fff", fontSize: "12px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer" }}>
            {saved ? "✓ Clés sauvegardées" : "Sauvegarder les clés"}
          </button>
          {hasKeys && (
            <button onClick={() => { localStorage.removeItem("bourse_api_keys"); setKeys({}); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "12px", padding: "9px", color: C.inkMuted, fontSize: "11px", fontFamily: "Inter,sans-serif", cursor: "pointer" }}>
              Effacer les clés
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dates ouverture comptes (réutilisée dans Profil) ─────────────────────────
export function AccountDatesSection() {
  const [peaDate, setPeaDate] = useState(() => load("bourse_pea_ouverture", ""));
  const [ctoDate, setCtoDate] = useState(() => load("bourse_cto_ouverture", ""));
  const [saved, setSaved]     = useState(false);

  const handleSave = () => {
    if (peaDate) save("bourse_pea_ouverture", peaDate);
    else try { localStorage.removeItem("bourse_pea_ouverture"); } catch {}
    if (ctoDate) save("bourse_cto_ouverture", ctoDate);
    else try { localStorage.removeItem("bourse_cto_ouverture"); } catch {}
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const agePEA = peaDate ? ((Date.now() - new Date(peaDate).getTime()) / (1000*60*60*24*365)).toFixed(1) : null;
  const ageCTO = ctoDate ? ((Date.now() - new Date(ctoDate).getTime()) / (1000*60*60*24*365)).toFixed(1) : null;
  const inp = { width: "100%", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "10px 14px", color: C.ink, fontSize: "13px", fontFamily: "Inter,sans-serif", outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  return (
    <div>
      <div style={{ fontSize: "13px", fontWeight: "700", color: C.navy, marginBottom: "14px" }}>Dates d'ouverture des comptes</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <div>
          <label style={lbl}>Ouverture PEA</label>
          <input style={inp} type="date" value={peaDate} onChange={e => setPeaDate(e.target.value)} />
          {agePEA && (
            <div style={{ fontSize: "10px", marginTop: "5px", color: Number(agePEA) >= 5 ? C.green : C.goldDark, fontWeight: "600" }}>
              {Number(agePEA) >= 5 ? `✓ ${agePEA} ans — exonération IR` : `⚠ ${agePEA} ans — flat tax 30%`}
            </div>
          )}
        </div>
        <div>
          <label style={lbl}>Ouverture CTO</label>
          <input style={inp} type="date" value={ctoDate} onChange={e => setCtoDate(e.target.value)} />
          {ageCTO && <div style={{ fontSize: "10px", marginTop: "5px", color: C.inkSubtle }}>{ageCTO} ans — flat tax 30%</div>}
        </div>
      </div>
      <button onClick={handleSave} style={{ padding: "8px 18px", borderRadius: "10px", border: saved ? `1px solid rgba(5,150,105,0.25)` : `1px solid ${C.border}`, background: saved ? C.greenLight : C.snowOff, color: saved ? C.green : C.inkMuted, fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
        {saved ? "✓ Dates enregistrées" : "Enregistrer les dates"}
      </button>
    </div>
  );
}

// ─── Section wrapper (défini HORS du composant pour éviter remount à chaque rendu) ───
function ProfilSection({ title, children }) {
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "20px", marginBottom: "20px" }}>
      {title && <div style={{ fontSize: "12px", fontWeight: "700", color: C.navy, marginBottom: "16px" }}>{title}</div>}
      {children}
    </div>
  );
}

const INP_STYLE = { width: "100%", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "12px 16px", color: C.ink, fontSize: "14px", fontFamily: "Inter,sans-serif", outline: "none", boxSizing: "border-box", fontWeight: "500" };
const LBL_STYLE = { fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px", display: "block" };

// ─── Profil Tab ───────────────────────────────────────────────────────────────
function ProfilTab({ profil, onChange }) {
  const [form, setForm]   = useState(profil || {});
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const p = {
      ...form,
      dcaMensuel:    parseFloat(String(form.dcaMensuel    || "0").replace(",", ".")) || 0,
      dcaDuree:      parseInt(String(form.dcaDuree))      || 12,
      especesPEA:    parseFloat(String(form.especesPEA    || "0").replace(",", ".")) || 0,
      especesCTO:    parseFloat(String(form.especesCTO    || "0").replace(",", ".")) || 0,
      objectifEuros:  parseFloat(String(form.objectifEuros  || "0").replace(",", ".")) || 0,
      versementsPEA:  parseFloat(String(form.versementsPEA  || "0").replace(",", ".")) || 0,
      versementsCTO:  parseFloat(String(form.versementsCTO  || "0").replace(",", ".")) || 0,
      valeurJan1:     parseFloat(String(form.valeurJan1  || "0").replace(",", ".")) || 0,
      valeurMois1:    parseFloat(String(form.valeurMois1 || "0").replace(",", ".")) || 0,
    };
    onChange(p); save("bourse_profil", p);
    // Sauvegarder la baseline de projection si objectif défini et pas encore de ref
    if (p.objectifEuros > 0) {
      const existingRef = (() => { try { return JSON.parse(localStorage.getItem("bourse_projection_ref") || "null"); } catch { return null; } })();
      if (!existingRef) {
        const positions = (() => { try { return JSON.parse(localStorage.getItem("bourse_portfolio") || "[]"); } catch { return []; } })();
        const valeur = positions.reduce((s, pos) => s + (pos.dernierCours || pos.pru || 0) * (pos.quantite || 0), 0);
        if (valeur > 0) {
          const horizonAns = { court: 2, moyen: 4, long: 8, "tres-long": 15 }[p.horizon] || 8;
          localStorage.setItem("bourse_projection_ref", JSON.stringify({
            date: new Date().toISOString().slice(0, 10),
            valeur, dcaMensuel: p.dcaMensuel || 0,
            objectif: p.objectifEuros, horizonAns,
          }));
        }
      }
    }
    setSaved(true); setTimeout(() => setSaved(false), 2200);
  };

  const inp    = INP_STYLE;
  const lbl    = LBL_STYLE;
  const Section = ProfilSection;
  const optBtn = (active) => ({ flex: 1, padding: "11px 8px", background: active ? C.paleBlue : C.snowOff, border: active ? `1px solid rgba(30,58,95,0.12)` : `1px solid ${C.border}`, borderRadius: "12px", color: active ? C.navy : C.inkMuted, fontSize: "12px", fontFamily: "Inter,sans-serif", cursor: "pointer", textAlign: "center", fontWeight: active ? "700" : "400" });

  return (
    <div>
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ background: C.cardGradPurp, border: `1px solid ${C.border}`, borderRadius: "22px", padding: "28px", boxShadow: shadow.card }}>
          <div style={{ fontSize: "13px", color: C.ink, fontWeight: "800", marginBottom: "22px" }}>Mon profil investisseur</div>

          {/* Année de naissance */}
          <div style={{ marginBottom: "22px" }}>
            <label style={lbl}>Année de naissance</label>
            <input style={{ ...inp, fontSize: "13px" }} type="number" min="1940" max={new Date().getFullYear() - 10}
              placeholder="ex : 1997" value={form.anneeNaissance || ""}
              onChange={e => setForm(f => ({ ...f, anneeNaissance: e.target.value }))} />
            {form.anneeNaissance && (() => {
              const age = new Date().getFullYear() - parseInt(form.anneeNaissance);
              const retrait = 65 - age;
              return <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px" }}>
                {age} ans · retraite dans <strong style={{ color: C.navy }}>{retrait} ans</strong> (65 ans)
              </div>;
            })()}
          </div>

          {/* Courtier */}
          <div style={{ marginBottom: "22px" }}>
            <label style={lbl}>Courtier</label>
            <select value={form.courtier || "boursobank"} onChange={e => setForm(f => ({ ...f, courtier: e.target.value }))}
              style={{ ...inp, fontSize: "13px" }}>
              <option value="boursobank">Boursobank</option>
              <option value="degiro">DEGIRO</option>
              <option value="fortuneo">Fortuneo</option>
              <option value="saxo">Saxo Banque</option>
              <option value="bourse_direct">Bourse Direct</option>
              <option value="interactive_brokers">Interactive Brokers</option>
              <option value="autre">Autre</option>
            </select>
          </div>

          {/* Horizon */}
          <div style={{ marginBottom: "22px" }}>
            <label style={lbl}>Horizon d'investissement</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {[["court", "Court", "< 2 ans", 24], ["moyen", "Moyen", "2–5 ans", 48], ["long", "Long", "5–10 ans", 96], ["tres-long", "Très long", "> 10 ans", 180]].map(([v, l, sub, mois]) => (
                <button key={v} style={optBtn(form.horizon === v)} onClick={() => setForm(f => ({ ...f, horizon: v, dcaDuree: mois }))}>
                  <div style={{ fontWeight: "700" }}>{l}</div>
                  <div style={{ fontSize: "10px", opacity: 0.6, marginTop: "3px" }}>{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Risque */}
          <div style={{ marginBottom: "4px" }}>
            <label style={lbl}>Tolérance au risque</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {[["prudent", "Prudent", "5%/ligne"], ["equilibre", "Équilibré", "10%/ligne"], ["dynamique", "Dynamique", "15%/ligne"], ["tres-dynamique", "Très dyn.", "20%/ligne"]].map(([v, l, sub]) => (
                <button key={v} style={optBtn(form.risque === v)} onClick={() => setForm(f => ({ ...f, risque: v }))}>
                  <div style={{ fontWeight: "700" }}>{l}</div>
                  <div style={{ fontSize: "10px", opacity: 0.6, marginTop: "3px" }}>{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Capital + DCA */}
          <Section title="Comptes & DCA">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={lbl}>DCA mensuel initial (€)</label>
                <input style={inp} type="number" min="0" placeholder="0" value={form.dcaMensuel || ""} onChange={e => setForm(f => ({ ...f, dcaMensuel: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Durée DCA (mois)</label>
                <input style={inp} type="number" min="1" max="480" placeholder="120" value={form.dcaDuree || ""} onChange={e => {
                  const mois = parseInt(e.target.value) || 0;
                  const horizon = mois <= 24 ? "court" : mois <= 48 ? "moyen" : mois <= 96 ? "long" : "tres-long";
                  setForm(f => ({ ...f, dcaDuree: e.target.value, horizon }));
                }} />
              </div>
            </div>
            {/* Revalorisation DCA */}
            <div style={{ background: C.snowOff, borderRadius: "12px", padding: "12px 14px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>Revalorisation du DCA (optionnel)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={lbl}>Augmentation (€)</label>
                  <input style={inp} type="number" min="0" step="10" placeholder="ex : 50"
                    value={form.dcaCroissanceMontant || ""}
                    onChange={e => setForm(f => ({ ...f, dcaCroissanceMontant: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Tous les N ans</label>
                  <input style={inp} type="number" min="1" max="10" step="1" placeholder="ex : 2"
                    value={form.dcaCroissancePeriode || ""}
                    onChange={e => setForm(f => ({ ...f, dcaCroissancePeriode: e.target.value }))} />
                </div>
              </div>
              {form.dcaCroissanceMontant > 0 && form.dcaCroissancePeriode > 0 && (() => {
                const dca0 = parseFloat(form.dcaMensuel) || 0;
                const aug  = parseFloat(form.dcaCroissanceMontant);
                const per  = parseFloat(form.dcaCroissancePeriode);
                return <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "8px" }}>
                  Ex : {dca0}€ → {dca0 + aug}€ après {per} ans → {dca0 + aug*2}€ après {per*2} ans…
                </div>;
              })()}
            </div>
          </Section>

          {/* Objectif patrimonial */}
          <Section title="Objectif patrimonial (facultatif)">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={lbl}>Objectif à atteindre (€)</label>
                <input style={inp} type="number" min="0" placeholder="Ex : 50 000" value={form.objectifEuros || ""} onChange={e => setForm(f => ({ ...f, objectifEuros: e.target.value }))} />
                <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px" }}>Valeur cible à l'horizon choisi</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "8px 12px", background: C.snowOff, borderRadius: "14px", border: `1px solid ${C.border}` }}>
                {(() => {
                  const obj = parseFloat(form.objectifEuros);
                  const horizonAns = { court: 2, moyen: 4, long: 8, "tres-long": 15 }[form.horizon] || 8;
                  const dca = parseFloat(form.dcaMensuel) || 0;
                  // Même logique que MarcheTab : répartition ETF/SC selon risque × horizon
                  const repartMatrix = { prudent:{etfPct:90,scPct:10}, equilibre:{etfPct:70,scPct:30}, dynamique:{etfPct:50,scPct:50}, "tres-dynamique":{etfPct:30,scPct:70} };
                  const repart = repartMatrix[form.risque || "equilibre"] || repartMatrix.equilibre;
                  const cagrETF = { court: 6, moyen: 7, long: 8, "tres-long": 8 }[form.horizon || "moyen"] ?? 7;
                  const cagrSC  = { court: 8, moyen: 11, long: 14, "tres-long": 15 }[form.horizon || "moyen"] ?? 11;
                  const dcaCagr = Math.round(cagrETF * repart.etfPct/100 + cagrSC * repart.scPct/100);
                  // Valeur actuelle du portefeuille depuis localStorage
                  const allPos = (() => { try { return JSON.parse(localStorage.getItem("bourse_portfolio") || "[]"); } catch { return []; } })();
                  const valActuelle = allPos.reduce((s, p) => s + (parseFloat(p.dernierCours || p.pru) || 0) * (parseFloat(p.quantite) || 0), 0);
                  if (!obj) return <div style={{ fontSize: "11px", color: C.inkSubtle }}>Saisissez un objectif pour voir le CAGR requis</div>;
                  // Recherche dichotomique du CAGR qui atteint l'objectif avec DCA
                  // Projection avec DCA au CAGR profil, recherche CAGR positions requis
                  const rDCA = dcaCagr / 100 / 12, nMois = horizonAns * 12;
                  const dcaFV = dca > 0 && rDCA > 0 ? dca * ((Math.pow(1 + rDCA, nMois) - 1) / rDCA) : dca * nMois;
                  const ciblePositions = Math.max(0, obj - dcaFV);
                  let lo = 0, hi = 50, cagrReq = 10;
                  for (let i = 0; i < 40; i++) {
                    const r = (lo + hi) / 2 / 100;
                    const proj = valActuelle * Math.pow(1 + r, horizonAns);
                    if (proj < ciblePositions) lo = (lo + hi) / 2; else hi = (lo + hi) / 2;
                    cagrReq = (lo + hi) / 2;
                  }
                  const projSansDCA = valActuelle * Math.pow(1 + cagrReq/100, horizonAns);
                  return <>
                    <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>CAGR requis{dca > 0 ? " (avec DCA)" : ""}</div>
                    <div style={{ fontSize: "20px", fontWeight: "900", color: cagrReq > 15 ? C.red : cagrReq > 8 ? C.gold : C.green }}>+{cagrReq.toFixed(1)}%/an</div>
                    <div style={{ fontSize: "10px", color: C.inkSubtle }}>
                      sur {horizonAns} ans{dca > 0 ? ` + DCA ${fmtEur(dca)}/mois` : ""} pour {fmtEur(obj)}
                    </div>
                    {dca > 0 && <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px" }}>
                      DCA pondéré ~{dcaCagr}%/an ({repart.etfPct}% ETF ~{cagrETF}% + {repart.scPct}% SC ~{cagrSC}%)
                    </div>}
                  </>;
                })()}
              </div>
            </div>
          </Section>

          {/* Référence performance */}
          <Section title={`Référence performance ${new Date().getFullYear()}`}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={lbl}>Valeur au 1er janvier {new Date().getFullYear()} (€)</label>
                <input style={inp} type="number" min="0" placeholder="Ex : 2 889" value={form.valeurJan1 || ""} onChange={e => setForm(f => ({ ...f, valeurJan1: e.target.value }))} />
                <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px" }}>Pour le calcul YTD — visible sur Boursorama au 1er jan</div>
              </div>
              <div>
                <label style={lbl}>Valeur au 1er {new Date().toLocaleDateString("fr-FR", { month: "long" })} (€)</label>
                <input style={inp} type="number" min="0" placeholder="Ex : 3 330" value={form.valeurMois1 || ""} onChange={e => setForm(f => ({ ...f, valeurMois1: e.target.value }))} />
                <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px" }}>Pour la perf mensuelle — à mettre à jour chaque 1er du mois</div>
              </div>
            </div>
          </Section>

          {/* Liquidités */}
          <Section title="Liquidités disponibles">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={lbl}>Espèces disponibles PEA (€)</label>
                <input style={inp} type="number" min="0" placeholder="0" value={form.especesPEA || ""} onChange={e => setForm(f => ({ ...f, especesPEA: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Espèces disponibles CTO (€)</label>
                <input style={inp} type="number" min="0" placeholder="0" value={form.especesCTO || ""} onChange={e => setForm(f => ({ ...f, especesCTO: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Cumul des versements PEA (€)</label>
                <input style={inp} type="number" min="0" placeholder="Ex : 2 800" value={form.versementsPEA || ""} onChange={e => setForm(f => ({ ...f, versementsPEA: e.target.value }))} />
                <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px" }}>Total déposé depuis ton compte bancaire (plafond 150 000 €)</div>
              </div>
              <div>
                <label style={lbl}>Cumul des versements CTO (€)</label>
                <input style={inp} type="number" min="0" placeholder="0" value={form.versementsCTO || ""} onChange={e => setForm(f => ({ ...f, versementsCTO: e.target.value }))} />
              </div>
            </div>
          </Section>

          {/* Dates */}
          <Section title="">
            <AccountDatesSection />
          </Section>

          <button onClick={handleSave} style={{ width: "100%", background: saved ? C.greenLight : C.navy, border: saved ? `1px solid rgba(5,150,105,0.2)` : "none", borderRadius: "14px", padding: "14px", color: saved ? C.green : "#fff", fontSize: "13px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer", boxShadow: saved ? "none" : shadow.hover }}>
            {saved ? "✓ Enregistré" : "Enregistrer le profil"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Paramètres Tab ───────────────────────────────────────────────────────────
export const AI_CONFIG_KEY = "bourse_ai_config";
export const AI_EMOJI_KEY  = "bourse_ai_emoji";
export const AI_EMOJI_OPTIONS = [
  { label: "Hommes",  emojis: ["👨","👨🏻","👨🏼","👨🏽","👨🏾","👨🏿","👨‍💼","👨🏻‍💼","👨🏼‍💼","👨🏽‍💼","👨🏾‍💼","👨🏿‍💼","👨‍🏫","👨🏻‍🏫","👨🏼‍🏫","👨🏽‍🏫","👨🏾‍🏫","👨🏿‍🏫"] },
  { label: "Femmes",  emojis: ["👩","👩🏻","👩🏼","👩🏽","👩🏾","👩🏿","👩‍💼","👩🏻‍💼","👩🏼‍💼","👩🏽‍💼","👩🏾‍💼","👩🏿‍💼","👩‍🏫","👩🏻‍🏫","👩🏼‍🏫","👩🏽‍🏫","👩🏾‍🏫","👩🏿‍🏫"] },
  { label: "Neutres", emojis: ["🧑","🧑🏻","🧑🏼","🧑🏽","🧑🏾","🧑🏿","🧑‍💼","🧑🏻‍💼","🧑🏼‍💼","🧑🏽‍💼","🧑🏾‍💼","🧑🏿‍💼"] },
  { label: "Autres",  emojis: ["🤖","👾","🦾","🧠","🎓","💡","📊","🦅","🦁","🐺","🦊","⚡","🔮","🪄","💎","🏆","🎯","🚀","🌟","✨","🔥","💫","🦋","🐉","🦄","🧬","⚙️","🛡️","🎪","🌈"] },
];

export function ParametresTab({ profil, onChange }) {
  const [aiCfg, setAiCfg] = useState(() => { try { return JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || "{}"); } catch { return {}; } });
  const [aiEmoji, setAiEmoji] = useState(() => localStorage.getItem(AI_EMOJI_KEY) || "🤖");
  const [emojiCatIdx, setEmojiCatIdx] = useState(0);

  const saveAiCfg = (update) => {
    const next = { ...aiCfg, ...update };
    setAiCfg(next);
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(next));
  };
  const pickAiEmoji = (e) => { setAiEmoji(e); localStorage.setItem(AI_EMOJI_KEY, e); };

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* Clés API */}
      <ApiKeysSection />

      {/* Assistant IA */}
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "18px", padding: "20px 22px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "13px", fontWeight: "700", color: C.navy, marginBottom: "16px" }}>Personnaliser l'assistant IA</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", display: "block", marginBottom: "8px" }}>Avatar</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
              <span style={{ fontSize: "32px" }}>{aiEmoji}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                {AI_EMOJI_OPTIONS.map((cat, i) => (
                  <button key={i} onClick={() => setEmojiCatIdx(i)}
                    style={{ padding: "4px 10px", borderRadius: "8px", border: `1px solid ${emojiCatIdx === i ? C.navy : C.border}`, background: emojiCatIdx === i ? C.navyLight : C.snowOff, color: emojiCatIdx === i ? C.navy : C.inkMuted, fontSize: "11px", fontFamily: "Inter,sans-serif", fontWeight: "600", cursor: "pointer" }}>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {AI_EMOJI_OPTIONS[emojiCatIdx].emojis.map(e => (
                <button key={e} onClick={() => pickAiEmoji(e)}
                  style={{ width: "36px", height: "36px", borderRadius: "8px", border: aiEmoji === e ? `2px solid ${C.navy}` : `1px solid ${C.border}`, background: aiEmoji === e ? C.navyLight : C.snowOff, cursor: "pointer", fontSize: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", display: "block", marginBottom: "5px" }}>Nom de l'assistant</label>
            <input value={aiCfg.nom || ""} onChange={e => saveAiCfg({ nom: e.target.value })} placeholder="ex: Aria, Max, Léa…"
              style={{ width: "100%", fontSize: "13px", fontFamily: "Inter,sans-serif", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", background: C.snowOff, color: C.ink, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", display: "block", marginBottom: "5px" }}>Ton</label>
            <select value={aiCfg.ton || "pedagogique"} onChange={e => saveAiCfg({ ton: e.target.value })}
              style={{ width: "100%", fontSize: "13px", fontFamily: "Inter,sans-serif", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", background: C.snowOff, color: C.ink, outline: "none" }}>
              <option value="pedagogique">Pédagogique</option>
              <option value="professionnel">Direct et professionnel</option>
              <option value="conservateur">Prudent et conservateur</option>
              <option value="motivant">Motivant et positif</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", display: "block", marginBottom: "5px" }}>Longueur des réponses</label>
            <select value={aiCfg.longueur || "concis"} onChange={e => saveAiCfg({ longueur: e.target.value })}
              style={{ width: "100%", fontSize: "13px", fontFamily: "Inter,sans-serif", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", background: C.snowOff, color: C.ink, outline: "none" }}>
              <option value="concis">Concis (3-5 phrases)</option>
              <option value="detaille">Détaillé</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", display: "block", marginBottom: "5px" }}>Instructions personnalisées</label>
            <textarea value={aiCfg.instructions || ""} onChange={e => saveAiCfg({ instructions: e.target.value })}
              placeholder="ex: Je suis un investisseur prudent, privilégie les ETF…" rows={4}
              style={{ width: "100%", fontSize: "12px", fontFamily: "Inter,sans-serif", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", background: C.snowOff, color: C.ink, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
            <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px" }}>Injectées dans chaque conversation avec l'assistant.</div>
          </div>
          {(aiCfg.nom || aiCfg.instructions) && (
            <button onClick={() => saveAiCfg({ nom: "", ton: "pedagogique", longueur: "concis", instructions: "" })}
              style={{ alignSelf: "flex-start", background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "7px 14px", color: C.red, fontSize: "11px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer" }}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Sauvegarde */}
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "18px", padding: "20px 22px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "13px", fontWeight: "700", color: C.navy, marginBottom: "14px" }}>Sauvegarde des données</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => {
            const ks = ["bourse_portfolio","bourse_profil","bourse_avis_operes","bourse_market_scores","bourse_signal_history","bourse_port_result","bourse_last_import","bourse_dark"];
            const data = {}; ks.forEach(k => { const v = localStorage.getItem(k); if (v) data[k] = v; });
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `bourse-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
          }} style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "9px 16px", color: C.navy, fontSize: "12px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer" }}>
            ↓ Exporter JSON
          </button>
          <label style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 16px", color: C.inkMuted, fontSize: "12px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer" }}>
            ↑ Importer JSON
            <input type="file" accept=".json" style={{ display: "none" }} onChange={e => {
              const file = e.target.files?.[0]; if (!file) return;
              const r = new FileReader();
              r.onload = ev => { try { const data = JSON.parse(ev.target.result); Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v)); window.location.reload(); } catch { alert("Fichier invalide"); } };
              r.readAsText(file); e.target.value = "";
            }} />
          </label>
        </div>
        <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "8px" }}>
          Données stockées localement sur votre appareil uniquement.
        </div>
      </div>

      <div style={{ fontSize: "11px", color: C.inkSubtle, textAlign: "center", padding: "8px" }}>
        Ces données restent sur votre appareil.
      </div>
    </div>
  );
}

export default ProfilTab;
