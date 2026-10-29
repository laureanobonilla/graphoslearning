/* view-watercolor.js — vista «Acuarela»: pigmento húmedo sobre papel de algodón.
 * Cada concepto es un charco de varias capas translúcidas con borde de agua (más oscuro donde el pigmento se acumula), granulación y
 * salpicaduras; donde dos charcos se tocan los colores se mezclan. Las relaciones son pinceladas de pincel seco con cerdas visibles.
 * Seis pigmentos según la función. Solo dibuja detrás del texto. Necesita /view3d.js, /view-shapes.js y /view-artkit.js. */
(function () {
  'use strict';
  var T = window.__gkV3, K = window.__gkKit; if (!T || !T.register || !K) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en'), rgba = T.rgba, hash = T.hash, mix = T.mix, TAU = Math.PI * 2;
  var PIG = { indigo: [46, 58, 140], madder: [170, 40, 60], viridian: [24, 130, 108], ochre: [200, 140, 30], violet: [110, 60, 150], umber: [92, 62, 48], payne: [30, 44, 66] };
  var ROLE = { root: 'payne', category: 'indigo', process: 'madder', example: 'ochre', question: 'violet', benefit: 'viridian', risk: 'madder', date: 'indigo', list: 'viridian', formula: 'ochre', definition: 'umber', concept: 'payne', bubble: 'payne' };
  var cache = {};
  function pool(ctx, o, k, c0, scale, alpha, edge) {
    var id = o.id, N = 26, P = [], rx = (o.w / 2 + 12) * scale, ry = (o.h / 2 + 10) * scale, ph = hash(id + 'p' + k) * TAU;
    for (var i = 0; i < N; i++) { var th = i / N * TAU, n = K.noise(Math.cos(th) * 1.6 + 5, Math.sin(th) * 1.6 + 5, id + k), r = 0.78 + n * 0.5 + 0.07 * Math.sin(3 * th + ph), c = Math.cos(th), s = Math.sin(th); P.push([o.cx + rx * r * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 0.7), o.cy + ry * r * (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 0.7)]); }
    ctx.beginPath(); ctx.moveTo((P[N - 1][0] + P[0][0]) / 2, (P[N - 1][1] + P[0][1]) / 2); for (i = 0; i < N; i++) { var a = P[i], b = P[(i + 1) % N]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); } ctx.closePath();
    ctx.fillStyle = rgba(c0, alpha); ctx.fill(); if (edge) { ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(mix(c0, [0, 0, 20], 0.35), edge); ctx.stroke(); }
  }
  function stroke(ctx, L) {
    var a = L.a, b = L.b, dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy); if (len < 2) return;
    var p0 = K.anchor(a, dx, dy, 2), p1 = K.anchor(b, -dx, -dy, 2), nx = -dy / len, ny = dx / len, c0 = PIG[ROLE[b.role] || 'payne'], w = 7 + Math.min(b.k, 5) * 1.6, bend = (hash(L.key + 'b') - 0.5) * Math.min(80, len * 0.3), key = L.key;
    for (var h = 0; h < 7; h++) {   // cerdas del pincel seco
      var off = (h / 6 - 0.5) * w, drop = 0.55 + hash(key + 'd' + h) * 0.45, cut = 0.72 + hash(key + 'e' + h) * 0.28;
      ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineWidth = 1.4 + hash(key + 'w' + h) * 1.8; ctx.strokeStyle = rgba(c0, 0.2 + hash(key + 'a' + h) * 0.28);
      for (var i = 0; i <= 14; i++) { var u = i / 14 * cut, qx = p0[0] + (p1[0] - p0[0]) * u + nx * (off * (1 - u * 0.55) + Math.sin(u * Math.PI) * bend), qy = p0[1] + (p1[1] - p0[1]) * u + ny * (off * (1 - u * 0.55) + Math.sin(u * Math.PI) * bend); if (i) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy); } ctx.stroke();
    }
  }
  var wc = {
    transparent: true, edges: false, static: true, margin: { top: 18, bottom: 18, left: 32, right: 32 },
    before: function (ctx, F, V, pr) {
      K.roles(F); var sel = K.selected();
      K.screen(ctx, V, pr, function () {
        var g = ctx.createRadialGradient(V.W / 2, V.H / 2, 40, V.W / 2, V.H / 2, Math.max(V.W, V.H) * 0.75); g.addColorStop(0, '#f1ead8'); g.addColorStop(1, '#e2d8bf'); ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
        var tile = K.grain(cache, '120,100,70', 1400); ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.globalAlpha = 1; ctx.fillRect(0, 0, V.W, V.H);
      });
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      F.links.forEach(function (L) { stroke(ctx, L); });
      F.list.slice().sort(function (a, b) { return b.k - a.k; }).forEach(function (o) {
        var c0 = PIG[ROLE[o.role] || 'payne'], id = o.id, c1 = PIG[['indigo', 'madder', 'viridian', 'ochre', 'violet'][Math.floor(hash(id + 'c1') * 5)]];
        pool(ctx, o, 0, c0, 1.35, 0.2, 0.0); pool(ctx, o, 1, mix(c0, c1, 0.4), 1.15, 0.26, 0.0); pool(ctx, o, 2, c0, 1.0, 0.34, 0.5); pool(ctx, o, 3, mix(c0, [10, 10, 30], 0.45), 0.72, 0.62, 0.4);
        // granulación y salpicaduras
        ctx.fillStyle = rgba(c0, 0.5); for (var i = 0; i < 18; i++) { var an = hash(id + 'sa' + i) * TAU, rr = (o.w / 2 + 16 + hash(id + 'sr' + i) * 46); ctx.beginPath(); ctx.arc(o.cx + Math.cos(an) * rr, o.cy + Math.sin(an) * rr * 0.6, 0.8 + hash(id + 'ss' + i) * 2.2, 0, TAU); ctx.fill(); }
      });
      ctx.restore();
      F.list.forEach(function (o) { if (sel.has(o.id)) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]); ctx.strokeRect(o.x - 8, o.y - 5, o.w + 16, o.h + 10); ctx.restore(); } });
    },
    after: function () { }
  };
  T.register('watercolor', EN ? '💧 Watercolor' : '💧 Acuarela', wc);
})();
