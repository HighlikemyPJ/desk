// HIGHLIKEMYPJ DESK live dashboard. Polls dash.json via feed.js every 3s (local) or per 15s snapshot (GitHub Pages). Real rows only; empty states when there are none.
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const POLL = 3000;
(function () {
  const m = location.hash.match(/^#d=([A-Za-z0-9_-]{32,})/);
  if (m) { localStorage.setItem("dataPath", m[1]); history.replaceState(null, "", location.pathname + location.search); }
})();
const DP = localStorage.getItem("dataPath");
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TZ = "America/New_York";
const usd = (v, sign) => v == null ? "n/a" : (sign ? (v > 0 ? "+" : v < 0 ? "-" : "") : (v < 0 ? "-" : "")) + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kusd = v => v == null ? "n/a" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + v.toFixed(0);
const pct = (v, d = 2) => v == null ? "n/a" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%";
const price = p => p == null ? "n/a" : p >= 1 ? "$" + p.toFixed(4) : "$" + p.toPrecision(4);
const hms = ts => new Date(ts * 1000).toLocaleTimeString("en-US", { hour12: false, timeZone: TZ });
const ago = ts => { if (!ts) return ""; const s = Date.now() / 1000 - ts; return s < 60 ? Math.max(0, Math.round(s)) + "s ago" : s < 3600 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago"; };
const C = { g: "#39FF6A", r: "#FF3355", c: "#00E5FF", p: "#FF00FF", y: "#FFD23F", dim: "#8a7f8f" };
const toneColor = t => t === "good" ? C.g : t === "bad" ? C.r : t === "warn" ? C.y : C.c;

const NAMES = { scanner: "SCANNER", auditor: "AUDITOR", analyst: "ANALYST", executor: "EXECUTOR", risk: "RISK", telegram: "TG/WALLET", wallet: "WALLET" };
const EMPTY = { scanner: "waiting for first graduation", auditor: "waiting for a coin to pass scanner", analyst: "waiting for a coin to pass audit",
                executor: "waiting for first trade", risk: "waiting for first position", telegram: "no pushes yet tonight" };
const D = { data: null, seen: new Set(), first: true, lastOk: 0, queue: [], anims: [], coinMint: null };

function fit(cv) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); return [x, r.width, r.height];
}

// ---------- header clock / feed
function tick() {
  $("#clock").textContent = new Date().toLocaleTimeString("en-US", { hour12: false, timeZone: TZ }) + " ET";
  const f = $("#feed");
  if (!D.data) return;
  const lag = Date.now() / 1000 - D.data.updated_at;
  const okLag = Feed.remote ? 45 : 20;              // public copy is published every 15s, so ~10-30s is normal there
  f.className = "feed " + (lag < okLag ? "ok" : "stale");
  f.textContent = lag < okLag ? (Feed.remote ? "LIVE · " + Math.max(0, Math.round(lag)) + "s" : "LIVE FEED") : "feed stale " + Math.round(lag) + "s";
}

