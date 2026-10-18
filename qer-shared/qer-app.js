// ==========================================
// Cliente compartido de las 4 apps de pago: quien-eres, who-are-you, quien-es-tu-pareja, who-is-your-partner.
// Todo lo que cambia entre apps (idioma, preguntas, textos, formato de lectura) viene de window.QER_CFG (config.js
// de cada carpeta); el cobro viene de window.QER_PAY (/qer-shared/qer-pay-config.js).
// FLUJO: todo el resultado sale CERRADO (candado) con adelantos (perfil borroso, rasgo más fuerte, palabras tapadas,
// títulos y primeras palabras de cada capítulo) → «Ver todo» → pantalla de motivación → «Sí, quiero ver todo lo mío»
// → pago → lectura abierta en la página + copia por correo.
// Cobro: Costa Rica → SINPE Móvil + foto del comprobante (cualquier imagen desbloquea, sin verificar); resto del mundo →
// botones de PayPal (API de pedidos): el SERVIDOR verifica el cobro antes de entregar el texto (qer-paypal-*), manda la
// lectura al correo del pagador y la deja abierta en la página.
// Modo prueba (window.QER_TEST, ver quien-eres/prueba/): respuestas cargadas, genera solo, sin eventos, y en vez de cobrar
// manda la lectura al correo del dueño (qer-owner-send).
// Cada paso se registra en `events` (app = quien-eres | who-are-you | quien-es-tu-pareja | who-is-your-partner).
// ==========================================
(function () {
'use strict';
const CFG = window.QER_CFG, PAY = window.QER_PAY, TEST = window.QER_TEST || null, SEALED = window.QER_SEALED || null;
const STR = (window.QER_STR || {})[window.QER_CFG.lang] || {};
const APP = CFG.app, QUESTIONS = CFG.questions, TOTAL = QUESTIONS.length;
const PAYWALL_VERSION = SEALED ? 'sealed1' : 'paid1';   // sealed1 = ningún resultado a la vista: una frase y el pago (quien-eres/sellado/)
const $ = (id) => document.getElementById(id);

// --- textos ---
function tt(key, vars) {
  let s = CFG.t[key];
  if (s == null) s = STR[key];
  if (s == null) return '';
  if (typeof s !== 'string') return s;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
document.querySelectorAll('[data-t]').forEach(el => { el.textContent = tt(el.dataset.t); });
document.querySelectorAll('[data-aria]').forEach(el => { el.setAttribute('aria-label', tt(el.dataset.aria)); });
document.querySelectorAll('.skip-reason').forEach(b => { b.textContent = (CFG.t.reasons || {})[b.dataset.reason] || b.dataset.reason; });
document.documentElement.lang = CFG.lang;

// --- identidad anónima y registro de eventos ---
const ANON_ID_KEY = 'qer_anon_id';
function ensureAnonId() {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`); localStorage.setItem(ANON_ID_KEY, id); }
    return id;
  } catch { return `volatile-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
const anonId = ensureAnonId();
const utm = (() => { try { const p = new URLSearchParams(location.search); const o = {}; ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].forEach(k => { if (p.get(k)) o[k] = p.get(k).slice(0, 80); }); return o; } catch { return {}; } })();
function track(eventName, metadata) {
  if (TEST) return;
  try {
    fetch('/.netlify/functions/qer-track-event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: eventName, anonId, app: APP, metadata: { ...(metadata || {}), variant: SEALED ? 'sealed' : 'paid', lang: CFG.lang, kind: CFG.kind, ...(eventName === 'landing_viewed' ? utm : {}) } })
    }).catch(() => {});
  } catch { /* no crítico */ }
}
track('landing_viewed', {
  referrer: document.referrer ? document.referrer.slice(0, 200) : null,
  likelyBot: /bot|crawl|spider|facebookexternalhit|whatsapp|preview|slackbot|embedly|discordbot/i.test(navigator.userAgent)
});
const pageStartedAt = Date.now();

// --- país ---
const TZ_COUNTRY = { 'America/Costa_Rica': 'CR', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'America/Mexico_City': 'MX', 'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Santiago': 'CL', 'America/Argentina/Buenos_Aires': 'AR', 'America/Montevideo': 'UY', 'America/Panama': 'PA', 'America/Guatemala': 'GT', 'America/El_Salvador': 'SV', 'America/Tegucigalpa': 'HN', 'America/Managua': 'NI', 'America/Guayaquil': 'EC', 'America/Caracas': 'VE', 'America/La_Paz': 'BO', 'America/Asuncion': 'PY', 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Toronto': 'CA', 'Europe/London': 'GB', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Rome': 'IT', 'Australia/Sydney': 'AU' };
const COUNTRY_CUR = { CR: 'CRC', US: 'USD', EC: 'USD', SV: 'USD', PA: 'USD', PR: 'USD', CA: 'CAD', MX: 'MXN', CO: 'COP', PE: 'PEN', CL: 'CLP', AR: 'ARS', UY: 'UYU', BO: 'BOB', PY: 'PYG', VE: 'VES', GT: 'GTQ', HN: 'HNL', NI: 'NIO', DO: 'DOP', CU: 'CUP', BR: 'BRL', GB: 'GBP', IE: 'EUR', ES: 'EUR', FR: 'EUR', DE: 'EUR', IT: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', AU: 'AUD', NZ: 'NZD', JP: 'JPY', KR: 'KRW', CN: 'CNY', IN: 'INR', SG: 'SGD', HK: 'HKD', PH: 'PHP', TH: 'THB', MY: 'MYR', ID: 'IDR', VN: 'VND', AE: 'AED', SA: 'SAR', IL: 'ILS', TR: 'TRY', ZA: 'ZAR', NG: 'NGN', EG: 'EGP', MA: 'MAD', KE: 'KES' };
let country = null, countrySource = '';
async function detectCountry() {
  try {
    const o = new URLSearchParams(location.search).get('pais') || new URLSearchParams(location.search).get('country');
    if (o && /^[A-Za-z]{2}$/.test(o)) { countrySource = 'param'; return o.toUpperCase(); }
  } catch { /* sigue */ }
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch('/.netlify/functions/qer-geo', { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(to);
    const d = await res.json().catch(() => ({}));
    if (d.country) { countrySource = 'geo'; return d.country; }
  } catch { /* sigue */ }
  try { const c = TZ_COUNTRY[Intl.DateTimeFormat().resolvedOptions().timeZone]; if (c) { countrySource = 'timezone'; return c; } } catch { /* sigue */ }
  countrySource = 'unknown'; return null;
}

// --- tipo de cambio (solo para MOSTRAR el monto; PayPal cobra en USD/EUR) ---
async function getRates() {
  try {
    const c = JSON.parse(localStorage.getItem('qer_fx') || 'null');
    if (c && Date.now() - c.at < 12 * 3600 * 1000 && c.rates) return c.rates;
  } catch { /* sigue */ }
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 3500);
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: ctl.signal });
    clearTimeout(to);
    const d = await res.json();
    if (d && d.rates) { try { localStorage.setItem('qer_fx', JSON.stringify({ at: Date.now(), rates: d.rates })); } catch { /* ok */ } return d.rates; }
  } catch { /* sin tipo de cambio: se muestra solo en dólares */ }
  return null;
}
function money(amount, cur) {
  if (cur === 'CRC') return '₡' + Math.round(amount).toLocaleString('de-DE');
  try {
    const big = amount >= 100;
    return new Intl.NumberFormat(CFG.locale, { style: 'currency', currency: cur, currencyDisplay: cur === 'USD' && CFG.lang === 'es' ? 'code' : 'symbol', maximumFractionDigits: big ? 0 : 2, minimumFractionDigits: big ? 0 : 2 }).format(amount).replace(/ /g, ' ');
  } catch { return `${amount.toFixed(2)} ${cur}`; }
}

