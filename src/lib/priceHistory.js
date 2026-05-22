import { load, save } from "./storage";

const KEY = "bourse_price_history";
const MAX = 30;

export function savePricePoint(posId, cours) {
  if (!posId || !cours || cours <= 0) return;
  const all = load(KEY, {});
  const hist = all[posId] || [];
  if (hist.length && hist[hist.length - 1] === cours) return;
  all[posId] = [...hist, cours].slice(-MAX);
  save(KEY, all);
}

export function loadPriceHistory(posId) {
  return (load(KEY, {}))[posId] || [];
}
