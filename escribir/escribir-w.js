/* Escribir · modo asistente. Servidor: acción esc_analyze (netlify/functions/gemini.js).
   Una sola llamada por párrafo cambiado, tras una pausa. Las sugerencias se anclan por cita literal. */
(function () {
  'use strict';
  const E = window.ESC; if (!E) return;
  const $ = (s) => document.querySelector(s);
  const DRAFT = 'esc_draft';
  const CATS = { ortografia: 'Ortografía', precision: 'Precisión', sintesis: 'Dilo más corto', repeticion: 'Repeticiones', observacion: 'Observaciones', comprobar: 'A comprobar' };
  const ORDER = ['ortografia', 'precision', 'sintesis', 'repeticion', 'observacion', 'comprobar'];
  const GN = { cientifico: 'Científico', ensayo: 'Ensayo', periodistico: 'Periodístico', cuento: 'Cuento', novela: 'Novela' };
  const HINT = { orto: 'Solo corrige ortografía, tildes y puntuación.', estilo: 'Además, señala palabras vagas, frases largas y repeticiones.', ideas: 'Además, observaciones sobre tus propias ideas y datos a comprobar.' };
  let genre = 'ensayo', level = 'estilo', items = [], uid = 0, timer = 0, busy = false;
  const done = {};          // párrafo -> clave (género|nivel|texto) ya analizada
  const dismissed = new Set();
  const doc = $('#doc');

  function sel(seg, attr, val) { document.querySelectorAll(seg + ' button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === val)); }
  const gHint = () => { $('#genreHint').textContent = HINT[level] + ((genre === 'cuento' || genre === 'novela') ? ' En ficción nunca se reescribe tu prosa: solo ortografía y preguntas.' : ''); };
  $('#genreSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-g]'); if (!b) return; genre = b.dataset.g; sel('#genreSeg', 'g', genre); gHint(); });
  $('#levelSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-l]'); if (!b) return; level = b.dataset.l; sel('#levelSeg', 'l', level); gHint(); });
  $('#modeWrite').addEventListener('click', () => { E.show('Genre'); gHint(); });
  $('#btnWrite').addEventListener('click', () => {
    let saved = null; try { saved = JSON.parse(localStorage.getItem(DRAFT)); } catch { /* nada */ }
    doc.value = saved && saved.genre === genre ? String(saved.text || '') : '';
    items = []; Object.keys(done).forEach((k) => delete done[k]); render();
    $('#wInfo').textContent = GN[genre]; $('#wLevel').value = level;
    E.show('Write'); doc.focus(); E.track('esc_write_start', { genre, level });
  });
  $('#btnWBack').addEventListener('click', () => { clearTimeout(timer); E.renderHome(); });
  $('#wLevel').addEventListener('change', () => { level = $('#wLevel').value; Object.keys(done).forEach((k) => delete done[k]); items = []; render(); schedule(300); E.track('esc_level', { level }); });
  $('#btnCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(doc.value); E.toast('Texto copiado'); } catch { doc.select(); E.toast('Selecciona y copia con Ctrl+C'); } });
  $('#btnCheck').addEventListener('click', () => { clearTimeout(timer); analyze(true); });

  /* ---- párrafos ---- */
  function paragraphs() { const out = []; let pos = 0; doc.value.split('\n').forEach((t) => { out.push({ text: t, start: pos }); pos += t.length + 1; }); return out; }
  function current() { const c = doc.selectionStart, ps = paragraphs(); for (let i = ps.length - 1; i >= 0; i--) if (c >= ps[i].start) return { i, ps }; return { i: 0, ps }; }
  const key = (t) => genre + '|' + level + '|' + t.trim();

  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => analyze(false), ms == null ? 2800 : ms); }
  doc.addEventListener('input', () => {
    try { localStorage.setItem(DRAFT, JSON.stringify({ genre, text: doc.value })); } catch { /* nada */ }
    prune(); schedule();
  });

  /* Analiza el párrafo del cursor; si ya está analizado, el siguiente pendiente. */
  async function analyze(manual) {
    if (busy) { schedule(1500); return; }
    const { i, ps } = current();
    const order = [i].concat(ps.map((_, k) => k).filter((k) => k !== i));
    const idx = manual ? i : order.find((k) => ps[k].text.trim().split(/\s+/).filter(Boolean).length >= 6 && done[ps[k].text.trim()] !== key(ps[k].text));
    if (idx == null) { if (manual) E.toast('Nada nuevo que revisar'); return; }
    const para = ps[idx].text.trim();
    if (para.split(/\s+/).filter(Boolean).length < 4) { if (manual) E.toast('Escribe un poco más en ese párrafo'); return; }
    busy = true; $('#wMsg').className = 'msg'; $('#wMsg').textContent = 'Revisando…';
    const before = ps.slice(Math.max(0, idx - 4), idx).map((p) => p.text).join('\n');
    const r = await E.callRetry({ action: 'esc_analyze', text: para, documentContext: before, purpose: genre, level });
    busy = false;
    if (!r.ok) {
      $('#wMsg').className = 'msg err'; $('#wMsg').textContent = E.failText(r.kind); E.afterFail(r.kind); return;
    }
    $('#wMsg').textContent = '';
    done[para] = key(para);
    // reemplaza lo que había de ese párrafo
    items = items.filter((it) => it.para !== para);
    (r.data.items || []).forEach((it) => { if (dismissed.has(it.cat + '|' + it.quote)) return; items.push(Object.assign({ id: ++uid, para }, it)); });
    prune(); render();
    E.track('esc_analyzed', { genre, level, n: (r.data.items || []).length, manual: !!manual });
    if (!manual) schedule(600);   // siguiente párrafo pendiente, si hay
  }

  /* Quita sugerencias cuya cita ya no está en el texto. */
  function prune() { const t = doc.value; const n = items.length; items = items.filter((it) => t.includes(it.quote)); if (items.length !== n) render(); }

  function find(it) { const s = doc.value.indexOf(it.quote); return s < 0 ? null : [s, s + it.quote.length]; }
  function show(it) { const p = find(it); if (!p) return; doc.focus(); doc.setSelectionRange(p[0], p[1]); const lh = parseFloat(getComputedStyle(doc).lineHeight) || 30; const line = doc.value.slice(0, p[0]).split('\n').length; doc.scrollTop = Math.max(0, line * lh * 0.9 - doc.clientHeight / 2); }
  function adopt(it) {
    const p = find(it); if (!p) { prune(); return; }
    doc.focus(); doc.setRangeText(it.replacement, p[0], p[1], 'end');
    items = items.filter((x) => x.id !== it.id);
    try { localStorage.setItem(DRAFT, JSON.stringify({ genre, text: doc.value })); } catch { /* nada */ }
    delete done[it.para]; prune(); render(); E.track('esc_adopt', { cat: it.cat });
    schedule(3500);
  }
  function discard(it) { dismissed.add(it.cat + '|' + it.quote); items = items.filter((x) => x.id !== it.id); render(); E.track('esc_dismiss', { cat: it.cat }); }

  /* ---- cajas: solo existen las que tienen al menos una sugerencia ---- */
  function render() {
    const host = $('#boxes'); host.innerHTML = '';
    ORDER.forEach((c) => {
      const list = items.filter((x) => x.cat === c); if (!list.length) return;
      const box = document.createElement('section'); box.className = 'box';
      box.innerHTML = '<h3>' + CATS[c] + '<i>' + list.length + '</i></h3><div class="items"></div>';
      const body = box.querySelector('.items');
      list.forEach((it) => {
        const d = document.createElement('div'); d.className = 'it';
        const sub = it.replacement;
        d.innerHTML = '<span class="q" title="Ver en el texto">' + (sub ? '<s>' + E.esc(it.quote) + '</s> → <b>' + E.esc(it.replacement) + '</b>' : '«' + E.esc(it.quote) + '»') + '</span><em>' + E.esc(it.note) + '</em><div class="btns">' + (sub ? '<button class="ok" data-a="ok">Adoptar</button>' : '') + '<button data-a="no">' + (sub ? 'Descartar' : 'Entendido') + '</button></div>';
        d.querySelector('.q').addEventListener('click', () => show(it));
        d.querySelector('.btns').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'ok') adopt(it); else discard(it); });
        body.appendChild(d);
      });
      host.appendChild(box);
    });
  }
})();
