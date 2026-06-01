const { checkOrigin } = require("./_cors");
const { verifyJWT } = require("./_auth");
const { createClient } = require("@supabase/supabase-js");

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const LIMIT_HOUR = 200;
const LIMIT_DAY  = 500;

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRateLimit(userId) {
  const now = new Date();
  const oneHourAgo = new Date(now - 3600 * 1000).toISOString();
  const oneDayAgo  = new Date(now - 86400 * 1000).toISOString();

  const [{ count: hourCount }, { count: dayCount }] = await Promise.all([
    supabase.from("api_usage").select("*", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", oneHourAgo),
    supabase.from("api_usage").select("*", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", oneDayAgo),
  ]);

  if (hourCount >= LIMIT_HOUR) return { blocked: true, reason: `Limite horaire atteinte (${LIMIT_HOUR}/h). Réessayez dans quelques minutes.` };
  if (dayCount  >= LIMIT_DAY)  return { blocked: true, reason: `Limite journalière atteinte (${LIMIT_DAY}/j). Réessayez demain.` };
  return { blocked: false };
}

module.exports = async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "Clé Anthropic non configurée côté serveur." });

  // Vérification JWT — authentification obligatoire
  const { user, error: authError } = await verifyJWT(req);
  if (!user) return res.status(401).json({ error: "Authentification requise." });

  // Rate limiting sur l'utilisateur vérifié
  try {
    const { blocked, reason } = await checkRateLimit(user.id);
    if (blocked) return res.status(429).json({ error: reason });
    supabase.from("api_usage").insert({ user_id: user.id, endpoint: "claude", created_at: new Date().toISOString() }).then(() => {});
  } catch {}

  try {
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const upstreamHeaders = {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
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
