/* SuperLiveChat — app web (sin dependencias). Servidor: /.netlify/functions/slc  ·  Sesión: Supabase Auth por REST. */
(function () {
'use strict';
const FN = '/.netlify/functions/';
const $app = document.getElementById('app');
const LS = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }, del(k) { try { localStorage.removeItem(k); } catch (_) {} } };
const S = { cfg: null, sess: null, me: null, tab: 'discover', queue: [], people: [], convs: [], gems: 0, unread: 0, country: '', openConv: null, call: null, incoming: null, busy: false };

/* ---------- utilidades ---------- */
function el(tag, attrs) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v); else if (k === 'style') n.style.cssText = v; else n.setAttribute(k, v === true ? '' : v); }
    for (let i = 2; i < arguments.length; i++) { const c = arguments[i]; if (c == null || c === false) continue; if (Array.isArray(c)) c.forEach((x) => x && n.append(x)); else n.append(c instanceof Node ? c : document.createTextNode(String(c))); }
    return n;
}
const icon = (id, cls) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ic ' + (cls || '')); s.setAttribute('aria-hidden', 'true'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#i-' + id); s.append(u); return s; };
const bg = (u) => (u ? 'background-image:url("' + String(u).replace(/"/g, '%22') + '")' : '');
const flag = (c) => (c && /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map((x) => 127397 + x.charCodeAt(0))) : '');
const nf = (n) => String(Math.round(Number(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
let toastT; function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }
function mount(...nodes) { $app.replaceChildren(...nodes.filter(Boolean)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function sheet(content, onClose) {
    const scrim = el('div', { class: 'scrim', role: 'dialog', 'aria-modal': 'true' });
    const close = () => { scrim.remove(); if (onClose) onClose(); };
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
    scrim.append(el('div', { class: 'sheet' }, typeof content === 'function' ? content(close) : content));
    document.body.append(scrim); return close;
}

/* ---------- sesión (Supabase Auth por REST) ---------- */
function saveSess(j) { if (!j || !j.access_token) return false; S.sess = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (parseInt(j.expires_in, 10) || 3600) }; LS.set('slc_sess', JSON.stringify(S.sess)); return true; }
function loadSess() { try { S.sess = JSON.parse(LS.get('slc_sess') || 'null'); } catch (_) { S.sess = null; } }
function readHash() {
    const h = location.hash.replace(/^#/, ''); if (!/access_token=|error_description=/.test(h)) return null;
    const p = new URLSearchParams(h); history.replaceState(null, '', location.pathname + location.search);
    if (p.get('error_description')) return { error: p.get('error_description') };
    return { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: p.get('expires_in') };
}
async function authFetch(path, body) {
    const r = await fetch(S.cfg.url + '/auth/v1/' + path, { method: 'POST', headers: { apikey: S.cfg.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'No se pudo completar');
    return j;
}
async function refresh() {
    if (!S.sess || !S.sess.refresh_token) return false;
    try { const j = await authFetch('token?grant_type=refresh_token', { refresh_token: S.sess.refresh_token }); return saveSess(j); } catch (_) { return false; }
}
function logout() { LS.del('slc_sess'); S.sess = null; S.me = null; stopPoll(); location.reload(); }
async function api(action, data, retry) {
    if (S.sess && S.sess.expires_at - 60 < Date.now() / 1000) await refresh();
    if (!S.sess) throw Object.assign(new Error('Inicia sesión'), { codigo: 'sin_sesion' });
    const r = await fetch(FN + 'slc', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.sess.access_token }, body: JSON.stringify(Object.assign({ action }, data || {})) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && !retry && await refresh()) return api(action, data, true);
    if (r.status === 401) { LS.del('slc_sess'); S.sess = null; start(); throw Object.assign(new Error(j.error || 'Sesión vencida'), { codigo: 'sin_sesion' }); }
    if (!r.ok) throw Object.assign(new Error(j.error || 'Algo falló'), j, { status: r.status });
    return j;
}

/* ---------- inicio ---------- */
async function start() {
    stopPoll();
    try { S.cfg = S.cfg || await (await fetch(FN + 'slc-config')).json(); } catch (_) { S.cfg = { ok: false }; }
    if (!S.cfg.ok) return mount(el('div', { class: 'sheetpage' }, el('span', { class: 'wordmark' }, el('i'), 'SuperLiveChat'), el('h2', { text: 'Casi listo' }), el('p', { class: 'note', text: 'Estamos terminando de configurar el servicio. Vuelve en un rato.' })));
    const h = readHash(); if (h && h.error) toast(h.error); else if (h) saveSess(h);
    if (!S.sess) loadSess();
    if (!S.sess) return landing();
    try { S.me = await api('me'); } catch (e) { if (e.codigo === 'sin_sesion') return; if (e.codigo === 'sin_confirmar') return landing(); return mount(el('div', { class: 'empty' }, el('b', { text: 'No pudimos conectar' }), e.message, el('p', null, el('button', { class: 'btn', onclick: start, text: 'Reintentar' })))); }
    if (!S.me.profile) return onboardProfile();
    if (S.me.profile.status !== 'active') return onboardPhoto();
    S.gems = S.me.profile.gems; enterApp();
}

/* ---------- entrada ---------- */
function landing() {
    const err = el('div', { class: 'err' });
    const email = el('input', { type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'tu@correo.com', required: true });
    const ph = (src, cls) => { const d = el('div', { class: 'ph empty' }); const im = new Image(); im.onload = () => { d.classList.remove('empty'); d.style.backgroundImage = 'url(' + src + ')'; }; im.src = src; return d; };
    const go = async (e) => {
        e.preventDefault(); err.textContent = ''; const v = email.value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) { err.textContent = 'Escribe un correo válido.'; return; }
        btn.disabled = true; btn.textContent = 'Enviando…';
        try { await authFetch('otp', { email: v, create_user: true }); codeStep(v); } catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'Recibir código por correo'; }
    };
    const btn = el('button', { class: 'btn block', type: 'submit', text: 'Recibir código por correo' });
    mount(el('div', { class: 'land' },
        el('div', { class: 'hero', 'aria-hidden': 'true' }, ph('img/hero-woman.jpg'), ph('img/hero-man.jpg')),
        el('div', { class: 'panel' },
            el('span', { class: 'wordmark' }, el('i'), 'SuperLiveChat'),
            el('h1', { text: 'Conoce a alguien hoy. Hablen gratis.' }),
            el('p', { class: 'lead', text: 'Mira fotos, haz match, escribe sin límite y, cuando haya química, pasa a la videollamada.' }),
            el('button', { class: 'btn google block', onclick: () => { location.href = S.cfg.url + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(location.origin + '/superlivechat/'); } }, 'Continuar con Google'),
            el('div', { class: 'or', text: 'o con tu correo' }),
            el('form', { onsubmit: go }, el('label', { class: 'field' }, el('span', { text: 'Correo' }), email), err, btn),
            el('p', { class: 'legal', text: 'Solo para mayores de 18 años. Al entrar aceptas tratar a las demás personas con respeto; las fotos se revisan automáticamente.' }))));
}
function codeStep(mail) {
    const err = el('div', { class: 'err' }); const inp = el('input', { class: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '8', placeholder: '······', required: true });
    const btn = el('button', { class: 'btn block', type: 'submit', text: 'Confirmar' });
    mount(el('div', { class: 'sheetpage' }, el('span', { class: 'wordmark' }, el('i'), 'SuperLiveChat'), el('h2', { text: 'Revisa tu correo' }), el('p', { class: 'note', text: 'Te enviamos un código a ' + mail + '. Escríbelo aquí (o toca el enlace del correo).' }),
        el('form', { onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; btn.disabled = true; try { const j = await authFetch('verify', { type: 'email', email: mail, token: inp.value.replace(/\D/g, '') }); saveSess(j); start(); } catch (x) { err.textContent = 'Código incorrecto o vencido.'; btn.disabled = false; } } }, el('label', { class: 'field' }, el('span', { text: 'Código' }), inp), err, btn),
        el('button', { class: 'link', onclick: landing, text: 'Usar otro correo' })));
    inp.focus();
}
function onboardProfile() {
    let gender = '', seeking = ''; const err = el('div', { class: 'err' });
    const seg = (opts, get, set) => { const w = el('div', { class: 'seg' }); const draw = () => w.replaceChildren(...opts.map(([v, t]) => el('button', { type: 'button', class: get() === v ? 'on' : '', onclick: () => { set(v); draw(); }, text: t }))); draw(); return w; };
    const name = el('input', { maxlength: '30', autocomplete: 'given-name', placeholder: 'Cómo te llamas' });
    const bd = el('input', { type: 'date', max: new Date(Date.now() - 18 * 365.25 * 864e5).toISOString().slice(0, 10), min: '1920-01-01' });
    const bio = el('textarea', { maxlength: '300', placeholder: 'Opcional: una frase sobre ti' }); const adult = el('input', { type: 'checkbox', id: 'adult' });
    const btn = el('button', { class: 'btn block', type: 'submit', text: 'Continuar' });
    mount(el('div', { class: 'sheetpage' }, el('span', { class: 'wordmark' }, el('i'), 'SuperLiveChat'), el('h2', { text: 'Crea tu perfil' }), el('p', { class: 'note', text: 'Tu género y fecha de nacimiento no se pueden cambiar después.' }),
        el('form', { onsubmit: async (e) => {
            e.preventDefault(); err.textContent = '';
            if (!name.value.trim() || !gender || !seeking || !bd.value) { err.textContent = 'Completa todos los datos.'; return; }
            if (!adult.checked) { err.textContent = 'Confirma que eres mayor de edad.'; return; }
            btn.disabled = true; try { await api('saveProfile', { name: name.value, gender, seeking, birthdate: bd.value, bio: bio.value, adult: true }); S.me = await api('me'); onboardPhoto(); } catch (x) { err.textContent = x.message; btn.disabled = false; }
        } },
            el('label', { class: 'field' }, el('span', { text: 'Nombre' }), name),
            el('div', { class: 'field' }, el('span', { text: 'Soy' }), seg([['m', 'Hombre'], ['f', 'Mujer']], () => gender, (v) => { gender = v; })),
            el('label', { class: 'field' }, el('span', { text: 'Fecha de nacimiento' }), bd),
            el('div', { class: 'field' }, el('span', { text: 'Quiero conocer' }), seg([['f', 'Mujeres'], ['m', 'Hombres'], ['b', 'Ambos']], () => seeking, (v) => { seeking = v; })),
            el('label', { class: 'field' }, el('span', { text: 'Sobre mí' }), bio),
            el('label', { class: 'field', style: 'display:flex;gap:10px;align-items:flex-start' }, adult, el('span', { style: 'margin:0', text: 'Tengo 18 años o más.' })), err, btn),
        el('button', { class: 'link', onclick: logout, text: 'Salir' })));
}
function onboardPhoto() {
    const p = S.me.profile, photos = S.me.photos; const err = el('div', { class: 'err' });
    const pend = photos.filter((x) => x.status === 'review' || x.status === 'pending').length;
    const file = el('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async () => { if (file.files[0]) { const f0 = file.files[0]; file.value = ''; err.textContent = ''; btn.disabled = true; btn.textContent = 'Revisando tu foto…'; const r = await uploadPhoto(f0); if (r.ok) { S.me = await api('me'); S.me.profile.status === 'active' ? (S.gems = S.me.profile.gems, enterApp()) : onboardPhoto(); } else { err.textContent = r.error; btn.disabled = false; btn.textContent = 'Subir foto'; } } } });
    const btn = el('button', { class: 'btn block', onclick: () => file.click(), text: 'Subir foto' });
    mount(el('div', { class: 'sheetpage' }, el('span', { class: 'wordmark' }, el('i'), 'SuperLiveChat'), el('h2', { text: 'Ahora, tu foto' }),
        el('p', { class: 'note', text: 'Hola ' + p.name + '. Sube una foto tuya, de frente, con la cara bien visible y sin lentes oscuros. Una revisión automática la aprueba en segundos.' }),
        pend ? el('p', { class: 'note', text: 'Tu foto quedó en revisión manual. Te avisaremos cuando esté lista; mientras, puedes subir otra.' }) : null,
        photos.filter((x) => x.status === 'rejected').length ? el('p', { class: 'err', text: 'Una foto no fue aprobada.' }) : null,
        file, btn, err, el('button', { class: 'link', onclick: logout, text: 'Salir' })));
}
async function toJpeg(f) {
    const url = URL.createObjectURL(f);
    try {
        const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('No pudimos leer esa foto.')); i.src = url; });
        const m = 1100, k = Math.min(1, m / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.82).split(',')[1];
    } finally { URL.revokeObjectURL(url); }
}
async function uploadPhoto(f) {
    try { const image = await toJpeg(f); const r = await api('addPhoto', { image }); return r.rejected ? { ok: false, error: r.reason } : { ok: true, r }; } catch (e) { return { ok: false, error: e.message }; }
}

