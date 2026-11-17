/** Kafelek dnia (zdjęcie miejsca, ilustracja namiotów albo miejsce na zdjęcie osoby). Wspólny dla obu stron. */
import { escapeHtml } from "./util.js";

const TENTS_SVG = `<svg class="tile-art" viewBox="0 0 300 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs><linearGradient id="nightsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070d24"/><stop offset="0.7" stop-color="#1d2b55"/><stop offset="1" stop-color="#2b3561"/></linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#f2c46b" stop-opacity="0.6"/><stop offset="1" stop-color="#f2c46b" stop-opacity="0"/></radialGradient></defs>
  <rect width="300" height="400" fill="url(#nightsky)"/>
  <g fill="#fff">${Array.from({ length: 60 }, (_, i) => `<circle cx="${(i * 71) % 300}" cy="${(i * 43) % 230}" r="${(i % 3) * 0.5 + 0.6}" opacity="${0.35 + (i % 5) / 10}"/>`).join("")}</g>
  <circle cx="235" cy="70" r="18" fill="#f4ecd2"/><circle cx="243" cy="64" r="17" fill="#0c1430"/>
  <path d="M0 262 Q150 245 300 262 L300 400 L0 400 Z" fill="#0d1a2c"/>
  <ellipse cx="150" cy="330" rx="190" ry="80" fill="url(#glow)"/>
  ${[[8,232,70],[92,226,82],[190,236,74],[255,244,60],[-20,282,90],[70,290,100],[175,286,96],[262,300,80]].map(([x, y, w]) =>
    `<path d="M${x} ${y + w * 0.7} L${x + w / 2} ${y} L${x + w} ${y + w * 0.7} Z" fill="#c6a15b"/><path d="M${x + w / 2} ${y} L${x + w * 0.4} ${y + w * 0.7} L${x + w * 0.6} ${y + w * 0.7} Z" fill="#3a2a10" opacity="0.9"/><circle cx="${x + w / 2}" cy="${y + w * 0.55}" r="3" fill="#ffe7a8" opacity="0.8"/>`).join("")}
</svg>`;

export function tileHtml(day, photo) {
  const k = day.kafelek;
  if (k && k.motyw === "namioty") {
    return { cls: "day-photo is-art", inner: TENTS_SVG, style: "", cap: `<p class="photo-cap">${escapeHtml(k.podpis || "")}</p>`, title: k.tytul };
  }
  if (k && k.motyw === "osoba") {
    if (k.zdjecie_url) {
      return { cls: "day-photo", inner: "", style: `style="background-image:url('${String(k.zdjecie_url).replace(/'/g, "%27")}')"`,
        cap: `<p class="photo-cap">${escapeHtml(k.osoba || "")}. ${escapeHtml(k.zdjecie_zrodlo || "")}</p>`, title: k.tytul };
    }
    return { cls: "day-photo is-person", inner: `<div class="person-slot"><span class="person-name">${escapeHtml(k.osoba || "")}</span><span class="person-sub">${escapeHtml(k.tytul || "")}</span></div>`,
      style: "", cap: `<p class="photo-cap is-todo">${escapeHtml(k.podpis || "")}</p>`, title: k.tytul };
  }
  const style = photo ? `style="background-image:url('${photo.zdjecie_url.replace(/'/g, "%27")}')"` : "";
  const cap = photo ? `<p class="photo-cap">${escapeHtml(photo.nazwa)}. ${escapeHtml(photo.zdjecie_zrodlo)}</p>` : "";
  return { cls: "day-photo", inner: "", style, cap, title: null };
}


/** Najlepsze zdjęcie dnia: najpierw miejsce z opisem (nie lotnisko, nie sam nocleg), potem dowolne ze zdjęciem. */
const TRANSIT = new Set(["waw", "doha", "narita", "haneda", "gimpo", "kix", "hakata", "mapo", "iwaki", "kitakami", "mito", "utsunomiya", "akita_noc"]);
export function bestPhoto(day, places) {
  const list = (day.miejsca || "").split(",").map((x) => x.trim()).map((id) => places.find((p) => p.id === id && p.zdjecie_url)).filter(Boolean);
  return list.find((p) => !TRANSIT.has(p.id) && p.szczegoly) || list.find((p) => !TRANSIT.has(p.id)) || list[0] || null;
}
