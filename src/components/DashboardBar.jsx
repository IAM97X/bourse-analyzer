import { useState } from "react";
import { C, shadow } from "../constants/theme";
import { MARKETS_CFG, getMarketStatus } from "../constants/markets";
import { load } from "../lib/storage";
import { fmtEur, computeRiskScore } from "../lib/finance";
import { useIsMobile } from "../context/mobile";

function isJourFerie(d) {
  const mm = d.getMonth() + 1, dd = d.getDate();
  return (mm===1&&dd===1)||(mm===5&&dd===1)||(mm===5&&dd===8)||(mm===7&&dd===14)||
         (mm===8&&dd===15)||(mm===11&&dd===1)||(mm===11&&dd===11)||(mm===12&&dd===25)||(mm===12&&dd===26);
}
function isJourMarche(d) {
  const j = d.getDay();
  return j >= 1 && j <= 5 && !isJourFerie(d);
}

function WeeklySummary({ positions, totalActuel, totalPV, hidden }) {
  const today = new Date();
  const currentWeek = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const WEEKLY_KEY = "bourse_weekly_seen";
  const [dismissed, setDismiss] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(WEEKLY_KEY) || "{}");
      return stored.week >= currentWeek && stored.date === today.toISOString().slice(0, 10);
    } catch { return false; }
  });

  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const isFirstJourMarche = isJourMarche(today) && !isJourMarche(yesterday);
  const isLastJourMarche  = isJourMarche(today) && !isJourMarche(tomorrow);
  const shouldShow = isFirstJourMarche || isLastJourMarche;

  if (dismissed || positions.length === 0 || !shouldShow) return null;

  const totalInvest = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const pvPct = totalInvest > 0 ? (totalPV / totalInvest) * 100 : 0;

  const sorted = [...positions].map(p => ({
    ...p,
    pv: ((p.dernierCours || p.pru) - p.pru) * p.quantite,
    pvPct: p.pru > 0 ? ((p.dernierCours || p.pru) - p.pru) / p.pru * 100 : 0,
  })).sort((a, b) => b.pvPct - a.pvPct);

  const best   = sorted[0];
  const worst  = sorted[sorted.length - 1];
  const nbHausse = sorted.filter(p => p.pvPct > 0).length;
  const dateStr  = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const blurStyle = hidden ? { filter: "blur(7px)", userSelect: "none" } : {};

  const dismiss = () => {
    try { localStorage.setItem(WEEKLY_KEY, JSON.stringify({ week: currentWeek, date: today.toISOString().slice(0, 10) })); } catch {}
    setDismiss(true);
  };

  return (
    <div style={{ background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", borderRadius: "20px", padding: "20px 24px", marginTop: "16px", boxShadow: shadow.float, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 80% 50%, rgba(74,158,219,0.15) 0%, transparent 60%)", pointerEvents: "none" }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", position: "relative" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <div style={{ fontSize: "16px" }}>📅</div>
            <div>
              <div style={{ fontSize: "11px", fontWeight: "800", color: "rgba(255,255,255,0.9)", letterSpacing: "0.5px" }}>Bilan hebdomadaire</div>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.45)", marginTop: "1px" }}>{dateStr}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "10px 14px", minWidth: "110px" }}>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", fontWeight: "600", letterSpacing: "0.8px", marginBottom: "4px" }}>PORTEFEUILLE</div>
              <div style={{ fontSize: "16px", fontWeight: "800", color: "#fff", ...blurStyle }}>{fmtEur(totalActuel)}</div>
              <div style={{ fontSize: "10px", fontWeight: "700", color: pvPct >= 0 ? "#6EE7B7" : "#FCA5A5", marginTop: "2px", ...blurStyle }}>{pvPct >= 0 ? "+" : ""}{pvPct.toFixed(2)}% global</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "10px 14px", minWidth: "110px" }}>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.5)", fontWeight: "600", letterSpacing: "0.8px", marginBottom: "4px" }}>EN HAUSSE</div>
              <div style={{ fontSize: "16px", fontWeight: "800", color: "#6EE7B7" }}>{nbHausse} / {positions.length}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>positions positives</div>
            </div>
            {best && (
              <div style={{ background: "rgba(110,231,183,0.12)", borderRadius: "12px", padding: "10px 14px", minWidth: "130px", border: "1px solid rgba(110,231,183,0.2)" }}>
                <div style={{ fontSize: "9px", color: "rgba(110,231,183,0.7)", fontWeight: "600", letterSpacing: "0.8px", marginBottom: "4px" }}>🏆 MEILLEURE</div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: "#fff", ...blurStyle }}>{best.nom.split(" ")[0]}</div>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#6EE7B7", marginTop: "2px", ...blurStyle }}>+{best.pvPct.toFixed(1)}%</div>
              </div>
            )}
            {worst && worst.id !== best?.id && worst.pvPct < 0 && (
              <div style={{ background: "rgba(252,165,165,0.10)", borderRadius: "12px", padding: "10px 14px", minWidth: "130px", border: "1px solid rgba(252,165,165,0.2)" }}>
                <div style={{ fontSize: "9px", color: "rgba(252,165,165,0.7)", fontWeight: "600", letterSpacing: "0.8px", marginBottom: "4px" }}>⚠ À SURVEILLER</div>
                <div style={{ fontSize: "12px", fontWeight: "800", color: "#fff", ...blurStyle }}>{worst.nom.split(" ")[0]}</div>
                <div style={{ fontSize: "10px", fontWeight: "700", color: "#FCA5A5", marginTop: "2px", ...blurStyle }}>{worst.pvPct.toFixed(1)}%</div>
              </div>
            )}
          </div>
        </div>
        <button onClick={dismiss}
          style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "6px 10px", color: "rgba(255,255,255,0.6)", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
          ✕ Fermer
        </button>
      </div>
    </div>
  );
}

