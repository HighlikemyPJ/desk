// Offline launch only. App files: network first (bypassing the HTTP cache), cached copy only when offline.
// Desk data is never cached: d/ (local), *.bin / *.json feeds, and every other origin (GitHub raw, GeckoTerminal) pass straight through.
const C = "desk-v5";
const SHELL = ["./", "index.html", "app.css", "app.js", "feed.js", "chart.js", "manifest.json",
  "dash.html", "dash.css", "dash.js", "m.css", "m.js", "vendor/lightweight-charts.js", "dash.webmanifest",
  "icons/dash-180.png", "icons/dash-192.png", "icons/dash-512.png"];
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => { }))))); });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.includes("/d/") || /\.(bin|json)$/.test(u.pathname) && !u.pathname.endsWith("manifest.json")) return;
  e.respondWith(fetch(r, { cache: "no-cache" }).then(res => {
    if (res.ok && res.type === "basic") { const cp = res.clone(); caches.open(C).then(c => c.put(new Request(u.origin + u.pathname), cp)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || (r.mode === "navigate" ? caches.match("dash.html") : undefined)).then(m => m || Response.error())));
});
