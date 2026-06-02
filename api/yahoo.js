const { checkOrigin } = require("./_cors");

module.exports = async function handler(req, res) {
  if (!checkOrigin(req, res)) return;

  const { symbols, interval, range, period1, period2, search } = req.query;

  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://finance.yahoo.com/",
    "Origin": "https://finance.yahoo.com",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
  };

  // Mode search : résolution ISIN → ticker
  if (search) {
    const q = String(search).replace(/[^A-Z0-9.\-]/gi, "").slice(0, 20);
    if (!q) return res.status(400).json({ error: "search required" });
    const searchUrls = [
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=5&newsCount=0`,
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=5&newsCount=0`,
    ];
    for (const url of searchUrls) {
      try {
        const r = await fetch(url, { headers: HEADERS });
        if (!r.ok) continue;
        const text = await r.text();
        if (!text || text.trimStart().startsWith("<")) continue;
        return res.status(200).json(JSON.parse(text));
      } catch { continue; }
    }
    return res.status(503).json({ error: "Search unavailable" });
  }

  if (!symbols) return res.status(400).json({ error: "symbols required" });

  const symbolList = symbols.split(",").map(s => s.trim().replace(/[^A-Z0-9.\-^=]/gi, "")).filter(Boolean);
  const iv = /^[a-z0-9]+$/.test(interval || "") ? interval : "1d";
  const rg = /^[a-z0-9]+$/.test(range    || "") ? range    : "5d";
  const p1 = period1 && /^\d+$/.test(period1) ? period1 : null;
  const p2 = period2 && /^\d+$/.test(period2) ? period2 : null;

  // Mode chart : 1 symbole + interval explicite → retourne les données brutes v8/chart
  const isChartMode = symbolList.length === 1 && req.query.interval;
  if (isChartMode) {
    const symbol = symbolList[0];
    const periodParam = p1 && p2 ? `period1=${p1}&period2=${p2}` : `range=${rg}`;
    const chartUrls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${iv}&${periodParam}&includePrePost=false`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${iv}&${periodParam}&includePrePost=false`,
    ];
    for (const url of chartUrls) {
      try {
        const r = await fetch(url, { headers: HEADERS });
        if (!r.ok) continue;
        const text = await r.text();
        if (!text || text.trimStart().startsWith("<")) continue;
        const data = JSON.parse(text);
        if (data?.chart?.result?.[0]) return res.status(200).json(data);
      } catch { continue; }
    }
    return res.status(503).json({ error: "Données indisponibles" });
  }

  const fetchOne = async (symbol) => {
    const urls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${iv}&range=${rg}&includePrePost=false`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${iv}&range=${rg}&includePrePost=false`,
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`,
    ];

    for (const url of urls) {
      try {
        const r = await fetch(url, { headers: HEADERS });
        if (r.status === 429) continue;
        if (!r.ok) continue;
        const text = await r.text();
        if (!text || text.trimStart().startsWith("<")) continue;
        const data = JSON.parse(text);

        // v8/chart response
        if (data?.chart?.result?.[0]) {
          const meta = data.chart.result[0].meta;
          const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
          const price = meta.regularMarketPrice;
          if (!price) continue;
          return {
            symbol: meta.symbol || symbol,
            shortName: meta.shortName || meta.longName || symbol,
            regularMarketPrice: price,
            regularMarketChangePercent: meta.regularMarketChangePercent ?? (prev && prev !== price ? ((price - prev) / prev) * 100 : 0),
            regularMarketVolume: meta.regularMarketVolume || 0,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow || price,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || price,
            regularMarketOpen: meta.regularMarketOpen || price,
          };
        }

        // v7/quote response
        if (data?.quoteResponse?.result?.[0]) {
          const q = data.quoteResponse.result[0];
          if (!q.regularMarketPrice) continue;
          return {
            symbol: q.symbol || symbol,
            shortName: q.shortName || q.longName || symbol,
            regularMarketPrice: q.regularMarketPrice,
            regularMarketChangePercent: q.regularMarketChangePercent || 0,
            regularMarketVolume: q.regularMarketVolume || 0,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow || q.regularMarketPrice,
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || q.regularMarketPrice,
            regularMarketOpen: q.regularMarketOpen || q.regularMarketPrice,
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  };

  try {
    const results = (await Promise.all(symbolList.map(fetchOne))).filter(Boolean);
    res.status(200).json({ quoteResponse: { result: results } });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
