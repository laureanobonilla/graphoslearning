/* Graphikosmos móvil — app independiente (ver LEEME_ETAPA_2.md §73).
   Modelo: un grafo plano de nodos {id,label,rel,parent,children[],def}. "El mapa de X" es X al
   centro + sus hijos directos. Un nodo está "ampliado" si tiene hijos. Navegar = cambiar el nodo
   central (cur). Todo se guarda en el formato de proyecto de escritorio. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const FN = '/.netlify/functions/';
  const WA_NUMBER = '50687772993';
  const PALETTE = ['#7aa7d9', '#8fb0a4', '#c4a77d', '#b59aa8', '#8a9bb0', '#a7a0c4', '#9bb58a', '#c28f86'];
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
  if (qp.get('gclid') || qp.get('gbraid') || qp.get('wbraid')) ORIGIN.google_click = true;
  try { if (Object.keys(ORIGIN).length) sessionStorage.setItem('gk_m_origin', JSON.stringify(ORIGIN)); else Object.assign(ORIGIN, JSON.parse(sessionStorage.getItem('gk_m_origin') || '{}')); } catch { /* nada */ }
  /* Llegada desde /aprender/ (anuncio): el código es el «boleto» de UN esquema de prueba (se verifica en el servidor). */
  let TICKET = '', APR_TOPIC = '', TICKET_P = Promise.resolve(), PEND_TEXT = null, QER = null;
  try {
    const a = qp.get('aprende') || '';
    try {   /* "Ver como mapa" de Escribir deja el texto en este navegador con ese mismo código */
      const pend = JSON.parse(localStorage.getItem('gk_ap_pending') || 'null');
      if (pend && pend.sid === a && typeof pend.text === 'string' && pend.text.length >= 200) { PEND_TEXT = { title: clip(pend.title || '', 80), text: pend.text.slice(0, 12000) }; localStorage.removeItem('gk_ap_pending'); }
    } catch { /* nada */ }
    if (qp.get('qer') === '1') {   /* resultado de «¿Quién eres?»: su lectura pasa a ser el primer mapa (gratis, una vez) */
      try {
        const q = JSON.parse(localStorage.getItem('gk_qer_pending') || 'null');
        if (q && typeof q.text === 'string' && q.text.length >= 200 && Date.now() - (q.at || 0) < 6 * 3600 * 1000) {
          QER = { title: clip(q.title || '', 80), text: q.text.slice(0, 3000) }; document.addEventListener('DOMContentLoaded', () => qerWait(true)); if (document.readyState !== 'loading') qerWait(true);
          const sid = crypto.randomUUID();
          TICKET_P = fetch(FN + 'hf-save', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, tool: 'aprende', first: true, anonId: anonId(), step: 1, total: 1, answers: { origen: 'quien-eres' }, utm: { campaign: 'quien-eres', ad: 'qer' } }) })
            .then((r) => { if (r.ok) TICKET = sid; }).catch(() => {});
        }
        localStorage.removeItem('gk_qer_pending');
      } catch { /* nada */ }
      const q3 = new URLSearchParams(location.search); q3.delete('qer');
      const rest3 = q3.toString(); history.replaceState(null, '', location.pathname + (rest3 ? '?' + rest3 : '') + location.hash);
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a)) {
      TICKET = PEND_TEXT ? '' : a; APR_TOPIC = PEND_TEXT ? '' : clip(qp.get('t') || '', 120);
      const q2 = new URLSearchParams(location.search); ['aprende', 'ref', 't'].forEach((k) => q2.delete(k));
      const rest = q2.toString(); history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    }
    else if (qp.get('ref') === 'aprende') {
      /* En teléfono /aprender/ lleva directo aquí: se pide el boleto igual que lo haría la página de escritorio (hf-save). */
      const src = (qp.get('utm_source') || '').toLowerCase();
      let camp = clip(qp.get('utm_campaign') || qp.get('c') || '', 40), ad = clip(qp.get('utm_content') || qp.get('ad') || '', 40);
      if (!camp && !ad && (qp.get('fbclid') || qp.get('src') === 'fb' || /^(facebook|fb|instagram|ig|meta|messenger)$/.test(src))) ad = 'fb';
      if (camp || ad) {
        const sid = crypto.randomUUID();
        TICKET_P = fetch(FN + 'hf-save', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, tool: 'aprende', first: true, anonId: anonId(), step: 1, total: 1, answers: { origen: 'movil' }, utm: { campaign: camp, ad } }) })
          .then((r) => { if (r.ok) TICKET = sid; }).catch(() => {});
      }
      const q2 = new URLSearchParams(location.search); ['ref', 'fbclid', 'src', 'c', 'ad'].forEach((k) => q2.delete(k));
      const rest = q2.toString(); history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    }
  } catch { /* nada */ }
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

  /* Señal de «hay una persona»: al abrir desde Facebook el aviso de salida casi nunca llega, así que se marca
     el paso del tiempo con la página a la vista (5, 15, 30 y 60 s) y cuántos toques o desplazamientos hubo. */
  let humanTouches = 0;
  ['touchstart', 'pointerdown', 'scroll', 'keydown'].forEach((t) => window.addEventListener(t, () => { humanTouches++; }, { passive: true, capture: true }));
  [5, 15, 30, 60].forEach((s) => setTimeout(() => { if (document.visibilityState === 'visible') track('m_alive', { s, touches: humanTouches }); }, s * 1000));

  /* ---------- Modelo ---------- */
  let G = emptyG();
  /* Pantalla bloqueada mientras se arma el mapa que viene de «¿Quién eres?» (no se ve la portada). */
  function qerWait(on) { const w = document.getElementById('qerWait'); if (w) w.hidden = !on; }
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
  const views = { home: $('#viewHome'), map: $('#viewMap'), defs: $('#viewDefs'), lens: $('#viewLens'), projects: $('#viewProjects') };
  function show(v, id) {
    view = v;
    if (id) cur = id;
    Object.keys(views).forEach((k) => { views[k].hidden = k !== v; });
    $('#appbar').hidden = (v === 'defs' || v === 'projects' || v === 'lens');
    $('#btnCapture').disabled = (v === 'home');
    $('#btnNew').hidden = (v === 'home');
    if (v === 'home') { $('#topicInput').value = ''; $('#homeMsg').textContent = ''; $('#homeMsg').className = 'msg'; }
    if (v === 'map') renderMap(!!show.animate);
    if (v === 'map') armFeedback();
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
    else if (s && s.v === 'lens' && G.nodes[s.cur]) show('map', s.cur);
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
    if (res.ok) { if (typeof data.balance === 'number' && !data.admin) setGems(data.balance); return { ok: true, data }; }
    if (res.status === 402 && typeof data.balance === 'number') setGems(data.balance);
    if (res.status === 402 && data.error === 'guest_limit_reached') return { ok: false, kind: 'login', data };
    if (res.status === 402) return { ok: false, kind: user() ? 'contact' : 'login', data };
    if (res.status === 401) return { ok: false, kind: 'login', data };
    if (res.status === 429) return { ok: false, kind: user() ? 'rate' : 'login', data };
    return { ok: false, kind: 'server', data };
  }
  function failMessage(kind, data) {
    if (kind === 'rate') return 'Hay mucha actividad en tu cuenta en este momento. Espera unos minutos e intenta de nuevo.';
    if (kind === 'network') return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
    return 'No pudimos generar el mapa. Intenta de nuevo.';
  }
  function handleBlocked(kind, where) {
    if (kind === 'login') { track('m_paywall_shown', { reason: 'guest_limit', where }); openModal('#modalLogin'); return true; }
    if (kind === 'contact') { track('m_paywall_shown', { reason: 'no_nodes', where }); if (window.GK_GEMS) window.GK_GEMS.openShop({ from: 'graphikosmos' }); else openContact(); return true; }
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
    await TICKET_P;
    const r = await callGemini({ action: 'm_welcome', topic, levels: 3, ticket: TICKET || undefined });
    busy(btn, false);
    if (!r.ok) {
      track('m_map_error', { kind: r.kind, status: r.data && r.data.error, used: r.data && r.data.used, where: 'home' });
      if (r.kind === 'login') { try { localStorage.setItem('gk_m_pending', JSON.stringify({ topic, at: Date.now() })); } catch { /* nada */ } }
      if (handleBlocked(r.kind, 'home')) { msg.textContent = ''; return; }
      msg.textContent = failMessage(r.kind, r.data); msg.classList.add('err'); return;
    }
    msg.textContent = ''; TICKET = '';
    G = emptyG();
    const root = newNode(clip(r.data.root && r.data.root.label, 80) || topic, '', null);
    G.rootId = root.id;
    addTree(root.id, r.data);
    mapsCount++;
    if (window.GK_INSTALL) window.GK_INSTALL.maybe();
    track('m_map_ok', { depth: 0, branches: root.children.length, ms: Date.now() - started });
    try { window.GK_ADS && GK_ADS.firstMap(); } catch { /* nada */ }
    scheduleSave();
    go('map', root.id, true);
  });

  /* Texto que viene de Escribir: se arma un mapa nuevo a partir de él (acción m_text, se cobra como cualquier mapa). */
  if (PEND_TEXT) setTimeout(async () => {
    try {
      if (G && G.rootId) return;
      const msg = $('#homeMsg'), btn = $('#btnGenerate'); msg.className = 'msg'; msg.textContent = 'Armando el mapa de tu texto…'; busy(btn, true);
      track('m_from_escribir', { chars: PEND_TEXT.text.length });
      const r = await callGemini({ action: 'm_text', text: PEND_TEXT.text, topic: PEND_TEXT.title, levels: 3 });
      busy(btn, false);
      if (!r.ok) { if (handleBlocked(r.kind, 'escribir')) { msg.textContent = ''; return; } msg.textContent = failMessage(r.kind, r.data); msg.classList.add('err'); return; }
      msg.textContent = ''; G = emptyG();
      const root = newNode(clip(r.data.root && r.data.root.label, 80) || PEND_TEXT.title || 'Mi texto', '', null); G.rootId = root.id;
      addTree(root.id, r.data); mapsCount++; scheduleSave(); go('map', root.id, true);
    } catch { /* nada */ }
  }, 300);
  if (QER) setTimeout(async () => {
    try {
      if (G && G.rootId) { qerWait(false); return; }
      setTimeout(() => qerWait(false), 70000);
      const msg = $('#homeMsg'), btn = $('#btnGenerate'); msg.className = 'msg'; msg.textContent = 'Convirtiendo tu resultado en un mapa mental…'; busy(btn, true);
      track('m_from_quien_eres', { chars: QER.text.length });
      await TICKET_P;
      const r = await callGemini({ action: 'm_welcome', text: QER.text, topic: QER.title, levels: 3, ticket: TICKET || undefined });
      busy(btn, false);
      if (!r.ok) { qerWait(false); track('m_map_error', { kind: r.kind, status: r.data && r.data.error, where: 'quien-eres' }); if (handleBlocked(r.kind, 'quien-eres')) { msg.textContent = ''; return; } msg.textContent = failMessage(r.kind, r.data); msg.classList.add('err'); return; }
      msg.textContent = ''; TICKET = ''; G = emptyG(); G.voice = 'tu'; qerWait(false);
      const root = newNode(clip(r.data.root && r.data.root.label, 80) || QER.title || 'Tu resultado', '', null); G.rootId = root.id;
      addTree(root.id, r.data); mapsCount++;
      if (fbDone()) installNow(); else installAfterFlow = true;   /* desde «¿Quién eres?»: la guía de instalar va al final de opinión → registro, para no apilar avisos */
      track('m_map_ok', { depth: 0, branches: root.children.length, from: 'quien-eres' });
      try { window.GK_ADS && GK_ADS.firstMap(); } catch { /* nada */ }
      scheduleSave(); go('map', root.id, true);
    } catch { qerWait(false); }
  }, 300);
  if (TICKET && APR_TOPIC.length >= 2) setTimeout(() => { try { if (G && G.rootId) return; $('#topicInput').value = APR_TOPIC; track('m_aprende_arrival', {}); $('#homeForm').requestSubmit(); } catch { /* nada */ } }, 300);

  /* Si el muro de registro detuvo un mapa, al iniciar sesión se retoma el mismo tema solo (y mientras tanto el campo no se borra). */
  function resumeMobile() {
    let p = null; try { p = JSON.parse(localStorage.getItem('gk_m_pending') || 'null'); } catch { /* nada */ }
    if (!p || !p.topic || Date.now() - (p.at || 0) > 30 * 60 * 1000) { try { localStorage.removeItem('gk_m_pending'); } catch { /* nada */ } return; }
    if (!user() || (G && G.rootId)) return;
    try { localStorage.removeItem('gk_m_pending'); } catch { /* nada */ }
    closeModals(); $('#topicInput').value = p.topic; track('m_login_resume', {});
    $('#homeForm').requestSubmit();
  }
  /* Árbol de 3 niveles (como en escritorio): ramas y sub-ramas. Las sub-ramas quedan listas, sin ampliar. */
  function addTree(parentId, data) {
    addChildren(parentId, data.branches);
    const kids = G.nodes[parentId].children.slice(-(data.branches || []).length || undefined);
    const byB = {}; (data.branches || []).forEach((b, i) => { if (b && b.id && kids[i]) byB[b.id] = kids[i]; });
    (data.subBranches || []).slice(0, 24).forEach((s) => {
      const pid = byB[s && s.parentId]; if (!pid || !s.label) return;
      const c = newNode(clip(s.label, 60), clip(s.relationship, 40), pid); c.color = G.nodes[pid].color;
    });
  }
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
    busy($('#btnExpand'), false); busy($('#btnLens'), false);
    $('#sheet').hidden = false; $('#sheetBackdrop').hidden = false;
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheetBackdrop').hidden = true; sheetNode = null; }
  $('#sheetBackdrop').addEventListener('click', () => { if (!$('#btnExpand').disabled && !$('#btnLens').disabled) closeSheet(); });
  $('#btnExpand').addEventListener('click', async () => {
    const n = G.nodes[sheetNode]; if (!n) return;
    const btn = $('#btnExpand'), msg = $('#sheetMsg'); msg.className = 'msg'; msg.textContent = 'Armando el mapa…';
    if (countNodes() >= MAX_NODES) { msg.textContent = 'Este proyecto ya es muy grande. Empieza un tema nuevo.'; msg.classList.add('err'); return; }
    track('m_expand_clicked', { depth: depthOf(n.id) });
    busy(btn, true);
    const started = Date.now();
    const deep = depthOf(n.id) >= 2;   // un nodo del 3er nivel (listo, sin ampliar) se amplía como un esquema nuevo de 3 niveles, en su propia vista
    const r = await callGemini({ action: 'm_map', topic: n.label, levels: deep ? 3 : 2, contextPath: pathOf(n.id).concat([]).join(' > ').slice(0, 380) });
    busy(btn, false);
    if (!r.ok) {
      track('m_map_error', { kind: r.kind, where: 'expand' });
      if (handleBlocked(r.kind, 'expand')) { closeSheet(); return; }
      msg.textContent = failMessage(r.kind, r.data); msg.classList.add('err'); return;
    }
    if (n.children.length === 0) { if (deep) addTree(n.id, r.data); else addChildren(n.id, r.data.branches); }
    mapsCount++;
    track('m_expand_ok', { depth: depthOf(n.id), branches: n.children.length, ms: Date.now() - started });
    scheduleSave();
    closeSheet();
    go('map', n.id, true);
  });


  /* ---------- Lente «Claridad»: el tema paso a paso, con metáfora, imagen y ejemplo ---------- */
  const LENS_KEY = 'gk_m_lens_';
  function lensKey(topic) { return LENS_KEY + topic.toLowerCase().replace(/\s+/g, ' ').slice(0, 80); }
  function elx(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function renderLens(d) {
    const box = $('#lensScroll'); box.textContent = '';
    box.appendChild(elx('h1', '', d.topic));
    box.appendChild(elx('div', 'ln-kind', 'Claridad: de la confusión a la claridad'));
    if (d.essence) box.appendChild(elx('p', 'ln-essence', d.essence));
    (d.steps || []).forEach((s, i) => {
      const card = elx('div', 'ln-step'), h2 = elx('h2'); h2.appendChild(elx('b', '', String(i + 1))); h2.appendChild(document.createTextNode(s.title)); card.appendChild(h2);
      card.appendChild(elx('p', '', s.explanation));
      [['Metáfora', s.metaphor], ['Imagen para recordarlo', s.image], ['Ejemplo', s.example]].forEach(([k, v]) => { if (!v) return; const p = elx('p'); p.appendChild(elx('i', '', k)); p.appendChild(document.createTextNode(v)); card.appendChild(p); });
      box.appendChild(card);
    });
    const sc = d.shortcut;
    if (sc && sc.name) {
      const c = elx('div', 'ln-short'); c.appendChild(elx('h2', '', sc.name)); c.appendChild(elx('div', 'ln-kind', 'Atajo para recordarlo todo'));
      const ul = elx('ul'); (sc.parts || []).forEach((p) => { const li = elx('li'); li.appendChild(elx('b', '', p.key)); li.appendChild(document.createTextNode(p.meaning)); ul.appendChild(li); }); c.appendChild(ul);
      if (sc.how_to_use) c.appendChild(elx('div', 'ln-caution', sc.how_to_use));
      box.appendChild(c);
    }
    if (d.caution) box.appendChild(elx('div', 'ln-caution', d.caution));
    box.scrollTop = 0;
  }
  $('#btnLens').addEventListener('click', async () => {
    const n = G.nodes[sheetNode]; if (!n) return;
    const btn = $('#btnLens'), msg = $('#sheetMsg'); msg.className = 'msg';
    const topic = clip(n.label, 120), key = lensKey(topic);
    const saved = store.get(key, null);
    track('m_lens_clicked', { depth: depthOf(n.id), cached: !!saved });
    if (saved && saved.steps) { closeSheet(); go('lens', n.id); renderLens(saved); return; }
    msg.textContent = 'Preparando la explicación…'; busy(btn, true);
    const root = G.nodes[G.rootId], mapCtx = root ? (root.label + ': ' + root.children.map((c) => G.nodes[c] && G.nodes[c].label).filter(Boolean).join(', ')).slice(0, 680) : '';
    const started = Date.now();
    const r = await callGemini({ action: 'lens', lens: 'claridad', level: 'intermedio', topic, contextPath: pathOf(n.id).join(' > ').slice(0, 380), mapContext: mapCtx });
    busy(btn, false);
    if (!r.ok) {
      track('m_lens_error', { kind: r.kind });
      if (handleBlocked(r.kind, 'lens')) { closeSheet(); return; }
      msg.textContent = r.kind === 'network' ? failMessage('network') : 'No pudimos armar la explicación. No se cobró nada. Intenta de nuevo.'; msg.classList.add('err'); return;
    }
    store.set(key, r.data);
    track('m_lens_ok', { steps: (r.data.steps || []).length, ms: Date.now() - started });
    closeSheet(); go('lens', n.id); renderLens(r.data);
  });
  $('#btnLensBack').addEventListener('click', () => { try { history.back(); } catch { show('map', cur); } });

  /* ---------- Esquema a partir de un texto seleccionado (pantalla de definiciones) ---------- */
  let selText = '';
  function currentSelection() {
    try {
      const s = window.getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return '';
      const a = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
      if (!a || !a.closest || !a.closest('#defsList')) return '';
      const t = clip(s.toString(), 1500);
      return t.length >= 3 ? t : '';
    } catch { return ''; }
  }
  let selT; document.addEventListener('selectionchange', () => {
    clearTimeout(selT);
    selT = setTimeout(() => {
      if (view !== 'defs' || !$('#sheetText').hidden) { $('#selBtn').hidden = true; return; }
      const t = currentSelection();
      if (t) { if ($('#selBtn').hidden) track('m_text_selected', { words: t.split(' ').length }); selText = t; $('#selBtn').hidden = false; }
      else $('#selBtn').hidden = true;
    }, 250);
  });
  $('#selBtn').addEventListener('pointerdown', (e) => e.preventDefault());
  $('#selBtn').addEventListener('click', () => {
    if (!selText) return;
    $('#stQuote').textContent = '«' + (selText.length > 220 ? selText.slice(0, 217) + '…' : selText) + '»';
    $('#stMsg').textContent = ''; $('#stMsg').className = 'msg';
    busy($('#stSame'), false); busy($('#stNew'), false);
    $('#sheetText').hidden = false; $('#sheetTextBackdrop').hidden = false; $('#selBtn').hidden = true;
    try { window.getSelection().removeAllRanges(); } catch { /* nada */ }
  });
  function closeTextSheet() { $('#sheetText').hidden = true; $('#sheetTextBackdrop').hidden = true; }
  $('#stCancel').addEventListener('click', closeTextSheet);
  $('#sheetTextBackdrop').addEventListener('click', () => { if (!$('#stSame').disabled) closeTextSheet(); });
  async function makeFromText(where) {
    const msg = $('#stMsg'), btn = where === 'same' ? $('#stSame') : $('#stNew'), other = where === 'same' ? $('#stNew') : $('#stSame');
    msg.className = 'msg'; msg.textContent = 'Armando el esquema…';
    if (where === 'same' && countNodes() >= MAX_NODES) { msg.textContent = 'Este proyecto ya es muy grande. Prueba con un proyecto nuevo.'; msg.classList.add('err'); return; }
    track('m_text_map_clicked', { where });
    busy(btn, true); other.disabled = true;
    const started = Date.now();
    const topic = G.rootId ? G.nodes[G.rootId].label : '';
    const few = selText.split(' ').filter(Boolean).length < 4;   // una palabra o frase corta: se trata como tema
    const r = few
      ? await callGemini({ action: 'm_map', topic: clip(selText, 120), contextPath: (G.nodes[cur] ? pathOf(cur).concat([G.nodes[cur].label]) : [topic]).join(' > ').slice(0, 380) })
      : await callGemini({ action: 'm_text', text: selText, topic });
    busy(btn, false); other.disabled = false;
    if (!r.ok) {
      track('m_map_error', { kind: r.kind, where: 'text' });
      if (handleBlocked(r.kind, 'text')) { closeTextSheet(); return; }
      msg.textContent = failMessage(r.kind, r.data); msg.classList.add('err'); return;
    }
    const label = clip(r.data.root && r.data.root.label, 80) || 'Esquema';
    let target;
    if (where === 'same') {
      const parent = G.nodes[cur] ? cur : G.rootId;
      target = newNode(label, 'del texto', parent);
      target.color = PALETTE[(G.nodes[parent].children.length - 1) % PALETTE.length];
    } else {
      try { await saveProject(); } catch { /* nada */ }
      G = emptyG();
      target = newNode(label, '', null); G.rootId = target.id;
    }
    addChildren(target.id, r.data.branches);
    mapsCount++;
    track('m_text_map_ok', { where, branches: target.children.length, ms: Date.now() - started });
    scheduleSave();
    closeTextSheet();
    go('map', target.id, true);
  }
  $('#stSame').addEventListener('click', () => makeFromText('same'));
  $('#stNew').addEventListener('click', () => makeFromText('new'));

  /* ---------- Atajo "Nuevo": volver al inicio para hacer otro mapa (el actual ya queda guardado) ---------- */
  $('#btnNew').addEventListener('click', async () => {
    track('m_new_clicked', { from: view });
    closeSheet(); closeTextSheet();
    clearTimeout(saveTimer);
    if (G.rootId) { try { await saveProject(); } catch { /* nada */ } }
    G = emptyG(); cur = null;
    go('home');
  });

  /* ---------- Ver definiciones ---------- */
  /* Puente con Escribir (Practicar): se guarda el mapa y se abre la práctica con el tema del nodo actual. */
  $('#btnPractice').addEventListener('click', async () => {
    const n = G.nodes[cur]; if (!n) return;
    const root = G.rootId && G.nodes[G.rootId] ? G.nodes[G.rootId].label : '';
    const topic = clip(n.id !== G.rootId && root ? n.label + ' (' + root + ')' : n.label, 120);
    track('m_to_practice', { depth: depthOf(cur) });
    clearTimeout(saveTimer); try { await saveProject(); } catch { /* nada */ }
    location.href = '/escribir/?practicar=' + encodeURIComponent(topic);
  });
  const defsBtn = $('#btnDefs');
  try { if (!localStorage.getItem('gk_m_defs_seen')) defsBtn.classList.add('glow'); } catch { defsBtn.classList.add('glow'); }
  defsBtn.addEventListener('click', () => { defsBtn.classList.remove('glow'); try { localStorage.setItem('gk_m_defs_seen', '1'); } catch { /* nada */ } track('m_defs_opened', { depth: depthOf(cur) }); go('defs', cur); });
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
    const r = await callGemini({ action: 'glossary', voice: G.voice === 'tu' ? 'tu' : undefined, topic: G.nodes[id].label, contextPath: pathOf(id).join(' > ').slice(0, 380), terms: terms.map((t) => ({ id: t.id, label: t.label })) });
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
    c.fillStyle = '#0b1118'; c.fillRect(0, 0, W, H + PADT);
    c.fillStyle = '#e8ebf0'; c.font = '700 17px Sora, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(node.label, W / 2, 28);
    c.translate(0, PADT);
    kids.forEach((k, i) => {
      const b = boxes[i + 1], x1 = W / 2, y1 = H / 2, x2 = b.x + b.w / 2, y2 = b.y + b.h / 2;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      c.strokeStyle = k.color || PALETTE[0]; c.globalAlpha = .75; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x1, y1);
      c.quadraticCurveTo((x1 + x2) / 2 - (dy / len) * len * .12, (y1 + y2) / 2 + (dx / len) * len * .12, x2, y2); c.stroke(); c.globalAlpha = 1;
    });
    const drawBox = (b, label, color, isRoot, done) => {
      c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 14);
      if (isRoot) { const g = c.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h); g.addColorStop(0, '#7aa7d9'); g.addColorStop(1, '#7aa7d9'); c.fillStyle = g; c.fill(); }
      else { c.fillStyle = '#0e1520'; c.fill(); c.fillStyle = color + (done ? '4d' : '29'); c.fill(); c.strokeStyle = color; c.lineWidth = 2; c.stroke(); }
      c.fillStyle = isRoot ? '#071016' : '#e8ebf0'; c.font = (isRoot ? '700 17px' : '600 15px') + ' Sora, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const lines = wrapText(c, label, b.w - 26), lh = isRoot ? 20 : 18, y0 = b.y + b.h / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => c.fillText(l, b.x + b.w / 2, y0 + i * lh));
      if (done) { c.fillStyle = '#7aa7d9'; c.beginPath(); c.arc(b.x + b.w - 2, b.y + 2, 9, 0, 7); c.fill(); }
    };
    kids.forEach((k, i) => drawBox(boxes[i + 1], k.label, k.color || PALETTE[0], false, k.children.length > 0));
    drawBox(boxes[0], node.label, '#7aa7d9', true, false);
    c.setTransform(S, 0, 0, S, 0, 0); c.fillStyle = '#8b94a5'; c.font = '500 12px Inter, sans-serif'; c.textAlign = 'center'; c.fillText('Graphikosmos', W / 2, H + PADT - 10);
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
      const n = G.nodes[id], d = depthOf(id), col = n.color || '#7aa7d9';
      return {
        id, label: '*' + n.label + '*', baseTitle: n.label, depthLevel: d, x: Math.round((pos[id] || { x: 0 }).x), y: Math.round((pos[id] || { y: 0 }).y),
        color: { background: d === 0 ? '#7aa7d9' : col, border: col },
        definition: n.def ? n.def.definition : undefined, simple: n.def ? n.def.simple : undefined, example: n.def ? n.def.example : undefined,
        relationship: n.rel || undefined
      };
    });
    const edges = [];
    ids.forEach((id) => G.nodes[id].children.forEach((c) => edges.push({ id: 'e_' + id + '_' + c, from: id, to: c, label: G.nodes[c].rel || '' })));
    const u = user();
    return { owner: u ? (u.user_metadata && u.user_metadata.full_name) || u.email : 'Invitado', email: u ? u.email : 'local', nodes, edges, mobile: true, qerVoice: G.voice === 'tu' ? true : undefined, readerText: '', documentContext: '', panelState: null };
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
    if (rec.qerVoice) g.voice = 'tu';
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

  /* ---------- Gemas (saldo visible + tienda) ---------- */
  function setGems(nodes) {
    const b = $('#btnGems'); if (!b || typeof nodes !== 'number' || !window.GK_GEMS) return;
    b.hidden = false; $('#gemsVal').textContent = window.GK_GEMS.gemsLabel(nodes);
  }
  async function fetchBalance(n) {
    if (typeof n === 'number') { setGems(n); return; }
    try {
      const r = await fetch(FN + 'balance', { credentials: 'same-origin', headers: await headers() });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.kind === 'admin') $('#btnGems').hidden = true;
      else if (r.ok) setGems(d.balance);
    } catch { /* sin saldo visible, no pasa nada */ }
  }
  if (window.GK_GEMS) window.GK_GEMS.configure({ from: 'graphikosmos', refresh: fetchBalance });
  $('#btnGems').addEventListener('click', () => { track('m_gems_clicked'); if (window.GK_GEMS) window.GK_GEMS.openShop({ from: 'graphikosmos' }); });

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
    netlifyIdentity.on('init', () => { updateLogin(); fetchBalance(); setTimeout(resumeMobile, 700); });
    netlifyIdentity.on('login', () => { netlifyIdentity.close(); closeModals(); updateLogin(); track('m_login_success'); toast('Sesión iniciada'); fetchBalance(); if (G.rootId) scheduleSave(); setTimeout(resumeMobile, 500); });
    netlifyIdentity.on('logout', () => { updateLogin(); fetchBalance(); toast('Sesión cerrada'); });
  }
  updateLogin();

  /* ---------- Modales ---------- */
  /* Opinión: una sola vez por dispositivo, 30 s después de ver un mapa; se puede saltar. Se guarda como evento m_feedback (metadata: rating, text). */
  let fbArmed = false, fbRate = '', fbShownAt = 0;
  function fbDone() { try { return !!localStorage.getItem('gk_m_fb'); } catch { return true; } }
  function armFeedback() {
    if (fbArmed || fbDone()) return; fbArmed = true;
    let tries = 0;
    const attempt = () => {
      const busyNow = view !== 'map' || document.querySelector('.modal:not([hidden])') || ($('#sheet') && !$('#sheet').hidden) || ($('#introSplash') && $('#introSplash').offsetParent);
      if (busyNow && ++tries < 30) { setTimeout(attempt, 10000); return; }
      if (busyNow || fbDone()) return;
      try { localStorage.setItem('gk_m_fb', String(Date.now())); } catch { /* nada */ }
      fbShownAt = Date.now(); track('m_feedback_shown', {}); openModal('#modalFeedback');
    };
    setTimeout(attempt, 30000);
  }
  /* Después de la opinión (enviada o saltada) y solo a quien aún no tiene cuenta: invitación a registrarse, una vez. */
  let installAfterFlow = false;
  function installNow() { installAfterFlow = false; try { if (window.GK_INSTALL) window.GK_INSTALL.maybe(); } catch { /* nada */ } }
  function askRegisterAfterFeedback() {
    if (user()) { if (installAfterFlow) installNow(); return; }
    setTimeout(() => { if (document.querySelector('.modal:not([hidden])')) return; track('m_register_prompt', { after: 'feedback' }); openModal('#modalRegister'); }, 400);
  }
  document.querySelectorAll('#mfRate button').forEach((b) => b.addEventListener('click', () => {
    fbRate = b.dataset.r; document.querySelectorAll('#mfRate button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#mfSend').addEventListener('click', () => {
    const text = clip($('#mfText').value, 600);
    if (!fbRate && !text) { closeModals(); track('m_feedback_skipped', { seconds: Math.round((Date.now() - fbShownAt) / 1000) }); askRegisterAfterFeedback(); return; }
    track('m_feedback', { rating: fbRate, text, seconds: Math.round((Date.now() - fbShownAt) / 1000) });
    closeModals(); toast('Gracias por tu opinión.'); askRegisterAfterFeedback();
  });
  $('#mfSkip').addEventListener('click', () => { track('m_feedback_skipped', { seconds: Math.round((Date.now() - fbShownAt) / 1000) }); closeModals(); askRegisterAfterFeedback(); });
  $('#modalFeedback').addEventListener('click', (e) => { if (e.target.id === 'modalFeedback') { track('m_feedback_skipped', { via: 'backdrop' }); askRegisterAfterFeedback(); } });

  function openModal(sel) { $(sel).hidden = false; }
  function closeModals() { document.querySelectorAll('.modal').forEach((m) => { m.hidden = true; }); }
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
  $('#mlClose').addEventListener('click', closeModals);
  $('#mrGo').addEventListener('click', () => { track('m_login_clicked', { from: 'after_feedback' }); closeModals(); if (installAfterFlow) installNow(); if (window.netlifyIdentity) netlifyIdentity.open('signup'); else toast('No se pudo abrir el registro.'); });
  $('#mrClose').addEventListener('click', () => { track('m_register_declined'); closeModals(); if (installAfterFlow) installNow(); });
  $('#mcClose').addEventListener('click', closeModals);
  $('#mlGo').addEventListener('click', () => { track('m_login_clicked', { from: 'paywall' }); closeModals(); if (window.netlifyIdentity) netlifyIdentity.open('signup'); else toast('No se pudo abrir el registro.'); });
  function openContact() {
    const u = user(); if (u && !$('#contactEmail').value) $('#contactEmail').value = u.email || '';
    $('#contactMsg').textContent = ''; $('#contactMsg').className = 'msg';
    $('#contactWa').href = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent('Hola, me quedé sin gemas en Graphikosmos (versión móvil) y quiero seguir usándolo.');
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
      const res = await fetch(FN + 'send-feedback', { method: 'POST', credentials: 'same-origin', headers: await headers(), body: JSON.stringify({ kind: 'recharge_request', email, message: 'Solicitud desde Graphikosmos MÓVIL: se quedó sin gemas y quiere seguir usándolo.' }) });
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
