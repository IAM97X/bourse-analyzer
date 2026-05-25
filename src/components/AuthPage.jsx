import { useState, useRef } from "react";
import { C, shadow } from "../constants/theme";
import { load, save, supabase, setSyncUserId, pullFromCloud } from "../lib/storage";
import AppLogo from "./AppLogo";
import { ThinkingSpinner } from "./UI";

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
      {label && <div style={{ fontSize: "10px", color: "rgba(193,232,255,0.4)", fontWeight: "600", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px", textAlign: "center" }}>{label}</div>}
      <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
        {[0,1,2,3].map(i => (
          <input key={i} ref={refs[i]} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={1}
            value={digits[i]} onChange={e => handleChange(i, e)} onKeyDown={e => handleKD(i, e)}
            autoComplete="off"
            style={{ width: "58px", height: "64px", background: digits[i] ? "rgba(193,232,255,0.14)" : "rgba(255,255,255,0.06)", border: `1.5px solid ${digits[i] ? "rgba(193,232,255,0.6)" : "rgba(193,232,255,0.16)"}`, borderRadius: "16px", color: "#fff", fontSize: "26px", textAlign: "center", fontFamily: "Inter, sans-serif", outline: "none", transition: "border-color 0.15s, background 0.15s", caretColor: "transparent" }}
            onFocus={e => { e.target.style.borderColor = "rgba(193,232,255,0.75)"; e.target.style.background = "rgba(193,232,255,0.1)"; }}
            onBlur={e => { e.target.style.borderColor = digits[i] ? "rgba(193,232,255,0.6)" : "rgba(193,232,255,0.16)"; e.target.style.background = digits[i] ? "rgba(193,232,255,0.14)" : "rgba(255,255,255,0.06)"; }} />
        ))}
      </div>
    </div>
  );
}
async function hashPin(raw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}


function AuthPage({ onSession }) {
  // mode: "signin" | "signup" | "local" (keys only) | "reset"
  const [mode, setMode]           = useState("signin");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [displayName, setDisplay] = useState(() => { try { return JSON.parse(localStorage.getItem("bourse_session") || "{}").name || ""; } catch { return ""; } });
  const [pin, setPin]             = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [step, setStep]           = useState(1); // 1=auth/name, 2=clés API
  const [keys, setKeys]           = useState({ anthropic: "", google: "", cx: "", alphavantage: "" });
  const [showKeys, setShowKeys]   = useState({});
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [info, setInfo]           = useState("");
  const [hasPinSet]   = useState(() => !!localStorage.getItem(LOCAL_PIN_KEY));
  const [savedName]   = useState(() => { try { return JSON.parse(localStorage.getItem("bourse_session") || "{}").name || ""; } catch { return ""; } });

  const toggleShow = (k) => setShowKeys(s => ({ ...s, [k]: !s[k] }));

  // ── Sign In ──
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

  // ── Sign Up ──
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

  // ── Reset password ──
  const handleReset = async () => {
    if (!email.trim()) { setError("Entrez votre email."); return; }
    setLoading(true); setError("");
    const redirectTo = window.location.origin + window.location.pathname;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (err) setError(err.message);
    else setInfo("Email de réinitialisation envoyé.");
    setLoading(false);
  };

  // ── Continue locally (no account) ──
  const handleLocal = async () => {
    setError("");
    const storedHash = localStorage.getItem(LOCAL_PIN_KEY);
    const skipKeys = () => {
      try { const e = JSON.parse(localStorage.getItem("bourse_api_keys") || "{}"); return !!(e.anthropic || e.google); } catch { return false; }
    };

    if (storedHash) {
      // Utilisateur existant → PIN uniquement
      if (pin.length !== 4) { setError("Le code PIN doit faire exactement 4 chiffres."); return; }
      const h = await hashPin(pin);
      if (h !== storedHash) { setError("Code PIN incorrect."); return; }
      const name = savedName || "Utilisateur";
      localStorage.setItem("bourse_session", JSON.stringify({ name, since: Date.now() }));
      if (skipKeys()) { onSession(name); return; }
      setStep(2);
    } else {
      // Première connexion → PIN uniquement (4 chiffres)
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
    if (!window.confirm("⚠️ Réinitialiser efface TOUTES vos données (portefeuille, profil, historique). Continuer ?")) return;
    localStorage.clear();
    window.location.reload();
  };

  const handleFinish = () => {
    localStorage.setItem("bourse_api_keys", JSON.stringify(keys));
    const s = JSON.parse(localStorage.getItem("bourse_session") || "{}");
    onSession(s.name || displayName.trim() || "Utilisateur");
  };

  const authInp = (value, onChange, placeholder, type = "text") => (
    <input value={value} onChange={e => { onChange(e.target.value); setError(""); }}
      type={type} placeholder={placeholder} autoComplete="off" spellCheck="false"
      style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(193,232,255,0.22)", borderRadius: "12px", padding: "13px 16px", color: "#fff", fontSize: "14px", fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box", marginBottom: "12px" }}
      onFocus={e => e.target.style.borderColor = "rgba(193,232,255,0.6)"}
      onBlur={e => e.target.style.borderColor = "rgba(193,232,255,0.22)"} />
  );

  const pinInp = (value, onChange, label) => (
    <PinInput value={value} onChange={v => { onChange(v); setError(""); }} label={label} />
  );

  const apiInp = (field, placeholder, label) => (
    <div style={{ marginBottom: "14px" }}>
      <label style={{ display: "block", fontSize: "10px", fontWeight: "700", color: "#5483B3", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input type={showKeys[field] || field === "cx" ? "text" : "password"} placeholder={placeholder} value={keys[field]}
          onChange={e => setKeys(k => ({ ...k, [field]: e.target.value }))} autoComplete="off" spellCheck="false"
          style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(193,232,255,0.2)", borderRadius: "12px", padding: "12px 44px 12px 16px", color: "#fff", fontSize: "12px", fontFamily: "monospace", outline: "none", boxSizing: "border-box" }}
          onFocus={e => e.target.style.borderColor = "rgba(193,232,255,0.55)"}
          onBlur={e => e.target.style.borderColor = "rgba(193,232,255,0.2)"} />
        {field !== "cx" && <button onClick={() => toggleShow(field)} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(193,232,255,0.5)", fontSize: "14px" }}>{showKeys[field] ? "🙈" : "👁"}</button>}
      </div>
    </div>
  );

  const btnPrimary = { width: "100%", background: "linear-gradient(135deg, #052659, #5483B3)", border: "none", borderRadius: "14px", padding: "14px", color: "#fff", fontSize: "14px", fontWeight: "700", fontFamily: "Inter, sans-serif", cursor: "pointer", boxShadow: "0 4px 20px rgba(30,58,95,0.35)", marginTop: "8px", opacity: loading ? 0.7 : 1 };
  const btnGhost  = { background: "none", border: "none", color: "rgba(193,232,255,0.5)", fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer", padding: "8px", width: "100%" };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #010d1f 0%, #031840 45%, #0a2a5e 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "Inter, -apple-system, sans-serif" }}>
      {/* Orbes décoratifs */}
      <div style={{ position: "fixed", top: "-15%", right: "-5%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(84,131,179,0.18) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "-10%", left: "-8%", width: "420px", height: "420px", borderRadius: "50%", background: "radial-gradient(circle, rgba(30,58,95,0.4) 0%, transparent 65%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: "40%", left: "15%", width: "200px", height: "200px", borderRadius: "50%", background: "radial-gradient(circle, rgba(100,160,220,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: "400px", position: "relative" }}>
        {/* Logo + titre */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "72px", height: "72px", borderRadius: "22px", background: "linear-gradient(145deg, #0d2d5e, #1a4a8a)", marginBottom: "16px", boxShadow: "0 12px 40px rgba(5,38,89,0.7), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
            <AppLogo size={44} />
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#fff", letterSpacing: "-0.5px", lineHeight: 1.1 }}>Bourse Analyzer</div>
          <div style={{ fontSize: "13px", color: "rgba(193,232,255,0.5)", marginTop: "8px", fontWeight: "400" }}>Mon assistant bourse personnel</div>
        </div>

        {/* Card */}
        <div style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(24px)", border: "1px solid rgba(193,232,255,0.12)", borderRadius: "28px", padding: "36px 32px", boxShadow: "0 32px 80px rgba(1,13,31,0.7), inset 0 1px 0 rgba(255,255,255,0.06)" }}>

          {info && <div style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", fontSize: "12px", color: "#4ADE80" }}>✓ {info}</div>}
          {error && <div style={{ background: "rgba(252,165,165,0.1)", border: "1px solid rgba(252,165,165,0.3)", borderRadius: "10px", padding: "10px 14px", marginBottom: "14px", fontSize: "12px", color: "#FCA5A5" }}>⚠ {error}</div>}

          {/* ── STEP 2 : Clés API (commun à tous les modes) ── */}
          {step === 2 && (
            <>
              <div style={{ fontSize: "17px", fontWeight: "700", color: "#fff", marginBottom: "6px" }}>Clés API <span style={{ fontSize: "12px", fontWeight: "400", color: "rgba(193,232,255,0.5)" }}>— optionnelles</span></div>
              <div style={{ fontSize: "11px", color: "rgba(193,232,255,0.55)", marginBottom: "18px", lineHeight: "1.6", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(193,232,255,0.1)", borderRadius: "10px", padding: "10px 14px" }}>
                Stockées <strong style={{ color: "rgba(193,232,255,0.85)" }}>uniquement dans votre navigateur</strong>. Jamais envoyées à nos serveurs.
              </div>
              {!keys.anthropic.trim() && (
                <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)", borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", fontSize: "11px", color: "rgba(255,220,130,0.8)", lineHeight: "1.6" }}>
                  <strong style={{ color: "#FCD34D" }}>Sans clé Claude</strong> : portfolio + graphiques + DCA actifs. IA désactivée.
                </div>
              )}
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ fontSize: "10px", fontWeight: "700", color: "#5483B3", letterSpacing: "0.8px", textTransform: "uppercase" }}>Clé Claude (Anthropic)</label>
                  <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ fontSize: "10px", color: "#7DA0CA", textDecoration: "none", fontWeight: "600", background: "rgba(84,131,179,0.15)", padding: "2px 7px", borderRadius: "5px", border: "1px solid rgba(84,131,179,0.3)" }}>Obtenir →</a>
                </div>
                <div style={{ position: "relative" }}>
                  <input type={showKeys["anthropic"] ? "text" : "password"} placeholder="sk-ant-api03-…" value={keys.anthropic}
                    onChange={e => setKeys(k => ({ ...k, anthropic: e.target.value }))} autoComplete="off" spellCheck="false"
                    style={{ width: "100%", background: "rgba(255,255,255,0.08)", border: `1px solid ${keys.anthropic.trim() ? "rgba(74,222,128,0.35)" : "rgba(193,232,255,0.2)"}`, borderRadius: "12px", padding: "12px 44px 12px 16px", color: "#fff", fontSize: "12px", fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
                  <button onClick={() => toggleShow("anthropic")} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "rgba(193,232,255,0.5)", fontSize: "14px" }}>{showKeys["anthropic"] ? "🙈" : "👁"}</button>
                </div>
                {keys.anthropic.trim() && <div style={{ fontSize: "10px", color: "#4ADE80", marginTop: "4px" }}>✓ Toutes les fonctionnalités IA disponibles</div>}
              </div>
              {apiInp("google", "AIzaSy…", "Clé Google Search")}
              {apiInp("cx", "707b30d5e62e…", "Google CX (Search Engine ID)")}
              {apiInp("alphavantage", "AREI4UOU…", "Clé Alpha Vantage")}
              <button onClick={handleFinish} style={btnPrimary}>{keys.anthropic.trim() ? "Accéder à mon espace →" : "Continuer sans clé API →"}</button>
              <div style={{ textAlign: "center", marginTop: "10px", fontSize: "11px", color: "rgba(193,232,255,0.35)", lineHeight: "1.5" }}>Les clés API sont optionnelles. Vous pouvez les ajouter plus tard dans les Paramètres.</div>
            </>
          )}

          {/* ── SIGN IN ── */}
          {step === 1 && mode === "signin" && (
            <>
              {supabase ? (
                <>
                  <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "20px" }}>Connexion</div>
                  {authInp(email, setEmail, "Email", "email")}
                  {authInp(password, setPassword, "Mot de passe", "password")}
                  <button onClick={() => { setMode("reset"); setError(""); setInfo(""); }} style={{ ...btnGhost, textAlign: "right", marginBottom: "4px", fontSize: "11px", color: "rgba(193,232,255,0.4)" }}>Mot de passe oublié ?</button>
                  <button onClick={handleSignIn} disabled={loading} style={btnPrimary}>{loading ? <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:"8px" }}><ThinkingSpinner size={16} color="#fff" /> Connexion…</span> : "Se connecter →"}</button>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "14px 0" }}>
                    <div style={{ flex: 1, height: "1px", background: "rgba(193,232,255,0.1)" }} />
                    <span style={{ fontSize: "11px", color: "rgba(193,232,255,0.3)" }}>ou</span>
                    <div style={{ flex: 1, height: "1px", background: "rgba(193,232,255,0.1)" }} />
                  </div>
                  <button onClick={() => { setMode("signup"); setError(""); }} style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(193,232,255,0.2)", borderRadius: "14px", padding: "13px", color: "rgba(193,232,255,0.85)", fontSize: "13px", fontWeight: "600", fontFamily: "Inter,sans-serif", cursor: "pointer" }}>Créer un compte</button>
                  <button onClick={() => { setMode("local"); setError(""); }} style={btnGhost}>Continuer sans compte</button>
                </>
              ) : hasPinSet ? (
                <>
                  <div style={{ fontSize: "22px", fontWeight: "800", color: "#fff", marginBottom: "6px", letterSpacing: "-0.3px" }}>Bonjour 👋</div>
                  <div style={{ fontSize: "13px", color: "rgba(193,232,255,0.45)", marginBottom: "28px" }}>Entrez votre code PIN pour accéder à votre portefeuille</div>
                  {pinInp(pin, setPin, "Code PIN")}
                  <button onClick={handleLocal} style={{ ...btnPrimary, marginTop: "4px" }}>Accéder à mon portefeuille →</button>
                  <button onClick={() => {
                    if (!window.confirm("Réinitialiser le PIN uniquement ? Vos données de portefeuille seront conservées.")) return;
                    localStorage.removeItem(LOCAL_PIN_KEY);
                    localStorage.removeItem(LOCAL_NAME_KEY);
                    localStorage.removeItem("bourse_session");
                    window.location.reload();
                  }} style={{ ...btnGhost, fontSize: "11px", color: "rgba(255,180,100,0.5)", marginTop: "4px" }}>Mot de passe oublié ? Réinitialiser le PIN</button>
                  <button onClick={handleResetLocal} style={{ ...btnGhost, fontSize: "10px", color: "rgba(255,100,100,0.3)", marginTop: "2px" }}>Réinitialiser l'accès (efface tout)</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "22px", fontWeight: "800", color: "#fff", marginBottom: "6px", letterSpacing: "-0.3px" }}>Bienvenue 👋</div>
                  <div style={{ fontSize: "13px", color: "rgba(193,232,255,0.45)", marginBottom: "24px" }}>Choisissez un code PIN à 4 chiffres</div>
                  {pinInp(pin, setPin, "Code PIN")}
                  {pinInp(pinConfirm, setPinConfirm, "Confirmer le PIN")}
                  <button onClick={handleLocal} style={{ ...btnPrimary, marginTop: "4px" }}>Créer mon espace →</button>
                </>
              )}
            </>
          )}

          {/* ── SIGN UP ── */}
          {step === 1 && mode === "signup" && (
            <>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "20px" }}>Créer un compte</div>
              {authInp(displayName, setDisplay, "Prénom ou pseudo")}
              {authInp(email, setEmail, "Email", "email")}
              {authInp(password, setPassword, "Mot de passe (min. 6 car.)", "password")}
              <div style={{ fontSize: "11px", color: "rgba(193,232,255,0.45)", marginBottom: "12px", lineHeight: "1.6" }}>
                Votre portefeuille sera synchronisé entre tous vos appareils.
              </div>
              <button onClick={handleSignUp} disabled={loading} style={btnPrimary}>{loading ? <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:"8px" }}><ThinkingSpinner size={16} color="#fff" /> Création…</span> : "Créer mon compte →"}</button>
              <button onClick={() => { setMode("signin"); setError(""); }} style={btnGhost}>← Retour à la connexion</button>
            </>
          )}

          {/* ── RESET ── */}
          {step === 1 && mode === "reset" && (
            <>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "20px" }}>Réinitialiser</div>
              {authInp(email, setEmail, "Votre email", "email")}
              <button onClick={handleReset} disabled={loading} style={btnPrimary}>{loading ? <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", gap:"8px" }}><ThinkingSpinner size={16} color="#fff" /> Envoi…</span> : "Envoyer le lien →"}</button>
              <button onClick={() => { setMode("signin"); setError(""); setInfo(""); }} style={btnGhost}>← Retour</button>
            </>
          )}

          {/* ── LOCAL (sans compte, avec Supabase dispo) ── */}
          {step === 1 && mode === "local" && (
            <>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff", marginBottom: "8px" }}>Sans compte</div>
              <div style={{ fontSize: "12px", color: "rgba(193,232,255,0.55)", marginBottom: "16px", lineHeight: "1.6" }}>Les données restent sur cet appareil uniquement.</div>
              {hasPinSet ? (
                <>
                  {pinInp(pin, setPin, "Code PIN (4 chiffres)")}
                </>
              ) : (
                <>
                  {pinInp(pin, setPin, "Code PIN (4 chiffres)")}
                  {pinInp(pinConfirm, setPinConfirm, "Confirmer le PIN")}
                </>
              )}
              <button onClick={handleLocal} style={btnPrimary}>Continuer localement →</button>
              <button onClick={() => { setMode("signin"); setError(""); }} style={btnGhost}>← Connexion avec un compte</button>
            </>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: "18px", fontSize: "10px", color: "rgba(193,232,255,0.25)", lineHeight: "1.6" }}>
          {supabase ? "Compte Bourse Analyzer · Données chiffrées côté serveur" : "Mode local · Vos données restent sur votre appareil"}
        </div>
      </div>
    </div>
  );
}


export { PinInput };
export default AuthPage;
