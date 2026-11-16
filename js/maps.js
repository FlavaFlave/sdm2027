/**
 * Mapy Leaflet (OpenStreetMap).
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

export function ensureMap(elId) {
  if (maps[elId]) return maps[elId];
  const el = document.getElementById(elId);
  if (!el) return null;
  const map = L.map(el, { scrollWheelZoom: false, zoomControl: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);
  maps[elId] = map;
  return map;
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
  if (group.getLayers().length) {
    try { map.fitBounds(group.getBounds().pad(0.12)); } catch (_) { map.setView([35.5, 132], 5); }
  } else {
    map.setView([35.5, 132], 5);
  }
  setTimeout(() => map.invalidateSize(), 80);
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