/* ---------- app principal ---------- */
const TABS = [['discover', 'Descubrir', 'discover'], ['people', 'Personas', 'people'], ['matches', 'Matches', 'match'], ['chats', 'Chats', 'chat'], ['me', 'Yo', 'me']];
let main, tabsEl, gemEl;
function enterApp() {
    main = el('div', { class: 'main' }); gemEl = el('button', { class: 'gemchip', style: S.me.profile.gender === 'f' ? 'display:none' : '', onclick: () => openGems(), 'aria-label': 'Mis gemas' }, icon('gem'), el('span', { text: nf(S.gems) }));
    tabsEl = el('nav', { class: 'tabs' });
    mount(el('div', { class: 'top' }, el('span', { class: 'wordmark' }, el('i'), 'SuperLiveChat'), gemEl), main, tabsEl);
    drawTabs(); show(S.tab); startPoll();
}
function drawTabs() {
    tabsEl.replaceChildren(...TABS.map(([id, t, ic]) => el('button', { class: S.tab === id ? 'on' : '', onclick: () => { S.openConv = null; show(id); }, 'aria-label': t }, icon(ic), t, id === 'chats' && S.unread ? el('span', { class: 'badge', text: S.unread > 9 ? '9+' : S.unread }) : null)));
}
function setGems(n) { S.gems = n; if (gemEl) gemEl.lastChild.textContent = nf(n); }
function show(tab) { S.tab = tab; drawTabs(); main.replaceChildren(); ({ discover: tDiscover, people: tPeople, matches: tMatches, chats: tChats, me: tMe })[tab](); }

