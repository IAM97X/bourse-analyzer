// Données de démonstration — portefeuille fictif réaliste

const today = new Date();
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const isoAgo  = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); d.setHours(9, 18, 0, 0); return d.toISOString(); };

// PEA : 3 lignes  |  CTO : 4 lignes
export const DEMO_POSITIONS = [
  // PEA
  { id: "demo_1", nom: "Amundi MSCI World",      ticker: "CW8.PA",   isin: "LU1681043599", pru: 380, quantite: 30, dernierCours: 432, compte: "PEA" },
  { id: "demo_2", nom: "Amundi PEA Nasdaq-100",  ticker: "PANX.PA",  isin: "FR0013412269", pru: 42,  quantite: 80, dernierCours: 51,  compte: "PEA" },
  { id: "demo_3", nom: "TotalEnergies",           ticker: "TTE.PA",   isin: "FR0000120271", pru: 54,  quantite: 50, dernierCours: 61,  compte: "PEA" },
  // CTO
  { id: "demo_4", nom: "Apple Inc.",              ticker: "AAPL",     isin: "US0378331005", pru: 155, quantite: 10, dernierCours: 189, compte: "CTO" },
  { id: "demo_5", nom: "NVIDIA Corp.",            ticker: "NVDA",     isin: "US67066G1040", pru: 55,  quantite: 20, dernierCours: 118, compte: "CTO" },
  { id: "demo_6", nom: "ASML Holding",            ticker: "ASML.AS",  isin: "NL0010273215", pru: 620, quantite: 3,  dernierCours: 782, compte: "CTO" },
  { id: "demo_7", nom: "Vanguard FTSE All-World", ticker: "VWRL.AS",  isin: "IE00B3RBWM25", pru: 92,  quantite: 25, dernierCours: 114, compte: "CTO" },
];

export const DEMO_SNAPSHOTS = [
  { date: daysAgo(180), valeur: 28400, source: "demo" },
  { date: daysAgo(150), valeur: 29100, source: "demo" },
  { date: daysAgo(120), valeur: 27800, source: "demo" },
  { date: daysAgo(90),  valeur: 30200, source: "demo" },
  { date: daysAgo(60),  valeur: 31800, source: "demo" },
  { date: daysAgo(30),  valeur: 33100, source: "demo" },
  { date: daysAgo(14),  valeur: 34200, source: "demo" },
  { date: daysAgo(7),   valeur: 35400, source: "demo" },
  { date: daysAgo(1),   valeur: 36100, source: "demo" },
];

export const DEMO_SNAPSHOTS_CTO = [
  { date: daysAgo(180), valeur: 7200,  source: "demo" },
  { date: daysAgo(150), valeur: 7800,  source: "demo" },
  { date: daysAgo(120), valeur: 8400,  source: "demo" },
  { date: daysAgo(90),  valeur: 9100,  source: "demo" },
  { date: daysAgo(60),  valeur: 9800,  source: "demo" },
  { date: daysAgo(30),  valeur: 10600, source: "demo" },
  { date: daysAgo(14),  valeur: 11200, source: "demo" },
  { date: daysAgo(7),   valeur: 11600, source: "demo" },
  { date: daysAgo(1),   valeur: 12050, source: "demo" },
];

export const DEMO_PROFIL = {
  compte: "PEA",
  risque: "equilibre",
  horizon: "long",
  dcaMensuel: 300,
  especesPEA: 2400,
  objectif: "Retraite anticipée à 55 ans",
};

export const DEMO_SESSION = { name: "Démo", uid: null, demo: true };

