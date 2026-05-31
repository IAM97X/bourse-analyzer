import { useState, useEffect, useRef } from "react";
import { C, shadow } from "../constants/theme";
import { COURTIERS_DETAIL, getCourtierForAccount } from "../constants/courtiers";
import { load, save } from "../lib/storage";
import { sanitizePositions } from "../lib/finance";
import { callClaudeConversation, hasClaudeKey, hasAI } from "../lib/api";
import { useIsMobile } from "../context/mobile";
import { IconChat } from "./Sidebar";

const AI_CONFIG_KEY = "bourse_ai_config";
const AI_EMOJI_KEY  = "bourse_ai_emoji";

function renderAIMarkdown(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;

  const inlineFormat = (str) => {
    const parts = [];
    const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let last = 0, m;
    while ((m = re.exec(str)) !== null) {
      if (m.index > last) parts.push(str.slice(last, m.index));
      if (m[2]) parts.push(<strong key={m.index} style={{ fontStyle: "italic" }}>{m[2]}</strong>);
      else if (m[3]) parts.push(<strong key={m.index}>{m[3]}</strong>);
      else if (m[4]) parts.push(<em key={m.index}>{m[4]}</em>);
      else if (m[5]) parts.push(<code key={m.index} style={{ background: "rgba(30,58,95,0.08)", borderRadius: "4px", padding: "1px 5px", fontSize: "11px", fontFamily: "monospace", color: C.accent }}>{m[5]}</code>);
      last = m.index + m[0].length;
    }
    if (last < str.length) parts.push(str.slice(last));
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (/^# /.test(line)) {
      const raw = line.replace(/^# /, "").trim();
      const emojiMatch = raw.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u);
      const emoji = emojiMatch ? emojiMatch[0].trim() : null;
      const title = emoji ? raw.slice(emojiMatch[0].length) : raw;
      out.push(
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", margin: "14px 0 8px" }}>
          {emoji && <span style={{ fontSize: "18px" }}>{emoji}</span>}
          <span style={{ fontSize: "15px", fontWeight: "800", color: C.ink, letterSpacing: "-0.02em" }}>{inlineFormat(title)}</span>
        </div>
      );
      i++; continue;
    }
    if (/^## /.test(line)) {
      out.push(<div key={i} style={{ fontSize: "13px", fontWeight: "700", color: C.ink, margin: "10px 0 4px" }}>{inlineFormat(line.replace(/^## /, ""))}</div>);
      i++; continue;
    }
    if (/^### /.test(line)) {
      out.push(<div key={i} style={{ fontSize: "12px", fontWeight: "700", color: C.navy, margin: "8px 0 3px" }}>{inlineFormat(line.replace(/^### /, ""))}</div>);
      i++; continue;
    }
    if (/^---$/.test(line.trim())) {
      out.push(<hr key={i} style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "10px 0" }} />);
      i++; continue;
    }
    if (/^```/.test(line)) {
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { codeLines.push(lines[i]); i++; }
      out.push(<pre key={`code-${i}`} style={{ background: "rgba(30,58,95,0.06)", borderRadius: "8px", padding: "10px 14px", fontSize: "11.5px", fontFamily: "monospace", overflowX: "auto", margin: "6px 0", color: C.ink, lineHeight: 1.6 }}>{codeLines.join("\n")}</pre>);
      i++; continue;
    }
    if (/^>\s/.test(line)) {
      out.push(<div key={i} style={{ borderLeft: `3px solid ${C.accent}`, paddingLeft: "10px", margin: "4px 0", color: C.inkMuted, fontSize: "12.5px", fontStyle: "italic" }}>{inlineFormat(line.replace(/^>\s/, ""))}</div>);
      i++; continue;
    }
    if (/^[-*•]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const isOrdered = /^\d+\.\s/.test(line);
      const items = [];
      while (i < lines.length && (/^[-*•]\s/.test(lines[i]) || /^\d+\.\s/.test(lines[i]))) {
        const num = isOrdered ? lines[i].match(/^(\d+)/)?.[1] : null;
        const txt = lines[i].replace(/^[-*•]\s/, "").replace(/^\d+\.\s/, "");
        items.push(<li key={i} style={{ display: "flex", gap: "7px", marginBottom: "3px", alignItems: "flex-start" }}>
          {isOrdered
            ? <span style={{ minWidth: "18px", height: "18px", borderRadius: "50%", background: C.accent, color: "#fff", fontSize: "10px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "2px" }}>{num}</span>
            : <span style={{ color: C.accent, fontWeight: "800", flexShrink: 0, marginTop: "2px" }}>·</span>
          }
          <span style={{ fontSize: "12.5px", color: C.inkMuted, lineHeight: "1.55" }}>{inlineFormat(txt)}</span>
        </li>);
        i++;
      }
      out.push(<ul key={`list-${i}`} style={{ margin: "4px 0 8px", padding: 0, listStyle: "none" }}>{items}</ul>);
      continue;
    }
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i]); i++;
      }
      const isSep = (l) => /^\|[\s\-:|]+\|$/.test(l.trim());
      const rows = tableLines.filter(l => !isSep(l));
      if (rows.length > 0) {
        out.push(
          <div key={`tbl-${i}`} style={{ overflowX: "auto", margin: "10px 0", borderRadius: "8px", border: `1px solid ${C.border}` }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px" }}>
              <tbody>
                {rows.map((row, ri) => {
                  const cells = row.trim().replace(/^\||\|$/g, "").split("|");
                  return (
                    <tr key={ri} style={{ background: ri === 0 ? "rgba(30,58,95,0.05)" : ri % 2 === 0 ? "rgba(30,58,95,0.02)" : "transparent" }}>
                      {cells.map((cell, ci) => (
                        <td key={ci} style={{ padding: "7px 12px", borderBottom: ri < rows.length - 1 ? `1px solid ${C.border}` : "none", fontWeight: ri === 0 ? "700" : "400", color: ri === 0 ? C.ink : C.inkMuted, whiteSpace: "nowrap" }}>
                          {inlineFormat(cell.trim())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }
    if (line.trim() === "") { out.push(<div key={i} style={{ height: "5px" }} />); i++; continue; }
    out.push(<p key={i} style={{ margin: "2px 0 4px", fontSize: "12.5px", color: C.inkMuted, lineHeight: "1.6" }}>{inlineFormat(line)}</p>);
    i++;
  }
  return out;
}

export function AIAssistant({ account, profil }) {
  const isMobile = useIsMobile();
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100); }, [open]);

  // Ref toujours à jour vers send pour éviter les stale closures
  const sendRef = useRef(null);

  // Ouvre l'assistant flottant et envoie la query depuis les tooltips
  const pendingQueryRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail?.query) return;
      pendingQueryRef.current = e.detail.query;
      setOpen(true);
    };
    window.addEventListener("openAssistantWithQuery", handler);
    return () => window.removeEventListener("openAssistantWithQuery", handler);
  }, []);

  // Envoie la query en attente une fois l'assistant ouvert
  useEffect(() => {
    if (!open || !pendingQueryRef.current) return;
    const q = pendingQueryRef.current;
    pendingQueryRef.current = null;
    setTimeout(() => sendRef.current?.(q), 250);
  }, [open]);

  const buildContext = () => {
    const allPos   = load("bourse_portfolio", []);
    const positions = allPos.filter(p => (p.compte || "PEA") === account);
    const totalActuel  = positions.reduce((s, p) => s + ((p.dernierCours || p.pru || 0) * (p.quantite || 0)), 0);
    const totalInvesti = positions.reduce((s, p) => s + (p.pru || 0) * (p.quantite || 0), 0);
    const pv    = totalActuel - totalInvesti;
    const pvPct = totalInvesti > 0 ? (pv / totalInvesti * 100) : 0;
    const posLines = positions.map(p => {
      const cours    = p.dernierCours || p.pru || 0;
      const pvPctPos = p.pru > 0 ? ((cours - p.pru) / p.pru * 100) : 0;
      return `  • ${p.nom}${p.isin ? ` (${p.isin})` : ""}: ${p.quantite} titres @ PRU ${p.pru}€, cours ${cours.toFixed(2)}€, PV ${pvPctPos >= 0 ? "+" : ""}${pvPctPos.toFixed(1)}%${p.secteur ? `, secteur: ${p.secteur}` : ""}`;
    }).join("\n");
    return `PORTEFEUILLE ${account} au ${new Date().toLocaleDateString("fr-FR")} :
Valeur totale : ${totalActuel.toFixed(0)}€ | Capital investi : ${totalInvesti.toFixed(0)}€ | Plus-value : ${pv >= 0 ? "+" : ""}${pvPct.toFixed(1)}%
Nombre de positions : ${positions.length}
${posLines || "  Aucune position configurée."}
Profil investisseur : horizon ${profil?.horizon || "non défini"}, risque ${profil?.risque || "non défini"}, DCA ${profil?.dcaMensuel || 0}€/mois`;
  };

  const aiCfg   = (() => { try { return JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || "{}"); } catch { return {}; } })();
  const aiEmoji = localStorage.getItem(AI_EMOJI_KEY) || "🤖";
  const assistantName = aiCfg.nom?.trim() || "l'assistant";
  const tonMap = { pedagogique: "pédagogique et accessible, avec des analogies du quotidien", professionnel: "direct et professionnel, sans fioritures", conservateur: "prudent et conservateur, en soulignant les risques", motivant: "motivant et positif, en valorisant les bons choix" };
  const tonDesc = tonMap[aiCfg.ton || "pedagogique"];
  const longueurDesc = aiCfg.longueur === "detaille" ? "Développe tes réponses avec des explications complètes." : "Sois concis : 3-5 phrases max sauf si l'utilisateur demande plus de détails.";
  const customInstructions = aiCfg.instructions?.trim() ? `\n\nInstructions spécifiques de l'utilisateur :\n${aiCfg.instructions.trim()}` : "";

  const SYSTEM_PROMPT = `Tu es ${assistantName}, un assistant financier intégré dans une application de suivi de portefeuille boursier. Tu aides l'utilisateur à comprendre ses données et les concepts financiers.

Ton style est ${tonDesc}.
${longueurDesc}

Règles strictes :
- Réponds toujours en français
- Utilise les données réelles du portefeuille quand c'est pertinent
- Termine chaque réponse sur une note positive/encourageante si possible
- IMPORTANT : rappelle toujours que tes analyses sont informatives et ne constituent pas un conseil en investissement financier
- Ne conseille jamais d'acheter ou vendre un titre spécifique de façon directe${customInstructions}`;

  const send = async (overrideText) => {
    const text = (typeof overrideText === "string" ? overrideText : input).trim();
    if (!text || loading) return;
    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const context  = buildContext();
      const apiMsgs  = newMessages.map((m, i) =>
        i === 0
          ? { role: m.role, content: `[CONTEXTE DE MON PORTEFEUILLE]\n${context}\n\n[MA QUESTION]\n${m.content}` }
          : { role: m.role, content: m.content }
      );
      const reply = await callClaudeConversation(SYSTEM_PROMPT, apiMsgs) || "Désolé, je n'ai pas pu générer une réponse.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      const m = e.message || "";
      const errMsg = (m.includes("quota") || m.includes("limit: 0") || m.includes("429"))
        ? "Quota IA atteint. Configure ta clé Claude ou Gemini dans Paramètres → Clés API."
        : (m.includes("401") || m.includes("invalid") || m.includes("auth"))
        ? "Clé API invalide. Vérifie dans Paramètres → Clés API."
        : m || "Vérifiez votre clé API.";
      setMessages(prev => [...prev, { role: "assistant", content: errMsg }]);
    }
    setLoading(false);
  };
  sendRef.current = send;

  const dayIndex = Math.floor(Date.now() / 86400000);
  const ALL_SUGGESTIONS = [
    "Qu'est-ce que le PRU ?", "Mon portefeuille est-il diversifié ?", "Que signifie le RSI ?",
    "Qu'est-ce qu'un ETF ?", "Comment fonctionne le DCA ?", "Explique ma plus-value latente",
    "C'est quoi le PEA ?", "Quelle est la différence entre ETF et action ?",
    "Comment lire un bilan comptable ?", "Qu'est-ce que la volatilité ?",
    "Explique le MACD simplement", "Qu'est-ce qu'une plus-value réalisée ?",
    "Comment diversifier un portefeuille ?", "C'est quoi le rendement dividende ?",
    "Qu'est-ce que l'effet de levier ?", "Explique la capitalisation boursière",
    "Qu'est-ce qu'une obligation ?", "Comment fonctionne une OPA ?",
    "Quelle différence entre CTO et PEA ?", "Qu'est-ce que le Price/Earnings ratio ?",
  ];
  const DIDYOUKNOW = [
    { emoji: "📈", fact: "Le marché boursier a généré en moyenne +10%/an sur les 100 dernières années, malgré toutes les crises.", source: "Données historiques S&P 500" },
    { emoji: "⏳", fact: "Investir 100€/mois pendant 30 ans à 8%/an donne 149 000€ — alors qu'on n'aura versé que 36 000€.", source: "Puissance des intérêts composés" },
    { emoji: "🌍", fact: "Un ETF World MSCI couvre plus de 1 600 entreprises dans 23 pays avec un seul produit.", source: "MSCI World Index" },
    { emoji: "🧠", fact: "Warren Buffett a réalisé 97% de sa fortune après ses 65 ans, grâce aux intérêts composés.", source: "The Snowball, Alice Schroeder" },
    { emoji: "💡", fact: "Le DCA (Dollar Cost Averaging) permet de réduire l'impact des pics de marché en lissant le prix d'achat.", source: "Stratégie d'investissement périodique" },
    { emoji: "📊", fact: "Historiquement, rester investi durant les 10 meilleures journées sur 20 ans peut doubler votre rendement.", source: "JP Morgan Asset Management" },
    { emoji: "🏦", fact: "Le PEA permet de ne payer que 17,2% de prélèvements sociaux sur vos gains après 5 ans (pas d'impôt sur le revenu).", source: "Code général des impôts, France" },
    { emoji: "🎯", fact: "La diversification entre 20 et 30 actions élimine environ 90% du risque spécifique d'un portefeuille.", source: "Markowitz, théorie du portefeuille" },
    { emoji: "📉", fact: "En moyenne, les marchés corrigent de plus de 10% une fois par an — c'est normal et temporaire.", source: "Données historiques Morningstar" },
    { emoji: "🔄", fact: "Réinvestir les dividendes automatiquement peut multiplier votre rendement total par 2 à 3 sur 20 ans.", source: "Effet du réinvestissement des dividendes" },
    { emoji: "🌱", fact: "Les ETF à faibles frais (< 0,2%/an) surpassent 80% des fonds actifs sur 15 ans.", source: "SPIVA Scorecard, S&P Global" },
    { emoji: "⚖️", fact: "Une inflation de 3%/an divise par 2 le pouvoir d'achat de votre épargne en 24 ans si elle dort en liquide.", source: "Règle des 72" },
    { emoji: "🚀", fact: "Apple, Amazon et Google représentent à elles seules plus de 10% de la capitalisation mondiale.", source: "MSCI, 2024" },
    { emoji: "💰", fact: "Les frais de gestion d'un fonds actif à 1,5%/an coûtent 38% de capital en moins sur 30 ans vs 0,2%/an.", source: "Calcul d'impact des frais" },
    { emoji: "🕰️", fact: "Le meilleur moment pour investir était hier. Le deuxième meilleur moment, c'est aujourd'hui.", source: "Proverbe boursier" },
  ];
  const BEGINNER_SUGGESTIONS = [
    "Par où commencer pour investir en bourse ?",
    "PEA ou CTO, lequel choisir pour débuter ?",
    "C'est quoi un ETF et pourquoi en acheter ?",
    "Comment investir avec seulement 100€/mois ?",
    "Quels sont les risques de la bourse ?",
    "Qu'est-ce que le DCA et comment ça marche ?",
    "Comment choisir mon premier investissement ?",
    "C'est quoi le PRU ?",
  ];

  const hasPositions = (() => { try { return JSON.parse(localStorage.getItem("bourse_portfolio") || "[]").filter(p => (p.compte || "PEA") === account).length > 0; } catch { return false; } })();
  const todaySuggestions = hasPositions
    ? ALL_SUGGESTIONS.slice(dayIndex % ALL_SUGGESTIONS.length).concat(ALL_SUGGESTIONS.slice(0, dayIndex % ALL_SUGGESTIONS.length)).slice(0, 4)
    : BEGINNER_SUGGESTIONS.slice(0, 4);
  const todayDidYouKnow = DIDYOUKNOW[dayIndex % DIDYOUKNOW.length];

  return (
    <>
      <button onClick={() => setOpen(v => !v)} title="Assistant IA"
        style={{ position: "fixed", bottom: isMobile ? "76px" : "24px", right: "20px", zIndex: 999,
          width: "52px", height: "52px", borderRadius: "50%",
          background: open ? "#1A3A6B" : "linear-gradient(135deg, #1A3A6B, #2D6CB5)",
          border: "none", cursor: "pointer", boxShadow: "0 6px 28px rgba(30,58,95,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: open ? "18px" : "22px", transition: "all 0.2s", color: "#fff",
        }}>
        {open ? "✕" : aiEmoji}
      </button>

      {open && (
        <div style={{
          position: "fixed",
          bottom: isMobile ? 0 : "88px", right: isMobile ? 0 : "20px",
          width: isMobile ? "100vw" : "340px",
          height: isMobile ? "82vh" : "480px",
          background: C.snow, borderRadius: isMobile ? "20px 20px 0 0" : "20px",
          boxShadow: "0 16px 56px rgba(17,18,20,0.22)", zIndex: 998,
          display: "flex", flexDirection: "column", overflow: "hidden",
          border: `1px solid ${C.border}`, animation: "fadeIn 0.18s ease",
        }}>
          <div style={{ background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", padding: "14px 18px", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            <span style={{ fontSize: "20px" }}>{aiEmoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: "800", color: "#fff", letterSpacing: "-0.01em" }}>{aiCfg.nom?.trim() ? `${aiCfg.nom.trim()} IA` : "Assistant IA"}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.45)", marginTop: "1px" }}>Posez vos questions sur votre portefeuille</div>
            </div>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "3px 8px", fontSize: "10px", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Effacer
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {!hasAI() && (
              <div style={{ textAlign: "center", paddingTop: "16px" }}>
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>🔑</div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: C.ink, marginBottom: "8px" }}>IA non disponible</div>
                <div style={{ fontSize: "11px", color: C.inkSubtle, marginBottom: "20px", lineHeight: "1.6" }}>
                  Ajoutez une clé <strong>Gemini</strong> (gratuite) ou <strong>Claude</strong> dans Paramètres pour activer l'assistant.
                </div>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", color: "#fff", borderRadius: "10px", padding: "10px 20px", fontSize: "12px", fontWeight: "700", textDecoration: "none", marginBottom: "12px" }}>
                  Clé Gemini gratuite →
                </a>
                <div style={{ fontSize: "10px", color: C.inkSubtle, lineHeight: "1.6" }}>Ajoutez votre clé dans<br/><strong>Profil → Clés API</strong></div>
              </div>
            )}
            {hasAI() && messages.length === 0 && (
              <div style={{ paddingTop: "6px", display: "flex", flexDirection: "column", gap: "14px" }}>
                {!hasPositions && (
                  <div style={{ padding: "14px 16px", background: "linear-gradient(135deg, rgba(30,58,95,0.08), rgba(37,99,235,0.06))", border: `1px solid rgba(30,58,95,0.15)`, borderRadius: "14px" }}>
                    <div style={{ fontSize: "12px", fontWeight: "700", color: C.navy, marginBottom: "6px" }}>Bienvenue ! Je suis votre Conseiller Privé.</div>
                    <div style={{ fontSize: "12px", color: C.inkMuted, lineHeight: "1.6" }}>
                      Vous débutez en bourse ? Je suis là pour vous guider. Posez-moi n'importe quelle question — je m'adapte à votre niveau et à votre profil.
                    </div>
                  </div>
                )}
                <div style={{ background: "linear-gradient(135deg, #0C1829 0%, #1A3558 100%)", borderRadius: "16px", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: "-10px", right: "-10px", fontSize: "60px", opacity: 0.07, lineHeight: 1 }}>💡</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <span style={{ fontSize: "9px", fontWeight: "700", color: "rgba(255,255,255,0.45)", letterSpacing: "1.5px", textTransform: "uppercase" }}>Le saviez-vous ?</span>
                    <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>Renouvelle chaque matin</span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "22px", lineHeight: 1, flexShrink: 0 }}>{todayDidYouKnow.emoji}</span>
                    <div>
                      <p style={{ fontSize: "12px", color: "#E8F0FF", lineHeight: "1.65", margin: "0 0 6px", fontWeight: "500" }}>{todayDidYouKnow.fact}</p>
                      <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>— {todayDidYouKnow.source}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setInput(`Explique-moi : "${todayDidYouKnow.fact}"`); setTimeout(() => inputRef.current?.focus(), 50); }}
                    style={{ marginTop: "10px", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "20px", padding: "5px 14px", fontSize: "10px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: "600" }}>
                    En savoir plus →
                  </button>
                </div>
                <div>
                  <div style={{ fontSize: "9px", fontWeight: "700", color: C.inkSubtle, letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "8px", paddingLeft: "2px" }}>Questions du jour</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {todaySuggestions.map(s => (
                      <button key={s} onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}
                        style={{ padding: "7px 13px", borderRadius: "20px", border: `1px solid ${C.border}`, background: C.cardGrad, color: C.inkSoft, fontSize: "11px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: "500", transition: "all 0.15s", boxShadow: "0 1px 4px rgba(17,18,20,0.06)" }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "assistant" && (
                  <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0, marginRight: "8px", marginTop: "2px", boxShadow: "0 2px 8px rgba(30,58,95,0.30)" }}>{aiEmoji}</span>
                )}
                {m.role === "user" ? (
                  <div style={{ maxWidth: "78%", padding: "10px 14px", borderRadius: "16px 16px 4px 16px", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", color: "#fff", fontSize: "12px", lineHeight: "1.65" }}>
                    {m.content}
                  </div>
                ) : (
                  <div style={{ maxWidth: "90%" }}>
                    <div style={{ padding: "14px 16px 10px 16px", borderRadius: "4px 16px 16px 16px", background: C.snow, border: `1px solid ${C.border}`, boxShadow: "0 2px 12px rgba(17,18,20,0.06)" }}>
                      {renderAIMarkdown(m.content)}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                        <button onClick={() => navigator.clipboard?.writeText(m.content)} title="Copier"
                          style={{ width: "32px", height: "32px", borderRadius: "8px", border: `1px solid ${C.border}`, background: C.bg, color: C.ink, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: shadow.card }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0 }}>{aiEmoji}</span>
                <div style={{ padding: "10px 16px", borderRadius: "4px 16px 16px 16px", background: C.snowOff, border: `1px solid ${C.border}`, display: "flex", gap: "4px", alignItems: "center" }}>
                  {[0,1,2].map(d => (
                    <span key={d} style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.accent, display: "inline-block", animation: `pulse 1.2s ${d * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: "10px 14px 14px", borderTop: `1px solid ${C.border}`, display: "flex", gap: "8px", flexShrink: 0, background: C.snow, opacity: hasAI() ? 1 : 0.4, pointerEvents: hasAI() ? "auto" : "none" }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={hasAI() ? "Posez votre question…" : "IA non disponible"}
              style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "9px 13px", fontSize: "12px", fontFamily: "'DM Sans', sans-serif", color: C.ink, background: C.snowOff, outline: "none" }}
            />
            <button onClick={send} disabled={!input.trim() || loading}
              style={{ width: "38px", height: "38px", borderRadius: "10px", border: "none",
                cursor: input.trim() && !loading ? "pointer" : "default",
                background: input.trim() && !loading ? "linear-gradient(135deg, #1A3A6B, #2D6CB5)" : C.snowDim,
                color: input.trim() && !loading ? "#fff" : C.inkSubtle,
                fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "all 0.15s",
              }}>↑</button>
          </div>
        </div>
      )}
    </>
  );
}

function parseAiTerms(reply) {
  const sep = "---TERMES---";
  const idx = reply.indexOf(sep);
  if (idx === -1) return { cleanReply: reply, terms: [] };
  const cleanReply = reply.slice(0, idx).trim();
  try {
    const json = reply.slice(idx + sep.length).trim();
    const terms = JSON.parse(json);
    if (Array.isArray(terms)) return { cleanReply, terms };
  } catch {}
  return { cleanReply, terms: [] };
}

export default function ChatTab({ profil, account, portfolioVersion, marketScores }) {
  const [sessions, setSessions]         = useState(() => load("bourse_chat_sessions", []));
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [expandedTerms, setExpandedTerms] = useState(null);
  const [hoveredSession, setHoveredSession] = useState(null);
  const [briefing, setBriefing]         = useState(() => load("bourse_last_briefing", null));
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [oppoLoading, setOppoLoading]   = useState(false);
  const [activePanel, setActivePanel]   = useState("chat");
  const bottomRef                       = useRef(null);

  const persistSessions = (next) => { setSessions(next); save("bourse_chat_sessions", next.slice(-100)); };
  const deleteSession   = (id)  => persistSessions(sessions.filter(s => s.id !== id));

  useEffect(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const fresh = sessions.filter(s => s.id >= cutoff);
    if (fresh.length !== sessions.length) persistSessions(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayKey = new Date().toISOString().slice(0, 10);

  const buildPortfolioContext = () => {
    const all = sanitizePositions(load("bourse_portfolio", []));
    const positions = all.filter(p => (p.compte || "PEA") === (account || "PEA"));
    const totalInvesti = positions.reduce((s, p) => s + p.pru * p.quantite, 0);
    const totalActuel  = positions.reduce((s, p) => s + (p.dernierCours || p.pru) * p.quantite, 0);
    const pv           = totalActuel - totalInvesti;
    const pvPct        = totalInvesti > 0 ? ((pv / totalInvesti) * 100).toFixed(2) : "0";
    const posLines     = positions.map(p => {
      const val  = (p.dernierCours || p.pru) * p.quantite;
      const gain = ((p.dernierCours || p.pru) - p.pru) / p.pru * 100;
      return `- ${p.nom} (${p.isin || "?"}) : ${p.quantite} titres, PRU=${p.pru}€, cours=${p.dernierCours || "N/A"}€, valeur=${val.toFixed(0)}€, perf=${gain.toFixed(1)}%`;
    }).join("\n");
    const snapshots = load("bourse_snapshots", []).slice(-10);
    const snapLine  = snapshots.length >= 2
      ? `Historique récent : ${snapshots.map(s => `${s.date}=${s.valeur?.toFixed(0)}€`).join(", ")}`
      : "Pas d'historique.";
    const ops = load("bourse_avis_operes", []).filter(o => (o.compte || "PEA") === (account || "PEA")).slice(-10);
    const opsLine = ops.length > 0
      ? `10 dernières transactions : ${ops.map(o => `${o.date} ${o.type} ${o.quantite}×${o.titre} à ${o.prixUnitaire}€`).join(" | ")}`
      : "Aucune transaction.";
    const accountNames = new Set(positions.map(p => p.nom));
    const scores = (Array.isArray(marketScores) ? marketScores : []).filter(s => accountNames.has(s.nom));
    const scoresLine = scores.length > 0
      ? `Signaux IA marché : ${scores.map(s => `${s.nom}→${s.signal}(${s.score_marche}/20)`).join(", ")}`
      : "Pas de signaux IA.";
    const dividendes = load("bourse_dividendes", []).filter(d => (d.compte || "PEA") === (account || "PEA")).slice(-10);
    const divLine = dividendes.length > 0
      ? `Dividendes reçus : ${dividendes.map(d => `${d.date} ${d.titre} +${d.montant}€`).join(" | ")}`
      : "Aucun dividende enregistré.";
    const aiPf = load(`bourse_ai_portfolio_${account || "PEA"}`, null);
    const aiPfLine = aiPf ? `Portefeuille IA autonome : valeur=${((aiPf.cash || 0) + (aiPf.positions || []).reduce((s, p) => s + p.quantite * (p.dernier_cours || p.prix_achat_moyen || 0), 0)).toFixed(0)}€, capital initial=${aiPf.capital_initial || 0}€, ${aiPf.positions?.length || 0} positions, dernier cycle=${aiPf.last_morning_cycle || aiPf.last_evening_cycle || "jamais"}` : "Portefeuille IA non activé.";
    const autopilotRaw = load(`bourse_autopilot_last_${account || "PEA"}_${profil?.risque || "equilibre"}`, null);
    const autopilotLine = autopilotRaw?.resume ? `Analyse Autopilot (${autopilotRaw.generatedAt ? new Date(autopilotRaw.generatedAt).toLocaleDateString("fr-FR") : "N/A"}) : score marché ${autopilotRaw.score_marche || "N/A"}/20 — ${autopilotRaw.resume}` : "Pas d'analyse Autopilot récente.";
    return { positions, totalActuel, totalInvesti, pv, pvPct, posLines, snapLine, opsLine, scoresLine, divLine, aiPfLine, autopilotLine };
  };

  const buildSystemPrompt = () => {
    const { positions, totalActuel, totalInvesti, pv, pvPct, posLines, snapLine, opsLine, scoresLine, divLine, aiPfLine, autopilotLine } = buildPortfolioContext();
    const isNewUser = positions.length === 0;
    return `Tu es le Conseiller Privé IA de cet investisseur — et tu es également l'intelligence qui alimente l'Autopilot Atlas et le Portefeuille Autonome. Ces trois fonctionnalités ne font qu'un : c'est toi qui as généré les analyses Autopilot (recommandations DCA, score marché, signaux) et c'est toi qui gères les cycles du portefeuille autonome (positions simulées, arbitrages, décisions d'achat/vente). Tu as donc une vision complète et cohérente : tu sais ce que tu as recommandé en Autopilot, tu connais l'état du portefeuille autonome, et tu peux les relier à la situation réelle du portefeuille de l'investisseur. Réponds en français, de façon concise et personnalisée. Ne dis jamais "selon l'Autopilot" ou "le portefeuille autonome indique" — parle à la première personne : "j'ai recommandé", "dans mon analyse", "les positions que je gère".
${isNewUser ? `
MODE GUIDE DÉBUTANT : cet investisseur n'a pas encore de positions. Ton rôle est de l'accompagner pas à pas dans ses premiers investissements.
- Commence toujours par comprendre ses objectifs et sa situation avant de recommander quoi que ce soit
- Explique les concepts financiers simplement, avec des analogies concrètes
- Si on te demande "par où commencer", propose une roadmap claire en 3 étapes : (1) définir son profil, (2) choisir une enveloppe fiscale (PEA recommandé pour les Français), (3) commencer par un ETF World diversifié
- Adapte tes réponses à son horizon (${profil?.horizon || "non défini"}) et son compte (${account || "PEA"})
- Sois encourageant mais réaliste sur les risques
- Ne recommande jamais de produits à levier, options, cryptos ou produits complexes à un débutant
` : ""}
COMPTE : ${account || "PEA"} | PROFIL : risque=${profil?.risque || "N/A"}, horizon=${profil?.horizon || "N/A"}, DCA=${profil?.dcaMensuel || 0}€/mois, courtier=${getCourtierForAccount(profil, account)}, espèces disponibles=${account === "CTO" ? (profil?.especesCTO || 0) : (profil?.especesPEA || 0)}€

CONDITIONS TARIFAIRES COURTIER : ${COURTIERS_DETAIL[getCourtierForAccount(profil, account)] || COURTIERS_DETAIL.autre}
Tu connais donc exactement les frais applicables — ne demande JAMAIS à l'utilisateur ses frais de courtage, calcule-les directement.

PORTEFEUILLE (${positions.length} positions) :
${posLines || "Aucune position."}

RÉSUMÉ : valeur=${totalActuel.toFixed(0)}€, investi=${totalInvesti.toFixed(0)}€, PV=${pv >= 0 ? "+" : ""}${pv.toFixed(0)}€ (${pvPct}%)
${snapLine}
${opsLine}
${scoresLine}
${divLine}
${aiPfLine}
${autopilotLine}

STRATÉGIE DCA DE L'INVESTISSEUR : le DCA mensuel (${profil?.dcaMensuel || 0}€/mois) est EXCLUSIVEMENT réservé aux ETF (Amundi, Lyxor, iShares, etc.). Les actions individuelles (small caps, mid caps, grandes capitalisations) ne font JAMAIS l'objet de DCA — ni dans le plan, ni dans l'explication, ni dans la logique présentée. Pour les actions individuelles, parler uniquement d'"achat opportuniste", de "renforcement ponctuel" ou d'"achat au comptant" — JAMAIS de DCA. Si l'utilisateur pose une question sur son DCA, réorienter systématiquement vers les ETF.

${account === "PEA" ? `RÈGLE ABSOLUE PEA : l'utilisateur est dans son PEA. Ne JAMAIS recommander un instrument non éligible au PEA. Sont INTERDITS dans ce contexte : actions américaines (AAPL, NVDA, TSLA, etc.), ETF domiciliés hors UE (Vanguard FTSE, iShares IE sans équivalent PEA, etc.), obligations, fonds non UCITS, cryptos. Sont AUTORISÉS : actions cotées sur Euronext Paris/Amsterdam/Bruxelles/Lisbonne, ETF UCITS éligibles PEA (Amundi PEA, Lyxor PEA, etc.), actions européennes hors France si éligibles via UCITS. Si l'utilisateur demande un avis sur un instrument non éligible, lui signaler clairement et proposer l'équivalent PEA si disponible.` : `COMPTE CTO : tous les instruments sont accessibles (actions US, ETF monde, etc.).`}

RÈGLE ABSOLUE — ZÉRO INVENTION :
- ISIN : INTERDIT d'en écrire un seul. Tes ISINs sont statistiquement faux même quand tu crois les connaître. Si l'utilisateur demande un ISIN, réponds : "Je ne fournis pas d'ISIN — cherche sur Boursorama ou JustETF."
- Cours / prix / rendements : n'invente aucun chiffre absent des données portefeuille ci-dessus.
- Noms d'ETF : tu peux suggérer des familles d'ETF (ex : "Amundi MSCI World") sans donner de code.
- Principe : mieux vaut une réponse incomplète et honnête qu'une réponse complète et fausse.

RÈGLES : réponds en français, sois concis et direct, utilise les données ci-dessus. Markdown autorisé. Tu n'es pas conseiller financier agréé — toujours rappeler que les décisions appartiennent à l'investisseur.

TERMES TECHNIQUES : si tu utilises des termes financiers techniques dans ta réponse (ex : PRU, ETF, DCA, PEA, RSI, OPCVM, etc.), ajoute OBLIGATOIREMENT à la fin de ta réponse le bloc suivant — rien d'autre après :
---TERMES---
[{"term":"NOM_DU_TERME","def":"définition courte en français"},...]

Si aucun terme technique, n'ajoute pas ce bloc.`;
  };

  const generateBriefing = async () => {
    setBriefingLoading(true);
    const { positions, totalActuel, totalInvesti, pv, pvPct, posLines, scoresLine } = buildPortfolioContext();
    const top    = [...positions].sort((a,b) => ((b.dernierCours||b.pru)-b.pru)/b.pru - ((a.dernierCours||a.pru)-a.pru)/a.pru);
    const best   = top[0];
    const worst  = top[top.length - 1];
    const prompt = `Tu es un conseiller financier personnel. Génère un briefing matinal concis pour cet investisseur.

PORTEFEUILLE :
${posLines || "Aucune position."}
Valeur totale : ${totalActuel.toFixed(0)}€ | PV latente : ${pv >= 0 ? "+" : ""}${pv.toFixed(0)}€ (${pvPct}%)
Meilleure position : ${best?.nom || "N/A"} | Moins bonne : ${worst?.nom || "N/A"}
${scoresLine}

STRUCTURE DU BRIEFING (max 200 mots) :
1. **Résumé portefeuille** — état en une phrase
2. **Point du jour** — 1 observation clé sur la composition ou un signal IA
3. **3 actions prioritaires** — concrètes et actionnables aujourd'hui
4. **Vigilance** — 1 risque à surveiller

Réponds en français, direct, sans introduction générique.`;
    try {
      const reply = await callClaudeConversation("Tu es un conseiller financier. Sois concis et direct.", [{ role: "user", content: prompt }]);
      const data  = { date: todayKey, content: reply };
      setBriefing(data);
      save("bourse_last_briefing", data);
    } catch (e) {
      const msg = e.message || "";
      let friendly = "Une erreur est survenue. Réessaie dans quelques instants.";
      if (msg.includes("quota") || msg.includes("rate") || msg.includes("429") || msg.includes("limit: 0"))
        friendly = "Quota IA atteint. Configure ta propre clé Claude ou Gemini dans Paramètres → Clés API pour continuer.";
      else if (msg.includes("401") || msg.includes("invalid") || msg.includes("auth"))
        friendly = "Clé API invalide ou expirée. Vérifie ta clé dans Paramètres → Clés API.";
      else if (msg.includes("timeout") || msg.includes("timed out"))
        friendly = "L'IA a mis trop de temps à répondre. Réessaie dans un instant.";
      setBriefing({ date: todayKey, content: friendly, error: true });
    } finally {
      setBriefingLoading(false);
    }
  };

  useEffect(() => {
    const positions = sanitizePositions(load("bourse_portfolio", [])).filter(p => (p.compte || "PEA") === (account || "PEA"));
    if (positions.length > 0 && (!briefing || briefing.date !== todayKey)) {
      generateBriefing();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [sessions, loading]);

  // Reçoit les questions depuis les tooltips du glossaire et les envoie directement
  const sendRef = useRef(null);
  useEffect(() => { sendRef.current = sendMessage; });
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.query) setTimeout(() => sendRef.current?.(e.detail.query), 100);
    };
    window.addEventListener("openChatWithQuery", handler);
    return () => window.removeEventListener("openChatWithQuery", handler);
  }, []);

  const detectOpportunities = async () => {
    if (oppoLoading || loading) return;
    setOppoLoading(true);
    setActivePanel("chat");
    const { positions, totalActuel, posLines, scoresLine } = buildPortfolioContext();
    const sectors = {};
    positions.forEach(p => {
      const s = p.secteur || "Inconnu";
      sectors[s] = (sectors[s] || 0) + (p.dernierCours || p.pru) * p.quantite;
    });
    const sectorLines = Object.entries(sectors).map(([k, v]) => `${k}: ${((v/totalActuel)*100).toFixed(1)}%`).join(", ");
    const prompt = `Analyse ce portefeuille et identifie les opportunités concrètes.

POSITIONS :
${posLines}
RÉPARTITION SECTORIELLE : ${sectorLines || "Non disponible"}
${scoresLine}
PROFIL : risque=${profil?.risque}, horizon=${profil?.horizon} ans

Détecte et explique :
1. **Surexpositions** — secteurs ou positions > 25% du portefeuille
2. **Manques sectoriels** — secteurs absents mais pertinents pour ce profil
3. **Corrélations dangereuses** — positions qui évoluent de concert (risque de chute simultanée)
4. **Opportunités DCA** — quelle position renforcer ce mois (avec justification)
5. **Position à surveiller** — celle qui nécessite une attention particulière

Sois spécifique, cite les noms des positions, donne des chiffres.`;
    const userMsg = "Détecte les opportunités et risques dans mon portefeuille.";
    const sid = Date.now();
    const next = [...sessions, { id: sid, date: new Date().toISOString(), userMsg, assistantMsg: null, terms: [] }];
    persistSessions(next);
    try {
      const apiMsgs = sessions.flatMap(s => [{ role: "user", content: s.userMsg }, ...(s.assistantMsg ? [{ role: "assistant", content: s.assistantMsg }] : [])]).concat({ role: "user", content: prompt });
      const raw = await callClaudeConversation(buildSystemPrompt(), apiMsgs);
      const { cleanReply, terms } = parseAiTerms(raw);
      setSessions(prev => { const upd = prev.map(s => s.id === sid ? { ...s, assistantMsg: cleanReply, terms } : s); save("bourse_chat_sessions", upd.slice(-100)); return upd; });
    } catch (e) {
      setError(e.message);
    } finally {
      setOppoLoading(false);
    }
  };

  const SUGGESTIONS = [
    "Quel est mon actif le plus performant ?",
    "Quels sont mes risques principaux ?",
    "Analyse ma diversification sectorielle",
    "Si le marché baisse de 10%, quel est mon impact ?",
    "Quelle position renforcer en DCA ce mois ?",
    "Résume mon portefeuille en 3 points",
  ];

  const sendMessage = async (text) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;
    setInput(""); setError(null); setActivePanel("chat");
    const sid = Date.now();
    const next = [...sessions, { id: sid, date: new Date().toISOString(), userMsg: userText, assistantMsg: null, terms: [] }];
    persistSessions(next);
    setLoading(true);
    const apiMsgs = sessions.flatMap(s => [
      { role: "user", content: s.userMsg },
      ...(s.assistantMsg ? [{ role: "assistant", content: s.assistantMsg }] : []),
    ]).concat({ role: "user", content: userText });
    try {
      const raw = await callClaudeConversation(buildSystemPrompt(), apiMsgs);
      const { cleanReply, terms } = parseAiTerms(raw);
      setSessions(prev => {
        const updated = prev.map(s => s.id === sid ? { ...s, assistantMsg: cleanReply, terms } : s);
        save("bourse_chat_sessions", updated.slice(-100));
        return updated;
      });
    } catch (e) {
      setError(e.message);
      setSessions(prev => { const upd = prev.filter(s => s.id !== sid); save("bourse_chat_sessions", upd); return upd; });
    } finally {
      setLoading(false);
    }
  };

  const formatMessage = (text) => {
    const applyInline = (s) => s
      .replace(/\*\*(.+?)\*\*/g, (_, m) => `<strong>${m}</strong>`)
      .replace(/\*(.+?)\*/g, (_, m) => `<em>${m}</em>`)
      .replace(/`(.+?)`/g, (_, m) => `<code style="background:rgba(30,58,95,0.08);padding:1px 5px;border-radius:4px;font-size:0.92em">${m}</code>`);

    const lines = text.split("\n");
    const result = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
        result.push(<hr key={i} style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "10px 0" }} />);
        i++; continue;
      }
      if (/^#{1,3}\s/.test(line)) {
        const lvl = line.match(/^(#+)/)[1].length;
        const txt = line.replace(/^#+\s/, "");
        const sz  = lvl === 1 ? "15px" : lvl === 2 ? "13.5px" : "12.5px";
        result.push(<div key={i} style={{ fontWeight: "800", fontSize: sz, color: C.ink, marginTop: "10px", marginBottom: "4px" }} dangerouslySetInnerHTML={{ __html: applyInline(txt) }} />);
        i++; continue;
      }
      if (line.startsWith("> ")) {
        const txt = line.replace(/^>\s?/, "");
        result.push(<div key={i} style={{ borderLeft: `3px solid ${C.gold}`, paddingLeft: "10px", color: C.inkMuted, fontSize: "12.5px", margin: "6px 0" }} dangerouslySetInnerHTML={{ __html: applyInline(txt) }} />);
        i++; continue;
      }
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) { tableLines.push(lines[i]); i++; }
        const isSeperator = (l) => /^\|[-: |]+\|$/.test(l.trim());
        const rows = tableLines.filter(l => !isSeperator(l));
        result.push(
          <div key={`table-${i}`} style={{ overflowX: "auto", margin: "8px 0" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px" }}>
              <tbody>
                {rows.map((row, ri) => {
                  const cells = row.trim().replace(/^\||\|$/g, "").split("|");
                  const isHeader = ri === 0;
                  return (
                    <tr key={ri} style={{ background: ri % 2 === 0 ? "rgba(30,58,95,0.03)" : "transparent" }}>
                      {cells.map((cell, ci) => (
                        <td key={ci} style={{ padding: "5px 10px", borderBottom: `1px solid ${C.border}`, fontWeight: isHeader ? "700" : "400", color: isHeader ? C.ink : C.inkMuted, whiteSpace: "nowrap" }}
                          dangerouslySetInnerHTML={{ __html: applyInline(cell.trim()) }} />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
      if (/^[-•*]\s/.test(line)) {
        result.push(<div key={i} style={{ display: "flex", gap: "7px", marginBottom: "3px", alignItems: "flex-start" }}>
          <span style={{ color: C.gold, fontWeight: "800", flexShrink: 0, marginTop: "1px" }}>·</span>
          <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.55" }} dangerouslySetInnerHTML={{ __html: applyInline(line.replace(/^[-•*]\s/, "")) }} />
        </div>);
        i++; continue;
      }
      if (/^\d+\.\s/.test(line)) {
        const num = line.match(/^(\d+)\./)[1];
        result.push(<div key={i} style={{ display: "flex", gap: "7px", marginBottom: "4px", alignItems: "flex-start" }}>
          <span style={{ minWidth: "18px", height: "18px", borderRadius: "50%", background: C.accent, color: "#fff", fontSize: "10px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "2px" }}>{num}</span>
          <span style={{ fontSize: "13px", color: C.inkMuted, lineHeight: "1.55" }} dangerouslySetInnerHTML={{ __html: applyInline(line.replace(/^\d+\.\s/, "")) }} />
        </div>);
        i++; continue;
      }
      if (line.trim() === "") { result.push(<div key={i} style={{ height: "6px" }} />); i++; continue; }
      result.push(<p key={i} style={{ margin: "2px 0", fontSize: "13px", color: C.inkMuted, lineHeight: "1.6" }} dangerouslySetInnerHTML={{ __html: applyInline(line) }} />);
      i++;
    }
    return result;
  };

  const isBusy = loading || oppoLoading;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 100px)", maxWidth: "820px", margin: "0 auto", padding: "0 16px 16px" }}>

      <div style={{ padding: "16px 0 12px", borderBottom: `1px solid ${C.border}`, marginBottom: "12px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: shadow.pill, flexShrink: 0 }}>
            <IconChat />
          </div>
          <div style={{ flex: 1, minWidth: "120px" }}>
            <div style={{ fontWeight: "700", fontSize: "15px", color: C.ink }}>Conseiller Privé</div>
            <div style={{ fontSize: "11px", color: C.inkSubtle }}>Briefing · Conseil · Autopilot · Portefeuille autonome</div>
          </div>
          <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
            {[["briefing", "Briefing du jour"], ["chat", "Chat libre"]].map(([panel, label]) => (
              <button key={panel} onClick={() => setActivePanel(panel)}
                style={{ fontSize: "11px", fontWeight: "600", padding: "5px 12px", borderRadius: "20px", border: `1px solid ${activePanel === panel ? C.accent : C.border}`, background: activePanel === panel ? C.accent : "transparent", color: activePanel === panel ? "#fff" : C.inkMuted, cursor: "pointer", transition: "all 0.15s" }}>
                {label}
              </button>
            ))}
          </div>
          {activePanel === "chat" && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "10px", color: C.inkSubtle, fontStyle: "italic" }}>Conservé 24h</span>
              {sessions.length > 0 && (
                <button onClick={() => { if(window.confirm("Effacer tout l'historique ?")) { persistSessions([]); setError(null); } }}
                  style={{ fontSize: "11px", fontWeight: "600", color: C.inkSubtle, background: C.snowDim, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "5px 10px", cursor: "pointer" }}>
                  Tout effacer
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {activePanel === "briefing" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ background: C.cardGradGold, border: `1px solid rgba(230,184,0,0.3)`, borderRadius: "16px", padding: "20px", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div>
                <div style={{ fontWeight: "700", fontSize: "14px", color: C.ink }}>Briefing du {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
                <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "2px" }}>Analyse IA de votre portefeuille · Mis à jour chaque matin</div>
              </div>
              <button onClick={generateBriefing} disabled={briefingLoading}
                style={{ fontSize: "11px", fontWeight: "600", padding: "6px 12px", borderRadius: "10px", border: `1px solid ${C.border}`, background: briefingLoading ? C.snowDim : C.snow, color: briefingLoading ? C.inkSubtle : C.ink, cursor: briefingLoading ? "not-allowed" : "pointer" }}>
                {briefingLoading ? "Génération…" : "Rafraîchir"}
              </button>
            </div>
            {briefingLoading && (
              <div style={{ display: "flex", gap: "5px", alignItems: "center", padding: "20px 0", justifyContent: "center" }}>
                {[0,1,2].map(j => <span key={j} style={{ width: "7px", height: "7px", borderRadius: "50%", background: C.gold, display: "inline-block", animation: `chatDot 1.2s ease-in-out ${j * 0.2}s infinite` }} />)}
              </div>
            )}
            {!briefingLoading && briefing?.content && !briefing?.error && (
              <div style={{ fontSize: "13px", lineHeight: "1.65", color: C.ink }}>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>{formatMessage(briefing.content)}</ul>
              </div>
            )}
            {!briefingLoading && briefing?.error && (
              <div style={{ color: C.red, fontSize: "12.5px" }}>{briefing.content}</div>
            )}
            {!briefingLoading && !briefing && (
              <div style={{ textAlign: "center", color: C.inkSubtle, fontSize: "12.5px", padding: "16px 0" }}>Cliquez sur "Rafraîchir" pour générer le briefing.</div>
            )}
          </div>
          <div style={{ background: C.cardGradGreen, border: `1px solid rgba(39,174,96,0.2)`, borderRadius: "16px", padding: "18px 20px" }}>
            <div style={{ fontWeight: "700", fontSize: "13.5px", color: C.ink, marginBottom: "6px" }}>Détection d'opportunités</div>
            <div style={{ fontSize: "12px", color: C.inkSubtle, marginBottom: "14px" }}>Analyse croisée : surexpositions, corrélations cachées, secteurs manquants, position DCA prioritaire.</div>
            <button onClick={() => { detectOpportunities(); setActivePanel("chat"); }} disabled={isBusy}
              style={{ padding: "9px 20px", borderRadius: "12px", border: "none", cursor: isBusy ? "not-allowed" : "pointer", background: isBusy ? C.snowDim : `linear-gradient(135deg, #1E8449 0%, ${C.green} 100%)`, color: isBusy ? C.inkSubtle : "#fff", fontSize: "12px", fontWeight: "700", boxShadow: !isBusy ? "0 4px 16px rgba(39,174,96,0.35)" : "none", transition: "all 0.15s" }}>
              {oppoLoading ? "Analyse en cours…" : "Détecter les opportunités →"}
            </button>
          </div>
        </div>
      )}

      {activePanel === "chat" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "8px" }}>
            {sessions.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", paddingTop: "20px" }}>
                <div style={{ fontSize: "12.5px", color: C.inkSubtle }}>Suggestions :</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", maxWidth: "600px" }}>
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} onClick={() => sendMessage(s)}
                      style={{ fontSize: "12px", color: C.accent, background: C.paleBlue, border: `1px solid rgba(30,58,95,0.15)`, borderRadius: "20px", padding: "7px 14px", cursor: "pointer", fontWeight: "500" }}>
                      {s}
                    </button>
                  ))}
                </div>
                <button onClick={() => { detectOpportunities(); }} disabled={isBusy}
                  style={{ fontSize: "12px", fontWeight: "700", color: C.green, background: C.greenLight, border: `1px solid rgba(39,174,96,0.25)`, borderRadius: "20px", padding: "8px 18px", cursor: isBusy ? "not-allowed" : "pointer" }}>
                  Détecter les opportunités
                </button>
              </div>
            )}

            {sessions.map((sess) => (
              <div key={sess.id}
                onMouseEnter={() => setHoveredSession(sess.id)}
                onMouseLeave={() => setHoveredSession(null)}
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "6px" }}>
                  {hoveredSession === sess.id && (
                    <button onClick={() => deleteSession(sess.id)} title="Supprimer cet échange"
                      style={{ width: "20px", height: "20px", borderRadius: "50%", border: "none", background: C.snowDim, color: C.inkSubtle, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, lineHeight: 1 }}>
                      ×
                    </button>
                  )}
                  <div style={{ maxWidth: "78%", padding: "10px 14px", borderRadius: "16px 16px 4px 16px", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", color: "#fff", boxShadow: shadow.card, fontSize: "13.5px", lineHeight: "1.55" }}>
                    {sess.userMsg}
                  </div>
                </div>
                {sess.assistantMsg && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0, marginTop: "2px" }}>
                      <IconChat />
                    </div>
                    <div style={{ maxWidth: "78%" }}>
                      <div style={{ position: "relative" }}>
                        <div style={{ padding: "10px 14px", borderRadius: "16px 16px 16px 4px", background: C.snow, color: C.ink, boxShadow: shadow.card, fontSize: "13.5px", lineHeight: "1.55", border: `1px solid ${C.border}` }}>
                          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>{formatMessage(sess.assistantMsg)}</ul>
                        </div>
                        <button onClick={() => navigator.clipboard?.writeText(sess.assistantMsg)} title="Copier la réponse"
                          style={{ position: "absolute", top: "8px", right: "8px", width: "32px", height: "32px", borderRadius: "8px", border: `1px solid ${C.border}`, background: C.bg, color: C.ink, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: shadow.card, opacity: hoveredSession === sess.id ? 1 : 0, transition: "opacity 0.15s" }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                      </div>
                      {sess.terms && sess.terms.length > 0 && (
                        <div style={{ marginTop: "6px" }}>
                          <button onClick={() => setExpandedTerms(expandedTerms === sess.id ? null : sess.id)}
                            style={{ fontSize: "10px", fontWeight: "700", color: C.accent, background: C.paleBlue, border: `1px solid rgba(30,58,95,0.15)`, borderRadius: "12px", padding: "3px 10px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            📚 {sess.terms.length} terme{sess.terms.length > 1 ? "s" : ""} · {sess.terms.map(t => t.term).join(", ")}
                          </button>
                          {expandedTerms === sess.id && (
                            <div style={{ marginTop: "6px", background: C.snow, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                              {sess.terms.map(({ term, def }) => (
                                <div key={term}>
                                  <span style={{ fontWeight: "700", fontSize: "11.5px", color: C.accent }}>{term}</span>
                                  <span style={{ fontSize: "11.5px", color: C.inkMuted }}> — {def}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: "10px", color: C.inkSubtle, marginTop: "4px", paddingLeft: "2px" }}>
                        {new Date(sess.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isBusy && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "linear-gradient(135deg, #1A3A6B, #2D6CB5)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}><IconChat /></div>
                <div style={{ padding: "10px 16px", background: C.snow, borderRadius: "16px 16px 16px 4px", border: `1px solid ${C.border}`, boxShadow: shadow.card, display: "flex", gap: "5px", alignItems: "center" }}>
                  {[0,1,2].map(j => <span key={j} style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.accent, display: "inline-block", animation: `chatDot 1.2s ease-in-out ${j * 0.2}s infinite` }} />)}
                </div>
              </div>
            )}

            {error && <div style={{ padding: "10px 14px", background: C.redLight, border: `1px solid rgba(231,76,60,0.25)`, borderRadius: "12px", color: C.red, fontSize: "12.5px" }}>{error}</div>}
            <div ref={bottomRef} />
          </div>

          <div style={{ flexShrink: 0, paddingTop: "10px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Posez une question sur votre portefeuille…" rows={2}
                style={{ flex: 1, padding: "10px 14px", borderRadius: "14px", border: `1px solid ${C.border}`, background: C.snow, fontSize: "13.5px", color: C.ink, resize: "none", fontFamily: "inherit", outline: "none", boxShadow: shadow.card, lineHeight: "1.5" }} />
              <button onClick={() => sendMessage()} disabled={!input.trim() || isBusy}
                style={{ width: "42px", height: "42px", borderRadius: "12px", border: "none", cursor: input.trim() && !isBusy ? "pointer" : "not-allowed", background: input.trim() && !isBusy ? "linear-gradient(135deg, #1A3A6B, #2D6CB5)" : C.snowDim, color: input.trim() && !isBusy ? "#fff" : C.inkSubtle, fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: input.trim() && !isBusy ? shadow.pill : "none", transition: "all 0.15s" }}>
                ↑
              </button>
            </div>
            <div style={{ fontSize: "11px", color: C.inkSubtle, marginTop: "5px", textAlign: "center" }}>Entrée pour envoyer · Shift+Entrée pour nouvelle ligne</div>
          </div>
        </>
      )}

      <style>{`@keyframes chatDot { 0%,80%,100%{opacity:0.3;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  );
}
