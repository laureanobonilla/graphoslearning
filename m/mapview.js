/* m/mapview.js — mapa del celular con 3 niveles a la vez (el tema, sus ramas y las ramas de cada rama) y varias vistas:
 * Árbol (por defecto), Bloques 3D, Ciudad y Orgánico. Los textos son botones de verdad (se leen nítidos y se tocan);
 * el fondo y los efectos se dibujan en dos lienzos (uno detrás y otro encima de los nodos) con las mismas rutinas de /view3d.js.
 * Se desplaza con el dedo y se hace zoom con dos dedos. Nada de esto toca los datos del mapa. */
(function () {
  'use strict';
  var COLS = [{ w: 92, fs: 13 }, { w: 118, fs: 13 }, { w: 132, fs: 12.5 }], GAP = 24, MARG = 10, VGAP = 7, PADY = 14;
  var LEVEL = [{ bg: '#0f2f33', bd: '#4fd1c5' }, { bg: '#1b2140', bd: '#8b7cf6' }, { bg: '#2a2414', bd: '#f2b366' }];
  var MODES = [['tree', 'Árbol'], ['blocks', 'Bloques 3D'], ['city', 'Ciudad'], ['organic', 'Orgánico'], ['radial', 'Radial']];
  var S = { mode: 'tree', s: 1, token: 0, W: 0, H: 0, raf: 0, last: 0, st: null, back: null, front: null, F: null, fit: 1 };
  try { var sv = localStorage.getItem('gk_m_view'); if (sv && MODES.some(function (m) { return m[0] === sv; })) S.mode = sv; } catch (e) { /* ok */ }
  var reduce = function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  var hexRgb = function (c) { c = String(c || '#888').replace('#', ''); if (c.length === 3) c = c.replace(/./g, '$&$&'); return [0, 2, 4].map(function (i) { return parseInt(c.slice(i, i + 2), 16) || 0; }); };
  var impl = function () { return window.__gkV3 && window.__gkV3._impl; };

  /* ---------- diseño: tres columnas, las hojas apiladas en vertical ---------- */
  function build(G, cur, stage) {
    var root = G.nodes[cur]; if (!root) return null;
    var items = [], byId = {};
    function add(n, lv, parent, color) {
      var it = { id: n.id, label: n.label, lv: lv, parent: parent, color: color, kids: [], done: n.children.length > 0, n: n };
      items.push(it); byId[n.id] = it; if (parent) parent.kids.push(it); return it;
    }
    var r = add(root, 0, null, null);
    root.children.forEach(function (cid) {
      var c = G.nodes[cid]; if (!c) return; var ci = add(c, 1, r, c.color);
      c.children.forEach(function (gid) { var g = G.nodes[gid]; if (g) add(g, 2, ci, c.color); });
    });
    // medir cada texto con el ancho de su columna
    var probe = document.createElement('div'); probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
    stage.appendChild(probe);
    items.forEach(function (it) {
      var b = document.createElement('button'); b.className = 'mv-n mv-l' + it.lv; b.style.width = COLS[it.lv].w + 'px'; b.textContent = it.label; probe.appendChild(b);
      it.w = COLS[it.lv].w; it.h = b.offsetHeight; probe.removeChild(b);
    });
    stage.removeChild(probe);
    var x = [MARG]; x[1] = x[0] + COLS[0].w + GAP; x[2] = x[1] + COLS[1].w + GAP;
    var y = PADY;
    r.kids.forEach(function (c) {
      if (!c.kids.length) { c.y = y; y += c.h + VGAP; return; }
      var y0 = y; c.kids.forEach(function (g) { g.y = y; y += g.h + VGAP; });
      var top = c.kids[0].y, bot = c.kids[c.kids.length - 1].y + c.kids[c.kids.length - 1].h; c.y = (top + bot) / 2 - c.h / 2;
      if (c.y < y0 && c.kids.length === 1) c.y = y0;
      y += 5;
    });
    var lastBottom = Math.max.apply(null, items.map(function (i) { return (i.y || 0) + i.h; }).concat([PADY]));
    if (r.kids.length) { var a = r.kids[0], z = r.kids[r.kids.length - 1]; r.y = ((a.y) + (z.y + z.h)) / 2 - r.h / 2; } else r.y = PADY;
    items.forEach(function (it) { it.x = x[it.lv]; it.cx = it.x + it.w / 2; it.cy = it.y + it.h / 2; });
    var W = x[2] + COLS[2].w + MARG, H = lastBottom + PADY + 4;
    if (!root.children.some(function (cid) { return G.nodes[cid] && G.nodes[cid].children.length; })) W = x[1] + COLS[1].w + MARG;   // sin tercer nivel: más ancho para el texto
    return { items: items, byId: byId, root: r, W: W, H: Math.max(H, 120) };
  }

  /* ---------- lienzos ---------- */
  function paint() {
    var T = impl(), F = S.F; if (!F || !S.back) return;
    var pr = Math.min(2, window.devicePixelRatio || 1), t = reduce() ? 2.4 : performance.now() / 1000;
    var V = { x0: 0, y0: 0, x1: S.W, y1: S.H, W: S.W, H: S.H, sc: S.s * 1 };
    [['back', 'before'], ['front', 'after']].forEach(function (p) {
      var cv = S[p[0]], ctx = cv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(pr, 0, 0, pr, 0, 0);
      try {
        if (S.mode === 'tree' || S.mode === 'blocks') {
          if (p[1] === 'before') {
            if (S.mode === 'blocks' && T) { ctx.save(); T.blocks.before.call(T.blocks, ctx, F, V, pr, t); ctx.restore(); } else { ctx.fillStyle = '#0b1118'; ctx.fillRect(0, 0, S.W, S.H); }
            ctx.save(); ctx.setTransform(pr, 0, 0, pr, 0, 0); ctx.lineWidth = 2; ctx.lineCap = 'round';
            F.links.forEach(function (L) { var a = L.a, b = L.b, sx = a.x + a.w, sy = a.cy, ex = b.x, ey = b.cy; ctx.strokeStyle = hexA(b.color, 0.75); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo((sx + ex) / 2, sy, (sx + ex) / 2, ey, ex, ey); ctx.stroke(); });
            ctx.restore();
          } else if (S.mode === 'blocks' && T) { ctx.save(); T.blocks.after.call(T.blocks, ctx, F, V, pr, t); ctx.restore(); }
        } else if (T && T[S.mode]) { ctx.save(); T[S.mode][p[1]].call(T[S.mode], ctx, F, V, pr, t); ctx.restore(); }
      } catch (e) { console.error('[mapview]', e); }
    });
  }
  function hexA(c, a) { var r = hexRgb(c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
  function loop() {
    S.raf = 0; var st = S.st; if (!st || !st.isConnected || S.mode === 'tree' || reduce()) return;
    var now = performance.now();
    if (!document.hidden && now - S.last > 45) { S.last = now; paint(); }
    S.raf = requestAnimationFrame(loop);
  }

  /* ---------- zoom (pellizco) y escala ---------- */
  function setScale(s, keepX, keepY) {
    var st = S.st; if (!st) return; s = Math.max(S.fit * 0.8, Math.min(2, s));
    var wx = (st.scrollLeft + keepX) / S.s, wy = (st.scrollTop + keepY) / S.s; S.s = s;
    var pad = st.querySelector('.mv-pad'), world = st.querySelector('.mv-world');
    pad.style.width = Math.round(S.W * s) + 'px'; pad.style.height = Math.round(S.H * s) + 'px'; world.style.transform = 'scale(' + s + ')';
    st.scrollLeft = wx * s - keepX; st.scrollTop = wy * s - keepY;
  }
  function pinch(st) {
    var d0 = 0, s0 = 1, cx = 0, cy = 0;
    var dist = function (t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); };
    st.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { d0 = dist(e.touches); s0 = S.s; var r = st.getBoundingClientRect(); cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left; cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top; } }, { passive: true });
    st.addEventListener('touchmove', function (e) { if (e.touches.length === 2 && d0) { e.preventDefault(); setScale(s0 * dist(e.touches) / d0, cx, cy); } }, { passive: false });
    st.addEventListener('touchend', function (e) { if (e.touches.length < 2) d0 = 0; }, { passive: true });
  }

  /* ---------- interfaz: fila de vistas ---------- */
  function bar(onMode) {
    var onPick = function (m) { if (m === S.mode) return; S.mode = m; try { localStorage.setItem('gk_m_view', m); } catch (e) { /* ok */ } if (onMode) onMode(m); };
    var bx = document.getElementById('mvBar');
    if (!bx) { bx = document.createElement('div'); bx.id = 'mvBar'; bx.setAttribute('role', 'tablist'); bx.setAttribute('aria-label', 'Vista del mapa'); var mb = document.getElementById('mapbar'); mb.parentNode.insertBefore(bx, mb.nextSibling); }
    bx.hidden = false; bx.innerHTML = '';
    MODES.forEach(function (m) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.m = m[0]; b.textContent = m[1]; b.setAttribute('aria-selected', m[0] === S.mode ? 'true' : 'false'); b.onclick = function () { onPick(m[0]); }; bx.appendChild(b); });
    var act = bx.querySelector('[aria-selected="true"]'); if (act) { try { bx.scrollLeft = Math.max(0, act.offsetLeft - 40); } catch (e) { /* ok */ } }
  }

  /* ---------- dibujar el mapa ---------- */
  function render(o) {   // o: { stage, G, cur, animate, palette, onTap }
    var st = o.stage, token = ++S.token; S.st = st;
    var L = build(o.G, o.cur, st); if (!L) return false;
    st.innerHTML = ''; st.className = 'mv mv-on mv-' + S.mode;
    var avail = st.clientWidth || 360; S.fit = Math.min(1, avail / L.W); S.fit = Math.max(S.fit, 0.78);
    S.s = S.fit; S.W = L.W; S.H = L.H;
    var pad = document.createElement('div'); pad.className = 'mv-pad'; pad.style.width = Math.round(L.W * S.s) + 'px'; pad.style.height = Math.round(L.H * S.s) + 'px';
    var world = document.createElement('div'); world.className = 'mv-world'; world.style.width = L.W + 'px'; world.style.height = L.H + 'px'; world.style.transform = 'scale(' + S.s + ')';
    var pr = Math.min(2, window.devicePixelRatio || 1);
    function lienzo(cls) { var c = document.createElement('canvas'); c.className = 'mv-cv ' + cls; c.width = Math.round(L.W * pr); c.height = Math.round(L.H * pr); c.style.width = L.W + 'px'; c.style.height = L.H + 'px'; return c; }
    S.back = lienzo('mv-back'); S.front = lienzo('mv-front');
    world.appendChild(S.back);
    var list = [];
    L.items.forEach(function (it, i) {
      var col = it.lv === 0 ? LEVEL[0] : (S.mode === 'tree' ? { bg: '#0e1520', bd: it.color || o.palette[0] } : LEVEL[it.lv]);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mv-n mv-l' + it.lv + (it.done && it.lv > 0 ? ' done' : ''); b.dataset.id = it.id;
      b.style.cssText = 'left:' + it.x + 'px;top:' + it.y + 'px;width:' + it.w + 'px;min-height:' + it.h + 'px;--c:' + col.bd + ';--bg:' + col.bg + ';font-size:' + COLS[it.lv].fs + 'px';
      b.textContent = it.label; b.setAttribute('aria-label', it.label + (it.done && it.lv > 0 ? ' (ya ampliado)' : ''));
      if (it.lv === 0) b.tabIndex = -1;
      if (it.done && it.lv > 0) b.insertAdjacentHTML('beforeend', '<span class="badge" title="Ya ampliado"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>');
      world.appendChild(b);
      var node = { id: it.id, label: it.label, x: it.x, y: it.y, w: it.w, h: it.h, cx: it.cx, cy: it.cy, lv: it.lv, c: { bg: hexRgb(col.bg), bd: hexRgb(col.bd) }, color: col.bd };
      it.F = node; list.push(node);
      var d = o.animate ? 40 + it.lv * 220 + i * 28 : 0; if (o.animate) setTimeout(function () { if (token === S.token) b.classList.add('show'); }, d); else b.classList.add('show');
    });
    world.appendChild(S.front);
    pad.appendChild(world); st.appendChild(pad);
    // enlaces con los nodos ya en forma de caja para las rutinas de dibujo
    var links = []; L.items.forEach(function (it) { if (it.parent) links.push({ a: it.parent.F, b: it.F, key: it.parent.id + '>' + it.id }); });
    S.F = { list: list, byId: {}, links: links }; list.forEach(function (n) { S.F.byId[n.id] = n; });
    S.layout = L;
    paint();
    // posición inicial: la raíz a la vista
    st.scrollLeft = 0; st.scrollTop = Math.max(0, L.root.cy * S.s - st.clientHeight / 2);
    if (!st.__mvWired) { st.__mvWired = true; pinch(st); }
    st.onclick = function (e) { var b = e.target.closest('.mv-n'); if (b && o.onTap) o.onTap(b.dataset.id); };
    if (!S.raf && S.mode !== 'tree') S.raf = requestAnimationFrame(loop);
    bar(o.onMode);
    return true;
  }

  /* ---------- «Foto» ---------- */
  function photo(title) {
    var T = window.__gkV3; if (!T || !T.snapshot || !S.F) return Promise.resolve(false);
    var mode = S.mode === 'tree' ? 'flat' : S.mode;
    return T.snapshot({ mode: mode, list: S.F.list, links: S.F.links, title: title, scale: 3 }).then(function (b) { return T.shareBlob(b, 'graphikosmos-mapa.png', title); });
  }
  function hide() { var b = document.getElementById('mvBar'); if (b) b.hidden = true; if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; } }
  function showBar() { var b = document.getElementById('mvBar'); if (b) b.hidden = false; }
  window.GK_MV = { render: render, bar: bar, photo: photo, hide: hide, showBar: showBar, mode: function () { return S.mode; }, modes: MODES, ready: function () { return !!impl(); }, _S: S };
})();
