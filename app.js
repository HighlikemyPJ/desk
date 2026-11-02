// Grok Bot desk · plan B: polls d/{DATA_PATH}/*.json every 15s. Every FOMO URL shown comes from the JSON (built by links.py).
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const POLL = 15000;
const S = { state: null, chart: null, activity: null, coins: {}, range: "LIVE", lastOk: 0, failAt: 0, retryIn: 0, route: "home", arg: null,
            seenPush: +localStorage.getItem("seenPush") || 0, chartLen: 0, beamDone: {} };

// ---- data path: arrives once as #d=..., then lives in localStorage
(function () {
  const m = location.hash.match(/^#d=([A-Za-z0-9_-]{32,})(\/[\w\/-]*)?/);
  if (m) { localStorage.setItem("dataPath", m[1]); history.replaceState(null, "", location.pathname + "#" + (m[2] || "/home")); }
})();
const DP = localStorage.getItem("dataPath");
const base = () => `d/${DP}/`;

const get = name => Feed.get(DP, name);   // feed.js: local JSON or the encrypted public snapshot

// ---- formatting
const usd = (v, sign) => v == null ? "n/a" : (sign ? (v > 0 ? "+" : v < 0 ? "-" : "") : (v < 0 ? "-" : "")) + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kusd = v => v == null ? "n/a" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + v.toFixed(0);
const pct = (v, d = 2) => v == null ? "n/a" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%";
const hm = ts => ts ? new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }) : "";
const price = p => p == null ? "n/a" : p >= 1 ? "$" + p.toFixed(4) : "$" + p.toPrecision(4);
const age = ts => { if (!ts) return ""; const m = (Date.now() / 1000 - ts) / 60; return m < 60 ? Math.round(m) + "m old" : Math.round(m / 60) + "h old"; };
const initials = s => esc((s || "?").replace(/^\$/, "").slice(0, 2).toUpperCase());

// ---- odometer: each changed digit rolls 600ms ease-out, 30ms stagger right to left
function odometer(el, text) {
  const prev = el.dataset.v || "";
  if (prev === text) return;
  el.dataset.v = text;
  if (Charts.RM || prev.length !== text.length) { el.innerHTML = [...text].map(ch => /\d/.test(ch) ? digit(ch) : `<span>${esc(ch)}</span>`).join(""); return; }
  const cols = el.children, n = text.length;
  [...text].forEach((ch, i) => {
    if (ch === prev[i] || !/\d/.test(ch) || !cols[i] || !cols[i].classList.contains("odo")) { if (ch !== prev[i]) cols[i].outerHTML = /\d/.test(ch) ? digit(ch) : `<span>${esc(ch)}</span>`; return; }
    const c = cols[i].firstElementChild; c.style.transitionDelay = (n - 1 - i) * 30 + "ms"; c.style.transform = `translateY(${-66 * +ch}px)`;
  });
}
const digit = d => `<span class="odo"><span class="col" style="transform:translateY(${-66 * +d}px)">${[..."0123456789"].map(x => `<span>${x}</span>`).join("")}</span></span>`;

// ---- error row: "Desk offline · retrying in {n}s · last update {time}". Keeps the last good numbers.
function errRow() {
  const e = $("#err");
  if (!DP) { e.hidden = false; e.textContent = "No data link yet · open the app once with its private #d= link"; return; }
  const stale = S.state && Date.now() / 1000 - S.state.updated_at > 90;
  if (!S.failAt && !stale) { e.hidden = true; return; }
  const n = Math.max(0, Math.ceil((S.nextPoll - Date.now()) / 1000));
  e.hidden = false;
  e.textContent = `Desk offline · retrying in ${n}s · last update ${S.lastOk ? hm(S.lastOk / 1000) : "never"}`;
}
setInterval(errRow, 1000);

