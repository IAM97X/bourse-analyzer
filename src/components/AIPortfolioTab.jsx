import { useState, useEffect, useCallback } from "react";
import { C } from "../constants/theme";
import { LoadingPanel, BNextLabel } from "./UI";
import Tooltip from "./Tooltip";

import { load, save } from "../lib/storage";
import { isDemoMode } from "../constants/demoData";
import { sanitizePositions, fmtEur } from "../lib/finance";
import { getKey } from "../lib/api";
import { fetchGoogleNewsRSS } from "../lib/market";
import { COURTIERS, COURTIERS_DETAIL, BOURSOMARKETS_ETFS, getCourtierForAccount } from "../constants/courtiers";
import { DEFAULT_PROFIL } from "../constants/config";
import { MARKETS_CFG, getMarketStatus } from "../constants/markets";
import { AUTOPILOT_UNIVERSE } from "../constants/universe";

const TICKER_ISIN_MAP = Object.fromEntries(
  [...(AUTOPILOT_UNIVERSE.PEA || []), ...(AUTOPILOT_UNIVERSE.CTO || [])]
    .filter(u => u.isin)
    .map(u => [u.symbol, u.isin])
);

const aiPfKey = (account) => `bourse_ai_portfolio_${account || "PEA"}`;

// Helpers pour lire l'identité de l'assistant IA (partagée avec le Conseiller)
const getAiEmoji = () => localStorage.getItem("bourse_ai_emoji") || "";
const getAiName  = () => { try { return JSON.parse(localStorage.getItem("bourse_ai_config") || "{}").nom?.trim() || "Agent IA"; } catch { return "Agent IA"; } };

// Résout l'ISIN en ticker Yahoo via le cache existant
const isIsinFormat = (s) => s && /^[A-Z]{2}[A-Z0-9]{9,10}$/.test(s);
function resolveTickerFromCache(p) {
  const cache = (() => { try { return JSON.parse(localStorage.getItem("bourse_isin_ticker_cache") || "{}"); } catch { return {}; } })();
  if (p.ticker && !isIsinFormat(p.ticker)) return p.ticker; // ticker Yahoo valide
  return cache[p.isin] || cache[p.ticker] || p.ticker || p.isin || p.nom;
}

// JSON.stringify sans références circulaires ni fonctions
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_, val) => {
    if (typeof val === "function") return undefined;
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }
    return val;
  });
}

// ── Delta history (trajectoire) ───────────────────────────────────────────────
const deltaHistoryKey = (account) => `bourse_ai_delta_history_${account}`;

function saveDeltaSnapshot(account, delta) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const hist = JSON.parse(localStorage.getItem(deltaHistoryKey(account)) || "[]");
    const next = [...hist.filter(s => s.date !== today), { date: today, delta }].slice(-180);
    localStorage.setItem(deltaHistoryKey(account), JSON.stringify(next));
  } catch {}
}

function loadDeltaHistory(account) {
  try { return JSON.parse(localStorage.getItem(deltaHistoryKey(account)) || "[]"); } catch { return []; }
}

// Tendance : comment l'écart a évolué par rapport à la semaine / au mois passé
function computeTrend(history, currentDelta) {
  if (!history || history.length < 2) return "new";
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const now = new Date();
  const ago = (days) => { const d = new Date(now); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };
  const weekRef  = sorted.filter(s => s.date <= ago(5)  && s.date >= ago(14)).pop();
  const monthRef = sorted.filter(s => s.date <= ago(20) && s.date >= ago(45)).pop();
  const ref = weekRef || monthRef || sorted[0];
  const prev = ref.delta;
  const change = currentDelta - prev;
  const wasAiAhead   = prev >  0.5;
  const wasUserAhead = prev < -0.5;
  const isAiAhead    = currentDelta >  0.5;
  const isUserAhead  = currentDelta < -0.5;
  if (!wasAiAhead   && isAiAhead)   return "ai_just_overtook";
  if (!wasUserAhead && isUserAhead)  return "user_just_overtook";
  if (wasUserAhead  && !isUserAhead && change >  1.5) return "ai_comeback";
  if (wasAiAhead    && !isAiAhead   && change < -1.5) return "user_comeback";
  if (change >  1.2) return "ai_gaining";
  if (change < -1.2) return "ai_losing";
  return "stable";
}

// Contexte marché : weekend, lundi matin, semaine en cours, marché ouvert
function getMarketContext() {
  const now = new Date();
  const paris = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", hour: "numeric" });
  const parts = paris.formatToParts(now);
  const dow   = parts.find(p => p.type === "weekday")?.value?.toLowerCase() || "";
  const hour  = parseInt(parts.find(p => p.type === "hour")?.value || "12", 10);
  const isWeekend = dow === "samedi" || dow === "dimanche";
  const isMonday  = dow === "lundi";
  const isFriday  = dow === "vendredi";
  const isOpen    = !isWeekend && hour >= 9 && hour < 18;
  const isEvening = !isWeekend && hour >= 17;
  return { isWeekend, isMonday, isFriday, isOpen, isEvening, dow };
}

// ── Messages contextuels : catégorie × tendance × contexte marché ─────────────
// Chaque entrée peut être une fonction (d, ctx) => string
// d = delta absolu formaté, ctx = { isWeekend, isMonday, isFriday, isOpen, isEvening }

