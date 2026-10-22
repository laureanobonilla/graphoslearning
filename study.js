/* "Dame 3 minutos": sesión corta de repaso sobre el mapa abierto.
   Por cada concepto: se intenta recordar ANTES de ver la respuesta, se revela la definición
   (la del libro si hay uno cargado) y se marca qué tan bien se sabía. Lo que falla vuelve pronto,
   lo que se domina tarda más (repaso espaciado). El estado vive en este navegador. */
(function () {
  'use strict';
  const es = () => !(window.I18N && I18N.lang === 'en');
  const L = (a, b) => (es() ? a : b);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KEY = 'gk_study_v1', DAY = 864e5, GAP = [0, 1, 3, 7, 21], N = 5;
  const clean = (s) => String(s || '').replace(/\*|_libro p\. \d+_|_IA_/g, '').replace(/\s+/g, ' ').trim();
  const lab = (n) => clean(n.baseTitle || n.label);

  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_e) { store = {}; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (_e) { /* sin almacenamiento */ } };

  const haveMap = () => { try { return typeof nodes !== 'undefined' && nodes.length >= 4; } catch (_e) { return false; } };
  function rootLabel() {
    try { const ids = nodes.getIds(); const r = ids.find((id) => edges.get({ filter: (e) => e.to === id }).length === 0); return r ? lab(nodes.get(r)) : ''; } catch (_e) { return ''; }
  }
  const keyOf = (root, n) => (root + '|' + lab(n)).toLowerCase();
  function items() {
    const root = rootLabel(), now = Date.now();
    return nodes.get().filter((n) => lab(n) && !n.isMystery && edges.get({ filter: (e) => e.to === n.id }).length > 0).map((n) => {
      const k = keyOf(root, n), st = store[k] || { box: 0, due: 0, seen: 0 };
      return { n, k, st, due: st.due <= now };
    });
  }
  function pick() {
    const all = items();
    const due = all.filter((x) => x.due).sort((a, b) => a.st.box - b.st.box || a.st.due - b.st.due || Math.random() - 0.5);
    const rest = all.filter((x) => !x.due).sort((a, b) => a.st.due - b.st.due);
    return due.concat(rest).slice(0, N);
  }
  const mastered = () => { const a = items(); return { m: a.filter((x) => x.st.box >= 3).length, t: a.length }; };
  const parentOf = (id) => { try { const e = edges.get({ filter: (x) => x.to === id })[0]; return e ? lab(nodes.get(e.from) || {}) : ''; } catch (_e) { return ''; } };

  async function definitionOf(n) {
    if (n.definition) return { text: n.definition, page: n.bookPage || 0 };
    const title = lab(n);
    try {
      const { ok, data } = await apiFetch('/.netlify/functions/gemini', { method: 'POST', body: JSON.stringify({ action: 'define', topic: title, interactive: false, contextPath: getContextPath(n.id), documentContext: (typeof globalDocumentContext !== 'undefined' && globalDocumentContext) || (typeof currentDocumentText !== 'undefined' ? currentDocumentText : '') }) });
      if (ok && data && data.definition) { try { applyServerBalance(data); } catch (_e) { /* ok */ } nodes.update({ id: n.id, baseTitle: title, definition: data.definition, definitionSource: data.source || 'gemini' }); return { text: data.definition, page: n.bookPage || 0 }; }
    } catch (_e) { /* sigue abajo */ }
    return null;
  }

  // ---------- pantalla ----------
  let ov = null, S = null;
  function css() {
    const s = document.createElement('style');
    s.textContent = '.gks-btn{position:fixed;left:12px;bottom:56px;z-index:60;display:none;padding:7px 13px;border-radius:7px;border:1px solid #3b5a8f;background:#16233f;color:#d6e2f7;font:600 12px/1.2 system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}.gks-btn:hover{background:#1c2e52;border-color:#6f9be0}' +
      '@media(min-width:781px){.gks-btn.show{display:block}}body.gk-entry .gks-btn,body.gk-cos .gks-btn{display:none!important}' +
      '#gks{position:fixed;inset:0;z-index:300;background:rgba(7,11,22,.96);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#dbe4f3}' +
      '#gks .c{width:min(640px,92vw);padding:8px}#gks .top{display:flex;justify-content:space-between;align-items:center;color:#8a97b0;font-size:12px;margin-bottom:22px}' +
      '#gks .bar{height:3px;background:#1d2840;border-radius:2px;margin-bottom:26px}#gks .bar i{display:block;height:100%;background:#6f9be0;border-radius:2px;transition:width .3s}' +
      '#gks .ctx{color:#8a97b0;font-size:13px;margin-bottom:8px}#gks h2{font:600 clamp(26px,4vw,38px)/1.15 Newsreader,Georgia,serif;margin:0 0 22px;color:#f1f5fb}' +
      '#gks textarea{width:100%;min-height:92px;box-sizing:border-box;background:#0f1729;border:1px solid #2a3550;border-radius:8px;color:#e2e8f0;font:15px/1.5 system-ui,sans-serif;padding:11px 13px;resize:vertical;outline:none}#gks textarea:focus{border-color:#6f9be0}' +
      '#gks .def{background:#0f1729;border:1px solid #2a3550;border-radius:8px;padding:14px 16px;font-size:15px;line-height:1.6;white-space:pre-wrap;margin-bottom:6px;max-height:42vh;overflow:auto}#gks .mine{color:#8a97b0;font-size:13px;margin:0 0 12px}' +
      '#gks .row{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}#gks button.b{padding:10px 18px;border-radius:8px;border:1px solid #2a3550;background:#131c31;color:#dbe4f3;font:600 14px system-ui,sans-serif;cursor:pointer}#gks button.b:hover{border-color:#6f9be0}' +
      '#gks button.p{background:#6f9be0;border-color:#6f9be0;color:#0b1426}#gks button.p:hover{background:#86adea}#gks .x{background:none;border:0;color:#8a97b0;cursor:pointer;font-size:13px}' +
      '#gks .sm{color:#9fb0cc;font-size:15px;line-height:1.6}#gks .pg{color:#8a97b0;font-size:12px;margin-top:6px}';
    document.head.appendChild(css.el = s);
  }
  function close() { if (ov) { ov.remove(); ov = null; } S = null; document.removeEventListener('keydown', onKey, true); refresh(); }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (!S || S.phase !== 'ask') return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || document.activeElement.tagName !== 'TEXTAREA')) { e.preventDefault(); reveal(); }
  }
  function frame(inner) {
    const done = S ? S.i : 0, tot = S ? S.list.length : 1;
    ov.innerHTML = '<div class="c"><div class="top"><span>' + esc(L('Repaso de 3 minutos', '3-minute review')) + '</span><button class="x" data-a="close">' + esc(L('Salir', 'Exit')) + ' (Esc)</button></div><div class="bar"><i style="width:' + Math.round(done / tot * 100) + '%"></i></div>' + inner + '</div>';
    ov.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => act(b.dataset.a); });
  }
  function ask() {
    S.phase = 'ask'; const x = S.list[S.i], p = parentOf(x.n.id);
    frame((p ? '<div class="ctx">' + esc(L('Dentro de: ', 'Within: ')) + esc(p) + '</div>' : '') + '<h2>' + esc(L('¿Qué es ', 'What is ') + lab(x.n) + '?') + '</h2><textarea id="gksA" placeholder="' + esc(L('Escribe lo que recuerdes, aunque sea poco. Equivocarte ahora ayuda a fijarlo después.', 'Write what you remember, even if little. Getting it wrong now helps it stick later.')) + '"></textarea><div class="row"><button class="b p" data-a="reveal">' + esc(L('Ver respuesta', 'Show answer')) + '</button><button class="b" data-a="reveal">' + esc(L('No tengo idea', 'No idea')) + '</button></div>');
    setTimeout(() => { const t = ov && ov.querySelector('#gksA'); if (t) t.focus(); }, 30);
  }
  async function reveal() {
    if (!S || S.phase !== 'ask') return;
    const x = S.list[S.i], mine = (ov.querySelector('#gksA') || {}).value || ''; S.phase = 'load';
    frame('<h2>' + esc(lab(x.n)) + '</h2><div class="sm">' + esc(L('Buscando la respuesta…', 'Looking up the answer…')) + '</div>');
    const d = await definitionOf(x.n); if (!S) return;
    S.phase = 'rate';
    const fromBook = d && x.n.bookPage;
    frame('<h2>' + esc(lab(x.n)) + '</h2>' + (mine.trim() ? '<div class="mine">' + esc(L('Tu respuesta: ', 'Your answer: ')) + esc(mine.trim().slice(0, 300)) + '</div>' : '') +
      '<div class="def">' + esc(d ? d.text : L('No pude traer la definición ahora. Califícate con lo que sepas.', 'Could not get the definition now. Rate yourself with what you know.')) + '</div>' +
      (fromBook ? '<div class="pg">' + esc(L('Del libro, p. ', 'From the book, p. ')) + x.n.bookPage + '</div>' : '') +
      '<div class="row"><button class="b" data-a="r0">' + esc(L('No lo sabía', "Didn't know")) + '</button><button class="b" data-a="r1">' + esc(L('Casi', 'Almost')) + '</button><button class="b p" data-a="r2">' + esc(L('Lo sabía', 'Knew it')) + '</button></div>');
  }
  function rate(v) {
    const x = S.list[S.i], st = x.st; st.seen = (st.seen || 0) + 1;
    st.box = v === 2 ? Math.min(4, (st.box || 0) + 1) : v === 1 ? (st.box || 0) : 0;
    st.due = Date.now() + GAP[st.box] * DAY + (v === 0 ? 5 * 60e3 : 0); store[x.k] = st; persist();
    S.score[v]++; S.i++;
    if (window.track) track('study_rate', { v, box: st.box });
    S.i >= S.list.length ? end() : ask();
  }
  function end() {
    S.phase = 'end'; const m = mastered(), sc = S.score, tot = S.list.length;
    frame('<h2>' + esc(L('Sesión terminada', 'Session complete')) + '</h2><div class="sm">' + esc(L('Repasaste ', 'You reviewed ')) + tot + esc(L(' conceptos: ', ' concepts: ')) + sc[2] + esc(L(' los sabías, ', ' known, ')) + sc[1] + esc(L(' casi, ', ' almost, ')) + sc[0] + esc(L(' a repasar pronto.', ' to review soon.')) + '<br>' + esc(L('Dominas ', 'You have mastered ')) + '<b>' + m.m + '</b> ' + esc(L('de ', 'of ')) + m.t + esc(L(' conceptos de este mapa. Los que fallaste volverán primero la próxima vez.', ' concepts in this map. The ones you missed come back first next time.')) + '</div><div class="row"><button class="b p" data-a="again">' + esc(L('Otros 3 minutos', 'Another 3 minutes')) + '</button><button class="b" data-a="close">' + esc(L('Volver al mapa', 'Back to the map')) + '</button></div>');
    if (window.track) track('study_end', { n: tot, known: sc[2], almost: sc[1], missed: sc[0], mastered: m.m, total: m.t });
  }
  function act(a) {
    if (a === 'close') close(); else if (a === 'reveal') reveal(); else if (a === 'again') start();
    else if (a === 'r0') rate(0); else if (a === 'r1') rate(1); else if (a === 'r2') rate(2);
  }
  function start() {
    if (!haveMap()) return;
    const list = pick(); if (!list.length) return;
    if (!ov) { ov = document.createElement('div'); ov.id = 'gks'; document.body.appendChild(ov); document.addEventListener('keydown', onKey, true); }
    S = { list, i: 0, score: [0, 0, 0], phase: 'ask' };
    if (window.track) track('study_start', { n: list.length, mapNodes: nodes.length });
    ask();
  }

  let btn = null;
  function refresh() {
    if (!btn) return;
    const on = haveMap() && !ov;
    btn.classList.toggle('show', on);
    if (on) { const a = items(), due = a.filter((x) => x.due).length; btn.textContent = L('Dame 3 minutos', 'Give me 3 minutes') + (due && due < a.length ? ' · ' + due : ''); }
  }
  function mount() {
    css();
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'gks-btn'; btn.onclick = start;
    btn.title = L('Repasa conceptos de este mapa: primero intentas recordarlos y después ves la respuesta', 'Review concepts from this map: try to recall first, then see the answer');
    document.body.appendChild(btn); setInterval(refresh, 2000); refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.GK_STUDY = { start, state: () => store };
})();