// --- navegación ---
let currentScreenName = 'cover';
function showScreen(name) {
  currentScreenName = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  $(`screen-${name}`).classList.add('is-active');
  $('progress').classList.toggle('is-hidden', name !== 'quiz');
  const shell = document.querySelector('.shell'); if (shell) shell.classList.toggle('is-reveal', name === 'reveal');
  syncCta();
  window.scrollTo(0, 0);
}
// El botón fijo «Ver todo» solo aparece en el resultado cerrado.
function syncCta() {
  const show = currentScreenName === 'reveal' && !readUnlocked && chapters.length > 0;
  const cta = $('unlockCta'); if (cta) cta.classList.toggle('is-hidden', !show);
  const rv = $('screen-reveal'); if (rv) rv.classList.toggle('has-cta', show);
}

// --- estado ---
let currentIndex = 0;
const answers = new Array(TOTAL).fill(null);
let unlocking = false, readingId = null, archetypeNameForShare = '', chapters = [], readUnlocked = false, previewData = null, statsData = null, profileFull = null;

// --- cuestionario ---
const qPromptEl = $('qPrompt'), qBodyEl = $('qBody'), btnNext = $('btnNext'), btnBack = $('btnBack'), progressFill = $('progressFill');
const FINISH_EARLY_AFTER = CFG.finishEarlyAfter || 15;
function updateFinishEarly(index) {
  const answered = answers.filter(Boolean).length;
  const show = answered >= FINISH_EARLY_AFTER && index < TOTAL - 1;
  $('finishEarly').classList.toggle('is-hidden', !show);
  if (show && !updateFinishEarly.shown) { updateFinishEarly.shown = true; track('finish_early_offered', { answered }); }
}
$('btnFinishEarly').addEventListener('click', () => {
  const v = collectAnswer(currentIndex);
  if (v && v.length >= 2) answers[currentIndex] = v;
  track('quiz_finished_early', { answered: answers.filter(Boolean).length, atIndex: currentIndex + 1 });
  saveQuizProgress();
  submitQuiz();
});

let qShownAt = Date.now();
function renderQuestion(index) {
  const q = QUESTIONS[index];
  qShownAt = Date.now();
  progressFill.style.width = `${Math.round((index / TOTAL) * 100)}%`;
  btnBack.classList.toggle('is-hidden', index === 0);
  qPromptEl.textContent = q.prompt;
  $('qAct').textContent = tt('act_label', { a: q.act, acts: CFG.acts.length, title: CFG.acts[q.act - 1] || '' });
  qBodyEl.innerHTML = '';
  btnNext.disabled = true;
  const existing = answers[index];

  if (q.type === 'choice') {
    const wrap = document.createElement('div'); wrap.className = 'options';
    const otherWrap = document.createElement('div'); otherWrap.className = 'other-wrap is-hidden';
    const ta = document.createElement('textarea'); ta.className = 'short-input'; ta.rows = 2; ta.maxLength = 300; ta.placeholder = tt('other_placeholder');
    otherWrap.appendChild(ta);
    // Opción extra opcional (CFG.t.unknown_option, p. ej. «No lo sé / depende»): quien no está seguro no abandona.
    const opts = CFG.t.unknown_option ? q.options.concat([CFG.t.unknown_option]) : q.options;
    const known = existing && opts.includes(existing);
    const isOther = existing && !known;
    const mk = (label, other) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'option' + (other ? ' is-other' : '');
      b.dataset.other = other ? '1' : '';
      const dot = document.createElement('span'); dot.className = 'dot'; const sp = document.createElement('span'); sp.textContent = label;
      b.append(dot, sp); return b;
    };
    opts.forEach(opt => {
      const b = mk(opt, false);
      if (existing === opt) { b.classList.add('is-selected'); btnNext.disabled = false; }
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.option').forEach(o => o.classList.remove('is-selected'));
        b.classList.add('is-selected'); otherWrap.classList.add('is-hidden'); btnNext.disabled = false;
        const at = currentIndex;
        setTimeout(() => { if (currentIndex === at && !btnNext.disabled && currentScreenName === 'quiz') btnNext.click(); }, 380);
      });
      wrap.appendChild(b);
    });
    const ob = mk(tt('other_option'), true);
    ob.addEventListener('click', () => {
      wrap.querySelectorAll('.option').forEach(o => o.classList.remove('is-selected'));
      ob.classList.add('is-selected'); otherWrap.classList.remove('is-hidden');
      btnNext.disabled = ta.value.trim().length < 2; setTimeout(() => ta.focus(), 30);
    });
    ta.addEventListener('input', () => { btnNext.disabled = ta.value.trim().length < 2; });
    wrap.appendChild(ob);
    if (isOther) { ob.classList.add('is-selected'); otherWrap.classList.remove('is-hidden'); ta.value = existing; btnNext.disabled = ta.value.trim().length < 2; }
    qBodyEl.append(wrap, otherWrap);
    updateFinishEarly(index);
    return;
  }

  const inputWrap = document.createElement('div'); inputWrap.className = 'short-input-wrap';
  const textarea = document.createElement('textarea'); textarea.className = 'short-input'; textarea.rows = 3; textarea.maxLength = 600;
  textarea.placeholder = q.placeholder || ''; textarea.value = existing || '';
  textarea.addEventListener('input', () => { btnNext.disabled = textarea.value.trim().length < 2; });
  inputWrap.appendChild(textarea);
  const hint = document.createElement('p'); hint.className = 'short-hint'; hint.textContent = tt('short_hint'); inputWrap.appendChild(hint);
  qBodyEl.appendChild(inputWrap);
  btnNext.disabled = !(existing && existing.trim().length >= 2);
  setTimeout(() => textarea.focus(), 50);
  updateFinishEarly(index);
}

