// "Si tu pareja fuera una canción": la persona que compra responde 15 preguntas de elegir sobre SU PAREJA (varias a la vez,
// "ninguna" o escribir lo propio) → la letra de una canción para regalarle (la canta quien regala, con el nombre de la pareja)
// → oferta de que esa letra SUENE (muestra cantada por WhatsApp; el precio se habla después de que la oiga).
// Comparte funciones con "Si fueras una canción" (sfc-*, con kind:'pareja') pero tiene sus propias claves de localStorage
// y su propio `app` de eventos ('pareja-cancion'). Los eventos NO llevan el nombre, el texto ni las opciones elegidas.
'use strict';

const CONTACT_WHATSAPP = '50687772993';
const TRACK_URL = '/.netlify/functions/sfc-track-event';
const APP_NAME = 'pareja-cancion';
const NAME_RE = /^[\p{L}][\p{L} '’-]{0,29}$/u;
let partner = '';
const fill = (t) => String(t).replace(/\{n\}/g, partner || 'tu pareja');

// --- Preguntas ---------------------------------------------------------------------------------
// {n} = nombre de la pareja. type 'multi': 8 opciones [emoji|color, texto(, estilo)]; type 'open': texto libre opcional.
const COLOR_OPTS = [
  { color: '#d9402b', t: 'Rojo brasa' }, { color: '#2b3a9e', t: 'Azul medianoche' }, { color: '#f5b800', t: 'Amarillo mango' },
  { color: '#1f8a5b', t: 'Verde selva' }, { color: '#f07aa4', t: 'Rosa atardecer' }, { color: '#7d8aa0', t: 'Gris lluvia' },
  { color: '#f2802e', t: 'Naranja fogata' }, { color: '#7a4fd0', t: 'Violeta tormenta' }
];
const QUESTIONS = [
  { id: 'q1', type: 'multi', prompt: 'Domingo por la tarde con {n}. ¿Qué están haciendo?', opts: [
    ['🛋️', 'Pegados al sofá, sin salir'], ['🍳', 'Cocinando algo juntos (y ensuciando todo)'], ['🚗', 'Manejando sin rumbo'], ['🎬', 'Maratón de series o películas'],
    ['🌳', 'Paseando sin prisa'], ['🛌', 'Durmiendo la siesta'], ['🎶', 'Con música puesta, cada quien en lo suyo'], ['🍦', 'Saliendo por algo rico'] ] },
  { id: 'q2', type: 'multi', prompt: 'Cuando a {n} algo le sale mal, lo primero que hace es…', opts: [
    ['😂', 'Reírse de lo absurdo'], ['🤐', 'Quedarse en silencio, dándole vueltas'], ['📝', 'Hacer un plan para arreglarlo'], ['😤', 'Enojarse (y que se le pase rápido)'],
    ['📞', 'Llamar a alguien'], ['😭', 'Llorar un rato y seguir'], ['🙃', 'Fingir que no pasó'], ['🫂', 'Buscarte a ti'] ] },
  { id: 'q3', type: 'multi', prompt: 'Algo de {n} que reconocerías con los ojos cerrados', opts: [
    ['🗣️', 'Su risa'], ['🚶', 'Sus pasos llegando'], ['🔑', 'Las llaves en la puerta'], ['🎤', 'Cuando canta o tararea'],
    ['😴', 'Su respiración al dormir'], ['📱', 'El sonido de sus mensajes'], ['🍳', 'Cómo se mueve en la cocina'], ['💬', 'Cómo dice tu nombre'] ] },
  { id: 'q4', type: 'multi', prompt: '{n} huele a…', opts: [
    ['☕', 'Café'], ['🧼', 'Ropa limpia'], ['🌸', 'Su perfume de siempre'], ['🌊', 'Mar y sal'],
    ['🍞', 'Algo recién hecho'], ['🌱', 'Tierra mojada'], ['🧴', 'Su jabón o su crema'], ['🏡', 'A casa'] ] },
  { id: 'q5', type: 'multi', prompt: 'Si la canción de {n} fuera de colores, ¿de cuáles?', colors: true, opts: COLOR_OPTS.map(c => [c.color, c.t]) },
  { id: 'q6', type: 'multi', prompt: 'Lo que {n} tiene de más…', opts: [
    ['❤️', 'Corazón'], ['⚡', 'Energía'], ['🧠', 'Cabeza: piensa demasiado'], ['😄', 'Risa'],
    ['🔥', 'Carácter'], ['🌿', 'Calma'], ['🔍', 'Curiosidad'], ['💡', 'Ideas'] ] },
  { id: 'q7', type: 'multi', prompt: 'Algo de {n} que te saca de quicio… con cariño', opts: [
    ['⏰', 'Se le pasa la hora y llega tarde'], ['📱', 'El teléfono siempre en la mesa'], ['🧦', 'El desorden'], ['🔊', 'Hablar o cantar muy alto'],
    ['🤔', 'Tarda una eternidad en decidir'], ['🍽️', 'Roba comida de tu plato'], ['🛏️', 'Se queda con todas las cobijas'], ['😴', 'Se duerme en cualquier lado'] ] },
  { id: 'q8', type: 'multi', prompt: 'Un lugar que es de ustedes', opts: [
    ['🏡', 'Nuestra casa'], ['🏖️', 'Una playa'], ['🌳', 'Un parque o una plaza'], ['🍽️', 'Un restaurante o un cafecito'],
    ['🚗', 'El carro'], ['✈️', 'Un lugar de un viaje'], ['🛣️', 'Una calle que recorren siempre'], ['🌍', 'Uno al que todavía no van'] ] },
  { id: 'q9', type: 'multi', prompt: 'Cuando {n} escuche la canción, ¿qué quieres que sienta?', opts: [
    ['🥹', 'Ternura, con un nudo en la garganta'], ['😆', 'Risa'], ['💃', 'Ganas de bailar'], ['😌', 'Calma'],
    ['💪', 'Que puede contar contigo'], ['🌅', 'Esperanza por lo que viene'], ['🍂', 'Nostalgia dulce de lo vivido'], ['❤️', 'Que lo es todo para ti'] ] },
  { id: 'q10', type: 'multi', prompt: '¿Qué ritmo tiene la historia de ustedes?', opts: [
    ['🌹', 'Un bolero lento, de los de antes', 'Bolero'], ['🎹', 'Una balada con piano', 'Balada suave'], ['🎉', 'Un pop alegre', 'Pop'],
    ['🪕', 'Guitarra y voz, íntimo', 'Acústica'], ['🤘', 'Rock con ganas, pero sin gritar tanto', 'Rock suave'], ['🌃', 'Un ritmo urbano de noche', 'Urbano suave'],
    ['🪘', 'Una cumbia que no deja sentarse', 'Cumbia'], ['🎲', 'Un poco de todo: sorpréndeme', 'Sorpréndeme'] ] },
  { id: 'q11', type: 'multi', prompt: '¿Cómo se conocieron?', opts: [
    ['👀', 'Con un cruce de miradas'], ['👯', 'Por amigos en común'], ['💻', 'Por internet o una app'], ['💼', 'En el trabajo o el estudio'],
    ['🎉', 'En una fiesta'], ['🏫', 'Se conocen desde hace muchos años'], ['🍀', 'Por pura casualidad'], ['📍', 'En un lugar muy especial'] ] },
  { id: 'q12', type: 'multi', prompt: 'Algo que {n} hace o dice siempre', opts: [
    ['🗨️', 'Una frase que repite'], ['🫶', 'Te abraza por la espalda'], ['🎶', 'Canta mal a propósito'], ['🍫', 'Te guarda un pedacito de lo rico'],
    ['💌', 'Deja notas o mensajes'], ['😂', 'Hace siempre la misma broma'], ['🧣', 'Te cuida de todo: «abrígate»'], ['🌙', 'Te dice «descansa» por la noche'] ] },
  { id: 'q13', type: 'multi', prompt: 'Estar con {n} te da…', opts: [
    ['🏠', 'Sensación de hogar'], ['🪶', 'Ligereza'], ['🚀', 'Ganas de intentarlo'], ['🕊️', 'Paz'],
    ['😂', 'Risa fácil'], ['🛡️', 'Seguridad'], ['✨', 'Ilusión'], ['🫶', 'Ganas de cuidar'] ] },
  { id: 'q14', type: 'multi', prompt: 'Si pudieras decirle a {n} algo que a veces no dices, sería…', opts: [
    ['🙏', '«Gracias por estar»'], ['🌱', '«Contigo soy mejor»'], ['🩹', '«Perdón por las veces que fallo»'], ['💍', '«Te elegiría otra vez»'],
    ['😍', '«Me encanta cómo eres»'], ['🧭', '«No cambies»'], ['🚀', '«Vamos a lograrlo»'], ['❤️', '«Te quiero, aunque no lo diga tanto»'] ] },
  { id: 'q15', type: 'open', prompt: 'Para terminar: una frase, un apodo o un chiste que solo ustedes entienden',
    placeholder: 'Por ejemplo: cómo le dices de cariño, lo que se dicen al despedirse, esa palabra inventada…',
    why: 'Es opcional. Si la escribes, va casi tal cual en la canción.' }
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
const ANON_KEY = 'pc_anon_id';
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
const PROGRESS_KEY = 'pc_progress_v1', SONG_KEY = 'pc_song_v1';
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
  qHint.textContent = q.type === 'open' ? '' : 'Elige todas las que quieras. Si ninguna calza, dilo o escribe la tuya.';
  qHint.classList.toggle('is-hidden', q.type === 'open');
  $('count').textContent = `${i + 1} de ${TOTAL}`;
  $('fill').style.width = `${(i / TOTAL) * 100}%`;
  btnBack.classList.toggle('is-hidden', i === 0);
  btnNext.textContent = i === TOTAL - 1 ? `Escribir la canción de ${partner}` : 'Siguiente';
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
  const nl = document.createElement('span'); nl.className = 'lbl'; nl.textContent = 'Ninguna de estas me calza';
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
  const openBtn = document.createElement('button'); openBtn.type = 'button'; openBtn.className = 'btn-quiet'; openBtn.textContent = '+ Escribir la mía';
  const ta = document.createElement('textarea');
  ta.maxLength = MAX_OTHER; ta.rows = 2; ta.placeholder = 'Escríbela con tus palabras'; ta.setAttribute('aria-label', 'Tu propia respuesta'); ta.value = s.other;
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
  $('btnStart').textContent = `Continuar con ${saved.partner} (pregunta ${saved.currentIndex + 1} de ${TOTAL})`;
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
const LOADING_STEPS = () => [`Pensando en ${partner}…`, 'Buscando el estribillo…', 'Rimando sus manías…', 'Casi lista…'];
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
  const real = styles.filter(s => s !== 'Sorpréndeme');
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
    const data = await postFn('sfc-generate-song', { anonId, kind: 'pareja', partner, answers: buildAnswers() });
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
    $('errorMsg').textContent = err.status === 429 ? 'Hiciste varias canciones seguidas' : 'No pudimos escribir la canción';
    $('errorDetail').textContent = err.status === 429 ? err.message : 'Tus respuestas siguen guardadas. Inténtalo de nuevo en un momento.';
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
    const isChorus = /^estribillo/i.test(p.label);
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
  $('nextStepText').textContent = `Todavía no suena. Falta lo mejor: ponerle música y voz para que se la des a ${song.partner || 'tu pareja'}.`;
  renderSheet(song.lyrics);
  document.title = `${song.title} · Si tu pareja fuera una canción`;
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
  const b = document.createElement('b'); b.textContent = 'Todavía no suena. '; n.append(b, 'La letra está lista; falta cantarla.');
  openSongOffer(true);
});
$('btnNextStep').addEventListener('click', () => { track('next_step_clicked', {}); openSongOffer(true); });

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}
$('btnCopy').addEventListener('click', async () => {
  const ok = await copyText(`${song.title}\n\n${song.lyrics}`);
  track('copy_lyrics', { ok });
  $('btnCopy').textContent = ok ? 'Copiada' : 'No se pudo copiar';
  setTimeout(() => { $('btnCopy').textContent = 'Copiar letra'; }, 1800);
});
$('btnShare').addEventListener('click', async () => {
  track('share_clicked', {});
  const url = location.origin + '/pareja-cancion/';
  const text = 'Hice una canción para mi pareja con estas preguntas. Haz la de la tuya:';
  try { if (navigator.share) { await navigator.share({ title: song.title, text, url }); return; } } catch { /* canceló */ }
  const ok = await copyText(`${text} ${url}`);
  $('btnShare').textContent = ok ? 'Enlace copiado' : url;
  setTimeout(() => { $('btnShare').textContent = 'Compartir'; }, 2200);
});
$('btnRestart').addEventListener('click', () => { track('restart_clicked', {}); document.title = 'Si tu pareja fuera una canción'; startFresh(); });

