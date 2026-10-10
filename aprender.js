// /aprender/: una sola pantalla (título, campo «Elige un tema» y «Empezar»). Pasa directo a Graphikosmos con el tema.
// Guarda cada respuesta al avanzar (hf-save, tool «aprende») y mide el recorrido (sfc-track-event, app «hf-aprende»).
(function () {
'use strict';
const TRACK = '/.netlify/functions/sfc-track-event', SAVE = '/.netlify/functions/hf-save';
const APP = 'hf-aprende', TOOL = 'aprende', TOTAL = 1;
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

// ---------- Pantalla única: un tema y a Graphikosmos ----------
const col = $('col');
let idx = -1, typedTracked = false, going = false;
function intro() {
  col.textContent = ''; const s = h('div', 'scr'); col.appendChild(s);
  s.appendChild(h('h1', '', 'Estudia de otra forma'));
  const form = h('form', 'start'); form.noValidate = true;
  const inp = h('input', 'field'); inp.type = 'text'; inp.maxLength = 120; inp.placeholder = 'Elige un tema'; inp.autocomplete = 'off'; inp.enterKeyHint = 'go'; inp.setAttribute('aria-label', 'Elige un tema');
  const btn = h('button', 'btn', 'Empezar'); btn.type = 'submit'; btn.disabled = true;
  form.appendChild(inp); form.appendChild(btn); s.appendChild(form);
  inp.addEventListener('input', () => {
    A.tema = inp.value.trim(); btn.disabled = A.tema.length < 2; setLabel(A.tema); setP(A.tema.length >= 2 ? 0.55 : 0);
    if (!typedTracked && A.tema.length >= 2) { typedTracked = true; track('topic_typed', {}); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault(); if (going || btn.disabled) return; going = true; btn.disabled = true; btn.textContent = 'Abriendo…';
    maxStep = 1; setP(1); track('start_clicked', { topic: A.tema.slice(0, 80) }); track('completed', { total: 1 });
    // El tema queda guardado (para ver qué quieren estudiar) y se pasa directo a Graphikosmos, que arma el mapa.
    const go2 = () => { try { track('redirect', {}); } catch { /* ok */ } location.href = '../?aprende=' + sid + '&ref=aprende&t=' + encodeURIComponent(A.tema.slice(0, 120)); };
    let done = false; const once = () => { if (!done) { done = true; go2(); } };
    save({ completed: true }).then(once, once); setTimeout(once, 1500);
  });
  setTimeout(() => { try { inp.focus({ preventScroll: true }); } catch { /* ok */ } }, 80);
}

// Si cierra la pestaña a la mitad, lo respondido queda guardado.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  try { navigator.sendBeacon(TRACK, new Blob([JSON.stringify({ event: 'page_hidden', anonId, app: APP, metadata: { step: going ? 'final' : 'intro' } })], { type: 'application/json' })); if (firstSaved) navigator.sendBeacon(SAVE, new Blob([JSON.stringify(payload({ first: false }))], { type: 'application/json' })); } catch { /* ok */ }
});

track('landing_viewed', { referrer: document.referrer ? document.referrer.slice(0, 120) : '' });
intro();
})();
