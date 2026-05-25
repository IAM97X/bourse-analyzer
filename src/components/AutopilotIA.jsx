import { useState } from "react";
import { C, shadow } from "../constants/theme";
import { AUTOPILOT_UNIVERSE, fetchYahooPrices } from "../constants/universe";
import { load, save } from "../lib/storage";
import { sanitizePositions, fmtEur, PROFIL_RANK, getEuronextUrl, checkPEAEligibility, isETFName } from "../lib/finance";
import { callClaude, CLAUDE_MODELS } from "../lib/api";

// ─── Catégories d'allocation ───────────────────────────────────────────────
const ALLOC_CATS = [
  { key: "ETF Monde",        label: "ETF Monde",        color: "#1E3A5F" },
  { key: "ETF Sectoriel",    label: "ETF Sectoriel",    color: "#2563EB" },
  { key: "Tech / IA",        label: "Tech / IA",        color: "#7C3AED" },
  { key: "Semi-conducteurs", label: "Semi-conducteurs", color: "#6D28D9" },
  { key: "Santé",            label: "Santé",            color: "#059669" },
  { key: "Industrie",        label: "Industrie / Déf.", color: "#D97706" },
  { key: "Énergie",          label: "Énergie",          color: "#B45309" },
  { key: "Luxe",             label: "Luxe / Conso",     color: "#BE185D" },
  { key: "Finance",          label: "Finance",          color: "#0369A1" },
  { key: "Autres",           label: "Autres",           color: "#64748B" },
];

const SECTOR_TO_CAT = {
  "ETF Monde":"ETF Monde","ETF USA":"ETF Monde","ETF Europe":"ETF Monde",
  "ETF Émergents":"ETF Monde","ETF Obligataire":"ETF Monde",
  "ETF Tech":"ETF Sectoriel",
  "Tech":"Tech / IA","Tech Services":"Tech / IA","Cybersécurité":"Tech / IA",
  "Cybersécurité FR":"Tech / IA","Cloud":"Tech / IA","IA/Data":"Tech / IA",
  "SaaS productivité":"Tech / IA","AdTech/IA":"Tech / IA","Médias/IA":"Tech / IA",
  "Semi-conducteurs":"Semi-conducteurs","Semi-conducteurs/IA":"Semi-conducteurs",
  "Serveurs IA":"Semi-conducteurs","Semi / IA infra":"Semi-conducteurs",
  "Santé":"Santé","Biotech":"Santé","Biotech nano":"Santé","Santé animale":"Santé",
  "Santé numérique":"Santé","IA / Drug discovery":"Santé",
  "Industrie":"Industrie","Aéronautique":"Industrie","Infrastructure":"Industrie",
  "Transports":"Industrie","Défense":"Industrie","Espace":"Industrie",
  "eVTOL / Air taxi":"Industrie","Espace / Lune":"Industrie",
  "Énergie":"Énergie","Hydrogène vert":"Énergie",
  "Luxe":"Luxe","Cosmétiques":"Luxe",
  "Banque":"Finance","Assurance":"Finance","Financier":"Finance",
  "Fintech":"Finance","Crypto/Finance":"Finance",
  "Télécoms":"Autres","Distribution":"Autres","Consommation":"Autres",
  "Automobile":"Autres","Métaux":"Autres","E-commerce":"Autres",
  "E-commerce EM":"Autres","Musique numérique":"Autres","IT Services":"Autres",
  "Retail tech":"Autres","Boissons santé":"Autres","Restauration niche":"Autres",
  "EdTech":"Autres","Quantique":"Autres","IA vocale":"Autres","Sécurité publique":"Autres",
  "IA/Data":"Tech / IA","Serveurs IA":"Semi-conducteurs","Semi-conducteurs/IA":"Semi-conducteurs",
  "Semi / IA infra":"Semi-conducteurs","AdTech/IA":"Tech / IA","SaaS productivité":"Tech / IA",
  "Santé numérique":"Santé","IA / Drug discovery":"Santé","Biotech nano":"Santé",
  "Santé animale":"Santé","Hydrogène vert":"Énergie","Espace":"Industrie","Espace / Lune":"Industrie",
  "eVTOL / Air taxi":"Industrie","Tech/IA":"Tech / IA",
};

const DEFAULT_ALLOC = {
  "prudent":        { "ETF Monde": 75, "ETF Sectoriel": 20, "Santé": 5 },
  "equilibre":      { "ETF Monde": 50, "ETF Sectoriel": 15, "Tech / IA": 15, "Santé": 10, "Industrie": 10 },
  "dynamique":      { "ETF Monde": 20, "ETF Sectoriel": 10, "Tech / IA": 25, "Semi-conducteurs": 15, "Santé": 15, "Industrie": 15 },
  "tres-dynamique": { "Tech / IA": 30, "Semi-conducteurs": 25, "Santé": 15, "Industrie": 15, "Finance": 5, "Autres": 10 },
};

const getCat = s => SECTOR_TO_CAT[s] || "Autres";
const catColor = key => ALLOC_CATS.find(c => c.key === key)?.color || "#64748B";

// ─── Composant allocation bar ──────────────────────────────────────────────
function AllocBar({ cat, tgt, cur, onChange }) {
  const color = catColor(cat.key);
  const gap = Math.max(0, tgt - cur);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
      <div style={{ width: "120px", fontSize: "11px", color: C.inkMuted, fontWeight: "600", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.label}</div>
      <div style={{ flex: 1, position: "relative", height: "18px", background: C.snowOff, borderRadius: "4px", overflow: "hidden" }}>
        {cur > 0 && <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100,cur)}%`, background: color + "40", borderRadius: "4px" }} />}
        {tgt > 0 && <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100,tgt)}%`, background: color + "22", borderRadius: "4px", border: `1px solid ${color}60` }} />}
      </div>
      {/* Actuel */}
      <span style={{ fontSize: "11px", fontWeight: "700", color: cur > 0 ? color : C.inkSubtle, width: "30px", textAlign: "right" }}>{cur > 0 ? `${cur}%` : "—"}</span>
      <span style={{ fontSize: "10px", color: C.inkSubtle, flexShrink: 0 }}>→</span>
      {/* Cible */}
      <input
        type="number" min="0" max="100" step="5"
        value={tgt || ""}
        onChange={e => onChange(cat.key, e.target.value)}
        style={{ width: "46px", textAlign: "center", border: `1px solid ${tgt > 0 ? color : C.border}`, borderRadius: "6px", padding: "3px 4px", fontSize: "12px", fontWeight: "700", color: tgt > 0 ? color : C.inkSubtle, background: tgt > 0 ? color + "08" : "transparent", fontFamily: "Inter,sans-serif", outline: "none" }}
      />
      <span style={{ fontSize: "10px", color: C.inkSubtle, width: "14px" }}>%</span>
      {gap > 2 && <span style={{ fontSize: "10px", fontWeight: "700", color: color, background: color + "15", borderRadius: "4px", padding: "1px 5px", whiteSpace: "nowrap" }}>↑{gap}%</span>}
      {cur > 0 && tgt > 0 && cur > tgt + 2 && <span style={{ fontSize: "10px", fontWeight: "700", color: C.red, background: C.red + "15", borderRadius: "4px", padding: "1px 5px", whiteSpace: "nowrap" }}>↓{cur - tgt}%</span>}
    </div>
  );
}

