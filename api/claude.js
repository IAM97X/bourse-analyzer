module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = req.headers["x-api-key"];
  if (!key) return res.status(401).json({ error: "Clé API manquante. Configurez votre clé Anthropic dans les Paramètres." });

  try {
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const upstreamHeaders = {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    };
    if (req.headers["anthropic-beta"]) upstreamHeaders["anthropic-beta"] = req.headers["anthropic-beta"];
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: upstreamHeaders,
      body,
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