const BOTS = ["scanner", "auditor", "analyst", "executor", "risk", "telegram"];
// ---------- agent cards (icon · big number · small number + sparkline · quote)
const ACOL = { scanner: "#00E5FF", auditor: "#FFD23F", analyst: "#B26BFF", executor: "#39FF6A", risk: "#FF3355", telegram: "#FF00FF" };
const ICON = {
  scanner: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 L19 6"/><circle cx="16" cy="9" r="1.3" fill="currentColor"/>',
  auditor: '<path d="M12 2.5 L20 5.5 V11.5 C20 16.5 16.6 20 12 21.5 C7.4 20 4 16.5 4 11.5 V5.5 Z"/><path d="M8.5 12 L11 14.5 L15.5 9.5"/>',
  analyst: '<path d="M9 4.5 C6.5 4.5 5 6.3 5 8.3 C3.6 9 3 10.4 3.4 11.8 C2.6 13.2 3.2 15.2 4.8 15.8 C5 18 6.8 19.5 9 19.2 L9 4.5 Z"/><path d="M15 4.5 C17.5 4.5 19 6.3 19 8.3 C20.4 9 21 10.4 20.6 11.8 C21.4 13.2 20.8 15.2 19.2 15.8 C19 18 17.2 19.5 15 19.2 L15 4.5 Z"/><path d="M9 9 H7 M9 14 H6.5 M15 9 H17 M15 14 H17.5"/>',
  executor: '<path d="M13.5 2.5 L5 13.5 H11 L10 21.5 L19 10 H13 Z"/>',
  risk: '<path d="M12 3 L22 20.5 H2 Z"/><path d="M12 9.5 V14.5"/><circle cx="12" cy="17.6" r="0.9" fill="currentColor"/>',
  telegram: '<path d="M21.5 3 L2.5 10.5 L9 13 L11.5 20.5 L14.8 15.5 L19 18.5 Z"/><path d="M9 13 L21.5 3"/>',
};
const icon = a => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${ICON[a]}</svg>`;
function spark(cv, arr, color) {
  const [x, w, h] = fit(cv); x.clearRect(0, 0, w, h);
  const max = Math.max(1, ...arr), n = arr.length; if (n < 2) return;
  const X = i => 1 + i * (w - 2) / (n - 1), Y = v => h - 2 - (h - 5) * v / max;
  x.beginPath(); arr.forEach((v, i) => i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)));
  x.lineTo(w - 1, h); x.lineTo(1, h); x.closePath(); x.globalAlpha = .18; x.fillStyle = color; x.fill(); x.globalAlpha = 1;
  x.beginPath(); arr.forEach((v, i) => i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v)));
  x.strokeStyle = arr.some(v => v) ? color : "#3a2440"; x.lineWidth = 1.5; x.stroke();
}
const lastHr = (d, a) => (d.events || []).filter(e => (e.from === a || (a === "telegram" && e.from === "wallet")) && e.ts > d.updated_at - 3600).length;
function cards(d) {
  const el = $("#cards");
  if (!el.children.length) el.innerHTML = BOTS.map(a => `<div class="card" id="c-${a}" style="--ac:${ACOL[a]}">
      <div class="h"><span class="ic">${icon(a)}</span><b>${NAMES[a]}</b><span class="st"><span class="dot"></span><span class="hb"></span></span></div>
      <div class="big"><span class="n"></span><span class="u"></span></div>
      <div class="mini"><span class="sn"></span><canvas></canvas></div><div class="sub2"></div><div class="q"></div></div>`).join("");
  for (const a of BOTS) {
    const g = d.agents[a], c = $("#c-" + a);
    if (!g) continue;
    c.querySelector(".dot").className = "dot " + g.status;
    c.querySelector(".hb").textContent = g.status === "running" ? "♥ " + ago(g.beat).replace(" ago", "") : g.status;
    const n = c.querySelector(".n"); n.textContent = g.count; n.classList.toggle("zero", !g.count);
    c.querySelector(".u").textContent = g.unit.replace(/ today$/, "") + " today";
    const hr = lastHr(d, a); const sn = c.querySelector(".sn"); sn.textContent = (hr ? "+" : "") + hr + "/hr"; sn.classList.toggle("zero", !hr);
    let sub = g.sub;
    if (a === "telegram") {
      const w = d.wallet || {};
      sub = (w.sol != null ? w.sol.toFixed(4) + " SOL" + (w.usd != null ? " · " + usd(w.usd) : "") : "wallet SOL: reading…") +
            (w.usdc ? " · " + w.usdc.toFixed(2) + " USDC" : "") + (w.halted ? " · HALTED" : "");
    }
    c.querySelector(".sub2").textContent = sub;
    const q = c.querySelector(".q");
    if (g.last) { q.className = "q " + g.last.tone; q.textContent = `"${g.last.tag} ${g.last.coin ? g.last.coin + " · " : ""}${g.last.text}"`; q.title = q.textContent; }
    else { q.className = "q dim"; q.textContent = EMPTY[a]; }
    spark(c.querySelector("canvas"), g.spark, g.status === "down" ? C.r : ACOL[a]);
  }
}

// ---------- isometric trading floor: racks, desks, one pixel bot per agent, packets on floor wires
const LAY = {   // [x, d] in iso units: screen X = x*u/2, screen Y = d*u/4
  wide: { scanner: [-6, 5.5], auditor: [-3, 9.5], analyst: [-0.5, 5.5], executor: [2.5, 9.5], risk: [5, 5.5], telegram: [7.5, 9.5] },
  tall: { scanner: [-2.6, 4], auditor: [2.6, 8.2], analyst: [-2.6, 12.4], executor: [2.6, 16.6], risk: [-2.6, 20.8], telegram: [2.6, 25] },
};
const WIRES = [["scanner", "auditor"], ["auditor", "analyst"], ["analyst", "executor"], ["executor", "risk"], ["executor", "telegram"], ["risk", "telegram"]];
const NEXT = { scanner: "auditor", auditor: "analyst", analyst: "executor", executor: "risk", risk: "telegram" };
const botOf = k => k === "wallet" ? "telegram" : k;
const G = { nodes: {}, w: 0, h: 0, u: 0, ox: 0, oy: 0, lay: LAY.wide, tall: false, flash: {}, jump: {}, blinkAt: {}, layer: null, key: "", bursts: [] };
const P = (x, d) => [G.ox + x * G.u / 2, G.oy + d * G.u / 4];
const IJ = (i, j) => P(i - j, i + j);
const toIJ = ([x, d]) => [(d + x) / 2, (d - x) / 2];
function gInit() { BOTS.forEach((k, n) => { G.nodes[k] = { x: 0, y: 0 }; G.blinkAt[k] = performance.now() + 800 + n * 700; }); }
function layout(w, h) {
  const tall = w < 560, L = tall ? LAY.tall : LAY.wide, pts = Object.values(L);
  const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0]));
  const d0 = Math.min(...pts.map(p => p[1])), d1 = Math.max(...pts.map(p => p[1]));
  const padX = tall ? 58 : 80, top = tall ? 50 : 62, bot = tall ? 112 : 62, lab = 30;
  const span = (d1 - d0) / 4 + 1.15;
  const u = Math.max(28, Math.min(2 * (w - 2 * padX) / (x1 - x0), (h - top - bot - lab) / span, tall ? 70 : 100));
  const extra = Math.max(0, (h - top - bot - lab - span * u) / 2);
  Object.assign(G, { u, tall, lay: L, ox: w / 2 - (x0 + x1) / 4 * u, oy: top + extra + 1.15 * u - d0 * u / 4 });
}
function quad(x, pts, fill, stroke) {
  x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath();
  if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.strokeStyle = stroke; x.stroke(); }
}
// iso box centered on grid (ci,cj) with half sizes a (along i) and b (along j), height hh px. Returns the faces.
function box(x, ci, cj, a, b, hh, top, left, right, edge) {
  const c = (i, j, z) => { const [X, Y] = IJ(ci + i, cj + j); return [X, Y - z]; };
  const R = [c(a, -b, 0), c(a, b, 0), c(a, b, hh), c(a, -b, hh)];       // front-right face (i = +a)
  const Lf = [c(-a, b, 0), c(a, b, 0), c(a, b, hh), c(-a, b, hh)];      // front-left face (j = +b)
  const T = [c(-a, -b, hh), c(a, -b, hh), c(a, b, hh), c(-a, b, hh)];
  x.lineWidth = 1;
  quad(x, R, right, edge); quad(x, Lf, left, edge); quad(x, T, top, edge);
  return { R, L: Lf, T };
}
function wirePath(a, b) {
  const [ia, ja] = toIJ(G.lay[a]), [ib, jb] = toIJ(G.lay[b]);
  return [IJ(ia + .55, ja + .55), IJ(ib + .55, ja + .55), IJ(ib + .55, jb + .55)];
}
function racks() {
  const L = G.lay, xs = Object.values(L).map(p => p[0]), d0 = Math.min(...Object.values(L).map(p => p[1]));
  const out = [], x0 = Math.min(...xs) - (G.tall ? 1 : 2), x1 = Math.max(...xs) + (G.tall ? 1 : 2), step = G.tall ? 1.8 : 2.1;
  for (let xx = x0; xx <= x1 + .01; xx += step) out.push(toIJ([xx, d0 - 2.7]));
  return out;
}
function buildLayer(w, h, dpr) {
  const cv = G.layer || (G.layer = document.createElement("canvas"));
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = x.createRadialGradient(w / 2, h * .62, 10, w / 2, h * .62, Math.max(w, h) * .8);
  bg.addColorStop(0, "#160a1c"); bg.addColorStop(1, "#050307"); x.fillStyle = bg; x.fillRect(0, 0, w, h);
  // floor grid: lines of constant i and constant j
  const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(255,0,255,.04)"); gr.addColorStop(1, "rgba(255,0,255,.22)");
  x.strokeStyle = gr; x.lineWidth = 1;
  for (let k = -40; k <= 40; k++) {
    let [a1, b1] = IJ(k, -40), [a2, b2] = IJ(k, 40); x.beginPath(); x.moveTo(a1, b1); x.lineTo(a2, b2); x.stroke();
    [a1, b1] = IJ(-40, k); [a2, b2] = IJ(40, k); x.beginPath(); x.moveTo(a1, b1); x.lineTo(a2, b2); x.stroke();
  }
  // back-wall racks (bodies; LEDs are animated per frame)
  G.rackFaces = racks().map(([i, j]) => box(x, i, j, .38, .38, G.u * .95, "#17111b", "#0c090f", "#070509", "rgba(255,0,255,.45)"));
  G.rackFaces.forEach(f => {   // vent slats on the front-left face
    for (let s = 1; s < 7; s++) { const t = s / 7, p = (A, B) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
      const a = p(f.L[0], f.L[3]), b = p(f.L[1], f.L[2]); x.strokeStyle = "rgba(255,255,255,.05)"; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
  });
  // floor wires
  x.setLineDash([5, 5]); x.lineWidth = 1.5;
  for (const [a, b] of WIRES) { const p = wirePath(a, b); x.strokeStyle = "rgba(0,229,255,.28)"; x.beginPath(); p.forEach((q, n) => n ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.stroke(); }
  x.setLineDash([]);
  // glowing floor pad under each desk
  for (const k of BOTS) {
    const [i, j] = toIJ(G.lay[k]), col = ACOL[k];
    quad(x, [IJ(i - .85, j - .85), IJ(i + .85, j - .85), IJ(i + .85, j + .85), IJ(i - .85, j + .85)], col + "14", col + "66");
  }
}
// pixel bot, 12 x 13 px grid, feet at (cx, by)
function drawBot(x, k, cx, by, p, now, act) {
  const col = ACOL[k], X = cx - 6 * p, Y = by - 13 * p;
  const r = (a, b, w, h, c) => { x.fillStyle = c; x.fillRect(Math.round(X + a * p), Math.round(Y + b * p), Math.ceil(w * p), Math.ceil(h * p)); };
  if (act > 0) { x.save(); x.globalAlpha = act * .7; x.shadowColor = col; x.shadowBlur = 18; r(2, 2, 8, 10, col); x.restore(); }
  r(5.5, 0, 1, 2, "#8a7f8f"); r(5, -.6, 2, 1.2, act > 0 || Math.sin(now / 400 + k.length) > .6 ? col : "#5a4b5f");   // antenna
  r(2, 2, 8, 6, "#e6e0ee"); r(2, 7, 8, 1, "#b1a8bf");        // head
  r(1, 4, 1, 2, col); r(10, 4, 1, 2, col);                    // ears
  r(3, 3, 6, 4, "#0b0812");                                   // visor
  const blink = now > G.blinkAt[k] && now < G.blinkAt[k] + 140;
  if (now > G.blinkAt[k] + 140) G.blinkAt[k] = now + 2500 + Math.random() * 3500;
  if (blink) { r(3.8, 4.8, 1.6, .5, col); r(6.6, 4.8, 1.6, .5, col); }
  else { r(3.8, 3.8, 1.6, 2, col); r(6.6, 3.8, 1.6, 2, col); r(4.2, 4, .6, .6, "#fff"); r(7, 4, .6, .6, "#fff"); }
  if (act > 0) r(5, 6.1, 2, .5, col);                         // smile while acting
  r(3, 8, 6, 5, "#cfc8da"); r(5, 9, 2, 1.5, act > 0 || (now / 700 | 0) % 2 ? col : "#3a2a40");   // body + chest light
  r(2, 8.6, 1, 3, "#b1a8bf"); r(9, 8.6, 1, 3, "#b1a8bf");     // arms
}
function drawScene(now) {
  const cv = $("#graph"), r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = r.width, h = r.height; if (!w || !h) return;
  const key = w + "x" + h + "@" + dpr;
  if (G.key !== key) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); G.w = w; G.h = h;
    layout(w, h); buildLayer(w, h, dpr); G.key = key;
  }
  const x = cv.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(G.layer, 0, 0); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t = now / 1000, u = G.u;
  // rack LEDs
  (G.rackFaces || []).forEach((f, n) => {
    for (let s = 0; s < 4; s++) {
      const on = Math.sin(t * (1.3 + s * .7) + n * 2.1 + s) > .2, tt = .2 + s * .17, A = f.R[0], B = f.R[3], C2 = f.R[1];
      const px = A[0] + (B[0] - A[0]) * tt + (C2[0] - A[0]) * .3, py = A[1] + (B[1] - A[1]) * tt + (C2[1] - A[1]) * .3;
      x.fillStyle = on ? (s % 2 ? C.g : C.c) : "#1d2a22"; x.fillRect(px - 1.5, py - 1, 3, 2);
    }
  });
  // bots + desks, back to front
  const order = BOTS.slice().sort((a, b) => G.lay[a][1] - G.lay[b][1]);
  const p = Math.max(2, Math.round(u / (G.tall ? 17 : 14)));
  for (const k of order) {
    const [i, j] = toIJ(G.lay[k]), col = ACOL[k];
    const fl = G.flash[k] ? Math.max(0, 1 - (now - G.flash[k]) / 1400) : 0;
    const jp = G.jump[k] && now - G.jump[k] < 600 ? Math.sin(Math.PI * (now - G.jump[k]) / 600) : 0;
    const g = D.data && D.data.agents[k], down = g && g.status === "down";
    if (fl > 0) { const [fx, fy] = IJ(i, j); x.save(); x.globalAlpha = fl * .8; x.strokeStyle = col; x.lineWidth = 2; x.shadowColor = col; x.shadowBlur = 12;
      x.beginPath(); x.ellipse(fx, fy, u * (.6 + (1 - fl) * .5), u * (.3 + (1 - fl) * .25), 0, 0, 7); x.stroke(); x.restore(); }
    const deskH = u * .3, [dx, dy] = IJ(i + .1, j + .1);
    const bob = RM ? 0 : Math.sin(t * 2.2 + i * 1.7) * p * .6;
    const feetY = dy - deskH + 2 * p - jp * u * .32 + bob, bx = dx - u * .2;
    x.save(); if (down) x.globalAlpha = .45; drawBot(x, k, bx, feetY, p, now, fl); x.restore();
    box(x, i + .1, j + .1, .42, .3, deskH, "#1b1320", "#0f0a12", "#09060b", col + "aa");
    // monitor on the right of the desk, screen facing front-left
    const mh = u * .34, m0 = IJ(i + .2, j - .15), m1 = IJ(i + .52, j - .15);
    const S = [[m0[0], m0[1] - deskH], [m1[0], m1[1] - deskH], [m1[0], m1[1] - deskH - mh], [m0[0], m0[1] - deskH - mh]];
    quad(x, S, "#0a070c", col);
    const fk = down ? .08 : .22 + .1 * Math.sin(t * 9 + i * 3) * Math.sin(t * 2.3 + j) + fl * .6;
    const ins = (a, b) => [S[0][0] + (S[1][0] - S[0][0]) * a, S[0][1] + (S[1][1] - S[0][1]) * a - (S[0][1] - S[3][1]) * b];
    x.globalAlpha = Math.max(.05, Math.min(1, fk)); quad(x, [ins(.1, .12), ins(.9, .12), ins(.9, .88), ins(.1, .88)], col); x.globalAlpha = 1;
    x.strokeStyle = "rgba(0,0,0,.55)"; x.lineWidth = 1;
    for (let s = 0; s < 3; s++) { const off = ((t * .7 + s / 3) % 1) * .7 + .15, a = ins(.18, off), b = ins(.18 + .55 * ((s + 1) / 3), off); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
    // labels
    const [lx, ly] = IJ(i + .55, j + .55);
    x.textAlign = "center"; x.font = `${G.tall ? 16 : 18}px VT323, monospace`; x.fillStyle = "#fff"; x.fillText(NAMES[k], lx, ly + 15);
    if (g) { x.font = `${G.tall ? 14 : 15}px VT323, monospace`; x.fillStyle = down ? C.r : C.dim;
      const sub = k === "telegram" && D.data.wallet && D.data.wallet.sol != null ? D.data.wallet.sol.toFixed(3) + " SOL" : g.count + " " + g.unit.replace(/ today$/, "");
      x.fillText(down ? "DOWN" : sub, lx, ly + 29); }
    G.nodes[k].x = bx; G.nodes[k].y = feetY - 13 * p - 4;
  }
  // packets
  for (const an of D.anims) {
    const q = Math.min(1, (now - an.t0) / an.dur), e = q < .5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
    const pts = an.path, segs = [];
    let tot = 0; for (let n = 1; n < pts.length; n++) { const L = Math.hypot(pts[n][0] - pts[n - 1][0], pts[n][1] - pts[n - 1][1]); segs.push(L); tot += L; }
    const at = s => { let rem = s * tot; for (let n = 0; n < segs.length; n++) { if (rem <= segs[n] || n === segs.length - 1) { const f = segs[n] ? Math.min(1, rem / segs[n]) : 0; return [pts[n][0] + (pts[n + 1][0] - pts[n][0]) * f, pts[n][1] + (pts[n + 1][1] - pts[n][1]) * f]; } rem -= segs[n]; } return pts[0]; };
    const reach = an.kill ? .42 : 1, s = e * reach, col = an.kill ? C.r : C.c;
    for (let tr = 5; tr >= 1; tr--) { const [px, py] = at(Math.max(0, s - tr * .025)); x.globalAlpha = .12 * (6 - tr) / 5; x.fillStyle = col; x.beginPath(); x.arc(px, py, 3.5, 0, 7); x.fill(); }
    const [px, py] = at(s); x.globalAlpha = 1; x.save(); x.shadowColor = col; x.shadowBlur = 14; x.fillStyle = col; x.beginPath(); x.arc(px, py, 4.5, 0, 7); x.fill(); x.restore();
    if (q >= 1 && !an.done) { an.done = 1; if (an.kill) G.bursts.push({ x: px, y: py, t0: now }); else if (an.to) { G.flash[an.to] = now; G.jump[an.to] = now; } }
  }
  D.anims = D.anims.filter(a => now - a.t0 < a.dur + 50);
  for (const b of G.bursts) {
    const q = (now - b.t0) / 600; x.globalAlpha = Math.max(0, 1 - q); x.fillStyle = C.r;
    for (let n = 0; n < 8; n++) { const a = n * Math.PI / 4; x.fillRect(b.x + Math.cos(a) * q * 18 - 1.5, b.y + Math.sin(a) * q * 9 - 1.5, 3, 3); }
    x.globalAlpha = 1;
  }
  G.bursts = G.bursts.filter(b => now - b.t0 < 600);
}
function placeBubbles() {
  document.querySelectorAll("#bubbles .bubble").forEach(b => { const n = G.nodes[b.dataset.from]; if (!n) return;
    const half = Math.min(G.w / 2 - 4, b.offsetWidth / 2 + 2); b.style.left = Math.min(G.w - half, Math.max(half, n.x)) + "px"; b.style.top = Math.max(n.y, b.offsetHeight + 2) + "px"; });
}
function bubble(ev) {
  const k = botOf(ev.from), n = G.nodes[k]; if (!n) return;
  const b = document.createElement("div");
  b.className = "bubble " + (ev.tone === "bad" ? "bad" : ev.tone === "good" ? "good" : "");
  b.innerHTML = `<b>${esc(ev.tag)}</b>${esc(ev.coin ? ev.coin + " · " : "")}${esc(ev.text)}`;
  const box = $("#bubbles"); box.querySelectorAll(".bubble").forEach(o => { if (o.dataset.from === k) o.remove(); });
  b.dataset.from = k; box.appendChild(b); placeBubbles();
  setTimeout(() => { if (b.isConnected) b.classList.add("old"); }, 7000);
  setTimeout(() => { if (b.isConnected && G.tall) b.remove(); }, 15000);
}
let qTimer = 0;
function pump(now) {
  if (!D.queue.length || now < qTimer || !G.u) return;
  const ev = D.queue.shift(), from = botOf(ev.from), to = ev.to ? botOf(ev.to) : null;
  G.flash[from] = now; G.jump[from] = now;
  const kill = !to && ev.tone === "bad" && NEXT[from];
  if (to && to !== from && G.lay[to]) D.anims.push({ from, to, t0: now, dur: 1500, path: wirePath(from, to) });
  else if (kill) D.anims.push({ from, kill: true, t0: now, dur: 1100, path: wirePath(from, NEXT[from]) });
  bubble(ev);
  qTimer = now + Math.max(250, 1500 - D.queue.length * 120);
}
let last = performance.now();
function frame(now) {
  last = now;
  pump(now);
  if (!document.body.classList.contains("v-app")) { drawScene(now); placeBubbles(); }
  requestAnimationFrame(frame);
}

// ---------- floating overlays: ticker, mini chart, uplink
function overlays(d) {
  const c = d.coin, tk = $("#ticker");
  if (c) {
    const s = c.stats || {}, name = c.symbol || c.name || c.mint.slice(0, 6);
    const txt = `${c.position ? "OPEN" : "WATCHING"} $${name} · PX ${price(c.price)} · VOL 24H ${s.v24 != null ? kusd(s.v24) : "n/a"} · LIQ ${s.liq != null ? kusd(s.liq) : "n/a"} · MCAP ${s.mcap != null ? kusd(s.mcap) : "n/a"}${c.since_entry_pct != null ? " · SINCE ENTRY " + pct(c.since_entry_pct) : ""}`;
    if (tk.dataset.t !== txt) { tk.dataset.t = txt; tk.innerHTML = `<div class="tt"><span>${esc(txt)}</span><span>${esc(txt)}</span></div>`; }
  } else if (tk.dataset.t !== "") { tk.dataset.t = ""; tk.innerHTML = `<div class="tt0">no coin on watch yet</div>`; }
  const k = (c && c.candles) || [], cv = $("#minic"), [x, w, h] = fit(cv); x.clearRect(0, 0, w, h);
  $("#minih").innerHTML = c ? `$${esc(c.symbol || c.name || "")} <span>${price(c.price)}</span>` : "NO COIN";
  if (k.length < 2) { x.fillStyle = C.dim; x.font = "14px VT323, monospace"; x.textAlign = "center"; x.fillText(c ? `collecting prices · ${k.length} pt` : "waiting", w / 2, h / 2 + 4); return; }
  const cl = k.map(z => z[4]), lo = Math.min(...k.map(z => z[3])), hi = Math.max(...k.map(z => z[2])), rg = (hi - lo) || hi * .01 || 1;
  const X = i => 2 + i * (w - 4) / (cl.length - 1), Y = v => 3 + (h - 6) * (1 - (v - lo) / rg), up = cl[cl.length - 1] >= cl[0];
  x.beginPath(); cl.forEach((v, i) => i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))); x.strokeStyle = up ? C.g : C.r; x.lineWidth = 1.5; x.stroke();
}
function uplinkPulse() { const u = $("#uplink"); u.classList.remove("pulse"); void u.offsetWidth; u.classList.add("pulse"); }

// ---------- terminal footer: sync progress + live agent tags
function termFoot() {
  const now = Date.now();
  let next, span;
  if (Feed.remote) { const f = Feed.info(); span = 15000; next = f.slot == null ? now + 1000 : ((f.slot + 1) * 15 + f.margin) * 1000; if (next < now) next = now + 1000; }
  else { span = POLL; next = (D.lastPoll || now) + POLL; }
  const left = Math.max(0, next - now), prog = Math.max(0, Math.min(1, 1 - left / span));
  $("#syncbar").style.width = (prog * 100).toFixed(1) + "%";
  $("#synctxt").textContent = `NEXT SYNC ${Math.ceil(left / 1000)}s`;
  const d = D.data; if (!d) return;
  const recent = {}; (d.events || []).forEach(e => { const k = botOf(e.from); if (d.updated_at - e.ts < 300) recent[k] = 1; });
  const html = BOTS.map(k => { const g = d.agents[k], st = !g ? "off" : g.status === "down" ? "down" : recent[k] ? "hot" : g.status === "running" ? "on" : "off";
    return `<span class="tag ${st}" style="--ac:${ACOL[k]}">#${k === "telegram" ? "tg" : k}</span>`; }).join("");
  const tg = $("#tags"); if (tg.dataset.h !== html) { tg.dataset.h = html; tg.innerHTML = html; }
}
setInterval(termFoot, 250);

