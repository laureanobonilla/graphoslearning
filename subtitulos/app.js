(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var MAX_SEC = 90, CODE_KEY = 'rot_codigo', S = { code: '', plan: null,  lines: [], style: 'impacto', dur: 0, file: null, url: null };
  var STYLES = { impacto: 'Impacto', karaoke: 'Karaoke', pop: 'Pop', limpio: 'Limpio' };
  function fmt(t) { t = Math.max(0, t); return Math.floor(t / 60) + ':' + ('0' + Math.floor(t % 60)).slice(-2); }
  function err(m) { var e = $('err'); e.textContent = m || ''; e.hidden = !m; }
  function busy(on, txt) { $('s2').hidden = false; $('busy').hidden = !on; if (txt) $('busyt').textContent = txt; }
  function track(n, p) { try { if (window.fbq) window.fbq('trackCustom', n, p || {}); if (window.gtag) window.gtag('event', n, p || {}); } catch (e) {} }

  // ---------- 1) video -> audio 16 kHz mono (WAV) ----------
  function wavOf(f32, sr) {
    var n = f32.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = function (o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) { var s = Math.max(-1, Math.min(1, f32[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([b], { type: 'audio/wav' });
  }
  function extractAudio(file) {
    return file.arrayBuffer().then(function (buf) {
      var AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
      return new Promise(function (ok, no) { ac.decodeAudioData(buf, ok, no); }).then(function (ab) {
        try { ac.close(); } catch (e) {}
        var sr = 16000, len = Math.ceil(ab.duration * sr), OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, oc = new OC(1, len, sr), src = oc.createBufferSource();
        src.buffer = ab; src.connect(oc.destination); src.start();
        return oc.startRendering().then(function (r) { return { blob: wavOf(r.getChannelData(0), sr), dur: ab.duration }; });
      });
    });
  }
  function b64(blob) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.onerror = no; r.readAsDataURL(blob); }); }

  // ---------- 2) palabras -> líneas de subtítulo ----------
  function toLines(words) {
    var out = [], cur = null;
    words.forEach(function (w, i) {
      var gap = cur ? w.s - cur.t[cur.t.length - 1].e : 0, chars = cur ? cur.t.reduce(function (a, x) { return a + x.w.length + 1; }, 0) : 0;
      if (!cur || cur.t.length >= 4 || chars + w.w.length > 22 || gap > 0.45 || /[.?!¿¡]$/.test(cur.t[cur.t.length - 1].w) && cur.t.length >= 2) { cur = { t: [] }; out.push(cur); }
      cur.t.push(w);
    });
    out.forEach(function (l) { l.s = l.t[0].s; l.e = l.t[l.t.length - 1].e; });
    return out;
  }
  function renderLines() {
    var box = $('lines'); box.innerHTML = '';
    S.lines.forEach(function (l, i) {
      var d = document.createElement('div'); d.className = 'ln'; d.id = 'ln' + i;
      var tm = document.createElement('time'); tm.textContent = fmt(l.s);
      var inp = document.createElement('input'); inp.value = l.t.map(function (w) { return w.w; }).join(' ');
      inp.onchange = function () { retext(l, inp.value); };
      inp.onfocus = function () { $('vid').currentTime = Math.max(0, l.s + 0.01); };
      d.appendChild(tm); d.appendChild(inp); box.appendChild(d);
    });
  }
  function retext(l, txt) {
    var ws = txt.trim().split(/\s+/).filter(Boolean); if (!ws.length) ws = ['…'];
    if (ws.length === l.t.length) l.t.forEach(function (w, i) { w.w = ws[i]; });
    else { var dur = (l.e - l.s) / ws.length; l.t = ws.map(function (w, i) { return { w: w, s: l.s + i * dur, e: l.s + (i + 1) * dur }; }); }
  }

  // ---------- 3) dibujo de subtítulos (sirve para la vista previa y para exportar) ----------
  function activeLine(t) { var L = S.lines; for (var i = 0; i < L.length; i++) { var end = Math.min(L[i].e + 0.3, i + 1 < L.length ? L[i + 1].s : 1e9); if (t >= L[i].s - 0.05 && t <= end) return { l: L[i], i: i }; } return null; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  var FONT = '"Arial Black","Helvetica Neue",Impact,Arial,sans-serif';
  function drawCaps(c, W, H, t) {
    var a = activeLine(t); if (!a) return; var l = a.l, st = S.style, acc = $('col').value, mid = $('pos').value === 'm';
    var fs = Math.round(H * (st === 'pop' ? 0.085 : st === 'limpio' ? 0.04 : 0.05)); c.font = '900 ' + fs + 'px ' + FONT; c.textBaseline = 'middle'; c.lineJoin = 'round';
    var wi = -1; l.t.forEach(function (w, i) { if (t >= w.s - 0.02) wi = i; });
    var words = l.t.map(function (w) { var s = w.w; return st === 'impacto' || st === 'pop' ? s.toUpperCase() : s; });
    var maxW = W * 0.88;
    if (st === 'pop') {   // una palabra a la vez, con rebote al aparecer
      var w = l.t[Math.max(0, wi)], age = Math.max(0, t - w.s), k = age < 0.14 ? 0.7 + 3 * age * 2.1 : 1 + Math.max(0, 0.06 - (age - 0.14) * 0.3), txt = words[Math.max(0, wi)];
      c.save(); c.translate(W / 2, mid ? H * 0.5 : H * 0.76); c.scale(k, k); c.textAlign = 'center'; c.lineWidth = fs * 0.2; c.strokeStyle = '#000'; c.strokeText(txt, 0, 0); c.fillStyle = acc; c.fillText(txt, 0, 0); c.restore(); return;
    }
    // acomodo en filas
    var sp = c.measureText(' ').width, rows = [[]], rw = 0;
    words.forEach(function (s, i) { var w = c.measureText(s).width; if (rw + w > maxW && rows[rows.length - 1].length) { rows.push([]); rw = 0; } rows[rows.length - 1].push({ s: s, w: w, i: i }); rw += w + sp; });
    var lh = fs * 1.25, total = rows.length * lh, y0 = (mid ? H * 0.5 : H * 0.8) - total / 2 + lh / 2;
    if (st === 'limpio') { c.fillStyle = 'rgba(0,0,0,.62)'; rr(c, W * 0.04, y0 - lh / 2 - fs * 0.25, W * 0.92, total + fs * 0.5, fs * 0.4); c.fill(); }
    rows.forEach(function (row, ri) {
      var tw = row.reduce(function (a, x) { return a + x.w + sp; }, -sp), x = (W - tw) / 2, y = y0 + ri * lh;
      if (st === 'karaoke') { c.fillStyle = 'rgba(0,0,0,.55)'; rr(c, x - fs * 0.4, y - lh / 2, tw + fs * 0.8, lh, fs * 0.35); c.fill(); }
      row.forEach(function (it) {
        var on = it.i === wi && st !== 'limpio'; c.textAlign = 'left';
        if (st === 'karaoke' && on) { c.fillStyle = acc; rr(c, x - fs * 0.12, y - lh * 0.44, it.w + fs * 0.24, lh * 0.88, fs * 0.25); c.fill(); }
        if (st === 'impacto') { c.lineWidth = fs * 0.2; c.strokeStyle = '#000'; c.strokeText(it.s, x, y); }
        c.fillStyle = st === 'karaoke' ? (on ? '#1a1200' : '#fff') : st === 'limpio' ? '#fff' : (on ? acc : '#fff'); c.fillText(it.s, x, y); x += it.w + sp;
      });
    });
  }
  function previewMark(c, W, H) { var fs = Math.round(H * 0.045); c.save(); c.translate(W / 2, H / 2); c.rotate(-0.45); c.font = '800 ' + fs + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(255,255,255,.22)'; c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 2; for (var y = -H; y <= H; y += fs * 3.2) for (var x = -W; x <= W; x += fs * 9) { c.strokeText('Rótulo · vista previa', x + ((y / (fs * 3.2)) % 2 ? fs * 4.5 : 0), y); c.fillText('Rótulo · vista previa', x + ((y / (fs * 3.2)) % 2 ? fs * 4.5 : 0), y); } c.restore(); }

  // ---------- vista previa ----------
  var vid = $('vid'), ov = $('ov'), oc = ov.getContext('2d');
  function sizeOv() { var r = $('stage').getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2); ov.width = Math.round(r.width * d); ov.height = Math.round(r.height * d); }
  function videoBox(W, H) { var vw = vid.videoWidth || 9, vh = vid.videoHeight || 16, k = Math.min(W / vw, H / vh); return { w: vw * k, h: vh * k, x: (W - vw * k) / 2, y: (H - vh * k) / 2 }; }
  var lastLn = -1;
  function loop() {
    oc.clearRect(0, 0, ov.width, ov.height);
    if (!$('editor').hidden) { var b = videoBox(ov.width, ov.height); oc.save(); oc.translate(b.x, b.y); oc.beginPath(); oc.rect(0, 0, b.w, b.h); oc.clip(); drawCaps(oc, b.w, b.h, vid.currentTime); if (!(S.plan && S.plan.ok)) { oc.save(); oc.translate(b.x, b.y); previewMark(oc, b.w, b.h); oc.restore(); } oc.restore();
      $('clock').textContent = fmt(vid.currentTime) + ' / ' + fmt(S.dur); var a = activeLine(vid.currentTime), i = a ? a.i : -1; if (i !== lastLn) { var o = document.querySelector('.ln.on'); if (o) o.classList.remove('on'); if (i >= 0) { var n = $('ln' + i); if (n) { n.classList.add('on'); } } lastLn = i; } }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop); addEventListener('resize', sizeOv);
  $('play').onclick = function () { if (vid.paused) { vid.muted = false; if (vid.currentTime >= S.dur - 0.1) vid.currentTime = 0; vid.play(); $('play').textContent = '❚❚ Pausa'; } else { vid.pause(); $('play').textContent = '▶ Ver'; } };
  vid.onended = vid.onpause = function () { $('play').textContent = '▶ Ver'; };

  // ---------- flujo ----------
  function pick(f) {
    err(''); if (!f) return; if (f.size > 250 * 1048576) return err('El archivo pesa demasiado (máximo 250 MB).');
    S.file = f; S.spent = false; if (S.url) URL.revokeObjectURL(S.url); S.url = URL.createObjectURL(f); vid.src = S.url; vid.muted = true;
    $('s1').hidden = true; busy(true, 'Leyendo tu video…'); $('editor').hidden = true;
    vid.onloadedmetadata = function () {
      S.dur = vid.duration; if (!isFinite(S.dur) || S.dur < 1) return fail('No pude leer este video.');
      if (S.dur > MAX_SEC) return fail('Tu video dura ' + Math.round(S.dur) + ' s. Por ahora el máximo es ' + MAX_SEC + ' segundos.');
      $('stage').classList.toggle('land', vid.videoWidth > vid.videoHeight);
      busy(true, 'Sacando el audio…');
      extractAudio(f).then(function (a) { busy(true, 'Escuchando y escribiendo… (unos segundos)'); return b64(a.blob).then(function (d) { return fetch('/.netlify/functions/rot-transcribir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: d, dur: a.dur, lang: 'es', codigo: S.plan && S.plan.ok ? S.code : undefined }) }); }); })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) { if (j.codigo) { S.plan = null; showPlan(); } throw new Error(j.error || 'Error'); } return j; }); })
        .then(function (j) { if (!j.words || !j.words.length) return fail(j.aviso || 'No se escuchó voz en el video.'); S.lines = toLines(j.words); if (j.restantes != null && S.plan) { S.plan.restantes = j.restantes; S.plan.ok = j.restantes > 0 || true; showPlan(); } track('rot_transcribed', { words: j.words.length, precise: !!j.preciso }); ready(); })
        .catch(function (e) { fail(/decode|EncodingError|null/i.test(String(e && e.message)) || !e.message ? 'No pude leer el audio de este video. Prueba con un MP4 normal.' : e.message); });
    };
    vid.onerror = function () { fail('Este formato de video no se puede abrir aquí. Prueba con MP4.'); };
  }
  function fail(m) { $('s2').hidden = true; $('s1').hidden = false; err(m); $('file').value = ''; }
  function ready() { $('busy').hidden = true; $('editor').hidden = false; sizeOv(); renderLines(); vid.currentTime = 0.01; }
  $('file').onchange = function (e) { pick(e.target.files[0]); };
  Object.keys(STYLES).forEach(function (k) { var b = document.createElement('button'); b.className = 'st' + (k === S.style ? ' on' : ''); b.textContent = STYLES[k]; b.onclick = function () { S.style = k; document.querySelectorAll('.st').forEach(function (x) { x.classList.toggle('on', x === b); }); }; $('styles').appendChild(b); });

  // ---------- exportar (todo ocurre en el navegador) ----------
  function pickMime() { var c = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']; for (var i = 0; i < c.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i]; return ''; }
  function doExport() {
    if (!window.MediaRecorder) return err('Tu navegador no puede exportar video. Prueba con Chrome o Safari actualizado.');
    vid.pause(); $('exp').disabled = true; $('dl').hidden = true; $('prog').hidden = false; $('progt').textContent = 'Preparando…';
    var v = document.createElement('video'); v.src = S.url; v.playsInline = true; v.preload = 'auto';
    v.onloadedmetadata = function () {
      var k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)), W = Math.round(v.videoWidth * k / 2) * 2, H = Math.round(v.videoHeight * k / 2) * 2, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d');
      var AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), src = ac.createMediaElementSource(v), dest = ac.createMediaStreamDestination(); src.connect(dest);
      var stream = cv.captureStream(30); dest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
      var mime = pickMime(), rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : {}), chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        var type = (rec.mimeType || mime || 'video/webm').split(';')[0], blob = new Blob(chunks, { type: type }), a = $('dl'); a.href = URL.createObjectURL(blob); a.download = 'rotulo-video.' + (type.indexOf('mp4') >= 0 ? 'mp4' : 'webm'); a.textContent = 'Guardar video (' + (blob.size / 1048576).toFixed(1) + ' MB)'; a.hidden = false;
        $('prog').hidden = true; $('exp').disabled = false; try { ac.close(); } catch (e) {} track('rot_exported', { style: S.style, mime: type });
      };
      var draw = function () { c.drawImage(v, 0, 0, W, H); drawCaps(c, W, H, v.currentTime); var p = v.currentTime / (v.duration || 1); $('prog').firstElementChild.style.width = (p * 100) + '%'; $('progt').textContent = 'Creando tu video… ' + Math.round(p * 100) + ' %'; if (!v.ended) requestAnimationFrame(draw); };
      v.onended = function () { setTimeout(function () { rec.stop(); }, 250); };
      ac.resume().then(function () { rec.start(500); v.currentTime = 0; return v.play(); }).then(function () { requestAnimationFrame(draw); }).catch(function () { rec.state !== 'inactive' && rec.stop(); err('No se pudo exportar en este navegador.'); $('exp').disabled = false; $('prog').hidden = true; });
    };
  };

  // Descargar exige un plan con saldo. El servidor descuenta UN video por descarga (rot-exportar); re-exportar el mismo video con otro estilo no vuelve a cobrar.
  $('exp').onclick = function () {
    err(''); if (!(S.plan && S.plan.ok)) return openPay();
    if (S.spent) return doExport();
    $('exp').disabled = true;
    post('rot-exportar', { codigo: S.code }).then(function (d) { S.spent = true; S.plan.restantes = d.restantes; S.plan.ok = true; showPlan(); doExport(); })
      .catch(function (e) { $('exp').disabled = false; if (e.data) { S.plan = null; showPlan(); } err(e.message || 'No se pudo autorizar la descarga.'); openPay(); });
  };
  // ---------- cobro: planes, PayPal y códigos ----------
  function post(fn, body) { return fetch('/.netlify/functions/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Error'); e.data = j; throw e; } return j; }); }); }
  function showPlan() {
    var p = S.plan, el = $('plan'), has = p && p.ok;
    $('exph').hidden = !!has; el.hidden = !has; $('exp').textContent = has ? 'Descargar video' : 'Desbloquear y descargar';
    if (has) el.textContent = (p.tipo === 'mensual' ? 'Plan mensual activo' : 'Paquete activo') + ' · ' + p.restantes + ' video' + (p.restantes === 1 ? '' : 's') + ' disponible' + (p.restantes === 1 ? '' : 's') + (p.vence ? ' · vence el ' + new Date(p.vence).toLocaleDateString('es-CR') : '');
  }
  function useCode(code, quiet) {
    return post('rot-codigo', { codigo: code }).then(function (e) { S.code = code; S.plan = e; try { localStorage.setItem(CODE_KEY, code); } catch (x) {} showPlan(); if (!e.ok) throw new Error(e.restantes <= 0 ? 'A ese código ya no le quedan videos.' : 'Ese código ya venció.'); return e; });
  }
  var CFG = null, ppLoad = null;
  function cfg() { return CFG || (CFG = fetch('/.netlify/functions/rot-config').then(function (r) { return r.json(); })); }
  function loadPayPal(id) { if (window.paypal) return Promise.resolve(); if (ppLoad) return ppLoad; ppLoad = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(id) + '&currency=USD&components=buttons&intent=capture'; s.onload = ok; s.onerror = function () { ppLoad = null; no(new Error('load')); }; document.head.appendChild(s); }); return ppLoad; }
  function perr(m) { var e = $('perr'); e.textContent = m || ''; e.hidden = !m; }
  function openPay() {
    track('rot_nomark_click'); perr(''); $('cmsg').textContent = ''; $('pay').hidden = false; $('done').hidden = true; $('pp').innerHTML = ''; $('dlg').showModal();
    cfg().then(function (c) { var box = $('plans'); box.innerHTML = ''; Object.keys(c.planes).forEach(function (k) { var p = c.planes[k], b = document.createElement('button'); b.className = 'plan'; b.innerHTML = '<span><b>' + p.nombre + '</b><small>' + p.detalle + '</small></span><span class="pr">US$' + p.usd + '<small>' + (p.crc ? '≈ ₡' + String(p.crc).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : 'pago único') + '</small></span>'; b.onclick = function () { choose(p, b, c); }; box.appendChild(b); }); });
  }
  function choose(p, btn, c) {
    document.querySelectorAll('.plan').forEach(function (x) { x.classList.toggle('on', x === btn); }); perr(''); $('pp').textContent = 'Cargando el pago seguro…'; track('rot_plan_pick', { plan: p.id });
    if (!c.paypalClientId) { $('pp').textContent = ''; return perr('El pago no está disponible ahora. Inténtalo en un rato.'); }
    loadPayPal(c.paypalClientId).then(function () {
      $('pp').innerHTML = '';
      window.paypal.Buttons({ style: { layout: 'vertical', shape: 'pill', label: 'pay', tagline: false },
        createOrder: function () { perr(''); return post('rot-pay-create', { plan: p.id }).then(function (d) { return d.orderID; }); },
        onApprove: function (data) { $('pp').textContent = 'Confirmando tu pago…'; return post('rot-pay-capture', { orderID: data.orderID }).then(function (d) { $('pp').textContent = ''; track('rot_paid', { plan: p.id }); S.code = d.codigo; S.plan = { ok: true, tipo: d.tipo, restantes: d.restantes, vence: d.vence }; try { localStorage.setItem(CODE_KEY, d.codigo); } catch (x) {} showPlan(); $('pay').hidden = true; $('done').hidden = false; $('codeshow').textContent = d.codigo; $('codeinfo').textContent = d.restantes + ' videos disponibles. También te lo enviamos al correo de PayPal.'; }).catch(function (e) { $('pp').textContent = ''; perr((e.message || 'No pudimos confirmar tu pago.') + ' Si te cobraron, escríbeme con tu comprobante de PayPal y te doy tu código.'); }); },
        onError: function () { perr('No se pudo completar el pago. No se te cobró. Inténtalo de nuevo.'); } }).render('#pp');
    }).catch(function () { $('pp').textContent = ''; perr('No se pudo cargar PayPal. Revisa tu conexión.'); });
  }
  $('nomark').onclick = function (e) { e.preventDefault(); openPay(); };
  $('closed').onclick = $('closed2').onclick = function (e) { e.preventDefault(); $('dlg').close(); };
  $('copyc').onclick = function () { try { navigator.clipboard.writeText($('codeshow').textContent); $('copyc').textContent = '¡Copiado!'; } catch (e) {} };
  $('usecod').onclick = function () { var c = $('cod').value.trim().toUpperCase(); if (!c) return; $('cmsg').textContent = 'Revisando…'; useCode(c).then(function (e) { $('cmsg').textContent = '¡Código activo! Te quedan ' + e.restantes + ' videos.'; track('rot_code_used'); setTimeout(function () { $('dlg').close(); }, 1200); }).catch(function (e) { $('cmsg').textContent = e.message; }); };
  try { var saved = localStorage.getItem(CODE_KEY); if (saved) useCode(saved, true).catch(function () {}); } catch (e) {}
})();
