// The Atlas offline: the page and its files are kept as they are fetched, so it opens without the network. The page
// itself is asked for afresh first (a new version arrives as soon as there is one), its files from the cache first
// (their names change with every build).
const CACHE = "atlas-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["./", "./manifest.webmanifest", "./icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const keep = (response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  };
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(keep).catch(() => caches.match(request).then((hit) => hit || caches.match("./"))));
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then(keep)));
});
