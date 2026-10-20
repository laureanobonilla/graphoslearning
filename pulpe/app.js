/* La Pulpe · pantallas, guardado, cuenta, pase y récords. */
'use strict';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'pulpe.v1';
let VEL = 1, USER = null, ACCESO = { active: false }, CONF = null, DEMO = null, tabM = 'pedido', guardarT = null, tipVisto = false;
let CLAVE = ''; try { const k = new URLSearchParams(location.search).get('k'); if (k === 'salir') localStorage.removeItem('pulpe.k'); else if (k) localStorage.setItem('pulpe.k', k); CLAVE = localStorage.getItem('pulpe.k') || ''; } catch (_e) { /* ok */ }
const conClave = (u) => (CLAVE ? u + (u.includes('?') ? '&' : '?') + 'k=' + encodeURIComponent(CLAVE) : u);
const anonId = (() => { try { let a = localStorage.getItem('pulpe.anon'); if (!a) { a = 'p' + Math.random().toString(36).slice(2, 12); localStorage.setItem('pulpe.anon', a); } return a; } catch (_e) { return 'p0'; } })();

// ---------- eventos de uso ----------
function track(ev, meta) {
    (async () => {
        try {
            const h = { 'Content-Type': 'application/json' }; const t = USER ? await token().catch(() => null) : null; if (t) h.Authorization = 'Bearer ' + t;
            fetch('/.netlify/functions/track-event', { method: 'POST', headers: h, keepalive: true, body: JSON.stringify({ event: 'pulpe_' + ev, anonId, app: 'pulpe', displayName: USER ? USER.email : null, metadata: Object.assign({ dia: G && G.dia, barrio: G && G.barrio }, meta || {}) }) }).catch(() => {});
        } catch (_e) { /* nada */ }
    })();
}
window.addEventListener('error', (e) => track('error_js', { m: String(e.message || '').slice(0, 160) }));

// ---------- guardado ----------
function guardar() {
    if (!G || G === DEMO) return;
    G.actualizado = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (_e) { /* sin espacio */ }
    if (USER) { clearTimeout(guardarT); guardarT = setTimeout(subir, 1500); }
}
function cargar() { try { const g = JSON.parse(localStorage.getItem(KEY)); return g && g.v === 1 ? g : null; } catch (_e) { return null; } }
async function token() { const u = window.netlifyIdentity && netlifyIdentity.currentUser(); if (!u) return null; try { return await u.jwt(); } catch (_e) { return u.token && u.token.access_token; } }
async function api(fn, body, method) {
    const t = await token(); const h = { 'Content-Type': 'application/json' }; if (t) h.Authorization = 'Bearer ' + t;
    try {
        const r = await fetch('/.netlify/functions/' + fn, { method: method || (body ? 'POST' : 'GET'), headers: h, body: body ? JSON.stringify(body) : undefined });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return Object.assign({ status: r.status }, d, { error: d.error || 'Error ' + r.status });
        return d;
    } catch (_e) { return { error: 'Sin conexión.' }; }
}
async function subir() { if (!USER) return; const real = G === DEMO ? cargar() : G; if (!real) return; await api('pulpe-data', { data: real }); }
async function bajar() {
    const r = await api('pulpe-data'); if (r.error) return;
    ACCESO = r.access || ACCESO;
    const local = DEMO ? cargar() : G;
    if (r.data && r.data.v === 1 && (!local || (r.data.actualizado || 0) > (local.actualizado || 0))) {
        try { localStorage.setItem(KEY, JSON.stringify(r.data)); } catch (_e) { /* ok */ }
        if (!DEMO && G && G.fase !== 'dia') { G = r.data; mostrarFase(); toast('Partida recuperada de su cuenta.'); }
    } else if (local) subir();
    if (G && G.pendiente) enviarRecord();
    if (DEMO) pintarPortada();
    pintarHud();
}

// ---------- cuenta ----------
function entrar(modo) { if (!window.netlifyIdentity) return toast('No se pudo cargar el inicio de sesión.'); track('login_visto', { modo }); netlifyIdentity.open(modo || 'login'); }
if (window.netlifyIdentity) {
    netlifyIdentity.on('init', (u) => { USER = u || null; if (u) bajar(); });
    netlifyIdentity.on('login', (u) => { USER = u; try { netlifyIdentity.close(); } catch (_e) { /* ok */ } track('login_ok'); bajar(); toast('¡Listo! Su partida se guarda en su cuenta.'); });
    netlifyIdentity.on('logout', () => { USER = null; ACCESO = { active: false }; toast('Sesión cerrada. La partida sigue en este dispositivo.'); });
    netlifyIdentity.init({ locale: 'es' });
}
const tienePase = () => !!(ACCESO && ACCESO.active);

// ---------- avisos ----------
function toast(t, ms = 3200) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), ms); }
let avisoT = null;
function UIaviso(titulo, txt) { const el = $('#aviso'); el.innerHTML = `<b>${esc(titulo)}</b><span>${esc(txt)}</span>`; el.hidden = false; clearTimeout(avisoT); avisoT = setTimeout(() => (el.hidden = true), 5200); }
function UIlogro(l) { if (G === DEMO) return; sonido('logro'); toast('🏆 Logro: ' + l.n + ' — ' + l.d, 4200); track('logro', { id: l.id }); }
function abrirModal(html) { $('#modalCaja').innerHTML = html; $('#modal').hidden = false; }
function cerrarModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-cerrar]')) cerrarModal(); });

