// ==========================================
// "¿QUIÉN ERES EN REALIDAD?" — cuestionario + lectura generada + paywall
// ==========================================
// Reutiliza, de la app de esquemas conceptuales (Graphikosmos): el patrón
// de cobro con PayPal (crear orden en el servidor → aprobar en el cliente →
// capturar y verificar en el servidor, nunca confiar en el navegador) y el
// patrón de llamar a Gemini con una lista de modelos de reintento. Lo nuevo
// de esta app es el cuestionario, la interpretación y que, en vez de login +
// saldo de nodos, cada lectura se paga una sola vez sin necesidad de cuenta
// (ver netlify/functions/_lib/readings-store.js).

// --- Datos del cuestionario -------------------------------------------
// Mezcla a propósito tres formatos (elección única, respuesta corta,
// palabra-a-partir-de-una-imagen) para que se sienta como una conversación
// variada y no como un formulario largo y repetitivo. Las preguntas buscan
// un ángulo concreto (qué haces sin que nadie mire, qué proteges, cómo te
// ven vs. cómo te ves) en vez de rasgos de personalidad genéricos.
// Cada blot se dibuja como UNA sola mitad (de x=80 hacia la izquierda, cerrando
// con una línea recta sobre el eje central) y luego esa misma mitad se refleja
// con "scale(-1,1)" para formar el lado derecho — así cada figura es un blot
// de Rorschach genuino (mitad irregular + su espejo), no la misma silueta ya
// simétrica repetida dos veces. Las cuatro mitades son deliberadamente
// distintas en carácter (redondeada / angulosa-filosa / alargada-afilada /
// agrupada en racimo), no solo en color, para que de verdad se vean como
// cuatro formas diferentes y no como la misma mancha repintada.
const BLOT_A = `<svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g>
    <path d="M80 14 C64 10 50 20 54 34 C34 36 24 52 34 64 C18 70 16 90 32 98 C20 108 24 128 42 130 C40 142 58 152 70 142 C76 146 80 144 80 138 Z" fill="#c6a358" opacity="0.9"/>
  </g>
  <g transform="translate(160,0) scale(-1,1)">
    <path d="M80 14 C64 10 50 20 54 34 C34 36 24 52 34 64 C18 70 16 90 32 98 C20 108 24 128 42 130 C40 142 58 152 70 142 C76 146 80 144 80 138 Z" fill="#c6a358" opacity="0.9"/>
  </g>
</svg>`;
const BLOT_B = `<svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g>
    <path d="M80 10 L62 18 L66 32 L40 30 L48 50 L22 54 L36 72 L14 84 L34 94 L20 114 L44 112 L38 134 L62 122 L66 144 L80 136 Z" fill="#7c2d37" opacity="0.88"/>
  </g>
  <g transform="translate(160,0) scale(-1,1)">
    <path d="M80 10 L62 18 L66 32 L40 30 L48 50 L22 54 L36 72 L14 84 L34 94 L20 114 L44 112 L38 134 L62 122 L66 144 L80 136 Z" fill="#7c2d37" opacity="0.88"/>
  </g>
</svg>`;
const BLOT_C = `<svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g>
    <path d="M80 6 C68 10 62 24 70 34 C48 36 38 54 50 66 C30 70 24 92 42 100 C28 110 30 130 50 132 C46 144 60 154 72 144 C76 148 80 146 80 140 Z" fill="#7fae9b" opacity="0.85"/>
  </g>
  <g transform="translate(160,0) scale(-1,1)">
    <path d="M80 6 C68 10 62 24 70 34 C48 36 38 54 50 66 C30 70 24 92 42 100 C28 110 30 130 50 132 C46 144 60 154 72 144 C76 148 80 146 80 140 Z" fill="#7fae9b" opacity="0.85"/>
  </g>
</svg>`;
const BLOT_D = `<svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g fill="#8c6a9e">
    <circle cx="58" cy="38" r="24" opacity="0.88"/>
    <circle cx="32" cy="66" r="17" opacity="0.88"/>
    <circle cx="62" cy="88" r="20" opacity="0.88"/>
    <circle cx="36" cy="118" r="15" opacity="0.88"/>
    <circle cx="64" cy="138" r="12" opacity="0.88"/>
    <circle cx="16" cy="96" r="7" opacity="0.8"/>
  </g>
  <g transform="translate(160,0) scale(-1,1)" fill="#8c6a9e">
    <circle cx="58" cy="38" r="24" opacity="0.88"/>
    <circle cx="32" cy="66" r="17" opacity="0.88"/>
    <circle cx="62" cy="88" r="20" opacity="0.88"/>
    <circle cx="36" cy="118" r="15" opacity="0.88"/>
    <circle cx="64" cy="138" r="12" opacity="0.88"/>
    <circle cx="16" cy="96" r="7" opacity="0.8"/>
  </g>
</svg>`;

