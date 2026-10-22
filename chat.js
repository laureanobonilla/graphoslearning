/* chat.js — pantalla tipo chat (solo escritorio):
 *  - barra de abajo con «Estudiar»: acepta un tema, un texto largo o un enlace en el mismo campo;
 *  - pestañas en la cabecera (Mapa mental, Rizoma y las lentes) para pasar de una vista a otra;
 *  - pantalla de inicio vacía, como la de un chat de IA.
 * Se apaga con ?chat=0 en la dirección o con localStorage gk_chat = '0'. Depende de lentes.js (window.GK_NAV) y de app.js.
 */
(function () {
  'use strict';
  try { if (/[?&]chat=0/.test(location.search) || localStorage.getItem('gk_chat') === '0') return; } catch (_e) { /* sigue */ }
  if (window.innerWidth < 781) return;   // el celular tiene su propia pantalla

  const EN = () => !!(window.I18N && window.I18N.lang === 'en');
  const L = (es, en) => (EN() ? en : es);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r) => (r || document).querySelector(s);
  const trk = (e, m) => { try { if (typeof track === 'function') track(e, m || {}); } catch (_e) { /* nunca debe notarse */ } };

  const CSS = `
body.gk-chat #startTopic, body.gk-chat #btnStartTopic, body.gk-chat #btnToggleReader, body.gk-chat #btnUndo, body.gk-chat #btnReorganize,
body.gk-chat #btnSearchNodes, body.gk-chat #btnPresentationMode, body.gk-chat #gkLensBtnWrap, body.gk-chat #welcomeScreen{display:none !important}
body.gk-chat #gkLens, body.gk-chat #gkCards{top:var(--gk-head-h,0px);bottom:calc(var(--gk-comp-h,0px) + var(--gk-notes-h,0px))}
body.gk-chat #gkLens{bottom:0}   /* el panel de la derecha llega hasta abajo; lo demás deja su espacio a «Mis notas» y a la barra */
body.gk-chat #gkLens .gl-body > :not(.gl-side):not(.gl-grip){margin-bottom:calc(var(--gk-comp-h,0px) + var(--gk-notes-h,0px))}
body.gk-cover #gkComposer{z-index:150;background:none;pointer-events:none}
body.gk-cover #gkComposer .gc-in{pointer-events:auto}
body.gk-cover #gkCtl{z-index:151}
body.gk-cover #vizPanel{z-index:150;left:0 !important;right:var(--gk-side-w,0px) !important;--p-bg:#0e131a;--p-bg2:#171e29;--p-head:#0e131a;--p-ink:#e8ebf0;--p-ink2:#c3cad6;--p-mute:#8b94a5;--p-rule:#2a3342;--p-acc:#7aa7d9;--p-acc-bg:rgba(122,167,217,.14);box-shadow:none;scrollbar-color:#2a3342 transparent}
body.gk-cover #vizPanel .vz-btn, body.gk-cover #vizPanel .vz-quote button, body.gk-cover #vizPanel .vz-ghost, body.gk-cover #vizPanel .vz-note, body.gk-cover #vizPanel .vz-note-form textarea, body.gk-cover #vizPanel .vz-rh-ctl select{background:#171e29;color:#e8ebf0}
body.gk-cover #vizPanel .vz-primary{color:#0b1118}
body.gk-chat #rhzToggle{display:none !important}
body.gk-chat #topicTab.on{display:inline-flex;position:fixed;left:14px;top:var(--gk-tt-top,80px);z-index:26;align-items:center;gap:6px;padding:7px 16px;border-radius:999px;border:0;background:linear-gradient(0deg,#7aa7d9,#7aa7d9);color:#0b1118;font:700 13px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 18px rgba(122,167,217,.35)}
body.gk-chat.gk-rz #topicTab.on{top:auto;bottom:calc(var(--gk-comp-h,0px) + var(--gk-notes-h,0px) + 44px)}   /* en el rizoma va abajo, sobre la leyenda, para no tapar su cabecera ni la guía */
body.gk-chat #topicTab.on:hover{filter:brightness(1.1);background:linear-gradient(0deg,#7aa7d9,#7aa7d9)}
body.gk-cover #topicTab{display:none !important}
body.gk-chat #mainHeader{gap:0}
body.gk-chat #mainHeader > div:nth-child(2){display:none !important}   /* la segunda barra ya no existe: las pestañas suben a la primera */
body.gk-chat #mainHeader [class*="xl:inline"]{display:none}
@media (min-width:1700px){body.gk-chat #mainHeader [class*="xl:inline"]{display:inline}}
body.gk-chat #mainHeader .gk-tabslot{display:flex;align-items:center;justify-content:center;flex:1;min-width:0}
#gkCtl{position:fixed;left:12px;bottom:24px;z-index:33;display:flex;flex-direction:row;align-items:center;gap:6px;font-family:Inter,system-ui,sans-serif;max-width:calc(100vw - 24px)}
#gkCtl > div{display:flex;align-items:center;gap:6px}
#gkCtl select{width:auto;max-width:104px;font-size:11px;padding:3px 4px;height:24px}
#gkCtl button{padding:3px 7px;font-size:11px;height:24px}
#gkCtl [class*="text-[10px]"]{display:none !important}
#gkComposer .gc-h{display:none !important}
@keyframes gcNudge{0%,100%{box-shadow:0 10px 40px rgba(0,0,0,.45),0 0 0 0 rgba(122,167,217,.0);border-color:#2a3342}50%{box-shadow:0 10px 40px rgba(0,0,0,.45),0 0 0 7px rgba(122,167,217,.22);border-color:#7aa7d9}}
@keyframes gcBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
#gkComposer.nudge .gc-in{animation:gcNudge 2.2s ease-in-out infinite}
#gkHero .gh-arrow{display:block;margin:18px auto 0;font-size:26px;color:#7aa7d9;animation:gcBob 1.3s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){#gkComposer.nudge .gc-in,#gkHero .gh-arrow{animation:none}}   /* sin renglón de ayuda: el espacio es del lienzo */
body.gk-chat #mainHeader h1{display:none !important}
@media (min-width:1500px){body.gk-chat #mainHeader h1{display:block !important}}
body.gk-chat #gkTabs button{padding:6px 10px}
body.gk-chat #gkTabs .len button{padding:4px 9px}
body.gk-chat #gkTabs{gap:3px}
body.gk-cover #defsView, body.gk-cover #topicPanel, body.gk-cover #readerPanel{visibility:hidden !important}   /* con una lente o las tarjetas a pantalla completa, los paneles laterales no asoman por debajo */
body.gk-chat #vizPanel{bottom:var(--gk-comp-h,0px)}
body.gk-chat #gkResume{bottom:calc(var(--gk-comp-h,0px) + 16px)}
#gkComposer{flex:0 0 auto;position:relative;z-index:31;padding:6px 16px 10px;background:linear-gradient(rgba(11,15,21,0),#0b0f15 35%);font-family:Inter,system-ui,sans-serif}
#gkComposer .gc-in{max-width:880px;margin:0 auto;display:flex;align-items:flex-end;gap:10px;background:#121821;border:1px solid #2a3342;border-radius:22px;padding:8px 8px 8px 18px;box-shadow:0 10px 40px rgba(0,0,0,.45);transition:border-color .15s,box-shadow .15s}
#gkComposer .gc-in:focus-within{border-color:#7aa7d9;box-shadow:0 10px 40px rgba(0,0,0,.45),0 0 0 3px rgba(122,167,217,.16)}
#gkComposer textarea{flex:1;min-width:0;background:transparent;border:0;outline:0;resize:none;color:#e8ebf0;font:400 15px/1.5 Inter,system-ui,sans-serif;padding:8px 0;max-height:168px;overflow-y:auto}
#gkComposer textarea::placeholder{color:#6c7586}
#gkComposer button{flex:0 0 auto;border:0;border-radius:15px;background:#7aa7d9;color:#0b1118;padding:10px 22px;font:700 14px Inter,system-ui,sans-serif;cursor:pointer;transition:filter .15s,transform .1s}
#gkComposer button:hover{filter:brightness(1.08)}
#gkComposer button:active{transform:scale(.97)}
#gkComposer button:disabled{opacity:.5;cursor:wait}
#gkComposer .gc-h{max-width:880px;margin:6px auto 0;text-align:center;font-size:11.5px;color:#5d6677}
#gkTabs{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
#gkTabs::-webkit-scrollbar{display:none}
#gkTabs button{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;border:1px solid transparent;background:none;color:#a9b1bf;border-radius:999px;padding:6px 13px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
#gkTabs button:hover{color:#e8ebf0;background:#171e29}
@media (max-width:1350px){body.gk-chat #gkTabs [data-tab="biblioteca"] .tl{display:none}}
@media (max-width:1450px){body.gk-chat #gkTabs button{padding:6px 8px;gap:5px;font-size:12.5px}body.gk-chat #gkTabs .len button{padding:4px 7px}body.gk-chat #gkTabs .sep{margin:0 2px}}
#gkTabs button.on{background:#1e2633;color:#7aa7d9;border-color:#2a3342}
#gkTabs button.all{padding:6px 10px;color:#8b94a5}
#gkTabs.idle button:not(.all){opacity:.55}
#gkTabs .sep{flex:0 0 1px;height:18px;background:#2a3342;margin:0 4px}
#gkTabs .len{display:flex;align-items:center;gap:2px;padding:2px;border-radius:999px;border:1.5px solid transparent;background:linear-gradient(#0f1319,#0f1319) padding-box,linear-gradient(0deg,#7aa7d9,#7aa7d9) border-box}
#gkTabs .len button{padding:4px 11px}
#gkTabs .len button.on{background:rgba(122,167,217,.18);color:#e8ebf0;border-color:transparent}
#gkNeed{position:fixed;left:50%;bottom:calc(var(--gk-comp-h,72px) + 10px);transform:translateX(-50%);z-index:60;max-width:min(520px,calc(100vw - 32px));background:#1e2633;color:#e8ebf0;border:1px solid #7aa7d9;border-radius:12px;padding:9px 15px;font:600 13px Inter,system-ui,sans-serif;box-shadow:0 10px 34px rgba(0,0,0,.5);pointer-events:none;opacity:0;transition:opacity .2s}
#gkNeed.on{opacity:1}
@keyframes gcShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
#gkComposer.need .gc-in{animation:gcShake .45s ease;border-color:#7aa7d9;box-shadow:0 0 0 4px rgba(122,167,217,.28)}
#gkHero{position:fixed;left:0;right:0;top:var(--gk-head-h,0px);bottom:var(--gk-comp-h,0px);z-index:12;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;pointer-events:none;font-family:Inter,system-ui,sans-serif}
#gkHero.on{display:flex}
#gkHero .gh-logo{width:56px;height:56px;border-radius:16px;background:#1e2633;border:1px solid #2a3342;display:flex;align-items:center;justify-content:center;font:600 28px Newsreader,Georgia,serif;color:#7aa7d9;margin-bottom:18px;box-shadow:none}
#gkHero h1{font:600 clamp(28px,3.8vw,42px)/1.18 Newsreader,Georgia,serif;letter-spacing:-.01em;color:#e8ebf0;margin:0 0 10px}
#gkHero p{max-width:520px;color:#8b94a5;font-size:15px;line-height:1.55;margin:0 0 22px}
#gkHero .gh-c{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:640px;pointer-events:auto}
#gkHero .gh-c button{border:1px solid #2a3342;background:#121821;color:#c3cad6;border-radius:999px;padding:8px 15px;font:500 13.5px Inter,system-ui,sans-serif;cursor:pointer;transition:border-color .15s,color .15s}
#gkHero .gh-c button:hover{border-color:#7aa7d9;color:#7aa7d9}
`;

  let input = null, btn = null, tabs = null, hero = null, comp = null, busy = false;

  function injectCss() { if (document.getElementById('gkChatCss')) return; const s = document.createElement('style'); s.id = 'gkChatCss'; s.textContent = CSS; document.head.appendChild(s); }

  /* ---------- barra de abajo ---------- */
  function buildComposer() {
    comp = document.createElement('div'); comp.id = 'gkComposer';
    comp.innerHTML = '<div class="gc-in"><textarea id="gkComposerInput" rows="1" autocomplete="off" spellcheck="false" aria-label="' + esc(L('Tema, texto o enlace', 'Topic, text or link')) + '" placeholder="' + esc(L('Un tema, texto o enlace…', 'A topic, text or link…')) + '"></textarea><button type="button" id="gkComposerBtn">' + esc(L('Estudiar', 'Study')) + '</button></div>' +
      '<p class="gc-h">' + esc(L('Enter para estudiar · Mayús + Enter para otra línea', 'Enter to study · Shift + Enter for a new line')) + '</p>';
    document.body.appendChild(comp);
    input = $('#gkComposerInput', comp); btn = $('#gkComposerBtn', comp);
    let seenFocus = false, seenTyped = false;   // ¿llegó a tocar la barra? ¿llegó a escribir? (para ver dónde se cae la gente)
    input.addEventListener('focus', () => { if (!seenFocus) { seenFocus = true; trk('composer_focus', {}); } });
    input.addEventListener('input', () => { if (!seenTyped && input.value.trim()) { seenTyped = true; trk('composer_typed', { len: Math.min(input.value.length, 500) }); } });
    // Invitación a escribir: mientras no hay mapa y la persona no ha tocado la barra, la barra «late» y su texto de ejemplo se va escribiendo solo.
    let touched = false; const stopNudge = () => { touched = true; comp.classList.remove('nudge'); input.placeholder = L('Un tema, texto o enlace…', 'A topic, text or link…'); };
    input.addEventListener('focus', stopNudge); input.addEventListener('input', stopNudge);
    const ideas = EN() ? ['The Fermi Paradox', 'How inflation works', 'Plato’s Cave', 'a link or a long text…'] : ['La Revolución Francesa', 'Cómo funciona la inflación', 'El Mito de la Caverna', 'un enlace o un texto largo…'];
    let ii = 0, cc = 0, hold = 0;
    setInterval(() => {
      const idle = !touched && hero && hero.classList.contains('on') && document.activeElement !== input && !input.value;
      comp.classList.toggle('nudge', !!idle);
      if (!idle) { if (!touched && !input.value) input.placeholder = L('Un tema, texto o enlace…', 'A topic, text or link…'); return; }
      const w = ideas[ii];
      if (hold > 0) { hold--; return; }
      cc++; input.placeholder = L('Escribe: ', 'Type: ') + w.slice(0, cc) + (cc % 2 ? '▍' : ' ');
      if (cc >= w.length) { cc = 0; ii = (ii + 1) % ideas.length; hold = 10; }
    }, 110);
    const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(168, input.scrollHeight) + 'px'; measure(); };
    input.addEventListener('input', grow);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
    btn.addEventListener('click', () => submit());
    window.GK_COMPOSER = { fill: (t) => { input.value = t; grow(); input.focus(); } };
  }

  const looksLink = (t) => /^(https?:\/\/|www\.)\S+$/i.test(t) && t.length <= 2000;
  async function submit(preset) {
    if (busy) return;
    const raw = String(preset != null ? preset : input.value).trim();
    if (raw.length < 2) { input.focus(); return; }
    const nav = window.GK_NAV; if (!nav) return;
    const link = looksLink(raw), words = raw.split(/\s+/).length;
    const isText = !link && (words >= 25 || raw.length > 220 || (raw.match(/\n/g) || []).length >= 2);
    busy = true; btn.disabled = true;
    try {
      if (nav.hasMap()) {   // un tema nuevo cambia de mapa: el actual queda guardado en Mis Proyectos
        const ok = await appConfirm(L('Empezar un tema nuevo cierra el mapa actual. Queda guardado en Mis Proyectos si tienes sesión iniciada. ¿Seguimos?', 'Starting a new topic closes the current map. It stays saved in My Projects if you are signed in. Continue?'), { title: L('Tema nuevo', 'New topic'), okText: L('Sí, tema nuevo', 'Yes, new topic'), cancelText: L('Cancelar', 'Cancel') });
        if (!ok) return;
        await startFreshCanvas();
        try { if (window.__gkRhizomeView) window.__gkRhizomeView(false); } catch (_e) { /* nada */ }
        nav.setActive('');
      }
      input.value = ''; input.style.height = 'auto'; measure();
      if (link || isText) {
        trk('chat_submit', { kind: link ? 'link' : 'text' });
        const src = link && /^www\./i.test(raw) ? 'https://' + raw : raw;
        nav.setTopic('');
        readerTextMode.innerText = src; readerTextMode.dispatchEvent(new Event('input', { bubbles: true }));
        await generateFromReaderText();   // mismo camino que «Generar esquema» del Modo Lector: lee el enlace, estructura el texto y arma el mapa
      } else {
        trk('chat_submit', { kind: 'topic', topic: raw.slice(0, 80) });
        nav.setTopic(raw);
        if (window.GK_CARDS && window.GK_CARDS.enabled()) nav.cards(raw, { fromMap: false });
        else nav.go('mapa');
      }
    } catch (e) {
      console.error(e);
    } finally { busy = false; btn.disabled = false; }
  }

  /* Pestañas sin tema: en vez de no hacer nada, la barra se sacude y explica qué falta. */
  const TABN = { mapa: L('el mapa mental', 'the mind map'), rizoma: L('el rizoma', 'the rhizome'), camino: L('Camino', 'Path'), genio: L('Genio', 'Genius'), claridad: L('Claridad', 'Clarity'), cosmos: L('Cosmos', 'Cosmos'), todas: L('las tarjetas', 'the cards') };
  let needT = 0;
  window.GK_NEEDTOPIC = (k) => {
    try {
      let n = document.getElementById('gkNeed'); if (!n) { n = document.createElement('div'); n.id = 'gkNeed'; n.setAttribute('role', 'status'); document.body.appendChild(n); }
      n.textContent = L('Para ver ' + (TABN[k] || 'esto') + ', escribe primero un tema aquí abajo y pulsa Estudiar.', 'To see ' + (TABN[k] || 'this') + ', type a topic below first and press Study.');
      n.classList.add('on'); comp.classList.remove('need'); void comp.offsetWidth; comp.classList.add('need');
      clearTimeout(needT); needT = setTimeout(() => { n.classList.remove('on'); comp.classList.remove('need'); }, 4200);
      trk('tab_needs_topic', { tab: k });
    } catch (_e) { /* nada */ }
  };

  /* ---------- pestañas ---------- */
  function buildTabs() {
    const anchor = document.getElementById('btnToggleReader'); if (!anchor || !anchor.parentNode) return false;
    tabs = document.createElement('nav'); tabs.id = 'gkTabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', L('Cómo explorar el tema', 'How to explore the topic'));
    const t = (k, icon, name, title) => '<button type="button" role="tab" data-tab="' + k + '" aria-selected="false" title="' + esc(title || name) + '">' + icon + '<span class="tl">' + esc(name) + '</span></button>';
    tabs.innerHTML =
      '<button type="button" class="all" role="tab" data-tab="todas" aria-selected="false" title="' + esc(L('Ver todas las tarjetas', 'See all cards')) + '">⊞</button>' +
      '<span class="sep"></span>' + t('mapa', (window.GK_IC ? window.GK_IC('mapa') : ''), L('Mapa mental', 'Mind map')) + t('rizoma', (window.GK_IC ? window.GK_IC('rizoma') : ''), L('Rizoma', 'Rhizome')) + '<span class="sep"></span>' +
      '<span class="len">' + t('camino', (window.GK_IC ? window.GK_IC('camino') : ''), L('Camino', 'Path'), L('Cómo llegar ahí', 'How to get there')) + t('genio', (window.GK_IC ? window.GK_IC('genio') : ''), L('Genio', 'Genius'), L('Entender como un genio', 'Understand it like a genius')) + t('claridad', (window.GK_IC ? window.GK_IC('claridad') : ''), L('Claridad', 'Clarity'), L('De la confusión a la claridad', 'From confusion to clarity')) + t('cosmos', (window.GK_IC ? window.GK_IC('cosmos') : ''), L('Cosmos', 'Cosmos'), L('Tu mapa mental en 3D, como un recorrido', 'Your mind map in 3D, as a flythrough')) + '</span><span class="sep"></span>' + t('biblioteca', (window.GK_IC ? window.GK_IC('biblio') : ''), L('Biblioteca', 'Library'), L('Todos tus mapas juntos y cómo se conectan', 'All your maps together and how they connect')) ;
    const slot = document.querySelector('#mainHeader .flex.gap-2.flex-1.min-w-0');   // hueco que antes ocupaba el buscador
    if (slot) { slot.classList.add('gk-tabslot'); slot.appendChild(tabs); } else anchor.parentNode.insertBefore(tabs, anchor);
    buildCtl();
    const tt = document.getElementById('topicTab');   // «Ver texto» (texto del tema, a la izquierda): empieza cerrado
    if (tt) { document.body.appendChild(tt); tt.title = L('Abre el texto de este tema', 'Open the text of this topic'); }
    tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; trk('chat_tab', { tab: b.dataset.tab }); window.GK_NAV.go(b.dataset.tab); });
    return true;
  }
  /* Modo, Vista, sonido y Limpiar viven en la esquina de abajo a la izquierda (se mueven los mismos botones, con sus eventos). */
  function buildCtl() {
    const mode = $('#schemaLayoutMode'), view = $('#viewMode'), snd = $('#btnSoundToggle'), clr = $('#btnClear');
    const box = document.createElement('div'); box.id = 'gkCtl';
    const row = (el) => { const d = document.createElement('div'); if (el) d.appendChild(el); box.appendChild(d); return d; };
    if (mode && mode.parentElement) row(mode.parentElement);
    if (view && view.parentElement) row(view.parentElement);
    const last = row(); last.classList.add('gk-ctl-row');
    if (clr) last.appendChild(clr);
    if (snd) last.appendChild(snd);
    document.body.appendChild(box);
  }
  function paintTabs(active) {
    if (!tabs) return;
    tabs.querySelectorAll('[data-tab]').forEach((b) => { const on = b.dataset.tab === active; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    document.body.classList.toggle('gk-rz', active === 'rizoma');
    document.body.style.setProperty('--gk-tt-top', (parseInt(getComputedStyle(document.body).getPropertyValue('--gk-head-h'), 10) || 64) + (active === 'rizoma' ? 54 : 14) + 'px');   // en el rizoma baja un poco para no tapar su cabecera
    tabs.classList.toggle('idle', !window.GK_NAV.topic());
    // Modo (Cerebro/Árbol) y Vista son del mapa: solo se ven mientras se mira el mapa.
    const mapView = active === 'mapa' || (!active && window.GK_NAV.hasMap() && window.GK_NAV.lastView() === 'mapa');
    ['schemaLayoutMode', 'viewMode'].forEach((id) => { const el = document.getElementById(id); const w = el && el.parentElement; if (w) w.style.display = mapView ? '' : 'none'; });
  }

  /* ---------- inicio vacío ---------- */
  function buildHero() {
    hero = document.createElement('div'); hero.id = 'gkHero';
    const chips = EN() ? ['The Fermi Paradox', 'String Theory', 'Plato’s Cave', 'How inflation works'] : ['La Paradoja de Fermi', 'La Teoría de Cuerdas', 'El Mito de la Caverna', 'Cómo funciona la inflación'];
    hero.innerHTML = '<div class="gh-logo">Γ</div><h1>' + esc(L('¿Qué quieres estudiar hoy?', 'What do you want to study today?')) + '</h1><p>' + esc(L('Escribe un tema, pega un texto o un enlace. Después eliges cómo explorarlo: mapa mental, rizoma o una de las lentes que te lo explican a fondo.', 'Type a topic, paste a text or a link. Then pick how to explore it: mind map, rhizome, or one of the lenses that explain it in depth.')) + '</p><div class="gh-c">' + chips.map((c) => '<button type="button">' + esc(c) + '</button>').join('') + '</div>';
    hero.insertAdjacentHTML('beforeend', '<span class="gh-arrow" aria-hidden="true">↓</span>');
    document.body.appendChild(hero);
    hero.querySelectorAll('.gh-c button').forEach((b) => b.addEventListener('click', () => submit(b.textContent)));
  }

  /* ---------- medidas y sincronía ---------- */
  function measure() {
    const hd = document.getElementById('mainHeader');
    if (hd) document.body.style.setProperty('--gk-head-h', Math.round(hd.getBoundingClientRect().bottom) + 'px');
    if (comp) document.body.style.setProperty('--gk-comp-h', Math.round(comp.offsetHeight) + 'px');
    const vp = document.getElementById('vizPanel');   // «Mis notas» queda siempre abajo: las vistas a pantalla completa le dejan su espacio
    document.body.style.setProperty('--gk-notes-h', (vp && vp.classList.contains('on') ? Math.round(vp.getBoundingClientRect().height) : 0) + 'px');
    // La barra se queda entre los paneles laterales (texto a la izquierda, definiciones a la derecha), igual que «Mis notas».
    if (comp) {
      const vis = (id) => { const e = document.getElementById(id); return e && !e.classList.contains('hidden') && e.offsetWidth > 0 ? e : null; };
      const rd = vis('readerPanel'), tp = document.getElementById('topicPanel'), dv = vis('defsView');
      const l = rd ? rd.getBoundingClientRect().width : (tp && tp.classList.contains('on') ? tp.getBoundingClientRect().width : 0);
      const r = dv ? dv.getBoundingClientRect().width : 0;
      const cover = !!(document.querySelector('#gkLens:not([hidden])') || document.querySelector('#gkCards:not([hidden])'));
      document.body.classList.toggle('gk-cover', cover);
      const gs = document.querySelector('#gkLens:not([hidden]) #glSide'); const sideW = gs && window.innerWidth > 860 ? Math.round(gs.getBoundingClientRect().width) : 0;
      document.body.style.setProperty('--gk-side-w', sideW + 'px');
      const ctl = document.getElementById('gkCtl'); const cw = ctl ? Math.round(ctl.getBoundingClientRect().width) + 28 : 16;
      comp.style.paddingLeft = Math.max(cw, 16 + (cover ? 0 : Math.round(l))) + 'px'; comp.style.paddingRight = (16 + (cover ? sideW : Math.round(r))) + 'px';
    }
  }
  function sync() {
    const nav = window.GK_NAV; if (!nav) return;
    measure();
    const overlay = !!(document.querySelector('#gkLens:not([hidden])') || document.querySelector('#gkCards:not([hidden])'));
    if (nav.hasMap() && !nav.active()) nav.setActive(nav.lastView());
    if (!nav.hasMap() && nav.active() === 'mapa') nav.setActive('');
    if (hero) hero.classList.toggle('on', !nav.hasMap() && !overlay);
    paintTabs(nav.active());
  }

  function start() {
    if (!window.GK_NAV || !document.getElementById('mainHeader')) return setTimeout(start, 150);
    injectCss();
    document.body.classList.add('gk-chat');
    buildComposer(); buildTabs(); buildHero();
    window.GK_NAV.onChange(paintTabs);
    window.addEventListener('resize', () => { measure(); });
    try { if (window.ResizeObserver) { const ro = new ResizeObserver(measure); ro.observe(document.getElementById('mainHeader')); ro.observe(comp); } } catch (_e) { /* nada */ }
    setInterval(sync, 500); sync();
    trk('chat_mode_on', {});
    // Visitantes de Facebook: de entrada ven las tarjetas con un campo para escribir el tema (lentes.js: GK_FB).
    setTimeout(() => { try { if (window.GK_FB && window.GK_FB.entry() && window.GK_CARDS && !window.GK_NAV.hasMap()) window.GK_CARDS.open('', { entry: true }); } catch (_e) { /* nada */ } }, 700);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
