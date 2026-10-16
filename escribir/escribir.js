/* Graphikosmos · Escribir — modo Practicar (nombre provisional).
   Servidor: acciones esc_questions (gratis) y esc_feedback (1 nodo) en netlify/functions/gemini.js */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const FN = '/.netlify/functions/';
  const LS = { fail: 'esc_failed', errs: 'esc_errs', anon: 'gk_anon_id' };
  const LV = { 1: 'Principiante', 2: 'Intermedio', 3: 'Avanzado' };
  const CRIT = { precision: 'Precisión', completitud: 'Completitud', claridad: 'Claridad' };
  const LVTXT = { logrado: 'Logrado', parcial: 'Parcial', falta: 'Falta trabajo' };
  const CONF = { 3: 'Lo sabías bien', 2: 'Más o menos', 1: 'Adivinabas' };

  let S = null; // { topic, level, qs:[{q,level,focus}], i, results:[], asked:[], review }
  let count = 5, pickLv = 1, conf = 0, busyNow = false;

  /* ---------- utilidades ---------- */
  const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function ls(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800); }
  function user() { try { return window.netlifyIdentity ? netlifyIdentity.currentUser() : null; } catch { return null; } }
  async function headers() {
    const h = { 'Content-Type': 'application/json' };
    try { const u = user(); if (u) { const t = await u.jwt(); if (t) h.Authorization = 'Bearer ' + t; } } catch { /* sin token */ }
    return h;
  }
  function anonId() { let a = ''; try { a = localStorage.getItem(LS.anon) || ''; if (!a) { a = 'a' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem(LS.anon, a); } } catch { /* nada */ } return a; }
  function track(name, md) {
    try { fetch(FN + 'track-event', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: name, app: 'escribir', anonId: anonId(), metadata: md || {} }) }).catch(() => {}); } catch { /* nada */ }
  }

  /* ---------- cuenta y gemas ---------- */
  function setGems(n) { const b = $('#btnGems'); if (!b || typeof n !== 'number' || !window.GK_GEMS) return; b.hidden = false; $('#gemsVal').textContent = window.GK_GEMS.gemsLabel(n); }
  async function fetchBalance(n) {
    if (typeof n === 'number') { setGems(n); return; }
    try { const r = await fetch(FN + 'balance', { credentials: 'same-origin', headers: await headers() }); const d = await r.json().catch(() => ({})); if (r.ok && d.kind === 'admin') $('#btnGems').hidden = true; else if (r.ok) setGems(d.balance); } catch { /* sin saldo */ }
  }
  function updateLogin() { const u = user(); $('#loginLabel').textContent = u ? clip((u.email || 'Mi cuenta').split('@')[0], 12) : 'Entrar'; }
  if (window.GK_GEMS) window.GK_GEMS.configure({ from: 'escribir', refresh: fetchBalance });
  $('#btnGems').addEventListener('click', () => window.GK_GEMS && window.GK_GEMS.openShop({ from: 'escribir' }));
  $('#btnLogin').addEventListener('click', () => { if (!window.netlifyIdentity) { toast('No se pudo abrir el inicio de sesión.'); return; } netlifyIdentity.open(user() ? undefined : 'login'); });
  try {
    if (window.netlifyIdentity) {
      netlifyIdentity.on('init', () => { updateLogin(); fetchBalance(); });
      netlifyIdentity.on('login', () => { try { netlifyIdentity.close(); } catch { /* nada */ } updateLogin(); fetchBalance(); });
      netlifyIdentity.on('logout', () => { updateLogin(); fetchBalance(); });
      netlifyIdentity.init({ locale: 'es' });
    }
  } catch { /* nada */ }
  updateLogin();

  async function callGemini(body) {
    let res;
    try { res = await fetch(FN + 'gemini', { method: 'POST', credentials: 'same-origin', headers: await headers(), body: JSON.stringify(Object.assign({ lang: 'es' }, body)) }); }
    catch { return { ok: false, kind: 'network' }; }
    let data = {}; try { data = await res.json(); } catch { /* nada */ }
    if (res.ok) { if (typeof data.balance === 'number' && !data.admin) setGems(data.balance); return { ok: true, data }; }
    if (res.status === 402 && typeof data.balance === 'number') setGems(data.balance);
    if (res.status === 402 && data.error === 'guest_limit_reached') return { ok: false, kind: 'login' };
    if (res.status === 402) return { ok: false, kind: user() ? 'nobalance' : 'login' };
    if (res.status === 401) return { ok: false, kind: 'login' };
    if (res.status === 429) return { ok: false, kind: user() ? 'rate' : 'login' };
    return { ok: false, kind: 'server', status: res.status };
  }
  async function callRetry(body) { let r = await callGemini(body); if (!r.ok && r.kind === 'server') r = await callGemini(body); return r; }
  function failText(k) {
    return ({ login: 'Para seguir, crea tu cuenta gratis o inicia sesión.', nobalance: 'Se acabaron tus gemas. Consigue más para seguir.', rate: 'Hay mucha actividad en tu cuenta. Espera unos minutos e intenta de nuevo.', network: 'Sin conexión. Revisa tu internet e intenta de nuevo.' })[k] || 'No pudimos hacerlo. Intenta de nuevo.';
  }
  function afterFail(k) {
    if (k === 'login' || k === 'nobalance') track('paywall_shown', { kind: k });
    if (k === 'login') { try { window.netlifyIdentity && netlifyIdentity.open('signup'); } catch { /* nada */ } }
    if (k === 'nobalance' && window.GK_GEMS) window.GK_GEMS.openShop({ from: 'escribir' });
  }

  /* ---------- navegación ---------- */
  function show(v) { ['Home', 'Setup', 'Ask', 'Fb', 'End', 'Genre', 'Write', 'Proj'].forEach((n) => { $('#v' + n).hidden = n !== v; }); window.scrollTo(0, 0); }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { if (b.dataset.go === 'home') renderHome(); } });

  function dueReviews() { const now = Date.now(); return ls(LS.fail, []).filter((f) => f.due <= now); }
  function renderHome() {
    show('Home');
    const old = $('#reviewCard'); if (old) old.remove();
    const due = dueReviews();
    if (due.length) {
      const d = document.createElement('button');
      d.id = 'reviewCard'; d.type = 'button'; d.className = 'mode';
      d.innerHTML = '<strong>Repasar (' + due.length + ')</strong><span>Preguntas que fallaste antes y ya toca volver a intentar.</span>';
      d.addEventListener('click', () => startReview(due));
      $('#vHome .modes').prepend(d);
    }
  }
  $('#modePractice').addEventListener('click', () => { show('Setup'); $('#topicIn').focus(); });

  /* ---------- preparar ---------- */
  const topicIn = $('#topicIn'), btnStart = $('#btnStart');
  topicIn.addEventListener('input', () => { btnStart.disabled = clip(topicIn.value, 160).length < 2; });
  $('#countSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-n]'); if (!b) return;
    count = Number(b.dataset.n);
    document.querySelectorAll('#countSeg button').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
  });
  $('#levelPick').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-lv]'); if (!b) return;
    pickLv = Number(b.dataset.lv);
    document.querySelectorAll('#levelPick button').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
  });
  async function fetchQuestions(topic, level, n, avoid) {
    return callRetry({ action: 'esc_questions', topic, count: n, level, avoid });
  }
  $('#setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btnStart.disabled || busyNow) return;
    const msg = $('#setupMsg'); msg.className = 'msg'; msg.textContent = 'Armando tus preguntas…';
    busyNow = true; btnStart.disabled = true;
    const topic = clip(topicIn.value, 160);
    const r = await fetchQuestions(topic, pickLv, count, []);
    busyNow = false; btnStart.disabled = false;
    if (!r.ok) { msg.className = 'msg err'; msg.textContent = failText(r.kind); afterFail(r.kind); return; }
    msg.textContent = '';
    track('esc_start', { count, level: pickLv, topicLen: topic.length });
    begin(r.data.topic || topic, pickLv, r.data.questions, false);
  });

  /* ---------- sesión ---------- */
  function begin(topic, level, qs, review) {
    S = { topic, level, qs, i: 0, results: [], review: !!review };
    askCurrent();
  }
  function startReview(list) {
    const qs = list.slice(0, 8).map((f) => ({ q: f.q, level: f.level, focus: f.focus, topic: f.topic }));
    track('esc_review_start', { n: qs.length });
    begin('Repaso', 1, qs, true);
  }
  function setProg() {
    const pct = Math.round((S.i / S.qs.length) * 100) + '%';
    $('#progBar').style.width = pct; $('#progBar2').style.width = Math.round(((S.i + 1) / S.qs.length) * 100) + '%';
  }
  function askCurrent() {
    const q = S.qs[S.i];
    show('Ask'); setProg();
    $('#qNum').textContent = 'Pregunta ' + (S.i + 1) + ' de ' + S.qs.length;
    $('#qLevel').textContent = 'Nivel ' + (LV[q.level] || 'Principiante').toLowerCase();
    $('#qText').textContent = q.q;
    conf = 0;
    document.querySelectorAll('#confSeg button').forEach((b) => b.classList.remove('on'));
    $('#ansIn').value = ''; $('#ansIn').disabled = false; $('#btnSend').disabled = true; $('#askMsg').textContent = ''; $('#askMsg').className = 'msg';
    $('#conf').hidden = false;
    syncBack();
  }
  $('#confSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-c]'); if (!b) return;
    const c = Number(b.dataset.c);
    conf = conf === c ? 0 : c;   // volver a tocar la opción la quita
    document.querySelectorAll('#confSeg button').forEach((x) => x.classList.toggle('on', conf && Number(x.dataset.c) === conf));
  });
  function wc(s) { return s.trim().split(/\s+/).filter(Boolean).length; }
  function updateSend() { $('#btnSend').disabled = wc($('#ansIn').value) < 3; }
  $('#ansIn').addEventListener('input', updateSend);

  $('#btnSkip').addEventListener('click', () => {
    if (busyNow) return;
    const q = S.qs[S.i];
    S.results.push({ q, ans: '', conf: 0, skipped: true, fb: null, failed: true });
    registerFail(q);
    track('esc_skip', { level: q.level });
    next();
  });

  $('#btnSend').addEventListener('click', async () => {
    if (busyNow || $('#btnSend').disabled) return;
    const q = S.qs[S.i], ans = $('#ansIn').value.trim();
    const msg = $('#askMsg'); msg.className = 'msg'; msg.textContent = 'Revisando tu respuesta…';
    busyNow = true; $('#btnSend').disabled = true;
    const r = await callRetry({ action: 'esc_feedback', topic: q.topic || S.topic, question: q.q, focus: q.focus, level: q.level, userAnswer: ans });
    busyNow = false;
    if (!r.ok) { msg.className = 'msg err'; msg.textContent = failText(r.kind); updateSend(); afterFail(r.kind); return; }
    const fb = r.data;
    const failed = isFailed(fb);
    S.results.push({ q, ans, conf, fb, failed });
    if (failed) registerFail(q); else clearFail(q);
    (fb.errors || []).forEach(bumpErr);
    track('esc_feedback', { level: q.level, conf, failed, wc: wc(ans), p: fb.criteria.precision.level, c: fb.criteria.completitud.level, l: fb.criteria.claridad.level });
    renderFb(S.results[S.results.length - 1]);
  });

  function isFailed(fb) { const v = Object.values(fb.criteria).map((c) => c.level); return v.includes('falta') || v.filter((x) => x === 'parcial').length >= 2; }
  function key(q) { return (q.topic || (S && S.topic) || '') + '|' + q.q; }
  function registerFail(q) {
    const list = ls(LS.fail, []).filter((f) => f.key !== key(q));
    list.push({ key: key(q), q: q.q, focus: q.focus, level: q.level, topic: q.topic || S.topic, due: Date.now() + 86400000 });
    lsSet(LS.fail, list.slice(-60));
  }
  function clearFail(q) { lsSet(LS.fail, ls(LS.fail, []).filter((f) => f.key !== key(q))); }
  function bumpErr(tag) { const e = ls(LS.errs, {}); e[tag] = (e[tag] || 0) + 1; lsSet(LS.errs, e); }

  /* ---------- retroalimentación ---------- */
  function calibration(res) {
    const ok = !res.failed;
    if (res.conf === 3 && !ok) return 'Estabas seguro y la respuesta quedó floja: ese es el hueco más útil para estudiar.';
    if (res.conf === 1 && ok) return 'Dijiste que adivinabas y te salió bien: sabes más de lo que crees.';
    if (res.conf === 3 && ok) return 'Tu seguridad coincidió con el resultado.';
    return '';
  }
  function renderFb(res) {
    const fb = res.fb;
    show('Fb'); setProg();
    $('#fNum').textContent = 'Pregunta ' + (S.i + 1) + ' de ' + S.qs.length;
    $('#fQ').textContent = res.q.q;
    $('#fAns').textContent = res.ans;
    let h = '<div class="card"><h3>Por criterios</h3>';
    Object.keys(CRIT).forEach((k) => { const c = fb.criteria[k]; h += '<div class="crit"><div><span class="lv ' + c.level + '">' + LVTXT[c.level] + '</span><br><small>' + CRIT[k] + '</small></div><p>' + esc(c.note) + '</p></div>'; });
    h += '</div>';
    if (fb.summary) h += '<p>' + esc(fb.summary) + '</p>';
    const cal = calibration(res); if (cal) h += '<p class="calib">' + esc(cal) + '</p>';
    if (fb.terms.length) { h += '<div class="card"><h3>Palabras más exactas</h3>'; fb.terms.forEach((t) => { h += '<div class="sug"><s>' + esc(t.said) + '</s> → <b>' + esc(t.better) + '</b><em>' + esc(t.why) + '</em></div>'; }); h += '</div>'; }
    if (fb.synthesis.length) { h += '<div class="card"><h3>Dilo más preciso</h3>'; fb.synthesis.forEach((t) => { h += '<div class="sug"><s>' + esc(t.long) + '</s><br>→ <b>' + esc(t.short) + '</b></div>'; }); h += '</div>'; }
    if (fb.missing.length) { h += '<div class="card"><h3>Lo que faltó</h3><ul>' + fb.missing.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul></div>'; }
    if (fb.concepts && fb.concepts.length) {
      h += '<div class="card"><h3>Conceptos importantes que no mencionaste</h3><div class="chips">' + fb.concepts.map((c) => '<span class="chip">' + esc(c) + '</span>').join('') + '</div>' +
        '<button class="ghost" id="btnConcepts" type="button">Practicar estos conceptos</button>' +
        (S.parent ? '' : '<p class="small">Después podrás volver aquí, a la pregunta ' + (S.i + 2 <= S.qs.length ? (S.i + 2) : 'final') + '.</p>') + '</div>';
    }
    h += '<div class="card"><h3>Respuesta modelo</h3><div class="model">' + esc(fb.modelAnswer) + '</div></div>';
    $('#fbBody').innerHTML = h;
    const bc = $('#btnConcepts'); if (bc) bc.addEventListener('click', () => practiceConcepts(fb.concepts, bc));
    syncBack();
    $('#btnNext').textContent = S.i + 1 >= S.qs.length ? 'Ver resumen' : 'Siguiente';
  }
  function syncBack() { document.querySelectorAll('[data-back]').forEach((b) => { b.hidden = !(S && S.parent); }); }
  async function practiceConcepts(concepts, btn) {
    if (busyNow || S.parent) { if (S.parent) toast('Termina o vuelve a la práctica original primero.'); return; }
    busyNow = true; btn.disabled = true; const old = btn.textContent; btn.textContent = 'Armando preguntas…';
    const sub = S.topic + ': ' + concepts.join(', ');
    const r = await fetchQuestions(sub.slice(0, 160), S.level, 3, []);
    busyNow = false; btn.disabled = false; btn.textContent = old;
    if (!r.ok) { toast(failText(r.kind)); afterFail(r.kind); return; }
    track('esc_concepts_start', { n: concepts.length });
    const parent = S; parent.i = S.i + 1;   // al volver se sigue con la pregunta que tocaba
    begin(S.topic + ' · conceptos', S.level, r.data.questions, false);
    S.parent = parent; syncBack();
  }
  function backToOriginal() {
    if (!S || !S.parent) return;
    S = S.parent; track('esc_concepts_back', {});
    if (S.i >= S.qs.length) return renderEnd();
    askCurrent();
  }
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', backToOriginal));
  $('#btnNext').addEventListener('click', next);
  function next() {
    S.i++;
    if (S.i >= S.qs.length) return renderEnd();
    askCurrent();
  }

  /* ---------- resumen ---------- */
  function renderEnd() {
    show('End');
    const R = S.results, done = R.filter((r) => !r.skipped);
    const good = R.filter((r) => !r.failed).length;
    $('#endTopic').textContent = S.topic + ' · ' + good + ' de ' + R.length + ' bien resueltas';
    const tally = { precision: {}, completitud: {}, claridad: {} };
    done.forEach((r) => Object.keys(tally).forEach((k) => { const l = r.fb.criteria[k].level; tally[k][l] = (tally[k][l] || 0) + 1; }));
    let h = '<div class="card"><h3>Por criterio</h3><div class="stat">';
    Object.keys(CRIT).forEach((k) => { h += '<div class="pill"><b>' + CRIT[k] + '</b>: ' + (tally[k].logrado || 0) + ' logrado · ' + (tally[k].parcial || 0) + ' parcial · ' + (tally[k].falta || 0) + ' falta</div>'; });
    h += '</div></div>';
    const hidden = R.filter((r) => r.conf === 3 && r.failed).length;
    if (hidden) h += '<p class="calib">En ' + hidden + (hidden === 1 ? ' pregunta ibas seguro y no te salió: repásala primero.' : ' preguntas ibas seguro y no te salieron: repásalas primero.') + '</p>';
    const errs = Object.entries(ls(LS.errs, {})).filter((e) => e[1] >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (errs.length) h += '<div class="card"><h3>Errores que se repiten</h3><ul>' + errs.map((e) => '<li>' + esc(e[0]) + ' (' + e[1] + ' veces)</li>').join('') + '</ul></div>';
    $('#endBody').innerHTML = h;
    const failed = R.filter((r) => r.failed);
    $('#btnReview').hidden = !failed.length || !!S.parent;
    $('#btnReview').textContent = 'Repasar las falladas (' + failed.length + ')';
    $('#btnLevelUp').hidden = S.review || S.level >= 3 || !!S.parent;
    $('#btnBackEnd').hidden = !S.parent;
    $('#lnkMap').hidden = S.review;
    $('#lnkMap').href = '/?aprende=' + crypto.randomUUID() + '&t=' + encodeURIComponent(clip((S.parent ? S.parent.topic : S.topic), 120));
    $('#lnkMap').onclick = () => track('esc_to_map', {});
    track('esc_end', { n: R.length, good, level: S.level, review: S.review });
  }
  $('#btnReview').addEventListener('click', () => {
    const list = S.results.filter((r) => r.failed).map((r) => ({ q: r.q.q, focus: r.q.focus, level: r.q.level, topic: r.q.topic || S.topic }));
    startReview(list);
  });
  $('#btnLevelUp').addEventListener('click', async () => {
    if (busyNow) return;
    const b = $('#btnLevelUp'), old = b.textContent;
    b.textContent = 'Armando preguntas…'; busyNow = true; b.disabled = true;
    const lvl = Math.min(3, S.level + 1);
    const r = await fetchQuestions(S.topic, lvl, [2, 3, 5, 8].includes(S.qs.length) ? S.qs.length : 5, S.qs.map((q) => q.q));
    busyNow = false; b.disabled = false; b.textContent = old;
    if (!r.ok) { toast(failText(r.kind)); afterFail(r.kind); return; }
    track('esc_levelup', { level: lvl });
    begin(S.topic, lvl, r.data.questions, false);
  });

  try {   // llegada desde Graphikosmos ("Practicar este tema"): el tema ya viene escrito
    const qp = new URLSearchParams(location.search), pt = clip(qp.get('practicar') || '', 160);
    if (pt.length >= 2) { history.replaceState(null, '', location.pathname); track('esc_from_map', {}); setTimeout(() => { show('Setup'); topicIn.value = pt; topicIn.dispatchEvent(new Event('input')); }, 0); }
  } catch { /* nada */ }

  window.ESC = { show, renderHome, callRetry, failText, afterFail, track, toast, esc, clip, ls, lsSet };
  renderHome();
})();
