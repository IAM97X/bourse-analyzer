export const MARKETS_CFG = [
  { id: "nyse",  nom: "NYSE",      flag: "🇺🇸", tz: "America/New_York", open: [9,30],  close: [16,0],  earlyClose: ["2026-11-27","2026-12-24"] },
  { id: "paris", nom: "Paris",     flag: "🇫🇷", tz: "Europe/Paris",     open: [9,0],   close: [17,30], earlyClose: ["2026-12-24","2026-12-31"] },
  { id: "lon",   nom: "Londres",   flag: "🇬🇧", tz: "Europe/London",    open: [8,0],   close: [16,30], earlyClose: [] },
  { id: "xetra", nom: "Francfort", flag: "🇩🇪", tz: "Europe/Berlin",    open: [9,0],   close: [20,0],  earlyClose: ["2026-12-24","2026-12-31"] },
  { id: "tokyo", nom: "Tokyo",     flag: "🇯🇵", tz: "Asia/Tokyo",       open: [9,0],   close: [15,30], earlyClose: [] },
];

// Source : Euronext / bourses officielles — calendrier 2026
// Pâques 2026 = 5 avril → Vendredi Saint = 3 avril, Lundi de Pâques = 6 avril
// Ascension = 14 mai, Pentecôte = 24 mai, Lundi de Pentecôte = 25 mai
export const MARKET_HOLIDAYS = {
  // Euronext Paris — jours de fermeture officiels
  paris: [
    "2026-01-01", // Jour de l'An
    "2026-04-03", // Vendredi Saint
    "2026-04-06", // Lundi de Pâques
    "2026-05-01", // Fête du Travail
    "2026-05-08", // Victoire 1945
    "2026-05-14", // Ascension
    "2026-05-25", // Lundi de Pentecôte
    "2026-07-14", // Fête Nationale
    "2026-08-15", // Assomption
    "2026-11-01", // Toussaint
    "2026-11-11", // Armistice
    "2026-12-25", // Noël
  ],
  // NYSE — calendrier officiel 2026
  nyse: [
    "2026-01-01", // New Year's Day
    "2026-01-19", // MLK Day
    "2026-02-16", // Presidents' Day
    "2026-04-03", // Good Friday
    "2026-05-25", // Memorial Day
    "2026-06-19", // Juneteenth
    "2026-07-04", // Independence Day (observé 3 juillet si vendredi)
    "2026-09-07", // Labor Day
    "2026-11-26", // Thanksgiving
    "2026-12-25", // Christmas
  ],
  // London Stock Exchange
  lon: [
    "2026-01-01", // New Year's Day
    "2026-04-03", // Good Friday
    "2026-04-06", // Easter Monday
    "2026-05-04", // Early May Bank Holiday
    "2026-05-25", // Spring Bank Holiday
    "2026-08-31", // Summer Bank Holiday
    "2026-12-25", // Christmas
    "2026-12-28", // Boxing Day (observé)
  ],
  // Xetra (Francfort) — Deutsche Börse
  xetra: [
    "2026-01-01", // Neujahr
    "2026-04-03", // Karfreitag
    "2026-04-06", // Ostermontag
    "2026-05-01", // Tag der Arbeit
    "2026-12-24", // Heiligabend (fermeture anticipée déjà dans earlyClose)
    "2026-12-25", // 1. Weihnachtstag
    "2026-12-31", // Silvester (fermeture anticipée)
  ],
  // Tokyo Stock Exchange
  tokyo: [
    "2026-01-01", // 元日
    "2026-01-12", // 成人の日
    "2026-02-11", // 建国記念の日
    "2026-02-23", // 天皇誕生日
    "2026-03-20", // 春分の日
    "2026-04-29", // 昭和の日
    "2026-05-03", // 憲法記念日
    "2026-05-04", // みどりの日
    "2026-05-05", // こどもの日
    "2026-07-20", // 海の日
    "2026-09-21", // 敬老の日
    "2026-09-23", // 秋分の日
    "2026-10-12", // スポーツの日
    "2026-11-03", // 文化の日
    "2026-11-23", // 勤労感謝の日
  ],
};

export function getMarketStatus(cfg, now = new Date()) {
  const dayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone: cfg.tz, weekday: "short" }).format(now);
  const dateStr   = new Intl.DateTimeFormat("fr-CA", { timeZone: cfg.tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const hhmm      = new Intl.DateTimeFormat("fr-FR", { timeZone: cfg.tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const [hh, mm]  = hhmm.split(":").map(Number);
  if (dayOfWeek === "Sat" || dayOfWeek === "Sun") return { open: false, reason: "Week-end", hhmm };
  if ((MARKET_HOLIDAYS[cfg.id] || []).includes(dateStr)) return { open: false, reason: "Férié", hhmm };
  const cur = hh * 60 + mm;
  const opn = cfg.open[0] * 60 + cfg.open[1];
  const isEarlyClose = (cfg.earlyClose || []).includes(dateStr);
  const cls = isEarlyClose ? 14 * 60 : cfg.close[0] * 60 + cfg.close[1];
  if (cur < opn) return { open: false, reason: `Ouvre ${cfg.open[0]}h${String(cfg.open[1]).padStart(2,"0")}`, hhmm };
  if (cur >= cls) return { open: false, reason: "Clôturé", hhmm };
  if (isEarlyClose) return { open: true, reason: "Ouvert (clôt. 14h)", hhmm };
  return { open: true, reason: "Ouvert", hhmm };
}
