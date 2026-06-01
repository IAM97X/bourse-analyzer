export const delay = (ms) => new Promise(r => setTimeout(r, ms));

const PROXIES = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];
export async function fetchWithProxy(url, opts = {}) {
  // Proxy Vercel en prod ET en dev (vercel dev ou localhost avec /api disponible)
  if (url.includes("yahoo.com")) {
    try {
      const proxyUrl = `/api/yahoo-proxy?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000), ...opts });
      // 404 = route absente en dev → on passe aux proxies publics
      if (res.status !== 404 && (res.ok || res.status < 500)) return res;
    } catch {}
  }
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(10000), ...opts });
      if (res.ok || res.status < 500) return res;
    } catch {}
  }
  throw new Error("Données de marché indisponibles");
}

export const CLAUDE_MODELS = {
  fast:     "claude-haiku-4-5-20251001",
  standard: "claude-sonnet-4-6",
};

const _ENV = {
  anthropic:    process.env.REACT_APP_ANTHROPIC_API_KEY    || "",
  google:       process.env.REACT_APP_GOOGLE_API_KEY       || "",
  cx:           process.env.REACT_APP_GOOGLE_CX            || "",
  alphavantage: process.env.REACT_APP_ALPHAVANTAGE_KEY     || "",
  fmp:          process.env.REACT_APP_FMP_KEY              || "",
};

export const getKey = (name) => {
  try {
    if (localStorage.getItem("bourse_demo_mode") === "1") return _ENV[name] || "";
    const k = JSON.parse(localStorage.getItem("bourse_api_keys") || "{}"); return k[name] || _ENV[name] || "";
  }
  catch { return _ENV[name] || ""; }
};

export const ANTHROPIC_API_KEY = { toString() { return getKey("anthropic"); } };
export const GOOGLE_API_KEY    = { toString() { return getKey("google"); } };
export const GOOGLE_CX         = { toString() { return getKey("cx"); } };
export const ALPHAVANTAGE_KEY  = { toString() { return getKey("alphavantage"); } };
export const FMP_KEY           = { toString() { return getKey("fmp"); } };
export const hasFMPKey         = () => !!getKey("fmp");
export const hasClaudeKey = () => !!getKey("anthropic");
// IA disponible = clé Claude OU proxy Gemini serveur (production)
export const hasAI = () => hasClaudeKey() || process.env.NODE_ENV === "production";

export const CLAUDE_ENDPOINT = process.env.NODE_ENV === "production"
  ? "/api/claude"
  : "https://api.anthropic.com/v1/messages";

export const GEMINI_ENDPOINT = "/api/gemini";

// Retourne l'endpoint et les headers à utiliser selon la clé dispo
function resolveAIEndpoint(maxTokens = 1500, system = "", messages = []) {
  if (hasClaudeKey()) {
    return {
      endpoint: CLAUDE_ENDPOINT,
      headers: { "Content-Type": "application/json", "x-api-key": `${ANTHROPIC_API_KEY}`, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      buildBody: (model, mt) => ({ model, max_tokens: mt, system, messages }),
      parseText: (data) => (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n"),
    };
  }
  const geminiKey = getKey("gemini") || undefined;
  return {
    endpoint: GEMINI_ENDPOINT,
    headers: { "Content-Type": "application/json" },
    buildBody: (_, mt) => ({ system, messages, max_tokens: mt, ...(geminiKey ? { gemini_key: geminiKey } : {}) }),
    parseText: (data) => (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n"),
  };
}

let _apiQueue = Promise.resolve();
export function enqueueApi(fn) {
  _apiQueue = _apiQueue.then(fn, fn);
  return _apiQueue;
}

export async function callGoogleSearch(query, nbResults = 5) {
  let url, res, data;
  try {
    if (process.env.NODE_ENV === "production") {
      url = `/api/google-search?q=${encodeURIComponent(query)}&num=${nbResults}`;
    } else {
      const k = getKey("google"), c = getKey("cx");
      if (!k || !c) return `Aucun résultat Google pour : ${query}`;
      url = `https://www.googleapis.com/customsearch/v1?key=${k}&cx=${c}&q=${encodeURIComponent(query)}&num=${nbResults}&lr=lang_fr`;
    }
    res  = await fetch(url);
    data = await res.json();
  } catch (netErr) {
    throw new Error(`Réseau Google Search : ${netErr.message}`);
  }
  if (data.error) throw new Error(data.error.message || "Erreur Google Search");
  const items = data.items || [];
  if (!items.length) return `Aucun résultat Google pour : ${query}`;
  return items.map((it, i) =>
    `[${i + 1}] ${it.title}\n${it.link}\n${it.snippet || ""}`
  ).join("\n\n");
}

