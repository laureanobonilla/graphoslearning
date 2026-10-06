// ==========================================
// "VESTIRTE" — 10 preguntas + 5 fotos → perfil de estilo → 10 ocasiones (2 gratis, 8 de pago)
// ==========================================
// Clon del andamiaje de quien-eres: misma generación en 3 pasos, mismo pago de PayPal y mismo
// principio de seguridad (el texto de las ocasiones cerradas NO sale del servidor hasta pagar).
// Lo nuevo: 5 pasos de foto (siempre con ropa puesta), subidas privadas a Cloudinary hechas por el
// servidor y borrado de fotos a petición. Las fotos NUNCA se guardan en localStorage.

const QUESTIONS = [
  { id: 'estilo', type: 'choice', prompt: '¿Qué estilo de ropa buscas?', help: 'Solo para saber de qué sección de la tienda hablar.', options: ['Femenina', 'Masculina', 'Neutra o mixta', 'Me da igual'] },
  { id: 'edad', type: 'choice', prompt: '¿En qué rango de edad estás?', help: 'Este servicio es solo para mayores de 18 años.', options: ['18 a 24', '25 a 34', '35 a 44', '45 a 54', '55 o más'] },
  { id: 'estatura', type: 'short', prompt: '¿Cuánto mides, más o menos?', placeholder: 'Ej. 1,68 m', rows: 1 },
  { id: 'talla', type: 'choice', prompt: '¿Qué talla de ropa usas normalmente?', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL o más', 'Varía según la prenda'] },
  { id: 'busto', type: 'choice', prompt: 'Para elegir escotes y cortes, ¿cómo describirías tu busto?', help: 'Opcional: puedes elegir la última opción.', options: ['Pequeño', 'Mediano', 'Grande', 'No aplica o prefiero no decirlo'] },
  { id: 'presupuesto', type: 'choice', prompt: '¿Cuánto sueles gastar en una prenda?', options: ['Lo mínimo; busco ofertas', 'Precio medio', 'Invierto en calidad', 'Depende de la prenda'] },
  { id: 'clima', type: 'choice', prompt: '¿Cómo es el clima donde vives?', options: ['Cálido casi todo el año', 'Templado', 'Frío buena parte del año', 'Cambia mucho entre estaciones'] },
  { id: 'sentir', type: 'short', prompt: '¿Cómo quieres sentirte cuando te vistes?', placeholder: 'Ej. cómodo/a pero arreglado/a, seguro/a, original…', rows: 2 },
  { id: 'gustos', type: 'short', prompt: '¿Qué colores o prendas amas, y cuáles nunca te pondrías?', placeholder: 'Lo que más usas y lo que jamás usarías', rows: 3 },
  { id: 'vida', type: 'short', prompt: '¿Cómo es tu semana y para qué ocasión necesitas más ayuda?', placeholder: 'Trabajo o estudio, planes, eventos que se vienen…', rows: 3 }
];

const PHOTOS = [
  { slot: 'rostro', title: 'Tu rostro de cerca', guide: 'img/guia-rostro.png',
    why: 'De cerca vemos el color de tus ojos, la forma de tu rostro y tu tono de piel. De ahí salen tus colores: cuáles te iluminan y cuáles te apagan.',
    tip: 'Luz natural, sin filtros, sin gafas de sol y con el cabello recogido si puedes.' },
  { slot: 'frente', title: 'Cuerpo entero, de frente', guide: 'img/guia-frente.png',
    why: 'Muestra tus proporciones: hombros, cintura, caderas y largo de piernas. Con eso elegimos los cortes, largos y alturas de cintura que te favorecen.',
    tip: 'Ropa algo ajustada (no holgada), de pie, brazos relajados y el cuerpo completo dentro del cuadro.' },
  { slot: 'espalda', title: 'Cuerpo entero, de espaldas', guide: 'img/guia-espalda.png',
    why: 'La espalda y los hombros cambian cómo cae una chaqueta o un vestido. Con esta foto vemos el ancho de tus hombros y la línea de tu espalda.',
    tip: 'Ropa algo ajustada, de pie y derecho/a, con el cuerpo completo dentro del cuadro.' },
  { slot: 'perfil', title: 'Cuerpo entero, de perfil', guide: 'img/guia-perfil.png',
    why: 'El perfil muestra tu postura y cómo caen las telas por delante y por detrás. Ayuda a elegir largos y qué tanta estructura necesita una prenda.',
    tip: 'Ropa algo ajustada, mirando hacia un lado, brazos relajados y el cuerpo completo dentro del cuadro.' },
  { slot: 'torso', title: 'De la cintura para arriba, de frente', guide: 'img/guia-torso.png',
    why: 'Hombros, cuello y largo del torso deciden qué escotes, cuellos y mangas te quedan mejor.',
    tip: 'Con camiseta o top liso puesto, de frente. No hace falta ninguna foto sin ropa: si una foto muestra desnudez, se descarta.' }
];

const STEPS = [...QUESTIONS.map(q => ({ kind: 'q', q })), ...PHOTOS.map(p => ({ kind: 'photo', p }))]; // 15
const answers = new Array(QUESTIONS.length).fill(null);
const photos = {};          // slot → data URI JPEG (solo en memoria)
let consentOk = false, adultOk = false;
// Las fotos se suben una a una en cuanto se eligen. En el navegador solo se recuerda el id de la
// sesión y qué fotos ya están subidas (nunca las imágenes).
let sessionId = null; const uploaded = {};
const SESSION_KEY = 'vst_session_v1';
function saveSession() { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId, uploaded: Object.keys(uploaded), consentOk, adultOk, savedAt: Date.now() })); } catch { /* no crítico */ } }
function loadSession() {
  try {
    const d = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!d || !d.sessionId || Date.now() - (d.savedAt || 0) > 3 * 86400000) return;
    sessionId = d.sessionId; (d.uploaded || []).forEach(sl => { uploaded[sl] = true; }); consentOk = !!d.consentOk; adultOk = !!d.adultOk;
  } catch { /* no crítico */ }
}
function clearSession() { sessionId = null; Object.keys(uploaded).forEach(k => delete uploaded[k]); try { localStorage.removeItem(SESSION_KEY); } catch { /* no crítico */ } }
loadSession();
let currentIndex = 0, readingId = null, styleNameForShare = '';

