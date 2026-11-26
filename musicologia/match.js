/* Corrector de respuestas: lo evidente se decide aquí; lo dudoso (sinónimos) lo juzga el servidor.
 * Reconoce mayúsculas, tildes, artículos, cifras = romanos = letras (XX = 20 = veinte), ordinales y erratas pequeñas en nombres largos. */
(function (root) {
  'use strict';
  var U = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
  var H = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };
  var O = { primero: 1, primer: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercer: 3, tercera: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5, sexto: 6, sexta: 6, septimo: 7, septima: 7, octavo: 8, octava: 8, noveno: 9, novena: 9, decimo: 10, decima: 10, undecimo: 11, duodecimo: 12, vigesimo: 20, vigesima: 20 };
  var ROMAN = /^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;
  var NOROMAN = { mi: 1, di: 1, vi: 1, li: 1, mix: 1, dim: 1, mil: 1, civil: 1, vid: 1, did: 1, mim: 1 };
  var DROP = { siglo: 1, ano: 1, anos: 1, opus: 1, op: 1, no: 1, num: 1, numero: 1, n: 1 };
  var ART = { el: 1, la: 1, los: 1, las: 1, un: 1, una: 1, the: 1 };

  function fold(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ºª°′″]/g, ' '); }
  function romanVal(t) { var m = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }, v = 0; for (var i = 0; i < t.length; i++) { var a = m[t[i]], b = m[t[i + 1]] || 0; v += a < b ? -a : a; } return v; }
  function numWords(tokens) {   // junta rachas de palabras de número en una cifra
    var out = [], i = 0;
    while (i < tokens.length) {
      var t = tokens[i];
      if (O[t] != null) { out.push(String(O[t])); i++; continue; }
      if (U[t] != null || H[t] != null || t === 'mil') {
        var total = 0, cur = 0, j = i, used = false;
        while (j < tokens.length) {
          var w = tokens[j];
          if (w === 'y' && used && (U[tokens[j + 1]] != null)) { j++; continue; }
          if (U[w] != null) { cur += U[w]; used = true; }
          else if (H[w] != null) { cur += H[w]; used = true; }
          else if (w === 'mil') { total += (cur || 1) * 1000; cur = 0; used = true; }
          else break;
          j++;
        }
        out.push(String(total + cur)); i = j; continue;
      }
      out.push(t); i++;
    }
    return out;
  }
  function canon(s) {
    var raw = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ºª°′″]/g, ' ');
    var toks = raw.replace(/[^A-Za-z0-9ñÑ ]/g, ' ').split(/\s+/).filter(Boolean);
    var whole = toks.length === 1;
    toks = toks.map(function (t) {
      var l = t.toLowerCase();
      if (/^[IVXLCDM]+$/.test(t) && ROMAN.test(l)) return String(romanVal(l));   // en mayúsculas: número romano
      if (whole && l.length >= 2 && ROMAN.test(l) && !NOROMAN[l]) return String(romanVal(l));   // «xx» solo, en minúsculas
      return l;
    });
    toks = numWords(toks);
    while (toks.length > 1 && (DROP[toks[0]] || ART[toks[0]])) toks.shift();
    return toks.join(' ').trim();
  }
  function lev(a, b) { var m = a.length, n = b.length, d = [], i, j; for (i = 0; i <= m; i++) d[i] = [i]; for (j = 1; j <= n; j++) d[0][j] = j; for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  // Devuelve 'ok' (coincide), 'typo' (errata pequeña aceptada), 'num' (distinta cifra: error seguro), o 'dudoso' (que lo juzgue el servidor).
  function check(user, answers) {
    var u = canon(user); if (!u) return 'vacio';
    var cs = answers.map(canon).filter(Boolean), i;
    for (i = 0; i < cs.length; i++) if (cs[i] === u) return 'ok';
    var uNum = /\d/.test(u), aNum = cs.some(function (c) { return /\d/.test(c); });
    if (aNum && uNum) return 'num';
    for (i = 0; i < cs.length; i++) {
      var c = cs[i]; if (/\d/.test(c) || c.length < 6) continue;
      var tol = c.length >= 9 ? 2 : 1;
      if (c[0] === u[0] && Math.abs(c.length - u.length) <= tol && lev(c, u) <= tol) return 'typo';
    }
    if (aNum) return 'num';
    return u.length >= 3 ? 'dudoso' : 'num';
  }
  var api = { canon: canon, check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MusMatch = api;
})(typeof window !== 'undefined' ? window : this);