// ---------- balance chart
function balance(d) {
  const live = d.mode === "LIVE";
  $("#ballabel").textContent = live ? "BALANCE · WALLET SOL IN USD" : "BALANCE · PAPER EQUITY";
  $("#bignum").textContent = usd(d.balance);
  const tp = d.today_pct || 0;
  $("#balsub").innerHTML = `<span class="${tp >= 0 ? "up" : "down"}">${pct(tp)} today</span> · start ${usd(d.start_value)}`;
  $("#balnote").textContent = d.marks && d.marks.length ? d.marks.length + " trade marks" : "waiting for first trade";
  const cv = $("#bal"), [x, w, h] = fit(cv); x.clearRect(0, 0, w, h);
  const pts = d.series || []; if (pts.length < 2) return;
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
  let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
  if (hi - lo < Math.max(0.01, hi * .002)) { const m = (hi + lo) / 2, pad = Math.max(1, m * .01); lo = m - pad; hi = m + pad; }
  const pad = 22, X = t => (t - t0) / Math.max(1, t1 - t0) * (w - 8) + 4, Y = v => h - pad - (v - lo) / (hi - lo) * (h - 2 * pad);
  x.strokeStyle = "rgba(255,0,255,.08)"; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, h * i / 4); x.lineTo(w, h * i / 4); x.stroke(); }
  const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "rgba(57,255,106,.45)"); gr.addColorStop(1, "rgba(57,255,106,0)");
  x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1])));
  x.lineTo(X(t1), h); x.lineTo(X(t0), h); x.closePath(); x.fillStyle = gr; x.fill();
  x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1])));
  x.strokeStyle = C.g; x.lineWidth = 2; x.shadowColor = C.g; x.shadowBlur = 10; x.stroke(); x.shadowBlur = 0;
  for (const m of d.marks || []) {
    if (m.ts < t0) continue;
    const near = pts.reduce((a, p) => Math.abs(p[0] - m.ts) < Math.abs(a[0] - m.ts) ? p : a, pts[0]);
    x.fillStyle = m.kind === "bought" ? C.c : m.kind === "sold" ? C.g : C.r; x.beginPath(); x.arc(X(m.ts), Y(near[1]), 4, 0, 7); x.fill();
  }
  x.fillStyle = C.dim; x.font = "15px VT323, monospace"; x.textAlign = "left";
  x.fillText(hms(t0).slice(0, 5) + " ET", 6, h - 5); x.textAlign = "right"; x.fillText("now", w - 6, h - 5);
  x.fillText(usd(hi), w - 6, 14); x.fillText(usd(lo), w - 6, h - pad + 4);
}

