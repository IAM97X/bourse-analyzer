import { useMemo } from "react";
import { C } from "../constants/theme";
import { TABS } from "../constants/tabs";
import { load } from "../lib/storage";
import { sanitizePositions } from "../lib/finance";
import { useIsMobile } from "../context/mobile";
import { getCourtierForAccount, COURTIERS } from "../constants/courtiers";

const BROKER_LOGOS = {
  boursobank:    { label: "Boursobank",        domain: "boursobank.com" },
  fortuneo:      { label: "Fortuneo",          domain: "fortuneo.fr" },
  bourse_direct: { label: "Bourse Direct",     domain: "boursedirect.fr" },
  hello_bank:    { label: "Hello bank!",       domain: "hellobank.fr" },
  bforbank:      { label: "BforBank",          domain: "bforbank.com" },
  saxo:          { label: "Saxo",              domain: "home.saxo" },
  interactive:   { label: "IBKR",             domain: "interactivebrokers.com" },
  trade_rep:     { label: "Trade Republic",    domain: "traderepublic.com" },
  degiro:        { label: "DEGIRO",            domain: "degiro.fr" },
  revolut:       { label: "Revolut",           domain: "revolut.com" },
  xtb:           { label: "XTB",              domain: "xtb.com" },
  autre:         { label: "Courtier",          domain: null },
};

