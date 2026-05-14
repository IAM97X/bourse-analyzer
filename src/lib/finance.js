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
      alerteHaute: Number(p.alerteHaute) || null,
      alerteBasse: Number(p.alerteBasse) || null,
      ...p,
      pru, quantite, dernierCours: dernierCours ?? null,
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

export const PROFIL_RANK = { prudent: 0, equilibre: 1, dynamique: 2, "tres-dynamique": 3 };

const NL_SUR_PARIS = new Set(["NL0014559478","NL00150001Q9","NL0000235190","NL0010273215","NL0011794037"]);
export function getMIC(isin) {
  if (!isin) return "XPAR";
  if (NL_SUR_PARIS.has(isin)) return "XPAR";
  if (isin.startsWith("BE")) return "XBRU";
  if (isin.startsWith("NL")) return "XAMS";
  return "XPAR";
}
export function getEuronextUrl(isin, nom) {
  if (!isin) return null;
  const mic  = getMIC(isin);
  const type = isETFName(nom) ? "etfs" : "equities";
  return `https://live.euronext.com/fr/product/${type}/${isin}-${mic}`;
}

export function linReg(xs, ys) {
  const n = xs.length;
  if (n < 2) return { a: ys[0] || 0, b: 0, sigma: 0 };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  const ssxx = xs.reduce((s, v) => s + (v - mx) ** 2, 0);
  const ssxy = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0);
  const b = ssxy / ssxx;
  const a = my - b * mx;
  const residuals = xs.map((x, i) => ys[i] - (a + b * x));
  const sigma = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(n - 2, 1));
  return { a, b, sigma };
}

export function computeMA(prices, win) {
  return prices.map((_, i) => {
    if (i < win - 1) return null;
    return prices.slice(i - win + 1, i + 1).reduce((s, v) => s + v, 0) / win;
  });
}

export function computeRSI(prices, period = 14) {
  const result = new Array(prices.length).fill(null);
  if (prices.length <= period) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    const gain = d >= 0 ? d : 0, loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}
