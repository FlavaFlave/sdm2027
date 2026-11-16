/**
 * Zapis do arkusza przez aplikację Apps Script (apps-script/Zapis.gs).
 * Adres: meta.zapisAppUrl w data/data.json. Imię i kod organizatora zostają w tej przeglądarce.
 * Bez adresu zapis trafia tylko do localStorage (widoczny wyłącznie na tym komputerze).
 */
import { $, escapeHtml, ORGANIZATORZY as CHECKLIST_OSOBY } from "./util.js";

const CRED_KEY = "sdm2027-org-cred";
let appUrl = "";

export function setAppUrl(url) { appUrl = String(url || "").trim(); }
export function hasApp() { return !!appUrl; }

export function getCred() {
  try { return JSON.parse(localStorage.getItem(CRED_KEY) || "{}"); } catch (_) { return {}; }
}
function setCred(c) { try { localStorage.setItem(CRED_KEY, JSON.stringify(c)); } catch (_) {} }

/** Okienko: kto zapisuje i kod organizatorów. Zwraca Promise z {autor, kod} albo null. */
export function askCred(force) {
  const c = getCred();
  if (!force && c.autor && (c.kod || !appUrl)) return Promise.resolve(c);
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-back";
    wrap.innerHTML = `<div class="modal small" role="dialog" aria-modal="true" aria-label="Kto zapisuje">
      <h3>Kto zapisuje?</h3>
      <p class="muted">Imię trafi do arkusza przy zmianie (np. „2026-11-16 14:20 · Kinga”). ${appUrl ? "Kod organizatorów ustala właściciel arkusza (instrukcja: apps-script/INSTRUKCJA-zapis.md)." : "Skrypt zapisu nie jest jeszcze podłączony — zmiany zostaną tylko w tej przeglądarce."}</p>
      <label>Imię <select id="cred-autor">${CHECKLIST_OSOBY.map((n) => `<option ${c.autor === n ? "selected" : ""}>${escapeHtml(n)}</option>`).join("")}</select></label>
      ${appUrl ? `<label>Kod organizatorów <input type="password" id="cred-kod" value="${escapeHtml(c.kod || "")}" autocomplete="off" /></label>` : ""}
      <div class="modal-actions"><button type="button" class="btn" data-x="0">Anuluj</button><button type="button" class="btn btn-gold" data-x="1">Zapamiętaj</button></div>
    </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("[data-x]");
      if (!b && e.target !== wrap) return;
      const ok = b && b.dataset.x === "1";
      const out = ok ? { autor: $("#cred-autor", wrap).value, kod: appUrl ? $("#cred-kod", wrap).value.trim() : "" } : null;
      if (out) setCred(out);
      wrap.remove();
      resolve(out);
    });
  });
}

/** Wysyła do Apps Script. text/plain = bez zapytania wstępnego CORS. */
export async function post(action, payload) {
  if (!appUrl) return { ok: false, error: "NO_APP" };
  const cred = await askCred(false);
  if (!cred) return { ok: false, error: "CANCEL" };
  try {
    const r = await fetch(appUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, kod: cred.kod, autor: cred.autor, ...payload }),
    });
    const j = await r.json();
    if (j && j.error === "BAD_CODE") { await askCred(true); }
    return j;
  } catch (e) {
    return { ok: false, error: "NETWORK", message: String(e && e.message || e) };
  }
}

/** Odczyt wszystkich kart arkusza przez Apps Script (arkusz nie musi być publiczny). */
export async function fetchTables(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const kod = getCred().kod || "";
    const r = await fetch(url + (url.includes("?") ? "&" : "?") + "action=tabele" + (kod ? "&kod=" + encodeURIComponent(kod) : ""), { signal: ctrl.signal });
    const j = await r.json();
    return j && j.ok ? j.tabele : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}
