const { checkOrigin } = require("./_cors");
const { verifyJWT } = require("./_auth");

module.exports = async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Auth obligatoire en production
  if (process.env.NODE_ENV === "production") {
    const { user } = await verifyJWT(req);
    if (!user) return res.status(401).json({ error: "Authentification requise." });
  }

  const { system, messages, max_tokens } = req.body || {};
  // Ignorer gemini_key du body — utiliser uniquement la clé serveur
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "Gemini non configuré côté serveur." });
  if (!messages?.length) return res.status(400).json({ error: "messages requis." });

  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
  }));

  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig: { maxOutputTokens: max_tokens || 1500, temperature: 0.3 },
  };

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const data = await upstream.json();

    if (data.error) return res.status(400).json({ error: data.error.message });

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
    if (!text) return res.status(502).json({ error: "Réponse vide de Gemini." });

    res.status(200).json({ content: [{ type: "text", text }] });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