/* Descubrir */
async function tDiscover() {
    const deck = el('div', { class: 'deck' }), stack = el('div', { class: 'stack' }); let filter = null;
    const acts = el('div', { class: 'acts' }, el('button', { class: 'rb no', 'aria-label': 'No me interesa', onclick: () => swipe('pass') }, icon('x')), el('button', { class: 'rb yes', 'aria-label': 'Me gusta', onclick: () => swipe('like') }, icon('heart')));
    deck.append(stack, acts); main.append(deck);
    const countrySel = await countrySelect(); filter = el('div', { class: 'filters', style: 'position:relative;z-index:2' }, el('span', { class: 'note', text: 'País' }), countrySel); main.prepend(filter); deck.style.top = '50px';
    countrySel.onchange = () => { S.country = countrySel.value; S.queue = []; load(); };
    async function load() {
        try { const r = await api('feed', { mode: 'discover', country: S.country }); const have = new Set(S.queue.map((p) => p.id)); S.queue.push(...r.people.filter((p) => !have.has(p.id))); } catch (e) { if (e.codigo) { stack.replaceChildren(el('div', { class: 'empty' }, el('b', { text: 'Todavía no puedes ver personas' }), e.message)); return; } }
        draw();
    }
    function draw() {
        stack.replaceChildren(); acts.style.display = S.queue.length ? '' : 'none';
        if (!S.queue.length) { stack.append(el('div', { class: 'empty' }, el('b', { text: 'Por ahora no hay más personas' }), 'Estamos creciendo cada día. Vuelve pronto o prueba sin filtro de país.', el('p', null, el('button', { class: 'btn ghost small', onclick: load, text: 'Buscar de nuevo' })))); return; }
        const [a, b] = S.queue; if (b) stack.append(cardEl(b, true)); stack.append(cardEl(a, false));
        if (S.queue.length < 4 && !S.loading) { S.loading = true; load().finally(() => { S.loading = false; }); }
    }
    function cardEl(p, behind) {
        const c = el('div', { class: 'card' + (behind ? ' behind' : ''), style: bg(p.photo) }, el('span', { class: 'stamp l', text: 'ME GUSTA' }), el('span', { class: 'stamp p', text: 'NO' }),
            el('div', { class: 'shade' }, el('h3', null, p.name + ', ' + p.age), el('div', { class: 'meta' }, el('span', { class: 'dot' + (p.online ? '' : ' off') }), p.online ? 'En línea' : 'Desconectado', ' · ' + flag(p.country) + ' ' + (p.country || ''), p.nPhotos > 1 ? ' · ' + p.nPhotos + ' fotos' : ''), p.bio ? el('div', { class: 'meta', style: 'margin-top:6px', text: p.bio.slice(0, 90) }) : null));
        if (behind) return c;
        let x0 = 0, dx = 0, drag = false, moved = false;
        c.addEventListener('pointerdown', (e) => { drag = true; moved = false; x0 = e.clientX; c.setPointerCapture(e.pointerId); });
        c.addEventListener('pointermove', (e) => { if (!drag) return; dx = e.clientX - x0; if (Math.abs(dx) > 6) moved = true; c.style.transform = 'translateX(' + dx + 'px) rotate(' + dx / 20 + 'deg)'; c.querySelector('.stamp.l').style.opacity = Math.max(0, dx / 110); c.querySelector('.stamp.p').style.opacity = Math.max(0, -dx / 110); });
        const end = () => { if (!drag) return; drag = false; if (dx > 110) swipe('like'); else if (dx < -110) swipe('pass'); else { c.style.transition = 'transform .2s'; c.style.transform = ''; c.querySelectorAll('.stamp').forEach((s) => (s.style.opacity = 0)); setTimeout(() => (c.style.transition = ''), 220); if (!moved) openPerson(p.id); } dx = 0; };
        c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
        return c;
    }
    async function swipe(kind) {
        const p = S.queue[0]; if (!p || S.busy) return; S.busy = true; const top = stack.lastChild;
        if (top) { top.style.transition = 'transform .28s, opacity .28s'; top.style.transform = 'translateX(' + (kind === 'like' ? 480 : -480) + 'px) rotate(' + (kind === 'like' ? 22 : -22) + 'deg)'; top.style.opacity = 0; }
        S.queue.shift(); await sleep(260); draw(); S.busy = false;
        try { const r = await api('like', { to: p.id, kind }); if (r.matched) matchPopup(r.person, r.conv); } catch (e) { toast(e.message); }
    }
    S.swipeFn = swipe; load();
}
async function countrySelect() {
    const s = el('select', { 'aria-label': 'Filtrar por país' }, el('option', { value: '', text: 'Todos los países' }));
    try { const r = await api('countries'); r.countries.forEach((c) => s.append(el('option', { value: c.code, text: flag(c.code) + ' ' + (regionName(c.code)) + ' (' + c.n + ')' }))); } catch (_) {}
    s.value = S.country; if (s.value !== S.country) { S.country = ''; s.value = ''; } return s;
}
function regionName(c) { try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(c); } catch (_) { return c; } }
function matchPopup(person, conv) {
    sheet((close) => el('div', { class: 'match' }, el('div', { class: 'note', text: '¡Es mutuo!' }), el('h2', { text: 'Hicieron match' }), el('div', { class: 'pics' }, el('div', { class: 'av', style: bg(S.me.photos[0] && S.me.photos[0].url) }), el('div', { class: 'av', style: bg(person.photo) })),
        el('p', { text: 'A ' + person.name + ' también le gustaste. Escríbele primero.' }),
        el('div', { class: 'pbtns', style: 'justify-content:center' }, el('button', { class: 'btn', onclick: () => { close(); openChat(conv, person.id, person.name, person.photo); }, text: 'Enviar mensaje' }), el('button', { class: 'btn ghost', onclick: close, text: 'Seguir viendo' }))));
}

