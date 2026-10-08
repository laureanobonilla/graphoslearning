// «tu canción»: bienvenida + ejemplos + cuestionario inteligente + letra + envío. Registro: funciones tc-* (tabla tc_songs) y events (app = 'tu-cancion').
(function () {
'use strict';
const APP = 'tu-cancion', TRACK_URL = '/.netlify/functions/sfc-track-event', SVGNS = 'http://www.w3.org/2000/svg';
const CONTACT_WHATSAPP = '50687772993';
const $ = (id) => document.getElementById(id);

// ---------- Ejemplos (pon los mp3 en tu-cancion/ejemplos/ con EXACTAMENTE estos nombres) ----------
const EXAMPLES = [
  { file: 'balada-lo-que-no-te-dije-a-tiempo.mp3', title: 'Lo que no te dije a tiempo', rhythm: 'Balada romántica' },
  { file: 'bachata-quedate-otra-vez.mp3', title: 'Quédate otra vez', rhythm: 'Bachata' },
  { file: 'cumbia-baila-conmigo-esta-noche.mp3', title: 'Baila conmigo esta noche', rhythm: 'Cumbia' },
  { file: 'alabanza-tu-fidelidad-me-sostiene.mp3', title: 'Tu fidelidad me sostiene', rhythm: 'Alabanza' },
  { file: 'ranchera-brindo-por-ti-mama.mp3', title: 'Brindo por ti, mamá', rhythm: 'Ranchera / Mariachi' },
  { file: 'rock-no-me-voy-a-rendir.mp3', title: 'No me voy a rendir', rhythm: 'Rock' },
  { file: 'rnb-quedate-hasta-el-amanecer.mp3', title: 'Quédate hasta el amanecer', rhythm: 'R&B' },
  { file: 'acustica-lo-simple-de-quererte.mp3', title: 'Lo simple de quererte', rhythm: 'Acústica' }
];
const RHYTHMS = ['Balada romántica', 'Bachata', 'Cumbia', 'Alabanza', 'Ranchera / Mariachi', 'Rock', 'R&B', 'Acústica', 'Pop'];
const REASONS = [
  { label: 'Para mi pareja', person: true }, { label: 'Un cumpleaños', person: true }, { label: 'Para mi mamá o papá', person: true },
  { label: 'Para un hijo o hija', person: true }, { label: 'Para un amigo o amiga', person: true }, { label: 'Para mí', person: true, self: true }
];
const QUAL_OTHERS = ['Su sonrisa', 'Su humor', 'Cómo me cuida', 'Su fuerza', 'Lo que hemos vivido juntos', 'Sus manías', 'Su música favorita', 'Su forma de ser', 'Su generosidad', 'Lo que ha logrado'];
const QUAL_SELF = ['Mi historia', 'Lo que he superado', 'Mis sueños', 'Mi forma de ser', 'Mi humor', 'Mis manías', 'Mi música favorita', 'Lo que he logrado'];
const FEELINGS = ['Emoción', 'Alegría', 'Gratitud', 'Nostalgia', 'Amor', 'Ganas de bailar', 'Risa', 'Orgullo'];

// ---------- Eventos ----------
function ensureAnonId() {
  try { let id = localStorage.getItem('tc_anon_id'); if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem('tc_anon_id', id); } return id; }
  catch { return `volatile-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
const anonId = ensureAnonId();
const UTM = (function () {
  const clean = (v) => String(v || '').replace(/[^\w.\-]/g, '').slice(0, 40);
  try {
    const q = new URLSearchParams(location.search), c = clean(q.get('utm_campaign') || q.get('c')), a = clean(q.get('utm_content') || q.get('ad'));
    if (c || a) { const v = { campaign: c, ad: a }; localStorage.setItem('tc_utm', JSON.stringify(v)); return v; }
    const old = JSON.parse(localStorage.getItem('tc_utm') || 'null'); return old && typeof old === 'object' ? { campaign: clean(old.campaign), ad: clean(old.ad) } : { campaign: '', ad: '' };
  } catch { return { campaign: '', ad: '' }; }
})();
function track(event, metadata) {
  try { fetch(TRACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ event, anonId, app: APP, metadata: Object.assign({}, metadata || {}, UTM.campaign ? { campaign: UTM.campaign } : {}, UTM.ad ? { ad: UTM.ad } : {}) }) }).catch(() => {}); } catch { /* no crítico */ }
}
track('landing_viewed', { referrer: document.referrer ? document.referrer.slice(0, 200) : null, likelyBot: /bot|crawl|spider|facebookexternalhit|whatsapp|preview|slackbot|embedly|discordbot/i.test(navigator.userAgent) });
async function postFn(name, payload) {
  const res = await fetch(`/.netlify/functions/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data;
}
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ok */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* ok */ } };

// ---------- País y precio ----------
let geo = { country: null, price: { text: '', amount: 0, currency: '' } }, geoReady = null;
function loadGeo() {
  if (geoReady) return geoReady;
  const q = new URLSearchParams(location.search).get('pais');
  geoReady = fetch('/.netlify/functions/tc-config' + (q && /^[A-Za-z]{2}$/.test(q) ? `?pais=${q}` : ''), { cache: 'no-store' }).then(r => r.json()).then(d => { if (d && d.price) geo = d; return geo; }).catch(() => geo);
  return geoReady;
}
loadGeo();

