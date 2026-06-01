import { useState, useRef } from "react";
import { load, save, supabase, setSyncUserId, pullFromCloud } from "../lib/storage";
import { BNextLabel } from "./UI";

const LOCAL_PIN_KEY  = "bourse_local_pin";
const LOCAL_NAME_KEY = "bourse_local_name";

function PinInput({ value, onChange, label }) {
  const r0 = useRef(null), r1 = useRef(null), r2 = useRef(null), r3 = useRef(null);
  const refs = [r0, r1, r2, r3];
  const digits = [value[0]||"", value[1]||"", value[2]||"", value[3]||""];
  const handleChange = (i, e) => {
    const d = e.target.value.replace(/\D/g,"").slice(-1);
    const next = [...digits]; next[i] = d;
    onChange(next.join(""));
    if (d && i < 3) refs[i+1].current?.focus();
  };
  const handleKD = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs[i-1].current?.focus();
  };
  return (
    <div style={{ marginBottom: "20px" }}>
      {label && <div style={{ fontSize: "10px", color: "#8E8E93", fontWeight: "600", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px", textAlign: "center" }}>{label}</div>}
      <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
        {[0,1,2,3].map(i => (
          <input key={i} ref={refs[i]} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={1}
            value={digits[i]} onChange={e => handleChange(i, e)} onKeyDown={e => handleKD(i, e)}
            autoComplete="off"
            style={{ width: "58px", height: "64px", background: digits[i] ? "#EEF4FF" : "#F2F2F7", border: `1.5px solid ${digits[i] ? "#2D5986" : "#E5E5EA"}`, borderRadius: "16px", color: "#1C1C1E", fontSize: "26px", textAlign: "center", fontFamily: "'DM Sans', sans-serif", outline: "none", transition: "all 0.15s", caretColor: "transparent" }}
            onFocus={e => { e.target.style.borderColor = "#2D5986"; e.target.style.background = "#EEF4FF"; }}
            onBlur={e => { e.target.style.borderColor = digits[i] ? "#2D5986" : "#E5E5EA"; e.target.style.background = digits[i] ? "#EEF4FF" : "#F2F2F7"; }} />
        ))}
      </div>
    </div>
  );
}

async function hashPin(raw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function AuthPage({ onSession, onBack, initialMode = "signin" }) {
  const [mode, setMode]           = useState(initialMode);
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [displayName, setDisplay] = useState(() => { try { return JSON.parse(localStorage.getItem("bourse_session") || "{}").name || ""; } catch { return ""; } });
  const [pin, setPin]             = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [step, setStep]           = useState(1);
  const [keys, setKeys]           = useState({ anthropic: "", google: "", cx: "", alphavantage: "" });
  const [showKeys, setShowKeys]   = useState({});
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [info, setInfo]           = useState("");
  const [hasPinSet]   = useState(() => !!localStorage.getItem(LOCAL_PIN_KEY));
  const [savedName]   = useState(() => { try { return JSON.parse(localStorage.getItem("bourse_session") || "{}").name || ""; } catch { return ""; } });

  const toggleShow = (k) => setShowKeys(s => ({ ...s, [k]: !s[k] }));

  const handleSignIn = async () => {
    if (!supabase) { setMode("local"); return; }
    if (!email.trim() || !password) { setError("Email et mot de passe requis."); return; }
    setLoading(true); setError("");
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) { setError(err.message); setLoading(false); return; }
      const user = data.user;
      setSyncUserId(user.id);
      await pullFromCloud(user.id);
      const name = user.user_metadata?.display_name || email.split("@")[0];
      localStorage.setItem("bourse_session", JSON.stringify({ name, since: Date.now(), uid: user.id }));
      onSession(name);
    } catch (e) { setError("Erreur réseau."); }
    setLoading(false);
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password || !displayName.trim()) { setError("Tous les champs sont requis."); return; }
    if (password.length < 6) { setError("Le mot de passe doit faire au moins 6 caractères."); return; }
    setLoading(true); setError("");
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { display_name: displayName.trim() } }
      });
      if (err) { setError(err.message); setLoading(false); return; }
      if (data.user && !data.session) {
        setInfo("Un email de confirmation a été envoyé. Cliquez sur le lien pour activer votre compte.");
        setMode("signin");
      } else if (data.user) {
        setSyncUserId(data.user.id);
        localStorage.setItem("bourse_session", JSON.stringify({ name: displayName.trim(), since: Date.now(), uid: data.user.id }));
        setStep(2);
      }
    } catch (e) { setError("Erreur réseau."); }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!email.trim()) { setError("Entrez votre email."); return; }
    setLoading(true); setError("");
    const redirectTo = window.location.origin + window.location.pathname;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (err) setError(err.message);
    else setInfo("Email de réinitialisation envoyé.");
    setLoading(false);
  };

  const handleLocal = async () => {
    setError("");
    const storedHash = localStorage.getItem(LOCAL_PIN_KEY);
    const skipKeys = () => {
      try { const e = JSON.parse(localStorage.getItem("bourse_api_keys") || "{}"); return !!(e.anthropic || e.google); } catch { return false; }
    };
    if (storedHash) {
      if (pin.length !== 4) { setError("Le code PIN doit faire exactement 4 chiffres."); return; }
      const h = await hashPin(pin);
      if (h !== storedHash) { setError("Code PIN incorrect."); return; }
      const name = savedName || "Utilisateur";
      localStorage.setItem("bourse_session", JSON.stringify({ name, since: Date.now() }));
      if (skipKeys()) { onSession(name); return; }
      setStep(2);
    } else {
      if (pin.length !== 4) { setError("Le code PIN doit faire exactement 4 chiffres."); return; }
      if (pin !== pinConfirm) { setError("Les codes PIN ne correspondent pas."); return; }
      const h = await hashPin(pin);
      localStorage.setItem(LOCAL_PIN_KEY, h);
      localStorage.setItem("bourse_session", JSON.stringify({ name: "Utilisateur", since: Date.now() }));
      if (skipKeys()) { onSession("Utilisateur"); return; }
      setStep(2);
    }
  };

  const handleResetLocal = () => {
    if (!window.confirm("Réinitialiser efface TOUTES vos données. Continuer ?")) return;
    localStorage.clear();
    window.location.reload();
  };

  const handleFinish = () => {
    save("bourse_api_keys", keys);
    const s = JSON.parse(localStorage.getItem("bourse_session") || "{}");
    onSession(s.name || displayName.trim() || "Utilisateur");
  };

  const inp = (value, onChange, placeholder, type = "text") => (
    <input value={value} onChange={e => { onChange(e.target.value); setError(""); }}
      type={type} placeholder={placeholder} autoComplete="off" spellCheck="false"
      style={{ width: "100%", background: "#F2F2F7", border: "1.5px solid #E5E5EA", borderRadius: "12px", padding: "13px 16px", color: "#1C1C1E", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", marginBottom: "10px", transition: "border-color 0.15s" }}
      onFocus={e => e.target.style.borderColor = "#2D5986"}
      onBlur={e => e.target.style.borderColor = "#E5E5EA"} />
  );

  const apiInp = (field, placeholder, label) => (
    <div style={{ marginBottom: "12px" }}>
      <label style={{ display: "block", fontSize: "10px", fontWeight: "600", color: "#8E8E93", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "5px" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input type={showKeys[field] || field === "cx" ? "text" : "password"} placeholder={placeholder} value={keys[field]}
          onChange={e => setKeys(k => ({ ...k, [field]: e.target.value }))} autoComplete="off" spellCheck="false"
          style={{ width: "100%", background: "#F2F2F7", border: "1.5px solid #E5E5EA", borderRadius: "12px", padding: "11px 44px 11px 14px", color: "#1C1C1E", fontSize: "12px", fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
          onFocus={e => e.target.style.borderColor = "#2D5986"}
          onBlur={e => e.target.style.borderColor = "#E5E5EA"} />
        {field !== "cx" && <button onClick={() => toggleShow(field)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#8E8E93", fontSize: "10px", fontFamily: "'DM Sans', sans-serif", fontWeight: "600" }}>{showKeys[field] ? "Cacher" : "Voir"}</button>}
      </div>
    </div>
  );

  const btnPrimary = { width: "100%", background: "linear-gradient(135deg, #2D6CB5, #4B9DD8, #2D6CB5)", border: "none", borderRadius: "12px", padding: "14px", color: "#fff", fontSize: "14px", fontWeight: "600", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", marginTop: "6px", opacity: loading ? 0.6 : 1 };
  const btnSecondary = { width: "100%", background: "#F2F2F7", border: "none", borderRadius: "12px", padding: "13px", color: "#1C1C1E", fontSize: "13px", fontWeight: "500", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", marginTop: "8px" };
  const btnGhost = { background: "none", border: "none", color: "#8E8E93", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", padding: "10px", width: "100%" };

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F7", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'DM Sans', sans-serif" }}>

      <div style={{ width: "100%", maxWidth: "380px" }}>
        {/* Bouton retour landing */}
        {onBack && (
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "#6C6C70", fontSize: "13px", fontWeight: "600", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", padding: "0 0 20px", lineHeight: 1 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Retour
          </button>
        )}
        {/* Logo + titre */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "36px", fontWeight: "300", color: "#374151", letterSpacing: "-0.01em", lineHeight: 1.1, fontFamily: "'DM Sans', sans-serif" }}>
            Bourse<span style={{ fontWeight: "800", letterSpacing: "-0.04em", fontFamily: "'DM Sans', sans-serif", backgroundImage: "linear-gradient(135deg, #0F2D5E 0%, #2D6CB5 50%, #7BBFE8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Next</span>
          </div>
          <div style={{ fontSize: "13px", color: "#8E8E93", marginTop: "6px" }}>Soyez le prochain.</div>
        </div>

        {/* Card */}
        <div style={{ background: "#FFFFFF", borderRadius: "20px", padding: "28px 24px", boxShadow: "0 2px 16px rgba(0,0,0,0.07)", border: "1px solid #E5E5EA" }}>

          {info && <div style={{ background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: "#16a34a" }}>✓ {info}</div>}
          {error && <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: "10px", padding: "10px 14px", marginBottom: "12px", fontSize: "12px", color: "#dc2626" }}>⚠ {error}</div>}

          {/* ── STEP 2 : Clés API ── */}
          {step === 2 && (
            <>
              <div style={{ fontSize: "17px", fontWeight: "700", color: "#1C1C1E", marginBottom: "4px" }}>Clés API <span style={{ fontSize: "12px", fontWeight: "400", color: "#8E8E93" }}>— optionnelles</span></div>
              <div style={{ fontSize: "11px", color: "#6C6C70", marginBottom: "16px", lineHeight: "1.6", background: "#F2F2F7", borderRadius: "10px", padding: "10px 14px" }}>
                Stockées <strong style={{ color: "#1C1C1E" }}>uniquement dans votre navigateur</strong>. Jamais envoyées à nos serveurs.
              </div>
              {!keys.anthropic.trim() && (
                <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "11px", color: "#92400e", lineHeight: "1.6" }}>
                  <strong>Sans clé Claude</strong> : portfolio + graphiques + DCA actifs. IA désactivée.
                </div>
              )}
              <div style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                  <label style={{ fontSize: "10px", fontWeight: "600", color: "#8E8E93", letterSpacing: "0.8px", textTransform: "uppercase" }}>Clé Claude (Anthropic)</label>
                  <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ fontSize: "10px", color: "#2D5986", textDecoration: "none", fontWeight: "600" }}>Obtenir →</a>
                </div>
                <div style={{ position: "relative" }}>
                  <input type={showKeys["anthropic"] ? "text" : "password"} placeholder="sk-ant-api03-…" value={keys.anthropic}
                    onChange={e => setKeys(k => ({ ...k, anthropic: e.target.value }))} autoComplete="off" spellCheck="false"
                    style={{ width: "100%", background: "#F2F2F7", border: `1.5px solid ${keys.anthropic.trim() ? "rgba(22,163,74,0.5)" : "#E5E5EA"}`, borderRadius: "12px", padding: "11px 44px 11px 14px", color: "#1C1C1E", fontSize: "12px", fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
                  <button onClick={() => toggleShow("anthropic")} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#8E8E93", fontSize: "10px", fontFamily: "'DM Sans', sans-serif", fontWeight: "600" }}>{showKeys["anthropic"] ? "Cacher" : "Voir"}</button>
                </div>
                {keys.anthropic.trim() && <div style={{ fontSize: "10px", color: "#16a34a", marginTop: "4px" }}>✓ Toutes les fonctionnalités IA disponibles</div>}
              </div>
              {apiInp("google", "AIzaSy…", "Clé Google Search")}
              {apiInp("cx", "707b30d5e62e…", "Google CX")}
              {apiInp("alphavantage", "AREI4UOU…", "Alpha Vantage")}
              <button onClick={handleFinish} style={btnPrimary}>{keys.anthropic.trim() ? "Accéder à mon espace →" : "Continuer sans clé API →"}</button>
              <div style={{ textAlign: "center", marginTop: "10px", fontSize: "11px", color: "#8E8E93" }}>Vous pouvez ajouter les clés plus tard dans Paramètres.</div>
            </>
          )}

          {/* ── SIGN IN ── */}
          {step === 1 && mode === "signin" && (
            <>
              {supabase ? (
                <>
                  <div style={{ fontSize: "18px", fontWeight: "700", color: "#1C1C1E", marginBottom: "18px" }}>Connexion</div>
                  {inp(email, setEmail, "Email", "email")}
                  {inp(password, setPassword, "Mot de passe", "password")}
                  <button onClick={() => { setMode("reset"); setError(""); setInfo(""); }} style={{ ...btnGhost, textAlign: "right", fontSize: "11px", padding: "4px 0 10px" }}>Mot de passe oublié ?</button>
                  <button onClick={handleSignIn} disabled={loading} style={btnPrimary}>{loading ? <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:"8px" }}><BNextLabel /></span> : "Se connecter →"}</button>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "14px 0" }}>
                    <div style={{ flex: 1, height: "1px", background: "#E5E5EA" }} />
                    <span style={{ fontSize: "11px", color: "#C7C7CC" }}>ou</span>
                    <div style={{ flex: 1, height: "1px", background: "#E5E5EA" }} />
                  </div>
                  <button onClick={() => { setMode("signup"); setError(""); }} style={btnSecondary}>Créer un compte</button>
                  <button onClick={() => { setMode("local"); setError(""); }} style={btnGhost}>Continuer sans compte</button>
                </>
              ) : hasPinSet ? (
                <>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#1C1C1E", marginBottom: "4px" }}>Bonjour</div>
                  <div style={{ fontSize: "12px", color: "#8E8E93", marginBottom: "24px" }}>Entrez votre code PIN</div>
                  <PinInput value={pin} onChange={v => { setPin(v); setError(""); }} label="Code PIN" />
                  <button onClick={handleLocal} style={{ ...btnPrimary, marginTop: "4px" }}>Accéder →</button>
                  <button onClick={() => { localStorage.removeItem(LOCAL_PIN_KEY); localStorage.removeItem(LOCAL_NAME_KEY); localStorage.removeItem("bourse_session"); window.location.reload(); }} style={{ ...btnGhost, fontSize: "11px" }}>Mot de passe oublié ?</button>
                  <button onClick={handleResetLocal} style={{ ...btnGhost, fontSize: "10px", color: "#dc2626" }}>Réinitialiser l'accès (efface tout)</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#1C1C1E", marginBottom: "4px" }}>Bienvenue</div>
                  <div style={{ fontSize: "12px", color: "#8E8E93", marginBottom: "24px" }}>Choisissez un code PIN à 4 chiffres</div>
                  <PinInput value={pin} onChange={v => { setPin(v); setError(""); }} label="Code PIN" />
                  <PinInput value={pinConfirm} onChange={v => { setPinConfirm(v); setError(""); }} label="Confirmer le PIN" />
                  <button onClick={handleLocal} style={{ ...btnPrimary, marginTop: "4px" }}>Créer mon espace →</button>
                </>
              )}
            </>
          )}

          {/* ── SIGN UP ── */}
          {step === 1 && mode === "signup" && (
            <>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#1C1C1E", marginBottom: "18px" }}>Créer un compte</div>
              {inp(displayName, setDisplay, "Prénom ou pseudo")}
              {inp(email, setEmail, "Email", "email")}
              {inp(password, setPassword, "Mot de passe (min. 6 car.)", "password")}
              <div style={{ fontSize: "11px", color: "#8E8E93", marginBottom: "10px", lineHeight: "1.6" }}>Votre portefeuille sera synchronisé entre tous vos appareils.</div>
              <button onClick={handleSignUp} disabled={loading} style={btnPrimary}>{loading ? <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:"8px" }}><BNextLabel /></span> : "Créer mon compte →"}</button>
              <button onClick={() => { setMode("signin"); setError(""); }} style={btnGhost}>← Retour à la connexion</button>
            </>
          )}

          {/* ── RESET ── */}
          {step === 1 && mode === "reset" && (
            <>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#1C1C1E", marginBottom: "18px" }}>Réinitialiser</div>
              {inp(email, setEmail, "Votre email", "email")}
              <button onClick={handleReset} disabled={loading} style={btnPrimary}>{loading ? <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:"8px" }}><BNextLabel /></span> : "Envoyer le lien →"}</button>
              <button onClick={() => { setMode("signin"); setError(""); setInfo(""); }} style={btnGhost}>← Retour</button>
            </>
          )}

          {/* ── LOCAL ── */}
          {step === 1 && mode === "local" && (
            <>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#1C1C1E", marginBottom: "6px" }}>Sans compte</div>
              <div style={{ fontSize: "12px", color: "#8E8E93", marginBottom: "18px", lineHeight: "1.6" }}>Les données restent sur cet appareil uniquement.</div>
              <PinInput value={pin} onChange={v => { setPin(v); setError(""); }} label="Code PIN (4 chiffres)" />
              {!hasPinSet && <PinInput value={pinConfirm} onChange={v => { setPinConfirm(v); setError(""); }} label="Confirmer le PIN" />}
              <button onClick={handleLocal} style={btnPrimary}>Continuer localement →</button>
              <button onClick={() => { setMode("signin"); setError(""); }} style={btnGhost}>← Connexion avec un compte</button>
            </>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: "16px", fontSize: "11px", color: "#C7C7CC" }}>
          {supabase ? "Compte BourseNext · Données chiffrées côté serveur" : "Mode local · Vos données restent sur votre appareil"}
        </div>
      </div>
    </div>
  );
}

export { PinInput };
export default AuthPage;
