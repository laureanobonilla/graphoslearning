/* Musicología · Completa la historia.
 * Épocas → autor (o cualquier tema) → aspecto y nivel → 10 preguntas de completar → puntuación del nivel.
 * Las preguntas las genera el servidor; aquí se corrigen. Se aceptan equivalentes reales (ver match.js); los sinónimos dudosos los juzga el servidor. */
(function () {
  'use strict';
  var FN = '/.netlify/functions/musica-examen', KEY = 'mus_h', NQ = 10, BATCH = 5;
  var CAT = window.MUS_CATALOGO, M = window.MusMatch, $app = document.getElementById('app');
  var ASP = { importancia: 'Importancia', significado: 'Significado', contexto: 'Contexto sociocultural y político', curiosidades: 'Curiosidades', obra: 'Obra y estilo', vida: 'Vida y carrera' };
  var NIV = { basico: ['Básico', 'Hechos muy conocidos. Un hueco por pregunta.'], intermedio: ['Intermedio', 'Como un curso introductorio. Dos huecos por pregunta.'], avanzado: ['Avanzado', 'Datos de estudiante de musicología. Tres huecos por pregunta.'] };
  var S = { tema: '', epoca: false, nivel: 'basico', asp: [], qs: [], i: 0, res: [], batches: [], seq: [], seed: '', avoid: [], fase: 'ans' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s) { return document.querySelector(s); }
  function hist() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function saveHist(h) { try { localStorage.setItem(KEY, JSON.stringify(h)); } catch (e) {} }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function post(body, ms) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms || 30000);
    return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: c.signal })
      .then(function (r) { return r.json().then(function (j) { clearTimeout(t); if (!r.ok) throw new Error(j.error || 'Error'); return j; }); })
      .catch(function (e) { clearTimeout(t); throw e; });
  }
  function top(back) { return '<div class="top"><span class="brand"><i></i>Musicología</span>' + (back ? '<button class="link" id="back">← ' + back + '</button>' : '') + '</div>'; }
  function go(html) { $app.innerHTML = html; window.scrollTo(0, 0); }

  // ---------- Inicio ----------
  function home() {
    go(top() + '<section class="hero"><h1>Estudia la música completando su historia</h1>' +
      '<p class="muted">Elige una época o un autor. Te armamos 10 preguntas de completar sobre su importancia, el significado de sus obras, el contexto sociocultural y político, y curiosidades. Al final recibes tu puntuación en ese nivel.</p></section>' +
      '<form class="search" id="fs"><input id="q" placeholder="Escribe un autor, obra o movimiento" maxlength="100" autocomplete="off" aria-label="Autor, obra o movimiento"><button class="btn" type="submit">Estudiar</button></form>' +
      '<p class="small muted">Por ejemplo: Beethoven, Las cuatro estaciones, el Barroco, el bebop…</p>' +
      '<div class="sec">Por época</div><div class="era-grid">' + CAT.map(function (e) { return '<button class="era" data-e="' + e.id + '"><b>' + esc(e.nombre) + '</b><span>' + esc(e.rango) + ' · ' + e.autores.length + ' temas</span></button>'; }).join('') + '</div>');
    $('#fs').onsubmit = function (ev) { ev.preventDefault(); var v = $('#q').value.trim(); if (v.length >= 2) setup(v, false, null); };
    Array.prototype.forEach.call(document.querySelectorAll('.era'), function (b) { b.onclick = function () { era(b.dataset.e); }; });
  }
  function era(id) {
    var e = CAT.filter(function (x) { return x.id === id; })[0], h = hist();
    function best(t) { var b = h[t] && h[t].best; if (!b) return ''; var m = Math.max(b.basico || 0, b.intermedio || 0, b.avanzado || 0); return m ? '<span class="best">mejor ' + m + ' %</span>' : ''; }
    var tema = 'La música de la época: ' + e.nombre + ' (' + e.rango + ')';
    go(top('Inicio') + '<h1>' + esc(e.nombre) + '</h1><p class="muted">' + esc(e.rango) + '</p>' +
      '<div class="list"><button class="item era-all" data-t="' + esc(tema) + '" data-ep="1"><span><b>La época en general</b><small>Estilos, contexto y figuras de ' + esc(e.nombre) + '</small></span>' + best(tema) + '</button></div>' +
      '<div class="sec">Autores y temas</div><div class="list">' + e.autores.map(function (a) { return '<button class="item" data-t="' + esc(a.n) + '"><span><b>' + esc(a.n) + '</b><small>' + esc(a.f) + ' · ' + esc(a.d) + '</small></span>' + best(a.n) + '</button>'; }).join('') + '</div>');
    $('#back').onclick = home;
    Array.prototype.forEach.call(document.querySelectorAll('.item'), function (b) { b.onclick = function () { setup(b.dataset.t, !!b.dataset.ep, id); }; });
  }

  // ---------- Preparar el examen ----------
  function setup(tema, epoca, eraId) {
    S.tema = tema; S.epoca = epoca; S.eraId = eraId;
    var all = epoca ? ['importancia', 'significado', 'contexto', 'curiosidades', 'obra'] : Object.keys(ASP);
    S.asp = all.slice(); S.all = all;
    var h = hist()[tema] || {}, b = h.best || {};
    function draw() {
      go(top(eraId ? 'Volver' : 'Inicio') + '<h1>' + esc(epoca ? tema.replace(/^La música de la época: /, '') : tema) + '</h1>' +
        '<div class="sec">¿Qué quieres estudiar?</div><div class="chips">' + all.map(function (k) { return '<button class="chip' + (S.asp.indexOf(k) >= 0 ? ' on' : '') + '" data-k="' + k + '" aria-pressed="' + (S.asp.indexOf(k) >= 0) + '">' + ASP[k] + '</button>'; }).join('') + '</div>' +
        '<div class="sec">Nivel</div><div class="lvls">' + Object.keys(NIV).map(function (k) { return '<button class="lvl' + (S.nivel === k ? ' on' : '') + '" data-n="' + k + '"><b>' + NIV[k][0] + (b[k] != null ? ' · mejor ' + b[k] + ' %' : '') + '</b><span>' + NIV[k][1] + '</span></button>'; }).join('') + '</div>' +
        '<button class="btn block" id="go"' + (S.asp.length ? '' : ' disabled') + '>' + (h.seen && h.seen.length ? 'Empezar (preguntas nuevas)' : 'Empezar el examen') + '</button>' +
        '<p class="note">' + NQ + ' preguntas. Te corregimos cada una y pasamos a la siguiente. Preguntas escritas con IA: verifica los datos que vayas a citar.</p>');
      $('#back').onclick = eraId ? function () { era(eraId); } : home;
      Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (c) { c.onclick = function () { var k = c.dataset.k, i = S.asp.indexOf(k); if (i >= 0) S.asp.splice(i, 1); else S.asp.push(k); draw(); }; });
      Array.prototype.forEach.call(document.querySelectorAll('.lvl'), function (c) { c.onclick = function () { S.nivel = c.dataset.n; draw(); }; });
      $('#go').onclick = start;
    }
    draw();
  }
  function start() {
    var h = hist(); S.avoid = ((h[S.tema] && h[S.tema].seen) || []).slice(-40);
    var pool = shuffle(S.asp), seq = []; while (seq.length < NQ) seq = seq.concat(pool.length > 1 ? shuffle(pool) : pool); S.seq = seq.slice(0, NQ);
    S.seed = Math.random().toString(36).slice(2, 8); S.qs = []; S.res = []; S.i = 0; S.batches = [];
    for (var k = 0; k < NQ; k += BATCH) S.batches.push(fetchBatch(k));
    show();
  }
  function fetchBatch(from, tries) {
    var asp = S.seq.slice(from, from + BATCH), b = { from: from, state: 'wait', cbs: [] };
    post({ accion: 'examen', tema: S.tema, nivel: S.nivel, aspectos: asp, avoid: S.avoid, seed: S.seed + from }, 60000).then(function (d) {
      d.preguntas.forEach(function (q, i) { S.qs[from + i] = q; });
      b.state = 'ok'; b.cbs.splice(0).forEach(function (f) { f(); });
    }).catch(function (e) { b.state = 'err'; b.err = e.message; b.cbs.splice(0).forEach(function (f) { f(); }); });
    return b;
  }
  function show() {
    var q = S.qs[S.i], b = S.batches[Math.floor(S.i / BATCH)];
    if (q) return pregunta();
    if (b && b.state === 'err') return go(top('Salir') + '<div class="load"><h2>No pudimos preparar las preguntas</h2><p class="muted">' + esc(b.err || '') + '</p><button class="btn" id="rt">Intentar de nuevo</button></div>') || ($('#back').onclick = home, $('#rt').onclick = function () { S.batches[Math.floor(S.i / BATCH)] = fetchBatch(Math.floor(S.i / BATCH) * BATCH); show(); });
    go(top() + '<div class="load"><div class="spin"></div><h2>Preparando tu examen</h2><p class="muted">Escribiendo preguntas sobre ' + esc(S.epoca ? 'la época' : S.tema) + '…</p></div>');
    b.cbs.push(show);
  }

  // ---------- Pregunta ----------
  function staff() {
    var pos = [0, 10, 4, 14, 8, 2, 12, 6, 16, 10];
    var n = '<div class="staff" aria-hidden="true">'; for (var k = 0; k < NQ; k++) { var r = S.res[k], c = r ? (r.ok === r.total ? 'ok' : r.ok > 0 ? 'mid' : 'bad') : (k === S.i ? 'now' : ''); n += '<span class="nt ' + c + '"><i style="top:' + (6 + pos[k]) + 'px"></i></span>'; } return n + '</div>';
  }
  function pts() { var o = 0, t = 0; S.res.forEach(function (r) { o += r.ok; t += r.total; }); return o + ' de ' + t; }
  function pregunta() {
    var q = S.qs[S.i]; S.fase = 'ans';
    var html = esc(q.text).replace(/\[\[(\d+)\]\]/g, function (m, n) { return '<input data-n="' + n + '" aria-label="Espacio ' + n + '" autocomplete="off" autocapitalize="off" spellcheck="false">'; });
    go(top('Salir') + staff() + '<div class="scoreline"><span>Pregunta ' + (S.i + 1) + ' de ' + NQ + '</span><span>Puntos: ' + pts() + '</span></div>' +
      '<div class="qcard"><span class="asp">' + esc(ASP[q.aspecto] || '') + '</span><div class="qtitle">' + esc(q.titulo) + '</div><div class="cloze" id="cz">' + html + '</div>' +
      '<div id="fbk"></div><button class="btn block" id="chk">Comprobar</button><button class="link" id="nose" style="margin-top:8px">No lo sé</button></div>');
    $('#back').onclick = function () { if (confirm('¿Salir del examen? Perderás tu avance en este.')) home(); };
    var ins = document.querySelectorAll('#cz input');
    Array.prototype.forEach.call(ins, function (el, k) { el.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (ins[k + 1]) ins[k + 1].focus(); else comprobar(false); } }; });
    if (ins[0]) ins[0].focus();
    $('#chk').onclick = function () { comprobar(false); };
    $('#nose').onclick = function () { comprobar(true); };
  }
  function comprobar(sinSaber) {
    var q = S.qs[S.i], ins = Array.prototype.slice.call(document.querySelectorAll('#cz input')), vals = ins.map(function (e) { return e.value.trim(); });
    if (!sinSaber && vals.some(function (v) { return !v; })) { $('#fbk').innerHTML = '<p class="err small">Completa todos los espacios, o toca «No lo sé».</p>'; return; }
    $('#chk').disabled = true; $('#nose').hidden = true; ins.forEach(function (e) { e.disabled = true; });
    var jobs = q.blanks.map(function (bl, k) {
      var v = sinSaber ? '' : vals[k], st = sinSaber ? 'num' : M.check(v, bl.answers);
      if (st === 'ok' || st === 'typo') return Promise.resolve({ ok: true, v: v, note: st === 'typo' ? 'Con una errata menor: la tomamos como correcta.' : '' });
      if (st !== 'dudoso') return Promise.resolve({ ok: false, v: v });
      return post({ accion: 'juzga', text: q.text.replace(/\[\[(\d+)\]\]/g, function (m, n) { return Number(n) === bl.n ? '[[ ]]' : '___'; }), aceptadas: bl.answers, resp: v }, 14000)
        .then(function (r) { return { ok: !!r.equivalente, v: v, note: r.equivalente ? 'Tu respuesta «' + v + '» equivale a «' + bl.answers[0] + '» en este contexto.' : '' }; })
        .catch(function () { return { ok: false, v: v }; });
    });
    $('#chk').textContent = 'Corrigiendo…';
    Promise.all(jobs).then(function (rs) {
      var ok = rs.filter(function (r) { return r.ok; }).length;
      S.res[S.i] = { ok: ok, total: rs.length, aspecto: q.aspecto };
      var notes = [], k = 0;
      var cz = esc(q.text).replace(/\[\[(\d+)\]\]/g, function (m, n) {
        var bl = q.blanks.filter(function (b) { return b.n === Number(n); })[0], r = rs[q.blanks.indexOf(bl)];
        if (r.note) notes.push(r.note);
        return r.ok ? '<span class="r ok">' + esc(r.ok && r.v ? (M.canon(r.v) === M.canon(bl.answers[0]) ? bl.answers[0] : r.v) : bl.answers[0]) + '</span>' : '<span class="r bad">' + (r.v ? '<s>' + esc(r.v) + '</s>' : '—') + '<small>Correcta: ' + esc(bl.answers[0]) + '</small></span>';
      });
      var cls = ok === rs.length ? 'ok' : ok > 0 ? 'mid' : 'bad', head = ok === rs.length ? 'Correcto' : ok > 0 ? 'Acertaste ' + ok + ' de ' + rs.length : 'Esta vez no';
      var last = S.i + 1 >= NQ;
      go(top('Salir') + staff() + '<div class="scoreline"><span>Pregunta ' + (S.i + 1) + ' de ' + NQ + '</span><span>Puntos: ' + pts() + '</span></div>' +
        '<div class="qcard"><span class="asp">' + esc(ASP[q.aspecto] || '') + '</span><div class="qtitle">' + esc(q.titulo) + '</div><div class="cloze">' + cz + '</div>' +
        '<div class="fb ' + cls + '"><b>' + head + '</b>' + esc(q.porque) + '</div>' + notes.map(function (n) { return '<p class="note">' + esc(n) + '</p>'; }).join('') +
        '<button class="btn block" id="nx">' + (last ? 'Ver mi puntuación' : 'Siguiente') + '</button></div>');
      $('#back').onclick = function () { if (confirm('¿Salir del examen? Perderás tu avance en este.')) home(); };
      $('#nx').focus(); $('#nx').onclick = function () { if (last) final(); else { S.i++; show(); } };
    });
  }

  // ---------- Resultado ----------
  function final() {
    var o = 0, t = 0, por = {}; S.res.forEach(function (r) { o += r.ok; t += r.total; var a = por[r.aspecto] || (por[r.aspecto] = { o: 0, t: 0 }); a.o += r.ok; a.t += r.total; });
    var pct = t ? Math.round(o / t * 100) : 0;
    var etq = pct >= 90 ? 'Sobresaliente: dominas este nivel' : pct >= 75 ? 'Muy bien: casi lo dominas' : pct >= 60 ? 'Aprobado: buena base' : pct >= 40 ? 'En camino: sigue estudiando' : 'A reforzar: aquí hay mucho por descubrir';
    var h = hist(), e = h[S.tema] || (h[S.tema] = { seen: [], best: {} });
    e.seen = e.seen.concat(S.qs.slice(0, NQ).map(function (q) { return q && q.titulo; }).filter(Boolean)).slice(-80);
    e.best[S.nivel] = Math.max(e.best[S.nivel] || 0, pct); saveHist(h);
    var ks = Object.keys(por).filter(function (k) { return por[k].t > 0; }).sort(function (a, b) { return por[b].o / por[b].t - por[a].o / por[a].t; });
    var tip = ks.length > 1 ? '<p class="muted">Tu punto fuerte: <b>' + ASP[ks[0]] + '</b>. Para reforzar: <b>' + ASP[ks[ks.length - 1]] + '</b>.</p>' : '';
    go(top() + staff() + '<div class="load" style="padding:26px 0 10px"><p class="small muted">' + esc(S.epoca ? S.tema.replace(/^La música de la época: /, '') : S.tema) + ' · Nivel ' + NIV[S.nivel][0] + '</p><div class="big">' + pct + ' %</div><h2 style="margin-top:6px">' + etq + '</h2><p class="muted" style="margin-top:8px">' + o + ' de ' + t + ' espacios correctos</p></div>' + tip +
      '<div class="bars">' + ks.map(function (k) { var p = Math.round(por[k].o / por[k].t * 100); return '<div class="bar"><div class="l"><span>' + ASP[k] + '</span><span>' + p + ' %</span></div><div class="t"><i style="width:' + p + '%"></i></div></div>'; }).join('') + '</div>' +
      '<button class="btn block" id="again">Jugar de nuevo este nivel (preguntas nuevas)</button><button class="btn ghost block" id="lvl">Probar otro nivel</button><button class="btn ghost block" id="oth">Elegir otro autor o época</button>');
    $('#again').onclick = function () { start(); };
    $('#lvl').onclick = function () { setup(S.tema, S.epoca, S.eraId); };
    $('#oth').onclick = home;
  }
  home();
})();