// --- Registro de uso (nunca incluye fotos) ---------------------------------------------
const ANON_ID_KEY = 'vst_anon_id';
function ensureAnonId() {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem(ANON_ID_KEY, id); }
    return id;
  } catch { return `volatile-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
const anonId = ensureAnonId();
function track(eventName, metadata) {
  try {
    fetch('/.netlify/functions/vst-track-event', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: eventName, anonId, metadata: { ...(metadata || {}), variant: 'vestirte' } }) }).catch(() => {});
  } catch { /* no crítico */ }
}
track('landing_viewed', { referrer: document.referrer ? document.referrer.slice(0, 200) : null,
  likelyBot: /bot|crawl|spider|facebookexternalhit|whatsapp|preview|slackbot|embedly|discordbot/i.test(navigator.userAgent) });

// --- Lectura pendiente (sin cuenta) -----------------------------------------------------
const PENDING_KEY = 'vst_pending_read', PENDING_MAX_AGE_MS = 23 * 60 * 60 * 1000;
function savePending(data) { try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); } catch { /* no crítico */ } }
function loadPending() {
  try {
    const d = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    if (!d?.readingId || Date.now() - (d.savedAt || 0) > PENDING_MAX_AGE_MS) { localStorage.removeItem(PENDING_KEY); return null; }
    return d;
  } catch { return null; }
}
function clearPending() { try { localStorage.removeItem(PENDING_KEY); } catch { /* no crítico */ } }

// --- Pantallas ---------------------------------------------------------------------------
let currentScreenName = 'cover';
function showScreen(name) {
  currentScreenName = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  document.getElementById(`screen-${name}`).classList.add('is-active');
  document.getElementById('progress').classList.toggle('is-hidden', name !== 'quiz');
  window.scrollTo(0, 0);
}
const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Pasos -------------------------------------------------------------------------------
const qBody = $('qBody'), btnNext = $('btnNext'), btnBack = $('btnBack');
const SILHOUETTE_SVG = '<svg viewBox="0 0 64 96" aria-hidden="true"><circle cx="32" cy="14" r="9"/><path d="M18 90V50c0-10 6-16 14-16s14 6 14 16v40M18 52H8M46 52h10M32 64v26"/></svg>';

function renderStep(index) {
  const step = STEPS[index];
  $('progressFill').style.width = `${Math.round((index / STEPS.length) * 100)}%`;
  btnBack.classList.toggle('is-hidden', index === 0);
  $('qStep').textContent = `Paso ${index + 1} de ${STEPS.length}${step.kind === 'photo' ? ' · Foto' : ''}`;
  qBody.innerHTML = '';
  btnNext.disabled = true;
  btnNext.textContent = index === STEPS.length - 1 ? 'Armar mi guía' : 'Siguiente';
  const help = $('qHelp');

  if (step.kind === 'photo') return renderPhotoStep(step.p, help);
  const q = step.q, existing = answers[index];
  $('qPrompt').textContent = q.prompt;
  help.textContent = q.help || ''; help.classList.toggle('is-hidden', !q.help);

  if (q.type === 'choice') {
    const wrap = document.createElement('div'); wrap.className = 'options';
    q.options.forEach(opt => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'option';
      if (existing === opt) { b.classList.add('is-selected'); btnNext.disabled = false; }
      b.innerHTML = `<span class="dot"></span><span>${escapeHtml(opt)}</span>`;
      b.addEventListener('click', () => {
        wrap.querySelectorAll('.option').forEach(o => o.classList.remove('is-selected'));
        b.classList.add('is-selected'); btnNext.disabled = false;
      });
      wrap.appendChild(b);
    });
    qBody.appendChild(wrap);
    return;
  }
  const ta = document.createElement('textarea');
  ta.className = 'short-input'; ta.rows = q.rows || 2; ta.placeholder = q.placeholder || ''; ta.value = existing || '';
  ta.addEventListener('input', () => { btnNext.disabled = ta.value.trim().length < 1; });
  qBody.appendChild(ta);
  btnNext.disabled = !(existing && existing.trim().length >= 1);
  setTimeout(() => ta.focus({ preventScroll: true }), 50);
}

function renderPhotoStep(p, help) {
  $('qPrompt').textContent = p.title;
  help.classList.add('is-hidden');
  const isFirstPhoto = p.slot === PHOTOS[0].slot;
  const wrap = document.createElement('div'); wrap.className = 'photo-wrap';

  if (isFirstPhoto) {
    const c = document.createElement('div'); c.className = 'consent';
    c.innerHTML = `<p><b>Antes de subir fotos</b></p>
      <label><input type="checkbox" id="chkAdult"${adultOk ? ' checked' : ''}><span>Tengo 18 años o más.</span></label>
      <label><input type="checkbox" id="chkConsent"${consentOk ? ' checked' : ''}><span>Acepto que cada foto se suba a un espacio privado en cuanto la elija, se use solo para armar mi recomendación y se conserven hasta 30 días. Puedo borrarlas cuando quiera desde mi resultado.</span></label>`;
    wrap.appendChild(c);
    c.querySelector('#chkAdult').addEventListener('change', e => { adultOk = e.target.checked; if (adultOk) track('adult_confirmed', {}); refreshNext(); if (photos[p.slot] && !uploaded[p.slot]) upload(); });
    c.querySelector('#chkConsent').addEventListener('change', e => { consentOk = e.target.checked; if (consentOk) track('consent_given', {}); refreshNext(); if (photos[p.slot] && !uploaded[p.slot]) upload(); });
  }

  const frame = document.createElement('div'); frame.className = 'frame';
  frame.innerHTML = `<div class="fallback">${SILHOUETTE_SVG}<span>Guía de la foto</span></div>`;
  const guide = new Image(); guide.alt = `Guía: ${p.title}`; guide.src = p.guide;
  guide.addEventListener('load', () => { frame.querySelector('.fallback')?.remove(); frame.prepend(guide); });
  wrap.appendChild(frame);

  const why = document.createElement('div'); why.className = 'photo-why';
  why.innerHTML = `<p>${escapeHtml(p.why)}</p><p class="tip">${escapeHtml(p.tip)}</p>`;
  wrap.appendChild(why);

  const row = document.createElement('div'); row.className = 'upload-row';
  const mkInput = (capture) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; if (capture) i.setAttribute('capture', 'user'); i.className = 'vh'; i.tabIndex = -1; return i; };
  const input = mkInput(false), inputCap = mkInput(true);   // galería / cámara nativa del teléfono
  const btnCam = document.createElement('button'); btnCam.type = 'button'; btnCam.className = 'btn btn-primary';
  const btnUp = document.createElement('button'); btnUp.type = 'button'; btnUp.className = 'btn btn-outline';
  btnUp.addEventListener('click', () => input.click());
  btnCam.addEventListener('click', async () => {
    err.textContent = '';
    // 1º cámara dentro de la página (con temporizador); si el navegador no la permite
    // (p. ej. el navegador interno de algunas apps), se abre la cámara nativa del teléfono.
    const blob = await openCameraOverlay(p.title).catch(() => 'fallback');
    if (blob === 'fallback') { inputCap.click(); return; }
    if (blob) handleFile(blob);
  });
  row.append(btnCam, btnUp, input, inputCap); wrap.appendChild(row);
  const err = document.createElement('p'); err.style.cssText = 'color:var(--chalk-dark);text-align:center;margin:0'; err.setAttribute('role', 'alert'); wrap.appendChild(err);
  qBody.appendChild(wrap);

  const showPhoto = () => {
    frame.classList.add('has-photo');
    frame.querySelectorAll('img').forEach(i => { if (i !== guide) i.remove(); });
    const img = new Image(); img.alt = 'Tu foto'; img.src = photos[p.slot];
    frame.prepend(img); guide.style.display = 'none'; frame.querySelector('.fallback')?.remove();
    if (guide.complete && guide.naturalWidth) {
      const chip = document.createElement('div'); chip.className = 'guide-chip'; chip.style.backgroundImage = `url("${p.guide}")`; frame.appendChild(chip);
    }
    btnCam.textContent = 'Repetir con la cámara'; btnUp.textContent = 'Elegir otra de la galería';
  };
  btnCam.textContent = 'Tomar foto'; btnUp.textContent = 'Elegir de la galería';
  const status = document.createElement('p'); status.style.cssText = 'text-align:center;margin:0;font-weight:600'; status.setAttribute('role', 'status'); wrap.appendChild(status);
  let uploading = false;
  if (photos[p.slot]) showPhoto();
  if (uploaded[p.slot]) status.textContent = 'Foto guardada ✓';

  async function handleFile(f) {
    err.textContent = ''; status.textContent = '';
    let uri;
    try { uri = await toJpegDataUri(f); }
    catch (e) { err.textContent = e.message || 'No pudimos leer esa imagen. Prueba con otra.'; return; }
    photos[p.slot] = uri; delete uploaded[p.slot];
    track('photo_added', { slot: p.slot, kb: Math.round(uri.length * 0.75 / 1024), via: f.name ? 'file' : 'camera' });
    frame.querySelector('.guide-chip')?.remove();
    showPhoto(); upload();
  }
  async function upload() {
    if (!photos[p.slot]) return;
    if (!(consentOk && adultOk)) { status.textContent = 'Marca las dos casillas de arriba para guardar tu foto.'; refreshNext(); return; }
    if (uploading) return;
    uploading = true; err.textContent = ''; status.textContent = 'Guardando tu foto…'; refreshNext();
    try {
      const r = await postWithOneRetry('vst-upload-photo', {
        sessionId, slot: p.slot, photo: photos[p.slot], consent: consentOk, adult: adultOk, anonId,
        answers: QUESTIONS.map((q, i) => ({ question: q.prompt, answer: answers[i] || '' }))
      });
      sessionId = r.sessionId; uploaded[p.slot] = true; saveSession();
      status.textContent = 'Foto guardada ✓'; track('photo_uploaded', { slot: p.slot });
    } catch (e) {
      status.textContent = '';
      err.innerHTML = ''; err.append(`${e.message || 'No se pudo guardar la foto.'} `);
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn-ghost'; retry.textContent = 'Reintentar';
      retry.addEventListener('click', upload); err.appendChild(retry);
      track('photo_upload_failed', { slot: p.slot, reason: String(e.message).slice(0, 120) });
      if (e.data?.blocked) { clearSession(); }
    }
    uploading = false; refreshNext();
  }
  [input, inputCap].forEach(el => el.addEventListener('change', () => { const f = el.files && el.files[0]; el.value = ''; if (f) handleFile(f); }));

  function refreshNext() {
    const needConsent = isFirstPhoto && !(adultOk && consentOk);
    btnNext.disabled = !(photos[p.slot] || uploaded[p.slot]) || !uploaded[p.slot] || uploading || needConsent;
  }
  refreshNext();
}

// Cámara dentro de la página. Resuelve con un Blob JPEG, con null si la persona cierra, y
// rechaza si no hay cámara/permiso (quien llama usa entonces la cámara nativa del teléfono).
function openCameraOverlay(title) {
  return new Promise(async (resolve, reject) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext) return reject(new Error('sin cámara web'));
    let facing = 'user', stream = null, timer = null;
    const ov = document.createElement('div'); ov.className = 'cam-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Cámara');
    ov.innerHTML = `<p class="cam-title"></p><video playsinline muted autoplay></video><div class="cam-count" aria-live="assertive"></div>
      <div class="cam-bar"><button type="button" class="btn" data-a="close">Cerrar</button><button type="button" class="btn btn-primary" data-a="shot">Capturar</button>
      <button type="button" class="btn" data-a="timer">En 5 s</button><button type="button" class="btn" data-a="flip">Girar cámara</button></div>`;
    ov.querySelector('.cam-title').textContent = title;
    const video = ov.querySelector('video'), count = ov.querySelector('.cam-count');
    const stop = () => { clearInterval(timer); if (stream) stream.getTracks().forEach(t => t.stop()); ov.remove(); };
    const start = async () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1600 }, height: { ideal: 1600 } }, audio: false });
      video.srcObject = stream; video.classList.toggle('mirror', facing === 'user');
      await video.play().catch(() => {});
    };
    const shoot = () => {
      if (!video.videoWidth) return;
      const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      c.toBlob(b => { stop(); resolve(b); }, 'image/jpeg', 0.9);
    };
    ov.addEventListener('click', async (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      if (a === 'close') { stop(); resolve(null); }
      else if (a === 'shot') shoot();
      else if (a === 'flip') { facing = facing === 'user' ? 'environment' : 'user'; try { await start(); } catch { /* se queda con la actual */ } }
      else if (a === 'timer') {
        if (timer) return; let n = 5; count.textContent = n;
        timer = setInterval(() => { n--; if (n <= 0) { clearInterval(timer); timer = null; count.textContent = ''; shoot(); } else count.textContent = n; }, 1000);
      }
    });
    try { document.body.appendChild(ov); await start(); } catch (e) { stop(); return reject(e); }
  });
}

// Reduce la foto en el navegador (lado mayor 1100 px, JPEG) para subir ~150 KB por foto.
async function toJpegDataUri(file) {
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error('Ese archivo no es una imagen.');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    bmp = await new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No pudimos leer esa imagen. Si es HEIC, prueba tomándola con la cámara desde aquí.')); i.src = u; });
  }
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
  const k = Math.min(1, 1100 / Math.max(w0, h0));
  const cv = document.createElement('canvas'); cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  for (const q of [0.82, 0.7, 0.55]) {
    const uri = cv.toDataURL('image/jpeg', q);
    if (uri.length < 900_000) return uri;
  }
  throw new Error('La foto es demasiado pesada. Prueba con otra.');
}

function collectAnswer(index) {
  const step = STEPS[index];
  if (step.kind !== 'q') return null;
  if (step.q.type === 'choice') { const s = qBody.querySelector('.option.is-selected span:last-child'); return s ? s.textContent : null; }
  const ta = qBody.querySelector('.short-input'); return ta ? ta.value.trim() : null;
}

btnNext.addEventListener('click', () => {
  const step = STEPS[currentIndex];
  if (step.kind === 'q') {
    const v = collectAnswer(currentIndex); if (!v) return;
    answers[currentIndex] = v;
    track('question_answered', { questionIndex: currentIndex + 1, questionId: step.q.id, question: step.q.prompt, answer: v.slice(0, 300) });
    saveProgress();
  } else {
    track('photo_step_done', { stepIndex: currentIndex + 1, slot: step.p.slot });
    saveProgress();
  }
  if (currentIndex < STEPS.length - 1) { currentIndex++; renderStep(currentIndex); }
  else { $('progressFill').style.width = '100%'; submit(); }
});
btnBack.addEventListener('click', () => {
  if (currentIndex === 0) return;
  if (STEPS[currentIndex].kind === 'q') answers[currentIndex] = collectAnswer(currentIndex);
  currentIndex--; renderStep(currentIndex);
});

// --- Avance guardado (solo respuestas; las fotos jamás se guardan en el navegador) ------------
const PROGRESS_KEY = 'vst_quiz_progress_v1';
function saveProgress() { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ answers, currentIndex: Math.min(currentIndex + 1, STEPS.length - 1), savedAt: Date.now() })); } catch { /* no crítico */ } }
function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
    if (!p || !Array.isArray(p.answers) || Date.now() - (p.savedAt || 0) > 3 * 86400000) return null;
    const done = p.answers.filter(Boolean).length;
    return done > 0 ? p : null;
  } catch { return null; }
}
function clearProgress() { try { localStorage.removeItem(PROGRESS_KEY); } catch { /* no crítico */ } }

$('btnStart').addEventListener('click', () => { track('quiz_started', {}); clearProgress(); clearSession(); currentIndex = 0; renderStep(0); showScreen('quiz'); });
const savedProgress = loadProgress();
if (savedProgress) {
  const b = $('btnResume');
  b.textContent = `Continuar donde quedaste (paso ${Math.min(savedProgress.currentIndex + 1, STEPS.length)} de ${STEPS.length})`;
  b.classList.remove('is-hidden');
  b.addEventListener('click', () => {
    track('quiz_resumed', { fromIndex: savedProgress.currentIndex + 1 });
    savedProgress.answers.forEach((v, i) => { if (i < answers.length) answers[i] = v; });
    currentIndex = Math.min(savedProgress.currentIndex, STEPS.length - 1);
    renderStep(currentIndex); showScreen('quiz');
  });
}

// --- Generación en 3 pasos --------------------------------------------------------------------
const PAYWALL_VERSION = 'vst1';
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
const LOADING_STEPS = ['Mirando tus fotos y tus respuestas…', 'Eligiendo tus colores…', 'Armando los conjuntos para cada ocasión…', 'Casi lista tu guía…'];

async function submit() {
  showScreen('loading');
  const label = $('loadingLabel'); label.textContent = LOADING_STEPS[0];
  const t0 = Date.now();
  try {
    const profile = await postWithOneRetry('vst-generate-profile', {
      anonId, consent: consentOk, adult: adultOk, sessionId,
      answers: QUESTIONS.map((q, i) => ({ question: q.prompt, answer: answers[i] || '' }))
    });
    label.textContent = LOADING_STEPS[2];
    await Promise.all([0, 1, 2, 3, 4].map(part => postWithOneRetry('vst-generate-part', { readingId: profile.readingId, part })));
    label.textContent = LOADING_STEPS[3];
    const data = await postWithOneRetry('vst-generate-finalize', { readingId: profile.readingId });
    track('reading_generated_success', { seconds: Math.round((Date.now() - t0) / 1000) });
    clearProgress(); clearSession();
    Object.keys(photos).forEach(k => delete photos[k]); // ya no se necesitan en memoria
    renderReveal(data);
  } catch (err) {
    track('reading_generated_error', { reason: String(err.message).slice(0, 200), blocked: !!err.data?.blocked, seconds: Math.round((Date.now() - t0) / 1000) });
    if (err.data?.blocked) {
      Object.keys(photos).forEach(k => delete photos[k]); clearSession();
      showError('No pudimos usar tus fotos.', err.message, null);
    } else showError('Tu guía no pudo terminar de armarse.', err.message, submit);
  }
}
function showError(title, detail, retryFn) {
  $('errorMsg').textContent = title; $('errorDetail').textContent = detail || 'Intenta de nuevo en un momento.';
  $('btnRetry').classList.toggle('is-hidden', !retryFn); $('btnRetry').onclick = retryFn;
  $('btnErrorRestart').classList.toggle('is-hidden', !!retryFn);
  showScreen('error');
}
$('btnErrorRestart').addEventListener('click', () => restart());

// --- Resultado ---------------------------------------------------------------------------------------
let occasions = [], readUnlocked = false, photosDeleted = false;
const fmtInt = (n) => Number(n || 0).toLocaleString('es');
const swatchesHtml = (arr, cls) => (arr || []).map(c => `<span class="sw ${cls || ''}"><i style="background:${escapeHtml(/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#999')}"></i>${escapeHtml(c.name)}</span>`).join('');
const TIER_NAME = { cara: 'Opción cara', intermedia: 'Opción intermedia', barata: 'Opción barata' };

function occasionHtml(o) {
  let d; try { d = JSON.parse(o.text); } catch { d = null; }
  if (!d) return '';
  return `<article class="occasion"><h3 class="display">${escapeHtml(o.label)}</h3><p class="why">${escapeHtml(d.why)}</p>` +
    d.options.map(op => `<div class="tier"><span class="tier-tag ${escapeHtml(op.tier)}">${TIER_NAME[op.tier] || escapeHtml(op.tier)}</span>
      <h4>${escapeHtml(op.title)}</h4><ul>${op.pieces.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
      <div class="swatches">${swatchesHtml(op.colors)}</div>
      <p class="style">${escapeHtml(op.style)}</p><p class="tip">${escapeHtml(op.tip)}</p></div>`).join('') + `</article>`;
}
function drawOccasions() {
  const open = occasions.filter(o => o.text), closed = occasions.filter(o => !o.text);
  $('occasions').innerHTML = open.map(occasionHtml).join('');
  const list = $('lockedList');
  if (!closed.length) { list.innerHTML = ''; list.classList.add('is-hidden'); return; }
  list.classList.remove('is-hidden');
  list.innerHTML = `<p class="locked-intro">Esto es lo que viene:</p>` + closed.map(c => `
    <div class="locked-item"><svg class="lock-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
      <div><p class="locked-title display">${escapeHtml(c.label)}</p><p class="locked-hook">${escapeHtml(c.hook)}</p>
      <p class="locked-words">3 opciones: cara, intermedia y barata${c.words ? ` · ${fmtInt(c.words)} palabras` : ''}</p></div></div>`).join('');
}

function renderReveal(data, { skipPaywall } = {}) {
  readingId = data.readingId; styleNameForShare = data.archetypeName || '';
  occasions = (data.nodes || []).map(n => ({ id: n.id, label: n.label, hook: n.hook, free: !!n.free, words: n.words || 0, text: n.text || null }));
  readUnlocked = false;
  $('styleName').textContent = data.archetypeName || ''; $('hookLine').textContent = data.hookLine || '';
  $('swBest').innerHTML = swatchesHtml(data.palette); $('swAvoid').innerHTML = swatchesHtml(data.avoid, 'avoid');
  $('paletteBlock').classList.toggle('is-hidden', !(data.palette || []).length);
  $('paywallCommitment').textContent = `Ya respondiste ${QUESTIONS.length} preguntas y subiste ${PHOTOS.length} fotos`;
  const closed = occasions.filter(c => !c.text).length;
  $('paywallHook').textContent = closed ? `${closed} ocasiones de tu guía siguen cerradas` : 'Tu guía continúa';
  $('skippedNote').classList.add('is-hidden'); $('payBlock').classList.remove('is-hidden'); $('fullContainer').classList.add('is-hidden');
  $('photosStatus').textContent = photosDeleted ? 'Tus fotos fueron borradas.' : 'Tus fotos están guardadas en un espacio privado.';
  $('btnDeletePhotos').classList.toggle('is-hidden', photosDeleted);
  drawOccasions(); showScreen('reveal');
  if (skipPaywall) { $('paywall').classList.add('is-hidden'); return; }
  savePending({ readingId: data.readingId, archetypeName: data.archetypeName, hookLine: data.hookLine, palette: data.palette, avoid: data.avoid, nodes: occasions, stats: data.stats });
  $('paywall').classList.remove('is-hidden');
  track('paywall_shown', { styleName: data.archetypeName || '', paywallVersion: PAYWALL_VERSION });
  watchPaywallInView(); initPaywall(readingId);
}

let paypalFailReason = '';
async function loadPaypalSdk() {
  if (window.paypal) return true;
  try {
    const res = await fetch('/.netlify/functions/qer-paypal-config'); const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.clientId) { paypalFailReason = !res.ok ? `config HTTP ${res.status}` : 'config sin clientId'; return false; }
    if (data.priceUsd) $('priceLabel').textContent = `$${data.priceUsd}`;
    await new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(data.clientId)}&currency=USD`; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar PayPal.')); document.head.appendChild(s); });
    if (!window.paypal) paypalFailReason = 'script cargó pero window.paypal no existe';
    return !!window.paypal;
  } catch (err) { paypalFailReason = String(err?.message || err).slice(0, 200); return false; }
}
async function initPaywall(forId) {
  const container = $('paypal-button-container'); container.innerHTML = '';
  if (!(await loadPaypalSdk())) {
    track('paypal_sdk_failed', { reason: paypalFailReason, paywallVersion: PAYWALL_VERSION });
    container.innerHTML = '<p style="color:#f3c6cc;font-size:.88rem">No se pudo cargar el pago. Revisa tu conexión y recarga la página.</p>'; return;
  }
  track('paypal_sdk_loaded', { paywallVersion: PAYWALL_VERSION });
  const payButtons = window.paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay' },
    onInit: () => track('paypal_buttons_ready', { paywallVersion: PAYWALL_VERSION }),
    onClick: () => track('paypal_button_clicked', { paywallVersion: PAYWALL_VERSION }),
    createOrder: async () => {
      const res = await fetch('/.netlify/functions/qer-paypal-create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ readingId: forId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { track('payment_order_create_failed', { reason: data.error || `HTTP ${res.status}` }); throw new Error(data.error || 'No se pudo iniciar el pago.'); }
      track('payment_order_created', {}); return data.orderID;
    },
    onApprove: async (d) => {
      const res = await fetch('/.netlify/functions/qer-paypal-capture-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderID: d.orderID, readingId: forId }) });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) { track('payment_captured_failed', { reason: result.error || `HTTP ${res.status}` }); alert(result.error || 'No se pudo confirmar el pago. Si el cargo sí se hizo, escríbenos.'); return; }
      track('payment_captured_success', { paywallVersion: PAYWALL_VERSION }); unlockReading(result);
    },
    onError: (e) => { track('paypal_error', { reason: String(e?.message || e).slice(0, 300), paywallVersion: PAYWALL_VERSION }); track('payment_captured_failed', { reason: String(e?.message || e).slice(0, 300) }); },
    onCancel: () => track('payment_cancelled', {})
  });
  if (!payButtons.isEligible()) { track('paypal_not_eligible', { paywallVersion: PAYWALL_VERSION }); return; }
  payButtons.render('#paypal-button-container')
    .then(() => track('paypal_buttons_rendered', { visible: container.offsetHeight > 20, height: container.offsetHeight, paywallVersion: PAYWALL_VERSION }))
    .catch(err => track('paypal_render_failed', { reason: String(err?.message || err).slice(0, 300), paywallVersion: PAYWALL_VERSION }));
}
function unlockReading({ mapTexts, closingLine }) {
  clearPending(); readUnlocked = true;
  const byId = new Map((mapTexts || []).map(t => [t.id, t.text]));
  occasions.forEach(c => { if (byId.has(c.id)) c.text = byId.get(c.id); });
  $('paywall').classList.add('is-hidden'); $('skippedNote').classList.add('is-hidden');
  drawOccasions();
  $('closingLine').textContent = closingLine || ''; $('fullContainer').classList.remove('is-hidden');
}

