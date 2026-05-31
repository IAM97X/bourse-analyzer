import { C, shadow } from "../constants/theme";
import { parsePrice, fmtEur, fmtCours } from "../lib/finance";
import { RISQUE_PCT, SIGNAL_CONFIG } from "../constants/config";
import { calcFraisCourtage, tauxFraisCourtage } from "../constants/courtiers";
import { StatBox, Card } from "./UI";
import { SignalBadge } from "./TabNav";

// ─── Conseil personnalisé ─────────────────────────────────────────────────────
function PersonalAdvice({ data, profil }) {
  if (!profil || !profil.capital || Number(profil.capital) <= 0) return null;
  const cours = parsePrice(data.performance?.cours_actuel);
  if (!cours || cours <= 0) return null;
  const capital   = Number(profil.capital);
  const maxPct    = RISQUE_PCT[profil.risque] || 0.10;
  const maxInvest = capital * maxPct;
  const nbActions = Math.floor(maxInvest / cours);
  const montant   = nbActions * cours;
  const frais     = calcFraisCourtage(montant);
  const partCapital = ((montant / capital) * 100).toFixed(1);
  const entree    = parsePrice(data.timing?.point_entree);
  const nbEntree  = entree && entree > 0 ? Math.floor(maxInvest / entree) : null;
  const fraisEntree = nbEntree ? calcFraisCourtage(nbEntree * entree) : 0;
  const risqueLabel = { prudent: "Prudent · 5% max", equilibre: "Équilibré · 10% max", dynamique: "Dynamique · 15% max", "tres-dynamique": "Très dynamique · 20% max" }[profil.risque] || "";
  return (
    <Card title="Conseil personnalisé — Gestion Libre" accentColor={C.goldDark}>
      <div style={{ fontSize: "11px", color: C.inkMuted, marginBottom: "14px", fontWeight: "500" }}>Profil {risqueLabel} · Capital {fmtEur(capital)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
        <StatBox label="Max / ligne" value={fmtEur(maxInvest)} color={C.goldDark} sensitive />
        <StatBox label="Titres possibles" value={nbActions > 0 ? `${nbActions} titres` : "Insuffisant"} color={C.green} />
        <StatBox label="Montant net" value={fmtEur(montant)} sensitive />
        <StatBox label="% Capital" value={`${partCapital} %`} />
      </div>
      {nbActions > 0 && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 16px", marginBottom: "12px" }}>
          <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Frais de courtage (Gestion Libre)</div>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <div><span style={{ fontSize: "11px", color: C.inkSubtle }}>Montant ordre : </span><strong style={{ color: C.ink }}>{fmtEur(montant)}</strong></div>
            <div><span style={{ fontSize: "11px", color: C.inkSubtle }}>Frais : </span><strong style={{ color: C.goldDark }}>{fmtEur(frais)}</strong> <span style={{ fontSize: "10px", color: C.inkSubtle }}>({montant <= 500 ? "fixe ≤500€" : "0,5% min 3,99€"})</span></div>
            <div><span style={{ fontSize: "11px", color: C.inkSubtle }}>Coût total : </span><strong style={{ color: C.navy }}>{fmtEur(montant + frais)}</strong></div>
            <div><span style={{ fontSize: "11px", color: C.inkSubtle }}>Impact : </span><strong style={{ color: frais / montant < 0.01 ? C.green : C.goldDark }}>{tauxFraisCourtage(montant)}%</strong></div>
          </div>
        </div>
      )}
      {nbEntree != null && nbEntree > 0 && entree && (
        <div style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "8px", padding: "10px 14px", marginBottom: "12px", fontSize: "13px", color: C.green }}>
          Au point d'entrée conseillé ({data.timing?.point_entree}) : <strong>{nbEntree} titres = {fmtEur(nbEntree * entree)}</strong>
          {fraisEntree > 0 && <span style={{ fontSize: "11px", color: C.inkMuted }}> + {fmtEur(fraisEntree)} frais = {fmtEur(nbEntree * entree + fraisEntree)} total</span>}
        </div>
      )}
      <p style={{ fontSize: "13px", color: C.inkMuted, margin: 0, lineHeight: "1.7" }}>
        Avec <strong style={{ color: C.ink }}>{fmtEur(capital)}</strong> disponibles, une position de <strong style={{ color: C.ink }}>{nbActions} titres à {fmtCours(cours)}</strong> représente {partCapital}% de votre capital — conforme au profil {profil.risque}.
      </p>
    </Card>
  );
}

