/* =====================================================================================
   Examen de aptitudes · VERSIÓN GRATIS (/aptitud-gratis/)
   Mismas preguntas que la versión de pago (/aptitud/config.js). Al final: un resultado corto (apt-gratis) que
   destaca APRENDER MEJOR como una de las 4 áreas para ganar más, y lleva a Graphikosmos a crear gratis el primer
   mapa mental (el mismo «boleto» de prueba que usa /aprender/ al entrar desde el anuncio: hf-save, tool «aprende»).
   ===================================================================================== */
(function () {
'use strict';
const CFG = window.QER_CFG, Q = CFG.questions, TOTAL = Q.length, ACTS = CFG.acts;
const EARLY = CFG.finishEarlyAfter || 25, UNSURE = CFG.t.unknown_option || 'No estoy seguro';
const APP = 'aptitud-gratis';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* ok */ } }, del(k) { try { localStorage.removeItem(k); } catch { /* ok */ } } };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));

// --- origen (anuncio) y medición ---
let anonId = ls.get('gk_anon_id'); if (!anonId) { anonId = uuid(); ls.set('gk_anon_id', anonId); }
const qs = new URLSearchParams(location.search);
const ORIGEN = (() => {
  const camp = (qs.get('utm_campaign') || qs.get('c') || '').slice(0, 40);
  let ad = (qs.get('utm_content') || qs.get('ad') || '').slice(0, 40);
  const src = (qs.get('utm_source') || '').toLowerCase();
  if (!ad && (qs.get('fbclid') || /^(facebook|fb|instagram|ig|meta|messenger)$/.test(src) || /facebook|instagram|fb\.me|messenger|l\.fb/i.test(document.referrer || '') || /FBAN|FBAV|Instagram/.test(navigator.userAgent || ''))) ad = 'fb';
  const o = { campaign: camp || 'aptitud', ad: ad || 'aptitud' };
  try { const prev = JSON.parse(sessionStorage.getItem('apt_origen') || 'null'); if (prev && !camp && !ad) return prev; sessionStorage.setItem('apt_origen', JSON.stringify(o)); } catch { /* ok */ }
  return o;
})();
function track(event, metadata) {
  try { fetch('/.netlify/functions/qer-track-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ event, anonId, app: APP, metadata: Object.assign({}, metadata || {}, { campaign: ORIGEN.campaign, ad: ORIGEN.ad }) }) }).catch(() => {}); } catch { /* medir nunca rompe nada */ }
}

// --- estado ---
const KEY = 'apt_gratis_v1';
let S = (() => { try { const s = JSON.parse(ls.get(KEY) || 'null'); if (s && Array.isArray(s.a) && Date.now() - (s.at || 0) < 3 * 864e5) return s; } catch { /* ok */ } return null; })() || { a: new Array(TOTAL).fill(null), i: 0, result: null };
const save = () => { S.at = Date.now(); ls.set(KEY, JSON.stringify(S)); };
const answered = () => S.a.filter(Boolean).length;
let shownAt = Date.now();

// =====================================================================================
const app = $('#app'), progress = $('#progress'), fill = $('#progressFill');
function show(html, quiz) { app.innerHTML = html; progress.hidden = !quiz; window.scrollTo(0, 0); }

function vCover() {
  const resume = answered() > 0 && !S.result;
  show(`<section class="cover">
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M50 8a42 42 0 1 1 -0.01 0Z" stroke="#34d399" stroke-width="1.6" opacity=".6"/><path class="rise" d="M24 72 L40 56 L52 64 L76 36 M63 36 L76 36 L76 49" stroke="#34d399" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h1>${esc(CFG.t.cover_title)}</h1>
    <p class="sub">Un examen de aptitudes, de una pregunta a la vez. Al final ves tus fortalezas, las áreas que más te harían ganar y tu primer paso.</p>
    <span class="badge">Gratis · unos 8 minutos · sin registrarte</span>
    <button class="btn" data-a="start">${S.result ? 'Ver mi resultado' : 'Empezar el examen'}</button>
    ${resume ? `<button class="btn-ghost" data-a="resume" style="margin-top:12px">Continuar donde quedaste (pregunta ${Math.min(S.i + 1, TOTAL)} de ${TOTAL})</button>` : ''}
    ${S.result ? '<button class="btn-ghost" data-a="redo" style="margin-top:12px">Hacer el examen de nuevo</button>' : ''}
  </section>`);
}

function vQuestion() {
  const q = Q[S.i], cur = S.a[S.i];
  fill.style.width = Math.round(S.i / TOTAL * 100) + '%';
  shownAt = Date.now();
  let body = '';
  if (q.type === 'choice') {
    const opts = q.options.concat([UNSURE]);
    const other = cur && !opts.includes(cur);
    body = `<div class="opts">${opts.map((o, k) => `<button class="opt ${cur === o ? 'on' : ''}" data-a="pick" data-k="${k}"><span class="dot"></span><span>${esc(o)}</span></button>`).join('')}
      <button class="opt ${other ? 'on' : ''}" data-a="other"><span class="dot"></span><span>${esc(CFG.t.other_option)}</span></button></div>
      <div id="otherWrap" ${other ? '' : 'hidden'} style="margin-top:10px"><textarea id="otherTxt" rows="2" maxlength="300" placeholder="${esc(CFG.t.other_placeholder)}">${other ? esc(cur) : ''}</textarea></div>`;
  } else {
    body = `<textarea id="shortTxt" rows="3" maxlength="600" placeholder="${esc(q.placeholder || '')}">${esc(cur || '')}</textarea><p class="hint">${esc(CFG.t.short_hint)}</p>`;
  }
  const showEarly = answered() >= EARLY && S.i < TOTAL - 1;
  show(`<section class="quiz">
    <div class="qtop"><button class="back" data-a="back" ${S.i === 0 ? 'hidden' : ''} aria-label="Anterior">‹</button><span>${S.i + 1} de ${TOTAL}</span></div>
    <p class="act">Parte ${q.act} de ${ACTS.length} · ${esc(ACTS[q.act - 1] || '')}</p>
    <h2 class="prompt">${esc(q.prompt)}</h2>
    ${body}
    <div class="qbottom">
      <button class="btn full" data-a="next" id="next" ${S.a[S.i] ? '' : 'disabled'}>${S.i === TOTAL - 1 ? 'Ver mi resultado' : 'Siguiente'}</button>
      ${showEarly ? `<div class="early"><p>${esc(CFG.t.finish_early_note)}</p><button class="btn-ghost" data-a="early">${esc(CFG.t.finish_early_btn)}</button></div>` : ''}
    </div></section>`, true);
  if (showEarly && !vQuestion.offered) { vQuestion.offered = true; track('finish_early_offered', { answered: answered() }); }
  const ta = $('#shortTxt'); if (ta) setTimeout(() => ta.focus(), 40);
}
function valueNow() {
  const q = Q[S.i];
  if (q.type === 'choice') {
    const on = app.querySelector('.opt.on');
    if (on && on.dataset.a === 'other') { const t = $('#otherTxt'); return t && t.value.trim().length >= 2 ? t.value.trim() : null; }
    if (on) return on.querySelector('span:last-child').textContent;
    return S.a[S.i] || null;
  }
  const t = $('#shortTxt'); const v = t ? t.value.trim() : (S.a[S.i] || '');
  return v.length >= 2 ? v : null;
}
function next() {
  const v = valueNow(); if (!v) return;
  S.a[S.i] = v; const q = Q[S.i];
  track('question_answered', { questionIndex: S.i + 1, questionId: q.id, question: q.prompt, answer: v.slice(0, 300), seconds: Math.round((Date.now() - shownAt) / 1000) });
  if (S.i < TOTAL - 1) { S.i++; save(); vQuestion(); } else { save(); finish('end'); }
}

// --- resultado ---
async function finish(how) {
  fill.style.width = '100%';
  track('quiz_finished', { answered: answered(), how });
  const steps = ['Revisando tus respuestas y tus ejercicios…', 'Midiendo tus aptitudes…', 'Buscando tu primer paso…'];
  show(`<section class="center"><div class="dots"><i></i><i></i><i></i></div><p class="muted" id="ld">${steps[0]}</p></section>`);
  let k = 0; const rot = setInterval(() => { const el = $('#ld'); if (el) el.textContent = steps[Math.min(++k, steps.length - 1)]; }, 4500);
  try {
    const res = await fetch('/.netlify/functions/apt-gratis', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anonId, answers: Q.map((q, i) => ({ question: q.prompt, answer: S.a[i] || '' })).filter(x => x.answer) }) });
    const d = await res.json().catch(() => ({}));
    clearInterval(rot);
    if (!res.ok || !d.perfil) throw new Error(d.error || 'Error ' + res.status);
    S.result = d; save(); track('result_shown', { perfil: d.perfil, tema: d.tema });
    vResult();
  } catch (e) {
    clearInterval(rot); track('result_error', { reason: String(e.message).slice(0, 160) });
    show(`<section class="center"><h2>Tu resultado no pudo armarse.</h2><p class="muted">${esc(e.message)}</p><button class="btn" data-a="retry">Intentar de nuevo</button></section>`);
  }
}

