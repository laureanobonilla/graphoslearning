// "A song for your partner" (EN): la persona que compra responde 15 preguntas de elegir sobre SU PAREJA (varias a la vez,
// "ninguna" o escribir lo propio) → la letra de una canción para regalarle (la canta quien regala, con el nombre de la pareja)
// → oferta de que esa letra SUENE (muestra cantada por WhatsApp; el precio se habla después de que la oiga).
// Comparte funciones con "Si fueras una canción" (sfc-*, con kind:'pareja') pero tiene sus propias claves de localStorage
// y su propio `app` de eventos ('pareja-cancion'). Los eventos NO llevan el nombre, el texto ni las opciones elegidas.
'use strict';

const TRACK_URL = '/.netlify/functions/sfc-track-event';
const APP_NAME = 'couple-song';
const NAME_RE = /^[\p{L}][\p{L} '’-]{0,29}$/u;
let partner = '';
const fill = (t) => String(t).replace(/\{n\}/g, partner || 'your partner');

// --- Preguntas ---------------------------------------------------------------------------------
// {n} = nombre de la pareja. type 'multi': 8 opciones [emoji|color, texto(, estilo)]; type 'open': texto libre opcional.
const COLOR_OPTS = [
  { color: '#d9402b', t: 'Ember red' }, { color: '#2b3a9e', t: 'Midnight blue' }, { color: '#f5b800', t: 'Mango yellow' },
  { color: '#1f8a5b', t: 'Forest green' }, { color: '#f07aa4', t: 'Sunset pink' }, { color: '#7d8aa0', t: 'Rain gray' },
  { color: '#f2802e', t: 'Bonfire orange' }, { color: '#7a4fd0', t: 'Storm violet' }
];
const QUESTIONS = [
  { id: 'q1', type: 'multi', prompt: 'Sunday afternoon with {n}. What are you two doing?', opts: [
    ['🛋️', 'Glued to the couch, going nowhere'], ['🍳', 'Cooking something together (and making a mess)'], ['🚗', 'Driving with no destination'], ['🎬', 'Binge-watching a show or movie'],
    ['🌳', 'Taking a slow walk'], ['🛌', 'Napping'], ['🎶', 'Music on, each doing our own thing'], ['🍦', 'Heading out for something delicious'] ] },
  { id: 'q2', type: 'multi', prompt: 'When something goes wrong, {n}’s first move is…', opts: [
    ['😂', 'Laughing at how absurd it is'], ['🤐', 'Going quiet and overthinking it'], ['📝', 'Making a plan to fix it'], ['😤', 'Getting mad (and getting over it fast)'],
    ['📞', 'Calling someone'], ['😭', 'Crying a little, then moving on'], ['🙃', 'Pretending it didn’t happen'], ['🫂', 'Coming to find you'] ] },
  { id: 'q3', type: 'multi', prompt: 'Something about {n} you’d recognize with your eyes closed', opts: [
    ['🗣️', 'Their laugh'], ['🚶', 'Their footsteps coming'], ['🔑', 'Keys in the door'], ['🎤', 'When they sing or hum'],
    ['😴', 'Their breathing as they sleep'], ['📱', 'The sound of their texts'], ['🍳', 'The way they move in the kitchen'], ['💬', 'How they say your name'] ] },
  { id: 'q4', type: 'multi', prompt: '{n} smells like…', opts: [
    ['☕', 'Coffee'], ['🧼', 'Clean laundry'], ['🌸', 'Their signature scent'], ['🌊', 'Ocean and salt'],
    ['🍞', 'Something fresh-baked'], ['🌱', 'Rain on the ground'], ['🧴', 'Their soap or lotion'], ['🏡', 'Home'] ] },
  { id: 'q5', type: 'multi', prompt: 'If {n}’s song were made of colors, which ones?', colors: true, opts: COLOR_OPTS.map(c => [c.color, c.t]) },
  { id: 'q6', type: 'multi', prompt: 'What {n} has a little too much of…', opts: [
    ['❤️', 'Heart'], ['⚡', 'Energy'], ['🧠', 'Brain: overthinks everything'], ['😄', 'Laughter'],
    ['🔥', 'Attitude'], ['🌿', 'Calm'], ['🔍', 'Curiosity'], ['💡', 'Ideas'] ] },
  { id: 'q7', type: 'multi', prompt: 'Something {n} does that drives you crazy… lovingly', opts: [
    ['⏰', 'Loses track of time and runs late'], ['📱', 'Phone always on the table'], ['🧦', 'The mess'], ['🔊', 'Talking or singing too loud'],
    ['🤔', 'Takes forever to decide'], ['🍽️', 'Steals food off your plate'], ['🛏️', 'Hogs all the blankets'], ['😴', 'Falls asleep anywhere'] ] },
  { id: 'q8', type: 'multi', prompt: 'A place that belongs to the two of you', opts: [
    ['🏡', 'Our home'], ['🏖️', 'A beach'], ['🌳', 'A park or a town square'], ['🍽️', 'A restaurant or a little café'],
    ['🚗', 'The car'], ['✈️', 'A place from a trip'], ['🛣️', 'A road you always take'], ['🌍', 'A place you haven’t been yet'] ] },
  { id: 'q9', type: 'multi', prompt: 'When {n} hears the song, what do you want them to feel?', opts: [
    ['🥹', 'Tenderness, with a lump in the throat'], ['😆', 'Laughter'], ['💃', 'Like dancing'], ['😌', 'Calm'],
    ['💪', 'That they can count on you'], ['🌅', 'Hope for what’s coming'], ['🍂', 'Sweet nostalgia for everything lived'], ['❤️', 'That they mean everything to you'] ] },
  { id: 'q10', type: 'multi', prompt: 'What’s the rhythm of your story?', opts: [
    ['🎹', 'A piano ballad', 'Soft ballad'], ['🎉', 'Upbeat pop', 'Pop'], ['🪕', 'Just guitar and a voice, intimate', 'Acoustic'],
    ['🤘', 'Rock with heart, minus the screaming', 'Soft rock'], ['🤠', 'A little country, honest and warm', 'Country'], ['🌃', 'Smooth R&B for late nights', 'R&B / Soul'],
    ['🎷', 'A warm jazz standard', 'Jazz'], ['🎲', 'A bit of everything: surprise me', 'Surprise me'] ] },
  { id: 'q11', type: 'multi', prompt: 'How did you two meet?', opts: [
    ['👀', 'A look across the room'], ['👯', 'Through mutual friends'], ['💻', 'Online or on an app'], ['💼', 'At work or school'],
    ['🎉', 'At a party'], ['🏫', 'We’ve known each other for years'], ['🍀', 'Pure chance'], ['📍', 'Somewhere very special'] ] },
  { id: 'q12', type: 'multi', prompt: 'Something {n} always does or says', opts: [
    ['🗨️', 'A phrase they repeat'], ['🫶', 'Hugs you from behind'], ['🎶', 'Sings badly on purpose'], ['🍫', 'Saves you the last bite'],
    ['💌', 'Leaves notes or messages'], ['😂', 'Makes the same joke every time'], ['🧣', 'Looks after you: “bundle up”'], ['🌙', 'Says “get some rest” at night'] ] },
  { id: 'q13', type: 'multi', prompt: 'Being with {n} gives you…', opts: [
    ['🏠', 'A feeling of home'], ['🪶', 'Lightness'], ['🚀', 'Courage to try things'], ['🕊️', 'Peace'],
    ['😂', 'Easy laughter'], ['🛡️', 'Safety'], ['✨', 'Butterflies'], ['🫶', 'The urge to take care of them'] ] },
  { id: 'q14', type: 'multi', prompt: 'If you could tell {n} something you don’t say enough, it would be…', opts: [
    ['🙏', '“Thank you for being here”'], ['🌱', '“I’m a better person with you”'], ['🩹', '“I’m sorry for the times I fall short”'], ['💍', '“I’d choose you again”'],
    ['😍', '“I love who you are”'], ['🧭', '“Don’t ever change”'], ['🚀', '“We’re going to make it”'], ['❤️', '“I love you, even if I don’t say it enough”'] ] },
  { id: 'q15', type: 'open', prompt: 'To finish: a phrase, a nickname, or an inside joke only the two of you get',
    placeholder: 'For example: what you call each other, what you say when you part, that made-up word…',
    why: 'Optional. If you write it, it goes into the song almost word for word.' }
];
const TOTAL = QUESTIONS.length;
const MAX_OTHER = 140;

// --- Estado ------------------------------------------------------------------------------------
const state = QUESTIONS.map(() => ({ picks: [], none: false, other: '' }));   // picks = índices elegidos
let currentIndex = 0;
let song = null;            // { songId, title, subtitle, style, lyrics, colors, suggested }
let currentScreen = 'cover';
let questionShownAt = Date.now();

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';

// --- Eventos (sin texto de la persona) ------------------------------------------------------------
const ANON_KEY = 'ct_anon_id';
function ensureAnonId() {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(ANON_KEY, id); }
    return id;
  } catch { return `volatile-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
const anonId = ensureAnonId();
// Campaña de anuncios: ?utm_campaign=... y ?utm_content=... (o ?c= / ?ad=) se guardan la primera vez y viajan en cada evento.
const UTM = (function () {
  const clean = (v) => String(v || '').replace(/[^\w.\-]/g, '').slice(0, 40);
  try {
    const q = new URLSearchParams(location.search), k = APP_NAME + '_utm';
    const c = clean(q.get('utm_campaign') || q.get('c')), a = clean(q.get('utm_content') || q.get('ad'));
    if (c || a) { const v = { campaign: c, ad: a }; localStorage.setItem(k, JSON.stringify(v)); return v; }
    const old = JSON.parse(localStorage.getItem(k) || 'null');
    return old && typeof old === 'object' ? { campaign: clean(old.campaign), ad: clean(old.ad) } : { campaign: '', ad: '' };
  } catch { return { campaign: '', ad: '' }; }
})();
function track(event, metadata) {
  try {
    fetch(TRACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ event, anonId, app: APP_NAME, metadata: Object.assign({}, metadata || {}, UTM.campaign ? { campaign: UTM.campaign } : {}, UTM.ad ? { ad: UTM.ad } : {}) }) }).catch(() => {});
  } catch { /* no crítico */ }
}
track('landing_viewed', {
  referrer: document.referrer ? document.referrer.slice(0, 200) : null,
  likelyBot: /bot|crawl|spider|facebookexternalhit|whatsapp|preview|slackbot|embedly|discordbot/i.test(navigator.userAgent)
});

// --- Guardado local: avance del cuestionario y canción lista ------------------------------------------
const PROGRESS_KEY = 'ct_progress_v1', SONG_KEY = 'ct_song_v1';
const PROGRESS_MAX_AGE = 3 * 24 * 3600 * 1000, SONG_MAX_AGE = 71 * 3600 * 1000;
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* no crítico */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* no crítico */ } };
const hasContent = (s) => s.picks.length > 0 || s.other.trim().length > 0;
const answeredCount = () => state.filter(hasContent).length;   // cuenta respuestas con contenido ("ninguna" no cuenta)
function saveProgress(next) { lsSet(PROGRESS_KEY, { state, currentIndex: next === undefined ? currentIndex : next, partner, savedAt: Date.now() }); }   // next = la pregunta en que retomar
function loadProgress() {
  const p = lsGet(PROGRESS_KEY);
  if (!p || !NAME_RE.test(String(p.partner || '')) || !Array.isArray(p.state) || p.state.length !== TOTAL || Date.now() - (p.savedAt || 0) > PROGRESS_MAX_AGE) return null;
  const cleaned = p.state.map((s, i) => ({
    picks: Array.isArray(s.picks) ? s.picks.filter(n => Number.isInteger(n) && QUESTIONS[i].opts && n >= 0 && n < QUESTIONS[i].opts.length) : [],
    none: !!s.none, other: String(s.other || '').slice(0, MAX_OTHER)
  }));
  const done = cleaned.filter((s) => s.picks.length || s.none || s.other).length;
  return done > 0 && p.currentIndex > 0 && p.currentIndex < TOTAL ? { state: cleaned, currentIndex: p.currentIndex, partner: p.partner } : null;
}

// --- Pantallas --------------------------------------------------------------------------------------
function showScreen(name) {
  currentScreen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  $(`screen-${name}`).classList.add('is-active');
  $('shell').classList.toggle('is-reveal', name === 'reveal');
  window.scrollTo(0, 0);
}

// --- Ondas (portada, carga y reproductor) ---------------------------------------------------------------
function waveHeights(n, seed) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = Math.abs(Math.sin(i * 0.52 + seed) + 0.65 * Math.sin(i * 1.31 + seed * 1.7) + 0.35 * Math.sin(i * 2.9 + seed));
    out.push(Math.max(0.12, Math.min(1, v / 1.9)));
  }
  return out;
}
function buildBars(svg, n, w, h, barW, seed, fill) {
  const gap = (w - n * barW) / (n - 1);
  waveHeights(n, seed).forEach((p, i) => {
    const bh = Math.max(4, p * h), r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', (i * (barW + gap)).toFixed(2)); r.setAttribute('y', ((h - bh) / 2).toFixed(2));
    r.setAttribute('width', barW); r.setAttribute('height', bh.toFixed(2)); r.setAttribute('rx', barW / 2);
    if (fill) r.setAttribute('fill', fill);
    r.style.setProperty('--i', i);
    svg.appendChild(r);
  });
}
(function drawCover() {
  const svg = $('coverWave');
  const defs = document.createElementNS(SVGNS, 'defs');
  defs.innerHTML = '<linearGradient id="coverGrad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#e0246a"/><stop offset="1" stop-color="#ffbf2e"/></linearGradient>';
  svg.appendChild(defs);
  buildBars(svg, 48, 320, 92, 4.2, 1.3, 'url(#coverGrad)');
  const load = $('loadWave');
  for (let i = 0; i < 9; i++) {
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', i * 17); r.setAttribute('y', 4); r.setAttribute('width', 8); r.setAttribute('height', 56); r.setAttribute('rx', 4);
    r.style.setProperty('--i', i); load.appendChild(r);
  }
  const pw = $('playerWave');
  buildBars(pw, 38, 220, 34, 3, 4.1, null);
})();

// --- Preguntas ----------------------------------------------------------------------------------------
const qPrompt = $('qPrompt'), qHint = $('qHint'), qBody = $('qBody'), btnNext = $('btnNext'), btnBack = $('btnBack');
function isAnswered(i) {
  const q = QUESTIONS[i], s = state[i];
  return q.type === 'open' ? true : (s.picks.length > 0 || s.none || s.other.trim().length > 0);
}
function renderQuestion(i) {
  currentIndex = i;
  questionShownAt = Date.now();
  const q = QUESTIONS[i], s = state[i];
  qPrompt.textContent = fill(q.prompt);
  qHint.textContent = q.type === 'open' ? '' : 'Pick all that fit. If none do, say so or write your own.';
  qHint.classList.toggle('is-hidden', q.type === 'open');
  $('count').textContent = `${i + 1} of ${TOTAL}`;
  $('fill').style.width = `${(i / TOTAL) * 100}%`;
  btnBack.classList.toggle('is-hidden', i === 0);
  btnNext.textContent = i === TOTAL - 1 ? `Write ${partner}’s song` : 'Next';
  qBody.textContent = '';

  if (q.type === 'open') {
    const wrap = document.createElement('div'); wrap.className = 'open-area';
    const ta = document.createElement('textarea');
    ta.maxLength = MAX_OTHER; ta.rows = 3; ta.placeholder = q.placeholder; ta.value = s.other; ta.setAttribute('aria-label', fill(q.prompt));
    ta.addEventListener('input', () => { s.other = ta.value; });
    const why = document.createElement('p'); why.className = 'why'; why.textContent = q.why;
    wrap.append(ta, why); qBody.appendChild(wrap);
    updateNext();
    return;
  }

  const list = document.createElement('div'); list.className = 'opts'; list.setAttribute('role', 'group'); list.setAttribute('aria-label', fill(q.prompt));
  const buttons = [];
  q.opts.forEach((o, idx) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opt'; b.setAttribute('role', 'checkbox');
    b.setAttribute('aria-checked', s.picks.includes(idx) ? 'true' : 'false');
    const mark = document.createElement('span'); mark.className = 'mark'; mark.textContent = '✓'; mark.setAttribute('aria-hidden', 'true');
    let lead;
    if (q.colors) { lead = document.createElement('span'); lead.className = 'sw'; lead.style.background = o[0]; }
    else { lead = document.createElement('span'); lead.className = 'emo'; lead.textContent = o[0]; }
    lead.setAttribute('aria-hidden', 'true');
    const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = o[1];
    b.append(mark, lead, lbl);
    b.addEventListener('click', () => {
      const at = s.picks.indexOf(idx);
      if (at >= 0) s.picks.splice(at, 1); else { s.picks.push(idx); s.none = false; }
      none.setAttribute('aria-checked', s.none ? 'true' : 'false');
      b.setAttribute('aria-checked', s.picks.includes(idx) ? 'true' : 'false');
      updateNext();
    });
    buttons.push(b); list.appendChild(b);
  });
  const none = document.createElement('button');
  none.type = 'button'; none.className = 'opt opt-none'; none.setAttribute('role', 'checkbox');
  none.setAttribute('aria-checked', s.none ? 'true' : 'false');
  const nm = document.createElement('span'); nm.className = 'mark'; nm.textContent = '✓'; nm.setAttribute('aria-hidden', 'true');
  const nl = document.createElement('span'); nl.className = 'lbl'; nl.textContent = 'None of these fit';
  none.append(nm, nl);
  none.addEventListener('click', () => {
    s.none = !s.none;
    if (s.none) { s.picks = []; buttons.forEach(b => b.setAttribute('aria-checked', 'false')); }
    none.setAttribute('aria-checked', s.none ? 'true' : 'false');
    updateNext();
  });
  list.appendChild(none);
  qBody.appendChild(list);

  const own = document.createElement('div'); own.className = 'write-own';
  const openBtn = document.createElement('button'); openBtn.type = 'button'; openBtn.className = 'btn-quiet'; openBtn.textContent = '+ Write my own';
  const ta = document.createElement('textarea');
  ta.maxLength = MAX_OTHER; ta.rows = 2; ta.placeholder = 'Write it in your own words'; ta.setAttribute('aria-label', 'Your own answer'); ta.value = s.other;
  ta.classList.toggle('is-hidden', !s.other); openBtn.classList.toggle('is-hidden', !!s.other);
  openBtn.addEventListener('click', () => {
    openBtn.classList.add('is-hidden'); ta.classList.remove('is-hidden'); ta.focus();
    track('write_own_opened', { questionId: q.id });
    try { ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_e) { /* no crítico */ }
  });
  ta.addEventListener('input', () => { s.other = ta.value; updateNext(); });
  own.append(openBtn, ta); qBody.appendChild(own);
  updateNext();
}
function updateNext() { btnNext.disabled = !isAnswered(currentIndex); }

function leaveQuestion(i) {
  const q = QUESTIONS[i], s = state[i];
  if (!isAnswered(i) && q.type !== 'open') return;
  track('question_answered', {
    questionId: q.id, questionIndex: i + 1, questionType: q.type, picks: s.picks.length, usedNone: !!s.none,
    wrote: s.other.trim().length > 0, seconds: Math.min(600, Math.round((Date.now() - questionShownAt) / 1000))
  });
}
btnNext.addEventListener('click', () => {
  if (btnNext.disabled) return;
  leaveQuestion(currentIndex);
  if (currentIndex < TOTAL - 1) { saveProgress(currentIndex + 1); renderQuestion(currentIndex + 1); window.scrollTo(0, 0); }
  else submitQuiz();
});
btnBack.addEventListener('click', () => { if (currentIndex > 0) { renderQuestion(currentIndex - 1); window.scrollTo(0, 0); } });

// --- Inicio / retomar -----------------------------------------------------------------------------------
function resetState() { state.forEach(s => { s.picks = []; s.none = false; s.other = ''; }); }
function startFresh() {
  lsDel(PROGRESS_KEY); lsDel(SONG_KEY); resetState(); song = null;
  const inp = $('partnerName'); inp.value = partner = '';
  $('btnName').disabled = true; $('nameError').classList.add('is-hidden');
  track('quiz_started', {});
  showScreen('name');
  try { inp.focus(); } catch (_e) { /* no crítico */ }
}
const nameInput = $('partnerName'), btnName = $('btnName');
nameInput.addEventListener('input', () => {
  const v = nameInput.value.replace(/\s+/g, ' ').trim();
  btnName.disabled = !NAME_RE.test(v);
  $('nameError').classList.toggle('is-hidden', !v || NAME_RE.test(v));
});
function submitName() {
  const v = nameInput.value.replace(/\s+/g, ' ').trim();
  if (!NAME_RE.test(v)) { $('nameError').classList.remove('is-hidden'); return; }
  partner = v;
  track('name_entered', {});
  saveProgress();
  renderQuestion(0); showScreen('quiz');
}
btnName.addEventListener('click', submitName);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitName(); } });
const saved = loadProgress();
if (saved) {
  // Si hay un avance guardado, el botón principal es CONTINUAR (un botón secundario perdía el avance si tocaban "Empezar").
  $('btnStart').textContent = `Continue with ${saved.partner} (question ${saved.currentIndex + 1} of ${TOTAL})`;
  $('coverCont').classList.remove('is-hidden');
  $('btnStart').addEventListener('click', () => {
    track('quiz_resumed', { fromIndex: saved.currentIndex + 1 });
    partner = saved.partner;
    saved.state.forEach((s, i) => { state[i] = s; });
    renderQuestion(Math.min(saved.currentIndex, TOTAL - 1)); showScreen('quiz');
  });
  $('btnRestartCover').addEventListener('click', startFresh);
} else {
  $('btnStart').addEventListener('click', startFresh);
}

// --- Enviar y generar ---------------------------------------------------------------------------------------
const LOADING_STEPS = () => [`Thinking about ${partner}…`, 'Finding the chorus…', 'Rhyming their little quirks…', 'Almost there…'];
async function postFn(name, payload) {
  const res = await fetch(`/.netlify/functions/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data;
}
function buildAnswers() {
  return QUESTIONS.map((q, i) => {
    const s = state[i];
    return { q: fill(q.prompt), picks: (q.opts || []).filter((_, idx) => s.picks.includes(idx)).map(o => o[1]), other: s.other.trim(), none: !!s.none };
  });
}
function derivedFromAnswers() {
  const colorQ = QUESTIONS.findIndex(q => q.colors), styleQ = QUESTIONS.findIndex(q => q.id === 'q10');
  const colors = state[colorQ].picks.map(idx => QUESTIONS[colorQ].opts[idx][0]);
  const styles = state[styleQ].picks.map(idx => QUESTIONS[styleQ].opts[idx][2]).filter(Boolean);
  const real = styles.filter(s => s !== 'Surprise me');
  return { colors, suggested: real[0] || null };
}
let loadTimer = null;
async function submitQuiz() {
  lsSet(PROGRESS_KEY, { state, currentIndex: TOTAL - 1, partner, savedAt: Date.now() });
  track('quiz_submitted', { answered: answeredCount() });
  showScreen('loading');
  let step = 0; $('loadLabel').textContent = LOADING_STEPS()[0];
  clearInterval(loadTimer); loadTimer = setInterval(() => { step = Math.min(step + 1, 3); $('loadLabel').textContent = LOADING_STEPS()[step]; }, 4500);
  const t0 = Date.now();
  try {
    const data = await postFn('sfc-generate-song', { anonId, kind: 'couple', lang: 'en', partner, answers: buildAnswers() });
    clearInterval(loadTimer);
    const d = derivedFromAnswers();
    song = { partner, songId: data.songId, title: data.title, subtitle: data.subtitle, style: data.style, lyrics: data.lyrics, colors: d.colors.slice(0, 2), suggested: d.suggested || data.style };
    track('song_generated', { seconds: Math.round((Date.now() - t0) / 1000) });
    lsDel(PROGRESS_KEY);
    lsSet(SONG_KEY, { ...song, savedAt: Date.now() });
    renderReveal();
  } catch (err) {
    clearInterval(loadTimer);
    track('song_generate_failed', { status: err.status || 0, seconds: Math.round((Date.now() - t0) / 1000) });
    $('errorMsg').textContent = err.status === 429 ? 'You made several songs in a row' : 'We couldn’t write the song';
    $('errorDetail').textContent = err.status === 429 ? err.message : 'Your answers are still saved. Please try again in a moment.';
    showScreen('error');
  }
}
$('btnRetry').addEventListener('click', submitQuiz);