// --- Oferta: que la canción suene --------------------------------------------------------------------------------
const SONG_TZ_DIAL = { 'America/Costa_Rica': '+506', 'America/Montevideo': '+598', 'America/Mexico_City': '+52', 'America/Cancun': '+52', 'America/Monterrey': '+52', 'America/Tijuana': '+52', 'America/Argentina/Buenos_Aires': '+54', 'America/Bogota': '+57', 'America/Santiago': '+56', 'America/Lima': '+51', 'America/Guayaquil': '+593', 'America/Panama': '+507', 'America/Guatemala': '+502', 'America/El_Salvador': '+503', 'America/Tegucigalpa': '+504', 'America/Managua': '+505', 'America/Caracas': '+58', 'America/La_Paz': '+591', 'America/Asuncion': '+595', 'Europe/Madrid': '+34' };
function guessDialCode() { try { return SONG_TZ_DIAL[Intl.DateTimeFormat().resolvedOptions().timeZone] || ''; } catch { return ''; } }
function buildSongPhone(dial, raw) {
  // Devuelve { phone, reason }. reason: 'empty' | 'short' | 'long' | 'nodial' | ''.
  let n = String(raw || '').replace(/[\s().\-]/g, '');
  if (!n) return { phone: '', reason: 'empty' };
  if (n.startsWith('00')) n = '+' + n.slice(2);
  const ok = (v) => /^\+[1-9]\d{7,14}$/.test(v);
  if (n.startsWith('+')) return ok(n) ? { phone: n, reason: '' } : { phone: '', reason: n.length < 9 ? 'short' : 'long' };
  if (/\D/.test(n)) return { phone: '', reason: 'short' };
  if (!dial) return { phone: '', reason: 'nodial' };
  const dd = dial.slice(1);
  n = n.replace(/^0+/, '');
  // Si ya escribió el código de país sin "+", no se duplica (ej. 50688881234 con CR +506).
  if (n.startsWith(dd) && n.length >= dd.length + 8 && n.length <= 15 && ok('+' + n)) return { phone: '+' + n, reason: '' };
  const full = dial + n;
  return ok(full) ? { phone: full, reason: '' } : { phone: '', reason: n.length + dial.length < 9 ? 'short' : 'long' };
}
const PHONE_MSG = {
  empty: 'Falta tu número de WhatsApp. Escríbelo arriba para que te llegue la muestra, por ejemplo 8888 1234.',
  short: 'Al número le faltan dígitos. Escríbelo completo, por ejemplo 8888 1234.',
  long: 'El número tiene demasiados dígitos. Revisa el código de país y vuelve a escribirlo.',
  nodial: 'Elige tu país en la lista o escribe el número con + y el código, por ejemplo +506 8888 1234.'
};
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

