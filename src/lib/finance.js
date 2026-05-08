import { load, save } from "./storage";

export function parsePrice(str) {
  if (!str) return null;
  const s = String(str).replace(/[€$£%\u00A0\u202F]/g, " ").trim();
  const dotM = s.match(/(\d[\d ]*\.\d+)/);
  if (dotM) {
    const v = parseFloat(dotM[1].replace(/ /g, ""));
    if (v > 0 && v < 100000) return Math.round(v * 1000) / 1000;
  }
  const commaM = s.match(/^([\d ]+),([\d]{1,4})$/);
  if (commaM) {
    const v = parseFloat(commaM[1].replace(/ /g, "") + "." + commaM[2]);
    if (v > 0 && v < 100000) return Math.round(v * 1000) / 1000;
  }
  const plain = s.replace(/ /g, "").replace(",", ".");
  const plainM = plain.match(/^[\d.]+/);
  if (plainM) {
    const v = parseFloat(plainM[0]);
    if (v > 0 && v < 100000) return Math.round(v * 1000) / 1000;
  }
  return null;
}

export function fmtEur(n) {
  if (n == null || isNaN(n)) return "—";
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  const iF = i.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
  return (n < 0 ? "−" : "") + iF + "," + d + " €";
}

export function fmtCours(n) {
  if (n == null || isNaN(n)) return "—";
  const num = typeof n === "number" ? n : parseFloat(n);
  if (isNaN(num)) return "—";
  const [i, d] = Math.abs(num).toFixed(3).split(".");
  const iF = i.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
  return (num < 0 ? "−" : "") + iF + "," + d + " €";
}

export function fmtPct(n) {
  if (n == null || isNaN(n)) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + " %";
}

export function fmtPV(eur, pct) {
  if (eur == null) return "—";
  const sign = eur >= 0 ? "+" : "";
  return `${sign}${fmtEur(eur).replace(" €", "")} € (${fmtPct(pct)})`;
}

const PRICE_TTL = 15 * 60 * 1000;

export function getCachedCours(key) {
  const cache = load("bourse_cours_cache_v2", {});
  const entry = cache[key];
  if (!entry || Date.now() - entry.ts > PRICE_TTL) return null;
  return entry.cours;
}

export function setCachedCours(key, cours) {
  const cache = load("bourse_cours_cache_v2", {});
  cache[key] = { cours, ts: Date.now() };
  const keys = Object.keys(cache);
  if (keys.length > 50) delete cache[keys[0]];
  save("bourse_cours_cache_v2", cache);
}

export function sanitizePositions(positions) {
  if (!Array.isArray(positions)) return [];
  return positions.map(p => {
    if (!p || typeof p !== "object") return null;
    const pru      = Number(p.pru)      || 0;
    const quantite = Number(p.quantite) || 0;
    let dernierCours = Number(p.dernierCours) || 0;
    if (dernierCours && pru && dernierCours > pru * 20 && dernierCours > 1000) dernierCours = 0;
    return {
      nom: p.nom || "Inconnu",
      isin: p.isin || "",
      ticker: p.ticker || "",
      secteur: p.secteur || "Autre",
      compte: p.compte || "PEA",
      pru,
      quantite,
      dernierCours: dernierCours || null,
      alerteHaute: Number(p.alerteHaute) || null,
      alerteBasse: Number(p.alerteBasse) || null,
      ...p,
      pru, quantite, dernierCours: dernierCours || null,
    };
  }).filter(Boolean);
}

export const isETFName = (nom) =>
  /etf|tracker|ucits|msci|world|amundi|lyxor|ishares|bnp.*easy|vanguard|s&p|sp500|nasdaq|cac|dax/i.test(nom || "");

export function computeRiskScore(positions, totalActuel) {
  if (!positions.length) return null;
  let score = 5;
  const nbPositions = positions.length;
  const nbETF = positions.filter(p => isETFName(p.nom)).length;
  const totalInvest = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const totalVal = totalActuel || totalInvest;

  positions.forEach(p => {
    const poids = totalVal > 0 ? (((p.dernierCours || p.pru) * p.quantite) / totalVal) * 100 : 0;
    if (poids > 30) score += 2;
    else if (poids > 20) score += 1;
  });
  if (nbPositions <= 2) score += 2;
  else if (nbPositions <= 4) score += 1;
  else if (nbPositions >= 10) score -= 1;
  if (nbETF / nbPositions > 0.5) score -= 1;
  const pvPct = totalInvest > 0 ? ((totalVal - totalInvest) / totalInvest) * 100 : 0;
  if (pvPct < -20) score += 2;
  else if (pvPct < -10) score += 1;
  else if (pvPct > 30) score -= 1;

  return Math.min(10, Math.max(1, Math.round(score)));
}