// ── Scoring IA fictif ─────────────────────────────────────────────────────────
// Narration : portefeuille à potentiel global FAIBLE (score moyen ~11/20)
// L'IA identifie 2 pépites (NVDA 19, ASML 17) noyées dans des positions ternes
// → démontre la valeur de l'analyse IA pour trier le bon grain de l'ivraie
export const DEMO_MARKET_SCORES = [
  // PEA — potentiel limité
  {
    isin: "LU1681043599", nom: "Amundi MSCI World", score_marche: 10, signal: "ATTENDRE",
    resume: "Le MSCI World marque une pause après 18 mois de hausse. La valorisation des actions US (P/E 22x) laisse peu de marge. La rotation sectorielle en cours pénalise les ETF généralistes à court terme. À conserver mais sans renforcer.",
    catalyseur_cle: "Attente d'une consolidation avant reprise — rotation value/growth défavorable à court terme",
  },
  {
    isin: "FR0013412269", nom: "Amundi PEA Nasdaq-100", score_marche: 11, signal: "ATTENDRE",
    resume: "Le Nasdaq-100 stagne malgré le cycle IA : les valorisations des mega-caps limitent le potentiel de hausse à court terme. Les investisseurs préfèrent désormais les titres IA en direct (NVIDIA, ASML) plutôt que les ETF tech.",
    catalyseur_cle: "Valorisation tendue (P/E 28x) — rotation vers les titres IA individuels plus dynamiques",
  },
  {
    isin: "FR0000120271", nom: "TotalEnergies", score_marche: 6, signal: "PRUDENCE",
    resume: "Le Brent est retombé sous 72$/baril, pénalisant directement les marges de TotalEnergies. Les engagements EnR nécessitent des investissements lourds sans retour immédiat. Le dividende reste sécurisé mais la plus-value court terme est compromise.",
    catalyseur_cle: "Brent < 72$ — pression OPEC+, capex EnR en hausse, catalyseur de revalorisation absent",
  },
  // CTO — contraste fort : 2 pépites, 2 positions ternes
  {
    isin: "US0378331005", nom: "Apple Inc.", score_marche: 9, signal: "ATTENDRE",
    resume: "Le cycle iPhone 16 déçoit en Chine (-12% de parts de marché face à Huawei). La croissance des Services ralentit à +9% YoY vs +15% attendu. Le cours intègre déjà un premium IA qui n'est pas encore monétisé.",
    catalyseur_cle: "Faiblesse Chine persistante, cycle IA on-device retardé — pas de catalyseur à 3 mois",
  },
  {
    isin: "US67066G1040", nom: "NVIDIA Corp.", score_marche: 19, signal: "RENFORCER",
    resume: "NVIDIA écrase la concurrence sur les GPU IA : part de marché data center > 85%. Le Blackwell B200 est en rupture de stock jusqu'en 2026. Chaque grand hyperscaler (Microsoft, Google, Amazon) multiplie ses commandes. C'est la position la plus prometteuse du portefeuille.",
    catalyseur_cle: "Backlog B200 record, guidance Q2 +110% YoY — position à renforcer en priorité absolue",
  },
  {
    isin: "NL0010273215", nom: "ASML Holding", score_marche: 17, signal: "RENFORCER",
    resume: "ASML détient le monopole absolu sur les machines EUV nécessaires à toutes les puces avancées (3nm, 2nm). Le carnet de commandes dépasse 39 Md€. Les restrictions export vers la Chine sont déjà intégrées — la demande TSMC/Intel/Samsung compense largement.",
    catalyseur_cle: "Monopole EUV High-NA inattaquable — 2e position la plus prometteuse du portefeuille CTO",
  },
  {
    isin: "IE00B3RBWM25", nom: "Vanguard FTSE All-World", score_marche: 8, signal: "ATTENDRE",
    resume: "Le VWRL souffre d'une exposition excessive aux marchés développés (US 65%) dont les valorisations sont historiquement hautes. La pondération Chine/émergents reste un frein. En CTO, des positions en direct sur NVDA ou ASML offrent un meilleur rendement ajusté au risque.",
    catalyseur_cle: "Exposition US 65% à valorisation tendue — sous-performance probable vs titres IA en direct",
  },
];

