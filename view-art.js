/* view-art.js — vista «Collage»: el esquema como composición abstracta de papel recortado.
 * Cada concepto es una masa plana de color (forma cortada a tijera, nunca la misma); su tamaño sale del peso de sus conexiones y su color
 * de su función (paleta de solo seis tintas); las relaciones no son líneas sino tiras de papel que muerden de padre a hijo.
 * Todo se deriva del contenido del mapa: dos mapas distintos dan dos obras distintas. Solo dibuja detrás del texto. */
(function () {
  'use strict';
  var T = window.__gkV3, SH = window.__gkShapes; if (!T || !T.register || !SH || !SH.roleOf) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en');
  var rgba = T.rgba, mix = T.mix, lighten = T.lighten, darken = T.darken, hash = T.hash, TAU = Math.PI * 2;
  var PAPER = [221, 212, 192];
  // seis tintas, todas lo bastante oscuras para que el texto claro se lea encima
  var INK = { char: [34, 31, 40], blue: [34, 52, 118], oxblood: [112, 30, 38], ochre: [138, 100, 24], forest: [22, 70, 58], verm: [176, 52, 32] };
  var ROLE_INK = { root: 'char', category: 'blue', process: 'verm', example: 'ochre', question: 'oxblood', benefit: 'forest', risk: 'verm', date: 'blue', list: 'forest', formula: 'ochre', definition: 'oxblood', concept: 'char', bubble: 'char' };
  var grain = null;
  function grainPattern(ctx) {
    if (grain) return grain;
    var c = document.createElement('canvas'); c.width = c.height = 160; var g = c.getContext('2d'), i;
    for (i = 0; i < 900; i++) { g.fillStyle = 'rgba(' + (hash('g' + i) < 0.5 ? '0,0,0' : '255,255,255') + ',' + (0.04 + hash('ga' + i) * 0.08) + ')'; g.fillRect(hash('gx' + i) * 160, hash('gy' + i) * 160, 1 + hash('gs' + i) * 1.6, 1 + hash('gt' + i) * 1.6); }
    return (grain = ctx.createPattern(c, 'repeat'));
  }
  function roles(F) {
    var nk = new Map(); F.links.forEach(function (L) { nk.set(L.a.id, (nk.get(L.a.id) || 0) + 1); });
    F.list.forEach(function (o) { if (!o.role) o.role = SH.roleOf(o, o.nk != null ? o.nk : (nk.get(o.id) || 0)); o.k = nk.get(o.id) || 0; });
  }
  var inkOf = function (o) { var v = INK[ROLE_INK[o.role] || 'char']; return mix(v, [o.c && o.c.bg ? o.c.bg[0] : v[0], o.c && o.c.bg ? o.c.bg[1] : v[1], o.c && o.c.bg ? o.c.bg[2] : v[2]], 0.12); };
  // contorno cortado a tijera alrededor de la caja del nodo
  function mass(o) {
    var id = o.id, w = 1 + Math.min(o.k, 6) * 0.45 + (o.lv === 0 ? 1.2 : 0), j = function (k, a) { return (hash(id + k) - 0.5) * a; };
    var l = o.x - 8 - hash(id + 'l') * 14 * w, r = o.x + o.w + 8 + hash(id + 'r') * 14 * w, t = o.y - 6 - hash(id + 't') * 12 * w, b = o.y + o.h + 6 + hash(id + 'b') * 12 * w;
    var P = [], cut = function (k) { return 6 + hash(id + 'c' + k) * 26 * Math.min(w, 2.2); };
    var corners = [[l, t, 1, 1], [r, t, -1, 1], [r, b, -1, -1], [l, b, 1, -1]];
    corners.forEach(function (c, k) {
      var kind = Math.floor(hash(id + 'k' + k) * 3);   // 0 recto, 1 chaflán, 2 punta desplazada
      if (kind === 1) { var d = cut(k); P.push([c[0] + c[2] * d, c[1]], [c[0], c[1] + c[3] * d]); if (k === 0 || k === 2) P.reverse(), P.reverse(); }
      else if (kind === 2) P.push([c[0] + j('x' + k, 18), c[1] + j('y' + k, 14)]);
      else P.push([c[0], c[1]]);
    });
    // los chaflanes de las esquinas 1 y 3 salen en orden inverso: reordenamos por ángulo para tener un polígono simple
    var cx = (l + r) / 2, cy = (t + b) / 2; P.sort(function (p, q) { return Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx); });
    return P;
  }
  function poly(ctx, P) { ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (var i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); }
  function anchor(o, dx, dy) { var hx = o.w / 2 + 6, hy = o.h / 2 + 5, s = Math.min(dx ? hx / Math.abs(dx) : 1e9, dy ? hy / Math.abs(dy) : 1e9); return [o.cx + dx * s, o.cy + dy * s]; }
  function selected() { try { return new Set((window.network && network.getSelectedNodes ? network.getSelectedNodes() : []).map(String)); } catch (e) { return new Set(); } }

  var art = {
    transparent: true, edges: false, static: true, margin: { top: 18, bottom: 18, left: 30, right: 30 },
    before: function (ctx, F, V, pr) {
      roles(F);
      ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0); ctx.fillStyle = rgba(PAPER, 1); ctx.fillRect(0, 0, V.W, V.H);
      // tres formas grandes que dependen del contenido: dan la "firma" de esta obra
      var root = F.list.filter(function (o) { return o.lv === 0; })[0], seed = (root ? root.label : 'x') + F.list.length;
      var big = [['circle', 'oxblood'], ['arc', 'blue'], ['bar', 'ochre']];
      big.forEach(function (bg, i) {
        var cx = (0.1 + hash(seed + 'x' + i) * 0.8) * V.W, cy = (0.1 + hash(seed + 'y' + i) * 0.8) * V.H, R = Math.min(V.W, V.H) * (0.22 + hash(seed + 'r' + i) * 0.22);
        ctx.fillStyle = rgba(INK[bg[1]], 0.16); ctx.beginPath();
        if (bg[0] === 'circle') ctx.arc(cx, cy, R, 0, TAU); else if (bg[0] === 'arc') ctx.arc(cx, cy, R * 1.2, hash(seed + 'a') * TAU, hash(seed + 'a') * TAU + Math.PI); else { ctx.save(); ctx.translate(cx, cy); ctx.rotate((hash(seed + 'q') - 0.5) * 0.9); ctx.rect(-R * 1.6, -R * 0.12, R * 3.2, R * 0.24); ctx.restore(); }
        ctx.fill();
      });
      ctx.restore();
      var sel = selected(), order = F.list.slice().sort(function (a, b) { return (a.lv - b.lv) || (b.k - a.k); }), sc = V.sc || 1;
      // tiras de papel (las relaciones)
      F.links.forEach(function (L) {
        var a = L.a, b = L.b, dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy); if (len < 2) return;
        var p0 = anchor(a, dx, dy), p1 = anchor(b, -dx, -dy), nx = -dy / len, ny = dx / len, w = 4 + Math.min(b.k, 5) * 2.4 + (a.lv === 0 ? 4 : 0), w1 = w * (0.4 + hash(L.key + "w") * 0.5), ink = inkOf(a);
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
        ctx.beginPath(); ctx.moveTo(p0[0] + nx * w / 2, p0[1] + ny * w / 2); ctx.lineTo(p1[0] + nx * w1 / 2, p1[1] + ny * w1 / 2); ctx.lineTo(p1[0] - nx * w1 / 2, p1[1] - ny * w1 / 2); ctx.lineTo(p0[0] - nx * w / 2, p0[1] - ny * w / 2); ctx.closePath();
        ctx.fillStyle = rgba(ink, 0.96); ctx.fill(); ctx.restore();
      });
      // masas
      order.forEach(function (o) {
        var P = mass(o), ink = inkOf(o), id = o.id;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.32)'; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3; ctx.shadowBlur = 0;
        poly(ctx, P); ctx.fillStyle = rgba(ink, 1); ctx.fill(); ctx.restore();
        ctx.save(); poly(ctx, P); ctx.clip();
        // recorte superpuesto de otra tinta, desplazado hacia un borde
        if (hash(id + 'sc') < 0.6) {
          var kinds = Object.keys(INK), alt = INK[kinds[Math.floor(hash(id + 'al') * kinds.length)]], bx = o.x + o.w * (hash(id + 'sx') < 0.5 ? -0.1 : 0.55), bw = o.w * (0.35 + hash(id + 'sw') * 0.3);
          ctx.fillStyle = rgba(mix(ink, alt, 0.55), 1); ctx.fillRect(bx, o.y - 30, bw, o.h + 60);
        }
        // textura: rayas cortas o puntos de trama
        ctx.globalAlpha = 0.16; ctx.strokeStyle = rgba(PAPER, 1); ctx.fillStyle = rgba(PAPER, 1); var kind = Math.floor(hash(id + 'tx') * 3);
        if (kind === 0) { ctx.lineWidth = 1; for (var s = -o.h; s < o.w + o.h; s += 9) { ctx.beginPath(); ctx.moveTo(o.x + s, o.y + o.h + 10); ctx.lineTo(o.x + s + o.h + 10, o.y - 10); ctx.stroke(); } }
        else if (kind === 1) { for (var yy = o.y - 6; yy < o.y + o.h + 8; yy += 8) for (var xx = o.x - 6; xx < o.x + o.w + 8; xx += 8) { ctx.beginPath(); ctx.arc(xx + ((yy / 8) % 2 ? 4 : 0), yy, 1.3, 0, TAU); ctx.fill(); } }
        ctx.restore();
        if (sel.has(id)) { ctx.save(); poly(ctx, P); ctx.lineWidth = 3; ctx.strokeStyle = rgba(PAPER, 1); ctx.stroke(); ctx.restore(); }
      });
      // grano de papel por encima de todo
      ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0); ctx.fillStyle = grainPattern(ctx); ctx.fillRect(0, 0, V.W, V.H); ctx.restore();
    },
    after: function () { }
  };
  T.register('art', EN ? '🎨 Collage' : '🎨 Collage', art);
  window.__gkArt = { inks: Object.keys(INK) };
})();
