/* Service Worker: offline-first app shell */
const CACHE_NAME = "cele-reviewer-cache-v11";
const APP_SHELL = [
  "./",
  "./index.html",
  "./quiz.html",
  "./decks.html",
  "./modules.html",
  "./settings.html",
  "./assets/css/styles.css",
  "./assets/css/decks.css",
  "./app.js",
  "./assets/js/main.js",
  "./assets/js/core/constants.js",
  "./assets/js/core/csv.js",
  "./assets/js/core/defaults.js",
  "./assets/js/core/dom.js",
  "./assets/js/core/latex.js",
  "./assets/js/core/markdown.js",
  "./assets/js/core/mathjax.js",
  "./assets/js/core/page.js",
  "./assets/js/core/pwa.js",
  "./assets/js/core/storage.js",
  "./assets/js/core/theme.js",
  "./assets/js/core/util.js",
  "./assets/js/features/decks/meta.js",
  "./assets/js/pages/decks.js",
  "./assets/js/pages/modules.js",
  "./assets/js/pages/quiz.js",
  "./assets/js/pages/settings.js",
  "./assets/js/ui/drawer.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/deck.svg",
  "./icons/restart.svg",
  "./icons/settings.svg",
  "./sounds/correct.mp3",
  "./sounds/wrong.mp3",
  "./data/decks/index.json",
  "./data/decks/sample.csv",
  "./data/decks/psad-formula.csv",
  "./data/decks/hpge-formula.csv",
  "./data/decks/surveying-formula.csv",
  "./data/decks/transportation-formula.csv",
  "./data/decks/mstc-terms.csv",
  "./data/decks/psad-terms.csv",
  "./data/decks/hpge-terms.csv",
  "./data/decks/basic-math-formula.csv",
  "./modules/index.json",
  "./modules/sample.md"
];

async function broadcastSwMessage(msg) {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) c.postMessage(msg);
  } catch {}
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const total = APP_SHELL.length;
      await broadcastSwMessage({ type: "SW_CACHE_START", total });

      let done = 0;
      for (const url of APP_SHELL) {
        const req = new Request(url, { cache: "reload" });
        const res = await fetch(req);
        if (!res.ok) throw new Error(`Failed to cache: ${url}`);
        await cache.put(req, res.clone());
        done += 1;
        await broadcastSwMessage({ type: "SW_CACHE_PROGRESS", done, total, url });
      }

      await broadcastSwMessage({ type: "SW_CACHE_DONE", total });
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      self.clients.claim();
    })()
  );
});

// Allow the page to trigger immediate activation for updates.
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Index files: network-first so new CSV/default decks show up immediately after edits.
  if (isSameOrigin(url) && (url.pathname.endsWith("/data/decks/index.json") || url.pathname.endsWith("/modules/index.json"))) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await cache.match(req);
          if (cached) return cached;
          throw new Error("Offline and index not cached");
        }
      })()
    );
    return;
  }

  // App shell: stale-while-revalidate (serves cached immediately, updates cache in background)
  if (isSameOrigin(url) && APP_SHELL.some((p) => url.pathname === new URL(p, self.location.href).pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        const fetchAndCache = fetch(req)
          .then((fresh) => {
            if (fresh.ok) cache.put(req, fresh.clone());
            return fresh;
          })
          .catch(() => cached);
        return cached || fetchAndCache;
      })()
    );
    return;
  }

  // CDN (MathJax): stale-while-revalidate
  if (!isSameOrigin(url) && /cdn\.jsdelivr\.net/i.test(url.hostname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        const fetchAndCache = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fetchAndCache;
      })()
    );
    return;
  }

  // Everything else: network-first, fallback to cache
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await cache.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") return cache.match("./index.html");
        throw new Error("Offline and not cached");
      }
    })()
  );
});
