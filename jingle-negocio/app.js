// «jingle-negocio»: la persona llega desde el anuncio de Facebook (ya escuchó el jingle de su rubro) y aquí elige:
//  logo   → la canción del anuncio tal cual, con su logo
//  nombre → la canción del anuncio cantando el nombre de su negocio
//  propia → una canción nueva: cuenta su negocio, la IA propone la letra corta (editable) y elige el ritmo
// Registro: funciones jn-* (tabla jn_orders) y events (app = 'jingle-negocio').
// Enlace por anuncio: /jingle-negocio/?rubro=enderezado&c=campana&ad=anuncio  (rubro preseleccionado)
(function () {
'use strict';
const APP = 'jingle-negocio', TRACK_URL = '/.netlify/functions/sfc-track-event', SVGNS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);

// >>> EDITA AQUÍ los rubros (las claves deben coincidir con RUBROS de netlify/functions/_lib/jn-core.js) <<<
const RUBROS = [
  { key: 'enderezado', label: 'Taller de enderezado y pintura', icon: '🚗', hint: 'Por ejemplo: trabajamos con aseguradoras, pintura al horno, entregamos rápido, cotización gratis…' },
  { key: 'taller', label: 'Taller mecánico', icon: '🔧', hint: 'Por ejemplo: diagnóstico por computadora, frenos, cambio de aceite, revisión antes de la RTV…' },
  { key: 'lavacar', label: 'Lavacar', icon: '🧽', hint: 'Por ejemplo: lavado de motor, encerado, aspirado, rápido y con buen precio…' },
  { key: 'barberia', label: 'Barbería', icon: '💈', hint: 'Por ejemplo: cortes modernos, barba, ambiente, citas o sin cita…' },
  { key: 'salon', label: 'Salón de belleza / uñas', icon: '💅', hint: 'Por ejemplo: uñas acrílicas, tintes, alisados, maquillaje para eventos…' },
  { key: 'soda', label: 'Soda / restaurante', icon: '🍛', hint: 'Por ejemplo: casados, gallo pinto, comida casera, servicio express…' },
  { key: 'panaderia', label: 'Panadería / repostería', icon: '🥐', hint: 'Por ejemplo: pan caliente todos los días, queques por encargo, repostería fina…' },
  { key: 'gimnasio', label: 'Gimnasio', icon: '🏋️', hint: 'Por ejemplo: máquinas nuevas, clases grupales, instructores, horario amplio…' },
  { key: 'veterinaria', label: 'Veterinaria / tienda de mascotas', icon: '🐾', hint: 'Por ejemplo: consulta, vacunas, baño y corte, alimento, emergencias…' },
  { key: 'ferreteria', label: 'Ferretería', icon: '🔨', hint: 'Por ejemplo: materiales de construcción, entrega a domicilio, buenos precios…' }
];
const RHYTHMS = ['Cumbia', 'Reguetón', 'Merengue', 'Salsa', 'Pop', 'Rock', 'Bachata', 'Tropical / Calypso', 'Balada'];
const FALLBACK_PRICES = { logo: '₡12.900', nombre: '₡24.900', propia: '₡34.900' };
const OPTIONS = [
  { key: 'logo', title: 'La del anuncio, con su logo', desc: 'La misma canción que escuchó, con un video con su logo y sus datos.', fast: 'La más rápida' },
  { key: 'nombre', title: 'La del anuncio, con el nombre de su negocio', desc: 'La misma canción, pero cantando el nombre de su negocio. Incluye su logo.', fast: 'La más pedida' },
  { key: 'propia', title: 'Una totalmente suya', desc: 'Una canción nueva sobre su negocio, en el ritmo que elija. Usted revisa la letra antes.', fast: '' }
];

// ---------- Eventos ----------
function ensureAnonId() {
  try { let v = localStorage.getItem('jn_anon_id'); if (!v) { v = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem('jn_anon_id', v); } return v; }
  catch { return `volatile-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
const anonId = ensureAnonId();
const QS = new URLSearchParams(location.search);
const UTM = (function () {
  const clean = (v) => String(v || '').replace(/[^\w.\-]/g, '').slice(0, 40);
  return { campaign: clean(QS.get('utm_campaign') || QS.get('c')), ad: clean(QS.get('utm_content') || QS.get('ad')) };
})();
function track(event, metadata) {
  try { fetch(TRACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ event, anonId, app: APP, metadata: Object.assign({}, metadata || {}, UTM.campaign ? { campaign: UTM.campaign } : {}, UTM.ad ? { ad: UTM.ad } : {}) }) }).catch(() => {}); } catch { /* no crítico */ }
}
async function postFn(name, payload) {
  const res = await fetch(`/.netlify/functions/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data;
}
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ok */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* ok */ } };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0')}`);