// ---------- HUD ----------
const hora = (m) => { const h = Math.floor(m / 60), mm = Math.floor(m % 60); return (h > 12 ? h - 12 : h) + ':' + String(mm).padStart(2, '0') + (h >= 12 ? ' p. m.' : ' a. m.'); };
let ultHud = '';
function pintarHud() {
    if (!G || G === DEMO) { $('#hud').hidden = true; return; }
    $('#hud').hidden = false;
    const s = [G.dia, Math.floor(G.min / 10), Math.round(G.dinero), Math.round(G.rep), Math.round(G.limpieza), G.fase].join('|'); if (s === ultHud) return;
    const plataAntes = ultHud.split('|')[2]; ultHud = s;
    $('#hDia').textContent = 'Día ' + G.dia + (G.dia <= TEMPORADA ? ' / ' + TEMPORADA : '');
    $('#hHora').textContent = G.fase === 'noche' ? '🌙 Noche' : G.fase === 'manana' ? '🌅 Mañana' : hora(G.min);
    $('#hPlata').textContent = col(G.dinero); $('#hPlata').style.color = G.dinero < 0 ? 'var(--mal)' : '';
    if (plataAntes && Math.round(G.dinero) !== Number(plataAntes)) { const el = $('#hPlata'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    $('#hRep').textContent = '⭐ ' + Math.round(G.rep); $('#hLimp').textContent = '🧹 ' + Math.round(G.limpieza);
    $('#hUrg').hidden = G.fase !== 'dia'; $('#hVel').style.visibility = G.fase === 'dia' ? 'visible' : 'hidden';
}
$('#hVel').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; VEL = Number(b.dataset.v); document.querySelectorAll('#hVel button').forEach(x => x.classList.toggle('on', x === b)); });
$('#hSon').addEventListener('click', () => { MUDO = !MUDO; try { localStorage.setItem('pulpe.mudo', MUDO ? '1' : '0'); } catch (_e) { /* ok */ } $('#hSon').textContent = MUDO ? '🔇' : '🔊'; });
$('#hSon').textContent = MUDO ? '🔇' : '🔊';
$('#hMenu').addEventListener('click', menu);
$('#hUrg').addEventListener('click', mUrgente);

// ---------- bucle ----------
let ultT = performance.now();
function bucle(t) {
    const dt = Math.min(0.05, (t - ultT) / 1000); ultT = t;
    if (G) {
        if (G.fase === 'dia') {
            const v = G === DEMO ? 2 : VEL; VIVO.vel = v;
            tick(dt * 7 * v);
            if (G === DEMO) { if (G.min > 19.6 * 60) { G.min = 16 * 60; } }
            else if (diaTerminado()) { cerrarDia(); guardar(); track('dia_cerrado', { ventas: Math.round(G.hoy.ventas), clientes: G.hoy.clientes, rep: Math.round(G.rep) }); mostrarFase(); }
        }
        dibujar(dt);
        pintarHud();
        if (G !== DEMO && G.fase === 'dia' && !tipVisto && G.dia === 1 && enFila()[0]) { $('#tip').hidden = false; }
    }
    requestAnimationFrame(bucle);
}
const escena = iniciarEscena($('#escena'));
$('#escena').addEventListener('pointerdown', (e) => { if (!G || G === DEMO || G.fase !== 'dia' || VIVO.decision) return; if (atender(false)) { tipVisto = true; $('#tip').hidden = true; } });
window.addEventListener('keydown', (e) => { if (e.code === 'Space' && G && G !== DEMO && G.fase === 'dia' && !VIVO.decision && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); if (atender(false)) { tipVisto = true; $('#tip').hidden = true; } } });

// Decisión de fiado (el juego se pausa)
setInterval(() => {
    const box = $('#decision');
    if (G && G === DEMO && VIVO.decision) { decidirFiado(true); return; }   // en la portada el pulpero fía solo
    if (G && G !== DEMO && VIVO.decision && box.hidden) {
        const c = VIVO.decision, debe = G.fiado[c.vec.id] || 0, hf = G.histFiado[c.vec.id];
        box.innerHTML = `<p class="who">${esc(c.vec.n)} quiere fiado: ${col(c.cuenta.total)}</p>
          <p class="hist">${debe ? 'Ya le debe ' + col(debe) + ' · ' : ''}${hf ? 'Ha pagado ' + hf.pagos + ' de ' + (hf.pagos + hf.fallas) + ' cobros' : 'Nunca le ha fiado'}</p>
          <div class="row"><button class="btn" data-f="1">📝 Apúntelo</button><button class="btn gris" data-f="0">💵 Pura plata</button></div>`;
        box.hidden = false;
        box.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { const si = b.dataset.f === '1'; decidirFiado(si); box.hidden = true; track('fiado_' + (si ? 'si' : 'no'), { monto: c.cuenta.total }); }));
    } else if (!VIVO.decision && !box.hidden) box.hidden = true;
}, 120);

// ---------- fases ----------
function mostrarFase() {
    $('#tip').hidden = true; document.body.classList.toggle('jugando', G.fase === 'dia');
    $('#portada').hidden = true; $('#portada').style.order = ''; $('#escenaWrap').hidden = false;
    pintarHud(); ultHud = '';
    VIVO.textos = []; VIVO.fx = [];
    if (G.fase === 'manana') { G.min = DIA_INI; VIVO.clientes = []; pintarManana(); }
    else if (G.fase === 'dia') { $('#panel').hidden = true; }
    else if (G.fase === 'noche') { G.min = DIA_FIN; pintarNoche(); }
    setTimeout(() => escena.fit(), 30);
}

