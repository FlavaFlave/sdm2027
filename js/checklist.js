/**
 * Zakładka „Checklista”.
 * Źródło prawdy: karta Checklista publicznego arkusza (osoba, zrobione, komentarz, data zmiany).
 * Imiona organizatorów są dopuszczalne; danych uczestników tu nie ma.
 */
import { $, $$, escapeHtml, num, todayISO, formatDatePL } from "./util.js";

const STATUS_CLASS = {
  "do zrobienia": "badge-todo",
  "w toku": "badge-progress",
  "zrobione": "badge-done",
  "do uzupełnienia": "badge-fill",
  "nie dotyczy": "badge-na",
};

export const CHECKLIST_OSOBY = ["Artur", "Jakub Ś.", "Jakub Ż.", "Staszek", "Robert", "Kinga", "Dorota", "Kasia", "Judyta", "Basia"];

const SHEET_CHECK_URL = "https://docs.google.com/spreadsheets/d/1pPyeqUDNG9FYh20ugTrgIyqD6E6Mq5GiAqUtoEahHVE/edit#gid=215408221";

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
  const list = cachedItems || [];
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
    const appUrl = (cachedMeta && (cachedMeta.checklistAppUrl || cachedMeta.checklist_app_url)) || "";
    const editApp = appUrl
      ? `<a class="btn btn-gold" href="${escapeHtml(appUrl)}" target="_blank" rel="noopener">Edytuj w panelu checklisty</a>`
      : `<span class="muted">Zapis ze strony będzie możliwy po wdrożeniu skryptu (apps-script/INSTRUKCJA-checklista.md).</span>`;
    toolbar.innerHTML = `
      <a class="btn btn-gold" href="${SHEET_CHECK_URL}" target="_blank" rel="noopener">Edytuj w arkuszu</a>
      ${editApp}
      <p class="muted" style="margin:8px 0 0">Źródło prawdy: karta Checklista w publicznym arkuszu. Zmiany zapisane w arkuszu pojawią się na stronie po publikacji CSV (albo po odświeżeniu, gdy arkusz jest już opublikowany).</p>`;
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
      const komentarz = it.komentarz ? `<p class="note"><strong>Komentarz:</strong> ${escapeHtml(it.komentarz)}</p>` : "";
      const zmieniono = it.zmieniono ? `<p class="changed">Ostatnia zmiana: ${escapeHtml(it.zmieniono)}</p>` : "";
      return `<article class="${cls}">
        <div class="when"><b>${escapeHtml(formatDatePL(it.termin))}</b>${escapeHtml(it.termin_etykieta || "")}</div>
        <div>
          <h4>${escapeHtml(it.zadanie)}</h4>
          <p class="who">Osoba odpowiedzialna: <strong>${escapeHtml(osoba)}</strong>${rola}</p>
          <p class="done-line">${done ? "☑ Zrobione" : "☐ Niezrobione"}</p>
          ${it.uwagi ? `<p class="note">${escapeHtml(it.uwagi)}</p>` : ""}
          ${komentarz}
          ${zmieniono}
          ${agg}
        </div>
        <div class="side">${badge(it, urg)}${soon}</div>
      </article>`;
    }).join("");
    return `<div class="check-group"><h3>${escapeHtml(kat)}</h3>${cards}</div>`;
  }).join("") || `<p class="muted">Brak pozycji w tym filtrze.</p>`;
}
