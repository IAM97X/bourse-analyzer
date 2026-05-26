import { useState } from "react";
import { save } from "../lib/storage";
import { C, shadow } from "../constants/theme";

export const ONBOARDING_KEY = "bourse_onboarding_v1";

const HORIZONS = [
  { key: "court",  label: "Court terme",  sub: "moins de 3 ans" },
  { key: "moyen",  label: "Moyen terme",  sub: "3 à 10 ans" },
  { key: "long",   label: "Long terme",   sub: "plus de 10 ans" },
];

const inp = {
  width: "100%", padding: "11px 14px", borderRadius: "12px",
  border: `1.5px solid ${C.border}`, background: C.snowOff,
  fontSize: "14px", color: C.ink, fontFamily: "Inter,sans-serif",
  outline: "none", boxSizing: "border-box",
};

const choiceBtn = (active) => ({
  flex: 1, padding: "12px 8px", borderRadius: "12px", cursor: "pointer",
  border: active ? `2px solid ${C.navyPill}` : `1.5px solid ${C.border}`,
  background: active ? `rgba(30,58,95,0.07)` : C.snow,
  color: active ? C.navyPill : C.inkMuted,
  fontFamily: "Inter,sans-serif", fontWeight: active ? "700" : "500",
  fontSize: "13px", transition: "all 0.15s",
});