// ─── ETF DCA Result Panel ─────────────────────────────────────────────────────
function ETFResultPanel({ data, query, timestamp, profil, onRefresh }) {
  const rawSignal = (data.verdict?.signal || "ATTENDRE").toUpperCase();
  const signal    = Object.keys(SIGNAL_CONFIG).find(k => rawSignal.includes(k)) || "ATTENDRE";
  const cfg       = SIGNAL_CONFIG[signal];
  const time      = timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dcaMensuel = Number(profil?.dcaMensuel) || 200;
  const cours      = parsePrice(data.performance?.cours_actuel);
  const frais200   = parsePrice(data.dca_conseil?.frais_courtage_200eur) || 1.99;
  const nbParts200 = cours ? Math.floor(200 / cours) : 0;
  const montant200 = nbParts200 * (cours || 0);
  const fraisReal  = calcFraisCourtage(montant200);
  const dcaNbParts = cours ? Math.floor(dcaMensuel / cours) : 0;
  const dcaMontant = dcaNbParts * (cours || 0);
  const dcaFrais   = calcFraisCourtage(dcaMontant);

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      {/* Header */}
      <div style={{ background: C.cardGrad, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "22px 26px", marginBottom: "16px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "6px", display: "flex", alignItems: "center", gap: "12px" }}>
          <span>Analyse ETF · DCA · {time}</span>
          <span style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "5px", padding: "2px 8px", color: C.navy, fontWeight: "700" }}>ETF</span>
          {data.eligible_pea && <span style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "5px", padding: "2px 8px", color: C.green, fontWeight: "700" }}>🇫🇷 PEA</span>}
          <button onClick={onRefresh} style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 10px", color: C.inkMuted, fontSize: "10px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", fontWeight: "500" }}>↻ Actualiser</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "24px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>{data.nom || query.toUpperCase()}</div>
            <div style={{ fontSize: "12px", color: C.inkMuted, marginTop: "4px" }}>
              {data.isin && <span style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "2px 8px", fontSize: "10px", fontWeight: "600", marginRight: "8px" }}>{data.isin}</span>}
              {data.emetteur && <span>{data.emetteur} · </span>}
              {data.indice_suivi && <span style={{ fontWeight: "600" }}>{data.indice_suivi}</span>}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
              {data.ter && <span style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "6px", padding: "3px 10px", fontSize: "11px", color: C.goldDark, fontWeight: "700" }}>TER {data.ter}</span>}
              {data.type && <span style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 10px", fontSize: "11px", color: C.inkMuted, fontWeight: "500" }}>{data.type}</span>}
              {data.fondamentaux?.dividende && <span style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 10px", fontSize: "11px", color: C.inkMuted, fontWeight: "500" }}>{data.fondamentaux.dividende}</span>}
            </div>
          </div>
          <SignalBadge signal={signal} />
        </div>
      </div>

      {/* Vue ensemble */}
      {data.vue_ensemble && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px 20px", marginBottom: "16px", fontSize: "14px", color: C.inkMuted, lineHeight: "1.75" }}>
          {data.vue_ensemble}
        </div>
      )}

      {/* Performance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <Card title="Performance" accentColor={C.green}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <StatBox label="Cours actuel" value={data.performance?.cours_actuel} color={C.navy} />
            <StatBox label="Évol. 1 an"   value={data.performance?.evolution_1an}  color={data.performance?.evolution_1an?.startsWith("+") ? C.green : C.red} />
            <StatBox label="Évol. 3 ans"  value={data.performance?.evolution_3ans} color={data.performance?.evolution_3ans?.startsWith("+") ? C.green : C.red} />
            <StatBox label="+ Haut 52s"   value={data.performance?.plus_haut_52s} />
          </div>
        </Card>
        <Card title="Caractéristiques" accentColor={C.navy}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <StatBox label="Capitalisation"    value={data.fondamentaux?.capitalisation} />
            <StatBox label="Nb composants"     value={data.fondamentaux?.nb_composants} />
            <StatBox label="TER"               value={data.ter} color={C.goldDark} />
            <StatBox label="Devise"            value={data.fondamentaux?.devise || "EUR"} />
          </div>
        </Card>
      </div>

      {/* Répartition géographique + sectorielle */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        {(data.repartition_geo || []).length > 0 && (
          <Card title="Répartition géographique" accentColor={C.navy}>
            {data.repartition_geo.map((g, i) => (
              <div key={i} style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "3px" }}>
                  <span>{g.zone}</span><span style={{ fontWeight: "700", color: C.navy }}>{g.poids}</span>
                </div>
                <div style={{ height: "4px", background: C.snowDim, borderRadius: "2px" }}>
                  <div style={{ height: "100%", background: C.navy, borderRadius: "2px", width: g.poids, maxWidth: "100%" }} />
                </div>
              </div>
            ))}
          </Card>
        )}
        {(data.repartition_sectorielle || []).length > 0 && (
          <Card title="Répartition sectorielle" accentColor={C.goldDark}>
            {data.repartition_sectorielle.map((s, i) => (
              <div key={i} style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "3px" }}>
                  <span>{s.secteur}</span><span style={{ fontWeight: "700", color: C.goldDark }}>{s.poids}</span>
                </div>
                <div style={{ height: "4px", background: C.snowDim, borderRadius: "2px" }}>
                  <div style={{ height: "100%", background: C.gold, borderRadius: "2px", width: s.poids, maxWidth: "100%" }} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Analyse technique */}
      {data.analyse_technique && (
        <Card title="Analyse technique" accentColor={C.navy}>
          <div className="ba-g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "14px" }}>
            <StatBox label="Tendance"    value={data.analyse_technique.tendance}   color={data.analyse_technique.tendance === "Haussière" ? C.green : data.analyse_technique.tendance === "Baissière" ? C.red : C.goldDark} />
            <StatBox label="Support"     value={data.analyse_technique.support} />
            <StatBox label="Résistance"  value={data.analyse_technique.resistance} />
            <StatBox label="RSI"         value={data.analyse_technique.rsi} color={
              parseFloat(data.analyse_technique.rsi) > 70 ? C.red :
              parseFloat(data.analyse_technique.rsi) < 30 ? C.green : C.goldDark
            } />
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            {data.analyse_technique.ma50  && <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.inkMuted }}><strong style={{ color: C.ink }}>MA50</strong> {data.analyse_technique.ma50}</div>}
            {data.analyse_technique.ma200 && <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.inkMuted }}><strong style={{ color: C.ink }}>MA200</strong> {data.analyse_technique.ma200}</div>}
            {data.analyse_technique.macd  && <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.inkMuted }}><strong style={{ color: C.ink }}>MACD</strong> {data.analyse_technique.macd}</div>}
          </div>
          {data.analyse_technique.commentaire_technique && (
            <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.7", margin: 0 }}>{data.analyse_technique.commentaire_technique}</p>
          )}
        </Card>
      )}

      {/* Macro */}
      {data.macro && (
        <Card title="Contexte macro-économique" accentColor={C.goldDark}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { label: "Impact taux d'intérêt",   val: data.macro.impact_taux },
              { label: "Impact croissance PIB",    val: data.macro.impact_croissance_pib },
              { label: "Impact inflation",         val: data.macro.impact_inflation },
              { label: "Atouts diversification",   val: data.macro.atouts_diversification },
            ].filter(r => r.val).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: "10px" }}>
                <span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", flexShrink: 0, paddingTop: "2px", minWidth: "130px" }}>{r.label}</span>
                <span style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>{r.val}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Points forts / vigilance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <Card title="Points forts" accentColor={C.green}>
          {(data.points_forts || []).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "7px 0", borderBottom: i < data.points_forts.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.green, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>{p}</span>
            </div>
          ))}
        </Card>
        <Card title="Points de vigilance" accentColor={C.red}>
          {(data.points_vigilance || []).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "7px 0", borderBottom: i < data.points_vigilance.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.red, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>{p}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* DCA Conseil — section centrale */}
      {data.dca_conseil && (
        <Card title="Argumentaire DCA — Gestion Libre" accentColor={C.navy}>
          {data.dca_conseil.argumentaire_principal && (
            <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.75", marginBottom: "16px" }}>{data.dca_conseil.argumentaire_principal}</p>
          )}
          {data.dca_conseil.comparaison_alternatives && (
            <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
              <div style={{ fontSize: "10px", color: C.navy, fontWeight: "700", marginBottom: "6px" }}>POURQUOI CET ETF PLUTÔT QU'UN AUTRE</div>
              <p style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.6", margin: 0 }}>{data.dca_conseil.comparaison_alternatives}</p>
            </div>
          )}
          {/* Calcul frais de courtage */}
          <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px", marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>Coûts de transaction</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {/* Seuil minimal 200€ PEA */}
              <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px" }}>
                <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", marginBottom: "8px" }}>ORDRE 200 € (SEUIL PEA)</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                  <span>Parts achetables</span><strong style={{ color: C.ink }}>{nbParts200} parts</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                  <span>Montant net</span><strong style={{ color: C.ink }}>{fmtEur(montant200)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                  <span>Frais de courtage</span><strong style={{ color: C.goldDark }}>{fmtEur(fraisReal)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, borderTop: `1px solid ${C.border}`, paddingTop: "6px", marginTop: "4px" }}>
                  <span>Coût total</span><strong style={{ color: C.navy }}>{fmtEur(montant200 + fraisReal)}</strong>
                </div>
                <div style={{ marginTop: "6px", fontSize: "10px", color: fraisReal / montant200 < 0.01 ? C.green : C.goldDark, fontWeight: "600" }}>
                  Impact frais : {tauxFraisCourtage(montant200)}% {fraisReal / montant200 < 0.01 ? "✓ Optimal" : "⚠ Élevé"}
                </div>
              </div>
              {/* DCA mensuel réel */}
              {dcaMensuel > 0 && (
                <div style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "8px", padding: "12px" }}>
                  <div style={{ fontSize: "10px", color: C.green, fontWeight: "700", marginBottom: "8px" }}>VOTRE DCA {fmtEur(dcaMensuel)}/MOIS</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                    <span>Parts achetables</span><strong style={{ color: C.ink }}>{dcaNbParts} parts</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                    <span>Montant net</span><strong style={{ color: C.ink }}>{fmtEur(dcaMontant)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                    <span>Frais de courtage</span><strong style={{ color: C.goldDark }}>{fmtEur(dcaFrais)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, borderTop: `1px solid rgba(5,150,105,0.2)`, paddingTop: "6px", marginTop: "4px" }}>
                    <span>Coût total</span><strong style={{ color: C.green }}>{fmtEur(dcaMontant + dcaFrais)}</strong>
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "10px", color: C.green, fontWeight: "600" }}>
                    Impact frais : {tauxFraisCourtage(dcaMontant)}%
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Risques */}
          {(data.dca_conseil.risques || []).length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", color: C.red, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Risques principaux</div>
              {data.dca_conseil.risques.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "5px" }}>
                  <span style={{ color: C.red, fontWeight: "700", flexShrink: 0 }}>▸</span>
                  <span style={{ fontSize: "12px", color: C.inkMuted }}>{r}</span>
                </div>
              ))}
            </div>
          )}
          {data.dca_conseil.potentiel_croissance && (
            <div style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "8px", padding: "12px 16px" }}>
              <div style={{ fontSize: "10px", color: C.goldDark, fontWeight: "700", marginBottom: "6px" }}>POTENTIEL DE CROISSANCE</div>
              <p style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.6", margin: 0 }}>{data.dca_conseil.potentiel_croissance}</p>
            </div>
          )}
        </Card>
      )}

      {/* Timing */}
      <Card title="Timing & Point d'entrée" accentColor={C.navy}>
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1.5px", fontWeight: "600", textTransform: "uppercase", marginBottom: "6px" }}>Zone d'entrée conseillée</div>
          <div style={{ fontSize: "24px", fontWeight: "800", color: C.navy }}>{data.timing?.point_entree}</div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {(data.timing?.catalyseurs || []).map((c, i) => (
            <div key={i} style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.navy, fontWeight: "500" }}>{c}</div>
          ))}
        </div>
        {data.timing?.recommandation_timing && (
          <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.7", margin: 0 }}>{data.timing.recommandation_timing}</p>
        )}
      </Card>

      {/* Verdict */}
      <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "12px", padding: "24px 28px", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: cfg.color, fontWeight: "700", textTransform: "uppercase" }}>Verdict pour votre DCA</div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "2px" }}>Cible 12 mois</div>
            <div style={{ fontSize: "26px", fontWeight: "800", color: cfg.color }}>{data.verdict?.cible_12m}</div>
          </div>
        </div>
        <div style={{ fontSize: "22px", fontWeight: "800", color: cfg.color, marginBottom: "12px" }}>{cfg.icon} {signal}</div>
        <p style={{ fontSize: "14px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>{data.verdict?.justification}</p>
      </div>

      <div style={{ fontSize: "11px", color: C.inkSubtle, textAlign: "center", padding: "8px" }}>
        ⚠ Analyse IA informative uniquement · L'utilisateur est seul responsable de ses décisions d'investissement
      </div>
    </div>
  );
}

