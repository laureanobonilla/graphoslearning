// "Si fueras una canción": 15 preguntas de elegir (varias a la vez, o ninguna, o escribir lo propio) → la letra de una
// canción hecha con esas respuestas → oferta de que esa letra SUENE (muestra cantada por WhatsApp; el precio se habla
// después de que la persona la oiga). Independiente de "¿Quién eres en realidad?": claves de localStorage, funciones
// (sfc-*) y `app` de los eventos propios. Los eventos NO llevan el texto ni las opciones elegidas: solo el avance.
'use strict';

const CONTACT_WHATSAPP = '50687772993';
const TRACK_URL = '/.netlify/functions/sfc-track-event';

// --- Preguntas ---------------------------------------------------------------------------------
// type 'multi': 8 opciones [emoji|color, texto]; se puede elegir varias, "ninguna" o escribir la propia.
// type 'open': texto libre opcional. `style` (en una opción) la liga con un estilo musical.
const COLOR_OPTS = [
  { color: '#d9402b', t: 'Rojo brasa' }, { color: '#2b3a9e', t: 'Azul medianoche' }, { color: '#f5b800', t: 'Amarillo mango' },
  { color: '#1f8a5b', t: 'Verde selva' }, { color: '#f07aa4', t: 'Rosa atardecer' }, { color: '#7d8aa0', t: 'Gris lluvia' },
  { color: '#f2802e', t: 'Naranja fogata' }, { color: '#7a4fd0', t: 'Violeta tormenta' }
];
const QUESTIONS = [
  { id: 'q1', type: 'multi', prompt: 'Sábado, 11 de la noche. ¿Dónde estás de verdad?', opts: [
    ['🛋️', 'En el sofá, con una manta y cero planes'], ['🎉', 'En una fiesta, con la música muy alta'], ['🚗', 'Manejando sin rumbo, con la ventana abajo'],
    ['🍳', 'Cocinando algo solo porque sí'], ['📱', 'En la cama, viendo videos hasta que se me cierren los ojos'], ['🫶', 'En casa de alguien que quiero'],
    ['🎨', 'Creando algo: escribiendo, dibujando, tocando'], ['🌙', 'Caminando por la calle, pensando en mis cosas'] ] },
  { id: 'q2', type: 'multi', prompt: '¿Qué sonido te devuelve la calma?', opts: [
    ['🌧️', 'La lluvia sobre el techo'], ['🌊', 'El mar, de lejos'], ['🚙', 'Un carro pasando de noche'], ['🎸', 'Una guitarra suave'],
    ['🤫', 'El silencio total'], ['🗣️', 'Voces de gente que quiero, en la sala'], ['☕', 'La cafetera empezando a burbujear'], ['🍃', 'El viento moviendo los árboles'] ] },
  { id: 'q3', type: 'multi', prompt: 'Te mudas mañana y solo cabe una cosa pequeña en tu bolsillo. ¿Cuál?', opts: [
    ['💌', 'Una carta o una nota vieja'], ['📷', 'Una foto'], ['🧸', 'Algo de cuando era niño'], ['📖', 'Un libro marcado y subrayado'],
    ['🔑', 'La llave de un lugar que quiero'], ['🎧', 'Mis audífonos con mi música'], ['💍', 'Una joya o un amuleto'], ['📱', 'Mi teléfono, con todo lo que guarda'] ] },
  { id: 'q4', type: 'multi', prompt: 'Tu mañana perfecta huele a…', opts: [
    ['☕', 'Café recién hecho'], ['🍞', 'Pan caliente'], ['🌱', 'Tierra mojada'], ['🧼', 'Ropa limpia secada al sol'],
    ['🌊', 'Mar y sal'], ['🍲', 'Comida de casa'], ['🌸', 'Un perfume que me recuerda a alguien'], ['🕯️', 'A cuarto cerrado y cobija'] ] },
  { id: 'q5', type: 'multi', prompt: 'Si tu canción fuera de colores, ¿de cuáles?', colors: true, opts: COLOR_OPTS.map(c => [c.color, c.t]) },
  { id: 'q6', type: 'multi', prompt: 'Cuando algo te sale mal, lo primero que haces es…', opts: [
    ['😂', 'Reírme de lo absurdo'], ['🤐', 'Callarme y darle vueltas en silencio'], ['📝', 'Hacer un plan para arreglarlo'], ['😤', 'Enojarme (y que se me pase rápido)'],
    ['📞', 'Llamar a alguien'], ['😭', 'Llorar un rato y seguir'], ['🙃', 'Fingir que no pasó'], ['🧹', 'Ocuparme en otra cosa hasta olvidarlo'] ] },
  { id: 'q7', type: 'multi', prompt: 'Lo que más te dicen que tienes de más…', opts: [
    ['❤️', 'Corazón'], ['⚡', 'Energía'], ['🧠', 'Cabeza: pienso demasiado'], ['😄', 'Risa'],
    ['🔥', 'Carácter'], ['🌿', 'Calma'], ['🔍', 'Curiosidad'], ['💡', 'Ideas'] ] },
  { id: 'q8', type: 'multi', prompt: 'Un lugar al que volverías con los ojos cerrados', opts: [
    ['🏡', 'La casa donde crecí'], ['🏖️', 'Una playa'], ['🌳', 'Una plaza o un parque'], ['👵', 'La casa de mis abuelos'],
    ['⛰️', 'Una montaña o un río'], ['✈️', 'Un lugar de un viaje'], ['🛣️', 'Una calle que me sé de memoria'], ['🌍', 'Uno que todavía no conozco'] ] },
  { id: 'q9', type: 'multi', prompt: 'Cuando termine tu canción, ¿qué quieres que se quede sintiendo quien la escuche?', opts: [
    ['💃', 'Ganas de bailar'], ['🥺', 'Un nudo en la garganta, pero bonito'], ['😌', 'Calma'], ['💪', 'Fuerza'],
    ['🍂', 'Nostalgia dulce'], ['😆', 'Risa'], ['🌅', 'Esperanza'], ['🤗', 'Ternura'] ] },
  { id: 'q10', type: 'multi', prompt: '¿Qué ritmo tiene tu vida ahora mismo?', opts: [
    ['🌹', 'Un bolero lento y con drama', 'Bolero'], ['🎹', 'Una balada con piano', 'Balada suave'], ['🎉', 'Un pop que levanta el ánimo', 'Pop'],
    ['🪕', 'Guitarra y voz, sin adornos', 'Acústica'], ['🤘', 'Rock con ganas, pero sin gritar tanto', 'Rock suave'], ['🌃', 'Un ritmo urbano de noche', 'Urbano suave'],
    ['🪘', 'Una cumbia que no deja sentarse', 'Cumbia'], ['🎲', 'Un poco de todo: sorpréndeme', 'Sorpréndeme'] ] },
  { id: 'q11', type: 'multi', prompt: 'Tu superpoder más inútil (pero tuyo)', opts: [
    ['🎂', 'Me acuerdo de todos los cumpleaños'], ['😴', 'Me duermo en cualquier lugar'], ['🫂', 'Hago reír a quien está triste'], ['🔎', 'Encuentro lo que otros pierden'],
    ['🎬', 'Adivino el final de las películas'], ['🕵️', 'Noto cuando alguien miente'], ['🛒', 'Hago amistad en cualquier fila'], ['🥘', 'Cocino algo rico con lo que haya'] ] },
  { id: 'q12', type: 'multi', prompt: 'Algo que te encanta aunque casi nadie lo sepa', opts: [
    ['🚿', 'Cantar en la ducha como si fuera un concierto'], ['📺', 'Ver novelas o reality sin culpa'], ['🌙', 'Comer a medianoche'], ['🗣️', 'Hablar en voz alta cuando nadie está'],
    ['📱', 'Releer mensajes viejos'], ['🧺', 'Coleccionar cosas inútiles'], ['🥹', 'Llorar con los comerciales'], ['🕺', 'Bailar cuando nadie me ve'] ] },
  { id: 'q13', type: 'multi', prompt: '¿Qué te gustaría que dijeran de ti cuando no estás?', opts: [
    ['😊', 'Que contigo todo se siente más ligero'], ['🤝', 'Que contigo se puede contar'], ['🪞', 'Que contigo se puede ser uno mismo'], ['😂', 'Que contigo nunca es aburrido'],
    ['🕊️', 'Que contigo hay paz'], ['🚀', 'Que contigo dan ganas de intentarlo'], ['🫶', 'Que contigo nadie se siente solo'], ['🏠', 'Que contigo se siente como en casa'] ] },
  { id: 'q14', type: 'multi', prompt: 'Si pudieras mandarle un mensaje a quien fuiste hace cinco años, sería…', opts: [
    ['🌤️', '«Respira, sí sale bien»'], ['🦁', '«Atrévete más»'], ['🎈', '«Suelta eso, no te tocaba cargarlo»'], ['🌴', '«Disfruta más, hay tiempo»'],
    ['🫶', '«Quiérete más»'], ['🆘', '«Pide ayuda, no pasa nada»'], ['🐢', '«No te apures»'], ['🙏', '«Gracias por aguantar»'] ] },
  { id: 'q15', type: 'open', prompt: 'Para terminar: una frase que dices siempre, un apodo o una palabra que es solo tuya',
    placeholder: 'Por ejemplo: «ya veremos», el apodo que te puso tu abuela, esa palabra rara que inventaste…',
    why: 'Es opcional. Si la escribes, va casi tal cual en tu canción.' }
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
const ANON_KEY = 'sfc_anon_id';
function ensureAnonId() {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(ANON_KEY, id); }
    return id;
  } catch { return `volatile-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
const anonId = ensureAnonId();
function track(event, metadata) {
  try {
    fetch(TRACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ event, anonId, metadata: metadata || {} }) }).catch(() => {});
  } catch { /* no crítico */ }
}
track('landing_viewed', {
  referrer: document.referrer ? document.referrer.slice(0, 200) : null,
  likelyBot: /bot|crawl|spider|facebookexternalhit|whatsapp|preview|slackbot|embedly|discordbot/i.test(navigator.userAgent)
});

// --- Guardado local: avance del cuestionario y canción lista ------------------------------------------
const PROGRESS_KEY = 'sfc_progress_v1', SONG_KEY = 'sfc_song_v1';
const PROGRESS_MAX_AGE = 3 * 24 * 3600 * 1000, SONG_MAX_AGE = 71 * 3600 * 1000;
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* no crítico */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* no crítico */ } };
const hasContent = (s) => s.picks.length > 0 || s.other.trim().length > 0;
const answeredCount = () => state.filter(hasContent).length;   // cuenta respuestas con contenido ("ninguna" no cuenta)
function saveProgress() { lsSet(PROGRESS_KEY, { state, currentIndex, savedAt: Date.now() }); }
function loadProgress() {
  const p = lsGet(PROGRESS_KEY);
  if (!p || !Array.isArray(p.state) || p.state.length !== TOTAL || Date.now() - (p.savedAt || 0) > PROGRESS_MAX_AGE) return null;
  const cleaned = p.state.map((s, i) => ({
    picks: Array.isArray(s.picks) ? s.picks.filter(n => Number.isInteger(n) && QUESTIONS[i].opts && n >= 0 && n < QUESTIONS[i].opts.length) : [],
    none: !!s.none, other: String(s.other || '').slice(0, MAX_OTHER)
  }));
  const done = cleaned.filter((s) => s.picks.length || s.none || s.other).length;
  return done > 0 && p.currentIndex > 0 && p.currentIndex < TOTAL ? { state: cleaned, currentIndex: p.currentIndex } : null;
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
  qPrompt.textContent = q.prompt;
  qHint.textContent = q.type === 'open' ? '' : 'Elige todas las que quieras. Si ninguna te calza, dilo o escribe la tuya.';
  qHint.classList.toggle('is-hidden', q.type === 'open');
  $('count').textContent = `${i + 1} de ${TOTAL}`;
  $('fill').style.width = `${(i / TOTAL) * 100}%`;
  btnBack.classList.toggle('is-hidden', i === 0);
  btnNext.textContent = i === TOTAL - 1 ? 'Escribir mi canción' : 'Siguiente';
  qBody.textContent = '';

  if (q.type === 'open') {
    const wrap = document.createElement('div'); wrap.className = 'open-area';
    const ta = document.createElement('textarea');
    ta.maxLength = MAX_OTHER; ta.rows = 3; ta.placeholder = q.placeholder; ta.value = s.other; ta.setAttribute('aria-label', q.prompt);
    ta.addEventListener('input', () => { s.other = ta.value; });
    const why = document.createElement('p'); why.className = 'why'; why.textContent = q.why;
    wrap.append(ta, why); qBody.appendChild(wrap);
    updateNext();
    return;
  }

  const list = document.createElement('div'); list.className = 'opts'; list.setAttribute('role', 'group'); list.setAttribute('aria-label', q.prompt);
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
  if (currentIndex < TOTAL - 1) { saveProgress(); renderQuestion(currentIndex + 1); window.scrollTo(0, 0); }
  else submitQuiz();
});
btnBack.addEventListener('click', () => { if (currentIndex > 0) { renderQuestion(currentIndex - 1); window.scrollTo(0, 0); } });

// --- Inicio / retomar -----------------------------------------------------------------------------------
function resetState() { state.forEach(s => { s.picks = []; s.none = false; s.other = ''; }); }
function startFresh() {
  lsDel(PROGRESS_KEY); lsDel(SONG_KEY); resetState(); song = null;
  track('quiz_started', {});
  renderQuestion(0); showScreen('quiz');
}
const saved = loadProgress();
if (saved) {
  // Si hay un avance guardado, el botón principal es CONTINUAR (antes un botón secundario perdía el avance si tocaban "Empezar").
  $('btnStart').textContent = `Continuar (pregunta ${saved.currentIndex + 1} de ${TOTAL})`;
  $('coverCont').classList.remove('is-hidden');
  $('btnStart').addEventListener('click', () => {
    track('quiz_resumed', { fromIndex: saved.currentIndex + 1 });
    saved.state.forEach((s, i) => { state[i] = s; });
    renderQuestion(Math.min(saved.currentIndex, TOTAL - 1)); showScreen('quiz');
  });
  $('btnRestartCover').addEventListener('click', startFresh);
} else {
  $('btnStart').addEventListener('click', startFresh);
}

// --- Enviar y generar ---------------------------------------------------------------------------------------
const LOADING_STEPS = ['Escuchando lo que elegiste…', 'Buscando tu estribillo…', 'Rimando tus rarezas…', 'Casi lista…'];
async function postFn(name, payload) {
  const res = await fetch(`/.netlify/functions/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data;
}
function buildAnswers() {
  return QUESTIONS.map((q, i) => {
    const s = state[i];
    return { q: q.prompt, picks: (q.opts || []).filter((_, idx) => s.picks.includes(idx)).map(o => o[1]), other: s.other.trim(), none: !!s.none };
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
  lsSet(PROGRESS_KEY, { state, currentIndex: TOTAL - 1, savedAt: Date.now() });
  track('quiz_submitted', { answered: answeredCount() });
  showScreen('loading');
  let step = 0; $('loadLabel').textContent = LOADING_STEPS[0];
  clearInterval(loadTimer); loadTimer = setInterval(() => { step = Math.min(step + 1, LOADING_STEPS.length - 1); $('loadLabel').textContent = LOADING_STEPS[step]; }, 4500);
  const t0 = Date.now();
  try {
    const data = await postFn('sfc-generate-song', { anonId, answers: buildAnswers() });
    clearInterval(loadTimer);
    const d = derivedFromAnswers();
    song = { songId: data.songId, title: data.title, subtitle: data.subtitle, style: data.style, lyrics: data.lyrics, colors: d.colors.slice(0, 2), suggested: d.suggested || data.style };
    track('song_generated', { seconds: Math.round((Date.now() - t0) / 1000) });
    lsDel(PROGRESS_KEY);
    lsSet(SONG_KEY, { ...song, savedAt: Date.now() });
    renderReveal();
  } catch (err) {
    clearInterval(loadTimer);
    track('song_generate_failed', { status: err.status || 0, seconds: Math.round((Date.now() - t0) / 1000) });
    $('errorMsg').textContent = err.status === 429 ? 'Hiciste varias canciones seguidas' : 'No pudimos escribir tu canción';
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
  renderSheet(song.lyrics);
  document.title = `${song.title} · Si fueras una canción`;
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
  const url = location.origin + '/si-fueras-cancion/';
  const text = `Mi canción se llama «${song.title}»: ${song.subtitle}. Haz la tuya:`;
  try { if (navigator.share) { await navigator.share({ title: song.title, text, url }); return; } } catch { /* canceló */ }
  const ok = await copyText(`${text} ${url}`);
  $('btnShare').textContent = ok ? 'Enlace copiado' : url;
  setTimeout(() => { $('btnShare').textContent = 'Compartir'; }, 2200);
});
$('btnRestart').addEventListener('click', () => { track('restart_clicked', {}); document.title = 'Si fueras una canción'; startFresh(); });

// --- Oferta: que la canción suene --------------------------------------------------------------------------------
const SONG_TZ_DIAL = { 'America/Costa_Rica': '+506', 'America/Montevideo': '+598', 'America/Mexico_City': '+52', 'America/Cancun': '+52', 'America/Monterrey': '+52', 'America/Tijuana': '+52', 'America/Argentina/Buenos_Aires': '+54', 'America/Bogota': '+57', 'America/Santiago': '+56', 'America/Lima': '+51', 'America/Guayaquil': '+593', 'America/Panama': '+507', 'America/Guatemala': '+502', 'America/El_Salvador': '+503', 'America/Tegucigalpa': '+504', 'America/Managua': '+505', 'America/Caracas': '+58', 'America/La_Paz': '+591', 'America/Asuncion': '+595', 'Europe/Madrid': '+34' };
function guessDialCode() { try { return SONG_TZ_DIAL[Intl.DateTimeFormat().resolvedOptions().timeZone] || ''; } catch { return ''; } }
function buildSongPhone(dial, raw) {
  let n = String(raw || '').replace(/[\s().\-]/g, '');
  if (!n) return '';
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (n.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(n) ? n : '';
  if (!dial) return '';
  const full = dial + n.replace(/^0+/, '');
  return /^\+[1-9]\d{7,14}$/.test(full) ? full : '';
}
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

let songStyle = 'Sorpréndeme', songObserver = null, offerApi = null;
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
  err.classList.add('is-hidden'); send.disabled = false; send.textContent = 'Que me escriban a mi número';
  $('songTeaserText').textContent = `Te hago una muestra cantada de «${song.title}» para que la escuches. Si te gusta, la terminamos. Sin compromiso: el precio lo hablamos solo después de que la oigas.`;

  songStyle = song.suggested || 'Sorpréndeme';
  const sug = $('songSuggest');
  if (song.suggested && song.suggested !== 'Sorpréndeme') { sug.textContent = `Según tus respuestas te queda: ${song.suggested}.`; sug.classList.remove('is-hidden'); } else sug.classList.add('is-hidden');
  box.querySelectorAll('.song-chip').forEach(chip => {
    chip.setAttribute('aria-pressed', chip.dataset.style === songStyle ? 'true' : 'false');
    chip.onclick = () => {
      songStyle = chip.dataset.style;
      box.querySelectorAll('.song-chip').forEach(c => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
      track('song_style_chosen', { style: songStyle });
    };
  });

  const wantName = $('songWantName'), nameIn = $('songName'), nameNote = $('songNameNote');
  wantName.checked = false; nameIn.value = ''; nameIn.classList.add('is-hidden'); nameNote.classList.add('is-hidden');
  wantName.onchange = () => { nameIn.classList.toggle('is-hidden', !wantName.checked); nameNote.classList.toggle('is-hidden', !wantName.checked); track('song_name_toggled', { on: wantName.checked }); };
  const dial = $('songDial'), phone = $('songPhone'); phone.value = '';
  const guess = guessDialCode(); if (guess) dial.value = guess;

  const wide = () => window.matchMedia('(min-width: 960px)').matches;
  const open = () => { teaser.classList.add('is-hidden'); if (done.classList.contains('is-hidden')) form.classList.remove('is-hidden'); box.classList.add('is-open'); box.scrollTop = 0; };
  offerApi = { open: () => { if (form.classList.contains('is-hidden') && done.classList.contains('is-hidden')) { track('song_cta_clicked', {}); open(); } else box.classList.add('is-open'); } };
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
  const waBtn = $('songWaBtn'), waAgain = $('songWaAgain');
  const waHref = () => {
    const n = typedName();
    const text = `Hola, quiero que suene mi canción 🎵\n«${song.title}»\nEstilo: ${songStyle}\n${n && nameRe.test(n) ? `Nombre en la canción: ${n}\n` : ''}Mi código es: ${song.songId}`;
    return `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(text)}`;
  };
  waBtn.href = waHref(); waAgain.classList.add('is-hidden');
  waBtn.onclick = (ev) => {
    err.classList.add('is-hidden');
    const n = typedName();
    if (wantName.checked && !nameRe.test(n)) { ev.preventDefault(); track('song_name_invalid', {}); fail('Escribe solo tu nombre (letras, hasta 30), o desmarca la casilla.'); nameIn.focus(); return; }
    waBtn.href = waHref();
    track('song_whatsapp_clicked', { style: songStyle, hasName: !!n });
    try {
      fetch('/.netlify/functions/sfc-song-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ songId: song.songId, style: songStyle, via: 'whatsapp', consent: true, ...(n ? { name: n } : {}) })
      }).catch(() => { /* el aviso es un extra: si falla, igual se abre WhatsApp */ });
    } catch (_e) { /* no crítico */ }
    setTimeout(() => {
      $('songDoneText').textContent = 'Se abrió WhatsApp con tu mensaje: solo falta enviarlo. Te respondo ahí con tu muestra.';
      waAgain.href = waBtn.href; waAgain.classList.remove('is-hidden');
      form.classList.add('is-hidden'); done.classList.remove('is-hidden'); box.classList.add('is-open');
    }, 500);
  };
  waAgain.onclick = () => track('song_whatsapp_clicked', { again: true });

  form.onsubmit = async (ev) => {
    ev.preventDefault(); err.classList.add('is-hidden');
    const n = typedName();
    if (wantName.checked && !nameRe.test(n)) { track('song_name_invalid', {}); fail('Escribe solo tu nombre (letras, hasta 30), o desmarca la casilla.'); nameIn.focus(); return; }
    const full = buildSongPhone(dial.value, phone.value);
    if (!full) { track('song_phone_invalid', {}); fail('Revisa tu número: pon el código de tu país y el número, por ejemplo 99 123 456.'); phone.focus(); return; }
    send.disabled = true; send.textContent = 'Enviando…';
    track('song_request_submitted', { style: songStyle, hasName: !!n });
    try {
      const data = await postFn('sfc-song-request', { songId: song.songId, style: songStyle, phone: full, consent: true, ...(n ? { name: n } : {}) });
      if (!data.ok) throw new Error('fallo');
      track('song_request_confirmed', { style: songStyle });
      waAgain.classList.add('is-hidden');
      $('songDoneText').textContent = `Te escribiré por WhatsApp al ${full} con una muestra de tu canción. Revisa tus mensajes pronto.`;
      form.classList.add('is-hidden'); done.classList.remove('is-hidden'); box.classList.add('is-open');
      try { done.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_e) { /* no crítico */ }
    } catch (e) {
      track('song_request_failed', { status: e.status || 0 });
      fail(e.status ? (e.message || 'No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbeme por WhatsApp.') : 'Sin conexión. Inténtalo de nuevo.');
      send.disabled = false; send.textContent = 'Que me escriban a mi número';
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
  song = { songId: s.songId, title: s.title, subtitle: s.subtitle || '', style: s.style, lyrics: s.lyrics, colors: Array.isArray(s.colors) ? s.colors.slice(0, 2) : [], suggested: s.suggested || s.style };
  renderReveal();
})();
