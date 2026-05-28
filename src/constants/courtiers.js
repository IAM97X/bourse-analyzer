// ETFs éligibles BoursoMarkets (0% de frais si ordre ≥ 200€)
// TER = frais de gestion annuels (déjà dans le prix, info pour l'IA)
export const BOURSOMARKETS_ETFS = {
  "CW8.PA":   { nom: "Amundi MSCI World",             ter: 0.38 },
  "PANX.PA":  { nom: "Amundi Nasdaq-100 ESG",          ter: 0.23 },
  "PUST.PA":  { nom: "Amundi PEA S&P 500 ESG",         ter: 0.18 },
  "EWLD.PA":  { nom: "iShares MSCI World PEA",         ter: 0.20 },
  "PAEEM.PA": { nom: "Amundi PEA Emerging Markets",    ter: 0.20 },
  "PCEU.PA":  { nom: "Amundi PEA MSCI Europe",         ter: 0.15 },
  "LYPS.PA":  { nom: "Lyxor Core S&P 500",             ter: 0.15 },
  "RS2K.PA":  { nom: "Amundi Russell 2000",            ter: 0.35 },
  "AASI.PA":  { nom: "Amundi PEA Asie-Pacifique",      ter: 0.20 },
  "LQQ.PA":   { nom: "Lyxor Nasdaq-100 x2 Lev",        ter: 0.60 },
  "UST.PA":   { nom: "Lyxor S&P 500 x2 Lev",           ter: 0.35 },
  "C40.PA":   { nom: "Amundi CAC 40",                  ter: 0.25 },
  "CACC.PA":  { nom: "BNP Paribas Easy CAC 40",        ter: 0.25 },
  "ESE.PA":   { nom: "BNP Paribas Easy S&P 500",       ter: 0.15 },
};

export const COURTIERS = {
  // pea          = compte PEA proposé
  // minOrdre     = minimum légal par ordre
  // minOrdreETF  = minimum pratique ETF
  // fractionne   = achat fractionné possible
  boursobank:    { nom: "Boursobank",          pea: true,  minOrdre: 100, minOrdreETF: 200, minOrdreSmallCap: 100, fractionne: false, boursomarkets: true,  frais: m => m <= 0 ? 0 : m <= 500 ? 1.99 : Math.max(m * 0.006, 1.99) },
  fortuneo:      { nom: "Fortuneo",            pea: true,  minOrdre: 0,   minOrdreETF: 100, minOrdreSmallCap: 100, fractionne: false, frais: m => m <= 0 ? 0 : m <= 500 ? 1.99 : Math.max(m * 0.005, 3.99) },
  bourse_direct: { nom: "Bourse Direct",       pea: true,  minOrdre: 0,   minOrdreETF: 50,  minOrdreSmallCap: 50,  fractionne: false, frais: m => m <= 0 ? 0 : m <= 300 ? 0.99 : m <= 2000 ? 1.90 : Math.max(m * 0.00095, 3.00) },
  hello_bank:    { nom: "Hello bank!",         pea: true,  minOrdre: 0,   minOrdreETF: 50,  minOrdreSmallCap: 50,  fractionne: false, frais: m => m <= 0 ? 0 : m <= 500 ? 5.00 : Math.max(m * 0.01, 5.00) },
  bforbank:      { nom: "BforBank",            pea: true,  minOrdre: 0,   minOrdreETF: 100, minOrdreSmallCap: 100, fractionne: false, frais: m => m <= 0 ? 0 : m <= 500 ? 1.99 : Math.max(m * 0.005, 3.99) },
  saxo:          { nom: "Saxo Banque",         pea: true,  minOrdre: 0,   minOrdreETF: 50,  minOrdreSmallCap: 50,  fractionne: false, frais: m => m <= 0 ? 0 : Math.max(m * 0.0008, 4.00) },
  interactive:   { nom: "Interactive Brokers", pea: true,  minOrdre: 0,   minOrdreETF: 1,   minOrdreSmallCap: 1,   fractionne: false, frais: m => m <= 0 ? 0 : Math.max(m * 0.0005, 1.25) },
  trade_rep:     { nom: "Trade Republic",      pea: false, minOrdre: 1,   minOrdreETF: 1,   minOrdreSmallCap: 1,   fractionne: true,  frais: m => m <= 0 ? 0 : 1.00 },
  degiro:        { nom: "DEGIRO",              pea: false, minOrdre: 0,   minOrdreETF: 1,   minOrdreSmallCap: 10,  fractionne: false, frais: m => m <= 0 ? 0 : Math.max(0.50 + m * 0.00004, 0.50) },
  revolut:       { nom: "Revolut",             pea: false, minOrdre: 1,   minOrdreETF: 1,   minOrdreSmallCap: 1,   fractionne: true,  frais: m => m <= 0 ? 0 : 1.00 },
  xtb:           { nom: "XTB",                 pea: false, minOrdre: 0,   minOrdreETF: 1,   minOrdreSmallCap: 1,   fractionne: true,  frais: m => m <= 0 ? 0 : m <= 100000 ? 0 : m * 0.002 },
  autre:         { nom: "Autre",               pea: true,  minOrdre: 0,   minOrdreETF: 50,  minOrdreSmallCap: 50,  fractionne: false, frais: m => m <= 0 ? 0 : m <= 500 ? 1.99 : Math.max(m * 0.005, 3.99) },
};

