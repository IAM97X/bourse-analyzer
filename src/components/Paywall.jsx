import { useState } from "react";
import { C, shadow } from "../constants/theme";
import { useSubscription, startCheckout } from "../context/subscription";
import { supabase } from "../lib/storage";

export default function Paywall() {
  const { status, trial_ends_at } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleCheckout = async () => {
    setLoading(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Non connecté");
      await startCheckout(user.id, user.email);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const daysLeft = trial_ends_at
    ? Math.max(0, Math.ceil((new Date(trial_ends_at) - Date.now()) / 86400000))
    : null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(15,23,42,0.7)",
      backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        background: "#fff", borderRadius: "24px",
        padding: "40px 36px", maxWidth: "440px", width: "100%",
        boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
        textAlign: "center", fontFamily: "'DM Sans', sans-serif",
      }}>
        {/* Logo */}
        <div style={{ fontSize: "28px", marginBottom: "24px" }}>
          <span style={{ fontWeight: "300", color: C.inkSoft }}>B</span>
          <span style={{ fontWeight: "800", backgroundImage: "linear-gradient(135deg,#1A3260,#2D6CB5,#7BBFE8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Next</span>
          <span style={{ fontWeight: "700", color: C.ink }}> Premium</span>
        </div>

        {status === "expired" ? (
          <>
            <div style={{ fontSize: "20px", fontWeight: "800", color: C.ink, marginBottom: "8px", letterSpacing: "-0.03em" }}>
              Votre essai gratuit est terminé
            </div>
            <div style={{ fontSize: "13px", color: C.inkMuted, marginBottom: "28px", lineHeight: 1.65 }}>
              Passez à Premium pour continuer à utiliser les signaux IA, l'Agent autonome, les projections et le chat.
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: "20px", fontWeight: "800", color: C.ink, marginBottom: "8px", letterSpacing: "-0.03em" }}>
              {daysLeft !== null ? `${daysLeft} jour${daysLeft !== 1 ? "s" : ""} d'essai restant${daysLeft !== 1 ? "s" : ""}` : "Essai gratuit"}
            </div>
            <div style={{ fontSize: "13px", color: C.inkMuted, marginBottom: "28px", lineHeight: 1.65 }}>
              Souscrivez maintenant pour continuer après votre période d'essai.
            </div>
          </>
        )}

        {/* Prix */}
        <div style={{ background: C.snowOff, borderRadius: "16px", padding: "20px", marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Premium</div>
          <div style={{ fontSize: "36px", fontWeight: "800", color: C.ink, letterSpacing: "-0.04em" }}>
            2,99€ <span style={{ fontSize: "14px", fontWeight: "500", color: C.inkMuted }}>/mois</span>
          </div>
          <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "6px" }}>Sans engagement · Résiliable à tout moment</div>
        </div>

        {/* Features */}
        <div style={{ textAlign: "left", marginBottom: "28px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {["Signaux IA illimités", "Agent IA autonome (2 cycles/jour)", "Projections & DCA", "Chat IA", "Synchronisation cloud"].map(f => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: C.ink }}>
              <span style={{ color: C.green, fontWeight: "700" }}>✓</span> {f}
            </div>
          ))}
        </div>

        {error && <div style={{ fontSize: "12px", color: C.red, marginBottom: "12px" }}>{error}</div>}

        <button
          onClick={handleCheckout}
          disabled={loading}
          style={{
            width: "100%", padding: "14px",
            borderRadius: "50px", border: "none",
            background: "linear-gradient(135deg,#1A3260,#2D6CB5)",
            color: "#fff", fontSize: "14px", fontWeight: "700",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            boxShadow: shadow.pill,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {loading ? "Redirection…" : "Passer à Premium →"}
        </button>

        <div style={{ marginTop: "12px", fontSize: "11px", color: C.inkSubtle }}>
          Paiement sécurisé par Stripe · Sans carte pendant l'essai
        </div>
      </div>
    </div>
  );
}
