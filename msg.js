/* msg.js — Mensajes entre usuarios (buzón + «en línea») y cuentas del Equipo. Botón flotante abajo a la derecha.
 * Servidor: netlify/functions/msg.js. Se apaga con ?msg=0. No toca nada del resto de la app. */
(function () {
  'use strict';
  if (/[?&]msg=0/.test(location.search) || window.top !== window) return;
  var css = '#gkm-fab{position:fixed;right:18px;bottom:18px;z-index:9000;display:flex;align-items:center;gap:8px;border:0;cursor:pointer;border-radius:999px;padding:13px 20px;font:700 15px system-ui,sans-serif;color:#05121a;background:linear-gradient(135deg,#2dd4bf,#8b5cf6);box-shadow:0 8px 28px rgba(45,212,191,.35)}#gkm-fab:hover{filter:brightness(1.08)}#gkm-fab:focus-visible{outline:3px solid #fff;outline-offset:3px}#gkm-fab b{background:#ef4444;color:#fff;border-radius:999px;min-width:20px;height:20px;padding:0 6px;font-size:12px;line-height:20px;text-align:center}#gkm-fab b[hidden]{display:none}' +
  '#gkm{position:fixed;right:18px;bottom:76px;z-index:9001;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 100px));display:none;flex-direction:column;background:#0f1428;color:#eef1fb;border:1px solid #2c3458;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.55);font:14px/1.45 system-ui,sans-serif;overflow:hidden}#gkm.on{display:flex}' +
  '#gkm .h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #2c3458;font-weight:700}#gkm .h button{background:none;border:0;color:#98a3c2;font-size:18px;cursor:pointer;padding:2px 6px}#gkm .h .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '#gkm .note{padding:8px 14px;font-size:11.5px;color:#98a3c2;background:#0b1022;border-bottom:1px solid #1d2442}#gkm .body{flex:1;overflow:auto;padding:8px 0}' +
  '#gkm .row{display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;border:0;background:none;color:inherit;text-align:left;cursor:pointer;font:inherit}#gkm .row:hover{background:#161c35}' +
  '#gkm .dot{width:10px;height:10px;border-radius:50%;background:#3b4468;flex:none}#gkm .dot.on{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.2)}' +
  '#gkm .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#gkm .bd{font-size:10.5px;font-weight:700;color:#2dd4bf;border:1px solid #2dd4bf;border-radius:999px;padding:1px 7px}#gkm .un{background:#ef4444;color:#fff;border-radius:999px;font-size:11px;padding:0 6px;min-width:18px;text-align:center}' +
  '#gkm .sec{padding:8px 14px 2px;font-size:11px;color:#98a3c2;font-weight:700}#gkm .sub{padding:0 14px 6px;font-size:11.5px;color:#98a3c2}' +
  '#gkm .msgs{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}#gkm .m{max-width:82%;padding:8px 11px;border-radius:14px;background:#1d2442;white-space:pre-wrap;overflow-wrap:anywhere}#gkm .m.me{align-self:flex-end;background:#2dd4bf;color:#05121a}#gkm .m img{max-width:100%;border-radius:10px;display:block;margin-top:4px}#gkm .m small{display:block;opacity:.6;font-size:10.5px;margin-top:3px}' +
  '#gkm form{display:flex;gap:6px;padding:10px;border-top:1px solid #2c3458;align-items:flex-end}#gkm textarea{flex:1;min-width:0;resize:none;background:#0b1022;border:1px solid #2c3458;color:inherit;border-radius:12px;padding:9px 11px;font:inherit;max-height:90px}#gkm form button{border:0;border-radius:12px;cursor:pointer;padding:9px 12px;font:700 14px system-ui;background:#2dd4bf;color:#05121a}#gkm form button.g{background:#1d2442;color:#eef1fb}' +
  '#gkm .tabs{display:flex;gap:6px;padding:8px 14px}#gkm .tabs button{flex:1;border:1px solid #2c3458;background:none;color:#98a3c2;border-radius:10px;padding:6px;cursor:pointer;font:600 12px system-ui}#gkm .tabs button.on{background:#1d2442;color:#fff}' +
  '#gkm .empty{padding:24px 18px;color:#98a3c2;text-align:center}@media(max-width:780px){#gkm{right:8px;bottom:70px}#gkm-fab{right:12px;bottom:12px}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var fab = document.createElement('button'); fab.id = 'gkm-fab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Chatear con otros usuarios'); fab.innerHTML = '<span aria-hidden="true">💬</span> Chatear con otros usuarios <b hidden>0</b>';
  var box = document.createElement('div'); box.id = 'gkm'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Chatear con otros usuarios');
  document.body.appendChild(fab); document.body.appendChild(box);
  var failed = false, badge = fab.querySelector('b'), open = false, view = 'list', cur = null, tab = 'users', timer = 0, data = null;
  var el = function (t, c, tx) { var e = document.createElement(t); if (c) e.className = c; if (tx != null) e.textContent = tx; return e; };
  var logged = function () { try { return !!(window.netlifyIdentity && netlifyIdentity.currentUser()); } catch (e) { return false; } };
  async function api(q, body) {
    var o = body ? { method: 'POST', body: JSON.stringify(body) } : {};
    var r = await apiFetch('/.netlify/functions/msg' + (q || ''), o); return r;
  }
  function setBadge(n) { badge.hidden = !n; badge.textContent = n > 99 ? '99+' : n; }
  async function refreshList() { if (!logged()) return; var r = await api('?a=list'); if (r.ok) { data = r.data; failed = false; setBadge(data.totalUnread); if (open && view === 'list') render(); } else if (!data) { failed = true; if (open && view === 'list') render(); } }
  async function beat() { if (logged() && !document.hidden) { await api('', { a: 'ping' }); refreshList(); } }
  setInterval(beat, 30000); setTimeout(beat, 2500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) beat(); });

  function head(title, back) {
    var h = el('div', 'h'); if (back) { var b = el('button', '', '←'); b.setAttribute('aria-label', 'Volver'); b.onclick = function () { view = 'list'; cur = null; render(); }; h.appendChild(b); }
    h.appendChild(el('div', 't', title)); var x = el('button', '', '✕'); x.setAttribute('aria-label', 'Cerrar'); x.onclick = toggle; h.appendChild(x); return h;
  }
  function person(p, isStaff) {
    var b = el('button', 'row'); b.type = 'button'; b.appendChild(el('span', 'dot' + (p.online ? ' on' : ''))); b.appendChild(el('span', 'nm', p.name));
    if (isStaff) b.appendChild(el('span', 'bd', p.badge)); if (p.unread) b.appendChild(el('span', 'un', p.unread));
    b.title = p.online ? 'En línea' : 'Desconectado: recibirá tu mensaje y lo verá al volver';
    b.onclick = function () { cur = { id: p.id, name: p.name }; view = 'thread'; render(); }; return b;
  }
  function render() {
    clearInterval(timer); box.textContent = '';
    if (!logged()) { box.appendChild(head('Chatear con otros usuarios')); var e = el('div', 'empty'); e.appendChild(el('p', '', 'Entra a tu cuenta para escribirle al equipo y a otros usuarios.')); var g = el('button', '', 'Entrar'); g.style.cssText = 'border:0;border-radius:12px;padding:10px 20px;font:700 14px system-ui;background:#2dd4bf;color:#05121a;cursor:pointer'; g.onclick = function () { toggle(); var l = document.getElementById('btnLogin'); if (l) l.click(); }; e.appendChild(g); box.appendChild(e); return; }
    if (view === 'thread') return renderThread();
    if (view === 'admin') return renderAdmin();
    box.appendChild(head('Chatear con otros usuarios'));
    var body = el('div', 'body'); box.appendChild(body);
    if (!data) { if (failed) { var fe = el('div', 'empty', 'El chat no está disponible en este momento. Intenta de nuevo en unos minutos.'); var rb = el('button', '', 'Reintentar'); rb.style.cssText = 'display:block;margin:12px auto 0;border:0;border-radius:12px;padding:9px 18px;font:700 14px system-ui;background:#2dd4bf;color:#05121a;cursor:pointer'; rb.onclick = function () { failed = false; render(); }; fe.appendChild(rb); body.appendChild(fe); } else { body.appendChild(el('div', 'empty', 'Cargando…')); refreshList(); } return; }
    if (data.isAdmin) { var ad = el('button', 'row'); ad.type = 'button'; ad.appendChild(el('span', 'nm', '🛠 Bandeja del Equipo (solo tú)')); ad.onclick = function () { view = 'admin'; render(); }; body.appendChild(ad); }
    body.appendChild(el('div', 'sec', 'Equipo de Graphikosmos'));
    data.staff.forEach(function (p) { body.appendChild(person(p, true)); });
    if (!data.staff[0].online) body.appendChild(el('div', 'sub', 'Responden en cuanto se conectan.'));
    body.appendChild(el('div', 'sec', 'Usuarios'));
    if (!data.users.length) body.appendChild(el('div', 'sub', 'Aún no hay otros usuarios activos.'));
    data.users.forEach(function (p) { body.appendChild(person(p, false)); });
    timer = setInterval(refreshList, 20000);
  }
  function shrink(file) {
    return new Promise(function (ok, no) {
      var im = new Image(), u = URL.createObjectURL(file);
      im.onload = function () { var s = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        var q = .72, d = c.toDataURL('image/jpeg', q); while (d.length > 250000 && q > .3) { q -= .12; d = c.toDataURL('image/jpeg', q); } d.length > 250000 ? no() : ok(d); };
      im.onerror = no; im.src = u;
    });
  }
  function bubble(m) { var d = el('div', 'm' + (m.mine || m.fromTeam ? ' me' : '')); if (m.body) d.appendChild(el('span', '', m.body)); if (m.image) { var i = document.createElement('img'); i.src = m.image; i.alt = 'Imagen enviada'; d.appendChild(i); } d.appendChild(el('small', '', new Date(m.at).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }))); return d; }
  function composer(onSend) {
    var f = document.createElement('form'), ta = document.createElement('textarea'), pic = el('button', 'g', '🖼'), fi = document.createElement('input'), go = el('button', '', 'Enviar'), img = null;
    ta.rows = 1; ta.maxLength = 1000; ta.placeholder = 'Escribe un mensaje'; ta.setAttribute('aria-label', 'Mensaje'); fi.type = 'file'; fi.accept = 'image/*'; fi.hidden = true; pic.type = 'button'; pic.setAttribute('aria-label', 'Adjuntar imagen'); go.type = 'submit';
    pic.onclick = function () { fi.click(); };
    fi.onchange = async function () { if (!fi.files[0]) return; try { img = await shrink(fi.files[0]); pic.textContent = '✔'; } catch (e) { img = null; pic.textContent = '🖼'; alert('No pude usar esa imagen. Prueba con otra.'); } };
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
    f.onsubmit = async function (e) { e.preventDefault(); var t = ta.value.trim(); if (!t && !img) return; go.disabled = true; var ok = await onSend(t, img); go.disabled = false; if (ok) { ta.value = ''; img = null; pic.textContent = '🖼'; fi.value = ''; } };
    f.append(pic, fi, ta, go); return f;
  }
  async function renderThread() {
    box.appendChild(head(cur.name, true));
    var list = el('div', 'msgs'); box.appendChild(list);
    box.appendChild(composer(async function (t, img) { var r = await api('', { a: 'send', to: cur.id, body: t, image: img }); if (!r.ok) { alert(r.status === 429 ? 'Vas muy rápido. Espera un momento.' : 'No se pudo enviar. Intenta de nuevo.'); return false; } await load(true); return true; }));
    var last = '';
    async function load(force) { var r = await api('?a=thread&with=' + encodeURIComponent(cur.id)); if (!r.ok || view !== 'thread') return; var sig = JSON.stringify(r.data.messages.map(function (m) { return m.id; })); if (sig === last && !force) return; last = sig; list.textContent = ''; if (!r.data.messages.length) list.appendChild(el('div', 'empty', 'Escribe el primer mensaje. Lo recibirá aunque no esté conectado.')); r.data.messages.forEach(function (m) { list.appendChild(bubble(m)); }); list.scrollTop = list.scrollHeight; refreshList(); }
    await load(true); timer = setInterval(load, 6000);
  }
  async function renderAdmin() {
    box.appendChild(head('Bandeja del Equipo', true));
    var tabs = el('div', 'tabs'), a = el('button', tab === 'team' ? 'on' : '', 'Mi bandeja'), b = el('button', tab === 'users' ? 'on' : '', 'Entre usuarios');
    a.onclick = function () { tab = 'team'; render(); }; b.onclick = function () { tab = 'users'; render(); }; if (tab !== 'team' && tab !== 'users') tab = 'team'; tabs.append(a, b); box.appendChild(tabs);
    var body = el('div', 'body'); box.appendChild(body); body.appendChild(el('div', 'empty', 'Cargando…'));
    if (tab === 'users') { var r = await api('?a=between'); body.textContent = ''; if (!r.ok) return body.appendChild(el('div', 'empty', 'No se pudo cargar.')); if (!r.data.messages.length) body.appendChild(el('div', 'empty', 'Todavía no hay mensajes entre usuarios.')); r.data.messages.forEach(function (m) { var d = el('div', 'm'); d.style.margin = '6px 12px'; d.style.maxWidth = 'none'; d.appendChild(el('b', '', m.from + ' → ' + m.to + (m.image ? ' 🖼' : ''))); d.appendChild(el('span', '', '\n' + m.body)); body.appendChild(d); }); return; }
    var r2 = await api('?a=inbox'); body.textContent = ''; if (!r2.ok) return body.appendChild(el('div', 'empty', 'No se pudo cargar.'));
    if (!r2.data.conversations.length) body.appendChild(el('div', 'empty', 'Nadie ha escrito al Equipo todavía.'));
    r2.data.conversations.forEach(function (c) {
      var w = el('div'); w.style.cssText = 'margin:8px 12px;border:1px solid #2c3458;border-radius:12px;padding:8px'; w.appendChild(el('div', 'sec', c.name)); w.firstChild.style.padding = '0 0 6px';
      c.msgs.slice(-6).forEach(function (m) { var d = bubble({ fromTeam: m.fromTeam, body: m.body, image: m.image, at: m.at }); d.style.maxWidth = '100%'; d.style.marginBottom = '4px'; if (m.via && m.via !== 'tu cuenta') d.firstChild && d.insertBefore(el('small', '', (m.fromTeam ? 'Respondido como ' : 'Escrito a ') + m.via), d.firstChild); w.appendChild(d); });
      var sel = document.createElement('select'); sel.setAttribute('aria-label', 'Responder como'); sel.style.cssText = 'width:100%;margin-top:6px;background:#0b1022;color:inherit;border:1px solid #2c3458;border-radius:10px;padding:6px'; (r2.data.identities || []).forEach(function (i) { var o = el('option', '', 'Responder como: ' + i.name); o.value = i.id; if (i.id === c.lastAlias) o.selected = true; sel.appendChild(o); });
      var f = composer(async function (t) { if (!t) return false; var r = await api('', { a: 'reply', as: sel.value, to: c.person, body: t }); if (!r.ok) { alert('No se pudo enviar.'); return false; } refreshList(); render(); return true; }); f.style.padding = '6px 0 0'; f.style.border = '0'; f.querySelector('button.g').hidden = true; w.appendChild(sel); w.appendChild(f); body.appendChild(w);
    });
  }
  function toggle() { open = !open; box.classList.toggle('on', open); fab.setAttribute('aria-expanded', String(open)); if (open) { view = 'list'; cur = null; render(); refreshList(); } else clearInterval(timer); }
  fab.onclick = toggle;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) toggle(); });
})();
