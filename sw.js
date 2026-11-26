/* Offline dla strony jadących: sieć najpierw, a bez internetu — ostatnia zapisana wersja. */
const CACHE = "sdm2027-pielgrzym-v4";
const CORE = [
  "./", "index.html", "css/style.css", "css/pielgrzym.css",
  "js/pielgrzym.js", "js/util.js", "js/cost.js", "js/details.js", "js/checks.js", "js/tiles.js", "js/icons.js", "js/maps.js",
  "data/data.json", "data/kompendium.json", "img/ikona.svg", "img/ikona-192.png", "manifest.webmanifest",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || /upload\.wikimedia\.org|fonts\.(googleapis|gstatic)\.com|unpkg\.com|server\.arcgisonline\.com/.test(url.host);
  if (!cacheable) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res && (res.ok || res.type === "opaque")) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: url.origin === location.origin }))
  );
});
