/* view-personality.js — vista «Tipología funcional»: cada función del nodo tiene su pieza y su trazo.
 * Cada nodo se vuelve la pieza de papelería que mejor hace su trabajo de estudio (definición → ficha, ejemplo → nota adhesiva,
 * pregunta → globo de flashcard, proceso → banda de pasos numerados, riesgo → cinta de precaución, beneficio → sello, fecha → hoja de
 * calendario, lista → portapapeles, fórmula → bloque cuadriculado, categoría → pestaña de archivador, raíz → portada).
 * Cada relación tiene su trazo según lo que lleva (hilo con chincheta, flecha de secuencia, zigzag de alerta, subrayador, regla de
 * tiempo…). El fondo toma la personalidad del mapa según sus funciones dominantes (cuaderno, plano, pizarra o papel kraft) y una
 * leyenda explica qué significa cada pieza (qué función representa). Solo dibuja detrás del texto. Necesita /view3d.js, /view-shapes.js y /view-artkit.js. */
(function () {
  'use strict';
  var T = window.__gkV3, K = window.__gkKit; if (!T || !T.register || !K) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en'), rgba = T.rgba, hash = T.hash, mix = T.mix, lighten = T.lighten, darken = T.darken, TAU = Math.PI * 2;
  var BODY = { root: [26, 32, 62], category: [38, 62, 112], definition: [44, 48, 66], example: [120, 94, 26], question: [66, 42, 104], process: [28, 68, 124], benefit: [26, 92, 64], risk: [58, 26, 26], date: [44, 54, 74], list: [40, 66, 66], formula: [22, 40, 84], concept: [54, 58, 68], bubble: [54, 58, 68] };
  var ACC = { root: [212, 176, 90], category: [140, 176, 240], definition: [224, 84, 84], example: [255, 214, 90], question: [190, 150, 255], process: [110, 190, 255], benefit: [100, 220, 150], risk: [255, 200, 40], date: [230, 90, 90], list: [150, 220, 210], formula: [150, 190, 255], concept: [190, 196, 210], bubble: [190, 196, 210] };
  var MEANING = {
    es: { root: 'Tema central', category: 'Categoría: agrupa subtemas', definition: 'Definición: qué es algo', example: 'Ejemplo: caso concreto', question: 'Pregunta: interrogante a resolver', process: 'Proceso: paso o etapa (numerado)', benefit: 'Beneficio: ventaja o resultado', risk: 'Riesgo: problema o advertencia', date: 'Dato: fecha o cifra', list: 'Lista: conjunto de elementos', formula: 'Fórmula: expresión o ley', concept: 'Concepto: idea de apoyo' },
    en: { root: 'Central topic', category: 'Category: groups subtopics', definition: 'Definition: what it is', example: 'Example: concrete case', question: 'Question: open issue', process: 'Process: step or stage (numbered)', benefit: 'Benefit: advantage or result', risk: 'Risk: problem or warning', date: 'Data: date or figure', list: 'List: set of items', formula: 'Formula: expression or law', concept: 'Concept: supporting idea' }
  };
  var TONES = { notebook: { bg: [246, 242, 230], ink: [38, 42, 60], line: [150, 180, 215], dark: false, name: ['Cuaderno', 'Notebook'] }, blueprint: { bg: [22, 54, 104], ink: [226, 238, 255], line: [96, 140, 205], dark: true, name: ['Plano', 'Blueprint'] }, chalk: { bg: [30, 54, 48], ink: [238, 240, 228], line: [80, 112, 100], dark: true, name: ['Pizarra', 'Chalkboard'] }, kraft: { bg: [200, 164, 124], ink: [48, 36, 28], line: [160, 126, 90], dark: false, name: ['Papel kraft', 'Kraft paper'] } };
  function toneOf(F) {
    var c = {}; F.list.forEach(function (o) { c[o.role] = (c[o.role] || 0) + 1; });
    var sc = { blueprint: (c.process || 0) + (c.formula || 0) + (c.date || 0) * 0.6, chalk: (c.question || 0) + (c.definition || 0) + (c.list || 0) * 0.6, kraft: (c.example || 0) + (c.benefit || 0) + (c.risk || 0) * 0.4, notebook: ((c.category || 0) + (c.concept || 0) + (c.bubble || 0)) * 0.75 + 0.5 }, best = 'notebook';
    Object.keys(sc).forEach(function (k) { if (sc[k] > sc[best]) best = k; }); return best;
  }
  function rrect(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function dot(ctx, x, y, r, col) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); }

  function background(ctx, F, V, pr, tone) {
    var t = TONES[tone];
    K.screen(ctx, V, pr, function () { ctx.fillStyle = rgba(t.bg, 1); ctx.fillRect(0, 0, V.W, V.H); });
    ctx.save(); ctx.lineWidth = 1;
    var s = tone === 'blueprint' ? 32 : 28, x, y, x0 = Math.floor(V.x0 / s) * s, y0 = Math.floor(V.y0 / s) * s;
    ctx.strokeStyle = rgba(t.line, tone === 'kraft' ? 0.18 : tone === 'chalk' ? 0.2 : 0.4);
    if (tone === 'notebook' || tone === 'blueprint') { ctx.beginPath(); for (x = x0; x < V.x1; x += s) { ctx.moveTo(x, V.y0); ctx.lineTo(x, V.y1); } for (y = y0; y < V.y1; y += s) { ctx.moveTo(V.x0, y); ctx.lineTo(V.x1, y); } ctx.stroke(); }
    if (tone === 'blueprint') { ctx.strokeStyle = rgba(t.line, 0.7); ctx.beginPath(); for (x = Math.floor(V.x0 / (s * 5)) * s * 5; x < V.x1; x += s * 5) { ctx.moveTo(x, V.y0); ctx.lineTo(x, V.y1); } for (y = Math.floor(V.y0 / (s * 5)) * s * 5; y < V.y1; y += s * 5) { ctx.moveTo(V.x0, y); ctx.lineTo(V.x1, y); } ctx.stroke(); }
    if (tone === 'notebook') { var mx = Math.floor((V.x0 + 60) / (s * 7)) * s * 7; ctx.strokeStyle = 'rgba(214,80,80,0.55)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(mx, V.y0); ctx.lineTo(mx, V.y1); ctx.stroke(); }
    if (tone === 'chalk') { ctx.fillStyle = 'rgba(255,255,255,0.05)'; for (var i = 0; i < 26; i++) { var cx = V.x0 + hash('cx' + i) * (V.x1 - V.x0), cy = V.y0 + hash('cy' + i) * (V.y1 - V.y0); ctx.beginPath(); ctx.ellipse(cx, cy, 80 + hash('cr' + i) * 160, 14 + hash('cs' + i) * 30, hash('ca' + i) * 3, 0, TAU); ctx.fill(); } }
    if (tone === 'kraft') { ctx.strokeStyle = 'rgba(90,60,30,0.14)'; ctx.lineWidth = 1; for (i = 0; i < 260; i++) { var fx = V.x0 + hash('fx' + i) * (V.x1 - V.x0), fy = V.y0 + hash('fy' + i) * (V.y1 - V.y0), fl = 10 + hash('fl' + i) * 26, fa = (hash('fa' + i) - 0.5) * 0.8; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl); ctx.stroke(); } }
    ctx.restore();
  }

  function sticker(ctx, o, idx, sel, tone) {
    var role = o.role, id = o.id, b = BODY[role] || BODY.concept, a = ACC[role] || ACC.concept, x = o.x - 8, y = o.y - 5, w = o.w + 16, h = o.h + 10, i;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3; ctx.shadowBlur = 0;
    var edge = rgba(a, 0.95), fill = rgba(b, 1);
    if (role === 'root') {
      rrect(ctx, x - 12, y - 4, w + 24, h + 8, 12); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 3; ctx.strokeStyle = edge; ctx.stroke(); rrect(ctx, x - 6, y + 2, w + 12, h - 4, 8); ctx.lineWidth = 1; ctx.strokeStyle = rgba(a, 0.5); ctx.stroke();
      for (i = 0; i < 3; i++) dot(ctx, x - 12 + 1, y + 6 + i * ((h - 4) / 2.4), 3.2, rgba(a, 0.9));
    } else if (role === 'category') {
      var tw = Math.min(w * 0.45, 90); ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x + 8, y); ctx.lineTo(x + tw, y); ctx.lineTo(x + tw + 10, y + 10); ctx.lineTo(x + w, y + 10); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 2; ctx.strokeStyle = edge; ctx.stroke(); ctx.fillStyle = rgba(a, 0.35); ctx.fillRect(x + 3, y + 10, w - 6, 3);
    } else if (role === 'definition') {
      rrect(ctx, x, y, w, h, 4); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(a, 0.55); ctx.stroke(); ctx.fillStyle = rgba(a, 0.95); ctx.fillRect(x, y + 6, w, 2.2); ctx.strokeStyle = rgba([180, 200, 240], 0.2); ctx.lineWidth = 1; for (var yy = y + 14; yy < y + h - 3; yy += 7) { ctx.beginPath(); ctx.moveTo(x + 4, yy); ctx.lineTo(x + w - 4, yy); ctx.stroke(); }
    } else if (role === 'example') {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - 14); ctx.lineTo(x + w - 14, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(a, 0.55); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w, y + h - 14); ctx.lineTo(x + w - 14, y + h); ctx.lineTo(x + w - 14, y + h - 14); ctx.closePath(); ctx.fillStyle = rgba(lighten(b, 0.25), 1); ctx.fill(); dot(ctx, x + w / 2, y + 1, 4.2, 'rgba(214,60,60,1)'); dot(ctx, x + w / 2 - 1.2, y - 0.2, 1.3, 'rgba(255,255,255,0.8)');
    } else if (role === 'question') {
      ctx.beginPath(); rrect(ctx, x, y, w, h - 4, 16); ctx.fillStyle = fill; ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 18, y + h - 6); ctx.lineTo(x + 10, y + h + 8); ctx.lineTo(x + 32, y + h - 6); ctx.closePath(); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.setLineDash([5, 3]); ctx.lineWidth = 1.6; ctx.strokeStyle = edge; rrect(ctx, x + 3, y + 3, w - 6, h - 10, 13); ctx.stroke(); ctx.setLineDash([]);
      dot(ctx, x + 2, y + 2, 9, rgba(a, 1)); ctx.fillStyle = 'rgba(30,20,60,1)'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', x + 2, y + 3);
    } else if (role === 'process') {
      var pt = Math.min(18, h * 0.5); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w - pt, y); ctx.lineTo(x + w + 4, y + h / 2); ctx.lineTo(x + w - pt, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 2; ctx.strokeStyle = edge; ctx.stroke();
      dot(ctx, x - 2, y + h / 2, 11, rgba(a, 1)); ctx.fillStyle = 'rgba(10,30,60,1)'; ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(idx + 1), x - 2, y + h / 2 + 0.5);
    } else if (role === 'benefit') {
      var n = Math.max(10, Math.round(w / 12)); ctx.beginPath(); for (i = 0; i < n; i++) { var u = i / n; ctx.moveTo(x + w * u + 6, y); ctx.arc(x + w * (u + 0.5 / n), y, 0.001, 0, TAU); } rrect(ctx, x, y, w, h, 10); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 2.4; ctx.strokeStyle = edge; ctx.stroke(); ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2; rrect(ctx, x + 3, y + 3, w - 6, h - 6, 7); ctx.stroke(); ctx.setLineDash([]);
      dot(ctx, x + w - 2, y + 2, 10, rgba(a, 1)); ctx.strokeStyle = 'rgba(10,50,30,1)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x + w - 7, y + 2); ctx.lineTo(x + w - 3, y + 6); ctx.lineTo(x + w + 4, y - 3); ctx.stroke();
    } else if (role === 'risk') {
      rrect(ctx, x, y, w, h, 3); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.save(); rrect(ctx, x, y, w, h, 3); ctx.clip(); ctx.fillStyle = rgba(a, 0.95); [[x, 14], [x + w - 14, 14]].forEach(function (z) { for (var s = -h; s < h + 14; s += 10) { ctx.beginPath(); ctx.moveTo(z[0] + s % 14, y + s); ctx.lineTo(z[0] + z[1], y + s - 14 + 14); ctx.lineTo(z[0] + z[1], y + s + 5); ctx.lineTo(z[0], y + s + 9); ctx.closePath(); ctx.fill(); } }); ctx.restore(); ctx.lineWidth = 2; ctx.strokeStyle = edge; rrect(ctx, x, y, w, h, 3); ctx.stroke();
      ctx.fillStyle = rgba(a, 1); ctx.beginPath(); ctx.moveTo(x + w / 2, y - 9); ctx.lineTo(x + w / 2 + 9, y + 5); ctx.lineTo(x + w / 2 - 9, y + 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(50,20,10,1)'; ctx.fillRect(x + w / 2 - 0.8, y - 3, 1.7, 5); ctx.fillRect(x + w / 2 - 0.8, y + 3, 1.7, 1.6);
    } else if (role === 'date') {
      rrect(ctx, x, y, w, h, 5); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(a, 0.6); ctx.stroke(); ctx.fillStyle = rgba(a, 0.95); ctx.fillRect(x + 1, y + 1, w - 2, 7); for (i = 0; i < Math.floor(w / 18); i++) dot(ctx, x + 10 + i * 18, y + 14, 1.8, 'rgba(0,0,0,0.5)');
    } else if (role === 'list') {
      rrect(ctx, x, y + 3, w, h - 3, 5); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 1.8; ctx.strokeStyle = rgba(a, 0.7); ctx.stroke(); rrect(ctx, x + w / 2 - 14, y - 4, 28, 10, 3); ctx.fillStyle = 'rgba(190,196,206,1)'; ctx.fill(); for (i = 0; i < 3; i++) dot(ctx, x + 8, y + 12 + i * ((h - 18) / 2), 1.8, rgba(a, 0.85));
    } else if (role === 'formula') {
      rrect(ctx, x, y, w, h, 3); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = rgba(a, 0.22); ctx.lineWidth = 1; for (var gx = x + 8; gx < x + w; gx += 8) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); } for (var gy = y + 8; gy < y + h; gy += 8) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); } ctx.setLineDash([6, 3]); ctx.lineWidth = 1.8; ctx.strokeStyle = rgba(a, 0.9); rrect(ctx, x + 2, y + 2, w - 4, h - 4, 2); ctx.stroke(); ctx.setLineDash([]);
    } else {   // concepto: etiqueta con agujero
      ctx.beginPath(); ctx.moveTo(x + 10, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x + 10, y + h); ctx.lineTo(x - 6, y + h / 2); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(a, 0.6); ctx.stroke(); dot(ctx, x + 4, y + h / 2, 2.6, rgba(TONES[tone].bg, 1));
    }
    if (sel) { ctx.shadowColor = 'transparent'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,230,120,1)'; ctx.setLineDash([]); rrect(ctx, x - 5, y - 5, w + 10, h + 10, 10); ctx.stroke(); }
    ctx.restore();
  }

  function relation(ctx, L, tone, t) {
    var a = L.a, b = L.b, dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy); if (len < 2) return;
    var p0 = K.anchor(a, dx, dy, 8), p1 = K.anchor(b, -dx, -dy, 14), ux = dx / len, uy = dy / len, nx = -uy, ny = ux, ink = TONES[tone].ink, role = b.role, key = L.key, ang = Math.atan2(dy, dx), i, N, q;
    var path = function () { ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (role === 'example') {   // hilo rojo con chincheta
      ctx.strokeStyle = 'rgba(214,60,60,0.95)'; ctx.lineWidth = 1.8; ctx.setLineDash([2, 5]); path(); ctx.stroke(); ctx.setLineDash([]); dot(ctx, p1[0], p1[1], 4, 'rgba(214,60,60,1)'); dot(ctx, p1[0] - 1, p1[1] - 1, 1.3, 'rgba(255,255,255,0.8)');
    } else if (role === 'process') {   // flecha de secuencia con chevrones
      ctx.strokeStyle = rgba(ink, 0.9); ctx.lineWidth = 3.4; path(); ctx.stroke(); ctx.fillStyle = rgba(ink, 0.95); ctx.beginPath(); ctx.moveTo(p1[0] + ux * 6, p1[1] + uy * 6); ctx.lineTo(p1[0] - ux * 8 + nx * 7, p1[1] - uy * 8 + ny * 7); ctx.lineTo(p1[0] - ux * 8 - nx * 7, p1[1] - uy * 8 - ny * 7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(TONES[tone].bg, 1); ctx.lineWidth = 1.4; for (var s = 20; s < len - 40; s += 26) { var cx = p0[0] + ux * s, cy = p0[1] + uy * s; ctx.beginPath(); ctx.moveTo(cx - ux * 3 + nx * 3, cy - uy * 3 + ny * 3); ctx.lineTo(cx + ux * 2, cy + uy * 2); ctx.lineTo(cx - ux * 3 - nx * 3, cy - uy * 3 - ny * 3); ctx.stroke(); }
    } else if (role === 'question') {   // puntos con interrogación
      ctx.strokeStyle = rgba(ink, 0.8); ctx.lineWidth = 2; ctx.setLineDash([1, 6]); path(); ctx.stroke(); ctx.setLineDash([]); var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2; dot(ctx, mx, my, 8, rgba(ACC.question, 1)); ctx.fillStyle = 'rgba(30,20,60,1)'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', mx, my + 0.5);
    } else if (role === 'risk') {   // zigzag de alerta
      N = Math.max(4, Math.round(len / 16)); ctx.strokeStyle = 'rgba(236,70,60,0.95)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); for (i = 1; i < N; i++) { q = i / N; ctx.lineTo(p0[0] + (p1[0] - p0[0]) * q + nx * (i % 2 ? 6 : -6), p0[1] + (p1[1] - p0[1]) * q + ny * (i % 2 ? 6 : -6)); } ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    } else if (role === 'benefit') {   // onda verde y marca de verificación
      ctx.strokeStyle = 'rgba(70,200,130,0.95)'; ctx.lineWidth = 2.4; ctx.beginPath(); N = Math.max(8, Math.round(len / 6)); for (i = 0; i <= N; i++) { q = i / N; var w = Math.sin(q * len / 14) * 3.5 * Math.sin(q * Math.PI); var px = p0[0] + (p1[0] - p0[0]) * q + nx * w, py = p0[1] + (p1[1] - p0[1]) * q + ny * w; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(p1[0] - 5, p1[1]); ctx.lineTo(p1[0] - 1, p1[1] + 4); ctx.lineTo(p1[0] + 6, p1[1] - 5); ctx.stroke();
    } else if (role === 'definition') {   // subrayador
      ctx.strokeStyle = 'rgba(255,224,70,0.6)'; ctx.lineWidth = 11; ctx.lineCap = 'butt'; path(); ctx.stroke(); ctx.lineCap = 'round'; ctx.strokeStyle = rgba(ink, 0.8); ctx.lineWidth = 1.2; path(); ctx.stroke();
    } else if (role === 'date') {   // regla de tiempo
      ctx.strokeStyle = rgba(ink, 0.85); ctx.lineWidth = 1.6; path(); ctx.stroke(); for (var m = 0; m <= len; m += 12) { var big = Math.round(m / 12) % 4 === 0, sx = p0[0] + ux * m, sy = p0[1] + uy * m; if (m > len - 10) break; ctx.beginPath(); ctx.moveTo(sx - nx * (big ? 6 : 3), sy - ny * (big ? 6 : 3)); ctx.lineTo(sx + nx * (big ? 6 : 3), sy + ny * (big ? 6 : 3)); ctx.stroke(); } dot(ctx, p1[0], p1[1], 3.6, rgba(ACC.date, 1));
    } else if (role === 'formula') {   // codo técnico con terminales
      ctx.strokeStyle = rgba(ink, 0.9); ctx.lineWidth = 1.6; var horiz = Math.abs(dx) > Math.abs(dy), mx2 = (p0[0] + p1[0]) / 2, my2 = (p0[1] + p1[1]) / 2; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); if (horiz) { ctx.lineTo(mx2, p0[1]); ctx.lineTo(mx2, p1[1]); } else { ctx.lineTo(p0[0], my2); ctx.lineTo(p1[0], my2); } ctx.lineTo(p1[0], p1[1]); ctx.stroke(); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p0[0], p0[1], 3.5, 0, TAU); ctx.arc(p1[0], p1[1], 3.5, 0, TAU); ctx.stroke();
    } else if (role === 'category' || role === 'list') {   // línea doble jerárquica
      ctx.strokeStyle = rgba(ink, 0.9); ctx.lineWidth = role === 'category' ? 5 : 3; path(); ctx.stroke(); ctx.strokeStyle = rgba(TONES[tone].bg, 1); ctx.lineWidth = role === 'category' ? 1.8 : 1; path(); ctx.stroke(); dot(ctx, p1[0], p1[1], 3, rgba(ink, 1));
    } else {   // lápiz: dos trazos casi iguales
      ctx.strokeStyle = rgba(ink, 0.8); ctx.lineWidth = 1.7; path(); ctx.stroke(); ctx.strokeStyle = rgba(ink, 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p0[0] + nx * 1.4, p0[1] + ny * 1.4); ctx.quadraticCurveTo((p0[0] + p1[0]) / 2 + nx * (hash(key) - 0.5) * 8, (p0[1] + p1[1]) / 2 + ny * (hash(key) - 0.5) * 8, p1[0], p1[1]); ctx.stroke(); dot(ctx, p1[0], p1[1], 2.4, rgba(ink, 0.9));
    }
    ctx.restore(); void ang; void t;
  }

  function legend(ctx, F, V, tone) {
    var cnt = {}; F.list.forEach(function (o) { cnt[o.role] = (cnt[o.role] || 0) + 1; });
    var roles = Object.keys(cnt).filter(function (r) { return r !== 'bubble'; }).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 8), g = MEANING[EN ? 'en' : 'es'], t = TONES[tone], pw = 350, rh = 24, ph = 36 + roles.length * rh, sc = V.sc || 1;
    ctx.save(); ctx.translate(V.x0 + 14 / sc, V.y1 - (ph + 14) / sc); ctx.scale(1 / sc, 1 / sc);
    rrect(ctx, 0, 0, pw, ph, 10); ctx.fillStyle = t.dark ? 'rgba(10,16,30,0.82)' : 'rgba(255,252,244,0.9)'; ctx.fill(); ctx.strokeStyle = rgba(t.ink, 0.35); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = rgba(t.ink, 1); ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText((EN ? 'Functional typology · background: ' : 'Tipología funcional · fondo: ') + t.name[EN ? 1 : 0], 12, 16);
    ctx.font = '500 11.5px system-ui, sans-serif';
    roles.forEach(function (r, i) { var y = 36 + i * rh; ctx.save(); ctx.translate(12, y - 2); ctx.scale(0.42, 0.42); sticker(ctx, { role: r, id: 'leg' + r, x: 8, y: 6, w: 64, h: 24 }, 1, false, tone); ctx.restore(); ctx.fillStyle = rgba(t.ink, 0.95); ctx.fillText(g[r] || '', 54, y + 8); });
    ctx.restore();
  }

  var pers = {
    transparent: true, edges: false, static: true, margin: { top: 18, bottom: 18, left: 34, right: 34 },
    before: function (ctx, F, V, pr, t) {
      K.roles(F); var tone = toneOf(F); F.tone = tone; var sel = K.selected();
      background(ctx, F, V, pr, tone);
      var order = new Map(); F.links.forEach(function (L) { var k = L.a.id; if (!order.has(k)) order.set(k, []); order.get(k).push(L.b.id); });
      F.links.forEach(function (L) { relation(ctx, L, tone, t); });
      F.list.forEach(function (o) { var par = F.links.filter(function (L) { return L.b.id === o.id; })[0], idx = par ? (order.get(par.a.id) || []).indexOf(o.id) : 0; sticker(ctx, o, Math.max(0, idx), sel.has(o.id), tone); });
    },
    after: function (ctx, F, V) { legend(ctx, F, V, F.tone || toneOf(F)); }
  };
  T.register('personality', EN ? '🏷️ Functional typology' : '🏷️ Tipología funcional', pers);
})();