async function poll() {
  if (!DP) { errRow(); render(); return; }
  try {
    const [st, ch, ac] = await Promise.all([get("state.json"), get("chart.json"), get("activity.json")]);
    S.state = st; S.chart = ch; S.activity = ac; S.lastOk = st.updated_at * 1000; S.failAt = 0;
    if (S.route === "coin" || S.route === "audit") await loadCoin(S.arg);
  } catch (e) { S.failAt = Date.now(); S.retryIn = POLL; }
  S.nextPoll = Date.now() + POLL;
  errRow(); render();
  setTimeout(poll, POLL);
}
async function loadCoin(mint) {
  try { S.coins[mint] = await get("coin/" + encodeURIComponent(mint) + ".json"); }
  catch (e) { if (!S.coins[mint]) S.coins[mint] = { missing: true }; }
}

// ---- router
function go(h) { location.hash = h; }
window.addEventListener("hashchange", route);
function route() {
  const [, r, a] = (location.hash.match(/^#\/(\w+)\/?(.*)$/) || [, "home", ""]);
  S.route = r; S.arg = decodeURIComponent(a || "");
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === r));
  $("#tabs").hidden = r === "coin" || r === "audit";
  if ((r === "coin" || r === "audit") && DP && !S.coins[S.arg]) loadCoin(S.arg).then(render);
  window.scrollTo(0, 0); render(true);
}
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => go("#/" + b.dataset.tab));

function render(fresh) {
  const v = $("#view"), f = { home: Home, agents: Agents, activity: Activity, account: Account, coin: Coin, audit: Audit }[S.route] || Home;
  f(v, fresh);
}

// ---- shared bits
const sk = (h, w = "auto", m = "0 16px 12px") => `<div class="sk" style="height:${h}px;width:${w};margin:${m}"></div>`;
const PAPER = () => S.state && S.state.mode === "PAPER" ? `<span class="paper">PAPER</span>` : "";
function actRow(r) {
  const cls = r.kind === "sold" ? "up" : r.kind === "stopped" ? "down" : r.kind === "rejected" ? "mute" : "";
  const to = r.kind === "rejected" ? `#/audit/${encodeURIComponent(r.mint)}` : `#/coin/${encodeURIComponent(r.mint)}`;
  return `<a class="row" href="${to}"><div class="ic">${initials(r.coin)}</div><div class="mid"><div class="t">${esc(r.title)}</div><div class="s">${esc(r.subtitle)}</div></div><div class="v ${cls}">${esc(r.value)}</div></a>`;
}
function agentCards(st) {
  const a = st.agents, card = (name, color, inner, status) => `<div class="card"><div class="top"><span class="name" style="color:${color}">${name}</span><span class="sub"><span class="sdot ${status}"></span>${status}</span></div>${inner}</div>`;
  const sc = a.scanner, au = a.auditor, an = a.analyst, ex = a.executor, rk = a.risk;
  const feed = sc.feed.length ? sc.feed.slice(0, 5).map(d => d.verdict === "pass" ? `<div class="p">${esc(d.coin)} → auditor</div>`
      : `<div><span class="k">${esc(d.coin)}</span> <span class="mute">${esc(d.verdict === "waiting" ? "waiting" : d.reason)}</span></div>`).join("") : `<div class="mute">Listening for graduations</div>`;
  const L = au.last ? au.last.layers : [];
  const strips = [...Array(8)].map((_, i) => { const l = L.find(x => x.n === i + 1); return `<i class="${!l ? "" : l.pass === 1 || l.pass === true ? "ok" : l.pass === 0 || l.pass === false ? "no" : "nc"}"></i>`; }).join("");
  const auLine = au.running ? `taking apart ${esc(au.running.symbol || au.running.name || "")}...` : au.last ? (au.last.passed ? `${esc(au.last.coin)} · 8/8 → Executor` : `${esc(au.last.coin)} · ${esc(au.last.reason)}`) : "No coin taken apart yet";
  const exLine = ex.last_size ? `${usd(ex.last_size)} · ${ex.last_pct}% of stack` : `— · ${ex.stack_pct}% of stack`;
  const exBar = ex.last_status === "bought" ? `<div class="bar"><i style="width:100%"></i></div><div class="up">✓ Filled</div>` : ex.last_status === "sent" ? `<div class="bar"><i style="width:60%"></i></div><div class="sub">Executing... waiting for your tap</div>` : `<div class="bar"><i style="width:0"></i></div><div class="sub">Nothing to execute yet</div>`;
  return [
    card("Scanner", "#64d2ff", `<div class="stat">${sc.pools} pools</div><div class="sub">${sc.today} decisions · ${sc.waiting} waiting · ${sc.passed} passed</div><div class="feed">${feed}</div>`, sc.status),
    card("Auditor", "#fff", `<div class="stat">${au.taken_apart} taken apart</div><div class="strips">${strips}</div><div class="sub">${auLine}</div><div class="sub" style="margin-top:auto">${au.rejected} rejected</div>`, au.status),
    card("Analyst", "#ffd60a", `<div class="stat" style="font-size:20px">Scoring</div><canvas class="ring" data-score="${an.last_score ?? ""}" data-min="${an.min_score}"></canvas><div class="sub" style="text-align:center">${an.last_coin ? esc(an.last_coin) + " · " : ""}${an.today} scored · ${an.mode === "rules" ? "rules mode" : "Jev"}</div>`, an.status),
    card("Executor", "#00d35a", `<div class="stat">${ex.trades} trades</div><div class="sub">${exLine}</div>${exBar}`, ex.status),
    card("Risk", "#ff6b9a", `<div class="stat">${rk.guarding ? "Guarding " + rk.guarding : "Guarding"}</div><div class="sub">${rk.last_exit === "trail" ? "Trailed out" : rk.last_exit === "stop" ? "Stopped" : rk.last_exit ? esc(rk.last_exit) : "No exits yet"}</div><div style="margin-top:auto;display:flex;gap:8px"><span class="pill r m">stop -${rk.stop_pct}%</span><span class="pill g m">trail ${rk.trail_pct}%</span></div>`, rk.status),
  ].join("");
}
function drawRings(root) { root.querySelectorAll("canvas.ring").forEach(c => Charts.ring(c, c.dataset.score === "" ? null : +c.dataset.score, +c.dataset.min)); }

