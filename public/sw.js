// Bourse Analyzer — Service Worker
// Cache-first pour le shell React, network-first pour les APIs externes

const CACHE_NAME = "bourse-analyzer-v1";

// Ressources du shell à mettre en cache à l'installation
const SHELL_URLS = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les appels API externes (Claude, Yahoo Finance, etc.)
  const isExternal =
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith("/api/");

  if (isExternal) return; // laisse passer sans cache

  // Navigation (HTML) — network-first avec fallback sur cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Assets statiques (JS, CSS, images) — cache-first
  event.respondWith(
    caches.match(request).then(
      (cached) => cached || fetch(request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return res;
      })
    )
  );
});
