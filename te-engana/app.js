(function () {
'use strict';
var API = '/.netlify/functions/vuelta';
var KEY = 'vuelta_s';
var $app = document.getElementById('app'), $modal = document.getElementById('modal');
var S = { cfg: null, resp: [], i: 0, id: null, gancho: null, fase: 'cover' };
var guardando = false, trampa = false;

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function save() { try { localStorage.setItem(KEY, JSON.stringify({ resp: S.resp, id: S.id, fase: S.fase })); } catch (e) {} }
function load() { try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o) { S.resp = o.resp || []; S.id = o.id || null; S.fase = o.fase || 'cover'; } } catch (e) {} }
function post(body) { return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { j.__s = r.status; return j; }); }); }
function aid() { try { var a = localStorage.getItem('vuelta_aid'); if (!a) { a = (self.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)).replace(/[^\w-]/g, ''); localStorage.setItem('vuelta_aid', a); } return a; } catch (e) { return null; } }
function esYo() { try { if (/[?&]yo=1\b/.test(location.search)) localStorage.setItem('vuelta_yo', '1'); if (/[?&]yo=0\b/.test(location.search)) localStorage.removeItem('vuelta_yo'); return localStorage.getItem('vuelta_yo') === '1'; } catch (e) { return false; } }
function track(evento, n) { try { fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'evento', evento: evento, sid: S.id, n: n, aid: aid(), yo: esYo(), wd: !!navigator.webdriver }), keepalive: true }); } catch (e) {} }
function show(html) { $app.innerHTML = html; window.scrollTo(0, 0); }

// ---------- Salida: guardamos el avance y avisamos, pero no se puede bloquear a nadie ----------
function activarTrampa() {
  if (trampa) return; trampa = true;
  window.addEventListener('beforeunload', onUnload);
  history.pushState({ v: 1 }, '');
  window.addEventListener('popstate', onPop);
}
function soltarTrampa() { trampa = false; window.removeEventListener('beforeunload', onUnload); window.removeEventListener('popstate', onPop); }
function onUnload(e) { if (S.fase === 'q' && S.resp.length > 0) { track('salida', S.resp.length); e.preventDefault(); e.returnValue = ''; return ''; } }
function onPop() {
  if (S.fase !== 'q') return;
  history.pushState({ v: 1 }, '');
  $modal.hidden = false;
  $modal.innerHTML = '<div class="box" role="dialog" aria-modal="true"><h3>¿Te vas ahora?</h3><p class="mute">Llevas ' + S.resp.length + ' de ' + S.cfg.preguntas.length + ' respuestas. Si sales, tu duda se queda sin respuesta. Guardamos tu avance por si quieres volver.</p><button class="btn" id="seguir">Seguir contestando</button><button class="btn ghost" id="salir">Salir</button></div>';
  document.getElementById('seguir').onclick = function () { $modal.hidden = true; };
  document.getElementById('salir').onclick = function () { soltarTrampa(); $modal.hidden = true; history.go(-2); };
}

