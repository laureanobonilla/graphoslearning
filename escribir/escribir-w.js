/* Escribir · modo asistente con proyectos guardados. Servidor: acción esc_analyze (gemini.js).
   Un párrafo por llamada, tras una pausa. Sugerencias ancladas por cita literal.
   Proyectos: localStorage 'esc_projects' (por navegador). */
(function () {
  'use strict';
  const E = window.ESC; if (!E) return;
  const $ = (s) => document.querySelector(s);
  const KEY = 'esc_projects';
  const CATS = { ortografia: 'Ortografía', precision: 'Precisión', sintesis: 'Dilo más corto', repeticion: 'Repeticiones', observacion: 'Observaciones', comprobar: 'A comprobar', lecturas: 'Autores y textos', idea: 'Ideas novedosas en tu texto', lugarcomun: 'Lugares comunes', critica: 'Crítica literaria' };
  const ORDER = ['idea', 'critica', 'lugarcomun', 'ortografia', 'precision', 'sintesis', 'repeticion', 'observacion', 'comprobar', 'lecturas'];
  const GN = { cientifico: 'Científico', ensayo: 'Ensayo', periodistico: 'Periodístico', discurso: 'Discurso', resena: 'Reseña', carta: 'Carta', cuento: 'Cuento', novela: 'Novela', poesia: 'Poesía', guion: 'Guion', memorias: 'Memorias' };
  const CREATIVE = ['cuento', 'novela', 'poesia', 'guion', 'memorias'];
  const HINT = { orto: 'Solo corrige ortografía, tildes y puntuación.', estilo: 'Además, señala palabras vagas, frases largas y repeticiones.', ideas: 'Además: detecta ideas nuevas tuyas, datos a comprobar y autores o textos relacionados.' };
  let genre = 'ensayo', level = 'estilo';
  let P = null, items = [], disc = [], done = {}, uid = 0, timer = 0, saveT = 0, busy = false, showDisc = false;
  const doc = $('#doc');

  /* ---- almacenamiento ---- */
  const load = () => { const a = E.ls(KEY, []); return Array.isArray(a) ? a : []; };
  function store(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { E.toast('No hay espacio para guardar. Copia tu texto.'); return false; } }
  function save() {
    if (!P) return;
    P.text = doc.value; P.title = $('#wTitle').value.trim(); P.genre = genre; P.level = level;
    P.items = items; P.disc = disc; P.done = done; P.updated = Date.now();
    const list = load().filter((x) => x.id !== P.id); list.unshift(P);
    if (store(list.slice(0, 40))) { $('#wSaved').textContent = 'Guardado'; }
  }
  function saveSoon() { clearTimeout(saveT); $('#wSaved').textContent = ''; saveT = setTimeout(save, 700); }

  /* ---- lista de escritos ---- */
  function fmt(t) { try { return new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' }); } catch { return ''; } }
  function renderProj() {
    const list = load(), host = $('#projList'); host.innerHTML = '';
    list.forEach((p) => {
      const d = document.createElement('div'); d.className = 'pj'; d.tabIndex = 0;
      const words = (p.text || '').trim().split(/\s+/).filter(Boolean).length, n = (p.items || []).length;
      d.innerHTML = '<div style="flex:1"><b>' + E.esc(p.title || 'Sin título') + '</b><small>' + GN[p.genre] + ' · ' + words + ' palabras · ' + n + ' sugerencia' + (n === 1 ? '' : 's') + ' · ' + fmt(p.updated) + '</small></div><button class="x" type="button" aria-label="Borrar">×</button>';
      d.addEventListener('click', (e) => { if (e.target.closest('.x')) { if (confirm('¿Borrar este escrito?')) { store(load().filter((x) => x.id !== p.id)); renderProj(); } return; } open(p); });
      d.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(p); });
      host.appendChild(d);
    });
    E.show('Proj');
  }
  $('#modeWrite').addEventListener('click', () => { if (load().length) renderProj(); else { E.show('Genre'); gHint(); } });
  $('#btnNew').addEventListener('click', () => { E.show('Genre'); gHint(); });

  /* ---- género / nivel ---- */
  function sel(seg, attr, val) { document.querySelectorAll(seg + ' button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === val)); }
  function gHint() { $('#genreHint').textContent = HINT[level] + (CREATIVE.includes(genre) ? ' En géneros creativos nunca se reescribe tu texto: solo ortografía clara, lugares comunes y crítica literaria en forma de pregunta.' : ''); }
  $('#genreSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-g]'); if (!b) return; genre = b.dataset.g; sel('#genreSeg', 'g', genre); gHint(); });
  $('#levelSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-l]'); if (!b) return; level = b.dataset.l; sel('#levelSeg', 'l', level); gHint(); });
  $('#btnWrite').addEventListener('click', () => {
    open({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: '', genre, level, text: '', items: [], disc: [], done: {}, updated: Date.now() }, true);
    E.track('esc_write_start', { genre, level });
  });

  function open(p, fresh) {
    P = p; genre = p.genre; level = p.level;
    items = (p.items || []).map((x) => Object.assign({}, x, { id: ++uid }));
    disc = (p.disc || []).map((x) => Object.assign({}, x, { id: ++uid }));
    done = p.done || {}; showDisc = false;
    doc.value = p.text || ''; $('#wTitle').value = p.title || '';
    $('#wInfo').textContent = GN[genre]; $('#wLevel').value = level; $('#wSaved').textContent = '';
    E.show('Write'); render(); if (fresh) save(); doc.focus();
    if (!fresh) { prune(); schedule(800); E.track('esc_open', { n: items.length }); }
  }
  // Para que escribir.js pueda volver a abrir el escrito tras una recarga (por ejemplo, al iniciar sesión).
  window.ESC_W = {
    cur: () => (P && !$('#vWrite').hidden ? P.id : null),
    openId: (id) => { const p = load().find((x) => x.id === id); if (!p) return false; open(p); return true; },
    retry: () => { if (P) analyze(true); }
  };
  window.addEventListener('pagehide', () => { if (P) { clearTimeout(saveT); save(); } });
  $('#btnWBack').addEventListener('click', () => { clearTimeout(timer); clearTimeout(saveT); save(); P = null; if (load().length) renderProj(); else E.renderHome(); });
  $('#wTitle').addEventListener('input', saveSoon);
  $('#wLevel').addEventListener('change', () => { level = $('#wLevel').value; done = {}; items = []; render(); schedule(300); saveSoon(); E.track('esc_level', { level }); });
  $('#btnCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(doc.value); E.toast('Texto copiado'); } catch { doc.select(); E.toast('Selecciona y copia con Ctrl+C'); } });
  $('#btnMapW').addEventListener('click', () => {
    const t = doc.value.trim();
    if (t.length < 200) { E.toast('Escribe al menos un párrafo para armar el mapa.'); return; }
    const sid = crypto.randomUUID();
    try { localStorage.setItem('gk_ap_pending', JSON.stringify({ sid, title: ($('#wTitle').value || '').trim().slice(0, 80), text: t.slice(0, 12000) })); } catch { E.toast('No se pudo preparar el mapa.'); return; }
    E.track('esc_to_map', { len: t.length });
    window.open('/?aprende=' + sid, '_blank', 'noopener');
  });
  $('#btnCheck').addEventListener('click', () => { clearTimeout(timer); analyze(true); });
  $('#btnDisc').addEventListener('click', () => { showDisc = !showDisc; render(); });

  /* ---- párrafos ---- */
  function paragraphs() {
    const lines = doc.value.split('\n'), out = []; let pos = 0, cur = null;
    lines.forEach((t) => {
      if (genre === 'poesia') {   // una estrofa = líneas seguidas sin línea en blanco
        if (t.trim()) { if (cur) { cur.text += '\n' + t; } else { cur = { text: t, start: pos }; out.push(cur); } } else cur = null;
      } else out.push({ text: t, start: pos });
      pos += t.length + 1;
    });
    return out.length ? out : [{ text: '', start: 0 }];
  }
  function current() { const c = doc.selectionStart, ps = paragraphs(); for (let i = ps.length - 1; i >= 0; i--) if (c >= ps[i].start) return { i, ps }; return { i: 0, ps }; }
  const key = (t) => genre + '|' + level + '|' + t.trim();
  const wcount = (t) => t.trim().split(/\s+/).filter(Boolean).length;
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => analyze(false), ms == null ? 2800 : ms); }
  doc.addEventListener('input', () => { prune(); schedule(); saveSoon(); });

  async function analyze(manual) {
    if (busy) { schedule(1500); return; }
    const { i, ps } = current();
    const order = [i].concat(ps.map((_, k) => k).filter((k) => k !== i));
    const idx = manual ? i : order.find((k) => wcount(ps[k].text) >= 6 && done[ps[k].text.trim()] !== key(ps[k].text));
    if (idx == null) { if (manual) E.toast('Nada nuevo que revisar'); return; }
    const para = ps[idx].text.trim();
    if (wcount(para) < 4) { if (manual) E.toast('Escribe un poco más en ese párrafo'); return; }
    busy = true; $('#wMsg').className = 'msg'; $('#wMsg').textContent = 'Revisando…';
    const before = ps.slice(Math.max(0, idx - 4), idx).map((p) => p.text).join('\n');
    const r = await E.callRetry({ action: 'esc_analyze', text: para, documentContext: before, purpose: genre, level });
    busy = false;
    if (!P) return;
    if (!r.ok) { $('#wMsg').className = 'msg err'; $('#wMsg').textContent = E.failText(r.kind); E.afterFail(r.kind, 'analyze'); return; }
    $('#wMsg').textContent = '';
    done[para] = key(para);
    items = items.filter((it) => it.para !== para);
    (r.data.items || []).forEach((it) => { if (disc.some((d) => d.cat === it.cat && d.quote === it.quote)) return; items.push(Object.assign({ id: ++uid, para }, it)); });
    prune(); render(); saveSoon();
    E.track('esc_analyzed', { genre, level, n: (r.data.items || []).length, manual: !!manual });
    if (!manual) schedule(600);
  }

  function prune() { const t = doc.value, n = items.length; items = items.filter((it) => find(it)); if (items.length !== n) render(); }
  const find = (it) => {
    let s = doc.value.indexOf(it.quote); if (s >= 0) return [s, s + it.quote.length];
    const w = it.quote.trim().split(/\s+/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); if (!w.length) return null;
    const m = new RegExp(w.join('\\s+')).exec(doc.value); return m ? [m.index, m.index + m[0].length] : null;
  };
  function show(it) { const p = find(it); if (!p) return; doc.focus(); doc.setSelectionRange(p[0], p[1]); const lh = parseFloat(getComputedStyle(doc).lineHeight) || 30; const line = doc.value.slice(0, p[0]).split('\n').length; doc.scrollTop = Math.max(0, line * lh * 0.9 - doc.clientHeight / 2); }
  function adopt(it) {
    const p = find(it); if (!p) { prune(); return; }
    doc.focus(); doc.setRangeText(it.replacement, p[0], p[1], 'end');
    items = items.filter((x) => x.id !== it.id); delete done[it.para]; prune(); render(); saveSoon(); E.track('esc_adopt', { cat: it.cat }); schedule(3500);
  }
  function discard(it) { items = items.filter((x) => x.id !== it.id); disc.push(it); render(); saveSoon(); E.track('esc_dismiss', { cat: it.cat }); }
  function restore(it) { disc = disc.filter((x) => x.id !== it.id); if (find(it)) items.push(it); render(); saveSoon(); E.track('esc_restore', { cat: it.cat }); }

  /* ---- matriz de cajas: solo las que tienen sugerencias ---- */
  function card(it, discarded) {
    const d = document.createElement('div'), sub = it.replacement; d.className = 'it';
    d.innerHTML = '<span class="q" title="Ver en el texto">' + (sub ? '<s>' + E.esc(it.quote) + '</s> → <b>' + E.esc(it.replacement) + '</b>' : '«' + E.esc(it.quote) + '»') + '</span><em>' + E.esc(it.note) + '</em><div class="btns">' + (discarded ? '<button data-a="re">Recuperar</button>' : (sub ? '<button class="ok" data-a="ok">Adoptar</button>' : '') + '<button data-a="no">' + (sub ? 'Descartar' : 'Entendido') + '</button>') + '</div>';
    d.querySelector('.q').addEventListener('click', () => show(it));
    d.querySelector('.btns').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'ok') adopt(it); else if (b.dataset.a === 're') restore(it); else discard(it); });
    return d;
  }
  function render() {
    const host = $('#boxes'); host.innerHTML = '';
    const groups = ORDER.map((c) => [c, items.filter((x) => x.cat === c)]).filter((g) => g[1].length);
    groups.forEach(([c, list]) => {
      const box = document.createElement('section'); box.className = 'box';
      box.innerHTML = '<h3>' + CATS[c] + '<i>' + list.length + '</i></h3><div class="items"></div>';
      list.forEach((it) => box.querySelector('.items').appendChild(card(it, false)));
      host.appendChild(box);
    });
    let n = groups.length;
    if (showDisc && disc.length) {
      const box = document.createElement('section'); box.className = 'box disc';
      box.innerHTML = '<h3>Descartadas<i>' + disc.length + '</i></h3><div class="items"></div>';
      disc.forEach((it) => box.querySelector('.items').appendChild(card(it, true)));
      host.appendChild(box); n++;
    }
    host.style.setProperty('--rows', Math.max(1, Math.ceil(n / 2)));
    $('#btnDisc').hidden = !disc.length; $('#discN').textContent = disc.length;
  }
})();
