/* view3d.js — modalidades de vista del mapa: «Bloques 3D», «Ciudad» y «Orgánico».
 * Solo cambian CÓMO SE DIBUJA el mapa (por debajo y por encima de los nodos de vis-network): no tocan los nodos, las flechas ni lo que se guarda,
 * así que el orden y la jerarquía quedan exactamente igual. Se eligen en el selector «Vista» (junto a Plana y Profundidad).
 * Si algo falla al dibujar, la vista vuelve sola a «Plana». Respeta prefers-reduced-motion (sin animación). */
(function () {
  'use strict';
  if (window.__gkV3) return;
  var sel, S = { mode: 'flat', t: 0, last: 0, raf: 0, sig: '', level: new Map(), kids: new Map(), frame: null, orig: null };
  var MODES = ['blocks', 'organic'];   // «Ciudad» (city) se retiró del selector; su código queda sin uso
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en');
  var LABELS = { blocks: EN ? '🧱 3D blocks' : '🧱 Bloques 3D', city: EN ? '🏙️ City' : '🏙️ Ciudad', organic: EN ? '🌿 Organic' : '🌿 Orgánico' };
  var reduce = function () { try { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  /* ---------- utilidades ---------- */
  var hex = function (c) {
    if (typeof c !== 'string') return [80, 90, 120]; c = c.trim();
    if (c[0] === '#') { if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [1, 3, 5].map(function (i) { return parseInt(c.slice(i, i + 2), 16) || 0; }); }
    var m = c.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [80, 90, 120];
  };
  var rgba = function (c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : +a.toFixed(3)) + ')'; };
  var mix = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  var lighten = function (c, t) { return mix(c, [255, 255, 255], t); };
  var darken = function (c, t) { return mix(c, [0, 0, 0], t); };
  var hash = function (s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 16777619); } return ((h >>> 0) % 100000) / 100000; };
  var rr = function (ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  var dpr = function () { try { var cv = network.canvas && network.canvas.frame && network.canvas.frame.canvas; return cv && cv.clientWidth ? cv.width / cv.clientWidth : 1; } catch (e) { return 1; } };
  var nodeCol = function (n) { var c = n.color; if (c && typeof c === 'object') return { bg: hex(c.background), bd: hex(c.border || c.background) }; if (typeof c === 'string') return { bg: hex(c), bd: hex(c) }; return { bg: [20, 30, 50], bd: [79, 209, 197] }; };

  /* ---------- jerarquía (nivel de cada nodo y sus hijos) ---------- */
  function hierarchy() {
    var sig = nodes.length + ':' + edges.length;
    if (sig === S.sig) return;
    S.sig = sig; S.level = new Map(); S.kids = new Map();
    var all = nodes.get(), hasIn = new Set();
    edges.get().forEach(function (e) {
      if (typeof isRelatedEdgeLabel === 'function' && isRelatedEdgeLabel(e.label)) return;
      hasIn.add(String(e.to)); var k = String(e.from); if (!S.kids.has(k)) S.kids.set(k, []); S.kids.get(k).push(String(e.to));
    });
    var q = []; all.forEach(function (n) { if (!hasIn.has(String(n.id))) { S.level.set(String(n.id), 0); q.push(String(n.id)); } });
    while (q.length) { var id = q.shift(); (S.kids.get(id) || []).forEach(function (c) { if (!S.level.has(c)) { S.level.set(c, S.level.get(id) + 1); q.push(c); } }); }
  }
  // Fotograma: nodos visibles con su caja, nivel y colores; y los pares padre→hijo visibles.
  function frame() {
    hierarchy();
    var list = [], byId = new Map();
    nodes.get().forEach(function (n) {
      if (n.hidden) return; var bb; try { bb = network.getBoundingBox(n.id); } catch (e) { return; } if (!bb) return;
      var o = { id: String(n.id), label: String(n.label == null ? '' : n.label), n: n, bb: bb, x: bb.left, y: bb.top, w: bb.right - bb.left, h: bb.bottom - bb.top, cx: (bb.left + bb.right) / 2, cy: (bb.top + bb.bottom) / 2, lv: S.level.has(String(n.id)) ? S.level.get(String(n.id)) : 3, nk: (S.kids.get(String(n.id)) || []).length, c: nodeCol(n) };
      list.push(o); byId.set(o.id, o);
    });
    var links = [];
    S.kids.forEach(function (ks, from) { var a = byId.get(from); if (!a) return; ks.forEach(function (to) { var b = byId.get(to); if (b) links.push({ a: a, b: b, key: from + '>' + to }); }); });
    return (S.frame = { list: list, byId: byId, links: links });
  }
  function view() {   // rectángulo visible en coordenadas del mapa
    var W = container.clientWidth, H = container.clientHeight, a = network.DOMtoCanvas({ x: 0, y: 0 }), b = network.DOMtoCanvas({ x: W, y: H });
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, W: W, H: H, sc: network.getScale() };
  }
  var skyBg = function (ctx, V, pr, c0, c1) {
    ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, V.H); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
    ctx.restore();
  };
  var vignette = function (ctx, V, pr, a) {
    ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0);
    var g = ctx.createRadialGradient(V.W / 2, V.H / 2, Math.min(V.W, V.H) * 0.35, V.W / 2, V.H / 2, Math.max(V.W, V.H) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,8,' + a + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H); ctx.restore();
  };

  /* =====================================================================
   *  BLOQUES 3D: cada nodo es un bloque con volumen (cara superior clara, lado oscuro, sombra en el suelo y un brillo que lo recorre).
   * ===================================================================== */
  var blocks = {
    before: function (ctx, F, V, pr) {
      skyBg(ctx, V, pr, '#080c1c', '#0d1330');
      F.list.forEach(function (o) {
        var D = o.lv === 0 ? 17 : o.lv === 1 ? 13 : 10, dx = D * 0.85, dy = -D * 0.85, bd = o.c.bd, r = 12;
        // sombra en el suelo
        ctx.save(); ctx.fillStyle = 'rgba(0,0,10,0.34)'; ctx.filter = 'none'; ctx.shadowColor = 'rgba(0,0,12,0.5)'; ctx.shadowBlur = 18 * V.sc * pr; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
        rr(ctx, o.x + 6, o.y + D * 0.6 + 8, o.w + dx, o.h, r); ctx.fill(); ctx.restore();
        var steps = 9, side = darken(bd, 0.62), top = lighten(darken(bd, 0.15), 0.28);
        // barrido del bloque hacia atrás: base oscura (lado) y, solo sobre el borde superior, tono claro (cara de arriba)
        for (var s = steps; s >= 1; s--) { var k = s / steps; ctx.fillStyle = rgba(mix(darken(bd, 0.45), side, k), 1); rr(ctx, o.x + dx * k, o.y + dy * k, o.w, o.h, r); ctx.fill(); }
        ctx.save(); ctx.beginPath(); ctx.rect(o.x - 4, o.y + dy - 4, o.w + dx + 8, -dy + 4); ctx.clip();
        for (var s2 = steps; s2 >= 1; s2--) { var k2 = s2 / steps; ctx.fillStyle = rgba(mix(top, lighten(top, 0.18), 1 - k2), 1); rr(ctx, o.x + dx * k2, o.y + dy * k2, o.w, o.h, r); ctx.fill(); }
        ctx.restore();
        // filo claro del borde superior del bloque
        ctx.strokeStyle = rgba(lighten(bd, 0.55), 0.75); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(o.x + r + dx, o.y + dy); ctx.lineTo(o.x + o.w - r + dx, o.y + dy); ctx.stroke();
      });
      vignette(ctx, V, pr, 0.45);
    },
    after: function (ctx, F, V, pr, t) {
      F.list.forEach(function (o, i) {
        ctx.save(); rr(ctx, o.x, o.y, o.w, o.h, 12); ctx.clip();
        var g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h); g.addColorStop(0, 'rgba(255,255,255,0.15)'); g.addColorStop(0.5, 'rgba(255,255,255,0.02)'); g.addColorStop(1, 'rgba(0,0,0,0.10)');
        ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h);
        if (!reduce()) {   // brillo que recorre la cara cada pocos segundos (cada bloque en su momento)
          var ph = ((t * 0.22 + hash(o.id) * 5) % 1);
          if (ph < 0.3) { var p = ph / 0.3, sx = o.x - o.w * 0.4 + (o.w * 1.8) * p, sw = Math.max(18, o.w * 0.22);
            var gg = ctx.createLinearGradient(sx - sw, 0, sx + sw, 0); gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(0.5, 'rgba(255,255,255,0.22)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = gg; ctx.save(); ctx.translate(o.cx, o.cy); ctx.transform(1, 0, -0.35, 1, 0, 0); ctx.translate(-o.cx, -o.cy); ctx.fillRect(sx - sw, o.y - 4, sw * 2, o.h + 8); ctx.restore(); }
        }
        ctx.restore();
        ctx.strokeStyle = rgba(lighten(o.c.bd, 0.35), 0.9); ctx.lineWidth = 1.2; rr(ctx, o.x, o.y, o.w, o.h, 12); ctx.stroke();
      });
    }
  };

  /* =====================================================================
   *  CIUDAD: el mapa es una ciudad nocturna. Los nodos son edificios (su nombre es el letrero de la azotea; la altura marca el nivel),
   *  las ramas son vías elevadas con luces que van del padre al hijo, y alrededor hay calles con tráfico y manzanas con edificios bajos.
   * ===================================================================== */
  var CITY_H = [66, 42, 28, 20];
  var cityH = function (o) { return (CITY_H[Math.min(o.lv, 3)] || 20) + hash(o.id + 'h') * 6; };
  function cityWindows(ctx, id, x, y, w, h, t, a) {
    var cw = 14, ch = 12, cols = Math.max(1, Math.floor((w - 8) / cw)), rows = Math.max(1, Math.floor((h - 6) / ch));
    var ox = x + (w - cols * cw) / 2 + (cw - 6) / 2, oy = y + 4;
    var bucket = Math.floor(t / 4);
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
      var base = hash(id + ':' + i + ':' + j), flick = hash(id + ':' + i + ':' + j + ':' + bucket);
      var lit = base > 0.42 ? (flick > 0.08) : (flick > 0.93); if (!lit) continue;
      ctx.fillStyle = base > 0.86 ? 'rgba(110,220,255,' + (0.8 * a).toFixed(3) + ')' : 'rgba(255,214,140,' + (0.85 * a).toFixed(3) + ')';
      ctx.fillRect(ox + i * cw, oy + j * ch, 6, 6);
    }
  }
  var city = {
    G: 130,
    before: function (ctx, F, V, pr, t) {
      var G = this.G;
      skyBg(ctx, V, pr, '#050918', '#0b1230');
      // resplandor lejano
      ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0);
      var g1 = ctx.createRadialGradient(V.W * 0.85, V.H * 0.95, 0, V.W * 0.85, V.H * 0.95, Math.max(V.W, V.H) * 0.7); g1.addColorStop(0, 'rgba(236,72,153,0.16)'); g1.addColorStop(1, 'rgba(236,72,153,0)'); ctx.fillStyle = g1; ctx.fillRect(0, 0, V.W, V.H);
      var g2 = ctx.createRadialGradient(V.W * 0.12, V.H * 0.05, 0, V.W * 0.12, V.H * 0.05, Math.max(V.W, V.H) * 0.6); g2.addColorStop(0, 'rgba(34,211,238,0.13)'); g2.addColorStop(1, 'rgba(34,211,238,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, V.W, V.H);
      ctx.restore();
      var detail = G * V.sc > 34;
      var i0 = Math.floor(V.x0 / G) - 1, i1 = Math.ceil(V.x1 / G) + 1, j0 = Math.floor(V.y0 / G) - 1, j1 = Math.ceil(V.y1 / G) + 1;
      if ((i1 - i0) * (j1 - j0) > 2600) { vignette(ctx, V, pr, 0.5); return; }
      // calles (cuadrícula)
      ctx.save(); ctx.lineCap = 'butt';
      ctx.strokeStyle = '#0f1736'; ctx.lineWidth = 15;
      ctx.beginPath(); for (var i = i0; i <= i1; i++) { ctx.moveTo(i * G, V.y0 - G); ctx.lineTo(i * G, V.y1 + G); } for (var j = j0; j <= j1; j++) { ctx.moveTo(V.x0 - G, j * G); ctx.lineTo(V.x1 + G, j * G); } ctx.stroke();
      if (detail) { ctx.strokeStyle = 'rgba(190,210,255,0.13)'; ctx.lineWidth = 1.2; ctx.setLineDash([8, 12]);
        ctx.beginPath(); for (var i2 = i0; i2 <= i1; i2++) { ctx.moveTo(i2 * G, V.y0 - G); ctx.lineTo(i2 * G, V.y1 + G); } for (var j2 = j0; j2 <= j1; j2++) { ctx.moveTo(V.x0 - G, j2 * G); ctx.lineTo(V.x1 + G, j2 * G); } ctx.stroke(); ctx.setLineDash([]); }
      ctx.restore();
      // manzanas ocupadas por los edificios principales: no se ponen edificios de relleno ahí
      var occ = new Set();
      F.list.forEach(function (o) {
        var Hh = cityH(o), ex = 26, a0 = Math.floor((o.x - ex) / G), a1 = Math.floor((o.x + o.w + ex + Hh * 0.8) / G), b0 = Math.floor((o.y - ex) / G), b1 = Math.floor((o.y + o.h + Hh + ex) / G);
        for (var a = a0; a <= a1; a++) for (var b = b0; b <= b1; b++) occ.add(a + ',' + b);
      });
      // edificios de relleno (tenues)
      for (var ci = i0; ci < i1; ci++) for (var cj = j0; cj < j1; cj++) {
        if (occ.has(ci + ',' + cj)) continue; var hv = hash(ci + '|' + cj); if (hv < 0.3) continue;
        var bx = ci * G + 17, by = cj * G + 17, bw = G - 34, bh = (G - 34) * (0.55 + hash(ci + 'w' + cj) * 0.3), H2 = 12 + hash(ci + 'q' + cj) * 30;
        if (hv > 0.9) { ctx.fillStyle = 'rgba(40,120,90,0.35)'; rr(ctx, bx, by, bw, bw, 14); ctx.fill(); ctx.fillStyle = 'rgba(70,180,120,0.25)'; ctx.beginPath(); ctx.arc(bx + bw * 0.3, by + bw * 0.35, 9, 0, 6.3); ctx.arc(bx + bw * 0.65, by + bw * 0.6, 12, 0, 6.3); ctx.fill(); continue; }
        var bc = [34 + hv * 30, 44 + hv * 26, 90 + hv * 50];
        ctx.fillStyle = 'rgba(0,0,10,0.3)'; ctx.fillRect(bx + 6, by + bh + H2 * 0.3, bw + H2 * 0.5, H2 * 0.7);
        var gw = ctx.createLinearGradient(0, by + bh, 0, by + bh + H2); gw.addColorStop(0, rgba(darken(bc, 0.3), 1)); gw.addColorStop(1, rgba(darken(bc, 0.6), 1));
        ctx.fillStyle = gw; ctx.fillRect(bx, by + bh, bw, H2);
        ctx.fillStyle = rgba(lighten(bc, 0.04), 1); rr(ctx, bx, by, bw, bh, 5); ctx.fill();
        ctx.strokeStyle = 'rgba(160,190,255,0.22)'; ctx.lineWidth = 1; rr(ctx, bx, by, bw, bh, 5); ctx.stroke();
        if (detail) cityWindows(ctx, ci + '_' + cj, bx, by + bh, bw, H2, t, 0.6);
      }
      // tráfico por las calles
      if (detail) {
        var P = 3200, n = 0;
        for (var li = i0; li <= i1; li++) for (var k = 0; k < 2; k++) { var hs = hash('v' + li + k), dirv = hs > 0.5 ? 1 : -1, sp = 34 + hs * 60, p = (((hs * 7 + k * 0.5) * P + t * sp * dirv) % P + P) % P - P / 2 + (V.y0 + V.y1) / 2; if (p < V.y0 - 40 || p > V.y1 + 40) continue; car(ctx, li * G + (dirv > 0 ? 3.5 : -3.5), p, 0, dirv, hs); n++; }
        for (var lj = j0; lj <= j1; lj++) for (var k2 = 0; k2 < 2; k2++) { var hs2 = hash('h' + lj + k2), dirh = hs2 > 0.5 ? 1 : -1, sp2 = 34 + hs2 * 60, p2 = (((hs2 * 7 + k2 * 0.5) * P + t * sp2 * dirh) % P + P) % P - P / 2 + (V.x0 + V.x1) / 2; if (p2 < V.x0 - 40 || p2 > V.x1 + 40) continue; car(ctx, p2, lj * G + (dirh > 0 ? 3.5 : -3.5), 1, dirh, hs2); }
      }
      // sombras y paredes de los edificios principales, y vías elevadas
      F.links.forEach(function (L) { rail(ctx, L, 0, t); });
      F.links.forEach(function (L) { rail(ctx, L, 1, t); });   // luces que viajan por las vías (por debajo del texto)
      F.list.slice().sort(function (a, b) { return a.cy - b.cy; }).forEach(function (o) {
        var Hh = cityH(o), bd = o.c.bd, by0 = o.y + o.h;
        ctx.fillStyle = 'rgba(0,0,12,0.38)'; ctx.beginPath(); ctx.moveTo(o.x + 4, by0 + Hh); ctx.lineTo(o.x + o.w + 4, by0 + Hh); ctx.lineTo(o.x + o.w + 4 + Hh * 0.85, by0 + Hh + Hh * 0.45); ctx.lineTo(o.x + 4 + Hh * 0.85, by0 + Hh + Hh * 0.45); ctx.closePath(); ctx.fill();
        var gw = ctx.createLinearGradient(0, by0, 0, by0 + Hh); gw.addColorStop(0, rgba(darken(bd, 0.55), 1)); gw.addColorStop(1, rgba(darken(bd, 0.82), 1));
        ctx.fillStyle = gw; rr(ctx, o.x + 2, by0 - 10, o.w - 4, Hh + 10, 5); ctx.fill();
        cityWindows(ctx, o.id, o.x + 2, by0 + 2, o.w - 4, Hh - 2, t, 1);
        ctx.fillStyle = rgba(bd, 0.5); ctx.fillRect(o.x + 2, by0 + Hh - 3, o.w - 4, 3);
      });
      vignette(ctx, V, pr, 0.5);
    },
    after: function (ctx, F, V, pr, t) {
      F.list.forEach(function (o) {   // borde de neón de la azotea (donde está el nombre)
        ctx.save(); ctx.shadowColor = rgba(o.c.bd, 0.9); ctx.shadowBlur = 14 * V.sc * pr; ctx.strokeStyle = rgba(lighten(o.c.bd, 0.15), 0.95); ctx.lineWidth = 2; rr(ctx, o.x, o.y, o.w, o.h, 12); ctx.stroke(); ctx.restore();
        if (o.lv === 0) {   // antena con luz intermitente en el edificio principal
          var ax = o.cx, ay = o.y; ctx.strokeStyle = 'rgba(200,215,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - 30); ctx.stroke();
          var on = reduce() ? 1 : (Math.sin(t * 3) > 0 ? 1 : 0.25); ctx.save(); ctx.shadowColor = 'rgba(255,70,90,1)'; ctx.shadowBlur = 16 * V.sc * pr; ctx.fillStyle = 'rgba(255,90,110,' + on + ')'; ctx.beginPath(); ctx.arc(ax, ay - 31, 3.6, 0, 6.3); ctx.fill(); ctx.restore();
        }
      });
      if (!reduce()) { var vw = V.x1 - V.x0, vh = V.y1 - V.y0;   // drones
        for (var d = 0; d < 6; d++) { var hs = hash('dr' + d), px = V.x0 + (((hs * 3 + t * (0.012 + hs * 0.02)) % 1) * (vw + 200)) - 100, py = V.y0 + vh * (0.12 + hs * 0.76) + Math.sin(t * 0.8 + d * 2) * 30;
          ctx.save(); ctx.shadowColor = 'rgba(120,230,255,1)'; ctx.shadowBlur = 10 * V.sc * pr; ctx.fillStyle = 'rgba(190,245,255,0.95)'; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, 6.3); ctx.fill(); ctx.restore(); } }
    }
  };
  function car(ctx, x, y, axis, dir, hs) {
    var warm = hs > 0.5, c = warm ? 'rgba(255,230,170,' : 'rgba(255,90,90,', len = 26;
    var g = axis === 0 ? ctx.createLinearGradient(x, y - dir * len, x, y) : ctx.createLinearGradient(x - dir * len, y, x, y);
    g.addColorStop(0, c + '0)'); g.addColorStop(1, c + '0.55)'); ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); if (axis === 0) { ctx.moveTo(x, y - dir * len); ctx.lineTo(x, y); } else { ctx.moveTo(x - dir * len, y); ctx.lineTo(x, y); } ctx.stroke();
    ctx.fillStyle = c + '0.95)'; ctx.beginPath(); ctx.arc(x, y, 1.9, 0, 6.3); ctx.fill();
  }
  function rail(ctx, L, pass, t) {
    var a = L.a, b = L.b, col = b.c.bd;
    var ax = a.cx, ay = a.cy, bx = b.cx, by = b.cy;
    if (pass === 0) {
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = rgba(col, 0.16); ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = rgba(darken(col, 0.5), 0.9); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = rgba(lighten(col, 0.3), 0.85); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
    } else if (!reduce()) {
      for (var k = 0; k < 2; k++) { var f = ((t * 0.16 + hash(L.key) + k * 0.5) % 1), x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
        ctx.save(); ctx.shadowColor = rgba(col, 1); ctx.shadowBlur = 14; ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 6.3); ctx.fill(); ctx.restore(); }
    }
  }

  /* =====================================================================
   *  ORGÁNICO: ramas curvas que se afinan como las de un árbol, nodos en forma de píldora y un fondo de bosque suave.
   *  La jerarquía sigue siendo evidente: el tronco sale de la raíz y cada rama se adelgaza hacia sus hijos.
   * ===================================================================== */
  var LIMB_W = [17, 11, 7, 4.6, 3.2];
  var limbW = function (lv) { return LIMB_W[Math.min(lv, LIMB_W.length - 1)]; };
  function limbPts(L, t) {
    var a = L.a, b = L.b, dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    var sway = reduce() ? 0 : Math.sin(t * 0.7 + hash(L.key) * 6) * 0.02, bend = (hash(L.key + 'b') > 0.5 ? 1 : -1) * (0.16 + hash(L.key + 'c') * 0.08 + sway) * len;
    var mx = (a.cx + b.cx) / 2 + nx * bend, my = (a.cy + b.cy) / 2 + ny * bend, pts = [], N = 22;
    for (var i = 0; i <= N; i++) { var u = i / N, v = 1 - u; pts.push({ x: v * v * a.cx + 2 * v * u * mx + u * u * b.cx, y: v * v * a.cy + 2 * v * u * my + u * u * b.cy, u: u }); }
    return pts;
  }
  var organic = {
    before: function (ctx, F, V, pr, t) {
      skyBg(ctx, V, pr, '#07171a', '#0e2a2a');
      ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0);
      [[0.2, 0.25, '60,190,150', 0.16], [0.8, 0.7, '120,200,120', 0.12], [0.55, 0.1, '70,160,200', 0.1]].forEach(function (m, i) {
        var x = V.W * m[0] + (reduce() ? 0 : Math.sin(t * 0.08 + i * 2) * 60), y = V.H * m[1] + (reduce() ? 0 : Math.cos(t * 0.07 + i) * 40), R = Math.max(V.W, V.H) * 0.45;
        var g = ctx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, 'rgba(' + m[2] + ',' + m[3] + ')'); g.addColorStop(1, 'rgba(' + m[2] + ',0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
      });
      for (var p = 0; p < 46; p++) {   // polen que flota
        var hs = hash('pl' + p), px = ((hs * V.W + (reduce() ? 0 : t * (4 + hs * 8))) % V.W), py = ((hash('py' + p) * V.H - (reduce() ? 0 : t * (6 + hs * 10))) % V.H + V.H) % V.H + (reduce() ? 0 : Math.sin(t * 0.6 + p) * 6);
        ctx.fillStyle = 'rgba(200,255,220,' + (0.12 + hs * 0.22).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(px, py, 0.8 + hs * 1.6, 0, 6.3); ctx.fill();
      }
      ctx.restore();
      // ramas
      F.links.forEach(function (L) {
        var pts = limbPts(L, t), wa = limbW(L.a.lv), wb = limbW(L.b.lv), ca = L.a.c.bd, cb = L.b.c.bd;
        var left = [], right = [];
        for (var i = 0; i < pts.length; i++) {
          var q = pts[i], q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(pts.length - 1, i + 1)], tx = q1.x - q0.x, ty = q1.y - q0.y, tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl, w = (wa + (wb - wa) * q.u) / 2;
          left.push({ x: q.x + nx * w, y: q.y + ny * w }); right.push({ x: q.x - nx * w, y: q.y - ny * w });
        }
        var g = ctx.createLinearGradient(L.a.cx, L.a.cy, L.b.cx, L.b.cy); g.addColorStop(0, rgba(mix(darken(ca, 0.45), [70, 50, 30], 0.35), 1)); g.addColorStop(1, rgba(mix(darken(cb, 0.35), [50, 110, 70], 0.3), 1));
        ctx.beginPath(); ctx.moveTo(left[0].x, left[0].y); left.forEach(function (q) { ctx.lineTo(q.x, q.y); }); for (var r = right.length - 1; r >= 0; r--) ctx.lineTo(right[r].x, right[r].y); ctx.closePath();
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8 * V.sc * pr; ctx.fillStyle = g; ctx.fill(); ctx.restore();
        ctx.strokeStyle = rgba(lighten(cb, 0.35), 0.35); ctx.lineWidth = 1.1; ctx.beginPath(); pts.forEach(function (q, i2) { if (i2 === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }); ctx.stroke();
        // hojitas a lo largo de la rama
        var leaves = Math.max(0, Math.floor(Math.hypot(L.b.cx - L.a.cx, L.b.cy - L.a.cy) / 70));
        for (var lf = 0; lf < leaves; lf++) {
          var u = 0.25 + (lf + 0.5) / (leaves + 0.5) * 0.6, qi = pts[Math.min(pts.length - 1, Math.round(u * (pts.length - 1)))], qa = pts[Math.max(0, Math.round(u * (pts.length - 1)) - 1)], ang = Math.atan2(qi.y - qa.y, qi.x - qa.x) + (lf % 2 ? 1 : -1) * (0.95 + (reduce() ? 0 : Math.sin(t * 1.1 + lf + hash(L.key) * 5) * 0.14)), ll = 7 + hash(L.key + lf) * 6;
          ctx.save(); ctx.translate(qi.x, qi.y); ctx.rotate(ang); ctx.fillStyle = 'rgba(120,210,140,0.55)'; ctx.beginPath(); ctx.ellipse(ll * 0.55, 0, ll * 0.6, ll * 0.28, 0, 0, 6.3); ctx.fill(); ctx.restore();
        }
      });
      vignette(ctx, V, pr, 0.4);
    },
    after: function (ctx, F, V, pr, t) {
      F.list.forEach(function (o) {   // halo suave que respira alrededor de cada píldora
        var br = reduce() ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.3 + hash(o.id) * 6.3), rad = Math.min(o.h / 2, 28);
        ctx.save(); ctx.shadowColor = rgba(o.c.bd, 0.55 + 0.25 * br); ctx.shadowBlur = (10 + 8 * br) * V.sc * pr; ctx.strokeStyle = rgba(lighten(o.c.bd, 0.1), 0.9); ctx.lineWidth = 1.8; rr(ctx, o.x, o.y, o.w, o.h, rad + 2); ctx.stroke(); ctx.restore();
      });
    }
  };
  var IMPL = { blocks: blocks, city: city, organic: organic };

  /* ---------- opciones de vis-network que se cambian mientras la vista está activa (y se restauran al salir) ---------- */
  var BASE_EDGES = { color: { color: '#4a5178', highlight: '#4fd1c5', hover: '#8b7cf6', inherit: false }, width: 1.5, selectionWidth: 1, hoverWidth: 1, arrows: { to: { enabled: true, scaleFactor: 0.8 } } };
  var BASE_NODES = { shadow: { enabled: true, color: 'rgba(79, 209, 197, 0.18)', size: 14, x: 0, y: 0 }, shapeProperties: { borderRadius: 12 } };
  var HIDE_EDGES = { color: { color: 'rgba(0,0,0,0)', highlight: 'rgba(0,0,0,0)', hover: 'rgba(0,0,0,0)', inherit: false }, width: 0.01, selectionWidth: 0, hoverWidth: 0, arrows: { to: { enabled: false } } };
  var BASE_MARGIN = { top: 16, bottom: 16, left: 20, right: 20 };
  var TR = 'rgba(0,0,0,0)';
  // Modos con formas propias (se registran desde fuera): la caja de vis se vuelve transparente solo al dibujar (no se toca el dato guardado).
  function patchNodes(on) {
    var bn = network && network.body && network.body.nodes; if (!bn) return;
    Object.keys(bn).forEach(function (id) {
      var o = bn[id] && bn[id].options; if (!o || !o.color || typeof o.color !== 'object') return;
      var c = o.color, vis = c.background !== TR;
      var copy = function () { return { background: c.background, border: c.border, hb: c.highlight && c.highlight.background, hd: c.highlight && c.highlight.border, ob: c.hover && c.hover.background, od: c.hover && c.hover.border }; };
      var put = function (v) { c.background = v.background; c.border = v.border; if (c.highlight && typeof c.highlight === 'object') { c.highlight.background = v.hb; c.highlight.border = v.hd; } if (c.hover && typeof c.hover === 'object') { c.hover.background = v.ob; c.hover.border = v.od; } };
      if (on) { if (!vis && o.__gkSv) return; if (vis) o.__gkSv = copy(); put({ background: TR, border: TR, hb: TR, hd: TR, ob: TR, od: TR }); }
      else if (o.__gkSv) { if (!vis) put(o.__gkSv); delete o.__gkSv; }
    });
  }
  function applyOptions(mode) {
    try {
      var X = IMPL[mode];
      if (X && X.transparent) { network.setOptions({ edges: X.edges === false ? HIDE_EDGES : BASE_EDGES, nodes: { shadow: { enabled: false }, margin: X.margin || BASE_MARGIN, shapeProperties: { borderRadius: 12 } } }); patchNodes(true); return; }
      patchNodes(false);
      if (mode === 'flat') network.setOptions({ edges: BASE_EDGES, nodes: Object.assign({ margin: BASE_MARGIN }, BASE_NODES) });
      else if (mode === 'blocks') network.setOptions({ edges: BASE_EDGES, nodes: { shadow: { enabled: false }, margin: BASE_MARGIN, shapeProperties: { borderRadius: 12 } } });
      else if (mode === 'city') network.setOptions({ edges: HIDE_EDGES, nodes: { shadow: { enabled: false }, margin: BASE_MARGIN, shapeProperties: { borderRadius: 12 } } });
      else if (mode === 'organic') network.setOptions({ edges: HIDE_EDGES, nodes: { shadow: { enabled: false }, margin: BASE_MARGIN, shapeProperties: { borderRadius: 28 } } });
    } catch (e) { /* no crítico */ }
  }

  /* ---------- enganches de dibujo ---------- */
  function fail(e) { try { console.error('[view3d]', e); track('view_mode_error', { why: String(e && e.message).slice(0, 80), mode: S.mode }); } catch (_e) { /* ok */ } set('flat', false); }
  function run(which) {
    return function (ctx) {
      if (S.mode === 'flat' || !IMPL[S.mode]) return;
      try {
        S.t = reduce() ? 0 : performance.now() / 1000;
        if (which === 'before' && IMPL[S.mode].transparent) patchNodes(true);
        var F = which === 'before' ? frame() : (S.frame || frame()), V = view(), pr = dpr();
        ctx.save(); IMPL[S.mode][which].call(IMPL[S.mode], ctx, F, V, pr, S.t); ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (_e) { /* ok */ } fail(e); }
    };
  }
  var HAS = (typeof network !== 'undefined' && typeof container !== 'undefined' && typeof nodes !== 'undefined');
  if (HAS) { network.on('beforeDrawing', run('before')); network.on('afterDrawing', run('after')); }

  function loop() {
    S.raf = 0; if (S.mode === 'flat' || reduce() || (IMPL[S.mode] && IMPL[S.mode].static)) return;
    var now = performance.now();
    if (!document.hidden && now - S.last >= 40) { S.last = now; try { network.redraw(); } catch (e) { /* ok */ } }
    S.raf = requestAnimationFrame(loop);
  }
  function set(mode, byUser) {
    if (mode !== 'flat' && MODES.indexOf(mode) < 0) mode = 'flat';
    if (mode === S.mode && !byUser) return;
    var was = S.mode; S.mode = mode;
    container.classList.toggle('v3-on', mode !== 'flat');
    applyOptions(mode);
    if (sel) sel.value = mode === 'flat' ? (was === 'flat' ? sel.value : 'flat') : mode;
    if (byUser) { try { localStorage.setItem('gk_view_mode3', mode); } catch (e) { /* ok */ } try { track('view_mode', { mode: mode, nodes: nodes.length }); } catch (e) { /* ok */ } }
    try { network.redraw(); } catch (e) { /* ok */ }
    if (mode !== 'flat' && !S.raf && !(IMPL[mode] && IMPL[mode].static)) S.raf = requestAnimationFrame(loop);
  }


  /* ---------- «Foto»: imagen bonita para publicar (misma vista que se ve, con título y dirección) ----------
   * opts: { mode, list:[{id,label,x,y,w,h,cx,cy,lv,c:{bg,bd}}], links:[{a,b,key}], title, url, scale } — coordenadas del mapa. */
  function drawText(n, ctx, mode) {
    var fs = n.lv === 0 ? 17 : 15; ctx.save(); ctx.font = (n.lv === 0 ? '700 ' : '600 ') + fs + 'px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#eef1fb';
    var txt = String(n.label || '').replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim(), words = txt.split(' '), lines = [], line = '', maxW = n.w - 18;
    words.forEach(function (w) { var tt = line ? line + ' ' + w : w; if (ctx.measureText(tt).width > maxW && line) { lines.push(line); line = w; } else line = tt; }); if (line) lines.push(line);
    var lh = fs * 1.2, ys = n.cy - ((lines.length - 1) * lh) / 2; lines.slice(0, 4).forEach(function (l, i) { ctx.fillText(l, n.cx, ys + i * lh); });
    ctx.restore();
  }
  function snapshot(o) {
    var list = o.list, links = o.links || [], mode = o.mode && IMPL[o.mode] ? o.mode : 'flat', sc = o.scale || 2;
    if (!list.length) return Promise.resolve(null);
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    list.forEach(function (n) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h); });
    var PAD = mode === 'city' ? 70 : 56, HEAD = 78, FOOT = 40;
    var Wc = Math.round(x1 - x0 + PAD * 2), Hc = Math.round(y1 - y0 + PAD * 2 + HEAD + FOOT);
    var maxPx = 4096; if (Wc * sc > maxPx || Hc * sc > maxPx) sc = Math.max(0.5, Math.min(maxPx / Wc, maxPx / Hc));
    var cv = document.createElement('canvas'); cv.width = Math.round(Wc * sc); cv.height = Math.round(Hc * sc);
    var ctx = cv.getContext('2d'), ox = x0 - PAD, oy = y0 - PAD - HEAD;
    var V = { x0: ox, y0: oy, x1: ox + Wc, y1: oy + Hc, W: Wc, H: Hc, sc: 1 };
    var byId = {}; list.forEach(function (n) { byId[n.id] = n; });
    var F = { list: list, byId: byId, links: links };
    function world() { ctx.setTransform(sc, 0, 0, sc, 0, 0); ctx.translate(-ox, -oy); }
    var t = 2.4;
    ctx.save();
    if (mode === 'flat') { ctx.fillStyle = '#0b1118'; ctx.fillRect(0, 0, cv.width, cv.height); } else { world(); IMPL[mode].before.call(IMPL[mode], ctx, F, V, sc, t); }
    ctx.restore();
    // ramas (en Plana y Bloques; Ciudad y Orgánico dibujan las suyas)
    if (mode === 'flat' || mode === 'blocks' || IMPL[mode].edges) {
      ctx.save(); world(); ctx.lineWidth = 2; ctx.lineCap = 'round';
      links.forEach(function (L) { var a = L.a, b = L.b, horiz = Math.abs(b.cx - a.cx) > Math.abs(b.cy - a.cy), sx = horiz ? (b.cx > a.cx ? a.x + a.w : a.x) : a.cx, sy = horiz ? a.cy : (b.cy > a.cy ? a.y + a.h : a.y), ex = horiz ? (b.cx > a.cx ? b.x : b.x + b.w) : b.cx, ey = horiz ? b.cy : (b.cy > a.cy ? b.y : b.y + b.h);
        ctx.strokeStyle = rgba(b.c.bd, 0.7); ctx.beginPath(); ctx.moveTo(sx, sy);
        if (horiz) ctx.bezierCurveTo((sx + ex) / 2, sy, (sx + ex) / 2, ey, ex, ey); else ctx.bezierCurveTo(sx, (sy + ey) / 2, ex, (sy + ey) / 2, ex, ey); ctx.stroke(); });
      ctx.restore();
    }
    // nodos
    ctx.save(); world();
    list.forEach(function (n) {
      var r = mode === 'organic' ? Math.min(n.h / 2, 28) : 12;
      if (IMPL[mode] && IMPL[mode].transparent) { drawText(n, ctx, mode); return; }
      ctx.save();
      if (mode === 'flat') { ctx.shadowColor = 'rgba(79,209,197,0.18)'; ctx.shadowBlur = 14; }
      rr(ctx, n.x, n.y, n.w, n.h, r); ctx.fillStyle = rgba(n.c.bg, 1); ctx.fill(); ctx.restore();
      ctx.strokeStyle = rgba(n.c.bd, 1); ctx.lineWidth = 1.5; rr(ctx, n.x, n.y, n.w, n.h, r); ctx.stroke();
      drawText(n, ctx, mode);
    });
    ctx.restore();
    if (mode !== 'flat') { ctx.save(); world(); IMPL[mode].after.call(IMPL[mode], ctx, F, V, sc, t); ctx.restore(); }
    // título y dirección
    ctx.save(); ctx.setTransform(sc, 0, 0, sc, 0, 0);
    var hg = ctx.createLinearGradient(0, 0, 0, HEAD); hg.addColorStop(0, 'rgba(0,0,10,0.55)'); hg.addColorStop(1, 'rgba(0,0,10,0)'); ctx.fillStyle = hg; ctx.fillRect(0, 0, Wc, HEAD);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f4f7ff'; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
    var title = String(o.title || '').replace(/[*_`#]/g, ''), tf = 26; ctx.font = '700 ' + tf + 'px system-ui, -apple-system, Segoe UI, sans-serif'; while (ctx.measureText(title).width > Wc - 40 && tf > 14) { tf -= 2; ctx.font = '700 ' + tf + 'px system-ui, sans-serif'; }
    ctx.fillText(title, Wc / 2, 38); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(190,205,235,0.85)'; ctx.font = '500 13px system-ui, sans-serif'; ctx.fillText(o.url || 'graphoslearning.netlify.app', Wc / 2, Hc - FOOT / 2 + 4);
    ctx.restore();
    return new Promise(function (res) { cv.toBlob(res, 'image/png'); });
  }
  function shareBlob(blob, name, title) {
    if (!blob) return Promise.resolve(false);
    var file = null; try { file = new File([blob], name, { type: 'image/png' }); } catch (e) { /* ok */ }
    var p = Promise.resolve(false);
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) p = navigator.share({ files: [file], title: title || 'Mapa' }).then(function () { return true; }, function (e) { return e && e.name === 'AbortError' ? true : false; });
    return p.then(function (done) { if (done) return true; var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); return true; });
  }
  function photo() {
    var F = frame(); if (!F.list.length) return;
    var root = F.list.filter(function (o) { return o.lv === 0; })[0], title = (root && root.label) || (document.title || 'Mapa');
    var m = S.mode === 'flat' ? 'flat' : S.mode;
    try { track('map_photo', { mode: m, nodes: F.list.length }); } catch (e) { /* ok */ }
    return snapshot({ mode: m, list: F.list, links: F.links, title: title, scale: 2 }).then(function (b) { return shareBlob(b, 'graphikosmos-' + m + '.png', title); });
  }
  function wirePhoto() {
    var host = document.getElementById('viewMode'); if (!host || document.getElementById('gkPhotoBtn')) return;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'gkPhotoBtn'; b.textContent = EN ? '📸 Photo' : '📸 Foto'; b.title = EN ? 'Save the map as a nice image to post' : 'Guarda el mapa como una imagen bonita para publicar';
    b.className = host.className.replace(/focus:\S+/g, '') + ' cursor-pointer hover:border-[#4fd1c5]'; b.addEventListener('click', function () { b.disabled = true; Promise.resolve(photo()).catch(function (e) { console.error(e); }).then(function () { b.disabled = false; }); });
    host.parentNode.insertBefore(b, host.nextSibling);
  }

  /* ---------- selector «Vista» ---------- */
  // Orden del selector: vistas principales primero (Formas por función, Plana, Bloques 3D, Organismo, Arquitectura) y el resto en «Más vistas».
  var MAIN = ['shapes', 'flat', 'blocks', 'organism', 'impossible'];
  function arrange() {
    if (!sel) return;
    var cur = sel.value, opts = [].slice.call(sel.querySelectorAll('option')), g1 = document.createElement('optgroup'), g2 = document.createElement('optgroup');
    g1.label = EN ? 'Main views' : 'Vistas principales'; g2.label = EN ? 'More views' : 'Más vistas';
    opts.forEach(function (o) { if (o.value === 'city') o.parentNode.removeChild(o); });
    opts = [].slice.call(sel.querySelectorAll('option'));
    MAIN.forEach(function (m) { opts.forEach(function (o) { if (o.value === m) g1.appendChild(o); }); });
    opts.forEach(function (o) { if (MAIN.indexOf(o.value) < 0) g2.appendChild(o); });
    [].slice.call(sel.querySelectorAll('optgroup')).forEach(function (g) { if (g.parentNode) g.parentNode.removeChild(g); });
    sel.appendChild(g1); if (g2.children.length) sel.appendChild(g2); sel.value = cur;
  }
  function wire() {
    sel = document.getElementById('viewMode'); if (!sel) return;
    MODES.forEach(function (m) { if (!sel.querySelector('option[value="' + m + '"]')) { var o = document.createElement('option'); o.value = m; o.textContent = LABELS[m]; sel.appendChild(o); } });
    // en fase de captura para correr antes que el manejador de «Profundidad»
    sel.addEventListener('change', function (e) { var v = e.target.value; if (MODES.indexOf(v) >= 0) set(v, true); else if (S.mode !== 'flat') set('flat', false); }, true);
    wirePhoto(); arrange();
    // por defecto: «Formas por función» (si la persona ya eligió otra vista, se respeta; «Ciudad» ya no existe)
    var saved = 'shapes'; try { saved = localStorage.getItem('gk_view_mode3') || 'shapes'; } catch (e) { /* ok */ }
    if (saved === 'city') saved = 'shapes';
    setTimeout(function () { if (MODES.indexOf(saved) >= 0) set(saved, false); else if (sel) sel.value = 'flat'; arrange(); }, 300);
  }
  function register(name, label, impl) {
    if (!impl || MODES.indexOf(name) >= 0) return; IMPL[name] = impl; MODES.push(name); LABELS[name] = label;
    if (sel && !sel.querySelector('option[value="' + name + '"]')) { var o = document.createElement('option'); o.value = name; o.textContent = label; sel.appendChild(o); arrange(); }
  }
  window.__gkV3 = { register: register, rr: rr, rgba: rgba, hex: hex, mix: mix, lighten: lighten, darken: darken, hash: hash, reduce: reduce, snapshot: snapshot, shareBlob: shareBlob, photo: photo, set: function (m) { set(m, true); }, owns: function (v) { return MODES.indexOf(v) >= 0; }, mode: function () { return S.mode; }, modes: MODES, labels: LABELS, _impl: IMPL };
  if (HAS) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
})();
