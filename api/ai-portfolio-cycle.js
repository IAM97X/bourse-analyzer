// GET /api/ai-portfolio-cycle (Vercel Cron — chaque dimanche 21h UTC)
// Traite tous les portefeuilles IA actifs en Supabase
// Prérequis Vercel env vars: SUPABASE_SERVICE_KEY, CRON_SECRET, GEMINI_API_KEY

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "fr-FR,fr;q=0.9",
  "Referer": "https://finance.yahoo.com/",
};

const PEA_SYMBOLS = [
  "CW8.PA","PANX.PA","PUST.PA","EWLD.PA","AI.PA","MC.PA","TTE.PA","SAN.PA",
  "OR.PA","BNP.PA","SU.PA","AXA.PA","EL.PA","ASML.AS","ADYEN.AS","CAP.PA",
  "DSY.PA","STMPA.PA","SAF.PA","AIR.PA","RMS.PA","KER.PA","GLE.PA","HO.PA",
  "AM.PA","DG.PA","ENGI.PA","PUB.PA","ORA.PA","CA.PA","LR.PA","TEP.PA",
  "MT.AS","BESI.AS","SOI.PA","ALO.PA","RNO.PA","BIOR.PA","ERF.PA","VIRP.PA",
];

const PEA_META = {
  "CW8.PA":"Amundi MSCI World (ETF Monde)","PANX.PA":"Amundi Nasdaq-100 (ETF Tech)",
  "PUST.PA":"Amundi S&P 500 (ETF USA)","EWLD.PA":"iShares MSCI World PEA (ETF Monde)",
  "AI.PA":"Air Liquide (Industrie)","MC.PA":"LVMH (Luxe)","TTE.PA":"TotalEnergies (Énergie)",
  "SAN.PA":"Sanofi (Santé)","OR.PA":"L'Oréal (Cosmétiques)","BNP.PA":"BNP Paribas (Banque)",
  "SU.PA":"Schneider Electric (Industrie)","AXA.PA":"AXA (Assurance)","EL.PA":"EssilorLuxottica (Santé)",
  "ASML.AS":"ASML (Semi-conducteurs)","ADYEN.AS":"Adyen (Fintech)","CAP.PA":"Capgemini (Tech)",
  "DSY.PA":"Dassault Systèmes (Tech)","STMPA.PA":"STMicroelectronics (Semi)","SAF.PA":"Safran (Aéro)",
  "AIR.PA":"Airbus (Aéro)","RMS.PA":"Hermès (Luxe)","KER.PA":"Kering (Luxe)",
  "GLE.PA":"Société Générale (Banque)","HO.PA":"Thales (Défense)","AM.PA":"Dassault Aviation (Défense)",
  "DG.PA":"Vinci (Infrastructure)","ENGI.PA":"Engie (Énergie)","PUB.PA":"Publicis (Médias/IA)",
  "ORA.PA":"Orange (Télécoms)","CA.PA":"Carrefour (Distribution)","LR.PA":"Legrand (Industrie)",
  "TEP.PA":"Teleperformance (Tech)","MT.AS":"ArcelorMittal (Métaux)","BESI.AS":"BE Semiconductor",
  "SOI.PA":"Soitec (Semi)","ALO.PA":"Alstom (Transports)","RNO.PA":"Renault (Auto)",
  "BIOR.PA":"BioMérieux (Biotech)","ERF.PA":"Eurofins (Biotech)","VIRP.PA":"Virbac (Santé)",
};

