/* El Oráculo del Caos. Servidor: acción 'oracle' en netlify/functions/gemini.js (cuota diaria y cobro en _lib/billing.js).
   5 señales gratis al día con tono al azar (las "velas"); elegir el tono, o pasar de 5, cuesta 1 nodo (250 gemas). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const FN = '/.netlify/functions/';
  const WA = '50687772993';
  const HOLD_MS = 1000, MIN_WAIT_MS = 1100, FREE_DAY = 5;
  const RAR = { comun: 'Común', rara: 'Rara', legendaria: 'Legendaria' };
  const RARS = ['comun', 'rara', 'legendaria'];
  const TONES = ['poetico', 'comico', 'absurdo', 'pasivo', 'extremo'];
  const TONE_NAME = { poetico: 'Poético', comico: 'Cómico', absurdo: 'Absurdo', pasivo: 'Pasivo-agresivo', extremo: 'Extremo', cuidado: 'Cuidado' };
  const GLYPH = { poetico: '🌙', comico: '🎭', absurdo: '🌀', pasivo: '😒', extremo: '🔥' };
  const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tone = 'auto', current = null, busy = false, early = 0, holdRaf = 0, holdStart = 0, holding = false;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* nada */ } }
  };
  function user() { try { return window.netlifyIdentity ? netlifyIdentity.currentUser() : null; } catch { return null; } }
  async function headers() {
    const h = { 'Content-Type': 'application/json' };
    try { const u = user(); if (u) { const t = await u.jwt(); if (t) h.Authorization = 'Bearer ' + t; } } catch { /* sin token */ }
    return h;
  }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400); }
  function vibrate(p) { try { if (navigator.vibrate && !REDUCE) navigator.vibrate(p); } catch { /* nada */ } }
  $('#help').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola, tengo una duda sobre El Oráculo del Caos.');

  /* ---------- Sonido (WebAudio, sin archivos) ---------- */
  let ac = null, soundOn = store.get('or_snd', true) !== false;
  function setSnd() { $('#snd').setAttribute('aria-pressed', soundOn); }
  setSnd();
  $('#snd').addEventListener('click', () => { soundOn = !soundOn; store.set('or_snd', soundOn); setSnd(); });
  function tone_(freq, start, dur, vol, type) {
    if (!soundOn) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + start;
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
    } catch { /* sin audio, no pasa nada */ }
  }
  const sfx = {
    charge(p) { tone_(180 + p * 380, 0, 0.12, 0.035, 'triangle'); },
    burst() { tone_(392, 0, 0.5, 0.07); tone_(587, 0.06, 0.55, 0.05); },
    rare() { [523, 659, 784].forEach((f, i) => tone_(f, i * 0.09, 0.6, 0.07)); },
    legend() { [392, 523, 659, 784, 1047].forEach((f, i) => tone_(f, i * 0.1, 0.9, 0.075)); }
  };

  /* ---------- Gemas ---------- */
  function setGems(nodes) { const b = $('#gems'); if (typeof nodes !== 'number' || !window.GK_GEMS) return; b.hidden = false; b.textContent = '💎 ' + window.GK_GEMS.gemsLabel(nodes); }
  async function fetchBalance(n) {
    if (typeof n === 'number') { setGems(n); return; }
    try {
      const r = await fetch(FN + 'balance', { credentials: 'same-origin', headers: await headers() });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.kind === 'admin') $('#gems').hidden = true; else if (r.ok) setGems(d.balance);
    } catch { /* sin saldo visible */ }
  }
  if (window.GK_GEMS) window.GK_GEMS.configure({ from: 'oraculo', refresh: fetchBalance });
  $('#gems').addEventListener('click', () => window.GK_GEMS && window.GK_GEMS.openShop({ from: 'oraculo' }));
  try {
    if (window.netlifyIdentity) {
      netlifyIdentity.on('init', () => fetchBalance());
      netlifyIdentity.on('login', () => { try { netlifyIdentity.close(); } catch { /* nada */ } fetchBalance(); });
      netlifyIdentity.on('logout', () => fetchBalance());
      netlifyIdentity.init({ locale: 'es' });
    }
  } catch { /* nada */ }

  /* ---------- Velas (señales gratis de hoy) ---------- */
  function today() { return new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10); }   // día de Costa Rica
  let freeLeft = (() => { const s = store.get('or_free3', null); return s && s.day === today() ? s.left : null; })();
  function renderCandles() {
    const left = freeLeft == null ? FREE_DAY : freeLeft, box = $('#candles'); box.textContent = '';
    for (let i = 0; i < FREE_DAY; i++) { const c = document.createElement('span'); c.className = 'candle' + (i < left ? '' : ' out'); c.innerHTML = '<span class="fl"></span>'; box.appendChild(c); }
    $('#candlesL').textContent = left > 0 ? (left === 1 ? 'Te queda 1 señal gratis hoy' : left + ' señales gratis hoy') : 'Las velas se reencienden mañana';
    if (left <= 0 && tone === 'auto') $('#hint').textContent = 'Ya usaste las gratis de hoy: cada señal extra cuesta 250 gemas.';
  }
  renderCandles();

  /* ---------- Tono (de pago) ---------- */
  document.querySelectorAll('.tone').forEach((b) => b.addEventListener('click', () => {
    tone = b.dataset.tone;
    document.querySelectorAll('.tone').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
    $('#toneSum').textContent = tone === 'auto' ? 'Tono: al azar · gratis' : 'Tono: ' + TONE_NAME[tone].toLowerCase() + ' · 250 gemas';
    $('#hint').textContent = tone === 'auto' ? 'Pregunta algo en tu mente, o escríbelo abajo.' : 'Esta señal costará 250 gemas.';
  }));

  /* ---------- El orbe: mantener pulsado ---------- */
  const orb = $('#orb');
  function setProg(p) { orb.style.setProperty('--prog', p.toFixed(3)); }
  function startHold(e) {
    if (busy || holding) return;
    if (e && e.preventDefault) e.preventDefault();
    if (REDUCE) { invoke(); return; }
    holding = true; holdStart = performance.now(); orb.classList.add('charging'); $('#orbTxt').textContent = '…';
    let lastTick = 0;
    const loop = (now) => {
      if (!holding) return;
      const p = Math.min(1, (now - holdStart) / HOLD_MS); setProg(p);
      if (now - lastTick > 230) { lastTick = now; vibrate(12); sfx.charge(p); }
      if (p >= 1) { holding = false; early = 0; invoke(); return; }
      holdRaf = requestAnimationFrame(loop);
    };
    holdRaf = requestAnimationFrame(loop);
  }
  function endHold() {
    if (!holding) return;
    holding = false; cancelAnimationFrame(holdRaf); orb.classList.remove('charging'); setProg(0); $('#orbTxt').textContent = 'Mantén pulsado';
    early++;
    if (early >= 2) { early = 0; invoke(); return; }   // dos toques cortos seguidos: se invoca igual
    $('#hint').textContent = 'Más tiempo: mantén pulsado hasta que el orbe despierte.';
  }
  orb.addEventListener('pointerdown', startHold);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => orb.addEventListener(ev, endHold));
  orb.addEventListener('contextmenu', (e) => e.preventDefault());
  orb.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); invoke(); } });

  async function invoke() {
    if (busy) return; busy = true;
    const msg = $('#msg'); msg.className = 'msg'; msg.textContent = '';
    orb.classList.remove('charging'); orb.classList.add('waiting'); setProg(1);
    $('#orbTxt').textContent = 'Consultando…'; vibrate(40); sfx.burst();
    const t0 = Date.now();
    let res = null, data = {};
    try {
      res = await fetch(FN + 'gemini', { method: 'POST', credentials: 'same-origin', headers: await headers(), body: JSON.stringify({ action: 'oracle', lang: 'es', question: $('#q').value, tone }) });
      data = await res.json().catch(() => ({}));
    } catch { res = null; }
    const wait = MIN_WAIT_MS - (Date.now() - t0); if (wait > 0 && res && res.ok) await new Promise((r) => setTimeout(r, wait));
    orb.classList.remove('waiting'); setProg(0); $('#orbTxt').textContent = 'Mantén pulsado'; busy = false;
    if (res && typeof data.balance === 'number' && !data.admin) setGems(data.balance);
    if (res && res.ok) {
      if (typeof data.freeLeft === 'number') { freeLeft = data.freeLeft; store.set('or_free3', { day: today(), left: freeLeft }); renderCandles(); }
      reveal(data); return;
    }
    orb.classList.add('denied'); setTimeout(() => orb.classList.remove('denied'), 400);
    if (!res) { msg.className = 'msg err'; msg.textContent = 'Sin conexión. Intenta de nuevo.'; return; }
    if (res.status === 402 || res.status === 401 || (res.status === 429 && !user())) {
      const guest = data.error === 'guest_limit_reached' || res.status === 401 || res.status === 429;
      if (guest && !user()) { msg.className = 'msg err'; msg.textContent = 'Para seguir, crea tu cuenta gratis.'; try { netlifyIdentity.open('signup'); } catch { /* nada */ } return; }
      freeLeft = 0; renderCandles();
      msg.className = 'msg err'; msg.textContent = 'Se acabaron las señales gratis de hoy.';
      if (window.GK_GEMS) window.GK_GEMS.openShop({ from: 'oraculo' }); return;
    }
    msg.className = 'msg err';
    msg.textContent = res.status === 429 ? 'Mucha actividad. Espera unos minutos.' : 'El oráculo se quedó sin voz. Intenta de nuevo.';
  }

  /* ---------- Revelación ---------- */
  const stage = $('#stage'), card = $('#card'), fx = $('#fx');
  function reveal(d) {
    current = { title: d.title || (TONE_NAME[d.tone] || 'Señal'), text: d.text, tone: d.tone, rarity: d.rarity || 'comun', care: !!d.care };
    card.className = 'card ' + (current.care ? 'care' : current.rarity);
    $('#cRarity').textContent = current.care ? '' : RAR[current.rarity];
    $('#cTone').textContent = current.care ? '' : (TONE_NAME[current.tone] || '');
    $('#cTitle').textContent = current.care ? 'Un momento' : current.title;
    const ct = $('#cText'); ct.textContent = ''; ct.classList.remove('skip');
    current.text.split(' ').forEach((w, i) => { const s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--i', i); s.textContent = w + ' '; ct.appendChild(s); });
    $('#actions').hidden = current.care;
    stage.className = 'stage' + (current.care ? '' : ' f-' + current.rarity); stage.hidden = false;
    void card.offsetWidth; card.classList.add('reveal');
    if (!current.care && !d.fromSlot) {
      if (current.rarity === 'legendaria') { vibrate([60, 50, 60, 50, 140]); sfx.legend(); sparks(140, ['#ffd27a', '#ff3d8b', '#21d4fd', '#fff']); }
      else if (current.rarity === 'rara') { vibrate([30, 40, 30]); sfx.rare(); sparks(60, ['#5be7ff', '#fff', '#7a5cff']); }
      else { vibrate(25); }
      saveFound(current);
    }
  }
  $('#cText').addEventListener('click', () => $('#cText').classList.add('skip'));
  function closeStage() { stage.hidden = true; const c = fx.getContext('2d'); c.clearRect(0, 0, fx.width, fx.height); cancelAnimationFrame(sparks._raf); }
  $('#again').addEventListener('click', closeStage);
  stage.addEventListener('click', (e) => { if (e.target === stage) closeStage(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !stage.hidden) closeStage(); });

  /* Chispas en canvas (solo rara y legendaria) */
  function sparks(n, colors) {
    if (REDUCE) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = stage.clientWidth || innerWidth, H = stage.clientHeight || innerHeight;
    fx.width = W * dpr; fx.height = H * dpr; const c = fx.getContext('2d'); c.scale(dpr, dpr);
    const ps = Array.from({ length: n }, () => { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 7; return { x: W / 2, y: H * 0.42, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, r: 1.5 + Math.random() * 3, c: colors[(Math.random() * colors.length) | 0], life: 1 }; });
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(2, (now - last) / 16.7); last = now; c.clearRect(0, 0, W, H); let alive = 0;
      ps.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.16 * dt; p.vx *= 0.992; p.life -= 0.011 * dt; if (p.life > 0) { alive++; c.globalAlpha = Math.max(0, p.life); c.fillStyle = p.c; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.fill(); } });
      if (alive && !stage.hidden) sparks._raf = requestAnimationFrame(step); else c.clearRect(0, 0, W, H);
    };
    cancelAnimationFrame(sparks._raf); sparks._raf = requestAnimationFrame(step);
  }

  /* ---------- Colección (5 tonos × 3 rarezas) y racha ---------- */
  function saveFound(c) {
    const found = store.get('or_found', {}), key = c.tone + '_' + c.rarity, isNew = !found[key];
    found[key] = { title: c.title, text: c.text, tone: c.tone, rarity: c.rarity }; store.set('or_found', found);
    const days = store.get('or_days', []); if (days[days.length - 1] !== today()) { days.push(today()); store.set('or_days', days.slice(-120)); }
    renderCollection(isNew ? key : null);
    if (isNew) setTimeout(() => toast('Nueva carta en tu colección: ' + (TONE_NAME[c.tone] || '') + ' · ' + RAR[c.rarity]), 1400);
  }
  function streakDays() {
    const days = store.get('or_days', []); if (!days.length) return 0;
    const dayNum = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / 86400000);
    let n = 1, i = days.length - 1; const t = dayNum(today());
    if (t - dayNum(days[i]) > 1) return 0;
    while (i > 0 && dayNum(days[i]) - dayNum(days[i - 1]) === 1) { n++; i--; }
    return n;
  }
  function renderCollection(justKey) {
    const found = store.get('or_found', {}), g = $('#colGrid'); g.textContent = '';
    const h0 = document.createElement('span'); g.appendChild(h0);
    RARS.forEach((r) => { const h = document.createElement('span'); h.className = 'gh'; h.textContent = RAR[r]; g.appendChild(h); });
    let n = 0;
    TONES.forEach((t) => {
      const l = document.createElement('span'); l.className = 'gl'; l.textContent = TONE_NAME[t].replace('Pasivo-agresivo', 'Pasivo'); g.appendChild(l);
      RARS.forEach((r) => {
        const key = t + '_' + r, f = found[key], b = document.createElement('button'); b.type = 'button';
        b.className = 'slot' + (f ? ' found ' + r : '') + (key === justKey ? ' just' : '');
        b.textContent = f ? GLYPH[t] : '?'; b.setAttribute('aria-label', f ? TONE_NAME[t] + ' ' + RAR[r] + ': ver carta' : 'Carta por descubrir');
        if (f) { n++; b.addEventListener('click', () => reveal({ title: f.title, text: f.text, tone: f.tone, rarity: f.rarity, fromSlot: true })); }
        g.appendChild(b);
      });
    });
    $('#colCount').textContent = n + ' / 15'; $('#colBar').style.width = (n / 15 * 100) + '%';
    const s = streakDays();
    $('#streak').textContent = s >= 2 ? 'Racha: ' + s + ' días seguidos' : (store.get('or_days', []).length ? 'Vuelve mañana y empiezas una racha.' : 'Cada carta nueva llena un casillero.');
  }
  renderCollection(null);

  /* ---------- Compartir (imagen de la carta) ---------- */
  function wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  function drawCard(c) {
    const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.fillStyle = '#07080d'; x.fillRect(0, 0, W, H);
    const glow = x.createRadialGradient(W / 2, H * 0.3, 40, W / 2, H * 0.3, 760); glow.addColorStop(0, c.rarity === 'legendaria' ? 'rgba(255,190,90,.38)' : c.rarity === 'rara' ? 'rgba(91,231,255,.28)' : 'rgba(255,61,139,.22)'); glow.addColorStop(1, 'rgba(7,8,13,0)'); x.fillStyle = glow; x.fillRect(0, 0, W, H);
    const edge = c.rarity === 'legendaria' ? '#ffd27a' : c.rarity === 'rara' ? '#5be7ff' : '#3a3d55';
    x.strokeStyle = edge; x.lineWidth = 6; x.strokeRect(54, 54, W - 108, H - 108);
    x.fillStyle = edge; x.font = '600 36px Inter, sans-serif'; x.fillText((RAR[c.rarity] || '').toUpperCase() + '   ' + (TONE_NAME[c.tone] || '').toUpperCase(), 110, 160);
    x.fillStyle = '#f4efe6'; x.font = '800 88px Fraunces, Georgia, serif';
    let y = 300; wrap(x, c.title, W - 220).forEach((l) => { x.fillText(l, 110, y); y += 104; });
    x.font = 'italic 500 54px Fraunces, Georgia, serif'; y += 34;
    wrap(x, c.text, W - 220).slice(0, 13).forEach((l) => { x.fillText(l, 110, y); y += 76; });
    x.fillStyle = '#7d7993'; x.font = '800 38px Fraunces, Georgia, serif'; x.fillText('Oráculo del Caos', 110, H - 120);
    x.font = '400 30px Inter, sans-serif'; x.fillText(location.host + '/oraculo', 110, H - 76);
    return cv;
  }
  $('#share').addEventListener('click', () => {
    if (!current) return;
    const text = '«' + current.title + '» — ' + current.text + '\n\nOráculo del Caos: ' + location.origin + '/oraculo/';
    drawCard(current).toBlob(async (blob) => {
      try {
        const file = new File([blob], 'senal-del-oraculo.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'senal-del-oraculo.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Imagen guardada. Abriendo WhatsApp…');
      setTimeout(() => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'), 600);
    }, 'image/png');
  });
})();