// ---------- Precios ----------
let prices = Object.assign({}, FALLBACK_PRICES), priceNum = { logo: 12900, nombre: 24900, propia: 34900 };
fetch('/.netlify/functions/jn-config', { cache: 'no-store' }).then(r => r.json()).then(d => {
  if (!d || !d.options) return;
  Object.keys(d.options).forEach(k => { prices[k] = d.options[k].text; priceNum[k] = d.options[k].price; });
  if (currentScreen === 'flow') renderStep();
}).catch(() => {});
const money = (n) => '₡' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const totalText = () => S.option ? money(priceNum[S.option]) : '';

// ---------- Estado ----------
const preRubro = RUBROS.some(r => r.key === QS.get('rubro')) ? QS.get('rubro') : '';
const blank = () => ({ rubro: preRubro, rubroOther: '', option: '', business: '', pronounce: '', canton: '', slogan: '', phoneInSong: '', details: '', rhythm: '', rhythmOther: '', notes: '', title: '', lyrics: '', lyricsFinal: '', regen: 0, logoId: '', logoName: '', contactName: '', phone: '' });
let S = blank(), id = newId(), stack = [], stepId = '';
const rubroObj = () => RUBROS.find(r => r.key === S.rubro);
const rubroLabel = () => (S.rubro === 'otro' ? (S.rubroOther.trim() || 'su negocio') : (rubroObj() ? rubroObj().label : ''));
function pathOf() {
  const p = [];
  if (!preRubro) p.push('rubro');
  p.push('option', 'business');
  if (S.option === 'propia') p.push('details', 'rhythm');
  p.push('logo', 'contact');
  return p;
}
function saveState() { lsSet('jn_state_v1', { id, S, stack, stepId, savedAt: Date.now() }); }
function loadState() { const s = lsGet('jn_state_v1'); return s && s.S && s.id && s.stepId && Date.now() - (s.savedAt || 0) < 24 * 3600 * 1000 ? s : null; }
function briefOf() {
  return { rubro: S.rubro, rubroOther: S.rubroOther.trim(), option: S.option, business: S.business.trim(), pronounce: S.pronounce.trim(), canton: S.canton.trim(),
    slogan: S.slogan.trim(), phoneInSong: S.phoneInSong.trim(), details: S.details.trim(), rhythm: S.rhythm, rhythmOther: S.rhythmOther.trim(), notes: S.notes.trim() };
}

