/**
 * Okno szczegółów dnia: sens dnia, program, posiłki, kontrola harmonogramu
 * i obszerny opis każdego miejsca (co to jest, historia, dlaczego tu jesteśmy, co robimy, praktycznie).
 * Teksty: data.json → dni[].sens, miejsca[].szczegoly.
 */
import { $, escapeHtml } from "./util.js";
import { mealsHtml, dayChecksHtml } from "./checks.js";

const SKIP = new Set(["waw", "doha", "narita", "haneda", "gimpo", "kix", "hakata", "mapo"]);
const BLOCKS = [
  ["co", "Co to jest"],
  ["historia", "Historia"],
  ["dlaczego", "Dlaczego tu jesteśmy"],
  ["robimy", "Co robimy"],
  ["praktyczne", "Praktycznie"],
];

let state = { days: [], places: [], checks: null, tile: null };
export function setDetailState(s) { state = { ...state, ...s }; }

function placeSection(p) {
  const sz = p.szczegoly || {};
  const img = p.zdjecie_url
    ? `<figure class="dp-photo"><img src="${escapeHtml(p.zdjecie_url)}" alt="${escapeHtml(p.nazwa)}" loading="lazy" /><figcaption>${escapeHtml(p.zdjecie_zrodlo || "")}</figcaption></figure>`
    : "";
  const blocks = BLOCKS.filter(([k]) => sz[k]).map(([k, label]) =>
    `<div class="dp-block"><h5>${label}</h5><p>${escapeHtml(sz[k])}</p></div>`).join("");
  const fallback = !blocks
    ? `<div class="dp-block"><p>${escapeHtml(p.opis || "")}</p>${p.zwiedzamy ? `<p><strong>Co robimy:</strong> ${escapeHtml(p.zwiedzamy)}</p>` : ""}</div>`
    : "";
  return `<section class="dp-place${img ? "" : " no-photo"}">${img}<div class="dp-text"><h4>${escapeHtml(p.nazwa)}</h4>${blocks}${fallback}</div></section>`;
}

export function openDay(date) {
  const days = state.days || [];
  const i = days.findIndex((d) => d.data === date);
  if (i < 0) return;
  const day = days[i];
  const ids = (day.miejsca || "").split(",").map((s) => s.trim()).filter(Boolean);
  const places = ids.map((id) => (state.places || []).find((p) => p.id === id)).filter(Boolean);
  const main = places.filter((p) => !SKIP.has(p.id) || p.szczegoly);
  const transit = places.filter((p) => SKIP.has(p.id) && !p.szczegoly);
  const tile = state.tile ? state.tile(day) : null;
  const heroPhoto = tile && tile.style ? tile.style : "";
  const prev = days[i - 1], next = days[i + 1];
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal day-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(day.data_pl)}">
    <button type="button" class="modal-close" aria-label="Zamknij">×</button>
    <header class="dm-hero ${tile ? tile.cls.replace("day-photo", "") : ""}" ${heroPhoto}>
      ${tile && tile.inner ? tile.inner : ""}
      <div class="dm-hero-text">
        <p class="dm-date">${escapeHtml(day.data_pl || "")} · ${escapeHtml(day.dzien || "")} · dzień ${i + 1} z ${days.length}</p>
        <h2>${escapeHtml(day.miejsce || "")}</h2>
        ${tile && tile.title ? `<p class="dm-kicker">${escapeHtml(tile.title)}</p>` : ""}
      </div>
    </header>
    <div class="dm-body">
      ${day.sens ? `<p class="dm-sens">${escapeHtml(day.sens)}</p>` : ""}
      <h3>Program dnia</h3>
      <p>${escapeHtml(day.program || "")}</p>
      <div class="dm-meta">${[day.transport, day.km ? `${day.km} km` : "", day.czas_h ? `${day.czas_h} h jazdy` : "", day.nocleg ? `Nocleg: ${day.nocleg}` : ""].filter(Boolean).map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("")}</div>
      ${mealsHtml(day)}
      ${dayChecksHtml(state.checks && state.checks.byDay[day.data])}
      ${day.uwagi ? `<p class="day-notes">${escapeHtml(day.uwagi)}</p>` : ""}
      ${main.length ? `<h3>Miejsca tego dnia</h3>${main.map(placeSection).join("")}` : ""}
      ${transit.length ? `<p class="muted">Przejazdy i lotniska: ${transit.map((p) => escapeHtml(p.nazwa)).join(", ")}.</p>` : ""}
      ${tile && tile.cap ? tile.cap : ""}
    </div>
    <footer class="dm-nav">
      ${prev ? `<button type="button" class="btn" data-go="${escapeHtml(prev.data)}">← ${escapeHtml(prev.data_pl.replace(".2027", ""))} ${escapeHtml(prev.miejsce || "")}</button>` : "<span></span>"}
      ${next ? `<button type="button" class="btn" data-go="${escapeHtml(next.data)}">${escapeHtml(next.data_pl.replace(".2027", ""))} ${escapeHtml(next.miejsce || "")} →</button>` : "<span></span>"}
    </footer>
  </div>`;
  document.querySelectorAll(".modal-back.is-day").forEach((x) => x.remove());
  back.classList.add("is-day");
  document.body.appendChild(back);
  document.body.classList.add("modal-open");
  const close = () => { back.remove(); document.body.classList.remove("modal-open"); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight" && next) openDay(next.data);
    if (e.key === "ArrowLeft" && prev) openDay(prev.data);
  };
  document.addEventListener("keydown", onKey);
  back.addEventListener("click", (e) => {
    if (e.target === back || e.target.closest(".modal-close")) { close(); return; }
    const go = e.target.closest("[data-go]");
    if (go) { document.removeEventListener("keydown", onKey); openDay(go.dataset.go); }
  });
  back.querySelector(".modal").scrollTop = 0;
}

/** Kliknięcie w oś czasu albo kartę dnia otwiera szczegóły. */
export function bindDayClicks() {
  if (document.body.dataset.dayBound) return;
  document.body.dataset.dayBound = "1";
  document.addEventListener("click", (e) => {
    if (e.target.closest("a, button:not([data-open-day]), select, input, textarea, .leaflet-container")) return;
    const el = e.target.closest("#timeline [data-day], .day-card[data-day], [data-open-day]");
    if (!el) return;
    openDay(el.dataset.day || el.dataset.openDay);
  });
}
