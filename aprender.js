// «Entiéndelo» (/aprender/): cuestionario amable con preguntas que la IA adapta a lo que la persona quiere entender.
// Al final se escribe un texto a su medida (ap-generate) y se abre Graphikosmos, que lo convierte en mapa mental solo.
// Guarda cada respuesta al avanzar (hf-save, tool «aprende») y mide el recorrido (sfc-track-event, app «hf-aprende»).
(function () {
'use strict';
const TRACK = '/.netlify/functions/sfc-track-event', SAVE = '/.netlify/functions/hf-save', NEXT = '/.netlify/functions/ap-next', GEN = '/.netlify/functions/ap-generate';
const APP = 'hf-aprende', TOOL = 'aprende', TOTAL = 7;
const $ = (id) => document.getElementById(id);
const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ok */ } };
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ok */ } };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[x]/g, () => ((Math.random() * 16) | 0).toString(16)));

const sid = uuid();
let anonId = lsGet('gk_anon_id'); if (!anonId) { anonId = uuid(); lsSet('gk_anon_id', anonId); }
const qs = new URLSearchParams(location.search);
['campaign', 'ad'].forEach(k => { const v = qs.get(k === 'campaign' ? 'utm_campaign' : 'utm_content') || qs.get(k === 'campaign' ? 'c' : 'ad'); if (v) ssSet('ap_' + k, v.slice(0, 40)); });
const UTM = { campaign: ssGet('ap_campaign') || '', ad: ssGet('ap_ad') || '' };

// ---------- Medición y guardado ----------
function track(event, metadata) {
  try { fetch(TRACK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ event, anonId, app: APP, metadata: Object.assign({}, metadata || {}, UTM.campaign ? { campaign: UTM.campaign } : {}, UTM.ad ? { ad: UTM.ad } : {}) }) }).catch(() => {}); } catch { /* medir nunca rompe nada */ }
}
let firstSaved = false, maxStep = 0;
const A = {};
function payload(extra) { return Object.assign({ sid, tool: TOOL, anonId, step: maxStep, total: TOTAL, answers: A, utm: UTM }, extra || {}); }
function save(extra) {
  const p = payload(Object.assign({ first: !firstSaved }, extra || {})); firstSaved = true;
  return fetch(SAVE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify(p) }).then(r => r.ok).catch(() => false);
}

