import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { sanitizePositions, fmtEur, isETFName } from "../lib/finance";
import { load, save } from "../lib/storage";
import { UI, DEFAULT_POSITIONS } from "../constants/config";
import { StockProjectionChart, PriceEvolutionChart } from "./StockPanels";
import { callClaude, enqueueApi, getKey } from "../lib/api";
import { COURTIERS } from "../constants/courtiers";
import { ThinkingSpinner } from "./UI";

const AI_POTENTIEL_KEY = "bourse_ai_potentiel";

// ─── Marché Tab ─────────────────────────────────────────────────────────────
function MarcheTab({ profil, portfolioVersion, account = "PEA", marketScores, marketScoringUi, onRunScoring }) {
  const [allPositions, setAllPositions] = useState(() => sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
  const positions = allPositions.filter(p => (p.compte || "PEA") === account);
  const [selectedPosId, setSelectedPosId] = useState(null);
  const [aiPotentiel, setAiPotentiel]   = useState(() => load(AI_POTENTIEL_KEY, null));
  const [aiPotLoading, setAiPotLoading] = useState(false);

  useEffect(() => {
    setAllPositions(sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
    setSelectedPosId(null);
  }, [portfolioVersion]);

  if (positions.length === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.inkSubtle, fontSize: "13px" }}>
      Aucune position dans le portefeuille · Ajoutez des positions dans l'onglet Portefeuille
    </div>
  );

  const selectedPos = positions.find(p => p.id === selectedPosId) || null;
  const SIG_COLOR = { ACHAT: C.green, RENFORCER: C.accent, ATTENDRE: C.gold, PRUDENCE: C.red, VENDRE: "#7B1111" };
  const SIG_BG    = { ACHAT: C.greenLight, RENFORCER: C.paleBlue, ATTENDRE: C.goldLight, PRUDENCE: C.redLight, VENDRE: "rgba(123,17,17,0.08)" };

  const scores = Array.isArray(marketScores) ? marketScores : [];
  const scoredPositions = positions.map(p => {
    const s = scores.find(sc => sc.isin === p.isin || sc.nom?.toLowerCase() === p.nom?.toLowerCase());
    return { ...p, _score: s || null };
  }).sort((a, b) => (b._score?.score_marche ?? -1) - (a._score?.score_marche ?? -1));

  return (
    <div>
      {/* ── Scoring IA dynamique ── */}
      <div style={{ background: C.cardGrad, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "22px", boxShadow: shadow.card, marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "14px", color: C.ink }}>Scoring IA Dynamique</div>
            <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>Analyse temps réel de chaque position — actualités + signaux marché</div>
          </div>
          <button
            onClick={() => onRunScoring && onRunScoring(positions)}
            disabled={marketScoringUi === UI.LOADING}
            style={{ padding: "8px 18px", borderRadius: "12px", border: "none", cursor: marketScoringUi === UI.LOADING ? "not-allowed" : "pointer", background: marketScoringUi === UI.LOADING ? C.snowDim : "linear-gradient(135deg, #080B0F 0%, #1E3A5F 100%)", color: marketScoringUi === UI.LOADING ? C.inkSubtle : "#fff", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", boxShadow: marketScoringUi !== UI.LOADING ? shadow.pill : "none", transition: "all 0.15s" }}>
            {marketScoringUi === UI.LOADING
              ? <><span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", border: "2px solid #aaa", borderTopColor: "transparent", animation: "spin 0.9s linear infinite" }} />Analyse en cours…</>
              : "Lancer le scoring IA"}
          </button>
        </div>

        {marketScoringUi === UI.IDLE && scores.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 0", color: C.inkSubtle, fontSize: "13px" }}>
            Cliquez sur "Lancer le scoring IA" pour analyser vos positions en temps réel.
          </div>
        )}

        {(marketScoringUi === UI.RESULT || scores.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {scoredPositions.map(pos => {
              const s = pos._score;
              if (!s) return (
                <div key={pos.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: C.snowOff, borderRadius: "12px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: C.inkMuted, minWidth: "120px" }}>{pos.nom}</div>
                  <div style={{ fontSize: "11px", color: C.inkSubtle }}>Non scoré — Lancez une analyse</div>
                </div>
              );
              const scoreBarColor = s.score_marche >= 14 ? C.green : s.score_marche >= 9 ? C.gold : C.red;
              return (
                <div key={pos.id} style={{ padding: "14px 16px", background: SIG_BG[s.signal] || C.snowOff, borderRadius: "14px", border: `1px solid ${SIG_COLOR[s.signal] ? SIG_COLOR[s.signal] + "33" : C.border}`, display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: "700", fontSize: "13.5px", color: C.ink, flex: 1, minWidth: "100px" }}>{pos.nom}</div>
                    <span style={{ fontSize: "10px", fontWeight: "800", color: SIG_COLOR[s.signal] || C.inkMuted, background: SIG_COLOR[s.signal] ? SIG_COLOR[s.signal] + "22" : C.snowDim, padding: "3px 10px", borderRadius: "20px", border: `1px solid ${SIG_COLOR[s.signal] || C.border}`, letterSpacing: "0.5px" }}>{s.signal}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ width: "80px", height: "6px", borderRadius: "3px", background: C.snowDim, overflow: "hidden" }}>
                        <div style={{ width: `${(s.score_marche / 20) * 100}%`, height: "100%", background: scoreBarColor, borderRadius: "3px", transition: "width 0.5s" }} />
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: scoreBarColor }}>{s.score_marche}/20</span>
                    </div>
                  </div>
                  {s.resume && <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>{s.resume}</div>}
                  {s.catalyseur_cle && (
                    <div style={{ fontSize: "11px", color: C.inkSubtle, display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ fontWeight: "700", color: C.inkMuted }}>Catalyseur :</span> {s.catalyseur_cle}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {marketScoringUi === UI.ERROR && (
          <div style={{ padding: "12px 14px", background: C.redLight, border: `1px solid rgba(231,76,60,0.25)`, borderRadius: "12px", color: C.red, fontSize: "12.5px" }}>
            Erreur lors du scoring — Vérifiez votre clé API et réessayez.
          </div>
        )}
      </div>

      {/* ── Potentiel du portefeuille (IA) ── */}
      {(() => {
        const totalVal = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
        const totalInv = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
        const pvPct    = totalInv > 0 ? (totalVal - totalInv) / totalInv * 100 : 0;
        const horizonMap = { court: { label: "< 2 ans", annees: 1 }, moyen: { label: "2–5 ans", annees: 3 }, long: { label: "5–10 ans", annees: 7 }, "tres-long": { label: "> 10 ans", annees: 15 } };
        const horizonInfo = horizonMap[profil?.horizon] || horizonMap.moyen;

        const analyzePortfolioPotentiel = async () => {
          setAiPotLoading(true);
          setAiPotentiel(null);
          save(AI_POTENTIEL_KEY, null);
          try {
            const scores = Array.isArray(marketScores) ? marketScores : [];
            const summary = positions.map(p => {
              const sig = scores.find(s => s.isin === p.isin || s.nom === p.nom);
              return {
                nom: p.nom, isin: p.isin || null, secteur: p.secteur || null,
                pru: p.pru, quantite: p.quantite, cours: p.dernierCours || p.pru,
                pv_pct: p.pru > 0 ? +((( p.dernierCours || p.pru) - p.pru) / p.pru * 100).toFixed(1) : 0,
                signal_ia: sig?.signal || null, resume_ia: sig?.resume || null,
              };
            });
            const sys = `Tu es un analyste financier senior. Analyse le portefeuille et retourne UNIQUEMENT un JSON valide, sans markdown.`;
            const horizonAns = horizonInfo.annees || 10;
            const dcaMensuel = Number(profil?.dcaMensuel) || 0;
            const objectifEuros = Number(profil?.objectifEuros) || 0;
            const risque = profil?.risque || "equilibre";
            const courtierCfg = COURTIERS[profil?.courtier || "boursobank"] || COURTIERS.boursobank;
            const minETF = courtierCfg.minOrdreETF || courtierCfg.minOrdre || 50;
            const minSC  = courtierCfg.minOrdreSmallCap || courtierCfg.minOrdre || 100;
            const fractionne = courtierCfg.fractionne || false;

            // Répartition ETF vs small caps selon profil risque
            const repartMatrix = {
              prudent:         { etfPct: 90, scPct: 10 },
              equilibre:       { etfPct: 70, scPct: 30 },
              dynamique:       { etfPct: 50, scPct: 50 },
              "tres-dynamique":{ etfPct: 30, scPct: 70 },
            };
            const repart = repartMatrix[risque] || repartMatrix.equilibre;

            // CAGR ETF (stable) et small caps (opportuniste)
            const cagrETF = { court: 6, moyen: 7, long: 8, "tres-long": 8 }[profil?.horizon || "moyen"] ?? 7;
            const cagrSC  = { court: 8, moyen: 11, long: 14, "tres-long": 15 }[profil?.horizon || "moyen"] ?? 11;
            // CAGR DCA pondéré selon répartition
            const dcaCagr = Math.round(cagrETF * repart.etfPct/100 + cagrSC * repart.scPct/100);

            // Capacité DCA : peut-on faire ETF + SC le même mois ?
            const peutFaireETF = dcaMensuel >= minETF;
            const peutFaireLesDeux = dcaMensuel >= (minETF + minSC);
            const ordresParMois = fractionne ? 2 : peutFaireLesDeux ? 2 : peutFaireETF ? 1 : Math.floor(dcaMensuel / Math.max(minSC, 1));
            const unSeulOrdre = ordresParMois <= 1;

            const dcaCible = fractionne
              ? `achat fractionné — ${repart.etfPct}% ETF (~${cagrETF}%/an) + ${repart.scPct}% small caps (~${cagrSC}%/an) → CAGR DCA pondéré ~${dcaCagr}%/an`
              : peutFaireLesDeux
              ? `2 ordres/mois possibles (min ETF ${minETF}€, min actions ${minSC}€) — ${repart.etfPct}% ETF + ${repart.scPct}% small caps → CAGR DCA pondéré ~${dcaCagr}%/an`
              : peutFaireETF
              ? `1 ordre/mois — alternance ETF (${repart.etfPct}% du temps, min ${minETF}€, ~${cagrETF}%/an) et small caps opportunistes (${repart.scPct}% du temps, min ${minSC}€, ~${cagrSC}%/an) → CAGR DCA pondéré ~${dcaCagr}%/an`
              : `1 ordre/mois sur actions uniquement (DCA ${fmtEur(dcaMensuel)} < min ETF ${minETF}€) — small caps ~${cagrSC}%/an`;

            const user = `Portefeuille : ${positions.length} positions, valeur actuelle ${fmtEur(totalVal)}, P/V global ${pvPct >= 0 ? "+" : ""}${pvPct.toFixed(1)}%.
Horizon : ${horizonInfo.label} (${horizonAns} ans). Profil investisseur : ${risque}.
DCA mensuel prévu : ${fmtEur(dcaMensuel)}/mois — investi ${dcaCible}.${objectifEuros > 0 ? `\nObjectif patrimonial : ${fmtEur(objectifEuros)}.` : ""}
Données positions : ${JSON.stringify(summary)}

Pour chaque position, estime un CAGR réaliste selon son type (ETF, small cap, large cap), secteur, signal IA.
Calcule valeur_projetee_position = valeur_actuelle × (1 + CAGR/100)^${horizonAns}.
Calcule cagr_portefeuille = CAGR moyen pondéré par valeur de toutes les positions.
Pour la valeur projetée TOTALE avec DCA, utilise CE MÊME cagr_portefeuille (pas un CAGR générique) : valeur_projetee_avec_dca = valeur_projetee_positions + DCA × ((1+r)^n - 1) / r avec r=cagr_portefeuille/100/12, n=${horizonAns*12}. Mets cagr_dca = cagr_portefeuille.

Retourne ce JSON exact (aucun texte autour) :
{"score":7,"label":"Très bon","resume":"2-3 phrases synthèse incluant l'effet DCA et le profil ${risque}","valeur_actuelle":${Math.round(totalVal)},"valeur_projetee":12500,"valeur_projetee_avec_dca":45000,"cagr_portefeuille":6.5,"cagr_dca":${dcaCagr},"points_forts":["point 1","point 2"],"points_faibles":["point 1","point 2"],"positions":[{"nom":"nom exact","valeur_actuelle":1500,"cagr":8.5,"valeur_projetee":3240,"impact":"positif","raison":"courte raison"}]}`;
            const data = await enqueueApi(() => callClaude(sys, user, false, 4, false, 2000));
            setAiPotentiel(data);
            save(AI_POTENTIEL_KEY, data);
          } catch (e) {
            const err = { error: e.message || "Erreur analyse IA" };
            setAiPotentiel(err);
          }
          setAiPotLoading(false);
        };

        const ap = aiPotentiel;
        const apColor = ap?.score >= 7 ? C.green : ap?.score >= 5 ? C.gold : C.red;

        return (
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "20px 22px", boxShadow: shadow.card, marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={{ fontWeight: "700", fontSize: "14px", color: C.ink }}>Potentiel du portefeuille</div>
                <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>Analyse IA globale · horizon {horizonInfo.label}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {ap && !ap.error && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "52px", height: "52px", borderRadius: "14px", background: apColor + "18", border: `2px solid ${apColor}40` }}>
                    <div style={{ fontSize: "22px", fontWeight: "900", color: apColor, lineHeight: 1 }}>{ap.score}</div>
                    <div style={{ fontSize: "8px", fontWeight: "700", color: apColor }}>/10</div>
                  </div>
                )}
                <button
                  onClick={analyzePortfolioPotentiel}
                  disabled={aiPotLoading || !getKey("anthropic")}
                  style={{ padding: "8px 18px", borderRadius: "12px", border: "none", cursor: aiPotLoading ? "not-allowed" : "pointer", background: aiPotLoading ? C.snowDim : "linear-gradient(135deg,#080B0F 0%,#1E3A5F 100%)", color: aiPotLoading ? C.inkSubtle : "#fff", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                  {aiPotLoading
                    ? <><ThinkingSpinner size={12} color={C.inkSubtle} /> Analyse en cours…</>
                    : ap && !ap.error ? "🔄 Relancer" : "🤖 Analyser le potentiel"}
                </button>
              </div>
            </div>

            {ap?.error && <div style={{ fontSize: "11px", color: C.red, marginBottom: "10px" }}>⚠ {ap.error}</div>}

            {ap && !ap.error && (
              <>
                {ap.resume && (
                  <div style={{ background: apColor + "0D", border: `1px solid ${apColor}30`, borderRadius: "12px", padding: "12px 14px", marginBottom: "12px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "800", color: apColor, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Analyse IA · {ap.label}</div>
                    <div style={{ fontSize: "12px", color: C.ink, lineHeight: "1.65" }}>{ap.resume}</div>
                  </div>
                )}
                {ap.valeur_projetee > 0 && (
                  <div style={{ background: "linear-gradient(135deg,rgba(5,150,105,0.06) 0%,rgba(30,58,95,0.06) 100%)", border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "12px", padding: "12px 16px", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", marginBottom: ap.valeur_projetee_avec_dca ? "10px" : 0 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>Valeur actuelle</div>
                        <div style={{ fontSize: "16px", fontWeight: "800", color: C.ink }}>{fmtEur(ap.valeur_actuelle || totalVal)}</div>
                      </div>
                      <div style={{ fontSize: "20px", color: C.inkSubtle }}>→</div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "9px", color: C.green, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>Positions seules · {horizonInfo.annees} ans</div>
                        <div style={{ fontSize: "18px", fontWeight: "800", color: C.green }}>{fmtEur(ap.valeur_projetee)}</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>CAGR estimé</div>
                        <div style={{ fontSize: "16px", fontWeight: "800", color: C.navy }}>+{ap.cagr_portefeuille?.toFixed(1)}%/an</div>
                      </div>
                    </div>
                    {ap.valeur_projetee_avec_dca > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", borderTop: `1px solid rgba(5,150,105,0.15)`, paddingTop: "10px" }}>
                        <div style={{ fontSize: "10px", fontWeight: "700", color: C.navy }}>+ DCA {fmtEur(Number(profil?.dcaMensuel)||0)}/mois · ~{ap.cagr_dca ?? "?"}%/an ({profil?.risque || "équilibré"})</div>
                        <div style={{ fontSize: "20px", color: C.inkSubtle }}>→</div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "9px", color: C.navy, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>Valeur projetée avec DCA · {horizonInfo.annees} ans</div>
                          <div style={{ fontSize: "22px", fontWeight: "900", color: C.navy }}>{fmtEur(ap.valeur_projetee_avec_dca)}</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>Multiplicateur</div>
                          <div style={{ fontSize: "16px", fontWeight: "800", color: C.navy }}>×{(ap.valeur_projetee_avec_dca / (ap.valeur_actuelle || totalVal)).toFixed(1)}</div>
                        </div>
                        {Number(profil?.objectifEuros) > 0 && (
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>vs Objectif</div>
                            <div style={{ fontSize: "16px", fontWeight: "800", color: ap.valeur_projetee_avec_dca >= Number(profil.objectifEuros) ? C.green : C.red }}>
                              {ap.valeur_projetee_avec_dca >= Number(profil.objectifEuros) ? "✓ " : ""}{Math.round(ap.valeur_projetee_avec_dca / Number(profil.objectifEuros) * 100)}%
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {((ap.points_forts?.length > 0) || (ap.points_faibles?.length > 0)) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                    {ap.points_forts?.length > 0 && (
                      <div style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "10px", padding: "10px 12px" }}>
                        <div style={{ fontSize: "9px", fontWeight: "800", color: C.green, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>▲ Points forts</div>
                        {ap.points_forts.map((p, i) => <div key={i} style={{ fontSize: "11px", color: C.ink, marginBottom: "3px" }}>· {p}</div>)}
                      </div>
                    )}
                    {ap.points_faibles?.length > 0 && (
                      <div style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "10px", padding: "10px 12px" }}>
                        <div style={{ fontSize: "9px", fontWeight: "800", color: C.red, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>▼ Points faibles</div>
                        {ap.points_faibles.map((p, i) => <div key={i} style={{ fontSize: "11px", color: C.ink, marginBottom: "3px" }}>· {p}</div>)}
                      </div>
                    )}
                  </div>
                )}
                {ap.positions?.length > 0 && (
                  <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 14px" }}>
                    <div style={{ fontSize: "9px", fontWeight: "800", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Impact par ligne</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {ap.positions.map((p, i) => {
                        const ic = p.impact === "positif" ? C.green : p.impact === "negatif" ? C.red : C.inkSubtle;
                        const ib = p.impact === "positif" ? C.greenLight : p.impact === "negatif" ? C.redLight : "transparent";
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", background: ib, borderRadius: "6px", padding: "5px 8px" }}>
                            <span style={{ fontSize: "10px", fontWeight: "800", color: ic, flexShrink: 0 }}>{p.impact === "positif" ? "▲" : p.impact === "negatif" ? "▼" : "·"}</span>
                            <span style={{ fontSize: "11px", fontWeight: "700", color: C.ink, flexShrink: 0, minWidth: "120px" }}>{p.nom}</span>
                            {p.cagr != null && <span style={{ fontSize: "10px", fontWeight: "700", color: ic, flexShrink: 0, background: ic + "18", borderRadius: "4px", padding: "1px 5px" }}>~{p.cagr}%/an</span>}
                            {p.valeur_projetee != null && <span style={{ fontSize: "10px", color: C.inkSubtle, flexShrink: 0 }}>→ {fmtEur(p.valeur_projetee)}</span>}
                            <span style={{ fontSize: "11px", color: C.inkMuted, lineHeight: "1.4" }}>{p.raison}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
            {!ap && !aiPotLoading && (
              <div style={{ textAlign: "center", padding: "20px 0", color: C.inkSubtle, fontSize: "12px" }}>
                Cliquez sur "Analyser le potentiel" pour obtenir une évaluation IA approfondie.
              </div>
            )}
            <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "10px" }}>⚠ Score indicatif. Ne constitue pas un conseil en investissement.</div>
          </div>
        );
      })()}

      {/* ── Projection par valeur ── */}
      <div style={{ background: C.cardGradPurp, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "22px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>
          Projection par valeur
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          {positions.map(pos => (
            <button key={pos.id} onClick={() => setSelectedPosId(pos.id === selectedPosId ? null : pos.id)} style={{
              padding: "6px 12px", borderRadius: "20px", border: `1px solid ${pos.id === selectedPosId ? C.navy : C.border}`,
              background: pos.id === selectedPosId ? C.navyLight : C.snowOff,
              color: pos.id === selectedPosId ? C.navy : C.inkMuted,
              fontSize: "11px", fontWeight: pos.id === selectedPosId ? "700" : "500",
              fontFamily: "Inter, sans-serif", cursor: "pointer",
            }}>
              {pos.nom.split(" ").slice(0,2).join(" ")}
            </button>
          ))}
        </div>
        {selectedPos
          ? <StockProjectionChart pos={selectedPos} onClose={() => setSelectedPosId(null)} />
          : <div style={{ fontSize: "12px", color: C.inkSubtle, padding: "16px 0", textAlign: "center" }}>
              Sélectionnez une valeur ci-dessus pour afficher sa projection
            </div>
        }
      </div>

      <div style={{ height: "20px" }} />
      <PriceEvolutionChart positions={positions} />
    </div>
  );
}






export default MarcheTab;
