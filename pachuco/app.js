/* Dilo Pachuco — chat por link donde cada mensaje sale en la jerga de un país.
 * Quien escribe no ve el resultado hasta que el mensaje ya se envió. Sin cuentas: solo un nombre. */
(function () {
  'use strict';
  var FN = '/.netlify/functions/pc';
  var C = [['PC', '🕴️', 'Pachuco clásico'], ['CR', '🇨🇷', 'Costa Rica'], ['MX', '🇲🇽', 'México'], ['AR', '🇦🇷', 'Argentina'], ['CO', '🇨🇴', 'Colombia'], ['CL', '🇨🇱', 'Chile'], ['ES', '🇪🇸', 'España'], ['VE', '🇻🇪', 'Venezuela'], ['PE', '🇵🇪', 'Perú'], ['UY', '🇺🇾', 'Uruguay'], ['EC', '🇪🇨', 'Ecuador'], ['GT', '🇬🇹', 'Guatemala'], ['PA', '🇵🇦', 'Panamá'], ['DO', '🇩🇴', 'Rep. Dominicana'], ['PR', '🇵🇷', 'Puerto Rico'], ['CU', '🇨🇺', 'Cuba'], ['HN', '🇭🇳', 'Honduras'], ['NI', '🇳🇮', 'Nicaragua'], ['SV', '🇸🇻', 'El Salvador'], ['BO', '🇧🇴', 'Bolivia'], ['PY', '🇵🇾', 'Paraguay']];
  var LV = [[1, 'Suave'], [2, 'Marcado'], [3, 'Full pachuco']];
  var $app = document.getElementById('app'), $toast = document.getElementById('toast');
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var ANON = ls('pc_anon') || (function () { var a = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36); ls('pc_anon', a); return a; })();
  var S = { name: ls('pc_name') || '', country: ls('pc_country') || 'CR', level: Number(ls('pc_level')) || 3, room: null, since: 0, msgs: {}, timer: null, unread: 0, sending: 0 };
  if (!C.some(function (c) { return c[0] === S.country; })) S.country = 'CR';

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function cInfo(code) { return C.filter(function (c) { return c[0] === code; })[0] || C[1]; }
  function toast(t) { $toast.textContent = t; $toast.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { $toast.classList.remove('on'); }, 2600); }
  function post(body) { body.anonId = ANON; return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'http'); e.status = r.status; throw e; } return j; }); }); }
  function track(ev, md) { try { fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ action: 'track', anonId: ANON, event: ev, metadata: md || {} }) }).catch(function () {}); } catch (e) {} }
  function roomUrl() { return location.origin + '/pachuco/?s=' + S.room; }
  function share(text, ev) {
    var url = roomUrl(); track(ev || 'pc_shared', {});
    if (navigator.share) { navigator.share({ text: text, url: url }).catch(function () {}); return; }
    var full = text + ' ' + url;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(full).then(function () { toast('Link copiado'); }, function () { window.open('https://wa.me/?text=' + encodeURIComponent(full), '_blank'); });
    else window.open('https://wa.me/?text=' + encodeURIComponent(full), '_blank');
  }
  function invite() { share((S.name || 'Alguien') + ' te invita a su sala de Dilo Pachuco: todo lo que escribes sale en jerga de un país 🕴️', 'pc_invite_clicked'); }

  /* ---------- inicio ---------- */
  function home(joining) {
    stopPoll(); document.title = 'Dilo Pachuco'; $app.textContent = '';
    var w = el('div', 'home'); w.appendChild(el('h1', null, 'Dilo Pachuco'));
    w.appendChild(el('p', 'lead', joining ? 'Te invitaron a una sala. Todo lo que escribas sale en jerga.' : 'Escribe normal. Sale en la jerga de un país, lo más pachuco posible.'));
    [['✍️', 'Tú escribes con tus palabras.'], ['🕴️', 'La app lo suelta en jerga de verdad.'], ['🙈', 'No ves cómo quedó hasta que ya se envió.']].forEach(function (r) { var p = el('p', 'rule'); p.appendChild(el('span', null, r[0])); p.appendChild(el('span', null, r[1])); w.appendChild(p); });
    var card = el('div', 'card'), lab = el('label', null, 'Tu nombre'); lab.setAttribute('for', 'nm'); card.appendChild(lab);
    var inp = el('input', 'field'); inp.id = 'nm'; inp.maxLength = 24; inp.value = S.name; inp.placeholder = 'Como te dicen tus amigos'; inp.autocomplete = 'nickname'; card.appendChild(inp);
    var pick = null;
    if (!joining) {
      var l2 = el('p', 'lab', '¿En qué jerga hablan?'); l2.style.marginTop = '16px'; card.appendChild(l2);
      var g = el('div', 'countries'); pick = S.country;
      C.forEach(function (c) { var b = el('button', 'cc' + (c[0] === 'PC' ? ' pc' : '')); b.type = 'button'; b.setAttribute('aria-pressed', c[0] === pick ? 'true' : 'false'); b.appendChild(el('span', 'fl', c[1])); b.appendChild(el('span', null, c[2])); b.onclick = function () { pick = c[0]; [].forEach.call(g.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }; g.appendChild(b); });
      card.appendChild(g);
    }
    var go = el('button', 'btn', joining ? 'Entrar a la sala' : 'Abrir sala e invitar'); go.type = 'button'; go.style.marginTop = '18px'; go.style.width = '100%'; card.appendChild(go); w.appendChild(card);
    w.appendChild(el('p', 'hint', 'Los mensajes se guardan en la sala y se convierten con IA. No escribas datos privados ni contraseñas.'));
    $app.appendChild(w);
    var run = function () {
      var n = inp.value.trim(); if (n.length < 1) { inp.focus(); toast('Dinos tu nombre'); return; }
      S.name = n.slice(0, 24); ls('pc_name', S.name);
      if (joining) { openRoom(); return; }
      S.country = pick; ls('pc_country', S.country); go.disabled = true; go.textContent = 'Abriendo…';
      post({ action: 'create', country: pick }).then(function (r) { S.room = r.room; history.replaceState(null, '', '/pachuco/?s=' + r.room); track('pc_room_created', { country: pick }); openRoom(true); })
        .catch(function (e) { go.disabled = false; go.textContent = 'Abrir sala e invitar'; toast(e.status === 429 ? 'Muchas salas seguidas. Espera un poco.' : 'No se pudo abrir la sala. Intenta de nuevo.'); track('pc_error', { where: 'create' }); });
    };
    go.onclick = run; inp.onkeydown = function (e) { if (e.key === 'Enter') run(); };
    if (!joining) track('pc_landing', {}); (S.name ? go : inp).focus();
  }

  /* ---------- sala ---------- */
  var $list, $ta, $sel, $lvs, $send;
  function openRoom(fresh) {
    S.since = 0; S.msgs = {}; S.unread = 0; $app.textContent = '';
    var r = el('div', 'room'), top = el('div', 'top'); top.appendChild(el('span', 'logo', 'Dilo Pachuco'));
    var inv = el('button', 'btn', 'Invitar'); inv.type = 'button'; inv.onclick = invite; top.appendChild(inv); r.appendChild(top);
    $list = el('div', 'msgs'); $list.setAttribute('role', 'log'); $list.setAttribute('aria-live', 'polite'); r.appendChild($list);
    var comp = el('div', 'comp'), opts = el('div', 'opts');
    $sel = el('select'); $sel.setAttribute('aria-label', 'Jerga'); C.forEach(function (c) { var o = el('option', null, c[1] + ' ' + c[2]); o.value = c[0]; if (c[0] === S.country) o.selected = true; $sel.appendChild(o); }); $sel.onchange = function () { S.country = $sel.value; ls('pc_country', S.country); };
    $lvs = el('div', 'lvs'); $lvs.setAttribute('role', 'group'); $lvs.setAttribute('aria-label', 'Qué tan cargada');
    LV.forEach(function (l) { var b = el('button', null, l[1]); b.type = 'button'; b.setAttribute('aria-pressed', l[0] === S.level ? 'true' : 'false'); b.onclick = function () { S.level = l[0]; ls('pc_level', String(l[0])); [].forEach.call($lvs.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }; $lvs.appendChild(b); });
    opts.appendChild($sel); opts.appendChild($lvs); comp.appendChild(opts);
    var row = el('div', 'send'); $ta = el('textarea'); $ta.rows = 1; $ta.maxLength = 280; $ta.placeholder = 'Escribe normal…'; $ta.setAttribute('aria-label', 'Mensaje');
    $ta.oninput = function () { $ta.style.height = 'auto'; $ta.style.height = Math.min(120, $ta.scrollHeight) + 'px'; };
    $ta.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
    $send = el('button', 'btn', 'Enviar'); $send.type = 'button'; $send.onclick = send; row.appendChild($ta); row.appendChild($send); comp.appendChild(row);
    comp.appendChild(el('p', 'hint', 'No verás cómo quedó hasta que se envíe.')); r.appendChild(comp); $app.appendChild(r);
    renderMsgs(); track('pc_room_opened', { fresh: !!fresh }); poll(true); startPoll();
    if (fresh) { var n = el('div', 'note', 'Sala lista. Toca «Invitar» para mandar el link.'); $list.appendChild(n); }
    $ta.focus();
  }
  function renderMsgs() {
    var near = $list.scrollHeight - $list.scrollTop - $list.clientHeight < 120, ids = Object.keys(S.msgs).map(Number).sort(function (a, b) { return a - b; });
    $list.textContent = '';
    if (!ids.length && !S.pending) { var e = el('div', 'empty'); e.appendChild(el('b', null, 'Sala vacía')); e.appendChild(document.createTextNode('Manda el primer mensaje y comparte el link: tus amigos entran sin crear cuenta.')); $list.appendChild(e); return; }
    ids.forEach(function (id) { $list.appendChild(bubble(S.msgs[id])); });
    if (S.pending) $list.appendChild(pendingBubble());
    if (near || S.pending) $list.scrollTop = $list.scrollHeight;
  }
  function pendingBubble() { var m = el('div', 'm me'), b = el('div', 'bub wait'); b.appendChild(el('i')); b.appendChild(el('i')); b.appendChild(el('i')); b.appendChild(el('span', null, 'Pachuqueando…')); m.appendChild(b); return m; }
  function bubble(x) {
    var me = x.author === ANON, m = el('div', 'm' + (me ? ' me' : '')), ci = cInfo(x.country), nm = el('div', 'nm');
    nm.appendChild(el('span', null, me ? 'Tú' : x.name)); nm.appendChild(el('span', null, ci[1] + ' ' + ci[2])); m.appendChild(nm);
    m.appendChild(el('div', 'bub', x.slang));
    var acts = el('div', 'acts'), orig = null;
    var ob = el('button', null, me ? 'Lo que escribí' : 'Lo que quiso decir'); ob.type = 'button'; ob.setAttribute('aria-expanded', 'false');
    ob.onclick = function () { if (orig) { orig.remove(); orig = null; ob.setAttribute('aria-expanded', 'false'); return; } orig = el('div', 'orig'); orig.appendChild(el('b', null, 'Original')); orig.appendChild(document.createTextNode(x.original)); m.insertBefore(orig, acts); ob.setAttribute('aria-expanded', 'true'); track('pc_original_viewed', { me: me }); };
    var sb = el('button', null, 'Compartir'); sb.type = 'button'; sb.onclick = function () { share('«' + x.slang + '» — ' + (me ? 'yo' : x.name) + ', en jerga de ' + ci[2] + ' · Dilo Pachuco', 'pc_shared'); };
    acts.appendChild(ob); acts.appendChild(sb); m.appendChild(acts);
    if (x.fallback) m.appendChild(el('div', 'nm', 'Este salió tal cual (no se pudo convertir)'));
    return m;
  }
  function send() {
    var text = $ta.value.trim(); if (!text || S.pending) return;
    S.pending = true; $send.disabled = true; $ta.value = ''; $ta.style.height = 'auto'; renderMsgs();
    var t0 = Date.now();
    post({ action: 'send', room: S.room, text: text, name: S.name, country: S.country, level: S.level })
      .then(function (r) { S.msgs[r.msg.id] = r.msg; S.since = Math.max(S.since, r.msg.id); track('pc_sent', { country: S.country, level: S.level, ms: Date.now() - t0, fallback: !!r.msg.fallback }); if (r.msg.fallback) track('pc_fallback', {}); })
      .catch(function (e) { $ta.value = text; $ta.oninput(); toast(e.status === 429 ? 'Vas muy rápido. Espera un momento.' : e.status === 404 ? 'Esa sala ya no existe.' : 'No se pudo enviar. Intenta de nuevo.'); track('pc_error', { where: 'send', status: e.status || 0 }); })
      .then(function () { S.pending = false; $send.disabled = false; renderMsgs(); $ta.focus(); });
  }
  function poll(first) {
    if (!S.room) return;
    post({ action: 'poll', room: S.room, since: S.since }).then(function (r) {
      var added = 0; (r.msgs || []).forEach(function (m) { if (!S.msgs[m.id]) { S.msgs[m.id] = m; added++; if (m.author !== ANON && document.hidden) S.unread++; } S.since = Math.max(S.since, m.id); });
      if (added || first) { if (!S.pending) renderMsgs(); }
      if (S.unread && document.hidden) document.title = '(' + S.unread + ') Dilo Pachuco';
    }).catch(function (e) { if (e.status === 404) { stopPoll(); toast('Esa sala no existe.'); history.replaceState(null, '', '/pachuco/'); S.room = null; home(false); } });
  }
  function startPoll() { stopPoll(); S.timer = setInterval(function () { if (!document.hidden) poll(); }, 2500); }
  function stopPoll() { if (S.timer) clearInterval(S.timer); S.timer = null; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { S.unread = 0; document.title = 'Dilo Pachuco'; if (S.room) poll(); } });

  var m = location.search.match(/[?&]s=([a-z0-9]{6,16})/i);
  if (m) { S.room = m[1].toLowerCase(); if (S.name) openRoom(); else home(true); } else home(false);
})();
