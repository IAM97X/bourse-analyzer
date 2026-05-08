export const MARKETS_CFG = [
  { id: "nyse",  nom: "NYSE",      flag: "🇺🇸", tz: "America/New_York", open: [9,30],  close: [16,0],  earlyClose: [] },
  { id: "paris", nom: "Paris",     flag: "🇫🇷", tz: "Europe/Paris",     open: [9,0],   close: [17,30], earlyClose: ["2026-12-24","2026-12-31"] },
  { id: "lon",   nom: "Londres",   flag: "🇬🇧", tz: "Europe/London",    open: [8,0],   close: [16,30], earlyClose: [] },
  { id: "xetra", nom: "Francfort", flag: "🇩🇪", tz: "Europe/Berlin",    open: [9,0],   close: [20,0],  earlyClose: ["2026-12-24","2026-12-31"] },
  { id: "tokyo", nom: "Tokyo",     flag: "🇯🇵", tz: "Asia/Tokyo",       open: [9,0],   close: [15,30], earlyClose: [] },
];

// Source : Euronext / Fortuneo — seules les clôtures officielles
export const MARKET_HOLIDAYS = {
  nyse:  ["2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"],
  paris: ["2026-01-01","2026-04-03","2026-04-06","2026-05-01","2026-12-25"],
  lon:   ["2026-01-01","2026-04-03","2026-04-06","2026-05-04","2026-05-25","2026-08-31","2026-12-25","2026-12-28"],
  xetra: ["2026-01-01","2026-04-03","2026-04-06","2026-05-01","2026-12-25"],
  tokyo: ["2026-01-01","2026-01-12","2026-02-11","2026-02-23","2026-03-20","2026-04-29","2026-05-03","2026-05-04","2026-05-05","2026-07-20","2026-09-21","2026-09-23","2026-10-12","2026-11-03","2026-11-23"],
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
