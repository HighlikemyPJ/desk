// Hand-drawn canvas charts: Home line, Coin candles, score ring. devicePixelRatio aware. No library.
const Charts = (() => {
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function setup(cv) {
    const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
    const x = cv.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0);
    return { x, w: r.width, h: r.height };
  }
  function anim(ms, step) {
    if (RM) { step(1); return; }
    const t0 = performance.now();
    const f = t => { const k = Math.min(1, (t - t0) / ms); step(1 - Math.pow(1 - k, 3)); if (k < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }
  // pts [[ts,value]], marks [{ts,kind,text}], start value -> line + gradient + dashed start + marks
  function line(cv, pts, marks, start, prevLen) {
    const { x, w, h } = setup(cv);
    const top = 64, bot = h - 12;
    const draw = (k, mk) => {
      x.clearRect(0, 0, w, h);
      if (!pts || pts.length < 2) return;
      const n = pts.length, show = prevLen && prevLen < n ? n - 1 + k : n;
      const t0 = pts[0][0], t1 = pts[n - 1][0] || t0 + 1;
      let lo = Math.min(start, ...pts.map(p => p[1])), hi = Math.max(start, ...pts.map(p => p[1]));
      if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
      const X = t => 16 + (w - 32) * (t - t0) / Math.max(1, t1 - t0), Y = v => bot - (bot - top) * (v - lo) / (hi - lo);
      // dashed start line
      x.setLineDash([3, 4]); x.strokeStyle = "rgba(235,235,245,0.3)"; x.lineWidth = 1;
      x.beginPath(); x.moveTo(0, Y(start)); x.lineTo(w, Y(start)); x.stroke(); x.setLineDash([]);
      const P = []; for (let i = 0; i < Math.floor(show); i++) P.push([X(pts[i][0]), Y(pts[i][1])]);
      const fr = show % 1; if (fr && Math.floor(show) < n) { const a = pts[Math.floor(show) - 1], b = pts[Math.floor(show)];
        P.push([X(a[0] + (b[0] - a[0]) * fr), Y(a[1] + (b[1] - a[1]) * fr)]); }
      const g = x.createLinearGradient(0, top, 0, bot); g.addColorStop(0, "rgba(0,211,90,0.28)"); g.addColorStop(1, "rgba(0,211,90,0)");
      x.beginPath(); P.forEach((p, i) => i ? x.lineTo(...p) : x.moveTo(...p)); x.lineTo(P[P.length - 1][0], bot); x.lineTo(P[0][0], bot); x.closePath();
      x.fillStyle = g; x.fill();
      x.beginPath(); P.forEach((p, i) => i ? x.lineTo(...p) : x.moveTo(...p)); x.strokeStyle = "#00d35a"; x.lineWidth = 2; x.lineJoin = "round"; x.stroke();
      const L = P[P.length - 1]; x.fillStyle = "#00d35a"; x.beginPath(); x.arc(L[0], L[1], 4, 0, 7); x.fill();
      // marks above the line, never overlapping: a later mark moves up a row
      x.globalAlpha = mk; x.font = "600 11px -apple-system, sans-serif"; const rows = [];
      (marks || []).filter(m => m.ts >= t0).forEach(m => {
        const mx = X(m.ts), tw = x.measureText(m.text).width + 12;
        let left = Math.min(Math.max(4, mx - tw / 2), w - tw - 4), row = 0;
        while ((rows[row] || []).some(([a, b]) => left < b + 4 && left + tw > a - 4)) row++;
        (rows[row] = rows[row] || []).push([left, left + tw]);
        const y = 6 + row * 22, col = m.kind === "bought" ? "#0a84ff" : m.kind === "sold" ? "#00d35a" : "#ff453a";
        x.fillStyle = col; rr(x, left, y, tw, 18, 9); x.fill();
        x.fillStyle = m.kind === "bought" ? "#fff" : "#000"; x.fillText(m.text, left + 6, y + 13);
        x.strokeStyle = col; x.lineWidth = 1; x.beginPath(); x.moveTo(mx, y + 18); x.lineTo(mx, bot); x.globalAlpha = mk * 0.35; x.stroke(); x.globalAlpha = mk;
      });
      x.globalAlpha = 1;
    };
    const grow = prevLen && prevLen < (pts || []).length;
    anim(grow ? 250 : 1, k => draw(grow ? k : 1, 0));
    setTimeout(() => anim(200, k => draw(1, k)), RM ? 0 : (grow ? 250 : 0));
  }
  function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  // candles [[t,o,h,l,c,vol]], exitLine price (orange dashed)
  function candles(cv, cs, exitLine) {
    const { x, w, h } = setup(cv); x.clearRect(0, 0, w, h);
    if (!cs || !cs.length) { x.fillStyle = "rgba(235,235,245,0.6)"; x.font = "14px -apple-system"; x.textAlign = "center"; x.fillText("Waiting for prices", w / 2, h / 2); return; }
    const vh = 40, top = 8, bot = h - vh - 8;
    let lo = Math.min(...cs.map(c => c[3])), hi = Math.max(...cs.map(c => c[2]));
    if (exitLine) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); }
    if (hi - lo < hi * 1e-6) { hi *= 1.01; lo *= 0.99; }
    const Y = v => bot - (bot - top) * (v - lo) / (hi - lo), n = Math.max(cs.length, 30), cw = (w - 32) / n, vmax = Math.max(1e-9, ...cs.map(c => c[5]));
    cs.forEach((c, i) => {
      const cx = 16 + cw * (i + 0.5) + (n - cs.length) * cw, up = c[4] >= c[1], col = up ? "#00d35a" : "#ff453a";
      x.strokeStyle = x.fillStyle = col; x.lineWidth = 1;
      x.beginPath(); x.moveTo(cx, Y(c[2])); x.lineTo(cx, Y(c[3])); x.stroke();
      const y1 = Y(Math.max(c[1], c[4])), y2 = Y(Math.min(c[1], c[4]));
      x.fillRect(cx - cw * 0.35, y1, cw * 0.7, Math.max(1, y2 - y1));
      x.globalAlpha = 0.5; const vhh = vh * c[5] / vmax; x.fillRect(cx - cw * 0.35, h - vhh, cw * 0.7, vhh); x.globalAlpha = 1;
    });
    if (exitLine) {
      x.setLineDash([5, 4]); x.strokeStyle = "#ff9f0a"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, Y(exitLine)); x.lineTo(w, Y(exitLine)); x.stroke(); x.setLineDash([]);
      x.fillStyle = "#ff9f0a"; x.font = "600 11px -apple-system"; x.fillText("Risk trailing stop", 16, Y(exitLine) - 5);
    }
  }
  function ring(cv, score, min) {
    const { x, w, h } = setup(cv); const r = Math.min(w, h) / 2 - 8, cx = w / 2, cy = h / 2;
    x.clearRect(0, 0, w, h); x.lineWidth = 10; x.lineCap = "round";
    x.strokeStyle = "#2c2c2e"; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
    if (score == null) { x.fillStyle = "rgba(235,235,245,0.3)"; x.font = "600 15px -apple-system"; x.textAlign = "center"; x.fillText("—", cx, cy + 5); return; }
    x.strokeStyle = score >= (min || 70) ? "#00d35a" : "#ffd60a";
    x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * score / 100); x.stroke();
    x.fillStyle = "#fff"; x.font = "600 30px -apple-system"; x.textAlign = "center"; x.fillText(String(score), cx, cy + 10);
  }
  return { line, candles, ring, RM };
})();
