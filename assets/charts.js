/* Grafik-Engine: Linien, Facetten, Balken, Flaeche, Tabelle. Keine Abhaengigkeiten. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var SLOTS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s7)"];
  var AREA = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)"];
  var ENERGIE = { "Braunkohle": "var(--e-braunkohle)", "Steinkohle und Kuppelgase": "var(--e-steinkohle)", "Erdgas": "var(--e-gas)",
    "Kernenergie": "var(--e-kern)", "Wind": "var(--e-wind)", "Photovoltaik": "var(--e-pv)", "Biomasse": "var(--e-bio)", "Wasserkraft": "var(--e-wasser)",
    "Elektro": "var(--s3)", "Plug-in-Hybrid": "var(--t-teal)", "Hybrid ohne Stecker": "var(--s1)", "Diesel": "var(--e-steinkohle)", "Benzin": "var(--s4)", "Sonstige (Gas, Wasserstoff u. a.)": "var(--e-gas)" };
  var EREIGNISSE = { 1990: "Wiedervereinigung", 2002: "Euro-Bargeld", 2009: "Finanzkrise", 2020: "Pandemie", 2022: "Energiepreiskrise" };
  var tip;

  function el(tag, attrs, parent, style) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (style) for (var s in style) e.style[s] = style[s];
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function nf(dec) { return new Intl.NumberFormat("de-DE", { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
  function unitSuffix(u) {
    if (!u || /^Index/.test(u)) return "";
    if (u === "€") return " €";
    return " " + u;
  }
  function fmt(d, v, dec) { if (v == null || isNaN(v)) return "–"; return nf(dec == null ? d.dezimal : dec).format(v); }
  function fmtU(d, v, dec, unit) { if (v == null || isNaN(v)) return "–"; return fmt(d, v, dec) + unitSuffix(unit || d._unit); }
  function isQ(p) { if (typeof p !== "number") return false; var f = (p - Math.floor(p)) * 4; return Math.abs(f - Math.round(f) - 0.004) < 1e-6; }
  function periodLabel(p) { if (isQ(p)) return (Math.round((p - Math.floor(p)) * 4) + 1) + ". Qu. " + Math.floor(p); if (typeof p === "number" && p % 1) { var jj = Math.floor(p), mm = Math.round((p - jj) * 12); return ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."][mm] + " " + jj; } var m = /^(\d{4})-S([12])$/.exec(String(p)); return m ? m[2] + ". Hj. " + m[1] : String(p); }
  function axisFmt(d, v, step) {
    var dec = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
    var u = d._unit; var a = Math.abs(v);
    if (u === "€" && a >= 1000) return nf(0).format(v / 1000) + " T€";
    var s = nf(dec).format(v);
    if (u === "%" || /^% /.test(u)) return s + " %";
    return s;
  }
  function niceTicks(min, max, count) {
    if (min === max) { min -= 1; max += 1; }
    var span = max - min, step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0))), r = step0 / mag;
    var step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    var lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step, t = [];
    for (var v = lo; v <= hi + step * 1e-6; v += step) t.push(Math.round(v / step) * step);
    t.step = step; return t;
  }
  function domainTicks(d, vals, count) {
    var f = vals.filter(function (v) { return v != null && !isNaN(v); });
    var mn = Math.min.apply(null, f), mx = Math.max.apply(null, f);
    (d.referenzlinien || []).forEach(function (r) { mn = Math.min(mn, r.wert); mx = Math.max(mx, r.wert); });
    if (d.achse_null || d.typ === "balken" || d.typ === "flaeche") { mn = Math.min(0, mn); mx = Math.max(0, mx); }
    else { var pad = (mx - mn) * 0.04, m0 = mn; mn -= pad; mx += pad; if (m0 >= 0 && mn < 0) mn = 0; }
    return niceTicks(mn, mx, count);
  }

  // ---------------- data access ----------------
  function mode(d, st) {
    if (st.werte === "real" && d.values.real) return "real";
    if (st.werte === "absolut" && d.values.absolut) return "absolut";
    return "nominal";
  }
  function getVals(d, st) {
    var m = mode(d, st), v = d.values[m];
    if (d.typ === "sankey") {
      var o = {}; d.series.forEach(function (sr) { o[sr.code] = v[sr.code].map(function (x, i) {
        if (x == null) return null; if (st.einheit === "bip") return x / d.bip[i] * 100; if (st.einheit === "kopf") return x * 1e9 / d.bev[i]; return x; }); });
      d.series.forEach(function (sr) { if (sr.gruppe === "kind" && sr.eltern !== st.offen) delete o[sr.code]; });
      return o;
    }
    if (d.typ === "flaeche" && st.modus === "anteil") {
      var out = {}; d.series.forEach(function (s) { out[s.code] = []; });
      d.years.forEach(function (y, i) {
        var tot = 0; d.series.forEach(function (s) { var x = v[s.code][i]; if (x != null) tot += x; });
        d.series.forEach(function (s) { var x = v[s.code][i]; out[s.code].push(x == null || !tot ? null : x / tot * 100); });
      });
      return out;
    }
    return v;
  }
  function unitFor(d, st) {
    if (d.typ === "sankey") return st.einheit === "bip" ? "% des BIP" : st.einheit === "kopf" ? "€ je Einwohner" : "Mrd. €";
    if (d.typ === "flaeche" && st.modus === "anteil") return "%";
    if (mode(d, st) === "absolut") return d.einheit_absolut || "";
    return d.einheit;
  }
  function decFor(d, st) { if (d.typ === "sankey") return st.einheit === "bip" ? 1 : 0; if (d.typ === "flaeche" && st.modus === "anteil") return 1; if (mode(d, st) === "absolut" && d.dezimal_absolut != null) return d.dezimal_absolut; return d.dezimal; }
  function lastIdx(arr) { for (var i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i; return -1; }
  function firstIdx(arr) { for (var i = 0; i < arr.length; i++) if (arr[i] != null) return i; return -1; }
  function label(d, code) { for (var i = 0; i < d.series.length; i++) if (d.series[i].code === code) return d.series[i].label; return code; }
  function baseIdx(d, vals) {
    var n = d.series.length;
    for (var i = 0; i < d.years.length; i++) { var k = 0; d.series.forEach(function (s) { if (vals[s.code][i] != null) k++; }); if (k >= 0.8 * n) return i; }
    return 0;
  }
  function changeText(d, arr, unit, from) {
    var a = Math.max(from || 0, firstIdx(arr)), b = lastIdx(arr); if (a < 0 || b <= a) return "";
    if (d.veraenderung === "pp") { var x = arr[b] - arr[a]; return (x >= 0 ? "+" : "−") + nf(1).format(Math.abs(x)) + " Pp."; }
    if (arr[a] === 0) return "";
    var c = (arr[b] / arr[a] - 1) * 100; return (c >= 0 ? "+" : "−") + nf(Math.abs(c) < 10 ? 1 : 0).format(Math.abs(c)) + " %";
  }

  // ---------------- tooltip ----------------
  function showTip(ev, html) {
    if (!tip) { tip = h("div", "tooltip"); document.body.appendChild(tip); }
    tip.innerHTML = html; tip.style.display = "block";
    var pad = 14, x = ev.pageX + pad, y = ev.pageY + pad, tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > window.scrollX + document.documentElement.clientWidth - 8) x = ev.pageX - tw - pad;
    if (y + th > window.scrollY + window.innerHeight - 8) y = ev.pageY - th - pad;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { if (tip) tip.style.display = "none"; }

  // ---------------- common drawing ----------------
  function yAxis(svg, d, ticks, m, W, yv, showLabels, inside) {
    ticks.forEach(function (t) {
      el("line", { x1: m.l, x2: W - m.r, y1: yv(t), y2: yv(t) }, svg, { stroke: t === 0 ? "var(--axis)" : "var(--grid)", strokeWidth: 1 });
      if (!showLabels) return;
      if (inside) { if (yv(t) - 3 > 10) el("text", { x: m.l + 1, y: yv(t) - 3, class: "halo" }, svg).textContent = axisFmt(d, t, ticks.step); }
      else el("text", { x: m.l - 6, y: yv(t) + 4, "text-anchor": "end" }, svg).textContent = axisFmt(d, t, ticks.step);
    });
  }
  function xTicksYears(y0, y1, W, mon) {
    var span = y1 - y0;
    if (mon && span <= 3) {   // Monatsdaten, kurzer Ausschnitt: Quartalsanfänge (oder Halbjahre) statt ganzer Jahre
      var st = span <= 1.6 ? 0.25 : 0.5, tt = [];
      for (var q = Math.ceil(y0 / st - 1e-9) * st; q <= y1 + 1e-9; q += st) tt.push(q);
      return tt;
    }
    var span = y1 - y0, n = W < 420 ? 3 : W < 700 ? 5 : 8, steps = [1, 2, 5, 10, 20], step = 1;
    for (var i = 0; i < steps.length; i++) { step = steps[i]; if (span / step <= n) break; }
    var t = []; for (var y = Math.ceil(y0 / step) * step; y <= y1; y += step) t.push(y);
    return t;
  }
  function refLines(svg, d, m, W, yv, withText) {
    (d.referenzlinien || []).forEach(function (r) {
      el("line", { x1: m.l, x2: W - m.r, y1: yv(r.wert), y2: yv(r.wert), "stroke-dasharray": "6 4" }, svg, { stroke: "var(--text-muted)", strokeWidth: 1 });
      if (withText) el("text", { x: W - m.r - 2, y: yv(r.wert) - 4, "text-anchor": "end", class: "halo" }, svg).textContent = r.text;
    });
  }
  function eventLines(svg, d, x, m, H, Y0, Y1) {
    (d.ereignisse || []).forEach(function (y) {
      if (y < Y0 || y > Y1) return;
      el("line", { x1: x(y), x2: x(y), y1: m.t, y2: H - m.b, "stroke-dasharray": "2 3" }, svg, { stroke: "var(--axis)" });
      el("text", { x: x(y) + 4, y: m.t + 10, class: "halo" }, svg).textContent = EREIGNISSE[y] || y;
    });
  }
  function breakLines(svg, d, codes, x, m, H, withText) {
    var br = d.brueche || {}, done = {};
    codes.forEach(function (c) {
      var y = br[c]; if (!y || done[y]) return; done[y] = 1;
      el("line", { x1: x(y - 0.5), x2: x(y - 0.5), y1: m.t, y2: H - m.b, "stroke-dasharray": "1 3" }, svg, { stroke: "var(--text-muted)", strokeWidth: 1.2 });
      if (withText) { var W0 = +svg.getAttribute("width") || 0, tx = d.bruch_text || "Methodenwechsel", xr = x(y - 0.5), rt = W0 && xr + 4 + tx.length * 6 > W0;
        el("text", { x: rt ? xr - 4 : xr + 4, y: H - m.b - 6, class: "halo", "text-anchor": rt ? "end" : "start" }, svg).textContent = tx; }
    });
  }
  function pathFor(arr, years, x, yv, brk) {
    var p = "", pen = false;
    for (var i = 0; i < years.length; i++) {
      var v = arr[i]; if (v == null || years[i] === brk) pen = false; if (v == null) continue;
      p += (pen ? "L" : "M") + x(years[i]).toFixed(1) + "," + yv(v).toFixed(1); pen = true;
    }
    return p;
  }
  function brk(d, k) { return (d.brueche || {})[k]; }
  function natMarks(svg, d, k, years, vals, x, yv, color, r) {
    ((d.ergaenzt || {})[k] || []).forEach(function (y) {
      var i = years.indexOf(y); if (i < 0 || vals[k][i] == null) return;
      el("circle", { cx: x(y), cy: yv(vals[k][i]), r: r || 3.5 }, svg, { fill: "var(--surface)", stroke: color, strokeWidth: 1.8 });
    });
  }
  function singlePts(svg, years, vals, x, yv, color) {
    vals.forEach(function (v, i) {
      if (v == null || (i > 0 && vals[i - 1] != null) || (i < vals.length - 1 && vals[i + 1] != null)) return;
      el("circle", { cx: x(years[i]), cy: yv(v), r: 5 }, svg, { fill: color, stroke: "var(--surface)", strokeWidth: 2 });
    });
  }
  function legend(box, items) {
    box.innerHTML = items.map(function (it) {
      if (it.box) return '<span><i class="box" style="background:' + it.color + '"></i>' + esc(it.label) + "</span>";
      return '<span><i style="border-top-color:' + it.color + ";border-top-style:" + (it.dashed ? "dashed" : "solid") + '"></i>' + esc(it.label) + "</span>";
    }).join("");
  }

  // ---------------- views ----------------
  function colorMap(d, st) {
    var map = {}; st.sel.forEach(function (c, i) { map[c] = SLOTS[i]; }); return map;
  }

  // ---------------- Kennzahl-Boxen über der Grafik ----------------
  function deltaTxt(d, v, pv, dec, u) {
    if (v == null || pv == null) return "";
    var pp = d.veraenderung === "pp" || /%/.test(u || "");
    var x = pp ? v - pv : (pv ? (v / pv - 1) * 100 : null); if (x == null || !isFinite(x)) return "";
    var s = nf(pp ? Math.max(1, Math.min(2, dec || 1)) : 1).format(Math.abs(x)); if (/^0,0+$/.test(s)) return "unverändert";
    return (x > 0 ? "+" : "−") + s + (pp ? " Pp." : " %");
  }
  function boxU(u) { return /^% /.test(u || "") ? "%" : u; }
  function statBoxes(c, items, cap) {
    var box = c.stats; if (!box) return;
    box.style.display = items.length ? "" : "none";
    box.innerHTML = items.map(function (it) {
      return '<div class="stat" style="--sc:' + (it.color || "var(--border-strong)") + '"' + (it.dashed ? ' data-ref="1"' : "") + '><div class="st-l"><span>' + esc(it.label) + '</span>' + (it.per ? '<span class="st-p">' + esc(it.per) + "</span>" : "") + '</div><div class="st-v">' + it.value + "</div>" + (it.sub ? '<div class="st-s">' + esc(it.sub) + "</div>" : "") + "</div>";
    }).join("");
    box.dataset.cap = cap || "";
  }
  function lineStats(c, d, st, vals, codes, cmap, ref, iHover) {
    var years = d.years, u = boxU(c._unit), dec = decFor(d, st);
    var iL = -1; codes.forEach(function (k) { iL = Math.max(iL, lastIdx(vals[k])); });
    var i = iHover == null ? iL : iHover; if (i < 0) { statBoxes(c, []); return; }
    var items = codes.map(function (k) {
      var arr = vals[k], j = i; if (iHover == null && arr[j] == null) j = lastIdx(arr);
      var v = j < 0 ? null : arr[j], pj = j - 1; while (pj >= 0 && arr[pj] == null) pj--;
      var pv = pj >= 0 ? arr[pj] : null;
      return { k: k, label: label(d, k), v: v, color: k === ref ? "var(--ref)" : cmap[k], dashed: k === ref,
        per: j >= 0 ? periodLabel(years[j]) : "", value: fmtU(d, v, dec, u), sub: pv != null && v != null ? deltaTxt(d, v, pv, dec, u) + " ggü. " + periodLabel(years[pj]) : "" };
    });
    items.sort(function (a, b) { return (b.v == null ? -1e18 : b.v) - (a.v == null ? -1e18 : a.v); });
    statBoxes(c, items, iHover == null ? "letzter Stand" : "Zeiger");
  }

  function drawLines(c, d, st) {
    var vals = getVals(d, st), years = d.years, Y0 = years[0], Y1 = years[years.length - 1];
    var W = c.chart.clientWidth, narrow = W < 560;
    var H = Math.max(260, Math.min(400, W * 0.48));
    var ref = d.referenz, others = d.series.map(function (s) { return s.code; }).filter(function (k) { return k !== ref; });
    var cmap = colorMap(d, st);
    var shown = st.sel.slice(); if (ref && vals[ref]) shown.push(ref);
    var m = { l: 52, r: narrow ? 12 : 150, t: 14, b: 26 };
    var svg = el("svg", { width: W, height: H, role: "img", "aria-label": d.titel }, c.chart);
    var all = []; d.series.forEach(function (s) { all = all.concat(vals[s.code]); });
    var ticks = domainTicks(d, all, 5), ymin = ticks[0], ymax = ticks[ticks.length - 1];
    var x = function (y) { return m.l + (y - Y0) / Math.max(1, Y1 - Y0) * (W - m.l - m.r); };
    var yv = function (v) { return H - m.b - (v - ymin) / (ymax - ymin) * (H - m.t - m.b); };
    yAxis(svg, d, ticks, m, W, yv, true, false);
    xTicksYears(Y0, Y1, W - m.l - m.r, (d.periode === "monat" || d.periode === "quartal")).forEach(function (y) { el("text", { x: x(y), y: H - 8, "text-anchor": "middle" }, svg).textContent = periodLabel(y); });
    refLines(svg, d, m, W, yv, !narrow);
    eventLines(svg, d, x, m, H, Y0, Y1);
    breakLines(svg, d, shown, x, m, H, true);
    var ctx = others.filter(function (k) { return !cmap[k] && st.kontext !== "aus"; });
    ctx.forEach(function (k) {
      el("path", { d: pathFor(vals[k], years, x, yv, brk(d, k)), fill: "none" }, svg, { stroke: "var(--context)", strokeWidth: 1 });
    });
    var hl = el("path", { fill: "none", visibility: "hidden", "stroke-linejoin": "round" }, svg, { stroke: "var(--text-secondary)", strokeWidth: 2 });
    var hlLab = el("text", { class: "lab halo", visibility: "hidden" }, svg, { fontWeight: "600" });
    if (ref && vals[ref]) el("path", { d: pathFor(vals[ref], years, x, yv, brk(d, ref)), fill: "none", "stroke-dasharray": "5 4" }, svg, { stroke: "var(--ref)", strokeWidth: 1.6 });
    st.sel.forEach(function (k) {
      var p = pathFor(vals[k], years, x, yv, brk(d, k));
      el("path", { d: p, fill: "none" }, svg, { stroke: "var(--surface)", strokeWidth: 5 });
      el("path", { d: p, fill: "none", "stroke-linejoin": "round" }, svg, { stroke: cmap[k], strokeWidth: 2 });
      natMarks(svg, d, k, years, vals, x, yv, cmap[k], 4);
      singlePts(svg, years, vals[k], x, yv, cmap[k]);
    });
    if (!narrow) {
      var labs = shown.map(function (k) { var i = lastIdx(vals[k]); return i < 0 ? null : { k: k, x: x(years[i]), y: yv(vals[k][i]) }; }).filter(Boolean).sort(function (a, b) { return a.y - b.y; });
      for (var i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 14) labs[i].y = labs[i - 1].y + 14;
      labs.forEach(function (l) { var t = el("text", { x: l.x + 8, y: l.y + 4, class: "lab" }, svg); t.textContent = trunc(label(d, l.k), 24); });
    }
    var cross = el("line", { y1: m.t, y2: H - m.b, visibility: "hidden" }, svg, { stroke: "var(--text-muted)" });
    var dots = shown.map(function (k) { return el("circle", { r: 4, visibility: "hidden" }, svg, { fill: k === ref ? "var(--ref)" : cmap[k], stroke: "var(--surface)", strokeWidth: 2 }); });
    var hit = el("rect", { x: m.l, y: m.t, width: Math.max(0, W - m.l - m.r), height: H - m.t - m.b, fill: "transparent" }, svg);
    var u = c._unit, dec = decFor(d, st);
    lineStats(c, d, st, vals, shown, cmap, ref, null);
    function move(ev) {
      var r = svg.getBoundingClientRect(), px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      var yr = Math.round(Y0 + (px - m.l) / (W - m.l - m.r) * (Y1 - Y0)); yr = Math.max(Y0, Math.min(Y1, yr));
      var i = years.indexOf(yr);
      cross.setAttribute("x1", x(yr)); cross.setAttribute("x2", x(yr)); cross.setAttribute("visibility", "visible");
      shown.forEach(function (k, j) { var v = vals[k][i]; if (v == null) { dots[j].setAttribute("visibility", "hidden"); return; } dots[j].setAttribute("cx", x(yr)); dots[j].setAttribute("cy", yv(v)); dots[j].setAttribute("visibility", "visible"); });
      // naechste Linie zum Zeiger finden (graue Kontextlinien und hervorgehobene)
      var py = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top, best = null, bd = 1e9;
      ctx.concat(st.sel).forEach(function (k) { var v = vals[k][i]; if (v == null) return; var dd = Math.abs(yv(v) - py); if (dd < bd) { bd = dd; best = k; } });
      near = bd <= 10 ? best : null;
      var isCtx = near && ctx.indexOf(near) >= 0;
      if (isCtx) {
        hl.setAttribute("d", pathFor(vals[near], years, x, yv, brk(d, near))); hl.setAttribute("visibility", "visible");
        var li = lastIdx(vals[near]); hlLab.textContent = trunc(label(d, near), 24);
        hlLab.setAttribute("x", narrow ? m.l + 6 : x(years[li]) + 8); hlLab.setAttribute("y", narrow ? m.t + 12 : yv(vals[near][li]) + 4); hlLab.setAttribute("visibility", "visible");
      } else { hl.setAttribute("visibility", "hidden"); hlLab.setAttribute("visibility", "hidden"); }
      hit.style.cursor = near ? "pointer" : "crosshair";
      lineStats(c, d, st, vals, shown, cmap, ref, i);
      if (c.stats && shown.length) {
        if (isCtx) showTip(ev, '<div class="t-year">' + yr + '</div><div class="row hl"><span><span class="sw line" style="background:var(--text-secondary)"></span><b>' + esc(label(d, near)) + '</b></span><span class="num"><b>' + fmtU(d, vals[near][i], dec, u) + '</b></span></div><div class="t-hint">Klicken, um diese Linie hervorzuheben</div>');
        else if (near) showTip(ev, '<div class="t-hint" style="margin:0">Klicken, um ' + esc(label(d, near)) + " abzuwählen</div>");
        else hideTip();
        return;
      }
      var rows = shown.map(function (k) { return { k: k, v: vals[k][i] }; }).sort(function (a, b) { return (b.v == null ? -1e18 : b.v) - (a.v == null ? -1e18 : a.v); });
      var top = isCtx ? '<div class="row hl"><span><span class="sw line" style="background:var(--text-secondary)"></span><b>' + esc(label(d, near)) + '</b></span><span class="num"><b>' + fmtU(d, vals[near][i], dec, u) + '</b></span></div><div class="t-hint">Klicken, um diese Linie hervorzuheben</div>' :
        (near ? '<div class="t-hint">Klicken, um ' + esc(label(d, near)) + " abzuwählen</div>" : "");
      showTip(ev, '<div class="t-year">' + yr + "</div>" + top + rows.map(function (o) {
        return '<div class="row"><span><span class="sw line" style="background:' + (o.k === ref ? "var(--ref)" : cmap[o.k]) + '"></span>' + esc(label(d, o.k)) + '</span><span class="num">' + fmtU(d, o.v, dec, u) + "</span></div>";
      }).join(""));
    }
    var near = null;
    hit.addEventListener("pointermove", move);
    hit.addEventListener("click", function (ev) {
      move(ev); if (!near) return;
      if (st.sel.indexOf(near) >= 0) st.sel = st.sel.filter(function (k) { return k !== near; });
      else { st.sel.push(near); if (st.sel.length > maxSel(d)) st.sel.shift(); }
      c.touched = true; hideTip(); render(c);
    });
    hit.addEventListener("pointerleave", function () { hl.setAttribute("visibility", "hidden"); hlLab.setAttribute("visibility", "hidden"); cross.setAttribute("visibility", "hidden"); dots.forEach(function (o) { o.setAttribute("visibility", "hidden"); }); hideTip(); lineStats(c, d, st, vals, shown, cmap, ref, null); });
    var items = st.sel.map(function (k) { return { label: label(d, k), color: cmap[k] }; });
    if (ref && vals[ref]) items.push({ label: label(d, ref), color: "var(--ref)", dashed: true });
    if (others.length > st.sel.length && st.kontext !== "aus") items.push({ label: "übrige", color: "var(--context)" });
    if (narrow) (d.referenzlinien || []).forEach(function (r) { items.push({ label: r.text, color: "var(--text-muted)", dashed: true }); });
    legend(c.legend, items);
  }
  function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  function drawFacets(c, d, st) {
    var vals = getVals(d, st), years = d.years, Y0 = years[0], Y1 = years[years.length - 1];
    var W = c.chart.clientWidth, cols = W >= 880 ? 4 : W >= 600 ? 3 : 2;
    var ref = d.referenz, codes = d.series.map(function (s) { return s.code; });
    var body = codes.filter(function (k) { return k !== ref; });
    if (st.sort === "wert") body.sort(function (a, b) { var A = vals[a][lastIdx(vals[a])], B = vals[b][lastIdx(vals[b])]; return (B == null ? -1e18 : B) - (A == null ? -1e18 : A); });
    else if (st.sort === "alpha") body.sort(function (a, b) { return label(d, a).localeCompare(label(d, b), "de"); });
    var panels = (ref && vals[ref] ? [ref] : []).concat(body);
    var grid = h("div", "facets"); grid.style.gridTemplateColumns = "repeat(" + cols + ",minmax(0,1fr))"; c.chart.appendChild(grid);
    var pw = Math.floor((W - 12 * (cols - 1)) / cols), PH = W < 600 ? 105 : 120;
    var all = []; codes.forEach(function (k) { all = all.concat(vals[k]); });
    var shared = domainTicks(d, all, 3);
    var rows = Math.ceil(panels.length / cols), refs = [], u = c._unit, dec = decFor(d, st);
    var b0 = baseIdx(d, vals), shortU = (u === "%" || u === "€" || /^% /.test(u)) ? u.split(" ")[0] : "";
    panels.forEach(function (k, idx) {
      var col = idx % cols, isRef = k === ref, isDE = k === "DE" && !isRef;
      var cell = h("div"); grid.appendChild(cell);
      var head = h("div", "panel-head"), nm = h("span", "name"), vl = h("span", "val");
      nm.textContent = label(d, k); nm.title = label(d, k); if (isDE) nm.style.boxShadow = "inset 0 -2px 0 var(--s1)";
      var li = lastIdx(vals[k]);
      var ct = changeText(d, vals[k], u, b0);
      var dv = li < 0 ? "–" : (years[li] !== Y1 ? years[li] + ": " : "") + fmtU(d, vals[k][li], dec, shortU) + (ct ? " · " + ct : "");
      vl.textContent = dv; head.appendChild(nm); head.appendChild(vl); cell.appendChild(head);
      var ticks = shared;
      if (st.achse === "je-feld") {
        var own = vals[k].slice(); if (ref && vals[ref] && !isRef) own = own.concat(vals[ref]);
        ticks = domainTicks(d, own, 3);
      }
      var ymin = ticks[0], ymax = ticks[ticks.length - 1];
      var lastRow = idx + cols >= panels.length;
      var m = { l: 4, r: 4, t: 4, b: lastRow ? 18 : 4 }, Hh = PH + m.b;
      var svg = el("svg", { width: pw, height: Hh, role: "img", "aria-label": label(d, k) }, cell);
      var x = function (y) { return m.l + (y - Y0) / Math.max(1, Y1 - Y0) * (pw - m.l - m.r); };
      var yv = function (v) { return Hh - m.b - (v - ymin) / (ymax - ymin) * (Hh - m.t - m.b); };
      yAxis(svg, d, ticks, m, pw, yv, col === 0 || st.achse === "je-feld", true);
      refLines(svg, d, m, pw, yv, idx === 0 && pw >= 260);
      breakLines(svg, d, [k], x, m, Hh, false);
      if (lastRow) [[Y0, "start"], [Math.round((Y0 + Y1) / 2), "middle"], [Y1, "end"]].forEach(function (a) { el("text", { x: x(a[0]), y: Hh - 4, "text-anchor": a[1] }, svg).textContent = a[0]; });
      if (st.achse === "gemeinsam") body.filter(function (o) { return o !== k; }).forEach(function (o) { el("path", { d: pathFor(vals[o], years, x, yv, brk(d, o)), fill: "none" }, svg, { stroke: "var(--context)", strokeWidth: 0.8 }); });
      if (!isRef && ref && vals[ref]) el("path", { d: pathFor(vals[ref], years, x, yv, brk(d, ref)), fill: "none", "stroke-dasharray": "4 3" }, svg, { stroke: "var(--ref)", strokeWidth: 1.2 });
      el("path", { d: pathFor(vals[k], years, x, yv, brk(d, k)), fill: "none", "stroke-linejoin": "round" }, svg, { stroke: isRef ? "var(--ref)" : "var(--s1)", strokeWidth: 2 });
      natMarks(svg, d, k, years, vals, x, yv, isRef ? "var(--ref)" : "var(--s1)", 3);
      var cross = el("line", { y1: m.t, y2: Hh - m.b, visibility: "hidden" }, svg, { stroke: "var(--text-muted)" });
      var dot = el("circle", { r: 3.5, visibility: "hidden" }, svg, { fill: isRef ? "var(--ref)" : "var(--s1)", stroke: "var(--surface)", strokeWidth: 2 });
      var hit = el("rect", { x: 0, y: 0, width: pw, height: Hh, fill: "transparent" }, svg);
      refs.push({ k: k, x: x, yv: yv, cross: cross, dot: dot, vl: vl, dv: dv });
      hit.addEventListener("pointermove", function (ev) { var r = svg.getBoundingClientRect(); var yr = Math.round(Y0 + (ev.clientX - r.left - m.l) / (pw - m.l - m.r) * (Y1 - Y0)); sync(Math.max(Y0, Math.min(Y1, yr))); });
      hit.addEventListener("pointerleave", function () { sync(null); });
    });
    function sync(yr) {
      var i = yr == null ? -1 : years.indexOf(yr);
      refs.forEach(function (o) {
        var v = i < 0 ? null : vals[o.k][i];
        if (yr == null || v == null) { o.cross.setAttribute("visibility", yr == null ? "hidden" : "visible"); o.dot.setAttribute("visibility", "hidden"); o.vl.textContent = yr == null ? o.dv : yr + ": –"; if (yr != null) { o.cross.setAttribute("x1", o.x(yr)); o.cross.setAttribute("x2", o.x(yr)); } return; }
        var xx = o.x(yr); o.cross.setAttribute("x1", xx); o.cross.setAttribute("x2", xx); o.cross.setAttribute("visibility", "visible");
        o.dot.setAttribute("cx", xx); o.dot.setAttribute("cy", o.yv(v)); o.dot.setAttribute("visibility", "visible");
        o.vl.textContent = yr + ": " + fmtU(d, v, dec, shortU);
      });
    }
    c.hint.className = st.achse === "je-feld" ? "hint warn" : "hint";
    c.hint.textContent = st.achse === "je-feld" ? "Jedes Feld hat eine eigene y-Achse. Vergleichbar ist nur die Form der Entwicklung, nicht die Höhe." :
      "Gleiche y-Achse in allen Feldern." + (body.length > 1 ? " Grau: die übrigen Reihen als Kontext." : "") + (ref && vals[ref] ? " Gestrichelt: " + label(d, ref) + "." : "") + " Rechts oben: letzter Wert und Veränderung seit " + years[b0] + ".";
    var items = [{ label: d.reihen && d.reihen.dim === "geo" ? "Land bzw. Region" : "Reihe", color: "var(--s1)" }];
    if (ref && vals[ref]) items.push({ label: label(d, ref), color: "var(--ref)", dashed: true });
    if (st.achse === "gemeinsam" && body.length > 1) items.push({ label: "übrige", color: "var(--context)" });
    legend(c.legend, items);
  }

  function drawBars(c, d, st) {
    var vals = getVals(d, st), i = d.years.map(String).indexOf(String(st.jahr)); if (i < 0) i = d.years.length - 1;
    var ref = d.referenz, u = c._unit, dec = decFor(d, st);
    var rows = d.series.map(function (s) { return { k: s.code, v: vals[s.code][i] }; }).filter(function (r) { return r.v != null; });
    if (d.sortierung !== "keine") rows.sort(function (a, b) { return b.v - a.v; });
    var fcol = function (k) { var f = d.farben || {}; for (var p in f) if (k.indexOf(p) === 0) return f[p]; return null; };
    (function () {
      var u0 = boxU(c._unit), dc = decFor(d, st), per = periodLabel(d.years[i]), byV = rows.slice().sort(function (a, b) { return b.v - a.v; });
      var land = byV.filter(function (r) { return !/^EU|^EA/.test(r.k); }), items = [];
      var de = land.filter(function (r) { return r.k === "DE"; })[0], eu = rows.filter(function (r) { return r.k === d.referenz || r.k === "EU27_2020"; })[0];
      if (de) items.push({ label: "Deutschland", per: per, color: "var(--s1)", value: fmtU(d, de.v, dc, u0), sub: "Platz " + (land.indexOf(de) + 1) + " von " + land.length });
      if (eu) items.push({ label: label(d, eu.k), per: per, color: "var(--ref)", dashed: true, value: fmtU(d, eu.v, dc, u0), sub: de ? "Deutschland " + deltaTxt(d, de.v, eu.v, dc, u0).replace("unverändert", "gleichauf") : "" });
      if (land.length > 2 && d.sortierung !== "keine") {
        items.push({ label: "Höchster Wert", per: per, color: "var(--bar)", value: fmtU(d, land[0].v, dc, u0), sub: label(d, land[0].k) });
        items.push({ label: "Niedrigster Wert", per: per, color: "var(--bar)", value: fmtU(d, land[land.length - 1].v, dc, u0), sub: label(d, land[land.length - 1].k) });
      }
      statBoxes(c, de || eu ? items : []);
    })();
    var maxL = Math.max.apply(null, rows.map(function (r) { return label(d, r.k).length; }));
    var W = c.chart.clientWidth, lw = W < 480 ? 96 : Math.min(250, Math.max(120, maxL * 6.4 + 14)), vw = 70, bh = 18, gap = 5, m = { t: 6, b: 22 };
    var H = m.t + m.b + rows.length * (bh + gap);
    var svg = el("svg", { width: W, height: H, role: "img", "aria-label": d.titel }, c.chart);
    var ticks = domainTicks(d, rows.map(function (r) { return r.v; }), 4), xmin = ticks[0], xmax = ticks[ticks.length - 1];
    var x = function (v) { return lw + (v - xmin) / (xmax - xmin) * (W - lw - vw); };
    ticks.forEach(function (t) {
      el("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b }, svg, { stroke: t === 0 ? "var(--axis)" : "var(--grid)" });
      el("text", { x: x(t), y: H - 6, "text-anchor": "middle" }, svg).textContent = axisFmt(d, t, ticks.step);
    });
    rows.forEach(function (r, j) {
      var y = m.t + j * (bh + gap), isRef = r.k === ref, isDE = r.k === "DE";
      var col = fcol(r.k) || (isRef ? "var(--ref)" : isDE ? "var(--s1)" : "var(--bar)");
      var t = el("text", { x: lw - 8, y: y + bh / 2 + 4, "text-anchor": "end", class: "lab" }, svg, { fontWeight: isDE || isRef ? "600" : "400", fill: isDE || isRef ? "var(--text-primary)" : "" });
      t.textContent = trunc(label(d, r.k), W < 480 ? 13 : Math.floor((lw - 14) / 6.4));
      var x0 = x(Math.max(0, xmin)), x1 = x(r.v), a = Math.min(x0, x1), w = Math.max(1, Math.abs(x1 - x0));
      var rect = el("rect", { x: a, y: y, width: w, height: bh, rx: 3 }, svg, { fill: col });
      el("text", { x: (r.v >= 0 ? a + w : a) + (r.v >= 0 ? 6 : -6), y: y + bh / 2 + 4, "text-anchor": r.v >= 0 ? "start" : "end", class: "lab" }, svg).textContent = fmt(d, r.v, dec);
      var hit = el("rect", { x: 0, y: y - gap / 2, width: W, height: bh + gap, fill: "transparent" }, svg);
      hit.addEventListener("pointermove", function (ev) { rect.style.opacity = .8; showTip(ev, '<div class="t-year">' + esc(label(d, r.k)) + '</div><div class="row"><span>' + periodLabel(d.years[i]) + '</span><span class="num">' + fmtU(d, r.v, dec, u) + "</span></div><div class=\"row\"><span>Rang</span><span class=\"num\">" + (j + 1) + " von " + rows.length + "</span></div>"); });
      hit.addEventListener("pointerleave", function () { rect.style.opacity = 1; hideTip(); });
    });
    if (d.legende) { legend(c.legend, d.legende.map(function (l) { return { label: l.label, color: l.color, box: true }; })); return; }
    var items = []; if (rows.some(function (r) { return r.k === "DE"; })) items.push({ label: "Deutschland", color: "var(--s1)", box: true });
    if (ref && ref !== "DE") items.push({ label: label(d, ref), color: "var(--ref)", box: true });
    items.push({ label: "übrige", color: "var(--bar)", box: true });
    legend(c.legend, items);
  }


  // ---------------- Sankey: Einnahmen -> Staat -> Ausgaben ----------------
  var QCOL = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)"];
  function drawSankey(c, d, st) {
    var vals = getVals(d, st), i = d.years.map(String).indexOf(String(st.jahr)); if (i < 0) i = d.years.length - 1;
    var u = c._unit, dec = decFor(d, st);
    var Q = d.series.filter(function (s) { return s.gruppe === "quelle" && vals[s.code][i] > 0; });
    var Z = d.series.filter(function (s) { return s.gruppe === "ziel" && vals[s.code][i] > 0; });
    var S = st.offen ? d.series.filter(function (s) { return s.gruppe === "kind" && s.eltern === st.offen && vals[s.code] && vals[s.code][i] > 0; }) : [];
    var hasKids = {}; d.series.forEach(function (s) { if (s.gruppe === "kind") hasKids[s.eltern] = 1; });
    function toggle(code) { if (!hasKids[code]) return; st.offen = st.offen === code ? "" : code; c.touched = true; hideTip(); render(c); }
    var v = function (s) { return vals[s.code][i]; };
    var defNode = Q.filter(function (s) { return s.code === "Q_DEF"; });
    Q = Q.filter(function (s) { return s.code !== "Q_DEF"; }).sort(function (a, b) { return v(b) - v(a); }).concat(defNode);
    var ueb = Z.filter(function (s) { return s.code === "Z_UEB"; });
    Z = Z.filter(function (s) { return s.code !== "Z_UEB"; }).sort(function (a, b) { return v(b) - v(a); }).concat(ueb);
    S.sort(function (a, b) { return v(b) - v(a); });
    var sumQ = Q.reduce(function (t, s) { return t + v(s); }, 0), sumZ = Z.reduce(function (t, s) { return t + v(s); }, 0);
    var total = Math.max(sumQ, sumZ);
    var W0 = c.chart.clientWidth, W = Math.max(W0, S.length ? 780 : 640);
    var wrap = h("div"); wrap.style.overflowX = W > W0 ? "auto" : "visible"; c.chart.appendChild(wrap);
    var gap = 6, nw = 12, top = 34, slot = 30;
    var k = 380 / total;
    var lw = Math.min(260, Math.round(W * (S.length ? 0.2 : 0.26))), rw = Math.min(260, Math.round(W * (S.length ? 0.2 : 0.26)));
    var chars = function (px) { return Math.max(12, Math.floor((px - 14) / 6.6)); };
    var span = function (list) { var t = 0; list.forEach(function (s) { t += Math.max(v(s) * k + gap, slot); }); return t; };
    var H = Math.max(span(Q), span(Z), span(S), total * k) + top + 16;
    var xL = lw, xM = S.length ? lw + (W - lw - rw) * 0.36 : (lw + W - rw) / 2 - nw / 2, xR = S.length ? lw + (W - lw - rw) * 0.68 : W - rw - nw, xS = W - rw - nw;
    var svg = el("svg", { width: W, height: H, role: "img", "aria-label": d.titel }, wrap);
    var defs = el("defs", {}, svg), pat = el("pattern", { id: "hatch-" + d.id, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 6, height: 6 }, pat, { fill: "var(--context)" }); el("line", { x1: 0, y1: 0, x2: 0, y2: 6 }, pat, { stroke: "var(--text-muted)", strokeWidth: 2 });
    var colOf = function (s, j) { return s.code === "Q_DEF" ? "url(#hatch-" + d.id + ")" : QCOL[j % QCOL.length]; };
    function band(x1, a1, b1, x2, a2, b2) { var xm = (x1 + x2) / 2; return "M" + x1 + "," + a1 + "C" + xm + "," + a1 + " " + xm + "," + a2 + " " + x2 + "," + a2 + "L" + x2 + "," + b2 + "C" + xm + "," + b2 + " " + xm + "," + b1 + " " + x1 + "," + b1 + "Z"; }
    function fmtv(x) { return fmtU(d, x, dec, u); }
    function pct(x, base) { return nf(1).format(x / base * 100) + " %"; }
    var flows = [];
    function flowEl(p, fill, op, tipHtml) {
      var e = el("path", { d: p }, svg, { fill: fill, fillOpacity: op, stroke: "none", cursor: "default" });
      e.addEventListener("pointermove", function (ev) { e.style.fillOpacity = Math.min(1, op + 0.3); showTip(ev, tipHtml); });
      e.addEventListener("pointerleave", function () { e.style.fillOpacity = op; hideTip(); });
      flows.push(e); return e;
    }
    // Mittelknoten
    var mH = total * k, mY = top;
    // Quellen links
    var y = top, yM = mY;
    Q.forEach(function (s, j) {
      var hh = Math.max(1, v(s) * k), col = colOf(s, j);
      flowEl(band(xL + nw, y, y + hh, xM, yM, yM + hh), col, s.code === "Q_DEF" ? 0.55 : 0.38,
        '<div class="t-year">' + esc(s.label) + '</div><div class="row"><span>' + periodLabel(d.years[i]) + '</span><span class="num">' + fmtv(v(s)) + '</span></div><div class="row"><span>Anteil an der Finanzierung</span><span class="num">' + pct(v(s), sumQ) + "</span></div>");
      el("rect", { x: xL, y: y, width: nw, height: hh, rx: 2 }, svg, { fill: col });
      s._y = y + hh / 2; y += Math.max(hh + gap, slot); yM += hh;
    });
    el("rect", { x: xM, y: mY, width: nw, height: mH, rx: 2 }, svg, { fill: "var(--ref)" });
    // Ziele rechts
    y = top; yM = mY;
    Z.forEach(function (s) {
      var hh = Math.max(1, v(s) * k), isOpen = s.code === st.offen, col = s.code === "Z_UEB" ? "var(--context)" : "var(--s1)";
      var more = hasKids[s.code] ? '<div class="t-hint">' + (isOpen ? "Klicken, um die Unterkategorien zu schließen" : "Klicken für Unterkategorien") + "</div>" : "";
      var f = flowEl(band(xM + nw, yM, yM + hh, xR, y, y + hh), col, isOpen ? 0.45 : 0.22,
        '<div class="t-year">' + esc(s.label) + '</div><div class="row"><span>' + periodLabel(d.years[i]) + '</span><span class="num">' + fmtv(v(s)) + '</span></div><div class="row"><span>Anteil an den Ausgaben</span><span class="num">' + pct(v(s), sumZ) + "</span></div>" + more);
      var nd = el("rect", { x: xR - 2, y: y, width: nw + 4, height: Math.max(hh, 6), rx: 2 }, svg, { fill: isOpen ? "var(--s1)" : "var(--text-secondary)" });
      if (hasKids[s.code]) { [f, nd].forEach(function (e) { e.style.cursor = "pointer"; e.addEventListener("click", function () { toggle(s.code); }); }); }
      s._click = hasKids[s.code];
      s._y = y + hh / 2; s._top = y; s._h = hh; y += Math.max(hh + gap, slot); yM += hh;
    });
    // Soziale Sicherung aufgeschluesselt
    if (S.length) {
      var soz = Z.filter(function (s) { return s.code === st.offen; })[0];
      var y2 = Math.max(top, Math.min(soz._top + soz._h / 2 - span(S) / 2, H - 16 - span(S))), yy = soz._top, sumS = S.reduce(function (t, s) { return t + v(s); }, 0);
      S.forEach(function (s) {
        var hh = Math.max(1, v(s) * k);
        flowEl(band(xR + nw, yy, yy + hh, xS, y2, y2 + hh), "var(--s1)", 0.22,
          '<div class="t-year">' + esc(s.label) + '</div><div class="row"><span>' + periodLabel(d.years[i]) + '</span><span class="num">' + fmtv(v(s)) + '</span></div><div class="row"><span>Anteil an „' + esc(soz.label) + '“</span><span class="num">' + pct(v(s), sumS) + "</span></div>");
        el("rect", { x: xS, y: y2, width: nw, height: hh, rx: 2 }, svg, { fill: "var(--text-secondary)" });
        s._y = y2 + hh / 2; y2 += Math.max(hh + gap, slot); yy += hh;
      });
    }
    // Beschriftungen mit Kollisionsvermeidung
    function labels(list, x, anchor, maxw, base) {
      var L = list.map(function (s) { return { s: s, y: s._y }; });
      for (var a = 1; a < L.length; a++) if (L[a].y - L[a - 1].y < 26) L[a].y = L[a - 1].y + 26;
      L.forEach(function (o) {
        var t1 = el("text", { x: x, y: o.y - 2, "text-anchor": anchor, class: "lab" }, svg, { fontWeight: "600", fill: "var(--text-primary)" });
        t1.textContent = trunc(o.s.label, maxw);
        var t2 = el("text", { x: x, y: o.y + 12, "text-anchor": anchor }, svg);
        t2.textContent = fmtv(v(o.s)) + " · " + pct(v(o.s), base);
        if (o.s._click) [t1, t2].forEach(function (t) { t.style.cursor = "pointer"; t.addEventListener("click", function () { toggle(o.s.code); }); });
        if (o.s._click && o.s.code !== st.offen) t2.textContent += "  ▸";
        if (Math.abs(o.y - o.s._y) > 3) el("line", { x1: anchor === "end" ? x + 3 : x - 3, x2: anchor === "end" ? x + 8 : x - 8, y1: o.y, y2: o.s._y }, svg, { stroke: "var(--axis)" });
      });
    }
    labels(Q, xL - 8, "end", chars(lw), sumQ);
    if (S.length) {
      Z.forEach(function (s) { var t = el("text", { x: xR + nw + 4, y: s._y + 4, class: "lab halo" }, svg, { fontWeight: s.code === st.offen ? "600" : "400", cursor: s._click ? "pointer" : "default" }); t.textContent = trunc(s.label, 20); if (s._click) t.addEventListener("click", function () { toggle(s.code); }); });
      labels(S, xS + nw + 8, "start", chars(rw), S.reduce(function (t, s) { return t + v(s); }, 0));
    } else labels(Z, xR + nw + 8, "start", chars(rw), sumZ);
    var mt = el("text", { x: xM + nw / 2, y: top - 14, "text-anchor": "middle", class: "lab" }, svg, { fontWeight: "600", fill: "var(--text-primary)" });
    mt.textContent = "Ausgaben insgesamt " + fmtv(total);
    el("text", { x: xL + nw / 2, y: top - 14, "text-anchor": "middle" }, svg).textContent = "Einnahmen";
    var bal = d.einnahmen[i] - d.ausgaben[i];
    legend(c.legend, [{ label: "Einnahmen nach Art", color: "var(--s1)", box: true }, { label: "Neuverschuldung", color: "var(--context)", box: true }, { label: "Ausgaben nach Aufgabenbereich", color: "var(--text-secondary)", box: true }]);
    c.hint.className = "hint";
    c.hint.textContent = (st.offen ? "Unterkategorien von „" + Z.filter(function (s) { return s.code === st.offen; }).map(function (s) { return s.label; })[0] + "“. Erneut klicken schließt sie. " : "Auf einen Ausgabenbereich klicken zeigt seine Unterkategorien. ") + "Breite der Ströme proportional zum Betrag. Finanzierungssaldo " + periodLabel(d.years[i]) + ": " + (bal >= 0 ? "+" : "−") + nf(0).format(Math.abs(bal)) + " Mrd. €.";
  }

  function areaColor(d, s, i) {
    if (ENERGIE[s.label]) return ENERGIE[s.label];
    if (/^Sonstige/.test(s.label)) return "var(--e-sonst)";
    return AREA[i % AREA.length];
  }
  function drawArea(c, d, st) {
    var vals = getVals(d, st), years = d.years, Y0 = years[0], Y1 = years[years.length - 1];
    var W = c.chart.clientWidth, narrow = W < 640, H = Math.max(280, Math.min(420, W * 0.5));
    var m = { l: 52, r: narrow ? 12 : 190, t: 10, b: 26 };
    var svg = el("svg", { width: W, height: H, role: "img", "aria-label": d.titel }, c.chart);
    var cum = years.map(function (_, i) { var t = 0; d.series.forEach(function (s) { var v = vals[s.code][i]; if (v != null) t += v; }); return t; });
    var ticks = (st.modus === "anteil" || (d.einheit === "%" && Math.max.apply(null, cum.filter(function (v) { return v != null; })) <= 100.5)) ? niceTicks(0, 100, 5) : domainTicks(d, cum, 5), ymax = ticks[ticks.length - 1];
    var x = function (y) { return m.l + (y - Y0) / Math.max(1, Y1 - Y0) * (W - m.l - m.r); };
    var yv = function (v) { return H - m.b - v / ymax * (H - m.t - m.b); };
    var u = c._unit, dec = decFor(d, st);
    yAxis(svg, d.typ === "flaeche" && st.modus === "anteil" ? { _unit: "%" } : d, ticks, m, W, yv, true, false);
    xTicksYears(Y0, Y1, W - m.l - m.r, (d.periode === "monat" || d.periode === "quartal")).forEach(function (y) { el("text", { x: x(y), y: H - 8, "text-anchor": "middle" }, svg).textContent = periodLabel(y); });
    var base = years.map(function () { return 0; }), bands = [];
    d.series.forEach(function (s, si) {
      var top = years.map(function (_, i) { return base[i] + (vals[s.code][i] || 0); });
      var p = ""; years.forEach(function (y, i) { p += (i ? "L" : "M") + x(y).toFixed(1) + "," + yv(top[i]).toFixed(1); });
      for (var i = years.length - 1; i >= 0; i--) p += "L" + x(years[i]).toFixed(1) + "," + yv(base[i]).toFixed(1);
      var col = areaColor(d, s, si);
      el("path", { d: p + "Z" }, svg, { fill: col, stroke: "var(--surface)", strokeWidth: 1 });
      bands.push({ s: s, col: col, mid: (yv(top[years.length - 1]) + yv(base[years.length - 1])) / 2, hgt: yv(base[years.length - 1]) - yv(top[years.length - 1]) });
      base = top;
    });
    if (!narrow) {
      var labs = bands.filter(function (b) { return b.hgt >= 9; }).sort(function (a, b) { return a.mid - b.mid; });
      for (var i = 1; i < labs.length; i++) if (labs[i].mid - labs[i - 1].mid < 13) labs[i].mid = labs[i - 1].mid + 13;
      labs.forEach(function (b) { el("text", { x: W - m.r + 8, y: b.mid + 4, class: "lab" }, svg).textContent = trunc(b.s.label, 30); });
    }
    function areaStats(iH) {
      var iL = -1; d.series.forEach(function (s) { iL = Math.max(iL, lastIdx(vals[s.code])); });
      var i = iH == null ? iL : iH; if (i < 0) { statBoxes(c, []); return; }
      var rows = d.series.map(function (s, si) { return { s: s, v: vals[s.code][i], pv: i > 0 ? vals[s.code][i - 1] : null, col: bands[si].col }; }).filter(function (r) { return r.v != null; }).sort(function (a, b) { return b.v - a.v; });
      var anteil = st.modus === "anteil", n = anteil ? 4 : 3, per = periodLabel(years[i]), prev = i > 0 ? periodLabel(years[i - 1]) : "";
      var items = rows.slice(0, n).map(function (r) { return { label: r.s.label, per: per, color: r.col, value: fmtU(d, r.v, dec, boxU(u)), sub: r.pv != null ? deltaTxt(anteil ? { veraenderung: "pp" } : d, r.v, r.pv, dec, u) + " ggü. " + prev : "" }; });
      if (!anteil) { var t = 0, pt = 0, okp = i > 0; d.series.forEach(function (s) { t += vals[s.code][i] || 0; if (i > 0) pt += vals[s.code][i - 1] || 0; }); items.push({ label: "Insgesamt", per: per, color: "var(--text-primary)", value: fmtU(d, t, dec, boxU(u)), sub: okp && pt ? deltaTxt(d, t, pt, dec, boxU(u)) + " ggü. " + prev : "" }); }
      statBoxes(c, items);
    }
    areaStats(null);
    var cross = el("line", { y1: m.t, y2: H - m.b, visibility: "hidden" }, svg, { stroke: "var(--text-primary)", strokeWidth: 1 });
    var hit = el("rect", { x: m.l, y: m.t, width: Math.max(0, W - m.l - m.r), height: H - m.t - m.b, fill: "transparent" }, svg);
    hit.addEventListener("pointermove", function (ev) {
      var r = svg.getBoundingClientRect(); var yr = Math.round(Y0 + (ev.clientX - r.left - m.l) / (W - m.l - m.r) * (Y1 - Y0)); yr = Math.max(Y0, Math.min(Y1, yr));
      var i = years.indexOf(yr); cross.setAttribute("x1", x(yr)); cross.setAttribute("x2", x(yr)); cross.setAttribute("visibility", "visible");
      areaStats(i);
      var tot = 0; d.series.forEach(function (s) { tot += vals[s.code][i] || 0; });
      var rows = d.series.map(function (s, si) { return { s: s, v: vals[s.code][i], col: bands[si].col }; }).reverse();
      showTip(ev, '<div class="t-year">' + yr + "</div>" + rows.map(function (o) { return '<div class="row"><span><span class="sw" style="background:' + o.col + '"></span>' + esc(o.s.label) + '</span><span class="num">' + fmtU(d, o.v, dec, u) + "</span></div>"; }).join("") +
        (st.modus === "anteil" ? "" : '<div class="row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px"><span>Insgesamt</span><span class="num">' + fmtU(d, tot, dec, u) + "</span></div>"));
    });
    hit.addEventListener("pointerleave", function () { cross.setAttribute("visibility", "hidden"); hideTip(); areaStats(null); });
    legend(c.legend, bands.slice().reverse().map(function (b) { return { label: b.s.label, color: b.col, box: true }; }));
  }

  function drawTable(c, d, st) {
    var vals = getVals(d, st), years = d.years, u = c._unit, dec = decFor(d, st), cols;
    if (d.typ === "balken" || d.typ === "sankey") {
      var i = years.map(String).indexOf(String(st.jahr)); var cand = []; var step = d.periode === "halbjahr" ? 2 : 1;
      for (var k = i; k >= 0 && cand.length < 4; k -= step * (cand.length ? 5 : 1)) cand.unshift(k);
      cols = cand;
    } else {
      var n = years.length, want = Math.min(6, n); cols = [];
      for (var j = 0; j < want; j++) cols.push(Math.round(j * (n - 1) / Math.max(1, want - 1)));
      cols = cols.filter(function (v, idx, a) { return a.indexOf(v) === idx; });
    }
    var ref = d.referenz;
    var GL = { quelle: "Einnahme · ", ziel: "Ausgabe · ", kind: "  davon · " };
    var rows = d.series.filter(function (s) { return vals[s.code]; }).map(function (s) { var o = { k: s.code, l: (s.gruppe ? GL[s.gruppe] : "") + s.label }; cols.forEach(function (ci) { o[ci] = vals[s.code][ci]; }); return o; });
    if (d.typ === "flaeche" && st.modus !== "anteil") {
      var tot = { k: "_sum", l: "Insgesamt" }; cols.forEach(function (ci) { var t = 0; d.series.forEach(function (s) { t += vals[s.code][ci] || 0; }); tot[ci] = t; }); rows.push(tot);
    }
    var sk = st.tsort || cols[cols.length - 1], dir = st.tdir || -1;
    rows.sort(function (a, b) { if (a.k === ref) return -1; if (b.k === ref) return 1; if (a.k === "_sum") return 1; if (b.k === "_sum") return -1; if (sk === "l") return a.l.localeCompare(b.l, "de") * -dir; return ((a[sk] == null ? -1e18 : a[sk]) - (b[sk] == null ? -1e18 : b[sk])) * dir; });
    var wrap = h("div", "table-wrap");
    var head = '<tr><th data-k="l">' + (d.reihen && d.reihen.dim === "geo" ? "Gebiet" : "Reihe") + "</th>" + cols.map(function (ci) { return '<th data-k="' + ci + '">' + periodLabel(years[ci]) + (String(sk) === String(ci) ? (dir < 0 ? " ↓" : " ↑") : "") + "</th>"; }).join("") + "</tr>";
    var body = rows.map(function (r) { return '<tr class="' + (r.k === ref || r.k === "_sum" ? "ref" : "") + (r.k === "DE" && r.k !== ref ? " de" : "") + '"><td>' + esc(r.l) + "</td>" + cols.map(function (ci) { return "<td>" + fmt(d, r[ci], dec) + "</td>"; }).join("") + "</tr>"; }).join("");
    wrap.innerHTML = "<table><thead>" + head + "</thead><tbody>" + body + "</tbody></table>";
    c.chart.appendChild(wrap);
    wrap.querySelectorAll("th").forEach(function (th) { th.addEventListener("click", function () { var k = th.dataset.k; k = k === "l" ? "l" : +k; if (st.tsort === k) st.tdir = -(st.tdir || -1); else { st.tsort = k; st.tdir = -1; } render(c); }); });
    c.legend.innerHTML = '<span>Einheit: ' + esc(u || "") + "</span>";
  }

  // ---------------- card ----------------
  function viewsFor(d) {
    if (d.typ === "facetten") return [["linien", "Linien"], ["facetten", "Kacheln"], ["tabelle", "Tabelle"]];
    if (d.typ === "balken") return [["balken", "Balken"], ["tabelle", "Tabelle"]];
    if (d.typ === "flaeche") return [["flaeche", "Fläche"], ["tabelle", "Tabelle"]];
    if (d.typ === "sankey") return [["sankey", "Flussdiagramm"], ["tabelle", "Tabelle"]];
    return [["linien", "Linien"], ["tabelle", "Tabelle"]];
  }
  function viewsAll(d) {
    var v = viewsFor(d);
    if (d.mon) v = v.slice(0, 1).concat([["monat", d.mon.periode === "quartal" ? "Quartale" : "Monate"]], v.slice(1));
    if (!d.rang) return v;
    var i = v.length - 1; return v.slice(0, i).concat([["rangliste", "Rangliste"]], v.slice(i));
  }
  function monD(d) {
    if (!d._md) {
      var r = {}; for (var k in d.mon) r[k] = d.mon[k]; r.typ = "linien"; r.id = d.id; if (r.referenz == null) r.referenz = d.referenz;
      var Y = r.years, a0 = 0; while (a0 < Y.length - 1 && Y[a0] < Y[Y.length - 1] - 5) a0++;   // Standard: die letzten fünf Jahre
      if (a0 > 0) r = sliceD(r, a0, Y.length - 1);
      d._md = r;
    }
    return d._md;
  }
  function rangD(d) {
    if (!d._rd) { var r = {}; for (var k in d.rang) r[k] = d.rang[k]; r.typ = "balken"; r.id = d.id; if (r.referenz == null) r.referenz = d.referenz; d._rd = r; }
    return d._rd;
  }
  function maxSel(d) { return (d.auswahl && d.auswahl.length === 4) ? 4 : 3; }
  function defaultSel(d) {
    var ref = d.referenz, others = d.series.map(function (s) { return s.code; }).filter(function (k) { return k !== ref; });
    if (others.length <= 3) return others;
    var want = (d.auswahl || d.standard_auswahl || []).filter(function (k) { return others.indexOf(k) >= 0; });
    if (want.length) return want.slice(0, maxSel(d));
    var v = d.values.real || d.values.nominal;
    var srt = others.slice().sort(function (a, b) { return (v[b][lastIdx(v[b])] || 0) - (v[a][lastIdx(v[a])] || 0); });
    if (d.reihen && d.reihen.dim === "geo") return [srt[0], srt[srt.length - 1]];
    return srt.slice(0, 3);
  }
  var VI = function (p) { return '<svg class="vicon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; };
  var VICON = {
    linien: VI('<path d="M2 13.5h12"/><path d="M2.5 10.5 6 7l2.5 2.5L13.5 4"/>'),
    facetten: VI('<rect x="1.75" y="1.75" width="5.5" height="5.5" rx="1"/><rect x="8.75" y="1.75" width="5.5" height="5.5" rx="1"/><rect x="1.75" y="8.75" width="5.5" height="5.5" rx="1"/><rect x="8.75" y="8.75" width="5.5" height="5.5" rx="1"/><path d="M3 5.5 4.5 4l1.5 1M10 5.5l1.5-1.5 1.5 1M3 12.5l1.5-1 1.5.5M10 12.5l1.5-1.5 1.5 1"/>'),
    tabelle: VI('<rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.5"/><path d="M1.75 6h12.5M1.75 9.9h12.5M6 6v7.75"/>'),
    balken: VI('<path d="M2 2v12"/><path d="M2 4.5h10M2 8h7M2 11.5h4.5"/>'),
    monat: VI('<rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5 1.8v2.4M11 1.8v2.4"/>'),
    rangliste: VI('<path d="M2 2v12"/><path d="M2 4.5h10M2 8h7M2 11.5h4.5"/>'),
    sankey: VI('<path d="M2 3.5h2.5c4 0 3.5 4.5 7 4.5H14"/><path d="M2 12.5h2.5c4 0 3.5-4.5 7-4.5"/><path d="M2 3v1.5M2 12v1.5M14 6.5v3"/>'),
    flaeche: VI('<path d="M2 13.5h12"/><path d="M2 13.5V9l4-2.5 3.5 2L14 5v8.5z" fill="currentColor" fill-opacity=".25"/><path d="M2 9l4-2.5 3.5 2L14 5"/>')
  };
  function seg(name, label, opts, st, c) {
    var w = h("div", "ctl"); w.appendChild(h("span", "ctl-label", label));
    var g = h("div", "seg"); g.setAttribute("role", "group"); g.dataset.ctl = name;
    opts.forEach(function (o) { var b = h("button", null, (name === "view" && VICON[o[0]] ? VICON[o[0]] : "") + esc(o[1])); b.type = "button"; b.dataset.v = o[0]; b.addEventListener("click", function () { st[name] = o[0]; render(c); }); g.appendChild(b); });
    w.appendChild(g); return w;
  }

  function subline(d, st) {
    var parts = [d.messgroesse];
    var u = unitFor(d, st);
    var skip = !u || d.messgroesse.indexOf(u) >= 0 || u === "Kinder je Frau";
    if (!skip && !/^Index/.test(u) && u !== "Tsd." && u !== "Mio.") parts.push(u === "%" ? "in %" : u === "Jahre" ? "in Jahren" : "in " + u);
    if (u === "Tsd.") parts.push("in Tausend"); if (u === "Mio.") parts.push("in Millionen");
    if (/^Index/.test(u)) parts.push(u);
    if (d.values.real) parts.push(mode(d, st) === "real" ? (d.geld && d.geld.basisjahr ? "real (bereinigt um Verbraucherpreise)" : "real, in Preisen von " + d.preisjahr) : "nominal");
    if (d.typ === "balken" || d.typ === "sankey") parts.push(periodLabel(st.jahr));
    else parts.push(periodLabel(d.years[0]) + "–" + periodLabel(d.years[d.years.length - 1]));
    return parts.join(", ");
  }

  // ---------------- Zeitbereich (Schieberegler) ----------------
  function isTimeChart(d) { return d.typ === "linien" || d.typ === "facetten" || d.typ === "flaeche"; }
  function sliceD(d, a, b) {
    var o = {}; for (var k in d) o[k] = d[k];
    o.years = d.years.slice(a, b + 1); o.values = {};
    for (var m in d.values) { o.values[m] = {}; for (var c in d.values[m]) o.values[m][c] = d.values[m][c].slice(a, b + 1); }
    return o;
  }
  function buildRange(c) {
    var d = c.d, n = d.years.length;
    var box = h("div", "rangebox", '<span class="rg-l"></span><div class="rg-track"><div class="rg-fill"></div><input type="range" class="rg-a" min="0" max="' + (n - 1) + '" step="1" aria-label="Beginn des Zeitraums"><input type="range" class="rg-b" min="0" max="' + (n - 1) + '" step="1" aria-label="Ende des Zeitraums"></div><span class="rg-r"></span>');
    var a = box.querySelector(".rg-a"), b = box.querySelector(".rg-b");
    function upd(which) {
      var va = +a.value, vb = +b.value;
      if (which === "a" && va > vb - 1) { va = vb - 1; a.value = va; }
      if (which === "b" && vb < va + 1) { vb = va + 1; b.value = vb; }
      if (va < 0) { va = 0; a.value = 0; } if (vb > n - 1) { vb = n - 1; b.value = vb; }
      c.st.von = va; c.st.bis = vb; c.touched = true; render(c);
    }
    a.addEventListener("input", function () { upd("a"); }); b.addEventListener("input", function () { upd("b"); });
    c.legend.parentNode.insertBefore(box, c.legend.nextSibling); c.range = box;
  }
  function syncRange(c) {
    var d = c.d, n = d.years.length, st = c.st, box = c.range; if (!box) return;
    var show = isTimeChart(d) && n > 3 && st.view !== "balken" && st.view !== "sankey" && st.view !== "rangliste" && st.view !== "monat";
    box.style.display = show ? "" : "none"; if (!show) return;
    var a = box.querySelector(".rg-a"), b = box.querySelector(".rg-b");
    a.value = st.von; b.value = st.bis;
    box.querySelector(".rg-l").textContent = periodLabel(d.years[st.von]); box.querySelector(".rg-r").textContent = periodLabel(d.years[st.bis]);
    var f = box.querySelector(".rg-fill"); f.style.left = (st.von / (n - 1) * 100) + "%"; f.style.width = ((st.bis - st.von) / (n - 1) * 100) + "%";
  }

  function render(c) {
    var d = c.d, st = c.st;
    var dv = (isTimeChart(d) && st.view !== "balken" && d.years.length > 3) ? sliceD(d, st.von, st.bis) : d;
    var rd = st.view === "rangliste" && d.rang ? rangD(d) : null, rst = rd ? Object.assign({}, st, { jahr: st.rjahr }) : null;
    var mdv = st.view === "monat" && d.mon ? monD(d) : null;
    if (mdv) dv = mdv;
    c._unit = unitFor(rd || mdv || d, st);
    c.sub.textContent = rd ? subline(rd, rst) : subline(dv, st);
    if (c.rsel) c.rsel.style.display = rd ? "" : "none";
    c.ctrls.querySelectorAll(".seg").forEach(function (g) {
      var k = g.dataset.ctl;
      g.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", String(st[k] === b.dataset.v));
      });
      if (k === "achse" || k === "sort") g.parentNode.style.display = st.view === "facetten" ? "" : "none";
      if (k === "werte") g.parentNode.style.display = (rd || mdv) && !(rd || mdv).values.real ? "none" : "";
    });
    c.chart.innerHTML = ""; hideTip(); c.hint.textContent = ""; c.hint.className = "hint";
    if (c.stats) { c.stats.innerHTML = ""; c.stats.style.display = "none"; }
    // chips
    c.chips.innerHTML = "";
    var ref = d.referenz, others = d.series.map(function (s) { return s.code; }).filter(function (k) { return k !== ref; });
    if ((st.view === "linien" || mdv) && others.length > 3 && !rd) {
      var hr = h("div", "chips-head"); hr.appendChild(h("p", "hint", "Bis zu " + (maxSel(d) === 4 ? "vier" : "drei") + " Reihen hervorheben, per Auswahl unten oder per Klick auf eine Linie."));
      var kb = h("button", "chip chip-toggle", (st.kontext === "aus" ? "Übrige grau einblenden" : "Übrige ausblenden")); kb.type = "button";
      kb.addEventListener("click", function () { st.kontext = st.kontext === "aus" ? "an" : "aus"; render(c); }); hr.appendChild(kb);
      c.chips.appendChild(hr);
      var box = h("div", "chips"); var cm = colorMap(d, st);
      others.forEach(function (k) {
        var on = st.sel.indexOf(k) >= 0, b = h("button", "chip", '<span class="dot" style="background:' + (on ? cm[k] : "") + '"></span>' + esc(label(d, k)));
        b.type = "button"; b.setAttribute("aria-pressed", on);
        b.addEventListener("click", function () { if (on) st.sel = st.sel.filter(function (x) { return x !== k; }); else { st.sel.push(k); if (st.sel.length > maxSel(d)) st.sel.shift(); } render(c); });
        box.appendChild(b);
      });
      c.chips.appendChild(box);
    }
    syncRange(c);
    var lst = st;
    if (mdv) {   // Monats-/Quartalsreihe kann weniger Reihen haben als die Jahresgrafik
      var mv = mdv.values.nominal, ms = st.sel.filter(function (k) { return mv[k]; });
      if (ms.length < st.sel.length) lst = Object.assign({}, st, { sel: ms.length ? ms : mdv.series.map(function (s) { return s.code; }).slice(0, maxSel(mdv)) });
    }
    if (st.view === "linien" || mdv) drawLines(c, dv, lst);
    else if (st.view === "facetten") drawFacets(c, dv, st);
    else if (st.view === "balken") drawBars(c, d, st);
    else if (rd) drawBars(c, rd, rst);
    else if (st.view === "flaeche") drawArea(c, dv, st);
    else if (st.view === "sankey") drawSankey(c, d, st);
    else drawTable(c, dv, st);
    writeHash(c);
  }

  function writeHash(c) {
    if (!c.touched) return;
    var st = c.st, p = new URLSearchParams();
    ["view", "werte", "achse", "sort", "modus", "jahr", "rjahr", "kontext", "einheit", "offen"].forEach(function (k) { if (st[k] != null && st[k] !== c.def[k]) p.set(k, st[k]); });
    if (st.sel.join("|") !== c.def.sel.join("|")) p.set("sel", st.sel.join("|"));
    if (st.von !== c.def.von) p.set("von", String(c.d.years[st.von])); if (st.bis !== c.def.bis) p.set("bis", String(c.d.years[st.bis]));
    var s = p.toString(); history.replaceState(null, "", "#" + c.d.id + (s ? "~" + s : ""));
  }
  function readHash(c) {
    var hh = decodeURIComponent(location.hash.slice(1)); if (hh.split("~")[0] !== c.d.id || hh.indexOf("~") < 0) return;
    var p = new URLSearchParams(hh.split("~")[1]);
    ["view", "werte", "achse", "sort", "modus", "jahr", "rjahr", "kontext", "einheit", "offen"].forEach(function (k) { if (p.get(k)) c.st[k] = p.get(k); });
    if (p.get("sel")) c.st.sel = p.get("sel").split("|").slice(0, maxSel(c.d));
    var ys = c.d.years.map(String), iv = ys.indexOf(p.get("von")), ib = ys.indexOf(p.get("bis"));
    if (iv >= 0) c.st.von = iv; if (ib >= 0) c.st.bis = ib; if (c.st.bis - c.st.von < 1) { c.st.von = 0; c.st.bis = ys.length - 1; }
  }

  function csv(c) {
    var d = c.d, vals = getVals(d, c.st), sep = ";", n = nf(6);
    var s = "Periode" + sep + d.series.map(function (x) { return '"' + x.label.replace(/"/g, '""') + '"'; }).join(sep) + "\n";
    d.years.forEach(function (y, i) { s += y + sep + d.series.map(function (x) { var v = vals[x.code][i]; return v == null ? "" : String(+v.toFixed(6)).replace(".", ","); }).join(sep) + "\n"; });
    var head = "# " + d.titel + "\n# " + subline(d, c.st) + "\n# Quelle: " + d.quelle.map(function (q) { return (q.name || "Eurostat") + (q.dataset ? ", " + q.dataset : ""); }).join("; ") + "\n";
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + head + s], { type: "text/csv;charset=utf-8" }));
    a.download = d.id + "_" + mode(d, c.st) + (c.st.modus === "anteil" ? "_anteil" : "") + ".csv"; document.body.appendChild(a); a.click(); a.remove();
  }


  // ---------------- PNG der aktuellen Ansicht ----------------
  var SVGPROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linejoin", "stroke-linecap", "stroke-opacity", "opacity", "visibility", "font-size", "font-weight", "font-family", "text-anchor", "dominant-baseline", "paint-order", "font-variant-numeric"];
  function svgImage(svg) {
    var clone = svg.cloneNode(true), src = svg.querySelectorAll("*"), dst = clone.querySelectorAll("*");
    function inl(a, b) { var cs = getComputedStyle(a), st = ""; SVGPROPS.forEach(function (p) { var v = cs.getPropertyValue(p); if (v) st += p + ":" + v + ";"; }); b.setAttribute("style", st); }
    inl(svg, clone); for (var i = 0; i < src.length; i++) inl(src[i], dst[i]);
    var r = svg.getBoundingClientRect();
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg"); clone.setAttribute("width", r.width); clone.setAttribute("height", r.height);
    if (!clone.getAttribute("viewBox") && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) clone.setAttribute("viewBox", [svg.viewBox.baseVal.x, svg.viewBox.baseVal.y, svg.viewBox.baseVal.width, svg.viewBox.baseVal.height].join(" "));
    var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    return new Promise(function (ok) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = url; });
  }
  function visible(e) { var cs = getComputedStyle(e); return cs.display !== "none" && cs.visibility !== "hidden" && e.getClientRects().length > 0; }
  function clipBox(e, stop) { var p = e; while (p && p !== stop) { var o = getComputedStyle(p).overflowX; if (o === "hidden" || o === "auto" || o === "scroll") return p.getBoundingClientRect(); p = p.parentElement; } return null; }
  function rrect(ctx, x, y, w, h, r) { r = Math.min(r || 0, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawBlock(ctx, block, ox, oy) {
    // Hintergründe und Rahmen der HTML-Elemente
    var els = [block].concat([].slice.call(block.querySelectorAll("*"))).filter(function (e) { return !(e instanceof SVGElement) && visible(e); });
    els.forEach(function (e) {
      var cs = getComputedStyle(e), r = e.getBoundingClientRect(), x = r.left - ox, y = r.top - oy, rad = parseFloat(cs.borderTopLeftRadius) || 0;
      var bg = cs.backgroundColor;
      if (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg) && e !== block) { ctx.fillStyle = bg; rrect(ctx, x, y, r.width, r.height, rad); ctx.fill(); }
      var bw = ["Top", "Right", "Bottom", "Left"].map(function (k) { return cs["border" + k + "Style"] === "none" ? 0 : parseFloat(cs["border" + k + "Width"]) || 0; });
      var full = e !== block && bw[1] && bw[1] === bw[2] && bw[2] === bw[3] && cs.borderRightColor === cs.borderBottomColor;
      if (full) { ctx.strokeStyle = cs.borderRightColor; ctx.lineWidth = bw[1]; rrect(ctx, x + bw[1] / 2, y + bw[1] / 2, r.width - bw[1], r.height - bw[1], rad); ctx.stroke(); }
      [["Top", 0], ["Right", 1], ["Bottom", 2], ["Left", 3]].forEach(function (sd) {
        var w = parseFloat(cs["border" + sd[0] + "Width"]), sty = cs["border" + sd[0] + "Style"]; if (!w || sty === "none" || e === block) return;
        if (full && (sd[1] > 0 || (w === bw[1] && cs.borderTopColor === cs.borderRightColor))) return;
        if (full) { ctx.save(); rrect(ctx, x, y, r.width, r.height, rad); ctx.clip(); ctx.fillStyle = cs.borderTopColor;
          if (sty === "dashed") { for (var dx = 0; dx < r.width; dx += 7) ctx.fillRect(x + dx, y, 4, w); } else ctx.fillRect(x, y, r.width, w); ctx.restore(); return; }
        ctx.strokeStyle = cs["border" + sd[0] + "Color"]; ctx.lineWidth = w; ctx.setLineDash(sty === "dashed" ? [4, 3] : []);
        ctx.beginPath(); var k = sd[1];
        if (k === 0) { ctx.moveTo(x + (w > 1 ? 0 : rad), y + w / 2); ctx.lineTo(x + r.width - (w > 1 ? 0 : rad), y + w / 2); }
        if (k === 2) { ctx.moveTo(x + rad, y + r.height - w / 2); ctx.lineTo(x + r.width - rad, y + r.height - w / 2); }
        if (k === 1) { ctx.moveTo(x + r.width - w / 2, y + rad); ctx.lineTo(x + r.width - w / 2, y + r.height - rad); }
        if (k === 3) { ctx.moveTo(x + w / 2, y + rad); ctx.lineTo(x + w / 2, y + r.height - rad); }
        ctx.stroke(); ctx.setLineDash([]);
      });
    });
    // Text, Wort für Wort an seiner Bildschirmposition
    var tw = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null), n;
    while ((n = tw.nextNode())) {
      var pe = n.parentElement; if (!pe || pe.closest("svg") || !visible(pe) || !n.nodeValue.trim()) continue;
      var cs = getComputedStyle(pe), clip = clipBox(pe, block);
      ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily; ctx.fillStyle = cs.color; ctx.textBaseline = "middle";
      var re = /\S+/g, m, txt = n.nodeValue, line = null;
      var flush = function () { if (line) { var t = txt.slice(line.a, line.b), mw = line.r - line.x + 1; if (ctx.measureText(t).width > mw) ctx.fillText(t, line.x - ox, line.y - oy, mw); else ctx.fillText(t, line.x - ox, line.y - oy); } line = null; };
      while ((m = re.exec(txt))) {
        var rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        var rs = rg.getClientRects(); if (!rs.length) continue; var q = rs[0];
        if (clip && (q.left < clip.left - 1 || q.right > clip.right + 1)) continue;
        var yy = q.top + q.height / 2;
        if (line && Math.abs(line.y - yy) < 2) { line.b = m.index + m[0].length; line.r = q.right; }
        else { flush(); line = { a: m.index, b: m.index + m[0].length, x: q.left, y: yy, r: q.right }; }
      }
      flush();
    }
    // SVG-Grafiken
    var svgs = [].slice.call(block.querySelectorAll("svg")).filter(function (s) { return !s.closest("svg svg") && visible(s); });
    if (block instanceof SVGElement) svgs = [block];
    return Promise.all(svgs.map(function (s) { return svgImage(s).then(function (im) { if (!im) return; var r = s.getBoundingClientRect(), cb = clipBox(s, block);
      ctx.save(); if (cb) { ctx.beginPath(); ctx.rect(cb.left - ox, cb.top - oy, cb.width, cb.height); ctx.clip(); } ctx.drawImage(im, r.left - ox, r.top - oy, r.width, r.height); ctx.restore(); }); }));
  }
  function pngExport(c) {
    hideTip();
    var card = c.root, cr = card.getBoundingClientRect(), pad = 18, sc = Math.max(2, window.devicePixelRatio || 1);
    var parts = [card.querySelector("h3"), card.querySelector(".sub"), c.stats, c.hint, c.chart, c.legend].filter(function (e) { return e && visible(e) && e.textContent !== undefined && (e.getBoundingClientRect().height > 0); });
    var gaps = parts.map(function (e) { var r = e.getBoundingClientRect(); return r; });
    var H = pad, layout = parts.map(function (e, i) { var r = gaps[i], y = H; H += r.height + (i === 0 ? 4 : 10); return { e: e, r: r, y: y }; });
    var foot = card.querySelector(".foot-row span"), srcTxt = foot ? foot.textContent.replace(/\s+/g, " ").trim() : "";
    var W = cr.width, ctx0 = document.createElement("canvas").getContext("2d");
    var cs0 = getComputedStyle(card), small = "12px " + getComputedStyle(document.body).fontFamily;
    ctx0.font = small; var lines = [], cur = "";
    srcTxt.split(" ").forEach(function (w) { var t = cur ? cur + " " + w : w; if (ctx0.measureText(t).width > W - 2 * pad && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur);
    H += 6 + lines.length * 16 + 28 + pad;
    var cv = document.createElement("canvas"); cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
    var ctx = cv.getContext("2d"); ctx.scale(sc, sc);
    ctx.fillStyle = cs0.backgroundColor || "#fff"; ctx.fillRect(0, 0, W, H);
    var jobs = layout.map(function (L) { return function () { var ox = L.r.left - (L.r.left - cr.left), oy = L.r.top - L.y; return drawBlock(ctx, L.e, cr.left, oy); }; });
    var p = Promise.resolve(); jobs.forEach(function (j) { p = p.then(j); });
    var lg = document.querySelector(".brand svg.logo"), logoP = lg ? svgImage(lg) : Promise.resolve(null);
    return p.then(function () { return logoP; }).then(function (logo) {
      var y = H - pad - 28 - lines.length * 16 + 6, muted = getComputedStyle(card.querySelector(".foot")).color;
      ctx.strokeStyle = getComputedStyle(card).borderTopColor; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, y - 8); ctx.lineTo(W - pad, y - 8); ctx.stroke();
      ctx.font = small; ctx.fillStyle = muted; ctx.textBaseline = "top";
      lines.forEach(function (l, i) { ctx.fillText(l, pad, y + i * 16); });
      var ry = y + lines.length * 16 + 4, per = new Date().toLocaleDateString("de-DE"), tx = pad;
      if (logo) { var lh = 20, lw = lh * 418 / 76; ctx.drawImage(logo, pad, ry, lw, lh); tx = pad + lw + 10; }
      ctx.textBaseline = "middle"; ctx.font = "600 12px " + getComputedStyle(document.body).fontFamily; ctx.fillStyle = getComputedStyle(card.querySelector("h3")).color;
      var brand = "faktenstand.de", bwid = ctx.measureText(brand).width;
      ctx.fillText(brand, tx, ry + 12);
      ctx.font = small; ctx.fillStyle = muted; ctx.fillText("\u00b7 Ansicht vom " + per, tx + bwid + 6, ry + 12);
      cv.toBlob(function (b) {
        var a = document.createElement("a"); a.href = URL.createObjectURL(b);
        a.download = c.d.id + "_" + c.st.view + ".png"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      }, "image/png");
    });
  }

  function mount(card) {
    var d = JSON.parse(card.querySelector("script[type='application/json']").textContent);
    var c = { d: d, root: card };
    c.sub = card.querySelector(".sub"); c.ctrls = card.querySelector(".controls"); c.chips = card.querySelector(".chips-box");
    c.hint = card.querySelector(".hint-box"); c.chart = card.querySelector(".chart"); c.legend = card.querySelector(".legend");
    c.stats = h("div", "stats"); c.stats.setAttribute("aria-live", "polite"); c.stats.style.display = "none"; c.chart.parentNode.insertBefore(c.stats, c.chart);
    var views = viewsAll(d);
    var st = { view: views[0][0], werte: d.values.real ? "real" : "nominal", achse: "gemeinsam", sort: d.sortierung === "keine" ? "keine" : "wert", sel: defaultSel(d), modus: "absolut", jahr: d.standardjahr, einheit: "mrd", offen: "", von: 0, bis: d.years.length - 1, rjahr: d.rang ? d.rang.standardjahr : null };
    var nOthers = d.series.filter(function (x) { return x.code !== d.referenz; }).length;
    st.kontext = "an";
    c.def = JSON.parse(JSON.stringify(st)); c.st = st; buildRange(c); readHash(c);
    c.ctrls.appendChild(seg("view", "Ansicht", views, st, c));
    if (d.values.real) c.ctrls.appendChild(seg("werte", "Werte", [["nominal", "nominal"], ["real", "real"]], st, c));
    if (d.values.absolut) c.ctrls.appendChild(seg("werte", "Werte", [["nominal", d.einheit], ["absolut", "absolut"]], st, c));
    if (d.typ === "facetten") {
      c.ctrls.appendChild(seg("achse", "y-Achse", [["gemeinsam", "gemeinsam"], ["je-feld", "je Feld"]], st, c));
      c.ctrls.appendChild(seg("sort", "Sortierung", [["wert", "nach letztem Wert"], ["alpha", "A–Z"]], st, c));
    }
    if (d.typ === "sankey") {
      c.ctrls.appendChild(seg("einheit", "Einheit", [["mrd", "Mrd. €"], ["bip", "% des BIP"], ["kopf", "€ je Einwohner"]], st, c));
    }
    if (d.typ === "flaeche") c.ctrls.appendChild(seg("modus", "Darstellung", [["absolut", d.einheit], ["anteil", "Anteile in %"]], st, c));
    if (d.typ === "balken" || d.typ === "sankey") {
      var w = h("div", "ctl"); w.appendChild(h("span", "ctl-label", "Periode"));
      var sel = h("select", "year"); d.years.slice().reverse().forEach(function (y) { var o = h("option", null, periodLabel(y)); o.value = y; if (String(y) === String(st.jahr)) o.selected = true; sel.appendChild(o); });
      sel.addEventListener("change", function () { st.jahr = sel.value; c.touched = true; render(c); }); w.appendChild(sel); c.ctrls.appendChild(w);
    }
    if (d.rang) {
      var w2 = h("div", "ctl"); w2.appendChild(h("span", "ctl-label", "Periode"));
      var sel2 = h("select", "year"); d.rang.years.slice().reverse().forEach(function (y) { var o = h("option", null, periodLabel(y)); o.value = y; if (String(y) === String(st.rjahr)) o.selected = true; sel2.appendChild(o); });
      sel2.addEventListener("change", function () { st.rjahr = sel2.value; c.touched = true; render(c); }); w2.appendChild(sel2); c.ctrls.appendChild(w2); c.rsel = w2; w2.style.display = "none";
    }
    c.ctrls.addEventListener("click", function () { c.touched = true; });
    c.chips.addEventListener("click", function () { c.touched = true; });
    card.querySelector(".dl-csv").addEventListener("click", function () { csv(c); });
    var pb = card.querySelector(".dl-png"); if (pb) pb.addEventListener("click", function () { pb.disabled = true; pngExport(c).then(function () { pb.disabled = false; }, function () { pb.disabled = false; }); });
    card.querySelector(".copy-link").addEventListener("click", function (ev) {
      c.touched = true; writeHash(c); var url = location.href, out = card.querySelector(".copied");
      try { navigator.clipboard.writeText(url).then(function () { out.textContent = " · kopiert"; }, function () { out.textContent = " · " + url; }); } catch (e) { out.textContent = " · " + url; }
    });
    render(c);
    return c;
  }

  var cards = [];
  function init() {
    document.querySelectorAll(".card[data-chart]").forEach(function (el) { try { cards.push(mount(el)); } catch (e) { console.error("Grafik", el.id, e); } });
    var t; window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(function () { cards.forEach(render); }, 150); });
    document.querySelectorAll("[data-theme-set]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.dataset.themeSet; if (v === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", v);
        try { localStorage.setItem("theme", v); } catch (e) {}
        document.querySelectorAll("[data-theme-set]").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      });
    });
    var saved = null; try { saved = localStorage.getItem("theme"); } catch (e) {}
    if (saved) { var btn = document.querySelector('[data-theme-set="' + saved + '"]'); if (btn) btn.click(); }
    var up = h("button", "to-top", '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>');
    up.type = "button"; up.setAttribute("aria-label", "Nach oben"); up.title = "Nach oben"; document.body.appendChild(up);
    up.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    var onScroll = function () { up.classList.toggle("show", window.scrollY > 600); };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    var id = decodeURIComponent(location.hash.slice(1)).split("~")[0]; if (id) { var tgt = document.getElementById(id); if (tgt) tgt.scrollIntoView(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