export const COURTIERS_DETAIL = {
  boursobank:    "Boursobank (Découverte) — PEA/CTO. MINIMUMS : ETF ≥200€, actions ≥100€. Frais : 1,99€ fixe ≤500€ ; 0,60% au-delà. Boursomarkets : 0% si ≥200€. TTF +0,4% sur grandes caps françaises. Pas d'achat fractionné. Settlement T+2. Horaires : 9h-17h30 (étendus 17h35-22h).",
  fortuneo:      "Fortuneo — PEA/CTO. Frais : 1,99€ fixe ≤500€ ; 0,50% (min 3,99€) au-delà. Pas de minimum. Pas d'achat fractionné. Settlement T+2.",
  bourse_direct: "Bourse Direct — PEA/CTO. Frais : 0,99€ ≤300€ ; 1,90€ ≤2000€ ; 0,095% (min 3€) au-delà. Pas de minimum. Pas d'achat fractionné. Settlement T+2.",
  hello_bank:    "Hello bank! (BNP Paribas) — PEA/CTO. Frais : 5€ fixe ≤500€ ; 1% (min 5€) au-delà. Pas de minimum. Pas d'achat fractionné. Settlement T+2.",
  bforbank:      "BforBank (Crédit Agricole) — PEA/CTO. Frais : 1,99€ fixe ≤500€ ; 0,50% (min 3,99€) au-delà. Pas d'achat fractionné. Settlement T+2.",
  saxo:          "Saxo Banque — PEA/CTO. Frais : 0,08% (min 4€) par ordre. Pas d'achat fractionné. Settlement T+2.",
  interactive:   "Interactive Brokers — PEA/CTO. Frais : 0,05% (min 1,25€) par ordre. Pas d'achat fractionné. Settlement T+2. Frais de change si hors €.",
  trade_rep:     "Trade Republic — CTO uniquement (pas de PEA). Frais : 1€ fixe par ordre. Achat fractionné disponible. Settlement T+2. Pas de frais de change sur €.",
  degiro:        "DEGIRO — CTO uniquement (pas de PEA). Frais : 0,50€ + 0,004% par ordre. ETF gratuits selon liste. Frais de change 0,25%. Pas d'achat fractionné. Settlement T+2.",
  revolut:       "Revolut — CTO uniquement (pas de PEA). Frais : 1€/ordre (Standard, 10 ordres gratuits/mois) ou inclus en Premium/Metal. Achat fractionné disponible. Settlement T+2.",
  xtb:           "XTB — CTO uniquement (pas de PEA). Frais : 0% jusqu'à 100 000€/mois de volume, puis 0,2%. Achat fractionné disponible. Pas de frais de garde. Settlement T+2.",
  autre:         "Courtier non précisé — frais estimés : 1,99€ fixe ≤500€ ; 0,50% (min 3,99€) au-delà. Pas d'achat fractionné.",
};

// Retourne le courtier adapté au type de compte (rétrocompat avec ancien champ 'courtier')
export function getCourtierForAccount(profil, account) {
  if (account === "CTO") return profil?.courtierCTO || profil?.courtier || "degiro";
  return profil?.courtierPEA || profil?.courtier || "boursobank";
}

export function calcFraisCourtage(montant, courtierKey) {
  const c = COURTIERS[courtierKey] || COURTIERS.boursobank;
  return c.frais(montant);
}

export function tauxFraisCourtage(montant) {
  const frais = calcFraisCourtage(montant);
  return montant > 0 ? (frais / montant * 100).toFixed(2) : "0";
}