/* Personas */
async function tPeople() {
    const sel = await countrySelect(); const grid = el('div', { class: 'grid' }); let off = 0, done = false;
    main.append(el('div', { class: 'filters' }, el('span', { class: 'note', text: 'En línea primero · País' }), sel), grid);
    const more = el('div', { class: 'empty', style: 'padding:10px' }); const moreBtn = el('button', { class: 'btn ghost small', text: 'Ver más', onclick: () => load() }); more.append(moreBtn);
    async function load(reset) {
        if (reset) { off = 0; done = false; grid.replaceChildren(); } try {
            const r = await api('feed', { mode: 'people', country: S.country, offset: off }); off += r.people.length; if (r.people.length < 30) done = true;
            r.people.forEach((p) => grid.append(el('button', { class: 'tile', style: bg(p.photo), onclick: () => openPerson(p.id) }, el('div', { class: 'shade' }, (p.online ? '● ' : '') + p.name + ', ' + p.age, el('small', { text: flag(p.country) + ' ' + (p.online ? 'En línea' : 'Desconectado') })))));
            if (!grid.children.length) grid.append(el('div', { class: 'empty', style: 'grid-column:1/-1' }, el('b', { text: 'Aún no hay nadie aquí' }), 'Cada día se une más gente. Vuelve pronto.'));
            moreBtn.style.display = done ? 'none' : '';
        } catch (e) { grid.append(el('div', { class: 'empty', style: 'grid-column:1/-1' }, e.message)); }
    }
    sel.onchange = () => { S.country = sel.value; load(true); }; main.append(more); load();
}

/* Matches */
async function tMatches() {
    main.append(el('div', { class: 'empty' }, '…')); let r; try { r = await api('convs'); } catch (e) { main.replaceChildren(el('div', { class: 'empty' }, e.message)); return; }
    const m = r.convs.filter((c) => c.matched);
    main.replaceChildren(m.length ? el('div', { class: 'grid' }, m.map((c) => el('button', { class: 'tile', style: bg(c.photo), onclick: () => openChat(c.conv, c.id, c.name, c.photo) }, el('div', { class: 'shade' }, (c.online ? '● ' : '') + c.name, el('small', { text: c.last ? c.last.slice(0, 30) : 'Salúdale 👋' }))))) : el('div', { class: 'empty' }, el('b', { text: 'Aún no tienes matches' }), 'Cuando a alguien le gustes y a ti también, aparecerá aquí.'));
}

