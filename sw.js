/* muse. — service worker.
   Estratégia consciente: o shell fica em cache para abrir offline,
   o HTML tenta a rede primeiro para pegar atualização, e nada de
   resposta de API entra em cache. */
const CACHE = "muse-v7";
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

/* a página avisa quando a pessoa aceitou atualizar */
self.addEventListener("message", e => { if (e.data && e.data.tipo === "assumir") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* nada de terceiros entra em cache: Open Food Facts e Supabase
     respondem dado pessoal ou colaborativo que muda. */
  if (url.origin !== location.origin) return;

  if (req.mode === "navigate" || req.destination === "document") {
    e.respondWith(
      fetch(req)
        .then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); return r; })
        .catch(() => caches.match(req).then(r => r || caches.match("./app.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(resp => {
      if (resp.ok && resp.type === "basic") { const c = resp.clone(); caches.open(CACHE).then(k => k.put(req, c)); }
      return resp;
    }).catch(() => r))
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ls => {
    for (const c of ls) if (c.url.includes("app.html") && "focus" in c) return c.focus();
    return clients.openWindow("./app.html");
  }));
});
