// Plan B: no web push endpoint. The service worker only caches the app shell for offline launch.
const C = "desk-v2", SHELL = ["./", "index.html", "app.css", "app.js", "feed.js", "chart.js", "manifest.json"];
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))); });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || u.pathname.includes("/d/")) return;   // data (local or GitHub) always from the network
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
