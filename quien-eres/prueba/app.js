// MODO PRUEBA (generado desde quien-eres/app.js con tools/build_prueba.py — no editar a mano):
// respuestas de ejemplo ya cargadas; al abrir la página se genera directo, como lo vería una persona
// al terminar el cuestionario. No registra eventos. La solicitud de canción SÍ se envía de verdad (correo real).
const TEST_MODE = true;
// ==========================================
// "¿QUIÉN ERES EN REALIDAD?" — cuestionario + lectura generada (gratis y completa) + oferta de canción
// ==========================================
// Sin login: cada lectura se identifica por su readingId (ver netlify/functions/_lib/qer-readings-store.js).
// La lectura es gratis; la monetización es la canción (qer-song-request.js, LEEME sección 54).

// --- Datos del cuestionario -------------------------------------------
// Arranca con 3 preguntas de elegir una opción (calentamiento de un toque; ahí se perdía más gente
// al principio) y sigue con respuesta corta. Soporta tres formatos (elección única, respuesta corta,
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
  { id: 'c1', type: 'choice', act: 1, actTitle: "Lo que muestras", prompt: "Cuando entras a un lugar lleno de gente, ¿qué haces con tu cara, tus manos y tu voz?", options: ["Sonrío y hablo más de lo normal", "Me quedo callado/a y observo", "Busco a alguien conocido y me quedo cerca", "Actúo con seguridad aunque por dentro no la sienta"] },
  { id: 'c2', type: 'choice', act: 1, actTitle: "Lo que muestras", prompt: "¿Qué haces con más frecuencia solo para quedar bien con alguien?", options: ["Digo que sí aunque quiero decir que no", "Me río de algo que no me da risa", "Me guardo mi opinión para no discutir", "Hago favores que no me tocaban"] },
  { id: 'c3', type: 'choice', act: 1, actTitle: "Lo que muestras", prompt: "¿De qué cosa de tu vida hablas como si ya estuviera resuelta, aunque no lo esté?", options: ["De una relación o de mi familia", "Del trabajo o del dinero", "De mi salud o de mi ánimo", "De lo que quiero para mi futuro"] },
  { id: 'q8', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "¿Qué personaje de película, serie o cuento se parece más a ti? ¿Qué parte suya te incomoda reconocer?", placeholder: "El personaje y la parte incómoda" },
  { id: 'q6', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "Describe la sonrisa que pones cuando no tienes ganas de sonreír. ¿Qué esconde?", placeholder: "Descríbela con detalle" },
  { id: 'q2', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "Cuando alguien te pregunta \"¿cómo estás?\" y contestas \"bien\", ¿qué es lo que de verdad querrías decir?", placeholder: "Dilo como lo sientes" },
  { id: 'q4', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "¿Qué parte de ti se nota menos de lo que quisieras?", placeholder: "Lo que los demás casi no ven" },
  { id: 'q1', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "Termina la frase: \"La gente cree que soy..., pero en realidad soy...\"", placeholder: "Las dos partes, aunque no calcen" },
  { id: 'q3', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "¿Cuál es la mentira que más te repites a ti?", placeholder: "La que casi nunca dices en voz alta" },
  { id: 'q7', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "¿Qué opinión tuya nunca dices en voz alta?", placeholder: "Esa que te guardas" },
  { id: 'q11', type: 'short', act: 2, actTitle: "Lo que callas", prompt: "Completa sin pensarlo mucho: \"Lo que más me cuesta perdonar en alguien es...\"", placeholder: "Lo primero que se te venga" },
  { id: 'q12', type: 'short', act: 2, actTitle: "Lo que callas", prompt: "Piensa en la última vez que alguien te falló de verdad. ¿Qué fue lo que más te dolió?", placeholder: "Escribe solo lo que quieras compartir" },
  { id: 'q13', type: 'short', act: 2, actTitle: "Lo que callas", prompt: "¿Qué palabra, frase o gesto de alguien te dolió hace años y todavía recuerdas exacto?", placeholder: "Tal como lo recuerdas" },
  { id: 'q14', type: 'short', act: 2, actTitle: "Lo que callas", prompt: "¿A quién le debes una conversación que nunca has tenido? ¿Qué le dirías?", placeholder: "Dile lo que no le dijiste" },
  { id: 'q15', type: 'short', act: 2, actTitle: "Lo que callas", prompt: "¿Qué te prometiste dejar de hacer y sigues haciendo?", placeholder: "Sin justificarte" },
  { id: 'q16', type: 'short', act: 2, actTitle: "Lo que callas", prompt: "¿Qué parte de tu historia cuentas siempre igual para no volver a sentir lo que sentiste?", placeholder: "La versión que repites" },
  { id: 'q17', type: 'short', act: 2, actTitle: "Lo que callas", prompt: "¿Qué perdiste que nunca dijiste que te dolía haber perdido?", placeholder: "Una persona, un lugar, una versión de ti" },
  { id: 'q18', type: 'short', act: 2, actTitle: "Lo que callas", prompt: "Cuando algo te duele de verdad, ¿qué haces en los primeros cinco minutos, antes de que nadie lo note?", placeholder: "Lo que haces en silencio" },
  { id: 'q19', type: 'short', act: 2, actTitle: "Lo que callas", prompt: "¿Quién cambió algo en ti para siempre sin saberlo?", placeholder: "Y qué cambió" },
  { id: 'q20', type: 'short', act: 2, actTitle: "Lo que callas", prompt: "¿Qué es lo que más miedo te da que otros descubran de ti?", placeholder: "Aquí nadie te juzga" },
  { id: 'q21', type: 'short', act: 3, actTitle: "Cuando nadie ve", prompt: "Termina la frase: \"Si de verdad nadie fuera a enterarse, por fin me atrevería a...\"", placeholder: "Lo que hoy no te permites" },
  { id: 'q22', type: 'short', act: 3, actTitle: "Cuando nadie ve", prompt: "¿Qué haces cuando estás a solas que te daría vergüenza que alguien te viera hacer?", placeholder: "Lo que haces a puerta cerrada" },
  { id: 'q23', type: 'short', act: 3, actTitle: "Cuando nadie ve", prompt: "¿Qué canción, lugar u olor te lleva de golpe a un recuerdo que te mueve por dentro? Cuéntalo.", placeholder: "El recuerdo, tal cual" },
  { id: 'q24', type: 'short', act: 3, actTitle: "Cuando nadie ve", prompt: "¿Qué envidias en otras personas y te cuesta admitir?", placeholder: "Sin filtros, solo para ti" },
  { id: 'q25', type: 'short', act: 3, actTitle: "Cuando nadie ve", prompt: "Si pudieras borrar un recuerdo, ¿cuál sería y qué perderías al borrarlo?", placeholder: "Escribe solo lo que quieras compartir" },
  { id: 'q26', type: 'short', act: 3, actTitle: "Cuando nadie ve", prompt: "¿Qué fue lo más prohibido o impulsivo que has deseado hacer y no hiciste?", placeholder: "Eso que casi haces" },
  { id: 'q27', type: 'short', act: 3, actTitle: "Cuando nadie ve", prompt: "¿Qué guardas en un cajón, en una caja o en tu celular que nadie debe ver? ¿Por qué lo conservas?", placeholder: "Lo que no has podido tirar" },
  { id: 'q28', type: 'short', act: 3, actTitle: "Cuando nadie ve", prompt: "¿Cómo eres cuando te enojas de verdad? Descríbelo sin suavizarlo.", placeholder: "Sin suavizarlo" },
  { id: 'q29', type: 'short', act: 3, actTitle: "Cuando nadie ve", prompt: "¿Qué sueño de los que tienes dormido se te repite o recuerdas mejor? Cuéntalo.", placeholder: "Aunque no tenga sentido" },
  { id: 'q30', type: 'short', act: 3, actTitle: "Cuando nadie ve", prompt: "¿En qué momento del día sientes más soledad, aunque haya gente cerca?", placeholder: "Y qué piensas en ese momento" },
  { id: 'q31', type: 'short', act: 4, actTitle: "Lo que necesitas", prompt: "Describe, en una sola frase, el momento en que sentiste que de verdad te vieron tal como eres.", placeholder: "Aunque haya sido hace mucho" },
  { id: 'q32', type: 'short', act: 4, actTitle: "Lo que necesitas", prompt: "¿Qué necesitas que alguien te diga y nunca te han dicho?", placeholder: "Las palabras exactas" },
  { id: 'q33', type: 'short', act: 4, actTitle: "Lo que necesitas", prompt: "¿Qué cargas por los demás que nadie te pidió cargar?", placeholder: "Lo que sostienes en silencio" },
  { id: 'q34', type: 'short', act: 4, actTitle: "Lo que necesitas", prompt: "¿Qué le pides a la gente que te quiere sin decirlo con palabras?", placeholder: "Lo que esperas que adivinen" },
  { id: 'q35', type: 'short', act: 4, actTitle: "Lo que necesitas", prompt: "¿Por qué cosa te admiran los demás que a ti te cansa sostener?", placeholder: "Eso que ya pesa" },
  { id: 'q36', type: 'short', act: 4, actTitle: "Lo que necesitas", prompt: "¿Qué cosa buena te cuesta aceptar que te pase? ¿Por qué crees que es?", placeholder: "Aunque suene raro" },
  { id: 'q37', type: 'short', act: 4, actTitle: "Lo que necesitas", prompt: "Cuando alguien te quiere de verdad, ¿qué es lo primero que haces para ponerlo a prueba?", placeholder: "Lo que haces sin querer" },
  { id: 'q38', type: 'short', act: 4, actTitle: "Lo que necesitas", prompt: "¿Con quién eres más tú? ¿Qué tiene esa persona que los demás no?", placeholder: "Esa persona y lo que la hace distinta" },
  { id: 'q39', type: 'short', act: 4, actTitle: "Lo que necesitas", prompt: "Si pudieras dejar de ser fuerte un día entero, ¿qué harías?", placeholder: "Un día sin armadura" },
  { id: 'q40', type: 'short', act: 4, actTitle: "Lo que necesitas", prompt: "¿Qué detalle pequeño te hace sentir que le importas a alguien?", placeholder: "Algo mínimo pero que lo cambia todo" },
  { id: 'q41', type: 'short', act: 5, actTitle: "Lo que viene", prompt: "Termina la frase: \"Si pudiera decirle una verdad a quien era hace 5 años, sería...\"", placeholder: "La verdad, sin suavizarla" },
  { id: 'q42', type: 'short', act: 5, actTitle: "Lo que viene", prompt: "¿Qué le dirías a la persona que serás dentro de 10 años si te estuviera mirando ahora?", placeholder: "Háblale como si te escuchara" },
  { id: 'q43', type: 'short', act: 5, actTitle: "Lo que viene", prompt: "¿Qué estás aguantando que ya no deberías aguantar?", placeholder: "Eso que ya no te toca" },
  { id: 'q44', type: 'short', act: 5, actTitle: "Lo que viene", prompt: "Si mañana pudieras empezar de cero en otro lugar, ¿qué te llevarías y qué dejarías atrás?", placeholder: "Lo que cargarías y lo que soltarías" },
  { id: 'q45', type: 'short', act: 5, actTitle: "Lo que viene", prompt: "¿A quién quisieras perdonar, o que te perdone, y no sabes cómo empezar?", placeholder: "Escribe solo lo que quieras compartir" },
  { id: 'q46', type: 'short', act: 5, actTitle: "Lo que viene", prompt: "¿Qué hábito, pensamiento o miedo quisieras soltar y no se va?", placeholder: "Lo que se queda" },
  { id: 'q47', type: 'short', act: 5, actTitle: "Lo que viene", prompt: "¿Qué quieres que la gente recuerde de ti cuando ya no estés en la sala?", placeholder: "Lo que quisieras que dijeran" },
  { id: 'q48', type: 'short', act: 5, actTitle: "Lo que viene", prompt: "¿Qué temes que pase si un día dejas de ocuparte de todo?", placeholder: "Lo que crees que se rompería" },
  { id: 'q49', type: 'short', act: 5, actTitle: "Lo que viene", prompt: "¿Qué verdad sobre ti ya aceptaste pero todavía te cuesta decir en voz alta?", placeholder: "Dila aquí" },
  { id: 'q50', type: 'short', act: 5, actTitle: "Lo que viene", prompt: "Última pregunta: si esta lectura pudiera decirte una sola cosa que necesitas oír, ¿cuál sería?", placeholder: "Lo que más necesitas escuchar" }
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
  if (TEST_MODE) { console.log('[prueba] evento no enviado:', eventName); return; }
  try {
    fetch('/.netlify/functions/qer-track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: eventName, anonId, metadata: { ...(metadata || {}), variant: 'reading' } })
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
const PENDING_KEY = 'qer_pending_read'; // clave propia: no pisa la lectura pendiente de la versión de texto
const PENDING_MAX_AGE_MS = 71 * 60 * 60 * 1000; // un poco menos que el TTL del servidor (72h)

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
  const shell = document.querySelector('.shell'); if (shell) shell.classList.toggle('is-reveal', name === 'reveal');
  window.scrollTo(0, 0);
}

// --- Cuestionario ----------------------------------------------------------
const qPromptEl = document.getElementById('qPrompt');
const qBodyEl = document.getElementById('qBody');
const btnNext = document.getElementById('btnNext');
const btnBack = document.getElementById('btnBack');
const progressFill = document.getElementById('progressFill');

// Salida anticipada: desde las 25 respuestas se puede pedir la lectura ya. El servidor ignora las preguntas sin
// respuesta, así que la lectura se arma con lo contestado (algo menos profunda que con las 50).
const FINISH_EARLY_AFTER = 25;
const btnFinishEarly = document.getElementById('btnFinishEarly');
const finishEarlyBox = document.getElementById('finishEarly');
function updateFinishEarly(index) {
  const answered = answers.filter(Boolean).length;
  const show = answered >= FINISH_EARLY_AFTER && index < QUESTIONS.length - 1;
  finishEarlyBox.classList.toggle('is-hidden', !show);
  if (show && !updateFinishEarly.shown) { updateFinishEarly.shown = true; track('finish_early_offered', { answered }); }
}
btnFinishEarly.addEventListener('click', () => {
  const value = collectAnswer(currentIndex);
  if (value && value.length >= 2) answers[currentIndex] = value; // si ya escribió algo en la pregunta actual, cuenta
  track('quiz_finished_early', { answered: answers.filter(Boolean).length, atIndex: currentIndex + 1 });
  saveQuizProgress();
  submitQuiz();
});

function renderQuestion(index) {
  const q = QUESTIONS[index];
  progressFill.style.width = `${Math.round((index / QUESTIONS.length) * 100)}%`;
  btnBack.classList.toggle('is-hidden', index === 0);
  qPromptEl.textContent = q.prompt;
  const actEl = document.getElementById('qAct');
  if (actEl) actEl.textContent = `Parte ${q.act} de 5 · ${q.actTitle}`;
  qBodyEl.innerHTML = '';
  btnNext.disabled = true;
  updateFinishEarly(index);

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
        // Un solo toque por pregunta: avanza solo (con un instante para ver la selección).
        // "Atrás" sigue disponible para corregir.
        const idxAtClick = currentIndex;
        setTimeout(() => { if (currentIndex === idxAtClick && !btnNext.disabled && currentScreenName === 'quiz') btnNext.click(); }, 380);
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
  textarea.rows = 3;
  textarea.placeholder = q.placeholder || '';
  textarea.value = existing || '';
  textarea.addEventListener('input', () => {
    btnNext.disabled = textarea.value.trim().length < 2;
  });
  inputWrap.appendChild(textarea);
  if (q.type === 'short') {
    const hint = document.createElement('p');
    hint.className = 'short-hint';
    hint.textContent = 'Escribe con libertad. Si prefieres no responder, escribe "paso" y sigues.';
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

  // questionIndex en base 1 (1 a 50), para que "hasta dónde llegó" se lea
  // directo en una consulta SQL sin tener que sumarle 1 a mano.
  track('question_answered', {
    questionIndex: currentIndex + 1,
    questionId: QUESTIONS[currentIndex].id,
    questionType: QUESTIONS[currentIndex].type,
    question: QUESTIONS[currentIndex].prompt,
    answer: value.slice(0, 500)
  });
  saveQuizProgress();

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

// --- Guardar el avance (son 50 preguntas: perder lo escrito por un cierre accidental
// de la pestaña sería muy frustrante) ------------------------------------------
const PROGRESS_KEY = 'qer_quiz_progress_v5'; // v5: la parte 1 cambió de orden (las más íntimas pasaron a las posiciones 9 y 10); v4: las 3 primeras son de elegir
function saveQuizProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ answers, currentIndex: currentIndex + 1, savedAt: Date.now() })); } catch { /* no crítico */ }
}
function loadQuizProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
    if (!p || !Array.isArray(p.answers) || Date.now() - (p.savedAt || 0) > 3 * 24 * 60 * 60 * 1000) return null;
    const done = p.answers.filter(Boolean).length;
    return done > 0 && done < QUESTIONS.length ? p : null;
  } catch { return null; }
}
function clearQuizProgress() { try { localStorage.removeItem(PROGRESS_KEY); } catch { /* no crítico */ } }

