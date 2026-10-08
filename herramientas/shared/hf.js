// Motor común de las «herramientas»: introducción → preguntas (se guarda cada respuesta al avanzar) → resultado → contacto opcional.
// Cada app define window.HF_CFG (preguntas, resultado). Todo lo respondido se guarda con hf-save (tabla hf_responses) y se mide con sfc-track-event.
(function () {
'use strict';
const C = window.HF_CFG;
const TRACK = '/.netlify/functions/sfc-track-event', SAVE = '/.netlify/functions/hf-save', AIURL = '/.netlify/functions/hf-ai';
const $ = (id) => document.getElementById(id);
const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[x]/g, () => ((Math.random() * 16) | 0).toString(16)));
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

let anonId; try { anonId = localStorage.getItem('hf_anon'); if (!anonId) { anonId = uuid(); localStorage.setItem('hf_anon', anonId); } } catch { anonId = uuid(); }
const sid = uuid();
const clean = (v) => String(v || '').replace(/[^\w.\-]/g, '').slice(0, 40);
const UTM = (() => { try { const q = new URLSearchParams(location.search); const c = clean(q.get('utm_campaign') || q.get('c')), a = clean(q.get('utm_content') || q.get('ad'));
  if (c || a) { sessionStorage.setItem('hf_utm', JSON.stringify({ campaign: c, ad: a })); return { campaign: c, ad: a }; }
  const o = JSON.parse(sessionStorage.getItem('hf_utm') || 'null'); return o || { campaign: '', ad: '' }; } catch { return { campaign: '', ad: '' }; } })();

const A = {}; let idx = 0, maxStep = 0, firstSaved = false, screen = 'intro', startedAt = Date.now(), aiBody = null;
const stack = [];

function track(event, metadata) {
  try { fetch(TRACK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ event, anonId, app: C.app, metadata: Object.assign({}, metadata || {}, UTM.campaign ? { campaign: UTM.campaign } : {}, UTM.ad ? { ad: UTM.ad } : {}) }) }).catch(() => {}); } catch { /* medir nunca rompe nada */ }
}
function payload(extra) { return Object.assign({ sid, tool: C.tool, anonId, step: maxStep, total: C.steps.length, answers: A, utm: UTM, first: !firstSaved }, extra || {}); }
function save(extra) {
  const p = payload(extra); firstSaved = true;
  return fetch(SAVE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify(p) }).then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, status: r.status, data: d }))).catch(() => ({ ok: false, status: 0, data: {} }));
}

// ---------- Pantallas ----------
const root = $('app');
const screens = {};
['intro', 'q', 'loading', 'result'].forEach(n => { const s = h('section', 'screen'); s.id = 'screen-' + n; root.appendChild(s); screens[n] = s; });
function show(n) { screen = n; Object.keys(screens).forEach(k => screens[k].classList.toggle('is-on', k === n)); window.scrollTo(0, 0); }

function topbar() { const t = h('div', 'topbar'); const a = h('a', 'brand'); a.href = '../' + (location.search || ''); a.innerHTML = '<i>◆</i>'; a.appendChild(document.createTextNode(C.brand)); t.appendChild(a); return t; }

function buildIntro() {
  const s = screens.intro; s.textContent = ''; s.appendChild(topbar());
  const w = h('div', 'intro'); w.appendChild(h('h1', '', C.intro.h1)); w.appendChild(h('p', 'lead', C.intro.lead));
  if (C.intro.facts) { const ul = h('ul', 'facts'); C.intro.facts.forEach(f => ul.appendChild(h('li', '', f))); w.appendChild(ul); }
  const b = h('button', 'btn', C.intro.start || 'Empezar'); b.type = 'button'; b.addEventListener('click', () => { track('start_clicked', {}); stack.length = 0; goStep(0, false); });
  w.appendChild(b);
  const n = h('p', 'note'); n.innerHTML = C.note || '<b>Es una encuesta rápida.</b> Tus respuestas, sin tu nombre, nos ayudan a entender qué herramientas necesita la gente y a crear mejores. Al final puedes dejar tu contacto, pero no es obligatorio.';
  w.appendChild(n); s.appendChild(w);
}

