/* view-artkit.js — utilidades comunes de las vistas artísticas (constelación, textil, acuarela, arquitectura, topografía, radiografía). */
(function () {
  'use strict';
  var T = window.__gkV3, SH = window.__gkShapes; if (!T || !SH || !SH.roleOf) return;
  var hash = T.hash;
  function roles(F) {
    var nk = new Map(); F.links.forEach(function (L) { nk.set(L.a.id, (nk.get(L.a.id) || 0) + 1); });
    F.list.forEach(function (o) { if (!o.role) o.role = SH.roleOf(o, o.nk != null ? o.nk : (nk.get(o.id) || 0)); o.k = nk.get(o.id) || 0; });
  }
  function selected() { try { return new Set((window.network && network.getSelectedNodes ? network.getSelectedNodes() : []).map(String)); } catch (e) { return new Set(); } }
  // punto del borde de la caja del nodo (con holgura) en la dirección (dx,dy)
  function anchor(o, dx, dy, pad) { pad = pad == null ? 6 : pad; var hx = o.w / 2 + pad, hy = o.h / 2 + pad * 0.8, s = Math.min(dx ? hx / Math.abs(dx) : 1e9, dy ? hy / Math.abs(dy) : 1e9); return [o.cx + dx * s, o.cy + dy * s]; }
  // ruido de valor suave 2D, determinista
  function noise(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var h = function (a, b) { return hash(seed + ':' + a + ',' + b); };
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
  }
  function screen(ctx, V, pr, fn) { ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0); fn(); ctx.restore(); }
  function seedOf(F) { var r = F.list.filter(function (o) { return o.lv === 0; })[0]; return (r ? r.label : 'x') + ':' + F.list.length; }
  function grainPattern(cache, rgb, n) {
    if (cache.p) return cache.p; var c = document.createElement('canvas'); c.width = c.height = 160; var g = c.getContext('2d');
    for (var i = 0; i < (n || 900); i++) { g.fillStyle = 'rgba(' + (hash('g' + i) < 0.5 ? '0,0,0' : rgb || '255,255,255') + ',' + (0.03 + hash('ga' + i) * 0.07) + ')'; g.fillRect(hash('gx' + i) * 160, hash('gy' + i) * 160, 1 + hash('gs' + i) * 1.5, 1 + hash('gt' + i) * 1.5); }
    return c;
  }
  window.__gkKit = { roles: roles, selected: selected, anchor: anchor, noise: noise, screen: screen, seedOf: seedOf, grain: grainPattern };
})();
