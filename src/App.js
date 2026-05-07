import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import ReactDOM from "react-dom";
// pdfjs chargé en lazy (import dynamique) pour réduire le bundle initial
import { createClient } from "@supabase/supabase-js";
// workerSrc configuré dynamiquement lors du premier chargement PDF

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SB_URL  = process.env.REACT_APP_SUPABASE_URL  || "";
const SB_KEY  = process.env.REACT_APP_SUPABASE_ANON_KEY || "";
const supabase = SB_URL && SB_KEY ? createClient(SB_URL, SB_KEY) : null;

// Clés à synchroniser dans le cloud (hors clés API sensibles)
const SYNC_KEYS = [
  "bourse_portfolio", "bourse_profil", "bourse_dividendes_log",
  "bourse_pea_ouverture", "bourse_cto_ouverture", "bourse_account",
  "bourse_dark", "bourse_compact", "bourse_hidden", "bourse_avatar_emoji",
  "bourse_sidebar_collapsed", "bourse_active_tab",
  "bourse_avis_operes", "bourse_snapshots", "bourse_dividendes",
  "bourse_api_keys", "bourse_impot_sortie", "bourse_local_name",
];

// userId courant pour la sync (module-level mutable ref)
let _syncUserId = null;
const _syncQueue = {};

async function pushToCloud(userId, key, value) {
  if (!supabase || !userId) return;
  try {
    await supabase.from("user_data").upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
  } catch {}
}

function scheduleSync(key, value) {
  if (!_syncUserId || !SYNC_KEYS.includes(key)) return;
  clearTimeout(_syncQueue[key]);
  _syncQueue[key] = setTimeout(() => pushToCloud(_syncUserId, key, value), 1500);
}

async function pullFromCloud(userId) {
  if (!supabase || !userId) return;
  try {
    const { data } = await supabase
      .from("user_data").select("key, value").eq("user_id", userId);
    if (data) data.forEach(({ key, value }) => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    });
  } catch {}
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const load = (key, def) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } };
const save = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  scheduleSync(key, val);
};

// ─── Design tokens — Fintech Minimalist · Deep Navy ──────────────────────────
const C = {
  // Text
  ink:        "#111214",
  inkSoft:    "#1E2A38",
  inkMuted:   "#4A5568",
  inkSubtle:  "#8896A8",

  // Backgrounds
  snow:       "#FFFFFF",
  snowOff:    "#F8F9FA",
  snowDim:    "#EDF0F4",

  // Borders
  border:     "rgba(17,18,20,0.07)",

  // Gold
  gold:       "#E6B800",
  goldDark:   "#B8920A",
  goldLight:  "rgba(255,215,0,0.10)",

  // Primary
  navy:       "#111214",
  navyLight:  "rgba(17,18,20,0.05)",
  paleBlue:   "rgba(30,58,95,0.08)",
  navyPill:   "#1E3A5F",

  // Green
  green:      "#27AE60",
  greenLight: "rgba(39,174,96,0.08)",
  greenDark:  "#1E8449",

  // Red
  red:        "#E74C3C",
  redLight:   "rgba(231,76,60,0.08)",

  // Accent
  accent:     "#1E3A5F",

  // Card gradients
  cardGrad:      "linear-gradient(150deg, #FFFFFF 0%, #EEF4FF 100%)",
  cardGradGreen: "linear-gradient(150deg, #FFFFFF 0%, #EEFAF4 100%)",
  cardGradGold:  "linear-gradient(150deg, #FFFFFF 0%, #FFF8EC 100%)",
  cardGradRed:   "linear-gradient(150deg, #FFFFFF 0%, #FFF1EF 100%)",
  cardGradPurp:  "linear-gradient(150deg, #FFFFFF 0%, #F4EEFF 100%)",

  // ── Sidebar ──
  sb:           "#F8F9FA",
  sbBorder:     "rgba(17,18,20,0.07)",
  sbText:       "#8896A8",
  sbTextActive: "#111214",
  sbHover:      "rgba(30,58,95,0.06)",
  sbActive:     "rgba(30,58,95,0.09)",
  sbAccent:     "#1E3A5F",
};

const shadow = {
  card:  "0 4px 20px rgba(17,18,20,0.08), 0 1px 4px rgba(17,18,20,0.05)",
  float: "0 8px 36px rgba(17,18,20,0.11), 0 2px 8px rgba(17,18,20,0.06)",
  hover: "0 14px 44px rgba(30,58,95,0.22), 0 4px 14px rgba(17,18,20,0.08)",
  gold:  "0 4px 20px rgba(255,215,0,0.28)",
  pill:  "0 4px 16px rgba(30,58,95,0.38)",
};

// ─── Mobile context ───────────────────────────────────────────────────────────
const MobileCtx = createContext(false);
const TabletCtx  = createContext(false);
const useIsMobile = () => useContext(MobileCtx);
const useIsTablet = () => useContext(TabletCtx);
function MobileProvider({ children }) {
  const [mobile, setMobile]   = useState(() => window.innerWidth < 768);
  const [tablet, setTablet]   = useState(() => window.innerWidth >= 768 && window.innerWidth < 1200);
  useEffect(() => {
    const handler = () => {
      setMobile(window.innerWidth < 768);
      setTablet(window.innerWidth >= 768 && window.innerWidth < 1200);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return <MobileCtx.Provider value={mobile}><TabletCtx.Provider value={tablet}>{children}</TabletCtx.Provider></MobileCtx.Provider>;
}

// ─── Swipeable card (mobile delete gesture) ───────────────────────────────────
function SwipeableCard({ children, onSwipeLeft, disabled }) {
  const [dx, setDx]         = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX  = useRef(null);
  const startY  = useRef(null);
  const dirLock = useRef(null);
  const THRESHOLD = 80;

  const onTouchStart = e => {
    startX.current  = e.touches[0].clientX;
    startY.current  = e.touches[0].clientY;
    dirLock.current = null;
  };
  const onTouchMove = e => {
    if (startX.current === null) return;
    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;
    if (!dirLock.current) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
      dirLock.current = Math.abs(deltaX) > Math.abs(deltaY) ? "h" : "v";
    }
    if (dirLock.current === "v") return;
    e.preventDefault();
    setDragging(true);
    setDx(Math.max(-THRESHOLD * 1.5, Math.min(0, deltaX)));
  };
  const onTouchEnd = () => {
    if (dx < -THRESHOLD) { onSwipeLeft?.(); }
    setDx(0);
    setDragging(false);
    startX.current = null;
  };

  if (disabled) return children;
  const reveal = Math.min(1, Math.abs(dx) / THRESHOLD);
  return (
    <div style={{ position: "relative", marginBottom: "14px", borderRadius: "18px", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: `rgba(220,38,38,${0.04 + reveal * 0.14})`, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "22px", borderRadius: "18px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", opacity: reveal, transform: `scale(${0.7 + reveal * 0.3})`, transition: "transform 0.1s" }}>
          <div style={{ fontSize: "20px" }}>🗑</div>
          <div style={{ fontSize: "9px", fontWeight: "800", color: C.red, letterSpacing: "1px" }}>SUPPRIMER</div>
        </div>
      </div>
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)", position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Onboarding Guide ─────────────────────────────────────────────────────────
const ONBOARDING_KEY = "bourse_onboarding_v1";
const ONBOARDING_STEPS = [
  { icon: "📊", title: "Bienvenue dans Bourse Analyzer", body: "Votre compagnon d'investissement personnel. Suivez votre portefeuille, recevez des signaux IA et analysez vos performances." },
  { icon: "➕", title: "Ajoutez votre première position", body: "Cliquez sur « + Ajouter une position » dans l'onglet Portefeuille. Renseignez le nom, l'ISIN, le PRU et la quantité." },
  { icon: "🤖", title: "Signaux IA marché", body: "Cliquez sur « 🤖 Analyser toutes mes lignes » pour obtenir un avis IA sur chaque valeur : ACHAT, RENFORCER, PRUDENCE ou VENDRE." },
  { icon: "💬", title: "Votre assistant IA", body: "Posez vos questions dans l'onglet Assistant. Il vous explique les concepts financiers, analyse vos valeurs et répond 24h/24." },
  { icon: "⚙️", title: "Configurez votre profil", body: "Dans l'onglet Profil, renseignez votre horizon, tolérance au risque et les dates d'ouverture de vos comptes pour un calcul fiscal précis." },
];
function OnboardingGuide({ onDone }) {
  const [step, setStep] = useState(0);
  const s = ONBOARDING_STEPS[step];
  const isLast = step === ONBOARDING_STEPS.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,15,25,0.7)", backdropFilter: "blur(6px)", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "28px", padding: "36px 32px 28px", maxWidth: "400px", width: "100%", boxShadow: "0 32px 80px rgba(0,0,0,0.28)", textAlign: "center", animation: "fadeIn 0.3s ease" }}>
        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginBottom: "28px" }}>
          {ONBOARDING_STEPS.map((_, i) => (
            <div key={i} style={{ width: i === step ? "20px" : "6px", height: "6px", borderRadius: "3px", background: i === step ? C.navy : C.border, transition: "all 0.3s" }} />
          ))}
        </div>
        {/* Icon */}
        <div style={{ width: "72px", height: "72px", borderRadius: "22px", background: C.paleBlue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", margin: "0 auto 20px" }}>{s.icon}</div>
        {/* Title */}
        <div style={{ fontSize: "18px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", marginBottom: "12px", lineHeight: "1.3" }}>{s.title}</div>
        {/* Body */}
        <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.65", marginBottom: "28px" }}>{s.body}</div>
        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{ flex: 1, padding: "12px", borderRadius: "14px", border: `1px solid ${C.border}`, background: C.snowOff, color: C.inkMuted, fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
              ← Retour
            </button>
          )}
          <button onClick={() => { if (isLast) { try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {} onDone(); } else setStep(s => s + 1); }}
            style={{ flex: 2, padding: "12px", borderRadius: "14px", border: "none", background: `linear-gradient(135deg, ${C.navy} 0%, #2563EB 100%)`, color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif", boxShadow: shadow.pill }}>
            {isLast ? "Commencer →" : "Suivant →"}
          </button>
        </div>
        {/* Skip */}
        {!isLast && (
          <button onClick={() => { try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {} onDone(); }}
            style={{ marginTop: "14px", background: "none", border: "none", color: C.inkSubtle, fontSize: "11px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            Passer l'introduction
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Euronext MIC helper ──────────────────────────────────────────────────────
// Pour un PEA, les valeurs éligibles sont principalement sur Euronext Paris.
// Certaines sociétés de droit néerlandais (Technip Energies, Airbus, Stellantis…) sont
// cotées sur Euronext Paris malgré un ISIN NL → on les force en XPAR.
const NL_SUR_PARIS = new Set(["NL0014559478","NL00150001Q9","NL0000235190","NL0010273215","NL0011794037"]);
function getMIC(isin) {
  if (!isin) return "XPAR";
  if (NL_SUR_PARIS.has(isin)) return "XPAR";
  if (isin.startsWith("BE")) return "XBRU";
  if (isin.startsWith("NL")) return "XAMS";
  return "XPAR";
}
function getEuronextUrl(isin, nom) {
  if (!isin) return null;
  const mic  = getMIC(isin);
  const type = isETFName(nom) ? "etfs" : "equities";
  return `https://live.euronext.com/fr/product/${type}/${isin}-${mic}`;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TABS = { PORTFOLIO: "portfolio", MARCHE: "marche", PROJECTION: "projection", HISTORIQUE: "historique", DCA: "dca", OPERATIONS: "operations", CHAT: "chat", AUTOPILOT: "autopilot", PROFIL: "profil", SETTINGS: "settings" };
const UI   = { IDLE: "idle", LOADING: "loading", RESULT: "result", ERROR: "error" };
const RISQUE_PCT = { prudent: 0.05, equilibre: 0.10, dynamique: 0.15, "tres-dynamique": 0.20 };
const PROFIL_RANK = { prudent: 0, equilibre: 1, dynamique: 2, "tres-dynamique": 3 };
const SURV_SECS  = 30 * 60;

const SYSTEM_PROMPT = `Tu es un analyste financier expert. RÈGLE ABSOLUE : appelle en priorité web_search("[NOM] [ISIN] cours bourse site:msn.com") pour le cours temps réel. Si le cours est introuvable, appelle web_search("[NOM] [ISIN] cours site:zonebourse.com"). Pour les analyses et objectifs, appelle web_search("[NOM] [ISIN] analyse objectif site:zonebourse.com OR site:msn.com"). FORMAT PRIX : point décimal UNIQUEMENT (ex: "32.140", jamais "32,140" ni "32 140"). Si cours introuvable : "N/A". Réponds UNIQUEMENT en JSON valide sans markdown.
{"nom":"...","isin":"...","secteur":"...","eligible_pea":true,"vue_ensemble":"...","contexte_marche":"...","performance":{"cours_actuel":"32.140","evolution_1an":"+5.2%","plus_haut_52s":"45.200","plus_bas_52s":"28.100"},"fondamentaux":{"per":"...","dividende":"...","capitalisation":"...","dette_nette":"..."},"points_forts":[],"points_vigilance":[],"valorisation":{"objectif_moyen":"40.000","objectif_haut":"50.000","objectif_bas":"30.000","nb_analystes":"...","potentiel":"...","appreciation":"..."},"timing":{"point_entree":"30.000","catalyseurs":[],"recommandation_timing":"..."},"verdict":{"signal":"ACHAT/RENFORCER/ATTENDRE/PRUDENCE/VENDRE","cible_12m":"42.000","justification":"..."}}`;

const PORTFOLIO_PROMPT = `Analyste. JSON uniquement sans markdown.
{"resume":"...","performance_globale":"...","diversification":{"secteurs":[{"nom":"...","poids":"..."}],"geographie":"...","concentration":"..."},"forces":[],"faiblesses":[],"coherence_profil":"...","recommandations":[],"opportunites":[],"verdict_global":"..."}`;

const ETF_DCA_PROMPT = `Tu es un analyste financier expert en ETF et stratégie DCA. RÈGLES DE RECHERCHE PAR SOURCE :
1) web_search("[NOM ETF] [ISIN] cours performance site:msn.com") → cours temps réel + performances + actualités.
2) web_search("[NOM ETF] [ISIN] composition TER éligibilité PEA site:justetf.com") → données ETF : TER, composition géographique/sectorielle, dividende, éligibilité PEA.
3) web_search("[NOM ETF] [ISIN] analyse site:msn.com OR site:zonebourse.com") → analyses financières et recommandations.
4) web_search("[NOM ETF] [ISIN] analyse technique site:tradingview.com") → signaux techniques, tendance, supports. FORMAT PRIX : point décimal, jamais d'espace (ex: "5.360"). Réponds UNIQUEMENT en JSON valide sans markdown.
{"nom":"...","isin":"...","emetteur":"...","indice_suivi":"...","eligible_pea":true,"ter":"0.20%","type":"ETF Monde/Sectoriel/Obligataire","vue_ensemble":"...","contexte_marche":"...","performance":{"cours_actuel":"5.360","evolution_1an":"+X%","evolution_3ans":"+X%","plus_haut_52s":"...","plus_bas_52s":"..."},"fondamentaux":{"capitalisation":"...","nb_composants":"...","dividende":"Capitalisant/Distribuant","devise":"EUR"},"repartition_geo":[{"zone":"Amérique du Nord","poids":"65%"},{"zone":"Europe","poids":"20%"},{"zone":"Asie","poids":"15%"}],"repartition_sectorielle":[{"secteur":"Technologie","poids":"25%"},{"secteur":"Finance","poids":"15%"}],"analyse_technique":{"tendance":"Haussière/Neutre/Baissière","support":"...","resistance":"...","rsi":"...","macd":"...","ma50":"...","ma200":"...","signal_technique":"ACHAT/ATTENDRE/PRUDENCE","commentaire_technique":"..."},"macro":{"impact_taux":"...","impact_croissance_pib":"...","impact_inflation":"...","atouts_diversification":"..."},"points_forts":[],"points_vigilance":[],"dca_conseil":{"argumentaire_principal":"...","comparaison_alternatives":"...","frais_courtage_200eur":"1.99","nb_parts_200eur":"...","cout_total_200eur":"...","impact_frais_pct":"...","potentiel_croissance":"...","horizon_recommande":"...","risques":[],"contrainte_pea_200eur_ok":true},"valorisation":{"objectif_moyen":"...","objectif_haut":"...","objectif_bas":"...","nb_analystes":"...","potentiel":"...","appreciation":"..."},"timing":{"point_entree":"...","catalyseurs":[],"recommandation_timing":"..."},"verdict":{"signal":"ACHAT/RENFORCER/ATTENDRE/PRUDENCE/VENDRE","cible_12m":"...","justification":"..."}}`;

const MARKET_SCORING_PROMPT = `Tu es un analyste financier expert spécialisé PEA. Tu reçois des extraits Google (actualités + analyses) déjà collectés pour chaque valeur du portefeuille. Analyse ces données et évalue chaque ligne pour un investissement DCA ce mois, horizon 10 ans. Pour chaque valeur attribue :
- signal : ACHAT (fort potentiel, catalyseurs positifs), RENFORCER (tendance positive, bon point d'entrée), ATTENDRE (neutre, pas urgent), PRUDENCE (risques identifiés, éviter ce mois), VENDRE (fondamentaux détériorés, sortir de la position)
- score_marche : entre 0 et 20 (0=très négatif, 20=très positif)
- resume : 1-2 phrases concrètes avec les arguments clés
- catalyseur_cle : principal catalyseur ou risque identifié
Réponds UNIQUEMENT en JSON valide, sans markdown, sans texte autour :
{"classement":[{"isin":"...","nom":"...","signal":"ACHAT|RENFORCER|ATTENDRE|PRUDENCE|VENDRE","score_marche":17,"resume":"...","catalyseur_cle":"..."}]}`;

const SUGGESTIONS = ["LVMH", "Apple", "Nvidia", "CAC 40", "ETF World MSCI", "TotalEnergies", "Airbus", "BNP Paribas", "Technip Energies", "Amundi PEA Monde"];

const AVIS_PARSE_PROMPT = `Tu es un expert en analyse de documents financiers français (avis d'opérés, relevés PEA, avis d'exécution).
Extrais TOUTES les opérations présentes dans ce texte. Retourne UNIQUEMENT un JSON valide sans markdown.
Règles :
- date : format YYYY-MM-DD (convertis depuis JJ/MM/AAAA)
- heure : heure d'exécution format HH:MM ou HH:MM:SS si présente dans le document (ex: "14:32", "09:15:00"), "" si absente
- type : ACHAT | VENTE | DIVIDENDE | FRAIS | AUTRE
- titre : nom complet du titre (ex: "Technip Energies", "Amundi PEA Monde MSCI World")
- isin : code ISIN 12 caractères ou "" si absent
- quantite : nombre de titres en string (ex: "10", "10.5")
- prixUnitaire : prix par titre en euros, string avec point décimal (ex: "32.14")
- frais : commissions/droits en euros string (ex: "1.99"), "0" si non précisé
- sens : DEBIT (achat, frais) | CREDIT (vente, dividende)
- reference : numéro de référence unique de l'opération tel qu'il apparaît dans le document (ex: "REF-12345678", "ORD-20240315-001", numéro d'ordre, numéro d'exécution, identifiant transaction). Cherche les champs : "Référence", "N° d'ordre", "Référence de l'ordre", "Référence d'opération", "N° transaction", "Identifiant". Si absent, construis une référence synthétique : "date_isin_type" (ex: "2024-03-15_FR0014005I80_ACHAT").
Si le PDF contient plusieurs opérations, retourne-les toutes. Si aucune opération lisible, retourne {"operations":[]}.
{"operations":[{"date":"YYYY-MM-DD","heure":"HH:MM","type":"ACHAT","titre":"...","isin":"...","quantite":"0","prixUnitaire":"0.00","frais":"0.00","sens":"DEBIT","reference":"REF-XXXXX"}]}`;

// ─── Logo database ────────────────────────────────────────────────────────────
// Maps ISIN codes and company name keywords to Clearbit logo domains
const LOGO_DB = {
  // By ISIN (exact match — highest priority)
  isin: {
    // France CAC 40 + mid caps
    "FR0000131104": "bnpparibas.com",
    "FR0000120321": "lvmh.com",
    "FR0000120271": "totalenergies.com",
    "FR0000131228": "credit-agricole.com",
    "FR0000130809": "societegenerale.com",
    "FR0000120628": "axa.com",
    "FR0000073272": "hermes.com",
    "FR0000120737": "essilorluxottica.com",
    "FR0010285965": "vinci.com",
    "FR0000125338": "capgemini.com",
    "FR0000121014": "michelin.com",
    "FR0000120503": "loreal.com",
    "FR0000130395": "sanofi.com",
    "FR0000130650": "danone.com",
    "FR0000127771": "orange.com",
    "FR0000121972": "accor.com",
    "FR0000130578": "nexans.com",
    "FR0013280286": "worldline.com",
    "FR0004163111": "publicis.com",
    "FR0010307819": "safran.com",
    "FR0014000MR3": "engie.com",
    "FR0010220475": "technipenergies.com",
    "FR0010309096": "klepierre.com",
    // Technip Energies NL cotée Paris
    "NL0014559478": "technipenergies.com",
    // Airbus
    "NL0010273215": "airbus.com",
    // Stellantis
    "NL00150001Q9": "stellantis.com",
    // Small/mid caps fréquents PEA
    "FR0013505062": "smaio.com",
    "FR0011950732": "kalray.eu",
    "FR0013334298": "inventiva-pharma.com",
    "FR0014007ND6": "haffner-energy.com",
    "FR0004152700": "entech-se.com",
    // ETFs Amundi
    "FR0010655696": "amundi.com",
    "LU1681042864": "amundi.com",
    "LU1050469367": "amundi.com",
    "FR0013412285": "amundi.com",
    "LU2089238203": "amundi.com",
    // iShares
    "IE00B4L5Y983": "ishares.com",
    "IE00B3XXRP09": "ishares.com",
    // MSCI World ETFs
    "FR0011869353": "lyxor.com",
    "LU0392494562": "db-xtrackers.com",
    // USA Big Tech
    "US0231351067": "amazon.com",
    "US0378331005": "apple.com",
    "US5949181045": "microsoft.com",
    "US67066G1040": "nvidia.com",
    "US02079K3059": "abc.xyz",
    "US30303M1027": "meta.com",
    "US88160R1014": "tesla.com",
    "US4592001014": "ibm.com",
    "US17275R1023": "cisco.com",
    "US46625H1005": "jpmorganchase.com",
    "US7427181091": "paypal.com",
    "US46080Q1031": "intuitivesurgical.com",
    "US09075V1026": "biotech.com",
    "US0605051046": "bankofamerica.com",
  },
  // By name keyword (substring match, longest first)
  name: [
    ["technip",        "technipenergies.com"],
    ["totalenergies",  "totalenergies.com"],
    ["total energies", "totalenergies.com"],
    ["airbus",         "airbus.com"],
    ["lvmh",           "lvmh.com"],
    ["bnp paribas",    "bnpparibas.com"],
    ["bnp",            "bnpparibas.com"],
    ["credit agricole","credit-agricole.com"],
    ["crédit agricole","credit-agricole.com"],
    ["societe generale","societegenerale.com"],
    ["société générale","societegenerale.com"],
    ["l'oreal",        "loreal.com"],
    ["loreal",         "loreal.com"],
    ["l oreal",        "loreal.com"],
    ["sanofi",         "sanofi.com"],
    ["danone",         "danone.com"],
    ["orange",         "orange.com"],
    ["michelin",       "michelin.com"],
    ["hermès",         "hermes.com"],
    ["hermes",         "hermes.com"],
    ["axa",            "axa.com"],
    ["safran",         "safran.com"],
    ["capgemini",      "capgemini.com"],
    ["vinci",          "vinci.com"],
    ["stellantis",     "stellantis.com"],
    ["peugeot",        "stellantis.com"],
    ["renault",        "renault.com"],
    ["engie",          "engie.com"],
    ["saint-gobain",   "saint-gobain.com"],
    ["worldline",      "worldline.com"],
    ["amundi",         "amundi.com"],
    ["lyxor",          "lyxor.com"],
    ["ishares",        "ishares.com"],
    ["msci world",     "amundi.com"],
    ["pea monde",      "amundi.com"],
    ["dassault",       "dassault.com"],
    ["legrand",        "legrand.com"],
    ["veolia",         "veolia.com"],
    ["publicis",       "publicis.com"],
    ["accor",          "accor.com"],
    ["haffner",        "haffner-energy.com"],
    ["inventiva",      "inventiva-pharma.com"],
    ["kalray",         "kalray.eu"],
    ["smaio",          "smaio.com"],
    ["entech",         "entech-se.com"],
    ["nvidia",         "nvidia.com"],
    ["apple",          "apple.com"],
    ["microsoft",      "microsoft.com"],
    ["amazon",         "amazon.com"],
    ["alphabet",       "abc.xyz"],
    ["google",         "google.com"],
    ["meta",           "meta.com"],
    ["tesla",          "tesla.com"],
    ["ibm",            "ibm.com"],
    ["cisco",          "cisco.com"],
    ["paypal",         "paypal.com"],
    ["jpmorgan",       "jpmorganchase.com"],
    ["bank of america","bankofamerica.com"],
  ],
};

/** Retourne l'URL du logo Clearbit pour une position, ou null si inconnu. */
function resolveLogoUrl(nom, isin) {
  // 1. ISIN exact
  if (isin && LOGO_DB.isin[isin]) return `https://logo.clearbit.com/${LOGO_DB.isin[isin]}`;
  // 2. Name keyword (longest match first — array is already ordered)
  const lower = (nom || "").toLowerCase();
  for (const [kw, domain] of LOGO_DB.name) {
    if (lower.includes(kw)) return `https://logo.clearbit.com/${domain}`;
  }
  return null;
}

/** Couleur déterministe à partir du nom (pour l'avatar de repli). */
function avatarColor(str) {
  const PALETTE = ["#052659","#5483B3","#059669","#D97706","#7C3AED","#0891B2","#DC2626","#BE185D","#1D4ED8","#065F46"];
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/**
 * Derive a clean base-name from a company display name.
 * Used as fallback domain guess for unknown companies.
 */
function deriveBaseName(nom) {
  return (nom || "")
    .replace(/\s+(S\.?A\.?[SD]?\.?|N\.?V\.?|S\.?E\.?|Ltd\.?|PLC|Inc\.?|Corp\.?)$/gi, "")
    .replace(/\s+PEA\s+.*$/i, "")
    .replace(/\s+(ETF|UCITS|ACC|DIST|MSCI|World|Monde|Emergent|Emerging|ESG|Transition).*$/i, "")
    .trim()
    .split(/\s+/)[0]          // first meaningful word
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Build ordered list of image URLs to try for a company logo.
 * Tiers: Clearbit (DB) → Euronext CDN (ISIN) → Google favicon (DB domain) → Google favicon (name guess)
 */
function buildLogoSources(nom, isin) {
  const sources = [];
  // 1 — Clearbit from curated LOGO_DB
  const dbDomain = (() => {
    if (isin && LOGO_DB.isin[isin]) return LOGO_DB.isin[isin];
    const lower = (nom || "").toLowerCase();
    for (const [kw, d] of LOGO_DB.name) { if (lower.includes(kw)) return d; }
    return null;
  })();
  if (dbDomain) sources.push({ url: `https://logo.clearbit.com/${dbDomain}`, cover: "72%" });

  // 2 — Euronext CDN (two URL formats, covers FR/BE/NL/PT markets)
  if (isin) {
    sources.push({ url: `https://live.euronext.com/sites/default/files/thumbnails/image/${isin}.jpg`,       cover: "90%" });
    sources.push({ url: `https://live.euronext.com/sites/default/files/thumbnails/image/${isin}-XPAR.jpg`, cover: "90%" });
    sources.push({ url: `https://live.euronext.com/sites/default/files/thumbnails/image/${isin}-ALXP.jpg`, cover: "90%" });
  }

  // 3 — Google S2 favicon from DB domain (always available for any website)
  if (dbDomain) sources.push({ url: `https://www.google.com/s2/favicons?sz=128&domain=${dbDomain}`, cover: "58%" });

  // 4 — Google S2 favicon from name-derived domain (automatic for new companies)
  const guessBase = deriveBaseName(nom);
  if (guessBase && guessBase.length >= 3 && !dbDomain?.startsWith(guessBase)) {
    sources.push({ url: `https://www.google.com/s2/favicons?sz=128&domain=${guessBase}.com`, cover: "58%" });
    sources.push({ url: `https://www.google.com/s2/favicons?sz=128&domain=${guessBase}.fr`,  cover: "58%" });
  }

  return sources;
}

/** Avatar circulaire avec logo multi-source → initiale colorée en dernier repli. */
function CompanyAvatar({ nom, isin, size = 36 }) {
  const [tier, setTier] = useState(0);

  // Reset tier whenever the company changes
  const keyRef = useRef(`${nom}:${isin}`);
  const key = `${nom}:${isin}`;
  if (keyRef.current !== key) { keyRef.current = key; setTier(0); }

  const sources = buildLogoSources(nom, isin);
  const initial = (nom || "?").replace(/^(amundi|lyxor|ishares|etf)\s+/i, "").charAt(0).toUpperCase();
  const bg      = avatarColor(nom || isin || "");

  if (tier >= sources.length) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", background: bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#fff", fontWeight: "700", fontSize: Math.round(size * 0.42) + "px", lineHeight: 1, userSelect: "none" }}>{initial}</span>
      </div>
    );
  }

  const { url, cover } = sources[tier];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#FFFFFF", border: `1px solid rgba(15,23,42,0.08)`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <img src={url} alt="" style={{ width: cover, height: cover, objectFit: "contain" }} onError={() => setTier(t => t + 1)} />
    </div>
  );
}

const SIGNAL_CONFIG = {
  ACHAT:     { color: C.green,    bg: C.greenLight, border: "rgba(5,150,105,0.2)",   icon: "▲" },
  RENFORCER: { color: C.navy,     bg: C.navyLight,  border: "rgba(30,58,95,0.12)",    icon: "+" },
  ATTENDRE:  { color: C.goldDark, bg: C.goldLight,  border: "rgba(217,119,6,0.2)",   icon: "◆" },
  PRUDENCE:  { color: C.red,      bg: C.redLight,   border: "rgba(220,38,38,0.2)",   icon: "▼" },
  VENDRE:    { color: "#DC2626",  bg: "#FFF5F5",    border: "#DC2626",               icon: "🚨" },
};

const DEFAULT_PROFIL    = { capital: 0, horizon: "moyen", risque: "equilibre", capitalPEA: 0, capitalCTO: 0, especesPEA: 0, especesCTO: 0, dcaMensuel: 0, dcaDuree: 12, courtier: "boursobank" };
const STORAGE_VERSION = "v4";

const DEFAULT_POSITIONS = [];
const DEFAULT_SCREENING_STOCKS = [
  "Valneva", "Median Technologies", "Riber", "Guillemot", "Solutions 30",
  "Genomic Vision", "Obiz", "Osmoz Technologies", "NovaBay Pharmaceuticals",
  "Compagnie Lebon", "Hexaom", "Lectra", "Inventiva", "Ose Immunotherapeutics",
];
const SIGNAL_RISK = { ACHAT: 1.0, RENFORCER: 0.85, ATTENDRE: 0.55, PRUDENCE: 0.25, VENDRE: 0.0 };

// ─── Storage version migration ────────────────────────────────────────────────
(function migrateStorage() {
  const stored = localStorage.getItem("bourse_storage_version");
  if (stored !== STORAGE_VERSION) {
    localStorage.removeItem("bourse_portfolio");
    localStorage.removeItem("bourse_cours_cache");
    localStorage.removeItem("bourse_cours_cache_v2");
    localStorage.setItem("bourse_storage_version", STORAGE_VERSION);
  }
})();

// ─── CSV import ──────────────────────────────────────────────────────────────
function parseBoursobankCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const results = [];

  // Normalise une cellule : retire espaces insécables, guillemets, espaces
  const norm = s => (s || "").trim().replace(/[\u00A0\u202F]/g, "").replace(/^"|"$/g, "");
  const toFloat = s => parseFloat(norm(s).replace(",", ".").replace(/\s/g, "")) || 0;
  const toPct   = s => {
    const v = parseFloat(norm(s).replace(",", ".").replace(/\s/g, "").replace("%", ""));
    return isNaN(v) ? null : v;
  };

  // Détecter la ligne d'en-tête pour mapper les colonnes par nom
  let colMap = null;  // { nom, isin, qty, pru, cours, variation }
  let dataStart = 0;

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const cols = lines[i].split(/\t|;/).map(norm);
    const lower = cols.map(c => c.toLowerCase());
    if (lower.some(c => c.includes("isin"))) {
      colMap = {
        nom:       lower.findIndex(c => c.includes("valeur") || c.includes("libell") || c.includes("nom")),
        isin:      lower.findIndex(c => c.includes("isin")),
        qty:       lower.findIndex(c => c.includes("qté") || c.includes("quant") || c === "qté"),
        pru:       lower.findIndex(c => c.includes("revient") || c.includes("pru") || c.includes("achat")),
        cours:     lower.findIndex(c => c.includes("cours") || c.includes("dernier")),
        variation: lower.findIndex(c => c.includes("variation") || c.includes("var.")),
      };
      dataStart = i + 1;
      break;
    }
  }

  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(/\t|;/).map(norm);
    if (cols.length < 4) continue;

    let name, isin, qtyRaw, pruRaw, lastRaw, varRaw;
    if (colMap && colMap.isin >= 0) {
      name   = colMap.nom       >= 0 ? cols[colMap.nom]       : cols[0];
      isin   = colMap.isin      >= 0 ? cols[colMap.isin]      : cols[1];
      qtyRaw = colMap.qty       >= 0 ? cols[colMap.qty]       : cols[2];
      pruRaw = colMap.pru       >= 0 ? cols[colMap.pru]       : cols[3];
      lastRaw = colMap.cours    >= 0 ? cols[colMap.cours]     : cols[4];
      varRaw  = colMap.variation >= 0 ? cols[colMap.variation] : cols[5];
    } else {
      // Fallback positionnel : Nom;ISIN;Qté;PRU;Cours;Variation;...
      [name, isin, qtyRaw, pruRaw, lastRaw, varRaw] = cols;
    }

    const pru         = toFloat(pruRaw);
    const quantite    = Math.round(toFloat(qtyRaw));
    const dernierCours = lastRaw ? (toFloat(lastRaw) || null) : null;
    const intradayVariation = varRaw ? toPct(varRaw) : null;

    if (!name || pru <= 0 || quantite <= 0) continue;
    results.push({
      id: Date.now() + i,
      nom: name.trim(),
      isin: isin?.trim().toUpperCase() || null,
      pru,
      quantite,
      alerteHaute: null,
      alerteBasse: null,
      dernierCours: (dernierCours && dernierCours < pru * 50) ? dernierCours : null,
      intradayVariation,
      lastFetch: dernierCours ? Date.now() : null,
    });
  }
  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parsePrice(str) {
  if (!str) return null;
  // Normalise: strip currency symbols and trailing whitespace
  const s = String(str).replace(/[€$£%\u00A0\u202F]/g, " ").trim();
  // Priority 1 — dot decimal: "32.140" or "1 234.56" or "32.14"
  const dotM = s.match(/(\d[\d ]*\.\d+)/);
  if (dotM) {
    const v = parseFloat(dotM[1].replace(/ /g, ""));
    if (v > 0 && v < 100000) return Math.round(v * 1000) / 1000;
  }
  // Priority 2 — comma decimal: "32,140" or "1 234,56"
  const commaM = s.match(/^([\d ]+),([\d]{1,4})$/);
  if (commaM) {
    const v = parseFloat(commaM[1].replace(/ /g, "") + "." + commaM[2]);
    if (v > 0 && v < 100000) return Math.round(v * 1000) / 1000;
  }
  // Priority 3 — plain integer or spaced thousands: "3240" or "3 240"
  const plain = s.replace(/ /g, "").replace(",", ".");
  const plainM = plain.match(/^[\d.]+/);
  if (plainM) {
    const v = parseFloat(plainM[0]);
    if (v > 0 && v < 100000) return Math.round(v * 1000) / 1000;
  }
  return null;
}
// Format a monetary amount with 2 decimals (totals, investments)
function fmtEur(n) {
  if (n == null || isNaN(n)) return "—";
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  const iF = i.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
  return (n < 0 ? "−" : "") + iF + "," + d + " €";
}
// Format a stock price with 3 decimals (cours, PRU, objectifs)
function fmtCours(n) {
  if (n == null || isNaN(n)) return "—";
  const num = typeof n === "number" ? n : parseFloat(n);
  if (isNaN(num)) return "—";
  const [i, d] = Math.abs(num).toFixed(3).split(".");
  const iF = i.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
  return (num < 0 ? "−" : "") + iF + "," + d + " €";
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + " %";
}
function fmtPV(eur, pct) {
  if (eur == null) return "—";
  const sign = eur >= 0 ? "+" : "";
  return `${sign}${fmtEur(eur).replace(" €", "")} € (${fmtPct(pct)})`;
}
const COURTIERS = {
  boursobank:    { nom: "Boursobank",     minOrdre: 200,  frais: m => m <= 0 ? 0 : m <= 500 ? 1.99 : Math.max(m * 0.006, 1.99) },
  fortuneo:      { nom: "Fortuneo",       minOrdre: 0,    frais: m => m <= 0 ? 0 : m <= 500 ? 1.99 : Math.max(m * 0.005, 3.99) },
  bourse_direct: { nom: "Bourse Direct",  minOrdre: 0,    frais: m => m <= 0 ? 0 : m <= 300 ? 0.99 : m <= 2000 ? 1.90 : Math.max(m * 0.00095, 3.00) },
  trade_rep:     { nom: "Trade Republic", minOrdre: 1,    frais: m => m <= 0 ? 0 : 1.00 },
  degiro:        { nom: "DEGIRO",         minOrdre: 0,    frais: m => m <= 0 ? 0 : Math.max(0.50 + m * 0.00004, 0.50) },
  saxo:          { nom: "Saxo Banque",    minOrdre: 0,    frais: m => m <= 0 ? 0 : Math.max(m * 0.0008, 4.00) },
  autre:         { nom: "Autre",          minOrdre: 0,    frais: m => m <= 0 ? 0 : m <= 500 ? 1.99 : Math.max(m * 0.005, 3.99) },
};
const COURTIERS_DETAIL = {
  boursobank:    "Boursobank (profil Découverte) — RÈGLES IMPÉRATIVES : (1) MONTANT MINIMUM PAR ORDRE = 200€ obligatoire depuis avril 2026 sur PEA et CTO — tout ordre inférieur à 200€ est IMPOSSIBLE, ne jamais suggérer un montant < 200€. (2) Pas d'achat fractionné : titres entiers uniquement, calculer le nombre entier de titres achetables avec 200€ minimum. (3) Frais : 1,99€ fixe pour ordres ≤500€ ; 0,60% au-delà. (4) Boursomarkets : 0% de frais si ordre ≥200€ sur titres éligibles. (5) TTF : +0,4% sur achats d'actions françaises dont capitalisation > 1 milliard€. (6) Settlement T+2. (7) 0€ de frais de garde. (8) PEA plafond 150 000€. (9) Horaires : 9h-17h30, horaires étendus 17h35-22h00. (10) Types d'ordres : marché, limité, stop, stop limité.",
  fortuneo:      "Fortuneo — PEA/CTO : 1,99€ fixe ≤500€ ; 0,50% (min 3,99€) au-delà. Pas de minimum d'ordre. Pas de frais de garde. Settlement T+2. Pas d'achat fractionné.",
  bourse_direct: "Bourse Direct — PEA/CTO : 0,99€ fixe ≤300€ ; 1,90€ ≤2000€ ; 0,095% (min 3€) au-delà. Pas de minimum d'ordre. Settlement T+2. Pas d'achat fractionné.",
  trade_rep:     "Trade Republic — CTO uniquement (pas de PEA) : 1€ fixe par ordre. Achat fractionné disponible. Settlement T+2. Pas de frais de change sur €.",
  degiro:        "DEGIRO — CTO uniquement (pas de PEA) : 0,50€ + 0,004% par ordre. ETF gratuits selon liste. Settlement T+2. Frais de change 0,25%. Pas d'achat fractionné.",
  saxo:          "Saxo Banque — PEA/CTO : 0,08% par ordre (min 4€). Settlement T+2. Pas d'achat fractionné.",
  autre:         "Courtier non précisé — frais estimés : 1,99€ fixe ≤500€ ; 0,50% (min 3,99€) au-delà. Pas d'achat fractionné.",
};
function calcFraisCourtage(montant, courtierKey) {
  const c = COURTIERS[courtierKey] || COURTIERS.boursobank;
  return c.frais(montant);
}
function tauxFraisCourtage(montant) {
  const frais = calcFraisCourtage(montant);
  return montant > 0 ? (frais / montant * 100).toFixed(2) : "0";
}
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Price cache (TTL = 15 min) ───────────────────────────────────────────────
const PRICE_TTL = 15 * 60 * 1000;
function getCachedCours(key) {
  const cache = load("bourse_cours_cache_v2", {});
  const entry = cache[key];
  if (!entry || Date.now() - entry.ts > PRICE_TTL) return null;
  return entry.cours;
}
function setCachedCours(key, cours) {
  const cache = load("bourse_cours_cache_v2", {});
  cache[key] = { cours, ts: Date.now() };
  // Limit cache size to 50 entries
  const keys = Object.keys(cache);
  if (keys.length > 50) delete cache[keys[0]];
  save("bourse_cours_cache_v2", cache);
}
// Sanitize stored positions: remove impossibly large cours values (parse artefacts)
function sanitizePositions(positions) {
  if (!Array.isArray(positions)) return [];
  return positions.map(p => {
    if (!p || typeof p !== "object") return null;
    const pru      = Number(p.pru)      || 0;
    const quantite = Number(p.quantite) || 0;
    let dernierCours = Number(p.dernierCours) || 0;
    // Filtre valeur aberrante (cours > 20× PRU et > 1000€)
    if (dernierCours && pru && dernierCours > pru * 20 && dernierCours > 1000) dernierCours = 0;
    return {
      nom: p.nom || "Inconnu",
      isin: p.isin || "",
      ticker: p.ticker || "",
      secteur: p.secteur || "Autre",
      compte: p.compte || "PEA",
      pru,
      quantite,
      dernierCours: dernierCours || null,
      alerteHaute: Number(p.alerteHaute) || null,
      alerteBasse: Number(p.alerteBasse) || null,
      ...p,
      pru, quantite, dernierCours: dernierCours || null,
    };
  }).filter(Boolean);
}

// Modèles Claude — changer ici pour mettre à jour toute l'app
const CLAUDE_MODELS = {
  fast:     "claude-haiku-4-5-20251001",
  standard: "claude-sonnet-4-6",
};

// Helper corsproxy avec proxy de secours
const PROXIES = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];
async function fetchWithProxy(url, opts = {}) {
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(10000), ...opts });
      if (res.ok || res.status < 500) return res;
    } catch {}
  }
  throw new Error("Données de marché indisponibles (proxies CORS inaccessibles)");
}

// Clés API : localStorage d'abord (par utilisateur), fallback sur .env
const _ENV = {
  anthropic:    process.env.REACT_APP_ANTHROPIC_API_KEY    || "",
  google:       process.env.REACT_APP_GOOGLE_API_KEY       || "",
  cx:           process.env.REACT_APP_GOOGLE_CX            || "",
  alphavantage: process.env.REACT_APP_ALPHAVANTAGE_KEY     || "",
};
const getKey = (name) => {
  try { const k = JSON.parse(localStorage.getItem("bourse_api_keys") || "{}"); return k[name] || _ENV[name] || ""; }
  catch { return _ENV[name] || ""; }
};
// Compatibilité avec le reste du code (lecture fraîche à chaque appel via getter)
const ANTHROPIC_API_KEY    = { toString() { return getKey("anthropic"); } };
const GOOGLE_API_KEY       = { toString() { return getKey("google"); } };
const GOOGLE_CX            = { toString() { return getKey("cx"); } };
const ALPHAVANTAGE_KEY     = { toString() { return getKey("alphavantage"); } };
const hasClaudeKey = () => !!getKey("anthropic");

// En production (Vercel), les appels Anthropic passent par /api/claude (clé côté serveur).
// En dev, on appelle directement l'API (setupProxy gère le CORS).
const CLAUDE_ENDPOINT = process.env.NODE_ENV === "production"
  ? "/api/claude"
  : "https://api.anthropic.com/v1/messages";

// Cache des symboles Alpha Vantage (ISIN → symbol) pour éviter les appels répétés
const _avSymbolCache = {};

// ─── Alpha Vantage — cours temps réel (gratuit, 25 req/jour) ─────────────────
async function fetchCoursAlphaVantage(nom, isin) {
  // 1. Trouver le symbole Alpha Vantage via SYMBOL_SEARCH (par ISIN ou nom)
  const cacheKey = isin || nom;
  let symbol = _avSymbolCache[cacheKey];

  if (!symbol) {
    const keyword = isin || nom;
    const searchUrl = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(keyword)}&apikey=${ALPHAVANTAGE_KEY}`;
    const searchRes  = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const matches    = searchData.bestMatches || [];
    // Préférer la région Paris/EUR, sinon prendre le premier résultat
    const best = matches.find(m => m["4. region"] === "Paris" || m["8. currency"] === "EUR") || matches[0];
    if (!best) throw new Error(`Symbole introuvable pour ${nom}`);
    symbol = best["1. symbol"];
    _avSymbolCache[cacheKey] = symbol;
  }

  // 2. Récupérer le cours avec GLOBAL_QUOTE
  const quoteUrl  = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHAVANTAGE_KEY}`;
  const quoteRes  = await fetch(quoteUrl);
  const quoteData = await quoteRes.json();
  const price     = parseFloat(quoteData["Global Quote"]?.["05. price"]);
  if (!price || isNaN(price)) throw new Error(`Cours introuvable pour ${symbol}`);
  return price;
}

// ─── Alpha Vantage — données fondamentales + consensus analystes ─────────────
async function fetchFondamentauxAlphaVantage(nom, isin) {
  const cacheKey = isin || nom;
  let symbol = _avSymbolCache[cacheKey];

  if (!symbol) {
    const searchUrl = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(isin || nom)}&apikey=${ALPHAVANTAGE_KEY}`;
    const searchData = await (await fetch(searchUrl)).json();
    const matches = searchData.bestMatches || [];
    const best = matches.find(m => m["4. region"] === "Paris" || m["8. currency"] === "EUR") || matches[0];
    if (!best) throw new Error(`Symbole introuvable pour ${nom}`);
    symbol = best["1. symbol"];
    _avSymbolCache[cacheKey] = symbol;
  }

  const url  = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHAVANTAGE_KEY}`;
  const data = await (await fetch(url)).json();
  if (!data?.Symbol) throw new Error("Données indisponibles (hors couverture Alpha Vantage)");

  const n = (v) => v && v !== "None" && v !== "-" ? v : null;
  const consensus = {
    strongBuy:   parseInt(data.AnalystRatingStrongBuy)  || 0,
    buy:         parseInt(data.AnalystRatingBuy)         || 0,
    hold:        parseInt(data.AnalystRatingHold)        || 0,
    sell:        parseInt(data.AnalystRatingSell)        || 0,
    strongSell:  parseInt(data.AnalystRatingStrongSell)  || 0,
  };
  return {
    symbol,
    per:             n(data.PERatio),
    eps:             n(data.EPS),
    dividende:       data.DividendYield && data.DividendYield !== "None" ? (parseFloat(data.DividendYield) * 100).toFixed(2) + "%" : null,
    objectif:        data.AnalystTargetPrice && data.AnalystTargetPrice !== "None" ? parseFloat(data.AnalystTargetPrice) : null,
    haut52s:         data["52WeekHigh"]  && data["52WeekHigh"]  !== "None" ? parseFloat(data["52WeekHigh"])  : null,
    bas52s:          data["52WeekLow"]   && data["52WeekLow"]   !== "None" ? parseFloat(data["52WeekLow"])   : null,
    capitalisation:  n(data.MarketCapitalization),
    secteur:         n(data.Sector),
    consensus,
    nbAnalystes:     consensus.strongBuy + consensus.buy + consensus.hold + consensus.sell + consensus.strongSell,
  };
}

// ─── Google News — actualités récentes sans Claude ───────────────────────────
async function fetchActualites(nom, isin) {
  const q = `${nom}${isin ? " " + isin : ""} actualités bourse`;
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(q)}&num=5&dateRestrict=m3`;
  const data = await (await fetch(url)).json();
  return (data.items || []).map(it => ({ titre: it.title, lien: it.link, extrait: it.snippet || "" }));
}

// ─── Yahoo Finance — actualités RSS avec liens ────────────────────────────────
async function fetchYahooFinanceRSS(ticker) {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=FR&lang=fr-FR&siteid=yahoofr`;
  const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");
  return [...xml.getElementsByTagName("item")].slice(0, 6).map(item => {
    // <link> en RSS XML est un nœud texte frère, pas un enfant direct — on le lit via nextSibling
    const linkEl = item.getElementsByTagName("link")[0];
    const link = (linkEl?.textContent || linkEl?.nextSibling?.textContent || "").trim();
    const guid  = item.getElementsByTagName("guid")[0]?.textContent?.trim() || "";
    const rawLink = link || (guid.startsWith("http") ? guid : "");
    const frLink  = rawLink.replace("https://finance.yahoo.com", "https://fr.finance.yahoo.com")
                           .replace("https://www.yahoo.com/finance", "https://fr.finance.yahoo.com");
    return {
      title:   item.getElementsByTagName("title")[0]?.textContent?.replace(/ - [^-]+$/, "").trim() || "",
      link:    frLink,
      pubDate: item.getElementsByTagName("pubDate")[0]?.textContent || "",
    };
  });
}

function openLink(url) {
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function yahooFinanceUrl(pos) {
  const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
  const t = pos.ticker || (pos.isin && tickerCache[pos.isin]) || null;
  if (t) return `https://fr.finance.yahoo.com/quote/${encodeURIComponent(t)}/actualites/`;
  // Fallback : Yahoo accepte aussi les ISIN comme identifiant de cotation
  if (pos.isin) return `https://fr.finance.yahoo.com/quote/${encodeURIComponent(pos.isin)}/actualites/`;
  return `https://fr.finance.yahoo.com/recherche?p=${encodeURIComponent(pos.nom)}`;
}

// File d'attente globale — un seul appel API à la fois
let _apiQueue = Promise.resolve();
function enqueueApi(fn) {
  _apiQueue = _apiQueue.then(fn, fn);
  return _apiQueue;
}

// ─── Google Custom Search — recherche web gratuite (100/jour) ────────────────
async function callGoogleSearch(query, nbResults = 5) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}&num=${nbResults}&lr=lang_fr`;
  let res, data;
  try {
    res  = await fetch(url);
    data = await res.json();
  } catch (netErr) {
    throw new Error(`Réseau Google Search : ${netErr.message}`);
  }
  if (data.error) throw new Error(data.error.message || "Erreur Google Search");
  const items = data.items || [];
  if (!items.length) return `Aucun résultat Google pour : ${query}`;
  return items.map((it, i) =>
    `[${i + 1}] ${it.title}\n${it.link}\n${it.snippet || ""}`
  ).join("\n\n");
}

// ─── Yahoo Finance — données analystes (consensus, objectif de cours) ────────
async function fetchYahooAnalysts(ticker) {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=financialData,recommendationTrend`;
  const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.quoteSummary?.result?.[0];
  if (!result) throw new Error("no data");
  return result;
}

// ─── Google News RSS — actualités sans clé API ────────────────────────────────
async function fetchGoogleNewsRSS(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`;
  const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const xml = new DOMParser().parseFromString(text, "text/xml");
  return [...xml.querySelectorAll("item")].slice(0, 5).map(item => ({
    title: item.querySelector("title")?.textContent?.replace(/ - [^-]+$/, "").trim() || "",
    pubDate: item.querySelector("pubDate")?.textContent || "",
  }));
}

// ─── Formate données externes en texte pour prompt Claude ────────────────────
function formatExternalContext(nom, analysts, news) {
  const lines = [`=== ${nom} ===`];
  if (analysts) {
    const fd = analysts.financialData;
    if (fd?.recommendationKey) {
      const keyMap = { "strong_buy": "ACHAT FORT", "buy": "ACHAT", "hold": "CONSERVER", "sell": "VENTE", "underperform": "SOUS-PERFORMER", "strong_sell": "VENTE FORTE" };
      const recLabel = keyMap[fd.recommendationKey] || fd.recommendationKey.toUpperCase();
      lines.push(`Consensus analystes : ${recLabel} (${fd.recommendationMean?.raw?.toFixed(1) || "?"}/5)`);
    }
    if (fd?.targetMeanPrice?.raw) lines.push(`Objectif cours moyen : ${fd.targetMeanPrice.raw}€`);
    if (fd?.numberOfAnalystOpinions?.raw) lines.push(`Nombre d'analystes : ${fd.numberOfAnalystOpinions.raw}`);
    const rt = analysts.recommendationTrend?.trend?.[0];
    if (rt) {
      const buy = (rt.strongBuy || 0) + (rt.buy || 0);
      const hold = rt.hold || 0;
      const sell = (rt.sell || 0) + (rt.strongSell || 0);
      if (buy + hold + sell > 0) lines.push(`Répartition : ${buy} Achat · ${hold} Conserver · ${sell} Vente`);
    }
  }
  if (news && news.length > 0) {
    lines.push("Actualités récentes :");
    news.forEach(n => lines.push(`  • ${n.title}`));
  }
  return lines.join("\n");
}

// ─── Claude — analyse + structuration JSON ───────────────────────────────────
// skipChaining=true → Claude direct avec web_search (pour les prix live)
// skipChaining=false (défaut) → Google+Claude chaining si clés dispo (analyse)
async function callClaude(system, userMessage, useSearch = false, _retries = 4, skipChaining = false, maxTokens = null, model = null) {
  if (useSearch && getKey("google") && getKey("cx") && !skipChaining) {
    return callClaudeChained(system, userMessage);
  }
  const bodyObj = { model: model || CLAUDE_MODELS.standard, max_tokens: maxTokens || (useSearch ? 4000 : 1500), system, messages: [{ role: "user", content: userMessage }] };
  if (useSearch) bodyObj.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const headers = { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
  if (useSearch) headers["anthropic-beta"] = "web-search-2025-03-05";
  for (let attempt = 0; attempt < _retries; attempt++) {
    let res, data;
    try {
      res  = await fetch(CLAUDE_ENDPOINT, { method: "POST", headers, body: JSON.stringify(bodyObj) });
      data = await res.json();
    } catch (networkErr) {
      if (attempt < _retries - 1) { await delay(2000 * (attempt + 1)); continue; }
      throw new Error(`Erreur réseau : ${networkErr.message}`);
    }
    if (res.status === 429 || data?.error?.type === "rate_limit_error") {
      if (attempt < _retries - 1) { await delay(8000 * (attempt + 1)); continue; }
      throw new Error(`Limite de taux (429). Réessayez dans 1 minute.`);
    }
    if (res.status === 500 || res.status === 529) {
      if (attempt < _retries - 1) { await delay(5000 * (attempt + 1)); continue; }
      const err = new Error("Service temporairement indisponible — Réessayez dans quelques instants.");
      err.retryable = true; throw err;
    }
    if (res.status === 402) throw new Error(`Crédit insuffisant (402). Vérifiez console.anthropic.com → Billing.`);
    if (res.status === 401) throw new Error(`Clé API invalide (401). Vérifiez REACT_APP_ANTHROPIC_API_KEY dans .env`);
    if (data.error) throw new Error(`[${res.status}] ${data.error.message}`);
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    if (!text) throw new Error("Réponse vide.");
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
    if (s === -1 || e === -1) throw new Error("JSON introuvable dans la réponse.");
    const jsonStr = clean.substring(s, e + 1);
    try {
      return JSON.parse(jsonStr);
    } catch {
      // Tentative de réparation : supprimer trailing comma, fermer les tableaux/objets tronqués
      let repaired = jsonStr
        .replace(/,\s*([\]}])/g, "$1")   // trailing commas
        .replace(/[\x00-\x1F\x7F]/g, " "); // control characters
      // Si JSON tronqué (dernière opération incomplète), tenter de fermer proprement
      try { return JSON.parse(repaired); } catch {
        // Couper avant la dernière virgule dans "operations":[...] et refermer
        const lastComma = repaired.lastIndexOf(",");
        if (lastComma > 0) {
          const truncated = repaired.substring(0, lastComma) + "]}";
          try { return JSON.parse(truncated); } catch { /* ignore */ }
        }
        throw new Error(`JSON Parse error: ${text.slice(0, 200)}`);
      }
    }
  }
  throw new Error("Nombre de tentatives maximum atteint.");
}

// ─── Haiku : modèle léger pour signaux marché (10x moins cher que Sonnet) ─────
async function callClaudeHaiku(system, userMessage) {
  const bodyObj = {
    model: CLAUDE_MODELS.fast,
    max_tokens: 2000,
    system,
    messages: [{ role: "user", content: userMessage }],
  };
  const headers = { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
  for (let attempt = 0; attempt < 3; attempt++) {
    let res, data;
    try {
      res  = await fetch(CLAUDE_ENDPOINT, { method: "POST", headers, body: JSON.stringify(bodyObj) });
      data = await res.json();
    } catch (networkErr) {
      if (attempt < 2) { await delay(3000); continue; }
      throw new Error(`Erreur réseau : ${networkErr.message}`);
    }
    if (res.status === 429 || data?.error?.type === "rate_limit_error") {
      if (attempt < 2) { await delay(10000 * (attempt + 1)); continue; }
      throw new Error(`Limite de taux (429). Réessayez dans 1 minute.`);
    }
    if (res.status === 500 || res.status === 529) {
      if (attempt < 2) { await delay(5000 * (attempt + 1)); continue; }
      const err = new Error("Service temporairement indisponible — Réessayez dans quelques instants.");
      err.retryable = true; throw err;
    }
    if (res.status === 402) throw new Error(`Crédit insuffisant (402). Vérifiez console.anthropic.com → Billing.`);
    if (res.status === 401) throw new Error(`Clé API invalide (401). Vérifiez REACT_APP_ANTHROPIC_API_KEY dans .env`);
    if (data.error) throw new Error(`[${res.status}] ${data.error.message}`);
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    if (!text) throw new Error("Réponse vide.");
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
    if (s === -1 || e === -1) throw new Error("JSON introuvable dans la réponse.");
    return JSON.parse(clean.substring(s, e + 1));
  }
  throw new Error("Nombre de tentatives maximum atteint.");
}

// ─── Chat conversationnel multi-tour (retourne du texte brut, pas JSON) ──────
async function callClaudeConversation(system, messages, _retries = 3) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  const bodyObj = { model: CLAUDE_MODELS.fast, max_tokens: 1500, system, messages };
  for (let attempt = 0; attempt < _retries; attempt++) {
    let res, data;
    try {
      res  = await fetch(CLAUDE_ENDPOINT, { method: "POST", headers, body: JSON.stringify(bodyObj) });
      data = await res.json();
    } catch (networkErr) {
      if (attempt < _retries - 1) { await delay(2000 * (attempt + 1)); continue; }
      throw new Error(`Erreur réseau : ${networkErr.message}`);
    }
    if (res.status === 429 || data?.error?.type === "rate_limit_error") {
      if (attempt < _retries - 1) { await delay(8000 * (attempt + 1)); continue; }
      throw new Error(`Limite de taux (429). Réessayez dans 1 minute.`);
    }
    if (res.status === 500 || res.status === 529) {
      if (attempt < _retries - 1) { await delay(5000 * (attempt + 1)); continue; }
      throw new Error("Service temporairement indisponible — Réessayez dans quelques instants.");
    }
    if (res.status === 402) throw new Error(`Crédit insuffisant (402). Vérifiez console.anthropic.com → Billing.`);
    if (res.status === 401) throw new Error(`Clé API invalide (401). Vérifiez REACT_APP_ANTHROPIC_API_KEY dans .env`);
    if (data.error) throw new Error(`[${res.status}] ${data.error.message}`);
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    if (!text) throw new Error("Réponse vide.");
    return text.trim();
  }
  throw new Error("Nombre de tentatives maximum atteint.");
}

// ─── Chaining : Google Search → Claude structure le JSON ─────────────────────
async function callClaudeChained(system, userMessage) {
  const [coursData, analyseData] = await Promise.all([
    callGoogleSearch(`${userMessage} cours bourse`, 5).catch(() => ""),
    callGoogleSearch(`${userMessage} analyse recommandation`, 5).catch(() => ""),
  ]);
  const rawData = [
    coursData   && `=== COURS & ACTUALITÉS ===\n${coursData}`,
    analyseData && `=== ANALYSES & RECOMMANDATIONS ===\n${analyseData}`,
  ].filter(Boolean).join("\n\n") || "Aucune donnée collectée.";

  // Étape 2 — Claude structure en JSON sans faire de recherche web (moins cher)
  const structuredMsg = `Voici les résultats de recherche collectés via Google :

${rawData}

En te basant sur ces données, génère le JSON demandé. FORMAT PRIX : point décimal (ex: "32.140"). JSON valide sans markdown.`;
  const bodyObj = {
    model: CLAUDE_MODELS.standard,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: structuredMsg }]
  };
  const res  = await fetch(CLAUDE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify(bodyObj) });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("JSON introuvable.");
  return JSON.parse(clean.substring(s, e + 1));
}

// ─── App Logo SVG ─────────────────────────────────────────────────────────────
function AppLogo({ size = 28 }) {
  const id = `lg${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0C1829"/>
          <stop offset="100%" stopColor="#1A3558"/>
        </linearGradient>
        <linearGradient id={`${id}line`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4A9EDB"/>
          <stop offset="100%" stopColor="#90D4F5"/>
        </linearGradient>
        <linearGradient id={`${id}area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5BB8F5" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#5BB8F5" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* Fond arrondi dégradé */}
      <rect width="32" height="32" rx="9" fill={`url(#${id}bg)`}/>
      {/* Zone sous la courbe */}
      <path d="M5 22 L10 17 L14 19.5 L20 11 L27 8.5 L27 25 L5 25 Z" fill={`url(#${id}area)`}/>
      {/* Courbe de tendance */}
      <polyline points="5,22 10,17 14,19.5 20,11 27,8.5"
        stroke={`url(#${id}line)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Point haut lumineux */}
      <circle cx="27" cy="8.5" r="2.2" fill="#90D4F5"/>
      <circle cx="27" cy="8.5" r="1" fill="white"/>
      {/* Ligne de base */}
      <line x1="5" y1="25" x2="27" y2="25" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8"/>
    </svg>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function StatBox({ label, value, color, sensitive }) {
  const hidden  = sensitive && load("bourse_hidden", false);
  const mobile  = window.innerWidth < 768;
  const blurStyle = hidden ? { filter: "blur(7px)", userSelect: "none", pointerEvents: "none" } : {};
  return (
    <div style={{ background: C.cardGrad, border: `1px solid ${C.border}`, borderRadius: "20px", padding: mobile ? "22px 14px" : "20px 16px", textAlign: "center", boxShadow: shadow.card }}>
      <div style={{ fontSize: mobile ? "10px" : "9px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "6px", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: mobile ? "16px" : "13px", fontWeight: "700", color: color || C.ink, wordBreak: "break-word", lineHeight: "1.3", ...blurStyle }}>{value || "—"}</div>
    </div>
  );
}

function Card({ title, icon, accentColor, children }) {
  const mobile = window.innerWidth < 768;
  return (
    <div style={{ background: C.cardGrad, borderRadius: "22px", overflow: "hidden", marginBottom: "20px", boxShadow: shadow.card }}>
      <div style={{ padding: mobile ? "18px 22px 12px" : "22px 28px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
        {icon && <span style={{ fontSize: "14px", opacity: 0.6 }}>{icon}</span>}
        <span style={{ fontSize: "11px", fontWeight: "600", color: C.inkSubtle, letterSpacing: "0.06em", textTransform: "uppercase" }}>{title}</span>
      </div>
      <div className="ba-card-body" style={{ padding: mobile ? "0 22px 20px" : "0 28px 26px" }}>{children}</div>
    </div>
  );
}

function ThinkingSpinner({ size = 22, color = "#1A3A5C" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}>
      {/* Pale haut — opacité max */}
      <path d="M12 1.5C10.8 1.5 9.75 2.1 9.75 3.75C9.75 5.1 10.5 6.3 12 6.75C13.5 6.3 14.25 5.1 14.25 3.75C14.25 2.1 13.2 1.5 12 1.5Z" fill={color} opacity="1"/>
      {/* Pale droite — opacité 0.75 */}
      <path d="M22.5 12C22.5 10.8 21.9 9.75 20.25 9.75C18.9 9.75 17.7 10.5 17.25 12C17.7 13.5 18.9 14.25 20.25 14.25C21.9 14.25 22.5 13.2 22.5 12Z" fill={color} opacity="0.75"/>
      {/* Pale bas — opacité 0.5 */}
      <path d="M12 22.5C13.2 22.5 14.25 21.9 14.25 20.25C14.25 18.9 13.5 17.7 12 17.25C10.5 17.7 9.75 18.9 9.75 20.25C9.75 21.9 10.8 22.5 12 22.5Z" fill={color} opacity="0.5"/>
      {/* Pale gauche — opacité 0.25 */}
      <path d="M1.5 12C1.5 13.2 2.1 14.25 3.75 14.25C5.1 14.25 6.3 13.5 6.75 12C6.3 10.5 5.1 9.75 3.75 9.75C2.1 9.75 1.5 10.8 1.5 12Z" fill={color} opacity="0.25"/>
    </svg>
  );
}

function LoadingPanel({ label = "Analyse en cours" }) {
  return (
    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "48px", textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
        <ThinkingSpinner size={24} color={C.navy} />
        <span style={{ fontSize: "13px", color: C.inkMuted, fontWeight: "600", fontFamily: "Inter,sans-serif" }}>{label}</span>
      </div>
    </div>
  );
}

function ErrorPanel({ message, onRetry, retryLabel = "Réessayer" }) {
  const [countdown, setCountdown] = useState(null);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) { setCountdown(null); onRetry?.(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, onRetry]);

  const isRetryable = message?.includes("temporairement");
  return (
    <div style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "16px", padding: "18px 20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
      <span style={{ color: C.red, fontSize: "13px", fontWeight: "500", flex: 1 }}>✕ {message}</span>
      {onRetry && (
        <button onClick={() => { if (countdown === null) { setCountdown(isRetryable ? 5 : 0); } }}
          style={{ background: C.red, border: "none", borderRadius: "8px", padding: "8px 16px", color: "#fff", fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}>
          {countdown !== null ? `${retryLabel} (${countdown}s)` : retryLabel}
        </button>
      )}
    </div>
  );
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────
function TabNav({ active, onChange, portfolioVersion }) {
  // Compte les alertes actives pour le badge sur l'onglet Portefeuille
  const alertCount = useMemo(() => {
    const pos = load("bourse_portfolio", []);
    return pos.filter(p =>
      (p.alerteHaute  && p.dernierCours && p.dernierCours >= p.alerteHaute) ||
      (p.alerteBasse  && p.dernierCours && p.dernierCours <= p.alerteBasse)
    ).length;
  }, [portfolioVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = [
    { key: TABS.PORTFOLIO,  label: "Positions" },
    { key: TABS.MARCHE,     label: "Signaux IA" },
    { key: TABS.DCA,        label: "Plan DCA" },
    { key: TABS.PROJECTION, label: "Projection" },
    { key: TABS.HISTORIQUE, label: "Répartition" },
    { key: TABS.OPERATIONS, label: "Transactions" },
    { key: TABS.PROFIL,     label: "Profil" },
    { key: TABS.SETTINGS,   label: "Paramètres" },
  ];

  return (
    <div className="ba-tabnav" style={{ display: "flex", gap: "4px", marginBottom: "32px", background: "rgba(248,249,250,0.78)", borderRadius: "22px", padding: "6px", border: `1px solid rgba(255,255,255,0.6)`, position: "sticky", top: "0", zIndex: 50, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", boxShadow: "0 2px 12px rgba(17,18,20,0.06)" }}>
      {tabs.map(({ key, label }, idx) => {
        const isActive = active === key;
        const badge = key === TABS.PORTFOLIO && alertCount > 0 ? alertCount : 0;
        return (
          <button key={key} onClick={() => onChange(key)}
            title={`Raccourci : ${idx + 1}`}
            style={{ flex: 1, padding: "11px 10px", background: isActive ? C.snow : "transparent", border: isActive ? `1px solid ${C.border}` : "1px solid transparent", borderRadius: "16px", color: isActive ? C.navy : C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer", fontWeight: isActive ? "700" : "400", boxShadow: isActive ? shadow.card : "none", transition: "all 0.2s ease", position: "relative", whiteSpace: "nowrap" }}>
            {label}
            {badge > 0 && (
              <span style={{ position: "absolute", top: "4px", right: "4px", background: C.red, color: "#fff", borderRadius: "50%", minWidth: "15px", height: "15px", fontSize: "8px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Signal Badge ─────────────────────────────────────────────────────────────
function SignalBadge({ signal }) {
  const cfg = SIGNAL_CONFIG[signal] || SIGNAL_CONFIG.ATTENDRE;
  if (signal === "VENDRE") {
    return (
      <div style={{ background: "#FFF5F5", border: "2px solid #DC2626", borderRadius: "16px", padding: "14px 20px", textAlign: "center", animation: "vendreAlarm 0.8s ease-in-out infinite", boxShadow: "0 4px 24px rgba(220,38,38,0.3)" }}>
        <div style={{ fontSize: "22px", fontWeight: "900", color: "#DC2626", letterSpacing: "2px", textTransform: "uppercase" }}>🚨 ÉJECTEZ-VOUS 🚨</div>
        <div style={{ fontSize: "11px", color: "#DC2626", opacity: 0.75, fontWeight: "800", letterSpacing: "3px", marginTop: "4px" }}>⚠ VENDRE MAINTENANT ⚠</div>
      </div>
    );
  }
  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "16px", padding: "12px 20px", textAlign: "center" }}>
      <div style={{ fontSize: "18px", fontWeight: "800", color: cfg.color, letterSpacing: "1px" }}>{cfg.icon} {signal}</div>
      <div style={{ fontSize: "9px", color: cfg.color, opacity: 0.7, letterSpacing: "2px", marginTop: "2px", textTransform: "uppercase" }}>Signal</div>
    </div>
  );
}

// ─── Conseil personnalisé ─────────────────────────────────────────────────────
function PersonalAdvice({ data, profil }) {
  if (!profil || !profil.capital || Number(profil.capital) <= 0) return null;
  const cours = parsePrice(data.performance?.cours_actuel);
  if (!cours || cours <= 0) return null;
  const capital   = Number(profil.capital);
  const maxPct    = RISQUE_PCT[profil.risque] || 0.10;
  const maxInvest = capital * maxPct;
  const nbActions = Math.floor(maxInvest / cours);
  const montant   = nbActions * cours;
  const frais     = calcFraisCourtage(montant);
  const partCapital = ((montant / capital) * 100).toFixed(1);
  const entree    = parsePrice(data.timing?.point_entree);
  const nbEntree  = entree && entree > 0 ? Math.floor(maxInvest / entree) : null;
  const fraisEntree = nbEntree ? calcFraisCourtage(nbEntree * entree) : 0;
  const risqueLabel = { prudent: "Prudent · 5% max", equilibre: "Équilibré · 10% max", dynamique: "Dynamique · 15% max", "tres-dynamique": "Très dynamique · 20% max" }[profil.risque] || "";
  return (
    <Card title="Conseil personnalisé — Gestion Libre" icon="💼" accentColor={C.goldDark}>
      <div style={{ fontSize: "11px", color: C.inkMuted, marginBottom: "14px", fontWeight: "500" }}>Profil {risqueLabel} · Capital {fmtEur(capital)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
        <StatBox label="Max / ligne" value={fmtEur(maxInvest)} color={C.goldDark} sensitive />
        <StatBox label="Titres possibles" value={nbActions > 0 ? `${nbActions} titres` : "Insuffisant"} color={C.green} />
        <StatBox label="Montant net" value={fmtEur(montant)} sensitive />
        <StatBox label="% Capital" value={`${partCapital} %`} />
      </div>
      {nbActions > 0 && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 16px", marginBottom: "12px" }}>
          <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>🏦 Frais de courtage (Gestion Libre)</div>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <div><span style={{ fontSize: "11px", color: C.inkSubtle }}>Montant ordre : </span><strong style={{ color: C.ink }}>{fmtEur(montant)}</strong></div>
            <div><span style={{ fontSize: "11px", color: C.inkSubtle }}>Frais : </span><strong style={{ color: C.goldDark }}>{fmtEur(frais)}</strong> <span style={{ fontSize: "10px", color: C.inkSubtle }}>({montant <= 500 ? "fixe ≤500€" : "0,5% min 3,99€"})</span></div>
            <div><span style={{ fontSize: "11px", color: C.inkSubtle }}>Coût total : </span><strong style={{ color: C.navy }}>{fmtEur(montant + frais)}</strong></div>
            <div><span style={{ fontSize: "11px", color: C.inkSubtle }}>Impact : </span><strong style={{ color: frais / montant < 0.01 ? C.green : C.goldDark }}>{tauxFraisCourtage(montant)}%</strong></div>
          </div>
        </div>
      )}
      {nbEntree != null && nbEntree > 0 && entree && (
        <div style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "8px", padding: "10px 14px", marginBottom: "12px", fontSize: "13px", color: C.green }}>
          Au point d'entrée conseillé ({data.timing?.point_entree}) : <strong>{nbEntree} titres = {fmtEur(nbEntree * entree)}</strong>
          {fraisEntree > 0 && <span style={{ fontSize: "11px", color: C.inkMuted }}> + {fmtEur(fraisEntree)} frais = {fmtEur(nbEntree * entree + fraisEntree)} total</span>}
        </div>
      )}
      <p style={{ fontSize: "13px", color: C.inkMuted, margin: 0, lineHeight: "1.7" }}>
        Avec <strong style={{ color: C.ink }}>{fmtEur(capital)}</strong> disponibles, une position de <strong style={{ color: C.ink }}>{nbActions} titres à {fmtCours(cours)}</strong> représente {partCapital}% de votre capital — conforme au profil {profil.risque}.
      </p>
    </Card>
  );
}

// ─── ETF DCA Result Panel ─────────────────────────────────────────────────────
function ETFResultPanel({ data, query, timestamp, profil, onRefresh }) {
  const rawSignal = (data.verdict?.signal || "ATTENDRE").toUpperCase();
  const signal    = Object.keys(SIGNAL_CONFIG).find(k => rawSignal.includes(k)) || "ATTENDRE";
  const cfg       = SIGNAL_CONFIG[signal];
  const time      = timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dcaMensuel = Number(profil?.dcaMensuel) || 200;
  const cours      = parsePrice(data.performance?.cours_actuel);
  const frais200   = parsePrice(data.dca_conseil?.frais_courtage_200eur) || 1.99;
  const nbParts200 = cours ? Math.floor(200 / cours) : 0;
  const montant200 = nbParts200 * (cours || 0);
  const fraisReal  = calcFraisCourtage(montant200);
  const dcaNbParts = cours ? Math.floor(dcaMensuel / cours) : 0;
  const dcaMontant = dcaNbParts * (cours || 0);
  const dcaFrais   = calcFraisCourtage(dcaMontant);

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      {/* Header */}
      <div style={{ background: C.cardGrad, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "22px 26px", marginBottom: "16px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "6px", display: "flex", alignItems: "center", gap: "12px" }}>
          <span>Analyse ETF · DCA · {time}</span>
          <span style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "5px", padding: "2px 8px", color: C.navy, fontWeight: "700" }}>ETF</span>
          {data.eligible_pea && <span style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "5px", padding: "2px 8px", color: C.green, fontWeight: "700" }}>🇫🇷 PEA</span>}
          <button onClick={onRefresh} style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 10px", color: C.inkMuted, fontSize: "10px", fontFamily: "Inter, sans-serif", cursor: "pointer", fontWeight: "500" }}>↻ Actualiser</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "24px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>{data.nom || query.toUpperCase()}</div>
            <div style={{ fontSize: "12px", color: C.inkMuted, marginTop: "4px" }}>
              {data.isin && <span style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "2px 8px", fontSize: "10px", fontWeight: "600", marginRight: "8px" }}>{data.isin}</span>}
              {data.emetteur && <span>{data.emetteur} · </span>}
              {data.indice_suivi && <span style={{ fontWeight: "600" }}>{data.indice_suivi}</span>}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
              {data.ter && <span style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "6px", padding: "3px 10px", fontSize: "11px", color: C.goldDark, fontWeight: "700" }}>TER {data.ter}</span>}
              {data.type && <span style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 10px", fontSize: "11px", color: C.inkMuted, fontWeight: "500" }}>{data.type}</span>}
              {data.fondamentaux?.dividende && <span style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 10px", fontSize: "11px", color: C.inkMuted, fontWeight: "500" }}>{data.fondamentaux.dividende}</span>}
            </div>
          </div>
          <SignalBadge signal={signal} />
        </div>
      </div>

      {/* Vue ensemble */}
      {data.vue_ensemble && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px 20px", marginBottom: "16px", fontSize: "14px", color: C.inkMuted, lineHeight: "1.75" }}>
          {data.vue_ensemble}
        </div>
      )}

      {/* Performance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <Card title="Performance" icon="📈" accentColor={C.green}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <StatBox label="Cours actuel" value={data.performance?.cours_actuel} color={C.navy} />
            <StatBox label="Évol. 1 an"   value={data.performance?.evolution_1an}  color={data.performance?.evolution_1an?.startsWith("+") ? C.green : C.red} />
            <StatBox label="Évol. 3 ans"  value={data.performance?.evolution_3ans} color={data.performance?.evolution_3ans?.startsWith("+") ? C.green : C.red} />
            <StatBox label="+ Haut 52s"   value={data.performance?.plus_haut_52s} />
          </div>
        </Card>
        <Card title="Caractéristiques" icon="📊" accentColor={C.navy}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <StatBox label="Capitalisation"    value={data.fondamentaux?.capitalisation} />
            <StatBox label="Nb composants"     value={data.fondamentaux?.nb_composants} />
            <StatBox label="TER"               value={data.ter} color={C.goldDark} />
            <StatBox label="Devise"            value={data.fondamentaux?.devise || "EUR"} />
          </div>
        </Card>
      </div>

      {/* Répartition géographique + sectorielle */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        {(data.repartition_geo || []).length > 0 && (
          <Card title="Répartition géographique" icon="🌍" accentColor={C.navy}>
            {data.repartition_geo.map((g, i) => (
              <div key={i} style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "3px" }}>
                  <span>{g.zone}</span><span style={{ fontWeight: "700", color: C.navy }}>{g.poids}</span>
                </div>
                <div style={{ height: "4px", background: C.snowDim, borderRadius: "2px" }}>
                  <div style={{ height: "100%", background: C.navy, borderRadius: "2px", width: g.poids, maxWidth: "100%" }} />
                </div>
              </div>
            ))}
          </Card>
        )}
        {(data.repartition_sectorielle || []).length > 0 && (
          <Card title="Répartition sectorielle" icon="🏭" accentColor={C.goldDark}>
            {data.repartition_sectorielle.map((s, i) => (
              <div key={i} style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "3px" }}>
                  <span>{s.secteur}</span><span style={{ fontWeight: "700", color: C.goldDark }}>{s.poids}</span>
                </div>
                <div style={{ height: "4px", background: C.snowDim, borderRadius: "2px" }}>
                  <div style={{ height: "100%", background: C.gold, borderRadius: "2px", width: s.poids, maxWidth: "100%" }} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Analyse technique */}
      {data.analyse_technique && (
        <Card title="Analyse technique" icon="📉" accentColor={C.navy}>
          <div className="ba-g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "14px" }}>
            <StatBox label="Tendance"    value={data.analyse_technique.tendance}   color={data.analyse_technique.tendance === "Haussière" ? C.green : data.analyse_technique.tendance === "Baissière" ? C.red : C.goldDark} />
            <StatBox label="Support"     value={data.analyse_technique.support} />
            <StatBox label="Résistance"  value={data.analyse_technique.resistance} />
            <StatBox label="RSI"         value={data.analyse_technique.rsi} color={
              parseFloat(data.analyse_technique.rsi) > 70 ? C.red :
              parseFloat(data.analyse_technique.rsi) < 30 ? C.green : C.goldDark
            } />
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            {data.analyse_technique.ma50  && <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.inkMuted }}><strong style={{ color: C.ink }}>MA50</strong> {data.analyse_technique.ma50}</div>}
            {data.analyse_technique.ma200 && <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.inkMuted }}><strong style={{ color: C.ink }}>MA200</strong> {data.analyse_technique.ma200}</div>}
            {data.analyse_technique.macd  && <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.inkMuted }}><strong style={{ color: C.ink }}>MACD</strong> {data.analyse_technique.macd}</div>}
          </div>
          {data.analyse_technique.commentaire_technique && (
            <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.7", margin: 0 }}>{data.analyse_technique.commentaire_technique}</p>
          )}
        </Card>
      )}

      {/* Macro */}
      {data.macro && (
        <Card title="Contexte macro-économique" icon="🌐" accentColor={C.goldDark}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { label: "Impact taux d'intérêt",   val: data.macro.impact_taux },
              { label: "Impact croissance PIB",    val: data.macro.impact_croissance_pib },
              { label: "Impact inflation",         val: data.macro.impact_inflation },
              { label: "Atouts diversification",   val: data.macro.atouts_diversification },
            ].filter(r => r.val).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: "10px" }}>
                <span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", flexShrink: 0, paddingTop: "2px", minWidth: "130px" }}>{r.label}</span>
                <span style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>{r.val}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Points forts / vigilance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <Card title="Points forts" icon="✅" accentColor={C.green}>
          {(data.points_forts || []).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "7px 0", borderBottom: i < data.points_forts.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.green, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>{p}</span>
            </div>
          ))}
        </Card>
        <Card title="Points de vigilance" icon="⚠️" accentColor={C.red}>
          {(data.points_vigilance || []).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "7px 0", borderBottom: i < data.points_vigilance.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.red, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>{p}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* DCA Conseil — section centrale */}
      {data.dca_conseil && (
        <Card title="Argumentaire DCA — Gestion Libre" icon="📅" accentColor={C.navy}>
          {data.dca_conseil.argumentaire_principal && (
            <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.75", marginBottom: "16px" }}>{data.dca_conseil.argumentaire_principal}</p>
          )}
          {data.dca_conseil.comparaison_alternatives && (
            <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
              <div style={{ fontSize: "10px", color: C.navy, fontWeight: "700", marginBottom: "6px" }}>POURQUOI CET ETF PLUTÔT QU'UN AUTRE</div>
              <p style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.6", margin: 0 }}>{data.dca_conseil.comparaison_alternatives}</p>
            </div>
          )}
          {/* Calcul frais de courtage */}
          <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px", marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>🏦 Coûts de transaction</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {/* Seuil minimal 200€ PEA */}
              <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px" }}>
                <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", marginBottom: "8px" }}>ORDRE 200 € (SEUIL PEA)</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                  <span>Parts achetables</span><strong style={{ color: C.ink }}>{nbParts200} parts</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                  <span>Montant net</span><strong style={{ color: C.ink }}>{fmtEur(montant200)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                  <span>Frais de courtage</span><strong style={{ color: C.goldDark }}>{fmtEur(fraisReal)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, borderTop: `1px solid ${C.border}`, paddingTop: "6px", marginTop: "4px" }}>
                  <span>Coût total</span><strong style={{ color: C.navy }}>{fmtEur(montant200 + fraisReal)}</strong>
                </div>
                <div style={{ marginTop: "6px", fontSize: "10px", color: fraisReal / montant200 < 0.01 ? C.green : C.goldDark, fontWeight: "600" }}>
                  Impact frais : {tauxFraisCourtage(montant200)}% {fraisReal / montant200 < 0.01 ? "✓ Optimal" : "⚠ Élevé"}
                </div>
              </div>
              {/* DCA mensuel réel */}
              {dcaMensuel > 0 && (
                <div style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "8px", padding: "12px" }}>
                  <div style={{ fontSize: "10px", color: C.green, fontWeight: "700", marginBottom: "8px" }}>VOTRE DCA {fmtEur(dcaMensuel)}/MOIS</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                    <span>Parts achetables</span><strong style={{ color: C.ink }}>{dcaNbParts} parts</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                    <span>Montant net</span><strong style={{ color: C.ink }}>{fmtEur(dcaMontant)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, marginBottom: "4px" }}>
                    <span>Frais de courtage</span><strong style={{ color: C.goldDark }}>{fmtEur(dcaFrais)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: C.inkMuted, borderTop: `1px solid rgba(5,150,105,0.2)`, paddingTop: "6px", marginTop: "4px" }}>
                    <span>Coût total</span><strong style={{ color: C.green }}>{fmtEur(dcaMontant + dcaFrais)}</strong>
                  </div>
                  <div style={{ marginTop: "6px", fontSize: "10px", color: C.green, fontWeight: "600" }}>
                    Impact frais : {tauxFraisCourtage(dcaMontant)}%
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Risques */}
          {(data.dca_conseil.risques || []).length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "10px", color: C.red, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>Risques principaux</div>
              {data.dca_conseil.risques.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "5px" }}>
                  <span style={{ color: C.red, fontWeight: "700", flexShrink: 0 }}>▸</span>
                  <span style={{ fontSize: "12px", color: C.inkMuted }}>{r}</span>
                </div>
              ))}
            </div>
          )}
          {data.dca_conseil.potentiel_croissance && (
            <div style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "8px", padding: "12px 16px" }}>
              <div style={{ fontSize: "10px", color: C.goldDark, fontWeight: "700", marginBottom: "6px" }}>POTENTIEL DE CROISSANCE</div>
              <p style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.6", margin: 0 }}>{data.dca_conseil.potentiel_croissance}</p>
            </div>
          )}
        </Card>
      )}

      {/* Timing */}
      <Card title="Timing & Point d'entrée" icon="⏱" accentColor={C.navy}>
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1.5px", fontWeight: "600", textTransform: "uppercase", marginBottom: "6px" }}>Zone d'entrée conseillée</div>
          <div style={{ fontSize: "24px", fontWeight: "800", color: C.navy }}>{data.timing?.point_entree}</div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {(data.timing?.catalyseurs || []).map((c, i) => (
            <div key={i} style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.navy, fontWeight: "500" }}>📅 {c}</div>
          ))}
        </div>
        {data.timing?.recommandation_timing && (
          <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.7", margin: 0 }}>{data.timing.recommandation_timing}</p>
        )}
      </Card>

      {/* Verdict */}
      <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "12px", padding: "24px 28px", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: cfg.color, fontWeight: "700", textTransform: "uppercase" }}>Verdict pour votre DCA</div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "2px" }}>Cible 12 mois</div>
            <div style={{ fontSize: "26px", fontWeight: "800", color: cfg.color }}>{data.verdict?.cible_12m}</div>
          </div>
        </div>
        <div style={{ fontSize: "22px", fontWeight: "800", color: cfg.color, marginBottom: "12px" }}>{cfg.icon} {signal}</div>
        <p style={{ fontSize: "14px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>{data.verdict?.justification}</p>
      </div>

      <div style={{ fontSize: "11px", color: C.inkSubtle, textAlign: "center", padding: "8px" }}>
        ⚠ Analyse IA informative uniquement · L'utilisateur est seul responsable de ses décisions d'investissement
      </div>
    </div>
  );
}

// ─── Result Panel ─────────────────────────────────────────────────────────────
function ResultPanel({ data, query, timestamp, profil, onRefresh }) {
  const rawSignal = (data.verdict?.signal || "ATTENDRE").toUpperCase();
  const signal = Object.keys(SIGNAL_CONFIG).find(k => rawSignal.includes(k)) || "ATTENDRE";
  const cfg = SIGNAL_CONFIG[signal];
  const time = timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      {/* Header card */}
      <div style={{ background: C.cardGradPurp, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "22px 26px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", boxShadow: shadow.card }}>
        <div>
          <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "6px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span>Rapport d'analyse · {time}</span>
            <button onClick={onRefresh} style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 10px", color: C.inkMuted, fontSize: "10px", fontFamily: "Inter, sans-serif", cursor: "pointer", fontWeight: "500" }}>↻ Actualiser</button>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>{data.nom || query.toUpperCase()}</div>
          <div style={{ fontSize: "13px", color: C.inkMuted, marginTop: "3px", fontWeight: "500" }}>{data.secteur}</div>
        </div>
        <SignalBadge signal={signal} />
      </div>

      {/* Vue ensemble */}
      {data.vue_ensemble && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px 20px", marginBottom: "16px", fontSize: "14px", color: C.inkMuted, lineHeight: "1.75" }}>
          {data.vue_ensemble}
        </div>
      )}

      {/* Performance + Fondamentaux */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <Card title="Performance" icon="📈" accentColor={C.green}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <StatBox label="Cours actuel" value={data.performance?.cours_actuel} color={C.navy} />
            <StatBox label="Évol. 1 an" value={data.performance?.evolution_1an} color={data.performance?.evolution_1an?.startsWith("+") ? C.green : C.red} />
            <StatBox label="+ Haut 52s" value={data.performance?.plus_haut_52s} />
            <StatBox label="+ Bas 52s" value={data.performance?.plus_bas_52s} />
          </div>
        </Card>
        <Card title="Fondamentaux" icon="📊" accentColor={C.navy}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <StatBox label="PER" value={data.fondamentaux?.per} />
            <StatBox label="Dividende" value={data.fondamentaux?.dividende} color={C.goldDark} />
            <StatBox label="Capitalisation" value={data.fondamentaux?.capitalisation} />
            <StatBox label="Dette / Tréso" value={data.fondamentaux?.dette_nette} />
          </div>
        </Card>
      </div>

      {/* Points forts / vigilance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <Card title="Points forts" icon="✅" accentColor={C.green}>
          {(data.points_forts || []).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: i < data.points_forts.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.green, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.5" }}>{p}</span>
            </div>
          ))}
        </Card>
        <Card title="Points de vigilance" icon="⚠️" accentColor={C.red}>
          {(data.points_vigilance || []).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: i < data.points_vigilance.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.red, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.5" }}>{p}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Valorisation */}
      <Card title="Valorisation & Consensus analystes" icon="🎯" accentColor={C.goldDark}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "14px" }}>
          <StatBox label="Objectif moyen" value={data.valorisation?.objectif_moyen} color={C.goldDark} />
          <StatBox label="Objectif haut" value={data.valorisation?.objectif_haut} color={C.green} />
          <StatBox label="Objectif bas" value={data.valorisation?.objectif_bas} color={C.red} />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { label: `Potentiel : ${data.valorisation?.potentiel}`, bg: C.goldLight, color: C.goldDark },
            { label: `${data.valorisation?.nb_analystes} analystes`, bg: C.snowOff, color: C.inkMuted },
            { label: data.valorisation?.appreciation, bg: C.snowOff, color: C.inkMuted },
          ].map((b, i) => b.label && (
            <div key={i} style={{ background: b.bg, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 14px", fontSize: "12px", color: b.color, fontWeight: "600" }}>{b.label}</div>
          ))}
        </div>
      </Card>

      {/* Timing */}
      <Card title="Timing & Point d'entrée" icon="⏱" accentColor={C.navy}>
        <div style={{ marginBottom: "14px" }}>
          <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1.5px", fontWeight: "600", textTransform: "uppercase", marginBottom: "6px" }}>Zone d'entrée conseillée</div>
          <div style={{ fontSize: "24px", fontWeight: "800", color: C.navy, letterSpacing: "-0.02em" }}>{data.timing?.point_entree}</div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {(data.timing?.catalyseurs || []).map((c, i) => (
            <div key={i} style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.navy, fontWeight: "500" }}>📅 {c}</div>
          ))}
        </div>
        <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.7", margin: 0 }}>{data.timing?.recommandation_timing}</p>
      </Card>

      <PersonalAdvice data={data} profil={profil} />

      {/* Verdict */}
      <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: "12px", padding: "24px 28px", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: cfg.color, fontWeight: "700", textTransform: "uppercase" }}>Verdict final</div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "2px" }}>Cible 12 mois</div>
            <div style={{ fontSize: "26px", fontWeight: "800", color: cfg.color, letterSpacing: "-0.02em" }}>{data.verdict?.cible_12m}</div>
          </div>
        </div>
        <div style={{ fontSize: "22px", fontWeight: "800", color: cfg.color, letterSpacing: "1px", marginBottom: "12px" }}>{cfg.icon} {signal}</div>
        <p style={{ fontSize: "14px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>{data.verdict?.justification}</p>
      </div>

      <div style={{ fontSize: "11px", color: C.inkSubtle, textAlign: "center", padding: "8px", letterSpacing: "0.5px" }}>
        ⚠ Analyse IA informative uniquement · L'utilisateur est seul responsable de ses décisions d'investissement
      </div>
    </div>
  );
}

// ─── Portfolio Result ─────────────────────────────────────────────────────────
function PortfolioResult({ data, timestamp }) {
  const time = timestamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ animation: "fadeIn 0.4s ease", marginTop: "20px" }}>
      <div style={{ background: C.cardGrad, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "22px 26px", marginBottom: "16px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "10px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", marginBottom: "8px" }}>Analyse portefeuille · {time}</div>
        <p style={{ fontSize: "15px", color: C.ink, lineHeight: "1.6", margin: "0 0 10px", fontWeight: "400" }}>{data.resume}</p>
        <div style={{ fontSize: "22px", fontWeight: "800", color: C.navy, letterSpacing: "-0.02em" }}>{data.performance_globale}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        <Card title="Forces" icon="✅" accentColor={C.green}>
          {(data.forces || []).map((f, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "7px 0", borderBottom: i < data.forces.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.green, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "13px", color: C.inkMuted }}>{f}</span>
            </div>
          ))}
        </Card>
        <Card title="Faiblesses" icon="⚠️" accentColor={C.red}>
          {(data.faiblesses || []).map((f, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", padding: "7px 0", borderBottom: i < data.faiblesses.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.red, flexShrink: 0, fontWeight: "700" }}>▸</span>
              <span style={{ fontSize: "13px", color: C.inkMuted }}>{f}</span>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Diversification" icon="🌍" accentColor={C.navy}>
        <div style={{ fontSize: "13px", color: C.ink, marginBottom: "6px" }}><span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600" }}>GÉOGRAPHIE · </span>{data.diversification?.geographie}</div>
        <div style={{ fontSize: "13px", color: C.ink, marginBottom: "12px" }}><span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600" }}>CONCENTRATION · </span>{data.diversification?.concentration}</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(data.diversification?.secteurs || []).map((s, i) => (
            <div key={i} style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: C.navy, fontWeight: "600" }}>{s.nom} {s.poids}</div>
          ))}
        </div>
      </Card>

      <Card title="Cohérence profil" icon="👤" accentColor={C.goldDark}>
        <p style={{ fontSize: "13px", color: C.inkMuted, margin: 0, lineHeight: "1.7" }}>{data.coherence_profil}</p>
      </Card>

      <Card title="Recommandations" icon="🎯" accentColor={C.green}>
        {(data.recommandations || []).map((r, i) => (
          <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: i < data.recommandations.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <span style={{ color: C.green, flexShrink: 0, fontWeight: "700" }}>›</span>
            <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.5" }}>{r}</span>
          </div>
        ))}
      </Card>

      <Card title="Nouvelles opportunités" icon="💡" accentColor={C.goldDark}>
        {(data.opportunites || []).map((o, i) => (
          <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: i < data.opportunites.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <span style={{ color: C.goldDark, flexShrink: 0, fontWeight: "700" }}>›</span>
            <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.5" }}>{o}</span>
          </div>
        ))}
      </Card>

      <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "12px", padding: "22px 26px" }}>
        <div style={{ fontSize: "10px", color: C.navy, letterSpacing: "2px", fontWeight: "700", textTransform: "uppercase", marginBottom: "10px" }}>Verdict global</div>
        <p style={{ fontSize: "14px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>{data.verdict_global}</p>
      </div>

      <div style={{ fontSize: "11px", color: C.inkSubtle, textAlign: "center", padding: "14px", letterSpacing: "0.5px" }}>
        ⚠ Analyse IA informative uniquement · L'utilisateur est seul responsable de ses décisions d'investissement
      </div>
    </div>
  );
}

// ─── DCA Strategy ─────────────────────────────────────────────────────────────
const isETFName = (nom) => /etf|tracker|ucits|msci|world|amundi|lyxor|ishares|bnp.*easy|vanguard|s&p|sp500|nasdaq|cac|dax/i.test(nom || "");
const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function DCAStrategy({ positions, profil, marketScores, marketScoringUi, onRunScoring, onSaveProfil }) {
  const dcaMensuel   = Number(profil?.dcaMensuel) || 0;
  const dcaDuree     = Number(profil?.dcaDuree) || 120;
  const courtierKey  = profil?.courtier || "boursobank";
  const courtierCfg  = COURTIERS[courtierKey] || COURTIERS.boursobank;
  const [priorityAnalysis, setPriorityAnalysis] = useState(null);
  const [analysisUi, setAnalysisUi]             = useState(UI.IDLE);
  const analysisKeyRef = useRef(null);

  // ── Scoring mécanique (avant hooks conditionnels) ─────────────────────────
  const totalActuel  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);

  // Capital réel investi : depuis les avis opérés si disponibles, sinon PRU × qté
  const capitalReel = (() => {
    const ops = load("bourse_avis_operes", []);
    if (!ops.length) return totalInvesti;
    const achats = ops.filter(o => o.type === "ACHAT")
      .reduce((s, o) => s + (parseFloat(o.quantite)||0) * (parseFloat(o.prixUnitaire)||0) + (parseFloat(o.frais)||0), 0);
    const ventes = ops.filter(o => o.type === "VENTE")
      .reduce((s, o) => s + (parseFloat(o.quantite)||0) * (parseFloat(o.prixUnitaire)||0) - (parseFloat(o.frais)||0), 0);
    return Math.max(0, achats - ventes);
  })();
  const n = positions.length;
  const scored = positions.map(pos => {
    const cours    = pos.dernierCours || pos.pru;
    const valeur   = cours * pos.quantite;
    const poids    = totalActuel > 0 ? valeur / totalActuel : 1 / n;
    const poidsRef = 1 / n;
    const etf        = isETFName(pos.nom);
    const sousProfit = Math.max(0, pos.pru - cours) / pos.pru;
    const sousPond   = Math.max(0, poidsRef - poids) / poidsRef;
    const potentiel  = etf ? Math.max(0.30, sousProfit) : sousProfit;
    const nature     = etf ? 1.0 : 0.45;
    // Pénalité concentration : valeur non-ETF > 20% du portefeuille (risque idiosyncratique élevé)
    const concentration = !etf && poids > 0.20;
    const penaliteConc = concentration ? Math.min(0.15, (poids - 0.20) * 0.75) : 0;
    const scoreMeca  = Math.max(0, potentiel * 0.50 + nature * 0.30 + sousPond * 0.20 - penaliteConc);

    // Ajustement IA marché : score_marche sur 0-20, normalisé 0-1 pour le calcul
    const iaEntry   = marketScores?.find(s => s.isin === pos.isin || s.nom === pos.nom);
    const scoreIA   = iaEntry ? (iaEntry.score_marche > 1 ? iaEntry.score_marche / 20 : iaEntry.score_marche) : 0.5;
    // Score final : 55% mécanique · 45% IA marché
    const score = scoreMeca * 0.55 + scoreIA * 0.45;

    const raisons = [];
    if (etf)                       raisons.push("ETF — compounder long terme privilégié");
    if (cours < pos.pru)           raisons.push("Cours sous PRU — moyenne à la baisse");
    if (sousPond > 0.3)            raisons.push("Ligne sous-pondérée — rééquilibrage utile");
    if (iaEntry?.signal === "ACHAT")     raisons.push("Signal IA : ACHAT — actualité favorable");
    if (iaEntry?.signal === "RENFORCER") raisons.push("Signal IA : RENFORCER — momentum positif");
    if (iaEntry?.catalyseur_cle)   raisons.push(`Catalyseur : ${iaEntry.catalyseur_cle}`);
    if (concentration)             raisons.push(`⚠ Concentration ${(poids*100).toFixed(0)}% — risque idiosyncratique élevé`);
    if (!etf && cours >= pos.pru && sousPond <= 0.3 && !iaEntry) raisons.push("Conviction sectorielle long terme");
    return { ...pos, cours, poids, score, scoreMeca, scoreIA, raisons, sousPRU: cours < pos.pru, etf, iaEntry };
  });
  const prioritaire = scored.length > 0 ? [...scored].sort((a, b) => b.score - a.score)[0] : null;

  // ── Fetch auto analyse prioritaire ────────────────────────────────────────
  const fetchPriorityAnalysis = useCallback(async (pos) => {
    if (!pos) return;
    const etf = isETFName(pos.nom);
    setAnalysisUi(UI.LOADING);
    setPriorityAnalysis(null);
    try {
      let data;
      if (etf) {
        data = await enqueueApi(() => callClaude(ETF_DCA_PROMPT,
          `Analyse complète ETF DCA pour : ${pos.nom}${pos.isin ? ` (ISIN: ${pos.isin})` : ""}. Profil : DCA ${dcaMensuel}€/mois sur PEA, horizon 10 ans. JSON uniquement.`, true));
        data._isEtf = true;
      } else {
        data = await enqueueApi(() => callClaude(SYSTEM_PROMPT,
          `Analyse complète de ${pos.nom}${pos.isin ? ` (ISIN: ${pos.isin})` : ""}. Contexte marché actuel. Pourquoi c'est l'action prioritaire à renforcer ce mois dans une stratégie DCA 10 ans ? JSON uniquement.`, true));
      }
      setPriorityAnalysis(data);
      setAnalysisUi(UI.RESULT);
    } catch {
      setAnalysisUi(UI.ERROR);
    }
  }, [dcaMensuel]);

  // Analyse prioritaire uniquement sur demande manuelle (pas d'auto-refresh)

  if (positions.length === 0) return null;

  if (dcaMensuel <= 0) return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "22px", padding: "36px", textAlign: "center", boxShadow: shadow.card, marginTop: "8px" }}>
      <div style={{ fontSize: "28px", marginBottom: "14px", opacity: 0.2 }}>📅</div>
      <div style={{ fontSize: "14px", fontWeight: "700", color: C.ink, marginBottom: "8px" }}>Stratégie DCA non configurée</div>
      <div style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.65", marginBottom: "18px" }}>
        Définissez votre montant DCA mensuel dans l'onglet <strong>Profil</strong> pour activer la sélection automatique de l'action prioritaire du mois, le calcul des frais de courtage et la projection de votre portefeuille.
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "10px 18px", fontSize: "12px", color: C.navy, fontWeight: "700" }}>
        ⚙ Aller dans Profil → DCA mensuel
      </div>
    </div>
  );

  if (!prioritaire) return null;

  // ── Calcul achat + frais de courtage ───────────────────────────────────────
  const minOrdre         = Math.max(courtierCfg.minOrdre, prioritaire.cours); // ≥ 1 titre
  const titresAchetables = dcaMensuel >= minOrdre ? Math.floor(dcaMensuel / prioritaire.cours) : 0;
  const montantReel      = titresAchetables * prioritaire.cours;
  const fraisBourso      = calcFraisCourtage(montantReel, courtierKey);
  const coutTotal        = montantReel + fraisBourso;
  const reste            = dcaMensuel - montantReel;
  const manque           = Math.max(minOrdre, prioritaire.cours) - dcaMensuel;
  const minPourUnTitre   = Math.ceil(prioritaire.cours * 100) / 100;
  const surplusConseille = titresAchetables > 0 ? reste : manque;
  const peutSuggererPlus = titresAchetables === 0 ||
    (reste > 0 && Math.floor((dcaMensuel + reste) / prioritaire.cours) > titresAchetables);

  // Nouveau PRU après achat
  const investActuel = prioritaire.pru * prioritaire.quantite;
  const nouvelInvest = investActuel + montantReel;
  const nouvelleQte  = prioritaire.quantite + titresAchetables;
  const nouveauPRU   = nouvelleQte > 0 ? nouvelInvest / nouvelleQte : prioritaire.pru;

  // Frais si DCA augmenté (1 titre de plus)
  const montantPlus    = (titresAchetables + 1) * prioritaire.cours;
  const fraisPlus      = calcFraisCourtage(montantPlus, courtierKey);

  // DCA min conseillé = max(minOrdre courtier, 1 titre + frais raisonnables)
  const dcaMinConseille = Math.max(minPourUnTitre + fraisBourso, minOrdre, prioritaire.cours * 1.01);

  // ── Projection réaliste 3 scénarios ──────────────────────────────────────
  const projScenario = (tauxAnnuel, mois) => {
    const r = Math.pow(1 + tauxAnnuel, 1 / 12) - 1;
    return totalActuel * Math.pow(1 + r, mois) +
      (r > 0 ? dcaMensuel * (Math.pow(1 + r, mois) - 1) / r : dcaMensuel * mois);
  };
  const durLabel = (m) => m >= 24 ? `${m / 12} ans` : m === 12 ? "1 an" : `${m} mois`;
  const maxMois  = Math.max(dcaDuree, 24);
  const horizons = [6, 12, Math.min(36, maxMois), Math.min(60, maxMois), Math.min(120, maxMois)].filter((v, i, a) => a.indexOf(v) === i && v <= maxMois);

  const moisLabel = MOIS_FR[new Date().getMonth()] + " " + new Date().getFullYear();
  const etfPrioritaire = isETFName(prioritaire.nom);
  const signalAnalyse  = priorityAnalysis ? Object.keys(SIGNAL_CONFIG).find(k => (priorityAnalysis.verdict?.signal || "").toUpperCase().includes(k)) || "ATTENDRE" : null;
  const cfgAnalyse     = signalAnalyse ? SIGNAL_CONFIG[signalAnalyse] : null;

  return (
    <Card title={`Stratégie DCA — ${moisLabel}`} icon="📅" accentColor={C.navy}>
      {/* Résumé budget */}
      <div className="ba-g4" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "8px", marginBottom: "12px" }}>
        <StatBox label="DCA mensuel"     value={fmtEur(dcaMensuel)} color={C.navy} sensitive />
        <StatBox label="Durée restante"  value={durLabel(dcaDuree)} />
        <StatBox label="Investi"         value={fmtEur(capitalReel)} color={C.ink} sensitive />
        <StatBox label="Valeur actuelle" value={fmtEur(totalActuel)} color={C.navy} sensitive />
        <StatBox label="Plus-value"      value={fmtPct(capitalReel > 0 ? (totalActuel - capitalReel) / capitalReel * 100 : 0)} color={totalActuel >= capitalReel ? C.green : C.red} sensitive />
      </div>

      {/* Bandeau scoring IA marché */}
      {marketScoringUi === UI.LOADING && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "9px 14px", marginBottom: "14px" }}>
          <span style={{ fontSize: "12px" }}>🔍</span>
          <span style={{ fontSize: "11px", color: C.navy, fontWeight: "600" }}>Analyse de l'actualité marché sur toutes les lignes en cours…</span>
          <span style={{ fontSize: "11px", color: C.inkSubtle, marginLeft: "auto" }}>Le scoring final sera affiné à réception</span>
        </div>
      )}
      {marketScoringUi === UI.RESULT && marketScores && (
        <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "10px 14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "9px", color: C.navy, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>
            📡 Scoring marché IA — actualité + fondamentaux + momentum
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {[...scored].sort((a, b) => b.score - a.score).map((pos, i) => {
              const sig = pos.iaEntry?.signal || "—";
              const sigColor = sig === "ACHAT" ? C.green : sig === "RENFORCER" ? C.navy : sig === "VENDRE" ? "#7B1111" : sig === "PRUDENCE" ? C.red : C.goldDark;
              return (
                <div key={pos.id} style={{ display: "flex", alignItems: "center", gap: "7px", background: C.snow, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "6px 10px" }}>
                  <CompanyAvatar nom={pos.nom} isin={pos.isin} size={22} />
                  <span style={{ fontSize: "11px", fontWeight: "700", color: C.ink }}>{pos.nom.split(" ")[0]}</span>
                  <span style={{ fontSize: "10px", fontWeight: "700", color: sigColor, background: sigColor + "18", borderRadius: "99px", padding: "2px 7px" }}>{sig}</span>
                  <span style={{ fontSize: "10px", color: C.inkSubtle }}>{Math.round(pos.scoreIA * 20)}/20</span>
                </div>
              );
            })}
          </div>
          {prioritaire.iaEntry?.resume && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: C.navy, fontStyle: "italic", lineHeight: "1.55", borderTop: `1px solid rgba(30,58,95,0.12)`, paddingTop: "8px" }}>
              💬 {prioritaire.iaEntry.resume}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ── ACTION PRIORITAIRE DU MOIS ─────────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div style={{ background: C.snow, border: `2px solid ${C.navy}`, borderRadius: "22px", overflow: "hidden", marginBottom: "24px" }}>
        {/* Header prioritaire */}
        <div style={{ background: C.navy, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.6)", letterSpacing: "2px", fontWeight: "700", textTransform: "uppercase", marginBottom: "4px" }}>
              Action prioritaire — {moisLabel}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "20px", fontWeight: "800", color: C.snow }}>{prioritaire.nom}</span>
              {prioritaire.isin && <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", fontWeight: "600" }}>{prioritaire.isin}</span>}
              {etfPrioritaire && <span style={{ background: "rgba(255,255,255,0.15)", borderRadius: "5px", padding: "2px 8px", fontSize: "10px", color: C.snow, fontWeight: "700" }}>ETF</span>}
              {prioritaire.sousPRU && <span style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "5px", padding: "2px 8px", fontSize: "10px", color: C.goldDark, fontWeight: "700" }}>Sous PRU</span>}
              {prioritaire.isin && (() => {
                const url = getEuronextUrl(prioritaire.isin, prioritaire.nom);
                return (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    style={{ background: "rgba(255,255,255,0.15)", borderRadius: "5px", padding: "2px 8px", fontSize: "10px", color: C.snow, fontWeight: "700", textDecoration: "none" }}>
                    Euronext ↗
                  </a>
                );
              })()}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", fontWeight: "600", marginBottom: "2px" }}>COURS ACTUEL</div>
            <div style={{ fontSize: "26px", fontWeight: "800", color: C.snow }}>{fmtCours(prioritaire.cours)}</div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>PRU : {fmtCours(prioritaire.pru)} · {prioritaire.sousPRU ? "−" : "+"}{fmtPct(Math.abs((prioritaire.cours - prioritaire.pru) / prioritaire.pru * 100))}</div>
          </div>
        </div>

        <div style={{ padding: "18px 20px" }}>
          {/* Raisons du choix */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
            {prioritaire.raisons.map((r, i) => (
              <div key={i} style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "6px", padding: "4px 12px", fontSize: "11px", color: C.navy, fontWeight: "600" }}>▸ {r}</div>
            ))}
          </div>

          {/* Plan d'achat */}

        {/* Achat + frais de courtage */}
        {titresAchetables > 0 ? (
          <div style={{ background: C.snow, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "8px", padding: "14px 16px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "13px", color: C.inkMuted, marginBottom: "4px" }}>Avec votre DCA de <strong style={{ color: C.ink }}>{fmtEur(dcaMensuel)}</strong></div>
                <div style={{ fontSize: "16px", fontWeight: "800", color: C.green }}>
                  Acheter {titresAchetables} titre{titresAchetables > 1 ? "s" : ""} = {fmtEur(montantReel)}
                </div>
              </div>
              {prioritaire.sousPRU && nouvelleQte > 0 && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600", marginBottom: "2px" }}>Nouveau PRU après achat</div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: C.green }}>{fmtCours(nouveauPRU)}</div>
                  <div style={{ fontSize: "11px", color: C.inkMuted }}>
                    ({nouveauPRU < prioritaire.pru ? "−" : "="}{fmtEur(Math.abs(prioritaire.pru - nouveauPRU))} vs actuel)
                  </div>
                </div>
              )}
            </div>
            {/* Frais de courtage */}
            <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "10px 14px" }}>
              <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>
                🏦 Frais de courtage — Gestion Libre
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", marginBottom: "2px" }}>MONTANT</div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>{fmtEur(montantReel)}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", marginBottom: "2px" }}>FRAIS</div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: C.goldDark }}>{fmtEur(fraisBourso)}</div>
                  <div style={{ fontSize: "9px", color: C.inkSubtle }}>{montantReel <= 500 ? "fixe ≤500€" : "0,5% min 3,99€"}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", marginBottom: "2px" }}>COÛT TOTAL</div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: C.navy }}>{fmtEur(coutTotal)}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", marginBottom: "2px" }}>IMPACT</div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: montantReel > 0 && fraisBourso / montantReel < 0.01 ? C.green : C.goldDark }}>
                    {tauxFraisCourtage(montantReel)}%
                  </div>
                </div>
              </div>
              {fraisBourso / montantReel > 0.015 && (
                <div style={{ marginTop: "8px", fontSize: "11px", color: C.goldDark }}>
                  ⚠ Impact frais élevé ({tauxFraisCourtage(montantReel)}%). Idéalement investissez &gt; {fmtEur(Math.max(400, montantReel))} pour diluer les frais sous 0,5%.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "8px", padding: "14px 16px", marginBottom: "10px" }}>
            <div style={{ fontSize: "13px", color: C.goldDark, fontWeight: "600", marginBottom: "6px" }}>
              ⚠ Budget DCA insuffisant pour acheter 1 titre ({fmtCours(prioritaire.cours)})
            </div>
            <div style={{ fontSize: "13px", color: C.inkMuted }}>
              Il vous manque <strong style={{ color: C.ink }}>{fmtEur(manque)}</strong> pour acquérir votre 1er titre ce mois.
            </div>
          </div>
        )}

        {/* Conseil si investir plus */}
        {peutSuggererPlus && (
          <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "12px 16px", marginTop: "10px" }}>
            <div style={{ fontSize: "11px", color: C.navy, fontWeight: "700", marginBottom: "6px" }}>
              💡 Conseil : investir davantage ce mois
            </div>
            {titresAchetables > 0 ? (
              <p style={{ fontSize: "12px", color: C.inkMuted, margin: 0, lineHeight: "1.6" }}>
                En ajoutant <strong style={{ color: C.navy }}>{fmtEur(surplusConseille)}</strong> de plus (total : {fmtEur(dcaMensuel + surplusConseille)}), vous acquérez{" "}
                <strong style={{ color: C.navy }}>{titresAchetables + 1} titre{titresAchetables + 1 > 1 ? "s" : ""}</strong> — frais de courtage : {fmtEur(fraisPlus)} ({tauxFraisCourtage(montantPlus)}%).
              </p>
            ) : (
              <p style={{ fontSize: "12px", color: C.inkMuted, margin: 0, lineHeight: "1.6" }}>
                En portant votre DCA à <strong style={{ color: C.navy }}>{fmtEur(minPourUnTitre)}</strong> ce mois (+{fmtEur(manque)}), vous acquérez votre premier titre. Frais : {fmtEur(calcFraisCourtage(minPourUnTitre))}.
              </p>
            )}
          </div>
        )}
        </div>{/* end padding wrapper */}
      </div>

      {/* ── Argumentaire d'investissement ── */}
      <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "20px", overflow: "hidden", marginBottom: "20px" }}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #111214 0%, #1E3A5F 100%)", padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", letterSpacing: "2px", fontWeight: "700", textTransform: "uppercase", marginBottom: "3px" }}>
              Argumentaire d'investissement
            </div>
            <div style={{ fontSize: "15px", fontWeight: "800", color: C.snow }}>{prioritaire.nom}</div>
          </div>
          <span style={{ fontSize: "22px" }}>📋</span>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* §1 — Pourquoi ce mois */}
          <div>
            <div style={{ fontSize: "10px", color: C.navy, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>
              ▸ Pourquoi {prioritaire.nom} ce mois ?
            </div>
            <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>
              {prioritaire.nom} ressort comme action prioritaire
              {prioritaire.sousPRU
                ? <> pour deux raisons cumulées : le cours actuel (<strong style={{ color: C.ink }}>{fmtCours(prioritaire.cours)}</strong>) est sous votre PRU (<strong style={{ color: C.ink }}>{fmtCours(prioritaire.pru)}</strong>), soit une décote de <strong style={{ color: C.red }}>−{Math.abs((prioritaire.cours - prioritaire.pru) / prioritaire.pru * 100).toFixed(1)} %</strong>, et la ligne ne représente que <strong style={{ color: C.ink }}>{(prioritaire.poids * 100).toFixed(1)} %</strong> du portefeuille contre un objectif de <strong style={{ color: C.ink }}>{(100 / scored.length).toFixed(1)} %</strong>. Renforcer maintenant abaisse mécaniquement votre coût moyen tout en rééquilibrant l'allocation.</>
                : <> en raison de sa nette sous-pondération : la ligne représente seulement <strong style={{ color: C.ink }}>{(prioritaire.poids * 100).toFixed(1)} %</strong> du portefeuille contre un objectif de <strong style={{ color: C.ink }}>{(100 / scored.length).toFixed(1)} %</strong>. Renforcer maintenant rééquilibre votre portefeuille vers une répartition cible équilibrée.</>
              }
            </p>
          </div>

          {/* §2 — DCA & frais de courtage */}
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 16px" }}>
            <div style={{ fontSize: "10px", color: C.navy, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>
              ▸ Alignement DCA & frais de courtage
            </div>
            <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>
              À <strong style={{ color: C.ink }}>{fmtCours(prioritaire.cours)}</strong>/titre, un DCA de{" "}
              <strong style={{ color: C.ink }}>{fmtEur(dcaMensuel)}</strong> permet d'acquérir{" "}
              {titresAchetables > 0
                ? <><strong style={{ color: C.navy }}>{titresAchetables} titre{titresAchetables > 1 ? "s" : ""}</strong> pour <strong style={{ color: C.ink }}>{fmtEur(montantReel)}</strong> + <strong style={{ color: C.goldDark }}>{fmtEur(fraisBourso)} de frais fixes</strong>{montantReel <= 500 ? " (≤ 500 €, gestion libre)" : " (0,5 % min 3,99 €)"}, soit un impact frais de seulement{" "}<strong style={{ color: fraisBourso / montantReel < 0.012 ? C.green : C.goldDark }}>{tauxFraisCourtage(montantReel)} %</strong> — parfaitement maîtrisé.</>
                : <><strong style={{ color: C.red }}>0 titre ce mois</strong> — budget insuffisant ({fmtEur(manque)} manquants). Cumulez sur le mois prochain.</>
              }{" "}
              L'achat régulier dilue la volatilité et évite tout market-timing sur cette valeur dans votre horizon 10 ans.
            </p>
          </div>

          {/* §3 — Pourquoi malgré les autres lignes */}
          <div>
            <div style={{ fontSize: "10px", color: C.navy, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>
              ▸ Pourquoi malgré les autres lignes ?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "10px" }}>
              {scored.filter(p => p.id !== prioritaire.id).map(pos => {
                const pvPct = pos.pru > 0 ? (pos.cours - pos.pru) / pos.pru * 100 : 0;
                return (
                  <div key={pos.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px 12px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink, fontFamily: "Inter, sans-serif" }}>{pos.nom}</span>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", color: pvPct >= 0 ? C.green : C.red, fontWeight: "700" }}>
                        {pvPct >= 0 ? "+" : ""}{pvPct.toFixed(1)} %
                      </span>
                      <span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600" }}>
                        {(pos.poids * 100).toFixed(1)} % port.
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.65", margin: 0 }}>
              Les autres lignes affichent des plus-values solides et sont mieux pondérées dans le portefeuille.{" "}
              <strong style={{ color: C.ink }}>{prioritaire.nom}</strong>,{" "}
              {prioritaire.sousPRU ? "seule ligne en décote et" : "nettement"} structurellement sous-représentée,
              offre le meilleur rapport rééquilibrage/conviction ce mois dans une logique DCA long terme.
            </p>
          </div>

          {/* §4 — Contexte & potentiel long terme (IA) */}
          {analysisUi === UI.RESULT && priorityAnalysis && (priorityAnalysis.contexte_marche || priorityAnalysis.vue_ensemble) && (
            <div>
              <div style={{ fontSize: "10px", color: C.navy, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>
                ▸ Contexte & potentiel long terme
              </div>
              <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>
                {priorityAnalysis.contexte_marche || priorityAnalysis.vue_ensemble}
              </p>
              {etfPrioritaire && priorityAnalysis.repartition_sectorielle && priorityAnalysis.repartition_sectorielle.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
                  {priorityAnalysis.repartition_sectorielle.slice(0, 5).map((s, i) => (
                    <span key={i} style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "6px", padding: "3px 10px", fontSize: "11px", color: C.navy, fontWeight: "500" }}>
                      {s.secteur} · {s.poids}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {analysisUi === UI.LOADING && (
            <div style={{ fontSize: "12px", color: C.inkSubtle, textAlign: "center", padding: "6px 0", fontStyle: "italic" }}>
              <span style={{ display:"inline-flex", alignItems:"center", gap:"6px" }}><ThinkingSpinner size={14} color={C.inkMuted} /> Enrichissement en cours — contexte marché &amp; risques via IA…</span>
            </div>
          )}

          {/* §5 — Risques */}
          {analysisUi === UI.RESULT && priorityAnalysis && (priorityAnalysis.points_vigilance || []).length > 0 && (
            <div style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "12px 16px" }}>
              <div style={{ fontSize: "10px", color: C.red, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>
                ⚠ Risques à intégrer
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {(priorityAnalysis.points_vigilance || []).map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px" }}>
                    <span style={{ color: C.red, fontWeight: "700", flexShrink: 0 }}>▸</span>
                    <span style={{ fontSize: "12px", color: C.red, lineHeight: "1.6" }}>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Conseils DCA flex ── */}
      <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px 18px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ fontSize: "10px", color: C.navy, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase" }}>
            📊 Ajustements DCA selon votre budget mensuel
          </div>
          {/* Sélecteur courtier */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "600" }}>Courtier :</span>
            <select
              value={courtierKey}
              onChange={e => onSaveProfil && onSaveProfil({ ...profil, courtier: e.target.value })}
              style={{ fontSize: "10px", fontWeight: "700", color: C.navy, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 6px", background: C.snow, cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
              {Object.entries(COURTIERS).map(([k, v]) => <option key={k} value={k}>{v.nom}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Mois normal */}
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ background: C.green, color: C.snow, borderRadius: "6px", padding: "3px 8px", fontSize: "10px", fontWeight: "700", flexShrink: 0, marginTop: "2px" }}>NORMAL</div>
            <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>
              Budget habituel {fmtEur(dcaMensuel)} · {titresAchetables > 0 ? `Acheter ${titresAchetables} titre${titresAchetables > 1 ? "s" : ""} de ${prioritaire.nom} = ${fmtEur(montantReel)} + ${fmtEur(fraisBourso)} frais (${courtierCfg.nom})` : `Budget insuffisant pour 1 titre (${fmtEur(prioritaire.cours)}) — économisez pour le mois prochain`}
            </div>
          </div>
          {/* Mois abondant */}
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ background: C.navy, color: C.snow, borderRadius: "6px", padding: "3px 8px", fontSize: "10px", fontWeight: "700", flexShrink: 0, marginTop: "2px" }}>HAUSSE</div>
            <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>
              Si vous pouvez investir davantage : ciblez {fmtEur(montantPlus)} (+1 titre) pour maximiser l'effet DCA. Frais {courtierCfg.nom} : {fmtEur(fraisPlus)} ({tauxFraisCourtage(montantPlus)}%).
            </div>
          </div>
          {/* Mois contraint */}
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ background: C.goldDark, color: C.snow, borderRadius: "6px", padding: "3px 8px", fontSize: "10px", fontWeight: "700", flexShrink: 0, marginTop: "2px" }}>RÉDUIT</div>
            <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>
              Minimum conseillé : <strong>{fmtEur(dcaMinConseille)}</strong> (1 titre à {fmtEur(prioritaire.cours)} + {fmtEur(fraisBourso)} frais {courtierCfg.nom}{courtierCfg.minOrdre > 0 ? ` · ordre min ${fmtEur(courtierCfg.minOrdre)}` : ""}).
              En dessous, reporter et cumuler évite des frais disproportionnés.
            </div>
          </div>
          {/* Mois difficile */}
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ background: C.red, color: C.snow, borderRadius: "6px", padding: "3px 8px", fontSize: "10px", fontWeight: "700", flexShrink: 0, marginTop: "2px" }}>PAUSE</div>
            <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>
              Ne jamais forcer un achat. Le DCA sur 10 ans tolère 1 à 2 mois de pause sans impact majeur. L'essentiel est la régularité sur la durée.
            </div>
          </div>
        </div>
      </div>


      {/* ── Analyse IA approfondie de l'action prioritaire ── */}
      {analysisUi === UI.LOADING && <LoadingPanel label="ANALYSE APPROFONDIE EN COURS" />}
      {analysisUi === UI.RESULT && priorityAnalysis && (() => {
        const sig = priorityAnalysis.verdict?.signal || prioritaire.iaEntry?.signal || "";
        const sigKey = Object.keys(SIGNAL_CONFIG).find(k => sig.toUpperCase().includes(k)) || "ATTENDRE";
        const sigCfg = SIGNAL_CONFIG[sigKey];
        return (
          <div style={{ border: `1px solid ${sigCfg.border}`, borderRadius: "12px", overflow: "hidden", marginBottom: "20px" }}>
            {/* Header signal */}
            <div style={{ background: sigCfg.bg, borderBottom: `1px solid ${sigCfg.border}`, padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "18px", fontWeight: "900", color: sigCfg.color }}>{sigCfg.icon}</span>
                <div>
                  <div style={{ fontSize: "9px", color: sigCfg.color, fontWeight: "700", letterSpacing: "2px", textTransform: "uppercase", opacity: 0.7 }}>Signal IA — Analyse approfondie</div>
                  <div style={{ fontSize: "16px", fontWeight: "800", color: sigCfg.color }}>{sigKey} · {prioritaire.nom}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {priorityAnalysis.verdict?.cible_12m && (
                  <>
                    <div style={{ fontSize: "9px", color: sigCfg.color, fontWeight: "600", opacity: 0.7 }}>CIBLE 12 MOIS</div>
                    <div style={{ fontSize: "18px", fontWeight: "800", color: sigCfg.color }}>{priorityAnalysis.verdict.cible_12m}</div>
                  </>
                )}
              </div>
            </div>

            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Score breakdown */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>Score mécanique</div>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: C.navy }}>{Math.round(prioritaire.scoreMeca * 100)}<span style={{ fontSize: "11px", fontWeight: "500" }}>/100</span></div>
                  <div style={{ fontSize: "9px", color: C.inkSubtle }}>Potentiel LT + Nature + Poids</div>
                </div>
                <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>Score marché IA</div>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: sigCfg.color }}>{Math.round(prioritaire.scoreIA * 100)}<span style={{ fontSize: "11px", fontWeight: "500" }}>/100</span></div>
                  <div style={{ fontSize: "9px", color: C.inkSubtle }}>Actualité + momentum + fondamentaux</div>
                </div>
                <div style={{ background: sigCfg.bg, border: `1px solid ${sigCfg.border}`, borderRadius: "8px", padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: "9px", color: sigCfg.color, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "4px" }}>Score final</div>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: sigCfg.color }}>{Math.round(prioritaire.score * 100)}<span style={{ fontSize: "11px", fontWeight: "500" }}>/100</span></div>
                  <div style={{ fontSize: "9px", color: sigCfg.color, opacity: 0.8 }}>55 % méca · 45 % IA</div>
                </div>
              </div>

              {/* Contexte marché */}
              {priorityAnalysis.contexte_marche && (
                <div>
                  <div style={{ fontSize: "10px", color: C.navy, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>📰 Contexte marché</div>
                  <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>{priorityAnalysis.contexte_marche}</p>
                </div>
              )}

              {/* Points forts + vigilance en colonnes */}
              {((priorityAnalysis.points_forts || []).length > 0 || (priorityAnalysis.points_vigilance || []).length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {(priorityAnalysis.points_forts || []).length > 0 && (
                    <div style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "8px", padding: "12px 14px" }}>
                      <div style={{ fontSize: "10px", color: C.green, fontWeight: "700", letterSpacing: "1px", marginBottom: "8px" }}>✓ POINTS FORTS</div>
                      {priorityAnalysis.points_forts.map((p, i) => (
                        <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "5px" }}>
                          <span style={{ color: C.green, fontWeight: "700", flexShrink: 0, fontSize: "11px" }}>▸</span>
                          <span style={{ fontSize: "12px", color: C.green, lineHeight: "1.5" }}>{p}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(priorityAnalysis.points_vigilance || []).length > 0 && (
                    <div style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "12px 14px" }}>
                      <div style={{ fontSize: "10px", color: C.red, fontWeight: "700", letterSpacing: "1px", marginBottom: "8px" }}>⚠ RISQUES</div>
                      {priorityAnalysis.points_vigilance.map((p, i) => (
                        <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "5px" }}>
                          <span style={{ color: C.red, fontWeight: "700", flexShrink: 0, fontSize: "11px" }}>▸</span>
                          <span style={{ fontSize: "12px", color: C.red, lineHeight: "1.5" }}>{p}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Catalyseurs */}
              {(priorityAnalysis.timing?.catalyseurs || []).length > 0 && (
                <div>
                  <div style={{ fontSize: "10px", color: C.goldDark, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>📅 Catalyseurs à surveiller</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {priorityAnalysis.timing.catalyseurs.map((c, i) => (
                      <span key={i} style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "6px", padding: "4px 12px", fontSize: "11px", color: C.goldDark, fontWeight: "600" }}>📅 {c}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Valorisation */}
              {priorityAnalysis.valorisation && (priorityAnalysis.valorisation.objectif_moyen || priorityAnalysis.valorisation.potentiel) && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {priorityAnalysis.valorisation.objectif_moyen && (
                    <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "10px 14px", flex: 1, minWidth: "100px" }}>
                      <div style={{ fontSize: "9px", color: C.navy, fontWeight: "700", letterSpacing: "1px", marginBottom: "4px" }}>OBJECTIF MOYEN</div>
                      <div style={{ fontSize: "16px", fontWeight: "800", color: C.navy }}>{priorityAnalysis.valorisation.objectif_moyen}</div>
                    </div>
                  )}
                  {priorityAnalysis.valorisation.potentiel && (
                    <div style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "8px", padding: "10px 14px", flex: 1, minWidth: "100px" }}>
                      <div style={{ fontSize: "9px", color: C.green, fontWeight: "700", letterSpacing: "1px", marginBottom: "4px" }}>POTENTIEL</div>
                      <div style={{ fontSize: "16px", fontWeight: "800", color: C.green }}>{priorityAnalysis.valorisation.potentiel}</div>
                    </div>
                  )}
                  {priorityAnalysis.valorisation.nb_analystes && (
                    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 14px", flex: 1, minWidth: "100px" }}>
                      <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", marginBottom: "4px" }}>ANALYSTES</div>
                      <div style={{ fontSize: "16px", fontWeight: "800", color: C.ink }}>{priorityAnalysis.valorisation.nb_analystes}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Verdict DCA */}
              {priorityAnalysis.verdict?.justification && (
                <div style={{ background: sigCfg.bg, border: `1px solid ${sigCfg.border}`, borderRadius: "8px", padding: "14px 16px" }}>
                  <div style={{ fontSize: "10px", color: sigCfg.color, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>
                    {sigCfg.icon} Verdict — Pourquoi prioritaire pour votre DCA 10 ans
                  </div>
                  <p style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.75", margin: 0 }}>{priorityAnalysis.verdict.justification}</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}


    </Card>
  );
}

// ─── Traduction secteurs Yahoo (EN → FR) ─────────────────────────────────────
const SECTEUR_MAP = {
  "Healthcare":              "Santé",
  "Technology":              "Technologies",
  "Information Technology":  "Technologies",
  "Energy":                  "Énergie",
  "Financials":              "Finance",
  "Financial Services":      "Finance",
  "Consumer Cyclical":       "Conso. cyclique",
  "Consumer Defensive":      "Conso. de base",
  "Industrials":             "Industrie",
  "Basic Materials":         "Matières premières",
  "Real Estate":             "Immobilier",
  "Communication Services":  "Communication",
  "Utilities":               "Services publics",
  "Biotechnology":           "Biotechnologie",
  "Medical Devices":         "Santé",
  "Drug Manufacturers":      "Pharmacie",
  "Aerospace & Defense":     "Défense & Aéro",
  "Oil & Gas Equipment":     "Énergie",
  "Renewable Energy":        "Énergies renouv.",
  "Engineering & Construction": "Industrie",
  "Mixed-Asset Target Allocation": "ETF",
  "Europe Stock":                  "ETF Europe",
  "World Stock":                   "ETF Monde",
  "Global Large-Stock Blend":      "ETF Monde",
  "Diversified Emerging Mkts":     "ETF Émergents",
  "Emerging Markets":              "ETF Émergents",
  "Diversified Emerging Markets":  "ETF Émergents",
  "Specialty-Miscellaneous":       "ETF Spécialisé",
  "Specialty-Natural Resources":   "Matières premières",
  "Specialty-Energy":              "Énergie",
  "Specialty-Health":              "Santé",
  "Specialty-Technology":          "Technologies",
  "Hydrogen Economy":              "Hydrogène",
  "Renewable Energy":              "Énergies renouv.",
  "Specialty-Financials":          "Finance",
  "Chemicals":                     "Chimie",
  "Specialty":                     "ETF Spécialisé",
  "Utilities—Renewable":           "Énergies renouv.",
  "Medical Research Equipment":    "Santé",
};
function translateSecteur(raw) {
  if (!raw) return null;
  return SECTEUR_MAP[raw] || SECTEUR_MAP[raw.trim()] || raw;
}

// ─── Captures ─────────────────────────────────────────────────────────────────

function makeCapture(positions, account) {
  const ts      = new Date();
  const dateStr = ts.toISOString().slice(0, 10);
  const timeStr = ts.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const rows    = positions.map(p => {
    const cours  = p.dernierCours || p.pru;
    const valeur = cours * p.quantite;
    const pru    = p.pru;
    const pvEur  = (cours - pru) * p.quantite;
    const pvPct  = pru > 0 ? ((cours / pru) - 1) * 100 : 0;
    return { nom: p.nom, isin: p.isin || "", ticker: p.ticker || "", quantite: p.quantite, pru, cours, valeur, pvEur, pvPct: +pvPct.toFixed(2), secteur: p.secteur || "" };
  });
  const totalActuel  = rows.reduce((s, r) => s + r.valeur, 0);
  const totalInvesti = rows.reduce((s, r) => s + r.pru * r.quantite, 0);
  return {
    id: ts.getTime(),
    label: `${dateStr} ${timeStr}`,
    date: dateStr,
    time: timeStr,
    timestamp: ts.toISOString(),
    account,
    positions: rows,
    summary: {
      nbPositions: rows.length,
      totalActuel: +totalActuel.toFixed(2),
      totalInvesti: +totalInvesti.toFixed(2),
      totalPV: +(totalActuel - totalInvesti).toFixed(2),
      totalPVpct: totalInvesti > 0 ? +((totalActuel - totalInvesti) / totalInvesti * 100).toFixed(2) : 0,
    },
  };
}

function downloadCapture(capture, format = "json") {
  const slug = `capture_${capture.account}_${capture.date}_${capture.time.replace(":", "h")}`;
  if (format === "json") {
    const blob = new Blob([JSON.stringify(capture, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `${slug}.json` });
    a.click(); URL.revokeObjectURL(url);
  } else {
    const header = "Nom;ISIN;Ticker;Quantité;PRU (€);Cours (€);Valeur (€);P/V (€);P/V (%);Secteur\n";
    const rows   = capture.positions.map(r =>
      [r.nom, r.isin, r.ticker, r.quantite, r.pru, r.cours, r.valeur, r.pvEur.toFixed(2), r.pvPct, r.secteur].join(";")
    ).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href: url, download: `${slug}.csv` });
    a.click(); URL.revokeObjectURL(url);
  }
}

function CapturesPanel({ account }) {
  const [captures, setCaptures] = useState(() => load(CAPTURES_KEY, []));
  const [expanded, setExpanded] = useState(null);

  const accountCaptures = captures.filter(c => c.account === account);

  const deleteCapture = (id) => {
    const next = captures.filter(c => c.id !== id);
    save(CAPTURES_KEY, next);
    setCaptures(next);
    if (expanded === id) setExpanded(null);
  };
  const clearAll = () => { save(CAPTURES_KEY, captures.filter(c => c.account !== account)); setCaptures(captures.filter(c => c.account !== account)); setExpanded(null); };

  if (accountCaptures.length === 0) return (
    <div style={{ background: C.snowOff, border: `1px dashed ${C.border}`, borderRadius: "12px", padding: "28px 20px", textAlign: "center", marginBottom: "20px" }}>
      <div style={{ fontSize: "28px", marginBottom: "10px", opacity: 0.35 }}>📂</div>
      <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink, marginBottom: "4px" }}>Aucune capture</div>
      <div style={{ fontSize: "11px", color: C.inkMuted }}>Cliquez sur <strong>📸 Capturer</strong> pour enregistrer l'état du portefeuille à l'instant T.</div>
    </div>
  );

  return (
    <div style={{ marginBottom: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ fontSize: "11px", fontWeight: "700", color: C.ink, letterSpacing: "0.5px" }}>
          📂 Captures — {account}
          <span style={{ marginLeft: "8px", fontSize: "10px", fontWeight: "600", color: C.inkSubtle, background: C.snowOff, borderRadius: "5px", padding: "1px 7px" }}>{accountCaptures.length}</span>
        </div>
        <button onClick={clearAll} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "4px 10px", fontSize: "10px", color: C.inkSubtle, cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
          Tout supprimer
        </button>
      </div>

      {/* Liste */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {[...accountCaptures].reverse().map(cap => {
          const isOpen  = expanded === cap.id;
          const pv      = cap.summary.totalPV;
          const pvPct   = cap.summary.totalPVpct;
          const pvColor = pv >= 0 ? C.green : C.red;
          return (
            <div key={cap.id} style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", overflow: "hidden", boxShadow: shadow.card }}>
              {/* Row */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : cap.id)}>
                <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "16px" }}>📸</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{cap.label}</div>
                  <div style={{ fontSize: "10px", color: C.inkSubtle }}>{cap.summary.nbPositions} position{cap.summary.nbPositions > 1 ? "s" : ""}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: "800", color: C.ink }}>{fmtEur(cap.summary.totalActuel)}</div>
                  <div style={{ fontSize: "10px", fontWeight: "700", color: pvColor }}>{pv >= 0 ? "+" : ""}{fmtEur(pv)} ({pvPct >= 0 ? "+" : ""}{pvPct}%)</div>
                </div>
                <span style={{ fontSize: "10px", color: C.inkSubtle, marginLeft: "4px" }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* Détail déroulant */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: "6px", padding: "10px 14px", background: C.snowOff, flexWrap: "wrap" }}>
                    <button onClick={() => downloadCapture(cap, "json")}
                      style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "7px", padding: "6px 12px", fontSize: "11px", fontWeight: "700", color: C.navy, cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                      ↓ JSON
                    </button>
                    <button onClick={() => downloadCapture(cap, "csv")}
                      style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.15)`, borderRadius: "7px", padding: "6px 12px", fontSize: "11px", fontWeight: "700", color: C.green, cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                      ↓ CSV
                    </button>
                    <button onClick={() => deleteCapture(cap.id)}
                      style={{ marginLeft: "auto", background: "none", border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "7px", padding: "6px 12px", fontSize: "11px", fontWeight: "700", color: C.red, cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                      Supprimer
                    </button>
                  </div>

                  {/* Table positions */}
                  <div className="ba-tbl-scroll" style={{ overflowX: "auto" }}>
                    <div style={{ minWidth: "480px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 70px 80px 80px 70px", padding: "7px 14px", background: C.snowOff, borderBottom: `1px solid ${C.border}` }}>
                        {["Valeur","Qté","PRU","Cours","Valoris.","P/V %"].map(h => (
                          <div key={h} style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h}</div>
                        ))}
                      </div>
                      {cap.positions.map((r, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 70px 70px 80px 80px 70px", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{r.nom}</div>
                            {r.isin && <div style={{ fontSize: "9px", color: C.inkSubtle, fontFamily: "monospace" }}>{r.isin}</div>}
                          </div>
                          <div style={{ fontSize: "11px", color: C.inkMuted }}>{r.quantite}</div>
                          <div style={{ fontSize: "11px", color: C.inkMuted }}>{fmtCours(r.pru)}</div>
                          <div style={{ fontSize: "11px", color: C.navy, fontWeight: "600" }}>{fmtCours(r.cours)}</div>
                          <div style={{ fontSize: "11px", fontWeight: "700", color: C.ink }}>{fmtEur(r.valeur)}</div>
                          <div style={{ fontSize: "11px", fontWeight: "700", color: r.pvPct >= 0 ? C.green : C.red }}>{r.pvPct >= 0 ? "+" : ""}{r.pvPct}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Portfolio Tab ─────────────────────────────────────────────────────────────
function PortfolioTab({ profil, marketScores, marketScoringUi, onRunScoring, account = "PEA" }) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [allPositions, setAllPositions] = useState(() => sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
  const positions = allPositions.filter(p => (p.compte || "PEA") === account);
  const setPositions = (updater) => setAllPositions(prev => {
    const next = typeof updater === "function" ? updater(prev) : updater;
    save("bourse_portfolio", next);
    return next;
  });
  const [showForm, setShowForm]         = useState(false);
  const [editId, setEditId]             = useState(null);
  const [form, setForm]                 = useState({ nom: "", isin: "", pru: "", quantite: "", alerteHaute: "", alerteBasse: "", ticker: "", dateAchat: "", compte: account });
  const [alerts, setAlerts]             = useState([]);
  const [portSaved, setPortSaved]       = useState(false);
  const [fetchingIds, setFetchingIds]   = useState(new Set());
  const [fetchErrors, setFetchErrors]   = useState({});
  const [lastImport, setLastImport]     = useState(() => load("bourse_last_import", null));
  const [vueTableau, setVueTableau]       = useState(true);
  const [selectedPosId, setSelectedPosId] = useState(null);
  const [sortCol, setSortCol]             = useState(null);
  const [sortDir, setSortDir]             = useState("desc");
  const [showCaptures, setShowCaptures]   = useState(false);
  const [captureFlash, setCaptureFlash]   = useState(false);
  const captureCount = load(CAPTURES_KEY, []).filter(c => c.account === account).length;
  const [searchText, setSearchText]       = useState("");
  const [editCoursId, setEditCoursId]     = useState(null);
  const [editCoursVal, setEditCoursVal]   = useState("");
  const [sellSimPos, setSellSimPos]       = useState(null);
  const [vendreDisclaimer, setVendreDisclaimer] = useState(null); // { pos, resume }

  const positionsRef      = useRef(allPositions);
  const countRef          = useRef(null);
  const isFirstRender     = useRef(true);

  useEffect(() => { positionsRef.current = allPositions; }, [allPositions]);
  // Ref stable pour fetchAllCours (défini plus bas) — utilisé par le listener refreshCoursAll
  const fetchAllCoursRef = useRef(null);
  useEffect(() => {
    save("bourse_portfolio", allPositions);
    window.dispatchEvent(new CustomEvent("portfolioUpdated"));
  }, [allPositions]);

  // Auto-refresh au montage si des positions n'ont pas encore de cours
  useEffect(() => {
    const missing = positions.filter(p => !p.dernierCours || !p.lastFetch);
    if (missing.length > 0) {
      // Petit délai pour laisser fetchAllCoursRef se brancher (défini plus bas dans le même rendu)
      const t = setTimeout(() => fetchAllCoursRef.current?.(), 200);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setPortSaved(true);
    const t = setTimeout(() => setPortSaved(false), 2500);
    return () => clearTimeout(t);
  }, [positions]);

  const analyzePosition = useCallback(async (pos, forceRefresh = false) => {
    const cacheKey = pos.isin || pos.nom;
    if (!forceRefresh) {
      const cached = getCachedCours(cacheKey);
      if (cached) {
        setPositions(prev => prev.map(p => p.id === pos.id ? { ...p, dernierCours: cached, lastFetch: Date.now() } : p));
        return;
      }
    }
    setFetchingIds(prev => new Set([...prev, pos.id]));
    setFetchErrors(prev => { const n = { ...prev }; delete n[pos.id]; return n; });
    try {
      // Alpha Vantage en priorité (gratuit, fiable) — fallback Claude si indispo
      let cours = null;
      if (getKey("alphavantage")) {
        try {
          cours = await fetchCoursAlphaVantage(pos.nom, pos.isin);
        } catch (avErr) {
          console.warn("Alpha Vantage:", avErr.message, "→ fallback Claude");
        }
      }
      if (!cours) {
        const query = pos.isin
          ? `Cours actuel de ${pos.nom} ISIN ${pos.isin}. JSON: {"performance":{"cours_actuel":"32.140"}}`
          : `Cours actuel de ${pos.nom}. JSON: {"performance":{"cours_actuel":"32.140"}}`;
        const PRIX_PROMPT = `Tu es un assistant boursier. RÈGLE : appelle web_search("${pos.nom} ${pos.isin || ""} cours bourse") pour trouver le cours. Réponds UNIQUEMENT en JSON valide : {"performance":{"cours_actuel":"32.140"}} — point décimal, sans texte ni markdown.`;
        const data = await enqueueApi(() => callClaude(PRIX_PROMPT, query, true, 4, true));
        cours = parsePrice(data.performance?.cours_actuel);
      }
      if (cours && cours > 0 && (!pos.pru || cours < pos.pru * 50)) {
        setCachedCours(cacheKey, cours);
        setPositions(prev => prev.map(p => p.id === pos.id ? { ...p, dernierCours: cours, lastFetch: Date.now() } : p));
        const newAlerts = [];
        if (pos.alerteHaute && cours >= pos.alerteHaute) newAlerts.push({ nom: pos.nom, type: "OBJECTIF ATTEINT", color: C.green, cours, seuil: pos.alerteHaute });
        if (pos.alerteBasse && cours <= pos.alerteBasse) newAlerts.push({ nom: pos.nom, type: "STOP-LOSS ATTEINT", color: C.red, cours, seuil: pos.alerteBasse });
        if (newAlerts.length > 0) {
          setAlerts(prev => [...prev, ...newAlerts]);
          // Web Notifications
          if ("Notification" in window) {
            Notification.requestPermission().then(perm => {
              if (perm === "granted") {
                newAlerts.forEach(a => new Notification(`Bourse — ${a.nom}`, { body: `${a.type} · ${fmtCours(a.cours)} (seuil ${fmtCours(a.seuil)})`, icon: "/favicon.ico" }));
              }
            });
          }
        }
      } else {
        setFetchErrors(prev => ({ ...prev, [pos.id]: "Cours introuvable" }));
      }
    } catch (err) {
      setFetchErrors(prev => ({ ...prev, [pos.id]: err.message || "Erreur API" }));
    } finally {
      setFetchingIds(prev => { const n = new Set(prev); n.delete(pos.id); return n; });
    }
  }, []);

  const analyzeAllRef = useRef(analyzePosition);
  useEffect(() => { analyzeAllRef.current = analyzePosition; }, [analyzePosition]);


  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const totalActuel  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const totalPV      = totalActuel - totalInvesti;
  const totalPVpct   = totalInvesti > 0 ? (totalPV / totalInvesti) * 100 : 0;

  const openForm = (pos = null) => {
    setForm(pos
      ? { nom: pos.nom, isin: pos.isin || "", pru: pos.pru, quantite: pos.quantite,
          alerteHaute: pos.alerteHaute ?? "", alerteBasse: pos.alerteBasse ?? "",
          ticker: pos.ticker || "", dateAchat: pos.dateAchat || "", compte: pos.compte || account }
      : { nom: "", isin: "", pru: "", quantite: "", alerteHaute: "", alerteBasse: "", ticker: "", dateAchat: new Date().toISOString().slice(0,10), compte: account });
    setEditId(pos ? pos.id : null); setShowForm(true);
  };

  const savePosition = () => {
    if (!form.nom || !form.pru || !form.quantite) return;
    const existing = editId ? positions.find(p => p.id === editId) : null;
    const isinClean = form.isin.trim().toUpperCase().replace(/\s/g, "");
    const tickerClean = form.ticker?.trim().toUpperCase() || null;
    // Si ticker manuel fourni, mettre à jour le cache ISIN→ticker
    if (tickerClean && isinClean) {
      try {
        const cache = JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}");
        cache[isinClean] = tickerClean;
        localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(cache));
      } catch {}
    }
    const pos = {
      id: editId || Date.now(), nom: form.nom.trim(),
      isin: isinClean || null,
      ticker: tickerClean,
      compte: form.compte || account,
      pru: parsePrice(String(form.pru)) || parseFloat(String(form.pru).replace(",", ".")) || 0,
      quantite: parseInt(form.quantite) || 0,
      alerteHaute: form.alerteHaute !== "" ? parseFloat(String(form.alerteHaute).replace(",", ".")) : null,
      alerteBasse: form.alerteBasse !== "" ? parseFloat(String(form.alerteBasse).replace(",", ".")) : null,
      dateAchat: form.dateAchat || null,
      dernierCours: existing?.dernierCours ?? null,
      lastFetch: existing?.lastFetch ?? null,
    };
    setAllPositions(prev => {
      const next = editId ? prev.map(p => p.id === editId ? pos : p) : [...prev, pos];
      // Auto-analyse IA de toutes les lignes après ajout/modification
      window.dispatchEvent(new CustomEvent("runMarketScoring", { detail: { positions: next } }));
      return next;
    });
    // Si la position n'a pas de cours, déclencher la récupération automatiquement
    if (!pos.dernierCours) {
      setTimeout(() => fetchAllCoursRef.current?.(), 300);
    }
    setShowForm(false);
  };


  // ─── Import CSV ──────────────────────────────────────────────────────────────
  const importCsvRef = useRef(null);
  const [csvImportMsg, setCsvImportMsg]   = useState(null);
  const [csvPreview, setCsvPreview]       = useState(null);
  const [coursLoading, setCoursLoading]   = useState(false);
  const [flashIds, setFlashIds]           = useState({});  // { [id]: "green"|"red" }
  const [coursMsg, setCoursMsg]           = useState(null);

  // ─── Rafraîchir les cours via Yahoo Finance (0 crédit Claude) ──────────────
  const fetchAllCours = async () => {
    setCoursLoading(true); setCoursMsg(null);
    const cache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
    const errors = [];

    // Pré-remplir le cache avec les tickers manuels définis sur les positions
    for (const pos of positionsRef.current) {
      if (pos.isin && pos.ticker) cache[pos.isin] = pos.ticker;
    }

    // Étape 1 : résoudre les tickers non encore cachés (1 req par ISIN inconnu)
    const needTicker = positionsRef.current.filter(p => p.isin && !cache[p.isin]);
    await Promise.all(needTicker.map(async (pos) => {
      try {
        const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(pos.isin)}&quotesCount=3&newsCount=0`;
        const res = await fetchWithProxy(searchUrl, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const hits = (json?.quotes || []).filter(q => ["EQUITY", "ETF", "MUTUALFUND"].includes(q.quoteType));
        if (!hits.length) throw new Error("introuvable — renseigner le ticker manuellement");
        cache[pos.isin] = hits[0].symbol;
      } catch (e) {
        errors.push(`${pos.nom} : ${e.message}`);
      }
    }));
    try { localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(cache)); } catch {}

    // Étape 2 : une seule requête batch pour tous les tickers résolus
    const resolved = positionsRef.current.filter(p => p.isin && cache[p.isin]);
    if (resolved.length > 0) {
      try {
        const symbols = resolved.map(p => cache[p.isin]).join(",");
        const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
        const res = await fetchWithProxy(quoteUrl, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const qMap = {};
        for (const q of (json?.quoteResponse?.result || [])) qMap[q.symbol] = q;
        const newFlash = {};
        setPositions(prev => {
          const next = prev.map(p => {
            const sym = p.isin && cache[p.isin];
            if (!sym) return p;
            const q = qMap[sym];
            if (!q?.regularMarketPrice) { errors.push(`${p.nom} : cours indisponible`); return p; }
            const sectorRaw = q.sector || null;
            const secteur = sectorRaw ? translateSecteur(sectorRaw) : (p.secteur || ISIN_SECTEUR[p.isin] || null);
            if (p.dernierCours && q.regularMarketPrice !== p.dernierCours) {
              newFlash[p.id] = q.regularMarketPrice > p.dernierCours ? "green" : "red";
            }
            return { ...p, dernierCours: q.regularMarketPrice, intradayVariation: q.regularMarketChangePercent ?? null, lastFetch: Date.now(), dividendeAnnuel: q.trailingAnnualDividendRate ?? p.dividendeAnnuel ?? null, rendementDividende: q.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100 : (p.rendementDividende ?? null), ...(secteur && !p.secteur ? { secteur } : {}) };
          });
          if (Object.keys(newFlash).length > 0) {
            setFlashIds(newFlash);
            setTimeout(() => setFlashIds({}), 1500);
          }
          return next;
        });
      } catch (e) {
        errors.push(`Requête groupée : ${e.message}`);
      }
    }

    // Étape 3 : fetch secteur via assetProfile pour les positions sans secteur
    const needSecteur = positionsRef.current.filter(p => {
      const hasSecteur = p.secteur || ISIN_SECTEUR[p.isin];
      const ticker = p.isin && cache[p.isin];
      return !hasSecteur && ticker;
    });
    if (needSecteur.length > 0) {
      await Promise.all(needSecteur.map(async (pos) => {
        const ticker = cache[pos.isin];
        try {
          const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile,fundProfile`;
          const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
          const json = await res.json();
          const profile = json?.quoteSummary?.result?.[0];
          const sectorRaw = profile?.assetProfile?.sector || profile?.assetProfile?.industry || profile?.fundProfile?.categoryName || null;
          if (sectorRaw) {
            const secteur = translateSecteur(sectorRaw);
            setPositions(prev => prev.map(p => p.id === pos.id && !p.secteur ? { ...p, secteur } : p));
          }
        } catch {}
      }));
    }

    const okCount = resolved.length - errors.filter(e => !e.includes("introuvable")).length;
    setCoursMsg({
      ok: errors.length === 0,
      txt: `${okCount} cours mis à jour${errors.length ? ` · ${errors.length} erreur(s)` : ""}`,
      errors,
    });
    setTimeout(() => setCoursMsg(null), 6000);
    setCoursLoading(false);
  };

  // Branche la ref sur fetchAllCours pour que le listener "refreshCoursAll" appelle toujours la version à jour
  fetchAllCoursRef.current = fetchAllCours;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = () => fetchAllCoursRef.current?.();
    window.addEventListener("refreshCoursAll", handler);
    return () => window.removeEventListener("refreshCoursAll", handler);
  }, []); // [] = enregistré une seule fois ; la ref garantit la fraîcheur de la fonction

  const applyImport = (parsed) => {
    // Remplacement STRICT : le portefeuille devient exactement ce que contient le CSV.
    // Les alertes et l'id existants sont préservés pour les positions connues.
    const newAlerts = [];
    const next = parsed.map((r, i) => {
      const existing = positions.find(p => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase());
      if (existing?.alerteHaute && r.dernierCours && r.dernierCours >= existing.alerteHaute)
        newAlerts.push({ nom: r.nom, type: "OBJECTIF ATTEINT", color: C.green, cours: r.dernierCours, seuil: existing.alerteHaute });
      if (existing?.alerteBasse && r.dernierCours && r.dernierCours <= existing.alerteBasse)
        newAlerts.push({ nom: r.nom, type: "STOP-LOSS ATTEINT", color: C.red, cours: r.dernierCours, seuil: existing.alerteBasse });
      return {
        id:               existing?.id ?? (Date.now() + i),
        nom:              r.nom,
        isin:             r.isin              ?? existing?.isin ?? "",
        quantite:         r.quantite          ?? existing?.quantite ?? 0,
        pru:              r.pru               ?? existing?.pru ?? 0,
        dernierCours:     r.dernierCours      ?? existing?.dernierCours ?? 0,
        intradayVariation: r.intradayVariation ?? null,
        alerteHaute:      existing?.alerteHaute  ?? null,
        alerteBasse:      existing?.alerteBasse  ?? null,
        lastFetch:        Date.now(),
        compte:           account,
      };
    });
    const removed = positions.filter(p => !parsed.find(r => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase())).length;
    // Merge : garder les positions des autres comptes + remplacer celles du compte courant
    setAllPositions(prev => [...prev.filter(p => (p.compte || "PEA") !== account), ...next]);
    if (newAlerts.length > 0) {
      setAlerts(prev => [...prev, ...newAlerts]);
      if ("Notification" in window) {
        Notification.requestPermission().then(perm => {
          if (perm === "granted") newAlerts.forEach(a => new Notification(`Bourse — ${a.nom}`, { body: `${a.type} · ${fmtCours(a.cours)}`, icon: "/favicon.ico" }));
        });
      }
    }
    const now = Date.now(); setLastImport(now); save("bourse_last_import", now);
    const removedMsg = removed > 0 ? `, ${removed} supprimée(s)` : "";
    const alertMsg   = newAlerts.length > 0 ? ` — ⚠ ${newAlerts.length} alerte(s) !` : "";
    setCsvImportMsg({ ok: true, txt: `${parsed.length} positions importées${removedMsg}${alertMsg}` });
    setTimeout(() => setCsvImportMsg(null), 4000);
    setCsvPreview(null);
  };

  const handleCsvImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = parseBoursobankCSV(ev.target.result);
        if (!imported.length) { setCsvImportMsg({ ok: false, txt: "Aucune ligne reconnue dans le CSV." }); return; }
        const nouveaux = imported.filter(r => !positions.find(p => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase()));
        const updated  = imported.filter(r =>  positions.find(p => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase()));
        setCsvPreview({ parsed: imported, nouveaux, updated, file: file.name });
      } catch (err) {
        setCsvImportMsg({ ok: false, txt: "Erreur lecture CSV : " + err.message });
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };


  const inp = { background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "11px 16px", color: C.ink, fontSize: "13px", fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box", width: "100%", fontWeight: "500" };
  const lbl = { fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  const btnPrimary = { background: "linear-gradient(135deg, #111214 0%, #1E3A5F 100%)", border: "none", borderRadius: "50px", padding: "11px 22px", color: "#fff", fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 16px rgba(30,58,95,0.30)", letterSpacing: "0.02em" };
  const btnSecondary = (active) => ({ background: active ? C.redLight : C.snowOff, border: `1px solid ${active ? "rgba(220,38,38,0.2)" : C.border}`, borderRadius: "50px", padding: "11px 18px", color: active ? C.red : C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "600", cursor: "pointer" });

  return (
    <>
    <div>
      {/* Alertes */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ background: a.color === C.green ? C.greenLight : C.redLight, border: `1px solid ${a.color === C.green ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)"}`, borderRadius: "8px", padding: "12px 16px", marginBottom: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: a.color, fontWeight: "700" }}>🔔 {a.nom} · {a.type} ({fmtEur(a.cours)} / seuil {fmtEur(a.seuil)})</span>
              <button onClick={() => setAlerts(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.inkMuted, cursor: "pointer", fontSize: "16px" }}>✕</button>
            </div>
          ))}
        </div>
      )}


      {/* Toolbar */}
      <div className="ba-toolbar" style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => openForm()} style={btnPrimary}>+ Ajouter</button>

        <input ref={importCsvRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleCsvImport} />
        <button onClick={() => importCsvRef.current?.click()}
          style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "8px", padding: "9px 16px", color: C.goldDark, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer" }}>
          {isMobile ? "↑ CSV" : "↑ Import CSV"}
        </button>

        <button
          onClick={() => onRunScoring && onRunScoring(positions)}
          disabled={marketScoringUi === UI.LOADING || positions.length === 0}
          style={{ background: marketScoringUi === UI.LOADING ? C.snowOff : C.navyLight, border: `1px solid ${marketScoringUi === UI.LOADING ? C.border : "rgba(30,58,95,0.12)"}`, borderRadius: "8px", padding: "9px 16px", color: marketScoringUi === UI.LOADING ? C.inkSubtle : C.navy, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: marketScoringUi === UI.LOADING || positions.length === 0 ? "not-allowed" : "pointer" }}>
          {marketScoringUi === UI.LOADING ? <span style={{ display:"inline-flex", alignItems:"center", gap:"6px" }}><ThinkingSpinner size={13} color={C.inkSubtle} /> Analyse…</span> : isMobile ? "🤖" : "🤖 Analyser toutes mes lignes"}
        </button>

        {/* Bouton Capturer */}
        {positions.length > 0 && (
          <button
            onClick={() => {
              const cap = makeCapture(positions, account);
              const all = load(CAPTURES_KEY, []);
              save(CAPTURES_KEY, [...all, cap].slice(-100));
              downloadCapture(cap, "json");
              setCaptureFlash(true);
              setTimeout(() => setCaptureFlash(false), 1800);
              setShowCaptures(true);
            }}
            style={{ background: captureFlash ? "rgba(5,150,105,0.12)" : C.snowOff, border: `1px solid ${captureFlash ? "rgba(5,150,105,0.3)" : C.border}`, borderRadius: "8px", padding: "9px 14px", color: captureFlash ? C.green : C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer", transition: "all 0.3s ease", whiteSpace: "nowrap" }}>
            {captureFlash ? "✓ Capturé" : `📸${captureCount > 0 ? ` ${captureCount}` : ""}`}
          </button>
        )}

        {/* Voir les captures */}
        {captureCount > 0 && !showCaptures && (
          <button onClick={() => setShowCaptures(true)}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 14px", color: C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer", whiteSpace: "nowrap" }}>
            📂{isMobile ? "" : " Voir"}
          </button>
        )}

        <div style={{ marginLeft: "auto" }} />

        {/* Statut — ligne séparée sur mobile */}
        <div className="ba-toolbar-status">
          {coursMsg
            ? <span style={{ color: coursMsg.ok ? C.green : C.red, fontWeight: "600" }}>{coursMsg.ok ? "✓ " : "⚠ "}{coursMsg.txt}</span>
            : csvImportMsg
              ? <span style={{ color: csvImportMsg.ok ? C.green : C.red, fontWeight: "600" }}>{csvImportMsg.ok ? "✓ " : "⚠ "}{csvImportMsg.txt}</span>
              : lastImport
                ? <span style={{ color: C.inkSubtle }}>{`Import ${new Date(lastImport).toLocaleDateString("fr-FR")}`}</span>
                : <span style={{ color: C.inkSubtle }}>Aucun import</span>
          }
          {portSaved && <span style={{ color: C.green, fontWeight: "600", marginLeft: "8px" }}>✓ Sauvegardé</span>}
        </div>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "20px", marginBottom: "16px", boxShadow: shadow.card }}>
          <div style={{ fontSize: "12px", color: C.ink, fontWeight: "700", letterSpacing: "0.5px", marginBottom: "16px" }}>{editId ? "Modifier la position" : "Nouvelle position"}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "2fr 1.5fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <div style={ isMobile ? { gridColumn: "1 / -1" } : {}}><label style={lbl}>Action / ETF</label><input style={inp} placeholder="Technip Energies" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} data-gramm="false" spellCheck="false" /></div>
            <div style={ isMobile ? { gridColumn: "1 / -1" } : {}}><label style={lbl}>ISIN (optionnel)</label><input style={inp} placeholder="FR0014000MR3" value={form.isin} onChange={e => setForm(f => ({ ...f, isin: e.target.value }))} data-gramm="false" spellCheck="false" /></div>
            <div><label style={lbl}>PRU (€)</label><input style={inp} placeholder="32.14" value={form.pru} onChange={e => setForm(f => ({ ...f, pru: e.target.value }))} /></div>
            <div><label style={lbl}>Quantité</label><input style={inp} placeholder="11" value={form.quantite} onChange={e => setForm(f => ({ ...f, quantite: e.target.value }))} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            <div><label style={lbl}>Objectif / Alerte haute (€)</label><input style={inp} placeholder="Optionnel" value={form.alerteHaute} onChange={e => setForm(f => ({ ...f, alerteHaute: e.target.value }))} /></div>
            <div><label style={lbl}>Stop-loss / Alerte basse (€)</label><input style={inp} placeholder="Optionnel" value={form.alerteBasse} onChange={e => setForm(f => ({ ...f, alerteBasse: e.target.value }))} /></div>
            <div>
              <label style={lbl}>Ticker Yahoo Finance <span style={{ color: C.inkSubtle, fontWeight: "500", textTransform: "none", letterSpacing: 0 }}>(si non trouvé auto)</span></label>
              <input style={inp} placeholder="ex: ALSMA.PA" value={form.ticker || ""} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))} data-gramm="false" spellCheck="false" />
            </div>
            <div>
              <label style={lbl}>Date d'achat</label>
              <input style={inp} type="date" value={form.dateAchat || ""} onChange={e => setForm(f => ({ ...f, dateAchat: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={savePosition} style={btnPrimary}>Enregistrer</button>
            <button onClick={() => setShowForm(false)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 18px", color: C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Modal preview CSV */}
      {csvPreview && (
        <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "10px", padding: "16px 18px", marginBottom: "16px", boxShadow: shadow.card }}>
          <div style={{ fontSize: "12px", fontWeight: "800", color: C.navy, marginBottom: "6px" }}>Aperçu import CSV — {csvPreview.file}</div>
          <div style={{ fontSize: "10px", color: C.inkMuted, marginBottom: "10px" }}>Le portefeuille sera <strong>remplacé</strong> par les {csvPreview.parsed.length} positions du CSV. Les alertes existantes sont conservées.</div>
          <div style={{ display: "flex", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: C.green, fontWeight: "700" }}>✓ {csvPreview.updated.length} position(s) existante(s)</span>
            {csvPreview.nouveaux.length > 0 && <span style={{ fontSize: "11px", color: C.navy, fontWeight: "700" }}>+ {csvPreview.nouveaux.length} nouvelle(s)</span>}
            {positions.filter(p => !csvPreview.parsed.find(r => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase())).length > 0 &&
              <span style={{ fontSize: "11px", color: C.red, fontWeight: "700" }}>
                − {positions.filter(p => !csvPreview.parsed.find(r => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase())).length} supprimée(s)
              </span>}
          </div>
          <div style={{ maxHeight: "160px", overflowY: "auto", background: C.snow, borderRadius: "8px", marginBottom: "12px" }}>
            {csvPreview.parsed.map((r, i) => {
              const isNew = !positions.find(p => (r.isin && r.isin === p.isin) || r.nom.toLowerCase() === p.nom.toLowerCase());
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px 80px 60px", padding: "6px 12px", borderBottom: `1px solid ${C.border}`, fontSize: "11px", background: isNew ? "#F0FFF4" : "transparent" }}>
                  <span style={{ fontWeight: "600", color: C.ink }}>{r.nom}{isNew && <span style={{ marginLeft: "6px", fontSize: "9px", color: C.green, fontWeight: "800" }}>NOUVEAU</span>}</span>
                  <span style={{ color: C.inkSubtle, fontFamily: "monospace", fontSize: "9px" }}>{r.quantite ?? "—"}</span>
                  <span style={{ color: C.inkSubtle, fontWeight: "600" }}>PRU {r.pru ? fmtCours(r.pru) : "—"}</span>
                  <span style={{ color: C.navy, fontWeight: "700" }}>{r.dernierCours ? fmtCours(r.dernierCours) : "—"}</span>
                  <span style={{ color: r.intradayVariation >= 0 ? C.green : C.red, fontWeight: "600" }}>{r.intradayVariation != null ? `${r.intradayVariation >= 0 ? "+" : ""}${r.intradayVariation.toFixed(2)}%` : ""}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => applyImport(csvPreview.parsed)}
              style={{ background: C.navy, border: "none", borderRadius: "8px", padding: "8px 18px", color: C.snow, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer" }}>
              Appliquer l'import
            </button>
            <button onClick={() => setCsvPreview(null)}
              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 16px", color: C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Panel Captures */}
      {showCaptures && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
            <button
              onClick={() => setShowCaptures(false)}
              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 14px", color: C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "600", cursor: "pointer" }}>
              ✕ Fermer
            </button>
          </div>
          <CapturesPanel account={account} />
        </div>
      )}

      {/* Liste positions */}
      <div style={{ marginBottom: "24px" }}>
        {positions.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px", color: C.inkSubtle, fontSize: "13px", background: C.snowOff, borderRadius: "10px", border: `1px solid ${C.border}` }}>Aucune position · Cliquez sur + Ajouter</div>
        )}

        {/* Barre recherche + export CSV */}
        {positions.length > 0 && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={searchText} onChange={e => setSearchText(e.target.value)}
              placeholder="🔍 Rechercher une valeur…"
              style={{ flex: 1, minWidth: "160px", fontSize: "12px", fontFamily: "Inter, sans-serif", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 12px", background: C.snow, color: C.ink, outline: "none" }}
            />
            <button onClick={() => {
              const cols = ["Nom","ISIN","PRU (€)","Quantité","Cours (€)","Valeur (€)","P/V %","Poids %"];
              const rows = positions.map(p => {
                const cours = p.dernierCours || p.pru;
                const valeur = cours * p.quantite;
                const invest = p.pru * p.quantite;
                const pvPct = invest > 0 ? ((valeur - invest) / invest * 100).toFixed(2) : "0";
                const poids = totalActuel > 0 ? (valeur / totalActuel * 100).toFixed(2) : "0";
                return [p.nom, p.isin || "", p.pru, p.quantite, cours, valeur.toFixed(2), pvPct, poids];
              });
              const csv = [cols, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url;
              a.download = `portefeuille_${new Date().toISOString().slice(0,10)}.csv`;
              a.click(); URL.revokeObjectURL(url);
            }} style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 14px", fontSize: "11px", fontFamily: "Inter, sans-serif", fontWeight: "700", color: C.inkMuted, cursor: "pointer", whiteSpace: "nowrap" }}>
              ↓ Export CSV
            </button>
          </div>
        )}

        {/* Vue Tableau enrichi */}
        {positions.length > 0 && (() => {
          const toggleSort = (col) => {
            if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
            else { setSortCol(col); setSortDir("desc"); }
          };
          const sortIcon = (col) => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

          let displayPos = [...positions];
          if (searchText.trim()) {
            const q = searchText.toLowerCase();
            displayPos = displayPos.filter(p => p.nom.toLowerCase().includes(q) || (p.isin || "").toLowerCase().includes(q));
          }
          if (sortCol) {
            displayPos.sort((a, b) => {
              const ca = a.dernierCours || a.pru, cb = b.dernierCours || b.pru;
              const va = ca * a.quantite, vb = cb * b.quantite;
              const ia = a.pru * a.quantite, ib = b.pru * b.quantite;
              const map = { nom: [a.nom, b.nom], cours: [ca, cb], pru: [a.pru, b.pru], quantite: [a.quantite, b.quantite], investi: [ia, ib], valeur: [va, vb], pv: [(va-ia)/Math.max(ia,1), (vb-ib)/Math.max(ib,1)], poids: [va, vb] };
              const [av, bv] = map[sortCol] || [0, 0];
              const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
              return sortDir === "asc" ? cmp : -cmp;
            });
          }

          const totValeur  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
          const totInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
          const totPV      = totValeur - totInvesti;
          const totPVpct   = totInvesti > 0 ? (totPV / totInvesti) * 100 : 0;

          const th = { fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };
          const COL = "minmax(180px,1fr) 88px 68px 46px 82px 84px 95px 90px";

          return (
            <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "18px", boxShadow: shadow.card, marginBottom: "14px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <div style={{ minWidth: "860px" }}>
                {/* En-têtes */}
                <div style={{ display: "grid", gridTemplateColumns: COL, borderBottom: `1px solid ${C.border}`, padding: "9px 14px", background: C.snowOff, borderRadius: "18px 18px 0 0", gap: "6px" }}>
                  <div style={th} onClick={() => toggleSort("nom")}>Valeur{sortIcon("nom")}</div>
                  <div style={th} onClick={() => toggleSort("cours")}>Cours{sortIcon("cours")}</div>
                  <div style={th} onClick={() => toggleSort("pru")}>PRU{sortIcon("pru")}</div>
                  <div style={th} onClick={() => toggleSort("quantite")}>Qté{sortIcon("quantite")}</div>
                  <div style={th} onClick={() => toggleSort("investi")}>Investi{sortIcon("investi")}</div>
                  <div style={th} onClick={() => toggleSort("valeur")}>Valeur €{sortIcon("valeur")}</div>
                  <div style={th} onClick={() => toggleSort("pv")}>P/V{sortIcon("pv")}</div>
                  <div style={th}>Actions</div>
                </div>

                {/* Lignes */}
                {displayPos.map(pos => {
                  const cours  = pos.dernierCours || pos.pru;
                  const valeur = cours * pos.quantite;
                  const invest = pos.pru * pos.quantite;
                  const pv     = valeur - invest;
                  const pvPct  = invest > 0 ? pv / invest * 100 : 0;
                  const poids  = totalActuel > 0 ? valeur / totalActuel * 100 : 0;
                  const etf    = isETFName(pos.nom);
                  const sigEntry = marketScores?.find(s => s.isin === pos.isin || s.nom === pos.nom);
                  const sig    = sigEntry?.signal || "";
                  const sigColor = sig === "ACHAT" ? C.green : sig === "RENFORCER" ? C.navy : sig === "VENDRE" ? "#7B1111" : sig === "PRUDENCE" ? C.red : C.goldDark;
                  const concentration = !etf && poids > 20;
                  const euronextUrl = pos.isin ? getEuronextUrl(pos.isin, pos.nom) : null;
                  return (
                    <div key={pos.id} onClick={() => setSelectedPosId(selectedPosId === pos.id ? null : pos.id)}
                      style={{ display: "grid", gridTemplateColumns: COL, alignItems: "center", padding: "10px 14px", gap: "6px", borderBottom: `1px solid ${C.border}`, background: selectedPosId === pos.id ? C.navyLight : concentration ? "#FFF8F5" : "transparent", cursor: "pointer", transition: "background 0.1s", animation: flashIds[pos.id] ? `flash${flashIds[pos.id] === "green" ? "Green" : "Red"} 1.5s ease-out` : "none" }}>

                      {/* Nom + avatar + signal + 📰 */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, overflow: "hidden" }}>
                        <div style={{ flexShrink: 0 }}><CompanyAvatar nom={pos.nom} isin={pos.isin} size={26} /></div>
                        <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: pos.nom.length > 35 ? "9px" : pos.nom.length > 22 ? "10px" : "11px", fontWeight: "700", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {pos.nom}{concentration && <span style={{ fontSize: "8px", color: C.red, marginLeft: "3px" }}>⚠</span>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px", flexWrap: "nowrap", overflow: "hidden" }}>
                            {pos.isin && <span style={{ fontSize: "8px", color: C.inkSubtle, fontWeight: "500", letterSpacing: "0.3px", flexShrink: 0 }}>{pos.isin}</span>}
                            {sig && <span style={{ fontSize: "8px", fontWeight: "700", color: sigColor, background: sigColor + "18", borderRadius: "3px", padding: "1px 4px", whiteSpace: "nowrap", flexShrink: 0 }}>{sig}</span>}
                            <button onClick={e => { e.stopPropagation(); openLink(yahooFinanceUrl(pos)); }} title="Actualités Yahoo Finance"
                              style={{ background: "#5F01D1", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "10px", fontWeight: "700", color: "#fff", fontFamily: "Inter,sans-serif", padding: "2px 6px", lineHeight: "16px", whiteSpace: "nowrap", flexShrink: 0 }}>
                              Yahoo
                            </button>
                            {euronextUrl && <a href={euronextUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              style={{ background: "#003087", border: "none", borderRadius: "4px", padding: "2px 6px", color: "#fff", fontSize: "10px", fontWeight: "700", textDecoration: "none", lineHeight: "16px", whiteSpace: "nowrap", flexShrink: 0 }}>Euronext</a>}
                          </div>
                        </div>
                      </div>

                      {/* Cours + variation */}
                      <div onClick={e => { e.stopPropagation(); setEditCoursId(pos.id); setEditCoursVal(String(cours)); }} style={{ cursor: "text" }}>
                        {editCoursId === pos.id
                          ? <input autoFocus value={editCoursVal}
                              style={{ width: "72px", fontSize: "12px", fontFamily: "Inter, sans-serif", color: C.navy, border: `1px solid ${C.navy}`, borderRadius: "4px", padding: "1px 5px", background: C.snowOff, outline: "none" }}
                              onChange={e => setEditCoursVal(e.target.value)}
                              onBlur={() => { const v = parseFloat(editCoursVal.replace(",",".")); if (v > 0) setPositions(prev => prev.map(p => p.id === pos.id ? { ...p, dernierCours: v, lastFetch: Date.now() } : p)); setEditCoursId(null); }}
                              onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditCoursId(null); }} />
                          : <>
                              <div style={{ fontSize: "12px", color: C.navy, fontWeight: "700" }}>{fmtCours(cours)}</div>
                              {pos.intradayVariation != null && <div style={{ fontSize: "9px", fontWeight: "700", color: pos.intradayVariation >= 0 ? C.green : C.red }}>{pos.intradayVariation >= 0 ? "+" : ""}{pos.intradayVariation.toFixed(2)}%</div>}
                            </>
                        }
                      </div>

                      <div style={{ fontSize: "12px", color: C.inkMuted }}>{fmtCours(pos.pru)}</div>
                      <div style={{ fontSize: "12px", color: C.inkMuted, fontWeight: "600" }}>{pos.quantite}</div>
                      <div style={{ fontSize: "12px", color: C.inkMuted }}>{fmtEur(invest)}</div>

                      {/* Valeur totale */}
                      <div style={{ fontSize: "12px", color: C.navy, fontWeight: "700" }}>{fmtEur(valeur)}</div>

                      {/* P/V */}
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: "700", color: pv >= 0 ? C.green : C.red }}>{pv >= 0 ? "+" : ""}{pvPct.toFixed(1)}%</div>
                        <div style={{ fontSize: "9px", color: pv >= 0 ? C.green : C.red }}>{pv >= 0 ? "+" : ""}{fmtEur(pv)}</div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                        <button onClick={e => { e.stopPropagation(); setSellSimPos(pos); }}
                          style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "6px", padding: "5px 8px", color: C.greenDark, fontSize: "10px", fontFamily: "Inter,sans-serif", cursor: "pointer", fontWeight: "700" }}>€</button>
                        <button onClick={e => { e.stopPropagation(); openForm(pos); }}
                          style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 8px", color: C.inkMuted, fontSize: "10px", fontFamily: "Inter,sans-serif", cursor: "pointer" }}>✏</button>
                        <button onClick={e => { e.stopPropagation(); if (window.confirm(`Supprimer ${pos.nom} ?`)) setPositions(prev => prev.filter(p => p.id !== pos.id)); }}
                          style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "6px", padding: "5px 8px", color: C.red, fontSize: "10px", fontFamily: "Inter,sans-serif", cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                  );
                })}

                {/* Totaux */}
                <div style={{ display: "grid", gridTemplateColumns: COL, padding: "10px 14px", gap: "6px", background: C.snowOff, borderTop: `2px solid ${C.border}`, borderRadius: "0 0 18px 18px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: C.ink }}>TOTAL · {positions.length} position{positions.length > 1 ? "s" : ""}</div>
                  <div />
                  <div />
                  <div />
                  <div style={{ fontSize: "11px", fontWeight: "700", color: C.inkMuted }}>{fmtEur(totInvesti)}</div>
                  <div style={{ fontSize: "12px", fontWeight: "800", color: C.navy }}>{fmtEur(totValeur)}</div>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: "800", color: totPV >= 0 ? C.green : C.red }}>{totPV >= 0 ? "+" : ""}{totPVpct.toFixed(1)}%</div>
                    <div style={{ fontSize: "9px", color: totPV >= 0 ? C.green : C.red }}>{totPV >= 0 ? "+" : ""}{fmtEur(totPV)}</div>
                  </div>
                  <div />
                </div>
              </div>
            </div>
          );
        })()}

        {/* Drawer backdrop */}
        {selectedPosId && (
          <div onClick={() => setSelectedPosId(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 200, backdropFilter: "blur(3px)", transition: "opacity 0.2s" }} />
        )}
        {/* Drawer droit */}
        <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "460px", maxWidth: "100vw", zIndex: 201, background: "#F8F9FA", borderLeft: `1px solid ${C.border}`, boxShadow: "-16px 0 60px rgba(0,0,0,0.12)", overflowY: "auto", transform: selectedPosId ? "translateX(0)" : "translateX(100%)", transition: "transform 0.30s cubic-bezier(0.4,0,0.2,1)", display: "flex", flexDirection: "column" }}>
          {selectedPosId && (() => {
            const pos = positions.find(p => p.id === selectedPosId);
            if (!pos) return null;
            const cours = pos.dernierCours || pos.pru;
            const pvPct = pos.pru > 0 ? (cours - pos.pru) / pos.pru * 100 : 0;
            const up    = pvPct >= 0;
            return (
              <>
                {/* En-tête sticky */}
                <div style={{ padding: "16px 20px", background: "rgba(255,255,255,0.90)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "14px", flexShrink: 0, position: "sticky", top: 0, zIndex: 10 }}>
                  <CompanyAvatar nom={pos.nom} isin={pos.isin} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pos.nom.toUpperCase()}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "5px", flexWrap: "wrap" }}>
                      {pos.isin && <span style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", background: C.snowDim, borderRadius: "5px", padding: "2px 7px", letterSpacing: "0.6px" }}>{pos.isin}</span>}
                      {pos.ticker && <span style={{ fontSize: "9px", color: C.accent, fontWeight: "700", background: "rgba(30,58,95,0.08)", borderRadius: "5px", padding: "2px 7px" }}>{pos.ticker}</span>}
                      <span style={{ fontSize: "11px", fontWeight: "800", color: up ? C.green : C.red }}>{up ? "+" : ""}{pvPct.toFixed(2)}%</span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedPosId(null)} style={{ flexShrink: 0, width: "32px", height: "32px", borderRadius: "10px", background: C.snowDim, border: "none", color: C.inkMuted, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>
                <LiveMarketPanel key={selectedPosId} pos={pos} onClose={() => setSelectedPosId(null)} />
              </>
            );
          })()}
        </div>

        {/* Vue Cartes — désactivée, remplacée par le tableau enrichi */}
        {false && <div style={isTablet ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" } : {}}>
        {positions.map(pos => {
          const cours  = pos.dernierCours || pos.pru;
          const valeur = cours * pos.quantite;
          const invest = pos.pru * pos.quantite;
          const pv     = valeur - invest;
          const pvPct  = invest > 0 ? (pv / invest) * 100 : 0;
          const poids  = totalActuel > 0 ? (valeur / totalActuel) * 100 : 0;
          const etf    = isETFName(pos.nom);
          // Alerte concentration : small-cap > 20% du portefeuille
          const alerteConcentration = !etf && poids > 20;
          const MARGIN = 0.03;
          let badge = null;
          if (pos.dernierCours) {
            if (pos.alerteHaute && pos.dernierCours >= pos.alerteHaute) badge = { label: "▲ Objectif", bg: C.greenLight, border: "rgba(5,150,105,0.2)", color: C.green };
            else if (pos.alerteHaute && pos.dernierCours >= pos.alerteHaute * (1 - MARGIN)) badge = { label: "≈ Objectif", bg: C.goldLight, border: "rgba(217,119,6,0.2)", color: C.goldDark };
            else if (pos.alerteBasse && pos.dernierCours <= pos.alerteBasse) badge = { label: "▼ Stop", bg: C.redLight, border: "rgba(220,38,38,0.2)", color: C.red };
            else if (pos.alerteBasse && pos.dernierCours <= pos.alerteBasse * (1 + MARGIN)) badge = { label: "≈ Stop", bg: C.redLight, border: "rgba(220,38,38,0.2)", color: C.red };
          }
          const isFetching = fetchingIds.has(pos.id);
          const fetchError = fetchErrors[pos.id];
          const ia = marketScores?.find(s => s.isin === pos.isin || s.nom === pos.nom);
          const sigColor = !ia?.signal ? null : ia.signal === "ACHAT" ? C.green : ia.signal === "RENFORCER" ? C.navy : ia.signal === "VENDRE" ? "#FF0000" : ia.signal === "PRUDENCE" ? C.red : C.goldDark;
          const borderAccent = pv >= 0 ? C.green : C.red;
          return (
            <SwipeableCard key={pos.id} disabled={!isMobile}
              onSwipeLeft={() => { if (window.confirm(`Supprimer ${pos.nom} ?`)) setPositions(prev => prev.filter(p => p.id !== pos.id)); }}>
            <div style={{ background: pv >= 0 ? C.cardGradGreen : C.cardGradRed, border: `1px solid ${C.border}`, borderLeft: `5px solid ${borderAccent}`, borderRadius: "18px", marginBottom: isTablet ? "0" : "14px", boxShadow: shadow.card, overflow: "hidden", transition: "border-color 0.3s, box-shadow 0.2s", animation: flashIds[pos.id] ? `flash${flashIds[pos.id] === "green" ? "Green" : "Red"} 1.5s ease-out` : "none" }}>
              {/* ── En-tête ── */}
              <div style={{ padding: isMobile ? "18px 16px 14px" : "16px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                {/* Gauche : logo + nom + badges */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minWidth: 0 }}>
                  <CompanyAvatar nom={pos.nom} isin={pos.isin} size={isMobile ? 38 : 34} />
                  <span style={{ fontSize: isMobile ? "17px" : "15px", fontWeight: "800", color: C.ink, letterSpacing: "-0.3px" }}>{pos.nom}</span>
                  {pos.isin && <span style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "4px", padding: "2px 6px", letterSpacing: "0.8px", whiteSpace: "nowrap" }}>{pos.isin}</span>}
                  {/* Signal IA marché */}
                  {(() => {
                    if (!ia?.signal) {
                      if (marketScoringUi === UI.ERROR) return <span style={{ fontSize: "10px", color: C.red, fontStyle: "italic" }}>⚠ signal indisponible</span>;
                      if (marketScoringUi === UI.LOADING) return <span style={{ display:"inline-flex", alignItems:"center", gap:"4px", fontSize: "10px", color: C.inkSubtle }}><ThinkingSpinner size={11} color={C.inkSubtle} /> analyse…</span>;
                      return null;
                    }
                    if (ia.signal === "VENDRE") return (
                      <span onClick={() => setVendreDisclaimer({ pos, resume: ia.resume || "" })} style={{ fontSize: "10px", fontWeight: "900", color: "#FF0000", background: "#1A0000", border: "1.5px solid #FF0000", borderRadius: "5px", padding: "2px 8px", letterSpacing: "1px", cursor: "pointer", whiteSpace: "nowrap", animation: "vendreAlarm 0.8s ease-in-out infinite", boxShadow: "0 0 8px #FF000066" }}>
                        🚨 VENDRE
                      </span>
                    );
                    return <span title={ia.resume || ""} style={{ fontSize: "10px", fontWeight: "800", color: sigColor, background: sigColor + "18", border: `1px solid ${sigColor}40`, borderRadius: "5px", padding: "2px 8px", letterSpacing: "0.5px", cursor: "default", whiteSpace: "nowrap" }}>{ia.signal}</span>;
                  })()}
                  {badge && <span style={{ background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: "5px", padding: "2px 8px", fontSize: "10px", color: badge.color, fontWeight: "700", whiteSpace: "nowrap" }}>{badge.label}</span>}
                  {alerteConcentration && <span style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "5px", padding: "2px 8px", fontSize: "10px", color: C.red, fontWeight: "700", whiteSpace: "nowrap" }}>⚠ {poids.toFixed(0)}% concentr.</span>}
                </div>
                {/* Droite : cours + P/V + actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    {pos.dernierCours
                      ? <div style={{ fontSize: isMobile ? "20px" : "17px", fontWeight: "800", color: C.navy, letterSpacing: "-0.5px" }}>{fmtCours(pos.dernierCours)}</div>
                      : <div style={{ fontSize: isMobile ? "15px" : "13px", fontWeight: "600", color: C.inkSubtle }}>{isFetching ? "…" : "— €"}</div>}
                    {/* Variation du jour (CSV) */}
                    {pos.intradayVariation != null
                      ? <div style={{ fontSize: "11px", fontWeight: "700", color: pos.intradayVariation >= 0 ? C.green : C.red }}>
                          {pos.intradayVariation >= 0 ? "+" : ""}{pos.intradayVariation.toFixed(2)}% J {pos.intradayVariation >= 0 ? "▲" : "▼"}
                        </div>
                      : <div style={{ fontSize: "11px", fontWeight: "700", color: pv >= 0 ? C.green : C.red }}>
                          {pv >= 0 ? "+" : ""}{pvPct.toFixed(1)}% tot {pv >= 0 ? "▲" : "▼"}
                        </div>
                    }
                  </div>
                  <div style={{ width: "1px", height: "32px", background: C.border }} />
                  <div style={{ display: "flex", gap: "5px" }}>
                    {pos.isin && (() => {
                      const url = getEuronextUrl(pos.isin, pos.nom);
                      return (
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          style={{ background: "#003087", border: "none", borderRadius: "8px", padding: "7px 14px", color: "#fff", fontSize: "12px", fontWeight: "700", textDecoration: "none" }}>
                          Euronext
                        </a>
                      );
                    })()}
                    <button onClick={e => { e.stopPropagation(); openLink(yahooFinanceUrl(pos)); }} title="Actualités Yahoo Finance" style={{ background: "#5F01D1", border: "none", borderRadius: "8px", padding: "7px 14px", color: "#fff", fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer", fontWeight: "700" }}>Yahoo Finance</button>
                    <button onClick={() => setSellSimPos(pos)} title="Simuler une vente" style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "8px", padding: "7px 12px", color: C.greenDark, fontSize: "11px", fontFamily: "Inter, sans-serif", cursor: "pointer", fontWeight: "700" }}>€ Vendre</button>
                    <button onClick={() => openForm(pos)} style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "7px 12px", color: C.inkMuted, fontSize: "11px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>✏</button>
                    <button onClick={() => setPositions(prev => prev.filter(p => p.id !== pos.id))} style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "7px 12px", color: C.red, fontSize: "11px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              </div>

              {/* ── Métriques ── */}
              <div style={{ padding: "12px 20px", display: "flex", gap: "0", flexWrap: "wrap" }}>
                {[
                  { label: "PRU", value: fmtCours(pos.pru), color: C.inkMuted },
                  { label: "Titres", value: String(pos.quantite), color: C.ink },
                  { label: "Investi", value: fmtEur(invest), color: C.ink },
                  { label: "Valeur", value: fmtEur(valeur), color: C.navy, bold: true },
                  { label: "P/V €", value: `${pv >= 0 ? "+" : ""}${fmtEur(pv)}`, color: pv >= 0 ? C.green : C.red, bold: true },
                  { label: "Poids", value: `${poids.toFixed(1)}%`, color: C.ink },
                ].map((m, i) => (
                  <div key={i} style={{ flex: "1 1 80px", minWidth: "70px", padding: "6px 10px", borderRight: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "3px" }}>{m.label}</div>
                    <div style={{ fontSize: "12px", fontWeight: m.bold ? "700" : "600", color: m.color, whiteSpace: "nowrap" }}>{m.value}</div>
                  </div>
                ))}
                {/* Barre poids */}
                <div style={{ flex: "2 1 120px", padding: "6px 10px" }}>
                  <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "5px" }}>Répartition</div>
                  <div style={{ background: C.snowOff, borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, poids)}%`, height: "100%", background: alerteConcentration ? C.red : pv >= 0 ? C.green : C.goldDark, borderRadius: "4px", transition: "width 0.4s" }} />
                  </div>
                  {(pos.alerteHaute || pos.alerteBasse) && (
                    <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                      {pos.alerteHaute && <span style={{ fontSize: "10px", color: C.inkSubtle }}>▲ <strong style={{ color: C.green }}>{fmtCours(pos.alerteHaute)}</strong></span>}
                      {pos.alerteBasse && <span style={{ fontSize: "10px", color: C.inkSubtle }}>▼ <strong style={{ color: C.red }}>{fmtCours(pos.alerteBasse)}</strong></span>}
                    </div>
                  )}
                </div>
              </div>
              {/* Statut fetch / timestamp */}
              {(isFetching || fetchError || pos.lastFetch) && (
                <div style={{ padding: "0 16px 8px", display: "flex", alignItems: "center", gap: "8px" }}>
                  {isFetching && <span style={{ display:"inline-flex", alignItems:"center", gap:"4px", fontSize: "10px", color: C.navy }}><ThinkingSpinner size={11} color={C.navy} /> actualisation cours…</span>}
                  {fetchError && !isFetching && <span style={{ fontSize: "10px", color: C.red }}>⚠ {fetchError}</span>}
                  {!isFetching && !fetchError && pos.lastFetch && <span style={{ fontSize: "10px", color: C.inkSubtle }}>↻ {new Date(pos.lastFetch).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              )}

            </div>
            </SwipeableCard>
          );
        })}
        </div>}
      </div>


      {/* ── Analyse de risque ── */}
      {positions.length > 0 && (() => {
        const seuils = { prudent: 5, equilibre: 10, dynamique: 15, "tres-dynamique": 20 };
        const seuil = seuils[profil?.risque] || 10;
        const risques = positions.map(p => {
          const valeur = (p.dernierCours || p.pru) * p.quantite;
          const poids  = totalActuel > 0 ? valeur / totalActuel * 100 : 0;
          const etf    = isETFName(p.nom);
          const statut = etf ? "ETF" : poids > seuil * 2 ? "ÉLEVÉ" : poids > seuil ? "MODÉRÉ" : "OK";
          return { ...p, valeur, poids, etf, statut };
        }).sort((a, b) => b.poids - a.poids);
        const nbAlerte = risques.filter(r => r.statut === "ÉLEVÉ").length;
        const nbModere = risques.filter(r => r.statut === "MODÉRÉ").length;
        return (
          <div style={{ background: C.snow, border: `1px solid ${nbAlerte > 0 ? "rgba(220,38,38,0.2)" : C.border}`, borderRadius: "20px", padding: "18px 22px", marginBottom: "20px", boxShadow: shadow.card }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: "800", color: C.ink }}>⚖ Analyse de risque · seuil {seuil}% / ligne ({profil?.risque || "?"})</div>
              <div style={{ display: "flex", gap: "10px" }}>
                {nbAlerte > 0 && <span style={{ fontSize: "10px", fontWeight: "700", color: C.red, background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "5px", padding: "2px 8px" }}>⚠ {nbAlerte} ligne{nbAlerte>1?"s":""} > {seuil*2}%</span>}
                {nbModere > 0 && <span style={{ fontSize: "10px", fontWeight: "700", color: C.goldDark, background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "5px", padding: "2px 8px" }}>{nbModere} entre {seuil}–{seuil*2}%</span>}
                {nbAlerte === 0 && nbModere === 0 && <span style={{ fontSize: "10px", fontWeight: "700", color: C.green, background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "5px", padding: "2px 8px" }}>✓ Concentration OK</span>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {risques.map(r => (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 50px 80px", gap: "8px", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ height: "6px", borderRadius: "3px", background: r.statut === "ÉLEVÉ" ? C.red : r.statut === "MODÉRÉ" ? C.gold : r.etf ? C.navy : C.green, width: `${Math.min(100, r.poids * 3)}%`, minWidth: "4px", transition: "width 0.3s" }} />
                  </div>
                  <div style={{ fontSize: "10px", color: C.inkMuted, textAlign: "right" }}>{r.poids.toFixed(1)}%</div>
                  <div style={{ fontSize: "9px", fontWeight: "700", textAlign: "right",
                    color: r.statut === "ÉLEVÉ" ? C.red : r.statut === "MODÉRÉ" ? C.goldDark : r.etf ? C.navy : C.green }}>{r.nom.split(" ")[0]} · {r.statut}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Dividendes ── */}
      <DividendesCard positions={positions} />

    </div>

    {/* ── Sell Simulator Modal ── */}
    {sellSimPos && (
      <SellSimulator
        pos={sellSimPos}
        account={account}
        onClose={() => setSellSimPos(null)}
      />
    )}

    {/* ── Disclaimer VENDRE ── */}
    {vendreDisclaimer && (
      <div style={{ position: "fixed", inset: 0, zIndex: 950, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,0,0,0.72)", backdropFilter: "blur(6px)", padding: "20px" }}
        onClick={e => e.target === e.currentTarget && setVendreDisclaimer(null)}>
        <div style={{ background: "#fff", borderRadius: "24px", padding: "32px 28px", maxWidth: "420px", width: "100%", boxShadow: "0 32px 80px rgba(0,0,0,0.35)", animation: "fadeIn 0.2s ease" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "14px", background: "#1A0000", border: "2px solid #FF0000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0 }}>🚨</div>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "800", color: "#CC0000", letterSpacing: "-0.02em" }}>Signal VENDRE</div>
              <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>{vendreDisclaimer.pos.nom}</div>
            </div>
          </div>
          {/* Disclaimer */}
          <div style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.25)`, borderRadius: "14px", padding: "14px 16px", marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: "800", color: C.red, marginBottom: "6px" }}>⚠ Avertissement important</div>
            <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.65" }}>
              Ce signal est généré par une IA à des fins <strong>éducatives et informatives uniquement</strong>. Il ne constitue pas un conseil en investissement. L'IA peut se tromper et ne connaît pas votre situation personnelle. <strong>Consultez un conseiller financier agréé</strong> avant toute décision de vente.
            </div>
          </div>
          {/* Signal detail */}
          {vendreDisclaimer.resume && (
            <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 16px", marginBottom: "20px" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Analyse IA</div>
              <div style={{ fontSize: "12px", color: C.ink, lineHeight: "1.6" }}>{vendreDisclaimer.resume}</div>
            </div>
          )}
          {/* Buttons */}
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => setVendreDisclaimer(null)}
              style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `1px solid ${C.border}`, background: C.snowOff, color: C.inkMuted, fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
              Fermer
            </button>
            <button onClick={() => { setSellSimPos(vendreDisclaimer.pos); setVendreDisclaimer(null); }}
              style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "none", background: C.navy, color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
              Simuler la vente →
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── Dividendes Card ─────────────────────────────────────────────────────────
const DIV_LOG_KEY = "bourse_dividendes_log";

function DividendesCard({ positions }) {
  const [log, setLog]         = useState(() => { try { return JSON.parse(localStorage.getItem(DIV_LOG_KEY) || "[]"); } catch { return []; } });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState({ date: new Date().toISOString().slice(0, 10), posId: "", montant: "" });

  const paying = positions.filter(p => p.dividendeAnnuel > 0);
  const totalAnnuelEstime = paying.reduce((s, p) => s + (p.dividendeAnnuel || 0) * p.quantite, 0);
  const totalInvesti      = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const rendementGlobal   = totalInvesti > 0 ? (totalAnnuelEstime / totalInvesti) * 100 : 0;
  const totalPercu        = log.reduce((s, e) => s + (parseFloat(e.montant) || 0), 0);

  const saveLog = (newLog) => { setLog(newLog); try { localStorage.setItem(DIV_LOG_KEY, JSON.stringify(newLog)); } catch {} };

  const addEntry = () => {
    const pos = positions.find(p => p.id === form.posId);
    if (!pos || !form.montant || !form.date) return;
    const entry = { id: Date.now(), date: form.date, posId: pos.id, nom: pos.nom, isin: pos.isin || "", montant: parseFloat(form.montant.replace(",", ".")) };
    saveLog([entry, ...log]);
    setShowForm(false);
    setForm({ date: new Date().toISOString().slice(0, 10), posId: "", montant: "" });
  };

  if (paying.length === 0 && log.length === 0) return null;

  const inp = { padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: "8px", fontSize: "12px", background: C.snow, color: C.ink, fontFamily: "Inter,sans-serif", outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "22px", overflow: "hidden", boxShadow: shadow.card, marginBottom: "20px" }}>
      {/* Header */}
      <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.greenLight }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="11"/><line x1="5.5" y1="7" x2="10.5" y2="7"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>Dividendes</div>
            <div style={{ fontSize: "10px", color: C.inkMuted }}>Revenus estimés · historique des versements</div>
          </div>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          style={{ fontSize: "11px", fontWeight: "700", color: C.green, background: "white", border: `1px solid ${C.green}40`, borderRadius: "8px", padding: "5px 12px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
          + Ajouter
        </button>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: `1px solid ${C.border}` }}>
        {[
          { label: "Revenu annuel estimé", value: fmtEur(totalAnnuelEstime), color: C.green },
          { label: "Rendement global", value: rendementGlobal.toFixed(2) + " %", color: C.navy },
          { label: "Total perçu (log)", value: fmtEur(totalPercu), color: C.goldDark },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: "14px 18px", borderRight: `1px solid ${C.border}`, textAlign: "center" }}>
            <div style={{ fontSize: "16px", fontWeight: "800", color, fontFamily: "Inter,sans-serif" }}>{value}</div>
            <div style={{ fontSize: "10px", color: C.inkMuted, marginTop: "3px" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Formulaire ajout */}
      {showForm && (
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.snowOff, display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 100px" }}>
            <div style={{ fontSize: "10px", color: C.inkMuted, fontWeight: "600", marginBottom: "4px" }}>Date</div>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
          </div>
          <div style={{ flex: "2 1 160px" }}>
            <div style={{ fontSize: "10px", color: C.inkMuted, fontWeight: "600", marginBottom: "4px" }}>Valeur</div>
            <select value={form.posId} onChange={e => setForm(f => ({ ...f, posId: e.target.value }))} style={inp}>
              <option value="">— Choisir —</option>
              {positions.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 100px" }}>
            <div style={{ fontSize: "10px", color: C.inkMuted, fontWeight: "600", marginBottom: "4px" }}>Montant net (€)</div>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} style={inp} />
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={addEntry} style={{ padding: "7px 14px", borderRadius: "8px", background: C.green, color: "white", border: "none", fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>Enregistrer</button>
            <button onClick={() => setShowForm(false)} style={{ padding: "7px 14px", borderRadius: "8px", background: C.snowOff, color: C.inkMuted, border: `1px solid ${C.border}`, fontSize: "12px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Table positions versantes */}
      {paying.length > 0 && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "36px 2fr 1fr 1fr 1fr 1fr", padding: "8px 20px", background: C.snowOff, borderBottom: `1px solid ${C.border}` }}>
            {["", "Société", "Div./action", "Rdt sur PRU", "Rdt cours act.", "Total annuel est."].map((h, i) => (
              <div key={i} style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h}</div>
            ))}
          </div>
          {paying.map(p => {
            const cours = p.dernierCours || p.pru;
            const rdtPru    = p.pru > 0 && p.dividendeAnnuel ? (p.dividendeAnnuel / p.pru) * 100 : null;
            const rdtCours  = cours > 0 && p.dividendeAnnuel ? (p.dividendeAnnuel / cours) * 100 : null;
            const totalAn   = (p.dividendeAnnuel || 0) * p.quantite;
            return (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "36px 2fr 1fr 1fr 1fr 1fr", padding: "10px 20px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                <CompanyAvatar nom={p.nom} isin={p.isin} size={26} />
                <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink, fontFamily: "Inter,sans-serif" }}>{p.nom}</div>
                <div style={{ fontSize: "12px", color: C.ink, fontWeight: "600" }}>{p.dividendeAnnuel ? fmtEur(p.dividendeAnnuel) : "—"}</div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: rdtPru != null ? C.green : C.inkSubtle }}>{rdtPru != null ? rdtPru.toFixed(2) + " %" : "—"}</div>
                <div style={{ fontSize: "12px", color: C.inkMuted }}>{rdtCours != null ? rdtCours.toFixed(2) + " %" : "—"}</div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: C.green }}>{totalAn > 0 ? fmtEur(totalAn) : "—"}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Log des versements reçus */}
      {log.length > 0 && (
        <div>
          <div style={{ padding: "10px 20px 6px", fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", borderTop: `1px solid ${C.border}`, background: C.snowOff }}>Historique reçu</div>
          {log.slice(0, 8).map(e => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "10px", color: C.inkSubtle, minWidth: "72px" }}>{e.date}</span>
                <span style={{ fontSize: "12px", fontWeight: "600", color: C.ink, fontFamily: "Inter,sans-serif" }}>{e.nom}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: C.green }}>+{fmtEur(e.montant)}</span>
                <button onClick={() => saveLog(log.filter(x => x.id !== e.id))}
                  style={{ background: "none", border: "none", color: C.inkSubtle, cursor: "pointer", fontSize: "12px", padding: "0 2px", lineHeight: 1 }}>✕</button>
              </div>
            </div>
          ))}
          {log.length > 8 && (
            <div style={{ padding: "8px 20px", fontSize: "10px", color: C.inkSubtle, textAlign: "center" }}>+ {log.length - 8} entrées supplémentaires</div>
          )}
        </div>
      )}

      <div style={{ padding: "8px 20px", fontSize: "10px", color: C.inkSubtle, lineHeight: "1.6", borderTop: `1px solid ${C.border}` }}>
        Dividendes/action : source Yahoo Finance lors du rafraîchissement · Dans un PEA, les dividendes sont crédités sans retenue à la source française (hors withholding étranger).
      </div>
    </div>
  );
}

// ─── Price Range Bar ──────────────────────────────────────────────────────────
function PriceRangeBar({ cours, objBas, objMoyen, objHaut }) {
  if (!cours) return null;
  const lo  = Math.min(cours, objBas  || cours) * 0.92;
  const hi  = Math.max(cours, objHaut || cours) * 1.08;
  const rng = hi - lo || 1;
  const pct = (v) => `${((v - lo) / rng * 100).toFixed(1)}%`;
  return (
    <div style={{ position: "relative", height: "14px", background: C.snowDim, borderRadius: "4px", overflow: "visible", marginTop: "4px" }}>
      {objBas && objHaut && (
        <div style={{ position: "absolute", left: pct(objBas), right: `${(100 - parseFloat(pct(objHaut))).toFixed(1)}%`, height: "100%", background: C.greenLight, borderRadius: "3px" }} />
      )}
      {objMoyen && <div style={{ position: "absolute", left: pct(objMoyen), transform: "translateX(-50%)", width: "2px", height: "100%", background: C.goldDark, borderRadius: "1px" }} />}
      <div style={{ position: "absolute", left: pct(cours), transform: "translateX(-50%)", width: "3px", height: "100%", background: C.navy, borderRadius: "1px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: C.inkSubtle, paddingTop: "18px" }}>
        {objBas   && <span style={{ color: C.red }}>{objBas.toFixed(3)}€</span>}
        <span style={{ color: C.navy }}>▲ {cours.toFixed(3)}€</span>
        {objMoyen && <span style={{ color: C.goldDark }}>⬤ {objMoyen.toFixed(3)}€</span>}
        {objHaut  && <span style={{ color: C.green }}>{objHaut.toFixed(3)}€</span>}
      </div>
    </div>
  );
}

// ─── Régression linéaire simple ───────────────────────────────────────────────
function linReg(xs, ys) {
  const n = xs.length;
  if (n < 2) return { a: ys[0] || 0, b: 0, sigma: 0 };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  const ssxx = xs.reduce((s, v) => s + (v - mx) ** 2, 0);
  const ssxy = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0);
  const b = ssxy / ssxx;
  const a = my - b * mx;
  const residuals = xs.map((x, i) => ys[i] - (a + b * x));
  const sigma = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(n - 2, 1));
  return { a, b, sigma };
}

// ─── Tab accent gradients ─────────────────────────────────────────────────────
const TAB_ACCENTS = {
  [TABS.PORTFOLIO]:  "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(33,37,40,0.05) 0%, transparent 70%)",
  [TABS.MARCHE]:     "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(8,145,178,0.07) 0%, transparent 70%)",
  [TABS.DCA]:        "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(217,119,6,0.07) 0%, transparent 70%)",
  [TABS.PROJECTION]: "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(5,150,105,0.07) 0%, transparent 70%)",
  [TABS.HISTORIQUE]: "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(124,58,237,0.07) 0%, transparent 70%)",
  [TABS.OPERATIONS]: "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(220,38,38,0.06) 0%, transparent 70%)",
  [TABS.PROFIL]:     "radial-gradient(ellipse 80% 60% at 10% 0%, rgba(100,116,139,0.06) 0%, transparent 70%)",
};

// ─── Projection par valeur (historique + extrapolation tendancielle) ───────────
const PROJ_HORIZONS = [
  { label: "6 mois",  months: 6,  range: "1y",  interval: "1d" },
  { label: "12 mois", months: 12, range: "2y",  interval: "1d" },
  { label: "3 ans",   months: 36, range: "5y",  interval: "1wk" },
];

// ─── Live Market Panel ─────────────────────────────────────────────────────────
function fmtVol(v) {
  if (!v || v <= 0) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}

function LiveMarketPanel({ pos, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState(null);

  const load_ = useCallback(async () => {
    setLoading(true); setErr(null); setData(null);

    // Résolution ticker : manuel → cache ISIN localStorage → recherche Yahoo Finance par ISIN
    const cache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
    if (pos.isin && pos.ticker) cache[pos.isin] = pos.ticker;
    let ticker = (pos.isin && cache[pos.isin]) || pos.ticker || null;

    // Auto-résolution via Yahoo Finance search si ISIN connu mais ticker absent du cache
    if (!ticker && pos.isin) {
      try {
        const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(pos.isin)}&quotesCount=3&newsCount=0`;
        const sRes = await fetchWithProxy(searchUrl, { signal: AbortSignal.timeout(10000) });
        if (sRes.ok) {
          const sJson = await sRes.json();
          const hit = (sJson?.quotes || []).find(q => ["EQUITY","ETF","MUTUALFUND"].includes(q.quoteType));
          if (hit?.symbol) {
            ticker = hit.symbol;
            try { cache[pos.isin] = ticker; localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(cache)); } catch {}
          }
        }
      } catch {}
    }

    if (!ticker) { setErr("Ticker Yahoo Finance introuvable · renseignez-le manuellement via ✏ dans le tableau."); setLoading(false); return; }
    try {
      const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=5m&range=1d`;
      const res  = await fetchWithProxy(url, { signal: AbortSignal.timeout(14000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const r    = json?.chart?.result?.[0];
      if (!r) throw new Error("Données indisponibles");

      const meta  = r.meta || {};
      const ts    = r.timestamp || [];
      const q     = r.indicators?.quote?.[0] || {};
      const pts   = ts.map((t, i) => ({
        t: t * 1000,
        close:  q.close?.[i]  ?? null,
        volume: q.volume?.[i] ?? 0,
        high:   q.high?.[i]   ?? null,
        low:    q.low?.[i]    ?? null,
      })).filter(p => p.close != null && p.close > 0);

      if (pts.length < 3) throw new Error("Données intraday insuffisantes");

      const last      = pts[pts.length - 1];
      const prevClose = meta.chartPreviousClose || meta.previousClose || pts[0].close;
      const change    = last.close - prevClose;
      const changePct = (change / prevClose) * 100;
      const totalVol  = pts.reduce((s, p) => s + p.volume, 0);
      const dayHigh   = Math.max(...pts.map(p => p.high ?? p.close));
      const dayLow    = Math.min(...pts.map(p => p.low  ?? p.close));

      // ── Volume Profile ──────────────────────────────────────────────
      const pMin = Math.min(...pts.map(p => p.close));
      const pMax = Math.max(...pts.map(p => p.close));
      const N    = 24;
      const bs   = (pMax - pMin) / N || 0.01;
      const bins = Array.from({ length: N }, (_, i) => ({
        lo: pMin + i * bs,
        hi: pMin + (i + 1) * bs,
        mid: pMin + (i + 0.5) * bs,
        vol: 0,
      }));
      for (const pt of pts) {
        const bi = Math.min(N - 1, Math.floor((pt.close - pMin) / bs));
        if (bi >= 0) bins[bi].vol += pt.volume;
      }
      const poc = bins.reduce((best, b) => b.vol > best.vol ? b : best);
      // Value Area — 70%
      const target = totalVol * 0.70;
      let vaVol = poc.vol, vaLo = bins.indexOf(poc), vaHi = vaLo;
      while (vaVol < target && (vaLo > 0 || vaHi < N - 1)) {
        const down = vaLo > 0 ? bins[vaLo - 1].vol : 0;
        const up   = vaHi < N - 1 ? bins[vaHi + 1].vol : 0;
        if (down >= up && vaLo > 0) { vaVol += down; vaLo--; }
        else if (vaHi < N - 1) { vaVol += up; vaHi++; }
        else break;
      }
      const VAH = bins[vaHi].hi;
      const VAL = bins[vaLo].lo;
      // HVN / LVN (excluding POC)
      const avgVol = totalVol / N;
      const hvn = bins.filter(b => b !== poc && b.vol > avgVol * 1.5).sort((a, b) => b.vol - a.vol)[0] || null;
      const lvn = bins.filter(b => b.vol > 0 && b.vol < avgVol * 0.35).sort((a, b) => a.vol - b.vol)[0] || null;

      setData({ pts, last, prevClose, change, changePct, totalVol, dayHigh, dayLow, poc, VAH, VAL, hvn, lvn });
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [pos.ticker]);

  useEffect(() => { load_(); }, [load_]);

  const up = data ? data.changePct >= 0 : true;

  // ── Sparkline SVG ───────────────────────────────────────────────────
  const Sparkline = ({ pts: P, W = 260, H = 64 }) => {
    if (!P || P.length < 2) return null;
    const prices = P.map(p => p.close);
    const mn = Math.min(...prices), mx = Math.max(...prices), range = mx - mn || 1;
    const px = 6, py = 6;
    const xs = i  => px + (i / (P.length - 1)) * (W - 2 * px);
    const ys = v  => H - py - ((v - mn) / range) * (H - 2 * py);
    const d  = prices.map((v, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
    const color = up ? C.green : C.red;
    // Gradient fill
    const fillId = `spk-fill-${pos.id}`;
    const areaD = `${d} L${xs(P.length - 1).toFixed(1)},${H} L${xs(0).toFixed(1)},${H} Z`;
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${fillId})`}/>
        <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  };

  const headerBg = up
    ? "linear-gradient(135deg, rgba(5,150,105,0.06) 0%, transparent 60%)"
    : "linear-gradient(135deg, rgba(220,38,38,0.06) 0%, transparent 60%)";

  const pctColor = data ? (up ? C.green : C.red) : C.inkMuted;
  const heroGrad = up
    ? "linear-gradient(160deg, #0D2318 0%, #0F3322 60%, #0D1F15 100%)"
    : "linear-gradient(160deg, #1E0A0A 0%, #2D0F0F 60%, #1A0808 100%)";

  return (
    <div style={{ background: "#F8F9FA", minHeight: "100%", display: "flex", flexDirection: "column" }}>

      {/* ── Hero prix ── */}
      <div style={{ background: heroGrad, padding: "20px 22px 22px", position: "relative", overflow: "hidden" }}>
        {/* Motif décoratif */}
        <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "120px", height: "120px", borderRadius: "50%", background: up ? "rgba(39,174,96,0.08)" : "rgba(231,76,60,0.08)", pointerEvents: "none" }} />

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "rgba(255,255,255,0.5)", padding: "20px 0" }}>
            <svg width="18" height="18" viewBox="0 0 18 18" style={{ animation: "spin 0.9s linear infinite" }} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
              <circle cx="9" cy="9" r="7" strokeOpacity="0.3"/><path d="M9 2 A7 7 0 0 1 16 9"/>
            </svg>
            <span style={{ fontSize: "12px", fontWeight: "600", display:"inline-flex", alignItems:"center", gap:"6px" }}><ThinkingSpinner size={14} color={C.inkMuted} /> Chargement marché intraday…</span>
          </div>
        )}
        {err && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "4px" }}>
            <div style={{ fontSize: "11px", color: "rgba(255,100,100,0.9)" }}>{err}</div>
            <button onClick={load_} style={{ alignSelf: "flex-start", fontSize: "11px", fontWeight: "700", color: "#fff", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>Réessayer</button>
          </div>
        )}

        {data && (
          <>
            {/* Prix principal */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "36px", fontWeight: "900", color: "#fff", letterSpacing: "-1.5px", fontFamily: "Inter,sans-serif", lineHeight: 1 }}>
                  {fmtCours(data.last.close)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                  <span style={{ background: up ? "rgba(39,174,96,0.25)" : "rgba(231,76,60,0.25)", color: up ? "#6EE7B7" : "#FCA5A5", fontWeight: "800", fontSize: "13px", borderRadius: "20px", padding: "4px 12px" }}>
                    {up ? "▲" : "▼"} {up ? "+" : ""}{data.changePct.toFixed(2)}%
                  </span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", fontWeight: "500" }}>
                    {up ? "+" : ""}{fmtCours(data.change)} · Vol {fmtVol(data.totalVol)}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "4px" }}>Clôture préc.</div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "rgba(255,255,255,0.75)" }}>{fmtCours(data.prevClose)}</div>
              </div>
            </div>

            {/* Chips Haut / Bas */}
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(255,255,255,0.07)", borderRadius: "8px", padding: "5px 10px" }}>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>Haut</span>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#6EE7B7" }}>{fmtCours(data.dayHigh)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(255,255,255,0.07)", borderRadius: "8px", padding: "5px 10px" }}>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>Bas</span>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#FCA5A5" }}>{fmtCours(data.dayLow)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(255,255,255,0.07)", borderRadius: "8px", padding: "5px 10px" }}>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>Vol</span>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "rgba(255,255,255,0.75)" }}>{fmtVol(data.totalVol)}</span>
              </div>
            </div>
          </>
        )}
        {!data && !loading && !err && (
          <div style={{ height: "80px" }} />
        )}
      </div>

      {/* ── Sparkline ── */}
      {data && (
        <div style={{ background: "#fff", padding: "0", borderBottom: `1px solid ${C.border}` }}>
          <Sparkline pts={data.pts} W={880} H={100}/>
        </div>
      )}

      {/* ── Volume Profile ── */}
      {data && (
        <div style={{ padding: "18px 20px", flex: 1 }}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
            <div style={{ width: "3px", height: "14px", borderRadius: "2px", background: "linear-gradient(180deg,#F97316,#EA580C)" }} />
            <span style={{ fontSize: "10px", fontWeight: "800", color: C.ink, letterSpacing: "1.2px", textTransform: "uppercase" }}>Volume Profile · Journée</span>
          </div>

          {/* Grille 2×2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>

            {/* POC */}
            <div style={{ borderRadius: "16px", border: "1.5px solid rgba(249,115,22,0.35)", background: "linear-gradient(135deg,rgba(249,115,22,0.08),rgba(249,115,22,0.03))", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F97316", boxShadow: "0 0 6px rgba(249,115,22,0.5)" }} />
                <span style={{ fontSize: "10px", fontWeight: "700", color: "#C2410C", letterSpacing: "0.3px" }}>Point de contrôle</span>
              </div>
              <div style={{ fontSize: "20px", fontWeight: "900", color: "#EA580C", fontFamily: "Inter,sans-serif", letterSpacing: "-0.5px" }}>{fmtCours(data.poc.mid)}</div>
              <div style={{ marginTop: "10px", height: "3px", borderRadius: "99px", background: "rgba(249,115,22,0.15)" }}>
                <div style={{ width: "65%", height: "100%", borderRadius: "99px", background: "linear-gradient(90deg,#F97316,#FDBA74)" }} />
              </div>
            </div>

            {/* VAH */}
            <div style={{ borderRadius: "16px", border: "1.5px solid rgba(34,211,238,0.3)", background: "linear-gradient(135deg,rgba(34,211,238,0.07),rgba(34,211,238,0.02))", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22D3EE", boxShadow: "0 0 6px rgba(34,211,238,0.4)" }} />
                <span style={{ fontSize: "10px", fontWeight: "700", color: "#0E7490", letterSpacing: "0.3px" }}>Zone haute</span>
              </div>
              <div style={{ fontSize: "20px", fontWeight: "900", color: "#0891B2", fontFamily: "Inter,sans-serif", letterSpacing: "-0.5px" }}>{fmtCours(data.VAH)}</div>
              <div style={{ marginTop: "10px", height: "3px", borderRadius: "99px", background: "rgba(34,211,238,0.12)" }}>
                <div style={{ width: "45%", height: "100%", borderRadius: "99px", background: "linear-gradient(90deg,#22D3EE,#67E8F9)" }} />
              </div>
            </div>

            {/* VAL */}
            <div style={{ borderRadius: "16px", border: "1.5px solid rgba(34,211,238,0.3)", background: "linear-gradient(135deg,rgba(34,211,238,0.07),rgba(34,211,238,0.02))", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22D3EE", boxShadow: "0 0 6px rgba(34,211,238,0.4)" }} />
                <span style={{ fontSize: "10px", fontWeight: "700", color: "#0E7490", letterSpacing: "0.3px" }}>Zone basse</span>
              </div>
              <div style={{ fontSize: "20px", fontWeight: "900", color: "#0891B2", fontFamily: "Inter,sans-serif", letterSpacing: "-0.5px" }}>{fmtCours(data.VAL)}</div>
              <div style={{ marginTop: "10px", height: "3px", borderRadius: "99px", background: "rgba(34,211,238,0.12)" }}>
                <div style={{ width: "45%", height: "100%", borderRadius: "99px", background: "linear-gradient(90deg,#22D3EE,#67E8F9)" }} />
              </div>
            </div>

            {/* HVN ou placeholder */}
            {data.hvn ? (
              <div style={{ borderRadius: "16px", border: "1.5px solid rgba(74,222,128,0.3)", background: "linear-gradient(135deg,rgba(74,222,128,0.07),rgba(74,222,128,0.02))", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4ADE80", boxShadow: "0 0 6px rgba(74,222,128,0.4)" }} />
                  <span style={{ fontSize: "10px", fontWeight: "700", color: "#15803D", letterSpacing: "0.3px" }}>Forte liquidité</span>
                </div>
                <div style={{ fontSize: "17px", fontWeight: "900", color: "#16A34A", fontFamily: "Inter,sans-serif", letterSpacing: "-0.5px", lineHeight: 1.2 }}>
                  {fmtCours(data.hvn.lo)}<span style={{ fontSize: "13px", opacity: 0.5, margin: "0 2px" }}>–</span>{fmtCours(data.hvn.hi)}
                </div>
                <div style={{ marginTop: "10px", height: "3px", borderRadius: "99px", background: "rgba(74,222,128,0.15)" }}>
                  <div style={{ width: "70%", height: "100%", borderRadius: "99px", background: "linear-gradient(90deg,#4ADE80,#86EFAC)" }} />
                </div>
              </div>
            ) : data.lvn ? (
              <div style={{ borderRadius: "16px", border: "1.5px solid rgba(248,113,113,0.3)", background: "linear-gradient(135deg,rgba(248,113,113,0.07),rgba(248,113,113,0.02))", padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#F87171", boxShadow: "0 0 6px rgba(248,113,113,0.4)" }} />
                  <span style={{ fontSize: "10px", fontWeight: "700", color: "#B91C1C", letterSpacing: "0.3px" }}>Faible liquidité</span>
                </div>
                <div style={{ fontSize: "17px", fontWeight: "900", color: "#DC2626", fontFamily: "Inter,sans-serif", letterSpacing: "-0.5px", lineHeight: 1.2 }}>
                  {fmtCours(data.lvn.lo)}<span style={{ fontSize: "13px", opacity: 0.5, margin: "0 2px" }}>–</span>{fmtCours(data.lvn.hi)}
                </div>
                <div style={{ marginTop: "10px", height: "3px", borderRadius: "99px", background: "rgba(248,113,113,0.15)" }}>
                  <div style={{ width: "40%", height: "100%", borderRadius: "99px", background: "linear-gradient(90deg,#F87171,#FCA5A5)" }} />
                </div>
              </div>
            ) : null}
          </div>

          {/* Légende compacte */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", padding: "10px 14px", background: C.cardGrad, borderRadius: "12px", border: `1px solid ${C.border}` }}>
            {[
              { color: "#F97316", label: "Point de contrôle" },
              { color: "#22D3EE", label: "Zone de valeur" },
              { color: "#4ADE80", label: "Forte liquidité" },
              { color: "#F87171", label: "Faible liquidité" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: "20px", height: "3px", borderRadius: "99px", background: color }}/>
                <span style={{ fontSize: "9px", color: C.inkMuted, fontWeight: "600" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Simulateur de vente ──────────────────────────────────────────────────────
function SellSimulator({ pos, account = "PEA", onClose }) {
  const ouvertureKey = account === "PEA" ? "bourse_pea_ouverture" : "bourse_cto_ouverture";
  const dateOuverture = load(ouvertureKey, null);
  const anneesDetention = dateOuverture
    ? (Date.now() - new Date(dateOuverture).getTime()) / (1000 * 60 * 60 * 24 * 365)
    : null;

  const [qty, setQty]               = useState(pos.quantite);
  const [prixManuel, setPrixManuel] = useState(null); // null = auto-projeté
  const [regimeIR, setRegimeIR]     = useState(false);
  const [tmiBracket, setTmiBracket] = useState(30);
  const [horizonAns, setHorizonAns] = useState(0);
  const [tauxAnnuel, setTauxAnnuel] = useState(7); // %/an

  const coursActuel = pos.dernierCours || pos.pru || 0;

  // Prix projeté calculé directement (pas d'effet)
  const prixProj = horizonAns === 0
    ? coursActuel
    : parseFloat((coursActuel * Math.pow(1 + tauxAnnuel / 100, horizonAns)).toFixed(3));
  const prix    = prixManuel !== null ? prixManuel : prixProj;
  const setPrix = (v) => setPrixManuel(v);

  // Réinitialiser le prix manuel quand l'horizon ou le scénario change
  const changeHorizon = (h) => { setHorizonAns(h); setPrixManuel(null); };
  const changeTaux    = (t) => { setTauxAnnuel(t); setPrixManuel(null); };

  // Ancienneté PEA à la date de retrait projetée
  const anneesDetentionFuture = anneesDetention !== null ? anneesDetention + horizonAns : null;
  const peaExonere = account === "PEA" && anneesDetentionFuture !== null && anneesDetentionFuture >= 5;

  const pru       = pos.pru || 0;
  const qtyNum    = Math.max(0, Math.min(pos.quantite, Number(qty) || 0));
  const prixNum   = Number(prix) || 0;
  const montantBrut = qtyNum * prixNum;
  const coutRevient = qtyNum * pru;
  const pvBrute   = montantBrut - coutRevient;
  const isPV      = pvBrute >= 0;

  // Calcul fiscal
  let impot = 0, detailFiscal = "";
  if (pvBrute > 0) {
    if (account === "PEA") {
      if (peaExonere) {
        impot = pvBrute * 0.172;
        detailFiscal = "PEA > 5 ans : 17,2% PS uniquement (exonération IR)";
      } else {
        impot = pvBrute * 0.30;
        detailFiscal = `PEA < 5 ans : 30% flat tax (IR + PS)`;
      }
    } else {
      if (regimeIR) {
        const taux = tmiBracket / 100 + 0.172;
        impot = pvBrute * taux;
        detailFiscal = `Barème IR ${tmiBracket}% + 17,2% PS = ${(taux * 100).toFixed(1)}%`;
      } else {
        impot = pvBrute * 0.30;
        detailFiscal = "Flat tax 30% (PFU : 12,8% IR + 17,2% PS)";
      }
    }
  }
  const gainNet   = pvBrute - impot;
  const pvRestant = (pos.quantite - qtyNum) > 0 ? (pos.dernierCours || pos.pru) * (pos.quantite - qtyNum) - pru * (pos.quantite - qtyNum) : 0;

  const row = (label, val, color, bold) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: "12px", color: C.inkMuted }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: bold ? "800" : "600", color: color || C.ink }}>{val}</span>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", padding: "16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: C.snow, borderRadius: "24px", width: "100%", maxWidth: "520px", padding: "24px 24px 32px", boxShadow: "0 8px 64px rgba(0,0,0,0.22)", animation: "fadeIn 0.2s ease", maxHeight: "90vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "800", color: C.ink, letterSpacing: "-0.02em" }}>Simulateur de vente</div>
            <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>{pos.nom} · {pos.quantite} titres en portefeuille</div>
          </div>
          <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.snowDim, border: "none", cursor: "pointer", fontSize: "14px", color: C.inkMuted }}>✕</button>
        </div>

        {/* Horizon de retrait */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "8px" }}>Horizon de retrait</label>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {[0,1,2,3,5,7,10].map(h => (
              <button key={h} onClick={() => changeHorizon(h)}
                style={{ padding: "5px 11px", borderRadius: "20px", border: `1px solid ${horizonAns === h ? C.accent : C.border}`, background: horizonAns === h ? C.accent : C.snowOff, color: horizonAns === h ? "#fff" : C.inkMuted, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                {h === 0 ? "Maintenant" : `${h} an${h > 1 ? "s" : ""}`}
              </button>
            ))}
          </div>
          {horizonAns > 0 && (
            <div style={{ marginTop: "10px" }}>
              <label style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "6px" }}>Scénario de croissance annuelle</label>
              <div style={{ display: "flex", gap: "5px" }}>
                {[[-8,"Pessimiste","#EF4444"],[0,"Neutre",C.inkMuted],[7,"Base","#2563EB"],[15,"Optimiste",C.green]].map(([t, label, col]) => (
                  <button key={t} onClick={() => changeTaux(t)}
                    style={{ flex: 1, padding: "6px 4px", borderRadius: "10px", border: `1px solid ${tauxAnnuel === t ? col : C.border}`, background: tauxAnnuel === t ? `${col}18` : C.snowOff, color: tauxAnnuel === t ? col : C.inkMuted, fontSize: "10px", fontWeight: "700", cursor: "pointer", textAlign: "center" }}>
                    <div>{label}</div>
                    <div style={{ fontSize: "9px", opacity: 0.8 }}>{t >= 0 ? "+" : ""}{t}%/an</div>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: "8px", background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", borderRadius: "10px", padding: "8px 12px", fontSize: "11px", color: C.inkMuted, display: "flex", justifyContent: "space-between" }}>
                <span>Prix projeté dans {horizonAns} an{horizonAns > 1 ? "s" : ""}</span>
                <strong style={{ color: C.navy }}>{fmtCours(coursActuel * Math.pow(1 + tauxAnnuel / 100, horizonAns))} €</strong>
              </div>
              {account === "PEA" && anneesDetentionFuture !== null && (
                <div style={{ marginTop: "6px", fontSize: "10px", color: peaExonere ? C.green : C.red, padding: "6px 12px", background: peaExonere ? "rgba(5,150,105,0.06)" : "rgba(220,38,38,0.06)", borderRadius: "8px", border: `1px solid ${peaExonere ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)"}` }}>
                  {peaExonere
                    ? `✓ À cette date votre PEA aura ${anneesDetentionFuture.toFixed(1)} ans → exonération IR (17,2% PS uniquement)`
                    : `⚠ À cette date votre PEA aura ${anneesDetentionFuture.toFixed(1)} ans → flat tax 30% encore applicable`}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Inputs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
          <div>
            <label style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "6px" }}>Titres à vendre</label>
            <input type="number" min="1" max={pos.quantite} value={qty}
              onChange={e => setQty(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "12px", border: `1px solid ${C.border}`, fontSize: "15px", fontWeight: "700", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }} />
            <input type="range" min="1" max={pos.quantite} value={qtyNum}
              onChange={e => setQty(e.target.value)}
              style={{ width: "100%", marginTop: "8px", accentColor: C.accent }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: C.inkSubtle }}>
              <span>1</span><span style={{ cursor: "pointer", color: C.accent, fontWeight: "700" }} onClick={() => setQty(pos.quantite)}>Tout vendre ({pos.quantite})</span>
            </div>
          </div>
          <div>
            <label style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", display: "block", marginBottom: "6px" }}>Prix de vente (€)</label>
            <input type="number" step="0.001" value={prix}
              onChange={e => setPrix(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: "12px", border: `1px solid ${C.border}`, fontSize: "15px", fontWeight: "700", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }} />
            {pos.dernierCours && <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "6px" }}>Cours actuel : <strong style={{ color: C.accent, cursor: "pointer" }} onClick={() => setPrix(pos.dernierCours)}>{fmtCours(pos.dernierCours)}</strong></div>}
          </div>
        </div>

        {/* Résultats */}
        <div style={{ background: C.cardGrad, borderRadius: "16px", padding: "16px 18px", marginBottom: "16px" }}>
          {horizonAns > 0 && (
            <div style={{ fontSize: "10px", color: C.inkSubtle, background: C.snowOff, borderRadius: "8px", padding: "6px 10px", marginBottom: "10px", lineHeight: "1.5" }}>
              ⚠ Prix projeté = <strong>{fmtCours(coursActuel)} €</strong> × (1 + {tauxAnnuel}%)^{horizonAns} ans = <strong style={{ color: C.navy }}>{fmtCours(prixProj)} €</strong> — estimation, pas une garantie.
            </div>
          )}
          {row("Montant de vente estimé", fmtEur(montantBrut))}
          {row("Capital investi — PRU × qté", `− ${fmtEur(coutRevient)}`, C.inkMuted)}
          <div style={{ fontSize: "9px", color: C.inkSubtle, marginBottom: "4px", paddingLeft: "2px" }}>
            Le PRU ({fmtCours(pos.pru)} €) est celui que vous avez saisi dans le portefeuille — vérifiez qu'il reflète bien votre coût moyen réel.
          </div>
          {row("Plus-value brute", `${isPV ? "+" : ""}${fmtEur(pvBrute)}`, isPV ? C.green : C.red)}
          {pvBrute > 0 && row("Impôt estimé", `− ${fmtEur(impot)}`, C.red)}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", marginTop: "4px" }}>
            <span style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>Gain net après impôt</span>
            <span style={{ fontSize: "18px", fontWeight: "900", color: gainNet >= 0 ? C.green : C.red }}>{gainNet >= 0 ? "+" : ""}{fmtEur(gainNet)}</span>
          </div>
        </div>

        {/* Fiscalité détail */}
        <div style={{ background: isPV ? "rgba(245,158,11,0.07)" : C.snowOff, border: `1px solid ${isPV ? "rgba(245,158,11,0.2)" : C.border}`, borderRadius: "12px", padding: "12px 16px", marginBottom: "14px", fontSize: "11px", color: C.inkMuted, lineHeight: "1.6" }}>
          <div style={{ fontWeight: "700", color: C.goldDark, marginBottom: "4px" }}>⚖ Régime fiscal applicable</div>
          {detailFiscal || (account === "PEA" ? "PEA : exonération IR après 5 ans, 17,2% PS uniquement" : "CTO : flat tax 30% par défaut")}
          {account === "CTO" && pvBrute > 0 && (
            <div style={{ marginTop: "10px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input type="checkbox" checked={regimeIR} onChange={e => setRegimeIR(e.target.checked)} style={{ accentColor: C.accent }} />
                <span>Opter pour le barème progressif de l'IR</span>
              </label>
              {regimeIR && (
                <div style={{ marginTop: "8px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {[11, 30, 41, 45].map(t => (
                    <button key={t} onClick={() => setTmiBracket(t)}
                      style={{ padding: "4px 10px", borderRadius: "20px", border: `1px solid ${tmiBracket === t ? C.accent : C.border}`, background: tmiBracket === t ? C.accent : C.snowOff, color: tmiBracket === t ? "#fff" : C.inkMuted, fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>
                      TMI {t}%
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!peaExonere && account === "PEA" && anneesDetentionFuture !== null && (
            <div style={{ marginTop: "6px", color: C.red }}>
              ⚠ PEA {horizonAns > 0 ? `dans ${horizonAns} an${horizonAns>1?"s":""}` : "actuellement"} à {anneesDetentionFuture.toFixed(1)} ans — flat tax 30%
              {horizonAns === 0 && anneesDetention !== null && anneesDetention < 5 && (
                <span style={{ color: C.inkMuted }}> · Exonération dans {(5 - anneesDetention).toFixed(1)} ans</span>
              )}
            </div>
          )}
          {account === "PEA" && !dateOuverture && <div style={{ marginTop: "6px" }}>→ Renseignez la date d'ouverture dans <strong>Profil</strong> pour un calcul précis.</div>}
        </div>

        {/* Position restante */}
        {qtyNum < pos.quantite && (
          <div style={{ background: C.cardGradGreen, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "10px 16px", fontSize: "11px", color: C.inkMuted, marginBottom: "4px" }}>
            Après cette vente : <strong style={{ color: C.ink }}>{pos.quantite - qtyNum} titres</strong> restants · P/V latente résiduelle : <strong style={{ color: pvRestant >= 0 ? C.green : C.red }}>{pvRestant >= 0 ? "+" : ""}{fmtEur(pvRestant)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Projection par valeur (historique + extrapolation tendancielle) ───────────
// (kept for use in Signaux & Actualités tab)
function StockProjectionChart({ pos, onClose }) {
  const [hidx, setHidx]         = useState(1); // 12 mois par défaut
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [hoverFrac, setHoverFrac] = useState(null);
  const [showMA50, setShowMA50] = useState(true);
  const [showMA200, setShowMA200] = useState(true);
  const svgRef = useRef(null);

  // Dimensions SVG
  const VW = 800, VH = 240, ML = 62, MR = 24, MT = 15, MB = 35;
  const CW = VW - ML - MR, CH = VH - MT - MB;

  useEffect(() => {
    const h = PROJ_HORIZONS[hidx];
    let cancelled = false;
    setLoading(true); setChartData(null); setError(null);

    const run = async () => {
      // Résolution du ticker
      const cache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
      if (pos.isin && pos.ticker) cache[pos.isin] = pos.ticker;
      const ticker = (pos.isin && cache[pos.isin]) || pos.ticker;
      if (!ticker) {
        if (!cancelled) { setError("Ticker Yahoo Finance non configuré · Cliquez sur ✏ dans le tableau pour le définir"); setLoading(false); }
        return;
      }

      try {
        // Historique affiché selon la période choisie
        const urlDisplay = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${h.interval}&range=${h.range}`;
        // Régression toujours calculée sur 5 ans hebdo → tendance stable quelle que soit la période
        const urlReg = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&range=5y`;

        const [resDisplay, resReg] = await Promise.all([
          fetchWithProxy(urlDisplay, { signal: AbortSignal.timeout(15000) }),
          fetchWithProxy(urlReg,     { signal: AbortSignal.timeout(15000) }),
        ]);
        if (!resDisplay.ok) throw new Error(`HTTP ${resDisplay.status}`);
        const jsonDisplay = await resDisplay.json();
        const jsonReg     = resReg.ok ? await resReg.json() : null;

        const r = jsonDisplay?.chart?.result?.[0];
        if (!r) throw new Error("Données indisponibles");
        const ts = r.timestamp || [];
        const cl = r.indicators?.quote?.[0]?.close || [];
        const vol = r.indicators?.quote?.[0]?.volume || [];
        const rawPts = ts
          .map((t, j) => ({ date: t * 1000, price: cl[j], volume: vol[j] || 0 }))
          .filter(p => p.price != null && p.price > 0);
        if (rawPts.length < 10) throw new Error("Données insuffisantes (< 10 points)");

        // Régression sur 5 ans (stable) — fallback sur données affichées si indispo
        const regR = jsonReg?.chart?.result?.[0];
        const regTs = regR?.timestamp || ts;
        const regCl = regR?.indicators?.quote?.[0]?.close || cl;
        const regPts = regTs
          .map((t, j) => ({ date: t * 1000, price: regCl[j] }))
          .filter(p => p.price != null && p.price > 0);
        const regBase = regPts.length >= 10 ? regPts : rawPts;

        // Régression linéaire sur log(prix) → modèle de croissance exponentielle
        const xs = regBase.map((_, i) => i);
        const ys = regBase.map(p => Math.log(p.price));
        const { a, b, sigma } = linReg(xs, ys);

        // Pas moyen basé sur les données d'affichage pour que la projection démarre au bon endroit
        const stepMs = (rawPts[rawPts.length - 1].date - rawPts[0].date) / (rawPts.length - 1);
        const stepsForward = Math.round((h.months * 30.44 * 24 * 3600 * 1000) / stepMs);
        const lastIdx = rawPts.length - 1;
        const lastDate = rawPts[lastIdx].date;

        // Recaler la régression au dernier prix réel (évite le décalage de niveau)
        const lastLogPrice = Math.log(rawPts[lastIdx].price);
        const regLastIdx   = regBase.length - 1;
        const regOffset    = lastLogPrice - (a + b * regLastIdx);

        // Calcul des points projetés avec bande d'incertitude ±1σ√t
        // La pente vient des 5 ans, recalée au dernier prix réel (regOffset)
        // sigma plafonné à 0.15 pour éviter que la bande explose sur les valeurs très volatiles
        const sigmaC = Math.min(sigma, 0.15);
        const projDates = [], projMid = [], projHi = [], projLo = [];
        for (let s = 1; s <= stepsForward; s++) {
          const xi = regLastIdx + s;
          const logMid = a + b * xi + regOffset;
          projDates.push(lastDate + s * stepMs);
          projMid.push(Math.exp(logMid));
          projHi.push(Math.exp(logMid + sigmaC * Math.sqrt(s)));
          projLo.push(Math.exp(logMid - sigmaC * Math.sqrt(s)));
        }

        if (!cancelled) {
          const priceArr = rawPts.map(p => p.price);
          const volumeArr = rawPts.map(p => p.volume);
          setChartData({
            dates: rawPts.map(p => p.date),
            prices: priceArr,
            volumes: volumeArr,
            ma50:  computeMA(priceArr, 50),
            ma200: computeMA(priceArr, 200),
            rsi:   computeRSI(priceArr, 14),
            projDates, projMid, projHi, projLo,
          });
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [hidx, pos]);

  // ── Calcul des échelles ──────────────────────────────────────────────────
  const allDates  = chartData ? [...chartData.dates, ...chartData.projDates] : [];
  // Pour l'échelle Y : on exclut projHi/projLo (qui peuvent être larges) et on se base
  // sur les prix réels + la courbe médiane de projection uniquement
  const allPrices = chartData ? [...chartData.prices, ...chartData.projMid] : [];
  const xMin = allDates[0] || 0;
  const xMax = allDates[allDates.length - 1] || 1;
  const yMin_raw = allPrices.length ? Math.min(...allPrices) : 0;
  const yMax_raw = allPrices.length ? Math.max(...allPrices) : 1;
  const yPad = (yMax_raw - yMin_raw) * 0.12;
  const yMin = Math.max(0, yMin_raw - yPad);
  const yMax = yMax_raw + yPad;

  const xScale = t => ML + (t - xMin) / (Math.max(xMax - xMin, 1)) * CW;
  const yScale = p => MT + (1 - (p - yMin) / (Math.max(yMax - yMin, 0.01))) * CH;

  // Graduations Y (prix)
  const priceRange = yMax_raw - yMin_raw;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(priceRange / 5, 0.01))));
  const niceStep = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(s => s >= priceRange / 5) || magnitude * 10;
  const gridPrices = [];
  for (let v = Math.ceil(yMin / niceStep) * niceStep; v <= yMax + 0.001; v += niceStep) {
    gridPrices.push(Math.round(v * 1000) / 1000);
  }

  // Étiquettes X (6 points sur la timeline complète)
  const xLabels = allDates.length > 1 ? Array.from({ length: 6 }, (_, i) => {
    const idx = Math.round(i * (allDates.length - 1) / 5);
    return { t: allDates[idx] };
  }) : [];

  // Hover
  const handleMouseMove = (e) => {
    if (!svgRef.current || !chartData) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width * VW - ML) / CW));
    setHoverFrac(frac);
  };
  const hoverT = hoverFrac != null ? xMin + hoverFrac * (xMax - xMin) : null;
  const isInProj = hoverT != null && chartData && hoverT > chartData.dates[chartData.dates.length - 1];
  const hoverHistIdx = hoverT != null && chartData
    ? chartData.dates.reduce((bi, t, i) => Math.abs(t - hoverT) < Math.abs(chartData.dates[bi] - hoverT) ? i : bi, 0)
    : null;
  const hoverProjIdx = hoverT != null && chartData && chartData.projDates.length
    ? chartData.projDates.reduce((bi, t, i) => Math.abs(t - hoverT) < Math.abs(chartData.projDates[bi] - hoverT) ? i : bi, 0)
    : null;

  // Performance finale projetée
  const finalProj = chartData?.projMid?.[chartData.projMid.length - 1];
  const lastPrice = chartData?.prices?.[chartData.prices.length - 1];
  const finalPct  = finalProj && lastPrice ? ((finalProj - lastPrice) / lastPrice) * 100 : null;

  return (
    <div style={{ background: C.snow, borderRadius: "16px", overflow: "hidden", marginTop: "16px", boxShadow: "0 8px 32px rgba(30,58,95,0.12)", border: `1px solid ${C.border}` }}>
      {/* En-tête gradient */}
      <div style={{ background: "linear-gradient(135deg, #080B0F 0%, #142641 50%, #1E3A5F 100%)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "14px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em" }}>📊 {pos.nom}</span>
          {finalPct != null && (
            <span style={{ fontSize: "11px", fontWeight: "700", padding: "3px 10px", borderRadius: "20px",
              color: finalPct >= 0 ? "#4ADE80" : "#F87171",
              background: finalPct >= 0 ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
              border: `1px solid ${finalPct >= 0 ? "rgba(74,222,128,0.30)" : "rgba(248,113,113,0.30)"}`,
            }}>
              {PROJ_HORIZONS[hidx].label} : {finalPct >= 0 ? "+" : ""}{finalPct.toFixed(1)}%
              {finalProj && <span style={{ fontWeight: "500", marginLeft: "4px", opacity: 0.8 }}>{fmtCours(finalProj)} €</span>}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
          {PROJ_HORIZONS.map((h, i) => (
            <button key={h.label} onClick={() => setHidx(i)} style={{
              padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
              fontSize: "11px", fontWeight: "700", fontFamily: "Inter, sans-serif",
              background: i === hidx ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)",
              color: i === hidx ? "#fff" : "rgba(255,255,255,0.45)",
              boxShadow: i === hidx ? "0 2px 8px rgba(0,0,0,0.25)" : "none",
              transition: "all 0.15s",
            }}>{h.label}</button>
          ))}
          <button onClick={() => setShowMA50(v => !v)} style={{ padding: "4px 9px", borderRadius: "6px", border: `1px solid ${showMA50 ? "rgba(245,158,11,0.55)" : "rgba(255,255,255,0.12)"}`, cursor: "pointer", fontSize: "10px", fontWeight: "700", fontFamily: "Inter, sans-serif", background: showMA50 ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.05)", color: showMA50 ? "#F59E0B" : "rgba(255,255,255,0.4)", transition: "all 0.15s" }}>MA50</button>
          <button onClick={() => setShowMA200(v => !v)} style={{ padding: "4px 9px", borderRadius: "6px", border: `1px solid ${showMA200 ? "rgba(139,92,246,0.55)" : "rgba(255,255,255,0.12)"}`, cursor: "pointer", fontSize: "10px", fontWeight: "700", fontFamily: "Inter, sans-serif", background: showMA200 ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.05)", color: showMA200 ? "#A78BFA" : "rgba(255,255,255,0.4)", transition: "all 0.15s" }}>MA200</button>
          {onClose && (
            <button onClick={onClose} style={{ marginLeft: "2px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "4px 8px", cursor: "pointer", fontSize: "12px", color: "rgba(255,255,255,0.5)", fontFamily: "Inter, sans-serif" }}>✕</button>
          )}
        </div>
      </div>

      {/* Corps */}
      <div style={{ padding: "16px 20px 20px" }}>
      {loading && <LoadingPanel label="Chargement des données historiques…" />}
      {error && (
        <div style={{ fontSize: "12px", color: C.inkMuted, padding: "20px 0", textAlign: "center", lineHeight: "1.6" }}>{error}</div>
      )}

      {!loading && !error && chartData && (
        <>
          <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
            style={{ width: "100%", height: "auto", cursor: "crosshair", display: "block", userSelect: "none" }}
            onMouseMove={handleMouseMove} onMouseLeave={() => setHoverFrac(null)}>

            <defs>
              <linearGradient id="priceAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1E3A5F" stopOpacity="0.22"/>
                <stop offset="85%" stopColor="#1E3A5F" stopOpacity="0.02"/>
                <stop offset="100%" stopColor="#1E3A5F" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="projAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2D5986" stopOpacity="0.12"/>
                <stop offset="100%" stopColor="#2D5986" stopOpacity="0"/>
              </linearGradient>
            </defs>

            {/* Fond zone graphique */}
            <rect x={ML} y={MT} width={CW} height={CH} fill={C.snowOff} rx="4" opacity="0.5" />

            {/* Grille horizontale */}
            {gridPrices.map(v => (
              <g key={v}>
                <line x1={ML} x2={ML + CW} y1={yScale(v)} y2={yScale(v)} stroke="rgba(148,163,184,0.3)" strokeWidth="1" strokeDasharray="4,4" />
                <text x={ML - 6} y={yScale(v) + 4} textAnchor="end" fontSize="10" fill="#94A3B8" fontFamily="Inter,sans-serif" fontWeight="500">
                  {v >= 1000 ? (v / 1000).toFixed(1) + "k" : v >= 100 ? v.toFixed(0) : v.toFixed(1)}€
                </text>
              </g>
            ))}

            {/* Étiquettes X (dates) */}
            {xLabels.map(({ t }, i) => (
              <text key={i} x={xScale(t)} y={MT + CH + 22} textAnchor="middle" fontSize="9" fill="#94A3B8" fontFamily="Inter,sans-serif">
                {new Date(t).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })}
              </text>
            ))}

            {/* Séparateur "aujourd'hui" */}
            {(() => {
              const todayX = xScale(chartData.dates[chartData.dates.length - 1]);
              return <>
                <line x1={todayX} x2={todayX} y1={MT} y2={MT + CH} stroke="rgba(148,163,184,0.5)" strokeWidth="1" strokeDasharray="4,3" />
                <text x={todayX} y={MT - 4} textAnchor="middle" fontSize="8" fill="#94A3B8" fontFamily="Inter,sans-serif" fontWeight="600">Auj.</text>
              </>;
            })()}

            {/* Area fill historique */}
            <polygon
              points={[
                `${xScale(chartData.dates[0]).toFixed(1)},${(MT+CH).toFixed(1)}`,
                ...chartData.dates.map((t, i) => `${xScale(t).toFixed(1)},${yScale(chartData.prices[i]).toFixed(1)}`),
                `${xScale(chartData.dates[chartData.dates.length-1]).toFixed(1)},${(MT+CH).toFixed(1)}`,
              ].join(" ")}
              fill="url(#priceAreaGrad)" />

            {/* Bande d'incertitude projection */}
            {chartData.projDates.length > 0 && (() => {
              const bandPts = [
                ...chartData.projDates.map((t, i) => `${xScale(t).toFixed(1)},${yScale(chartData.projHi[i]).toFixed(1)}`),
                ...[...chartData.projDates].reverse().map((t, i) => {
                  const ri = chartData.projDates.length - 1 - i;
                  return `${xScale(t).toFixed(1)},${yScale(chartData.projLo[ri]).toFixed(1)}`;
                }),
              ];
              return <polygon points={bandPts.join(" ")} fill="url(#projAreaGrad)" />;
            })()}

            {/* Ligne PRU */}
            {pos.pru > 0 && pos.pru >= yMin && pos.pru <= yMax && (
              <>
                <line x1={ML} x2={ML + CW} y1={yScale(pos.pru)} y2={yScale(pos.pru)} stroke={C.goldDark} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.85" />
                <text x={ML + CW + 3} y={yScale(pos.pru) + 4} fontSize="9" fill={C.goldDark} fontFamily="Inter,sans-serif" fontWeight="600">PRU</text>
              </>
            )}

            {/* Cours historique */}
            <polyline
              points={chartData.dates.map((t, i) => `${xScale(t).toFixed(1)},${yScale(chartData.prices[i]).toFixed(1)}`).join(" ")}
              fill="none" stroke="#1E3A5F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* MA50 */}
            {showMA50 && chartData.ma50 && (
              <polyline
                points={chartData.dates.map((t, i) => chartData.ma50[i] != null ? `${xScale(t).toFixed(1)},${yScale(chartData.ma50[i]).toFixed(1)}` : null).filter(Boolean).join(" ")}
                fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            )}

            {/* MA200 */}
            {showMA200 && chartData.ma200 && (
              <polyline
                points={chartData.dates.map((t, i) => chartData.ma200[i] != null ? `${xScale(t).toFixed(1)},${yScale(chartData.ma200[i]).toFixed(1)}` : null).filter(Boolean).join(" ")}
                fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            )}

            {/* Projection tendancielle */}
            {chartData.projDates.length > 0 && (
              <polyline
                points={[
                  `${xScale(chartData.dates[chartData.dates.length - 1]).toFixed(1)},${yScale(chartData.prices[chartData.prices.length - 1]).toFixed(1)}`,
                  ...chartData.projDates.map((t, i) => `${xScale(t).toFixed(1)},${yScale(chartData.projMid[i]).toFixed(1)}`),
                ].join(" ")}
                fill="none" stroke="#2D5986" strokeWidth="2" strokeDasharray="7,5" strokeLinecap="round" opacity="0.85" />
            )}

            {/* Crosshair */}
            {hoverFrac != null && hoverT != null && (
              <>
                <line x1={xScale(hoverT)} x2={xScale(hoverT)} y1={MT} y2={MT + CH} stroke="rgba(148,163,184,0.6)" strokeWidth="1" strokeDasharray="3,3" />
                {!isInProj && hoverHistIdx != null && (
                  <circle cx={xScale(chartData.dates[hoverHistIdx])} cy={yScale(chartData.prices[hoverHistIdx])} r="5" fill="#1E3A5F" stroke="#fff" strokeWidth="2.5" />
                )}
                {isInProj && hoverProjIdx != null && (
                  <circle cx={xScale(chartData.projDates[hoverProjIdx])} cy={yScale(chartData.projMid[hoverProjIdx])} r="5" fill="#2D5986" stroke="#fff" strokeWidth="2.5" />
                )}
              </>
            )}
          </svg>

          {/* Infobulle hover */}
          {hoverFrac != null && (
            <div style={{ background: "#111214", borderRadius: "10px", padding: "10px 14px", marginTop: "8px", fontSize: "11px", display: "inline-flex", gap: "14px", flexWrap: "wrap", alignItems: "center", boxShadow: "0 4px 16px rgba(17,18,20,0.18)" }}>
              {!isInProj && hoverHistIdx != null && (
                <>
                  <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: "600" }}>
                    {new Date(chartData.dates[hoverHistIdx]).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span style={{ color: "#fff", fontWeight: "800", fontSize: "13px" }}>{fmtCours(chartData.prices[hoverHistIdx])} €</span>
                  {pos.pru > 0 && (
                    <span style={{ fontWeight: "700", color: chartData.prices[hoverHistIdx] >= pos.pru ? "#4ADE80" : "#F87171", background: chartData.prices[hoverHistIdx] >= pos.pru ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)", padding: "2px 8px", borderRadius: "6px" }}>
                      {((chartData.prices[hoverHistIdx] - pos.pru) / pos.pru * 100).toFixed(2)}% vs PRU
                    </span>
                  )}
                </>
              )}
              {isInProj && hoverProjIdx != null && (
                <>
                  <span style={{ color: "#A78BFA", fontWeight: "700" }}>Projection</span>
                  <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: "600" }}>
                    {new Date(chartData.projDates[hoverProjIdx]).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span style={{ color: "#fff", fontWeight: "800", fontSize: "13px" }}>{fmtCours(chartData.projMid[hoverProjIdx])} €</span>
                  <span style={{ color: "rgba(255,255,255,0.40)", fontWeight: "500" }}>
                    [{fmtCours(chartData.projLo[hoverProjIdx])} – {fmtCours(chartData.projHi[hoverProjIdx])}]
                  </span>
                </>
              )}
            </div>
          )}

          {/* Légende */}
          <div style={{ display: "flex", gap: "14px", marginTop: "12px", flexWrap: "wrap", fontSize: "10px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.inkMuted }}><span style={{ width: "18px", height: "2.5px", background: "#1E3A5F", borderRadius: "2px", display: "inline-block" }}/>Cours</span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.inkSubtle }}><span style={{ width: "18px", height: "1px", borderTop: "2px dashed #2D5986", display: "inline-block" }}/>Tendance</span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.inkSubtle }}><span style={{ width: "12px", height: "10px", background: "rgba(30,58,95,0.15)", borderRadius: "2px", display: "inline-block" }}/>±1σ</span>
            {pos.pru > 0 && <span style={{ display: "flex", alignItems: "center", gap: "5px", color: C.goldDark }}><span style={{ width: "18px", height: "1px", borderTop: "1.5px dashed #B8920A", display: "inline-block" }}/>PRU {fmtCours(pos.pru)} €</span>}
            {showMA50  && <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "#D97706" }}><span style={{ width: "18px", height: "2px", background: "#F59E0B", borderRadius: "2px", display: "inline-block" }}/>MA50</span>}
            {showMA200 && <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "#7C3AED" }}><span style={{ width: "18px", height: "2px", background: "#8B5CF6", borderRadius: "2px", display: "inline-block" }}/>MA200</span>}
          </div>
          <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "4px", opacity: 0.7 }}>
            ⚠ Projection extrapolée. Non garantie. Ne constitue pas un conseil en investissement.
          </div>

          {/* ── Volume ── */}
          {chartData.volumes && (() => {
            const VVW=800, VVH=55, VML=62, VMR=24, VMT=4, VMB=16;
            const VCW=VVW-VML-VMR, VCH=VVH-VMT-VMB;
            const maxVol = Math.max(...chartData.volumes.filter(v=>v>0), 1);
            const n = chartData.dates.length;
            const barW = Math.max(1, VCW / n - 0.5);
            return (
              <div style={{ marginTop: "12px" }}>
                <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "4px" }}>Volume</div>
                <svg viewBox={`0 0 ${VVW} ${VVH}`} style={{ width: "100%", height: "auto", display: "block" }}>
                  {chartData.dates.map((t, i) => {
                    const x = xScale(t) - barW / 2;
                    const h = (chartData.volumes[i] / maxVol) * VCH;
                    const isUp = i === 0 || chartData.prices[i] >= chartData.prices[i - 1];
                    return <rect key={i} x={x} y={VMT + VCH - h} width={barW} height={h} fill={isUp ? C.green : C.red} opacity="0.5" rx="0.5" />;
                  })}
                  <line x1={VML} x2={VML+VCW} y1={VMT+VCH} y2={VMT+VCH} stroke="rgba(148,163,184,0.3)" strokeWidth="1" />
                </svg>
              </div>
            );
          })()}

          {/* ── RSI ── */}
          {chartData.rsi && (() => {
            const RVW=800, RVH=70, RML=62, RMR=24, RMT=8, RMB=18;
            const RCW=RVW-RML-RMR, RCH=RVH-RMT-RMB;
            const rsiScale = v => RMT + (1 - v / 100) * RCH;
            const rsiPts = chartData.rsi
              .map((v, i) => v != null ? `${xScale(chartData.dates[i]).toFixed(1)},${rsiScale(v).toFixed(1)}` : null)
              .filter(Boolean);
            const lastRsi = chartData.rsi.filter(v => v != null).slice(-1)[0];
            const rsiColor = lastRsi >= 70 ? C.red : lastRsi <= 30 ? C.green : C.navy;
            return (
              <div style={{ marginTop: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                  <span style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", display: "flex", alignItems: "center" }}>RSI (14)<InfoTip term="RSI" position="top" /></span>
                  {lastRsi != null && (
                    <span style={{ fontSize: "9px", fontWeight: "800", color: rsiColor, background: rsiColor + "18", padding: "1px 5px", borderRadius: "4px" }}>
                      {lastRsi.toFixed(1)} {lastRsi >= 70 ? "Suracheté" : lastRsi <= 30 ? "Survendu" : "Neutre"}
                    </span>
                  )}
                </div>
                <svg viewBox={`0 0 ${RVW} ${RVH}`} style={{ width: "100%", height: "auto", display: "block" }}>
                  {/* Bandes 70/50/30 */}
                  <rect x={RML} y={rsiScale(70)} width={RCW} height={rsiScale(30)-rsiScale(70)} fill={C.snowOff} opacity="0.6" />
                  {[70, 50, 30].map(v => (
                    <g key={v}>
                      <line x1={RML} x2={RML+RCW} y1={rsiScale(v)} y2={rsiScale(v)} stroke={v===50?"#94A3B8":C.border} strokeWidth={v===50?"1":"0.8"} strokeDasharray={v===50?"":"3,3"} />
                      <text x={RML-4} y={rsiScale(v)+3} textAnchor="end" fontSize="8" fill={C.inkSubtle} fontFamily="Inter,sans-serif">{v}</text>
                    </g>
                  ))}
                  {/* Ligne RSI */}
                  <polyline points={rsiPts.join(" ")} fill="none" stroke={rsiColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            );
          })()}
        </>
      )}
      </div>
    </div>
  );
}

// ─── Price Evolution Chart ────────────────────────────────────────────────────
function nicePctStep(range) {
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  const target = range / 5;
  return steps.find(s => s >= target) || 200;
}
const CHART_PERIODS = [
  { label: "J",  range: "1d",  interval: "5m"  },
  { label: "1J", range: "5d",  interval: "30m" },
  { label: "5J", range: "5d",  interval: "1d"  },
  { label: "3M", range: "3mo", interval: "1d"  },
  { label: "6M", range: "6mo", interval: "1d"  },
  { label: "1A", range: "1y",  interval: "1d"  },
  { label: "3A", range: "3y",  interval: "1wk" },
  { label: "5A", range: "5y",  interval: "1wk" },
];
const CHART_COLORS = ["#2563EB","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#06B6D4","#16A34A","#CCFF00","#6366F1","#0891B2","#DC2626"];

function PriceEvolutionChart({ positions }) {
  const [pidx, setPidx]         = useState(4); // 6M par défaut
  const [series, setSeries]     = useState([]);
  const [missing, setMissing]   = useState([]);
  const [cacData, setCacData]   = useState(null);
  const [showCac, setShowCac]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [hoverFrac, setHoverFrac] = useState(null);
  const svgRef = useRef(null);

  const VW=800, VH=240, ML=52, MR=16, MT=12, MB=32;
  const CW=VW-ML-MR, CH=VH-MT-MB;

  useEffect(() => {
    const p = CHART_PERIODS[pidx];
    let cancelled = false;
    setLoading(true);
    setSeries([]);
    setMissing([]);

    const run = async () => {
      const cache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY)||"{}"); } catch { return {}; } })();
      for (const pos of positions) { if (pos.isin && pos.ticker) cache[pos.isin] = pos.ticker; }

      // Résultats indexés pour conserver l'ordre des positions
      const results = new Array(positions.length).fill(null);
      const missingList = [];
      await Promise.all(positions.map(async (pos, i) => {
        const ticker = (pos.isin && cache[pos.isin]) || pos.ticker;
        if (!ticker) { missingList.push({ nom: pos.nom, reason: "Ticker non configuré" }); return; }
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${p.interval}&range=${p.range}`;
          const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) { missingList.push({ nom: pos.nom, reason: `Erreur ${res.status}` }); return; }
          const data = await res.json();
          const r = data?.chart?.result?.[0];
          if (!r) { missingList.push({ nom: pos.nom, reason: "Données indisponibles" }); return; }
          const ts = r.timestamp || [];
          const cl = r.indicators?.quote?.[0]?.close || [];
          const pts = ts.map((t, j) => ({ date: t * 1000, close: cl[j] })).filter(pt => pt.close != null);
          if (pts.length < 2) { missingList.push({ nom: pos.nom, reason: `Historique insuffisant (${pts.length} pt)` }); return; }
          const first = pts[0].close;
          results[i] = {
            nom: pos.nom,
            ticker,
            color: CHART_COLORS[i % CHART_COLORS.length],
            points: pts.map(pt => ({ date: pt.date, pct: ((pt.close - first) / first) * 100 })),
          };
        } catch (e) { missingList.push({ nom: pos.nom, reason: "Timeout ou réseau" }); }
      }));

      // Fetch CAC 40 (^FCHI) en parallèle
      try {
        const cacUrl = `https://query1.finance.yahoo.com/v8/finance/chart/%5EFCHI?interval=${p.interval}&range=${p.range}`;
        const cacRes = await fetchWithProxy(cacUrl, { signal: AbortSignal.timeout(15000) });
        if (cacRes.ok) {
          const cacJson = await cacRes.json();
          const cr = cacJson?.chart?.result?.[0];
          if (cr) {
            const ts = cr.timestamp || [];
            const cl = cr.indicators?.quote?.[0]?.close || [];
            const pts = ts.map((t, j) => ({ date: t * 1000, close: cl[j] })).filter(pt => pt.close != null);
            if (pts.length >= 2) {
              const first = pts[0].close;
              if (!cancelled) setCacData(pts.map(pt => ({ date: pt.date, pct: ((pt.close - first) / first) * 100 })));
            }
          }
        }
      } catch {}

      if (!cancelled) { setSeries(results.filter(Boolean)); setMissing(missingList); setLoading(false); }
    };
    run();
    return () => { cancelled = true; };
  }, [pidx, positions]);

  const cacSeries = showCac && cacData
    ? { nom: "CAC 40", ticker: "^FCHI", color: "#CCFF00", points: cacData, dashed: true }
    : null;
  const displayedSeries = cacSeries ? [...series, cacSeries] : series;

  const allPcts = displayedSeries.flatMap(s => s.points.map(p => p.pct));
  const rawMin = allPcts.length ? Math.min(...allPcts) : -5;
  const rawMax = allPcts.length ? Math.max(...allPcts) : 5;
  const pad = Math.max(1, (rawMax - rawMin) * 0.08);
  const yMin = Math.min(rawMin - pad, -pad);
  const yMax = Math.max(rawMax + pad, pad);
  const step = nicePctStep(yMax - yMin);
  const gridVals = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + 0.001; v = Math.round((v + step) * 100) / 100) gridVals.push(Math.round(v * 100) / 100);

  const xScale = frac => ML + frac * CW;
  const yScale = pct  => MT + (1 - (pct - yMin) / (yMax - yMin)) * CH;

  const refSeries = displayedSeries.reduce((best, s) => s.points.length > (best?.points.length || 0) ? s : best, null);
  const xLabels = refSeries ? (() => {
    const pts = refSeries.points;
    const count = Math.min(6, pts.length);
    return Array.from({ length: count }, (_, i) => {
      const idx = Math.round(i * (pts.length - 1) / (count - 1));
      return { frac: idx / (pts.length - 1), date: pts[idx].date };
    });
  })() : [];

  const hoverInfo = hoverFrac != null ? displayedSeries.map(s => {
    const idx = Math.round(hoverFrac * (s.points.length - 1));
    const pt  = s.points[Math.max(0, Math.min(s.points.length - 1, idx))];
    return { ...s, pt };
  }) : null;
  const hoverDate = hoverFrac != null && refSeries
    ? refSeries.points[Math.round(hoverFrac * (refSeries.points.length - 1))]?.date
    : null;

  const handleMouseMove = (e) => {
    if (!svgRef.current || !displayedSeries.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width * VW - ML) / CW));
    setHoverFrac(frac);
  };

  return (
    <div style={{ background: C.snow, borderRadius: "16px", overflow: "hidden", marginTop: "20px", boxShadow: "0 8px 32px rgba(30,58,95,0.12)", border: `1px solid ${C.border}` }}>
      {/* En-tête gradient */}
      <div style={{ background: "linear-gradient(135deg, #080B0F 0%, #142641 50%, #1E3A5F 100%)", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em" }}>📈 Évolution comparative</span>
          {series.length > 0 && <span style={{ fontSize: "10px", fontWeight: "600", color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.08)", borderRadius: "5px", padding: "2px 7px" }}>{series.length} valeur{series.length > 1 ? "s" : ""}</span>}
        </div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
          {CHART_PERIODS.map((p, i) => (
            <button key={p.range} onClick={() => setPidx(i)} style={{
              padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
              fontSize: "11px", fontWeight: "700", fontFamily: "Inter, sans-serif",
              background: i === pidx ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.07)",
              color: i === pidx ? "#fff" : "rgba(255,255,255,0.45)",
              boxShadow: i === pidx ? "0 2px 8px rgba(0,0,0,0.25)" : "none",
              transition: "all 0.15s",
            }}>{p.label}</button>
          ))}
          <button onClick={() => setShowCac(v => !v)} style={{
            padding: "4px 9px", borderRadius: "6px", border: `1px solid ${showCac ? "rgba(204,255,0,0.5)" : "rgba(255,255,255,0.12)"}`,
            cursor: "pointer", fontSize: "10px", fontWeight: "700", fontFamily: "Inter, sans-serif",
            background: showCac ? "rgba(204,255,0,0.12)" : "rgba(255,255,255,0.05)",
            color: showCac ? "#CCFF00" : "rgba(255,255,255,0.4)", transition: "all 0.15s",
          }}>CAC 40</button>
        </div>
      </div>

      <div style={{ padding: "16px 20px 20px" }}>
      {loading && <LoadingPanel label="Chargement des données historiques…" />}

      {!loading && displayedSeries.length === 0 && series.length === 0 && (
        <div style={{ fontSize: "12px", color: C.inkMuted, padding: "24px 0", textAlign: "center" }}>
          Aucune donnée disponible · Configurez les tickers dans l'onglet Portefeuille (✏ → Ticker Yahoo Finance)
        </div>
      )}

      {!loading && (series.length > 0 || cacSeries) && (
        <>
          <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
            style={{ width: "100%", height: "auto", cursor: "crosshair", display: "block", userSelect: "none" }}
            onMouseMove={handleMouseMove} onMouseLeave={() => setHoverFrac(null)}>

            <defs>
              {displayedSeries.map(s => (
                <linearGradient key={s.ticker} id={`area-${s.ticker.replace(/[^a-zA-Z0-9]/g,"_")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={s.dashed ? "0.08" : "0.18"}/>
                  <stop offset="100%" stopColor={s.color} stopOpacity="0"/>
                </linearGradient>
              ))}
            </defs>

            {/* Fond zone */}
            <rect x={ML} y={MT} width={CW} height={CH} fill={C.snowOff} rx="4" opacity="0.5" />

            {/* Ligne 0% mise en valeur */}
            <line x1={ML} x2={ML+CW} y1={yScale(0)} y2={yScale(0)} stroke="rgba(148,163,184,0.6)" strokeWidth="1.5" />

            {/* Grille */}
            {gridVals.filter(v => v !== 0).map(v => (
              <g key={v}>
                <line x1={ML} x2={ML+CW} y1={yScale(v)} y2={yScale(v)} stroke="rgba(148,163,184,0.22)" strokeWidth="1" strokeDasharray="4,4" />
                <text x={ML-5} y={yScale(v)+4} textAnchor="end" fontSize="10" fill="#94A3B8" fontFamily="Inter,sans-serif" fontWeight="500">
                  {v >= 0 ? "+" : ""}{v.toFixed(0)}%
                </text>
              </g>
            ))}
            <text x={ML-5} y={yScale(0)+4} textAnchor="end" fontSize="10" fill="#64748B" fontFamily="Inter,sans-serif" fontWeight="700">0%</text>

            {xLabels.map(({ frac, date }, i) => (
              <text key={i} x={xScale(frac)} y={MT+CH+20} textAnchor="middle" fontSize="9" fill="#94A3B8" fontFamily="Inter,sans-serif">
                {pidx === 0
                  ? new Date(date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                  : pidx === 1
                  ? new Date(date).toLocaleDateString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })
                  : new Date(date).toLocaleDateString("fr-FR", { month: "short", year: pidx >= 5 ? "numeric" : "2-digit" })}
              </text>
            ))}

            {/* Area fills */}
            {displayedSeries.filter(s => !s.dashed).map(s => (
              <polygon key={`area-${s.ticker}`}
                points={[
                  `${xScale(0).toFixed(1)},${yScale(0).toFixed(1)}`,
                  ...s.points.map((pt, i) => `${xScale(i/(s.points.length-1)).toFixed(1)},${yScale(pt.pct).toFixed(1)}`),
                  `${xScale(1).toFixed(1)},${yScale(0).toFixed(1)}`,
                ].join(" ")}
                fill={`url(#area-${s.ticker.replace(/[^a-zA-Z0-9]/g,"_")})`} />
            ))}

            {/* Courbes */}
            {displayedSeries.map(s => (
              <polyline key={s.ticker}
                points={s.points.map((pt, i) => `${xScale(i/(s.points.length-1)).toFixed(1)},${yScale(pt.pct).toFixed(1)}`).join(" ")}
                fill="none" stroke={s.color} strokeWidth={s.dashed ? "2" : "2.5"}
                strokeDasharray={s.dashed ? "8,5" : undefined}
                strokeLinecap="round" strokeLinejoin="round"
                opacity={s.dashed ? "0.8" : "1"} />
            ))}

            {hoverFrac != null && (
              <>
                <line x1={xScale(hoverFrac)} x2={xScale(hoverFrac)} y1={MT} y2={MT+CH}
                  stroke="rgba(148,163,184,0.6)" strokeWidth="1" strokeDasharray="3,3" />
                {hoverInfo?.map(s => (
                  <circle key={s.ticker} cx={xScale(hoverFrac)} cy={yScale(s.pt.pct)} r="4.5" fill={s.color} stroke="#fff" strokeWidth="2.5" />
                ))}
              </>
            )}
          </svg>

          {/* Tooltip survol */}
          {hoverFrac != null && hoverInfo && (
            <div style={{ background: "#111214", borderRadius: "10px", padding: "10px 14px", marginTop: "8px", fontSize: "11px", boxShadow: "0 4px 16px rgba(17,18,20,0.18)" }}>
              {hoverDate && (
                <div style={{ fontWeight: "600", color: "rgba(255,255,255,0.45)", marginBottom: "8px", fontSize: "10px", letterSpacing: "0.5px" }}>
                  {new Date(hoverDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                {hoverInfo.map(s => (
                  <span key={s.ticker} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: s.color, flexShrink: 0, display: "inline-block", boxShadow: `0 0 6px ${s.color}60` }} />
                    <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: "500" }}>{s.nom.split(" ").slice(0,2).join(" ")}</span>
                    <span style={{ color: s.pt.pct >= 0 ? "#4ADE80" : "#F87171", fontWeight: "800" }}>
                      {s.pt.pct >= 0 ? "+" : ""}{s.pt.pct.toFixed(2)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Légende pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "14px" }}>
            {displayedSeries.map(s => {
              const last = s.points[s.points.length - 1];
              const isPos = last.pct >= 0;
              return (
                <div key={s.ticker} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "5px 12px", background: C.snowOff, borderRadius: "20px", border: `1px solid ${s.dashed ? s.color + "50" : C.border}` }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: s.color, flexShrink: 0, display: "inline-block" }} />
                  <span style={{ fontSize: "11px", fontWeight: "600", color: C.inkSoft }}>{s.nom.split(" ").slice(0,2).join(" ")}</span>
                  <span style={{ fontSize: "11px", fontWeight: "800", color: isPos ? C.green : C.red, background: isPos ? C.greenLight : C.redLight, padding: "1px 6px", borderRadius: "5px" }}>
                    {isPos ? "+" : ""}{last.pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Positions sans données */}
          {missing.length > 0 && (
            <div style={{ marginTop: "10px", padding: "8px 12px", background: "#FEF9C3", border: "1px solid #FDE047", borderRadius: "8px", fontSize: "10px", color: "#854D0E" }}>
              <span style={{ fontWeight: "700" }}>⚠ {missing.length} position{missing.length > 1 ? "s" : ""} sans données : </span>
              {missing.map((m, i) => (
                <span key={i}>{i > 0 ? " · " : ""}<strong>{m.nom.split(" ").slice(0,2).join(" ")}</strong> <span style={{ opacity: 0.7 }}>({m.reason})</span></span>
              ))}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

// ─── Marché Tab ─────────────────────────────────────────────────────────────
function MarcheTab({ profil, portfolioVersion, account = "PEA", marketScores, marketScoringUi, onRunScoring }) {
  const [allPositions, setAllPositions] = useState(() => sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
  const positions = allPositions.filter(p => (p.compte || "PEA") === account);
  const [selectedPosId, setSelectedPosId] = useState(null);

  useEffect(() => {
    setAllPositions(sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
    setSelectedPosId(null);
  }, [portfolioVersion]);

  if (positions.length === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.inkSubtle, fontSize: "13px" }}>
      Aucune position dans le portefeuille · Ajoutez des positions dans l'onglet Portefeuille
    </div>
  );

  const selectedPos = positions.find(p => p.id === selectedPosId) || null;
  const SIG_COLOR = { ACHAT: C.green, RENFORCER: C.accent, ATTENDRE: C.gold, PRUDENCE: C.red, VENDRE: "#7B1111" };
  const SIG_BG    = { ACHAT: C.greenLight, RENFORCER: C.paleBlue, ATTENDRE: C.goldLight, PRUDENCE: C.redLight, VENDRE: "rgba(123,17,17,0.08)" };

  const scores = Array.isArray(marketScores) ? marketScores : [];
  const scoredPositions = positions.map(p => {
    const s = scores.find(sc => sc.isin === p.isin || sc.nom?.toLowerCase() === p.nom?.toLowerCase());
    return { ...p, _score: s || null };
  }).sort((a, b) => (b._score?.score_marche ?? -1) - (a._score?.score_marche ?? -1));

  return (
    <div>
      {/* ── Scoring IA dynamique ── */}
      <div style={{ background: C.cardGrad, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "22px", boxShadow: shadow.card, marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ fontWeight: "700", fontSize: "14px", color: C.ink }}>Scoring IA Dynamique</div>
            <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>Analyse temps réel de chaque position — actualités + signaux marché</div>
          </div>
          <button
            onClick={() => onRunScoring && onRunScoring(positions)}
            disabled={marketScoringUi === UI.LOADING}
            style={{ padding: "8px 18px", borderRadius: "12px", border: "none", cursor: marketScoringUi === UI.LOADING ? "not-allowed" : "pointer", background: marketScoringUi === UI.LOADING ? C.snowDim : "linear-gradient(135deg, #080B0F 0%, #1E3A5F 100%)", color: marketScoringUi === UI.LOADING ? C.inkSubtle : "#fff", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px", boxShadow: marketScoringUi !== UI.LOADING ? shadow.pill : "none", transition: "all 0.15s" }}>
            {marketScoringUi === UI.LOADING
              ? <><span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", border: "2px solid #aaa", borderTopColor: "transparent", animation: "spin 0.9s linear infinite" }} />Analyse en cours…</>
              : "Lancer le scoring IA"}
          </button>
        </div>

        {marketScoringUi === UI.IDLE && scores.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 0", color: C.inkSubtle, fontSize: "13px" }}>
            Cliquez sur "Lancer le scoring IA" pour analyser vos positions en temps réel.
          </div>
        )}

        {(marketScoringUi === UI.RESULT || scores.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {scoredPositions.map(pos => {
              const s = pos._score;
              if (!s) return (
                <div key={pos.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: C.snowOff, borderRadius: "12px", border: `1px solid ${C.border}` }}>
                  <div style={{ fontWeight: "600", fontSize: "13px", color: C.inkMuted, minWidth: "120px" }}>{pos.nom}</div>
                  <div style={{ fontSize: "11px", color: C.inkSubtle }}>Non scoré — Lancez une analyse</div>
                </div>
              );
              const scoreBarColor = s.score_marche >= 14 ? C.green : s.score_marche >= 9 ? C.gold : C.red;
              return (
                <div key={pos.id} style={{ padding: "14px 16px", background: SIG_BG[s.signal] || C.snowOff, borderRadius: "14px", border: `1px solid ${SIG_COLOR[s.signal] ? SIG_COLOR[s.signal] + "33" : C.border}`, display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: "700", fontSize: "13.5px", color: C.ink, flex: 1, minWidth: "100px" }}>{pos.nom}</div>
                    <span style={{ fontSize: "10px", fontWeight: "800", color: SIG_COLOR[s.signal] || C.inkMuted, background: SIG_COLOR[s.signal] ? SIG_COLOR[s.signal] + "22" : C.snowDim, padding: "3px 10px", borderRadius: "20px", border: `1px solid ${SIG_COLOR[s.signal] || C.border}`, letterSpacing: "0.5px" }}>{s.signal}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ width: "80px", height: "6px", borderRadius: "3px", background: C.snowDim, overflow: "hidden" }}>
                        <div style={{ width: `${(s.score_marche / 20) * 100}%`, height: "100%", background: scoreBarColor, borderRadius: "3px", transition: "width 0.5s" }} />
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: "700", color: scoreBarColor }}>{s.score_marche}/20</span>
                    </div>
                  </div>
                  {s.resume && <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.5" }}>{s.resume}</div>}
                  {s.catalyseur_cle && (
                    <div style={{ fontSize: "11px", color: C.inkSubtle, display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ fontWeight: "700", color: C.inkMuted }}>Catalyseur :</span> {s.catalyseur_cle}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {marketScoringUi === UI.ERROR && (
          <div style={{ padding: "12px 14px", background: C.redLight, border: `1px solid rgba(231,76,60,0.25)`, borderRadius: "12px", color: C.red, fontSize: "12.5px" }}>
            Erreur lors du scoring — Vérifiez votre clé API et réessayez.
          </div>
        )}
      </div>

      {/* ── Projection par valeur ── */}
      <div style={{ background: C.cardGradPurp, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "22px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>
          Projection par valeur
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          {positions.map(pos => (
            <button key={pos.id} onClick={() => setSelectedPosId(pos.id === selectedPosId ? null : pos.id)} style={{
              padding: "6px 12px", borderRadius: "20px", border: `1px solid ${pos.id === selectedPosId ? C.navy : C.border}`,
              background: pos.id === selectedPosId ? C.navyLight : C.snowOff,
              color: pos.id === selectedPosId ? C.navy : C.inkMuted,
              fontSize: "11px", fontWeight: pos.id === selectedPosId ? "700" : "500",
              fontFamily: "Inter, sans-serif", cursor: "pointer",
            }}>
              {pos.nom.split(" ").slice(0,2).join(" ")}
            </button>
          ))}
        </div>
        {selectedPos
          ? <StockProjectionChart pos={selectedPos} onClose={() => setSelectedPosId(null)} />
          : <div style={{ fontSize: "12px", color: C.inkSubtle, padding: "16px 0", textAlign: "center" }}>
              Sélectionnez une valeur ci-dessus pour afficher sa projection
            </div>
        }
      </div>

      <div style={{ height: "20px" }} />
      <PriceEvolutionChart positions={positions} />
    </div>
  );
}



// ─── PEA Avis Opérés ─────────────────────────────────────────────────────────
function PEAAvisOperes({ account = "PEA" }) {
  const [operations, setOperations] = useState(() => load("bourse_avis_operes", []));
  const [ui, setUi]                 = useState(UI.IDLE);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const [errors, setErrors]         = useState([]);
  const pdfRef = useRef(null);

  const extractPdfText = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.js`;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page  = await pdf.getPage(i);
      const items = await page.getTextContent();
      text += items.items.map(it => it.str).join(" ") + "\n";
    }
    return text;
  };

  const handlePdf = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUi(UI.LOADING);
    setProgress({ done: 0, total: files.length });
    setErrors([]);
    const newOps = [];
    const errs   = [];
    let   skipped = 0;
    // Snapshot des références existantes avant la boucle
    const existingRefs = new Set(
      (JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]"))
        .map(o => o.reference).filter(Boolean)
    );
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await extractPdfText(file);
        const data = await enqueueApi(() => callClaude(AVIS_PARSE_PROMPT, `Texte du document :\n\n${text.slice(0, 8000)}`, false, 4, false, 4000));
        const ops  = Array.isArray(data?.operations) ? data.operations : [];
        let addedFromFile = 0;
        ops.forEach((op, j) => {
          // Générer une référence de fallback si absente
          const ref = op.reference && op.reference.trim()
            ? op.reference.trim()
            : `${op.date}_${op.isin || op.titre}_${op.type}_${op.quantite}`;
          if (existingRefs.has(ref)) { skipped++; return; }
          existingRefs.add(ref);
          newOps.push({ ...op, reference: ref, id: Date.now() + i * 1000 + j, source: file.name, compte: account });
          addedFromFile++;
        });
        if (ops.length === 0) errs.push(`${file.name} : aucune opération détectée`);
        else if (addedFromFile === 0) errs.push(`${file.name} : déjà importé (${ops.length} doublon${ops.length > 1 ? "s" : ""})`);
      } catch (err) {
        errs.push(`${file.name} : ${err.message || "erreur"}`);
      }
      setProgress({ done: i + 1, total: files.length });
    }
    if (newOps.length > 0) {
      setOperations(prev => { const next = [...newOps, ...prev]; save("bourse_avis_operes", next); return next; });
    }
    if (skipped > 0 && newOps.length === 0) errs.unshift(`⚠ ${skipped} opération(s) ignorée(s) — déjà présentes`);
    setErrors(errs);
    setUi(newOps.length > 0 ? UI.RESULT : errs.length > 0 ? UI.ERROR : UI.IDLE);
    e.target.value = "";
  };

  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const removeOp = (id) => setOperations(prev => { const next = prev.filter(o => o.id !== id); save("bourse_avis_operes", next); return next; });
  const clearAll = () => { setOperations(prev => { const next = prev.filter(o => (o.compte || "PEA") !== account); save("bourse_avis_operes", next); return next; }); setUi(UI.IDLE); };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const typeColor = (t) => t === "ACHAT" ? C.green : t === "VENTE" ? C.navy : t === "DIVIDENDE" ? C.goldDark : C.inkMuted;

  // Filtrer par compte courant
  const filteredOps = operations.filter(o => (o.compte || "PEA") === account);

  // ── Calcul P&L réalisé par titre (chronologique) ─────────────────────────
  const computePnL = () => {
    const byTitre = {};
    const sorted  = [...filteredOps].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const typeOrder = { ACHAT: 0, DIVIDENDE: 1, VENTE: 2 };
      return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
    });
    for (const op of sorted) {
      const key = op.isin || op.titre;
      if (!byTitre[key]) byTitre[key] = { titre: op.titre, isin: op.isin, qte: 0, pru: 0, totalAchete: 0, realise: 0, dividendes: 0, fraisTotal: 0 };
      const e = byTitre[key];
      const qte   = parseFloat(op.quantite)    || 0;
      const prix  = parseFloat(op.prixUnitaire) || 0;
      const frais = parseFloat(op.frais)        || 0;
      e.fraisTotal += frais;
      if (op.type === "ACHAT") {
        const nouveauTotal = e.pru * e.qte + prix * qte + frais;
        e.qte            += qte;
        e.pru             = e.qte > 0 ? nouveauTotal / e.qte : 0;
        e.totalAchete    += prix * qte + frais;
      } else if (op.type === "VENTE") {
        const gain    = (prix - e.pru) * qte - frais;
        e.realise    += gain;
        e.qte        -= qte;
        if (e.qte < 0.001) e.qte = 0;
      } else if (op.type === "DIVIDENDE") {
        e.dividendes += prix * qte;
      }
    }
    return Object.values(byTitre);
  };
  const pnlParTitre = computePnL();

  // Enrichir chaque VENTE avec le P&L au moment de la vente
  const enrichOp = (op) => {
    if (op.type !== "VENTE") return null;
    const entry = pnlParTitre.find(e => (op.isin && e.isin === op.isin) || e.titre === op.titre);
    if (!entry) return null;
    const gain = (parseFloat(op.prixUnitaire) - entry.pru) * parseFloat(op.quantite) - parseFloat(op.frais || 0);
    return gain;
  };

  // Tri du tableau
  const sorted = [...filteredOps].sort((a, b) => {
    let va, vb;
    if (sortKey === "date") {
      va = `${a.date || ""}T${a.heure || "00:00:00"}`;
      vb = `${b.date || ""}T${b.heure || "00:00:00"}`;
    } else {
      va = a[sortKey] ?? ""; vb = b[sortKey] ?? "";
      if (sortKey === "prixUnitaire" || sortKey === "quantite" || sortKey === "frais") { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; }
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const thStyle = (key) => ({
    fontSize: "9px", fontWeight: "700", color: sortKey === key ? C.navy : C.inkSubtle,
    textTransform: "uppercase", letterSpacing: "0.8px", cursor: "pointer", userSelect: "none",
    whiteSpace: "nowrap",
  });
  const cols = "90px 60px 80px 1fr 110px 60px 80px 60px 90px 28px";

  return (
    <div style={{ marginTop: "28px" }}>
      <div style={{ fontSize: "11px", fontWeight: "800", color: C.ink, letterSpacing: "0.5px", marginBottom: "14px" }}>
        📄 Avis d'opérés
      </div>

      {/* Import PDF */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
        <input ref={pdfRef} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={handlePdf} />
        <button onClick={() => pdfRef.current?.click()} disabled={ui === UI.LOADING}
          style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "8px", padding: "9px 16px", color: C.goldDark, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: ui === UI.LOADING ? "not-allowed" : "pointer" }}>
          {ui === UI.LOADING ? <span style={{ display:"inline-flex", alignItems:"center", gap:"6px" }}><ThinkingSpinner size={13} color={C.goldDark} /> {progress.done}/{progress.total} analysé{progress.done > 1 ? "s" : ""}…</span> : "↑ Importer des avis PDF"}
        </button>
        {ui === UI.RESULT && <span style={{ fontSize: "11px", color: C.green, fontWeight: "600" }}>✓ {progress.total} fichier{progress.total > 1 ? "s" : ""} — {filteredOps.length} opération{filteredOps.length > 1 ? "s" : ""} au total</span>}
        {errors.length > 0 && errors.map((e, i) => <span key={i} style={{ fontSize: "11px", color: C.red, fontWeight: "600" }}>⚠ {e}</span>)}
        {filteredOps.length > 0 && (
          <button onClick={clearAll} style={{ marginLeft: "auto", background: "none", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 12px", color: C.inkMuted, fontSize: "11px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>
            Tout effacer
          </button>
        )}
      </div>


      {/* ── Tableau des opérations avec entête fixe + tri ── */}
      {filteredOps.length > 0 && (
        <div className="ba-tbl-scroll" style={{ border: `1px solid ${C.border}`, borderRadius: "18px", boxShadow: shadow.card }}>
          <div style={{ minWidth: "580px", background: C.snow }}>
          <div style={{ maxHeight: "420px", overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: cols, position: "sticky", top: 0, background: C.snowOff, zIndex: 2, borderBottom: `1px solid ${C.border}`, padding: "8px 12px", gap: "0" }}>
              {[["date","Date"],["heure","Heure"],["type","Type"],["titre","Titre"],["isin","ISIN"],["quantite","Qté"],["prixUnitaire","Prix"],["frais","Frais"],["","P&L"],["",""]].map(([key, label]) => (
                <div key={label} style={thStyle(key)} onClick={() => key && toggleSort(key)}>
                  {label}{sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </div>
              ))}
            </div>
            {sorted.map(op => {
              const gain = op.type === "VENTE" ? enrichOp(op) : null;
              return (
                <div key={op.id} style={{ display: "grid", gridTemplateColumns: cols, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, alignItems: "center", background: gain !== null ? (gain >= 0 ? "rgba(45,122,82,0.04)" : "rgba(176,58,46,0.04)") : "transparent" }}>
                  <div style={{ fontSize: "11px", color: C.inkMuted }}>{op.date ? op.date.split("-").reverse().join("/") : "—"}</div>
                  <div style={{ fontSize: "11px", color: C.inkSubtle, fontFamily: "monospace" }}>{op.heure || "—"}</div>
                  <div><span style={{ fontSize: "10px", fontWeight: "700", color: typeColor(op.type), background: typeColor(op.type) + "18", borderRadius: "4px", padding: "2px 6px" }}>{op.type}</span></div>
                  <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                    <CompanyAvatar nom={op.titre} isin={op.isin} size={24} />
                    <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink, lineHeight: "1.3", fontFamily: "Inter, sans-serif" }}>{op.titre}</span>
                  </div>
                  <div style={{ fontSize: "10px", color: C.inkSubtle, fontFamily: "monospace" }}>{op.isin || "—"}</div>
                  <div style={{ fontSize: "12px", color: C.ink }}>{op.quantite}</div>
                  <div style={{ fontSize: "12px", color: C.navy, fontWeight: "600" }}>{op.prixUnitaire} €</div>
                  <div style={{ fontSize: "11px", color: op.frais !== "0" && op.frais !== "0.00" ? C.goldDark : C.inkSubtle }}>{op.frais} €</div>
                  <div>
                    {gain !== null
                      ? <span style={{ fontSize: "11px", fontWeight: "800", color: gain >= 0 ? C.green : C.red }}>{gain >= 0 ? "+" : ""}{gain.toFixed(2)} €</span>
                      : <span style={{ fontSize: "11px", color: C.inkSubtle }}>—</span>}
                  </div>
                  <button onClick={() => removeOp(op.id)} style={{ background: "none", border: "none", color: C.inkSubtle, cursor: "pointer", fontSize: "14px", padding: "0", lineHeight: "1" }}>✕</button>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "10px 12px", background: C.snowOff, fontSize: "11px", color: C.inkSubtle, borderTop: `1px solid ${C.border}` }}>
            {filteredOps.length} opération{filteredOps.length > 1 ? "s" : ""} · Cliquez sur une colonne pour trier · Données stockées localement
          </div>
          </div>
        </div>
      )}

      {filteredOps.length === 0 && ui === UI.IDLE && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "22px", padding: "40px 32px", textAlign: "center", boxShadow: shadow.card }}>
          <div style={{ fontSize: "36px", marginBottom: "14px", lineHeight: 1 }}>📄</div>
          <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, marginBottom: "8px" }}>Aucune transaction importée</div>
          <div style={{ fontSize: "12px", color: C.inkMuted, maxWidth: "420px", margin: "0 auto 24px", lineHeight: "1.6" }}>
            Importez vos avis d'opérés au format PDF. Claude analyse chaque document et extrait automatiquement vos <strong>achats</strong>, <strong>ventes</strong>, <strong>dividendes</strong> et <strong>frais</strong>.
          </div>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", marginBottom: "24px" }}>
            {[["ACHAT", C.green], ["VENTE", C.navy], ["DIVIDENDE", C.goldDark], ["FRAIS", C.inkMuted]].map(([type, color]) => (
              <span key={type} style={{ fontSize: "10px", fontWeight: "700", color, background: color + "18", border: `1px solid ${color}30`, borderRadius: "6px", padding: "4px 10px" }}>{type}</span>
            ))}
          </div>
          <button onClick={() => pdfRef.current?.click()} style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "8px", padding: "10px 22px", color: C.goldDark, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer" }}>
            ↑ Importer mes avis PDF
          </button>
          <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "14px" }}>Plusieurs fichiers acceptés en une fois · Données stockées localement</div>
        </div>
      )}
    </div>
  );
}

// ─── API Keys Section ─────────────────────────────────────────────────────────
function ApiKeysSection() {
  const stored = () => { try { return JSON.parse(localStorage.getItem("bourse_api_keys") || "{}"); } catch { return {}; } };
  const [keys, setKeys]   = useState(stored);
  const [show, setShow]   = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem("bourse_api_keys", JSON.stringify(keys));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const inp = { width: "100%", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "10px 14px", color: C.ink, fontSize: "12px", fontFamily: "monospace", outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  const hasKeys = keys.anthropic || keys.google;

  return (
    <div style={{ marginTop: "28px", borderTop: `1px solid ${C.border}`, paddingTop: "22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: show ? "18px" : 0, cursor: "pointer" }} onClick={() => setShow(s => !s)}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>🔑 Clés API</div>
          <div style={{ fontSize: "11px", color: C.inkMuted, marginTop: "2px" }}>
            {hasKeys ? "Clés configurées · stockées localement dans votre navigateur" : "Non configurées · fonctions IA désactivées"}
          </div>
        </div>
        <span style={{ fontSize: "12px", color: C.inkSubtle }}>{show ? "▲" : "▼"}</span>
      </div>

      {show && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "14px", padding: "12px 16px", fontSize: "11px", color: C.navy, lineHeight: "1.6" }}>
            Chaque utilisateur entre ses propres clés — elles sont stockées <strong>uniquement dans votre navigateur</strong> (localStorage) et ne transitent pas par un serveur.
          </div>
          <div>
            <label style={lbl}>Clé Anthropic (Claude IA) — <a href="https://console.anthropic.com/account/keys" target="_blank" rel="noreferrer" style={{ color: C.navy, textDecoration: "none" }}>console.anthropic.com</a></label>
            <input style={inp} type="password" placeholder="sk-ant-api03-…" value={keys.anthropic || ""} onChange={e => setKeys(k => ({ ...k, anthropic: e.target.value }))} autoComplete="off" spellCheck="false" />
          </div>
          <div>
            <label style={lbl}>Clé Google Custom Search — <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ color: C.navy, textDecoration: "none" }}>console.cloud.google.com</a></label>
            <input style={inp} type="password" placeholder="AIzaSy…" value={keys.google || ""} onChange={e => setKeys(k => ({ ...k, google: e.target.value }))} autoComplete="off" spellCheck="false" />
          </div>
          <div>
            <label style={lbl}>Google CX (Search Engine ID)</label>
            <input style={inp} type="text" placeholder="707b30d5e62e…" value={keys.cx || ""} onChange={e => setKeys(k => ({ ...k, cx: e.target.value }))} autoComplete="off" spellCheck="false" />
          </div>
          <div>
            <label style={lbl}>Clé Alpha Vantage (fondamentaux) — <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noreferrer" style={{ color: C.navy, textDecoration: "none" }}>alphavantage.co</a></label>
            <input style={inp} type="password" placeholder="AREI4UOU…" value={keys.alphavantage || ""} onChange={e => setKeys(k => ({ ...k, alphavantage: e.target.value }))} autoComplete="off" spellCheck="false" />
          </div>
          <button onClick={handleSave} style={{ background: saved ? C.greenLight : C.navy, border: saved ? `1px solid rgba(5,150,105,0.2)` : "none", borderRadius: "12px", padding: "12px", color: saved ? C.green : "#fff", fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer", transition: "all 0.2s" }}>
            {saved ? "✓ Clés sauvegardées" : "Sauvegarder les clés"}
          </button>
          {hasKeys && (
            <button onClick={() => { localStorage.removeItem("bourse_api_keys"); setKeys({}); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "12px", padding: "9px", color: C.inkMuted, fontSize: "11px", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>
              Effacer les clés stockées
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Profil Tab ───────────────────────────────────────────────────────────────
function AccountDatesSection() {
  const [peaDate, setPeaDate] = useState(() => load("bourse_pea_ouverture", ""));
  const [ctoDate, setCtoDate] = useState(() => load("bourse_cto_ouverture", ""));
  const [saved, setSaved]     = useState(false);

  const handleSave = () => {
    if (peaDate) save("bourse_pea_ouverture", peaDate);
    else try { localStorage.removeItem("bourse_pea_ouverture"); } catch {}
    if (ctoDate) save("bourse_cto_ouverture", ctoDate);
    else try { localStorage.removeItem("bourse_cto_ouverture"); } catch {}
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const agePEA = peaDate ? ((Date.now() - new Date(peaDate).getTime()) / (1000*60*60*24*365)).toFixed(1) : null;
  const ageCTO = ctoDate ? ((Date.now() - new Date(ctoDate).getTime()) / (1000*60*60*24*365)).toFixed(1) : null;

  const inp = { width: "100%", background: "rgba(248,249,250,0.8)", border: `1px solid ${C.border}`, borderRadius: "12px", padding: "10px 14px", color: C.ink, fontSize: "13px", fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box", fontWeight: "500" };
  const lbl = { fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "22px", marginBottom: "22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={C.goldDark} strokeWidth="1.6" strokeLinecap="round">
            <rect x="2" y="3" width="12" height="11" rx="2"/><line x1="5" y1="1" x2="5" y2="5"/><line x1="11" y1="1" x2="11" y2="5"/><line x1="2" y1="7" x2="14" y2="7"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: "12px", color: C.navy, fontWeight: "700" }}>Dates d'ouverture des comptes</div>
          <div style={{ fontSize: "10px", color: C.inkSubtle }}>Nécessaire pour le calcul fiscal du simulateur de vente</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <div>
          <label style={lbl}>Ouverture PEA</label>
          <input style={inp} type="date" value={peaDate} onChange={e => setPeaDate(e.target.value)} />
          {agePEA && (
            <div style={{ fontSize: "10px", marginTop: "5px", color: Number(agePEA) >= 5 ? C.green : C.goldDark, fontWeight: "600" }}>
              {Number(agePEA) >= 5 ? `✓ ${agePEA} ans — exonération IR (17,2% PS)` : `⚠ ${agePEA} ans — flat tax 30% encore applicable`}
            </div>
          )}
        </div>
        <div>
          <label style={lbl}>Ouverture CTO</label>
          <input style={inp} type="date" value={ctoDate} onChange={e => setCtoDate(e.target.value)} />
          {ageCTO && <div style={{ fontSize: "10px", marginTop: "5px", color: C.inkSubtle }}>{ageCTO} ans — flat tax 30% ou barème IR</div>}
        </div>
      </div>
      <button onClick={handleSave}
        style={{ padding: "8px 18px", borderRadius: "10px", border: saved ? `1px solid rgba(5,150,105,0.25)` : `1px solid ${C.border}`, background: saved ? C.greenLight : C.snowOff, color: saved ? C.green : C.inkMuted, fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter, sans-serif", transition: "all 0.2s" }}>
        {saved ? "✓ Dates enregistrées" : "Enregistrer les dates"}
      </button>
    </div>
  );
}

function ProfilTab({ profil, onChange }) {
  const [form, setForm]   = useState(profil);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const p = {
      ...form,
      capital:    parseFloat(String(form.capital).replace(",", "."))    || 0,
      capitalPEA: parseFloat(String(form.capitalPEA).replace(",", ".")) || 0,
      capitalCTO:  parseFloat(String(form.capitalCTO  || "0").replace(",", ".")) || 0,
      especesPEA:  parseFloat(String(form.especesPEA || "0").replace(",", ".")) || 0,
      especesCTO:  parseFloat(String(form.especesCTO || "0").replace(",", ".")) || 0,
      dcaMensuel: parseFloat(String(form.dcaMensuel).replace(",", ".")) || 0,
      dcaDuree:   parseInt(String(form.dcaDuree))                       || 12,
    };
    onChange(p); save("bourse_profil", p);
    setSaved(true); setTimeout(() => setSaved(false), 2200);
  };

  const inp = { width: "100%", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "12px 16px", color: C.ink, fontSize: "14px", fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box", fontWeight: "500" };
  const lbl = { fontSize: "10px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px", display: "block" };
  const optBtn = (active) => ({ flex: 1, padding: "12px 8px", background: active ? C.paleBlue : C.snowOff, border: active ? `1px solid rgba(30,58,95,0.12)` : `1px solid ${C.border}`, borderRadius: "12px", color: active ? C.navy : C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", cursor: "pointer", textAlign: "center", fontWeight: active ? "700" : "400" });

  return (
    <div>
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
      <div style={{ background: C.cardGradPurp, border: `1px solid ${C.border}`, borderRadius: "22px", padding: "32px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "12px", color: C.ink, fontWeight: "800", letterSpacing: "0.5px", marginBottom: "26px" }}>Configuration investisseur</div>


        <div style={{ marginBottom: "22px" }}>
          <label style={lbl}>Horizon d'investissement</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {[["court", "Court", "< 1 an"], ["moyen", "Moyen", "1–3 ans"], ["long", "Long", "> 3 ans"]].map(([v, l, sub]) => (
              <button key={v} style={optBtn(form.horizon === v)} onClick={() => setForm(f => ({ ...f, horizon: v }))}>
                <div style={{ fontWeight: "700" }}>{l}</div>
                <div style={{ fontSize: "10px", opacity: 0.6, marginTop: "3px" }}>{sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "28px" }}>
          <label style={lbl}>Tolérance au risque</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {[["prudent", "Prudent", "5% / ligne"], ["equilibre", "Équilibré", "10% / ligne"], ["dynamique", "Dynamique", "15% / ligne"], ["tres-dynamique", "Très dynamique", "20% / ligne"]].map(([v, l, sub]) => (
              <button key={v} style={optBtn(form.risque === v)} onClick={() => setForm(f => ({ ...f, risque: v }))}>
                <div style={{ fontWeight: "700" }}>{l}</div>
                <div style={{ fontSize: "10px", opacity: 0.6, marginTop: "3px" }}>{sub}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "22px", marginBottom: "24px" }}>
          <div style={{ fontSize: "12px", color: C.navy, fontWeight: "700", marginBottom: "18px" }}>Stratégie DCA</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <label style={lbl}>Capital total PEA (€)</label>
              <input style={inp} type="number" min="0" placeholder="0" value={form.capitalPEA || ""} onChange={e => setForm(f => ({ ...f, capitalPEA: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Capital total CTO (€)</label>
              <input style={inp} type="number" min="0" placeholder="0" value={form.capitalCTO || ""} onChange={e => setForm(f => ({ ...f, capitalCTO: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Espèces disponibles PEA (€)</label>
              <input style={inp} type="number" min="0" placeholder="0" value={form.especesPEA || ""} onChange={e => setForm(f => ({ ...f, especesPEA: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Espèces disponibles CTO (€)</label>
              <input style={inp} type="number" min="0" placeholder="0" value={form.especesCTO || ""} onChange={e => setForm(f => ({ ...f, especesCTO: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Versement mensuel DCA (€)</label>
              <input style={inp} type="number" min="0" placeholder="0" value={form.dcaMensuel || ""} onChange={e => setForm(f => ({ ...f, dcaMensuel: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Durée DCA (mois)</label>
              <input style={inp} type="number" min="1" max="360" placeholder="12" value={form.dcaDuree || ""} onChange={e => setForm(f => ({ ...f, dcaDuree: e.target.value }))} />
            </div>
          </div>
        </div>

        <AccountDatesSection />

        <button onClick={handleSave}
          style={{ width: "100%", background: saved ? C.greenLight : C.navy, border: saved ? `1px solid rgba(5,150,105,0.2)` : "none", borderRadius: "14px", padding: "14px", color: saved ? C.green : "#fff", fontSize: "13px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer", transition: "all 0.2s", boxShadow: saved ? "none" : shadow.hover }}>
          {saved ? "✓ Enregistré" : "Enregistrer le profil"}
        </button>

        {Number(form.dcaMensuel) > 0 && (() => {
          const dca     = Number(form.dcaMensuel);
          const capital = Number(form.capitalPEA) || 0;
          const libre   = Number(form.capital) || 0;
          // Projection avec capitalisation : PEA(t) = capital*(1+r)^t + dca*((1+r)^t - 1)/r
          const proj = (mois, tauxAnnuel) => {
            const r = tauxAnnuel / 12;
            if (r === 0) return capital + dca * mois;
            return capital * Math.pow(1 + r, mois) + dca * (Math.pow(1 + r, mois) - 1) / r;
          };
          const horizons = [
            { label: "6 mois",  m: 6   },
            { label: "1 an",    m: 12  },
            { label: "3 ans",   m: 36  },
            { label: "5 ans",   m: 60  },
            { label: "10 ans",  m: 120 },
            { label: "20 ans",  m: 240 },
            { label: "30 ans",  m: 360 },
          ];
          return (
            <div style={{ marginTop: "22px" }}>
              {/* Budget ce mois */}
              {libre > 0 && (
                <div style={{ background: C.goldLight, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: "10px", padding: "14px 16px", marginBottom: "12px" }}>
                  <div style={{ fontSize: "10px", color: C.goldDark, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Budget disponible ce mois</div>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: C.ink }}>{fmtEur(libre + dca)}</div>
                  <div style={{ fontSize: "11px", color: C.inkMuted, marginTop: "3px" }}>{fmtEur(libre)} capital libre + {fmtEur(dca)} versement DCA</div>
                </div>
              )}
              {/* Tableau projections */}
              <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "hidden", boxShadow: shadow.card }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px" }}>Horizon</div>
                  <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", textAlign: "right" }}>DCA versé</div>
                </div>
                {horizons.map(({ label, m }) => (
                  <div key={m} style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", background: m === 120 ? C.navyLight : "transparent" }}>
                    <div style={{ fontSize: "12px", fontWeight: m === 120 ? "700" : "500", color: m === 120 ? C.navy : C.ink }}>{label}</div>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: C.navy, textAlign: "right" }}>{fmtEur(dca * m)}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
      </div>
    </div>
  );
}


// ─── Paramètres Tab ──────────────────────────────────────────────────────────
const AI_CONFIG_KEY = "bourse_ai_config";
const AI_EMOJI_KEY  = "bourse_ai_emoji";
const AI_EMOJI_OPTIONS = [
  { label: "Hommes", emojis: ["👨","👨🏻","👨🏼","👨🏽","👨🏾","👨🏿","👨‍💼","👨🏻‍💼","👨🏼‍💼","👨🏽‍💼","👨🏾‍💼","👨🏿‍💼","👨‍🏫","👨🏻‍🏫","👨🏼‍🏫","👨🏽‍🏫","👨🏾‍🏫","👨🏿‍🏫"] },
  { label: "Femmes", emojis: ["👩","👩🏻","👩🏼","👩🏽","👩🏾","👩🏿","👩‍💼","👩🏻‍💼","👩🏼‍💼","👩🏽‍💼","👩🏾‍💼","👩🏿‍💼","👩‍🏫","👩🏻‍🏫","👩🏼‍🏫","👩🏽‍🏫","👩🏾‍🏫","👩🏿‍🏫"] },
  { label: "Neutres", emojis: ["🧑","🧑🏻","🧑🏼","🧑🏽","🧑🏾","🧑🏿","🧑‍💼","🧑🏻‍💼","🧑🏼‍💼","🧑🏽‍💼","🧑🏾‍💼","🧑🏿‍💼"] },
  { label: "Autres",  emojis: ["🤖","👾","🦾","🧠","🎓","💡","📊","🦅","🦁","🐺","🦊","⚡","🔮","🪄","💎","🏆","🎯","🚀","🌟","✨","🔥","💫","🦋","🐉","🦄","🧬","⚙️","🛡️","🎪","🌈"] },
];

function ParametresTab() {
  const [aiCfg, setAiCfg] = useState(() => {
    try { return JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || "{}"); } catch { return {}; }
  });
  const [aiEmoji, setAiEmoji] = useState(() => localStorage.getItem(AI_EMOJI_KEY) || "🤖");
  const [emojiCatIdx, setEmojiCatIdx] = useState(0);

  const saveAiCfg = (update) => {
    const next = { ...aiCfg, ...update };
    setAiCfg(next);
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(next));
  };
  const pickAiEmoji = (e) => { setAiEmoji(e); localStorage.setItem(AI_EMOJI_KEY, e); };

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Clés API */}
      <ApiKeysSection />

      {/* Personnalisation Assistant IA */}
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "18px", padding: "20px 22px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "12px", color: C.navy, fontWeight: "700", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          Personnaliser l'assistant IA
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Emoji de l'assistant */}
          <div>
            <label style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", display: "block", marginBottom: "8px" }}>Avatar de l'assistant</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
              <span style={{ fontSize: "32px" }}>{aiEmoji}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                {AI_EMOJI_OPTIONS.map((cat, i) => (
                  <button key={i} onClick={() => setEmojiCatIdx(i)}
                    style={{ padding: "4px 10px", borderRadius: "8px", border: `1px solid ${emojiCatIdx === i ? C.navy : C.border}`, background: emojiCatIdx === i ? C.navyLight : C.snowOff, color: emojiCatIdx === i ? C.navy : C.inkMuted, fontSize: "11px", fontFamily: "Inter,sans-serif", fontWeight: "600", cursor: "pointer" }}>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {AI_EMOJI_OPTIONS[emojiCatIdx].emojis.map(e => (
                <button key={e} onClick={() => pickAiEmoji(e)}
                  style={{ width: "36px", height: "36px", borderRadius: "8px", border: aiEmoji === e ? `2px solid ${C.navy}` : `1px solid ${C.border}`, background: aiEmoji === e ? C.navyLight : C.snowOff, cursor: "pointer", fontSize: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", display: "block", marginBottom: "5px" }}>Nom de l'assistant</label>
            <input
              value={aiCfg.nom || ""}
              onChange={e => saveAiCfg({ nom: e.target.value })}
              placeholder="ex: Aria, Max, Léa…"
              style={{ width: "100%", fontSize: "13px", fontFamily: "Inter,sans-serif", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", background: C.snowOff, color: C.ink, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", display: "block", marginBottom: "5px" }}>Ton</label>
            <select
              value={aiCfg.ton || "pedagogique"}
              onChange={e => saveAiCfg({ ton: e.target.value })}
              style={{ width: "100%", fontSize: "13px", fontFamily: "Inter,sans-serif", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", background: C.snowOff, color: C.ink, outline: "none" }}>
              <option value="pedagogique">Pédagogique (par défaut)</option>
              <option value="professionnel">Direct et professionnel</option>
              <option value="conservateur">Prudent et conservateur</option>
              <option value="motivant">Motivant et positif</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", display: "block", marginBottom: "5px" }}>Longueur des réponses</label>
            <select
              value={aiCfg.longueur || "concis"}
              onChange={e => saveAiCfg({ longueur: e.target.value })}
              style={{ width: "100%", fontSize: "13px", fontFamily: "Inter,sans-serif", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", background: C.snowOff, color: C.ink, outline: "none" }}>
              <option value="concis">Concis (3-5 phrases)</option>
              <option value="detaille">Détaillé (réponses complètes)</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", display: "block", marginBottom: "5px" }}>Instructions personnalisées</label>
            <textarea
              value={aiCfg.instructions || ""}
              onChange={e => saveAiCfg({ instructions: e.target.value })}
              placeholder="ex: Je suis un investisseur prudent, privilégie les ETF. Ne me parle jamais d'actions individuelles risquées."
              rows={4}
              style={{ width: "100%", fontSize: "12px", fontFamily: "Inter,sans-serif", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", background: C.snowOff, color: C.ink, outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px" }}>Ces instructions sont injectées dans chaque conversation avec l'assistant.</div>
          </div>
          {(aiCfg.nom || aiCfg.instructions) && (
            <button onClick={() => saveAiCfg({ nom: "", ton: "pedagogique", longueur: "concis", instructions: "" })}
              style={{ alignSelf: "flex-start", background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "7px 14px", color: C.red, fontSize: "11px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer" }}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Sauvegarde / Restauration */}
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "18px", padding: "20px 22px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "12px", color: C.navy, fontWeight: "700", marginBottom: "14px" }}>Sauvegarde des données</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={() => {
            const ks = ["bourse_portfolio","bourse_profil","bourse_avis_operes","bourse_market_scores","bourse_signal_history","bourse_port_result","bourse_last_import","bourse_dark"];
            const data = {}; ks.forEach(k => { const v = localStorage.getItem(k); if (v) data[k] = v; });
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `bourse-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
          }} style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, borderRadius: "8px", padding: "9px 16px", color: C.navy, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer" }}>
            ↓ Exporter JSON
          </button>
          <label style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "9px 16px", color: C.inkMuted, fontSize: "12px", fontFamily: "Inter, sans-serif", fontWeight: "700", cursor: "pointer" }}>
            ↑ Importer JSON
            <input type="file" accept=".json" style={{ display: "none" }} onChange={e => {
              const file = e.target.files?.[0]; if (!file) return;
              const r = new FileReader();
              r.onload = ev => { try { const data = JSON.parse(ev.target.result); Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v)); window.location.reload(); } catch { alert("Fichier invalide"); } };
              r.readAsText(file); e.target.value = "";
            }} />
          </label>
        </div>
        <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "8px" }}>
          Sauvegardez et restaurez toutes vos données locales (portefeuille, avis d'opérés, profil).
        </div>
      </div>

      <div style={{ fontSize: "11px", color: C.inkSubtle, textAlign: "center", padding: "8px" }}>
        Ces données sont stockées localement sur votre appareil uniquement.
      </div>
    </div>
  );
}

// ─── Réconciliation ───────────────────────────────────────────────────────────
function Reconciliation({ account = "PEA" }) {
  const ops      = load("bourse_avis_operes", []).filter(o => (o.compte || "PEA") === account);
  const portPos  = load("bourse_portfolio", []).filter(p => (p.compte || "PEA") === account);
  if (ops.length === 0 || portPos.length === 0) return null;

  // Recalculate positions from ops
  const byKey = {};
  const sorted = [...ops].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const typeOrder = { ACHAT: 0, DIVIDENDE: 1, VENTE: 2 };
    return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
  });
  for (const op of sorted) {
    const key = op.isin || op.titre;
    if (!byKey[key]) byKey[key] = { titre: op.titre, isin: op.isin, qte: 0, pru: 0 };
    const e = byKey[key]; const qte = parseFloat(op.quantite)||0; const prix = parseFloat(op.prixUnitaire)||0; const frais = parseFloat(op.frais)||0;
    if (op.type === "ACHAT") { const t = e.pru * e.qte + prix * qte + frais; e.qte += qte; e.pru = e.qte > 0 ? t / e.qte : 0; }
    else if (op.type === "VENTE") { e.qte -= qte; if (e.qte < 0.001) e.qte = 0; }
  }

  const divergences = [];
  for (const [key, calc] of Object.entries(byKey)) {
    if (calc.qte <= 0) continue;
    const port = portPos.find(p => p.isin === calc.isin || p.nom?.toLowerCase() === calc.titre?.toLowerCase());
    if (!port) {
      divergences.push({ titre: calc.titre, isin: calc.isin, type: "ABSENT", detail: `${calc.qte} titres calculés mais absent du portefeuille` });
    } else {
      const dQte = Math.abs(port.quantite - calc.qte);
      const dPru = port.pru && calc.pru ? Math.abs(port.pru - calc.pru) : 0;
      if (dQte > 0.5) divergences.push({ titre: calc.titre, isin: calc.isin, type: "QTÉ", detail: `Portif: ${port.quantite} · Calculé: ${Math.round(calc.qte)}` });
      else if (dPru > port.pru * 0.02) divergences.push({ titre: calc.titre, isin: calc.isin, type: "PRU", detail: `Portif: ${fmtCours(port.pru)} · Calculé: ${fmtCours(calc.pru)}` });
    }
  }

  if (divergences.length === 0) {
    return (
      <div style={{ background: C.greenLight, border: `1px solid rgba(5,150,105,0.2)`, borderRadius: "10px", padding: "14px 18px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "13px" }}>✓</span>
        <div style={{ fontSize: "12px", fontWeight: "700", color: C.green }}>Réconciliation OK — portefeuille cohérent avec les avis d'opérés</div>
      </div>
    );
  }

  return (
    <div style={{ background: C.cardGradRed, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "18px", padding: "18px 22px", marginBottom: "20px", boxShadow: shadow.card }}>
      <div style={{ fontSize: "11px", fontWeight: "800", color: C.red, marginBottom: "12px" }}>⚠ Réconciliation — {divergences.length} divergence{divergences.length>1?"s":""} détectée{divergences.length>1?"s":""}</div>
      {divergences.map((d, i) => (
        <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "7px 0", borderBottom: i < divergences.length-1 ? `1px solid ${C.border}` : "none" }}>
          <span style={{ fontSize: "9px", fontWeight: "800", color: d.type === "ABSENT" ? C.red : C.goldDark, background: d.type === "ABSENT" ? C.redLight : C.goldLight, borderRadius: "4px", padding: "2px 7px", whiteSpace: "nowrap" }}>{d.type}</span>
          <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{d.titre}</div>
          {d.isin && <div style={{ fontSize: "9px", color: C.inkSubtle, fontFamily: "monospace" }}>{d.isin}</div>}
          <div style={{ fontSize: "11px", color: C.inkMuted, marginLeft: "auto" }}>{d.detail}</div>
        </div>
      ))}
    </div>
  );
}


// ─── Alertes frais de courtage ───────────────────────────────────────────────
function FeeWarnings({ account = "PEA" }) {
  const ops = load("bourse_avis_operes", []).filter(o => (o.compte || "PEA") === account && o.type === "ACHAT");
  if (!ops.length) return null;

  // Grouper par ISIN/titre → calculer ratio frais moyen
  const byKey = {};
  for (const op of ops) {
    const key   = op.isin || op.titre;
    const qte   = parseFloat(op.quantite)    || 0;
    const prix  = parseFloat(op.prixUnitaire) || 0;
    const frais = parseFloat(op.frais)        || 0;
    if (qte <= 0 || prix <= 0) continue;
    const montant = qte * prix;
    if (!byKey[key]) byKey[key] = { titre: op.titre, isin: op.isin, totalMontant: 0, totalFrais: 0, trades: [] };
    byKey[key].totalMontant += montant;
    byKey[key].totalFrais   += frais;
    byKey[key].trades.push({ qte, prix, frais, ratio: frais / montant });
  }

  const warnings = Object.values(byKey)
    .map(e => ({ ...e, ratio: e.totalMontant > 0 ? e.totalFrais / e.totalMontant : 0 }))
    .filter(e => e.ratio > 0.01) // > 1%
    .sort((a, b) => b.ratio - a.ratio);

  if (!warnings.length) return null;

  return (
    <div style={{ background: C.cardGradGold, borderRadius: "20px", padding: "18px 22px", marginBottom: "20px", boxShadow: shadow.card, border: `1px solid rgba(245,158,11,0.30)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <span style={{ fontSize: "16px" }}>⚡</span>
        <span style={{ fontSize: "12px", fontWeight: "800", color: C.goldDark }}>Frais de courtage élevés</span>
        <span style={{ fontSize: "10px", color: C.inkSubtle, background: C.snowOff, borderRadius: "5px", padding: "2px 7px", marginLeft: "auto" }}>{warnings.length} position{warnings.length > 1 ? "s" : ""}</span>
      </div>
      {warnings.map((w, i) => {
        const pct     = (w.ratio * 100).toFixed(1);
        const severe  = w.ratio > 0.03;
        const qteMin  = w.totalFrais > 0 && w.trades[0]?.prix > 0
          ? Math.ceil(w.totalFrais / (w.trades[0].prix * 0.01))  // qté pour ramener à 1%
          : null;
        return (
          <div key={i} style={{ padding: "10px 0", borderBottom: i < warnings.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
              <span style={{ fontSize: "10px", fontWeight: "800", color: severe ? C.red : C.goldDark, background: severe ? C.redLight : C.goldLight, borderRadius: "5px", padding: "2px 8px" }}>
                {pct}% de frais
              </span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{w.titre}</span>
              {w.isin && <span style={{ fontSize: "9px", color: C.inkSubtle, fontFamily: "monospace" }}>{w.isin}</span>}
            </div>
            <div style={{ fontSize: "11px", color: C.inkMuted, lineHeight: "1.6" }}>
              Frais cumulés : <strong style={{ color: C.ink }}>{fmtEur(w.totalFrais)}</strong> sur <strong style={{ color: C.ink }}>{fmtEur(w.totalMontant)}</strong> investis.
              {severe && (
                <span style={{ color: C.red }}> Ratio critique — les frais absorbent une part significative du rendement potentiel.</span>
              )}
            </div>
            {qteMin && w.trades[0]?.prix > 0 && (
              <div style={{ marginTop: "5px", fontSize: "10px", color: C.inkSubtle, background: C.snowOff, borderRadius: "6px", padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                💡 Pour ramener les frais à &lt;1% : investir sur au moins{" "}
                <strong style={{ color: C.ink }}>{fmtEur(w.totalFrais * 100)}</strong> ({Math.ceil(w.totalFrais / (w.trades[0].prix * 0.01)).toLocaleString("fr-FR")} titres à ce cours)
              </div>
            )}
          </div>
        );
      })}
      <div style={{ marginTop: "10px", fontSize: "10px", color: C.inkSubtle, opacity: 0.7 }}>
        ⚠ Informations basées sur vos avis opérés importés · Indicatif uniquement
      </div>
    </div>
  );
}

// ─── Benchmark Indices 6 mois / 1 an ─────────────────────────────────────────
const BETA_SCALE = [
  { min: 2,     max: Infinity, label: "Très Élevé",        color: "#C0392B" },
  { min: 1.501, max: 1.999,    label: "Élevée",             color: "#E74C3C" },
  { min: 1.01,  max: 1.5,      label: "Moyennement Élevé",  color: "#E67E22" },
  { min: 1,     max: 1,        label: "Neutre",              color: "#7F8C8D" },
  { min: 0.501, max: 0.999,    label: "Moyennement Faible",  color: "#27AE60" },
  { min: 0.001, max: 0.5,      label: "Faible",              color: "#1E8449" },
  { min: 0,     max: 0,        label: "Très Faible",         color: "#117A65" },
];
function betaClassify(beta) {
  if (beta === null || beta === undefined || isNaN(beta)) return null;
  const abs = Math.abs(beta);
  for (const s of BETA_SCALE) {
    if (abs >= s.min && abs <= s.max) return s;
    if (s.min === 2 && abs >= 2) return s;
  }
  return BETA_SCALE[BETA_SCALE.length - 1];
}

const BENCHMARK_CACHE_KEY = "bourse_benchmark_cache";
const TICKER_CACHE_KEY    = "bourse_isin_ticker_cache";
const BENCHMARK_TTL_MS    = 4 * 60 * 60 * 1000; // 4 heures

function BenchmarkComparaison() {
  const cached = (() => { try { return JSON.parse(localStorage.getItem(BENCHMARK_CACHE_KEY) || "null"); } catch { return null; } })();
  const cacheValid = cached && cached.ts && (Date.now() - cached.ts) < BENCHMARK_TTL_MS;

  const [indices, setIndices] = useState(cacheValid ? cached.indices : null);
  const [errors,  setErrors]  = useState(cacheValid ? (cached.errors || {}) : {});
  const [loading, setLoading] = useState(false);
  const [showBetaInfo, setShowBetaInfo] = useState(false);
  const portPos = load("bourse_portfolio", []);

  const totalInvesti = portPos.reduce((s, p) => s + (p.pru||0)*(p.quantite||0), 0);
  const totalActuel  = portPos.reduce((s, p) => s + ((p.dernierCours||p.pru||0))*(p.quantite||0), 0);
  const perfPortif   = totalInvesti > 0 ? (totalActuel - totalInvesti) / totalInvesti * 100 : null;

  // Auto-fetch si pas de cache valide
  useEffect(() => {
    if (!cacheValid && portPos.length > 0) fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch performance via Yahoo Finance (proxied via corsproxy.io)
  // interval=1d pour une précision maximale : on prend le premier et dernier close de la période
  const fetchPerf = async (symbol, months) => {
    const to   = Math.floor(Date.now() / 1000);
    const from = to - months * 30 * 86400;
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${to}&interval=1d`;
    const res = await fetchWithProxy(yahooUrl, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const closes = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(v => v != null);
    if (closes.length < 2) throw new Error("Pas de données");
    return (closes[closes.length - 1] - closes[0]) / closes[0] * 100;
  };

  const fetchAll = async () => {
    setLoading(true); setErrors({});
    const INDICES = [
      { key: "cac40", symbol: "^FCHI"     },  // CAC 40
      { key: "cact",  symbol: "^CACT"     },  // CAC All-Tradable
      { key: "stoxx", symbol: "^STOXX50E" },  // EURO STOXX 50
      { key: "cw8",   symbol: "CW8.PA"    },  // Amundi MSCI World PEA
    ];
    const results = {}; const errs = {};
    await Promise.all(INDICES.flatMap(({ key, symbol }) => [
      fetchPerf(symbol, 6).then(v  => { results[`${key}_6m`] = v; }).catch(e => { errs[`${key}_6m`] = e.message; }),
      fetchPerf(symbol, 12).then(v => { results[`${key}_1y`] = v; }).catch(e => { errs[`${key}_1y`] = e.message; }),
    ]));
    // Persist en cache
    try { localStorage.setItem(BENCHMARK_CACHE_KEY, JSON.stringify({ ts: Date.now(), indices: results, errors: errs })); } catch {}
    setIndices(results);
    setErrors(errs);
    setLoading(false);
  };

  if (portPos.length === 0) return null;

  // Bêta simplifié = perf portif (depuis achat) / perf CAC40 1an
  const cac1y = indices?.cac40_1y;
  const beta  = (perfPortif != null && cac1y && cac1y !== 0) ? perfPortif / cac1y : null;
  const betaCls = betaClassify(beta);

  const PerfVal = ({ value, err, size = "14px" }) => {
    if (loading) return <span style={{ color: C.inkSubtle }}>⏳</span>;
    if (!indices) return <span style={{ color: C.inkSubtle }}>—</span>;
    if (err) return <span style={{ fontSize: "10px", color: C.inkMuted }} title={err}>N/D</span>;
    if (value == null) return <span style={{ color: C.inkMuted }}>—</span>;
    return <span style={{ fontSize: size, fontWeight: "800", color: value >= 0 ? C.green : C.red }}>{value >= 0 ? "+" : ""}{value.toFixed(2).replace(".", ",")}%</span>;
  };

  const Row = ({ label, v6m, v1y, e6m, e1y, bold }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: "13px", fontWeight: bold ? "700" : "500", color: bold ? C.ink : C.ink }}>{label}</span>
      <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
        <div style={{ textAlign: "right", minWidth: "70px" }}>
          <div style={{ fontSize: "9px", color: C.inkSubtle, marginBottom: "2px" }}>6 mois</div>
          <PerfVal value={v6m} err={e6m} />
        </div>
        <div style={{ textAlign: "right", minWidth: "70px" }}>
          <div style={{ fontSize: "9px", color: C.inkSubtle, marginBottom: "2px" }}>1 an</div>
          <PerfVal value={v1y} err={e1y} />
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "18px", padding: "18px 22px", marginBottom: "20px", boxShadow: shadow.card }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: "800", color: C.ink }}>📊 Performance vs Indices</div>
          {cached?.ts && <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "2px" }}>
            Mis à jour le {new Date(cached.ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </div>}
        </div>
        <button onClick={fetchAll} disabled={loading}
          style={{ fontSize: "11px", fontWeight: "700", padding: "5px 12px", borderRadius: "7px", cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "Inter, sans-serif", background: C.navyLight, border: `1px solid rgba(30,58,95,0.12)`, color: C.navy }}>
          {loading ? <ThinkingSpinner size={13} color={C.inkSubtle} /> : "↻ Actualiser"}
        </button>
      </div>

      {/* Rendement portif */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>Rendement depuis achat</span>
        <span style={{ fontSize: "14px", fontWeight: "900", color: perfPortif != null ? (perfPortif >= 0 ? C.green : C.red) : C.inkMuted }}>
          {perfPortif != null ? `${perfPortif >= 0 ? "+" : ""}${perfPortif.toFixed(2).replace(".", ",")}%` : "—"}
        </span>
      </div>

      {/* VS indices */}
      <Row label="VS CAC 40"             v6m={indices?.cac40_6m} v1y={indices?.cac40_1y} e6m={errors.cac40_6m} e1y={errors.cac40_1y} />
      <Row label="VS CAC All Tradable"  v6m={indices?.cact_6m}  v1y={indices?.cact_1y}  e6m={errors.cact_6m}  e1y={errors.cact_1y} />
      <Row label="VS EURO STOXX 50"     v6m={indices?.stoxx_6m} v1y={indices?.stoxx_1y} e6m={errors.stoxx_6m} e1y={errors.stoxx_1y} />
      <Row label="VS CW8 MSCI World PEA" v6m={indices?.cw8_6m}  v1y={indices?.cw8_1y}   e6m={errors.cw8_6m}   e1y={errors.cw8_1y} />

      {/* Risque */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>Risque</span>
          <span onClick={() => setShowBetaInfo(v => !v)}
            style={{ fontSize: "9px", color: C.navy, cursor: "pointer", fontWeight: "800",
              border: `1px solid ${C.navy}`, borderRadius: "50%", padding: "1px 5px", userSelect: "none" }}>i</span>
        </div>
        <span style={{ fontSize: "14px", fontWeight: "800", color: betaCls?.color ?? C.inkMuted }}>
          {betaCls ? betaCls.label : "—"}
          {beta != null && <span style={{ fontSize: "10px", color: C.inkSubtle, marginLeft: "8px", fontWeight: "500" }}>β = {beta.toFixed(2)}</span>}
        </span>
        {showBetaInfo && (
          <div style={{ position: "absolute", bottom: "36px", right: "0", zIndex: 50, background: "#fff",
            border: `1px solid ${C.border}`, borderRadius: "8px", boxShadow: shadow.card, padding: "10px 14px", minWidth: "220px" }}>
            <div style={{ fontSize: "10px", fontWeight: "800", color: C.ink, marginBottom: "8px" }}>Échelle de bêta</div>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ fontSize: "9px", color: C.inkSubtle, padding: "3px 6px", textAlign: "left", fontWeight: "700" }}>Bêta</th>
                <th style={{ fontSize: "9px", color: C.inkSubtle, padding: "3px 6px", textAlign: "left", fontWeight: "700" }}>Classement</th>
              </tr></thead>
              <tbody>
                {BETA_SCALE.map((s, i) => (
                  <tr key={i} style={{ borderBottom: i < BETA_SCALE.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <td style={{ fontSize: "10px", fontWeight: "700", color: s.color, padding: "4px 6px", fontStyle: "italic" }}>
                      {s.min === s.max ? s.min : s.min === 2 ? "≥ 2" : `${s.min} – ${s.max}`}
                    </td>
                    <td style={{ fontSize: "10px", fontWeight: "700", color: s.color, padding: "4px 6px", fontStyle: "italic" }}>{s.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "8px" }}>β = perf portif (depuis achat) / perf CAC 40 (1 an)</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Statistiques Historique ──────────────────────────────────────────────────
function StatistiquesHistorique() {
  const operations         = load("bourse_avis_operes", []);
  const portfolioPositions = load("bourse_portfolio", []);
  const [sortKey, setSortKey] = useState("isin");
  const [sortDir, setSortDir] = useState("asc");
  const [methode, setMethode] = useState("pru"); // "pru" | "fifo"
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  if (operations.length === 0) return null;

  // ── Calcul chronologique PRU/FIFO + stats par titre ─────────────────────────
  const byTitre = {};
  const fifoQueues = {}; // { key: [{prix, qte}] } for FIFO
  const chronoOps = [...operations].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const typeOrder = { ACHAT: 0, DIVIDENDE: 1, VENTE: 2 };
    return (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0);
  });

  for (const op of chronoOps) {
    const key = op.isin || op.titre;
    if (!byTitre[key]) {
      byTitre[key] = { titre: op.titre, isin: op.isin, premiereDate: op.date, qte: 0, pru: 0, totalInvesti: 0, totalFrais: 0, realise: 0, dividendes: 0 };
      fifoQueues[key] = [];
    }
    const e     = byTitre[key];
    const qte   = parseFloat(op.quantite)     || 0;
    const prix  = parseFloat(op.prixUnitaire) || 0;
    const frais = parseFloat(op.frais)        || 0;

    if (op.type === "ACHAT") {
      const total = e.pru * e.qte + prix * qte;
      e.qte         += qte;
      e.pru          = e.qte > 0 ? total / e.qte : 0;
      e.totalInvesti += prix * qte + frais;
      e.totalFrais   += frais;
      if (methode === "fifo") fifoQueues[key].push({ prix, qte });
    } else if (op.type === "VENTE") {
      if (methode === "fifo") {
        let remaining = qte; let costBasis = 0;
        const queue = fifoQueues[key];
        while (remaining > 0.001 && queue.length > 0) {
          const lot = queue[0];
          const used = Math.min(lot.qte, remaining);
          costBasis += lot.prix * used;
          lot.qte -= used; remaining -= used;
          if (lot.qte < 0.001) queue.shift();
        }
        e.realise += prix * qte - costBasis - frais;
      } else {
        e.realise += (prix - e.pru) * qte - frais;
      }
      e.qte -= qte;
      if (e.qte < 0.001) e.qte = 0;
      e.totalFrais += frais;
    } else if (op.type === "DIVIDENDE") {
      e.dividendes += prix * qte;
    }
  }

  const today   = new Date();
  const entries = Object.values(byTitre)
    .map(e => {
      const pos   = portfolioPositions.find(p => p.isin === e.isin);
      const cours = pos ? (parseFloat(pos.dernierCours) || null) : null;
      const latent = e.qte > 0 && cours !== null ? (cours - e.pru) * e.qte : 0;
      const rendementTotal = e.realise + e.dividendes + latent;
      const rendementPct   = e.totalInvesti > 0 ? (rendementTotal / e.totalInvesti) * 100 : null;
      const joursDepuis    = e.premiereDate
        ? Math.round((today - new Date(e.premiereDate)) / 86400000) : null;
      return { ...e, cours, latent, rendementTotal, rendementPct, joursDepuis };
    })
    .sort((a, b) => {
      let va = a[sortKey] ?? ""; let vb = b[sortKey] ?? "";
      if (sortKey === "isin" || sortKey === "titre" || sortKey === "premiereDate") {
        const r = String(va).localeCompare(String(vb));
        return sortDir === "asc" ? r : -r;
      }
      va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
      return sortDir === "asc" ? va - vb : vb - va;
    });

  // ── Totaux globaux ─────────────────────────────────────────────────────────
  const gInvesti    = entries.reduce((s, e) => s + e.totalInvesti, 0);
  const gRealise    = entries.reduce((s, e) => s + e.realise, 0);
  const gDividendes = entries.reduce((s, e) => s + e.dividendes, 0);
  const gLatent     = entries.reduce((s, e) => s + e.latent, 0);
  const gTotal      = gRealise + gDividendes + gLatent;
  const gPct        = gInvesti > 0 ? (gTotal / gInvesti) * 100 : 0;
  const premierDate = chronoOps[0]?.date ?? null;

  const pctColor = (v) => v === null ? C.inkSubtle : v >= 0 ? C.green : C.red;
  const fmtPl    = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} €`;
  const fmtPct2  = (v) => v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  const colGlob = { textAlign: "right" };
  const lbl9 = { fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "3px" };
  const val  = (v, color) => ({ fontSize: "15px", fontWeight: "800", color: color || C.ink });

  // ── Table header ───────────────────────────────────────────────────────────
  const tCols = "1fr 90px 80px 70px 50px 82px 72px 82px 82px 58px";
  const thS   = (key, align = "right") => ({
    fontSize: "9px", fontWeight: "700",
    color: sortKey === key ? C.navy : C.inkSubtle,
    textTransform: "uppercase", letterSpacing: "0.8px",
    textAlign: align, padding: "8px 10px",
    background: C.snowOff, borderBottom: `1px solid ${C.border}`,
    position: "sticky", top: 0, zIndex: 2,
    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
  });
  const thLabel = (key, label) => `${label}${sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}`;

  return (
    <div style={{ marginBottom: "28px" }}>
      {/* ── Synthèse globale ── */}
      <div style={{ background: C.cardGradGreen, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "22px 26px", marginBottom: "20px", boxShadow: shadow.card }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "18px" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: "800", color: C.ink, letterSpacing: "0.5px" }}>📈 Rendement global du portefeuille</div>
            {premierDate && <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "3px" }}>Depuis le {new Date(premierDate).toLocaleDateString("fr-FR")}</div>}
            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
              {["pru","fifo"].map(m => (
                <button key={m} onClick={() => setMethode(m)}
                  style={{ fontSize: "10px", fontWeight: "700", padding: "3px 10px", borderRadius: "6px", cursor: "pointer", fontFamily: "Inter, sans-serif", background: methode === m ? C.navyLight : C.snowOff, border: `1px solid ${methode === m ? "rgba(30,58,95,0.12)" : C.border}`, color: methode === m ? C.navy : C.inkSubtle }}>
                  {m === "pru" ? "PRU moyen" : "FIFO"}
                </button>
              ))}
              <button onClick={() => {
                const hdr = "Titre,ISIN,1er achat,Investi,PRU,Qté,P&L réalisé,Dividendes,Latent,Total,Rendement %";
                const rows = entries.map(e => [e.titre, e.isin||"", e.premiereDate||"", e.totalInvesti.toFixed(2), e.pru.toFixed(2), e.qte, e.realise.toFixed(2), e.dividendes.toFixed(2), e.latent.toFixed(2), e.rendementTotal.toFixed(2), e.rendementPct !== null ? e.rendementPct.toFixed(1) : ""].join(","));
                const csv = [hdr, ...rows].join("\n");
                const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `rendements-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
              }} style={{ fontSize: "10px", fontWeight: "700", padding: "3px 10px", borderRadius: "6px", cursor: "pointer", fontFamily: "Inter, sans-serif", background: C.snowOff, border: `1px solid ${C.border}`, color: C.inkMuted }}>
                ↓ CSV
              </button>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={lbl9}>Rendement total</div>
            <div style={{ fontSize: "24px", fontWeight: "900", color: pctColor(gTotal) }}>{fmtPl(gTotal)}</div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: pctColor(gTotal), marginTop: "1px" }}>{fmtPct2(gPct)}</div>
          </div>
        </div>
        <div className="ba-g4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          <div style={colGlob}>
            <div style={lbl9}>Total investi</div>
            <div style={val(gInvesti)}>{gInvesti.toFixed(0)} €</div>
          </div>
          <div style={colGlob}>
            <div style={lbl9}>P&amp;L réalisé</div>
            <div style={val(gRealise, pctColor(gRealise))}>{fmtPl(gRealise)}</div>
          </div>
          <div style={colGlob}>
            <div style={lbl9}>Dividendes</div>
            <div style={val(gDividendes, gDividendes > 0 ? C.goldDark : C.inkSubtle)}>{gDividendes > 0 ? `+${gDividendes.toFixed(2)} €` : "—"}</div>
          </div>
          <div style={colGlob}>
            <div style={lbl9}>P&amp;L latent</div>
            <div style={val(gLatent, pctColor(gLatent))}>{fmtPl(gLatent)}</div>
          </div>
        </div>
      </div>

      {/* ── Tableau par action ── */}
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "hidden", boxShadow: shadow.card }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: "700px" }}>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: tCols }}>
              <div style={thS("isin", "left")}    onClick={() => toggleSort("isin")}>{thLabel("isin", "Titre / ISIN")}</div>
              <div style={thS("premiereDate")}     onClick={() => toggleSort("premiereDate")}>{thLabel("premiereDate", "1er achat")}</div>
              <div style={thS("totalInvesti")}     onClick={() => toggleSort("totalInvesti")}>{thLabel("totalInvesti", "Investi")}</div>
              <div style={thS("pru")}              onClick={() => toggleSort("pru")}>{thLabel("pru", "PRU")}</div>
              <div style={thS("qte")}              onClick={() => toggleSort("qte")}>{thLabel("qte", "Qté")}</div>
              <div style={thS("realise")}          onClick={() => toggleSort("realise")}>{thLabel("realise", "P&L réalisé")}</div>
              <div style={thS("dividendes")}       onClick={() => toggleSort("dividendes")}>{thLabel("dividendes", "Dividendes")}</div>
              <div style={thS("latent")}           onClick={() => toggleSort("latent")}>{thLabel("latent", "Latent")}</div>
              <div style={thS("rendementTotal")}   onClick={() => toggleSort("rendementTotal")}>{thLabel("rendementTotal", "Total")}</div>
              <div style={thS("rendementPct")}     onClick={() => toggleSort("rendementPct")}>{thLabel("rendementPct", "%")}</div>
            </div>
            {/* Rows */}
            {entries.map(e => (
              <div key={e.isin || e.titre} style={{ display: "grid", gridTemplateColumns: tCols, padding: "9px 10px", borderBottom: `1px solid ${C.border}`, alignItems: "center", background: e.rendementTotal > 0 ? "rgba(45,122,82,0.03)" : e.rendementTotal < 0 ? "rgba(176,58,46,0.03)" : "transparent" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{e.titre}</div>
                  {e.isin && <div style={{ fontSize: "9px", color: C.inkSubtle, fontFamily: "monospace" }}>{e.isin}</div>}
                </div>
                <div style={{ fontSize: "10px", color: C.inkMuted, textAlign: "right" }}>{e.premiereDate || "—"}</div>
                <div style={{ fontSize: "11px", fontWeight: "600", color: C.ink, textAlign: "right" }}>{e.totalInvesti.toFixed(0)} €</div>
                <div style={{ fontSize: "11px", color: C.inkMuted, textAlign: "right" }}>{e.pru.toFixed(2)} €</div>
                <div style={{ fontSize: "11px", color: C.ink, textAlign: "right" }}>{e.qte > 0 ? e.qte : <span style={{ color: C.inkSubtle }}>Soldé</span>}</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: pctColor(e.realise), textAlign: "right" }}>{e.realise !== 0 ? fmtPl(e.realise) : "—"}</div>
                <div style={{ fontSize: "11px", fontWeight: "600", color: e.dividendes > 0 ? C.goldDark : C.inkSubtle, textAlign: "right" }}>{e.dividendes > 0 ? `+${e.dividendes.toFixed(2)} €` : "—"}</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: pctColor(e.latent), textAlign: "right" }}>{e.latent !== 0 ? fmtPl(e.latent) : "—"}</div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: pctColor(e.rendementTotal), textAlign: "right" }}>{fmtPl(e.rendementTotal)}</div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: pctColor(e.rendementPct), textAlign: "right" }}>{fmtPct2(e.rendementPct)}</div>
              </div>
            ))}
            {/* Total row */}
            <div style={{ display: "grid", gridTemplateColumns: tCols, padding: "10px 10px", background: C.snowOff, borderTop: `2px solid ${C.border}`, alignItems: "center" }}>
              <div style={{ fontSize: "11px", fontWeight: "800", color: C.ink }}>TOTAL</div>
              <div />
              <div style={{ fontSize: "11px", fontWeight: "800", color: C.ink, textAlign: "right" }}>{gInvesti.toFixed(0)} €</div>
              <div /><div />
              <div style={{ fontSize: "11px", fontWeight: "800", color: pctColor(gRealise), textAlign: "right" }}>{gRealise !== 0 ? fmtPl(gRealise) : "—"}</div>
              <div style={{ fontSize: "11px", fontWeight: "800", color: gDividendes > 0 ? C.goldDark : C.inkSubtle, textAlign: "right" }}>{gDividendes > 0 ? `+${gDividendes.toFixed(2)} €` : "—"}</div>
              <div style={{ fontSize: "11px", fontWeight: "800", color: pctColor(gLatent), textAlign: "right" }}>{gLatent !== 0 ? fmtPl(gLatent) : "—"}</div>
              <div style={{ fontSize: "13px", fontWeight: "900", color: pctColor(gTotal), textAlign: "right" }}>{fmtPl(gTotal)}</div>
              <div style={{ fontSize: "13px", fontWeight: "900", color: pctColor(gPct), textAlign: "right" }}>{fmtPct2(gPct)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Historique Tab ───────────────────────────────────────────────────────────
const SNAPSHOTS_KEY = "bourse_snapshots";
const CAPTURES_KEY  = "bourse_captures";


// ─── Évolution du capital investi (versements depuis transactions) ─────────────
function buildVersementsHistory() {
  const ops = (() => { try { return JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]"); } catch { return []; } })();
  const achats = ops
    .filter(o => o.type === "ACHAT" && o.date)
    .map(o => ({
      date:    o.date,
      montant: (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0),
      nom:     o.titre || o.isin || "?",
    }))
    .filter(o => o.montant > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (achats.length === 0) return [];

  const points = [];
  let cumul = 0;
  achats.forEach(({ date, montant, nom }) => {
    cumul += montant;
    points.push({ date, investi: cumul, label: nom, montant });
  });

  const today = new Date().toISOString().slice(0, 10);
  if (points[points.length - 1].date !== today) {
    points.push({ date: today, investi: cumul, label: "", montant: 0 });
  }

  return points;
}

function calcCapitalVerse() {
  try {
    const ops = JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]");
    const achats = ops.filter(o => o.type === "ACHAT")
      .reduce((s, o) => s + (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0), 0);
    const ventes = ops.filter(o => o.type === "VENTE")
      .reduce((s, o) => s + (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0), 0);
    // Net capital from outside: purchases minus reinvested sale proceeds
    return Math.max(0, achats - ventes);
  } catch { return 0; }
}

function takeSnapshot(positions) {
  const valeur       = positions.reduce((s, p) => s + (p.dernierCours || p.pru || 0) * (p.quantite || 0), 0);
  const coutBase     = positions.reduce((s, p) => s + (p.pru || 0) * (p.quantite || 0), 0);
  const capitalVerse = calcCapitalVerse() || coutBase;
  const investi      = capitalVerse; // backward compat
  if (valeur === 0) return;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const snaps = (() => { try { return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]"); } catch { return []; } })();
  // Ne pas doublonner le même jour
  const filtered = snaps.filter(s => s.date !== today);
  filtered.push({ date: today, valeur, investi, coutBase, capitalVerse });
  // Garder les 365 derniers jours
  filtered.sort((a, b) => a.date.localeCompare(b.date));
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(filtered.slice(-365)));
}

function VersementsChart({ points }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  if (points.length < 2) return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "36px 24px", textAlign: "center", marginBottom: "20px", boxShadow: shadow.card }}>
      <div style={{ fontSize: "13px", color: C.inkSubtle, marginBottom: "8px" }}>Aucun versement à afficher.</div>
      <div style={{ fontSize: "11px", color: C.inkSubtle }}>Renseignez la <strong>Date d'achat</strong> sur chacune de vos positions pour voir l'évolution de vos versements.</div>
    </div>
  );

  const VW=800, VH=200, ML=72, MR=16, MT=14, MB=28;
  const CW=VW-ML-MR, CH=VH-MT-MB;

  const invests = points.map(p => p.investi);
  const yMin = 0;
  const yMax = Math.max(...invests) * 1.08;
  const xS   = i => ML + (i / (points.length - 1)) * CW;
  const yS   = v => MT + (1 - (v - yMin) / (yMax - yMin)) * CH;

  // Step-path : chaque versement crée un échelon horizontal puis vertical
  let stepPath = `M${xS(0).toFixed(1)},${yS(invests[0]).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    // ligne horizontale jusqu'à xS(i) au niveau précédent, puis montée verticale
    stepPath += ` L${xS(i).toFixed(1)},${yS(invests[i-1]).toFixed(1)} L${xS(i).toFixed(1)},${yS(invests[i]).toFixed(1)}`;
  }
  const areaPath = stepPath + ` L${xS(points.length-1)},${yS(yMin)} L${xS(0)},${yS(yMin)} Z`;

  // Ticks Y
  const range = yMax - yMin;
  const step  = [200,500,1000,2000,5000,10000,20000,50000,100000].find(s => range/s <= 6) || 100000;
  const yTicks = [];
  for (let v = Math.ceil(yMin/step)*step; v <= yMax; v += step) yTicks.push(v);

  const handleMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width * VW - ML) / CW));
    setHoverIdx(Math.round(frac * (points.length - 1)));
  };

  const totalInvesti = invests[invests.length - 1];
  const nbVersements = points.filter(p => p.montant > 0).length;

  return (
    <div style={{ background: C.cardGradGold, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "22px", marginBottom: "20px", boxShadow: shadow.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase" }}>Évolution des versements</div>
          <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px" }}>
            {points[0].date} → {points[points.length - 1].date}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase" }}>Total investi</div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: C.green }}>{fmtEur(totalInvesti)}</div>
          </div>
          <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase" }}>Versements</div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: C.ink }}>{nbVersements}</div>
          </div>
        </div>
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
        onMouseMove={handleMove} onMouseLeave={() => setHoverIdx(null)}>
        {/* Grid Y */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={ML} x2={ML+CW} y1={yS(v)} y2={yS(v)} stroke={C.border} strokeWidth="1" strokeDasharray="4,4" />
            <text x={ML-5} y={yS(v)+4} textAnchor="end" fontSize="9" fill={C.inkSubtle} fontFamily="Inter,sans-serif">
              {v>=1000?`${Math.round(v/1000)}k`:v}€
            </text>
          </g>
        ))}
        {/* X labels */}
        {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 6)) === 0).map((p, k) => {
          const idx = points.indexOf(p);
          return (
            <text key={k} x={xS(idx)} y={MT+CH+18} textAnchor="middle" fontSize="8.5" fill={C.inkSubtle} fontFamily="Inter,sans-serif">
              {new Date(p.date).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })}
            </text>
          );
        })}
        {/* Aire */}
        <path d={areaPath} fill={C.green} opacity="0.10" />
        {/* Ligne step */}
        <path d={stepPath} fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Points versements (échelons) */}
        {points.filter(p => p.montant > 0).map((p, k) => {
          const idx = points.indexOf(p);
          return <circle key={k} cx={xS(idx)} cy={yS(invests[idx])} r="4" fill={C.green} stroke="#fff" strokeWidth="1.5" />;
        })}
        {/* Crosshair */}
        {hoverIdx != null && (
          <>
            <line x1={xS(hoverIdx)} x2={xS(hoverIdx)} y1={MT} y2={MT+CH} stroke="#94A3B8" strokeWidth="1" strokeDasharray="3,3" />
            <circle cx={xS(hoverIdx)} cy={yS(invests[hoverIdx])} r="4.5" fill={C.green} stroke="#fff" strokeWidth="2" />
          </>
        )}
      </svg>

      {hoverIdx != null && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", marginTop: "4px", fontSize: "11px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <span style={{ color: C.inkSubtle, fontWeight: "600" }}>{new Date(points[hoverIdx].date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
          {points[hoverIdx].montant > 0 && <span style={{ color: C.green, fontWeight: "800" }}>+{fmtEur(points[hoverIdx].montant)} — {points[hoverIdx].label}</span>}
          <span style={{ color: C.ink, fontWeight: "800" }}>Cumul : {fmtEur(invests[hoverIdx])}</span>
        </div>
      )}
    </div>
  );
}

// ─── Performance Globale (TWR / CAGR) ────────────────────────────────────────
function PerformanceGlobale({ positions, account = "PEA" }) {
  const ops = (() => { try { return JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]"); } catch { return []; } })()
    .filter(o => (o.compte || "PEA") === account);

  // ── Calculs globaux ──────────────────────────────────────────────────────────
  const achatOps  = ops.filter(o => o.type === "ACHAT"  && o.date && parseFloat(o.quantite) > 0 && parseFloat(o.prixUnitaire) > 0);
  const venteOps  = ops.filter(o => o.type === "VENTE"  && o.date && parseFloat(o.quantite) > 0);
  const divOps    = ops.filter(o => o.type === "DIVIDENDE" && o.date);

  const EV = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);

  const totalAchete  = achatOps.reduce((s, o) => s + (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0) + (parseFloat(o.frais) || 0), 0);
  const totalVendu   = venteOps.reduce((s, o) => s + (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0) - (parseFloat(o.frais) || 0), 0);
  const totalDivRec  = divOps.reduce((s, o) => s + (parseFloat(o.montant) || 0), 0);

  // Capital brut investi (total achats) — pour le calcul du gain absolu
  const capitalBase       = totalAchete > 0 ? totalAchete : positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  // Capital net déployé = achats − ventes (ce qui est réellement encore "sorti de poche")
  const costCurrentHold   = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const netInvesti        = Math.max(capitalBase - totalVendu, costCurrentHold);
  const gainBrut          = EV + totalVendu + totalDivRec - capitalBase;
  const rendPct           = netInvesti > 0 ? (gainBrut / netInvesti) * 100 : 0;

  // ── Décomposition gains / pertes ─────────────────────────────────────────────
  // Latents : sur positions encore ouvertes
  const pvLatentes        = positions.reduce((s, p) => { const g = (p.dernierCours || p.pru) * p.quantite - p.pru * p.quantite; return s + g; }, 0);
  const pvLatentesPct     = costCurrentHold > 0 ? (pvLatentes / costCurrentHold) * 100 : null;
  // Frais cumulés (tous types d'opérations)
  const totalFrais        = ops.reduce((s, o) => s + (parseFloat(o.frais) || 0), 0);
  // Réalisés : méthode PRU pondéré — séparation gains / pertes par opération de vente
  const { gainsRealises, pertesRealisees } = ops.length > 0 ? (() => {
    const by = {};
    const sorted = [...ops].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const t = { ACHAT: 0, DIVIDENDE: 1, VENTE: 2 };
      return (t[a.type] || 0) - (t[b.type] || 0);
    });
    let gains = 0, pertes = 0;
    for (const op of sorted) {
      const k = op.isin || op.titre || op.nom;
      if (!by[k]) by[k] = { qte: 0, pru: 0 };
      const e = by[k];
      const qte = parseFloat(op.quantite) || 0;
      const prix = parseFloat(op.prixUnitaire) || 0;
      const frais = parseFloat(op.frais) || 0;
      if (op.type === "ACHAT") {
        const total = e.pru * e.qte + prix * qte;
        e.qte += qte;
        e.pru = e.qte > 0 ? total / e.qte : 0;
      } else if (op.type === "VENTE") {
        const pnl = (prix - e.pru) * qte - frais;
        if (pnl >= 0) gains += pnl; else pertes += pnl;
        e.qte = Math.max(0, e.qte - qte);
      }
    }
    return { gainsRealises: gains, pertesRealisees: pertes };
  })() : { gainsRealises: null, pertesRealisees: null };
  const pvRealisees = gainsRealises !== null ? gainsRealises + pertesRealisees : null;

  // Date d'inception : première transaction ou dateAchat la plus ancienne
  const allDates = [
    ...achatOps.map(o => o.date),
    ...positions.map(p => p.dateAchat).filter(Boolean),
  ].filter(Boolean).sort();
  const inceptionStr = allDates[0] || null;
  const inception    = inceptionStr ? new Date(inceptionStr) : null;
  const today        = new Date();
  const totalDays    = inception ? Math.max(1, (today - inception) / 864e5) : null;
  const years        = totalDays ? totalDays / 365.25 : null;

  // CAGR simple : ((EV + ventes) / achats)^(1/t) - 1
  const cagr = (years && years >= 0.1 && capitalBase > 0)
    ? (Math.pow((EV + totalVendu + totalDivRec) / capitalBase, 1 / years) - 1) * 100
    : null;

  // Rendement annualisé Modified Dietz (approximation TWR tenant compte du timing)
  // R_dietz = (EV - BV - netCF) / (BV + Σ CF_i×W_i)
  // BV = 0 (départ de zéro), CF investor view: achat = -montant, vente = +montant
  let sumWCF = 0;
  if (inception) {
    for (const o of achatOps) {
      const d = new Date(o.date);
      const W = Math.max(0, (totalDays - (d - inception) / 864e5) / totalDays);
      const amt = (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0) + (parseFloat(o.frais) || 0);
      sumWCF += amt * W; // buy = positive weight (money deployed early counts more)
    }
    for (const o of venteOps) {
      const d = new Date(o.date);
      const W = Math.max(0, (totalDays - (d - inception) / 864e5) / totalDays);
      const amt = (parseFloat(o.quantite) || 0) * (parseFloat(o.prixUnitaire) || 0) - (parseFloat(o.frais) || 0);
      sumWCF -= amt * W; // sell = negative (money returned early reduces weight)
    }
  }
  const denomDietz  = sumWCF > 0 ? sumWCF : capitalBase;
  const netCF       = capitalBase - totalVendu; // net still invested
  const R_dietz     = denomDietz > 0 ? (EV + totalVendu - capitalBase) / denomDietz : null;
  const dietzCagr   = (R_dietz !== null && years && years >= 0.1)
    ? (Math.pow(1 + R_dietz, 1 / years) - 1) * 100
    : null;

  // ── Par position ─────────────────────────────────────────────────────────────
  const posPerf = positions.map(p => {
    const cours     = p.dernierCours || p.pru;
    const valeur    = cours * p.quantite;
    const investi   = p.pru * p.quantite;
    const pv        = valeur - investi;
    const pvPct     = investi > 0 ? (pv / investi) * 100 : 0;
    // CAGR par position depuis dateAchat
    const dateStr   = p.dateAchat || null;
    const posYears  = dateStr ? Math.max(0.01, (today - new Date(dateStr)) / (864e5 * 365.25)) : null;
    const posCagr   = (posYears && posYears >= 0.05 && p.pru > 0)
      ? (Math.pow(cours / p.pru, 1 / posYears) - 1) * 100 : null;
    return { ...p, valeur, investi, pv, pvPct, posCagr, posYears };
  }).sort((a, b) => b.pvPct - a.pvPct);

  const durLabel = (days) => {
    if (!days) return "—";
    if (days < 30)   return `${Math.round(days)}j`;
    if (days < 365)  return `${Math.round(days / 30)}mois`;
    const y = days / 365.25;
    return y < 2 ? `${y.toFixed(1)}an` : `${y.toFixed(1)}ans`;
  };

  const pctColor = (v) => v == null ? C.inkSubtle : v >= 0 ? C.green : C.red;
  const pctFmt   = (v) => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "22px", overflow: "hidden", boxShadow: shadow.card, marginBottom: "20px" }}>
      {/* Header */}
      <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}`, background: C.navyLight, display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.navy, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1.5,11.5 5.5,7.5 8.5,9.5 14.5,3.5"/>
            <polyline points="10.5,3.5 14.5,3.5 14.5,7.5"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink }}>Performance globale</div>
          <div style={{ fontSize: "10px", color: C.inkMuted }}>
            {inception ? `Depuis le ${inception.toLocaleDateString("fr-FR")} · ${durLabel(totalDays)}` : "Depuis votre premier investissement"}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="ba-perf-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: `1px solid ${C.border}` }}>
        {[
          { label: "Gain brut total", value: (gainBrut >= 0 ? "+" : "") + fmtEur(gainBrut), color: gainBrut >= 0 ? C.green : C.red },
          { label: "Rendement total", value: pctFmt(rendPct), color: pctColor(rendPct) },
          { label: "CAGR (annualisé)", value: cagr != null ? pctFmt(cagr) : "< 1 an", color: cagr != null ? pctColor(cagr) : C.inkSubtle },
          { label: "Dietz TWR annualisé", value: dietzCagr != null ? pctFmt(dietzCagr) : "< 1 an", color: dietzCagr != null ? pctColor(dietzCagr) : C.inkSubtle },
        ].map(({ label, value, color }, i) => (
          <div key={i} style={{ padding: "14px 16px", borderRight: i < 3 ? `1px solid ${C.border}` : "none", textAlign: "center" }}>
            <div style={{ fontSize: "17px", fontWeight: "800", color, fontFamily: "Inter,sans-serif", letterSpacing: "-0.5px" }}>{value}</div>
            <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "4px", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: "600" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Décomposition en cards */}
      <div className="ba-perf-breakdown" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "12px", padding: "16px 20px", borderTop: `1px solid ${C.border}`, background: C.snowOff }}>
        {[
          { label: "P/V Latente",       value: pvLatentes,      badge: pvLatentesPct, color: pvLatentes >= 0 ? C.green : C.red,    sign: pvLatentes >= 0 ? "+" : "" },
          { label: "Gains réalisés",     value: gainsRealises,   badge: null,          color: C.green,                               sign: "+" },
          { label: "Pertes réalisées",   value: pertesRealisees, badge: null,          color: pertesRealisees !== null && pertesRealisees < 0 ? C.red : C.inkMuted, sign: "" },
          { label: "Dividendes",         value: totalDivRec,     badge: null,          color: totalDivRec > 0 ? C.green : C.inkMuted, sign: "+" },
          { label: "Frais cumulés",      value: -totalFrais,     badge: null,          color: totalFrais > 0 ? C.red : C.inkMuted,   sign: "-" },
        ].map(({ label, value, badge, color, sign }, i) => (
          <div key={i} style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 14px", boxShadow: shadow.card }}>
            <div style={{ fontSize: "9px", color: C.inkSubtle, letterSpacing: "1px", fontWeight: "600", textTransform: "uppercase", marginBottom: "6px" }}>{label}</div>
            <div style={{ fontSize: "20px", fontWeight: "700", color, fontFamily: "Inter,sans-serif", letterSpacing: "-0.5px", lineHeight: 1.2 }}>
              {value == null ? "—" : `${sign}${fmtEur(Math.abs(value))}`}
            </div>
            {badge !== null && badge !== undefined && (
              <div style={{ marginTop: "8px", display: "inline-block", background: badge >= 0 ? "rgba(5,150,105,0.10)" : "rgba(220,38,38,0.10)", borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: "700", color: badge >= 0 ? C.green : C.red }}>
                {badge >= 0 ? "+" : ""}{badge.toFixed(2)}%
              </div>
            )}
            {value == null && (
              <div style={{ marginTop: "6px", fontSize: "9px", color: C.inkSubtle }}>Importez vos transactions</div>
            )}
          </div>
        ))}
      </div>

      {/* Table par position */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "36px 2fr 90px 80px 80px 90px 80px", padding: "8px 20px", background: C.snowOff, borderBottom: `1px solid ${C.border}`, minWidth: "560px" }}>
          {["", "Société", "Investi", "Valeur", "P&L (€)", "P&L (%)", "CAGR"].map((h, i) => (
            <div key={i} style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h}</div>
          ))}
        </div>
        {posPerf.map(p => (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: "36px 2fr 90px 80px 80px 90px 80px", padding: "10px 20px", borderBottom: `1px solid ${C.border}`, alignItems: "center", minWidth: "560px" }}>
            <CompanyAvatar nom={p.nom} isin={p.isin} size={26} />
            <div>
              <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink, fontFamily: "Inter,sans-serif" }}>{p.nom}</div>
              {p.posYears && <div style={{ fontSize: "9px", color: C.inkSubtle }}>{durLabel(p.posYears * 365.25)}</div>}
            </div>
            <div style={{ fontSize: "12px", color: C.inkMuted }}>{fmtEur(p.investi)}</div>
            <div style={{ fontSize: "12px", fontWeight: "600", color: C.ink }}>{fmtEur(p.valeur)}</div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: pctColor(p.pv) }}>{p.pv >= 0 ? "+" : ""}{fmtEur(p.pv)}</div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: pctColor(p.pvPct) }}>{pctFmt(p.pvPct)}</div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: pctColor(p.posCagr) }}>
              {p.posCagr != null ? pctFmt(p.posCagr) : <span style={{ color: C.inkSubtle, fontSize: "10px" }}>{"< 1 an"}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Note méthodo */}
      <div style={{ padding: "10px 20px", fontSize: "9px", color: C.inkSubtle, lineHeight: "1.7", borderTop: `1px solid ${C.border}` }}>
        <strong>CAGR</strong> = taux de croissance annuel composé depuis la première transaction (ou dateAchat) ·
        <strong> Dietz TWR</strong> = approximation du rendement pondéré par le temps (méthode Modified Dietz, tient compte du timing des achats/ventes) ·
        Dividendes inclus si renseignés dans Transactions · {achatOps.length === 0 ? "⚠ Importez vos avis d'opérés (onglet Transactions) pour un calcul précis." : `Basé sur ${achatOps.length} achats${venteOps.length ? " et " + venteOps.length + " ventes" : ""}.`}
      </div>
    </div>
  );
}

// ─── Corrélation inter-positions ──────────────────────────────────────────────
const CORR_CACHE_KEY = "bourse_corr_cache";
const CORR_TTL_MS    = 12 * 60 * 60 * 1000; // 12 heures

function pearson(a, b) {
  const n = a.length;
  if (n < 5) return null;
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; sumAB += a[i]*b[i]; sumA2 += a[i]*a[i]; sumB2 += b[i]*b[i]; }
  const denom = Math.sqrt((sumA2 - sumA*sumA/n) * (sumB2 - sumB*sumB/n));
  return denom === 0 ? null : (sumAB - sumA*sumB/n) / denom;
}

function corrColor(r) {
  if (r === null) return "#E2E8F0";
  const abs = Math.abs(r);
  if (r >= 0.75)  return `rgba(220,38,38,${0.35 + abs * 0.55})`;   // rouge fort
  if (r >= 0.45)  return `rgba(220,38,38,${0.15 + abs * 0.35})`;   // rouge modéré
  if (r >= 0.15)  return `rgba(100,116,139,0.15)`;                  // neutre chaud
  if (r <= -0.45) return `rgba(5,150,105,${0.15 + Math.abs(r) * 0.55})`; // vert (décorrélé)
  if (r <= -0.15) return `rgba(5,150,105,0.18)`;
  return "rgba(100,116,139,0.10)";
}

function CorrelationMatrix({ positions }) {
  const [data,    setData]    = useState(null);   // { labels, matrix, ts }
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [period,  setPeriod]  = useState("6mo");
  const [tooltip, setTooltip] = useState(null);   // { i, j, r }

  const eligible = positions.filter(p => p.quantite > 0);

  // Charge depuis cache ou refetch
  const load_ = useCallback(async (forceRefresh = false) => {
    if (eligible.length < 2) return;
    const cacheRaw = (() => { try { return JSON.parse(localStorage.getItem(CORR_CACHE_KEY) || "null"); } catch { return null; } })();
    const cacheKey = eligible.map(p => p.isin || p.nom).join("|") + "|" + period;
    if (!forceRefresh && cacheRaw && cacheRaw.key === cacheKey && (Date.now() - cacheRaw.ts) < CORR_TTL_MS) {
      setData(cacheRaw); setError(null); return;
    }

    setLoading(true); setError(null);

    const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
    for (const p of eligible) { if (p.isin && p.ticker) tickerCache[p.isin] = p.ticker; }

    // Résolution tickers manquants
    const resolved = await Promise.all(eligible.map(async p => {
      let ticker = (p.isin && tickerCache[p.isin]) || p.ticker || null;
      if (!ticker && p.isin) {
        try {
          const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(p.isin)}&quotesCount=3&newsCount=0`;
          const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(10000) });
          if (res.ok) {
            const j = await res.json();
            const hit = (j.quotes || []).find(q => ["EQUITY","ETF","MUTUALFUND"].includes(q.quoteType));
            if (hit) { ticker = hit.symbol; tickerCache[p.isin] = ticker; }
          }
        } catch {}
      }
      return { ...p, resolvedTicker: ticker };
    }));
    try { localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(tickerCache)); } catch {}

    // Fetch séries de rendements journaliers
    const INTERVAL = "1d";
    const seriesMap = {};
    await Promise.all(resolved.map(async p => {
      if (!p.resolvedTicker) return;
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(p.resolvedTicker)}?interval=${INTERVAL}&range=${period}`;
        const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return;
        const j = await res.json();
        const closes = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
        if (!closes || closes.length < 6) return;
        // Rendements journaliers ln(Pt/Pt-1)
        const rets = [];
        for (let i = 1; i < closes.length; i++) {
          if (closes[i] != null && closes[i-1] != null && closes[i-1] > 0) {
            rets.push(Math.log(closes[i] / closes[i-1]));
          }
        }
        if (rets.length >= 5) seriesMap[p.nom] = rets;
      } catch {}
    }));

    const labels = resolved.filter(p => seriesMap[p.nom]).map(p => p.nom);
    const n = labels.length;

    if (n < 2) { setError("Données insuffisantes — vérifiez que les tickers Yahoo Finance sont configurés (icône ✏ dans le tableau)."); setLoading(false); return; }

    // Aligner les séries (longueur minimale commune)
    const minLen = Math.min(...labels.map(l => seriesMap[l].length));
    const aligned = labels.map(l => seriesMap[l].slice(-minLen));

    const matrix = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => i === j ? 1 : pearson(aligned[i], aligned[j]))
    );

    const result = { key: cacheKey, labels, matrix, ts: Date.now(), period };
    try { localStorage.setItem(CORR_CACHE_KEY, JSON.stringify(result)); } catch {}
    setData(result);
    setLoading(false);
  }, [eligible.map(p => p.isin || p.nom).join("|"), period]); // eslint-disable-line

  useEffect(() => { load_(false); }, [load_]);

  const PERIOD_OPTS = [
    { v: "3mo", l: "3 mois" }, { v: "6mo", l: "6 mois" },
    { v: "1y",  l: "1 an"   }, { v: "2y",  l: "2 ans"  },
  ];

  const corrLabel = r => {
    if (r === null) return "N/A";
    if (r >= 0.75) return "Très élevée";
    if (r >= 0.45) return "Modérée";
    if (r >= 0.15) return "Faible";
    if (r <= -0.45) return "Négative forte";
    if (r <= -0.15) return "Négative faible";
    return "Nulle";
  };

  if (eligible.length < 2) return null;

  return (
    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden", boxShadow: shadow.card, marginTop: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: C.snow, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink, letterSpacing: "0.3px" }}>Corrélation inter-positions</div>
          <div style={{ fontSize: "11px", color: C.inkMuted, marginTop: "2px" }}>Coefficients de Pearson sur rendements journaliers logarithmiques</div>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {PERIOD_OPTS.map(o => (
            <button key={o.v} onClick={() => setPeriod(o.v)}
              style={{ fontSize: "11px", fontWeight: period === o.v ? "700" : "500", color: period === o.v ? C.accent : C.inkMuted, background: period === o.v ? "rgba(30,58,95,0.06)" : "transparent", border: `1px solid ${period === o.v ? C.accent : C.border}`, borderRadius: "6px", padding: "3px 10px", cursor: "pointer" }}>
              {o.l}
            </button>
          ))}
          <button onClick={() => load_(true)}
            style={{ fontSize: "11px", fontWeight: "600", color: C.inkMuted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "3px 10px", cursor: "pointer", marginLeft: "4px" }}>
            ↺
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "20px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "32px", color: C.inkMuted, fontSize: "13px" }}>
            <div style={{ fontSize: "22px", marginBottom: "10px" }}>⟳</div>
            Téléchargement des séries historiques…
          </div>
        )}
        {!loading && error && (
          <div style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.18)", borderRadius: "8px", padding: "14px 16px", fontSize: "12px", color: "#B91C1C" }}>{error}</div>
        )}
        {!loading && !error && data && data.labels && (
          <>
            {/* Heatmap */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "separate", borderSpacing: "3px", fontSize: "11px", margin: "0 auto" }}>
                <thead>
                  <tr>
                    <th style={{ width: "110px" }} />
                    {data.labels.map((l, j) => (
                      <th key={j} style={{ width: "60px", maxWidth: "60px", fontWeight: "600", color: C.inkMuted, textAlign: "center", paddingBottom: "6px", fontSize: "10px" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "56px" }} title={l}>
                          {l.length > 9 ? l.slice(0, 8) + "…" : l}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.labels.map((rowLabel, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: "600", color: C.ink, fontSize: "10px", paddingRight: "8px", textAlign: "right", maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={rowLabel}>
                        {rowLabel.length > 12 ? rowLabel.slice(0, 11) + "…" : rowLabel}
                      </td>
                      {data.matrix[i].map((r, j) => {
                        const isDiag = i === j;
                        const isHovered = tooltip && ((tooltip.i === i && tooltip.j === j) || (tooltip.i === j && tooltip.j === i));
                        return (
                          <td key={j}
                            onMouseEnter={() => !isDiag && setTooltip({ i, j, r, rowLabel, colLabel: data.labels[j] })}
                            onMouseLeave={() => setTooltip(null)}
                            style={{ width: "60px", height: "42px", background: isDiag ? "rgba(30,58,95,0.09)" : corrColor(r), borderRadius: "6px", textAlign: "center", verticalAlign: "middle", cursor: isDiag ? "default" : "pointer", outline: isHovered ? "2px solid rgba(30,58,95,0.35)" : "none", transition: "outline 0.1s" }}>
                            <span style={{ fontWeight: isDiag ? "700" : "600", color: isDiag ? C.accent : (r !== null && Math.abs(r) > 0.55 ? "#fff" : C.ink), fontSize: "11px" }}>
                              {isDiag ? "—" : (r !== null ? r.toFixed(2) : "?")}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tooltip persistant sous la heatmap */}
            {tooltip && !tooltip.i !== tooltip.j && (
              <div style={{ marginTop: "12px", background: C.snow, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: C.ink, display: "flex", gap: "12px", alignItems: "center" }}>
                <span style={{ fontWeight: "700" }}>{tooltip.rowLabel}</span>
                <span style={{ color: C.inkMuted }}>↔</span>
                <span style={{ fontWeight: "700" }}>{tooltip.colLabel}</span>
                <span style={{ marginLeft: "8px", fontSize: "15px", fontWeight: "800", color: tooltip.r >= 0.45 ? "#DC2626" : tooltip.r <= -0.45 ? "#059669" : C.ink }}>{tooltip.r?.toFixed(3)}</span>
                <span style={{ color: C.inkMuted }}>{corrLabel(tooltip.r)}</span>
              </div>
            )}

            {/* Légende */}
            <div style={{ marginTop: "14px", display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center" }}>
              {[
                { color: corrColor(0.85),  label: "Très élevée ≥ 0.75" },
                { color: corrColor(0.55),  label: "Modérée 0.45–0.75" },
                { color: corrColor(0.0),   label: "Faible/nulle" },
                { color: corrColor(-0.55), label: "Négative (décorrélé)" },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: C.inkMuted }}>
                  <div style={{ width: "14px", height: "14px", borderRadius: "3px", background: color, border: `1px solid ${C.border}` }} />
                  {label}
                </div>
              ))}
            </div>

            {/* Clusters de risque */}
            {(() => {
              const n = data.labels.length;
              const clusters = [];
              const visited = new Set();
              for (let i = 0; i < n; i++) {
                if (visited.has(i)) continue;
                const group = [i];
                for (let j = i + 1; j < n; j++) {
                  if (data.matrix[i][j] !== null && data.matrix[i][j] >= 0.65) {
                    group.push(j); visited.add(j);
                  }
                }
                if (group.length >= 2) { clusters.push(group); visited.add(i); }
              }
              if (clusters.length === 0) return null;
              return (
                <div style={{ marginTop: "14px", background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: "8px", padding: "10px 14px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#B91C1C", marginBottom: "6px" }}>⚠ Clusters de risque détectés (corrélation ≥ 0.65)</div>
                  {clusters.map((g, idx) => (
                    <div key={idx} style={{ fontSize: "11px", color: C.ink, marginTop: "3px" }}>
                      <strong>{g.map(i => data.labels[i]).join(" · ")}</strong>
                      {" "}— ces positions tendent à évoluer ensemble. Pensez à diversifier.
                    </div>
                  ))}
                </div>
              );
            })()}

            <div style={{ marginTop: "10px", fontSize: "9px", color: C.inkSubtle }}>
              Données Yahoo Finance · Période : {PERIOD_OPTS.find(o => o.v === data.period)?.l} · Mis à jour : {data.ts ? new Date(data.ts).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Suivi Dividendes ─────────────────────────────────────────────────────────
function DividendTracker({ account = "PEA", positions = [] }) {
  const key = "bourse_dividendes";
  const [divs, setDivs]       = useState(() => load(key, []));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]        = useState({ date: new Date().toISOString().slice(0,10), titre: "", isin: "", montant: "", nb: "", compte: account });

  const accountDivs = divs.filter(d => (d.compte || "PEA") === account);
  const totalBrut   = accountDivs.reduce((s, d) => s + (Number(d.montant) || 0), 0);
  // Prélèvement à la source estimé : 30% flat tax CTO, exonéré PEA
  const impotEst    = account === "CTO" ? totalBrut * 0.30 : 0;
  const totalNet    = totalBrut - impotEst;

  // Rendement sur coût par titre
  const posMap = {};
  positions.forEach(p => { posMap[p.isin] = p; posMap[p.nom] = p; });
  const byTitre = {};
  accountDivs.forEach(d => {
    const k = d.isin || d.titre;
    if (!byTitre[k]) byTitre[k] = { titre: d.titre, isin: d.isin, total: 0 };
    byTitre[k].total += Number(d.montant) || 0;
  });
  const titreDivs = Object.values(byTitre).map(t => {
    const pos = posMap[t.isin] || posMap[t.titre];
    const coutRevient = pos ? pos.pru * pos.quantite : null;
    const rendement   = coutRevient ? (t.total / coutRevient) * 100 : null;
    return { ...t, rendement };
  }).sort((a, b) => b.total - a.total);

  const save_ = (next) => { save(key, next); setDivs(next); };
  const del   = (id) => save_(divs.filter(d => d.id !== id));
  const add   = () => {
    if (!form.montant || !form.titre) return;
    save_([...divs, { ...form, id: Date.now(), montant: Number(form.montant), nb: Number(form.nb) || 0 }]);
    setForm(f => ({ ...f, titre: "", isin: "", montant: "", nb: "" }));
    setShowForm(false);
  };

  const inp = { padding: "8px 12px", borderRadius: "10px", border: `1px solid ${C.border}`, fontSize: "12px", fontFamily: "Inter,sans-serif", background: C.snowOff, color: C.ink, outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ background: C.cardGradGreen, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "20px", marginBottom: "20px", boxShadow: shadow.card }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "18px" }}>💰</span>
            <span style={{ fontSize: "13px", fontWeight: "800", color: C.ink }}>Dividendes reçus</span>
            <span style={{ fontSize: "10px", color: C.inkSubtle, background: C.snowOff, borderRadius: "5px", padding: "2px 7px" }}>{accountDivs.length}</span>
          </div>
          <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "3px", marginLeft: "26px" }}>Revenus encaissés · {account}</div>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ background: C.green, color: "#fff", border: "none", borderRadius: "20px", padding: "7px 14px", fontSize: "11px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
          {showForm ? "Annuler" : "+ Ajouter"}
        </button>
      </div>

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "16px" }}>
        {[
          { label: "Total brut", val: fmtEur(totalBrut), color: C.green },
          { label: account === "CTO" ? "Impôt estimé (30%)" : "Exonéré (PEA)", val: account === "CTO" ? `− ${fmtEur(impotEst)}` : "0 €", color: account === "CTO" ? C.red : C.green },
          { label: "Net encaissé", val: fmtEur(totalNet), color: C.ink, bold: true },
        ].map((k, i) => (
          <div key={i} style={{ background: C.snow, borderRadius: "14px", padding: "12px 14px", boxShadow: shadow.card }}>
            <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>{k.label}</div>
            <div style={{ fontSize: "15px", fontWeight: k.bold ? "800" : "700", color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Formulaire ajout */}
      {showForm && (
        <div style={{ background: C.snow, borderRadius: "14px", padding: "14px 16px", marginBottom: "14px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: C.ink, marginBottom: "10px" }}>Nouveau dividende</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
            <div>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Titre</div>
              <select style={inp} value={form.titre} onChange={e => { const p = positions.find(p => p.nom === e.target.value); setForm(f => ({ ...f, titre: e.target.value, isin: p?.isin || "" })); }}>
                <option value="">— Sélectionner —</option>
                {positions.map(p => <option key={p.id} value={p.nom}>{p.nom}</option>)}
                <option value="__autre__">Autre…</option>
              </select>
              {form.titre === "__autre__" && <input style={{ ...inp, marginTop: "6px" }} placeholder="Nom du titre" onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} />}
            </div>
            <div>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Date</div>
              <input type="date" style={inp} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Montant brut (€)</div>
              <input type="number" step="0.01" style={inp} placeholder="0.00" value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Nb titres détenus</div>
              <input type="number" style={inp} placeholder={positions.find(p=>p.nom===form.titre)?.quantite || ""} value={form.nb} onChange={e => setForm(f => ({ ...f, nb: e.target.value }))} />
            </div>
          </div>
          <button onClick={add} style={{ width: "100%", background: C.green, color: "#fff", border: "none", borderRadius: "10px", padding: "10px", fontSize: "12px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            Enregistrer le dividende
          </button>
        </div>
      )}

      {/* Liste par titre */}
      {titreDivs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
          {titreDivs.map((t, i) => (
            <div key={i} style={{ background: C.snow, borderRadius: "12px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "10px", boxShadow: shadow.card }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{t.titre}</div>
                {t.isin && <div style={{ fontSize: "9px", color: C.inkSubtle }}>{t.isin}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "13px", fontWeight: "800", color: C.green }}>{fmtEur(t.total)}</div>
                {t.rendement != null && <div style={{ fontSize: "10px", color: C.inkSubtle }}>Rdt/coût : {t.rendement.toFixed(2)}%</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Historique */}
      {accountDivs.length > 0 && (
        <div style={{ borderRadius: "12px", overflow: "hidden", border: `1px solid ${C.border}` }}>
          <div style={{ background: "linear-gradient(135deg,#0C1829,#1A3558)", padding: "8px 14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "10px", fontWeight: "700", color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Historique</span>
          </div>
          {[...accountDivs].sort((a,b) => b.date.localeCompare(a.date)).slice(0, 10).map((d, i) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 14px", borderBottom: i < accountDivs.length - 1 ? `1px solid ${C.border}` : "none", background: i % 2 === 0 ? C.snow : C.snowOff }}>
              <span style={{ fontSize: "10px", color: C.inkSubtle, width: "76px", flexShrink: 0 }}>{new Date(d.date).toLocaleDateString("fr-FR")}</span>
              <span style={{ fontSize: "11px", fontWeight: "600", color: C.ink, flex: 1 }}>{d.titre}</span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: C.green }}>{fmtEur(d.montant)}</span>
              <button onClick={() => del(d.id)} style={{ background: "none", border: "none", color: C.inkSubtle, cursor: "pointer", fontSize: "11px", padding: "2px 6px" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {accountDivs.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "20px 0", color: C.inkSubtle, fontSize: "12px" }}>
          Aucun dividende enregistré · Cliquez sur <strong>+ Ajouter</strong> pour commencer
        </div>
      )}
    </div>
  );
}

function HistoriqueTab({ portfolioVersion, account = "PEA" }) {
  const allPositions = sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS));
  const positions    = allPositions.filter(p => (p.compte || "PEA") === account);

  // Snapshot journalier local
  useEffect(() => {
    takeSnapshot(positions);
  }, [portfolioVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (positions.length === 0) return (
    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "48px 28px", textAlign: "center", boxShadow: shadow.card }}>
      <div style={{ fontSize: "36px", marginBottom: "14px", lineHeight: 1 }}>▦</div>
      <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, marginBottom: "8px" }}>Aucune donnée à analyser</div>
      <div style={{ fontSize: "12px", color: C.inkMuted, maxWidth: "380px", margin: "0 auto", lineHeight: "1.6" }}>
        Ajoutez vos positions dans l'onglet <strong>Positions</strong> pour visualiser la répartition sectorielle, géographique et les performances.
      </div>
    </div>
  );

  return (
    <div>
      <DividendTracker account={account} positions={positions} />
      <PortfolioPieChart positions={positions} />
      <CorrelationMatrix positions={positions} />
      <BenchmarkComparaison />
      <StatistiquesHistorique />
    </div>
  );
}

function OperationsTab({ account = "PEA" }) {
  const allPositions = sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS));
  const positions    = allPositions.filter(p => (p.compte || "PEA") === account);
  return (
    <div>
      <PerformanceGlobale positions={positions} account={account} />
      <FeeWarnings account={account} />
      <Reconciliation account={account} />
      <PEAAvisOperes account={account} />
    </div>
  );
}

// ─── Portfolio Pie Charts ─────────────────────────────────────────────────────
const PIE_COLORS = ["#1A3A5C","#C8972A","#2E7D52","#C0392B","#5B4A8A","#1A7A8A","#8A5B1A","#4A7A2E","#8A1A5B","#2A5B8A"];
const SECTOR_COLORS = ["#2E7D52","#1A3A5C","#C0392B","#C8972A","#5B4A8A","#1A7A8A","#8A5B1A","#8A1A5B","#4A7A2E","#2A5B8A","#6B4A2A","#2A6B5B"];

// Mapping ISIN → secteur pour les valeurs connues (fallback si p.secteur absent)
const ISIN_SECTEUR = {
  "NL0014559478": "Énergie",        // Technip Energies
  "FR0014005I80": "Santé",          // SMAIO
  "FR0014004362": "Énergie",        // ENTECH
  "FR001400U5Q4": "ETF Monde",      // Amundi PEA Monde MSCI World
  "FR0013233012": "Santé",          // Inventiva
  "FR0004056851": "Santé",          // Valneva
  "FR0010722819": "Technologies",   // KALRAY
  "FR0014001PM5": "Hydrogène",      // Haffner Energy
  // ETF Émergents (PEA-éligibles)
  "FR0013412038": "ETF Émergents",  // Amundi PEA Marchés Émergents MSCI EM
  "LU1681045370": "ETF Émergents",  // Amundi MSCI Emerging Markets
  "LU0635178014": "ETF Émergents",  // Lyxor MSCI Emerging Markets
  "FR0011440478": "ETF Émergents",  // Lyxor PEA Emergents
  "IE00BYM11602": "ETF Émergents",  // iShares Core MSCI EM IMI
  "LU1900068328": "ETF Émergents",  // Amundi MSCI EM SRI
  "FR0010959676": "ETF Émergents",  // Amundi ETF MSCI Emerging Markets
  // Actions courantes
  "FR0000131104": "Finance",        // BNP Paribas
  "FR0000120271": "Luxe",           // LVMH
  "FR0000120628": "Énergie",        // TotalEnergies
  "NL0000235190": "Industrie",      // Airbus
  "US02079K3059": "Technologies",   // Alphabet
  "US5949181045": "Technologies",   // Microsoft
  "US0231351067": "Technologies",   // Amazon
  "US0378331005": "Technologies",   // Apple
  "US67066G1040": "Technologies",   // Nvidia
  "US88160R1014": "Automobile",     // Tesla
  "US30303M1027": "Technologies",   // Meta
};

function buildArcs(slices, total, CX, CY, R, R_INNER) {
  let cumAngle = -Math.PI / 2;
  return slices.map(sl => {
    const rawPct = sl.valeur / total;
    // Un arc SVG avec start==end (100%) est invisible — on plafonne à 99.99%
    const pct = rawPct >= 1 ? 0.9999 : rawPct;
    const startAngle = cumAngle;
    const endAngle = cumAngle + pct * 2 * Math.PI;
    cumAngle = endAngle;
    const x1  = CX + R       * Math.cos(startAngle), y1  = CY + R       * Math.sin(startAngle);
    const x2  = CX + R       * Math.cos(endAngle),   y2  = CY + R       * Math.sin(endAngle);
    const ix1 = CX + R_INNER * Math.cos(startAngle), iy1 = CY + R_INNER * Math.sin(startAngle);
    const ix2 = CX + R_INNER * Math.cos(endAngle),   iy2 = CY + R_INNER * Math.sin(endAngle);
    const large = pct > 0.5 ? 1 : 0;
    return { ...sl, pct, x1, y1, x2, y2, ix1, iy1, ix2, iy2, large };
  });
}

function DonutChart({ slices, total, CX = 110, CY = 110, R = 90, R_INNER = 44, hovered, setHovered, centerLabel }) {
  const arcs = buildArcs(slices, total, CX, CY, R, R_INNER);
  const hov  = hovered !== null ? arcs[hovered] : null;
  return (
    <svg width={CX * 2} height={CY * 2} viewBox={`0 0 ${CX * 2} ${CY * 2}`} style={{ flexShrink: 0 }}>
      {arcs.map((sl, i) => {
        const isHov = hovered === i;
        return (
          <path
            key={i}
            d={`M ${sl.ix1.toFixed(2)} ${sl.iy1.toFixed(2)} L ${sl.x1.toFixed(2)} ${sl.y1.toFixed(2)} A ${R} ${R} 0 ${sl.large} 1 ${sl.x2.toFixed(2)} ${sl.y2.toFixed(2)} L ${sl.ix2.toFixed(2)} ${sl.iy2.toFixed(2)} A ${R_INNER} ${R_INNER} 0 ${sl.large} 0 ${sl.ix1.toFixed(2)} ${sl.iy1.toFixed(2)} Z`}
            fill={sl.color}
            stroke={C.snow}
            strokeWidth="2.5"
            style={{ cursor: "pointer", transformOrigin: `${CX}px ${CY}px`, transform: isHov ? "scale(1.07)" : "scale(1)", transition: "transform 0.15s, opacity 0.15s" }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            opacity={hovered !== null && !isHov ? 0.4 : 1}
          />
        );
      })}
      {hov ? (
        <>
          <text x={CX} y={CY - 9} textAnchor="middle" fontSize="14" fontWeight="800" fill={hov.color} fontFamily="Inter, sans-serif">
            {(hov.pct * 100).toFixed(1)}%
          </text>
          <text x={CX} y={CY + 9} textAnchor="middle" fontSize="9" fill={C.inkMuted} fontFamily="Inter, sans-serif" fontWeight="600">
            {fmtEur(hov.valeur)}
          </text>
        </>
      ) : (
        <>
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill={C.ink} fontFamily="Inter, sans-serif">
            {centerLabel || fmtEur(total)}
          </text>
          <text x={CX} y={CY + 10} textAnchor="middle" fontSize="9" fill={C.inkSubtle} fontFamily="Inter, sans-serif">
            Total
          </text>
        </>
      )}
    </svg>
  );
}

function detectSecteurNom(nom) {
  const n = (nom || "").toLowerCase();
  if (n.includes("emergent") || n.includes("emerging"))                          return "ETF Émergents";
  if (n.includes("monde") || n.includes("world") || n.includes("msci world"))   return "ETF Monde";
  if (n.includes("europe") || n.includes("euro stoxx") || n.includes("eurostoxx") || n.includes("stoxx")) return "ETF Europe";
  if (n.includes("nasdaq") || n.includes("ndx"))                                 return "ETF Nasdaq";
  if (n.includes("s&p") || n.includes("s&p500") || n.includes("sp500") || n.includes("s&p 500")) return "ETF S&P 500";
  if (n.includes("usa") || n.includes("us equity") || n.includes("north america") || n.includes("amérique")) return "ETF Amérique";
  if (n.includes("asie") || n.includes("asia") || n.includes("japon") || n.includes("japan") || n.includes("pacific")) return "ETF Asie";
  if (n.includes("small cap") || n.includes("smallcap") || n.includes("petite cap")) return "ETF Small Cap";
  if (n.includes("divid"))                                                         return "ETF Dividendes";
  if (n.includes("défense") || n.includes("defense") || n.includes("sécurité"))  return "ETF Défense";
  if (n.includes("immob") || n.includes("reit"))                                  return "ETF Immobilier";
  if (n.includes("clean") || n.includes("green") || n.includes("renouvel") || n.includes("eau") || n.includes("water")) return "ETF Environnement";
  if (n.includes("tech") && (n.includes("etf") || n.includes("amundi") || n.includes("lyxor") || n.includes("ishares"))) return "ETF Tech";
  if (n.includes("haffner"))                                     return "Hydrogène";
  if (n.includes("hydrogène") || n.includes("hydrogen"))        return "Hydrogène";
  if (n.includes("technip") || n.includes("entech"))            return "Énergie";
  if (n.includes("totalenerg") || n.includes("total energ"))    return "Énergie";
  if (n.includes("smaio") || n.includes("inventiva"))           return "Santé";
  if (n.includes("valneva") || n.includes("median tech"))       return "Santé";
  if (n.includes("pea monde") || n.includes("msci world"))      return "ETF Monde";
  if (n.includes("pea emergent") || n.includes("msci emerging") || n.includes("emerging")) return "ETF Émergents";
  if (n.includes("kalray"))                                      return "Technologies";
  if (n.includes("airbus"))                                      return "Industrie";
  if (n.includes("lvmh") || n.includes("hermes") || n.includes("kering")) return "Luxe";
  if (n.includes("bnp") || n.includes("credit agr") || n.includes("societe gen")) return "Finance";
  if (n.includes("amundi") || n.includes("lyxor") || n.includes("ishares") || n.includes("xtrackers") || n.includes("etf")) return "ETF";
  return null;
}

function PortfolioPieChart({ positions }) {
  const [hovPos,     setHovPos]     = useState(null);
  const [hovSecteur, setHovSecteur] = useState(null);
  const [hovGeo,     setHovGeo]     = useState(null);

  const enriched = positions
    .map((p, i) => ({
      nom:     p.nom,
      isin:    p.isin || "",
      secteur: (p.secteur && p.secteur !== "Autre") ? p.secteur : (ISIN_SECTEUR[p.isin] || detectSecteurNom(p.nom) || "Autre"),
      valeur:  (p.dernierCours || p.pru) * p.quantite,
      color:   PIE_COLORS[i % PIE_COLORS.length],
    }))
    .filter(s => s.valeur > 0)
    .sort((a, b) => b.valeur - a.valeur);

  const total = enriched.reduce((s, sl) => s + sl.valeur, 0);
  if (total === 0) return null;

  // Agrégation par secteur
  const secteurMap = {};
  enriched.forEach(sl => {
    if (!secteurMap[sl.secteur]) secteurMap[sl.secteur] = 0;
    secteurMap[sl.secteur] += sl.valeur;
  });
  const secteurSlices = Object.entries(secteurMap)
    .map(([nom, valeur], i) => ({ nom, valeur, color: SECTOR_COLORS[i % SECTOR_COLORS.length] }))
    .sort((a, b) => b.valeur - a.valeur);

  // Agrégation géographique (basée sur préfixe ISIN + overrides ETF)
  const GEO_COLORS = ["#1A3A5C","#2E7D52","#C0392B","#C8972A","#5B4A8A","#1A7A8A","#8A5B1A","#8A1A5B"];
  const GEO_PREFIX = { FR: "France", NL: "Europe", LU: "Europe", IE: "Europe", DE: "Europe", GB: "Royaume-Uni", BE: "Europe", IT: "Europe", ES: "Europe", US: "États-Unis", CA: "Amérique du N.", JP: "Asie" };
  const GEO_OVERRIDE = { "FR001400U5Q4": "Monde", "LU1681045370": "Monde", "LU0635178014": "Émergents", "FR0013412038": "Émergents", "FR0011440478": "Émergents", "LU1900068328": "Émergents" };
  const geoMap = {};
  enriched.forEach(sl => {
    const geo = GEO_OVERRIDE[sl.isin] || (sl.isin ? GEO_PREFIX[sl.isin.slice(0,2)] : null) || detectSecteurNom(sl.nom)?.startsWith("ETF") ? (sl.nom.toLowerCase().includes("emergent") || sl.nom.toLowerCase().includes("emerging") ? "Émergents" : sl.nom.toLowerCase().includes("monde") || sl.nom.toLowerCase().includes("world") ? "Monde" : "International") : "Autre";
    if (!geoMap[geo]) geoMap[geo] = 0;
    geoMap[geo] += sl.valeur;
  });
  const geoSlices = Object.entries(geoMap)
    .map(([nom, valeur], i) => ({ nom, valeur, color: GEO_COLORS[i % GEO_COLORS.length] }))
    .sort((a, b) => b.valeur - a.valeur);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* ── Graphique 1 : par titre ── */}
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "14px" }}>
          Répartition par titre
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "28px", flexWrap: "wrap" }}>
          <DonutChart slices={enriched} total={total} hovered={hovPos} setHovered={setHovPos} />
          <div style={{ display: "flex", flexDirection: "column", gap: "7px", flex: 1, minWidth: "180px" }}>
            {enriched.map((sl, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", opacity: hovPos !== null && hovPos !== i ? 0.4 : 1, transition: "opacity 0.15s" }}
                onMouseEnter={() => setHovPos(i)}
                onMouseLeave={() => setHovPos(null)}
              >
                <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: sl.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: C.ink, fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {sl.nom}
                  </div>
                  <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "500", marginTop: "1px" }}>
                    {sl.secteur}
                  </div>
                </div>
                <div style={{ fontSize: "11px", color: sl.color, fontWeight: "700", flexShrink: 0 }}>
                  {(sl.valeur / total * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: "10px", color: C.inkSubtle, flexShrink: 0, minWidth: "62px", textAlign: "right" }}>
                  {fmtEur(sl.valeur)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Graphique secteur ── */}
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "14px" }}>Répartition par secteur</div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
          <DonutChart slices={secteurSlices} total={total} hovered={hovSecteur} setHovered={setHovSecteur} />
          <div style={{ display: "flex", flexDirection: "column", gap: "9px", flex: 1, minWidth: "140px" }}>
            {secteurSlices.map((sl, i) => (
              <div key={i}
                style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", opacity: hovSecteur !== null && hovSecteur !== i ? 0.4 : 1, transition: "opacity 0.15s" }}
                onMouseEnter={() => setHovSecteur(i)} onMouseLeave={() => setHovSecteur(null)}>
                <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: sl.color, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: "12px", color: C.ink, fontWeight: "600" }}>{sl.nom}</div>
                <div style={{ fontSize: "11px", color: sl.color, fontWeight: "700", flexShrink: 0 }}>{(sl.valeur / total * 100).toFixed(1)}%</div>
                <div style={{ fontSize: "10px", color: C.inkSubtle, flexShrink: 0, minWidth: "58px", textAlign: "right" }}>{fmtEur(sl.valeur)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Projection Tab ───────────────────────────────────────────────────────────
const INFLATION_RATE = 0.025; // CPI européen ~2,5 %/an

function ProjectionTab({ profil, account = "PEA" }) {
  const isMobile = useIsMobile();
  const [tooltip, setTooltip]       = useState(null);
  const [showInflation, setShowInflation] = useState(false);
  const [inflationRate, setInflationRate] = useState(() => parseFloat(localStorage.getItem("bourse_inflation_rate") || "2.5"));
  const [impotSortie,   setImpotSortie]   = useState(() => parseFloat(localStorage.getItem("bourse_impot_sortie")  || "30"));
  const [horizonYears, setHorizonYears]   = useState(30);  // 10 | 20 | 30
  const [histProj, setHistProj]     = useState(null);      // { taux, detail: [{nom,taux}] }
  const [loadingHist, setLoadingHist] = useState(false);
  const [histError, setHistError]   = useState(null);
  // ── PEA retrait simulator state ──
  const [retraitMontant,    setRetraitMontant]    = useState("");
  const [retraitAnciennete, setRetraitAnciennete] = useState("apres5");
  const [retraitRegime,     setRetraitRegime]      = useState("pfu");
  const [retraitTMI,        setRetraitTMI]         = useState(30);
  const [retraitHorizon,    setRetraitHorizon]     = useState(0);   // années
  const [retraitTauxAn,     setRetraitTauxAn]      = useState(7);   // %/an

  const positions    = load("bourse_portfolio", DEFAULT_POSITIONS).filter(p => (p.compte || "PEA") === account);
  const dcaMensuel   = Number(profil?.dcaMensuel) || 0;

  // ── Calcul de la projection historique ────────────────────────────────────
  const computeHistoricalProj = async () => {
    setLoadingHist(true); setHistError(null); setHistProj(null);
    const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();
    const totalVal = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
    const eligible = positions.filter(p => {
      const ticker = (p.isin && tickerCache[p.isin]) || p.ticker;
      return !!ticker;
    });
    if (eligible.length === 0) {
      setHistError("Aucun ticker configuré · Ajoutez les tickers dans ✏ (tableau positions)");
      setLoadingHist(false); return;
    }
    const results = await Promise.all(eligible.map(async p => {
      const ticker = (p.isin && tickerCache[p.isin]) || p.ticker;
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&range=5y`;
        const res = await fetchWithProxy(url, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) return null;
        const json = await res.json();
        const r = json?.chart?.result?.[0];
        const cl = r?.indicators?.quote?.[0]?.close || [];
        const pts = cl.filter(v => v != null && v > 0);
        if (pts.length < 20) return null;
        const xs = pts.map((_, i) => i);
        const ys = pts.map(v => Math.log(v));
        const { b } = linReg(xs, ys);
        const tauxAnnuel = Math.exp(b * 52) - 1;
        const poids = (p.dernierCours || p.pru) * p.quantite / totalVal;
        return { nom: p.nom, taux: tauxAnnuel, poids };
      } catch { return null; }
    }));
    const valid = results.filter(Boolean);
    if (valid.length === 0) {
      setHistError("Impossible de récupérer les données historiques. Vérifiez votre connexion.");
      setLoadingHist(false); return;
    }
    const totalPoids = valid.reduce((s, r) => s + r.poids, 0);
    const tauxPondere = valid.reduce((s, r) => s + r.taux * (r.poids / totalPoids), 0);
    setHistProj({ taux: tauxPondere, detail: valid });
    setLoadingHist(false);
  };

  if (positions.length === 0 && dcaMensuel <= 0) return (
    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "48px 28px", textAlign: "center", boxShadow: shadow.card }}>
      <div style={{ fontSize: "36px", marginBottom: "14px", lineHeight: 1 }}>⌁</div>
      <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, marginBottom: "8px" }}>Aucune projection disponible</div>
      <div style={{ fontSize: "12px", color: C.inkMuted, maxWidth: "400px", margin: "0 auto", lineHeight: "1.6" }}>
        Ajoutez des positions dans <strong>Positions</strong> ou configurez un versement DCA dans <strong>Paramètres</strong> pour projeter l'évolution de votre portefeuille.
      </div>
    </div>
  );
  const totalActuel  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);

  const pvPct    = totalInvesti > 0 ? (totalActuel - totalInvesti) / totalInvesti : 0;
  const tauxReel = Math.max(0, Math.min(pvPct, 2));

  const SCENARIOS = [
    { label: "Pessimiste",       taux: 0.03,    color: C.red,      icon: "▼" },
    { label: "Réaliste",         taux: 0.07,    color: C.navy,     icon: "◆" },
    { label: "Optimiste",        taux: 0.12,    color: C.green,    icon: "▲" },
    { label: "Mon portefeuille", taux: tauxReel, color: C.goldDark, icon: "★" },
  ];

  // Valeur projetée : part de la valeur de marché actuelle + DCA futurs
  const proj    = (taux, mois) => {
    const r = Math.pow(1 + taux, 1 / 12) - 1;
    return totalActuel * Math.pow(1 + r, mois) +
      (r > 0 ? dcaMensuel * (Math.pow(1 + r, mois) - 1) / r : dcaMensuel * mois);
  };
  // Capital réellement sorti de poche : coût historique + DCA futurs
  const investi = (mois) => totalInvesti + dcaMensuel * mois;

  const HORIZONS_TABLE = [6, 12, 36, 60, 120, 240, 360];
  const durLabel = m => m >= 24 ? `${m / 12} ans` : m === 12 ? "1 an" : `${m} mois`;
  const fmtVal  = v => v >= 1000000 ? `${(v / 1000000).toFixed(2)}M€` : `${Math.round(v / 1000)}k€`;

  if (totalActuel === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.inkSubtle }}>
      <div style={{ fontSize: "32px", marginBottom: "14px", opacity: 0.2 }}>📈</div>
      <div style={{ fontSize: "14px", fontWeight: "600" }}>Aucune position · Ajoutez des positions dans l'onglet Portefeuille</div>
    </div>
  );

  // ── SVG constants ──
  const MAX_MOIS = horizonYears * 12;
  const W = 720, H = 340;
  const PAD = { top: 24, right: 66, bottom: 46, left: 72 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const pts    = Array.from({ length: MAX_MOIS / 3 + 1 }, (_, i) => i * 3);
  const scenariosWithHist = histProj ? [...SCENARIOS, { label: "Projection historique", taux: histProj.taux, color: "#7C3AED", icon: "⬟" }] : SCENARIOS;
  const allVals = [...scenariosWithHist.flatMap(sc => pts.map(m => proj(sc.taux, m))), totalActuel];
  const maxV   = Math.max(...allVals);
  const xS     = m => PAD.left + (m / MAX_MOIS) * innerW;
  const yS     = v => PAD.top  + (1 - v / (maxV || 1)) * innerH;
  const yTicks = Array.from({ length: 6 }, (_, i) => i * maxV / 5);
  const annees = Array.from({ length: horizonYears + 1 }, (_, i) => i);
  const step5  = horizonYears <= 10 ? 1 : horizonYears <= 20 ? 2 : 5;
  const JALONS = annees.filter(a => a > 0 && a % step5 === 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* En-tête */}
      <div className="ba-g4" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: "10px" }}>
        <StatBox label="Capital actuel"  value={fmtEur(totalActuel)} color={C.navy} sensitive />
        <StatBox label="Coût historique" value={fmtEur(totalInvesti)} sensitive />
        <StatBox label="P/V actuelle"    value={fmtPct(pvPct * 100)} color={totalActuel >= totalInvesti ? C.green : C.red} sensitive />
        <StatBox label="DCA mensuel"     value={dcaMensuel > 0 ? fmtEur(dcaMensuel) : "Non défini"} color={dcaMensuel > 0 ? C.navy : C.inkSubtle} sensitive />
      </div>


      {/* ── Graphique interactif ── */}
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "24px", boxShadow: shadow.float }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "800", color: C.ink, letterSpacing: "-0.02em" }}>Évolution projetée</div>
            <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "2px" }}>Survolez les jalons pour afficher les valeurs détaillées</div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {/* Horizon selector */}
            <div style={{ display: "flex", background: C.snowOff, borderRadius: "10px", padding: "2px", border: `1px solid ${C.border}` }}>
              {[10, 20, 30].map(y => (
                <button key={y} onClick={() => { setHorizonYears(y); setTooltip(null); }}
                  style={{ padding: "5px 14px", borderRadius: "8px", border: "none", fontSize: "11px", fontWeight: "700", fontFamily: "Inter,sans-serif", cursor: "pointer", transition: "all 0.15s",
                    background: horizonYears === y ? C.navy : "transparent",
                    color: horizonYears === y ? "#fff" : C.inkMuted,
                    boxShadow: horizonYears === y ? shadow.pill : "none" }}>
                  {y} ans
                </button>
              ))}
            </div>
            {/* Inflation configurable */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", background: showInflation ? C.goldLight : C.snowOff, border: `1px solid ${showInflation ? C.gold : C.border}`, borderRadius: "10px", padding: "4px 8px", cursor: "pointer" }} onClick={() => setShowInflation(v => !v)}>
              <span style={{ fontSize: "10px", fontWeight: "700", color: showInflation ? C.goldDark : C.inkSubtle }}>Inflation</span>
              <input type="number" min="0" max="20" step="0.1" value={inflationRate}
                onClick={e => e.stopPropagation()}
                onChange={e => { const v = parseFloat(e.target.value) || 0; setInflationRate(v); localStorage.setItem("bourse_inflation_rate", v); }}
                style={{ width: "36px", border: "none", background: "transparent", fontSize: "10px", fontWeight: "700", color: showInflation ? C.goldDark : C.inkSubtle, textAlign: "center", outline: "none", fontFamily: "Inter,sans-serif" }} />
              <span style={{ fontSize: "10px", fontWeight: "700", color: showInflation ? C.goldDark : C.inkSubtle }}>%</span>
            </div>
            {/* Impôt de sortie */}
            <div style={{ display: "flex", alignItems: "center", gap: "4px", background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "4px 8px" }}>
              <span style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle }}>Impôt sortie</span>
              <input type="number" min="0" max="50" step="0.1" value={impotSortie}
                onChange={e => { const v = parseFloat(e.target.value) || 0; setImpotSortie(v); localStorage.setItem("bourse_impot_sortie", v); }}
                style={{ width: "32px", border: "none", background: "transparent", fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textAlign: "center", outline: "none", fontFamily: "Inter,sans-serif" }} />
              <span style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle }}>%</span>
            </div>
            {/* Projection historique */}
            <button onClick={() => histProj ? setHistProj(null) : computeHistoricalProj()} disabled={loadingHist}
              style={{ padding: "6px 12px", borderRadius: "10px", fontSize: "10px", fontWeight: "700", fontFamily: "Inter,sans-serif", cursor: "pointer", border: `1px solid ${histProj ? "rgba(124,58,237,0.4)" : C.border}`, background: histProj ? "rgba(124,58,237,0.08)" : C.snowOff, color: histProj ? "#7C3AED" : C.inkMuted, opacity: loadingHist ? 0.6 : 1 }}>
              {loadingHist ? <span style={{ display:"inline-flex", alignItems:"center", gap:"5px" }}><ThinkingSpinner size={12} color="#7C3AED" /> Calcul…</span> : histProj ? `⬟ ${(histProj.taux * 100).toFixed(1)}%/an ×` : "⬟ Projection historique"}
            </button>
          </div>
        </div>

        {histError && <div style={{ fontSize: "11px", color: C.red, background: C.redLight, borderRadius: "8px", padding: "8px 12px", marginBottom: "12px" }}>⚠ {histError}</div>}

        {/* SVG */}
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
            onMouseLeave={() => setTooltip(null)}>
            <defs>
              {/* Gradient pour chaque scénario */}
              {[
                { id: "gPess",  color: C.red  },
                { id: "gReal",  color: C.navy },
                { id: "gOpti",  color: C.green },
                { id: "gPort",  color: C.goldDark },
                { id: "gHist",  color: "#7C3AED" },
                { id: "gInvest", color: "#A0A09C" },
              ].map(({ id, color }) => (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.01" />
                </linearGradient>
              ))}
            </defs>

            {/* Fond zone investie */}
            {(() => {
              const line = pts.map((m, i) => `${i === 0 ? "M" : "L"}${xS(m).toFixed(1)},${yS(investi(m)).toFixed(1)}`).join(" ");
              const area = `${line} L${xS(MAX_MOIS).toFixed(1)},${yS(0).toFixed(1)} L${xS(0).toFixed(1)},${yS(0).toFixed(1)} Z`;
              return (
                <g>
                  <path d={area} fill="url(#gInvest)" />
                  <path d={line} fill="none" stroke="#C0C0BC" strokeWidth="1.5" strokeDasharray="5,4" />
                </g>
              );
            })()}

            {/* Grille Y */}
            {yTicks.map((v, i) => {
              const y = yS(v);
              return (
                <g key={i}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                    stroke={i === 0 ? "#C8C8C4" : C.border} strokeWidth={i === 0 ? "1" : "0.5"} strokeDasharray={i > 0 ? "3,4" : ""} />
                  <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="9" fill={C.inkSubtle} fontFamily="Inter, sans-serif">
                    {v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}€
                  </text>
                </g>
              );
            })}

            {/* Grille X */}
            {annees.map(a => {
              const m = a * 12, x = xS(m);
              const isJalon = a % step5 === 0;
              return (
                <g key={a}>
                  <line x1={x} x2={x} y1={PAD.top} y2={H - PAD.bottom}
                    stroke={isJalon ? "#D0D0CC" : C.border} strokeWidth={isJalon ? "0.8" : "0.3"}
                    strokeDasharray={isJalon ? "" : "2,4"} />
                  {isJalon && <text x={x} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="10"
                    fill={C.inkMuted} fontFamily="Inter, sans-serif" fontWeight="600">
                    {a === 0 ? "Auj." : `${a} ans`}
                  </text>}
                </g>
              );
            })}

            {/* Courbes scénarios + areas */}
            {(() => {
              const gradIds = ["gPess","gReal","gOpti","gPort","gHist"];
              return scenariosWithHist.map((sc, si) => {
                const isHistorical = si === 4;
                const isDashed     = si === 3;
                const line = pts.map((m, i) => `${i === 0 ? "M" : "L"}${xS(m).toFixed(1)},${yS(proj(sc.taux, m)).toFixed(1)}`).join(" ");
                const area = `${line} L${xS(MAX_MOIS).toFixed(1)},${yS(0).toFixed(1)} L${xS(0).toFixed(1)},${yS(0).toFixed(1)} Z`;
                const valFin = proj(sc.taux, MAX_MOIS);
                return (
                  <g key={`${sc.taux}-${si}`}>
                    <path d={area} fill={`url(#${gradIds[si]})`} />
                    <path d={line} fill="none" stroke={sc.color}
                      strokeWidth={isHistorical ? "2.5" : isDashed ? "2" : "2.5"}
                      strokeDasharray={isDashed ? "7,4" : isHistorical ? "8,4" : ""}
                      strokeLinejoin="round" opacity={isHistorical ? 0.9 : 0.88} />
                    <circle cx={xS(MAX_MOIS)} cy={yS(valFin)} r="4.5"
                      fill={isDashed || isHistorical ? C.snow : sc.color} stroke={sc.color} strokeWidth="2" />
                    <text x={W - PAD.right + 6} y={yS(valFin) + 4} fontSize="9" fill={sc.color}
                      fontFamily="Inter, sans-serif" fontWeight="800">
                      {valFin >= 1000000 ? `${(valFin / 1000000).toFixed(2)}M` : `${Math.round(valFin / 1000)}k`}€
                    </text>
                  </g>
                );
              });
            })()}

            {/* Courbe inflation-ajustée */}
            {showInflation && (() => {
              const inflLine = pts.map((m, i) => {
                const real = proj(SCENARIOS[1].taux, m) / Math.pow(1 + inflationRate / 100, m / 12);
                return `${i===0?"M":"L"}${xS(m).toFixed(1)},${yS(real).toFixed(1)}`;
              }).join(" ");
              return <path d={inflLine} fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="5,4" strokeLinejoin="round" opacity="0.8" />;
            })()}

            {/* Points interactifs aux jalons */}
            {JALONS.map(a => {
              const m = a * 12, x = xS(m);
              const isHovered = tooltip?.annee === a;
              return (
                <g key={a} style={{ cursor: "pointer" }}
                  onMouseEnter={() => setTooltip({ annee: a, xPct: xS(m) / W * 100 })}>
                  <rect x={x - 14} y={PAD.top} width={28} height={innerH} fill="transparent" />
                  {isHovered && <line x1={x} x2={x} y1={PAD.top} y2={H - PAD.bottom}
                    stroke={C.navy} strokeWidth="1" opacity="0.15" strokeDasharray="4,3" />}
                  {scenariosWithHist.map((sc, si) => (
                    <circle key={si} cx={x} cy={yS(proj(sc.taux, m))} r={isHovered ? 5 : 3}
                      fill={isHovered ? sc.color : C.snow} stroke={sc.color} strokeWidth="2"
                      style={{ transition: "r 0.12s" }} />
                  ))}
                  <circle cx={x} cy={yS(investi(m))} r={isHovered ? 3.5 : 2}
                    fill={isHovered ? "#A0A09C" : C.snow} stroke="#A0A09C" strokeWidth="1.5" />
                </g>
              );
            })}

            {/* Point de départ */}
            <circle cx={xS(0)} cy={yS(totalActuel)} r="5.5" fill={C.snow} stroke={C.navy} strokeWidth="2.5" />
            <text x={xS(0) + 10} y={yS(totalActuel) - 8} fontSize="9.5" fill={C.navy}
              fontFamily="Inter, sans-serif" fontWeight="800">{fmtEur(totalActuel)}</text>
          </svg>

          {/* Tooltip */}
          {tooltip && (() => {
            const a = tooltip.annee, m = a * 12;
            const dateRef = new Date();
            dateRef.setFullYear(dateRef.getFullYear() + a);
            const dateLabel = dateRef.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
            const isRight = tooltip.xPct > 55;
            return (
              <div style={{ position: "absolute", top: "8px",
                left: isRight ? "auto" : `${Math.min(tooltip.xPct + 2, 65)}%`,
                right: isRight ? `${Math.max(100 - tooltip.xPct + 2, 2)}%` : "auto",
                background: "rgba(15,20,35,0.96)", backdropFilter: "blur(12px)", borderRadius: "14px", padding: "14px 16px",
                boxShadow: "0 12px 36px rgba(0,0,0,0.32)", zIndex: 10, minWidth: "210px", pointerEvents: "none",
                border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", marginBottom: "10px", fontWeight: "600" }}>
                  Dans <strong style={{ color: "#fff" }}>{a} ans</strong> · {dateLabel}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", paddingBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>Investi total</span>
                  <span style={{ fontSize: "11px", color: "#C0C0BC", fontWeight: "600" }}>{fmtEur(investi(m))}</span>
                </div>
                {scenariosWithHist.map((sc, si) => {
                  const v = proj(sc.taux, m);
                  const mult = investi(m) > 0 ? v / investi(m) : 1;
                  const real = v / Math.pow(1 + INFLATION_RATE, m / 12);
                  return (
                    <div key={si} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "10px", color: sc.color, fontWeight: "700" }}>{sc.icon} {sc.label}</span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "13px", color: sc.color, fontWeight: "800" }}>{fmtVal(v)}</div>
                        <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)" }}>×{mult.toFixed(1)} · {(sc.taux*100).toFixed(1)}%/an</div>
                        {showInflation && <div style={{ fontSize: "9px", color: "#D97706" }}>≈{fmtVal(real)} réels</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Légende */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "14px", flexWrap: "wrap" }}>
          {scenariosWithHist.map((sc, si) => (
            <div key={si} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke={sc.color} strokeWidth="2.5" strokeDasharray={si === 3 ? "5,3" : si === 4 ? "6,3" : ""} /></svg>
              <span style={{ fontSize: "10px", color: sc.color, fontWeight: "700" }}>{sc.icon} {sc.label} ({sc.taux >= 0 ? "+" : ""}{(sc.taux*100).toFixed(1)}%)</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="#C0C0BC" strokeWidth="1.5" strokeDasharray="4,3" /></svg>
            <span style={{ fontSize: "10px", color: C.inkMuted, fontWeight: "600" }}>Capital investi</span>
          </div>
          {showInflation && (
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <svg width="22" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="5,4" /></svg>
              <span style={{ fontSize: "10px", color: "#D97706", fontWeight: "600" }}>Réaliste inflation-ajusté</span>
            </div>
          )}
        </div>

        {/* Détail projection historique */}
        {histProj && (
          <div style={{ marginTop: "14px", background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "12px", padding: "12px 16px" }}>
            <div style={{ fontSize: "10px", fontWeight: "700", color: "#7C3AED", marginBottom: "8px" }}>⬟ Détail par valeur — taux de croissance historique (régression 5 ans)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {histProj.detail.map((d, i) => (
                <div key={i} style={{ background: "rgba(124,58,237,0.08)", borderRadius: "8px", padding: "5px 10px", fontSize: "10px", color: "#7C3AED", fontWeight: "600" }}>
                  {d.nom.split(" ")[0]} · <strong>{d.taux >= 0 ? "+" : ""}{(d.taux * 100).toFixed(1)}%/an</strong>
                  <span style={{ opacity: 0.6 }}> ({(d.poids * 100).toFixed(0)}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Tableau ── */}
      <div className="ba-table-wrap" style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden", boxShadow: shadow.card }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: "11px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1.5px" }}>
          Tableau de projection détaillé
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `130px repeat(${HORIZONS_TABLE.length}, 1fr)`, borderBottom: `1px solid ${C.border}`, padding: "10px 16px", background: C.snowOff }}>
          <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase" }}>Scénario</div>
          {HORIZONS_TABLE.map(m => (
            <div key={m} style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", textAlign: "center" }}>{durLabel(m)}</div>
          ))}
        </div>
        {/* Coût réel */}
        <div style={{ display: "grid", gridTemplateColumns: `130px repeat(${HORIZONS_TABLE.length}, 1fr)`, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.snowOff }}>
          <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600" }}>💰 Coût réel</div>
          {HORIZONS_TABLE.map(m => (
            <div key={m} style={{ fontSize: "11px", color: C.inkMuted, textAlign: "center" }}>{fmtEur(investi(m))}</div>
          ))}
        </div>
        {SCENARIOS.map((sc, si) => (
          <div key={sc.taux} style={{ display: "grid", gridTemplateColumns: `130px repeat(${HORIZONS_TABLE.length}, 1fr)`, padding: "12px 16px", borderBottom: si < SCENARIOS.length - 1 ? `1px solid ${C.border}` : "none", background: si === 1 ? C.navyLight + "50" : si === 3 ? "#FBF0E430" : "transparent" }}>
            <div>
              <div style={{ fontSize: "11px", color: sc.color, fontWeight: "700" }}>{sc.icon} {sc.label}</div>
              <div style={{ fontSize: "9px", color: sc.color, opacity: 0.7, fontWeight: "600" }}>
                +{Math.round(sc.taux * 100)}%/an{si === 3 ? " (P/V CSV)" : ""}
                {inflationRate > 0 && <span style={{ opacity: 0.6 }}> · réel {((sc.taux - inflationRate / 100) * 100).toFixed(1)}%</span>}
              </div>
            </div>
            {HORIZONS_TABLE.map(m => {
              const v    = proj(sc.taux, m);
              const inv  = investi(m);
              const mult = inv > 0 ? v / inv : 1;
              const gains = Math.max(0, v - inv);
              const netApresImpot = v - gains * (impotSortie / 100);
              const multReel = inv > 0 ? (v / Math.pow(1 + inflationRate / 100, m / 12)) / inv : 1;
              return (
                <div key={m} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: sc.color }}>{fmtEur(v)}</div>
                  <div style={{ fontSize: "9px", color: sc.color, opacity: 0.65 }}>×{mult.toFixed(1)}{inflationRate > 0 && <span> · ×{multReel.toFixed(1)} réel</span>}</div>
                  {impotSortie > 0 && <div style={{ fontSize: "9px", color: C.inkSubtle, opacity: 0.8 }}>{fmtEur(netApresImpot)} net</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ fontSize: "10px", color: C.inkSubtle, textAlign: "center", lineHeight: "1.7" }}>
        Base : capital de marché actuel {fmtEur(totalActuel)} · coût historique {fmtEur(totalInvesti)} · DCA {dcaMensuel > 0 ? fmtEur(dcaMensuel) + "/mois" : "non configuré"}<br />
        ×N = multiplicateur nominal · ×N réel = ajusté inflation {inflationRate}% · "net" = après impôt de sortie {impotSortie}% sur les gains · ⚠ Projections indicatives, non garanties.
      </div>

      {/* ══════════════════════════════════════════════════════════
           SIMULATEUR DE RETRAIT PEA
         ══════════════════════════════════════════════════════════ */}
      {(() => {
        const R = parseFloat(retraitMontant.replace(",", ".")) || 0;

        // Projection de la valeur et du capital investi à l'horizon choisi
        const mois = retraitHorizon * 12;
        const r    = retraitTauxAn / 100 / 12;
        const V = retraitHorizon === 0 ? totalActuel
          : (r === 0
            ? totalActuel + dcaMensuel * mois
            : totalActuel * Math.pow(1 + r, mois) + dcaMensuel * ((Math.pow(1 + r, mois) - 1) / r));
        const I       = totalInvesti + dcaMensuel * mois;
        const pvTotal = Math.max(0, V - I);

        // Proportion de plus-value dans le retrait (méthode proportionnelle légale)
        const pvRatio         = V > 0 ? pvTotal / V : 0;
        const pvImposable     = R * pvRatio;
        const capitalRecupere = R - pvImposable;

        // Ancienneté réelle à la date du retrait
        const dateOuv = load(account === "PEA" ? "bourse_pea_ouverture" : "bourse_cto_ouverture", null);
        const agePEAActuel = dateOuv ? (Date.now() - new Date(dateOuv).getTime()) / (1000*60*60*24*365) : null;
        const agePEARetrait = agePEAActuel !== null ? agePEAActuel + retraitHorizon : null;
        // Si on connaît la date : ancienneté calculée automatiquement
        const ancienneteEffective = agePEARetrait !== null
          ? (agePEARetrait >= 5 ? "apres5" : "avant5")
          : retraitAnciennete; // sinon valeur manuelle
        const ancienneteInconsistante = agePEARetrait !== null && ancienneteEffective !== retraitAnciennete;

        // Taux effectifs selon ancienneté réelle + régime fiscal
        const PS_RATE = 0.172;
        let irRate = 0;
        if (ancienneteEffective === "avant5") {
          irRate = retraitRegime === "pfu" ? 0.128 : (retraitTMI / 100);
        }
        const montantPS   = pvImposable * PS_RATE;
        const montantIR   = pvImposable * irRate;
        const totalImpots = montantPS + montantIR;
        const montantNet  = R - totalImpots;
        const tauxEff     = R > 0 ? (totalImpots / R) * 100 : 0;

        const inp  = { width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: "8px", fontSize: "13px", outline: "none", background: C.snow, color: C.ink, fontFamily: "Inter,sans-serif", boxSizing: "border-box" };
        const row  = { display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "2px" : "0", padding: "9px 0", borderBottom: `1px solid ${C.border}` };
        const lbl  = { fontSize: "12px", color: C.inkMuted };
        const val  = (c = C.ink) => ({ fontSize: "13px", fontWeight: "700", color: c, flexShrink: 0 });

        return (
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden", boxShadow: shadow.card }}>
            {/* Header */}
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "10px", background: C.navyLight }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: C.navy, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6"/>
                  <path d="M8 5 L8 8 L10.5 9.5"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: C.navy }}>Simulateur de retrait PEA</div>
                <div style={{ fontSize: "10px", color: C.inkMuted, marginTop: "1px" }}>Calcul de la fiscalité applicable selon l'ancienneté du plan</div>
              </div>
            </div>

            <div style={{ padding: isMobile ? "14px 16px" : "18px 20px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? "14px" : "18px" }}>
              {/* Colonne gauche — paramètres */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Horizon de retrait */}
                <div>
                  <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "6px" }}>Horizon de retrait</div>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {[0,1,2,3,5,7,10,15,20].map(h => (
                      <button key={h} onClick={() => setRetraitHorizon(h)}
                        style={{ padding: "4px 9px", borderRadius: "16px", border: `1.5px solid ${retraitHorizon === h ? C.navy : C.border}`, background: retraitHorizon === h ? C.navyLight : C.snow, color: retraitHorizon === h ? C.navy : C.inkMuted, fontSize: "10px", fontWeight: retraitHorizon === h ? "700" : "500", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                        {h === 0 ? "Maintenant" : `${h}a`}
                      </button>
                    ))}
                  </div>
                  {retraitHorizon > 0 && (
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ fontSize: "10px", color: C.inkMuted, fontWeight: "600", marginBottom: "5px" }}>Scénario de croissance</div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {[[-5,"Pess.","#EF4444"],[0,"Neutre",C.inkMuted],[7,"Base","#2563EB"],[12,"Opt.",C.green]].map(([t,label,col]) => (
                          <button key={t} onClick={() => setRetraitTauxAn(t)}
                            style={{ flex: 1, padding: "5px 2px", borderRadius: "8px", border: `1.5px solid ${retraitTauxAn === t ? col : C.border}`, background: retraitTauxAn === t ? col + "18" : C.snow, color: retraitTauxAn === t ? col : C.inkMuted, fontSize: "9px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif", textAlign: "center" }}>
                            <div>{label}</div>
                            <div style={{ opacity: 0.7 }}>{t >= 0 ? "+" : ""}{t}%</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "5px" }}>Montant du retrait souhaité (€)</div>
                  <input type="number" min="0" placeholder="ex : 10 000" value={retraitMontant}
                    onChange={e => setRetraitMontant(e.target.value)} style={inp} />
                </div>

                <div>
                  <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "6px" }}>Ancienneté du PEA</div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {[["avant5","Moins de 5 ans"],["apres5","5 ans et plus"]].map(([v, label]) => (
                      <button key={v} onClick={() => setRetraitAnciennete(v)}
                        style={{ flex: 1, padding: "8px 6px", borderRadius: "8px", border: `1.5px solid ${retraitAnciennete === v ? C.navy : C.border}`, background: retraitAnciennete === v ? C.navyLight : C.snow, color: retraitAnciennete === v ? C.navy : C.inkMuted, fontSize: "11px", fontWeight: retraitAnciennete === v ? "700" : "400", cursor: "pointer", fontFamily: "Inter,sans-serif", transition: "all 0.15s" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {retraitAnciennete === "avant5" && (
                  <div>
                    <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "6px" }}>Régime d'imposition (IR)</div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[["pfu","Flat Tax 30 %"],["bareme","Barème progressif"]].map(([v, label]) => (
                        <button key={v} onClick={() => setRetraitRegime(v)}
                          style={{ flex: 1, padding: "8px 6px", borderRadius: "8px", border: `1.5px solid ${retraitRegime === v ? C.navy : C.border}`, background: retraitRegime === v ? C.navyLight : C.snow, color: retraitRegime === v ? C.navy : C.inkMuted, fontSize: "11px", fontWeight: retraitRegime === v ? "700" : "400", cursor: "pointer", fontFamily: "Inter,sans-serif", transition: "all 0.15s" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {retraitRegime === "bareme" && (
                      <div style={{ marginTop: "10px" }}>
                        <div style={{ fontSize: "11px", color: C.inkMuted, fontWeight: "600", marginBottom: "5px" }}>Votre tranche marginale d'imposition (TMI)</div>
                        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                          {[0, 11, 30, 41, 45].map(tmi => (
                            <button key={tmi} onClick={() => setRetraitTMI(tmi)}
                              style={{ padding: "5px 10px", borderRadius: "6px", border: `1.5px solid ${retraitTMI === tmi ? C.navy : C.border}`, background: retraitTMI === tmi ? C.navy : C.snow, color: retraitTMI === tmi ? "#fff" : C.inkMuted, fontSize: "11px", fontWeight: "600", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                              {tmi}%
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* État PEA de référence */}
                <div style={{ background: C.snowOff, borderRadius: "10px", padding: "11px 14px", fontSize: "11px", color: C.inkMuted, lineHeight: "1.7" }}>
                  <div style={{ fontWeight: "700", color: C.ink, marginBottom: "4px" }}>
                    Base de calcul {retraitHorizon > 0 ? `— projection dans ${retraitHorizon} an${retraitHorizon > 1 ? "s" : ""}` : "(portefeuille actuel)"}
                  </div>
                  <div>Valeur projetée : <strong style={{ color: C.ink }}>{fmtEur(V)}</strong>{retraitHorizon > 0 && <span style={{ color: C.inkSubtle }}> (vs {fmtEur(totalActuel)} aujourd'hui)</span>}</div>
                  <div>Capital investi : <strong style={{ color: C.ink }}>{fmtEur(I)}</strong>{retraitHorizon > 0 && dcaMensuel > 0 && <span style={{ color: C.inkSubtle }}> (incl. DCA)</span>}</div>
                  <div>Plus-value projetée : <strong style={{ color: pvTotal >= 0 ? C.green : C.red }}>{fmtEur(pvTotal)} ({pvTotal >= 0 ? "+" : ""}{V > 0 ? ((pvTotal/V)*100).toFixed(1) : 0}% de la valeur)</strong></div>
                  {retraitHorizon > 0 && (
                    <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: `1px solid ${C.border}`, fontSize: "10px", color: C.inkSubtle }}>
                      ⚠ Projection indicative à {retraitTauxAn >= 0 ? "+" : ""}{retraitTauxAn}%/an. Le ratio PV/valeur ({(pvRatio*100).toFixed(1)}%) détermine la part imposable selon la méthode proportionnelle légale.
                    </div>
                  )}
                </div>
              </div>

              {/* Colonne droite — résultats */}
              <div>
                {R <= 0 ? (
                  <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.inkSubtle, gap: "10px", padding: "20px 0" }}>
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke={C.border} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="18" r="14"/>
                      <path d="M18 10 L18 20 M18 24 L18 26"/>
                    </svg>
                    <div style={{ fontSize: "12px", textAlign: "center" }}>Saisissez un montant de retrait<br/>pour voir le calcul fiscal</div>
                  </div>
                ) : (
                  <div>
                    {/* Correction automatique ancienneté */}
                    {ancienneteInconsistante && (
                      <div style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: "10px", padding: "10px 13px", marginBottom: "10px", fontSize: "11px", color: "#2563EB", lineHeight: "1.6" }}>
                        ℹ Dans {retraitHorizon} ans votre PEA aura <strong>{agePEARetrait?.toFixed(1)} ans</strong> → ancienneté corrigée automatiquement à <strong>{ancienneteEffective === "apres5" ? "5 ans et plus ✓" : "moins de 5 ans"}</strong>.
                      </div>
                    )}
                    {/* Avertissement < 5 ans */}
                    {ancienneteEffective === "avant5" && (
                      <div style={{ background: "rgba(220,38,38,0.06)", border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "10px", padding: "10px 13px", marginBottom: "14px", fontSize: "11px", color: C.red, lineHeight: "1.6" }}>
                        <strong>⚠ Attention</strong> : tout retrait avant 5 ans entraîne la <strong>clôture définitive du PEA</strong> (sauf licenciement, invalidité, décès du conjoint).
                      </div>
                    )}

                    <div style={{ background: C.snowOff, borderRadius: "12px", padding: "12px 16px", marginBottom: "14px" }}>
                      <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Décomposition du retrait</div>
                      <div style={row}>
                        <span style={lbl}>Retrait brut</span>
                        <span style={val()}>{fmtEur(R)}</span>
                      </div>
                      <div style={row}>
                        <span style={lbl}>Capital récupéré (non imposé)</span>
                        <span style={val(C.green)}>{fmtEur(capitalRecupere)}</span>
                      </div>
                      <div style={{ ...row, borderBottom: "none" }}>
                        <span style={lbl}>Plus-value imposable ({(pvRatio * 100).toFixed(1)}%)</span>
                        <span style={val(C.goldDark)}>{fmtEur(pvImposable)}</span>
                      </div>
                    </div>

                    <div style={{ background: C.snowOff, borderRadius: "12px", padding: "12px 16px", marginBottom: "14px" }}>
                      <div style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Fiscalité</div>
                      <div style={row}>
                        <span style={lbl}>Prélèvements sociaux (17,2%)</span>
                        <span style={val(C.red)}>− {fmtEur(montantPS)}</span>
                      </div>
                      <div style={row}>
                        <span style={lbl}>Impôt sur le revenu {ancienneteEffective === "avant5" ? `(${retraitRegime === "pfu" ? "12,8% PFU" : retraitTMI + "% TMI"})` : "(exonéré après 5 ans)"}</span>
                        <span style={val(ancienneteEffective === "apres5" ? C.green : C.red)}>{ancienneteEffective === "apres5" ? "0,00 €" : `− ${fmtEur(montantIR)}`}</span>
                      </div>
                      <div style={{ ...row, borderBottom: "none" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>Total prélèvements</span>
                        <span style={val(C.red)}>− {fmtEur(totalImpots)}</span>
                      </div>
                    </div>

                    {/* Résultat net */}
                    <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #C9A96E 100%)`, borderRadius: "12px", padding: "16px 18px", display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-end" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "10px" : "0" }}>
                      <div>
                        <div style={{ fontSize: "10px", color: "rgba(193,232,255,0.8)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>Montant net reçu</div>
                        <div style={{ fontSize: isMobile ? "28px" : "22px", fontWeight: "800", color: "#FFFFFF", marginTop: "3px" }}>{fmtEur(montantNet)}</div>
                      </div>
                      <div style={{ textAlign: isMobile ? "left" : "right" }}>
                        <div style={{ fontSize: "10px", color: "rgba(193,232,255,0.8)", fontWeight: "600" }}>Taux effectif</div>
                        <div style={{ fontSize: "18px", fontWeight: "800", color: tauxEff > 20 ? "#FCA5A5" : "#86EFAC" }}>{tauxEff.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: "10px 20px", borderTop: `1px solid ${C.border}`, fontSize: "10px", color: C.inkSubtle, lineHeight: "1.6" }}>
              Calcul basé sur les règles fiscales françaises 2025 · Prélèvements sociaux au taux de 17,2% · PS = CSG 9,2% + CRDS 0,5% + prélèvement de solidarité 7,5% · Les taux TMI sont indicatifs (hors déductions CSG) · Consultez un conseiller fiscal pour votre situation personnelle.
            </div>
          </div>
        );
      })()}
    </div>
  );
}


// ─── Glossaire pédagogique ───────────────────────────────────────────────────
const GLOSSARY = {
  "Valeur du portefeuille": "La valeur totale de toutes vos positions au cours actuel du marché. Elle fluctue chaque jour selon les prix.",
  "Capital investi": "La somme d'argent que vous avez réellement versée pour acheter vos titres. À renseigner dans l'onglet Profil pour un calcul précis.",
  "Plus-value latente": "Le gain (ou la perte) sur vos investissements. 'Latente' signifie non réalisée : vous n'avez pas encore vendu, c'est une valeur théorique.",
  "Variation du jour": "L'évolution de votre portefeuille depuis la clôture d'hier. En vert = votre portefeuille a progressé aujourd'hui.",
  "PRU": "Prix de Revient Unitaire — le prix moyen auquel vous avez acheté un titre, frais inclus. Sert à calculer votre gain ou perte réelle.",
  "RSI": "Indice de Force Relative (0 à 100). Au-dessus de 70 = titre suracheté (risque de baisse). En dessous de 30 = titre survendu (opportunité possible). Autour de 50 = neutre.",
  "MA50": "Moyenne des cours sur les 50 derniers jours. Indique la tendance à court/moyen terme. Si le cours est au-dessus, c'est plutôt positif.",
  "MA200": "Moyenne des cours sur les 200 derniers jours. Indique la tendance long terme. Un des indicateurs les plus suivis par les professionnels.",
  "DCA": "Dollar Cost Averaging — stratégie d'investissement régulier (ex: 100€/mois). Permet de lisser le prix d'achat et de réduire l'impact des fluctuations.",
  "ETF": "Exchange Traded Fund — fonds coté en bourse qui réplique un indice (ex: CAC 40, S&P 500). Simple, diversifié et peu coûteux.",
  "ISIN": "Code à 12 caractères qui identifie un titre financier de façon unique dans le monde entier (ex: FR0000131104 pour Total).",
  "Signal": "Recommandation générée par l'IA (ACHAT, RENFORCER, ATTENDRE, PRUDENCE, VENDRE) basée sur l'analyse des actualités. Informatif uniquement, pas un conseil.",
  "Projection": "Extrapolation mathématique de la tendance passée vers le futur. La bande grisée représente l'incertitude. Non garantie, à titre illustratif.",
  "PEA": "Plan d'Épargne en Actions — enveloppe fiscale française avantageuse pour investir en bourse. Après 5 ans, les gains sont exonérés d'impôt sur le revenu.",
  "CTO": "Compte-Titres Ordinaire — compte boursier classique sans avantage fiscal particulier. Permet d'investir sur tous les marchés mondiaux.",
};

// ─── Composant tooltip pédagogique ───────────────────────────────────────────
function InfoTip({ term, text, position = "top" }) {
  const [visible, setVisible] = useState(false);
  const [rect, setRect]       = useState(null);
  const btnRef  = useRef(null);
  const content = text || GLOSSARY[term] || term;

  const show = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setVisible(true);
  };
  const hide = () => setVisible(false);

  const tipStyle = rect ? {
    position: "fixed",
    left:  rect.left + rect.width / 2,
    ...(position === "top"
      ? { top: rect.top - 10,    transform: "translate(-50%, -100%)" }
      : { top: rect.bottom + 10, transform: "translateX(-50%)" }),
    background: "#111214", color: "#F8F9FA",
    borderRadius: "10px", padding: "10px 13px",
    fontSize: "11px", lineHeight: "1.55",
    width: "240px", zIndex: 99999,
    boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
    pointerEvents: "none",
    fontFamily: "Inter,sans-serif", fontWeight: "400",
  } : {};

  return (
    <span style={{ display: "inline-flex", alignItems: "center", marginLeft: "5px" }}>
      <span
        ref={btnRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onTouchStart={e => { e.preventDefault(); visible ? hide() : show(); }}
        style={{ width: "15px", height: "15px", borderRadius: "50%", background: "rgba(148,163,184,0.2)", color: "#94A3B8", fontSize: "9px", fontWeight: "800", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "help", flexShrink: 0, userSelect: "none", border: "1px solid rgba(148,163,184,0.3)", fontFamily: "Inter,sans-serif" }}>
        ?
      </span>
      {visible && rect && ReactDOM.createPortal(
        <span style={tipStyle}>
          <strong style={{ display: "block", marginBottom: "4px", color: "#fff", fontWeight: "700", fontSize: "12px" }}>{term}</strong>
          {content}
          <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", ...(position === "top" ? { top: "100%", borderTop: "5px solid #111214" } : { bottom: "100%", borderBottom: "5px solid #111214" }) }} />
        </span>,
        document.body
      )}
    </span>
  );
}

// ─── Portfolio Chart — graphique évolution portefeuille (Google Finance style) ─
async function resolveIsinToTicker(isin) {
  try {
    const res  = await fetchWithProxy(`https://query1.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=5&newsCount=0&enableFuzzyQuery=false`);
    const json = await res.json();
    const quotes = json.quotes || [];
    const eq = quotes.find(q => q.quoteType === "EQUITY" && q.symbol) || quotes.find(q => q.symbol);
    return eq?.symbol || null;
  } catch { return null; }
}

async function rebuildPortfolioHistory(account, onProgress) {
  const acc = account || "PEA";
  const progress = onProgress || (() => {});

  // ── Étape 1 : charger les transactions ────────────────────────────────────
  const ops = (() => { try { return JSON.parse(localStorage.getItem("bourse_avis_operes") || "[]"); } catch { return []; } })()
    .filter(o => (o.compte || "PEA") === acc)
    .sort((a, b) => a.date < b.date ? -1 : 1);

  const portfolio = load("bourse_portfolio", []).filter(p => (p.compte || "PEA") === acc);

  // ── Étape 2 : mapping ISIN → ticker (cache + portfolio + résolution auto) ─
  const cache = (() => { try { return JSON.parse(localStorage.getItem("bourse_isin_ticker_cache") || "{}"); } catch { return {}; } })();
  const isinToTicker = { ...cache };
  portfolio.forEach(p => { if (p.isin && p.ticker) isinToTicker[p.isin] = p.ticker; });

  const allIsins = [...new Set([
    ...ops.map(o => o.isin).filter(Boolean),
    ...portfolio.map(p => p.isin).filter(Boolean),
  ])];

  // Résolution automatique des ISIN sans ticker connu
  const unresolved = allIsins.filter(isin => !isinToTicker[isin]);
  if (unresolved.length) {
    progress(`Résolution de ${unresolved.length} ISIN...`);
    for (let i = 0; i < unresolved.length; i++) {
      const isin = unresolved[i];
      const ticker = await resolveIsinToTicker(isin);
      if (ticker) {
        isinToTicker[isin] = ticker;
        cache[isin] = ticker;
      }
      progress(`Résolution ISIN ${i + 1}/${unresolved.length}${ticker ? ` → ${ticker}` : " (non trouvé)"}`);
    }
    try { localStorage.setItem("bourse_isin_ticker_cache", JSON.stringify(cache)); } catch {}
  }

  const resolvedIsins = allIsins.filter(isin => isinToTicker[isin]);
  const tickers = [...new Set(resolvedIsins.map(isin => isinToTicker[isin]))];
  if (!tickers.length) return { count: 0, resolved: 0, total: allIsins.length };

  // ── Étape 3 : cours historiques Yahoo Finance ──────────────────────────────
  progress(`Téléchargement des cours pour ${tickers.length} valeur(s)...`);
  const pricesByTicker = {};
  await Promise.all(tickers.map(async ticker => {
    try {
      const res  = await fetchWithProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5y`);
      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (!result) { pricesByTicker[ticker] = {}; return; }
      const ts     = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      pricesByTicker[ticker] = {};
      ts.forEach((t, i) => {
        if (closes[i] != null)
          pricesByTicker[ticker][new Date(t * 1000).toISOString().slice(0, 10)] = closes[i];
      });
    } catch { pricesByTicker[ticker] = {}; }
  }));

  // ── Étape 4 : rejouer les transactions jour par jour ──────────────────────
  const allDates = new Set(Object.values(pricesByTicker).flatMap(m => Object.keys(m)));
  const useOps   = ops.length > 0;
  const earliest = useOps
    ? ops[0].date
    : portfolio.map(p => p.dateAchat).filter(Boolean).sort()[0] || new Date().toISOString().slice(0, 10);
  const today  = new Date().toISOString().slice(0, 10);
  const sorted = [...allDates].filter(d => d >= earliest && d <= today).sort();

  progress(`Calcul de ${sorted.length} jours de marché...`);
  const synth = [];

  if (useOps) {
    // Méthode précise : rejouer les transactions chronologiquement
    const holdings = {}; // isin → { qte, pru } — état courant
    let opIdx = 0;
    for (const date of sorted) {
      // Appliquer toutes les transactions <= date
      while (opIdx < ops.length && ops[opIdx].date <= date) {
        const op   = ops[opIdx++];
        const isin = op.isin;
        if (!isin) continue;
        if (!holdings[isin]) holdings[isin] = { qte: 0, pru: 0 };
        const h    = holdings[isin];
        const qte  = parseFloat(op.quantite)    || 0;
        const prix = parseFloat(op.prixUnitaire) || 0;
        const frais= parseFloat(op.frais)        || 0;
        if (op.type === "ACHAT") {
          const total = h.pru * h.qte + prix * qte + frais;
          h.qte += qte;
          h.pru  = h.qte > 0 ? total / h.qte : 0;
        } else if (op.type === "VENTE") {
          h.qte = Math.max(0, h.qte - qte);
        }
      }
      let valeur = 0, investi = 0;
      for (const [isin, h] of Object.entries(holdings)) {
        if (h.qte <= 0) continue;
        const ticker = isinToTicker[isin];
        const price  = ticker ? pricesByTicker[ticker]?.[date] : null;
        if (!price) continue;
        valeur  += price * h.qte;
        investi += h.pru * h.qte;
      }
      if (valeur > 0) synth.push({ date, valeur, investi, source: "transactions" });
    }
  } else {
    // Fallback : positions actuelles avec dateAchat
    const withTicker = portfolio.filter(p => p.dateAchat && p.quantite > 0);
    for (const date of sorted) {
      let valeur = 0, investi = 0;
      for (const pos of withTicker) {
        if (pos.dateAchat > date) continue;
        const ticker = isinToTicker[pos.isin] || pos.ticker;
        const price  = ticker ? pricesByTicker[ticker]?.[date] : null;
        if (!price) continue;
        valeur  += price * pos.quantite;
        investi += (pos.pru || 0) * pos.quantite;
      }
      if (valeur > 0) synth.push({ date, valeur, investi, source: "positions" });
    }
  }

  // ── Étape 5 : fusionner (snapshots réels prioritaires) ────────────────────
  const existing = (() => { try { return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || "[]"); } catch { return []; } })();
  const byDate   = {};
  synth.forEach(s   => byDate[s.date] = s);
  existing.forEach(s => byDate[s.date] = s);
  const merged = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-730);
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(merged));
  return { count: merged.length, resolved: resolvedIsins.length, total: allIsins.length };
}

function PortfolioChart({ hidden, account }) {
  const PERIODS = [
    { label: "1 S", days: 7   },
    { label: "1 M", days: 30  },
    { label: "3 M", days: 90  },
    { label: "6 M", days: 180 },
    { label: "1 A", days: 365 },
    { label: "Max", days: 9999},
  ];
  const [pidx, setPidx]           = useState(() => { try { return parseInt(localStorage.getItem("bourse_chart_pidx") || "5", 10); } catch { return 5; } });
  const [hover, setHover]         = useState(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState(null);
  const [snapVersion, setSnapVersion] = useState(0);
  const [visibleCurves, setVisibleCurves] = useState({ valeur: true, verse: true, pv: true });
  const svgRef = useRef(null);

  const changePidx = i => { setPidx(i); try { localStorage.setItem("bourse_chart_pidx", String(i)); } catch {} };
  const toggleCurve = k => setVisibleCurves(v => ({ ...v, [k]: !v[k] }));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allSnaps = useMemo(() => load("bourse_snapshots", []), [snapVersion]);
  const cutoff   = Date.now() - PERIODS[pidx].days * 86400000;
  const snaps    = allSnaps.filter(s => new Date(s.date).getTime() >= cutoff);
  const rawSnaps = snaps.length >= 2 ? snaps : (allSnaps.length >= 2 ? allSnaps : null);

  const displaySnaps = useMemo(() => {
    if (!rawSnaps || rawSnaps.length < 3) return rawSnaps || [];
    const gv = s => s.valeur || s.total || 0;
    return rawSnaps.filter((s, i, arr) => {
      if (i === 0 || i === arr.length - 1) return true;
      const v = gv(s);
      const neighbors = [];
      for (let j = Math.max(0, i - 2); j <= Math.min(arr.length - 1, i + 2); j++) {
        if (j !== i) neighbors.push(gv(arr[j]));
      }
      const sorted = [...neighbors].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      return med === 0 || Math.abs(v - med) / med < 0.20;
    });
  }, [rawSnaps]);

  if (displaySnaps.length < 2) return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "32px", textAlign: "center", marginTop: "16px", boxShadow: shadow.card }}>
      <div style={{ fontSize: "28px", marginBottom: "10px" }}>📈</div>
      <div style={{ fontSize: "14px", fontWeight: "700", color: C.ink, marginBottom: "6px" }}>Historique en construction</div>
      <div style={{ fontSize: "12px", color: C.inkSubtle, marginBottom: "16px" }}>Clique sur <strong>Reconstituer</strong> pour générer l'historique depuis tes transactions.</div>
      <button onClick={async () => {
        setRebuilding(true);
        try {
          const r = await rebuildPortfolioHistory(account, m => setRebuildMsg(m));
          setSnapVersion(v => v + 1);
          setRebuildMsg(`${r.count} points générés`);
        } catch (e) { setRebuildMsg("Erreur : " + e.message); }
        setRebuilding(false);
      }} disabled={rebuilding} style={{ padding: "10px 24px", borderRadius: "10px", background: C.navy, color: "#fff", border: "none", fontSize: "13px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
        {rebuilding ? "Reconstitution…" : "Reconstituer l'historique"}
      </button>
      {rebuildMsg && <div style={{ marginTop: "10px", fontSize: "11px", color: C.green, fontWeight: "600" }}>{rebuildMsg}</div>}
    </div>
  );

  // ── Données ──────────────────────────────────────────────────────────────────
  const vals  = displaySnaps.map(s => s.valeur || s.total || 0);
  const dates = displaySnaps.map(s => new Date(s.date).getTime());

  // Capital versé — monotone croissant
  const cvVals = (() => {
    const raw = displaySnaps.map(s => s.capitalVerse || s.investi || 0);
    let mx = 0; return raw.map(v => { mx = Math.max(mx, v); return mx; });
  })();
  const hasCv = cvVals.some(v => v > 0);

  // Plus-value = valeur − capital versé
  const pvVals = displaySnaps.map((_, i) => vals[i] - (hasCv ? cvVals[i] : 0));

  // Echelle Y — inclut toutes les courbes visibles + marge au-dessus
  const allY = [
    ...vals,
    ...(hasCv ? cvVals : []),
  ];
  const rawMin = Math.min(...allY);
  const rawMax = Math.max(...allY);
  const span   = rawMax - rawMin || rawMax;
  const minV   = Math.max(0, rawMin - span * 0.08);
  const maxV   = rawMax + span * 0.14;
  const minT = dates[0], maxT = dates[dates.length - 1];

  // ── SVG ──────────────────────────────────────────────────────────────────────
  const VW = 800, VH = 260, ML = 8, MR = 70, MT = 16, MB = 32;
  const CW = VW - ML - MR, CH = VH - MT - MB;
  const xS = t => ML + ((t - minT) / (maxT - minT || 1)) * CW;
  const yS = v => MT + CH - ((v - minV) / (maxV - minV || 1)) * CH;
  const pts = arr => arr.map((v, i) => `${xS(dates[i]).toFixed(1)},${yS(v).toFixed(1)}`).join(" L ");

  const first = vals[0], last = vals[vals.length - 1];
  const isUp  = last >= first;
  const lineColor = isUp ? "#1D7A4A" : "#C0392B";

  // Zone gain/perte (entre valeur et capital versé) — clampée dans la zone SVG
  const clampY = y => Math.max(MT, Math.min(MT + CH, y));
  const pvZone = hasCv ? `M ${vals.map((v, i) => `${xS(dates[i]).toFixed(1)},${clampY(yS(v)).toFixed(1)}`).join(" L ")} L ${[...displaySnaps].reverse().map((_, ri) => { const i = displaySnaps.length - 1 - ri; return `${xS(dates[i]).toFixed(1)},${clampY(yS(cvVals[i])).toFixed(1)}`; }).join(" L ")} Z` : null;

  // Aire sous la courbe valeur
  const areaPath = `M ${xS(dates[0]).toFixed(1)},${MT+CH} L ${pts(vals)} L ${xS(dates[dates.length-1]).toFixed(1)},${MT+CH} Z`;

  const gridVals = Array.from({ length: 5 }, (_, i) => minV + (maxV - minV) * i / 4);
  const xLabels  = Array.from({ length: 5 }, (_, i) => ({ t: minT + (maxT - minT) * i / 4, x: xS(minT + (maxT - minT) * i / 4) }));
  const xFmt = pidx <= 1 ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" };

  const lastCV = cvVals[cvVals.length - 1] || 0;
  const lastPV = pvVals[pvVals.length - 1] || 0;

  // Variation période
  const dEur = last - first;
  const dPct = first > 0 ? (dEur / first) * 100 : 0;
  const pvEur = hasCv ? (last - lastCV) : 0;
  const pvPct = hasCv && lastCV > 0 ? (pvEur / lastCV) * 100 : 0;
  const blurStyle = hidden ? { filter: "blur(6px)", userSelect: "none" } : {};

  const handleMouseMove = e => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VW;
    const clamp = Math.max(ML, Math.min(ML + CW, svgX));
    const t = minT + ((clamp - ML) / CW) * (maxT - minT);
    let ci = 0;
    dates.forEach((d, i) => { if (Math.abs(d - t) < Math.abs(dates[ci] - t)) ci = i; });
    const snap = displaySnaps[ci];
    if (!snap) return;
    setHover({ x: xS(dates[ci]), y: yS(vals[ci]), val: vals[ci], date: snap.date, cv: cvVals[ci] || 0, pv: pvVals[ci] || 0 });
  };

  const pvLabel = lastPV >= 0 ? "Plus-value" : "Perte";
  const pvLegColor = lastPV >= 0 ? "#059669" : "#C0392B";
  const LEGEND = [
    { key: "valeur", label: "Valeur",        color: lineColor,   dash: false },
    { key: "verse",  label: "Capital versé", color: "#C8972A",   dash: true  },
    { key: "pv",     label: pvLabel,         color: pvLegColor,  dash: false, fill: true },
  ];

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "20px 22px 16px", marginTop: "16px", boxShadow: shadow.card }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <div style={blurStyle}>
          <div style={{ fontSize: "30px", fontWeight: "800", color: C.ink, letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{fmtEur(last)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", fontWeight: "700", color: isUp ? "#1D7A4A" : "#C0392B" }}>
              {dEur >= 0 ? "+" : ""}{fmtEur(dEur)} ({dPct >= 0 ? "+" : ""}{dPct.toFixed(2)}%)
            </span>
            <span style={{ fontSize: "11px", color: C.inkSubtle }}>sur la période</span>
            {hasCv && <span style={{ fontSize: "11px", color: C.inkSubtle, borderLeft: `1px solid ${C.border}`, paddingLeft: "10px" }}>
              {pvEur >= 0 ? "PV totale" : "Perte totale"} <strong style={{ color: pvEur >= 0 ? "#1D7A4A" : "#C0392B" }}>{pvEur >= 0 ? "+" : ""}{fmtEur(pvEur)} ({pvPct >= 0 ? "+" : ""}{pvPct.toFixed(1)}%)</strong>
            </span>}
          </div>
          {displaySnaps.length >= 2 && (
            <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px" }}>
              {new Date(displaySnaps[0].date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} — {new Date(displaySnaps[displaySnaps.length-1].date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
              <span style={{ marginLeft: "8px", color: C.accent, fontWeight: "600" }}>· {displaySnaps.length} points</span>
            </div>
          )}
        </div>

        {/* Sélecteur période + Reconstituer */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
          <div style={{ display: "flex", gap: "2px", background: C.snowOff, borderRadius: "10px", padding: "3px" }}>
            {PERIODS.map((p, i) => (
              <button key={p.label} onClick={() => changePidx(i)}
                style={{ padding: "5px 11px", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "600", background: i === pidx ? "#fff" : "transparent", color: i === pidx ? C.ink : C.inkSubtle, boxShadow: i === pidx ? "0 1px 4px rgba(0,0,0,0.10)" : "none", transition: "all 0.15s", fontFamily: "Inter,sans-serif" }}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={async () => {
            setRebuilding(true); setRebuildMsg(null);
            try {
              const r = await rebuildPortfolioHistory(account, m => setRebuildMsg(m));
              setSnapVersion(v => v + 1);
              setRebuildMsg(`${r.count} points · ${r.resolved}/${r.total} ISIN`);
            } catch (e) { setRebuildMsg("Erreur"); }
            setRebuilding(false);
          }} disabled={rebuilding} style={{ fontSize: "10px", fontWeight: "600", color: C.inkSubtle, background: "transparent", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "4px 10px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            {rebuilding ? "⟳ Reconstitution…" : "⟳ Reconstituer"}
          </button>
          {rebuildMsg && <span style={{ fontSize: "9px", color: C.green, fontWeight: "600" }}>{rebuildMsg}</span>}
        </div>
      </div>

      {/* ── SVG Chart ── */}
      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", height: "auto", cursor: "crosshair", display: "block" }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>

        {/* Grille */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={ML} x2={ML+CW} y1={yS(v)} y2={yS(v)} stroke="rgba(148,163,184,0.15)" strokeWidth="1" strokeDasharray="4,6" />
            <text x={ML+CW+6} y={yS(v)+4} fontSize="9" fill="#94A3B8" fontFamily="Inter,sans-serif">
              {v >= 10000 ? (v/1000).toFixed(1)+"k" : Math.round(v)}
            </text>
          </g>
        ))}

        {/* Labels X */}
        {xLabels.map(({ t, x }, i) => (
          <text key={i} x={x} y={MT+CH+22} fontSize="9" fill="#94A3B8" fontFamily="Inter,sans-serif"
            textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>
            {new Date(t).toLocaleDateString("fr-FR", xFmt)}
          </text>
        ))}

        {/* Aire valeur */}
        {visibleCurves.valeur && <path d={areaPath} fill={isUp ? "rgba(29,122,74,0.07)" : "rgba(192,57,43,0.07)"} />}

        {/* Zone gain/perte (fill entre valeur et capital versé) */}
        {visibleCurves.pv && hasCv && pvZone && (
          <path d={pvZone} fill={lastPV >= 0 ? "rgba(5,150,105,0.13)" : "rgba(200,70,50,0.09)"} />
        )}

        {/* Courbe capital versé */}
        {visibleCurves.verse && hasCv && (() => {
          const yCV = Math.max(MT + 10, Math.min(MT + CH - 10, yS(lastCV)));
          return (<>
            <polyline points={pts(cvVals)} fill="none" stroke="#C8972A" strokeWidth="2" strokeDasharray="7,5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
            <rect x={ML+CW+4} y={yCV-9} width="62" height="18" rx="5" fill="#C8972A" />
            <text x={ML+CW+35} y={yCV+4} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="Inter,sans-serif">C. versé</text>
          </>);
        })()}

        {/* Courbe valeur principale */}
        {visibleCurves.valeur && (() => {
          const yLast = Math.max(MT + 10, Math.min(MT + CH - 10, yS(last)));
          return (<>
            <polyline points={pts(vals)} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={xS(dates[dates.length-1])} cy={yS(last)} r="4" fill={lineColor} stroke="#fff" strokeWidth="2" />
            <rect x={ML+CW+4} y={yLast-9} width="62" height="18" rx="5" fill={lineColor} />
            <text x={ML+CW+35} y={yLast+4} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="Inter,sans-serif">Valeur</text>
          </>);
        })()}

        {/* Hover */}
        {hover && (
          <>
            <line x1={hover.x} x2={hover.x} y1={MT} y2={MT+CH} stroke="rgba(148,163,184,0.5)" strokeWidth="1" strokeDasharray="3,3" />
            <circle cx={hover.x} cy={hover.y} r="4.5" fill={lineColor} stroke="#fff" strokeWidth="2" />
            {(() => {
              const hasInfo = hover.cv > 0;
              const W = 160, H = hasInfo ? 88 : 44;
              const tx = Math.max(ML, Math.min(hover.x - W/2, ML + CW - W));
              const ty = Math.max(MT+2, hover.y - H - 10);
              const pvColor = hover.pv >= 0 ? "#4ADE80" : "#F87171";
              return (<>
                <rect x={tx} y={ty} width={W} height={H} rx="8" fill="#0F172A" opacity="0.96" />
                <text x={tx+W/2} y={ty+16} textAnchor="middle" fontSize="11" fill="#fff" fontFamily="Inter,sans-serif" fontWeight="800">{fmtEur(hover.val)}</text>
                {hasInfo && <>
                  <line x1={tx+10} x2={tx+W-10} y1={ty+24} y2={ty+24} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <text x={tx+10} y={ty+38} fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="Inter,sans-serif">Capital versé</text>
                  <text x={tx+W-10} y={ty+38} textAnchor="end" fontSize="9" fill="#FCD34D" fontFamily="Inter,sans-serif" fontWeight="600">{fmtEur(hover.cv)}</text>
                  <text x={tx+10} y={ty+54} fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="Inter,sans-serif">Plus-value</text>
                  <text x={tx+W-10} y={ty+54} textAnchor="end" fontSize="9" fill={pvColor} fontFamily="Inter,sans-serif" fontWeight="600">{hover.pv >= 0 ? "+" : ""}{fmtEur(hover.pv)}</text>
                  <text x={tx+10} y={ty+70} fontSize="9" fill="rgba(255,255,255,0.5)" fontFamily="Inter,sans-serif">Rendement</text>
                  <text x={tx+W-10} y={ty+70} textAnchor="end" fontSize="9" fill={pvColor} fontFamily="Inter,sans-serif" fontWeight="600">{hover.cv > 0 ? ((hover.pv/hover.cv)*100).toFixed(1) : "—"}%</text>
                </>}
                <text x={tx+W/2} y={ty+H-6} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="Inter,sans-serif">
                  {new Date(hover.date).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" })}
                </text>
              </>);
            })()}
          </>
        )}
      </svg>

      {/* ── Légende cliquable ── */}
      <div style={{ display: "flex", gap: "18px", justifyContent: "center", marginTop: "14px", flexWrap: "wrap" }}>
        {LEGEND.map(({ key, label, color, dash, fill }) => (
          <button key={key} onClick={() => toggleCurve(key)}
            style={{ display: "flex", alignItems: "center", gap: "7px", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: "8px", opacity: visibleCurves[key] ? 1 : 0.35, transition: "opacity 0.2s", fontFamily: "Inter,sans-serif" }}>
            <svg width="24" height="10" style={{ flexShrink: 0 }}>
              {fill
                ? <rect x="0" y="2" width="24" height="6" rx="2" fill={color} opacity="0.35" />
                : <line x1="0" y1="5" x2="24" y2="5" stroke={color} strokeWidth="2.5" strokeDasharray={dash ? "7,4" : ""} strokeLinecap="round" />
              }
            </svg>
            <span style={{ fontSize: "11px", fontWeight: "600", color: visibleCurves[key] ? C.ink : C.inkSubtle }}>
              {label}
              {key === "valeur" && <span style={{ fontWeight: "400", color: C.inkSubtle, marginLeft: "4px" }}>{fmtEur(last)}</span>}
              {key === "verse"  && hasCv && <span style={{ fontWeight: "400", color: C.inkSubtle, marginLeft: "4px" }}>{fmtEur(lastCV)}</span>}
              {key === "pv"     && hasCv && <span style={{ fontWeight: "700", color: lastPV >= 0 ? "#059669" : "#C0392B", marginLeft: "4px" }}>{lastPV >= 0 ? "+" : ""}{fmtEur(lastPV)}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard Bar — 4 cards essentielles ────────────────────────────────────
function computeRiskScore(positions, totalActuel) {
  if (!positions.length) return null;
  let score = 5;
  const nbPositions = positions.length;
  const nbETF = positions.filter(p => isETFName(p.nom)).length;
  const totalInvest = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const totalVal = totalActuel || totalInvest;

  // Concentration
  positions.forEach(p => {
    const poids = totalVal > 0 ? (((p.dernierCours || p.pru) * p.quantite) / totalVal) * 100 : 0;
    if (poids > 30) score += 2;
    else if (poids > 20) score += 1;
  });
  // Diversification
  if (nbPositions <= 2) score += 2;
  else if (nbPositions <= 4) score += 1;
  else if (nbPositions >= 10) score -= 1;
  // ETF = moins de risque titre spécifique
  if (nbETF / nbPositions > 0.5) score -= 1;
  // Performance globale
  const pvPct = totalInvest > 0 ? ((totalVal - totalInvest) / totalInvest) * 100 : 0;
  if (pvPct < -20) score += 2;
  else if (pvPct < -10) score += 1;
  else if (pvPct > 30) score -= 1;

  return Math.min(10, Math.max(1, Math.round(score)));
}

function DashboardBar({ onTabChange, hidden, profil, account = "PEA" }) {
  const isMobile  = useIsMobile();
  const allPos    = load("bourse_portfolio", []);
  const positions = allPos.filter(p => (p.compte || "PEA") === account);
  if (positions.length === 0) return null;

  const capitalInvesti = account === "PEA" ? (Number(profil?.capitalPEA) || 0) : (Number(profil?.capitalCTO) || 0);
  const totalActuel    = positions.reduce((s, p) => s + ((p.dernierCours || p.pru || 0)) * (p.quantite || 0), 0);
  const totalInvesti   = positions.reduce((s, p) => s + (p.pru || 0) * (p.quantite || 0), 0);
  const totalPV        = totalActuel - totalInvesti;
  const totalPVpct     = totalInvesti > 0 ? (totalPV / totalInvesti) * 100 : 0;

  const riskScore = computeRiskScore(positions, totalActuel);
  const riskColor = riskScore <= 3 ? C.green : riskScore <= 6 ? C.goldDark : C.red;
  const riskLabel = riskScore <= 3 ? "Risque faible" : riskScore <= 6 ? "Risque modéré" : "Risque élevé";

  const varJourEur = positions.some(p => p.intradayVariation != null)
    ? positions.reduce((s, p) => {
        if (p.intradayVariation == null) return s;
        const cours = p.dernierCours || p.pru;
        const hier  = cours / (1 + p.intradayVariation / 100);
        return s + (cours - hier) * p.quantite;
      }, 0)
    : null;
  const varJourPct = varJourEur != null && totalActuel > 0
    ? (varJourEur / (totalActuel - (varJourEur || 0))) * 100 : null;

  // Top / Flop
  const sorted = [...positions].map(p => ({
    ...p, pvPct: p.pru > 0 ? ((p.dernierCours || p.pru) - p.pru) / p.pru * 100 : 0,
  })).sort((a, b) => b.pvPct - a.pvPct);
  const best  = sorted[0];
  const worst = sorted[sorted.length - 1];

  // Sparkline depuis snapshots
  const snapshots = load("bourse_snapshots", []);
  const snap30 = snapshots.slice(-30);
  const sparkPath = (() => {
    if (snap30.length < 2) return null;
    const vals = snap30.map(s => s.total || 0);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const W = 200, H = 50;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - min) / range) * H}`);
    return `M ${pts.join(" L ")}`;
  })();

  // Statut marché (Euronext Paris : lun-ven 9h-17h30, hors jours fériés)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const cetOffset = now.getTimezoneOffset() / -60; // local UTC offset in hours
  const cetHour   = now.getHours() + (cetOffset - (now.getMonth() >= 3 && now.getMonth() <= 9 ? 2 : 1)); // approx CET/CEST
  const mm = now.getMonth() + 1, dd = now.getDate();
  // Jours fériés fixes Euronext Paris
  const isFerie = (
    (mm === 1  && dd === 1)  || // Nouvel An
    (mm === 5  && dd === 1)  || // Fête du Travail
    (mm === 5  && dd === 8)  || // Victoire 1945
    (mm === 7  && dd === 14) || // Fête Nationale
    (mm === 8  && dd === 15) || // Assomption
    (mm === 11 && dd === 1)  || // Toussaint
    (mm === 11 && dd === 11) || // Armistice
    (mm === 12 && dd === 25) || // Noël
    (mm === 12 && dd === 26)    // Boxing Day (Euronext fermé)
  );
  const isOpen = !isFerie && dayOfWeek >= 1 && dayOfWeek <= 5 && cetHour >= 9 && (cetHour < 17 || (cetHour === 17 && now.getMinutes() <= 30));
  const marketLabel = isOpen ? "Ouvert" : "Fermé";
  const marketColor = isOpen ? C.green : C.red;

  const blurStyle = hidden ? { filter: "blur(7px)", userSelect: "none", pointerEvents: "none" } : {};

  return (
    <div style={{ marginBottom: "24px" }}>

      <style>{`@keyframes marketPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(0.85)} }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "17px", fontWeight: "700", color: C.ink, letterSpacing: "-0.03em" }}>Portefeuille</span>
          <span style={{ fontSize: "10px", fontWeight: "600", color: account === "PEA" ? C.accent : "#7C3AED", background: account === "PEA" ? "rgba(59,130,246,0.08)" : "rgba(124,58,237,0.08)", borderRadius: "5px", padding: "2px 8px" }}>{account}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: marketColor, display: "inline-block", animation: isOpen ? "marketPulse 2.5s ease-in-out infinite" : "none" }} />
            <span style={{ fontSize: "11px", color: marketColor, fontWeight: "600" }}>{marketLabel}</span>
          </span>
          <span style={{ fontSize: "11px", color: C.inkSubtle }}>{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
      </div>

      {/* KPI strip — 4 cartes horizontales */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", marginLeft: "-4px", marginRight: "-4px", paddingLeft: "4px", paddingRight: "4px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(4, 150px)" : "repeat(4, 1fr)", gap: "10px", minWidth: isMobile ? "620px" : "auto" }}>
          {[
            { label: account === "CTO" ? "Capital investi CTO" : "Capital investi PEA", main: capitalInvesti > 0 ? fmtEur(capitalInvesti) : "—", sub: null, color: C.inkMuted, numColor: C.ink, subSmall: capitalInvesti === 0 },
            { label: "Plus-value latente", main: (totalPV >= 0 ? "+" : "") + fmtEur(totalPV), sub: (totalPVpct >= 0 ? "+" : "") + totalPVpct.toFixed(2) + "%", color: totalPV >= 0 ? C.green : C.red, numColor: totalPV >= 0 ? C.green : C.red },
            { label: "Variation du jour", main: varJourEur != null ? (varJourEur >= 0 ? "+" : "") + fmtEur(varJourEur) : "—", sub: varJourPct != null ? (varJourPct >= 0 ? "+" : "") + varJourPct.toFixed(2) + "%" : null, color: varJourEur == null ? C.inkSubtle : varJourEur >= 0 ? C.green : C.red, numColor: varJourEur == null ? C.inkMuted : varJourEur >= 0 ? C.green : C.red },
            { label: "Score de risque", main: riskScore !== null ? `${riskScore} / 10` : "—", sub: riskLabel, color: riskColor, numColor: riskColor, isRisk: true },
          ].map((card) => (
            <div key={card.label} style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: card.color, borderRadius: "16px 16px 0 0" }} />
              <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>{card.label}</div>
              <div style={{ fontSize: isMobile ? "20px" : "22px", fontWeight: "700", color: card.numColor || C.ink, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", lineHeight: 1, ...blurStyle }}>{card.main}</div>
              {card.isRisk && riskScore !== null && (
                <div style={{ marginTop: "8px", background: C.snowOff, borderRadius: "4px", height: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${riskScore * 10}%`, height: "100%", background: riskColor, borderRadius: "4px", transition: "width 0.5s ease" }} />
                </div>
              )}
              {card.sub && (
                <div style={{ marginTop: "8px", display: "inline-flex", alignItems: "center", background: card.color === C.green ? C.greenLight : card.color === C.red ? C.redLight : C.snowDim, borderRadius: "6px", padding: "2px 8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: "700", color: card.color, fontVariantNumeric: "tabular-nums", ...blurStyle }}>{card.sub}</span>
                </div>
              )}
              {card.subSmall && (
                <div style={{ marginTop: "8px", background: C.snowDim, borderRadius: "6px", padding: "4px 9px", fontSize: "10px", color: C.inkMuted, fontWeight: "600", display: "inline-block" }}>À renseigner dans Profil</div>
              )}
            </div>
          ))}
        </div>
      </div>


      {/* ── Bilan hebdomadaire ── */}
      <WeeklySummary positions={positions} totalActuel={totalActuel} totalPV={totalPV} hidden={hidden} />
    </div>
  );
}

// ─── Bilan hebdomadaire ───────────────────────────────────────────────────────
const WEEKLY_KEY = "bourse_weekly_seen";

function isJourFerie(d) {
  const mm = d.getMonth() + 1, dd = d.getDate();
  return (mm===1&&dd===1)||(mm===5&&dd===1)||(mm===5&&dd===8)||(mm===7&&dd===14)||
         (mm===8&&dd===15)||(mm===11&&dd===1)||(mm===11&&dd===11)||(mm===12&&dd===25)||(mm===12&&dd===26);
}
function isJourMarche(d) {
  const j = d.getDay();
  return j >= 1 && j <= 5 && !isJourFerie(d);
}

function WeeklySummary({ positions, totalActuel, totalPV, hidden }) {
  const today = new Date();
  const currentWeek = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const [dismissed, setDismiss] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(WEEKLY_KEY) || "{}");
      return stored.week >= currentWeek && stored.date === today.toISOString().slice(0, 10);
    } catch { return false; }
  });

  // Vérifier si aujourd'hui est le premier ou dernier jour de marché de la semaine
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const isFirstJourMarche = isJourMarche(today) && !isJourMarche(yesterday);
  const isLastJourMarche  = isJourMarche(today) && !isJourMarche(tomorrow);
  const shouldShow = isFirstJourMarche || isLastJourMarche;

  if (dismissed || positions.length === 0 || !shouldShow) return null;

  const totalInvest = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const pvPct = totalInvest > 0 ? (totalPV / totalInvest) * 100 : 0;

  const sorted = [...positions].map(p => ({
    ...p,
    pv: ((p.dernierCours || p.pru) - p.pru) * p.quantite,
    pvPct: p.pru > 0 ? ((p.dernierCours || p.pru) - p.pru) / p.pru * 100 : 0,
  })).sort((a, b) => b.pvPct - a.pvPct);

  const best   = sorted[0];
  const worst  = sorted[sorted.length - 1];
  const nbHausse = sorted.filter(p => p.pvPct > 0).length;
  const dateStr  = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const blurStyle = hidden ? { filter: "blur(7px)", userSelect: "none" } : {};

  const dismiss = () => {
    try { localStorage.setItem(WEEKLY_KEY, JSON.stringify({ week: currentWeek, date: today.toISOString().slice(0, 10) })); } catch {}
    setDismiss(true);
  };

  return (
    <div style={{ background: "linear-gradient(135deg, #0C1829 0%, #1E3A5F 100%)", borderRadius: "20px", padding: "20px 24px", marginTop: "16px", boxShadow: shadow.float, position: "relative", overflow: "hidden" }}>
      {/* Background pattern */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 80% 50%, rgba(74,158,219,0.15) 0%, transparent 60%)", pointerEvents: "none" }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", position: "relative" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <div style={{ fontSize: "16px" }}>📅</div>
            <div>
              <div style={{ fontSize: "11px", fontWeight: "800", color: "rgba(255,255,255,0.9)", letterSpacing: "0.5px" }}>Bilan hebdomadaire</div>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.45)", marginTop: "1px" }}>{dateStr}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {/* Total */}
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "10px 14px", minWidth: "110px" }}>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", fontWeight: "600", letterSpacing: "0.8px", marginBottom: "4px" }}>PORTEFEUILLE</div>
              <div style={{ fontSize: "16px", fontWeight: "800", color: "#fff", ...blurStyle }}>{fmtEur(totalActuel)}</div>
              <div style={{ fontSize: "10px", fontWeight: "700", color: pvPct >= 0 ? "#6EE7B7" : "#FCA5A5", marginTop: "2px", ...blurStyle }}>{pvPct >= 0 ? "+" : ""}{pvPct.toFixed(2)}% global</div>
            </div>
            {/* Lignes en hausse */}
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "10px 14px", minWidth: "110px" }}>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", fontWeight: "600", letterSpacing: "0.8px", marginBottom: "4px" }}>EN HAUSSE</div>
              <div style={{ fontSize: "16px", fontWeight: "800", color: "#6EE7B7" }}>{nbHausse} / {positions.length}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>positions positives</div>
            </div>
            {/* Meilleure perf */}
            {best && (
              <div style={{ background: "rgba(110,231,183,0.12)", borderRadius: "12px", padding: "10px 14px", minWidth: "130px", border: "1px solid rgba(110,231,183,0.2)" }}>
                <div style={{ fontSize: "9px", color: "rgba(110,231,183,0.7)", fontWeight: "600", letterSpacing: "0.8px", marginBottom: "4px" }}>🏆 MEILLEURE</div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: "#fff", ...blurStyle }}>{best.nom.split(" ")[0]}</div>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#6EE7B7", marginTop: "2px", ...blurStyle }}>+{best.pvPct.toFixed(1)}%</div>
              </div>
            )}
            {/* Pire perf (si différente de la meilleure) */}
            {worst && worst.id !== best?.id && worst.pvPct < 0 && (
              <div style={{ background: "rgba(252,165,165,0.10)", borderRadius: "12px", padding: "10px 14px", minWidth: "130px", border: "1px solid rgba(252,165,165,0.2)" }}>
                <div style={{ fontSize: "9px", color: "rgba(252,165,165,0.7)", fontWeight: "600", letterSpacing: "0.8px", marginBottom: "4px" }}>⚠ À SURVEILLER</div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: "#fff", ...blurStyle }}>{worst.nom.split(" ")[0]}</div>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#FCA5A5", marginTop: "2px", ...blurStyle }}>{worst.pvPct.toFixed(1)}%</div>
              </div>
            )}
          </div>
        </div>
        <button onClick={dismiss}
          style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "6px 10px", color: "rgba(255,255,255,0.6)", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
          ✕ Fermer
        </button>
      </div>
    </div>
  );
}

// ─── Helpers techniques ──────────────────────────────────────────────────────

/** Calcule une moyenne mobile simple sur `prices` avec une fenêtre de `win` points.
 *  Retourne null pour les points où il n'y a pas assez d'historique. */
function computeMA(prices, win) {
  return prices.map((_, i) => {
    if (i < win - 1) return null;
    return prices.slice(i - win + 1, i + 1).reduce((s, v) => s + v, 0) / win;
  });
}

/** RSI (Wilder, période 14) — retourne null pour les premiers points insuffisants. */
function computeRSI(prices, period = 14) {
  const result = new Array(prices.length).fill(null);
  if (prices.length < period + 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    const gain = d >= 0 ? d : 0, loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

/** Valeur future d'un capital via DCA mensuel avec taux annuel r. */
function projDCA(capital, dcaMensuel, tauxAnnuel, mois) {
  const r = tauxAnnuel / 12;
  if (r === 0) return capital + dcaMensuel * mois;
  return capital * Math.pow(1 + r, mois) + dcaMensuel * ((Math.pow(1 + r, mois) - 1) / r);
}

// ─── Simulateur DCA (slider) ─────────────────────────────────────────────────
function DCASimulator({ profil, dcaSim, setDcaSim, positions }) {
  const capitalActuel = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const dcaMin = 50, dcaMax = 3000, dcaStep = 50;

  // Calculs pour 3 scénarios : pessimiste 3%, réaliste 7%, optimiste 10%
  const scenarios = [
    { label: "Pessimiste", taux: 0.03, color: C.red },
    { label: "Réaliste",   taux: 0.07, color: C.navy },
    { label: "Optimiste",  taux: 0.10, color: C.green },
  ];
  const horizons = [12, 36, 60, 120]; // mois

  // Frais de courtage estimés par mois (calcul simplifié)
  const fraisMensuel = dcaSim <= 500 ? 1.99 : dcaSim * 0.005;
  const fraisAnnuel  = fraisMensuel * 12;
  const dcaNet       = dcaSim - fraisMensuel;

  return (
    <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", marginTop: "20px", boxShadow: shadow.card }}>
      <div style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "16px" }}>
        🎚 Simulateur DCA — impact du montant mensuel
      </div>

      {/* Slider */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "13px", color: C.inkMuted }}>DCA mensuel</span>
          <span style={{ fontSize: "22px", fontWeight: "800", color: C.navy }}>{dcaSim} €<span style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "400", marginLeft: "6px" }}>/ mois</span></span>
        </div>
        <input type="range" min={dcaMin} max={dcaMax} step={dcaStep} value={dcaSim}
          onChange={e => setDcaSim(Number(e.target.value))}
          style={{ width: "100%", accentColor: C.navy, cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: C.inkSubtle, marginTop: "3px" }}>
          <span>{dcaMin} €</span><span>{dcaMax} €</span>
        </div>
      </div>

      {/* Info frais */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
        <div style={{ background: C.snowOff, borderRadius: "8px", padding: "8px 14px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "9px", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px" }}>Frais estimés / mois</div>
          <div style={{ fontSize: "14px", fontWeight: "800", color: C.goldDark }}>{fmtEur(fraisMensuel)}</div>
          <div style={{ fontSize: "9px", color: C.inkSubtle }}>{fmtEur(fraisAnnuel)} / an</div>
        </div>
        <div style={{ background: C.snowOff, borderRadius: "8px", padding: "8px 14px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "9px", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px" }}>DCA net de frais</div>
          <div style={{ fontSize: "14px", fontWeight: "800", color: C.navy }}>{fmtEur(dcaNet)}</div>
          <div style={{ fontSize: "9px", color: C.inkSubtle }}>{((fraisMensuel / dcaSim) * 100).toFixed(1)}% de frais</div>
        </div>
        <div style={{ background: C.snowOff, borderRadius: "8px", padding: "8px 14px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: "9px", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px" }}>Investi / an</div>
          <div style={{ fontSize: "14px", fontWeight: "800", color: C.ink }}>{fmtEur(dcaSim * 12)}</div>
        </div>
      </div>

      {/* Tableau projections */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ background: C.snowOff }}>
              <th style={{ padding: "8px 12px", textAlign: "left", fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", borderBottom: `1px solid ${C.border}` }}>Scénario</th>
              {horizons.map(m => (
                <th key={m} style={{ padding: "8px 12px", textAlign: "right", fontSize: "9px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "1px", borderBottom: `1px solid ${C.border}` }}>
                  {m < 12 ? `${m} mois` : `${m / 12} an${m / 12 > 1 ? "s" : ""}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenarios.map(sc => (
              <tr key={sc.label} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: sc.color }}>{sc.label}</span>
                  <span style={{ fontSize: "9px", color: C.inkSubtle, marginLeft: "6px" }}>{(sc.taux * 100).toFixed(0)}%/an</span>
                </td>
                {horizons.map(m => {
                  const val = projDCA(capitalActuel, dcaNet, sc.taux, m);
                  const gain = val - capitalActuel - dcaNet * m;
                  return (
                    <td key={m} style={{ padding: "10px 12px", textAlign: "right" }}>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: sc.color }}>{fmtEur(val)}</div>
                      <div style={{ fontSize: "9px", color: gain >= 0 ? C.green : C.red }}>
                        {gain >= 0 ? "+" : ""}{fmtEur(gain)} intérêts
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: "9px", color: C.inkSubtle, marginTop: "8px" }}>
        Capital de départ : {fmtEur(capitalActuel)} · Frais de courtage estimés (≤500€ : 1,99€ · &gt;500€ : 0,5%) · Projection indicative non garantie.
      </div>
    </div>
  );
}

// ─── Stratégie DCA Tab ────────────────────────────────────────────────────────
// Contient la stratégie DCA mensuelle + l'analyse IA du portefeuille
function StratégieDCATab({ profil, portfolioVersion, marketScores, marketScoringUi, onRunScoring, onSaveProfil, account = "PEA" }) {
  const [allPositions, setAllPositions] = useState(() => sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
  const positions = allPositions.filter(p => (p.compte || "PEA") === account);

  useEffect(() => {
    setAllPositions(sanitizePositions(load("bourse_portfolio", DEFAULT_POSITIONS)));
  }, [portfolioVersion]);

  // ── Simulateur DCA ──────────────────────────────────────────────────────────
  const dcaBase = profil?.dcaMensuel || 200;
  const [dcaSim, setDcaSim] = useState(dcaBase);

  if (positions.length === 0) return (
    <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "48px 28px", textAlign: "center", boxShadow: shadow.card }}>
      <div style={{ fontSize: "36px", marginBottom: "14px", lineHeight: 1 }}>◎</div>
      <div style={{ fontSize: "15px", fontWeight: "800", color: C.ink, marginBottom: "8px" }}>Aucune position dans le portefeuille</div>
      <div style={{ fontSize: "12px", color: C.inkMuted, maxWidth: "380px", margin: "0 auto", lineHeight: "1.6" }}>
        Ajoutez vos actions et ETF dans l'onglet <strong>Positions</strong> pour que le Plan DCA calcule automatiquement quelle valeur renforcer ce mois.
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <DCASimulator profil={profil} dcaSim={dcaSim} setDcaSim={setDcaSim} positions={positions} />
      <DCAStrategy positions={positions} profil={profil} marketScores={marketScores} marketScoringUi={marketScoringUi} onRunScoring={onRunScoring} onSaveProfil={onSaveProfil} />
    </div>
  );
}

// ─── Sidebar icons ────────────────────────────────────────────────────────────
const IconPositions = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="5" height="5" rx="1.2"/>
    <rect x="9" y="2" width="5" height="5" rx="1.2"/>
    <rect x="2" y="9" width="5" height="5" rx="1.2"/>
    <rect x="9" y="9" width="5" height="5" rx="1.2"/>
  </svg>
);
const IconTrending = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1.5,11.5 5.5,7.5 8.5,9.5 14.5,3.5"/>
    <polyline points="10.5,3.5 14.5,3.5 14.5,7.5"/>
  </svg>
);
const IconTarget = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <circle cx="8" cy="8" r="3"/>
    <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/>
  </svg>
);
const IconWave = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 11 C2.5 11 3.5 5 5.5 6 C7.5 7 8.5 12 10.5 9 C12.5 6 13.5 7.5 15 6.5"/>
  </svg>
);
const IconPie = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2 A6 6 0 0 1 14 8 L8 8 Z" fill="currentColor" stroke="none" opacity="0.25"/>
    <circle cx="8" cy="8" r="6"/>
    <line x1="8" y1="8" x2="8" y2="2"/>
    <line x1="8" y1="8" x2="14" y2="8"/>
  </svg>
);
const IconSwap = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 6 L12.5 6 M10 3.5 L12.5 6 L10 8.5"/>
    <path d="M12.5 10 L3.5 10 M6 7.5 L3.5 10 L6 12.5"/>
  </svg>
);
const IconGear = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="2.5"/>
    <path d="M8 1.5 L8 3 M8 13 L8 14.5 M1.5 8 L3 8 M13 8 L14.5 8 M3.4 3.4 L4.5 4.5 M11.5 11.5 L12.6 12.6 M12.6 3.4 L11.5 4.5 M4.5 11.5 L3.4 12.6"/>
  </svg>
);
const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="5.5" r="2.5"/>
    <path d="M2.5 13.5 C2.5 11 5 9 8 9 C11 9 13.5 11 13.5 13.5"/>
  </svg>
);

const IconNewspaper = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2" width="13" height="12" rx="1.5"/>
    <line x1="4" y1="5.5" x2="12" y2="5.5"/>
    <line x1="4" y1="8" x2="12" y2="8"/>
    <line x1="4" y1="10.5" x2="9" y2="10.5"/>
  </svg>
);
const IconChat = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3.5 C2 2.67 2.67 2 3.5 2 L12.5 2 C13.33 2 14 2.67 14 3.5 L14 9.5 C14 10.33 13.33 11 12.5 11 L9 11 L6 14 L6 11 L3.5 11 C2.67 11 2 10.33 2 9.5 Z"/>
    <line x1="5" y1="5.5" x2="11" y2="5.5"/>
    <line x1="5" y1="8" x2="9" y2="8"/>
  </svg>
);

// ─── Autopilot IA — univers d'investissement ──────────────────────────────────
// profil_min : profil minimum requis pour voir cet instrument dans l'univers scanné
const AUTOPILOT_UNIVERSE = {
  PEA: [
    // ETFs diversifiés → tous profils
    { symbol: "CW8.PA",   nom: "Amundi MSCI World",            type: "ETF",    secteur: "ETF Monde",         profil_min: "prudent" },
    { symbol: "WPEA.PA",  nom: "Amundi World PEA",             type: "ETF",    secteur: "ETF Monde",         profil_min: "prudent" },
    { symbol: "PAEEM.PA", nom: "Amundi MSCI Emerging Markets", type: "ETF",    secteur: "ETF Émergents",     profil_min: "prudent" },
    { symbol: "PUST.PA",  nom: "Amundi PEA S&P 500 ESG",      type: "ETF",    secteur: "ETF USA",           profil_min: "prudent" },
    { symbol: "LYPS.PA",  nom: "Amundi S&P 500",              type: "ETF",    secteur: "ETF USA",           profil_min: "prudent" },
    { symbol: "PANX.PA",  nom: "Amundi PEA Nasdaq-100",       type: "ETF",    secteur: "ETF Tech",          profil_min: "prudent" },
    { symbol: "PCEU.PA",  nom: "Amundi MSCI Europe",          type: "ETF",    secteur: "ETF Europe",        profil_min: "prudent" },
    { symbol: "ESE.PA",   nom: "iShares Core MSCI Europe",    type: "ETF",    secteur: "ETF Europe",        profil_min: "prudent" },
    { symbol: "EWLD.PA",  nom: "iShares MSCI World Swap PEA", type: "ETF",    secteur: "ETF Monde",         profil_min: "prudent" },
    // Blue chips solides → équilibré+
    { symbol: "AI.PA",    nom: "Air Liquide",                 type: "Action", secteur: "Industrie",         profil_min: "equilibre" },
    { symbol: "MC.PA",    nom: "LVMH",                        type: "Action", secteur: "Luxe",              profil_min: "equilibre" },
    { symbol: "TTE.PA",   nom: "TotalEnergies",               type: "Action", secteur: "Énergie",           profil_min: "equilibre" },
    { symbol: "SAN.PA",   nom: "Sanofi",                      type: "Action", secteur: "Santé",             profil_min: "equilibre" },
    { symbol: "OR.PA",    nom: "L'Oréal",                     type: "Action", secteur: "Cosmétiques",       profil_min: "equilibre" },
    { symbol: "BNP.PA",   nom: "BNP Paribas",                 type: "Action", secteur: "Banque",            profil_min: "equilibre" },
    { symbol: "AXA.PA",   nom: "AXA",                         type: "Action", secteur: "Assurance",         profil_min: "equilibre" },
    { symbol: "SU.PA",    nom: "Schneider Electric",          type: "Action", secteur: "Industrie",         profil_min: "equilibre" },
    { symbol: "EL.PA",    nom: "EssilorLuxottica",            type: "Action", secteur: "Santé",             profil_min: "equilibre" },
    { symbol: "ASML.AS",  nom: "ASML Holding",                type: "Action", secteur: "Semi-conducteurs",  profil_min: "equilibre" },
    { symbol: "SAP.DE",   nom: "SAP",                         type: "Action", secteur: "Tech",              profil_min: "equilibre" },
    { symbol: "SIE.DE",   nom: "Siemens",                     type: "Action", secteur: "Industrie",         profil_min: "equilibre" },
    // Actions plus volatiles → dynamique+
    { symbol: "CAP.PA",   nom: "Capgemini",                   type: "Action", secteur: "Tech",              profil_min: "dynamique" },
    { symbol: "DSY.PA",   nom: "Dassault Systèmes",           type: "Action", secteur: "Tech",              profil_min: "dynamique" },
    { symbol: "STM.PA",   nom: "STMicroelectronics",          type: "Action", secteur: "Semi-conducteurs",  profil_min: "dynamique" },
    { symbol: "SAF.PA",   nom: "Safran",                      type: "Action", secteur: "Aéronautique",      profil_min: "dynamique" },
    { symbol: "AIR.PA",   nom: "Airbus",                      type: "Action", secteur: "Aéronautique",      profil_min: "dynamique" },
    { symbol: "RMS.PA",   nom: "Hermès",                      type: "Action", secteur: "Luxe",              profil_min: "dynamique" },
    { symbol: "GLE.PA",   nom: "Société Générale",            type: "Action", secteur: "Banque",            profil_min: "dynamique" },
    { symbol: "DG.PA",    nom: "Vinci",                       type: "Action", secteur: "Infrastructure",    profil_min: "dynamique" },
    { symbol: "LR.PA",    nom: "Legrand",                     type: "Action", secteur: "Industrie",         profil_min: "dynamique" },
    { symbol: "MT.AS",    nom: "ArcelorMittal",               type: "Action", secteur: "Métaux",            profil_min: "dynamique" },
    { symbol: "IFX.DE",   nom: "Infineon Technologies",       type: "Action", secteur: "Semi-conducteurs",  profil_min: "dynamique" },
    { symbol: "UCB.BR",   nom: "UCB Pharma",                  type: "Action", secteur: "Biotech",           profil_min: "dynamique" },
    // Actions haute volatilité / croissance → très dynamique
    { symbol: "SOI.PA",   nom: "Soitec",                      type: "Action", secteur: "Semi-conducteurs",  profil_min: "tres-dynamique" },
    { symbol: "OVH.PA",   nom: "OVHcloud",                    type: "Action", secteur: "Cloud",             profil_min: "tres-dynamique" },
    { symbol: "ALO.PA",   nom: "Alstom",                      type: "Action", secteur: "Transports",        profil_min: "tres-dynamique" },
    { symbol: "HO.PA",    nom: "Thales",                      type: "Action", secteur: "Défense",           profil_min: "tres-dynamique" },
    { symbol: "AM.PA",    nom: "Dassault Aviation",           type: "Action", secteur: "Défense",           profil_min: "tres-dynamique" },
    { symbol: "ERF.PA",   nom: "Eurofins Scientific",         type: "Action", secteur: "Biotech",           profil_min: "tres-dynamique" },
    { symbol: "BIOR.PA",  nom: "BioMérieux",                  type: "Action", secteur: "Biotech",           profil_min: "tres-dynamique" },
    { symbol: "MELE.PA",  nom: "Melexis",                     type: "Action", secteur: "Semi-conducteurs",  profil_min: "tres-dynamique" },
    { symbol: "RNO.PA",   nom: "Renault",                     type: "Action", secteur: "Automobile",        profil_min: "tres-dynamique" },
    { symbol: "STLA.PA",  nom: "Stellantis",                  type: "Action", secteur: "Automobile",        profil_min: "tres-dynamique" },
    { symbol: "PUB.PA",   nom: "Publicis",                    type: "Action", secteur: "Médias/IA",         profil_min: "tres-dynamique" },
    { symbol: "KER.PA",   nom: "Kering",                      type: "Action", secteur: "Luxe",              profil_min: "tres-dynamique" },
    { symbol: "ENGI.PA",  nom: "Engie",                       type: "Action", secteur: "Énergie",           profil_min: "tres-dynamique" },
    // Small caps PEA — très dynamique uniquement
    { symbol: "ALWLX.PA", nom: "Wallix Group",                type: "Action", secteur: "Cybersécurité FR",   profil_min: "tres-dynamique" },
    { symbol: "ALESK.PA", nom: "Esker",                       type: "Action", secteur: "SaaS B2B",           profil_min: "tres-dynamique" },
    { symbol: "BLV.PA",   nom: "Believe",                     type: "Action", secteur: "Musique numérique",  profil_min: "tres-dynamique" },
    { symbol: "SWP.PA",   nom: "Sword Group",                 type: "Action", secteur: "IT Services",        profil_min: "tres-dynamique" },
    { symbol: "ALHAF.PA", nom: "Haffner Energy",              type: "Action", secteur: "Hydrogène vert",     profil_min: "tres-dynamique" },
    { symbol: "ALXFR.PA", nom: "Crossject",                   type: "Action", secteur: "Pharma/Défense",     profil_min: "tres-dynamique" },
    { symbol: "ALDRV.PA", nom: "Drone Volt",                  type: "Action", secteur: "Drones",             profil_min: "tres-dynamique" },
    { symbol: "ALNSE.PA", nom: "Nanobiotix",                  type: "Action", secteur: "Biotech nano",       profil_min: "tres-dynamique" },
    { symbol: "ALSGD.PA", nom: "Sogeclair",                   type: "Action", secteur: "Ingénierie aéro",    profil_min: "tres-dynamique" },
    { symbol: "VIRP.PA",  nom: "Virbac",                      type: "Action", secteur: "Santé animale",      profil_min: "tres-dynamique" },
    { symbol: "ALDBL.PA", nom: "DBT",                         type: "Action", secteur: "Recharge EV",        profil_min: "tres-dynamique" },
    { symbol: "ALPCV.PA", nom: "Piscines Castorama",          type: "Action", secteur: "Niche loisir",       profil_min: "tres-dynamique" },
    { symbol: "IFX.DE",   nom: "Infineon",                    type: "Action", secteur: "Semi-conducteurs",   profil_min: "dynamique" },
    { symbol: "FNAC.PA",  nom: "Fnac Darty",                  type: "Action", secteur: "Retail tech",        profil_min: "tres-dynamique" },
  ],
  CTO: [
    // ETFs → tous profils
    { symbol: "IWDA.AS",  nom: "iShares Core MSCI World",     type: "ETF",    secteur: "ETF Monde",         profil_min: "prudent" },
    { symbol: "VWRA.L",   nom: "Vanguard FTSE All-World",     type: "ETF",    secteur: "ETF Monde",         profil_min: "prudent" },
    { symbol: "SPY",      nom: "SPDR S&P 500 ETF",            type: "ETF",    secteur: "ETF USA",           profil_min: "prudent" },
    { symbol: "QQQ",      nom: "Invesco Nasdaq-100",          type: "ETF",    secteur: "ETF Tech",          profil_min: "prudent" },
    { symbol: "VTI",      nom: "Vanguard Total Stock Market", type: "ETF",    secteur: "ETF USA",           profil_min: "prudent" },
    // Blue chips → équilibré+
    { symbol: "AAPL",     nom: "Apple",                       type: "Action", secteur: "Tech",              profil_min: "equilibre" },
    { symbol: "MSFT",     nom: "Microsoft",                   type: "Action", secteur: "Tech",              profil_min: "equilibre" },
    { symbol: "GOOGL",    nom: "Alphabet",                    type: "Action", secteur: "Tech",              profil_min: "equilibre" },
    { symbol: "AMZN",     nom: "Amazon",                      type: "Action", secteur: "E-commerce",        profil_min: "equilibre" },
    { symbol: "BRK-B",    nom: "Berkshire Hathaway B",        type: "Action", secteur: "Financier",         profil_min: "equilibre" },
    { symbol: "JNJ",      nom: "Johnson & Johnson",           type: "Action", secteur: "Santé",             profil_min: "equilibre" },
    { symbol: "V",        nom: "Visa",                        type: "Action", secteur: "Financier",         profil_min: "equilibre" },
    { symbol: "JPM",      nom: "JPMorgan Chase",              type: "Action", secteur: "Banque",            profil_min: "equilibre" },
    // Croissance → dynamique+
    { symbol: "NVDA",     nom: "NVIDIA",                      type: "Action", secteur: "Semi-conducteurs/IA",profil_min: "dynamique" },
    { symbol: "META",     nom: "Meta Platforms",              type: "Action", secteur: "Tech/IA",           profil_min: "dynamique" },
    { symbol: "TSLA",     nom: "Tesla",                       type: "Action", secteur: "Automobile",        profil_min: "dynamique" },
    { symbol: "TSM",      nom: "TSMC",                        type: "Action", secteur: "Semi-conducteurs",  profil_min: "dynamique" },
    { symbol: "NOVO-B.CO",nom: "Novo Nordisk",                type: "Action", secteur: "Biotech",           profil_min: "dynamique" },
    { symbol: "AMD",      nom: "Advanced Micro Devices",      type: "Action", secteur: "Semi-conducteurs",  profil_min: "dynamique" },
    { symbol: "AVGO",     nom: "Broadcom",                    type: "Action", secteur: "Semi-conducteurs",  profil_min: "dynamique" },
    { symbol: "XOM",      nom: "ExxonMobil",                  type: "Action", secteur: "Énergie",           profil_min: "dynamique" },
    // Haute volatilité / growth → très dynamique
    { symbol: "PLTR",     nom: "Palantir Technologies",       type: "Action", secteur: "IA/Data",           profil_min: "tres-dynamique" },
    { symbol: "CRWD",     nom: "CrowdStrike",                 type: "Action", secteur: "Cybersécurité",     profil_min: "tres-dynamique" },
    { symbol: "SHOP",     nom: "Shopify",                     type: "Action", secteur: "E-commerce",        profil_min: "tres-dynamique" },
    { symbol: "COIN",     nom: "Coinbase",                    type: "Action", secteur: "Crypto/Finance",    profil_min: "tres-dynamique" },
    { symbol: "MELI",     nom: "MercadoLibre",                type: "Action", secteur: "E-commerce EM",     profil_min: "tres-dynamique" },
    { symbol: "SMCI",     nom: "Super Micro Computer",        type: "Action", secteur: "Serveurs IA",       profil_min: "tres-dynamique" },
    { symbol: "ARM",      nom: "Arm Holdings",                type: "Action", secteur: "Semi-conducteurs",  profil_min: "tres-dynamique" },
    { symbol: "SQ",       nom: "Block (Square)",              type: "Action", secteur: "Fintech",           profil_min: "tres-dynamique" },
    { symbol: "RKLB",     nom: "Rocket Lab",                  type: "Action", secteur: "Espace",            profil_min: "tres-dynamique" },
    { symbol: "IONQ",     nom: "IonQ",                        type: "Action", secteur: "Quantique",         profil_min: "tres-dynamique" },
    // Small/mid caps US — niches à fort potentiel
    { symbol: "APP",      nom: "AppLovin",                    type: "Action", secteur: "AdTech/IA",          profil_min: "tres-dynamique" },
    { symbol: "AXON",     nom: "Axon Enterprise",             type: "Action", secteur: "Sécurité publique",  profil_min: "tres-dynamique" },
    { symbol: "DUOL",     nom: "Duolingo",                    type: "Action", secteur: "EdTech",             profil_min: "tres-dynamique" },
    { symbol: "MNDY",     nom: "Monday.com",                  type: "Action", secteur: "SaaS productivité",  profil_min: "tres-dynamique" },
    { symbol: "CELH",     nom: "Celsius Holdings",            type: "Action", secteur: "Boissons santé",     profil_min: "tres-dynamique" },
    { symbol: "RXRX",     nom: "Recursion Pharma",            type: "Action", secteur: "IA / Drug discovery",profil_min: "tres-dynamique" },
    { symbol: "LUNR",     nom: "Intuitive Machines",          type: "Action", secteur: "Espace / Lune",      profil_min: "tres-dynamique" },
    { symbol: "ACHR",     nom: "Archer Aviation",             type: "Action", secteur: "eVTOL / Air taxi",   profil_min: "tres-dynamique" },
    { symbol: "JOBY",     nom: "Joby Aviation",               type: "Action", secteur: "eVTOL / Air taxi",   profil_min: "tres-dynamique" },
    { symbol: "HIMS",     nom: "Hims & Hers Health",          type: "Action", secteur: "Santé numérique",    profil_min: "tres-dynamique" },
    { symbol: "SOUN",     nom: "SoundHound AI",               type: "Action", secteur: "IA vocale",          profil_min: "tres-dynamique" },
    { symbol: "ALAB",     nom: "Astera Labs",                 type: "Action", secteur: "Semi / IA infra",    profil_min: "tres-dynamique" },
    { symbol: "CAVA",     nom: "CAVA Group",                  type: "Action", secteur: "Restauration niche", profil_min: "tres-dynamique" },
  ],
};

async function fetchYahooPrices(symbols) {
  const endpoint = process.env.NODE_ENV === "production" ? "/api/yahoo" : "/api/yahoo";
  const res = await fetch(`${endpoint}?symbols=${encodeURIComponent(symbols.join(","))}`);
  if (!res.ok) throw new Error(`Yahoo Finance: ${res.status}`);
  const data = await res.json();
  return data?.quoteResponse?.result || [];
}

// ─── Autopilot IA ─────────────────────────────────────────────────────────────
function AutopilotIA({ account, profil, hidden }) {
  const positions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === (account || "PEA"));
  const [running, setRunning]   = useState(false);
  const [step, setStep]         = useState("");
  const [expanded, setExpanded] = useState({});
  const [result, setResult]     = useState(() => {
    const r = load("bourse_autopilot_last", null);
    // Validate structure — discard corrupted cached results
    if (!r || !Array.isArray(r.opportunites)) return null;
    return r;
  });
  const [error, setError]       = useState(null);
  const blurStyle = hidden ? { filter: "blur(6px)", userSelect: "none" } : {};

  const risque = profil?.risque || "equilibre";
  const profilRank = PROFIL_RANK[risque] ?? 1;
  const universe = (() => {
    const all = account === "CTO"
      ? [...AUTOPILOT_UNIVERSE.PEA, ...AUTOPILOT_UNIVERSE.CTO]
      : AUTOPILOT_UNIVERSE.PEA;
    return all.filter(i => (PROFIL_RANK[i.profil_min || "prudent"] ?? 0) <= profilRank);
  })();

  const runAnalysis = async () => {
    setRunning(true); setError(null);
    try {
      setStep("Recherche des cours et analyse du marché…");

      const dcaMensuel = profil?.dcaMensuel || 200;
      const portfolioCtx = positions.length > 0
        ? positions.map(p => {
            const pvPct = p.pru > 0 ? (((p.dernierCours || p.pru) - p.pru) / p.pru * 100).toFixed(1) : "0";
            return `• ${p.nom} (${p.isin}) — ${p.quantite} titres @ PRU ${p.pru}€ — PV: ${pvPct}%`;
          }).join("\n")
        : "Portefeuille vide";

      // Sélection de 20 instruments max : priorité aux instruments du niveau du profil
      const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
      const tierExact  = universe.filter(i => i.profil_min === risque);
      const tierLower  = universe.filter(i => i.profil_min !== risque);
      // Pour profils dynamiques : priorité aux instruments du niveau exact (small caps, growth)
      const primary   = shuffle(tierExact).slice(0, 14);
      const secondary = shuffle(tierLower).slice(0, 20 - primary.length);
      const universeSlice = [...primary, ...secondary];
      const universeList = universeSlice.map(i => `${i.symbol} (${i.nom}, ${i.secteur})`).join(", ");

      const profilLabel = { prudent: "Prudent", equilibre: "Équilibré", dynamique: "Dynamique", "tres-dynamique": "Très dynamique" }[risque] || risque;
      const focusInstr = risque === "prudent"
        ? "UNIQUEMENT des ETF diversifiés. Aucune action individuelle."
        : risque === "equilibre"
        ? "Un mix d'ETF large (60%) et d'actions blue chip solides (40%)."
        : risque === "dynamique"
        ? "Principalement des actions individuelles avec fort potentiel (70%), max 1 ETF sectoriel. Pas d'ETF généralistes."
        : "EXCLUSIVEMENT des actions individuelles à fort potentiel de croissance ou momentum. Zéro ETF. Privilégie les valeurs technologiques, semi-conducteurs, défense, IA, biotech — les plus dynamiques de l'univers.";

      const system = `Tu es un gérant de portefeuille expert spécialisé ${account} français. Aujourd'hui : ${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.
Tu as accès à la recherche web pour obtenir les cours en temps réel.
PROFIL INVESTISSEUR : ${profilLabel} | DCA MENSUEL : ${dcaMensuel}€ | ORDRE MINIMUM : 200€ | COURTIER : ${profil?.courtier || "boursobank"} | HORIZON : ${profil?.horizon || "moyen terme"}
RÈGLE ABSOLUE POUR CE PROFIL : ${focusInstr}
PORTEFEUILLE ACTUEL :
${portfolioCtx}`;

      const userMsg = `Utilise web_search pour récupérer les cours actuels des instruments les plus pertinents parmi cet univers ${account} adapté au profil ${profilLabel} :
${universeList}

Effectue 2 à 3 recherches ciblées sur les instruments les plus prometteurs compte tenu du profil ${profilLabel} (prix, variation du jour, momentum, catalyseurs récents, plus haut/bas 52 semaines).

Identifie les 3 MEILLEURES OPPORTUNITÉS D'ACHAT IMMÉDIATES pour le profil ${profilLabel}.
RÈGLE STRICTE : n'inclure dans "opportunites" QUE les instruments qui méritent d'être achetés ou renforcés MAINTENANT. Le champ "action" doit être ACHETER ou RENFORCER uniquement. Si un instrument est intéressant à long terme mais pas au bon point d'entrée aujourd'hui → ne pas l'inclure du tout.
${risque === "dynamique" || risque === "tres-dynamique" ? "PRIORITÉ AUX ACTIONS INDIVIDUELLES avec catalyseur clair (résultats, contrat, secteur en hausse, momentum technique)." : ""}

Réponds UNIQUEMENT en JSON valide, sans texte avant ou après :
{
  "resume": "Contexte marché et orientation pour profil ${profilLabel} en 2-3 phrases",
  "score_marche": 7,
  "opportunites": [
    {
      "symbol": "AIR.PA",
      "nom": "Airbus",
      "type": "Action",
      "secteur": "Aéronautique",
      "action": "ACHETER",  // UNIQUEMENT : ACHETER ou RENFORCER — jamais SURVEILLER, ÉVITER, ACCUMULER, CONSERVER
      "prix": 165.50,
      "var_jour": 1.2,
      "dist_bas52": 12.5,
      "rationale": "1-2 phrases max sur le catalyseur précis.",
      "catalyseur": "5 mots max",
      "risque": "Modéré",
      "horizon": "Moyen terme",
      "isin": "NL0010273215",
      "allocation_pct": 15,
      "montant_suggere": 1229,
      "dans_portefeuille": false
    }
  ],
  "alertes_portefeuille": [{"titre": "Nom position", "alerte": "Description courte du risque ou signal.", "action": "SURVEILLER"}],
  "prochaine_revision": "Dans 7 jours"
}

RÈGLE ACTION : utilise UNIQUEMENT ces 5 valeurs pour le champ "action" : ACHETER (opportunité immédiate), RENFORCER (position existante à étoffer), SURVEILLER (intéressant mais attendre un meilleur point d'entrée), ALLÉGER (prendre des profits), ÉVITER (conditions défavorables). Interdit : ACCUMULER, CONSERVER, HOLD, BUY ou tout autre libellé.
RÈGLE MONTANT : montant_suggere = nombre_entier_de_titres × prix_unitaire. Si prix > ${dcaMensuel}€ : montant = 1 titre = prix. Si prix ≤ ${dcaMensuel}€ : montant = floor(${dcaMensuel}/prix) × prix. Jamais en dessous du prix d'un titre.`;

      const parsed = await callClaude(system, userMsg, true, 2, true, 3000, CLAUDE_MODELS.fast);
      if (!parsed || typeof parsed !== "object") throw new Error("Réponse IA non structurée.");
      const final = { ...parsed, generatedAt: new Date().toISOString(), enrichedCount: universe.length };
      setResult(final);
      save("bourse_autopilot_last", final);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false); setStep("");
    }
  };

  const scoreColor = s => s >= 7 ? C.green : s >= 5 ? "#C8972A" : C.red;
  const riskColor  = r => r === "Faible" ? C.green : r === "Modéré" ? "#C8972A" : C.red;
  const ACTION_META = {
    "ACHETER":    { color: C.green,   label: "Acheter maintenant" },
    "RENFORCER":  { color: C.green,   label: "Renforcer la position" },
    "SURVEILLER": { color: "#6366F1", label: "Surveiller — attendre un meilleur point d'entrée" },
    "ALLÉGER":    { color: "#C8972A", label: "Alléger — prendre des profits partiels" },
    "ÉVITER":     { color: C.red,     label: "Éviter — conditions défavorables" },
  };
  const actionColor = a => {
    const key = Object.keys(ACTION_META).find(k => a?.toUpperCase().includes(k)) || "";
    return ACTION_META[key]?.color || "#6366F1";
  };

  return (
    <div style={{ maxWidth: "780px", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg,#1a237e,#283593)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em" }}>AI</span>
            </div>
            <div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>Autopilot IA</div>
              <div style={{ fontSize: "11px", color: C.inkSubtle }}>Scan {account} · {universe.length} instruments · Profil {({ prudent: "Prudent", equilibre: "Équilibré", dynamique: "Dynamique", "tres-dynamique": "Très dynamique" })[risque] || risque}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
          <button onClick={() => { if (window.confirm("Cette analyse consomme environ 0,15 à 0,25 $ de crédits API (recherches web + IA).\n\nConseil : lancez-la 1 à 2 fois par semaine maximum, les opportunités n'évoluent pas en quelques heures.\n\nConfirmer le lancement ?")) runAnalysis(); }} disabled={running}
            style={{ padding: "10px 20px", borderRadius: "12px", background: running ? C.inkSubtle : "linear-gradient(135deg,#1a237e,#283593)", color: "#fff", border: "none", fontSize: "13px", fontWeight: "700", cursor: running ? "not-allowed" : "pointer", fontFamily: "Inter,sans-serif", display: "flex", alignItems: "center", gap: "8px" }}>
            {running ? "⟳ Analyse en cours…" : "⚡ Lancer l'analyse"}
          </button>
          {result?.generatedAt && <span style={{ fontSize: "10px", color: C.inkSubtle }}>Dernière analyse : {new Date(result.generatedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
      </div>

      {/* ── Bandeau coût API ── */}
      <div style={{ background: "rgba(200,151,42,0.07)", border: "1px solid rgba(200,151,42,0.25)", borderRadius: "12px", padding: "10px 16px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{ fontSize: "14px", flexShrink: 0, marginTop: "1px" }}>💡</span>
        <div style={{ fontSize: "11px", color: "#7A5A10", lineHeight: 1.6 }}>
          <strong>Consommation API élevée</strong> — chaque analyse coûte ~0,15–0,25 $ en crédits Anthropic (recherches web en temps réel).<br />
          Conseil : lancez l'Autopilot <strong>1 à 2 fois par semaine</strong> maximum. Les opportunités de marché n'évoluent pas en quelques heures.
        </div>
      </div>

      {/* ── Étape en cours ── */}
      {running && step && (
        <div style={{ background: C.navyLight, border: `1px solid rgba(30,58,95,0.15)`, borderRadius: "14px", padding: "16px 20px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "20px", height: "20px", border: `3px solid ${C.navy}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.9s linear infinite", flexShrink: 0 }} />
          <span style={{ fontSize: "13px", fontWeight: "600", color: C.navy }}>{step}</span>
        </div>
      )}

      {/* ── Erreur ── */}
      {error && !result && (
        <div style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "14px", padding: "14px 18px", marginBottom: "16px", color: C.red, fontSize: "13px", fontWeight: "600" }}>
          ⚠ {error}
        </div>
      )}
      {error && result && (
        <div style={{ background: C.snowOff, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 14px", marginBottom: "12px", fontSize: "11px", color: C.inkSubtle, display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "#C8972A" }}>⚠</span>
          Nouvelle analyse échouée — résultats précédents affichés. Relancez l'analyse.
        </div>
      )}

      {/* ── Résultat ── */}
      {result && !running && (
        <>
          {/* Score + résumé compact */}
          <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 20px", marginBottom: "12px", boxShadow: shadow.card, display: "flex", gap: "16px", alignItems: "flex-start" }}>
            {result.score_marche != null && (
              <div style={{ flexShrink: 0, width: "52px", height: "52px", borderRadius: "14px", background: scoreColor(result.score_marche) + "18", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "20px", fontWeight: "800", color: scoreColor(result.score_marche), lineHeight: 1 }}>{result.score_marche}</span>
                <span style={{ fontSize: "8px", color: C.inkSubtle, fontWeight: "600" }}>/10</span>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Contexte marché</div>
              <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{result.resume}</div>
            </div>
          </div>

          {/* Alertes portefeuille */}
          {result.alertes_portefeuille?.length > 0 && (
            <div style={{ background: "rgba(200,151,42,0.06)", border: "1px solid rgba(200,151,42,0.25)", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "#966F1A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "2px" }}>Alertes portefeuille</div>
              {result.alertes_portefeuille.map((a, i) => {
                if (typeof a === "string") {
                  return (
                    <div key={i} style={{ fontSize: "12px", color: "#7A5A10", lineHeight: 1.5, display: "flex", gap: "8px" }}>
                      <span style={{ flexShrink: 0 }}>▸</span><span>{a}</span>
                    </div>
                  );
                }
                const titre  = a?.titre  || a?.nom    || "";
                const alerte = a?.alerte || a?.message || a?.detail || "";
                const action = a?.action || "";
                const actionCol = action === "ÉVITER" ? C.red : action === "SURVEILLER" ? "#6366F1" : action === "RÉÉQUILIBRER" ? C.navy : "#966F1A";
                return (
                  <div key={i} style={{ borderLeft: "3px solid rgba(200,151,42,0.4)", paddingLeft: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                      {titre && <span style={{ fontSize: "11px", fontWeight: "700", color: "#7A5A10" }}>{titre}</span>}
                      {action && <span style={{ fontSize: "9px", fontWeight: "700", color: "#fff", background: actionCol, borderRadius: "4px", padding: "1px 6px" }}>{action}</span>}
                    </div>
                    {alerte && <div style={{ fontSize: "11px", color: "#966F1A", lineHeight: 1.5 }}>{alerte}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Opportunités */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.8px" }}>
              Opportunités à saisir · {(result.opportunites || []).filter(o => ["ACHETER","RENFORCER"].includes((o.action||"").toUpperCase())).length}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <span style={{ fontSize: "9px", fontWeight: "700", color: C.green, background: C.green + "18", borderRadius: "4px", padding: "2px 7px" }}>ACHETER</span>
              <span style={{ fontSize: "9px", fontWeight: "700", color: C.green, background: C.green + "18", borderRadius: "4px", padding: "2px 7px" }}>RENFORCER</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(result.opportunites || []).filter(op => ["ACHETER","RENFORCER"].includes((op.action||"").toUpperCase())).map((op, i) => {
              const ac = op.action || "";
              const acShort = ac.length > 12 ? ac.split(/[\s/]/)[0] : ac;
              const acColor = actionColor(ac);
              const isExpanded = expanded[i];
              const dcaMensuel = profil?.dcaMensuel || 200;
              const prix = op.prix || 0;
              // Nombre de titres entiers achetables avec le budget cible (min 1)
              const budgetCible = Math.max(dcaMensuel, 200);
              const nbTitres = prix > 0 ? Math.max(1, Math.floor(budgetCible / prix)) : 1;
              const montant = op.montant_suggere && op.montant_suggere >= prix && op.montant_suggere > 0
                ? op.montant_suggere
                : prix > 0 ? nbTitres * prix : budgetCible;
              const catalyseurDisplay = op.catalyseur && op.catalyseur.length > 55 ? op.catalyseur.slice(0, 52) + "…" : op.catalyseur;
              return (
                <div key={i} style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", overflow: "hidden", boxShadow: shadow.card, ...blurStyle }}>
                  {/* Barre top colorée */}
                  <div style={{ height: "3px", background: acColor }} />
                  <div style={{ padding: "14px 16px" }}>
                    {/* Ligne 1 : nom + badge action + prix */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "3px" }}>
                          <span style={{ fontSize: "13px", fontWeight: "800", color: C.ink }}>{op.nom}</span>
                          <span style={{ fontSize: "10px", color: C.inkSubtle, background: C.snowOff, borderRadius: "4px", padding: "1px 5px", fontWeight: "600" }}>{op.symbol}</span>
                          {op.isin && <span style={{ fontSize: "10px", color: C.inkSubtle, fontFamily: "monospace" }}>{op.isin}</span>}
                          <span style={{ fontSize: "10px", color: C.inkSubtle }}>{op.secteur}</span>
                          {op.dans_portefeuille && <span style={{ fontSize: "9px", fontWeight: "700", color: C.navy, background: C.navyLight, borderRadius: "4px", padding: "1px 6px" }}>En portefeuille</span>}
                          {/* Liens externes */}
                          <a href={`https://fr.finance.yahoo.com/quote/${encodeURIComponent(op.symbol)}`} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: "9px", fontWeight: "700", color: "#fff", background: "#5F01D1", borderRadius: "4px", padding: "2px 6px", textDecoration: "none", flexShrink: 0 }}>Yahoo</a>
                          {op.isin && /\.(PA|AS|BR|AM|DE|LS|MC)$/.test(op.symbol || "") && (
                            <a href={getEuronextUrl(op.isin, op.nom)} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: "9px", fontWeight: "700", color: "#fff", background: "#003087", borderRadius: "4px", padding: "2px 6px", textDecoration: "none", flexShrink: 0 }}>Euronext</a>
                          )}
                        </div>
                        {catalyseurDisplay && <div style={{ fontSize: "11px", fontWeight: "600", color: "#966F1A", background: "rgba(200,151,42,0.1)", borderRadius: "5px", padding: "2px 8px", display: "inline-block" }}>⚡ {catalyseurDisplay}</div>}
                      </div>
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "800", color: "#fff", background: acColor, borderRadius: "6px", padding: "3px 10px", whiteSpace: "nowrap" }}>{acShort}</span>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: C.ink }}>{op.prix ? fmtEur(op.prix) : "—"}</span>
                        {op.var_jour != null && <span style={{ fontSize: "11px", color: op.var_jour >= 0 ? C.green : C.red, fontWeight: "600" }}>{op.var_jour >= 0 ? "+" : ""}{op.var_jour}% auj.</span>}
                      </div>
                    </div>
                    {/* Rationale — 2 lignes max, expandable */}
                    <div
                      style={{ fontSize: "12px", color: C.inkMuted, lineHeight: 1.55, marginBottom: "6px",
                        ...(!isExpanded ? { overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } : {}) }}
                    >{op.rationale}</div>
                    <button onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                      style={{ fontSize: "11px", color: C.inkSubtle, background: "none", border: "none", padding: "0 0 8px", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                      {isExpanded ? "▲ Réduire" : "▼ Lire plus"}
                    </button>
                    {/* Métriques */}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: "10px" }}>
                      {[
                        { label: "Risque",    val: op.risque,   color: riskColor(op.risque) },
                        { label: "Horizon",   val: op.horizon,  color: C.inkMuted },
                        { label: "Montant",   val: `${fmtEur(montant)} · ${nbTitres} titre${nbTitres > 1 ? "s" : ""}`, color: C.ink },
                        { label: "Δ bas 52s", val: op.dist_bas52 != null ? `+${op.dist_bas52}%` : "—", color: (op.dist_bas52 || 0) < 10 ? C.green : C.inkSubtle },
                      ].map(m => (
                        <div key={m.label} style={{ background: C.snowOff, borderRadius: "6px", padding: "4px 10px" }}>
                          <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "600", textTransform: "uppercase" }}>{m.label}</div>
                          <div style={{ fontSize: "12px", fontWeight: "700", color: m.color }}>{m.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {result.prochaine_revision && (
            <div style={{ marginTop: "12px", textAlign: "center", fontSize: "11px", color: C.inkSubtle }}>
              Prochaine révision : {result.prochaine_revision} · {result.enrichedCount} instruments scannés
            </div>
          )}
        </>
      )}

      {/* ── État vide ── */}
      {!result && !running && !error && (
        <div style={{ textAlign: "center", padding: "60px 20px", background: C.snow, border: `1px solid ${C.border}`, borderRadius: "20px", boxShadow: shadow.card }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "linear-gradient(135deg,#1a237e,#283593)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <span style={{ fontSize: "16px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em" }}>AI</span>
        </div>
          <div style={{ fontSize: "16px", fontWeight: "700", color: C.ink, marginBottom: "8px" }}>Prêt à scanner le marché</div>
          <div style={{ fontSize: "13px", color: C.inkSubtle, marginBottom: "20px", maxWidth: "360px", margin: "0 auto 20px" }}>
            L'agent scanne {universe.length} instruments {account} adaptés à votre profil {({ prudent: "Prudent", equilibre: "Équilibré", dynamique: "Dynamique", "tres-dynamique": "Très dynamique" })[risque]} et identifie les meilleures opportunités en temps réel.
          </div>
          <button onClick={() => { if (window.confirm("Cette analyse consomme environ 0,15 à 0,25 $ de crédits API.\n\nConseil : 1 à 2 fois par semaine maximum.\n\nConfirmer ?")) runAnalysis(); }}
            style={{ padding: "12px 28px", borderRadius: "12px", background: "linear-gradient(135deg,#1a237e,#283593)", color: "#fff", border: "none", fontSize: "14px", fontWeight: "700", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
            ⚡ Lancer l'analyse
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  { items: [{ key: TABS.PORTFOLIO, label: "Positions", icon: <IconPositions/> }] },
  { label: "PORTEFEUILLE", items: [
    { key: TABS.HISTORIQUE, label: "Répartition",  icon: <IconPie/> },
    { key: TABS.OPERATIONS, label: "Transactions", icon: <IconSwap/> },
  ]},
  { label: "MARCHÉS", items: [
    { key: TABS.MARCHE,     label: "Signaux IA",  icon: <IconTrending/> },
    { key: TABS.DCA,        label: "Plan DCA",    icon: <IconTarget/> },
    { key: TABS.PROJECTION, label: "Projection",  icon: <IconWave/> },
  ]},
  { label: "COMPTE", items: [
    { key: TABS.PROFIL,   label: "Profil investisseur", icon: <IconUser/> },
    { key: TABS.SETTINGS, label: "Paramètres",          icon: <IconGear/> },
  ]},
  { label: "IA", featured: true, items: [
    { key: TABS.CHAT,      label: "Conseiller Privé", icon: <IconChat/> },
    { key: TABS.AUTOPILOT, label: "Autopilot IA",     icon: <IconChat/> },
  ]},
];

function SidebarContent({ active, onChange, portfolioVersion, refreshAll, refreshing, toggleDark, toggleCompact, darkMode, compact, hidden, collapsed, toggleCollapse, onClose, account, onSwitchAccount, mobileCompact = false }) {
  const isMobile = useIsMobile();
  const allPositions = sanitizePositions(load("bourse_portfolio", []));
  const positions    = allPositions.filter(p => (p.compte || "PEA") === (account || "PEA"));
  const totalActuel  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const pv    = totalActuel - totalInvesti;
  const pvPct = totalInvesti > 0 ? (pv / totalInvesti) * 100 : 0;
  const c = mobileCompact ? true : (isMobile ? false : collapsed); // icon-only sur mobile compact

  const handleNav = (key) => { onChange(key); if (onClose) onClose(); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.sb }}>
      {/* Logo — version compacte mobile */}
      {mobileCompact && (
        <div style={{ padding: "12px 0 10px", borderBottom: `1px solid ${C.sbBorder}`, display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <AppLogo size={26} />
        </div>
      )}
      {/* Logo */}
      {!mobileCompact && <div className="ba-sidebar-logo" style={{ padding: "18px 14px 16px", borderBottom: `1px solid ${C.sbBorder}`, display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, justifyContent: c ? "center" : "flex-start" }}>
        {isMobile
          ? <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
              <AppLogo size={30} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>Bourse Analyzer</div>
              </div>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "18px", color: C.inkMuted, cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}>✕</button>
            </div>
          : <>
              <div onClick={toggleCollapse} title={c ? "Déplier" : "Réduire"} style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", borderRadius: "10px", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = C.sbHover}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <AppLogo size={26} />
              </div>
              {!c && <div>
                <div style={{ fontSize: "13px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>Bourse Analyzer</div>
              </div>}
            </>
        }
      </div>}

      {/* Switcher PEA / CTO */}
      {onSwitchAccount && (
        <div style={{ padding: (c || mobileCompact) ? "10px 8px" : "10px 12px", borderBottom: `1px solid ${C.sbBorder}`, flexShrink: 0 }}>
          {c ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
              {["PEA","CTO"].map(acc => (
                <button key={acc} onClick={() => onSwitchAccount(acc)} title={acc}
                  style={{ width: "36px", height: "26px", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "9px", fontWeight: "800", fontFamily: "Inter,sans-serif", background: account === acc ? "linear-gradient(135deg, #080B0F 0%, #142641 40%, #1E3A5F 75%, #2D5986 100%)" : C.sbHover, color: account === acc ? "#fff" : C.sbText, boxShadow: account === acc ? "0 3px 10px rgba(30,58,95,0.40)" : "none" }}>
                  {acc}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
              {["PEA","CTO"].map(acc => (
                <button key={acc} onClick={() => onSwitchAccount(acc)}
                  style={{ flex: 1, height: "28px", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: "700", fontFamily: "Inter,sans-serif", transition: "all 0.18s", background: account === acc ? "linear-gradient(135deg, #080B0F 0%, #142641 40%, #1E3A5F 75%, #2D5986 100%)" : "transparent", color: account === acc ? "#fff" : C.sbText, boxShadow: account === acc ? "0 3px 10px rgba(30,58,95,0.40)" : "none" }}>
                  {acc}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="ba-sidebar-nav" style={{ flex: 1, overflowY: "auto", padding: "12px 8px", display: "flex", flexDirection: "column" }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} style={{ marginBottom: group.featured ? "8px" : "18px" }}>
            {group.label && !c && !group.featured && (
              <div className="ba-sidebar-group-label" style={{ padding: "0 10px", marginBottom: "6px", marginTop: gi > 0 ? "2px" : 0, fontSize: "10px", fontWeight: "700", letterSpacing: "1px", color: C.inkMuted, fontFamily: "Inter,sans-serif", textTransform: "uppercase" }}>
                {group.label}
              </div>
            )}
            {group.items.map(({ key, label, icon }) => {
              const isActive = active === key;
              const isFeatured = group.featured;
              return (
                <button key={key} className={`ba-sidebar-item${isActive ? " ba-sidebar-item-active" : ""}`}
                  onClick={() => handleNav(key)} title={c ? label : undefined}
                  style={{
                    width: "100%", display: "flex", alignItems: "center",
                    gap: 0,
                    padding: c ? "9px 0" : "9px 14px",
                    justifyContent: c ? "center" : "flex-start",
                    borderRadius: "10px",
                    background: isActive
                      ? "linear-gradient(135deg, #080B0F 0%, #142641 40%, #1E3A5F 75%, #2D5986 100%)"
                      : "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: isActive ? "#FFFFFF" : isFeatured ? C.ink : C.sbText,
                    fontSize: isFeatured ? "13px" : "13px",
                    fontWeight: isActive ? "700" : isFeatured ? "600" : "450",
                    fontFamily: "'Inter', 'Roboto', sans-serif",
                    textAlign: "left", marginBottom: "2px",
                    transition: "all 0.15s",
                    boxShadow: isActive ? "0 4px 16px rgba(30,58,95,0.35)" : "none",
                    letterSpacing: "-0.01em",
                    position: "relative",
                  }}>
                  {!isActive && isFeatured && !c && (
                    <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: "3px", height: "18px", borderRadius: "2px", background: "#B07D2E" }} />
                  )}
                  {c
                    ? <span style={{ fontSize: "11px", fontWeight: "700", color: isActive ? "#fff" : C.inkSubtle }}>{label.slice(0,2)}</span>
                    : <span style={{ flex: 1, paddingLeft: isFeatured && !isActive ? "10px" : 0 }}>{label}</span>
                  }
                  {!c && isFeatured && !isActive && <span style={{ fontSize: "10px", background: "#B07D2E", color: "#FFF8E7", borderRadius: "6px", padding: "2px 7px", fontWeight: "700", letterSpacing: "0.4px", flexShrink: 0 }}>IA</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Actions bas */}
      {!mobileCompact && <div className="ba-sidebar-footer" style={{ padding: "10px 8px", borderTop: `1px solid ${C.sbBorder}`, display: "flex", gap: "5px", justifyContent: "center", flexShrink: 0 }}>
        {c ? (
          <button onClick={toggleCollapse} title="Déplier la sidebar"
            style={{ width: "34px", height: "34px", borderRadius: "8px", background: C.snowDim, border: `1px solid ${C.border}`, color: C.inkMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5,2 10,7 5,12"/></svg>
          </button>
        ) : (<>
          {/* Compact / zoom */}
          <button onClick={toggleCompact} title={compact ? "Mode normal" : "Mode compact (zoom arrière)"}
            style={{ flex: 1, height: "32px", borderRadius: "8px", background: compact ? C.greenLight : C.snowDim, border: `1px solid ${compact ? C.green + "60" : C.border}`, color: compact ? C.greenDark : C.inkMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", transition: "all 0.2s" }}>
            {compact ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="7" x2="13" y2="7"/><line x1="7" y1="1" x2="7" y2="13"/><circle cx="7" cy="7" r="5.5"/></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="7" x2="13" y2="7"/><circle cx="7" cy="7" r="5.5"/></svg>
            )}
            <span style={{ fontSize: "9px", fontWeight: "700", fontFamily: "Inter,sans-serif" }}>{compact ? "Normal" : "Compact"}</span>
          </button>

          {/* Clair / sombre */}
          <button onClick={toggleDark} title={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}
            style={{ flex: 1, height: "32px", borderRadius: "8px", background: darkMode ? "#1E2A38" : C.snowDim, border: `1px solid ${darkMode ? "rgba(148,163,184,0.2)" : C.border}`, color: darkMode ? "#CBD5E1" : C.inkMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", transition: "all 0.2s" }}>
            {darkMode ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
            <span style={{ fontSize: "9px", fontWeight: "700", fontFamily: "Inter,sans-serif" }}>{darkMode ? "Clair" : "Sombre"}</span>
          </button>

          {/* PDF */}
          <button onClick={() => window.print()} title="Exporter en PDF"
            style={{ flex: 1, height: "32px", borderRadius: "8px", background: C.snowDim, border: `1px solid ${C.border}`, color: C.inkMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", transition: "all 0.2s" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span style={{ fontSize: "9px", fontWeight: "700", fontFamily: "Inter,sans-serif" }}>PDF</span>
          </button>
        </>)}
      </div>}

      {/* Carte portefeuille */}
      {!c && !mobileCompact && positions.length > 0 && <div className="ba-sidebar-pfcard" style={{ padding: "12px 12px 14px", flexShrink: 0 }}>
        <div style={{ background: "linear-gradient(135deg, #111214 0%, #1A2744 60%, #1E3A5F 100%)", borderRadius: "16px", padding: "16px 18px", boxShadow: "0 6px 24px rgba(30,58,95,0.25)" }}>
          <div style={{ fontSize: "9px", fontWeight: "700", color: "rgba(193,232,255,0.65)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>Portefeuille {account || "PEA"}</div>
          <div style={{ fontSize: "20px", fontWeight: "900", color: "#fff", letterSpacing: "-0.5px", marginBottom: "4px", ...(hidden ? { filter: "blur(7px)", userSelect: "none" } : {}) }}>{fmtEur(totalActuel)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.85)", fontWeight: "600", ...(hidden ? { filter: "blur(7px)", userSelect: "none" } : {}) }}>{(pv >= 0 ? "+" : "") + fmtEur(pv)}</span>
            <span style={{ fontSize: "11px", background: "rgba(255,255,255,0.2)", borderRadius: "20px", padding: "2px 8px", color: "#fff", fontWeight: "700", ...(hidden ? { filter: "blur(7px)", userSelect: "none" } : {}) }}>{(pv >= 0 ? "+" : "") + pvPct.toFixed(1) + "%"}</span>
          </div>
        </div>
      </div>}
    </div>
  );
}

function Sidebar({ active, onChange, portfolioVersion, refreshAll, refreshing, refreshAgo, toggleDark, toggleCompact, darkMode, compact, hidden, mobileOpen, onMobileClose, account, onSwitchAccount }) {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(() => load("bourse_sidebar_collapsed", false));
  const toggleCollapse = () => { const v = !collapsed; setCollapsed(v); save("bourse_sidebar_collapsed", v); };

  const sharedProps = { active, onChange, portfolioVersion, refreshAll, refreshing, toggleDark, toggleCompact, darkMode, compact, hidden, collapsed, toggleCollapse, account, onSwitchAccount };

  if (isMobile) {
    // Sur mobile : drawer overlay déclenché par le hamburger
    if (!mobileOpen) return null;
    return (
      <>
        {/* Backdrop */}
        <div onClick={onMobileClose} style={{ position: "fixed", inset: 0, background: "rgba(8,11,15,0.45)", zIndex: 998, backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)", animation: "fadeIn 0.18s ease" }} />
        {/* Drawer */}
        <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: "272px", background: "rgba(248,249,250,0.97)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRight: `1px solid ${C.sbBorder}`, display: "flex", flexDirection: "column", zIndex: 999, boxShadow: "4px 0 24px rgba(8,11,15,0.18)", animation: "slideInLeft 0.22s cubic-bezier(0.4,0,0.2,1)" }}>
          <SidebarContent {...sharedProps} collapsed={false} mobileCompact={false} onClose={onMobileClose} />
        </div>
      </>
    );
  }

  return (
    <div className="ba-sidebar" style={{ width: collapsed ? "56px" : "224px", minWidth: collapsed ? "56px" : "224px", height: "100vh", background: "rgba(248,249,250,0.82)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRight: `1px solid ${C.sbBorder}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, zIndex: 20, overflow: "hidden", transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)" }}>
      <SidebarContent {...sharedProps} onClose={null} />
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
// ─── Bannière PWA iOS "Ajouter à l'écran d'accueil" ──────────────────────────
function PWAInstallBanner() {
  const isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true;
  const [visible, setVisible] = useState(() => {
    if (!isIOS || isStandalone) return false;
    return !load("bourse_pwa_dismissed", false);
  });

  if (!visible) return null;

  const dismiss = () => { save("bourse_pwa_dismissed", true); setVisible(false); };

  return (
    <div style={{
      position: "fixed", bottom: "66px", left: "12px", right: "12px",
      background: C.snow, border: `1px solid ${C.border}`,
      borderRadius: "16px", padding: "14px 16px",
      boxShadow: "0 4px 24px rgba(30,58,95,0.12)",
      display: "flex", alignItems: "flex-start", gap: "12px",
      zIndex: 200, animation: "fadeIn 0.3s ease",
    }}>
      {/* Icône */}
      <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: C.navyLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2v10M6 6l4-4 4 4" stroke="#1E3A5F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 13v4a1 1 0 001 1h12a1 1 0 001-1v-4" stroke="#1E3A5F" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Texte */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink, marginBottom: "4px" }}>
          Protégez vos données
        </div>
        <div style={{ fontSize: "11px", color: C.inkMuted, lineHeight: "1.5" }}>
          Sur iOS, Safari peut effacer le stockage local. Ajoutez ce site à l'écran d'accueil pour un stockage durable.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "8px", background: C.snowOff, borderRadius: "8px", padding: "6px 10px" }}>
          <span style={{ fontSize: "10px", color: C.inkMuted }}>Appuyez sur</span>
          {/* Icône Partage iOS */}
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
            <path d="M10 2v10M6 6l4-4 4 4" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 13v4a1 1 0 001 1h12a1 1 0 001-1v-4" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: "10px", color: C.inkMuted }}>puis</span>
          <span style={{ fontSize: "10px", fontWeight: "700", color: C.navy, background: C.navyLight, borderRadius: "5px", padding: "1px 6px" }}>Sur l'écran d'accueil</span>
        </div>
      </div>

      {/* Fermer */}
      <button onClick={dismiss}
        style={{ background: "none", border: "none", color: C.inkSubtle, cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "0", flexShrink: 0, marginTop: "-2px" }}>
        ✕
      </button>
    </div>
  );
}

// ─── Markdown éducatif ───────────────────────────────────────────────────────
function renderAIMarkdown(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;

  const inlineFormat = (str) => {
    const parts = [];
    const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let last = 0, m;
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) parts.push(str.slice(last, m.index));
      if (m[2]) parts.push(<strong key={m.index} style={{ fontStyle: "italic" }}>{m[2]}</strong>);
      else if (m[3]) parts.push(<strong key={m.index}>{m[3]}</strong>);
      else if (m[4]) parts.push(<em key={m.index}>{m[4]}</em>);
      else if (m[5]) parts.push(<code key={m.index} style={{ background: "rgba(30,58,95,0.08)", borderRadius: "4px", padding: "1px 5px", fontSize: "11px", fontFamily: "monospace", color: C.accent }}>{m[5]}</code>);
      last = m.index + m[0].length;
    }
    if (last < str.length) parts.push(str.slice(last));
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];

    // H1
    if (/^# /.test(line)) {
      const raw = line.replace(/^# /, "").trim();
      // Sépare le premier emoji éventuel du reste du titre
      const emojiMatch = raw.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u);
      const emoji = emojiMatch ? emojiMatch[0].trim() : null;
      const title = emoji ? raw.slice(emojiMatch[0].length).trim() : raw;
      out.push(
        <div key={i} style={{ background: "linear-gradient(135deg, #0C1520 0%, #162840 50%, #1E3A5F 100%)", borderRadius: "16px", padding: "18px 20px", marginBottom: "18px", marginTop: "4px", boxShadow: "0 4px 20px rgba(14,30,54,0.35)" }}>
          {/* Label "Concept clé" */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="6" fill="rgba(255,255,255,0.15)"/><path d="M6 3v3.5L8 8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span style={{ fontSize: "9px", fontWeight: "700", color: "rgba(255,255,255,0.45)", letterSpacing: "1.5px", textTransform: "uppercase" }}>Concept clé</span>
          </div>
          {/* Emoji + Titre côte à côte */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {emoji && (
              <div style={{ width: "46px", height: "46px", borderRadius: "12px", background: "rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", flexShrink: 0, border: "1px solid rgba(255,255,255,0.12)" }}>
                {emoji}
              </div>
            )}
            {!emoji && (
              <div style={{ width: "46px", height: "46px", borderRadius: "12px", background: "rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid rgba(255,255,255,0.12)" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2L12.4 7.2H18L13.6 10.4L15.6 16L10 12.8L4.4 16L6.4 10.4L2 7.2H7.6L10 2Z" fill="rgba(255,255,255,0.7)"/></svg>
              </div>
            )}
            <div>
              <div style={{ fontSize: "17px", fontWeight: "800", color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.25 }}>{title}</div>
            </div>
          </div>
        </div>
      );
      i++; continue;
    }

    // H2
    if (/^## /.test(line)) {
      const title = line.replace(/^## /, "").trim();
      // Détecte si c'est un callout ⚠️ / 🔔 / ℹ️
      const isWarn = /^[⚠️🔔❗❌]/.test(title);
      const isInfo = /^[💡ℹ️📌🎯]/.test(title);
      if (isWarn) {
        out.push(
          <div key={i} style={{ background: "rgba(231,76,60,0.07)", border: "1px solid rgba(231,76,60,0.2)", borderRadius: "10px", padding: "10px 14px", marginTop: "16px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px", flexShrink: 0 }}>{title.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u)?.[0] || "⚠️"}</span>
            <span style={{ fontSize: "12px", fontWeight: "700", color: C.red }}>{title.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, "")}</span>
          </div>
        );
      } else if (isInfo) {
        out.push(
          <div key={i} style={{ background: "rgba(30,58,95,0.07)", border: "1px solid rgba(30,58,95,0.15)", borderRadius: "10px", padding: "10px 14px", marginTop: "16px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px", flexShrink: 0 }}>{title.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u)?.[0] || "💡"}</span>
            <span style={{ fontSize: "12px", fontWeight: "700", color: C.accent }}>{title.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, "")}</span>
          </div>
        );
      } else {
        out.push(
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "20px", marginBottom: "10px", paddingBottom: "8px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: "4px", height: "16px", background: "linear-gradient(180deg, #1E3A5F, #2D5986)", borderRadius: "2px", flexShrink: 0 }} />
            <span style={{ fontSize: "13px", fontWeight: "800", color: C.ink, letterSpacing: "-0.01em" }}>{inlineFormat(title)}</span>
          </div>
        );
      }
      i++; continue;
    }

    // H3
    if (/^### /.test(line)) {
      out.push(
        <div key={i} style={{ fontSize: "11px", fontWeight: "700", color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "14px", marginBottom: "6px" }}>
          {line.replace(/^### /, "")}
        </div>
      );
      i++; continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) {
      out.push(<div key={i} style={{ height: "1px", background: C.border, margin: "14px 0" }} />);
      i++; continue;
    }

    // Blockquote
    if (/^> /.test(line)) {
      const bqLines = [];
      while (i < lines.length && /^> /.test(lines[i])) {
        bqLines.push(lines[i].replace(/^> /, ""));
        i++;
      }
      const bqText = bqLines.join(" ");
      const isDisclaimer = /conseil|investissement|éducatif|information|avertissement/i.test(bqText);
      out.push(
        <div key={i} style={{ background: isDisclaimer ? "rgba(245,158,11,0.07)" : "rgba(30,58,95,0.05)", border: `1px solid ${isDisclaimer ? "rgba(245,158,11,0.25)" : "rgba(30,58,95,0.12)"}`, borderLeft: `3px solid ${isDisclaimer ? C.gold : C.accent}`, borderRadius: "0 10px 10px 0", padding: "10px 14px", margin: "10px 0", fontSize: "11px", color: isDisclaimer ? "#92400E" : C.inkMuted, lineHeight: "1.65", fontStyle: "italic" }}>
          {bqLines.map((l, j) => <div key={j}>{inlineFormat(l)}</div>)}
        </div>
      );
      continue;
    }

    // Table
    if (/^\|/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter(l => !/^\|[-:| ]+\|/.test(l))
        .map(l => l.replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
      if (rows.length > 0) {
        const header = rows[0];
        const body = rows.slice(1);
        out.push(
          <div key={i} style={{ borderRadius: "12px", overflow: "hidden", border: `1px solid ${C.border}`, marginBottom: "14px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "linear-gradient(135deg, #0F1923 0%, #1E3A5F 100%)" }}>
                  {header.map((h, j) => (
                    <th key={j} style={{ padding: "9px 14px", textAlign: j === 0 ? "left" : "right", color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? C.snow : C.snowOff, borderTop: `1px solid ${C.border}` }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: "9px 14px", textAlign: ci === 0 ? "left" : "right", color: ci === 0 ? C.inkMuted : C.ink, fontWeight: ci === 1 ? "700" : "400" }}>
                        {inlineFormat(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Bullet list
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].replace(/^[-*] /, ""));
        i++;
      }
      out.push(
        <ul key={i} style={{ margin: "8px 0 12px", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
          {items.map((item, j) => (
            <li key={j} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "12px", lineHeight: "1.6", color: C.ink }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.accent, flexShrink: 0, marginTop: "7px" }} />
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ""));
        i++;
      }
      out.push(
        <ol key={i} style={{ margin: "8px 0 12px", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px", counterReset: "edu-counter" }}>
          {items.map((item, j) => (
            <li key={j} style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "12px", lineHeight: "1.6", color: C.ink }}>
              <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: C.accent, color: "#fff", fontSize: "10px", fontWeight: "800", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: "2px" }}>{j + 1}</span>
              <span style={{ flex: 1 }}>{inlineFormat(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++; continue;
    }

    // Paragraph
    out.push(
      <p key={i} style={{ fontSize: "12px", lineHeight: "1.7", color: C.ink, margin: "0 0 8px" }}>
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  return out;
}

// ─── Assistant IA flottant ───────────────────────────────────────────────────
function AIAssistant({ account, profil }) {
  const isMobile = useIsMobile();
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100); }, [open]);

  const buildContext = () => {
    const allPos   = load("bourse_portfolio", []);
    const positions = allPos.filter(p => (p.compte || "PEA") === account);
    const totalActuel  = positions.reduce((s, p) => s + ((p.dernierCours || p.pru || 0) * (p.quantite || 0)), 0);
    const totalInvesti = positions.reduce((s, p) => s + (p.pru || 0) * (p.quantite || 0), 0);
    const pv    = totalActuel - totalInvesti;
    const pvPct = totalInvesti > 0 ? (pv / totalInvesti * 100) : 0;
    const posLines = positions.map(p => {
      const cours    = p.dernierCours || p.pru || 0;
      const pvPctPos = p.pru > 0 ? ((cours - p.pru) / p.pru * 100) : 0;
      return `  • ${p.nom}${p.isin ? ` (${p.isin})` : ""}: ${p.quantite} titres @ PRU ${p.pru}€, cours ${cours.toFixed(2)}€, PV ${pvPctPos >= 0 ? "+" : ""}${pvPctPos.toFixed(1)}%${p.secteur ? `, secteur: ${p.secteur}` : ""}`;
    }).join("\n");
    return `PORTEFEUILLE ${account} au ${new Date().toLocaleDateString("fr-FR")} :
Valeur totale : ${totalActuel.toFixed(0)}€ | Capital investi : ${totalInvesti.toFixed(0)}€ | Plus-value : ${pv >= 0 ? "+" : ""}${pvPct.toFixed(1)}%
Nombre de positions : ${positions.length}
${posLines || "  Aucune position configurée."}
Profil investisseur : horizon ${profil?.horizon || "non défini"}, risque ${profil?.risque || "non défini"}, DCA ${profil?.dcaMensuel || 0}€/mois`;
  };

  const aiCfg   = (() => { try { return JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || "{}"); } catch { return {}; } })();
  const aiEmoji = localStorage.getItem(AI_EMOJI_KEY) || "🤖";
  const assistantName = aiCfg.nom?.trim() || "l'assistant";
  const tonMap = { pedagogique: "pédagogique et accessible, avec des analogies du quotidien", professionnel: "direct et professionnel, sans fioritures", conservateur: "prudent et conservateur, en soulignant les risques", motivant: "motivant et positif, en valorisant les bons choix" };
  const tonDesc = tonMap[aiCfg.ton || "pedagogique"];
  const longueurDesc = aiCfg.longueur === "detaille" ? "Développe tes réponses avec des explications complètes." : "Sois concis : 3-5 phrases max sauf si l'utilisateur demande plus de détails.";
  const customInstructions = aiCfg.instructions?.trim() ? `\n\nInstructions spécifiques de l'utilisateur :\n${aiCfg.instructions.trim()}` : "";

  const SYSTEM_PROMPT = `Tu es ${assistantName}, un assistant financier intégré dans une application de suivi de portefeuille boursier. Tu aides l'utilisateur à comprendre ses données et les concepts financiers.

Ton style est ${tonDesc}.
${longueurDesc}

Règles strictes :
- Réponds toujours en français
- Utilise les données réelles du portefeuille quand c'est pertinent
- Termine chaque réponse sur une note positive/encourageante si possible
- IMPORTANT : rappelle toujours que tes analyses sont informatives et ne constituent pas un conseil en investissement financier
- Ne conseille jamais d'acheter ou vendre un titre spécifique de façon directe${customInstructions}`;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const context  = buildContext();
      const apiMsgs  = newMessages.map((m, i) =>
        i === 0
          ? { role: m.role, content: `[CONTEXTE DE MON PORTEFEUILLE]\n${context}\n\n[MA QUESTION]\n${m.content}` }
          : { role: m.role, content: m.content }
      );
      const res = await fetch(CLAUDE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": String(ANTHROPIC_API_KEY),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model: CLAUDE_MODELS.standard, max_tokens: 1024, system: SYSTEM_PROMPT, messages: apiMsgs }),
      });
      const data  = await res.json();
      if (data?.error) throw new Error(data.error.message || "Erreur API");
      const reply = data?.content?.[0]?.text || "Désolé, je n'ai pas pu générer une réponse.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `Erreur : ${e.message || "Vérifiez votre clé API Claude."}` }]);
    }
    setLoading(false);
  };

  // Index du jour (change chaque matin à 00h00)
  const dayIndex = Math.floor(Date.now() / 86400000);

  const ALL_SUGGESTIONS = [
    "Qu'est-ce que le PRU ?",
    "Mon portefeuille est-il diversifié ?",
    "Que signifie le RSI ?",
    "Qu'est-ce qu'un ETF ?",
    "Comment fonctionne le DCA ?",
    "Explique ma plus-value latente",
    "C'est quoi le PEA ?",
    "Quelle est la différence entre ETF et action ?",
    "Comment lire un bilan comptable ?",
    "Qu'est-ce que la volatilité ?",
    "Explique le MACD simplement",
    "Qu'est-ce qu'une plus-value réalisée ?",
    "Comment diversifier un portefeuille ?",
    "C'est quoi le rendement dividende ?",
    "Qu'est-ce que l'effet de levier ?",
    "Explique la capitalisation boursière",
    "Qu'est-ce qu'une obligation ?",
    "Comment fonctionne une OPA ?",
    "Quelle différence entre CTO et PEA ?",
    "Qu'est-ce que le Price/Earnings ratio ?",
  ];

  const DIDYOUKNOW = [
    { emoji: "📈", fact: "Le marché boursier a généré en moyenne +10%/an sur les 100 dernières années, malgré toutes les crises.", source: "Données historiques S&P 500" },
    { emoji: "⏳", fact: "Investir 100€/mois pendant 30 ans à 8%/an donne 149 000€ — alors qu'on n'aura versé que 36 000€.", source: "Puissance des intérêts composés" },
    { emoji: "🌍", fact: "Un ETF World MSCI couvre plus de 1 600 entreprises dans 23 pays avec un seul produit.", source: "MSCI World Index" },
    { emoji: "🧠", fact: "Warren Buffett a réalisé 97% de sa fortune après ses 65 ans, grâce aux intérêts composés.", source: "The Snowball, Alice Schroeder" },
    { emoji: "💡", fact: "Le DCA (Dollar Cost Averaging) permet de réduire l'impact des pics de marché en lissant le prix d'achat.", source: "Stratégie d'investissement périodique" },
    { emoji: "📊", fact: "Historiquement, rester investi durant les 10 meilleures journées sur 20 ans peut doubler votre rendement.", source: "JP Morgan Asset Management" },
    { emoji: "🏦", fact: "Le PEA permet de ne payer que 17,2% de prélèvements sociaux sur vos gains après 5 ans (pas d'impôt sur le revenu).", source: "Code général des impôts, France" },
    { emoji: "🎯", fact: "La diversification entre 20 et 30 actions élimine environ 90% du risque spécifique d'un portefeuille.", source: "Markowitz, théorie du portefeuille" },
    { emoji: "📉", fact: "En moyenne, les marchés corrigent de plus de 10% une fois par an — c'est normal et temporaire.", source: "Données historiques Morningstar" },
    { emoji: "🔄", fact: "Réinvestir les dividendes automatiquement peut multiplier votre rendement total par 2 à 3 sur 20 ans.", source: "Effet du réinvestissement des dividendes" },
    { emoji: "🌱", fact: "Les ETF à faibles frais (< 0,2%/an) surpassent 80% des fonds actifs sur 15 ans.", source: "SPIVA Scorecard, S&P Global" },
    { emoji: "⚖️", fact: "Une inflation de 3%/an divise par 2 le pouvoir d'achat de votre épargne en 24 ans si elle dort en liquide.", source: "Règle des 72" },
    { emoji: "🚀", fact: "Apple, Amazon et Google représentent à elles seules plus de 10% de la capitalisation mondiale.", source: "MSCI, 2024" },
    { emoji: "💰", fact: "Les frais de gestion d'un fonds actif à 1,5%/an coûtent 38% de capital en moins sur 30 ans vs 0,2%/an.", source: "Calcul d'impact des frais" },
    { emoji: "🕰️", fact: "Le meilleur moment pour investir était hier. Le deuxième meilleur moment, c'est aujourd'hui.", source: "Proverbe boursier" },
  ];

  // Sélection quotidienne déterministe
  const todaySuggestions = ALL_SUGGESTIONS
    .slice(dayIndex % ALL_SUGGESTIONS.length)
    .concat(ALL_SUGGESTIONS.slice(0, dayIndex % ALL_SUGGESTIONS.length))
    .slice(0, 4);
  const todayDidYouKnow = DIDYOUKNOW[dayIndex % DIDYOUKNOW.length];

  return (
    <>
      {/* Bouton flottant */}
      <button onClick={() => setOpen(v => !v)} title="Assistant IA"
        style={{ position: "fixed", bottom: isMobile ? "76px" : "24px", right: "20px", zIndex: 999,
          width: "52px", height: "52px", borderRadius: "50%",
          background: open ? "#111214" : "linear-gradient(135deg, #080B0F 0%, #142641 40%, #1E3A5F 75%, #2D5986 100%)",
          border: "none", cursor: "pointer", boxShadow: "0 6px 28px rgba(30,58,95,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: open ? "18px" : "22px", transition: "all 0.2s",
          color: "#fff",
        }}>
        {open ? "✕" : aiEmoji}
      </button>

      {/* Panneau chat */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: isMobile ? 0 : "88px", right: isMobile ? 0 : "20px",
          width: isMobile ? "100vw" : "420px",
          height: isMobile ? "82vh" : "580px",
          background: C.snow, borderRadius: isMobile ? "20px 20px 0 0" : "20px",
          boxShadow: "0 16px 56px rgba(17,18,20,0.22)", zIndex: 998,
          display: "flex", flexDirection: "column", overflow: "hidden",
          border: `1px solid ${C.border}`, animation: "fadeIn 0.18s ease",
        }}>
          {/* En-tête */}
          <div style={{ background: "linear-gradient(135deg, #080B0F 0%, #142641 50%, #1E3A5F 100%)", padding: "14px 18px", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            <span style={{ fontSize: "20px" }}>{aiEmoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: "800", color: "#fff", letterSpacing: "-0.01em" }}>{aiCfg.nom?.trim() ? `${aiCfg.nom.trim()} IA` : "Assistant IA"}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", marginTop: "1px" }}>Posez vos questions sur votre portefeuille</div>
            </div>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "3px 8px", fontSize: "10px", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: "Inter,sans-serif" }}>
                Effacer
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Pas de clé Claude */}
            {!hasClaudeKey() && (
              <div style={{ textAlign: "center", paddingTop: "16px" }}>
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>🔑</div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink, marginBottom: "8px" }}>Clé Claude non configurée</div>
                <div style={{ fontSize: "11px", color: C.inkSubtle, marginBottom: "20px", lineHeight: "1.6" }}>
                  L'assistant IA nécessite une clé API Claude.<br/>
                  L'inscription est <strong>gratuite</strong> et inclut des crédits offerts.
                </div>
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", background: "linear-gradient(135deg, #1E3A5F, #2D5986)", color: "#fff", borderRadius: "10px", padding: "10px 20px", fontSize: "12px", fontWeight: "700", textDecoration: "none", marginBottom: "12px" }}>
                  Créer un compte gratuit →
                </a>
                <div style={{ fontSize: "10px", color: C.inkSubtle, lineHeight: "1.6" }}>
                  Puis ajoutez votre clé dans<br/><strong>Profil → Clés API</strong>
                </div>
              </div>
            )}
            {hasClaudeKey() && messages.length === 0 && (
              <div style={{ paddingTop: "6px", display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Le saviez-vous quotidien */}
                <div style={{ background: "linear-gradient(135deg, #0C1829 0%, #1A3558 100%)", borderRadius: "16px", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: "-10px", right: "-10px", fontSize: "60px", opacity: 0.07, lineHeight: 1 }}>💡</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "9px", fontWeight: "700", color: "rgba(255,255,255,0.45)", letterSpacing: "1.5px", textTransform: "uppercase" }}>Le saviez-vous ?</span>
                    <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>Renouvelle chaque matin</span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "22px", lineHeight: 1, flexShrink: 0 }}>{todayDidYouKnow.emoji}</span>
                    <div>
                      <p style={{ fontSize: "12px", color: "#E8F0FF", lineHeight: "1.65", margin: "0 0 6px", fontWeight: "500" }}>{todayDidYouKnow.fact}</p>
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>— {todayDidYouKnow.source}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setInput(`Explique-moi : "${todayDidYouKnow.fact}"`); setTimeout(() => inputRef.current?.focus(), 50); }}
                    style={{ marginTop: "10px", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "20px", padding: "5px 14px", fontSize: "10px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontFamily: "Inter,sans-serif", fontWeight: "600" }}>
                    En savoir plus →
                  </button>
                </div>

                {/* Questions du jour */}
                <div>
                  <div style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "2px" }}>Questions du jour</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {todaySuggestions.map(s => (
                      <button key={s} onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                        style={{ padding: "7px 13px", borderRadius: "20px", border: `1px solid ${C.border}`, background: C.cardGrad, color: C.inkSoft, fontSize: "11px", cursor: "pointer", fontFamily: "Inter,sans-serif", fontWeight: "500", transition: "all 0.15s", boxShadow: "0 1px 4px rgba(17,18,20,0.06)" }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "assistant" && (
                  <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #1E3A5F, #2D5986)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0, marginRight: "8px", marginTop: "2px", boxShadow: "0 2px 8px rgba(30,58,95,0.30)" }}>{aiEmoji}</span>
                )}
                {m.role === "user" ? (
                  <div style={{
                    maxWidth: "78%", padding: "10px 14px",
                    borderRadius: "16px 16px 4px 16px",
                    background: "linear-gradient(135deg, #142641 0%, #1E3A5F 100%)",
                    color: "#fff", fontSize: "12px", lineHeight: "1.65",
                  }}>
                    {m.content}
                  </div>
                ) : (
                  <div style={{ position: "relative", maxWidth: "90%" }}>
                    <div style={{
                      padding: "14px 16px",
                      borderRadius: "4px 16px 16px 16px",
                      background: C.snow,
                      border: `1px solid ${C.border}`,
                      boxShadow: "0 2px 12px rgba(17,18,20,0.06)",
                    }}>
                      {renderAIMarkdown(m.content)}
                    </div>
                    <button onClick={() => navigator.clipboard?.writeText(m.content)} title="Copier"
                      style={{ position: "absolute", top: "6px", right: "6px", width: "22px", height: "22px", borderRadius: "6px", border: `1px solid ${C.border}`, background: C.bg, color: C.inkMuted, fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      ⎘
                    </button>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg, #1E3A5F, #2D5986)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0 }}>{aiEmoji}</span>
                <div style={{ padding: "10px 16px", borderRadius: "4px 16px 16px 16px", background: C.snowOff, border: `1px solid ${C.border}`, display: "flex", gap: "4px", alignItems: "center" }}>
                  {[0,1,2].map(d => (
                    <span key={d} style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.accent, display: "inline-block", animation: `pulse 1.2s ${d * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Zone de saisie */}
          <div style={{ padding: "10px 14px 14px", borderTop: `1px solid ${C.border}`, display: "flex", gap: "8px", flexShrink: 0, background: C.snow, opacity: hasClaudeKey() ? 1 : 0.4, pointerEvents: hasClaudeKey() ? "auto" : "none" }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={hasClaudeKey() ? "Posez votre question…" : "Clé Claude requise"}
              style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "9px 13px", fontSize: "12px", fontFamily: "Inter,sans-serif", color: C.ink, background: C.snowOff, outline: "none" }}
            />
            <button onClick={send} disabled={!input.trim() || loading}
              style={{ width: "38px", height: "38px", borderRadius: "10px", border: "none",
                cursor: input.trim() && !loading ? "pointer" : "default",
                background: input.trim() && !loading ? "linear-gradient(135deg, #1E3A5F 0%, #2D5986 100%)" : C.snowDim,
                color: input.trim() && !loading ? "#fff" : C.inkSubtle,
                fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "all 0.15s",
              }}>↑</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Chat Portefeuille — Assistant IA + Briefing matinal + Détection opportunités
const FINANCE_GLOSSARY = {
  "PRU": "Prix de Revient Unitaire — prix moyen auquel vous avez acquis un titre.",
  "DCA": "Dollar Cost Averaging — investissement régulier à intervalles fixes pour lisser le prix d'achat.",
  "ETF": "Exchange Traded Fund — fonds indiciel coté en bourse qui réplique un indice.",
  "PEA": "Plan d'Épargne en Actions — enveloppe fiscale française exonérée d'impôt sur les plus-values après 5 ans.",
  "CTO": "Compte-Titres Ordinaire — enveloppe d'investissement sans avantage fiscal particulier.",
  "TER": "Total Expense Ratio — frais annuels totaux d'un ETF exprimés en pourcentage.",
  "plus-value": "Gain réalisé entre le prix d'achat et la valeur actuelle d'un titre.",
  "dividende": "Part des bénéfices distribuée périodiquement aux actionnaires.",
  "volatilité": "Amplitude des variations de prix d'un actif — plus c'est élevé, plus le risque est important.",
  "RSI": "Relative Strength Index — indicateur technique mesurant la force d'une tendance (0=survendu, 100=suracheté).",
  "MACD": "Moving Average Convergence Divergence — indicateur de momentum basé sur deux moyennes mobiles.",
  "support": "Niveau de cours où la demande est assez forte pour stopper la baisse.",
  "résistance": "Niveau de cours où l'offre est assez forte pour stopper la hausse.",
  "ISIN": "International Securities Identification Number — code unique à 12 caractères identifiant un titre.",
  "benchmark": "Indice de référence servant à mesurer la performance d'un fonds ou portefeuille.",
  "drawdown": "Baisse maximale depuis un sommet — mesure clé du risque de perte.",
  "CAGR": "Compound Annual Growth Rate — taux de croissance annuel composé sur une période donnée.",
  "rebalancement": "Rééquilibrage périodique du portefeuille pour revenir à l'allocation cible.",
  "capitalisation": "Valeur boursière totale d'une société : cours × nombre d'actions en circulation.",
  "liquidité": "Facilité à acheter ou vendre un actif rapidement sans impacter significativement son prix.",
  "allocation": "Répartition du portefeuille entre différentes classes d'actifs (actions, obligations, etc.).",
  "diversification": "Stratégie consistant à répartir les investissements pour réduire le risque global.",
  "effet de levier": "Utilisation de capital emprunté pour amplifier les gains (et les pertes).",
  "rendement": "Gain annuel généré par un investissement, exprimé en pourcentage.",
};

function parseAiTerms(reply) {
  const sep = "---TERMES---";
  const idx = reply.indexOf(sep);
  if (idx === -1) return { cleanReply: reply, terms: [] };
  const cleanReply = reply.slice(0, idx).trim();
  try {
    const json = reply.slice(idx + sep.length).trim();
    const terms = JSON.parse(json);
    if (Array.isArray(terms)) return { cleanReply, terms };
  } catch {}
  return { cleanReply, terms: [] };
}

function ChatTab({ profil, account, portfolioVersion, marketScores }) {
  const [sessions, setSessions]         = useState(() => load("bourse_chat_sessions", []));
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [expandedTerms, setExpandedTerms] = useState(null);
  const [hoveredSession, setHoveredSession] = useState(null);
  const [briefing, setBriefing]         = useState(() => load("bourse_last_briefing", null));
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [oppoLoading, setOppoLoading]   = useState(false);
  const [activePanel, setActivePanel]   = useState("chat");
  const bottomRef                       = useRef(null);

  const persistSessions = (next) => { setSessions(next); save("bourse_chat_sessions", next.slice(-100)); };
  const deleteSession   = (id)  => persistSessions(sessions.filter(s => s.id !== id));

  // Purge automatique des sessions de plus de 24h
  useEffect(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const fresh = sessions.filter(s => s.id >= cutoff);
    if (fresh.length !== sessions.length) persistSessions(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayKey = new Date().toISOString().slice(0, 10);

  const buildPortfolioContext = () => {
    const all = sanitizePositions(load("bourse_portfolio", []));
    const positions = all.filter(p => (p.compte || "PEA") === (account || "PEA"));
    const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
    const totalActuel  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
    const pv           = totalActuel - totalInvesti;
    const pvPct        = totalInvesti > 0 ? ((pv / totalInvesti) * 100).toFixed(2) : "0";
    const posLines     = positions.map(p => {
      const val  = (p.dernierCours || p.pru) * p.quantite;
      const gain = ((p.dernierCours || p.pru) - p.pru) / p.pru * 100;
      return `- ${p.nom} (${p.isin || "?"}) : ${p.quantite} titres, PRU=${p.pru}€, cours=${p.dernierCours || "N/A"}€, valeur=${val.toFixed(0)}€, perf=${gain.toFixed(1)}%`;
    }).join("\n");
    const snapshots = load("bourse_snapshots", []).slice(-10);
    const snapLine  = snapshots.length >= 2
      ? `Historique récent : ${snapshots.map(s => `${s.date}=${s.valeur?.toFixed(0)}€`).join(", ")}`
      : "Pas d'historique.";
    const ops = load("bourse_avis_operes", []).filter(o => (o.compte || "PEA") === (account || "PEA")).slice(-10);
    const opsLine = ops.length > 0
      ? `10 dernières transactions : ${ops.map(o => `${o.date} ${o.type} ${o.quantite}×${o.titre} à ${o.prixUnitaire}€`).join(" | ")}`
      : "Aucune transaction.";
    const scores = Array.isArray(marketScores) ? marketScores : [];
    const scoresLine = scores.length > 0
      ? `Signaux IA marché : ${scores.map(s => `${s.nom}→${s.signal}(${s.score_marche}/20)`).join(", ")}`
      : "Pas de signaux IA.";
    return { positions, totalActuel, totalInvesti, pv, pvPct, posLines, snapLine, opsLine, scoresLine };
  };

  const buildSystemPrompt = () => {
    const { positions, totalActuel, totalInvesti, pv, pvPct, posLines, snapLine, opsLine, scoresLine } = buildPortfolioContext();
    return `Tu es le Conseiller Privé IA de cet investisseur. Tu as accès à toutes ses données et réponds en français, de façon concise et personnalisée.

COMPTE : ${account || "PEA"} | PROFIL : risque=${profil?.risque || "N/A"}, horizon=${profil?.horizon || "N/A"}, DCA=${profil?.dcaMensuel || 0}€/mois, courtier=${profil?.courtier || "boursobank"}, espèces disponibles=${account === "CTO" ? (profil?.especesCTO || 0) : (profil?.especesPEA || 0)}€

CONDITIONS TARIFAIRES COURTIER : ${COURTIERS_DETAIL[profil?.courtier || "boursobank"]}
Tu connais donc exactement les frais applicables — ne demande JAMAIS à l'utilisateur ses frais de courtage, calcule-les directement.

PORTEFEUILLE (${positions.length} positions) :
${posLines || "Aucune position."}

RÉSUMÉ : valeur=${totalActuel.toFixed(0)}€, investi=${totalInvesti.toFixed(0)}€, PV=${pv >= 0 ? "+" : ""}${pv.toFixed(0)}€ (${pvPct}%)
${snapLine}
${opsLine}
${scoresLine}

STRATÉGIE DCA DE L'INVESTISSEUR : le DCA mensuel (${profil?.dcaMensuel || 0}€/mois) est EXCLUSIVEMENT réservé aux ETF (Amundi, Lyxor, iShares, etc.). Les actions individuelles (small caps, mid caps, grandes capitalisations) ne font JAMAIS l'objet de DCA — ni dans le plan, ni dans l'explication, ni dans la logique présentée. Pour les actions individuelles, parler uniquement d'"achat opportuniste", de "renforcement ponctuel" ou d'"achat au comptant" — JAMAIS de DCA. Si l'utilisateur pose une question sur son DCA, réorienter systématiquement vers les ETF.

RÈGLES : réponds en français, sois concis et direct, utilise les données ci-dessus. Markdown autorisé. Tu n'es pas conseiller financier agréé — toujours rappeler que les décisions appartiennent à l'investisseur.

TERMES TECHNIQUES : si tu utilises des termes financiers techniques dans ta réponse (ex : PRU, ETF, DCA, PEA, RSI, OPCVM, etc.), ajoute OBLIGATOIREMENT à la fin de ta réponse le bloc suivant — rien d'autre après :
---TERMES---
[{"term":"NOM_DU_TERME","def":"définition courte en français"},...]

Si aucun terme technique, n'ajoute pas ce bloc.`;
  };

  // Feature 2 — Briefing matinal automatique
  const generateBriefing = async () => {
    setBriefingLoading(true);
    const { positions, totalActuel, totalInvesti, pv, pvPct, posLines, scoresLine } = buildPortfolioContext();
    const top    = [...positions].sort((a,b) => ((b.dernierCours||b.pru)-b.pru)/b.pru - ((a.dernierCours||a.pru)-a.pru)/a.pru);
    const best   = top[0];
    const worst  = top[top.length - 1];
    const prompt = `Tu es un conseiller financier personnel. Génère un briefing matinal concis pour cet investisseur.

PORTEFEUILLE :
${posLines || "Aucune position."}
Valeur totale : ${totalActuel.toFixed(0)}€ | PV latente : ${pv >= 0 ? "+" : ""}${pv.toFixed(0)}€ (${pvPct}%)
Meilleure position : ${best?.nom || "N/A"} | Moins bonne : ${worst?.nom || "N/A"}
${scoresLine}

STRUCTURE DU BRIEFING (max 200 mots) :
1. **Résumé portefeuille** — état en une phrase
2. **Point du jour** — 1 observation clé sur la composition ou un signal IA
3. **3 actions prioritaires** — concrètes et actionnables aujourd'hui
4. **Vigilance** — 1 risque à surveiller

Réponds en français, direct, sans introduction générique.`;
    try {
      const reply = await callClaudeConversation("Tu es un conseiller financier. Sois concis et direct.", [{ role: "user", content: prompt }]);
      const data  = { date: todayKey, content: reply };
      setBriefing(data);
      save("bourse_last_briefing", data);
    } catch (e) {
      setBriefing({ date: todayKey, content: `Erreur : ${e.message}`, error: true });
    } finally {
      setBriefingLoading(false);
    }
  };

  // Auto-briefing au premier chargement du jour
  useEffect(() => {
    const positions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === (account || "PEA"));
    if (positions.length > 0 && (!briefing || briefing.date !== todayKey)) {
      generateBriefing();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [sessions, loading]);

  // Feature 4 — Détection d'opportunités
  const detectOpportunities = async () => {
    if (oppoLoading || loading) return;
    setOppoLoading(true);
    setActivePanel("chat");
    const { positions, totalActuel, posLines, scoresLine } = buildPortfolioContext();
    const sectors = {};
    positions.forEach(p => {
      const s = p.secteur || "Inconnu";
      sectors[s] = (sectors[s] || 0) + (p.dernierCours || p.pru) * p.quantite;
    });
    const sectorLines = Object.entries(sectors).map(([k, v]) => `${k}: ${((v/totalActuel)*100).toFixed(1)}%`).join(", ");
    const prompt = `Analyse ce portefeuille et identifie les opportunités concrètes.

POSITIONS :
${posLines}
RÉPARTITION SECTORIELLE : ${sectorLines || "Non disponible"}
${scoresLine}
PROFIL : risque=${profil?.risque}, horizon=${profil?.horizon} ans

Détecte et explique :
1. **Surexpositions** — secteurs ou positions > 25% du portefeuille
2. **Manques sectoriels** — secteurs absents mais pertinents pour ce profil
3. **Corrélations dangereuses** — positions qui évoluent de concert (risque de chute simultanée)
4. **Opportunités DCA** — quelle position renforcer ce mois (avec justification)
5. **Position à surveiller** — celle qui nécessite une attention particulière

Sois spécifique, cite les noms des positions, donne des chiffres.`;
    const userMsg = "Détecte les opportunités et risques dans mon portefeuille.";
    const sid = Date.now();
    const next = [...sessions, { id: sid, date: new Date().toISOString(), userMsg, assistantMsg: null, terms: [] }];
    persistSessions(next);
    try {
      const apiMsgs = sessions.flatMap(s => [{ role: "user", content: s.userMsg }, ...(s.assistantMsg ? [{ role: "assistant", content: s.assistantMsg }] : [])]).concat({ role: "user", content: prompt });
      const raw = await callClaudeConversation(buildSystemPrompt(), apiMsgs);
      const { cleanReply, terms } = parseAiTerms(raw);
      setSessions(prev => { const upd = prev.map(s => s.id === sid ? { ...s, assistantMsg: cleanReply, terms } : s); save("bourse_chat_sessions", upd.slice(-100)); return upd; });
    } catch (e) {
      setError(e.message);
    } finally {
      setOppoLoading(false);
    }
  };

  const SUGGESTIONS = [
    "Quel est mon actif le plus performant ?",
    "Quels sont mes risques principaux ?",
    "Analyse ma diversification sectorielle",
    "Si le marché baisse de 10%, quel est mon impact ?",
    "Quelle position renforcer en DCA ce mois ?",
    "Résume mon portefeuille en 3 points",
  ];

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;
    setInput(""); setError(null); setActivePanel("chat");
    const sid = Date.now();
    const next = [...sessions, { id: sid, date: new Date().toISOString(), userMsg: userText, assistantMsg: null, terms: [] }];
    persistSessions(next);
    setLoading(true);
    // Historique complet pour le contexte conversationnel
    const apiMsgs = sessions.flatMap(s => [
      { role: "user", content: s.userMsg },
      ...(s.assistantMsg ? [{ role: "assistant", content: s.assistantMsg }] : []),
    ]).concat({ role: "user", content: userText });
    try {
      const raw = await callClaudeConversation(buildSystemPrompt(), apiMsgs);
      const { cleanReply, terms } = parseAiTerms(raw);
      setSessions(prev => {
        const updated = prev.map(s => s.id === sid ? { ...s, assistantMsg: cleanReply, terms } : s);
        save("bourse_chat_sessions", updated.slice(-100));
        return updated;
      });
    } catch (e) {
      setError(e.message);
      setSessions(prev => { const upd = prev.filter(s => s.id !== sid); save("bourse_chat_sessions", upd); return upd; });
    } finally {
      setLoading(false);
    }
  };

  const formatMessage = (text) => {
    const applyInline = (s) => s
      .replace(/\*\*(.+?)\*\*/g, (_, m) => `<strong>${m}</strong>`)
      .replace(/\*(.+?)\*/g, (_, m) => `<em>${m}</em>`)
      .replace(/`(.+?)`/g, (_, m) => `<code style="background:rgba(30,58,95,0.08);padding:1px 5px;border-radius:4px;font-size:0.92em">${m}</code>`);

    const lines = text.split("\n");
    const result = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Horizontal rule
      if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
        result.push(<hr key={i} style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "10px 0" }} />);
        i++; continue;
      }

      // Heading ## or ###
      if (/^#{1,3}\s/.test(line)) {
        const lvl = line.match(/^(#+)/)[1].length;
        const txt = line.replace(/^#+\s/, "");
        const sz  = lvl === 1 ? "15px" : lvl === 2 ? "13.5px" : "12.5px";
        result.push(<div key={i} style={{ fontWeight: "800", fontSize: sz, color: C.ink, marginTop: "10px", marginBottom: "4px" }} dangerouslySetInnerHTML={{ __html: applyInline(txt) }} />);
        i++; continue;
      }

      // Blockquote >
      if (line.startsWith("> ")) {
        const txt = line.replace(/^>\s?/, "");
        result.push(
          <div key={i} style={{ borderLeft: `3px solid ${C.gold}`, paddingLeft: "10px", color: C.inkMuted, fontSize: "12.5px", margin: "6px 0" }} dangerouslySetInnerHTML={{ __html: applyInline(txt) }} />
        );
        i++; continue;
      }

      // Table — collect all | lines
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          tableLines.push(lines[i]);
          i++;
        }
        const isSeperator = (l) => /^\|[-: |]+\|$/.test(l.trim());
        const rows = tableLines.filter(l => !isSeperator(l));
        result.push(
          <div key={`table-${i}`} style={{ overflowX: "auto", margin: "8px 0" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px" }}>
              <tbody>
                {rows.map((row, ri) => {
                  const cells = row.trim().replace(/^\||\|$/g, "").split("|");
                  const isHeader = ri === 0;
                  return (
                    <tr key={ri} style={{ background: ri % 2 === 0 ? "rgba(30,58,95,0.03)" : "transparent" }}>
                      {cells.map((cell, ci) => (
                        <td key={ci} style={{ padding: "5px 10px", borderBottom: `1px solid ${C.border}`, fontWeight: isHeader ? "700" : "400", color: isHeader ? C.ink : C.inkMuted, whiteSpace: "nowrap" }}
                          dangerouslySetInnerHTML={{ __html: applyInline(cell.trim()) }} />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // List item
      if (/^[-•*]\s/.test(line)) {
        result.push(<div key={i} style={{ display: "flex", gap: "7px", marginBottom: "3px", alignItems: "flex-start" }}>
          <span style={{ color: C.gold, fontWeight: "800", flexShrink: 0, marginTop: "1px" }}>·</span>
          <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.55" }} dangerouslySetInnerHTML={{ __html: applyInline(line.replace(/^[-•*]\s/, "")) }} />
        </div>);
        i++; continue;
      }

      // Numbered list
      if (/^\d+\.\s/.test(line)) {
        const num = line.match(/^(\d+)\./)[1];
        result.push(<div key={i} style={{ display: "flex", gap: "7px", marginBottom: "4px", alignItems: "flex-start" }}>
          <span style={{ minWidth: "18px", height: "18px", borderRadius: "50%", background: C.accent, color: "#fff", fontSize: "10px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "2px" }}>{num}</span>
          <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.55" }} dangerouslySetInnerHTML={{ __html: applyInline(line.replace(/^\d+\.\s/, "")) }} />
        </div>);
        i++; continue;
      }

      // Empty line
      if (line.trim() === "") { result.push(<div key={i} style={{ height: "6px" }} />); i++; continue; }

      // Normal paragraph
      result.push(<p key={i} style={{ margin: "2px 0", fontSize: "13px", color: C.inkMuted, lineHeight: "1.6" }} dangerouslySetInnerHTML={{ __html: applyInline(line) }} />);
      i++;
    }
    return result;
  };

  const isBusy = loading || oppoLoading;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 100px)", maxWidth: "820px", margin: "0 auto", padding: "0 16px 16px" }}>

      {/* En-tête avec tabs */}
      <div style={{ padding: "16px 0 12px", borderBottom: `1px solid ${C.border}`, marginBottom: "12px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #080B0F 0%, #1E3A5F 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: shadow.pill, flexShrink: 0 }}>
            <IconChat />
          </div>
          <div style={{ flex: 1, minWidth: "120px" }}>
            <div style={{ fontWeight: "700", fontSize: "15px", color: C.ink }}>Conseiller Privé</div>
            <div style={{ fontSize: "11px", color: C.inkSubtle }}>Briefing · Conseil · Opportunités</div>
          </div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
            {[["briefing", "Briefing du jour"], ["chat", "Chat libre"]].map(([panel, label]) => (
              <button key={panel} onClick={() => setActivePanel(panel)}
                style={{ fontSize: "11px", fontWeight: "600", padding: "5px 12px", borderRadius: "20px", border: `1px solid ${activePanel === panel ? C.accent : C.border}`, background: activePanel === panel ? C.accent : "transparent", color: activePanel === panel ? "#fff" : C.inkMuted, cursor: "pointer", transition: "all 0.15s" }}>
                {label}
              </button>
            ))}
          </div>
          {activePanel === "chat" && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "10px", color: C.inkSubtle, fontStyle: "italic" }}>Conservé 24h</span>
              {sessions.length > 0 && (
                <button onClick={() => { if(window.confirm("Effacer tout l'historique ?")) { persistSessions([]); setError(null); } }}
                  style={{ fontSize: "11px", fontWeight: "600", color: C.inkSubtle, background: C.snowDim, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "5px 10px", cursor: "pointer" }}>
                  Tout effacer
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel Briefing du jour (Feature 2) ── */}
      {activePanel === "briefing" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ background: C.cardGradGold, border: `1px solid rgba(230,184,0,0.3)`, borderRadius: "16px", padding: "20px", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div>
                <div style={{ fontWeight: "700", fontSize: "14px", color: C.ink }}>Briefing du {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
                <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>Analyse IA de votre portefeuille · Mis à jour chaque matin</div>
              </div>
              <button onClick={generateBriefing} disabled={briefingLoading}
                style={{ fontSize: "11px", fontWeight: "600", padding: "6px 12px", borderRadius: "10px", border: `1px solid ${C.border}`, background: briefingLoading ? C.snowDim : C.snow, color: briefingLoading ? C.inkSubtle : C.ink, cursor: briefingLoading ? "not-allowed" : "pointer" }}>
                {briefingLoading ? "Génération…" : "Rafraîchir"}
              </button>
            </div>
            {briefingLoading && (
              <div style={{ display: "flex", gap: "5px", alignItems: "center", padding: "20px 0", justifyContent: "center" }}>
                {[0,1,2].map(j => <span key={j} style={{ width: "7px", height: "7px", borderRadius: "50%", background: C.gold, display: "inline-block", animation: `chatDot 1.2s ease-in-out ${j * 0.2}s infinite` }} />)}
              </div>
            )}
            {!briefingLoading && briefing?.content && !briefing?.error && (
              <div style={{ fontSize: "13px", lineHeight: "1.65", color: C.ink }}>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>{formatMessage(briefing.content)}</ul>
              </div>
            )}
            {!briefingLoading && briefing?.error && (
              <div style={{ color: C.red, fontSize: "12.5px" }}>{briefing.content}</div>
            )}
            {!briefingLoading && !briefing && (
              <div style={{ textAlign: "center", color: C.inkSubtle, fontSize: "12.5px", padding: "16px 0" }}>Cliquez sur "Rafraîchir" pour générer le briefing.</div>
            )}
          </div>
          {/* Bouton détection opportunités */}
          <div style={{ background: C.cardGradGreen, border: `1px solid rgba(39,174,96,0.2)`, borderRadius: "16px", padding: "18px 20px" }}>
            <div style={{ fontWeight: "700", fontSize: "13.5px", color: C.ink, marginBottom: "6px" }}>Détection d'opportunités</div>
            <div style={{ fontSize: "12px", color: C.inkSubtle, marginBottom: "14px" }}>Analyse croisée : surexpositions, corrélations cachées, secteurs manquants, position DCA prioritaire.</div>
            <button onClick={() => { detectOpportunities(); setActivePanel("chat"); }} disabled={isBusy}
              style={{ padding: "9px 20px", borderRadius: "12px", border: "none", cursor: isBusy ? "not-allowed" : "pointer", background: isBusy ? C.snowDim : `linear-gradient(135deg, #1E8449 0%, ${C.green} 100%)`, color: isBusy ? C.inkSubtle : "#fff", fontSize: "12px", fontWeight: "700", boxShadow: !isBusy ? "0 4px 16px rgba(39,174,96,0.35)" : "none", transition: "all 0.15s" }}>
              {oppoLoading ? "Analyse en cours…" : "Détecter les opportunités →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Panel Chat libre ── */}
      {activePanel === "chat" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "8px" }}>
            {sessions.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", paddingTop: "20px" }}>
                <div style={{ fontSize: "12.5px", color: C.inkSubtle }}>Suggestions :</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", maxWidth: "600px" }}>
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} onClick={() => sendMessage(s)}
                      style={{ fontSize: "12px", color: C.accent, background: C.paleBlue, border: `1px solid rgba(30,58,95,0.15)`, borderRadius: "20px", padding: "7px 14px", cursor: "pointer", fontWeight: "500" }}>
                      {s}
                    </button>
                  ))}
                </div>
                <button onClick={() => { detectOpportunities(); }} disabled={isBusy}
                  style={{ fontSize: "12px", fontWeight: "700", color: C.green, background: C.greenLight, border: `1px solid rgba(39,174,96,0.25)`, borderRadius: "20px", padding: "8px 18px", cursor: isBusy ? "not-allowed" : "pointer" }}>
                  Détecter les opportunités
                </button>
              </div>
            )}

            {/* Sessions — 1 session = 1 Q&A supprimable */}
            {sessions.map((sess) => (
              <div key={sess.id}
                onMouseEnter={() => setHoveredSession(sess.id)}
                onMouseLeave={() => setHoveredSession(null)}
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

                {/* Message utilisateur + bouton supprimer */}
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "6px" }}>
                  {hoveredSession === sess.id && (
                    <button onClick={() => deleteSession(sess.id)}
                      title="Supprimer cet échange"
                      style={{ width: "20px", height: "20px", borderRadius: "50%", border: "none", background: C.snowDim, color: C.inkSubtle, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, lineHeight: 1 }}>
                      ×
                    </button>
                  )}
                  <div style={{ maxWidth: "78%", padding: "10px 14px", borderRadius: "16px 16px 4px 16px", background: "linear-gradient(135deg, #080B0F 0%, #1E3A5F 100%)", color: "#fff", boxShadow: shadow.card, fontSize: "13.5px", lineHeight: "1.55" }}>
                    {sess.userMsg}
                  </div>
                </div>

                {/* Réponse assistant */}
                {sess.assistantMsg && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "linear-gradient(135deg, #080B0F 0%, #1E3A5F 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0, marginTop: "2px" }}>
                      <IconChat />
                    </div>
                    <div style={{ maxWidth: "78%" }}>
                      <div style={{ position: "relative" }}>
                        <div style={{ padding: "10px 14px", borderRadius: "16px 16px 16px 4px", background: C.snow, color: C.ink, boxShadow: shadow.card, fontSize: "13.5px", lineHeight: "1.55", border: `1px solid ${C.border}` }}>
                          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>{formatMessage(sess.assistantMsg)}</ul>
                        </div>
                        <button onClick={() => navigator.clipboard?.writeText(sess.assistantMsg)} title="Copier la réponse"
                          style={{ position: "absolute", top: "6px", right: "6px", width: "22px", height: "22px", borderRadius: "6px", border: `1px solid ${C.border}`, background: C.bg, color: C.inkMuted, fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: hoveredSession === sess.id ? 1 : 0, transition: "opacity 0.15s" }}>
                          ⎘
                        </button>
                      </div>
                      {/* Chips termes techniques */}
                      {sess.terms && sess.terms.length > 0 && (
                        <div style={{ marginTop: "6px" }}>
                          <button onClick={() => setExpandedTerms(expandedTerms === sess.id ? null : sess.id)}
                            style={{ fontSize: "10px", fontWeight: "700", color: C.accent, background: C.paleBlue, border: `1px solid rgba(30,58,95,0.15)`, borderRadius: "12px", padding: "3px 10px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            📚 {sess.terms.length} terme{sess.terms.length > 1 ? "s" : ""} · {sess.terms.map(t => t.term).join(", ")}
                          </button>
                          {expandedTerms === sess.id && (
                            <div style={{ marginTop: "6px", background: C.snow, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                              {sess.terms.map(({ term, def }) => (
                                <div key={term}>
                                  <span style={{ fontWeight: "700", fontSize: "11.5px", color: C.accent }}>{term}</span>
                                  <span style={{ fontSize: "11.5px", color: C.inkMuted }}> — {def}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px", paddingLeft: "2px" }}>
                        {new Date(sess.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isBusy && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "linear-gradient(135deg, #080B0F 0%, #1E3A5F 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}><IconChat /></div>
                <div style={{ padding: "10px 16px", background: C.snow, borderRadius: "16px 16px 16px 4px", border: `1px solid ${C.border}`, boxShadow: shadow.card, display: "flex", gap: "5px", alignItems: "center" }}>
                  {[0,1,2].map(j => <span key={j} style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.accent, display: "inline-block", animation: `chatDot 1.2s ease-in-out ${j * 0.2}s infinite` }} />)}
                </div>
              </div>
            )}

            {error && <div style={{ padding: "10px 14px", background: C.redLight, border: `1px solid rgba(231,76,60,0.25)`, borderRadius: "12px", color: C.red, fontSize: "12.5px" }}>{error}</div>}
            <div ref={bottomRef} />
          </div>

          <div style={{ flexShrink: 0, paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Posez une question sur votre portefeuille…" rows={2}
                style={{ flex: 1, padding: "10px 14px", borderRadius: "14px", border: `1px solid ${C.border}`, background: C.snow, fontSize: "13.5px", color: C.ink, resize: "none", fontFamily: "inherit", outline: "none", boxShadow: shadow.card, lineHeight: "1.5" }} />
              <button onClick={() => sendMessage()} disabled={!input.trim() || isBusy}
                style={{ width: "42px", height: "42px", borderRadius: "12px", border: "none", cursor: input.trim() && !isBusy ? "pointer" : "not-allowed", background: input.trim() && !isBusy ? "linear-gradient(135deg, #080B0F 0%, #1E3A5F 100%)" : C.snowDim, color: input.trim() && !isBusy ? "#fff" : C.inkSubtle, fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: input.trim() && !isBusy ? shadow.pill : "none", transition: "all 0.15s" }}>
                ↑
              </button>
            </div>
            <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "5px", textAlign: "center" }}>Entrée pour envoyer · Shift+Entrée pour nouvelle ligne</div>
          </div>
        </>
      )}

      <style>{`@keyframes chatDot { 0%,80%,100%{opacity:0.3;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  );
}

function BourseAnalyzerInner({ userName, onLogout }) {
  const isMobile = useIsMobile();
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem(ONBOARDING_KEY); } catch { return false; }
  });
  const [mobileNavOpen, setMobileNavOpen]       = useState(false);
  const [account, setAccount]                   = useState(() => load("bourse_account", "PEA"));
  const switchAccount = (acc) => { setAccount(acc); save("bourse_account", acc); setActiveTab(TABS.PORTFOLIO); };
  const [activeTab, setActiveTab]               = useState(() => load("bourse_active_tab", TABS.PORTFOLIO));
  const changeTab = (tab) => { setActiveTab(tab); save("bourse_active_tab", tab); };
  const [profil, setProfil]                     = useState(() => load("bourse_profil", DEFAULT_PROFIL));
  const [darkMode, setDarkMode]                 = useState(() => load("bourse_dark", false));
  const [compact, setCompact]                   = useState(() => load("bourse_compact", false));
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  const [refreshing, setRefreshing]             = useState(false);
  const [lastRefresh, setLastRefresh]           = useState(null); // timestamp ms
  const [refreshAgo, setRefreshAgo]             = useState("");
  const [updateAvailable, setUpdateAvailable]   = useState(false);
  const [marketScores, setMarketScores]         = useState(() => load("bourse_market_scores", null));
  const [marketScoringUi, setMarketScoringUi]   = useState(() => load("bourse_market_scores", null)?.length > 0 ? UI.RESULT : UI.IDLE);
  const [hiddenValues, setHiddenValues]         = useState(() => load("bourse_hidden", false));
  const toggleDark    = () => setDarkMode(d => { save("bourse_dark", !d); return !d; });
  const toggleCompact = () => setCompact(c => { save("bourse_compact", !c); return !c; });
  const toggleHidden  = () => setHiddenValues(h => { save("bourse_hidden", !h); return !h; });
  const [localUserName, setLocalUserName]       = useState(userName || "");
  const [editingName, setEditingName]           = useState(false);
  const [avatarEmoji, setAvatarEmoji]           = useState(() => load("bourse_avatar_emoji", ""));
  const [emojiPickerOpen, setEmojiPickerOpen]   = useState(false);
  const [emojiCat, setEmojiCat]                 = useState(0);
  const AVATAR_EMOJI_CATS = [
    { icon: "😊", label: "Visages", emojis: ["😊","😎","🤩","😏","🥸","🤓","😇","🥳","😈","👻","💀","🤖","👽","🎭"] },
    { icon: "👩", label: "Femmes",  emojis: ["👸","🧙‍♀️","🦸‍♀️","🧝‍♀️","🧜‍♀️","🧚‍♀️","🧛‍♀️","🧟‍♀️","💃","👩‍💻","👩‍🚀","🧑‍🎤","🧑‍🎨","🧕"] },
    { icon: "🧙", label: "Hommes",  emojis: ["🧙","🦸","🥷","🧑‍💻","👨‍🚀","🧑‍🎤","🧑‍🎨","🧝","🧜","🧚","🧛","🧟","🕵️","🤴"] },
    { icon: "🦁", label: "Animaux", emojis: ["🦁","🐯","🦊","🐺","🦅","🦉","🐻","🐼","🦄","🐉","🦋","🐸","🦈","🦊","🐧","🦩","🐺","🦝","🦥","🐙"] },
    { icon: "⚡", label: "Nature",  emojis: ["🌟","⚡","🔥","❄️","🌊","🌪️","🌈","🌙","☀️","🌸","🌺","🌻","🌷","🍀","🌴","🍄","🌍","🏔️","🌌","🪐"] },
    { icon: "📈", label: "Bourse",  emojis: ["📈","📊","💹","💰","💎","🏆","🎯","👑","🧠","💪","🔮","🃏","🎲","🔑","💡","⚙️","🧬","🧪","🛡️","⚔️"] },
    { icon: "🚀", label: "Divers",  emojis: ["🚀","🛸","👾","🤖","🎸","🎹","🎺","🎵","🎪","🏹","🗡️","🌐","🔭","🎬","📸","🏋️","🧗","🏄‍♀️","🧘"] },
  ];
  const pickEmoji = (e) => { setAvatarEmoji(e); save("bourse_avatar_emoji", e); setEmojiPickerOpen(false); };


  // Ferme les popups emoji/compte au clic hors de la zone
  useEffect(() => {
    if (!emojiPickerOpen && !editingName) return;
    const close = (e) => {
      if (!e.target.closest("[data-emoji-picker]")) {
        setEmojiPickerOpen(false);
        setEditingName(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [emojiPickerOpen, editingName]);

  // Écoute les mises à jour du portefeuille → re-render de tous les onglets
  useEffect(() => {
    const handler = () => setPortfolioVersion(v => v + 1);
    window.addEventListener("portfolioUpdated", handler);
    return () => window.removeEventListener("portfolioUpdated", handler);
  }, []);

  // Mise à jour de l'affichage "il y a X min"
  useEffect(() => {
    if (!lastRefresh) return;
    const update = () => {
      const diff = Math.round((Date.now() - lastRefresh) / 60000);
      setRefreshAgo(diff < 1 ? "à l'instant" : `il y a ${diff} min`);
    };
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [lastRefresh]);

  // Vérifie si une nouvelle version est déployée (hash du bundle JS)
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const getCurrentHash = () => {
      const s = document.querySelector('script[src*="/static/js/main."]');
      return s ? s.src : null;
    };
    const check = async () => {
      try {
        const res = await fetch(window.location.origin + "/?_v=" + Date.now(), { cache: "no-store" });
        const html = await res.text();
        const match = html.match(/\/static\/js\/main\.[a-f0-9]+\.js/);
        if (!match) return;
        const remoteHash = match[0];
        const localSrc = getCurrentHash();
        if (localSrc && !localSrc.includes(remoteHash.split(".")[2])) {
          setUpdateAvailable(true);
        }
      } catch {}
    };
    check();
    const t = setInterval(check, 5 * 60 * 1000); // toutes les 5 min
    return () => clearInterval(t);
  }, []);

  // Actualisation générale : rafraîchit les cours + resync tous les onglets
  const refreshAll = useCallback(() => {
    if (updateAvailable) { window.location.reload(); return; }
    setRefreshing(true);
    setLastRefresh(Date.now());
    window.dispatchEvent(new CustomEvent("refreshCoursAll"));
    window.dispatchEvent(new CustomEvent("portfolioUpdated"));
    setTimeout(() => setRefreshing(false), 3000);
  }, [updateAvailable]);

  // ── Analyse IA de toutes les positions (scoring marché) ──────────────────────
  const runMarketScoring = useCallback(async (positions) => {
    if (!positions || positions.length === 0) return;
    setMarketScoringUi(UI.LOADING);
    try {
      // Résoudre les tickers depuis le cache
      const tickerCache = (() => { try { return JSON.parse(localStorage.getItem(TICKER_CACHE_KEY) || "{}"); } catch { return {}; } })();

      // Fetcher Yahoo analystes + Google News RSS pour chaque position en parallèle
      const externalData = await Promise.all(positions.map(async (pos) => {
        const ticker = pos.ticker || (pos.isin && tickerCache[pos.isin]) || null;
        let analysts = null;
        let news = [];
        await Promise.all([
          ticker
            ? fetchYahooAnalysts(ticker).then(d => { analysts = d; }).catch(() => {})
            : Promise.resolve(),
          fetchGoogleNewsRSS(`"${pos.nom}" bourse action`).then(d => { news = d; }).catch(() => {}),
        ]);
        return { pos, analysts, news };
      }));

      // Construire le bloc de contexte par position
      const contextBlocks = externalData
        .map(({ pos, analysts, news }) => formatExternalContext(pos.nom, analysts, news))
        .join("\n\n");

      const posListe = positions.map(p =>
        `- ${p.nom}${p.isin ? ` (ISIN: ${p.isin})` : ""}${p.ticker ? ` [${p.ticker}]` : ""}, PRU ${p.pru}€, qté ${p.quantite}`
      ).join("\n");

      const userMsg = `Portefeuille PEA à analyser (DCA long terme, 10 ans) :\n${posListe}\n\nDONNÉES MARCHÉ EN TEMPS RÉEL :\n${contextBlocks}\n\nJSON uniquement.`;

      const data = await enqueueApi(() => callClaude(MARKET_SCORING_PROMPT, userMsg, false));
      const scores = data?.classement;
      if (scores && scores.length > 0) {
        save("bourse_market_scores", scores);
        const hist = load("bourse_signal_history", []);
        hist.unshift({ date: new Date().toISOString(), scores });
        save("bourse_signal_history", hist.slice(0, 30));
        setMarketScores(scores);
        setMarketScoringUi(UI.RESULT);
      } else {
        setMarketScoringUi(UI.ERROR);
      }
    } catch {
      setMarketScoringUi(UI.ERROR);
    }
  }, []);

  // Écoute l'événement "analyseAll" déclenché depuis PortfolioTab quand une position est sauvée
  useEffect(() => {
    const handler = (e) => {
      const positions = e.detail?.positions;
      if (positions) runMarketScoring(positions);
    };
    window.addEventListener("runMarketScoring", handler);
    return () => window.removeEventListener("runMarketScoring", handler);
  }, [runMarketScoring]);

  // Raccourcis clavier : R = actualiser · 1-7 = naviguer entre les onglets
  useEffect(() => {
    const tabKeys = [TABS.PORTFOLIO, TABS.MARCHE, TABS.DCA, TABS.PROJECTION, TABS.HISTORIQUE, TABS.OPERATIONS, TABS.PROFIL];
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.key === "r" || e.key === "R") { refreshAll(); return; }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= tabKeys.length) changeTab(tabKeys[num - 1]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refreshAll]);

  const tabLabel = NAV_GROUPS.flatMap(g => g.items).find(i => i.key === activeTab)?.label || "";

  return (
    <div className={compact ? "ba-compact" : ""} style={{ display: "flex", minHeight: "100vh", background: "linear-gradient(160deg, #E6EFF8 0%, #E2EBF6 35%, #E5F1EC 65%, #EAE5F6 100%)", color: C.ink, fontFamily: "'Roboto', 'Inter', system-ui, sans-serif", filter: darkMode ? "invert(1) hue-rotate(200deg) saturate(0.9)" : "none" }}>

      {/* Sidebar */}
      <Sidebar
        active={activeTab} onChange={changeTab}
        portfolioVersion={portfolioVersion}
        refreshAll={refreshAll} refreshing={refreshing} refreshAgo={refreshAgo}
        toggleDark={toggleDark} toggleCompact={toggleCompact}
        darkMode={darkMode} compact={compact}
        hidden={hiddenValues}
        mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)}
        account={account} onSwitchAccount={switchAccount}
      />

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Top bar */}
        <div className="ba-topbar" style={{ height: "52px", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.75)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "0 16px" : "0 28px", position: "sticky", top: 0, zIndex: 10, flexShrink: 0, gap: "12px" }}>

          {/* ── MOBILE : hamburger | logo+onglet | avatar ── */}
          {isMobile ? (
            <>
              {/* Gauche : hamburger */}
              <button onClick={() => setMobileNavOpen(true)} title="Menu"
                style={{ width: "40px", height: "40px", background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "5px", padding: 0, flexShrink: 0 }}>
                <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
                <span style={{ display: "block", width: "20px", height: "1.5px", background: C.ink, borderRadius: "2px" }} />
              </button>
              {/* Centre : logo + nom onglet */}
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minWidth: 0 }}>
                <AppLogo size={22} />
                <span style={{ fontSize: "13px", fontWeight: "700", color: C.ink, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tabLabel}</span>
              </div>
              {/* Droite : avatar seul */}
              <div data-emoji-picker style={{ position: "relative", flexShrink: 0 }}>
                <div onClick={() => setEmojiPickerOpen(o => !o)} title="Compte"
                  style={{ width: "34px", height: "34px", borderRadius: "50%", background: C.sb, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", userSelect: "none" }}>
                  {avatarEmoji
                    ? <span style={{ fontSize: "16px", lineHeight: 1 }}>{avatarEmoji}</span>
                    : <span style={{ color: "#C1E8FF", fontWeight: "700", fontSize: "12px" }}>{(localUserName || "P")[0].toUpperCase()}</span>}
                </div>
                {emojiPickerOpen && (
                  <div style={{ position: "absolute", top: "44px", right: 0, background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", boxShadow: "0 8px 28px rgba(0,0,0,0.16)", zIndex: 9999, width: "240px", overflow: "hidden" }}>
                    {/* Nom + déconnexion */}
                    <div style={{ padding: "12px 12px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: "8px" }}>
                      <input
                        value={localUserName}
                        onChange={e => setLocalUserName(e.target.value)}
                        onBlur={() => {
                          const name = localUserName.trim() || "Utilisateur";
                          setLocalUserName(name);
                          try { const s = JSON.parse(localStorage.getItem("bourse_session") || "{}"); localStorage.setItem("bourse_session", JSON.stringify({ ...s, name })); } catch {}
                        }}
                        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                        placeholder="Votre prénom ou pseudo"
                        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 10px", fontSize: "13px", fontFamily: "Inter,sans-serif", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }}
                      />
                      <button onClick={onLogout}
                        style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "7px", color: C.red, fontSize: "11px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer" }}>
                        🚪 Se déconnecter
                      </button>
                    </div>
                    {/* Sélecteur emoji */}
                    <div style={{ display: "flex", height: "200px" }}>
                      <div style={{ width: "34px", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "6px", gap: "2px", flexShrink: 0, overflowY: "auto" }}>
                        {AVATAR_EMOJI_CATS.map((cat, i) => (
                          <button key={i} onClick={() => setEmojiCat(i)} title={cat.label}
                            style={{ width: "26px", height: "26px", borderRadius: "7px", border: "none", background: emojiCat === i ? C.navyLight : "transparent", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {cat.icon}
                          </button>
                        ))}
                      </div>
                      <div style={{ flex: 1, overflowY: "auto", padding: "8px", display: "flex", flexWrap: "wrap", gap: "4px", alignContent: "flex-start" }}>
                        {AVATAR_EMOJI_CATS[emojiCat].emojis.map(e => (
                          <button key={e} onClick={() => { pickEmoji(e); setEmojiPickerOpen(false); }}
                            style={{ width: "28px", height: "28px", borderRadius: "7px", border: avatarEmoji === e ? `2px solid ${C.navy}` : `1px solid ${C.border}`, background: avatarEmoji === e ? C.navyLight : C.snowOff, cursor: "pointer", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                    {avatarEmoji && (
                      <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px" }}>
                        <button onClick={() => { pickEmoji(""); setEmojiPickerOpen(false); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "4px 8px", color: C.inkSubtle, fontSize: "10px", fontFamily: "Inter,sans-serif", cursor: "pointer" }}>✕ Retirer l'emoji</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* ── DESKTOP : titre page | contrôles + compte ── */}
              {/* LEFT */}
              <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                <span style={{ fontSize: "16px", fontWeight: "700", color: C.ink, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tabLabel}</span>
              </div>
              {/* RIGHT */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                {refreshAgo && <span style={{ fontSize: "10px", color: C.inkSubtle, fontWeight: "400" }}>{refreshAgo}</span>}
                <button onClick={refreshAll} disabled={refreshing} title={updateAvailable ? "Nouvelle version disponible — cliquer pour mettre à jour" : "Actualiser"}
                  style={{ position: "relative", width: "34px", height: "34px", background: updateAvailable ? C.green + "18" : "transparent", border: `1px solid ${updateAvailable ? C.green : C.border}`, borderRadius: "10px", cursor: refreshing ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", fontSize: "16px", color: updateAvailable ? C.green : C.inkMuted }}>
                  {refreshing ? <ThinkingSpinner size={16} color={C.green} /> : "↻"}
                  {updateAvailable && !refreshing && <span style={{ position: "absolute", top: "4px", right: "4px", width: "7px", height: "7px", borderRadius: "50%", background: C.green, boxShadow: `0 0 0 2px ${C.bg}` }} />}
                </button>
                <button onClick={toggleHidden} title={hiddenValues ? "Afficher" : "Masquer"}
                  style={{ width: "34px", height: "34px", background: hiddenValues ? C.navyLight : "transparent", border: `1px solid ${C.border}`, borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", transition: "all 0.15s" }}>
                  {hiddenValues ? "🙈" : "👁"}
                </button>
                <div data-emoji-picker style={{ display: "flex", alignItems: "center", gap: "8px", paddingLeft: "12px", borderLeft: `1px solid ${C.border}`, position: "relative" }}>
                  {/* Bouton emoji */}
                  <div onClick={() => setEmojiPickerOpen(o => !o)} title="Changer l'emoji"
                    style={{ width: "32px", height: "32px", borderRadius: "50%", background: C.sb, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", userSelect: "none" }}>
                    {avatarEmoji
                      ? <span style={{ fontSize: "16px", lineHeight: 1 }}>{avatarEmoji}</span>
                      : <span style={{ color: "#C1E8FF", fontWeight: "700", fontSize: "12px" }}>{(localUserName || "P")[0].toUpperCase()}</span>}
                  </div>
                  {/* Popup emoji */}
                  {emojiPickerOpen && (
                    <div style={{ position: "absolute", top: "44px", right: 0, background: C.snow, border: `1px solid ${C.border}`, borderRadius: "14px", boxShadow: "0 8px 28px rgba(0,0,0,0.13)", zIndex: 9999, width: "220px", overflow: "hidden" }}>
                      <div style={{ display: "flex", height: "210px" }}>
                        <div style={{ width: "34px", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "6px", gap: "2px", flexShrink: 0, overflowY: "auto" }}>
                          {AVATAR_EMOJI_CATS.map((cat, i) => (
                            <button key={i} onClick={() => setEmojiCat(i)} title={cat.label}
                              style={{ width: "26px", height: "26px", borderRadius: "7px", border: "none", background: emojiCat === i ? C.navyLight : "transparent", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {cat.icon}
                            </button>
                          ))}
                        </div>
                        <div style={{ flex: 1, overflowY: "auto", padding: "8px", display: "flex", flexWrap: "wrap", gap: "4px", alignContent: "flex-start" }}>
                          {AVATAR_EMOJI_CATS[emojiCat].emojis.map(e => (
                            <button key={e} onClick={() => { pickEmoji(e); setEmojiPickerOpen(false); }}
                              style={{ width: "28px", height: "28px", borderRadius: "7px", border: avatarEmoji === e ? `2px solid ${C.navy}` : `1px solid ${C.border}`, background: avatarEmoji === e ? C.navyLight : C.snowOff, cursor: "pointer", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {e}
                            </button>
                          ))}
                        </div>
                      </div>
                      {avatarEmoji && (
                        <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 10px" }}>
                          <button onClick={() => { pickEmoji(""); setEmojiPickerOpen(false); }} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "4px 8px", color: C.inkSubtle, fontSize: "10px", fontFamily: "Inter,sans-serif", cursor: "pointer" }}>✕ Retirer l'emoji</button>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Nom + déconnexion */}
                  <div style={{ position: "relative" }}>
                    <div onClick={() => setEditingName(o => !o)} style={{ lineHeight: 1, cursor: "pointer" }}>
                      <div style={{ fontSize: "12px", fontWeight: "600", color: C.ink }}>{localUserName || "Mon PEA"}</div>
                      <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "3px" }}>▾ Compte</div>
                    </div>
                    {editingName && (
                      <div style={{ position: "absolute", top: "36px", right: 0, background: C.snow, border: `1px solid ${C.border}`, borderRadius: "12px", boxShadow: "0 8px 28px rgba(0,0,0,0.13)", zIndex: 9999, width: "200px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                        <input
                          autoFocus
                          value={localUserName}
                          onChange={e => setLocalUserName(e.target.value)}
                          onBlur={() => {
                            const name = localUserName.trim() || "Utilisateur";
                            setLocalUserName(name);
                            try { const s = JSON.parse(localStorage.getItem("bourse_session") || "{}"); localStorage.setItem("bourse_session", JSON.stringify({ ...s, name })); } catch {}
                          }}
                          onKeyDown={e => { if (e.key === "Enter") { e.target.blur(); setEditingName(false); } if (e.key === "Escape") setEditingName(false); }}
                          placeholder="Votre prénom ou pseudo"
                          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 10px", fontSize: "12px", fontFamily: "Inter,sans-serif", color: C.ink, background: C.snowOff, outline: "none", boxSizing: "border-box" }}
                        />
                        <button onClick={onLogout}
                          style={{ background: C.redLight, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: "8px", padding: "7px", color: C.red, fontSize: "11px", fontFamily: "Inter,sans-serif", fontWeight: "700", cursor: "pointer" }}>
                          🚪 Se déconnecter
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="ba-content" style={{ flex: 1, overflowY: "auto", padding: "32px 36px", position: "relative" }}>
          <div className="ba-content-inner" style={{ position: "relative", maxWidth: "1200px" }}>
          {/* Bannière sans clé Claude */}
          {!hasClaudeKey() && (
            <div style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.04))", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "18px", padding: "14px 20px", marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "18px" }}>🔑</span>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: "#92400E" }}>Fonctionnalités IA désactivées</div>
                  <div style={{ fontSize: "11px", color: "#A16207", marginTop: "1px" }}>Ajoutez une clé Claude pour activer l'analyse IA, le scoring de marché et l'assistant.</div>
                </div>
              </div>
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
                style={{ fontSize: "11px", fontWeight: "700", color: "#92400E", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: "8px", padding: "6px 14px", textDecoration: "none", whiteSpace: "nowrap" }}>
                Obtenir une clé gratuite →
              </a>
            </div>
          )}
            {activeTab === TABS.PORTFOLIO  && <><DashboardBar onTabChange={changeTab} hidden={hiddenValues} profil={profil} account={account} /><PortfolioTab profil={profil} marketScores={marketScores} marketScoringUi={marketScoringUi} onRunScoring={runMarketScoring} account={account} /></>}
{activeTab === TABS.MARCHE     && <MarcheTab profil={profil} portfolioVersion={portfolioVersion} account={account} marketScores={marketScores} marketScoringUi={marketScoringUi} onRunScoring={runMarketScoring} />}
            {activeTab === TABS.PROJECTION && <ProjectionTab profil={profil} account={account} />}
            {activeTab === TABS.HISTORIQUE && <HistoriqueTab portfolioVersion={portfolioVersion} account={account} />}
            {activeTab === TABS.DCA        && <StratégieDCATab profil={profil} portfolioVersion={portfolioVersion} marketScores={marketScores} marketScoringUi={marketScoringUi} onRunScoring={runMarketScoring} onSaveProfil={p => { setProfil(p); save("bourse_profil", p); }} account={account} />}
            {activeTab === TABS.OPERATIONS && <OperationsTab account={account} />}
            {activeTab === TABS.CHAT       && <ChatTab profil={profil} account={account} portfolioVersion={portfolioVersion} marketScores={marketScores} />}
            {activeTab === TABS.AUTOPILOT  && <AutopilotIA account={account} profil={profil} hidden={hiddenValues} />}
            {activeTab === TABS.PROFIL     && <ProfilTab profil={profil} onChange={setProfil} />}
            {activeTab === TABS.SETTINGS   && <ParametresTab />}
          </div>
        </div>
      </div>

      {/* ── Assistant IA flottant ── */}
      <AIAssistant account={account} profil={profil} />

      {/* ── Bannière PWA iOS ── */}
      <PWAInstallBanner />

      {/* ── Onboarding Guide ── */}
      {showOnboarding && <OnboardingGuide onDone={() => setShowOnboarding(false)} />}

      {/* ── Bottom navigation bar (mobile only) ── */}
      <nav className="ba-bottom-nav">
        {NAV_GROUPS.flatMap(g => g.items).map(({ key, icon }) => {
          const SHORT = { portfolio: "Positions", marche: "Marchés", dca: "DCA", projection: "Projec.", historique: "Répart.", operations: "Opérat.", chat: "Conseil", profil: "Config." };
          const isActive = activeTab === key;
          return (
            <button key={key} onClick={() => changeTab(key)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", background: "none", border: "none", cursor: "pointer", padding: "6px 2px", position: "relative" }}>
              <span style={{ width: "40px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: isActive ? "linear-gradient(135deg, #080B0F 0%, #142641 40%, #1E3A5F 75%, #2D5986 100%)" : "transparent", color: isActive ? "#fff" : C.inkSubtle, fontSize: "14px", transition: "all 0.18s", boxShadow: isActive ? "0 3px 12px rgba(30,58,95,0.45)" : "none" }}>{icon}</span>
              <span style={{ fontSize: "9px", fontWeight: isActive ? "500" : "400", color: isActive ? C.accent : C.inkSubtle, fontFamily: "'Roboto', sans-serif" }}>{SHORT[key] || key}</span>
            </button>
          );
        })}
      </nav>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');

        * { box-sizing: border-box; }
        html, body { margin: 0; background: linear-gradient(160deg, #E6EFF8 0%, #E2EBF6 35%, #E5F1EC 65%, #EAE5F6 100%); background-attachment: fixed; min-height: 100vh; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

        /* ── Animations ── */
        [style*="invert(1)"] svg, [style*="invert(1)"] canvas { filter: invert(1) hue-rotate(200deg) saturate(0.9); }
        @keyframes fadeIn    { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes tabFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse     { 0%,100% { opacity: 0.3; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }
        .ba-tab-accent { animation: tabFadeIn 0.4s ease; }
        @keyframes spin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ba-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes loadingBounce { 0%,80%,100% { transform: scale(0.5); opacity: 0.35; } 40% { transform: scale(1); opacity: 1; } }
        @keyframes vendreAlarm { 0%,100% { opacity: 1; box-shadow: 0 0 14px rgba(220,38,38,0.45); } 50% { opacity: 0.7; box-shadow: 0 0 28px rgba(220,38,38,0.65); } }
        @keyframes flashGreen { 0% { background: rgba(5,150,105,0.1); } 100% { background: transparent; } }
        @keyframes flashRed   { 0% { background: rgba(220,38,38,0.08); } 100% { background: transparent; } }
        @keyframes slideInLeft { from { transform: translateX(-6px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

        /* ── Sidebar ── */
        .ba-sidebar-item:hover:not(.ba-sidebar-item-active) { background: rgba(30,58,95,0.06) !important; color: ${C.ink} !important; border-radius: 12px; }
        .ba-sidebar-item-active { box-shadow: 0 4px 16px rgba(30,58,95,0.30) !important; border-radius: 12px !important; }

        /* ── Inputs ── */
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input::placeholder { color: ${C.inkSubtle}; }
        input:focus, select:focus, textarea:focus { outline: none; border-color: ${C.accent} !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.1) !important; transition: all 0.15s ease; }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(15,23,42,0.1); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(15,23,42,0.18); }

        /* ── Scrollbar sidebar ── */
        .ba-sidebar-nav::-webkit-scrollbar-thumb { background: rgba(30,58,95,0.12); }
        .ba-sidebar-nav::-webkit-scrollbar-thumb:hover { background: rgba(30,58,95,0.25); }

        /* ── Pill buttons ── */
        .ba-btn-pill { background: ${C.accent}; color: #fff; border: none; border-radius: 50px; padding: 9px 22px; font-size: 12px; font-family: 'Roboto', inherit; font-weight: 600; cursor: pointer; box-shadow: ${shadow.pill}; transition: all 0.2s ease; white-space: nowrap; letter-spacing: 0.03em; }
        .ba-btn-pill:hover { background: #2D5986; box-shadow: 0 6px 20px rgba(30,58,95,0.40); transform: translateY(-2px); }

        /* ── Card hover ── */
        .ba-card-hover { transition: box-shadow 0.22s ease, transform 0.22s ease; }
        .ba-card-hover:hover { box-shadow: ${shadow.hover}; transform: translateY(-3px); }

        /* ── Densité globale ── */
        .ba-content-inner { zoom: 0.94; }

        /* ── Mode compact ── */
        .ba-compact > *:not(:first-child) { zoom: 0.93; }

        /* ── Toolbar status ── */
        .ba-toolbar-status { font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; }

        /* ── Sidebar group labels ── */
        .ba-sidebar-group-label { font-size: 9px; font-weight: 700; color: ${C.inkSubtle}; letter-spacing: 1.2px; text-transform: uppercase; padding: 0 10px; margin-bottom: 4px; }

        /* ── Tab nav — horizontal scroll on narrow screens ── */
        @media (max-width: 1000px) {
          .ba-tabnav { overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
          .ba-tabnav::-webkit-scrollbar { display: none; }
          .ba-tabnav button { flex: 0 0 auto; font-size: 11px; padding: 9px 10px !important; }
        }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          html { font-size: 16px; }
          body { font-size: 16px; }
          .ba-sidebar { display: none !important; }
          .ba-content { padding: 16px 14px 24px 14px !important; }
          .ba-content-inner { zoom: 1; }
          .ba-topbar { height: 54px !important; padding: 0 14px !important; }
          .ba-g4 { grid-template-columns: repeat(2, 1fr) !important; }
          .ba-tbl-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch; border-radius: 10px; }
          .ba-card-body { padding: 14px !important; }
          input, select, textarea { font-size: 16px !important; border-radius: 10px !important; }
          .ba-sidebar-item { min-height: 48px !important; }

          /* Toolbar portfolio */
          .ba-toolbar { gap: 6px !important; margin-bottom: 6px !important; }
          .ba-toolbar > button { padding: 8px 10px !important; font-size: 11px !important; border-radius: 8px !important; }
          .ba-toolbar-status { width: 100%; order: 99; font-size: 10px; color: ${C.inkSubtle}; padding: 2px 0; }

          /* Grilles PerformanceGlobale */
          .ba-perf-kpi { grid-template-columns: repeat(2, 1fr) !important; }
          .ba-perf-breakdown { grid-template-columns: repeat(2, 1fr) !important; }

          /* Grille dashboard cards */
          .ba-dashboard-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }

        /* ── Bottom navigation — masquée (remplacée par le drawer hamburger) ── */
        .ba-bottom-nav { display: none !important; }

        /* ── Notch / Dynamic Island — padding top ── */
        @supports (padding-top: env(safe-area-inset-top)) {
          .ba-topbar {
            padding-top: env(safe-area-inset-top, 0px) !important;
            height: calc(54px + env(safe-area-inset-top, 0px)) !important;
          }
        }

        /* ── Petit écran ── */
        @media (max-width: 480px) {
          .ba-g4 { grid-template-columns: repeat(2, 1fr) !important; }
          .ba-content { padding: 12px 12px 80px 12px !important; }
          .ba-perf-kpi { grid-template-columns: repeat(2, 1fr) !important; }
          .ba-perf-breakdown { grid-template-columns: repeat(2, 1fr) !important; }
        }

        /* ── Export PDF ── */
        @media print {
          body { background: #fff !important; }
          .ba-sidebar { display: none !important; }
          .ba-compact > *:not(:first-child) { zoom: 1; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

// ─── Auth Page (Supabase) ────────────────────────────────────────────────────
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
      _syncUserId = user.id;
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
        _syncUserId = data.user.id;
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
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
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

export default function BourseAnalyzer() {
  const [state, setState] = useState("loading"); // "loading" | "auth" | "app"
  const [userName, setUserName] = useState("");

  useEffect(() => {
    if (!supabase) {
      // Mode sans Supabase → localStorage session uniquement
      try {
        const s = JSON.parse(localStorage.getItem("bourse_session") || "null");
        if (s?.name) { setUserName(s.name); setState("app"); }
        else setState("auth");
      } catch { setState("auth"); }
      return;
    }

    // Récupérer la session Supabase active
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        _syncUserId = session.user.id;
        const name = session.user.user_metadata?.display_name || session.user.email?.split("@")[0] || "Utilisateur";
        setUserName(name);
        await pullFromCloud(session.user.id);
        setState("app");
      } else {
        // Vérifier session locale (connexion sans compte)
        try {
          const s = JSON.parse(localStorage.getItem("bourse_session") || "null");
          if (s?.name && !s.uid) { setUserName(s.name); setState("app"); }
          else setState("auth");
        } catch { setState("auth"); }
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        _syncUserId = null;
        setState("auth");
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        _syncUserId = session.user.id;
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSession = (name) => {
    setUserName(name);
    setState("app");
  };

  const handleLogout = async () => {
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) await supabase.auth.signOut();
    }
    localStorage.removeItem("bourse_session");
    _syncUserId = null;
    setState("auth");
  };

  if (state === "loading") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #021024 0%, #052659 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <AppLogo size={48} />
        <div style={{ marginTop: "20px", fontSize: "13px", color: "rgba(193,232,255,0.5)", fontFamily: "Inter,sans-serif" }}>Chargement…</div>
      </div>
    </div>
  );

  if (state === "auth") return <AuthPage onSession={handleSession} />;
  return <MobileProvider><BourseAnalyzerInner userName={userName} onLogout={handleLogout} /></MobileProvider>;
}
