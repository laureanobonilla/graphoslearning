// Motor de audio de «tu-audio»: corre en el navegador de la persona (y en Node para las pruebas). Sin dependencias.
// - shift(): cambia tono (medios tonos) y velocidad (sin cambiar el tono) con WSOLA + remuestreo.
// - detect(): tono (nota/escala) y BPM aproximados.
// - encodeWav(): WAV 16 bits.
(function (root) {
  'use strict';
  // Cambia la duración por `ratio` (>1 = más largo) conservando el tono. WSOLA: ventanas con cruce que se alinean por correlación.
  function stretch(x, ratio, sr) {
    if (Math.abs(ratio - 1) < 1e-4 || x.length < 4096) return x;
    var win = Math.round(sr * 0.046), hop = win >> 1, seek = Math.round(sr * 0.012), outLen = Math.round(x.length * ratio);
    var out = new Float32Array(outLen + win * 2), norm = new Float32Array(outLen + win * 2);
    var hann = new Float32Array(win); for (var i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / win);
    var inStep = hop / ratio, pos = 0, o = 0, prevTail = -1, stepC = Math.max(1, (win / 8) | 0);
    while (o + win < out.length) {
      var center = Math.round(pos), best = center;
      if (prevTail >= 0) {                 // busca, cerca del punto ideal, el tramo que mejor continúa al anterior
        var lo = Math.max(0, center - seek), hi = Math.min(x.length - win - 1, center + seek), bestC = -1e30;
        for (var c = lo; c <= hi; c += 2) {
          var s = 0; for (var k = 0; k < win >> 1; k += stepC) s += x[prevTail + k] * x[c + k];
          if (s > bestC) { bestC = s; best = c; }
        }
      }
      if (best + win >= x.length) break;
      for (var j = 0; j < win; j++) { out[o + j] += x[best + j] * hann[j]; norm[o + j] += hann[j]; }
      prevTail = best + hop; if (prevTail + win >= x.length) prevTail = x.length - win - 1;
      pos += inStep; o += hop;
    }
    var res = new Float32Array(outLen);
    for (var m = 0; m < outLen; m++) res[m] = norm[m] > 1e-3 ? out[m] / norm[m] : 0;
    return res;
  }
  // Remuestreo lineal: factor>1 acorta (más agudo y rápido).
  function resample(x, factor) {
    if (Math.abs(factor - 1) < 1e-6) return x;
    var n = Math.floor(x.length / factor), y = new Float32Array(n);
    for (var i = 0; i < n; i++) { var p = i * factor, a = p | 0, f = p - a, b = a + 1 < x.length ? x[a + 1] : x[a]; y[i] = x[a] * (1 - f) + b * f; }
    return y;
  }
  // channels: [Float32Array,...]. semitones entero (−12..12), speed 0.5..2 (1 = igual). Devuelve canales nuevos.
  function shift(channels, sr, semitones, speed) {
    var p = Math.pow(2, (semitones || 0) / 12), s = speed || 1, ratio = p / s;
    return channels.map(function (ch) { return stretch(resample(ch, p), ratio, sr); });
  }
  // ---- análisis ----
  function fft(re, im) {
    var n = re.length;
    for (var i = 1, j = 0; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (var a = 0; a < n; a += len) { var cr = 1, ci = 0; for (var b = 0; b < len >> 1; b++) {
        var ur = re[a + b], ui = im[a + b], vr = re[a + b + (len >> 1)] * cr - im[a + b + (len >> 1)] * ci, vi = re[a + b + (len >> 1)] * ci + im[a + b + (len >> 1)] * cr;
        re[a + b] = ur + vr; im[a + b] = ui + vi; re[a + b + (len >> 1)] = ur - vr; im[a + b + (len >> 1)] = ui - vi;
        var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
    }
  }
  function mono(channels) { var n = channels[0].length, m = new Float32Array(n); for (var c = 0; c < channels.length; c++) for (var i = 0; i < n; i++) m[i] += channels[c][i] / channels.length; return m; }
  function down(x, sr, target) { var f = Math.max(1, Math.floor(sr / target)), n = Math.floor(x.length / f), y = new Float32Array(n); for (var i = 0; i < n; i++) { var s = 0; for (var k = 0; k < f; k++) s += x[i * f + k]; y[i] = s / f; } return { data: y, sr: sr / f }; }
  var NOTES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  var MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function corr(a, b) { var n = a.length, ma = 0, mb = 0, i; for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n; var s = 0, va = 0, vb = 0; for (i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) * (a[i] - ma); vb += (b[i] - mb) * (b[i] - mb); } return s / Math.sqrt(va * vb + 1e-12); }
  function detect(channels, sr) {
    var d = down(mono(channels), sr, 11025), x = d.data, fs = d.sr, N = 4096, chroma = new Array(12).fill(0);
    var maxFrames = 90, total = Math.floor((x.length - N) / (N / 2)), stepF = Math.max(1, Math.floor(total / maxFrames));
    var re = new Float32Array(N), im = new Float32Array(N), w = new Float32Array(N); for (var i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    for (var f = 0; f < total; f += stepF) {
      var off = f * (N / 2); for (i = 0; i < N; i++) { re[i] = x[off + i] * w[i]; im[i] = 0; } fft(re, im);
      for (var k = 1; k < N / 2; k++) { var fr = k * fs / N; if (fr < 65 || fr > 2000) continue; var midi = 69 + 12 * Math.log2(fr / 440); chroma[((Math.round(midi) % 12) + 12) % 12] += Math.sqrt(re[k] * re[k] + im[k] * im[k]); }
    }
    var best = { score: -2, tonic: 0, minor: false };
    for (var t = 0; t < 12; t++) { var rm = [], rn = []; for (var j = 0; j < 12; j++) { rm.push(MAJ[(j - t + 12) % 12]); rn.push(MIN[(j - t + 12) % 12]); }
      var sM = corr(chroma, rm), sN = corr(chroma, rn); if (sM > best.score) best = { score: sM, tonic: t, minor: false }; if (sN > best.score) best = { score: sN, tonic: t, minor: true }; }
    // BPM: flujo espectral simplificado (energía por bloques) + autocorrelación
    var hop = 256, nb = Math.floor(x.length / hop), env = new Float32Array(nb), prev = 0;
    for (i = 0; i < nb; i++) { var e = 0; for (var q = 0; q < hop; q++) e += x[i * hop + q] * x[i * hop + q]; e = Math.sqrt(e / hop); env[i] = Math.max(0, e - prev); prev = e; }
    var e0 = 0; for (i = 0; i < nb; i++) e0 += env[i] * env[i]; e0 /= Math.max(1, nb);
    var fps = fs / hop, bestLag = 0, bestV = -1, sumAll = 0, cntAll = 0, minLag = Math.round(fps * 60 / 190), maxLag = Math.round(fps * 60 / 60);
    for (var lag = minLag; lag <= maxLag; lag++) { var sum = 0; for (i = 0; i + lag < nb; i++) sum += env[i] * env[i + lag]; sum /= (nb - lag); sumAll += sum; cntAll++; if (sum > bestV) { bestV = sum; bestLag = lag; } }
    var bpm = bestLag && e0 > 1e-10 && bestV > 0.12 * e0 && bestV > 1.6 * (sumAll / Math.max(1, cntAll)) ? 60 * fps / bestLag : 0; while (bpm && bpm < 70) bpm *= 2; while (bpm > 160) bpm /= 2;
    return { tonic: best.tonic, minor: best.minor, key: NOTES[best.tonic] + (best.minor ? ' menor' : ' mayor'), confidence: Math.round(best.score * 100) / 100, bpm: Math.round(bpm), notes: NOTES };
  }
  function encodeWav(channels, sr) {
    var nch = Math.min(2, channels.length), n = channels[0].length, buf = new ArrayBuffer(44 + n * nch * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * nch * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * nch * 2, true); v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * nch * 2, true);
    var o = 44; for (var i = 0; i < n; i++) for (var c = 0; c < nch; c++) { var s = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return buf;
  }
  function slice(channels, sr, fromSec, toSec) { var a = Math.max(0, Math.floor(fromSec * sr)), b = Math.min(channels[0].length, Math.floor(toSec * sr)); return channels.map(function (c) { return c.subarray(a, b); }); }
  var api = { stretch: stretch, resample: resample, shift: shift, detect: detect, encodeWav: encodeWav, slice: slice, NOTES: NOTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AudEngine = api;
})(typeof self !== 'undefined' ? self : this);
