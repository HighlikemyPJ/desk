// HIGHLIKEMYPJ DESK live dashboard. Polls dash.json via feed.js every 3s (local) or per 15s snapshot (GitHub Pages). Real rows only; empty states when there are none.
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const POLL = 3000;
(function () {
  const m = location.hash.match(/^#d=([A-Za-z0-9_-]{32,})/);
  if (m) { localStorage.setItem("dataPath", m[1]); history.replaceState(null, "", location.pathname); }
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

// ---------- agent cards
function spark(cv, arr, color) {
  const [x, w, h] = fit(cv); x.clearRect(0, 0, w, h);
  const max = Math.max(1, ...arr), n = arr.length, bw = w / n;
  arr.forEach((v, i) => {
    const bh = v ? Math.max(2, (h - 2) * v / max) : 1;
    x.fillStyle = v ? color : "#2a1630"; x.globalAlpha = v ? 0.9 : 1;
    x.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
  });
  x.globalAlpha = 1;
}
function cards(d) {
  const order = ["scanner", "auditor", "analyst", "executor", "risk", "telegram"];
  const el = $("#cards");
  if (!el.children.length) el.innerHTML = order.map(a => `<div class="card" id="c-${a}"><div class="h"><b><span class="dot"></span>${NAMES[a]}</b><span class="st"></span></div>
      <div><span class="n"></span> <span class="u"></span></div><canvas></canvas><div class="sub2"></div><div class="q"></div></div>`).join("");
  for (const a of order) {
    const g = d.agents[a], c = $("#c-" + a);
    if (!g) continue;
    c.querySelector(".dot").className = "dot " + g.status;
    c.querySelector(".st").textContent = g.status === "running" ? "♥ " + ago(g.beat).replace(" ago", "") : g.status;
    const n = c.querySelector(".n"); n.textContent = g.count; n.classList.toggle("zero", !g.count);
    c.querySelector(".u").textContent = g.unit.replace(/ today$/, "") + " today";
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
    spark(c.querySelector("canvas"), g.spark, g.status === "down" ? C.r : C.g);
  }
}

// ---------- force-style node graph
const G = { nodes: {}, edges: [["scanner", "auditor"], ["auditor", "analyst"], ["analyst", "executor"], ["executor", "risk"], ["executor", "wallet"],
  ["risk", "wallet"], ["wallet", "telegram"], ["risk", "telegram"], ["executor", "telegram"], ["scanner", "telegram"]], w: 0, h: 0, flash: {} };
const ANCHOR = { scanner: [.09, .5], auditor: [.27, .26], analyst: [.45, .55], executor: [.62, .3], risk: [.8, .55], wallet: [.62, .8], telegram: [.9, .2] };
const ANCHOR_M = { scanner: [.2, .1], auditor: [.72, .16], analyst: [.3, .38], executor: [.75, .5], risk: [.28, .66], wallet: [.75, .84], telegram: [.25, .9] };
function gInit() {
  for (const k of Object.keys(ANCHOR)) G.nodes[k] = { x: 0, y: 0, vx: 0, vy: 0, init: false };
}
function anchorOf(k) { const a = (G.w < 560 ? ANCHOR_M : ANCHOR)[k]; return [a[0] * G.w, a[1] * G.h]; }
function physics(dt) {
  const ks = Object.keys(G.nodes), t = performance.now() / 1000;
  for (const k of ks) { const n = G.nodes[k]; if (!n.init) { [n.x, n.y] = anchorOf(k); n.init = true; } }
  for (const k of ks) {
    const n = G.nodes[k], [ax, ay] = anchorOf(k);
    let fx = (ax - n.x) * 2.2, fy = (ay - n.y) * 2.2;
    for (const j of ks) if (j !== k) {
      const m = G.nodes[j], dx = n.x - m.x, dy = n.y - m.y, d2 = Math.max(400, dx * dx + dy * dy);
      fx += 9000 * dx / d2; fy += 9000 * dy / d2;
    }
    for (const [a, b] of G.edges) if (a === k || b === k) {
      const m = G.nodes[a === k ? b : a], dx = m.x - n.x, dy = m.y - n.y, d = Math.hypot(dx, dy) || 1, L = Math.min(G.w, G.h) * .42;
      fx += (d - L) * .25 * dx / d; fy += (d - L) * .25 * dy / d;
    }
    if (!RM) { const s = k.length * 1.7; fx += Math.sin(t * .7 + s) * 14; fy += Math.cos(t * .5 + s * 1.3) * 14; }
    n.vx = (n.vx + fx * dt) * .86; n.vy = (n.vy + fy * dt) * .86;
    n.x += n.vx * dt; n.y += n.vy * dt;
    n.x = Math.min(G.w - 55, Math.max(55, n.x)); n.y = Math.min(G.h - 42, Math.max(30, n.y));
  }
}
function nodeColor(k) {
  const d = D.data; if (!d) return C.dim;
  if (k === "wallet") return d.wallet && d.wallet.halted ? C.r : C.g;
  const g = d.agents[k]; return !g ? C.dim : g.status === "running" ? C.g : g.status === "paused" ? C.y : C.r;
}
function drawGraph(now) {
  const cv = $("#graph"), [x, w, h] = fit(cv); G.w = w; G.h = h;
  x.clearRect(0, 0, w, h);
  x.strokeStyle = "rgba(255,0,255,.06)"; x.lineWidth = 1;
  for (let i = 0; i < w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
  for (let i = 0; i < h; i += 32) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
  for (const [a, b] of G.edges) {
    const A = G.nodes[a], B = G.nodes[b]; x.strokeStyle = "rgba(255,0,255,.45)"; x.lineWidth = 1.2;
    x.setLineDash([4, 5]); x.beginPath(); x.moveTo(A.x, A.y); x.lineTo(B.x, B.y); x.stroke(); x.setLineDash([]);
  }
  for (const an of D.anims) {
    const p = Math.min(1, (now - an.t0) / an.dur), A = G.nodes[an.from];
    let tx, ty;
    if (an.to && G.nodes[an.to]) { tx = G.nodes[an.to].x; ty = G.nodes[an.to].y; } else { tx = A.x + an.kx; ty = A.y + an.ky; }
    const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2, px = A.x + (tx - A.x) * e, py = A.y + (ty - A.y) * e;
    const col = an.to ? C.c : C.r;
    x.strokeStyle = col; x.globalAlpha = .35; x.lineWidth = 2; x.beginPath(); x.moveTo(A.x + (tx - A.x) * Math.max(0, e - .18), A.y + (ty - A.y) * Math.max(0, e - .18)); x.lineTo(px, py); x.stroke();
    x.globalAlpha = an.to ? 1 : 1 - p * .8; x.fillStyle = col; x.shadowColor = col; x.shadowBlur = 14;
    x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill(); x.shadowBlur = 0; x.globalAlpha = 1;
    if (!an.to && p >= 1 && !an.x) { an.x = 1; }
    if (p >= 1 && an.to && !an.hit) { an.hit = 1; G.flash[an.to] = now; }
  }
  D.anims = D.anims.filter(a => now - a.t0 < a.dur + 50);
  for (const [k, n] of Object.entries(G.nodes)) {
    const col = nodeColor(k), fl = G.flash[k] && now - G.flash[k] < 700 ? 1 - (now - G.flash[k]) / 700 : 0;
    const r = 13 + fl * 6;
    x.fillStyle = "#050505"; x.strokeStyle = col; x.lineWidth = 2; x.shadowColor = col; x.shadowBlur = 10 + fl * 20;
    x.beginPath(); x.arc(n.x, n.y, r, 0, 7); x.fill(); x.stroke(); x.shadowBlur = 0;
    x.fillStyle = col; x.beginPath(); x.arc(n.x, n.y, 4, 0, 7); x.fill();
    x.fillStyle = "#fff"; x.font = "17px VT323, monospace"; x.textAlign = "center";
    x.fillText(k === "telegram" ? "TELEGRAM" : NAMES[k], n.x, n.y + r + 15);
    const g = D.data && D.data.agents[k];
    if (g) { x.fillStyle = C.dim; x.font = "15px VT323, monospace"; x.fillText(g.count + " " + g.unit.replace(/ today$/, ""), n.x, n.y + r + 29); }
    if (k === "wallet" && D.data && D.data.wallet && D.data.wallet.sol != null) { x.fillStyle = C.dim; x.font = "15px VT323, monospace"; x.fillText(D.data.wallet.sol.toFixed(3) + " SOL", n.x, n.y + r + 29); }
  }
}
function placeBubbles() {
  document.querySelectorAll("#bubbles .bubble").forEach(b => { const n = G.nodes[b.dataset.from]; if (!n) return;
    const half = Math.min(130, b.offsetWidth / 2 + 2); b.style.left = Math.min(G.w - half, Math.max(half, n.x)) + "px"; b.style.top = Math.max(n.y - 18, b.offsetHeight + 4) + "px"; });
}
function bubble(ev) {
  const n = G.nodes[ev.from]; if (!n) return;
  const b = document.createElement("div");
  b.className = "bubble " + (ev.tone === "bad" ? "bad" : ev.tone === "good" ? "good" : "");
  b.innerHTML = `<b>${esc(ev.tag)}</b>${esc(ev.coin ? ev.coin + " · " : "")}${esc(ev.text)}`;
  b.style.left = Math.min(G.w - 90, Math.max(90, n.x)) + "px"; b.style.top = (n.y - 20) + "px";
  const box = $("#bubbles"); box.querySelectorAll(".bubble").forEach(o => { if (o.dataset.from === ev.from) o.remove(); });
  b.dataset.from = ev.from; box.appendChild(b);
  b.dataset.ev = ev.id; setTimeout(() => { if (b.isConnected) b.style.opacity = .55; }, 6000);
}
let qTimer = 0;
function pump(now) {
  if (!D.queue.length || now < qTimer) return;
  const ev = D.queue.shift();
  const ang = Math.random() * Math.PI * 2;
  D.anims.push({ from: ev.from, to: ev.to, t0: now, dur: 1300, kx: Math.cos(ang) * 70, ky: Math.sin(ang) * 50 });
  bubble(ev);
  qTimer = now + Math.max(250, 1400 - D.queue.length * 120);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (G.w) physics(dt);
  pump(now); drawGraph(now); placeBubbles();
  requestAnimationFrame(frame);
}

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
  const head = `<span class="t">[${hms(ev.ts)}]</span> <span class="a">${(ev.from + "        ").slice(0, 9)}</span>`;
  const tag = `<span class="${ev.tone}">${esc(ev.tag)}</span>`;
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
  if (!DP) { $("#err").hidden = false; $("#err").textContent = "No data link yet. Open the dashboard once with the private link from Telegram (it ends in #d=…)."; return; }
  try {
    const d = await Feed.get(DP, "dash.json");
    D.data = d; D.lastOk = Date.now(); $("#err").hidden = true;
    const badge = $("#mode"); badge.textContent = d.mode + (d.exec ? " · " + d.exec.toUpperCase() : ""); badge.className = "badge" + (d.mode === "LIVE" ? " live" : "");
    cards(d); balance(d); coin(d);
    const fresh = (d.events || []).filter(e => !D.seen.has(e.id));
    fresh.forEach(e => D.seen.add(e.id));
    if (D.first) {
      D.first = false;
      const hist = d.events || [];
      if (!hist.length) { const t = $("#term"); t.innerHTML = `<div class="l dim">$ python terminal.py --follow</div><div class="l dim">waiting for first event…</div>`; }
      else { $("#term").innerHTML = `<div class="l dim">$ python terminal.py --follow</div>`; hist.slice(-60).forEach(e => termLine(e, true)); }
      const lastBy = {}; hist.forEach(e => lastBy[e.from] = e);
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
  }
}
gInit();
setInterval(tick, 1000); tick();
poll(); setInterval(poll, POLL);
addEventListener("resize", () => D.data && (balance(D.data), cards(D.data)));
requestAnimationFrame(frame);
