/* Profundiza — pila de preguntas de completar guiada por lo que la persona no sabe.
 * Cada palabra fallada se vuelve una pregunta nueva que la define; las demás quedan pendientes en la pila.
 * Solo cuando una pregunta sale bien se vuelve a la anterior. Nada queda suelto. */
(function () {
  'use strict';
  var FN = '/.netlify/functions/profundiza';
  var MAX_DEPTH = 6, MAX_TAUGHT = 2;   // profundidad máxima y veces que se baja a una misma palabra antes de solo explicarla
  var LV = { beginner: ['Principiante', '1–2 espacios'], intermediate: ['Intermedio', '3 espacios'], advanced: ['Avanzado', '4–5 espacios'] };
  var KEY = 'prf_state_v1', ANON = (function () { try { var a = localStorage.getItem('prf_anon'); if (!a) { a = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('prf_anon', a); } return a; } catch (e) { return 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36); } })();
  var $ = function (id) { return document.getElementById(id); };
  var main = $('main'), pile = $('pile');
  var S = null, cache = {}, busy = false;

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function lev(a, b) { var m = a.length, n = b.length, d = [], i, j; for (i = 0; i <= m; i++) d[i] = [i]; for (j = 1; j <= n; j++) d[0][j] = j; for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  function isRight(given, answers) {
    var g = norm(given); if (!g) return false;
    return answers.some(function (a) { var x = norm(a); if (g === x) return true; var tol = x.length >= 9 ? 2 : x.length >= 5 ? 1 : 0; return tol > 0 && lev(g, x) <= tol; });
  }
  function track(ev, md) { try { fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'track', anonId: ANON, event: ev, metadata: md || {} }) }).catch(function () {}); } catch (e) {} }
  function save() { try { if (S) localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  function getCloze(term, parent, variant, avoid) {
    var key = norm(term) + '|' + S.level + '|' + (variant || 0);
    if (cache[key]) return cache[key];
    var p = fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cloze', anonId: ANON, term: term, topic: S.topic, parent: parent || '', level: S.level, variant: variant || 0, avoid: avoid || [] }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'http'); return j; }); })
      .catch(function (e) { delete cache[key]; throw e; });
    cache[key] = p; return p;
  }

  /* ---------- pantallas ---------- */
  function node(term, parentId) { var n = { id: S.nodes.length, term: term, parentId: parentId, status: 'pending' }; S.nodes.push(n); return n; }
  function setStatus(id, st) { if (S.nodes[id]) S.nodes[id].status = st; }
  // Mapa del recorrido: árbol de todo lo que apareció (✓ resuelto, ● en curso, ○ pendiente) y un medidor de profundidad
  function renderPile() {
    pile.textContent = '';
    if (!S || !S.nodes.length) { pile.classList.remove('on'); return; }
    pile.classList.add('on'); pile.appendChild(el('h3', null, 'Mapa de tu recorrido'));
    var depth = S.stack.length, g = el('div', 'gauge'); g.setAttribute('role', 'img'); g.setAttribute('aria-label', 'Profundidad ' + depth + ' de ' + MAX_DEPTH);
    for (var i = 1; i <= MAX_DEPTH; i++) g.appendChild(el('i', i <= depth ? 'on' : ''));
    pile.appendChild(g); pile.appendChild(el('div', 'gl', 'Profundidad ' + depth + ' de ' + MAX_DEPTH + (depth > 1 ? ' · hay que subir ' + (depth - 1) + (depth === 2 ? ' nivel' : ' niveles') + ' para volver al tema' : ' · estás en el tema')));
    var tree = el('div', 'tree'); (function walk(pid, lvl) { S.nodes.forEach(function (n) { if (n.parentId !== pid) return; var st = n.status === 'active' && S.stack.length && S.stack[S.stack.length - 1].nodeId !== n.id ? 'wait' : n.status, r = el('div', 'tn ' + st); r.style.paddingLeft = (lvl * 14) + 'px'; r.appendChild(el('span', 'mk', st === 'done' ? '✓' : st === 'active' ? '●' : st === 'wait' ? '◐' : '○')); r.appendChild(document.createTextNode(n.term)); tree.appendChild(r); walk(n.id, lvl + 1); }); })(null, 0);
    pile.appendChild(tree);
    var done = S.nodes.filter(function (n) { return n.status === 'done'; }).length, pend = S.nodes.filter(function (n) { return n.status !== 'done'; }).length - 1;
    pile.appendChild(el('div', 'stat', done + ' resueltos · ' + Math.max(0, pend) + ' por resolver (sin contar el tema)'));
  }
  function crumb(parent) {
    var c = el('p', 'crumb'); S.stack.forEach(function (f, i) { if (i) c.appendChild(document.createTextNode(' › ')); var b = i === S.stack.length - 1 ? el('b', null, f.term) : document.createTextNode(f.term); c.appendChild(b); }); parent.appendChild(c);
  }
  function loading(msg) { main.textContent = ''; var p = el('p', 'muted'); p.appendChild(el('span', 'spin')); p.appendChild(document.createTextNode(msg)); main.appendChild(p); }
  function fail(retry) {
    main.textContent = ''; main.appendChild(el('h2', null, 'No pude preparar la pregunta')); main.appendChild(el('p', 'muted', 'Pasa a veces. Intenta de nuevo; tu avance está guardado.'));
    var b = el('button', 'btn', 'Reintentar'); b.onclick = retry; main.appendChild(b); track('prf_error', {});
  }

  function start() {
    S = null; renderPile(); main.textContent = '';
    main.appendChild(el('h1', null, 'Profundiza'));
    main.appendChild(el('p', null, 'Escribe un tema. Te doy una definición con espacios en blanco. Cada palabra que no sepas se vuelve la siguiente pregunta, y solo cuando la aciertas regresas a la anterior.'));
    var inp = el('input', 'field'); inp.type = 'text'; inp.placeholder = 'Por ejemplo: fotosíntesis'; inp.maxLength = 80; inp.setAttribute('aria-label', 'Tema que quieres estudiar'); main.appendChild(inp);
    var lvl = 'beginner', box = el('div', 'lvs'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Nivel');
    Object.keys(LV).forEach(function (k) { var b = el('button', 'lv'); b.type = 'button'; b.setAttribute('aria-pressed', k === lvl ? 'true' : 'false'); b.appendChild(el('b', null, LV[k][0])); b.appendChild(el('span', null, LV[k][1])); b.onclick = function () { lvl = k; [].forEach.call(box.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }; box.appendChild(b); });
    main.appendChild(box);
    var go = el('button', 'btn', 'Empezar'); go.type = 'button'; main.appendChild(go);
    var saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (saved && saved.stack && saved.stack.length) { var r = el('button', 'btn ghost', 'Seguir con «' + saved.topic + '»'); r.style.marginLeft = '10px'; r.onclick = function () { S = saved; track('prf_resumed', {}); next(); }; main.appendChild(r); }
    var run = function () { var t = inp.value.trim(); if (t.length < 2) { inp.focus(); return; } S = { topic: t, level: lvl, stack: [], nodes: [], taught: {}, learned: [], rounds: 0, maxDepth: 1 }; track('prf_start', { level: lvl }); pushFrame(t, '', null); };
    go.onclick = run; inp.onkeydown = function (e) { if (e.key === 'Enter') run(); }; inp.focus();
  }

  function pushFrame(term, parent, why, nodeId) {
    loading('Preparando la pregunta sobre «' + term + '»…');
    getCloze(term, parent, 0, []).then(function (c) {
      if (nodeId == null) nodeId = node(term, null).id; setStatus(nodeId, 'active'); S.stack.push({ term: term, parent: parent || '', nodeId: nodeId, cloze: c, pending: [], tries: 0, why: why || '', seen: [c.text] });
      S.maxDepth = Math.max(S.maxDepth, S.stack.length); save(); ask();
    }).catch(function () { fail(function () { pushFrame(term, parent, why, nodeId); }); });
  }

  function ask() {
    var f = S.stack[S.stack.length - 1]; renderPile(); main.textContent = '';
    crumb(main); if (f.why && f.tries === 0) main.appendChild(el('div', 'why', f.why));
    track('prf_cloze_shown', { depth: S.stack.length, tries: f.tries });
    var p = el('p', 'cloze'), inputs = [];
    f.cloze.text.split(/(\[\[\d+\]\])/).forEach(function (part) {
      var m = part.match(/^\[\[(\d+)\]\]$/); if (!m) { p.appendChild(document.createTextNode(part)); return; }
      var b = f.cloze.blanks.filter(function (x) { return x.n === Number(m[1]); })[0], i = el('input'); i.type = 'text'; i.autocomplete = 'off'; i.autocapitalize = 'none'; i.spellcheck = false; i.setAttribute('aria-label', 'Espacio ' + m[1]);
      i.style.width = Math.max(5, (b ? b.answers[0].length : 6) + 2) + 'ch'; i.dataset.n = m[1]; inputs.push(i); p.appendChild(i);
    });
    main.appendChild(p);
    var row = el('div', 'row'), ok = el('button', 'btn', 'Comprobar'); ok.type = 'button'; row.appendChild(ok); main.appendChild(row);
    inputs.forEach(function (i, k) { i.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (inputs[k + 1]) inputs[k + 1].focus(); else ok.click(); } }; });
    ok.onclick = function () { submit(f, inputs); };
    if (inputs[0]) inputs[0].focus();
  }

  function submit(f, inputs) {
    var res = f.cloze.blanks.map(function (b) { var inp = inputs.filter(function (i) { return Number(i.dataset.n) === b.n; })[0], given = inp ? inp.value : ''; return { b: b, given: given, right: isRight(given, b.answers) }; });
    S.rounds++; var wrong = res.filter(function (r) { return !r.right; });
    if (!wrong.length) { track('prf_cloze_ok', { depth: S.stack.length, tries: f.tries }); res.forEach(function (r) { learn(r.b.answers[0], r.b.meaning); }); learn(f.term, ''); success(f, res); return; }
    f.tries++; f.pending = wrong.map(function (r) { var k = norm(r.b.answers[0]), n = S.nodes.filter(function (x) { return x.parentId === f.nodeId && norm(x.term) === k; })[0] || node(r.b.answers[0], f.nodeId); n.status = 'pending'; return { answer: r.b.answers[0], meaning: r.b.meaning, nodeId: n.id }; }); save(); track('prf_cloze_fail', { depth: S.stack.length, wrong: wrong.length, of: res.length });
    res.filter(function (r) { return r.right; }).forEach(function (r) { learn(r.b.answers[0], r.b.meaning); });
    feedback(f, res); prefetch(f);
  }
  function learn(term, meaning) { var k = norm(term); if (!k) return; if (!S.learned.some(function (x) { return norm(x.term) === k; })) S.learned.push({ term: term, meaning: meaning || '' }); else if (meaning) S.learned.forEach(function (x) { if (norm(x.term) === k && !x.meaning) x.meaning = meaning; }); }
  function canDescend(f, w) {
    var k = norm(w.answer); if (S.stack.length >= MAX_DEPTH) return false; if ((S.taught[k] || 0) >= MAX_TAUGHT) return false;
    return !S.stack.some(function (x) { return norm(x.term) === k; });
  }
  function prefetch(f) { if (f.pending[0] && canDescend(f, f.pending[0])) getCloze(f.pending[0].answer, f.term, 0, []).catch(function () {}); }

  function filled(f, res) {
    var p = el('p', 'cloze'); f.cloze.text.split(/(\[\[\d+\]\])/).forEach(function (part) {
      var m = part.match(/^\[\[(\d+)\]\]$/); if (!m) { p.appendChild(document.createTextNode(part)); return; }
      var r = res.filter(function (x) { return x.b.n === Number(m[1]); })[0]; if (!r) return;
      var s = el('span', r.right ? 'ok' : 'bad', r.b.answers[0]); p.appendChild(s);
      if (!r.right && r.given.trim()) p.appendChild(el('s', null, r.given.trim()));
    }); return p;
  }
  function feedback(f, res) {
    renderPile(); main.textContent = ''; crumb(main);
    var wrong = res.filter(function (r) { return !r.right; });
    main.appendChild(el('h2', null, wrong.length === res.length ? 'Casi: veamos qué falta' : 'Te faltaron ' + wrong.length + (wrong.length === 1 ? ' palabra' : ' palabras')));
    main.appendChild(filled(f, res));
    wrong.forEach(function (r) { var d = el('p', 'mean'); d.appendChild(el('b', null, r.b.answers[0])); d.appendChild(document.createTextNode(': ' + r.b.meaning)); main.appendChild(d); });
    var first = f.pending[0], desc = canDescend(f, first);
    main.appendChild(el('p', 'muted small', desc ? 'Ahora una pregunta sobre «' + first.answer + '»' + (f.pending.length > 1 ? '. Después seguirás con ' + (f.pending.length - 1) + ' más y volverás a esta.' : ', y luego volverás a esta.') : 'Seguimos: ya viste esas palabras.'));
    var b = el('button', 'btn', desc ? 'Entender «' + first.answer + '»' : 'Volver a intentarlo'); b.onclick = next; main.appendChild(b); b.focus();
  }
  function success(f, res) {
    main.textContent = ''; crumb(main);
    var isRoot = S.stack.length === 1;
    main.appendChild(el('h2', null, isRoot ? '¡Lo lograste!' : 'Bien. Ya puedes volver'));
    main.appendChild(filled(f, res));
    var b = el('button', 'btn', isRoot ? 'Ver lo que aprendiste' : 'Volver a «' + S.stack[S.stack.length - 2].term + '»');
    b.onclick = function () { setStatus(f.nodeId, 'done'); S.stack.pop(); track('prf_return', { depth: S.stack.length }); save(); if (isRoot) done(); else next(); }; main.appendChild(b); b.focus();
  }

  /* ---------- motor de la pila ---------- */
  function next() {
    if (busy) return; var f = S.stack[S.stack.length - 1]; if (!f) { done(); return; }
    if (f.pending.length) {
      var w = f.pending[0];
      if (!canDescend(f, w)) { f.pending.shift(); setStatus(w.nodeId, 'done'); save(); explain(f, w); return; }
      f.pending.shift(); var k = norm(w.answer); S.taught[k] = (S.taught[k] || 0) + 1; save(); track('prf_descend', { depth: S.stack.length + 1 });
      pushFrame(w.answer, f.term, 'No pudiste poner «' + w.answer + '» en la pregunta sobre «' + f.term + '». Primero esta.', w.nodeId); return;
    }
    // sin pendientes: se vuelve a presentar la pregunta (después de dos fallos seguidos, con otra redacción)
    if (f.tries >= 2 && f.tries % 2 === 0) {
      loading('Preparando otra versión de «' + f.term + '»…');
      getCloze(f.term, f.parent, f.tries / 2, f.seen.slice(-2)).then(function (c) { f.cloze = c; f.seen.push(c.text); save(); ask(); }).catch(function () { ask(); });
    } else ask();
  }
  function explain(f, w) {
    renderPile(); main.textContent = ''; crumb(main);
    main.appendChild(el('h2', null, w.answer)); main.appendChild(el('p', null, w.meaning));
    main.appendChild(el('p', 'muted small', 'Ya pasaste por esta palabra antes (o el recorrido ya es muy profundo), así que aquí la explico y seguimos.'));
    var b = el('button', 'btn', 'Seguir'); b.onclick = next; main.appendChild(b); b.focus();
  }
  function done() {
    track('prf_done', { rounds: S.rounds, depth: S.maxDepth, learned: S.learned.length }); clear(); renderPile(); pile.classList.remove('on'); main.textContent = '';
    main.appendChild(el('h2', null, 'Completaste «' + S.topic + '»'));
    main.appendChild(el('p', 'muted', S.rounds + ' intentos · hasta ' + S.maxDepth + ' niveles de profundidad · ' + S.learned.length + ' conceptos'));
    var withM = S.learned.filter(function (x) { return x.meaning; });
    if (withM.length) { main.appendChild(el('p', null, 'Lo que repasaste en el camino:')); var ul = el('ul', 'recap'); withM.forEach(function (x) { var li = el('li'); li.appendChild(el('b', null, x.term)); li.appendChild(document.createTextNode(': ' + x.meaning)); ul.appendChild(li); }); main.appendChild(ul); }
    var row = el('div', 'row'), again = el('button', 'btn', 'Estudiar otro tema'); again.onclick = start; row.appendChild(again);
    var up = el('button', 'btn ghost', 'Mismo tema, más difícil'); up.onclick = function () { var t = S.topic, nl = S.level === 'beginner' ? 'intermediate' : 'advanced'; S = { topic: t, level: nl, stack: [], nodes: [], taught: {}, learned: [], rounds: 0, maxDepth: 1 }; pushFrame(t, '', null); }; if (S.level !== 'advanced') row.appendChild(up);
    main.appendChild(row);
  }

  track('prf_landing', {}); start();
})();