$('btnSkipPaywall').addEventListener('click', () => { track('paywall_skipped', { paywallVersion: PAYWALL_VERSION }); $('payBlock').classList.add('is-hidden'); $('skippedNote').classList.remove('is-hidden'); });
$('btnShowPay').addEventListener('click', () => { track('paywall_reopened', { paywallVersion: PAYWALL_VERSION }); $('skippedNote').classList.add('is-hidden'); $('payBlock').classList.remove('is-hidden'); });
document.querySelectorAll('.skip-reason').forEach(btn => btn.addEventListener('click', () => {
  track('paywall_skip_reason', { reason: btn.dataset.reason, paywallVersion: PAYWALL_VERSION });
  $('skipReasonBox').classList.add('is-hidden'); $('skipReasonThanks').classList.remove('is-hidden');
}));

// Borrar fotos a petición
$('btnDeletePhotos').addEventListener('click', async () => {
  if (!readingId || !confirm('Se borrarán tus 5 fotos del espacio privado. Tu guía no cambia. ¿Continuar?')) return;
  const b = $('btnDeletePhotos'); b.disabled = true;
  try {
    await postFn('vst-delete-photos', { readingId });
    photosDeleted = true; track('photos_deleted_by_user', {});
    $('photosStatus').textContent = 'Tus fotos fueron borradas.'; b.classList.add('is-hidden');
  } catch (e) { alert(e.message || 'No se pudieron borrar ahora. Inténtalo de nuevo.'); }
  b.disabled = false;
});

