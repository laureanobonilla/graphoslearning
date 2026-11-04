/* Profundiza — fuentes propias (PDF, archivo de texto, link o texto pegado).
 * Todo lo pesado ocurre en el navegador y SIN IA: leer el PDF, trocear en fragmentos, indexar y buscar.
 * A la IA solo viajan unos pocos fragmentos por pregunta; el documento completo nunca se sube.
 * Para documentos largos: el troceo es lineal, el índice es un mapa palabra→fragmentos (búsqueda casi instantánea)
 * y el plan de preguntas reparte las partes a lo largo del documento sin llamar a ninguna IA. */
(function () {
  'use strict';
  var PDF_VER = '3.11.174', PDF_URLS = ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDF_VER + '/pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDF_VER + '/build/pdf.min.js'];
  var MAX_PAGES = 600, MAX_CHARS = 3000000;
  function norm(s) { return String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

  /* ---------- PDF ---------- */
  function loadScript(url) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
  function waitFor(fn, ms) { return new Promise(function (ok, no) { var t0 = Date.now(); (function p() { var v = fn(); if (v) ok(v); else if (Date.now() - t0 > ms) no(new Error('timeout')); else setTimeout(p, 60); })(); }); }
  var pdfP = null;
  function pdfLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfP) return pdfP;
    pdfP = PDF_URLS.reduce(function (p, url) { return p.catch(function () { return loadScript(url).then(function () { return waitFor(function () { return window.pdfjsLib; }, 8000); }); }); }, Promise.reject())
      .then(function (lib) { if (!lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = PDF_URLS[0].replace('pdf.min.js', 'pdf.worker.min.js'); return lib; })
      .catch(function (e) { pdfP = null; throw new Error('pdflib'); });
    return pdfP;
  }
  function median(a) { if (!a.length) return 12; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }
  function pageLines(items) {   // items de pdf.js → líneas [{y, h, text}] de arriba abajo
    var rows = [];
    items.forEach(function (it) { if (!it.str || !it.transform) return; var y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10, r = null, i;
      for (i = rows.length - 1; i >= 0 && i >= rows.length - 6; i--) if (Math.abs(rows[i].y - y) <= Math.max(2, h * 0.35)) { r = rows[i]; break; }
      if (!r) { r = { y: y, h: h, its: [] }; rows.push(r); } r.its.push({ x: it.transform[4], w: it.width || 0, s: it.str }); });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) { r.its.sort(function (a, b) { return a.x - b.x; }); var t = '', end = null;
      r.its.forEach(function (c) { if (end != null && c.x - end > r.h * 0.18 && t && !/\s$/.test(t) && !/^\s/.test(c.s)) t += ' '; t += c.s; end = c.x + c.w; });
      return { y: r.y, h: r.h, text: t.replace(/\s+/g, ' ').trim() }; }).filter(function (l) { return l.text; });
  }
  function readPdfData(data, onProgress, nameTitle) {
    return pdfLib().then(function (lib) { return lib.getDocument({ data: data }).promise; }).then(function (doc) {
      var n = Math.min(doc.numPages, MAX_PAGES), pages = [], p = 1;
      function step() {
        if (p > n) return Promise.resolve();
        return doc.getPage(p).then(function (pg) { return pg.getTextContent(); }).then(function (tc) { pages.push(pageLines(tc.items)); if (onProgress) onProgress(p, n); p++; return tick(); }).then(step);
      }
      return step().then(function () { return doc.getMetadata().catch(function () { return null; }); }).then(function (meta) {
        // quita encabezados y pies repetidos y números de página
        var cnt = {}; pages.forEach(function (ls) { var seen = {}; ls.forEach(function (l) { var k = norm(l.text).replace(/\d+/g, '#'); if (l.text.length < 90 && !seen[k]) { seen[k] = 1; cnt[k] = (cnt[k] || 0) + 1; } }); });
        var lim = Math.max(3, Math.round(pages.length * 0.4)), hs = [], paras = [], cur = '', prev = null;
        pages.forEach(function (ls) { ls.forEach(function (l) { hs.push(l.h); }); });
        var lh = median(hs);
        pages.forEach(function (ls) {
          prev = null;
          ls.forEach(function (l) {
            var k = norm(l.text).replace(/\d+/g, '#'); if ((pages.length >= 4 && cnt[k] >= lim) || /^[\s\-–—#\d]*(página|page|pág\.?|p\.)?\s*\d+(\s*(de|of|\/)\s*\d+)?[\s\-–—]*$/i.test(l.text)) return;
            var gap = prev ? prev.y - l.y : 0;
            if (!cur) cur = l.text;
            else if (prev && gap > lh * 1.7) { paras.push(cur); cur = l.text; }   // hueco grande: párrafo nuevo
            else if (/-$/.test(cur) && /^[a-záéíóúñü]/.test(l.text)) cur = cur.slice(0, -1) + l.text;   // palabra cortada al final de línea
            else cur += ' ' + l.text;
            prev = l;
          });
          if (cur && /[.!?:;)»”"]$/.test(cur)) { paras.push(cur); cur = ''; }   // si no termina en punto, el párrafo sigue en la página siguiente
        });
        if (cur) paras.push(cur);
        var text = paras.join('\n\n');
        var title = meta && meta.info && meta.info.Title && String(meta.info.Title).trim().length > 3 ? String(meta.info.Title).trim() : (nameTitle || '');
        return { title: title.slice(0, 120), text: text.slice(0, MAX_CHARS), pages: n, truncated: doc.numPages > n };
      });
    });
  }
  function readFile(file, onProgress) {
    var name = (file.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ');
    if (/\.pdf$/i.test(file.name || '') || file.type === 'application/pdf') return file.arrayBuffer().then(function (b) { return readPdfData(new Uint8Array(b), onProgress, name); });
    return file.text().then(function (t) { return { title: name, text: t.replace(/\r/g, '').slice(0, MAX_CHARS) }; });
  }
  function readBase64Pdf(b64, onProgress, name) { var bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return readPdfData(u, onProgress, name); }

  /* ---------- troceo ---------- */
  function splitSentences(p) { return p.split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑÜÀÂÇÈÊËÎÏÔÙÛ¿¡"«“(\d])/); }
  function chunk(text) {
    var paras = String(text || '').replace(/\r/g, '').split(/\n{2,}/).map(function (p) { return p.replace(/\s+/g, ' ').trim(); }).filter(function (p) { return p.length > 1; }), out = [], buf = '';
    function flush() { if (buf.length >= 60) out.push(buf); buf = ''; }
    paras.forEach(function (p) {
      if (p.length > 1000) { flush(); var cur = ''; splitSentences(p).forEach(function (s) { while (s.length > 1000) { if (cur) { out.push(cur); cur = ''; } out.push(s.slice(0, 900)); s = s.slice(900); } if ((cur + ' ' + s).length > 950) { if (cur) out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s; }); if (cur.length >= 60) out.push(cur); return; }
      if (buf && buf.length < 350 && (buf + ' ' + p).length <= 950) buf += ' ' + p; else { flush(); buf = p; }
    });
    flush(); return out;
  }
  function title(text) { var l = String(text || '').split(/\n+/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 3; })[0] || ''; if (l.length > 60) { var m = l.slice(0, 80).match(/^(.{15,60}?)[.:;,]/); l = m ? m[1] : l.slice(0, 57).replace(/\s+\S*$/, '') + '…'; } return l; }

  /* ---------- calidad de un fragmento (¿tiene contenido o es un índice, una bibliografía, ruido?) ---------- */
  var BAD = /(índice|indice|bibliograf|referencias|references|copyright|todos los derechos|all rights reserved|isbn|©|table of contents|contenido\s*$|agradecimientos|acknowledg|figura \d|figure \d|tabla \d|www\.|https?:)/i;
  var DEF = /\b(es|son|fue|fueron|se define|se denomina|se llama|llamad[oa]s?|consiste|significa|refers? to|is|are|was|were|means|called|defined|known as|ist|sind|bedeutet|heißt|est|sont|désigne|signifie|appelé)\b/i;
  function quality(t) {
    var len = t.length; if (len < 180) return 0;
    var letters = (t.match(/[A-Za-zÁÉÍÓÚÑÜáéíóúñüÀ-ÿ]/g) || []).length, digits = (t.match(/\d/g) || []).length;
    if (letters / len < 0.62 || digits / len > 0.18) return 0;
    var sentences = (t.match(/[.!?…](\s|$)/g) || []).length; if (sentences < 2) return 0.2;
    var q = 0.5; if (BAD.test(t)) q -= 0.3; if (DEF.test(t)) q += 0.2; if (len >= 350 && len <= 950) q += 0.15; q += Math.min(0.15, (t.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,}/g) || []).length / 60);
    return Math.max(0, Math.min(1, q));
  }
  /* ---------- plan: n partes repartidas a lo largo del documento, cada una con varios fragmentos candidatos ---------- */
  function plan(chunks, n) {
    var M = chunks.length, qs = chunks.map(quality), sec = Math.max(1, Math.min(n, M)), out = [];
    for (var s = 0; s < sec; s++) {
      var a = Math.floor(s * M / sec), b = Math.floor((s + 1) * M / sec), c = [];
      for (var i = a; i < Math.max(b, a + 1) && i < M; i++) if (qs[i] >= 0.35) c.push(i);
      c.sort(function (x, y) { return qs[y] - qs[x] || x - y; }); c = c.slice(0, 6);
      if (c.length) out.push({ c: c, label: chunks[c[0]].slice(0, 48).replace(/\s+\S*$/, '') + '…' });
    }
    return out;
  }
  /* ---------- índice y búsqueda ---------- */
  function stem(w) { return w.length > 6 ? w.slice(0, 6) : w; }
  function toks(s) { return norm(s).split(' ').filter(function (w) { return w.length >= 3; }).map(stem); }
  function makeIndex(chunks) {
    var post = Object.create(null);
    chunks.forEach(function (c, i) { var seen = Object.create(null); toks(c).forEach(function (t) { seen[t] = (seen[t] || 0) + 1; }); Object.keys(seen).forEach(function (t) { (post[t] || (post[t] = [])).push(i, seen[t]); }); });
    return { post: post, n: chunks.length, chunks: chunks, folded: Object.create(null) };
  }
  var CUE = /(\bes\b|\bson\b|\bse define\b|\bse denomina\b|\bse llama\b|\bllamad|\bconsiste\b|\bsignifica\b|\brefers? to\b|\bis\b|\bare\b|\bmeans\b|\bcalled\b|\bbedeutet\b|\bist\b|\bsind\b|\best\b|\bsont\b|\bd[ée]signe\b|:)/;
  function find(idx, term, exclude, k) {
    var q = Array.from(new Set(toks(term))); if (!q.length) return [];
    var lists = q.map(function (t) { return idx.post[t]; }); if (lists.some(function (l) { return !l; })) return [];
    var idf = q.map(function (t, j) { return Math.log(1 + idx.n / (lists[j].length / 2)); }), score = Object.create(null), cnt = Object.create(null);
    lists.forEach(function (l, j) { for (var x = 0; x < l.length; x += 2) { var i = l[x]; score[i] = (score[i] || 0) + l[x + 1] * idf[j]; cnt[i] = (cnt[i] || 0) + 1; } });
    var nt = norm(term), ex = exclude || [], res = [];
    Object.keys(score).forEach(function (key) {
      var i = +key; if (cnt[i] < q.length || ex.indexOf(i) >= 0) return;
      var f = idx.folded[i] || (idx.folded[i] = norm(idx.chunks[i])), at = f.indexOf(nt), sc = score[i];
      if (at >= 0) { sc += 3; if (CUE.test(f.slice(Math.max(0, at - 90), at + nt.length + 90))) sc += 2.5; if (at < 140) sc += 0.8; } else if (q.length > 1) sc -= 1;
      sc *= 0.6 + quality(idx.chunks[i]); res.push({ i: i, s: sc });
    });
    res.sort(function (a, b) { return b.s - a.s; });
    return res.slice(0, k || 3).map(function (r) { return { i: r.i, text: idx.chunks[r.i] }; });
  }
  /* ---------- guardado local (IndexedDB) de los fragmentos para poder retomar el tema ---------- */
  var mem = {};
  function db() { return new Promise(function (ok, no) { try { var r = indexedDB.open('prf_src', 1); r.onupgradeneeded = function () { r.result.createObjectStore('src', { keyPath: 'id' }); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; } catch (e) { no(e); } }); }
  function save(id, chunks) { mem[id] = chunks; return db().then(function (d) { return new Promise(function (ok) { var t = d.transaction('src', 'readwrite'); t.objectStore('src').put({ id: id, chunks: chunks, at: Date.now() }); t.oncomplete = function () { ok(true); }; t.onerror = function () { ok(false); }; }); }).catch(function () { return false; }); }
  function load(id) { if (mem[id]) return Promise.resolve(mem[id]); return db().then(function (d) { return new Promise(function (ok) { var q = d.transaction('src').objectStore('src').get(id); q.onsuccess = function () { var v = q.result && q.result.chunks; if (v) mem[id] = v; ok(v || null); }; q.onerror = function () { ok(null); }; }); }).catch(function () { return null; }); }
  function del(id) { delete mem[id]; return db().then(function (d) { d.transaction('src', 'readwrite').objectStore('src').delete(id); }).catch(function () {}); }

  window.PRF_SRC = { readFile: readFile, readBase64Pdf: readBase64Pdf, chunk: chunk, title: title, plan: plan, makeIndex: makeIndex, find: find, save: save, load: load, del: del, quality: quality, _pageLines: pageLines };
})();
