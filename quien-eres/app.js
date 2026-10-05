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
  { id: 'q3', type: 'image', prompt: '¿Qué es lo primero que ves?', blot: BLOT_A,
    placeholder: 'Una palabra' },
  { id: 'q4', type: 'choice', prompt: '¿Cuál de estas versiones de ti se parece más a cómo eres cuando nadie te está viendo?',
    options: [
      'La que de verdad descansa, sin sentirse culpable',
      'La que sigue trabajando aunque ya nadie se dé cuenta',
      'La que es más sincera que la que muestras en público',
      'La que siempre piensa primero en los demás'
    ] },
  { id: 'q5', type: 'short', prompt: '¿Qué harías si supieras que nadie se va a enterar nunca?',
    placeholder: 'Así, sin filtro' },
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
  { id: 'q10', type: 'image', prompt: '¿Qué es lo primero que ves?', blot: BLOT_C,
    placeholder: 'Una palabra' },
  { id: 'q11', type: 'short', prompt: '¿Cómo te describiría alguien que apenas te conoce? ¿Y cómo te describes tú en esa misma situación?',
    placeholder: 'Las dos versiones, aunque no calcen' },
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
      body: JSON.stringify({ event: eventName, anonId, metadata: metadata || {} })
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
const PENDING_KEY = 'qer_pending_reading';
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
function showScreen(name) {
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

// --- Envío del cuestionario y generación de la lectura ---------------------
async function submitQuiz() {
  showScreen('loading');
  const payload = {
    answers: QUESTIONS.map((q, i) => ({ question: q.prompt, answer: answers[i] || '' }))
  };
  try {
    const res = await fetch('/.netlify/functions/qer-generate-reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo generar tu lectura.');
    track('reading_generated_success', {});
    renderReveal(data);
  } catch (err) {
    track('reading_generated_error', { reason: err.message });
    showError('Tu lectura no pudo terminar de armarse.', err.message, submitQuiz);
  }
}

function showError(title, detail, retryFn) {
  document.getElementById('errorMsg').textContent = title;
  document.getElementById('errorDetail').textContent = detail || 'Intenta de nuevo en un momento.';
  const btn = document.getElementById('btnRetry');
  btn.onclick = retryFn;
  showScreen('error');
}

// --- Revelación + paywall ---------------------------------------------------
function renderReveal(data, { skipPaywall } = {}) {
  readingId = data.readingId;
  archetypeNameForShare = data.archetypeName || '';
  document.getElementById('archetypeName').textContent = data.archetypeName || '';
  document.getElementById('hookLine').textContent = data.hookLine || '';
  const teaserEl = document.getElementById('teaserText');
  teaserEl.innerHTML = (data.teaser || []).map(p => `<p>${escapeHtml(p)}</p>`).join('');
  // Ancla de compromiso (principio de consistencia de Cialdini): recordarle
  // a la persona lo que YA invirtió (sus propias respuestas) en vez de
  // suavizar o anunciar el cobro que viene — ver conversación del
  // 2026-10-04 sobre "pain of paying". Va ANTES del gancho específico.
  document.getElementById('paywallCommitment').textContent = `Ya respondiste ${QUESTIONS.length} preguntas sobre vos mismo`;

  // Gancho específico junto al botón de pago (ver lockedHook en
  // qer-generate-reading.js) — "Tu lectura continúa" se deja como respaldo
  // por si esta lectura se generó antes de este cambio, o si por lo que sea
  // no llegó el campo.
  document.getElementById('paywallHook').textContent = data.lockedHook || 'Tu lectura continúa';

  document.getElementById('skippedNote').classList.add('is-hidden');
  document.getElementById('fullContainer').classList.add('is-hidden');
  showScreen('reveal');

  // skipPaywall: ya sabemos (porque el servidor lo confirmó) que esta
  // lectura está pagada — se va a mostrar el texto completo enseguida
  // (ver resumePendingReadingIfAny), así que no tiene sentido guardarla
  // como "pendiente de pago", ni cargar el SDK de PayPal, ni registrar
  // "paywall_shown" (nunca llegó a verlo, ya había pagado).
  if (skipPaywall) {
    document.getElementById('paywall').classList.add('is-hidden');
    return;
  }

  savePendingReading({
    readingId: data.readingId,
    archetypeName: data.archetypeName,
    hookLine: data.hookLine,
    teaser: data.teaser,
    lockedHook: data.lockedHook
  });

  document.getElementById('paywall').classList.remove('is-hidden');
  // paywallVersion: etiqueta para separar los datos por versión del paywall
  // sin depender de la hora del deploy. Subir el valor ("g2", ...) cada vez
  // que cambie el paywall. g1 = ancla de compromiso + skip atenuado.
  track('paywall_shown', { archetypeName: data.archetypeName || '', paywallVersion: 'g1' });
  initPaywall(readingId);
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadPaypalSdk() {
  if (window.paypal) return true;
  try {
    const res = await fetch('/.netlify/functions/qer-paypal-config');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.clientId) return false;
    if (data.priceUsd) {
      document.getElementById('priceLabel').textContent = `$${data.priceUsd}`;
    }
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
      track('payment_captured_success', {});
      unlockFull(result);
    },
    onError: (err) => {
      track('payment_captured_failed', { reason: String(err?.message || err).slice(0, 300) });
      console.error('[paypal]', err);
    },
    onCancel: () => track('payment_cancelled', {})
  }).render('#paypal-button-container');
}

