// Data access shared by the app and the dashboard.
//  local (served by the desk box): plain d/{DATA_PATH}/*.json
//  public (GitHub Pages, *.github.io): encrypted snapshots on the repo's data branch, one new file per 15s slot,
//  read from raw.githubusercontent.com (a never-requested path is always fresh). File id and AES key are derived
//  from the private #d= value in the browser; the value itself never leaves the device.
//  Paused box (no new slot files): falls back to e/<id>/latest.bin (fixed name, CDN-cached ~5 min), and the last good
//  snapshot is kept on the device as the still-encrypted blob (localStorage), so the app opens instantly with the last state.
"use strict";
const Feed = (() => {
  const CFG = { repo: "HighlikemyPJ/desk", branch: "data", slot: 15, margin: 6, maxMargin: 14, back: 8 };
  const remote = /\.github\.io$/.test(location.hostname) || /[?&]feed=remote/.test(location.search);
  const enc = new TextEncoder();
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  let dp = null, id = null, key = null, bundle = null, lastSlot = 0, margin = CFG.margin, inflight = null;
  let latestAt = 0, savedAt = 0, source = null;          // source: "slot" | "latest" | "cache"
  const b64 = buf => { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0)).buffer;
  const CK = () => "feedc_" + id;                         // id is a one-way hash; the stored value stays AES-GCM encrypted
  const missed = new Set();

  async function init(p) {
    if (dp === p && key) return;
    dp = p;
    id = hex(await crypto.subtle.digest("SHA-256", enc.encode("desk-id:" + p))).slice(0, 32);
    const raw = await crypto.subtle.digest("SHA-256", enc.encode("desk-key:" + p));
    key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  }
  // raw.githubusercontent caches a 404 for minutes per URL (and per browser header variant). These spellings are the same
  // file but separate cache entries: the newest slot (often asked a few seconds before it lands) is probed on its own
  // spelling, so it never poisons the ones older slots are read from; an older slot that 404s gets two more spellings.
  const PROBE = "highlikemypj/desk/refs/heads/data", READ = ["HighlikemyPJ/desk/data", "HighlikemyPJ/desk/refs/heads/data", "highlikemypj/desk/data"];
  async function open(buf) {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
    if (typeof DecompressionStream === "undefined") throw new Error("browser too old (no gzip stream)");
    const txt = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    return JSON.parse(txt);
  }
  function save(buf) {                                    // keep the encrypted blob only (never the decrypted JSON)
    if (Date.now() - savedAt < 20000 || buf.byteLength > 1500000) return;
    try { localStorage.setItem(CK(), b64(buf)); savedAt = Date.now(); } catch (e) { }
  }
  async function fetchBin(base, name) {
    const r = await fetch(`https://raw.githubusercontent.com/${base}/e/${id}/${name}.bin`, { cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.arrayBuffer();
  }
  async function slotFile(k, newest) {
    let buf = null;
    for (const base of newest ? [PROBE] : READ) {
      buf = await fetchBin(base, k);
      if (buf) break;
    }
    if (!buf) return null;
    const b = await open(buf); save(buf); return b;
  }
  // No fresh slot: read latest.bin (each URL spelling is its own CDN cache entry, so take the newest of them). At most once a minute.
  async function latest() {
    if (Date.now() - latestAt < 60000) return null;
    latestAt = Date.now();
    const got = await Promise.all([PROBE, ...READ].map(base => fetchBin(base, "latest").then(async buf => buf && [await open(buf), buf]).catch(() => null)));
    let best = null;
    for (const g of got) if (g && (!best || (g[0].slot || 0) > (best[0].slot || 0))) best = g;
    return best;
  }
  async function cached(p) {                              // last good snapshot stored on this device, decrypted on demand
    if (!remote) return null;
    await init(p);
    if (bundle) return bundle;
    let t = null; try { t = localStorage.getItem(CK()); } catch (e) { }
    if (!t) return null;
    try { const b = await open(unb64(t)); if (!bundle) { bundle = b; lastSlot = b.slot || 0; source = "cache"; } return bundle; }
    catch (e) { try { localStorage.removeItem(CK()); } catch (x) { } return null; }
  }
  async function refresh() {
    const k = Math.floor((Date.now() / 1000 - margin) / CFG.slot);
    if (k <= lastSlot) return bundle;
    for (let j = k; j > Math.max(lastSlot, k - CFG.back); j--) {
      if (missed.has(j)) continue;
      const b = await slotFile(j, j === k);
      if (b) {
        if (j === k) margin = Math.max(CFG.margin, margin - 0.25);
        bundle = b; lastSlot = j; source = "slot"; return bundle;
      }
      if (j !== k) missed.add(j);                      // a 404 is cached by the CDN for minutes: never ask that slot again (the newest
                                                       // was only probed on its own spelling, so it can still be read later)
      if (j === k && bundle) margin = Math.min(CFG.maxMargin, margin + 2);  // asked too early: wait longer next time
    }
    if (!bundle) await cached(dp);
    try {
      const L = bundle && k - lastSlot < 4 ? null : await latest();   // only after ~1 min without a new slot (or nothing at all)
      if (L && (!bundle || (L[0].slot || 0) > lastSlot)) { bundle = L[0]; lastSlot = L[0].slot || lastSlot; source = "latest"; save(L[1]); }
    } catch (e) { if (!bundle) throw e; }
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
  async function peek(p, name = "dash.json") {            // instant first paint from the on-device copy (remote only)
    const b = await cached(p).catch(() => null);
    return b ? b[name.replace(/\.json$/, "")] || null : null;
  }
  return { get, peek, remote, info: () => ({ slot: lastSlot, margin, source, pushed_at: bundle && bundle.pushed_at }) };
})();
