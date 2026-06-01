import { ALPHAVANTAGE_KEY, GOOGLE_API_KEY, GOOGLE_CX, FMP_KEY, fetchWithProxy } from "./api";

// ─── FMP — cache ISIN → ticker ────────────────────────────────────────────────
const _fmpTickerCache = {};

async function resolveFMPTicker(isin) {
  if (_fmpTickerCache[isin]) return _fmpTickerCache[isin];
  const key = String(FMP_KEY);
  const url = `https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(isin)}&apikey=${key}`;
  const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`FMP search HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error(`FMP: ticker introuvable pour ${isin}`);
  // Préférer marchés européens (suffixe .PA .AS .BR .MI .MC)
  const euroSuffixes = [".PA", ".AS", ".BR", ".MI", ".MC", ".L", ".DE", ".SW"];
  const best = data.find(r => euroSuffixes.some(s => r.symbol?.endsWith(s))) || data[0];
  _fmpTickerCache[isin] = best.symbol;
  return best.symbol;
}

// ─── Financial Modeling Prep — cours temps réel par ISIN ─────────────────────
export async function fetchFMPQuote(isin) {
  const key = String(FMP_KEY);
  if (!key) throw new Error("Clé FMP manquante");
  const ticker = await resolveFMPTicker(isin);
  const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(ticker)}?apikey=${key}`;
  const res  = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`FMP HTTP ${res.status}`);
  const data = await res.json();
  const q = Array.isArray(data) ? data[0] : data;
  if (!q?.price) throw new Error("FMP: prix introuvable");
  return {
    price:           q.price,
    changePercent:   q.changesPercentage ?? null,
    name:            q.name ?? null,
  };
}

// ─── Financial Modeling Prep — historique journalier par ISIN ─────────────────
export async function fetchFMPHistorical(isin, fromDate, toDate) {
  const key = String(FMP_KEY);
  if (!key) throw new Error("Clé FMP manquante");
  const ticker = await resolveFMPTicker(isin);
  return fetchFMPHistoricalByTicker(ticker, fromDate, toDate);
}

