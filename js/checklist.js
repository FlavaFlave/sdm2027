/**
 * Zakładka „Checklista”.
 * Źródło: data.checklista albo karta Checklista arkusza.
 * Status, osoba (rola) i termin są widoczne; liczby tylko zbiorczo.
 */
import { $, $$, escapeHtml, num, todayISO, formatDatePL } from "./util.js";

const STATUS_CLASS = {
  "do zrobienia": "badge-todo",
  "w toku": "badge-progress",
  "zrobione": "badge-done",
  "do uzupełnienia": "badge-fill",
  "nie dotyczy": "badge-na",
};

function urgency(item, today) {
  const done = item.status === "zrobione" || item.status === "nie dotyczy";
  if (done || !item.termin) return "";
  if (item.termin < today) return "late";
  // w ciągu 21 dni
  const t = new Date(item.termin + "T00:00:00");
  const now = new Date(today + "T00:00:00");
  const days = (t - now) / 86400000;
  if (days <= 21) return "soon";
  return "";
}

function badge(item, urg) {
  if (urg === "late" && item.status !== "zrobione") {
    return `<span class="badge badge-late">po terminie</span>`;
  }
  const cls = STATUS_CLASS[item.status] || "badge-fill";
  return `<span class="badge ${cls}">${escapeHtml(item.status || "—")}</span>`;
}

let currentFilter = "wszystkie";

export function renderChecklist(items) {
  const list = items || [];
  const today = todayISO();
  const counts = { wszystkie: list.length, "do zrobienia": 0, "w toku": 0, zrobione: 0, "do uzupełnienia": 0, "nie dotyczy": 0, "po terminie": 0 };
  list.forEach((it) => {
    if (counts[it.status] != null) counts[it.status] += 1;
    if (urgency(it, today) === "late") counts["po terminie"] += 1;
  });

  const stats = $("#check-stats");
  if (stats) {
    stats.innerHTML = `
      <article class="stat-card is-navy"><p class="lbl">Pozycji</p><p class="val">${counts.wszystkie}</p><p class="sub">zgody, dokumenty, rezerwacje, terminy</p></article>
      <article class="stat-card"><p class="lbl">Do zrobienia</p><p class="val">${counts["do zrobienia"] + counts["w toku"]}</p><p class="sub">w tym ${counts["w toku"]} w toku</p></article>
      <article class="stat-card is-ok"><p class="lbl">Zrobione</p><p class="val">${counts.zrobione}</p><p class="sub">${counts["nie dotyczy"]} nie dotyczy</p></article>
      <article class="stat-card ${counts["po terminie"] ? "" : ""}"><p class="lbl">Po terminie</p><p class="val">${counts["po terminie"]}</p><p class="sub">do uzupełnienia: ${counts["do uzupełnienia"]}</p></article>`;
  }

  const filters = $("#check-filters");
  if (filters && !filters.dataset.bound) {
    filters.dataset.bound = "1";
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-filter]");
      if (!btn) return;
      currentFilter = btn.dataset.filter;
      renderChecklist(list);
    });
  }
  if (filters) {
    const keys = ["wszystkie", "do zrobienia", "w toku", "do uzupełnienia", "zrobione", "po terminie"];
    filters.innerHTML = keys.map((k) =>
      `<button type="button" class="btn ${currentFilter === k ? "is-on" : ""}" data-filter="${k}">${k} (${counts[k] || 0})</button>`
    ).join("");
  }

  const vis = list.filter((it) => {
    if (currentFilter === "wszystkie") return true;
    if (currentFilter === "po terminie") return urgency(it, today) === "late";
    return it.status === currentFilter;
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
      ? `<p class="muted" style="margin:0 0 8px">Zbiorcze stany dokumentów (uzupełniane w arkuszu). Puste „zebrane” = do uzupełnienia.</p>` + aggs.join("")
      : `<p class="muted">Liczby zebranych dokumentów (paszporty, zgody, K-ETA, ankiety) uzupełnia się w karcie Checklista arkusza — tylko zbiorczo, bez nazwisk.</p>`;
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
      const cls = ["check-item", urg === "late" ? "is-late" : urg === "soon" ? "is-soon" : "", it.status === "zrobione" ? "is-done" : ""].filter(Boolean).join(" ");
      const req = num(it.wymagane);
      const got = num(it.zebrane);
      const agg = (req != null || got != null)
        ? `<p class="agg">Zebrane: ${got == null ? "do uzupełnienia" : got}${req != null ? " / " + req : ""}</p>`
        : "";
      const soon = urg === "soon" ? ` <span class="badge badge-soon">zbliża się</span>` : "";
      return `<article class="${cls}">
        <div class="when"><b>${escapeHtml(formatDatePL(it.termin))}</b>${escapeHtml(it.termin_etykieta || "")}</div>
        <div>
          <h4>${escapeHtml(it.zadanie)}</h4>
          <p class="who">Odpowiedzialny: ${escapeHtml(it.kto || "—")}</p>
          ${it.uwagi ? `<p class="note">${escapeHtml(it.uwagi)}</p>` : ""}
          ${agg}
        </div>
        <div class="side">${badge(it, urg)}${soon}</div>
      </article>`;
    }).join("");
    return `<div class="check-group"><h3>${escapeHtml(kat)}</h3>${cards}</div>`;
  }).join("") || `<p class="muted">Brak pozycji w tym filtrze.</p>`;
}
