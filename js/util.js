/**
 * Narzędzia ogólne (formatowanie, CSV, DOM).
 * Można zmieniać wygląd formatowanych kwot, ale nie nazw eksportowanych funkcji
 * — korzystają z nich pozostałe skrypty.
 */
/** Górny pułap grupy (domyślna liczba uczestników). Faktyczną liczbę ustawia się w zakładce Decyzje. */
export const N_GROUP = 90;
/** Zapas, gdy model nie podaje fuji_na_osobe. */
export const FUJI_PER = 1500;
export const CHOICE_IDS = ["petla", "noc_2", "sen", "nagasaki", "seul_stawka", "pakiet", "fuji", "sklad", "biuro", "polisa", "rezerwa",
  "hotele_zachod", "posilki", "kadra_lok", "esim", "przewoznik", "nagasaki_miasto"];
/** Organizatorzy (do przypisywania zadań i podpisu zmian). */
export const ORGANIZATORZY = ["Artur", "Jakub Ś.", "Jakub Ż.", "Staszek", "Robert", "Kinga", "Dorota", "Kasia", "Judyta", "Basia"];
export const SHEET_ID = "1HC_9SpfQXe-Xj90Vnl0UiOdK8Q9MFcEFDsibguZDLs8";
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

/** Liczba z arkusza: „4 900,50”, „4,900.50”, „4.900,50”, „712,5”, „12%” → number. */
export function num(v) {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[\s\u00a0zł%]/g, "");
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc >= 0 && ld >= 0) {
    // separator dziesiętny to ten, który jest później
    s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lc >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
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

/** "HH:MM" → minuty od północy. */
export function toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export function fmtH(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