// ─── Analyse stratégique ──────────────────────────────────────────────────
function AnalyseStrategique({ analyse }) {
  const [open, setOpen] = useState(true);
  if (!analyse) return null;

  const SECTIONS = [
    { key: "bilan_global",   label: "Bilan global",                  dot: "#60A5FA" },
    { key: "surexpositions", label: "Surexpositions & concentration", dot: "#F87171" },
    { key: "manques",        label: "Manques sectoriels",            dot: "#FBBF24" },
    { key: "correlations",   label: "Corrélations à risque",         dot: "#A78BFA" },
    { key: "pea_alertes",    label: "Éligibilité PEA",               dot: "#F97316" },
  ];

  return (
    <div style={{ background: "linear-gradient(135deg,#0d1f3c 0%,#162a4a 100%)", borderRadius: "16px", marginBottom: "12px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "13px", fontWeight: "800", color: "#fff" }}>Analyse stratégique</span>
          <span style={{ fontSize: "9px", fontWeight: "700", color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.09)", borderRadius: "4px", padding: "2px 7px", letterSpacing: "0.8px", textTransform: "uppercase" }}>Conseiller IA</span>
        </div>
        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "2px 18px 18px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          {SECTIONS.map(s => analyse[s.key] && (
            <div key={s.key} style={{ marginTop: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
                <span style={{ fontSize: "10px", fontWeight: "700", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.9px" }}>{s.label}</span>
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", lineHeight: 1.65, paddingLeft: "12px" }}>{analyse[s.key]}</div>
            </div>
          ))}

          {analyse.actions_prioritaires?.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#34D399", flexShrink: 0 }} />
                <span style={{ fontSize: "10px", fontWeight: "700", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.9px" }}>Actions prioritaires</span>
              </div>
              {analyse.actions_prioritaires.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "10px 12px" }}>
                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "10px", fontWeight: "800", color: "#34D399" }}>{a.rang}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: "700", color: "#fff", marginBottom: "3px" }}>{a.titre}</div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", lineHeight: 1.55 }}>{a.detail}</div>
                    {a.impact && <div style={{ fontSize: "10px", color: "#60A5FA", marginTop: "4px", fontWeight: "600" }}>→ {a.impact}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────
export default function AutopilotIA({ account, profil, hidden }) {
  const positions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === (account || "PEA"));
  const [running, setRunning]         = useState(false);
  const [step, setStep]               = useState("");
  const [expanded, setExpanded]       = useState({});
  const [showAllocEditor, setShowAllocEditor] = useState(true);
  const [error, setError]             = useState(null);
  const blurStyle = hidden ? { filter: "blur(6px)", userSelect: "none" } : {};

  const risque     = profil?.risque || "equilibre";
  const resultKey = `bourse_autopilot_last_${account || "PEA"}_${risque}`;
  const [result, setResult]           = useState(() => {
    const r = load(resultKey, null);
    if (!r || !Array.isArray(r.opportunites)) return null;
    return r;
  });
  const profilRank = PROFIL_RANK[risque] ?? 1;

  const allocKey  = `bourse_autopilot_alloc_${account || "PEA"}_${risque}`;
  const budgetKey = `bourse_autopilot_budget_${account || "PEA"}`;
  const [allocCibles, setAllocCibles] = useState(() => load(allocKey, null) || DEFAULT_ALLOC[risque] || { "ETF Monde": 50, "Tech / IA": 30, "Santé": 20 });
  const [budget, setBudget] = useState(() => load(budgetKey, null) || profil?.dcaMensuel || 200);

  const allocTotal = Object.values(allocCibles).reduce((a, b) => a + Number(b || 0), 0);

  const updateBudget = (val) => {
    setBudget(val === "" ? "" : Number(val));
  };
  const commitBudget = (val) => {
    const v = Math.max(0, Number(val) || 0);
    setBudget(v);
    save(budgetKey, v);
  };

  const updateAlloc = (key, val) => {
    const v = Math.max(0, Math.min(100, Number(val) || 0));
    const next = { ...allocCibles };
    if (v === 0) delete next[key]; else next[key] = v;
    setAllocCibles(next);
    save(allocKey, next);
  };

  const resetAlloc = () => {
    const def = DEFAULT_ALLOC[risque] || { "ETF Monde": 100 };
    setAllocCibles(def);
    save(allocKey, def);
  };

  // Universe filtered by profile
  const universe = (() => {
    const all = account === "CTO"
      ? [...AUTOPILOT_UNIVERSE.PEA, ...AUTOPILOT_UNIVERSE.CTO]
      : AUTOPILOT_UNIVERSE.PEA;
    return all.filter(i => (PROFIL_RANK[i.profil_min || "prudent"] ?? 0) <= profilRank);
  })();

  // Catégorie intelligente : secteur d'abord, puis détection par nom
  const getSmartCat = (p) => {
    const fromSector = getCat(p.secteur || "");
    if (fromSector !== "Autres") return fromSector;
    const nom = (p.nom || "").toLowerCase();
    if (isETFName(p.nom)) {
      if (/monde|world|msci|all.?country|acwi/i.test(nom))            return "ETF Monde";
      if (/s&p|sp500|nasdaq|usa|amériq|america/i.test(nom))           return "ETF Monde";
      if (/europe|europ|stoxx/i.test(nom))                            return "ETF Monde";
      if (/émergent|emerging|bric/i.test(nom))                        return "ETF Monde";
      if (/tech|digital|numérique|innovation/i.test(nom))             return "ETF Sectoriel";
      if (/santé|health|pharma|biotech/i.test(nom))                   return "ETF Sectoriel";
      if (/énergie|energy|clean|vert|green/i.test(nom))               return "ETF Sectoriel";
      return "ETF Monde";
    }
    if (/technip|schlumberger|saipem|subsea/i.test(nom))              return "Énergie";
    if (/entech|énergie|energy|solaire|éolien|hydrogène|haffner/i.test(nom)) return "Énergie";
    if (/total|bp |shell|equinor/i.test(nom))                         return "Énergie";
    if (/sanofi|novartis|pfizer|biontech|astrazen/i.test(nom))        return "Santé";
    if (/airbus|safran|thales|dassault|boeing/i.test(nom))            return "Industrie";
    if (/lvmh|hermès|kering|l.?oréal|luxe/i.test(nom))               return "Luxe";
    if (/bnp|société générale|crédit|axa|allianz/i.test(nom))         return "Finance";
    if (/nvidia|intel|amd|asml|stmicro|semi/i.test(nom))              return "Semi-conducteurs";
    if (/microsoft|apple|google|meta|amazon|capgem|dassault syst/i.test(nom)) return "Tech / IA";
    return "Autres";
  };

  // Current portfolio allocation by category
  const calcCurrentAlloc = () => {
    if (!positions.length) return {};
    const bycat = {};
    let totalVal = 0;
    positions.forEach(p => {
      const val = (p.quantite || 0) * (p.dernierCours || p.pru || 0);
      const cat = getSmartCat(p);
      bycat[cat] = (bycat[cat] || 0) + val;
      totalVal += val;
    });
    if (totalVal === 0) return {};
    const pct = {};
    Object.entries(bycat).forEach(([k, v]) => { pct[k] = Math.round(v / totalVal * 100); });
    return pct;
  };

  const profilLabel = { prudent: "Prudent", equilibre: "Équilibré", dynamique: "Dynamique", "tres-dynamique": "Très dynamique" }[risque] || risque;

  const runAnalysis = async () => {
    setRunning(true); setError(null);
    try {
      setStep("Sélection des instruments…");
      const dcaMensuel = budget;
      // Nb d'opportunités selon budget : 1 ligne par tranche de 200€, max 3
      const nbOppMax = Math.min(3, Math.max(1, Math.floor(budget / 200)));
      const currentAlloc = calcCurrentAlloc();

      // Gaps : catégories sous-pondérées
      const gaps = {};
      Object.entries(allocCibles).forEach(([cat, tgt]) => {
        const cur = currentAlloc[cat] || 0;
        const gap = Number(tgt) - cur;
        if (gap > 0) gaps[cat] = gap;
      });

      // Sélection de 20 instruments proportionnelle aux écarts (déterministe)
      const TOTAL = 20;
      const stableSort = arr => [...arr].sort((a, b) => (a.symbol || "").localeCompare(b.symbol || ""));
      const nonZero = Object.entries(allocCibles).filter(([, v]) => Number(v) > 0);
      let universeSlice;

      if (nonZero.length === 0) {
        universeSlice = stableSort(universe).slice(0, TOTAL);
      } else {
        const weights = {};
        nonZero.forEach(([cat, tgt]) => {
          weights[cat] = positions.length > 0 ? (gaps[cat] || 1) : Number(tgt);
        });
        const totalW = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
        const selected = new Set();
        nonZero
          .sort(([a], [b]) => (weights[b] || 0) - (weights[a] || 0))
          .forEach(([cat]) => {
            const count = Math.max(1, Math.round((weights[cat] || 0) / totalW * TOTAL));
            stableSort(universe.filter(i => getCat(i.secteur) === cat))
              .slice(0, count)
              .forEach(i => selected.add(i));
          });
        const rem = stableSort(universe.filter(i => !selected.has(i)));
        rem.slice(0, Math.max(0, TOTAL - selected.size)).forEach(i => selected.add(i));
        universeSlice = [...selected].slice(0, TOTAL);
      }

      // ── Pre-fetch cours Yahoo Finance (gratuit, parallèle) ──────────────
      setStep("Récupération des cours Yahoo Finance…");
      const symbols = universeSlice.map(i => i.symbol).filter(Boolean);
      let pricesMap = {};
      let fetchedCount = 0;
      try {
        const priceData = await fetchYahooPrices(symbols);
        priceData.forEach(q => { if (q?.symbol) pricesMap[q.symbol] = q; });
        fetchedCount = priceData.length;
      } catch {
        // Fallback : Claude fera ses propres recherches si nécessaire
      }

      // ── Construction du prompt avec cours intégrés ───────────────────────
      const universeList = universeSlice.map(i => {
        const q = pricesMap[i.symbol];
        const cat = getCat(i.secteur);
        const gapPct = gaps[cat] ? `écart:+${gaps[cat]}%` : "";
        if (q?.regularMarketPrice) {
          const prix = q.regularMarketPrice;
          const chg  = (q.regularMarketChangePercent || 0);
          const bas  = q.fiftyTwoWeekLow  || prix;
          const haut = q.fiftyTwoWeekHigh || prix;
          const distBas = bas > 0 ? ((prix - bas) / bas * 100).toFixed(1) : "?";
          const distHaut = haut > 0 ? ((haut - prix) / prix * 100).toFixed(1) : "?";
          return `${i.isin} | ${i.nom} | ${i.symbol} | ${i.secteur} | cat:${cat} | ${gapPct} | COURS:${prix.toFixed(2)} | VAR:${chg >= 0 ? "+" : ""}${chg.toFixed(2)}% | 52s:[${bas.toFixed(2)}–${haut.toFixed(2)}] | dist_bas:+${distBas}% | potentiel_haut:+${distHaut}%`;
        }
        return `${i.isin} | ${i.nom} | ${i.symbol} | ${i.secteur} | cat:${cat} | ${gapPct} | COURS:N/A`;
      }).join("\n");

      const totalVal   = positions.reduce((s, p) => s + (p.dernierCours || p.pru || 0) * p.quantite, 0);
      const totalInves = positions.reduce((s, p) => s + p.pru * p.quantite, 0);

      const portfolioCtx = positions.length > 0
        ? positions.map(p => {
            const cours = p.dernierCours || p.pru || 0;
            const val   = cours * p.quantite;
            const pvPct = p.pru > 0 ? ((cours - p.pru) / p.pru * 100).toFixed(1) : "0";
            const poids = totalVal > 0 ? (val / totalVal * 100).toFixed(1) : "—";
            const pea   = checkPEAEligibility(p.isin);
            const peaTag = pea.eligible === true ? "PEA:✓" : pea.eligible === false ? "PEA:✗" : "PEA:?";
            return `• ${p.nom} (${p.isin}) [${peaTag}] — ${p.quantite} titres @ PRU ${fmtEur(p.pru)} — cours ${fmtEur(cours)} — PV: ${pvPct}% — poids: ${poids}%`;
          }).join("\n")
        : "Portefeuille vide";
      const pvGlobalPct = totalInves > 0 ? ((totalVal - totalInves) / totalInves * 100).toFixed(1) : "0";
      const sortedByWeight = [...positions].sort((a, b) =>
        ((b.dernierCours || b.pru || 0) * b.quantite) - ((a.dernierCours || a.pru || 0) * a.quantite));
      const top1 = sortedByWeight[0];
      const top1Pct = totalVal > 0 && top1 ? ((top1.dernierCours || top1.pru || 0) * top1.quantite / totalVal * 100).toFixed(1) : "0";
      const allocActuelleStr = Object.entries(currentAlloc).filter(([k]) => k !== "_totalVal").map(([k, v]) => `${k}=${v}%`).join(", ");
      const metriquesCtx = totalVal > 0 ? `MÉTRIQUES CLÉS :
- Valeur totale : ${fmtEur(totalVal)} | Investi : ${fmtEur(totalInves)} | PV globale : ${pvGlobalPct >= 0 ? "+" : ""}${pvGlobalPct}%
- Plus grosse position : ${top1?.nom || "—"} (${top1Pct}% du portefeuille)
- Répartition actuelle par catégorie : ${allocActuelleStr}
- Nombre de positions : ${positions.length}` : "";

      const allocCibleStr = nonZero.map(([k, v]) => `  ${k}: ${v}%`).join("\n");
      const allocGapStr = nonZero.length > 0 && positions.length > 0
        ? nonZero.map(([k, v]) => {
            const cur = currentAlloc[k] || 0;
            const gap = Number(v) - cur;
            const tag = gap > 2 ? `↑ SOUS-PONDÉRÉ (+${gap}%)` : gap < -2 ? `↓ SUR-PONDÉRÉ (${gap}%)` : "≈ OK";
            return `  ${k}: actuel ${cur}% → cible ${v}% [${tag}]`;
          }).join("\n")
        : "Premier investissement — respecter la répartition cible";

      // Signaux marché existants (scoring précédent)
      const prevScoring = (() => { try { return JSON.parse(localStorage.getItem("bourse_market_scoring") || "[]"); } catch { return []; } })();
      const sigCtx = prevScoring.length > 0
        ? prevScoring.map(s => `  • ${s.nom} (${s.isin || ""}) — ${s.signal} (${s.score_marche}/20) — ${s.resume || ""}`).join("\n")
        : "  Aucun signal calculé — lancer le scoring Marché pour les obtenir";

      // Performances depuis snapshots
      const snapshots = (() => { try { return JSON.parse(localStorage.getItem("bourse_snapshots") || "[]"); } catch { return []; } })();
      const nowDate = new Date();
      const yyyyNow = nowDate.getFullYear();
      const mmNow   = String(nowDate.getMonth() + 1).padStart(2, "0");
      const findSnap = t => { const b = snapshots.filter(s => s.date <= t); return b.length ? b[b.length-1] : null; };
      const sYtd  = findSnap(`${yyyyNow}-01-01`);
      const sMois = findSnap(`${yyyyNow}-${mmNow}-01`);
      const pYtd  = sYtd  && sYtd.valeur  > 0 ? ((totalVal - sYtd.valeur)  / sYtd.valeur  * 100).toFixed(1) : null;
      const pMois = sMois && sMois.valeur > 0 ? ((totalVal - sMois.valeur) / sMois.valeur * 100).toFixed(1) : null;
      const perfCtx = (pYtd != null || pMois != null)
        ? `PERFORMANCES :
  YTD ${yyyyNow} : ${pYtd != null ? (pYtd >= 0 ? "+" : "") + pYtd + "%" : "—"}
  Mois en cours : ${pMois != null ? (pMois >= 0 ? "+" : "") + pMois + "%" : "—"}`
        : "";

      const system = `Tu es un gérant de portefeuille privé senior spécialisé ${account}. Aujourd'hui : ${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.
PROFIL : ${profilLabel} | DCA : ${dcaMensuel}€/mois | COURTIER : ${profil?.courtier || "boursobank"} | HORIZON : ${profil?.horizon || "moyen terme"}

PORTEFEUILLE ACTUEL :
${portfolioCtx}

${metriquesCtx}
${perfCtx}

SIGNAUX IA PAR POSITION (scoring marché) :
${sigCtx}

RÉPARTITION CIBLE :
${allocCibleStr}
ÉCARTS (actuel → cible) :
${allocGapStr}

RÈGLES : utilise exclusivement les données chiffrées ci-dessus. L'éligibilité PEA est indiquée [PEA✓/✗] — ne la remet jamais en question si PEA✓. Ne renvoie jamais vers Boursorama pour des infos que tu possèdes déjà. Sois direct et tranché.`;

      setStep("Analyse IA et recherche d'actualités…");

      const prevResult = load(resultKey, null);
      const prevOpps = prevResult?.opportunites?.filter(o => ["ACHETER","RENFORCER"].includes((o.action||"").toUpperCase())) || [];
      const prevCtx = prevOpps.length > 0
        ? `\nANALYSE PRÉCÉDENTE (${new Date(prevResult.generatedAt).toLocaleDateString("fr-FR")}) :
${prevOpps.map(o => `• ${o.nom} (${o.isin}) — ${o.action} — ${o.rationale?.slice(0, 80) || ""}`).join("\n")}
→ CONTINUITÉ : maintiens ces recommandations si les fondamentaux n'ont pas changé. Ne remplace une ligne que si une meilleure opportunité est clairement identifiée.\n`
        : "";

      const hasPrices = fetchedCount > 0;
      const userMsg = `Voici les ${universeSlice.length} instruments sélectionnés pour combler les écarts de ta répartition cible.
${hasPrices ? `✅ Les cours temps réel ont déjà été récupérés via Yahoo Finance (${fetchedCount}/${universeSlice.length} instruments).` : "⚠ Cours non disponibles — utilise web_search pour les récupérer."}

INSTRUMENTS + COURS :
${universeList}

${prevCtx}${hasPrices
  ? `Les cours sont fournis — NE PAS faire de web_search pour les prix.
Utilise web_search pour UNIQUEMENT les actualités et catalyseurs récents des 2-3 meilleures opportunités identifiées (1 recherche max par instrument finaliste).`
  : `Utilise web_search pour récupérer les cours manquants et les actualités des meilleures opportunités.`}

BUDGET : ${dcaMensuel}€ au total → propose EXACTEMENT ${nbOppMax} opportunité${nbOppMax > 1 ? "s" : ""}.
${nbOppMax === 1
  ? `Budget unique : les ${dcaMensuel}€ vont sur 1 seule ligne. Choisis l'instrument qui permet d'acheter le plus de parts possible avec ce budget (prix × floor(${dcaMensuel}/prix) titres). Priorité aux ETF ou actions < ${dcaMensuel}€/titre.`
  : `Répartis le budget entre ${nbOppMax} lignes UNIQUEMENT si chaque ligne peut acheter au moins 1 titre (prix ≤ ${Math.round(dcaMensuel / nbOppMax)}€/titre). Si une ligne coûte trop cher, ramène à ${nbOppMax - 1} opportunité(s). Utilise allocation_pct pour pondérer.`}
Critères : cours proche du bas 52 semaines, dist_bas faible, catalyseur récent, secteur sous-pondéré.

Réponds UNIQUEMENT en JSON valide, sans texte avant ou après :
{
  "resume": "Contexte marché et positionnement global en 1-2 phrases synthétiques",
  "score_marche": 7,
  "analyse_portefeuille": {
    "bilan_global": "État factuel du portefeuille : PV globale chiffrée, niveau de diversification réel, adéquation profil ${profilLabel} — utiliser les vrais chiffres fournis",
    "surexpositions": "Concentrations identifiées avec % exacts tirés des données. Ex: 'SMAIO représente X% du portefeuille avec +Y% de PV — risque de correction'. Si aucune : 'Aucune surexposition critique détectée'",
    "manques": "Secteurs absents qui fragilisent concrètement ce profil ${profilLabel} sur l'horizon ${profil?.horizon || "moyen terme"}. Ne pas citer ce qui est déjà couvert par l'ETF",
    "correlations": "Positions partageant des catalyseurs communs de baisse — nommer le risque macroéconomique précis (taux, politique, secteur). Si portefeuille < 3 positions : 'Portefeuille trop concentré pour analyse de corrélation'",
    "pea_alertes": "Signale UNIQUEMENT les positions marquées PEA:✗ dans le portefeuille — nom + ISIN + raison (pays non-EEE). Si toutes les positions sont PEA:✓ : laisser vide ''",
    "actions_prioritaires": [
      {"rang": 1, "titre": "Titre court de l'action", "detail": "Description chiffrée — montant exact, nb titres possibles, impact sur répartition", "impact": "Répartition avant → après. Ex: ETF Monde 58% → 65%"}
    ]
  },
  "opportunites": [
    {
      "symbol": "CW8.PA",
      "nom": "Amundi MSCI World",
      "type": "ETF",
      "secteur": "ETF Monde",
      "categorie_cible": "ETF Monde",
      "action": "ACHETER",
      "prix": 450.50,
      "var_jour": 0.3,
      "dist_bas52": 8.5,
      "rationale": "Comble l'écart ETF Monde (+X%). Catalyseur précis en 1-2 phrases.",
      "catalyseur": "5 mots max",
      "risque": "Faible",
      "horizon": "Long terme",
      "isin": "FR0010315150",
      "allocation_pct": 50,
      "montant_suggere": ${dcaMensuel},
      "dans_portefeuille": false
    }
  ],
  "alertes_portefeuille": [],
  "prochaine_revision": "Dans 7 jours"
}

RÈGLE ACTION : ACHETER ou RENFORCER uniquement.
RÈGLE MONTANT : ${nbOppMax === 1
  ? `montant_suggere = floor(${dcaMensuel} / prix) × prix (tout le budget sur 1 ligne).`
  : `montant_suggere par ligne = floor((allocation_pct/100 × ${dcaMensuel}) / prix) × prix. Si allocation_pct absent : split équitable floor(${dcaMensuel}/${nbOppMax}/prix)×prix.`
}`;

      const parsed = await callClaude(system, userMsg, true, 2, true, 2500, CLAUDE_MODELS.fast);
      if (!parsed || typeof parsed !== "object") throw new Error("Réponse IA non structurée.");

      // Enrichir les opportunités avec les cours pre-fetchés si l'IA n'en a pas
      const enriched = (parsed.opportunites || []).map(op => {
        const q = pricesMap[op.symbol];
        if (q && (!op.prix || op.prix === 0)) {
          const bas = q.fiftyTwoWeekLow || q.regularMarketPrice;
          const prix = q.regularMarketPrice;
          return {
            ...op,
            prix,
            var_jour: parseFloat((q.regularMarketChangePercent || 0).toFixed(2)),
            dist_bas52: bas > 0 ? parseFloat(((prix - bas) / bas * 100).toFixed(1)) : op.dist_bas52,
          };
        }
        return op;
      });

      const final = {
        ...parsed,
        opportunites: enriched,
        generatedAt: new Date().toISOString(),
        enrichedCount: universe.length,
        fetchedCount,
        budget,
        nbOppMax,
        allocCibles,
        currentAlloc,
      };
      setResult(final);
      save(resultKey, final);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false); setStep("");
    }
  };

  const scoreColor = s => s >= 7 ? C.green : s >= 5 ? "#C8972A" : C.red;
  const riskColor  = r => r === "Faible" ? C.green : r === "Modéré" ? "#C8972A" : C.red;
  const ACTION_META = {
    "ACHETER":    { color: C.green,   label: "Acheter maintenant" },
    "RENFORCER":  { color: C.green,   label: "Renforcer la position" },
    "SURVEILLER": { color: "#6366F1", label: "Surveiller" },
    "ALLÉGER":    { color: "#C8972A", label: "Alléger" },
    "ÉVITER":     { color: C.red,     label: "Éviter" },
  };
  const actionColor = a => {
    const key = Object.keys(ACTION_META).find(k => a?.toUpperCase().includes(k)) || "";
    return ACTION_META[key]?.color || "#6366F1";
  };

  const currentAlloc = calcCurrentAlloc();
  const allocOk = Math.abs(allocTotal - 100) <= 2;

  return (
    <div style={{ maxWidth: "780px", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg,#1a237e,#283593)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em" }}>AI</span>
          </div>
          <div>
            <div style={{ fontSize: "18px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>Autopilot IA</div>
            <div style={{ fontSize: "11px", color: C.inkSubtle }}>Scan {account} · {universe.length} instruments · Profil {profilLabel}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
          {/* Budget input */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "5px 10px" }}>
            <span style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "600" }}>Budget</span>
            <input
              type="number" min="0" step="50"
              value={budget}
              onChange={e => updateBudget(e.target.value)}
              onBlur={e => commitBudget(e.target.value)}
              style={{ width: "72px", textAlign: "right", border: "none", background: "transparent", fontSize: "13px", fontWeight: "700", color: C.ink, fontFamily: "Inter,sans-serif", outline: "none" }}
            />
            <span style={{ fontSize: "11px", color: C.inkSubtle }}>€</span>
          </div>
          <button
            onClick={() => { if (window.confirm(`Cette analyse consomme environ 0,05–0,10 $ de crédits API.\n\nBudget à investir : ${budget}€\n\nConfirmer le lancement ?`)) runAnalysis(); }}
            disabled={running || !allocOk}
            style={{ padding: "10px 20px", borderRadius: "12px", background: running || !allocOk ? C.inkSubtle : "linear-gradient(135deg,#1a237e,#283593)", color: "#fff", border: "none", fontSize: "13px", fontWeight: "700", cursor: running || !allocOk ? "not-allowed" : "pointer", fontFamily: "Inter,sans-serif", display: "flex", alignItems: "center", gap: "8px" }}>
            {running ? "⟳ Analyse en cours…" : "⚡ Lancer l'analyse"}
          </button>
          {result?.generatedAt && <span style={{ fontSize: "10px", color: C.inkSubtle }}>Dernière analyse : {new Date(result.generatedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
      </div>

      {/* ── Allocation cible ── */}
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", marginBottom: "14px", overflow: "hidden" }}>
        <button
          onClick={() => setShowAllocEditor(v => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>Répartition cible</span>
            {/* mini pills */}
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              {Object.entries(allocCibles).filter(([, v]) => v > 0).map(([k, v]) => (
                <span key={k} style={{ fontSize: "9px", fontWeight: "700", color: catColor(k), background: catColor(k) + "18", borderRadius: "4px", padding: "1px 5px" }}>{k.split(" ")[0]} {v}%</span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: allocOk ? C.green : C.red }}>{allocTotal}%</span>
            <span style={{ fontSize: "11px", color: C.inkSubtle }}>{showAllocEditor ? "▲" : "▼"}</span>
          </div>
        </button>

        {showAllocEditor && (
          <div style={{ padding: "4px 16px 14px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: "11px", color: C.inkSubtle, marginBottom: "10px", marginTop: "8px" }}>
              Définissez votre répartition cible par catégorie. L'Autopilot priorisera les catégories sous-pondérées dans votre portefeuille actuel.
              {!allocOk && <span style={{ color: C.red, fontWeight: "700" }}> Total : {allocTotal}% (doit être 100%)</span>}
            </div>
            {ALLOC_CATS.map(cat => (
              <AllocBar
                key={cat.key}
                cat={cat}
                tgt={allocCibles[cat.key] || 0}
                cur={currentAlloc[cat.key] || 0}
                onChange={updateAlloc}
              />
            ))}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px" }}>
              <span style={{ fontSize: "10px", color: C.inkSubtle }}>Actuel → Cible · ↑ sous-pondéré · ↓ sur-pondéré</span>
              <button onClick={resetAlloc}
                style={{ fontSize: "11px", color: C.inkSubtle, background: "none", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 10px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                Réinitialiser
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Warning API ── */}
      <div style={{ background: "rgba(200,151,42,0.07)", border: "1px solid rgba(200,151,42,0.25)", borderRadius: "12px", padding: "10px 16px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{ fontSize: "14px", flexShrink: 0, marginTop: "1px" }}>💡</span>
        <div style={{ fontSize: "11px", color: "#7A5A10", lineHeight: 1.6 }}>
          <strong>Consommation API élevée</strong> — chaque analyse coûte ~0,15–0,25 $ en crédits Anthropic.<br />
          Conseil : lancez l'Autopilot <strong>1 à 2 fois par semaine</strong> maximum.
        </div>
      </div>

      {/* ── Loading ── */}
      {running && step && (
        <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.15)`, borderRadius: "14px", padding: "16px 20px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "20px", height: "20px", border: `3px solid ${C.navy}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.9s linear infinite", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", fontWeight: "600", color: C.navy }}>{step}</span>
        </div>
      )}

      {/* ── Errors ── */}
      {error && !result && (
        <div style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "14px", padding: "14px 18px", marginBottom: "16px", color: C.red, fontSize: "13px", fontWeight: "600" }}>
          ⚠ {error}
        </div>
      )}
      {error && result && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 14px", marginBottom: "12px", fontSize: "11px", color: C.inkSubtle, display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "#C8972A" }}>⚠</span>
          Nouvelle analyse échouée — résultats précédents affichés. Relancez l'analyse.
        </div>
      )}

      {/* ── Résultats ── */}
      {result && !running && (
        <>
          {/* Score + résumé */}
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 20px", marginBottom: "12px", boxShadow: shadow.card, display: "flex", gap: "16px", alignItems: "flex-start" }}>
            {result.score_marche != null && (
              <div style={{ flexShrink: 0, width: "52px", height: "52px", borderRadius: "14px", background: scoreColor(result.score_marche) + "18", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "20px", fontWeight: "800", color: scoreColor(result.score_marche), lineHeight: 1 }}>{result.score_marche}</span>
                <span style={{ fontSize: "8px", color: C.inkSubtle, fontWeight: "600" }}>/10</span>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Contexte marché</div>
              <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.55 }}>{(result.resume || "").replace(/<\/?cite[^>]*>/g, "")}</div>
            </div>
          </div>

          {/* Analyse stratégique conseiller */}
          <AnalyseStrategique analyse={result.analyse_portefeuille} />

          {/* Analyse allocation (si résultat contient les données) */}
          {result.allocCibles && (
            <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px", marginBottom: "12px", boxShadow: shadow.card }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>
                Répartition analysée
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {Object.entries(result.allocCibles).filter(([, v]) => Number(v) > 0).map(([cat, tgt]) => {
                  const cur = (result.currentAlloc || {})[cat] || 0;
                  const gap = Number(tgt) - cur;
                  const color = catColor(cat);
                  return (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "120px", fontSize: "10px", color: C.inkMuted, fontWeight: "600", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ALLOC_CATS.find(c => c.key === cat)?.label || cat}
                      </div>
                      <div style={{ flex: 1, height: "14px", background: C.snowOff, borderRadius: "4px", position: "relative", overflow: "hidden" }}>
                        {cur > 0 && <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, cur)}%`, background: color + "50", borderRadius: "4px" }} />}
                        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(100, Number(tgt))}%`, background: "transparent", border: `1px solid ${color}`, borderRadius: "4px" }} />
                      </div>
                      <span style={{ fontSize: "10px", fontWeight: "700", color: cur > 0 ? C.ink : C.inkSubtle, width: "28px", textAlign: "right" }}>{cur}%</span>
                      <span style={{ fontSize: "10px", color: C.inkSubtle }}>→</span>
                      <span style={{ fontSize: "10px", fontWeight: "700", color: color, width: "28px" }}>{tgt}%</span>
                      {gap > 2 && <span style={{ fontSize: "9px", fontWeight: "700", color: color, background: color + "15", borderRadius: "4px", padding: "1px 4px" }}>↑{gap}%</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Alertes portefeuille */}
          {result.alertes_portefeuille?.length > 0 && (
            <div style={{ background: "rgba(200,151,42,0.06)", border: "1px solid rgba(200,151,42,0.25)", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "#966F1A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "2px" }}>Alertes portefeuille</div>
              {result.alertes_portefeuille.map((a, i) => {
                if (typeof a === "string") return (
                  <div key={i} style={{ fontSize: "12px", color: "#7A5A10", lineHeight: 1.5, display: "flex", gap: "8px" }}>
                    <span style={{ flexShrink: 0 }}>▸</span><span>{a}</span>
                  </div>
                );
                const titre  = a?.titre  || a?.nom    || "";
                const alerte = a?.alerte || a?.message || a?.detail || "";
                const action = a?.action || "";
                const actionCol = action === "ÉVITER" ? C.red : action === "SURVEILLER" ? "#6366F1" : action === "RÉÉQUILIBRER" ? C.navy : "#966F1A";
                return (
                  <div key={i} style={{ borderLeft: "3px solid rgba(200,151,42,0.4)", paddingLeft: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                      {titre && <span style={{ fontSize: "11px", fontWeight: "700", color: "#7A5A10" }}>{titre}</span>}
                      {action && <span style={{ fontSize: "9px", fontWeight: "700", color: "#fff", background: actionCol, borderRadius: "4px", padding: "1px 6px" }}>{action}</span>}
                    </div>
                    {alerte && <div style={{ fontSize: "11px", color: "#966F1A", lineHeight: 1.5 }}>{alerte}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Opportunités */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px" }}>
              Opportunités à saisir · {(result.opportunites || []).filter(o => ["ACHETER", "RENFORCER"].includes((o.action || "").toUpperCase())).length}
              {result.budget && <span style={{ fontWeight: "400", textTransform: "none", marginLeft: "6px", color: C.inkMuted }}>· Budget {fmtEur(result.budget)}</span>}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <span style={{ fontSize: "9px", fontWeight: "700", color: C.green, background: C.green + "18", borderRadius: "4px", padding: "2px 7px" }}>ACHETER</span>
              <span style={{ fontSize: "9px", fontWeight: "700", color: C.green, background: C.green + "18", borderRadius: "4px", padding: "2px 7px" }}>RENFORCER</span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(result.opportunites || []).filter(op => ["ACHETER", "RENFORCER"].includes((op.action || "").toUpperCase())).map((op, i) => {
              const ac = op.action || "";
              const acShort = ac.length > 12 ? ac.split(/[\s/]/)[0] : ac;
              const acColor = actionColor(ac);
              const isExpanded = expanded[i];
              const prix = op.prix || 0;
              const oppList = (result.opportunites || []).filter(o => ["ACHETER","RENFORCER"].includes((o.action||"").toUpperCase()));
              const nbOpp = oppList.length || 1;
              // 1 ligne → tout le budget ; plusieurs → proportionnel à allocation_pct
              const budgetOp = nbOpp === 1
                ? budget
                : op.allocation_pct > 0
                  ? Math.round(budget * op.allocation_pct / 100)
                  : Math.round(budget / nbOpp);
              const nbTitres = prix > 0 ? Math.floor(budgetOp / prix) : 0;
              const montant  = nbTitres * prix;
              const catalyseurDisplay = op.catalyseur && op.catalyseur.length > 55 ? op.catalyseur.slice(0, 52) + "…" : op.catalyseur;
              const catCible = op.categorie_cible || getCat(op.secteur || "");
              const catCol = catColor(catCible);

              return (
                <div key={i} style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden", boxShadow: shadow.card, ...blurStyle }}>
                  <div style={{ height: "3px", background: acColor }} />
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "4px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "800", color: C.ink }}>{op.nom}</span>
                          <span style={{ fontSize: "10px", color: C.inkSubtle, background: C.snowOff, borderRadius: "4px", padding: "1px 5px", fontWeight: "600" }}>{op.symbol}</span>
                          {op.isin && <span style={{ fontSize: "10px", color: C.inkSubtle, fontFamily: "monospace" }}>{op.isin}</span>}
                          {/* Catégorie cible badge */}
                          <span style={{ fontSize: "9px", fontWeight: "700", color: catCol, background: catCol + "18", borderRadius: "4px", padding: "1px 6px" }}>{catCible}</span>
                          {op.dans_portefeuille && <span style={{ fontSize: "9px", fontWeight: "700", color: C.navy, background: C.navyLight, borderRadius: "4px", padding: "1px 6px" }}>En portefeuille</span>}
                          {account === "PEA" && op.isin && (() => { const p = checkPEAEligibility(op.isin); return <span title={p.label} style={{ fontSize: "9px", fontWeight: "700", color: p.color, background: p.color + "18", borderRadius: "4px", padding: "1px 6px", cursor: "default" }}>{p.eligible === true ? "PEA ✓" : p.eligible === false ? "⚠ Non-PEA" : "PEA ?"}</span>; })()}
                          <a href={`https://fr.finance.yahoo.com/quote/${encodeURIComponent(op.symbol)}`} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: "9px", fontWeight: "700", color: "#fff", background: "#5F01D1", borderRadius: "4px", padding: "2px 6px", textDecoration: "none", flexShrink: 0 }}>Yahoo</a>
                          {op.isin && /\.(PA|AS|BR|AM|LS)$/.test(op.symbol || "") && (
                            <a href={getEuronextUrl(op.isin, op.nom, op.symbol)} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: "9px", fontWeight: "700", color: "#fff", background: "#003087", borderRadius: "4px", padding: "2px 6px", textDecoration: "none", flexShrink: 0 }}>Euronext</a>
                          )}
                        </div>
                        {/* Allocation gap indicator */}
                        {op.allocation_pct > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                            <div style={{ height: "4px", width: `${Math.min(100, op.allocation_pct)}%`, maxWidth: "120px", background: catCol, borderRadius: "2px", opacity: 0.7 }} />
                            <span style={{ fontSize: "10px", fontWeight: "700", color: catCol }}>{op.allocation_pct}% cible</span>
                          </div>
                        )}
                        {catalyseurDisplay && <div style={{ fontSize: "11px", fontWeight: "600", color: "#966F1A", background: "rgba(200,151,42,0.1)", borderRadius: "5px", padding: "2px 8px", display: "inline-block" }}>⚡ {catalyseurDisplay}</div>}
                      </div>
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: "#fff", background: acColor, borderRadius: "6px", padding: "3px 10px", whiteSpace: "nowrap" }}>{acShort}</span>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{op.prix ? fmtEur(op.prix) : "—"}</span>
                        {op.var_jour != null && <span style={{ fontSize: "11px", color: op.var_jour >= 0 ? C.green : C.red, fontWeight: "600" }}>{op.var_jour >= 0 ? "+" : ""}{op.var_jour}% auj.</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.55, marginBottom: "6px",
                      ...(!isExpanded ? { overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } : {}) }}>
                      {(op.rationale || "").replace(/<\/?cite[^>]*>/g, "")}
                    </div>
                    <button onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                      style={{ fontSize: "11px", color: C.inkSubtle, background: "none", border: "none", padding: "0 0 8px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                      {isExpanded ? "▲ Réduire" : "▼ Lire plus"}
                    </button>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: "10px" }}>
                      {[
                        { label: "Risque",    val: op.risque,   color: riskColor(op.risque) },
                        { label: "Horizon",   val: op.horizon,  color: C.inkMuted },
                        { label: "Montant",   val: nbTitres === 0 ? `Budget insuffisant (${fmtEur(prix)}/titre)` : `${fmtEur(montant)} · ${nbTitres} titre${nbTitres > 1 ? "s" : ""}`, color: nbTitres === 0 ? C.red : C.ink },
                        { label: "Δ bas 52s", val: op.dist_bas52 != null ? `+${op.dist_bas52}%` : "—", color: (op.dist_bas52 || 0) < 10 ? C.green : C.inkSubtle },
                      ].map(m => (
                        <div key={m.label} style={{ background: C.snowOff, borderRadius: "6px", padding: "4px 10px" }}>
                          <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", textTransform: "uppercase" }}>{m.label}</div>
                          <div style={{ fontSize: "12px", fontWeight: "700", color: m.color }}>{m.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {result.prochaine_revision && (
            <div style={{ marginTop: "12px", textAlign: "center", fontSize: "11px", color: C.inkSubtle }}>
              Prochaine révision : {result.prochaine_revision} · {result.enrichedCount} instruments scannés
              {result.fetchedCount > 0 && <span style={{ color: C.green, marginLeft: "6px" }}>· {result.fetchedCount} cours pre-fetchés via Yahoo</span>}
            </div>
          )}
        </>
      )}

      {/* ── État vide ── */}
      {!result && !running && !error && (
        <div style={{ textAlign: "center", padding: "60px 20px", background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", boxShadow: shadow.card }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "linear-gradient(135deg,#1a237e,#283593)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <span style={{ fontSize: "16px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em" }}>AI</span>
          </div>
          <div style={{ fontSize: "16px", fontWeight: "700", color: C.ink, marginBottom: "8px" }}>Prêt à scanner le marché</div>
          <div style={{ fontSize: "13px", color: C.inkSubtle, marginBottom: "20px", maxWidth: "380px", margin: "0 auto 20px" }}>
            L'agent analyse les écarts entre votre répartition actuelle et la cible, puis identifie les meilleures opportunités Euronext pour votre budget de <strong>{fmtEur(budget)}</strong>.
          </div>
          {!allocOk && <div style={{ marginTop: "8px", fontSize: "11px", color: C.red }}>Répartition cible = {allocTotal}% — ajustez pour atteindre 100% avant de lancer</div>}
        </div>
      )}
    </div>
  );
}