export async function callClaude(system, userMessage, useSearch = false, _retries = 4, skipChaining = false, maxTokens = null, model = null) {
  // Web search uniquement disponible avec Claude + clé Google
  if (useSearch && hasClaudeKey() && getKey("google") && getKey("cx") && !skipChaining) {
    return callClaudeChained(system, userMessage);
  }
  const mt = maxTokens || (useSearch ? 4000 : 1500);
  const messages = [{ role: "user", content: userMessage }];
  const { endpoint, headers, buildBody, parseText } = resolveAIEndpoint(mt, system, messages);
  const bodyObj = buildBody(model || CLAUDE_MODELS.standard, mt);
  if (useSearch && hasClaudeKey()) {
    bodyObj.tools = [{ type: "web_search_20250305", name: "web_search" }];
    headers["anthropic-beta"] = "web-search-2025-03-05";
  }
  for (let attempt = 0; attempt < _retries; attempt++) {
    let res, data;
    try {
      res  = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(bodyObj) });
      data = await res.json();
    } catch (networkErr) {
      if (attempt < _retries - 1) { await delay(2000 * (attempt + 1)); continue; }
      throw new Error(`Erreur réseau : ${networkErr.message}`);
    }
    if (res.status === 429) {
      if (attempt < _retries - 1) { await delay(8000 * (attempt + 1)); continue; }
      throw new Error(`Limite de taux. Réessayez dans 1 minute.`);
    }
    if (res.status === 500 || res.status === 529) {
      if (attempt < _retries - 1) { await delay(5000 * (attempt + 1)); continue; }
      const err = new Error("Service temporairement indisponible — Réessayez dans quelques instants.");
      err.retryable = true; throw err;
    }
    if (res.status === 402) throw new Error(`Crédit insuffisant. Vérifiez votre facturation.`);
    if (res.status === 401) throw new Error(`Clé API invalide. Vérifiez vos paramètres.`);
    if (data.error) throw new Error(`[${res.status}] ${data.error.message || data.error}`);
    const text = parseText(data);
    // Si web search native et pas de texte (stop_reason: tool_use), on laisse retry
    if (!text && useSearch && !getKey("google") && attempt < _retries - 1) { await delay(2000); continue; }
    if (!text) throw new Error("Réponse vide.");
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
    if (s === -1 || e === -1) throw new Error("JSON introuvable dans la réponse.");
    const jsonStr = clean.substring(s, e + 1);
    try {
      return JSON.parse(jsonStr);
    } catch {
      let repaired = jsonStr.replace(/,\s*([\]}])/g, "$1").replace(/[\x00-\x1F\x7F]/g, " ");
      try { return JSON.parse(repaired); } catch {
        const lastComma = repaired.lastIndexOf(",");
        if (lastComma > 0) {
          try { return JSON.parse(repaired.substring(0, lastComma) + "]}"); } catch {}
        }
        throw new Error(`JSON Parse error: ${text.slice(0, 200)}`);
      }
    }
  }
  throw new Error("Nombre de tentatives maximum atteint.");
}

export async function callClaudeHaiku(system, userMessage) {
  const messages = [{ role: "user", content: userMessage }];
  const { endpoint, headers, buildBody, parseText } = resolveAIEndpoint(2000, system, messages);
  const bodyObj = buildBody(CLAUDE_MODELS.fast, 2000);
  for (let attempt = 0; attempt < 3; attempt++) {
    let res, data;
    try {
      res  = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(bodyObj) });
      data = await res.json();
    } catch (networkErr) {
      if (attempt < 2) { await delay(3000); continue; }
      throw new Error(`Erreur réseau : ${networkErr.message}`);
    }
    if (res.status === 429) { if (attempt < 2) { await delay(10000 * (attempt + 1)); continue; } throw new Error(`Limite de taux.`); }
    if (res.status === 500 || res.status === 529) { if (attempt < 2) { await delay(5000 * (attempt + 1)); continue; } throw new Error("Service indisponible."); }
    if (data.error) throw new Error(`[${res.status}] ${data.error.message || data.error}`);
    const text = parseText(data);
    if (!text) throw new Error("Réponse vide.");
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
    if (s === -1 || e === -1) throw new Error("JSON introuvable.");
    return JSON.parse(clean.substring(s, e + 1));
  }
  throw new Error("Nombre de tentatives maximum atteint.");
}

export async function callClaudeConversation(system, messages, _retries = 3) {
  const { endpoint, headers, buildBody, parseText } = resolveAIEndpoint(1500, system, messages);
  const bodyObj = buildBody(CLAUDE_MODELS.fast, 1500);
  for (let attempt = 0; attempt < _retries; attempt++) {
    let res, data;
    try {
      res  = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(bodyObj) });
      data = await res.json();
    } catch (networkErr) {
      if (attempt < _retries - 1) { await delay(2000 * (attempt + 1)); continue; }
      throw new Error(`Erreur réseau : ${networkErr.message}`);
    }
    if (res.status === 429) { if (attempt < _retries - 1) { await delay(8000 * (attempt + 1)); continue; } throw new Error(`Limite de taux.`); }
    if (res.status === 500 || res.status === 529) { if (attempt < _retries - 1) { await delay(5000 * (attempt + 1)); continue; } throw new Error("Service indisponible."); }
    if (data.error) throw new Error(`[${res.status}] ${data.error.message || data.error}`);
    const text = parseText(data);
    if (!text) throw new Error("Réponse vide.");
    return text.trim();
  }
  throw new Error("Nombre de tentatives maximum atteint.");
}

export async function callClaudeChained(system, userMessage) {
  const [coursData, analyseData] = await Promise.all([
    callGoogleSearch(`${userMessage} cours bourse`, 5).catch(() => ""),
    callGoogleSearch(`${userMessage} analyse recommandation`, 5).catch(() => ""),
  ]);
  const rawData = [
    coursData   && `=== COURS & ACTUALITÉS ===\n${coursData}`,
    analyseData && `=== ANALYSES & RECOMMANDATIONS ===\n${analyseData}`,
  ].filter(Boolean).join("\n\n") || "Aucune donnée collectée.";

  const structuredMsg = `Voici les résultats de recherche collectés via Google :

${rawData}

En te basant sur ces données, génère le JSON demandé. FORMAT PRIX : point décimal (ex: "32.140"). JSON valide sans markdown.`;
  const bodyObj = {
    model: CLAUDE_MODELS.standard,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: structuredMsg }]
  };
  const res  = await fetch(CLAUDE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify(bodyObj) });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("JSON introuvable.");
  return JSON.parse(clean.substring(s, e + 1));
}