async function fetchPrices(symbols) {
  const prices = {};
  const chunks = [];
  for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
  await Promise.all(chunks.map(async chunk => {
    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(','))}`;
      const r = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return;
      const data = await r.json();
      (data?.quoteResponse?.result || []).forEach(q => {
        const p = q.regularMarketPrice || q.previousClose;
        if (p) prices[q.symbol] = p;
      });
    } catch {}
  }));
  return prices;
}

function applyDecisions(portfolio, decisions, prices) {
  let cash = portfolio.cash;
  let positions = (portfolio.positions || []).map(p => ({ ...p }));
  const newTrades = [];

  for (const d of (decisions || [])) {
    if (d.action === "HOLD" || !d.quantite || d.quantite <= 0) continue;
    const prix = prices[d.ticker] || d.cours || 0;
    if (!prix) continue;

    if (d.action === "BUY") {
      const montant = d.quantite * prix;
      const cashMin = portfolio.capital_initial > 0 ? portfolio.capital_initial * 0.05 : 100;
      if (montant > cash - cashMin) continue;
      cash -= montant;
      const existing = positions.find(p => p.ticker === d.ticker);
      if (existing) {
        const tot = existing.quantite + d.quantite;
        existing.prix_achat_moyen = (existing.prix_achat_moyen * existing.quantite + prix * d.quantite) / tot;
        existing.quantite = tot;
        existing.dernier_cours = prix;
      } else {
        positions.push({ ticker: d.ticker, nom: d.nom, quantite: d.quantite, prix_achat_moyen: prix, dernier_cours: prix });
      }
      newTrades.push({ date: new Date().toISOString(), action: "BUY", ticker: d.ticker, nom: d.nom, quantite: d.quantite, prix, montant, raison: d.raison || "" });
    } else if (d.action === "SELL") {
      const existing = positions.find(p => p.ticker === d.ticker);
      if (!existing || existing.quantite < d.quantite) continue;
      const montant = d.quantite * prix;
      cash += montant;
      existing.quantite -= d.quantite;
      existing.dernier_cours = prix;
      if (existing.quantite === 0) positions = positions.filter(p => p.ticker !== d.ticker);
      newTrades.push({ date: new Date().toISOString(), action: "SELL", ticker: d.ticker, nom: d.nom, quantite: d.quantite, prix, montant, raison: d.raison || "" });
    }
  }

  positions.forEach(p => { if (prices[p.ticker]) p.dernier_cours = prices[p.ticker]; });

  const valeur = cash + positions.reduce((s, p) => s + p.quantite * (p.dernier_cours || p.prix_achat_moyen), 0);
  const snapshot = { date: new Date().toISOString().slice(0, 10), valeur };

  return {
    ...portfolio,
    cash,
    positions,
    trades: [...newTrades, ...(portfolio.trades || [])].slice(0, 100),
    snapshots: [...(portfolio.snapshots || []), snapshot].filter((s, i, a) => a.findIndex(x => x.date === s.date) === i).slice(-365),
    last_cycle: new Date().toISOString(),
  };
}

async function callGemini(portfolio, prices) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY manquante");

  const val = portfolio.cash + (portfolio.positions || []).reduce((s, p) => {
    return s + p.quantite * (prices[p.ticker] || p.dernier_cours || p.prix_achat_moyen);
  }, 0);

  const univStr = PEA_SYMBOLS.filter(s => prices[s]).map(s => `${s}=${prices[s]}€ (${PEA_META[s] || s})`).join(', ');
  const posStr = portfolio.positions?.length > 0
    ? portfolio.positions.map(p => {
        const c = prices[p.ticker] || p.dernier_cours || p.prix_achat_moyen;
        const pv = ((c - p.prix_achat_moyen) / (p.prix_achat_moyen || 1) * 100).toFixed(1);
        return `${p.nom}(${p.ticker})×${p.quantite} PRU=${p.prix_achat_moyen}€ cours=${c}€ PV=${pv}%`;
      }).join(' | ')
    : "AUCUNE POSITION – 1er cycle, déployer 60-70%";

  const perf = portfolio.capital_initial > 0 ? (((val - portfolio.capital_initial) / portfolio.capital_initial) * 100).toFixed(1) : "0.0";
  const posMax = (val * 0.20).toFixed(0);
  const cashMin = (val * 0.05).toFixed(0);

  const userMsg = `DATE: ${new Date().toLocaleDateString('fr-FR')}
PORTEFEUILLE: cash=${portfolio.cash.toFixed(0)}€ valeur=${val.toFixed(0)}€ perf=${perf}%
POSITIONS: ${posStr}
UNIVERS(prix): ${univStr}
CONTRAINTES: max5trades pos_max=${posMax}€ cash_min=${cashMin}€
Retourne JSON strict uniquement:
{"decisions":[{"action":"BUY|SELL|HOLD","ticker":"...","nom":"...","quantite":N,"cours":X,"raison":"..."}],"strategie":"..."}`;

  const body = {
    systemInstruction: { parts: [{ text: "Gestionnaire portefeuille PEA autonome. Objectif: battre CAC40 et l'investisseur humain. Décisions rationnelles basées sur momentum, valorisation, risque. JSON strict uniquement, sans markdown." }] },
    contents: [{ role: "user", parts: [{ text: userMsg }] }],
    generationConfig: { maxOutputTokens: 1500, temperature: 0.3 },
  };

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) }
  );
  const data = await r.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
  if (!text) throw new Error("Réponse vide");
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s === -1) throw new Error("JSON introuvable");
  return JSON.parse(clean.substring(s, e + 1));
}

module.exports = async function handler(req, res) {
  // Vercel cron injecte Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers["authorization"] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({
      error: "SUPABASE_SERVICE_KEY manquante — configurez-la dans les env vars Vercel (Settings → Environment Variables)."
    });
  }

  const sbHeaders = {
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  try {
    // Lecture de tous les portefeuilles IA actifs
    const listRes = await fetch(
      `${supabaseUrl}/rest/v1/user_data?key=eq.bourse_ai_portfolio&select=user_id,value`,
      { headers: sbHeaders }
    );
    const rows = await listRes.json();
    if (!Array.isArray(rows)) throw new Error("Réponse Supabase inattendue");

    const active = rows.filter(r => r.value?.active === true);
    if (!active.length) return res.status(200).json({ message: "Aucun portefeuille IA actif", processed: 0 });

    // Récupération des cours (une seule fois pour tous les utilisateurs)
    const allTickers = [...new Set([
      ...PEA_SYMBOLS,
      ...active.flatMap(r => (r.value?.positions || []).map(p => p.ticker)),
    ])];
    const prices = await fetchPrices(allTickers);

    let processed = 0;
    const errors = [];

    for (const { user_id, value: portfolio } of active) {
      try {
        const { decisions, strategie } = await callGemini(portfolio, prices);
        const updated = applyDecisions(portfolio, decisions || [], prices);
        updated.strategie_courante = strategie || portfolio.strategie_courante;

        await fetch(`${supabaseUrl}/rest/v1/user_data`, {
          method: "POST",
          headers: { ...sbHeaders, "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify({
            user_id,
            key: "bourse_ai_portfolio",
            value: updated,
            updated_at: new Date().toISOString(),
          }),
        });

        processed++;
        // Délai entre utilisateurs pour éviter rate limits Gemini
        if (active.indexOf(active.find(r => r.user_id === user_id)) < active.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e) {
        errors.push({ user_id: user_id?.slice(0, 8) + "…", error: e.message });
      }
    }

    res.status(200).json({
      processed,
      total: active.length,
      prices_fetched: Object.keys(prices).length,
      ...(errors.length ? { errors } : {}),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
