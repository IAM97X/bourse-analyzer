// BourseNext — Service Worker
// Cache-first pour le shell React, network-first pour les APIs externes

const CACHE_NAME = "boursenext-v1";

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
    caches.keys().then(async (keys) => {
      const oldCaches = keys.filter((k) => k !== CACHE_NAME);
      await Promise.all(oldCaches.map((k) => caches.delete(k)));
      // Si c'est une mise à jour (anciens caches présents), recharger tous les onglets ouverts
      if (oldCaches.length > 0) {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        clients.forEach((client) => client.navigate(client.url));
      }
    })
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

self.addEventListener("push", (event) => {
  const data = event.data?.json().catch(() => ({})) ?? {};
  const title = data.title || "BourseNext";
  const options = {
    body: data.body || "",
    icon: "/logo192.png",
    badge: "/logo192.png",
    tag: data.tag || "bourse-alert",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else self.clients.openWindow(url);
    })
  );
});