// ---------- Pantallas ----------
let currentScreen = 'welcome';
function showScreen(name) {
  currentScreen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  $(`screen-${name}`).classList.add('is-active');
  $('ctaBar').classList.toggle('is-hidden', name !== 'welcome');
  window.scrollTo(0, 0);
}

// ---------- Ondas ----------
function waveHeights(n, seed) { const o = []; for (let i = 0; i < n; i++) { const v = Math.abs(Math.sin(i * 0.52 + seed) + 0.65 * Math.sin(i * 1.31 + seed * 1.7) + 0.35 * Math.sin(i * 2.9 + seed)); o.push(Math.max(0.12, Math.min(1, v / 1.9))); } return o; }
(function drawWaves() {
  const svg = $('coverWave'), defs = document.createElementNS(SVGNS, 'defs');
  defs.innerHTML = '<linearGradient id="coverGrad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#e0246a"/><stop offset="1" stop-color="#ffbf2e"/></linearGradient>';
  svg.appendChild(defs);
  const n = 48, w = 320, h = 92, barW = 4.2, gap = (w - n * barW) / (n - 1);
  waveHeights(n, 1.3).forEach((p, i) => {
    const bh = Math.max(4, p * h), r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', (i * (barW + gap)).toFixed(2)); r.setAttribute('y', ((h - bh) / 2).toFixed(2)); r.setAttribute('width', barW); r.setAttribute('height', bh.toFixed(2)); r.setAttribute('rx', barW / 2); r.setAttribute('fill', 'url(#coverGrad)'); r.style.setProperty('--i', i); svg.appendChild(r);
  });
  const load = $('loadWave');
  for (let i = 0; i < 9; i++) { const r = document.createElementNS(SVGNS, 'rect'); r.setAttribute('x', i * 17); r.setAttribute('y', 4); r.setAttribute('width', 8); r.setAttribute('height', 56); r.setAttribute('rx', 4); r.style.setProperty('--i', i); load.appendChild(r); }
})();

// ---------- Ejemplos ----------
(function buildExamples() {
  const list = $('exList'); let current = null, audio = null;
  const stop = () => { if (audio) { audio.pause(); } if (current) { current.classList.remove('is-playing'); current = null; } };
  EXAMPLES.forEach((ex, i) => {
    const el = document.createElement('div'); el.className = 'ex';
    el.innerHTML = '<button type="button" class="play" aria-label="Escuchar"><svg class="ic-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg><svg class="ic-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg></button><div class="txt"><p class="t"></p><p class="m"></p><div class="bar"><i></i></div></div>';
    el.querySelector('.t').textContent = ex.title; el.querySelector('.m').textContent = ex.rhythm;
    const url = `ejemplos/${ex.file}`, btn = el.querySelector('.play'), fillEl = el.querySelector('.bar i');
    fetch(url, { method: 'HEAD' }).then(r => { if (!r.ok || !/audio|mpeg|octet/i.test(r.headers.get('content-type') || '')) el.classList.add('soon'); }).catch(() => el.classList.add('soon'));
    btn.addEventListener('click', () => {
      if (el.classList.contains('soon')) return;
      if (current === el) { stop(); return; }
      stop();
      audio = new Audio(url); current = el; el.classList.add('is-playing');
      audio.addEventListener('timeupdate', () => { if (audio.duration) fillEl.style.width = `${(audio.currentTime / audio.duration) * 100}%`; });
      audio.addEventListener('ended', () => { el.classList.remove('is-playing'); fillEl.style.width = '0'; current = null; });
      audio.addEventListener('error', () => { el.classList.remove('is-playing'); el.classList.add('soon'); current = null; });
      audio.play().catch(() => { el.classList.remove('is-playing'); });
      track('example_played', { index: i + 1, rhythm: ex.rhythm });
    });
    list.appendChild(el);
  });
})();
$('btnExamplesTop').addEventListener('click', () => { track('examples_clicked', {}); $('ejemplos').scrollIntoView({ behavior: 'smooth', block: 'start' }); });

// ---------- Estado del cuestionario ----------
const blank = () => ({ hasOwn: null, lyricsText: '', reason: '', reasonOther: '', named: null, name: '', qualities: [], qualitiesOther: '', feeling: '', feelingOther: '', extra: [], rhythm: '', rhythmOther: '', details: '', notes: '', aiStop: 3, title: '', lyrics: '', lyricsFinal: '', regen: 0 });
let S = blank(), id = crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0')}`;
let stack = [], stepId = 'price', aiMeta = [];   // aiMeta[i] = pantalla propuesta por Gemini para el paso i
const reasonObj = () => REASONS.find(r => r.label === S.reason);
const isPerson = () => !!reasonObj();
const isSelf = () => !!(reasonObj() && reasonObj().self);
const rhythmLabel = () => (S.rhythm === 'Otro' ? S.rhythmOther : S.rhythm);

function pathOf() {
  if (S.hasOwn === true) return ['hasLyrics', 'paste', 'rhythm', 'notes'];
  if (S.hasOwn === null) return ['hasLyrics'];
  const p = ['hasLyrics', 'reason'];
  if (S.reason === 'Otro') {
    for (let k = 0; k < S.aiStop; k++) p.push('ai' + k);
    if (S.aiStop < 3) p.push('free');   // Gemini no respondió: una sola caja para contarlo todo (sin mostrar ningún error)
    p.push('rhythm');
    if (S.aiStop >= 3) p.push('details');
    return p;
  }
  if (S.reason) {   // persona: nombre, lo que la hace especial y 2 preguntas inteligentes de Gemini (si fallan, se omiten en silencio)
    p.push('named', 'qualities');
    for (let k = 0; k < Math.min(S.aiStop, 2); k++) p.push('ai' + k);
  }
  p.push('rhythm', 'details');
  return p;
}
function saveState() { lsSet('tc_state_v1', { id, S, stack, stepId, aiMeta, savedAt: Date.now() }); }
function loadState() { const s = lsGet('tc_state_v1'); return s && s.S && s.id && Date.now() - (s.savedAt || 0) < 24 * 3600 * 1000 && s.stepId && s.stepId !== 'price' && s.stepId !== 'review' ? s : null; }

// ---------- Utilidades de pantalla de pasos ----------
const stepTitle = $('stepTitle'), stepHint = $('stepHint'), stepBody = $('stepBody'), btnNext = $('btnNext'), btnSkip = $('btnSkip'), btnBack = $('btnBack');
function choiceList({ options, multi, selected, onChange, otherLabel = 'Otro', otherValue, onOther, otherPlaceholder = 'Escríbelo aquí' }) {
  const wrap = document.createElement('div'); wrap.className = 'opts' + (multi ? ' multi' : '');
  wrap.setAttribute('role', multi ? 'group' : 'radiogroup');
  const sel = new Set(multi ? selected : (selected ? [selected] : []));
  const other = { on: !!onOther && (multi ? !!otherValue : selected === 'Otro') };
  const items = [];
  const refresh = () => items.forEach(it => it.btn.setAttribute('aria-checked', it.isOther ? String(other.on) : String(sel.has(it.value))));
  const emit = () => { onChange(multi ? [...sel] : ([...sel][0] || (other.on ? 'Otro' : ''))); };
  const mk = (label, value, isOther) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'opt' + (isOther ? ' opt-other' : ''); b.setAttribute('role', multi ? 'checkbox' : 'radio');
    const m = document.createElement('span'); m.className = 'mark'; m.textContent = '✓'; const l = document.createElement('span'); l.textContent = label; b.append(m, l);
    items.push({ btn: b, value, isOther }); return b;
  };
  options.forEach(o => {
    const b = mk(o, o, false);
    b.addEventListener('click', () => {
      if (multi) { sel.has(o) ? sel.delete(o) : sel.add(o); }
      else { sel.clear(); sel.add(o); other.on = false; if (ta) ta.classList.add('is-hidden'); }
      refresh(); emit();
    });
    wrap.appendChild(b);
  });
  let ta = null;
  if (onOther) {
    const b = mk(otherLabel, 'Otro', true);
    ta = document.createElement('textarea'); ta.className = 'field'; ta.rows = 2; ta.maxLength = 200; ta.placeholder = otherPlaceholder; ta.value = otherValue || ''; ta.classList.toggle('is-hidden', !other.on);
    b.addEventListener('click', () => {
      if (multi) { other.on = !other.on; } else { sel.clear(); other.on = true; }
      ta.classList.toggle('is-hidden', !other.on); refresh(); emit(); if (other.on) setTimeout(() => ta.focus(), 30);
    });
    ta.addEventListener('input', () => { onOther(ta.value); emit(); });
    wrap.appendChild(b);
  }
  refresh();
  const box = document.createElement('div'); box.appendChild(wrap); if (ta) box.appendChild(ta);
  return box;
}

