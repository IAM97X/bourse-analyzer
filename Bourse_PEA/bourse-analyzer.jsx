import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `Tu es un analyste financier expert spécialisé dans les marchés boursiers.
Tu analyses les actions, ETF et instruments financiers avec rigueur et objectivité.

IMPORTANT : Réponds UNIQUEMENT en JSON valide, sans balises markdown, sans texte avant ou après.
Format exact à respecter :

{
  "nom": "Nom complet de l'action/ETF",
  "secteur": "Secteur d'activité",
  "vue_ensemble": "Description en 2-3 phrases de ce que fait l'entreprise",
  "performance": {
    "cours_actuel": "XX,XX €",
    "evolution_1an": "+XX% ou -XX%",
    "plus_haut_52s": "XX,XX €",
    "plus_bas_52s": "XX,XX €"
  },
  "fondamentaux": {
    "per": "XX,X",
    "dividende": "X,XX € (X,X%)",
    "capitalisation": "XX Mds€",
    "dette_nette": "XX Mds€ ou Trésorerie nette XX Mds€"
  },
  "points_forts": ["Point fort 1", "Point fort 2", "Point fort 3"],
  "points_vigilance": ["Risque 1", "Risque 2", "Risque 3"],
  "contexte_sectoriel": "Analyse du secteur en 2-3 phrases",
  "valorisation": {
    "objectif_moyen": "XX,XX €",
    "objectif_haut": "XX,XX €",
    "objectif_bas": "XX,XX €",
    "nb_analystes": "XX",
    "potentiel": "+XX% ou -XX%",
    "appreciation": "Décoté / Juste valorisé / Cher"
  },
  "timing": {
    "point_entree": "XX,XX € à XX,XX €",
    "catalyseurs": ["Résultats Q1 le JJ/MM", "AGM le JJ/MM", "Dividende le JJ/MM"],
    "recommandation_timing": "Texte court sur le timing"
  },
  "verdict": {
    "signal": "ACHAT / RENFORCER / ATTENDRE / PRUDENCE",
    "cible_12m": "XX,XX €",
    "justification": "Justification courte en 2-3 phrases"
  }
}`;

const SUGGESTIONS = [
  "LVMH", "Apple", "Nvidia", "CAC 40", "ETF World MSCI",
  "TotalEnergies", "Airbus", "BNP Paribas", "Technip Energies", "Valneva"
];

const SIGNAL_CONFIG = {
  "ACHAT":     { color: "#00ff88", bg: "rgba(0,255,136,0.10)",   border: "rgba(0,255,136,0.35)",   icon: "▲" },
  "RENFORCER": { color: "#44ddff", bg: "rgba(68,221,255,0.10)",  border: "rgba(68,221,255,0.35)",  icon: "+" },
  "ATTENDRE":  { color: "#ffbb44", bg: "rgba(255,187,68,0.10)",  border: "rgba(255,187,68,0.35)",  icon: "◆" },
  "PRUDENCE":  { color: "#ff6644", bg: "rgba(255,102,68,0.10)",  border: "rgba(255,102,68,0.35)",  icon: "▼" },
};

const LoadingDots = () => {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setDots(d => (d + 1) % 4), 400);
    return () => clearInterval(interval);
  }, []);
  return <span style={{ letterSpacing: "4px", color: "#00ff88", fontSize: "20px" }}>{"●".repeat(dots)}{"○".repeat(3 - dots)}</span>;
};

const StatBox = ({ label, value, color }) => (
  <div style={{
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "6px", padding: "12px", textAlign: "center"
  }}>
    <div style={{ fontSize: "9px", color: "#5a7a8a", letterSpacing: "2px", marginBottom: "6px" }}>{label}</div>
    <div style={{ fontSize: "14px", fontWeight: "700", color: color || "#ffffff" }}>{value || "—"}</div>
  </div>
);

