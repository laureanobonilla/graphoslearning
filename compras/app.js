(function () {
'use strict';
var API = '/.netlify/functions/compras';
var CASAS = { paola: 'Paola', abue: 'Abue', casita: 'Casita' };
var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
var PRESETS = [3, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 365];
var S = { casa: lsGet('compras_casa') || 'paola', tab: 'fija', q: '', prod: [], items: [], hist: [], cats: [], P: {}, buy: null, busy: 0, cargado: false };
var $ = function (s) { return document.querySelector(s); };
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
if (!CASAS[S.casa]) S.casa = 'paola';
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); };
var money = function (n) { return '₡' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };

// ---------- fechas (todo en hora local de Costa Rica; el servidor solo guarda lo que le mandamos) ----------
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function hoy() { return iso(new Date()); }
function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function diff(a, b) { return Math.round((parse(a) - parse(b)) / 864e5); }   // a - b en días
function sumar(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
function fechaCorta(s) { var d = parse(s); return DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()]; }
function durTxt(n) { if (n % 365 === 0) return n / 365 === 1 ? '1 año' : n / 365 + ' años'; if (n >= 30 && n % 30 === 0) return n / 30 === 1 ? '1 mes' : n / 30 + ' meses'; if (n >= 7 && n % 7 === 0) return n / 7 === 1 ? '1 semana' : n / 7 + ' semanas'; return n === 1 ? '1 día' : n + ' días'; }
function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }

// ---------- reglas de aviso ----------
// Se avisa antes de que se acabe: ~23 % de la duración del producto, entre 2 y 14 días.
// 1 día → 2 · 7 días → 2 · 14 días → 3 · 30 días (1 mes) → 7 · 90 días → 14.
function anticipacion(per) { return Math.max(2, Math.min(14, Math.round(per * 0.23))); }
function info(it) {
    var p = S.P[it.producto_id]; if (!p) return null;
    var per = it.periodo_dias || p.periodo_dias, lead = anticipacion(per), h = hoy();
    var restan = it.cubre_hasta ? diff(it.cubre_hasta, h) : null;
    var pospuesto = it.posponer_hasta && h < it.posponer_hasta;
    var auto = !!(it.fijo && restan != null && restan <= lead && !pospuesto);
    var aviso = !!(it.pendiente || auto);
    var estado = restan != null && restan < 0 ? 'venc' : auto ? 'pronto' : it.fijo ? (restan == null ? 'sin' : 'ok') : 'x';
    return { p: p, per: per, lead: lead, restan: restan, auto: auto, aviso: aviso, estado: estado, pospuesto: pospuesto };
}
function itemsCasa() { return S.items.filter(function (i) { return i.casa === S.casa && S.P[i.producto_id]; }); }
function avisosDe(casa) { return S.items.filter(function (i) { if (i.casa !== casa) return false; var f = info(i); return f && f.aviso; }); }
function chipAviso(it, f) {
    if (f.restan != null && f.restan < 0 && (f.auto || it.fijo)) return '<span class="chip venc">Venció hace ' + plural(-f.restan, 'día', 'días') + '</span>';
    if (f.auto) return '<span class="chip pronto">' + (f.restan === 0 ? 'Se acaba hoy' : 'Se acaba en ' + plural(f.restan, 'día', 'días')) + '</span>';
    return '<span class="chip">Anotado</span>';
}

