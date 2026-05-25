const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Referer": "https://finance.yahoo.com/",
  "Origin": "https://finance.yahoo.com",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url required" });

  // Sécurité : n'accepte que les URLs Yahoo Finance
  if (!url.includes("yahoo.com")) return res.status(403).json({ error: "Only Yahoo Finance URLs allowed" });

  // Essaie query1 puis query2
  const urls = [url, url.replace("query1.finance.yahoo.com", "query2.finance.yahoo.com")];

  for (const target of urls) {
    try {
      const r = await fetch(target, { headers: HEADERS });
      if (r.status === 429) continue;
      if (!r.ok) continue;
      const data = await r.json();
      return res.status(200).json(data);
    } catch {
      continue;
    }
  }

  return res.status(502).json({ error: "Yahoo Finance indisponible" });
};
