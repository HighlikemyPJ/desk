// Dashboard v3: iOS-style app view (default). Reads the same dash.json that dash.js polls (local every 3s / public 15s snapshots,
// decrypted in the browser by feed.js) via the "deskdata" event. Candles for the open coin view come straight from GeckoTerminal
// (public, CORS *), polled only while that view is open; fallback is the desk's own DexScreener price samples. Real rows only.
"use strict";
(() => {
  const TZN = "America/New_York";
  const G = "#00E676", R = "#FF4D5E", O = "#FF9F0A", B = "#3D8BFF";
  const RED_M = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TFS = ["LIVE", "1H", "4H", "1D", "1W", "ALL"];
  const COIN_POLL = 20000;
  const A = { d: null, app: null, tf: localStorage.getItem("m_tf") || "1D", seen: new Set(), first: true, cards: {}, open: null, cdata: null,
              chart: null, series: null, lines: {}, ctimer: null, csrc: "", lastCandles: 0, stopShown: null, peakSeen: null,
              cel: new Set(JSON.parse(localStorage.getItem("m_cel") || "[]")), coinCache: {} };
  if (!TFS.includes(A.tf)) A.tf = "1D";
  const q = s => document.querySelector(s);
  const h = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v, sign) => v == null ? "–" : (sign ? (v > 0 ? "+" : v < 0 ? "-" : "") : v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const kmoney = v => v == null ? "–" : v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + Math.round(v);
  const pc = (v, d = 1) => v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(d) + "%";
  const knum = v => v == null ? "–" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(v);
  const age = ts => { if (!ts) return "–"; const s = Math.max(0, Date.now() / 1000 - ts); return s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s / 60) + "m" : s < 172800 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; };
  const SRC = s => ({ momentum: "MOM", bluechip: "BLU", volspike: "VOL", sniper: "SNP", copy: "CPY", whale: "WHL" })[s] || "MIG";
  // one colored badge per bot, used on the P&L-by-bot table and on every trade row (t81)
  const BOTN = { momentum: "Momentum", migration: "Migration", bluechip: "Bluechip", volspike: "Volspike", sniper: "Sniper", copy: "Copy", whale: "Big Whale", unknown: "Unknown" };
  const BOTK = b => BOTN[b] ? b : b ? "migration" : "unknown";
  const BB = (b, full) => { const k = BOTK(b); return `<span class="bb b-${k}">${full ? BOTN[k] : k === "unknown" ? "UNK" : SRC(k)}</span>`; };
  const hm = ts => new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZN });
  function pxHtml(p) {               // $0.0₃2468 style for tiny memecoin prices
    if (p == null) return "–";
    if (p >= 1) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 4 });
    if (p >= 0.001) return "$" + p.toPrecision(4);
    const s = p.toFixed(14).slice(2), z = s.match(/^0*/)[0].length;
    return `$0.0<sub>${z}</sub>${s.slice(z, z + 4).replace(/0+$/, "") || "0"}`;
  }
  const PALETTE = ["#FF6B6B", "#4D96FF", "#6BCB77", "#FFB347", "#C77DFF", "#00C2D1", "#FF8FAB", "#B8E986"];
  function logo(img, sym, cls = "") {
    const s = String(sym || "?"), col = PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
    const ok = img && /^https:\/\//.test(img);
    return `<span class="mlogo ${cls}" style="background:${col};position:relative">${h(s.replace(/^\$/, "")[0] || "?").toUpperCase()}${ok ? `<img src="${h(img)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : ""}</span>`;
  }
  const ICON = {
    scanner: '<svg viewBox="0 0 24 24" fill="none" stroke="#00E676" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12 L19 6"/></svg>',
    auditor: '<svg viewBox="0 0 24 24" fill="none" stroke="#3D8BFF" stroke-width="2"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    analyst: '<svg viewBox="0 0 24 24" fill="none" stroke="#C77DFF" stroke-width="2"><path d="M4 19V5M4 19h16"/><path d="m7 15 4-4 3 3 5-6"/></svg>',
    executor: '<svg viewBox="0 0 24 24" fill="none" stroke="#FFB347" stroke-width="2"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    risk: '<svg viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" stroke-width="2"><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18v.01"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="#2EE6C9" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    whale: '<svg viewBox="0 0 24 24" fill="none" stroke="#4FA3FF" stroke-width="2"><path d="M3 13c0 4 4 6 9 6 4 0 7-2 8-5l2-3-3 1c-1-3-4-5-8-5-5 0-8 3-8 6z"/><path d="M16 5c0-1 1-2 2-2M18 5c1-1 2-1 3 0"/><circle cx="8" cy="12" r=".8" fill="#4FA3FF"/></svg>',
  };
  const up = '<svg width="12" height="12" viewBox="0 0 12 12" style="vertical-align:-1px"><path d="M6 1 11 9H1z" fill="currentColor"/></svg>';
  const down = '<svg width="12" height="12" viewBox="0 0 12 12" style="vertical-align:-1px"><path d="M6 11 1 3h10z" fill="currentColor"/></svg>';

  // ---------- views
  function setView(v) {
    document.body.classList.toggle("v-app", v === "app");
    document.body.classList.toggle("v-floor", v === "floor");
    document.querySelectorAll(".mtabs button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
    if (v === "floor") { closeCoin(); setTimeout(() => dispatchEvent(new Event("resize")), 30); }
  }
  document.querySelectorAll(".mtabs button").forEach(b => b.onclick = () => { setView(b.dataset.v); history.replaceState(null, "", location.pathname + location.search + (window.deskHash ? window.deskHash(b.dataset.v === "floor") : (b.dataset.v === "floor" ? "#floor" : ""))); });
  setView(/(^#|&)floor\b/.test(location.hash) ? "floor" : "app");

  // ---------- balance with odometer cents
  function renderBal(v) {
    const el = q("#mbal");
    if (v == null) { el.textContent = "$–"; return; }
    if (!el.querySelector(".cents")) {
      const col = () => `<span class="odo"><span>${[...Array(10).keys()].map(i => `<i>${i}</i>`).join("")}</span></span>`;
      el.innerHTML = `<span class="dol"></span><span class="cents">.${col()}${col()}</span>`;
    }
    const s = Math.abs(v).toFixed(2), [d, c] = s.split(".");
    el.querySelector(".dol").textContent = (v < 0 ? "-$" : "$") + Number(d).toLocaleString("en-US");
    el.querySelectorAll(".odo > span").forEach((sp, i) => sp.style.transform = `translateY(${-1.08 * Number(c[i])}em)`);
  }

  // ---------- equity chart
  const EQ = { pts: [], marks: [], color: G, w: 0, h: 0, xy: null };
  function eqData() {
    const a = A.app; if (!a) return;
    const pts = (a.ranges[A.tf] || []).filter(p => p[1] != null);
    EQ.pts = pts; EQ.marks = (a.marks || []).filter(m => (m.kind === "sold" || m.kind === "stopped") && pts.length && m.ts >= pts[0][0]);
    const first = pts.length ? pts[0][1] : null, last = pts.length ? pts[pts.length - 1][1] : null;
    EQ.color = last != null && first != null && last < first ? R : G;
    q("#mchartempty").hidden = pts.length >= 2;
    layoutMarks();
  }
  function scale() {
    const cv = q("#mcv"), r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    EQ.w = r.width; EQ.h = r.height; EQ.dpr = dpr;
    const P = EQ.pts; if (P.length < 2) { EQ.xy = null; return; }
    const t0 = P[0][0], t1 = P[P.length - 1][0] || t0 + 1;
    let lo = Math.min(...P.map(p => p[1])), hi = Math.max(...P.map(p => p[1]));
    if (hi - lo < Math.max(0.02 * hi, 0.5)) { const m = (hi + lo) / 2, sp = Math.max(0.01 * hi, 0.25); lo = m - sp; hi = m + sp; }
    const top = 34, bot = 12;
    const X = t => 8 + (EQ.w - 24) * (t - t0) / Math.max(1, t1 - t0), Y = v => top + (EQ.h - top - bot) * (1 - (v - lo) / (hi - lo));
    EQ.xy = { X, Y, t0, t1 };
  }
  function valAt(ts) { const P = EQ.pts; for (let i = 1; i < P.length; i++) if (P[i][0] >= ts) return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * ((ts - P[i - 1][0]) / Math.max(1, P[i][0] - P[i - 1][0])); return P.length ? P[P.length - 1][1] : 0; }
  function layoutMarks() {
    scale(); const box = q("#mmarks"); box.innerHTML = ""; if (!EQ.xy) return;
    const { X, Y } = EQ.xy;
    EQ.marks.slice(-6).forEach((m, i) => {
      const x = Math.min(EQ.w - 40, Math.max(40, X(m.ts))), y = Y(valAt(m.ts));
      const amt = (m.text.match(/[+-]?\$[\d,.]+/) || [""])[0];
      if (m.kind === "sold") {
        box.insertAdjacentHTML("beforeend", `<span class="mpill win" style="left:${x}px;top:${y - 8}px">${h(amt.startsWith("-") ? amt : "+" + amt.replace(/^\+/, ""))}</span>`);
      } else {
        const p = (m.text.match(/-?\d+(\.\d+)?%/) || ["-8%"])[0], py = Math.max(22, y - 34 - (i % 2) * 14);
        box.insertAdjacentHTML("beforeend", `<span class="mlead" style="left:${x}px;top:${py}px;height:${Math.max(4, y - py)}px"></span><span class="mpill loss" style="left:${x}px;top:${py}px">${h(p)} → ${h(amt.replace(/^\+/, "-").replace(/^\$/, "-$"))}</span>`);
      }
    });
  }
  function drawEq(now) {
    const cv = q("#mcv"); if (!cv || document.body.classList.contains("v-floor")) return;
    const x = cv.getContext("2d"); x.setTransform(EQ.dpr || 1, 0, 0, EQ.dpr || 1, 0, 0); x.clearRect(0, 0, EQ.w, EQ.h);
    if (!EQ.xy) return;
    const { X, Y } = EQ.xy, P = EQ.pts.map(p => [X(p[0]), Y(p[1])]);
    const path = () => { x.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) { const [x0, y0] = P[i - 1], [x1, y1] = P[i], mx = (x0 + x1) / 2; x.bezierCurveTo(mx, y0, mx, y1, x1, y1); } };
    const g = x.createLinearGradient(0, 0, 0, EQ.h); g.addColorStop(0, EQ.color + "40"); g.addColorStop(1, EQ.color + "00");
    x.beginPath(); path(); x.lineTo(P[P.length - 1][0], EQ.h); x.lineTo(P[0][0], EQ.h); x.closePath(); x.fillStyle = g; x.fill();
    x.beginPath(); path(); x.strokeStyle = EQ.color; x.lineWidth = 2.4; x.lineJoin = "round"; x.shadowColor = EQ.color; x.shadowBlur = 8; x.stroke(); x.shadowBlur = 0;
    EQ.marks.forEach(m => { const mx = X(m.ts), my = Y(valAt(m.ts)); x.beginPath(); x.arc(mx, my, 3.5, 0, 7); x.fillStyle = m.kind === "sold" ? G : R; x.fill(); });
    const [lx, ly] = P[P.length - 1], ph = RED_M ? 0 : (now % 1600) / 1600;
    x.beginPath(); x.arc(lx, ly, 5 + 12 * ph, 0, 7); x.fillStyle = EQ.color + Math.round(90 * (1 - ph)).toString(16).padStart(2, "0"); x.fill();
    x.beginPath(); x.arc(lx, ly, 5, 0, 7); x.fillStyle = EQ.color; x.fill(); x.lineWidth = 2; x.strokeStyle = "#000"; x.stroke();
  }
  function tfButtons() {
    q("#mtf").innerHTML = TFS.map(t => `<button data-t="${t}" class="${t === A.tf ? "on" : ""} ${t === "LIVE" ? "live" : ""}">${t}</button>`).join("");
    q("#mtf").querySelectorAll("button").forEach(b => b.onclick = () => { A.tf = b.dataset.t; localStorage.setItem("m_tf", A.tf); tfButtons(); eqData(); hero(); });
  }
  function hero() {
    const d = A.d, a = A.app; if (!d || !a) return;
    const live = d.mode === "LIVE", bal = live ? (d.wallet || {}).usd : d.balance;
    q("#mballabel").textContent = live ? "Wallet (live)" : "Paper equity";
    renderBal(bal);
    const P = a.ranges[A.tf] || [], first = P.length ? P[0][1] : null;
    if (bal != null && first) {
      const dv = d.balance - first, dp = 100 * dv / first;
      q("#mpnl").innerHTML = `<span class="${dv >= 0 ? "mgreen" : "mred"}">${dv >= 0 ? up : down} ${money(Math.abs(dv))} (${Math.abs(dp).toFixed(2)}%)</span> <span class="mgray" style="font-weight:500;font-size:13px">${A.tf === "LIVE" ? "last 15m" : A.tf === "ALL" ? "all time" : "past " + A.tf}</span>`;
    } else q("#mpnl").innerHTML = '<span class="mgray">no history yet</span>';
    const mm = q("#mmult");
    if (a.mult) {
      mm.hidden = false; mm.textContent = a.mult.toFixed(2) + "x"; mm.classList.toggle("down", a.mult < 1);
      if (A.peakSeen != null && d.balance > A.peakSeen + 0.005 && d.balance >= a.peak - 0.005) { mm.classList.remove("pulse"); void mm.offsetWidth; mm.classList.add("pulse"); }
      A.peakSeen = Math.max(A.peakSeen ?? 0, d.balance);
    }
  }

  // ---------- agents carousel
  function ring(score, ok, tone) {
    const r = 27, C = 2 * Math.PI * r, col = tone === "bad" ? R : tone === "good" ? G : "#8E8E93";
    return `<div class="ring ${ok ? "ok" : ""}"><svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="${r}"/><circle class="fg" cx="32" cy="32" r="${r}" stroke="${col}" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-to="${C * (1 - Math.max(0, Math.min(100, score)) / 100)}"/></svg><span class="n" data-n="${score}">0</span></div>`;
  }
  function animRings(el) {
    requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll(".ring .fg").forEach(c => c.style.strokeDashoffset = c.dataset.to)));
    el.querySelectorAll(".ring .n").forEach(n => {
      const to = +n.dataset.n, t0 = performance.now();
      const step = t => { const k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3); n.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(step); };
      RED_M ? (n.textContent = to) : requestAnimationFrame(step);
    });
  }
  function card(id, sig, html) {
    let el = A.cards[id];
    if (!el) { el = document.createElement("div"); el.className = "mag"; q("#mcar").appendChild(el); A.cards[id] = el; }
    if (el.dataset.sig === sig) return el;
    el.dataset.sig = sig; el.innerHTML = html;
    if (/class="ring/.test(html)) animRings(el);
    return el;
  }
  function agents() {
    const a = A.app.agents, d = A.d;
    q("#mrunning").textContent = (A.app.running ?? 0) + " running";
    const sc = a.scanner, pools = sc.pools || [];
    const prow = p => `<div class="pool"><b>${h(p.coin)}</b><span class="mgray">${age(p.created)}</span><span>${kmoney(p.liq)}</span>${BB(p.source)}${p.pass ? '<span class="mgreen">✓</span>' : ""}</div>`;
    const list = pools.map(prow).join("");
    card("scanner", "s" + pools.map(p => p.mint).join() + sc.n,
      `<h4>${ICON.scanner}Scanner</h4><div class="radar"></div><div class="big">+${sc.n} pools</div><div class="sm">tonight · mig ${sc.mig} / mom ${sc.mom}${sc.blu ? ` / blu ${sc.blu}` : ""}${sc.vol ? ` / vol ${sc.vol}` : ""}${sc.snp ? ` / snp ${sc.snp}` : ""}${sc.cpy ? ` / copy ${sc.cpy}` : ""}</div>` +
      (pools.length ? `<div class="pools"><div class="roll ${pools.length < 4 ? "still" : ""}">${list}${pools.length >= 4 ? list : ""}</div></div>` : `<div class="empty">waiting for pools</div>`));
    const au = a.auditor;
    card("auditor", "a" + JSON.stringify(au),
      `<h4>${ICON.auditor}Auditor</h4>` + (au ? `<div class="ringrow">${ring(au.score, au.ok, au.ok ? "good" : au.reason ? "bad" : "")}<div style="min-width:0"><div class="verd ${au.ok ? "mgreen" : au.reason ? "mred" : ""}">${h(au.coin)} ${au.ok ? "passed" : au.reason ? "killed" : "checking…"}</div><div class="why">${au.passed}/8 checks${au.reason ? " · " + h(au.reason) : ""}</div><div class="sm">${age(au.ts)} ago</div></div></div>` : `<div class="empty">waiting for a coin to pass the scanner</div>`));
    const an = a.analyst;
    card("analyst", "n" + JSON.stringify(an),
      `<h4>${ICON.analyst}Analyst</h4>` + (an ? `<div class="ringrow">${ring(an.score, an.ok, an.ok ? "good" : "bad")}<div style="min-width:0"><div class="verd ${an.ok ? "mgreen" : "mred"}">${h(an.coin)} ${an.ok ? "passed" : "killed"}</div><div class="why">needs ${a.analyst_min} · ${h(an.reason || "")}</div><div class="sm">${age(an.ts)} ago</div></div></div>` : `<div class="empty">waiting for a coin to pass audit</div>`));
    const ex = a.executor, el = ex.last;
    const running = el && !el.filled_s && Date.now() / 1000 - el.ts < 30 && ["sent", "bought", "pending"].includes(el.status);
    card("executor", "e" + JSON.stringify(ex) + running,
      `<h4>${ICON.executor}Executor</h4><div class="big">${ex.n} trade${ex.n === 1 ? "" : "s"}</div>` +
      (el ? `<div class="sm">${h(el.coin)} · ${money(el.size_usd)} · ${(+el.stack_pct || 0).toFixed(0)}% of stack</div><div class="sm ${running ? "" : el.filled_s != null ? "mgreen" : ""}">${running ? "Executing…" : el.filled_s != null ? `Filled · ${Math.max(0, el.filled_s).toFixed(0)}s` : h(el.status || "")}</div><div class="bar ${running ? "run" : ""}"><i style="width:${running ? "" : el.filled_s != null ? "100%" : "30%"}"></i></div>`
          : `<div class="sm">ticket ${h(String(d.exec || ""))}</div><div class="empty">waiting for first trade</div>`));
    const rk = a.risk;
    card("risk", "r" + JSON.stringify(rk),
      `<h4>${ICON.risk}Risk</h4><div class="big" style="display:flex;align-items:center;gap:8px"><span class="blink ${rk.trailing ? "" : rk.n ? "" : "off"}" style="${rk.trailing ? "" : rk.n ? "background:#00E676" : ""}"></span>${rk.trailing ? "trailing" : rk.n ? "guarding" : "idle"}</div>` +
      `<div class="sm">${rk.n} guarding · ${rk.hard_stop === false ? `signal exits · floor -${rk.stop_pct}%` : `stop -${rk.stop_pct}%`}${rk.trailing ? ` · ${rk.trailing} trailing` : ""}</div>` +
      `<div class="sm">${rk.coins.map(c => `${h(c.coin)} <span class="${c.pnl_pct >= 0 ? "mgreen" : "mred"}">${pc(c.pnl_pct)}</span>`).join(" · ") || "no open positions"}</div>` +
      `<div class="pills"><span class="red">${rk.hard_stop === false ? "floor" : "stop"} -${rk.stop_pct}%</span>${rk.signals ? `<span class="gr">signal exits</span>` : ""}<span class="gr">trail ${rk.trail_pct}%</span></div>`);
    const cp = a.copy;
    if (cp) {
      // t99: copy desk = Watcher -> Copier (30s delay) -> Executor -> Risk
      const st = !cp.on ? "off" : cp.active ? "watching" : "off in LIVE";
      const ro = cp.roles || {}, W = ro.watcher || {}, C = ro.copier || {}, E = ro.executor || {}, R = ro.risk || {};
      const wl = (cp.wallets || []).slice(0, 6).map(w => `<span class="cw">${h(w.handle ? (w.handle[0] === "@" ? w.handle : "@" + w.handle) : w.w)}${w.wr != null ? ` <i>${Math.round(w.wr * 100)}%</i>` : ""}</span>`).join("");
      const wlast = W.last ? `${W.last.side === "sell" ? `<span class="mred">sold</span>${W.last.frac != null && W.last.frac < 0.995 ? " " + Math.round(W.last.frac * 100) + "%" : ""}` : `<span class="mgreen">bought</span>`} ${h(W.last.coin || "")} · ${h(W.last.who)} · ${age(W.last.ts)} ago` : "no source trades seen yet";
      const pend = (C.pending || []).map(p => `<div class="sm">${h(p.coin || "")} · ${h(p.who)} · <b class="cdown" data-due="${p.due_ts}">${Math.max(0, Math.round(p.due_ts - Date.now() / 1000))}s</b></div>`).join("");
      const clast = C.last ? `<div class="sm mgray">last: ${h(C.last.coin || "")} ${h(C.last.state)}${C.last.note ? " · " + h(C.last.note) : ""}</div>` : "";
      const f = (E.fills || [])[0];
      const fill = f ? `${h(f.coin || "")} · ${f.lag_s}s after ${h(f.who || "source")}${f.slip_pct != null ? ` · ${pc(f.slip_pct)} vs their fill` : ""}` : "no copied fills yet";
      card("copy", "c" + JSON.stringify(cp),
        `<h4>${ICON.copy}Copy</h4><div class="big" style="display:flex;align-items:center;gap:8px"><span class="blink ${cp.active ? "" : "off"}" style="${cp.active ? "background:#2EE6C9" : ""}"></span>${st}</div>` +
        `<div class="sm">${cp.n} wallets · ${cp.trades} copy trade${cp.trades === 1 ? "" : "s"} tonight · ${cp.open}/${cp.max_open} open</div>` +
        (wl ? `<div class="cws">${wl}</div>` : `<div class="empty">no wallets pinned</div>`) +
        `<div class="croles">` +
        `<div class="crole"><b>Watcher</b><div class="sm">${wlast}</div></div>` +
        `<div class="crole"><b>Copier</b> <span class="mgray">${C.delay_s ?? 30}s delay</span>${pend || `<div class="sm">nothing waiting</div>`}${clast}</div>` +
        `<div class="crole"><b>Executor</b><div class="sm">${fill}</div></div>` +
        `<div class="crole"><b>Risk</b><div class="pills">${(R.rules || []).map(x => `<span class="gr">${h(x)}</span>`).join("")}</div></div>` +
        `</div>`);
    }
    const wh = a.whale;
    if (wh) {
      // t103 Big Whale Bot: whales -> 30s delay -> $20 -> signal exits -> rebuy watch
      const st = !wh.on ? "off" : wh.active ? "watching" : "off in LIVE";
      const wl = (wh.wallets || []).map(w => `<span class="cw">${h(w.handle ? (w.handle[0] === "@" ? w.handle : "@" + w.handle) : w.w)}${w.wr != null ? ` <i>${Math.round(w.wr * 100)}%</i>` : ""}</span>`).join("");
      const op = (wh.open || []).map(p => `<div class="sm">${BB("whale")} ${h(p.sym || "")} · ${h(p.who || "")}${p.rebuy ? ` · rebuy #${p.rebuy}` : ""} · <span class="${(p.pct ?? 0) >= 0 ? "mgreen" : "mred"}">${pc(p.pct)}</span>${p.trail ? " · trailing" : ""}</div>`).join("");
      const pend = (wh.pending || []).map(p => `<div class="sm">${h(p.sym || "")} · ${h(p.who)} · buying in ${p.due_in}s</div>`).join("");
      const wt = (wh.watch || []).map(r => `<div class="wrow"><span>${h(r.sym || "")}</span><span class="mgray">entry ${pxHtml(r.entry)}</span><span class="${r.dist == null ? "mgray" : Math.abs(r.dist) <= 3 ? "mgreen" : "mgray"}">${r.dist == null ? "–" : pc(r.dist)}</span><span class="mgray">${r.rebuys}/${r.max}</span></div><div class="sm mgray wnote">${h(r.state)}${r.note ? " · " + h(r.note) : ""}${r.state === "watching" ? ` · ${r.left_min}m left` : ""}</div>`).join("");
      const last = wh.last ? `${wh.last.side === "sell" ? `<span class="mred">sold</span>` : `<span class="mgreen">bought</span>`} ${h(wh.last.sym || "")} · ${h(wh.last.who)} · ${age(wh.last.ts)} ago` : "no whale trades seen yet";
      card("whale", "w" + JSON.stringify(wh),
        `<h4>${ICON.whale}Big Whale Bot</h4><div class="big" style="display:flex;align-items:center;gap:8px"><span class="blink ${wh.active ? "" : "off"}" style="${wh.active ? "background:#4FA3FF" : ""}"></span>${st}</div>` +
        `<div class="sm">${wh.n} whales · ${wh.trades} trade${wh.trades === 1 ? "" : "s"} tonight · ${(wh.open || []).length}/${wh.max_open} open · $${wh.ticket} per buy</div>` +
        (wl ? `<div class="cws wcws">${wl}</div>` : `<div class="empty">no whales pinned</div>`) +
        `<div class="croles wroles">` +
        `<div class="crole"><b>Watcher</b><div class="sm">${last}</div>${pend}</div>` +
        `<div class="crole"><b>Open</b>${op || `<div class="sm">no whale positions</div>`}</div>` +
        `<div class="crole"><b>Rebuy watch</b>${wt || `<div class="sm">nothing on the watchlist</div>`}</div>` +
        `<div class="crole"><b>Exits</b><div class="pills">${(wh.rules || []).map(x => `<span class="gr">${h(x)}</span>`).join("")}</div></div>` +
        `</div>`);
    }
  }
  setInterval(() => document.querySelectorAll(".cdown[data-due]").forEach(e => { e.textContent = Math.max(0, Math.round(+e.dataset.due - Date.now() / 1000)) + "s"; }), 1000);

  // ---------- Boss (t85): final say on every buy
  const BOSSB = `<span class="bb b-boss">♛ Boss</span>`;
  function boss() {
    const X = A.app.boss, box = q("#mboss");
    if (!box) return;
    if (!X) { box.innerHTML = `<div class="mnone">Boss card appears after the next feed update</div>`; q("#mbossn").innerHTML = ""; return; }
    const st = X.status === "limit" ? `<span class="bst lim">Daily limit hit</span>` : X.status === "off" ? `<span class="bst off">Off</span>` : `<span class="bst ok">In charge</span>`;
    q("#mbossn").innerHTML = st;
    const P = X.pnl, limOn = P.limit != null, lim = limOn ? Math.abs(P.limit) : 0, used = limOn ? Math.max(0, Math.min(1, -P.total / lim)) : 0;
    const tone = v => Math.abs(v) < 0.005 ? "mgray" : v > 0 ? "mgreen" : "mred";
    const mins = s => s >= 60 ? Math.ceil(s / 60) + "m" : Math.max(1, Math.round(s)) + "s";
    const AC = { approve: ["ok", "Approved"], block: ["no", "Blocked"], resize: ["rs", "Resized"] };
    const bench = X.benched.length
      ? X.benched.map(b => `<div class="bbench">${BB(b.bot, true)}<span>benched · <b>${mins(b.left_s)}</b> left</span><span class="mred">${money(b.losses, true)}</span></div>`).join("")
      : `<div class="bnone">No bots benched</div>`;
    const dec = X.decisions.length
      ? X.decisions.map(d => { const a = AC[d.action] || ["", d.action]; return `<div class="bdec"><span class="bact ${a[0]}">${a[1]}${d.action === "resize" ? " " + d.size_x + "x" : ""}</span><div class="bdm"><div class="t1">${BB(d.bot)} ${h(d.coin)}</div><div class="t2">${h(d.reason)}</div></div><span class="mgray">${age(d.ts)}</span></div>`; }).join("")
      : `<div class="bnone">No decisions yet: the Boss reviews each buy after the Analyst</div>`;
    const T = X.today || {};
    box.innerHTML = `<div class="bpnl"><div><small>Today's P&amp;L</small><b class="${tone(P.total)}">${money(P.total, true)}</b><small class="mgray">${money(P.realized, true)} realized · ${money(P.unrealized, true)} open</small></div>` +
      (limOn ? `<div class="blim"><small>Daily limit</small><b class="mred">-$${lim.toFixed(2)}</b><small class="mgray">${Math.round(used * 100)}% used</small></div></div>` +
        `<div class="bbar"><i style="width:${(used * 100).toFixed(1)}%" class="${used >= 1 ? "full" : used >= 0.6 ? "warn" : ""}"></i></div>`
        : `<div class="blim"><small>Daily limit</small><b class="mgray">Daily limit: off</b><small class="mgray">signal exits · -${X.rules.floor || 30}% floor</small></div></div>`) +
      `<div class="bsub">Bench</div>${bench}` +
      `<div class="bsub">Last decisions <span class="mgray">· today ${T.approve || 0} approved · ${T.resize || 0} resized · ${T.block || 0} blocked</span></div>${dec}` +
      `<div class="bnote">Bench after ${X.rules.bench_after} losses for ${X.rules.bench_min}m · losing bot ${X.rules.losing_x}x size · skip &gt;+${X.rules.m5_pump}% in 5m (not sniper)${X.rules.m5_buys ? " or 5m sells &gt; buys" : ""} · ${X.rules.daily_limit ? "daily limit on" : "Daily limit: off"} · day since ${hm(X.since)} ET</div>`;
  }

  // ---------- live P&L by bot (t81)
  function bots() {
    const B = A.app.bots, box = q("#mbots");
    if (!B) { box.innerHTML = `<div class="mnone">P&amp;L by bot appears after the next feed update</div>`; return; }
    const tone = v => v == null || Math.abs(v) < 0.005 ? "mgray" : v > 0 ? "mgreen" : "mred";
    const cell = r => `<div class="c"><b class="${tone(r.upnl_usd)}">${r.open_n ? money(r.upnl_usd, true) : "–"}</b><small class="${tone(r.upnl_pct)}">${r.upnl_pct == null ? r.open_n + " open" : pc(r.upnl_pct) + " · " + r.open_n + " open"}</small></div>` +
      `<div class="c"><b class="${tone(r.rpnl_usd)}">${r.closed ? money(r.rpnl_usd, true) : "–"}</b><small class="mgray">${r.closed} closed</small></div>` +
      `<div class="c wl"><b><span class="${r.wins ? "mgreen" : "mgray"}">${r.wins}</span><span class="mgray">/</span><span class="${r.losses ? "mred" : "mgray"}">${r.losses}</span></b><small class="mgray">W/L</small></div>`;
    const row = r => `<div class="brow">${BB(r.bot, true)}${cell(r)}</div>` +
      (r.open.length ? `<div class="bopen">${r.open.map(o => `<button class="bchip" data-m="${h(o.mint)}">${h(o.coin)} <span class="${tone(o.pnl_pct)}">${pc(o.pnl_pct)}</span> <span class="${tone(o.pnl_usd)}">${money(o.pnl_usd, true)}</span></button>`).join("")}</div>` : "");
    const t = B.total;
    q("#mbotsn").innerHTML = `<span class="${tone(t.net_usd)}">${money(t.net_usd, true)}</span> net`;
    box.innerHTML = `<div class="bhead"><span>Bot</span><span>Unrealized</span><span>Realized today</span><span>W/L</span></div>` +
      B.rows.map(row).join("") +
      `<div class="brow tot"><span class="bb b-total">Total</span>${cell(t)}</div>` +
      `<div class="bnote">Today = since ${hm(B.since)} ET · live prices on the ${Feed.remote ? "15s" : "3s"} feed</div>`;
    box.querySelectorAll(".bchip").forEach(el => el.onclick = () => openCoin(el.dataset.m));
  }

  // ---------- activity feed
  function feed() {
    const rows = A.app.feed || [], box = q("#mlist");
    q("#mfeedn").textContent = rows.length ? rows.length + " recent" : "";
    if (!rows.length) { box.innerHTML = `<div class="mnone">No buys, sells or kills yet</div>`; return; }
    const verb = { bought: "Bought", sold: "Sold", stopped: "Stopped", killed: "Killed", locked: "Locked" };
    box.innerHTML = rows.map(r => {
      const isNew = !A.first && !A.seen.has(r.id);
      const col = r.kind === "bought" ? "" : r.kind === "killed" ? "mgray" : (r.usd || 0) >= 0 ? "mgreen" : "mred";
      const amt = r.kind === "killed" || r.usd == null ? "" : r.kind === "bought" ? money(r.usd) : money(r.usd, true);
      return `<div class="mrow ${isNew ? "new" : ""}" data-m="${h(r.mint)}">${logo(r.img, r.coin)}<div class="mid"><div class="t1">${r.kind === "killed" ? "" : BB(r.bot) + " "}${h(r.verb || verb[r.kind] || r.kind)} ${h(r.coin)}${(r.bot === "copy" || r.bot === "whale") && r.reason ? ` <span class="mgray">| ${h(r.reason)}</span>` : ""}</div><div class="t2">${h(r.agent)}${(r.bot === "copy" || r.bot === "whale") ? "" : " · " + h(r.reason)} · ${age(r.ts)} ago</div></div><div class="amt ${col}">${amt}<small>${h(r.sub || "")}</small></div></div>`;
    }).join("");
    rows.forEach(r => A.seen.add(r.id));
    box.querySelectorAll(".mrow").forEach(el => el.onclick = () => openCoin(el.dataset.m));
  }

  // ---------- live coins strip
  function spark(vals) {
    if (!vals || vals.length < 2) return `<svg viewBox="0 0 100 34"><line x1="0" y1="17" x2="100" y2="17" stroke="#333" stroke-dasharray="3 3"/></svg>`;
    const lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || hi * 0.01 || 1;
    const pts = vals.map((v, i) => `${(100 * i / (vals.length - 1)).toFixed(1)},${(31 - 28 * (v - lo) / sp).toFixed(1)}`).join(" ");
    const col = vals[vals.length - 1] >= vals[0] ? G : R;
    return `<svg viewBox="0 0 100 34" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  }
  function coins() {
    const cs = A.app.coins || [], box = q("#mcoins");
    cs.forEach(c => A.coinCache[c.mint] = c);
    q("#mcoinsn").textContent = cs.length ? cs.length + " watched" : "";
    if (!cs.length) { box.innerHTML = `<div class="mnone" style="flex:1">No coins on watch yet</div>`; return; }
    const ST = { holding: "holding", waiting: "waiting room", audited: "audited", passed: "passed scanner", watching: "watching" };
    box.innerHTML = cs.map(c => `<button class="mcc" data-m="${h(c.mint)}"><div class="r1">${logo(c.img, c.symbol, "sm")}<div style="min-width:0"><div class="sym">${h(c.symbol)}</div><div class="st">${c.status === "holding" ? BB(c.bot || c.source) + " " : ""}${ST[c.status] || c.status}${c.status === "holding" ? "" : " · " + SRC(c.source)}</div></div></div>${spark(c.spark)}<div class="r2"><span>${kmoney(c.mcap)}</span><span class="${(c.m5 ?? 0) >= 0 ? "mgreen" : "mred"}">${c.m5 == null ? "–" : pc(c.m5)} <span class="mgray">5m</span></span></div></button>`).join("");
    box.querySelectorAll(".mcc").forEach(el => el.onclick = () => openCoin(el.dataset.m));
  }

  // ---------- coin view
  const ET_OFF = (() => { const n = new Date(); const et = new Date(n.toLocaleString("en-US", { timeZone: TZN })), utc = new Date(n.toLocaleString("en-US", { timeZone: "UTC" })); return Math.round((et - utc) / 1000); })();
  const tt = ts => Math.floor(ts) + ET_OFF;   // lightweight-charts draws UTC; shift so the axis reads ET
  function openCoin(mint) {
    if (!mint) return;
    A.open = mint; A.stopShown = null; A.csrc = ""; A.lastCandles = 0;
    q("#mcoin").classList.add("open"); q("#mcoin").setAttribute("aria-hidden", "false"); q("#mcoin").scrollTop = 0;
    q("#mcbody").innerHTML = ""; renderCoin(true);
    clearInterval(A.ctimer); loadCandles(); A.ctimer = setInterval(() => { if (!document.hidden) loadCandles(); }, COIN_POLL);
  }
  function closeCoin() {
    A.open = null; clearInterval(A.ctimer); A.ctimer = null;
    q("#mcoin").classList.remove("open"); q("#mcoin").setAttribute("aria-hidden", "true");
    if (A.chart) { A.chart.remove(); A.chart = null; A.series = null; A.lines = {}; }
  }
  q("#mback").onclick = closeCoin;
  addEventListener("keydown", e => { if (e.key === "Escape") closeCoin(); });
  function coinData() {
    const c = (A.app.coins || []).find(x => x.mint === A.open) || A.coinCache[A.open];
    if (c) return c;
    const f = (A.app.feed || []).find(x => x.mint === A.open);
    return { mint: A.open, symbol: f ? f.coin : A.open.slice(0, 4), img: f && f.img, spark: [], spark_ts: [] };
  }
  function renderCoin(full) {
    const c = coinData(), p = c.pos, body = q("#mcbody");
    q("#mclink").href = c.coin_url || `https://dexscreener.com/solana/${c.mint}`;
    if (full || !body.querySelector(".mcandle")) {
      body.innerHTML = `<div class="mch">${logo(c.img, c.symbol, "lg")}<div style="min-width:0"><div class="nm">${h(c.name || c.symbol)} <span class="mgray" style="font-size:15px;font-weight:600">${h(c.symbol)}</span></div><div class="meta" id="mcmeta"></div></div></div>
        <div class="mprice" id="mcprice"></div><div class="msince" id="mcsince"></div>
        <div class="mcandle" id="mcandle"></div><div class="mcsrc"><span id="mcsrc">loading candles…</span><span id="mclegend"></span></div>
        <div class="mstats" id="mcstats"></div><div class="mcards2" id="mccards"></div>`;
      buildChart();
    }
    q("#mcmeta").textContent = `Solana · ${age(c.created)} old · found by Scanner/${["momentum", "bluechip", "volspike", "sniper", "copy", "whale"].includes(c.source) ? c.source : "migration"}`;
    q("#mcprice").innerHTML = pxHtml(c.price);
    q("#mcsince").innerHTML = p ? `<span class="${p.pnl_pct >= 0 ? "mgreen" : "mred"}">${p.pnl_pct >= 0 ? up : down} ${Math.abs(p.pnl_pct).toFixed(2)}%</span> <span class="mgray" style="font-weight:500">since entry</span>`
      : `<span class="${(c.h1 ?? 0) >= 0 ? "mgreen" : "mred"}">${c.h1 == null ? "" : pc(c.h1) + " "}</span><span class="mgray" style="font-weight:500">${c.h1 == null ? "not held" : "1h · not held"}</span>`;
    const st = (k, v) => `<div class="mstat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    q("#mcstats").innerHTML = st("Mcap", kmoney(c.mcap)) + st("Liquidity", kmoney(c.liq)) + st("Holders", knum(c.holders)) + st("24h vol", kmoney(c.v24));
    const stopPct = p ? (100 * (p.exit_line / p.entry_price - 1)) : null;
    q("#mccards").innerHTML = p
      ? `<div class="mcardx"><div class="k">Your position ${BB(c.bot || c.source, true)}</div><div class="rows"><div><b>${money(p.size_usd)}</b><span>in</span></div><div><b>${money(p.value_usd)}</b><span>value</span></div><div><b class="${p.pnl_usd >= 0 ? "mgreen" : "mred"}">${money(p.pnl_usd, true)}</b><span>P&amp;L</span></div></div></div>
         <div class="mcardx"><h5><span class="blink ${p.trail_active ? "" : "off"}"></span>Risk · ${p.trail_active ? "trailing stop" : (p.hard_stop === false ? "floor · signal exits" : "hard stop")}</h5><div class="rows"><div><b class="morange">${pxHtml(p.exit_line)}</b><span>exit line</span></div><div><b>${pc(stopPct)}</b><span>vs entry</span></div><div><b>${p.trail_active ? "on" : pxHtml(p.trail_start_price)}</b><span>${p.trail_active ? "trail" : "trail arms at"}</span></div></div></div>`
      : `<div class="mcardx"><div class="k">Your position</div><div style="margin-top:6px;font-weight:600">Not held</div><div class="mgray" style="font-size:13px">${h({ waiting: "In the waiting room", audited: "Audited", passed: "Passed the scanner", watching: "Being scanned" }[c.status] || "Being watched")} · the desk buys only after Auditor and Analyst pass it.</div></div>`;
    priceLines(c);
    liveTick(c);
  }
  function precisionFor(p) { if (!p) return [6, 1e-6]; const d = Math.min(12, Math.max(2, Math.ceil(-Math.log10(p)) + 3)); return [d, Math.pow(10, -d)]; }
  function buildChart() {
    if (A.chart) { A.chart.remove(); A.chart = null; A.lines = {}; }
    if (!window.LightweightCharts) { q("#mcsrc").textContent = "chart library failed to load"; return; }
    const el = q("#mcandle"), c = coinData(), [prec, mm] = precisionFor(c.price);
    A.chart = LightweightCharts.createChart(el, {
      autoSize: true, layout: { background: { type: "solid", color: "#000" }, textColor: "#8E8E93", fontFamily: "-apple-system, Inter, system-ui, sans-serif", attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: "#161616" } }, rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4 }, crosshair: { mode: 0 }, handleScroll: true, handleScale: true });
    A.series = A.chart.addCandlestickSeries({ upColor: G, downColor: R, wickUpColor: G, wickDownColor: R, borderVisible: false, priceFormat: { type: "price", precision: prec, minMove: mm } });
  }
  function priceLines(c) {
    if (!A.series) return;
    const p = c.pos;
    if (!p) { Object.values(A.lines).forEach(l => A.series.removePriceLine(l)); A.lines = {}; q("#mclegend").textContent = ""; return; }
    if (!A.lines.entry) A.lines.entry = A.series.createPriceLine({ price: p.entry_price, color: B, lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: "Executor buy" });
    const target = p.exit_line, title = p.trail_active ? "Risk trailing stop" : "Risk stop";
    if (!A.lines.stop) {
      const hist = p.stop_hist || [], from = hist.length > 1 ? hist[hist.length - 2][1] : p.stop_price < target ? p.stop_price : target * 0.97;
      A.stopShown = from; A.lines.stop = A.series.createPriceLine({ price: from, color: O, lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title });
    }
    A.lines.stop.applyOptions({ title });
    if (A.stopShown !== target) {
      const a0 = A.stopShown, t0 = performance.now(), dur = RED_M ? 0 : 1400, line = A.lines.stop;
      const step = t => { const k = dur ? Math.min(1, (t - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3); line.applyOptions({ price: a0 + (target - a0) * e }); if (k < 1 && A.lines.stop === line) requestAnimationFrame(step); };
      requestAnimationFrame(step); A.stopShown = target;
    }
    q("#mclegend").innerHTML = `<span style="color:${B}">┈ Buy</span> · <span style="color:${O}">┈ ${title}</span>`;
  }
  function liveTick(c) {
    if (!A.series || !c.price || !A.lastCandles) return;
    const t = tt(Math.floor(Date.now() / 60000) * 60), last = A.lastBar;
    if (!last) return;
    const bar = last.time === t ? { time: t, open: last.open, high: Math.max(last.high, c.price), low: Math.min(last.low, c.price), close: c.price }
      : t > last.time ? { time: t, open: last.close, high: Math.max(last.close, c.price), low: Math.min(last.close, c.price), close: c.price } : null;
    if (bar) { A.series.update(bar); A.lastBar = bar; }
  }
  async function loadCandles() {
    const mint = A.open, c = coinData();
    let bars = null, src = "";
    if (c.pool) {
      try {
        const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(c.pool)}/ohlcv/minute?aggregate=1&limit=180&currency=usd`, { headers: { Accept: "application/json" } });
        if (r.ok) {
          const j = await r.json(), L = (((j || {}).data || {}).attributes || {}).ohlcv_list || [];
          if (L.length) { bars = L.map(k => ({ time: tt(k[0]), open: +k[1], high: +k[2], low: +k[3], close: +k[4] })).sort((a, b) => a.time - b.time); src = "GeckoTerminal · 1m"; }
        } else src = `GeckoTerminal ${r.status}`;
      } catch (e) { src = "GeckoTerminal unreachable"; }
    }
    if (!bars) {                                     // fallback: the desk's own DexScreener price samples → 1-minute candles
      const ts = c.spark_ts || [], ps = c.spark || [], m = new Map();
      ts.forEach((t, i) => { const b = tt(Math.floor(t / 60) * 60), p = ps[i]; const k = m.get(b); if (!k) m.set(b, { time: b, open: p, high: p, low: p, close: p }); else { k.high = Math.max(k.high, p); k.low = Math.min(k.low, p); k.close = p; } });
      bars = [...m.values()].sort((a, b) => a.time - b.time);
      src = (src ? src + " → " : "") + "fallback: desk DexScreener samples";
    }
    if (A.open !== mint || !A.series) return;
    if (bars.length) {
      const [prec, mm] = precisionFor(bars[bars.length - 1].close);
      A.series.applyOptions({ priceFormat: { type: "price", precision: prec, minMove: mm } });
      A.series.setData(bars); A.lastBar = bars[bars.length - 1]; A.lastCandles = Date.now();
      if (!A.csrc) A.chart.timeScale().fitContent();
    }
    A.csrc = src; q("#mcsrc").textContent = bars.length ? src : "no candles yet for this pool";
    liveTick(coinData());
  }

  // ---------- celebrations
  function sheet(html, big) {
    const s = q("#msheet"); q("#msheetbody").innerHTML = html; s.classList.add("open");
    clearTimeout(A.sheetT); A.sheetT = setTimeout(() => s.classList.remove("open"), big ? 8000 : 6000);
    confetti(big ? 320 : 140);
  }
  q("#msheet").onclick = () => q("#msheet").classList.remove("open");
  function confetti(n) {
    if (RED_M) return;
    const cv = q("#mconfetti"), x = cv.getContext("2d"), dpr = devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = [G, "#fff", "#FFD23F", "#4D96FF", "#FF6B6B", "#C77DFF"];
    const P = [...Array(n)].map(() => ({ x: innerWidth / 2 + (Math.random() - .5) * innerWidth * .4, y: innerHeight * .75, vx: (Math.random() - .5) * 12, vy: -8 - Math.random() * 12,
      r: Math.random() * 6.28, vr: (Math.random() - .5) * .3, w: 5 + Math.random() * 5, h: 8 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now();
    const step = t => {
      x.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach(p => { p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2))); x.restore(); });
      if (t - t0 < 4200) requestAnimationFrame(step); else x.clearRect(0, 0, innerWidth, innerHeight);
    };
    requestAnimationFrame(step);
  }
  // ---------- trade-close toasts ("$TICKER +X%" pill, top center)
  A.toasted = new Set(JSON.parse(localStorage.getItem("m_toast") || "[]")); A.tq = []; A.tbusy = false;
  function toastText(r) {
    const sym = "$" + String(r.coin || "?").replace(/^\$/, "").toUpperCase();
    const pct = (r.sub || "").match(/[-+]?\d+(\.\d+)?%/);
    return { sym, pct: pct ? pct[0] : "", usd: r.usd || 0 };
  }
  function nextToast() {
    if (A.tbusy || !A.tq.length) return;
    A.tbusy = true;
    const t = A.tq.shift(), el = q("#mtoast");
    el.className = "mtoast " + (t.usd >= 0 ? "green" : "red");
    el.innerHTML = `${h(t.sym)} ${h(t.pct)}<small>${money(t.usd, true)}</small>`;
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => { A.tbusy = false; nextToast(); }, 400); }, 3800);
  }
  function toasts() {
    const rows = (A.app.feed || []).filter(r => /^x/.test(r.id) && (r.kind === "sold" || r.kind === "stopped"));
    rows.slice().reverse().forEach(r => {
      if (A.toasted.has(r.id)) return;
      A.toasted.add(r.id);
      if (!A.first && Date.now() / 1000 - r.ts < 900 && A.tq.length < 5) A.tq.push(toastText(r));
    });
    localStorage.setItem("m_toast", JSON.stringify([...A.toasted].slice(-200)));
    nextToast();
  }
  window.deskToastTest = r => { A.tq.push(toastText(r)); nextToast(); };

  function celebrate() {
    const a = A.app, d = A.d;
    (a.feed || []).filter(r => r.kind === "sold" && (r.usd || 0) > 0 && !A.cel.has(r.id)).forEach(r => {
      A.cel.add(r.id);
      if (!A.first && Date.now() / 1000 - r.ts < 900)
        sheet(`<div class="h">Risk sold ${h(r.coin)} · locked the gain</div><div class="w">${money(r.usd, true)}</div><div class="s">${h(r.sub)} · ${h(r.reason)}</div>`);
    });
    localStorage.setItem("m_cel", JSON.stringify([...A.cel].slice(-200)));
    if (a.mult) {
      const ms = Math.floor((a.mult - 1) * 10 + 1e-9), had = localStorage.getItem("m_ms");
      if (had == null || A.first && ms <= +had) localStorage.setItem("m_ms", String(Math.max(ms, had == null ? ms : +had)));
      else if (ms > +had && ms >= 1) { localStorage.setItem("m_ms", String(ms)); sheet(`<div class="h">New equity milestone</div><div class="w">${a.mult.toFixed(2)}x</div><div class="s">${money(d.balance)} · up ${(100 * (a.mult - 1)).toFixed(0)}% on the stack</div>`, true); }
    }
  }

  // ---------- data
  addEventListener("deskdata", e => {
    const d = e.detail; if (!d || !d.app) return;
    A.d = d; A.app = d.app; note();
    const mm = q("#mmode"); mm.textContent = d.mode + (d.exec ? " · " + String(d.exec).toUpperCase() : ""); mm.className = "mmode" + (d.mode === "LIVE" ? " live" : "");
    eqData(); hero(); boss(); bots(); agents(); feed(); coins(); toasts(); celebrate();
    if (A.open) renderCoin(false);
    const w = d.wallet || {};
    q("#mfoot").textContent = `bot wallet ${w.address || "n/a"} · updated ${hm(d.updated_at)} ET · ${Feed.remote ? "public feed · 15s snapshots" : "local feed · 3s"}`;
    if (A.first) { const cm = new URLSearchParams(location.search).get("coin"); if (cm) openCoin(cm); }
    A.first = false;
  });
  // While only an older snapshot is available (box paused / phone offline) keep showing it with a calm amber note, never a red error.
  function note(force) {
    const m = q("#merr"); if (!A.d) return;
    const lag = Date.now() / 1000 - (A.d.updated_at || 0);
    if (!force && lag < (Feed.remote ? 90 : 30)) { m.hidden = true; return; }
    m.hidden = false; m.className = "merr warn";
    m.textContent = "Desk paused, last update " + hm(A.d.updated_at) + " ET. Reconnecting…";
  }
  addEventListener("deskerr", e => {
    const m = q("#merr");
    if (e.detail !== "nolink" && A.d) { note(true); return; }
    m.hidden = false; m.className = "merr warn";
    m.textContent = e.detail === "nolink" ? "No data link yet. Open the private link from Telegram (it contains ?d=…) in Safari, then Share → Add to Home Screen from that page. If you added the icon before, delete it and add it again." : "Connecting to the desk… Reconnecting.";
  });
  function clock() {
    q("#mclock").textContent = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: TZN }) + " ET";
    const f = q("#mfeed"); if (!A.d) return;
    const lag = Date.now() / 1000 - A.d.updated_at; f.className = "mdot " + (lag < (Feed.remote ? 45 : 20) ? "ok" : lag < (Feed.remote ? 90 : 30) ? "stale" : "paused");
    if (Math.floor(Date.now() / 1000) % 5 === 0) note();
  }
  setInterval(clock, 1000); clock();
  tfButtons();
  let lastF = 0;
  const loop = t => { if (t - lastF > 33) { lastF = t; drawEq(t); } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  addEventListener("resize", () => { layoutMarks(); });
})();