// ---------- coin + positions
function candles(cv, k) {
  const [x, w, h] = fit(cv); x.clearRect(0, 0, w, h);
  const lo = Math.min(...k.map(c => c[3])), hi = Math.max(...k.map(c => c[2])) || lo * 1.01, n = k.length, bw = w / n;
  const Y = v => 10 + (h - 30) * (1 - (v - lo) / ((hi - lo) || hi * .01 || 1));
  k.forEach((c, i) => {
    const up = c[4] >= c[1], col = up ? C.g : C.r, cx = i * bw + bw / 2;
    x.strokeStyle = col; x.fillStyle = col; x.beginPath(); x.moveTo(cx, Y(c[2])); x.lineTo(cx, Y(c[3])); x.stroke();
    const y1 = Y(Math.max(c[1], c[4])), y2 = Y(Math.min(c[1], c[4])); x.fillRect(cx - Math.max(1, bw * .3), y1, Math.max(2, bw * .6), Math.max(1, y2 - y1));
  });
  x.fillStyle = C.dim; x.font = "15px VT323, monospace"; x.textAlign = "right"; x.fillText(price(hi), w - 4, 14); x.fillText(price(lo), w - 4, h - 6);
}
function coin(d) {
  const c = d.coin, wrap = $("#coinwrap");
  if (!c) { $("#coinlabel").textContent = "COIN"; $("#coinlink").textContent = ""; if (D.coinMint !== "") { wrap.innerHTML = `<div class="empty">waiting for a coin to watch</div>`; D.coinMint = ""; } }
  else {
    const name = c.symbol || c.name || c.mint.slice(0, 6);
    const p = c.position;
    $("#coinlabel").innerHTML = `${p ? "OPEN · " : "LAST WATCHED · "}${esc(name)} <span class="dim">${price(c.price)}${c.stats && c.stats.liq != null ? " · liq " + kusd(c.stats.liq) : ""}</span>`;
    const a = $("#coinlink"); a.textContent = "DexScreener ›"; a.href = c.dex_url || c.coin_url;
    const own = (c.candles || []).length >= 8;
    const key = c.mint + (own ? ":own" : ":dex");
    if (D.coinMint !== key) {
      D.coinMint = key;
      wrap.innerHTML = own ? `<canvas id="cc"></canvas>` :
        `<iframe title="DexScreener chart" loading="lazy" referrerpolicy="no-referrer" src="https://dexscreener.com/solana/${encodeURIComponent(c.mint)}?embed=1&theme=dark&trades=0&info=0"></iframe>`;
    }
    if (own) candles($("#cc"), c.candles);
  }
  const ps = d.positions || [];
  $("#poscount").textContent = ps.length + " open · " + (d.closed_today || 0) + " closed today";
  $("#positions").innerHTML = ps.length ? `<table><tr><th>COIN</th><th>SIZE</th><th>ENTRY</th><th>LAST</th><th>P&amp;L</th><th>STOP</th></tr>${ps.map(p =>
    `<tr><td><a href="${esc(p.coin_url)}" target="_blank" rel="noopener">${esc(p.coin)}</a> <span class="dim">${esc(p.mode)}</span></td><td>${usd(p.size_usd)}</td><td>${price(p.entry_price)}</td><td>${price(p.last_price)}</td>
     <td class="${p.pnl_pct >= 0 ? "up" : "down"}">${pct(p.pnl_pct)}</td><td class="down">${price(p.exit_line)}</td></tr>`).join("")}</table>`
    : `<div class="empty">no open positions · waiting for first trade</div>`;
}