// ── Portefeuille IA fictif ────────────────────────────────────────────────────
// L'IA démarre avec le même capital que l'utilisateur à J-30 (= 33 100 €)
// Elle a surperformé en renforçant ASML et en réduisant TTE
// Positions actuelle : 34 736 € + cash 1 970 € = 36 706 € → perf +10.89%
// Utilisateur          : snapshot 33 100 → 36 100        → perf  +9.06%
// Delta en faveur IA   : +1.83 % → catégorie aiWinSmall
export const DEMO_AI_PORTFOLIO = {
  active: true,
  account: "PEA",
  inception_date: daysAgo(30),
  capital_initial: 33100,
  cash: 1970,
  last_cycle: isoAgo(1),
  last_morning_cycle: isoAgo(1),
  last_noon_cycle: null,
  last_evening_cycle: null,
  last_dca_date: null,
  last_synced_liquidites: 2400,
  strategie_courante: "Surpondération ASML (IA/semiconducteurs) et ETF World (diversification). Sous-pondération énergie traditionnelle. Cash réservé à ~5 % pour saisir les opportunités. Stop-loss automatique 15 %.",
  positions: [
    { ticker: "CW8.PA",   nom: "Amundi MSCI World",      isin: "LU1681043599", quantite: 32, prix_achat_moyen: 382, dernier_cours: 432 },
    { ticker: "PANX.PA",  nom: "Amundi PEA Nasdaq-100",  isin: "FR0013412269", quantite: 90, prix_achat_moyen: 43,  dernier_cours: 51  },
    { ticker: "TTE.PA",   nom: "TotalEnergies",           isin: "FR0000120271", quantite: 45, prix_achat_moyen: 55,  dernier_cours: 61  },
  ],
  trades: [
    { date: isoAgo(25), action: "BUY",  ticker: "PANX.PA", nom: "Amundi PEA Nasdaq-100", quantite: 10, prix: 45, montant: 450, frais: 0, raison: "Renforcement Nasdaq : super-cycle IA en accélération, big tech en avance sur les estimations." },
    { date: isoAgo(18), action: "BUY",  ticker: "CW8.PA",  nom: "Amundi MSCI World",      quantite: 2,  prix: 418, montant: 836, frais: 0, raison: "DCA mensuel sur creux technique. Tendance long terme intacte, point d'entrée favorable." },
    { date: isoAgo(10), action: "SELL", ticker: "TTE.PA",  nom: "TotalEnergies",           quantite: 5,  prix: 58,  montant: 290, frais: 0, raison: "Allègement partiel énergie : rotation vers croissance, pression Brent à court terme." },
    { date: isoAgo(3),  action: "BUY",  ticker: "PANX.PA", nom: "Amundi PEA Nasdaq-100",  quantite: 5,  prix: 49,  montant: 245, frais: 0, raison: "Renforcement sur consolidation. Nvidia et Microsoft au-dessus des attentes — thèse IA confirmée." },
  ],
  snapshots: [
    { date: daysAgo(30), valeur: 33100 },
    { date: daysAgo(25), valeur: 33598 },
    { date: daysAgo(22), valeur: 33840 },
    { date: daysAgo(20), valeur: 34195 },
    { date: daysAgo(15), valeur: 34822 },
    { date: daysAgo(10), valeur: 35280 },
    { date: daysAgo(7),  valeur: 35740 },
    { date: daysAgo(3),  valeur: 36182 },
    { date: daysAgo(1),  valeur: 36608 },
    { date: daysAgo(0),  valeur: 36706 },
  ],
  benchmark_snapshots: null,
};

// ── Historique delta IA vs Utilisateur (trajectoire) ─────────────────────────
export const DEMO_AI_DELTA_HISTORY = [
  { date: daysAgo(30), delta: 0.0  },
  { date: daysAgo(28), delta: 0.2  },
  { date: daysAgo(25), delta: 0.4  },
  { date: daysAgo(22), delta: 0.6  },
  { date: daysAgo(20), delta: 0.8  },
  { date: daysAgo(18), delta: 0.9  },
  { date: daysAgo(15), delta: 1.1  },
  { date: daysAgo(12), delta: 1.3  },
  { date: daysAgo(10), delta: 1.5  },
  { date: daysAgo(7),  delta: 1.7  },
  { date: daysAgo(5),  delta: 1.9  },
  { date: daysAgo(3),  delta: 2.1  },
  { date: daysAgo(1),  delta: 2.3  },
  { date: daysAgo(0),  delta: 1.83 },
];

// ── Portefeuille IA CTO fictif ────────────────────────────────────────────────
export const DEMO_AI_PORTFOLIO_CTO = {
  active: true,
  account: "CTO",
  inception_date: daysAgo(30),
  capital_initial: 10600,
  cash: 480,
  last_cycle: isoAgo(1),
  last_morning_cycle: isoAgo(1),
  last_noon_cycle: null,
  last_evening_cycle: null,
  last_dca_date: null,
  last_synced_liquidites: 500,
  strategie_courante: "Concentration sur le super-cycle IA (NVIDIA, ASML) et diversification globale via VWRL. Apple pour la stabilité et la croissance des services. Cash limité à 4% en attente d'opportunités.",
  positions: [
    { ticker: "AAPL",    nom: "Apple Inc.",              isin: "US0378331005", quantite: 10, prix_achat_moyen: 155, dernier_cours: 189 },
    { ticker: "NVDA",    nom: "NVIDIA Corp.",            isin: "US67066G1040", quantite: 22, prix_achat_moyen: 54,  dernier_cours: 118 },
    { ticker: "ASML.AS", nom: "ASML Holding",            isin: "NL0010273215", quantite: 3,  prix_achat_moyen: 615, dernier_cours: 782 },
    { ticker: "VWRL.AS", nom: "Vanguard FTSE All-World", isin: "IE00B3RBWM25", quantite: 25, prix_achat_moyen: 92,  dernier_cours: 114 },
  ],
  trades: [
    { date: isoAgo(28), action: "BUY",  ticker: "NVDA",    nom: "NVIDIA Corp.",  quantite: 5,  prix: 52,  montant: 260, frais: 0, raison: "Renforcement NVIDIA : guidance data center largement au-dessus des attentes, cycle Blackwell en accélération." },
    { date: isoAgo(20), action: "BUY",  ticker: "ASML.AS", nom: "ASML Holding",  quantite: 1,  prix: 740, montant: 740, frais: 0, raison: "Point d'entrée attractif après consolidation. Monopole EUV intact, visibilité 2026 excellente." },
    { date: isoAgo(12), action: "BUY",  ticker: "NVDA",    nom: "NVIDIA Corp.",  quantite: 2,  prix: 105, montant: 210, frais: 0, raison: "Renforcement sur creux. Résultats Q1 2025 : bénéfices x3 YoY, guidance record." },
    { date: isoAgo(4),  action: "SELL", ticker: "AAPL",    nom: "Apple Inc.",    quantite: 2,  prix: 195, montant: 390, frais: 0, raison: "Allègement partiel pour dégager du cash. Rotation vers NVIDIA — meilleur momentum IA à court terme." },
  ],
  snapshots: [
    { date: daysAgo(30), valeur: 10600 },
    { date: daysAgo(25), valeur: 10880 },
    { date: daysAgo(20), valeur: 11340 },
    { date: daysAgo(15), valeur: 11720 },
    { date: daysAgo(10), valeur: 12050 },
    { date: daysAgo(7),  valeur: 12380 },
    { date: daysAgo(3),  valeur: 12640 },
    { date: daysAgo(1),  valeur: 12890 },
    { date: daysAgo(0),  valeur: 13010 },
  ],
  benchmark_snapshots: null,
};

