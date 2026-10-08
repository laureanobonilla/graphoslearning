// ==========================================
// Cliente compartido de las 4 apps de pago: quien-eres, who-are-you, quien-es-tu-pareja, who-is-your-partner.
// Todo lo que cambia entre apps (idioma, preguntas, textos, formato de lectura) viene de window.QER_CFG (config.js
// de cada carpeta); el cobro viene de window.QER_PAY (/qer-shared/qer-pay-config.js).
// Cobro: Costa Rica → SINPE Móvil + foto del comprobante (cualquier imagen desbloquea); resto del mundo → botón de
// PayPal (US$2, España 2 €) con el monto mostrado en moneda local; tocar el botón desbloquea (sin redirección).
// Cada paso se registra en `events` (app = quien-eres | who-are-you | quien-es-tu-pareja | who-is-your-partner).
// ==========================================
(function () {
'use strict';
const CFG = window.QER_CFG, PAY = window.QER_PAY;
const APP = CFG.app, QUESTIONS = CFG.questions, TOTAL = QUESTIONS.length;
const PAYWALL_VERSION = 'paid1';
const $ = (id) => document.getElementById(id);

// --- textos ---
function tt(key, vars) {
  let s = CFG.t[key];
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
  try {
    fetch('/.netlify/functions/qer-track-event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: eventName, anonId, app: APP, metadata: { ...(metadata || {}), variant: 'paid', lang: CFG.lang, kind: CFG.kind, ...(eventName === 'landing_viewed' ? utm : {}) } })
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
const COUNTRY_CUR = { US: 'USD', EC: 'USD', SV: 'USD', PA: 'USD', PR: 'USD', CA: 'CAD', MX: 'MXN', CO: 'COP', PE: 'PEN', CL: 'CLP', AR: 'ARS', UY: 'UYU', BO: 'BOB', PY: 'PYG', VE: 'VES', GT: 'GTQ', HN: 'HNL', NI: 'NIO', DO: 'DOP', CU: 'CUP', BR: 'BRL', GB: 'GBP', IE: 'EUR', ES: 'EUR', FR: 'EUR', DE: 'EUR', IT: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', AU: 'AUD', NZ: 'NZD', JP: 'JPY', KR: 'KRW', CN: 'CNY', IN: 'INR', SG: 'SGD', HK: 'HKD', PH: 'PHP', TH: 'THB', MY: 'MYR', ID: 'IDR', VN: 'VND', AE: 'AED', SA: 'SAR', IL: 'ILS', TR: 'TRY', ZA: 'ZAR', NG: 'NGN', EG: 'EGP', MA: 'MAD', KE: 'KES' };
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
  try {
    const big = amount >= 100;
    return new Intl.NumberFormat(CFG.locale, { style: 'currency', currency: cur, currencyDisplay: cur === 'USD' && CFG.lang === 'es' ? 'code' : 'symbol', maximumFractionDigits: big ? 0 : 2, minimumFractionDigits: big ? 0 : 2 }).format(amount).replace(/ /g, ' ');
  } catch { return `${amount.toFixed(2)} ${cur}`; }
}
const usdText = () => (CFG.lang === 'es' ? 'US$' : 'US$') + PAY.usd.amount.toFixed(2);
const eurText = () => PAY.eur.amount.toFixed(2).replace('.', CFG.lang === 'es' ? ',' : '.') + (CFG.lang === 'es' ? ' €' : ' EUR');
const crcText = () => '₡' + PAY.sinpe.amountCRC.toLocaleString('de-DE');

// --- navegación ---
let currentScreenName = 'cover';
function showScreen(name) {
  currentScreenName = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  $(`screen-${name}`).classList.add('is-active');
  $('progress').classList.toggle('is-hidden', name !== 'quiz');
  const shell = document.querySelector('.shell'); if (shell) shell.classList.toggle('is-reveal', name === 'reveal');
  window.scrollTo(0, 0);
}

// --- estado ---
let currentIndex = 0;
const answers = new Array(TOTAL).fill(null);
let readingId = null, archetypeNameForShare = '', chapters = [], readUnlocked = false;

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
    const known = existing && q.options.includes(existing);
    const isOther = existing && !known;
    const mk = (label, other) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'option' + (other ? ' is-other' : '');
      b.dataset.other = other ? '1' : '';
      const dot = document.createElement('span'); dot.className = 'dot'; const sp = document.createElement('span'); sp.textContent = label;
      b.append(dot, sp); return b;
    };
    q.options.forEach(opt => {
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
function drawChapters() {
  const open = chapters.filter(c => c.text), closed = chapters.filter(c => !c.text);
  $('chapters').innerHTML = open.map(c => `<article class="chapter"><h3 class="chapter-title display">${escapeHtml(c.label)}</h3>${paragraphsHtml(c.text)}</article>`).join('');
  const list = $('lockedList');
  if (!closed.length) { list.innerHTML = ''; list.classList.add('is-hidden'); return; }
  list.classList.remove('is-hidden');
  list.innerHTML = `<p class="locked-intro">${escapeHtml(tt('locked_intro'))}</p>` + closed.map(c => `
    <div class="locked-item">
      <svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
      <div><p class="locked-title display">${escapeHtml(c.label)}</p><p class="locked-hook">${escapeHtml(c.hook)}</p>
      <p class="locked-words">${c.words ? escapeHtml(tt('words', { n: fmtInt(c.words) })) : ''}</p></div>
    </div>`).join('');
}
function renderReveal(data, opts) {
  readingId = data.readingId; archetypeNameForShare = data.archetypeName || '';
  chapters = (data.nodes || []).map(n => ({ id: n.id, label: n.label, hook: n.hook, free: !!n.free, words: n.words || 0, text: n.text || null }));
  readUnlocked = false;
  $('archetypeName').textContent = data.archetypeName || '';
  $('hookLine').textContent = data.hookLine || '';
  $('paywallCommitment').textContent = tt('pay_commitment', { n: TOTAL });
  const closed = chapters.filter(c => !c.text).length;
  $('paywallHook').textContent = closed ? tt('pay_hook', { n: closed }) : tt('pay_hook_none');
  $('skippedNote').classList.add('is-hidden'); $('payBlock').classList.remove('is-hidden'); $('fullContainer').classList.add('is-hidden');
  drawChapters(); showScreen('reveal');
  setupHelpLinks(data.readingId, data.archetypeName);
  if (opts && opts.skipPaywall) { $('paywall').classList.add('is-hidden'); return; }
  savePending({ readingId: data.readingId, format: CFG.format, archetypeName: data.archetypeName, hookLine: data.hookLine, nodes: chapters });
  $('paywall').classList.remove('is-hidden');
  track('paywall_shown', { archetypeName: data.archetypeName || '', paywallVersion: PAYWALL_VERSION, freeChapters: chapters.filter(c => c.text).length, totalChapters: chapters.length });
  watchPaywallInView();
  setupPay(data.readingId);
}
function setupHelpLinks(id, arch) {
  const msg = tt('help_wa_msg', { arch: arch ? ` "${arch}"` : '', id });
  const wa = `https://wa.me/${PAY.whatsapp}?text=${encodeURIComponent(msg)}`;
  const em = `mailto:${PAY.email}?subject=${encodeURIComponent(tt('help_mail_subject'))}&body=${encodeURIComponent(msg)}`;
  [['helpWa', 'wa'], ['helpWa2', 'wa']].forEach(([i]) => { const el = $(i); if (el) { el.href = wa; el.onclick = () => track('contact_whatsapp_clicked', { from: i, paywallVersion: PAYWALL_VERSION }); } });
  [['helpMail'], ['helpMail2']].forEach(([i]) => { const el = $(i); if (el) { el.href = em; el.onclick = () => track('contact_email_clicked', { from: i, paywallVersion: PAYWALL_VERSION }); } });
}

// --- cobro ---
let payShownAt = 0, sinpeAttempts = 0, phoneCopied = false, unlocking = false;
async function setupPay(forReadingId) {
  $('payCR').classList.add('is-hidden'); $('payIntl').classList.add('is-hidden'); $('payChecking').classList.remove('is-hidden');
  if (!country) country = await detectCountry();
  $('payChecking').classList.add('is-hidden');
  const isCR = country === 'CR';
  const isEUR = !isCR && PAY.eurCountries.includes(country);
  payShownAt = Date.now(); sinpeAttempts = 0; phoneCopied = false;
  const method = isCR ? 'sinpe_photo' : (isEUR ? 'paypal_eur' : 'paypal_usd');
  if (isCR) {
    $('priceLabel').textContent = crcText();
    $('sinpeStep1').textContent = tt('sinpe_step1', { amount: crcText(), phone: PAY.sinpe.phone });
    $('payCR').classList.remove('is-hidden');
    $('btnCopyPhone').onclick = async () => {
      phoneCopied = true;
      try { await navigator.clipboard.writeText(PAY.sinpe.phone.replace(/\D/g, '')); } catch { /* ok */ }
      $('btnCopyPhone').textContent = tt('sinpe_copied');
      track('sinpe_phone_copied', { paywallVersion: PAYWALL_VERSION });
    };
    $('btnSinpeUpload').onclick = () => { track('sinpe_upload_clicked', { paywallVersion: PAYWALL_VERSION }); $('sinpeFile').click(); };
    $('sinpeFile').onchange = (ev) => onSinpeFile(ev.target.files && ev.target.files[0], forReadingId);
    track('sinpe_shown', { country, countrySource, paywallVersion: PAYWALL_VERSION });
  } else {
    let shownAmount, local = '';
    if (isEUR) { shownAmount = eurText(); }
    else {
      shownAmount = usdText();
      const cur = COUNTRY_CUR[country];
      if (cur && cur !== 'USD') {
        const rates = await getRates();
        if (rates && rates[cur]) local = money(PAY.usd.amount * rates[cur], cur);
      }
    }
    const shown = local || shownAmount;
    $('priceLabel').textContent = shown;
    $('btnPaypal').textContent = local ? tt('paypal_btn_local', { local }) : tt('paypal_btn_plain', { amount: shownAmount });
    $('paypalNote').textContent = local ? tt('paypal_note_local', { amount: shownAmount, local }) : tt('paypal_note_plain', { amount: shownAmount });
    $('paypalMsg').classList.add('is-hidden');
    $('payIntl').classList.remove('is-hidden');
    $('btnPaypal').onclick = () => onPaypalClick(forReadingId, method, shown);
    track('paypal_shown', { country, countrySource, method, shownAmount: shown, converted: !!local, linkConfigured: !!(isEUR ? PAY.eur.link : PAY.usd.link), paywallVersion: PAYWALL_VERSION });
  }
}
function imageInfo(file) {
  return new Promise(resolve => {
    try {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => { const o = { w: img.naturalWidth, h: img.naturalHeight }; URL.revokeObjectURL(url); resolve(o); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ w: 0, h: 0, unreadable: true }); };
      img.src = url;
    } catch { resolve({}); }
  });
}
async function onSinpeFile(file, forReadingId) {
  const msg = $('sinpeMsg'); msg.classList.add('is-hidden');
  if (!file || unlocking) return;
  sinpeAttempts++;
  const info = await imageInfo(file);
  const evidence = {
    attempt: sinpeAttempts, secondsSincePanel: Math.round((Date.now() - payShownAt) / 1000), copiedPhone: phoneCopied,
    type: file.type || '', size: file.size, name: String(file.name || '').slice(0, 60),
    ageMin: file.lastModified ? Math.round((Date.now() - file.lastModified) / 60000) : null,
    w: info.w || 0, h: info.h || 0, unreadable: !!info.unreadable
  };
  if (!/^image\//.test(file.type || '') || info.unreadable) {
    track('sinpe_file_rejected', { ...evidence, paywallVersion: PAYWALL_VERSION });
    msg.textContent = tt('sinpe_bad_file'); msg.classList.remove('is-hidden'); $('sinpeFile').value = ''; return;
  }
  track('sinpe_photo_selected', { ...evidence, paywallVersion: PAYWALL_VERSION });
  $('btnSinpeUpload').disabled = true; msg.textContent = tt('sinpe_receiving'); msg.classList.remove('is-hidden');
  await new Promise(r => setTimeout(r, 1200));
  const ok = await doUnlock(forReadingId, 'sinpe_photo', crcText(), evidence);
  if (!ok) { $('btnSinpeUpload').disabled = false; msg.textContent = tt('unlock_error'); }
}
async function onPaypalClick(forReadingId, method, shown) {
  if (unlocking) return;
  const link = method === 'paypal_eur' ? PAY.eur.link : PAY.usd.link;
  const msg = $('paypalMsg');
  const evidence = { secondsSincePanel: Math.round((Date.now() - payShownAt) / 1000), country, method, shown };
  if (!link) {
    track('paypal_link_missing', { ...evidence, paywallVersion: PAYWALL_VERSION });
    msg.textContent = tt('paypal_unavailable'); msg.classList.remove('is-hidden'); return;
  }
  const win = window.open(link, '_blank');
  if (!win) {
    track('paypal_popup_blocked', { ...evidence, paywallVersion: PAYWALL_VERSION });
    msg.textContent = tt('paypal_blocked'); msg.classList.remove('is-hidden'); return;
  }
  try { win.opener = null; } catch { /* ok */ }
  track('paypal_link_clicked', { ...evidence, paywallVersion: PAYWALL_VERSION });
  msg.textContent = tt('paypal_opened'); msg.classList.remove('is-hidden');
  const ok = await doUnlock(forReadingId, method, shown, evidence);
  if (!ok) msg.textContent = tt('unlock_error');
}
async function doUnlock(forReadingId, method, shown, evidence) {
  unlocking = true;
  try {
    const data = await postWithOneRetry('qer-unlock', { readingId: forReadingId, method, app: APP, clientCountry: country || '', shownAmount: shown, evidence });
    if (data.paid && data.mapTexts) {
      track('payment_unlocked_client', { method, country, paywallVersion: PAYWALL_VERSION });
      unlockReading(data); return true;
    }
  } catch (err) { track('unlock_failed', { method, reason: String(err.message).slice(0, 200), paywallVersion: PAYWALL_VERSION }); }
  unlocking = false; return false;
}
function unlockReading({ mapTexts, closingLine }) {
  unlocking = false; clearPending(); readUnlocked = true;
  const byId = new Map((mapTexts || []).map(t => [t.id, t.text]));
  chapters.forEach(c => { if (byId.has(c.id)) c.text = byId.get(c.id); });
  $('paywall').classList.add('is-hidden'); $('skippedNote').classList.add('is-hidden');
  const before = chapters.filter(c => c.text).length;
  drawChapters();
  $('closingLine').textContent = closingLine || '';
  $('fullContainer').classList.remove('is-hidden');
  const firstNew = document.querySelectorAll('#chapters .chapter')[CFG.freeCount];
  setTimeout(() => (firstNew || $('chapters')).scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  void before;
}

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
  if (document.visibilityState !== 'hidden') return;
  try {
    const payload = { event: 'page_hidden', anonId, app: APP, metadata: { variant: 'paid', screen: currentScreenName, seconds: Math.round((Date.now() - pageStartedAt) / 1000), paywallSeen, scrollMaxPct, questionsAnswered: answers.filter(Boolean).length, unlocked: readUnlocked, country } };
    navigator.sendBeacon('/.netlify/functions/qer-track-event', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  } catch { /* ok */ }
});

function restartQuiz() {
  currentIndex = 0; answers.fill(null); readingId = null; chapters = []; unlocking = false;
  clearPending(); clearQuizProgress();
  track('quiz_started', { restart: true });
  renderQuestion(0); showScreen('quiz');
}
$('btnRestart').addEventListener('click', restartQuiz);
$('btnRestartFromSkip').addEventListener('click', restartQuiz);

// --- retomar una lectura pendiente ---
async function resumePendingIfAny() {
  const pending = loadPending();
  if (!pending || !Array.isArray(pending.nodes) || pending.format !== CFG.format) return;
  try {
    const data = await postFn('qer-get-reading', { readingId: pending.readingId });
    if (data.paid && data.mapTexts) {
      renderReveal(pending, { skipPaywall: true });
      unlockReading({ mapTexts: data.mapTexts, closingLine: data.closingLine });
      return;
    }
  } catch { /* sin conexión o expirada */ }
  track('reading_resumed', { paywallVersion: PAYWALL_VERSION });
  renderReveal(pending);
}
resumePendingIfAny();

// --- compartir ---
$('btnShare').addEventListener('click', async () => {
  const text = archetypeNameForShare ? tt('share_text_arch', { arch: archetypeNameForShare }) : tt('share_text_generic');
  const url = location.origin + '/' + APP + '/';
  track('share_clicked', {});
  try { if (navigator.share) { await navigator.share({ title: tt('share_title'), text, url }); return; } } catch { /* canceló */ }
  try { await navigator.clipboard.writeText(`${text} ${url}`); alert(tt('copied')); } catch { alert(url); }
});
})();
