/* Graphikosmos · gemas y tienda. Un solo módulo para escritorio, móvil (/m/) e idiomas (/idiomas/).
   - 1 nodo = 250 gemas (el saldo del servidor sigue en nodos; la gema es la unidad que ve la persona).
   - openShop(): paquetes de gemas → enlace de PayPal. Registra la intención de compra en el servidor antes de salir.
   - Al volver de PayPal (?pago=FICHA) reclama las gemas con esa ficha (ver netlify/functions/pay.js). */
(function () {
  'use strict';
  if (window.GK_GEMS) return;
  const GEMS_PER_NODE = 250;
  const FN = '/.netlify/functions/pay';
  const WA = '50687772993';
  const EN = /^\/en(\/|$)/.test(location.pathname) || /^en/i.test(document.documentElement.lang || '');
  const T = EN ? {
    shopTitle: 'Get more gems', shopSub: 'Gems are what each new idea on your map uses.',
    best: 'Best price', rec: 'Recommended', gems: 'gems', buy: 'Buy',
    safe: 'Secure payment with PayPal. When you finish you come back here and your gems are added automatically.',
    need: 'Create your free account to buy gems.', login: 'Sign up / Log in', help: 'Need help? Message us',
    opening: 'Opening PayPal…', fail: 'We could not start the purchase. Try again.', rate: 'Too many attempts. Wait a few minutes.',
    okTitle: 'Gems added!', okLine: (a, b) => `+${a} gems. You now have ${b}.`, already: (b) => `This purchase was already added. You have ${b} gems.`,
    cont: 'Continue', close: 'Close', waiting: 'Confirming your purchase…',
    loginFirst: 'Log in to receive your gems', loginFirstSub: 'Use the same account you bought with and we add them right away.',
    noIntent: 'We could not match this payment to your account', noIntentSub: 'If you already paid, message us with your email and we add them by hand.',
    err: 'We could not confirm the purchase', errSub: 'Try again in a minute or message us.',
    coolIntent: (t) => `You bought recently. You can buy again in ${t}.`,
    coolClaim: 'Your last purchase was too recent', coolClaimSub: (t) => `You can add gems from a new purchase in ${t}. If you already paid, message us and we add them by hand.`
  } : {
    shopTitle: 'Consigue más gemas', shopSub: 'Las gemas son lo que gasta cada idea nueva de tu mapa.',
    best: 'Mejor precio', rec: 'Recomendado', gems: 'gemas', buy: 'Comprar',
    safe: 'Pago seguro con PayPal. Al terminar vuelves aquí y tus gemas se acreditan solas.',
    need: 'Crea tu cuenta gratis para comprar gemas.', login: 'Registrarme / Entrar', help: '¿Necesitas ayuda? Escríbenos',
    opening: 'Abriendo PayPal…', fail: 'No pudimos iniciar la compra. Intenta de nuevo.', rate: 'Demasiados intentos. Espera unos minutos.',
    okTitle: '¡Gemas acreditadas!', okLine: (a, b) => `+${a} gemas. Ahora tienes ${b}.`, already: (b) => `Esta compra ya estaba acreditada. Tienes ${b} gemas.`,
    cont: 'Seguir', close: 'Cerrar', waiting: 'Confirmando tu compra…',
    loginFirst: 'Inicia sesión para recibir tus gemas', loginFirstSub: 'Entra con la misma cuenta con la que compraste y se acreditan al instante.',
    noIntent: 'No pudimos asociar este pago a tu cuenta', noIntentSub: 'Si ya pagaste, escríbenos con tu correo y las acreditamos a mano.',
    err: 'No pudimos confirmar la compra', errSub: 'Intenta de nuevo en un minuto o escríbenos.',
    coolIntent: (t) => `Hiciste una compra hace poco. Podrás comprar de nuevo en ${t}.`,
    coolClaim: 'Tu última compra fue muy reciente', coolClaimSub: (t) => `Podrás acreditar gemas de una compra nueva en ${t}. Si ya pagaste, escríbenos y las acreditamos a mano.`
  };
  const PACKS = [
    { id: 'g15', gems: 15000, usd: '4.99' },
    { id: 'g40', gems: 40000, usd: '9.99', tag: 'rec' },
    { id: 'g100', gems: 100000, usd: '19.99', tag: 'best' }
  ];

  function leftText(ms) {
    const m = Math.max(1, Math.ceil((Number(ms) || 0) / 60000)), hh = Math.floor(m / 60), mm = m % 60;
    if (hh >= 1) return hh + ' h' + (mm ? ' ' + mm + ' min' : '');
    return m + ' min';
  }
  const cfg = { from: 'graphikosmos', refresh: null };
  function fmt(n) { return Math.round(Number(n) || 0).toLocaleString(EN ? 'en-US' : 'es-CR').replace(/ /g, ' '); }
  function nodesToGems(nodes) { return Math.max(0, Math.round((Number(nodes) || 0) * GEMS_PER_NODE)); }
  function user() { try { return window.netlifyIdentity ? netlifyIdentity.currentUser() : null; } catch (e) { return null; } }
  async function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    try { const u = user(); if (u) { const t = await u.jwt(); if (t) h.Authorization = 'Bearer ' + t; } } catch (e) { /* sin token */ }
    return h;
  }
  async function post(body) {
    let res;
    try { res = await fetch(FN, { method: 'POST', credentials: 'same-origin', headers: await authHeaders(), body: JSON.stringify(body) }); }
    catch (e) { return { ok: false, status: 0, data: {} }; }
    let data = {}; try { data = await res.json(); } catch (e) { /* nada */ }
    return { ok: res.ok, status: res.status, data };
  }

  /* ---------- Estilos (autocontenidos, no dependen de Tailwind ni de la app) ---------- */
  let styled = false;
  function addStyle() {
    if (styled) return; styled = true;
    const st = document.createElement('style');
    st.textContent = `
.gkg-ov{position:fixed;inset:0;z-index:100000;background:rgba(6,9,20,.78);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,-apple-system,Segoe UI,sans-serif}
.gkg-card{position:relative;width:100%;max-width:420px;max-height:92vh;overflow:auto;background:#11162b;color:#eef1fb;border:1px solid #262c47;border-radius:20px;padding:22px 20px 18px;box-shadow:0 24px 70px rgba(0,0,0,.55)}
.gkg-x{position:absolute;right:10px;top:8px;background:none;border:0;color:#8a92b2;font-size:26px;line-height:1;cursor:pointer;padding:6px 10px}
.gkg-card h2{margin:0 28px 4px 0;font:700 20px/1.2 Sora,Inter,sans-serif}
.gkg-sub{margin:0 0 16px;color:#b8bfdc;font-size:14px;line-height:1.45}
.gkg-pk{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;background:#161c35;border:1px solid #262c47;border-radius:14px;padding:14px;margin:0 0 10px;color:inherit;cursor:pointer;font:inherit}
.gkg-pk:hover,.gkg-pk:focus-visible{border-color:#4fd1c5;outline:none}
.gkg-pk.hot{border-color:#8b7cf6;background:#1a1f40}
.gkg-pk[disabled]{opacity:.6;cursor:wait}
.gkg-g{font:700 19px/1.1 Sora,Inter,sans-serif}
.gkg-g small{font:500 13px Inter,sans-serif;color:#b8bfdc;margin-left:4px}
.gkg-tag{display:inline-block;margin-top:5px;font-size:11px;font-weight:600;color:#0a0e1a;background:linear-gradient(135deg,#4fd1c5,#8b7cf6);border-radius:999px;padding:2px 9px}
.gkg-pr{font:700 17px Sora,Inter,sans-serif;white-space:nowrap}
.gkg-msg{min-height:1.3em;font-size:13px;color:#b8bfdc;margin:8px 0 0}
.gkg-msg.err{color:#ff8a9b}
.gkg-foot{font-size:12px;color:#8a92b2;line-height:1.5;margin:10px 0 0}
.gkg-foot a,.gkg-link{color:#4fd1c5}
.gkg-btn{display:block;width:100%;border:0;border-radius:12px;padding:13px 16px;font:700 15px Inter,sans-serif;color:#0a0e1a;background:linear-gradient(135deg,#4fd1c5,#8b7cf6);cursor:pointer;margin-top:8px}
.gkg-btn.sec{background:#161c35;color:#eef1fb;border:1px solid #262c47}
.gkg-big{font-size:34px;margin:2px 0 6px}
`;
    document.head.appendChild(st);
  }
  function h(tag, attrs, kids) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => { if (k === 'text') e.textContent = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach((c) => c && e.appendChild(c));
    return e;
  }
  let overlay = null;
  function closeOverlay() { if (overlay) { overlay.remove(); overlay = null; } document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') closeOverlay(); }
  function openOverlay(card) {
    addStyle(); closeOverlay();
    overlay = h('div', { class: 'gkg-ov', role: 'dialog', 'aria-modal': 'true' }, [card]);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    document.body.appendChild(overlay); document.addEventListener('keydown', onKey);
  }
  function helpLink() {
    return h('a', { class: 'gkg-link', href: 'https://wa.me/' + WA + '?text=' + encodeURIComponent(EN ? 'Hi, I need help with my gems on Graphikosmos.' : 'Hola, necesito ayuda con mis gemas de Graphikosmos.'), target: '_blank', rel: 'noopener', text: T.help });
  }
  function xBtn() { return h('button', { class: 'gkg-x', type: 'button', 'aria-label': T.close, text: '×', onclick: closeOverlay }); }

  /* ---------- Tienda ---------- */
  // Registro (solo para medir el embudo): quién abrió la tienda y desde dónde. Nunca debe romper nada.
  function trackShop(event, md) {
    try {
      let id = ''; try { id = localStorage.getItem('gk_anon_id') || ''; if (!id) { id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'a' + Math.random().toString(36).slice(2, 12); localStorage.setItem('gk_anon_id', id); } } catch (e) { /* nada */ }
      fetch('/.netlify/functions/track-event', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, anonId: id, metadata: md || {} }) }).catch(() => {});
    } catch (e) { /* nada */ }
  }
  function openShop(opts) {
    opts = opts || {};
    const from = opts.from || cfg.from;
    trackShop('shop_opened', { from, loggedIn: !!user() });
    const card = h('div', { class: 'gkg-card' }, [xBtn(), h('h2', { text: T.shopTitle }), h('p', { class: 'gkg-sub', text: T.shopSub })]);
    const msg = h('p', { class: 'gkg-msg', role: 'status' });
    if (!user()) {
      card.appendChild(h('p', { class: 'gkg-sub', text: T.need }));
      card.appendChild(h('button', { class: 'gkg-btn', type: 'button', text: T.login, onclick: () => { closeOverlay(); try { netlifyIdentity.open('signup'); } catch (e) { /* nada */ } } }));
      card.appendChild(h('p', { class: 'gkg-foot' }, [helpLink()]));
      openOverlay(card); return;
    }
    // En el escritorio (app principal) se ofrecen los paquetes de $9.99 y $19.99; el de $4.99 solo en el celular (2026-10-20).
    // Los tres siguen existiendo en el servidor por si alguien tiene un pago pendiente.
    ((from === 'graphikosmos' || from === 'escribir') && !/^\/m(\/|$)/.test(location.pathname) ? PACKS.filter((p) => p.id !== 'g15') : PACKS).forEach((p) => {
      const left = h('div', {}, [h('div', { class: 'gkg-g' }, [document.createTextNode(fmt(p.gems)), h('small', { text: T.gems })])]);
      if (p.tag) left.appendChild(h('span', { class: 'gkg-tag', text: p.tag === 'best' ? T.best : T.rec }));
      const b = h('button', { class: 'gkg-pk' + (p.tag === 'rec' ? ' hot' : ''), type: 'button', 'data-pack': p.id }, [left, h('div', { class: 'gkg-pr', text: '$' + p.usd })]);
      b.addEventListener('click', () => { trackShop('pack_clicked', { from, pack: p.id }); buy(p, from, card, msg); });
      card.appendChild(b);
    });
    card.appendChild(msg);
    card.appendChild(h('p', { class: 'gkg-foot' }, [document.createTextNode(T.safe + ' '), helpLink()]));
    openOverlay(card);
  }
  async function buy(p, from, card, msg) {
    card.querySelectorAll('.gkg-pk').forEach((b) => { b.disabled = true; });
    msg.className = 'gkg-msg'; msg.textContent = T.opening;
    // La pestaña se abre ya (con el clic) para que el bloqueador de ventanas no la frene; luego se le pone el enlace.
    let w = null; try { w = window.open('', '_blank'); } catch (e) { w = null; }
    const r = await post({ action: 'intent', packageId: p.id, from });
    card.querySelectorAll('.gkg-pk').forEach((b) => { b.disabled = false; });
    if (!r.ok || !r.data.url) {
      try { w && w.close(); } catch (e) { /* nada */ }
      msg.className = 'gkg-msg err'; msg.textContent = r.status === 429 ? (r.data && r.data.error === 'cooldown' ? T.coolIntent(leftText(r.data.msLeft)) : T.rate) : T.fail; return;
    }
    if (w) { try { w.opener = null; } catch (e) { /* nada */ } w.location.href = r.data.url; msg.textContent = ''; }
    else { location.href = r.data.url; }
  }

  /* ---------- Regreso de PayPal (?pago=FICHA) ---------- */
  const HOME = { idiomas: '/idiomas/', oraculo: '/oraculo/' };   // a dónde se vuelve tras pagar, según desde qué app se compró
  const PEND = 'gk_pago_pending';
  function readPending() { try { return JSON.parse(localStorage.getItem(PEND) || 'null'); } catch (e) { return null; } }
  function clearPending() { try { localStorage.removeItem(PEND); } catch (e) { /* nada */ } }
  function captureToken() {
    try {
      const u = new URL(location.href), t = u.searchParams.get('pago');
      if (!t) return;
      u.searchParams.delete('pago'); history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
      localStorage.setItem(PEND, JSON.stringify({ token: String(t).slice(0, 64), ts: Date.now() }));
    } catch (e) { /* nada */ }
  }
  function infoCard(title, sub, big, buttons) {
    const card = h('div', { class: 'gkg-card' }, [xBtn()]);
    if (big) card.appendChild(h('div', { class: 'gkg-big', text: big }));
    card.appendChild(h('h2', { text: title }));
    if (sub) card.appendChild(h('p', { class: 'gkg-sub', text: sub }));
    (buttons || []).forEach((b) => card.appendChild(b));
    return card;
  }
  let claiming = false, loginShown = false;
  async function processPending() {
    const pend = readPending(); if (!pend || claiming) return;
    if (Date.now() - pend.ts > 24 * 3600 * 1000) { clearPending(); return; }
    if (!user()) {
      if (!loginShown) {
        loginShown = true;
        openOverlay(infoCard(T.loginFirst, T.loginFirstSub, '💎', [h('button', { class: 'gkg-btn', type: 'button', text: T.login, onclick: () => { try { netlifyIdentity.open('login'); } catch (e) { /* nada */ } } })]));
      }
      return;
    }
    claiming = true;
    openOverlay(infoCard(T.waiting, '', '💎', []));
    const r = await post({ action: 'claim', token: pend.token });
    claiming = false;
    if (r.ok && r.data.success) {
      clearPending();
      try { localStorage.setItem('gk_gems_ts', String(Date.now())); } catch (e) { /* nada */ }
      const total = fmt(nodesToGems(r.data.balance));
      const line = r.data.already ? T.already(total) : T.okLine(fmt(r.data.gemsAdded), total);
      const dest = HOME[r.data.from] || null;
      const away = !!dest && location.pathname.indexOf(dest) !== 0;
      openOverlay(infoCard(T.okTitle, line, '💎', [h('button', { class: 'gkg-btn', type: 'button', text: T.cont, onclick: () => { closeOverlay(); if (away) location.replace(dest); } })]));
      if (typeof cfg.refresh === 'function') { try { cfg.refresh(r.data.balance); } catch (e) { /* nada */ } }
      if (away) setTimeout(() => { if (overlay) location.replace(dest); }, 3500);
      return;
    }
    if (r.status === 401) { loginShown = false; return; }
    if (r.status === 429 && r.data && r.data.error === 'cooldown') {
      clearPending();
      openOverlay(infoCard(T.coolClaim, T.coolClaimSub(leftText(r.data.msLeft)), '', [h('p', { class: 'gkg-foot' }, [helpLink()]), h('button', { class: 'gkg-btn sec', type: 'button', text: T.close, onclick: closeOverlay })]));
      return;
    }
    clearPending();
    const noIntent = r.status === 404 || (r.data && r.data.error === 'ficha_invalida');
    openOverlay(infoCard(noIntent ? T.noIntent : T.err, noIntent ? T.noIntentSub : T.errSub, '', [h('p', { class: 'gkg-foot' }, [helpLink()]), h('button', { class: 'gkg-btn sec', type: 'button', text: T.close, onclick: closeOverlay })]));
  }

  function init() {
    captureToken();
    if (!readPending()) return;
    let tries = 0;
    const tick = () => {
      if (!readPending()) return;
      tries++;
      if (user()) { processPending(); return; }
      if (window.netlifyIdentity && tries > 8) { processPending(); return; }   // ya cargó y no hay sesión: pide entrar
      if (tries < 50) setTimeout(tick, 400);
    };
    tick();
    try { window.netlifyIdentity && netlifyIdentity.on('login', () => { loginShown = false; closeOverlay(); processPending(); }); } catch (e) { /* nada */ }
  }
  // Otras pestañas (la de PayPal acredita y esta sigue abierta): se enteran por localStorage.
  window.addEventListener('storage', (e) => { if (e.key === 'gk_gems_ts' && typeof cfg.refresh === 'function') { try { cfg.refresh(); } catch (er) { /* nada */ } } });

  window.GK_GEMS = {
    GEMS_PER_NODE, fmt, nodesToGems, openShop, processPending,
    gemsLabel: (nodes) => fmt(nodesToGems(nodes)),
    configure: (o) => Object.assign(cfg, o || {})
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
