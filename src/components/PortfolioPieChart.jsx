import { useState } from "react";
import { C, shadow } from "../constants/theme";
import { fmtEur } from "../lib/finance";

const PIE_COLORS = ["#1A3A5C","#C8972A","#2E7D52","#C0392B","#5B4A8A","#1A7A8A","#8A5B1A","#4A7A2E","#8A1A5B","#2A5B8A"];
const SECTOR_COLORS = ["#2E7D52","#1A3A5C","#C0392B","#C8972A","#5B4A8A","#1A7A8A","#8A5B1A","#8A1A5B","#4A7A2E","#2A5B8A","#6B4A2A","#2A6B5B"];

export const ISIN_SECTEUR = {
  "NL0014559478": "Énergie",
  "FR0014005I80": "Santé",
  "FR0014004362": "Énergie",
  "FR001400U5Q4": "ETF Monde",
  "FR0013233012": "Santé",
  "FR0004056851": "Santé",
  "FR0010722819": "Technologies",
  "FR0014001PM5": "Hydrogène",
  "FR0013412038": "ETF Émergents",
  "LU1681045370": "ETF Émergents",
  "LU0635178014": "ETF Émergents",
  "FR0011440478": "ETF Émergents",
  "IE00BYM11602": "ETF Émergents",
  "LU1900068328": "ETF Émergents",
  "FR0010959676": "ETF Émergents",
  "FR0000131104": "Finance",
  "FR0000120271": "Luxe",
  "FR0000120628": "Énergie",
  "NL0000235190": "Industrie",
  "US02079K3059": "Technologies",
  "US5949181045": "Technologies",
  "US0231351067": "Technologies",
  "US0378331005": "Technologies",
  "US67066G1040": "Technologies",
  "US88160R1014": "Automobile",
  "US30303M1027": "Technologies",
};

function buildArcs(slices, total, CX, CY, R, R_INNER) {
  let cumAngle = -Math.PI / 2;
  return slices.map(sl => {
    const rawPct = sl.valeur / total;
    const pct = rawPct >= 1 ? 0.9999 : rawPct;
    const startAngle = cumAngle;
    const endAngle = cumAngle + pct * 2 * Math.PI;
    cumAngle = endAngle;
    const x1  = CX + R       * Math.cos(startAngle), y1  = CY + R       * Math.sin(startAngle);
    const x2  = CX + R       * Math.cos(endAngle),   y2  = CY + R       * Math.sin(endAngle);
    const ix1 = CX + R_INNER * Math.cos(startAngle), iy1 = CY + R_INNER * Math.sin(startAngle);
    const ix2 = CX + R_INNER * Math.cos(endAngle),   iy2 = CY + R_INNER * Math.sin(endAngle);
    const large = pct > 0.5 ? 1 : 0;
    return { ...sl, pct, x1, y1, x2, y2, ix1, iy1, ix2, iy2, large };
  });
}