// ---- HOME
function Home(v, fresh) {
  const st = S.state;
  if (!st) {
    v.innerHTML = `<div class="nav"><div class="avatar sk"></div><div class="title">Grok Bot ›</div></div>${sk(44)}${sk(70, "60%")}${sk(20, "40%")}${sk(240, "auto", "12px 0")}${sk(300)}`;
    return;
  }
  const unread = (st.pushes || []).some(p => p.ts > S.seenPush);
  if (fresh || !$("#bal")) {
    v.innerHTML = `<div class="nav"><a class="icon" href="#/account" aria-label="Account"><span class="avatar">${initials(st.account.fomo_handle)}</span></a>
      <a class="title" href="#/agents">Grok Bot ›</a>
      <a class="icon" href="#/activity" id="bell" aria-label="Pushes"><svg viewBox="0 0 24 24"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/></svg></a></div>
      <a class="dashlink" href="dash.html">▶ LIVE DASH · watch the agents work</a>
      <input class="search" id="q" placeholder="Search name, symbol or mint" autocomplete="off"><div id="qres" class="list"></div>
      <div class="bal"><span class="big num" id="bal"></span><span id="pb"></span></div>
      <div class="today"><span id="tp"></span><span class="pill g" id="mult"></span></div>
      <div class="chartwrap"><canvas id="line"></canvas><div class="chartempty" id="ce" hidden>Waiting for the first trade</div></div>
      <div class="ranges">${["LIVE", "1H", "4H", "1D", "1W", "ALL"].map(r => `<button data-r="${r}">${r}</button>`).join("")}</div>
      <h2 id="agh"></h2><div class="carousel" id="cards"></div>
      <h2>Activity <a href="#/activity">See all</a></h2><div class="list" id="last5"></div>`;
    v.querySelectorAll(".ranges button").forEach(b => b.onclick = () => { S.range = b.dataset.r; S.chartLen = 0; Home(v); });
    $("#q").oninput = e => search(e.target.value);
    S.chartLen = 0;
  }
  const bell = $("#bell"); bell.querySelector(".dot")?.remove(); if (unread) bell.insertAdjacentHTML("beforeend", `<span class="dot"></span>`);
  bell.onclick = () => { S.seenPush = Date.now() / 1000; localStorage.setItem("seenPush", S.seenPush); };
  odometer($("#bal"), usd(st.balance));
  $("#pb").innerHTML = PAPER();
  $("#tp").className = st.today_pct >= 0 ? "up" : "down"; $("#tp").textContent = pct(st.today_pct) + " today";
  $("#mult").textContent = st.multiplier.toFixed(2) + "×";
  v.querySelectorAll(".ranges button").forEach(b => b.classList.toggle("on", b.dataset.r === S.range));
  const pts = S.chart ? S.chart.ranges[S.range] : [], trades = (S.chart?.marks || []).length;
  $("#ce").hidden = trades > 0;
  Charts.line($("#line"), pts, S.chart?.marks || [], S.chart?.start_value ?? st.start_value, S.chartLen);
  S.chartLen = pts.length;
  const running = Object.values(st.agents).filter(a => a.status === "running").length;
  $("#agh").textContent = `Agents · ${running} running`;
  const cards = $("#cards"), sl = cards.scrollLeft; cards.innerHTML = agentCards(st); cards.scrollLeft = sl; drawRings(cards);
  const rows = (st.activity || []).slice(0, 5);
  $("#last5").innerHTML = rows.length ? rows.map(actRow).join("") : `<div class="empty">Nothing yet tonight</div>`;
}
function search(q) {
  const box = $("#qres"); q = q.trim().toLowerCase();
  if (!q) { box.innerHTML = ""; return; }
  const hits = (S.state.coins || []).filter(c => [c.name, c.symbol, c.mint].some(x => (x || "").toLowerCase().includes(q))).slice(0, 8);
  box.innerHTML = hits.length ? hits.map(c => `<a class="row" href="#/coin/${encodeURIComponent(c.mint)}"><div class="ic">${initials(c.symbol)}</div><div class="mid"><div class="t">${esc(c.name || c.mint)}</div><div class="s">${esc(c.symbol || "")} · ${esc(c.mint.slice(0, 4) + "..." + c.mint.slice(-4))}</div></div></a>`).join("") : `<div class="empty">No coin seen tonight matches</div>`;
}

