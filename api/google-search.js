module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.GOOGLE_API_KEY;
  const cx  = process.env.GOOGLE_CX;
  if (!key || !cx) return res.status(503).json({ error: "Google Search non configuré." });

  const { q, num = "5" } = req.query;
  if (!q) return res.status(400).json({ error: "Paramètre q requis." });

  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(q)}&num=${num}&lr=lang_fr`;
    const upstream = await fetch(url);
    const data = await upstream.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
