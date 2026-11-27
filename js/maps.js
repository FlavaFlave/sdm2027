/**
 * Mapy Leaflet. Kafelki Esri Light Gray bez napisów + własne angielskie etykiety miast (bez pisma japońskiego i koreańskiego).
 * Przy zmianie decyzji przebudowują się warstwy markerów i tras.
 * Kolory pinów: -- Japan #1f4e79, Korea #8b2a32, lotniska #c6a15b.
 */
import { escapeHtml } from "./util.js";

const maps = {};
const mapLayers = {};
const mapState = {};
const COLORS = { jp: "#1f4e79", kr: "#a3303a", air: "#b8893a" };

function countryGroup(kraj) {
  const k = (kraj || "").toLowerCase();
  if (k.includes("korea")) return "kr";
  if (k.includes("japon")) return "jp";
  return "air";
}
/** Ważność miejsca przy rozrzedzaniu pinów na małym przybliżeniu (wyżej = zostaje). */
const RANK = { sanktuarium: 6, sdm: 6, kosciol: 4, zwiedzanie: 4, nocleg: 3, transport: 2, lotnisko: 1 };
const PLANE = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="#fff" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>';
const BED = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path fill="#fff" d="M3 7v11h2v-2h14v2h2v-6a3 3 0 0 0-3-3h-7v5H5V7z M7.5 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>';

function markerIcon(p, dayNo) {
  const g = countryGroup(p.kraj);
  const color = COLORS[g];
  if (p.typ === "lotnisko" || p.typ === "transport") {
    return L.divIcon({ className: "pin2", html: `<span class="pin-sm" style="background:${COLORS.air}">${PLANE}</span>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12] });
  }
  if (p.typ === "nocleg") {
    return L.divIcon({ className: "pin2", html: `<span class="pin-sm" style="background:${color}">${BED}</span>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12] });
  }
  const star = p.typ === "sanktuarium" || p.typ === "sdm";
  return L.divIcon({
    className: "pin2",
    html: `<span class="pin-day${star ? " star" : ""}" style="background:${color}">${dayNo || "•"}</span>`,
    iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -15],
  });
}

/** Numer dnia (1 = 1.08) i lista dat, w których miejsce jest w planie. */
function dayIndex(days) {
  const idx = {};
  (days || []).forEach((d, i) => {
    String(d.miejsca || "").split(",").map((x) => x.trim()).filter(Boolean).forEach((id) => {
      (idx[id] = idx[id] || []).push({ n: i + 1, data: d.data, pl: (d.data_pl || "").replace(".2027", "") });
    });
  });
  return idx;
}

function tipHtml(p, visits) {
  const img = p.zdjecie_url ? `<img src="${escapeHtml(p.zdjecie_url)}" alt="" />` : "";
  const when = visits && visits.length ? `<span class="when">${visits.map((v) => "dzień " + v.n + " · " + v.pl).join(", ")}</span>` : "";
  return `<div class="rich">${img}<div class="pad">${when}<strong>${escapeHtml(p.nazwa)}</strong><p>${escapeHtml(p.zwiedzamy || p.opis || "")}</p></div></div>`;
}
function popHtml(p, visits, canOpen) {
  const img = p.zdjecie_url ? `<img src="${escapeHtml(p.zdjecie_url)}" alt="${escapeHtml(p.nazwa)}" />` : "";
  const cred = p.zdjecie_zrodlo ? `<p class="credit">${escapeHtml(p.zdjecie_zrodlo)}</p>` : "";
  const when = visits && visits.length ? `<p class="when">${visits.map((v) => "Dzień " + v.n + " · " + v.pl).join(" · ")}</p>` : "";
  const btns = canOpen && visits && visits.length
    ? `<p class="pop-days">${visits.map((v) => `<button type="button" class="pop-day" data-day="${v.data}">Czytaj o dniu ${v.pl} →</button>`).join("")}</p>` : "";
  return `<div class="pop">${img}<div class="pad">${when}<h4>${escapeHtml(p.nazwa)}</h4><p>${escapeHtml(p.opis || "")}</p>${p.zwiedzamy ? `<p><strong>Co zwiedzamy:</strong> ${escapeHtml(p.zwiedzamy)}</p>` : ""}${btns}${cred}</div></div>`;
}

export function getMaps() { return maps; }

