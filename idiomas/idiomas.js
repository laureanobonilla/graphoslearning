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
  let mode = 'text';
  let selId = null;
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

  async function callGemini(body) {
    let res;
    try { res = await fetch(FN + 'gemini', { method: 'POST', credentials: 'same-origin', headers: await headers(), body: JSON.stringify(Object.assign({ lang: 'es' }, body)) }); }
    catch { return { ok: false, kind: 'network' }; }
    let data = {}; try { data = await res.json(); } catch { /* nada */ }
    if (res.ok) return { ok: true, data };
    if (res.status === 402 && data.error === 'guest_limit_reached') return { ok: false, kind: 'login', data };
    if (res.status === 402) return { ok: false, kind: user() ? 'nobalance' : 'login', data };
    if (res.status === 401) return { ok: false, kind: 'login', data };
    if (res.status === 429) return { ok: false, kind: user() ? 'rate' : 'login', data };
    return { ok: false, kind: 'server', data };
  }
  function failText(kind) {
    if (kind === 'login') return 'Para seguir, crea tu cuenta gratis o inicia sesión.';
    if (kind === 'nobalance') return 'Se acabaron tus gemas. Recarga desde Graphikosmos para seguir.';
    if (kind === 'rate') return 'Hay mucha actividad en tu cuenta. Espera unos minutos e intenta de nuevo.';
    if (kind === 'network') return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
    return 'No pudimos hacerlo. Intenta de nuevo.';
  }
  function openLogin() { try { window.netlifyIdentity && netlifyIdentity.open('signup'); } catch { /* nada */ } }

  /* ---------- Pantalla de inicio ---------- */
  const textIn = $('#textIn'), topicIn = $('#topicIn'), btnGo = $('#btnGo');
  function setMode(m) {
    mode = m;
    $('#tabText').classList.toggle('on', m === 'text'); $('#tabText').setAttribute('aria-selected', m === 'text');
    $('#tabTopic').classList.toggle('on', m === 'topic'); $('#tabTopic').setAttribute('aria-selected', m === 'topic');
    textIn.hidden = m !== 'text'; topicIn.hidden = m !== 'topic';
    $('#hint').textContent = m === 'text' ? 'Mínimo 6 palabras.' : 'Escribe un tema y armamos un texto corto para estudiar.';
    updateGo();
  }
  function updateGo() {
    btnGo.disabled = mode === 'text' ? wc(textIn.value) < 6 : clip(topicIn.value, 120).length < 2;
  }
  $('#tabText').addEventListener('click', () => setMode('text'));
  $('#tabTopic').addEventListener('click', () => setMode('topic'));
  textIn.addEventListener('input', updateGo);
  topicIn.addEventListener('input', updateGo);
  try { const l = localStorage.getItem('gk_idioma'); if (l && $('#langSel').querySelector('option[value="' + l + '"]')) $('#langSel').value = l; } catch { /* nada */ }
  $('#langSel').addEventListener('change', () => { try { localStorage.setItem('gk_idioma', $('#langSel').value); } catch { /* nada */ } });

  btnGo.addEventListener('click', async () => {
    const msg = $('#startMsg'); msg.className = 'msg'; msg.textContent = 'Armando tu mapa…';
    const lang = $('#langSel').value;
    const body = { action: 'lang_map', studyLang: lang };
    if (mode === 'text') body.text = textIn.value; else body.topic = clip(topicIn.value, 120);
    busy(btnGo, true);
    const r = await callGemini(body);
    busy(btnGo, false); updateGo();
    if (!r.ok) {
      msg.className = 'msg err'; msg.textContent = failText(r.kind);
      if (r.kind === 'login') openLogin();
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
    if (typeof d.balance === 'number' && !d.admin) { const b = $('#balance'); b.hidden = false; b.textContent = 'Saldo: ' + d.balance; }
    $('#viewStart').hidden = true; $('#viewResult').hidden = false;
    $('#legend').innerHTML = Object.keys(ROLES).filter((k) => k !== 'otro').map((k) => '<span><i style="background:' + ROLES[k].color + '"></i>' + ROLES[k].name + '</span>').join('');
    $('#textBody').lang = lang;
    renderText(); renderMap(); setPane('map'); closeSheet();
    window.scrollTo(0, 0);
  }
  $('#btnBack').addEventListener('click', () => { $('#viewResult').hidden = true; $('#viewStart').hidden = false; closeSheet(); try { window.speechSynthesis && speechSynthesis.cancel(); } catch { /* nada */ } });
  function setPane(p) {
    $('#mapPane').hidden = p !== 'map'; $('#textPane').hidden = p !== 'text';
    $('#segMap').classList.toggle('on', p === 'map'); $('#segText').classList.toggle('on', p === 'text');
  }
  $('#segMap').addEventListener('click', () => setPane('map'));
  $('#segText').addEventListener('click', () => setPane('text'));

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
    S.tokens.forEach((t) => t.el.classList.toggle('hl', start != null && t.e > start && t.s < end));
  }
  function quoteRange(q) {
    if (!q) return null;
    const i = S.text.toLowerCase().indexOf(norm(q));
    return i < 0 ? null : { s: i, e: i + q.length };
  }

  /* ---------- Mapa ---------- */
  function wrap(str, max) {
    const words = String(str).split(' '), lines = []; let cur = '';
    words.forEach((w) => { if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }
  function layout() {
    const R1 = 190, R2 = 340, ids = S.order.map((i) => S.nodes[i]);
    ids.forEach((n) => {
      n.lines = wrap(n.label, 17); n.trShort = clip(n.translation, 28);
      const chars = Math.max.apply(null, n.lines.map((l) => l.length).concat([n.trShort.length * 0.82]));
      n.w = Math.max(84, Math.round(chars * 8 + 24)); n.h = n.lines.length * 18 + 30;
    });
    const root = S.nodes.root; root.x = 0; root.y = 0;
    const L1 = root.kids.map((k) => S.nodes[k]);
    L1.forEach((n, i) => {
      n.ang = -Math.PI / 2 + (i * 2 * Math.PI) / L1.length;
      n.x = Math.cos(n.ang) * R1 * 1.25; n.y = Math.sin(n.ang) * R1;
    });
    L1.forEach((p) => {
      const k = p.kids.length;
      p.kids.forEach((id, j) => {
        const c = S.nodes[id], step = k > 2 ? 0.34 : 0.4, a = p.ang + (j - (k - 1) / 2) * step;
        c.ang = a; c.x = Math.cos(a) * R2 * 1.25 + (k > 3 ? 0 : 0); c.y = Math.sin(a) * R2;
      });
    });
    ids.forEach((n) => { n.kids.forEach((id) => { const c = S.nodes[id]; if (c.x === undefined) { c.x = n.x + 60; c.y = n.y + 60; c.w = c.w || 100; c.h = c.h || 40; } }); });
  }
  function el(name, attrs, parent) { const e = document.createElementNS(NS, name); Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k])); if (parent) parent.appendChild(e); return e; }
  function renderMap() {
    layout();
    const svg = $('#mapSvg'); svg.textContent = '';
    const ns = S.order.map((i) => S.nodes[i]);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ns.forEach((n) => { x0 = Math.min(x0, n.x - n.w / 2); x1 = Math.max(x1, n.x + n.w / 2); y0 = Math.min(y0, n.y - n.h / 2); y1 = Math.max(y1, n.y + n.h / 2); });
    const pad = 28; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    const W = x1 - x0, H = y1 - y0;
    svg.setAttribute('viewBox', [x0, y0, W, H].join(' ')); svg.setAttribute('width', Math.max(640, Math.round(W))); svg.setAttribute('height', Math.round(Math.max(640, W) * H / W));
    const gE = el('g', {}, svg), gN = el('g', {}, svg);
    ns.forEach((n) => {
      if (!n.parent) return;
      const p = S.nodes[n.parent];
      el('line', { x1: p.x, y1: p.y, x2: n.x, y2: n.y, class: 'edge' }, gE);
      if (n.rel) { const t = el('text', { x: (p.x + n.x) / 2, y: (p.y + n.y) / 2 - 4, class: 'edge-l' }, gE); t.textContent = n.rel; }
    });
    ns.forEach((n) => {
      const g = el('g', { class: 'n-box' + (n.id === selId ? ' sel' : ''), 'data-id': n.id, tabindex: 0, role: 'button', 'aria-label': n.label + ', ' + n.translation }, gN);
      el('rect', { x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h, rx: 12, stroke: (ROLES[n.role] || ROLES.otro).hex }, g);
      n.lines.forEach((ln, i) => { const t = el('text', { x: n.x, y: n.y - n.h / 2 + 20 + i * 18, 'text-anchor': 'middle', lang: S.lang }, g); t.textContent = ln; });
      const tt = el('text', { x: n.x, y: n.y + n.h / 2 - 8, 'text-anchor': 'middle', class: 'n-tr' }, g); tt.textContent = n.trShort;
      g.addEventListener('click', () => selectNode(n.id));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(n.id); } });
    });
    const pane = $('#mapPane');
    requestAnimationFrame(() => { pane.scrollLeft = Math.max(0, (svg.getBoundingClientRect().width - pane.clientWidth) / 2); pane.scrollTop = Math.max(0, (svg.getBoundingClientRect().height - pane.clientHeight) / 2); });
  }

  /* ---------- Hoja de detalle ---------- */
  const sheet = $('#sheet');
  function fillSheet(info) {
    const r = ROLES[info.role] || ROLES.otro;
    const chip = $('#shRole'); chip.textContent = r.name; chip.style.color = r.hex;
    $('#shLabel').textContent = info.label; $('#shLabel').lang = S.lang;
    $('#shTr').textContent = info.translation || '';
    $('#shMeaning').textContent = info.meaning || '';
    $('#shQuoteBox').hidden = !info.quote; $('#shQuote').textContent = info.quote || ''; $('#shQuote').lang = S.lang;
    $('#shVoiceMsg').textContent = ''; $('#shVoiceMsg').className = 'msg';
  }
  function selectNode(id) {
    const n = S.nodes[id]; if (!n) return;
    selId = id; wordPending = null;
    document.querySelectorAll('.n-box').forEach((g) => g.classList.toggle('sel', g.getAttribute('data-id') === id));
    fillSheet(n); $('#btnAddNode').hidden = true;
    const q = quoteRange(n.quote); highlight(q ? q.s : null, q ? q.e : null);
    sheet.hidden = false;
  }
  function closeSheet() { sheet.hidden = true; selId = null; wordPending = null; if (S && S.tokens) highlight(null); document.querySelectorAll('.n-box.sel').forEach((g) => g.classList.remove('sel')); }
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#btnShowInText').addEventListener('click', () => {
    const cur = selId && S.nodes[selId]; if (!cur) return;
    setPane('text');
    const q = quoteRange(cur.quote); if (!q) return;
    const first = S.tokens.find((t) => t.e > q.s && t.s < q.e);
    if (first) first.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  /* ---------- Palabra tocada en el texto ---------- */
  async function onWordTap(word, idx) {
    const sen = sentenceAt(idx);
    highlight(sen.s, sen.e);
    selId = null; document.querySelectorAll('.n-box.sel').forEach((g) => g.classList.remove('sel'));
    const clean = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    wordPending = { word: clean, sentence: sen.str, idx };
    fillSheet({ role: 'otro', label: clean, translation: 'Buscando…', meaning: '', quote: sen.str });
    $('#btnAddNode').hidden = true; sheet.hidden = false;
    const r = await callGemini({ action: 'lang_word', studyLang: S.lang, word: clean, sentence: sen.str });
    if (!wordPending || wordPending.word !== clean) return;
    if (!r.ok) {
      fillSheet({ role: 'otro', label: clean, translation: '', meaning: failText(r.kind), quote: sen.str });
      if (r.kind === 'login') openLogin();
      return;
    }
    const d = r.data, pos = norm(d.partOfSpeech || '');
    const role = /verb/.test(pos) ? 'verbo' : /adverb|preposici|locuci/.test(pos) ? 'circunstancia' : /conjunci|conector|partícula|particula/.test(pos) ? 'conector' : /sustantiv|pronombre|nombre|adjetiv/.test(pos) ? 'objeto' : 'otro';
    wordPending.info = { label: d.chunk || clean, translation: d.translation, role, meaning: (d.partOfSpeech ? d.partOfSpeech.charAt(0).toUpperCase() + d.partOfSpeech.slice(1) + (d.lemma && norm(d.lemma) !== norm(clean) ? ' · forma base: ' + d.lemma + '. ' : '. ') : '') + d.meaning, quote: sen.str };
    fillSheet(Object.assign({}, wordPending.info, { label: clean + (d.chunk && norm(d.chunk) !== norm(clean) ? '  →  ' + d.chunk : '') }));
    $('#btnAddNode').hidden = false;
  }
  $('#btnAddNode').addEventListener('click', () => {
    if (!wordPending || !wordPending.info) return;
    const info = wordPending.info, id = 'w' + (S.seq++);
    // Se cuelga de la rama cuya frase contiene esta oración; si no hay, de la raíz.
    let parent = 'root', best = null;
    S.order.forEach((k) => { const n = S.nodes[k]; if (n.id !== 'root' && n.quote && n.quote.toLowerCase().includes(norm(wordPending.sentence).slice(0, 40))) best = best || n; });
    if (!best) S.order.forEach((k) => { const n = S.nodes[k]; if (!best && n.parent === 'root' && n.quote && norm(wordPending.sentence).includes(norm(n.quote).slice(0, 40))) best = n; });
    if (best) parent = best.parent === 'root' ? best.id : best.parent;
    S.nodes[id] = { id, label: info.label, translation: info.translation, role: info.role, meaning: info.meaning, quote: info.quote, parent, rel: 'palabra', kids: [] };
    S.nodes[parent].kids.push(id); S.order.push(id);
    renderMap(); setPane('map'); selectNode(id); toast('Agregado al mapa');
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
