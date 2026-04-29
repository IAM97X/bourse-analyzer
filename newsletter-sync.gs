/**
 * ══════════════════════════════════════════════════════════════════
 *  Bourse Analyzer — Newsletter Sync
 *  Google Apps Script : Gmail → Google Sheets → CSV public
 * ══════════════════════════════════════════════════════════════════
 *
 *  SETUP (à faire une seule fois) :
 *  ─────────────────────────────────────────────────────────────────
 *  1. Crée un nouveau Google Sheet (sheets.google.com)
 *  2. Extensions → Apps Script → colle ce fichier entier
 *  3. En haut, remplace SHEET_ID par l'ID de ton Sheet
 *     (visible dans l'URL : .../spreadsheets/d/TON_ID/edit)
 *  4. Dans Gmail, crée le label "Bourse" (Paramètres → Labels)
 *     et applique-le aux expéditeurs de newsletters financières
 *  5. Clique sur "Exécuter" → choisis processNewsletters()
 *     → Autorise les permissions demandées
 *  6. Déclencheurs → Ajouter un déclencheur :
 *       Fonction : processNewsletters
 *       Événement : Basé sur le temps → Toutes les heures
 *  7. Dans le Sheet, Fichier → Partager et publier →
 *       "Publier le contenu et les paramètres" → Feuille "newsletters"
 *       → Format CSV → Copier le lien
 *  8. Colle ce lien dans App.js à la constante NEWSLETTER_CSV_URL
 * ══════════════════════════════════════════════════════════════════
 */

// ── Configuration ──────────────────────────────────────────────────
const SHEET_ID       = "1FRFRoL79Jg5C92ea6eEwWED0buQ1uXSnQJww5RRTGFw";
const GMAIL_LABEL    = "Bourse";              // label Gmail source
const DONE_LABEL     = "Bourse/Traité";       // label appliqué après traitement
const MAX_BODY       = 2500;                  // caractères max du corps gardés
const MAX_THREADS    = 100;                   // threads par exécution

// Stocks à détecter dans les emails (ajoute tes propres valeurs)
const STOCK_KEYWORDS = {
  "technip"          : "Technip Energies",
  "te-fmc"           : "Technip Energies",
  "smaio"            : "SMAIO",
  "entech"           : "ENTECH",
  "inventiva"        : "Inventiva",
  "kalray"           : "KALRAY",
  "amundi"           : "Amundi",
  "msci world"       : "MSCI World",
  "pea monde"        : "Amundi PEA Monde",
  "lvmh"             : "LVMH",
  "totalenergies"    : "TotalEnergies",
  "total energies"   : "TotalEnergies",
  "airbus"           : "Airbus",
  "bnp"              : "BNP Paribas",
  "cac 40"           : "CAC 40",
  "cac40"            : "CAC 40",
  "euronext"         : "Euronext",
  "nvidia"           : "Nvidia",
  "apple"            : "Apple",
  "microsoft"        : "Microsoft",
  "amazon"           : "Amazon",
  "alphabet"         : "Alphabet",
  "google"           : "Alphabet",
  "meta"             : "Meta",
  "tesla"            : "Tesla",
};

// ── Point d'entrée principal ────────────────────────────────────────
function processNewsletters() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  let   sheet = ss.getSheetByName("newsletters");

  // Crée la feuille si elle n'existe pas
  if (!sheet) {
    sheet = ss.insertSheet("newsletters");
    sheet.appendRow(["date", "sender_name", "sender_email", "subject", "tickers", "body", "processed_at"]);
    sheet.setFrozenRows(1);
    sheet.getRange("A1:G1").setFontWeight("bold");
    sheet.setColumnWidth(5, 200);
    sheet.setColumnWidth(6, 400);
  }

  // Récupère ou crée les labels
  const srcLabel  = getOrCreateLabel(GMAIL_LABEL);
  const doneLabel = getOrCreateLabel(DONE_LABEL);
  if (!srcLabel) { Logger.log("Label Gmail '" + GMAIL_LABEL + "' introuvable."); return; }

  const threads = srcLabel.getThreads(0, MAX_THREADS);
  let   count   = 0;

  for (const thread of threads) {
    // Saute si déjà traité
    const labels = thread.getLabels().map(l => l.getName());
    if (labels.includes(DONE_LABEL)) continue;

    const messages = thread.getMessages();
    for (const msg of messages) {
      const date        = Utilities.formatDate(msg.getDate(), "Europe/Paris", "yyyy-MM-dd");
      const senderRaw   = msg.getFrom();                          // "Nom <email@domain.com>"
      const senderName  = extractName(senderRaw);
      const senderEmail = extractEmail(senderRaw);
      const subject     = msg.getSubject();
      const bodyRaw     = msg.getPlainBody() || msg.getBody().replace(/<[^>]+>/g, " ");
      const body        = cleanBody(bodyRaw).slice(0, MAX_BODY);
      const tickers     = detectTickers(subject + " " + body).join(", ");
      const processedAt = new Date().toISOString();

      sheet.appendRow([date, senderName, senderEmail, subject, tickers, body, processedAt]);
      count++;
    }

    // Marque le thread comme traité
    thread.addLabel(doneLabel);
  }

  Logger.log("Newsletters traitées : " + count);
}

// ── Supprimer les doublons (utilitaire manuel) ──────────────────────
function removeDuplicates() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("newsletters");
  if (!sheet) return;
  const data    = sheet.getDataRange().getValues();
  const seen    = new Set();
  const toKeep  = [data[0]]; // garde l'en-tête
  for (let i = 1; i < data.length; i++) {
    const key = data[i][2] + "|" + data[i][3]; // email + subject
    if (!seen.has(key)) { seen.add(key); toKeep.push(data[i]); }
  }
  sheet.clearContents();
  sheet.getRange(1, 1, toKeep.length, toKeep[0].length).setValues(toKeep);
}

// ── Helpers ─────────────────────────────────────────────────────────
function getOrCreateLabel(name) {
  try {
    return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
  } catch(e) {
    Logger.log("Erreur label : " + e);
    return null;
  }
}

function extractName(raw) {
  const m = raw.match(/^"?([^"<]+)"?\s*</);
  return m ? m[1].trim() : raw.split("@")[0];
}

function extractEmail(raw) {
  const m = raw.match(/<([^>]+)>/);
  return m ? m[1] : raw;
}

function cleanBody(text) {
  return text
    .replace(/https?:\/\/\S+/g, "")        // retire les URLs
    .replace(/[^\x00-\x7FÀ-ÿ]/g, " ")     // garde latin + accents
    .replace(/\s{3,}/g, "\n")              // réduit les espaces multiples
    .trim();
}

function detectTickers(text) {
  const lower  = text.toLowerCase();
  const found  = new Set();
  for (const [kw, name] of Object.entries(STOCK_KEYWORDS)) {
    if (lower.includes(kw)) found.add(name);
  }
  return [...found];
}