/** Angielskie etykiety (kafelki są bez napisów, żeby nie było japońskiego i koreańskiego pisma). */
const EN_LABELS = [
  { n: "JAPAN", lat: 36.9, lng: 138.4, z: 4, cls: "country" }, { n: "SOUTH KOREA", lat: 36.4, lng: 127.9, z: 5, cls: "country" },
  { n: "Tokyo", lat: 35.68, lng: 139.76, z: 4 }, { n: "Osaka", lat: 34.69, lng: 135.5, z: 5 },
  { n: "Kyoto", lat: 35.01, lng: 135.77, z: 6 }, { n: "Nagoya", lat: 35.18, lng: 136.9, z: 6 },
  { n: "Sendai", lat: 38.27, lng: 140.87, z: 5 }, { n: "Akita", lat: 39.72, lng: 140.1, z: 5 },
  { n: "Fukushima", lat: 37.75, lng: 140.47, z: 7 }, { n: "Niigata", lat: 37.9, lng: 139.02, z: 7 },
  { n: "Hiroshima", lat: 34.39, lng: 132.46, z: 5 }, { n: "Fukuoka", lat: 33.59, lng: 130.4, z: 5 },
  { n: "Nagasaki", lat: 32.75, lng: 129.87, z: 5 }, { n: "Kagoshima", lat: 31.6, lng: 130.56, z: 7 },
  { n: "Sapporo", lat: 43.06, lng: 141.35, z: 5 }, { n: "Kobe", lat: 34.69, lng: 135.19, z: 7 },
  { n: "Seoul", lat: 37.57, lng: 126.98, z: 4 }, { n: "Busan", lat: 35.18, lng: 129.08, z: 5 },
  { n: "Daejeon", lat: 36.35, lng: 127.38, z: 7 }, { n: "Daegu", lat: 35.87, lng: 128.6, z: 7 },
  { n: "Incheon", lat: 37.46, lng: 126.7, z: 8 }, { n: "Gwangju", lat: 35.16, lng: 126.85, z: 7 },
  { n: "Doha", lat: 25.29, lng: 51.53, z: 3 }, { n: "Warsaw", lat: 52.23, lng: 21.01, z: 3 },
];
function addEnglishLabels(map) {
  const layer = L.layerGroup().addTo(map);
  const draw = () => {
    layer.clearLayers();
    const z = map.getZoom();
    EN_LABELS.filter((l) => z >= l.z && !(l.cls === "country" && z > 7)).forEach((l) => {
      L.marker([l.lat, l.lng], {
        icon: L.divIcon({ className: `map-label ${l.cls || "city"}`, html: `<span>${l.n}</span>`, iconSize: null }),
        interactive: false, keyboard: false, zIndexOffset: -1000,
      }).addTo(layer);
    });
  };
  map.on("zoomend", draw);
  draw();
}

/** Widoki krajów — gdy wejdziesz w zakładkę, mapa przybliża się do tego obszaru. */
export const COUNTRY_VIEW = {
  "map-jp": [[30.8, 128.6], [41.2, 141.6]],
  "map-kr": [[33.9, 125.6], [38.3, 129.7]],
  "map-all": [[30.5, 124.5], [41.5, 141.8]],
  "pg-map": [[30.5, 124.5], [41.5, 141.8]],
};
export const VIEWS = {
  all: [[30.5, 124.5], [41.5, 141.8]],
  jp: [[30.8, 128.6], [41.2, 141.6]],
  kr: [[33.9, 125.6], [38.3, 129.7]],
};

export function addBase(map) {
  // Esri Ocean bez napisów: niebieskie morze, jasny ląd z rzeźbą terenu (do przybliżenia 10).
  // Bliżej (miasto) — Esri Light Gray, też bez napisów. Etykiety dodajemy sami po angielsku.
  const esri = "Tiles &copy; Esri &mdash; GEBCO, NOAA, Garmin, HERE, &copy; OpenStreetMap contributors";
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}", {
    attribution: esri, maxZoom: 10, maxNativeZoom: 10,
  }).addTo(map);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    minZoom: 10.5, maxZoom: 16,
  }).addTo(map);
}

export function ensureMap(elId) {
  if (maps[elId]) return maps[elId];
  const el = document.getElementById(elId);
  if (!el) return null;
  const touch = typeof L !== "undefined" && L.Browser && L.Browser.mobile;
  // Na telefonie mapę przesuwa się dwoma palcami, żeby jednym dało się przewijać stronę.
  const map = L.map(el, { scrollWheelZoom: false, zoomControl: true, dragging: !touch, tap: false, zoomSnap: 0.5 });
  map.setView([35.5, 132], 5);
  addBase(map);
  addEnglishLabels(map);
  maps[elId] = map;
  map.on("zoomend", () => declutter(elId));
  el.addEventListener("click", (e) => {
    const b = e.target.closest(".pop-day");
    if (b && mapState[elId] && mapState[elId].onDay) { map.closePopup(); mapState[elId].onDay(b.dataset.day); }
  });
  if (typeof ResizeObserver !== "undefined") {
    let had = false;
    new ResizeObserver(() => {
      const ok = el.offsetWidth > 0 && el.offsetHeight > 0;
      if (ok && !had) { map.invalidateSize(); fitCountry(elId); }
      had = ok;
    }).observe(el);
  }
  return map;
}

