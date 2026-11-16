/**
 * Zakładka „Checklista”.
 * Źródło prawdy: karta Checklista publicznego arkusza (osoba, zrobione, komentarz, data zmiany).
 * Imiona organizatorów są dopuszczalne; danych uczestników tu nie ma.
 */
import { $, $$, escapeHtml, num, todayISO, formatDatePL, ORGANIZATORZY } from "./util.js";
import { post, hasApp, askCred, getCred } from "./zapis.js";
import { parseChecklistSheet } from "./cost.js";

const LOCAL_KEY = "sdm2027-org-check-local";
function loadLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); } catch (_) { return {}; } }
function saveLocal(o) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(o)); } catch (_) {} }
function nowStamp() {
  const d = new Date(); const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}
/** Nakłada lokalne (niewysłane) zmiany na dane z arkusza. */
function withLocal(items) {
  if (hasApp()) return items;
  const loc = loadLocal();
  return items.map((it) => {
    const l = loc[it.id];
    if (!l) return it;
    const kom = [it.komentarz, ...(l.komentarze || [])].filter(Boolean).join("\n");
    return { ...it, osoba: l.osoba ?? it.osoba, zrobione: l.zrobione ?? it.zrobione, status: (l.zrobione ?? it.zrobione) ? "zrobione" : (it.status === "zrobione" ? "do zrobienia" : it.status), komentarz: kom, zmieniono: l.zmieniono || it.zmieniono, lokalnie: true };
  });
}

const STATUS_CLASS = {
  "do zrobienia": "badge-todo",
  "w toku": "badge-progress",
  "zrobione": "badge-done",
  "do uzupełnienia": "badge-fill",
  "nie dotyczy": "badge-na",
};

export const CHECKLIST_OSOBY = ORGANIZATORZY;

const SHEET_CHECK_URL = "https://docs.google.com/spreadsheets/d/1ZSGVRJc9BMXGkoJjPAwyjnynXTRn42LsPZhB-l0MGvs/edit#gid=215408221";

function urgency(item, today) {
  const done = item.zrobione || item.status === "zrobione" || item.status === "nie dotyczy";
  if (done || !item.termin) return "";
  if (item.termin < today) return "late";
  const t = new Date(item.termin + "T00:00:00");
  const now = new Date(today + "T00:00:00");
  const days = (t - now) / 86400000;
  if (days <= 21) return "soon";
  return "";
}

function badge(item, urg) {
  if (item.zrobione || item.status === "zrobione") {
    return `<span class="badge badge-done">zrobione</span>`;
  }
  if (urg === "late") return `<span class="badge badge-late">po terminie</span>`;
  const cls = STATUS_CLASS[item.status] || "badge-fill";
  return `<span class="badge ${cls}">${escapeHtml(item.status || "—")}</span>`;
}

function assignee(item) {
  return (item.osoba || "").trim();
}

let currentFilter = "wszystkie";
let currentPerson = "wszyscy";
let cachedItems = [];
let cachedMeta = {};

