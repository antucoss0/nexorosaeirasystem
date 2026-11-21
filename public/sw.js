const CACHE = "eira-shell-v3";
// Public pages are stored with everything they need so they open without a network.
const PUBLIC = ["/", "/presentacion", "/login", "/guia"];
async function precache(cache) {
  await Promise.all(
    PUBLIC.map(async (path) => {
      try {
        const res = await fetch(path, { credentials: "omit" });
        if (!res.ok || res.redirected) return;
        const html = await res.clone().text();
        await cache.put(path, res);
        const assets = new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g) || []);
        await Promise.all(
          [...assets].map(async (asset) => {
            try {
              if (await cache.match(asset)) return;
              const file = await fetch(asset);
              if (file.ok) await cache.put(asset, file);
            } catch {}
          }),
        );
      } catch {}
    }),
  );
}
const cacheable = (path) =>
  ["/campo", "/admin/jornadas"].includes(path) ||
  /^\/admin\/pacientes(?:\/[^/]+(?:\/estudio\/[^/]+)?)?$/.test(path);
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c
          .addAll(["/offline.html", "/icon.svg", "/manifest.webmanifest"])
          .then(() => precache(c)),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
          ),
        ),
    ]),
  );
});
self.addEventListener("message", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      if (event.data?.type === "OFFLINE") {
        await cache.put("/__mode", new Response(String(event.data.value)));
        event.ports[0]?.postMessage("ok");
      }
      const mode = await cache.match("/__mode");
      if (
        event.data?.type === "CACHE_SHELL" &&
        cacheable(new URL(event.data.path, self.location.origin).pathname) &&
        (!mode || (await mode.text()) !== "true")
      ) {
        const res = await fetch(event.data.path);
        if (res.ok && !res.redirected) await cache.put(event.data.path, res);
      }
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const mode = await cache.match("/__mode");
      if (
        mode &&
        (await mode.text()) === "true" &&
        !(event.request.mode === "navigate" && PUBLIC.includes(url.pathname))
      )
        return (
          (await cache.match(event.request)) ||
          (await cache.match(url.pathname)) ||
          (event.request.mode === "navigate"
            ? await cache.match("/offline.html")
            : new Response("Offline simulado", { status: 503 }))
        );
      return handle(event, cache, url);
    })(),
  );
});
async function handle(event, cache, url) {
  if (
    url.pathname === "/api/auth/logout" ||
    url.pathname === "/api/auth/login"
  ) {
    const res = await fetch(event.request);
    if (res.ok) {
      for (const key of await cache.keys()) {
        if (
          new URL(key.url).pathname.startsWith("/campo") ||
          new URL(key.url).pathname.startsWith("/admin")
        )
          await cache.delete(key);
      }
    }
    return res;
  }
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/"))
    return fetch(event.request);
  if (
    url.pathname.startsWith("/_next/static/") ||
    ["/icon.svg", "/manifest.webmanifest"].includes(url.pathname)
  ) {
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const res = await fetch(event.request);
    if (res.ok) await cache.put(event.request, res.clone());
    return res;
  }
  if (event.request.mode === "navigate") {
    try {
      const res = await fetch(event.request);
      if (res.ok && !res.redirected && PUBLIC.includes(url.pathname))
        await cache.put(url.pathname, res.clone());
      else if (res.ok && !res.redirected && cacheable(url.pathname))
        await cache.put(event.request, res.clone());
      return res;
    } catch {
      return (
        (await cache.match(event.request)) ||
        (PUBLIC.includes(url.pathname) && (await cache.match(url.pathname))) ||
        (await cache.match("/offline.html"))
      );
    }
  }
  return fetch(event.request);
}
