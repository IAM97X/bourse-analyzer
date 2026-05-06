module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: "symbols required" });

  const symbolList = symbols.split(",").map(s => s.trim()).filter(Boolean);
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const fetchOne = async (symbol) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`;
      const r = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept": "application/json",
          "Accept-Language": "fr-FR,fr;q=0.9",
        },
      });
      const data = await r.json();
      const result = data?.chart?.result?.[0];
      if (!result) return null;
      const meta = result.meta;
      const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
      const price = meta.regularMarketPrice;
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
    } catch {
      return null;
    }
  };

  try {
    // Parallel fetch — all symbols at once, skip failures
    const results = (await Promise.all(symbolList.map(fetchOne))).filter(Boolean);
    res.status(200).json({ quoteResponse: { result: results } });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
