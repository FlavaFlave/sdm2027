/**
 * Zakładka „Kościoły i noclegi” + warstwy na mapach strony organizatorów.
 * Dane publiczne instytucji: data/kontakty.json (z Excelów Groka, XI 2026).
 * Nasze statusy rozmów: karta „Kontakty” w prywatnym arkuszu zbiórki (albo w tej przeglądarce do czasu wdrożenia skryptu).
 */
import { $, escapeHtml } from "./util.js";
import { zbRow, zbSave, zbReady, onZbRender, modal, field } from "./zbiorka.js";

const STATUS = ["do kontaktu", "napisane", "odpowiedź", "zgoda", "odmowa", "zarezerwowane"];
const STATUS_COLOR = { "do kontaktu": "#8a94a6", napisane: "#c6a15b", "odpowiedź": "#5d6d88", zgoda: "#2f7d4f", odmowa: "#a3303a", zarezerwowane: "#1f4e79" };
let data = null;
let lastChoices = {};
const layers = {};

export async function loadKontakty() {
  if (data) return data;
  try { data = await (await fetch("./data/kontakty.json", { cache: "no-cache" })).json(); } catch (_) { data = { koscioly: [], noclegi: [], biskupi: [] }; }
  return data;
}
const pathOk = (s, choices) => s === "obie" || s === (choices.petla === "B" ? "B" : "A");
function status(id) { const r = zbRow("Kontakty", id); return (r && r.Status) || "do kontaktu"; }
function note(id) { const r = zbRow("Kontakty", id); return r ? [r.Kto, r.Notatka].filter(Boolean).join(" · ") : ""; }
const tel = (t) => t ? `<a href="tel:${escapeHtml(t.split(/[;(]/)[0].replace(/[^\d+]/g, ""))}">${escapeHtml(t)}</a>` : "";
const mail = (m) => m && m.includes("@") ? `<a href="mailto:${escapeHtml(m.match(/[\w.+-]+@[\w.-]+/)[0])}">${escapeHtml(m)}</a>` : escapeHtml(m || "");
const www = (u) => u && /^https?:/.test(u) ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">strona</a>` : "";
const chip = (st) => `<span class="chip" style="background:${STATUS_COLOR[st] || "#8a94a6"};color:#fff">${escapeHtml(st)}</span>`;

function churchHtml(k, choices) {
  const stops = k.przystanki.filter((s) => pathOk(s.sciezka, choices));
  return `<div class="zb-pop"><strong>✝ ${escapeHtml(k.nazwa)}</strong><br><span class="muted small">${escapeHtml(k.diecezja)}</span>
    <p class="small">${stops.map((s) => `${escapeHtml(s.dzien)} · ${escapeHtml(s.punkt)}${s.rola === "nocleg" ? " (wieczorna Msza)" : ""}${s.odl != null ? ` · ${s.odl} km` : ""}`).join("<br>")}</p>
    ${k.proboszcz ? `<p class="small">Proboszcz: ${escapeHtml(k.proboszcz)}</p>` : ""}
    <p class="small">${[tel(k.tel), mail(k.email), www(k.www)].filter(Boolean).join(" · ") || "brak kontaktu w źródle"}</p>
    ${k.msze ? `<p class="small">Msze: ${escapeHtml(k.msze.slice(0, 220))}</p>` : ""}
    <p class="small">${chip(status(k.id))} ${escapeHtml(note(k.id))}</p>
    <p class="zb-actions"><button type="button" class="btn" data-kst="${escapeHtml(k.id)}" data-kind="kościół">Status / notatka</button></p></div>`;
}
function lodgingHtml(n) {
  return `<div class="zb-pop"><strong>🛏 ${escapeHtml(n.nazwa)}</strong>${n.w_planie ? ` <span class="chip" style="background:#1f4e79;color:#fff">w planie</span>` : ""}<br>
    <span class="muted small">${escapeHtml(n.kategoria)} · ${escapeHtml(n.noce)}</span>
    <p class="small">${n.cena ? `<b>Cena:</b> ${escapeHtml(n.cena.slice(0, 160))}<br>` : ""}${n.pojemnosc ? `<b>Miejsca:</b> ${escapeHtml(n.pojemnosc.slice(0, 120))}<br>` : ""}${n.parking ? `<b>Parking dla autokarów:</b> ${escapeHtml(n.parking)}<br>` : ""}${n.jedzenie ? `<b>Wyżywienie:</b> ${escapeHtml(n.jedzenie.slice(0, 120))}` : ""}</p>
    <p class="small">${[tel(n.tel), mail(n.email), www(n.www)].filter(Boolean).join(" · ")}</p>
    ${n.uwagi ? `<p class="small">${escapeHtml(n.uwagi.slice(0, 260))}</p>` : ""}
    <p class="small">${chip(status(n.id))} ${escapeHtml(note(n.id))}</p>
    <p class="zb-actions"><button type="button" class="btn" data-kst="${escapeHtml(n.id)}" data-kind="nocleg">Status / notatka</button></p></div>`;
}

