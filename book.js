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
  const MAXCTX = 10800;

  const S = { name: '', pages: [], chunks: [], tf: [], df: null, avg: 1, N: 0, ready: false, busy: false, last: [] };

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
    for (const h of hits) {
      const c = S.chunks[h.i]; const piece = '[p. ' + c.p + '] ' + c.t + '\n\n';
      if (txt.length + piece.length > MAXCTX) break;
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
      if (S.ready && b && b.action === 'parse_text' && typeof b.text === 'string' && b.text.trim().split(/\s+/).length < 25) {
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
      if (window.track) track('book_loaded', { pages: doc.numPages, chunks: S.N, sec: Math.round((Date.now() - t0) / 1000), kb: Math.round(file.size / 1024) });
    } catch (e) {
      console.error(e); alert(L('No pude leer ese PDF.', 'I could not read that PDF.'));
      if (window.track) track('book_error', { message: String(e && e.message || '').slice(0, 100) });
    } finally { S.busy = false; ui(); }
  }

  // ---------- interfaz ----------
  let el = null, inp = null;
  function ui(msg) {
    if (!el) return;
    const on = S.ready && !S.busy;
    el.className = 'gkb show' + (on ? ' on' : '') + (S.busy ? ' busy' : '');
    document.body.classList.toggle('gk-book', on);
    if (S.busy) { el.innerHTML = '<span class="gkb-t">' + (msg || '') + '</span>'; return; }
    if (on) {
      el.innerHTML = '<span class="gkb-t" title="' + S.name.replace(/"/g, '') + '">' + L('Libro: ', 'Book: ') + '<b>' + S.name.slice(0, 26).replace(/</g, '&lt;') + (S.name.length > 26 ? '…' : '') + '</b> · ' + S.pages.length + ' pp</span><button type="button" class="gkb-x" aria-label="' + L('Quitar libro', 'Remove book') + '">×</button>';
      el.querySelector('.gkb-x').onclick = (e) => { e.stopPropagation(); if (confirm(L('¿Quitar el libro? Los mapas ya creados se conservan.', 'Remove the book? Existing maps are kept.'))) wipe(); };
      el.onclick = null; el.title = L('Los conceptos y definiciones se buscan en este libro', 'Concepts and definitions are looked up in this book');
    } else {
      el.innerHTML = '<span class="gkb-t">' + L('Subir libro (PDF)', 'Upload book (PDF)') + '</span>';
      el.onclick = () => inp.click(); el.title = L('Sube un libro y el mapa se arma con lo que dice, con la página de cada cosa', 'Upload a book and the map is built from what it says, with the page of each item');
    }
  }
  function css() {
    const s = document.createElement('style');
    s.textContent = '.gkb{position:fixed;left:12px;bottom:14px;z-index:60;display:none;align-items:center;gap:6px;max-width:300px;padding:6px 11px;border-radius:7px;border:1px solid #2a3550;background:#121a2c;color:#aab6cc;font:12px/1.2 system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}' +
      '.gkb:hover{border-color:#6f86b3;color:#e2e8f0}.gkb.on{cursor:default}.gkb.on b{color:#e2e8f0}.gkb.busy{cursor:progress}.gkb-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.gkb-x{border:0;background:none;color:#8a97b0;font-size:15px;line-height:1;cursor:pointer;padding:0 2px}.gkb-x:hover{color:#fff}' +
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
    ui(); restore();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  window.GK_BOOK = { outline, on: () => S.ready, load, patchBody, verify, context, search, state: S, wipe };
})();