export function fitCountry(elId, animate, bounds) {
  const map = maps[elId];
  const b = bounds || (mapState[elId] && mapState[elId].view) || COUNTRY_VIEW[elId];
  if (!map || !b) return;
  map.invalidateSize();
  if (!map.getSize().x) return;
  map.fitBounds(b, { animate: !!animate, padding: [12, 12] });
}
/** Dla strony jadących: przełączanie widoku Całość / Japonia / Korea. */
export function setView(elId, key) {
  if (!mapState[elId]) mapState[elId] = {};
  mapState[elId].view = VIEWS[key] || VIEWS.all;
  fitCountry(elId, true);
}

/** Ukrywa piny, które na tym przybliżeniu nachodzą na ważniejsze (zostają sanktuaria i miejsca dnia). */
function declutter(elId) {
  const map = maps[elId];
  const st = mapState[elId];
  if (!map || !st || !st.markers) return;
  const shown = [];
  st.markers.forEach(({ m, rank }) => {
    const pt = map.latLngToContainerPoint(m.getLatLng());
    const clash = shown.some((q) => Math.abs(q.x - pt.x) < 24 && Math.abs(q.y - pt.y) < 24);
    const el = m.getElement();
    if (el) el.style.display = clash ? "none" : "";
    if (!clash) shown.push(pt);
  });
}

/** Łuk dla lotów (żeby nie zlewał się z trasą lądową). */
function arc(a, b) {
  const pts = [];
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[1] - a[1], dy = b[0] - a[0];
  const c = [mx + dx * 0.18, my - dy * 0.18];
  for (let t = 0; t <= 1.0001; t += 0.05) {
    pts.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]);
  }
  return pts;
}

export function updateMap(elId, places, lines, opts = {}) {
  const map = ensureMap(elId);
  if (!map) return;
  if (mapLayers[elId]) map.removeLayer(mapLayers[elId]);
  const st = (mapState[elId] = mapState[elId] || {});
  st.onDay = opts.onDay || st.onDay;
  const idx = dayIndex(opts.days);
  const group = L.featureGroup();

  (lines || []).forEach((ln) => {
    const latlngs = ln.ids
      .map((id) => places.find((p) => p.id === id) || null)
      .filter((p) => p && Number.isFinite(p.lat))
      .map((p) => [p.lat, p.lng]);
    if (latlngs.length < 2) return;
    if (ln.dash) {
      for (let i = 1; i < latlngs.length; i++) {
        L.polyline(arc(latlngs[i - 1], latlngs[i]), { color: ln.color, weight: 2.5, opacity: 0.9, dashArray: ln.dash, interactive: false }).addTo(group);
      }
    } else {
      L.polyline(latlngs, { color: "#fff", weight: 7, opacity: 0.85, interactive: false, lineJoin: "round" }).addTo(group);
      L.polyline(latlngs, { color: ln.color, weight: 3.5, opacity: 0.95, interactive: false, lineJoin: "round" }).addTo(group);
    }
  });

  const list = places.map((p) => {
    const visits = idx[p.id] || [];
    const m = L.marker([p.lat, p.lng], { icon: markerIcon(p, visits.length ? visits[0].n : ""), title: p.nazwa, riseOnHover: true,
      zIndexOffset: (RANK[p.typ] || 2) * 100 });
    m.bindTooltip(tipHtml(p, visits), { direction: "top", sticky: true, opacity: 1, className: "rich-tip" });
    m.bindPopup(popHtml(p, visits, !!st.onDay), { maxWidth: 320 });
    m.addTo(group);
    return { m, rank: (RANK[p.typ] || 2) * 100 - (visits.length ? visits[0].n : 50) / 100 };
  });
  st.markers = list.sort((a, b) => b.rank - a.rank);
  group.addTo(map);
  mapLayers[elId] = group;
  const sized = map.getContainer().offsetWidth > 0 && map.getContainer().offsetHeight > 0;
  if (sized && !map._sdmFitted) { fitCountry(elId); map._sdmFitted = true; }
  setTimeout(() => declutter(elId), 0);
}

