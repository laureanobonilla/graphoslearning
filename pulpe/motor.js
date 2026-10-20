/* La Pulpe · motor: estado de la partida y simulación (sin dibujo ni pantallas). */
'use strict';

// ---------- azar con semilla (los eventos de cada día salen de la partida, no de la suerte del momento) ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = Math.random;
const pick = (a, r = rnd) => a[Math.floor(r() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const col = (n) => '₡' + Math.round(n).toLocaleString('es-CR');

let G = null;            // la partida (se guarda)
const VIVO = { clientes: [], fx: [], textos: [], sirviendo: 0, ayuTimer: 0, pausa: false, decision: null, uid: 0, llegadas: 0, urgentes: [] };   // lo que no se guarda

function nuevaPartida(nombre, barrio) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    G = {
        v: 1, nombre: (nombre || 'Pulpería La Bendición').slice(0, 40), barrio: BARRIOS[barrio] ? barrio : 'barrio', seed,
        dia: 1, fase: 'manana', min: DIA_INI, dinero: DINERO_INI, rep: 50, limpieza: 85,
        stock: {}, precios: {}, mejoras: {}, ayudante: false,
        fiado: {}, histFiado: {}, cobradoAyer: {},
        hoy: null, hist: [], stats: { ventas: 0, clientes: 0, fiadoCobrado: 0, fiadoPerdido: 0, perdidos: 0 },
        logros: {}, eventos: [], compet: false, pintoAcum: 0, records: {}, pendiente: null, creado: Date.now(), actualizado: Date.now()
    };
    PRODUCTOS.forEach(p => { G.precios[p.id] = p.ref; G.stock[p.id] = []; });
    // Arranca con un poquito de todo lo básico.
    ['pan', 'leche', 'arroz', 'frijoles', 'gaseosa', 'confites', 'galletas', 'cafe', 'huevos', 'papas', 'azucar', 'aceite', 'jabon', 'papel', 'tortillas'].forEach(id => agregarStock(id, PROD[id].pack));
    G.eventos = sortearEventos(1);
    nuevoDiaContadores();
    return G;
}
function nuevoDiaContadores() {
    G.hoy = { ventas: 0, costo: 0, clientes: 0, perdidos: 0, caros: 0, faltantes: {}, fiadoNuevo: 0, cobrado: 0, comisiones: 0, pinto: 0, merma: 0, gastos: {}, repIni: G.rep, eventosVistos: [], multas: 0, robo: 0 };
}

// ---------- inventario por lotes (para que lo perecedero se dañe por antigüedad) ----------
const cantidad = (id) => (G.stock[id] || []).reduce((a, l) => a + l.q, 0);
const capacidad = () => (G.mejoras.ampliacion ? 64 : 40);
function agregarStock(id, q, costoU) { const p = PROD[id]; (G.stock[id] = G.stock[id] || []).push({ q, dia: G.dia, c: costoU == null ? p.costo : costoU }); }
function sacarStock(id, q) {
    let costo = 0; const lots = G.stock[id] || [];
    while (q > 0 && lots.length) { const l = lots[0]; const t = Math.min(q, l.q); l.q -= t; q -= t; costo += t * l.c; if (l.q <= 0) lots.shift(); }
    return costo;
}
const vidaDe = (p) => (G.mejoras.refri && p.vidaRefri ? p.vidaRefri : p.vida);
const disponible = (id) => { const p = PROD[id]; return !p.req || !!G.mejoras[p.req]; };
const bebidaFria = (id) => (id === 'gaseosa' || id === 'birra') && G.mejoras.refri;

function patrimonio() {
    let v = G.dinero;
    PRODUCTOS.forEach(p => (G.stock[p.id] || []).forEach(l => { v += l.q * l.c; }));
    MEJORAS.forEach(m => { if (G.mejoras[m.id]) v += m.costo * 0.6; });
    Object.values(G.fiado).forEach(m => { v += m * 0.5; });
    return Math.round(v);
}
const esQuincena = (d = G.dia) => d % 15 === 0 || d % 15 === 1 && d > 1;
const hayEvento = (id) => G.eventos.some(e => e.id === id);

// ---------- eventos del día (se sortean la noche anterior para que se puedan planear) ----------
function sortearEventos(dia) {
    const r = mulberry32(G.seed + dia * 7919), out = [];
    const B = BARRIOS[G.barrio];
    EVENTOS.forEach(ev => {
        let p = ev.prob;
        if (ev.id === 'calor' && B.calor) p = B.calor;
        if (ev.id === 'inspector') p = G.limpieza < 60 ? 0.22 : ev.prob;
        if (ev.id === 'ladron' && G.mejoras.rejas) p = 0;
        if (ev.id === 'turno' && dia < 4) p = 0;
        if (r() < p) out.push({ id: ev.id, h: 8 + Math.floor(r() * 10), dur: 2 + Math.floor(r() * 3) });
    });
    // lluvia y calor no van juntos
    if (out.some(e => e.id === 'lluvia') && out.some(e => e.id === 'calor')) out.splice(out.findIndex(e => e.id === 'calor'), 1);
    out.forEach(e => { if (e.id === 'apagon') e.h = 11 + Math.floor(r() * 6); if (e.id === 'sele') e.h = 19; });
    if (G.barrio === 'playa') out.push({ id: '_playa', f: 0.65 + r() * 0.8 });   // gente variable en la playa
    return out;
}
const enLluvia = () => hayEvento('lluvia');
function apagonAhora() { const e = G.eventos.find(x => x.id === 'apagon'); if (!e) return false; const h = G.min / 60; return h >= e.h && h < e.h + e.dur; }

// ---------- demanda ----------
function pesoProducto(p, h, vec) {
    if (!disponible(p.id)) return 0;
    const B = BARRIOS[G.barrio];
    let w = p.dem * curvaHora(p.cat, h) * (B.dem[p.id] || 1);
    if (enLluvia() && (p.id === 'cafe' || p.id === 'pan')) w *= 1.45;
    if (enLluvia() && (p.id === 'helado')) w *= 0.4;
    if (hayEvento('calor') && ['helado', 'gaseosa', 'birra'].includes(p.id)) w *= 1.6;
    if (hayEvento('sele') && h >= 17 && ['birra', 'gaseosa', 'papas'].includes(p.id)) w *= 2.3;
    if (bebidaFria(p.id)) w *= 1.3;
    if (G.mejoras.vitrina && p.cat === 'antojo') w *= 1.35;
    if (vec && vec.fav.includes(p.id)) w *= 2.2;
    return w;
}
function tasaLlegada(h) {
    const B = BARRIOS[G.barrio];
    let t = 0.072 * B.gente * afluencia(h) * (0.55 + G.rep / 110) * (1 + Math.min(0.45, (G.dia - 1) * 0.016));
    if (G.mejoras.rotulo) t *= h >= 18 ? 1.25 : 1.1;
    if (G.mejoras.ampliacion) t *= 1.2;
    if (enLluvia()) t *= 0.8;
    if (hayEvento('turno')) t *= 1.5;
    if (esQuincena()) t *= 1.25;
    if (G.compet && G.rep < 70) t *= 0.88;
    const pl = G.eventos.find(e => e.id === '_playa'); if (pl) t *= pl.f;
    if (G.limpieza < 40) t *= 0.85;
    return t;
}
function elegirItems(h, vec) {
    const n = 1 + (rnd() < 0.45 ? 1 : 0) + (rnd() < (G.mejoras.datafono ? 0.3 : 0.14) ? 1 : 0);
    const pesos = PRODUCTOS.map(p => [p.id, pesoProducto(p, h, vec)]).filter(x => x[1] > 0);
    const tot = pesos.reduce((a, x) => a + x[1], 0), out = [];
    for (let i = 0; i < n; i++) {
        let r = rnd() * tot;
        for (const [id, w] of pesos) { r -= w; if (r <= 0) { if (!out.includes(id)) out.push(id); break; } }
    }
    return out.length ? out : ['confites'];
}

// ---------- clientes ----------
const FILA_X = [262, 338, 414, 490, 566, 642, 718];
const filaMax = () => (G.mejoras.ampliacion ? 7 : 5);
function crearCliente(especial) {
    const h = G.min / 60;
    const ocupados = new Set(VIVO.clientes.map(c => c.vec && c.vec.id)), libres = VECINOS.filter(v => !ocupados.has(v.id));
    const vec = especial || !libres.length ? null : (rnd() < 0.45 ? pick(libres) : null);
    const c = {
        id: ++VIVO.uid, vec, especial: especial || null, x: 852, y: 392, tx: 852, estado: 'entra', items: [], paciencia: 0, pacMax: 0,
        piel: pick(PIELES), ropa: pick(ROPAS), pantalon: pick(['#2d3436', '#34495e', '#6c5ce7', '#0984e3', '#636e72', '#b2bec3']), pelo: pick(['#2d1b0e', '#1a1a1a', '#5a3825', '#8e6e53', '#c0c0c0']),
        peinado: Math.floor(rnd() * 4), sombrero: rnd() < 0.18 ? pick(['gorra', 'sombrero']) : null, alto: 0.92 + rnd() * 0.16, paraguas: enLluvia(), fase: rnd() * 6, bolsa: false, burbuja: null
    };
    if (vec && especial == null) { const s = vec.id.charCodeAt(1) + vec.id.length * 13; c.ropa = ROPAS[s % ROPAS.length]; c.piel = PIELES[s % PIELES.length]; }
    if (especial === 'inspector') { c.ropa = '#ecf0f1'; c.pantalon = '#2c3e50'; c.sombrero = 'gorra'; c.items = []; }
    else if (especial === 'chismosa') { c.ropa = '#e056fd'; c.pelo = '#c0c0c0'; c.peinado = 3; c.items = elegirItems(h, null); }
    else c.items = elegirItems(h, vec);
    c.pacMax = c.paciencia = 34 + rnd() * 30;
    VIVO.clientes.push(c);
    return c;
}
const enFila = () => VIVO.clientes.filter(c => c.estado === 'fila' || c.estado === 'atendiendo' || c.estado === 'decide').sort((a, b) => a.pos - b.pos);
function reordenarFila() { enFila().forEach((c, i) => { c.pos = i; c.tx = FILA_X[i]; }); }

// La reputación es, sobre todo, cuánta gente sale contenta: promedio móvil de la satisfacción de cada cliente (0 a 1).
function opinion(s) { if (s == null) return; G.rep = clamp(G.rep * 0.975 + clamp(s, 0, 1) * 100 * 0.025, 0, 100); }
function decir(c, txt, ttl = 2.6) { c.burbuja = { txt, t: 0, ttl }; }
function flotante(x, y, txt, color) { VIVO.textos.push({ x, y, txt, color: color || '#2ecc71', t: 0 }); }
function monedas(x, y, n) { for (let i = 0; i < Math.min(8, n); i++) VIVO.fx.push({ x, y: y - 40, vx: (150 - x) / 0.7 + (rnd() - 0.5) * 60, vy: -260 - rnd() * 120, t: 0, tipo: 'moneda' }); }

// ¿Se lo lleva con este precio? (el barrio cambia cuánto toleran los precios altos)
function compraConPrecio(id) {
    const r = G.precios[id] / PROD[id].ref / BARRIOS[G.barrio].tolera;
    if (r <= 1) return true;
    return rnd() < Math.max(0, 1 - (r - 1) * 2.4);
}

// Atiende al primero de la fila. Devuelve false si no hay nadie o el pulpero está ocupado.
function atender(porAyudante) {
    const c = enFila()[0]; if (!c || c.estado !== 'fila' || c.x > FILA_X[0] + 6) return false;
    if (!porAyudante) { if (VIVO.sirviendo > 0) return false; VIVO.sirviendo = 0.75; }
    c.estado = 'atendiendo';
    const H = G.hoy;
    if (c.especial === 'inspector') { inspeccion(c); return true; }
    let total = 0, costo = 0, faltan = [], caros = [], sacados = [];
    c.items.forEach(id => {
        if (cantidad(id) <= 0) { faltan.push(id); H.faltantes[id] = (H.faltantes[id] || 0) + 1; return; }
        if (!compraConPrecio(id)) { caros.push(id); H.caros++; return; }
        const q = id === 'confites' ? 1 + Math.floor(rnd() * 4) : 1;
        const qq = Math.min(q, cantidad(id));
        const cu = sacarStock(id, qq); costo += cu; total += G.precios[id] * qq; sacados.push([id, qq, cu]);
    });
    // gallo pinto en la mañana
    if (G.mejoras.soda && G.min < 10 * 60 && rnd() < 0.3 && cantidad('arroz') > 0 && cantidad('frijoles') > 0) {
        total += 1500; H.pinto++; G.pintoAcum += 1;
        if (G.pintoAcum >= 4) { G.pintoAcum = 0; G.hoy.costoVendido = (G.hoy.costoVendido || 0) + sacarStock('arroz', 1) + sacarStock('frijoles', 1) + (cantidad('huevos') ? sacarStock('huevos', 1) : 0); }
    }
    if (G.mejoras.servicios && rnd() < 0.25) { H.comisiones += 150; G.dinero += 150; }
    H.clientes++; G.stats.clientes++;
    if (faltan.length) decir(c, pick(FRASES.noHay) + ' ' + faltan.map(id => PROD[id].e).join(''));
    else if (caros.length) decir(c, pick(FRASES.caro));
    const satisfecho = !faltan.length && !caros.length;
    const pedidos = c.items.length || 1;
    opinion(c.especial === 'inspector' ? null : (pedidos - faltan.length - caros.length * 0.6) / pedidos);
    if (c.especial === 'chismosa') { G.rep += satisfecho ? 5 : -5; flotante(c.x, 380, satisfecho ? '¡Doña Chusa habla maravillas! +5 ⭐' : 'Doña Chusa va a hablar mal… −5 ⭐', satisfecho ? '#f1c40f' : '#e74c3c'); }
    if (total <= 0) { c.estado = 'sale'; c.tx = 900; reordenarFila(); sonido('no'); return true; }
    // ¿Fiado?
    const pideFiado = c.vec && rnd() < 0.2 * BARRIOS[G.barrio].fiado * (esQuincena() ? 0.4 : 1);
    c.cuenta = { total, costo, satisfecho, sacados };
    if (pideFiado) { c.estado = 'decide'; decir(c, pick(FRASES.fiado), 99); VIVO.decision = c; VIVO.pausa = true; sonido('ding'); return true; }
    cobrarCliente(c, total, satisfecho);
    return true;
}
function cobrarCliente(c, total, satisfecho) {
    G.hoy.costoVendido = (G.hoy.costoVendido || 0) + (c.cuenta ? c.cuenta.costo : 0);
    G.dinero += total; G.hoy.ventas += total; G.stats.ventas += total;
    if (!c.burbuja || c.burbuja.t > 1) decir(c, pick(FRASES.feliz));
    flotante(c.x, 400, '+' + col(total)); monedas(c.x, 470, Math.ceil(total / 600)); sonido('caja');
    c.bolsa = true; c.estado = 'sale'; c.tx = 900; reordenarFila();
}
// Decisión de fiado: true = se lo apunta; false = «pura plata».
function decidirFiado(apuntar) {
    const c = VIVO.decision; if (!c) return; VIVO.decision = null; VIVO.pausa = false;
    const { total, satisfecho } = c.cuenta;
    if (apuntar) {
        G.fiado[c.vec.id] = (G.fiado[c.vec.id] || 0) + total; G.hoy.fiadoNuevo += total; G.hoy.costoVendido = (G.hoy.costoVendido || 0) + c.cuenta.costo;
        G.rep += 0.3;   // fiar cae bien
        decir(c, '¡Dios se lo pague!'); flotante(c.x, 400, 'Fiado ' + col(total), '#f39c12');
        c.bolsa = true; c.estado = 'sale'; c.tx = 900; reordenarFila(); sonido('ding');
    } else if (rnd() < 0.6) { decir(c, 'Diay… está bien, ahí le pago'); cobrarCliente(c, total, satisfecho); }
    else {
        // devuelve lo que iba a llevar al estante
        (c.cuenta.sacados || []).forEach(([id, q, cu]) => { if (q > 0) agregarStock(id, q, cu / q); });
        opinion(0); decir(c, 'Qué mala onda… mejor me voy'); c.estado = 'sale'; c.tx = 900; reordenarFila(); sonido('no');
    }
}

function inspeccion(c) {
    if (G.limpieza < 55) { const m = 15000; G.dinero -= m; G.hoy.multas += m; G.rep -= 4; decir(c, 'Esto está muy sucio: multa de ' + col(m)); flotante(c.x, 380, '−' + col(m) + ' multa', '#e74c3c'); sonido('no'); }
    else if (G.limpieza >= 80) { G.rep += 2; decir(c, 'Todo en orden. ¡Felicidades!'); flotante(c.x, 380, '+2 ⭐ limpieza', '#f1c40f'); }
    else decir(c, 'Está aceptable… mejore la limpieza.');
    c.estado = 'sale'; c.tx = 900; reordenarFila();
}

// ---------- reloj del día ----------
function tick(dtMin) {
    if (G.fase !== 'dia' || VIVO.pausa) return;
    const antes = G.min; G.min = Math.min(DIA_FIN, G.min + dtMin);
    const h = G.min / 60;
    // llegadas
    if (G.min < DIA_FIN - 10) {
        VIVO.llegadas += tasaLlegada(h) * dtMin;
        while (VIVO.llegadas >= 1) {
            VIVO.llegadas -= 1;
            if (enFila().length + VIVO.clientes.filter(c => c.estado === 'entra').length >= filaMax()) { G.hoy.perdidos++; G.stats.perdidos++; continue; }
            crearCliente(null); sonido('puerta');
        }
        // especiales a su hora
        G.eventos.forEach(e => {
            if ((e.id === 'inspector' || e.id === 'chismosa') && !e.hecho && h >= e.h) { e.hecho = true; crearCliente(e.id); }
            if (!G.hoy.eventosVistos.includes(e.id) && EV[e.id] && (h >= (e.h || 6) || ['lluvia', 'calor', 'turno', 'camion'].includes(e.id))) { G.hoy.eventosVistos.push(e.id); avisoEvento(e); }
        });
    }
    // paciencia
    enFila().forEach((c, i) => {
        if (c.estado !== 'fila') return;
        c.paciencia -= dtMin * (1 + i * 0.12);
        if (c.paciencia <= 0) {
            G.hoy.perdidos++; G.stats.perdidos++; opinion(0);
            if (c.especial === 'chismosa') { G.rep -= 5; flotante(c.x, 380, 'Doña Chusa se fue brava… −5 ⭐', '#e74c3c'); }
            decir(c, pick(FRASES.seVa)); c.estado = 'sale'; c.tx = 900; sonido('no');
        }
    });
    reordenarFila();
    // ayudante
    if (G.ayudante) { VIVO.ayuTimer -= dtMin; if (VIVO.ayuTimer <= 0 && atender(true)) VIVO.ayuTimer = 2.4; else if (VIVO.ayuTimer <= 0) VIVO.ayuTimer = 0.3; }
    // pedidos urgentes que llegan
    VIVO.urgentes = VIVO.urgentes.filter(u => { if (G.min >= u.llega) { agregarStock(u.id, u.q, u.c); flotante(600, 300, 'Llegó el pedido: ' + PROD[u.id].e + ' ×' + u.q, '#3498db'); sonido('ding'); return false; } return true; });
    // apagón
    if (apagonAhora() && !G._apagonAviso) { G._apagonAviso = true; }
    G.rep = clamp(G.rep, 0, 100);
    if (G.min >= DIA_FIN && antes < DIA_FIN) cerrarCuandoSalgan();
}
function avisoEvento(e) { const ev = EV[e.id]; if (ev && typeof UIaviso === 'function') UIaviso(ev.e + ' ' + ev.n, ev.d); }
let cerrando = false;
function cerrarCuandoSalgan() { cerrando = true; }

// ---------- pedido urgente (en el día, 30 % más caro, llega en una hora) ----------
function pedidoUrgente(id) {
    const p = PROD[id]; if (!disponible(id)) return 'Esto necesita una mejora.';
    if (hayEvento('camion') && ['gaseosa', 'birra'].includes(id)) return 'El camión de bebidas no vino hoy.';
    const costo = Math.round(p.pack * p.costo * 1.3);
    if (G.dinero < costo) return 'No alcanza la plata.';
    if (cantidad(id) + p.pack > capacidad() + p.pack) return 'Ya no cabe más en el estante.';
    G.dinero -= costo; G.hoy.gastos.urgentes = (G.hoy.gastos.urgentes || 0) + costo;
    VIVO.urgentes.push({ id, q: p.pack, c: Math.round(p.costo * 1.3), llega: G.min + 60 });
    return '';
}
// ---------- pedido de la mañana ----------
function pedir(id, packs) {
    const p = PROD[id]; if (!disponible(id)) return 'Necesita: ' + MEJ[p.req].n;
    if (hayEvento('camion') && ['gaseosa', 'birra'].includes(id)) return 'El camión de bebidas no vino hoy.';
    const costo = p.pack * p.costo * packs;
    if (packs > 0 && G.dinero < costo) return 'No alcanza la plata.';
    if (packs > 0 && cantidad(id) + p.pack * packs > capacidad() + p.pack) return 'Ya no cabe en el estante (máx. ' + capacidad() + ').';
    if (packs > 0) { G.dinero -= costo; G.hoy.gastos.compras = (G.hoy.gastos.compras || 0) + costo; agregarStock(id, p.pack * packs); }
    return '';
}
function comprarMejora(id) {
    const m = MEJ[id]; if (!m || G.mejoras[id]) return 'Ya la tiene.';
    if (G.dinero < m.costo) return 'No alcanza la plata.';
    G.dinero -= m.costo; G.mejoras[id] = true; G.hoy.gastos.mejoras = (G.hoy.gastos.mejoras || 0) + m.costo;
    if (id === 'fachada') G.rep = clamp(G.rep + 6, 0, 100);
    if (MEJORAS.every(x => G.mejoras[x.id])) logro('todas');
    return '';
}

function abrirDia() {
    G.fase = 'dia'; G.min = DIA_INI; VIVO.clientes = []; VIVO.fx = []; VIVO.textos = []; VIVO.llegadas = 0.6; VIVO.urgentes = []; VIVO.pausa = false; VIVO.decision = null; cerrando = false; G._apagonAviso = false;
}
// ¿Ya se fueron todos? (después de las 8 p. m. se termina de atender a la fila)
function diaTerminado() { return G.fase === 'dia' && G.min >= DIA_FIN && VIVO.clientes.length === 0; }

// ---------- cierre del día: gastos, mermas, robos y reputación ----------
function cerrarDia() {
    const H = G.hoy, B = BARRIOS[G.barrio];
    // costo de lo vendido: la ganancia bruta es ventas − costo; el costo ya salió del inventario, se calcula aparte
    const luz = 1500 + MEJORAS.reduce((a, m) => a + (G.mejoras[m.id] && m.luz ? m.luz : 0), 0) + (B.luzExtra || 0);
    H.gastos.luz = luz; G.dinero -= luz;
    if (G.ayudante) { H.gastos.ayudante = SALARIO_AYUDANTE; G.dinero -= SALARIO_AYUDANTE; }
    if (G.dia % 7 === 0) { H.gastos.patente = 7000; G.dinero -= 7000; }
    // mermas: lo que pasó de su vida útil
    PRODUCTOS.forEach(p => {
        const vida = vidaDe(p); if (!vida) return;
        (G.stock[p.id] || []).forEach(l => { if (G.dia - l.dia + 1 >= vida && l.q > 0) { H.merma += l.q * l.c; H.mermaItems = (H.mermaItems || 0) + l.q; l.q = 0; } });
        G.stock[p.id] = (G.stock[p.id] || []).filter(l => l.q > 0);
    });
    // apagón sin planta: se daña parte de lo frío
    if (hayEvento('apagon')) {
        if (G.mejoras.planta) logro('apagon');
        else ['leche', 'natilla', 'helado'].forEach(id => (G.stock[id] || []).forEach(l => { const d = Math.ceil(l.q * (id === 'helado' ? 0.6 : 0.4)); if (d > 0 && (id !== 'helado' || G.mejoras.congelador)) { H.merma += d * l.c; l.q -= d; } }));
    }
    // robo
    if (hayEvento('ladron') && !G.mejoras.rejas) { const r = Math.round(Math.min(Math.max(0, G.dinero) * 0.12, 25000)); G.dinero -= r; H.robo = r; G.rep -= 1; }
    // limpieza
    G.limpieza = clamp(G.limpieza - H.clientes * 0.32 + (G.ayudante ? 14 : 0), 0, 100);
    // la competencia llega el día 10
    if (G.dia === 10 && !G.compet) { G.compet = true; H.compet = true; }
    G.rep = clamp(G.rep, 0, 100);
    G.hist.push({ dia: G.dia, ventas: Math.round(H.ventas), ganancia: gananciaHoy(), clientes: H.clientes, rep: Math.round(G.rep), patrimonio: patrimonio() });
    if (G.hist.length > 120) G.hist.shift();
    logro('primera');
    if (H.clientes >= 100) logro('cien');
    if (patrimonio() >= 500000) logro('rico');
    if (patrimonio() >= 1000000) logro('millon');
    if (G.rep >= 90) logro('querido');
    if (G.dia === 7 && !Object.values(G.fiado).some(v => v > 0)) logro('cero');
    if (G.dia >= TEMPORADA) logro('temporada');
    G.fase = 'noche'; G.cobradoHoy = {};
    G.actualizado = Date.now();
}
// Ganancia del día: lo cobrado (ventas, comisiones y fiado recuperado) menos lo que costó lo vendido, mermas y gastos.
function gananciaHoy(H = G.hoy) {
    const g = H.gastos;
    return Math.round(H.ventas + H.comisiones + H.cobrado + H.pinto * 0 - (H.costoVendido || 0) - H.merma - (g.luz || 0) - (g.ayudante || 0) - (g.patente || 0) - (g.urgentesExtra || 0) - H.multas - H.robo);
}

// ---------- noche: cobrar el fiado y limpiar ----------
function cobrar(vid) {
    const deuda = G.fiado[vid] || 0; if (!deuda || G.cobradoHoy[vid]) return null;
    const v = VECINOS.find(x => x.id === vid); G.cobradoHoy[vid] = true;
    const h = G.histFiado[vid] = G.histFiado[vid] || { pagos: 0, fallas: 0 };
    let p = v.conf * (esQuincena() ? 1.5 : 1) * (G.cobradoAyer[vid] ? 0.85 : 1);
    if (G.cobradoAyer[vid]) G.rep -= 0.5;   // cobrar todos los días cae mal
    if (rnd() < clamp(p, 0.03, 0.96)) {
        const pago = rnd() < 0.75 ? deuda : Math.ceil(deuda / 2 / 50) * 50;
        G.fiado[vid] -= pago; G.dinero += pago; G.hoy.cobrado += pago; G.stats.fiadoCobrado += pago; h.pagos++;
        if (G.fiado[vid] <= 0) delete G.fiado[vid];
        if (G.stats.fiadoCobrado >= 50000) logro('cobrador');
        return { ok: true, pago, frase: pick(FRASES.paga) };
    }
    h.fallas++;
    return { ok: false, frase: pick(FRASES.excusa) };
}
function limpiar() { if (G.limpieza >= 99) return 'Ya está rechinando de limpio.'; if (G.dinero < 1500) return 'No alcanza para los productos de limpieza.'; G.dinero -= 1500; G.limpieza = 100; return ''; }

// Pasar al día siguiente. Devuelve 'semana' / 'temporada' cuando toca guardar récord, o ''.
function dormir() {
    let hito = '';
    if (G.dia === SEMANA && !G.records.semana) { hito = 'semana'; G.pendiente = { modo: 'semana', puntaje: patrimonio(), dias: SEMANA }; G.records.semana = true; }
    if (G.dia === TEMPORADA && !G.records.temporada) { hito = 'temporada'; G.pendiente = { modo: 'temporada', puntaje: patrimonio(), dias: TEMPORADA }; G.records.temporada = true; }
    // vecinos con deuda vieja y poca confianza a veces se van del barrio
    Object.keys(G.fiado).forEach(vid => {
        const v = VECINOS.find(x => x.id === vid); const hf = G.histFiado[vid] || { fallas: 0 };
        if (v && v.conf < 0.5 && hf.fallas >= 3 && rnd() < 0.25) { G.stats.fiadoPerdido += G.fiado[vid]; G.hoy.seFue = (G.hoy.seFue || []).concat([[v.n, G.fiado[vid]]]); delete G.fiado[vid]; }
    });
    G.cobradoAyer = G.cobradoHoy || {};
    G.dia++; G.fase = 'manana'; G.min = DIA_INI;
    G.eventos = sortearEventos(G.dia);
    G.ultimoResumen = G.hoy; nuevoDiaContadores();
    G.actualizado = Date.now();
    return hito;
}

function logro(id) { if (G.logros[id]) return; G.logros[id] = Date.now(); const l = LOGROS.find(x => x.id === id); if (l && typeof UIlogro === 'function') UIlogro(l); }

// ---------- sonidos (sintetizados, sin archivos) ----------
let AC = null, MUDO = false;
try { MUDO = localStorage.getItem('pulpe.mudo') === '1'; } catch (_e) { /* ok */ }
function sonido(t) {
    if (MUDO) return;
    try {
        AC = AC || new (window.AudioContext || window.webkitAudioContext)();
        const now = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(); o.connect(g); g.connect(AC.destination);
        const env = (f, d, v = 0.08, type = 'sine') => { o.type = type; o.frequency.setValueAtTime(f, now); g.gain.setValueAtTime(v, now); g.gain.exponentialRampToValueAtTime(0.001, now + d); o.start(now); o.stop(now + d); };
        if (t === 'caja') { env(1320, 0.18, 0.06, 'triangle'); o.frequency.setValueAtTime(1760, now + 0.07); }
        else if (t === 'puerta') { env(880, 0.35, 0.04, 'sine'); o.frequency.setValueAtTime(660, now + 0.12); }
        else if (t === 'ding') env(1046, 0.3, 0.05, 'sine');
        else if (t === 'no') { env(220, 0.25, 0.05, 'square'); o.frequency.linearRampToValueAtTime(150, now + 0.25); }
        else if (t === 'logro') { env(784, 0.5, 0.06, 'triangle'); o.frequency.setValueAtTime(1046, now + 0.12); o.frequency.setValueAtTime(1318, now + 0.24); }
    } catch (_e) { /* sin audio */ }
}