// ---------- Preguntas ----------
function goStep(i, push = true) {
  if (push) stack.push(idx);
  idx = i; show('q'); renderStep();
  track('step_viewed', { step: C.steps[i].id, n: i + 1 });
}
function next() {
  maxStep = Math.max(maxStep, idx + 1); track('step_done', { step: C.steps[idx].id });
  save();
  if (idx + 1 >= C.steps.length) finish(); else goStep(idx + 1);
}
function renderStep() {
  const st = C.steps[idx], s = screens.q; s.textContent = '';
  const bar = h('div', 'qbar'); const back = h('button', 'back', '‹'); back.type = 'button'; back.setAttribute('aria-label', 'Volver');
  back.addEventListener('click', () => { track('back_clicked', { step: st.id }); if (stack.length) { idx = stack.pop(); renderStep(); } else { show('intro'); } });
  const tr = h('div', 'track'); const fill = h('i'); tr.appendChild(fill); bar.append(back, tr); s.appendChild(bar);
  requestAnimationFrame(() => { fill.style.width = Math.round(((idx + 1) / (C.steps.length + 1)) * 100) + '%'; });
  const q = h('div', 'q'); q.appendChild(h('h2', '', typeof st.title === 'function' ? st.title(A) : st.title));
  if (st.hint) q.appendChild(h('p', 'hint', st.hint));
  const foot = h('div', 'qfoot'); const nextBtn = h('button', 'btn', st.nextLabel || (idx + 1 >= C.steps.length ? (C.finishLabel || 'Ver mi resultado') : 'Seguir')); nextBtn.type = 'button'; nextBtn.disabled = true;
  nextBtn.addEventListener('click', () => { if (!nextBtn.disabled) next(); });
  const upd = () => { nextBtn.disabled = !(st.optional || valid(st)); };
  if (st.type === 'choice') renderChoice(q, st, upd, nextBtn);
  else if (st.type === 'text') renderText(q, st, upd);
  else if (st.type === 'tasks') renderTasks(q, st, upd);
  s.appendChild(q);
  if (!(st.type === 'choice' && st.auto !== false && !st.other)) foot.appendChild(nextBtn);
  if (st.optional) { const sk = h('button', 'quiet', 'Saltar esta pregunta'); sk.type = 'button'; sk.addEventListener('click', () => { track('step_skipped', { step: st.id }); next(); }); foot.appendChild(sk); }
  s.appendChild(foot); upd();
}
function valid(st) {
  if (st.type === 'choice') { const v = A[st.key]; return !!v && (v !== 'Otro' || String(A[st.key + '_otro'] || '').trim().length >= 2); }
  if (st.type === 'text') return String(A[st.key] || '').trim().length >= (st.min || 2);
  if (st.type === 'tasks') return Array.isArray(A.tareas) && A.tareas.some(t => t.t && t.t.trim().length >= 2);
  return true;
}
function renderChoice(q, st, upd, nextBtn) {
  const wrap = h('div', 'opts'); wrap.setAttribute('role', 'radiogroup'); const btns = [];
  const other = h('textarea', 'field'); other.rows = 2; other.maxLength = 200; other.placeholder = st.otherPlaceholder || 'Escríbelo aquí'; other.classList.add('is-hidden'); other.value = A[st.key + '_otro'] || '';
  const refresh = () => { btns.forEach(b => b.setAttribute('aria-checked', String(A[st.key] === b.dataset.v))); other.classList.toggle('is-hidden', A[st.key] !== 'Otro'); };
  (st.options.concat(st.other ? ['Otro'] : [])).forEach(o => {
    const b = h('button', 'opt' + (o === 'Otro' ? ' other' : '')); b.type = 'button'; b.dataset.v = o; b.setAttribute('role', 'radio');
    const m = h('span', 'mk', '✓'); b.append(m, h('span', '', o === 'Otro' ? 'Otro (escríbelo)' : o));
    b.addEventListener('click', () => {
      A[st.key] = o; if (o !== 'Otro') delete A[st.key + '_otro']; refresh(); upd();
      if (o === 'Otro') { setTimeout(() => other.focus(), 30); return; }
      if (st.auto !== false && !st.other) setTimeout(next, 220);
    });
    btns.push(b); wrap.appendChild(b);
  });
  other.addEventListener('input', () => { A[st.key + '_otro'] = other.value; upd(); });
  q.append(wrap, other); refresh();
}
function renderText(q, st, upd) {
  const ta = h(st.single ? 'input' : 'textarea', 'field'); if (!st.single) ta.rows = st.rows || 4; else ta.type = 'text';
  ta.maxLength = st.max || 400; ta.placeholder = st.placeholder || 'Escríbelo con tus palabras…'; ta.value = A[st.key] || '';
  ta.addEventListener('input', () => { A[st.key] = ta.value; upd(); });
  q.appendChild(ta);
  if (st.chips) { const cs = h('div', 'chips'); cs.style.marginTop = '12px'; st.chips.forEach(c => { const b = h('button', 'chip', c); b.type = 'button'; b.addEventListener('click', () => { ta.value = c; A[st.key] = c; upd(); ta.focus(); }); cs.appendChild(b); }); q.appendChild(cs); }
  setTimeout(() => { try { ta.focus({ preventScroll: true }); } catch { /* ok */ } }, 60);
}
function renderTasks(q, st, upd) {
  if (!Array.isArray(A.tareas)) A.tareas = [{ t: '', h: 2 }, { t: '', h: 2 }, { t: '', h: 2 }];
  const rows = h('div'); const inputs = [];
  A.tareas.forEach((row, i) => {
    const r = h('div', 'trow'); const inp = h('input', 'field'); inp.type = 'text'; inp.maxLength = 80; inp.placeholder = i === 0 ? 'Tarea 1 (obligatoria)' : `Tarea ${i + 1} (opcional)`; inp.value = row.t;
    const sel = h('select'); sel.setAttribute('aria-label', 'Horas por semana'); (st.hours || [0.5, 1, 2, 3, 5, 8, 12]).forEach(v => { const o = h('option', '', (v === 12 ? '12+' : v) + ' h/sem'); o.value = v; if (Number(row.h) === v) o.selected = true; sel.appendChild(o); });
    inp.addEventListener('input', () => { row.t = inp.value; upd(); }); sel.addEventListener('change', () => { row.h = Number(sel.value); });
    r.append(inp, sel); rows.appendChild(r); inputs.push(inp);
  });
  q.appendChild(rows);
  if (st.chips) { q.appendChild(h('p', 'hint', 'O toca una para empezar:')); const cs = h('div', 'chips'); st.chips.forEach(c => { const b = h('button', 'chip', c); b.type = 'button';
    b.addEventListener('click', () => { const k = inputs.findIndex(x => !x.value.trim()); const t = k === -1 ? inputs.length - 1 : k; inputs[t].value = c; A.tareas[t].t = c; upd(); }); cs.appendChild(b); }); q.appendChild(cs); }
}