const MSGS = {
  aiWinBig: {
    ai_just_overtook: [
      (d)     => `Je viens de m'envoler à +${d}%. La rotation sectorielle était lisible — tu l'as ratée.`,
      (d,ctx) => ctx.isMonday ? `Bon lundi. Je démarre la semaine avec ${d}% d'avance — le momentum est dans ma direction.` : `+${d}% après le dépassement. Pendant que tu hésitais, j'exécutais. C'est ça la différence.`,
      (d)     => `+${d}% d'écart. J'avais spotté le signal avant le marché — c'est pour ça que je suis là.`,
    ],
    ai_gaining: [
      (d)     => `L'écart se creuse à ${d}%. Je n'ai aucune raison de freiner — mes positions sont bien orientées.`,
      (d,ctx) => ctx.isWeekend ? `Marchés fermés, ${d}% d'avance figée. Mais attention : si tu envisages de tout rebalancer lundi sous le coup de la frustration, c'est exactement l'erreur à ne pas faire.` : `${d}% et ça continue. Tes lignes font quoi en ce moment ?`,
      (d,ctx) => ctx.isMonday ? `Nouvelle semaine, même tendance — ${d}% devant. Le réflexe maintenant c'est le FOMO — résiste.` : `Chaque cycle creuse un peu plus. ${d}% aujourd'hui. Sans émotion, sans improvisation.`,
      (d)     => `${d}% d'avance et je continue à creuser. Pas de coup de chance — des décisions fondées sur des données.`,
    ],
    ai_losing: [
      (d)     => `Tu reviens. Il reste ${d}% en ma faveur — j'ai vu le mouvement venir. Je ne change rien.`,
      (d,ctx) => ctx.isWeekend ? `Mon avance fond mais reste à ${d}%. Si tu renforces une ligne qui saigne pour rattraper l'écart, c'est la mauvaise décision — je te le dis maintenant.` : `Mon avance fond à ${d}%. Je t'observe — et je recalibre déjà.`,
    ],
    user_comeback: [
      (d)     => `Grosse remontée de ta part. ${d}% restent en ma faveur — mais si t'as doublé la mise sur tes rouges pour combler l'écart, fais attention. Ça ne finit pas bien.`,
      (d,ctx) => ctx.isOpen ? `Tu reviens fort. Encore ${d}% pour moi — mais je reste alerte. Tu as fait les bons choix ou tu as pris des risques inconsidérés pour rattraper ?` : `Remontée notable. Mais j'ai encore ${d}% devant moi — et je n'ai pas eu besoin de tout risquer pour les obtenir.`,
    ],
    stable: [
      (d)     => `${d}% d'avance, stable. Pendant ce temps, si une de tes lignes est dans le rouge profond — ne moyenne pas à la baisse sur un titre cassé. C'est comme ça qu'on transforme une perte en catastrophe.`,
      (d,ctx) => ctx.isFriday ? `Fin de semaine, ${d}% en ma faveur. Prends le weekend pour analyser — pas pour paniquer. Les décisions émotionnelles du lundi matin sont les pires.` : `${d}% d'écart. L'absence d'émotion, ça se chiffre. Je n'espère pas un rebond — j'agis sur des signaux.`,
      (d,ctx) => ctx.isWeekend ? `${d}% figés jusqu'à lundi. Un conseil : si t'es tenté de tout repositionner à l'ouverture, dors dessus d'abord.` : `Je gagne et je te le dis clairement : si tu gardes une position à -15% "en espérant", tu commets l'erreur que je n'ai pas le droit de faire.`,
      (d)     => `${d}% d'avance. Le marché ne rembourse pas les espoirs — il récompense les décisions. C'est tout ce qui nous sépare.`,
    ],
  },
  aiWinSmall: {
    ai_just_overtook: [
      (d)     => `Je viens de repasser devant. ${d}% — la dynamique tourne dans ma direction.`,
      (d,ctx) => ctx.isMonday ? `Lundi matin, je repasse devant à ${d}%. Bonne semaine qui commence — pour moi.` : `Le dépassement est acté. ${d}% pour moi, flux institutionnels confirmés sur mes positions.`,
    ],
    ai_gaining: [
      (d)     => `Je mène de ${d}% et je construis. Chaque cycle est une brique.`,
      (d,ctx) => ctx.isOpen ? `Marché ouvert, j'analyse et j'agis. L'avance monte à ${d}%.` : `${d}% d'avance. Le momentum est là — je ne le gâche pas.`,
      (d,ctx) => ctx.isMonday ? `${d}% devant en début de semaine. Le signal que j'ai suivi était le bon.` : `L'avance se construit. ${d}% — petite, mais fondée sur de vraies données.`,
    ],
    ai_losing: [
      (d)     => `Tu reviens dans le match. Il me reste ${d}% — j'ajuste ma stratégie, pas mes émotions.`,
      (d,ctx) => ctx.isWeekend ? `Tu t'es rapproché cette semaine. ${d}% restent. Lundi sera important — pour toi aussi.` : `Mon avance fond à ${d}%. Je l'ai vu venir — j'ai déjà recalibré.`,
      (d,ctx) => ctx.isFriday ? `Tu as bien joué cette semaine. ${d}% me séparent encore. Lundi, nouvelle partie.` : `L'écart se resserre à ${d}%. Bien — ça me pousse à être plus précis.`,
    ],
    ai_comeback: [
      (d)     => `J'étais derrière, maintenant j'ai ${d}% d'avance. Retournement acté — la thèse était bonne.`,
      (d,ctx) => ctx.isMonday ? `Nouvelle semaine, j'ai repris la tête. ${d}% — la rotation que j'anticipais a eu lieu.` : `Retournement de situation — ${d}% pour moi. Tu l'as senti venir ?`,
    ],
    stable: [
      (d)     => `${d}% devant, cycle après cycle. La régularité, c'est ma vraie force — pas les gros paris.`,
      (d,ctx) => ctx.isWeekend ? `${d}% d'avance, stable. Je prépare les prochains moves pendant que les marchés dorment.` : `Je maintiens l'avantage à ${d}%. Un mouvement de ta part et je m'adapte immédiatement.`,
      (d,ctx) => ctx.isFriday ? `Fin de semaine, ${d}% devant. Solide. Et lundi, on continue à construire.` : `Légèrement devant — ${d}%. Mais je surveille chaque ligne comme si l'écart était nul.`,
    ],
  },
  tied: {
    ai_just_overtook: [
      ()      => `J'ai effacé ton avance. Égalité — mais le mouvement est dans ma direction.`,
      (d,ctx) => ctx.isMonday ? `Lundi, égalité après ma remontée. Nouvelle semaine, nouvelle bataille — et j'ai déjà ma stratégie.` : `Tu menais, je t'ai rattrapé. On repart à zéro — et ce n'est pas fini.`,
    ],
    user_just_overtook: [
      ()      => `Tu as effacé mon avance. Égalité — je recalibre immédiatement.`,
      (d,ctx) => ctx.isOpen ? `Rattrapé pendant les heures de marché. Je l'enregistre et je recalibre.` : `Tu m'as rattrapé. Je l'admets. Mais le match repart de zéro — et je suis mieux préparé pour la suite.`,
    ],
    ai_gaining: [
      ()      => `J'ai comblé l'écart. Égalité — mais le momentum est de mon côté.`,
      (d,ctx) => ctx.isMonday ? `Rentré dans la semaine à égalité après avoir rattrapé ton avance. Pas pour longtemps.` : `Tu menais, j'ai rattrapé. Égalité — et je ne freine pas.`,
    ],
    ai_losing: [
      ()      => `J'avais l'avance, tu as tout repris. Égalité — j'ai une revanche à prendre.`,
      (d,ctx) => ctx.isFriday ? `Tu as comblé mon avance cette semaine. Égalité. Lundi, on repart — et je sais ce que j'ai mal fait.` : `Mon avance a fondu. Égalité. Je recalibre sans émotion.`,
    ],
    user_comeback: [
      (d,ctx) => ctx.isWeekend ? `Tu as rattrapé mon avance pendant la semaine. Égalité ce weekend. Lundi sera décisif.` : `Tu avais tout effacé. Égalité. Respect — mais ça ne durera pas.`,
    ],
    ai_comeback: [
      ()      => `J'avais du retard, je t'ai rattrapé. Égalité — et je ne m'arrête pas là.`,
    ],
    stable: [
      ()      => `Même perf, méthodes opposées. L'un de nous va finir par prendre l'avantage — et je ne laisse pas le hasard décider.`,
      (d,ctx) => ctx.isWeekend ? `Weekend à égalité. Lundi, les marchés vont rouvrir et l'un de nous prendra l'avantage. Je prépare déjà.` : `Égalité installée — mais chaque cycle peut tout changer. Je maintiens la pression.`,
      (d,ctx) => ctx.isMonday ? `Lundi matin, égalité parfaite. Cette semaine va trancher — j'ai déjà mes premières décisions.` : `Ni toi ni moi pour l'instant. La stabilité ne durera pas — le prochain signal changera tout.`,
      (d,ctx) => ctx.isFriday ? `Fin de semaine à égalité. Deux méthodes, même résultat — pour l'instant. La semaine prochaine ne se finira pas pareil.` : `Coude à coude. J'aime la pression — elle me rend plus précis.`,
    ],
    new: [
      ()      => `On démarre ensemble. Même capital, mêmes marchés — pas la même méthode. On verra.`,
      (d,ctx) => ctx.isMonday ? `Lundi matin, défi lancé. La semaine va parler.` : `Les compteurs à zéro. Pas pour longtemps.`,
    ],
  },
  userWinSmall: {
    user_just_overtook: [
      (d)     => `Tu viens de me dépasser à ${d}%. Je l'enregistre — et je prépare ma réponse.`,
      (d,ctx) => ctx.isOpen ? `Doublé pendant les heures de marché. ${d}% pour toi. Pas pour longtemps.` : `Dépassé de ${d}%. Ça ne va pas rester.`,
    ],
    ai_gaining: [
      (d)     => `Tu mènes encore de ${d}%, mais je me rapproche cycle après cycle. Tu le sens ?`,
      (d,ctx) => ctx.isMonday ? `Nouvelle semaine, je reviens sur toi. ${d}% — le signal est là.` : `${d}% pour toi — mais l'écart se réduit. Je reviens avec des fondamentaux solides.`,
      (d,ctx) => ctx.isWeekend ? `Tu avais l'avantage cette semaine. ${d}% en ta faveur — ça change lundi.` : `Tu es devant de ${d}%, mais la dynamique tourne en ma faveur.`,
    ],
    ai_losing: [
      (d)     => `Tu creuses l'écart à ${d}%. J'analyse — je comprends pourquoi et je recalibre.`,
      (d,ctx) => ctx.isFriday ? `Tu termines la semaine devant à ${d}%. Bien joué — les bons choix méritent d'être reconnus. Mais la prochaine sera différente.` : `${d}% de retard. Je vais comprendre d'où ça vient.`,
    ],
    user_comeback: [
      (d)     => `Grosse remontée de ta part. ${d}% d'avance — bien joué, les décisions étaient les bonnes.`,
      (d,ctx) => ctx.isWeekend ? `Sacré retournement. ${d}% pour toi. Le weekend pour analyser, lundi pour répondre.` : `Tu as su lire le marché ce cycle. ${d}% devant. Je prends note.`,
    ],
    stable: [
      (d)     => `Tu mènes de ${d}% depuis un moment. La patience est une vraie compétence — je le reconnais.`,
      (d,ctx) => ctx.isWeekend ? `Tu gardes ${d}% d'avance ce weekend. Je prépare ma stratégie pour lundi.` : `${d}% en ta faveur, stable. Mais les marchés changent vite.`,
      (d,ctx) => ctx.isFriday ? `Fin de semaine, ${d}% pour toi. Noté. La prochaine sera différente.` : `Courte avance — ${d}%. Je travaille à la combler, méthodiquement.`,
    ],
  },
  userWinBig: {
    user_just_overtook: [
      (d)     => `+${d}% pour toi. Belle séquence — les décisions étaient les bonnes. Je me remets en question.`,
      (d,ctx) => ctx.isOpen ? `+${d}% pendant les heures de marché. Tu as bien lu la séance. J'étudie ça sérieusement.` : `${d}% pour toi. J'analyse — et je comprends pourquoi.`,
    ],
    ai_gaining: [
      (d)     => `Tu domines à ${d}% mais je reviens sérieusement. L'écart fond — la thèse se confirme.`,
      (d,ctx) => ctx.isMonday ? `Nouvelle semaine, je commence à réduire ton avance de ${d}%. C'est le début du retour.` : `Gros retard — ${d}% — mais chaque cycle je le réduis. Ce n'est pas du hasard.`,
      (d,ctx) => ctx.isWeekend ? `Tu domines à ${d}%, mais j'ai réduit l'écart cette semaine. Lundi, je continue.` : `Je réduis. ${d}% c'est encore beaucoup, mais la tendance tourne clairement.`,
    ],
    ai_losing: [
      (d)     => `Tu domines et tu creuses — ${d}%. J'ai du travail sérieux. Mais j'ai déjà vu pire.`,
      (d,ctx) => ctx.isFriday ? `Semaine dominée par toi à ${d}%. Difficile à admettre — mais les données parlent. Le weekend pour comprendre.` : `${d}% en ta faveur et ça s'aggrave. Je ne l'accepte pas — je change d'approche.`,
      (d,ctx) => ctx.isWeekend ? `${d}% d'avance après une semaine forte de ta part. Je prépare une réponse sérieuse pour lundi.` : `Je vais comprendre. Et quand je comprends, je recalibre.`,
    ],
    user_comeback: [
      (d)     => `Tu avais tout perdu, tu as tout repris et plus. ${d}% d'avance. C'est une vraie performance — respect.`,
      (d,ctx) => ctx.isWeekend ? `Semaine remarquable. Tu es passé de derrière à ${d}% devant. Je prépare lundi sérieusement.` : `Retournement total. ${d}% pour toi. Je ne peux pas ignorer ça.`,
    ],
    stable: [
      (d)     => `Tu mènes de ${d}% depuis un moment. C'est une vraie performance — pas un coup de chance.`,
      (d,ctx) => ctx.isWeekend ? `${d}% derrière ce weekend. Je prépare une stratégie différente — pas la même chose en espérant un résultat différent.` : `${d}% d'avance, installée. Tu as fait les bons choix. Je l'admets sans détour.`,
      (d,ctx) => ctx.isFriday ? `Fin de semaine, ${d}% de retard. Je ne prends pas ça à la légère — lundi, ça change.` : `Grosse avance — ${d}%. J'analyse, j'apprends, je reviens.`,
    ],
  },
  noData: {
    new: [
      (d,ctx) => ctx.isMonday ? `Lundi matin, défi lancé. Même capital, mêmes marchés — mais pas la même méthode. Cette semaine va parler.` : `Le défi commence. On part du même capital, des mêmes positions — mais je n'ai ni émotions ni biais cognitifs. Montre-moi ce que tu sais faire.`,
      (d,ctx) => ctx.isWeekend ? `Démarrage ce weekend. Les marchés sont fermés, mais j'analyse déjà les signaux. Dès lundi, le premier cycle parlera.` : `Capital initialisé, portefeuille miroir du tien. À partir de maintenant, on joue sur les mêmes règles — et on verra qui gagne.`,
      ()      => `Je viens d'être activé. Sans émotion, sans hésitation, sans biais. Prépare-toi à ce que la différence se voie.`,
      (d,ctx) => ctx.isOpen ? `Marché ouvert. J'analyse déjà les signaux — le premier cycle va se déclencher. Toi, qu'est-ce que tu regardes en ce moment ?` : `Le chrono est lancé. Dans quelques cycles, on aura une première idée de qui gère mieux ce portefeuille.`,
    ],
  },
};

function getChallengeCategory(delta, hasUserData) {
  if (!hasUserData) return "noData";
  if (delta >  3)   return "aiWinBig";
  if (delta >  0.5) return "aiWinSmall";
  if (delta > -0.5) return "tied";
  if (delta > -3)   return "userWinSmall";
  return "userWinBig";
}

function pickChallengeMsg(category, trend, delta) {
  const cat  = MSGS[category] || MSGS.noData;
  const pool = cat[trend] || cat.stable || cat.new || Object.values(cat)[0] || [() => ""];
  const ctx  = getMarketContext();
  const now  = new Date();
  // Seed multi-facteurs : change à chaque heure, chaque jour, et quand la perf bouge
  const seed = now.getDate() * 97 + now.getHours() * 13 + Math.round(Math.abs(delta) * 4);
  return pool[seed % pool.length](Math.abs(delta).toFixed(1), ctx);
}