const SectionCard = ({ title, icon, borderColor, bgColor, children }) => (
  <div style={{
    background: bgColor || "rgba(0,0,0,0.25)",
    border: `1px solid ${borderColor || "rgba(255,255,255,0.08)"}`,
    borderRadius: "8px", overflow: "hidden", marginBottom: "14px"
  }}>
    <div style={{
      background: "rgba(0,0,0,0.2)",
      borderBottom: `1px solid ${borderColor || "rgba(255,255,255,0.06)"}`,
      padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px"
    }}>
      <span>{icon}</span>
      <span style={{ fontSize: "10px", letterSpacing: "3px", color: borderColor || "#7a9aaa", fontWeight: "700" }}>{title}</span>
    </div>
    <div style={{ padding: "16px" }}>{children}</div>
  </div>
);

const AnalysisResult = ({ data, query, timestamp }) => {
  const rawSignal = (data.verdict?.signal || "ATTENDRE").toUpperCase();
  const signal = Object.keys(SIGNAL_CONFIG).find(k => rawSignal.includes(k)) || "ATTENDRE";
  const cfg = SIGNAL_CONFIG[signal];
  const fmt = (d) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>

      {/* Titre */}
      <div style={{
        background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "10px", padding: "20px 24px", marginBottom: "14px",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px"
      }}>
        <div>
          <div style={{ fontSize: "10px", color: "#5a7a8a", letterSpacing: "3px", marginBottom: "4px" }}>RAPPORT D'ANALYSE · {fmt(timestamp)}</div>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#ffffff" }}>{data.nom || query.toUpperCase()}</div>
          <div style={{ fontSize: "11px", color: "#7a9aaa", marginTop: "3px" }}>{data.secteur}</div>
        </div>
        <div style={{
          background: cfg.bg, border: `2px solid ${cfg.border}`,
          borderRadius: "8px", padding: "10px 20px", textAlign: "center"
        }}>
          <div style={{ fontSize: "22px", fontWeight: "700", color: cfg.color, letterSpacing: "3px" }}>{cfg.icon} {signal}</div>
          <div style={{ fontSize: "10px", color: cfg.color, opacity: 0.7, letterSpacing: "2px", marginTop: "2px" }}>SIGNAL</div>
        </div>
      </div>

      {/* Vue ensemble */}
      {data.vue_ensemble && (
        <div style={{
          background: "rgba(0,255,136,0.03)", border: "1px solid rgba(0,255,136,0.1)",
          borderRadius: "8px", padding: "14px 18px", marginBottom: "14px",
          fontSize: "13px", color: "#a8c8b8", lineHeight: "1.75"
        }}>
          {data.vue_ensemble}
        </div>
      )}

      {/* Performance + Fondamentaux côte à côte */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        {data.performance && (
          <SectionCard title="PERFORMANCE" icon="📈" borderColor="rgba(0,255,136,0.2)">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <StatBox label="COURS ACTUEL" value={data.performance.cours_actuel} color="#00ff88" />
              <StatBox label="ÉVOL. 1 AN" value={data.performance.evolution_1an}
                color={data.performance.evolution_1an?.startsWith("+") ? "#00ff88" : "#ff6644"} />
              <StatBox label="+ HAUT 52S" value={data.performance.plus_haut_52s} />
              <StatBox label="+ BAS 52S" value={data.performance.plus_bas_52s} />
            </div>
          </SectionCard>
        )}
        {data.fondamentaux && (
          <SectionCard title="FONDAMENTAUX" icon="📊" borderColor="rgba(68,221,255,0.2)">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <StatBox label="PER" value={data.fondamentaux.per} />
              <StatBox label="DIVIDENDE" value={data.fondamentaux.dividende} color="#ffbb44" />
              <StatBox label="CAPITALISATION" value={data.fondamentaux.capitalisation} />
              <StatBox label="DETTE / TRÉSO" value={data.fondamentaux.dette_nette} />
            </div>
          </SectionCard>
        )}
      </div>

      {/* Points forts + Vigilance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        {data.points_forts && (
          <SectionCard title="POINTS FORTS" icon="✅" borderColor="rgba(0,255,136,0.25)" bgColor="rgba(0,255,136,0.02)">
            {data.points_forts.map((p, i) => (
              <div key={i} style={{
                display: "flex", gap: "10px", padding: "8px 0",
                borderBottom: i < data.points_forts.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none"
              }}>
                <span style={{ color: "#00ff88", flexShrink: 0 }}>▸</span>
                <span style={{ fontSize: "12px", color: "#9ac8a8", lineHeight: "1.5" }}>{p}</span>
              </div>
            ))}
          </SectionCard>
        )}
        {data.points_vigilance && (
          <SectionCard title="POINTS DE VIGILANCE" icon="⚠️" borderColor="rgba(255,102,68,0.25)" bgColor="rgba(255,102,68,0.02)">
            {data.points_vigilance.map((p, i) => (
              <div key={i} style={{
                display: "flex", gap: "10px", padding: "8px 0",
                borderBottom: i < data.points_vigilance.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none"
              }}>
                <span style={{ color: "#ff6644", flexShrink: 0 }}>▸</span>
                <span style={{ fontSize: "12px", color: "#c8a098", lineHeight: "1.5" }}>{p}</span>
              </div>
            ))}
          </SectionCard>
        )}
      </div>

      {/* Contexte sectoriel */}
      {data.contexte_sectoriel && (
        <SectionCard title="CONTEXTE SECTORIEL" icon="🌍" borderColor="rgba(68,221,255,0.2)">
          <p style={{ fontSize: "13px", color: "#a0b8c8", lineHeight: "1.7", margin: 0 }}>{data.contexte_sectoriel}</p>
        </SectionCard>
      )}

      {/* Valorisation */}
      {data.valorisation && (
        <SectionCard title="VALORISATION & CONSENSUS ANALYSTES" icon="🎯" borderColor="rgba(255,187,68,0.25)" bgColor="rgba(255,187,68,0.02)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "14px" }}>
            <StatBox label="OBJECTIF MOYEN" value={data.valorisation.objectif_moyen} color="#ffbb44" />
            <StatBox label="OBJECTIF HAUT" value={data.valorisation.objectif_haut} color="#00ff88" />
            <StatBox label="OBJECTIF BAS" value={data.valorisation.objectif_bas} color="#ff6644" />
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ background: "rgba(255,187,68,0.1)", border: "1px solid rgba(255,187,68,0.25)", borderRadius: "4px", padding: "6px 14px", fontSize: "12px", color: "#ffbb44" }}>
              POTENTIEL : {data.valorisation.potentiel}
            </div>
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", padding: "6px 14px", fontSize: "12px", color: "#a0b8c8" }}>
              {data.valorisation.nb_analystes} ANALYSTES
            </div>
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "4px", padding: "6px 14px", fontSize: "12px", color: "#a0b8c8" }}>
              {data.valorisation.appreciation}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Timing */}
      {data.timing && (
        <SectionCard title="TIMING & POINT D'ENTRÉE" icon="⏱" borderColor="rgba(68,221,255,0.25)" bgColor="rgba(68,221,255,0.02)">
          <div style={{ marginBottom: "14px" }}>
            <div style={{ fontSize: "9px", color: "#5a7a8a", letterSpacing: "2px", marginBottom: "6px" }}>ZONE D'ENTRÉE CONSEILLÉE</div>
            <div style={{ fontSize: "20px", fontWeight: "700", color: "#44ddff" }}>{data.timing.point_entree}</div>
          </div>
          {data.timing.catalyseurs?.length > 0 && (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "9px", color: "#5a7a8a", letterSpacing: "2px", marginBottom: "8px" }}>PROCHAINS CATALYSEURS</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {data.timing.catalyseurs.map((c, i) => (
                  <div key={i} style={{ background: "rgba(68,221,255,0.06)", border: "1px solid rgba(68,221,255,0.15)", borderRadius: "4px", padding: "4px 10px", fontSize: "11px", color: "#7acce0" }}>
                    📅 {c}
                  </div>
                ))}
              </div>
            </div>
          )}
          <p style={{ fontSize: "12px", color: "#a0b8c8", lineHeight: "1.6", margin: 0 }}>{data.timing.recommandation_timing}</p>
        </SectionCard>
      )}

      {/* Verdict */}
      {data.verdict && (
        <div style={{
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          borderRadius: "10px", padding: "20px 24px", marginBottom: "12px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "3px", color: cfg.color }}>VERDICT FINAL</div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "#5a7a8a", letterSpacing: "2px" }}>CIBLE 12 MOIS</div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: cfg.color }}>{data.verdict.cible_12m}</div>
            </div>
          </div>
          <div style={{ fontSize: "26px", fontWeight: "700", color: cfg.color, letterSpacing: "3px", marginBottom: "12px" }}>
            {cfg.icon} {signal}
          </div>
          <p style={{ fontSize: "13px", color: "#b0c8d8", lineHeight: "1.7", margin: 0 }}>{data.verdict.justification}</p>
        </div>
      )}

      <div style={{ fontSize: "10px", color: "#3a5a6a", textAlign: "center", padding: "8px", letterSpacing: "1px" }}>
        ⚠ Analyse IA informative uniquement · Pas un conseil en investissement · Investir comporte des risques de perte en capital
      </div>
    </div>
  );
};