function vResult() {
  const r = S.result;
  const learnI = r.areas.findIndex(a => a.aprender);
  const areas = r.areas.map((a, i) => `<div class="area ${a.aprender ? 'learn' : ''}"><span class="n">${i + 1}</span><div><h3>${esc(a.titulo)}${a.aprender ? '<span class="tag">Empieza por aquí</span>' : ''}</h3><p>${esc(a.porque)}</p></div></div>`).join('');
  show(`<section class="result">
    <p class="eyebrow">Tu perfil profesional</p>
    <h1>${esc(r.perfil)}</h1>
    <p class="lead">${esc(r.resumen)}</p>
    <div class="box"><h2>Tus aptitudes</h2>${r.aptitudes.map(a => `<div class="bar-row"><span>${esc(a.nombre)}</span><span class="bar"><i style="width:${a.puntaje}%"></i></span><b>${a.puntaje}</b></div>`).join('')}</div>
    ${r.fortalezas.length ? `<div class="box"><h2>Lo que ya tienes a tu favor</h2><ul class="strong">${r.fortalezas.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
    <div class="box"><h2>4 áreas para ganar más</h2>${areas}
      <p class="note">Las cuatro cuentan. Empieza por la ${learnI + 1}: aprender mejor hace que todas las demás avancen más rápido.</p></div>
    <div class="start">
      <h2>Tu primer paso, gratis</h2>
      <p>Aprender con un mapa mental te ayuda a entender y recordar más en menos tiempo. Te regalamos el primero, hecho con inteligencia artificial, sobre el tema que más te acerca a ganar más:</p>
      <label for="tema">Tema de tu mapa (puedes cambiarlo)</label>
      <input id="tema" maxlength="120" value="${esc(r.tema)}">
      <p style="color:#fff;font-size:.9rem;margin-top:-4px">${esc(r.tema_porque)}</p>
      <button class="btn full" data-a="map">Crear mi mapa mental gratis</button>
      <small>Se abre en Graphikosmos. El primer mapa es gratis; para seguir creando, te registras.</small>
      <p class="err" id="mapErr" hidden></p>
    </div>
    <p class="disc">${esc(CFG.t.disclaimer)}</p>
    <div style="text-align:center"><button class="btn-ghost" data-a="redo">Hacer el examen de nuevo</button></div>
  </section>`);
}

// --- a Graphikosmos con el boleto de un mapa gratis (mismo mecanismo que /aprender/) ---
let going = false;
async function goMap() {
  if (going) return;
  const tema = ($('#tema').value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (tema.length < 2) { $('#tema').focus(); return; }
  going = true; const btn = app.querySelector('[data-a="map"]'); btn.disabled = true; btn.textContent = 'Abriendo Graphikosmos…';
  const sid = uuid();
  track('map_clicked', { tema: tema.slice(0, 80), changed: tema !== S.result.tema });
  const go = () => {
    const phone = window.matchMedia && matchMedia('(max-width: 780px)').matches;
    location.href = phone ? `/m/?aprende=${sid}&t=${encodeURIComponent(tema)}` : `/?aprende=${sid}&ref=aprende&t=${encodeURIComponent(tema)}`;
  };
  let done = false; const once = () => { if (!done) { done = true; go(); } };
  fetch('/.netlify/functions/hf-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ sid, tool: 'aprende', anonId, first: true, completed: true, step: 1, total: 1, answers: { tema, origen: APP, perfil: S.result.perfil }, utm: ORIGEN }) })
    .then(r => { if (r.status === 429) track('map_ticket_limited', {}); }).catch(() => {}).finally(once);
  setTimeout(once, 2500);
}

// =====================================================================================
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a;
  if (a === 'start') { if (S.result) return vResult(); track('quiz_started', {}); S = { a: new Array(TOTAL).fill(null), i: 0, result: null }; save(); return vQuestion(); }
  if (a === 'resume') { track('quiz_resumed', { from: S.i + 1 }); return vQuestion(); }
  if (a === 'redo') { track('quiz_restarted', {}); S = { a: new Array(TOTAL).fill(null), i: 0, result: null }; save(); vQuestion.offered = false; return vQuestion(); }
  if (a === 'back') { const v = valueNow(); if (v) S.a[S.i] = v; if (S.i > 0) { S.i--; save(); vQuestion(); } return; }
  if (a === 'pick') {
    app.querySelectorAll('.opt').forEach(o => o.classList.toggle('on', o === b)); const w = $('#otherWrap'); if (w) w.hidden = true;
    $('#next').disabled = false; const at = S.i; setTimeout(() => { if (S.i === at && app.querySelector('.opt.on') === b) next(); }, 360); return;
  }
  if (a === 'other') { app.querySelectorAll('.opt').forEach(o => o.classList.toggle('on', o === b)); const w = $('#otherWrap'); w.hidden = false; const t = $('#otherTxt'); $('#next').disabled = t.value.trim().length < 2; setTimeout(() => t.focus(), 30); return; }
  if (a === 'next') return next();
  if (a === 'early') { const v = valueNow(); if (v) S.a[S.i] = v; save(); track('quiz_finished_early', { answered: answered(), at: S.i + 1 }); return finish('early'); }
  if (a === 'retry') return finish('retry');
  if (a === 'map') return goMap();
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'shortTxt' || e.target.id === 'otherTxt') { const n = $('#next'); if (n) n.disabled = e.target.value.trim().length < 2; }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'tema') { e.preventDefault(); goMap(); } });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  try { navigator.sendBeacon('/.netlify/functions/qer-track-event', new Blob([JSON.stringify({ event: 'page_hidden', anonId, app: APP, metadata: { answered: answered(), result: !!S.result } })], { type: 'application/json' })); } catch { /* ok */ }
});

track('landing_viewed', { referrer: document.referrer ? document.referrer.slice(0, 120) : '', campaign: ORIGEN.campaign, ad: ORIGEN.ad });
vCover();
})();