// --- Medición después del paywall ----------------------------------------------------------------------
const pageStartedAt = Date.now(); let paywallObserver = null, paywallSeen = false, scrollMaxPct = 0;
function watchPaywallInView() {
  paywallSeen = false; if (paywallObserver) paywallObserver.disconnect(); if (!('IntersectionObserver' in window)) return;
  paywallObserver = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting) && !paywallSeen) { paywallSeen = true; track('paywall_in_view', { secondsSinceLoad: Math.round((Date.now() - pageStartedAt) / 1000), paywallVersion: PAYWALL_VERSION }); paywallObserver.disconnect(); } }, { threshold: 0.4 });
  paywallObserver.observe($('paywall'));
}
window.addEventListener('scroll', () => { if (currentScreenName !== 'reveal') return; const h = document.documentElement.scrollHeight - window.innerHeight; if (h > 0) scrollMaxPct = Math.max(scrollMaxPct, Math.round((window.scrollY / h) * 100)); }, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  try {
    const payload = { event: 'page_hidden', anonId, metadata: { variant: 'vestirte', screen: currentScreenName, step: currentIndex + 1, seconds: Math.round((Date.now() - pageStartedAt) / 1000), paywallSeen, scrollMaxPct, unlocked: readUnlocked } };
    navigator.sendBeacon('/.netlify/functions/vst-track-event', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  } catch { /* no crítico */ }
});

function restart() {
  currentIndex = 0; answers.fill(null); Object.keys(photos).forEach(k => delete photos[k]); clearSession(); readingId = null; occasions = []; photosDeleted = false;
  clearPending(); clearProgress(); track('quiz_started', { restart: true }); renderStep(0); showScreen('quiz');
}
$('btnRestart').addEventListener('click', restart);
$('btnRestartFromSkip').addEventListener('click', restart);

// Retomar resultado pendiente o ya pagado
async function resumePendingIfAny() {
  const pending = loadPending();
  if (!pending || !Array.isArray(pending.nodes)) return;
  try {
    const res = await fetch('/.netlify/functions/qer-get-reading', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ readingId: pending.readingId }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.paid && data.mapTexts) { renderReveal(pending, { skipPaywall: true }); unlockReading({ mapTexts: data.mapTexts, closingLine: data.closingLine }); return; }
  } catch { /* sin conexión: pago normal */ }
  renderReveal(pending);
}
resumePendingIfAny();
