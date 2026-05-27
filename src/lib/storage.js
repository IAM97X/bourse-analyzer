import { createClient } from "@supabase/supabase-js";

const SB_URL = process.env.REACT_APP_SUPABASE_URL  || "";
const SB_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "";
export const supabase = SB_URL && SB_KEY ? createClient(SB_URL, SB_KEY) : null;

export const SYNC_KEYS = [
  "bourse_portfolio", "bourse_profil", "bourse_dividendes_log",
  "bourse_pea_ouverture", "bourse_cto_ouverture", "bourse_account",
  "bourse_dark", "bourse_compact", "bourse_hidden", "bourse_avatar_emoji",
  "bourse_sidebar_collapsed", "bourse_active_tab",
  "bourse_avis_operes", "bourse_snapshots", "bourse_dividendes",
  "bourse_api_keys", "bourse_impot_sortie", "bourse_local_name",
  "bourse_price_history", "bourse_evolution_csv", "bourse_isin_ticker_cache",
  "bourse_autopilot_result_PEA", "bourse_autopilot_result_CTO",
  "bourse_ai_portfolio",
];

let _syncUserId = null;
const _syncQueue = {};

export function setSyncUserId(id) { _syncUserId = id; }

async function pushToCloud(userId, key, value) {
  if (!supabase || !userId) return;
  try {
    await supabase.from("user_data").upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
  } catch {}
}

function scheduleSync(key, value) {
  if (!_syncUserId || !SYNC_KEYS.includes(key)) return;
  clearTimeout(_syncQueue[key]);
  _syncQueue[key] = setTimeout(() => pushToCloud(_syncUserId, key, value), 1500);
}

export async function pullFromCloud(userId) {
  if (!supabase || !userId) return;
  try {
    const { data } = await supabase
      .from("user_data").select("key, value").eq("user_id", userId);
    if (data) data.forEach(({ key, value }) => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    });
  } catch {}
}

export const load = (key, def) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
  catch { return def; }
};

export const save = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  scheduleSync(key, val);
};