// ----- mañana -----
function pintarManana() {
    const P = $('#panel'); P.hidden = false;
    const evs = G.eventos.filter(e => EV[e.id]);
    const bloqueado = G.dia > SEMANA && !tienePase();
    P.innerHTML = `<div class="pn-head"><h2>🌅 Mañana del día ${G.dia}<small>${esc(BARRIOS[G.barrio].n)} · patrimonio ${col(patrimonio())}</small></h2>
        <div><button class="btn sm gris" id="bRep">⚡ Reponer lo básico</button></div></div>
      <div class="pron">${evs.length ? evs.map(e => `<div class="ev"><span class="e">${EV[e.id].e}</span><div><b>${esc(EV[e.id].n)}${e.id === 'sele' ? ' · 7 p. m.' : e.id === 'apagon' ? ' · ' + e.h + ':00' : ''}</b><span>${esc(EV[e.id].d)}</span></div></div>`).join('') : '<div class="ev"><span class="e">🌤️</span><div><b>Día tranquilo</b><span>Nada especial en el pronóstico.</span></div></div>'}
        ${esQuincena() ? '<div class="ev"><span class="e">💰</span><div><b>¡Quincena!</b><span>Viene más gente y la gente paga mejor el fiado.</span></div></div>' : ''}
        ${G.compet ? `<div class="ev"><span class="e">🏬</span><div><b>Abrió un minisúper cerca</b><span>${G.rep >= 70 ? 'Con su buena fama, la gente le es fiel.' : 'Le quita 12 % de clientes mientras su reputación esté bajo 70.'}</span></div></div>` : ''}</div>
      <div class="tabs" id="tabsM">${[['pedido', '📦 Pedido'], ['precios', '🏷️ Precios'], ['mejoras', '🛠️ Mejoras'], ['personal', '🧹 Personal'], ['cuentas', '📈 Cuentas']].map(([k, t]) => `<button data-t="${k}" class="${k === tabM ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div id="tabBody"></div>
      <div class="pie"><button class="btn xl ver" id="bAbrir">${bloqueado ? '🔒 Seguir con el pase' : '☀️ Abrir la pulpe'}</button></div>`;
    P.querySelectorAll('#tabsM button').forEach(b => b.addEventListener('click', () => { tabM = b.dataset.t; P.querySelectorAll('#tabsM button').forEach(x => x.classList.toggle('on', x === b)); pintarTab(); }));
    $('#bRep').addEventListener('click', () => { let n = 0; const reserva = 10000; PRODUCTOS.forEach(p => { if (!disponible(p.id) || p.vida === 1 && cantidad(p.id) > 0) return; while (cantidad(p.id) < capacidad() * 0.45 && G.dinero - p.pack * p.costo >= reserva && !pedir(p.id, 1)) n++; }); toast(n ? 'Listo: ' + n + ' paquetes pedidos.' : 'Ya tiene lo básico (o no alcanza la plata).'); track('reponer', { n }); pintarTab(); pintarHud(); });
    $('#bAbrir').addEventListener('click', () => {
        if (bloqueado) { mPase('dia8'); return; }
        abrirDia(); guardar(); track('dia_abierto', { dinero: Math.round(G.dinero) }); mostrarFase();
    });
    pintarTab();
}
function pintarTab() {
    const B = $('#tabBody'); if (!B) return;
    if (tabM === 'pedido') {
        B.innerHTML = `<p class="mini">Cada «+» compra un paquete al camión y llega de una vez. Lo perecedero se daña: no pida más de lo que vende. Capacidad por producto: ${capacidad()}.</p><div class="grid-p">${PRODUCTOS.map(p => {
            const q = cantidad(p.id), ok = disponible(p.id), vida = vidaDe(p), cam = hayEvento('camion') && ['gaseosa', 'birra'].includes(p.id);
            return `<div class="prod ${ok ? '' : 'lock'}"><div class="t"><span class="e">${p.e}</span>${esc(p.n)}</div>
              <div class="m"><span>En estante: <b>${q}</b></span><span>Paquete ×${p.pack}: <b>${col(p.pack * p.costo)}</b></span></div>
              <div class="bar"><i class="${q < capacidad() * 0.2 ? 'bajo' : ''}" style="width:${Math.min(100, q / capacidad() * 100)}%"></i></div>
              <div class="m"><span>${vida ? '⏳ Se daña en ' + vida + (vida === 1 ? ' día' : ' días') : '✅ No se daña'}</span><span>Vende a ${col(G.precios[p.id])}</span></div>
              ${!ok ? `<div class="warn">🔒 Necesita: ${esc(MEJ[p.req].n)}</div>` : cam ? '<div class="warn">🚚 El camión de bebidas no vino hoy</div>' : `<div class="acts"><button class="btn sm" data-ped="${p.id}">+ Pedir paquete</button></div>`}</div>`;
        }).join('')}</div>`;
        B.querySelectorAll('[data-ped]').forEach(b => b.addEventListener('click', () => { const e = pedir(b.dataset.ped, 1); if (e) toast(e); else { sonido('caja'); track('pedido', { id: b.dataset.ped }); } pintarTab(); pintarHud(); }));
    } else if (tabM === 'precios') {
        B.innerHTML = `<p class="mini">Más caro = más ganancia por unidad, pero menos gente lo compra y algunos se quejan. ${G.barrio === 'playa' ? 'En la playa los turistas aguantan precios más altos.' : G.barrio === 'puerto' ? 'En Limón la gente es sensible a los precios.' : ''}</p><div class="grid-p">${PRODUCTOS.filter(p => disponible(p.id)).map(p => {
            const r = G.precios[p.id] / p.ref / BARRIOS[G.barrio].tolera, ind = r < 0.95 ? ['barato', 'Barato'] : r <= 1.06 ? ['justo', 'Justo'] : r <= 1.22 ? ['caro', 'Caro'] : ['carisimo', 'Carísimo'];
            return `<div class="prod"><div class="t"><span class="e">${p.e}</span>${esc(p.n)} <span class="precio"><span class="ind ${ind[0]}">${ind[1]}</span></span></div>
              <div class="precio"><input type="range" min="${Math.round(p.ref * 0.7 / 25) * 25}" max="${Math.round(p.ref * 1.7 / 25) * 25}" step="${p.ref < 200 ? 5 : 25}" value="${G.precios[p.id]}" data-pr="${p.id}"><span class="v" id="pv-${p.id}">${col(G.precios[p.id])}</span></div>
              <div class="m"><span>Le cuesta ${col(p.costo)}</span><span>Gana <b id="pg-${p.id}">${col(G.precios[p.id] - p.costo)}</b> por unidad</span></div></div>`;
        }).join('')}</div>`;
        B.querySelectorAll('[data-pr]').forEach(inp => inp.addEventListener('input', () => { const id = inp.dataset.pr; G.precios[id] = Number(inp.value); $('#pv-' + id).textContent = col(G.precios[id]); $('#pg-' + id).textContent = col(G.precios[id] - PROD[id].costo); }));
        B.querySelectorAll('[data-pr]').forEach(inp => inp.addEventListener('change', () => { pintarTab(); guardar(); track('precio', { id: inp.dataset.pr, r: Math.round(G.precios[inp.dataset.pr] / PROD[inp.dataset.pr].ref * 100) }); }));
    } else if (tabM === 'mejoras') {
        B.innerHTML = `<div class="grid-p">${MEJORAS.map(m => `<div class="mej ${G.mejoras[m.id] ? 'tiene' : ''}"><div class="t"><span class="e">${m.e}</span>${esc(m.n)}</div><p>${esc(m.d)}${m.luz ? ' Luz: +' + col(m.luz) + '/día.' : ''}</p>
            ${G.mejoras[m.id] ? '<b style="color:var(--ok)">✔ Ya la tiene</b>' : `<button class="btn sm" data-mej="${m.id}" ${G.dinero < m.costo ? 'disabled' : ''}>Comprar · ${col(m.costo)}</button>`}</div>`).join('')}</div>`;
        B.querySelectorAll('[data-mej]').forEach(b => b.addEventListener('click', () => { const e = comprarMejora(b.dataset.mej); if (e) toast(e); else { sonido('logro'); toast('¡' + MEJ[b.dataset.mej].n + ' instalada!'); track('mejora', { id: b.dataset.mej }); guardar(); } pintarTab(); pintarHud(); }));
    } else if (tabM === 'personal') {
        B.innerHTML = `<div class="grid-p">
          <div class="mej ${G.ayudante ? 'tiene' : ''}"><div class="t"><span class="e">🧑‍🔧</span>Kevin, el sobrino</div><p>Atiende a la gente solo (más lento que usted, pero no se cansa) y ayuda con la limpieza. Cobra ${col(SALARIO_AYUDANTE)} por día trabajado.</p>
            <button class="btn sm ${G.ayudante ? 'gris' : ''}" id="bAyu">${G.ayudante ? 'Darle libre a Kevin' : 'Contratar a Kevin'}</button></div>
          <div class="mej"><div class="t"><span class="e">🧹</span>Limpieza: ${Math.round(G.limpieza)} / 100</div><p>Con la pulpe sucia viene menos gente, y si llega el inspector de Salud, hay multa. Cada cliente ensucia un poquito.</p>
            <button class="btn sm" id="bLimp" ${G.limpieza >= 99 ? 'disabled' : ''}>Limpiar a fondo · ${col(1500)}</button></div></div>`;
        $('#bAyu').addEventListener('click', () => { G.ayudante = !G.ayudante; track('ayudante', { on: G.ayudante }); guardar(); pintarTab(); });
        $('#bLimp').addEventListener('click', () => { const e = limpiar(); if (e) toast(e); else { sonido('ding'); track('limpiar'); } guardar(); pintarTab(); pintarHud(); });
    } else {
        const hs = G.hist.slice(-30), mx = Math.max(1, ...hs.map(h => Math.abs(h.ganancia)));
        const deuda = Object.values(G.fiado).reduce((a, b) => a + b, 0);
        B.innerHTML = `<div class="res"><div class="k sol"><small>Patrimonio</small><b>${col(patrimonio())}</b></div><div class="k"><small>Plata en caja</small><b>${col(G.dinero)}</b></div><div class="k"><small>Fiado pendiente</small><b>${col(deuda)}</b></div><div class="k"><small>Clientes atendidos</small><b>${G.stats.clientes}</b></div><div class="k"><small>Se fueron sin comprar</small><b>${G.stats.perdidos}</b></div><div class="k"><small>Fiado perdido</small><b>${col(G.stats.fiadoPerdido)}</b></div></div>
          <h3>Ganancia por día</h3>${hs.length ? `<div class="graf">${hs.map(h => `<i class="${h.ganancia < 0 ? 'neg' : ''}" style="height:${Math.max(3, Math.abs(h.ganancia) / mx * 100)}%" title="Día ${h.dia}: ${col(h.ganancia)}"></i>`).join('')}</div>` : '<p class="mini">Todavía no hay días cerrados.</p>'}
          <p class="mini">El patrimonio cuenta la plata, lo que hay en los estantes, el valor de las mejoras y la mitad del fiado pendiente. Es el puntaje de los récords.</p>`;
    }
}

// ----- noche -----
function pintarNoche() {
    const P = $('#panel'); P.hidden = false; const Hh = G.hoy;
    const falt = Object.entries(Hh.faltantes).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const deudores = Object.entries(G.fiado).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]);
    const gan = gananciaHoy(), dRep = Math.round(G.rep - Hh.repIni), gastos = (Hh.gastos.luz || 0) + (Hh.gastos.ayudante || 0) + (Hh.gastos.patente || 0);
    P.innerHTML = `<div class="pn-head"><h2>🌙 Cierre del día ${G.dia}<small>${esc(G.nombre)}</small></h2></div>
      <div class="res">
        <div class="k ${gan >= 0 ? 'pos' : 'neg'}"><small>Ganancia del día</small><b id="nGan">${col(gan)}</b></div>
        <div class="k"><small>Ventas</small><b>${col(Hh.ventas)}</b></div>
        <div class="k"><small>Clientes atendidos</small><b>${Hh.clientes}</b></div>
        <div class="k ${Hh.perdidos ? 'neg' : ''}"><small>Se fueron sin comprar</small><b>${Hh.perdidos}</b></div>
        <div class="k"><small>Costo de lo vendido</small><b>${col(Hh.costoVendido || 0)}</b></div>
        <div class="k ${Hh.merma ? 'neg' : ''}"><small>Se dañó (mermas)</small><b>${col(Hh.merma)}</b></div>
        <div class="k"><small>Luz${Hh.gastos.ayudante ? ', Kevin' : ''}${Hh.gastos.patente ? ', patente' : ''}</small><b>${col(gastos)}</b></div>
        ${Hh.comisiones ? `<div class="k pos"><small>Comisiones de recargas</small><b>${col(Hh.comisiones)}</b></div>` : ''}
        ${Hh.pinto ? `<div class="k pos"><small>Platos de gallo pinto</small><b>${Hh.pinto}</b></div>` : ''}
        ${Hh.multas ? `<div class="k neg"><small>Multas</small><b>${col(Hh.multas)}</b></div>` : ''}
        ${Hh.robo ? `<div class="k neg"><small>Le robaron</small><b>${col(Hh.robo)}</b></div>` : ''}
        <div class="k ${dRep >= 0 ? 'pos' : 'neg'}"><small>Reputación</small><b>⭐ ${Math.round(G.rep)} (${dRep >= 0 ? '+' : ''}${dRep})</b></div>
        <div class="k sol"><small>Patrimonio</small><b id="nPat">${col(patrimonio())}</b></div>
      </div>
      ${Hh.compet ? '<p class="mini">🏬 Abrió un minisúper a dos cuadras. Mantenga la reputación sobre 70 para que la gente le siga siendo fiel.</p>' : ''}
      <div class="cols"><div>
        <h3>📒 El cuaderno del fiado</h3>
        ${deudores.length ? `<p class="mini">Cobrar todas las noches a la misma persona cae mal. En quincena pagan más.</p><div class="lista">${deudores.map(([vid, m]) => { const v = VECINOS.find(x => x.id === vid), hf = G.histFiado[vid]; return `<div class="fil" id="f-${vid}"><div class="n">${esc(v.n)}<small>${hf ? 'Ha pagado ' + hf.pagos + ' de ' + (hf.pagos + hf.fallas) + ' cobros' : 'Nunca le ha cobrado'}</small></div><span class="m">${col(m)}</span><button class="btn sm" data-cob="${vid}" ${G.cobradoHoy[vid] ? 'disabled' : ''}>Cobrar</button><div class="r" id="r-${vid}"></div></div>`; }).join('')}</div>` : '<p class="mini">Nadie le debe nada. ¡Cuentas claras!</p>'}
        ${(Hh.seFue || []).map(([n, m]) => `<p class="mini">🧳 ${esc(n)} se fue del barrio debiéndole ${col(m)}.</p>`).join('')}
      </div><div>
        <h3>📋 Le pidieron y no había</h3>
        ${falt.length ? `<div class="lista">${falt.map(([id, n]) => `<div class="fil"><span>${PROD[id].e}</span><div class="n">${esc(PROD[id].n)}</div><span class="m">${n} veces</span></div>`).join('')}</div>` : '<p class="mini">No faltó nada. 👌</p>'}
        <h3>🧹 Limpieza: ${Math.round(G.limpieza)} / 100</h3>
        <button class="btn sm" id="bLimpN" ${G.limpieza >= 99 ? 'disabled' : ''}>Limpiar a fondo · ${col(1500)}</button>
      </div></div>
      <div class="pie"><button class="btn xl" id="bDormir">🌙 Dormir</button></div>`;
    P.querySelectorAll('[data-cob]').forEach(b => b.addEventListener('click', () => {
        const vid = b.dataset.cob, r = cobrar(vid); if (!r) return; b.disabled = true;
        const el = $('#r-' + vid); el.textContent = '«' + r.frase + '»' + (r.ok ? ' · +' + col(r.pago) : ''); el.className = 'r' + (r.ok ? ' ok' : '');
        if (r.ok) { sonido('caja'); const fm = $('#f-' + vid + ' .m'); fm.textContent = col(G.fiado[vid] || 0); } else sonido('no');
        $('#nGan').textContent = col(gananciaHoy()); $('#nPat').textContent = col(patrimonio());
        track('cobro', { ok: r.ok, pago: r.pago || 0 }); guardar(); pintarHud();
    }));
    $('#bLimpN').addEventListener('click', () => { const e = limpiar(); if (e) toast(e); else { sonido('ding'); pintarNoche(); } guardar(); });
    $('#bDormir').addEventListener('click', () => {
        const hito = dormir(); guardar(); track('dormir', { hito });
        if (hito) finHito(hito); else mostrarFase();
    });
}

// ---------- hitos: fin de la semana de prueba y de la temporada ----------
function finHito(hito) {
    const p = G.pendiente;
    mostrarFase();
    const semana = hito === 'semana';
    abrirModal(`<button class="x" data-cerrar>✕</button><h2>${semana ? '¡Primera semana completa!' : '🏆 ¡Temporada completa!'}</h2>
      <p>Patrimonio después de ${p.dias} días: <b style="color:var(--sol);font-size:24px">${col(p.puntaje)}</b></p>
      <div id="recEstado" class="mini">${USER ? 'Guardando su récord…' : ''}</div>
      ${USER ? '' : '<p>Entre o cree su cuenta (gratis) para guardar el récord y ver en qué puesto quedó.</p><button class="btn" id="bEntrarRec">Guardar mi récord</button>'}
      ${semana && !tienePase() ? `<div class="pase"><b>¿Le gustó? La pulpe sigue.</b><ul><li>La temporada completa de 30 días (récord nacional)</li><li>Limón y Tamarindo: dos barrios nuevos con clientes distintos</li><li>Modo libre sin fin después del día 30</li></ul><p style="margin:10px 0 0"><button class="btn" id="bPaseH">Ver el pase</button></p></div>` : ''}
      <p style="margin-top:14px"><button class="btn gris" id="bVerRec">Ver récords</button></p>`);
    if (USER) enviarRecord();
    const be = $('#bEntrarRec'); if (be) be.addEventListener('click', () => entrar('signup'));
    const bp = $('#bPaseH'); if (bp) bp.addEventListener('click', () => mPase('semana'));
    $('#bVerRec').addEventListener('click', () => mRecords(p.modo));
    track('hito', { hito, puntaje: p.puntaje });
}
async function enviarRecord() {
    if (!G || !G.pendiente || !USER) return;
    const p = G.pendiente;
    const r = await api('pulpe-score', { modo: p.modo, puntaje: p.puntaje, dias: p.dias, nombre: G.nombre, barrio: G.barrio, resumen: { ventas: G.stats.ventas, clientes: G.stats.clientes, fiadoPerdido: G.stats.fiadoPerdido, mejoras: Object.keys(G.mejoras).length, reputacion: G.rep } });
    const el = $('#recEstado');
    if (r.error) { if (el) el.textContent = r.status === 402 ? 'La temporada completa necesita el pase para entrar al récord.' : 'No se pudo guardar el récord: ' + r.error; return; }
    G.pendiente = null; guardar();
    const t = await api('pulpe-score?modo=' + p.modo);
    if (el) el.innerHTML = t.mio ? `✅ Récord guardado. Usted va en el <b style="color:var(--sol)">puesto ${t.mio.puesto}</b> de ${p.modo === 'semana' ? 'la semana' : 'la temporada'}.` : '✅ Récord guardado.';
}

// ---------- modales ----------
function menu() {
    abrirModal(`<button class="x" data-cerrar>✕</button><h2>☰ ${esc(G.nombre)}</h2>
      <div class="lista">
        <button class="btn gris" id="mRec">🏆 Récords</button>
        <button class="btn gris" id="mLog">🎖️ Logros (${Object.keys(G.logros).length}/${LOGROS.length})</button>
        <button class="btn gris" id="mAyu">❓ Cómo se juega</button>
        ${tienePase() ? '<p class="mini" style="text-align:center">⭐ Tiene el pase de dueño</p>' : '<button class="btn" id="mPase">⭐ Pase de dueño</button>'}
        ${USER ? `<p class="mini" style="text-align:center">Cuenta: ${esc(USER.email)} · <button class="lnk" id="mSalir">Salir</button></p>` : '<button class="btn gris" id="mEntrar">👤 Entrar (guarda la partida en su cuenta)</button>'}
        <button class="btn gris" id="mNueva">🆕 Nueva partida</button>
        <button class="btn gris" id="mPort">🏠 Portada</button>
      </div>`);
    $('#mRec').onclick = () => mRecords('semana'); $('#mLog').onclick = mLogros; $('#mAyu').onclick = mAyuda;
    const mp = $('#mPase'); if (mp) mp.onclick = () => mPase('menu');
    const me = $('#mEntrar'); if (me) me.onclick = () => { cerrarModal(); entrar('login'); };
    const ms = $('#mSalir'); if (ms) ms.onclick = () => { cerrarModal(); netlifyIdentity.logout(); };
    $('#mNueva').onclick = () => { if (G.fase === 'dia' || confirm('¿Empezar una pulpe nueva? La partida actual se pierde.')) mNueva(); };
    $('#mPort').onclick = () => { cerrarModal(); if (G.fase === 'dia') { toast('Termine el día primero (la pulpe está abierta).'); return; } guardar(); portada(); };
}
function mAyuda() {
    abrirModal(`<button class="x" data-cerrar>✕</button><h2>❓ Cómo se juega</h2>
      <p><b>En la mañana</b> pide al camión, pone precios y compra mejoras. Mire el pronóstico: aguaceros, calor, partidos de la Sele, apagones…</p>
      <p><b>En el día</b> la gente llega con lo que quiere en una burbuja. Toque la pantalla (o la barra espaciadora) para atender al primero de la fila. Si espera mucho, se va. Si no hay lo que busca, se queja.</p>
      <p><b>¿Fiado?</b> Algunos vecinos piden que les apunte. Fiar sube la reputación, pero no todos pagan. En la noche puede cobrar: en quincena pagan más.</p>
      <p><b>Lo perecedero se daña</b> (pan, leche, natilla, tortillas). Con refri dura más.</p>
      <p><b>El puntaje</b> es el patrimonio: plata, mercadería, mejoras y la mitad del fiado. La primera semana es gratis y entra al récord semanal; con el pase sigue hasta el día 30 y compite en la temporada.</p>`);
}
function mLogros() {
    abrirModal(`<button class="x" data-cerrar>✕</button><h2>🎖️ Logros</h2><div class="logros">${LOGROS.map(l => `<div class="logro ${G.logros[l.id] ? 'si' : ''}"><b>${G.logros[l.id] ? '🏆 ' : ''}${esc(l.n)}</b><span>${esc(l.d)}</span></div>`).join('')}</div>`);
}
async function mRecords(modo) {
    abrirModal(`<button class="x" data-cerrar>✕</button><h2>🏆 Récords</h2><div class="tabs"><button data-m="semana" class="${modo === 'semana' ? 'on' : ''}">Semana (7 días)</button><button data-m="temporada" class="${modo === 'temporada' ? 'on' : ''}">Temporada (30 días)</button></div><div id="recBody" class="mini">Cargando…</div>`);
    document.querySelectorAll('#modalCaja [data-m]').forEach(b => b.addEventListener('click', () => mRecords(b.dataset.m)));
    track('records_vistos', { modo });
    const r = await api('pulpe-score?modo=' + modo); const B = $('#recBody'); if (!B) return;
    if (r.error) { B.textContent = 'No se pudieron cargar los récords. ' + r.error; return; }
    B.innerHTML = (r.top.length ? `<table class="tabla"><tr><th>#</th><th>Pulpería</th><th>Barrio</th><th class="num">Patrimonio</th></tr>${r.top.map((x, i) => `<tr class="${x.yo ? 'yo' : ''}"><td>${i + 1}</td><td>${esc(x.nombre)}</td><td>${esc((BARRIOS[x.barrio] || {}).n || x.barrio)}</td><td class="num">${col(x.puntaje)}</td></tr>`).join('')}</table>` : '<p>Todavía no hay récords. ¡Sea el primero!</p>')
        + (r.mio ? `<p>Su mejor puesto: <b style="color:var(--sol)">${r.mio.puesto}</b> con ${col(r.mio.puntaje)}.</p>` : USER ? '' : '<p class="mini">Entre a su cuenta para aparecer en la tabla.</p>');
}
function mUrgente() {
    if (!G || G.fase !== 'dia') return;
    VIVO.pausa = true;
    abrirModal(`<button class="x" data-cerrar>✕</button><h2>🚚 Pedido urgente</h2><p class="mini">Cuesta 30 % más y llega en una hora. El juego está en pausa.</p>
      <div class="grid-p">${PRODUCTOS.filter(p => disponible(p.id)).map(p => `<div class="prod"><div class="t"><span class="e">${p.e}</span>${esc(p.n)}</div><div class="m"><span>Hay: <b>${cantidad(p.id)}</b></span><span>×${p.pack}: <b>${col(Math.round(p.pack * p.costo * 1.3))}</b></span></div><button class="btn sm" data-urg="${p.id}">Pedir</button></div>`).join('')}</div>`);
    document.querySelectorAll('[data-urg]').forEach(b => b.addEventListener('click', () => { const e = pedidoUrgente(b.dataset.urg); if (e) toast(e); else { toast('Pedido en camino: llega en una hora.'); sonido('caja'); track('urgente', { id: b.dataset.urg }); } pintarHud(); }));
    const obs = new MutationObserver(() => { if ($('#modal').hidden) { VIVO.pausa = !!VIVO.decision; obs.disconnect(); } }); obs.observe($('#modal'), { attributes: true });
}
function mNueva() {
    let barrio = 'barrio';
    const pinta = () => {
        abrirModal(`<button class="x" data-cerrar>✕</button><h2>🏪 Abrir una pulpe</h2>
          <label class="campo"><span>Nombre de su pulpería</span><input id="nNom" maxlength="40" value="${esc((G && G !== DEMO && G.nombre) || 'Pulpería La Bendición')}"></label>
          <div class="barrios">${Object.entries(BARRIOS).map(([k, b]) => `<button class="barrio ${k === barrio ? 'on' : ''}" data-b="${k}">${b.pase && !tienePase() ? '<span class="lock">🔒 Pase</span>' : ''}<b>${esc(b.n)}</b><span>${esc(b.d)}</span></button>`).join('')}</div>
          <p style="margin-top:16px"><button class="btn xl ver" id="nIr">¡Abrir mi pulpe!</button></p>`);
        document.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.b; if (BARRIOS[k].pase && !tienePase()) { mPase('barrio'); return; } barrio = k; pinta(); }));
        $('#nIr').addEventListener('click', () => {
            const nom = $('#nNom').value.trim() || 'Pulpería La Bendición';
            DEMO = null; nuevaPartida(nom, barrio); VIVO.clientes = []; guardar(); cerrarModal(); tabM = 'pedido'; tipVisto = false;
            track('partida_nueva', { barrio }); mostrarFase();
        });
    };
    pinta();
}

