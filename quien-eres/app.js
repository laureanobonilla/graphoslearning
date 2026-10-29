(function () {
'use strict';
var FN = '/.netlify/functions/';
var $ = function (id) { return document.getElementById(id); };
var TARGET = 30, MIC_FROM = 7, CARD_FROM = 7, MAX_RESERVE_RUN = 2, KEY_ID = 'ses_rid', KEY_ANON = 'ses_anon';

var FIXED = [
 { id: 'c1', t: 'choice', p: 'Cuando entras a un lugar lleno de gente, ¿qué haces con tu cara, tus manos y tu voz?', o: ['Sonrío y hablo más de lo normal', 'Me quedo callado/a y observo', 'Busco a alguien conocido y me quedo cerca', 'Actúo con seguridad aunque por dentro no la sienta'] },
 { id: 'c2', t: 'choice', p: '¿Qué haces con más frecuencia solo para quedar bien con alguien?', o: ['Digo que sí aunque quiero decir que no', 'Me río de algo que no me da risa', 'Me guardo mi opinión para no discutir', 'Hago favores que no me tocaban'] },
 { id: 'c3', t: 'choice', p: '¿De qué cosa de tu vida hablas como si ya estuviera resuelta, aunque no lo esté?', o: ['De una relación o de mi familia', 'Del trabajo o del dinero', 'De mi salud o de mi ánimo', 'De lo que quiero para mi futuro'] },
 { id: 'q8', t: 'short', p: '¿Qué personaje de película, serie o cuento se parece más a ti? ¿Qué parte suya te incomoda reconocer?', ph: 'El personaje y la parte incómoda' },
 { id: 'q6', t: 'short', p: 'Describe la sonrisa que pones cuando no tienes ganas de sonreír. ¿Qué esconde?', ph: 'Descríbela con detalle' }
];
var RESERVE = [
 { id: 'q2', t: 'short', p: 'Cuando alguien te pregunta "¿cómo estás?" y contestas "bien", ¿qué es lo que de verdad querrías decir?', ph: 'Dilo como lo sientes' },
 { id: 'q4', t: 'short', p: '¿Qué parte de ti se nota menos de lo que quisieras?', ph: 'Lo que los demás casi no ven' },
 { id: 'q1', t: 'short', p: 'Termina la frase: "La gente cree que soy..., pero en realidad soy..."', ph: 'Las dos partes, aunque no calcen' },
 { id: 'q3', t: 'short', p: '¿Cuál es la mentira que más te repites a ti?', ph: 'La que casi nunca dices en voz alta' },
 { id: 'q7', t: 'short', p: '¿Qué opinión tuya nunca dices en voz alta?', ph: 'Esa que te guardas' },
 { id: 'q11', t: 'short', p: 'Completa sin pensarlo mucho: "Lo que más me cuesta perdonar en alguien es..."', ph: 'Lo primero que se te venga' },
 { id: 'q12', t: 'short', p: 'Piensa en la última vez que alguien te falló de verdad. ¿Qué fue lo que más te dolió?', ph: 'Escribe solo lo que quieras compartir' },
 { id: 'q15', t: 'short', p: '¿Qué te prometiste dejar de hacer y sigues haciendo?', ph: 'Sin justificarte' },
 { id: 'q14', t: 'short', p: '¿A quién le debes una conversación que nunca has tenido? ¿Qué le dirías?', ph: 'Dile lo que no le dijiste' },
 { id: 'q16', t: 'short', p: '¿Qué parte de tu historia cuentas siempre igual para no volver a sentir lo que sentiste?', ph: 'La versión que repites' },
 { id: 'q18', t: 'short', p: 'Cuando algo te duele de verdad, ¿qué haces en los primeros cinco minutos, antes de que nadie lo note?', ph: 'Lo que haces en silencio' },
 { id: 'q33', t: 'short', p: '¿Qué cargas por los demás que nadie te pidió cargar?', ph: 'Lo que sostienes en silencio' },
 { id: 'q39', t: 'short', p: 'Si pudieras dejar de ser fuerte un día entero, ¿qué harías?', ph: 'Un día sin armadura' },
 { id: 'q43', t: 'short', p: '¿Qué estás aguantando que ya no deberías aguantar?', ph: 'Eso que ya no te toca' }
];
var CRISIS_RE = /(suicid|quitarme la vida|quitarme la vida|matarme|no quiero vivir|ya no quiero estar aqu[ií]|acabar con todo|hacerme da[ñn]o|cortarme|mejor muert[oa]|desaparecer para siempre)/i;

function anonId() {
  try { var i = localStorage.getItem(KEY_ANON); if (!i) { i = 'ses-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)); localStorage.setItem(KEY_ANON, i); } return i; }
  catch (e) { return 'ses-volatile-' + Date.now() + '-' + Math.random().toString(36).slice(2); }
}
var ANON = anonId();
function post(fn, body, ms) {
  var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms || 30000);
  return fetch(FN + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: c.signal })
    .then(function (r) { clearTimeout(t); return r.json().then(function (j) { if (!r.ok) throw Object.assign(new Error(j.error || 'http'), { status: r.status }); return j; }); });
}
function track(ev, md) { try { post('ses', { action: 'track', anonId: ANON, event: ev, metadata: md || {} }, 8000).catch(function () {}); } catch (e) {} }
function ses(action, extra) { return post('ses', Object.assign({ action: action, anonId: ANON, lang: 'es' }, extra), action === 'portrait' ? 40000 : 28000); }
function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function show(id) { ['intro', 'quiz', 'making', 'result', 'err'].forEach(function (x) { $(x).classList.toggle('hide', x !== id); }); window.scrollTo(0, 0); }

// ---- estado ----
var answers = [], asked = [], cur = null, reserveUsed = 0, reserveRun = 0;
var ready = null, inflight = false, waitSince = 0, waitTimer = null, crisisFlag = false, micUsed = false;

function norm(s) { return String(s).toLowerCase().replace(/[^a-záéíóúñü ]/g, '').trim(); }
function upcomingText() { return RESERVE.slice(reserveUsed, reserveUsed + 2).map(function (q) { return q.p; }); }

function maybeFetch() {
  if (inflight || ready || answers.length < 3 || answers.length >= TARGET) return;
  inflight = true;
  var snap = answers.length;
  ses('next', { answers: answers.map(function (a) { return { q: a.q, a: a.a }; }), avoid: asked.concat(upcomingText()).slice(-10) })
    .then(function (r) {
      inflight = false;
      if (r.crisis) onCrisis('next');
      ready = { forCount: snap, card: r.card, q: r.question, ph: r.placeholder };
      if (waiting) { waiting = false; clearTimeout(waitTimer); track('ses_wait', { ms: Date.now() - waitSince }); advance(); }
      
    })
    .catch(function () { inflight = false; if (waiting) { waiting = false; clearTimeout(waitTimer); useReserveOrFinish(); } });
}
var waiting = false;

function showCard(text) {
  if (!text || answers.length < CARD_FROM) return;
  var s = $('cardSlot'); s.textContent = '';
  s.appendChild(el('div', 'card', text)); track('ses_card_shown', { n: answers.length });
}

function renderQ(q, via) {
  cur = { q: q, via: via };
  asked.push(q.p);
  $('think').classList.add('hide'); $('qwrap').classList.remove('hide');
  $('qtext').textContent = q.p;
  var o = $('opts'); o.textContent = '';
  var free = $('free');
  if (q.t === 'choice') {
    free.classList.add('hide');
    q.o.forEach(function (t) { var b = el('button', 'opt', t); b.type = 'button'; b.onclick = function () { submit(t); }; o.appendChild(b); });
  } else {
    free.classList.remove('hide');
    var ta = $('ta'); ta.value = ''; ta.placeholder = q.ph || 'Escribe con tus palabras'; $('send').disabled = true;
    var canMic = answers.length >= MIC_FROM;
    $('micBtn').classList.toggle('hide', !canMic);
    $('micNote').textContent = '';
    setTimeout(function () { if (answers.length < MIC_FROM) try { ta.focus(); } catch (e) {} }, 50);
  }
  $('bar').style.width = Math.round(answers.length / TARGET * 100) + '%';
}

function submit(text) {
  if (!cur) return;
  text = String(text).trim(); if (!text) return;
  answers.push({ q: cur.q.p, a: text });
  track('ses_answer', { n: answers.length, via: cur.via, id: cur.q.id || 'ai', mic: micUsed && cur.q.t === 'short' ? 1 : 0 });
  if (cur.via === 'reserve') { reserveRun++; } else { reserveRun = 0; }
  if (CRISIS_RE.test(text)) onCrisis('answer');
  cur = null; $('cardSlot').textContent = '';
  if (answers.length >= TARGET) return finish();
  advance();
  maybeFetch();
}

function advance() {
  var n = answers.length;
  if (n < FIXED.length) return renderQ(FIXED[n], 'fixed');
  if (ready) {
    var r = ready; ready = null;
    renderQ({ t: 'short', p: r.q, ph: r.ph || 'Escribe con tus palabras' }, 'adaptive');
    if (n >= CARD_FROM && n - r.forCount <= 2) showCard(r.card);
    return;
  }
  if (reserveRun < MAX_RESERVE_RUN && reserveUsed < RESERVE.length) {
    var q = RESERVE[reserveUsed++]; return renderQ(q, 'reserve');
  }
  // esperar la pregunta personalizada
  waiting = true; waitSince = Date.now();
  $('qwrap').classList.add('hide'); $('think').classList.remove('hide');
  clearTimeout(waitTimer);
  waitTimer = setTimeout(function () { if (waiting) { waiting = false; track('ses_wait', { ms: Date.now() - waitSince, timeout: 1 }); useReserveOrFinish(); } }, 25000);
  if (!inflight) maybeFetch();
}
function useReserveOrFinish() {
  if (reserveUsed < RESERVE.length) { reserveRun = 0; renderQ(RESERVE[reserveUsed++], 'reserve'); }
  else finish();
}

$('ta').addEventListener('input', function () { $('send').disabled = !$('ta').value.trim(); });
$('send').onclick = function () { submit($('ta').value); };

// ---- ayuda / crisis ----
function renderHelp(box, picker) {
  var inner = el('div'); if (picker) window.ACP_HELP.picker(box, function (v) { window.ACP_HELP.fill(inner, v); });
  window.ACP_HELP.fill(inner, window.ACP_HELP.detect()); box.appendChild(inner);
}
var crisisShown = false;
function onCrisis(where) {
  crisisFlag = true;
  if (crisisShown) return; crisisShown = true;
  track('ses_crisis', { where: where, n: answers.length });
  var s = $('helpSlot'); s.textContent = '';
  var c = el('div', 'crisis'); c.appendChild(el('b', null, 'No estás sola ni solo. Lo que sientes importa, y hay personas listas para escucharte ahora:'));
  renderHelp(c, true); s.appendChild(c);
}
$('helpLink').onclick = function (e) { e.preventDefault(); $('helpBody').textContent = ''; $('helpBody').appendChild(el('h2', null, 'Líneas de ayuda')); renderHelp($('helpBody'), true); $('helpOv').classList.remove('hide'); };
$('helpClose').onclick = function () { $('helpOv').classList.add('hide'); };

// ---- micrófono ----
var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
var rec = null, recOn = false, silenceT = null, interim = '';
function micAsk(on) { $('micAsk').classList.toggle('hide', !on); }
function armSilence() { clearTimeout(silenceT); micAsk(false); silenceT = setTimeout(function () { if (recOn) micAsk(true); }, 7000); }
function startRec() {
  rec = new SR(); rec.lang = (navigator.language && /^es/i.test(navigator.language)) ? navigator.language : 'es-419';
  rec.continuous = true; rec.interimResults = true;
  rec.onresult = function (e) {
    var fin = '';
    interim = '';
    for (var i = e.resultIndex; i < e.results.length; i++) { var t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else interim += t; }
    var ta = $('micTa');
    if (fin) { ta.value = (ta.value ? ta.value.replace(/\s+$/, '') + ' ' : '') + fin.trim(); }
    $('micState').textContent = interim ? '… ' + interim : 'Te escucho. Habla con calma.';
    armSilence();
  };
  rec.onerror = function (e) {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { recOn = false; $('micState').textContent = 'No pude usar el micrófono (permiso negado). Puedes escribir aquí abajo.'; track('ses_mic_error', { e: e.error }); }
  };
  rec.onend = function () { if (recOn) { try { setTimeout(function () { if (recOn) startRec(); }, 150); } catch (e) {} } };
  try { rec.start(); } catch (e) {}
}
function stopRec() { recOn = false; clearTimeout(silenceT); micAsk(false); try { rec && rec.stop(); } catch (e) {} }
$('micBtn').onclick = function () {
  track('ses_mic_opened', { n: answers.length });
  $('micTa').value = $('ta').value; $('micOv').classList.remove('hide');
  if (!SR) { track('ses_mic_unsupported', {}); $('micState').textContent = 'Tu navegador no permite dictar desde aquí. Toca el cuadro y usa el micrófono de tu teclado.'; $('micTa').focus(); return; }
  recOn = true; $('micState').textContent = 'Te escucho. Habla con calma.'; armSilence(); startRec();
};
$('micMore').onclick = function () { armSilence(); };
function micFinish() {
  var had = recOn; stopRec();
  var v = $('micTa').value.trim(); $('micOv').classList.add('hide');
  if (v) { $('ta').value = v; $('send').disabled = false; micUsed = true; track('ses_mic_used', { n: answers.length, chars: v.length }); $('micNote').textContent = 'Revisa el texto y pulsa Continuar.'; }
}
$('micDone').onclick = micFinish; $('micDone1').onclick = micFinish;
$('micCancel').onclick = function () { stopRec(); $('micOv').classList.add('hide'); };
$('micTa').addEventListener('input', function () { if (recOn) armSilence(); });

// ---- retrato ----
var MSGS = ['Releyendo tus palabras…', 'Buscando lo que se repite…', 'Escribiendo tu retrato…'];
var lastMsg = null, msgT = null;
function finish() {
  show('making'); var i = 0, id = 'ses_' + (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  clearInterval(msgT); msgT = setInterval(function () { i = Math.min(i + 1, MSGS.length - 1); $('mmsg').textContent = MSGS[i]; }, 8000);
  track('ses_portrait_requested', { n: answers.length });
  var t0 = Date.now();
  var fail = function (why) { clearInterval(msgT); track('ses_portrait_error', { why: why, ms: Date.now() - t0 }); show('err'); };
  // se lanza en segundo plano (responde 202 enseguida) y se pregunta por el resultado cada pocos segundos
  post('ses-portrait-background', { id: id, anonId: ANON, lang: 'es', answers: answers.map(function (a) { return { q: a.q, a: a.a }; }) }, 20000).catch(function (e) { return e && e.status && e.status < 400 ? null : (e && e.name === 'SyntaxError' ? null : Promise.reject(e)); })
    .then(function () {
      var tries = 0;
      (function poll() {
        tries++;
        ses('get', { id: id }).then(function (r) {
          if (r.failed) return fail('failed');
          clearInterval(msgT); try { localStorage.setItem(KEY_ID, r.id); } catch (e) {}
          if (r.free) onCrisisResult();
          track('ses_portrait_shown', { ms: Date.now() - t0 });
          renderResult(r, true);
        }).catch(function (e) {
          if (e && e.status === 404 && tries < 60) return setTimeout(poll, 3000);
          if (e && e.status !== 404 && tries < 60) return setTimeout(poll, 4000);
          fail('timeout');
        });
      })();
    })
    .catch(function (e) { fail('start:' + (e && (e.status || e.name) || '')); });
}
$('retry').onclick = function () { finish(); };

var FILL = 'una forma de sostener lo que se calla cuando nadie pregunta y lo que se repite sin darte cuenta y por eso mismo se vuelve costumbre y cuesta nombrarlo hasta que alguien lo dice en voz alta con las palabras justas para que por fin pueda cambiar '.split(' ');
function filler(n) { var out = []; for (var i = 0; i < Math.min(Math.max(n, 30), 90); i++) out.push(FILL[i % FILL.length]); return out.join(' ') + '.'; }
function onCrisisResult() { crisisFlag = true; }

var paypalLoaded = false;
function renderResult(r, first) {
  var box = $('result'); box.textContent = ''; show('result');
  if (r.free || r.paid && crisisFlag) { var c = el('div', 'crisis'); c.appendChild(el('b', null, 'No estás sola ni solo. Si en algún momento lo necesitas, estas personas pueden escucharte:')); renderHelp(c, true); box.appendChild(c); }
  box.appendChild(el('p', 'muted', 'Tu retrato'));
  var f = el('div', 'finding'); f.appendChild(el('h2', null, r.patternName)); f.appendChild(el('p', 'para', r.finding)); box.appendChild(f);
  if (r.paid || r.free) { renderFull(box, r); return; }
  var pv = r.preview || [];
  pv.forEach(function (t, i) { var p = el('p', 'para', t + (i === pv.length - 1 ? '' : '')); box.appendChild(p); });
  var fl = el('p', 'para blur', filler(r.hiddenWords)); fl.setAttribute('aria-hidden', 'true'); box.appendChild(fl);
  var pay = el('div', 'paybox');
  var go = el('button', 'btn', 'Seguir leyendo'); go.type = 'button';
  pay.appendChild(go); box.appendChild(pay);
  track('ses_paywall_seen', { id: r.id });
  go.onclick = function () {
    track('ses_continue_clicked', { id: r.id });
    go.classList.add('hide');
    pay.appendChild(el('p', null, 'Lo que sigue: el resto de tu retrato, tres pasos concretos y un cierre. Pago único de USD ' + Number(r.price || 9.99).toFixed(2) + ', sin suscripción.'));
    var holder = el('div'); holder.id = 'pp'; pay.appendChild(holder);
    pay.appendChild(el('p', 'small', 'El pago se hace en PayPal (también con tarjeta). Recibes el texto completo aquí mismo.'));
    loadPayPal(r, holder);
  };
}
function renderFull(box, r) {
  (r.paragraphs || []).forEach(function (t) { box.appendChild(el('p', 'para', t)); });
  box.appendChild(el('h2', null, 'Tres pasos'));
  var ol = el('ol', 'steps'); (r.steps || []).forEach(function (t) { ol.appendChild(el('li', null, t)); }); box.appendChild(ol);
  box.appendChild(el('p', 'closing', r.closing || ''));
  var row = el('div', 'row');
  var cp = el('button', 'btn ghost', 'Copiar mi retrato'); cp.onclick = function () {
    var txt = [r.patternName, '', r.finding, ''].concat(r.paragraphs || [], ['', 'Tres pasos'], (r.steps || []).map(function (s, i) { return (i + 1) + '. ' + s; }), ['', r.closing || '']).join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { cp.textContent = 'Copiado'; track('ses_copied', {}); }, function () { cp.textContent = 'No se pudo copiar'; });
  };
  row.appendChild(cp); box.appendChild(row);
  box.appendChild(el('p', 'small', 'Guarda este enlace para volver a tu retrato: ' + location.origin + location.pathname + '?r=' + r.id));
  var again = el('p', 'small'); var al = el('a', null, 'Empezar una sesión nueva'); al.href = location.pathname; al.style.color = 'inherit'; al.onclick = function () { try { localStorage.removeItem(KEY_ID); } catch (e) {} }; again.appendChild(al); box.appendChild(again);
  box.appendChild(el('p', 'small', 'Esto es una reflexión, no una terapia ni un diagnóstico.'));
}

function loadPayPal(r, holder) {
  fetch(FN + 'ses-config').then(function (x) { return x.json(); })
    .then(function (cfg) {
      return new Promise(function (res, rej) {
        if (window.paypal) return res(cfg);
        var s = document.createElement('script'); s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(cfg.clientId) + '&currency=USD&intent=capture&components=buttons';
        s.onload = function () { res(cfg); }; s.onerror = rej; document.head.appendChild(s);
      });
    })
    .then(function () {
      window.paypal.Buttons({
        style: { layout: 'vertical', shape: 'pill', label: 'pay' },
        createOrder: function () { return post('ses-pay-create', { id: r.id, anonId: ANON }, 20000).then(function (j) { return j.orderID; }); },
        onApprove: function (d) {
          return post('ses-pay-capture', { id: r.id, orderID: d.orderID, anonId: ANON }, 30000).then(function (full) { track('ses_paid_client', { id: r.id }); renderResult(full, false); window.scrollTo(0, 0); })
            .catch(function () { holder.appendChild(el('p', null, 'El pago se hizo pero no pudimos mostrar el texto. Recarga esta página: ' + r.id)); });
        },
        onError: function () { track('ses_paypal_error', {}); holder.appendChild(el('p', null, 'PayPal tuvo un problema. Intenta de nuevo en un momento.')); }
      }).render(holder);
      track('ses_paypal_ready', {});
    })
    .catch(function () { track('ses_paypal_error', { stage: 'load' }); holder.appendChild(el('p', null, 'No se pudo cargar el pago. Recarga la página e inténtalo otra vez.')); });
}

// ---- arranque ----
$('start').onclick = function () { track('ses_start', {}); show('quiz'); advance(); };
track('ses_landing', { ref: (document.referrer || '').slice(0, 80), utm: (location.search.match(/utm_[a-z]+=[^&]+/g) || []).join('&').slice(0, 120) });
var qs = new URLSearchParams(location.search), rid = qs.get('r');
if (!rid) { try { rid = localStorage.getItem(KEY_ID); } catch (e) {} }
if (rid && /^ses_[a-f0-9-]{36}$/.test(rid)) {
  ses('get', { id: rid }).then(function (r) { if (r.failed) return; track('ses_resumed', {}); renderResult(r, false); }).catch(function () {});
}
})();