// ---------- El nudo que se ordena ----------
const SV = 'http://www.w3.org/2000/svg';
const svg = $('viz');
const TREE = [[260, 86], [110, 230], [260, 230], [410, 230], [60, 390], [160, 390], [260, 390], [360, 390], [460, 390]];
const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [2, 6], [3, 7], [3, 8]];
const NOISE = [[1, 2], [2, 3], [4, 6], [5, 7], [6, 8], [1, 6], [3, 5], [4, 7], [2, 8], [0, 6], [5, 8], [1, 3]];
let seed = 7; const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const TANGLE = TREE.map(() => { const a = rnd() * Math.PI * 2, r = 40 + rnd() * 150; return [260 + Math.cos(a) * r * 1.15, 250 + Math.sin(a) * r * 0.95]; });
const CURL = PAIRS.concat(NOISE).map(() => (rnd() - 0.5) * 150);
const edgeEls = PAIRS.concat(NOISE).map((pr, i) => { const e = document.createElementNS(SV, 'path'); e.setAttribute('class', 'e'); e.dataset.noise = i >= PAIRS.length ? '1' : ''; svg.appendChild(e); return e; });
const nodeEls = TREE.map(() => { const c = document.createElementNS(SV, 'circle'); c.setAttribute('class', 'n'); svg.appendChild(c); return c; });
const label = document.createElementNS(SV, 'text'); label.setAttribute('x', '260'); label.setAttribute('y', '58'); svg.appendChild(label);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
let pCur = 0, pTarget = 0, raf = 0;
function drawViz(time) {
  const e = ease(Math.min(1, Math.max(0, pCur)));
  const pos = TREE.map((t, i) => { const w = RM ? 0 : (1 - e) * 11; return [lerp(TANGLE[i][0] + Math.sin(time * 0.9 + i * 1.7) * w, t[0], e), lerp(TANGLE[i][1] + Math.cos(time * 0.7 + i * 2.3) * w, t[1], e)]; });
  const col = mix([139, 124, 246], [79, 209, 197], e);
  PAIRS.concat(NOISE).forEach((pr, i) => {
    const a = pos[pr[0]], b = pos[pr[1]], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, c = CURL[i] * (1 - e), my = (a[1] + b[1]) / 2;
    const c1 = [lerp(a[0] + dx * 0.3 + nx * c, a[0], e), lerp(a[1] + dy * 0.3 + ny * c, my, e)], c2 = [lerp(a[0] + dx * 0.7 - nx * c, b[0], e), lerp(a[1] + dy * 0.7 - ny * c, my, e)];
    const el = edgeEls[i], noise = i >= PAIRS.length;
    el.setAttribute('d', `M${a[0].toFixed(1)} ${a[1].toFixed(1)}C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
    el.setAttribute('stroke', `rgb(${col.join(',')})`); el.setAttribute('stroke-width', noise ? '1.2' : String(lerp(1.4, 2.4, e)));
    el.setAttribute('opacity', noise ? String(Math.max(0, 0.55 - e * 0.75)) : String(lerp(0.5, 0.95, e)));
  });
  pos.forEach((p, i) => { const n = nodeEls[i]; n.setAttribute('cx', p[0].toFixed(1)); n.setAttribute('cy', p[1].toFixed(1)); n.setAttribute('r', String(lerp(4, i === 0 ? 11 : 8, e))); n.setAttribute('fill', `rgb(${col.join(',')})`); n.setAttribute('opacity', String(lerp(0.65, 1, e))); });
}
function loop(ts) {
  pCur += (pTarget - pCur) * 0.04; if (Math.abs(pTarget - pCur) < 0.0005) pCur = pTarget;
  drawViz(ts / 1000);
  raf = RM ? 0 : requestAnimationFrame(loop);
}
function setP(p) { pTarget = Math.min(1, Math.max(0, p)); if (RM) { pCur = pTarget; drawViz(0); } else if (!raf) raf = requestAnimationFrame(loop); }
function setLabel(t) { const s = String(t || '').trim(); label.textContent = s.length > 34 ? s.slice(0, 33) + '…' : s; label.classList.toggle('on', !!s); }
setP(0); if (RM) drawViz(0);

// ---------- Preguntas ----------
const FALLBACK = {
  1: { question: '¿Qué es lo que más se te dificulta?', multi: false, options: ['Entender los términos y definiciones', 'Ver cómo se conectan las ideas', 'No sé por dónde empezar', 'Recordarlo después de estudiarlo', 'Aplicarlo en ejemplos o problemas'] },
  2: { question: '¿Qué te ayudaría más?', multi: false, options: ['Una explicación paso a paso', 'Ejemplos de la vida diaria', 'Ver el panorama completo primero', 'Una historia o contexto', 'Definiciones cortas y claras'] },
  3: { question: '¿Cuánto tiempo llevas intentando entenderlo?', multi: false, options: ['Recién empiezo', 'Unos días', 'Algunas semanas', 'Meses o más'] }
};
const PROPOSITOS = ['Un examen o una clase', 'Mi trabajo o profesión', 'Una tesis o investigación', 'Enseñárselo a alguien', 'Pura curiosidad'];
const NIVELES = [['Empiezo desde cero', 'Casi no sé nada del tema'], ['Conozco lo básico', 'Me suenan los términos pero se me mezclan'], ['Tengo bastante base', 'Quiero afinar y conectar mejor']];
const ESTILOS = [
  ['claro', 'Claro y con ejemplos', 'Como un buen profesor: ejemplos de la vida diaria'],
  ['academico', 'Académico', 'Riguroso, con términos bien definidos'],
  ['historia', 'Como una historia', 'De dónde surge y cómo se fue resolviendo'],
  ['conciso', 'Directo y breve', 'Solo las ideas clave, sin relleno']
];
const EJEMPLOS = ['La inflación', 'Cómo funcionan las derivadas', 'La Revolución Francesa', 'La fotosíntesis', 'Qué es el inconsciente', 'Mi tema de tesis'];
const STEP_ORDER = ['tema', 'q1', 'q2', 'q3', 'proposito', 'nivel', 'estilo'];
const col = $('col');
let lastTema = ''; let idx = -1; const stack = []; const QS = {}; let nextToken = 0;

function clear() { col.textContent = ''; return col; }
function scr(cls) { const s = h('div', 'scr ' + (cls || '')); clear().appendChild(s); return s; }
function backBtn(s) { const b = h('button', 'back', '‹ Volver'); b.type = 'button'; b.addEventListener('click', () => { track('back_clicked', { step: STEP_ORDER[idx] }); nextToken++; if (stack.length) go(stack.pop(), false); else intro(); }); s.appendChild(b); }

function intro() {
  idx = -1; setP(0); const s = scr();
  s.appendChild(h('h1', '', 'Eso que no logras entender se entiende mejor en un mapa.'));
  s.appendChild(h('p', 'lead', 'Cuéntanos qué es. Te hacemos unas preguntas, te escribimos un texto a tu medida y lo convertimos en un mapa mental.'));
  const b = h('button', 'btn', 'Contar qué quiero entender'); b.type = 'button'; b.addEventListener('click', () => { track('start_clicked', {}); stack.length = 0; go(0, false); }); s.appendChild(b);
  const f = h('ul', 'facts'); ['Gratis para probar', 'Unas 7 preguntas, 2 minutos', 'No necesitas cuenta para empezar'].forEach(t => f.appendChild(h('li', '', t))); s.appendChild(f);
  setTimeout(() => { try { b.focus({ preventScroll: true }); } catch { /* ok */ } }, 80);
}

function go(i, push) {
  if (push !== false) stack.push(idx);
  idx = i; maxStep = Math.max(maxStep, i + 1); setP((i + 0.4) / (TOTAL + 0.8)); track('step_viewed', { step: STEP_ORDER[i], n: i + 1 });
  const id = STEP_ORDER[i];
  if (id === 'tema') stepTema(); else if (/^q\d$/.test(id)) stepAi(parseInt(id.slice(1), 10)); else if (id === 'proposito') stepChoice('proposito', '¿Para qué lo necesitas?', 'Así lo enfocamos mejor.', PROPOSITOS.map(o => [o, o, ''])); else if (id === 'nivel') stepChoice('nivel', '¿Qué tanto sabes del tema hoy?', 'Sé sincero: así no te aburrimos ni te perdemos.', NIVELES.map(o => [o[0], o[0], o[1]])); else stepChoice('estilo', '¿Cómo prefieres que te lo expliquen?', 'Este será el tono de tu texto.', ESTILOS, true);
}
function advance() {
  track('step_done', { step: STEP_ORDER[idx] }); save();
  if (idx + 1 >= STEP_ORDER.length) finish(); else go(idx + 1);
}

function stepTema() {
  const s = scr(); backBtn(s);
  s.appendChild(h('h2', '', '¿Qué quieres entender?'));
  s.appendChild(h('p', 'hint', 'Un tema, un concepto, una duda… como te salga.'));
  const ta = h('textarea', 'field'); ta.rows = 2; ta.maxLength = 200; ta.placeholder = 'Ej.: cómo funciona la inflación'; ta.value = A.tema || ''; s.appendChild(ta);
  const chips = h('div', 'chips'); EJEMPLOS.forEach(t => { const c = h('button', 'chip', t); c.type = 'button'; c.addEventListener('click', () => { ta.value = t; upd(); ta.focus(); }); chips.appendChild(c); }); s.appendChild(chips);
  const foot = h('div', 'foot'); const nb = h('button', 'btn', 'Seguir'); nb.type = 'button'; foot.appendChild(nb); s.appendChild(foot);
  const upd = () => { A.tema = ta.value.trim(); nb.disabled = A.tema.length < 2; setLabel(A.tema); };
  ta.addEventListener('input', upd); ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!nb.disabled) advance(); } });
  nb.addEventListener('click', () => { if (!nb.disabled) { if (lastTema && lastTema !== A.tema) { QS[1] = QS[2] = QS[3] = undefined; ['q1','a1','a1_otro','q2','a2','a2_otro','q3','a3','a3_otro'].forEach(k => delete A[k]); } lastTema = A.tema; advance(); } });
  upd(); setTimeout(() => { try { ta.focus({ preventScroll: true }); } catch { /* ok */ } }, 60);
}

// Una pregunta propuesta por la IA (o la de respaldo, sin avisar nada si la IA falla)
function stepAi(n) {
  const s = scr(); backBtn(s);
  const token = ++nextToken;
  if (QS[n]) return renderChoice(s, n, QS[n]);
  const t = h('p', 'think'); t.appendChild(h('b')); t.appendChild(document.createTextNode('Pensando tu siguiente pregunta…')); s.appendChild(t);
  const sk = h('div', 'skel'); for (let i = 0; i < 4; i++) sk.appendChild(h('i')); s.appendChild(sk);
  const history = []; for (let k = 1; k < n; k++) if (A['q' + k] && A['a' + k]) history.push({ q: A['q' + k], a: A['a' + k] });
  const ctrl = ('AbortController' in window) ? new AbortController() : null; const timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch { /* ok */ } }, 9500);
  const t0 = Date.now();
  fetch(NEXT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, tema: A.tema, step: n, history }), signal: ctrl ? ctrl.signal : undefined })
    .then(r => r.json()).then(d => d && !d.fallback && Array.isArray(d.options) && d.options.length >= 4 ? { q: d, fb: false } : { q: FALLBACK[n], fb: true }).catch(() => ({ q: FALLBACK[n], fb: true }))
    .then(({ q, fb }) => { clearTimeout(timer); if (token !== nextToken || idx !== n) return; QS[n] = q; track('ai_q_shown', { n, fallback: fb, seconds: Math.round((Date.now() - t0) / 100) / 10 }); renderChoice(scr(), n, q, true); });
}
function renderChoice(s, n, q, needBack) {
  if (needBack) backBtn(s);
  s.appendChild(h('h2', '', q.question)); if (q.hint) s.appendChild(h('p', 'hint', q.hint));
  A['q' + n] = q.question;
  const picked = new Set((A['a' + n] || '').split(' · ').filter(Boolean)); let otroOn = !!A['a' + n + '_otro'];
  const wrap = h('div', 'opts' + (q.multi ? ' multi' : '')); wrap.setAttribute('role', q.multi ? 'group' : 'radiogroup'); const btns = [];
  const ta = h('textarea', 'field otro'); ta.rows = 2; ta.maxLength = 200; ta.placeholder = 'Escríbelo con tus palabras'; ta.value = A['a' + n + '_otro'] || ''; if (!otroOn) ta.classList.add('is-hidden');
  const nb = h('button', 'btn', 'Seguir'); nb.type = 'button';
  const sync = () => { const parts = [...picked]; A['a' + n] = parts.join(' · '); if (otroOn && ta.value.trim()) A['a' + n + '_otro'] = ta.value.trim(); else delete A['a' + n + '_otro']; nb.disabled = !(parts.length || (otroOn && ta.value.trim().length >= 2)); nb.classList.toggle('is-hidden', !q.multi && !otroOn); btns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.o === '__otro' ? otroOn : picked.has(b.dataset.o)))); ta.classList.toggle('is-hidden', !otroOn); };
  q.options.concat(['__otro']).forEach(o => {
    const b = h('button', 'opt'); b.type = 'button'; b.dataset.o = o; b.setAttribute('role', q.multi ? 'checkbox' : 'radio'); b.appendChild(h('span', 'mk', '✓')); b.appendChild(h('span', '', o === '__otro' ? 'Otra cosa (escríbela)' : o));
    b.addEventListener('click', () => {
      if (o === '__otro') { if (q.multi) otroOn = !otroOn; else { otroOn = true; picked.clear(); } sync(); if (otroOn) setTimeout(() => ta.focus(), 30); return; }
      if (q.multi) { picked.has(o) ? picked.delete(o) : picked.add(o); } else { picked.clear(); picked.add(o); otroOn = false; }
      sync(); if (!q.multi) setTimeout(() => { if (idx === n && picked.has(o)) advance(); }, 240);
    });
    btns.push(b); wrap.appendChild(b);
  });
  ta.addEventListener('input', sync); s.appendChild(wrap); s.appendChild(ta);
  const foot = h('div', 'foot'); foot.appendChild(nb); s.appendChild(foot); nb.addEventListener('click', () => { if (!nb.disabled) advance(); }); sync();
}

// Pasos fijos (propósito, nivel, estilo)
function stepChoice(key, title, hint, opts, isEstilo) {
  const s = scr(); backBtn(s); s.appendChild(h('h2', '', title)); s.appendChild(h('p', 'hint', hint));
  const wrap = h('div', 'opts'); wrap.setAttribute('role', 'radiogroup');
  opts.forEach(([val, text, sub]) => {
    const b = h('button', 'opt'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(isEstilo ? A.estilo_id === val : A[key] === val)); b.appendChild(h('span', 'mk', '✓'));
    const d = h('span'); d.appendChild(document.createTextNode(text)); if (sub) d.appendChild(h('small', '', sub)); b.appendChild(d);
    b.addEventListener('click', () => { if (isEstilo) { A.estilo_id = val; A.estilo = text; } else A[key] = val; wrap.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-checked', String(x === b))); setTimeout(() => { if (idx === STEP_ORDER.indexOf(key)) advance(); }, 240); });
    wrap.appendChild(b);
  });
  s.appendChild(wrap);
}

// ---------- Final: se escribe el texto y se abre Graphikosmos ----------
const STATUS = ['Escribiendo un texto a tu medida…', 'Buscando las ideas clave…', 'Preparando tu mapa…'];
function finish() {
  idx = STEP_ORDER.length; nextToken++; setP(1);
  const s = scr('gen'); s.appendChild(h('h2', '', 'Armando tu mapa'));
  const st = h('p', 'status', STATUS[0]); s.appendChild(st); const bar = h('div', 'bar'); const fill = h('i'); bar.appendChild(fill); s.appendChild(bar);
  requestAnimationFrame(() => { fill.style.width = '85%'; fill.style.transitionDuration = '18s'; });
  let k = 0; const iv = setInterval(() => { k = Math.min(STATUS.length - 1, k + 1); st.textContent = STATUS[k]; }, 6500);
  track('completed', { total: TOTAL }); const t0 = Date.now();
  const go2 = (okText) => { clearInterval(iv); fill.style.transitionDuration = '.4s'; fill.style.width = '100%'; track(okText ? 'generate_ok' : 'generate_failed', { seconds: Math.round((Date.now() - t0) / 100) / 10 }); st.textContent = 'Listo. Abriendo Graphikosmos…'; setTimeout(() => { try { track('redirect', {}); } catch { /* ok */ } location.href = '../?aprende=' + sid + '&ref=aprende' + (okText ? '' : '&t=' + encodeURIComponent((A.tema || '').slice(0, 120))); }, RM ? 100 : 700); };
  const attempt = (n) => fetch(GEN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, answers: A }) }).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(d => { if (!d || !d.ok) throw 0; return true; }).catch(e => (n < 1 && e !== 429) ? new Promise(r => setTimeout(r, 1200)).then(() => attempt(n + 1)) : false);
  save({ completed: true }).then(() => attempt(0)).then(go2);
}

// Si cierra la pestaña a la mitad, lo respondido queda guardado.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  try { navigator.sendBeacon(TRACK, new Blob([JSON.stringify({ event: 'page_hidden', anonId, app: APP, metadata: { step: idx >= 0 && idx < STEP_ORDER.length ? STEP_ORDER[idx] : (idx < 0 ? 'intro' : 'final') } })], { type: 'application/json' })); if (firstSaved) navigator.sendBeacon(SAVE, new Blob([JSON.stringify(payload({ first: false }))], { type: 'application/json' })); } catch { /* ok */ }
});

track('landing_viewed', { referrer: document.referrer ? document.referrer.slice(0, 120) : '' });
intro();
})();