// --- La letra -----------------------------------------------------------------------------------------------------
function parseLyrics(text) {
  const parts = []; let cur = null;
  String(text).split(/\r?\n/).forEach(raw => {
    const line = raw.trim(); if (!line) return;
    const m = line.match(/^\[(.+?)\]$/);
    if (m) { cur = { label: m[1].trim(), lines: [] }; parts.push(cur); }
    else { if (!cur) { cur = { label: '', lines: [] }; parts.push(cur); } cur.lines.push(line); }
  });
  return parts;
}
function renderSheet(lyrics) {
  const sheet = $('sheet'); sheet.textContent = '';
  const seenChorus = [];
  parseLyrics(lyrics).forEach(p => {
    const sec = document.createElement('section'); sec.className = 'part';
    const isChorus = /^(chorus|estribillo)/i.test(p.label);
    if (isChorus) sec.classList.add('chorus');
    const key = p.lines.join('|').toLowerCase();
    if (isChorus && seenChorus.includes(key)) sec.classList.add('again'); else if (isChorus) seenChorus.push(key);
    if (p.label) { const h = document.createElement('h4'); h.textContent = p.label; sec.appendChild(h); }
    p.lines.forEach(l => { const d = document.createElement('p'); d.className = 'ln'; d.textContent = l; sec.appendChild(d); });
    sheet.appendChild(sec);
  });
}
let rendered = false, scrollMaxPct = 0, songSeen = false;
function renderReveal() {
  const root = document.documentElement;
  const [c1, c2] = [song.colors[0] || '#e0246a', song.colors[1] || song.colors[0] || '#ffbf2e'];
  root.style.setProperty('--c1', c1); root.style.setProperty('--c2', c2);
  $('wg1').setAttribute('stop-color', c1); $('wg2').setAttribute('stop-color', c2);
  $('songTitle').textContent = song.title;
  $('songSub').textContent = song.subtitle || '';
  $('playerNote').textContent = '';
  $('nextStepText').textContent = `It doesn’t sound yet. The best part is still to come: music and a real voice, so you can give it to ${song.partner || 'your partner'}.`;
  renderSheet(song.lyrics);
  document.title = `${song.title} · A song for your partner`;
  showScreen('reveal');
  rendered = true;
  track('song_shown', { style: song.style, words: song.lyrics.split(/\s+/).length });
  setupSongOffer();
}