// ---- AGENTS tab: 5 full-width cards in pipeline order
const ORDER = [["scanner", "Scanner", "#64d2ff", "scanner"], ["auditor", "Auditor", "#fff", "auditor"], ["analyst", "Analyst", "#ffd60a", "analyst"], ["executor", "Executor", "#00d35a", "executor"], ["risk", "Risk", "#ff6b9a", "risk"]];
function Agents(v) {
  const st = S.state;
  if (!st) { v.innerHTML = `<h2>Agents</h2>` + ORDER.map(() => sk(220, "auto", "0 16px 12px")).join(""); return; }
  const count = { scanner: a => `${a.today} today`, auditor: a => `${a.taken_apart} today`, analyst: a => `${a.today} today`, executor: a => `${a.trades} today`, risk: a => `${a.guarding} open` };
  v.innerHTML = `<h2>Agents</h2>` + ORDER.map(([k, name, col, sec]) => {
    const a = st.agents[k], locked = k === "risk" && a.locked;
    const dec = a.decisions.length ? a.decisions.map(d => `<div class="dec"><span class="tm">${hm(d.ts)}</span><span><a class="cn" href="${esc(d.coin_url || "#")}" target="_blank" rel="noopener">${esc(d.coin)}</a> · <span class="${/pass|bought|sent|trail/.test(d.verdict) ? "up" : /kill|reject|stop|skip|expired/.test(d.verdict) ? "down" : "mute"}">${esc(d.verdict)}</span></span><span class="rs">${esc(d.reason)}</span></div>`).join("")
      : `<div class="empty" style="padding:16px 0">${k === "scanner" ? "Listening for graduations" : "No decisions yet tonight"}</div>`;
    return `<div class="full"><div class="hdr"><span class="sdot ${a.status}"></span><span class="name" style="color:${col}">${name}</span><span class="mute">${count[k](a)}</span>
      <span class="swwrap" title="${locked ? "Locked while a position is open" : "Pause/resume from Telegram: pause " + k}"><span class="sw ${a.status !== "paused" ? "on" : ""}" ${"disabled"}></span></span></div>
      <div class="note">${a.status === "paused" ? "Paused" : "Running"}${locked ? " · locked while a position is open" : ""} · plan B is read-only here: send “${a.status === "paused" ? "resume" : "pause"} ${k}” to the bot</div>
      ${dec}<a class="btn sec" style="margin:12px 0 0" href="#/account/${sec}">Settings</a></div>`;
  }).join("");
}

