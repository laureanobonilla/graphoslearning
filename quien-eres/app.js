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
  { id: 'q3', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "¿Cuál es la mentira que más te repites a ti?", placeholder: "La que casi nunca dices en voz alta" },
  { id: 'q7', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "¿Qué opinión tuya nunca dices en voz alta?", placeholder: "Esa que te guardas" },
  { id: 'q4', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "¿Qué parte de ti se nota menos de lo que quisieras?", placeholder: "Lo que los demás casi no ven" },
  { id: 'q2', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "Cuando alguien te pregunta \"¿cómo estás?\" y contestas \"bien\", ¿qué es lo que de verdad querrías decir?", placeholder: "Dilo como lo sientes" },
  { id: 'q6', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "Describe la sonrisa que pones cuando no tienes ganas de sonreír. ¿Qué esconde?", placeholder: "Descríbela con detalle" },
  { id: 'q8', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "¿Qué personaje de película, serie o cuento se parece más a ti? ¿Qué parte suya te incomoda reconocer?", placeholder: "El personaje y la parte incómoda" },
  { id: 'q1', type: 'short', act: 1, actTitle: "Lo que muestras", prompt: "Termina la frase: \"La gente cree que soy..., pero en realidad soy...\"", placeholder: "Las dos partes, aunque no calcen" },
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
  const actEl = document.getElementById('qAct');
  if (actEl) actEl.textContent = `Parte ${q.act} de 5 · ${q.actTitle}`;
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
const PROGRESS_KEY = 'qer_quiz_progress_v4'; // v4: las 3 primeras preguntas pasaron a ser de elegir (orden distinto)
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
// La lectura son 10 capítulos: los 5 primeros llegan completos y de los 5 últimos
// el navegador recibe ÚNICAMENTE título, gancho y cuántas palabras tienen. El
// texto cerrado vive en el servidor y solo sale por qer-paypal-capture-order /
// qer-get-reading cuando el pago está confirmado (ver qer-generate-map*.js).
const PAYWALL_VERSION = 'read1'; // read1 = lectura de 50 preguntas en capítulos, $9.99, "No desbloquear por ahora" y "¿Qué te frena?" visibles
let chapters = [];          // [{id,label,hook,free,words,text?}]
let readingStats = null;    // {freeWords, hiddenWords, hiddenCount}
let readUnlocked = false;

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
  const open = chapters.filter(c => c.text);
  const closed = chapters.filter(c => !c.text);
  const box = document.getElementById('chapters');
  box.innerHTML = open.map((c, i) => `<article class="chapter"><h3 class="chapter-title display">${escapeHtml(c.label)}</h3>${paragraphsHtml(c.text)}</article>`).join('');

  const list = document.getElementById('lockedList');
  if (!closed.length) { list.innerHTML = ''; list.classList.add('is-hidden'); }
  else {
    list.classList.remove('is-hidden');
    list.innerHTML = `<p class="locked-intro">Tu lectura sigue aquí. Esto es lo que viene:</p>` + closed.map(c => `
      <div class="locked-item">
        <svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
        <div>
          <p class="locked-title display">${escapeHtml(c.label)}</p>
          <p class="locked-hook">${escapeHtml(c.hook)}</p>
          <p class="locked-words">${c.words ? `${fmtInt(c.words)} palabras` : ''}</p>
        </div>
      </div>`).join('');
  }

}

function renderReveal(data, { skipPaywall } = {}) {
  readingId = data.readingId;
  archetypeNameForShare = data.archetypeName || '';
  chapters = (data.nodes || []).map(n => ({ id: n.id, label: n.label, hook: n.hook, free: !!n.free, words: n.words || 0, text: n.text || null }));
  readingStats = data.stats || null;
  readUnlocked = false;
  document.getElementById('archetypeName').textContent = data.archetypeName || '';
  document.getElementById('hookLine').textContent = data.hookLine || '';
  document.getElementById('paywallCommitment').textContent = `Ya respondiste ${QUESTIONS.length} preguntas sobre ti`;
  const closed = chapters.filter(c => !c.text).length;
  document.getElementById('paywallHook').textContent = closed ? `${closed} capítulos de tu lectura siguen cerrados` : 'Tu lectura continúa';
  document.getElementById('skippedNote').classList.add('is-hidden');
  document.getElementById('payBlock').classList.remove('is-hidden');
  document.getElementById('fullContainer').classList.add('is-hidden');
  drawChapters();
  showScreen('reveal');

  if (skipPaywall) {
    document.getElementById('paywall').classList.add('is-hidden');
    return;
  }

  // Lo que se guarda para "retomar" NUNCA incluye texto cerrado (esos capítulos no lo traen).
  savePendingReading({ readingId: data.readingId, format: 'reading', archetypeName: data.archetypeName, hookLine: data.hookLine, nodes: chapters, stats: readingStats });

  document.getElementById('paywall').classList.remove('is-hidden');
  track('paywall_shown', { archetypeName: data.archetypeName || '', paywallVersion: PAYWALL_VERSION });
  watchPaywallInView();
  initPaywall(readingId);
}

