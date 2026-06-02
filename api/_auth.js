const { createClient } = require("@supabase/supabase-js");

// anon-key suffit pour valider un JWT — la service-role n'est pas nécessaire ici
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function verifyJWT(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) return { user: null, error: "Token manquant" };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { user: null, error: "Token invalide ou expiré" };
  return { user, error: null };
}

module.exports = { verifyJWT };