function collectAnswer(index) {
  const q = QUESTIONS[index];
  if (q.type === 'choice') {
    const sel = qBodyEl.querySelector('.option.is-selected');
    if (!sel) return null;
    if (sel.dataset.other) { const ta = qBodyEl.querySelector('.other-wrap .short-input'); return ta ? ta.value.trim() : null; }
    return sel.querySelector('span:last-child').textContent;
  }
  const ta = qBodyEl.querySelector('.short-input');
  return ta ? ta.value.trim() : null;
}

btnNext.addEventListener('click', () => {
  const value = collectAnswer(currentIndex);
  if (!value) return;
  answers[currentIndex] = value;
  const q = QUESTIONS[currentIndex];
  track('question_answered', {
    questionIndex: currentIndex + 1, questionId: q.id, questionType: q.type, question: q.prompt, answer: value.slice(0, 500),
    custom: q.type === 'choice' && !q.options.includes(value) ? true : undefined,
    seconds: Math.round((Date.now() - qShownAt) / 1000)
  });
  saveQuizProgress();
  if (currentIndex < TOTAL - 1) { currentIndex++; renderQuestion(currentIndex); }
  else { progressFill.style.width = '100%'; submitQuiz(); }
});
btnBack.addEventListener('click', () => {
  if (currentIndex === 0) return;
  const v = collectAnswer(currentIndex); if (v) answers[currentIndex] = v;
  currentIndex--; renderQuestion(currentIndex);
});

// --- guardar avance ---
const PROGRESS_KEY = `qer_progress_${APP}_v1`;
function saveQuizProgress() { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ answers, currentIndex: currentIndex + 1, savedAt: Date.now() })); } catch { /* ok */ } }
function loadQuizProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
    if (!p || !Array.isArray(p.answers) || Date.now() - (p.savedAt || 0) > 3 * 24 * 3600 * 1000) return null;
    const done = p.answers.filter(Boolean).length;
    return done > 0 && done < TOTAL ? p : null;
  } catch { return null; }
}
function clearQuizProgress() { try { localStorage.removeItem(PROGRESS_KEY); } catch { /* ok */ } }

$('btnStart').addEventListener('click', () => {
  track('quiz_started', {});
  clearQuizProgress(); answers.fill(null); currentIndex = 0; renderQuestion(0); showScreen('quiz');
});
// Portada con la primera pregunta (solo si la app lo pide con CFG.coverQuestion, p. ej. /aptitud/): la persona empieza
// respondiendo con un toque, sin pasar por «Empezar». Debajo, un ejemplo de cómo se ve el resultado (CFG.coverExample).
if (CFG.coverQuestion && QUESTIONS[0] && QUESTIONS[0].type === 'choice') {
  const cover = $('screen-cover'), q0 = QUESTIONS[0];
  const box = document.createElement('div'); box.className = 'cover-q';
  const lab = document.createElement('p'); lab.className = 'cover-q-label'; lab.textContent = tt('cover_q_label');
  const pr = document.createElement('p'); pr.className = 'cover-q-prompt display'; pr.textContent = q0.prompt;
  const grid = document.createElement('div'); grid.className = 'cover-q-options';
  q0.options.forEach(opt => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cover-q-opt'; b.textContent = opt;
    b.addEventListener('click', () => {
      b.classList.add('is-selected');
      track('quiz_started', { from: 'cover' });
      clearQuizProgress(); answers.fill(null); answers[0] = opt;
      track('question_answered', { questionIndex: 1, questionId: q0.id, questionType: q0.type, question: q0.prompt, answer: opt, seconds: Math.round((Date.now() - pageStartedAt) / 1000), from: 'cover' });
      currentIndex = 1; saveQuizProgress();
      setTimeout(() => { renderQuestion(1); showScreen('quiz'); }, 220);
    });
    grid.appendChild(b);
  });
  box.append(lab, pr, grid);
  $('btnStart').style.display = 'none';   // la pregunta 1 reemplaza al botón «Empezar»
  cover.insertBefore(box, $('btnStart'));
  const ex = CFG.coverExample;
  if (ex && Array.isArray(ex.bars)) {
    const card = document.createElement('div'); card.className = 'cover-example'; card.setAttribute('aria-label', tt('cover_example_label'));
    const l = document.createElement('p'); l.className = 'cover-example-label'; l.textContent = tt('cover_example_label');
    const n = document.createElement('p'); n.className = 'cover-example-name display'; n.textContent = ex.profile || '';
    card.append(l, n);
    ex.bars.forEach(([name, val]) => {
      const row = document.createElement('div'); row.className = 'cover-example-row';
      const s = document.createElement('span'); s.textContent = name;
      const v = document.createElement('b'); v.textContent = String(val);
      const bar = document.createElement('i'); const fill = document.createElement('i'); fill.style.width = Math.max(0, Math.min(100, Number(val) || 0)) + '%'; bar.appendChild(fill);
      row.append(s, v, bar); card.appendChild(row);
    });
    cover.insertBefore(card, $('btnResume').nextSibling);
  }
  cover.classList.add('has-cover-q');
}

const savedProgress = loadQuizProgress();
if (savedProgress) {
  const br = $('btnResume');
  br.textContent = tt('btn_resume', { n: Math.min(savedProgress.currentIndex + 1, TOTAL), total: TOTAL });
  br.classList.remove('is-hidden');
  br.addEventListener('click', () => {
    track('quiz_resumed', { fromIndex: savedProgress.currentIndex + 1 });
    savedProgress.answers.forEach((v, i) => { if (i < TOTAL) answers[i] = v; });
    currentIndex = Math.min(savedProgress.currentIndex, TOTAL - 1);
    renderQuestion(currentIndex); showScreen('quiz');
  });
}

