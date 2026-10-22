/* Graphikosmos – intro POV (~5 s): vuelo en primera persona por un mapa mental.
   Autónomo: crea su propio overlay, no depende de app.js y no bloquea nada.
   Se omite con clic / tecla / "Saltar", y con ?intro=0. Respeta prefers-reduced-motion. */
(function () {
  'use strict';
  if (window.__gkIntro) return;
  try { if (/[?&]intro=0/.test(location.search)) return; } catch (e) {}

  var EN = /^\/en(\/|$)/.test(location.pathname) || /[?&]lang=en/.test(location.search);
  var MSGS = EN ? [
    'Every big idea started as a single node.',
    'Learning is connecting what you know with what comes next.',
    'Your mind already weaves maps. Let’s draw them.',
    'One topic at a time. One bridge at a time.',
    'The hard part gets clear once you see how it connects.'
  ] : [
    'Toda gran idea empezó como un nodo suelto.',
    'Aprender es conectar lo que sabes con lo que viene.',
    'Tu mente ya teje mapas. Vamos a dibujarlos.',
    'Un tema a la vez. Un puente a la vez.',
    'Lo difícil se aclara cuando ves cómo se conecta.'
  ];
  var LOAD = EN ? 'Loading your universe' : 'Cargando tu universo';
  var SKIP = EN ? 'Skip' : 'Saltar';
  var WORDS = EN
    ? ['History', 'Physics', 'Ideas', 'Music', 'Code', 'Biology', 'Art', 'Philosophy', 'Chemistry', 'Languages', 'Economics', 'Memory', 'Logic', 'Cosmos']
    : ['Historia', 'Física', 'Ideas', 'Música', 'Código', 'Biología', 'Arte', 'Filosofía', 'Química', 'Idiomas', 'Economía', 'Memoria', 'Lógica', 'Cosmos'];

  var DUR = 6.2;          // segundos totales (el título y el mensaje quedan ~2,7 s)
  var FLY = 4.0;          // fin del vuelo (luego queda el título)
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* ---------- overlay ---------- */
  var root = document.createElement('div');
  root.id = 'gkIntro';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', LOAD);
  root.innerHTML =
    '<canvas></canvas><div class="gi-vig"></div>' +
    '<div class="gi-center"><h1 class="gi-title">Graphikosmos</h1><p class="gi-msg"></p></div>' +
    '<div class="gi-foot"><span class="gi-load">' + LOAD + '</span><span class="gi-bar"><i></i></span></div>' +
    '<button type="button" class="gi-skip">' + SKIP + '</button>';
  var st = document.createElement('style');
  st.textContent =
    '#gkIntro{position:fixed;inset:0;z-index:2147483000;background:#04050f;overflow:hidden;opacity:1;transition:opacity .7s ease,background-color 1.2s ease;font-family:Sora,Inter,system-ui,sans-serif;color:#fff;cursor:pointer}' +
    '#gkIntro.gi-out{opacity:0;pointer-events:none}' +
    '#gkIntro canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '#gkIntro .gi-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 50%,rgba(4,5,15,0) 45%,rgba(4,5,15,.78) 100%)}' +
    '#gkIntro .gi-center{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;padding:0 24px;pointer-events:none}' +
    '#gkIntro .gi-title{margin:0;font-weight:800;font-size:clamp(36px,7.2vw,92px);letter-spacing:-.02em;line-height:1.05;opacity:0;filter:blur(14px);transform:scale(1.06);' +
      'background:linear-gradient(100deg,#e0e7ff 0%,#a5b4fc 38%,#67e8f9 72%,#f0abfc 100%);-webkit-background-clip:text;background-clip:text;color:transparent;' +
      'text-shadow:0 0 60px rgba(129,140,248,.35);transition:opacity 1s ease,filter 1.1s ease,transform 1.4s cubic-bezier(.2,.7,.2,1)}' +
    '#gkIntro .gi-msg{margin:18px auto 0;max-width:640px;font-family:Inter,system-ui,sans-serif;font-weight:500;font-size:clamp(15px,2vw,22px);line-height:1.45;color:#c7d2fe;opacity:0;transform:translateY(8px);transition:opacity .9s ease .25s,transform .9s ease .25s}' +
    '#gkIntro.gi-show .gi-title{opacity:1;filter:blur(0);transform:scale(1)}' +
    '#gkIntro.gi-show .gi-msg{opacity:.95;transform:none}' +
    '#gkIntro .gi-foot{position:absolute;left:0;right:0;bottom:26px;display:flex;flex-direction:column;align-items:center;gap:9px;pointer-events:none;font-family:Inter,system-ui,sans-serif;font-size:12px;letter-spacing:.04em;color:#818cf8;transition:opacity .6s}' +
    '#gkIntro.gi-show .gi-foot{opacity:0}' +
    '#gkIntro .gi-bar{display:block;width:150px;height:2px;border-radius:2px;background:rgba(129,140,248,.2);overflow:hidden}' +
    '#gkIntro .gi-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#6366f1,#22d3ee);box-shadow:0 0 10px #22d3ee}' +
    '#gkIntro.gi-amb{background:transparent;z-index:10;pointer-events:none;opacity:.4;transition:opacity 1.2s ease;-webkit-mask-image:radial-gradient(ellipse 36% 42% at 50% 50%,rgba(0,0,0,.12) 0%,#000 100%);mask-image:radial-gradient(ellipse 36% 42% at 50% 50%,rgba(0,0,0,.12) 0%,#000 100%)}' +
    '#gkIntro.gi-amb.gi-dim{opacity:.16}' +
    '#gkIntro.gi-amb canvas{mix-blend-mode:screen}' +
    '#gkIntro.gi-amb .gi-vig,#gkIntro.gi-amb .gi-foot,#gkIntro.gi-amb .gi-skip{display:none}' +
    '#gkIntro.gi-amb.gi-out{opacity:0}' +
    '#gkIntro .gi-skip{position:absolute;right:18px;bottom:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);color:#c7d2fe;font:500 12px Inter,system-ui,sans-serif;padding:6px 14px;border-radius:999px;cursor:pointer;backdrop-filter:blur(6px)}' +
    '#gkIntro .gi-skip:hover,#gkIntro .gi-skip:focus-visible{background:rgba(255,255,255,.16);outline:2px solid #818cf8;outline-offset:2px}';
  (document.head || document.documentElement).appendChild(st);
  (document.body || document.documentElement).appendChild(root);
  window.__gkIntro = true; window.__gkIntroState = 'playing';
  var trkI = function (e, m) { try { if (typeof track === 'function') track(e, m || {}); } catch (x) {} };

  var cv = root.querySelector('canvas');
  var ctx = cv.getContext('2d');
  var barI = root.querySelector('.gi-bar i');
  root.querySelector('.gi-msg').textContent = MSGS[Math.floor(Math.random() * MSGS.length)];

  var W = 0, H = 0, DPR = 1, F = 600;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    W = root.clientWidth || window.innerWidth; H = root.clientHeight || window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    F = Math.max(W, H * 1.15) * 0.62;
    buildBackdrop();
  }

  /* ---------- utilidades ---------- */
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sm(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  /* ---------- paleta ---------- */
  var PAL = [
    [129, 140, 248],  // índigo
    [34, 211, 238],   // cian
    [167, 139, 250],  // violeta
    [244, 114, 182],  // rosa
    [251, 191, 36],   // ámbar
    [52, 211, 153]    // esmeralda
  ];
  var sprites = {};
  function sprite(ci) {
    if (sprites[ci]) return sprites[ci];
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d'), p = PAL[ci];
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.07, 'rgba(255,255,255,.95)');
    gr.addColorStop(0.16, 'rgba(' + p.join(',') + ',.85)');
    gr.addColorStop(0.42, 'rgba(' + p.join(',') + ',.22)');
    gr.addColorStop(1, 'rgba(' + p.join(',') + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return (sprites[ci] = c);
  }

  /* ---------- fondo (nebulosa pre-renderizada) ---------- */
  var back = document.createElement('canvas');
  function buildBackdrop() {
    back.width = Math.round(W * 1.3); back.height = Math.round(H * 1.3);
    var g = back.getContext('2d'), w = back.width, h = back.height;
    var bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#05061a'); bg.addColorStop(0.55, '#0a0b2a'); bg.addColorStop(1, '#04050f');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    var s = 11;
    function blob(x, y, r, rgb, a) {
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    var save = seed; seed = s;
    blob(w * 0.30, h * 0.35, w * 0.42, '79,70,229', 0.30);
    blob(w * 0.72, h * 0.62, w * 0.38, '8,145,178', 0.20);
    blob(w * 0.55, h * 0.18, w * 0.30, '168,85,247', 0.18);
    blob(w * 0.18, h * 0.78, w * 0.28, '219,39,119', 0.10);
    for (var i = 0; i < 160; i++) {          // estrellas lejanas
      var a = 0.15 + rnd() * 0.55;
      g.fillStyle = 'rgba(200,210,255,' + a + ')';
      g.fillRect(rnd() * w, rnd() * h, rnd() < 0.1 ? 2 : 1, rnd() < 0.1 ? 2 : 1);
    }
    seed = save;
  }

  /* ---------- escena: mapa mental 3D ---------- */
  var STEP = 3.1, N = 9;
  var spine = [];
  for (var i = 0; i <= N; i++) {
    spine.push([Math.sin(i * 0.95) * 1.9, Math.cos(i * 0.72 + 0.6) * 1.05, i * STEP]);
  }
  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t, o = [0, 0, 0];
    for (var k = 0; k < 3; k++) {
      o[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    }
    return o;
  }
  function pathAt(u) {   // u en [0, N]
    u = clamp(u, 0, N - 0.0001);
    var i = Math.floor(u), t = u - i;
    var p0 = spine[Math.max(i - 1, 0)], p1 = spine[i], p2 = spine[Math.min(i + 1, N)], p3 = spine[Math.min(i + 2, N)];
    return catmull(p0, p1, p2, p3, t);
  }

  var nodes = [], edges = [], dust = [], labelPool = 0;
  function addNode(p, r, ci, label, spineIdx) {
    nodes.push({ p: p, r: r, c: ci, label: label || null, sp: spineIdx == null ? -1 : spineIdx, ph: rnd() * 6.28 });
    return nodes.length - 1;
  }
  function addEdge(a, b, w, bow) {
    var A = nodes[a].p, B = nodes[b].p;
    var m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
    var d = norm(sub(B, A));
    var s = cross(d, [0.3, 1, 0.1]); s = norm(s);
    var o = (rnd() - 0.5) * 2 * bow;
    edges.push({ a: a, b: b, w: w, c: [m[0] + s[0] * o, m[1] + s[1] * o + bow * 0.25, m[2] + s[2] * o], ci: nodes[b].c });
  }
  (function build() {
    seed = 42;
    var spIdx = [];
    for (var i = 0; i <= N; i++) {
      var isRoot = i === N;
      spIdx.push(addNode(spine[i].slice(), isRoot ? 0.55 : 0.2, i % PAL.length, null, i));
      if (i > 0) addEdge(spIdx[i - 1], spIdx[i], 2.4, 0.5);
    }
    for (var j = 0; j < N; j++) {
      var kids = 3 + Math.floor(rnd() * 2);
      for (var k = 0; k < kids; k++) {
        var ang = (k / kids) * 6.283 + rnd() * 1.1 + j;
        var len = 1.5 + rnd() * 1.5;
        var fwd = (rnd() - 0.25) * 1.6;
        var P = [spine[j][0] + Math.cos(ang) * len, spine[j][1] + Math.sin(ang) * len * 0.8, spine[j][2] + fwd];
        var lab = (labelPool < WORDS.length && rnd() < 0.62) ? WORDS[labelPool++] : null;
        var c = (j + k + 1) % PAL.length;
        var ki = addNode(P, 0.1 + rnd() * 0.07, c, lab, -1);
        addEdge(spIdx[j], ki, 1.4, 0.45);
        var gk = 1 + Math.floor(rnd() * 2);
        for (var g = 0; g < gk; g++) {
          var a2 = ang + (rnd() - 0.5) * 1.8, l2 = 0.8 + rnd() * 1.0;
          var Q = [P[0] + Math.cos(a2) * l2, P[1] + Math.sin(a2) * l2 * 0.8, P[2] + (rnd() - 0.2) * 1.2];
          var gi = addNode(Q, 0.05 + rnd() * 0.05, c, null, -1);
          addEdge(ki, gi, 0.9, 0.3);
        }
      }
    }
    // polvo / partículas en suspensión
    for (var d = 0; d < 170; d++) {
      var u = rnd() * N;
      var pp = pathAt(u);
      dust.push({ p: [pp[0] + (rnd() - 0.5) * 7, pp[1] + (rnd() - 0.5) * 5, pp[2] + (rnd() - 0.5) * 4], s: 0.6 + rnd() * 1.6, a: 0.25 + rnd() * 0.55, c: Math.floor(rnd() * PAL.length) });
    }
  })();

  /* ---------- cámara ---------- */
  var cam = { pos: [0, 0, 0], f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] };
  function setCamera(t, uo) {
    // progreso del vuelo: arranque suave, velocidad estable, frenada al final
    var k = clamp(t / FLY, 0, 1);
    var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    var prog = 0.9 * k + 0.1 * e;                       // mezcla lineal + easing
    var u = uo != null ? uo : prog * (N - 0.9);          // termina antes de la raíz
    var p = pathAt(u);
    var look = pathAt(u + 0.75);
    // balanceo natural al "caminar/flotar"
    var sway = [Math.sin(t * 1.7) * 0.05, Math.sin(t * 2.3 + 1) * 0.04, 0];
    cam.pos = [p[0] + sway[0], p[1] + sway[1], p[2]];
    var f = norm(sub(look, cam.pos));
    var up0 = [0, 1, 0];
    var r = norm(cross(up0, f));
    var uu = cross(f, r);
    var roll = clamp((look[0] - p[0]) * 0.07, -0.18, 0.18) + Math.sin(t * 1.3) * 0.012;
    var cr = Math.cos(roll), sr = Math.sin(roll);
    cam.f = f;
    cam.r = [r[0] * cr + uu[0] * sr, r[1] * cr + uu[1] * sr, r[2] * cr + uu[2] * sr];
    cam.u = [uu[0] * cr - r[0] * sr, uu[1] * cr - r[1] * sr, uu[2] * cr - r[2] * sr];
    return u;
  }
  var NEAR = 0.25;
  function proj(p, o) {
    var d = sub(p, cam.pos);
    var z = dot(d, cam.f);
    o.z = z;
    if (z < NEAR) return false;
    var s = F / z;
    o.x = W / 2 + dot(d, cam.r) * s;
    o.y = H / 2 - dot(d, cam.u) * s;
    o.s = s;
    return true;
  }
  function fog(z) { return Math.pow(clamp(1 - (z - 1.2) / 15, 0, 1), 1.35) * sm(0.5, 1.7, z); }

  /* ---------- render ---------- */
  var T0 = 0, tmpA = {}, tmpB = {};
  function render(t, uo) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var amb = uo != null;
    var u = setCamera(t, uo);

    // fondo con paralaje leve
    var px = -((cam.pos[0]) * 6) % 40, py = ((cam.pos[1]) * 5) % 30;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (amb) ctx.clearRect(0, 0, W, H); else ctx.drawImage(back, -(back.width - W) / 2 + px, -(back.height - H) / 2 + py);

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    var A = tmpA, B = tmpB, i, e, n;

    // ramas
    for (i = 0; i < edges.length; i++) {
      e = edges[i];
      var a = nodes[e.a].p, b = nodes[e.b].p, c = e.c;
      var dz0 = a[2] - cam.pos[2], dz1 = b[2] - cam.pos[2];
      if (dz0 < -3 && dz1 < -3) continue;
      if (dz0 > 17 && dz1 > 17) continue;
      var col = PAL[e.ci], SEG = 9, pa = null;
      for (var sI = 0; sI <= SEG; sI++) {
        var tt = sI / SEG, it = 1 - tt;
        var q = [it * it * a[0] + 2 * it * tt * c[0] + tt * tt * b[0], it * it * a[1] + 2 * it * tt * c[1] + tt * tt * b[1], it * it * a[2] + 2 * it * tt * c[2] + tt * tt * b[2]];
        if (!proj(q, A)) { pa = null; continue; }
        if (pa) {
          var fa = fog((A.z + pa.z) / 2);
          if (fa > 0.01) {
            var lw = clamp(e.w * (A.s / 140), 0.5, 4.2);
            ctx.strokeStyle = 'rgba(' + col.join(',') + ',' + (0.55 * fa).toFixed(3) + ')';
            ctx.lineWidth = lw * 2.6;
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(A.x, A.y); ctx.stroke();
            ctx.strokeStyle = 'rgba(235,240,255,' + (0.5 * fa).toFixed(3) + ')';
            ctx.lineWidth = Math.max(0.6, lw * 0.55);
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(A.x, A.y); ctx.stroke();
          }
        }
        pa = { x: A.x, y: A.y, z: A.z };
      }
    }

    // polvo
    for (i = 0; i < dust.length; i++) {
      var d = dust[i];
      if (!proj(d.p, A)) continue;
      var fd = fog(A.z); if (fd < 0.02) continue;
      var tw = 0.65 + 0.35 * Math.sin(t * 2 + i);
      ctx.globalAlpha = d.a * fd * tw;
      var sz = Math.max(1.2, d.s * A.s / 60 * 2.2);
      ctx.drawImage(sprite(d.c), A.x - sz, A.y - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 1;

    // nodos (los lejanos primero)
    var vis = [];
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      if (!proj(n.p, A)) continue;
      if (A.z > 17) continue;
      vis.push({ i: i, x: A.x, y: A.y, z: A.z, s: A.s });
    }
    vis.sort(function (m, k) { return k.z - m.z; });
    for (var v = 0; v < vis.length; v++) {
      var o = vis[v]; n = nodes[o.i];
      var fn = fog(o.z); if (fn < 0.015) continue;
      var pulse = 1 + 0.12 * Math.sin(t * 3 + n.ph);
      var rad = n.r * o.s * pulse;
      var g = Math.max(rad * 5.2, 5);
      ctx.globalAlpha = Math.min(1, fn * 1.15);
      ctx.drawImage(sprite(n.c), o.x - g, o.y - g, g * 2, g * 2);
      // núcleo brillante
      ctx.globalAlpha = Math.min(1, fn * 0.9);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(1.2, rad * 0.42), 0, 6.283); ctx.fill();

      // anillo al pasar por un nodo de la columna principal
      if (n.sp >= 0 && n.sp < N) {
        var dz = o.z;
        if (dz > 0.3 && dz < 2.6) {
          var ring = 1 - (dz - 0.3) / 2.3;
          ctx.globalAlpha = ring * 0.5 * fn;
          ctx.strokeStyle = 'rgba(' + PAL[n.c].join(',') + ',1)';
          ctx.lineWidth = Math.max(1, rad * 0.25);
          ctx.beginPath(); ctx.arc(o.x, o.y, rad * (2.2 + (1 - ring) * 3.4), 0, 6.283); ctx.stroke();
        }
      }
      // etiqueta
      if (!amb && n.label && o.z > 1.0 && o.z < 9) {
        var fl = sm(1.0, 2.0, o.z) * (1 - sm(5.5, 9, o.z));
        var fs = clamp(o.s * 0.115, 10, 30);
        if (fl > 0.02) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = fl * 0.92;
          ctx.font = '600 ' + fs.toFixed(1) + 'px Sora, Inter, system-ui, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(' + PAL[n.c].join(',') + ',.9)';
          ctx.shadowBlur = 14;
          ctx.fillStyle = '#eef2ff';
          ctx.fillText(n.label, o.x + rad * 1.6 + 8, o.y);
          ctx.shadowBlur = 0;
          ctx.globalCompositeOperation = 'lighter';
        }
      }
    }
    ctx.globalAlpha = 1;

    // destello al llegar a la raíz (el título aparece en ese momento)
    var fl2 = amb ? 0 : sm(FLY - 0.9, FLY - 0.15, t) * (1 - sm(FLY - 0.1, FLY + 0.9, t));
    if (fl2 > 0.01) {
      var gr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.55);
      gr.addColorStop(0, 'rgba(199,210,254,' + (0.55 * fl2).toFixed(3) + ')');
      gr.addColorStop(0.35, 'rgba(99,102,241,' + (0.22 * fl2).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(99,102,241,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';

    // velo oscuro tras el título para que se lea limpio
    var sc = amb ? 0 : sm(FLY - 0.9, FLY, t);
    if (sc > 0.01) {
      var g3 = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W * 0.55, H));
      g3.addColorStop(0, 'rgba(4,5,15,' + (0.78 * sc).toFixed(3) + ')');
      g3.addColorStop(0.6, 'rgba(4,5,15,' + (0.4 * sc).toFixed(3) + ')');
      g3.addColorStop(1, 'rgba(4,5,15,0)');
      ctx.fillStyle = g3; ctx.fillRect(0, 0, W, H);
    }

    // fundido inicial desde negro
    var fi = amb ? 0 : 1 - sm(0, 0.55, t);
    if (fi > 0.01) { ctx.globalAlpha = fi; ctx.fillStyle = '#04050f'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    return u;
  }

  /* ---------- ciclo ---------- */
  var raf = 0, done = false, shown = false, t0 = 0, amb = false, ambT0 = 0, lastF = 0, watch = 0;
  function cleanup() {
    try { root.remove(); st.remove(); } catch (e) {}
    window.removeEventListener('resize', resize);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('visibilitychange', onVis);
    clearInterval(watch);
    try { window.dispatchEvent(new CustomEvent('gk-intro-done')); } catch (e) {}
  }
  function finish(fast) {
    if (done) return; done = true;
    cancelAnimationFrame(raf);
    root.classList.add('gi-out');
    if (fast) root.style.transitionDuration = '.25s';
    setTimeout(cleanup, fast ? 300 : 760);
  }
  /* Fondo de baja intensidad mientras la persona decide qué estudiar; se apaga al empezar de verdad. */
  function ambientOk() {
    if (reduce || window.__introT != null) return false;
    if (W < 781 || /^\/m(\/|$)/.test(location.pathname)) return false;
    if ((navigator.hardwareConcurrency || 4) <= 2 && !/[?&]fondo=1/.test(location.search)) return false;
    if (/[?&]fondo=0/.test(location.search)) return false;
    return true;
  }
  function started() {
    try {
      if (window.GK_NAV && window.GK_NAV.hasMap && window.GK_NAV.hasMap()) return true;
      if (document.querySelector('#gkLens:not([hidden])')) return true;
      var cards = document.querySelector('#gkCards:not([hidden])');
      if (cards && !document.body.classList.contains('gk-entry')) return true;
      var m = document.getElementById('gkComposerInput') || document.getElementById('startTopic');
      if (m && String(m.value || '').trim().length > 1) return true;
    } catch (e) {}
    return false;
  }
  function stopAmbient() {
    if (done) return; done = true;
    cancelAnimationFrame(raf);
    root.style.transitionDuration = '1.4s';
    root.classList.add('gi-out');
    setTimeout(cleanup, 1500);
  }
  function toAmbient() {
    amb = true; ambT0 = performance.now();
    root.classList.remove('gi-show');
    root.classList.add('gi-amb');
    root.removeAttribute('role'); root.setAttribute('aria-hidden', 'true');
    root.style.cursor = 'default';
    watch = setInterval(function () {
      if (started()) { stopAmbient(); return; }
      root.classList.toggle('gi-dim', document.body.classList.contains('gk-entry'));
    }, 400);
  }
  function endIntro(fast) {
    if (done || amb) return;
    window.__gkIntroState = fast ? 'skipped' : 'done';
    trkI(fast ? 'intro_skip' : 'intro_end', { seg: Math.round(((performance.now() - (t0 || performance.now())) / 100)) / 10 });
    if (ambientOk()) toAmbient(); else finish(fast);
  }
  function onInput(ev) { if (amb && ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) stopAmbient(); }
  function onVis() { if (!document.hidden && !done) { lastF = 0; raf = requestAnimationFrame(frame); } }
  function onKey(ev) { if (!amb && (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); endIntro(true); } }
  root.addEventListener('click', function () { endIntro(true); });
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', resize);
  resize();

  function frame(now) {
    if (done) return;
    if (amb) {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - lastF < 33) return;     // ~30 cuadros por segundo
      lastF = now;
      var a = (performance.now() - ambT0) / 1000;
      var uo = (N - 0.9) - 3.4 * (0.5 - 0.5 * Math.cos(a * 0.05));
      render(FLY + a, uo);
      return;
    }
    if (!t0) t0 = now;
    var t = window.__introT != null ? window.__introT : (now - t0) / 1000;
    render(t);
    barI.style.width = (clamp(t / FLY, 0, 1) * 100).toFixed(1) + '%';
    if (!shown && t >= FLY - 0.7) { shown = true; root.classList.add('gi-show'); }
    if (t >= DUR && window.__introT == null) { endIntro(false); if (!amb) return; }
    raf = requestAnimationFrame(frame);
  }

  if (reduce) {
    root.classList.add('gi-show');
    ctx.drawImage(back, 0, 0, W, H);
    setTimeout(function () { finish(false); }, 1600);
  } else {
    raf = requestAnimationFrame(frame);
  }
  // seguro: nunca dejar la pantalla tapada
  setTimeout(function () { if (!amb) finish(false); }, (DUR + 3) * 1000);
})();
