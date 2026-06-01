import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { C, shadow } from "../constants/theme";
import { fmtEur, fmtPct, fmtCours, sanitizePositions, isETFName } from "../lib/finance";
import { load, save } from "../lib/storage";
import { fetchWithProxy, enqueueApi, callClaude } from "../lib/api";
import { BNextLabel } from "./UI";
import CompanyAvatar from "./CompanyAvatar";
import PortfolioPieChart from "./PortfolioPieChart";
import Tooltip from "./Tooltip";
import { UI, DEFAULT_POSITIONS } from "../constants/config";
import { AUTOPILOT_UNIVERSE } from "../constants/universe";
import { AVIS_PARSE_PROMPT } from "../constants/prompts";

// ─── Catégories et couleurs (miroir AutopilotIA) ───────────────────────────────
const ALLOC_CATS = [
  { key: "ETF Monde",        label: "ETF Monde",          color: "#1E3A5F" },
  { key: "ETF Sectoriel",    label: "ETF Sectoriel",      color: "#2563EB" },
  { key: "Tech / IA",        label: "Tech / IA",          color: "#7C3AED" },
  { key: "Semi-conducteurs", label: "Semi-conducteurs",   color: "#6D28D9" },
  { key: "Santé",            label: "Santé",              color: "#059669" },
  { key: "Industrie",        label: "Industrie / Déf.",   color: "#D97706" },
  { key: "Énergie",          label: "Énergie",            color: "#B45309" },
  { key: "Luxe",             label: "Luxe / Conso",       color: "#BE185D" },
  { key: "Finance",          label: "Finance",            color: "#0369A1" },
  { key: "Autres",           label: "Autres",             color: "#64748B" },
];
const SECTOR_TO_CAT = {
  "ETF Monde":"ETF Monde","ETF USA":"ETF Monde","ETF Europe":"ETF Monde",
  "ETF Émergents":"ETF Monde","ETF Obligataire":"ETF Monde","ETF Tech":"ETF Sectoriel",
  "Tech":"Tech / IA","Tech Services":"Tech / IA","Cloud":"Tech / IA","IA/Data":"Tech / IA",
  "Tech/IA":"Tech / IA","SaaS productivité":"Tech / IA","AdTech/IA":"Tech / IA",
  "Semi-conducteurs":"Semi-conducteurs","Semi-conducteurs/IA":"Semi-conducteurs",
  "Semi / IA infra":"Semi-conducteurs","Serveurs IA":"Semi-conducteurs",
  "Santé":"Santé","Biotech":"Santé","Biotech nano":"Santé","Santé numérique":"Santé",
  "IA / Drug discovery":"Santé","Santé animale":"Santé",
  "Industrie":"Industrie","Aéronautique":"Industrie","Infrastructure":"Industrie",
  "Transports":"Industrie","Défense":"Industrie","Espace":"Industrie",
  "Énergie":"Énergie","Hydrogène vert":"Énergie",
  "Luxe":"Luxe","Cosmétiques":"Luxe","Consommation":"Luxe",
  "Banque":"Finance","Assurance":"Finance","Financier":"Finance","Fintech":"Finance",
};
const ISIN_CAT_UNIVERSE = {};
[...AUTOPILOT_UNIVERSE.PEA, ...AUTOPILOT_UNIVERSE.CTO].forEach(i => {
  if (i.isin) ISIN_CAT_UNIVERSE[i.isin] = SECTOR_TO_CAT[i.secteur] || "Autres";
});
function getPosCat(p, cache = {}) {
  if (p.isin && ISIN_CAT_UNIVERSE[p.isin]) return ISIN_CAT_UNIVERSE[p.isin];
  if (p.isin && cache[p.isin])             return cache[p.isin];
  const fromSector = SECTOR_TO_CAT[p.secteur || ""];
  if (fromSector) return fromSector;
  const nom = (p.nom || "").toLowerCase();
  if (isETFName(p.nom)) {
    if (/monde|world|msci|acwi|s&p|sp500|nasdaq|europe|émergent/i.test(nom)) return "ETF Monde";
    return "ETF Sectoriel";
  }
  if (/technip|entech|solaire|éolien|hydrogène|haffner|énergie|energy|total|shell/i.test(nom)) return "Énergie";
  if (/smaio|sanofi|novartis|pfizer|medtech|implant|santé|health|pharma|biotech/i.test(nom)) return "Santé";
  if (/airbus|safran|thales|boeing/i.test(nom)) return "Industrie";
  if (/lvmh|hermès|kering|l.?oréal/i.test(nom)) return "Luxe";
  if (/bnp|société générale|axa|allianz/i.test(nom)) return "Finance";
  if (/nvidia|asml|stmicro/i.test(nom)) return "Semi-conducteurs";
  if (/microsoft|apple|google|meta|capgem/i.test(nom)) return "Tech / IA";
  return "Autres";
}

