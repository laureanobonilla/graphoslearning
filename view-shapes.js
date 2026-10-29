/* view-shapes.js — dos vistas más del mapa, donde cada nodo toma una forma según SU FUNCIÓN (no todos iguales):
 *   «Formas por función»: raíz, categoría, proceso, ejemplo, pregunta, ventaja, riesgo, fecha/cifra, lista, fórmula, definición, concepto…
 *   «Naturaleza»: la misma idea, pero cada función se dibuja como una forma natural (hojas, flores, conchas, piedras, nubes, cristales…);
 *     hay unas 20 familias y varios cientos de variantes, y cada nodo toma siempre la misma (depende de su identidad).
 * Solo cambia el dibujo (detrás del texto); no toca los datos. Necesita /view3d.js. */
(function () {
  'use strict';
  var T = window.__gkV3; if (!T || !T.register) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en');
  var rr = T.rr, rgba = T.rgba, hex = T.hex, mix = T.mix, lighten = T.lighten, darken = T.darken, hash = T.hash;
  var TAU = Math.PI * 2;

  /* ---------- función de cada nodo, deducida de su texto y de su lugar en el árbol ---------- */
  var RX = {
    question: /[?¿]|^(por qu[eé]|qu[eé] es|c[oó]mo funciona|what is|how does|why)\b/i,
    example: /\b(ejemplo|ejemplos|caso pr[aá]ctico|casos|ejemplificaci|example|examples|case study)\b/i,
    benefit: /\b(ventaja|ventajas|beneficio|beneficios|importancia|fortaleza|utilidad|aplicaci[oó]n|aplicaciones|usos?|logro|benefit|benefits|advantage|advantages|strength|importance|applications?)\b/i,
    risk: /\b(problema|problemas|riesgo|riesgos|desventaja|limitaci[oó]n|limitaciones|error|errores|peligro|amenaza|debilidad|consecuencias?|causas?|dificultad|risk|risks|problem|problems|danger|threat|weakness|disadvantage|consequences?|causes?)\b/i,
    process: /\b(proceso|procesos|fase|fases|etapa|etapas|paso|pasos|ciclo|procedimiento|m[eé]todo|funcionamiento|evoluci[oó]n|desarrollo|flujo|process|phase|phases|stage|stages|steps?|cycle|method|procedure|workflow)\b/i,
    list: /\b(tipo|tipos|clase|clases|clasificaci[oó]n|categor[ií]as?|elementos|componentes|partes|caracter[ií]sticas|propiedades|types?|kinds?|classes|categories|components|parts|features|properties)\b/i,
    formula: /\b(f[oó]rmula|f[oó]rmulas|ecuaci[oó]n|ecuaciones|ley|leyes|teorema|principio|principios|equation|formula|law|laws|theorem|principle)\b/i,
    date: /\b(1[0-9]{3}|20[0-9]{2}|siglo|century|a[ñn]os?|fecha)\b|\d\s?%|\b\d+([.,]\d+)?\s?(km|kg|m|g|°c|hz|mph)\b/i,
    definition: /\b(definici[oó]n|concepto|significado|origen|or[ií]genes|historia|definition|concept|meaning|origin|history)\b/i,
    verb: /^[a-zñáéíóú]{3,}(ar|er|ir)\s+\S+/i
  };
  function roleOf(o, nk) {
    var t = String(o.label || '').replace(/[*_`#]/g, '').trim();
    if (o.lv === 0) return 'root';
    if (/^[+−-]\s?\d*\s?[▾▸]?$/.test(t)) return 'bubble';
    if (RX.question.test(t)) return 'question';
    if (RX.example.test(t)) return 'example';
    if (RX.risk.test(t)) return 'risk';
    if (RX.benefit.test(t)) return 'benefit';
    if (RX.formula.test(t)) return 'formula';
    if (RX.process.test(t) || (!nk && RX.verb.test(t) && t.split(/\s+/).length >= 2)) return 'process';
    if (RX.list.test(t)) return 'list';
    if (RX.date.test(t)) return 'date';
    if (RX.definition.test(t)) return 'definition';
    return nk > 0 ? 'category' : 'concept';
  }
  var ROLE_COL = { root: '#4fd1c5', category: '#8b7cf6', process: '#60a5fa', example: '#f2b366', question: '#c084fc', benefit: '#4ade80', risk: '#f87171', date: '#22d3ee', list: '#f472b6', formula: '#fbbf24', definition: '#94a3b8', bubble: '#64748b' };
  var ROLE_GLYPH = { root: '★', category: '▤', process: '➜', example: '✎', question: '?', benefit: '✓', risk: '!', date: '◷', list: '≡', formula: 'ƒ', definition: '“' };
  function roles(F) {
    var nk = new Map(); F.links.forEach(function (L) { nk.set(L.a.id, (nk.get(L.a.id) || 0) + 1); });
    F.list.forEach(function (o) { if (!o.role) o.role = roleOf(o, o.nk != null ? o.nk : (nk.get(o.id) || 0)); });
  }
  function bg(ctx, V, pr, c0, c1) {
    ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0); var g = ctx.createLinearGradient(0, 0, 0, V.H); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
    var v = ctx.createRadialGradient(V.W / 2, V.H / 2, Math.min(V.W, V.H) * 0.35, V.W / 2, V.H / 2, Math.max(V.W, V.H) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,8,0.4)'); ctx.fillStyle = v; ctx.fillRect(0, 0, V.W, V.H); ctx.restore();
  }
  function selected() { try { return new Set((window.network && network.getSelectedNodes ? network.getSelectedNodes() : []).map(String)); } catch (e) { return new Set(); } }

  /* =====================================================================
   *  1) FORMAS POR FUNCIÓN
   * ===================================================================== */
  function pathFor(ctx, role, x, y, w, h) {
    var r = Math.min(12, h / 2), cx = x + w / 2, cy = y + h / 2;
    ctx.beginPath();
    switch (role) {
      case 'root': { var k = h * 0.5; ctx.moveTo(x - k, cy); ctx.lineTo(x + 6, y - 6); ctx.lineTo(x + w - 6, y - 6); ctx.lineTo(x + w + k, cy); ctx.lineTo(x + w - 6, y + h + 6); ctx.lineTo(x + 6, y + h + 6); ctx.closePath(); break; }
      case 'category': { var tw = Math.min(54, w * 0.42), th = 10; ctx.moveTo(x, y + r); ctx.arcTo(x, y, x + 8, y, 8); ctx.lineTo(x + tw - 6, y); ctx.lineTo(x + tw + 4, y - th); ctx.lineTo(x - 0, y - th); ctx.closePath(); ctx.beginPath(); ctx.moveTo(x, y - th + 4); ctx.arcTo(x, y - th, x + 8, y - th, 4); ctx.lineTo(x + tw - 4, y - th); ctx.lineTo(x + tw + 8, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.closePath(); break; }
      case 'process': { var tip = h * 0.45; ctx.moveTo(x - 4, y - 3); ctx.lineTo(x + w - 2, y - 3); ctx.lineTo(x + w + tip, cy); ctx.lineTo(x + w - 2, y + h + 3); ctx.lineTo(x - 4, y + h + 3); ctx.lineTo(x + h * 0.22, cy); ctx.closePath(); break; }
      case 'example': { var f = Math.min(16, h * 0.5); ctx.moveTo(x, y); ctx.lineTo(x + w - f, y); ctx.lineTo(x + w, y + f); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); break; }
      case 'question': { rr(ctx, x, y, w, h, Math.min(18, h / 2)); ctx.moveTo(x + 16, y + h - 1); ctx.lineTo(x + 10, y + h + 11); ctx.lineTo(x + 30, y + h - 1); break; }
      case 'benefit': { var n = Math.min(7, h * 0.22); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, cy - n); ctx.arc(x + w, cy, n, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, cy + n); ctx.arc(x, cy, n, Math.PI / 2, -Math.PI / 2, true); ctx.closePath(); break; }
      case 'risk': { var c = Math.min(h * 0.32, 12); ctx.moveTo(x + c, y - 2); ctx.lineTo(x + w - c, y - 2); ctx.lineTo(x + w + 2, y + c); ctx.lineTo(x + w + 2, y + h - c); ctx.lineTo(x + w - c, y + h + 2); ctx.lineTo(x + c, y + h + 2); ctx.lineTo(x - 2, y + h - c); ctx.lineTo(x - 2, y + c); ctx.closePath(); break; }
      case 'date': { var p = h * 0.4; ctx.moveTo(x - p, cy); ctx.lineTo(x + 4, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + 4, y + h); ctx.closePath(); ctx.moveTo(x - p + 11, cy); ctx.arc(x - p + 9, cy, 2.5, 0, TAU, true); break; }
      case 'formula': { var s = Math.min(14, h * 0.4); ctx.moveTo(x + s, y); ctx.lineTo(x + w + s, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); break; }
      case 'definition': { rr(ctx, x, y, w, h, 6); break; }
      case 'bubble': { ctx.ellipse(cx, cy, w / 2 + 2, h / 2 + 2, 0, 0, TAU); break; }
      case 'list': { rr(ctx, x, y, w, h, 6); break; }
      default: { rr(ctx, x - 2, y - 1, w + 4, h + 2, (h + 2) / 2); }   // concepto: píldora
    }
  }

  var MEANING = {
    es: { root: 'Tema central', category: 'Categoría: agrupa subtemas', process: 'Proceso: paso o etapa', example: 'Ejemplo: caso concreto', question: 'Pregunta: interrogante a resolver', benefit: 'Beneficio: ventaja o resultado', risk: 'Riesgo: problema o advertencia', date: 'Dato: fecha o cifra', list: 'Lista: conjunto de elementos', formula: 'Fórmula: expresión o ley', definition: 'Definición: qué es algo', concept: 'Concepto: idea de apoyo' },
    en: { root: 'Central topic', category: 'Category: groups subtopics', process: 'Process: step or stage', example: 'Example: concrete case', question: 'Question: open issue', benefit: 'Benefit: advantage or result', risk: 'Risk: problem or warning', date: 'Data: date or figure', list: 'List: set of items', formula: 'Formula: expression or law', definition: 'Definition: what it is', concept: 'Concept: supporting idea' }
  };
  var LEG_ORDER = ['root', 'category', 'definition', 'process', 'example', 'question', 'benefit', 'risk', 'date', 'list', 'formula', 'concept'];
  // Leyenda al pie: qué significa cada forma (solo las que aparecen en este mapa). Tamaño constante en pantalla.
  function legend(ctx, F, V) {
    var present = {}; F.list.forEach(function (o) { present[o.role === 'bubble' ? 'concept' : o.role] = 1; });
    var rows = LEG_ORDER.filter(function (r) { return present[r]; }); if (!rows.length) return;
    var L = MEANING[EN ? 'en' : 'es'], cols = rows.length > 6 ? 2 : 1, per = Math.ceil(rows.length / cols), cw = 232, rh = 22, pw = 14 + cols * cw, ph = 12 + per * rh + 6, sc = V.sc || 1;
    ctx.save(); ctx.translate(V.x0 + 14 / sc, V.y1 - (ph + 14) / sc); ctx.scale(1 / sc, 1 / sc);
    rr(ctx, 0, 0, pw, ph, 10); ctx.fillStyle = 'rgba(8,12,26,0.84)'; ctx.fill(); ctx.strokeStyle = 'rgba(140,156,210,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = '500 11.5px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    rows.forEach(function (r, i) {
      var c = Math.floor(i / per), k = i % per, x = 12 + c * cw, y = 10 + k * rh, col = r === 'concept' ? [148, 163, 184] : hex(ROLE_COL[r] || '#64748b');
      ctx.save(); pathFor(ctx, r, x + 4, y + 3, 24, 11); ctx.fillStyle = rgba(darken(col, 0.6), 1); ctx.fill('evenodd'); ctx.strokeStyle = rgba(lighten(col, 0.05), 1); ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
      ctx.fillStyle = 'rgba(226,232,250,0.95)'; ctx.fillText(L[r], x + 40, y + 9);
    });
    ctx.restore();
  }
  var shapes = {
    transparent: true, edges: true, static: true, margin: { top: 14, bottom: 14, left: 26, right: 26 },
    before: function (ctx, F, V, pr) {
      bg(ctx, V, pr, '#0a0f1f', '#10172e'); roles(F); var sel = selected();
      F.list.forEach(function (o) {
        var col = o.role === 'concept' ? o.c.bd : hex(ROLE_COL[o.role] || '#64748b'), x = o.x, y = o.y, w = o.w, h = o.h;
        if (o.role === 'list') { [10, 5].forEach(function (d, i) { ctx.save(); ctx.fillStyle = rgba(darken(col, 0.78), 1 - i * 0.25); ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1.2; rr(ctx, x + d, y + d * 0.7, w, h, 6); ctx.fill(); ctx.stroke(); ctx.restore(); }); }
        ctx.save();
        if (sel.has(o.id)) { ctx.shadowColor = rgba(lighten(col, 0.3), 0.95); ctx.shadowBlur = 22; } else { ctx.shadowColor = rgba(col, 0.28); ctx.shadowBlur = 12; }
        pathFor(ctx, o.role, x, y, w, h);
        var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, rgba(mix(darken(col, 0.62), col, 0.12), 1)); g.addColorStop(1, rgba(darken(col, 0.8), 1));
        ctx.fillStyle = g; ctx.fill('evenodd'); ctx.shadowBlur = 0;
        ctx.strokeStyle = rgba(lighten(col, sel.has(o.id) ? 0.35 : 0.05), 1); ctx.lineWidth = o.lv === 0 ? 2.4 : 1.7; ctx.stroke(); ctx.restore();
        if (o.role === 'example') { var f = Math.min(16, h * 0.5); ctx.save(); ctx.fillStyle = rgba(lighten(col, 0.1), 0.9); ctx.beginPath(); ctx.moveTo(x + w - f, y); ctx.lineTo(x + w - f, y + f); ctx.lineTo(x + w, y + f); ctx.closePath(); ctx.fill(); ctx.restore(); }
        if (o.role === 'definition') { ctx.save(); ctx.strokeStyle = rgba(col, 0.8); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 8, y + 3); ctx.lineTo(x + 8, y + h - 3); ctx.stroke(); ctx.restore(); }
        var gl = ROLE_GLYPH[o.role];
        if (gl && o.w > 40) { var gx = o.role === 'process' ? x + w - 2 : x + w - 1, gy = y - 1; ctx.save(); ctx.fillStyle = rgba(col, 1); ctx.beginPath(); ctx.arc(gx, gy, 8.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#0a0f1f'; ctx.font = '700 11px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(gl, gx, gy + 0.5); ctx.restore(); }
      });
    },
    after: function (ctx, F, V) { legend(ctx, F, V); }
  };

  /* =====================================================================
   *  2) NATURALEZA: familias de formas naturales, cada una con muchas variantes
   *     Una variante = contorno normalizado (polígono en [-1,1]) + decorado. Se estira al tamaño del nodo
   *     buscando el tamaño mínimo en el que el texto cabe dentro.
   * ===================================================================== */
  var SQ = function (a) { return a * a; };
  function polar(N, f) { var pts = []; for (var i = 0; i < N; i++) { var t = i / N * TAU, r = f(t); pts.push([Math.cos(t) * r, Math.sin(t) * r]); } return pts; }
  function seedRnd(seed) { var s = (seed * 9301 + 49297) % 233280; return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
  function inside(pts, px, py) { var c = false; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) { var a = pts[i], b = pts[j]; if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }

  var FAM = {};
  function fam(name, o) { o.name = name; FAM[name] = o; }
  // hojas: 4 anchos × 5 asimetrías × con/sin serrado = 40
  (function () {
    var V = []; [0.78, 0.88, 0.98, 1.08].forEach(function (W) { [-0.35, -0.15, 0, 0.2, 0.35].forEach(function (as) { [0, 1].forEach(function (sr) { V.push({ W: W, as: as, sr: sr }); }); }); });
    fam('leaf', { wide: true, variants: V, cols: ['#4ade80', '#86efac', '#34d399', '#a3e635', '#22c55e'], smooth: true,
      gen: function (p) { var pts = [], N = 40, top = [], bot = []; for (var i = 0; i <= N; i++) { var u = i / N, x = -1 + 2 * u, wv = p.W * Math.pow(Math.sin(Math.PI * Math.pow(u, 1 - p.as * 0.5)), 0.42); if (p.sr && i % 2 && i > 2 && i < N - 2) wv *= 0.9; top.push([x, -wv]); bot.push([x, wv]); } return top.concat(bot.reverse()); },
      deco: function (ctx, g, p, col) { ctx.beginPath(); ctx.moveTo(g.cx - g.a, g.cy); ctx.lineTo(g.cx + g.a * 0.92, g.cy); for (var i = -3; i <= 3; i++) { if (!i) continue; var bx = g.cx + i * g.a * 0.22; ctx.moveTo(bx, g.cy); ctx.lineTo(bx + g.a * 0.16, g.cy - g.b * 0.5); ctx.moveTo(bx, g.cy); ctx.lineTo(bx + g.a * 0.16, g.cy + g.b * 0.5); } ctx.stroke(); } });
  })();
  // flores/rosetas: 8 números de pétalos × 3 profundidades × 2 (redondo/puntiagudo) = 48
  (function () {
    var V = []; for (var k = 5; k <= 12; k++) [0.1, 0.2, 0.3].forEach(function (d) { [0, 1].forEach(function (pt) { V.push({ k: k, d: d, pt: pt }); }); });
    fam('flower', { variants: V, cols: ['#f472b6', '#fb7185', '#fbbf24', '#c084fc', '#f9a8d4', '#fdba74'], smooth: true,
      gen: function (p) { return polar(120, function (t) { var c = Math.cos(p.k * t); return (1 - p.d) + p.d * (p.pt ? Math.pow(Math.abs(c), 0.6) * (c < 0 ? -0.2 : 1) : c); }).map(function (q) { return [q[0] * 1.05, q[1] * 1.05]; }); },
      deco: function (ctx, g, p, col) { ctx.beginPath(); ctx.ellipse(g.cx, g.cy, g.a * 0.18, g.b * 0.22, 0, 0, TAU); ctx.stroke(); for (var i = 0; i < p.k; i++) { var t = i / p.k * TAU + Math.PI / p.k; ctx.moveTo(g.cx + Math.cos(t) * g.a * 0.5, g.cy + Math.sin(t) * g.b * 0.5); ctx.lineTo(g.cx + Math.cos(t) * g.a * 0.7, g.cy + Math.sin(t) * g.b * 0.7); } ctx.stroke(); } });
  })();
  // conchas en abanico: 7 estrías × 2 profundidades = 14
  (function () {
    var V = []; for (var k = 7; k <= 13; k++) [0.05, 0.1].forEach(function (d) { V.push({ k: k, d: d }); });
    fam('shell', { wide: true, variants: V, cols: ['#fdba74', '#fca5a5', '#fcd34d', '#fda4af', '#e7c9a9'], smooth: true,
      gen: function (p) { var pts = [[-0.62, 0.85], [0.62, 0.85]]; for (var i = 0; i <= 80; i++) { var t = Math.PI * (i / 80), r = 1 - p.d + p.d * Math.abs(Math.cos(p.k * t / 2)); pts.push([Math.cos(t) * r * 1.0, 0.85 - Math.sin(t) * r * 1.7]); } return pts.map(function (q) { return [q[0], q[1]]; }); },
      deco: function (ctx, g, p) { ctx.beginPath(); for (var i = 1; i < p.k; i++) { var t = Math.PI * i / p.k; ctx.moveTo(g.cx + g.a * 0.62 * Math.cos(Math.PI) * 0, g.cy + g.b * 0.85); ctx.lineTo(g.cx + Math.cos(t) * g.a * 0.92, g.cy + g.b * 0.85 - Math.sin(t) * g.b * 1.6); } ctx.stroke(); } });
  })();
  // piedras: 40 semillas
  (function () {
    var V = []; for (var s = 1; s <= 40; s++) V.push({ s: s });
    fam('pebble', { variants: V, cols: ['#a8a29e', '#94a3b8', '#a1887f', '#9ca3af', '#bfa89e', '#8e9aaf'], smooth: true,
      gen: function (p) { var r = seedRnd(p.s), a = [r() * 0.09, r() * 0.07, r() * 0.05], ph = [r() * 6, r() * 6, r() * 6]; return polar(60, function (t) { return 0.96 + a[0] * Math.cos(2 * t + ph[0]) + a[1] * Math.cos(3 * t + ph[1]) + a[2] * Math.cos(5 * t + ph[2]); }); },
      deco: function (ctx, g, p) { var r = seedRnd(p.s * 7); ctx.beginPath(); for (var i = 0; i < 7; i++) { var x = g.cx + (r() - 0.5) * g.a * 1.5, y = g.cy + (r() - 0.5) * g.b * 1.4; ctx.moveTo(x + 1.6, y); ctx.arc(x, y, 1.6, 0, TAU); } ctx.fill(); } });
  })();
  // nubes: 6 lóbulos × 2 = 12
  (function () {
    var V = []; for (var k = 5; k <= 10; k++) [0.12, 0.2].forEach(function (d) { V.push({ k: k, d: d }); });
    fam('cloud', { wide: true, variants: V, cols: ['#93c5fd', '#a5b4fc', '#bae6fd', '#c7d2fe'], smooth: true,
      gen: function (p) { return polar(120, function (t) { return 1 - p.d + p.d * Math.pow(Math.abs(Math.sin(p.k * t / 2)), 0.55); }); },
      deco: function (ctx, g) { ctx.beginPath(); ctx.arc(g.cx - g.a * 0.5, g.cy + g.b * 0.5, g.b * 0.12, 0, TAU); ctx.arc(g.cx + g.a * 0.55, g.cy - g.b * 0.45, g.b * 0.09, 0, TAU); ctx.fill(); } });
  })();
  // gotas horizontales: 3 agudezas × 2 sentidos = 6
  (function () {
    var V = []; [1.4, 2, 2.8].forEach(function (k) { [1, -1].forEach(function (d) { V.push({ k: k, d: d }); }); });
    fam('drop', { wide: true, variants: V, cols: ['#38bdf8', '#22d3ee', '#60a5fa', '#2dd4bf'], smooth: true,
      gen: function (p) { return polar(80, function (t) { var c = Math.cos(t) * p.d; return 0.9 + (c > 0 ? 0.55 * Math.pow(c, p.k) : 0) - 0.05 * Math.abs(Math.sin(t)); }); },
      deco: function (ctx, g, p) { ctx.beginPath(); ctx.ellipse(g.cx - p.d * g.a * 0.35, g.cy - g.b * 0.35, g.a * 0.08, g.b * 0.14, 0.5, 0, TAU); ctx.fill(); } });
  })();
  // cristales: 20 semillas (5–9 caras irregulares)
  (function () {
    var V = []; for (var s = 1; s <= 20; s++) V.push({ s: s, n: 5 + (s % 5) });
    fam('crystal', { variants: V, cols: ['#a78bfa', '#818cf8', '#67e8f9', '#f0abfc', '#c4b5fd'], smooth: false,
      gen: function (p) { var r = seedRnd(p.s); var pts = []; for (var i = 0; i < p.n * 2; i++) { var t = i / (p.n * 2) * TAU, rad = i % 2 ? 0.8 + r() * 0.14 : 1.0; pts.push([Math.cos(t) * rad, Math.sin(t) * rad]); } return pts; },
      deco: function (ctx, g, p, col, pts) { ctx.beginPath(); for (var i = 0; i < pts.length; i += 2) { ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx + pts[i][0] * g.a, g.cy + pts[i][1] * g.b); } ctx.stroke(); } });
  })();
  // hongos: 4 alturas × 3 lunares = 12
  (function () {
    var V = []; [1.0, 1.15, 1.3, 1.45].forEach(function (hh) { [2, 3, 4].forEach(function (sp) { V.push({ h: hh, sp: sp }); }); });
    fam('mushroom', { variants: V, cols: ['#fb7185', '#f97316', '#e879f9', '#fbbf24'], smooth: true,
      gen: function (p) { var pts = []; for (var i = 0; i <= 60; i++) { var t = Math.PI * (1 - i / 60); pts.push([Math.cos(t), 0.5 - Math.sin(t) * p.h * 1.1]); } pts.push([0.55, 0.62], [0.2, 0.7], [-0.2, 0.7], [-0.55, 0.62]); return pts; },
      deco: function (ctx, g, p) { var r = seedRnd(p.sp * 13 + Math.round(p.h * 10)); ctx.beginPath(); for (var i = 0; i < p.sp + 2; i++) { var x = g.cx + (r() - 0.5) * g.a * 1.3, y = g.cy - g.b * (0.1 + r() * 0.5); ctx.moveTo(x + 2.4, y); ctx.arc(x, y, 2.4, 0, TAU); } ctx.fill(); } });
  })();
  // estrellas de mar: 4 brazos × 3 agudezas = 12
  (function () {
    var V = []; [5, 6, 7, 8].forEach(function (k) { [0.18, 0.26, 0.34].forEach(function (d) { V.push({ k: k, d: d }); }); });
    fam('star', { variants: V, cols: ['#fb923c', '#fdba74', '#f87171', '#fcd34d'], smooth: true,
      gen: function (p) { return polar(120, function (t) { return 1 - p.d + p.d * Math.pow(Math.abs(Math.cos(p.k * t / 2)), 1.6); }); },
      deco: function (ctx, g, p) { ctx.beginPath(); for (var i = 0; i < p.k; i++) { var t = i / p.k * TAU; ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx + Math.cos(t) * g.a * 0.7, g.cy + Math.sin(t) * g.b * 0.7); } ctx.stroke(); } });
  })();
  // soles: 4 números de rayos × 2 = 8
  (function () {
    var V = []; [12, 16, 20, 24].forEach(function (k) { [0, 1].forEach(function (sh) { V.push({ k: k, sh: sh }); }); });
    fam('sun', { variants: V, cols: ['#fbbf24', '#fcd34d', '#fb923c', '#facc15'], smooth: false,
      gen: function (p) { var pts = []; for (var i = 0; i < p.k * 2; i++) { var t = i / (p.k * 2) * TAU; pts.push([Math.cos(t) * (i % 2 ? 0.82 : 1.0), Math.sin(t) * (i % 2 ? 0.82 : 1.0)]); } return pts; },
      deco: function () { } });
  })();
  // vainas: 4 bultos × 2 = 8
  (function () {
    var V = []; for (var k = 3; k <= 6; k++) [0.12, 0.2].forEach(function (d) { V.push({ k: k, d: d }); });
    fam('pod', { wide: true, variants: V, cols: ['#84cc16', '#a3e635', '#4ade80', '#bef264'], smooth: true,
      gen: function (p) { var pts = [], N = 70; for (var i = 0; i <= N; i++) { var u = i / N, x = -1 + 2 * u, w = (0.85 + p.d * Math.cos(p.k * Math.PI * u * 2)) * Math.pow(Math.sin(Math.PI * Math.min(0.5 + Math.abs(u - 0.5) * 0 + 0.0, 1) * 1), 0.0) * (1 - Math.pow(Math.abs(x), 6) * 0.5); pts.push([x, -w * 0.9]); } for (var j = N; j >= 0; j--) { var u2 = j / N, x2 = -1 + 2 * u2, w2 = (0.85 + p.d * Math.cos(p.k * Math.PI * u2 * 2)) * (1 - Math.pow(Math.abs(x2), 6) * 0.5); pts.push([x2, w2 * 0.9]); } return pts; },
      deco: function (ctx, g, p) { ctx.beginPath(); for (var i = 0; i < p.k; i++) { var x = g.cx + (-0.7 + 1.4 * (i + 0.5) / p.k) * g.a; ctx.moveTo(x + g.b * 0.14, g.cy); ctx.arc(x, g.cy, g.b * 0.14, 0, TAU); } ctx.stroke(); } });
  })();
  // frutas: 3 hoyuelos × 2 formas = 6
  (function () {
    var V = []; [0.08, 0.14, 0.2].forEach(function (d) { [0, 1].forEach(function (lb) { V.push({ d: d, lb: lb }); }); });
    fam('fruit', { variants: V, cols: ['#ef4444', '#f87171', '#fb923c', '#a3e635', '#f43f5e'], smooth: true,
      gen: function (p) { return polar(100, function (t) { var top = Math.max(0, -Math.sin(t)) * Math.max(0, Math.cos(t * 2 - Math.PI * 0)) * 0; return 1 - p.d * Math.exp(-SQ(Math.sin(t + Math.PI / 2) * 5.5)) * (Math.sin(t) < 0 ? 1 : 0) + (p.lb ? 0.05 * Math.cos(2 * t) : 0) + top; }); },
      deco: function (ctx, g) { ctx.beginPath(); ctx.moveTo(g.cx, g.cy - g.b * 0.86); ctx.quadraticCurveTo(g.cx + g.a * 0.04, g.cy - g.b * 1.12, g.cx + g.a * 0.1, g.cy - g.b * 1.18); ctx.stroke(); ctx.beginPath(); ctx.ellipse(g.cx + g.a * 0.22, g.cy - g.b * 1.02, g.a * 0.13, g.b * 0.12, -0.5, 0, TAU); ctx.fill(); } });
  })();
  // huevos: 4 asimetrías × 4 pecas = 16
  (function () {
    var V = []; [0.06, 0.12, 0.18, 0.24].forEach(function (as) { [1, 2, 3, 4].forEach(function (s) { V.push({ as: as, s: s }); }); });
    fam('egg', { variants: V, cols: ['#fde68a', '#fcd5b5', '#d9f99d', '#bae6fd', '#fbcfe8'], smooth: true,
      gen: function (p) { return polar(80, function (t) { return 1 - p.as * 0.5 * (1 + Math.cos(t)) * 0.5 * 1 + 0.0; }); },
      deco: function (ctx, g, p) { var r = seedRnd(p.s * 31); ctx.beginPath(); for (var i = 0; i < 9; i++) { var x = g.cx + (r() - 0.5) * g.a * 1.4, y = g.cy + (r() - 0.5) * g.b * 1.2; ctx.moveTo(x + 1.5, y); ctx.arc(x, y, 1.5, 0, TAU); } ctx.fill(); } });
  })();
  // panal: 3
  fam('hex', { variants: [{ k: 0.9 }, { k: 0.95 }, { k: 1 }], cols: ['#fbbf24', '#f59e0b', '#fcd34d'], smooth: false,
    gen: function (p) { return polar(6, function () { return p.k; }).map(function (q) { return [q[0] * 1.05, q[1] * 1.05]; }); },
    deco: function (ctx, g) { ctx.beginPath(); for (var i = 0; i < 6; i++) { var t = i / 6 * TAU; var x = g.cx + Math.cos(t) * g.a * 0.72, y = g.cy + Math.sin(t) * g.b * 0.72; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); ctx.stroke(); } });
  // dunas / olas: 3 amplitudes × 3 ondas = 9
  (function () {
    var V = []; [0.08, 0.14, 0.2].forEach(function (a) { [2, 3, 4].forEach(function (w) { V.push({ a: a, w: w }); }); });
    fam('dune', { wide: true, variants: V, cols: ['#38bdf8', '#2dd4bf', '#fcd34d', '#fdba74'], smooth: true,
      gen: function (p) { var pts = []; for (var i = 0; i <= 50; i++) { var u = i / 50, x = -1 + 2 * u; pts.push([x, -0.75 + p.a * Math.sin(p.w * Math.PI * u * 2) - Math.pow(Math.abs(x), 8) * 0.15]); } pts.push([1, 0.9], [-1, 0.9]); return pts; },
      deco: function (ctx, g, p) { ctx.beginPath(); for (var l = 0; l < 2; l++) { for (var i = 0; i <= 40; i++) { var u = i / 40, x = g.cx + (-0.9 + 1.8 * u) * g.a, y = g.cy + g.b * (0.25 + l * 0.38) + Math.sin(p.w * Math.PI * u * 2 + l) * g.b * 0.1; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } } ctx.stroke(); } });
  })();
  // abrojos (espinas): 8
  (function () {
    var V = []; for (var k = 9; k <= 16; k++) V.push({ k: k });
    fam('burst', { variants: V, cols: ['#f87171', '#fb7185', '#f97316', '#ef4444'], smooth: false,
      gen: function (p) { var pts = []; for (var i = 0; i < p.k * 2; i++) { var t = i / (p.k * 2) * TAU; pts.push([Math.cos(t) * (i % 2 ? 0.7 : 1.0), Math.sin(t) * (i % 2 ? 0.7 : 1.0)]); } return pts; }, deco: function () { } });
  })();
  // escarcha: 3 ramas
  (function () {
    var V = [{ k: 6, d: 0.3 }, { k: 6, d: 0.42 }, { k: 8, d: 0.34 }];
    fam('frost', { variants: V, cols: ['#a5f3fc', '#bae6fd', '#c7d2fe'], smooth: false,
      gen: function (p) { return polar(p.k * 4, function (t) { var u = (t * p.k / TAU) % 1; return 1 - p.d * Math.abs(Math.sin(u * Math.PI * 2)) * 0.9 - (Math.abs(u - 0.5) < 0.02 ? 0 : 0); }); },
      deco: function (ctx, g, p) { ctx.beginPath(); for (var i = 0; i < p.k; i++) { var t = i / p.k * TAU; ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.cx + Math.cos(t) * g.a * 0.85, g.cy + Math.sin(t) * g.b * 0.85); } ctx.stroke(); } });
  })();
  // mariposas: 6
  (function () {
    var V = []; [0.5, 0.6, 0.7].forEach(function (a) { [0, 1].forEach(function (b) { V.push({ a: a, b: b }); }); });
    fam('butterfly', { wide: true, variants: V, cols: ['#f472b6', '#fb923c', '#60a5fa', '#c084fc', '#facc15'], smooth: true,
      gen: function (p) { return polar(120, function (t) { return 0.62 + 0.38 * Math.abs(Math.sin(2 * t)) * (1 - 0.15 * p.b * Math.cos(t)) + 0.0 * p.a; }); },
      deco: function (ctx, g) { ctx.beginPath(); ctx.moveTo(g.cx, g.cy - g.b * 0.5); ctx.lineTo(g.cx, g.cy + g.b * 0.5); ctx.stroke(); } });
  })();
  // plumas: 8
  (function () {
    var V = []; [0.8, 0.9, 1, 1.1].forEach(function (W) { [0, 1].forEach(function (n) { V.push({ W: W, n: n }); }); });
    fam('feather', { wide: true, variants: V, cols: ['#e2e8f0', '#fbcfe8', '#bfdbfe', '#fde68a'], smooth: false,
      gen: function (p) { var top = [], bot = [], N = 28; for (var i = 0; i <= N; i++) { var u = i / N, x = -1 + 2 * u, w = p.W * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.4) * (i % 2 ? 0.93 : 1); top.push([x, -w]); bot.push([x, w]); } return top.concat(bot.reverse()); },
      deco: function (ctx, g) { ctx.beginPath(); ctx.moveTo(g.cx - g.a, g.cy); ctx.lineTo(g.cx + g.a * 0.95, g.cy); for (var i = -4; i <= 4; i++) { if (!i) continue; var x = g.cx + i * g.a * 0.18; ctx.moveTo(x, g.cy); ctx.lineTo(x + g.a * 0.12, g.cy - g.b * 0.55); ctx.moveTo(x, g.cy); ctx.lineTo(x + g.a * 0.12, g.cy + g.b * 0.55); } ctx.stroke(); } });
  })();

  var NAMES = Object.keys(FAM);
  var CACHE = {};
  // se descartan las variantes que quedarían demasiado grandes para el texto que contienen
  NAMES.forEach(function (n) { var F = FAM[n], keep = []; F.variants.forEach(function (v, i) { var r = prep(n, i); if (r.cost <= 3.2) keep.push(v); }); F.variants = keep; });
  CACHE = {};
  var TOTAL = NAMES.reduce(function (s, n) { return s + FAM[n].variants.length; }, 0);
  var ROLE_FAMS = {
    root: ['sun', 'flower'], category: ['leaf', 'feather'], process: ['dune', 'drop', 'pod'], example: ['flower', 'butterfly', 'fruit'], question: ['cloud', 'mushroom'],
    benefit: ['fruit', 'flower', 'egg'], risk: ['burst', 'frost', 'star'], date: ['pebble', 'egg'], list: ['hex', 'shell', 'pod'], formula: ['crystal', 'frost'],
    definition: ['shell', 'egg', 'mushroom'], bubble: ['pebble'], concept: ['leaf', 'pebble', 'cloud', 'shell', 'star', 'egg', 'drop', 'crystal', 'flower', 'mushroom', 'dune', 'butterfly']
  };
  function prep(famName, vi) {   // contorno + mejor estiramiento (kx, ky) para que un rectángulo de texto quepa dentro
    var key = famName + '#' + vi; if (CACHE[key]) return CACHE[key];
    var F = FAM[famName], p = F.variants[vi], pts = F.gen(p), best = null;
    var mnx = 9, mxx = -9, mny = 9, mxy = -9; pts.forEach(function (q) { mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]); mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]); });
    var ccx = (mnx + mxx) / 2, ccy = (mny + mxy) / 2; pts = pts.map(function (q) { return [q[0] - ccx, q[1] - ccy]; });
    for (var kx = 1.05; kx <= 2.4; kx += 0.05) for (var ky = 1.05; ky <= 2.8; ky += 0.05) {
      var cx = 0.9 / kx, cy = 0.9 / ky;
      if (inside(pts, cx, cy) && inside(pts, -cx, cy) && inside(pts, cx, -cy) && inside(pts, -cx, -cy)) { var cost = kx * ky; if (!best || cost < best.cost) best = { kx: kx, ky: ky, cost: cost }; }
    }
    if (!best) best = { kx: 1.9, ky: 2.3, cost: 9 };
    return (CACHE[key] = { pts: pts, kx: best.kx, ky: best.ky, cost: best.cost, p: p, F: F });
  }
  function pick(role, id) {
    var fams = ROLE_FAMS[role] || ROLE_FAMS.concept, fn = fams[Math.floor(hash(id + 'f') * fams.length) % fams.length], F = FAM[fn], vi = Math.floor(hash(id + 'v') * F.variants.length) % F.variants.length;
    return { fam: fn, vi: vi };
  }
  function smoothPath(ctx, P, smooth) {
    ctx.beginPath(); var n = P.length;
    if (!smooth) { ctx.moveTo(P[0][0], P[0][1]); for (var i = 1; i < n; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); return; }
    ctx.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2);
    for (var j = 0; j < n; j++) { var a = P[j], b = P[(j + 1) % n]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    ctx.closePath();
  }
  var nature = {
    transparent: true, edges: true, static: true, margin: { top: 16, bottom: 16, left: 30, right: 30 },
    count: TOTAL, families: NAMES.length,
    before: function (ctx, F, V, pr) {
      bg(ctx, V, pr, '#071510', '#0d2318'); roles(F); var sel = selected();
      F.list.forEach(function (o) {
        var ch = pick(o.role, o.id), S = prep(ch.fam, ch.vi), fm = S.F, cols = fm.cols, base = hex(cols[Math.floor(hash(o.id + 'c') * cols.length) % cols.length]);
        var g = { cx: o.cx, cy: o.cy, a: Math.max(24, o.w / 2) * S.kx, b: Math.max(14, o.h / 2) * S.ky };
        var maxR = fm.wide ? 4.2 : 2.2; if (g.a / g.b > maxR) g.b = Math.min(g.a / maxR, 62);   // las formas redondas no se aplastan: crecen en alto para seguir reconociéndose
        var P = S.pts.map(function (q) { return [g.cx + q[0] * g.a, g.cy + q[1] * g.b]; });
        var rot = o.role === 'process' || fm.name === 'drop' ? 0 : 0;   // sin giro: el texto va recto
        ctx.save();
        if (sel.has(o.id)) { ctx.shadowColor = rgba(lighten(base, 0.3), 0.95); ctx.shadowBlur = 22; } else { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3; }
        smoothPath(ctx, P, fm.smooth);
        var grd = ctx.createRadialGradient(g.cx - g.a * 0.3, g.cy - g.b * 0.4, 2, g.cx, g.cy, Math.max(g.a, g.b));
        grd.addColorStop(0, rgba(mix(darken(base, 0.5), base, 0.2), 1)); grd.addColorStop(1, rgba(darken(base, 0.78), 1));
        ctx.fillStyle = grd; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = rgba(lighten(base, sel.has(o.id) ? 0.3 : 0.02), 0.95); ctx.lineWidth = o.lv === 0 ? 2.4 : 1.7; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.save(); smoothPath(ctx, P, fm.smooth); ctx.clip(); ctx.strokeStyle = rgba(base, 0.28); ctx.fillStyle = rgba(base, 0.3); ctx.lineWidth = 1.1;
        try { fm.deco(ctx, g, S.p, base, P.map(function (q) { return [(q[0] - g.cx) / g.a, (q[1] - g.cy) / g.b]; })); } catch (e) { /* deco opcional */ }
        ctx.restore(); ctx.restore();
        if (o.role === 'fruit' || fm.name === 'fruit') { ctx.save(); ctx.strokeStyle = rgba(hex('#65a30d'), 0.9); ctx.fillStyle = rgba(hex('#65a30d'), 0.9); try { fm.deco(ctx, g, S.p, base, null); } catch (e) { /* ok */ } ctx.restore(); }
      });
    },
    after: function () { }
  };

  T.register('shapes', EN ? '🔷 Shapes by function' : '🔷 Formas por función', shapes);
  T.register('nature', EN ? '🍃 Nature' : '🍃 Naturaleza', nature);
  window.__gkShapes = { roleOf: roleOf, total: TOTAL, families: NAMES.length, names: NAMES, prep: prep };
})();