// Reproductor mudo: la letra está lista pero todavía no suena. Tocarlo lo explica y abre la oferta.
$('playBtn').addEventListener('click', () => {
  track('player_tapped', {});
  const w = $('playerWave'); w.classList.remove('is-try'); void w.getBoundingClientRect(); w.classList.add('is-try');
  const n = $('playerNote'); n.textContent = '';
  const b = document.createElement('b'); b.textContent = 'It doesn’t sound yet. '; n.append(b, 'The lyrics are ready; it still needs a voice.');
  openSongOffer(true);
});
$('btnNextStep').addEventListener('click', () => { track('next_step_clicked', {}); openSongOffer(true); });

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}
$('btnCopy').addEventListener('click', async () => {
  const ok = await copyText(`${song.title}\n\n${song.lyrics}`);
  track('copy_lyrics', { ok });
  $('btnCopy').textContent = ok ? 'Copied' : 'Couldn’t copy';
  setTimeout(() => { $('btnCopy').textContent = 'Copy lyrics'; }, 1800);
});
$('btnShare').addEventListener('click', async () => {
  track('share_clicked', {});
  const url = location.origin + '/couple-song/';
  const text = 'I made a song for my partner from these questions. Make one for yours:';
  try { if (navigator.share) { await navigator.share({ title: song.title, text, url }); return; } } catch { /* canceló */ }
  const ok = await copyText(`${text} ${url}`);
  $('btnShare').textContent = ok ? 'Link copied' : url;
  setTimeout(() => { $('btnShare').textContent = 'Share'; }, 2200);
});
$('btnRestart').addEventListener('click', () => { track('restart_clicked', {}); document.title = 'A song for your partner'; startFresh(); });