export const DEMO_AI_DELTA_HISTORY_CTO = [
  { date: daysAgo(30), delta: 0.0  },
  { date: daysAgo(25), delta: 0.3  },
  { date: daysAgo(20), delta: 0.7  },
  { date: daysAgo(15), delta: 1.0  },
  { date: daysAgo(10), delta: 1.4  },
  { date: daysAgo(7),  delta: 1.8  },
  { date: daysAgo(3),  delta: 2.2  },
  { date: daysAgo(1),  delta: 2.5  },
  { date: daysAgo(0),  delta: 2.12 },
];

export const DEMO_AI_CHALLENGE_CTO = {
  aiWins: 22,
  userWins: 7,
  ties: 1,
  lastChecked: new Date().toISOString(),
};

// ── Score challenge ───────────────────────────────────────────────────────────
export const DEMO_AI_CHALLENGE = {
  aiWins: 18,
  userWins: 9,
  ties: 3,
  lastChecked: new Date().toISOString(),
};

export function loadDemoData() {
  try {
    localStorage.setItem("bourse_portfolio",            JSON.stringify(DEMO_POSITIONS));
    localStorage.setItem("bourse_snapshots",            JSON.stringify(DEMO_SNAPSHOTS));
    localStorage.setItem("bourse_snapshots_CTO",        JSON.stringify(DEMO_SNAPSHOTS_CTO));
    localStorage.setItem("bourse_profil",               JSON.stringify(DEMO_PROFIL));
    localStorage.setItem("bourse_session",              JSON.stringify(DEMO_SESSION));
    localStorage.setItem("bourse_demo_mode",            "1");
    localStorage.setItem("bourse_market_scores",        JSON.stringify(DEMO_MARKET_SCORES));
    localStorage.setItem("bourse_market_scores_ts",     String(Date.now() - 18 * 60 * 1000));
    localStorage.setItem("bourse_ai_portfolio_PEA",     JSON.stringify(DEMO_AI_PORTFOLIO));
    localStorage.setItem("bourse_ai_delta_history_PEA", JSON.stringify(DEMO_AI_DELTA_HISTORY));
    localStorage.setItem("bourse_ai_challenge_PEA",     JSON.stringify(DEMO_AI_CHALLENGE));
    localStorage.setItem("bourse_ai_portfolio_CTO",     JSON.stringify(DEMO_AI_PORTFOLIO_CTO));
    localStorage.setItem("bourse_ai_delta_history_CTO", JSON.stringify(DEMO_AI_DELTA_HISTORY_CTO));
    localStorage.setItem("bourse_ai_challenge_CTO",     JSON.stringify(DEMO_AI_CHALLENGE_CTO));
  } catch {}
}

export function clearDemoData() {
  try {
    [
      "bourse_portfolio", "bourse_snapshots", "bourse_snapshots_CTO", "bourse_profil", "bourse_session", "bourse_demo_mode",
      "bourse_market_scores", "bourse_market_scores_ts",
      "bourse_ai_portfolio_PEA", "bourse_ai_delta_history_PEA", "bourse_ai_challenge_PEA",
      "bourse_ai_portfolio_CTO", "bourse_ai_delta_history_CTO", "bourse_ai_challenge_CTO",
    ].forEach(k => localStorage.removeItem(k));
  } catch {}
}

export const isDemoMode = () => {
  try { return localStorage.getItem("bourse_demo_mode") === "1"; } catch { return false; }
};
