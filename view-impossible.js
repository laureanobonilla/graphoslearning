/* view-impossible.js — vista «Arquitectura imposible»: el esquema como una ciudad de volúmenes que no pueden existir.
 * Cada concepto es un bloque en proyección oblicua cuya cara frontal es la placa del texto; la profundidad sale de sus conexiones.
 * Las relaciones son escaleras, puentes y pasarelas que unen caras que no se tocan; sombras largas cruzan el cielo.
 * Paleta de hormigón con acentos de terracota, arena, salvia y azul. Solo dibuja detrás del texto. Necesita /view3d.js, /view-shapes.js y /view-artkit.js. */
(function () {
  'use strict';
  var T = window.__gkV3, K = window.__gkKit; if (!T || !T.register || !K) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en'), rgba = T.rgba, hash = T.hash, mix = T.mix, lighten = T.lighten, darken = T.darken, TAU = Math.PI * 2;
  var FACE = { root: [46, 48, 56], category: [40, 52, 92], process: [128, 56, 40], example: [122, 100, 68], question: [44, 40, 84], benefit: [60, 88, 72], risk: [24, 24, 28], date: [58, 76, 96], list: [86, 86, 84], formula: [110, 84, 40], definition: [96, 58, 52], concept: [58, 60, 66], bubble: [58, 60, 66] };
  function box(ctx, o, sel) {
    var id = o.id, c = FACE[o.role] || FACE.concept, d = 12 + Math.min(o.k, 6) * 7 + (o.lv === 0 ? 14 : 0), vx = d * 0.85, vy = -d * 0.6, x0 = o.x - 6, x1 = o.x + o.w + 6, y0 = o.y - 4, y1 = o.y + o.h + 4;
    // sombra larga
    ctx.save(); ctx.fillStyle = 'rgba(40,24,20,0.2)'; var L = 46 + d * 1.4; ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1 + L * 0.5); ctx.lineTo(x0 - L, y1 + L * 0.5); ctx.closePath(); ctx.fill(); ctx.restore();
    // cara superior y lateral
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + vx, y0 + vy); ctx.lineTo(x1 + vx, y0 + vy); ctx.lineTo(x1, y0); ctx.closePath(); ctx.fillStyle = rgba(lighten(c, 0.55), 1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x1, y0); ctx.lineTo(x1 + vx, y0 + vy); ctx.lineTo(x1 + vx, y1 + vy); ctx.lineTo(x1, y1); ctx.closePath(); ctx.fillStyle = rgba(lighten(c, 0.12), 1); ctx.fill();
    // ventanas y arco en el lateral
    var win = 2 + Math.floor(hash(id + 'wn') * 3), hh = (y1 - y0) * 0.5;
    ctx.fillStyle = 'rgba(12,10,16,0.75)'; for (var i = 0; i < win; i++) { var u = (i + 0.5) / win, wx = x1 + vx * (u - 0.12), wy = y0 + vy * u + (y1 - y0) * 0.22; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + vx * 0.14, wy + vy * 0.14); ctx.lineTo(wx + vx * 0.14, wy + vy * 0.14 + hh); ctx.lineTo(wx, wy + hh); ctx.closePath(); ctx.fill(); }
    // frente
    ctx.fillStyle = rgba(c, 1); ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x0, y0, x1 - x0, 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    if (hash(id + 'ar') < 0.4) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x0 + 12, y1, 9, Math.PI, 0); ctx.closePath(); ctx.fill(); }   // arco ciego
    if (sel) { ctx.strokeStyle = '#f2d98a'; ctx.lineWidth = 3; ctx.strokeRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4); }
  }
  function stairs(ctx, L, ix) {
    var a = L.a, b = L.b, p0 = [a.cx, a.y + a.h + 4], p1 = [b.cx, b.y - 4], dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy); if (len < 6) return;
    var bridge = hash(L.key + 'br') < 0.3, n = Math.max(3, Math.round(len / (bridge ? 9 : 15))), c = FACE[b.role] || FACE.concept, w = bridge ? 12 : 17, ux = dx / len, uy = dy / len;
    for (var i = 0; i < n; i++) {
      var u = (i + 0.5) / n, x = p0[0] + dx * u, y = p0[1] + dy * u, sw = w * (0.85 + 0.15 * Math.sin(u * 5)), sh = bridge ? 4 : 8;
      ctx.fillStyle = rgba(darken(c, 0.15), 1); ctx.fillRect(x - sw / 2, y, sw, sh);
      ctx.fillStyle = rgba(lighten(c, 0.5), 1); ctx.beginPath(); ctx.moveTo(x - sw / 2, y); ctx.lineTo(x - sw / 2 + 4, y - 3); ctx.lineTo(x + sw / 2 + 4, y - 3); ctx.lineTo(x + sw / 2, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba(lighten(c, 0.12), 1); ctx.beginPath(); ctx.moveTo(x + sw / 2, y); ctx.lineTo(x + sw / 2 + 4, y - 3); ctx.lineTo(x + sw / 2 + 4, y + sh - 3); ctx.lineTo(x + sw / 2, y + sh); ctx.closePath(); ctx.fill();
    }
    if (bridge) { ctx.strokeStyle = 'rgba(20,18,24,0.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p0[0] - 8, p0[1] - 10); ctx.lineTo(p1[0] - 8, p1[1] - 10); ctx.stroke(); for (var k = 0; k <= n; k += 2) { var v = k / n; ctx.beginPath(); ctx.moveTo(p0[0] + dx * v - 8, p0[1] + dy * v - 10); ctx.lineTo(p0[0] + dx * v - 8, p0[1] + dy * v); ctx.stroke(); } }
  }
  var arch = {
    transparent: true, edges: false, static: true, margin: { top: 18, bottom: 18, left: 32, right: 32 },
    before: function (ctx, F, V, pr) {
      K.roles(F); var sel = K.selected(), seed = K.seedOf(F);
      K.screen(ctx, V, pr, function () {
        var g = ctx.createLinearGradient(0, 0, 0, V.H); g.addColorStop(0, '#d8c29e'); g.addColorStop(0.6, '#b89f84'); g.addColorStop(1, '#8c7e74'); ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
        ctx.fillStyle = 'rgba(255,244,214,0.38)'; ctx.beginPath(); ctx.arc(V.W * (0.15 + hash(seed + 'm') * 0.7), V.H * (0.12 + hash(seed + 'n') * 0.2), Math.min(V.W, V.H) * 0.13, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(70,52,46,0.1)'; for (var i = 0; i < 4; i++) { var y = V.H * (0.3 + i * 0.18); ctx.fillRect(0, y, V.W, 2 + i); }
      });
      F.links.forEach(function (L, i) { stairs(ctx, L, i); });
      F.list.slice().sort(function (a, b) { return a.cy - b.cy; }).forEach(function (o) { box(ctx, o, sel.has(o.id)); });
    },
    after: function () { }
  };
  T.register('impossible', EN ? '🏛️ Impossible architecture' : '🏛️ Arquitectura imposible', arch);
})();
