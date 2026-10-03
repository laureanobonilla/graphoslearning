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
const BLOT_A = `<svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g>
    <path d="M80 12 C100 10 112 28 108 44 C124 48 130 68 118 80 C132 90 128 112 110 116 C112 134 92 146 80 136 C68 146 48 134 50 116 C32 112 28 90 42 80 C30 68 36 48 52 44 C48 28 60 10 80 12Z" fill="#c6a358" opacity="0.9"/>
  </g>
  <g transform="translate(160,0) scale(-1,1)">
    <path d="M80 12 C100 10 112 28 108 44 C124 48 130 68 118 80 C132 90 128 112 110 116 C112 134 92 146 80 136 C68 146 48 134 50 116 C32 112 28 90 42 80 C30 68 36 48 52 44 C48 28 60 10 80 12Z" fill="#c6a358" opacity="0.9"/>
  </g>
</svg>`;
const BLOT_B = `<svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g>
    <path d="M78 8 C94 20 88 38 100 46 C118 50 122 72 104 82 C120 94 112 118 92 114 C96 132 74 142 64 126 C48 136 30 122 38 104 C20 100 20 76 38 70 C28 56 40 38 58 42 C56 24 64 6 78 8Z" fill="#9c3b47" opacity="0.88"/>
  </g>
  <g transform="translate(160,0) scale(-1,1)">
    <path d="M78 8 C94 20 88 38 100 46 C118 50 122 72 104 82 C120 94 112 118 92 114 C96 132 74 142 64 126 C48 136 30 122 38 104 C20 100 20 76 38 70 C28 56 40 38 58 42 C56 24 64 6 78 8Z" fill="#9c3b47" opacity="0.88"/>
  </g>
</svg>`;
const BLOT_C = `<svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g>
    <path d="M80 14 C96 8 114 18 114 36 C128 40 134 58 122 70 C136 78 134 100 116 106 C120 122 104 138 88 130 C84 144 64 144 60 130 C44 136 30 122 36 106 C20 100 20 78 34 70 C24 58 30 40 44 36 C44 18 64 8 80 14Z" fill="#7fae9b" opacity="0.85"/>
  </g>
  <g transform="translate(160,0) scale(-1,1)">
    <path d="M80 14 C96 8 114 18 114 36 C128 40 134 58 122 70 C136 78 134 100 116 106 C120 122 104 138 88 130 C84 144 64 144 60 130 C44 136 30 122 36 106 C20 100 20 78 34 70 C24 58 30 40 44 36 C44 18 64 8 80 14Z" fill="#7fae9b" opacity="0.85"/>
  </g>
</svg>`;
const BLOT_D = `<svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g>
    <path d="M76 10 C92 14 92 32 104 38 C122 38 130 58 116 70 C130 82 124 104 106 108 C108 126 88 140 74 128 C62 140 42 130 44 112 C28 110 24 88 38 78 C26 68 32 48 50 46 C50 28 62 8 76 10Z" fill="#c6a358" opacity="0.8"/>
  </g>
  <g transform="translate(160,0) scale(-1,1)">
    <path d="M76 10 C92 14 92 32 104 38 C122 38 130 58 116 70 C130 82 124 104 106 108 C108 126 88 140 74 128 C62 140 42 130 44 112 C28 110 24 88 38 78 C26 68 32 48 50 46 C50 28 62 8 76 10Z" fill="#c6a358" opacity="0.8"/>
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
  { id: 'q4', type: 'choice', prompt: '¿Cuál de estas versiones se parece más a ti cuando nadie te está midiendo?',
    options: [
      'La que de verdad descansa, sin culpa',
      'La que sigue trabajando aunque ya nadie lo note',
      'La que es más honesta de lo que es en público',
      'La que piensa en otros antes que en sí misma'
    ] },
  { id: 'q5', type: 'short', prompt: '¿Qué harías si supieras que nadie se va a enterar nunca?',
    placeholder: 'Sé honesto' },
  { id: 'q6', type: 'choice', prompt: 'Si tu círculo más cercano tuviera que contar tu peor momento, dirían que fue cuando...',
    options: [
      'te cerraste y no dejaste que nadie te ayudara',
      'explotaste con quien menos lo merecía',
      'desapareciste sin explicación',
      'fingiste que todo estaba bien hasta que ya no pudiste más'
    ] },
  { id: 'q7', type: 'image', prompt: '¿Qué es lo primero que ves?', blot: BLOT_B,
    placeholder: 'Una palabra' },
  { id: 'q8', type: 'short', prompt: '¿Cuál es la mentira que te repites más seguido a ti mismo?',
    placeholder: 'La que casi nunca te dices en voz alta' },
  { id: 'q9', type: 'choice', prompt: 'Cuando hay un conflicto con alguien cercano, tu primer instinto es...',
    options: [
      'Confrontarlo directamente, cuanto antes',
      'Evitarlo y esperar a que se resuelva solo',
      'Usar el humor para bajarle peso',
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
      'El que tú mismo creas para no decir algo que piensas'
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
    renderReveal(data);
  } catch (err) {
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
function renderReveal(data) {
  readingId = data.readingId;
  archetypeNameForShare = data.archetypeName || '';
  document.getElementById('archetypeName').textContent = data.archetypeName || '';
  document.getElementById('hookLine').textContent = data.hookLine || '';
  const teaserEl = document.getElementById('teaserText');
  teaserEl.innerHTML = (data.teaser || []).map(p => `<p>${escapeHtml(p)}</p>`).join('');

  document.getElementById('paywall').classList.remove('is-hidden');
  document.getElementById('skippedNote').classList.add('is-hidden');
  document.getElementById('fullContainer').classList.add('is-hidden');

  showScreen('reveal');
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
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el pago.');
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
        alert(result.error || 'No se pudo confirmar el pago. Si el cargo sí se hizo, escríbenos.');
        return;
      }
      unlockFull(result);
    },
    onError: (err) => console.error('[paypal]', err)
  }).render('#paypal-button-container');
}

function unlockFull({ full, closingLine }) {
  document.getElementById('paywall').classList.add('is-hidden');
  const fullEl = document.getElementById('fullText');
  fullEl.innerHTML = (full || []).map(p => `<p>${escapeHtml(p)}</p>`).join('');
  document.getElementById('closingLine').textContent = closingLine || '';
  const container = document.getElementById('fullContainer');
  container.classList.remove('is-hidden');
  setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

document.getElementById('btnSkipPaywall').addEventListener('click', () => {
  document.getElementById('paywall').classList.add('is-hidden');
  document.getElementById('skippedNote').classList.remove('is-hidden');
});

function restartQuiz() {
  currentIndex = 0;
  answers.fill(null);
  readingId = null;
  renderQuestion(0);
  showScreen('quiz');
}
document.getElementById('btnRestart').addEventListener('click', restartQuiz);
document.getElementById('btnRestartFromSkip').addEventListener('click', restartQuiz);

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
