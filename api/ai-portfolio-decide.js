// POST /api/ai-portfolio-decide
// Reçoit l'état du portefeuille IA + les cours actuels, retourne les décisions BUY/SELL/HOLD

// BoursoMarkets ETFs = 0% frais si ordre ≥ 200€. TER = frais de gestion annuels (dans le prix).
const BOURSOMARKETS_ETFS = {
  "CW8.PA":   { ter: 0.38 }, "PANX.PA":  { ter: 0.23 }, "PUST.PA":  { ter: 0.18 },
  "EWLD.PA":  { ter: 0.20 }, "PAEEM.PA": { ter: 0.20 }, "PCEU.PA":  { ter: 0.15 },
  "LYPS.PA":  { ter: 0.15 }, "RS2K.PA":  { ter: 0.35 }, "AASI.PA":  { ter: 0.20 },
  "C40.PA":   { ter: 0.25 }, "ESE.PA":   { ter: 0.15 },
};

const PEA_UNIVERSE = [
  // ── ETFs BoursoMarkets (PEA, 0% frais ≥200€) ───────────────────────────────
  { symbol: "CW8.PA",   nom: "Amundi MSCI World",          secteur: "ETF Monde" },
  { symbol: "EWLD.PA",  nom: "iShares MSCI World PEA",     secteur: "ETF Monde" },
  { symbol: "PUST.PA",  nom: "Amundi S&P 500 ESG",         secteur: "ETF USA" },
  { symbol: "LYPS.PA",  nom: "Lyxor Core S&P 500",         secteur: "ETF USA" },
  { symbol: "PANX.PA",  nom: "Amundi Nasdaq-100 ESG",      secteur: "ETF Tech" },
  { symbol: "PAEEM.PA", nom: "Amundi PEA Emerging Mkts",   secteur: "ETF Émergents" },
  { symbol: "PCEU.PA",  nom: "Amundi PEA MSCI Europe",     secteur: "ETF Europe" },
  { symbol: "RS2K.PA",  nom: "Amundi Russell 2000",        secteur: "ETF US SmallCap" },
  { symbol: "AASI.PA",  nom: "Amundi PEA Asie-Pacifique",  secteur: "ETF Asie" },
  // ── France — CAC40 / SBF120 ─────────────────────────────────────────────────
  { symbol: "MC.PA",    nom: "LVMH",                       secteur: "Luxe" },
  { symbol: "RMS.PA",   nom: "Hermès",                     secteur: "Luxe" },
  { symbol: "KER.PA",   nom: "Kering",                     secteur: "Luxe" },
  { symbol: "OR.PA",    nom: "L'Oréal",                    secteur: "Cosmétiques" },
  { symbol: "AI.PA",    nom: "Air Liquide",                secteur: "Chimie/Industrie" },
  { symbol: "SU.PA",    nom: "Schneider Electric",         secteur: "Industrie" },
  { symbol: "LR.PA",    nom: "Legrand",                    secteur: "Industrie" },
  { symbol: "SGO.PA",   nom: "Saint-Gobain",               secteur: "Matériaux" },
  { symbol: "DG.PA",    nom: "Vinci",                      secteur: "Infrastructure" },
  { symbol: "SAF.PA",   nom: "Safran",                     secteur: "Aéronautique" },
  { symbol: "AIR.PA",   nom: "Airbus",                     secteur: "Aéronautique" },
  { symbol: "HO.PA",    nom: "Thales",                     secteur: "Défense" },
  { symbol: "AM.PA",    nom: "Dassault Aviation",          secteur: "Défense" },
  { symbol: "TTE.PA",   nom: "TotalEnergies",              secteur: "Énergie" },
  { symbol: "ENGI.PA",  nom: "Engie",                      secteur: "Énergie" },
  { symbol: "VIE.PA",   nom: "Veolia",                     secteur: "Environnement" },
  { symbol: "SAN.PA",   nom: "Sanofi",                     secteur: "Santé" },
  { symbol: "EL.PA",    nom: "EssilorLuxottica",           secteur: "Santé" },
  { symbol: "BIOR.PA",  nom: "BioMérieux",                 secteur: "Biotech" },
  { symbol: "ERF.PA",   nom: "Eurofins Scientific",        secteur: "Biotech" },
  { symbol: "VIRP.PA",  nom: "Virbac",                     secteur: "Santé animale" },
  { symbol: "BNP.PA",   nom: "BNP Paribas",                secteur: "Banque" },
  { symbol: "GLE.PA",   nom: "Société Générale",           secteur: "Banque" },
  { symbol: "ACA.PA",   nom: "Crédit Agricole",            secteur: "Banque" },
  { symbol: "AXA.PA",   nom: "AXA",                        secteur: "Assurance" },
  { symbol: "CAP.PA",   nom: "Capgemini",                  secteur: "Tech" },
  { symbol: "DSY.PA",   nom: "Dassault Systèmes",          secteur: "Tech" },
  { symbol: "PUB.PA",   nom: "Publicis",                   secteur: "Médias/IA" },
  { symbol: "EDEN.PA",  nom: "Edenred",                    secteur: "Fintech/RH" },
  { symbol: "TEP.PA",   nom: "Teleperformance",            secteur: "Tech Services" },
  { symbol: "STMPA.PA", nom: "STMicroelectronics",         secteur: "Semi-conducteurs" },
  { symbol: "SOI.PA",   nom: "Soitec",                     secteur: "Semi-conducteurs" },
  { symbol: "ORA.PA",   nom: "Orange",                     secteur: "Télécoms" },
  { symbol: "VIV.PA",   nom: "Vivendi",                    secteur: "Médias" },
  { symbol: "ML.PA",    nom: "Michelin",                   secteur: "Automobile" },
  { symbol: "RNO.PA",   nom: "Renault",                    secteur: "Automobile" },
  { symbol: "ALO.PA",   nom: "Alstom",                     secteur: "Transports" },
  { symbol: "CA.PA",    nom: "Carrefour",                  secteur: "Distribution" },
  { symbol: "UBI.PA",   nom: "Ubisoft",                    secteur: "Jeux vidéo" },
  // ── Netherlands — Euronext Amsterdam ────────────────────────────────────────
  { symbol: "ASML.AS",  nom: "ASML Holding",               secteur: "Semi-conducteurs" },
  { symbol: "ADYEN.AS", nom: "Adyen",                      secteur: "Fintech" },
  { symbol: "BESI.AS",  nom: "BE Semiconductor",           secteur: "Semi-conducteurs" },
  { symbol: "MT.AS",    nom: "ArcelorMittal",              secteur: "Métaux" },
  { symbol: "HEIA.AS",  nom: "Heineken",                   secteur: "Boissons" },
  { symbol: "WKL.AS",   nom: "Wolters Kluwer",             secteur: "Tech/Data" },
  { symbol: "INGA.AS",  nom: "ING Groep",                  secteur: "Banque" },
  { symbol: "ABN.AS",   nom: "ABN AMRO",                   secteur: "Banque" },
  { symbol: "AKZA.AS",  nom: "Akzo Nobel",                 secteur: "Chimie" },
  { symbol: "RAND.AS",  nom: "Randstad",                   secteur: "RH/Services" },
  { symbol: "IMCD.AS",  nom: "IMCD",                       secteur: "Distribution chimie" },
  { symbol: "NN.AS",    nom: "NN Group",                   secteur: "Assurance" },
  { symbol: "PHIA.AS",  nom: "Philips",                    secteur: "MedTech" },
  // ── Germany — Xetra (PEA éligible) ──────────────────────────────────────────
  { symbol: "SAP.DE",   nom: "SAP",                        secteur: "Tech/ERP" },
  { symbol: "SIE.DE",   nom: "Siemens",                    secteur: "Industrie" },
  { symbol: "ALV.DE",   nom: "Allianz",                    secteur: "Assurance" },
  { symbol: "ADS.DE",   nom: "Adidas",                     secteur: "Sport/Mode" },
  { symbol: "IFX.DE",   nom: "Infineon Technologies",      secteur: "Semi-conducteurs" },
  { symbol: "BAS.DE",   nom: "BASF",                       secteur: "Chimie" },
  { symbol: "MRK.DE",   nom: "Merck KGaA",                 secteur: "Pharma/Sciences" },
  { symbol: "DTE.DE",   nom: "Deutsche Telekom",           secteur: "Télécoms" },
  { symbol: "DHL.DE",   nom: "DHL Group",                  secteur: "Logistique" },
  { symbol: "BAYN.DE",  nom: "Bayer",                      secteur: "Pharma/Agri" },
  // ── Spain — Bolsa de Madrid (PEA éligible) ───────────────────────────────────
  { symbol: "ITX.MC",   nom: "Inditex",                    secteur: "Mode/Distribution" },
  { symbol: "IBE.MC",   nom: "Iberdrola",                  secteur: "Énergie/Utilities" },
  { symbol: "SAN.MC",   nom: "Banco Santander",            secteur: "Banque" },
  // ── Belgium — Euronext Brussels (PEA éligible) ───────────────────────────────
  { symbol: "UCB.BR",   nom: "UCB",                        secteur: "Biotech/Pharma" },
  { symbol: "ABI.BR",   nom: "AB InBev",                   secteur: "Boissons" },
  { symbol: "KBC.BR",   nom: "KBC Groupe",                 secteur: "Banque" },
];