// --- lectura pendiente ---
const PENDING_KEY = `qer_pending_${APP}`;
const PENDING_MAX_AGE_MS = 71 * 3600 * 1000;
function savePending(d) { try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...d, savedAt: Date.now() })); } catch { /* ok */ } }
function loadPending() {
  try {
    const d = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    if (!d?.readingId || Date.now() - (d.savedAt || 0) > PENDING_MAX_AGE_MS) { localStorage.removeItem(PENDING_KEY); return null; }
    return d;
  } catch { return null; }
}
function clearPending() { try { localStorage.removeItem(PENDING_KEY); } catch { /* ok */ } }

// --- generación ---
async function postFn(name, payload) {
  const res = await fetch(`/.netlify/functions/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Error ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}
async function postWithOneRetry(name, payload) {
  try { return await postFn(name, payload); }
  catch (err) { if (err.status && err.status < 500 && err.status !== 409) throw err; return await postFn(name, payload); }
}
async function submitQuiz() {
  showScreen('loading');
  const label = $('loadingLabel'), steps = CFG.t.loading_steps;
  label.textContent = steps[0];
  const payload = { format: CFG.format, answers: QUESTIONS.map((q, i) => ({ question: q.prompt, answer: answers[i] || '' })) };
  const t0 = Date.now();
  try {
    const axis = await postWithOneRetry('qer-generate-map', payload);
    label.textContent = steps[2];
    const rotate = setInterval(() => { label.textContent = steps[1 + Math.floor((Date.now() - t0) / 7000) % 2]; }, 7000);
    try { await Promise.all([0, 1, 2, 3, 4].map(part => postWithOneRetry('qer-generate-map-part', { readingId: axis.readingId, part }))); }
    finally { clearInterval(rotate); }
    label.textContent = steps[3];
    const data = await postWithOneRetry('qer-generate-map-finalize', { readingId: axis.readingId });
    track('reading_generated_success', { seconds: Math.round((Date.now() - t0) / 1000), answered: answers.filter(Boolean).length });
    clearQuizProgress();
    renderReveal(data);
  } catch (err) {
    track('reading_generated_error', { reason: String(err.message).slice(0, 200), seconds: Math.round((Date.now() - t0) / 1000) });
    showError(tt('err_title'), err.message, submitQuiz);
  }
}
function showError(title, detail, retryFn) {
  $('errorMsg').textContent = title; $('errorDetail').textContent = detail || tt('err_detail');
  $('btnRetry').onclick = retryFn; showScreen('error');
}

// --- pintar la lectura ---
function escapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const fmtInt = (n) => Number(n || 0).toLocaleString(CFG.locale);
function paragraphsHtml(text) { return String(text || '').split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHtml(p)}</p>`).join(''); }
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