// ---- ACTIVITY: 30 per page
let actPage = 1;
function Activity(v) {
  if (!S.activity) { v.innerHTML = `<h2>Activity</h2>` + [...Array(6)].map(() => sk(52)).join(""); return; }
  const rows = S.activity.rows, shown = rows.slice(0, 30 * actPage);
  v.innerHTML = `<h2>Activity ${PAPER()}</h2><div class="list">${shown.length ? shown.map(actRow).join("") : `<div class="empty">Nothing yet tonight</div>`}</div>
    ${rows.length > shown.length ? `<button class="btn sec" id="more">Load 30 more</button>` : ""}
    <h2>Pushes</h2><div class="list">${(S.state?.pushes || []).map(p => `<div class="row"><div class="mid"><div class="t" style="white-space:normal">${esc(p.text)}</div><div class="s">${hm(p.ts)} · Telegram</div></div>${p.link ? `<a class="pill g" href="${esc(p.link)}" target="_blank" rel="noopener">FOMO</a>` : ""}</div>`).join("") || `<div class="empty">No pushes yet</div>`}</div>`;
  const m = $("#more"); if (m) m.onclick = () => { actPage++; Activity(v); };
}

// ---- ACCOUNT
function Account(v) {
  const st = S.state;
  if (!st) { v.innerHTML = `<h2>Account</h2>${sk(120)}${sk(60)}${sk(60)}${sk(400)}`; return; }
  const a = st.account, set = st.settings, groups = {};
  Object.entries(set).forEach(([k, o]) => (groups[k.split(".")[0]] = groups[k.split(".")[0]] || []).push([k, o]));
  const row = ([k, o]) => {
    const short = k.split(".").slice(1).join(".");
    if (o.options) return `<div class="set"><div class="lab"><span>${esc(short)}</span><span>${esc(o.value)}</span></div><div class="note">options: ${o.options.map(esc).join(" / ")}</div></div>`;
    if (typeof o.value === "boolean" || typeof o.value === "string") return `<div class="set"><div class="lab"><span>${esc(short)}</span><span>${esc(String(o.value))}</span></div></div>`;
    return `<div class="set"><div class="lab"><span>${esc(short)}</span><input class="field" type="number" value="${o.value}" disabled aria-label="${esc(k)}"></div><input type="range" min="${o.min}" max="${o.max}" step="any" value="${o.value}" disabled aria-label="${esc(k)}"></div>`;
  };
  v.innerHTML = `<h2>Account ${PAPER()}</h2>
    <div class="full"><div class="seg"><button class="${a.mode === "PAPER" ? "on" : ""}">PAPER</button><button class="${a.mode === "LIVE" ? "on" : ""}" id="live">LIVE</button></div>
      <div class="note">Going LIVE: send “live” to the bot, then type LIVE to confirm. It needs 1 full PAPER night first.</div>
      <div class="kv"><span class="k">Stack</span><span class="v num">${usd(a.stack)}</span></div>
      <div class="note">${esc(st.ticket.text)}</div></div>
    <div class="full list" style="padding:0 0 0">
      ${a.profile_url ? `<a class="row" href="${esc(a.profile_url)}" target="_blank" rel="noopener"><div class="mid"><div class="t">Your FOMO profile</div><div class="s">@${esc(a.fomo_handle)}</div></div><span class="mute">›</span></a>` : ""}
      <button class="row" id="invite" style="width:100%;text-align:left"><div class="mid"><div class="t">Invite a friend</div><div class="s">10% off every fee for life</div></div><span class="mute">›</span></button>
      <div class="row"><div class="mid"><div class="t">Telegram</div><div class="s">${a.telegram.connected ? "Connected · " + esc(a.telegram.bot) : "Not connected"}</div></div><span class="mute" style="font-size:13px;text-align:right">Test push: send “status” to the bot</span></div>
      <div class="row"><div class="mid"><div class="t">Notifications</div><div class="s">${esc(a.web_push)}</div></div></div></div>
    ${Object.entries(groups).map(([g, rows]) => `<h2 id="sec-${g}">${g[0].toUpperCase() + g.slice(1)}</h2><div class="full">${rows.map(row).join("")}<div class="note">Read-only on plan B · change in Telegram: “set ${esc(rows[0][0].split(".").slice(1).join("."))} to …”</div></div>`).join("")}`;
  $("#invite").onclick = async () => {
    const url = a.signup_url;
    if (navigator.share) { try { await navigator.share({ title: "FOMO", url }); return; } catch (e) { } }
    try { await navigator.clipboard.writeText(url); } catch (e) { }
    toast("Link copied");
  };
  if (S.arg) { const el = $("#sec-" + S.arg); if (el) el.scrollIntoView(); }
}
function toast(t) { const e = $("#toast"); e.textContent = t; e.hidden = false; setTimeout(() => e.hidden = true, 1800); }

