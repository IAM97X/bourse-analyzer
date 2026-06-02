const Stripe = require("stripe");
const { checkOrigin } = require("./_cors");
const { verifyJWT } = require("./_auth");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user, error: authError } = await verifyJWT(req);
  if (!user) return res.status(401).json({ error: "Authentification requise." });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const { data } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (!data?.stripe_customer_id) {
      return res.status(404).json({ error: "Aucun abonnement actif trouvé." });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${process.env.APP_URL || "https://boursenext.fr"}/?tab=subscription`,
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
