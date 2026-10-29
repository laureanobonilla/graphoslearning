/* view-handdrawn.js — vista «Dibujado a mano»: el esquema como una hoja garabateada con rotulador y tinta.
 * Papel con grano; cada concepto es un rectángulo de trazo tembloroso (dos pasadas de tinta) relleno con rotulador que se sale un poco
 * del contorno y con rayado diagonal; un garabato en la esquina según su función (estrella, visto, interrogante…); las relaciones son
 * trazos a pulso con flecha. Todo el temblor es determinista (no cambia al mover o hacer zoom). Solo dibuja detrás del texto.
 * Necesita /view3d.js, /view-shapes.js y /view-artkit.js. */
(function () {
  'use strict';
  var T = window.__gkV3, K = window.__gkKit; if (!T || !T.register || !K) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en'), rgba = T.rgba, hash = T.hash, lighten = T.lighten, TAU = Math.PI * 2;
  var PAPER = [248, 243, 229], INK = [28, 26, 42];
  // rotuladores: todos lo bastante oscuros para que el texto claro se lea encima
  var MARK = { root: [38, 40, 76], category: [30, 72, 126], process: [156, 58, 48], example: [150, 108, 26], question: [96, 62, 138], benefit: [28, 102, 70], risk: [126, 28, 30], date: [36, 92, 112], list: [64, 94, 58], formula: [40, 60, 104], definition: [96, 62, 50], concept: [62, 66, 78], bubble: [62, 66, 78] };
  window.__gkHandMark = MARK;
  function jit(id, k, a) { return (hash(id + ':' + k) - 0.5) * 2 * a; }
  // trazo a pulso entre dos puntos: curva suave con desvío lateral
  function stroke(ctx, x0, y0, x1, y1, id, amp, over) {
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len, o = over || 0;
    var sx = x0 - dx / len * o * hash(id + 'o0'), sy = y0 - dy / len * o * hash(id + 'o0'), ex = x1 + dx / len * o * hash(id + 'o1'), ey = y1 + dy / len * o * hash(id + 'o1');
    var m1 = 0.33, m2 = 0.67, a1 = jit(id, 'a', amp), a2 = jit(id, 'b', amp);
    ctx.moveTo(sx, sy); ctx.bezierCurveTo(sx + (ex - sx) * m1 + nx * a1, sy + (ey - sy) * m1 + ny * a1, sx + (ex - sx) * m2 + nx * a2, sy + (ey - sy) * m2 + ny * a2, ex, ey);
  }
  // contorno tembloroso de una caja (esquinas ligeramente redondeadas, no cierra exacto)
  function roughBox(ctx, x, y, w, h, id, amp) {
    var P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], r = Math.min(7, h / 3);
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var a = P[i], b = P[(i + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy), ux = dx / len, uy = dy / len;
      var s = [a[0] + ux * r + jit(id, 's' + i, amp), a[1] + uy * r + jit(id, 't' + i, amp)], e = [b[0] - ux * r + jit(id, 'e' + i, amp), b[1] - uy * r + jit(id, 'f' + i, amp)];
      if (i === 0) ctx.moveTo(s[0], s[1]); else ctx.quadraticCurveTo(a[0] + jit(id, 'c' + i, amp), a[1] + jit(id, 'd' + i, amp), s[0], s[1]);
      var mx = (s[0] + e[0]) / 2 + (-uy) * jit(id, 'm' + i, amp * 1.3), my = (s[1] + e[1]) / 2 + ux * jit(id, 'n' + i, amp * 1.3);
      ctx.quadraticCurveTo(mx, my, e[0], e[1]);
    }
    ctx.quadraticCurveTo(P[0][0] + jit(id, 'z', amp), P[0][1] + jit(id, 'zz', amp), P[0][0] + (P[1][0] - P[0][0] > 0 ? r : 0) + jit(id, 'q', amp), P[0][1] + jit(id, 'qq', amp));
  }
  function paper(ctx, V, pr) {
    K.screen(ctx, V, pr, function () {
      ctx.fillStyle = rgba(PAPER, 1); ctx.fillRect(0, 0, V.W, V.H);
      var g = ctx.createRadialGradient(V.W / 2, V.H / 2, Math.min(V.W, V.H) * 0.3, V.W / 2, V.H / 2, Math.max(V.W, V.H) * 0.75); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(120,90,40,0.16)'); ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
      for (var i = 0; i < 380; i++) { ctx.fillStyle = 'rgba(' + (hash('pg' + i) < 0.5 ? '90,70,40' : '255,255,255') + ',' + (0.04 + hash('pa' + i) * 0.07) + ')'; ctx.fillRect(hash('px' + i) * V.W, hash('py' + i) * V.H, 1 + hash('ps' + i) * 1.6, 1); }
    });
  }
  // garabatos de esquina, dibujados con el origen en su centro y tamaño s
  var DOODLE = {
    root: function (c, s) { c.moveTo(-s, s * 0.5); c.lineTo(-s * 0.7, -s * 0.5); c.lineTo(-s * 0.25, s * 0.1); c.lineTo(0, -s * 0.7); c.lineTo(s * 0.25, s * 0.1); c.lineTo(s * 0.7, -s * 0.5); c.lineTo(s, s * 0.5); c.closePath(); },
    category: function (c, s) { c.moveTo(-s, s * 0.6); c.quadraticCurveTo(0, s * 0.2, s, s * 0.7); c.moveTo(-s * 0.8, s * 0.1); c.lineTo(s * 0.8, s * 0.1); },
    process: function (c, s) { c.moveTo(-s, 0); c.lineTo(s, 0); c.moveTo(s * 0.35, -s * 0.55); c.lineTo(s, 0); c.lineTo(s * 0.35, s * 0.55); },
    example: function (c, s) { for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.42 : s; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); },
    question: function (c, s) { c.moveTo(-s * 0.6, -s * 0.4); c.bezierCurveTo(-s * 0.6, -s * 1.1, s * 0.7, -s * 1.1, s * 0.6, -s * 0.3); c.bezierCurveTo(s * 0.55, s * 0.1, 0, s * 0.1, 0, s * 0.5); c.moveTo(0, s * 0.85); c.lineTo(0, s * 0.95); },
    benefit: function (c, s) { c.moveTo(-s, 0); c.lineTo(-s * 0.3, s * 0.7); c.lineTo(s, -s * 0.7); },
    risk: function (c, s) { c.moveTo(0, -s); c.lineTo(s, s * 0.8); c.lineTo(-s, s * 0.8); c.closePath(); c.moveTo(0, -s * 0.3); c.lineTo(0, s * 0.3); c.moveTo(0, s * 0.55); c.lineTo(0, s * 0.62); },
    date: function (c, s) { c.rect(-s, -s * 0.7, s * 2, s * 1.6); c.moveTo(-s, -s * 0.2); c.lineTo(s, -s * 0.2); c.moveTo(-s * 0.5, -s); c.lineTo(-s * 0.5, -s * 0.5); c.moveTo(s * 0.5, -s); c.lineTo(s * 0.5, -s * 0.5); },
    list: function (c, s) { for (var i = -1; i <= 1; i++) { c.moveTo(-s, i * s * 0.6); c.lineTo(-s * 0.8, i * s * 0.6); c.moveTo(-s * 0.4, i * s * 0.6); c.lineTo(s, i * s * 0.6); } },
    formula: function (c, s) { c.moveTo(-s, -s * 0.6); c.lineTo(s, -s * 0.6); c.moveTo(-s, s * 0.6); c.lineTo(s, s * 0.6); c.moveTo(-s * 0.4, -s); c.lineTo(-s * 0.4, s); c.moveTo(s * 0.4, -s); c.lineTo(s * 0.4, s); },
    definition: function (c, s) { c.moveTo(-s, -s * 0.8); c.lineTo(-s, s * 0.8); c.lineTo(s * 0.2, s * 0.6); c.lineTo(s * 0.2, -s); c.closePath(); c.moveTo(s * 0.2, -s); c.lineTo(s, -s * 0.8); c.lineTo(s, s * 0.6); c.lineTo(s * 0.2, s * 0.6); },
    concept: function (c, s) { c.arc(0, 0, s * 0.35, 0, TAU); },
    bubble: function (c, s) { c.arc(0, 0, s * 0.35, 0, TAU); }
  };
  function doodle(ctx, role, cx, cy, s, id) {
    var f = DOODLE[role] || DOODLE.concept; ctx.save(); ctx.translate(cx, cy); ctx.rotate(jit(id, 'rot', 0.18));
    ctx.beginPath(); ctx.arc(0, 0, s * 1.55, 0, TAU); ctx.fillStyle = rgba(PAPER, 1); ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(INK, 0.9); ctx.stroke();
    ctx.beginPath(); f(ctx, s * 0.82); ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(MARK[role] || MARK.concept, 1); ctx.stroke(); ctx.restore();
  }
  window.__gkHandDoodle = doodle;
  function node(ctx, o, sel) {
    var id = o.id, col = MARK[o.role] || MARK.concept, x = o.x - 8, y = o.y - 4, w = o.w + 16, h = o.h + 8, amp = 1.6 + (o.lv === 0 ? 0.6 : 0);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (sel) { roughBox(ctx, x - 5, y - 5, w + 10, h + 10, id + 'sel', 3); ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(255,214,60,0.65)'; ctx.stroke(); }
    // rotulador: relleno un poco corrido respecto al contorno
    roughBox(ctx, x + 2, y + 1.5, w, h, id + 'f', 1.2); ctx.fillStyle = rgba(col, 0.97); ctx.fill();
    ctx.save(); roughBox(ctx, x + 2, y + 1.5, w, h, id + 'f', 1.2); ctx.clip(); ctx.strokeStyle = rgba(lighten(col, 0.3), 0.32); ctx.lineWidth = 1.1; ctx.beginPath();
    var step = 6 + hash(id + 'hs') * 2; for (var k = -h; k < w + h; k += step) { ctx.moveTo(x + k + jit(id, 'h' + k, 1), y); ctx.lineTo(x + k - h * 0.7 + jit(id, 'i' + k, 1), y + h); } ctx.stroke(); ctx.restore();
    // tinta: dos pasadas
    roughBox(ctx, x, y, w, h, id + 'a', amp); ctx.lineWidth = o.lv === 0 ? 2.6 : 1.9; ctx.strokeStyle = rgba(INK, 0.95); ctx.stroke();
    roughBox(ctx, x + 0.8, y + 0.6, w - 1.2, h - 0.6, id + 'b', amp); ctx.lineWidth = 1; ctx.strokeStyle = rgba(INK, 0.55); ctx.stroke();
    if (o.role === 'root') { roughBox(ctx, x - 5, y - 4, w + 10, h + 8, id + 'r', 2); ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(INK, 0.8); ctx.stroke(); }
    if (o.role === 'category') { ctx.beginPath(); stroke(ctx, x + 6, y + h + 5, x + w - 6, y + h + 5, id + 'u', 2.5, 4); ctx.lineWidth = 2; ctx.strokeStyle = rgba(col, 0.95); ctx.stroke(); }
    if (o.role !== 'concept' && o.role !== 'bubble' && o.w > 40) doodle(ctx, o.role, x + w - 3, y - 1, 6.5, id);
    ctx.restore();
  }
  function relation(ctx, L, F) {
    var a = L.a, b = L.b, dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len, id = L.key;
    var p0 = K.anchor(a, ux, uy, 7), p1 = K.anchor(b, -ux, -uy, 8), col = MARK[b.role] || MARK.concept, dash = b.role === 'question' || b.role === 'date';
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; if (dash) ctx.setLineDash([7, 5]);
    ctx.beginPath(); stroke(ctx, p0[0], p0[1], p1[0], p1[1], id + 'l', Math.min(10, len * 0.05), 3); ctx.lineWidth = 2.1; ctx.strokeStyle = rgba(INK, 0.9); ctx.stroke();
    ctx.setLineDash([]); ctx.beginPath(); stroke(ctx, p0[0] + 1.5, p0[1] + 1, p1[0] + 1.5, p1[1] + 1, id + 'm', Math.min(10, len * 0.05), 2); ctx.lineWidth = 3.4; ctx.strokeStyle = rgba(col, 0.28); ctx.stroke();
    // punta de flecha a pulso
    var hx = p1[0], hy = p1[1], s = 11, ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), a1 = ang + Math.PI - 0.45 + jit(id, 'h1', 0.12), a2 = ang + Math.PI + 0.45 + jit(id, 'h2', 0.12);
    ctx.beginPath(); ctx.moveTo(hx + Math.cos(a1) * s, hy + Math.sin(a1) * s); ctx.lineTo(hx, hy); ctx.lineTo(hx + Math.cos(a2) * (s * 0.9), hy + Math.sin(a2) * (s * 0.9)); ctx.lineWidth = 2; ctx.strokeStyle = rgba(INK, 0.95); ctx.stroke();
    ctx.restore();
  }
  var hand = {
    transparent: true, edges: false, static: true, margin: { top: 24, bottom: 24, left: 36, right: 36 },
    before: function (ctx, F, V, pr) {
      K.roles(F); paper(ctx, V, pr); var sel = K.selected();
      F.links.forEach(function (L) { relation(ctx, L, F); });
      F.list.slice().sort(function (a, b) { return a.lv - b.lv; }).forEach(function (o) { node(ctx, o, sel.has(o.id)); });
    },
    after: function () { }
  };
  T.register('handdrawn', EN ? '✏️ Hand-drawn' : '✏️ Dibujado a mano', hand);
})();
