/* view-topo.js — vista «Topografía»: el esquema como un terreno cartografiado.
 * Cada concepto levanta una colina cuya altura sale de sus conexiones y su nivel; entre ellas el terreno se mezcla con ruido. Se dibujan
 * curvas de nivel (cada quinta más gruesa y en bermellón), tintes hipsométricos en tonos de papel, y las relaciones son senderos con
 * marcas perpendiculares. Cada concepto es un vértice geodésico con su cartucho para el texto. Necesita /view3d.js, /view-shapes.js y /view-artkit.js. */
(function () {
  'use strict';
  var T = window.__gkV3, K = window.__gkKit; if (!T || !T.register || !K) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en'), rgba = T.rgba, hash = T.hash, mix = T.mix, TAU = Math.PI * 2;
  var LOW = [52, 78, 74], MID = [166, 156, 120], HIGH = [232, 224, 200], LINE = [28, 40, 42], ACC = [200, 60, 36];
  var LV = 16;
  function field(nodes, seed) {
    return function (x, y) {
      var h = 0.35 * K.noise(x / 260, y / 260, seed) + 0.15 * K.noise(x / 90, y / 90, seed + 'b');
      for (var i = 0; i < nodes.length; i++) { var n = nodes[i], dx = x - n.cx, dy = y - n.cy, s2 = n.sg * n.sg, d2 = dx * dx + dy * dy; if (d2 > s2 * 9) continue; h += n.a * Math.exp(-d2 / (2 * s2)); }
      return h;
    };
  }
  var topo = {
    transparent: true, edges: false, static: true, margin: { top: 18, bottom: 18, left: 32, right: 32 },
    before: function (ctx, F, V, pr) {
      K.roles(F); var sel = K.selected(), seed = K.seedOf(F);
      var ns = F.list.map(function (o) { return { cx: o.cx, cy: o.cy, a: 0.28 + Math.min(o.k, 6) * 0.07 + (o.lv === 0 ? 0.25 : 0), sg: 70 + Math.min(o.k, 6) * 10 + o.w * 0.25 }; });
      var f = field(ns, seed), cs = Math.max(10, Math.min(22, (V.x1 - V.x0) / 90)), x0 = Math.floor(V.x0 / cs) * cs, y0 = Math.floor(V.y0 / cs) * cs, nx = Math.ceil((V.x1 - x0) / cs) + 1, ny = Math.ceil((V.y1 - y0) / cs) + 1, g = [], i, j;
      for (j = 0; j <= ny; j++) { g[j] = []; for (i = 0; i <= nx; i++) g[j][i] = f(x0 + i * cs, y0 + j * cs); }
      var hmax = 1.15;
      // tinte hipsométrico por celda
      K.screen(ctx, V, pr, function () { ctx.fillStyle = rgba(HIGH, 1); ctx.fillRect(0, 0, V.W, V.H); });
      for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { var hv = (g[j][i] + g[j][i + 1] + g[j + 1][i] + g[j + 1][i + 1]) / 4, u = Math.max(0, Math.min(1, hv / hmax)), band = Math.floor(u * LV) / LV, c = band < 0.5 ? mix(LOW, MID, band * 2) : mix(MID, HIGH, (band - 0.5) * 2); ctx.fillStyle = rgba(c, 1); ctx.fillRect(x0 + i * cs, y0 + j * cs, cs + 0.6, cs + 0.6); }
      // curvas de nivel (marching squares)
      for (var L = 1; L < LV * 1.0; L++) {
        var lvl = L / LV * hmax, idx = L % 5 === 0; ctx.beginPath(); ctx.strokeStyle = idx ? rgba(ACC, 0.95) : rgba(LINE, 0.6); ctx.lineWidth = idx ? 1.6 : 0.8;
        for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
          var a = g[j][i], b = g[j][i + 1], c2 = g[j + 1][i + 1], d = g[j + 1][i], code = (a > lvl ? 8 : 0) | (b > lvl ? 4 : 0) | (c2 > lvl ? 2 : 0) | (d > lvl ? 1 : 0); if (code === 0 || code === 15) continue;
          var X = x0 + i * cs, Y = y0 + j * cs, t = function (p, q) { return (lvl - p) / (q - p); }, top = [X + t(a, b) * cs, Y], right = [X + cs, Y + t(b, c2) * cs], bot = [X + t(d, c2) * cs, Y + cs], left = [X, Y + t(a, d) * cs], seg = function (p, q) { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
          switch (code) { case 1: case 14: seg(left, bot); break; case 2: case 13: seg(bot, right); break; case 3: case 12: seg(left, right); break; case 4: case 11: seg(top, right); break; case 5: seg(top, left); seg(bot, right); break; case 6: case 9: seg(top, bot); break; case 7: case 8: seg(top, left); break; case 10: seg(top, right); seg(left, bot); break; }
        }
        ctx.stroke();
      }
      // senderos
      ctx.save(); ctx.lineCap = 'butt';
      F.links.forEach(function (Lk) {
        var a = Lk.a, b = Lk.b, dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy); if (len < 2) return; var p0 = K.anchor(a, dx, dy, 10), p1 = K.anchor(b, -dx, -dy, 10), ux = dx / len, uy = dy / len;
        ctx.strokeStyle = rgba(LINE, 0.9); ctx.lineWidth = 1.6; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
        for (var s = 12; s < len - 20; s += 18) { var qx = p0[0] + ux * s, qy = p0[1] + uy * s; ctx.beginPath(); ctx.moveTo(qx - uy * 4, qy + ux * 4); ctx.lineTo(qx + uy * 4, qy - ux * 4); ctx.stroke(); }
      });
      ctx.restore();
      // vértices geodésicos y cartuchos
      F.list.forEach(function (o) {
        var s = sel.has(o.id); ctx.save(); ctx.fillStyle = 'rgba(22,34,36,0.9)'; ctx.fillRect(o.x - 6, o.y - 1, o.w + 12, o.h + 2); ctx.strokeStyle = s ? rgba(ACC, 1) : rgba(HIGH, 0.85); ctx.lineWidth = s ? 2.4 : 1.2; ctx.strokeRect(o.x - 4, o.y + 1, o.w + 8, o.h - 2);
        var tx = o.x - 18, ty = o.cy, r = 6 + Math.min(o.k, 5); ctx.fillStyle = rgba(HIGH, 1); ctx.strokeStyle = rgba(LINE, 1); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(tx, ty - r); ctx.lineTo(tx + r * 0.9, ty + r * 0.7); ctx.lineTo(tx - r * 0.9, ty + r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = rgba(ACC, 1); ctx.beginPath(); ctx.arc(tx, ty + 1, 1.6, 0, TAU); ctx.fill(); ctx.restore();
      });
    },
    after: function () { }
  };
  T.register('topo', EN ? '⛰️ Topography' : '⛰️ Topografía', topo);
})();