// 16 preguntas (no 10): a propósito es un poco largo. La idea, bien
// señalada por el usuario, es que el esfuerzo de llegar hasta el final sea
// justo lo que hace intolerable no leer el resultado — nadie quiere haber
// contestado 16 preguntas honestas para quedarse solo con la mitad de la
// respuesta. Se mantiene la mezcla de los tres formatos y el mismo ángulo
// (qué haces sin que nadie mire, qué proteges, cómo te ven vs. cómo te ves)
// para que se siga sintiendo como una conversación y no como una encuesta.
const QUESTIONS = [
  { id: 'q1', type: 'choice', prompt: 'Entras a una fiesta donde casi no conoces a nadie. ¿Qué haces primero?',
    options: [
      'Busco un rincón desde donde observar todo antes de hablar',
      'Me acerco a la persona que se ve más interesante',
      'Me quedo cerca de la puerta, por si quiero irme',
      'Busco a alguien que sí conozca y no me suelto de ahí'
    ] },
  { id: 'q2', type: 'short', prompt: 'Completa sin pensarlo mucho: "Lo que más me cuesta perdonar en alguien es..."',
    placeholder: 'Escribe lo primero que pienses' },
  { id: 'q3', type: 'choice', prompt: 'Cuando alguien te traiciona, lo que haces es...',
    options: [
      'Lo perdono por fuera, pero no lo olvido',
      'Corto la relación sin avisar',
      'Se lo digo de frente, aunque duela',
      'Me convenzo de que no me importó'
    ] },
  { id: 'q4', type: 'choice', prompt: '¿Cuál de estas versiones de ti se parece más a cómo eres cuando nadie te está viendo?',
    options: [
      'La que de verdad descansa, sin sentirse culpable',
      'La que sigue trabajando aunque ya nadie se dé cuenta',
      'La que es más sincera que la que muestras en público',
      'La que siempre piensa primero en los demás'
    ] },
  { id: 'q5', type: 'short', prompt: 'Termina la frase: "Si de verdad nadie fuera a enterarse, por fin me atrevería a..."',
    placeholder: 'Lo que hoy no te permites' },
  { id: 'q6', type: 'choice', prompt: 'Si tus amigos más cercanos tuvieran que contar tu peor momento, dirían que fue cuando...',
    options: [
      'te cerraste y no dejaste que nadie te ayudara',
      'explotaste con quien menos lo merecía',
      'desapareciste sin dar explicaciones',
      'fingiste que todo estaba bien hasta que ya no pudiste más'
    ] },
  { id: 'q7', type: 'image', prompt: '¿Qué es lo primero que ves?', blot: BLOT_B,
    placeholder: 'Una palabra' },
  { id: 'q8', type: 'short', prompt: '¿Cuál es la mentira que más te repites a ti?',
    placeholder: 'La que casi nunca dices en voz alta' },
  { id: 'q9', type: 'choice', prompt: 'Cuando discutes con alguien cercano, lo primero que haces es...',
    options: [
      'Hablarlo de frente, lo antes posible',
      'Evitarlo y esperar a que se resuelva solo',
      'Usar el humor para quitarle peso',
      'Escribir lo que siento antes de hablarlo'
    ] },
  { id: 'q10', type: 'short', prompt: 'Piensa en la última vez que alguien te falló de verdad. ¿Qué fue lo que más te dolió?',
    placeholder: 'Lo que de verdad te dolió' },
  { id: 'q11', type: 'short', prompt: 'Termina la frase: "La gente cree que soy..., pero en realidad soy..."',
    placeholder: 'Las dos partes, aunque no calcen' },
  { id: 'q12', type: 'choice', prompt: '¿Qué tipo de silencio te incomoda más?',
    options: [
      'El que sigue a una pregunta que no supiste responder',
      'El de alguien enojado contigo',
      'El de una habitación vacía',
      'El que creas tú para no decir algo que piensas'
    ] },
  { id: 'q13', type: 'image', prompt: '¿Qué es lo primero que ves?', blot: BLOT_D,
    placeholder: 'Una palabra' },
  { id: 'q14', type: 'short', prompt: 'Describe, en una sola frase, el momento en que sentiste que de verdad te vieron tal como eres.',
    placeholder: 'Aunque haya sido hace mucho' },
  { id: 'q15', type: 'choice', prompt: 'De todo lo que tienes, ¿qué proteges con más fuerza?',
    options: ['Mi tiempo', 'Mi reputación', 'A las personas que quiero', 'Mi paz'] },
  { id: 'q16', type: 'short', prompt: 'Termina la frase: "Si pudiera decirle una verdad a quien era hace 5 años, sería..."',
    placeholder: 'La verdad, sin suavizarla' }
];

