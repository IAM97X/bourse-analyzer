const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig    = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    event = secret
      ? stripe.webhooks.constructEvent(raw, sig, secret)
      : JSON.parse(raw);
  } catch (e) {
    return res.status(400).json({ error: `Webhook error: ${e.message}` });
  }

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

      case "customer.subscription.trial_will_end": {
        // 3 jours avant la fin du trial — on peut envoyer un email (futur)
        break;
      }

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