// Univers CTO uniquement (non éligibles PEA) — ajoutés en plus du PEA_UNIVERSE
const CTO_EXTRA_UNIVERSE = [
  // ── ETFs World/US (non PEA) ─────────────────────────────────────────────────
  { symbol: "IWDA.AS",  nom: "iShares Core MSCI World",   secteur: "ETF Monde" },
  { symbol: "CSPX.AS",  nom: "iShares Core S&P 500",      secteur: "ETF USA" },
  { symbol: "EQQQ.AS",  nom: "Invesco Nasdaq-100",        secteur: "ETF Tech" },
  { symbol: "VWCE.DE",  nom: "Vanguard FTSE All-World",   secteur: "ETF Monde" },
  { symbol: "VUSA.AS",  nom: "Vanguard S&P 500",          secteur: "ETF USA" },
  // ── US Tech ─────────────────────────────────────────────────────────────────
  { symbol: "NVDA",     nom: "NVIDIA",                    secteur: "Semi-conducteurs/IA" },
  { symbol: "MSFT",     nom: "Microsoft",                 secteur: "Tech/Cloud" },
  { symbol: "AAPL",     nom: "Apple",                     secteur: "Tech/Consumer" },
  { symbol: "AMZN",     nom: "Amazon",                    secteur: "Tech/E-commerce" },
  { symbol: "GOOGL",    nom: "Alphabet (Google)",         secteur: "Tech/Publicité" },
  { symbol: "META",     nom: "Meta Platforms",            secteur: "Réseaux sociaux/IA" },
  { symbol: "TSLA",     nom: "Tesla",                     secteur: "Auto/Énergie" },
  { symbol: "AVGO",     nom: "Broadcom",                  secteur: "Semi-conducteurs" },
  { symbol: "TSM",      nom: "TSMC",                      secteur: "Semi-conducteurs" },
  { symbol: "ORCL",     nom: "Oracle",                    secteur: "Tech/Cloud" },
  { symbol: "CRM",      nom: "Salesforce",                secteur: "SaaS" },
  { symbol: "AMD",      nom: "AMD",                       secteur: "Semi-conducteurs" },
  { symbol: "PLTR",     nom: "Palantir",                  secteur: "IA/Défense" },
  // ── US Finance ──────────────────────────────────────────────────────────────
  { symbol: "JPM",      nom: "JPMorgan Chase",            secteur: "Banque" },
  { symbol: "BRK-B",    nom: "Berkshire Hathaway",        secteur: "Conglomérat/Finance" },
  { symbol: "V",        nom: "Visa",                      secteur: "Paiements" },
  { symbol: "MA",       nom: "Mastercard",                secteur: "Paiements" },
  { symbol: "GS",       nom: "Goldman Sachs",             secteur: "Banque invest." },
  // ── US Santé / Pharma ────────────────────────────────────────────────────────
  { symbol: "LLY",      nom: "Eli Lilly",                 secteur: "Pharma/GLP-1" },
  { symbol: "UNH",      nom: "UnitedHealth",              secteur: "Santé" },
  { symbol: "JNJ",      nom: "Johnson & Johnson",         secteur: "Santé" },
  { symbol: "NVO",      nom: "Novo Nordisk",              secteur: "Pharma/GLP-1" },
  // ── US Consumer / Défense ────────────────────────────────────────────────────
  { symbol: "COST",     nom: "Costco",                    secteur: "Distribution" },
  { symbol: "WMT",      nom: "Walmart",                   secteur: "Distribution" },
  { symbol: "RTX",      nom: "RTX Corporation",           secteur: "Défense/Aéro" },
  { symbol: "LMT",      nom: "Lockheed Martin",           secteur: "Défense" },
  // ── UK — London Stock Exchange ───────────────────────────────────────────────
  { symbol: "AZN.L",    nom: "AstraZeneca",               secteur: "Pharma" },
  { symbol: "SHEL.L",   nom: "Shell",                     secteur: "Énergie" },
  { symbol: "HSBA.L",   nom: "HSBC",                      secteur: "Banque" },
  { symbol: "BP.L",     nom: "BP",                        secteur: "Énergie" },
  { symbol: "RIO.L",    nom: "Rio Tinto",                 secteur: "Mines/Matériaux" },
  { symbol: "ARM.L",    nom: "Arm Holdings",              secteur: "Semi-conducteurs/IA" },
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const geminiKey = process.env.GEMINI_API_KEY;
  const { portfolio, prices, account, session_type, courtier_info, dca_injected, dca_amount, courtier_min_ordre, courtier_min_etf, claude_key, autopilot_context, app_context, market_open } = req.body || {};
  const anthropicKey = claude_key || process.env.ANTHROPIC_API_KEY;
  if (!geminiKey && !anthropicKey) return res.status(503).json({ error: "Service IA non configuré" });
  if (!portfolio || !prices) return res.status(400).json({ error: "Données manquantes" });

  const valeurTotale = portfolio.cash + (portfolio.positions || []).reduce((s, p) => {
    const c = prices[p.ticker] || p.dernier_cours || p.prix_achat_moyen;
    return s + p.quantite * (c || 0);
  }, 0);

  const perfTotal = portfolio.capital_initial > 0
    ? (((valeurTotale - portfolio.capital_initial) / portfolio.capital_initial) * 100).toFixed(2)
    : "0.00";

  const isCTO = account === "CTO";
  const isBourso = courtier_info?.toLowerCase().includes("boursobank");
  const activeUniverse = isCTO ? [...PEA_UNIVERSE, ...CTO_EXTRA_UNIVERSE] : PEA_UNIVERSE;

  const univAvecPrix = activeUniverse
    .filter(s => prices[s.symbol])
    .map(s => {
      const bm = isBourso && !isCTO && BOURSOMARKETS_ETFS[s.symbol];
      const ter = bm ? ` | TER ${BOURSOMARKETS_ETFS[s.symbol].ter}%/an` : "";
      const fees = bm ? " | ✅ BoursoMarkets 0€ frais si ≥200€" : "";
      return `- ${s.nom} (${s.symbol}): ${prices[s.symbol]}€ [${s.secteur}${ter}${fees}]`;
    })
    .join('\n');

  const positionsText = portfolio.positions?.length > 0
    ? portfolio.positions.map(p => {
        const c = prices[p.ticker] || p.dernier_cours || p.prix_achat_moyen;
        const pv = ((c - p.prix_achat_moyen) / (p.prix_achat_moyen || 1) * 100).toFixed(1);
        const val = (p.quantite * c).toFixed(0);
        return `- ${p.nom} (${p.ticker}): ${p.quantite} titres | PRU ${p.prix_achat_moyen}€ | cours ${c}€ | PV ${pv}% | valeur ${val}€`;
      }).join('\n')
    : "AUCUNE POSITION — c'est le 1er cycle, déployer 60-70% du capital en 3-5 positions";

  const lastTradesText = portfolio.trades?.length > 0
    ? portfolio.trades.slice(0, 5).map(t => `${t.action} ${t.nom}×${t.quantite}@${t.prix}€ — ${t.raison}`).join('\n')
    : "Aucun trade précédent";

  const posMax = (valeurTotale * 0.20).toFixed(0);
  const cashMin = (valeurTotale * 0.05).toFixed(0);
  const minOrdreNum = courtier_min_ordre || 0;
  const minETFNum   = courtier_min_etf   || 0;

  const marketCtx = market_open === false
    ? "\n⚠️ MARCHÉ FERMÉ : Les marchés sont actuellement fermés. Tu dois UNIQUEMENT émettre des décisions HOLD pour toutes les positions. Aucun BUY ni SELL ne peut être exécuté maintenant. Tu peux noter des observations stratégiques dans le résumé (opportunités à surveiller, ordres à préparer pour la prochaine ouverture), mais la liste des décisions doit être 100% HOLD."
    : "";

  const sessionCtx = session_type === "OUVERTURE"
    ? "SESSION OUVERTURE (9h05) : Cherche les opportunités d'achat, déploie le cash disponible sur les meilleures convictions du moment. Achats prioritaires."
    : session_type === "MIDI"
    ? "SESSION MIDI (12h30) : Revue intermédiaire. Ajuste les positions si un signal fort est apparu depuis l'ouverture. Ventes partielles si un titre a fortement monté ou si une alerte se confirme. Achats opportunistes uniquement si évident."
    : session_type === "CLÔTURE"
    ? "SESSION CLÔTURE (17h15) : Revois les positions en perte, coupe les stops-loss atteints, sécurise les gains excessifs. Ventes prioritaires si nécessaire."
    : "CYCLE MANUEL : Analyse complète buy/sell/hold.";

  const autopilotCtx = autopilot_context
    ? `\n=== CONTEXTE MARCHÉ (source : Autopilot, à titre informatif) ===\nNote : ces données sont une lecture externe du marché. Tu restes autonome — tu n'es pas tenu de les suivre. Utilise-les comme signal supplémentaire parmi d'autres.\nScore marché global : ${autopilot_context.score_marche || "N/A"}/20\nLecture marché : ${autopilot_context.resume || "N/A"}\nTitres repérés par l'analyse externe :\n${(autopilot_context.opportunites || []).map(o => `  • ${o}`).join('\n') || "  Aucun"}\n(Analyse datant du : ${autopilot_context.generated_at ? new Date(autopilot_context.generated_at).toLocaleDateString('fr-FR') : "N/A"})`
    : "";

  const courtierCtx = courtier_info
    ? `\n=== CONTRAINTES COURTIER ===\n${courtier_info}`
    : "";


  const dcaCtx = dca_injected && dca_amount > 0
    ? `\n⚡ DCA MENSUEL INJECTÉ CE CYCLE: +${dca_amount}€ viennent d'être ajoutés au cash disponible (apport mensuel du 1er du mois). Priorité absolue : déployer une partie de cet apport en positions de conviction, en complément du cash existant.`
    : "";

  const appCtx = app_context ? `
=== CONTEXTE INVESTISSEUR ===
Profil : risque=${app_context.profil_investisseur?.risque || "N/A"}, horizon=${app_context.profil_investisseur?.horizon || "N/A"}, versements PEA=${app_context.profil_investisseur?.versements_pea || 0}€, versements CTO=${app_context.profil_investisseur?.versements_cto || 0}€
${app_context.profil_investisseur?.objectif ? `Objectif déclaré : ${app_context.profil_investisseur.objectif}` : ""}

Portefeuille réel (miroir) :
${(app_context.portefeuille_reel || []).map(p => `  • ${p.nom} (${p.ticker}) : ${p.quantite}×@${p.pru}€ PRU | cours ${p.cours}€ | perf ${p.perf_pct >= 0 ? "+" : ""}${p.perf_pct}%`).join("\n") || "  Aucune position"}

Scoring IA marché (signaux récents) :
${(app_context.scoring_marche || []).map(s => `  • ${s}`).join("\n") || "  Aucun signal disponible"}

Historique valeur portefeuille (réel) :
${(app_context.historique_valeur || []).join(" | ") || "  Aucune donnée"}

Transactions récentes (portefeuille réel) :
${(app_context.transactions_recentes || []).map(t => `  • ${t}`).join("\n") || "  Aucune"}

Dividendes reçus :
${(app_context.dividendes_recus || []).map(d => `  • ${d}`).join("\n") || "  Aucun"}

Répartition cible de l'investisseur (à titre informatif — tu n'es pas tenu de la respecter, mais tout écart significatif doit être justifié dans ton raisonnement) :
${app_context.allocation_cible ? Object.entries(app_context.allocation_cible).filter(([,v]) => Number(v) > 0).map(([k,v]) => `  • ${k}: ${v}%`).join("\n") : "  Non définie"}

Actualités marché (temps réel) :
${(app_context.actualites_marche || []).join("\n") || "  Aucune actualité disponible"}` : "";

  const userMsg = `DATE DU CYCLE: ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
${marketCtx}
${sessionCtx}${courtierCtx}${dcaCtx}${autopilotCtx}${appCtx}

=== ÉTAT DU PORTEFEUILLE IA (${account || 'PEA'}) ===
Capital initial: ${portfolio.capital_initial}€
Cash total: ${portfolio.cash.toFixed(2)}€
Cash réellement déployable (cash seul - réserve 5%): ${Math.max(0, portfolio.cash - Number(cashMin)).toFixed(2)}€${portfolio.cash <= Number(cashMin) ? " — cash seul insuffisant, mais tu peux VENDRE une position d'abord pour libérer du cash puis ACHETER dans le même cycle (le cash s'actualise après chaque vente)." : ""}
Valeur totale: ${valeurTotale.toFixed(2)}€
Performance depuis création: ${perfTotal}%
Nombre de positions: ${portfolio.positions?.length || 0}

POSITIONS ACTUELLES:
${positionsText}

DERNIERS TRADES (historique):
${lastTradesText}

=== UNIVERS INVESTISSABLE ${isCTO ? "CTO (PEA + actions mondiales)" : "PEA (valeurs européennes éligibles)"} — cours temps réel ===
${isCTO ? "⚠️ CTO : fiscalité flat tax 30% sur plus-values et dividendes. Pas de plafond de versement. Actions mondiales accessibles (US, UK, EU…)." : "⚠️ PEA : exonération d'impôt après 5 ans. Plafond versements 150 000€. Uniquement valeurs UE/EEE + ETFs UCITS domiciliés UE."}
${univAvecPrix}

=== CONTRAINTES STRICTES ===
- Maximum 5 transactions par cycle (BUY + SELL combinés)
- Position max par titre: ${posMax}€ (20% du capital)
- Cash minimum à conserver: ${cashMin}€ (5%)
- Tu es LIBRE de vendre une position pour financer un achat dans le même cycle : ordonne toujours SELL avant BUY, le cash se met à jour après chaque vente
- Avant tout BUY: vérifier que quantite × cours ≤ (cash après ventes éventuelles) - ${cashMin}€
${minOrdreNum > 0 ? `- Ordre minimum courtier: ${minOrdreNum}€ par transaction (actions). NE PAS placer d'ordre < ${minOrdreNum}€.` : ""}
${minETFNum > 0 ? `- Ordre minimum ETF: ${minETFNum}€ par transaction. NE PAS acheter un ETF pour < ${minETFNum}€.` : ""}
- Pas d'achat fractionné : arrondir à l'entier inférieur (Math.floor)
- Si 1er cycle (aucune position): déployer 60-70% en 3-5 positions diversifiées sectoriellement
- HOLD = décision valide et souvent optimale. Ne trade que si conviction forte (ratio risque/rendement clair)
- Éviter de vendre une position achetée au cycle précédent sans raison forte
${isBourso ? "- PRIORITÉ ETF BoursoMarkets : préférer les ETFs marqués ✅ (0€ frais si ≥200€) pour maximiser l'efficacité. Comparer les TERs pour choisir entre ETFs à exposition similaire (ex. EWLD 0.20% < CW8 0.38% = même exposition monde, coût moindre)." : ""}

=== FORMAT REQUIS (JSON strict, sans markdown) ===
{
  "decisions": [
    {"action": "BUY",  "ticker": "MC.PA",  "nom": "LVMH",    "quantite": 2,  "cours": 650.5,  "raison": "..."},
    {"action": "SELL", "ticker": "RNO.PA", "nom": "Renault", "quantite": 5,  "cours": 38.2,   "raison": "..."},
    {"action": "HOLD", "ticker": "AIR.PA", "nom": "Airbus",  "quantite": 0,  "cours": 160.0,  "raison": "..."}
  ],
  "strategie": "Description en 1-2 phrases de la stratégie et du raisonnement macro ce cycle"
}`;

  const body = {
    systemInstruction: {
      parts: [{ text: "Tu es un gestionnaire de portefeuille IA autonome gérant un portefeuille réel (PEA ou CTO). Tu tournes 3 fois par jour : ouverture (9h05), midi (12h30) et clôture (17h15). Tu hérites des positions et liquidités réelles de l'investisseur et tu prends le relais de façon totalement autonome. OBJECTIF PRINCIPAL : battre le marché (CAC40 / MSCI World selon le compte) ET surperformer le portefeuille réel de l'investisseur humain sur le long terme. Tu as accès au portefeuille réel, aux signaux marché, aux transactions passées et au profil de l'investisseur — utilise tout cela pour prendre de meilleures décisions que lui. Tu respectes strictement les contraintes du courtier (minimums, frais, pas de fractionné). Tu raisonnes comme un professionnel : analyse macro, momentum, rotation sectorielle, gestion du drawdown, protection du capital en marché baissier. Tu es discipliné, rationnel, sans émotions. IMPORTANT : tu n'as AUCUNE obligation de trader à chaque cycle. Si les conditions ne justifient pas un mouvement, HOLD sur toutes les positions est la décision la plus sage — over-trading détruit la performance. Ne trade que si tu as une conviction forte et un ratio risque/rendement clairement favorable. Chaque décision est justifiée en une phrase précise et factuelle." }]
    },
    contents: [{ role: "user", parts: [{ text: userMsg }] }],
    generationConfig: { maxOutputTokens: 2000, temperature: 0.35 },
  };

  function friendlyError(msg) {
    if (!msg) return "L'IA n'a pas pu répondre.";
    const m = msg.toLowerCase();
    if (m.includes("quota") || m.includes("rate") || m.includes("limit"))
      return "Quota IA temporairement atteint. Réessaie dans quelques secondes.";
    if (m.includes("timeout") || m.includes("timed out"))
      return "L'IA a mis trop de temps à répondre. Réessaie dans un instant.";
    if (m.includes("json") || m.includes("parse"))
      return "L'IA a retourné une réponse mal formée. Relance un cycle.";
    if (m.includes("503") || m.includes("unavailable") || m.includes("overloaded"))
      return "Le service IA est temporairement surchargé. Réessaie dans quelques secondes.";
    return "Erreur IA — réessaie dans un instant.";
  }

  function parseJson(text) {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
    if (s === -1 || e === -1) throw new Error("JSON introuvable dans la réponse IA");
    return JSON.parse(clean.substring(s, e + 1));
  }

  // ── Claude (priorité si clé disponible) ──────────────────────────────────────
  if (anthropicKey) {
    try {
      const systemPrompt = body.systemInstruction.parts[0].text;
      const claudeUserMsg = body.contents[0].parts[0].text;
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: claudeUserMsg }],
        }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await upstream.json();
      if (data.error) {
        const msg = data.error.message || "";
        // Erreur d'auth → pas la peine d'essayer Gemini, signaler directement
        if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("auth") || msg.toLowerCase().includes("api_key") || data.error.type === "authentication_error") {
          return res.status(500).json({ error: `Clé Claude invalide ou expirée — vérifie ta clé Anthropic dans Paramètres → Clés API.` });
        }
        throw new Error(msg);
      }
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
      if (!text) throw new Error("Réponse vide (Claude)");
      const result = parseJson(text);
      return res.status(200).json({ ...result, _model: "claude-haiku-4-5" });
    } catch (e) {
      if (!geminiKey) return res.status(500).json({ error: `Claude : ${friendlyError(e.message)}` });
      // Fallback Gemini silencieux uniquement pour erreurs non-auth
    }
  }

  // ── Gemini fallback ───────────────────────────────────────────────────────────
  if (!geminiKey) return res.status(503).json({ error: "Service IA non configuré" });

  const MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];

  async function callGemini(modelId) {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }
    );
    const data = await upstream.json();
    if (data.error) throw new Error(data.error.message || `Erreur ${modelId}`);
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
    if (!text) throw new Error(`Réponse vide (${modelId})`);
    return text;
  }

  let lastError = null;
  for (const modelId of MODELS) {
    try {
      const text = await callGemini(modelId);
      const result = parseJson(text);
      return res.status(200).json({ ...result, _model: modelId });
    } catch (e) {
      lastError = e;
      const isQuota = e.message?.toLowerCase().includes("quota") || e.message?.toLowerCase().includes("rate");
      if (!isQuota) break;
    }
  }
  res.status(500).json({ error: friendlyError(lastError?.message) });
};