// ─── Result Panel ─────────────────────────────────────────────────────────────
function ResultPanel({ data, query, timestamp, profil, onRefresh }) {
  const rawSignal = (data.verdict?.signal || "ATTENDRE").toUpperCase();
  const signal = Object.keys(SIGNAL_CONFIG).find(k => rawSignal.includes(k)) || "ATTENDRE";
  const cfg = SIGNAL_CONFIG[signal];
  const time = timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      {/* Header card */}
      <div style={{ background: C.cardGradPurp, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "22px 26px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", boxShadow: shadow.card }}>
        <div>
          <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "6px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span>Rapport d'analyse · {time}</span>
            <button onClick={onRefresh} style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 10px", color: C.inkMuted, fontSize: "10px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", fontWeight: "500" }}>↻ Actualiser</button>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>{data.nom || query.toUpperCase()}</div>
          <div style={{ fontSize: "13px", color: C.inkMuted, marginTop: "3px", fontWeight: "500" }}>{data.secteur}</div>
        </div>
        <SignalBadge signal={signal} />
      </div>

      {/* Vue ensemble */}
      {data.vue_ensemble && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px 20px", marginBottom: "16px", fontSize: "14px", color: C.inkMuted, lineHeight: "1.75" }}>
          {data.vue_ensemble}
        </div>
      )}

      {/* Performance + Fondamentaux */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <Card title="Performance" accentColor={C.green}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <StatBox label="Cours actuel" value={data.performance?.cours_actuel} color={C.navy} />
            <StatBox label="Évol. 1 an" value={data.performance?.evolution_1an} color={data.performance?.evolution_1an?.startsWith("+") ? C.green : C.red} />
            <StatBox label="+ Haut 52s" value={data.performance?.plus_haut_52s} />
            <StatBox label="+ Bas 52s" value={data.performance?.plus_bas_52s} />
          </div>
        </Card>
        <Card title="Fondamentaux" accentColor={C.navy}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <StatBox label="PER" value={data.fondamentaux?.per} />
            <StatBox label="Dividende" value={data.fondamentaux?.dividende} color={C.goldDark} />
            <StatBox label="Capitalisation" value={data.fondamentaux?.capitalisation} />
            <StatBox label="Dette / Tréso" value={data.fondamentaux?.dette_nette} />
          </div>
        </Card>
      </div>

      {/* Analyse technique */}
      {data.analyse_technique && (
        <Card title="Analyse technique" accentColor={C.navy}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "12px" }}>
            <StatBox label="Tendance"   value={data.analyse_technique.tendance}   color={data.analyse_technique.tendance === "Haussière" ? C.green : data.analyse_technique.tendance === "Baissière" ? C.red : C.goldDark} />
            <StatBox label="RSI"        value={data.analyse_technique.rsi}        color={parseFloat(data.analyse_technique.rsi) > 70 ? C.red : parseFloat(data.analyse_technique.rsi) < 30 ? C.green : C.goldDark} />
            <StatBox label="Support"    value={data.analyse_technique.support} />
            <StatBox label="Résistance" value={data.analyse_technique.resistance} />
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
            {data.analyse_technique.ma50  && <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.inkMuted }}><strong style={{ color: C.ink }}>MM50</strong> {data.analyse_technique.ma50}</div>}
            {data.analyse_technique.ma200 && <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.inkMuted }}><strong style={{ color: C.ink }}>MM200</strong> {data.analyse_technique.ma200}</div>}
            {data.analyse_technique.macd  && <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.inkMuted }}><strong style={{ color: C.ink }}>MACD</strong> {data.analyse_technique.macd}</div>}
          </div>
          {data.analyse_technique.signal_technique && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <span style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px" }}>Signal tech.</span>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#fff", background: data.analyse_technique.signal_technique === "ACHAT" ? C.green : data.analyse_technique.signal_technique === "PRUDENCE" ? C.red : C.goldDark, borderRadius: "5px", padding: "2px 8px" }}>{data.analyse_technique.signal_technique}</span>
            </div>
          )}
          {data.analyse_technique.commentaire_technique && (
            <p style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.65", margin: 0 }}>{data.analyse_technique.commentaire_technique}</p>
          )}
        </Card>
      )}

      {/* Points forts / vigilance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <Card title="Points forts" accentColor={C.green}>
          {(data.points_forts || []).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: i < data.points_forts.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.green, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.5" }}>{p}</span>
            </div>
          ))}
        </Card>
        <Card title="Points de vigilance" accentColor={C.red}>
          {(data.points_vigilance || []).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: i < data.points_vigilance.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.red, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.5" }}>{p}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Valorisation */}
      <Card title="Valorisation & Consensus analystes" accentColor={C.goldDark}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "14px" }}>
          <StatBox label="Objectif moyen" value={data.valorisation?.objectif_moyen} color={C.goldDark} />
          <StatBox label="Objectif haut" value={data.valorisation?.objectif_haut} color={C.green} />
          <StatBox label="Objectif bas" value={data.valorisation?.objectif_bas} color={C.red} />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { label: `Potentiel : ${data.valorisation?.potentiel}`, bg: C.goldLight, color: C.goldDark },
            { label: `${data.valorisation?.nb_analystes} analystes`, bg: C.snowOff, color: C.inkMuted },
            { label: data.valorisation?.appreciation, bg: C.snowOff, color: C.inkMuted },
          ].map((b, i) => b.label && (
            <div key={i} style={{ background: b.bg, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 14px", fontSize: "12px", color: b.color, fontWeight: "600" }}>{b.label}</div>
          ))}
        </div>
      </Card>

      {/* Timing */}
      <Card title="Timing & Point d'entrée" accentColor={C.navy}>
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1.5px", fontWeight: "600", textTransform: "uppercase", marginBottom: "6px" }}>Zone d'entrée conseillée</div>
          <div style={{ fontSize: "24px", fontWeight: "800", color: C.navy, letterSpacing: "-0.02em" }}>{data.timing?.point_entree}</div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {(data.timing?.catalyseurs || []).map((c, i) => (
            <div key={i} style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.navy, fontWeight: "500" }}>{c}</div>
          ))}
        </div>
        <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.7", margin: 0 }}>{data.timing?.recommandation_timing}</p>
      </Card>

      <PersonalAdvice data={data} profil={profil} />

      {/* Verdict */}
      <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "12px", padding: "24px 28px", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: cfg.color, fontWeight: "700", textTransform: "uppercase" }}>Verdict final</div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "2px" }}>Cible 12 mois</div>
            <div style={{ fontSize: "26px", fontWeight: "800", color: cfg.color, letterSpacing: "-0.02em" }}>{data.verdict?.cible_12m}</div>
          </div>
        </div>
        <div style={{ fontSize: "22px", fontWeight: "800", color: cfg.color, letterSpacing: "1px", marginBottom: "12px" }}>{cfg.icon} {signal}</div>
        <p style={{ fontSize: "14px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>{data.verdict?.justification}</p>
      </div>

      <div style={{ fontSize: "11px", color: C.inkSubtle, textAlign: "center", padding: "8px", letterSpacing: "0.5px" }}>
        ⚠ Analyse IA informative uniquement · L'utilisateur est seul responsable de ses décisions d'investissement
      </div>
    </div>
  );
}