// ---- COIN
function Coin(v) {
  const c = S.coins[S.arg];
  const hdr = `<div class="nav"><a class="back" href="javascript:history.back()">‹ Back</a><div class="title"></div>${PAPER()}</div>`;
  if (!c) { v.innerHTML = hdr + sk(30, "50%") + sk(50, "60%") + sk(260, "auto", "12px 0") + sk(140); return; }
  if (c.missing) { v.innerHTML = hdr + `<div class="empty">No data for this coin tonight yet</div>`; return; }
  const p = c.position, au = c.audit || {}, shield = au.layers && au.layers.length ? (au.passed ? "8/8" : `${au.checked}/8 ✕`) : "not audited";
  const since = c.since_entry_pct;
  v.innerHTML = hdr + `<div class="coinhdr"><div style="font:600 22px var(--disp)">${esc(c.name || c.mint)}</div>
      <div class="mute" style="display:flex;gap:8px;align-items:center">${esc(c.symbol || "")} · Solana · ${age(c.migrated_at)} <a class="chip" href="#/audit/${encodeURIComponent(c.mint)}">🛡 ${shield}</a></div></div>
    <div class="price num">${price(c.price)}</div>
    ${since != null ? `<div class="today"><span class="${since >= 0 ? "up" : "down"}">${since >= 0 ? "▲" : "▼"} ${Math.abs(since).toFixed(2)}% since entry</span></div>` : ""}
    <div class="chartwrap" style="height:260px"><canvas id="cdl"></canvas></div>
    <div class="stats"><div><span class="mute">Market cap</span><b>${kusd(c.stats.mcap)}</b></div><div><span class="mute">Liquidity</span><b>${kusd(c.stats.liq)}</b></div>
      <div><span class="mute">24h volume</span><b>${kusd(c.stats.v24)}</b></div><div><span class="mute">Holders</span><b>${c.stats.holders ?? "n/a"}</b></div></div>
    ${p ? `<h2>Your position</h2><div class="full"><div class="kv"><span class="k">Your position</span><span class="v">${usd(p.size_usd)} in · Executor</span></div>
      <div class="kv"><span class="k">Stop line</span><span class="v down">${price(p.stop_price)} · -${p.stop_pct}%</span></div>
      <div class="kv"><span class="k">Trail line</span><span class="v">${p.trail_active ? price(p.trail_price) : "starts at " + price(p.trail_start_price)}</span></div>
      <div class="kv"><span class="k">Timeout</span><span class="v">${Math.max(0, Math.round((p.timeout_at - Date.now() / 1000) / 60))} min left</span></div></div>` : ""}
    ${c.closed_position ? `<div class="full"><div class="kv"><span class="k">Closed</span><span class="v ${c.closed_position.pnl_usd >= 0 ? "up" : "down"}">${usd(c.closed_position.pnl_usd, true)} · ${esc(c.closed_position.exit_reason)}</span></div></div>` : ""}
    <a class="btn ${p ? "sell" : ""}" href="${esc(c.coin_url)}" target="_blank" rel="noopener">${p ? "Sell on FOMO" : "Buy on FOMO"}</a>`;
  Charts.candles($("#cdl"), c.candles, p ? p.exit_line : null);
}

