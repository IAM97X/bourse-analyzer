const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Lit le corps brut sans parsing — requis pour la vérification HMAC Stripe
const getRawBody = (req) => new Promise((resolve, reject) => {
  let data = "";
  req.on("data", chunk => { data += chunk; });
  req.on("end",  () => resolve(data));
  req.on("error", reject);
});

// Désactiver le bodyParser Vercel pour recevoir le flux brut
module.exports.config = { api: { bodyParser: false } };

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET manquant" });

  const sig = req.headers["stripe-signature"];
  const raw = await getRawBody(req);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return res.status(400).json({ error: `Webhook error: ${e.message}` });
  }

  // Idempotence — nécessite la table Supabase :
  // CREATE TABLE stripe_processed_events (id TEXT PRIMARY KEY, processed_at TIMESTAMPTZ DEFAULT now());
  try {
    const { error: dupError } = await supabase
      .from("stripe_processed_events")
      .insert({ id: event.id });
    if (dupError) return res.status(200).json({ received: true }); // déjà traité
  } catch {}

  const getCustomerId = (obj) => typeof obj.customer === "string" ? obj.customer : obj.customer?.id;

  try {
    switch (event.type) {

      case "checkout.session.completed": {
        const session   = event.data.object;
        const user_id   = session.metadata?.user_id;
        const stripe_id = getCustomerId(session);
        if (!user_id) break;
        await supabase.from("user_subscriptions").upsert({
          user_id,
          stripe_customer_id:  stripe_id,
          subscription_status: "active",
          trial_ends_at:       null,
          updated_at:          new Date().toISOString(),
        }, { onConflict: "user_id" });
        break;
      }

      case "customer.subscription.trial_will_end":
        break;

      case "customer.subscription.deleted": {
        const sub       = event.data.object;
        const stripe_id = getCustomerId(sub);
        if (!stripe_id) break;
        await supabase.from("user_subscriptions")
          .update({ subscription_status: "expired", updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", stripe_id);
        break;
      }

      case "invoice.payment_failed": {
        const inv       = event.data.object;
        const stripe_id = getCustomerId(inv);
        if (!stripe_id) break;
        await supabase.from("user_subscriptions")
          .update({ subscription_status: "expired", updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", stripe_id);
        break;
      }

      case "invoice.payment_succeeded": {
        const inv       = event.data.object;
        const stripe_id = getCustomerId(inv);
        if (!stripe_id) break;
        await supabase.from("user_subscriptions")
          .update({ subscription_status: "active", updated_at: new Date().toISOString() })
          .eq("stripe_customer_id", stripe_id);
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