// ---------- pase (PayPal) ----------
async function mPase(desde) {
    track('pase_visto', { desde });
    if (!CONF || !CONF.plans) { try { CONF = await (await fetch(conClave('/.netlify/functions/pulpe-config'))).json(); } catch (_e) { CONF = { plans: [] }; } }
    const plans = CONF.plans || [], visibles = plans.filter(p => !p.hidden); let sel = (visibles[0] || plans[0] || {}).id;
    abrirModal(`<button class="x" data-cerrar>✕</button><h2>⭐ Pase de dueño</h2>
      <div class="pase"><div class="precio-p">US$${esc((visibles[0] || {}).usd || '3.99')}</div><p class="mini" style="margin:0">Pago único, para siempre. Con PayPal o tarjeta.</p>
        <ul><li>Temporada completa de 30 días y récord de temporada</li><li>Limón y Tamarindo: barrios con clientes y precios distintos</li><li>Modo libre sin fin después del día 30</li><li>Apoya a un desarrollador tico 🇨🇷</li></ul></div>
      ${plans.length > 1 ? `<div class="tabs">${plans.map(p => `<button data-pl="${p.id}" class="${p.id === sel ? 'on' : ''}">${esc(p.label)} · US$${esc(p.usd)}</button>`).join('')}</div>` : ''}
      ${USER ? '<div id="pp"></div>' : '<button class="btn" id="bEntrarPase">Entrar o crear cuenta para comprar</button>'}
      <p class="mini">¿Dudas? WhatsApp +506 8777-2993 · bonillapretiz@gmail.com · <a href="/privacidad/#pagos" target="_blank" rel="noopener" style="color:var(--sol)">Condiciones</a></p>`);
    document.querySelectorAll('[data-pl]').forEach(b => b.addEventListener('click', () => { sel = b.dataset.pl; document.querySelectorAll('[data-pl]').forEach(x => x.classList.toggle('on', x === b)); }));
    const be = $('#bEntrarPase'); if (be) be.addEventListener('click', () => { cerrarModal(); entrar('signup'); });
    if (!USER) return;
    const box = $('#pp'); if (!CONF.clientId) { box.innerHTML = '<p class="mini">PayPal no está configurado.</p>'; return; }
    box.innerHTML = '<p class="mini">Cargando PayPal…</p>';
    try {
        if (!window.paypal) await new Promise((ok, mal) => { const s = document.createElement('script'); s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CONF.clientId)}&currency=USD&intent=capture&components=buttons`; s.onload = ok; s.onerror = mal; document.head.appendChild(s); });
        box.innerHTML = '';
        window.paypal.Buttons({
            style: { layout: 'vertical', shape: 'pill', label: 'pay' },
            createOrder: async () => { const r = await api('pulpe-pay-create', { plan: sel, k: CLAVE || undefined }); if (!r.orderID) throw new Error(r.error || 'No se pudo iniciar el pago'); track('pago_iniciado', { plan: sel }); return r.orderID; },
            onApprove: async (data) => {
                box.innerHTML = '<p class="mini">Confirmando su pago…</p>';
                const r = await api('pulpe-pay-capture', { orderID: data.orderID });
                if (r.ok) { ACCESO = r.access || { active: true }; track('pago_ok', { plan: sel }); cerrarModal(); sonido('logro'); toast('¡Gracias! Ya tiene el pase de dueño. 🎉', 4500); if (G && G.fase === 'manana') pintarManana(); if (G && G.pendiente) enviarRecord(); }
                else { box.innerHTML = `<p class="mini" style="color:var(--mal)">${esc(r.error || 'No se pudo confirmar el pago.')}</p>`; track('pago_error'); }
            },
            onCancel: () => track('pago_cancelado'),
            onError: () => { box.innerHTML = '<p class="mini" style="color:var(--mal)">PayPal tuvo un problema. Intente de nuevo.</p>'; track('pago_error'); }
        }).render(box);
    } catch (_e) { box.innerHTML = '<p class="mini" style="color:var(--mal)">No se pudo cargar PayPal.</p>'; }
}

// ---------- portada (con una pulpe de muestra funcionando detrás) ----------
function portada() {
    const real = cargar();
    DEMO = nuevaPartida('Pulpería La Bendición', 'barrio');
    MEJORAS.forEach(m => { if (!['ampliacion', 'soda', 'planta'].includes(m.id)) DEMO.mejoras[m.id] = true; });
    DEMO.ayudante = true; DEMO.rep = 82; PRODUCTOS.forEach(p => { DEMO.stock[p.id] = [{ q: 30, dia: 1, c: p.costo }]; });
    DEMO.eventos = []; G = DEMO; abrirDia(); G.min = 16.5 * 60; VEL = 1;
    $('#hud').hidden = true; $('#panel').hidden = true; $('#portada').hidden = false; $('#portada').style.order = '-1';
    pintarPortada(real);
    track('portada', { tiene: !!real });
}
function pintarPortada(real) {
    real = real || cargar();
    $('#portada').innerHTML = `<div class="port-hero"><div>
        <h1>La Pulpe</h1>
        <p class="sub">Administre su propia pulpería tica.</p>
        <p class="sub2">Pida al camión, ponga precios, decida a quién fiarle y aguante aguaceros, apagones, inspectores y partidos de la Sele. ¿Cuánto patrimonio logra hacer en un mes?</p>
        <div class="port-btns">${real ? `<button class="btn xl ver" id="pSeguir">▶ Seguir · día ${real.dia}</button><button class="btn xl gris" id="pNueva">Nueva pulpe</button>` : '<button class="btn xl ver" id="pNueva">▶ Jugar gratis</button>'}<button class="btn xl gris" id="pRec">🏆 Récords</button></div>
        <p class="mini" style="margin-top:14px">La primera semana es gratis. ${USER ? 'Sesión: ' + esc(USER.email) : '<button class="lnk" id="pEntrar">Entrar</button> para guardar su partida y aparecer en los récords.'}</p>
      </div><div class="port-feat" style="grid-template-columns:1fr 1fr;margin:0">
        <div class="feat"><b>📒</b><span>¿Le fía a Don Chepe? Fiar sube la fama, pero no todos pagan.</span></div>
        <div class="feat"><b>⛈️</b><span>Aguaceros, calorones, apagones y la Sele cambian lo que se vende.</span></div>
        <div class="feat"><b>🛠️</b><span>Refri, vitrina, rótulo, sodita de gallo pinto y 8 mejoras más.</span></div>
        <div class="feat"><b>🏆</b><span>Récord nacional por semana y por temporada de 30 días.</span></div>
      </div></div>`;
    const s = $('#pSeguir'); if (s) s.onclick = () => { DEMO = null; G = cargar(); VIVO.clientes = []; if (G.fase === 'dia') { G.fase = 'manana'; } track('seguir'); mostrarFase(); };
    $('#pNueva').onclick = () => { if (real && !confirm('¿Empezar una pulpe nueva? La partida guardada se pierde.')) return; mNueva(); };
    $('#pRec').onclick = () => mRecords('semana');
    const e = $('#pEntrar'); if (e) e.onclick = () => entrar('login');
}

// arranque
portada();
requestAnimationFrame(bucle);
window.addEventListener('beforeunload', () => { if (G && G !== DEMO) guardar(); });
