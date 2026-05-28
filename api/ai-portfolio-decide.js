// POST /api/ai-portfolio-decide
// Reçoit l'état du portefeuille IA + les cours actuels, retourne les décisions BUY/SELL/HOLD

const PEA_UNIVERSE = [
  { symbol: "CW8.PA",   nom: "Amundi MSCI World",        secteur: "ETF Monde" },
  { symbol: "PANX.PA",  nom: "Amundi Nasdaq-100",         secteur: "ETF Tech" },
  { symbol: "PUST.PA",  nom: "Amundi S&P 500 ESG",        secteur: "ETF USA" },
  { symbol: "EWLD.PA",  nom: "iShares MSCI World PEA",    secteur: "ETF Monde" },
  { symbol: "AI.PA",    nom: "Air Liquide",                secteur: "Industrie" },
  { symbol: "MC.PA",    nom: "LVMH",                       secteur: "Luxe" },
  { symbol: "TTE.PA",   nom: "TotalEnergies",              secteur: "Énergie" },
  { symbol: "SAN.PA",   nom: "Sanofi",                     secteur: "Santé" },
  { symbol: "OR.PA",    nom: "L'Oréal",                    secteur: "Cosmétiques" },
  { symbol: "BNP.PA",   nom: "BNP Paribas",                secteur: "Banque" },
  { symbol: "SU.PA",    nom: "Schneider Electric",         secteur: "Industrie" },
  { symbol: "AXA.PA",   nom: "AXA",                        secteur: "Assurance" },
  { symbol: "EL.PA",    nom: "EssilorLuxottica",           secteur: "Santé" },
  { symbol: "ASML.AS",  nom: "ASML Holding",               secteur: "Semi-conducteurs" },
  { symbol: "ADYEN.AS", nom: "Adyen",                      secteur: "Fintech" },
  { symbol: "CAP.PA",   nom: "Capgemini",                  secteur: "Tech" },
  { symbol: "DSY.PA",   nom: "Dassault Systèmes",          secteur: "Tech" },
  { symbol: "STMPA.PA", nom: "STMicroelectronics",         secteur: "Semi-conducteurs" },
  { symbol: "SAF.PA",   nom: "Safran",                     secteur: "Aéronautique" },
  { symbol: "AIR.PA",   nom: "Airbus",                     secteur: "Aéronautique" },
  { symbol: "RMS.PA",   nom: "Hermès",                     secteur: "Luxe" },
  { symbol: "KER.PA",   nom: "Kering",                     secteur: "Luxe" },
  { symbol: "GLE.PA",   nom: "Société Générale",           secteur: "Banque" },
  { symbol: "HO.PA",    nom: "Thales",                     secteur: "Défense" },
  { symbol: "AM.PA",    nom: "Dassault Aviation",          secteur: "Défense" },
  { symbol: "DG.PA",    nom: "Vinci",                      secteur: "Infrastructure" },
  { symbol: "ENGI.PA",  nom: "Engie",                      secteur: "Énergie" },
  { symbol: "PUB.PA",   nom: "Publicis",                   secteur: "Médias/IA" },
  { symbol: "ORA.PA",   nom: "Orange",                     secteur: "Télécoms" },
  { symbol: "CA.PA",    nom: "Carrefour",                  secteur: "Distribution" },
  { symbol: "LR.PA",    nom: "Legrand",                    secteur: "Industrie" },
  { symbol: "TEP.PA",   nom: "Teleperformance",            secteur: "Tech Services" },
  { symbol: "MT.AS",    nom: "ArcelorMittal",              secteur: "Métaux" },
  { symbol: "BESI.AS",  nom: "BE Semiconductor",           secteur: "Semi-conducteurs" },
  { symbol: "SOI.PA",   nom: "Soitec",                     secteur: "Semi-conducteurs" },
  { symbol: "ALO.PA",   nom: "Alstom",                     secteur: "Transports" },
  { symbol: "RNO.PA",   nom: "Renault",                    secteur: "Automobile" },
  { symbol: "BIOR.PA",  nom: "BioMérieux",                 secteur: "Biotech" },
  { symbol: "ERF.PA",   nom: "Eurofins Scientific",        secteur: "Biotech" },
  { symbol: "VIRP.PA",  nom: "Virbac",                     secteur: "Santé animale" },
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "Service IA non configuré" });

  const { portfolio, prices, account, session_type, courtier_info, dca_injected, dca_amount, courtier_min_ordre, courtier_min_etf } = req.body || {};
  if (!portfolio || !prices) return res.status(400).json({ error: "Données manquantes" });

  const valeurTotale = portfolio.cash + (portfolio.positions || []).reduce((s, p) => {
    const c = prices[p.ticker] || p.dernier_cours || p.prix_achat_moyen;
    return s + p.quantite * (c || 0);
  }, 0);

  const perfTotal = portfolio.capital_initial > 0
    ? (((valeurTotale - portfolio.capital_initial) / portfolio.capital_initial) * 100).toFixed(2)
    : "0.00";

  const univAvecPrix = PEA_UNIVERSE
    .filter(s => prices[s.symbol])
    .map(s => `- ${s.nom} (${s.symbol}): ${prices[s.symbol]}€ [${s.secteur}]`)
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

  const sessionCtx = session_type === "OUVERTURE"
    ? "SESSION OUVERTURE (9h05) : Cherche les opportunités d'achat, déploie le cash disponible sur les meilleures convictions du moment. Achats prioritaires."
    : session_type === "CLÔTURE"
    ? "SESSION CLÔTURE (17h15) : Revois les positions en perte, coupe les stops-loss atteints, sécurise les gains excessifs. Ventes prioritaires si nécessaire."
    : "CYCLE MANUEL : Analyse complète buy/sell/hold.";

  const courtierCtx = courtier_info
    ? `\n=== CONTRAINTES COURTIER ===\n${courtier_info}`
    : "";

  const dcaCtx = dca_injected && dca_amount > 0
    ? `\n⚡ DCA MENSUEL INJECTÉ CE CYCLE: +${dca_amount}€ viennent d'être ajoutés au cash disponible (apport mensuel du 1er du mois). Priorité absolue : déployer une partie de cet apport en positions de conviction, en complément du cash existant.`
    : "";

  const userMsg = `DATE DU CYCLE: ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
${sessionCtx}${courtierCtx}${dcaCtx}

=== ÉTAT DU PORTEFEUILLE IA (${account || 'PEA'}) ===
Capital initial: ${portfolio.capital_initial}€
Cash disponible: ${portfolio.cash.toFixed(2)}€
Valeur totale: ${valeurTotale.toFixed(2)}€
Performance depuis création: ${perfTotal}%
Nombre de positions: ${portfolio.positions?.length || 0}

POSITIONS ACTUELLES:
${positionsText}

DERNIERS TRADES (historique):
${lastTradesText}

=== UNIVERS INVESTISSABLE PEA (cours temps réel) ===
${univAvecPrix}

=== CONTRAINTES STRICTES ===
- Maximum 5 transactions par cycle (BUY + SELL combinés)
- Position max par titre: ${posMax}€ (20% du capital)
- Cash minimum à conserver: ${cashMin}€ (5%)
- Avant tout BUY: vérifier que quantite × cours ≤ cash_disponible - ${cashMin}€
${minOrdreNum > 0 ? `- Ordre minimum courtier: ${minOrdreNum}€ par transaction (actions). NE PAS placer d'ordre < ${minOrdreNum}€.` : ""}
${minETFNum > 0 ? `- Ordre minimum ETF: ${minETFNum}€ par transaction. NE PAS acheter un ETF pour < ${minETFNum}€.` : ""}
- Pas d'achat fractionné : arrondir à l'entier inférieur (Math.floor)
- Si 1er cycle (aucune position): déployer 60-70% en 3-5 positions diversifiées sectoriellement
- Éviter de vendre une position achetée au cycle précédent sans raison forte

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
      parts: [{ text: "Tu es un gestionnaire de portefeuille IA autonome gérant un PEA réel. Tu tournes 2 fois par jour : à l'ouverture (achats) et à la clôture (revue/ventes). Tu hérites des positions et liquidités réelles de l'investisseur et tu prends le relais de façon autonome. Ton objectif : battre le marché (CAC40/MSCI World) et l'investisseur humain sur le long terme. Tu respectes strictement les contraintes du courtier (minimums, frais, pas de fractionné). Tu raisonnes comme un professionnel : analyse macro, momentum, rotation sectorielle, gestion du drawdown. Tu es discipliné, rationnel, sans émotions. Chaque décision est justifiée en une phrase précise et factuelle." }]
    },
    contents: [{ role: "user", parts: [{ text: userMsg }] }],
    generationConfig: { maxOutputTokens: 2000, temperature: 0.35 },
  };

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }
    );
    const data = await upstream.json();
    if (data.error) throw new Error(data.error.message || "Erreur Gemini");

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
    if (!text) throw new Error("Réponse vide de l'IA");

    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
    if (s === -1 || e === -1) throw new Error("JSON introuvable dans la réponse IA");

    const result = JSON.parse(clean.substring(s, e + 1));
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
