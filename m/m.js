/* Graphikosmos móvil — app independiente (ver LEEME_ETAPA_2.md §73).
   Modelo: un grafo plano de nodos {id,label,rel,parent,children[],def}. "El mapa de X" es X al
   centro + sus hijos directos. Un nodo está "ampliado" si tiene hijos. Navegar = cambiar el nodo
   central (cur). Todo se guarda en el formato de proyecto de escritorio. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const FN = '/.netlify/functions/';
  const WA_NUMBER = '50687772993';
  const PALETTE = ['#4fd1c5', '#8b7cf6', '#f6ad55', '#f687b3', '#63b3ed', '#9ae6b4', '#fc8181', '#ecc94b'];
  const MAX_LOCAL_PROJECTS = 10;
  const MAX_NODES = 300;

  /* ---------- Animación de entrada (igual que escritorio) ---------- */
  (function () {
    const splash = $('#introSplash'); if (!splash) return;
    let done = false;
    function finish() { if (done) return; done = true; splash.classList.add('intro-fading-out'); setTimeout(() => splash.classList.add('intro-gone'), 600); }
    const t = setTimeout(() => { splash.classList.add('intro-settling'); setTimeout(finish, 550); }, 1300);
    splash.addEventListener('click', () => { clearTimeout(t); finish(); }, { once: true });
  })();

  /* ---------- Utilidades ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } }
  };
  function anonId() { try { let id = localStorage.getItem('gk_anon_id'); if (!id) { id = crypto.randomUUID(); localStorage.setItem('gk_anon_id', id); } return id; } catch { return null; } }
  const WORDS = ['Nébula', 'Cometa', 'Aurora', 'Cuarzo', 'Ámbar', 'Solsticio', 'Brisa', 'Lince', 'Ópalo', 'Ónix', 'Ágora', 'Ventisca', 'Céfiro', 'Ígneo', 'Tucán'];
  function displayName() {
    const u = user(); if (u && u.email) return u.email;
    try { let n = localStorage.getItem('gk_display_name'); if (!n) { n = WORDS[Math.floor(Math.random() * WORDS.length)] + '-' + Math.floor(100 + Math.random() * 900); localStorage.setItem('gk_display_name', n); } return n; } catch { return 'Invitado'; }
  }
  function user() { try { return window.netlifyIdentity ? netlifyIdentity.currentUser() : null; } catch { return null; } }
  async function headers() {
    const h = { 'Content-Type': 'application/json' };
    try { const u = user(); if (u) { const t = await u.jwt(); if (t) h.Authorization = 'Bearer ' + t; } } catch { /* sin token */ }
    return h;
  }
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 2600); }
  function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
  function busy(btn, on) { btn.classList.toggle('is-busy', !!on); btn.disabled = !!on; }

  /* ---------- Eventos (aparte de escritorio: app = graphikosmos-mobile) ---------- */
  const qp = new URLSearchParams(location.search);
  const ORIGIN = {};
  ['ref', 'utm_source', 'utm_medium', 'utm_campaign'].forEach((k) => { const v = qp.get(k); if (v) ORIGIN[k] = clip(v, 60); });
  try { if (Object.keys(ORIGIN).length) sessionStorage.setItem('gk_m_origin', JSON.stringify(ORIGIN)); else Object.assign(ORIGIN, JSON.parse(sessionStorage.getItem('gk_m_origin') || '{}')); } catch { /* nada */ }
  const t0 = Date.now();
  let mapsCount = 0;
  function track(ev, meta) {
    (async () => {
      try {
        await fetch(FN + 'track-event', {
          method: 'POST', credentials: 'same-origin', keepalive: true, headers: await headers(),
          body: JSON.stringify({ event: ev, app: 'graphikosmos-mobile', anonId: anonId(), displayName: displayName(), metadata: Object.assign({ lang: 'es' }, ORIGIN, meta || {}) })
        });
      } catch { /* nunca debe notarse */ }
    })();
  }
  document.addEventListener('pagehide', () => {
    try {
      const body = JSON.stringify({ event: 'm_page_left', app: 'graphikosmos-mobile', anonId: anonId(), displayName: displayName(), metadata: { seconds_on_page: Math.round((Date.now() - t0) / 1000), maps: mapsCount, had_map: !!G.rootId } });
      navigator.sendBeacon && navigator.sendBeacon(FN + 'track-event', new Blob([body], { type: 'application/json' }));
    } catch { /* nada */ }
  });

  /* ---------- Modelo ---------- */
  let G = emptyG();
  function emptyG() { return { rootId: null, nodes: {}, seq: 0, projectId: null }; }
  let cur = null;          // nodo central del mapa que se ve
  let view = 'home';

  function newNode(label, rel, parent) {
    const id = 'n' + (G.seq++);
    G.nodes[id] = { id, label, rel: rel || '', parent: parent || null, children: [], def: null, color: null };
    if (parent) G.nodes[parent].children.push(id);
    return G.nodes[id];
  }
  function depthOf(id) { let d = 0, n = G.nodes[id]; while (n && n.parent) { d++; n = G.nodes[n.parent]; } return d; }
  function pathOf(id) { const out = []; let n = G.nodes[id]; while (n && n.parent) { n = G.nodes[n.parent]; out.unshift(n.label); } return out; }
  function countNodes() { return Object.keys(G.nodes).length; }

  /* ---------- Navegación entre pantallas ---------- */
  const views = { home: $('#viewHome'), map: $('#viewMap'), defs: $('#viewDefs'), projects: $('#viewProjects') };
  function show(v, id) {
    view = v;
    if (id) cur = id;
    Object.keys(views).forEach((k) => { views[k].hidden = k !== v; });
    $('#appbar').hidden = (v === 'defs' || v === 'projects');
    $('#btnCapture').disabled = (v === 'home');
    if (v === 'map') renderMap(!!show.animate);
    if (v === 'defs') renderDefs();
    if (v === 'projects') renderProjects();
    if (v === 'home') setTimeout(() => { try { $('#topicInput').focus({ preventScroll: true }); } catch { /* nada */ } }, 50);
    show.animate = false;
  }
  function go(v, id, animate) {
    try { history.pushState({ v, cur: id || cur }, ''); } catch { /* nada */ }
    show.animate = !!animate;
    show(v, id);
  }
  window.addEventListener('popstate', (e) => {
    closeSheet();
    const s = e.state;
    if (s && s.v === 'map' && G.nodes[s.cur]) show('map', s.cur);
    else if (s && s.v === 'defs' && G.nodes[s.cur]) show('defs', s.cur);
    else if (s && s.v === 'projects') show('projects');
    else show('home');
  });
  try { history.replaceState({ v: 'home' }, ''); } catch { /* nada */ }

  /* ---------- Llamada a la IA con manejo de saldo ---------- */
  async function callGemini(body) {
    let res;
    try {
      res = await fetch(FN + 'gemini', { method: 'POST', credentials: 'same-origin', headers: await headers(), body: JSON.stringify(Object.assign({ lang: 'es' }, body)) });
    } catch { return { ok: false, kind: 'network' }; }
    let data = {}; try { data = await res.json(); } catch { /* nada */ }
    if (res.ok) return { ok: true, data };
    if (res.status === 402 && data.error === 'guest_limit_reached') return { ok: false, kind: 'login', data };
    if (res.status === 402) return { ok: false, kind: user() ? 'contact' : 'login', data };
    if (res.status === 401) return { ok: false, kind: 'login', data };
    if (res.status === 429) return { ok: false, kind: 'rate', data };
    return { ok: false, kind: 'server', data };
  }
  function failMessage(kind) {
    if (kind === 'rate') return 'Hiciste muchas solicitudes seguidas. Espera un minuto e intenta de nuevo.';
    if (kind === 'network') return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
    return 'No pudimos generar el mapa. Intenta de nuevo.';
  }
  function handleBlocked(kind, where) {
    if (kind === 'login') { track('m_paywall_shown', { reason: 'guest_limit', where }); openModal('#modalLogin'); return true; }
    if (kind === 'contact') { track('m_paywall_shown', { reason: 'no_nodes', where }); openContact(); return true; }
    return false;
  }

  /* ---------- Generar mapa (inicio) ---------- */
  $('#homeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#topicInput'), msg = $('#homeMsg'), btn = $('#btnGenerate');
    const topic = clip(input.value, 120);
    msg.className = 'msg';
    if (topic.length < 2) { msg.textContent = 'Escribe un tema primero.'; msg.classList.add('err'); return; }
    track('m_generate_clicked', { topicPreview: topic.slice(0, 80) });
    msg.textContent = 'Armando tu mapa mental…'; busy(btn, true); input.blur();
    const started = Date.now();
    const r = await callGemini({ action: 'm_welcome', topic });
    busy(btn, false);
    if (!r.ok) {
      track('m_map_error', { kind: r.kind, status: r.data && r.data.error, where: 'home' });
      if (handleBlocked(r.kind, 'home')) { msg.textContent = ''; return; }
      msg.textContent = failMessage(r.kind); msg.classList.add('err'); return;
    }
    msg.textContent = '';
    G = emptyG();
    const root = newNode(clip(r.data.root && r.data.root.label, 80) || topic, '', null);
    G.rootId = root.id;
    addChildren(root.id, r.data.branches);
    mapsCount++;
    track('m_map_ok', { depth: 0, branches: root.children.length, ms: Date.now() - started });
    scheduleSave();
    go('map', root.id, true);
  });

  function addChildren(parentId, branches) {
    (branches || []).slice(0, 8).forEach((b, i) => {
      if (!b || !b.label) return;
      const n = newNode(clip(b.label, 60), clip(b.relationship, 40), parentId);
      n.color = PALETTE[i % PALETTE.length];
    });
  }

  /* ---------- Mapa (diseño radial "Cerebro") ---------- */
  let renderToken = 0;
  let layoutCache = null;
  function renderMap(animate) {
    const node = G.nodes[cur]; if (!node) { show('home'); return; }
    const token = ++renderToken;
    const stage = $('#mapStage');
    stage.innerHTML = '';
    $('#mapTitle').textContent = node.label;
    $('#btnBack').setAttribute('aria-label', node.parent ? 'Volver al mapa anterior' : 'Nuevo tema');
    const W = stage.clientWidth, H = stage.clientHeight;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'edges'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    stage.appendChild(svg);

    const center = document.createElement('button');
    center.type = 'button'; center.className = 'mnode root'; center.textContent = node.label; center.dataset.id = node.id; center.tabIndex = -1;
    stage.appendChild(center);
    const kids = node.children.map((id) => G.nodes[id]);
    const els = kids.map((k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mnode' + (k.children.length ? ' done' : '');
      b.style.setProperty('--c', k.color || PALETTE[0]); b.dataset.id = k.id; b.textContent = k.label;
      if (k.children.length) b.insertAdjacentHTML('beforeend', '<span class="badge" title="Ya ampliado"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>');
      b.setAttribute('aria-label', k.label + (k.children.length ? ' (ya ampliado)' : ''));
      stage.appendChild(b); return b;
    });
    const sz = (el) => ({ w: el.offsetWidth, h: el.offsetHeight });
    const cs = sz(center);
    const boxes = [{ x: W / 2 - cs.w / 2, y: H / 2 - cs.h / 2, w: cs.w, h: cs.h, fixed: true }];
    const n = els.length, M = 14;
    els.forEach((el, i) => {
      const s = sz(el);
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const rx = Math.max(40, (W - s.w) / 2 - M), ry = Math.max(60, (H - s.h) / 2 - M - 8);
      boxes.push({ x: W / 2 + Math.cos(a) * rx - s.w / 2, y: H / 2 + Math.sin(a) * ry - s.h / 2, w: s.w, h: s.h });
    });
    relax(boxes, W, H, M);
    layoutCache = { W, H, boxes, node, kids };

    // aristas curvas (debajo de los nodos)
    const paths = kids.map((k, i) => {
      const b = boxes[i + 1];
      const x1 = W / 2, y1 = H / 2, x2 = b.x + b.w / 2, y2 = b.y + b.h / 2;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const cx = (x1 + x2) / 2 - (dy / len) * len * 0.12, cy = (y1 + y2) / 2 + (dx / len) * len * 0.12;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`); p.setAttribute('class', 'edge'); p.setAttribute('stroke', k.color || PALETTE[0]);
      svg.appendChild(p); return p;
    });
    [center, ...els].forEach((el, i) => { el.style.transform = `translate(${Math.round(boxes[i].x)}px,${Math.round(boxes[i].y)}px)`; });

    const reveal = (el, p, delay) => setTimeout(() => {
      if (token !== renderToken) return;
      el.classList.add('show');
      if (p) { const L = p.getTotalLength(); p.style.transition = 'stroke-dashoffset .55s ease'; p.style.strokeDashoffset = '0'; void L; }
    }, delay);
    paths.forEach((p) => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = animate ? L : 0; });
    if (animate) {
      reveal(center, null, 30);
      els.forEach((el, i) => reveal(el, paths[i], 260 + i * 130));
    } else {
      center.classList.add('show'); els.forEach((el) => el.classList.add('show'));
    }
    const anyDone = kids.some((k) => k.children.length);
    $('#mapHint').innerHTML = anyDone
      ? 'Toca un tema para ampliarlo. <span class="badge"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span> ya está ampliado.'
      : 'Toca un tema para ampliarlo.';
  }

  function relax(boxes, W, H, M) {
    const pad = 10;
    for (let it = 0; it < 60; it++) {
      let moved = false;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          const ox = Math.min(a.x + a.w + pad - b.x, b.x + b.w + pad - a.x);
          const oy = Math.min(a.y + a.h + pad - b.y, b.y + b.h + pad - a.y);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
          const wa = a.fixed ? 0 : (b.fixed ? 1 : 0.5), wb = b.fixed ? 0 : (a.fixed ? 1 : 0.5);
          if (ox < oy) { const s = ca.x <= cb.x ? -1 : 1; a.x += s * ox * wa; b.x -= s * ox * wb; }
          else { const s = ca.y <= cb.y ? -1 : 1; a.y += s * oy * wa; b.y -= s * oy * wb; }
        }
      }
      boxes.forEach((b) => { if (b.fixed) return; b.x = Math.min(Math.max(b.x, M), W - b.w - M); b.y = Math.min(Math.max(b.y, 6), H - b.h - 6); });
      if (!moved) break;
    }
  }

  let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (view === 'map') renderMap(false); }, 200); });

  $('#mapStage').addEventListener('click', (e) => {
    const el = e.target.closest('.mnode'); if (!el) return;
    const n = G.nodes[el.dataset.id]; if (!n || n.id === cur) return;
    track('m_node_tapped', { expanded: n.children.length > 0, depth: depthOf(n.id) });
    if (n.children.length) { go('map', n.id, false); return; }
    openSheet(n);
  });
  $('#btnBack').addEventListener('click', () => {
    const n = G.nodes[cur]; track('m_back', { from_depth: depthOf(cur) });
    if (n && n.parent) go('map', n.parent, false); else go('home');
  });

  /* ---------- Hoja del nodo: única acción ---------- */
  let sheetNode = null;
  function openSheet(n) {
    sheetNode = n.id;
    $('#sheetTitle').textContent = n.label; $('#sheetRel').textContent = n.rel || '';
    $('#sheetMsg').textContent = ''; $('#sheetMsg').className = 'msg';
    busy($('#btnExpand'), false);
    $('#sheet').hidden = false; $('#sheetBackdrop').hidden = false;
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheetBackdrop').hidden = true; sheetNode = null; }
  $('#sheetBackdrop').addEventListener('click', () => { if (!$('#btnExpand').disabled) closeSheet(); });
  $('#btnExpand').addEventListener('click', async () => {
    const n = G.nodes[sheetNode]; if (!n) return;
    const btn = $('#btnExpand'), msg = $('#sheetMsg'); msg.className = 'msg'; msg.textContent = 'Armando el mapa…';
    if (countNodes() >= MAX_NODES) { msg.textContent = 'Este proyecto ya es muy grande. Empieza un tema nuevo.'; msg.classList.add('err'); return; }
    track('m_expand_clicked', { depth: depthOf(n.id) });
    busy(btn, true);
    const started = Date.now();
    const r = await callGemini({ action: 'm_map', topic: n.label, contextPath: pathOf(n.id).concat([]).join(' > ').slice(0, 380) });
    busy(btn, false);
    if (!r.ok) {
      track('m_map_error', { kind: r.kind, where: 'expand' });
      if (handleBlocked(r.kind, 'expand')) { closeSheet(); return; }
      msg.textContent = failMessage(r.kind); msg.classList.add('err'); return;
    }
    if (n.children.length === 0) addChildren(n.id, r.data.branches);
    mapsCount++;
    track('m_expand_ok', { depth: depthOf(n.id), branches: n.children.length, ms: Date.now() - started });
    scheduleSave();
    closeSheet();
    go('map', n.id, true);
  });

  /* ---------- Ver definiciones ---------- */
  $('#btnDefs').addEventListener('click', () => { track('m_defs_opened', { depth: depthOf(cur) }); go('defs', cur); });
  $('#btnDefsBack').addEventListener('click', () => { track('m_defs_back'); go('map', cur, false); });
  let allOpen = false;
  $('#btnToggleAll').addEventListener('click', () => {
    allOpen = !allOpen;
    document.querySelectorAll('#defsList details').forEach((d) => { d.open = allOpen; });
    $('#btnToggleAll').textContent = allOpen ? 'Contraer todo' : 'Expandir todo';
    track('m_defs_toggle_all', { open: allOpen });
  });
  function termsOf(id) { const n = G.nodes[id]; return [n].concat(n.children.map((c) => G.nodes[c])); }
  function renderDefs() {
    const n = G.nodes[cur]; if (!n) { show('home'); return; }
    allOpen = false; $('#btnToggleAll').textContent = 'Expandir todo';
    $('#defsTitle').textContent = 'Definiciones de «' + n.label + '»';
    $('#defsScroll').scrollTop = 0;
    const list = $('#defsList'); list.innerHTML = '';
    termsOf(cur).forEach((t, i) => {
      const card = document.createElement('article'); card.className = 'term'; card.dataset.id = t.id;
      card.style.setProperty('--c', i === 0 ? PALETTE[0] : (t.color || PALETTE[0]));
      list.appendChild(card); fillTerm(card, t);
    });
    ensureGlossary(cur);
  }
  function fillTerm(card, t) {
    const h = document.createElement('h2'); h.textContent = t.label;
    card.innerHTML = ''; card.appendChild(h);
    if (!t.def) { card.insertAdjacentHTML('beforeend', '<div class="skel" style="width:96%"></div><div class="skel" style="width:88%"></div><div class="skel" style="width:60%"></div>'); return; }
    const p = document.createElement('p'); p.className = 'def'; p.textContent = t.def.definition || ''; card.appendChild(p);
    const mk = (title, text) => { const d = document.createElement('details'); const s = document.createElement('summary'); s.textContent = title; const q = document.createElement('p'); q.textContent = text || ''; d.append(s, q); s.addEventListener('click', () => track('m_defs_section', { section: title, open: !d.open })); return d; };
    card.appendChild(mk('En sencillo', t.def.simple)); card.appendChild(mk('Ejemplo', t.def.example));
  }
  const glossaryInflight = {};
  async function ensureGlossary(id) {
    const terms = termsOf(id).filter((t) => !t.def);
    if (!terms.length) { track('m_defs_ok', { cached: true }); return; }
    if (glossaryInflight[id]) return;
    glossaryInflight[id] = true;
    const started = Date.now();
    const r = await callGemini({ action: 'glossary', topic: G.nodes[id].label, contextPath: pathOf(id).join(' > ').slice(0, 380), terms: terms.map((t) => ({ id: t.id, label: t.label })) });
    glossaryInflight[id] = false;
    const stillHere = view === 'defs' && cur === id;
    if (!r.ok || !r.data || !Array.isArray(r.data.items)) {
      track('m_defs_error', { kind: r.ok ? 'vacio' : r.kind });
      if (!stillHere) return;
      if (handleBlocked(r.kind, 'defs')) return;
      const box = document.createElement('div'); box.className = 'defs-error';
      box.innerHTML = '<p>No pudimos cargar las definiciones.</p>';
      const b = document.createElement('button'); b.className = 'pill'; b.type = 'button'; b.textContent = 'Reintentar'; b.onclick = () => { box.remove(); renderDefs(); };
      box.appendChild(b); $('#defsList').appendChild(box);
      return;
    }
    r.data.items.forEach((it) => { const t = G.nodes[it.id]; if (t) t.def = { definition: clip(it.definition, 400), simple: clip(it.simple, 400), example: clip(it.example, 400) }; });
    track('m_defs_ok', { ms: Date.now() - started, terms: terms.length });
    scheduleSave();
    if (stillHere) document.querySelectorAll('#defsList .term').forEach((card) => { const t = G.nodes[card.dataset.id]; if (t && t.def && !card.querySelector('.def')) fillTerm(card, t); });
  }

  /* ---------- Captura ---------- */
  $('#btnCapture').addEventListener('click', async () => {
    if (view !== 'map' || !layoutCache) { toast('Genera un mapa para poder capturarlo.'); return; }
    track('m_capture');
    try {
      const blob = await captureMap(); if (!blob) throw new Error('sin imagen');
      const file = new File([blob], 'graphikosmos-mapa.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Mi mapa mental' }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'graphikosmos-mapa.png'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Imagen guardada');
    } catch { toast('No se pudo capturar el mapa.'); }
  });
  function wrapText(ctx, text, maxW) {
    const words = text.split(' '), lines = []; let line = '';
    words.forEach((w) => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line); return lines;
  }
  function captureMap() {
    const { W, H, boxes, kids, node } = layoutCache; const S = 2, PADT = 56;
    const cv = document.createElement('canvas'); cv.width = W * S; cv.height = (H + PADT) * S;
    const c = cv.getContext('2d'); c.scale(S, S);
    c.fillStyle = '#0a0e1a'; c.fillRect(0, 0, W, H + PADT);
    c.fillStyle = '#eef1fb'; c.font = '700 17px Sora, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(node.label, W / 2, 28);
    c.translate(0, PADT);
    kids.forEach((k, i) => {
      const b = boxes[i + 1], x1 = W / 2, y1 = H / 2, x2 = b.x + b.w / 2, y2 = b.y + b.h / 2;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      c.strokeStyle = k.color || PALETTE[0]; c.globalAlpha = .75; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x1, y1);
      c.quadraticCurveTo((x1 + x2) / 2 - (dy / len) * len * .12, (y1 + y2) / 2 + (dx / len) * len * .12, x2, y2); c.stroke(); c.globalAlpha = 1;
    });
    const drawBox = (b, label, color, isRoot, done) => {
      c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 14);
      if (isRoot) { const g = c.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h); g.addColorStop(0, '#4fd1c5'); g.addColorStop(1, '#8b7cf6'); c.fillStyle = g; c.fill(); }
      else { c.fillStyle = '#0f1428'; c.fill(); c.fillStyle = color + (done ? '4d' : '29'); c.fill(); c.strokeStyle = color; c.lineWidth = 2; c.stroke(); }
      c.fillStyle = isRoot ? '#071016' : '#eef1fb'; c.font = (isRoot ? '700 17px' : '600 15px') + ' Sora, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const lines = wrapText(c, label, b.w - 26), lh = isRoot ? 20 : 18, y0 = b.y + b.h / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => c.fillText(l, b.x + b.w / 2, y0 + i * lh));
      if (done) { c.fillStyle = '#4fd1c5'; c.beginPath(); c.arc(b.x + b.w - 2, b.y + 2, 9, 0, 7); c.fill(); }
    };
    kids.forEach((k, i) => drawBox(boxes[i + 1], k.label, k.color || PALETTE[0], false, k.children.length > 0));
    drawBox(boxes[0], node.label, '#4fd1c5', true, false);
    c.setTransform(S, 0, 0, S, 0, 0); c.fillStyle = '#8a92b2'; c.font = '500 12px Inter, sans-serif'; c.textAlign = 'center'; c.fillText('Graphikosmos', W / 2, H + PADT - 10);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }

  /* ---------- Guardado (formato de proyecto de escritorio) ---------- */
  function exportProject() {
    // posiciones radiales simples para que escritorio pueda abrirlo
    const pos = {}; const root = G.rootId; pos[root] = { x: 0, y: 0, ang: 0 };
    (function place(id, depth, a0, a1) {
      const n = G.nodes[id]; const k = n.children.length; if (!k) return;
      const r = depth === 0 ? 280 : 220;
      n.children.forEach((c, i) => {
        const a = a0 + ((a1 - a0) * (i + 0.5)) / k;
        const base = pos[id];
        pos[c] = { x: base.x + Math.cos(a) * r, y: base.y + Math.sin(a) * r };
        place(c, depth + 1, a - (a1 - a0) / k / 2, a + (a1 - a0) / k / 2);
      });
    })(root, 0, -Math.PI, Math.PI);
    const ids = Object.keys(G.nodes);
    const nodes = ids.map((id) => {
      const n = G.nodes[id], d = depthOf(id), col = n.color || '#4fd1c5';
      return {
        id, label: '*' + n.label + '*', baseTitle: n.label, depthLevel: d, x: Math.round((pos[id] || { x: 0 }).x), y: Math.round((pos[id] || { y: 0 }).y),
        color: { background: d === 0 ? '#4fd1c5' : col, border: col },
        definition: n.def ? n.def.definition : undefined, simple: n.def ? n.def.simple : undefined, example: n.def ? n.def.example : undefined,
        relationship: n.rel || undefined
      };
    });
    const edges = [];
    ids.forEach((id) => G.nodes[id].children.forEach((c) => edges.push({ id: 'e_' + id + '_' + c, from: id, to: c, label: G.nodes[c].rel || '' })));
    const u = user();
    return { owner: u ? (u.user_metadata && u.user_metadata.full_name) || u.email : 'Invitado', email: u ? u.email : 'local', nodes, edges, mobile: true, readerText: '', documentContext: '', panelState: null };
  }
  function importProject(rec) {
    const nodes = Array.isArray(rec && rec.nodes) ? rec.nodes.slice(0, MAX_NODES) : [];
    if (!nodes.length) return false;
    const byId = {}; nodes.forEach((n) => { byId[n.id] = n; });
    const kids = {}; const hasParent = new Set();
    (rec.edges || []).forEach((e) => { if (byId[e.from] && byId[e.to] && e.from !== e.to) { (kids[e.from] = kids[e.from] || []).push(e); } });
    const rootRaw = nodes.find((n) => n.depthLevel === 0) || nodes.find((n) => !(rec.edges || []).some((e) => e.to === n.id)) || nodes[0];
    const g = emptyG();
    const seen = new Set();
    const labelOf = (n) => clip(n.baseTitle || String(n.label || '').replace(/\*/g, '').split('\n')[0], 80) || 'Sin título';
    const queue = [[rootRaw, null, '']];
    while (queue.length) {
      const [raw, parent, rel] = queue.shift(); if (seen.has(raw.id)) continue; seen.add(raw.id);
      const n = { id: 'n' + (g.seq++), label: labelOf(raw), rel: clip(rel, 40), parent, children: [], def: null, color: null };
      if (raw.definition || raw.simple || raw.example) n.def = { definition: clip(raw.definition, 400), simple: clip(raw.simple, 400), example: clip(raw.example, 400) };
      g.nodes[n.id] = n;
      if (parent) { g.nodes[parent].children.push(n.id); n.color = PALETTE[(g.nodes[parent].children.length - 1) % PALETTE.length]; }
      else g.rootId = n.id;
      (kids[raw.id] || []).forEach((e) => { if (!seen.has(e.to)) queue.push([byId[e.to], n.id, e.label]); });
    }
    hasParent.clear();
    G = g; return true;
  }

  let saveTimer = null, saving = false, dirty = false;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveProject, 1500); }
  function userKey() { const u = user(); return u ? 'u_' + u.id : 'guest'; }
  async function saveProject() {
    if (!G.rootId) return;
    if (saving) { dirty = true; return; }
    saving = true;
    try {
      if (!G.projectId) G.projectId = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const target = G.projectId, data = exportProject(), title = G.nodes[G.rootId].label;
      const key = 'gk_m_projects_' + userKey();
      let cat = store.get(key, []);
      const entry = { id: target, title, date: new Date().toISOString(), nodeCount: data.nodes.length };
      const i = cat.findIndex((p) => p.id === target);
      if (i >= 0) cat[i] = entry; else cat.push(entry);
      if (!user() && cat.length > MAX_LOCAL_PROJECTS) {
        cat.sort((a, b) => b.date.localeCompare(a.date));
        cat.slice(MAX_LOCAL_PROJECTS).forEach((p) => store.del('gk_m_snap_' + p.id)); cat = cat.slice(0, MAX_LOCAL_PROJECTS);
      }
      store.set(key, cat); store.set('gk_m_snap_' + target, data);
      const u = user();
      if (u) {
        try {
          const cloud = !target.startsWith('local_');
          const res = await fetch(FN + 'db', { method: 'POST', credentials: 'same-origin', headers: await headers(), body: JSON.stringify({ projectId: cloud ? target : null, title, data, user: u.id }) });
          const out = await res.json().catch(() => ({}));
          if (res.ok && out.projectId && out.projectId !== target) {
            let c2 = store.get(key, []); const j = c2.findIndex((p) => p.id === target); if (j >= 0) c2[j].id = out.projectId; store.set(key, c2);
            store.set('gk_m_snap_' + out.projectId, data); store.del('gk_m_snap_' + target);
            if (G.projectId === target) G.projectId = out.projectId;
          }
        } catch { /* se queda guardado en el dispositivo */ }
      }
    } finally {
      saving = false;
      if (dirty) { dirty = false; scheduleSave(); }
    }
  }

  /* ---------- Mis proyectos ---------- */
  $('#btnProjects').addEventListener('click', () => { track('m_projects_opened'); go('projects'); });
  $('#btnProjBack').addEventListener('click', () => history.back());
  async function renderProjects() {
    const box = $('#projList'); box.innerHTML = '<p class="proj-empty">Cargando…</p>';
    const u = user(); let items = null, cloud = false;
    if (u) {
      try {
        const res = await fetch(FN + 'db?list=1', { credentials: 'same-origin', headers: await headers() });
        if (res.ok) { const d = await res.json(); items = (d.projects || []).map((p) => ({ id: p.id, title: p.title, date: p.date, nodeCount: p.nodeCount })); cloud = true; }
      } catch { /* cae al catálogo local */ }
    }
    if (!items) items = store.get('gk_m_projects_' + userKey(), []);
    items = items.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (view !== 'projects') return;
    box.innerHTML = '';
    if (!u) box.insertAdjacentHTML('beforeend', '<p class="proj-note">Estás como invitado: tus proyectos se guardan solo en este teléfono. Entra para guardarlos en tu cuenta.</p>');
    if (!items.length) { box.insertAdjacentHTML('beforeend', '<p class="proj-empty">Aún no tienes proyectos.<br>Genera tu primer mapa mental.</p>'); return; }
    items.forEach((p) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'proj';
      const d = new Date(p.date); const when = isNaN(d) ? '' : d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
      b.innerHTML = '<span><b></b><small></small></span><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
      b.querySelector('b').textContent = p.title || 'Sin título'; b.querySelector('small').textContent = (p.nodeCount || 0) + ' nodos · ' + when;
      b.addEventListener('click', () => openProject(p.id, cloud));
      box.appendChild(b);
    });
  }
  async function openProject(id, cloud) {
    let rec = store.get('gk_m_snap_' + id, null);
    if (!rec && !id.startsWith('local_')) {
      try {
        const res = await fetch(FN + 'db?projectId=' + encodeURIComponent(id), { credentials: 'same-origin', headers: await headers() });
        if (res.ok) { const d = await res.json(); rec = d.data; }
      } catch { /* nada */ }
    }
    if (!rec || !importProject(rec)) { toast('No se pudo abrir el proyecto.'); return; }
    G.projectId = id;
    track('m_project_opened', { cloud: !!cloud, nodes: countNodes() });
    go('map', G.rootId, false);
  }

  /* ---------- Sesión ---------- */
  function updateLogin() {
    const u = user(); const lab = $('#loginLabel');
    lab.textContent = u ? clip((u.email || 'Mi cuenta').split('@')[0], 12) : 'Entrar';
    $('#btnLogin').classList.toggle('on', !!u);
  }
  $('#btnLogin').addEventListener('click', () => {
    track('m_login_clicked');
    if (!window.netlifyIdentity) { toast('No se pudo abrir el inicio de sesión. Revisa tu conexión.'); return; }
    netlifyIdentity.open(user() ? undefined : 'login');
  });
  if (window.netlifyIdentity) {
    netlifyIdentity.init({ locale: 'es' });
    netlifyIdentity.on('init', updateLogin);
    netlifyIdentity.on('login', () => { netlifyIdentity.close(); closeModals(); updateLogin(); track('m_login_success'); toast('Sesión iniciada'); if (G.rootId) scheduleSave(); });
    netlifyIdentity.on('logout', () => { updateLogin(); toast('Sesión cerrada'); });
  }
  updateLogin();

  /* ---------- Modales ---------- */
  function openModal(sel) { $(sel).hidden = false; }
  function closeModals() { document.querySelectorAll('.modal').forEach((m) => { m.hidden = true; }); }
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
  $('#mlClose').addEventListener('click', closeModals);
  $('#mcClose').addEventListener('click', closeModals);
  $('#mlGo').addEventListener('click', () => { track('m_login_clicked', { from: 'paywall' }); closeModals(); if (window.netlifyIdentity) netlifyIdentity.open('signup'); else toast('No se pudo abrir el registro.'); });
  function openContact() {
    const u = user(); if (u && !$('#contactEmail').value) $('#contactEmail').value = u.email || '';
    $('#contactMsg').textContent = ''; $('#contactMsg').className = 'msg';
    $('#contactWa').href = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent('Hola, me quedé sin nodos en Graphikosmos (versión móvil) y quiero seguir usándolo.');
    openModal('#modalContact');
  }
  $('#contactWa').addEventListener('click', () => track('m_contact_whatsapp'));
  $('#contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = clip($('#contactEmail').value, 160), msg = $('#contactMsg'), btn = $('#contactSend');
    msg.className = 'msg';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Escribe un correo válido.'; msg.classList.add('err'); return; }
    busy(btn, true); msg.textContent = 'Enviando…';
    try {
      const res = await fetch(FN + 'send-feedback', { method: 'POST', credentials: 'same-origin', headers: await headers(), body: JSON.stringify({ kind: 'recharge_request', email, message: 'Solicitud desde Graphikosmos MÓVIL: se quedó sin nodos y quiere seguir usándolo.' }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { msg.textContent = out.error === 'rate_limited' ? 'Ya nos escribiste varias veces. Te responderemos pronto.' : 'No se pudo enviar. Intenta de nuevo.'; msg.classList.add('err'); return; }
      track('m_contact_sent'); msg.textContent = '¡Listo! Te escribimos pronto.'; setTimeout(closeModals, 2200);
    } catch { msg.textContent = 'No se pudo enviar. Revisa tu conexión.'; msg.classList.add('err'); }
    finally { busy(btn, false); }
  });

  /* ---------- Arranque ---------- */
  const pre = qp.get('tema'); if (pre) $('#topicInput').value = clip(pre, 120);
  $('#btnCapture').disabled = true;
  track('m_home_viewed', { has_ref: Object.keys(ORIGIN).length > 0 });
})();
