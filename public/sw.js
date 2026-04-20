const CACHE_NAME = "champion-v1";
const STATIC_ASSETS = [
  "/",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/champion-logo.png",
  "/favicon.png",
];

// Install - cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch - Network First for pages/API, Stale-While-Revalidate for assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip Supabase/API requests - always network
  if (
    url.hostname.includes("supabase") ||
    url.pathname.startsWith("/functions/") ||
    url.pathname.startsWith("/rest/") ||
    url.pathname.startsWith("/auth/")
  ) {
    return;
  }

  // NEVER cache JS/CSS bundles — Vite handles these with content hashing.
  // Caching them can cause React module duplication and blank-screen crashes.
  const ext = url.pathname.split(".").pop()?.toLowerCase();
  if (
    ext === "js" ||
    ext === "mjs" ||
    ext === "css" ||
    ext === "ts" ||
    ext === "tsx" ||
    url.pathname.includes("/node_modules/") ||
    url.pathname.includes("/src/") ||
    url.pathname.includes("/assets/index-")
  ) {
    return; // Let the browser handle these normally
  }

  // HTML pages - Network First
  if (
    event.request.mode === "navigate" ||
    event.request.headers.get("accept")?.includes("text/html")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || new Response(
              `<!DOCTYPE html>
              <html lang="pt-BR">
              <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
              <title>Champion - Sem conexão</title>
              <style>
                body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#010264;color:white;font-family:Inter,sans-serif;text-align:center;padding:2rem}
                h1{font-size:1.5rem;margin-bottom:0.5rem}
                p{opacity:0.7;font-size:0.875rem}
              </style></head>
              <body><div><h1>📡 Sem conexão</h1><p>Verifique sua internet e tente novamente.</p></div></body>
              </html>`,
              { headers: { "Content-Type": "text/html" } }
            );
          });
        })
    );
    return;
  }

  // Static assets (images, icons, fonts only) - Stale While Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      });
    })
  );
});

// Listen for messages (e.g. skip waiting)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Push notification handler — high-priority, persistent (overlays other apps on desktop)
self.addEventListener("push", (event) => {
  let data = { title: "Novo lead no Champion", body: "Você tem um novo lead!" };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error("Push data parse error:", e);
  }

  // Unique tag per notification so they STACK instead of replacing each other
  const uniqueTag = data.tag || `champion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icons/icon-192.png",
      badge: data.badge || "/icons/icon-192.png",
      tag: uniqueTag,
      renotify: true,
      requireInteraction: true, // Persist until user interacts (overlays desktop)
      silent: false,
      vibrate: [200, 100, 200, 100, 200],
      timestamp: Date.now(),
      data: { ...data, url: data.url || "/admin" },
    })
  );
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/admin";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window
        for (const client of clientList) {
          if (client.url.includes("/admin") && "focus" in client) {
            return client.focus();
          }
        }
        // Open new window
        return self.clients.openWindow(urlToOpen);
      })
  );
});
