// Public A/B view (t137). Reads plaintext pub/ab/<slot>.json from the repo's data branch (no secrets, no wallet addresses).
"use strict";
(() => {
  const REPO = "HighlikemyPJ/desk", BR = "data", SLOT = 15;
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = v => v == null ? "–" : (v < 0 ? "-$" : "+$") + Math.abs(v).toFixed(2);
  const cls = v => v == null ? "" : (v >= 0 ? "pos" : "neg");
  const pct = v => v == null ? "–" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  const et = (ts, withDate = true) => ts ? new Date(ts * 1000).toLocaleString("en-US", Object.assign({ timeZone: "America/New_York", hour: "numeric", minute: "2-digit" },
    withDate ? { month: "short", day: "numeric" } : {})) + " ET" : "–";
  let data = null, lastSlot = 0;

  async function get(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  }
  async function load() {
    const q = new URLSearchParams(location.search).get("src");
    if (q) return get(q);
    const now = Math.floor(Date.now() / 1000 / SLOT);
    for (let k = 1; k <= 4; k++) {
      const s = now - k;
      if (s <= lastSlot) break;
      try { const j = await get(`https://raw.githubusercontent.com/${REPO}/${BR}/pub/ab/${s}.json`); if (j) { lastSlot = s; return j; } } catch (e) { }
    }
    if (data) return null;
    return get(`https://raw.githubusercontent.com/${REPO}/${BR}/pub/ab/latest.json?m=${Math.floor(Date.now() / 60000)}`);
  }

  function armCard(name, color, a) {
    return `<div class="card arm"><h2><span class="dot" style="background:${color}"></span>${name}</h2>
      <div class="big ${cls(a.total)}">${money(a.total)}</div><div class="muted small">realized + unrealized</div>
      <div class="kv" style="margin-top:10px"><span>Realized</span><b class="${cls(a.realized)}">${money(a.realized)}</b>
      <span>Unrealized</span><b class="${cls(a.unrealized)}">${money(a.unrealized)}</b>
      <span>Win rate (closed)</span><b>${a.win_rate == null ? "–" : a.win_rate.toFixed(0) + "%"}</b>
      <span>Trades</span><b>${a.n} (${a.closed} closed)</b><span>Return on tickets</span><b class="${cls(a.avg_ret_pct)}">${pct(a.avg_ret_pct)}</b></div></div>`;
  }

  function curve(eq) {
    const W = 900, H = 220, P = 34;
    const all = [...eq.hybrid, ...eq.control];
    if (all.length < 3) return `<div class="muted">The curve starts with the first closed trade.</div>`;
    const x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0])) || x0 + 1;
    let y0 = Math.min(0, ...all.map(p => p[1])), y1 = Math.max(0, ...all.map(p => p[1]));
    if (y1 - y0 < 1) { y1 += 0.5; y0 -= 0.5; }
    const X = t => P + (W - 2 * P) * (t - x0) / Math.max(1, x1 - x0), Y = v => H - P + (-(H - 2 * P)) * (v - y0) / (y1 - y0);
    const path = pts => pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" role="img" aria-label="equity curve">
      <line x1="${P}" x2="${W - P}" y1="${Y(0)}" y2="${Y(0)}" stroke="#2a3644" stroke-dasharray="4 4"/>
      <text x="4" y="${Y(y1) + 4}">${money(y1)}</text><text x="4" y="${Y(y0)}">${money(y0)}</text>
      <path d="${path(eq.control)}" fill="none" stroke="var(--ct)" stroke-width="2.5"/>
      <path d="${path(eq.hybrid)}" fill="none" stroke="var(--hy)" stroke-width="2.5"/>
      <text x="${P}" y="${H - 8}">${esc(et(x0))}</text><text x="${W - P - 120}" y="${H - 8}">${esc(et(x1))}</text></svg>
      <div class="small"><span class="chip">Hybrid</span><span class="chip c">Control (current exits)</span></div>`;
  }

  function render(d) {
    const t = d.test, age = Date.now() / 1000 - d.updated_at;
    const live = $("live"); live.textContent = age < 120 ? "live · " + Math.round(age) + "s ago" : "last update " + et(d.updated_at);
    live.className = "pill " + (age < 120 ? "ok" : "old");
    const prog = Math.min(100, 100 * t.days_elapsed / t.days);
    $("window").innerHTML = `<h2>Test window</h2><div class="kv"><span>Start</span><b>${esc(et(t.start_ts))}</b><span>End</span><b>${esc(et(t.end_ts))}</b>
      <span>Elapsed</span><b>day ${t.days_elapsed.toFixed(1)} of ${t.days}${t.over ? " (over)" : ""}</b>
      <span>Switches</span><b>ladder ${d.switches.ladder ? "on" : "OFF"} · routing ${d.switches.routing ? "on" : "OFF"} · shadow ${d.switches.shadow ? "on" : "OFF"}</b>
      <span>Mode</span><b>${esc(d.mode)}</b><span>Open PAPER positions</span><b>${d.open_paper_positions}</b></div>
      <div class="bar"><i style="width:${prog.toFixed(1)}%"></i></div>`;
    $("arms").innerHTML = armCard("Hybrid ladder", "var(--hy)", d.overall.hybrid) + armCard("Control · current exits", "var(--ct)", d.overall.control);
    const dd = d.overall.hybrid.total - d.overall.control.total;
    $("diff").innerHTML = `<div class="kv"><span>Hybrid − control</span><b class="${cls(dd)}">${money(dd)}</b>
      <span>Bots in the test</span><b>${esc(d.bots.join(", "))}</b></div>`;
    $("curve").innerHTML = curve(d.equity);
    let rows = "";
    for (const [b, v] of Object.entries(d.by_bracket)) {
      const h = v.hybrid, c = v.control, small = h.n && h.n < 10 ? ` <span class="muted small">n&lt;10</span>` : "";
      rows += `<tr><td>${esc(b)}${small}</td><td>${h.n}</td><td class="${cls(h.total)}">${money(h.total)}</td><td>${h.win_rate == null ? "–" : h.win_rate.toFixed(0) + "%"}</td>
        <td class="${cls(c.total)}">${money(c.total)}</td><td>${c.win_rate == null ? "–" : c.win_rate.toFixed(0) + "%"}</td></tr>`;
    }
    $("brackets").innerHTML = `<div class="scroll"><table><tr><th>Age</th><th>n</th><th>Hybrid</th><th>win</th><th>Control</th><th>win</th></tr>${rows}</table></div>`;
    $("trades").innerHTML = d.recent.length ? d.recent.map(r => {
      const rungs = r.hybrid.rungs.map(x => `<span class="chip">+${x.lvl}% → sold ${Math.round(x.of * 100)}%</span>`).join("") || `<span class="chip g">no rung yet</span>`;
      const ev = r.control.events.map(x => `<span class="chip c">${esc(x)}</span>`).join("") || `<span class="chip g">no action yet</span>`;
      const link = r.mint ? `https://dexscreener.com/solana/${encodeURIComponent(r.mint)}` : "#";
      return `<div class="tr"><div class="trh"><a href="${link}" target="_blank" rel="noopener">${esc(r.sym || "?")}</a>
        <span class="muted small">${esc(r.bot)} · ${esc(r.bracket)} (${r.age_h == null ? "age ?" : r.age_h.toFixed(1) + "h"}) · $${r.ticket} · ${esc(et(r.opened_at))}</span></div>
        <div class="arms2"><div><b style="color:var(--hy)">Hybrid</b> <span class="${cls(r.hybrid.pnl)}">${money(r.hybrid.pnl)} (${pct(r.hybrid.pct)})</span>
          <div class="muted small">${r.hybrid.status === "open" ? "open" : "closed · " + esc(r.hybrid.exit)}</div>${rungs}</div>
        <div><b style="color:var(--ct)">Control</b> <span class="${cls(r.control.pnl)}">${money(r.control.pnl)} (${pct(r.control.pct)})</span>
          <div class="muted small">${r.control.status === "open" ? "open" : "closed · " + esc(r.control.exit)}</div>${ev}</div></div></div>`;
    }).join("") : `<div class="muted">No test trades yet. The first copied or theme entry after the start shows up here.</div>`;
    let lr = "";
    for (const [b, v] of Object.entries(d.ladders)) {
      lr += `<tr><td>${esc(b)}</td><td>${v.rungs.map(x => `+${x[0]}% → ${x[1]}%`).join(" · ")}</td><td>+${v.trail[0]}% / −${v.trail[1]}%</td><td>${v.half_dca ? "kept" : "–"}</td></tr>`;
    }
    $("ladders").innerHTML = `<div class="scroll"><table><tr><th>Age</th><th>Rungs (of original)</th><th>Trail arm / trail</th><th>−10% half · adds</th></tr>${lr}</table></div>
      <div class="muted small" style="margin-top:6px">Underneath every row: the trader-sell exit and a −${d.floor_pct}% floor on average cost.</div>`;
    const R = d.routing, m = Object.entries(R.cat_mult).map(([k, v]) => `${esc(k)} ×${v}`).join(" · ");
    $("routing").innerHTML = `<div class="kv"><span>Routing</span><b>${R.enabled ? "on" : "OFF"}</b>
      <span>Hard skip</span><b>mcap under $${(R.min_mcap_usd / 1000).toFixed(0)}k · liquidity under $${(R.min_liq_usd / 1000).toFixed(0)}k</b>
      <span>Proven trader buys</span><b>${esc(R.proven_wallets.join(", "))} ${R.boost.proven_buy >= 0 ? "+" : ""}${R.boost.proven_buy}</b>
      <span>Proven X mention</span><b>@${esc(R.x.proven.join(", @"))} +${R.boost.proven_x}</b>
      <span>Losing wallets</span><b>${esc(R.negative_wallets.join(", "))} ${R.boost.negative_buy}</b>
      <span>Narrative</span><b>${m}</b><span>Mcap over $${(R.mcap_high_usd / 1e6).toFixed(0)}M</span><b>${R.mcap_high_penalty}</b>
      <span>Score needed</span><b>${R.score_min} (${R.score_min_young} if under 1h old) · copied base ${R.copied_base}</b>
      <span>X weights</span><b>proven ${R.x.w.proven}× · watch list ${R.x.w.watch}× · losing ${R.x.w.negative}× · general ${R.x.w.general}×</b></div>
      <div class="muted small" style="margin-top:6px">Watch list: @${esc(R.x.watch.join(", @"))} · losing: @${esc(R.x.negative.join(", @"))}</div>`;
    $("skips").innerHTML = `<div class="muted small">${d.route_skips.n} since the start</div>` + (d.route_skips.recent.map(x =>
      `<div class="tr small"><b>${esc(x.sym || "?")}</b> <span class="muted">${esc(x.src)} · ${esc(et(x.ts))}</span><div class="muted">${esc(x.why)}</div></div>`).join("") || "");
  }

  async function tick() {
    try { const d = await load(); if (d) { data = d; render(d); } else if (data) render(data); }
    catch (e) { $("live").textContent = "offline, retrying"; }
  }
  tick(); setInterval(tick, 15000);
})();
