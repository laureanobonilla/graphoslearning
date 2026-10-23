/* Completar palabras: convierte el título de un nodo y su definición en un ejercicio de huecos, sin gastar gemas (todo local).
   El nivel decide cuántos huecos hay y cuánta ayuda se da:
   principiante  → título 1 hueco con la 1.ª letra + definición 2 huecos, con banco de palabras (y 2 señuelos)
   intermedio    → título 1 hueco + definición 4 huecos, banco de palabras solo con las respuestas
   avanzado      → título completo + definición 8 huecos, sin banco ni pistas */
(function () {
  'use strict';
  var STOP = new Set(('de la que el en y a los del se las por un para con no una su al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros ' +
    'cada cuyo cuya cuyos partir través ejemplo forma manera parte partes tipo tipos varios diferentes mismo misma mismos mismas puede pueden suele según donde cuyas hacia ' +
    'the and for that with from this which their there these those have been into than then them they were what when where while about also such other more most some each over under between through using used uses').split(/\s+/));
  var LEVELS = {
    principiante: { titleBlanks: 1, defBlanks: 2, bank: true, decoys: 2, hint: true },
    intermedio:   { titleBlanks: 1, defBlanks: 4, bank: true, decoys: 0, hint: true },
    avanzado:     { titleBlanks: 3, defBlanks: 8, bank: false, decoys: 0, hint: false }
  };
  var WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    if (Math.abs(m - n) > 1) return 2;
    for (i = 0; i <= m; i++) { d[i] = [i]; } for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function same(given, answer) {
    var g = norm(given), a = norm(answer);
    if (!g) return false;
    if (g === a) return true;
    return a.length >= 7 && lev(g, a) <= 1;   // una letra de más o de menos se perdona en palabras largas
  }
  function segments(text) {
    var out = [], last = 0, m; WORD.lastIndex = 0;
    while ((m = WORD.exec(text))) {
      if (m.index > last) out.push({ t: 'text', s: text.slice(last, m.index) });
      out.push({ t: 'word', s: m[0], blank: false });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: 'text', s: text.slice(last) });
    return out;
  }
  function candidates(segs, minLen) {
    var seen = {}, c = [];
    segs.forEach(function (sg, i) {
      if (sg.t !== 'word') return;
      var k = norm(sg.s);
      if (k.length < minLen || STOP.has(sg.s.toLowerCase()) || /^\d+$/.test(k) || seen[k]) return;
      seen[k] = true; c.push(i);
    });
    return c;
  }
  function spread(list, n) {   // n elementos repartidos a lo largo de la lista (no todos juntos al principio)
    if (n >= list.length) return list.slice();
    var out = [], step = list.length / n, i;
    for (i = 0; i < n; i++) out.push(list[Math.floor(i * step + step / 2)]);
    return out;
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // build(título, definición, nivel) → { level, cfg, title:[seg], def:[seg], blanks:[{id,answer,part,idx,hint}], bank:[palabras] } o null si no hay texto suficiente
  function build(title, definition, level) {
    var cfg = LEVELS[level] || LEVELS.intermedio, t = segments(String(title || '')), d = segments(String(definition || '')), blanks = [];
    var tc = candidates(t, 3), dc = candidates(d, 5);
    if (dc.length < 2) return null;
    var tPick = cfg.titleBlanks >= 3 ? tc.slice(0, 3) : spread(tc, Math.min(cfg.titleBlanks, tc.length));
    if (!tPick.length && t.length) { var w = t.findIndex(function (s) { return s.t === 'word'; }); if (w >= 0) tPick = [w]; }
    var dPick = spread(dc, Math.min(cfg.defBlanks, Math.max(2, Math.floor(dc.length * 0.6))));
    tPick.forEach(function (i) { t[i].blank = true; });
    dPick.forEach(function (i) { d[i].blank = true; });
    var id = 0;
    [['title', t], ['def', d]].forEach(function (p) {
      p[1].forEach(function (sg, i) { if (sg.blank) { sg.id = 'b' + (id++); blanks.push({ id: sg.id, answer: sg.s, part: p[0], idx: i, hint: cfg.hint && p[0] === 'title' ? sg.s.charAt(0) : '' }); } });
    });
    var bank = [];
    if (cfg.bank) {
      bank = blanks.map(function (b) { return b.answer; });
      if (cfg.decoys) {
        var answers = blanks.map(function (b) { return norm(b.answer); });
        var spare = dc.filter(function (i) { return !d[i].blank && answers.indexOf(norm(d[i].s)) < 0; }).map(function (i) { return d[i].s; });
        shuffle(spare).slice(0, cfg.decoys).forEach(function (w) { bank.push(w); });
      }
      bank = shuffle(bank);
    }
    return { level: level, cfg: cfg, title: t, def: d, blanks: blanks, bank: bank };
  }
  window.GK_CLOZE = { build: build, same: same, LEVELS: Object.keys(LEVELS) };
})();