// ---------- Definición de pasos ----------
const STEPS = {
  price: {
    title: 'Tu canción, antes de empezar', hint: '',
    render(body) {
      const p = geo.price || {};
      body.innerHTML = `<div class="price-box"><p class="amt"></p><p class="lbl">Es lo que cuesta tu canción terminada.</p><ul>
        <li>No pagas nada ahora.</li><li>Primero te enviamos una muestra para que la escuches.</li><li>Solo si te gusta, pagas y recibes tu canción completa.</li></ul><p class="inc"><b>Incluye:</b> la versión cantada y la pista instrumental.</p></div>`;
      body.querySelector('.amt').textContent = p.text || '';
    },
    ok: () => true, nextLabel: 'Entendido, empezar'
  },
  hasLyrics: {
    title: '¿Ya tienes el texto de tu canción?', hint: 'Si lo tienes, lo usamos tal cual. Si no, te ayudamos a crearlo.',
    render(body) {
      body.appendChild(choiceList({ options: ['Sí, ya tengo la letra', 'No, ayúdame a crearla'], multi: false, selected: S.hasOwn === true ? 'Sí, ya tengo la letra' : S.hasOwn === false ? 'No, ayúdame a crearla' : '',
        onChange: (v) => { S.hasOwn = v === 'Sí, ya tengo la letra' ? true : v === 'No, ayúdame a crearla' ? false : null; track('has_lyrics_chosen', { hasOwn: S.hasOwn }); update(); } }));
    },
    ok: () => S.hasOwn !== null,
    nextLabel: 'Seguir'
  },
  paste: {
    title: 'Escribe tu letra o pégala aquí', hint: 'Puedes cambiarla después, antes de enviarla.',
    render(body) {
      const ta = document.createElement('textarea'); ta.className = 'field tall'; ta.maxLength = 2600; ta.placeholder = 'Pega o escribe tu letra…'; ta.value = S.lyricsText;
      ta.addEventListener('input', () => { S.lyricsText = ta.value; update(); }); body.appendChild(ta);
    },
    ok: () => S.lyricsText.trim().length >= 40
  },
  reason: {
    title: '¿Para qué es tu canción?', hint: 'Elige lo que más se acerque.',
    render(body) {
      body.appendChild(choiceList({ options: REASONS.map(r => r.label), multi: false, selected: S.reason === 'Otro' ? 'Otro' : S.reason, otherLabel: 'Otro (cuéntanos)', otherValue: S.reasonOther, otherPlaceholder: 'Por ejemplo: una boda, un homenaje, mi negocio…',
        onChange: (v) => { if (v !== S.reason) { S.aiStop = 3; aiMeta = []; S.extra = []; } S.reason = v; if (v !== 'Otro') S.reasonOther = ''; track('reason_chosen', { reason: v === 'Otro' ? 'Otro' : v }); update(); },
        onOther: (t) => { S.reasonOther = t; } }));
    },
    ok: () => !!S.reason && (S.reason !== 'Otro' || S.reasonOther.trim().length >= 3)
  },
  named: {
    get title() { return isSelf() ? '¿Quieres que lleve tu nombre?' : '¿Quieres que la canción lleve su nombre?'; }, hint: 'Va dedicada: el nombre aparece en la letra.',
    render(body) {
      const self = isSelf();
      const box = choiceList({ options: [self ? 'Sí, con mi nombre' : 'Sí, con su nombre', 'No, sin nombre'], multi: false, selected: S.named === true ? (self ? 'Sí, con mi nombre' : 'Sí, con su nombre') : S.named === false ? 'No, sin nombre' : '',
        onChange: (v) => { S.named = /^Sí/.test(v) ? true : v ? false : null; nm.classList.toggle('is-hidden', S.named !== true); track('named_chosen', { named: S.named }); update(); if (S.named) setTimeout(() => inp.focus(), 30); } });
      const nm = document.createElement('div'); nm.className = S.named === true ? '' : 'is-hidden';
      const inp = document.createElement('input'); inp.className = 'field'; inp.type = 'text'; inp.maxLength = 30; inp.autocomplete = 'off'; inp.autocapitalize = 'words'; inp.placeholder = self ? 'Tu nombre' : 'Su nombre'; inp.value = S.name;
      inp.addEventListener('input', () => { S.name = inp.value; update(); });
      nm.appendChild(inp); box.appendChild(nm); body.appendChild(box);
    },
    ok: () => S.named === false || (S.named === true && /^[\p{L}][\p{L} '’-]{0,29}$/u.test(S.name.replace(/\s+/g, ' ').trim()))
  },
  qualities: {
    get title() { return isSelf() ? '¿Qué quieres que la canción cuente de ti?' : '¿Qué quieres que la canción destaque?'; }, hint: 'Elige todo lo que quieras.',
    render(body) {
      body.appendChild(choiceList({ options: isSelf() ? QUAL_SELF : QUAL_OTHERS, multi: true, selected: S.qualities, otherValue: S.qualitiesOther, otherPlaceholder: 'Escribe lo que quieras destacar',
        onChange: (v) => { S.qualities = v; update(); }, onOther: (t) => { S.qualitiesOther = t; } }));
    },
    ok: () => S.qualities.length > 0 || S.qualitiesOther.trim().length >= 2
  },
  feeling: {
    title: '¿Qué quieres que sienta quien la escuche?', hint: '',
    render(body) {
      body.appendChild(choiceList({ options: FEELINGS, multi: false, selected: S.feeling, otherValue: S.feelingOther, onChange: (v) => { S.feeling = v; update(); }, onOther: (t) => { S.feelingOther = t; } }));
    },
    ok: () => (S.feeling && S.feeling !== 'Otro') || (S.feeling === 'Otro' && S.feelingOther.trim().length >= 2)
  },
  rhythm: {
    title: '¿En qué ritmo la quieres?', hint: 'Elige el que más te guste.',
    render(body) {
      body.appendChild(choiceList({ options: RHYTHMS, multi: false, selected: S.rhythm, otherLabel: 'Otro (escribe cuál)', otherValue: S.rhythmOther, otherPlaceholder: 'Por ejemplo: vallenato, reguetón, rock…',
        onChange: (v) => { S.rhythm = v; track('rhythm_chosen', { rhythm: v }); update(); }, onOther: (t) => { S.rhythmOther = t; } }));
    },
    ok: () => (S.rhythm && S.rhythm !== 'Otro') || (S.rhythm === 'Otro' && S.rhythmOther.trim().length >= 2)
  },
  details: {
    title: '¿Algún detalle que quieras que incluyamos?', hint: 'Un recuerdo, una frase, un apodo, un lugar… Mientras más cuentes, más tuya queda. Puedes saltar este paso.',
    render(body) {
      const ta = document.createElement('textarea'); ta.className = 'field'; ta.rows = 6; ta.maxLength = 1500; ta.placeholder = 'Escríbelo con tus palabras…'; ta.value = S.details;
      ta.addEventListener('input', () => { S.details = ta.value; update(); }); body.appendChild(ta);
    },
    ok: () => true, skippable: true, nextLabel: 'Escribir mi letra'
  },
  free: {
    get title() { return S.aiStop === 0 ? 'Cuéntanos todo lo que quieres que lleve tu canción' : '¿Algo más que quieras que lleve tu canción?'; },
    get hint() { return 'Para quién es, qué quieres decir, un recuerdo, una frase, un nombre, un lugar… Mientras más cuentes, más tuya queda.'; },
    render(body) {
      const ta = document.createElement('textarea'); ta.className = 'field'; ta.rows = 8; ta.maxLength = 1500; ta.placeholder = 'Escríbelo con tus palabras…'; ta.value = S.details;
      ta.addEventListener('input', () => { S.details = ta.value; update(); }); body.appendChild(ta);
    },
    ok: () => true, skippable: true
  },
  notes: {
    title: '¿Alguna otra observación?', hint: 'Por ejemplo, para quién es o cómo la vas a usar. Puedes saltar este paso.',
    render(body) {
      const ta = document.createElement('textarea'); ta.className = 'field'; ta.rows = 5; ta.maxLength = 1200; ta.placeholder = 'Escríbela aquí…'; ta.value = S.notes;
      ta.addEventListener('input', () => { S.notes = ta.value; update(); }); body.appendChild(ta);
    },
    ok: () => true, skippable: true, nextLabel: 'Ver mi letra'
  }
};
// Pasos dinámicos (Gemini): ai0, ai1, ai2
[0, 1, 2].forEach(i => {
  STEPS['ai' + i] = {
    get title() { return (aiMeta[i] && aiMeta[i].question) || 'Un momento…'; },
    get hint() { return (aiMeta[i] && aiMeta[i].hint) || ''; },
    skippable: i > 0,
    render(body) {
      const m = aiMeta[i];
      if (!m) { body.innerHTML = '<div class="skeleton"><i></i><i></i><i></i><i></i><i></i></div>'; loadAi(i); return; }
      const cur = S.extra[i] || (S.extra[i] = { q: m.question, a: [], other: '', multi: m.multi });
      const sel = m.multi ? cur.a : (cur.a[0] || '');
      body.appendChild(choiceList({ options: m.options, multi: m.multi, selected: sel, otherValue: cur.other, otherPlaceholder: 'Escríbelo aquí',
        onChange: (v) => { cur.a = m.multi ? v : (v && v !== 'Otro' ? [v] : []); update(); }, onOther: (t) => { cur.other = t; } }));
    },
    ok: () => { const c = S.extra[i]; return !!c && (c.a.length > 0 || c.other.trim().length >= 2); },
    ready: () => !!aiMeta[i]
  };
});
async function loadAi(i) {
  const person = S.reason !== 'Otro';
  const hist = [];
  if (person && (S.qualities.length || S.qualitiesOther.trim())) hist.push({ q: 'Lo que la hace especial', a: S.qualities, other: S.qualitiesOther.trim() });
  S.extra.slice(0, i).filter(Boolean).forEach(e => hist.push({ q: e.q, a: e.a, other: e.other }));
  let d;
  try { d = await postFn('tc-next-step', { reason: person ? S.reason : S.reasonOther, person, step: i + 1, history: hist }); }
  catch { d = null; }
  if (!d || d.fallback || !Array.isArray(d.options) || d.options.length < 4) {
    // Contingencia silenciosa: sin error, la persona simplemente cuenta todo en un campo de texto.
    S.aiStop = i; track('ai_step_shown', { index: i + 1, fallback: true });
    const nxtId = person ? 'rhythm' : 'free';   // persona: se omiten las preguntas inteligentes; otra razón: una caja de texto
    if (stepId === 'ai' + i) { stepId = nxtId; track('step_viewed', { step: nxtId }); renderStep(); } else saveState();
    return;
  }
  aiMeta[i] = d; track('ai_step_shown', { index: i + 1, fallback: !!d.fallback });
  if (stepId === 'ai' + i) renderStep();
}

// ---------- Navegación ----------
function update() {
  const st = STEPS[stepId];
  btnNext.disabled = !(st.ok() && (!st.ready || st.ready()));
  saveState();
}
function renderStep() {
  const st = STEPS[stepId], path = pathOf();
  stepTitle.textContent = st.title; stepHint.textContent = st.hint || ''; stepHint.classList.toggle('is-hidden', !st.hint);
  stepBody.textContent = '';
  st.render(stepBody);
  const idx = Math.max(0, path.indexOf(stepId));
  const last = idx >= path.length - 1;
  $('fill').style.width = `${Math.round(((idx + 1) / (path.length + 1)) * 100)}%`;
  btnNext.textContent = st.nextLabel || (last ? 'Ver mi letra' : 'Seguir');
  btnSkip.classList.toggle('is-hidden', !st.skippable);
  btnBack.style.visibility = 'visible';
  update();
}
function goTo(id2, push = true) {
  if (push && stepId) stack.push(stepId);
  stepId = id2; track('step_viewed', { step: id2 }); showScreen('flow'); renderStep();
}
function advance() {
  const path = pathOf(), i = path.indexOf(stepId);
  if (stepId === 'rhythm' && S.hasOwn === true) { /* sigue a notes */ }
  const nxt = path[i + 1];
  if (nxt) goTo(nxt); else finishFlow();
}
btnNext.addEventListener('click', () => { if (!btnNext.disabled) advance(); });
btnSkip.addEventListener('click', () => { track('step_skipped', { step: stepId }); advance(); });
btnBack.addEventListener('click', () => { if (!stack.length) { track('back_clicked', { from: stepId, to: 'welcome' }); showScreen('welcome'); return; } track('back_clicked', { from: stepId }); stepId = stack.pop(); showScreen('flow'); renderStep(); });

// ---------- CTA ----------
function startFlow(from) {
  track('cta_clicked', { from });
  S = blank(); stack = []; aiMeta = []; id = crypto.randomUUID ? crypto.randomUUID() : id; lsDel('tc_song_v1');
  loadGeo().then(() => { if (stepId === 'price' && currentScreen === 'flow') renderStep(); });
  stepId = ''; goTo('hasLyrics', false);
}
$('btnCta').addEventListener('click', () => startFlow('bar'));
const saved = loadState();
if (saved) {
  $('btnResume').classList.remove('is-hidden');
  $('btnResume').addEventListener('click', () => {
    track('resume_clicked', { step: saved.stepId });
    S = Object.assign(blank(), saved.S); id = saved.id; stack = saved.stack || []; aiMeta = saved.aiMeta || []; stepId = saved.stepId;
    loadGeo(); showScreen('flow'); renderStep();
  });
}

// ---------- Generar la letra ----------
function briefOf() {
  return { hasOwnLyrics: S.hasOwn === true, reason: S.reason, reasonOther: S.reasonOther.trim(), named: S.named === true, name: S.named === true ? S.name.replace(/\s+/g, ' ').trim() : '',
    qualities: S.qualities, qualitiesOther: S.qualitiesOther.trim(), feeling: S.feeling === 'Otro' ? '' : S.feeling, feelingOther: S.feeling === 'Otro' ? S.feelingOther.trim() : '',
    extra: S.extra.filter(Boolean).map(e => ({ q: e.q, a: e.a, other: e.other.trim() })), rhythm: S.rhythm === 'Otro' ? '' : S.rhythm, rhythmOther: S.rhythm === 'Otro' ? S.rhythmOther.trim() : '', details: S.details.trim(), notes: S.notes.trim() };
}
const LOADING = ['Escuchando lo que nos contaste…', 'Buscando el estribillo…', 'Poniéndole ritmo a tus palabras…', 'Casi lista…'];
let loadTimer = null;
async function generate(variant) {
  showScreen('loading');
  let step = 0; $('loadLabel').textContent = LOADING[0];
  clearInterval(loadTimer); loadTimer = setInterval(() => { step = Math.min(step + 1, 3); $('loadLabel').textContent = LOADING[step]; }, 4500);
  const t0 = Date.now();
  track('lyrics_generating', { variant: !!variant });
  try {
    const d = await postFn('tc-generate-song', { id, anonId, brief: briefOf(), variant: !!variant });
    clearInterval(loadTimer);
    S.title = d.title; S.lyrics = d.lyrics; S.lyricsFinal = d.lyrics; if (variant) S.regen++;
    track('lyrics_generated', { seconds: Math.round((Date.now() - t0) / 1000), variant: !!variant });
    showReview();
  } catch (err) {
    clearInterval(loadTimer);
    track('lyrics_failed', { status: err.status || 0 });
    $('errorMsg').textContent = err.status === 429 ? 'Hiciste varias letras seguidas' : 'No pudimos escribir la letra';
    $('errorDetail').textContent = err.status === 429 ? err.message : 'Tus respuestas siguen guardadas. Inténtalo de nuevo en un momento.';
    $('btnRetry').onclick = () => generate(variant);
    showScreen('error');
  }
}
$('btnErrBack').addEventListener('click', () => { showScreen('flow'); renderStep(); });
function finishFlow() {
  if (S.hasOwn === true) {
    S.title = 'Tu canción'; S.lyrics = S.lyricsText.trim(); S.lyricsFinal = S.lyrics;
    track('own_lyrics_ready', { chars: S.lyrics.length, rhythm: rhythmLabel() });
    postFn('tc-song-request', { id, anonId, via: 'draft', brief: briefOf(), title: S.title, lyrics: S.lyrics, lyricsFinal: S.lyricsFinal, utm: UTM }).catch(() => {});
    showReview();
  } else generate(false);
}

// ---------- Mostrar la letra, editar, enviar ----------
function parseLyrics(text) {
  const parts = []; let cur = null;
  String(text).split(/\r?\n/).forEach(raw => {
    const line = raw.trim(); if (!line) { if (cur && cur.lines.length && !cur.label) cur = null; return; }
    const m = line.match(/^\[(.+?)\]$/);
    if (m) { cur = { label: m[1].trim(), lines: [] }; parts.push(cur); } else { if (!cur) { cur = { label: '', lines: [] }; parts.push(cur); } cur.lines.push(line); }
  });
  return parts;
}
function renderSheet() {
  const sheet = $('sheet'); sheet.textContent = ''; const seen = [];
  parseLyrics(S.lyricsFinal).forEach(p => {
    const sec = document.createElement('section'); sec.className = 'part';
    const chorus = /^(estribillo|coro)/i.test(p.label); if (chorus) sec.classList.add('chorus');
    const key = p.lines.join('|').toLowerCase(); if (chorus && seen.includes(key)) sec.classList.add('again'); else if (chorus) seen.push(key);
    if (p.label) { const h = document.createElement('h4'); h.textContent = p.label; sec.appendChild(h); }
    p.lines.forEach(l => { const d = document.createElement('p'); d.className = 'ln'; d.textContent = l; sec.appendChild(d); });
    sheet.appendChild(sec);
  });
}
let editing = false;
function showReview() {
  editing = false; $('editArea').classList.add('is-hidden'); $('sheet').classList.remove('is-hidden'); $('btnEdit').textContent = 'Editar letra';
  $('songTitle').textContent = S.title; $('songSub').textContent = S.hasOwn === true ? 'Tu letra, lista para enviar.' : 'Revísala. Puedes cambiar lo que quieras antes de enviarla.';
  $('btnRegen').classList.toggle('is-hidden', S.hasOwn === true || S.regen >= 2);
  $('sendBox').classList.add('is-hidden'); $('sendForm').classList.remove('is-hidden'); $('sendDone').classList.add('is-hidden');
  renderSheet(); showScreen('review'); lsSet('tc_song_v1', { id, S, savedAt: Date.now() }); lsDel('tc_state_v1');
  track('review_shown', { hasOwn: S.hasOwn === true, rhythm: rhythmLabel() });
  setupSend();
}
$('btnEdit').addEventListener('click', () => {
  const ta = $('editArea');
  if (!editing) { editing = true; ta.value = S.lyricsFinal; ta.classList.remove('is-hidden'); $('sheet').classList.add('is-hidden'); $('btnEdit').textContent = 'Listo, guardar cambios'; track('edit_clicked', {}); ta.focus(); }
  else { const v = ta.value.trim(); if (v.length < 20) { const b = $('btnEdit'); b.textContent = 'Escribe al menos una estrofa'; setTimeout(() => { if (editing) b.textContent = 'Listo, guardar cambios'; }, 1800); return; } S.lyricsFinal = v; editing = false; ta.classList.add('is-hidden'); $('sheet').classList.remove('is-hidden'); $('btnEdit').textContent = 'Editar letra'; renderSheet(); lsSet('tc_song_v1', { id, S, savedAt: Date.now() }); track('edit_saved', { changed: S.lyricsFinal !== S.lyrics }); }
});
$('btnRegen').addEventListener('click', () => { track('regen_clicked', {}); generate(true); });
$('btnAdjust').addEventListener('click', () => { track('adjust_clicked', {}); lsDel('tc_song_v1'); stack = []; const path = pathOf(); stepId = ''; goTo(S.hasOwn === true ? 'paste' : (path[2] || 'reason'), false); stack = ['price']; });
$('btnCopy').addEventListener('click', async () => { let ok = false; try { await navigator.clipboard.writeText(`${S.title}\n\n${S.lyricsFinal}`); ok = true; } catch { /* ok */ } $('btnCopy').textContent = ok ? 'Copiada' : 'No se pudo copiar'; setTimeout(() => { $('btnCopy').textContent = 'Copiar letra'; }, 1800); });

// Teléfono
const SONG_TZ_DIAL = { 'America/Costa_Rica': '+506', 'America/Montevideo': '+598', 'America/Mexico_City': '+52', 'America/Cancun': '+52', 'America/Monterrey': '+52', 'America/Tijuana': '+52', 'America/Argentina/Buenos_Aires': '+54', 'America/Bogota': '+57', 'America/Santiago': '+56', 'America/Lima': '+51', 'America/Guayaquil': '+593', 'America/Panama': '+507', 'America/Guatemala': '+502', 'America/El_Salvador': '+503', 'America/Tegucigalpa': '+504', 'America/Managua': '+505', 'America/Caracas': '+58', 'America/La_Paz': '+591', 'America/Asuncion': '+595', 'Europe/Madrid': '+34' };
function guessDial() { try { return SONG_TZ_DIAL[Intl.DateTimeFormat().resolvedOptions().timeZone] || ''; } catch { return ''; } }
function buildPhone(dial, raw) {
  let n = String(raw || '').replace(/[\s().\-]/g, '');
  if (!n) return { phone: '', reason: 'empty' };
  if (n.startsWith('00')) n = '+' + n.slice(2);
  const ok = (v) => /^\+[1-9]\d{7,14}$/.test(v);
  if (n.startsWith('+')) return ok(n) ? { phone: n, reason: '' } : { phone: '', reason: n.length < 9 ? 'short' : 'long' };
  if (/\D/.test(n)) return { phone: '', reason: 'short' };
  if (!dial) return { phone: '', reason: 'nodial' };
  const dd = dial.slice(1); n = n.replace(/^0+/, '');
  if (n.startsWith(dd) && n.length >= dd.length + 8 && n.length <= 15 && ok('+' + n)) return { phone: '+' + n, reason: '' };
  const full = dial + n; return ok(full) ? { phone: full, reason: '' } : { phone: '', reason: n.length + dial.length < 9 ? 'short' : 'long' };
}
const PHONE_MSG = { empty: 'Falta tu número de WhatsApp, por ejemplo 8888 1234.', short: 'Al número le faltan dígitos. Escríbelo completo, por ejemplo 8888 1234.', long: 'El número tiene demasiados dígitos. Revisa el código de país.', nodial: 'Elige tu país en la lista o escribe el número con + y el código.' };

let waPending = false, waPosted = false, waReturn = null;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && waReturn) waReturn(); });
function payload(via, extra) { return Object.assign({ id, anonId, via, brief: briefOf(), title: S.title, lyrics: S.lyrics, lyricsFinal: S.lyricsFinal, utm: UTM, consent: true, priceAck: true }, extra || {}); }
function setupSend() {
  waPending = false; waPosted = false;
  const dial = $('songDial'), phone = $('songPhone'); phone.value = ''; const g = guessDial(); if (g) dial.value = g;
  $('waBack').classList.add('is-hidden'); $('phoneBox').classList.add('is-hidden'); $('btnShowPhone').classList.remove('is-hidden'); $('sendErr').classList.add('is-hidden');
  const ack = $('priceAck'), priceTxt = geo.price && geo.price.text ? geo.price.text : '';
  $('ackText').textContent = priceTxt ? `Quiero recibir una muestra gratis y sin compromiso. Si me gusta, podré pagar ${priceTxt} por la canción completa, que incluye la versión cantada y la pista instrumental.` : 'Quiero recibir una muestra gratis y sin compromiso. Si me gusta, podré pagar por la canción completa, que incluye la versión cantada y la pista instrumental.';
  ack.checked = false;
  const gate = () => { const on = ack.checked; $('btnWa').classList.toggle('is-disabled', !on); $('btnWa').setAttribute('aria-disabled', String(!on)); $('btnPhoneSend').disabled = !on; $('ackHint').classList.toggle('is-hidden', on); };
  ack.onchange = () => { gate(); if (ack.checked) track('price_ack', { price: priceTxt, country: geo.country || '' }); };
  gate(); track('price_shown', { price: priceTxt, country: geo.country || '', where: 'review' });
  const waText = () => `Hola, quiero que suene mi canción 🎵\n«${S.title}»\nRitmo: ${rhythmLabel() || '—'}\nQuiero la muestra gratis y sin compromiso; si me gusta, la canción completa vale ${priceTxt || 'el precio indicado'}.\nMi código es: ${id.slice(0, 8)}`;
  const wa = $('btnWa'); wa.href = `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(waText())}`;
  wa.onclick = (ev) => {
    if (!ack.checked) { ev.preventDefault(); $('ackHint').classList.remove('is-hidden'); try { $('ackRow').scrollIntoView({ block: 'center' }); } catch { /* ok */ } return; }
    wa.href = `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(waText())}`;
    track('whatsapp_clicked', { primary: true }); waPending = true;
    if (!waPosted) { waPosted = true; postFn('tc-song-request', payload('whatsapp')).catch(() => {}); }
  };
  waReturn = () => { if (!waPending) return; waPending = false; $('waBack').classList.remove('is-hidden'); track('wa_return', {}); try { $('waBack').scrollIntoView({ block: 'center' }); } catch { /* ok */ } };
  const openPhone = () => { $('phoneBox').classList.remove('is-hidden'); $('btnShowPhone').classList.add('is-hidden'); $('waBack').classList.add('is-hidden'); };
  $('btnShowPhone').onclick = () => { track('phone_form_opened', {}); openPhone(); };
  $('waNo').onclick = () => { track('wa_not_sent', {}); openPhone(); };
  $('waYes').onclick = () => { track('wa_confirmed', {}); $('sendDoneText').textContent = 'Perfecto. Te respondemos por WhatsApp con la muestra de tu canción apenas veamos tu mensaje.'; $('sendForm').classList.add('is-hidden'); $('sendDone').classList.remove('is-hidden'); };
  $('phoneBox').onsubmit = async (ev) => {
    ev.preventDefault(); const err = $('sendErr'); err.classList.add('is-hidden');
    if (!ack.checked) { $('ackHint').classList.remove('is-hidden'); return; }
    const pr = buildPhone(dial.value, phone.value);
    if (!pr.phone) { track('phone_invalid', { reason: pr.reason, len: String(phone.value || '').replace(/\D/g, '').length, dial: dial.value }); err.textContent = PHONE_MSG[pr.reason] || PHONE_MSG.short; err.classList.remove('is-hidden'); phone.focus(); return; }
    const btn = $('btnPhoneSend'); btn.disabled = true; btn.textContent = 'Enviando…'; track('request_submitted', {});
    try {
      const d = await postFn('tc-song-request', payload('phone', { phone: pr.phone }));
      if (!d.ok) throw new Error('fallo');
      track('request_confirmed', {});
      $('sendDoneText').textContent = `Te escribiremos por WhatsApp al ${pr.phone} con una muestra de tu canción. Revisa tus mensajes pronto.`;
      $('sendForm').classList.add('is-hidden'); $('sendDone').classList.remove('is-hidden');
    } catch (e) {
      track('request_failed', { status: e.status || 0 });
      err.textContent = e.status ? (e.message || 'No pudimos registrar tu solicitud. Inténtalo de nuevo.') : 'Sin conexión. Inténtalo de nuevo.'; err.classList.remove('is-hidden');
      btn.disabled = false; btn.textContent = 'Enviar mi canción';
    }
  };
}
$('btnSendTop').addEventListener('click', () => {
  if (editing) $('btnEdit').click();
  track('send_opened', {}); const b = $('sendBox'); b.classList.remove('is-hidden'); try { b.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* ok */ }
});

// ---------- Medición al salir ----------
const pageStartedAt = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  try { navigator.sendBeacon(TRACK_URL, new Blob([JSON.stringify({ event: 'page_hidden', anonId, app: APP, metadata: { screen: currentScreen, step: stepId, seconds: Math.round((Date.now() - pageStartedAt) / 1000) } })], { type: 'application/json' })); } catch { /* ok */ }
});

// ---------- Recarga con la letra lista ----------
(function resumeSong() {
  const s = lsGet('tc_song_v1');
  if (!s || !s.id || !s.S || !s.S.lyricsFinal || Date.now() - (s.savedAt || 0) > 20 * 3600 * 1000) { lsDel('tc_song_v1'); return; }
  S = Object.assign(blank(), s.S); id = s.id; stepId = 'details'; stack = [];
  loadGeo().then(showReview);
})();
})();