// ─── Tableau de répartition sectorielle ──────────────────────────────────────
function SecteurTable({ positions, account = "PEA" }) {
  const [hovered, setHovered] = useState(null);

  const isinCatCache = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("bourse_isin_cat_cache") || "{}"); } catch { return {}; }
  }, []);

  const allocCibles = useMemo(() => {
    try {
      const profil = JSON.parse(localStorage.getItem("bourse_profil") || "{}");
      const risque = profil.risque || "equilibre";
      const stored = localStorage.getItem(`bourse_autopilot_alloc_${account}_${risque}`);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  }, [account]);

  const totalVal = positions.reduce((s, p) => s + (p.dernierCours || p.pru || 0) * p.quantite, 0);

  const byCat = {};
  positions.forEach(p => {
    const cat = getPosCat(p, isinCatCache);
    if (!byCat[cat]) byCat[cat] = { valeur: 0, positions: [] };
    byCat[cat].valeur += (p.dernierCours || p.pru || 0) * p.quantite;
    byCat[cat].positions.push({ nom: p.nom, valeur: (p.dernierCours || p.pru || 0) * p.quantite, pru: p.pru, cours: p.dernierCours });
  });

  const hasTargets = allocCibles && Object.keys(allocCibles).length > 0;
  const rows = ALLOC_CATS;

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "18px 20px", boxShadow: shadow.card }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ fontSize: "11px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px" }}>
          Répartition analysée
        </div>
        {hasTargets && (
          <div style={{ fontSize: "10px", color: C.inkSubtle }}>actuel → <span style={{ fontWeight: "700" }}>cible</span></div>
        )}
      </div>

      {rows.map(cat => {
        const data    = byCat[cat.key];
        const valeur  = data?.valeur || 0;
        const cur     = totalVal > 0 && valeur > 0 ? Math.round(valeur / totalVal * 100) : 0;
        const tgt     = hasTargets ? Number(allocCibles[cat.key] || 0) : null;
        const gap     = tgt !== null ? tgt - cur : 0;
        const present = cur > 0;
        const posItems = data?.positions || [];
        const isHov   = hovered === cat.key;

        return (
          <div key={cat.key}
            onMouseEnter={() => setHovered(cat.key)}
            onMouseLeave={() => setHovered(null)}
            style={{ borderRadius: "10px", padding: "8px 10px", marginBottom: "2px", background: isHov ? cat.color + "0A" : "transparent", transition: "background 0.15s", cursor: "default", opacity: (present || tgt > 0) ? 1 : 0.4 }}>

            {/* Ligne principale */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "140px", display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: present ? cat.color : C.border, flexShrink: 0, transition: "transform 0.15s", transform: isHov ? "scale(1.3)" : "scale(1)" }} />
                <span style={{ fontSize: "12px", fontWeight: present ? "700" : "500", color: present ? C.ink : C.inkSubtle }}>{cat.label}</span>
              </div>

              <div style={{ flex: 1, height: "14px", background: C.snowOff, borderRadius: "4px", position: "relative" }}>
                {present && (
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, cur)}%`, background: cat.color + (isHov ? "88" : "55"), borderRadius: "4px", transition: "width 0.4s, background 0.15s" }} />
                )}
                {tgt > 0 && (
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, tgt)}%`, border: `1.5px solid ${cat.color}`, borderRadius: "4px", boxSizing: "border-box" }} />
                )}
                {!hasTargets && present && (
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${(cur / 100) * 100}%`, background: cat.color + (isHov ? "88" : "55"), borderRadius: "4px", transition: "width 0.4s" }} />
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0, minWidth: hasTargets ? "120px" : "60px", justifyContent: "flex-end" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: present ? C.ink : C.inkSubtle }}>{cur}%</span>
                {hasTargets && tgt !== null && (
                  <>
                    <span style={{ fontSize: "10px", color: C.inkSubtle }}>→</span>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: cat.color }}>{tgt}%</span>
                    {Math.abs(gap) > 2 && (
                      <span style={{ fontSize: "9px", fontWeight: "700", color: cat.color, background: cat.color + "18", borderRadius: "4px", padding: "1px 5px" }}>
                        {gap > 0 ? "↑" : "↓"}{Math.abs(gap)}%
                      </span>
                    )}
                  </>
                )}
                {present && !hasTargets && (
                  <span style={{ fontSize: "11px", color: C.inkSubtle, marginLeft: "4px" }}>{fmtEur(valeur)}</span>
                )}
              </div>
            </div>

            {/* Détail au survol */}
            {isHov && present && (
              <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: `1px solid ${cat.color}22`, display: "flex", flexDirection: "column", gap: "4px" }}>
                {posItems.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
                    <span style={{ color: C.inkMuted, fontWeight: "500" }}>↳ {p.nom}</span>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      {p.cours && <span style={{ color: C.inkSubtle }}>cours {fmtCours(p.cours)} €</span>}
                      <span style={{ fontWeight: "700", color: cat.color }}>{fmtEur(p.valeur)}</span>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>
                  Total : <strong style={{ marginLeft: "4px", color: C.ink }}>{fmtEur(valeur)}</strong>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: "11px", fontWeight: "700", color: C.inkMuted }}>{positions.length} position{positions.length > 1 ? "s" : ""}</span>
        <span style={{ fontSize: "13px", fontWeight: "800", color: C.ink }}>{fmtEur(totalVal)}</span>
      </div>
    </div>
  );
}

function PEAAvisOperes({ account = "PEA" }) {
  const [operations, setOperations] = useState(() => load("bourse_avis_operes", []));
  const [ui, setUi]                 = useState(UI.IDLE);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const [errors, setErrors]         = useState([]);
  const pdfRef = useRef(null);

  const extractPdfText = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.js`;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page  = await pdf.getPage(i);
      const items = await page.getTextContent();
      text += items.items.map(it => it.str).join(" ") + "\n";
    }
    return text;
  };

  const handlePdf = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUi(UI.LOADING);
    setProgress({ done: 0, total: files.length });
    setErrors([]);
    const newOps = [];
    const errs   = [];
    let   skipped = 0;
    // Snapshot des références existantes avant la boucle
    const existingRefs = new Set(
      (JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]"))
        .map(o => o.reference).filter(Boolean)
    );
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await extractPdfText(file);
        const data = await enqueueApi(() => callClaude(AVIS_PARSE_PROMPT, `Texte du document :\n\n${text.slice(0, 8000)}`, false, 4, false, 4000));
        const ops  = Array.isArray(data?.operations) ? data.operations : [];
        let addedFromFile = 0;
        ops.forEach((op, j) => {
          // Générer une référence de fallback si absente
          const ref = op.reference && op.reference.trim()
            ? op.reference.trim()
            : `${op.date}_${op.isin || op.titre}_${op.type}_${op.quantite}`;
          if (existingRefs.has(ref)) { skipped++; return; }
          existingRefs.add(ref);
          newOps.push({ ...op, reference: ref, id: Date.now() + i * 1000 + j, source: file.name, compte: account });
          addedFromFile++;
        });
        if (ops.length === 0) errs.push(`${file.name} : aucune opération détectée`);
        else if (addedFromFile === 0) errs.push(`${file.name} : déjà importé (${ops.length} doublon${ops.length > 1 ? "s" : ""})`);
      } catch (err) {
        errs.push(`${file.name} : ${err.message || "erreur"}`);
      }
      setProgress({ done: i + 1, total: files.length });
    }
    if (newOps.length > 0) {
      setOperations(prev => { const next = [...newOps, ...prev]; save("bourse_avis_operes", next); return next; });
    }
    if (skipped > 0 && newOps.length === 0) errs.unshift(`⚠ ${skipped} opération(s) ignorée(s) — déjà présentes`);
    setErrors(errs);
    setUi(newOps.length > 0 ? UI.RESULT : errs.length > 0 ? UI.ERROR : UI.IDLE);
    e.target.value = "";
  };

  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [avisPage, setAvisPage] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("TOUS");
  const AVIS_PAGE_SIZE = 10;

  const removeOp = (id) => setOperations(prev => { const next = prev.filter(o => o.id !== id); save("bourse_avis_operes", next); return next; });
  const clearAll = () => { setOperations(prev => { const next = prev.filter(o => (o.compte || "PEA") !== account); save("bourse_avis_operes", next); return next; }); setUi(UI.IDLE); };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const typeColor = (t) => t === "ACHAT" ? C.green : t === "VENTE" ? C.navy : t === "DIVIDENDE" ? C.goldDark : C.inkMuted;

  // Filtrer par compte courant + type + recherche
  const filteredOps = operations.filter(o => (o.compte || "PEA") === account);
  const q = search.trim().toLowerCase();
  const displayedOps = filteredOps.filter(o => {
    if (typeFilter !== "TOUS" && o.type !== typeFilter) return false;
    if (q && !o.titre?.toLowerCase().includes(q) && !o.isin?.toLowerCase().includes(q)) return false;
    return true;
  });

  // ── Calcul P&L réalisé par titre (chronologique) ─────────────────────────
  const computePnL = () => {
    const byTitre = {};
    const sorted  = [...filteredOps].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const typeOrder = { ACHAT: 0, DIVIDENDE: 1, VENTE: 2 };
      return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
    });
    for (const op of sorted) {
      const key = op.isin || op.titre;
      if (!byTitre[key]) byTitre[key] = { titre: op.titre, isin: op.isin, qte: 0, pru: 0, totalAchete: 0, realise: 0, dividendes: 0, fraisTotal: 0 };
      const e = byTitre[key];
      const qte   = parseFloat(op.quantite)    || 0;
      const prix  = parseFloat(op.prixUnitaire) || 0;
      const frais = parseFloat(op.frais)        || 0;
      e.fraisTotal += frais;
      if (op.type === "ACHAT") {
        const nouveauTotal = e.pru * e.qte + prix * qte + frais;
        e.qte            += qte;
        e.pru             = e.qte > 0 ? nouveauTotal / e.qte : 0;
        e.totalAchete    += prix * qte + frais;
      } else if (op.type === "VENTE") {
        const gain    = (prix - e.pru) * qte - frais;
        e.realise    += gain;
        e.qte        -= qte;
        if (e.qte < 0.001) e.qte = 0;
      } else if (op.type === "DIVIDENDE") {
        e.dividendes += prix * qte;
      }
    }
    return Object.values(byTitre);
  };
  const pnlParTitre = computePnL();

  // Enrichir chaque VENTE avec le P&L au moment de la vente
  const enrichOp = (op) => {
    if (op.type !== "VENTE") return null;
    const entry = pnlParTitre.find(e => (op.isin && e.isin === op.isin) || e.titre === op.titre);
    if (!entry) return null;
    const gain = (parseFloat(op.prixUnitaire) - entry.pru) * parseFloat(op.quantite) - parseFloat(op.frais || 0);
    return gain;
  };

  // Tri du tableau
  const sorted = [...displayedOps].sort((a, b) => {
    let va, vb;
    if (sortKey === "date") {
      va = `${a.date || ""}T${a.heure || "00:00:00"}`;
      vb = `${b.date || ""}T${b.heure || "00:00:00"}`;
    } else {
      va = a[sortKey] ?? ""; vb = b[sortKey] ?? "";
      if (sortKey === "prixUnitaire" || sortKey === "quantite" || sortKey === "frais") { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; }
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const thStyle = (key) => ({
    fontSize: "9px", fontWeight: "700", color: sortKey === key ? C.navy : C.inkSubtle,
    textTransform: "uppercase", letterSpacing: "0.8px", cursor: "pointer", userSelect: "none",
    whiteSpace: "nowrap",
  });
  const cols = "90px 60px 80px 1fr 110px 60px 80px 60px 90px 28px";

  return (
    <div style={{ marginTop: "28px" }}>
      <div style={{ fontSize: "11px", fontWeight: "800", color: C.ink, letterSpacing: "0.5px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
        Avis d'opérés
        <span style={{ position: "relative", display: "inline-flex" }} className="avis-tooltip-wrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.inkSubtle} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: "default", flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span className="avis-tooltip-box" style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: C.ink, color: "#fff", fontSize: "11px", fontWeight: "400", lineHeight: 1.6, borderRadius: "10px", padding: "10px 13px", width: "260px", pointerEvents: "none", opacity: 0, transition: "opacity 0.15s ease", zIndex: 100, boxShadow: "0 4px 16px rgba(0,0,0,0.18)", fontFamily: "'DM Sans', sans-serif" }}>
            Votre courtier vous envoie un avis d'opéré par e-mail après chaque transaction. Vous pouvez aussi le retrouver dans votre espace client, rubrique "Documents" ou "Historique des ordres".
          </span>
        </span>
        <style>{`.avis-tooltip-wrap:hover .avis-tooltip-box { opacity: 1 !important; }`}</style>
      </div>
      {(() => {
        const year = new Date().getFullYear();
        const divYear = filteredOps.filter(o => o.type === "DIVIDENDE" && o.date?.startsWith(String(year)));
        if (!divYear.length) return null;
        const total = divYear.reduce((s, o) => s + (parseFloat(o.montant) || parseFloat(o.prixUnitaire) * parseFloat(o.quantite) || 0), 0);
        if (!total) return null;
        return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: C.goldLight, border: "1px solid rgba(217,119,6,0.18)", borderRadius: "8px", padding: "7px 14px", marginBottom: "12px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.goldDark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontSize: "12px", fontWeight: "700", color: C.goldDark }}>Dividendes {year} : +{total.toFixed(2)} €</span>
            <span style={{ fontSize: "10px", color: C.goldDark, opacity: 0.7 }}>({divYear.length} versement{divYear.length > 1 ? "s" : ""})</span>
          </div>
        );
      })()}

      {/* Import PDF */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
        <input ref={pdfRef} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={handlePdf} />
        <button onClick={() => pdfRef.current?.click()} disabled={ui === UI.LOADING}
          style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "8px", padding: "9px 16px", color: C.goldDark, fontSize: "12px", fontFamily: "'DM Sans', sans-serif", fontWeight: "700", cursor: ui === UI.LOADING ? "not-allowed" : "pointer" }}>
          {ui === UI.LOADING ? <span style={{ display:"inline-flex", alignItems:"center", fontSize:"13px" }}><BNextLabel /></span> : "↑ Importer des avis PDF"}
        </button>
        {ui === UI.RESULT && <span style={{ fontSize: "11px", color: C.green, fontWeight: "600" }}>✓ {progress.total} fichier{progress.total > 1 ? "s" : ""} — {filteredOps.length} opération{filteredOps.length > 1 ? "s" : ""} au total</span>}
        {errors.length > 0 && errors.map((e, i) => <span key={i} style={{ fontSize: "11px", color: C.red, fontWeight: "600" }}>⚠ {e}</span>)}
        {filteredOps.length > 0 && (
          <button onClick={clearAll} style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 12px", color: C.inkMuted, fontSize: "11px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}>
            Tout effacer
          </button>
        )}
      </div>


      {/* ── Filtres + recherche ── */}
      {filteredOps.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 180px", minWidth: "160px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.inkSubtle} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setAvisPage(0); }} placeholder="Rechercher un titre ou ISIN…"
              style={{ width: "100%", paddingLeft: "30px", paddingRight: "10px", paddingTop: "7px", paddingBottom: "7px", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", fontSize: "12px", color: C.ink, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {["TOUS","ACHAT","VENTE","DIVIDENDE"].map(t => {
              const color = t === "ACHAT" ? C.green : t === "VENTE" ? C.navy : t === "DIVIDENDE" ? C.goldDark : C.inkMuted;
              const active = typeFilter === t;
              return (
                <button key={t} onClick={() => { setTypeFilter(t); setAvisPage(0); }}
                  style={{ fontSize: "10px", fontWeight: "700", padding: "5px 11px", borderRadius: "20px", border: active ? "none" : `1px solid ${C.border}`, background: active ? (t === "TOUS" ? C.ink : color + "18") : C.snowOff, color: active ? (t === "TOUS" ? "#fff" : color) : C.inkMuted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s ease" }}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tableau des opérations avec entête fixe + tri ── */}
      {filteredOps.length > 0 && (
        <div className="ba-tbl-scroll" style={{ border: `1px solid ${C.border}`, borderRadius: "18px", boxShadow: shadow.card }}>
          <div style={{ minWidth: "580px", background: C.snow }}>
          <div style={{ maxHeight: "420px", overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: cols, position: "sticky", top: 0, background: C.snowOff, zIndex: 2, borderBottom: `1px solid ${C.border}`, padding: "8px 12px", gap: "0" }}>
              {[["date","Date"],["heure","Heure"],["type","Type"],["titre","Titre"],["isin","ISIN"],["quantite","Qté"],["prixUnitaire","Prix"],["frais","Frais"],["","P&L"],["",""]].map(([key, label]) => (
                <div key={label} style={thStyle(key)} onClick={() => key && toggleSort(key)}>
                  {label}{sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </div>
              ))}
            </div>
            {sorted.slice(avisPage * AVIS_PAGE_SIZE, (avisPage + 1) * AVIS_PAGE_SIZE).map(op => {
              const gain = op.type === "VENTE" ? enrichOp(op) : null;
              return (
                <div key={op.id} style={{ display: "grid", gridTemplateColumns: cols, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, alignItems: "center", background: gain !== null ? (gain >= 0 ? "rgba(45,122,82,0.04)" : "rgba(176,58,46,0.04)") : "transparent" }}>
                  <div style={{ fontSize: "11px", color: C.inkMuted }}>{op.date ? op.date.split("-").reverse().join("/") : "—"}</div>
                  <div style={{ fontSize: "11px", color: C.inkSubtle, fontFamily: "monospace" }}>{op.heure || "—"}</div>
                  <div><span style={{ fontSize: "10px", fontWeight: "700", color: typeColor(op.type), background: typeColor(op.type) + "18", borderRadius: "4px", padding: "2px 6px" }}>{op.type}</span></div>
                  <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                    <CompanyAvatar nom={op.titre} isin={op.isin} size={32} />
                    <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink, lineHeight: "1.3", fontFamily: "'DM Sans', sans-serif" }}>{op.titre}</span>
                  </div>
                  <div style={{ fontSize: "10px", color: C.inkSubtle, fontFamily: "monospace" }}>{op.isin || "—"}</div>
                  <div style={{ fontSize: "12px", color: C.ink }}>{op.quantite}</div>
                  <div style={{ fontSize: "12px", color: C.navy, fontWeight: "600" }}>{op.prixUnitaire} €</div>
                  <div style={{ fontSize: "11px", color: op.frais !== "0" && op.frais !== "0.00" ? C.goldDark : C.inkSubtle }}>{op.frais} €</div>
                  <div>
                    {gain !== null
                      ? <span style={{ fontSize: "11px", fontWeight: "800", color: gain >= 0 ? C.green : C.red }}>{gain >= 0 ? "+" : ""}{gain.toFixed(2)} €</span>
                      : <span style={{ fontSize: "11px", color: C.inkSubtle }}>—</span>}
                  </div>
                  <button onClick={() => removeOp(op.id)} style={{ background: "none", border: "none", color: C.inkSubtle, cursor: "pointer", fontSize: "14px", padding: "0", lineHeight: "1" }}>✕</button>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: C.snowOff, borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: "11px", color: C.inkSubtle }}>
              {avisPage * AVIS_PAGE_SIZE + 1}–{Math.min((avisPage + 1) * AVIS_PAGE_SIZE, sorted.length)} sur {sorted.length} opération{sorted.length > 1 ? "s" : ""}
            </span>
            {sorted.length > AVIS_PAGE_SIZE && (
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => setAvisPage(p => p - 1)} disabled={avisPage === 0}
                  style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "4px 10px", fontSize: "11px", fontWeight: "600", color: avisPage === 0 ? C.inkSubtle : C.ink, cursor: avisPage === 0 ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  ← Précédent
                </button>
                <button onClick={() => setAvisPage(p => p + 1)} disabled={(avisPage + 1) * AVIS_PAGE_SIZE >= sorted.length}
                  style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "4px 10px", fontSize: "11px", fontWeight: "600", color: (avisPage + 1) * AVIS_PAGE_SIZE >= sorted.length ? C.inkSubtle : C.ink, cursor: (avisPage + 1) * AVIS_PAGE_SIZE >= sorted.length ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Suivant →
                </button>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {filteredOps.length === 0 && ui === UI.IDLE && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "22px", padding: "40px 32px", textAlign: "center", boxShadow: shadow.card }}>
          <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, marginBottom: "8px" }}>Aucune transaction importée</div>
          <div style={{ fontSize: "12px", color: C.inkMuted, maxWidth: "420px", margin: "0 auto 24px", lineHeight: "1.6" }}>
            Importez vos avis d'opérés au format PDF. Claude analyse chaque document et extrait automatiquement vos <strong>achats</strong>, <strong>ventes</strong>, <strong>dividendes</strong> et <strong>frais</strong>.
          </div>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginBottom: "24px" }}>
            {[["ACHAT", C.green], ["VENTE", C.navy], ["DIVIDENDE", C.goldDark], ["FRAIS", C.inkMuted]].map(([type, color]) => (
              <span key={type} style={{ fontSize: "10px", fontWeight: "700", color, background: color + "18", border: `1px solid ${color}30`, borderRadius: "6px", padding: "4px 10px" }}>{type}</span>
            ))}
          </div>
          <button onClick={() => pdfRef.current?.click()} style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "8px", padding: "10px 22px", color: C.goldDark, fontSize: "12px", fontFamily: "'DM Sans', sans-serif", fontWeight: "700", cursor: "pointer" }}>
            ↑ Importer mes avis PDF
          </button>
          <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "14px" }}>Plusieurs fichiers acceptés en une fois · Données stockées localement</div>
        </div>
      )}
    </div>
  );
}