export function legendHtml() {
  return `<span><span class="legend-pin" style="background:${COLORS.jp}">3</span>Japonia — numer dnia</span>
    <span><span class="legend-pin" style="background:${COLORS.kr}">5</span>Korea</span>
    <span><span class="legend-pin star" style="background:${COLORS.jp}">★</span>sanktuarium / ŚDM (obwódka)</span>
    <span><span class="legend-pin sm" style="background:${COLORS.jp}">${BED}</span>nocleg</span>
    <span><span class="legend-pin sm" style="background:${COLORS.air}">${PLANE}</span>lotnisko, prom</span>
    <span><span class="legend-line"></span>autokar</span><span><span class="legend-line dash"></span>samolot, prom</span>`;
}

/** Miejsca na mapie zakładki Japonia — bez Polski, Kataru i Korei, żeby przybliżenie trafiało w Japonię. */
export function isJapanPlace(p) {
  return /Japonia/i.test(p.kraj || "") || p.id === "fuji";
}
/** Miejsca na mapie zakładki Korea — Półwysep i prom z Busan. */
export function isKoreaPlace(p) {
  return /Korea/i.test(p.kraj || "") || p.id === "prom";
}

/** Po kliknięciu zakładki: dopasuj widok do podanych punktów (po unhide mapa musi dostać invalidateSize). */
/** Po kliknięciu zakładki: przybliż do kraju (Japonia / Korea), a w Przeglądzie do obu krajów. */
export function focusMap(elId) {
  const map = maps[elId];
  if (!map) return;
  [0, 120, 350].forEach((t, i) => setTimeout(() => fitCountry(elId, i === 1), t));
}

export function eastLine(choices) {
  if (choices.petla === "C") return ["narita"];
  if (choices.petla === "B") return ["narita", "iwaki", "matsushima", "okago", "tozanso", "yamanaka", "haneda"];
  return ["narita", "iwaki", "akita", "akita_noc", "matsushima", "nikko", "yamanaka", "haneda"];
}

export function hiddenShown(warianty, effects, choices) {
  const ukryj = new Set();
  const pokaz = new Set();
  effects.forEach((code) => {
    const w = warianty[code];
    if (!w) return;
    (w.ukryj || []).forEach((id) => ukryj.add(id));
    (w.pokaz || []).forEach((id) => pokaz.add(id));
  });
  return { ukryj, pokaz };
}

export function visiblePlaces(places, warianty, effects, choices) {
  const { ukryj, pokaz } = hiddenShown(warianty, effects, choices);
  return places.filter((p) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
    if (ukryj.has(p.id)) return false;
    if (p.wariant && !pokaz.has(p.id)) return false;
    return true;
  });
}

export function routeLines(choices) {
  const east = eastLine(choices);
  const west = ["hakata", "tabira", "hirado", "nagasaki", "isahaya", "yamaguchi", "hiroshima", "miyajima", "himeji", "osaka", "fushimi", "kix"];
  const westJp = ["hakata", "tabira", "hirado", "nagasaki", "isahaya", "unzen", "yamaguchi", "hiroshima", "miyajima", "himeji", "osaka", "fushimi", "kiyomizu", "kix"];
  const kr = [choices.petla === "C" ? "incheon" : "gimpo", "mapo", ...(choices.petla === "C" ? ["gwanghwamun", "gahoedong"] : []), "seosomun", "myeongdong", "sangam", "seongnam", "jeoldusan", "saenamteo", "solmoe", "jwadong", "haeundae", "gamcheon", "jagalchi", "prom"];
  const all = [
    { ids: ["waw", "doha", "narita"], color: "#c6a15b", dash: "6 7" },
    { ids: east, color: "#1f4e79" },
    choices.petla === "C" ? { ids: ["narita", "incheon"], color: "#c6a15b", dash: "6 7" } : { ids: ["haneda", "gimpo"], color: "#c6a15b", dash: "6 7" },
    { ids: kr, color: "#a3303a" },
    { ids: ["prom", "hakata"], color: "#1f4e79", dash: "6 7" },
    { ids: west, color: "#1f4e79" },
    { ids: ["kix", "doha", "waw"], color: "#c6a15b", dash: "6 7" },
  ];
  const jp = [
    { ids: east, color: "#1f4e79" },
    { ids: westJp, color: "#1f4e79" },
  ];
  if (choices.fuji === "tak" && choices.petla === "B") {
    all.push({ ids: ["yamanaka", "fuji"], color: "#c6a15b", dash: "4 6" });
    jp.push({ ids: ["yamanaka", "fuji"], color: "#c6a15b", dash: "4 6" });
  }
  return { all, jp, kr: [{ ids: kr, color: "#a3303a" }] };
}
