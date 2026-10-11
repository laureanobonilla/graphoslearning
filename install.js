/* Guía de "agregar a la pantalla de inicio". Una sola vez por dispositivo, solo en celular y solo cuando ya vio algo de valor.
   Uso: GK_INSTALL.maybe() desde cada app, justo después de que el usuario logra su primer resultado. */
(function () {
  'use strict';
  var KEY = 'gk_install_seen2', deferred = null, shown = false;
  var EN = /^en/i.test(navigator.language || '');
  var T = EN ? {
    title: 'Keep this app on your phone', sub: 'Open it in one tap, like any other app.',
    ios: ['Tap the Share button', 'Choose “Add to Home Screen”', 'Tap “Add”'],
    android: ['Tap the ⋮ menu in your browser', 'Choose “Install app” or “Add to Home screen”', 'Tap “Install”'],
    inapp: 'You are inside another app’s browser. Tap ⋯ and choose “Open in browser” (Chrome or Safari), then add it from there.',
    install: 'Install', ok: 'Got it', never: 'Don’t show again'
  } : {
    title: 'Deja esta app en tu celular', sub: 'Ábrela con un toque, como cualquier otra app.',
    ios: ['Toca el botón Compartir', 'Elige «Agregar a pantalla de inicio»', 'Toca «Agregar»'],
    android: ['Toca el menú ⋮ del navegador', 'Elige «Instalar app» o «Agregar a la pantalla de inicio»', 'Toca «Instalar»'],
    inapp: 'Estás dentro del navegador de otra app. Toca ⋯ y elige «Abrir en el navegador» (Chrome o Safari); desde ahí la agregas.',
    install: 'Instalar', ok: 'Entendido', never: 'No mostrar más'
  };
  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Snapchat|Twitter|MicroMessenger|; wv\)/i.test(ua);
  function standalone() { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
  function mobile() { return /android|iphone|ipad|ipod|mobile/i.test(ua) || (isIOS); }
  function seen() { try { return localStorage.getItem(KEY) === '1' || sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function mark(forever) { try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* nada */ } if (forever) { try { localStorage.setItem(KEY, '1'); } catch (e) { /* nada */ } } }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });

  var SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>';
  function css() {
    if (document.getElementById('gkInstCss')) return;
    var s = document.createElement('style'); s.id = 'gkInstCss';
    s.textContent = '#gkInst{position:fixed;left:0;right:0;bottom:0;z-index:250;background:#11162b;border-top:1px solid #262c47;border-radius:22px 22px 0 0;padding:16px 20px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -14px 40px rgba(0,0,0,.5);color:#eef1fb;font-family:Inter,-apple-system,sans-serif;animation:gkUp .25s ease-out}'
      + '@keyframes gkUp{from{transform:translateY(40px);opacity:0}}'
      + '#gkInst h3{margin:0 0 2px;font:700 19px/1.25 Sora,-apple-system,sans-serif}#gkInst p.s{margin:0 0 12px;color:#b8bfdc;font-size:15px}'
      + '#gkInst ol{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:8px}'
      + '#gkInst li{display:flex;align-items:center;gap:12px;background:#161c35;border:1px solid #262c47;border-radius:12px;padding:10px 12px;font-size:15.5px;line-height:1.3}'
      + '#gkInst li b{flex:0 0 26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#4fd1c5,#8b7cf6);color:#071016;display:flex;align-items:center;justify-content:center;font-size:14px}'
      + '#gkInst li span{display:inline-flex;vertical-align:-3px;color:#4fd1c5}'
      + '#gkInst .warn{background:#161c35;border:1px solid #f6ad55;border-radius:12px;padding:12px;font-size:15px;line-height:1.4;margin:0 0 14px;color:#eef1fb}'
      + '#gkInst .row{display:flex;gap:8px}#gkInst button{flex:1;height:48px;border-radius:14px;border:0;font:700 16px Sora,-apple-system,sans-serif;cursor:pointer}'
      + '#gkInst .go{background:linear-gradient(135deg,#4fd1c5,#8b7cf6);color:#071016}#gkInst .no{background:transparent;border:1px solid #262c47;color:#b8bfdc;font-weight:600}'
      + '#gkInst .never{display:block;width:100%;margin-top:6px;height:40px;background:none;color:#8a92b2;font:500 14px Inter,sans-serif}';
    document.head.appendChild(s);
  }
  function close(forever) { var e = document.getElementById('gkInst'); if (e) e.remove(); mark(forever); }
  function show() {
    if (shown) return; shown = true; css();
    var steps = isIOS ? T.ios : T.android;
    var box = document.createElement('div'); box.id = 'gkInst'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', T.title);
    var h = '<h3></h3><p class="s"></p>';
    if (inApp) h += '<div class="warn"></div>';
    else { h += '<ol>'; steps.forEach(function (t, i) { h += '<li><b>' + (i + 1) + '</b><div></div></li>'; }); h += '</ol>'; }
    h += '<div class="row">' + (deferred && !inApp ? '<button class="go" id="gkInstGo" type="button"></button>' : '') + '<button class="' + (deferred && !inApp ? 'no' : 'go') + '" id="gkInstOk" type="button"></button></div><button class="never" id="gkInstNever" type="button"></button>';
    box.innerHTML = h;
    box.querySelector('h3').textContent = T.title; box.querySelector('.s').textContent = T.sub;
    if (inApp) box.querySelector('.warn').textContent = T.inapp;
    else box.querySelectorAll('li div').forEach(function (d, i) { d.textContent = steps[i]; if (isIOS && i === 0) { var sp = document.createElement('span'); sp.innerHTML = SHARE; d.appendChild(document.createTextNode(' ')); d.appendChild(sp); } });
    box.querySelector('#gkInstOk').textContent = T.ok; box.querySelector('#gkInstNever').textContent = T.never;
    var go = box.querySelector('#gkInstGo'); if (go) { go.textContent = T.install; go.addEventListener('click', function () { var d = deferred; deferred = null; close(true); try { d.prompt(); } catch (e) { /* nada */ } }); }
    box.querySelector('#gkInstOk').addEventListener('click', function () { close(false); });
    box.querySelector('#gkInstNever').addEventListener('click', function () { close(true); });
    document.body.appendChild(box);
    mark(false);
  }
  window.GK_INSTALL = {
    // Muestra la guía si corresponde. force=true solo para pruebas (?instalar=1).
    maybe: function (force) {
      if (!force && (shown || standalone() || !mobile() || seen())) return;
      setTimeout(show, 1200);
    }
  };
  try { if (/[?&]instalar=1/.test(location.search)) window.addEventListener('load', function () { window.GK_INSTALL.maybe(true); }); } catch (e) { /* nada */ }
})();