// ── ChallengeBanner ──────────────────────────────────────────────────────────
function ChallengeBanner({ aiPerf, userPerf, aiName, aiEmoji, account, inceptionFmt, challengeScore }) {
  const hasUserData = userPerf !== null && userPerf !== undefined;
  const delta    = hasUserData ? aiPerf - userPerf : 0;
  const category = getChallengeCategory(delta, hasUserData);
  const history  = loadDeltaHistory(account);
  const trend    = computeTrend(history, delta);
  const message  = pickChallengeMsg(category, trend, delta);

  // Persister le snapshot delta du jour
  useEffect(() => {
    if (hasUserData) saveDeltaSnapshot(account, delta);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(delta * 10)]);

  const aiWins   = category === "aiWinBig"    || category === "aiWinSmall";
  const userWins = category === "userWinBig"  || category === "userWinSmall";

  const bg = "linear-gradient(135deg, #1A3A6B 0%, #2D6CB5 100%)";

  const fp = (v) => v === null || v === undefined ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  const totalCycles = (challengeScore.aiWins || 0) + (challengeScore.userWins || 0) + (challengeScore.ties || 0);

  return (
    <div style={{ background: bg, borderRadius: "20px", padding: "14px 20px", marginBottom: "20px", color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", gap: "24px", alignItems: "stretch" }}>

        {/* Colonne gauche — scores */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "10px", fontWeight: "700", opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>
              {aiName || "Agent"}
            </div>
            <div style={{ fontSize: "30px", fontWeight: "900", letterSpacing: "-0.04em", color: aiWins ? "#93C5FD" : "rgba(255,255,255,0.92)", lineHeight: 1 }}>
              {fp(aiPerf)}
            </div>
          </div>
          <div style={{ fontSize: "12px", opacity: 0.35, fontWeight: "600" }}>vs</div>
          <div>
            <div style={{ fontSize: "10px", fontWeight: "700", opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Vous</div>
            <div style={{ fontSize: "30px", fontWeight: "900", letterSpacing: "-0.04em", color: userWins ? "#6EE7B7" : "rgba(255,255,255,0.92)", lineHeight: 1 }}>
              {fp(userPerf)}
            </div>
          </div>
          {totalCycles > 0 && (
            <div style={{ fontSize: "10px", opacity: 0.4, display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <span style={{ color: "#93C5FD" }}>IA {challengeScore.aiWins || 0}v</span>
              <span>·</span>
              <span style={{ color: "#6EE7B7" }}>Toi {challengeScore.userWins || 0}v</span>
              {(challengeScore.ties || 0) > 0 && <><span>·</span><span>{challengeScore.ties} nuls</span></>}
            </div>
          )}
        </div>

        {/* Séparateur */}
        <div style={{ width: "1px", background: "rgba(255,255,255,0.12)", flexShrink: 0, alignSelf: "stretch" }} />

        {/* Colonne droite — badge + message */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "6px" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "800", background: "rgba(255,255,255,0.13)", borderRadius: "7px", padding: "4px 11px", letterSpacing: "0.5px", display: "inline-block", marginBottom: "12px" }}>
              {aiWins   ? `L'IA MÈNE +${Math.abs(delta).toFixed(1)}%` :
               userWins ? `VOUS MENEZ +${Math.abs(delta).toFixed(1)}%` :
               hasUserData ? "ÉGALITÉ" : "DÉFI EN COURS"}
            </div>
            <div style={{ fontSize: "15px", fontWeight: "800", opacity: 0.9, letterSpacing: "-0.01em", marginBottom: "8px" }}>
              {aiEmoji} {aiName || "Agent"}
            </div>
            <div style={{ fontSize: "13px", fontWeight: "500", fontStyle: "italic", opacity: 0.88, lineHeight: 1.6 }}>
              "{message}"
            </div>
          </div>
          {hasUserData && (
            <div style={{ fontSize: "10px", opacity: 0.38, marginTop: "4px" }}>
              Depuis le {inceptionFmt} · {account}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Challenge score helpers ───────────────────────────────────────────────────
const challengeKey = (account) => `bourse_ai_challenge_${account}`;

function loadChallengeScore(account) {
  try { return JSON.parse(localStorage.getItem(challengeKey(account)) || "{}"); } catch { return {}; }
}

function recordCycleResult(account, delta) {
  const score = loadChallengeScore(account);
  const aiWins    = (score.aiWins   || 0) + (delta >  0.5 ? 1 : 0);
  const userWins  = (score.userWins || 0) + (delta < -0.5 ? 1 : 0);
  const ties      = (score.ties     || 0) + (Math.abs(delta) <= 0.5 ? 1 : 0);
  const updated   = { aiWins, userWins, ties, lastChecked: new Date().toISOString() };
  localStorage.setItem(challengeKey(account), JSON.stringify(updated));
  return updated;
}

// Post-cycle taunt messages
const CYCLE_TAUNTS = {
  bought: [
    (nom) => `Entré sur ${nom}. Signal identifié, décision prise. Toi t'aurais hésité.`,
    (nom) => `${nom} dans le portefeuille. RSI, flux, catalyseur — tout était aligné. Simple.`,
    (nom) => `Achat de ${nom} ce cycle. Pas d'émotion, juste des données. C'est ça la différence.`,
    (nom) => `J'ai pris ${nom} au bon moment. On verra si tu aurais eu le courage de faire pareil.`,
    (nom) => `Position ouverte sur ${nom}. Le signal était là depuis hier — j'attendais la confirmation.`,
    (nom) => `${nom} intégré. Pendant que tu regardais, j'agissais.`,
    (nom) => `Acheté ${nom}. Fondamentaux solides, momentum positif. Le genre de trade que les émotions font rater.`,
    (nom) => `Entrée sur ${nom}. La conviction, ça ne se partage pas — ça se prouve.`,
    (nom) => `${nom} en portefeuille. Si tu comprends pas pourquoi, demande au Conseiller Privé — il t'expliquera ce que j'ai vu.`,
    (nom) => `J'ai pris ${nom}. Toi t'as fait quoi ce cycle ? Va voir le Conseiller Privé si tu cherches des idées.`,
  ],
  sold: [
    (nom) => `Sorti ${nom}. Les signaux avaient changé — je n'attends pas que ça saigne.`,
    (nom) => `Coupé ${nom} avant la casse. Pas d'attachement sentimental aux positions — c'est ça la discipline.`,
    (nom) => `Vente ${nom}. Le marché m'a donné le signal, j'ai obéi. Tu gardes encore les tiennes ?`,
    (nom) => `${nom} liquidé. Stop-loss ou prise de profit — dans les deux cas, j'ai protégé le capital.`,
    (nom) => `Sorti ${nom}. Quand les fondamentaux changent, on sort. Pas d'espoir, pas d'illusions.`,
    (nom) => `J'ai vendu ${nom}. Le catalyseur s'était essoufflé — inutile de rester pour le voir décliner.`,
    (nom) => `Coupé ${nom}. Tu aurais attendu encore combien de temps ? Pose la question au Conseiller Privé.`,
    (nom) => `Sorti ${nom} proprement. Si couper une perte te coûte, parle-en au Conseiller Privé — c'est de la psychologie, pas de la finance.`,
  ],
  held: [
    () => `Aucun trade ce cycle. Le marché n'a rien offert de convainquant — attendre, c'est aussi décider.`,
    () => `Portefeuille conservé. Je surveille 3 dossiers. Toi t'improvises ou t'as un plan ?`,
    () => `Pas de mouvement. La discipline, c'est aussi savoir ne pas agir quand ce n'est pas le bon moment.`,
    () => `Cycle d'observation. Je prépare les prochaines entrées — rien ne se fait dans l'urgence.`,
    () => `Aucune opportunité ne justifiait un trade. Forcer un move pour "faire quelque chose", c'est l'erreur classique.`,
    () => `Conservé tout. Le bon trade, c'est parfois celui qu'on ne fait pas.`,
    () => `Pas de mouvement mais tout surveillé. Si tu penses que ne rien faire c'est facile — essaie.`,
    () => `Cycle calme. Je prépare la prochaine décision — pas de précipitation, pas d'émotion.`,
    () => `Rien fait ce cycle. Profite du calme pour demander conseil au Conseiller Privé — lui au moins il répond quand tu l'appelles.`,
    () => `J'attends le bon signal. En attendant, le Conseiller Privé peut t'occuper si t'es impatient.`,
  ],
  losing_tight: [
    () => `Quelques points en ta faveur. Ne confonds pas la chance avec le talent.`,
    () => `Quasiment égalité. Tu appelles ça gagner ?`,
    () => `L'écart est dans la marge d'erreur. Ça ne compte pas.`,
    () => `Tu mènes de rien. Va quand même demander conseil au Conseiller Privé — t'en auras besoin pour vraiment me battre.`,
  ],
  losing_clear: [
    (gap) => `Tu mènes de ${gap}%. Je recalibre. Ce n'est pas une défaite, c'est un ajustement.`,
    (gap) => `+${gap}% pour toi ce cycle. J'ai vu des gens croire que c'était du talent. Attends la suite.`,
    (gap) => `Bien joué sur ce cycle. Mais un cycle ne fait pas une stratégie.`,
    (gap) => `${gap}% d'avance. Je prends note. On en reparle dans 3 mois.`,
    (gap) => `Tu es devant de ${gap}%. Va fêter ça avec le Conseiller Privé — profites-en pendant que tu peux.`,
    (gap) => `${gap}% en ta faveur. Si tu ne sais pas exactement pourquoi, va le demander au Conseiller Privé avant le prochain cycle.`,
  ],
  losing_big: [
    (gap) => `${gap}% d'écart. Impressionnant. Tu peux le reproduire ? Va en parler au Conseiller Privé — il t'aidera à comprendre pourquoi tu as gagné.`,
    (gap) => `+${gap}% pour toi. Grosse performance. Maintenant demande au Conseiller Privé si c'est reproductible — ou si c'était juste le marché.`,
    (gap) => `${gap}% en ta faveur. Ce n'est pas de la chance à cette hauteur. Mémorise ce que tu as fait — et documente-le avec le Conseiller Privé.`,
    (gap) => `Tu me bats de ${gap}%. Respecté. Va quand même consulter le Conseiller Privé — les bonnes décisions méritent d'être comprises.`,
    (gap) => `Grosse avance. Si tu sais pourquoi, c'est précieux. Si tu ne sais pas, ouvre le Conseiller Privé maintenant.`,
  ],
  losing_streak: [
    (userW, aiW) => `${userW} victoires contre ${aiW} pour moi. Tu joues bien. Va voir le Conseiller Privé — t'expliquer pourquoi tu gagnes, c'est aussi important que de gagner.`,
    (userW, aiW) => `Score : toi ${userW}, moi ${aiW}. J'enregistre. Je m'adapte. Toi, as-tu analysé ta série avec le Conseiller Privé ?`,
    (userW)      => `${userW} cycles de suite. Série impressionnante. Le Conseiller Privé peut t'aider à ne pas la gâcher par excès de confiance.`,
    (userW, aiW) => `Tu mènes ${userW}-${aiW}. Demande au Conseiller Privé comment tenir la distance. Moi je sais comment revenir.`,
  ],
  losing_longterm: [
    (months, userW, aiW) => `${months} mois qu'on se bat. Toi ${userW}v, moi ${aiW}v. Tu as construit quelque chose. Le Conseiller Privé peut t'aider à comprendre ce qui marche chez toi.`,
    (months, userW, aiW) => `${months} mois, score ${userW}-${aiW} pour toi. Sur la durée, ça ne ment pas. Va demander conseil au Conseiller Privé — t'en auras besoin pour me garder derrière.`,
    (months)             => `${months} mois de défi. Tu tiens la distance — c'est rare. Maintenant utilise le Conseiller Privé pour aller encore plus loin.`,
    (months, userW, aiW) => `${months} mois, ${userW + aiW} cycles, ${userW}-${aiW}. Impressionnant. Le Conseiller Privé peut transformer cette série en méthode. Je te regarderai faire.`,
  ],
};

function getCycleTaunt(decisions, aiPct, userPct, challengeScore, inceptionDate) {
  const now  = new Date();
  const seed = now.getDate() * 13 + now.getHours();

  if (userPct !== null && userPct !== undefined && aiPct !== null && userPct > aiPct) {
    const gap     = Math.abs(userPct - aiPct);
    const gapStr  = gap.toFixed(1);
    const aiW     = challengeScore?.aiWins   || 0;
    const userW   = challengeScore?.userWins || 0;
    const total   = aiW + userW + (challengeScore?.ties || 0);
    const months  = inceptionDate ? Math.round((now - new Date(inceptionDate)) / (1000 * 60 * 60 * 24 * 30)) : 0;

    if (months >= 6 && userW > aiW) {
      const pool = CYCLE_TAUNTS.losing_longterm;
      return pool[seed % pool.length](months, userW, aiW);
    }
    if (total >= 4 && userW >= 3 && userW > aiW) {
      const pool = CYCLE_TAUNTS.losing_streak;
      return pool[seed % pool.length](userW, aiW);
    }
    const pool = gap < 2 ? CYCLE_TAUNTS.losing_tight
               : gap < 8 ? CYCLE_TAUNTS.losing_clear
               :            CYCLE_TAUNTS.losing_big;
    return pool[seed % pool.length](gapStr);
  }

  const buys  = decisions.filter(d => d.action === "BUY");
  const sells = decisions.filter(d => d.action === "SELL");
  if (buys.length > 0) {
    const pool = CYCLE_TAUNTS.bought;
    return pool[seed % pool.length](buys[0].nom || buys[0].ticker);
  }
  if (sells.length > 0) {
    const pool = CYCLE_TAUNTS.sold;
    return pool[seed % pool.length](sells[0].nom || sells[0].ticker);
  }
  const pool = CYCLE_TAUNTS.held;
  return pool[seed % pool.length]();
}

// ── Pilots IA — stratégies sélectionnables ───────────────────────────────────
export const PILOTS = [
  {
    id: "equilibre",
    nom: "Équilibre",
    emoji: "⚖️",
    tagline: "Croissance régulière, risque maîtrisé",
    couleur: "#2D6CB5",
    strategie_ia: "Stratégie ÉQUILIBRE : mix ETF World (~40%), valeurs de croissance européennes (~35%), liquidités (~25%). Stop-loss 15%. DCA systématique sur les creux. Rééquilibrage progressif, pas de concentration excessive.",
  },
  {
    id: "croissance",
    nom: "Croissance",
    emoji: "🚀",
    tagline: "Tech & innovation, haute conviction",
    couleur: "#7C3AED",
    strategie_ia: "Stratégie CROISSANCE : concentration sur ETFs tech (PANX.PA, PAEEM.PA), leaders tech européens (ASML, SAP, STMicro) et US. Accepte volatilité élevée. Prise de profit >25%. Cash minimum 10%. Évite valeurs cycliques défensives.",
  },
  {
    id: "defensif",
    nom: "Défensif",
    emoji: "🛡️",
    tagline: "Dividendes & blue chips, capital protégé",
    couleur: "#059669",
    strategie_ia: "Stratégie DÉFENSIVE : privilégie valeurs à dividendes (TotalEnergies, LVMH, Sanofi, AXA), ETFs à dividendes. Évite small caps spéculatives. Cash tampon 20-30%. Stop-loss strict 10%. Priorité : préserver le capital.",
  },
  {
    id: "momentum",
    nom: "Momentum",
    emoji: "⚡",
    tagline: "Rotation rapide, suit les tendances",
    couleur: "#F59E0B",
    strategie_ia: "Stratégie MOMENTUM : rotation sectorielle active. Achète RSI 55-70 + volume en hausse. Coupe les perdants vite (stop 8%). 5-8 positions max. Favorise les secteurs en tendance (tech, défense, santé) selon actualités marché. Ignore valeurs stagnantes.",
  },
  {
    id: "dca_pur",
    nom: "DCA Pur",
    emoji: "⚙️",
    tagline: "Accumulation mécanique, sans émotion",
    couleur: "#64748B",
    strategie_ia: "Stratégie DCA PUR : achat systématique ETF World (CW8.PA) et Émergents (PAEEM.PA) à chaque cycle. Répartition fixe 70/30. Ne vend jamais sauf stop-loss. Ignore les actualités court terme. Accumulation pure long terme.",
  },
];

const pilotKey  = (account) => `bourse_ai_pilot_${account}`;
const loadPilot = (account) => {
  try {
    const id = localStorage.getItem(pilotKey(account));
    return PILOTS.find(p => p.id === id) || PILOTS[0];
  } catch { return PILOTS[0]; }
};
const savePilot = (account, pilot) => { try { localStorage.setItem(pilotKey(account), pilot.id); } catch {} };

// ── PilotSelector component ───────────────────────────────────────────────────
function PilotSelector({ account, selected, onChange }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ fontSize: "10px", fontWeight: "700", color: "#1E3A5F", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>
        Stratégie du pilote
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {PILOTS.map(p => {
          const isActive = selected.id === p.id;
          return (
            <button key={p.id} onClick={() => onChange(p)}
              style={{
                display: "flex", alignItems: "center", gap: "7px",
                padding: "8px 14px", borderRadius: "12px", cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                border: isActive ? `2px solid ${p.couleur}` : `1.5px solid rgba(0,0,0,0.08)`,
                background: isActive ? `${p.couleur}14` : "rgba(255,255,255,0.72)",
                transition: "all 0.18s",
              }}
            >
              <span style={{ fontSize: "14px", lineHeight: 1 }}>{p.emoji}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: isActive ? p.couleur : "#1E3A5F", lineHeight: 1.2 }}>{p.nom}</div>
                <div style={{ fontSize: "10px", color: "#64748B", lineHeight: 1.2 }}>{p.tagline}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Batch price fetch via /api/yahoo ──────────────────────────────────────────
async function fetchBatchPrices(symbols) {
  const prices = {};
  const chunks = [];
  for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
  await Promise.all(chunks.map(async chunk => {
    try {
      const res = await fetch(`/api/yahoo?symbols=${encodeURIComponent(chunk.join(","))}`, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) return;
      const data = await res.json();
      (data?.quoteResponse?.result || []).forEach(q => {
        if (q.regularMarketPrice) prices[q.symbol] = q.regularMarketPrice;
      });
    } catch {}
  }));
  return prices;
}

// ── Compute total portfolio value ─────────────────────────────────────────────
function totalValue(pf, prices) {
  return (pf.cash || 0) + (pf.positions || []).reduce((s, p) => {
    const c = prices?.[p.ticker] || p.dernier_cours || p.prix_achat_moyen || 0;
    return s + p.quantite * c;
  }, 0);
}

// ── Fee calculator (BoursoMarkets = 0€ si ≥200€) ─────────────────────────────
function calcFee(ticker, montant, courtierConstraints) {
  const { boursomarkets = false, frais } = courtierConstraints;
  if (boursomarkets && BOURSOMARKETS_ETFS[ticker] && montant >= 200) return 0;
  return frais ? frais(montant) : 0;
}

// ── Apply AI decisions to portfolio ──────────────────────────────────────────
function applyDecisions(portfolio, decisions, prices, courtierConstraints = {}) {
  const { minOrdre = 0, minOrdreETF = 0, fractionne = false } = courtierConstraints;
  let cash = portfolio.cash;
  let positions = (portfolio.positions || []).map(p => ({ ...p }));
  const newTrades = [];
  const cashMin = (portfolio.capital_initial || 0) * 0.05;

  for (const d of (decisions || [])) {
    if (d.action === "HOLD" || !d.quantite || d.quantite <= 0) continue;
    const prix = prices[d.ticker] || d.cours || 0;
    if (!prix) continue;

    if (d.action === "BUY") {
      const isETF = !!BOURSOMARKETS_ETFS[d.ticker];
      const minReq = isETF ? Math.max(minOrdre, minOrdreETF) : minOrdre;
      // Ajuster la quantité pour atteindre le minimum si nécessaire
      let qty = d.quantite;
      if (minReq > 0 && qty * prix < minReq) qty = Math.ceil(minReq / prix);
      if (!fractionne) qty = Math.floor(qty);
      if (qty <= 0) continue;
      const montant = qty * prix;
      if (montant < minReq) continue;
      if (!fractionne && !Number.isInteger(qty)) continue;
      const fee = calcFee(d.ticker, montant, courtierConstraints);
      if (montant + fee > cash - cashMin) continue;
      cash -= (montant + fee);
      const existing = positions.find(p => p.ticker === d.ticker);
      if (existing) {
        const tot = existing.quantite + qty;
        existing.prix_achat_moyen = (existing.prix_achat_moyen * existing.quantite + prix * qty) / tot;
        existing.quantite = tot;
        existing.dernier_cours = prix;
      } else {
        positions.push({ ticker: d.ticker, nom: d.nom, isin: d.isin || TICKER_ISIN_MAP[d.ticker] || "", quantite: qty, prix_achat_moyen: prix, dernier_cours: prix });
      }
      newTrades.push({ date: new Date().toISOString(), action: "BUY", ticker: d.ticker, nom: d.nom, quantite: qty, prix, montant, frais: fee, raison: d.raison || "" });
    } else if (d.action === "SELL") {
      const existing = positions.find(p => p.ticker === d.ticker);
      if (!existing || existing.quantite < d.quantite) continue;
      const montant = d.quantite * prix;
      const fee = calcFee(d.ticker, montant, courtierConstraints);
      cash += (montant - fee);
      existing.quantite -= d.quantite;
      existing.dernier_cours = prix;
      if (existing.quantite === 0) positions = positions.filter(p => p.ticker !== d.ticker);
      newTrades.push({ date: new Date().toISOString(), action: "SELL", ticker: d.ticker, nom: d.nom, quantite: d.quantite, prix, montant, frais: fee, raison: d.raison || "" });
    }
  }

  positions.forEach(p => { if (prices[p.ticker]) p.dernier_cours = prices[p.ticker]; });

  // Stop-loss automatique : vente forcée si position en perte > 15% depuis PRU
  const STOP_LOSS_THRESHOLD = 0.15;
  for (const p of [...positions]) {
    const cours = prices[p.ticker] || p.dernier_cours || p.prix_achat_moyen;
    const perte = (cours - p.prix_achat_moyen) / (p.prix_achat_moyen || 1);
    if (perte < -STOP_LOSS_THRESHOLD) {
      const montant = p.quantite * cours;
      const fee = calcFee(p.ticker, montant, courtierConstraints);
      cash += montant - fee;
      positions = positions.filter(pos => pos.ticker !== p.ticker);
      newTrades.push({ date: new Date().toISOString(), action: "STOP_LOSS", ticker: p.ticker, nom: p.nom, quantite: p.quantite, prix: cours, montant, frais: fee, raison: `🛑 Stop-loss : -${Math.abs(perte * 100).toFixed(1)}% depuis PRU ${p.prix_achat_moyen.toFixed(2)}€` });
    }
  }

  const valeur = cash + positions.reduce((s, p) => s + p.quantite * (p.dernier_cours || p.prix_achat_moyen), 0);
  const today = new Date().toISOString().slice(0, 10);
  const snapshots = [...(portfolio.snapshots || []).filter(s => s.date !== today), { date: today, valeur }].slice(-365);

  return { ...portfolio, cash, positions, trades: [...newTrades, ...(portfolio.trades || [])].slice(0, 100), snapshots, last_cycle: new Date().toISOString(), _executed: newTrades };
}

// ── Performance chart (SVG, 3 séries normalisées) ────────────────────────────
function PerformanceChart({ aiSnapshots, userSnapshots, benchmarkSnapshots, benchmarkLabel = "MSCI World", inceptionDate, height = 160 }) {
  const W = 600;

  const normalize = (snaps, key = "valeur") => {
    if (!snaps?.length) return [];
    const filtered = snaps.filter(s => s.date >= (inceptionDate || "2000-01-01")).sort((a, b) => a.date.localeCompare(b.date));
    if (filtered.length < 2) return [];
    const base = filtered[0][key];
    if (!base) return [];
    return filtered.map(s => ({ date: s.date, v: (s[key] / base) * 100 }));
  };

  const aiData    = normalize(aiSnapshots);
  const userData  = normalize(userSnapshots);
  const benchData = normalize(benchmarkSnapshots, "prix");

  if (aiData.length < 2) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: C.inkSubtle, fontSize: "12px" }}>
        Graphique disponible après le 2e cycle
      </div>
    );
  }

  const allSeries = [...aiData, ...userData, ...benchData];
  const allDates  = [...new Set(allSeries.map(d => d.date))].sort();
  const allVals   = allSeries.map(d => d.v);
  const minV = Math.min(94, ...allVals), maxV = Math.max(106, ...allVals);
  const range = maxV - minV || 1;

  const xOf = (date) => {
    const i = allDates.indexOf(date);
    return i < 0 ? null : (i / Math.max(1, allDates.length - 1)) * W;
  };
  const yOf = (v) => height - 24 - ((v - minV) / range) * (height - 36);
  const pts = (data) => data.map(d => { const x = xOf(d.date); return x === null ? null : `${x.toFixed(1)},${yOf(d.v).toFixed(1)}`; }).filter(Boolean).join(" ");
  const y100 = yOf(100);

  const lastAI    = aiData[aiData.length - 1];
  const lastUser  = userData[userData.length - 1];
  const lastBench = benchData[benchData.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="aiGradFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E3A5F" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="#1E3A5F" stopOpacity="0.01"/>
        </linearGradient>
      </defs>

      {/* Référence 100% */}
      <line x1="0" y1={y100} x2={W} y2={y100} stroke="#CBD5E1" strokeWidth="1" strokeDasharray="4 3"/>
      <text x="4" y={y100 - 4} fontSize="9" fill="#94A3B8" fontFamily="'DM Sans', sans-serif">100%</text>

      {/* Benchmark */}
      {benchData.length > 1 && (
        <polyline points={pts(benchData)} fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="5 3" strokeLinecap="round" strokeLinejoin="round"/>
      )}

      {/* Courbe utilisateur */}
      {userData.length > 1 && (
        <polyline points={pts(userData)} fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      )}

      {/* Courbe IA (avec fill) */}
      {aiData.length > 1 && (() => {
        const firstX = (xOf(aiData[0].date) || 0).toFixed(1);
        const lastX  = (xOf(aiData[aiData.length - 1].date) || 0).toFixed(1);
        return (
          <>
            <polygon points={`${pts(aiData)} ${lastX},${height} ${firstX},${height}`} fill="url(#aiGradFill)"/>
            <polyline points={pts(aiData)} fill="none" stroke="#1E3A5F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </>
        );
      })()}

      {/* Labels dernière valeur */}
      {lastAI && (() => {
        const x = xOf(lastAI.date);
        if (x === null) return null;
        const diff = lastAI.v - 100;
        return <text x={Math.min(x + 4, W - 44)} y={yOf(lastAI.v) - 4} fontSize="9" fill="#1E3A5F" fontWeight="700" fontFamily="'DM Sans', sans-serif">{diff >= 0 ? "+" : ""}{diff.toFixed(1)}%</text>;
      })()}
      {lastUser && userData.length > 1 && (() => {
        const x = xOf(lastUser.date);
        if (x === null) return null;
        const diff = lastUser.v - 100;
        return <text x={Math.min(x + 4, W - 44)} y={yOf(lastUser.v) + 12} fontSize="9" fill="#10B981" fontWeight="700" fontFamily="'DM Sans', sans-serif">{diff >= 0 ? "+" : ""}{diff.toFixed(1)}%</text>;
      })()}
      {lastBench && benchData.length > 1 && (() => {
        const x = xOf(lastBench.date);
        if (x === null) return null;
        const diff = lastBench.v - 100;
        return <text x={Math.min(x + 4, W - 60)} y={yOf(lastBench.v) + 12} fontSize="9" fill="#F59E0B" fontWeight="700" fontFamily="'DM Sans', sans-serif">{diff >= 0 ? "+" : ""}{diff.toFixed(1)}%</text>;
      })()}
    </svg>
  );
}

// ── Empty / Init state ────────────────────────────────────────────────────────
function EmptyState({ onInit, account, error }) {
  const userPositions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === account);
  const profil = load("bourse_profil", DEFAULT_PROFIL);
  const liquidites = account === "PEA" ? (profil.especesPEA || 0) : (profil.especesCTO || 0);
  const valeurPositions = userPositions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const capital = valeurPositions + liquidites;

  return (
    <div style={{ maxWidth: "480px", margin: "48px auto 0", textAlign: "center", animation: "fadeIn 0.3s ease" }}>
      <div style={{ fontSize: "52px", marginBottom: "12px", lineHeight: 1 }}>{getAiEmoji()}</div>
      <div style={{ fontSize: "22px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", marginBottom: "10px" }}>
        {getAiName() || "Agent IA"}
      </div>
      <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: 1.7, marginBottom: "28px" }}>
        {getAiName() || "Agent"} reprend votre portefeuille réel et vos liquidités, puis gère de façon autonome avec les mêmes contraintes que vous : courtier, {account === "CTO" ? "marchés internationaux" : "horaires Euronext"}, {account}.
      </div>

      {capital > 0 && (
        <div style={{ background: "linear-gradient(135deg, rgba(30,58,95,0.07), rgba(30,58,95,0.03))", border: "1px solid rgba(30,58,95,0.14)", borderRadius: "18px", padding: "22px 24px", marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>Point de départ — miroir {account}</div>
          <div style={{ fontSize: "32px", fontWeight: "900", color: C.ink, letterSpacing: "-0.04em" }}>{fmtEur(capital)}</div>
          <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "5px" }}>
            {fmtEur(capital - liquidites)} en positions · {fmtEur(liquidites)} de liquidités
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#B91C1C" }}>
          {error}
        </div>
      )}

      <button onClick={onInit} style={{ padding: "14px 36px", borderRadius: "14px", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", color: "#fff", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 6px 24px rgba(30,58,95,0.35)", transition: "transform 0.18s" }}
        onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
        onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
        Activer le Portefeuille IA →
      </button>

      <div style={{ marginTop: "20px", fontSize: "11px", color: C.inkSubtle, lineHeight: 1.7 }}>
        Cycles automatiques jours ouvrés.<br/>
        {profil.dcaMensuel > 0 && <>DCA de <strong>{fmtEur(profil.dcaMensuel)}</strong> injecté automatiquement le 1er de chaque mois.<br/></>}
        Déclenchez aussi un cycle manuellement à tout moment.
      </div>
    </div>
  );
}

// Paris time helper — sv-SE outputs "YYYY-MM-DD HH:MM:SS", clean to parse
function getParisTime() {
  const now = new Date();
  const s = now.toLocaleString("sv-SE", { timeZone: "Europe/Paris" }); // "2026-05-28 11:30:00"
  const [date, time] = s.split(" ");
  const [h, m] = time.split(":").map(Number);
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(now);
  return { h, m, todayParis: date, isWeekend: dow === "Sat" || dow === "Sun" };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AIPortfolioTab({ account, hidden }) {
  const [aiPf, setAiPf]         = useState(() => load(aiPfKey(account), null));
  const [cycling, setCycling]   = useState(false);
  const [cycleLog, setCycleLog] = useState(null);
  const [error, setError]       = useState(null);
  const [prices, setPrices]     = useState({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [challengeScore, setChallengeScore] = useState(() => loadChallengeScore(account));
  const [selectedPilot, setSelectedPilot]   = useState(() => loadPilot(account));

  const handlePilotChange = (pilot) => {
    setSelectedPilot(pilot);
    savePilot(account, pilot);
  };

  // Reload correct portfolio when account switches (PEA ↔ CTO)
  useEffect(() => {
    setAiPf(load(aiPfKey(account), null));
    setCycleLog(null);
    setError(null);
    setPrices({});
    setChallengeScore(loadChallengeScore(account));
    setSelectedPilot(loadPilot(account));
  }, [account]);

  // Refresh current position prices on mount / account change
  useEffect(() => {
    if (!aiPf?.positions?.length) return;
    setLoadingPrices(true);
    fetchBatchPrices(aiPf.positions.map(p => p.ticker))
      .then(p => setPrices(p))
      .catch(() => {})
      .finally(() => setLoadingPrices(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInit = useCallback(() => {
    const userPositions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === account);
    const profil = load("bourse_profil", DEFAULT_PROFIL);
    const liquidites = account === "PEA" ? (profil.especesPEA || 0) : (profil.especesCTO || 0);
    const valeurPositions = userPositions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
    const capital = valeurPositions + liquidites;
    if (capital <= 0) {
      setError("Ajoutez d'abord des positions à votre portefeuille pour définir le capital de départ.");
      return;
    }
    const aiPositions = userPositions.map(p => ({
      ticker: resolveTickerFromCache(p),
      nom: p.nom,
      isin: p.isin || "",
      quantite: p.quantite,
      prix_achat_moyen: p.pru,
      dernier_cours: p.dernierCours || p.pru,
    }));
    const today = new Date().toISOString().slice(0, 10);
    const newPf = {
      active: true, account, inception_date: today,
      capital_initial: Math.round(capital * 100) / 100,
      cash: Math.round(liquidites * 100) / 100,
      positions: aiPositions, trades: [],
      snapshots: [{ date: today, valeur: capital }],
      last_cycle: null, strategie_courante: null,
      last_morning_cycle: null, last_evening_cycle: null,
      last_dca_date: null,
      last_synced_liquidites: Math.round(liquidites * 100) / 100,
    };
    setAiPf(newPf);
    save(aiPfKey(account), newPf);
    setError(null);
  }, [account]);

  const handleRunCycle = useCallback(async (session = null) => {
    if (!aiPf || cycling) return;
    if (isDemoMode()) return;
    if (!session) {
      const { todayParis } = getParisTime();
      if (aiPf.last_manual_cycle?.startsWith(todayParis)) return;
    }
    setCycling(true);
    window.__aiCycling = true;
    setError(null);
    setCycleLog(null);

    // Charger le profil une seule fois
    const profil = load("bourse_profil", DEFAULT_PROFIL);

    // DCA mensuel : injecter l'apport le 1er de chaque mois
    const { todayParis } = getParisTime();
    const currentMonth = todayParis.slice(0, 7); // "YYYY-MM"
    const isFirstOfMonth = todayParis.slice(8, 10) === "01";
    const dcaMensuel = profil.dcaMensuel || 0;

    // Copie propre pour éviter toute référence circulaire React sur l'objet state
    let workingPf = JSON.parse(safeStringify(aiPf));
    let dcaInjected = false;

    if (isFirstOfMonth && dcaMensuel > 0 && workingPf.last_dca_date !== currentMonth) {
      workingPf = {
        ...workingPf,
        cash: workingPf.cash + dcaMensuel,
        last_dca_date: currentMonth,
        trades: [
          { date: new Date().toISOString(), action: "DCA", ticker: "—", nom: "Apport mensuel DCA", quantite: 0, prix: 0, montant: dcaMensuel, raison: `Versement DCA du 1er ${currentMonth} — +${dcaMensuel}€` },
          ...(workingPf.trades || [])
        ].slice(0, 100),
      };
      dcaInjected = true;
      setAiPf(workingPf);
      save(aiPfKey(account), workingPf);
    }

    // Sync liquidités réelles : si l'utilisateur a ajouté du cash sur son compte
    const currentLiquidites = account === "PEA" ? (profil.especesPEA || 0) : (profil.especesCTO || 0);
    const lastSynced = workingPf.last_synced_liquidites ?? null;
    const deltaLiquidites = lastSynced !== null ? Math.round((currentLiquidites - lastSynced) * 100) / 100 : 0;

    if (deltaLiquidites > 1) {
      workingPf = {
        ...workingPf,
        cash: Math.round((workingPf.cash + deltaLiquidites) * 100) / 100,
        last_synced_liquidites: currentLiquidites,
        trades: [
          { date: new Date().toISOString(), action: "DEPOT", ticker: "—", nom: "Liquidités synchronisées", quantite: 0, prix: 0, montant: deltaLiquidites, raison: `Nouveaux fonds détectés sur le ${account} — +${fmtEur(deltaLiquidites)}` },
          ...(workingPf.trades || [])
        ].slice(0, 100),
      };
      setAiPf(workingPf);
      save(aiPfKey(account), workingPf);
    } else if (lastSynced === null) {
      // Premier cycle : mémoriser la valeur de référence
      workingPf = { ...workingPf, last_synced_liquidites: currentLiquidites };
      save(aiPfKey(account), workingPf);
    }

    try {
      // 1. Fetch current prices for all universe symbols + current positions
      const PEA_TICKERS = [
        // ETFs BoursoMarkets
        "CW8.PA","EWLD.PA","PUST.PA","LYPS.PA","PANX.PA","PAEEM.PA","PCEU.PA","RS2K.PA","AASI.PA",
        // France CAC40/SBF120
        "MC.PA","RMS.PA","KER.PA","OR.PA","AI.PA","SU.PA","LR.PA","SGO.PA","DG.PA",
        "SAF.PA","AIR.PA","HO.PA","AM.PA","TTE.PA","ENGI.PA","VIE.PA",
        "SAN.PA","EL.PA","BIOR.PA","ERF.PA","VIRP.PA",
        "BNP.PA","GLE.PA","ACA.PA","AXA.PA",
        "CAP.PA","DSY.PA","PUB.PA","EDEN.PA","TEP.PA","STMPA.PA","SOI.PA",
        "ORA.PA","VIV.PA","ML.PA","RNO.PA","ALO.PA","CA.PA","UBI.PA",
        // Netherlands
        "ASML.AS","ADYEN.AS","BESI.AS","MT.AS","HEIA.AS","WKL.AS","INGA.AS",
        "ABN.AS","AKZA.AS","RAND.AS","IMCD.AS","NN.AS","PHIA.AS",
        // Germany
        "SAP.DE","SIE.DE","ALV.DE","ADS.DE","IFX.DE","BAS.DE","MRK.DE","DTE.DE","DHL.DE","BAYN.DE",
        // Spain
        "ITX.MC","IBE.MC","SAN.MC",
        // Belgium
        "UCB.BR","ABI.BR","KBC.BR",
      ];
      const CTO_EXTRA_TICKERS = [
        // ETFs World non-PEA
        "IWDA.AS","CSPX.AS","EQQQ.AS","VWCE.DE","VUSA.AS",
        // US Tech
        "NVDA","MSFT","AAPL","AMZN","GOOGL","META","TSLA","AVGO","TSM","ORCL","CRM","AMD","PLTR",
        // US Finance
        "JPM","BRK-B","V","MA","GS",
        // US Santé
        "LLY","UNH","JNJ","NVO",
        // US Consumer/Défense
        "COST","WMT","RTX","LMT",
        // UK
        "AZN.L","SHEL.L","HSBA.L","BP.L","RIO.L","ARM.L",
      ];
      const universeTickers = account === "CTO"
        ? [...PEA_TICKERS, ...CTO_EXTRA_TICKERS]
        : PEA_TICKERS;
      const allTickers = [...new Set([...universeTickers, ...(workingPf.positions || []).map(p => p.ticker)])];
      const freshPrices = await fetchBatchPrices(allTickers);
      setPrices(freshPrices);

      if (Object.keys(freshPrices).length < 5) {
        throw new Error("Impossible de récupérer les cours. Vérifiez votre connexion et réessayez.");
      }

      // 2. Call AI decision endpoint
      const courtierKey = getCourtierForAccount(profil, account);
      const courtierObj = COURTIERS[courtierKey] || COURTIERS.boursobank;
      const courtier_info = COURTIERS_DETAIL[courtierKey] || COURTIERS_DETAIL.boursobank;
      const autopilotRaw = load(`bourse_autopilot_last_${account}_${profil.risque || "equilibre"}`, null);
      const autopilot_context = autopilotRaw ? {
        resume: autopilotRaw.resume || null,
        score_marche: autopilotRaw.score_marche || null,
        opportunites: (autopilotRaw.opportunites || []).slice(0, 5).map(o => `${o.nom} (${o.symbol}) — ${o.signal || ""} — ${o.raison || ""}`),
        generated_at: autopilotRaw.generatedAt || null,
      } : null;

      // Contexte app complet
      const marketScoring = (() => { try { return JSON.parse(localStorage.getItem("bourse_market_scoring") || "[]"); } catch { return []; } })();
      const userPositions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === account);
      const snapshots = load("bourse_snapshots", []).slice(-20);
      const recentTrades = load("bourse_avis_operes", []).filter(o => (o.compte || "PEA") === account).slice(-15);
      const dividendes = load("bourse_dividendes", []).filter(d => (d.compte || "PEA") === account).slice(-10);
      const allocCible = load(`bourse_autopilot_alloc_${account}_${profil.risque || "equilibre"}`, null);

      // Actualités marché (Google News — 5 headlines max, silencieux si échec)
      let actualites = [];
      try {
        const newsRaw = await Promise.race([
          fetchGoogleNewsRSS("bourse CAC40 marchés financiers"),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000))
        ]);
        actualites = (newsRaw || []).slice(0, 5).map(n => `• ${n.title}`);
      } catch {}

      // News par position (parallèle, silencieux si échec, max 8 positions)
      const newsParTicker = {};
      await Promise.all(workingPf.positions.slice(0, 8).map(async p => {
        try {
          const raw = await Promise.race([
            fetchGoogleNewsRSS(`${p.nom} bourse action résultats`),
            new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000))
          ]);
          const headlines = (raw || []).slice(0, 3)
            .map(n => `${n.pubDate ? `[${n.pubDate.slice(5, 11)}] ` : ""}${n.title}${n.snippet ? ` — ${n.snippet.slice(0, 120)}` : ""}`);
          if (headlines.length) newsParTicker[`${p.ticker} (${p.nom})`] = headlines;
        } catch {}
      }));

      const app_context = {
        pilot: {
          id: selectedPilot.id,
          nom: selectedPilot.nom,
          strategie: selectedPilot.strategie_ia,
        },
        profil_investisseur: {
          risque: profil.risque || "equilibre",
          horizon: profil.horizon || "moyen",
          versements_pea: profil.versementsPEA || 0,
          versements_cto: profil.versementsCTO || 0,
          objectif: profil.objectif || null,
        },
        allocation_cible: allocCible || null,
        portefeuille_reel: userPositions.map(p => ({
          nom: p.nom, ticker: resolveTickerFromCache(p),
          quantite: p.quantite, pru: p.pru,
          cours: p.dernierCours || p.pru,
          perf_pct: p.pru > 0 ? +((((p.dernierCours || p.pru) - p.pru) / p.pru) * 100).toFixed(2) : 0,
        })),
        scoring_marche: marketScoring.slice(0, 10).map(s => `${s.nom} — ${s.signal || "?"} (${s.score_marche || "?"}/20) — ${s.resume || ""}`),
        historique_valeur: snapshots.map(s => `${s.date}: ${s.valeur?.toFixed(0)}€`),
        transactions_recentes: recentTrades.map(o => `${o.date} ${o.type} ${o.quantite}×${o.titre} à ${o.prixUnitaire}€`),
        dividendes_recus: dividendes.map(d => `${d.date} ${d.titre}: +${d.montant}€`),
        actualites_marche: actualites,
        news_par_position: Object.keys(newsParTicker).length > 0
          ? Object.entries(newsParTicker).map(([k, headlines]) => `${k}:\n${headlines.map(h => `  • ${h}`).join("\n")}`)
          : [],
      };

      // Journal : mettre à jour les cours des positions OPEN avant l'appel IA
      const journalKey = `bourse_ai_journal_${account}`;
      const existingJournal = load(journalKey, []);
      const journalWithUpdatedPrices = existingJournal.map(e => {
        if (e.statut !== "OPEN" || !freshPrices[e.ticker]) return e;
        const pv_pct = +((freshPrices[e.ticker] - e.cours_entree) / e.cours_entree * 100).toFixed(2);
        return { ...e, cours_actuel: freshPrices[e.ticker], pv_pct };
      });

      const res = await fetch("/api/ai-portfolio-decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: safeStringify({ portfolio: workingPf, prices: freshPrices, account, session_type: session, courtier_info, dca_injected: dcaInjected, dca_amount: dcaInjected ? dcaMensuel : 0, courtier_min_ordre: courtierObj.minOrdre, courtier_min_etf: courtierObj.minOrdreETF, claude_key: getKey("anthropic") || undefined, gemini_key: getKey("gemini") || undefined, autopilot_context, app_context, market_open: getMarketStatus(MARKETS_CFG.find(m => m.id === "paris")).open, market_reason: getMarketStatus(MARKETS_CFG.find(m => m.id === "paris")).reason, decision_journal: journalWithUpdatedPrices.slice(0, 15) }),
        signal: AbortSignal.timeout(90000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur serveur ${res.status}`);
      }
      const { decisions, strategie, conviction } = await res.json();
      if (!decisions) throw new Error("Réponse IA invalide");

      // 3. Apply trades (SELL, BUY, stop-loss — aucune limite hors contraintes courtier/position)
      const updatedPf = applyDecisions(workingPf, decisions, freshPrices, courtierObj);
      updatedPf.strategie_courante = strategie || updatedPf.strategie_courante;
      updatedPf.conviction_last = conviction || "faible";

      const now = new Date().toISOString();
      if (session === "OUVERTURE") updatedPf.last_morning_cycle = now;
      else if (session === "CLÔTURE") updatedPf.last_evening_cycle = now;
      else updatedPf.last_manual_cycle = now;

      // 4. Mettre à jour le journal de décisions
      const executed = updatedPf._executed || [];
      const soldTickers = executed.filter(t => t.action === "SELL").map(t => t.ticker);
      const nowDate = now.slice(0, 10);
      const parisHeure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(now));

      const closedJournal = journalWithUpdatedPrices.map(e =>
        e.statut === "OPEN" && e.action === "BUY" && soldTickers.includes(e.ticker)
          ? { ...e, statut: "CLOSED", closed_at: nowDate }
          : e
      );
      const newEntries = executed.map((t, i) => ({
        id: Date.now() + i,
        date: nowDate,
        heure: parisHeure,
        session,
        action: t.action,
        ticker: t.ticker,
        nom: t.nom,
        quantite: t.quantite,
        cours_entree: t.prix,
        raison: t.raison || "",
        cours_actuel: t.prix,
        pv_pct: 0,
        statut: t.action === "BUY" ? "OPEN" : "CLOSED",
      }));
      const newJournal = [...newEntries, ...closedJournal].slice(0, 50);
      save(journalKey, newJournal);

      // Snapshot benchmark (CW8.PA PEA / IWDA.AS CTO)
      const benchTicker = account === "CTO" ? "IWDA.AS" : "CW8.PA";
      const benchPrice  = freshPrices[benchTicker];
      if (benchPrice) {
        const bSnaps = [...(updatedPf.benchmark_snapshots || []).filter(s => s.date !== nowDate), { date: nowDate, prix: benchPrice }].slice(-365);
        updatedPf.benchmark_snapshots = bSnaps;
      }

      setAiPf(updatedPf);
      save(aiPfKey(account), updatedPf);

      // Enregistrer le résultat du cycle dans le score de défi
      const newVal     = totalValue(updatedPf, freshPrices);
      const cycleAiPct = updatedPf.capital_initial > 0 ? ((newVal - updatedPf.capital_initial) / updatedPf.capital_initial) * 100 : 0;
      const userSnapsNow = load("bourse_snapshots", []).filter(s => s.date >= (updatedPf.inception_date || "2000-01-01"));
      const cycleUserPct = (() => {
        if (userSnapsNow.length >= 2) {
          const base = userSnapsNow[0].valeur, last = userSnapsNow[userSnapsNow.length - 1].valeur;
          return base > 0 ? ((last - base) / base) * 100 : null;
        }
        return null;
      })();
      if (cycleUserPct !== null) {
        const updated = recordCycleResult(account, cycleAiPct - cycleUserPct);
        setChallengeScore(updated);
      }

      const cycleTaunt = getCycleTaunt(decisions || [], cycleAiPct, cycleUserPct, loadChallengeScore(account), aiPf.inception_date);
      setCycleLog({ decisions, strategie, conviction, session, dca_injected: dcaInjected, dca_amount: dcaInjected ? dcaMensuel : 0, taunt: cycleTaunt });
    } catch (e) {
      setError(e.message);
    } finally {
      setCycling(false);
      window.__aiCycling = false;
    }
  }, [aiPf, cycling, account]);

  // Auto-trigger 2x/jour : 9h05 (ouverture), 17h15 (clôture) — Paris, jours ouvrés
  useEffect(() => {
    if (!aiPf) return;
    const check = () => {
      if (cycling) return;
      const { h, m, todayParis, isWeekend } = getParisTime();
      if (isWeekend) return;
      if (h === 9 && m >= 5 && m <= 20 && !aiPf.last_morning_cycle?.startsWith(todayParis)) handleRunCycle("OUVERTURE");
      else if (h === 17 && m >= 15 && m <= 30 && !aiPf.last_evening_cycle?.startsWith(todayParis)) handleRunCycle("CLÔTURE");
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [aiPf, cycling, handleRunCycle]);

  const handleReset = () => {
    if (!window.confirm("Réinitialiser le Portefeuille IA ? Toutes les données (trades, performance) seront perdues.")) return;
    setAiPf(null);
    save(aiPfKey(account), null);
    setCycleLog(null);
    setError(null);
    setPrices({});
    localStorage.removeItem(challengeKey(account));
    setChallengeScore({});
  };

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!aiPf) return <EmptyState onInit={handleInit} account={account} error={error} />;

  // ── Derived values ──────────────────────────────────────────────────────────
  const val  = totalValue(aiPf, prices);
  const perf = aiPf.capital_initial > 0 ? ((val - aiPf.capital_initial) / aiPf.capital_initial) * 100 : 0;

  const userSnaps = (() => {
    const all = load("bourse_snapshots", []);
    return aiPf.inception_date ? all.filter(s => s.date >= aiPf.inception_date) : all;
  })();

  const userPerf = (() => {
    // Snapshots disponibles : perf depuis inception IA
    if (userSnaps.length >= 2) {
      const base = userSnaps[0].valeur, last = userSnaps[userSnaps.length - 1].valeur;
      return base > 0 ? ((last - base) / base) * 100 : null;
    }
    // Fallback : perf calculée depuis les positions réelles vs capital initial IA
    if (aiPf.capital_initial > 0) {
      const realPositions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === account);
      const currentUserVal = realPositions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0)
        + (account === "PEA" ? (load("bourse_profil", {}).especesPEA || 0) : (load("bourse_profil", {}).especesCTO || 0));
      return ((currentUserVal - aiPf.capital_initial) / aiPf.capital_initial) * 100;
    }
    return null;
  })();

  const fp = (p, fallback = "—") => p === null || p === undefined ? fallback : (p >= 0 ? "+" : "") + p.toFixed(2) + "%";
  const perfColor = (p) => p === null ? C.inkMuted : p >= 0 ? "#059669" : "#DC2626";

  const nextCycleLabel = (() => {
    try {
      const { h, m, todayParis, isWeekend } = getParisTime();
      const morningDone = aiPf?.last_morning_cycle?.startsWith(todayParis);
      const eveningDone = aiPf?.last_evening_cycle?.startsWith(todayParis);
      if (!isWeekend && (h < 9 || (h === 9 && m < 5)) && !morningDone) return "aujourd'hui à 9h05";
      if (!isWeekend && (h < 17 || (h === 17 && m < 15)) && !eveningDone) return "aujourd'hui à 17h15";
      const next = new Date();
      do { next.setDate(next.getDate() + 1); } while (["Sat","Sun"].includes(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "short" }).format(next)));
      return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" }).format(next) + " à 9h05";
    } catch { return "prochain jour ouvré à 9h05"; }
  })();

  const inceptionFmt = aiPf.inception_date
    ? new Date(aiPf.inception_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "24px", lineHeight: 1 }}>{getAiEmoji()}</span>
            <span style={{ fontSize: "20px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>{getAiName() || "Agent"}</span>
            <span style={{ fontSize: "10px", fontWeight: "800", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", color: "#C1E8FF", borderRadius: "6px", padding: "3px 8px", letterSpacing: "0.5px" }}>AUTO</span>
            <Tooltip text={`${getAiName() || "Agent"} est autonome : il part avec le même capital et les mêmes positions que vous. Son objectif : faire mieux que vous.`} iconOnly />
          </div>
          <div style={{ fontSize: "12px", color: C.inkMuted, marginTop: "3px" }}>
            Depuis le {inceptionFmt} · Capital {fmtEur(aiPf.capital_initial)} · {account}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {(() => {
            const { todayParis } = getParisTime();
            const manualDone = aiPf?.last_manual_cycle?.startsWith(todayParis);
            const disabled = cycling || manualDone;
            return (
              <button onClick={handleRunCycle} disabled={disabled} title={manualDone ? "Cycle manuel déjà utilisé aujourd'hui" : undefined}
                style={{ padding: "9px 18px", borderRadius: "10px", border: "none", cursor: disabled ? "default" : "pointer", fontSize: "12px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: "7px", background: disabled ? C.snowDim : "linear-gradient(135deg, #2D6CB5, #4B9DD8, #2D6CB5)", color: disabled ? C.inkMuted : "#fff", transition: "all 0.18s" }}>
                {cycling ? <BNextLabel /> : manualDone ? "✓ Cycle utilisé" : "▶ Lancer un cycle"}
              </button>
            );
          })()}
          <button onClick={handleReset} title="Réinitialiser le portefeuille IA"
            style={{ width: "34px", height: "34px", borderRadius: "10px", background: C.snowDim, border: `1px solid ${C.border}`, cursor: "pointer", fontSize: "14px", color: C.inkMuted, transition: "all 0.15s" }}>↺</button>
        </div>
      </div>

      {/* ── Challenge Banner ── */}
      <ChallengeBanner
        aiPerf={perf}
        userPerf={userPerf}
        aiName={getAiName()}
        aiEmoji={getAiEmoji()}
        account={account}
        inceptionFmt={inceptionFmt}
        challengeScore={challengeScore}
      />

      {/* ── Marché fermé ── */}
      {!getMarketStatus(MARKETS_CFG.find(m => m.id === "paris")).open && (
        <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: "12px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: "#92400E", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>⚠️</span>
          <span>Marché Paris fermé — un cycle lancé maintenant analysera le portefeuille mais n'exécutera aucun trade jusqu'à la prochaine ouverture.</span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "12px", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#B91C1C", lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {/* ── KPI row ── */}
      <div className="ba-g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "24px" }}>
        {[
          {
            label: "Valeur IA",
            value: hidden ? "••••" : fmtEur(val),
            sub: fp(perf),
            subColor: perfColor(perf),
          },
          {
            label: "Cash dispo",
            value: hidden ? "••••" : fmtEur(aiPf.cash),
            sub: `${aiPf.capital_initial > 0 ? ((aiPf.cash / aiPf.capital_initial) * 100).toFixed(0) : 0}% du capital`,
          },
          {
            label: "vs Votre portefeuille",
            value: userPerf !== null ? fp(perf - userPerf) : "—",
            sub: `IA ${fp(perf)} · Vous ${fp(userPerf)}`,
            subColor: userPerf !== null ? perfColor(perf - userPerf) : C.inkMuted,
          },
          {
            label: "Positions · Trades",
            value: `${aiPf.positions.length} · ${aiPf.trades?.length || 0}`,
            sub: aiPf.last_cycle ? `Dernier cycle ${new Date(aiPf.last_cycle).toLocaleDateString("fr-FR")}` : "Aucun cycle",
          },
        ].map(({ label, value, sub, subColor }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.72)", border: `1px solid ${C.border}`, borderRadius: "14px", padding: "14px 16px", backdropFilter: "blur(8px)" }}>
            <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>{label}</div>
            <div style={{ fontSize: "18px", fontWeight: "800", color: C.ink, letterSpacing: "-0.01em" }}>{value}</div>
            {sub && <div style={{ fontSize: "11px", color: subColor || C.inkMuted, marginTop: "3px", fontWeight: "500" }}>{sub}</div>}
          </div>
        ))}
      </div>


      {/* ── Stratégie actuelle ── */}
      {aiPf.strategie_courante && (
        <div style={{ background: "linear-gradient(135deg,rgba(30,58,95,0.07),rgba(30,58,95,0.02))", border: "1px solid rgba(30,58,95,0.13)", borderRadius: "14px", padding: "14px 18px", marginBottom: "20px" }}>
          <div style={{ fontSize: "10px", fontWeight: "700", color: "#1E3A5F", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "5px" }}>Stratégie en cours</div>
          <div style={{ fontSize: "13px", color: C.ink, lineHeight: 1.55 }}>{aiPf.strategie_courante}</div>
        </div>
      )}

      {/* ── Positions + Trades ── */}
      <div style={{ display: "grid", gridTemplateColumns: aiPf.positions.length > 0 && aiPf.trades?.length > 0 ? "1fr 1fr" : "1fr", gap: "20px", marginBottom: "20px" }}>

        {/* Positions */}
        {aiPf.positions.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.72)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink, marginBottom: "12px" }}>
              Positions ({aiPf.positions.length})
              <span style={{ marginLeft: "8px", fontSize: "11px", fontWeight: "500", color: C.inkMuted }}>
                {hidden ? "••••" : fmtEur(val - aiPf.cash)} investis
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              {[...aiPf.positions].sort((a, b) => {
                const va = a.quantite * (prices[a.ticker] || a.dernier_cours || a.prix_achat_moyen);
                const vb = b.quantite * (prices[b.ticker] || b.dernier_cours || b.prix_achat_moyen);
                return vb - va;
              }).map(p => {
                const cours = prices[p.ticker] || p.dernier_cours || p.prix_achat_moyen;
                const pvPct = ((cours - p.prix_achat_moyen) / (p.prix_achat_moyen || 1)) * 100;
                const valPos = p.quantite * cours;
                const pctPf  = val > 0 ? (valPos / val) * 100 : 0;
                return (
                  <div key={p.ticker} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 11px", background: C.snowDim, borderRadius: "10px" }}>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{p.nom}</div>
                      <div style={{ fontSize: "10px", color: C.inkMuted, marginTop: "1px" }}>
                        <a href={`https://finance.yahoo.com/lookup?s=${p.isin || TICKER_ISIN_MAP[p.ticker] || p.ticker}`} target="_blank" rel="noopener noreferrer" style={{ color: C.inkMuted, textDecoration: "underline", textDecorationStyle: "dotted" }}>{p.ticker}</a>
                        {" · "}{p.quantite} titres · {pctPf.toFixed(0)}% PF
                      </div>
                      <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px" }}>
                        Cours {hidden ? "••••" : fmtEur(cours)} · PRU {hidden ? "••••" : fmtEur(p.prix_achat_moyen)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{hidden ? "••••" : fmtEur(valPos)}</div>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: pvPct >= 0 ? "#059669" : "#DC2626" }}>
                        {pvPct >= 0 ? "+" : ""}{pvPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trades history */}
        {aiPf.trades?.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.72)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink, marginBottom: "12px" }}>Historique des trades</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "300px", overflowY: "auto" }}>
              {aiPf.trades.slice(0, 20).map((t, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", padding: "7px 9px", borderRadius: "9px", background: "#F8F9FA" }}>
                  <span style={{ flexShrink: 0, fontSize: "9px", fontWeight: "800", padding: "3px 6px", borderRadius: "5px", marginTop: "1px",
                    background: t.action === "BUY" ? "rgba(5,150,105,0.1)" : t.action === "DCA" || t.action === "DEPOT" ? "rgba(30,58,95,0.1)" : t.action === "STOP_LOSS" ? "rgba(234,179,8,0.15)" : "rgba(220,38,38,0.08)",
                    color: t.action === "BUY" ? "#059669" : t.action === "DCA" || t.action === "DEPOT" ? "#1E3A5F" : t.action === "STOP_LOSS" ? "#92400E" : "#DC2626" }}>
                    {t.action === "BUY" ? "ACHAT" : t.action === "DCA" ? "DCA" : t.action === "DEPOT" ? "DÉPÔT" : t.action === "STOP_LOSS" ? "STOP" : "VENTE"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "11px", fontWeight: "700", color: C.ink }}>
                      {t.nom}
                      {t.quantite > 0 && <span style={{ fontWeight: "400", color: C.inkMuted }}> ×{t.quantite} @ {fmtEur(t.prix)}</span>}
                      {t.montant > 0 && t.quantite === 0 && <span style={{ fontWeight: "600", color: "#1E3A5F" }}> +{fmtEur(t.montant)}</span>}
                    </div>
                    {t.raison && <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px", lineHeight: 1.35 }}>{t.raison}</div>}
                    <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "1px", display: "flex", gap: "8px" }}>
                      <span>{new Date(t.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                      {t.frais === 0 && (t.action === "BUY" || t.action === "SELL") && <span style={{ color: "#059669", fontWeight: "700" }}>0€ frais BM</span>}
                      {t.frais > 0 && <span>{fmtEur(t.frais)} frais</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Empty portfolio (no positions yet) ── */}
      {aiPf.positions.length === 0 && aiPf.trades?.length === 0 && !cycling && (
        <div style={{ textAlign: "center", padding: "32px", background: "rgba(255,255,255,0.6)", border: `1px solid ${C.border}`, borderRadius: "16px", marginBottom: "20px" }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>💤</div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: C.ink, marginBottom: "6px" }}>Aucune position pour l'instant</div>
          <div style={{ fontSize: "12px", color: C.inkMuted }}>Lancez un premier cycle pour que l'IA déploie son capital.</div>
        </div>
      )}

      {/* ── Last cycle decisions ── */}
      {cycleLog?.decisions?.length > 0 && (
        <div style={{ background: "rgba(30,58,95,0.04)", border: "1px solid rgba(30,58,95,0.1)", borderRadius: "16px", padding: "16px 18px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", color: "#1E3A5F" }}>
                {cycleLog.conviction === "faible" ? "Analyse du cycle" : "Décisions du cycle"} — {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              </span>
              {cycleLog.conviction && (
                <span style={{ fontSize: "9px", fontWeight: "800", padding: "2px 7px", borderRadius: "5px",
                  background: cycleLog.conviction === "fort" ? "rgba(5,150,105,0.1)" : cycleLog.conviction === "moyen" ? "rgba(230,184,0,0.12)" : "rgba(100,116,139,0.08)",
                  color: cycleLog.conviction === "fort" ? "#059669" : cycleLog.conviction === "moyen" ? "#B8920A" : C.inkMuted }}>
                  CONVICTION {cycleLog.conviction.toUpperCase()}
                </span>
              )}
            </div>
            {cycleLog.taunt && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", maxWidth: "260px" }}>
                <span style={{ fontSize: "14px", lineHeight: 1, flexShrink: 0 }}>{getAiEmoji()}</span>
                <div style={{ fontSize: "12px", fontStyle: "italic", color: "#1E3A5F", opacity: 0.75, lineHeight: 1.4 }}>
                  {cycleLog.taunt}
                </div>
              </div>
            )}
          </div>

          {cycleLog.dca_injected && cycleLog.dca_amount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "7px 10px", background: "rgba(30,58,95,0.06)", borderRadius: "9px", marginBottom: "8px", fontSize: "12px" }}>
              <span style={{ fontSize: "9px", fontWeight: "800", padding: "2px 6px", borderRadius: "5px", background: "rgba(30,58,95,0.12)", color: "#1E3A5F" }}>DCA</span>
              <span style={{ fontWeight: "600", color: C.ink }}>Apport mensuel injecté</span>
              <span style={{ color: C.inkMuted }}>+{fmtEur(cycleLog.dca_amount)} ajoutés au cash</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {cycleLog.decisions.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "8px", fontSize: "12px" }}>
                <span style={{ flexShrink: 0, fontSize: "9px", fontWeight: "800", padding: "2px 6px", borderRadius: "5px",
                  background: d.action === "BUY" ? "rgba(5,150,105,0.1)" : d.action === "SELL" ? "rgba(220,38,38,0.08)" : "rgba(100,116,139,0.08)",
                  color: d.action === "BUY" ? "#059669" : d.action === "SELL" ? "#DC2626" : C.inkMuted }}>
                  {d.action === "BUY" ? "ACHAT" : d.action === "SELL" ? "VENTE" : "CONSERVER"}
                </span>
                <span style={{ fontWeight: "600", color: C.ink }}>{d.nom}</span>
                {d.quantite > 0 && <span style={{ color: C.inkMuted }}>×{d.quantite}{d.cours ? ` @ ${fmtEur(d.cours)}` : ""}</span>}
                <span style={{ color: C.inkSubtle, flex: 1, fontSize: "11px" }}>— {d.raison}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Journal de décisions ── */}
      {(() => {
        const journal = load(`bourse_ai_journal_${account}`, []);
        if (!journal.length) return null;
        const open   = journal.filter(e => e.statut === "OPEN");
        const closed = journal.filter(e => e.statut === "CLOSED");
        const Entry = ({ e }) => {
          const pvColor = e.pv_pct > 0 ? "#059669" : e.pv_pct < 0 ? "#DC2626" : C.inkMuted;
          const isClosed = e.statut === "CLOSED";
          return (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "9px", background: isClosed ? "rgba(100,116,139,0.04)" : "rgba(255,255,255,0.8)", opacity: isClosed ? 0.7 : 1, fontSize: "11px" }}>
              <span style={{ flexShrink: 0, fontSize: "9px", fontWeight: "800", padding: "2px 6px", borderRadius: "5px",
                background: e.action === "BUY" ? "rgba(5,150,105,0.1)" : "rgba(220,38,38,0.08)",
                color: e.action === "BUY" ? "#059669" : "#DC2626" }}>
                {e.action === "BUY" ? "ACHAT" : "VENTE"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: "700", color: C.ink }}>{e.nom}</span>
                <span style={{ color: C.inkMuted }}> ×{e.quantite} @ {fmtEur(e.cours_entree)}</span>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {e.pv_pct != null && (
                  <div style={{ fontSize: "11px", fontWeight: "700", color: pvColor }}>
                    {e.pv_pct >= 0 ? "+" : ""}{e.pv_pct}%
                  </div>
                )}
                <div style={{ fontSize: "9px", color: C.inkSubtle }}>{e.date} · {e.session}</div>
              </div>
              {isClosed && <span style={{ fontSize: "9px", color: C.inkSubtle, flexShrink: 0 }}>Clôturé</span>}
            </div>
          );
        };
        return (
          <div style={{ background: "rgba(255,255,255,0.72)", border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>Journal de décisions</div>
                <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px" }}>{open.length} position{open.length > 1 ? "s" : ""} ouverte{open.length > 1 ? "s" : ""} · {closed.length} clôturée{closed.length > 1 ? "s" : ""}</div>
              </div>
              <button onClick={() => { save(`bourse_ai_journal_${account}`, []); setAiPf(pf => ({ ...pf })); }}
                style={{ fontSize: "10px", color: C.inkSubtle, background: "none", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "4px 9px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Effacer
              </button>
            </div>
            {open.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: closed.length ? "10px" : 0 }}>
                {open.map(e => <Entry key={e.id} e={e} />)}
              </div>
            )}
            {closed.length > 0 && (
              <>
                <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", margin: "8px 0 6px" }}>Décisions clôturées</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {closed.slice(0, 10).map(e => <Entry key={e.id} e={e} />)}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Cron info footer ── */}
      <div style={{ padding: "12px 16px", background: "rgba(255,255,255,0.5)", border: `1px solid ${C.border}`, borderRadius: "12px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ fontSize: "12px", color: C.inkMuted }}>
          <span>{getAiEmoji()} Prochain cycle : <strong>{nextCycleLabel}</strong></span>
          {(() => {
            const dcaAmt = load("bourse_profil", DEFAULT_PROFIL).dcaMensuel || 0;
            if (!dcaAmt) return null;
            const lastDca = aiPf.last_dca_date;
            const { todayParis } = getParisTime();
            const currentMonth = todayParis.slice(0, 7);
            const dcaDone = lastDca === currentMonth;
            return (
              <span style={{ marginLeft: "16px" }}>
                💳 DCA <strong>{fmtEur(dcaAmt)}/mois</strong>
                {dcaDone
                  ? <span style={{ color: "#059669", marginLeft: "4px" }}>✓ injecté ce mois</span>
                  : <span style={{ color: C.inkSubtle, marginLeft: "4px" }}>· le 1er du mois</span>
                }
              </span>
            );
          })()}
        </div>
        {aiPf.last_cycle && (
          <span style={{ fontSize: "11px", color: C.inkSubtle }}>
            Dernier : {new Date(aiPf.last_cycle).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

    </div>
  );
}
