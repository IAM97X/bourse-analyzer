import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/storage";

const SubscriptionCtx = createContext({ premium: false, status: "free", loading: true, refresh: () => {} });

export function SubscriptionProvider({ children, userId }) {
  const [sub, setSub] = useState({ premium: false, status: "free", trial_ends_at: null, loading: true });

  const refresh = useCallback(async () => {
    if (!userId) { setSub({ premium: false, status: "free", trial_ends_at: null, loading: false }); return; }
    try {
      const headers = { "Content-Type": "application/json" };
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res  = await fetch(`/api/subscription-status?user_id=${encodeURIComponent(userId)}`, { headers });
      const data = await res.json();
      setSub({ premium: data.premium ?? false, status: data.status ?? "free", trial_ends_at: data.trial_ends_at ?? null, loading: false });
    } catch {
      setSub({ premium: false, status: "free", trial_ends_at: null, loading: false });
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return <SubscriptionCtx.Provider value={{ ...sub, refresh }}>{children}</SubscriptionCtx.Provider>;
}

export function useSubscription() { return useContext(SubscriptionCtx); }

// Redirige vers Stripe Checkout
export async function startCheckout(userId, email) {
  const headers = { "Content-Type": "application/json" };
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  const res  = await fetch("/api/stripe-checkout", {
    method: "POST",
    headers,
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
  else throw new Error(data.error || "Erreur Stripe");
}
