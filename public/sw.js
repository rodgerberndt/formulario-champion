// Service Worker mínimo — existe só para permitir notificações push em segundo plano.
// Não faz cache de páginas, assets ou requisições: o navegador sempre busca tudo direto da rede.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Push notification handler — persistente, aparece como notificação nativa do sistema
self.addEventListener("push", (event) => {
  let data = { title: "Novo lead no Champion", body: "Você tem um novo lead!" };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error("Push data parse error:", e);
  }

  // Tag única por notificação para que elas se empilhem em vez de se substituírem
  const uniqueTag = data.tag || `champion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icons/icon-192.png",
      badge: data.badge || "/icons/icon-192.png",
      tag: uniqueTag,
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [200, 100, 200, 100, 200],
      timestamp: Date.now(),
      data: { ...data, url: data.url || "/admin" },
    })
  );
});

// Clique na notificação — foca a aba do admin já aberta ou abre uma nova
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/admin";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("/admin") && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(urlToOpen);
      })
  );
});