/* Chats */
async function tChats() {
    let r; try { r = await api('convs'); } catch (e) { main.replaceChildren(el('div', { class: 'empty' }, e.message)); return; }
    S.convs = r.convs; S.unread = r.convs.reduce((s, c) => s + c.unread, 0); drawTabs();
    const talking = r.convs.filter((c) => c.last);
    const fresh = r.convs.filter((c) => !c.last && c.matched);
    main.replaceChildren(...[fresh.length ? el('div', null, el('div', { class: 'h4', text: 'Matches nuevos' }), el('div', { class: 'strip' }, fresh.map((c) => el('button', { onclick: () => openChat(c.conv, c.id, c.name, c.photo) }, el('div', { class: 'av' + (c.online ? ' on' : ''), style: bg(c.photo) }), c.name)))) : null,
        talking.length ? el('div', { class: 'list' }, talking.map((c) => el('button', { class: 'row', onclick: () => openChat(c.conv, c.id, c.name, c.photo) }, el('div', { class: 'av' + (c.online ? ' on' : ''), style: bg(c.photo) }), el('div', { class: 't' }, el('b', { text: c.name }), el('span', { class: c.unread ? 'un' : '', text: (c.lastMine ? 'Tú: ' : '') + c.last })), c.unread ? el('span', { class: 'unread', text: c.unread }) : null))) : (fresh.length ? null : el('div', { class: 'empty' }, el('b', { text: 'Todavía no hay conversaciones' }), 'Escribir es gratis. Entra a una persona y salúdala.'))].filter(Boolean));
}

