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
body.gk-cover #vizPanel{z-index:150;left:0 !important;right:var(--gk-side-w,0px) !important;--p-bg:#0d1226;--p-bg2:#161c35;--p-head:#0d1226;--p-ink:#eef1fb;--p-ink2:#c7d2e8;--p-mute:#8a92b2;--p-rule:#2c3458;--p-acc:#4fd1c5;--p-acc-bg:rgba(79,209,197,.14);box-shadow:none;scrollbar-color:#2c3458 transparent}
body.gk-cover #vizPanel .vz-btn, body.gk-cover #vizPanel .vz-quote button, body.gk-cover #vizPanel .vz-ghost, body.gk-cover #vizPanel .vz-note, body.gk-cover #vizPanel .vz-note-form textarea, body.gk-cover #vizPanel .vz-rh-ctl select{background:#161c35;color:#eef1fb}
body.gk-cover #vizPanel .vz-primary{color:#071018}
body.gk-chat #rhzToggle{display:none !important}
body.gk-chat #mainHeader #topicTab.on{display:inline-flex;position:static;flex:0 0 auto;margin-left:10px;align-items:center;gap:6px;padding:7px 16px;border-radius:999px;border:0;background:linear-gradient(120deg,#4fd1c5,#8b7cf6);color:#071018;font:700 13px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 18px rgba(79,209,197,.35)}
body.gk-chat #mainHeader #topicTab.on:hover{filter:brightness(1.1);background:linear-gradient(120deg,#4fd1c5,#8b7cf6)}
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
#gkComposer .gc-h{display:none !important}   /* sin renglón de ayuda: el espacio es del lienzo */
body.gk-chat #mainHeader h1{display:none !important}
@media (min-width:1500px){body.gk-chat #mainHeader h1{display:block !important}}
body.gk-chat #gkTabs button{padding:6px 10px}
body.gk-chat #gkTabs .len button{padding:4px 9px}
body.gk-chat #gkTabs{gap:3px}
body.gk-cover #defsView, body.gk-cover #topicPanel, body.gk-cover #readerPanel{visibility:hidden !important}   /* con una lente o las tarjetas a pantalla completa, los paneles laterales no asoman por debajo */
body.gk-chat #vizPanel{bottom:var(--gk-comp-h,0px)}
body.gk-chat #gkResume{bottom:calc(var(--gk-comp-h,0px) + 16px)}
#gkComposer{flex:0 0 auto;position:relative;z-index:31;padding:6px 16px 10px;background:linear-gradient(rgba(10,14,26,0),#0a0e1a 35%);font-family:Inter,system-ui,sans-serif}
#gkComposer .gc-in{max-width:880px;margin:0 auto;display:flex;align-items:flex-end;gap:10px;background:#11162b;border:1px solid #2c3458;border-radius:22px;padding:8px 8px 8px 18px;box-shadow:0 10px 40px rgba(0,0,0,.45);transition:border-color .15s,box-shadow .15s}
#gkComposer .gc-in:focus-within{border-color:#4fd1c5;box-shadow:0 10px 40px rgba(0,0,0,.45),0 0 0 3px rgba(79,209,197,.16)}
#gkComposer textarea{flex:1;min-width:0;background:transparent;border:0;outline:0;resize:none;color:#eef1fb;font:400 15px/1.5 Inter,system-ui,sans-serif;padding:8px 0;max-height:168px;overflow-y:auto}
#gkComposer textarea::placeholder{color:#6a7399}
#gkComposer button{flex:0 0 auto;border:0;border-radius:15px;background:#4fd1c5;color:#071018;padding:10px 22px;font:700 14px Inter,system-ui,sans-serif;cursor:pointer;transition:filter .15s,transform .1s}
#gkComposer button:hover{filter:brightness(1.08)}
#gkComposer button:active{transform:scale(.97)}
#gkComposer button:disabled{opacity:.5;cursor:wait}
#gkComposer .gc-h{max-width:880px;margin:6px auto 0;text-align:center;font-size:11.5px;color:#5b6388}
#gkTabs{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
#gkTabs::-webkit-scrollbar{display:none}
#gkTabs button{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;border:1px solid transparent;background:none;color:#aab2d0;border-radius:999px;padding:6px 13px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
#gkTabs button:hover{color:#eef1fb;background:#161c35}
#gkTabs button.on{background:#1d2442;color:#4fd1c5;border-color:#2c3458}
#gkTabs button.all{padding:6px 10px;color:#8a92b2}
#gkTabs.idle button:not(.all){opacity:.55}
#gkTabs .sep{flex:0 0 1px;height:18px;background:#2c3458;margin:0 4px}
#gkTabs .len{display:flex;align-items:center;gap:2px;padding:2px;border-radius:999px;border:1.5px solid transparent;background:linear-gradient(#0f1428,#0f1428) padding-box,linear-gradient(130deg,#4fd1c5,#8b7cf6) border-box}
#gkTabs .len button{padding:4px 11px}
#gkTabs .len button.on{background:linear-gradient(120deg,rgba(79,209,197,.22),rgba(139,124,246,.24));color:#eef1fb;border-color:transparent}
#gkHero{position:fixed;left:0;right:0;top:var(--gk-head-h,0px);bottom:var(--gk-comp-h,0px);z-index:12;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;pointer-events:none;font-family:Inter,system-ui,sans-serif}
#gkHero.on{display:flex}
#gkHero .gh-logo{width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#4fd1c5,#8b7cf6);display:flex;align-items:center;justify-content:center;font:700 28px Sora,Inter,sans-serif;color:#071018;margin-bottom:18px;box-shadow:0 0 40px rgba(79,209,197,.3)}
#gkHero h1{font:700 clamp(26px,3.6vw,38px)/1.2 Sora,Inter,sans-serif;color:#eef1fb;margin:0 0 10px}
#gkHero p{max-width:520px;color:#8a92b2;font-size:15px;line-height:1.55;margin:0 0 22px}
#gkHero .gh-c{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:640px;pointer-events:auto}
#gkHero .gh-c button{border:1px solid #2c3458;background:#11162b;color:#c7d2e8;border-radius:999px;padding:8px 15px;font:500 13.5px Inter,system-ui,sans-serif;cursor:pointer;transition:border-color .15s,color .15s}
#gkHero .gh-c button:hover{border-color:#4fd1c5;color:#4fd1c5}
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
        trk('chat_submit', { kind: 'topic' });
        nav.setTopic(raw);
        if (window.GK_CARDS && window.GK_CARDS.enabled()) nav.cards(raw, { fromMap: false });
        else nav.go('mapa');
      }
    } catch (e) {
      console.error(e);
    } finally { busy = false; btn.disabled = false; }
  }

  /* ---------- pestañas ---------- */
  function buildTabs() {
    const anchor = document.getElementById('btnToggleReader'); if (!anchor || !anchor.parentNode) return false;
    tabs = document.createElement('nav'); tabs.id = 'gkTabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', L('Cómo explorar el tema', 'How to explore the topic'));
    const t = (k, icon, name, title) => '<button type="button" role="tab" data-tab="' + k + '" aria-selected="false" title="' + esc(title || name) + '">' + icon + ' ' + esc(name) + '</button>';
    tabs.innerHTML =
      '<button type="button" class="all" role="tab" data-tab="todas" aria-selected="false" title="' + esc(L('Ver todas las tarjetas', 'See all cards')) + '">⊞</button>' +
      '<span class="sep"></span>' + t('mapa', '🗺️', L('Mapa mental', 'Mind map')) + t('rizoma', '🕸️', L('Rizoma', 'Rhizome')) + '<span class="sep"></span>' +
      '<span class="len">' + t('camino', '🧭', L('Camino', 'Path'), L('Cómo llegar ahí', 'How to get there')) + t('genio', '🧠', L('Genio', 'Genius'), L('Entender como un genio', 'Understand it like a genius')) + t('claridad', '💡', L('Claridad', 'Clarity'), L('De la confusión a la claridad', 'From confusion to clarity')) + '</span>';
    const slot = document.querySelector('#mainHeader .flex.gap-2.flex-1.min-w-0');   // hueco que antes ocupaba el buscador
    if (slot) { slot.classList.add('gk-tabslot'); slot.appendChild(tabs); } else anchor.parentNode.insertBefore(tabs, anchor);
    buildCtl();
    const tt = document.getElementById('topicTab');   // «Ver texto» (texto del tema, a la izquierda): empieza cerrado
    if (tt && slot) { slot.appendChild(tt); tt.title = L('Abre el texto de este tema', 'Open the text of this topic'); }
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
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