// Gráfica de rasgos (radar). Con `scores` dibuja la forma real; sin ellos (resultado cerrado) una forma decorativa que
// luego se desenfoca: el navegador nunca recibe las cifras reales antes del pago.
function seeded(seedStr) { let h = 2166136261; for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; }; }
function radarSvg(names, scores, teaser) {
  const n = names.length, cx = 190, cy = 140, R = 84;
  const pt = (r, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const poly = (pts) => pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const rnd = seeded(String(readingId || 'x'));
  const vals = scores || names.map(() => 45 + Math.round(rnd() * 45));
  let g = '';
  [0.34, 0.67, 1].forEach(k => { g += `<polygon class="radar-grid" points="${poly(names.map((_, i) => pt(R * k, i)))}"/>`; });
  names.forEach((_, i) => { const p = pt(R, i); g += `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"/>`; });
  let shape = '', shapePts = [];
  if (teaser) {
    // Adelanto: solo el rasgo más fuerte se ve completo; los demás son «?» claros sobre su eje (nada borroso).
    names.forEach((nm, i) => {
      const isTop = i === teaser.topIndex, p = pt(R * (isTop ? teaser.score / 100 : 0.62), i), o = pt(R, i);
      if (isTop) shape += `<line class="radar-top" x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"/><circle class="radar-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5"/><text class="radar-val" x="${p[0].toFixed(1)}" y="${(p[1] - 10).toFixed(1)}" style="font-size:12px;font-weight:600">${teaser.score}</text>`;
      else shape += `<line class="radar-dash" x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"/><circle class="radar-q" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="9"/><text class="radar-qt" x="${p[0].toFixed(1)}" y="${(p[1] + 4).toFixed(1)}">?</text>`;
    });
  } else {
    shapePts = names.map((_, i) => pt(R * vals[i] / 100, i));
    shape = `<polygon class="radar-shape" points="${poly(shapePts)}"/>`;
  }
  if (scores && !teaser) shapePts.forEach((p, i) => { shape += `<circle class="radar-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3"/><text class="radar-val" x="${p[0].toFixed(1)}" y="${(p[1] - 7).toFixed(1)}">${vals[i]}</text>`; });
  let labels = '';
  names.forEach((nm, i) => {
    const p = pt(R + 16, i), c = Math.cos(-Math.PI / 2 + i * 2 * Math.PI / n);
    const anchor = c > 0.3 ? 'start' : (c < -0.3 ? 'end' : 'middle');
    // Nombres largos: se parten en dos líneas (nunca se cortan con «…», parecería un error)
    let l1 = nm, l2 = '';
    if (nm.length > 14 && nm.includes(' ')) { const words = nm.split(' '); let k = Math.ceil(words.length / 2); if (words.length === 3 && words[0].length + words[1].length < 12) k = 2; l1 = words.slice(0, k).join(' '); l2 = words.slice(k).join(' '); }
    const x = p[0].toFixed(1), y = p[1] + 4 - (l2 ? 6 : 0);
    labels += `<text class="radar-label" x="${x}" y="${y.toFixed(1)}" text-anchor="${anchor}">${escapeHtml(l1)}${l2 ? `<tspan x="${x}" dy="12">${escapeHtml(l2)}</tspan>` : ''}</text>`;
  });
  return `<svg viewBox="0 0 380 290" role="img" aria-label="${escapeHtml(tt('n_prev_title'))}">${g}<g class="radar-shape-g">${shape}</g>${labels}</svg>`;
}
function redactBars(count, seedStr) { const r = seeded(seedStr); let h = ''; for (let i = 0; i < count; i++) h += `<span class="redact" style="width:${(2.2 + r() * 3.2).toFixed(1)}em"></span>`; return h; }
function drawProfile() {
  const box = $('profileBox');
  if (readUnlocked && profileFull && Array.isArray(profileFull.traits) && profileFull.traits.length >= 3) {
    const p = profileFull;
    box.innerHTML = `<div class="profile-head"><h3 class="profile-title display">${escapeHtml(tt('n_profile_title'))}</h3></div>
      <div class="radar-wrap">${radarSvg(p.traits.map(t => t.name), p.traits.map(t => t.score))}</div>
      <div class="profile-rows">
        ${p.keyword ? `<div class="profile-row"><span class="k">${escapeHtml(tt('n_profile_word'))}</span><span class="profile-word">${escapeHtml(p.keyword)}</span></div>` : ''}
        ${p.quote ? `<div class="profile-row"><span class="k">${escapeHtml(tt('n_profile_quote'))}</span><span class="profile-quote">«${escapeHtml(p.quote)}»</span></div>` : ''}
      </div>`;
    box.classList.remove('is-hidden'); return;
  }
  const pv = previewData;
  if (!pv || !Array.isArray(pv.traits) || pv.traits.length < 3) { box.classList.add('is-hidden'); box.innerHTML = ''; return; }
  const words = statsData ? Number(statsData.hiddenWords) || 0 : 0;
  const topIndex = Math.max(0, pv.traits.indexOf(pv.top && pv.top.name));
  const others = pv.traits.length - 1;
  box.innerHTML = `<div class="profile-head"><h3 class="profile-title display">${escapeHtml(tt('n_prev_title'))}</h3><span class="profile-lock-note">${LOCK_SVG}${escapeHtml(tt('n_prev_locked'))}</span></div>
    <div class="radar-wrap">${radarSvg(pv.traits, null, { topIndex, score: Number(pv.top && pv.top.score) || 0 })}</div>
    <p class="profile-others">${escapeHtml(tt('n_prev_other', { k: others }))}</p>
    <div class="profile-rows">
      ${pv.top ? `<div class="profile-row"><span class="k">${escapeHtml(tt('n_prev_top'))}</span><b>${escapeHtml(pv.top.name)}</b> · ${Number(pv.top.score) || 0}%</div>` : ''}
      ${pv.keywordLen ? `<div class="profile-row"><span class="k">${escapeHtml(tt('n_prev_word'))}</span><span class="profile-riddle">${LOCK_SVG}${escapeHtml(tt('n_prev_unlock'))}</span></div>` : ''}
      ${pv.quoteWords ? `<div class="profile-row"><span class="k">${escapeHtml(tt('n_prev_quote'))}</span><span class="profile-riddle">${LOCK_SVG}${escapeHtml(tt('n_prev_unlock'))}</span></div>` : ''}
      ${pv.closingHead ? `<div class="profile-row"><span class="k">${escapeHtml(tt('n_prev_closing_k'))}</span><span class="profile-riddle">${LOCK_SVG}${escapeHtml(tt('n_prev_unlock'))}</span></div>` : ''}
    </div>
    <p class="profile-stats">${escapeHtml(tt('n_prev_stats', { n: chapters.length, w: fmtInt(words), m: Math.max(1, Math.round(words / 200)) }))}</p>`;
  box.classList.remove('is-hidden');
}
function drawChapters() {
  const open = chapters.filter(c => c.text), closed = chapters.filter(c => !c.text);
  $('chapters').innerHTML = open.map(c => `<article class="chapter"><h3 class="chapter-title display">${escapeHtml(c.label)}</h3>${paragraphsHtml(c.text)}</article>`).join('');
  const list = $('lockedList');
  if (!closed.length) { list.innerHTML = ''; list.classList.add('is-hidden'); return; }
  list.classList.remove('is-hidden');
  list.innerHTML = `<p class="locked-intro">${escapeHtml(tt('n_chapters_intro', { n: closed.length }))}</p>` + closed.map((c, i) => `
    <div class="locked-item">
      ${LOCK_SVG.replace('<svg ', '<svg class="lock-ico" ')}
      <div><p class="locked-title display">${escapeHtml(c.label)}<span class="closed-chip">${escapeHtml(tt('n_chapter_closed'))}</span></p>
      <p class="locked-teaser">${escapeHtml(c.hook || c.teaser)}</p>
      <button type="button" class="read-more" data-i="${i}">${escapeHtml(tt('n_open_chapter'))}</button></div>
    </div>`).join('');
  list.querySelectorAll('.read-more').forEach(b => b.addEventListener('click', () => goSeeAll('chapter_' + (Number(b.dataset.i) + 1))));
}
function renderReveal(data, opts) {
  readingId = data.readingId; archetypeNameForShare = data.archetypeName || '';
  chapters = (data.nodes || []).map(n => ({ id: n.id, label: n.label, hook: n.hook, free: !!n.free, words: n.words || 0, teaser: n.teaser || '', text: n.text || null }));
  previewData = data.preview || null; statsData = data.stats || null; profileFull = null;
  readUnlocked = false;
  $('archetypeName').textContent = data.archetypeName || '';
  $('hookLine').textContent = data.hookLine || '';
  $('fullContainer').classList.add('is-hidden');
  drawChapters(); drawProfile();
  // CFG.directPrepay (p. ej. /aptitud/): sin resultado cerrado a la vista; directo a «Esto es lo que recibes».
  if (!CFG.directPrepay || (opts && opts.skipPaywall)) showScreen('reveal');
  setupHelpLinks(data.readingId, data.archetypeName);
  if (opts && opts.skipPaywall) return;
  savePending({ readingId: data.readingId, format: CFG.format, archetypeName: data.archetypeName, hookLine: data.hookLine, nodes: chapters, preview: previewData, stats: statsData });
  track('reveal_shown', { archetypeName: data.archetypeName || '', paywallVersion: PAYWALL_VERSION, hasPreview: !!previewData, totalChapters: chapters.length });
  if (SEALED) showSealed();
  else if (CFG.directPrepay) showPrepay();
}
// Variante sellada: el resultado existe pero no se enseña nada; solo una frase y directo al pago (PayPal).
function showSealed() {
  document.body.classList.add('sealed');
  $('sealedPhrase').textContent = SEALED.phrase || '';
  track('sealed_shown', { paywallVersion: PAYWALL_VERSION });
  showPay();
}
function setupHelpLinks(id, arch) {
  const msg = tt('help_wa_msg', { arch: arch ? ` "${arch}"` : '', id });
  const wa = `https://wa.me/${PAY.whatsapp}?text=${encodeURIComponent(msg)}`;
  const em = `mailto:${PAY.email}?subject=${encodeURIComponent(tt('help_mail_subject'))}&body=${encodeURIComponent(msg)}`;
  [['helpWa', 'wa'], ['helpWa2', 'wa']].forEach(([i]) => { const el = $(i); if (el) { el.href = wa; el.onclick = () => track('contact_whatsapp_clicked', { from: i, paywallVersion: PAYWALL_VERSION }); } });
  [['helpMail'], ['helpMail2']].forEach(([i]) => { const el = $(i); if (el) { el.href = em; el.onclick = () => track('contact_email_clicked', { from: i, paywallVersion: PAYWALL_VERSION }); } });
}

// --- «Ver todo» → motivación → pago ---
let payCfg = null;
async function getPayCfg() {
  if (payCfg) return payCfg;
  try {
    const res = await fetch('/.netlify/functions/qer-paypal-config', { cache: 'no-store' });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.clientId) { payCfg = d; return d; }
  } catch { /* sigue */ }
  return { error: true }; // no se guarda: se reintenta la próxima vez
}
// Precio que se muestra: el del servidor (qer-paypal-config, en dólares) y, si el país tiene otra moneda, su equivalente aproximado.
async function priceInfo() {
  if (!country) country = await detectCountry();
  const cfg = await getPayCfg();
  const usd = Number(cfg.priceUsd) || PAY.usd.amount;
  const amountText = 'US$' + usd.toFixed(2);
  let local = '';
  const cur = COUNTRY_CUR[country];
  if (cur && cur !== 'USD') { const rates = await getRates(); if (rates && rates[cur]) local = money(usd * rates[cur], cur); }
  return { usd, amountText, local, shown: local || amountText, full: local || amountText };
}
function goSeeAll(from) {
  if (currentScreenName !== 'reveal' || readUnlocked) return;
  track('see_all_clicked', { from, paywallVersion: PAYWALL_VERSION });
  showPrepay();
}
async function showPrepay() {
  const closedWords = statsData ? Number(statsData.hiddenWords) || 0 : chapters.reduce((a, c) => a + (c.words || 0), 0);
  const info = await priceInfo();
  $('ppP1').textContent = tt('n_pp_p1', { n: answers.filter(Boolean).length || TOTAL });
  const inc = tt('n_pp_inc');
  $('ppInc').innerHTML = (Array.isArray(inc) ? inc : []).map(x => `<li>${escapeHtml(String(x).split('{c}').join(chapters.length).split('{w}').join(fmtInt(closedWords)))}</li>`).join('');
  $('ppP2').textContent = tt('n_pp_p2', { price: info.full });
  $('ppP3').textContent = tt('n_pp_p3');
  showScreen('prepay');
  track('prepay_shown', { paywallVersion: PAYWALL_VERSION, country, shownAmount: info.shown });
}
$('btnSeeAll').addEventListener('click', () => goSeeAll('cta'));
$('btnPrepayBack').addEventListener('click', () => {
  track('prepay_back', { paywallVersion: PAYWALL_VERSION });
  if (!CFG.directPrepay) { showScreen('reveal'); return; }
  // Sin resultado cerrado al que volver: se muestra la nota de «ahora no» (motivos + volver a ver el informe).
  showPay(); $('payBlock').classList.add('is-hidden'); $('skippedNote').classList.remove('is-hidden');
});
$('btnPrepayGo').addEventListener('click', () => { track('prepay_continue', { paywallVersion: PAYWALL_VERSION }); showPay(); });
function showPay(forceReal) {
  $('paywall').classList.remove('is-hidden');
  $('skippedNote').classList.add('is-hidden'); $('payBlock').classList.remove('is-hidden');
  $('paywallCommitment').textContent = tt('pay_commitment', { n: answers.filter(Boolean).length || TOTAL });
  $('payCovers').textContent = tt('n_pay_covers', { c: chapters.length });
  if (SEALED && SEALED.lead) { const pre = document.querySelector('.paywall-price span'); if (pre) pre.textContent = SEALED.lead; }
  showScreen('pay');
  track('paywall_shown', { archetypeName: archetypeNameForShare, paywallVersion: PAYWALL_VERSION, freeChapters: 0, totalChapters: chapters.length });
  watchPaywallInView();
  if (TEST && !forceReal && !SEALED) {
    $('payIntl').classList.add('is-hidden'); $('payChecking').classList.add('is-hidden');
    $('payTest').classList.remove('is-hidden');
    priceInfo().then(i => { $('priceLabel').textContent = i.shown; });
    return;
  }
  $('payTest').classList.add('is-hidden');
  setupPay(readingId);
}