// ─── Financial Modeling Prep — historique journalier par ticker direct ─────────
export async function fetchFMPHistoricalByTicker(ticker, fromDate, toDate) {
  const key = String(FMP_KEY);
  if (!key) throw new Error("Clé FMP requise pour les données historiques. Ajoutez-la dans Paramètres → Clés API.");
  const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(ticker)}?from=${fromDate}&to=${toDate}&apikey=${key}`;
  const res  = await fetchWithProxy(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`FMP HTTP ${res.status}`);
  const data = await res.json();
  const historical = data?.historical || [];
  return historical
    .filter(d => d.date && d.close != null)
    .map(d => ({ date: d.date, close: d.close }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const TICKER_CACHE_KEY = "bourse_isin_ticker_cache";

export function parseBoursobankCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const results = [];

  // Normalise une cellule : retire espaces insécables, guillemets, espaces
  const norm = s => (s || "").trim().replace(/[\u00A0\u202F]/g, "").replace(/^"|"$/g, "");
  const toFloat = s => parseFloat(norm(s).replace(",", ".").replace(/\s/g, "")) || 0;
  const toPct   = s => {
    const v = parseFloat(norm(s).replace(",", ".").replace(/\s/g, "").replace("%", ""));
    return isNaN(v) ? null : v;
  };

  // Détecter la ligne d'en-tête pour mapper les colonnes par nom
  let colMap = null;  // { nom, isin, qty, pru, cours, variation }
  let dataStart = 0;

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cols = lines[i].split(/\t|;/).map(norm);
    const lower = cols.map(c => c.toLowerCase());
    if (lower.some(c => c.includes("isin"))) {
      colMap = {
        nom:       lower.findIndex(c => c.includes("valeur") || c.includes("libell") || c.includes("nom")),
        isin:      lower.findIndex(c => c.includes("isin")),
        qty:       lower.findIndex(c => c.includes("qté") || c.includes("quant") || c === "qté"),
        pru:       lower.findIndex(c => c.includes("revient") || c.includes("pru") || c.includes("achat")),
        cours:     lower.findIndex(c => c.includes("cours") || c.includes("dernier")),
        variation: lower.findIndex(c => c.includes("variation") || c.includes("var.")),
      };
      dataStart = i + 1;
      break;
    }
  }

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(/\t|;/).map(norm);
    if (cols.length < 4) continue;

    let name, isin, qtyRaw, pruRaw, lastRaw, varRaw;
    if (colMap && colMap.isin >= 0) {
      name   = colMap.nom       >= 0 ? cols[colMap.nom]       : cols[0];
      isin   = colMap.isin      >= 0 ? cols[colMap.isin]      : cols[1];
      qtyRaw = colMap.qty       >= 0 ? cols[colMap.qty]       : cols[2];
      pruRaw = colMap.pru       >= 0 ? cols[colMap.pru]       : cols[3];
      lastRaw = colMap.cours    >= 0 ? cols[colMap.cours]     : cols[4];
      varRaw  = colMap.variation >= 0 ? cols[colMap.variation] : cols[5];
    } else {
      // Fallback positionnel : Nom;ISIN;Qté;PRU;Cours;Variation;...
      [name, isin, qtyRaw, pruRaw, lastRaw, varRaw] = cols;
    }

    const pru         = toFloat(pruRaw);
    const quantite    = Math.round(toFloat(qtyRaw));
    const dernierCours = lastRaw ? (toFloat(lastRaw) || null) : null;
    const intradayVariation = varRaw ? toPct(varRaw) : null;

    if (!name || pru <= 0 || quantite <= 0) continue;
    results.push({
      id: Date.now() + i,
      nom: name.trim(),
      isin: isin?.trim().toUpperCase() || null,
      pru,
      quantite,
      alerteHaute: null,
      alerteBasse: null,
      dernierCours: (dernierCours && dernierCours < pru * 50) ? dernierCours : null,
      intradayVariation,
      lastFetch: dernierCours ? Date.now() : null,
    });
  }
  return results;
}

// Cache des symboles Alpha Vantage (ISIN → symbol) pour éviter les appels répétés
const _avSymbolCache = {};

// ─── Alpha Vantage — cours temps réel (gratuit, 25 req/jour) ─────────────────
export async function fetchCoursAlphaVantage(nom, isin) {
  // 1. Trouver le symbole Alpha Vantage via SYMBOL_SEARCH (par ISIN ou nom)
  const cacheKey = isin || nom;
  let symbol = _avSymbolCache[cacheKey];

  if (!symbol) {
    const keyword = isin || nom;
    const searchUrl = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(keyword)}&apikey=${ALPHAVANTAGE_KEY}`;
    const searchRes  = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const matches    = searchData.bestMatches || [];
    // Préférer la région Paris/EUR, sinon prendre le premier résultat
    const best = matches.find(m => m["4. region"] === "Paris" || m["8. currency"] === "EUR") || matches[0];
    if (!best) throw new Error(`Symbole introuvable pour ${nom}`);
    symbol = best["1. symbol"];
    _avSymbolCache[cacheKey] = symbol;
  }

  // 2. Récupérer le cours avec GLOBAL_QUOTE
  const quoteUrl  = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHAVANTAGE_KEY}`;
  const quoteRes  = await fetch(quoteUrl);
  const quoteData = await quoteRes.json();
  const price     = parseFloat(quoteData["Global Quote"]?.["05. price"]);
  if (!price || isNaN(price)) throw new Error(`Cours introuvable pour ${symbol}`);
  return price;
}

// ─── Alpha Vantage — données fondamentales + consensus analystes ─────────────
export async function fetchFondamentauxAlphaVantage(nom, isin) {
  const cacheKey = isin || nom;
  let symbol = _avSymbolCache[cacheKey];

  if (!symbol) {
    const searchUrl = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(isin || nom)}&apikey=${ALPHAVANTAGE_KEY}`;
    const searchData = await (await fetch(searchUrl)).json();
    const matches = searchData.bestMatches || [];
    const best = matches.find(m => m["4. region"] === "Paris" || m["8. currency"] === "EUR") || matches[0];
    if (!best) throw new Error(`Symbole introuvable pour ${nom}`);
    symbol = best["1. symbol"];
    _avSymbolCache[cacheKey] = symbol;
  }

  const url  = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHAVANTAGE_KEY}`;
  const data = await (await fetch(url)).json();
  if (!data?.Symbol) throw new Error("Données indisponibles (hors couverture Alpha Vantage)");

  const n = (v) => v && v !== "None" && v !== "-" ? v : null;
  const consensus = {
    strongBuy:   parseInt(data.AnalystRatingStrongBuy)  || 0,
    buy:         parseInt(data.AnalystRatingBuy)         || 0,
    hold:        parseInt(data.AnalystRatingHold)        || 0,
    sell:        parseInt(data.AnalystRatingSell)        || 0,
    strongSell:  parseInt(data.AnalystRatingStrongSell)  || 0,
  };
  return {
    symbol,
    per:             n(data.PERatio),
    eps:             n(data.EPS),
    dividende:       data.DividendYield && data.DividendYield !== "None" ? (parseFloat(data.DividendYield) * 100).toFixed(2) + "%" : null,
    objectif:        data.AnalystTargetPrice && data.AnalystTargetPrice !== "None" ? parseFloat(data.AnalystTargetPrice) : null,
    haut52s:         data["52WeekHigh"]  && data["52WeekHigh"]  !== "None" ? parseFloat(data["52WeekHigh"])  : null,
    bas52s:          data["52WeekLow"]   && data["52WeekLow"]   !== "None" ? parseFloat(data["52WeekLow"])   : null,
    capitalisation:  n(data.MarketCapitalization),
    secteur:         n(data.Sector),
    consensus,
    nbAnalystes:     consensus.strongBuy + consensus.buy + consensus.hold + consensus.sell + consensus.strongSell,
  };
}

// ─── Google News — actualités récentes sans Claude ───────────────────────────
export async function fetchActualites(nom, isin) {
  const q = `${nom}${isin ? " " + isin : ""} actualités bourse`;
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(q)}&num=5&dateRestrict=m3`;
  const data = await (await fetch(url)).json();
  return (data.items || []).map(it => ({ titre: it.title, lien: it.link, extrait: it.snippet || "" }));
}

