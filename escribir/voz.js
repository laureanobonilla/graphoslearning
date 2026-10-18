/* Dictado por voz en Escribir. El audio SOLO AGREGA texto donde está el cursor (nunca borra ni reemplaza lo que ya hay)
   y avisa al campo con un evento 'input', así que todo lo demás (revisión, calificación, guardado) lo trata como si se hubiera tecleado.
   Usa el reconocimiento de voz del navegador (Web Speech): el audio lo transcribe el navegador/sistema, no pasa por nuestro servidor. */
(function () {
  'use strict';
  const E = window.ESC || {};
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const IDS = ['wTitle', 'doc', 'topicIn', 'ansIn'];
  const toast = (m) => { try { E.toast ? E.toast(m) : null; } catch (e) { /* nada */ } };
  const track = (ev, meta) => { try { E.track && E.track(ev, meta || {}); } catch (e) { /* nada */ } };
  if (!SR) { track('voz_no_soportado', {}); return; }

  const LANG = (navigator.language || '').toLowerCase().indexOf('es') === 0 ? navigator.language : 'es-419';
  let rec = null, cur = null;   // cur = { el, btn, before, after, finals, interim, stopping, started, chars }

  function glue(before, text) {
    if (!text) return '';
    return (before && !/\s$/.test(before) && !/^\s/.test(text) ? ' ' : '') + text;
  }
  function paint(c) {
    const text = glue(c.before, (c.finals + ' ' + c.interim).replace(/\s+/g, ' ').trim());
    const v = c.before + text + c.after;
    if (c.el.value !== v) { c.el.value = v; const p = (c.before + text).length; try { c.el.setSelectionRange(p, p); } catch (e) { /* nada */ } c.el.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  function commit(c) {   // lo dictado hasta ahora pasa a ser texto "fijo"; el siguiente tramo se agrega después
    const text = glue(c.before, c.finals.replace(/\s+/g, ' ').trim());
    c.before = c.before + text; c.finals = ''; c.interim = '';
  }
  function setUi(c, on) { c.btn.classList.toggle('rec', on); c.btn.setAttribute('aria-pressed', on ? 'true' : 'false'); c.btn.title = on ? 'Detener dictado' : 'Dictar por voz (agrega al texto)'; }

  function stop() {
    if (!cur) return;
    const c = cur; c.stopping = true;
    try { rec && rec.stop(); } catch (e) { /* nada */ }
    finish();
  }
  function finish() {
    if (!cur) return;
    const c = cur; cur = null; rec = null;
    c.finals = (c.finals + ' ' + c.interim).trim(); c.interim = '';
    paint(c); setUi(c, false);
    if (c.chars) track('voz_fin', { campo: c.el.id, chars: c.chars });
  }
  function start(el, btn) {
    if (cur) { const same = cur.el === el; stop(); if (same) return; }
    if (el.disabled || el.readOnly) return;
    const pos = (el.selectionStart != null && document.activeElement === el) ? el.selectionEnd : el.value.length;
    const c = { el, btn, before: el.value.slice(0, pos), after: el.value.slice(pos), finals: '', interim: '', stopping: false, chars: 0 };
    cur = c;
    const run = () => {
      rec = new SR(); rec.lang = LANG; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        let fin = '', itm = '';
        for (let i = 0; i < ev.results.length; i++) { const t = ev.results[i][0].transcript; if (ev.results[i].isFinal) fin += t + ' '; else itm += t; }
        c.finals = fin; c.interim = itm; c.chars = (fin + itm).length; paint(c);
      };
      rec.onerror = (ev) => {
        if (ev.error === 'no-speech' || ev.error === 'aborted') return;   // silencio: se reinicia solo en onend
        c.stopping = true;
        toast(ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Permite el micrófono para dictar.' : ev.error === 'network' ? 'Sin conexión: no se pudo transcribir.' : 'No se pudo dictar. Intenta de nuevo.');
        track('voz_error', { error: String(ev.error).slice(0, 30) });
      };
      rec.onend = () => {
        if (cur !== c) return;
        if (c.stopping) { finish(); return; }
        commit(c);   // el navegador corta tras una pausa: se guarda lo dicho y se sigue escuchando
        try { run(); } catch (e) { finish(); }
      };
      rec.start();
    };
    try { run(); setUi(c, true); track('voz_inicio', { campo: el.id }); }
    catch (e) { cur = null; toast('No se pudo iniciar el micrófono.'); }
  }

  IDS.forEach((id) => {
    const el = document.getElementById(id); if (!el) return;
    const wrap = document.createElement('div');
    wrap.className = 'vwrap v-' + id + (el.tagName === 'TEXTAREA' ? ' vta' : ' vin');
    el.parentNode.insertBefore(wrap, el); wrap.appendChild(el);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mic'; btn.setAttribute('aria-label', 'Dictar por voz'); btn.setAttribute('aria-pressed', 'false'); btn.title = 'Dictar por voz (agrega al texto)';
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
    btn.addEventListener('mousedown', (e) => e.preventDefault());   // no le quita el foco al campo
    btn.addEventListener('click', () => start(el, btn));
    wrap.appendChild(btn);
    const sync = () => { btn.disabled = el.disabled; if (el.disabled && cur && cur.el === el) stop(); };
    new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['disabled'] }); sync();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  // Al cambiar de pantalla (Enviar, Salir…) el dictado se detiene.
  document.addEventListener('click', (e) => { if (cur && !e.target.closest('.vwrap')) stop(); }, true);
})();
