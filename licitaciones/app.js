(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const post = async (fn, body) => {
    const r = await fetch('/.netlify/functions/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Error'); e.status = r.status; e.j = j; throw e; }
    return j;
  };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const stage = $('stage'), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let CFG = null, cfgP = fetch('/.netlify/functions/lic-config').then((r) => r.json()).then((c) => { CFG = c; if (c.maxMb) $('maxMb').textContent = c.maxMb; return c; }).catch(() => null);
  let job = null, ppLoad = null, runToken = 0;

  const panel = (...kids) => { const p = el('section', 'panel'); kids.forEach((k) => k && p.appendChild(k)); stage.replaceChildren(p); p.scrollIntoView({ behavior: 'smooth', block: 'start' }); return p; };
  const status = (msg) => { const s = el('div', 'status'); s.appendChild(el('div', 'spin')); s.appendChild(el('span', null, msg)); return panel(s); };
  const fail = (msg) => { const p = panel(el('h2', null, 'Algo salió mal'), el('p', 'err', msg)); const b = el('button', 'btn g', 'Intentar con otro PDF'); b.onclick = () => { stage.replaceChildren(); $('subir').scrollIntoView({ behavior: 'smooth' }); }; p.appendChild(b); };

  // ---------- Subida ----------
  const drop = $('subir'), file = $('file');
  drop.addEventListener('click', (e) => { if (e.target.closest('.mail')) return; file.click(); });
  drop.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.mail')) { e.preventDefault(); file.click(); } });
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) start(f); });
  file.addEventListener('change', () => { if (file.files[0]) start(file.files[0]); file.value = ''; });

  async function start(f) {
    const cfg = await cfgP, max = ((cfg && cfg.maxMb) || 12) * 1048576;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return fail('El archivo debe ser un PDF.');
    if (f.size > max) return fail('El PDF pesa más de ' + Math.floor(max / 1048576) + ' MB. Comprímelo o sube solo las secciones principales del cartel.');
    try {
      status('Subiendo el cartel…');
      const init = await post('lic-init', { filename: f.name, size: f.size, email: $('email').value.trim() });
      const up = await fetch(init.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: f });
      if (!up.ok) throw new Error('No se pudo subir el archivo. Inténtalo de nuevo.');
      ls.set('lic_last', init.id); history.replaceState(null, '', '?id=' + init.id);
      status('Leyendo el cartel… puede tardar hasta un minuto en documentos largos.');
      let pv; for (let i = 0; i < 2; i++) { try { pv = await post('lic-preview', { id: init.id }); break; } catch (e) { if (i === 1 || !(e.j && e.j.reintentar)) throw e; } }
      job = { id: init.id, filename: f.name, status: pv.status, preview: pv.preview, parts: {} };
      render();
    } catch (e) { fail(e.message || 'No se pudo analizar el cartel.'); }
  }

  async function load(id) {
    status('Cargando tu análisis…');
    try { const j = await post('lic-get', { id }); job = j; ls.set('lic_last', id); if (!j.preview) { const pv = await post('lic-preview', { id }); job.preview = pv.preview; job.status = pv.status; } render(); }
    catch (e) { fail(e.status === 404 ? 'No encontré ese análisis. Puede que el enlace esté incompleto.' : (e.message || 'No se pudo cargar.')); }
  }

  // ---------- Vistas ----------
  function ficha(p, demo) {
    const d = el('div', 'ficha');
    [['Entidad', p.entidad], ['Qué se contrata', p.objeto], ['Procedimiento', (p.modalidad || '') + (p.numero ? ' · ' + p.numero : '')], ['Presupuesto', p.presupuesto], ['Límite para ofertar', p.fechaLimite]].forEach(([k, v]) => { const c = el('div'); c.appendChild(el('b', null, k)); c.appendChild(el('span', null, v || 'No consta')); d.appendChild(c); });
    return d;
  }
  function render() {
    if (!job.preview || !job.preview.valido) return fail('Ese PDF no parece ser un cartel de contratación pública. Prueba con el pliego de condiciones completo.');
    if (job.status === 'pagado') return renderResults(job, false);
    renderPreview();
  }

  function renderPreview() {
    const p = job.preview, h = el('h2', null, 'Esto es lo que encontré en tu cartel');
    const sub = el('p', null, job.filename); sub.style.color = 'var(--muted)';
    const sample = el('div', 'sample'); (p.muestra || []).forEach((m) => { const r = el('div', 'req'); const t = el('div', 't'); t.appendChild(el('span', null, m.texto)); t.appendChild(el('small', null, m.ref ? 'Aparece en: ' + m.ref : '')); r.appendChild(t); sample.appendChild(r); });
    const fakes = el('div', 'blur'); for (let i = 0; i < 4; i++) { const r = el('div', 'req'); const t = el('div', 't'); t.appendChild(el('span', null, 'Requisito bloqueado '.repeat(3))); r.appendChild(t); fakes.appendChild(r); }
    const lock = el('div', 'locked'); lock.appendChild(fakes);
    const gate = el('div', 'gate'), box = el('div', 'gatebox'); box.appendChild(el('h3', null, 'Desbloquea el análisis completo'));
    box.appendChild(el('p', null, 'Con esto sabrás exactamente qué presentar y qué cláusulas te pueden dejar fuera.'));
    const counts = el('div', 'counts'); [[p.totalRequisitos, 'requisitos'], [p.totalDocumentos, 'documentos'], [p.totalAlertas, 'alertas']].forEach(([n, l]) => { const c = el('div'); c.appendChild(el('b', null, '~' + n)); c.appendChild(document.createTextNode(l)); counts.appendChild(c); });
    box.appendChild(counts); const price = el('div', 'price'); box.appendChild(price);
    const pay = el('button', 'btn', 'Desbloquear y pagar'); box.appendChild(pay);
    const pp = el('div'); pp.id = 'ppBox'; box.appendChild(pp); const perr = el('p', 'err'); perr.hidden = true; box.appendChild(perr);
    const fine = el('p', 'fine', 'Pago único por este cartel. Quedará guardado en un enlace privado. Las cifras de arriba son una estimación de la lectura rápida; el análisis completo las confirma.'); box.appendChild(fine);
    gate.appendChild(box); lock.appendChild(gate);
    panel(h, sub, ficha(p), el('h3', null, 'Tres requisitos, para que veas el nivel de detalle'), sample, lock);
    cfgP.then((c) => { const ch = c && c.charge; if (!ch) return; const t = `${ch.text}`; price.textContent = t; const s = el('small', null, ` ${ch.name} (${ch.currency})` + (ch.approx ? ` · aprox. ${ch.approx} ${ch.approxName}` : '')); price.appendChild(s); });
    pay.onclick = async () => {
      pay.hidden = true; pp.textContent = 'Cargando el pago seguro…'; perr.hidden = true;
      const c = await cfgP; if (!c || !c.paypalClientId || !c.charge) { pp.textContent = ''; perr.textContent = 'El pago no está disponible ahora. Inténtalo en un rato.'; perr.hidden = false; pay.hidden = false; return; }
      try { await loadPayPal(c.paypalClientId, c.charge.currency); } catch (e) { pp.textContent = ''; perr.textContent = 'No se pudo cargar PayPal. Revisa tu conexión.'; perr.hidden = false; pay.hidden = false; return; }
      pp.textContent = '';
      window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'pill', label: 'pay', tagline: false },
        createOrder: async () => { perr.hidden = true; const d = await post('lic-pay-create', { id: job.id }); if (d.already) throw new Error('already'); return d.orderID; },
        onApprove: async (data) => {
          pp.textContent = 'Confirmando tu pago…';
          try { await post('lic-pay-capture', { id: job.id, orderID: data.orderID }); job.status = 'pagado'; renderResults(job, false); }
          catch (e) { pp.textContent = ''; perr.textContent = (e.message || 'No pudimos confirmar tu pago.') + ' Si te cobraron, recarga esta página en un momento o escríbeme: tu análisis se desbloquea.'; perr.hidden = false; }
        },
        onError: () => { perr.textContent = 'No se pudo completar el pago. No se te cobró. Inténtalo de nuevo.'; perr.hidden = false; }
      }).render(pp);
    };
  }
  function loadPayPal(clientId, currency) {
    if (window.paypal) return Promise.resolve(); if (ppLoad) return ppLoad;
    ppLoad = new Promise((ok, no) => { const s = document.createElement('script'); s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&components=buttons&intent=capture`; s.onload = ok; s.onerror = () => { ppLoad = null; no(new Error('load')); }; document.head.appendChild(s); });
    return ppLoad;
  }

  // ---------- Resultados (análisis completo o ejemplo) ----------
  const TABS = [['requisitos', 'Requisitos'], ['documentos', 'Documentos y fechas'], ['alertas', 'Alertas'], ['borradores', 'Borradores']];
  function renderResults(j, demo) {
    const myRun = ++runToken, p = j.preview, tabs = el('div', 'tabs'); tabs.setAttribute('role', 'tablist');
    const panels = {}, tabBtns = {};
    const root = el('section', 'panel');
    if (demo) root.appendChild(el('div', 'banner', 'Ejemplo con un cartel ficticio. Así se ve el análisis completo.'));
    root.appendChild(el('h2', null, demo ? 'Análisis de ejemplo' : 'Tu análisis completo')); const sub = el('p', null, j.filename); sub.style.color = 'var(--muted)'; root.appendChild(sub);
    root.appendChild(ficha(p)); root.appendChild(tabs);
    TABS.forEach(([k, label], i) => {
      const b = el('button', null, label); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === 0 ? 'true' : 'false'); b.onclick = () => select(k); tabs.appendChild(b); tabBtns[k] = b;
      const pn = el('div'); pn.setAttribute('role', 'tabpanel'); pn.hidden = i !== 0; panels[k] = pn; root.appendChild(pn);
      pn.appendChild(el('div', 'status')).appendChild(el('div', 'spin'));
    });
    function select(k) { TABS.forEach(([t]) => { panels[t].hidden = t !== k; tabBtns[t].setAttribute('aria-selected', t === k ? 'true' : 'false'); }); }
    const bar = el('div', 'row'); const pr = el('button', 'btn g', 'Imprimir o guardar en PDF'); pr.onclick = () => window.print(); bar.appendChild(pr); root.appendChild(bar);
    stage.replaceChildren(root); root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const put = (k, data) => { if (myRun !== runToken) return; panels[k].replaceChildren(); VIEWS[k](panels[k], data, j, tabBtns[k], label(k)); };
    const label = (k) => TABS.find((t) => t[0] === k)[1];
    TABS.forEach(([k]) => {
      if (j.parts && j.parts[k]) return put(k, j.parts[k]);
      loadPart(k, myRun).then((d) => put(k, d)).catch(() => { if (myRun !== runToken) return; panels[k].replaceChildren(); const e = el('p', 'err', 'No se pudo generar esta parte.'); const rb = el('button', 'btn g', 'Reintentar'); rb.onclick = () => { panels[k].replaceChildren(el('div', 'status')).firstChild.appendChild(el('div', 'spin')); loadPart(k, myRun).then((d) => put(k, d)).catch(() => { panels[k].replaceChildren(e, rb); }); }; panels[k].appendChild(e); panels[k].appendChild(rb); });
    });
  }
  async function loadPart(k, myRun) {
    for (let i = 0; i < 4; i++) { if (myRun !== runToken) throw new Error('cancelado'); try { return (await post('lic-run', { id: job.id, part: k })).data; } catch (e) { if (e.status === 402) throw e; await sleep(1500 * (i + 1)); } }
    throw new Error('falló');
  }
  const count = (btn, n, base) => { btn.textContent = base; if (n != null) btn.appendChild(el('span', 'n', String(n))); };

  const VIEWS = {
    requisitos(pn, d, j, btn, label) {
      const list = d.requisitos || [], key = 'lic_chk_' + (j.id || 'demo'); let chk = {}; try { chk = JSON.parse(ls.get(key) || '{}'); } catch (e) {}
      count(btn, list.length, label);
      const cats = ['Todos'].concat([...new Set(list.map((r) => r.categoria))]); let cur = 'Todos';
      const prog = el('div', 'progress'), bar = el('i'); prog.appendChild(bar); const cnt = el('p', null); cnt.style.cssText = 'font-weight:700;font-size:.92rem';
      const chips = el('div', 'chips'), box = el('div', 'sample');
      const upd = () => { const done = list.filter((_, i) => chk[i]).length; bar.style.width = (list.length ? Math.round(done / list.length * 100) : 0) + '%'; cnt.textContent = `Vas ${done} de ${list.length} listos`; };
      const draw = () => { box.replaceChildren(); list.forEach((r, i) => { if (cur !== 'Todos' && r.categoria !== cur) return; const row = el('label', 'req' + (chk[i] ? ' done' : '')); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!chk[i]; cb.onchange = () => { chk[i] = cb.checked; ls.set(key, JSON.stringify(chk)); row.classList.toggle('done', cb.checked); upd(); }; const t = el('div', 't'); t.appendChild(el('span', null, r.texto)); t.appendChild(el('small', null, `Cómo demostrarlo: ${r.evidencia} · ${r.ref}`)); row.appendChild(cb); row.appendChild(t); row.appendChild(el('span', 'tag' + (r.obligatorio ? ' must' : ''), r.obligatorio ? 'Obligatorio' : 'Suma puntos')); row.appendChild(el('span', 'tag', r.categoria)); box.appendChild(row); }); };
      cats.forEach((c) => { const b = el('button', null, c); b.setAttribute('aria-pressed', c === cur ? 'true' : 'false'); b.onclick = () => { cur = c; [...chips.children].forEach((x) => x.setAttribute('aria-pressed', x.textContent === c ? 'true' : 'false')); draw(); }; chips.appendChild(b); });
      pn.appendChild(cnt); pn.appendChild(prog); pn.appendChild(chips); pn.appendChild(box); upd(); draw();
    },
    documentos(pn, d, j, btn, label) {
      count(btn, (d.documentos || []).length, label);
      pn.appendChild(el('h3', null, 'Documentos que debes presentar')); (d.documentos || []).forEach((x) => { const c = el('div', 'doc'); c.appendChild(el('b', null, x.nombre)); c.appendChild(el('span', null, x.detalle)); c.appendChild(el('small', null, `Lo emite: ${x.quien} · ${x.ref}`)); c.querySelector('small').style.display = 'block'; pn.appendChild(c); });
      const h = el('h3', null, 'Fechas clave'); h.style.marginTop = '18px'; pn.appendChild(h); (d.fechas || []).forEach((x) => { const c = el('div', 'doc'); c.appendChild(el('b', null, x.evento)); c.appendChild(el('span', null, x.fecha)); pn.appendChild(c); });
    },
    alertas(pn, d, j, btn, label) {
      count(btn, (d.alertas || []).length, label);
      (d.alertas || []).forEach((a) => { const c = el('div', 'al ' + a.nivel); const h = el('h4', null, `${a.nivel}: ${a.titulo}`); c.appendChild(h); c.appendChild(el('p', null, a.explicacion)); c.appendChild(el('p', 'w', 'Qué hacer: ' + a.que_hacer + (a.ref ? ' · ' + a.ref : ''))); pn.appendChild(c); });
      if ((d.preguntas || []).length) { const h = el('h3', null, 'Preguntas para enviar a la entidad'); h.style.margin = '18px 0 8px'; pn.appendChild(h); d.preguntas.forEach((q) => pn.appendChild(draft('Pregunta de aclaración', q))); }
    },
    borradores(pn, d, j, btn, label) {
      count(btn, null, label);
      const note = el('p', 'fine', 'Son borradores de apoyo con tus datos en [corchetes]. Revísalos y ajústalos antes de usarlos.'); pn.appendChild(note);
      if (d.resumen) pn.appendChild(draft('Resumen para orientar tu oferta', d.resumen));
      pn.appendChild(draft('Carta de presentación', d.carta)); (d.declaraciones || []).forEach((x) => pn.appendChild(draft(x.titulo, x.texto)));
    }
  };
  function draft(title, text) {
    const c = el('div', 'draft'), h = el('header'); h.appendChild(el('b', null, title)); const b = el('button', 'btn g', 'Copiar'); b.style.padding = '5px 14px';
    b.onclick = async () => { try { await navigator.clipboard.writeText(text); b.textContent = 'Copiado'; } catch (e) { b.textContent = 'Selecciona y copia'; } setTimeout(() => { b.textContent = 'Copiar'; }, 1800); };
    h.appendChild(b); c.appendChild(h); c.appendChild(el('pre', null, text)); return c;
  }

  // ---------- Ejemplo ----------
  function showDemo() { const s = document.createElement('script'); const go = () => { const D = window.LIC_DEMO; job = { id: null, filename: D.filename, preview: D.preview, parts: D.parts, status: 'pagado' }; runToken++; const myRun = runToken; renderResults(job, true); }; if (window.LIC_DEMO) return go(); s.src = 'demo.js?v=1'; s.onload = go; document.head.appendChild(s); }
  ['navEj', 'ejLink'].forEach((id) => $(id).addEventListener('click', (e) => { e.preventDefault(); showDemo(); }));

  // ---------- Arranque ----------
  const qid = new URLSearchParams(location.search).get('id');
  if (qid && /^[0-9a-f-]{36}$/i.test(qid)) load(qid);
})();
