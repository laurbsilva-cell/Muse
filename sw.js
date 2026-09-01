/* muse. — service worker.
   Shell em cache para abrir offline. Documentos e arquivos de autenticação
   tentam a rede primeiro para que correções de login não fiquem presas em cache.
   Respostas de APIs de terceiros nunca entram no cache. */
const CACHE = "muse-v9";
const SHELL = [
  "./", "./index.html", "./app.html", "./privacidade.html",
  "./config.js", "./nuvem.js", "./manifest.json",
  "./logo.png", "./icon-192.png", "./icon-512.png",
  "./icon-maskable-512.png", "./apple-touch-icon.png", "./og.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data && e.data.tipo === "assumir") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* Supabase, Open Food Facts e qualquer terceiro ficam fora do cache. */
  if (url.origin !== location.origin) return;

  /* Navegação e os dois scripts que controlam conta/login usam network-first. */
  const authScript = /\/(config|nuvem)\.js$/.test(url.pathname);
  if (req.mode === "navigate" || req.destination === "document" || authScript) {
    e.respondWith(
      fetch(req)
        .then(r => {
          const c = r.clone();
          caches.open(CACHE).then(k => k.put(req, c));
          return r;
        })
        .catch(() => caches.match(req).then(r => r || (req.destination === "document" ? caches.match("./app.html") : undefined)))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(resp => {
      if (resp.ok && resp.type === "basic") {
        const c = resp.clone();
        caches.open(CACHE).then(k => k.put(req, c));
      }
      return resp;
    }))
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ls => {
    for (const c of ls) if (c.url.includes("app.html") && "focus" in c) return c.focus();
    return clients.openWindow("./app.html");
  }));
});