function unlockFull({ full, closingLine }) {
  clearPendingReading(); // ya pagó — no hace falta poder "retomar" un pago que ya pasó
  document.getElementById('paywall').classList.add('is-hidden');
  const fullEl = document.getElementById('fullText');
  fullEl.innerHTML = (full || []).map(p => `<p>${escapeHtml(p)}</p>`).join('');
  document.getElementById('closingLine').textContent = closingLine || '';
  const container = document.getElementById('fullContainer');
  container.classList.remove('is-hidden');
  setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

document.getElementById('btnSkipPaywall').addEventListener('click', () => {
  track('paywall_skipped', { paywallVersion: 'g1' });
  document.getElementById('paywall').classList.add('is-hidden');
  document.getElementById('skippedNote').classList.remove('is-hidden');
});

function restartQuiz() {
  currentIndex = 0;
  answers.fill(null);
  readingId = null;
  clearPendingReading();
  renderQuestion(0);
  showScreen('quiz');
}
document.getElementById('btnRestart').addEventListener('click', restartQuiz);
document.getElementById('btnRestartFromSkip').addEventListener('click', restartQuiz);

// --- Retomar una lectura pendiente de pago (si volvió antes de que expire) ---
// Se revisa al cargar la página: si hay una lectura guardada en este navegador
// que todavía no se pagó, se salta directo a la pantalla de revelación con
// esos mismos datos (sin repetir el cuestionario) en vez de mostrar la
// portada desde cero.
//
// El caso que esto resuelve de verdad: alguien PAGA, pero pierde la
// conexión o recarga la página justo después de pagar, antes de que el
// navegador llegue a mostrar el texto completo (unlockFull nunca se
// alcanza a ejecutar en ese caso, así que localStorage se queda con la
// lectura marcada como "sin pagar" aunque el cargo sí se haya hecho). Por
// eso, antes de mostrar la pantalla de pago de nuevo, se le pregunta al
// SERVIDOR (nunca a localStorage) si esta lectura ya está pagada — si lo
// está, se entrega el texto completo directo, sin volver a pedirle que
// pague ni mostrarle el botón de PayPal.
async function resumePendingReadingIfAny() {
  const pending = loadPendingReading();
  if (!pending) return;

  try {
    const res = await fetch('/.netlify/functions/qer-get-reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readingId: pending.readingId })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.paid) {
      renderReveal(pending, { skipPaywall: true });
      unlockFull({ full: data.full, closingLine: data.closingLine });
      return;
    }
  } catch {
    // Sin conexión justo al abrir la página — no es grave: se muestra la
    // pantalla de pago normal (abajo) y, si de verdad ya pagó, al volver a
    // intentar esta misma función se confirma en cuanto haya conexión.
  }

  renderReveal(pending);
}
resumePendingReadingIfAny();

document.getElementById('btnShare').addEventListener('click', async () => {
  const shareText = archetypeNameForShare
    ? `Según "¿Quién eres en realidad?", mi arquetipo es: ${archetypeNameForShare}. Descúbrelo tú también.`
    : '¿Quieres saber quién se esconde detrás de tu máscara? Hice este cuestionario y me sorprendió.';
  const shareData = { title: '¿Quién eres en realidad?', text: shareText, url: location.href };
  try {
    if (navigator.share) { await navigator.share(shareData); return; }
  } catch { /* el usuario canceló el share nativo — no hace falta avisar nada */ }
  try {
    await navigator.clipboard.writeText(`${shareText} ${location.href}`);
    alert('Copiado — pégalo donde quieras compartirlo.');
  } catch {
    alert(location.href);
  }
});