document.getElementById('btnStart').addEventListener('click', () => {
  track('quiz_started', {});
  clearQuizProgress();
  currentIndex = 0;
  renderQuestion(0);
  showScreen('quiz');
});
const btnResume = document.getElementById('btnResume');
const savedProgress = loadQuizProgress();
if (btnResume && savedProgress) {
  btnResume.textContent = `Continuar donde quedaste (pregunta ${Math.min(savedProgress.currentIndex + 1, QUESTIONS.length)} de ${QUESTIONS.length})`;
  btnResume.classList.remove('is-hidden');
  btnResume.addEventListener('click', () => {
    track('quiz_resumed', { fromIndex: savedProgress.currentIndex + 1 });
    savedProgress.answers.forEach((v, i) => { answers[i] = v; });
    currentIndex = Math.min(savedProgress.currentIndex, QUESTIONS.length - 1);
    renderQuestion(currentIndex);
    showScreen('quiz');
  });
}


// ==========================================
// LECTURA EN CAPÍTULOS
// ==========================================
// La lectura son 10 capítulos y llegan todos completos (READING_ALL_FREE, ver _lib/qer-map-core.js).
const PAYWALL_VERSION = 'free1'; // free1 = lectura completa gratis + canción en columna fija (antes read1: paywall de $9.99).
let chapters = [];          // [{id,label,hook,free,words,text?}]