// --- cobro ---
let payShownAt = 0;
async function setupPay(forReadingId) {
  $('payIntl').classList.add('is-hidden'); $('payChecking').classList.remove('is-hidden');
  const info = await priceInfo();
  $('payChecking').classList.add('is-hidden');
  payShownAt = Date.now();
  $('priceLabel').textContent = info.shown;
  $('paypalNote').textContent = tt('n_pp_note');
  $('payIntl').classList.remove('is-hidden');
  track('paypal_shown', { country, countrySource, method: 'paypal_orders', shownAmount: info.shown, converted: !!info.local, paywallVersion: PAYWALL_VERSION });
  mountPaypal(forReadingId);
}
function loadPaypalSdk(clientId) {
  if (window.paypal && window.paypal.Buttons) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
    sc.onload = () => (window.paypal && window.paypal.Buttons ? resolve() : reject(new Error('sdk')));
    sc.onerror = () => reject(new Error('sdk'));
    document.head.appendChild(sc);
  });
}
// Correo antes de pagar (solo apps con CFG.askEmail, p. ej. /aptitud/): los botones de PayPal quedan desactivados hasta
// que haya un correo válido, y ese correo viaja a la captura para mandar ahí el resultado (además de verse en pantalla).
const EMAIL_KEY = `qer_email_${APP}`;
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
function ensureAskEmail() {
  if (!CFG.askEmail) return null;
  let w = $('askEmailBox');
  if (!w) {
    w = document.createElement('div'); w.id = 'askEmailBox'; w.className = 'ask-email';
    const lb = document.createElement('label'); lb.htmlFor = 'askEmailInput'; lb.className = 'ask-email-label'; lb.textContent = tt('n_ask_email_label');
    const inp = document.createElement('input'); inp.type = 'email'; inp.id = 'askEmailInput'; inp.autocomplete = 'email'; inp.inputMode = 'email'; inp.placeholder = tt('n_email_ph') || 'tu@correo.com';
    try { inp.value = localStorage.getItem(EMAIL_KEY) || ''; } catch { /* ok */ }
    const note = document.createElement('p'); note.className = 'ask-email-note'; note.textContent = tt('n_ask_email_note');
    w.append(lb, inp, note);
    const intl = $('payIntl'); intl.insertBefore(w, intl.firstChild);
  }
  return w;
}
const askedEmail = () => { const i = $('askEmailInput'); const v = i ? i.value.trim() : ''; return validEmail(v) ? v : ''; };
async function mountPaypal(forReadingId) {
  const box = $('paypal-button-container'), msg = $('paypalMsg');
  box.innerHTML = '';
  const say = (key) => { msg.textContent = tt(key); msg.classList.remove('is-hidden'); };
  say('n_pp_loading');
  const cfg = await getPayCfg();
  if (cfg.error) { say('n_pp_error'); track('paypal_config_error', { paywallVersion: PAYWALL_VERSION }); return; }
  try { await loadPaypalSdk(cfg.clientId); } catch { say('n_pp_error'); track('paypal_sdk_error', { paywallVersion: PAYWALL_VERSION }); return; }
  msg.classList.add('is-hidden');
  ensureAskEmail();
  const emailOpts = !CFG.askEmail ? {} : {
    onInit: (data, actions) => {
      const sync = () => { if (askedEmail()) { actions.enable(); if (msg.textContent === tt('n_ask_email_needed')) msg.classList.add('is-hidden'); } else actions.disable(); };
      sync(); const inp = $('askEmailInput'); if (inp) inp.addEventListener('input', sync);
    },
    onClick: () => {
      const e = askedEmail();
      if (!e) { say('n_ask_email_needed'); const inp = $('askEmailInput'); if (inp) inp.focus(); return; }
      try { localStorage.setItem(EMAIL_KEY, e); } catch { /* ok */ }
      track('email_given_before_pay', { paywallVersion: PAYWALL_VERSION });
    }
  };
  const make = (fs, sel, isCard) => {
    const btn = window.paypal.Buttons({
        ...emailOpts,
        fundingSource: fs,
        style: isCard ? { layout: 'vertical', color: 'black', shape: 'pill', label: 'pay', height: 55 } : { layout: 'vertical', color: 'gold', shape: 'pill', label: 'paypal', height: 48 },
      createOrder: async () => {
        track('paypal_button_clicked', { secondsSincePanel: Math.round((Date.now() - payShownAt) / 1000), paywallVersion: PAYWALL_VERSION });
        const d = await postFn('qer-paypal-create-order', { readingId: forReadingId });
        return d.orderID;
      },
      onApprove: async (data) => {
        say('n_pp_paying');
        try {
          const view = await postFn('qer-paypal-capture-order', { orderID: data.orderID, readingId: forReadingId, app: APP, ...(CFG.askEmail && askedEmail() ? { email: askedEmail() } : {}) });
          track('payment_verified_client', { method: 'paypal_orders', country, paywallVersion: PAYWALL_VERSION });
          unlockReading(view);
        } catch (err) { track('payment_capture_failed', { reason: String(err.message).slice(0, 200), paywallVersion: PAYWALL_VERSION }); say('n_pp_failed'); }
      },
      onCancel: () => track('paypal_cancelled', { paywallVersion: PAYWALL_VERSION }),
      onError: (err) => { track('paypal_error', { reason: String(err && err.message || err).slice(0, 200), paywallVersion: PAYWALL_VERSION }); say('n_pp_failed'); }
    });
    if (btn.isEligible()) btn.render(sel); else if (isCard) { $('paypal-card-container').classList.add('is-hidden'); document.querySelector('.card-or').classList.add('is-hidden'); $('cardBox').classList.add('is-hidden'); }
  };
  box.innerHTML = ''; $('paypal-card-container').innerHTML = '';
  make(window.paypal.FUNDING ? window.paypal.FUNDING.CARD : undefined, '#paypal-card-container', true);
  make(window.paypal.FUNDING ? window.paypal.FUNDING.PAYPAL : undefined, '#paypal-button-container', false);
}
// --- lectura abierta ---
const PAID_KEY = `qer_paid_${APP}`;
function readingLink() { return `${location.origin}/${APP}/?r=${encodeURIComponent(readingId)}`; }
function unlockReading(view) {
  unlocking = false; clearPending(); readUnlocked = true; document.body.classList.remove('sealed');
  if (view.readingId) readingId = view.readingId;
  const list = Array.isArray(view.nodes) ? view.nodes : null;
  if (!chapters.length && list) chapters = list.map(n => ({ id: n.id, label: n.label, hook: '', teaser: '', text: n.text }));
  const byId = new Map((list || view.mapTexts || []).map(t => [t.id, t.text]));
  chapters.forEach(c => { if (byId.has(c.id)) c.text = byId.get(c.id); });
  if (view.archetypeName) { archetypeNameForShare = view.archetypeName; $('archetypeName').textContent = view.archetypeName; }
  if (view.hookLine) $('hookLine').textContent = view.hookLine;
  profileFull = view.profile || null;
  $('paywall').classList.add('is-hidden'); $('skippedNote').classList.add('is-hidden');
  drawChapters(); drawProfile();
  $('closingLine').textContent = view.closingLine || '';
  // entrega: correo al que se envió (PayPal) + enlace propio + formulario para pedir otra copia
  const sent = $('emailedLine');
  if (view.emailedTo) { sent.textContent = tt('n_emailed', { email: view.emailedTo }); sent.classList.remove('is-hidden'); } else sent.classList.add('is-hidden');
  $('btnCopyLink').textContent = tt('n_copy_link');
  $('btnCopyLink').onclick = async () => { try { await navigator.clipboard.writeText(readingLink()); $('btnCopyLink').textContent = tt('n_link_copied'); } catch { prompt(tt('n_copy_link'), readingLink()); } };
  $('emailTitle').textContent = tt('n_email_title'); $('emailInput').placeholder = tt('n_email_ph'); $('emailBtn').textContent = tt('n_email_btn');
  if (view.payerEmail && !$('emailInput').value) $('emailInput').value = view.payerEmail;
  $('emailMsg').classList.add('is-hidden');
  $('fullContainer').classList.remove('is-hidden');
  if (!TEST) {
    try { localStorage.setItem(PAID_KEY, JSON.stringify({ readingId, savedAt: Date.now() })); } catch { /* ok */ }
    try { history.replaceState(null, '', `${location.pathname}?r=${encodeURIComponent(readingId)}`); } catch { /* ok */ }
  }
  showScreen('reveal');
}
$('emailForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('emailInput').value.trim(), msg = $('emailMsg');
  const say = (t) => { msg.textContent = t; msg.classList.remove('is-hidden'); };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { say(tt('n_email_bad')); return; }
  $('emailBtn').disabled = true; say(tt('n_email_sending'));
  try {
    const d = await postFn('qer-email-reading', { readingId, email, app: APP });
    track('email_copy_requested', { ok: !!d.ok, paywallVersion: PAYWALL_VERSION });
    say(d.ok ? tt('n_email_sent', { email }) : tt('n_email_fail'));
  } catch { say(tt('n_email_fail')); }
  $('emailBtn').disabled = false;
});