// ---------- red ----------
function setSt(k, t) { $('#dot').className = k; $('#st').textContent = t; }
async function call(body) {
    S.busy++; setSt('busy', 'Guardando…');
    try {
        var r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok) throw Object.assign(new Error(j.error || 'http'), { code: j.error });
        setSt('on', 'Guardado'); return j;
    } catch (e) { setSt('err', 'Sin conexión con el servidor'); throw e; } finally { S.busy--; }
}
async function cargar(primera) {
    try {
        var r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'estado' }) });
        var j = await r.json(); if (!r.ok) throw new Error('http');
        S.prod = j.productos; S.items = j.items; S.hist = j.historial; S.cats = j.categorias; S.P = {}; j.productos.forEach(function (p) { p.hay = norm(p.nombre + ' ' + (p.alias || '')); S.P[p.id] = p; });
        S.cargado = true; setSt('on', 'Al día'); pintar();
    } catch (e) { setSt('err', 'Sin conexión con el servidor'); if (primera) $('#view').innerHTML = '<p class="vacio"><b>No se pudo cargar</b>Revisa tu internet e intenta de nuevo.</p>'; }
}
function setItem(it) { var i = S.items.findIndex(function (x) { return x.casa === it.casa && x.producto_id === it.producto_id; }); if (i < 0) S.items.push(it); else S.items[i] = it; }
function getItem(pid) { return S.items.find(function (x) { return x.casa === S.casa && x.producto_id === pid; }); }
async function guardarItem(pid, cambios) {   // optimista: se ve al instante y luego se confirma
    var cur = getItem(pid) || { casa: S.casa, producto_id: pid, fijo: false, pendiente: false, periodo_dias: null, periodos: 1, ultima_compra: null, cubre_hasta: null, precio: null, nota: '', posponer_hasta: null };
    var antes = JSON.stringify(cur); setItem(Object.assign({}, cur, cambios)); pintar();
    try { var j = await call(Object.assign({ action: 'item', casa: S.casa, producto_id: pid }, cambios)); setItem(j.item); }
    catch (e) { var o = JSON.parse(antes); if (getItem(pid) && !cur.ultima_compra && !cur.fijo && !cur.pendiente) S.items = S.items.filter(function (x) { return !(x.casa === S.casa && x.producto_id === pid); }); else setItem(o); toast('No se guardó. Revisa tu internet.'); }
    pintar();
}

// ---------- avisos en pantalla ----------
var tt;
function toast(msg, acciones) {
    var t = $('#toast'); t.hidden = false;
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (acciones || []).map(function (a, i) { return '<button type="button" data-ta="' + i + '">' + esc(a[0]) + '</button>'; }).join('');
    t.onclick = function (e) { var b = e.target.closest('[data-ta]'); if (b) { t.hidden = true; acciones[+b.dataset.ta][1](); } };
    clearTimeout(tt); tt = setTimeout(function () { t.hidden = true; }, acciones && acciones.length ? 9000 : 3500);
}
function badges() {
    var total = 0;
    document.querySelectorAll('.houses button').forEach(function (b) { var n = avisosDe(b.dataset.casa).length; total += n; var e = b.querySelector('.bd'); e.hidden = !n; e.textContent = n; b.setAttribute('aria-label', CASAS[b.dataset.casa] + (n ? ', ' + n + ' por comprar' : '')); });
    document.title = (total ? '(' + total + ') ' : '') + 'Compras de las casas';
    if (navigator.setAppBadge) { try { total ? navigator.setAppBadge(total) : navigator.clearAppBadge(); } catch (e) {} }
}