// ─── Yahoo Finance — actualités RSS avec liens ────────────────────────────────
export async function fetchYahooFinanceRSS(ticker) {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=FR&lang=fr-FR&siteid=yahoofr`;
  const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");
  return [...xml.getElementsByTagName("item")].slice(0, 6).map(item => {
    // <link> en RSS XML est un nœud texte frère, pas un enfant direct — on le lit via nextSibling
    const linkEl = item.getElementsByTagName("link")[0];
    const link = (linkEl?.textContent || linkEl?.nextSibling?.textContent || "").trim();
    const guid  = item.getElementsByTagName("guid")[0]?.textContent?.trim() || "";
    const rawLink = link || (guid.startsWith("http") ? guid : "");
    const frLink  = rawLink.replace("https://finance.yahoo.com", "https://fr.finance.yahoo.com")
                           .replace("https://www.yahoo.com/finance", "https://fr.finance.yahoo.com");
    return {
      title:   item.getElementsByTagName("title")[0]?.textContent?.replace(/ - [^-]+$/, "").trim() || "",
      link:    frLink,
      pubDate: item.getElementsByTagName("pubDate")[0]?.textContent || "",
    };
  });
}

export function openLink(url) {
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function yahooFinanceUrl(pos) {
  const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
  const t = pos.ticker || (pos.isin && tickerCache[pos.isin]) || null;
  if (t) return `https://fr.finance.yahoo.com/quote/${encodeURIComponent(t)}/actualites/`;
  // Fallback : Yahoo accepte aussi les ISIN comme identifiant de cotation
  if (pos.isin) return `https://fr.finance.yahoo.com/quote/${encodeURIComponent(pos.isin)}/actualites/`;
  return `https://fr.finance.yahoo.com/recherche?p=${encodeURIComponent(pos.nom)}`;
}


// ─── Yahoo Finance — données analystes (consensus, objectif de cours) ────────
export async function fetchYahooAnalysts(ticker) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=financialData,recommendationTrend`;
  const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.quoteSummary?.result?.[0];
  if (!result) throw new Error("no data");
  return result;
}

// ─── Google News RSS — actualités sans clé API ────────────────────────────────
export async function fetchGoogleNewsRSS(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`;
  const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");
  return [...xml.querySelectorAll("item")].slice(0, 5).map(item => ({
    title:   item.querySelector("title")?.textContent?.replace(/ - [^-]+$/, "").trim() || "",
    snippet: item.querySelector("description")?.textContent?.replace(/<[^>]*>/g, "").slice(0, 200).trim() || "",
    pubDate: item.querySelector("pubDate")?.textContent?.slice(0, 16) || "",
  }));
}

// ─── Formate données externes en texte pour prompt Claude ────────────────────
export function formatExternalContext(nom, analysts, news) {
  const lines = [`=== ${nom} ===`];
  if (analysts) {
    const fd = analysts.financialData;
    if (fd?.recommendationKey) {
      const keyMap = { "strong_buy": "ACHAT FORT", "buy": "ACHAT", "hold": "CONSERVER", "sell": "VENTE", "underperform": "SOUS-PERFORMER", "strong_sell": "VENTE FORTE" };
      const recLabel = keyMap[fd.recommendationKey] || fd.recommendationKey.toUpperCase();
      lines.push(`Consensus analystes : ${recLabel} (${fd.recommendationMean?.raw?.toFixed(1) || "?"}/5)`);
    }
    if (fd?.targetMeanPrice?.raw) lines.push(`Objectif cours moyen : ${fd.targetMeanPrice.raw}€`);
    if (fd?.numberOfAnalystOpinions?.raw) lines.push(`Nombre d'analystes : ${fd.numberOfAnalystOpinions.raw}`);
    const rt = analysts.recommendationTrend?.trend?.[0];
    if (rt) {
      const buy = (rt.strongBuy || 0) + (rt.buy || 0);
      const hold = rt.hold || 0;
      const sell = (rt.sell || 0) + (rt.strongSell || 0);
      if (buy + hold + sell > 0) lines.push(`Répartition : ${buy} Achat · ${hold} Conserver · ${sell} Vente`);
    }
  }
  if (news && news.length > 0) {
    lines.push("Actualités récentes :");
    news.forEach(n => {
      const date = n.pubDate ? ` [${n.pubDate}]` : "";
      lines.push(`  • ${n.title}${date}`);
      if (n.snippet) lines.push(`    ${n.snippet}`);
    });
  }
  return lines.join("\n");
}