/* Yo */
async function tMe() {
    try { S.me = await api('me'); setGems(S.me.profile.gems); } catch (_) {}
    const p = S.me.profile, photos = S.me.photos; const err = el('div', { class: 'err' });
    const file = el('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async () => { if (!file.files[0]) return; const f0 = file.files[0]; file.value = ''; err.textContent = ''; toast('Revisando tu foto…'); const r = await uploadPhoto(f0); if (!r.ok) err.textContent = r.error; else toast(r.r.status === 'approved' ? 'Foto aprobada' : 'Tu foto quedó en revisión'); tMe2(); } });
    const tMe2 = () => { main.replaceChildren(); tMe(); };
    const name = el('input', { value: p.name, maxlength: '30' }), bio = el('textarea', { maxlength: '300' }); bio.value = p.bio;
    const seeking = el('select', null, [['f', 'Mujeres'], ['m', 'Hombres'], ['b', 'Ambos']].map(([v, t]) => el('option', { value: v, text: t }))); seeking.value = p.seeking;
    main.replaceChildren(el('div', { class: 'me' },
        p.gender === 'f' ? el('div', { class: 'gembox' }, el('b', { style: 'font-size:20px', text: 'Tú nunca pagas' }), el('p', { class: 'note', text: 'Escribir es gratis para todos y las videollamadas son gratis para ti, las hagas o las recibas.' })) : el('div', { class: 'gembox' }, el('div', { class: 'note', text: 'Mis gemas' }), el('b', { text: nf(p.gems) }), el('p', { class: 'note', text: 'Escribir es gratis. Las gemas son para videollamadas: ' + nf(S.me.gemsPerMin) + ' gemas por minuto (aprox. US$1).' }), el('button', { class: 'btn small', onclick: () => openGems(), text: 'Conseguir gemas' })),
        el('h3', { text: 'Mis fotos' }),
        el('div', { class: 'mine' }, photos.map((x) => el('div', { class: 'p', style: bg(x.url) }, el('em', { text: { approved: 'Aprobada', review: 'En revisión', pending: 'En revisión', rejected: 'Rechazada' }[x.status] }), el('button', { 'aria-label': 'Borrar foto', onclick: async () => { if (x.status === 'approved' && photos.filter((y) => y.status === 'approved').length === 1 && !confirm('Es tu única foto aprobada. Si la borras, dejarás de aparecer. ¿Borrar?')) return; try { await api('deletePhoto', { id: x.id }); tMe2(); } catch (e) { toast(e.message); } } }, icon('x'))),), photos.length < 6 ? el('button', { class: 'add', onclick: () => file.click() }, el('div', null, icon('cam'), 'Agregar')) : null), file, err,
        el('h3', { text: 'Mis datos' }),
        el('label', { class: 'field' }, el('span', { text: 'Nombre' }), name), el('label', { class: 'field' }, el('span', { text: 'Quiero conocer' }), seeking), el('label', { class: 'field' }, el('span', { text: 'Sobre mí' }), bio),
        el('p', { class: 'note', text: p.age + ' años · ' + (p.gender === 'm' ? 'Hombre' : 'Mujer') + ' · ' + flag(p.country) + ' ' + (p.country ? regionName(p.country) : 'país sin detectar') + ' · ' + S.me.user.email }),
        el('button', { class: 'btn block', text: 'Guardar cambios', onclick: async () => { try { await api('saveProfile', { name: name.value, bio: bio.value, seeking: seeking.value }); toast('Guardado'); } catch (e) { toast(e.message); } } }),
        el('p', null, el('button', { class: 'link', onclick: logout, text: 'Cerrar sesión' }), ' ', el('button', { class: 'link', onclick: async () => { if (confirm('Se borrarán tu perfil, fotos, mensajes y gemas. No se puede deshacer. ¿Seguro?')) { try { await api('deleteAccount'); } catch (e) { toast(e.message); return; } logout(); } }, text: 'Borrar mi cuenta' }))));
}

/* ---------- persona, chat, reportes ---------- */
async function openPerson(id) {
    let r; try { r = await api('profile', { id }); } catch (e) { toast(e.message); return; } const p = r.person; let i = 0;
    const gal = el('div', { class: 'gal' }), bars = el('div', { class: 'bars' });
    const paint = () => { gal.style.cssText = bg(p.photos[i] || p.photo); bars.replaceChildren(...p.photos.map((_, k) => el('i', { class: k === i ? 'on' : '' }))); };
    gal.append(bars, el('div', { class: 'nav' }, el('button', { 'aria-label': 'Foto anterior', onclick: () => { i = (i + p.photos.length - 1) % Math.max(1, p.photos.length); paint(); } }), el('button', { 'aria-label': 'Foto siguiente', onclick: () => { i = (i + 1) % Math.max(1, p.photos.length); paint(); } })));
    sheet((close) => { paint(); return [el('div', { style: 'position:relative' }, gal, el('button', { class: 'close', 'aria-label': 'Cerrar', onclick: close }, icon('x'))),
        el('div', { class: 'body' }, el('h2', { style: 'margin:0', text: p.name + ', ' + p.age }), el('div', { class: 'note' }, el('span', { class: 'dot' + (p.online ? '' : ' off') }), p.online ? 'En línea' : 'Desconectado', ' · ' + flag(p.country) + ' ' + (p.country ? regionName(p.country) : '')), p.bio ? el('p', { text: p.bio }) : null,
            el('div', { class: 'pbtns' }, el('button', { class: 'btn', onclick: () => { close(); openChat(r.conv, p.id, p.name, p.photo); }, text: 'Escribir (gratis)' }),
                el('button', { class: 'btn ghost', onclick: async () => { try { const x = await api('like', { to: p.id, kind: 'like' }); close(); if (x.matched) matchPopup(x.person, x.conv); else toast('Le diste me gusta'); S.queue = S.queue.filter((q) => q.id !== p.id); } catch (e) { toast(e.message); } } }, icon('heart'), 'Me gusta')),
            el('button', { class: 'link', onclick: () => reportSheet(p, close), text: 'Reportar o bloquear' }))]; });
}
function reportSheet(p, closeParent) {
    const reasons = [['fake', 'Perfil falso o engaño'], ['minor', 'Parece menor de edad'], ['nudity', 'Contenido sexual'], ['harass', 'Acoso o insultos'], ['scam', 'Pide dinero o estafa'], ['other', 'Otro motivo']]; let sel = 'other';
    sheet((close) => el('div', { class: 'body' }, el('h2', { text: 'Reportar a ' + p.name }), el('p', { class: 'note', text: 'La persona no sabrá que la reportaste y no volverá a aparecerte.' }),
        el('div', { class: 'field' }, reasons.map(([v, t]) => el('label', { style: 'display:block;padding:8px 0' }, el('input', { type: 'radio', name: 'rs', onchange: () => { sel = v; } }), ' ' + t))),
        el('div', { class: 'pbtns' }, el('button', { class: 'btn', onclick: async () => { try { await api('report', { id: p.id, reason: sel }); toast('Gracias. Lo revisaremos.'); S.queue = S.queue.filter((q) => q.id !== p.id); close(); if (closeParent) closeParent(); if (S.openConv) closeChat(); } catch (e) { toast(e.message); } }, text: 'Enviar reporte' }),
            el('button', { class: 'btn ghost', onclick: async () => { try { await api('block', { id: p.id }); toast('Bloqueada'); S.queue = S.queue.filter((q) => q.id !== p.id); close(); if (closeParent) closeParent(); if (S.openConv) closeChat(); } catch (e) { toast(e.message); } }, text: 'Solo bloquear' }))));
}
let chatTimer;
function closeChat() { clearInterval(chatTimer); const c = document.querySelector('.chat'); if (c) c.remove(); S.openConv = null; if (S.tab === 'chats') tChats(); }
function openChat(conv, otherId, name, photo) {
    document.querySelectorAll('.chat').forEach((n) => n.remove()); S.openConv = { conv, otherId, name, photo };
    let last = 0, cid = conv; const list = el('div', { class: 'msgs' }); const status = el('span', { text: '' });
    const ta = el('textarea', { rows: '1', maxlength: '1000', placeholder: 'Escribe un mensaje…', 'aria-label': 'Mensaje' });
    const send = async () => { const body = ta.value.trim(); if (!body) return; ta.value = ''; try { const r = await api('send', cid ? { conv: cid, body } : { to: otherId, body }); cid = r.conv; S.openConv.conv = cid; await poll(); } catch (e) { ta.value = body; toast(e.message); } };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    const root = el('div', { class: 'chat' },
        el('div', { class: 'chead' }, el('button', { class: 'ib', 'aria-label': 'Volver', onclick: closeChat }, icon('back')), el('button', { class: 'av', style: bg(photo) + ';width:42px;height:42px', 'aria-label': 'Ver perfil', onclick: () => openPerson(otherId) }), el('div', { class: 'who' }, el('b', { text: name }), status),
            el('button', { class: 'ib go', 'aria-label': 'Videollamada', onclick: () => startCall(otherId, name, photo) }, icon('video')), el('button', { class: 'link', onclick: () => reportSheet({ id: otherId, name }), text: '⋯', 'aria-label': 'Más' })),
        list, el('div', { class: 'compose' }, ta, el('button', { class: 'ib go', 'aria-label': 'Enviar', onclick: send }, icon('send'))));
    document.getElementById('app').append(root);
    async function poll() {
        if (!cid) return; try {
            const r = await api('messages', { conv: cid, after: last }); status.textContent = r.other ? (r.other.online ? 'En línea' : 'Desconectado') : '';
            if (r.msgs.length) { const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 80; r.msgs.forEach((m) => { last = Math.max(last, m.id); list.append(el('div', { class: 'm' + (m.mine ? ' me' : '') }, m.body, el('small', { text: new Date(m.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) }))); }); if (atEnd || last === r.msgs[r.msgs.length - 1].id && list.children.length === r.msgs.length) list.scrollTop = list.scrollHeight; }
            else if (!list.children.length && !list.dataset.e) { list.dataset.e = 1; list.append(el('div', { class: 'empty', style: 'margin:auto' }, el('b', { text: 'Rompe el hielo' }), 'Escribir es gratis y sin límite.')); }
            if (r.msgs.length && list.dataset.e) { list.dataset.e = ''; list.querySelector('.empty') && list.querySelector('.empty').remove(); }
        } catch (e) { if (e.status === 403 || e.status === 404) closeChat(); }
    }
    poll(); clearInterval(chatTimer); chatTimer = setInterval(poll, 3000); ta.focus();
}

/* ---------- gemas y PayPal ---------- */
let ppLoading;
function loadPayPal() {
    if (window.paypal) return Promise.resolve(); if (ppLoading) return ppLoading;
    ppLoading = new Promise((ok, no) => { if (!S.cfg.paypalClientId) return no(new Error('El pago aún no está disponible.')); const s = document.createElement('script'); s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(S.cfg.paypalClientId) + '&currency=USD&intent=capture'; s.onload = ok; s.onerror = () => { ppLoading = null; no(new Error('No se pudo cargar PayPal.')); }; document.head.append(s); });
    return ppLoading;
}
function openGems(need) {
    let sel = null; const payBox = el('div', { style: 'min-height:60px;margin-top:10px' }); const err = el('div', { class: 'err' });
    sheet((close) => { const list = el('div', { class: 'packs' });
        const draw = () => list.replaceChildren(...S.me.packs.map((k) => el('button', { class: 'pack' + (sel === k.id ? ' on' : ''), onclick: () => { sel = k.id; draw(); pay(k); } }, el('div', null, el('b', { text: nf(k.gems) + ' gemas' }), el('small', { text: '≈ ' + k.minutes.toString().replace('.', ',') + ' min de videollamada' })), el('span', { class: 'pr', text: 'US$' + k.usd }))));
        async function pay(k) {
            payBox.replaceChildren(el('span', { class: 'note', text: 'Cargando PayPal…' })); err.textContent = '';
            try { await loadPayPal(); } catch (e) { payBox.replaceChildren(); err.textContent = e.message; return; }
            payBox.replaceChildren(); window.paypal.Buttons({ style: { layout: 'horizontal', tagline: false, height: 45 },
                createOrder: async () => (await api('payCreate', { pack: k.id })).orderID,
                onApprove: async (d) => { try { const r = await api('payCapture', { orderID: d.orderID }); setGems(r.gems); if (S.me) S.me.profile.gems = r.gems; toast('¡Listo! +' + nf(r.added) + ' gemas'); close(); if (S.tab === 'me') show('me'); } catch (e) { err.textContent = e.message + ' Si te cobraron, escríbenos y lo resolvemos.'; } },
                onError: () => { err.textContent = 'No se pudo completar el pago. No se te cobró.'; } }).render(payBox);
        }
        draw();
        return el('div', { class: 'body' }, el('h2', { style: 'margin:0 0 4px', text: 'Gemas' }), el('p', { class: 'note', text: (need ? 'Necesitas ' + nf(need) + ' gemas para un minuto. ' : '') + 'Tienes ' + nf(S.gems) + '. Un minuto de videollamada son ' + nf(S.me.gemsPerMin) + ' gemas (aprox. US$1). Los mensajes siempre son gratis. Los paquetes grandes rinden más.' }), list, payBox, err, el('button', { class: 'link', onclick: close, text: 'Cerrar' })); });
}

/* ---------- videollamada (WebRTC punto a punto) ---------- */
function ringTone(on) {
    if (!on) { if (S.ring) { clearInterval(S.ring.t); try { S.ring.c.close(); } catch (_) {} S.ring = null; } return; } if (S.ring) return;
    try { const c = new (window.AudioContext || window.webkitAudioContext)(); const beep = () => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 520; g.gain.value = 0.06; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.35); }; beep(); S.ring = { c, t: setInterval(beep, 1800) }; } catch (_) {}
}
async function startCall(otherId, name, photo) {
    if (S.call) return;
    try { const r = await api('callStart', { to: otherId }); runCall({ id: r.id, role: 'caller', name, photo, youPay: r.youPay }); }
    catch (e) { if (e.codigo === 'sin_gemas') openGems(S.me.gemsPerMin); else toast(e.message); }
}
async function answerIncoming() {
    const inc = S.incoming; if (!inc) return; ringTone(false);
    try { const r = await api('callAnswer', { id: inc.id }); S.incoming = null; hideIncoming(); runCall({ id: inc.id, role: 'callee', name: inc.from.name, photo: inc.from.photo, youPay: r.youPay, answered: true }); }
    catch (e) { hideIncoming(); S.incoming = null; if (e.codigo === 'sin_gemas') openGems(S.me.gemsPerMin); else toast(e.message); }
}
function hideIncoming() { const n = document.querySelector('.call.incoming'); if (n) n.remove(); ringTone(false); }
function showIncoming(inc) {
    if (document.querySelector('.call')) return; ringTone(true);
    document.body.append(el('div', { class: 'call incoming' }, el('div', { class: 'ring' }, el('div', { class: 'av', style: bg(inc.from.photo) }), el('h2', { text: inc.from.name }), el('p', { class: 'note', text: 'te está llamando por video' }), inc.youPay ? el('p', { class: 'note', style: 'color:var(--gem)', text: 'Contestar cuesta ' + nf(S.me.gemsPerMin) + ' gemas por minuto' + (inc.canAnswer ? '' : ' — te faltan gemas') }) : null),
        el('div', { class: 'bot' }, el('button', { class: 'hang', 'aria-label': 'Rechazar', onclick: async () => { hideIncoming(); const id = inc.id; S.incoming = null; S.declined = id; try { await api('callDecline', { id }); } catch (_) {} } }, icon('phone-down')),
            el('button', { class: 'hang ans', 'aria-label': 'Contestar', onclick: answerIncoming }, icon('video')))));
}
async function runCall(c) {
    const remote = el('video', { class: 'remote', autoplay: true, playsinline: true }), local = el('video', { class: 'local', autoplay: true, muted: true, playsinline: true }); local.muted = true;
    const state = el('b', { text: c.name }), sub = el('span', { class: 'note', text: c.role === 'caller' ? 'Llamando…' : 'Conectando…' }), cost = el('div', { class: 'cost' });
    const hang = async (why) => { if (done) return; done = true; clearInterval(timer); try { await api('callEnd', { id: c.id, reason: why || 'hangup' }); } catch (_) {} cleanup(); };
    let done = false, timer, pc, stream, after = 0, offered = false; const queued = [];
    const root = el('div', { class: 'call' }, remote, local, el('div', { class: 'info' }, state, sub), cost, el('div', { class: 'bot' }, el('button', { class: 'hang', 'aria-label': 'Colgar', onclick: () => hang('hangup') }, icon('phone-down'))));
    document.body.append(root); S.call = c;
    function cleanup() { if (stream) stream.getTracks().forEach((t) => t.stop()); if (pc) try { pc.close(); } catch (_) {} root.remove(); S.call = null; ringTone(false); }
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: true }); local.srcObject = stream; }
    catch (_) { toast('Necesitamos permiso de cámara y micrófono para la videollamada.'); await hang('no_media'); return; }
    const ice = (S.me && S.me.ice) || [{ urls: 'stun:stun.l.google.com:19302' }];
    pc = new RTCPeerConnection({ iceServers: ice }); stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => { remote.srcObject = e.streams[0]; remote.play && remote.play().catch(() => {}); };
    pc.onicecandidate = (e) => { if (e.candidate) api('callSignal', { id: c.id, kind: 'ice', payload: e.candidate.toJSON() }).catch(() => {}); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') sub.textContent = 'En llamada'; if (pc.connectionState === 'failed') { toast('Se perdió la conexión.'); hang('conn_failed'); } };
    const addIce = async (cand) => { try { await pc.addIceCandidate(cand); } catch (_) {} };
    let miss = 0;
    timer = setInterval(async () => {
        if (done) return; let r; try { r = await api('callPoll', { id: c.id, after }); miss = 0; } catch (e) { if (++miss > 6) hang('net'); return; }
        setGems(r.gems);
        if (['ended', 'declined', 'missed'].includes(r.status)) { done = true; clearInterval(timer); const why = r.reason === 'gems' ? 'Se acabaron las gemas.' : r.status === 'declined' ? 'No contestó la llamada.' : r.status === 'missed' ? 'No contestó.' : 'La llamada terminó.'; cleanup(); toast(why); if (r.reason === 'gems' && r.youPay) openGems(S.me.gemsPerMin); return; }
        if (r.status === 'active') { c.answered = true; if (r.youPay) cost.textContent = 'Minuto ' + r.minutes + ' · ' + nf(r.gemsSpent) + ' gemas gastadas · te quedan ' + nf(r.gems); else if (c.role === 'caller' || c.role === 'callee') cost.textContent = ''; const secs = Math.floor((Date.now() - new Date(r.answeredAt).getTime()) / 1000); if (pc.connectionState !== 'connected') sub.textContent = 'Conectando…'; else sub.textContent = String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0'); }
        if (r.status === 'active' && c.role === 'caller' && !offered) { offered = true; const o = await pc.createOffer(); await pc.setLocalDescription(o); api('callSignal', { id: c.id, kind: 'offer', payload: pc.localDescription.toJSON() }).catch(() => {}); }
        for (const s of r.signals) {
            after = Math.max(after, s.id);
            try {
                if (s.kind === 'offer' && c.role === 'callee') { await pc.setRemoteDescription(s.payload); while (queued.length) await addIce(queued.shift()); const a = await pc.createAnswer(); await pc.setLocalDescription(a); await api('callSignal', { id: c.id, kind: 'answer', payload: pc.localDescription.toJSON() }); }
                else if (s.kind === 'answer' && c.role === 'caller') { await pc.setRemoteDescription(s.payload); while (queued.length) await addIce(queued.shift()); }
                else if (s.kind === 'ice') { if (pc.remoteDescription) await addIce(s.payload); else queued.push(s.payload); }
            } catch (e) { console.error('señal', e); }
        }
    }, 1200);
}

/* ---------- latido ---------- */
let pingT;
function startPoll() { stopPoll(); const tick = async () => { if (document.hidden && !S.call) return; try { const r = await api('ping'); if (r.gems != null) setGems(r.gems); if (r.unread !== S.unread) { S.unread = r.unread; drawTabs(); } if (r.incoming && !S.call && S.declined !== r.incoming.id) { if (!S.incoming || S.incoming.id !== r.incoming.id) { S.incoming = r.incoming; showIncoming(r.incoming); } } else if (!r.incoming && S.incoming) { S.incoming = null; hideIncoming(); } } catch (_) {} }; tick(); pingT = setInterval(tick, 5000); }
function stopPoll() { clearInterval(pingT); }

start();
window.SLC = { S, start };
})();
