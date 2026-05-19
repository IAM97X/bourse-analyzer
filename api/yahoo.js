module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: "symbols required" });

  const symbolList = symbols.split(",").map(s => s.trim()).filter(Boolean);

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

  const fetchOne = async (symbol) => {
    const urls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`,
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
    ];

    for (const url of urls) {
      try {
        const r = await fetch(url, { headers: HEADERS });
        if (r.status === 429) continue;
        if (!r.ok) continue;

        const data = await r.json();

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
            regularMarketChangePercent: prev && prev !== price ? ((price - prev) / prev) * 100 : 0,
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