function Reconciliation({ account = "PEA" }) {
  const ops      = load("bourse_avis_operes", []).filter(o => (o.compte || "PEA") === account);
  const portPos  = load("bourse_portfolio", []).filter(p => (p.compte || "PEA") === account);
  if (ops.length === 0 || portPos.length === 0) return null;

  // Recalculate positions from ops
  const byKey = {};
  const sorted = [...ops].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const typeOrder = { ACHAT: 0, DIVIDENDE: 1, VENTE: 2 };
    return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
  });
  for (const op of sorted) {
    const key = op.isin || op.titre;
    if (!byKey[key]) byKey[key] = { titre: op.titre, isin: op.isin, qte: 0, pru: 0 };
    const e = byKey[key]; const qte = parseFloat(op.quantite)||0; const prix = parseFloat(op.prixUnitaire)||0; const frais = parseFloat(op.frais)||0;
    if (op.type === "ACHAT") { const t = e.pru * e.qte + prix * qte + frais; e.qte += qte; e.pru = e.qte > 0 ? t / e.qte : 0; }
    else if (op.type === "VENTE") { e.qte -= qte; if (e.qte < 0.001) e.qte = 0; }
  }

  const divergences = [];
  for (const [key, calc] of Object.entries(byKey)) {
    if (calc.qte <= 0) continue;
    const port = portPos.find(p => p.isin === calc.isin || p.nom?.toLowerCase() === calc.titre?.toLowerCase());
    if (!port) {
      divergences.push({ titre: calc.titre, isin: calc.isin, type: "ABSENT", detail: `${calc.qte} titres calculés mais absent du portefeuille` });
    } else {
      const dQte = Math.abs(port.quantite - calc.qte);
      const dPru = port.pru && calc.pru ? Math.abs(port.pru - calc.pru) : 0;
      if (dQte > 0.5) divergences.push({ titre: calc.titre, isin: calc.isin, type: "QTÉ", detail: `Portif: ${port.quantite} · Calculé: ${Math.round(calc.qte)}` });
      else if (dPru > port.pru * 0.02) divergences.push({ titre: calc.titre, isin: calc.isin, type: "PRU", detail: `Portif: ${fmtCours(port.pru)} · Calculé: ${fmtCours(calc.pru)}` });
    }
  }

  if (divergences.length === 0) {
    return (
      <div style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "10px", padding: "14px 18px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ fontSize: "12px", fontWeight: "700", color: C.green }}>Réconciliation OK — portefeuille cohérent avec les avis d'opérés</div>
      </div>
    );
  }

  return (
    <div style={{ background: C.cardGradRed, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "18px", padding: "18px 22px", marginBottom: "20px", boxShadow: shadow.card }}>
      <div style={{ fontSize: "11px", fontWeight: "800", color: C.red, marginBottom: "12px" }}>⚠ Réconciliation — {divergences.length} divergence{divergences.length>1?"s":""} détectée{divergences.length>1?"s":""}</div>
      {divergences.map((d, i) => (
        <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "7px 0", borderBottom: i < divergences.length-1 ? `1px solid ${C.border}` : "none" }}>
          <span style={{ fontSize: "9px", fontWeight: "800", color: d.type === "ABSENT" ? C.red : C.goldDark, background: d.type === "ABSENT" ? C.redLight : C.goldLight, borderRadius: "4px", padding: "2px 7px", whiteSpace: "nowrap" }}>{d.type}</span>
          <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{d.titre}</div>
          {d.isin && <div style={{ fontSize: "9px", color: C.inkSubtle, fontFamily: "monospace" }}>{d.isin}</div>}
          <div style={{ fontSize: "11px", color: C.inkMuted, marginLeft: "auto" }}>{d.detail}</div>
        </div>
      ))}
    </div>
  );
}


