/* view-constellation.js — vista «Constelación»: una carta astronómica de un cielo que no existe.
 * Nada de brillos: papel de tinta azul noche, retícula de coordenadas curvada, estrellas como marcas precisas (la magnitud sale de las
 * conexiones, la clase de la función), líneas finas con huecos, y cada concepto anotado con corchetes de carta de navegación.
 * Las nebulosas son tramas de puntos. Solo dibuja detrás del texto. Necesita /view3d.js, /view-shapes.js y /view-artkit.js. */
(function () {
  'use strict';
  var T = window.__gkV3, K = window.__gkKit; if (!T || !T.register || !K) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en'), rgba = T.rgba, hash = T.hash, TAU = Math.PI * 2;
  var INK = [226, 222, 205], DIM = [150, 160, 190], ACC = [235, 120, 80];
  function star(ctx, x, y, r, cls, id) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = rgba(INK, 0.95); ctx.fillStyle = rgba(INK, 0.95); ctx.lineWidth = 1.1;
    if (cls === 'ring') { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, TAU); ctx.fill(); }
    else if (cls === 'cross') { ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.fill(); }
    else if (cls === 'double') { ctx.beginPath(); ctx.arc(-r * 0.45, 0, r * 0.7, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(r * 0.75, r * 0.25, r * 0.4, 0, TAU); ctx.stroke(); }
    else if (cls === 'diamond') { ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(r * 0.85, 0); ctx.lineTo(0, r * 1.25); ctx.lineTo(-r * 0.85, 0); ctx.closePath(); ctx.fill(); }
    else if (cls === 'tick') { ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, r * 1.05, Math.PI * 0.15, Math.PI * 1.1); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, TAU); ctx.fill(); }
    if (r > 9) { ctx.lineWidth = 0.8; var s = r * 2.4; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-r * 1.1, 0); ctx.moveTo(r * 1.1, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, -r * 1.1); ctx.moveTo(0, r * 1.1); ctx.lineTo(0, s); ctx.stroke(); }
    ctx.restore();
  }
  var CLASS = { root: 'ring', category: 'cross', process: 'diamond', example: 'dot', question: 'tick', benefit: 'dot', risk: 'double', date: 'tick', list: 'cross', formula: 'diamond', definition: 'ring', concept: 'dot', bubble: 'dot' };
  var con = {
    transparent: true, edges: false, static: true, margin: { top: 16, bottom: 16, left: 30, right: 30 },
    before: function (ctx, F, V, pr) {
      K.roles(F); var seed = K.seedOf(F), sel = K.selected();
      K.screen(ctx, V, pr, function () {
        var g = ctx.createLinearGradient(0, 0, 0, V.H); g.addColorStop(0, '#0b1230'); g.addColorStop(1, '#101a3a'); ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
        // retícula: meridianos y paralelos curvados por un polo ficticio
        ctx.strokeStyle = rgba(DIM, 0.16); ctx.lineWidth = 1; var px = V.W * (0.2 + hash(seed + 'px') * 0.6), py = V.H * (-0.4 - hash(seed + 'py') * 0.5), i;
        for (i = 1; i < 14; i++) { ctx.beginPath(); ctx.arc(px, py, i * Math.max(V.W, V.H) * 0.12, 0, TAU); ctx.stroke(); }
        for (i = 0; i < 24; i++) { var a = i / 24 * Math.PI; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * 3000, py + Math.sin(a) * 3000); ctx.stroke(); }
        // nebulosas por trama de puntos (dependen del contenido)
        for (i = 0; i < 3; i++) { var nx = hash(seed + 'n' + i) * V.W, ny = hash(seed + 'm' + i) * V.H, nr = 90 + hash(seed + 'r' + i) * 160; ctx.fillStyle = rgba(DIM, 0.35); for (var k = 0; k < 420; k++) { var an = hash(seed + 'a' + i + k) * TAU, rr = Math.pow(hash(seed + 'q' + i + k), 1.7) * nr; ctx.fillRect(nx + Math.cos(an) * rr * 1.5, ny + Math.sin(an) * rr * 0.7, 1.2, 1.2); } }
        // polvo de estrellas menores
        ctx.fillStyle = rgba(INK, 0.55); for (i = 0; i < 160; i++) ctx.fillRect(hash('s' + i) * V.W, hash('t' + i) * V.H, 1, 1);
      });
      // líneas de constelación: finas y con huecos junto a cada estrella
      ctx.save(); ctx.strokeStyle = rgba(INK, 0.6); ctx.lineWidth = 1;
      F.links.forEach(function (L) { var a = L.a, b = L.b, dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy); if (len < 30) return; var p0 = K.anchor(a, dx, dy, 18), p1 = K.anchor(b, -dx, -dy, 18), ux = dx / len, uy = dy / len; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
        var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2; ctx.beginPath(); ctx.moveTo(mx - uy * 3, my + ux * 3); ctx.lineTo(mx + uy * 3, my - ux * 3); ctx.stroke(); });
      ctx.restore();
      F.list.forEach(function (o) {
        var r = 6.5 + Math.min(o.k, 6) * 1.5 + (o.lv === 0 ? 4 : 0), sx = o.x - 14, sy = o.cy;
        // la estrella se ancla a la izquierda del texto, y la caja se anota con dos corchetes
        star(ctx, sx, sy, r, CLASS[o.role] || 'dot', o.id);
        ctx.save(); ctx.strokeStyle = rgba(sel.has(o.id) ? ACC : INK, sel.has(o.id) ? 1 : 0.55); ctx.lineWidth = sel.has(o.id) ? 1.6 : 1; var x0 = o.x - 4, x1 = o.x + o.w + 4, y0 = o.y + 1, y1 = o.y + o.h - 1, c = 6;
        ctx.beginPath(); ctx.moveTo(x0 + c, y0); ctx.lineTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x0 + c, y1); ctx.moveTo(x1 - c, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 - c, y1); ctx.stroke(); ctx.restore();
      });
    },
    after: function () { }
  };
  T.register('constellation', EN ? '✦ Constellation' : '✦ Constelación', con);
})();