// --- Estado --------------------------------------------------------------
let currentIndex = 0;
const answers = new Array(QUESTIONS.length).fill(null);
let readingId = null;
let archetypeNameForShare = '';

// --- Registro de uso: hasta dónde llega cada visitante, y con qué respuestas ---
// Se guarda en la misma tabla `events` de Supabase que ya usa Graphikosmos
// (ver supabase/schema.sql y netlify/functions/qer-track-event.js) — mismas
// variables de entorno, sin configurar nada nuevo. anonId identifica solo
// el NAVEGADOR (no a la persona), se genera una vez y se reutiliza siempre
// que vuelva desde el mismo navegador.
const ANON_ID_KEY = 'qer_anon_id';
function ensureAnonId() {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage no disponible (modo privado, etc.) — un id de un solo
    // uso para esta carga de página; no se podrá "seguir el hilo" si
    // recarga, pero el evento de todos modos queda registrado.
    return `volatile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
const anonId = ensureAnonId();

// "Dispara y olvida" a propósito: nunca debe frenar ni poder romper la
// experiencia del cuestionario — si falla (red, Supabase caído), no se
// reintenta ni se le avisa a la persona.
function track(eventName, metadata) {
  try {
    fetch('/.netlify/functions/qer-track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: eventName, anonId, metadata: { ...(metadata || {}), variant: 'map' } })
    }).catch(() => {});
  } catch { /* no crítico */ }
}

// Se manda apenas carga la página, ANTES de que la persona toque nada —
// así quien_eres_funnel (y la tabla events en general) también incluye a
// quien abre el link y se va sin llegar a tocar "Empezar". Sin esto, no
// había forma de distinguir "nadie entra al link" de "entran pero la
// portada no los convence" — dos problemas muy distintos con soluciones
// muy distintas.
//
// referrer + un indicio simple de "robot": cuando alguien comparte este
// link en Facebook/WhatsApp/Slack, esas plataformas mandan un robot a
// "pre-visitar" la página para armar la vista previa (imagen + texto) antes
// de que una persona real haga clic — eso también generaría un
// landing_viewed sin que haya nadie del otro lado. Guardar esto ayuda a
// distinguir, en una consulta SQL, cuáles de las visitas fueron de verdad.
track('landing_viewed', {
  referrer: document.referrer ? document.referrer.slice(0, 200) : null,
  likelyBot: /bot|crawl|spider|facebookexternalhit|whatsapp|preview|slackbot|embedly|discordbot/i.test(navigator.userAgent)
});

// --- Recordar la lectura pendiente de pago (sin necesitar cuenta) --------
// No hay login, así que lo único que vincula a la persona con SU lectura es
// el readingId — y antes ese id solo vivía en una variable de JavaScript:
// si cerrabas la pestaña o se refrescaba la página antes de pagar, se
// perdía para siempre y no había forma de "pagar después" aunque la
// lectura siguiera guardada en el servidor (24h, ver _lib/qer-readings-
// store.js). Ahora se guarda también en localStorage de este navegador,
// así que si vuelves dentro de esas 24h, retomas justo donde quedaste —
// viendo el inicio gratis y con el botón de pago listo — sin repetir las
// 16 preguntas.
const PENDING_KEY = 'qer_pending_map'; // clave propia: no pisa la lectura pendiente de la versión de texto
const PENDING_MAX_AGE_MS = 23 * 60 * 60 * 1000; // un poco menos que el TTL del servidor (24h)

function savePendingReading(data) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch { /* localStorage puede fallar (modo privado, cuota llena) — no es crítico */ }
}

function loadPendingReading() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.readingId || Date.now() - (data.savedAt || 0) > PENDING_MAX_AGE_MS) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function clearPendingReading() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* no crítico */ }
}

// --- Navegación entre pantallas -------------------------------------------
let currentScreenName = 'cover';
function showScreen(name) {
  currentScreenName = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  document.getElementById(`screen-${name}`).classList.add('is-active');
  document.getElementById('progress').classList.toggle('is-hidden', name !== 'quiz');
  window.scrollTo(0, 0);
}

// --- Cuestionario ----------------------------------------------------------
const qPromptEl = document.getElementById('qPrompt');
const qBodyEl = document.getElementById('qBody');
const btnNext = document.getElementById('btnNext');
const btnBack = document.getElementById('btnBack');
const progressFill = document.getElementById('progressFill');

function renderQuestion(index) {
  const q = QUESTIONS[index];
  progressFill.style.width = `${Math.round((index / QUESTIONS.length) * 100)}%`;
  btnBack.classList.toggle('is-hidden', index === 0);
  qPromptEl.textContent = q.prompt;
  qBodyEl.innerHTML = '';
  btnNext.disabled = true;

  const existing = answers[index];

  if (q.type === 'choice') {
    const wrap = document.createElement('div');
    wrap.className = 'options';
    q.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      if (existing === opt) { btn.classList.add('is-selected'); btnNext.disabled = false; }
      btn.innerHTML = `<span class="dot"></span><span>${opt}</span>`;
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('.option').forEach(o => o.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        btnNext.disabled = false;
      });
      wrap.appendChild(btn);
    });
    qBodyEl.appendChild(wrap);
    return;
  }

  if (q.type === 'image') {
    const blotWrap = document.createElement('div');
    blotWrap.className = 'blot-wrap';
    blotWrap.innerHTML = q.blot;
    qBodyEl.appendChild(blotWrap);
  }

  // 'short' e 'image' comparten el mismo input de texto corto.
  const inputWrap = document.createElement('div');
  inputWrap.className = 'short-input-wrap';
  const textarea = document.createElement('textarea');
  textarea.className = 'short-input';
  textarea.rows = q.type === 'image' ? 1 : 2;
  textarea.placeholder = q.placeholder || '';
  textarea.value = existing || '';
  textarea.addEventListener('input', () => {
    btnNext.disabled = textarea.value.trim().length < 2;
  });
  inputWrap.appendChild(textarea);
  if (q.type === 'short') {
    const hint = document.createElement('p');
    hint.className = 'short-hint';
    hint.textContent = 'Responde lo primero que te venga a la mente.';
    inputWrap.appendChild(hint);
  }
  qBodyEl.appendChild(inputWrap);
  btnNext.disabled = !(existing && existing.trim().length >= 2);
  setTimeout(() => textarea.focus(), 50);
}

function collectAnswer(index) {
  const q = QUESTIONS[index];
  if (q.type === 'choice') {
    const selected = qBodyEl.querySelector('.option.is-selected span:last-child');
    return selected ? selected.textContent : null;
  }
  const textarea = qBodyEl.querySelector('.short-input');
  return textarea ? textarea.value.trim() : null;
}

btnNext.addEventListener('click', () => {
  const value = collectAnswer(currentIndex);
  if (!value) return;
  answers[currentIndex] = value;

  // questionIndex en base 1 (1 a 16), para que "hasta dónde llegó" se lea
  // directo en una consulta SQL sin tener que sumarle 1 a mano.
  track('question_answered', {
    questionIndex: currentIndex + 1,
    questionId: QUESTIONS[currentIndex].id,
    questionType: QUESTIONS[currentIndex].type,
    question: QUESTIONS[currentIndex].prompt,
    answer: value.slice(0, 500)
  });

  if (currentIndex < QUESTIONS.length - 1) {
    currentIndex++;
    renderQuestion(currentIndex);
  } else {
    progressFill.style.width = '100%';
    submitQuiz();
  }
});

btnBack.addEventListener('click', () => {
  if (currentIndex === 0) return;
  answers[currentIndex] = collectAnswer(currentIndex);
  currentIndex--;
  renderQuestion(currentIndex);
});

document.getElementById('btnStart').addEventListener('click', () => {
  track('quiz_started', {});
  currentIndex = 0;
  renderQuestion(0);
  showScreen('quiz');
});

// ==========================================
// VARIANTE "MAPA"
// ==========================================
// En vez de un texto lineal, la lectura es un mapa solar en SVG: el centro es
// el arquetipo y alrededor orbitan las "revelaciones". Dos vienen abiertas
// (con texto); las demás llegan SOLO con etiqueta y un gancho corto — el
// texto bloqueado nunca viaja al navegador hasta que el servidor confirma el
// pago (ver netlify/functions/qer-generate-map.js y qer-paypal-capture-order.js).
const PAYWALL_VERSION = 'map2'; // map2 = 10 puntos (3 gratis), lectura simbólica, $9.99, 'No desbloquear por ahora' y '¿Qué te frena?' visibles
let mapNodes = [];        // [{id,label,hook,free,text?}]
let mapUnlocked = false;
let lastFocusedNode = null;

const SVG_NS = 'http://www.w3.org/2000/svg';
// Órbita elíptica (vertical) para que 10 puntos con su etiqueta quepan en un celular.
const MAP_CX = 170, MAP_CY = 214, MAP_RX = 122, MAP_RY = 164, NODE_R = 23;

// --- Envío del cuestionario y generación del mapa --------------------------
// La generación va en 3 pasos, cada uno una llamada propia al servidor (cada
// una con su propio tiempo máximo; todo en una sola llamada se pasaba del
// límite de Netlify): 1) el eje, 2) 5 partes de 2 rubros EN PARALELO, 3) ensamblar.
async function postFn(name, payload) {
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Error ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

async function postWithOneRetry(name, payload) {
  try { return await postFn(name, payload); }
  catch (err) {
    if (err.status && err.status < 500 && err.status !== 409) throw err; // un 4xx no se arregla reintentando
    return await postFn(name, payload);
  }
}

async function submitQuiz() {
  showScreen('loading');
  const label = document.getElementById('loadingLabel');
  label.textContent = 'Leyendo lo que hay debajo de tus respuestas…';
  const payload = {
    answers: QUESTIONS.map((q, i) => ({ question: q.prompt, answer: answers[i] || '' }))
  };
  const t0 = Date.now();
  try {
    const axis = await postWithOneRetry('qer-generate-map', payload);
    label.textContent = 'Trazando tu mapa…';
    await Promise.all([0, 1, 2, 3, 4].map(part =>
      postWithOneRetry('qer-generate-map-part', { readingId: axis.readingId, part, answers: payload.answers })));
    label.textContent = 'Casi listo…';
    const data = await postWithOneRetry('qer-generate-map-finalize', { readingId: axis.readingId });
    track('reading_generated_success', { seconds: Math.round((Date.now() - t0) / 1000) });
    renderReveal(data);
  } catch (err) {
    track('reading_generated_error', { reason: String(err.message).slice(0, 200), seconds: Math.round((Date.now() - t0) / 1000) });
    showError('Tu mapa no pudo terminar de armarse.', err.message, submitQuiz);
  }
}

function showError(title, detail, retryFn) {
  document.getElementById('errorMsg').textContent = title;
  document.getElementById('errorDetail').textContent = detail || 'Intenta de nuevo en un momento.';
  document.getElementById('btnRetry').onclick = retryFn;
  showScreen('error');
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Dibujo del mapa -----------------------------------------------------------
function svgEl(name, attrs, parent) {
  const el = document.createElementNS(SVG_NS, name);
  for (const k in (attrs || {})) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}

// Etiqueta en una o dos líneas para que no se salga del celular.
function splitLabel(label) {
  const words = String(label).split(/\s+/);
  if (label.length <= 12 || words.length < 2) return [label];
  let best = 1, bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length, b = words.slice(i).join(' ').length;
    if (Math.abs(a - b) < bestDiff) { bestDiff = Math.abs(a - b); best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

// Reparte los puntos abiertos a intervalos parejos alrededor de la órbita (en vez
// de todos juntos) para que los puntos bloqueados queden entre medio de los abiertos.
function computeSlots() {
  const n = mapNodes.length;
  const free = mapNodes.filter(m => m.free);
  const slotOf = new Map();
  const used = new Set();
  free.forEach((m, k) => { const sl = Math.floor(k * n / free.length); slotOf.set(m.id, sl); used.add(sl); });
  let next = 0;
  mapNodes.filter(m => !m.free).forEach(m => {
    while (used.has(next)) next++;
    slotOf.set(m.id, next); used.add(next);
  });
  return slotOf;
}

function slotPosition(slot, n) {
  const ang = (-90 + (360 / n) * slot) * Math.PI / 180;
  return { x: MAP_CX + MAP_RX * Math.cos(ang), y: MAP_CY + MAP_RY * Math.sin(ang) };
}

function drawMap() {
  const svg = document.getElementById('mapSvg');
  svg.innerHTML = '';
  svgEl('ellipse', { class: 'map-orbit', cx: MAP_CX, cy: MAP_CY, rx: MAP_RX, ry: MAP_RY }, svg);
  const n = mapNodes.length;
  const slots = computeSlots();

  mapNodes.forEach((node) => {
    const p = slotPosition(slots.get(node.id), n);
    svgEl('line', { class: 'map-link' + (node.text ? '' : ' is-locked'), 'data-link': node.id, x1: MAP_CX, y1: MAP_CY, x2: p.x, y2: p.y }, svg);
  });

  // Centro: el arquetipo.
  svgEl('circle', { class: 'map-core-ring', cx: MAP_CX, cy: MAP_CY, r: 48 }, svg);
  svgEl('circle', { class: 'map-core', cx: MAP_CX, cy: MAP_CY, r: 38 }, svg);
  const mask = svgEl('g', { transform: `translate(${MAP_CX - 20},${MAP_CY - 20}) scale(.4)`, fill: 'none', stroke: '#211a0c', 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
  svgEl('path', { d: 'M50 8C27 8 14 26 14 48c0 19 11 33 17 40 4 4.5 9.5 1 11-2 1.5 3 4 6 8 6s6.5-3 8-6c1.5 3 7 6.5 11 2 6-7 17-21 17-40C86 26 73 8 50 8Z' }, mask);
  svgEl('path', { d: 'M50 10 L46 34 L54 42 L44 58 L56 70 L48 92' }, mask);

  mapNodes.forEach((node, i) => {
    const p = slotPosition(slots.get(node.id), n);
    const g = svgEl('g', {
      class: 'map-node' + (node.text ? ' is-open' : ''),
      'data-id': node.id, role: 'button', tabindex: 0,
      'aria-label': `${node.label}${node.text ? '' : ' (bloqueado)'}`,
      style: `animation-delay:${0.15 + i * 0.08}s`
    }, svg);
    svgEl('circle', { class: 'touch', cx: p.x, cy: p.y, r: 36 }, g);
    svgEl('circle', { class: 'body', cx: p.x, cy: p.y, r: NODE_R }, g);
    const glyph = svgEl('g', { class: 'glyph', transform: `translate(${p.x},${p.y}) scale(.82)` }, g);
    if (node.text) {
      // Punto abierto: un destello de cuatro puntas.
      svgEl('path', { d: 'M0 -9 L2.4 -2.4 L9 0 L2.4 2.4 L0 9 L-2.4 2.4 L-9 0 L-2.4 -2.4 Z' }, glyph);
    } else {
      // Candado.
      svgEl('rect', { x: -7, y: -2, width: 14, height: 10, rx: 2 }, glyph);
      svgEl('path', { d: 'M-4.5 -2 V-5 a4.5 4.5 0 0 1 9 0 V-2' }, glyph);
    }
    const lines = splitLabel(node.label);
    const label = svgEl('text', { class: 'map-label', x: p.x, y: p.y + NODE_R + 13 }, g);
    lines.forEach((ln, k) => {
      const t = svgEl('tspan', { x: p.x, dy: k === 0 ? 0 : 12 }, label);
      t.textContent = ln;
    });
    g.addEventListener('click', () => openSheet(node.id, g));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(node.id, g); }
    });
  });
  updateCounter();
}

function updateCounter() {
  const open = mapNodes.filter(n => n.text).length;
  document.getElementById('mapCounter').textContent = `${open} de ${mapNodes.length} revelaciones abiertas`;
  document.getElementById('mapHint').textContent = open === mapNodes.length ? 'Toca cualquier punto para releerlo' : 'Toca cada punto';
}

// --- Hoja inferior ---------------------------------------------------------------
const sheetEl = document.getElementById('mapSheet');
const backdropEl = document.getElementById('sheetBackdrop');

const tappedIds = new Set();
function openSheet(id, nodeEl) {
  const node = mapNodes.find(n => n.id === id);
  if (!node) return;
  lastFocusedNode = nodeEl || null;
  tappedIds.add(id);
  track('map_node_tapped', { index: id, free: !!node.free, unlocked: !!node.text, paywallVersion: PAYWALL_VERSION });
  document.getElementById('sheetTitle').textContent = node.label;
  const textEl = document.getElementById('sheetText');
  const noteEl = document.getElementById('sheetLockedNote');
  if (node.text) {
    textEl.textContent = node.text;
    noteEl.textContent = '';
    noteEl.style.display = 'none';
    document.getElementById('sheetUnlock').style.display = 'none';
    if (nodeEl) nodeEl.classList.add('is-seen');
  } else {
    textEl.textContent = node.hook;
    noteEl.textContent = 'Este punto sigue cerrado. Se abre con el resto del mapa.';
    noteEl.style.display = '';
    document.getElementById('sheetUnlock').style.display = '';
  }
  sheetEl.classList.add('is-open');
  backdropEl.classList.add('is-open');
  document.getElementById('sheetBack').focus();
}

function closeSheet() {
  sheetEl.classList.remove('is-open');
  backdropEl.classList.remove('is-open');
  if (lastFocusedNode && lastFocusedNode.focus) { try { lastFocusedNode.focus({ preventScroll: true }); } catch { /* no crítico */ } }
}

document.getElementById('sheetBack').addEventListener('click', closeSheet);
backdropEl.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetEl.classList.contains('is-open')) closeSheet(); });
document.getElementById('sheetUnlock').addEventListener('click', () => {
  track('map_unlock_cta', { paywallVersion: PAYWALL_VERSION });
  closeSheet();
  const panel = document.getElementById('paywall');
  if (panel.classList.contains('is-hidden')) return;
  setTimeout(() => {
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    panel.classList.remove('is-flash'); void panel.offsetWidth; panel.classList.add('is-flash');
  }, 120);
});

// --- Pantalla del mapa + pago -----------------------------------------------------
function renderReveal(data, { skipPaywall } = {}) {
  readingId = data.readingId;
  archetypeNameForShare = data.archetypeName || '';
  mapNodes = (data.nodes || []).map(n => ({ id: n.id, label: n.label, hook: n.hook, free: !!n.free, text: n.text || null }));
  mapUnlocked = false;
  document.getElementById('archetypeName').textContent = data.archetypeName || '';
  document.getElementById('hookLine').textContent = data.hookLine || '';
  document.getElementById('paywallCommitment').textContent = `Ya respondiste ${QUESTIONS.length} preguntas sobre vos mismo`;
  const locked = mapNodes.filter(n => !n.text).length;
  document.getElementById('paywallHook').textContent = locked ? `${locked} partes de ti siguen cerradas` : 'Hay más de ti en este mapa';
  document.getElementById('skippedNote').classList.add('is-hidden');
  document.getElementById('payBlock').classList.remove('is-hidden');
  document.getElementById('fullContainer').classList.add('is-hidden');
  tappedIds.clear();
  closeSheet();
  drawMap();
  showScreen('reveal');

  if (skipPaywall) {
    document.getElementById('paywall').classList.add('is-hidden');
    return;
  }

  // Lo que se guarda para "retomar" NUNCA incluye texto bloqueado (esos nodos no lo traen).
  savePendingReading({ readingId: data.readingId, archetypeName: data.archetypeName, hookLine: data.hookLine, nodes: mapNodes });

  document.getElementById('paywall').classList.remove('is-hidden');
  track('paywall_shown', { archetypeName: data.archetypeName || '', paywallVersion: PAYWALL_VERSION });
  watchPaywallInView();
  initPaywall(readingId);
}

async function loadPaypalSdk() {
  if (window.paypal) return true;
  try {
    const res = await fetch('/.netlify/functions/qer-paypal-config');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.clientId) return false;
    if (data.priceUsd) document.getElementById('priceLabel').textContent = `$${data.priceUsd}`;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(data.clientId)}&currency=USD`;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar el SDK de PayPal.'));
      document.head.appendChild(s);
    });
    return !!window.paypal;
  } catch (err) {
    console.error('[paypal] no se pudo cargar el SDK', err);
    return false;
  }
}

