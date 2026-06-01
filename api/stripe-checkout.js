const Stripe = require("stripe");
const { checkOrigin } = require("./_cors");
const { verifyJWT } = require("./_auth");

const PRICE_ID = "price_1TdYinLtQieWByzOPnim27Ig";

module.exports = async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user: authUser, error: authError } = await verifyJWT(req);
  if (!authUser) return res.status(401).json({ error: "Authentification requise." });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { email } = req.body || {};
  const user_id = authUser.id;
  if (!email) return res.status(400).json({ error: "email requis" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { user_id },
      },
      metadata: { user_id },
      success_url: `${process.env.APP_URL || "https://boursenext.fr"}/?checkout=success`,
      cancel_url:  `${process.env.APP_URL || "https://boursenext.fr"}/?checkout=cancelled`,
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