// ---------- Pantallas ----------
let currentScreen = 'welcome';
function showScreen(name) {
  currentScreen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  $(`screen-${name}`).classList.add('is-active');
  $('ctaBar').classList.toggle('is-hidden', name !== 'welcome');
  window.scrollTo(0, 0);
}
(function drawWaves() {
  const svg = $('coverWave'), defs = document.createElementNS(SVGNS, 'defs');
  defs.innerHTML = '<linearGradient id="coverGrad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#e0246a"/><stop offset="1" stop-color="#ffbf2e"/></linearGradient>';
  svg.appendChild(defs);
  const n = 40, w = 320, h = 70, barW = 4.6, gap = (w - n * barW) / (n - 1);
  for (let i = 0; i < n; i++) {
    const v = Math.abs(Math.sin(i * 0.52 + 2) + 0.65 * Math.sin(i * 1.31 + 3.4) + 0.35 * Math.sin(i * 2.9 + 2)) / 1.9, bh = Math.max(4, Math.min(1, Math.max(0.12, v)) * h);
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', (i * (barW + gap)).toFixed(2)); r.setAttribute('y', ((h - bh) / 2).toFixed(2)); r.setAttribute('width', barW); r.setAttribute('height', bh.toFixed(2)); r.setAttribute('rx', barW / 2); r.setAttribute('fill', 'url(#coverGrad)'); r.style.setProperty('--i', i); svg.appendChild(r);
  }
  const load = $('loadWave');
  for (let i = 0; i < 9; i++) { const r = document.createElementNS(SVGNS, 'rect'); r.setAttribute('x', i * 17); r.setAttribute('y', 4); r.setAttribute('width', 8); r.setAttribute('height', 56); r.setAttribute('rx', 4); r.style.setProperty('--i', i); load.appendChild(r); }
})();
if (preRubro) { const r = RUBROS.find(x => x.key === preRubro); $('heroRubro').textContent = `Jingle para su ${r.label.toLowerCase()}`; }
track('landing_viewed', { rubro: preRubro || null, referrer: document.referrer ? document.referrer.slice(0, 200) : null });

// ---------- Componentes ----------
function choiceList({ options, selected, onChange }) {
  const wrap = document.createElement('div'); wrap.className = 'opts'; wrap.setAttribute('role', 'radiogroup');
  options.forEach(o => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(o.value === selected));
    b.innerHTML = '<span class="mark">✓</span>'; const l = document.createElement('span'); l.textContent = o.label; b.appendChild(l);
    b.addEventListener('click', () => { wrap.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-checked', 'false')); b.setAttribute('aria-checked', 'true'); onChange(o.value); });
    wrap.appendChild(b);
  });
  return wrap;
}
function input({ label, value, placeholder, max = 60, onInput, type = 'text', optional, hint, attrs }) {
  const box = document.createElement('div'); box.className = 'fld';
  const l = document.createElement('label'); l.className = 'label'; l.textContent = label;
  if (optional) { const s = document.createElement('span'); s.className = 'opt-tag'; s.textContent = ' · opcional'; l.appendChild(s); }
  const i = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  i.className = 'field-in'; if (type !== 'textarea') i.type = type; else i.rows = 7; i.maxLength = max; i.placeholder = placeholder || ''; i.value = value || '';
  Object.assign(i, attrs || {});
  const fid = 'f' + Math.random().toString(36).slice(2, 8); i.id = fid; l.htmlFor = fid;
  i.addEventListener('input', () => { onInput(i.value); update(); });
  box.append(l, i);
  if (hint) { const h = document.createElement('p'); h.className = 'fine'; h.textContent = hint; box.appendChild(h); }
  return box;
}

// ---------- Pasos ----------
const STEPS = {
  rubro: {
    title: '¿Qué tipo de negocio tiene?', hint: '',
    render(body) {
      body.appendChild(choiceList({ options: [...RUBROS.map(r => ({ value: r.key, label: `${r.icon}  ${r.label}` })), { value: 'otro', label: '✨  Otro' }], selected: S.rubro,
        onChange: (v) => { S.rubro = v; track('rubro_chosen', { rubro: v }); update(); if (v !== 'otro') setTimeout(() => { if (stepId === 'rubro' && S.rubro === v) advance(); }, 260); else renderStep(); } }));
      if (S.rubro === 'otro') body.appendChild(input({ label: '¿Cuál?', value: S.rubroOther, placeholder: 'Por ejemplo: tienda de ropa', max: 80, onInput: (v) => { S.rubroOther = v; } }));
    },
    ok: () => !!S.rubro && (S.rubro !== 'otro' || S.rubroOther.trim().length >= 3)
  },
  option: {
    title: '¿Cómo quiere su jingle?', get hint() { return S.rubro === 'otro' ? '' : 'Puede usar la canción del anuncio o hacer una totalmente suya.'; },
    render(body) {
      const wrap = document.createElement('div'); wrap.className = 'cards'; wrap.setAttribute('role', 'radiogroup');
      OPTIONS.forEach(o => {
        if (S.rubro === 'otro' && o.key !== 'propia') return;   // sin canción de anuncio para su rubro: solo la personalizada
        const b = document.createElement('button'); b.type = 'button'; b.className = 'card-opt'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(S.option === o.key));
        b.innerHTML = `<span class="co-top"><span class="co-title"></span><span class="co-price"></span></span><span class="co-desc"></span>${o.fast ? '<span class="co-tag"></span>' : ''}`;
        b.querySelector('.co-title').textContent = o.title; b.querySelector('.co-price').textContent = prices[o.key]; b.querySelector('.co-desc').textContent = o.desc;
        if (o.fast) b.querySelector('.co-tag').textContent = o.fast;
        b.addEventListener('click', () => { S.option = o.key; track('option_chosen', { option: o.key }); wrap.querySelectorAll('.card-opt').forEach(x => x.setAttribute('aria-checked', 'false')); b.setAttribute('aria-checked', 'true'); paintTotal(); update(); });
        wrap.appendChild(b);
      });
      if (S.rubro === 'otro' && S.option !== 'propia') S.option = 'propia';
      body.appendChild(wrap);
      const tot = document.createElement('p'); tot.className = 'total'; tot.id = 'totalLine'; body.appendChild(tot); paintTotal();
    },
    ok: () => !!S.option
  },
  business: {
    title: 'Datos de su negocio', get hint() { return S.option === 'logo' ? 'Van en el video, junto a su logo.' : 'El nombre va cantado en la canción.'; },
    render(body) {
      body.appendChild(input({ label: 'Nombre del negocio', value: S.business, placeholder: 'Por ejemplo: Taller Hermanos Mora', max: 60, onInput: (v) => { S.business = v; }, attrs: { autocapitalize: 'words' } }));
      if (S.option !== 'logo') body.appendChild(input({ label: '¿Cómo se pronuncia?', value: S.pronounce, placeholder: 'Solo si se puede leer mal. Ej.: "Yei Ci Motors"', max: 60, optional: true, onInput: (v) => { S.pronounce = v; } }));
      body.appendChild(input({ label: 'Cantón o zona', value: S.canton, placeholder: 'Por ejemplo: Desamparados', max: 60, optional: true, onInput: (v) => { S.canton = v; } }));
      if (S.option === 'propia') {
        body.appendChild(input({ label: 'Eslogan o frase', value: S.slogan, placeholder: 'Por ejemplo: "Su carro como nuevo"', max: 120, optional: true, onInput: (v) => { S.slogan = v; } }));
        body.appendChild(input({ label: 'Teléfono que quiere que se cante', value: S.phoneInSong, placeholder: 'Por ejemplo: 8888 1234', max: 30, optional: true, type: 'tel', onInput: (v) => { S.phoneInSong = v; } }));
      }
    },
    ok: () => S.business.trim().length >= 2
  },
  details: {
    title: 'Cuéntenos de su negocio', hint: 'Escriba todo lo que quiera que diga la canción: qué ofrece, qué lo hace distinto, por qué la gente debería ir. Con sus palabras.',
    render(body) {
      const r = rubroObj();
      body.appendChild(input({ label: 'Lo que quiere que diga', value: S.details, placeholder: r ? r.hint : 'Qué vende, qué lo hace especial, a quién atiende…', max: 1500, type: 'textarea', onInput: (v) => { S.details = v; } }));
    },
    ok: () => S.details.trim().length >= 15
  },
  rhythm: {
    title: '¿En qué ritmo la quiere?', hint: 'Elija el que mejor vaya con su negocio.',
    render(body) {
      body.appendChild(choiceList({ options: [...RHYTHMS.map(r => ({ value: r, label: r })), { value: 'Otro', label: 'Otro' }], selected: S.rhythm,
        onChange: (v) => { S.rhythm = v; track('rhythm_chosen', { rhythm: v }); update(); if (v === 'Otro') renderStep(); } }));
      if (S.rhythm === 'Otro') body.appendChild(input({ label: '¿Cuál?', value: S.rhythmOther, placeholder: 'Por ejemplo: ranchera, vallenato…', max: 80, onInput: (v) => { S.rhythmOther = v; } }));
    },
    ok: () => (S.rhythm && S.rhythm !== 'Otro') || (S.rhythm === 'Otro' && S.rhythmOther.trim().length >= 2),
    nextLabel: 'Escribir mi letra'
  },
  logo: {
    title: 'Suba su logo', hint: 'Va en el video. Si no tiene a mano, puede saltar este paso y enviarlo después por WhatsApp.',
    render(body) {
      const box = document.createElement('div'); box.className = 'logo-box';
      box.innerHTML = '<input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="is-hidden"><label for="logoFile" class="logo-drop"><img id="logoPrev" alt="" class="is-hidden"><span id="logoTxt">Toque para elegir su logo</span></label><p id="logoMsg" class="fine"></p>';
      body.appendChild(box);
      if (S.logoId) { $('logoTxt').textContent = `Listo: ${S.logoName || 'logo subido'} · toque para cambiarlo`; }
      $('logoFile').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) uploadLogo(f); });
    },
    ok: () => !uploading, skippable: true, get nextLabel() { return S.logoId ? 'Seguir' : 'Seguir sin logo'; }
  },
  contact: {
    title: '¿A qué WhatsApp le escribimos?', hint: 'Ahí le enviamos las instrucciones de pago y su jingle.',
    render(body) {
      const sum = document.createElement('div'); sum.className = 'summary';
      const opt = OPTIONS.find(o => o.key === S.option);
      sum.innerHTML = '<p class="s-t"></p><p class="s-d"></p><p class="s-p"></p>';
      sum.querySelector('.s-t').textContent = S.business.trim();
      sum.querySelector('.s-d').textContent = `${opt ? opt.title : ''}${S.option === 'propia' && S.title ? ` · «${S.title}»` : ''}`;
      sum.querySelector('.s-p').textContent = `Total: ${totalText()}`;
      body.appendChild(sum);
      body.appendChild(input({ label: 'Su nombre', value: S.contactName, placeholder: 'Para saber con quién hablamos', max: 40, optional: true, onInput: (v) => { S.contactName = v; }, attrs: { autocomplete: 'name' } }));
      body.appendChild(input({ label: 'Su WhatsApp', value: S.phone, placeholder: '8888 1234', max: 20, type: 'tel', onInput: (v) => { S.phone = v; }, attrs: { autocomplete: 'tel', inputMode: 'tel' }, hint: 'Si no es de Costa Rica, escríbalo con el código de su país (+52…).' }));
      const ack = document.createElement('label'); ack.className = 'ack';
      ack.innerHTML = '<input type="checkbox" id="priceAck"><span>Entiendo que el total es <b class="tp"></b> y que se paga por SINPE Móvil antes de recibir el jingle.</span>';
      ack.querySelector('.tp').textContent = totalText(); body.appendChild(ack);
      $('priceAck').addEventListener('change', update);
      const err = document.createElement('p'); err.id = 'sendErr'; err.className = 'err is-hidden'; err.setAttribute('role', 'alert'); body.appendChild(err);
    },
    ok: () => phoneE164() && $('priceAck') && $('priceAck').checked,
    nextLabel: 'Enviar mi pedido'
  }
};
function paintTotal() { const t = $('totalLine'); if (t) t.textContent = S.option ? `Total: ${totalText()}` : ''; }
function phoneE164() {
  let s = String(S.phone || '').trim().replace(/[\s().\-]/g, ''); if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^[2-8]\d{7}$/.test(s)) s = '+506' + s;   // número de Costa Rica sin código
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
}

