/* Aporte voluntario DENTRO de la página (/una-mano/, /me-levanto/).
   La persona elige el monto, paga con PayPal o con tarjeta sin salir de la página,
   y cada paso queda registrado (incluido POR QUÉ falló un pago).
   Necesita que la página defina antes window.APOYO_CTX = { app, anon, track, fallbackUrl, shareWa, shareFb }.
   Si el SDK de PayPal no carga, ofrece el enlace de PayPal de siempre (fallbackUrl). */
(function () {
  'use strict';
  var ctx = window.APOYO_CTX;
  if (!ctx || !ctx.app) return;

  var CUR = ctx.currency === 'EUR' ? 'EUR' : 'USD';
  var AMOUNTS = ctx.amounts || [2, 3, 10];
  var DEFAULT_AMOUNT = ctx.defaultAmount || 3;
  var MIN = 1, MAX = 500;
  // Cómo se escribe un monto: 10 € (euros) o $10 (dólares)
  function fmt(n, long) {
    var v = (n % 1) ? Number(n).toFixed(2) : String(Number(n));
    if (CUR === 'EUR') v = v.replace('.', ',');
    if (CUR === 'EUR') return v + ' €';
    return (long ? 'US$' : '$') + v;
  }
  var CUR_WORD = CUR === 'EUR' ? 'en euros' : 'en dólares';

  var track = function (n, p) { try { ctx.track(n, p || {}); } catch (e) {} };
  var post = function (url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); });
  };

  /* ---------- estilos (usa los colores de la página) ---------- */
  var css = '' +
    '.ap-back{position:fixed;inset:0;z-index:50;background:rgba(10,7,5,.72);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s}' +
    '.ap-back[hidden]{display:none}' +
    '.ap-back.on{opacity:1}' +
    '.ap-sheet{width:100%;max-width:480px;max-height:92vh;overflow:auto;background:var(--bg-2,#1f1812);color:var(--ink,#f6ecdf);border:1px solid var(--line,rgba(246,236,223,.12));border-bottom:0;border-radius:22px 22px 0 0;padding:22px 20px calc(22px + env(safe-area-inset-bottom));transform:translateY(30px);transition:transform .25s ease;position:relative}' +
    '.ap-back.on .ap-sheet{transform:none}' +
    '@media(min-width:560px){.ap-back{align-items:center}.ap-sheet{border-radius:22px;border-bottom:1px solid var(--line,rgba(246,236,223,.12))}}' +
    '.ap-x{position:absolute;top:10px;right:10px;width:40px;height:40px;border:0;border-radius:50%;background:transparent;color:var(--ink-soft,#cbbba7);font-size:26px;line-height:1;cursor:pointer}' +
    '.ap-sheet h3{font-family:var(--serif,Georgia,serif);font-weight:600;font-size:24px;margin:0 0 4px;padding-right:36px}' +
    '.ap-sub{color:var(--ink-soft,#cbbba7);font-size:15px;margin:0 0 16px}' +
    '.ap-chips{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}' +
    '.ap-chip{border:1px solid var(--line,rgba(246,236,223,.18));background:rgba(255,255,255,.03);color:var(--ink,#f6ecdf);border-radius:14px;padding:14px 4px;font:inherit;font-weight:700;font-size:18px;cursor:pointer;min-height:54px}' +
    '.ap-chip.other{font-size:14px;font-weight:600}' +
    '.ap-chip[aria-pressed="true"]{background:linear-gradient(180deg,var(--gold-hi,#f5bf6a),var(--gold,#e9a84c));color:var(--gold-ink,#2a1a06);border-color:transparent}' +
    '.ap-other{display:none;align-items:center;gap:8px;margin-bottom:12px;background:rgba(255,255,255,.04);border:1px solid var(--line,rgba(246,236,223,.18));border-radius:14px;padding:4px 14px}' +
    '.ap-other.on{display:flex}' +
    '.ap-other span{color:var(--ink-soft,#cbbba7);font-weight:700;font-size:18px}' +
    '.ap-other input{flex:1;min-width:0;background:transparent;border:0;color:var(--ink,#f6ecdf);font:inherit;font-size:20px;font-weight:700;padding:10px 0;outline:none}' +
    '.ap-sum{display:flex;justify-content:space-between;align-items:baseline;font-size:15px;color:var(--ink-soft,#cbbba7);margin:4px 2px 14px}' +
    '.ap-sum b{color:var(--ink,#f6ecdf);font-size:20px}' +
    '.ap-box{background:#fff;border-radius:16px;padding:14px 12px 4px;min-height:120px}' +
    '.ap-load{color:#555;text-align:center;font-size:14px;padding:30px 0}' +
    '.ap-msg{min-height:20px;margin:12px 2px 0;font-size:14px;color:#ffb4a2}' +
    '.ap-msg.ok{color:var(--ink-soft,#cbbba7)}' +
    '.ap-note{font-size:13px;color:var(--ink-faint,#8f7f6c);margin:10px 2px 0;line-height:1.45}' +
    '.ap-fallback{display:none;margin-top:10px;text-align:center}' +
    '.ap-fallback.on{display:block}' +
    '.ap-fallback a{color:var(--gold-hi,#f5bf6a);font-weight:700}' +
    '.ap-box{position:relative}' +
    '.ap-need{position:absolute;inset:0;z-index:2;display:none;align-items:center;justify-content:center;text-align:center;padding:16px;border-radius:16px;background:rgba(255,255,255,.93);color:#2a1a06;font-weight:700;font-size:16px;line-height:1.3}' +
    '.ap-need.on{display:flex}' +
    '.ap-help{margin-top:14px;border:1px solid var(--line,rgba(246,236,223,.18));border-radius:14px;padding:10px 12px;font-size:14px;color:var(--ink-soft,#cbbba7)}' +
    '.ap-help-btn{background:none;border:0;color:var(--gold-hi,#f5bf6a);font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;padding:6px 0}' +
    '.ap-help-form{display:grid;gap:8px;margin-top:6px}.ap-help-form[hidden]{display:none}' +
    '.ap-help-form textarea,.ap-help-form input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid var(--line,rgba(246,236,223,.18));border-radius:12px;color:var(--ink,#f6ecdf);font:inherit;font-size:16px;padding:10px 12px}' +
    '.ap-help-form button{border:0;border-radius:12px;padding:11px 16px;font:inherit;font-weight:700;background:var(--gold,#e9a84c);color:var(--gold-ink,#2a1a06);cursor:pointer}' +
    '.ap-help-st{min-height:18px;color:#ffb4a2}.ap-help-st.ok{color:var(--gold-hi,#f5bf6a)}' +
    '.ap-thanks{text-align:center;padding:10px 0 6px}' +
    '.ap-thanks .big{font-size:46px;line-height:1;margin-bottom:8px}' +
    '.ap-thanks p{color:var(--ink-soft,#cbbba7);margin:0 0 16px}' +
    '.ap-song{margin:0 0 18px;text-align:left}' +
    '.ap-song label{display:block;font-size:14px;color:var(--ink-soft,#cbbba7);margin-bottom:6px}' +
    '.ap-song-row{display:flex;gap:8px}' +
    '.ap-song input{flex:1;min-width:0;background:rgba(255,255,255,.05);border:1px solid var(--line,rgba(246,236,223,.18));border-radius:12px;color:var(--ink,#f6ecdf);font:inherit;font-size:16px;padding:11px 12px}' +
    '.ap-song button{border:0;border-radius:12px;padding:0 16px;font:inherit;font-weight:700;background:var(--gold,#e9a84c);color:var(--gold-ink,#2a1a06);cursor:pointer}' +
    '.ap-song small{display:block;margin-top:6px;color:var(--gold-hi,#f5bf6a)}' +
    '.ap-song small[hidden]{display:none}' +
    '.ap-thanks .ap-share{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}' +
    '.ap-thanks .ap-share a{display:inline-flex;align-items:center;gap:8px;text-decoration:none;color:var(--ink,#f6ecdf);border:1px solid var(--line,rgba(246,236,223,.18));padding:11px 18px;border-radius:999px;font-weight:500;font-size:15px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- estructura ---------- */
  var back = document.createElement('div');
  back.className = 'ap-back'; back.hidden = true;
  back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-labelledby', 'apTitle');
  back.innerHTML =
    '<div class="ap-sheet">' +
      '<button class="ap-x" type="button" aria-label="Cerrar">×</button>' +
      '<div class="ap-form">' +
        '<h3 id="apTitle">' + (ctx.title || 'Tu aporte') + '</h3>' +
        '<p class="ap-sub">Elige cuánto quieres aportar. Tú decides.</p>' +
        '<div class="ap-chips">' +
          AMOUNTS.map(function (a) { return '<button type="button" class="ap-chip" data-amt="' + a + '" aria-pressed="false">' + fmt(a) + '</button>'; }).join('') +
          '<button type="button" class="ap-chip other" data-amt="other" aria-pressed="false">Otro monto</button>' +
        '</div>' +
        '<label class="ap-other"><span>' + (CUR === 'EUR' ? '€' : '$') + '</span><input type="number" inputmode="decimal" min="' + MIN + '" max="' + MAX + '" step="1" placeholder="Escribe el monto" aria-label="Otro monto ' + CUR_WORD + '"></label>' +
        '<div class="ap-sum"><span>Tu aporte (' + CUR_WORD + ')</span><b class="ap-total">' + fmt(DEFAULT_AMOUNT, true) + '</b></div>' +
        '<div class="ap-box"><div class="ap-need" aria-live="polite">Escribe arriba cuánto quieres aportar y aquí aparece el pago.</div><div class="ap-load">Cargando opciones de pago…</div><div class="ap-pp"></div></div>' +
        '<div class="ap-msg" aria-live="polite"></div>' +
        '<p class="ap-note">Puedes pagar con <b>tarjeta de débito o crédito sin cuenta de PayPal</b>, o con tu cuenta de PayPal. Pago seguro procesado por PayPal.</p>' +
        '<div class="ap-fallback">¿No te carga? <a class="ap-fb-link" target="_blank" rel="noopener">Abrir el pago en PayPal</a></div>' +
        '<div class="ap-help"><button type="button" class="ap-help-btn">¿No pudiste aportar o tienes una duda? Escríbeme</button>' +
          '<form class="ap-help-form" hidden><textarea rows="3" maxlength="1500" placeholder="Cuéntame qué pasó" aria-label="Tu mensaje" required></textarea><input type="email" placeholder="Tu correo (obligatorio, para responderte)" aria-label="Tu correo" autocomplete="email" required><button type="submit">Enviar</button><div class="ap-help-st" aria-live="polite"></div></form></div>' +
      '</div>' +
      '<div class="ap-thanks" hidden>' +
        '<div class="big">♡</div>' +
        '<h3 class="ap-thx-title">¡Gracias!</h3>' +
        '<p class="ap-thx-text"></p>' +
        (ctx.askSong ? '<form class="ap-song"><label for="apSong">¿Qué canción te gustaría escucharme cantar?</label><div class="ap-song-row"><input id="apSong" maxlength="120" placeholder="Canción y artista" autocomplete="off"><button type="submit">Enviar</button></div><small class="ap-song-ok" hidden>¡Anotada! Gracias.</small></form>' : '') +
        '<div class="ap-share">' +
          '<a class="ap-wa" target="_blank" rel="noopener">Compartir por WhatsApp</a>' +
          '<a class="ap-fbk" target="_blank" rel="noopener">Compartir en Facebook</a>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(back);

  var $ = function (s) { return back.querySelector(s); };
  var chips = back.querySelectorAll('.ap-chip');
  var otherBox = $('.ap-other'), otherIn = $('.ap-other input'), totalEl = $('.ap-total');
  var needEl = $('.ap-need'), msg = $('.ap-msg'), load = $('.ap-load'), fallback = $('.ap-fallback');
  $('.ap-fb-link').href = ctx.fallbackUrl || '#';
  if (ctx.shareWa) $('.ap-wa').href = ctx.shareWa; else $('.ap-wa').remove();
  if (ctx.shareFb) $('.ap-fbk').href = ctx.shareFb; else $('.ap-fbk').remove();
  $('.ap-wa') && $('.ap-wa').addEventListener('click', function () { track('share_click', { network: 'whatsapp', from: 'thanks' }); });
  $('.ap-fbk') && $('.ap-fbk').addEventListener('click', function () { track('share_click', { network: 'facebook', from: 'thanks' }); });
  $('.ap-fb-link').addEventListener('click', function () { track('pay_fallback_link'); });
  var songForm = $('.ap-song');
  if (songForm) songForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('#apSong').value.trim();
    if (!v) return;
    track('song_request', { song: v.slice(0, 120) });
    $('#apSong').value = ''; $('.ap-song-ok').hidden = false;
  });

  /* ---------- mensajes al dueño ---------- */
  function sendMail(message, email) {
    return post('/.netlify/functions/send-feedback', { kind: 'feedback', message: '[' + ctx.app + '] ' + message, email: email || '' });
  }
  var autoSent = {};
  function autoReport(why, extra) {   // aviso silencioso: llega aunque la persona no escriba nada
    if (autoSent[why]) return; autoSent[why] = 1;
    sendMail('AVISO AUTOMÁTICO: pago con problemas (' + why + ').\nMonto: ' + (validAmount() || 'sin monto') + '\nDetalle: ' + String(extra || '') + '\nNavegador: ' + navigator.userAgent.slice(0, 200)).catch(function () {});
  }
  var helpBtn = $('.ap-help-btn'), helpForm = $('.ap-help-form'), helpSt = $('.ap-help-st');
  helpBtn.addEventListener('click', function () { helpForm.hidden = !helpForm.hidden; track('help_open', { from: 'pay_sheet' }); });
  helpForm.addEventListener('submit', function (e) {
    e.preventDefault(); var t = helpForm.querySelector('textarea').value.trim(), em = helpForm.querySelector('input').value.trim(), b = helpForm.querySelector('button');
    if (t.length < 3) { helpSt.className = 'ap-help-st'; helpSt.textContent = 'Escribe tu mensaje.'; return; }
    b.disabled = true; helpSt.className = 'ap-help-st'; helpSt.textContent = 'Enviando…';
    sendMail(t + '\n\nMonto que intentaba: ' + (validAmount() || '—'), em).then(function (r) {
      b.disabled = false;
      if (r.ok) { helpSt.className = 'ap-help-st ok'; helpSt.textContent = 'Recibido, gracias. Te respondo a tu correo.'; helpForm.querySelector('textarea').value = ''; track('help_sent', { from: 'pay_sheet' }); }
      else { helpSt.textContent = (r.j && r.j.error === 'rate_limited') ? 'Ya recibí varios mensajes tuyos. Te respondo pronto.' : 'No se pudo enviar. Revisa tu correo e inténtalo de nuevo.'; }
    }).catch(function () { b.disabled = false; helpSt.textContent = 'No se pudo enviar. Inténtalo de nuevo.'; });
  });

  /* ---------- monto ---------- */
  var amount = DEFAULT_AMOUNT;
  function setMsg(t, ok) { msg.textContent = t || ''; msg.classList.toggle('ok', !!ok); }
  function validAmount() {
    var n = Math.round(Number(amount) * 100) / 100;
    return (isFinite(n) && n >= MIN && n <= MAX) ? n : null;
  }
  function showTotal() {
    var n = validAmount();
    totalEl.textContent = n ? fmt(n, true) : '—';
    needEl.classList.toggle('on', !n);
  }
  function pick(val, silent) {
    chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-amt') === String(val))); });
    if (val === 'other') {
      otherBox.classList.add('on');
      amount = Number(otherIn.value) || 0;
      setTimeout(function () { try { otherIn.focus(); } catch (e) {} }, 50);
    } else {
      otherBox.classList.remove('on');
      amount = Number(val);
    }
    showTotal(); setMsg('');
    if (!silent) track('pay_amount_select', { amount: val === 'other' ? 'other' : amount, currency: CUR });
  }
  chips.forEach(function (c) { c.addEventListener('click', function () { pick(c.getAttribute('data-amt')); }); });
  otherIn.addEventListener('input', function () { amount = Number(otherIn.value) || 0; showTotal(); setMsg(''); });
  otherIn.addEventListener('change', function () { if (validAmount()) { try { otherIn.blur(); } catch (e) {} }
    if (validAmount()) track('pay_amount_select', { amount: validAmount(), custom: true }); });

  /* ---------- abrir / cerrar ---------- */
  var lastFocus = null, opened = false, paid = false, openedAt = 0;
  function open(loc, preset) {
    lastFocus = document.activeElement; openedAt = Date.now();
    back.hidden = false;
    requestAnimationFrame(function () { back.classList.add('on'); });
    document.documentElement.style.overflow = 'hidden';
    if (preset != null && (preset === 'other' || AMOUNTS.indexOf(Number(preset)) >= 0)) { opened = true; pick(preset === 'other' ? 'other' : Number(preset), true); }
    else if (!opened) { opened = true; pick(DEFAULT_AMOUNT, true); }
    track('pay_sheet_open', { location: loc || '', preset: preset == null ? null : preset });
    setTimeout(function () { try { $('.ap-x').focus(); } catch (e) {} }, 60);
    loadButtons();
  }
  function close() {
    back.classList.remove('on');
    document.documentElement.style.overflow = '';
    setTimeout(function () { back.hidden = true; }, 200);
    if (!paid) track('pay_sheet_close', { amount: validAmount() });
    try { lastFocus && lastFocus.focus(); } catch (e) {}
  }
  $('.ap-x').addEventListener('click', close);
  back.addEventListener('click', function (e) { if (e.target === back && Date.now() - openedAt > 800) close(); });   // un segundo toque seguido no debe cerrarla
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !back.hidden) close(); });

  /* ---------- PayPal ---------- */
  var sdkState = 'idle'; // idle | loading | ready | failed
  function failSdk(reason) {
    sdkState = 'failed';
    load.textContent = 'No pudimos cargar las opciones de pago aquí.';
    fallback.classList.add('on');
    track('pay_sdk_failed', { reason: String(reason || '').slice(0, 120) }); autoReport('no cargó PayPal', reason);
  }
  function loadButtons() {
    if (sdkState !== 'idle') return;
    sdkState = 'loading';
    var timer = setTimeout(function () { if (sdkState === 'loading') failSdk('timeout'); }, 15000);
    fetch('/.netlify/functions/qer-paypal-config', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (c) {
        if (!c || !c.clientId) throw new Error('sin clientId');
        return new Promise(function (ok, no) {
          if (window.paypal && window.paypal.Buttons) return ok();
          var sc = document.createElement('script');
          sc.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(c.clientId) +
            '&currency=' + CUR + '&intent=capture&components=buttons&enable-funding=card';  // sin locale: PayPal usa el idioma del navegador (es_XC da error 400)
          sc.onload = function () { (window.paypal && window.paypal.Buttons) ? ok() : no(new Error('sdk vacío')); };
          sc.onerror = function () { no(new Error('sdk no cargó')); };
          document.head.appendChild(sc);
        });
      })
      .then(render)
      .then(function () { clearTimeout(timer); if (sdkState === 'loading') { sdkState = 'ready'; load.remove(); track('pay_buttons_ready'); } })
      .catch(function (e) { clearTimeout(timer); if (sdkState !== 'failed') failSdk(e && e.message); });
  }

  function render() {
    return window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay', height: 48 },
      onClick: function (data, actions) {
        var n = validAmount();
        track('pay_start', { method: data && data.fundingSource, amount: n, currency: CUR });
        if (!n) { setMsg('Escribe un monto entre ' + fmt(MIN) + ' y ' + fmt(MAX) + '.'); return actions.reject(); }
        setMsg('');
        return actions.resolve();
      },
      createOrder: function () {
        return post('/.netlify/functions/apoyo-pay-create', { app: ctx.app, anonId: ctx.anon, amount: validAmount() })
          .then(function (r) {
            if (!r.ok || !r.j.orderID) { setMsg(r.j.error || 'No se pudo iniciar el pago.'); throw new Error(r.j.error || 'create'); }
            return r.j.orderID;
          });
      },
      onApprove: function (data, actions) {
        setMsg('Confirmando tu aporte…', true);
        return post('/.netlify/functions/apoyo-pay-capture', { app: ctx.app, anonId: ctx.anon, orderID: data.orderID })
          .then(function (r) {
            if (r.ok && r.j.ok) return done(r.j.amount);
            track('pay_declined', { issue: r.j.issue || 'unknown' }); autoReport('pago rechazado', (r.j.issue || '') + ' ' + (r.j.error || ''));
            setMsg(r.j.error || 'No se pudo completar el pago. Intenta de nuevo.');
            // Tarjeta rechazada: PayPal deja elegir otra forma de pago sin empezar de cero
            if (r.j.issue === 'INSTRUMENT_DECLINED' && actions && actions.restart) return actions.restart();
          });
      },
      onCancel: function () { track('pay_cancel', { amount: validAmount() }); setMsg('Cancelaste el pago. Puedes intentarlo de nuevo cuando quieras.', true); },
      onError: function (err) {
        track('pay_error', { message: String((err && err.message) || err || '').slice(0, 200) }); autoReport('error de PayPal', (err && err.message) || err);
        if (!msg.textContent || msg.classList.contains('ok')) setMsg('Algo falló con el pago. Intenta de nuevo o usa el enlace de PayPal de abajo.');
        fallback.classList.add('on');
      }
    }).render($('.ap-pp'));
  }

  function done(amt) {
    paid = true;
    var n = Number(amt) || validAmount();
    track('pay_completed_client', { amount: n, currency: CUR });
    try { if (window.fbq) window.fbq('track', 'Donate', { value: n, currency: CUR }); } catch (e) {}
    $('.ap-form').hidden = true;
    var t = $('.ap-thanks'); t.hidden = false;
    $('.ap-thx-text').textContent = (ctx.thanksText || 'Tu aporte de {monto} ya es parte de la próxima canción. Si quieres ayudar todavía más, compártela con alguien.').replace('{monto}', fmt(n, true));
    setMsg('');
    try { if (typeof ctx.onPaid === 'function') ctx.onPaid(n); } catch (e) {}
  }

  window.ApoyoPago = { open: open, close: close };
})();