export function renderChecklist(items, meta) {
  if (items) cachedItems = items;
  if (meta) cachedMeta = meta;
  const list = withLocal(cachedItems || []);
  const today = todayISO();
  const counts = { wszystkie: list.length, "do zrobienia": 0, "w toku": 0, zrobione: 0, "do uzupełnienia": 0, "nie dotyczy": 0, "po terminie": 0 };
  list.forEach((it) => {
    const st = it.zrobione ? "zrobione" : (it.status || "do zrobienia");
    if (counts[st] != null) counts[st] += 1;
    if (urgency(it, today) === "late") counts["po terminie"] += 1;
  });

  const stats = $("#check-stats");
  if (stats) {
    stats.innerHTML = `
      <article class="stat-card is-navy"><p class="lbl">Pozycji</p><p class="val">${counts.wszystkie}</p><p class="sub">zgody, dokumenty, rezerwacje, terminy</p></article>
      <article class="stat-card"><p class="lbl">Do zrobienia</p><p class="val">${counts["do zrobienia"] + counts["w toku"]}</p><p class="sub">w tym ${counts["w toku"]} w toku</p></article>
      <article class="stat-card is-ok"><p class="lbl">Zrobione</p><p class="val">${counts.zrobione}</p><p class="sub">${counts["nie dotyczy"]} nie dotyczy</p></article>
      <article class="stat-card"><p class="lbl">Po terminie</p><p class="val">${counts["po terminie"]}</p><p class="sub">do uzupełnienia: ${counts["do uzupełnienia"]}</p></article>`;
  }

  const toolbar = $("#check-toolbar");
  if (toolbar) {
    const cred = getCred();
    const mode = hasApp()
      ? `<span class="save-mode is-live">Zapis do arkusza włączony</span> Zmiany zapisują się w karcie Checklista i widzą je wszyscy organizatorzy.`
      : `<span class="save-mode is-local">Zapis tylko w tej przeglądarce</span> Skrypt zapisu nie jest jeszcze podłączony (apps-script/INSTRUKCJA-zapis.md, ok. 5 min). Do tego czasu zmiany widzisz tylko Ty, na tym komputerze.`;
    toolbar.innerHTML = `
      <p class="save-line">${mode}</p>
      <div class="toolbar-row">
        <span class="muted">Zapisujesz jako: <strong>${escapeHtml(cred.autor || "— nie wybrano —")}</strong></span>
        <button type="button" class="btn" id="btn-cred">Zmień, kto zapisuje</button>
        <a class="btn" href="${SHEET_CHECK_URL}" target="_blank" rel="noopener">Otwórz kartę Checklista w arkuszu</a>
      </div>`;
    $("#btn-cred", toolbar).onclick = async () => { await askCred(true); renderChecklist(); };
  }

  const filters = $("#check-filters");
  if (filters && !filters.dataset.bound) {
    filters.dataset.bound = "1";
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-filter]");
      if (!btn) return;
      currentFilter = btn.dataset.filter;
      renderChecklist();
    });
  }
  if (filters) {
    const keys = ["wszystkie", "do zrobienia", "w toku", "do uzupełnienia", "zrobione", "po terminie"];
    filters.innerHTML = keys.map((k) =>
      `<button type="button" class="btn ${currentFilter === k ? "is-on" : ""}" data-filter="${k}">${k} (${counts[k] || 0})</button>`
    ).join("");
  }

  const peopleBox = $("#check-person-filters");
  if (peopleBox && !peopleBox.dataset.bound) {
    peopleBox.dataset.bound = "1";
    peopleBox.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-person]");
      if (!btn) return;
      currentPerson = btn.dataset.person;
      renderChecklist();
    });
  }
  if (peopleBox) {
    const countsP = { wszyscy: list.length, nieprzypisane: 0 };
    CHECKLIST_OSOBY.forEach((n) => { countsP[n] = 0; });
    list.forEach((it) => {
      const a = assignee(it);
      if (!a) countsP.nieprzypisane += 1;
      else if (countsP[a] != null) countsP[a] += 1;
    });
    const keys = ["wszyscy", "nieprzypisane", ...CHECKLIST_OSOBY];
    peopleBox.innerHTML = `<span class="filter-label">Osoba:</span>` + keys.map((k) =>
      `<button type="button" class="btn ${currentPerson === k ? "is-on" : ""}" data-person="${escapeHtml(k)}">${escapeHtml(k)} (${countsP[k] || 0})</button>`
    ).join("");
  }

  const vis = list.filter((it) => {
    const st = it.zrobione ? "zrobione" : it.status;
    if (currentFilter === "po terminie") {
      if (urgency(it, today) !== "late") return false;
    } else if (currentFilter !== "wszystkie" && st !== currentFilter) return false;
    const a = assignee(it);
    if (currentPerson === "nieprzypisane" && a) return false;
    if (currentPerson !== "wszyscy" && currentPerson !== "nieprzypisane" && a !== currentPerson) return false;
    return true;
  });

  const aggs = [];
  list.forEach((it) => {
    const req = num(it.wymagane);
    const got = num(it.zebrane);
    if (req == null && got == null) return;
    const label = it.zadanie.split("—")[0].split("(")[0].trim();
    const gotTxt = got == null ? "do uzupełnienia" : String(got);
    const reqTxt = req == null ? "?" : String(req);
    aggs.push(`<span class="agg-pill"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(gotTxt)} / ${escapeHtml(reqTxt)}</span>`);
  });
  const aggBox = $("#check-aggregates");
  if (aggBox) {
    aggBox.innerHTML = aggs.length
      ? `<p class="muted" style="margin:0 0 8px">Zbiorcze stany dokumentów (uzupełniane w arkuszu). Puste „zebrane” = do uzupełnienia, bez nazwisk uczestników.</p>` + aggs.join("")
      : `<p class="muted">Liczby zebranych dokumentów (paszporty, zgody, K-ETA) uzupełnia się w arkuszu — tylko zbiorczo.</p>`;
  }

  const board = $("#check-list-board");
  if (!board) return;
  const groups = [];
  const seen = new Map();
  vis.forEach((it) => {
    if (!seen.has(it.kat)) { seen.set(it.kat, []); groups.push(it.kat); }
    seen.get(it.kat).push(it);
  });
  board.innerHTML = groups.map((kat) => {
    const cards = seen.get(kat).map((it) => {
      const urg = urgency(it, today);
      const done = !!(it.zrobione || it.status === "zrobione");
      const cls = ["check-item", urg === "late" ? "is-late" : urg === "soon" ? "is-soon" : "", done ? "is-done" : ""].filter(Boolean).join(" ");
      const req = num(it.wymagane);
      const got = num(it.zebrane);
      const agg = (req != null || got != null)
        ? `<p class="agg">Zebrane: ${got == null ? "do uzupełnienia" : got}${req != null ? " / " + req : ""}</p>`
        : "";
      const soon = urg === "soon" && !done ? ` <span class="badge badge-soon">zbliża się</span>` : "";
      const osoba = assignee(it) || "nieprzypisane";
      const rola = (it.kto && it.kto !== osoba) ? `<span class="muted"> (w opisie zadania: ${escapeHtml(it.kto)})</span>` : "";
      const komentarz = it.komentarz
        ? `<ul class="comment-log">${String(it.komentarz).split(/\n+/).filter(Boolean).map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`
        : "";
      const zmieniono = it.zmieniono ? `<p class="changed">Ostatnia zmiana: ${escapeHtml(it.zmieniono)}</p>` : "";
      return `<article class="${cls}">
        <div class="when"><b>${escapeHtml(formatDatePL(it.termin))}</b>${escapeHtml(it.termin_etykieta || "")}</div>
        <div>
          <h4>${escapeHtml(it.zadanie)}</h4>
          ${it.uwagi ? `<p class="note">${escapeHtml(it.uwagi)}</p>` : ""}
          ${agg}
          <div class="check-edit" data-id="${escapeHtml(it.id)}">
            <label>Kto robi
              <select data-f="osoba"><option value="">— nieprzypisane —</option>${ORGANIZATORZY.map((n) => `<option ${assignee(it) === n ? "selected" : ""}>${escapeHtml(n)}</option>`).join("")}</select>
            </label>
            <label class="chk"><input type="checkbox" data-f="zrobione" ${done ? "checked" : ""} /> Zrobione</label>
            ${rola}
          </div>
          ${komentarz}
          <div class="check-comment" data-id="${escapeHtml(it.id)}">
            <textarea data-f="komentarz" rows="2" placeholder="Komentarz: polecenie dla osoby, która to robi, albo wnioski i decyzje po wykonaniu"></textarea>
            <button type="button" class="btn btn-gold" data-save="${escapeHtml(it.id)}">Zapisz</button>
          </div>
          ${zmieniono}${it.lokalnie ? `<p class="changed">Zmiana zapisana tylko w tej przeglądarce.</p>` : ""}
        </div>
        <div class="side">${badge(it, urg)}${soon}</div>
      </article>`;
    }).join("");
    return `<div class="check-group"><h3>${escapeHtml(kat)}</h3>${cards}</div>`;
  }).join("") || `<p class="muted">Brak pozycji w tym filtrze.</p>`;
  if (!board.dataset.bound) {
    board.dataset.bound = "1";
    board.addEventListener("change", (e) => {
      const box = e.target.closest(".check-edit");
      if (!box) return;
      const f = e.target.dataset.f;
      saveItem(box.dataset.id, f === "osoba" ? { osoba: e.target.value } : { zrobione: e.target.checked });
    });
    board.addEventListener("click", (e) => {
      const b = e.target.closest("[data-save]");
      if (!b) return;
      const ta = b.parentElement.querySelector("textarea");
      const txt = (ta.value || "").trim();
      if (!txt) { ta.focus(); return; }
      saveItem(b.dataset.save, { komentarz: txt });
    });
  }
}

async function saveItem(id, patch) {
  const cred = await askCred(false);
  if (!cred) { renderChecklist(); return; }
  if (hasApp()) {
    const res = await post("checklista", { id, ...patch });
    if (res && res.ok && res.tabele && res.tabele.Checklista) {
      const rows = res.tabele.Checklista.map((r) => r.map((c) => String(c)));
      cachedItems = parseChecklistSheet(rows);
    } else {
      alert("Nie udało się zapisać w arkuszu: " + ((res && (res.message || res.error)) || "błąd") + ". Spróbuj ponownie.");
    }
  } else {
    const loc = loadLocal();
    const l = loc[id] || {};
    if (patch.osoba !== undefined) l.osoba = patch.osoba;
    if (patch.zrobione !== undefined) l.zrobione = patch.zrobione;
    if (patch.komentarz) (l.komentarze = l.komentarze || []).push(`${nowStamp()} · ${cred.autor}: ${patch.komentarz}`);
    l.zmieniono = `${nowStamp()} (${cred.autor})`;
    loc[id] = l;
    saveLocal(loc);
  }
  renderChecklist();
}
