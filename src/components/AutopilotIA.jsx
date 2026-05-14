import { useState } from "react";
import { C, shadow } from "../constants/theme";
import { AUTOPILOT_UNIVERSE } from "../constants/universe";
import { load, save } from "../lib/storage";
import { sanitizePositions, fmtEur, PROFIL_RANK, getEuronextUrl } from "../lib/finance";
import { callClaude, CLAUDE_MODELS } from "../lib/api";

export default function AutopilotIA({ account, profil, hidden }) {
  const positions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === (account || "PEA"));
  const [running, setRunning]   = useState(false);
  const [step, setStep]         = useState("");
  const [expanded, setExpanded] = useState({});
  const [result, setResult]     = useState(() => {
    const r = load("bourse_autopilot_last", null);
    if (!r || !Array.isArray(r.opportunites)) return null;
    return r;
  });
  const [error, setError]       = useState(null);
  const blurStyle = hidden ? { filter: "blur(6px)", userSelect: "none" } : {};

  const risque = profil?.risque || "equilibre";
  const profilRank = PROFIL_RANK[risque] ?? 1;
  const universe = (() => {
    const all = account === "CTO"
      ? [...AUTOPILOT_UNIVERSE.PEA, ...AUTOPILOT_UNIVERSE.CTO]
      : AUTOPILOT_UNIVERSE.PEA;
    return all.filter(i => (PROFIL_RANK[i.profil_min || "prudent"] ?? 0) <= profilRank);
  })();

  const runAnalysis = async () => {
    setRunning(true); setError(null);
    try {
      setStep("Recherche des cours et analyse du marché…");

      const dcaMensuel = profil?.dcaMensuel || 200;
      const portfolioCtx = positions.length > 0
        ? positions.map(p => {
            const pvPct = p.pru > 0 ? (((p.dernierCours || p.pru) - p.pru) / p.pru * 100).toFixed(1) : "0";
            return `• ${p.nom} (${p.isin}) — ${p.quantite} titres @ PRU ${p.pru}€ — PV: ${pvPct}%`;
          }).join("\n")
        : "Portefeuille vide";

      const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
      const tierExact  = universe.filter(i => i.profil_min === risque);
      const tierLower  = universe.filter(i => i.profil_min !== risque);
      const primary   = shuffle(tierExact).slice(0, 14);
      const secondary = shuffle(tierLower).slice(0, 20 - primary.length);
      const universeSlice = [...primary, ...secondary];
      const universeList = universeSlice.map(i => i.isin ? `${i.isin} – ${i.nom} (${i.symbol}, ${i.secteur})` : `${i.symbol} – ${i.nom} (${i.secteur})`).join("\n");

      const profilLabel = { prudent: "Prudent", equilibre: "Équilibré", dynamique: "Dynamique", "tres-dynamique": "Très dynamique" }[risque] || risque;
      const focusInstr = risque === "prudent"
        ? "UNIQUEMENT des ETF diversifiés. Aucune action individuelle."
        : risque === "equilibre"
        ? "Un mix d'ETF large (60%) et d'actions blue chip solides (40%)."
        : risque === "dynamique"
        ? "Principalement des actions individuelles avec fort potentiel (70%), max 1 ETF sectoriel. Pas d'ETF généralistes."
        : "EXCLUSIVEMENT des actions individuelles à fort potentiel de croissance ou momentum. Zéro ETF. Privilégie les valeurs technologiques, semi-conducteurs, défense, IA, biotech — les plus dynamiques de l'univers.";

      const system = `Tu es un gérant de portefeuille expert spécialisé ${account} français. Aujourd'hui : ${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.
Tu as accès à la recherche web pour obtenir les cours en temps réel.
PROFIL INVESTISSEUR : ${profilLabel} | DCA MENSUEL : ${dcaMensuel}€ | ORDRE MINIMUM : 200€ | COURTIER : ${profil?.courtier || "boursobank"} | HORIZON : ${profil?.horizon || "moyen terme"}
RÈGLE ABSOLUE POUR CE PROFIL : ${focusInstr}
PORTEFEUILLE ACTUEL :
${portfolioCtx}`;

      const userMsg = `Utilise web_search pour récupérer les cours actuels des instruments les plus pertinents parmi cet univers ${account} adapté au profil ${profilLabel} :
${universeList}

Effectue 2 à 3 recherches web ciblées en utilisant l'ISIN de chaque instrument pour obtenir le cours exact, la variation du jour, le plus haut/bas 52 semaines et les catalyseurs récents. Exemple de recherche : "FR0000073272 Safran cours bourse mai 2026".

Identifie les 3 MEILLEURES OPPORTUNITÉS D'ACHAT IMMÉDIATES pour le profil ${profilLabel}.
RÈGLE STRICTE : n'inclure dans "opportunites" QUE les instruments qui méritent d'être achetés ou renforcés MAINTENANT. Le champ "action" doit être ACHETER ou RENFORCER uniquement. Si un instrument est intéressant à long terme mais pas au bon point d'entrée aujourd'hui → ne pas l'inclure du tout.
${risque === "dynamique" || risque === "tres-dynamique" ? "PRIORITÉ AUX ACTIONS INDIVIDUELLES avec catalyseur clair (résultats, contrat, secteur en hausse, momentum technique)." : ""}

Réponds UNIQUEMENT en JSON valide, sans texte avant ou après :
{
  "resume": "Contexte marché et orientation pour profil ${profilLabel} en 2-3 phrases",
  "score_marche": 7,
  "opportunites": [
    {
      "symbol": "AIR.PA",
      "nom": "Airbus",
      "type": "Action",
      "secteur": "Aéronautique",
      "action": "ACHETER",
      "prix": 165.50,
      "var_jour": 1.2,
      "dist_bas52": 12.5,
      "rationale": "1-2 phrases max sur le catalyseur précis.",
      "catalyseur": "5 mots max",
      "risque": "Modéré",
      "horizon": "Moyen terme",
      "isin": "NL0010273215",
      "allocation_pct": 15,
      "montant_suggere": 1229,
      "dans_portefeuille": false
    }
  ],
  "alertes_portefeuille": [{"titre": "Nom position", "alerte": "Description courte du risque ou signal.", "action": "SURVEILLER"}],
  "prochaine_revision": "Dans 7 jours"
}

RÈGLE ACTION : utilise UNIQUEMENT ces 5 valeurs pour le champ "action" : ACHETER (opportunité immédiate), RENFORCER (position existante à étoffer), SURVEILLER (intéressant mais attendre un meilleur point d'entrée), ALLÉGER (prendre des profits), ÉVITER (conditions défavorables). Interdit : ACCUMULER, CONSERVER, HOLD, BUY ou tout autre libellé.
RÈGLE MONTANT : montant_suggere = nombre_entier_de_titres × prix_unitaire. Si prix > ${dcaMensuel}€ : montant = 1 titre = prix. Si prix ≤ ${dcaMensuel}€ : montant = floor(${dcaMensuel}/prix) × prix. Jamais en dessous du prix d'un titre.`;

      const parsed = await callClaude(system, userMsg, true, 2, true, 3000, CLAUDE_MODELS.fast);
      if (!parsed || typeof parsed !== "object") throw new Error("Réponse IA non structurée.");
      const final = { ...parsed, generatedAt: new Date().toISOString(), enrichedCount: universe.length };
      setResult(final);
      save("bourse_autopilot_last", final);
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
    "SURVEILLER": { color: "#6366F1", label: "Surveiller — attendre un meilleur point d'entrée" },
    "ALLÉGER":    { color: "#C8972A", label: "Alléger — prendre des profits partiels" },
    "ÉVITER":     { color: C.red,     label: "Éviter — conditions défavorables" },
  };
  const actionColor = a => {
    const key = Object.keys(ACTION_META).find(k => a?.toUpperCase().includes(k)) || "";
    return ACTION_META[key]?.color || "#6366F1";
  };

  const profilLabel = { prudent: "Prudent", equilibre: "Équilibré", dynamique: "Dynamique", "tres-dynamique": "Très dynamique" }[risque] || risque;

  return (
    <div style={{ maxWidth: "780px", margin: "0 auto" }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg,#1a237e,#283593)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em" }}>AI</span>
            </div>
            <div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>Autopilot IA</div>
              <div style={{ fontSize: "11px", color: C.inkSubtle }}>Scan {account} · {universe.length} instruments · Profil {profilLabel}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
          <button onClick={() => { if (window.confirm("Cette analyse consomme environ 0,15 à 0,25 $ de crédits API (recherches web + IA).\n\nConseil : lancez-la 1 à 2 fois par semaine maximum, les opportunités n'évoluent pas en quelques heures.\n\nConfirmer le lancement ?")) runAnalysis(); }} disabled={running}
            style={{ padding: "10px 20px", borderRadius: "12px", background: running ? C.inkSubtle : "linear-gradient(135deg,#1a237e,#283593)", color: "#fff", border: "none", fontSize: "13px", fontWeight: "700", cursor: running ? "not-allowed" : "pointer", fontFamily: "Inter,sans-serif", display: "flex", alignItems: "center", gap: "8px" }}>
            {running ? "⟳ Analyse en cours…" : "⚡ Lancer l'analyse"}
          </button>
          {result?.generatedAt && <span style={{ fontSize: "10px", color: C.inkSubtle }}>Dernière analyse : {new Date(result.generatedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
      </div>

      <div style={{ background: "rgba(200,151,42,0.07)", border: "1px solid rgba(200,151,42,0.25)", borderRadius: "12px", padding: "10px 16px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{ fontSize: "14px", flexShrink: 0, marginTop: "1px" }}>💡</span>
        <div style={{ fontSize: "11px", color: "#7A5A10", lineHeight: 1.6 }}>
          <strong>Consommation API élevée</strong> — chaque analyse coûte ~0,15–0,25 $ en crédits Anthropic (recherches web en temps réel).<br />
          Conseil : lancez l'Autopilot <strong>1 à 2 fois par semaine</strong> maximum. Les opportunités de marché n'évoluent pas en quelques heures.
        </div>
      </div>

      {running && step && (
        <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.15)`, borderRadius: "14px", padding: "16px 20px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "20px", height: "20px", border: `3px solid ${C.navy}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.9s linear infinite", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", fontWeight: "600", color: C.navy }}>{step}</span>
        </div>
      )}

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

      {result && !running && (
        <>
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 20px", marginBottom: "12px", boxShadow: shadow.card, display: "flex", gap: "16px", alignItems: "flex-start" }}>
            {result.score_marche != null && (
              <div style={{ flexShrink: 0, width: "52px", height: "52px", borderRadius: "14px", background: scoreColor(result.score_marche) + "18", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "20px", fontWeight: "800", color: scoreColor(result.score_marche), lineHeight: 1 }}>{result.score_marche}</span>
                <span style={{ fontSize: "8px", color: C.inkSubtle, fontWeight: "600" }}>/10</span>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Contexte marché</div>
              <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{result.resume}</div>
            </div>
          </div>

          {result.alertes_portefeuille?.length > 0 && (
            <div style={{ background: "rgba(200,151,42,0.06)", border: "1px solid rgba(200,151,42,0.25)", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "#966F1A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "2px" }}>Alertes portefeuille</div>
              {result.alertes_portefeuille.map((a, i) => {
                if (typeof a === "string") {
                  return (
                    <div key={i} style={{ fontSize: "12px", color: "#7A5A10", lineHeight: 1.5, display: "flex", gap: "8px" }}>
                      <span style={{ flexShrink: 0 }}>▸</span><span>{a}</span>
                    </div>
                  );
                }
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

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px" }}>
              Opportunités à saisir · {(result.opportunites || []).filter(o => ["ACHETER","RENFORCER"].includes((o.action||"").toUpperCase())).length}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <span style={{ fontSize: "9px", fontWeight: "700", color: C.green, background: C.green + "18", borderRadius: "4px", padding: "2px 7px" }}>ACHETER</span>
              <span style={{ fontSize: "9px", fontWeight: "700", color: C.green, background: C.green + "18", borderRadius: "4px", padding: "2px 7px" }}>RENFORCER</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(result.opportunites || []).filter(op => ["ACHETER","RENFORCER"].includes((op.action||"").toUpperCase())).map((op, i) => {
              const ac = op.action || "";
              const acShort = ac.length > 12 ? ac.split(/[\s/]/)[0] : ac;
              const acColor = actionColor(ac);
              const isExpanded = expanded[i];
              const dcaMensuel = profil?.dcaMensuel || 200;
              const prix = op.prix || 0;
              const budgetCible = Math.max(dcaMensuel, 200);
              // Toujours dériver nbTitres depuis le budget réel (pas depuis montant_suggere IA qui peut être faux)
              const nbTitres = prix > 0 ? Math.max(1, Math.floor(budgetCible / prix)) : 1;
              const montant = nbTitres * prix || budgetCible;
              const catalyseurDisplay = op.catalyseur && op.catalyseur.length > 55 ? op.catalyseur.slice(0, 52) + "…" : op.catalyseur;
              return (
                <div key={i} style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden", boxShadow: shadow.card, ...blurStyle }}>
                  <div style={{ height: "3px", background: acColor }} />
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "3px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "800", color: C.ink }}>{op.nom}</span>
                          <span style={{ fontSize: "10px", color: C.inkSubtle, background: C.snowOff, borderRadius: "4px", padding: "1px 5px", fontWeight: "600" }}>{op.symbol}</span>
                          {op.isin && <span style={{ fontSize: "10px", color: C.inkSubtle, fontFamily: "monospace" }}>{op.isin}</span>}
                          <span style={{ fontSize: "10px", color: C.inkSubtle }}>{op.secteur}</span>
                          {op.dans_portefeuille && <span style={{ fontSize: "9px", fontWeight: "700", color: C.navy, background: C.navyLight, borderRadius: "4px", padding: "1px 6px" }}>En portefeuille</span>}
                          <a href={`https://fr.finance.yahoo.com/quote/${encodeURIComponent(op.symbol)}`} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: "9px", fontWeight: "700", color: "#fff", background: "#5F01D1", borderRadius: "4px", padding: "2px 6px", textDecoration: "none", flexShrink: 0 }}>Yahoo</a>
                          {op.isin && /\.(PA|AS|BR|AM|DE|LS|MC)$/.test(op.symbol || "") && (
                            <a href={getEuronextUrl(op.isin, op.nom)} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: "9px", fontWeight: "700", color: "#fff", background: "#003087", borderRadius: "4px", padding: "2px 6px", textDecoration: "none", flexShrink: 0 }}>Euronext</a>
                          )}
                        </div>
                        {catalyseurDisplay && <div style={{ fontSize: "11px", fontWeight: "600", color: "#966F1A", background: "rgba(200,151,42,0.1)", borderRadius: "5px", padding: "2px 8px", display: "inline-block" }}>⚡ {catalyseurDisplay}</div>}
                      </div>
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: "#fff", background: acColor, borderRadius: "6px", padding: "3px 10px", whiteSpace: "nowrap" }}>{acShort}</span>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{op.prix ? fmtEur(op.prix) : "—"}</span>
                        {op.var_jour != null && <span style={{ fontSize: "11px", color: op.var_jour >= 0 ? C.green : C.red, fontWeight: "600" }}>{op.var_jour >= 0 ? "+" : ""}{op.var_jour}% auj.</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.55, marginBottom: "6px",
                      ...(!isExpanded ? { overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } : {}) }}
                    >{op.rationale}</div>
                    <button onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                      style={{ fontSize: "11px", color: C.inkSubtle, background: "none", border: "none", padding: "0 0 8px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                      {isExpanded ? "▲ Réduire" : "▼ Lire plus"}
                    </button>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: "10px" }}>
                      {[
                        { label: "Risque",    val: op.risque,   color: riskColor(op.risque) },
                        { label: "Horizon",   val: op.horizon,  color: C.inkMuted },
                        { label: "Montant",   val: `${fmtEur(montant)} · ${nbTitres} titre${nbTitres > 1 ? "s" : ""}`, color: C.ink },
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
            </div>
          )}
        </>
      )}

      {!result && !running && !error && (
        <div style={{ textAlign: "center", padding: "60px 20px", background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", boxShadow: shadow.card }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "linear-gradient(135deg,#1a237e,#283593)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <span style={{ fontSize: "16px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em" }}>AI</span>
          </div>
          <div style={{ fontSize: "16px", fontWeight: "700", color: C.ink, marginBottom: "8px" }}>Prêt à scanner le marché</div>
          <div style={{ fontSize: "13px", color: C.inkSubtle, marginBottom: "20px", maxWidth: "360px", margin: "0 auto 20px" }}>
            L'agent scanne {universe.length} instruments {account} adaptés à votre profil {profilLabel} et identifie les meilleures opportunités en temps réel.
          </div>
          <button onClick={() => { if (window.confirm("Cette analyse consomme environ 0,15 à 0,25 $ de crédits API.\n\nConseil : 1 à 2 fois par semaine maximum.\n\nConfirmer ?")) runAnalysis(); }}
            style={{ padding: "12px 28px", borderRadius: "12px", background: "linear-gradient(135deg,#1a237e,#283593)", color: "#fff", border: "none", fontSize: "14px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            ⚡ Lancer l'analyse
          </button>
        </div>
      )}
    </div>
  );
}