// ---------- Pantallas ----------
function portada() {
  S.fase = 'cover';
  var n = S.cfg.preguntas.length, avance = S.resp.length > 0 && S.resp.length < n;
  show('<section class="cover"><span class="tag">Test de señales · 27 preguntas</span>' +
    '<h1>¿Te está <em>engañando</em> tu pareja?</h1>' +
    '<p>Contesta sobre lo que has notado en tu pareja: horarios, celular, ánimo, amistades. Al final sabrás qué tanto pesan las señales que te hicieron dudar.</p>' +
    '<ul><li>Es anónimo. No pedimos nombre ni correo.</li><li>Son 27 preguntas y toma unos 4 minutos.</li><li>Mientras más honesto seas, más claro sale.</li></ul>' +
    '<button class="btn" id="go">' + (avance ? 'Continuar (pregunta ' + (S.resp.length + 1) + ' de ' + n + ')' : 'Empezar') + '</button>' +
    '<p class="small mute">Es un análisis de señales basado en lo que tú observas. No es una prueba ni un veredicto sobre nadie.</p></section>');
  document.getElementById('go').onclick = function () { if (!avance) { S.resp = []; track('inicio'); } S.i = S.resp.length; preguntas(); };
}
function preguntas() {
  S.fase = 'q'; save(); activarTrampa();
  var P = S.cfg.preguntas, n = P.length, p = P[S.i], sel = S.resp[S.i];
  show('<section><div class="bar" aria-hidden="true"><i style="width:' + Math.round(S.i / n * 100) + '%"></i></div>' +
    '<div class="qhead"><span>Pregunta ' + (S.i + 1) + ' de ' + n + '</span><span>' + (n - S.i - 1 ? 'Faltan ' + (n - S.i - 1) : 'La última') + '</span></div>' +
    '<h2 class="q">' + esc(p.q) + '</h2><div class="opts" role="radiogroup">' +
    p.o.map(function (t, k) { return '<button class="opt' + (sel === k ? ' on' : '') + '" role="radio" aria-checked="' + (sel === k) + '" data-k="' + k + '">' + esc(t) + '</button>'; }).join('') +
    '</div>' + (S.i > 0 ? '<button class="back" id="atras">← Anterior</button>' : '') + '</section>');
  Array.prototype.forEach.call(document.querySelectorAll('.opt'), function (b) {
    b.onclick = function () {
      if (guardando) return; guardando = true;
      S.resp[S.i] = Number(b.dataset.k); b.classList.add('on'); save(); track('pregunta', S.i + 1);
      setTimeout(function () { guardando = false; if (S.i + 1 < n) { S.i++; preguntas(); } else analizar(); }, 260);
    };
  });
  var a = document.getElementById('atras'); if (a) a.onclick = function () { S.i--; preguntas(); };
}
function analizar() {
  S.fase = 'scan'; save(); soltarTrampa(); track('completo');
  var pasos = ['Cruzando tus 27 respuestas…', 'Comparando horarios y ausencias…', 'Buscando patrones entre celular y ánimo…', 'Pesando cada señal…', 'Preparando tu resultado…'];
  show('<section class="scan"><div class="pulse"></div><h2 style="margin-top:22px">Analizando tus respuestas</h2><ol>' + pasos.map(function (t, k) { return '<li id="s' + k + '">' + t + '</li>'; }).join('') + '</ol></section>');
  var k = 0, listo = false, datos = null, error = null;
  post({ accion: 'enviar', respuestas: S.resp }).then(function (j) { if (j.id) datos = j; else error = j.error || 'Error'; }).catch(function () { error = 'Sin conexión'; });
  var t = setInterval(function () {
    if (k > 0) document.getElementById('s' + (k - 1)).className = 'done';
    if (k < pasos.length) { document.getElementById('s' + k).className = 'on'; k++; return; }
    if (datos) { clearInterval(t); S.id = datos.id; S.gancho = datos.gancho; S.cfg.precio = datos.precio; S.fase = 'gancho'; save(); gancho(); }
    else if (error) { clearInterval(t); show('<section class="scan"><h2>No pudimos terminar el análisis</h2><p class="mute">' + esc(error) + '. Tus respuestas siguen guardadas.</p><button class="btn" id="rt">Intentar de nuevo</button></section>'); document.getElementById('rt').onclick = analizar; }
  }, 1100);
}
function gancho() {
  S.fase = 'gancho'; track('gancho');
  var g = S.gancho || { conectadas: 2, inicial: '?', palabras: 2, total: 6 };
  show('<section><p class="small mute">Tu análisis está listo</p>' +
    '<h2>Encontramos <b style="color:var(--amber)">' + g.conectadas + ' de ' + g.total + ' áreas</b> donde tus respuestas se conectan entre sí.</h2>' +
    '<div class="card"><p class="hint" style="margin-top:0">Una de ellas se distingue con claridad del resto.</p>' +
    '<div class="lockbars" aria-hidden="true"><i style="height:62%"></i><i style="height:38%"></i><i style="height:84%"></i><i style="height:50%"></i><i style="height:70%"></i><i style="height:30%"></i></div>' +
    '<p class="small mute" style="margin-top:14px">Qué área es, qué respuestas pesaron más y qué tan fuerte es el conjunto: eso está en tu informe.</p></div>' +
    '<div class="card"><h3>Tu informe completo</h3><ul class="pl" style="margin-top:8px"><li>El índice de señales con su explicación</li><li>Las 6 áreas, una por una, con lo que puede estar pasando</li><li>Las 5 respuestas tuyas que más pesaron</li><li>Lo que juega a favor de la confianza</li><li>Cómo hablarlo sin empeorar las cosas</li></ul>' +
    '<p style="margin-top:14px"><span class="price">US$' + esc(S.cfg.precio) + '</span> <span class="mute small">pago único con PayPal o tarjeta</span></p>' +
    '<div id="pp"></div><p class="err" id="perr" hidden></p></div>' +
    '<p class="small mute">Es un análisis de señales basado en lo que tú observas. No es una prueba ni un veredicto sobre nadie.</p></section>');
  paypal();
}
var ppP = null;
function cargarPP() {
  if (ppP) return ppP;
  ppP = new Promise(function (ok, mal) {
    var s = document.createElement('script');
    s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(S.cfg.clientId) + '&currency=USD&intent=capture&components=buttons';
    s.onload = function () { ok(window.paypal); }; s.onerror = function () { ppP = null; mal(new Error('No se pudo cargar PayPal.')); };
    document.head.appendChild(s);
  });
  return ppP;
}
function perr(m) { var e = document.getElementById('perr'); if (e) { e.textContent = m; e.hidden = false; } }
function paypal() {
  var box = document.getElementById('pp');
  box.innerHTML = '<p class="mute small">Cargando PayPal…</p>';
  cargarPP().then(function (pp) {
    box.innerHTML = '';
    pp.Buttons({
      style: { layout: 'vertical', shape: 'pill', label: 'pay' },
      createOrder: function () {
        track('pago_inicio');
        return post({ accion: 'crear', id: S.id }).then(function (j) { if (!j.orderID) throw new Error(j.error || 'No se pudo iniciar el pago'); return j.orderID; });
      },
      onApprove: function (d) {
        box.innerHTML = '<p class="mute">Confirmando tu pago…</p>';
        return post({ accion: 'capturar', id: S.id, orderID: d.orderID }).then(function (j) {
          if (j.reporte) { track('pago_ok'); S.fase = 'pagado'; save(); informe(j.reporte); }
          else { track('pago_error'); box.innerHTML = ''; perr(j.error || 'No se pudo confirmar el pago.'); paypal(); }
        });
      },
      onCancel: function () { track('pago_cancelado'); },
      onError: function () { track('pago_error'); perr('Hubo un problema con PayPal. Intenta de nuevo.'); }
    }).render(box);
  }).catch(function (e) { box.innerHTML = ''; perr(e.message); });
}
function informe(r) {
  show('<section><p class="small mute">Tu informe</p><h1 style="font-size:1.9rem">Índice de señales</h1>' +
    '<div style="margin-top:14px"><span class="gauge">' + r.pct + '%</span><span class="band">' + esc(r.banda) + '</span></div>' +
    '<p class="mute">Qué tan fuerte es el conjunto de señales que describiste. No mide si tu pareja te es infiel: mide cuánto pesa lo que tú has observado.</p>' +
    '<h3 style="margin-top:30px">Área por área</h3>' +
    r.areas.map(function (a) { return '<div class="arow"><div class="l"><span>' + esc(a.nombre) + '</span><span>' + a.v + '%</span></div><div class="bar"><i class="' + a.nivel + '" style="width:' + Math.max(a.v, 3) + '%"></i></div><p>' + esc(a.texto) + '</p></div>'; }).join('') +
    (r.pesan.length ? '<h3 style="margin-top:34px">Lo que más pesó</h3><ul class="pl">' + r.pesan.map(function (x) { return '<li><b>' + esc(x.r) + '</b><span>' + esc(x.q) + '</span></li>'; }).join('') + '</ul>' : '') +
    (r.favor.length ? '<h3 style="margin-top:34px">Lo que juega a favor de la confianza</h3><ul class="pl">' + r.favor.map(function (x) { return '<li><b>' + esc(x.r) + '</b><span>' + esc(x.q) + '</span></li>'; }).join('') + '</ul>' : '') +
    '<h3 style="margin-top:34px">Qué hacer con esto</h3>' +
    '<ul class="pl"><li><b>Observa dos semanas, sin perseguir.</b><span>Anota hechos concretos (fecha, qué pasó) en vez de interpretaciones. Revisar su celular a escondidas daña la confianza y casi nunca te deja tranquilo.</span></li>' +
    '<li><b>Habla de lo que sientes, no de lo que crees que hizo.</b><span>«Últimamente me siento lejos de ti y quisiera entender qué pasa» abre una conversación; «¿con quién andas?» la cierra.</span></li>' +
    '<li><b>Elige el momento.</b><span>Con calma, sin prisa, sin alcohol y no después de una discusión.</span></li>' +
    '<li><b>Fíjate en cómo responde, más que en qué responde.</b><span>Escucha, da explicaciones coherentes y se interesa por lo que sientes, o se defiende y te pone a ti como el problema.</span></li>' +
    '<li><b>Busca apoyo.</b><span>Una terapia de pareja o una persona de confianza ayudan cuando la duda ya no te deja vivir tranquilo/a.</span></li></ul>' +
    '<p class="small mute" style="margin-top:26px">Este informe es una estimación basada solo en tus respuestas. Las señales que describimos pueden tener muchas explicaciones y no prueban nada sobre nadie. Cualquier decisión importante debe apoyarse en conversaciones reales.</p>' +
    '<button class="btn ghost" id="nuevo">Hacer el test de nuevo</button></section>');
  document.getElementById('nuevo').onclick = function () { if (confirm('Esto borra tu informe de este dispositivo. ¿Seguro?')) { try { localStorage.removeItem(KEY); } catch (e) {} S.resp = []; S.id = null; S.i = 0; portada(); } };
}

// ---------- Inicio ----------
fetch(API).then(function (r) { return r.json(); }).then(function (cfg) {
  if (!cfg.preguntas) throw new Error(cfg.error || 'Error');
  S.cfg = cfg; load(); track('visita');
  var n = cfg.preguntas.length;
  if (S.id && (S.fase === 'gancho' || S.fase === 'pagado')) {
    post({ accion: 'ver', id: S.id }).then(function (j) {
      if (j.reporte) { informe(j.reporte); }
      else if (j.gancho) { S.gancho = j.gancho; S.cfg.precio = j.precio || cfg.precio; gancho(); }
      else portada();
    }).catch(portada);
  } else if (S.resp.length >= n && S.fase !== 'cover') analizar();
  else portada();
}).catch(function () { show('<section class="scan"><h2>No pudimos cargar el test</h2><p class="mute">Revisa tu conexión e intenta de nuevo.</p><button class="btn" onclick="location.reload()">Reintentar</button></section>'); });
})();