// ---------- pintar ----------
function pintar() {
    document.body.dataset.casa = S.casa;
    document.querySelectorAll('.houses button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.casa === S.casa); });
    document.querySelectorAll('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === S.tab && !S.q); });
    var n = avisosDe(S.casa).length; $('#nCom').textContent = n || '';
    badges();
    var v = $('#view');
    if (!S.cargado) return;
    v.innerHTML = S.q ? vistaBuscar() : S.tab === 'comprar' ? vistaComprar() : S.tab === 'fija' ? vistaFija() : vistaHist();
}
function porCategoria(lista, fn) {
    var orden = S.cats, g = {}; lista.forEach(function (x) { (g[x.f.p.categoria] = g[x.f.p.categoria] || []).push(x); });
    return Object.keys(g).sort(function (a, b) { var i = orden.indexOf(a), j = orden.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); }).map(function (c) {
        return '<h2 class="cat">' + esc(c) + '</h2><ul>' + g[c].sort(function (a, b) { return a.f.p.nombre.localeCompare(b.f.p.nombre, 'es'); }).map(fn).join('') + '</ul>'; }).join('');
}
function lineaDur(it, f) { return 'dura ' + durTxt(f.per) + (it.periodo_dias ? ' aquí' : ''); }

function vistaComprar() {
    var lista = itemsCasa().map(function (i) { return { it: i, f: info(i) }; }).filter(function (x) { return x.f.aviso; });
    var sinReg = itemsCasa().filter(function (i) { var f = info(i); return i.fijo && f.restan == null && !i.pendiente; }).length;
    var fijos = itemsCasa().filter(function (i) { return i.fijo; }).length;
    var out = '';
    if (!fijos && !lista.length) return '<p class="vacio"><b>La lista de ' + CASAS[S.casa] + ' está vacía</b>Busca un producto arriba para anotarlo, o arma la pestaña Productos con los básicos de la casa.</p><div class="btns" style="justify-content:center"><button class="btn" data-act="basicos">Agregar los básicos a Productos</button></div>';
    var venc = lista.filter(function (x) { return x.f.restan != null && x.f.restan <= 0; }).length, est = lista.reduce(function (a, x) { return a + (x.it.precio || 0); }, 0), sinPrecio = lista.filter(function (x) { return x.it.precio == null; }).length;
    out += '<div class="resumen"><b>' + (lista.length ? plural(lista.length, 'producto', 'productos') + ' por comprar' : 'Todo al día en ' + CASAS[S.casa]) + '</b>' +
        '<div style="color:var(--mute);font-size:.9rem;margin-top:2px">' + (venc ? plural(venc, 'se acaba hoy o ya se acabó', 'se acaban hoy o ya se acabaron') + '. ' : '') + (est ? 'Aprox. ' + money(est) + (sinPrecio ? ' (faltan precios en ' + sinPrecio + ')' : '') : '') + (!lista.length ? 'Te aviso cuando algo esté por acabarse.' : '') + '</div>' +
        '<div class="acts">' + (lista.length ? '<button class="btn sm ghost" data-act="compartir">Compartir lista</button>' : '') + (sinReg ? '<button class="btn sm" data-act="irfija">' + sinReg + ' sin registrar</button>' : '') + '</div></div>';
    if (lista.length) out += porCategoria(lista, filaComprar);
    return out;
}
function filaComprar(x) {
    var it = x.it, f = x.f, abierto = S.buy && S.buy.pid === it.producto_id;
    return '<li class="it" data-p="' + it.producto_id + '"><div class="row"><button class="ck' + (abierto ? ' on' : '') + '" data-act="ck" aria-label="Marcar ' + esc(f.p.nombre) + ' como comprado"></button>' +
        '<button class="nm" data-act="det"><b>' + esc(f.p.nombre) + '</b><small>' + chipAviso(it, f) + lineaDur(it, f) + (it.nota ? ' · ' + esc(it.nota) : '') + '</small></button>' +
        '<button class="dots" data-act="det" aria-label="Más opciones de ' + esc(f.p.nombre) + '">⋯</button></div>' + (abierto ? panelCompra(it, f) : '') + '</li>';
}
function panelCompra(it, f) {
    var b = S.buy;
    return '<div class="buy"><div class="step"><button data-act="menos" aria-label="Un periodo menos">−</button><output id="bn">' + b.per + '</output><button data-act="mas" aria-label="Un periodo más">+</button><span id="bt"></span></div>' +
        '<label>Precio pagado (opcional) <input type="text" id="bp" inputmode="decimal" placeholder="₡" value="' + (b.precio == null ? '' : esc(b.precio)) + '"></label>' +
        '<div class="btns"><button class="btn" data-act="comprado">Listo, comprado</button><button class="btn ghost" data-act="cancel">Cancelar</button></div></div>';
}
function textoPeriodos() {
    if (!S.buy) return; var it = getItem(S.buy.pid), f = info(it), dias = f.per * S.buy.per;
    var e = $('#bt'); if (e) e.innerHTML = (S.buy.per === 1 ? 'periodo' : 'periodos') + ' de ' + durTxt(f.per) + '<br><b>Alcanza hasta el ' + fechaCorta(sumar(hoy(), dias)) + '</b> (' + durTxt(dias) + ')';
    var n = $('#bn'); if (n) n.textContent = S.buy.per;
}

function vistaFija() {
    var lista = itemsCasa().filter(function (i) { return i.fijo; }).map(function (i) { return { it: i, f: info(i) }; });
    if (!lista.length) return '<p class="vacio"><b>Aún no hay productos en ' + CASAS[S.casa] + '</b>Aquí van las cosas que siempre se compran en esta casa. Búscalos arriba o carga los básicos y quita los que no usen.</p><div class="btns" style="justify-content:center"><button class="btn" data-act="basicos">Agregar los básicos</button></div>';
    var orden = { venc: 0, pronto: 1, ok: 2, sin: 3 };
    lista.sort(function (a, b) { return orden[a.f.estado] - orden[b.f.estado] || (a.f.restan == null ? 1e9 : a.f.restan) - (b.f.restan == null ? 1e9 : b.f.restan) || a.f.p.nombre.localeCompare(b.f.p.nombre, 'es'); });
    var grupos = [['venc', 'Ya se acabaron'], ['pronto', 'Por acabarse'], ['ok', 'Al día'], ['sin', 'Sin registrar: ¿cuánto les queda?']], h = '';
    grupos.forEach(function (g) { var l = lista.filter(function (x) { return x.f.estado === g[0]; }); if (l.length) h += '<h2 class="cat">' + g[1] + ' · ' + l.length + '</h2>' + (g[0] === 'sin' ? '<div class="btns" style="margin-bottom:8px"><button class="btn sm" data-act="regtodos">Ya tengo todos · 1 periodo</button></div>' : '') + '<ul>' + l.map(filaFija).join('') + '</ul>'; });
    return h + '<div class="btns" style="margin-top:18px"><button class="btn sm ghost" data-act="basicos">Agregar los básicos que falten</button></div>';
}
function filaFija(x) {
    var it = x.it, f = x.f, abierto = S.buy && S.buy.pid === it.producto_id, tot = f.per * (it.periodos || 1), frac = f.restan == null ? 0 : Math.max(0, Math.min(1, f.restan / tot));
    var estado = f.restan == null ? '<span class="chip sin">Sin registro</span>' + lineaDur(it, f) : (f.restan < 0 ? '<span class="chip venc">Venció ' + fechaCorta(it.cubre_hasta) + '</span>' : '<span class="chip ' + (f.auto ? 'pronto' : 'ok') + '">Alcanza hasta ' + fechaCorta(it.cubre_hasta) + '</span>' + plural(f.restan, 'día', 'días')) + (it.pendiente ? ' · <b>anotado</b>' : '');
    return '<li class="it" data-p="' + it.producto_id + '"><div class="row"><button class="nm" data-act="det" style="padding-left:6px"><b>' + esc(f.p.nombre) + '</b><small>' + estado + '</small>' +
        (f.restan == null ? '' : '<div class="tank" aria-hidden="true"><i class="' + (f.restan < 0 ? 'venc' : f.auto ? 'pronto' : '') + '" style="width:' + Math.round(frac * 100) + '%"></i></div>') + '</button>' +
        (f.restan == null ? '<button class="btn sm ghost" data-act="tengo">Ya lo tengo</button>' : '<button class="btn sm ghost" data-act="' + (it.pendiente ? 'nopend' : 'falta') + '">' + (it.pendiente ? 'Anotado ✓' : 'Hace falta') + '</button>') + '</div>' + (abierto ? panelCompra(it, f) : '') + '</li>';
}

function vistaHist() {
    var h = S.hist.filter(function (x) { return x.casa === S.casa && S.P[x.producto_id]; });
    if (!h.length) return '<p class="vacio"><b>Todavía no hay compras anotadas</b>Cuando marques algo como comprado aparece aquí.</p>';
    var mes = hoy().slice(0, 7), gasto = h.filter(function (x) { return x.fecha.slice(0, 7) === mes && x.precio; }).reduce(function (a, x) { return a + Number(x.precio); }, 0);
    var ultimo = {}; h.forEach(function (x) { if (!ultimo[x.producto_id]) ultimo[x.producto_id] = x.id; });
    return (gasto ? '<div class="resumen"><b>' + money(gasto) + '</b> anotados este mes<div style="color:var(--mute);font-size:.88rem">Solo suma las compras a las que les pusiste precio.</div></div>' : '') +
        '<div class="it">' + h.slice(0, 80).map(function (x) { var p = S.P[x.producto_id];
            return '<div class="hrow"><div><b>' + esc(p.nombre) + '</b><small>' + fechaCorta(x.fecha) + ' · ' + plural(x.periodos, 'periodo', 'periodos') + (x.precio ? ' · ' + money(x.precio) : '') + '</small></div>' + (ultimo[x.producto_id] === x.id ? '<button class="btn sm ghost" data-act="deshacer" data-h="' + x.id + '">Deshacer</button>' : '') + '</div>'; }).join('') + '</div>';
}

// ---------- búsqueda ----------
function buscar(q) {
    var t = norm(q).split(' ').filter(Boolean); if (!t.length) return [];
    var r = [];
    S.prod.forEach(function (p) { var n = norm(p.nombre), ok = t.every(function (w) { return p.hay.indexOf(w) >= 0; }); if (!ok) return;
        var s = n === t.join(' ') ? 0 : n.indexOf(t[0]) === 0 ? 1 : (' ' + n).indexOf(' ' + t[0]) >= 0 ? 2 : 3; r.push([s, p]); });
    return r.sort(function (a, b) { return a[0] - b[0] || a[1].nombre.localeCompare(b[1].nombre, 'es'); }).slice(0, 25).map(function (x) { return x[1]; });
}
function vistaBuscar() {
    var res = buscar(S.q), exacto = res.some(function (p) { return norm(p.nombre) === norm(S.q); }), h = '';
    if (res.length) h += '<ul class="res">' + res.map(function (p) { var it = getItem(p.id) || {}, f = it.casa ? info(it) : null;
        return '<li class="it" data-p="' + p.id + '"><div class="row"><div class="nm" style="cursor:default"><b>' + esc(p.nombre) + '</b><small>' + esc(p.categoria) + ' · dura ' + durTxt((it.periodo_dias) || p.periodo_dias) + (f && f.restan != null ? ' · alcanza hasta ' + fechaCorta(it.cubre_hasta) : '') + '</small>' +
            '<div class="tg"><button data-act="tfijo" aria-pressed="' + !!it.fijo + '">' + (it.fijo ? 'En productos ✓' : '+ Productos') + '</button><button data-act="tpend" aria-pressed="' + !!it.pendiente + '">' + (it.pendiente ? 'Pendiente ✓' : '+ Pendiente') + '</button></div></div></div></li>'; }).join('') + '</ul>';
    if (!exacto) h += formNuevo(!res.length);
    return h;
}
function opcionesDur(sel) { var l = PRESETS.slice(); if (l.indexOf(sel) < 0) l.push(sel); l.sort(function (a, b) { return a - b; }); return l.map(function (n) { return '<option value="' + n + '"' + (n === sel ? ' selected' : '') + '>' + durTxt(n) + '</option>'; }).join(''); }
function formNuevo(solo) {
    return '<div class="nuevo" id="fNuevo"><h3>' + (solo ? 'No lo encontré. ' : '¿No es ninguno? ') + 'Agregar «' + esc(S.q.trim()) + '» como producto nuevo</h3>' +
        '<label>Categoría<select id="nCat">' + S.cats.map(function (c) { return '<option' + (c === 'Otros' ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
        '<label>¿Cada cuánto se acaba?<select id="nDur">' + opcionesDur(30) + '</select></label>' +
        '<label class="chk"><input type="checkbox" id="nFijo"> Está en Productos de ' + CASAS[S.casa] + '</label>' +
        '<button class="btn" data-act="crear">Agregar a pendientes de ' + CASAS[S.casa] + '</button></div>';
}

// ---------- detalle (hoja inferior) ----------
var sheetPid = null;
function abrirDetalle(pid) {
    sheetPid = pid; var p = S.P[pid], it = getItem(pid) || { fijo: false, pendiente: false, periodo_dias: null, precio: null, nota: '' }, f = it.casa ? info(it) : null;
    var sh = $('#sheet');
    sh.innerHTML = '<h2>' + esc(p.nombre) + '</h2><div style="color:var(--mute);font-size:.9rem;margin-top:-6px">' + esc(p.categoria) + ' · estándar: dura ' + durTxt(p.periodo_dias) + (f && f.restan != null ? ' · alcanza hasta ' + fechaCorta(it.cubre_hasta) : '') + '</div>' +
        '<label class="chk"><input type="checkbox" id="dFijo"' + (it.fijo ? ' checked' : '') + '> Está en Productos de ' + CASAS[S.casa] + '</label>' +
        '<label class="chk"><input type="checkbox" id="dPend"' + (it.pendiente ? ' checked' : '') + '> Pendiente de comprar</label>' +
        '<label>Cada cuánto se acaba en ' + CASAS[S.casa] + '<select id="dDur"><option value="">Estándar (' + durTxt(p.periodo_dias) + ')</option>' + PRESETS.concat(it.periodo_dias && PRESETS.indexOf(it.periodo_dias) < 0 ? [it.periodo_dias] : []).sort(function (a, b) { return a - b; }).map(function (n) { return '<option value="' + n + '"' + (n === it.periodo_dias ? ' selected' : '') + '>' + durTxt(n) + '</option>'; }).join('') + '</select></label>' +
        '<label>Precio habitual (opcional)<input type="text" id="dPrecio" inputmode="decimal" placeholder="₡" value="' + (it.precio == null ? '' : esc(it.precio)) + '"></label>' +
        '<label>Nota (marca, tamaño…)<input type="text" id="dNota" maxlength="200" value="' + esc(it.nota || '') + '"></label>' +
        '<div class="btns"><button class="btn" data-act="guardar">Guardar</button><button class="btn ghost" data-act="cerrar">Cerrar</button></div>' +
        (it.fijo && it.cubre_hasta ? '<hr><div class="btns"><button class="btn sm ghost" data-act="posponer" data-d="3">Ahora no · 3 días</button><button class="btn sm ghost" data-act="posponer" data-d="7">Ahora no · 1 semana</button></div>' : '') +
        '<hr><details><summary style="min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:600">Editar el producto (cambia en todas las casas)</summary><div style="display:grid;gap:10px;margin-top:8px">' +
        '<label>Nombre<input type="text" id="eNom" maxlength="80" value="' + esc(p.nombre) + '"></label>' +
        '<label>Categoría<select id="eCat">' + S.cats.map(function (c) { return '<option' + (c === p.categoria ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
        '<label>Duración estándar<select id="eDur">' + opcionesDur(p.periodo_dias) + '</select></label>' +
        '<button class="btn sm" data-act="editarprod">Guardar producto</button></div></details>' +
        (it.casa ? '<button class="btn warn" data-act="quitar">Quitar de ' + CASAS[S.casa] + '</button>' : '');
    $('#scrim').hidden = false; sh.hidden = false; var c = sh.querySelector('input,select'); if (c) c.focus();
}
function cerrar() { $('#sheet').hidden = true; $('#scrim').hidden = true; sheetPid = null; }

// ---------- acciones ----------
async function comprar(pid, per, precio) {
    var h = hoy(), it = getItem(pid), f = info(it), hasta = sumar(h, f.per * per), antes = Object.assign({}, it);
    setItem(Object.assign({}, it, { pendiente: false, periodos: per, ultima_compra: h, cubre_hasta: hasta, posponer_hasta: null, precio: precio != null ? precio : it.precio })); S.buy = null; pintar();
    try {
        var j = await call({ action: 'comprar', casa: S.casa, producto_id: pid, periodos: per, fecha: h, precio: precio });
        setItem(j.item); S.hist.unshift({ id: j.historial_id, casa: S.casa, producto_id: pid, fecha: h, periodos: per, precio: precio }); pintar();
        var acc = [['Deshacer', function () { deshacer(j.historial_id); }]]; if (!j.item.fijo) acc.push(['Dejar en Productos', function () { guardarItem(pid, { fijo: true }); }]);
        toast(S.P[pid].nombre + ': alcanza hasta el ' + fechaCorta(hasta), acc);
    } catch (e) { setItem(antes); pintar(); toast('No se pudo guardar la compra. Intenta de nuevo.'); }
}
async function deshacer(hid) {
    try { await call({ action: 'deshacer', casa: S.casa, historial_id: hid }); await cargar(false); toast('Compra deshecha.'); } catch (e) { toast('No se pudo deshacer.'); }
}
function compartir() {
    var lista = itemsCasa().map(function (i) { return { it: i, f: info(i) }; }).filter(function (x) { return x.f.aviso; }), g = {};
    lista.forEach(function (x) { (g[x.f.p.categoria] = g[x.f.p.categoria] || []).push(x); });
    var t = '🛒 Compras de ' + CASAS[S.casa] + ' (' + fechaCorta(hoy()) + ')\n' + S.cats.filter(function (c) { return g[c]; }).map(function (c) { return '\n*' + c + '*\n' + g[c].map(function (x) { return '☐ ' + x.f.p.nombre + (x.it.nota ? ' (' + x.it.nota + ')' : ''); }).join('\n'); }).join('\n');
    if (navigator.share) navigator.share({ text: t }).catch(function () {}); else window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noopener');
}

document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-act],[data-casa],[data-tab]'); if (!b) return;
    if (b.dataset.casa && b.closest('.houses')) { S.casa = b.dataset.casa; lsSet('compras_casa', S.casa); S.buy = null; pintar(); return; }
    if (b.dataset.tab) { S.tab = b.dataset.tab; S.q = ''; $('#q').value = ''; S.buy = null; pintar(); return; }
    var li = b.closest('[data-p]'), pid = li ? Number(li.dataset.p) : sheetPid, a = b.dataset.act;
    if (a === 'ck' || a === 'tengo') { var it = getItem(pid); S.buy = S.buy && S.buy.pid === pid && a === 'ck' ? null : { pid: pid, per: it.periodos || 1, precio: it.precio }; pintar(); textoPeriodos(); var bp = $('#bp'); if (bp && S.buy) bp.focus({ preventScroll: true }); return; }
    if (a === 'mas' || a === 'menos') { S.buy.per = Math.max(1, Math.min(60, S.buy.per + (a === 'mas' ? 1 : -1))); textoPeriodos(); return; }
    if (a === 'cancel') { S.buy = null; pintar(); return; }
    if (a === 'comprado') { var pr = $('#bp').value.trim(), n = pr === '' ? null : Number(pr.replace(/[₡\s.]/g, '').replace(',', '.')); if (n != null && !(n >= 0)) { toast('El precio debe ser un número.'); return; } comprar(S.buy.pid, S.buy.per, n); return; }
    if (a === 'det') { abrirDetalle(pid); return; }
    if (a === 'cerrar') { cerrar(); return; }
    if (a === 'falta') { guardarItem(pid, { pendiente: true }); return; }
    if (a === 'nopend') { guardarItem(pid, { pendiente: false }); return; }
    if (a === 'tfijo') { var c = getItem(pid); guardarItem(pid, { fijo: !(c && c.fijo) }); return; }
    if (a === 'tpend') { var d = getItem(pid); guardarItem(pid, { pendiente: !(d && d.pendiente) }); return; }
    if (a === 'irfija') { S.tab = 'fija'; pintar(); window.scrollTo({ top: 0 }); return; }
    if (a === 'regtodos') { var nsr = itemsCasa().filter(function (i) { return i.fijo && !i.cubre_hasta; }).length; if (!confirm('Se anotará que ya tienen 1 periodo de cada uno de los ' + nsr + ' productos sin registrar, contando desde hoy. Después se te avisa cuando se vayan acabando. ¿Seguro?')) return; b.disabled = true; try { await call({ action: 'registrar', casa: S.casa, fecha: hoy(), periodos: 1 }); await cargar(false); toast('Listo: ya quedaron registrados.'); } catch (err) { toast('No se pudo. Intenta de nuevo.'); b.disabled = false; } return; }
    if (a === 'compartir') { compartir(); return; }
    if (a === 'deshacer') { deshacer(Number(b.dataset.h)); return; }
    if (a === 'basicos') { b.disabled = true; try { var j = await call({ action: 'basicos', casa: S.casa }); await cargar(false); toast(j.agregados ? 'Se agregaron ' + plural(j.agregados, 'producto', 'productos') + ' a Productos. Marca «Ya lo tengo» en los que ya hay en casa.' : 'Ya estaban todos los básicos.'); S.tab = 'fija'; pintar(); } catch (err) { toast('No se pudo. Intenta de nuevo.'); b.disabled = false; } return; }
    if (a === 'crear') {
        var nom = S.q.trim(); b.disabled = true;
        try { var r = await call({ action: 'nuevo', casa: S.casa, nombre: nom, categoria: $('#nCat').value, periodo_dias: Number($('#nDur').value), fijo: $('#nFijo').checked, pendiente: true });
            r.producto.hay = norm(r.producto.nombre + ' ' + (r.producto.alias || '')); if (!S.P[r.producto.id]) S.prod.push(r.producto); S.P[r.producto.id] = r.producto; setItem(r.item);
            S.q = ''; $('#q').value = ''; S.tab = 'comprar'; pintar(); toast(r.nuevo ? '«' + r.producto.nombre + '» quedó en pendientes y ya se puede buscar.' : '«' + r.producto.nombre + '» ya existía; se anotó en pendientes.'); }
        catch (err) { toast('No se pudo agregar. Intenta de nuevo.'); b.disabled = false; } return; }
    if (a === 'guardar') {
        var pr2 = $('#dPrecio').value.trim(), n2 = pr2 === '' ? null : Number(pr2.replace(/[₡\s.]/g, '').replace(',', '.')); if (n2 != null && !(n2 >= 0)) { toast('El precio debe ser un número.'); return; }
        var cambios = { fijo: $('#dFijo').checked, pendiente: $('#dPend').checked, periodo_dias: $('#dDur').value === '' ? null : Number($('#dDur').value), precio: n2, nota: $('#dNota').value.trim() }; cerrar(); guardarItem(pid, cambios); return; }
    if (a === 'posponer') { var h2 = sumar(hoy(), Number(b.dataset.d)); cerrar(); guardarItem(pid, { posponer_hasta: h2, pendiente: false }); toast('Te vuelvo a avisar el ' + fechaCorta(h2) + '.'); return; }
    if (a === 'quitar') { if (!confirm('¿Quitar «' + S.P[pid].nombre + '» de ' + CASAS[S.casa] + '? El historial se conserva.')) return; cerrar(); S.items = S.items.filter(function (x) { return !(x.casa === S.casa && x.producto_id === pid); }); pintar(); try { await call({ action: 'quitar', casa: S.casa, producto_id: pid }); } catch (err) { toast('No se pudo quitar.'); cargar(false); } return; }
    if (a === 'editarprod') {
        var o = { action: 'producto', id: pid, casa: S.casa, nombre: $('#eNom').value, categoria: $('#eCat').value, periodo_dias: Number($('#eDur').value) };
        try { var r2 = await call(o); Object.assign(S.P[pid], r2.producto); S.P[pid].hay = norm(S.P[pid].nombre + ' ' + (S.P[pid].alias || '')); cerrar(); pintar(); toast('Producto actualizado.'); }
        catch (err) { toast(err.code === 'repetido' ? 'Ya existe otro producto con ese nombre.' : 'No se pudo guardar.'); } return; }
});
$('#scrim').addEventListener('click', cerrar);
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); });
var qt; $('#q').addEventListener('input', function (e) { clearTimeout(qt); qt = setTimeout(function () { S.q = e.target.value; S.buy = null; pintar(); }, 120); });
$('#q').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.target.blur(); });

function altoEncabezado() { document.documentElement.style.setProperty('--topH', document.querySelector('.top').offsetHeight + 'px'); }
window.addEventListener('resize', altoEncabezado);
altoEncabezado(); cargar(true);
// Si otra persona cambia algo, se ve solo (no se refresca mientras alguien escribe o tiene un panel abierto).
setInterval(function () { var ae = document.activeElement; if (document.hidden || S.busy || S.buy || sheetPid != null || (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName))) return; cargar(false); }, 45000);
document.addEventListener('visibilitychange', function () { if (!document.hidden && !S.busy && !S.buy && sheetPid == null) cargar(false); });
})();