// ---------- terminal
const TQ = []; let typing = false;
function termLine(ev, instant) {
  const t = $("#term"), l = document.createElement("div"); l.className = "l";
  const head = `<span class="t">[${hms(ev.ts)}]</span> <span class="a">${(ev.from + "        ").slice(0, 9)}</span>` +
               (ev.src ? ` <span class="src ${ev.src.toLowerCase()}">[${esc(ev.src)}]</span>` : "");
  const tag = `<span class="${ev.tone}">${esc(ev.src ? ev.tag.replace(" " + ev.src, "") : ev.tag)}</span>`;
  const body = (ev.coin ? ev.coin + " · " : "") + ev.text + (ev.to ? "  → " + ev.to : "");
  const link = ev.url ? ` <a class="lnk" href="${esc(ev.url)}" target="_blank" rel="noopener">[tx]</a>` : "";
  l.innerHTML = head + " " + tag + " <span class=\"body\"></span>";
  const stick = t.scrollHeight - t.scrollTop - t.clientHeight < 40;
  t.appendChild(l);
  while (t.children.length > 300) t.firstChild.remove();
  const span = l.querySelector(".body");
  if (instant || RM) { span.textContent = body; span.insertAdjacentHTML("afterend", link); if (stick) t.scrollTop = t.scrollHeight; return Promise.resolve(); }
  return new Promise(res => {
    let i = 0; span.classList.add("cur");
    const step = () => {
      i += Math.max(1, Math.round(body.length / 40)); span.textContent = body.slice(0, i);
      if (stick) t.scrollTop = t.scrollHeight;
      if (i < body.length) setTimeout(step, 18); else { span.classList.remove("cur"); span.insertAdjacentHTML("afterend", link); res(); }
    };
    step();
  });
}
async function typeLoop() {
  if (typing) return; typing = true;
  while (TQ.length) await termLine(TQ.shift(), TQ.length > 20);
  typing = false;
}
function idleCursor() {
  const t = $("#term"); let c = $("#idle");
  if (!c) { c = document.createElement("div"); c.id = "idle"; c.className = "l cur dim"; }
  t.appendChild(c);
}