// ─── Alertes frais de courtage ───────────────────────────────────────────────
function FeeWarnings({ account = "PEA" }) {
  const ops = load("bourse_avis_operes", []).filter(o => (o.compte || "PEA") === account && o.type === "ACHAT");
  if (!ops.length) return null;

  // Grouper par ISIN/titre → calculer ratio frais moyen
  const byKey = {};
  for (const op of ops) {
    const key   = op.isin || op.titre;
    const qte   = parseFloat(op.quantite)    || 0;
    const prix  = parseFloat(op.prixUnitaire) || 0;
    const frais = parseFloat(op.frais)        || 0;
    if (qte <= 0 || prix <= 0) continue;
    const montant = qte * prix;
    if (!byKey[key]) byKey[key] = { titre: op.titre, isin: op.isin, totalMontant: 0, totalFrais: 0, trades: [] };
    byKey[key].totalMontant += montant;
    byKey[key].totalFrais   += frais;
    byKey[key].trades.push({ qte, prix, frais, ratio: frais / montant });
  }

  const warnings = Object.values(byKey)
    .map(e => ({ ...e, ratio: e.totalMontant > 0 ? e.totalFrais / e.totalMontant : 0 }))
    .filter(e => e.ratio > 0.01) // > 1%
    .sort((a, b) => b.ratio - a.ratio);

  if (!warnings.length) return null;

  return (
    <div style={{ background: C.cardGradGold, borderRadius: "20px", padding: "18px 22px", marginBottom: "20px", boxShadow: shadow.card, border: `1px solid rgba(245,158,11,0.30)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <span style={{ fontSize: "12px", fontWeight: "800", color: C.goldDark }}>Frais de courtage élevés</span>
        <span style={{ fontSize: "10px", color: C.inkSubtle, background: C.snowOff, borderRadius: "5px", padding: "2px 7px", marginLeft: "auto" }}>{warnings.length} position{warnings.length > 1 ? "s" : ""}</span>
      </div>
      {warnings.map((w, i) => {
        const pct     = (w.ratio * 100).toFixed(1);
        const severe  = w.ratio > 0.03;
        const qteMin  = w.totalFrais > 0 && w.trades[0]?.prix > 0
          ? Math.ceil(w.totalFrais / (w.trades[0].prix * 0.01))  // qté pour ramener à 1%
          : null;
        return (
          <div key={i} style={{ padding: "10px 0", borderBottom: i < warnings.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
              <span style={{ fontSize: "10px", fontWeight: "800", color: severe ? C.red : C.goldDark, background: severe ? C.redLight : C.goldLight, borderRadius: "5px", padding: "2px 8px" }}>
                {pct}% de frais
              </span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{w.titre}</span>
              {w.isin && <span style={{ fontSize: "9px", color: C.inkSubtle, fontFamily: "monospace" }}>{w.isin}</span>}
            </div>
            <div style={{ fontSize: "11px", color: C.inkMuted, lineHeight: "1.6" }}>
              Frais cumulés : <strong style={{ color: C.ink }}>{fmtEur(w.totalFrais)}</strong> sur <strong style={{ color: C.ink }}>{fmtEur(w.totalMontant)}</strong> investis.
              {severe && (
                <span style={{ color: C.red }}> Ratio critique — les frais absorbent une part significative du rendement potentiel.</span>
              )}
            </div>
            {qteMin && w.trades[0]?.prix > 0 && (
              <div style={{ marginTop: "5px", fontSize: "10px", color: C.inkSubtle, background: C.snowOff, borderRadius: "6px", padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                Pour ramener les frais à &lt;1% : investir sur au moins{" "}
                <strong style={{ color: C.ink }}>{fmtEur(w.totalFrais * 100)}</strong> ({Math.ceil(w.totalFrais / (w.trades[0].prix * 0.01)).toLocaleString("fr-FR")} titres à ce cours)
              </div>
            )}
          </div>
        );
      })}
      <div style={{ marginTop: "10px", fontSize: "10px", color: C.inkSubtle, opacity: 0.7 }}>
        ⚠ Informations basées sur vos avis opérés importés · Indicatif uniquement
      </div>
    </div>
  );
}


// ─── Benchmark Indices 6 mois / 1 an ─────────────────────────────────────────
const BETA_SCALE = [
  { min: 2,     max: Infinity, label: "Très Élevé",        color: "#C0392B" },
  { min: 1.501, max: 1.999,    label: "Élevée",             color: "#E74C3C" },
  { min: 1.01,  max: 1.5,      label: "Moyennement Élevé",  color: "#E67E22" },
  { min: 1,     max: 1,        label: "Neutre",              color: "#7F8C8D" },
  { min: 0.501, max: 0.999,    label: "Moyennement Faible",  color: "#27AE60" },
  { min: 0.001, max: 0.5,      label: "Faible",              color: "#1E8449" },
  { min: 0,     max: 0,        label: "Très Faible",         color: "#117A65" },
];
function betaClassify(beta) {
  if (beta === null || beta === undefined || isNaN(beta)) return null;
  const abs = Math.abs(beta);
  for (const s of BETA_SCALE) {
    if (abs >= s.min && abs <= s.max) return s;
    if (s.min === 2 && abs >= 2) return s;
  }
  return BETA_SCALE[BETA_SCALE.length - 1];
}

const BENCHMARK_CACHE_KEY = "bourse_benchmark_cache";
const TICKER_CACHE_KEY    = "bourse_isin_ticker_cache";

// Lookup ticker depuis universe.js sans appel réseau (par ISIN ou nom)
function tickerFromUniverse(isin, nom) {
  const all = Object.values(AUTOPILOT_UNIVERSE).flat();
  if (isin) {
    const hit = all.find(u => u.isin === isin);
    if (hit) return hit.symbol;
  }
  if (nom) {
    const nomLower = nom.toLowerCase();
    const hit = all.find(u => u.nom?.toLowerCase().includes(nomLower) || nomLower.includes(u.nom?.toLowerCase()));
    if (hit) return hit.symbol;
  }
  return null;
}
const BENCHMARK_TTL_MS    = 4 * 60 * 60 * 1000; // 4 heures

function BenchmarkComparaison() {
  const cached = (() => { try { return JSON.parse(localStorage.getItem(BENCHMARK_CACHE_KEY) || "null"); } catch { return null; } })();
  const cacheValid = cached && cached.ts && (Date.now() - cached.ts) < BENCHMARK_TTL_MS;

  const [indices, setIndices] = useState(cacheValid ? cached.indices : null);
  const [errors,  setErrors]  = useState(cacheValid ? (cached.errors || {}) : {});
  const [loading, setLoading] = useState(false);
  const [showBetaInfo, setShowBetaInfo] = useState(false);
  const portPos = load("bourse_portfolio", []);

  const totalInvesti = portPos.reduce((s, p) => s + (p.pru||0)*(p.quantite||0), 0);
  const totalActuel  = portPos.reduce((s, p) => s + ((p.dernierCours||p.pru||0))*(p.quantite||0), 0);
  const perfPortif   = totalInvesti > 0 ? (totalActuel - totalInvesti) / totalInvesti * 100 : null;

  // Auto-fetch si pas de cache valide
  useEffect(() => {
    if (!cacheValid && portPos.length > 0) fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch performance via Yahoo Finance (proxied via corsproxy.io)
  // interval=1d pour une précision maximale : on prend le premier et dernier close de la période
  const fetchPerf = async (symbol, months) => {
    const to   = Math.floor(Date.now() / 1000);
    const from = to - months * 30 * 86400;
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d`;
    const res = await fetchWithProxy(yahooUrl, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const closes = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(v => v != null);
    if (closes.length < 2) throw new Error("Pas de données");
    return (closes[closes.length - 1] - closes[0]) / closes[0] * 100;
  };

  const fetchPerfSince = async (symbol, fromTs) => {
    const to = Math.floor(Date.now() / 1000);
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${Math.floor(fromTs/1000)}&period2=${to}&interval=1d`;
    const res = await fetchWithProxy(yahooUrl, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const closes = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(v => v != null);
    if (closes.length < 2) throw new Error("Pas de données");
    return (closes[closes.length - 1] - closes[0]) / closes[0] * 100;
  };

  // Date d'achat moyenne pondérée par montant investi
  const weightedPurchaseTs = (() => {
    const pos = portPos.filter(p => p.dateAchat && p.pru && p.quantite);
    if (!pos.length) {
      const d = load("bourse_pea_ouverture", "") || load("bourse_cto_ouverture", "");
      return d ? new Date(d).getTime() : null;
    }
    const totalInv = pos.reduce((s, p) => s + p.pru * p.quantite, 0);
    if (totalInv <= 0) return null;
    return pos.reduce((s, p) => s + new Date(p.dateAchat).getTime() * (p.pru * p.quantite / totalInv), 0);
  })();

  const fetchAll = async () => {
    setLoading(true); setErrors({});
    const INDICES = [
      { key: "cac40", symbol: "^FCHI"     },
      { key: "cact",  symbol: "^CACT"     },
      { key: "stoxx", symbol: "^STOXX50E" },
      { key: "cw8",   symbol: "CW8.PA"    },
    ];
    const results = {}; const errs = {};
    await Promise.all(INDICES.flatMap(({ key, symbol }) => [
      fetchPerf(symbol, 6).then(v  => { results[`${key}_6m`] = v; }).catch(e => { errs[`${key}_6m`] = e.message; }),
      fetchPerf(symbol, 12).then(v => { results[`${key}_1y`] = v; }).catch(e => { errs[`${key}_1y`] = e.message; }),
      weightedPurchaseTs
        ? fetchPerfSince(symbol, weightedPurchaseTs).then(v => { results[`${key}_pru`] = v; }).catch(e => { errs[`${key}_pru`] = e.message; })
        : Promise.resolve(),
    ]));
    try { localStorage.setItem(BENCHMARK_CACHE_KEY, JSON.stringify({ ts: Date.now(), indices: results, errors: errs })); } catch {}
    setIndices(results);
    setErrors(errs);
    setLoading(false);
  };

  if (portPos.length === 0) return null;

  // Bêta simplifié = perf portif (depuis achat) / perf CAC40 1an
  const cac1y = indices?.cac40_1y;
  const beta  = (perfPortif != null && cac1y && cac1y !== 0) ? perfPortif / cac1y : null;
  const betaCls = betaClassify(beta);

  const PerfVal = ({ value, err, size = "14px" }) => {
    if (loading) return <span style={{ color: C.inkSubtle }}>⏳</span>;
    if (!indices) return <span style={{ color: C.inkSubtle }}>—</span>;
    if (err) return <span style={{ fontSize: "10px", color: C.inkMuted }} title={err}>N/D</span>;
    if (value == null) return <span style={{ color: C.inkMuted }}>—</span>;
    return <span style={{ fontSize: size, fontWeight: "800", color: value >= 0 ? C.green : C.red }}>{value >= 0 ? "+" : ""}{value.toFixed(2).replace(".", ",")}%</span>;
  };

  const pruLabel = weightedPurchaseTs ? `Depuis PRU (${new Date(weightedPurchaseTs).toLocaleDateString("fr-FR", { month:"short", year:"2-digit" })})` : null;

  const Row = ({ label, v6m, v1y, vpru, e6m, e1y, epru, bold }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: "13px", fontWeight: bold ? "700" : "500", color: C.ink }}>{label}</span>
      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        <div style={{ textAlign: "right", minWidth: "60px" }}>
          <div style={{ fontSize: "9px", color: C.inkSubtle, marginBottom: "2px" }}>6 mois</div>
          <PerfVal value={v6m} err={e6m} />
        </div>
        <div style={{ textAlign: "right", minWidth: "60px" }}>
          <div style={{ fontSize: "9px", color: C.inkSubtle, marginBottom: "2px" }}>1 an</div>
          <PerfVal value={v1y} err={e1y} />
        </div>
        {pruLabel && (
          <div style={{ textAlign: "right", minWidth: "70px" }}>
            <div style={{ fontSize: "9px", color: C.navy, fontWeight: "700", marginBottom: "2px" }}>Depuis PRU</div>
            <PerfVal value={vpru} err={epru} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "18px", padding: "18px 22px", boxShadow: shadow.card }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: "800", color: C.ink }}>Performance vs Indices</div>
          {cached?.ts && <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "2px" }}>
            Mis à jour le {new Date(cached.ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </div>}
        </div>
        <button onClick={fetchAll} disabled={loading}
          style={{ fontSize: "11px", fontWeight: "700", padding: "5px 12px", borderRadius: "7px", cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "'DM Sans', sans-serif", background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, color: C.navy }}>
          {loading ? <span style={{ display:"inline-flex", alignItems:"center", fontSize:"13px" }}><BNextLabel /></span> : "↻ Actualiser"}
        </button>
      </div>

      {/* Rendement portif */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>Rendement depuis achat</span>
        <span style={{ fontSize: "14px", fontWeight: "900", color: perfPortif != null ? (perfPortif >= 0 ? C.green : C.red) : C.inkMuted }}>
          {perfPortif != null ? `${perfPortif >= 0 ? "+" : ""}${perfPortif.toFixed(2).replace(".", ",")}%` : "—"}
        </span>
      </div>

      {/* VS indices */}
      <Row label="VS CAC 40"              v6m={indices?.cac40_6m} v1y={indices?.cac40_1y} vpru={indices?.cac40_pru} e6m={errors.cac40_6m} e1y={errors.cac40_1y} epru={errors.cac40_pru} />
      <Row label="VS CAC All Tradable"   v6m={indices?.cact_6m}  v1y={indices?.cact_1y}  vpru={indices?.cact_pru}  e6m={errors.cact_6m}  e1y={errors.cact_1y}  epru={errors.cact_pru} />
      <Row label="VS EURO STOXX 50"      v6m={indices?.stoxx_6m} v1y={indices?.stoxx_1y} vpru={indices?.stoxx_pru} e6m={errors.stoxx_6m} e1y={errors.stoxx_1y} epru={errors.stoxx_pru} />
      <Row label="VS CW8 MSCI World PEA" v6m={indices?.cw8_6m}   v1y={indices?.cw8_1y}  vpru={indices?.cw8_pru}  e6m={errors.cw8_6m}   e1y={errors.cw8_1y}   epru={errors.cw8_pru} />

      {/* Risque */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>Risque</span>
          <span onClick={() => setShowBetaInfo(v => !v)}
            style={{ fontSize: "9px", color: C.navy, cursor: "pointer", fontWeight: "800",
              border: `1px solid ${C.navy}`, borderRadius: "50%", padding: "1px 5px", userSelect: "none" }}>i</span>
        </div>
        <span style={{ fontSize: "14px", fontWeight: "800", color: betaCls?.color ?? C.inkMuted }}>
          {betaCls ? betaCls.label : "—"}
          {beta != null && <span style={{ fontSize: "10px", color: C.inkSubtle, marginLeft: "8px", fontWeight: "500" }}>β = {beta.toFixed(2)}</span>}
        </span>
        {showBetaInfo && (
          <div style={{ position: "absolute", bottom: "36px", right: "0", zIndex: 50, background: "#fff",
            border: `1px solid ${C.border}`, borderRadius: "8px", boxShadow: shadow.card, padding: "10px 14px", minWidth: "220px" }}>
            <div style={{ fontSize: "10px", fontWeight: "800", color: C.ink, marginBottom: "8px" }}>Échelle de bêta</div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ fontSize: "9px", color: C.inkSubtle, padding: "3px 6px", textAlign: "left", fontWeight: "700" }}>Bêta</th>
                <th style={{ fontSize: "9px", color: C.inkSubtle, padding: "3px 6px", textAlign: "left", fontWeight: "700" }}>Classement</th>
              </tr></thead>
              <tbody>
                {BETA_SCALE.map((s, i) => (
                  <tr key={i} style={{ borderBottom: i < BETA_SCALE.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <td style={{ fontSize: "10px", fontWeight: "700", color: s.color, padding: "4px 6px", fontStyle: "italic" }}>
                      {s.min === s.max ? s.min : s.min === 2 ? "≥ 2" : `${s.min} – ${s.max}`}
                    </td>
                    <td style={{ fontSize: "10px", fontWeight: "700", color: s.color, padding: "4px 6px", fontStyle: "italic" }}>{s.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "8px" }}>β = perf portif (depuis achat) / perf CAC 40 (1 an)</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Statistiques Historique ──────────────────────────────────────────────────
function StatistiquesHistorique() {
  const operations         = load("bourse_avis_operes", []);
  const portfolioPositions = load("bourse_portfolio", []);
  const [sortKey, setSortKey] = useState("isin");
  const [sortDir, setSortDir] = useState("asc");
  const [methode, setMethode] = useState("pru"); // "pru" | "fifo"
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 5;
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(0);
  };

  if (operations.length === 0) return null;

  // ── Calcul chronologique PRU/FIFO + stats par titre ─────────────────────────
  const byTitre = {};
  const fifoQueues = {}; // { key: [{prix, qte}] } for FIFO
  const chronoOps = [...operations].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const typeOrder = { ACHAT: 0, DIVIDENDE: 1, VENTE: 2 };
    return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
  });

  for (const op of chronoOps) {
    const key = op.isin || op.titre;
    if (!byTitre[key]) {
      byTitre[key] = { titre: op.titre, isin: op.isin, premiereDate: op.date, qte: 0, pru: 0, totalInvesti: 0, totalFrais: 0, realise: 0, dividendes: 0 };
      fifoQueues[key] = [];
    }
    const e     = byTitre[key];
    const qte   = parseFloat(op.quantite)     || 0;
    const prix  = parseFloat(op.prixUnitaire) || 0;
    const frais = parseFloat(op.frais)        || 0;

    if (op.type === "ACHAT") {
      const total = e.pru * e.qte + prix * qte;
      e.qte         += qte;
      e.pru          = e.qte > 0 ? total / e.qte : 0;
      e.totalInvesti += prix * qte + frais;
      e.totalFrais   += frais;
      if (methode === "fifo") fifoQueues[key].push({ prix, qte });
    } else if (op.type === "VENTE") {
      if (methode === "fifo") {
        let remaining = qte; let costBasis = 0;
        const queue = fifoQueues[key];
        while (remaining > 0.001 && queue.length > 0) {
          const lot = queue[0];
          const used = Math.min(lot.qte, remaining);
          costBasis += lot.prix * used;
          lot.qte -= used; remaining -= used;
          if (lot.qte < 0.001) queue.shift();
        }
        e.realise += prix * qte - costBasis - frais;
      } else {
        e.realise += (prix - e.pru) * qte - frais;
      }
      e.qte -= qte;
      if (e.qte < 0.001) e.qte = 0;
      e.totalFrais += frais;
    } else if (op.type === "DIVIDENDE") {
      e.dividendes += prix * qte;
    }
  }

  const today   = new Date();
  const entries = Object.values(byTitre)
    .map(e => {
      const pos   = portfolioPositions.find(p => p.isin === e.isin);
      const cours = pos ? (parseFloat(pos.dernierCours) || null) : null;
      const latent = e.qte > 0 && cours !== null ? (cours - e.pru) * e.qte : 0;
      const rendementTotal = e.realise + e.dividendes + latent;
      const rendementPct   = e.totalInvesti > 0 ? (rendementTotal / e.totalInvesti) * 100 : null;
      const joursDepuis    = e.premiereDate
        ? Math.round((today - new Date(e.premiereDate)) / 86400000) : null;
      return { ...e, cours, latent, rendementTotal, rendementPct, joursDepuis };
    })
    .sort((a, b) => {
      let va = a[sortKey] ?? ""; let vb = b[sortKey] ?? "";
      if (sortKey === "isin" || sortKey === "titre" || sortKey === "premiereDate") {
        const r = String(va).localeCompare(String(vb));
        return sortDir === "asc" ? r : -r;
      }
      va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
      return sortDir === "asc" ? va - vb : vb - va;
    });

  // ── Totaux globaux ─────────────────────────────────────────────────────────
  const gInvesti    = entries.reduce((s, e) => s + e.totalInvesti, 0);
  const gRealise    = entries.reduce((s, e) => s + e.realise, 0);
  const gDividendes = entries.reduce((s, e) => s + e.dividendes, 0);
  const gLatent     = entries.reduce((s, e) => s + e.latent, 0);
  const gTotal      = gRealise + gDividendes + gLatent;
  const gPct        = gInvesti > 0 ? (gTotal / gInvesti) * 100 : 0;
  const premierDate = chronoOps[0]?.date ?? null;

  const pctColor = (v) => v === null ? C.inkSubtle : v >= 0 ? C.green : C.red;
  const fmtPl    = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} €`;
  const fmtPct2  = (v) => v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  const colGlob = { textAlign: "right" };
  const lbl9 = { fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "3px" };
  const val  = (v, color) => ({ fontSize: "15px", fontWeight: "800", color: color || C.ink });

  // ── Table header ───────────────────────────────────────────────────────────
  const tCols = "1fr 90px 80px 70px 50px 82px 72px 82px 82px 58px";
  const thS   = (key, align = "right") => ({
    fontSize: "9px", fontWeight: "700",
    color: sortKey === key ? C.navy : C.inkSubtle,
    textTransform: "uppercase", letterSpacing: "0.8px",
    textAlign: align, padding: "8px 10px",
    background: C.snowOff, borderBottom: `1px solid ${C.border}`,
    position: "sticky", top: 0, zIndex: 2,
    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
  });
  const thLabel = (key, label) => `${label}${sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}`;

  return (
    <div style={{ marginBottom: "28px" }}>
      {/* ── Synthèse globale ── */}
      <div style={{ background: C.cardGradGreen, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 20px", marginBottom: "20px", boxShadow: shadow.card }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "800", color: C.ink }}>Rendement global du portefeuille</div>
            {premierDate && <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px" }}>Depuis le {new Date(premierDate).toLocaleDateString("fr-FR")}</div>}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {["pru","fifo"].map(m => (
              <button key={m} onClick={() => setMethode(m)}
                style={{ fontSize: "10px", fontWeight: "700", padding: "3px 10px", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: methode === m ? C.navyLight : C.snowOff, border: `1px solid ${methode === m ? "rgba(30,58,95,0.12)" : C.border}`, color: methode === m ? C.navy : C.inkSubtle }}>
                {m === "pru" ? "PRU moyen" : "FIFO"}
              </button>
            ))}
            <button onClick={() => {
              const hdr = "Titre,ISIN,1er achat,Investi,PRU,Qté,P&L réalisé,Dividendes,Latent,Total,Rendement %";
              const rows = entries.map(e => [e.titre, e.isin||"", e.premiereDate||"", e.totalInvesti.toFixed(2), e.pru.toFixed(2), e.qte, e.realise.toFixed(2), e.dividendes.toFixed(2), e.latent.toFixed(2), e.rendementTotal.toFixed(2), e.rendementPct !== null ? e.rendementPct.toFixed(1) : ""].join(","));
              const csv = [hdr, ...rows].join("\n");
              const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `rendements-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
            }} style={{ fontSize: "10px", fontWeight: "700", padding: "3px 10px", borderRadius: "6px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", background: C.snowOff, border: `1px solid ${C.border}`, color: C.inkMuted }}>
              ↓ CSV
            </button>
          </div>
        </div>
        {/* Stats pills */}
        <div className="ba-g4" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { label: "Total investi",  value: `${gInvesti.toFixed(0)} €`,                              color: C.ink,                                          sub: null },
            { label: "P&L réalisé",    value: fmtPl(gRealise),                                          color: pctColor(gRealise),                             sub: null },
            { label: "Dividendes",     value: gDividendes > 0 ? `+${gDividendes.toFixed(2)} €` : "—",  color: gDividendes > 0 ? C.goldDark : C.inkSubtle,     sub: null },
            { label: "P&L latent",     value: fmtPl(gLatent),                                           color: pctColor(gLatent),                              sub: null },
          ].map(({ label, value, color }, i) => (
            <div key={i} style={{ flex: "1 1 100px", background: "rgba(255,255,255,0.6)", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 14px" }}>
              <div style={lbl9}>{label}</div>
              <div style={{ fontSize: "15px", fontWeight: "800", color, letterSpacing: "-0.3px", marginTop: "2px" }}>{value}</div>
            </div>
          ))}
          {/* Rendement total — accentué */}
          <div style={{ flex: "1 1 100px", background: gTotal >= 0 ? "rgba(5,150,105,0.08)" : "rgba(220,38,38,0.06)", border: `1px solid ${gTotal >= 0 ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.15)"}`, borderRadius: "10px", padding: "10px 14px" }}>
            <div style={lbl9}>Rendement total</div>
            <div style={{ fontSize: "18px", fontWeight: "900", color: pctColor(gTotal), letterSpacing: "-0.5px", marginTop: "2px" }}>{fmtPl(gTotal)}</div>
            <div style={{ fontSize: "11px", fontWeight: "700", color: pctColor(gTotal), marginTop: "1px" }}>{fmtPct2(gPct)}</div>
          </div>
        </div>
      </div>

      {/* ── Tableau par action ── */}
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "hidden", boxShadow: shadow.card }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: "700px" }}>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: tCols }}>
              <div style={thS("isin", "left")}    onClick={() => toggleSort("isin")}>{thLabel("isin", "Titre / ISIN")}</div>
              <div style={thS("premiereDate")}     onClick={() => toggleSort("premiereDate")}>{thLabel("premiereDate", "1er achat")}</div>
              <div style={thS("totalInvesti")}     onClick={() => toggleSort("totalInvesti")} title="Capital total déployé sur ce titre depuis l'origine (achats soldés inclus)">{thLabel("totalInvesti", "Cap. total")}</div>
              <div style={thS("pru")}              onClick={() => toggleSort("pru")}>{thLabel("pru", "PRU")}</div>
              <div style={thS("qte")}              onClick={() => toggleSort("qte")}>{thLabel("qte", "Qté")}</div>
              <div style={thS("realise")}          onClick={() => toggleSort("realise")}>{thLabel("realise", "P&L réalisé")}</div>
              <div style={thS("dividendes")}       onClick={() => toggleSort("dividendes")}>{thLabel("dividendes", "Dividendes")}</div>
              <div style={thS("latent")}           onClick={() => toggleSort("latent")}>{thLabel("latent", "Latent")}</div>
              <div style={thS("rendementTotal")}   onClick={() => toggleSort("rendementTotal")}>{thLabel("rendementTotal", "Total")}</div>
              <div style={thS("rendementPct")}     onClick={() => toggleSort("rendementPct")}>{thLabel("rendementPct", "%")}</div>
            </div>
            {/* Rows */}
            {entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(e => (
              <div key={e.isin || e.titre} style={{ display: "grid", gridTemplateColumns: tCols, padding: "9px 10px", borderBottom: `1px solid ${C.border}`, alignItems: "center", background: e.rendementTotal > 0 ? "rgba(45,122,82,0.03)" : e.rendementTotal < 0 ? "rgba(176,58,46,0.03)" : "transparent" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{e.titre}</div>
                  {e.isin && <div style={{ fontSize: "9px", color: C.inkSubtle, fontFamily: "monospace" }}>{e.isin}</div>}
                </div>
                <div style={{ fontSize: "10px", color: C.inkMuted, textAlign: "right" }}>{e.premiereDate || "—"}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", fontWeight: "600", color: C.ink }}>{e.totalInvesti.toFixed(0)} €</div>
                  {e.qte > 0 && Math.abs(e.totalInvesti - e.pru * e.qte) > 1 && (
                    <div style={{ fontSize: "9px", color: C.inkSubtle }} title="Position actuelle = PRU × quantité détenue">pos. act. {(e.pru * e.qte).toFixed(0)} €</div>
                  )}
                </div>
                <div style={{ fontSize: "11px", color: C.inkMuted, textAlign: "right" }}>{e.pru.toFixed(2)} €</div>
                <div style={{ fontSize: "11px", color: C.ink, textAlign: "right" }}>{e.qte > 0 ? e.qte : <span style={{ color: C.inkSubtle }}>Soldé</span>}</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: pctColor(e.realise), textAlign: "right" }}>{e.realise !== 0 ? fmtPl(e.realise) : "—"}</div>
                <div style={{ fontSize: "11px", fontWeight: "600", color: e.dividendes > 0 ? C.goldDark : C.inkSubtle, textAlign: "right" }}>{e.dividendes > 0 ? `+${e.dividendes.toFixed(2)} €` : "—"}</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: pctColor(e.latent), textAlign: "right" }}>{e.latent !== 0 ? fmtPl(e.latent) : "—"}</div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: pctColor(e.rendementTotal), textAlign: "right" }}>{fmtPl(e.rendementTotal)}</div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: pctColor(e.rendementPct), textAlign: "right" }}>{fmtPct2(e.rendementPct)}</div>
              </div>
            ))}
            {/* Total row */}
            <div style={{ display: "grid", gridTemplateColumns: tCols, padding: "10px 10px", background: C.snowOff, borderTop: `2px solid ${C.border}`, alignItems: "center" }}>
              <div style={{ fontSize: "11px", fontWeight: "800", color: C.ink }}>TOTAL</div>
              <div />
              <div style={{ fontSize: "11px", fontWeight: "800", color: C.ink, textAlign: "right" }}>{gInvesti.toFixed(0)} €</div>
              <div /><div />
              <div style={{ fontSize: "11px", fontWeight: "800", color: pctColor(gRealise), textAlign: "right" }}>{gRealise !== 0 ? fmtPl(gRealise) : "—"}</div>
              <div style={{ fontSize: "11px", fontWeight: "800", color: gDividendes > 0 ? C.goldDark : C.inkSubtle, textAlign: "right" }}>{gDividendes > 0 ? `+${gDividendes.toFixed(2)} €` : "—"}</div>
              <div style={{ fontSize: "11px", fontWeight: "800", color: pctColor(gLatent), textAlign: "right" }}>{gLatent !== 0 ? fmtPl(gLatent) : "—"}</div>
              <div style={{ fontSize: "13px", fontWeight: "900", color: pctColor(gTotal), textAlign: "right" }}>{fmtPl(gTotal)}</div>
              <div style={{ fontSize: "13px", fontWeight: "900", color: pctColor(gPct), textAlign: "right" }}>{fmtPct2(gPct)}</div>
            </div>
          </div>
        </div>
        {entries.length > PAGE_SIZE && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: "11px", color: C.inkSubtle }}>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, entries.length)} sur {entries.length} titres
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "5px 12px", fontSize: "11px", fontWeight: "600", color: page === 0 ? C.inkSubtle : C.ink, cursor: page === 0 ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                ← Précédent
              </button>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= entries.length}
                style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "5px 12px", fontSize: "11px", fontWeight: "600", color: (page + 1) * PAGE_SIZE >= entries.length ? C.inkSubtle : C.ink, cursor: (page + 1) * PAGE_SIZE >= entries.length ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Suivant →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Historique Tab ───────────────────────────────────────────────────────────
