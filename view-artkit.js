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
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en');
  var ROLE = { es: { root: 'tema central', category: 'categoría', process: 'proceso', example: 'ejemplo', question: 'pregunta', benefit: 'beneficio', risk: 'riesgo', date: 'dato (fecha o cifra)', list: 'lista', formula: 'fórmula', definition: 'definición', concept: 'concepto' }, en: { root: 'central topic', category: 'category', process: 'process', example: 'example', question: 'question', benefit: 'benefit', risk: 'risk', date: 'data (date or figure)', list: 'list', formula: 'formula', definition: 'definition', concept: 'concept' } };
  function rrp(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // Leyenda al pie (tamaño constante en pantalla). cfg = { title, light, rows: [{ role | null, name: [es, en], swatch(ctx, x, y, w, h) }], note: [es, en] }.
  // Solo se muestran las filas cuyo rol aparece en este mapa (las de rol null se muestran siempre).
  function legend(ctx, F, V, cfg) {
    var present = {}; F.list.forEach(function (o) { present[o.role === 'bubble' ? 'concept' : o.role] = 1; });
    var rows = cfg.rows.filter(function (r) { return !r.role || present[r.role]; }); if (!rows.length) return;
    var li = EN ? 1 : 0, cols = rows.length > 6 ? 2 : 1, per = Math.ceil(rows.length / cols), cw = cfg.cw || 250, rh = 22, hd = cfg.title ? 22 : 0, pw = 16 + cols * cw, ph = hd + 12 + per * rh + (cfg.note ? 16 : 0), sc = V.sc || 1, light = !!cfg.light;
    ctx.save(); ctx.translate(V.x0 + 14 / sc, V.y1 - (ph + 14) / sc); ctx.scale(1 / sc, 1 / sc); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    rrp(ctx, 0, 0, pw, ph, 10); ctx.fillStyle = light ? 'rgba(255,252,244,0.92)' : 'rgba(8,12,26,0.86)'; ctx.fill(); ctx.strokeStyle = light ? 'rgba(40,40,60,0.35)' : 'rgba(140,156,210,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    var ink = light ? 'rgba(30,32,48,0.95)' : 'rgba(226,232,250,0.95)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (cfg.title) { ctx.font = '700 11.5px system-ui, sans-serif'; ctx.fillStyle = ink; ctx.fillText(cfg.title[li], 12, 13); }
    ctx.font = '500 11.5px system-ui, sans-serif';
    rows.forEach(function (r, i) { var c = Math.floor(i / per), k = i % per, x = 12 + c * cw, y = hd + 8 + k * rh; ctx.save(); r.swatch(ctx, x, y + 2, 28, 14); ctx.restore(); ctx.fillStyle = ink; ctx.fillText(r.name[li] + (r.role ? ' = ' + ROLE[EN ? 'en' : 'es'][r.role] : ''), x + 38, y + 10); });
    if (cfg.note) { ctx.font = 'italic 500 10.5px system-ui, sans-serif'; ctx.fillStyle = light ? 'rgba(60,60,80,0.9)' : 'rgba(170,184,220,0.9)'; ctx.fillText(cfg.note[li], 12, ph - 12); }
    ctx.restore();
  }
  window.__gkKit = { legend: legend, ROLE: ROLE, roles: roles, selected: selected, anchor: anchor, noise: noise, screen: screen, seedOf: seedOf, grain: grainPattern };
})();