// ---------- poll
async function poll() {
  if (!DP) { window.dispatchEvent(new CustomEvent("deskerr", { detail: "nolink" })); $("#err").hidden = false; $("#err").textContent = "No data link yet. Open the dashboard once with the private link from Telegram (it ends in #d=…)."; return; }
  try {
    const d = await Feed.get(DP, "dash.json"); D.lastPoll = Date.now();
    if (D.data && d.updated_at !== D.data.updated_at) uplinkPulse();
    D.data = d; D.lastOk = Date.now(); $("#err").hidden = true;
    window.dispatchEvent(new CustomEvent("deskdata", { detail: d }));
    const badge = $("#mode"); badge.textContent = d.mode + (d.exec ? " · " + d.exec.toUpperCase() : ""); badge.className = "badge" + (d.mode === "LIVE" ? " live" : "");
    cards(d); balance(d); coin(d); overlays(d);
    const fresh = (d.events || []).filter(e => !D.seen.has(e.id));
    fresh.forEach(e => D.seen.add(e.id));
    if (D.first) {
      D.first = false;
      const hist = d.events || [];
      if (!hist.length) { const t = $("#term"); t.innerHTML = `<div class="l dim">$ python terminal.py --follow</div><div class="l dim">waiting for first event…</div>`; }
      else { $("#term").innerHTML = `<div class="l dim">$ python terminal.py --follow</div>`; hist.slice(-60).forEach(e => termLine(e, true)); }
      const lastBy = {}; hist.forEach(e => lastBy[botOf(e.from)] = e);
      setTimeout(() => Object.values(lastBy).forEach(bubble), 400);
      D.queue.push(...hist.slice(-3));
    } else if (fresh.length) {
      $("#idle")?.remove();
      D.queue.push(...fresh.slice(-25)); TQ.push(...fresh); typeLoop().then(idleCursor);
    }
    if (!$("#idle")) idleCursor();
    $("#termcount").textContent = (d.events || []).length + " events · last 6h";
    const flowN = (d.events || []).filter(e => e.ts > Date.now() / 1000 - 3600).length;
    $("#flowinfo").textContent = flowN + " / last hr";
    const w = d.wallet || {};
    $("#foot").textContent = `bot wallet ${w.address || "n/a"} · updated ${hms(d.updated_at)} ET · ${Feed.remote ? "public feed every 15s" : "feed every 3s"}`;
  } catch (e) {
    $("#err").hidden = false; $("#err").textContent = "Can't reach the desk feed (" + e.message + "). Retrying.";
    window.dispatchEvent(new CustomEvent("deskerr", { detail: e.message }));
  }
}
gInit();
setInterval(tick, 1000); tick();
poll(); setInterval(poll, POLL);
addEventListener("resize", () => D.data && (balance(D.data), cards(D.data), overlays(D.data)));
requestAnimationFrame(frame);
