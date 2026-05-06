module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: "symbols required" });

  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  try {
    // 1 — Récupère cookies Yahoo
    const homeRes = await fetch("https://finance.yahoo.com/", {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      redirect: "follow",
    });
    const rawCookies = homeRes.headers.getSetCookie
      ? homeRes.headers.getSetCookie()
      : (homeRes.headers.get("set-cookie") || "").split(/,(?=[^ ])/);
    const cookieStr = rawCookies.map(c => c.split(";")[0]).join("; ");

    // 2 — Récupère le crumb
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, "Cookie": cookieStr },
    });
    const crumb = await crumbRes.text();

    if (!crumb || crumb.includes("<")) {
      return res.status(502).json({ error: "Crumb Yahoo Finance indisponible" });
    }

    // 3 — Requête quote
    const fields = "symbol,shortName,regularMarketPrice,regularMarketChangePercent,regularMarketVolume,fiftyTwoWeekLow,fiftyTwoWeekHigh,regularMarketOpen";
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}&crumb=${encodeURIComponent(crumb)}&lang=fr-FR&region=FR`;

    const quoteRes = await fetch(url, {
      headers: { "User-Agent": UA, "Cookie": cookieStr, "Accept": "application/json" },
    });
    const data = await quoteRes.json();
    res.status(quoteRes.status).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
