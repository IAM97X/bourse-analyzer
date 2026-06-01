import { useState, useEffect } from "react";
import { C, shadow } from "../constants/theme";
import { fmtEur, fmtCours, fmtPct, sanitizePositions, isETFName, getEuronextUrl } from "../lib/finance";
import { load, save } from "../lib/storage";
import { Card, StatBox } from "./UI";
import Tooltip from "./Tooltip";
import CompanyAvatar from "./CompanyAvatar";
import { SIGNAL_CONFIG, UI, MOIS_FR, DEFAULT_POSITIONS } from "../constants/config";
import { COURTIERS, calcFraisCourtage, tauxFraisCourtage, getCourtierForAccount } from "../constants/courtiers";

function DCAStrategy({ positions, profil, marketScores, marketScoringUi, onRunScoring, onSaveProfil }) {
  const dcaMensuel   = Number(profil?.dcaMensuel) || 0;
  const dcaDuree     = Number(profil?.dcaDuree) || 120;
  const courtierKey  = getCourtierForAccount(profil, "PEA");
  const courtierCfg  = COURTIERS[courtierKey] || COURTIERS.boursobank;
  const [expandedRaisons, setExpandedRaisons]   = useState({});

  // ── Scoring mécanique (avant hooks conditionnels) ─────────────────────────
  const totalActuel  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);

  // Capital réel investi : depuis les avis opérés si disponibles, sinon PRU × qté
  const capitalReel = (() => {
    const ops = load("bourse_avis_operes", []);
    if (!ops.length) return totalInvesti;
    const achats = ops.filter(o => o.type === "ACHAT")
      .reduce((s, o) => s + (parseFloat(o.quantite)||0) * (parseFloat(o.prixUnitaire)||0) + (parseFloat(o.frais)||0), 0);
    const ventes = ops.filter(o => o.type === "VENTE")
      .reduce((s, o) => s + (parseFloat(o.quantite)||0) * (parseFloat(o.prixUnitaire)||0) - (parseFloat(o.frais)||0), 0);
    return Math.max(0, achats - ventes);
  })();
  const n = positions.length;
  const scored = positions.map(pos => {
    const cours    = pos.dernierCours || pos.pru;
    const valeur   = cours * pos.quantite;
    const poids    = totalActuel > 0 ? valeur / totalActuel : 1 / n;
    const poidsRef = 1 / n;
    const etf        = isETFName(pos.nom);
    const sousProfit = Math.max(0, pos.pru - cours) / pos.pru;
    const sousPond   = Math.max(0, poidsRef - poids) / poidsRef;
    const surPond    = Math.max(0, poids - poidsRef) / poidsRef;
    // ETF : potentiel de base uniquement si pas surpondéré — plancher réduit si déjà surchargé
    const potentiel  = etf ? Math.max(0, 0.30 - surPond * 0.20) : sousProfit;
    const nature     = etf ? 1.0 : 0.45;
    // Pénalité concentration : tout titre > 30% du portefeuille (ETF inclus)
    const concentration = poids > 0.30;
    const penaliteConc = concentration ? Math.min(0.25, (poids - 0.30) * 1.0) : 0;
    const scoreMeca  = Math.max(0, potentiel * 0.50 + nature * 0.30 + sousPond * 0.20 - penaliteConc);

    // Ajustement IA marché : score_marche sur 0-20, normalisé 0-1 pour le calcul
    const iaEntry   = marketScores?.find(s => s.isin === pos.isin || s.nom === pos.nom);
    const scoreIA   = iaEntry ? (iaEntry.score_marche > 1 ? iaEntry.score_marche / 20 : iaEntry.score_marche) : 0.5;
    // Score final : 55% mécanique · 45% IA marché
    const score = scoreMeca * 0.55 + scoreIA * 0.45;

    const raisons = [];
    if (etf)                       raisons.push("ETF — compounder long terme privilégié");
    if (cours < pos.pru)           raisons.push("Cours sous PRU — moyenne à la baisse");
    if (sousPond > 0.3)            raisons.push("Ligne sous-pondérée — rééquilibrage utile");
    if (iaEntry?.signal === "ACHAT")     raisons.push("Signal IA : ACHAT — actualité favorable");
    if (iaEntry?.signal === "RENFORCER") raisons.push("Signal IA : RENFORCER — momentum positif");
    if (iaEntry?.catalyseur_cle)   raisons.push(`Catalyseur : ${iaEntry.catalyseur_cle}`);
    if (concentration)             raisons.push(`⚠ Concentration ${(poids*100).toFixed(0)}% — risque idiosyncratique élevé`);
    if (!etf && cours >= pos.pru && sousPond <= 0.3 && !iaEntry) raisons.push("Conviction sectorielle long terme");
    return { ...pos, cours, poids, score, scoreMeca, scoreIA, raisons, sousPRU: cours < pos.pru, etf, iaEntry };
  });
  const prioritaire = scored.length > 0 ? [...scored].sort((a, b) => b.score - a.score)[0] : null;

  if (positions.length === 0) return null;

  if (dcaMensuel <= 0) return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "22px", padding: "36px", textAlign: "center", boxShadow: shadow.card, marginTop: "8px" }}>
      <div style={{ fontSize: "14px", fontWeight: "700", color: C.ink, marginBottom: "8px" }}>Stratégie DCA non configurée</div>
      <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.65", marginBottom: "18px" }}>
        Définissez votre montant DCA mensuel dans l'onglet <strong>Profil</strong> pour activer la sélection automatique de l'action prioritaire du mois, le calcul des frais de courtage et la projection de votre portefeuille.
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "10px 18px", fontSize: "12px", color: C.navy, fontWeight: "700" }}>
        ⚙ Aller dans Profil → DCA mensuel
      </div>
    </div>
  );

  if (!prioritaire) return null;

  // ── Calcul achat + frais de courtage ───────────────────────────────────────
  const minOrdre         = Math.max(courtierCfg.minOrdre, prioritaire.cours); // ≥ 1 titre
  const titresAchetables = dcaMensuel >= minOrdre ? Math.floor(dcaMensuel / prioritaire.cours) : 0;
  const montantReel      = titresAchetables * prioritaire.cours;
  const fraisBourso      = calcFraisCourtage(montantReel, courtierKey);
  const coutTotal        = montantReel + fraisBourso;
  const reste            = dcaMensuel - montantReel;
  const manque           = Math.max(minOrdre, prioritaire.cours) - dcaMensuel;
  const minPourUnTitre   = Math.ceil(prioritaire.cours * 100) / 100;
  const surplusConseille = titresAchetables > 0 ? reste : manque;
  const peutSuggererPlus = titresAchetables === 0 ||
    (reste > 0 && Math.floor((dcaMensuel + reste) / prioritaire.cours) > titresAchetables);

  // Nouveau PRU après achat
  const investActuel = prioritaire.pru * prioritaire.quantite;
  const nouvelInvest = investActuel + montantReel;
  const nouvelleQte  = prioritaire.quantite + titresAchetables;
  const nouveauPRU   = nouvelleQte > 0 ? nouvelInvest / nouvelleQte : prioritaire.pru;

  // Frais si DCA augmenté (1 titre de plus)
  const montantPlus    = (titresAchetables + 1) * prioritaire.cours;
  const fraisPlus      = calcFraisCourtage(montantPlus, courtierKey);

  // DCA min conseillé = max(minOrdre courtier, 1 titre + frais raisonnables)
  const dcaMinConseille = Math.max(minPourUnTitre + fraisBourso, minOrdre, prioritaire.cours * 1.01);

  // ── Projection réaliste 3 scénarios ──────────────────────────────────────
  const projScenario = (tauxAnnuel, mois) => {
    const r = Math.pow(1 + tauxAnnuel, 1 / 12) - 1;
    return totalActuel * Math.pow(1 + r, mois) +
      (r > 0 ? dcaMensuel * (Math.pow(1 + r, mois) - 1) / r : dcaMensuel * mois);
  };
  const durLabel = (m) => m >= 24 ? `${m / 12} ans` : m === 12 ? "1 an" : `${m} mois`;
  const maxMois  = Math.max(dcaDuree, 24);
  const horizons = [6, 12, Math.min(36, maxMois), Math.min(60, maxMois), Math.min(120, maxMois)].filter((v, i, a) => a.indexOf(v) === i && v <= maxMois);

  const moisLabel = MOIS_FR[new Date().getMonth()] + " " + new Date().getFullYear();
  const dcaJour   = Number(profil?.dcaJour) || 5;
  const etfPrioritaire = isETFName(prioritaire.nom);

  return (
    <Card title={`Stratégie DCA — ${moisLabel} · le ${dcaJour < 10 ? `0${dcaJour}` : dcaJour}`} accentColor={C.navy}>
      {/* Résumé budget */}
      <div className="ba-g4" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "8px", marginBottom: "10px" }}>
        <StatBox label="DCA mensuel"     value={fmtEur(dcaMensuel)} color={C.navy} sensitive />
        <StatBox label="Durée restante"  value={durLabel(dcaDuree)} />
        <StatBox label="Investi"         value={fmtEur(capitalReel)} color={C.ink} sensitive />
        <StatBox label="Valeur actuelle" value={fmtEur(totalActuel)} color={C.navy} sensitive />
        <StatBox label="Plus-value"      value={fmtPct(capitalReel > 0 ? (totalActuel - capitalReel) / capitalReel * 100 : 0)} color={totalActuel >= capitalReel ? C.green : C.red} sensitive />
      </div>
      {/* Info inflation */}
      {dcaMensuel > 0 && (() => {
        const inflation = parseFloat(localStorage.getItem("bourse_inflation_rate") || "2.5") || 2.5;
        const ans = [1, 3, 5, 10].map(y => ({ y, v: dcaMensuel * Math.pow(1 + inflation / 100, y) }));
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.18)", borderRadius: "10px", padding: "8px 14px", marginBottom: "12px" }}>
            <span style={{ fontSize: "11px", color: C.goldDark, fontWeight: "700" }}>Inflation {inflation}%/an</span>
            <span style={{ fontSize: "11px", color: C.inkSubtle }}>Pour maintenir le même pouvoir d'achat :</span>
            {ans.map(({ y, v }) => (
              <span key={y} style={{ fontSize: "11px", color: C.goldDark, fontWeight: "600", background: "rgba(245,158,11,0.1)", borderRadius: "6px", padding: "2px 8px" }}>
                +{y}an{y > 1 ? "s" : ""} → {fmtEur(v)}/mois
              </span>
            ))}
          </div>
        );
      })()}

      {/* Bandeau scoring IA marché */}
      {marketScoringUi === UI.LOADING && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "9px 14px", marginBottom: "14px" }}>
            <span style={{ fontSize: "11px", color: C.navy, fontWeight: "600" }}>Analyse de l'actualité marché sur toutes les lignes en cours…</span>
          <span style={{ fontSize: "11px", color: C.inkSubtle, marginLeft: "auto" }}>Le scoring final sera affiné à réception</span>
        </div>
      )}
      {marketScoringUi === UI.RESULT && marketScores && (
        <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "10px 14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "9px", color: C.navy, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>
            Scoring marché IA
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {[...scored].sort((a, b) => b.score - a.score).map((pos, i) => {
              const sig = pos.iaEntry?.signal || "—";
              const sigColor = sig === "ACHAT" ? C.green : sig === "RENFORCER" ? C.navy : sig === "VENDRE" ? C.red : sig === "PRUDENCE" ? C.red : C.goldDark;
              return (
                <div key={pos.id} style={{ display: "flex", alignItems: "center", gap: "7px", background: C.snow, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "6px 10px" }}>
                  <CompanyAvatar nom={pos.nom} isin={pos.isin} size={30} />
                  <span style={{ fontSize: "11px", fontWeight: "700", color: C.ink }}>{pos.nom.split(" ")[0]}</span>
                  <span style={{ fontSize: "10px", fontWeight: "700", color: sigColor, background: sigColor + "18", borderRadius: "99px", padding: "2px 7px" }}>{sig}</span>
                  {pos.iaEntry
                    ? <span style={{ fontSize: "10px", color: C.inkSubtle }}>{Math.round(pos.scoreIA * 20)}/20</span>
                    : <span style={{ fontSize: "10px", color: C.inkSubtle, opacity: 0.5 }} title="Analyse IA non lancée">—</span>
                  }
                </div>
              );
            })}
          </div>
          {prioritaire.iaEntry?.resume && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: C.navy, fontStyle: "italic", lineHeight: "1.55", borderTop: `1px solid rgba(30,58,95,0.12)`, paddingTop: "8px" }}>
              {prioritaire.iaEntry.resume}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── ACTION PRIORITAIRE DU MOIS ─────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div style={{ border: `2px solid ${C.navy}`, borderRadius: "16px", overflow: "hidden", marginBottom: "12px" }}>
        {/* Header prioritaire */}
        <div style={{ background: C.navy, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.6)", letterSpacing: "2px", fontWeight: "700", textTransform: "uppercase", marginBottom: "4px" }}>
              Action prioritaire — {moisLabel} · le {dcaJour < 10 ? `0${dcaJour}` : dcaJour}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "20px", fontWeight: "800", color: C.snow }}>{prioritaire.nom}</span>
              {prioritaire.isin && <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", fontWeight: "600" }}>{prioritaire.isin}</span>}
              {etfPrioritaire && <span style={{ background: "rgba(255,255,255,0.15)", borderRadius: "5px", padding: "2px 8px", fontSize: "10px", color: C.snow, fontWeight: "700" }}>ETF</span>}
              {prioritaire.sousPRU && <span style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "5px", padding: "2px 8px", fontSize: "10px", color: C.goldDark, fontWeight: "700" }}>Sous PRU</span>}
              {prioritaire.isin && (() => {
                const url = getEuronextUrl(prioritaire.isin, prioritaire.nom);
                return (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    style={{ background: "rgba(255,255,255,0.15)", borderRadius: "5px", padding: "2px 8px", fontSize: "10px", color: C.snow, fontWeight: "700", textDecoration: "none" }}>
                    Euronext ↗
                  </a>
                );
              })()}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", fontWeight: "600", marginBottom: "2px" }}>COURS ACTUEL</div>
            <div style={{ fontSize: "26px", fontWeight: "800", color: C.snow }}>{fmtCours(prioritaire.cours)}</div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>PRU : {fmtCours(prioritaire.pru)} · {prioritaire.sousPRU ? "−" : "+"}{fmtPct(Math.abs((prioritaire.cours - prioritaire.pru) / prioritaire.pru * 100))}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0", alignItems: "start" }}>

        {/* Colonne gauche : plan d'achat */}
        <div style={{ padding: "16px 18px", borderRight: `1px solid ${C.border}` }}>
          {/* Raisons du choix */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
            {prioritaire.raisons.map((r, i) => {
              const isCatalyseur = r.startsWith("Catalyseur :");
              const isLong = r.length > 80;
              const expanded = expandedRaisons[i];
              const displayText = isCatalyseur && isLong && !expanded ? r.slice(0, 80) + "…" : r;
              return (
                <div key={i}
                  onClick={isCatalyseur && isLong ? () => setExpandedRaisons(prev => ({ ...prev, [i]: !prev[i] })) : undefined}
                  style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "6px", padding: "4px 12px", fontSize: "11px", color: C.navy, fontWeight: "600", cursor: isCatalyseur && isLong ? "pointer" : "default", maxWidth: expanded ? "100%" : undefined }}>
                  ▸ {displayText}{isCatalyseur && isLong && <span style={{ marginLeft: "4px", opacity: 0.6 }}>{expanded ? "voir moins" : "voir plus"}</span>}
                </div>
              );
            })}
          </div>

          {/* Plan d'achat */}

        {/* Achat + frais de courtage */}
        {titresAchetables > 0 ? (
          <div style={{ background: C.snow, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "8px", padding: "14px 16px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "13px", color: C.inkMuted, marginBottom: "4px" }}>Avec votre DCA de <strong style={{ color: C.ink }}>{fmtEur(dcaMensuel)}</strong></div>
                <div style={{ fontSize: "16px", fontWeight: "800", color: C.green }}>
                  Acheter {titresAchetables} titre{titresAchetables > 1 ? "s" : ""} = {fmtEur(montantReel)}
                </div>
              </div>
              {prioritaire.sousPRU && nouvelleQte > 0 && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600", marginBottom: "2px" }}>Nouveau PRU après achat</div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: C.green }}>{fmtCours(nouveauPRU)}</div>
                  <div style={{ fontSize: "11px", color: C.inkMuted }}>
                    ({nouveauPRU < prioritaire.pru ? "−" : "="}{fmtEur(Math.abs(prioritaire.pru - nouveauPRU))} vs actuel)
                  </div>
                </div>
              )}
            </div>
            {/* Frais de courtage */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px 12px" }}>
              <span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600" }}>Frais :</span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: C.goldDark }}>{fmtEur(fraisBourso)}</span>
              <span style={{ fontSize: "10px", color: C.inkSubtle }}>·</span>
              <span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600" }}>Coût total :</span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: C.navy }}>{fmtEur(coutTotal)}</span>
              <span style={{ fontSize: "10px", color: C.inkSubtle }}>·</span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: montantReel > 0 && fraisBourso / montantReel < 0.01 ? C.green : C.goldDark }}>{tauxFraisCourtage(montantReel)}%</span>
              {fraisBourso / montantReel > 0.015 && (
                <span style={{ fontSize: "10px", color: C.goldDark, marginLeft: "4px" }}>— investissez &gt; {fmtEur(Math.max(400, montantReel))} pour passer sous 0,5%</span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "8px", padding: "14px 16px", marginBottom: "10px" }}>
            <div style={{ fontSize: "13px", color: C.goldDark, fontWeight: "600", marginBottom: "6px" }}>
              ⚠ Budget DCA insuffisant pour acheter 1 titre ({fmtCours(prioritaire.cours)})
            </div>
            <div style={{ fontSize: "13px", color: C.inkMuted }}>
              Il vous manque <strong style={{ color: C.ink }}>{fmtEur(manque)}</strong> pour acquérir votre 1er titre ce mois.
            </div>
          </div>
        )}

        {/* Conseil si investir plus */}
        {peutSuggererPlus && (
          <div style={{ background: "rgba(37,99,235,0.05)", border: `1px solid rgba(37,99,235,0.2)`, borderLeft: `3px solid #2563EB`, borderRadius: "8px", padding: "12px 16px", marginTop: "10px" }}>
            <div style={{ fontSize: "11px", color: "#2563EB", fontWeight: "700", marginBottom: "6px" }}>
              Conseil : investir davantage ce mois
            </div>
            {titresAchetables > 0 ? (
              <p style={{ fontSize: "12px", color: C.inkMuted, margin: 0, lineHeight: "1.6" }}>
                En ajoutant <strong style={{ color: C.navy }}>{fmtEur(surplusConseille)}</strong> de plus (total : {fmtEur(dcaMensuel + surplusConseille)}), vous acquérez{" "}
                <strong style={{ color: C.navy }}>{titresAchetables + 1} titre{titresAchetables + 1 > 1 ? "s" : ""}</strong> — frais de courtage : {fmtEur(fraisPlus)} ({tauxFraisCourtage(montantPlus)}%).
              </p>
            ) : (
              <p style={{ fontSize: "12px", color: C.inkMuted, margin: 0, lineHeight: "1.6" }}>
                En portant votre DCA à <strong style={{ color: C.navy }}>{fmtEur(minPourUnTitre)}</strong> ce mois (+{fmtEur(manque)}), vous acquérez votre premier titre. Frais : {fmtEur(calcFraisCourtage(minPourUnTitre))}.
              </p>
            )}
          </div>
        )}
        </div>{/* end colonne gauche */}

        {/* Colonne droite : argumentaire */}
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* §1 — Pourquoi ce mois */}
          <div>
            <div style={{ fontSize: "10px", color: C.navy, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>
              ▸ Pourquoi {prioritaire.nom} ce mois ?
            </div>
            <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>
              {prioritaire.nom} ressort comme action prioritaire
              {(() => {
                const poidsRef = 100 / scored.length;
                const poidsPct = (prioritaire.poids * 100).toFixed(1);
                const surP = prioritaire.poids * 100 > poidsRef + 2;
                if (prioritaire.sousPRU)
                  return <> pour deux raisons cumulées : le cours actuel (<strong style={{ color: C.ink }}>{fmtCours(prioritaire.cours)}</strong>) est sous votre PRU (<strong style={{ color: C.ink }}>{fmtCours(prioritaire.pru)}</strong>), soit une décote de <strong style={{ color: C.red }}>−{Math.abs((prioritaire.cours - prioritaire.pru) / prioritaire.pru * 100).toFixed(1)} %</strong>. Renforcer maintenant abaisse mécaniquement votre coût moyen d'acquisition.</>;
                if (surP)
                  return <> malgré sa surpondération actuelle ({poidsPct} % vs objectif {poidsRef.toFixed(1)} %) en raison de son score IA et de ses catalyseurs identifiés. Attention : cette ligne dépasse déjà l'allocation cible — un renforcement accentue la concentration.</>;
                return <> en raison de sa sous-pondération : la ligne représente <strong style={{ color: C.ink }}>{poidsPct} %</strong> du portefeuille contre un objectif de <strong style={{ color: C.ink }}>{poidsRef.toFixed(1)} %</strong>. Renforcer maintenant rééquilibre votre allocation vers la cible.</>;
              })()}
            </p>
          </div>

          {/* §3 — Pourquoi malgré les autres lignes */}
          <div>
            <div style={{ fontSize: "10px", color: C.navy, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>
              ▸ Comparaison portefeuille
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "8px" }}>
              {scored.filter(p => p.id !== prioritaire.id).map(pos => {
                const pvPct = pos.pru > 0 ? (pos.cours - pos.pru) / pos.pru * 100 : 0;
                return (
                  <span key={pos.id} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "4px 8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: C.ink }}>{pos.nom.split(" ")[0]}</span>
                    <span style={{ fontSize: "10px", color: pvPct >= 0 ? C.green : C.red, fontWeight: "700" }}>{pvPct >= 0 ? "+" : ""}{pvPct.toFixed(1)}%</span>
                    <span style={{ fontSize: "9px", color: C.inkSubtle }}>{(pos.poids * 100).toFixed(1)}%</span>
                  </span>
                );
              })}
            </div>
            <p style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.6", margin: 0 }}>
              <strong style={{ color: C.ink }}>{prioritaire.nom}</strong> est {prioritaire.sousPRU ? "en décote et " : ""}la ligne la plus sous-représentée — prioritaire pour rééquilibrer l'allocation ce mois.
            </p>
          </div>


        </div>{/* end colonne droite */}
        </div>{/* end grid */}
      </div>





    </Card>
  );
}

