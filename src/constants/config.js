import { C } from "./theme";

export const UI = { IDLE: "idle", LOADING: "loading", RESULT: "result", ERROR: "error" };

export const SIGNAL_CONFIG = {
  ACHAT:     { color: C.green,    bg: C.greenLight, border: "rgba(5,150,105,0.2)",   icon: "▲" },
  RENFORCER: { color: C.navy,     bg: C.navyLight,  border: "rgba(30,58,95,0.12)",    icon: "+" },
  ATTENDRE:  { color: C.goldDark, bg: C.goldLight,  border: "rgba(217,119,6,0.2)",   icon: "◆" },
  PRUDENCE:  { color: C.red,      bg: C.redLight,   border: "rgba(220,38,38,0.2)",   icon: "▼" },
  VENDRE:    { color: C.danger,   bg: C.dangerBg,   border: C.danger,                icon: "✕" },
};

export const RISQUE_PCT = { prudent: 0.05, equilibre: 0.10, dynamique: 0.15, "tres-dynamique": 0.20 };

export const DEFAULT_PROFIL = { capital: 0, horizon: "moyen", risque: "equilibre", especesPEA: 0, especesCTO: 0, versementsPEA: 0, versementsCTO: 0, dcaMensuel: 0, dcaDuree: 12, courtierPEA: "boursobank", courtierCTO: "degiro" };
export const DEFAULT_POSITIONS = [];

export const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

export const SECTEUR_MAP = {
  "Healthcare":              "Santé",
  "Technology":              "Technologies",
  "Information Technology":  "Technologies",
  "Energy":                  "Énergie",
  "Financials":              "Finance",
  "Financial Services":      "Finance",
  "Consumer Cyclical":       "Conso. cyclique",
  "Consumer Defensive":      "Conso. de base",
  "Industrials":             "Industrie",
  "Basic Materials":         "Matières premières",
  "Real Estate":             "Immobilier",
  "Communication Services":  "Communication",
  "Utilities":               "Services publics",
};
export function translateSecteur(raw) {
  return SECTEUR_MAP[raw] || SECTEUR_MAP[raw?.trim()] || raw;
}
