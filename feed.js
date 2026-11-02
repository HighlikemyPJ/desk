// Data access shared by the app and the dashboard.
//  local (served by the desk box): plain d/{DATA_PATH}/*.json
//  public (GitHub Pages, *.github.io): encrypted snapshots on the repo's data branch, one new file per 15s slot,
//  read from raw.githubusercontent.com (a never-requested path is always fresh). File id and AES key are derived
//  from the private #d= value in the browser; the value itself never leaves the device.
"use strict";
const Feed = (() => {
  const CFG = { repo: "HighlikemyPJ/desk", branch: "data", slot: 15, margin: 6, maxMargin: 14, back: 8 };
  const remote = /\.github\.io$/.test(location.hostname) || /[?&]feed=remote/.test(location.search);
  const enc = new TextEncoder();
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  let dp = null, id = null, key = null, bundle = null, lastSlot = 0, margin = CFG.margin, inflight = null;
  const missed = new Set();

  async function init(p) {
    if (dp === p && key) return;
    dp = p;
    id = hex(await crypto.subtle.digest("SHA-256", enc.encode("desk-id:" + p))).slice(0, 32);
    const raw = await crypto.subtle.digest("SHA-256", enc.encode("desk-key:" + p));
    key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  }
  async function slotFile(k) {
    const r = await fetch(`https://raw.githubusercontent.com/${CFG.repo}/${CFG.branch}/e/${id}/${k}.bin`, { cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("HTTP " + r.status);
    const buf = await r.arrayBuffer();
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
    if (typeof DecompressionStream === "undefined") throw new Error("browser too old (no gzip stream)");
    const txt = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    return JSON.parse(txt);
  }
  async function refresh() {
    const k = Math.floor((Date.now() / 1000 - margin) / CFG.slot);
    if (k <= lastSlot) return bundle;
    for (let j = k; j > Math.max(lastSlot, k - CFG.back); j--) {
      if (missed.has(j)) continue;
      const b = await slotFile(j);
      if (b) {
        if (j === k) margin = Math.max(CFG.margin, margin - 0.25);
        bundle = b; lastSlot = j; return bundle;
      }
      missed.add(j);                                   // a 404 is cached by the CDN for minutes: never ask again
      if (j === k && bundle) margin = Math.min(CFG.maxMargin, margin + 2);  // asked too early: wait longer next time
    }
    if (!bundle) throw new Error("no snapshot yet");
    return bundle;
  }
  async function get(p, name) {
    if (!remote) {
      const r = await fetch(`d/${p}/${name}?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }
    await init(p);
    if (!inflight) inflight = refresh().finally(() => { inflight = null; });
    const b = await inflight;
    const m = name.match(/^coin\/(.+)\.json$/);
    const v = m ? (b.coin || {})[decodeURIComponent(m[1])] : b[name.replace(/\.json$/, "")];
    if (v == null) throw new Error("HTTP 404");
    return v;
  }
  return { get, remote, info: () => ({ slot: lastSlot, margin, pushed_at: bundle && bundle.pushed_at }) };
})();