// ---- AUDITOR screen: 8 discs, cyan beam 350ms per layer, then 150ms to green/red. Only layers the server sent.
function Audit(v) {
  const c = S.coins[S.arg];
  const hdr = `<div class="nav"><a class="back" href="javascript:history.back()">‹ Back</a><div class="title">Auditor</div>${PAPER()}</div>`;
  if (!c) { v.innerHTML = hdr + sk(40, "60%") + sk(220) + sk(300); return; }
  const L = (c.audit && c.audit.layers) || [];
  if (c.missing || !L.length) { v.innerHTML = hdr + `<div class="empty">No coin taken apart yet</div>`; return; }
  const au = c.audit, label = c.symbol || c.name || "this coin";
  const cls = l => l.pass === 1 || l.pass === true ? "ok" : l.pass === 0 || l.pass === false ? "no" : "nc";
  v.innerHTML = hdr + `<div class="coinhdr"><div style="font:600 22px var(--disp)">${esc(c.name || c.mint)}</div><div class="mute">${esc(c.symbol || "")} · Solana · ${age(c.migrated_at)}</div></div>
    <div class="discs">${L.map(l => `<div class="disc" data-n="${l.n}">${l.n}</div>`).join("")}</div>
    <div id="verdict"></div>
    <div class="full">${L.map(l => `<div class="kv"><span class="k">${l.n} · ${esc(l.name)}</span><span class="v ${cls(l) === "no" ? "down" : cls(l) === "nc" ? "mute3" : ""}">${cls(l) === "ok" ? "✓ " : cls(l) === "no" ? "✕ " : ""}${esc(l.value)}</span></div>`).join("")}</div>
    <div class="full"><div class="hdr"><span class="name" style="font-weight:400">Take apart before buying</span><span class="swwrap"><span class="sw ${au.enabled ? "on" : ""}" disabled></span></span></div><div class="note">Read-only on plan B · send “set auditor.enabled to off” to the bot (it asks twice)</div></div>
    <a class="btn" href="${esc(c.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>`;
  const discs = [...v.querySelectorAll(".disc")];
  const verdict = () => {
    $("#verdict").innerHTML = au.passed ? `<div class="verdict up">Cleared · 8/8 parts</div><div class="mute" style="margin:0 16px">Sent to Executor${au.size_usd ? " · " + usd(au.size_usd) : ""}</div>`
      : `<div class="verdict down">Rejected · ${esc(au.reason || "")}</div><div class="mute" style="margin:0 16px">Grok Bot won't buy ${esc(label)}</div>`;
  };
  if (Charts.RM || S.beamDone[c.mint]) { discs.forEach((d, i) => d.classList.add(cls(L[i]))); verdict(); return; }
  S.beamDone[c.mint] = true;
  discs.forEach((d, i) => {
    setTimeout(() => d.classList.add("beam"), i * 350);
    setTimeout(() => { d.classList.remove("beam"); d.classList.add(cls(L[i])); if (i === discs.length - 1) verdict(); }, i * 350 + 350 + 150);
  });
}

// ---- boot
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });
route(); poll();