function DonutChart({ slices, total, CX = 110, CY = 110, R = 90, R_INNER = 44, hovered, setHovered, centerLabel }) {
  const arcs = buildArcs(slices, total, CX, CY, R, R_INNER);
  const hov  = hovered !== null ? arcs[hovered] : null;
  return (
    <svg width={CX * 2} height={CY * 2} viewBox={`0 0 ${CX * 2} ${CY * 2}`} style={{ flexShrink: 0 }}>
      {arcs.map((sl, i) => {
        const isHov = hovered === i;
        return (
          <path
            key={i}
            d={`M ${sl.ix1.toFixed(2)} ${sl.iy1.toFixed(2)} L ${sl.x1.toFixed(2)} ${sl.y1.toFixed(2)} A ${R} ${R} 0 ${sl.large} 1 ${sl.x2.toFixed(2)} ${sl.y2.toFixed(2)} L ${sl.ix2.toFixed(2)} ${sl.iy2.toFixed(2)} A ${R_INNER} ${R_INNER} 0 ${sl.large} 0 ${sl.ix1.toFixed(2)} ${sl.iy1.toFixed(2)} Z`}
            fill={sl.color}
            stroke={C.snow}
            strokeWidth="2.5"
            style={{ cursor: "pointer", transformOrigin: `${CX}px ${CY}px`, transform: isHov ? "scale(1.07)" : "scale(1)", transition: "transform 0.15s, opacity 0.15s" }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            opacity={hovered !== null && !isHov ? 0.4 : 1}
          />
        );
      })}
      {hov ? (
        <>
          <text x={CX} y={CY - 9} textAnchor="middle" fontSize="14" fontWeight="800" fill={hov.color} fontFamily="Inter, sans-serif">
            {(hov.pct * 100).toFixed(1)}%
          </text>
          <text x={CX} y={CY + 9} textAnchor="middle" fontSize="9" fill={C.inkMuted} fontFamily="Inter, sans-serif" fontWeight="600">
            {fmtEur(hov.valeur)}
          </text>
        </>
      ) : (
        <>
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill={C.ink} fontFamily="Inter, sans-serif">
            {centerLabel || fmtEur(total)}
          </text>
          <text x={CX} y={CY + 10} textAnchor="middle" fontSize="9" fill={C.inkSubtle} fontFamily="Inter, sans-serif">
            Total
          </text>
        </>
      )}
    </svg>
  );
}

function detectSecteurNom(nom) {
  const n = (nom || "").toLowerCase();
  if (n.includes("emergent") || n.includes("emerging"))                          return "ETF Émergents";
  if (n.includes("monde") || n.includes("world") || n.includes("msci world"))   return "ETF Monde";
  if (n.includes("europe") || n.includes("euro stoxx") || n.includes("eurostoxx") || n.includes("stoxx")) return "ETF Europe";
  if (n.includes("nasdaq") || n.includes("ndx"))                                 return "ETF Nasdaq";
  if (n.includes("s&p") || n.includes("s&p500") || n.includes("sp500") || n.includes("s&p 500")) return "ETF S&P 500";
  if (n.includes("usa") || n.includes("us equity") || n.includes("north america") || n.includes("amérique")) return "ETF Amérique";
  if (n.includes("asie") || n.includes("asia") || n.includes("japon") || n.includes("japan") || n.includes("pacific")) return "ETF Asie";
  if (n.includes("small cap") || n.includes("smallcap") || n.includes("petite cap")) return "ETF Small Cap";
  if (n.includes("divid"))                                                         return "ETF Dividendes";
  if (n.includes("défense") || n.includes("defense") || n.includes("sécurité"))  return "ETF Défense";
  if (n.includes("immob") || n.includes("reit"))                                  return "ETF Immobilier";
  if (n.includes("clean") || n.includes("green") || n.includes("renouvel") || n.includes("eau") || n.includes("water")) return "ETF Environnement";
  if (n.includes("tech") && (n.includes("etf") || n.includes("amundi") || n.includes("lyxor") || n.includes("ishares"))) return "ETF Tech";
  if (n.includes("haffner"))                                     return "Hydrogène";
  if (n.includes("hydrogène") || n.includes("hydrogen"))        return "Hydrogène";
  if (n.includes("technip") || n.includes("entech"))            return "Énergie";
  if (n.includes("totalenerg") || n.includes("total energ"))    return "Énergie";
  if (n.includes("smaio") || n.includes("inventiva"))           return "Santé";
  if (n.includes("valneva") || n.includes("median tech"))       return "Santé";
  if (n.includes("pea monde") || n.includes("msci world"))      return "ETF Monde";
  if (n.includes("pea emergent") || n.includes("msci emerging") || n.includes("emerging")) return "ETF Émergents";
  if (n.includes("kalray"))                                      return "Technologies";
  if (n.includes("airbus"))                                      return "Industrie";
  if (n.includes("lvmh") || n.includes("hermes") || n.includes("kering")) return "Luxe";
  if (n.includes("bnp") || n.includes("credit agr") || n.includes("societe gen")) return "Finance";
  if (n.includes("amundi") || n.includes("lyxor") || n.includes("ishares") || n.includes("xtrackers") || n.includes("etf")) return "ETF";
  return null;
}

export default function PortfolioPieChart({ positions }) {
  const [hovPos,     setHovPos]     = useState(null);
  const [hovSecteur, setHovSecteur] = useState(null);

  const enriched = positions
    .map((p, i) => ({
      nom:     p.nom,
      isin:    p.isin || "",
      secteur: (p.secteur && p.secteur !== "Autre") ? p.secteur : (ISIN_SECTEUR[p.isin] || detectSecteurNom(p.nom) || "Autre"),
      valeur:  (p.dernierCours || p.pru) * p.quantite,
      color:   PIE_COLORS[i % PIE_COLORS.length],
    }))
    .filter(s => s.valeur > 0)
    .sort((a, b) => b.valeur - a.valeur);

  const total = enriched.reduce((s, sl) => s + sl.valeur, 0);
  if (total === 0) return null;

  const secteurMap = {};
  enriched.forEach(sl => {
    if (!secteurMap[sl.secteur]) secteurMap[sl.secteur] = 0;
    secteurMap[sl.secteur] += sl.valeur;
  });
  const secteurSlices = Object.entries(secteurMap)
    .map(([nom, valeur], i) => ({ nom, valeur, color: SECTOR_COLORS[i % SECTOR_COLORS.length] }))
    .sort((a, b) => b.valeur - a.valeur);

  const GEO_COLORS = ["#1A3A5C","#2E7D52","#C0392B","#C8972A","#5B4A8A","#1A7A8A","#8A5B1A","#8A1A5B"];
  const GEO_PREFIX = { FR: "France", NL: "Europe", LU: "Europe", IE: "Europe", DE: "Europe", GB: "Royaume-Uni", BE: "Europe", IT: "Europe", ES: "Europe", US: "États-Unis", CA: "Amérique du N.", JP: "Asie" };
  const GEO_OVERRIDE = { "FR001400U5Q4": "Monde", "LU1681045370": "Monde", "LU0635178014": "Émergents", "FR0013412038": "Émergents", "FR0011440478": "Émergents", "LU1900068328": "Émergents" };
  const geoMap = {};
  enriched.forEach(sl => {
    const geo = GEO_OVERRIDE[sl.isin] || (sl.isin ? GEO_PREFIX[sl.isin.slice(0,2)] : null) || detectSecteurNom(sl.nom)?.startsWith("ETF") ? (sl.nom.toLowerCase().includes("emergent") || sl.nom.toLowerCase().includes("emerging") ? "Émergents" : sl.nom.toLowerCase().includes("monde") || sl.nom.toLowerCase().includes("world") ? "Monde" : "International") : "Autre";
    if (!geoMap[geo]) geoMap[geo] = 0;
    geoMap[geo] += sl.valeur;
  });
  const geoSlices = Object.entries(geoMap)
    .map(([nom, valeur], i) => ({ nom, valeur, color: GEO_COLORS[i % GEO_COLORS.length] }))
    .sort((a, b) => b.valeur - a.valeur);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "14px" }}>
          Répartition par titre
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "28px", flexWrap: "wrap" }}>
          <DonutChart slices={enriched} total={total} hovered={hovPos} setHovered={setHovPos} />
          <div style={{ display: "flex", flexDirection: "column", gap: "7px", flex: 1, minWidth: "180px" }}>
            {enriched.map((sl, i) => (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", opacity: hovPos !== null && hovPos !== i ? 0.4 : 1, transition: "opacity 0.15s" }}
                onMouseEnter={() => setHovPos(i)}
                onMouseLeave={() => setHovPos(null)}
              >
                <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: sl.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: C.ink, fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sl.nom}</div>
                  <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "500", marginTop: "1px" }}>{sl.secteur}</div>
                </div>
                <div style={{ fontSize: "11px", color: sl.color, fontWeight: "700", flexShrink: 0 }}>{(sl.valeur / total * 100).toFixed(1)}%</div>
                <div style={{ fontSize: "10px", color: C.inkSubtle, flexShrink: 0, minWidth: "62px", textAlign: "right" }}>{fmtEur(sl.valeur)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", boxShadow: shadow.card }}>
        <div style={{ fontSize: "11px", color: C.inkSubtle, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "14px" }}>Répartition par secteur</div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
          <DonutChart slices={secteurSlices} total={total} hovered={hovSecteur} setHovered={setHovSecteur} />
          <div style={{ display: "flex", flexDirection: "column", gap: "9px", flex: 1, minWidth: "140px" }}>
            {secteurSlices.map((sl, i) => (
              <div key={i}
                style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", opacity: hovSecteur !== null && hovSecteur !== i ? 0.4 : 1, transition: "opacity 0.15s" }}
                onMouseEnter={() => setHovSecteur(i)} onMouseLeave={() => setHovSecteur(null)}>
                <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: sl.color, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: "12px", color: C.ink, fontWeight: "600" }}>{sl.nom}</div>
                <div style={{ fontSize: "11px", color: sl.color, fontWeight: "700", flexShrink: 0 }}>{(sl.valeur / total * 100).toFixed(1)}%</div>
                <div style={{ fontSize: "10px", color: C.inkSubtle, flexShrink: 0, minWidth: "58px", textAlign: "right" }}>{fmtEur(sl.valeur)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
