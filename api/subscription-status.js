const { createClient } = require("@supabase/supabase-js");
const { checkOrigin } = require("./_cors");
const { verifyJWT } = require("./_auth");

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Vérification JWT — l'user_id vient du token, pas du query param (évite l'usurpation)
  const { user, error: authError } = await verifyJWT(req);
  if (!user) return res.status(401).json({ error: "Authentification requise." });
  const user_id = user.id;

  try {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("subscription_status, trial_ends_at, stripe_customer_id")
      .eq("user_id", user_id)
      .single();

    if (error || !data) {
      // Pas encore d'entrée → on crée un trial de 7 jours
      const trial_ends_at = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      await supabase.from("user_subscriptions").insert({
        user_id,
        subscription_status: "trial",
        trial_ends_at,
        updated_at: new Date().toISOString(),
      });
      return res.status(200).json({ status: "trial", trial_ends_at, premium: true });
    }

    // Vérifier si le trial est expiré
    let status = data.subscription_status;
    if (status === "trial" && data.trial_ends_at && new Date(data.trial_ends_at) < new Date()) {
      status = "expired";
      await supabase.from("user_subscriptions")
        .update({ subscription_status: "expired", updated_at: new Date().toISOString() })
        .eq("user_id", user_id);
    }

    const premium = status === "trial" || status === "active";
    res.status(200).json({ status, trial_ends_at: data.trial_ends_at, premium });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