// --- Envío del cuestionario y generación (3 pasos, cada uno una llamada propia) ---
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
    if (err.status && err.status < 500 && err.status !== 409) throw err;
    return await postFn(name, payload);
  }
}

const LOADING_STEPS = ['Leyendo lo que hay debajo de tus respuestas…', 'Uniendo lo que dijiste en un lado con lo que dijiste en otro…', 'Escribiendo tu lectura…', 'Casi lista…'];
async function submitQuiz() {
  showScreen('loading');
  const label = document.getElementById('loadingLabel');
  label.textContent = LOADING_STEPS[0];
  const payload = { format: 'reading', answers: QUESTIONS.map((q, i) => ({ question: q.prompt, answer: answers[i] || '' })) };
  const t0 = Date.now();
  try {
    const axis = await postWithOneRetry('qer-generate-map', payload);
    label.textContent = LOADING_STEPS[2];
    const rotate = setInterval(() => { label.textContent = LOADING_STEPS[1 + Math.floor((Date.now() - t0) / 7000) % 2]; }, 7000);
    try {
      await Promise.all([0, 1, 2, 3, 4].map(part => postWithOneRetry('qer-generate-map-part', { readingId: axis.readingId, part })));
    } finally { clearInterval(rotate); }
    label.textContent = LOADING_STEPS[3];
    const data = await postWithOneRetry('qer-generate-map-finalize', { readingId: axis.readingId });
    track('reading_generated_success', { seconds: Math.round((Date.now() - t0) / 1000) });
    clearQuizProgress();
    renderReveal(data);
  } catch (err) {
    track('reading_generated_error', { reason: String(err.message).slice(0, 200), seconds: Math.round((Date.now() - t0) / 1000) });
    showError('Tu lectura no pudo terminar de armarse.', err.message, submitQuiz);
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
const fmtInt = (n) => Number(n || 0).toLocaleString('es');

// --- Pintar la lectura ---------------------------------------------------------------
function paragraphsHtml(text) {
  return String(text || '').split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHtml(p)}</p>`).join('');
}

function drawChapters() {
  const box = document.getElementById('chapters');
  box.innerHTML = chapters.filter(c => c.text).map(c => `<article class="chapter"><h3 class="chapter-title display">${escapeHtml(c.label)}</h3>${paragraphsHtml(c.text)}</article>`).join('');
}

function renderReveal(data) {
  readingId = data.readingId;
  archetypeNameForShare = data.archetypeName || '';
  chapters = (data.nodes || []).map(n => ({ id: n.id, label: n.label, hook: n.hook, words: n.words || 0, text: n.text || null }));
  document.getElementById('archetypeName').textContent = data.archetypeName || '';
  document.getElementById('hookLine').textContent = data.hookLine || '';
  document.getElementById('closingLine').textContent = data.closingLine || '';
  drawChapters();
  showScreen('reveal');
  // Se guarda en este navegador para no perder la lectura si se recarga la página (ya no hay nada que pagar).
  savePendingReading({ readingId: data.readingId, format: 'reading', archetypeName: data.archetypeName, hookLine: data.hookLine, closingLine: data.closingLine, nodes: chapters });
  track('reading_shown', { archetypeName: data.archetypeName || '', chapters: chapters.length, openChapters: chapters.filter(c => c.text).length, paywallVersion: PAYWALL_VERSION });
  setupSongOffer(data.readingId, data.archetypeName);
}

// --- Oferta de canción: estilo + teléfono; el servidor escribe la letra y te la manda por correo (LEEME 53) ---
let songStyle = 'Sorpréndeme';
let songObserver = null;
const SONG_TZ_DIAL = { 'America/Costa_Rica': '+506', 'America/Montevideo': '+598', 'America/Mexico_City': '+52', 'America/Cancun': '+52', 'America/Monterrey': '+52', 'America/Tijuana': '+52', 'America/Argentina/Buenos_Aires': '+54', 'America/Bogota': '+57', 'America/Santiago': '+56', 'America/Lima': '+51', 'America/Guayaquil': '+593', 'America/Panama': '+507', 'America/Guatemala': '+502', 'America/El_Salvador': '+503', 'America/Tegucigalpa': '+504', 'America/Managua': '+505', 'America/Caracas': '+58', 'America/La_Paz': '+591', 'America/Asuncion': '+595', 'Europe/Madrid': '+34' };
function guessDialCode() {
  try { return SONG_TZ_DIAL[Intl.DateTimeFormat().resolvedOptions().timeZone] || ''; } catch { return ''; }
}
// Une el código de país con el número local; devuelve "+59899123456" o '' si no parece válido.
function buildSongPhone(dial, raw) {
  let n = String(raw || '').replace(/[\s().\-]/g, '');
  if (!n) return '';
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (n.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(n) ? n : '';
  if (!dial) return '';
  n = n.replace(/^0+/, '');
  const full = dial + n;
  return /^\+[1-9]\d{7,14}$/.test(full) ? full : '';
}

// En el celular el teclado se dibuja ENCIMA de la página sin empujar lo que está fijo abajo: la hoja de la canción
// se subía detrás de él. Con visualViewport se mide la parte realmente visible y se acomoda la hoja sobre el teclado.
let songViewportBound = false;
function bindSongViewportFit(box) {
  const vv = window.visualViewport;
  if (!vv || songViewportBound) return;
  songViewportBound = true;
  const fit = () => {
    if (window.matchMedia('(min-width: 960px)').matches) { box.style.bottom = ''; box.style.maxHeight = ''; box.classList.remove('kb-open'); return; }
    const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    box.style.bottom = covered ? covered + 'px' : '';
    box.style.maxHeight = covered ? Math.round(vv.height * 0.94) + 'px' : '';
    box.classList.toggle('kb-open', covered > 80);
    if (covered > 80) {
      const el = document.activeElement;
      if (el && box.contains(el)) { try { el.scrollIntoView({ block: 'center' }); } catch (_e) { /* no crítico */ } }
    }
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
}

function setupSongOffer(forReadingId, archetype) {
  const box = document.getElementById('songOffer');
  if (!box) return;
  box.classList.remove('is-hidden');
  bindSongViewportFit(box);
  const teaser = document.getElementById('songTeaser'), form = document.getElementById('songForm'), done = document.getElementById('songDone');
  box.classList.remove('is-open');
  const tt = document.getElementById('songTeaserText');
  if (tt) tt.textContent = `Con lo que descubrimos de ti escribo la letra${archetype ? ` de «${archetype}»` : ''} y te hago una muestra para que la escuches. Sin compromiso: hablamos de precio solo después de que la oigas.`;
  teaser.classList.remove('is-hidden'); form.classList.add('is-hidden'); done.classList.add('is-hidden');
  const err = document.getElementById('songError'), send = document.getElementById('btnSongSend');
  err.classList.add('is-hidden'); send.disabled = false;
  const wantName = document.getElementById('songWantName'), nameIn = document.getElementById('songName');
  wantName.checked = false; nameIn.value = ''; nameIn.classList.add('is-hidden');
  wantName.onchange = () => {
    nameIn.classList.toggle('is-hidden', !wantName.checked);
    track('song_name_toggled', { on: wantName.checked });
  };
  const dial = document.getElementById('songDial'), phone = document.getElementById('songPhone');
  const guess = guessDialCode();
  if (guess) dial.value = guess;
  document.getElementById('btnSongOpen').onclick = () => {
    track('song_cta_clicked', {});
    teaser.classList.add('is-hidden'); form.classList.remove('is-hidden'); box.classList.add('is-open');
    // Sin enfocar el teléfono: si el teclado se abre solo, tapa el formulario y parece que algo falló.
    // La persona ve primero el formulario completo y toca ella el campo cuando quiera.
    box.scrollTop = 0;
  };
  box.querySelectorAll('.song-chip').forEach(chip => {
    chip.setAttribute('aria-pressed', chip.dataset.style === songStyle ? 'true' : 'false');
    chip.onclick = () => {
      songStyle = chip.dataset.style;
      box.querySelectorAll('.song-chip').forEach(c => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
      track('song_style_chosen', { style: songStyle });
    };
  });
  // En el celular la oferta es una barra fija abajo: "×" la vuelve a cerrar (si ya pidió la canción, la quita).
  const closeBtn = document.getElementById('songClose');
  if (closeBtn) closeBtn.onclick = () => {
    track('song_closed', { done: !done.classList.contains('is-hidden') });
    if (!done.classList.contains('is-hidden')) { box.classList.add('is-hidden'); return; }
    box.classList.remove('is-open'); form.classList.add('is-hidden'); teaser.classList.remove('is-hidden');
  };
  // En pantalla ancha la columna ya muestra el formulario abierto: cero clics antes de poder pedirla.
  try { if (window.matchMedia('(min-width: 960px)').matches) { teaser.classList.add('is-hidden'); form.classList.remove('is-hidden'); } } catch (_e) { /* no crítico */ }
  const fail = (t) => { err.textContent = t; err.classList.remove('is-hidden'); };
  // Botón principal: abre WhatsApp con el mensaje ya escrito (estilo, nombre y código). No pide ningún dato; la persona
  // solo envía. Al tocarlo se avisa al servidor (sin teléfono) para que te llegue por correo la letra y el código.
  const waBtn = document.getElementById('songWaBtn'), waAgain = document.getElementById('songWaAgain');
  const nameRe = /^[\p{L}][\p{L} '’-]{0,29}$/u;
  const typedName = () => (wantName.checked ? nameIn.value.replace(/\s+/g, ' ').trim() : '');
  const waHref = () => {
    const n = typedName();
    const text = `Hola, quiero mi canción 🎵\nEstilo: ${songStyle}\n${n && nameRe.test(n) ? `Nombre en la canción: ${n}\n` : ''}Mi código es: ${forReadingId}${archetype ? ` (${archetype})` : ''}`;
    return `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(text)}`;
  };
  waBtn.href = waHref();
  waAgain.classList.add('is-hidden');
  waBtn.onclick = (ev) => {
    err.classList.add('is-hidden');
    const n = typedName();
    if (wantName.checked && !nameRe.test(n)) { ev.preventDefault(); track('song_name_invalid', {}); fail('Escribe solo tu nombre (letras, hasta 30), o desmarca la casilla.'); nameIn.focus(); return; }
    waBtn.href = waHref();
    track('song_whatsapp_clicked', { style: songStyle, hasName: !!n });
    try {
      fetch('/.netlify/functions/qer-song-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ readingId: forReadingId, style: songStyle, via: 'whatsapp', consent: true, ...(n ? { name: n } : {}) })
      }).catch(() => { /* el aviso es un extra: si falla, igual se abre WhatsApp */ });
    } catch (_e) { /* no crítico */ }
    setTimeout(() => {
      document.getElementById('songDoneText').textContent = 'Se abrió WhatsApp con tu mensaje: solo falta enviarlo. Te respondo ahí con tu muestra.';
      waAgain.href = waBtn.href; waAgain.classList.remove('is-hidden');
      form.classList.add('is-hidden'); done.classList.remove('is-hidden'); box.classList.add('is-open');
    }, 500);
  };
  waAgain.onclick = () => track('song_whatsapp_clicked', { again: true });
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    err.classList.add('is-hidden');
    const songNameVal = wantName.checked ? nameIn.value.replace(/\s+/g, ' ').trim() : '';
    if (wantName.checked && !/^[\p{L}][\p{L} '’-]{0,29}$/u.test(songNameVal)) { track('song_name_invalid', {}); fail('Escribe solo tu nombre (letras, hasta 30), o desmarca la casilla.'); nameIn.focus(); return; }
    const full = buildSongPhone(dial.value, phone.value);
    if (!full) { track('song_phone_invalid', {}); fail('Revisa tu número: pon el código de tu país y el número, por ejemplo 99 123 456.'); phone.focus(); return; }
    send.disabled = true; send.textContent = 'Enviando…';
    track('song_request_submitted', { style: songStyle, hasName: !!songNameVal });
    try {
      const res = await fetch('/.netlify/functions/qer-song-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readingId: forReadingId, style: songStyle, phone: full, consent: true, ...(songNameVal ? { name: songNameVal } : {}) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        track('song_request_failed', { status: res.status });
        fail(data.error || 'No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbeme por WhatsApp.');
        send.disabled = false; send.textContent = 'Quiero mi canción';
        return;
      }
      track('song_request_confirmed', { style: songStyle });
      waAgain.classList.add('is-hidden');
      document.getElementById('songDoneText').textContent = `Te escribiré por WhatsApp al ${full} con una muestra de tu canción. Revisa tus mensajes pronto.`;
      form.classList.add('is-hidden'); done.classList.remove('is-hidden'); box.classList.add('is-open');
      try { done.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_e) { /* no crítico */ }
    } catch {
      track('song_request_failed', { status: 0 });
      fail('Sin conexión. Inténtalo de nuevo.');
      send.disabled = false; send.textContent = 'Quiero mi canción';
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

const CONTACT_WHATSAPP = '50687772993';
const CONTACT_EMAIL = 'bonillapretiz@gmail.com';

// --- Medición de lo que pasa DESPUÉS de mostrar el paywall ---------------------
const pageStartedAt = Date.now();
let scrollMaxPct = 0;
let songSeen = false;
window.addEventListener('scroll', () => {
  if (currentScreenName !== 'reveal') return;
  const h = document.documentElement.scrollHeight - window.innerHeight;
  if (h > 0) scrollMaxPct = Math.max(scrollMaxPct, Math.round((window.scrollY / h) * 100));
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  try {
    const payload = { event: 'page_hidden', anonId, metadata: { variant: 'reading', screen: currentScreenName, seconds: Math.round((Date.now() - pageStartedAt) / 1000), songSeen, scrollMaxPct, questionsAnswered: answers.filter(Boolean).length } };
    if (!TEST_MODE) navigator.sendBeacon('/.netlify/functions/qer-track-event', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  } catch { /* no crítico */ }
});

function restartQuiz() {
  currentIndex = 0;
  answers.fill(null);
  readingId = null;
  chapters = [];
  clearPendingReading();
  clearQuizProgress();
  track('quiz_started', { restart: true });
  renderQuestion(0);
  showScreen('quiz');
}
document.getElementById('btnRestart').addEventListener('click', restartQuiz);

// --- Retomar la lectura si se recarga la página ------------------------------------
// La lectura es gratis y completa: se guarda en este navegador (savePendingReading). Si falta texto en
// algún capítulo (lectura de la época del paywall) se descarta y se empieza de nuevo.
// Los parámetros ?pago / ?pagado de la época del pago ya no hacen nada; solo se limpian de la URL.
if (/[?&](pago|pagado)=/.test(location.search)) { try { history.replaceState(null, '', location.pathname); } catch { /* no crítico */ } }
function resumePendingReadingIfAny() {
  const pending = loadPendingReading();
  if (!pending) return;
  if (pending.format !== 'reading' || !Array.isArray(pending.nodes) || !pending.nodes.length || !pending.nodes.every(n => n && n.text)) { clearPendingReading(); return; }
  renderReveal(pending);
}
if (!TEST_MODE) resumePendingReadingIfAny();

document.getElementById('btnShare').addEventListener('click', async () => {
  const shareText = archetypeNameForShare
    ? `Según "¿Quién eres en realidad?", mi arquetipo es: ${archetypeNameForShare}. Descúbrelo tú también.`
    : '¿Quieres saber quién se esconde detrás de tu máscara? Hice este cuestionario y me sorprendió.';
  const url = location.origin + '/quien-eres/';
  const shareData = { title: '¿Quién eres en realidad?', text: shareText, url };
  try { if (navigator.share) { await navigator.share(shareData); return; } } catch { /* canceló */ }
  try { await navigator.clipboard.writeText(`${shareText} ${url}`); alert('Copiado — pégalo donde quieras compartirlo.'); }
  catch { alert(url); }
});

const DEFAULT_ANSWERS = [
 "Que todo está bien.",
 "Dije que sí a ayudar con algo de un familiar cuando lo único que quería era dormir.",
 "Que mi familia me pide demasiado y yo no sé decir que no.",
 "El cansancio que traigo; me ven siempre a punto y sonriendo.",
 "Que me quedé sin energía y que me gustaría que alguien me preguntara dos veces.",
 "Sonrío, me acomodo el pelo y hablo bajito. Busco una cara conocida para no quedarme a solas.",
 "Una sonrisa chiquita y rápida, como de cortesía. Esconde que me estoy quedando sin energía.",
 "De mi relación anterior: digo que ya pasó, pero todavía me duele.",
 "Un personaje de serie que siempre resuelve todo para los demás y nadie nota que se rompe. Me incomoda que me guste ser así.",
 "La gente cree que soy fuerte y tranquila, pero en realidad me pesa aguantar todo en silencio.",
 "La traición. Que me mientan en la cara después de todo lo que he dado.",
 "Mi mejor amistad contó algo mío que le pedí que guardara. Lo que más me dolió fue que lo hizo riéndose.",
 "Mi papá me dijo una vez 'tú no necesitas ayuda, tú eres la fuerte'. Lo recuerdo palabra por palabra.",
 "A mi mamá. Le diría que me habría gustado que me abrazara más y me corrigiera menos.",
 "Dejar de contestar mensajes de trabajo en la noche. Sigo haciéndolo.",
 "Cuento que me fui de casa por 'oportunidades', pero en realidad me fui porque ya no aguantaba el ambiente.",
 "Una amistad de la infancia. Nunca dije que me dolió que se alejara.",
 "Me detengo, respiro hondo y sigo con lo que hacía como si nada. Luego lloro en el baño.",
 "Alguien en la escuela que me dijo que yo podía llegar lejos. No sabe lo que eso hizo en mí.",
 "Que descubran que a veces no soy tan sólido como parezco y que me da igual quedar bien o no.",
 "Dejaría todo por un mes y me iría a una playa sin avisarle a nadie.",
 "Me como un helado entero en la cocina a oscuras, viendo videos viejos de mi familia.",
 "La canción 'Cielito lindo' en una fiesta: me lleva al funeral de mi abuela, que fue la única persona que me veía de verdad.",
 "A las personas que se permiten descansar y decir que no sin culpa.",
 "Borraría el día que dije algo hiriente a alguien de mi familia. Perdería también lo que aprendí al pedirle perdón.",
 "Salirme de una reunión de trabajo y no volver. Lo he imaginado muchas veces.",
 "Una cajita con cartas de mi ex que no he podido tirar, aunque sé que ya no me hacen bien.",
 "Me cierro y me enfrío por fuera, pero por dentro me tiembla todo. Después me siento culpable por días.",
 "Sueño que estoy en una casa con muchos cuartos y siempre hay uno cerrado al que no me animo a entrar.",
 "Por la tarde, cuando termino todo lo de los demás y no queda nadie que me pregunte cómo estoy.",
 "Cuando mi abuela me arreglaba el cabello y me dijo 'ahí estás tú'. Sentí que me veían sin que yo hiciera nada.",
 "Que está bien no poder con todo y que me quieren aunque no sirva para nada.",
 "Los problemas de todos en mi familia. Nadie me los pidió pero si no los cargo yo, siento que se caen.",
 "Que me abracen sin que yo lo pida y que me pregunten 'de verdad, ¿cómo estás?'.",
 "Mi disponibilidad. Todos me admiran por estar siempre y a mí me cansa ser quien siempre está.",
 "Que me quieran sin que yo tenga que hacer algo. No sé por qué, pero no me lo creo.",
 "Me pongo difícil, me aíslo unos días y espero a ver si me buscan.",
 "Con una amistad de años. Con esa persona puedo decir tonterías y llorar sin explicar.",
 "Dormiría hasta tarde, no cocinaría y le diría a todos que hoy no estoy disponible.",
 "Un mensaje de alguien que dice 'pensé en ti' sin que yo haya hecho nada.",
 "Que no tienes que ganarte el cariño de nadie. Que ya eras suficiente.",
 "Que me perdones por haber esperado tanto para cuidarme. Y que descanses antes de que te obliguen a descansar.",
 "Las cenas de domingo donde finjo que no me afecta lo que dicen.",
 "Me iría a una ciudad con mar, me llevaría mis libros y dejaría la costumbre de ser quien salva a todos.",
 "A mi mamá. No sé cómo empezar, tal vez con una carta que no tenga que enviar.",
 "Revisar mi teléfono esperando que alguien me necesite. Ese miedo a que no me busquen.",
 "Que fui una persona que se dio cuenta de lo que otros no veían, y que cuidó sin pedir nada a cambio.",
 "Que todo se cae y que me van a reclamar que no estuve. Lo creo aunque sé que es mentira.",
 "Que a veces odio ser quien siempre está bien, y que tengo ganas de que alguien me cuide a mí.",
 "Que no soy lo que hago por los demás. Que valgo igual sin ser útil."
];
DEFAULT_ANSWERS.forEach((a, i) => { answers[i] = a; });
submitQuiz();