export default function OnboardingWizard({ onComplete }) {
  const [step, setStep]       = useState(0);
  const [compte, setCompte]   = useState("PEA");
  const [nom, setNom]         = useState("");
  const [pru, setPru]         = useState("");
  const [qty, setQty]         = useState("");
  const [horizon, setHorizon] = useState("moyen");
  const [dca, setDca]         = useState("");

  const skip = () => finalize(true);

  function finalize(skipPosition = false) {
    // Profil
    const profil = {
      capital: 0, risque: "equilibre",
      horizon,
      dcaMensuel: parseFloat(dca) || 0,
      dcaDuree: 12,
      courtier: "boursobank",
      especesPEA: 0, especesCTO: 0,
      versementsPEA: 0, versementsCTO: 0,
    };
    save("bourse_profil", profil);
    save("bourse_account", compte === "CTO" ? "CTO" : "PEA");

    // 1ère position
    if (!skipPosition && nom.trim() && parseFloat(pru) > 0 && parseFloat(qty) > 0) {
      const pos = [{
        nom: nom.trim(), isin: "", pru: parseFloat(pru),
        quantite: parseFloat(qty), compte,
        dernierCours: null, intradayVariation: null,
      }];
      save("bourse_portfolio", pos);
    }

    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
    onComplete();
  }

  const step2Valid = nom.trim() && parseFloat(pru) > 0 && parseFloat(qty) > 0;

  const steps = [
    {
      icon: "👋",
      title: "Bienvenue !",
      subtitle: "Pour personnaliser ton expérience, dis-moi en 3 étapes comment tu investis.",
      content: (
        <div>
          <div style={{ fontSize: "12px", fontWeight: "600", color: C.inkSubtle, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ton type de compte</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {["PEA", "CTO", "Les deux"].map(c => (
              <button key={c} style={choiceBtn(compte === c)} onClick={() => setCompte(c)}>{c}</button>
            ))}
          </div>
          <div style={{ marginTop: "14px", padding: "12px 14px", background: "rgba(30,58,95,0.05)", borderRadius: "10px", fontSize: "12px", color: C.inkMuted, lineHeight: "1.6" }}>
            {compte === "PEA" && "Le PEA est fiscalement avantageux après 5 ans. Idéal pour investir en actions européennes sur le long terme."}
            {compte === "CTO" && "Le CTO est plus flexible — tu peux acheter n'importe quelle action dans le monde, sans plafond."}
            {compte === "Les deux" && "Tu as les deux ? Parfait, tu pourras suivre chaque compte séparément dans l'app."}
          </div>
        </div>
      ),
    },
    {
      icon: "📈",
      title: "Ta première action",
      subtitle: "Ajoute une position pour commencer à suivre ton portefeuille.",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "600", color: C.inkSubtle, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Nom de l'action</div>
            <input style={inp} placeholder="ex : Total Energies, Apple…" value={nom} onChange={e => setNom(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", fontWeight: "600", color: C.inkSubtle, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Prix d'achat (€)</div>
              <input style={inp} type="number" min="0" step="0.01" placeholder="ex : 24,50" value={pru} onChange={e => setPru(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "11px", fontWeight: "600", color: C.inkSubtle, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Quantité</div>
              <input style={inp} type="number" min="0" step="1" placeholder="ex : 10" value={qty} onChange={e => setQty(e.target.value)} />
            </div>
          </div>
        </div>
      ),
      skipLabel: "Je n'ai pas encore de position →",
    },
    {
      icon: "🎯",
      title: "Ton objectif",
      subtitle: "Ces infos permettent à l'IA d'adapter ses recommandations à ta situation.",
      content: (
        <div>
          <div style={{ fontSize: "12px", fontWeight: "600", color: C.inkSubtle, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Horizon d'investissement</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {HORIZONS.map(h => (
              <button key={h.key} style={{ ...choiceBtn(horizon === h.key), display: "flex", flexDirection: "column", gap: "2px", padding: "10px 6px" }} onClick={() => setHorizon(h.key)}>
                <span style={{ fontSize: "12px" }}>{h.label}</span>
                <span style={{ fontSize: "10px", fontWeight: "400", opacity: 0.7 }}>{h.sub}</span>
              </button>
            ))}
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "600", color: C.inkSubtle, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>DCA mensuel (optionnel)</div>
            <div style={{ position: "relative" }}>
              <input style={{ ...inp, paddingRight: "36px" }} type="number" min="0" step="10" placeholder="ex : 100" value={dca} onChange={e => setDca(e.target.value)} />
              <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", color: C.inkMuted }}>€/mois</span>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const s = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,15,25,0.72)", backdropFilter: "blur(8px)", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "28px", padding: "32px 28px 24px", maxWidth: "420px", width: "100%", boxShadow: shadow.float }}>

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginBottom: "28px" }}>
          {steps.map((_, i) => (
            <div key={i} style={{ width: i === step ? "22px" : "6px", height: "6px", borderRadius: "3px", background: i <= step ? C.navyPill : C.border, transition: "all 0.3s" }} />
          ))}
        </div>

        {/* Icon */}
        <div style={{ width: "64px", height: "64px", borderRadius: "20px", background: C.paleBlue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", margin: "0 auto 16px" }}>
          {s.icon}
        </div>

        {/* Title */}
        <div style={{ fontSize: "20px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", textAlign: "center", marginBottom: "6px" }}>{s.title}</div>
        <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.6", textAlign: "center", marginBottom: "22px" }}>{s.subtitle}</div>

        {/* Content */}
        {s.content}

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px", marginTop: "22px" }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{ padding: "12px 16px", borderRadius: "14px", border: `1px solid ${C.border}`, background: C.snowOff, color: C.inkMuted, fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
              ←
            </button>
          )}
          <button
            onClick={() => {
              if (isLast) { finalize(false); }
              else { setStep(s => s + 1); }
            }}
            disabled={step === 1 && !step2Valid && nom.trim() !== ""}
            style={{ flex: 1, padding: "13px", borderRadius: "14px", border: "none", background: `linear-gradient(135deg, ${C.navyPill} 0%, #2563EB 100%)`, color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif", boxShadow: shadow.pill, opacity: (step === 1 && !step2Valid && nom.trim() !== "") ? 0.5 : 1 }}>
            {isLast ? "Commencer →" : "Suivant →"}
          </button>
        </div>

        {/* Skip */}
        {s.skipLabel && (
          <button onClick={() => { setStep(s => s + 1); }}
            style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: C.inkSubtle, fontSize: "12px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            {s.skipLabel}
          </button>
        )}
        {step === 0 && (
          <button onClick={skip}
            style={{ display: "block", margin: "12px auto 0", background: "none", border: "none", color: C.inkSubtle, fontSize: "11px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            Passer l'introduction
          </button>
        )}
      </div>
    </div>
  );
}