function BrokerLogo({ courtierKey }) {
  const broker = BROKER_LOGOS[courtierKey];
  if (!broker) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      {broker.domain ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${broker.domain}&sz=32`}
          alt={broker.label}
          width="16" height="16"
          style={{ borderRadius: "4px", display: "block" }}
          onError={e => { e.target.style.display = "none"; }}
        />
      ) : (
        <div style={{ width: "16px", height: "16px", borderRadius: "4px", background: "#6C6C70" }} />
      )}
      <span style={{ fontSize: "11px", fontWeight: "600", color: C.inkMuted, fontFamily: "'DM Sans', sans-serif" }}>
        {broker.label}
      </span>
    </div>
  );
}

function fmtEur(v) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}
function fmtPct(v, decimals = 1) {
  return (v >= 0 ? "+" : "") + v.toFixed(decimals) + " %";
}

function AccountCard({ account, positions, onEnter, hidden, courtierKey }) {
  const totalActuel  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const pv    = totalActuel - totalInvesti;
  const pvPct = totalInvesti > 0 ? (pv / totalInvesti) * 100 : 0;
  const isEmpty = positions.length === 0;

  const accentColor = "#2D6CB5";
  const gradBg      = "linear-gradient(140deg, rgba(45,108,181,0.06) 0%, rgba(75,157,216,0.03) 100%)";
  const borderColor = "rgba(45,108,181,0.15)";
  const btnGrad     = "linear-gradient(135deg, #2D6CB5, #4B9DD8)";

  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: gradBg,
      border: `1px solid ${borderColor}`,
      borderRadius: "20px",
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      gap: "18px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "11px", background: btnGrad, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 14px ${accentColor}44` }}>
            <span style={{ fontSize: "13px", fontWeight: "800", color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>{account}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "15px", fontWeight: "700", color: C.ink, whiteSpace: "nowrap" }}>
              {account === "PEA" ? "Plan Épargne Actions" : "Compte-Titres Ordinaire"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
              <span style={{ fontSize: "11px", color: C.inkSubtle }}>
                {positions.length} position{positions.length !== 1 ? "s" : ""}
              </span>
              {courtierKey && (
                <span style={{ color: C.border }}>·</span>
              )}
              {courtierKey && <BrokerLogo courtierKey={courtierKey} />}
            </div>
          </div>
        </div>
        {!isEmpty && (
          <div style={{
            padding: "4px 10px", borderRadius: "20px", flexShrink: 0,
            background: pvPct >= 0 ? "rgba(39,174,96,0.12)" : "rgba(231,76,60,0.10)",
            color: pvPct >= 0 ? "#1E8449" : "#C0392B",
            fontSize: "12px", fontWeight: "700",
          }}>
            {hidden ? "••••" : fmtPct(pvPct)}
          </div>
        )}
      </div>

      {isEmpty ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", padding: "24px 0" }}>
          <div style={{ opacity: 0.35 }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
          <div style={{ fontSize: "12.5px", color: C.inkSubtle, textAlign: "center" }}>Aucune position dans ce compte</div>
        </div>
      ) : (
        <>
          {/* Chiffres clés */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: "600", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Valeur totale</div>
              <div style={{ fontSize: "22px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em" }}>
                {hidden ? "••••••" : fmtEur(totalActuel)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "10px", fontWeight: "600", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Plus-value</div>
              <div style={{ fontSize: "22px", fontWeight: "800", color: pvPct >= 0 ? "#1E8449" : "#C0392B", letterSpacing: "-0.03em" }}>
                {hidden ? "••••••" : fmtEur(pv)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "10px", fontWeight: "600", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Capital investi</div>
              <div style={{ fontSize: "15px", fontWeight: "700", color: C.inkMuted }}>
                {hidden ? "••••" : fmtEur(totalInvesti)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "10px", fontWeight: "600", color: C.inkSubtle, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Performance</div>
              <div style={{ fontSize: "15px", fontWeight: "700", color: pvPct >= 0 ? "#1E8449" : "#C0392B" }}>
                {hidden ? "•••" : fmtPct(pvPct, 2)}
              </div>
            </div>
          </div>

        </>
      )}

      {/* Bouton entrée */}
      <button onClick={onEnter}
        style={{
          width: "100%", padding: "12px",
          borderRadius: "13px", border: "none",
          background: btnGrad,
          color: "#fff", fontSize: "13px", fontWeight: "700",
          cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          boxShadow: `0 4px 16px ${accentColor}44`,
          transition: "opacity 0.15s",
          marginTop: "auto",
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
        onMouseLeave={e => e.currentTarget.style.opacity = "1"}
      >
        Accéder au {account} →
      </button>
    </div>
  );
}

export default function OverviewTab({ onNavigate, onSwitchAccount, hidden, portfolioVersion }) {
  const isMobile = useIsMobile();
  const allPositions = useMemo(() => sanitizePositions(load("bourse_portfolio", [])), [portfolioVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const peaPositions = allPositions.filter(p => (p.compte || "PEA") === "PEA");
  const ctoPositions = allPositions.filter(p => p.compte === "CTO");

  const profil   = load("bourse_profil", {});
  const userName = (() => { try { return JSON.parse(localStorage.getItem("bourse_session") || "{}").name || ""; } catch { return ""; } })();

  const peaTotal = peaPositions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const ctoTotal = ctoPositions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
  const peaInv   = peaPositions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const ctoInv   = ctoPositions.reduce((s, p) => s + p.pru * p.quantite, 0);
  const totalVal = peaTotal + ctoTotal;
  const totalInv = peaInv + ctoInv;
  const totalPv  = totalVal - totalInv;
  const totalPct = totalInv > 0 ? (totalPv / totalInv) * 100 : 0;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bonjour";
    if (h < 18) return "Bon après-midi";
    return "Bonsoir";
  })();
  const dateStr = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const handleEnter = (acc) => {
    onSwitchAccount(acc);
    onNavigate(TABS.HOME);
  };

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: isMobile ? "20px 16px 40px" : "40px 28px 60px" }}>

      {/* Salutation */}
      <div style={{ marginBottom: "32px", textAlign: "center" }}>
        <div style={{ fontSize: isMobile ? "24px" : "30px", fontWeight: "800", color: C.ink, letterSpacing: "-0.03em", marginBottom: "6px" }}>
          {greeting}{userName ? `, ${userName}` : ""}
        </div>
        <div style={{ fontSize: "13px", color: C.inkSubtle, textTransform: "capitalize" }}>{dateStr}</div>
      </div>

      {/* Bilan global */}
      {totalInv > 0 && (
        <div style={{
          background: "linear-gradient(135deg, #1A3A6B 0%, #2D6CB5 100%)",
          borderRadius: "24px",
          padding: "28px 32px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "28px",
          flexWrap: "wrap",
          boxShadow: "0 8px 32px rgba(45,108,181,0.25)",
        }}>
          <div style={{ flex: 1, minWidth: "160px" }}>
            <div style={{ fontSize: "10px", fontWeight: "600", color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Patrimoine total</div>
            <div style={{ fontSize: isMobile ? "30px" : "38px", fontWeight: "800", color: "#fff", letterSpacing: "-0.04em" }}>
              {hidden ? "••••••••" : fmtEur(totalVal)}
            </div>
          </div>
          <div style={{ display: "flex", gap: "28px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Investi</div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "rgba(255,255,255,0.85)" }}>{hidden ? "••••" : fmtEur(totalInv)}</div>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Plus-value</div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: totalPv >= 0 ? "#86EFAC" : "#FCA5A5" }}>
                {hidden ? "••••" : fmtEur(totalPv)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", marginBottom: "4px" }}>Performance</div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: totalPct >= 0 ? "#86EFAC" : "#FCA5A5" }}>
                {hidden ? "•••" : fmtPct(totalPct, 2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cartes PEA + CTO — portes d'entrée */}
      <div style={{ display: "flex", gap: "16px", flexDirection: isMobile ? "column" : "row" }}>
        <AccountCard
          account="PEA"
          positions={peaPositions}
          onEnter={() => handleEnter("PEA")}
          hidden={hidden}
          courtierKey={getCourtierForAccount(profil, "PEA")}
        />
        <AccountCard
          account="CTO"
          positions={ctoPositions}
          onEnter={() => handleEnter("CTO")}
          hidden={hidden}
          courtierKey={getCourtierForAccount(profil, "CTO")}
        />
      </div>
    </div>
  );
}