/** Warstwy „Kościoły” i „Noclegi grupowe” na mapach organizatorów (przełącznik w prawym górnym rogu mapy). */
export function drawContactLayers(maps, choices) {
  lastChoices = choices || {};
  if (!data || typeof L === "undefined") return;
  Object.entries(maps).forEach(([elId, map]) => {
    if (!map) return;
    const kr = elId === "map-kr", jp = elId === "map-jp";
    if (layers[elId]) { layers[elId].forEach((l) => map.removeLayer(l)); if (layers[elId].ctrl) map.removeControl(layers[elId].ctrl); }
    const kos = L.layerGroup(), noc = L.layerGroup();
    data.koscioly.filter((k) => Number.isFinite(k.lat) && k.przystanki.some((s) => pathOk(s.sciezka, lastChoices)) && (!kr || k.kraj === "Korea") && (!jp || k.kraj === "Japonia"))
      .forEach((k) => {
        const st = status(k.id);
        L.marker([k.lat, k.lng], { icon: L.divIcon({ className: "pin2", html: `<span class="kt-pin" style="border-color:${STATUS_COLOR[st]}">✝</span>`, iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: -200 })
          .bindTooltip(escapeHtml(k.nazwa.split(" / ")[0])).bindPopup(() => churchHtml(k, lastChoices), { maxWidth: 320 }).addTo(kos);
      });
    data.noclegi.filter((n) => Number.isFinite(n.lat) && pathOk(n.sciezka.split(" ")[0], lastChoices) && (!kr || n.kraj === "Korea") && (!jp || n.kraj === "Japonia"))
      .forEach((n) => {
        L.marker([n.lat, n.lng], { icon: L.divIcon({ className: "pin2", html: `<span class="kt-bed${n.w_planie ? " on" : ""}">🛏</span>`, iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: n.w_planie ? 0 : -300 })
          .bindTooltip(escapeHtml(n.nazwa.split(" / ")[0]) + (n.w_planie ? " (w planie)" : "")).bindPopup(() => lodgingHtml(n), { maxWidth: 320 }).addTo(noc);
      });
    kos.addTo(map); noc.addTo(map);
    const ctrl = L.control.layers(null, { "✝ Kościoły (Msze, kontakty)": kos, "🛏 Noclegi grupowe": noc }, { collapsed: true, position: "topright" }).addTo(map);
    layers[elId] = [kos, noc]; layers[elId].ctrl = ctrl;
    if (!map._ktBound) {
      map._ktBound = true;
      map.getContainer().addEventListener("click", (e) => { const b = e.target.closest("[data-kst]"); if (b) { map.closePopup(); editStatus(b.dataset.kst, b.dataset.kind); } });
    }
  });
}

function findAny(id) {
  return data.koscioly.find((k) => k.id === id) || data.noclegi.find((n) => n.id === id) || data.biskupi.find((b) => b.id === id);
}
function editStatus(id, kind) {
  const it = findAny(id); if (!it) return;
  const r = zbRow("Kontakty", id) || {};
  modal(`${kind === "biskup" ? "Biskup" : kind === "nocleg" ? "Nocleg" : "Kościół"}: ${(it.nazwa || it.diecezja || "").split(" / ")[0]}`, [
    field({ k: "Status", type: "select", opts: STATUS }, r.Status || "do kontaktu"),
    field({ k: "Kto", label: "Kto prowadzi kontakt" }, r.Kto),
    field({ k: "Notatka", type: "textarea", wide: true, rows: 4, hint: "np. odpowiedź, godzina Mszy, pojemność, cena, warunki" }, r.Notatka),
  ].join(""), {
    onSave: async (f) => { const ok = await zbSave("Kontakty", { ...r, ...f, ID: id, Rodzaj: kind, Nazwa: (it.nazwa || it.diecezja || "").split(" / ")[0] }); renderKontakty(lastChoices); return ok; },
  });
}

/* ---------- zakładka ---------- */
function stopKey(s) { return `${s.dzien}|${s.punkt}`; }
export function renderKontakty(choices) {
  lastChoices = choices || lastChoices;
  const root = $("#kontakty-app");
  if (!root || !data) return;
  const path = lastChoices.petla === "B" ? "B" : "A";
  // przystanki: z kościołów (Japonia + Korea) i noclegów
  const stops = new Map();
  data.koscioly.forEach((k) => k.przystanki.filter((s) => pathOk(s.sciezka, lastChoices)).forEach((s) => {
    const key = stopKey(s);
    if (!stops.has(key)) stops.set(key, { dzien: s.dzien, punkt: s.punkt, rola: s.rola, kraj: k.kraj, kos: [], noc: [] });
    stops.get(key).kos.push({ k, s });
  }));
  const nocBy = {};
  data.noclegi.filter((n) => pathOk(n.sciezka.split(" ")[0], lastChoices)).forEach((n) => { (nocBy[n.noce] = nocBy[n.noce] || []).push(n); });
  const order = (d) => { const m = String(d).match(/(\d{1,2})[.–-]/); return m ? Number(m[1]) + (String(d).includes("ŚDM") ? 5 : 0) : 99; };
  const list = [...stops.values()].sort((a, b) => order(a.dzien) - order(b.dzien));
  const ready = zbReady();
  root.innerHTML = `
    <p class="muted">Ścieżka <strong>${path}</strong> (zmienia się w zakładce Decyzje). ${data.meta ? escapeHtml(data.meta.zrodlo) : ""}. Statusy i notatki ${ready ? "zapisują się razem z danymi zbiórki" : "zapiszą się po otwarciu zakładki Śpiew albo Zbiórka"}.</p>
    <p class="muted small">Na mapach w zakładkach Przegląd, Japonia i Korea są warstwy „✝ Kościoły” i „🛏 Noclegi grupowe” (przełącznik w prawym górnym rogu mapy).</p>
    <h3>Kościoły na trasie — gdzie odprawić Eucharystię</h3>
    <div class="table-scroll"><table class="sheet-table zb-table kt-table">
      <thead><tr><th>Dzień</th><th>Punkt</th><th>Kościół</th><th>Kontakt</th><th>Msze</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map((st) => st.kos.sort((a, b) => (a.s.odl ?? 99) - (b.s.odl ?? 99)).map(({ k, s }, i) => `<tr class="${i === 0 ? "kt-first" : ""}">
        <td>${i === 0 ? `<strong>${escapeHtml(st.dzien)}</strong>` : ""}</td>
        <td>${i === 0 ? `${escapeHtml(st.punkt)}${st.rola === "nocleg" ? `<br><span class="chip">wieczorna Msza</span>` : ""}` : ""}</td>
        <td><strong>${escapeHtml(k.nazwa.split(" / ")[0])}</strong><br><span class="muted small">${escapeHtml(k.nazwa.split(" / ").slice(1).join(" / "))}${s.odl != null ? ` · ${s.odl} km` : ""}</span>${k.proboszcz ? `<br><span class="small">${escapeHtml(k.proboszcz)}</span>` : ""}</td>
        <td class="small">${[tel(k.tel), mail(k.email), www(k.www)].filter(Boolean).join("<br>")}</td>
        <td class="small kt-msze">${escapeHtml((k.msze || "").slice(0, 160))}</td>
        <td>${chip(status(k.id))}<br><span class="small">${escapeHtml(note(k.id))}</span></td>
        <td><button type="button" class="btn-link" data-kst="${escapeHtml(k.id)}" data-kind="kościół">zmień</button></td></tr>`).join("")).join("")}</tbody>
    </table></div>

    <h3>Noclegi grupowe — opcje</h3>
    <p class="muted">„W planie” = obiekt przyjęty w kosztorysie (27.11.2026). Ośrodki publiczne: przed rezerwacją zapytać o modlitwę grupową, program zajęć i dni zamknięcia.</p>
    <div class="table-scroll"><table class="sheet-table zb-table kt-table">
      <thead><tr><th>Noce</th><th>Obiekt</th><th>Cena / os. / noc</th><th>Miejsca, parking</th><th>Kontakt</th><th>Status</th><th></th></tr></thead>
      <tbody>${Object.entries(nocBy).sort((a, b) => order(a[0]) - order(b[0])).map(([noce, arr]) => arr.sort((a, b) => b.w_planie - a.w_planie).map((n, i) => `<tr class="${i === 0 ? "kt-first" : ""}${n.w_planie ? " kt-plan" : ""}">
        <td>${i === 0 ? `<strong>${escapeHtml(noce)}</strong>` : ""}</td>
        <td><strong>${escapeHtml(n.nazwa.split(" / ")[0])}</strong>${n.w_planie ? ` <span class="chip" style="background:#1f4e79;color:#fff">w planie</span>` : ""}<br><span class="muted small">${escapeHtml(n.kategoria)} · ${escapeHtml(n.punkt)}${n.odl != null ? ` · ${n.odl} km` : ""}</span></td>
        <td class="small">${escapeHtml((n.cena || "").slice(0, 140))}</td>
        <td class="small">${escapeHtml((n.pojemnosc || "").slice(0, 80))}${n.parking ? `<br>parking: ${escapeHtml(n.parking)}` : ""}</td>
        <td class="small">${[tel(n.tel), mail(n.email), www(n.www)].filter(Boolean).join("<br>")}</td>
        <td>${chip(status(n.id))}<br><span class="small">${escapeHtml(note(n.id))}</span></td>
        <td><button type="button" class="btn-link" data-kst="${escapeHtml(n.id)}" data-kind="nocleg">zmień</button></td></tr>`).join("")).join("")}</tbody>
    </table></div>

    <h3>Biskupi miejsca</h3>
    <p class="muted">Najpierw rozmowa z katechistami Drogi w Japonii (jak i przez kogo pytać o ewangelizację), dopiero potem listy do biskupów.</p>
    <div class="table-scroll"><table class="sheet-table zb-table kt-table">
      <thead><tr><th>Diecezja</th><th>Biskup</th><th>Kuria</th><th>Uwagi</th><th>Status</th><th></th></tr></thead>
      <tbody>${data.biskupi.map((b) => `<tr>
        <td><strong>${escapeHtml(b.diecezja.split(" / ")[0])}</strong></td>
        <td>${escapeHtml(b.biskup)}<br><span class="muted small">${escapeHtml(b.od)}${b.pomocniczy && !b.pomocniczy.startsWith("brak") ? ` · pomocniczy: ${escapeHtml(b.pomocniczy)}` : ""}</span></td>
        <td class="small">${escapeHtml(b.adres.slice(0, 90))}<br>${[tel(b.tel), mail(b.email), www(b.www)].filter(Boolean).join(" · ")}<br><span class="muted">${escapeHtml(b.jezyk)}</span></td>
        <td class="small">${escapeHtml(b.uwagi)}</td>
        <td>${chip(status(b.id))}<br><span class="small">${escapeHtml(note(b.id))}</span></td>
        <td><button type="button" class="btn-link" data-kst="${escapeHtml(b.id)}" data-kind="biskup">zmień</button></td></tr>`).join("")}</tbody>
    </table></div>`;
}

let bound = false;
export async function initKontakty(choices) {
  await loadKontakty();
  lastChoices = choices || {};
  const root = $("#kontakty-app");
  if (root && !bound) {
    bound = true;
    root.addEventListener("click", (e) => { const b = e.target.closest("[data-kst]"); if (b) editStatus(b.dataset.kst, b.dataset.kind); });
    onZbRender(() => renderKontakty(lastChoices));
  }
  renderKontakty(lastChoices);
}
