/* view-textile.js — vista «Textil»: el esquema como un tejido de taller.
 * Fondo de urdimbre y trama; cada concepto es un parche con su propio punto (cruz, sarga, espiga, bouclé, raso), con orillos deshilachados
 * y una etiqueta tejida donde va el texto; las relaciones son hilos gruesos cosidos con puntada que pasan por encima y por debajo.
 * Paleta de cinco hilos. Solo dibuja detrás del texto. Necesita /view3d.js, /view-shapes.js y /view-artkit.js. */
(function () {
  'use strict';
  var T = window.__gkV3, K = window.__gkKit; if (!T || !T.register || !K) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en'), rgba = T.rgba, hash = T.hash, mix = T.mix, lighten = T.lighten, darken = T.darken, TAU = Math.PI * 2;
  var THREAD = { indigo: [38, 58, 104], madder: [150, 52, 56], saffron: [196, 142, 38], moss: [70, 100, 70], ecru: [214, 202, 176], coal: [38, 36, 40] };
  var ROLE = { root: 'coal', category: 'indigo', process: 'madder', example: 'saffron', question: 'madder', benefit: 'moss', risk: 'coal', date: 'indigo', list: 'moss', formula: 'saffron', definition: 'indigo', concept: 'coal', bubble: 'coal' };
  var STITCH = ['cross', 'twill', 'herring', 'boucle', 'satin', 'dots'];
  var cache = {};
  function ground(ctx, V, pr) {
    K.screen(ctx, V, pr, function () {
      ctx.fillStyle = rgba(THREAD.ecru, 1); ctx.fillRect(0, 0, V.W, V.H);
      var s = 5; for (var y = 0; y < V.H; y += s) for (var x = 0; x < V.W; x += s) { var over = ((x / s) + (y / s)) % 2 === 0; ctx.fillStyle = over ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)'; if (over) ctx.fillRect(x, y + 1, s, s - 2); else ctx.fillRect(x + 1, y, s - 2, s); }
    });
  }
  function patch(ctx, o, sel) {
    var id = o.id, col = THREAD[ROLE[o.role] || 'coal'], alt = THREAD[['ecru', 'saffron', 'madder', 'moss'][Math.floor(hash(id + 'alt') * 4)]], st = STITCH[Math.floor(hash(id + 'st') * STITCH.length)];
    var w = 1 + Math.min(o.k, 5) * 0.2, l = o.x - 8 - hash(id + 'l') * 10 * w, r = o.x + o.w + 8 + hash(id + 'r') * 10 * w, t = o.y - 7 - hash(id + 't') * 8 * w, b = o.y + o.h + 7 + hash(id + 'b') * 8 * w;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowOffsetY = 2; ctx.shadowBlur = 4; ctx.fillStyle = rgba(darken(col, 0.15), 1); ctx.fillRect(l, t, r - l, b - t); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(l, t, r - l, b - t); ctx.clip(); ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(mix(col, alt, 0.5), 0.6); ctx.lineWidth = 1.6; ctx.fillStyle = ctx.strokeStyle;
    var x, y;
    if (st === 'cross') { for (y = t + 4; y < b; y += 8) for (x = l + 4; x < r; x += 8) { ctx.beginPath(); ctx.moveTo(x - 2.5, y - 2.5); ctx.lineTo(x + 2.5, y + 2.5); ctx.moveTo(x + 2.5, y - 2.5); ctx.lineTo(x - 2.5, y + 2.5); ctx.stroke(); } }
    else if (st === 'twill') { ctx.lineWidth = 2.4; for (x = l - (b - t); x < r; x += 7) { ctx.beginPath(); ctx.moveTo(x, b); ctx.lineTo(x + (b - t), t); ctx.stroke(); } }
    else if (st === 'herring') { ctx.lineWidth = 1.8; for (y = t; y < b; y += 7) for (x = l; x < r; x += 10) { var up = ((x - l) / 10 + (y - t) / 7) % 2 < 1; ctx.beginPath(); ctx.moveTo(x, y + (up ? 6 : 0)); ctx.lineTo(x + 9, y + (up ? 0 : 6)); ctx.stroke(); } }
    else if (st === 'boucle') { for (y = t + 3; y < b; y += 6) for (x = l + 3; x < r; x += 6) { ctx.beginPath(); ctx.arc(x + hash(id + x + y) * 2, y, 2 + hash(id + y + x) * 1.2, 0, TAU * 0.8); ctx.stroke(); } }
    else if (st === 'satin') { ctx.lineWidth = 3; for (x = l + 2; x < r; x += 4.5) { ctx.strokeStyle = rgba(lighten(col, 0.12 + (hash(id + x) * 0.2)), 0.55); ctx.beginPath(); ctx.moveTo(x, t); ctx.lineTo(x, b); ctx.stroke(); } }
    else { for (y = t + 4; y < b; y += 7) for (x = l + 4 + ((y - t) / 7 % 2 ? 3.5 : 0); x < r; x += 7) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill(); } }
    ctx.restore();
    // etiqueta tejida bajo el texto
    ctx.fillStyle = rgba(darken(col, 0.55), 0.94); ctx.fillRect(o.x - 3, o.y + 1, o.w + 6, o.h - 2); ctx.strokeStyle = rgba(THREAD.ecru, 0.7); ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(o.x - 1, o.y + 3, o.w + 2, o.h - 6); ctx.setLineDash([]);
    // orillo deshilachado
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1;
    for (var k = 0; k < 14; k++) { var side = Math.floor(hash(id + 'fs' + k) * 4), u = hash(id + 'fu' + k), len = 4 + hash(id + 'fl' + k) * 8, px, py, dx = 0, dy = 0; if (side === 0) { px = l + u * (r - l); py = t; dy = -len; } else if (side === 1) { px = l + u * (r - l); py = b; dy = len; } else if (side === 2) { px = l; py = t + u * (b - t); dx = -len; } else { px = r; py = t + u * (b - t); dx = len; } ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + dx * 0.5 + dy * 0.2, py + dy * 0.5 + dx * 0.2, px + dx, py + dy); ctx.stroke(); }
    if (sel) { ctx.strokeStyle = rgba(THREAD.saffron, 1); ctx.lineWidth = 3; ctx.strokeRect(l - 2, t - 2, r - l + 4, b - t + 4); }
  }
  function yarn(ctx, L) {
    var a = L.a, b = L.b, dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy); if (len < 2) return;
    var p0 = K.anchor(a, dx, dy, 6), p1 = K.anchor(b, -dx, -dy, 6), col = THREAD[ROLE[a.role] || 'coal'], nx = -dy / len, ny = dx / len, n = Math.max(2, Math.round(len / 26)), w = 3.5 + Math.min(b.k, 4) * 0.8, i;
    ctx.save(); ctx.lineCap = 'round';
    // hilo grueso con sombra
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(p0[0] + 1, p0[1] + 2); ctx.lineTo(p1[0] + 1, p1[1] + 2); ctx.stroke();
    ctx.strokeStyle = rgba(lighten(col, 0.1), 1); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    // torsión del hilo
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; for (i = 0; i < len; i += 5) { var u = i / len, qx = p0[0] + (p1[0] - p0[0]) * u, qy = p0[1] + (p1[1] - p0[1]) * u; ctx.beginPath(); ctx.moveTo(qx - nx * w * 0.5, qy - ny * w * 0.5 - 1); ctx.lineTo(qx + nx * w * 0.5 + dx / len * 3, qy + ny * w * 0.5 + dy / len * 3); ctx.stroke(); }
    // puntadas de sutura (hilo crema) cruzando el hilo grueso
    ctx.strokeStyle = rgba(THREAD.ecru, 0.9); ctx.lineWidth = 1.6; for (i = 1; i < n; i++) { var v = i / n, sx = p0[0] + (p1[0] - p0[0]) * v, sy = p0[1] + (p1[1] - p0[1]) * v; ctx.beginPath(); ctx.moveTo(sx - nx * (w * 0.8), sy - ny * (w * 0.8)); ctx.lineTo(sx + nx * (w * 0.8), sy + ny * (w * 0.8)); ctx.stroke(); }
    // nudo y cabo suelto en el extremo del hijo
    ctx.fillStyle = rgba(lighten(col, 0.2), 1); ctx.beginPath(); ctx.arc(p1[0], p1[1], w * 0.8, 0, TAU); ctx.fill(); ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.bezierCurveTo(p1[0] + 10 * ny, p1[1] - 10 * nx, p1[0] + 14, p1[1] + 14, p1[0] + 4, p1[1] + 22); ctx.stroke();
    ctx.restore();
  }
  var textile = {
    transparent: true, edges: false, static: true, margin: { top: 18, bottom: 18, left: 32, right: 32 },
    before: function (ctx, F, V, pr) {
      K.roles(F); ground(ctx, V, pr); var sel = K.selected();
      F.links.forEach(function (L) { yarn(ctx, L); });
      F.list.slice().sort(function (a, b) { return a.lv - b.lv; }).forEach(function (o) { patch(ctx, o, sel.has(o.id)); });
    },
    after: function () { }
  };
  T.register('textile', EN ? '🧵 Textile' : '🧵 Textil', textile);
})();
