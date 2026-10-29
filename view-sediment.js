/* view-sediment.js — vista «Sedimento»: el esquema como un corte geológico visto de lado.
 * Estratos horizontales de tierra con vetas onduladas; cada concepto es una inclusión mineral según su función (geoda, veta, fósil,
 * cavidad, cristales, obsidiana, nódulo, conglomerado, pirita, ámbar, canto rodado); cada relación es una grieta con relleno mineral.
 * Todo sale del contenido del mapa. Solo dibuja detrás del texto; no toca los datos. Necesita /view3d.js y /view-shapes.js. */
(function () {
  'use strict';
  var T = window.__gkV3, SH = window.__gkShapes; if (!T || !T.register || !SH || !SH.roleOf) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en');
  var rgba = T.rgba, mix = T.mix, lighten = T.lighten, darken = T.darken, hash = T.hash, TAU = Math.PI * 2;
  var EARTH = [[56, 43, 38], [92, 62, 44], [124, 88, 56], [84, 80, 76], [58, 72, 80], [44, 49, 62], [66, 50, 58]];
  var VEIN = { process: [232, 190, 80], question: [120, 190, 210], benefit: [110, 210, 150], risk: [230, 90, 80], date: [150, 220, 235], list: [235, 150, 190], formula: [240, 215, 90], definition: [250, 160, 70], example: [245, 190, 120], root: [120, 230, 215], category: [175, 160, 245], concept: [230, 230, 220], bubble: [230, 230, 220] };
  var STONE = { root: [92, 62, 110], category: [60, 66, 112], process: [70, 56, 34], example: [96, 84, 64], question: [20, 18, 24], benefit: [30, 76, 64], risk: [18, 16, 20], date: [86, 72, 60], list: [74, 64, 58], formula: [86, 74, 30], definition: [128, 64, 18], concept: [74, 78, 84], bubble: [74, 78, 84] };
  function roles(F) {
    var nk = new Map(); F.links.forEach(function (L) { nk.set(L.a.id, (nk.get(L.a.id) || 0) + 1); });
    F.list.forEach(function (o) { if (!o.role) o.role = SH.roleOf(o, o.nk != null ? o.nk : (nk.get(o.id) || 0)); });
  }
  var wave = function (x, a, s) { return a * (Math.sin(x * 0.0042 + s) + 0.55 * Math.sin(x * 0.0113 + s * 2.3) + 0.3 * Math.sin(x * 0.027 + s * 4.1)); };
  function blobPts(o, id, jag, grow) {
    var rx = o.w / 2 + 9 + (grow || 0), ry = o.h / 2 + 7 + (grow || 0), N = jag > 0.25 ? 14 : 22, P = [], p = hash(id + 'ph') * TAU;
    for (var k = 0; k < N; k++) { var th = k / N * TAU, r = 1 + (hash(id + 'j' + k) - 0.5) * jag + 0.04 * Math.sin(3 * th + p), c = Math.cos(th), s = Math.sin(th); P.push([o.cx + rx * r * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 0.62), o.cy + ry * r * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 0.62)]); }
    return P;
  }
  function smooth(ctx, P) { var n = P.length; ctx.beginPath(); ctx.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2); for (var k = 0; k < n; k++) { var a = P[k], b = P[(k + 1) % n]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); } ctx.closePath(); }
  function angular(ctx, P) { ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (var k = 1; k < P.length; k++) ctx.lineTo(P[k][0], P[k][1]); ctx.closePath(); }
  function selected() { try { return new Set((window.network && network.getSelectedNodes ? network.getSelectedNodes() : []).map(String)); } catch (e) { return new Set(); } }

  function strata(ctx, F, V, pr) {
    ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0); ctx.fillStyle = rgba(EARTH[0], 1); ctx.fillRect(0, 0, V.W, V.H); ctx.restore();
    var lo = 1e9, hi = -1e9, maxLv = 0; F.list.forEach(function (o) { lo = Math.min(lo, o.cy); hi = Math.max(hi, o.cy); maxLv = Math.max(maxLv, o.lv); });
    var nb = Math.max(3, Math.min(7, maxLv + 2)), top = Math.min(lo - 120, V.y0 - 40), bot = Math.max(hi + 120, V.y1 + 40), H = (bot - top) / nb, x0 = V.x0 - 60, x1 = V.x1 + 60, seed = F.list.length * 7.13;
    for (var b = 0; b < nb; b++) {
      var col = EARTH[b % EARTH.length], ya = top + b * H, yb = top + (b + 1) * H, A = 12 + hash('A' + b) * 14, s1 = seed + b * 1.7, s2 = seed + (b + 1) * 1.7;
      ctx.save(); ctx.beginPath(); var x;
      ctx.moveTo(x0, ya + wave(x0, b ? A : 0, s1)); for (x = x0; x <= x1; x += 24) ctx.lineTo(x, ya + wave(x, b ? A : 0, s1));
      for (x = x1; x >= x0; x -= 24) ctx.lineTo(x, yb + wave(x, b < nb - 1 ? 12 + hash('A' + (b + 1)) * 14 : 0, s2)); ctx.closePath();
      var g = ctx.createLinearGradient(0, ya, 0, yb); g.addColorStop(0, rgba(darken(col, 0.18), 1)); g.addColorStop(1, rgba(lighten(col, 0.06), 1)); ctx.fillStyle = g; ctx.fill(); ctx.clip();
      // vetas finas paralelas
      for (var k = 1; k < 9; k++) { var yy = ya + H * k / 9, dark = k % 2; ctx.strokeStyle = dark ? 'rgba(0,0,0,0.16)' : 'rgba(255,235,200,0.08)'; ctx.lineWidth = 1 + hash('v' + b + k) * 1.6; ctx.beginPath(); for (x = x0; x <= x1; x += 20) { var y = yy + wave(x, 7 + k, s1 + k * 0.9) * 0.6; if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
      // granos y guijarros (una cosa por celda, determinista en coordenadas del mapa)
      var cs = 34, cx0 = Math.floor(x0 / cs), cx1 = Math.ceil(x1 / cs), cy0 = Math.floor(ya / cs), cy1 = Math.ceil(yb / cs);
      for (var cx = cx0; cx <= cx1; cx++) for (var cy = cy0; cy <= cy1; cy++) {
        var h = hash('c' + cx + ',' + cy); if (h > 0.55) continue; var px = (cx + hash('x' + cx + cy)) * cs, py = (cy + hash('y' + cx + cy)) * cs;
        if (h < 0.1) { ctx.beginPath(); ctx.ellipse(px, py, 4 + hash('s' + cx + cy) * 7, 2.5 + hash('t' + cx + cy) * 4, hash('r' + cx + cy) * 3, 0, TAU); ctx.fillStyle = rgba(lighten(col, 0.14 + hash('q' + cx + cy) * 0.12), 0.8); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke(); }
        else { ctx.fillStyle = h < 0.3 ? 'rgba(0,0,0,0.28)' : 'rgba(255,240,210,0.2)'; ctx.fillRect(px, py, 1.5 + hash('z' + cx + cy) * 2, 1.5 + hash('w' + cx + cy) * 2); }
      }
      ctx.restore();
      if (b) { ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); for (x = x0; x <= x1; x += 24) { var y2 = ya + wave(x, A, s1); if (x === x0) ctx.moveTo(x, y2); else ctx.lineTo(x, y2); } ctx.stroke(); ctx.strokeStyle = 'rgba(255,235,200,0.12)'; ctx.translate(0, 2.5); ctx.stroke(); ctx.restore(); }
    }
  }
  function anchor(o, dx, dy) { var hx = o.w / 2 + 8, hy = o.h / 2 + 6, s = Math.min(dx ? hx / Math.abs(dx) : 1e9, dy ? hy / Math.abs(dy) : 1e9); return [o.cx + dx * s, o.cy + dy * s]; }
  function crack(ctx, L) {
    var a = L.a, b = L.b, dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy); if (len < 2) return;
    var p0 = anchor(a, dx, dy), p1 = anchor(b, -dx, -dy), nx = -dy / len, ny = dx / len, n = Math.max(3, Math.round(len / 22)), P = [], i, vc = VEIN[b.role] || VEIN.concept;
    for (i = 0; i <= n; i++) { var u = i / n, j = i && i < n ? (hash(L.key + 'j' + i) - 0.5) * 15 : 0; P.push([p0[0] + (p1[0] - p0[0]) * u + nx * j, p0[1] + (p1[1] - p0[1]) * u + ny * j]); }
    var line = function (pts, w, st) { ctx.beginPath(); pts.forEach(function (p, k) { if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.lineWidth = w; ctx.strokeStyle = st; ctx.stroke(); };
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    var w = 4 + Math.min(b.nk || 0, 4) * 0.9;
    line(P, w + 3, 'rgba(0,0,0,0.5)'); line(P, w, rgba(darken(vc, 0.45), 1)); line(P, Math.max(1.2, w * 0.45), rgba(vc, 0.95));
    for (i = 1; i < n; i++) if (hash(L.key + 'br' + i) < 0.45) {   // ramificaciones
      var sd = hash(L.key + 'sd' + i) < 0.5 ? -1 : 1, q = P[i], bl = 14 + hash(L.key + 'bl' + i) * 26, ang = Math.atan2(dy, dx) + sd * (0.7 + hash(L.key + 'ba' + i) * 0.6), q2 = [q[0] + Math.cos(ang) * bl * 0.55 + (hash(L.key + 'm' + i) - 0.5) * 8, q[1] + Math.sin(ang) * bl * 0.55], q3 = [q[0] + Math.cos(ang) * bl, q[1] + Math.sin(ang) * bl];
      line([q, q2, q3], 3, 'rgba(0,0,0,0.5)'); line([q, q2, q3], 1.3, rgba(vc, 0.8));
    }
  }
  function inclusion(ctx, o, sel) {
    var id = o.id, role = o.role, st = STONE[role] || STONE.concept, vc = VEIN[role] || VEIN.concept, rx = o.w / 2 + 9, ry = o.h / 2 + 7, cx = o.cx, cy = o.cy, P, k;
    ctx.save(); ctx.lineJoin = 'round';
    if (sel) { ctx.shadowColor = rgba(vc, 0.95); ctx.shadowBlur = 24; }
    var fillDark = function (col) { ctx.fillStyle = rgba(col, 1); ctx.fill(); ctx.shadowBlur = 0; };
    if (role === 'root' || role === 'category') {   // geoda: corteza, bandas de ágata, núcleo oscuro
      var rings = role === 'root' ? 4 : 3; P = blobPts(o, id, 0.12, 8); smooth(ctx, P); ctx.fillStyle = 'rgba(170,150,120,1)'; ctx.fill(); ctx.shadowBlur = 0;
      for (k = 0; k < rings; k++) { P = blobPts(o, id, 0.1, 6 - k * (6 / rings) * 1.15); smooth(ctx, P); ctx.fillStyle = rgba(k % 2 ? lighten(vc, 0.1) : mix(st, vc, 0.5 + k * 0.1), 1); ctx.fill(); }
      P = blobPts(o, id, 0.08, -4); smooth(ctx, P); ctx.fillStyle = rgba(darken(st, 0.55), 1); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(lighten(vc, 0.3), 0.7); ctx.stroke();
    } else if (role === 'process') {   // veta lenticular con estrías
      P = [[cx - rx - 10, cy], [cx - rx * 0.6, cy - ry], [cx + rx * 0.55, cy - ry * 1.05], [cx + rx + 12, cy], [cx + rx * 0.6, cy + ry], [cx - rx * 0.55, cy + ry * 1.05]]; angular(ctx, P); fillDark(darken(st, 0.2));
      ctx.save(); angular(ctx, P); ctx.clip(); ctx.strokeStyle = rgba(vc, 0.38); ctx.lineWidth = 1.2; for (var s = -ry; s <= ry; s += 7) { ctx.beginPath(); ctx.moveTo(cx - rx - 12, cy + s - 6); ctx.lineTo(cx + rx + 14, cy + s + 6); ctx.stroke(); } ctx.restore(); angular(ctx, P); ctx.lineWidth = 2; ctx.strokeStyle = rgba(vc, 0.9); ctx.stroke();
    } else if (role === 'question') {   // cavidad con cristales hacia dentro
      P = blobPts(o, id, 0.34, 4); angular(ctx, P); fillDark([14, 12, 20]); ctx.lineWidth = 2; ctx.strokeStyle = rgba(vc, 0.75); ctx.stroke();
      P.forEach(function (p, i) { if (i % 2) return; var dx = cx - p[0], dy = cy - p[1], l = Math.hypot(dx, dy) || 1, nxx = -dy / l, nyy = dx / l; ctx.beginPath(); ctx.moveTo(p[0] + nxx * 4, p[1] + nyy * 4); ctx.lineTo(p[0] + dx / l * (9 + hash(id + 'cr' + i) * 8), p[1] + dy / l * (9 + hash(id + 'cr' + i) * 8)); ctx.lineTo(p[0] - nxx * 4, p[1] - nyy * 4); ctx.closePath(); ctx.fillStyle = rgba(lighten(vc, 0.2), 0.75); ctx.fill(); });
    } else if (role === 'benefit') {   // racimo de cristales
      for (k = 0; k < 9; k++) { var ang = -Math.PI * 0.5 + (k - 4) * 0.42 + (hash(id + 'a' + k) - 0.5) * 0.2, len = 18 + hash(id + 'l' + k) * 16, bx = cx + (k - 4) * rx * 0.22, by = cy - ry * 0.4; ctx.beginPath(); ctx.moveTo(bx - 6, by); ctx.lineTo(bx + Math.cos(ang) * len, by - ry * 0.5 + Math.sin(ang) * len - 8); ctx.lineTo(bx + 6, by); ctx.closePath(); ctx.fillStyle = rgba(lighten(vc, 0.1 + (k % 3) * 0.1), 0.85); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = rgba(darken(vc, 0.4), 0.8); ctx.stroke(); }
      P = blobPts(o, id, 0.16, 2); smooth(ctx, P); fillDark(st); ctx.lineWidth = 2; ctx.strokeStyle = rgba(vc, 0.85); ctx.stroke();
    } else if (role === 'risk') {   // obsidiana
      P = blobPts(o, id, 0.55, 5); angular(ctx, P); fillDark(st); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(vc, 0.85); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - rx * 0.7, cy - ry * 0.75); ctx.lineTo(cx - rx * 0.1, cy - ry * 0.85); ctx.lineTo(cx - rx * 0.5, cy - ry * 0.4); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    } else if (role === 'date') {   // nódulo bandeado
      P = blobPts(o, id, 0.1, 4); smooth(ctx, P); fillDark(st); ctx.save(); smooth(ctx, P); ctx.clip(); for (var y = cy - ry - 8, i2 = 0; y < cy + ry + 8; y += 6, i2++) { ctx.fillStyle = i2 % 2 ? rgba(vc, 0.16) : 'rgba(0,0,0,0.18)'; ctx.fillRect(cx - rx - 10, y, rx * 2 + 20, 3 + hash(id + 'by' + i2) * 3); } ctx.restore(); smooth(ctx, P); ctx.lineWidth = 2; ctx.strokeStyle = rgba(vc, 0.75); ctx.stroke();
    } else if (role === 'list') {   // conglomerado de guijarros
      for (k = 0; k < 6; k++) { var ang2 = k / 6 * TAU + hash(id + 'q') * 2, px = cx + Math.cos(ang2) * rx * 0.85, py = cy + Math.sin(ang2) * ry * 0.95, pr = 8 + hash(id + 'p' + k) * 7; ctx.beginPath(); ctx.ellipse(px, py, pr * 1.2, pr, ang2, 0, TAU); ctx.fillStyle = rgba(lighten(st, 0.12 + hash(id + 'pc' + k) * 0.15), 1); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke(); }
      P = blobPts(o, id, 0.12, 0); smooth(ctx, P); fillDark(darken(st, 0.25)); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(vc, 0.7); ctx.stroke();
    } else if (role === 'formula') {   // pirita: cubo con bisel
      var x0 = cx - rx - 2, x1 = cx + rx + 2, y0 = cy - ry, y1 = cy + ry, d = 8; ctx.beginPath(); ctx.rect(x0, y0 + d, x1 - x0 - d, y1 - y0 - d); fillDark(st);
      ctx.beginPath(); ctx.moveTo(x0, y0 + d); ctx.lineTo(x0 + d, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1 - d, y0 + d); ctx.closePath(); ctx.fillStyle = rgba(lighten(vc, 0.1), 0.95); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x1 - d, y0 + d); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1 - d); ctx.lineTo(x1 - d, y1); ctx.closePath(); ctx.fillStyle = rgba(darken(vc, 0.45), 1); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(vc, 0.9); ctx.strokeRect(x0, y0 + d, x1 - x0 - d, y1 - y0 - d);
    } else if (role === 'definition') {   // ámbar
      P = blobPts(o, id, 0.1, 5); smooth(ctx, P); var ag = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, 2, cx, cy, rx); ag.addColorStop(0, 'rgba(190,100,20,1)'); ag.addColorStop(1, 'rgba(92,40,10,1)'); ctx.fillStyle = ag; ctx.fill(); ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = rgba(vc, 0.9); ctx.stroke();
      for (k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(cx + (hash(id + 'bx' + k) - 0.5) * rx * 1.6, cy + (hash(id + 'by' + k) - 0.5) * ry * 1.4, 1 + hash(id + 'bs' + k) * 2.4, 0, TAU); ctx.fillStyle = 'rgba(255,220,150,0.5)'; ctx.fill(); }
    } else if (role === 'example') {   // fósil: piedra con espiral y costillas
      P = blobPts(o, id, 0.1, 4); smooth(ctx, P); fillDark(darken(st, 0.25)); ctx.save(); smooth(ctx, P); ctx.clip(); var sx = cx - rx * 0.62; ctx.strokeStyle = rgba(vc, 0.45); ctx.lineWidth = 1.4; ctx.beginPath(); for (var u = 0; u < 3.4 * TAU; u += 0.22) { var rs = 1.5 + u * 2.1, xx = sx + Math.cos(u) * rs, yy = cy + Math.sin(u) * rs * 0.9; if (u === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); } ctx.stroke(); for (k = 0; k < 14; k++) { var aa = k / 14 * TAU; ctx.beginPath(); ctx.moveTo(sx + Math.cos(aa) * 8, cy + Math.sin(aa) * 8); ctx.lineTo(sx + Math.cos(aa) * 22, cy + Math.sin(aa) * 20); ctx.stroke(); } ctx.restore(); smooth(ctx, P); ctx.lineWidth = 2; ctx.strokeStyle = rgba(vc, 0.7); ctx.stroke();
    } else {   // canto rodado
      P = blobPts(o, id, 0.14, 4); smooth(ctx, P); fillDark(darken(st, 0.3)); ctx.lineWidth = 2; ctx.strokeStyle = rgba(lighten(st, 0.4), 0.7); ctx.stroke();
      for (k = 0; k < 9; k++) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(cx + (hash(id + 'sx' + k) - 0.5) * rx * 1.7, cy + (hash(id + 'sy' + k) - 0.5) * ry * 1.5, 2, 2); }
    }
    ctx.restore();
  }
  var sediment = {
    transparent: true, edges: false, static: true, margin: { top: 16, bottom: 16, left: 30, right: 30 },
    before: function (ctx, F, V, pr) {
      roles(F); strata(ctx, F, V, pr);
      var nk = new Map(); F.links.forEach(function (L) { nk.set(L.b.id, (nk.get(L.b.id) || 0) + 1); });
      F.links.forEach(function (L) { crack(ctx, L); });
      var sel = selected(); F.list.slice().sort(function (a, b) { return a.lv - b.lv; }).forEach(function (o) { inclusion(ctx, o, sel.has(o.id)); });
    },
    after: function () { }
  };
  T.register('sediment', EN ? '🪨 Sediment' : '🪨 Sedimento', sediment);
  window.__gkSediment = { earth: EARTH.length };
})();
