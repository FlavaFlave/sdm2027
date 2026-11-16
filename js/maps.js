/**
 * Mapy Leaflet. Kafelki Esri Light Gray bez napisów + własne angielskie etykiety miast (bez pisma japońskiego i koreańskiego).
 * Przy zmianie decyzji przebudowują się warstwy markerów i tras.
 * Kolory pinów: -- Japan #1f4e79, Korea #8b2a32, lotniska #c6a15b.
 */
import { escapeHtml } from "./util.js";

const maps = {};
const mapLayers = {};

function countryGroup(kraj) {
  const k = (kraj || "").toLowerCase();
  if (k.includes("korea")) return "kr";
  if (k.includes("japon")) return "jp";
  return "air";
}
function markerIcon(group) {
  const colors = { jp: "#1f4e79", kr: "#8b2a32", air: "#c6a15b" };
  const color = colors[group] || "#1f4e79";
  return L.divIcon({
    className: "pin",
    html: `<span style="display:block;width:16px;height:16px;background:${color};border:2px solid #f6f1e8;border-radius:50%;box-shadow:0 1px 6px rgba(0,0,0,.35)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}
function tipHtml(p) {
  const img = p.zdjecie_url ? `<img src="${escapeHtml(p.zdjecie_url)}" alt="" />` : "";
  return `<div class="rich">${img}<div class="pad"><strong>${escapeHtml(p.nazwa)}</strong><p>${escapeHtml(p.zwiedzamy || p.opis || "")}</p></div></div>`;
}
function popHtml(p) {
  const img = p.zdjecie_url ? `<img src="${escapeHtml(p.zdjecie_url)}" alt="${escapeHtml(p.nazwa)}" />` : "";
  const cred = p.zdjecie_zrodlo ? `<p class="credit">${escapeHtml(p.zdjecie_zrodlo)}</p>` : "";
  return `<div class="pop">${img}<div class="pad"><h4>${escapeHtml(p.nazwa)}</h4><p>${escapeHtml(p.opis || "")}</p><p><strong>Co zwiedzamy:</strong> ${escapeHtml(p.zwiedzamy || "—")}</p>${cred}</div></div>`;
}

export function getMaps() { return maps; }

/** Angielskie etykiety bazowe (kafelki są bez napisów, żeby nie było japońskiego i koreańskiego pisma). */
const EN_LABELS = [
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
    EN_LABELS.filter((l) => z >= l.z && !(l.cls === "country" && z > 8)).forEach((l) => {
      L.marker([l.lat, l.lng], {
        icon: L.divIcon({ className: `map-label ${l.cls || "city"}`, html: `<span>${l.n}</span>`, iconSize: null }),
        interactive: false, keyboard: false,
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
};

export function ensureMap(elId) {
  if (maps[elId]) return maps[elId];
  const el = document.getElementById(elId);
  if (!el) return null;
  const map = L.map(el, { scrollWheelZoom: false, zoomControl: true });
  map.setView([35.5, 132], 5);
  // Esri Light Gray Canvas bez warstwy napisów + własne etykiety po angielsku (zob. EN_LABELS).
  // Kolejność w URL to {z}/{y}/{x}.
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
    maxZoom: 16,
  }).addTo(map);
  addEnglishLabels(map);
  maps[elId] = map;
  // Gdy kontener dostanie rozmiar (po pokazaniu zakładki), dopasuj widok kraju.
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

export function fitCountry(elId, animate) {
  const map = maps[elId];
  const b = COUNTRY_VIEW[elId];
  if (!map || !b) return;
  map.invalidateSize();
  if (!map.getSize().x) return;
  map.fitBounds(b, { animate: !!animate, padding: [10, 10] });
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

export function updateMap(elId, places, lines) {
  const map = ensureMap(elId);
  if (!map) return;
  if (mapLayers[elId]) map.removeLayer(mapLayers[elId]);
  const group = L.featureGroup();
  places.forEach((p) => {
    const g = countryGroup(p.kraj);
    const m = L.marker([p.lat, p.lng], { icon: markerIcon(g), title: p.nazwa });
    m.bindTooltip(tipHtml(p), { direction: "top", sticky: true, opacity: 1, className: "rich-tip" });
    m.bindPopup(popHtml(p), { maxWidth: 320 });
    m.addTo(group);
  });
  (lines || []).forEach((ln) => {
    const latlngs = ln.ids
      .map((id) => places.find((p) => p.id === id) || null)
      .filter((p) => p && Number.isFinite(p.lat))
      .map((p) => [p.lat, p.lng]);
    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: ln.color, weight: 2.5, opacity: 0.85, dashArray: ln.dash }).addTo(group);
    }
  });
  group.addTo(map);
  mapLayers[elId] = group;
  const sized = map.getContainer().offsetWidth > 0 && map.getContainer().offsetHeight > 0;
  if (sized && !map._sdmFitted) { fitCountry(elId); map._sdmFitted = true; }
}

export function eastLine(choices) {
  const petla = choices.petla || "E1";
  let noc = choices.noc_2 || "iwaki";
  if (petla === "E4") return ["narita", "mito", "sendai", "matsushima", "nikko", "haneda"];
  const first = noc === "mito" ? "mito" : noc === "utsunomiya" ? "utsunomiya" : "iwaki";
  if (petla === "E2" || petla === "E3") return ["narita", first, "matsushima", "akita", "nikko", "haneda"];
  return ["narita", first, "matsushima", "akita", "kitakami", "nikko", "haneda"];
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
  const noc = (choices.petla === "E4") ? "mito" : (choices.noc_2 || "iwaki");
  if (noc === "mito") { ukryj.add("iwaki"); pokaz.add("mito"); }
  if (noc === "utsunomiya") { ukryj.add("iwaki"); pokaz.add("utsunomiya"); }
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
  const west = ["prom", "hakata", "tabira", "hirado", "nagasaki", "yamaguchi", "hiroshima", "miyajima", "himeji", "osaka", "fushimi", "kix"];
  const westJp = ["hakata", "tabira", "hirado", "nagasaki", "unzen", "yamaguchi", "hiroshima", "miyajima", "himeji", "osaka", "fushimi", "kiyomizu", "kix"];
  const kr = ["gimpo", "mapo", "jeoldusan", "sangam", "seosomun", "myeongdong", "seongnam", "solmoe", "gamcheon", "jagalchi", "oryundae", "haeundae", "prom"];
  const all = [
    { ids: ["waw", "doha", "narita"], color: "#c6a15b", dash: "6 7" },
    { ids: east, color: "#1f4e79" },
    { ids: ["haneda", "gimpo"], color: "#c6a15b", dash: "6 7" },
    { ids: kr, color: "#8b2a32" },
    { ids: west, color: "#1f4e79" },
    { ids: ["kix", "doha", "waw"], color: "#c6a15b", dash: "6 7" },
  ];
  const jp = [
    { ids: east, color: "#1f4e79" },
    { ids: westJp, color: "#1f4e79" },
  ];
  if (choices.fuji === "tak") {
    all.push({ ids: ["fuji"], color: "#c6a15b", dash: "4 6" });
    jp.push({ ids: ["fuji"], color: "#c6a15b", dash: "4 6" });
  }
  return { all, jp, kr: [{ ids: kr, color: "#8b2a32" }] };
}