// --- Oferta: que la canción suene --------------------------------------------------------------------------------
// En el celular el teclado se dibuja ENCIMA de la página sin empujar lo fijo: se mide lo realmente visible y se sube la hoja.
let vvBound = false;
function bindViewportFit(box) {
  const vv = window.visualViewport;
  if (!vv || vvBound) return;
  vvBound = true;
  const fit = () => {
    if (window.matchMedia('(min-width: 960px)').matches) { box.style.bottom = ''; box.style.maxHeight = ''; box.classList.remove('kb-open'); return; }
    const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    box.style.bottom = covered ? covered + 'px' : '';
    box.style.maxHeight = covered ? Math.round(vv.height * 0.94) + 'px' : '';
    box.classList.toggle('kb-open', covered > 80);
    if (covered > 80) { const el = document.activeElement; if (el && box.contains(el)) { try { el.scrollIntoView({ block: 'center' }); } catch (_e) { /* no crítico */ } } }
  };
  vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
}

let songStyle = 'Surprise me', songObserver = null, offerApi = null;
function openSongOffer(fromUser) {
  const box = $('songOffer');
  if (!box || box.classList.contains('is-hidden')) return;
  if (offerApi) offerApi.open();
  if (fromUser) {
    box.classList.remove('is-flash'); void box.offsetWidth; box.classList.add('is-flash');
    if (window.matchMedia('(min-width: 960px)').matches) { try { box.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_e) { /* no crítico */ } }
  }
}
function setupSongOffer() {
  const box = $('songOffer');
  box.classList.remove('is-hidden', 'is-open', 'is-flash');
  bindViewportFit(box);
  const teaser = $('songTeaser'), form = $('songForm'), done = $('songDone'), err = $('songError'), send = $('btnSongSend');
  teaser.classList.remove('is-hidden'); form.classList.add('is-hidden'); done.classList.add('is-hidden');
  err.classList.add('is-hidden'); send.disabled = false; send.textContent = 'Send me the sample';
  $('songOfferTitle').textContent = `You have the lyrics. Now let’s hear them for ${song.partner || 'your partner'}.`;
  $('songTeaserText').textContent = `I’ll make a sung sample of “${song.title}” so you can listen. If you love it, we finish it and you give it to ${song.partner || 'your partner'}. No obligation: we only talk price after you’ve heard it.`;

  songStyle = song.suggested || 'Surprise me';
  const sug = $('songSuggest');
  if (song.suggested && song.suggested !== 'Surprise me') { sug.textContent = `From what you told us, it fits: ${song.suggested}.`; sug.classList.remove('is-hidden'); } else sug.classList.add('is-hidden');
  box.querySelectorAll('.song-chip').forEach(chip => {
    chip.setAttribute('aria-pressed', chip.dataset.style === songStyle ? 'true' : 'false');
    chip.onclick = () => {
      songStyle = chip.dataset.style;
      box.querySelectorAll('.song-chip').forEach(c => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
      track('song_style_chosen', { style: songStyle });
    };
  });

    const emailIn = $('songEmail'); emailIn.value = '';
  const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,200}\.[^\s@<>]{2,}$/;

  const wide = () => window.matchMedia('(min-width: 960px)').matches;
  const open = () => { teaser.classList.add('is-hidden'); if (done.classList.contains('is-hidden')) form.classList.remove('is-hidden'); box.classList.add('is-open'); box.scrollTop = 0; };
  offerApi = { open: () => { if (form.classList.contains('is-hidden') && done.classList.contains('is-hidden')) { track('song_cta_clicked', {}); open(); } else { box.classList.remove('is-hidden'); box.classList.add('is-open'); } } };
  $('btnSongOpen').onclick = () => { track('song_cta_clicked', {}); open(); };   // sin enfocar campos: si el teclado se abre solo, tapa el formulario
  const closeBtn = $('songClose');
  closeBtn.onclick = () => {
    track('song_closed', { done: !done.classList.contains('is-hidden') });
    if (!done.classList.contains('is-hidden')) { box.classList.add('is-hidden'); return; }
    box.classList.remove('is-open'); form.classList.add('is-hidden'); teaser.classList.remove('is-hidden');
  };
  try { if (wide()) { teaser.classList.add('is-hidden'); form.classList.remove('is-hidden'); } } catch (_e) { /* no crítico */ }

  const fail = (t) => { err.textContent = t; err.classList.remove('is-hidden'); };
  form.onsubmit = async (ev) => {
    ev.preventDefault(); err.classList.add('is-hidden');
    const email = emailIn.value.trim();
    if (!EMAIL_RE.test(email) || email.length > 120) {
      const reason = !email ? 'empty' : !email.includes('@') ? 'no_at' : !/@[^\s@]+\.[^\s@]{2,}$/.test(email) ? 'no_domain' : email.length > 120 ? 'long' : 'format';
      track('song_email_invalid', { reason, len: email.length });
      fail(reason === 'empty' ? 'Add your email so we can send you the sample, for example name@gmail.com.' : reason === 'no_at' ? 'Your email is missing the @, for example name@gmail.com.' : reason === 'no_domain' ? 'Your email looks incomplete after the @, for example name@gmail.com.' : 'Please check your email address.');
      emailIn.focus(); return;
    }
    send.disabled = true; send.textContent = 'Sending…';
    track('song_request_submitted', { style: songStyle });
    try {
      const data = await postFn('sfc-song-request', { songId: song.songId, style: songStyle, email, lang: 'en', consent: true });
      if (!data.ok) throw new Error('failed');
      track('song_request_confirmed', { style: songStyle, songId: song.songId });
      $('songDoneText').textContent = `Thank you! I’ll email you at ${email} with a sung sample of “${song.title}” for ${song.partner || 'your partner'}. Keep an eye on your inbox (and your spam folder, just in case).`;
      form.classList.add('is-hidden'); done.classList.remove('is-hidden'); box.classList.add('is-open');
      try { done.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_e) { /* no crítico */ }
    } catch (e) {
      track('song_request_failed', { status: e.status || 0 });
      fail(e.status ? (e.message || 'We couldn’t register your request. Please try again.') : 'No connection. Please try again.');
      send.disabled = false; send.textContent = 'Send me the sample';
    }
  };

  track('song_offer_shown', {});
  try {
    if (songObserver) songObserver.disconnect();
    songObserver = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting && e.intersectionRatio >= 0.5)) { track('song_offer_in_view', {}); songSeen = true; songObserver.disconnect(); }
    }, { threshold: 0.5 });
    songObserver.observe(box);
  } catch (_e) { /* no crítico */ }
}

