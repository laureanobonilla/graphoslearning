/* view-organism.js — vista «Organismo»: el mapa se ve como un ser vivo que crece según el esquema.
 * Cada nodo es una célula con membrana que respira y rasgos propios según su función (núcleo y flagelos, cilios, pétalos, espinas,
 * dendritas, vesículas, cristal, concha…); cada conexión es un vaso, raíz, nervio, zarcillo o rama cuyo grosor decrece de padre a hijo
 * y cuyo estilo depende de la función del nodo al que lleva (pulsos, hojas, espinas, pelos radiculares, ramitas capilares).
 * Solo cambia el dibujo (detrás del texto); no toca los datos. Necesita /view3d.js y /view-shapes.js. */
(function () {
  'use strict';
  var T = window.__gkV3, SH = window.__gkShapes; if (!T || !T.register || !SH || !SH.roleOf) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en');
  var rgba = T.rgba, mix = T.mix, lighten = T.lighten, darken = T.darken, hash = T.hash, TAU = Math.PI * 2;

  var PAL = { root: [79, 209, 197], category: [139, 124, 246], process: [96, 165, 250], example: [242, 179, 102], question: [192, 132, 252], benefit: [74, 222, 128], risk: [248, 113, 113], date: [34, 211, 238], list: [244, 114, 182], formula: [250, 204, 21], definition: [251, 146, 60], concept: [148, 163, 184], bubble: [148, 163, 184] };
  // forma de la célula: lóbulos, amplitud del latido, exponente (3 = cuadrada redondeada), espinas
  var GEO = {
    root: { lobes: 7, amp: 0.05, p: 3.2, sp: 0.8 }, category: { lobes: 6, amp: 0.07, p: 3.4, sp: 0.7 }, process: { lobes: 4, amp: 0.03, p: 4.2, sp: 1.2 },
    example: { lobes: 3, amp: 0.06, p: 2.8, sp: 0.9 }, question: { lobes: 3, amp: 0.11, p: 3, sp: 1.1 }, benefit: { lobes: 8, amp: 0.12, p: 2.8, sp: 0.8 },
    risk: { lobes: 12, amp: 0.025, p: 3.2, sp: 1.4, spike: 0.28 }, date: { lobes: 2, amp: 0.03, p: 5, sp: 0.6 }, list: { lobes: 5, amp: 0.06, p: 3.2, sp: 0.8 },
    formula: { hex: true }, definition: { lobes: 4, amp: 0.05, p: 3.4, sp: 0.7 }, concept: { lobes: 3, amp: 0.09, p: 3, sp: 0.8 }, bubble: { lobes: 2, amp: 0.05, p: 2.2, sp: 1 }
  };
  var WIDTH = [9, 6.4, 4.4, 3.1];
  var sq = function (c, p) { return (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / p); };
  var ph = function (id, k) { return hash(id + k) * TAU; };

  function roles(F) {
    var nk = new Map(); F.links.forEach(function (L) { nk.set(L.a.id, (nk.get(L.a.id) || 0) + 1); });
    F.list.forEach(function (o) { if (!o.role) o.role = SH.roleOf(o, o.nk != null ? o.nk : (nk.get(o.id) || 0)); });
  }
  function colOf(o) { var base = PAL[o.role] || PAL.concept; return o.c && o.c.bg ? mix(base, o.c.bg, 0.22) : base; }

  /* ---------- contorno de la célula ---------- */
  function shape(o, t) {
    var g = GEO[o.role] || GEO.concept, id = o.id, pts = [], rx = o.w / 2 * 1.1 + 11, ry = o.h / 2 * 1.14 + 8;
    var r = { cx: o.cx, cy: o.cy, rx: rx, ry: ry, p: g.p || 3, pts: pts, g: g };
    if (g.hex) {
      var j = function (k) { return 1 + 0.025 * Math.sin(t * 1.1 + k * 2 + ph(id, 'h')); };
      [[-1, 0], [-0.8, -1], [0.8, -1], [1, 0], [0.8, 1], [-0.8, 1]].forEach(function (q, k) { pts.push([o.cx + q[0] * (rx + 8) * j(k), o.cy + q[1] * ry * 1.05 * j(k + 3)]); });
      r.hex = true; return r;
    }
    var N = o.role === 'root' ? 44 : 36, p1 = ph(id, 'a'), p2 = ph(id, 'b');
    for (var k = 0; k < N; k++) {
      var th = k / N * TAU, c = Math.cos(th), s = Math.sin(th);
      var rad = 1 + g.amp * Math.sin(g.lobes * th + p1 + t * g.sp) + 0.035 * Math.sin(2 * th + p2 - t * 0.9);
      if (g.spike) rad += g.spike * Math.pow(Math.abs(Math.sin(g.lobes * th / 2 + p1)), 6);
      pts.push([o.cx + rx * rad * sq(c, r.p), o.cy + ry * rad * sq(s, r.p)]);
    }
    return r;
  }
  function path(ctx, pts, poly) {
    var n = pts.length; ctx.beginPath();
    if (poly) { ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); return; }
    ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (var k = 0; k < n; k++) { var a = pts[k], b = pts[(k + 1) % n]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    ctx.closePath();
  }
  // punto de la membrana en la dirección (dx,dy) desde el centro
  function anchor(o, dx, dy) {
    var rx = o.w / 2 * 1.1 + 11, ry = o.h / 2 * 1.14 + 8, p = 3.4, s = 1 / Math.pow(Math.pow(Math.abs(dx) / rx, p) + Math.pow(Math.abs(dy) / ry, p), 1 / p);
    return [o.cx + dx * s, o.cy + dy * s];
  }
  function wavy(ctx, x, y, ang, len, w0, amp, t, ph0, seg, curl) {
    var px = x, py = y, a = ang;
    for (var i = 1; i <= seg; i++) {
      var u = i / seg; a += curl * 0.08 + Math.sin(u * 5 + ph0 + t * 1.6) * amp * 0.12;
      var nx = px + Math.cos(a) * len / seg, ny = py + Math.sin(a) * len / seg;
      ctx.lineWidth = Math.max(0.5, w0 * (1 - u * 0.85)); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke(); px = nx; py = ny;
    }
    return [px, py, a];
  }

  /* ---------- una célula ---------- */
  function cell(ctx, o, t, lod, sel) {
    var col = colOf(o), g = GEO[o.role] || GEO.concept, S = shape(o, t), id = o.id, role = o.role, pts = S.pts;
    var dark = darken(col, 0.62), rim = lighten(col, 0.28);
    ctx.save();
    if (lod > 0 && !S.hex) { path(ctx, pts); ctx.lineWidth = 8; ctx.strokeStyle = rgba(col, sel ? 0.4 : 0.13); ctx.stroke(); }  // halo
    if (sel) { ctx.shadowColor = rgba(rim, 0.95); ctx.shadowBlur = 22; }
    path(ctx, pts, S.hex);
    var R = Math.max(S.rx, S.ry), gr = ctx.createRadialGradient(o.cx - S.rx * 0.2, o.cy - S.ry * 0.3, 2, o.cx, o.cy, R * 1.05);
    gr.addColorStop(0, rgba(mix(dark, col, 0.18), 0.94)); gr.addColorStop(1, rgba(darken(col, 0.74), 0.94)); ctx.fillStyle = gr; ctx.fill();
    ctx.shadowBlur = 0; ctx.lineJoin = 'round'; ctx.lineWidth = role === 'root' ? 3 : 2; ctx.strokeStyle = rgba(rim, 0.95); ctx.stroke();
    if (lod > 0) {
      // segunda membrana
      ctx.save(); ctx.translate(o.cx, o.cy); ctx.scale(0.9, 0.86); ctx.translate(-o.cx, -o.cy); path(ctx, pts, S.hex);
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(rim, 0.33); if (role === 'date') ctx.setLineDash([7, 4]); ctx.stroke(); ctx.restore();
      // orgánulos
      var n = role === 'root' ? 5 : 2 + Math.floor(hash(id + 'n') * 3);
      for (var i = 0; i < n; i++) {
        var a = ph(id, 'o' + i), rr = 0.55 + hash(id + 'r' + i) * 0.3, ox = o.cx + Math.cos(a + t * 0.12) * S.rx * rr, oy = o.cy + Math.sin(a + t * 0.12) * S.ry * rr * 0.9, sz = 2 + hash(id + 's' + i) * 2.6;
        ctx.beginPath(); ctx.arc(ox, oy, sz, 0, TAU); ctx.fillStyle = rgba(lighten(col, 0.35), 0.28); ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = rgba(rim, 0.4); ctx.stroke();
      }
    }
    ctx.restore();
    if (lod < 1) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = rgba(rim, 0.65); ctx.fillStyle = rgba(rim, 0.55);
    var c0 = [o.cx, o.cy];
    if (role === 'root') {   // flagelos largos
      for (var f = 0; f < 7; f++) { var k = Math.floor(f / 7 * pts.length), p = pts[k], ang = Math.atan2(p[1] - c0[1], p[0] - c0[0]); wavy(ctx, p[0], p[1], ang, 46 + hash(id + 'f' + f) * 40, 3.2, 1.6, t, f * 1.7, 12, (f % 2 ? 1 : -1) * 0.6); }
      ctx.lineWidth = 1.2; [1.25, 1.5].forEach(function (z, i) { ctx.save(); ctx.translate(o.cx, o.cy); ctx.scale(z + Math.sin(t * 1.3 + i) * 0.02, z * 0.9 + Math.sin(t * 1.3 + i) * 0.02); ctx.translate(-o.cx, -o.cy); path(ctx, pts); ctx.strokeStyle = rgba(rim, 0.22 - i * 0.08); ctx.stroke(); ctx.restore(); });
    } else if (role === 'process') {   // cilios
      for (var q = 0; q < pts.length; q += 2) { var pp = pts[q], an = Math.atan2(pp[1] - c0[1], pp[0] - c0[0]) + Math.sin(t * 5 + q) * 0.25; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(pp[0], pp[1]); ctx.lineTo(pp[0] + Math.cos(an) * 8, pp[1] + Math.sin(an) * 8); ctx.stroke(); }
    } else if (role === 'question') {   // dendritas
      for (var d = 0; d < 4; d++) { var kk = Math.floor((d + 0.3) / 4 * pts.length), pd = pts[kk], ad = Math.atan2(pd[1] - c0[1], pd[0] - c0[0]); var e = wavy(ctx, pd[0], pd[1], ad, 22 + hash(id + 'd' + d) * 14, 2, 1, t, d, 6, 0.5); wavy(ctx, e[0], e[1], e[2] - 0.6, 10, 1.2, 1, t, d + 1, 3, 0); wavy(ctx, e[0], e[1], e[2] + 0.6, 10, 1.2, 1, t, d + 2, 3, 0); }
    } else if (role === 'benefit') {   // brillo central de flor
      var rg = ctx.createRadialGradient(o.cx, o.cy, 1, o.cx, o.cy, S.rx * 0.8); rg.addColorStop(0, 'rgba(255,255,255,0.22)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(o.cx, o.cy, S.rx * 0.8, S.ry * 0.8, 0, 0, TAU); ctx.fill();
    } else if (role === 'example') {   // brote
      var tp = anchor(o, 0.001, -1); ctx.lineWidth = 1.6; var e2 = wavy(ctx, tp[0], tp[1] + 1, -Math.PI / 2, 12, 2, 1, t, 0, 4, 0.3);
      ctx.fillStyle = rgba(lighten(col, 0.3), 0.75); [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.moveTo(e2[0], e2[1]); ctx.quadraticCurveTo(e2[0] + sd * 12, e2[1] - 12, e2[0] + sd * 15, e2[1] - 3); ctx.quadraticCurveTo(e2[0] + sd * 8, e2[1] + 1, e2[0], e2[1]); ctx.fill(); });
    } else if (role === 'list') {   // vesículas que brotan
      for (var v = 0; v < 4; v++) { var kv = Math.floor((v + 0.5) / 4 * pts.length), pv = pts[kv], av = Math.atan2(pv[1] - c0[1], pv[0] - c0[0]), rv = 5 + hash(id + 'v' + v) * 4 + Math.sin(t * 2 + v) * 0.8; ctx.beginPath(); ctx.arc(pv[0] + Math.cos(av) * rv * 0.6, pv[1] + Math.sin(av) * rv * 0.6, rv, 0, TAU); ctx.fillStyle = rgba(darken(col, 0.55), 0.95); ctx.fill(); ctx.lineWidth = 1.4; ctx.stroke(); }
    } else if (role === 'definition') {   // concha en espiral
      ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(rim, 0.4); ctx.beginPath(); var sx = o.cx - S.rx * 0.66, sy = o.cy; for (var u = 0; u < 3.2 * TAU; u += 0.25) { var rs = 1 + u * 1.9; var xx = sx + Math.cos(u) * rs, yy = sy + Math.sin(u) * rs * 0.85; if (u === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); } ctx.stroke();
    } else if (role === 'formula') {   // cristal interior
      ctx.save(); ctx.translate(o.cx, o.cy); ctx.scale(0.78, 0.72); ctx.translate(-o.cx, -o.cy); path(ctx, pts, true); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(rim, 0.5); ctx.stroke(); ctx.restore();
      ctx.lineWidth = 0.8; ctx.strokeStyle = rgba(rim, 0.3); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[3][0], pts[3][1]); ctx.moveTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[4][0], pts[4][1]); ctx.moveTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[5][0], pts[5][1]); ctx.stroke();
    } else if (role === 'risk') {   // el halo late en alerta
      ctx.lineWidth = 2; path(ctx, pts); ctx.strokeStyle = rgba(PAL.risk, 0.25 + 0.2 * Math.sin(t * 3)); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- una conexión ---------- */
  function link(ctx, L, t, lod) {
    var a = L.a, b = L.b, dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy); if (len < 2) return;
    var key = L.key, role = b.role, ca = colOf(a), cb = colOf(b);
    var p0 = anchor(a, dx, dy), p3 = anchor(b, -dx, -dy), nx = -dy / len, ny = dx / len;
    var bend = (hash(key + 'b') - 0.5) * Math.min(len * 0.55, 180) + Math.sin(t * 0.5 + ph(key, 'sw')) * 5;
    var p1 = [p0[0] + (p3[0] - p0[0]) * 0.33 + nx * bend, p0[1] + (p3[1] - p0[1]) * 0.33 + ny * bend], p2 = [p0[0] + (p3[0] - p0[0]) * 0.68 + nx * bend * 0.6, p0[1] + (p3[1] - p0[1]) * 0.68 + ny * bend * 0.6];
    var M = lod > 0 ? 18 : 8, ws = WIDTH[Math.min(a.lv, 3)] * (role === 'process' ? 1.3 : role === 'question' || role === 'example' ? 0.7 : role === 'category' ? 1.15 : 1);
    var kw = 2 + Math.floor(hash(key + 'k') * 3), wam = role === 'question' ? 6 : role === 'process' ? 2.5 : 4, wp = ph(key, 'w');
    var P = [], i, u;
    for (i = 0; i <= M; i++) {
      u = i / M; var m = 1 - u, x = m * m * m * p0[0] + 3 * m * m * u * p1[0] + 3 * m * u * u * p2[0] + u * u * u * p3[0], y = m * m * m * p0[1] + 3 * m * m * u * p1[1] + 3 * m * u * u * p2[1] + u * u * u * p3[1];
      var tx = 3 * m * m * (p1[0] - p0[0]) + 6 * m * u * (p2[0] - p1[0]) + 3 * u * u * (p3[0] - p2[0]), ty = 3 * m * m * (p1[1] - p0[1]) + 6 * m * u * (p2[1] - p1[1]) + 3 * u * u * (p3[1] - p2[1]), tl = Math.hypot(tx, ty) || 1;
      var wob = Math.sin(u * Math.PI * kw + wp + t * 1.1) * wam * Math.sin(u * Math.PI);
      P.push({ x: x + (-ty / tl) * wob, y: y + (tx / tl) * wob, nx: -ty / tl, ny: tx / tl, tx: tx / tl, ty: ty / tl, w: ws * (1 - u * 0.6) * (1 + 0.12 * Math.sin(u * 9 + t * 2)) });
    }
    var L1 = [], R1 = [];
    P.forEach(function (q) { L1.push([q.x + q.nx * q.w / 2, q.y + q.ny * q.w / 2]); R1.push([q.x - q.nx * q.w / 2, q.y - q.ny * q.w / 2]); });
    ctx.beginPath(); ctx.moveTo(L1[0][0], L1[0][1]); for (i = 1; i <= M; i++) ctx.lineTo(L1[i][0], L1[i][1]); for (i = M; i >= 0; i--) ctx.lineTo(R1[i][0], R1[i][1]); ctx.closePath();
    var gr = ctx.createLinearGradient(p0[0], p0[1], p3[0], p3[1]); gr.addColorStop(0, rgba(mix(ca, [255, 255, 255], 0.05), 0.9)); gr.addColorStop(1, rgba(cb, 0.78)); ctx.fillStyle = gr; ctx.fill();
    ctx.beginPath(); P.forEach(function (q, k) { if (k) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.lineWidth = Math.max(0.6, ws * 0.18); ctx.strokeStyle = rgba(lighten(cb, 0.55), 0.38); ctx.stroke();
    if (lod < 1) return;
    ctx.save(); ctx.lineCap = 'round'; var rim = lighten(cb, 0.3), at = function (f) { return P[Math.max(0, Math.min(M, Math.round(f * M)))]; };
    // ramitas capilares
    var nt = role === 'benefit' || role === 'risk' ? 1 : 1 + Math.floor(hash(key + 't') * 3);
    for (i = 0; i < nt; i++) {
      var q = at(0.22 + hash(key + 'tt' + i) * 0.55), sd = hash(key + 's' + i) < 0.5 ? -1 : 1, ang = Math.atan2(q.ty, q.tx) + sd * (0.7 + hash(key + 'a' + i) * 0.5);
      ctx.strokeStyle = rgba(rim, 0.5); var e = wavy(ctx, q.x, q.y, ang, 16 + hash(key + 'l' + i) * 18, Math.max(1.2, q.w * 0.5), 1.4, t, i, 6, sd * 0.35);
      ctx.beginPath(); ctx.arc(e[0], e[1], 1.7, 0, TAU); ctx.fillStyle = rgba(rim, 0.7); ctx.fill();
    }
    if (role === 'benefit') {   // hojas
      ctx.fillStyle = rgba(lighten(cb, 0.1), 0.78);
      [0.3, 0.52, 0.74].forEach(function (f, k) { var q = at(f), sd = k % 2 ? 1 : -1, ang = Math.atan2(q.ty, q.tx) + sd * 0.9 + Math.sin(t * 1.5 + k) * 0.08, l = 13, ex = q.x + Math.cos(ang) * l, ey = q.y + Math.sin(ang) * l, cx1 = q.x + Math.cos(ang - 0.5) * l * 0.65, cy1 = q.y + Math.sin(ang - 0.5) * l * 0.65, cx2 = q.x + Math.cos(ang + 0.5) * l * 0.65, cy2 = q.y + Math.sin(ang + 0.5) * l * 0.65; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.quadraticCurveTo(cx1, cy1, ex, ey); ctx.quadraticCurveTo(cx2, cy2, q.x, q.y); ctx.fill(); });
    } else if (role === 'risk') {   // espinas
      ctx.fillStyle = rgba(lighten(cb, 0.2), 0.9);
      [0.2, 0.36, 0.52, 0.68, 0.82].forEach(function (f, k) { var q = at(f), sd = k % 2 ? 1 : -1, bx = q.x + q.nx * sd * q.w * 0.4, by = q.y + q.ny * sd * q.w * 0.4; ctx.beginPath(); ctx.moveTo(bx - q.tx * 3, by - q.ty * 3); ctx.lineTo(bx + q.nx * sd * 9 + q.tx * 3, by + q.ny * sd * 9 + q.ty * 3); ctx.lineTo(bx + q.tx * 3, by + q.ty * 3); ctx.fill(); });
    } else if (role === 'question') {   // sinapsis: tres ramitas antes de llegar y cuentas
      var q2 = at(0.82); for (i = -1; i <= 1; i++) { ctx.strokeStyle = rgba(rim, 0.55); wavy(ctx, q2.x, q2.y, Math.atan2(q2.ty, q2.tx) + i * 0.7, 14, 1.6, 1, t, i, 5, i * 0.2); }
      ctx.fillStyle = rgba(rim, 0.8); [0.3, 0.5, 0.66].forEach(function (f) { var q = at(f); ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.6, q.w * 0.42), 0, TAU); ctx.fill(); });
    } else if (role === 'example') {   // zarcillo enroscado
      var q3 = at(0.5), sd3 = hash(key + 'c') < 0.5 ? -1 : 1, cx0 = q3.x + q3.nx * sd3 * 9, cy0 = q3.y + q3.ny * sd3 * 9; ctx.strokeStyle = rgba(rim, 0.6); ctx.lineWidth = 1.3; ctx.beginPath(); for (u = 0; u < 3.6 * Math.PI; u += 0.3) { var rs = 1 + u * 1.1, xx = cx0 + Math.cos(u * sd3 + t * 0.6) * rs, yy = cy0 + Math.sin(u * sd3 + t * 0.6) * rs; if (u === 0) ctx.moveTo(q3.x, q3.y); ctx.lineTo(xx, yy); } ctx.stroke();
    } else if (role !== 'process') {   // pelos radiculares
      ctx.strokeStyle = rgba(rim, 0.4); ctx.lineWidth = 1;
      for (i = 0; i < 7; i++) { var q4 = at(0.12 + hash(key + 'h' + i) * 0.76), sd4 = i % 2 ? 1 : -1; ctx.beginPath(); ctx.moveTo(q4.x, q4.y); ctx.lineTo(q4.x + q4.nx * sd4 * (5 + hash(key + 'hh' + i) * 5) + q4.tx * 2, q4.y + q4.ny * sd4 * (5 + hash(key + 'hh' + i) * 5) + q4.ty * 2); ctx.stroke(); }
    }
    // pulsos que viajan por el vaso
    var np = role === 'process' ? 2 : 1, sp = role === 'process' ? 0.3 : 0.14 + hash(key + 'p') * 0.1;
    for (i = 0; i < np; i++) {
      var fu = ((t * sp + hash(key + 'ph' + i) + i / np) % 1), q5 = at(fu), rd = Math.max(2, q5.w * 0.75);
      var pg = ctx.createRadialGradient(q5.x, q5.y, 0, q5.x, q5.y, rd * 2.6); pg.addColorStop(0, 'rgba(255,255,255,0.95)'); pg.addColorStop(0.35, rgba(lighten(cb, 0.5), 0.55)); pg.addColorStop(1, rgba(cb, 0)); ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(q5.x, q5.y, rd * 2.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------- fondo vivo ---------- */
  function backdrop(ctx, V, pr, t) {
    ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0);
    var g = ctx.createRadialGradient(V.W * 0.5, V.H * 0.45, 20, V.W * 0.5, V.H * 0.5, Math.max(V.W, V.H) * 0.8); g.addColorStop(0, '#0c1c1b'); g.addColorStop(0.6, '#08111a'); g.addColorStop(1, '#05060c'); ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
    var big = [[79, 209, 197], [139, 124, 246], [244, 114, 182], [74, 222, 128]];
    for (var i = 0; i < 4; i++) {
      var cx = ((hash('bg' + i) * 1.2 - 0.1) * V.W + Math.sin(t * 0.07 + i * 2) * 60 - V.x0 * V.sc * 0.04) , cy = (hash('bh' + i) * V.H + Math.cos(t * 0.06 + i) * 50), R = Math.max(V.W, V.H) * (0.3 + hash('br' + i) * 0.2);
      var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R); rg.addColorStop(0, rgba(big[i], 0.07)); rg.addColorStop(1, rgba(big[i], 0)); ctx.fillStyle = rg; ctx.fillRect(0, 0, V.W, V.H);
    }
    for (i = 0; i < 46; i++) {   // esporas en suspensión
      var hx = hash('sx' + i), hy = hash('sy' + i), hs = 0.3 + hash('ss' + i);
      var x = ((hx * V.W + t * 7 * hs - V.x0 * V.sc * 0.2) % V.W + V.W) % V.W, y = ((hy * V.H - t * 5 * hs + Math.sin(t * 0.4 + i) * 8) % V.H + V.H) % V.H;
      ctx.beginPath(); ctx.arc(x, y, 0.8 + hs * 1.6, 0, TAU); ctx.fillStyle = 'rgba(190,255,240,' + (0.1 + 0.2 * hs) + ')'; ctx.fill();
    }
    ctx.restore();
  }
  function selected() { try { return new Set((window.network && network.getSelectedNodes ? network.getSelectedNodes() : []).map(String)); } catch (e) { return new Set(); } }

  var organism = {
    transparent: true, edges: false, static: false, margin: { top: 16, bottom: 16, left: 28, right: 28 },
    before: function (ctx, F, V, pr, t) {
      backdrop(ctx, V, pr, t); roles(F);
      var sc = V.sc || 1, lod = sc >= 0.45 ? 1 : sc >= 0.22 ? 0 : -1, sel = selected(), pad = 140;
      var vis = function (o) { return !(o.x + o.w < V.x0 - pad || o.x > V.x1 + pad || o.y + o.h < V.y0 - pad || o.y > V.y1 + pad); };
      F.links.forEach(function (L) { if (vis(L.a) || vis(L.b)) link(ctx, L, t, lod); });
      F.list.forEach(function (o) { if (vis(o)) cell(ctx, o, t, lod, sel.has(o.id)); });
    },
    after: function () { }
  };
  T.register('organism', EN ? '🧬 Organism' : '🧬 Organismo', organism);
  window.__gkOrganism = { roles: Object.keys(GEO) };
})();