// ─── Portfolio Result ─────────────────────────────────────────────────────────
function PortfolioResult({ data, timestamp }) {
  const time = timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ animation: "fadeIn 0.4s ease", marginTop: "20px" }}>
      <div style={{ background: C.cardGrad, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "22px 26px", marginBottom: "16px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "8px" }}>Analyse portefeuille · {time}</div>
        <p style={{ fontSize: "15px", color: C.ink, lineHeight: "1.6", margin: "0 0 10px", fontWeight: "400" }}>{data.resume}</p>
        <div style={{ fontSize: "22px", fontWeight: "800", color: C.navy, letterSpacing: "-0.02em" }}>{data.performance_globale}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <Card title="Forces" accentColor={C.green}>
          {(data.forces || []).map((f, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "7px 0", borderBottom: i < data.forces.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.green, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "13px", color: C.inkMuted }}>{f}</span>
            </div>
          ))}
        </Card>
        <Card title="Faiblesses" accentColor={C.red}>
          {(data.faiblesses || []).map((f, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "7px 0", borderBottom: i < data.faiblesses.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.red, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "13px", color: C.inkMuted }}>{f}</span>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Diversification" accentColor={C.navy}>
        <div style={{ fontSize: "13px", color: C.ink, marginBottom: "6px" }}><span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600" }}>GÉOGRAPHIE · </span>{data.diversification?.geographie}</div>
        <div style={{ fontSize: "13px", color: C.ink, marginBottom: "12px" }}><span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600" }}>CONCENTRATION · </span>{data.diversification?.concentration}</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(data.diversification?.secteurs || []).map((s, i) => (
            <div key={i} style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.navy, fontWeight: "600" }}>{s.nom} {s.poids}</div>
          ))}
        </div>
      </Card>

      <Card title="Cohérence profil" accentColor={C.goldDark}>
        <p style={{ fontSize: "13px", color: C.inkMuted, margin: 0, lineHeight: "1.7" }}>{data.coherence_profil}</p>
      </Card>

      <Card title="Recommandations" accentColor={C.green}>
        {(data.recommandations || []).map((r, i) => (
          <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: i < data.recommandations.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <span style={{ color: C.green, flexShrink: 0, fontWeight: "700" }}>›</span>
            <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.5" }}>{r}</span>
          </div>
        ))}
      </Card>

      <Card title="Nouvelles opportunités" accentColor={C.goldDark}>
        {(data.opportunites || []).map((o, i) => (
          <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: i < data.opportunites.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <span style={{ color: C.goldDark, flexShrink: 0, fontWeight: "700" }}>›</span>
            <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.5" }}>{o}</span>
          </div>
        ))}
      </Card>

      <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "12px", padding: "22px 26px" }}>
        <div style={{ fontSize: "10px", color: C.navy, letterSpacing: "2px", fontWeight: "700", textTransform: "uppercase", marginBottom: "10px" }}>Verdict global</div>
        <p style={{ fontSize: "14px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>{data.verdict_global}</p>
      </div>

      <div style={{ fontSize: "11px", color: C.inkSubtle, textAlign: "center", padding: "14px", letterSpacing: "0.5px" }}>
        ⚠ Analyse IA informative uniquement · L'utilisateur est seul responsable de ses décisions d'investissement
      </div>
    </div>
  );
}


export { ETFResultPanel, ResultPanel, PortfolioResult };
