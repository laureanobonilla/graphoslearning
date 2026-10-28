/* Libro como fuente de verdad.
   El PDF se lee UNA vez en el navegador (sin costo de IA) y queda indexado por fragmentos con su
   número de página. Cuando la app le pide algo a la IA sobre un tema (expandir, definir, ejemplos…),
   en vez de mandar un recorte fijo del documento se mandan los fragmentos del libro COMPLETO que
   mejor responden a ese tema, cada uno con su página. La IA marca de qué página sale cada cosa y el
   navegador lo verifica; lo que no tiene respaldo se muestra como "IA". */
(function () {
  'use strict';
  const es = () => !(window.I18N && I18N.lang === 'en');
  const L = (a, b) => (es() ? a : b);
  const ACTIONS = { expand: 1, examples: 1, define: 1, simple_explanation: 1, custom_prompt: 1 };
  const STOP = new Set('de la el los las un una unos unas y o en del al que se por con para como su sus es son lo le les mas pero sin sobre entre desde hasta este esta estos estas ese esa eso muy a e the of and to in is are for on with as by an or that this from'.split(' '));
  const MAXCTX = 8000;

  const S = { name: '', title: '', pages: [], chunks: [], tf: [], df: null, avg: 1, N: 0, ready: false, busy: false, last: [], fails: 0, lastErr: '', note: '' };

  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const stem = (w) => (w.length > 5 ? w.replace(/(es|s)$/, '') : w);
  const toks = (t) => (norm(t).match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w)).map(stem);

  // ---------- índice ----------
  function isIndexPage(pg, i, n) {
    if (pg.toc) return true;
    const t = pg.text || '';
    const refs = (t.match(/,\s*\d{1,4}\s*(;|\.|$|\s{2})/g) || []).length;
    if (i > n * 0.9 && refs > 25) return true;
    return /^\s*(t[eé]rminos clave|[ií]ndice)/i.test(t) && refs > 12;
  }
  function build(name, pages) {
    S.name = name; S.pages = pages; S.chunks = [];
    const n = pages.length;
    pages.forEach((pg, i) => {
      if (isIndexPage(pg, i, n)) return;
      const paras = String(pg.text || '').split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x.length > 30);
      let buf = '';
      const push = () => { if (buf.length > 80) S.chunks.push({ p: pg.p, t: buf.trim() }); buf = ''; };
      paras.forEach((x) => { buf += ' ' + x; if (buf.length > 650) push(); });
      push();
    });
    S.tf = S.chunks.map((c) => { const m = new Map(); toks(c.t).forEach((w) => m.set(w, (m.get(w) || 0) + 1)); return { m, len: [...m.values()].reduce((a, b) => a + b, 0), nt: norm(c.t) }; });
    S.N = S.chunks.length; S.df = new Map();
    S.tf.forEach((d) => d.m.forEach((_v, w) => S.df.set(w, (S.df.get(w) || 0) + 1)));
    S.avg = S.tf.reduce((a, d) => a + d.len, 0) / Math.max(1, S.N);
    S.ready = S.N > 0;
  }
  function outline() {
    const ch = new Map();
    S.pages.forEach((pg) => {
      const head = String(pg.text || '').slice(0, 260);
      const m = head.match(/C\s*AP[ÍI]?\s*T\s*U\s*L\s*O\s*(\d{1,2})\s+([^\n]{3,80})/i) || head.match(/CHAPTER\s+(\d{1,2})\s+([^\n]{3,80})/i);
      if (m && !/foto|photo|:/i.test(m[2]) && !ch.has(+m[1])) ch.set(+m[1], { n: +m[1], p: pg.p, t: m[2].replace(/\s+/g, ' ').trim() });
    });
    return [...ch.values()].sort((a, b) => a.n - b.n);
  }
  function search(q, phrase, k) {
    const qt = [...new Set(toks(q))]; if (!qt.length) return [];
    const ph = norm(phrase || '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
    const out = [];
    for (let i = 0; i < S.N; i++) {
      const d = S.tf[i]; let s = 0;
      for (const w of qt) {
        const f = d.m.get(w); if (!f) continue;
        const df = S.df.get(w) || 0;
        s += Math.log(1 + (S.N - df + 0.5) / (df + 0.5)) * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * d.len / S.avg));
      }
      if (!s) continue;
      if (ph && ph.length > 3 && d.nt.indexOf(ph) >= 0) s *= 1.7;
      const head = d.nt.slice(0, 90); if (qt.some((w) => head.indexOf(w.slice(0, 5)) >= 0)) s *= 1.15;
      const letters = (S.chunks[i].t.match(/[A-Za-zÁÉÍÓÚáéíóúñÑ]/g) || []).length / S.chunks[i].t.length;
      if (letters < 0.6) s *= 0.6;
      out.push({ s, i });
    }
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, k || 8);
  }
  // Fragmentos del libro completo para un tema; devuelve el texto con [p. N] y las páginas usadas.
  function context(topic, contextPath, action) {
    const parent = String(contextPath || '').split(/→|>|\/|\|/).map((x) => x.trim()).filter(Boolean);
    const up = parent.length > 1 ? parent[parent.length - 2] : '';
    const q = topic + ' ' + topic + ' ' + (action === 'define' ? 'definición concepto se define como' : '') + ' ' + up;
    const hits = search(q, topic, 9);
    let txt = '', pages = [];
    const cap = S.fails > 0 ? 3500 : MAXCTX;
    for (const h of hits) {
      const c = S.chunks[h.i]; const piece = '[p. ' + c.p + '] ' + c.t + '\n\n';
      if (txt.length + piece.length > cap) break;
      txt += piece; if (pages.indexOf(c.p) < 0) pages.push(c.p);
    }
    S.last = pages;
    return { txt: txt.trim(), pages };
  }
  // Para el esquema inicial: capítulos del libro (con su página) + los fragmentos que mejor responden al tema.
  function schemaContext(topic) {
    const ol = outline();
    const head = ol.length ? 'ESTRUCTURA DEL LIBRO (capítulo, título, página donde empieza):\n' + ol.map((c) => 'Cap. ' + c.n + ' — ' + c.t + ' [p. ' + c.p + ']').join('\n') + '\n\n' : '';
    const c = context(topic, '', 'schema');
    let txt = head + (c.txt ? 'FRAGMENTOS RELEVANTES:\n' + c.txt : '');
    if (txt.length > 11800) txt = txt.slice(0, 11800);
    return txt;
  }
  // Texto de la izquierda con libro: pasajes del libro que respaldan cada nodo (sin IA). También deja en cada nodo una cita literal corta.
  function enrich(data) {
    const all = [data.root, ...(data.branches || []), ...(data.subBranches || [])].filter(Boolean);
    const used = new Set(), missing = [];
    const sentences = (t) => t.split(/(?<=[.!?])\s+/).filter((x) => x.length > 25);
    function pick(n) {
      if (!n.page || !verify(n.label, n.page)) { n.page = undefined; missing.push(n.label); return null; }
      const lt = [...new Set(toks(n.label))]; let best = -1, bs = 0;
      S.chunks.forEach((c, i) => {
        if (c.p < n.page - 1 || c.p > n.page + 1 || used.has(i)) return;
        const m = S.tf[i].m; let sc = 0; lt.forEach((w) => { if (m.get(w)) sc += 1 + Math.min(3, m.get(w)) * 0.2; });
        if (c.p === n.page) sc += 0.5;
        if (sc > bs) { bs = sc; best = i; }
      });
      if (best < 0) { missing.push(n.label); return null; }
      used.add(best);
      let t = tidy(S.chunks[best].t);
      if (t.length > 900) { const cut = t.slice(0, 900), k = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; ')); t = k > 400 ? cut.slice(0, k + 1) : cut; }
      const ss = sentences(t); let q = ss[0] || t, qs = -1;
      ss.forEach((x) => { const nx = norm(x); const sc = lt.filter((w) => nx.indexOf(w.slice(0, 6)) >= 0).length; if (sc > qs) { qs = sc; q = x; } });
      n.sourceQuote = q.split(' ').slice(0, 15).join(' ').replace(/[.,;:]+$/, '');
      return { p: S.chunks[best].p, t };
    }
    const OL = outline();
    function tidy(t) {
      t = t.replace(/\s+/g, ' ');
      OL.forEach((c) => { const ti = c.t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'); t = t.replace(new RegExp('(?:\\d{1,4}\\s+)?C\\s*AP[ÍI]?\\s*T\\s*U\\s*L\\s*O\\s*' + c.n + '\\s+' + ti + '\\s*', 'ig'), ''); });
      return t.replace(/^\s*\d{1,4}\s+(?=\D)/, '').trim();
    }
    const out = [], ex = new Map();
    all.forEach((n) => ex.set(n, pick(n)));
    const block = (n, ind) => { const e = ex.get(n); if (!e) return; out.push(ind + n.label + ' — ' + L('libro p. ', 'book p. ') + e.p + '\n' + ind + e.t + '\n'); };
    const r = data.root; block(r, '');
    (data.branches || []).forEach((b) => { block(b, ''); (data.subBranches || []).filter((x) => x.parentId === b.id).forEach((x) => block(x, '    ')); });
    let txt = L('Pasajes de «', 'Passages from "') + S.name + L('» que respaldan este mapa. Cada uno indica la página del PDF.', '" that support this map. Each shows the PDF page.') + '\n\n' + out.join('\n');
    if (missing.length) txt += '\n' + L('Sin pasaje en el libro (aportados por la IA): ', 'No passage in the book (added by the AI): ') + missing.join(', ') + '.';
    return txt.slice(0, 29000);
  }
  // ¿El concepto realmente aparece en la página que la IA dice?
  function verify(label, page) {
    page = Number(page); if (!page) return false;
    const pg = S.pages.find((x) => x.p === page); if (!pg) return false;
    const t = norm(pg.text), words = toks(label);
    if (!words.length) return false;
    const hit = words.filter((w) => t.indexOf(w.slice(0, 6)) >= 0).length;
    return hit >= Math.ceil(words.length / 2);
  }

  // ---------- integración con las llamadas a la IA ----------
  function patchBody(raw) {
    try {
      const b = JSON.parse(raw);
      if (S.ready && b && b.action === 'glossary' && Array.isArray(b.terms) && b.terms.length) {
        const seen = new Set(); let txt = '';
        b.terms.forEach((t) => {
          const hits = search(t.label + ' ' + t.label, t.label, 2); let part = '';
          hits.forEach((h) => { const c = S.chunks[h.i]; if (seen.has(h.i)) return; seen.add(h.i); part += '[p. ' + c.p + '] ' + c.t.slice(0, 700) + '\n'; });
          txt += 'TÉRMINO «' + t.label + '» (id ' + t.id + '):\n' + (part || '(sin fragmentos en el libro)\n') + '\n';
        });
        b.documentContext = txt.slice(0, 11800); b.bookMode = true; b.bookName = S.name;
        return JSON.stringify(b);
      }
      if (S.ready && b && b.action === 'parse_text' && typeof b.text === 'string' && b.text.trim().split(/\s+/).length < 60) {
        const t = schemaContext(b.text);
        if (t) { b.documentContext = t; b.bookMode = true; b.bookName = S.name; return JSON.stringify(b); }
        return raw;
      }
      if (!S.ready || !b || !ACTIONS[b.action] || !b.topic) return raw;
      const c = context(b.topic, Array.isArray(b.contextPath) ? b.contextPath.join(' → ') : b.contextPath, b.action);
      if (!c.txt) return raw;
      b.documentContext = c.txt; b.bookMode = true; b.bookName = S.name;
      return JSON.stringify(b);
    } catch (_e) { return raw; }
  }

  // Resultado de cada llamada a la IA hecha con libro: si falla, se registra el motivo y la siguiente va con menos texto.
  function report(raw, ok, status, data) {
    try {
      const b = JSON.parse(raw || '{}'); if (!b.bookMode) return;
      if (ok) {
        S.fails = 0; S.lastErr = '';
        // Definición hecha con libro que no cita ninguna página: no sale del libro, y se dice.
        if (b.action === 'define' && data && typeof data.definition === 'string' && !/\(p\.\s*\d+/i.test(data.definition)) {
          data.definition = data.definition.replace(/\s+$/, '') + '\n\n' + L('Nota: esto no está detallado en el libro; la explicación es de la IA, no del libro.', 'Note: this is not detailed in the book; the explanation comes from the AI, not the book.');
          data.notInBook = true;
        }
        return;
      }
      S.fails++; S.lastErr = status + (data && data.error ? ' · ' + String(data.error).slice(0, 80) : '');
      if (window.track) track('book_api_error', { action: b.action, status, err: String(data && data.error || '').slice(0, 120), ctx: (b.documentContext || '').length, fails: S.fails });
    } catch (_e) { /* nada */ }
  }
  // ---------- guardado local (para no volver a leer el PDF) ----------
  const DB = 'gk_book', ST = 'book';
  function idb() { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function save() { try { const d = await idb(); d.transaction(ST, 'readwrite').objectStore(ST).put({ name: S.name, pages: S.pages.map((p) => ({ p: p.p, text: p.text, toc: p.toc })) }, 'cur'); } catch (_e) { /* sin almacenamiento */ } }
  async function restore() {
    try { const d = await idb(); const v = await new Promise((res, rej) => { const r = d.transaction(ST).objectStore(ST).get('cur'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); if (v && v.pages && v.pages.length) { build(v.name, v.pages); ui(); } } catch (_e) { /* nada guardado */ }
  }
  async function wipe() { S.ready = false; S.chunks = []; S.pages = []; S.name = ''; try { const d = await idb(); d.transaction(ST, 'readwrite').objectStore(ST).delete('cur'); } catch (_e) { /* ok */ } ui(); }

  // ---------- carga ----------
  async function load(file) {
    if (!file || S.busy) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { alert(L('Elige un archivo PDF.', 'Choose a PDF file.')); return; }
    if (typeof pdfjsLib === 'undefined' || typeof analyzePdfPages !== 'function') { alert(L('El lector de PDF todavía no cargó. Intenta de nuevo en unos segundos.', 'The PDF reader has not loaded yet. Try again in a few seconds.')); return; }
    S.busy = true; ui(L('Leyendo el libro…', 'Reading the book…'));
    const t0 = Date.now();
    try {
      const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = await analyzePdfPages(doc, 1, doc.numPages, (a, b) => ui(L('Leyendo página ', 'Reading page ') + a + ' / ' + b));
      const chars = pages.reduce((a, p) => a + (p.chars || 0), 0);
      if (chars < doc.numPages * 200) { S.busy = false; ui(); alert(L('Este PDF parece escaneado (no tiene texto seleccionable), así que no puedo usarlo como fuente.', 'This PDF looks scanned (no selectable text), so I cannot use it as a source.')); return; }
      build(file.name.replace(/\.pdf$/i, ''), pages.map((p) => ({ p: p.p, text: p.text, toc: p.toc, chars: p.chars })));
      await save();
      let ttl = ''; try { const md = await doc.getMetadata(); ttl = String(md && md.info && md.info.Title || '').trim(); } catch (_e) { /* sin metadatos */ }
      if (!/[a-záéíóúñ]{4,}/i.test(ttl) || ttl.length > 80) ttl = /[a-záéíóúñ]{4,}/i.test(S.name) ? S.name.replace(/[_-]+/g, ' ') : '';
      S.title = ttl;
      if (window.track) track('book_loaded', { pages: doc.numPages, chunks: S.N, sec: Math.round((Date.now() - t0) / 1000), kb: Math.round(file.size / 1024) });
    } catch (e) {
      console.error(e); alert(L('No pude leer ese PDF.', 'I could not read that PDF.'));
      if (window.track) track('book_error', { message: String(e && e.message || '').slice(0, 100) });
    } finally { S.busy = false; ui(); }
    autoMap();
  }
  function failMsg() {
    if (/^40[12]/.test(S.lastErr)) return L('Para armar el mapa necesitas iniciar sesión o tener gemas. El libro sigue cargado: al iniciar sesión el mapa se arma solo.', 'To build the map you need to sign in or have gems. The book stays loaded: after signing in the map builds itself.');
    return (S.lastErr ? 'Error ' + S.lastErr + '. ' : '') + L('El libro quedó cargado. Escribe un tema o una pregunta sobre el libro y pulsa Estudiar.', 'The book is loaded. Type a topic or a question about the book and press Study.');
  }
  function note(t) { S.note = t; ui(); setTimeout(() => { if (S.note === t) { S.note = ''; ui(); } }, 45000); }
  // Con un libro cargado, el campo de tema invita a preguntarle algo.
  function hint() {
    ['startTopic', 'gkComposerInput', 'gcTopic'].forEach((id) => { const i = document.getElementById(id); if (!i) return; if (!i.dataset.gkPh) i.dataset.gkPh = i.placeholder || ''; i.placeholder = S.ready ? L('Escribe un tema o pregúntale algo al libro…', 'Type a topic or ask the book something…') : i.dataset.gkPh; });
  }
  // Al subir el libro, el mapa se arma solo con el libro (sin pulsar "Estudiar"), si no hay uno abierto.
  async function autoMap(manual) {
    try {
      if (!S.ready || typeof nodes === 'undefined' || (nodes.length > 0 && !manual) || !window.GK_NAV) return;
      GK_NAV.setTopic(S.title || L('Contenido del libro', 'Book contents'));
      await GK_NAV.go('mapa');
      if (window.track) track('book_automap', { ok: nodes.length > 0 });
      if (nodes.length === 0) note(failMsg());
    } catch (e) { console.error('[libro] mapa automático:', e); note(failMsg()); }
  }

  // ---------- interfaz ----------
  let el = null, inp = null;
  function ui(msg) {
    if (!el) return;
    const on = S.ready && !S.busy;
    el.className = 'gkb show' + (on ? ' on' : '') + (S.busy ? ' busy' : '');
    document.body.classList.toggle('gk-book', on); hint();
    if (S.busy) { el.innerHTML = '<span class="gkb-t">' + (msg || '') + '</span>'; return; }
    if (on) {
      el.innerHTML = '<span class="gkb-t" title="' + S.name.replace(/"/g, '') + '">' + L('Libro: ', 'Book: ') + '<b>' + S.name.slice(0, 26).replace(/</g, '&lt;') + (S.name.length > 26 ? '…' : '') + '</b> · ' + S.pages.length + ' pp</span><button type="button" class="gkb-x" aria-label="' + L('Quitar libro', 'Remove book') + '">×</button>';
      el.querySelector('.gkb-x').onclick = (e) => { e.stopPropagation(); if (confirm(L('¿Quitar el libro? Los mapas ya creados se conservan.', 'Remove the book? Existing maps are kept.'))) wipe(); };
      const noMap = typeof nodes !== 'undefined' && nodes.length === 0;
      if (noMap) { const b = document.createElement('button'); b.type = 'button'; b.className = 'gkb-m'; b.textContent = L('Armar mapa', 'Build map'); b.onclick = (e) => { e.stopPropagation(); autoMap(true); }; el.insertBefore(b, el.querySelector('.gkb-x')); }
      if (S.note) { const n = document.createElement('div'); n.className = 'gkb-n'; n.textContent = S.note; el.appendChild(n); }
      el.onclick = null; el.title = L('Los conceptos y definiciones se buscan en este libro', 'Concepts and definitions are looked up in this book');
    } else {
      el.innerHTML = '<span class="gkb-t">' + L('Subir libro (PDF)', 'Upload book (PDF)') + '</span>';
      el.onclick = () => inp.click(); el.title = L('Sube un libro y el mapa se arma con lo que dice, con la página de cada cosa', 'Upload a book and the map is built from what it says, with the page of each item');
    }
  }
  function css() {
    const s = document.createElement('style');
    s.textContent = '.gkb{position:fixed;right:12px;bottom:14px;z-index:60;display:none;align-items:center;gap:6px;max-width:300px;padding:6px 11px;border-radius:7px;border:1px solid #2a3550;background:#121a2c;color:#aab6cc;font:12px/1.2 system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}' +
      '.gkb:hover{border-color:#6f86b3;color:#e2e8f0}.gkb.on{cursor:default}.gkb.on b{color:#e2e8f0}.gkb.busy{cursor:progress}.gkb-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.gkb-m{border:1px solid #3b5a8f;background:#16233f;color:#d6e2f7;border-radius:5px;font:600 11px system-ui;padding:3px 8px;cursor:pointer}.gkb-n{position:absolute;right:0;bottom:calc(100% + 6px);width:300px;padding:8px 10px;border-radius:7px;background:#121a2c;border:1px solid #3b5a8f;color:#d6e2f7;font:12px/1.4 system-ui,sans-serif;white-space:normal}.gkb-x{border:0;background:none;color:#8a97b0;font-size:15px;line-height:1;cursor:pointer;padding:0 2px}.gkb-x:hover{color:#fff}' +
      '@media(min-width:781px){.gkb.show{display:flex}}';
    document.head.appendChild(s);
  }
  function mount() {
    css();
    el = document.createElement('div'); el.className = 'gkb show'; el.setAttribute('role', 'button'); el.tabIndex = 0;
    inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,.pdf'; inp.hidden = true; inp.id = 'gkBookInput';
    inp.onchange = () => { const f = inp.files && inp.files[0]; inp.value = ''; load(f); };
    el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !S.ready) { e.preventDefault(); inp.click(); } });
    document.body.append(el, inp);
    ui(); restore(); setInterval(() => { if (S.ready && !S.busy) ui(); }, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  window.GK_BOOK = { enrich, report, outline, on: () => S.ready, load, patchBody, verify, context, search, state: S, wipe };
})();
