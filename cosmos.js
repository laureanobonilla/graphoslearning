/* Cosmos: el mismo mapa mental visto en 3D, como un recorrido en primera persona.
   Usa los nodos y enlaces que ya existen (globales `nodes` y `edges` de app.js); no cuesta nada ni pide nada al servidor.
   Elegir una idea aquí la marca también en el texto (izquierda) y en las definiciones (derecha), igual que el mapa mental.
   Se abre desde la pestaña «Cosmos» (chat.js) con GK_NAV.go('cosmos'). */
(function () {
  'use strict';
  const EN = () => !!(window.I18N && window.I18N.lang === 'en');
  const L = (es, en) => (EN() ? en : es);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trk = (e, m) => { try { if (typeof track === 'function') track(e, m || {}); } catch (_e) { /* nunca debe notarse */ } };
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sm = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const PAL = [[122, 167, 217], [208, 170, 110], [126, 184, 160], [176, 140, 168], [150, 165, 214], [200, 128, 118], [116, 186, 196], [184, 184, 120]];

  let pane = null, cv = null, ctx = null, card = null, hud = null, legEl = null, emptyEl = null, tipEl = null, titleEl = null;
  let libMode = false, on = false, raf = 0, W = 0, H = 0, DPR = 1, F = 600, geoT = 0, pollT = 0;
  let M = null, sig = '';                      // modelo actual
  const cam = { tx: 0, ty: 0, tz: 0, yaw: 0.5, pitch: 0.18, dist: 14 };
  let fly = null, tour = null, idleAt = 0, sel = null, hover = null, drag = null, picks = [], self = false;
  const sprites = {};
  const back = document.createElement('canvas');

  /* ---------- datos del mapa ---------- */
  const labelOf = (n) => String(n.baseTitle || n.label || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  function readModel() {
    try { return modelFrom(nodes.get(), edges.get()); } catch (_e) { return null; }
  }
  function modelFrom(allNodes, allEdges) {
    const all = allNodes.filter((n) => !n.isSubscheme && !n.isPointer && labelOf(n)), es = allEdges;
    const ids = new Set(all.map((n) => String(n.id)));
    const kids = new Map(), parent = new Map();
    es.forEach((e) => {
      const a = String(e.from), b = String(e.to);
      if (!ids.has(a) || !ids.has(b) || parent.has(b) || a === b) return;
      parent.set(b, a); if (!kids.has(a)) kids.set(a, []); kids.get(a).push(b);
    });
    const byId = new Map(all.map((n) => [String(n.id), n]));
    const roots = all.map((n) => String(n.id)).filter((id) => !parent.has(id));
    return { all, byId, kids, parent, roots };
  }
  function sizeOf(id, kids, memo) { if (memo.has(id)) return memo.get(id); let s = 1; (kids.get(id) || []).forEach((k) => { s += sizeOf(k, kids, memo); }); memo.set(id, s); return s; }

  /* ---------- disposición 3D: ramas que se abren en abanico desde cada idea ---------- */
  function layout(m) {
    const memo = new Map(), pos = new Map(), depth = new Map(), branch = new Map();
    const out = [];
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const rootIds = m.roots.slice().sort((a, b) => sizeOf(b, m.kids, memo) - sizeOf(a, m.kids, memo));
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    function fan(dir, k, spread, ph) {
      let u = cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]); u = norm(u);
      const v = cross(dir, u), res = [];
      for (let i = 0; i < k; i++) {
        const phi = ph + i * 2.39996, th = k === 1 ? 0 : spread * Math.sqrt((i + 0.5) / k);
        const c = Math.cos(th), s = Math.sin(th);
        res.push(norm([dir[0] * c + (u[0] * Math.cos(phi) + v[0] * Math.sin(phi)) * s, dir[1] * c + (u[1] * Math.cos(phi) + v[1] * Math.sin(phi)) * s, dir[2] * c + (u[2] * Math.cos(phi) + v[2] * Math.sin(phi)) * s]));
      }
      return res;
    }
    function sphere(k) {
      const res = [];
      for (let i = 0; i < k; i++) { const y = k === 1 ? 0 : 1 - (i + 0.5) * 2 / k, r = Math.sqrt(1 - y * y), phi = i * 2.39996; res.push([Math.cos(phi) * r, y * 0.85, Math.sin(phi) * r]); }
      return res;
    }
    const lenAt = (d, kidCount) => 3.1 * Math.pow(0.72, d) * (1 + Math.min(kidCount, 6) * 0.07);
    function place(id, p, dir, d, br) {
      pos.set(id, p); depth.set(id, d); branch.set(id, br);
      const ks = (m.kids.get(id) || []).slice().sort((a, b) => sizeOf(b, m.kids, memo) - sizeOf(a, m.kids, memo));
      if (!ks.length) return;
      const dirs = d === 0 ? sphere(ks.length) : fan(dir, ks.length, ks.length === 1 ? 0 : clamp(0.55 + ks.length * 0.12, 0.6, 1.25), rnd() * 6.28);
      ks.forEach((k, i) => {
        const l = lenAt(d, ks.length) * (0.85 + rnd() * 0.3), dv = dirs[i];
        place(k, [p[0] + dv[0] * l, p[1] + dv[1] * l, p[2] + dv[2] * l], dv, d + 1, d === 0 ? i : br);
      });
    }
    if (!rootIds.length) return null;
    const top = rootIds[0];
    place(top, [0, 0, 0], [0, 1, 0], 0, 0);
    rootIds.slice(1).forEach((r, i) => {            // varias raíces: cuelgan de la principal
      const a = i * 2.4 + 1, p = [Math.cos(a) * 4, ((i % 3) - 1) * 1.6, Math.sin(a) * 4];
      place(r, p, norm(p), 1, 100 + i);
      m.kids.set(top, (m.kids.get(top) || []).concat([r])); m.parent.set(r, top);
    });
    // un poco de repulsión para que no se encimen
    const ids = Array.from(pos.keys());
    for (let it = 0; it < 36; it++) {
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const A = pos.get(ids[i]), B = pos.get(ids[j]);
        let dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2]; const d = Math.hypot(dx, dy, dz) || 0.01;
        if (d < 0.95) { const f = (0.95 - d) * 0.35 / d; dx *= f; dy *= f; dz *= f; if (ids[i] !== top) { A[0] -= dx; A[1] -= dy; A[2] -= dz; } if (ids[j] !== top) { B[0] += dx; B[1] += dy; B[2] += dz; } }
      }
    }
    let rad = 1;
    ids.forEach((id) => {
      const n = m.byId.get(id), p = pos.get(id), d = depth.get(id);
      rad = Math.max(rad, Math.hypot(p[0], p[1], p[2]));
      out.push({ id, p, depth: d, c: d === 0 ? 0 : branch.get(id) % PAL.length, label: labelOf(n), n, ph: rnd() * 6.28, r: d === 0 ? 0.34 : d === 1 ? 0.2 : d === 2 ? 0.14 : 0.1 });
    });
    const byId = new Map(out.map((o) => [o.id, o]));
    const links = [];
    ids.forEach((id) => { const pa = m.parent.get(id); if (pa && byId.has(pa)) links.push({ a: byId.get(pa), b: byId.get(id), bow: (rnd() - 0.5) * 0.5 }); });
    return { list: out, byId, links, rad, top };
  }

  /* ---------- dibujo ---------- */
  function sprite(ci) {
    if (sprites[ci]) return sprites[ci];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), p = PAL[ci], gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, 'rgba(255,255,255,.95)'); gr.addColorStop(0.18, 'rgba(' + p.join(',') + ',.85)');
    gr.addColorStop(0.45, 'rgba(' + p.join(',') + ',.2)'); gr.addColorStop(1, 'rgba(' + p.join(',') + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return (sprites[ci] = c);
  }
  function buildBack() {
    back.width = Math.max(2, Math.round(W)); back.height = Math.max(2, Math.round(H));
    const g = back.getContext('2d'), w = back.width, h = back.height;
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#080c12'); bg.addColorStop(0.6, '#0d131c'); bg.addColorStop(1, '#06090e');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const blob = (x, y, r, rgb, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    blob(w * 0.28, h * 0.4, w * 0.4, '58,90,140', 0.26); blob(w * 0.74, h * 0.62, w * 0.36, '40,110,140', 0.17); blob(w * 0.55, h * 0.15, w * 0.3, '70,90,130', 0.15);
    let s = 5; const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(200,210,255,' + (0.15 + r() * 0.5) + ')'; g.fillRect(r() * w, r() * h, 1, 1); }
  }
  function camPos() {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return [cam.tx + Math.sin(cam.yaw) * cp * cam.dist, cam.ty + sp * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist];
  }
  let CP = [0, 0, 0], FW = [0, 0, -1], RT = [1, 0, 0], UP = [0, 1, 0];
  function setView() {
    CP = camPos();
    let f = [cam.tx - CP[0], cam.ty - CP[1], cam.tz - CP[2]]; const l = Math.hypot(f[0], f[1], f[2]) || 1; f = [f[0] / l, f[1] / l, f[2] / l];
    let r = [f[2], 0, -f[0]]; const rl = Math.hypot(r[0], r[2]) || 1; r = [r[0] / rl, 0, r[2] / rl];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    FW = f; RT = r; UP = [-u[0], -u[1], -u[2]];
    if (UP[1] < 0) UP = [-UP[0], -UP[1], -UP[2]];
  }
  const o3 = { x: 0, y: 0, z: 0, s: 0 };
  function proj(p, o) {
    const dx = p[0] - CP[0], dy = p[1] - CP[1], dz = p[2] - CP[2];
    const z = dx * FW[0] + dy * FW[1] + dz * FW[2]; o.z = z;
    if (z < 0.25) return false;
    const s = F / z; o.s = s;
    o.x = W / 2 + (dx * RT[0] + dy * RT[1] + dz * RT[2]) * s; o.y = H / 2 - (dx * UP[0] + dy * UP[1] + dz * UP[2]) * s;
    return true;
  }
  const fogA = (z) => clamp(1 - (z - cam.dist * 0.55) / (M.rad * 3.2 + cam.dist * 0.5), 0.12, 1) * sm(0.25, 1.1, z);

  function draw(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(back, 0, 0, W, H);
    if (!M) return;
    setView();
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    const A = o3, B = { x: 0, y: 0, z: 0, s: 0 };
    const selId = sel, selSet = new Set(); if (selId) { selSet.add(selId); const pa = M.model.parent.get(selId); if (pa) selSet.add(pa); (M.model.kids.get(selId) || []).forEach((k) => selSet.add(k)); }
    // ramas
    M.links.forEach((e) => {
      const a = e.a.p, b = e.b.p, mx = [(a[0] + b[0]) / 2 + e.bow, (a[1] + b[1]) / 2 + Math.abs(e.bow) * 0.6, (a[2] + b[2]) / 2 - e.bow];
      const col = e.cross ? [232, 200, 140] : PAL[e.b.c], hot = selId && (e.a.id === selId || e.b.id === selId);
      let pa = null;
      for (let i = 0; i <= 8; i++) {
        const k = i / 8, ik = 1 - k;
        const q = [ik * ik * a[0] + 2 * ik * k * mx[0] + k * k * b[0], ik * ik * a[1] + 2 * ik * k * mx[1] + k * k * b[1], ik * ik * a[2] + 2 * ik * k * mx[2] + k * k * b[2]];
        if (!proj(q, A)) { pa = null; continue; }
        if (pa) {
          const fa = fogA((A.z + pa.z) / 2) * (selId && !hot ? 0.55 : 1), lw = clamp((e.cross ? 2.6 : e.b.depth <= 1 ? 2.2 : 1.3) * (A.s / 120), 0.5, 4);
          ctx.strokeStyle = 'rgba(' + col.join(',') + ',' + ((hot ? 0.9 : e.cross ? 0.85 : 0.5) * fa).toFixed(3) + ')'; ctx.lineWidth = lw * (hot ? 3 : 2.4);
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(A.x, A.y); ctx.stroke();
          ctx.strokeStyle = (e.cross ? 'rgba(250,222,160,' : 'rgba(235,240,255,') + ((hot ? 0.8 : e.cross ? 0.75 : 0.42) * fa).toFixed(3) + ')'; ctx.lineWidth = Math.max(0.6, lw * 0.5);
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(A.x, A.y); ctx.stroke();
        }
        pa = { x: A.x, y: A.y, z: A.z };
      }
    });
    // nodos (lejos → cerca)
    const vis = [];
    M.list.forEach((n) => { if (proj(n.p, A)) vis.push({ n, x: A.x, y: A.y, z: A.z, s: A.s }); });
    vis.sort((p, q) => q.z - p.z);
    picks = [];
    vis.forEach((o) => {
      const n = o.n, fa = fogA(o.z), isSel = n.id === selId, isHov = n.id === hover;
      const rad = n.r * o.s * (1 + 0.1 * Math.sin(t * 2.6 + n.ph)) * (isSel ? 1.5 : isHov ? 1.2 : 1);
      const g = Math.max(rad * 5, 6);
      ctx.globalAlpha = Math.min(1, fa * (selId && !selSet.has(n.id) ? 0.55 : 1) * 1.15);
      ctx.drawImage(sprite(n.c), o.x - g, o.y - g, g * 2, g * 2);
      ctx.fillStyle = '#fff'; ctx.globalAlpha = Math.min(1, fa);
      ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(1.3, rad * 0.42), 0, 6.283); ctx.fill();
      if (isSel) {
        ctx.globalAlpha = 0.7; ctx.strokeStyle = 'rgba(' + PAL[n.c].join(',') + ',1)'; ctx.lineWidth = 1.6;
        const rr = rad * (2.6 + 0.35 * Math.sin(t * 3)); ctx.beginPath(); ctx.arc(o.x, o.y, rr, 0, 6.283); ctx.stroke();
      }
      picks.push({ id: n.id, x: o.x, y: o.y, r: Math.max(rad * 2.2, 11), z: o.z });
    });
    // etiquetas (de cerca a lejos; sin encimarse)
    ctx.globalCompositeOperation = 'source-over';
    const boxes = [];
    for (let i = vis.length - 1; i >= 0; i--) {
      const o = vis[i], n = o.n, isSel = n.id === selId, isHov = n.id === hover;
      const fa = fogA(o.z); if (fa < 0.25 && !isSel) continue;
      let txt = n.label; const lim = isSel || isHov ? 60 : (n.depth <= 1 ? 30 : 24);
      if (txt.length > lim) txt = txt.slice(0, lim - 1) + '…';
      const fs = clamp(o.s * (n.depth === 0 ? 0.15 : n.depth === 1 ? 0.12 : 0.1), 9, isSel ? 26 : 21) * (isSel ? 1.1 : 1);
      ctx.font = (n.depth <= 1 || isSel ? '700 ' : '600 ') + fs.toFixed(1) + 'px Sora, Inter, system-ui, sans-serif';
      const w = ctx.measureText(txt).width, x = o.x + Math.max(n.r * o.s * 1.4, 7) + 6, y = o.y;
      const bx = { l: x - 3, r: x + w + 3, t: y - fs * 0.7, b: y + fs * 0.7 };
      if (!isSel && !isHov && boxes.some((q) => !(bx.r < q.l || bx.l > q.r || bx.b < q.t || bx.t > q.b))) continue;
      boxes.push(bx);
      ctx.globalAlpha = (isSel || isHov ? 1 : clamp(fa * 1.2, 0, 0.95)) * (selId && !selSet.has(n.id) && !isHov ? 0.6 : 1);
      ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(4,5,15,.95)'; ctx.shadowBlur = 7; ctx.fillStyle = '#06090e'; ctx.fillText(txt, x, y);
      ctx.shadowColor = 'rgba(' + PAL[n.c].join(',') + ',.85)'; ctx.shadowBlur = isSel ? 18 : 10; ctx.fillStyle = isSel ? '#fff' : '#e8ebf0'; ctx.fillText(txt, x, y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- movimiento ---------- */
  function frame(now) {
    if (!on) return;
    raf = requestAnimationFrame(frame);
    const t = now / 1000;
    if (fly) {
      const k = clamp((now - fly.t0) / fly.d, 0, 1), e = ease(k);
      ['tx', 'ty', 'tz', 'dist', 'yaw', 'pitch'].forEach((p) => { cam[p] = fly.a[p] + (fly.b[p] - fly.a[p]) * e; });
      if (k >= 1) { fly = null; if (tour) tour.nextAt = now + 2300; }
    } else if (tour && now >= tour.nextAt) {
      tourNext();
    } else if (!drag && now > idleAt) {
      cam.yaw += 0.0011;                               // deriva suave cuando nadie toca nada
    }
    draw(t);
  }
  function flyTo(b, ms) {
    const a = { tx: cam.tx, ty: cam.ty, tz: cam.tz, dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch };
    let dy = ((b.yaw == null ? cam.yaw : b.yaw) - cam.yaw); dy = ((dy + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    fly = { a, b: { tx: b.tx, ty: b.ty, tz: b.tz, dist: b.dist, yaw: cam.yaw + dy, pitch: b.pitch == null ? cam.pitch : b.pitch }, t0: performance.now(), d: ms || 1100 };
  }
  function overview(ms) {
    if (!M) return;
    flyTo({ tx: 0, ty: 0, tz: 0, dist: clamp(M.rad * 2.7 + 2, 8, 60), pitch: 0.22 }, ms);
  }
  function select(id, opts) {
    const n = M && M.byId.get(id); if (!n) return;
    sel = id; idleAt = performance.now() + 5000;
    flyTo({ tx: n.p[0], ty: n.p[1], tz: n.p[2], dist: n.depth === 0 ? Math.max(5, M.rad * 1.4) : 3.2, pitch: cam.pitch * 0.8 }, (opts && opts.ms) || 1100);
    showCard(n);
    if ((!opts || !opts.silent) && !libMode) {              // el texto y las definiciones siguen a la idea elegida, como en el mapa mental
      self = true;
      try { if (window.gkDefsGoTo) window.gkDefsGoTo(n.n.id); } catch (_e) { /* nada */ }
      try { document.dispatchEvent(new CustomEvent('gk:nodepick', { detail: n.n.id })); } catch (_e) { /* nada */ }
      self = false;
      trk('cosmos_pick', { depth: n.depth, tour: !!(opts && opts.tour) });
    } else if (libMode && (!opts || !opts.silent)) trk('lib_pick', { depth: n.depth, cross: (M.lib.cross.get(id) || []).length });
  }
  function showCard(n) {
    if (!card) return;
    const d = String(n.n.definition || '').replace(/\s+/g, ' ').trim(), s = String(n.n.simple || n.n.simpleExplanation || '').replace(/\s+/g, ' ').trim(), ex = String(n.n.example || '').replace(/\s+/g, ' ').trim();
    const path = []; let c = n.id, g = 0; while (M.model.parent.has(c) && g++ < 8) { c = M.model.parent.get(c); const q = M.byId.get(c); if (q) path.unshift(q.label); }
    card.innerHTML = '<div class="cs-ct"><i style="background:rgb(' + PAL[n.c].join(',') + ')"></i>' + esc(n.label) + '<button type="button" class="cs-x" aria-label="' + esc(L('Cerrar', 'Close')) + '">×</button></div>' +
      (path.length ? '<div class="cs-cp">' + esc(path.join(' › ')) + '</div>' : '') +
      (d ? '<p>' + esc(d.length > 420 ? d.slice(0, 420) + '…' : d) + '</p>' : '') +
      (s ? '<p class="cs-s">' + esc(s.length > 280 ? s.slice(0, 280) + '…' : s) + '</p>' : '') +
      (ex ? '<p class="cs-s"><b>' + esc(L('Ejemplo', 'Example')) + ':</b> ' + esc(ex.length > 240 ? ex.slice(0, 240) + '…' : ex) + '</p>' : '') +
      libExtra(n) +
      (!d && !s && !ex ? '<p class="cs-s">' + esc(L('Esta idea aún no tiene definición. Ábrela en el mapa mental para pedirla.', 'This idea has no definition yet. Open it in the mind map to request one.')) + '</p>' : '');
    card.hidden = false;
  }
  function libExtra(n) {
    if (!libMode || !M.lib) return '';
    const pr = M.lib.projects[n.proj]; const cr = M.lib.cross.get(n.id) || [];
    let h = '<div class="cs-pj"><b>' + esc(L('Mapa', 'Map')) + ':</b> ' + esc(pr ? pr.title : '') + ' <button type="button" class="cs-open" data-open="' + esc(pr ? pr.id : '') + '">' + esc(L('Abrir este mapa', 'Open this map')) + '</button></div>';
    if (cr.length) h += '<div class="cs-cr"><b>' + esc(L('Se conecta con', 'Connects to')) + ':</b>' + cr.slice(0, 5).map((c) => { const t = M.byId.get(c.to); return t ? '<button type="button" class="cs-go" data-go="' + esc(c.to) + '"><i style="background:rgb(' + PAL[t.c].join(',') + ')"></i>' + esc(t.label) + ' <small>' + esc((M.lib.projects[t.proj] || {}).title || '') + '</small>' + (c.why ? '<em>' + esc(c.why) + '</em>' : '') + '</button>' : ''; }).join('') + '</div>';
    return h;
  }
  /* recorrido: visita las ideas principales y sus ramas, una a una */
  function buildTour() {
    if (M.lib) return M.lib.tops.slice(0, 16);
    const seq = [M.top]; const walk = (id, d) => { (M.model.kids.get(id) || []).slice(0, d === 0 ? 7 : 2).forEach((k) => { seq.push(k); if (d < 1) walk(k, d + 1); }); };
    walk(M.top, 0); return seq.slice(0, 16);
  }
  function tourNext() {
    if (!tour) return;
    if (tour.i >= tour.seq.length) { stopTour(); overview(1400); return; }
    const id = tour.seq[tour.i++]; select(id, { tour: true, ms: 1700 });
  }
  function startTour() {
    if (!M) return; tour = { seq: buildTour(), i: 0, nextAt: 0 }; trk('cosmos_tour', { n: tour.seq.length }); paintHud(); tourNext();
  }
  function stopTour() { tour = null; paintHud(); }
  function paintHud() {
    if (!hud) return;
    const b = hud.querySelector('[data-a="tour"]'); if (b) b.textContent = tour ? '⏸ ' + L('Detener', 'Stop') : '▶ ' + L('Recorrido', 'Tour');
  }

  /* ---------- entrada del usuario ---------- */
  function pickAt(x, y) { let best = null, bd = 1e9; picks.forEach((p) => { const d = Math.hypot(p.x - x, p.y - y); if (d < p.r && (d - p.r * 0.2 < bd || (best && p.z < best.z && d < p.r * 0.8))) { best = p; bd = d - p.r * 0.2; } }); return best && best.id; }
  function bind() {
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: 0 }; fly = null; if (tour) stopTour(); idleAt = performance.now() + 5000; });
    cv.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        cam.yaw -= dx * 0.006; cam.pitch = clamp(cam.pitch + dy * 0.005, -1.35, 1.35); idleAt = performance.now() + 5000;
      } else { const h = pickAt(x, y); if (h !== hover) { hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; } }
    });
    cv.addEventListener('pointerup', (e) => {
      const was = drag; drag = null;
      if (was && was.moved < 5) { const r = cv.getBoundingClientRect(), id = pickAt(e.clientX - r.left, e.clientY - r.top); if (id) select(id); }
    });
    cv.addEventListener('dblclick', (e) => { const r = cv.getBoundingClientRect(); if (!pickAt(e.clientX - r.left, e.clientY - r.top)) { sel = null; if (card) card.hidden = true; overview(); } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault(); if (tour) stopTour(); fly = null; idleAt = performance.now() + 5000;
      cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0013), 1.6, M ? M.rad * 5 + 10 : 60);
    }, { passive: false });
    pane.addEventListener('click', (e) => {
      const op = e.target.closest('[data-open]'); if (op) { openProject(op.dataset.open); return; }
      const gg = e.target.closest('[data-go]'); if (gg) { select(gg.dataset.go); return; }
      const lg = e.target.closest('[data-proj]'); if (lg && M && M.lib) { const t = M.lib.tops[+lg.dataset.proj]; if (t) select(t); return; }
      const b = e.target.closest('[data-a]'); if (b) { const a = b.dataset.a; if (a === 'tour') { tour ? stopTour() : startTour(); } else if (a === 'reset') { stopTour(); sel = null; card.hidden = true; overview(); trk('cosmos_reset'); } return; }
      if (e.target.closest('.cs-x')) { sel = null; card.hidden = true; }
    });
    document.addEventListener('gk:nodepick', (e) => { if (!on || self || e.detail == null || !M) return; const id = String(e.detail); if (M.byId.has(id) && id !== sel) select(id, { silent: true }); });
    window.addEventListener('resize', () => { if (on) resize(); });
  }

  /* ---------- panel ---------- */
  const CSS = '#cosPane{position:fixed;z-index:20;display:none;overflow:hidden;background:#080c12;font-family:Inter,system-ui,sans-serif;color:#e8ebf0;border-top:1px solid #1e2633}' +
    '#cosPane [hidden]{display:none !important}#cosPane.on{display:block}#cosPane canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none}#cosPane canvas:active{cursor:grabbing}' +
    '#cosPane .cs-hud{position:absolute;left:14px;top:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;pointer-events:none}' +
    '#cosPane .cs-hud>*{pointer-events:auto}#cosPane .cs-t{font:600 17px Newsreader,Georgia,serif;color:#e8ebf0;margin-right:4px;pointer-events:none}' +
    '#cosPane .cs-b{border:1px solid rgba(122,167,217,.4);background:rgba(14,19,26,.72);color:#c3cad6;border-radius:999px;padding:6px 13px;font:600 12.5px Inter,sans-serif;cursor:pointer;backdrop-filter:blur(6px)}' +
    '#cosPane .cs-b:hover,#cosPane .cs-b:focus-visible{background:rgba(122,167,217,.35);color:#fff;outline:none;border-color:#7aa7d9}' +
    '#cosPane .cs-tip{position:absolute;left:14px;bottom:12px;font-size:11.5px;color:#8b94a5;pointer-events:none;max-width:60%}' +
    '#cosPane .cs-card{position:absolute;right:14px;bottom:14px;width:min(380px,calc(100% - 28px));max-height:46%;overflow:auto;background:rgba(14,19,26,.88);border:1px solid rgba(122,167,217,.35);border-radius:14px;padding:13px 15px;backdrop-filter:blur(10px);box-shadow:0 10px 40px rgba(0,0,0,.45)}' +
    '#cosPane .cs-ct{display:flex;align-items:center;gap:8px;font:700 15px Sora,Inter,sans-serif;color:#fff}#cosPane .cs-ct i{width:10px;height:10px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 10px currentColor}' +
    '#cosPane .cs-x{margin-left:auto;background:none;border:0;color:#8b94a5;font-size:20px;line-height:1;cursor:pointer}' +
    '#cosPane .cs-pj{margin:8px 0 0;font-size:12.5px;color:#c3cad6}#cosPane .cs-open{margin-left:6px;border:1px solid #2a3342;background:#1e2633;color:#e8ebf0;border-radius:999px;padding:3px 10px;font:600 11.5px Inter,sans-serif;cursor:pointer}#cosPane .cs-open:hover{border-color:#7aa7d9}' +
    '#cosPane .cs-cr{margin-top:8px;font-size:12px;color:#a9b1bf;display:flex;flex-direction:column;gap:4px}#cosPane .cs-go{display:flex;align-items:center;gap:6px;text-align:left;background:rgba(30,38,51,.7);border:1px solid #2a3342;border-radius:8px;padding:5px 8px;color:#e8ebf0;font:600 12px Inter,sans-serif;cursor:pointer;flex-wrap:wrap}#cosPane .cs-go:hover{border-color:#d0aa6e}#cosPane .cs-go i{width:8px;height:8px;border-radius:50%}#cosPane .cs-go small{color:#8b94a5;font-weight:500}#cosPane .cs-go em{flex-basis:100%;font-style:normal;color:#d0aa6e;font-weight:500;font-size:11px}' +
    '#cosPane .cs-leg{position:absolute;left:14px;top:50px;display:flex;flex-wrap:wrap;gap:6px;max-width:min(70%,640px)}#cosPane .cs-leg button{display:inline-flex;align-items:center;gap:6px;border:1px solid #2a3342;background:rgba(14,19,26,.78);color:#c3cad6;border-radius:999px;padding:4px 10px;font:600 11.5px Inter,sans-serif;cursor:pointer;backdrop-filter:blur(6px);max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}#cosPane .cs-leg button:hover{border-color:#7aa7d9;color:#fff}#cosPane .cs-leg i{width:8px;height:8px;border-radius:50%;flex:0 0 auto}' +
    '#cosPane .cs-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;color:#a9b1bf;font-size:14px;line-height:1.55;gap:8px}#cosPane .cs-empty b{font:600 22px Newsreader,Georgia,serif;color:#e8ebf0}' +
    '#cosPane .cs-cp{font-size:11px;color:#8b94a5;margin:3px 0 6px}#cosPane .cs-card p{margin:6px 0 0;font-size:13px;line-height:1.5;color:#d3d9e4}#cosPane .cs-card p.cs-s{color:#a9b1bf;font-size:12.5px}';
  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    pane = document.createElement('section'); pane.id = 'cosPane'; pane.setAttribute('aria-label', 'Cosmos');
    pane.innerHTML = '<canvas role="img" aria-label="' + esc(L('Mapa mental en 3D. Arrastra para girar, rueda para acercarte, clic en una idea para elegirla.', '3D mind map. Drag to turn, wheel to zoom, click an idea to pick it.')) + '"></canvas>' +
      '<div class="cs-hud"><span class="cs-t">Cosmos</span><button type="button" class="cs-b" data-a="tour"></button><button type="button" class="cs-b" data-a="reset">⟲ ' + esc(L('Ver todo', 'See all')) + '</button></div>' +
      '<div class="cs-leg" hidden></div><div class="cs-empty" hidden></div>' +
      '<div class="cs-tip">' + esc(L('Arrastra para girar · rueda para acercarte · clic en una idea para ver su definición', 'Drag to turn · wheel to zoom · click an idea to see its definition')) + '</div>' +
      '<div class="cs-card" hidden></div>';
    document.body.appendChild(pane);
    cv = pane.querySelector('canvas'); ctx = cv.getContext('2d'); card = pane.querySelector('.cs-card'); hud = pane.querySelector('.cs-hud');
    legEl = pane.querySelector('.cs-leg'); emptyEl = pane.querySelector('.cs-empty'); tipEl = pane.querySelector('.cs-tip'); titleEl = pane.querySelector('.cs-t');
    paintHud(); bind();
  }
  function geo() {
    if (!pane) return;
    const vis = (id) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden') && e.offsetWidth > 0 ? e : null; };
    const rd = vis('readerPanel'), tp = document.getElementById('topicPanel'), dv = vis('defsView');
    const l = rd ? rd.getBoundingClientRect().width : (tp && tp.classList.contains('on') ? tp.getBoundingClientRect().width : 0);
    const r = dv ? dv.getBoundingClientRect().width : 0;
    const hd = document.getElementById('mainHeader'), top = hd ? hd.getBoundingClientRect().bottom : 60;
    const cs = getComputedStyle(document.body), pv = (k) => parseInt(cs.getPropertyValue(k), 10) || 0;
    const bottom = pv('--gk-notes-h') + pv('--gk-comp-h');
    const s = pane.style; const nl = Math.round(l) + 'px', nr = Math.round(r) + 'px', nt = Math.round(top) + 'px', nb = bottom + 'px';
    if (s.left !== nl || s.right !== nr || s.top !== nt || s.bottom !== nb) { s.left = nl; s.right = nr; s.top = nt; s.bottom = nb; resize(); }
  }
  function resize() {
    if (!pane) return;
    DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = pane.clientWidth, h = pane.clientHeight; if (!w || !h) return;
    W = w; H = h; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    F = Math.min(W, H * 1.4) * 0.95; buildBack();
  }
  function rebuild(keepCam) {
    const m = readModel(); if (!m || m.all.length < 2) { M = null; return false; }
    const lay = layout(m); if (!lay) { M = null; return false; }
    M = Object.assign(lay, { model: m });
    if (!keepCam) { cam.tx = cam.ty = cam.tz = 0; cam.dist = clamp(M.rad * 2.7 + 2, 8, 60); }
    if (sel && !M.byId.has(sel)) { sel = null; if (card) card.hidden = true; }
    return true;
  }
  const signature = () => { try { return nodes.length + '|' + edges.length + '|' + nodes.get().map((n) => n.id + ':' + labelOf(n)).join(',').length; } catch (_e) { return ''; } };

  /* ---------- Biblioteca: todos los mapas guardados juntos, con puentes entre ideas parecidas ---------- */
  const STOP = new Set('de la el los las un una unos unas y o u en del al que se por con para como su sus es son lo le les mas pero sin sobre entre desde hasta este esta estos estas ese esa eso muy the of and to in is are for on with as by that this from or an be it its'.split(' '));
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  async function gather() {
    let cat = [];
    try { cat = JSON.parse(localStorage.getItem('gk_projects_' + getActiveUserKey()) || '[]'); } catch (_e) { cat = []; }
    cat = cat.filter((e) => e && e.id).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);
    const got = await Promise.all(cat.map(async (e) => {
      let rec = null;
      try { const raw = localStorage.getItem('gk_proj_snapshot_' + e.id); if (raw) rec = JSON.parse(raw); } catch (_e) { rec = null; }
      if (!rec && !String(e.id).startsWith('local_')) {
        try { const r = await fetch('/.netlify/functions/db?projectId=' + encodeURIComponent(e.id)); if (r.ok) { const j = await r.json(); rec = j && j.data; } } catch (_e) { rec = null; }
      }
      return rec && Array.isArray(rec.nodes) && rec.nodes.length >= 2 ? { id: e.id, title: e.title || L('Mapa', 'Map'), nodes: rec.nodes, edges: rec.edges || [] } : null;
    }));
    return got.filter(Boolean);
  }
  function crossLinks(items) {
    const docs = items.map((it) => {
      const w = new Map(); const add = (t, wt) => norm(t).split(' ').forEach((x) => { if (x.length >= 4 && !STOP.has(x)) { const k = x.slice(0, 6), o = w.get(k) || { w: 0, orig: x }; o.w += wt; w.set(k, o); } });
      add(it.label, 3); add(it.def, 1); add(it.simple, 0.5); return w;
    });
    const df = new Map(); docs.forEach((d) => d.forEach((_v, k) => df.set(k, (df.get(k) || 0) + 1)));
    const N = docs.length, idf = (k) => Math.log(1 + N / (df.get(k) || 1));
    const vec = docs.map((d) => { let sq = 0; const v = new Map(); d.forEach((o, k) => { const x = o.w * idf(k); v.set(k, x); sq += x * x; }); return { v, n: Math.sqrt(sq) || 1 }; });
    const nl = items.map((it) => norm(it.label)), cand = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      if (items[i].proj === items[j].proj) continue;
      if (nl[i].length >= 3 && nl[i] === nl[j]) { cand.push({ i, j, sim: 2, why: L('mismo concepto', 'same concept') }); continue; }
      let dot = 0; const shared = []; vec[i].v.forEach((x, k) => { const y = vec[j].v.get(k); if (y) { dot += x * y; shared.push(k); } });
      if (shared.length < 2) continue;
      const sim = dot / (vec[i].n * vec[j].n);
      if (sim >= 0.24) cand.push({ i, j, sim, why: shared.slice(0, 3).map((k) => docs[i].get(k).orig).join(', ') });
    }
    cand.sort((a, b) => b.sim - a.sim);
    const cnt = new Array(N).fill(0), out = [];
    cand.forEach((c) => { if (out.length >= 90 || cnt[c.i] >= 2 || cnt[c.j] >= 2) return; cnt[c.i]++; cnt[c.j]++; out.push({ a: items[c.i].id, b: items[c.j].id, why: c.why }); });
    return out;
  }
  function buildLib(projects) {
    const parts = [];
    projects.forEach((p, i) => {
      const pre = 'p' + i + '~';
      const m = modelFrom(p.nodes.map((n) => Object.assign({}, n, { id: pre + n.id })), p.edges.map((e) => ({ from: pre + e.from, to: pre + e.to })));
      if (m.all.length < 2) return;
      const lay = layout(m); if (lay) parts.push({ p, m, lay });
    });
    if (parts.length < 2) return { count: parts.length };
    const P = parts.length, maxRad = Math.max.apply(null, parts.map((x) => x.lay.rad)), Rc = maxRad * 1.25 + 3 + P * 0.6;
    const list = [], byId = new Map(), links = [], parent = new Map(), kids = new Map(), tops = [], projs = [];
    parts.forEach((x, k) => {
      const y = P === 1 ? 0 : 1 - (k + 0.5) * 2 / P, r = Math.sqrt(1 - y * y), ph = k * 2.39996, ctr = [Math.cos(ph) * r * Rc, y * Rc * 0.8, Math.sin(ph) * r * Rc], ang = k * 2.4, ca = Math.cos(ang), sa = Math.sin(ang);
      x.lay.list.forEach((e) => {
        const px = e.p[0], pz = e.p[2]; e.p[0] = px * ca + pz * sa + ctr[0]; e.p[1] += ctr[1]; e.p[2] = -px * sa + pz * ca + ctr[2];
        e.proj = k; e.c = k % PAL.length; list.push(e); byId.set(e.id, e);
      });
      x.lay.links.forEach((l) => links.push(l));
      x.m.parent.forEach((v, key) => parent.set(key, v)); x.m.kids.forEach((v, key) => kids.set(key, v));
      tops.push(x.lay.top); projs.push({ id: x.p.id, title: x.p.title });
    });
    const items = list.slice(0, 600).map((e) => ({ id: e.id, proj: e.proj, label: e.label, def: e.n.definition || '', simple: e.n.simple || e.n.simpleExplanation || '' }));
    const cr = crossLinks(items), cross = new Map();
    cr.forEach((c) => {
      const a = byId.get(c.a), b = byId.get(c.b); if (!a || !b) return;
      links.push({ a, b, bow: 0.9, cross: true });
      if (!cross.has(c.a)) cross.set(c.a, []); if (!cross.has(c.b)) cross.set(c.b, []);
      cross.get(c.a).push({ to: c.b, why: c.why }); cross.get(c.b).push({ to: c.a, why: c.why });
    });
    let rad = 1; list.forEach((e) => { rad = Math.max(rad, Math.hypot(e.p[0], e.p[1], e.p[2])); });
    return { list, byId, links, rad, top: tops[0], model: { parent, kids }, lib: { projects: projs, tops, cross, nCross: cr.length } };
  }
  function openProject(pid) {
    trk('lib_open_map', {});
    (async () => {
      try {
        if (typeof loadProjectById !== 'function') return;
        await loadProjectById(pid);
        await new Promise((r) => setTimeout(r, 250));
        if (window.GK_NAV) await window.GK_NAV.go('mapa');
      } catch (_e) { /* nada */ }
    })();
  }
  function paintLegend() {
    if (!legEl) return;
    if (!libMode || !M || !M.lib) { legEl.hidden = true; return; }
    legEl.innerHTML = M.lib.projects.map((p, i) => '<button type="button" data-proj="' + i + '" title="' + esc(p.title) + '"><i style="background:rgb(' + PAL[i % PAL.length].join(',') + ')"></i>' + esc(p.title) + '</button>').join('');
    legEl.hidden = false;
  }
  function setMode(lib) {
    libMode = lib;
    if (titleEl) titleEl.textContent = lib ? L('Biblioteca', 'Library') : 'Cosmos';
    if (tipEl) tipEl.textContent = lib ? L('Cada color es un mapa · las líneas doradas unen ideas parecidas de mapas distintos · clic en una idea para ver de dónde viene', 'Each color is a map · gold lines join similar ideas from different maps · click an idea to see where it comes from') : L('Arrastra para girar · rueda para acercarte · clic en una idea para ver su definición', 'Drag to turn · wheel to zoom · click an idea to see its definition');
    if (emptyEl) emptyEl.hidden = true;
    paintLegend();
  }
  async function showLibrary() {
    if (on) show(false);
    if (!pane) build();
    setMode(true);
    const projects = await gather();
    const lib = buildLib(projects);
    on = true; pane.classList.add('on'); geo(); resize();
    sel = null; card.hidden = true; tour = null; fly = null;
    if (!lib || !lib.list) {
      M = null; picks = [];
      emptyEl.innerHTML = '<b>' + esc(L('Tu biblioteca empieza con dos mapas', 'Your library starts with two maps')) + '</b>' +
        '<span>' + esc(L('Cada mapa que generes se guarda aquí. Cuando tengas dos o más, verás cómo se conectan sus ideas aunque sean de temas distintos.', 'Every map you create is saved here. Once you have two or more, you will see how their ideas connect even across different topics.')) + '</span>' +
        '<span>' + esc(L('Mapas guardados con ideas suficientes: ' + (lib ? lib.count : 0), 'Saved maps with enough ideas: ' + (lib ? lib.count : 0))) + '</span>';
      emptyEl.hidden = false; paintHud();
      trk('lib_open', { maps: lib ? lib.count : 0, empty: true });
    } else {
      M = lib; cam.tx = cam.ty = cam.tz = 0; cam.dist = clamp(M.rad * 2.3 + 2, 10, 90); cam.yaw = 0.5; cam.pitch = 0.25;
      idleAt = performance.now() + 2500; paintHud(); paintLegend();
      trk('lib_open', { maps: M.lib.projects.length, ideas: M.list.length, cross: M.lib.nCross });
    }
    document.body.classList.add('gk-cos');
    raf = requestAnimationFrame(frame); geoT = setInterval(geo, 300);
    return true;
  }

  function show(v) {
    if (v && on && libMode) show(false);
    if (v === on) return on;
    if (v) {
      if (!pane) build();
      setMode(false);
      if (!rebuild(false)) return false;
      sig = signature(); on = true; pane.classList.add('on'); geo(); resize();
      cam.yaw = 0.5; cam.pitch = 0.2; fly = null;
      idleAt = performance.now() + 2500; tour = null; paintHud();
      document.body.classList.add('gk-cos');
      if (M && M.top) { sel = null; card.hidden = true; }
      raf = requestAnimationFrame(frame);
      geoT = setInterval(geo, 300);
      pollT = setInterval(() => {
        try { if (!window.GK_NAV.hasMap()) { show(false); window.GK_NAV.setActive(''); return; } } catch (_e) { /* nada */ }
        const s = signature(); if (s !== sig) { sig = s; rebuild(true); }
      }, 1000);
      trk('cosmos_open', { nodes: M.list.length });
      return true;
    }
    on = false; cancelAnimationFrame(raf); clearInterval(geoT); clearInterval(pollT); fly = null; tour = null;
    if (libMode) { libMode = false; if (emptyEl) emptyEl.hidden = true; if (legEl) legEl.hidden = true; }
    if (pane) pane.classList.remove('on');
    document.body.classList.remove('gk-cos');
    return false;
  }

  window.GK_COSMOS = { show, showLibrary, isOn: () => on };
  const hook = () => { try { window.GK_NAV.onChange((a) => { if (on && a !== (libMode ? 'biblioteca' : 'cosmos')) show(false); }); return true; } catch (_e) { return false; } };
  if (!hook()) { const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 300); }
})();