// --- Medición al salir ---------------------------------------------------------------------------------------------------
const pageStartedAt = Date.now();
window.addEventListener('scroll', () => {
  if (currentScreen !== 'reveal') return;
  const h = document.documentElement.scrollHeight - window.innerHeight;
  if (h > 0) scrollMaxPct = Math.max(scrollMaxPct, Math.round((window.scrollY / h) * 100));
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  try {
    const payload = { event: 'page_hidden', anonId, metadata: { screen: currentScreen, seconds: Math.round((Date.now() - pageStartedAt) / 1000), songSeen, scrollMaxPct, questionsAnswered: answeredCount() } };
    navigator.sendBeacon(TRACK_URL, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  } catch { /* no crítico */ }
});

// --- Si ya había una canción lista (recarga), se muestra de nuevo ----------------------------------------------------
(function resumeSong() {
  const s = lsGet(SONG_KEY);
  if (!s || !s.songId || !s.lyrics || !s.title || Date.now() - (s.savedAt || 0) > SONG_MAX_AGE) { lsDel(SONG_KEY); return; }
  song = { partner: NAME_RE.test(String(s.partner || '')) ? s.partner : '', songId: s.songId, title: s.title, subtitle: s.subtitle || '', style: s.style, lyrics: s.lyrics, colors: Array.isArray(s.colors) ? s.colors.slice(0, 2) : [], suggested: s.suggested || s.style };
  renderReveal();
})();