// ---------- Logo ----------
let uploading = false;
async function uploadLogo(file) {
  const msg = $('logoMsg'), txt = $('logoTxt'), prev = $('logoPrev');
  if (!/^image\//.test(file.type) || file.size > 10 * 1024 * 1024) { msg.textContent = 'Use una imagen JPG, PNG, WEBP o SVG de hasta 10 MB.'; return; }
  try { prev.src = URL.createObjectURL(file); prev.classList.remove('is-hidden'); } catch { /* ok */ }
  uploading = true; update(); txt.textContent = 'Subiendo…'; msg.textContent = '';
  try {
    const sig = await postFn('jn-sign-upload', { orderId: id, size: file.size, contentType: file.type });
    const fd = new FormData();
    fd.append('file', file); fd.append('api_key', sig.apiKey); fd.append('timestamp', sig.timestamp); fd.append('signature', sig.signature); fd.append('public_id', sig.publicId); fd.append('type', sig.type);
    const r = await fetch(sig.uploadUrl, { method: 'POST', body: fd });
    if (!r.ok) throw new Error('subida');
    S.logoId = sig.publicId; S.logoName = file.name.slice(0, 60); txt.textContent = `Listo: ${S.logoName} · toque para cambiarlo`; track('logo_uploaded', { size: file.size });
  } catch (e) {
    S.logoId = ''; txt.textContent = 'Toque para intentar de nuevo';
    msg.textContent = e.status ? e.message : 'No se pudo subir. Puede seguir y enviarlo después por WhatsApp.'; track('logo_failed', { status: e.status || 0 });
  } finally { uploading = false; update(); renderNextLabel(); }
}

// ---------- Navegación ----------
const stepTitle = $('stepTitle'), stepHint = $('stepHint'), stepBody = $('stepBody'), btnNext = $('btnNext'), btnSkip = $('btnSkip'), btnBack = $('btnBack');
function update() { const st = STEPS[stepId]; if (st) btnNext.disabled = !st.ok(); saveState(); }
function renderNextLabel() { const st = STEPS[stepId], path = pathOf(), last = path.indexOf(stepId) >= path.length - 1; btnNext.textContent = st.nextLabel || (last ? 'Enviar mi pedido' : 'Seguir'); }
function renderStep() {
  const st = STEPS[stepId], path = pathOf();
  stepTitle.textContent = st.title; stepHint.textContent = st.hint || ''; stepHint.classList.toggle('is-hidden', !st.hint);
  stepBody.textContent = ''; st.render(stepBody);
  const idx = Math.max(0, path.indexOf(stepId));
  $('fill').style.width = `${Math.round(((idx + 1) / (path.length + 1)) * 100)}%`;
  renderNextLabel(); btnSkip.classList.toggle('is-hidden', !st.skippable); update();
}
function goTo(next, push = true) { if (push && stepId) stack.push(stepId); stepId = next; track('step_viewed', { step: next }); showScreen('flow'); renderStep(); }
function advance() {
  if (stepId === 'rhythm') { generate(false); return; }
  if (stepId === 'contact') { submit(); return; }
  const path = pathOf(), nxt = path[path.indexOf(stepId) + 1];
  if (nxt) goTo(nxt);
}
btnNext.addEventListener('click', () => { if (!btnNext.disabled) advance(); });
btnSkip.addEventListener('click', () => { track('step_skipped', { step: stepId }); advance(); });
btnBack.addEventListener('click', () => { if (!stack.length) { showScreen('welcome'); return; } stepId = stack.pop(); showScreen('flow'); renderStep(); });
function startFlow(from) {
  track('cta_clicked', { from }); S = blank(); stack = []; id = newId(); lsDel('jn_state_v1');
  stepId = ''; goTo(pathOf()[0], false);
}
$('btnCta').addEventListener('click', () => startFlow('bar'));
$('btnHero').addEventListener('click', () => startFlow('hero'));
const saved = loadState();
if (saved && saved.stepId !== 'done') {
  $('btnResume').classList.remove('is-hidden');
  $('btnResume').addEventListener('click', () => { track('resume_clicked', { step: saved.stepId }); S = Object.assign(blank(), saved.S); id = saved.id; stack = saved.stack || []; stepId = saved.stepId; if (stepId === 'review') showReview(); else { showScreen('flow'); renderStep(); } });
}

// ---------- Letra (opción propia) ----------
const LOADING = ['Leyendo lo que nos contó…', 'Buscando el estribillo…', 'Poniéndole ritmo…', 'Casi lista…'];
let loadTimer = null;
async function generate(variant) {
  showScreen('loading'); let k = 0; $('loadLabel').textContent = LOADING[0];
  clearInterval(loadTimer); loadTimer = setInterval(() => { k = Math.min(k + 1, 3); $('loadLabel').textContent = LOADING[k]; }, 4000);
  track('lyrics_generating', { variant: !!variant });
  try {
    const d = await postFn('jn-generate-lyrics', { id, anonId, brief: briefOf(), variant: !!variant });
    clearInterval(loadTimer); S.title = d.title; S.lyrics = d.lyrics; S.lyricsFinal = d.lyrics; if (variant) S.regen++;
    track('lyrics_generated', { variant: !!variant }); if (stepId !== 'review') stack.push(stepId); stepId = 'review'; showReview();
  } catch (err) {
    clearInterval(loadTimer); track('lyrics_failed', { status: err.status || 0 });
    $('errorMsg').textContent = err.status === 429 ? 'Hizo varias letras seguidas' : 'No pudimos escribir la letra';
    $('errorDetail').textContent = err.status === 429 ? err.message : 'Sus datos siguen guardados. Inténtelo de nuevo en un momento.';
    $('btnRetry').onclick = () => generate(variant); showScreen('error');
  }
}
$('btnErrBack').addEventListener('click', () => { showScreen('flow'); renderStep(); });
function parseLyrics(text) {
  const parts = []; let cur = null;
  String(text).split(/\r?\n/).forEach(raw => {
    const line = raw.trim(); if (!line) return;
    const m = line.match(/^\[(.+?)\]$/);
    if (m) { cur = { label: m[1].trim(), lines: [] }; parts.push(cur); } else { if (!cur) { cur = { label: '', lines: [] }; parts.push(cur); } cur.lines.push(line); }
  });
  return parts;
}
function renderSheet() {
  const sheet = $('sheet'); sheet.textContent = '';
  parseLyrics(S.lyricsFinal).forEach(p => {
    const sec = document.createElement('section'); sec.className = 'part' + (/^(estribillo|coro)/i.test(p.label) ? ' chorus' : '');
    if (p.label) { const h = document.createElement('h4'); h.textContent = p.label; sec.appendChild(h); }
    p.lines.forEach(l => { const d = document.createElement('p'); d.className = 'ln'; d.textContent = l; sec.appendChild(d); });
    sheet.appendChild(sec);
  });
}
let editing = false;
function showReview() {
  editing = false; $('editArea').classList.add('is-hidden'); $('sheet').classList.remove('is-hidden'); $('btnEdit').textContent = 'Editar letra';
  $('songTitle').textContent = S.title || 'Su jingle'; $('btnRegen').classList.toggle('is-hidden', S.regen >= 2);
  renderSheet(); showScreen('review'); saveState(); track('review_shown', {});
}
$('btnEdit').addEventListener('click', () => {
  const ta = $('editArea');
  if (!editing) { editing = true; ta.value = S.lyricsFinal; ta.classList.remove('is-hidden'); $('sheet').classList.add('is-hidden'); $('btnEdit').textContent = 'Guardar cambios'; track('edit_clicked', {}); ta.focus(); return; }
  const v = ta.value.trim(); if (v.length < 20) return;
  S.lyricsFinal = v; editing = false; ta.classList.add('is-hidden'); $('sheet').classList.remove('is-hidden'); $('btnEdit').textContent = 'Editar letra'; renderSheet(); saveState(); track('edit_saved', { changed: S.lyricsFinal !== S.lyrics });
});
$('btnRegen').addEventListener('click', () => { track('regen_clicked', {}); generate(true); });
$('btnReviewBack').addEventListener('click', () => { stepId = stack.pop() || 'rhythm'; showScreen('flow'); renderStep(); });
$('btnReviewOk').addEventListener('click', () => { if (editing) $('btnEdit').click(); if (editing) return; track('lyrics_accepted', { edited: S.lyricsFinal !== S.lyrics }); goTo('logo'); });

// ---------- Enviar ----------
async function submit() {
  const err = $('sendErr'); err.classList.add('is-hidden'); btnNext.disabled = true; btnNext.textContent = 'Enviando…'; track('request_submitted', { option: S.option });
  try {
    const d = await postFn('jn-request', { id, anonId, via: 'whatsapp', brief: briefOf(), title: S.title, lyrics: S.lyrics, lyricsFinal: S.lyricsFinal, logoId: S.logoId, phone: phoneE164(), contactName: S.contactName.trim(), priceAck: true, utm: UTM });
    if (!d.ok) throw new Error('fallo');
    track('request_confirmed', { option: S.option });
    $('doneText').textContent = `Recibimos su pedido para ${S.business.trim()} (${totalText()}). En breve le escribimos al WhatsApp ${phoneE164()} con las instrucciones de pago por SINPE Móvil.${S.logoId ? '' : ' Si tiene logo, puede enviárnoslo por ahí mismo.'}`;
    stepId = 'done'; lsDel('jn_state_v1'); showScreen('done');
  } catch (e) {
    track('request_failed', { status: e.status || 0 });
    err.textContent = e.status ? (e.message || 'No pudimos enviar su pedido. Inténtelo de nuevo.') : 'Sin conexión. Inténtelo de nuevo.'; err.classList.remove('is-hidden');
    renderNextLabel(); update();
  }
}
})();
