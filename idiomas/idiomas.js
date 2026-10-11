/* Graphikosmos · Idiomas. Mapa de BLOQUES con rol gramatical, frase de origen resaltada y audio.
   Servidor: acciones lang_map (se cobra por nodo) y lang_word (gratis) en netlify/functions/gemini.js */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const FN = '/.netlify/functions/';
  const ROLES = {
    sujeto: { name: 'Sujeto', color: 'var(--r-sujeto)', hex: '#63b3ed' },
    verbo: { name: 'Verbo', color: 'var(--r-verbo)', hex: '#4fd1c5' },
    objeto: { name: 'Objeto', color: 'var(--r-objeto)', hex: '#8b7cf6' },
    circunstancia: { name: 'Circunstancia', color: 'var(--r-circunstancia)', hex: '#f6ad55' },
    conector: { name: 'Conector', color: 'var(--r-conector)', hex: '#f687b3' },
    otro: { name: 'Otro', color: 'var(--r-otro)', hex: '#8a92b2' }
  };
  const BCP47 = { de: 'de-DE', en: 'en-US', fr: 'fr-FR', it: 'it-IT', pt: 'pt-BR', nl: 'nl-NL', sv: 'sv-SE', pl: 'pl-PL', ru: 'ru-RU', tr: 'tr-TR', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN' };
  const NS = 'http://www.w3.org/2000/svg';

  let S = null;            // { lang, text, nodes:{id:{...}}, order:[ids], tokens:[{s,e,el}] }
  let mode = 'topic';
  let selId = null, cur = 'root', renderToken = 0;
  let wordPending = null;  // palabra tocada que aún no es nodo

  /* ---------- Utilidades ---------- */
  function user() { try { return window.netlifyIdentity ? netlifyIdentity.currentUser() : null; } catch { return null; } }
  async function headers() {
    const h = { 'Content-Type': 'application/json' };
    try { const u = user(); if (u) { const t = await u.jwt(); if (t) h.Authorization = 'Bearer ' + t; } } catch { /* sin token */ }
    return h;
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }
  function clip(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
  function norm(s) { return String(s).replace(/\s+/g, ' ').toLowerCase(); }
  function busy(btn, on) { btn.classList.toggle('is-busy', !!on); btn.disabled = !!on; }
  function wc(s) { return s.trim().split(/\s+/).filter(Boolean).length; }

  function setGems(nodes) {
    const b = $('#btnGems'); if (!b || typeof nodes !== 'number' || !window.GK_GEMS) return;
    b.hidden = false; $('#gemsVal').textContent = window.GK_GEMS.gemsLabel(nodes);
  }
  async function fetchBalance(n) {
    if (typeof n === 'number') { setGems(n); return; }
    try {
      const r = await fetch(FN + 'balance', { credentials: 'same-origin', headers: await headers() });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.kind === 'admin') $('#btnGems').hidden = true; else if (r.ok) setGems(d.balance);
    } catch { /* sin saldo visible */ }
  }
  function updateLogin() { const u = user(); $('#loginLabel').textContent = u ? clip((u.email || 'Mi cuenta').split('@')[0], 12) : 'Entrar'; $('#btnLogin').classList.toggle('on', !!u); }
  if (window.GK_GEMS) window.GK_GEMS.configure({ from: 'idiomas', refresh: fetchBalance });
  $('#btnGems').addEventListener('click', () => { if (window.GK_GEMS) window.GK_GEMS.openShop({ from: 'idiomas' }); });
  $('#btnLogin').addEventListener('click', () => { if (!window.netlifyIdentity) { toast('No se pudo abrir el inicio de sesión. Revisa tu conexión.'); return; } netlifyIdentity.open(user() ? undefined : 'login'); });
  try {
    if (window.netlifyIdentity) {
      netlifyIdentity.on('init', () => { updateLogin(); fetchBalance(); });
      netlifyIdentity.on('login', () => { try { netlifyIdentity.close(); } catch (e) { /* nada */ } updateLogin(); fetchBalance(); });
      netlifyIdentity.on('logout', () => { updateLogin(); fetchBalance(); });
      netlifyIdentity.init({ locale: 'es' });
    }
  } catch { /* nada */ }
  updateLogin();

  async function callGemini(body) {
    let res;
    try { res = await fetch(FN + 'gemini', { method: 'POST', credentials: 'same-origin', headers: await headers(), body: JSON.stringify(Object.assign({ lang: 'es' }, body)) }); }
    catch { return { ok: false, kind: 'network' }; }
    let data = {}; try { data = await res.json(); } catch { /* nada */ }
    if (res.ok) { if (typeof data.balance === 'number' && !data.admin) setGems(data.balance); return { ok: true, data }; }
    if (res.status === 402 && typeof data.balance === 'number') setGems(data.balance);
    if (res.status === 402 && data.error === 'guest_limit_reached') return { ok: false, kind: 'login', data };
    if (res.status === 402) return { ok: false, kind: user() ? 'nobalance' : 'login', data };
    if (res.status === 401) return { ok: false, kind: 'login', data };
    if (res.status === 429) return { ok: false, kind: user() ? 'rate' : 'login', data };
    return { ok: false, kind: 'server', data, status: res.status };
  }
  async function callRetry(body) { let r = await callGemini(body); if (!r.ok && r.kind === 'server') r = await callGemini(body); return r; }
  function failText(kind) {
    if (kind === 'login') return 'Para seguir, crea tu cuenta gratis o inicia sesión.';
    if (kind === 'nobalance') return 'Se acabaron tus gemas. Consigue más para seguir.';
    if (kind === 'rate') return 'Hay mucha actividad en tu cuenta. Espera unos minutos e intenta de nuevo.';
    if (kind === 'network') return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
    return 'No pudimos hacerlo. Intenta de nuevo.';
  }
  function openLogin() { try { window.netlifyIdentity && netlifyIdentity.open('signup'); } catch { /* nada */ } }

  /* ---------- Pantalla de inicio ---------- */
  const textIn = $('#textIn'), topicIn = $('#topicIn'), btnGo = $('#btnGo');
  function show(v) { ['Home', 'Map', 'Text'].forEach((n) => { $('#view' + n).hidden = n !== v; }); }
  function setMode(m) {
    mode = m;
    $('#tabText').classList.toggle('on', m === 'text'); $('#tabText').setAttribute('aria-selected', m === 'text');
    $('#tabTopic').classList.toggle('on', m === 'topic'); $('#tabTopic').setAttribute('aria-selected', m === 'topic');
    textIn.hidden = m !== 'text'; topicIn.hidden = m !== 'topic';
    $('#startMsg').className = 'msg';
    $('#startMsg').textContent = m === 'text' ? 'Pega un texto de al menos 6 palabras.' : 'Armamos un texto corto sobre el tema y lo convertimos en un mapa.';
    updateGo();
  }
  function updateGo() {
    btnGo.disabled = mode === 'text' ? wc(textIn.value) < 6 : clip(topicIn.value, 120).length < 2;
  }
  $('#tabText').addEventListener('click', () => setMode('text'));
  $('#tabTopic').addEventListener('click', () => setMode('topic'));
  textIn.addEventListener('input', updateGo);
  topicIn.addEventListener('input', updateGo);
  try { const l = localStorage.getItem('gk_idioma2'); if (l && $('#langSel').querySelector('option[value="' + l + '"]')) $('#langSel').value = l; } catch { /* nada */ }
  $('#langSel').addEventListener('change', () => { try { localStorage.setItem('gk_idioma2', $('#langSel').value); } catch { /* nada */ } });

  $('#homeForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (btnGo.disabled) return;
    const msg = $('#startMsg'); msg.className = 'msg'; msg.textContent = 'Armando tu mapa…';
    const lang = $('#langSel').value;
    const body = { action: 'lang_map', studyLang: lang };
    if (mode === 'text') body.text = textIn.value; else body.topic = clip(topicIn.value, 120);
    busy(btnGo, true);
    const r = await callRetry(body);
    busy(btnGo, false); updateGo();
    if (!r.ok) {
      msg.className = 'msg err'; msg.textContent = failText(r.kind);
      if (r.kind === 'login') openLogin();
      if (r.kind === 'nobalance' && window.GK_GEMS) window.GK_GEMS.openShop({ from: 'idiomas' });
      return;
    }
    msg.textContent = '';
    startSession(lang, r.data);
  });

  /* ---------- Sesión de estudio ---------- */
  function startSession(lang, d) {
    S = { lang, text: String(d.text || '').replace(/\s+/g, ' ').trim(), nodes: {}, order: [], seq: 0 };
    const add = (n, parent, rel) => { S.nodes[n.id] = { id: n.id, label: n.label, translation: n.translation, role: n.role || 'otro', meaning: n.meaning, quote: n.sourceQuote || '', parent, rel: rel || '', kids: [] }; S.order.push(n.id); if (parent) S.nodes[parent].kids.push(n.id); };
    add(Object.assign({}, d.root, { id: 'root', role: 'verbo' }), null, '');
    (d.branches || []).forEach((b) => add(b, 'root', b.relationship));
    (d.subBranches || []).forEach((s) => { if (S.nodes[s.parentId]) add(s, s.parentId, s.relationship); });
    S.seq = S.order.length;
    $('#legend').innerHTML = Object.keys(ROLES).filter((k) => k !== 'otro').map((k) => '<span><i style="background:' + ROLES[k].hex + '"></i>' + ROLES[k].name + '</span>').join('');
    $('#textBody').lang = lang;
    renderText(); closeSheet(); go('root', true);
  }
  function go(id, animate) { cur = id; show('Map'); renderMap(animate); }
  $('#btnBack').addEventListener('click', () => {
    closeSheet();
    const n = S && S.nodes[cur];
    if (n && n.parent) go(n.parent, false);
    else { show('Home'); try { window.speechSynthesis && speechSynthesis.cancel(); } catch { /* nada */ } }
  });
  $('#btnText').addEventListener('click', () => { closeSheet(); show('Text'); });
  $('#btnTextBack').addEventListener('click', () => { closeSheet(); go(cur, false); });

  /* ---------- Texto con palabras tocables ---------- */
  function renderText() {
    const body = $('#textBody'); body.textContent = ''; S.tokens = [];
    const text = S.text;
    let segs = [];
    try {
      if (window.Intl && Intl.Segmenter) {
        const seg = new Intl.Segmenter(S.lang, { granularity: 'word' });
        for (const x of seg.segment(text)) segs.push({ s: x.index, e: x.index + x.segment.length, word: !!x.isWordLike });
      }
    } catch { segs = []; }
    if (!segs.length) { const re = /[\p{L}\p{N}'’-]+|[^\p{L}\p{N}]+/gu; let m; while ((m = re.exec(text))) segs.push({ s: m.index, e: m.index + m[0].length, word: /[\p{L}\p{N}]/u.test(m[0]) }); }
    const frag = document.createDocumentFragment();
    segs.forEach((g) => {
      const str = text.slice(g.s, g.e);
      if (!g.word) { frag.appendChild(document.createTextNode(str)); return; }
      const el = document.createElement('span'); el.className = 'w'; el.textContent = str; el.dataset.s = g.s; el.dataset.e = g.e;
      S.tokens.push({ s: g.s, e: g.e, el });
      frag.appendChild(el);
    });
    body.appendChild(frag);
  }
  $('#textBody').addEventListener('click', (ev) => {
    const el = ev.target.closest('.w'); if (!el) return;
    onWordTap(el.textContent, Number(el.dataset.s));
  });
  function sentenceAt(idx) {
    const text = S.text, re = /[^.!?。！？]+[.!?。！？]*/g; let m;
    while ((m = re.exec(text))) { if (idx >= m.index && idx < m.index + m[0].length) return { s: m.index, e: m.index + m[0].length, str: m[0].trim() }; }
    return { s: 0, e: text.length, str: text.slice(0, 300) };
  }
  function highlight(start, end) {
    if (!S || !S.tokens) return;
    S.tokens.forEach((t) => t.el.classList.toggle('hl', start != null && t.e > start && t.s < end));
  }
  function quoteRange(q) {
    if (!q) return null;
    const i = S.text.toLowerCase().indexOf(norm(q));
    return i < 0 ? null : { s: i, e: i + q.length };
  }

  /* ---------- Mapa (diseño radial del móvil de Graphikosmos: el nodo actual al centro y sus partes alrededor) ---------- */
  function renderMap(animate) {
    const node = S.nodes[cur]; if (!node) { show('Home'); return; }
    const token = ++renderToken;
    const stage = $('#mapStage'); stage.innerHTML = '';
    $('#mapTitle').textContent = node.label;
    $('#btnBack').setAttribute('aria-label', node.parent ? 'Volver al mapa anterior' : 'Nuevo tema');
    const W = stage.clientWidth, H = stage.clientHeight;
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'edges'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    stage.appendChild(svg);
    const mk = (n, isRoot) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mnode' + (isRoot ? ' root' : '') + (n.added ? ' added' : '');
      b.dataset.id = n.id; b.style.setProperty('--c', (ROLES[n.role] || ROLES.otro).hex);
      b.lang = S.lang; const t = document.createElement('span'); t.textContent = clip(n.label, 60); b.appendChild(t);
      const sm = document.createElement('small'); sm.lang = 'es'; sm.textContent = clip(n.translation, 34); b.appendChild(sm);
      if (n.kids.length) b.insertAdjacentHTML('beforeend', '<span class="badge" title="Tiene partes"><svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg></span>');
      b.setAttribute('aria-label', n.label + ', ' + n.translation);
      stage.appendChild(b); return b;
    };
    const center = mk(node, true);
    const kids = node.kids.map((id) => S.nodes[id]);
    const els = kids.map((k) => mk(k, false));
    const sz = (e) => ({ w: e.offsetWidth, h: e.offsetHeight });
    const cs = sz(center);
    const boxes = [{ x: W / 2 - cs.w / 2, y: H / 2 - cs.h / 2, w: cs.w, h: cs.h, fixed: true }];
    const n = els.length, M = 12;
    els.forEach((e, i) => {
      const s = sz(e), a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const rx = Math.max(40, (W - s.w) / 2 - M), ry = Math.max(60, (H - s.h) / 2 - M - 8);
      boxes.push({ x: W / 2 + Math.cos(a) * rx - s.w / 2, y: H / 2 + Math.sin(a) * ry - s.h / 2, w: s.w, h: s.h });
    });
    relax(boxes, W, H, M);
    const paths = kids.map((k, i) => {
      const b = boxes[i + 1], x1 = W / 2, y1 = H / 2, x2 = b.x + b.w / 2, y2 = b.y + b.h / 2;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const cx = (x1 + x2) / 2 - (dy / len) * len * 0.12, cy = (y1 + y2) / 2 + (dx / len) * len * 0.12;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', 'M' + x1 + ',' + y1 + ' Q' + cx + ',' + cy + ' ' + x2 + ',' + y2); p.setAttribute('class', 'edge'); p.setAttribute('stroke', (ROLES[k.role] || ROLES.otro).hex);
      svg.appendChild(p); return p;
    });
    [center].concat(els).forEach((e, i) => { e.style.transform = 'translate(' + Math.round(boxes[i].x) + 'px,' + Math.round(boxes[i].y) + 'px)'; });
    paths.forEach((p) => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = animate ? L : 0; });
    const reveal = (e, p, delay) => setTimeout(() => {
      if (token !== renderToken) return;
      e.classList.add('show');
      if (p) { p.style.transition = 'stroke-dashoffset .55s ease'; p.style.strokeDashoffset = '0'; }
    }, delay);
    if (animate) { reveal(center, null, 30); els.forEach((e, i) => reveal(e, paths[i], 260 + i * 130)); }
    else { center.classList.add('show'); els.forEach((e) => e.classList.add('show')); }
    $('#mapHint').textContent = node.kids.length ? 'Toca un bloque para ver qué significa.' : 'Este bloque no tiene partes. Toca el centro para ver su detalle.';
  }
  function relax(boxes, W, H, M) {
    const pad = 10;
    for (let it = 0; it < 80; it++) {
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
  let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (S && !$('#viewMap').hidden) renderMap(false); }, 200); });
  $('#mapStage').addEventListener('click', (e) => { const b = e.target.closest('.mnode'); if (b) selectNode(b.dataset.id); });

  /* ---------- Hoja de detalle ---------- */
  const sheet = $('#sheet'), backdrop = $('#sheetBackdrop');
  function fillSheet(info) {
    const r = ROLES[info.role] || ROLES.otro;
    const chip = $('#shRole'); chip.textContent = r.name; chip.style.color = r.hex;
    $('#shLabel').textContent = info.label; $('#shLabel').lang = S.lang;
    $('#shTr').textContent = info.translation || '';
    $('#shRel').textContent = info.rel ? 'Relación con «' + info.parentLabel + '»: ' + info.rel : '';
    $('#shMeaning').textContent = info.meaning || '';
    $('#shQuoteBox').hidden = !info.quote; $('#shQuote').textContent = info.quote || ''; $('#shQuote').lang = S.lang;
    $('#btnShowInText').hidden = !(info.quote && quoteRange(info.quote));
    $('#shVoiceMsg').textContent = ''; $('#shVoiceMsg').className = 'msg';
  }
  function openSheet() { sheet.hidden = false; backdrop.hidden = false; }
  function selectNode(id) {
    const n = S.nodes[id]; if (!n) return;
    selId = id; wordPending = null;
    fillSheet(Object.assign({}, n, { parentLabel: n.parent ? S.nodes[n.parent].label : '' }));
    $('#btnAddNode').hidden = true;
    const kb = $('#btnKids'); kb.hidden = !(n.kids.length && id !== cur);
    const q = quoteRange(n.quote); highlight(q ? q.s : null, q ? q.e : null);
    openSheet();
  }
  function closeSheet() { sheet.hidden = true; backdrop.hidden = true; selId = null; wordPending = null; highlight(null); }
  backdrop.addEventListener('click', closeSheet);
  $('#btnKids').addEventListener('click', () => { const id = selId; closeSheet(); if (id) go(id, true); });
  $('#btnShowInText').addEventListener('click', () => {
    const c = selId && S.nodes[selId], q = c ? quoteRange(c.quote) : (wordPending ? quoteRange(wordPending.sentence) : null);
    const keep = c ? c.quote : (wordPending && wordPending.sentence);
    show('Text'); sheet.hidden = true; backdrop.hidden = true;
    const r = quoteRange(keep) || q; if (!r) return;
    highlight(r.s, r.e);
    const first = S.tokens.find((t) => t.e > r.s && t.s < r.e);
    if (first) first.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  /* ---------- Palabra tocada en el texto ---------- */
  async function onWordTap(word, idx) {
    const sen = sentenceAt(idx);
    highlight(sen.s, sen.e);
    selId = null;
    const clean = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    wordPending = { word: clean, sentence: sen.str, idx };
    fillSheet({ role: 'otro', label: clean, translation: 'Buscando…', meaning: '', quote: sen.str });
    $('#btnAddNode').hidden = true; $('#btnKids').hidden = true; $('#btnShowInText').hidden = true; openSheet();
    const r = await callRetry({ action: 'lang_word', studyLang: S.lang, word: clean, sentence: sen.str });
    if (!wordPending || wordPending.word !== clean) return;
    if (!r.ok) {
      fillSheet({ role: 'otro', label: clean, translation: '', meaning: failText(r.kind), quote: sen.str }); $('#btnShowInText').hidden = true;
      if (r.kind === 'login') openLogin();
      return;
    }
    const d = r.data, pos = norm(d.partOfSpeech || '');
    const role = /verb/.test(pos) ? 'verbo' : /adverb|preposici|locuci/.test(pos) ? 'circunstancia' : /conjunci|conector|partícula|particula/.test(pos) ? 'conector' : /sustantiv|pronombre|nombre|adjetiv/.test(pos) ? 'objeto' : 'otro';
    wordPending.info = { label: d.chunk || clean, translation: d.translation, role, meaning: (d.partOfSpeech ? d.partOfSpeech.charAt(0).toUpperCase() + d.partOfSpeech.slice(1) + (d.lemma && norm(d.lemma) !== norm(clean) ? ' · forma base: ' + d.lemma + '. ' : '. ') : '') + d.meaning, quote: sen.str };
    fillSheet(Object.assign({}, wordPending.info, { label: clean + (d.chunk && norm(d.chunk) !== norm(clean) ? '  →  ' + d.chunk : '') }));
    $('#btnShowInText').hidden = true;
    $('#btnAddNode').hidden = false;
  }
  $('#btnAddNode').addEventListener('click', () => {
    if (!wordPending || !wordPending.info) return;
    const info = wordPending.info, id = 'w' + (S.seq++);
    let parent = 'root', best = null;
    S.order.forEach((k) => { const n = S.nodes[k]; if (n.id !== 'root' && n.quote && n.quote.toLowerCase().includes(norm(wordPending.sentence).slice(0, 40))) best = best || n; });
    if (!best) S.order.forEach((k) => { const n = S.nodes[k]; if (!best && n.parent === 'root' && n.quote && norm(wordPending.sentence).includes(norm(n.quote).slice(0, 40))) best = n; });
    if (best) parent = best.parent === 'root' ? best.id : best.parent;
    S.nodes[id] = { id, label: info.label, translation: info.translation, role: info.role, meaning: info.meaning, quote: info.quote, parent, rel: 'palabra', kids: [], added: true };
    S.nodes[parent].kids.push(id); S.order.push(id);
    closeSheet(); go(parent, false); toast('Agregado al mapa');
  });

  /* ---------- Audio ---------- */
  function speak(text, then) {
    const msg = $('#shVoiceMsg');
    if (!('speechSynthesis' in window)) { msg.className = 'msg err'; msg.textContent = 'Tu navegador no tiene voz. Prueba con Chrome o Safari.'; return; }
    const u = new SpeechSynthesisUtterance(text), code = BCP47[S.lang] || S.lang;
    u.lang = code; u.rate = 0.9;
    try {
      const v = speechSynthesis.getVoices().find((x) => x.lang === code) || speechSynthesis.getVoices().find((x) => x.lang.slice(0, 2) === S.lang);
      if (v) u.voice = v;
      else if (speechSynthesis.getVoices().length) { msg.textContent = 'Este dispositivo no trae voz de ese idioma; se usará la voz por defecto.'; }
    } catch { /* nada */ }
    if (then) u.onend = then;
    speechSynthesis.speak(u);
  }
  function say(text) { try { speechSynthesis.cancel(); } catch { /* nada */ } $('#shVoiceMsg').textContent = ''; speak(text); }
  try { window.speechSynthesis && (speechSynthesis.onvoiceschanged = function () { /* carga perezosa */ }); } catch { /* nada */ }
  $('#btnSayChunk').addEventListener('click', () => {
    const cur = wordPending ? (wordPending.info ? wordPending.info.label : wordPending.word) : selId && S.nodes[selId].label;
    if (cur) say(cur.replace(/\s+→.*/, ''));
  });
  $('#btnSaySentence').addEventListener('click', () => {
    const q = wordPending ? wordPending.sentence : selId && (S.nodes[selId].quote || S.nodes[selId].label);
    if (q) say(q);
  });
})();