async function initPaywall(forReadingId) {
  const container = document.getElementById('paypal-button-container');
  container.innerHTML = '';
  const loaded = await loadPaypalSdk();
  if (!loaded) {
    container.innerHTML = '<p style="color:#e9c9ba; font-size:0.85rem; text-align:center;">No se pudo cargar el pago. Revisa tu conexión y recargá la página.</p>';
    return;
  }
  window.paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay' },
    createOrder: async () => {
      const res = await fetch('/.netlify/functions/qer-paypal-create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readingId: forReadingId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        track('payment_order_create_failed', { reason: data.error || `HTTP ${res.status}` });
        throw new Error(data.error || 'No se pudo iniciar el pago.');
      }
      track('payment_order_created', {});
      return data.orderID;
    },
    onApprove: async (data) => {
      const res = await fetch('/.netlify/functions/qer-paypal-capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderID: data.orderID, readingId: forReadingId })
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        track('payment_captured_failed', { reason: result.error || `HTTP ${res.status}` });
        alert(result.error || 'No se pudo confirmar el pago. Si el cargo sí se hizo, escríbenos.');
        return;
      }
      track('payment_captured_success', { paywallVersion: PAYWALL_VERSION });
      unlockMap(result);
    },
    onError: (err) => {
      track('payment_captured_failed', { reason: String(err?.message || err).slice(0, 300) });
      console.error('[paypal]', err);
    },
    onCancel: () => track('payment_cancelled', {})
  }).render('#paypal-button-container');
}