export default function BourseAnalyzer() {
  const [query, setQuery] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [rawText, setRawText] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const outputRef = useRef(null);

  useEffect(() => {
    if ((analysis || rawText) && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [analysis, rawText]);

  const analyze = async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim()) return;
    setLoading(true); setError(null); setAnalysis(null); setRawText(null); setShowSuggestions(false);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: `Analyse complète de : ${q}. Données les plus récentes. JSON uniquement.` }]
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const textBlocks = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      if (textBlocks) {
        try {
          const clean = textBlocks.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
          const parsed = JSON.parse(clean.substring(s, e + 1));
          setAnalysis({ data: parsed, query: q, timestamp: new Date() });
        } catch {
          setRawText({ text: textBlocks, query: q, timestamp: new Date() });
        }
        setHistory(prev => [{ query: q, timestamp: new Date() }, ...prev.slice(0, 4)]);
      }
    } catch (err) {
      setError(err.message || "Erreur lors de l'analyse.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080c10", color: "#c8d8e8", fontFamily: "'Courier New', monospace", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: `linear-gradient(rgba(0,255,136,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.025) 1px, transparent 1px)`, backgroundSize: "40px 40px" }} />
      <div style={{ position: "fixed", top: "-150px", left: "50%", transform: "translateX(-50%)", width: "700px", height: "300px", background: "radial-gradient(ellipse, rgba(0,255,136,0.05) 0%, transparent 70%)", zIndex: 0, pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: "860px", margin: "0 auto", padding: "36px 20px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{ display: "inline-block", background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)", borderRadius: "4px", padding: "4px 16px", fontSize: "10px", letterSpacing: "4px", color: "#00ff88", marginBottom: "14px" }}>
            SYSTÈME ACTIF ● {new Date().toLocaleDateString("fr-FR")}
          </div>
          <h1 style={{ fontSize: "clamp(26px,5vw,40px)", fontWeight: "700", color: "#ffffff", margin: "0 0 6px", letterSpacing: "-1px" }}>
            TERMINAL<span style={{ color: "#00ff88" }}>_</span>BOURSE
          </h1>
          <p style={{ fontSize: "11px", color: "#5a7a8a", letterSpacing: "2px", margin: 0 }}>ANALYSE IA · DONNÉES TEMPS RÉEL · CONSENSUS ANALYSTES · PEA</p>
        </div>

        {/* Search */}
        <div style={{ background: "rgba(0,255,136,0.04)", border: "1px solid rgba(0,255,136,0.15)", borderRadius: "8px", padding: "20px", marginBottom: "24px", position: "relative" }}>
          <div style={{ fontSize: "10px", color: "#00ff88", letterSpacing: "3px", marginBottom: "10px" }}>› REQUÊTE</div>
          <div style={{ display: "flex", gap: "10px" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setShowSuggestions(true); }}
                onKeyDown={e => e.key === "Enter" && analyze()}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Apple, LVMH, Nvidia, ETF World MSCI..."
                style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,255,136,0.2)", borderRadius: "6px", padding: "13px 16px", color: "#ffffff", fontSize: "14px", fontFamily: "'Courier New', monospace", outline: "none", boxSizing: "border-box" }}
              />
              {showSuggestions && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#0d1318", border: "1px solid rgba(0,255,136,0.2)", borderTop: "none", borderRadius: "0 0 6px 6px", zIndex: 10 }}>
                  {(query.length === 0 ? SUGGESTIONS : SUGGESTIONS.filter(s => s.toLowerCase().includes(query.toLowerCase()))).slice(0, 5).map(s => (
                    <div key={s}
                      onMouseDown={e => { e.preventDefault(); setQuery(s); setShowSuggestions(false); analyze(s); }}
                      style={{ padding: "10px 16px", cursor: "pointer", fontSize: "13px", color: "#a0b8c8", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,255,136,0.08)"; e.currentTarget.style.color = "#00ff88"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#a0b8c8"; }}
                    >› {s}</div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => analyze()} disabled={loading || !query.trim()}
              style={{ background: loading ? "rgba(0,255,136,0.08)" : "rgba(0,255,136,0.15)", border: "1px solid rgba(0,255,136,0.3)", borderRadius: "6px", padding: "13px 24px", color: "#00ff88", fontSize: "12px", fontFamily: "'Courier New', monospace", letterSpacing: "2px", cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap", fontWeight: "700" }}
            >{loading ? "SCAN..." : "ANALYSER ›"}</button>
          </div>
          {history.length > 0 && (
            <div style={{ marginTop: "12px", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "10px", color: "#3a5a6a", letterSpacing: "2px" }}>RÉCENT:</span>
              {history.map((h, i) => (
                <button key={i} onClick={() => { setQuery(h.query); analyze(h.query); }}
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px", padding: "3px 10px", color: "#7a9aaa", fontSize: "11px", fontFamily: "'Courier New', monospace", cursor: "pointer" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#00ff88"; e.currentTarget.style.borderColor = "rgba(0,255,136,0.3)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "#7a9aaa"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                >{h.query}</button>
              ))}
            </div>
          )}
        </div>

        {loading && (
          <div style={{ background: "rgba(0,255,136,0.03)", border: "1px solid rgba(0,255,136,0.1)", borderRadius: "8px", padding: "40px", textAlign: "center" }}>
            <div style={{ fontSize: "11px", color: "#5a7a8a", letterSpacing: "3px", marginBottom: "20px" }}>ANALYSE EN COURS</div>
            <LoadingDots />
            <div style={{ fontSize: "10px", color: "#3a5a6a", marginTop: "16px", letterSpacing: "2px" }}>RECHERCHE WEB · FONDAMENTAUX · CONSENSUS · VALORISATION</div>
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(255,80,80,0.06)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: "8px", padding: "20px", color: "#ff8080", fontSize: "13px" }}>✕ ERREUR : {error}</div>
        )}

        {analysis && <div ref={outputRef}><AnalysisResult data={analysis.data} query={analysis.query} timestamp={analysis.timestamp} /></div>}

        {rawText && (
          <div ref={outputRef} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(0,255,136,0.15)", borderRadius: "8px", padding: "24px", fontSize: "13px", color: "#b0c8d8", lineHeight: "1.8", whiteSpace: "pre-wrap" }}>
            {rawText.text}
          </div>
        )}

        {!loading && !analysis && !rawText && !error && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: "36px", marginBottom: "16px", opacity: 0.2 }}>◈</div>
            <p style={{ fontSize: "11px", color: "#3a5a6a", letterSpacing: "3px", marginBottom: "20px" }}>ENTREZ UNE ACTION, ETF OU INDICE</p>
            <div style={{ display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
              {["LVMH", "Nvidia", "ETF World", "CAC 40", "Technip Energies"].map(s => (
                <button key={s} onClick={() => { setQuery(s); setShowSuggestions(false); setTimeout(() => analyze(s), 0); }}
                  style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)", borderRadius: "4px", padding: "6px 14px", color: "#5a8a7a", fontSize: "11px", fontFamily: "'Courier New', monospace", cursor: "pointer" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#00ff88"; e.currentTarget.style.borderColor = "rgba(0,255,136,0.4)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "#5a8a7a"; e.currentTarget.style.borderColor = "rgba(0,255,136,0.15)"; }}
                >{s}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        input::placeholder { color: #3a5a6a; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #080c10; }
        ::-webkit-scrollbar-thumb { background: rgba(0,255,136,0.2); border-radius: 2px; }
      `}</style>
    </div>
  );
}
