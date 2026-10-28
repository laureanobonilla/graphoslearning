/* view-tools.js — vista «Herramientas»: cada nodo es una placa con una medalla y un OBJETO que dice su función
 * (llave, candado, lupa, engranaje, reloj, balanza, brújula, trofeo, bombilla…). 38 objetos × 8 materiales × 5 placas.
 * Solo cambia el dibujo (detrás del texto); no toca los datos. Necesita /view3d.js y /view-shapes.js. */
(function () {
  'use strict';
  var T = window.__gkV3, SH = window.__gkShapes; if (!T || !T.register || !SH || !SH.roleOf) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en');
  var rr = T.rr, rgba = T.rgba, hex = T.hex, mix = T.mix, lighten = T.lighten, darken = T.darken, hash = T.hash, TAU = Math.PI * 2;

  /* ---------- objetos: se dibujan en una cuadrícula de 24×24 con trazo ---------- */
  var arc = function (c, x, y, r, a0, a1) { c.arc(x, y, r, a0 == null ? 0 : a0, a1 == null ? TAU : a1); };
  var ICON = {
    gear: function (c) { for (var i = 0; i < 8; i++) { var t = i / 8 * TAU; c.moveTo(12 + Math.cos(t) * 6.2, 12 + Math.sin(t) * 6.2); c.lineTo(12 + Math.cos(t) * 9.6, 12 + Math.sin(t) * 9.6); } c.moveTo(18.2, 12); arc(c, 12, 12, 6.2); c.moveTo(15, 12); arc(c, 12, 12, 3); },
    clock: function (c) { arc(c, 12, 12, 9.2); c.moveTo(12, 6.5); c.lineTo(12, 12); c.lineTo(16, 14.5); },
    key: function (c) { c.moveTo(11.5, 12); arc(c, 7, 12, 4.5); c.moveTo(11.5, 12); c.lineTo(21, 12); c.moveTo(17, 12); c.lineTo(17, 15.5); c.moveTo(20.5, 12); c.lineTo(20.5, 14.5); },
    lock: function (c) { c.rect(5, 11, 14, 10); c.moveTo(8, 11); c.lineTo(8, 8); c.arc(12, 8, 4, Math.PI, 0); c.lineTo(16, 11); c.moveTo(12, 15); c.lineTo(12, 17.5); },
    magnifier: function (c) { arc(c, 10, 10, 6.4); c.moveTo(14.8, 14.8); c.lineTo(21, 21); },
    bulb: function (c) { c.moveTo(8.8, 16.5); c.bezierCurveTo(8.8, 14, 5.5, 12.5, 5.5, 9); c.arc(12, 9, 6.5, Math.PI, 0); c.bezierCurveTo(18.5, 12.5, 15.2, 14, 15.2, 16.5); c.closePath(); c.moveTo(9.2, 19.3); c.lineTo(14.8, 19.3); c.moveTo(10.2, 21.8); c.lineTo(13.8, 21.8); },
    scales: function (c) { c.moveTo(12, 3); c.lineTo(12, 20.5); c.moveTo(7.5, 20.5); c.lineTo(16.5, 20.5); c.moveTo(4, 7); c.lineTo(20, 7); c.moveTo(4, 7); c.lineTo(1.8, 13); c.lineTo(6.2, 13); c.closePath(); c.moveTo(20, 7); c.lineTo(17.8, 13); c.lineTo(22.2, 13); c.closePath(); },
    hammer: function (c) { c.moveTo(11, 9); c.lineTo(19.5, 20); c.moveTo(4, 5.5); c.lineTo(13.5, 3.5); c.lineTo(15.5, 8.5); c.lineTo(8.5, 11.5); c.closePath(); },
    wrench: function (c) { c.moveTo(14.5, 3.8); c.bezierCurveTo(10.5, 3.2, 7.8, 6.8, 9, 10); c.lineTo(3.8, 17.6); c.lineTo(6.4, 20.2); c.lineTo(14, 15); c.bezierCurveTo(17.2, 16.2, 21, 13.6, 20.2, 9.5); c.lineTo(17, 12.6); c.lineTo(13.6, 10.4); c.lineTo(14.5, 3.8); },
    scissors: function (c) { c.moveTo(9, 7); arc(c, 6.6, 6.6, 2.4); c.moveTo(9, 17); arc(c, 6.6, 17.4, 2.4); c.moveTo(8.5, 8.4); c.lineTo(20.5, 17.5); c.moveTo(8.5, 15.6); c.lineTo(20.5, 6.5); },
    pencil: function (c) { c.moveTo(4, 20); c.lineTo(5.3, 15.3); c.lineTo(16.5, 4.2); c.lineTo(19.8, 7.5); c.lineTo(8.7, 18.7); c.closePath(); c.moveTo(14.4, 6.3); c.lineTo(17.7, 9.6); },
    book: function (c) { c.moveTo(12, 6.5); c.bezierCurveTo(9, 4.4, 5.5, 4.4, 3, 5.4); c.lineTo(3, 19); c.bezierCurveTo(5.5, 18, 9, 18, 12, 20); c.bezierCurveTo(15, 18, 18.5, 18, 21, 19); c.lineTo(21, 5.4); c.bezierCurveTo(18.5, 4.4, 15, 4.4, 12, 6.5); c.moveTo(12, 6.5); c.lineTo(12, 20); },
    flag: function (c) { c.moveTo(5.5, 21); c.lineTo(5.5, 3.5); c.moveTo(5.5, 4.5); c.lineTo(19.5, 4.5); c.lineTo(16, 8.7); c.lineTo(19.5, 13); c.lineTo(5.5, 13); },
    pin: function (c) { c.moveTo(12, 21.5); c.bezierCurveTo(5.5, 14, 5.5, 11.5, 5.5, 9.5); c.arc(12, 9.5, 6.5, Math.PI, 0); c.bezierCurveTo(18.5, 11.5, 18.5, 14, 12, 21.5); c.moveTo(14.6, 9.5); arc(c, 12, 9.5, 2.6); },
    compass: function (c) { arc(c, 12, 12, 9.4); c.moveTo(16.5, 7.5); c.lineTo(13.4, 13.4); c.lineTo(7.5, 16.5); c.lineTo(10.6, 10.6); c.closePath(); },
    hourglass: function (c) { c.moveTo(6, 3.5); c.lineTo(18, 3.5); c.moveTo(6, 20.5); c.lineTo(18, 20.5); c.moveTo(7, 3.5); c.bezierCurveTo(7, 9, 12, 10, 12, 12); c.bezierCurveTo(12, 14, 7, 15, 7, 20.5); c.moveTo(17, 3.5); c.bezierCurveTo(17, 9, 12, 10, 12, 12); c.bezierCurveTo(12, 14, 17, 15, 17, 20.5); },
    trophy: function (c) { c.moveTo(7, 3.5); c.lineTo(17, 3.5); c.lineTo(17, 9); c.bezierCurveTo(17, 13, 14.5, 14.5, 12, 14.5); c.bezierCurveTo(9.5, 14.5, 7, 13, 7, 9); c.closePath(); c.moveTo(7, 5.5); c.lineTo(3.5, 5.5); c.bezierCurveTo(3.5, 10, 5.5, 10.5, 7.3, 10.5); c.moveTo(17, 5.5); c.lineTo(20.5, 5.5); c.bezierCurveTo(20.5, 10, 18.5, 10.5, 16.7, 10.5); c.moveTo(12, 14.5); c.lineTo(12, 18.5); c.moveTo(8, 20.5); c.lineTo(16, 20.5); c.moveTo(9, 18.5); c.lineTo(15, 18.5); c.lineTo(16, 20.5); c.moveTo(9, 18.5); c.lineTo(8, 20.5); },
    shield: function (c) { c.moveTo(12, 3); c.lineTo(20, 6); c.lineTo(20, 12); c.bezierCurveTo(20, 17, 16, 20, 12, 21.5); c.bezierCurveTo(8, 20, 4, 17, 4, 12); c.lineTo(4, 6); c.closePath(); c.moveTo(8.3, 12); c.lineTo(11, 14.8); c.lineTo(16, 9.2); },
    warning: function (c) { c.moveTo(12, 3.5); c.lineTo(21.5, 20); c.lineTo(2.5, 20); c.closePath(); c.moveTo(12, 9.5); c.lineTo(12, 14.5); c.moveTo(12, 17.2); c.lineTo(12, 17.3); },
    puzzle: function (c) { c.moveTo(4, 8); c.lineTo(9, 8); c.arc(11, 6, 2, Math.PI * 0.5 + 0.0, Math.PI * 2.5, true); c.lineTo(11, 8); c.lineTo(16, 8); c.lineTo(16, 11); c.arc(18, 12.5, 2, -Math.PI * 0.5, Math.PI * 1.5, false); c.lineTo(16, 14); c.lineTo(16, 20); c.lineTo(4, 20); c.closePath(); },
    magnet: function (c) { c.moveTo(5, 4); c.lineTo(5, 12); c.arc(12, 12, 7, Math.PI, 0, true); c.lineTo(19, 4); c.lineTo(15.4, 4); c.lineTo(15.4, 12); c.arc(12, 12, 3.4, 0, Math.PI, false); c.lineTo(8.6, 4); c.closePath(); c.moveTo(5, 7); c.lineTo(8.6, 7); c.moveTo(15.4, 7); c.lineTo(19, 7); },
    bell: function (c) { c.moveTo(12, 3.5); c.lineTo(12, 5); c.moveTo(5.5, 17); c.bezierCurveTo(7.5, 15, 7, 12, 7, 10.5); c.bezierCurveTo(7, 7, 9.2, 5, 12, 5); c.bezierCurveTo(14.8, 5, 17, 7, 17, 10.5); c.bezierCurveTo(17, 12, 16.5, 15, 18.5, 17); c.closePath(); c.moveTo(10, 19.5); c.arc(12, 19, 2, Math.PI, 0, true); },
    anchor: function (c) { arc(c, 12, 5.3, 2.3); c.moveTo(12, 7.6); c.lineTo(12, 20.5); c.moveTo(7.5, 11.5); c.lineTo(16.5, 11.5); c.moveTo(4, 14); c.bezierCurveTo(4.5, 19, 8.5, 20.5, 12, 20.5); c.bezierCurveTo(15.5, 20.5, 19.5, 19, 20, 14); },
    ladder: function (c) { c.moveTo(7, 3); c.lineTo(7, 21); c.moveTo(17, 3); c.lineTo(17, 21); for (var i = 0; i < 5; i++) { c.moveTo(7, 6 + i * 3.7); c.lineTo(17, 6 + i * 3.7); } },
    crown: function (c) { c.moveTo(3.5, 18.5); c.lineTo(3, 7); c.lineTo(8, 12); c.lineTo(12, 5); c.lineTo(16, 12); c.lineTo(21, 7); c.lineTo(20.5, 18.5); c.closePath(); c.moveTo(3.5, 21); c.lineTo(20.5, 21); },
    telescope: function (c) { c.moveTo(3, 13); c.lineTo(13, 6); c.lineTo(15.5, 10.2); c.lineTo(5.5, 17.2); c.closePath(); c.moveTo(14, 8); c.lineTo(20.5, 4); c.lineTo(21.5, 6); c.lineTo(15.4, 10.2); c.moveTo(8, 17); c.lineTo(5.5, 21.5); c.moveTo(11, 15); c.lineTo(13.5, 21.5); },
    scroll: function (c) { c.moveTo(7, 4); c.lineTo(19, 4); c.lineTo(19, 17.5); c.arc(16.5, 17.5, 2.5, 0, Math.PI, false); c.lineTo(5, 20); c.arc(5, 17.5, 2.5, Math.PI / 2, Math.PI * 1.5, false); c.lineTo(7, 15); c.closePath(); c.moveTo(10, 8); c.lineTo(16, 8); c.moveTo(10, 11); c.lineTo(16, 11); },
    toolbox: function (c) { c.rect(3, 9, 18, 11); c.moveTo(9, 9); c.lineTo(9, 6); c.lineTo(15, 6); c.lineTo(15, 9); c.moveTo(3, 14); c.lineTo(21, 14); c.moveTo(10.5, 12.5); c.lineTo(13.5, 12.5); c.lineTo(13.5, 15.5); c.lineTo(10.5, 15.5); c.closePath(); },
    flask: function (c) { c.moveTo(9.5, 3.5); c.lineTo(14.5, 3.5); c.moveTo(10.5, 3.5); c.lineTo(10.5, 9.5); c.lineTo(4.8, 19); c.lineTo(19.2, 19); c.lineTo(13.5, 9.5); c.lineTo(13.5, 3.5); c.moveTo(7.6, 15); c.lineTo(16.4, 15); },
    ruler: function (c) { c.moveTo(3, 15.5); c.lineTo(15.5, 3); c.lineTo(21, 8.5); c.lineTo(8.5, 21); c.closePath(); for (var i = 0; i < 4; i++) { c.moveTo(7.2 + i * 2.7, 14.5 - i * 2.7 + 0.2); c.lineTo(9.2 + i * 2.7, 16.5 - i * 2.7 + 0.2); } },
    calendar: function (c) { c.rect(3.5, 5, 17, 15.5); c.moveTo(3.5, 10); c.lineTo(20.5, 10); c.moveTo(8, 3); c.lineTo(8, 7); c.moveTo(16, 3); c.lineTo(16, 7); c.moveTo(8, 14); c.lineTo(8.1, 14); c.moveTo(12, 14); c.lineTo(12.1, 14); c.moveTo(16, 14); c.lineTo(16.1, 14); },
    medal: function (c) { c.moveTo(8, 3); c.lineTo(11.3, 9.5); c.moveTo(16, 3); c.lineTo(12.7, 9.5); c.moveTo(18.2, 15); arc(c, 12, 15, 6.2); c.moveTo(12, 11.7); c.lineTo(13, 14); c.lineTo(15.4, 14.2); c.lineTo(13.6, 15.8); c.lineTo(14.2, 18.2); c.lineTo(12, 17); c.lineTo(9.8, 18.2); c.lineTo(10.4, 15.8); c.lineTo(8.6, 14.2); c.lineTo(11, 14); c.closePath(); },
    lantern: function (c) { c.moveTo(12, 2.5); c.lineTo(12, 5); c.moveTo(8, 5); c.lineTo(16, 5); c.moveTo(7, 8); c.lineTo(17, 8); c.moveTo(8, 5); c.lineTo(7, 8); c.lineTo(7, 17); c.lineTo(8.5, 20); c.lineTo(15.5, 20); c.lineTo(17, 17); c.lineTo(17, 8); c.lineTo(16, 5); c.moveTo(12, 11); c.arc(12, 13.5, 2.5, -Math.PI / 2, Math.PI * 1.5); },
    brush: function (c) { c.moveTo(19.5, 3.5); c.lineTo(11, 12); c.moveTo(9.5, 11.5); c.bezierCurveTo(7, 11.5, 5.5, 13.5, 5.5, 15.5); c.bezierCurveTo(5.5, 18, 4, 19, 3, 20); c.bezierCurveTo(7, 21.5, 11.5, 20.5, 12.5, 15); c.lineTo(11, 12); },
    umbrella: function (c) { c.moveTo(3, 12); c.arc(12, 12, 9, Math.PI, 0); c.bezierCurveTo(19, 10.8, 16, 10.8, 15.7, 12); c.bezierCurveTo(15, 10.8, 13, 10.8, 12, 12); c.bezierCurveTo(11, 10.8, 9, 10.8, 8.3, 12); c.bezierCurveTo(8, 10.8, 5, 10.8, 3, 12); c.moveTo(12, 12); c.lineTo(12, 19); c.arc(10, 19, 2, 0, Math.PI, false); },
    keyhole: function (c) { c.rect(5, 3.5, 14, 17); c.moveTo(14.6, 10); arc(c, 12, 10, 2.6); c.moveTo(12, 12.6); c.lineTo(10.5, 17); c.lineTo(13.5, 17); c.closePath(); },
    battery: function (c) { c.rect(3, 7.5, 16, 9); c.moveTo(19, 10.5); c.lineTo(21.5, 10.5); c.lineTo(21.5, 13.5); c.lineTo(19, 13.5); c.moveTo(6, 10.5); c.lineTo(6, 13.5); c.moveTo(9.5, 10.5); c.lineTo(9.5, 13.5); c.moveTo(13, 10.5); c.lineTo(13, 13.5); },
    cycle: function (c) { c.moveTo(18.8, 9); c.arc(12, 12, 7, -0.55, Math.PI * 0.95, false); c.moveTo(18.8, 4.8); c.lineTo(18.8, 9); c.lineTo(14.6, 9); c.moveTo(5.2, 15); c.arc(12, 12, 7, Math.PI * 0.45, Math.PI * 1.95, false); c.moveTo(5.2, 19.2); c.lineTo(5.2, 15); c.lineTo(9.4, 15); },
    bookstack: function (c) { c.rect(4, 15, 16, 5); c.rect(5.5, 10, 13, 5); c.rect(7, 5, 10, 5); c.moveTo(7, 17.5); c.lineTo(9, 17.5); c.moveTo(8.5, 12.5); c.lineTo(10.5, 12.5); }
  };
  var ICON_NAMES = Object.keys(ICON);
  var ROLE_ICONS = {
    root: ['compass', 'crown', 'telescope'], category: ['toolbox', 'bookstack', 'ladder'], process: ['gear', 'wrench', 'hourglass', 'cycle'],
    example: ['bulb', 'flag', 'pin', 'lantern'], question: ['magnifier', 'telescope', 'keyhole'], benefit: ['trophy', 'medal', 'key', 'shield'],
    risk: ['lock', 'warning', 'umbrella'], date: ['clock', 'calendar', 'hourglass'], list: ['scales', 'ruler', 'bookstack'], formula: ['ruler', 'flask', 'battery', 'compass'],
    definition: ['book', 'scroll', 'pencil'], bubble: ['pin'], concept: ['puzzle', 'magnet', 'brush', 'scissors', 'hammer', 'bell', 'bulb', 'pencil', 'anchor', 'lantern', 'umbrella', 'key', 'gear', 'flask']
  };
  var MAT = [   // material: [cuerpo, borde claro, tinta del objeto]
    ['#b45309', '#fbbf24', '#fff7ed'], ['#64748b', '#e2e8f0', '#f8fafc'], ['#ca8a04', '#fde047', '#422006'], ['#c2410c', '#fdba74', '#fff7ed'],
    ['#7c4a24', '#d6a572', '#fff4e0'], ['#0e7490', '#67e8f9', '#ecfeff'], ['#a21caf', '#f0abfc', '#fdf4ff'], ['#15803d', '#86efac', '#f0fdf4']
  ];
  var TOTAL = ICON_NAMES.length * MAT.length * 5;

  function plate(ctx, st, x, y, w, h) {
    var r = h / 2;
    ctx.beginPath();
    if (st === 0) rr(ctx, x, y, w, h, r);
    else if (st === 1) { var c = Math.min(9, h * 0.3); ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath(); }
    else if (st === 2) { var n = Math.min(10, h * 0.3); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - n, y + h / 2); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x + n * 0.0, y + h / 2); ctx.closePath(); }
    else if (st === 3) { ctx.moveTo(x, y); ctx.lineTo(x + w - 11, y); ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - 11, y + h); ctx.lineTo(x, y + h); ctx.closePath(); }
    else rr(ctx, x, y, w, h, 8);
  }
  function selected() { try { return new Set((window.network && network.getSelectedNodes ? network.getSelectedNodes() : []).map(String)); } catch (e) { return new Set(); } }
  var tools = {
    transparent: true, edges: true, static: true, margin: { top: 14, bottom: 14, left: 30, right: 30 }, count: TOTAL,
    before: function (ctx, F, V, pr) {
      ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0); var g = ctx.createLinearGradient(0, 0, V.W, V.H); g.addColorStop(0, '#0e1218'); g.addColorStop(1, '#1a1410'); ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
      ctx.globalAlpha = 0.06; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; var s = 28; for (var i = 0; i < V.W; i += s) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, V.H); ctx.stroke(); } for (var j = 0; j < V.H; j += s) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(V.W, j); ctx.stroke(); } ctx.restore();   // papel cuadriculado de taller
      var nk = new Map(); F.links.forEach(function (L) { nk.set(L.a.id, (nk.get(L.a.id) || 0) + 1); }); var sel = selected();
      F.list.forEach(function (o) {
        if (!o.role) o.role = SH.roleOf(o, o.nk != null ? o.nk : (nk.get(o.id) || 0));
        var list = ROLE_ICONS[o.role] || ROLE_ICONS.concept, ic = list[Math.floor(hash(o.id + 'i') * list.length) % list.length], mt = MAT[Math.floor(hash(o.id + 'm') * MAT.length) % MAT.length], ps = Math.floor(hash(o.id + 'p') * 5) % 5;
        var body = hex(mt[0]), rim = hex(mt[1]), ink = mt[2], x = o.x - 4, y = o.y - 1, w = o.w + 8, h = o.h + 2, R = Math.max(15, h * 0.66) * (o.lv === 0 ? 1.2 : 1), mx = x + 4, my = o.cy;
        ctx.save();
        if (sel.has(o.id)) { ctx.shadowColor = rgba(rim, 0.95); ctx.shadowBlur = 20; } else { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; }
        plate(ctx, ps, x, y, w, h);
        var gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, rgba(mix(darken(body, 0.55), body, 0.1), 1)); gr.addColorStop(1, rgba(darken(body, 0.78), 1)); ctx.fillStyle = gr; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = rgba(rim, 0.95); ctx.lineWidth = 1.8; ctx.stroke();
        if (ps === 4) { ctx.save(); ctx.globalAlpha = 0.45; plate(ctx, 0, x + 3, y + 3, w - 6, h - 6); ctx.restore(); ctx.beginPath(); rr(ctx, x + 3.5, y + 3.5, w - 7, h - 7, 6); ctx.strokeStyle = rgba(rim, 0.4); ctx.lineWidth = 1; ctx.stroke(); }
        if (ps === 1) { ctx.fillStyle = rgba(rim, 0.9); [[x + 7, y + 6], [x + w - 7, y + 6], [x + 7, y + h - 6], [x + w - 7, y + h - 6]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 1.5, 0, TAU); ctx.fill(); }); }
        ctx.restore();
        // medalla con el objeto
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(mx, my, R, 0, TAU);
        var mg = ctx.createRadialGradient(mx - R * 0.3, my - R * 0.4, 1, mx, my, R); mg.addColorStop(0, rgba(lighten(body, 0.35), 1)); mg.addColorStop(1, rgba(darken(body, 0.35), 1)); ctx.fillStyle = mg; ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = rgba(rim, 1); ctx.lineWidth = 2.2; ctx.stroke(); ctx.beginPath(); ctx.arc(mx, my, R - 3.4, 0, TAU); ctx.strokeStyle = rgba(rim, 0.45); ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
        ctx.save(); var sc = (R * 1.18) / 24; ctx.translate(mx - 12 * sc, my - 12 * sc); ctx.scale(sc, sc); ctx.strokeStyle = ink; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); try { ICON[ic](ctx); } catch (e) { /* icono opcional */ } ctx.stroke(); ctx.restore();
      });
    },
    after: function () { }
  };
  T.register('tools', EN ? '🛠️ Tools' : '🛠️ Herramientas', tools);
  window.__gkTools = { total: TOTAL, icons: ICON_NAMES };
})();
