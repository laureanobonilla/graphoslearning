/* view-xray.js — vista «Radiografía»: el esquema como una placa de rayos X.
 * Película casi negra con grano; cada concepto es una estructura ósea translúcida que se suma a lo que tiene detrás (densidad aditiva),
 * con una forma por función (vértebra, articulación, costillas, tornillo, malla de stent, fractura, nódulo, pelvis…); las relaciones
 * son vasos con contraste que se afinan y se ramifican. Marcas de registro y regla en el borde, como una placa de hospital.
 * Solo dibuja detrás del texto. Necesita /view3d.js, /view-shapes.js y /view-artkit.js. */
(function () {
  'use strict';
  var T = window.__gkV3, K = window.__gkKit; if (!T || !T.register || !K) return;
  var EN = (typeof I18N !== 'undefined' && I18N.lang === 'en'), rgba = T.rgba, hash = T.hash, TAU = Math.PI * 2;
  var BONE = [176, 216, 236], DENSE = [235, 248, 255], VESSEL = [120, 200, 230], ALERT = [255, 150, 120];
  var cache = {};
  function rrect(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function bone(ctx, o, sel) {
    var id = o.id, role = o.role, x = o.x - 8, y = o.y - 3, w = o.w + 16, h = o.h + 6, cx = o.cx, cy = o.cy, i, c = sel ? ALERT : BONE;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var fill = function (a) { ctx.fillStyle = rgba(c, a); ctx.fill(); }, line = function (a, lw) { ctx.strokeStyle = rgba(c, a); ctx.lineWidth = lw || 1.4; ctx.stroke(); };
    if (role === 'root') {   // pelvis: dos alas y anillo
      [-1, 1].forEach(function (s) { ctx.beginPath(); ctx.ellipse(cx + s * w * 0.3, cy - 2, w * 0.28, h * 1.0, s * 0.35, 0, TAU); fill(0.12); line(0.5, 1.5); ctx.beginPath(); ctx.ellipse(cx + s * w * 0.3, cy - 2, w * 0.22, h * 0.78, s * 0.35, 0, TAU); line(0.22, 1); });
      ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.55, w * 0.16, h * 0.4, 0, 0, TAU); line(0.55, 1.6);
    } else if (role === 'category') {   // vértebra
      for (i = 0; i < 3; i++) { rrect(ctx, x + i * 4, y - 3 + i * 3, w - 8, h - 2, 10); fill(0.1); line(0.38 - i * 0.04, 1.2); }
      ctx.beginPath(); ctx.moveTo(x + w - 6, cy); ctx.lineTo(x + w + 14, cy - 5); ctx.lineTo(x + w + 14, cy + 5); ctx.closePath(); fill(0.2); line(0.5, 1);
    } else if (role === 'process') {   // articulación bola-cuenca
      rrect(ctx, x + 14, y + 2, w - 14, h - 4, 12); fill(0.1); line(0.4, 1.3); ctx.beginPath(); ctx.arc(x + 4, cy, h * 0.78, 0, TAU); fill(0.18); line(0.7, 1.6); ctx.beginPath(); ctx.arc(x + 4, cy, h * 0.78 + 7, -1.1, 1.1); line(0.45, 1.4);
    } else if (role === 'question') {   // anillo con retícula y muesca
      rrect(ctx, x, y, w, h, h / 2); line(0.55, 1.6); rrect(ctx, x + 5, y + 5, w - 10, h - 10, h / 2); line(0.2, 1); ctx.beginPath(); ctx.moveTo(x - 10, cy); ctx.lineTo(x + 14, cy); ctx.moveTo(x + w - 14, cy); ctx.lineTo(x + w + 10, cy); line(0.5, 1);
    } else if (role === 'example') {   // tornillo de implante
      rrect(ctx, x, y + 3, w, h - 6, 6); fill(0.1); line(0.45, 1.3); for (i = 0; i < w; i += 8) { ctx.beginPath(); ctx.moveTo(x + i, y + 3); ctx.lineTo(x + i + 5, y + h - 3); line(0.22, 1); } rrect(ctx, x - 9, y - 1, 11, h + 2, 4); fill(0.3); line(0.7, 1.3);
    } else if (role === 'benefit') {   // malla de stent
      ctx.save(); rrect(ctx, x, y + 2, w, h - 4, 14); fill(0.07); line(0.5, 1.3); ctx.clip(); ctx.beginPath(); for (i = -h; i < w + h; i += 9) { ctx.moveTo(x + i, y); ctx.lineTo(x + i + h, y + h); ctx.moveTo(x + i + h, y); ctx.lineTo(x + i, y + h); } line(0.28, 1); ctx.restore();
    } else if (role === 'risk') {   // fractura: dos mitades separadas y borde de rotura brillante
      var k = x + w * (0.4 + hash(id + 'f') * 0.2); ctx.save(); ctx.beginPath(); ctx.rect(x - 20, y - 20, k - x + 20, h + 40); ctx.clip(); rrect(ctx, x, y, w, h, 14); fill(0.12); line(0.45, 1.4); ctx.restore();
      ctx.save(); ctx.translate(5, 3); ctx.beginPath(); ctx.rect(k, y - 20, w + 20, h + 40); ctx.clip(); ctx.translate(-5, -3); ctx.translate(5, 3); rrect(ctx, x - 5, y - 3, w, h, 14); fill(0.12); line(0.45, 1.4); ctx.restore();
      ctx.strokeStyle = rgba(ALERT, 0.95); ctx.lineWidth = 1.8; ctx.beginPath(); for (i = 0; i <= 6; i++) { var yy = y - 4 + (h + 8) * i / 6, xx = k + (i % 2 ? 4 : -3) + (hash(id + 'z' + i) - 0.5) * 4; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke();
    } else if (role === 'date') {   // regla graduada
      rrect(ctx, x, y + 2, w, h - 4, 8); fill(0.09); line(0.4, 1.2); ctx.beginPath(); for (i = 0; i < w; i += 7) { ctx.moveTo(x + i, y + 2); ctx.lineTo(x + i, y + 2 + (i % 28 === 0 ? 10 : 5)); } line(0.55, 1);
    } else if (role === 'list') {   // costillas
      for (i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.5, w * 0.5 + 6 - i * 4, h * 0.5 + 8 + i * 5, 0, Math.PI, TAU); line(0.42 - i * 0.07, 1.4); } rrect(ctx, x + 12, y + 4, w - 24, h - 8, 8); fill(0.08);
    } else if (role === 'formula') {   // grapa
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.lineTo(x + 12, y + h); ctx.moveTo(x, y); ctx.lineTo(x + 12, y); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - 12, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x + w - 12, y); line(0.7, 2.2); rrect(ctx, x + 6, y + 4, w - 12, h - 8, 4); fill(0.07);
    } else if (role === 'definition') {   // nódulo denso con halo
      ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.5, h * 0.75, 0, 0, TAU); ctx.fillStyle = rgba(DENSE, 0.16); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.5 + 8, h * 0.75 + 7, 0, 0, TAU); line(0.22, 1.2); ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.5, h * 0.75, 0, 0, TAU); line(0.55, 1.6);
    } else {   // hueso largo
      rrect(ctx, x + 4, y + 3, w - 8, h - 6, 12); fill(0.1); line(0.42, 1.3); rrect(ctx, x + 8, y + 7, w - 16, h - 14, 8); line(0.18, 1); [-1, 1].forEach(function (s) { var bx = s < 0 ? x + 2 : x + w - 2; ctx.beginPath(); ctx.arc(bx, cy - h * 0.2, h * 0.38, 0, TAU); fill(0.14); line(0.5, 1.2); ctx.beginPath(); ctx.arc(bx, cy + h * 0.2, h * 0.38, 0, TAU); fill(0.14); line(0.5, 1.2); });
    }
    ctx.restore();
    // bajo el texto la placa se oscurece (no se ve hueso, se ve la anotación)
    ctx.save(); ctx.fillStyle = 'rgba(2,8,14,0.78)'; rrect(ctx, o.x - 2, o.y + 1, o.w + 4, o.h - 2, 6); ctx.fill(); ctx.restore();
  }
  function vessel(ctx, L) {
    var a = L.a, b = L.b, dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy); if (len < 2) return; var p0 = K.anchor(a, dx, dy, 8), p1 = K.anchor(b, -dx, -dy, 8), nx = -dy / len, ny = dx / len, key = L.key, bend = (hash(key + 'b') - 0.5) * Math.min(90, len * 0.35), w = 1.6 + Math.min(b.k, 4) * 0.5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    var N = 16, prev = null, pts = [];
    for (var i = 0; i <= N; i++) { var u = i / N, off = Math.sin(u * Math.PI) * bend + Math.sin(u * 17 + hash(key + 'q') * 6) * 1.6; pts.push([p0[0] + (p1[0] - p0[0]) * u + nx * off, p0[1] + (p1[1] - p0[1]) * u + ny * off]); }
    for (i = 1; i <= N; i++) { ctx.strokeStyle = rgba(VESSEL, 0.55); ctx.lineWidth = Math.max(0.6, w * (1 - i / N * 0.7)); ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
    for (i = 3; i < N - 2; i += 3) { if (hash(key + 'r' + i) < 0.5) continue; var s = hash(key + 's' + i) < 0.5 ? -1 : 1, q = pts[i], ex = q[0] + nx * s * (12 + hash(key + 'l' + i) * 14) + dx / len * 6, ey = q[1] + ny * s * (12 + hash(key + 'l' + i) * 14) + dy / len * 6; ctx.strokeStyle = rgba(VESSEL, 0.38); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.quadraticCurveTo((q[0] + ex) / 2 + 3, (q[1] + ey) / 2, ex, ey); ctx.stroke(); }
    ctx.fillStyle = rgba(DENSE, 0.7); ctx.beginPath(); ctx.arc(p1[0], p1[1], 1.8, 0, TAU); ctx.fill(); ctx.restore();
  }
  var xray = {
    transparent: true, edges: false, static: true, margin: { top: 16, bottom: 16, left: 30, right: 30 },
    before: function (ctx, F, V, pr) {
      K.roles(F); var sel = K.selected();
      K.screen(ctx, V, pr, function () {
        var g = ctx.createRadialGradient(V.W / 2, V.H / 2, 30, V.W / 2, V.H / 2, Math.max(V.W, V.H) * 0.7); g.addColorStop(0, '#0b1620'); g.addColorStop(1, '#03060a'); ctx.fillStyle = g; ctx.fillRect(0, 0, V.W, V.H);
        ctx.fillStyle = ctx.createPattern(K.grain(cache, '150,200,230', 1100), 'repeat'); ctx.fillRect(0, 0, V.W, V.H);
        // reglas del borde y marcas de registro
        ctx.strokeStyle = 'rgba(176,216,236,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (var y = 20; y < V.H - 20; y += 12) { ctx.moveTo(10, y); ctx.lineTo(y % 60 === 20 ? 24 : 17, y); } for (var x = 20; x < V.W - 20; x += 12) { ctx.moveTo(x, V.H - 10); ctx.lineTo(x, x % 60 === 20 ? V.H - 24 : V.H - 17); } ctx.stroke();
        [[24, 24], [V.W - 24, 24], [V.W - 24, V.H - 24]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, TAU); ctx.moveTo(p[0] - 12, p[1]); ctx.lineTo(p[0] + 12, p[1]); ctx.moveTo(p[0], p[1] - 12); ctx.lineTo(p[0], p[1] + 12); ctx.stroke(); });
      });
      F.links.forEach(function (L) { vessel(ctx, L); });
      F.list.forEach(function (o) { bone(ctx, o, sel.has(o.id)); });
    },
    after: function () { }
  };
  T.register('xray', EN ? '🩻 X-ray' : '🩻 Radiografía', xray);
})();
