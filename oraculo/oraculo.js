/* El Oráculo del Caos. Servidor: acción 'oracle' en netlify/functions/gemini.js (cuota diaria y cobro en _lib/billing.js).
   - 5 señales gratis al día con tono al azar. Elegir el tono, o pasar de 5, cuesta 1 nodo (250 gemas). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const FN = '/.netlify/functions/';
  const WA = '50687772993';
  const RAR = { comun: 'Común', rara: 'Rara', legendaria: 'Legendaria' };
  const TONE_NAME = { poetico: 'Poético', comico: 'Cómico', absurdo: 'Absurdo', pasivo: 'Pasivo-agresivo', extremo: 'Extremo', cuidado: 'Cuidado' };
  let tone = 'auto', current = null, busy = false;

  function user() { try { return window.netlifyIdentity ? netlifyIdentity.currentUser() : null; } catch { return null; } }
  async function headers() {
    const h = { 'Content-Type': 'application/json' };
    try { const u = user(); if (u) { const t = await u.jwt(); if (t) h.Authorization = 'Bearer ' + t; } } catch { /* sin token */ }
    return h;
  }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400); }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* nada */ } }
  };
  $('#help').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola, tengo una duda sobre El Oráculo del Caos.');

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

  /* ---------- Tono ---------- */
  document.querySelectorAll('.tone').forEach((b) => b.addEventListener('click', () => {
    tone = b.dataset.tone;
    document.querySelectorAll('.tone').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
    $('#toneNote').textContent = tone === 'auto' ? freeText() : 'Elegir el tono cuesta 250 gemas por señal.';
    $('#go').textContent = tone === 'auto' ? 'Recibir una señal' : 'Recibir señal ' + TONE_NAME[tone].toLowerCase();
  }));
  let freeLeft = store.get('or_free', null);
  function freeText() { return freeLeft == null ? 'Al azar es gratis: 5 señales al día.' : (freeLeft > 0 ? 'Al azar es gratis: te quedan ' + freeLeft + ' señales hoy.' : 'Hoy ya usaste tus señales gratis. Las siguientes cuestan 250 gemas.'); }
  $('#toneNote').textContent = freeText();

  /* ---------- Pedir una señal ---------- */
  async function ask() {
    if (busy) return; busy = true;
    const msg = $('#msg'), go = $('#go'); msg.className = 'msg'; msg.textContent = 'El oráculo está pensando…'; go.disabled = true;
    let res, data = {};
    try {
      res = await fetch(FN + 'gemini', { method: 'POST', credentials: 'same-origin', headers: await headers(), body: JSON.stringify({ action: 'oracle', lang: 'es', question: $('#q').value, tone }) });
      data = await res.json().catch(() => ({}));
    } catch { res = null; }
    busy = false; go.disabled = false;
    if (res && typeof data.balance === 'number' && !data.admin) setGems(data.balance);
    if (!res) { msg.className = 'msg err'; msg.textContent = 'Sin conexión. Intenta de nuevo.'; return; }
    if (res.ok) {
      msg.textContent = '';
      if (typeof data.freeLeft === 'number') { freeLeft = data.freeLeft; store.set('or_free', freeLeft); if (tone === 'auto') $('#toneNote').textContent = freeText(); }
      show(data); return;
    }
    if (res.status === 402 || res.status === 401 || (res.status === 429 && !user())) {
      const guest = data.error === 'guest_limit_reached' || res.status === 401 || res.status === 429;
      if (guest && !user()) { msg.className = 'msg err'; msg.textContent = 'Para seguir, crea tu cuenta gratis.'; try { netlifyIdentity.open('signup'); } catch { /* nada */ } return; }
      msg.className = 'msg err'; msg.textContent = 'Se acabaron tus señales gratis de hoy. Consigue gemas para seguir.';
      if (window.GK_GEMS) window.GK_GEMS.openShop({ from: 'oraculo' }); return;
    }
    msg.className = 'msg err';
    msg.textContent = res.status === 429 ? 'Mucha actividad. Espera unos minutos.' : 'El oráculo se quedó sin voz. Intenta de nuevo.';
  }
  $('#go').addEventListener('click', ask);
  $('#again').addEventListener('click', () => { $('#q').focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---------- Mostrar y guardar la carta ---------- */
  function show(d) {
    current = { title: d.title || (TONE_NAME[d.tone] || 'Señal'), text: d.text, tone: d.tone, rarity: d.rarity || 'comun', care: !!d.care, ts: Date.now() };
    const card = $('#card');
    card.className = 'card ' + (current.care ? 'care' : current.rarity);
    $('#cRarity').textContent = current.care ? '' : RAR[current.rarity];
    $('#cTone').textContent = current.care ? '' : (TONE_NAME[current.tone] || '');
    $('#cTitle').textContent = current.care ? 'Un momento' : current.title;
    $('#cText').textContent = current.text;
    $('#result').hidden = false; $('#actions').hidden = current.care;
    void card.offsetWidth; card.classList.add('reveal');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!current.care && !d.fromAlbum) { const a = store.get('or_album', []); a.unshift({ title: current.title, text: current.text, tone: current.tone, rarity: current.rarity, ts: current.ts }); store.set('or_album', a.slice(0, 40)); renderAlbum(); }
  }
  function renderAlbum() {
    const a = store.get('or_album', []), box = $('#albumBox'), g = $('#album');
    box.hidden = !a.length; g.textContent = '';
    const n = { rara: a.filter((x) => x.rarity === 'rara').length, legendaria: a.filter((x) => x.rarity === 'legendaria').length };
    $('#albumCount').textContent = a.length + ' guardadas · ' + n.rara + ' raras · ' + n.legendaria + ' legendarias';
    a.slice(0, 12).forEach((c) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mini ' + c.rarity;
      const t = document.createElement('b'); t.textContent = c.title; b.appendChild(t);
      b.appendChild(document.createTextNode(c.text.length > 70 ? c.text.slice(0, 68) + '…' : c.text));
      b.addEventListener('click', () => show({ title: c.title, text: c.text, tone: c.tone, rarity: c.rarity, fromAlbum: true }));
      g.appendChild(b);
    });
  }
  renderAlbum();

  /* ---------- Compartir (imagen de la carta) ---------- */
  function wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  function drawCard(c) {
    const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2a1650'); g.addColorStop(1, '#0b0716'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const edge = c.rarity === 'legendaria' ? '#f5c76b' : c.rarity === 'rara' ? '#6fd6e8' : '#4a3b78';
    x.strokeStyle = edge; x.lineWidth = 6; x.strokeRect(54, 54, W - 108, H - 108);
    x.fillStyle = edge; x.font = '600 38px Inter, sans-serif'; x.fillText((RAR[c.rarity] || '').toUpperCase() + '  ·  ' + (TONE_NAME[c.tone] || '').toUpperCase(), 110, 160);
    x.fillStyle = '#f3ecff'; x.font = '700 84px Fraunces, Georgia, serif';
    let y = 300; wrap(x, c.title, W - 220).forEach((l) => { x.fillText(l, 110, y); y += 100; });
    x.font = '500 50px Inter, sans-serif'; y += 30;
    wrap(x, c.text, W - 220).slice(0, 14).forEach((l) => { x.fillText(l, 110, y); y += 70; });
    x.fillStyle = '#9a8fb8'; x.font = '600 36px Fraunces, Georgia, serif'; x.fillText('El Oráculo del Caos', 110, H - 120);
    x.font = '400 30px Inter, sans-serif'; x.fillText(location.host + '/oraculo', 110, H - 76);
    return cv;
  }
  $('#share').addEventListener('click', () => {
    if (!current) return;
    const text = '«' + current.title + '» — ' + current.text + '\n\nEl Oráculo del Caos: ' + location.origin + '/oraculo/';
    drawCard(current).toBlob(async (blob) => {
      try {
        const file = new File([blob], 'senal-del-oraculo.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      // Sin compartir archivos (escritorio o navegador viejo): descarga la imagen y abre WhatsApp con el texto.
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'senal-del-oraculo.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Imagen guardada. Abriendo WhatsApp…');
      setTimeout(() => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'), 600);
    }, 'image/png');
  });
})();