/** Valeur future d'un capital via DCA mensuel avec taux annuel r. */
function DCASimulator({ profil, dcaSim, setDcaSim, onSaveProfil }) {
  const dcaMin = 50, dcaMax = 10000, dcaStep = 50;

  const horizons = [6, 12, 36, 60, 120]; // mois

  // Frais de courtage estimés par mois (calcul simplifié)
  const fraisMensuel = dcaSim <= 500 ? 1.99 : dcaSim * 0.005;
  const fraisAnnuel  = fraisMensuel * 12;
  const dcaNet       = dcaSim - fraisMensuel;

  const fld = { background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "9px 12px", fontSize: "13px", fontWeight: "600", color: C.ink, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", width: "100%" };
  const lbl = { fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px", fontFamily: "'DM Sans', sans-serif" };

  const card = { background: C.snow, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px", boxShadow: shadow.card };
  const cardTitle = { fontSize: "13px", fontWeight: "800", color: C.ink, letterSpacing: "0.3px", marginBottom: "14px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px", fontFamily: "'DM Sans', sans-serif" }}>

      {/* Ligne 1 : 2 cartes côte à côte */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

        {/* Carte Paramètres */}
        <div style={card}>
          <div style={cardTitle}>Paramètres DCA</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <div style={lbl}>Versement mensuel</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="number" min="0" step="50" placeholder="300" value={dcaSim || ""}
                  onChange={e => { const v = Number(e.target.value) || 0; setDcaSim(v); onSaveProfil && onSaveProfil({ ...profil, dcaMensuel: v }); }}
                  style={{ ...fld, fontWeight: "700", color: C.navy }} />
                <span style={{ fontSize: "13px", color: C.inkSubtle, flexShrink: 0 }}>€ / mois</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <div style={lbl}>Durée (mois)</div>
                <input type="number" min="1" max="480" placeholder="120" value={profil?.dcaDuree || ""}
                  onChange={e => { const mois = parseInt(e.target.value) || 0; const horizon = mois <= 24 ? "court" : mois <= 48 ? "moyen" : mois <= 96 ? "long" : "tres-long"; onSaveProfil && onSaveProfil({ ...profil, dcaDuree: mois || profil?.dcaDuree, horizon }); }}
                  style={fld} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={lbl}>Soit</div>
                <div style={{ ...fld, fontWeight: "700", color: C.navy }}>
                  {(() => { const m = profil?.dcaDuree || 0; return m >= 12 ? `${Math.round(m/12)} ans` : m ? `${m} mois` : "—"; })()}
                </div>
              </div>
            </div>
            <div>
              <div style={lbl}>Jour du virement</div>
              <select value={profil?.dcaJour || 5} onChange={e => onSaveProfil && onSaveProfil({ ...profil, dcaJour: parseInt(e.target.value) })} style={{ ...fld, cursor: "pointer" }}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d < 10 ? `0${d}` : d} du mois</option>)}
              </select>
              <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "5px" }}>Jour utilisé par l'IA pour planifier</div>
            </div>
          </div>
        </div>

        {/* Carte Revalorisation */}
        <div style={card}>
          <div style={cardTitle}>Revalorisation <span style={{ fontSize: "11px", fontWeight: "400", color: C.inkSubtle }}>(optionnel)</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <div style={lbl}>Augmentation (€)</div>
                <input type="number" min="0" step="10" placeholder="50" value={profil?.dcaCroissanceMontant || ""}
                  onChange={e => onSaveProfil && onSaveProfil({ ...profil, dcaCroissanceMontant: parseFloat(e.target.value) || 0 })}
                  style={fld} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={lbl}>Tous les N ans</div>
                <input type="number" min="1" max="10" step="1" placeholder="2" value={profil?.dcaCroissancePeriode || ""}
                  onChange={e => onSaveProfil && onSaveProfil({ ...profil, dcaCroissancePeriode: parseInt(e.target.value) || 0 })}
                  style={fld} />
              </div>
            </div>
            {(profil?.dcaCroissanceMontant > 0) && (profil?.dcaCroissancePeriode > 0) ? (
              <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 16px" }}>
                <div style={{ fontSize: "10px", color: C.inkSubtle, marginBottom: "4px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px" }}>Progression</div>
                {(() => { const b = Number(dcaSim), inc = Number(profil.dcaCroissanceMontant), per = Number(profil.dcaCroissancePeriode), a = n => n <= 1 ? "an" : "ans";
                  return [0,1,2].map(i => <div key={i} style={{ fontSize: "12px", color: i === 0 ? C.ink : C.inkMuted }}>{b + inc*i}€/mois {i > 0 ? `après ${per*i} ${a(per*i)}` : "(départ)"}</div>);
                })()}
              </div>
            ) : (
              <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: "12px", color: C.inkSubtle, lineHeight: "1.6" }}>Augmentez automatiquement votre versement tous les N ans pour booster l'effet de capitalisation.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Carte Simulation — pleine largeur */}
      <div style={card}>
        <div style={{ marginBottom: "14px" }}>
          <div style={cardTitle}>Projection de capitalisation</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={{ background: C.snowOff }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", borderBottom: `1px solid ${C.border}` }}>Durée</th>
                {horizons.map(m => (
                  <th key={m} style={{ padding: "10px 14px", textAlign: "right", fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", borderBottom: `1px solid ${C.border}` }}>
                    {m < 12 ? `${m} mois` : `${m / 12} an${m / 12 > 1 ? "s" : ""}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>Capital investi</span>
                </td>
                {horizons.map(m => (
                  <td key={m} style={{ padding: "12px 14px", textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: "800", color: C.navy }}>{fmtEur(dcaNet * m)}</div>
                    <div style={{ fontSize: "10px", color: C.inkSubtle }}>{m} versements</div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "10px" }}>
          Frais estimés (≤500€ : 1,99€ · &gt;500€ : 0,5%) déduits du versement net.
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
          <div style={{ background: C.snowOff, borderRadius: "8px", padding: "8px 12px", border: `1px solid ${C.border}`, flex: "0 1 auto", minWidth: "80px", maxWidth: "140px" }}>
            <div style={{ fontSize: "9px", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700", marginBottom: "3px" }}>Frais / mois</div>
            <div style={{ fontSize: "13px", fontWeight: "800", color: C.goldDark }}>{fmtEur(fraisMensuel)}</div>
            <div style={{ fontSize: "9px", color: C.inkSubtle }}>{fmtEur(fraisAnnuel)} / an</div>
          </div>
          <div style={{ background: C.snowOff, borderRadius: "8px", padding: "8px 12px", border: `1px solid ${C.border}`, flex: "0 1 auto", minWidth: "80px", maxWidth: "140px" }}>
            <div style={{ fontSize: "9px", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700", marginBottom: "3px" }}>Net de frais</div>
            <div style={{ fontSize: "13px", fontWeight: "800", color: C.green }}>{fmtEur(dcaNet)}</div>
            <div style={{ fontSize: "9px", color: C.inkSubtle }}>versement effectif</div>
          </div>
          <div style={{ background: C.snowOff, borderRadius: "8px", padding: "8px 12px", border: `1px solid ${C.border}`, flex: "0 1 auto", minWidth: "80px", maxWidth: "140px" }}>
            <div style={{ fontSize: "9px", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", fontWeight: "700", marginBottom: "3px" }}>Investi / an</div>
            <div style={{ fontSize: "13px", fontWeight: "800", color: C.navy }}>{fmtEur(dcaSim * 12)}</div>
            <div style={{ fontSize: "9px", color: C.inkSubtle }}>{fmtEur(dcaNet * 12)} net</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Contient la stratégie DCA mensuelle + l'analyse IA du portefeuille
export default function StratégieDCATab({ profil, portfolioVersion, marketScores, marketScoringUi, onRunScoring, onSaveProfil, account = "PEA" }) {
  const [allPositions, setAllPositions] = useState(() => sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
  const positions = allPositions.filter(p => (p.compte || "PEA") === account);

  useEffect(() => {
    setAllPositions(sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
  }, [portfolioVersion]);

  // ── Simulateur DCA ──────────────────────────────────────────────────────────
  const dcaBase = profil?.dcaMensuel || 200;
  const [dcaSim, setDcaSim] = useState(dcaBase);

  if (positions.length === 0) return (
    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "48px 28px", textAlign: "center", boxShadow: shadow.card }}>
      <div style={{ fontSize: "36px", marginBottom: "14px", lineHeight: 1 }}>◎</div>
      <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, marginBottom: "8px" }}>Aucune position dans le portefeuille</div>
      <div style={{ fontSize: "12px", color: C.inkMuted, maxWidth: "380px", margin: "0 auto", lineHeight: "1.6" }}>
        Ajoutez vos actions et ETF dans l'onglet <strong>Positions</strong> pour que le Plan DCA calcule automatiquement quelle valeur renforcer ce mois.
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <DCASimulator profil={profil} dcaSim={dcaSim} setDcaSim={setDcaSim} onSaveProfil={onSaveProfil} />
      <DCAStrategy positions={positions} profil={profil} marketScores={marketScores} marketScoringUi={marketScoringUi} onRunScoring={onRunScoring} onSaveProfil={onSaveProfil} />
    </div>
  );
}