// --- saltar el pago, motivos ---
$('btnSkipPaywall').addEventListener('click', () => { track('paywall_skipped', { paywallVersion: PAYWALL_VERSION }); $('payBlock').classList.add('is-hidden'); $('skippedNote').classList.remove('is-hidden'); });
$('btnShowPay').addEventListener('click', () => { track('paywall_reopened', { paywallVersion: PAYWALL_VERSION }); $('skippedNote').classList.add('is-hidden'); $('payBlock').classList.remove('is-hidden'); });
document.querySelectorAll('.skip-reason').forEach(btn => btn.addEventListener('click', () => {
  track('paywall_skip_reason', { reason: btn.dataset.reason, paywallVersion: PAYWALL_VERSION });
  $('skipReasonBox').classList.add('is-hidden'); $('skipReasonThanks').classList.remove('is-hidden');
}));

// --- vista del paywall y salida ---
let paywallObserver = null, paywallSeen = false, scrollMaxPct = 0;
function watchPaywallInView() {
  paywallSeen = false;
  if (paywallObserver) paywallObserver.disconnect();
  if (!('IntersectionObserver' in window)) return;
  paywallObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting) && !paywallSeen) {
      paywallSeen = true;
      track('paywall_in_view', { secondsSinceLoad: Math.round((Date.now() - pageStartedAt) / 1000), paywallVersion: PAYWALL_VERSION });
      paywallObserver.disconnect();
    }
  }, { threshold: 0.4 });
  paywallObserver.observe($('paywall'));
}
window.addEventListener('scroll', () => {
  if (currentScreenName !== 'reveal') return;
  const h = document.documentElement.scrollHeight - window.innerHeight;
  if (h > 0) scrollMaxPct = Math.max(scrollMaxPct, Math.round((window.scrollY / h) * 100));
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (TEST || document.visibilityState !== 'hidden') return;
  try {
    const payload = { event: 'page_hidden', anonId, app: APP, metadata: { variant: 'paid', screen: currentScreenName, seconds: Math.round((Date.now() - pageStartedAt) / 1000), paywallSeen, scrollMaxPct, questionsAnswered: answers.filter(Boolean).length, unlocked: readUnlocked, country } };
    navigator.sendBeacon('/.netlify/functions/qer-track-event', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  } catch { /* ok */ }
});

function restartQuiz() {
  currentIndex = 0; answers.fill(null); readingId = null; chapters = []; unlocking = false;
  readUnlocked = false; previewData = null; statsData = null; profileFull = null;
  clearPending(); clearQuizProgress();
  if (!TEST) { try { localStorage.removeItem(PAID_KEY); } catch { /* ok */ } try { history.replaceState(null, '', location.pathname); } catch { /* ok */ } }
  track('quiz_started', { restart: true });
  renderQuestion(0); showScreen('quiz');
}
$('btnRestart').addEventListener('click', restartQuiz);
$('btnRestartFromSkip').addEventListener('click', restartQuiz);

// --- retomar: lectura pagada (enlace ?r= o guardada en este dispositivo) o lectura pendiente sin pagar ---
async function resumePaidIfAny() {
  let id = null;
  try { const r = new URLSearchParams(location.search).get('r'); if (r && /^[0-9a-f-]{36}$/i.test(r)) id = r; } catch { /* sigue */ }
  if (!id) { try { const p = JSON.parse(localStorage.getItem(PAID_KEY) || 'null'); if (p && p.readingId) id = p.readingId; } catch { /* sigue */ } }
  if (!id) return false;
  try {
    const data = await postFn('qer-get-reading', { readingId: id });
    if (data.paid && (data.nodes || data.mapTexts)) {
      readingId = id; track('paid_reading_reopened', { paywallVersion: PAYWALL_VERSION });
      setupHelpLinks(id, data.archetypeName);
      unlockReading(data); return true;
    }
  } catch { /* sin conexión o ya no existe */ }
  return false;
}
async function resumePendingIfAny() {
  if (await resumePaidIfAny()) return;
  const pending = loadPending();
  if (!pending || !Array.isArray(pending.nodes) || pending.format !== CFG.format) return;
  try {
    const data = await postFn('qer-get-reading', { readingId: pending.readingId });
    if (data.paid && (data.nodes || data.mapTexts)) { readingId = pending.readingId; unlockReading(data); return; }
  } catch { /* sin conexión o expirada */ }
  track('reading_resumed', { paywallVersion: PAYWALL_VERSION });
  renderReveal(pending);
}
if (TEST) {
  const bn = document.createElement('div'); bn.className = 'test-banner'; bn.textContent = tt('n_test_banner'); document.body.appendChild(bn);
  const to = (window.QER_TEST && window.QER_TEST.ownerEmail) || 'bonillapretiz@gmail.com';
  $('btnTestSend').addEventListener('click', async () => {
    const msg = $('testMsg'); $('btnTestSend').disabled = true; msg.textContent = tt('n_test_sending'); msg.classList.remove('is-hidden');
    try {
      const d = await postFn('qer-owner-send', { readingId, app: APP, key: TEST.key || '' });
      if (d.ok) msg.textContent = tt('n_test_sent', { email: d.to || to }); else msg.textContent = tt('n_test_fail', { reason: d.reason || 'error' });
      if (d.unlocked) unlockReading(d.unlocked);
    } catch (err) { msg.textContent = tt('n_test_fail', { reason: String(err.message).slice(0, 120) }); }
    $('btnTestSend').disabled = false;
  });
  $('btnTestReal').addEventListener('click', () => showPay(true));
  (TEST.answers || []).forEach((a, i) => { if (i < TOTAL) answers[i] = a; });
  submitQuiz();
} else {
  resumePendingIfAny();
}

// --- compartir ---
$('btnShare').addEventListener('click', async () => {
  const text = archetypeNameForShare ? tt('share_text_arch', { arch: archetypeNameForShare }) : tt('share_text_generic');
  const url = location.origin + '/' + APP + '/';
  track('share_clicked', {});
  try { if (navigator.share) { await navigator.share({ title: tt('share_title'), text, url }); return; } } catch { /* canceló */ }
  try { await navigator.clipboard.writeText(`${text} ${url}`); alert(tt('copied')); } catch { alert(url); }
});
})();
