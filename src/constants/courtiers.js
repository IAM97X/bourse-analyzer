export const COURTIERS = {
  boursobank:    { nom: "Boursobank",     minOrdre: 200,  frais: m => m <= 0 ? 0 : m <= 500 ? 1.99 : Math.max(m * 0.006, 1.99) },
  fortuneo:      { nom: "Fortuneo",       minOrdre: 0,    frais: m => m <= 0 ? 0 : m <= 500 ? 1.99 : Math.max(m * 0.005, 3.99) },
  bourse_direct: { nom: "Bourse Direct",  minOrdre: 0,    frais: m => m <= 0 ? 0 : m <= 300 ? 0.99 : m <= 2000 ? 1.90 : Math.max(m * 0.00095, 3.00) },
  trade_rep:     { nom: "Trade Republic", minOrdre: 1,    frais: m => m <= 0 ? 0 : 1.00 },
  degiro:        { nom: "DEGIRO",         minOrdre: 0,    frais: m => m <= 0 ? 0 : Math.max(0.50 + m * 0.00004, 0.50) },
  saxo:          { nom: "Saxo Banque",    minOrdre: 0,    frais: m => m <= 0 ? 0 : Math.max(m * 0.0008, 4.00) },
  autre:         { nom: "Autre",          minOrdre: 0,    frais: m => m <= 0 ? 0 : m <= 500 ? 1.99 : Math.max(m * 0.005, 3.99) },
};

export const COURTIERS_DETAIL = {
  boursobank:    "Boursobank (profil Découverte) — RÈGLES IMPÉRATIVES : (1) MONTANT MINIMUM PAR ORDRE = 200€ obligatoire depuis avril 2026 sur PEA et CTO — tout ordre inférieur à 200€ est IMPOSSIBLE, ne jamais suggérer un montant < 200€. (2) Pas d'achat fractionné : titres entiers uniquement, calculer le nombre entier de titres achetables avec 200€ minimum. (3) Frais : 1,99€ fixe pour ordres ≤500€ ; 0,60% au-delà. (4) Boursomarkets : 0% de frais si ordre ≥200€ sur titres éligibles. (5) TTF : +0,4% sur achats d'actions françaises dont capitalisation > 1 milliard€. (6) Settlement T+2. (7) 0€ de frais de garde. (8) PEA plafond 150 000€. (9) Horaires : 9h-17h30, horaires étendus 17h35-22h00. (10) Types d'ordres : marché, limité, stop, stop limité.",
  fortuneo:      "Fortuneo — PEA/CTO : 1,99€ fixe ≤500€ ; 0,50% (min 3,99€) au-delà. Pas de minimum d'ordre. Pas de frais de garde. Settlement T+2. Pas d'achat fractionné.",
  bourse_direct: "Bourse Direct — PEA/CTO : 0,99€ fixe ≤300€ ; 1,90€ ≤2000€ ; 0,095% (min 3€) au-delà. Pas de minimum d'ordre. Settlement T+2. Pas d'achat fractionné.",
  trade_rep:     "Trade Republic — CTO uniquement (pas de PEA) : 1€ fixe par ordre. Achat fractionné disponible. Settlement T+2. Pas de frais de change sur €.",
  degiro:        "DEGIRO — CTO uniquement (pas de PEA) : 0,50€ + 0,004% par ordre. ETF gratuits selon liste. Settlement T+2. Frais de change 0,25%. Pas d'achat fractionné.",
  saxo:          "Saxo Banque — PEA/CTO : 0,08% par ordre (min 4€). Settlement T+2. Pas d'achat fractionné.",
  autre:         "Courtier non précisé — frais estimés : 1,99€ fixe ≤500€ ; 0,50% (min 3,99€) au-delà. Pas d'achat fractionné.",
};

export function calcFraisCourtage(montant, courtierKey) {
  const c = COURTIERS[courtierKey] || COURTIERS.boursobank;
  return c.frais(montant);
}

export function tauxFraisCourtage(montant) {
  const frais = calcFraisCourtage(montant);
  return montant > 0 ? (frais / montant * 100).toFixed(2) : "0";
}