// Aplica los textos que el servidor entrega SOLO después de confirmar el pago.
function unlockMap({ mapTexts, closingLine }) {
  clearPendingReading();
  mapUnlocked = true;
  const byId = new Map((mapTexts || []).map(t => [t.id, t.text]));
  mapNodes.forEach(n => { if (byId.has(n.id)) n.text = byId.get(n.id); });
  document.getElementById('paywall').classList.add('is-hidden');
  document.getElementById('skippedNote').classList.add('is-hidden');
  drawMap();
  document.getElementById('closingLine').textContent = closingLine || '';
  const container = document.getElementById('fullContainer');
  container.classList.remove('is-hidden');
  setTimeout(() => document.getElementById('mapSvg').scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

document.getElementById('btnSkipPaywall').addEventListener('click', () => {
  track('paywall_skipped', { paywallVersion: PAYWALL_VERSION });
  document.getElementById('payBlock').classList.add('is-hidden');
  document.getElementById('skippedNote').classList.remove('is-hidden');
});
document.getElementById('btnShowPay').addEventListener('click', () => {
  track('paywall_reopened', { paywallVersion: PAYWALL_VERSION });
  document.getElementById('skippedNote').classList.add('is-hidden');
  document.getElementById('payBlock').classList.remove('is-hidden');
});

// "¿Qué te frena?": siempre visible, un toque, se registra una sola vez.
document.querySelectorAll('.skip-reason').forEach(btn => {
  btn.addEventListener('click', () => {
    track('paywall_skip_reason', { reason: btn.dataset.reason, paywallVersion: PAYWALL_VERSION });
    document.getElementById('skipReasonBox').classList.add('is-hidden');
    document.getElementById('skipReasonThanks').classList.remove('is-hidden');
  });
});

// --- Medición de lo que pasa DESPUÉS de mostrar el paywall ---------------------
// Antes no había ningún evento entre "paywall_shown" y el cierre de la página,
// así que no se sabía si la gente siquiera llegaba a ver el paywall.
let paywallObserver = null;
let paywallSeen = false;
function watchPaywallInView() {
  paywallSeen = false;
  const el = document.getElementById('paywall');
  if (paywallObserver) paywallObserver.disconnect();
  if (!('IntersectionObserver' in window)) return;
  paywallObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting) && !paywallSeen) {
      paywallSeen = true;
      track('paywall_in_view', { secondsSinceLoad: Math.round((Date.now() - pageStartedAt) / 1000), nodesTapped: tappedIds.size, paywallVersion: PAYWALL_VERSION });
      paywallObserver.disconnect();
    }
  }, { threshold: 0.4 });
  paywallObserver.observe(el);
}
const pageStartedAt = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  try {
    const payload = { event: 'page_hidden', anonId, metadata: { variant: 'map', screen: currentScreenName, seconds: Math.round((Date.now() - pageStartedAt) / 1000), paywallSeen, nodesTapped: tappedIds.size, unlocked: mapUnlocked } };
    navigator.sendBeacon('/.netlify/functions/qer-track-event', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  } catch { /* no crítico */ }
});