let paypalFailReason = '';
async function loadPaypalSdk() {
  if (window.paypal) return true;
  try {
    const res = await fetch('/.netlify/functions/qer-paypal-config');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.clientId) { paypalFailReason = !res.ok ? `config HTTP ${res.status}` : 'config sin clientId'; return false; }
    if (data.priceUsd) document.getElementById('priceLabel').textContent = `$${data.priceUsd}`;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(data.clientId)}&currency=USD`;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar el SDK de PayPal.'));
      document.head.appendChild(s);
    });
    if (!window.paypal) paypalFailReason = 'script cargó pero window.paypal no existe';
    return !!window.paypal;
  } catch (err) {
    paypalFailReason = String(err?.message || err).slice(0, 200);
    console.error('[paypal] no se pudo cargar el SDK', err);
    return false;
  }
}

async function initPaywall(forReadingId) {
  const container = document.getElementById('paypal-button-container');
  container.innerHTML = '';
  const loaded = await loadPaypalSdk();
  if (!loaded) {
    track('paypal_sdk_failed', { reason: paypalFailReason, paywallVersion: PAYWALL_VERSION });
    container.innerHTML = '<p style="color:#e9c9ba; font-size:0.85rem; text-align:center;">No se pudo cargar el pago. Revisa tu conexión y recarga la página.</p>';
    return;
  }
  track('paypal_sdk_loaded', { paywallVersion: PAYWALL_VERSION });
  const payButtons = window.paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay' },
    onInit: () => track('paypal_buttons_ready', { paywallVersion: PAYWALL_VERSION }),
    onClick: () => track('paypal_button_clicked', { paywallVersion: PAYWALL_VERSION }),
    onError: (err) => track('paypal_error', { reason: String(err?.message || err).slice(0, 300), paywallVersion: PAYWALL_VERSION }),
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
      unlockReading(result);
    },
    onError: (err) => {
      track('payment_captured_failed', { reason: String(err?.message || err).slice(0, 300) });
      console.error('[paypal]', err);
    },
    onCancel: () => track('payment_cancelled', {})
  });
  if (!payButtons.isEligible()) { track('paypal_not_eligible', { paywallVersion: PAYWALL_VERSION }); return; }
  payButtons.render('#paypal-button-container')
    .then(() => track('paypal_buttons_rendered', { visible: container.offsetHeight > 20, height: container.offsetHeight, paywallVersion: PAYWALL_VERSION }))
    .catch(err => track('paypal_render_failed', { reason: String(err?.message || err).slice(0, 300), paywallVersion: PAYWALL_VERSION }));
}

// Aplica los capítulos que el servidor entrega SOLO después de confirmar el pago.
function unlockReading({ mapTexts, closingLine }) {
  clearPendingReading();
  readUnlocked = true;
  const byId = new Map((mapTexts || []).map(t => [t.id, t.text]));
  chapters.forEach(c => { if (byId.has(c.id)) c.text = byId.get(c.id); });
  document.getElementById('paywall').classList.add('is-hidden');
  document.getElementById('skippedNote').classList.add('is-hidden');
  drawChapters();
  document.getElementById('closingLine').textContent = closingLine || '';
  document.getElementById('fullContainer').classList.remove('is-hidden');
  const firstNew = document.querySelectorAll('#chapters .chapter')[5];
  setTimeout(() => (firstNew || document.getElementById('chapters')).scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
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
const pageStartedAt = Date.now();
let paywallObserver = null;
let paywallSeen = false;
let scrollMaxPct = 0;
function watchPaywallInView() {
  paywallSeen = false;
  const el = document.getElementById('paywall');
  if (paywallObserver) paywallObserver.disconnect();
  if (!('IntersectionObserver' in window)) return;
  paywallObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting) && !paywallSeen) {
      paywallSeen = true;
      track('paywall_in_view', { secondsSinceLoad: Math.round((Date.now() - pageStartedAt) / 1000), paywallVersion: PAYWALL_VERSION });
      paywallObserver.disconnect();
    }
  }, { threshold: 0.4 });
  paywallObserver.observe(el);
}
window.addEventListener('scroll', () => {
  if (currentScreenName !== 'reveal') return;
  const h = document.documentElement.scrollHeight - window.innerHeight;
  if (h > 0) scrollMaxPct = Math.max(scrollMaxPct, Math.round((window.scrollY / h) * 100));
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  try {
    const payload = { event: 'page_hidden', anonId, metadata: { variant: 'reading', screen: currentScreenName, seconds: Math.round((Date.now() - pageStartedAt) / 1000), paywallSeen, scrollMaxPct, questionsAnswered: answers.filter(Boolean).length, unlocked: readUnlocked } };
    navigator.sendBeacon('/.netlify/functions/qer-track-event', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
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
document.getElementById('btnRestartFromSkip').addEventListener('click', restartQuiz);

// --- Retomar una lectura pendiente (o ya pagada) ----------------------------------
// Antes de mostrar el pago se le pregunta al SERVIDOR si ya está pagada (por si
// pagó y perdió la conexión justo después).
async function resumePendingReadingIfAny() {
  const pending = loadPendingReading();
  if (!pending || !Array.isArray(pending.nodes) || pending.format !== 'reading') return;
  try {
    const res = await fetch('/.netlify/functions/qer-get-reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ readingId: pending.readingId })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.paid && data.mapTexts) {
      renderReveal(pending, { skipPaywall: true });
      unlockReading({ mapTexts: data.mapTexts, closingLine: data.closingLine });
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
  const url = location.origin + '/quien-eres/';
  const shareData = { title: '¿Quién eres en realidad?', text: shareText, url };
  try { if (navigator.share) { await navigator.share(shareData); return; } } catch { /* canceló */ }
  try { await navigator.clipboard.writeText(`${shareText} ${url}`); alert('Copiado — pégalo donde quieras compartirlo.'); }
  catch { alert(url); }
});
