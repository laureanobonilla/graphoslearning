// Piezas compartidas de las 3 apps de canciones. Cada página llama CS.mountOrder() con su configuración.
// Archivos: van directo del navegador a Cloudinary (privado, firma en cs-sign-upload); el pedido final se manda a cs-submit.
(function () {
'use strict';
const TRACK_URL = '/.netlify/functions/sfc-track-event', SVGNS = 'http://www.w3.org/2000/svg';
const CS = window.CS = {};
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---------- Identidad, UTM, eventos ----------
CS.anonId = (function () {
  try { let id = localStorage.getItem('tc_anon_id'); if (!id) { id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem('tc_anon_id', id); } return id; }
  catch { return `volatile-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
})();
CS.UTM = (function () {
  const clean = (v) => String(v || '').replace(/[^\w.\-]/g, '').slice(0, 40);
  try {
    const q = new URLSearchParams(location.search), c = clean(q.get('utm_campaign') || q.get('c')), a = clean(q.get('utm_content') || q.get('ad'));
    if (c || a) { const v = { campaign: c, ad: a }; localStorage.setItem('tc_utm', JSON.stringify(v)); return v; }
    const old = JSON.parse(localStorage.getItem('tc_utm') || 'null'); return old && typeof old === 'object' ? { campaign: clean(old.campaign), ad: clean(old.ad) } : { campaign: '', ad: '' };
  } catch { return { campaign: '', ad: '' }; }
})();
CS.track = function (app, event, metadata) {
  try { fetch(TRACK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ event, anonId: CS.anonId, app, metadata: Object.assign({}, metadata || {}, CS.UTM.campaign ? { campaign: CS.UTM.campaign } : {}, CS.UTM.ad ? { ad: CS.UTM.ad } : {}) }) }).catch(() => {}); } catch { /* no crítico */ }
};
CS.postFn = async function (name, payload) {
  const res = await fetch(`/.netlify/functions/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { status: res.status });
  return data;
};
CS.newId = () => (crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${String(Date.now()).padStart(12, '0')}`);
CS.cur = { code: 'CRC', symbol: '₡', perCrc: 1, step: 100, dots: true };
// Precio base en colones → texto en la moneda del país de la persona (redondeo hacia arriba al «step» de esa moneda).
CS.show = function (crc) { const c = CS.cur, n = c.code === 'CRC' ? Math.ceil(crc / 100 - 1e-9) * 100 : Math.ceil((crc * c.perCrc) / c.step - 1e-9) * c.step; return c.symbol + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, c.dots ? '.' : ','); };
CS.money = (n) => '₡' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
CS.loadConfig = (app) => fetch(`/.netlify/functions/cs-config?app=${encodeURIComponent(app)}${/^[A-Za-z]{2}$/.test(new URLSearchParams(location.search).get('pais') || '') ? '&pais=' + new URLSearchParams(location.search).get('pais') : ''}`, { cache: 'no-store' }).then(r => r.json()).then(d => { if (d && d.app && d.cur) CS.cur = d.cur; return d && d.app ? d : null; }).catch(() => null);
CS.fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ---------- Onda decorativa ----------
CS.drawWave = function (svg) {
  const defs = document.createElementNS(SVGNS, 'defs');
  defs.innerHTML = '<linearGradient id="coverGrad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#e0246a"/><stop offset="1" stop-color="#ffbf2e"/></linearGradient>';
  svg.appendChild(defs);
  const n = 48, w = 320, h = 92, barW = 4.2, gap = (w - n * barW) / (n - 1);
  for (let i = 0; i < n; i++) {
    const v = Math.abs(Math.sin(i * 0.52 + 1.3) + 0.65 * Math.sin(i * 1.31 + 2.2) + 0.35 * Math.sin(i * 2.9 + 1.3)), p = Math.max(0.12, Math.min(1, v / 1.9)), bh = Math.max(4, p * h);
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('x', (i * (barW + gap)).toFixed(2)); r.setAttribute('y', ((h - bh) / 2).toFixed(2)); r.setAttribute('width', barW); r.setAttribute('height', bh.toFixed(2)); r.setAttribute('rx', barW / 2); r.setAttribute('fill', 'url(#coverGrad)'); r.style.setProperty('--i', i); svg.appendChild(r);
  }
};

// ---------- Teléfono ----------
const SONG_TZ_DIAL = { 'America/Costa_Rica': '+506', 'America/Montevideo': '+598', 'America/Mexico_City': '+52', 'America/Cancun': '+52', 'America/Monterrey': '+52', 'America/Tijuana': '+52', 'America/Argentina/Buenos_Aires': '+54', 'America/Bogota': '+57', 'America/Santiago': '+56', 'America/Lima': '+51', 'America/Guayaquil': '+593', 'America/Panama': '+507', 'America/Guatemala': '+502', 'America/El_Salvador': '+503', 'America/Tegucigalpa': '+504', 'America/Managua': '+505', 'America/Caracas': '+58', 'America/La_Paz': '+591', 'America/Asuncion': '+595', 'Europe/Madrid': '+34' };
CS.guessDial = function () { try { return SONG_TZ_DIAL[Intl.DateTimeFormat().resolvedOptions().timeZone] || '+506'; } catch { return '+506'; } };
CS.buildPhone = function (dial, raw) {
  let n = String(raw || '').replace(/[\s().\-]/g, '');
  if (!n) return { phone: '', reason: 'empty' };
  if (n.startsWith('00')) n = '+' + n.slice(2);
  const ok = (v) => /^\+[1-9]\d{7,14}$/.test(v);
  if (n.startsWith('+')) return ok(n) ? { phone: n, reason: '' } : { phone: '', reason: n.length < 9 ? 'short' : 'long' };
  if (/\D/.test(n)) return { phone: '', reason: 'short' };
  if (!dial) return { phone: '', reason: 'nodial' };
  const dd = dial.slice(1); n = n.replace(/^0+/, '');
  if (n.startsWith(dd) && n.length >= dd.length + 8 && n.length <= 15 && ok('+' + n)) return { phone: '+' + n, reason: '' };
  const full = dial + n; return ok(full) ? { phone: full, reason: '' } : { phone: '', reason: n.length + dial.length < 9 ? 'short' : 'long' };
};
CS.PHONE_MSG = { empty: 'Falta tu número.', short: 'Al número le faltan dígitos. Escríbelo completo, por ejemplo 8888 1234.', long: 'El número tiene demasiados dígitos. Revisa el código de país.', nodial: 'Elige tu país en la lista o escribe el número con + y el código.' };
CS.validEmail = (s) => /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[A-Za-z]{2,}$/.test(String(s || '').trim());
const DIAL_OPTIONS = '<option value="+506">CR +506</option><option value="+598">UY +598</option><option value="+52">MX +52</option><option value="+54">AR +54</option><option value="+57">CO +57</option><option value="+56">CL +56</option><option value="+51">PE +51</option><option value="+593">EC +593</option><option value="+507">PA +507</option><option value="+502">GT +502</option><option value="+503">SV +503</option><option value="+504">HN +504</option><option value="+505">NI +505</option><option value="+58">VE +58</option><option value="+591">BO +591</option><option value="+595">PY +595</option><option value="+34">ES +34</option><option value="+1">US/CA/RD +1</option><option value="">Otro (escribe +código)</option>';

// ---------- Archivos ----------
const EXT_TYPE = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm', mp4: 'video/mp4', mov: 'video/quicktime', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
CS.typeOf = function (file) { const t = String(file.type || '').split(';')[0].toLowerCase(); if (t) return t; const m = /\.([a-z0-9]+)$/i.exec(file.name || ''); return (m && EXT_TYPE[m[1].toLowerCase()]) || ''; };
CS.audioDuration = (blob) => new Promise((resolve) => {
  const a = new Audio(), url = URL.createObjectURL(blob); let done = false;
  const fin = (v) => { if (done) return; done = true; try { URL.revokeObjectURL(url); } catch { /* ok */ } resolve(v); };
  a.preload = 'metadata';
  a.addEventListener('loadedmetadata', () => { if (isFinite(a.duration) && a.duration > 0) fin(a.duration); else { a.currentTime = 1e7; a.addEventListener('timeupdate', () => fin(isFinite(a.duration) ? a.duration : null), { once: true }); } });
  a.addEventListener('error', () => fin(null));
  setTimeout(() => fin(null), 6000);
  a.src = url;
});
// Foto: se reduce a 1600 px y JPG (más rápido de subir y sin sorpresas con formatos raros).
CS.prepPhoto = async function (file) {
  let bmp = null;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    bmp = await new Promise((res, rej) => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { res(img); }; img.onerror = () => rej(new Error('decode')); img.src = u; });
  }
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight, k = Math.min(1, 1600 / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
  if (!blob) throw new Error('encode');
  return blob;
};
// Sube a Cloudinary con la firma del servidor (función `fn`, con su `payload`). onProgress(0..1).
CS.uploadWith = async function (fn, payload, blob, onProgress, fileName) {
  const sig = await CS.postFn(fn, Object.assign({ size: blob.size, contentType: CS.typeOf(blob) }, payload));
  const fd = new FormData();
  fd.append('file', blob, fileName || blob.csName || blob.name || 'audio');
  fd.append('api_key', sig.apiKey); fd.append('timestamp', sig.timestamp); fd.append('signature', sig.signature); fd.append('public_id', sig.publicId); fd.append('type', sig.type);
  await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open('POST', sig.uploadUrl);
    x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(Object.assign(new Error('No se pudo subir el archivo. Inténtalo de nuevo.'), { status: x.status })));
    x.onerror = () => reject(new Error('Se cortó la conexión al subir el archivo. Inténtalo de nuevo.'));
    x.send(fd);
  });
  return { publicId: sig.publicId };
};
CS.upload = async function (app, kind, orderId, blob, onProgress) {
  const contentType = kind === 'photo' ? 'image/jpeg' : CS.typeOf(blob);
  const sig = { app, kind, orderId, contentType };
  return CS.uploadWith('cs-sign-upload', sig, Object.assign(blob, {}), onProgress, kind === 'photo' ? 'foto.jpg' : undefined);
};

// ---------- Formulario de pedido ----------
// opts: { app, cfg, root, videoCopy, getExtra(): objeto con letra/brief (app 3), onDone(res) }
CS.mountOrder = function (opts) {
  const { app, cfg, root } = opts;
  const st = { orderId: opts.orderId || CS.newId(), audio: null, audioSeconds: null, audioUp: null, video: null, photo: null, photoUp: null, rec: null };
  const hasAudio = !!cfg.audio, canVideo = !!cfg.video;
  root.textContent = '';
  const form = el('form', 'cs-form'); form.noValidate = true; root.appendChild(form);

  // 1) Audio
  let audioCard = null;
  if (hasAudio) {
    audioCard = el('div', 'cs-card', `<h3>Sube o graba tu canto</h3><p>Sube o graba tu canto completo para ponerle música. Puedes mandar solo tu voz cantando y también puedes acompañarte con algún instrumento si quisieras. De ${cfg.minAudioSec || 30} segundos hasta ${cfg.maxAudioMin} minutos.</p>
      <div class="cs-file cs-file-audio"><button type="button" class="btn btn-rec" data-a="rec"><i></i>Grabar ahora</button><button type="button" class="btn-quiet cs-pick-file" data-a="pick">o elige un audio que ya tengas</button><input type="file" accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.opus,.flac,.webm" data-a="file"></div>
      <div class="cs-rec is-hidden" data-a="recbox"><i></i><span data-a="rect">0:00</span><button type="button" class="btn btn-primary" data-a="stop" style="margin-left:auto;padding:9px 18px">Detener</button></div>
      <div class="cs-chosen is-hidden" data-a="chosen"><span class="nm" data-a="nm"></span><span class="meta" data-a="meta"></span><button type="button" class="btn-quiet" data-a="del">Quitar</button></div>
      <audio class="cs-player is-hidden" controls data-a="player"></audio><p class="cs-err is-hidden" data-a="err" role="alert"></p>`);
    form.appendChild(audioCard);
  }
  const A = (n) => audioCard && audioCard.querySelector(`[data-a="${n}"]`);

  // 2) Video
  let videoCard = null;
  if (canVideo) {
    videoCard = el('div', 'cs-card', `<h3>¿Quieres también el video?</h3><p>${opts.videoCopy || 'El video eres tú cantando tu canción. Por eso necesitamos una foto clara de tu rostro.'}</p>
      <div class="cs-pick" role="radiogroup" aria-label="¿Quieres video?">
        <label class="opt"><input type="radio" name="csvideo" value="no"><span>Solo la canción</span></label>
        <label class="opt"><input type="radio" name="csvideo" value="yes"><span>Canción con video<small>En el video saldrías tú cantando la canción</small></span></label>
      </div>
      <div class="is-hidden" data-v="photoBox" style="margin-top:12px">
        <p class="strong">Sube una foto de tu rostro, de frente y con buena luz. Sin foto de tu rostro no podemos hacer el video.</p>
        <div class="cs-file"><button type="button" class="btn btn-primary" data-v="pick">Elegir foto</button><button type="button" class="btn btn-ghost" data-v="cam">Tomarme una foto</button>
          <input type="file" accept="image/*" data-v="file"><input type="file" accept="image/*" capture="user" data-v="cfile"></div>
        <div class="cs-photo is-hidden" data-v="prev"><img alt="Tu foto" data-v="img"><button type="button" class="btn-quiet" data-v="del">Quitar foto</button></div>
        <label class="ack" style="margin-top:10px"><input type="checkbox" data-v="consent"><span>La foto es mía, o la persona me dio permiso de usarla. Se usa solo para hacer este video.</span></label>
        <p class="cs-err is-hidden" data-v="err" role="alert"></p>
      </div>`);
    form.appendChild(videoCard);
  }
  const V = (n) => videoCard && videoCard.querySelector(`[data-v="${n}"]`);

  // 3) Contacto
  const contact = el('div', 'cs-card', `<h3>¿Dónde te enviamos la muestra?</h3><p>Déjanos tu WhatsApp o tu correo (con uno basta).</p>
    <label class="cs-lbl" for="csName">Tu nombre (opcional)</label><input class="cs-field" id="csName" type="text" maxlength="60" autocomplete="given-name" placeholder="Cómo te llamas">
    <label class="cs-lbl" for="csPhone">WhatsApp</label>
    <div class="phone-row"><select id="csDial" aria-label="Código de país">${DIAL_OPTIONS}</select><input id="csPhone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="Ej. 8888 1234" maxlength="24"></div>
    <p class="cs-or">o</p>
    <label class="cs-lbl" for="csEmail">Correo</label><input class="cs-field" id="csEmail" type="email" inputmode="email" autocomplete="email" placeholder="tu@correo.com" maxlength="120">
    <p class="cs-fine">Solo lo usamos para enviarte la muestra. No lo compartimos.</p>`);
  form.appendChild(contact);
  contact.querySelector('#csDial').value = CS.guessDial();

  // 4) Notas
  const notes = el('div', 'cs-card', `<h3>¿Algo que debamos saber?</h3><p>Opcional: el ritmo que imaginas, instrumentos, para quién es…</p><textarea class="cs-field" id="csNotes" maxlength="1200" placeholder="Escríbelo con tus palabras"></textarea>`);
  form.appendChild(notes);

  // 5) Precio + confirmación
  let ready = false;   // el precio solo se muestra, ya calculado, dentro de la casilla de confirmación
  const ack = el('label', 'ack', '<input type="checkbox" id="csAck"><span id="csAckTxt"></span>'); form.appendChild(ack);
  const errBox = el('p', 'cs-err is-hidden'); errBox.setAttribute('role', 'alert'); form.appendChild(errBox);
  const prog = el('div', 'cs-prog is-hidden', '<div class="track"><i></i></div><p></p>'); form.appendChild(prog);
  const submit = el('button', 'btn btn-primary cs-submit', opts.submitLabel || 'Enviar y recibir mi muestra'); submit.type = 'submit'; form.appendChild(submit);
  form.appendChild(el('p', 'cs-fine', 'Al enviar aceptas que usemos tu audio, letra y foto solo para preparar tu muestra.'));

  const priceFor = (sec, per) => Math.max(100, Math.ceil(Math.round((sec > 0 ? sec / 60 : 1) * per) / 100 - 1e-9) * 100);   // proporcional, hacia arriba a ₡100
  function calc() {
    ready = (!hasAudio || !!st.audio) && (!canVideo || !!st.video);
    ack.classList.toggle('is-hidden', !ready);
    if (!ready) return;
    const withVideo = st.video === 'yes';
    let amount, amtTxt, lbl = withVideo ? 'Canción con video' : 'Solo la canción', calcTxt = '', ackTxt;
    if (hasAudio) {
      const per = withVideo ? cfg.perMinuteVideo : cfg.perMinute;
      if (st.audioSeconds) {
        amount = priceFor(st.audioSeconds, per); amtTxt = CS.show(amount);
        ackTxt = `Entiendo que el precio será ${amtTxt}. No se me cobra nada hasta que reciba y escuche una muestra.`;
      } else {
        amtTxt = `${CS.show(per)} por minuto`; calcTxt = 'Calcularemos el total con la duración exacta y te lo confirmamos.';
        ackTxt = `Entiendo que el precio es ${CS.show(per)} por minuto. No se me cobra nada hasta que reciba y escuche una muestra.`;
      }
    } else {
      amount = withVideo ? cfg.flatVideo : cfg.flat; amtTxt = CS.show(amount);
      calcTxt = withVideo ? 'Nosotros ponemos la voz; el video eres tú cantando.' : 'Nosotros ponemos la voz.';
      ackTxt = `Entiendo que el precio será ${amtTxt}. No se me cobra nada hasta que reciba y escuche una muestra.`;
    }
    ack.querySelector('#csAckTxt').textContent = ackTxt;
  }
  calc();

  const setErr = (node, msg) => { node.textContent = msg || ''; node.classList.toggle('is-hidden', !msg); };

  // ----- Audio: elegir / grabar -----
  async function setAudio(blob, name, knownSeconds) {
    setErr(A('err'), '');
    const type = CS.typeOf(blob);
    if (!/^audio\//.test(type)) { setErr(A('err'), 'Ese archivo no parece un audio. Prueba con mp3, m4a o wav.'); return; }
    if (blob.size > 60 * 1024 * 1024) { setErr(A('err'), 'El audio es muy pesado (máximo 60 MB).'); return; }
    const sec = knownSeconds || await CS.audioDuration(blob);
    if (sec && sec > cfg.maxAudioMin * 60 + 2) { setErr(A('err'), `Tu audio dura ${CS.fmtTime(sec)} y el máximo es ${cfg.maxAudioMin} minutos. Envía un fragmento más corto.`); return; }
    const minSec = cfg.minAudioSec || 30;
    if (sec && sec < minSec - 0.5) { setErr(A('err'), `Tu audio dura ${Math.round(sec)} segundos. Necesitamos al menos ${minSec} segundos de tu canto: graba o sube uno más largo.`); return; }
    st.audio = blob; st.audio.csName = name; st.audioSeconds = sec ? Math.round(sec) : null; st.audioUp = null;
    A('nm').textContent = name; A('meta').textContent = sec ? CS.fmtTime(sec) : ''; A('chosen').classList.remove('is-hidden');
    const pl = A('player'); try { if (pl.src) URL.revokeObjectURL(pl.src); } catch { /* ok */ } pl.src = URL.createObjectURL(blob); pl.classList.remove('is-hidden');
    A('pick').textContent = 'o elige otro audio'; calc(); refreshMissing(); CS.track(app, 'audio_chosen', { seconds: st.audioSeconds || 0, kb: Math.round(blob.size / 1024) });
  }
  function clearAudio() { st.audio = null; st.audioSeconds = null; st.audioUp = null; A('chosen').classList.add('is-hidden'); const pl = A('player'); pl.pause(); pl.removeAttribute('src'); pl.classList.add('is-hidden'); A('pick').textContent = 'o elige un audio que ya tengas'; A('file').value = ''; calc(); refreshMissing(); }
  if (hasAudio) {
    A('pick').addEventListener('click', () => A('file').click());
    A('file').addEventListener('change', () => { const f = A('file').files[0]; if (f) setAudio(f, f.name || 'audio'); });
    A('del').addEventListener('click', clearAudio);
    const canRec = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    if (!canRec) { A('rec').classList.add('is-hidden'); A('pick').classList.add('cs-pick-main'); }
    let timer = null;
    const stopRec = () => { if (st.rec && st.rec.mr.state !== 'inactive') st.rec.mr.stop(); };
    A('rec').addEventListener('click', async () => {
      setErr(A('err'), '');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mt = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
        const mr = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined), chunks = [], t0 = Date.now();
        st.rec = { mr };
        mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onstop = () => {
          clearInterval(timer); stream.getTracks().forEach(t => t.stop()); A('recbox').classList.add('is-hidden'); A('rec').classList.remove('is-hidden');
          const type = (mr.mimeType || mt || 'audio/webm').split(';')[0], ext = /mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
          const blob = new Blob(chunks, { type }); st.rec = null;
          if (blob.size > 2000) setAudio(blob, `grabacion.${ext}`, Math.max(1, (Date.now() - t0) / 1000));
        };
        mr.start(1000); A('recbox').classList.remove('is-hidden'); A('rec').classList.add('is-hidden');
        timer = setInterval(() => { const s = (Date.now() - t0) / 1000; A('rect').textContent = CS.fmtTime(s); if (s >= cfg.maxAudioMin * 60) stopRec(); }, 500);
        CS.track(app, 'record_started', {});
      } catch { setErr(A('err'), 'No pudimos usar el micrófono. Revisa el permiso de tu navegador o sube un audio.'); }
    });
    A('stop').addEventListener('click', stopRec);
  }

  // ----- Video / foto -----
  if (canVideo) {
    const radios = videoCard.querySelectorAll('input[name="csvideo"]');
    radios.forEach(r => r.addEventListener('change', () => {
      st.video = r.value; videoCard.querySelectorAll('.cs-pick .opt').forEach(o => o.classList.toggle('on', o.querySelector('input').checked));
      V('photoBox').classList.toggle('is-hidden', st.video !== 'yes'); calc(); CS.track(app, 'video_choice', { video: st.video === 'yes' });
    }));
    const onPhoto = async (f) => {
      setErr(V('err'), ''); if (!f) return;
      try {
        const blob = await CS.prepPhoto(f);
        st.photo = blob; st.photoUp = null; const img = V('img'); try { if (img.src) URL.revokeObjectURL(img.src); } catch { /* ok */ } img.src = URL.createObjectURL(blob); V('prev').classList.remove('is-hidden');
        CS.track(app, 'photo_chosen', { kb: Math.round(blob.size / 1024) });
      } catch { setErr(V('err'), 'No pudimos leer esa foto. Prueba con otra en JPG o PNG.'); }
    };
    V('pick').addEventListener('click', () => V('file').click()); V('cam').addEventListener('click', () => V('cfile').click());
    V('file').addEventListener('change', () => onPhoto(V('file').files[0])); V('cfile').addEventListener('change', () => onPhoto(V('cfile').files[0]));
    V('del').addEventListener('click', () => { st.photo = null; st.photoUp = null; V('prev').classList.add('is-hidden'); V('file').value = ''; V('cfile').value = ''; });
  }

  // ----- Enviar -----
  // Qué falta ahora mismo (se usa al enviar y para quitar el aviso "Te falta" en cuanto la persona lo completa).
  function computeMissing() {
    const withVideo = canVideo && st.video === 'yes';
    const rawPhone = contact.querySelector('#csPhone').value.trim(), email = contact.querySelector('#csEmail').value.trim();
    const missing = [];   // [texto, nodo donde está]
    if (hasAudio && !st.audio) missing.push(['tu canto (sube o graba el audio)', audioCard]);
    if (canVideo && !st.video) missing.push(['elegir si quieres solo la canción o también el video', videoCard]);
    if (withVideo && !st.photo) missing.push(['la foto de tu rostro para el video', videoCard]);
    if (withVideo && st.photo && !V('consent').checked) missing.push(['confirmar que la foto es tuya o que tienes permiso', videoCard]);
    if (!rawPhone && !email) missing.push(['tu WhatsApp o tu correo', contact]);
    const ackMissing = ready && !ack.querySelector('input').checked;
    return { withVideo, rawPhone, email, missing, ackMissing };
  }
  function refreshMissing() {
    if (errBox.classList.contains('is-hidden') || !/^Te falta/.test(errBox.textContent)) return;
    const { missing, ackMissing } = computeMissing();
    if (!missing.length && !ackMissing) return setErr(errBox, '');
    const list = missing.map(m => m[0]); if (ackMissing && missing.length) list.push('marcar la casilla del precio');
    if (!missing.length && ackMissing) list.push('marcar la casilla del precio');
    setErr(errBox, 'Te falta: ' + list.join('; ') + '.');
  }
  form.addEventListener('input', refreshMissing); form.addEventListener('change', refreshMissing);
  setInterval(refreshMissing, 500);   // cubre lo que se completa de forma asíncrona (grabación, foto)
  function fail(msg, node) { setErr(errBox, msg); errBox.classList.remove('is-hidden'); try { (node || errBox).scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* ok */ } }
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); setErr(errBox, '');
    const { withVideo, rawPhone, email, missing, ackMissing } = computeMissing();
    if (missing.length) { if (ackMissing) missing.push(['marcar la casilla del precio', ack]); return fail('Te falta: ' + missing.map(m => m[0]).join('; ') + '.', missing[0][1]); }
    let phone = '';
    if (rawPhone) { const pr = CS.buildPhone(contact.querySelector('#csDial').value, rawPhone); if (!pr.phone) { CS.track(app, 'phone_invalid', { reason: pr.reason }); return fail(CS.PHONE_MSG[pr.reason] || CS.PHONE_MSG.short, contact); } phone = pr.phone; }
    if (email && !CS.validEmail(email)) return fail('Revisa tu correo: parece que le falta algo.', contact);
    if (ackMissing) return fail('Te falta: marcar la casilla del precio.', ack);
    let extra = {};
    if (opts.getExtra) { try { extra = opts.getExtra() || {}; } catch (e) { return fail(e.message || 'Falta información.'); } }

    submit.disabled = true; submit.textContent = 'Enviando…'; CS.track(app, 'submit_clicked', { video: withVideo, seconds: st.audioSeconds || 0 });
    prog.classList.remove('is-hidden');
    const bar = prog.querySelector('i'), msg = prog.querySelector('p');
    const parts = (hasAudio ? 1 : 0) + (withVideo ? 1 : 0); let doneParts = 0;
    const setProg = (label, frac) => { bar.style.width = `${Math.round(((doneParts + frac) / Math.max(1, parts + 0.2)) * 100)}%`; msg.textContent = label; };
    try {
      if (hasAudio && !st.audioUp) { setProg('Subiendo tu audio…', 0); st.audioUp = await CS.upload(app, 'audio', st.orderId, st.audio, (f) => setProg('Subiendo tu audio…', f)); }
      if (hasAudio) doneParts = 1;
      if (withVideo && !st.photoUp) { setProg('Subiendo tu foto…', 0); st.photoUp = await CS.upload(app, 'photo', st.orderId, st.photo, (f) => setProg('Subiendo tu foto…', f)); }
      if (withVideo) doneParts = parts;
      setProg('Enviando tu pedido…', 0.1);
      const res = await CS.postFn('cs-submit', Object.assign({ app, orderId: st.orderId, anonId: CS.anonId, utm: CS.UTM, phone, email, contactName: contact.querySelector('#csName').value.trim(), notes: notes.querySelector('#csNotes').value.trim(),
        priceAck: true, video: withVideo, currency: CS.cur.code, photoConsent: withVideo ? true : false, audio: st.audioUp, photo: withVideo ? st.photoUp : null, audioSeconds: st.audioSeconds || 0 }, extra));
      CS.track(app, 'submit_ok', { video: withVideo, minutes: res.minutes || 0 });
      showDone(res, phone, email, withVideo);
    } catch (e) {
      CS.track(app, 'submit_failed', { status: e.status || 0 });
      prog.classList.add('is-hidden'); submit.disabled = false; submit.textContent = opts.submitLabel || 'Enviar y recibir mi muestra';
      if (e.status === 400 && /encontramos tu (audio|foto)/i.test(e.message)) { st.audioUp = null; st.photoUp = null; }
      fail(e.status ? e.message : (e.message || 'Sin conexión. Inténtalo de nuevo.'));
    }
  });
  function showDone(res, phone, email, withVideo) {
    root.textContent = '';
    const via = phone ? `por WhatsApp al ${phone}` : `a tu correo ${email}`;
    const d = el('div', 'cs-done');
    d.innerHTML = `<h2 class="display">¡Recibimos tu pedido!</h2><p class="big"></p><p></p><p></p>`;
    const ps = d.querySelectorAll('p');
    ps[0].textContent = `Te escribiremos ${via} con una muestra${withVideo ? ' de tu canción y tu video' : ' de tu canción'}.`;
    ps[1].textContent = `Precio si te gusta: ${res.price}. No pagas nada hasta escuchar la muestra.`;
    ps[2].textContent = withVideo ? 'Y recuerda: en el video eres tú cantando. ¡Prepárate para verte!' : 'Revisa tus mensajes pronto.';
    root.appendChild(d); try { d.scrollIntoView({ block: 'center' }); } catch { window.scrollTo(0, 0); }
    if (opts.onDone) opts.onDone(res);
  }
  CS.track(app, 'form_shown', {});
  return st;
};
})();