function restartQuiz() {
  currentIndex = 0;
  answers.fill(null);
  readingId = null;
  mapNodes = [];
  clearPendingReading();
  closeSheet();
  track('quiz_started', { restart: true });
  renderQuestion(0);
  showScreen('quiz');
}
document.getElementById('btnRestart').addEventListener('click', restartQuiz);
document.getElementById('btnRestartFromSkip').addEventListener('click', restartQuiz);

// --- Retomar un mapa pendiente (o ya pagado) ------------------------------------
// Igual que la versión de texto: antes de mostrar el pago se le pregunta al
// SERVIDOR si ya está pagado (por si pagó y perdió la conexión justo después).
async function resumePendingReadingIfAny() {
  const pending = loadPendingReading();
  if (!pending || !Array.isArray(pending.nodes)) return;
  try {
    const res = await fetch('/.netlify/functions/qer-get-reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readingId: pending.readingId })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.paid && data.mapTexts) {
      renderReveal(pending, { skipPaywall: true });
      unlockMap({ mapTexts: data.mapTexts, closingLine: data.closingLine });
      return;
    }
  } catch { /* sin conexión: se muestra el pago normal */ }
  renderReveal(pending);
}
resumePendingReadingIfAny();

document.getElementById('btnShare').addEventListener('click', async () => {
  const shareText = archetypeNameForShare
    ? `Según "¿Quién eres en realidad?", mi arquetipo es: ${archetypeNameForShare}. Descúbrelo tú también.`
    : '¿Quieres saber quién se esconde detrás de tu máscara? Hice este cuestionario y me sorprendió.';
  const url = location.origin + '/quien-eres/mapa/';
  const shareData = { title: '¿Quién eres en realidad?', text: shareText, url };
  try { if (navigator.share) { await navigator.share(shareData); return; } } catch { /* canceló */ }
  try { await navigator.clipboard.writeText(`${shareText} ${url}`); alert('Copiado — pégalo donde quieras compartirlo.'); }
  catch { alert(url); }
});