export default function DashboardBar({ onTabChange, hidden, profil, account = "PEA" }) {
  const isMobile  = useIsMobile();
  const allPos    = load("bourse_portfolio", []);
  const positions = allPos.filter(p => (p.compte || "PEA") === account);
  if (positions.length === 0) return null;

  const capitalInvesti = account === "PEA" ? (Number(profil?.versementsPEA) || 0) : (Number(profil?.versementsCTO) || 0);
  const totalActuel    = positions.reduce((s, p) => s + ((p.dernierCours || p.pru || 0)) * (p.quantite || 0), 0);
  const totalInvesti   = positions.reduce((s, p) => s + (p.pru || 0) * (p.quantite || 0), 0);
  const totalPV        = totalActuel - totalInvesti;
  const totalPVpct     = totalInvesti > 0 ? (totalPV / totalInvesti) * 100 : 0;

  const riskScore = computeRiskScore(positions, totalActuel);
  const riskColor = riskScore <= 3 ? C.green : riskScore <= 6 ? C.goldDark : C.red;
  const riskLabel = riskScore <= 3 ? "Risque faible" : riskScore <= 6 ? "Risque modéré" : "Risque élevé";

  const varJourEur = positions.some(p => p.intradayVariation != null)
    ? positions.reduce((s, p) => {
        if (p.intradayVariation == null) return s;
        const cours = p.dernierCours || p.pru;
        const hier  = cours / (1 + p.intradayVariation / 100);
        return s + (cours - hier) * p.quantite;
      }, 0)
    : null;
  const varJourPct = varJourEur != null && totalActuel > 0
    ? (varJourEur / (totalActuel - (varJourEur || 0))) * 100 : null;

  const { open: isOpen, reason: marketLabel } = getMarketStatus(MARKETS_CFG.find(m => m.id === "paris"));
  const marketColor = isOpen ? C.green : C.red;

  const blurStyle = hidden ? { filter: "blur(7px)", userSelect: "none", pointerEvents: "none" } : {};

  return (
    <div style={{ marginBottom: "24px" }}>
      <style>{`@keyframes marketPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.35;transform:scale(0.85)} }`}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "17px", fontWeight: "700", color: C.ink, letterSpacing: "-0.03em" }}>Portefeuille</span>
          <span style={{ fontSize: "10px", fontWeight: "600", color: account === "PEA" ? C.accent : "#7C3AED", background: account === "PEA" ? "rgba(59,130,246,0.08)" : "rgba(124,58,237,0.08)", borderRadius: "5px", padding: "2px 8px" }}>{account}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: marketColor, display: "inline-block", animation: isOpen ? "marketPulse 2.5s ease-in-out infinite" : "none" }} />
            <span style={{ fontSize: "11px", color: marketColor, fontWeight: "600" }}>{marketLabel}</span>
          </span>
          <span style={{ fontSize: "11px", color: C.inkSubtle }}>{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
      </div>

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", marginLeft: "-4px", marginRight: "-4px", paddingLeft: "4px", paddingRight: "4px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(4, 150px)" : "repeat(4, 1fr)", gap: "10px", minWidth: isMobile ? "620px" : "auto" }}>
          {[
            { label: account === "CTO" ? "Capital investi CTO" : "Capital investi PEA", main: capitalInvesti > 0 ? fmtEur(capitalInvesti) : "—", sub: null, color: C.inkMuted, numColor: C.ink, subSmall: capitalInvesti === 0 },
            { label: "Plus-value latente", main: (totalPV >= 0 ? "+" : "") + fmtEur(totalPV), sub: (totalPVpct >= 0 ? "+" : "") + totalPVpct.toFixed(2) + "%", color: totalPV >= 0 ? C.green : C.red, numColor: totalPV >= 0 ? C.green : C.red },
            { label: "Variation du jour", main: varJourEur != null ? (varJourEur >= 0 ? "+" : "") + fmtEur(varJourEur) : "—", sub: varJourPct != null ? (varJourPct >= 0 ? "+" : "") + varJourPct.toFixed(2) + "%" : null, color: varJourEur == null ? C.inkSubtle : varJourEur >= 0 ? C.green : C.red, numColor: varJourEur == null ? C.inkMuted : varJourEur >= 0 ? C.green : C.red },
            { label: "Score de risque", main: riskScore !== null ? `${riskScore} / 10` : "—", sub: riskLabel, color: riskColor, numColor: riskColor, isRisk: true },
          ].map((card) => (
            <div key={card.label} style={{ background: C.snow, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: card.color, borderRadius: "16px 16px 0 0" }} />
              <div style={{ fontSize: "9px", color: C.inkSubtle, fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>{card.label}</div>
              <div style={{ fontSize: isMobile ? "20px" : "22px", fontWeight: "700", color: card.numColor || C.ink, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", lineHeight: 1, ...blurStyle }}>{card.main}</div>
              {card.isRisk && riskScore !== null && (
                <div style={{ marginTop: "8px", background: C.snowOff, borderRadius: "4px", height: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${riskScore * 10}%`, height: "100%", background: riskColor, borderRadius: "4px", transition: "width 0.5s ease" }} />
                </div>
              )}
              {card.sub && (
                <div style={{ marginTop: "8px", display: "inline-flex", alignItems: "center", background: card.color === C.green ? C.greenLight : card.color === C.red ? C.redLight : C.snowDim, borderRadius: "6px", padding: "2px 8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: "700", color: card.color, fontVariantNumeric: "tabular-nums", ...blurStyle }}>{card.sub}</span>
                </div>
              )}
              {card.subSmall && (
                <div style={{ marginTop: "8px", background: C.snowDim, borderRadius: "6px", padding: "4px 9px", fontSize: "10px", color: C.inkMuted, fontWeight: "600", display: "inline-block" }}>À renseigner dans Profil</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <WeeklySummary positions={positions} totalActuel={totalActuel} totalPV={totalPV} hidden={hidden} />
    </div>
  );
}