const SNAPSHOTS_KEY = "bourse_snapshots";
const CAPTURES_KEY  = "bourse_captures";


// ─── Évolution du capital investi (versements depuis transactions) ─────────────
function buildVersementsHistory() {
  const ops = (() => { try { return JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]"); } catch { return []; } })();
  const achats = ops
    .filter(o => o.type === "ACHAT" && o.date)
    .map(o => ({
      date:    o.date,
      montant: (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0),
      nom:     o.titre || o.isin || "?",
    }))
    .filter(o => o.montant > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (achats.length === 0) return [];

  const points = [];
  let cumul = 0;
  achats.forEach(({ date, montant, nom }) => {
    cumul += montant;
    points.push({ date, investi: cumul, label: nom, montant });
  });

  const today = new Date().toISOString().slice(0, 10);
  if (points[points.length - 1].date !== today) {
    points.push({ date: today, investi: cumul, label: "", montant: 0 });
  }

  return points;
}

function calcCapitalVerse() {
  try {
    const ops = JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]");
    const achats = ops.filter(o => o.type === "ACHAT")
      .reduce((s, o) => s + (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0), 0);
    const ventes = ops.filter(o => o.type === "VENTE")
      .reduce((s, o) => s + (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0), 0);
    return Math.max(0, achats - ventes);
  } catch { return 0; }
}

function takeSnapshot(positions) {
  // N'utiliser que les positions avec cours réel — PRU ne reflète pas la valeur marché
  const withCours = positions.filter(p => (p.dernierCours || 0) > 0);
  const valeur    = withCours.reduce((s, p) => s + p.dernierCours * (p.quantite || 0), 0);
  const coutBase  = withCours.reduce((s, p) => s + (p.pru || 0) * (p.quantite || 0), 0);
  const capitalVerse = calcCapitalVerse() || coutBase;
  const investi      = capitalVerse; // backward compat
  if (valeur === 0) return;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const snaps = (() => { try { return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]"); } catch { return []; } })();
  // Ne pas doublonner le même jour
  const filtered = snaps.filter(s => s.date !== today);
  filtered.push({ date: today, valeur, investi, coutBase, capitalVerse });
  // Garder les 365 derniers jours
  filtered.sort((a, b) => a.date.localeCompare(b.date));
  save(SNAPSHOTS_KEY, filtered.slice(-365));
}

function VersementsChart({ points }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  if (points.length < 2) return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "36px 24px", textAlign: "center", marginBottom: "20px", boxShadow: shadow.card }}>
      <div style={{ fontSize: "13px", color: C.inkSubtle, marginBottom: "8px" }}>Aucun versement à afficher.</div>
      <div style={{ fontSize: "11px", color: C.inkSubtle }}>Renseignez la <strong>Date d'achat</strong> sur chacune de vos positions pour voir l'évolution de vos versements.</div>
    </div>
  );

  const VW=800, VH=200, ML=72, MR=16, MT=14, MB=28;
  const CW=VW-ML-MR, CH=VH-MT-MB;

  const invests = points.map(p => p.investi);
  const yMin = 0;
  const yMax = Math.max(...invests) * 1.08;
  const xS   = i => ML + (i / (points.length - 1)) * CW;
  const yS   = v => MT + (1 - (v - yMin) / (yMax - yMin)) * CH;

  // Step-path : chaque versement crée un échelon horizontal puis vertical
  let stepPath = `M${xS(0).toFixed(1)},${yS(invests[0]).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    // ligne horizontale jusqu'à xS(i) au niveau précédent, puis montée verticale
    stepPath += ` L${xS(i).toFixed(1)},${yS(invests[i-1]).toFixed(1)} L${xS(i).toFixed(1)},${yS(invests[i]).toFixed(1)}`;
  }
  const areaPath = stepPath + ` L${xS(points.length-1)},${yS(yMin)} L${xS(0)},${yS(yMin)} Z`;

  // Ticks Y
  const range = yMax - yMin;
  const step  = [200,500,1000,2000,5000,10000,20000,50000,100000].find(s => range/s <= 6) || 100000;
  const yTicks = [];
  for (let v = Math.ceil(yMin/step)*step; v <= yMax; v += step) yTicks.push(v);

  const handleMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width * VW - ML) / CW));
    setHoverIdx(Math.round(frac * (points.length - 1)));
  };

  const totalInvesti = invests[invests.length - 1];
  const nbVersements = points.filter(p => p.montant > 0).length;

  return (
    <div style={{ background: C.cardGradGold, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "22px", marginBottom: "20px", boxShadow: shadow.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase" }}>Évolution des versements</div>
          <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px" }}>
            {points[0].date} → {points[points.length - 1].date}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase" }}>Total investi</div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: C.green }}>{fmtEur(totalInvesti)}</div>
          </div>
          <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase" }}>Versements</div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: C.ink }}>{nbVersements}</div>
          </div>
        </div>
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
        onMouseMove={handleMove} onMouseLeave={() => setHoverIdx(null)}>
        {/* Grid Y */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={ML} x2={ML+CW} y1={yS(v)} y2={yS(v)} stroke={C.border} strokeWidth="1" strokeDasharray="4,4" />
            <text x={ML-5} y={yS(v)+4} textAnchor="end" fontSize="9" fill={C.inkSubtle} fontFamily="'DM Sans', sans-serif">
              {v>=1000?`${Math.round(v/1000)}k`:v}€
            </text>
          </g>
        ))}
        {/* X labels */}
        {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 6)) === 0).map((p, k) => {
          const idx = points.indexOf(p);
          return (
            <text key={k} x={xS(idx)} y={MT+CH+18} textAnchor="middle" fontSize="8.5" fill={C.inkSubtle} fontFamily="'DM Sans', sans-serif">
              {new Date(p.date).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })}
            </text>
          );
        })}
        {/* Aire */}
        <path d={areaPath} fill={C.green} opacity="0.10" />
        {/* Ligne step */}
        <path d={stepPath} fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Points versements (échelons) */}
        {points.filter(p => p.montant > 0).map((p, k) => {
          const idx = points.indexOf(p);
          return <circle key={k} cx={xS(idx)} cy={yS(invests[idx])} r="4" fill={C.green} stroke="#fff" strokeWidth="1.5" />;
        })}
        {/* Crosshair */}
        {hoverIdx != null && (
          <>
            <line x1={xS(hoverIdx)} x2={xS(hoverIdx)} y1={MT} y2={MT+CH} stroke="#94A3B8" strokeWidth="1" strokeDasharray="3,3" />
            <circle cx={xS(hoverIdx)} cy={yS(invests[hoverIdx])} r="4.5" fill={C.green} stroke="#fff" strokeWidth="2" />
          </>
        )}
      </svg>

      {hoverIdx != null && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", marginTop: "4px", fontSize: "11px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <span style={{ color: C.inkSubtle, fontWeight: "600" }}>{new Date(points[hoverIdx].date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
          {points[hoverIdx].montant > 0 && <span style={{ color: C.green, fontWeight: "800" }}>+{fmtEur(points[hoverIdx].montant)} — {points[hoverIdx].label}</span>}
          <span style={{ color: C.ink, fontWeight: "800" }}>Cumul : {fmtEur(invests[hoverIdx])}</span>
        </div>
      )}
    </div>
  );
}

// ─── Performance Globale (TWR / CAGR) ────────────────────────────────────────
function PerformanceGlobale({ positions, account = "PEA" }) {
  const ops = (() => { try { return JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]"); } catch { return []; } })()
    .filter(o => (o.compte || "PEA") === account);

  // ── Calculs globaux ──────────────────────────────────────────────────────────
  const achatOps  = ops.filter(o => o.type === "ACHAT"  && o.date && parseFloat(o.quantite) > 0 && parseFloat(o.prixUnitaire) > 0);
  const venteOps  = ops.filter(o => o.type === "VENTE"  && o.date && parseFloat(o.quantite) > 0);
  const divOps    = ops.filter(o => o.type === "DIVIDENDE" && o.date);

  const EV = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);

  const totalAchete  = achatOps.reduce((s, o) => s + (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0) + (parseFloat(o.frais) || 0), 0);
  const totalVendu   = venteOps.reduce((s, o) => s + (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0) - (parseFloat(o.frais) || 0), 0);
  const totalDivRec  = divOps.reduce((s, o) => s + (parseFloat(o.montant) || 0), 0);

  // Capital brut investi (total achats) — pour le calcul du gain absolu
  const capitalBase       = totalAchete > 0 ? totalAchete : positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  // Capital net déployé = achats − ventes (ce qui est réellement encore "sorti de poche")
  const costCurrentHold   = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const netInvesti        = Math.max(capitalBase - totalVendu, costCurrentHold);
  const gainBrut          = EV + totalVendu + totalDivRec - capitalBase;
  const rendPct           = netInvesti > 0 ? (gainBrut / netInvesti) * 100 : 0;

  // ── Décomposition gains / pertes ─────────────────────────────────────────────
  // Latents : sur positions encore ouvertes
  const pvLatentes        = positions.reduce((s, p) => { const g = (p.dernierCours || p.pru) * p.quantite - p.pru * p.quantite; return s + g; }, 0);
  const pvLatentesPct     = costCurrentHold > 0 ? (pvLatentes / costCurrentHold) * 100 : null;
  // Frais cumulés (tous types d'opérations)
  const totalFrais        = ops.reduce((s, o) => s + (parseFloat(o.frais) || 0), 0);
  // Réalisés : méthode PRU pondéré — séparation gains / pertes par opération de vente
  const { gainsRealises, pertesRealisees } = ops.length > 0 ? (() => {
    const by = {};
    const sorted = [...ops].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const t = { ACHAT: 0, DIVIDENDE: 1, VENTE: 2 };
      return (t[a.type] || 0) - (t[b.type] || 0);
    });
    let gains = 0, pertes = 0;
    for (const op of sorted) {
      const k = op.isin || op.titre || op.nom;
      if (!by[k]) by[k] = { qte: 0, pru: 0 };
      const e = by[k];
      const qte = parseFloat(op.quantite) || 0;
      const prix = parseFloat(op.prixUnitaire) || 0;
      const frais = parseFloat(op.frais) || 0;
      if (op.type === "ACHAT") {
        const total = e.pru * e.qte + prix * qte;
        e.qte += qte;
        e.pru = e.qte > 0 ? total / e.qte : 0;
      } else if (op.type === "VENTE") {
        const pnl = (prix - e.pru) * qte - frais;
        if (pnl >= 0) gains += pnl; else pertes += pnl;
        e.qte = Math.max(0, e.qte - qte);
      }
    }
    return { gainsRealises: gains, pertesRealisees: pertes };
  })() : { gainsRealises: null, pertesRealisees: null };
  const pvRealisees = gainsRealises !== null ? gainsRealises + pertesRealisees : null;

  // Date d'inception : première transaction ou dateAchat la plus ancienne
  const allDates = [
    ...achatOps.map(o => o.date),
    ...positions.map(p => p.dateAchat).filter(Boolean),
  ].filter(Boolean).sort();
  const inceptionStr = allDates[0] || null;
  const inception    = inceptionStr ? new Date(inceptionStr) : null;
  const today        = new Date();
  const totalDays    = inception ? Math.max(1, (today - inception) / 864e5) : null;
  const years        = totalDays ? totalDays / 365.25 : null;

  // CAGR simple : ((EV + ventes) / achats)^(1/t) - 1
  const cagr = (years && years >= 0.1 && capitalBase > 0)
    ? (Math.pow((EV + totalVendu + totalDivRec) / capitalBase, 1 / years) - 1) * 100
    : null;

  // Rendement annualisé Modified Dietz (approximation TWR tenant compte du timing)
  // R_dietz = (EV - BV - netCF) / (BV + Σ CF_i×W_i)
  // BV = 0 (départ de zéro), CF investor view: achat = -montant, vente = +montant
  let sumWCF = 0;
  if (inception) {
    for (const o of achatOps) {
      const d = new Date(o.date);
      const W = Math.max(0, (totalDays - (d - inception) / 864e5) / totalDays);
      const amt = (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0) + (parseFloat(o.frais) || 0);
      sumWCF += amt * W; // buy = positive weight (money deployed early counts more)
    }
    for (const o of venteOps) {
      const d = new Date(o.date);
      const W = Math.max(0, (totalDays - (d - inception) / 864e5) / totalDays);
      const amt = (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0) - (parseFloat(o.frais) || 0);
      sumWCF -= amt * W; // sell = negative (money returned early reduces weight)
    }
  }
  const denomDietz  = sumWCF > 0 ? sumWCF : capitalBase;
  const netCF       = capitalBase - totalVendu; // net still invested
  const R_dietz     = denomDietz > 0 ? (EV + totalVendu - capitalBase) / denomDietz : null;
  const dietzCagr   = (R_dietz !== null && years && years >= 0.1)
    ? (Math.pow(1 + R_dietz, 1 / years) - 1) * 100
    : null;

  // ── Par position ─────────────────────────────────────────────────────────────
  const posPerf = positions.map(p => {
    const cours     = p.dernierCours || p.pru;
    const valeur    = cours * p.quantite;
    const investi   = p.pru * p.quantite;
    const pv        = valeur - investi;
    const pvPct     = investi > 0 ? (pv / investi) * 100 : 0;
    // CAGR par position depuis dateAchat
    const dateStr   = p.dateAchat || null;
    const posYears  = dateStr ? Math.max(0.01, (today - new Date(dateStr)) / (864e5 * 365.25)) : null;
    const posCagr   = (posYears && posYears >= 0.05 && p.pru > 0)
      ? (Math.pow(cours / p.pru, 1 / posYears) - 1) * 100 : null;
    return { ...p, valeur, investi, pv, pvPct, posCagr, posYears };
  }).sort((a, b) => b.pvPct - a.pvPct);

  const durLabel = (days) => {
    if (!days) return "—";
    if (days < 30)   return `${Math.round(days)}j`;
    if (days < 365)  return `${Math.round(days / 30)}mois`;
    const y = days / 365.25;
    return y < 2 ? `${y.toFixed(1)}an` : `${y.toFixed(1)}ans`;
  };

  const pctColor = (v) => v == null ? C.inkSubtle : v >= 0 ? C.green : C.red;
  const pctFmt   = (v) => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "22px", overflow: "hidden", boxShadow: shadow.card }}>
      {/* Header */}
      <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, background: C.navyLight, display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.navy, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1.5,11.5 5.5,7.5 8.5,9.5 14.5,3.5"/>
            <polyline points="10.5,3.5 14.5,3.5 14.5,7.5"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>Performance globale</div>
          <div style={{ fontSize: "10px", color: C.inkMuted }}>
            {inception ? `Depuis le ${inception.toLocaleDateString("fr-FR")} · ${durLabel(totalDays)}` : "Depuis votre premier investissement"}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="ba-perf-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: `1px solid ${C.border}` }}>
        {[
          { label: "Gain brut total",      value: (gainBrut >= 0 ? "+" : "") + fmtEur(gainBrut), color: gainBrut >= 0 ? C.green : C.red,
            tip: "Différence entre la valeur actuelle de ton portefeuille et le total de tes achats nets (hors frais de courtage)." },
          { label: "Rendement total",      value: pctFmt(rendPct), color: pctColor(rendPct),
            tip: "Gain brut divisé par le capital total investi, exprimé en %. Ne tient pas compte de la durée." },
          { label: "CAGR (annualisé)",     value: cagr != null ? pctFmt(cagr) : "< 1 an", color: cagr != null ? pctColor(cagr) : C.inkSubtle,
            tip: "Taux de croissance annuel composé depuis ton premier achat. Répond à : à quel % annuel mon capital a-t-il grossi ?" },
          { label: "Dietz TWR annualisé",  value: dietzCagr != null ? pctFmt(dietzCagr) : "< 1 an", color: dietzCagr != null ? pctColor(dietzCagr) : C.inkSubtle,
            tip: "Rendement annualisé pondéré par le temps (méthode Modified Dietz). Neutralise l'effet des apports/retraits — mesure la vraie performance du gérant." },
        ].map(({ label, value, color, tip }, i) => (
          <div key={i} style={{ padding: "14px 16px", borderRight: i < 3 ? `1px solid ${C.border}` : "none", textAlign: "center" }}>
            <div style={{ fontSize: "17px", fontWeight: "800", color, fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.5px" }}>{value}</div>
            <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: "600" }}>
              <Tooltip text={tip} term={label}><span style={{ borderBottom: "1px dashed currentColor", cursor: "help" }}>{label}</span></Tooltip>
            </div>
          </div>
        ))}
      </div>

      {/* Décomposition en cards */}
      <div className="ba-perf-breakdown" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "12px", padding: "16px 20px", borderTop: `1px solid ${C.border}`, background: C.snowOff }}>
        {[
          { label: "P/V Latente",       value: pvLatentes,      badge: pvLatentesPct, color: pvLatentes >= 0 ? C.green : C.red,    sign: pvLatentes >= 0 ? "+" : "" },
          { label: "Gains réalisés",     value: gainsRealises,   badge: null,          color: C.green,                               sign: "+" },
          { label: "Pertes réalisées",   value: pertesRealisees, badge: null,          color: pertesRealisees !== null && pertesRealisees < 0 ? C.red : C.inkMuted, sign: "" },
          { label: "Dividendes",         value: totalDivRec,     badge: null,          color: totalDivRec > 0 ? C.green : C.inkMuted, sign: "+" },
          { label: "Frais cumulés",      value: -totalFrais,     badge: null,          color: totalFrais > 0 ? C.red : C.inkMuted,   sign: "-" },
        ].map(({ label, value, badge, color, sign }, i) => (
          <div key={i} style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 14px", boxShadow: shadow.card }}>
            <div style={{ fontSize: "9px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", textTransform: "uppercase", marginBottom: "6px" }}>{label}</div>
            <div style={{ fontSize: "20px", fontWeight: "700", color, fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.5px", lineHeight: 1.2 }}>
              {value == null ? "—" : `${sign}${fmtEur(Math.abs(value))}`}
            </div>
            {badge !== null && badge !== undefined && (
              <div style={{ marginTop: "8px", display: "inline-block", background: badge >= 0 ? "rgba(5,150,105,0.10)" : "rgba(220,38,38,0.10)", borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: "700", color: badge >= 0 ? C.green : C.red }}>
                {badge >= 0 ? "+" : ""}{badge.toFixed(2)}%
              </div>
            )}
            {value == null && (
              <div style={{ marginTop: "6px", fontSize: "9px", color: C.inkSubtle }}>Importez vos transactions</div>
            )}
          </div>
        ))}
      </div>

      {/* Table par position */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "36px 2fr 90px 80px 80px 90px 80px", padding: "8px 20px", background: C.snowOff, borderBottom: `1px solid ${C.border}`, minWidth: "560px" }}>
          {["", "Société", "Investi", "Valeur", "P&L (€)", "P&L (%)", "CAGR"].map((h, i) => (
            <div key={i} style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h}</div>
          ))}
        </div>
        {posPerf.map(p => (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: "36px 2fr 90px 80px 80px 90px 80px", padding: "10px 20px", borderBottom: `1px solid ${C.border}`, alignItems: "center", minWidth: "560px" }}>
            <CompanyAvatar nom={p.nom} isin={p.isin} size={34} />
            <div>
              <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink, fontFamily: "'DM Sans', sans-serif" }}>{p.nom}</div>
              {p.posYears && <div style={{ fontSize: "9px", color: C.inkSubtle }}>{durLabel(p.posYears * 365.25)}</div>}
            </div>
            <div style={{ fontSize: "12px", color: C.inkMuted }}>{fmtEur(p.investi)}</div>
            <div style={{ fontSize: "12px", fontWeight: "600", color: C.ink }}>{fmtEur(p.valeur)}</div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: pctColor(p.pv) }}>{p.pv >= 0 ? "+" : ""}{fmtEur(p.pv)}</div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: pctColor(p.pvPct) }}>{pctFmt(p.pvPct)}</div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: pctColor(p.posCagr) }}>
              {p.posCagr != null ? pctFmt(p.posCagr) : <span style={{ color: C.inkSubtle, fontSize: "10px" }}>{"< 1 an"}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Note méthodo */}
      <div style={{ padding: "10px 20px", fontSize: "9px", color: C.inkSubtle, lineHeight: "1.7", borderTop: `1px solid ${C.border}` }}>
        <strong>CAGR</strong> = taux de croissance annuel composé depuis la première transaction (ou dateAchat) ·
        <strong> Dietz TWR</strong> = approximation du rendement pondéré par le temps (méthode Modified Dietz, tient compte du timing des achats/ventes) ·
        Dividendes inclus si renseignés dans Transactions · {achatOps.length === 0 ? "⚠ Importez vos avis d'opérés (onglet Transactions) pour un calcul précis." : `Basé sur ${achatOps.length} achats${venteOps.length ? " et " + venteOps.length + " ventes" : ""}.`}
      </div>
    </div>
  );
}

// ─── Corrélation inter-positions ──────────────────────────────────────────────
const CORR_CACHE_KEY = "bourse_corr_cache";
const CORR_TTL_MS    = 12 * 60 * 60 * 1000; // 12 heures

function pearson(a, b) {
  const n = a.length;
  if (n < 5) return null;
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; sumAB += a[i]*b[i]; sumA2 += a[i]*a[i]; sumB2 += b[i]*b[i]; }
  const denom = Math.sqrt((sumA2 - sumA*sumA/n) * (sumB2 - sumB*sumB/n));
  return denom === 0 ? null : (sumAB - sumA*sumB/n) / denom;
}

function corrColor(r) {
  if (r === null) return "#E2E8F0";
  const abs = Math.abs(r);
  if (r >= 0.75)  return `rgba(220,38,38,${0.35 + abs * 0.55})`;   // rouge fort
  if (r >= 0.45)  return `rgba(220,38,38,${0.15 + abs * 0.35})`;   // rouge modéré
  if (r >= 0.15)  return `rgba(100,116,139,0.15)`;                  // neutre chaud
  if (r <= -0.45) return `rgba(5,150,105,${0.15 + Math.abs(r) * 0.55})`; // vert (décorrélé)
  if (r <= -0.15) return `rgba(5,150,105,0.18)`;
  return "rgba(100,116,139,0.10)";
}

function CorrelationMatrix({ positions }) {
  const [data,    setData]    = useState(null);   // { labels, matrix, ts }
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [period,  setPeriod]  = useState("6mo");
  const [tooltip, setTooltip] = useState(null);   // { i, j, r }

  const eligible = positions.filter(p => p.quantite > 0);

  // Charge depuis cache ou refetch
  const load_ = useCallback(async (forceRefresh = false) => {
    if (eligible.length < 2) return;
    const cacheRaw = (() => { try { return JSON.parse(localStorage.getItem(CORR_CACHE_KEY) || "null"); } catch { return null; } })();
    const cacheKey = eligible.map(p => p.isin || p.nom).join("|") + "|" + period;
    if (!forceRefresh && cacheRaw && cacheRaw.key === cacheKey && (Date.now() - cacheRaw.ts) < CORR_TTL_MS) {
      setData(cacheRaw); setError(null); return;
    }

    setLoading(true); setError(null);

    const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
    for (const p of eligible) { if (p.isin && p.ticker) tickerCache[p.isin] = p.ticker; }

    // Résolution tickers manquants
    const resolved = await Promise.all(eligible.map(async p => {
      let ticker = (p.isin && tickerCache[p.isin]) || p.ticker || tickerFromUniverse(p.isin, p.nom) || null;
      if (!ticker && p.isin) {
        try {
          const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(p.isin)}&quotesCount=5&newsCount=0`;
          const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
          if (res.ok) {
            const j = await res.json();
            const quotes = (j.quotes || []).filter(q => ["EQUITY","ETF","MUTUALFUND"].includes(q.quoteType));
            const euroSuffixes = [".PA", ".AS", ".BR", ".MI", ".MC", ".L", ".DE", ".SW"];
            const hit = quotes.find(q => euroSuffixes.some(s => q.symbol?.endsWith(s)))
              || quotes.find(q => q.exchDisp?.toLowerCase().includes("paris") || q.exchDisp?.toLowerCase().includes("amsterdam") || q.exchDisp?.toLowerCase().includes("euronext"))
              || quotes[0];
            if (hit) { ticker = hit.symbol; tickerCache[p.isin] = ticker; }
          }
        } catch {}
      }
      return { ...p, resolvedTicker: ticker };
    }));
    try { localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(tickerCache)); } catch {}

    // Fetch séries de rendements journaliers
    const INTERVAL = "1d";
    const seriesMap = {};
    await Promise.all(resolved.map(async p => {
      if (!p.resolvedTicker) return;
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(p.resolvedTicker)}?interval=${INTERVAL}&range=${period}`;
        const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return;
        const j = await res.json();
        const closes = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
        if (!closes || closes.length < 6) return;
        // Rendements journaliers ln(Pt/Pt-1)
        const rets = [];
        for (let i = 1; i < closes.length; i++) {
          if (closes[i] != null && closes[i-1] != null && closes[i-1] > 0) {
            rets.push(Math.log(closes[i] / closes[i-1]));
          }
        }
        if (rets.length >= 5) seriesMap[p.nom] = rets;
      } catch {}
    }));

    const labels = resolved.filter(p => seriesMap[p.nom]).map(p => p.nom);
    const n = labels.length;

    if (n < 2) {
      const missing = resolved.filter(p => !seriesMap[p.nom]).map(p => p.nom).join(", ");
      setError(`Données insuffisantes — impossible de récupérer l'historique pour : ${missing || "certaines positions"}. Réessayez ou vérifiez la connexion.`);
      setLoading(false); return;
    }

    // Aligner les séries (longueur minimale commune)
    const minLen = Math.min(...labels.map(l => seriesMap[l].length));
    const aligned = labels.map(l => seriesMap[l].slice(-minLen));

    const matrix = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => i === j ? 1 : pearson(aligned[i], aligned[j]))
    );

    const result = { key: cacheKey, labels, matrix, ts: Date.now(), period };
    try { localStorage.setItem(CORR_CACHE_KEY, JSON.stringify(result)); } catch {}
    setData(result);
    setLoading(false);
  }, [eligible.map(p => p.isin || p.nom).join("|"), period]); // eslint-disable-line

  useEffect(() => { load_(false); }, [load_]);

  const PERIOD_OPTS = [
    { v: "3mo", l: "3 mois" }, { v: "6mo", l: "6 mois" },
    { v: "1y",  l: "1 an"   }, { v: "2y",  l: "2 ans"  },
  ];

  const corrLabel = r => {
    if (r === null) return "N/A";
    if (r >= 0.75) return "Très élevée";
    if (r >= 0.45) return "Modérée";
    if (r >= 0.15) return "Faible";
    if (r <= -0.45) return "Négative forte";
    if (r <= -0.15) return "Négative faible";
    return "Nulle";
  };

  if (eligible.length < 2) return null;

  return (
    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden", boxShadow: shadow.card }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: C.snow, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink, letterSpacing: "0.3px" }}>Corrélation inter-positions</div>
          <div style={{ fontSize: "11px", color: C.inkMuted, marginTop: "2px" }}>Coefficients de Pearson sur rendements journaliers logarithmiques</div>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {PERIOD_OPTS.map(o => (
            <button key={o.v} onClick={() => setPeriod(o.v)}
              style={{ fontSize: "11px", fontWeight: period === o.v ? "700" : "500", color: period === o.v ? C.accent : C.inkMuted, background: period === o.v ? "rgba(30,58,95,0.06)" : "transparent", border: `1px solid ${period === o.v ? C.accent : C.border}`, borderRadius: "6px", padding: "3px 10px", cursor: "pointer" }}>
              {o.l}
            </button>
          ))}
          <button onClick={() => load_(true)}
            style={{ fontSize: "11px", fontWeight: "600", color: C.inkMuted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 10px", cursor: "pointer", marginLeft: "4px" }}>
            ↺
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "20px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "32px", color: C.inkMuted, fontSize: "13px" }}>
            <div style={{ fontSize: "22px", marginBottom: "10px" }}>⟳</div>
            Téléchargement des séries historiques…
          </div>
        )}
        {!loading && error && (
          <div style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.18)", borderRadius: "8px", padding: "14px 16px", fontSize: "12px", color: "#B91C1C" }}>{error}</div>
        )}
        {!loading && !error && data && data.labels && (
          <>
            {/* Heatmap */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "separate", borderSpacing: "3px", fontSize: "11px", margin: "0 auto" }}>
                <thead>
                  <tr>
                    <th style={{ width: "110px" }} />
                    {data.labels.map((l, j) => (
                      <th key={j} style={{ width: "60px", maxWidth: "60px", fontWeight: "600", color: C.inkMuted, textAlign: "center", paddingBottom: "6px", fontSize: "10px" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "56px" }} title={l}>
                          {l.length > 9 ? l.slice(0, 8) + "…" : l}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.labels.map((rowLabel, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: "600", color: C.ink, fontSize: "10px", paddingRight: "8px", textAlign: "right", maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={rowLabel}>
                        {rowLabel.length > 12 ? rowLabel.slice(0, 11) + "…" : rowLabel}
                      </td>
                      {data.matrix[i].map((r, j) => {
                        const isDiag = i === j;
                        const isHovered = tooltip && ((tooltip.i === i && tooltip.j === j) || (tooltip.i === j && tooltip.j === i));
                        return (
                          <td key={j}
                            onMouseEnter={() => !isDiag && setTooltip({ i, j, r, rowLabel, colLabel: data.labels[j] })}
                            onMouseLeave={() => setTooltip(null)}
                            style={{ width: "60px", height: "42px", background: isDiag ? "rgba(30,58,95,0.09)" : corrColor(r), borderRadius: "6px", textAlign: "center", verticalAlign: "middle", cursor: isDiag ? "default" : "pointer", outline: isHovered ? "2px solid rgba(30,58,95,0.35)" : "none", transition: "outline 0.1s" }}>
                            <span style={{ fontWeight: isDiag ? "700" : "600", color: isDiag ? C.accent : (r !== null && Math.abs(r) > 0.55 ? "#fff" : C.ink), fontSize: "11px" }}>
                              {isDiag ? "—" : (r !== null ? r.toFixed(2) : "?")}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tooltip persistant sous la heatmap */}
            {tooltip && !tooltip.i !== tooltip.j && (
              <div style={{ marginTop: "12px", background: C.snow, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: C.ink, display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ fontWeight: "700" }}>{tooltip.rowLabel}</span>
                <span style={{ color: C.inkMuted }}>↔</span>
                <span style={{ fontWeight: "700" }}>{tooltip.colLabel}</span>
                <span style={{ marginLeft: "8px", fontSize: "15px", fontWeight: "800", color: tooltip.r >= 0.45 ? "#DC2626" : tooltip.r <= -0.45 ? "#059669" : C.ink }}>{tooltip.r?.toFixed(3)}</span>
                <span style={{ color: C.inkMuted }}>{corrLabel(tooltip.r)}</span>
              </div>
            )}

            {/* Légende */}
            <div style={{ marginTop: "14px", display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
              {[
                { color: corrColor(0.85),  label: "Très élevée ≥ 0.75" },
                { color: corrColor(0.55),  label: "Modérée 0.45–0.75" },
                { color: corrColor(0.0),   label: "Faible/nulle" },
                { color: corrColor(-0.55), label: "Négative (décorrélé)" },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: C.inkMuted }}>
                  <div style={{ width: "14px", height: "14px", borderRadius: "3px", background: color, border: `1px solid ${C.border}` }} />
                  {label}
                </div>
              ))}
            </div>

            {/* Clusters de risque */}
            {(() => {
              const n = data.labels.length;
              const clusters = [];
              const visited = new Set();
              for (let i = 0; i < n; i++) {
                if (visited.has(i)) continue;
                const group = [i];
                for (let j = i + 1; j < n; j++) {
                  if (data.matrix[i][j] !== null && data.matrix[i][j] >= 0.65) {
                    group.push(j); visited.add(j);
                  }
                }
                if (group.length >= 2) { clusters.push(group); visited.add(i); }
              }
              if (clusters.length === 0) return null;
              return (
                <div style={{ marginTop: "14px", background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: "8px", padding: "10px 14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#B91C1C", marginBottom: "6px" }}>⚠ Clusters de risque détectés (corrélation ≥ 0.65)</div>
                  {clusters.map((g, idx) => (
                    <div key={idx} style={{ fontSize: "11px", color: C.ink, marginTop: "3px" }}>
                      <strong>{g.map(i => data.labels[i]).join(" · ")}</strong>
                      {" "}— ces positions tendent à évoluer ensemble. Pensez à diversifier.
                    </div>
                  ))}
                </div>
              );
            })()}

            <div style={{ marginTop: "10px", fontSize: "9px", color: C.inkSubtle }}>
              Données Yahoo Finance · Période : {PERIOD_OPTS.find(o => o.v === data.period)?.l} · Mis à jour : {data.ts ? new Date(data.ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Suivi Dividendes ─────────────────────────────────────────────────────────
function DividendTracker({ account = "PEA", positions = [] }) {
  const key = "bourse_dividendes";
  const [divs, setDivs]       = useState(() => load(key, []));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]        = useState({ date: new Date().toISOString().slice(0,10), titre: "", isin: "", montant: "", nb: "", compte: account });

  const accountDivs = divs.filter(d => (d.compte || "PEA") === account);
  const totalBrut   = accountDivs.reduce((s, d) => s + (Number(d.montant) || 0), 0);
  // Prélèvement à la source estimé : 30% flat tax CTO, exonéré PEA
  const impotEst    = account === "CTO" ? totalBrut * 0.30 : 0;
  const totalNet    = totalBrut - impotEst;

  // Rendement sur coût par titre
  const posMap = {};
  positions.forEach(p => { posMap[p.isin] = p; posMap[p.nom] = p; });
  const byTitre = {};
  accountDivs.forEach(d => {
    const k = d.isin || d.titre;
    if (!byTitre[k]) byTitre[k] = { titre: d.titre, isin: d.isin, total: 0 };
    byTitre[k].total += Number(d.montant) || 0;
  });
  const titreDivs = Object.values(byTitre).map(t => {
    const pos = posMap[t.isin] || posMap[t.titre];
    const coutRevient = pos ? pos.pru * pos.quantite : null;
    const rendement   = coutRevient ? (t.total / coutRevient) * 100 : null;
    return { ...t, rendement };
  }).sort((a, b) => b.total - a.total);

  const save_ = (next) => { save(key, next); setDivs(next); };
  const del   = (id) => save_(divs.filter(d => d.id !== id));
  const add   = () => {
    if (!form.montant || !form.titre) return;
    save_([...divs, { ...form, id: Date.now(), montant: Number(form.montant), nb: Number(form.nb) || 0 }]);
    setForm(f => ({ ...f, titre: "", isin: "", montant: "", nb: "" }));
    setShowForm(false);
  };

  const inp = { padding: "8px 12px", borderRadius: "10px", border: `1px solid ${C.border}`, fontSize: "12px", fontFamily: "'DM Sans', sans-serif", background: C.snowOff, color: C.ink, outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ background: C.cardGradGreen, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px", boxShadow: shadow.card }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: "800", color: C.ink }}>Dividendes reçus</span>
          <span style={{ fontSize: "10px", color: C.inkSubtle, background: C.snowOff, borderRadius: "5px", padding: "2px 6px" }}>{accountDivs.length}</span>
          <span style={{ fontSize: "10px", color: C.inkSubtle }}>· {account}</span>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: "16px", padding: "5px 14px", fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          {showForm ? "Annuler" : "+ Ajouter"}
        </button>
      </div>

      {/* KPIs compacts en ligne */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
        {[
          { label: "Total brut", val: fmtEur(totalBrut), color: C.green },
          { label: account === "CTO" ? "Impôt (30%)" : "Exonéré (PEA)", val: account === "CTO" ? `− ${fmtEur(impotEst)}` : "0 €", color: account === "CTO" ? C.red : C.green },
          { label: "Net encaissé", val: fmtEur(totalNet), color: C.ink, bold: true },
        ].map((k, i) => (
          <div key={i} style={{ background: C.snow, borderRadius: "10px", padding: "8px 12px", boxShadow: shadow.card, flex: "1 1 120px" }}>
            <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "3px" }}>{k.label}</div>
            <div style={{ fontSize: "13px", fontWeight: k.bold ? "800" : "700", color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Formulaire ajout */}
      {showForm && (
        <div style={{ background: C.snow, borderRadius: "12px", padding: "12px 14px", marginBottom: "12px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: C.ink, marginBottom: "8px" }}>Nouveau dividende</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <div>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Titre</div>
              <select style={inp} value={form.titre} onChange={e => { const p = positions.find(p => p.nom === e.target.value); setForm(f => ({ ...f, titre: e.target.value, isin: p?.isin || "" })); }}>
                <option value="">— Sélectionner —</option>
                {positions.map(p => <option key={p.id} value={p.nom}>{p.nom}</option>)}
                <option value="__autre__">Autre…</option>
              </select>
              {form.titre === "__autre__" && <input style={{ ...inp, marginTop: "6px" }} placeholder="Nom du titre" onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} />}
            </div>
            <div>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Date</div>
              <input type="date" style={inp} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Montant brut (€)</div>
              <input type="number" step="0.01" style={inp} placeholder="0.00" value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Nb titres détenus</div>
              <input type="number" style={inp} placeholder={positions.find(p=>p.nom===form.titre)?.quantite || ""} value={form.nb} onChange={e => setForm(f => ({ ...f, nb: e.target.value }))} />
            </div>
          </div>
          <button onClick={add} style={{ width: "100%", background: C.green, color: "#fff", border: "none", borderRadius: "10px", padding: "9px", fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Enregistrer le dividende
          </button>
        </div>
      )}

      {/* Liste par titre */}
      {titreDivs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
          {titreDivs.map((t, i) => (
            <div key={i} style={{ background: C.snow, borderRadius: "10px", padding: "8px 12px", display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "11px", fontWeight: "700", color: C.ink }}>{t.titre}</div>
                {t.isin && <div style={{ fontSize: "9px", color: C.inkSubtle }}>{t.isin}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "12px", fontWeight: "800", color: C.green }}>{fmtEur(t.total)}</div>
                {t.rendement != null && <div style={{ fontSize: "9px", color: C.inkSubtle }}>Rdt/coût : {t.rendement.toFixed(2)}%</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Historique compact */}
      {accountDivs.length > 0 && (
        <div style={{ borderRadius: "10px", overflow: "hidden", border: `1px solid ${C.border}` }}>
          <div style={{ background: "linear-gradient(135deg,#0C1829,#1A3558)", padding: "6px 12px" }}>
            <span style={{ fontSize: "9px", fontWeight: "700", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Historique</span>
          </div>
          {[...accountDivs].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 10).map((d, i) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 12px", borderBottom: i < accountDivs.length - 1 ? `1px solid ${C.border}` : "none", background: i % 2 === 0 ? C.snow : C.snowOff }}>
              <span style={{ fontSize: "10px", color: C.inkSubtle, width: "76px", flexShrink: 0 }}>{new Date(d.date).toLocaleDateString("fr-FR")}</span>
              <span style={{ fontSize: "11px", fontWeight: "600", color: C.ink, flex: 1 }}>{d.titre}</span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: C.green }}>{fmtEur(d.montant)}</span>
              <button onClick={() => del(d.id)} style={{ background: "none", border: "none", color: C.inkSubtle, cursor: "pointer", fontSize: "11px", padding: "2px 4px" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {accountDivs.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "12px 0", color: C.inkSubtle, fontSize: "12px" }}>
          Aucun dividende enregistré · Cliquez sur <strong>+ Ajouter</strong> pour commencer
        </div>
      )}
    </div>
  );
}

export default function HistoriqueTab({ portfolioVersion, account = "PEA" }) {
  const allPositions = sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS));
  const positions    = allPositions.filter(p => (p.compte || "PEA") === account);

  // Snapshot journalier local
  useEffect(() => {
    takeSnapshot(positions);
  }, [portfolioVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (positions.length === 0) return (
    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "48px 28px", textAlign: "center", boxShadow: shadow.card }}>
      <div style={{ fontSize: "36px", marginBottom: "14px", lineHeight: 1 }}>▦</div>
      <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, marginBottom: "8px" }}>Aucune donnée à analyser</div>
      <div style={{ fontSize: "12px", color: C.inkMuted, maxWidth: "380px", margin: "0 auto", lineHeight: "1.6" }}>
        Ajoutez vos positions dans l'onglet <strong>Positions</strong> pour visualiser la répartition sectorielle, géographique et les performances.
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <PortfolioPieChart positions={positions} />
      <SecteurTable positions={positions} account={account} />
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 400px", minWidth: 0, display: "flex", flexDirection: "column" }}><CorrelationMatrix positions={positions} /></div>
        <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column" }}><BenchmarkComparaison /></div>
      </div>
    </div>
  );
}

export function OperationsTab({ account = "PEA" }) {
  const allPositions = sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS));
  const positions    = allPositions.filter(p => (p.compte || "PEA") === account);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <PerformanceGlobale positions={positions} account={account} />
      <PEAAvisOperes account={account} />
      <FeeWarnings account={account} />
      <Reconciliation account={account} />
      <StatistiquesHistorique />
    </div>
  );
}

