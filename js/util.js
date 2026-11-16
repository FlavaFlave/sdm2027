/**
 * Narzędzia ogólne (formatowanie, CSV, DOM).
 * Można zmieniać wygląd formatowanych kwot, ale nie nazw eksportowanych funkcji
 * — korzystają z nich pozostałe skrypty.
 */
export const N_GROUP = 90;
export const FUJI_PER = 1000;
export const CHOICE_IDS = ["petla", "noc_2", "sen", "nagasaki", "seul_stawka", "pakiet", "fuji", "sklad", "biuro", "polisa", "rezerwa"];
export const SHEET_ID = "1pPyeqUDNG9FYh20ugTrgIyqD6E6Mq5GiAqUtoEahHVE";
export const TAB_NAMES = ["Dni", "Miejsca", "Transport", "Noclegi", "Decyzje", "Koszty", "Wpłaty", "Checklista"];

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatZl(n, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const sign = v < 0 ? "−" : "";
  return sign + Math.abs(v).toLocaleString("pl-PL", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) + " zł";
}

export function formatZlDelta(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) < 0.005) return "0,00 zł";
  const sign = v > 0 ? "+" : "−";
  return sign + Math.abs(v).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";
}

export function num(v) {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", i = 0, q = false;
  const s = text.replace(/^\uFEFF/, "");
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (c === '"') { q = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ",") { row.push(cell); cell = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += c; i++;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== "")).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] ?? ""; });
    return o;
  });
}

export function todayISO() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function formatDatePL(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const [y, m, d] = iso.split("-");
  return `${parseInt(d, 10)}.${parseInt(m, 10)}.${y}`;
}
