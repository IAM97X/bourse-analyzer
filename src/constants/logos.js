export const LOGO_DB = {
  isin: {
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
    "NL0014559478": "technipenergies.com",
    "NL0010273215": "airbus.com",
    "NL00150001Q9": "stellantis.com",
    "FR0013505062": "smaio.com",
    "FR0011950732": "kalray.eu",
    "FR0013334298": "inventiva-pharma.com",
    "FR0014007ND6": "haffner-energy.com",
    "FR0004152700": "entech-se.com",
    "FR0010655696": "amundi.com",
    "LU1681042864": "amundi.com",
    "LU1050469367": "amundi.com",
    "FR0013412285": "amundi.com",
    "LU2089238203": "amundi.com",
    "IE00B4L5Y983": "ishares.com",
    "IE00B3XXRP09": "ishares.com",
    "FR0011869353": "lyxor.com",
    "LU0392494562": "db-xtrackers.com",
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

export function resolveLogoUrl(nom, isin) {
  if (isin && LOGO_DB.isin[isin]) return `https://logo.clearbit.com/${LOGO_DB.isin[isin]}`;
  const lower = (nom || "").toLowerCase();
  for (const [kw, domain] of LOGO_DB.name) {
    if (lower.includes(kw)) return `https://logo.clearbit.com/${domain}`;
  }
  return null;
}

export function avatarColor(str) {
  const PALETTE = ["#052659","#5483B3","#059669","#D97706","#7C3AED","#0891B2","#DC2626","#BE185D","#1D4ED8","#065F46"];
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function deriveBaseName(nom) {
  return (nom || "")
    .replace(/\s+(S\.?A\.?[SD]?\.?|N\.?V\.?|S\.?E\.?|Ltd\.?|PLC|Inc\.?|Corp\.?)$/gi, "")
    .replace(/\s+PEA\s+.*$/i, "")
    .replace(/\s+(ETF|UCITS|ACC|DIST|MSCI|World|Monde|Emergent|Emerging|ESG|Transition).*$/i, "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function buildLogoSources(nom, isin) {
  const sources = [];
  const dbDomain = (() => {
    if (isin && LOGO_DB.isin[isin]) return LOGO_DB.isin[isin];
    const lower = (nom || "").toLowerCase();
    for (const [kw, d] of LOGO_DB.name) { if (lower.includes(kw)) return d; }
    return null;
  })();
  if (dbDomain) sources.push({ url: `https://logo.clearbit.com/${dbDomain}`, cover: "72%" });
  if (isin) {
    sources.push({ url: `https://live.euronext.com/sites/default/files/thumbnails/image/${isin}.jpg`,       cover: "90%" });
    sources.push({ url: `https://live.euronext.com/sites/default/files/thumbnails/image/${isin}-XPAR.jpg`, cover: "90%" });
    sources.push({ url: `https://live.euronext.com/sites/default/files/thumbnails/image/${isin}-ALXP.jpg`, cover: "90%" });
  }
  if (dbDomain) sources.push({ url: `https://www.google.com/s2/favicons?sz=128&domain=${dbDomain}`, cover: "58%" });
  const guessBase = deriveBaseName(nom);
  if (guessBase && guessBase.length >= 3 && !dbDomain?.startsWith(guessBase)) {
    sources.push({ url: `https://www.google.com/s2/favicons?sz=128&domain=${guessBase}.com`, cover: "58%" });
    sources.push({ url: `https://www.google.com/s2/favicons?sz=128&domain=${guessBase}.fr`,  cover: "58%" });
  }
  return sources;
}