// ---------- Fin, IA y resultado ----------
async function callAi(mode, again) {
  const res = await fetch(AIURL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, mode, answers: A, again: !!again }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.ok) throw Object.assign(new Error(d.error || 'ia'), { status: res.status });
  return d;
}
const api = {
  A, h, track, save, sid,
  countUp(node, value, fmt, ms = 1100) {
    if (REDUCED) { node.textContent = fmt(value); return; }
    const t0 = performance.now(); const step = (t) => { const p = Math.min(1, (t - t0) / ms); node.textContent = fmt(value * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
  },
  ai: callAi,
  saveAi(obj) { return save({ ai: obj, completed: true }); },
  bar(label, valueText, pct, hot) { const b = h('div', 'bar' + (hot ? ' hot' : '')); const r = h('div', 'row'); r.append(h('span', '', label), h('b', '', valueText)); const bg = h('div', 'bg'); const i = h('i'); bg.appendChild(i); b.append(r, bg); requestAnimationFrame(() => setTimeout(() => { i.style.width = Math.max(3, Math.min(100, pct)) + '%'; }, 80)); return b; },
  skeleton() { const d = h('div', 'skel'); d.innerHTML = '<i style="width:90%"></i><i style="width:75%"></i><i style="width:82%"></i>'; return d; }
};

async function finish() {
  track('completed', { n: C.steps.length, seconds: Math.round((Date.now() - startedAt) / 1000) });
  if (C.ai && C.ai.blocking) return runBlocking();
  showResult(null);
}
async function runBlocking(again) {
  const s = screens.loading; s.textContent = ''; s.appendChild(topbar());
  const l = h('div', 'loading'); const e = h('div', 'eqs'); for (let i = 0; i < 4; i++) e.appendChild(h('i')); l.appendChild(e); l.appendChild(h('p', '', C.ai.loadingText || 'Preparando tu resultado…')); s.appendChild(l); show('loading');
  try { const d = await callAi(C.ai.mode, again); track('ai_ok', { mode: C.ai.mode }); showResult(d); }
  catch (err) {
    track('ai_failed', { mode: C.ai.mode, status: err.status || 0 });
    l.textContent = ''; l.appendChild(h('p', '', err.status === 429 ? 'Ya generaste varias en poco tiempo. Inténtalo de nuevo en un rato.' : 'No pudimos generarlo ahora. Inténtalo otra vez.'));
    const b = h('button', 'btn', 'Intentar de nuevo'); b.type = 'button'; b.addEventListener('click', () => runBlocking(again)); l.appendChild(b);
    const bk = h('button', 'quiet', 'Volver a mis respuestas'); bk.type = 'button'; bk.addEventListener('click', () => { idx = C.steps.length - 1; show('q'); renderStep(); }); l.appendChild(bk);
  }
}
function showResult(aiData) {
  const s = screens.result; s.textContent = ''; s.appendChild(topbar());
  const body = h('div', 'result'); s.appendChild(body); aiBody = body;
  C.renderResult(body, api, aiData, { again: () => runBlocking(true) });
  if (C.resultQuestion) body.appendChild(buildResultQuestion(C.resultQuestion));
  body.appendChild(buildContact());
  body.appendChild(h('p', 'fine', C.fine || 'Es una estimación orientativa, basada en lo que respondiste.'));
  show('result'); save({ completed: true }); track('result_viewed', {});
}
function buildResultQuestion(rq) {
  const box = h('div', 'ask'); box.appendChild(h('h3', '', rq.title)); const wrap = h('div', 'opts');
  rq.options.forEach(o => { const b = h('button', 'opt'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = o; b.append(h('span', 'mk', '✓'), h('span', '', o));
    b.addEventListener('click', () => { A[rq.key] = o; wrap.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-checked', String(x.dataset.v === o))); track('result_question', { key: rq.key }); save({ completed: true }); }); wrap.appendChild(b); });
  box.appendChild(wrap); return box;
}
function buildContact() {
  const c = C.contact || {}; const box = h('div', 'contact'); box.appendChild(h('h3', '', c.title || '¿Quieres que te avisemos?'));
  box.appendChild(h('p', '', c.text || 'Déjanos tu correo o tu WhatsApp si quieres que te escribamos cuando tengamos una herramienta para esto. Es opcional y no lo compartimos.'));
  const em = h('input', 'field'); em.type = 'email'; em.placeholder = 'Tu correo'; em.autocomplete = 'email'; em.inputMode = 'email';
  const wa = h('input', 'field'); wa.type = 'tel'; wa.placeholder = 'O tu WhatsApp, con código de país (+506 8888 1234)'; wa.autocomplete = 'tel'; wa.inputMode = 'tel';
  const err = h('p', 'err is-hidden'); err.setAttribute('role', 'alert');
  const b = h('button', 'btn', c.button || 'Avísame'); b.type = 'button';
  b.addEventListener('click', async () => {
    err.classList.add('is-hidden'); const e = em.value.trim(), w = wa.value.trim();
    if (!e && !w) { err.textContent = 'Escribe tu correo o tu WhatsApp.'; err.classList.remove('is-hidden'); return; }
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { err.textContent = 'Revisa tu correo.'; err.classList.remove('is-hidden'); return; }
    if (w && w.replace(/\D/g, '').length < 8) { err.textContent = 'Revisa tu WhatsApp: incluye el código de tu país.'; err.classList.remove('is-hidden'); return; }
    b.disabled = true; b.textContent = 'Guardando…'; track('contact_submitted', { email: !!e, whatsapp: !!w });
    const r = await save({ completed: true, contact: { email: e, whatsapp: w } });
    if (r.ok) { box.textContent = ''; box.appendChild(h('div', 'thanks', c.thanks || '¡Listo! Te avisaremos. Gracias por tus respuestas.')); }
    else { b.disabled = false; b.textContent = c.button || 'Avísame'; err.textContent = (r.data && r.data.error) || 'No pudimos guardarlo. Inténtalo de nuevo.'; err.classList.remove('is-hidden'); }
  });
  box.append(em, wa, err, b); return box;
}

// ---------- Medición al salir: guarda lo que alcanzó a escribir ----------
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  try {
    navigator.sendBeacon(TRACK, new Blob([JSON.stringify({ event: 'page_hidden', anonId, app: C.app, metadata: { screen, step: screen === 'q' ? C.steps[idx].id : '', seconds: Math.round((Date.now() - startedAt) / 1000) } })], { type: 'application/json' }));
    if (firstSaved || screen !== 'intro') navigator.sendBeacon(SAVE, new Blob([JSON.stringify(payload({ first: false }))], { type: 'application/json' }));
  } catch { /* ok */ }
});

buildIntro(); show('intro');
track('landing_viewed', { referrer: document.referrer ? document.referrer.slice(0, 200) : null, likelyBot: /bot|crawl|spider|facebookexternalhit|whatsapp|preview|slackbot|embedly|discordbot/i.test(navigator.userAgent) });
// Sesión nueva en la base desde que abre (para saber cuántos entraron aunque no respondan)
})();
