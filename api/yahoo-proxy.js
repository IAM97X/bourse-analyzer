const BASE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

const ALLOWED_ORIGINS = [
  "https://boursenext.fr",
  "https://www.boursenext.fr",
  "http://localhost:3000",
  "http://localhost:3001",
];

// Cache crumb en mémoire (durée de vie de la fonction serverless ~minutes)
let _crumb = null;
let _cookie = null;
let _crumbTs = 0;

async function getCrumb() {
  const now = Date.now();
  if (_crumb && _cookie && now - _crumbTs < 4 * 60 * 1000) return { crumb: _crumb, cookie: _cookie };

  // 1. Récupère les cookies depuis la page d'accueil Yahoo
  const homeRes = await fetch("https://finance.yahoo.com/", {
    headers: { ...BASE_HEADERS, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    redirect: "follow",
  });
  const setCookies = homeRes.headers.get("set-cookie") || "";
  const cookie = setCookies.split(",")
    .map(c => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");

  // 2. Récupère le crumb
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...BASE_HEADERS, "Accept": "text/plain, */*", "Cookie": cookie },
  });
  const crumb = crumbRes.ok ? await crumbRes.text() : null;
  if (crumb && crumb.length > 0 && !crumb.includes("<")) {
    _crumb = crumb.trim();
    _cookie = cookie;
    _crumbTs = now;
  }
  return { crumb: _crumb, cookie: _cookie };
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = ALLOWED_ORIGINS.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : "");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!allowed) return res.status(403).json({ error: "Origine non autorisée" });

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "url required" });
  if (!url.includes("yahoo.com")) return res.status(403).json({ error: "Only Yahoo Finance URLs allowed" });

  try {
    const { crumb, cookie } = await getCrumb();

    // Injecte le crumb sur tous les endpoints JSON Yahoo
    let targetUrl = url.replace("query1.finance.yahoo.com", "query2.finance.yahoo.com");
    if (crumb) {
      const sep = targetUrl.includes("?") ? "&" : "?";
      targetUrl += `${sep}crumb=${encodeURIComponent(crumb)}`;
    }

    const headers = {
      ...BASE_HEADERS,
      "Accept": "application/json, text/plain, */*",
      "Referer": "https://finance.yahoo.com/",
    };
    if (cookie) headers["Cookie"] = cookie;

    const tryFetch = async (u) => {
      const r = await fetch(u, { headers });
      if (!r.ok) return null;
      const text = await r.text();
      if (!text || text.trimStart().startsWith("<")) return null;
      try { return JSON.parse(text); } catch { return null; }
    };

    let data = await tryFetch(targetUrl);

    // Fallback query1 sans crumb si query2 échoue
    if (!data) {
      const fallback = url.includes("query1") ? url : url.replace("query2", "query1");
      data = await tryFetch(fallback);
    }

    if (data) return res.status(200).json(data);
    return res.status(503).json({ error: "Yahoo Finance indisponible ou rate-limit" });
  } catch (e) {
    return res.status(502).json({ error: "Yahoo Finance indisponible", detail: e.message });
  }
};