let songStyle = 'Sorpréndeme', songObserver = null, offerApi = null, waPending = false, waReturn = null;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && waReturn) waReturn(); });
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
  err.classList.add('is-hidden'); send.disabled = false; send.textContent = 'Enviar mi número';
  $('songOfferTitle').textContent = `Ya tienes la letra. Falta que suene para ${song.partner || 'tu pareja'}.`;
  $('songTeaserText').textContent = `Te hago una muestra cantada de «${song.title}» para que la escuches. Si te gusta, la terminamos y se la das a ${song.partner || 'tu pareja'}. Sin compromiso: el precio lo hablamos solo después de que la oigas.`;

  songStyle = song.suggested || 'Sorpréndeme';
  const sug = $('songSuggest');
  if (song.suggested && song.suggested !== 'Sorpréndeme') { sug.textContent = `Por lo que contaste, le queda: ${song.suggested}.`; sug.classList.remove('is-hidden'); } else sug.classList.add('is-hidden');
  box.querySelectorAll('.song-chip').forEach(chip => {
    chip.setAttribute('aria-pressed', chip.dataset.style === songStyle ? 'true' : 'false');
    chip.onclick = () => {
      songStyle = chip.dataset.style;
      box.querySelectorAll('.song-chip').forEach(c => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
      track('song_style_chosen', { style: songStyle });
    };
  });

  // En esta versión el nombre de la pareja ya va en la letra: no hay casilla de nombre.
  const wantName = { checked: false }, nameIn = { value: '', focus() {} };
  const dial = $('songDial'), phone = $('songPhone'); phone.value = '';
  const guess = guessDialCode(); if (guess) dial.value = guess;

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
  const nameRe = /^[\p{L}][\p{L} '’-]{0,29}$/u;
  const typedName = () => (wantName.checked ? nameIn.value.replace(/\s+/g, ' ').trim() : '');
  const waAgain = $('songWaAgain'); let phoneFails = 0;
  const waHref = () => {
    const n = typedName();
    const text = `Hola, quiero que suene la canción para ${song.partner || 'mi pareja'} 🎵\n«${song.title}»\nEstilo: ${songStyle}\n${n && nameRe.test(n) ? `Nombre en la canción: ${n}\n` : ''}Mi código es: ${song.songId}`;
    return `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(text)}`;
  };
  waAgain.classList.add('is-hidden');
  waAgain.onclick = () => track('song_whatsapp_clicked', { after_form: true });

  // WhatsApp primero: un toque abre el chat con el mensaje listo. Si la persona vuelve sin haberlo enviado, se le ofrece dejar el número.
  const waBtn = $('btnSongWa'), back = $('songBack'), phoneBox = $('songPhoneBox'), showPhone = $('songShowPhone');
  back.classList.add('is-hidden'); phoneBox.classList.add('is-hidden'); showPhone.classList.remove('is-hidden');
  waBtn.href = waHref(); let waPosted = false; waPending = false;
  waBtn.onclick = () => {
    waBtn.href = waHref();   // el estilo pudo cambiar desde que se dibujó
    track('song_whatsapp_clicked', { primary: true, style: songStyle });
    waPending = true;
    if (!waPosted) {
      waPosted = true;
      postFn('sfc-song-request', { songId: song.songId, style: songStyle, via: 'whatsapp', consent: true }).catch(() => {});
    }
  };
  waReturn = () => { if (!waPending) return; waPending = false; err.classList.add('is-hidden'); back.classList.remove('is-hidden'); track('song_wa_return', {}); try { back.scrollIntoView({ block: 'center' }); } catch (_e) { /* no crítico */ } };
  const openPhone = () => { phoneBox.classList.remove('is-hidden'); showPhone.classList.add('is-hidden'); back.classList.add('is-hidden'); };
  showPhone.onclick = () => { track('song_phone_form_opened', {}); openPhone(); };
  $('songBackNo').onclick = () => { track('song_wa_not_sent', {}); openPhone(); };
  $('songBackYes').onclick = () => {
    track('song_wa_confirmed', {});
    $('songDoneText').textContent = `Perfecto. Te respondo por WhatsApp con la muestra de la canción para ${song.partner || 'tu pareja'} apenas vea tu mensaje.`;
    waAgain.classList.add('is-hidden'); form.classList.add('is-hidden'); done.classList.remove('is-hidden'); box.classList.add('is-open');
  };

  form.onsubmit = async (ev) => {
    ev.preventDefault(); err.classList.add('is-hidden');
    const n = typedName();
    if (wantName.checked && !nameRe.test(n)) { track('song_name_invalid', {}); fail('Escribe solo tu nombre (letras, hasta 30), o desmarca la casilla.'); nameIn.focus(); return; }
    const pr = buildSongPhone(dial.value, phone.value), full = pr.phone;
    if (!full) {
      phoneFails++;
      track('song_phone_invalid', { reason: pr.reason, len: String(phone.value || '').replace(/\D/g, '').length, dial: dial.value });
      fail(PHONE_MSG[pr.reason] || PHONE_MSG.short);
      phone.focus(); return;
    }
    send.disabled = true; send.textContent = 'Enviando…';
    track('song_request_submitted', { style: songStyle, hasName: !!n });
    try {
      const data = await postFn('sfc-song-request', { songId: song.songId, style: songStyle, phone: full, consent: true, ...(n ? { name: n } : {}) });
      if (!data.ok) throw new Error('fallo');
      track('song_request_confirmed', { style: songStyle, songId: song.songId });
      waAgain.href = waHref(); waAgain.classList.remove('is-hidden');
      $('songDoneText').textContent = `Te escribiré por WhatsApp al ${full} con una muestra de la canción para ${song.partner || 'tu pareja'}. Revisa tus mensajes pronto.`;
      form.classList.add('is-hidden'); done.classList.remove('is-hidden'); box.classList.add('is-open');
      try { done.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_e) { /* no crítico */ }
    } catch (e) {
      track('song_request_failed', { status: e.status || 0 });
      fail(e.status ? (e.message || 'No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbeme por WhatsApp.') : 'Sin conexión. Inténtalo de nuevo.');
      send.disabled = false; send.textContent = 'Enviar mi número';
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
