/* =====================================================================================
   Rinde — encuentre fugas de dinero en su empresa y recupérelo.
   Todo el diagnóstico se calcula AQUÍ con fórmulas fijas (rangos de referencia × respuestas);
   la IA (función rinde-plan) solo redacta planes, preguntas y mensajes. Así cada cifra se puede explicar.
   ===================================================================================== */
(function () {
'use strict';

// >>> EDITE AQUÍ: quién está detrás de la app (si "nombre" queda vacío, la sección no se muestra) <<<
const CFG = {
    fundador: { nombre: '', rol: '', texto: '', contacto: '' },
    garantia: 'Si en los primeros 7 días siente que no le sirvió, le devolvemos su dinero. Solo escríbanos.',
    contacto: 'WhatsApp +506 8777-2993 · bonillapretiz@gmail.com',   // correo o WhatsApp de soporte (se muestra en el pie, en precios y en «Mi cuenta»)
    whatsapp: '50687772993'
};

// ---------- Monedas (tipos de cambio APROXIMADOS por US$; solo sirven para armar los rangos de ventas) ----------
const MONEDAS = {
    CRC: { s: '₡', usd: 510, dots: true, nombre: 'Colones (₡)' },
    USD: { s: 'US$', usd: 1, dots: false, nombre: 'Dólares (US$)' },
    MXN: { s: 'MX$', usd: 19, dots: false, nombre: 'Pesos mexicanos' },
    COP: { s: 'COL$', usd: 4000, dots: true, nombre: 'Pesos colombianos' },
    GTQ: { s: 'Q', usd: 7.7, dots: false, nombre: 'Quetzales' },
    HNL: { s: 'L', usd: 26, dots: false, nombre: 'Lempiras' },
    NIO: { s: 'C$', usd: 36.8, dots: false, nombre: 'Córdobas' },
    PEN: { s: 'S/', usd: 3.6, dots: false, nombre: 'Soles' },
    CLP: { s: 'CLP$', usd: 950, dots: true, nombre: 'Pesos chilenos' },
    ARS: { s: 'AR$', usd: 1300, dots: true, nombre: 'Pesos argentinos' },
    DOP: { s: 'RD$', usd: 62, dots: false, nombre: 'Pesos dominicanos' },
    EUR: { s: '€', usd: 0.88, dots: true, nombre: 'Euros' },
    BOB: { s: 'Bs', usd: 6.9, dots: true, nombre: 'Bolivianos' },
    PYG: { s: '₲', usd: 7500, dots: true, nombre: 'Guaraníes' },
    UYU: { s: '$U', usd: 40, dots: true, nombre: 'Pesos uruguayos' }
};
const PAIS_MONEDA = { CR: 'CRC', MX: 'MXN', CO: 'COP', GT: 'GTQ', HN: 'HNL', NI: 'NIO', PE: 'PEN', CL: 'CLP', AR: 'ARS', DO: 'DOP', ES: 'EUR',
    BO: 'BOB', PY: 'PYG', UY: 'UYU', US: 'USD', PA: 'USD', EC: 'USD', SV: 'USD', PR: 'USD', VE: 'USD' };
// País del visitante: el que detecta el servidor (rinde-config); mientras llega, se adivina por la zona horaria del equipo.
const ZONA_PAIS = { Costa_Rica: 'CR', Mexico_City: 'MX', Monterrey: 'MX', Merida: 'MX', Cancun: 'MX', Tijuana: 'MX', Chihuahua: 'MX', Hermosillo: 'MX', Mazatlan: 'MX',
    Bogota: 'CO', Guatemala: 'GT', Tegucigalpa: 'HN', Managua: 'NI', Lima: 'PE', Santiago: 'CL', Buenos_Aires: 'AR', Cordoba: 'AR', Santo_Domingo: 'DO', Madrid: 'ES',
    Panama: 'PA', Guayaquil: 'EC', El_Salvador: 'SV', La_Paz: 'BO', Asuncion: 'PY', Montevideo: 'UY', Caracas: 'VE', Puerto_Rico: 'PR' };
function paisVisitante() {
    if (CONF && CONF.country) return CONF.country;
    try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; return ZONA_PAIS[z.split('/').pop()] || null; } catch (_e) { return null; }
}
// Moneda para mostrar a quien no ha llenado su perfil: la de su país; si su país no está en la lista, dólares.
const monedaVisitante = () => PAIS_MONEDA[paisVisitante() || ''] || 'USD';

// Ventas mensuales en US$: [desde, hasta, valor que se usa para calcular]
const VENTAS = [[0, 3000, 1800], [3000, 10000, 6000], [10000, 30000, 18000], [30000, 100000, 55000], [100000, 300000, 170000], [300000, 1000000, 550000], [1000000, null, 1500000]];

const NEGOCIOS = [
    { id: 'comercio', t: 'Tienda o comercio', d: 'Vende productos al público o a otros negocios' },
    { id: 'restaurante', t: 'Restaurante, soda o cafetería', d: 'Comida y bebida' },
    { id: 'servicios', fin: 'Costos operativos variables', t: 'Servicios profesionales', d: 'Consultoría, agencia, despacho, oficina técnica' },
    { id: 'taller', t: 'Taller o fábrica', d: 'Produce, repara o transforma' },
    { id: 'construccion', t: 'Construcción', d: 'Obras, remodelación, mantenimiento' },
    { id: 'salud', t: 'Salud o belleza', d: 'Clínica, consultorio, farmacia, salón' },
    { id: 'educacion', t: 'Educación', d: 'Escuela, academia, cursos' },
    { id: 'transporte', t: 'Transporte o distribución', d: 'Flotilla, entregas, logística' },
    { id: 'agro', t: 'Agro o alimentos', d: 'Finca, producción, empaque' },
    { id: 'turismo', t: 'Hotel o turismo', d: 'Hospedaje, tours, eventos' },
    { id: 'otro', t: 'Otro', d: 'Lo describe usted en una línea' }
];
// Una empresa puede dedicarse a VARIAS cosas (p. ej. tienda + taller): perfil.negocios; perfil.negocio guarda la primera.
const negsDe = (p) => (p && Array.isArray(p.negocios) && p.negocios.length ? p.negocios : (p && p.negocio ? [p.negocio] : []));
const negTxt = (p) => negsDe(p).map(id => (NEGOCIOS.find(n => n.id === id) || {}).t).filter(Boolean).join(' + ');
const negObj = (p) => (negsDe(p).length ? { t: negTxt(p) } : null);
const pesoBase = (f, p) => Math.max(...(negsDe(p).length ? negsDe(p) : ['otro']).map(id => (PESOS[id] || PESOS.otro)[f.p]));
const PERSONAS = [{ id: 'p1', t: '1 a 5', k: 0.75 }, { id: 'p2', t: '6 a 20', k: 1 }, { id: 'p3', t: '21 a 50', k: 1.1 }, { id: 'p4', t: 'Más de 50', k: 1.2 }];
const SEDES = [{ id: 's1', t: 'Una', k: 0 }, { id: 's2', t: '2 o 3', k: 1 }, { id: 's3', t: '4 o más', k: 1.4 }];

// Pesos por tipo de negocio (0 = no aplica). Orden: cobros, compras, inventario, precios, fijos, personal, servicios
const PESOS = {
    comercio: [0.7, 1.2, 1.2, 1, 1, 0.8, 0.8], restaurante: [0.2, 1.2, 1.6, 1.1, 1, 1.1, 1.6], servicios: [1.5, 0.4, 0, 1.2, 1.2, 1.3, 0.5],
    taller: [1, 1.2, 1.1, 1, 0.9, 1.1, 1.5], construccion: [1.4, 1.3, 0.8, 1.1, 0.7, 1.2, 0.8], salud: [1.1, 0.9, 0.8, 0.9, 1, 1, 0.8],
    educacion: [1.3, 0.4, 0, 0.8, 1.1, 1, 0.9], transporte: [1.2, 0.9, 0.3, 1, 0.9, 1, 2], agro: [0.9, 1.1, 1.4, 1.1, 0.7, 0.9, 1.2],
    turismo: [0.5, 1, 0.8, 1.2, 1, 1.1, 1.6], otro: [1, 1, 0.8, 1, 1, 1, 1]
};
const PRUDENCIA = 0.65;   // factor global conservador: preferimos quedarnos cortos a exagerar

const IC = {
    cobros: '<path d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.6c0 4.8 10 2.6 10 7.6 0 2-2.2 3.3-5 3.3s-5-1.2-5-3.2"/>',
    compras: '<path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 8H6"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
    inventario: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    precios: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    fijos: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    personal: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.4 3.5 5.2"/>',
    servicios: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    sedes: '<path d="M3 21V9l6-4v16M9 21V3l12 6v12M3 21h18M13 11h4M13 15h4"/>'
};

// Frentes: base = % de las ventas mensuales que suele perderse [mín, máx]; p = índice en PESOS
const FRENTES = [
    { id: 'cobros', fin: 'Cuentas por cobrar y días de cobro', t: 'Cobros', f: 'Dinero que ya es suyo y no ha entrado', base: [0.6, 2], p: 0,
      q: [['¿Les vende a crédito (le pagan después)?', [['Casi todo a crédito', 1.5], ['Una parte', 1], ['Casi todo de contado', 0.2]]],
          ['¿Cuánto tardan sus clientes en pagarle?', [['Menos de 30 días', 0.5], ['De 30 a 60 días', 1], ['Más de 60 días', 1.6], ['No lo sé bien', 1.3], ['No aplica: me pagan de contado', 0, 4]]],
          ['¿Revisa cada semana quién le debe?', [['Sí, con una lista', 0.5], ['De vez en cuando', 1], ['No', 1.3], ['No aplica: casi nadie me debe', 0, 4]]]] },
    { id: 'compras', fin: 'Costo de ventas y negociación con proveedores', t: 'Compras y proveedores', f: 'Pagar más de lo necesario por lo que compra', base: [1, 3], p: 1,
      q: [['¿Pide cotizaciones a más de un proveedor?', [['Siempre', 0.5], ['A veces', 1], ['Casi nunca', 1.4], ['Solo en las compras grandes', 0.7, 0.5]]],
          ['¿Cuándo negoció precios con sus proveedores principales?', [['Este año', 0.5], ['Hace 1 o 2 años', 1.1], ['Nunca o no recuerdo', 1.4], ['Con algunos, este año', 0.8, 0.5]]],
          ['¿Quién decide las compras?', [['Yo reviso todo', 0.5], ['Una persona encargada', 1], ['Varias personas, sin control', 1.4], ['Una persona encargada, y yo reviso', 0.6, 0.5]]]] },
    { id: 'inventario', fin: 'Merma y rotación de inventario', t: 'Inventario', f: 'Producto que se daña, se vence, se pierde o no se mueve', base: [1, 2.5], p: 2,
      q: [['¿Cada cuánto cuenta su inventario?', [['Cada mes o más seguido', 0.5], ['Cada pocos meses', 1], ['Una vez al año o nunca', 1.5], ['Un sistema lo lleva al día', 0.5, -0.5]]],
          ['¿Se le dañan, vencen o desaparecen productos?', [['Casi nunca', 0.5], ['A veces', 1], ['Seguido', 1.6]]],
          ['¿Tiene productos guardados que casi no se venden?', [['No', 0.5], ['Algunos', 1], ['Bastantes', 1.4]]]] },
    { id: 'precios', fin: 'Margen bruto y política de precios', t: 'Precios y ganancia', f: 'Vender barato sin saberlo, o regalar descuentos', base: [1, 3], p: 3,
      q: [['¿Cuándo subió sus precios por última vez?', [['Este año', 0.5], ['El año pasado', 1], ['Hace más de 2 años', 1.5], ['Los revisé y decidí no subirlos', 0.7, 0.5]]],
          ['¿Sabe cuánto gana realmente en cada producto o servicio?', [['Sí, en todos', 0.5], ['En los principales', 1], ['No con exactitud', 1.4]]],
          ['¿Cómo maneja los descuentos?', [['Casi no doy', 0.5], ['Con reglas claras', 0.5], ['Seguido, según el cliente', 1.4]]]] },
    { id: 'fijos', fin: 'Gastos operativos fijos', t: 'Gastos fijos', f: 'Pagos de cada mes que nadie ha revisado', base: [0.5, 1.5], p: 4,
      q: [['¿Revisó este año lo que paga cada mes (alquiler, seguros, teléfonos, programas)?', [['Sí', 0.5], ['Una parte', 1], ['No', 1.4]]],
          ['¿Paga servicios o programas que casi no usa?', [['No', 0.5], ['Tal vez alguno', 1], ['Seguro que sí', 1.5]]],
          ['¿Cuántos cobros automáticos tiene en tarjetas o cuentas?', [['Pocos y los conozco', 0.5], ['Varios', 1], ['No sé exactamente', 1.4], ['Varios, y los reviso cada mes', 0.5, 0.5]]]] },
    { id: 'personal', fin: 'Costo laboral y productividad', t: 'Tiempo y personal', f: 'Horas extra, tareas repetidas y gente que se va', base: [1, 2.5], p: 5,
      q: [['¿Se pagan horas extra con frecuencia?', [['Casi nunca', 0.5], ['A veces', 1], ['Todas las semanas', 1.4], ['No aplica: no tengo empleados', 0, 4]]],
          ['¿Hay tareas que se hacen dos veces o a mano y podrían simplificarse?', [['Pocas', 0.5], ['Algunas', 1], ['Muchas', 1.4]]],
          ['¿Cuántas personas se fueron el último año?', [['Casi nadie', 0.5], ['Algunas', 1], ['Mucha gente', 1.5], ['No aplica: no tengo empleados', 0, 4]]]] },
    { id: 'servicios', t: 'Electricidad, agua y combustible', f: 'Consumo que se escapa sin que nadie lo mire', base: [0.3, 1], p: 6,
      q: [['¿Compara su factura de electricidad o combustible con meses anteriores?', [['Sí, cada mes', 0.5], ['A veces', 1], ['Nunca', 1.3]]],
          ['¿Quedan equipos encendidos fuera de horario, o vehículos con rutas sin planear?', [['No', 0.5], ['Algunos', 1], ['Sí, bastante', 1.5], ['No aplica: no tengo equipos ni vehículos', 0, 4]]],
          ['¿Los equipos (aires, refrigeración, vehículos) tienen mantenimiento al día?', [['Sí', 0.5], ['Más o menos', 1], ['No', 1.3], ['No aplica: no tengo equipos ni vehículos', 0, 4]]]] },
    { id: 'sedes', fin: 'Rentabilidad por sede o unidad de negocio', t: 'Diferencias entre sedes', f: 'Una sede que gasta más o vende menos que otra', base: [1, 2.5], p: -1,
      q: [['¿Compara los números de una sede con otra?', [['Sí, cada mes', 0.5], ['A veces', 1], ['Nunca', 1.4]]],
          ['¿Cada sede compra por su cuenta?', [['No, compramos juntos', 0.5], ['En parte', 1], ['Sí, cada una aparte', 1.4]]],
          ['¿Sospecha que alguna sede rinde menos?', [['No', 0.5], ['Tal vez', 1], ['Sí', 1.5]]]] }
];
const FR = Object.fromEntries(FRENTES.map(f => [f.id, f]));

// ---------- Estado ----------
// Una cuenta puede tener VARIAS empresas. E = { v: 2, activa, empresas: { id: S }, actualizado }; S = la empresa abierta
// (mismo formato v1 de siempre: perfil, frentes, acciones). Lo guardado antes como un solo proyecto (v1) se convierte solo.
const KEY = 'rinde.v1', KEY2 = 'rinde.v2';
const nuevo = () => ({ v: 1, perfil: null, fr: {}, acciones: [], creado: Date.now(), actualizado: Date.now() });
const nuevoId = () => 'e' + Math.random().toString(36).slice(2, 10);
// Convierte lo que venga (v1 = un proyecto, v2 = varias empresas) al formato de varias empresas.
function normalizar(d) {
    if (d && d.v === 2 && d.empresas && typeof d.empresas === 'object') {
        const empresas = {};
        Object.entries(d.empresas).forEach(([id, x]) => { if (x && x.v === 1) empresas[id] = Object.assign(nuevo(), x); });
        const ids = Object.keys(empresas);
        if (ids.length) return { v: 2, activa: empresas[d.activa] ? d.activa : ids[0], empresas, actualizado: d.actualizado || 0 };
    }
    if (d && d.v === 1) { const id = nuevoId(); return { v: 2, activa: id, empresas: { [id]: Object.assign(nuevo(), d) }, actualizado: d.actualizado || 0 }; }
    return null;
}
function cargarTodo() {
    try { const e = normalizar(JSON.parse(localStorage.getItem(KEY2))); if (e) return e; } catch (_e) {}
    try { const e = normalizar(JSON.parse(localStorage.getItem(KEY))); if (e) return e; } catch (_e) {}
    const id = nuevoId(); return { v: 2, activa: id, empresas: { [id]: nuevo() }, actualizado: 0 };
}
let E = cargarTodo();
let S = E.empresas[E.activa];
let UI = { vista: S.perfil ? 'app' : 'inicio', tab: 'panel', paso: 1, borrador: null, mes: null };
let USER = null, ACCESO = { active: false, freeFrente: null }, CONF = null, guardarT = null, pendiente = null;

const hayDatos = () => Object.values(E.empresas).some(x => x.perfil);
function guardar(sync = true) {
    S.actualizado = Date.now(); E.empresas[E.activa] = S; E.actualizado = S.actualizado;
    try { localStorage.setItem(KEY2, JSON.stringify(E)); } catch (_e) {}
    if (sync && USER) { clearTimeout(guardarT); guardarT = setTimeout(subir, 1200); }
}
// Nombre que se muestra de una empresa: el que escribió, o su tipo de negocio y detalle.
function nombreEmp(x) {
    if (!x || !x.perfil) return 'Empresa nueva';
    if (x.perfil.nombre) return x.perfil.nombre;
    const n = negObj(x.perfil);
    return (n ? n.t : 'Mi empresa') + (x.perfil.detalle ? ' · ' + x.perfil.detalle : '');
}
// Las empresas que se empezaron a agregar pero nunca se llenaron se descartan (menos la que está abierta).
function limpiarVacias() { Object.keys(E.empresas).forEach(id => { if (id !== E.activa && !E.empresas[id].perfil) delete E.empresas[id]; }); }
function abrirEmpresa(id) {
    if (!E.empresas[id]) return;
    guardar(false); E.activa = id; S = E.empresas[id]; limpiarVacias(); UI.tab = 'panel'; UI.mes = null;
    guardar();
    if (S.perfil) { UI.vista = 'app'; render(); window.scrollTo(0, 0); } else empezarOnb();
}
function empezarOnb() {
    const pa = monedaVisitante();
    UI.borrador = Object.assign({ nombre: '', personas: null, sedes: 's1', ventas: null, moneda: pa, exacta: 0, detalle: '' }, S.perfil || {}, { negocios: negsDe(S.perfil).slice() });
    UI.paso = 1; UI.vista = 'onb'; cerrar(); render(); window.scrollTo(0, 0);
}
const fr = (id) => { const st = (S.fr[id] = S.fr[id] || { r: {}, oculto: false, plan: null, extra: {} }); st.libre = st.libre || {}; return st; };
// Texto de una respuesta: la opción elegida, o lo que el dueño escribió («Otra respuesta…»).
// Opciones en el orden en que se muestran: el 3er dato de una opción es su posición en pantalla (si no hay, su índice).
// Las opciones nuevas se agregan AL FINAL de la lista (las respuestas guardadas son índices) y se ubican con ese dato.
const opsDe = (qq) => qq[1].map((o, k) => ({ o, k })).sort((a, b) => (a.o[2] != null ? a.o[2] : a.k) - (b.o[2] != null ? b.o[2] : b.k));
const respTexto = (f, st, i) => (st.r[i] === 'x' ? '«' + ((st.libre[i] || {}).texto || '') + '»' : (f.q[i][1][st.r[i]] || [''])[0]);

// Clave del dueño (?k=…): muestra el plan oculto de prueba (US$1). Se recuerda en este navegador; ?k=salir la borra.
const CLAVE = (() => { try { const q = new URLSearchParams(location.search).get('k'); if (q === 'salir') { localStorage.removeItem('rinde.k'); return ''; } if (q) localStorage.setItem('rinde.k', q); return localStorage.getItem('rinde.k') || ''; } catch (_e) { return ''; } })();
const conClave = (u) => CLAVE ? u + (u.includes('?') ? '&' : '?') + 'k=' + encodeURIComponent(CLAVE) : u;

// ---------- Utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[id] || ''}</svg>`;
const uid = () => Math.random().toString(36).slice(2, 10);
const anonId = (() => { try { let a = localStorage.getItem('rinde.anon'); if (!a) { a = 'a' + uid() + uid(); localStorage.setItem('rinde.anon', a); } return a; } catch (_e) { return null; } })();
// Eventos de uso. Si hay sesión, se mandan con el token: el servidor los guarda con el usuario y su correo, y el
// anon_id (el mismo antes y después de entrar) permite ver también lo que hizo antes de crear la cuenta.
function track(ev, meta) {
    (async () => {
        try {
            const h = { 'Content-Type': 'application/json' };
            const t = USER ? await token().catch(() => null) : null;
            if (t) h.Authorization = 'Bearer ' + t;
            fetch('/.netlify/functions/track-event', { method: 'POST', headers: h, keepalive: true,
                body: JSON.stringify({ event: 'rinde_' + ev, anonId, app: 'rinde', displayName: USER ? USER.email : null, metadata: meta || {} }) }).catch(() => {});
        } catch (_e) {}
    })();
}
function mon() { return MONEDAS[(S.perfil && S.perfil.moneda) || 'CRC'] || MONEDAS.CRC; }
function sep(n, dots) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, dots ? '.' : ','); }
function dinero(n, m = mon()) { return m.s + sep(n, m.dots); }
function corto(n, m = mon()) {
    const a = Math.abs(n);
    const dec = (x) => { const r = Math.round(x * 10) / 10; return (r % 1 === 0 ? String(r) : String(r).replace('.', m.dots ? ',' : '.')); };
    if (a >= 1e6) { const t = dec(n / 1e6); return m.s + t + (t === '1' ? ' millón' : ' millones'); }
    if (a >= 1e4) return m.s + sep(Math.round(n / 1000), m.dots) + ' mil';
    return dinero(redondo(n), m);
}
function redondo(n) { const a = Math.abs(n); const st = a >= 1e5 ? 1000 : a >= 1e4 ? 500 : a >= 1000 ? 50 : 10; return Math.round(n / st) * st; }
const rango = (a, b, m) => `${corto(a, m)} – ${corto(b, m)}`;
const rangoF = (a, b, m) => (b < 1 ? dinero(0, m) : rango(a, b, m));   // fugas: «₡0» mientras no se haya encontrado nada
const pts = (n) => (Math.round(n * 10) / 10).toLocaleString('es');
const rangoPts = (a, b) => `${pts(a)} – ${pts(b)}`;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 3200); }
const isoLocal = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const hoyISO = () => isoLocal(new Date());
const masDias = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return isoLocal(x); };
const fechaBonita = (iso) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (_e) { return iso; } };

// ---------- Motor de cálculo ----------
function ventasMes(p = S.perfil) {
    if (!p) return 0;
    const m = MONEDAS[p.moneda] || MONEDAS.CRC;
    if (p === S.perfil && S.cifras && S.cifras.ventas > 0) return S.cifras.ventas / 12;   // cifras reales (pestaña Finanzas)
    if (p.exacta > 0) return p.exacta;
    const v = VENTAS[p.ventas] || VENTAS[2];
    return v[2] * m.usd;
}
function aplica(f, p = S.perfil) {
    if (f.id === 'sedes') return (SEDES.find(s => s.id === p.sedes) || SEDES[0]).k > 0;
    return pesoBase(f, p) > 0;
}
// DESDE CERO HACIA ARRIBA: cada frente empieza en 0. Cada pregunta respondida «destapa» su parte de la fuga:
// parte = (ventas × prudencia × peso × % de referencia) ÷ nº de preguntas, multiplicada por la gravedad de la respuesta.
// Una buena práctica (factor ≤ 0,5) no suma nada; la respuesta «normal» (factor 1) suma su parte; una mala, hasta ~2,2 veces.
// Con todas las preguntas en «normal» se llega exactamente al rango de referencia de ese frente.
const gravedad = (factor) => Math.max(0, Math.min(2.2, (factor - 0.5) / 0.5));
function pesoDe(f, p = S.perfil) {
    let peso = f.id === 'sedes' ? (SEDES.find(s => s.id === p.sedes) || SEDES[0]).k : pesoBase(f, p);
    if (f.id === 'personal') peso *= (PERSONAS.find(x => x.id === p.personas) || PERSONAS[1]).k;
    return peso;
}
function calc(id) {
    const f = FR[id], p = S.perfil, st = fr(id), peso = pesoDe(f, p), nq = f.q.length;
    const v = ventasMes(p) * PRUDENCIA * peso / 100;
    let min = 0, max = 0, n = 0, calculando = false;
    const partes = f.q.map((qq, i) => {
        const r = st.r[i];
        let factor = null;
        if (r === 'x') {   // respuesta escrita: la IA la ubica en la misma escala (rinde-interpretar)
            const L = st.libre[i] || {};
            n++;
            if (L.estado === 'ok' && Number.isFinite(L.factor)) factor = L.factor;
            else { if (L.estado === 'calc') calculando = true; return null; }
        } else {
            if (r == null || !qq[1][r]) return null;
            n++; factor = qq[1][r][1];
        }
        const g = gravedad(factor), a = v * f.base[0] / nq * g, b = v * f.base[1] / nq * g;
        min += a; max += b;
        return { min: a, max: b, g };
    });
    const potencial = v * (f.base[0] + f.base[1]) / 2;   // solo para ordenar las tarjetas; no se muestra
    return { id, min, max, mid: (min + max) / 2, n, total: nq, partes, potencial, peso, v, calculando,
        conf: n === 0 ? 'Sin revisar' : n < nq ? 'En revisión' : 'Revisado', cc: n === 0 ? 'sin' : n < nq ? 'en' : 'rev' };
}
function todos() {
    if (!S.perfil) return [];
    return FRENTES.filter(f => aplica(f) && !fr(f.id).oculto).map(f => calc(f.id)).sort((a, b) => b.potencial - a.potencial);
}
function totales() {
    const l = todos();
    const enc = l.reduce((a, x) => ({ min: a.min + x.min, max: a.max + x.max }), { min: 0, max: 0 });
    const resp = l.reduce((a, x) => a + x.n, 0), posibles = l.reduce((a, x) => a + x.total, 0);
    let unaVez = 0, mensual = 0;
    S.acciones.forEach(a => { if (a.hecho && a.monto > 0) { if (a.tipo === 'mes') mensual += a.monto; else unaVez += a.monto; } });
    const vm = ventasMes() || 1;
    return { l, enc, resp, posibles, calculando: l.some(x => x.calculando), revisado: posibles ? Math.round(100 * resp / posibles) : 0,
        pts: { min: enc.min / vm * 100, max: enc.max / vm * 100 }, unaVez, mensual };
}
function siguientePregunta() {
    for (const x of todos()) { const st = fr(x.id); const i = FR[x.id].q.findIndex((_, k) => st.r[k] == null); if (i >= 0) return { id: x.id, i }; }
    return null;
}
const puedeVer = (id) => ACCESO.active || (USER && (ACCESO.freeFrente === id || !ACCESO.freeFrente));

// =====================================================================================
//  Capa financiera: nivel de la empresa, EBITDA, cascada, valor para el accionista y cifras reales
// =====================================================================================
// Margen EBITDA típico por sector (% de ventas). Es una REFERENCIA para dibujar la cascada mientras la empresa no anote
// sus cifras reales (pestaña Finanzas); con cifras reales se usa su propio EBITDA.
const MARGEN_REF = { comercio: 6, restaurante: 10, servicios: 15, taller: 10, construccion: 8, salud: 14, educacion: 12, transporte: 9, agro: 10, turismo: 14, otro: 10 };
// Rangos sanos por sector para los indicadores de la pestaña Finanzas: margen bruto [mín, máx] %, DSO y DIO máximos en días.
const REF_SECTOR = {
    comercio: { mb: [25, 40], dso: 30, dio: 60 }, restaurante: { mb: [60, 70], dso: 5, dio: 10 }, servicios: { mb: [45, 70], dso: 45, dio: 0 },
    taller: { mb: [30, 45], dso: 45, dio: 50 }, construccion: { mb: [15, 30], dso: 60, dio: 30 }, salud: { mb: [40, 65], dso: 40, dio: 30 },
    educacion: { mb: [45, 70], dso: 30, dio: 0 }, transporte: { mb: [20, 35], dso: 45, dio: 15 }, agro: { mb: [20, 35], dso: 45, dio: 45 },
    turismo: { mb: [45, 65], dso: 20, dio: 10 }, otro: { mb: [25, 45], dso: 45, dio: 45 }
};
// Indicador financiero que mueve cada frente (se muestra en lenguaje gerencial).
const KPI = { cobros: 'DSO · capital de trabajo', compras: 'Costo de ventas (COGS) · margen bruto', inventario: 'DIO · rotación y merma', precios: 'Margen bruto · política de precios',
    fijos: 'OPEX fijo', personal: 'Costo laboral · productividad', servicios: 'OPEX energético y logístico', sedes: 'Rentabilidad por unidad de negocio' };
const MULTIPLO = [5, 7];   // múltiplo EBITDA ilustrativo para el valor de empresa (pymes y medianas latinoamericanas suelen negociarse en ese rango)

const ventasUSD = (p = S.perfil) => ventasMes(p) / ((MONEDAS[(p && p.moneda) || 'CRC'] || MONEDAS.CRC).usd || 1);
// pyme (hasta 20 personas y < US$30 mil/mes), mediana, grande (más de 50 personas o ≥ US$300 mil/mes). Define el lenguaje y las capas.
function nivel(p = S.perfil) {
    if (!p) return 'pyme';
    const u = ventasUSD(p);
    if (p.personas === 'p4' || u >= 300000) return 'grande';
    if (p.personas === 'p3' || u >= 30000) return 'mediana';
    return 'pyme';
}
const NIVEL_TXT = { pyme: 'Pyme', mediana: 'Mediana empresa', grande: 'Gran empresa' };
const pctTxt = (n, d = 1) => (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });

// Cifras reales (anuales, en la moneda de la empresa). Se guardan en S.cifras.
const CIFRAS = [
    ['ventas', 'Ventas netas', 'Ingresos de los últimos 12 meses, sin impuestos.'],
    ['costo', 'Costo de ventas (COGS)', 'Lo que costó lo que vendió: mercadería, materia prima, mano de obra directa.'],
    ['opex', 'Gastos operativos (OPEX)', 'Salarios administrativos, alquileres, servicios, mercadeo. Sin depreciación ni intereses.'],
    ['cxc', 'Cuentas por cobrar', 'Saldo al cierre: lo que sus clientes le deben.'],
    ['inventario', 'Inventario', 'Valor al costo al cierre.'],
    ['cxp', 'Cuentas por pagar', 'Saldo al cierre: lo que usted le debe a proveedores.'],
    ['utilidad', 'Utilidad neta', 'Después de impuestos e intereses (opcional, para el ROE).'],
    ['patrimonio', 'Patrimonio', 'Capital de los socios al cierre (opcional, para el ROE).']
];
const cif = (p = S) => (p && p.cifras) || {};
const tieneCifras = () => cif().ventas > 0;
const pl = () => { const c = cif(); return c.ventas > 0 && c.costo >= 0 && c.opex >= 0 && c.costo != null && c.opex != null; };
function refSector(p = S.perfil) {   // con varios negocios: el primero manda la referencia
    const id = (negsDe(p)[0]) || 'otro';
    return { margen: MARGEN_REF[id] != null ? MARGEN_REF[id] : 10, ...(REF_SECTOR[id] || REF_SECTOR.otro) };
}
// Indicadores calculados a partir de las cifras reales.
function indicadores() {
    const c = cif(); if (!(c.ventas > 0)) return null;
    const r = refSector(), v = c.ventas, k = {};
    if (c.costo != null) { k.mb = (v - c.costo) / v * 100; }
    if (c.costo != null && c.opex != null) { k.ebitda = v - c.costo - c.opex; k.me = k.ebitda / v * 100; }
    if (c.cxc != null) { k.dso = c.cxc / v * 365; if (k.dso > r.dso) k.atrapadoCxc = (k.dso - r.dso) * v / 365; }
    if (c.inventario != null && c.costo > 0) { k.dio = c.inventario / c.costo * 365; if (r.dio && k.dio > r.dio) k.atrapadoInv = (k.dio - r.dio) * c.costo / 365; }
    if (c.cxp != null && c.costo > 0) k.dpo = c.cxp / c.costo * 365;
    if (k.dso != null && k.dpo != null) k.ccc = k.dso + (k.dio || 0) - k.dpo;
    if (c.cxc != null || c.inventario != null || c.cxp != null) k.ctn = (c.cxc || 0) + (c.inventario || 0) - (c.cxp || 0);
    if (c.utilidad != null && c.patrimonio > 0) k.roe = c.utilidad / c.patrimonio * 100;
    k.atrapado = (k.atrapadoCxc || 0) + (k.atrapadoInv || 0);
    return k;
}
// EBITDA mensual de partida: el real si hay cifras; si no, ventas × margen de referencia del sector.
function ebitdaBase() {
    const k = indicadores();
    if (k && k.ebitda != null) return { mes: k.ebitda / 12, margen: k.me, real: true };
    const m = refSector().margen;
    return { mes: ventasMes() * m / 100, margen: m, real: false };
}
// Resumen de la capa financiera para el panel, el informe y los planes.
function finanzas() {
    const T = totales(), b = ebitdaBase(), vm = ventasMes() || 1;
    const mid = (T.enc.min + T.enc.max) / 2;
    return { T, base: b, potMin: b.mes + T.enc.min, potMax: b.mes + T.enc.max, potMid: b.mes + mid,
        margenPot: [b.margen + T.enc.min / vm * 100, b.margen + T.enc.max / vm * 100],
        valor: [T.enc.min * 12 * MULTIPLO[0], T.enc.max * 12 * MULTIPLO[1]], nivel: nivel() };
}
// Cascada horizontal: EBITDA actual + lo recuperable por frente = EBITDA potencial (valores del punto medio de cada rango).
function cascadaHTML(base, filas, fmt, etiquetas) {
    const tot = base + filas.reduce((a, f) => a + f.v, 0), max = Math.max(tot, base, 1);
    let acc = base;
    const fila = (lbl, desde, hasta, cls, val, sub) => `<div class="cas-f ${cls}"><span class="cas-l">${lbl}${sub ? `<small>${sub}</small>` : ''}</span><span class="cas-t"><i style="left:${desde / max * 100}%;width:${Math.max(0.6, (hasta - desde) / max * 100)}%"></i></span><span class="cas-v">${val}</span></div>`;
    return `<div class="cascada" role="img" aria-label="${esc(etiquetas.aria)}">
      ${fila(etiquetas.base, 0, base, 'base', fmt(base), etiquetas.baseSub)}
      ${filas.map(f => { const h = fila(f.lbl, acc, acc + f.v, 'paso', '+' + fmt(f.v), f.sub); acc += f.v; return h; }).join('')}
      ${fila(etiquetas.pot, 0, tot, 'pot', fmt(tot), etiquetas.potSub)}</div>`;
}

// =====================================================================================
//  Pantallas
// =====================================================================================
function render() {
    const app = $('#app');
    if (UI.vista === 'inicio') app.innerHTML = vInicio();
    else if (UI.vista === 'onb') app.innerHTML = vOnb();
    else app.innerHTML = vApp();
}

function cabecera(enApp) {
    return `<header class="top">
      <a class="marca" href="#" data-a="${enApp ? 'tab' : 'nada'}" data-tab="panel">${logo()}<span>Rinde</span></a>
      <div class="top-d">
        ${enApp ? `<nav class="tabs-d">${tabsHTML()}</nav>` : ''}
        ${enApp && S.perfil ? `<div class="emp-wrap"><button class="emp-btn" data-a="emp-menu" aria-haspopup="menu" aria-expanded="${UI.menu ? 'true' : 'false'}">${icon('sedes', 'mini')}<span class="emp-txt"><small>Empresa</small><span>${esc(nombreEmp(S))}</span></span><b aria-hidden="true">▾</b></button>${UI.menu ? menuEmp() : ''}</div>` : ''}
        ${USER ? `<button class="btn-q" data-a="cuenta">${ACCESO.active ? '<span class="pill ok">Plan activo</span>' : ''}<span class="mail">${esc(USER.email || 'Mi cuenta')}</span></button>`
               : `<button class="btn-q" data-a="login">Entrar</button>`}
      </div></header>`;
}
const logo = () => `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="currentColor"/><path d="M16 42c6 0 8-10 14-10s7 6 12 6 6-14 6-14" fill="none" stroke="var(--oro)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="48" cy="24" r="4" fill="var(--oro)"/></svg>`;
function tabsHTML() {
    const t = [['panel', 'Panel', '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>'], ['acciones', 'Acciones', '<path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>'], ['finanzas', 'Finanzas', '<path d="M3 21h18M5 21V10M10 21V5M15 21v-8M20 21V8"/>'], ['informe', 'Informe', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>']];
    const pend = S.acciones.filter(a => !a.hecho).length;
    return t.map(([id, n, p]) => `<button class="tab ${UI.tab === id ? 'on' : ''}" data-a="tab" data-tab="${id}"><svg class="ic" viewBox="0 0 24 24">${p}</svg><span>${n}</span>${id === 'acciones' && pend ? `<b class="badge">${pend}</b>` : ''}</button>`).join('');
}

// ---------- Inicio (página de presentación) ----------
function vInicio() {
    const F = CFG.fundador;
    // Ejemplo en la moneda del visitante (montos base en US$, convertidos con el tipo de cambio aproximado de MONEDAS).
    const mv = MONEDAS[monedaVisitante()] || MONEDAS.USD, cx = (n) => corto(n * mv.usd, mv);
    const ejemplo = [{ lbl: 'Cobros', sub: 'DSO · capital de trabajo', v: 2600 }, { lbl: 'Precios y ganancia', sub: 'Margen bruto', v: 2100 }, { lbl: 'Inventario', sub: 'DIO · rotación y merma', v: 1500 }, { lbl: 'Gastos fijos', sub: 'OPEX fijo', v: 700 }];
    return `${cabecera(false)}
    <main class="inicio">
      <section class="hero">
        <p class="eyebrow">Control de rentabilidad para empresas</p>
        <h1>¿Cuántas fugas de dinero tiene su empresa cada mes?<br><em>Rinde las encuentra y prioriza.</em></h1>
        <p class="lead">Cobros atrasados, precios sin revisar, inventario sin rotación y gasto fijo sin auditar le restan margen todos los meses. Rinde estima cuánto le cuesta cada uno, en su moneda, en puntos de margen y en EBITDA, y le dice qué atender primero.</p>
        <div class="cta-row"><button class="btn xl" data-a="empezar">Iniciar diagnóstico · 1 minuto</button><span class="nota">Sin documentos para empezar. Con sus estados financieros, indicadores reales.</span></div>
      </section>
      <section class="demo" aria-label="Ejemplo de resultado">
        <div class="demo-top"><span>Ejemplo · distribuidora con 35 colaboradores · puente de EBITDA mensual</span><strong>Margen EBITDA 6,0 % → 11,8 % <small>· valor de empresa en juego: ${rango(82800 * 5 * mv.usd, 82800 * 7 * mv.usd, mv)} (ilustrativo)</small></strong></div>
        ${cascadaHTML(7200, ejemplo, cx, { aria: 'Ejemplo de puente de EBITDA', base: 'EBITDA actual', baseSub: '6,0 % de margen', pot: 'EBITDA potencial', potSub: '11,8 % de margen' })}
      </section>
      <section class="tres">
        <div><b>1</b><h3>Perfil de la empresa</h3><p>Sector, tamaño, sedes y nivel de ventas. Rinde ajusta los frentes y el lenguaje: de pyme, gerencial o de accionistas.</p></div>
        <div><b>2</b><h3>Diagnóstico por frente</h3><p>Cada frente parte de cero y cada respuesta suma su impacto en margen y EBITDA. Con sus estados financieros, calcula DSO, DIO, ciclo de caja y margen reales.</p></div>
        <div><b>3</b><h3>Plan y seguimiento</h3><p>Planes de acción por frente, comunicaciones listas, calendario de ejecución y registro de lo recuperado. Informe en PDF para socios o junta.</p></div>
      </section>
      <section class="porque">
        <h2>Por qué confiar en las cifras</h2>
        <ul>
          <li><b>Cada número se puede explicar.</b> Toque "¿De dónde sale?" y vea el cálculo. No es una adivinanza de la inteligencia artificial.</li>
          <li><b>Nada inflado.</b> Todo empieza en cero y solo sumamos una fuga cuando sus respuestas la muestran, con rangos de referencia prudentes.</li>
          <li><b>Sus datos son suyos.</b> No pedimos nombres de clientes, cuentas bancarias ni facturas. Se guardan en su dispositivo, y en su cuenta privada si decide crear una. <a href="/privacidad/">Así cuidamos sus datos</a>.</li>
        </ul>
      </section>
      ${F.nombre ? `<section class="fundador"><h2>Quién está detrás</h2><p><b>${esc(F.nombre)}</b>${F.rol ? ' · ' + esc(F.rol) : ''}</p>${F.texto ? `<p>${esc(F.texto)}</p>` : ''}${F.contacto ? `<p class="nota">${esc(F.contacto)}</p>` : ''}</section>` : ''}
      <section class="faq">
        <h2>Preguntas frecuentes</h2>
        <details><summary>¿Cuánto cuesta?</summary><p>El diagnóstico inicial no tiene costo e incluye el plan completo de un frente, para que evalúe la herramienta con sus propios datos. Para ver los planes de todos los frentes, con seguimiento, hay planes desde US$19 por un mes. Es un pago único: no se renueva solo.</p></details>
        <details><summary>¿Qué nivel técnico usa?</summary><p>Rinde ajusta el lenguaje al tamaño de la empresa. En pymes, cada frente muestra su indicador financiero (margen bruto, DSO, rotación de inventario) con una explicación breve. En medianas y grandes habla en términos de gerencia y de accionistas: impacto en EBITDA, margen, capital de trabajo y valor de empresa.</p></details>
        <details><summary>¿Puedo usar mis cifras reales?</summary><p>Sí. En la pestaña Finanzas anota ventas, costo de ventas, gastos operativos, cuentas por cobrar, inventario y cuentas por pagar de los últimos 12 meses. Rinde calcula sus indicadores reales, los compara con su sector y estima el efectivo que hoy está atrapado en cartera e inventario.</p></details>
        <details><summary>¿Sirve para mi tipo de negocio?</summary><p>Rinde ajusta los frentes según el tipo de negocio, su tamaño y si tiene varias sedes. Lo que no aplica a su empresa, no aparece.</p></details>
        <details><summary>¿Y si el número no se parece a mi realidad?</summary><p>Cada cifra sale solo de sus respuestas: puede cambiarlas cuando quiera, ver el cálculo exacto o ocultar un frente que no le aplica.</p></details>
      </section>
      <section class="cierre"><h2>¿Cuánto margen está dejando ir su empresa?</h2><button class="btn xl" data-a="empezar">Iniciar diagnóstico</button></section>
      <footer class="pie">Rinde · ${new Date().getFullYear()}${CFG.contacto ? ' · ' + esc(CFG.contacto) : ''} · <a href="/privacidad/">Privacidad y condiciones</a></footer>
    </main>`;
}

// ---------- Onboarding (3 pasos) ----------
function vOnb() {
    const b = UI.borrador, m = MONEDAS[b.moneda] || MONEDAS.CRC;
    const prog = `<div class="prog"><i style="width:${UI.paso * 33.3}%"></i></div><p class="paso-n">Paso ${UI.paso} de 3</p>`;
    let cuerpo = '';
    if (UI.paso === 1) {
        cuerpo = `<label class="campo"><span>Nombre de su empresa <em>(opcional: sirve si maneja varias)</em></span><input id="nombreEmp" maxlength="60" value="${esc(b.nombre || '')}" placeholder="Ej.: Ferretería El Roble"></label>
        <h2>¿A qué se dedica su empresa?</h2>
        <p class="sub">Si hace varias cosas (por ejemplo, tienda y taller), elija todas.</p>
        <div class="opciones grid2">${NEGOCIOS.map(n => `<button class="opc ${b.negocios.includes(n.id) ? 'on' : ''}" data-a="onb-set" data-k="negocios" data-v="${n.id}" aria-pressed="${b.negocios.includes(n.id)}"><b>${n.t}</b><span>${n.d}</span></button>`).join('')}</div>
        ${b.negocios.length ? `<label class="campo"><span>En una línea, ¿qué vende o qué hace? <em>(opcional)</em></span><input id="detalle" maxlength="120" value="${esc(b.detalle || '')}" placeholder="Ej.: ferretería de barrio, venta al detalle y a constructores"></label>` : ''}`;
    } else if (UI.paso === 2) {
        cuerpo = `<h2>¿Cuántas personas trabajan con usted?</h2>
        <p class="sub">Contándose usted.</p>
        <div class="opciones fila">${PERSONAS.map(n => `<button class="opc chip ${b.personas === n.id ? 'on' : ''}" data-a="onb-set" data-k="personas" data-v="${n.id}">${n.t}</button>`).join('')}</div>
        <h3 class="h3s">¿Cuántos locales, sedes o edificios tiene?</h3>
        <div class="opciones fila">${SEDES.map(n => `<button class="opc chip ${b.sedes === n.id ? 'on' : ''}" data-a="onb-set" data-k="sedes" data-v="${n.id}">${n.t}</button>`).join('')}</div>`;
    } else {
        cuerpo = `<h2>¿Cuánto vende al mes, más o menos?</h2>
        <p class="sub">Un rango basta. Nadie más lo ve.</p>
        <label class="campo inline"><span>Moneda</span><select id="moneda" data-a="onb-moneda">${Object.entries(MONEDAS).map(([k, x]) => `<option value="${k}" ${k === b.moneda ? 'selected' : ''}>${x.nombre}</option>`).join('')}</select></label>
        <div class="opciones">${VENTAS.map((v, i) => `<button class="opc linea ${b.ventas === i ? 'on' : ''}" data-a="onb-set" data-k="ventas" data-v="${i}">${v[1] == null ? 'Más de ' + corto(v[0] * m.usd, m) : i === 0 ? 'Menos de ' + corto(v[1] * m.usd, m) : rango(v[0] * m.usd, v[1] * m.usd, m)}</button>`).join('')}</div>
        <details class="exacta"><summary>Prefiero escribir el número exacto</summary><label class="campo"><span>Ventas de un mes normal (${m.s})</span><input id="exacta" inputmode="numeric" value="${b.exacta ? b.exacta : ''}" placeholder="Ej.: ${sep(VENTAS[2][2] * m.usd, m.dots)}"></label></details>`;
    }
    const listo = (UI.paso === 1 && b.negocios.length) || (UI.paso === 2 && b.personas && b.sedes) || (UI.paso === 3 && (b.ventas != null || b.exacta > 0));
    return `${cabecera(false)}<main class="onb">${prog}${cuerpo}
      <div class="onb-nav">${UI.paso > 1 ? '<button class="btn ghost" data-a="onb-atras">Atrás</button>' : (S.perfil || Object.values(E.empresas).some(x => x !== S && x.perfil)) ? '<button class="btn ghost" data-a="onb-cancelar">Cancelar</button>' : '<span></span>'}
      <button class="btn" data-a="onb-sig" ${listo ? '' : 'disabled'}>${UI.paso === 3 ? 'Ver mi diagnóstico' : 'Siguiente'}</button></div></main>`;
}

// ---------- App ----------
function vApp() {
    let c = '';
    if (UI.tab === 'panel') c = vPanel();
    else if (UI.tab === 'acciones') c = vAcciones();
    else if (UI.tab === 'finanzas') c = vFinanzas();
    else c = vInforme();
    return `${cabecera(true)}<main class="app">${c}</main><nav class="tabs-m">${tabsHTML()}</nav>`;
}

function vPanel() {
    const F = finanzas(), T = F.T, sig = siguientePregunta(), max = Math.max(...T.l.map(x => x.max), 1);
    const neg = negObj(S.perfil), niv = F.nivel, ger = niv !== 'pyme', vm = ventasMes() || 1;
    const ocultos = FRENTES.filter(f => aplica(f) && fr(f.id).oculto);
    const hay = T.enc.max >= 1;
    const kpis = [
        `<div class="kpi k-main"><p class="lbl">${ger ? 'Impacto estimado en EBITDA' : 'Fugas encontradas'}</p><p class="big">${rangoF(T.enc.min, T.enc.max)}${T.calculando ? ' <span class="calc-pill">Calculando…</span>' : ''}<small> /mes</small></p>
          <p class="per">${hay ? `${rango(T.enc.min * 12, T.enc.max * 12)} al año · ${rangoPts(T.pts.min, T.pts.max)} pts de margen` : 'Responda las preguntas rápidas: cada una puede destapar una fuga.'}</p></div>`,
        `<div class="kpi"><p class="lbl">Margen EBITDA</p><p class="big">${pctTxt(F.base.margen)} %${hay ? ` <span class="flecha">→</span> ${pctTxt(F.margenPot[0])}–${pctTxt(F.margenPot[1])} %` : ''}</p>
          <p class="per">${F.base.real ? 'con sus cifras reales' : `referencia del sector · <button class="lnk" data-a="tab" data-tab="finanzas">anotar cifras reales</button>`}</p></div>`,
        niv === 'grande' ? `<div class="kpi"><p class="lbl">Valor de empresa en juego</p><p class="big">${hay ? rango(F.valor[0], F.valor[1]) : dinero(0)}</p><p class="per">fuga anual × ${MULTIPLO[0]}–${MULTIPLO[1]} veces EBITDA · ilustrativo</p></div>` : '',
        `<div class="kpi"><p class="lbl">Recuperado</p><p class="big verde">${dinero(redondo(T.unaVez))}</p><p class="per">${T.mensual ? `+ ${corto(T.mensual)} al mes en ahorros nuevos` : 'Marque acciones como hechas para verlo crecer'}</p></div>`,
        `<div class="kpi"><p class="lbl">Cobertura del diagnóstico</p><div class="meter"><i style="width:${T.revisado}%"></i></div><p class="per">${T.resp} de ${T.posibles} preguntas · ${T.revisado === 0 ? 'empiece por la pregunta rápida' : T.revisado < 100 ? 'el total puede seguir subiendo' : 'revisión completa'}</p></div>`
    ].filter(Boolean);
    const filas = T.l.filter(x => x.max >= 1).map(x => ({ lbl: esc(FR[x.id].t), sub: ger ? esc(KPI[x.id] || '') : '', v: (x.min + x.max) / 2 })).sort((a, b) => b.v - a.v);
    const puente = hay ? cascadaHTML(F.base.mes, filas, (n) => corto(n), { aria: 'Puente de EBITDA mensual', base: ger ? 'EBITDA actual' : 'Lo que le queda hoy', baseSub: `${pctTxt(F.base.margen)} % de margen${F.base.real ? '' : ' (ref.)'}`, pot: ger ? 'EBITDA potencial' : 'Lo que le podría quedar', potSub: `${pctTxt(F.margenPot[0])}–${pctTxt(F.margenPot[1])} % de margen` }) : '';
    return `
    <section class="nivel-b"><span class="pill nv">${NIVEL_TXT[niv]}</span><span>${esc(neg ? neg.t : '')}</span></section>
    <section class="kpi-strip k${kpis.length}">${kpis.join('')}</section>
    ${hay ? `<section class="card-fin"><div class="cf-h"><h3>${ger ? 'Puente de EBITDA mensual' : 'Su margen hoy y su margen posible'}</h3><p class="sub">${ger ? 'EBITDA de partida más lo recuperable en cada frente (punto medio de cada rango).' : 'Lo que le queda cada mes antes de impuestos, más lo que podría recuperar en cada frente.'}</p></div>${puente}</section>` : ''}
    ${sig ? `<section class="pdia"><div><p class="lbl">Pregunta rápida · ${esc(FR[sig.id].t)}</p><p class="pq">${esc(FR[sig.id].q[sig.i][0])}</p></div>
      <div class="opciones fila">${opsDe(FR[sig.id].q[sig.i]).map(({ o, k }) => `<button class="opc chip ${o[1] === 0 ? 'na' : ''}" data-a="resp" data-f="${sig.id}" data-i="${sig.i}" data-k="${k}">${esc(o[0])}</button>`).join('')}<button class="opc chip otra" data-a="libre" data-f="${sig.id}" data-i="${sig.i}">Otra respuesta…</button></div></section>` : ''}
    <section class="tarjetas">
      ${T.l.map((x, idx) => tarjeta(x, idx, max, ger, vm)).join('')}
    </section>
    ${ocultos.length ? `<p class="ocultos">Ocultos: ${ocultos.map(f => `<button class="lnk" data-a="mostrar" data-f="${f.id}">${esc(f.t)}</button>`).join(' · ')}</p>` : ''}
    <p class="disc">Cada frente empieza en cero y suma solo lo que muestran sus respuestas, con rangos de referencia prudentes. «Puntos de margen» = la fuga como porcentaje de las ventas. ${F.base.real ? 'El EBITDA de partida sale de sus cifras reales.' : `El EBITDA de partida usa el margen típico del sector (${pctTxt(F.base.margen, 0)} %) hasta que anote sus cifras en Finanzas.`}${niv === 'grande' ? ' El valor de empresa es ilustrativo: aplica un múltiplo típico de EBITDA a la fuga anual; no es una valoración.' : ''} Es un diagnóstico de priorización, no sustituye la contabilidad. <button class="lnk" data-a="perfil">Editar datos de la empresa</button> · <button class="lnk" data-a="empresas">Agregar otra empresa</button> · <button class="lnk" data-a="limpiar">Limpiar proyecto</button></p>`;
}

function tarjeta(x, idx, max, ger, vm) {
    const f = FR[x.id], st = fr(x.id), libre = ACCESO.active || !ACCESO.freeFrente || ACCESO.freeFrente === x.id, tienePlan = !!st.plan;
    const accs = S.acciones.filter(a => a.frente === x.id), hechas = accs.filter(a => a.hecho).length;
    const cero = x.n === 0;
    return `<article class="card ${idx === 0 ? 'top1' : ''} ${cero ? 'cero' : ''}">
      <header><span class="ci">${icon(x.id)}</span><div><h3>${esc(f.t)}</h3><p class="fin">${esc(ger ? (KPI[x.id] || f.fin) : f.fin)}</p>${ger ? '' : `<p>${esc(f.f)}</p>`}</div>
        <button class="mas" data-a="menu" data-f="${x.id}" aria-label="Opciones">⋯</button></header>
      <p class="monto">${rangoF(x.min, x.max)}<small> /mes</small>${x.calculando ? ' <span class="calc-pill">Calculando…</span>' : ''}</p>
      ${ger && x.max >= 1 ? `<p class="pts-m">${rangoPts(x.min / (vm || 1) * 100, x.max / (vm || 1) * 100)} pts de margen · ${rango(x.min * 12, x.max * 12)} al año</p>` : ''}
      <div class="bar"><i style="left:${x.min / max * 100}%;width:${x.max < 1 ? 0 : Math.max(2, (x.max - x.min) / max * 100)}%"></i></div>
      <div class="meta"><span class="conf c-${x.cc}">${x.conf}</span>${x.n > 0 && x.n < x.total ? `<button class="lnk" data-a="afinar" data-f="${x.id}">Seguir revisando (${x.total - x.n})</button>` : ''}
        ${x.n > 0 ? `<button class="lnk sut" data-a="porque" data-f="${x.id}">¿De dónde sale?</button>` : ''}</div>
      ${accs.length ? `<p class="avance">${hechas} de ${accs.length} acciones hechas</p>` : ''}
      ${cero ? `<button class="btn ghost full" data-a="afinar" data-f="${x.id}">Revisar este frente · ${x.total} preguntas</button>`
        : `<button class="btn ${libre || tienePlan ? '' : 'lock'} full" data-a="plan" data-f="${x.id}">${tienePlan ? 'Ver mi plan' : libre ? (!ACCESO.active && !ACCESO.freeFrente ? 'Ver plan de muestra' : 'Ver plan para recuperarlo') : '🔒 Ver plan para recuperarlo'}</button>`}
    </article>`;
}

function vAcciones() {
    const pend = S.acciones.filter(a => !a.hecho).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const hechas = S.acciones.filter(a => a.hecho).sort((a, b) => (b.hechoEn || '').localeCompare(a.hechoEn || ''));
    const hoy = hoyISO(), semana = masDias(7);
    const grupos = [['Atrasadas', pend.filter(a => a.fecha < hoy)], ['Esta semana', pend.filter(a => a.fecha >= hoy && a.fecha <= semana)], ['Más adelante', pend.filter(a => a.fecha > semana)]];
    if (!S.acciones.length) return `<section class="vacio"><h2>Sus acciones</h2><p>Aquí aparecerán los pasos que elija de cada plan, con su fecha. Abra un plan y toque "Agregar a mis acciones".</p><button class="btn" data-a="tab" data-tab="panel">Ir al panel</button></section>`;
    return `<section class="acc">
      <div class="acc-l">
        <h2>Sus acciones</h2>
        ${grupos.filter(g => g[1].length).map(([n, l]) => `<h3 class="gh ${n === 'Atrasadas' ? 'rojo' : ''}">${n}</h3>${l.map(filaAccion).join('')}`).join('')}
        ${hechas.length ? `<h3 class="gh">Hechas</h3>${hechas.map(filaAccion).join('')}` : ''}
      </div>
      <div class="acc-cal">${calendario()}</div>
    </section>`;
}
function filaAccion(a) {
    return `<div class="accion ${a.hecho ? 'hecha' : ''}">
      <button class="check" data-a="${a.hecho ? 'deshacer' : 'hecho'}" data-id="${a.id}" aria-label="${a.hecho ? 'Marcar como pendiente' : 'Marcar como hecha'}">${a.hecho ? '✓' : ''}</button>
      <div class="ab"><p class="at">${esc(a.titulo)}</p><p class="as">${icon(a.frente, 'mini')} ${esc(FR[a.frente] ? FR[a.frente].t : '')} · ${a.hecho ? (a.monto ? 'Recuperó ' + dinero(a.monto) + (a.tipo === 'mes' ? ' al mes' : '') : 'Hecha') : fechaBonita(a.fecha)}</p></div>
      ${a.hecho ? '' : `<div class="aa"><button class="lnk" data-a="ics" data-id="${a.id}" title="Agregar a su calendario">📅</button><input type="date" value="${a.fecha}" data-a="fecha" data-id="${a.id}" aria-label="Fecha"></div>`}
      <button class="x" data-a="borrar-acc" data-id="${a.id}" aria-label="Quitar">×</button>
    </div>`;
}
function calendario() {
    const base = UI.mes ? new Date(UI.mes + '-01T12:00:00') : new Date();
    const y = base.getFullYear(), m = base.getMonth(), first = new Date(y, m, 1), dias = new Date(y, m + 1, 0).getDate();
    const off = (first.getDay() + 6) % 7, hoy = hoyISO(), key = `${y}-${String(m + 1).padStart(2, '0')}`;
    let cells = '';
    for (let i = 0; i < off; i++) cells += '<span></span>';
    for (let d = 1; d <= dias; d++) {
        const iso = `${key}-${String(d).padStart(2, '0')}`, n = S.acciones.filter(a => a.fecha === iso && !a.hecho).length;
        cells += `<span class="${iso === hoy ? 'hoy' : ''} ${n ? 'tiene' : ''}" title="${n ? n + ' acción(es)' : ''}">${d}${n ? `<i>${n}</i>` : ''}</span>`;
    }
    return `<div class="cal"><div class="cal-h"><button class="lnk" data-a="mes" data-d="-1">‹</button><b>${(t => t.charAt(0).toUpperCase() + t.slice(1))(first.toLocaleDateString('es', { month: 'long', year: 'numeric' }).replace(' De ', ' de '))}</b><button class="lnk" data-a="mes" data-d="1">›</button></div>
      <div class="cal-g">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<em>${d}</em>`).join('')}${cells}</div></div>`;
}

// ---------- Finanzas (cifras reales e indicadores) ----------
function vFinanzas() {
    const c = cif(), m = mon(), k = indicadores(), r = refSector();
    const num = (v) => (v == null || v === '' ? '' : sep(v, m.dots));
    const est = (e) => `<span class="sem s-${e}">${e === 'ok' ? 'Sano' : e === 'warn' ? 'Atención' : e === 'bad' ? 'Crítico' : 'Dato'}</span>`;
    const ind = [];
    if (k) {
        if (k.mb != null) ind.push(['Margen bruto', pctTxt(k.mb) + ' %', `Sector: ${r.mb[0]}–${r.mb[1]} %`, k.mb < r.mb[0] * 0.8 ? 'bad' : k.mb < r.mb[0] ? 'warn' : 'ok']);
        if (k.me != null) ind.push(['Margen EBITDA', pctTxt(k.me) + ' %', `Referencia: ${r.margen} %`, k.me < r.margen * 0.5 ? 'bad' : k.me < r.margen ? 'warn' : 'ok']);
        if (k.ebitda != null) ind.push(['EBITDA anual', dinero(redondo(k.ebitda)), corto(k.ebitda / 12) + ' al mes', k.ebitda < 0 ? 'bad' : 'info']);
        if (k.dso != null) ind.push(['DSO · días de cobro', Math.round(k.dso) + ' días', `Sector: hasta ${r.dso} días`, k.dso > r.dso * 1.5 ? 'bad' : k.dso > r.dso ? 'warn' : 'ok']);
        if (k.dio != null && r.dio) ind.push(['DIO · días de inventario', Math.round(k.dio) + ' días', `Sector: hasta ${r.dio} días`, k.dio > r.dio * 1.5 ? 'bad' : k.dio > r.dio ? 'warn' : 'ok']);
        if (k.dpo != null) ind.push(['DPO · días de pago', Math.round(k.dpo) + ' días', 'Plazo que le dan sus proveedores', 'info']);
        if (k.ccc != null) ind.push(['Ciclo de conversión de efectivo', Math.round(k.ccc) + ' días', 'DSO + DIO − DPO: mientras menor, mejor', k.ccc > 90 ? 'bad' : k.ccc > 45 ? 'warn' : 'ok']);
        if (k.ctn != null) ind.push(['Capital de trabajo neto', dinero(redondo(k.ctn)), 'Cartera + inventario − proveedores', 'info']);
        if (k.roe != null) ind.push(['ROE · rentabilidad del patrimonio', pctTxt(k.roe) + ' %', 'Utilidad neta / patrimonio', k.roe < 0 ? 'bad' : k.roe < 10 ? 'warn' : 'ok']);
    }
    return `<section class="finz">
      <div class="inf-h"><div><h2>Finanzas</h2><p class="sub">Cifras de los últimos 12 meses, en ${esc(m.nombre.toLowerCase())}. Con ellas Rinde calcula sus indicadores reales, los compara con su sector (${esc(negTxt(S.perfil) || 'su sector')}) y los usa en el puente de EBITDA, el informe y los planes.</p></div></div>
      ${k && k.atrapado >= 1 ? `<div class="atrapado"><p class="lbl">Efectivo atrapado en capital de trabajo</p><p class="big">${dinero(redondo(k.atrapado))}</p><p class="per">${[k.atrapadoCxc ? `${corto(k.atrapadoCxc)} en cartera (DSO de ${Math.round(k.dso)} días vs. ${r.dso} del sector)` : '', k.atrapadoInv ? `${corto(k.atrapadoInv)} en inventario (DIO de ${Math.round(k.dio)} días vs. ${r.dio})` : ''].filter(Boolean).join(' · ')}. Es caja que se liberaría al llevar esos días a la referencia, una sola vez.</p></div>` : ''}
      <div class="fin-grid">
        <div class="fin-form">
          ${CIFRAS.map(([id, t, h]) => `<label class="campo"><span>${esc(t)}${['utilidad', 'patrimonio'].includes(id) ? ' <em>(opcional)</em>' : ''}</span><input id="cif-${id}" inputmode="numeric" value="${num(c[id])}" placeholder="${m.s}"><small class="ayuda">${esc(h)}</small></label>`).join('')}
          <div class="m-pie"><button class="btn" data-a="cifras-ok">Calcular indicadores</button>${tieneCifras() ? '<button class="btn ghost" data-a="cifras-borrar">Borrar cifras</button>' : ''}</div>
          <p class="disc">Las cifras se guardan solo en este diagnóstico (y en su cuenta, si tiene). No se piden cuentas bancarias ni facturas.</p>
        </div>
        <div class="fin-ind">${ind.length ? ind.map(([t, v, ref, e]) => `<div class="ind"><div><p class="lbl">${t}</p><p class="iv">${v}</p><p class="per">${ref}</p></div>${est(e)}</div>`).join('')
          : `<div class="vacio-fin"><h3>Lo que verá aquí</h3><ul><li>Margen bruto y margen EBITDA reales, contra su sector</li><li>DSO, DIO, DPO y ciclo de conversión de efectivo</li><li>Capital de trabajo neto y efectivo atrapado en cartera e inventario</li><li>ROE, si anota utilidad neta y patrimonio</li></ul><p class="per">Con ventas, costo de ventas y gastos operativos, el puente de EBITDA del panel pasa a usar su EBITDA real.</p></div>`}</div>
      </div>
    </section>`;
}

function vInforme() {
    const T = totales(), neg = negObj(S.perfil), max = Math.max(...T.l.map(x => x.max), 1);
    const pers = PERSONAS.find(x => x.id === S.perfil.personas), sed = SEDES.find(x => x.id === S.perfil.sedes);
    return `<section class="informe">
      <div class="inf-h"><div><h2>Diagnóstico de rentabilidad</h2><p class="sub">${NIVEL_TXT[nivel()]} · ${S.perfil.nombre ? '<b>' + esc(S.perfil.nombre) + '</b> · ' : ''}${esc(neg ? neg.t : '')}${S.perfil.detalle ? ' · ' + esc(S.perfil.detalle) : ''} · ${pers ? pers.t : ''} personas · ${sed ? sed.t.toLowerCase() : ''} sede(s) · ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
        <button class="btn ghost no-print" data-a="imprimir">Descargar PDF</button></div>
      <div class="kpis"><div><p class="lbl">Fugas encontradas al mes</p><p class="big">${rangoF(T.enc.min, T.enc.max)}</p></div><div><p class="lbl">Al año</p><p class="big">${rangoF(T.enc.min * 12, T.enc.max * 12)}</p></div><div><p class="lbl">Impacto en rentabilidad</p><p class="big">${T.enc.max < 1 ? '0' : rangoPts(T.pts.min, T.pts.max)}<small> puntos de margen</small></p></div><div><p class="lbl">Recuperado</p><p class="big verde">${dinero(redondo(T.unaVez))}${T.mensual ? `<small> + ${corto(T.mensual)}/mes</small>` : ''}</p></div></div>
      ${(() => { const F = finanzas(), ger = F.nivel !== 'pyme', filas = T.l.filter(x => x.max >= 1).map(x => ({ lbl: esc(FR[x.id].t), sub: ger ? esc(KPI[x.id] || '') : '', v: (x.min + x.max) / 2 })).sort((a, b) => b.v - a.v);
        const k = indicadores();
        return (filas.length ? `<h3 class="h3s">Puente de EBITDA mensual</h3>${cascadaHTML(F.base.mes, filas, (n) => corto(n), { aria: 'Puente de EBITDA', base: 'EBITDA actual', baseSub: `${pctTxt(F.base.margen)} %${F.base.real ? '' : ' (ref. sector)'}`, pot: 'EBITDA potencial', potSub: `${pctTxt(F.margenPot[0])}–${pctTxt(F.margenPot[1])} %` })}` : '')
          + (F.nivel === 'grande' && filas.length ? `<p class="sub"><b>Para accionistas:</b> la fuga anual equivale a ${rango(F.valor[0], F.valor[1])} de valor de empresa a ${MULTIPLO[0]}–${MULTIPLO[1]} veces EBITDA (ilustrativo, no es una valoración).</p>` : '')
          + (k ? `<h3 class="h3s">Indicadores con cifras reales</h3><p class="sub">${[k.mb != null ? `Margen bruto ${pctTxt(k.mb)} %` : '', k.me != null ? `margen EBITDA ${pctTxt(k.me)} %` : '', k.dso != null ? `DSO ${Math.round(k.dso)} días` : '', k.dio != null ? `DIO ${Math.round(k.dio)} días` : '', k.ccc != null ? `ciclo de caja ${Math.round(k.ccc)} días` : '', k.roe != null ? `ROE ${pctTxt(k.roe)} %` : '', k.atrapado >= 1 ? `efectivo atrapado ${corto(k.atrapado)}` : ''].filter(Boolean).join(' · ')}.</p>` : '');
      })()}
      <p class="sub">Cobertura del diagnóstico: ${T.resp} de ${T.posibles} preguntas (${T.revisado}%). Los frentes sin revisar aparecen en cero.</p>
      <div class="tabla-w"><table class="tabla"><thead><tr><th>Frente · indicador</th><th>Fuga al mes</th><th class="h-bar"></th><th class="h-prec">% de ventas</th><th>Acciones</th></tr></thead><tbody>
      ${T.l.map(x => { const a = S.acciones.filter(z => z.frente === x.id), vm = ventasMes() || 1; return `<tr><td>${icon(x.id, 'mini')} ${esc(FR[x.id].t)}<br><small class="fin">${esc(FR[x.id].fin)}</small></td><td class="num">${x.n ? rangoF(x.min, x.max) : '<span class="sut">Sin revisar</span>'}</td><td class="h-bar"><span class="bar"><i style="left:${x.min / max * 100}%;width:${x.max < 1 ? 0 : Math.max(2, (x.max - x.min) / max * 100)}%"></i></span></td><td class="h-prec">${x.max < 1 ? '—' : rangoPts(x.min / vm * 100, x.max / vm * 100) + ' %'}</td><td>${a.filter(z => z.hecho).length}/${a.length}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${T.l.filter(x => fr(x.id).plan).map(x => { const p = fr(x.id).plan; return `<div class="inf-plan"><h3>${icon(x.id, 'mini')} ${esc(FR[x.id].t)}</h3><p>${esc(p.resumen)}</p><p><b>Primer paso:</b> ${esc(p.victoria.titulo)}. ${esc(p.victoria.detalle)}</p><p><b>Cómo medirlo:</b> ${esc(p.medir)}</p></div>`; }).join('')}
      <p class="disc">Cada frente parte de cero y suma solo lo que muestran las respuestas del dueño, sobre rangos de referencia prudentes por tipo de negocio. «Puntos de margen» = fuga mensual como porcentaje de las ventas mensuales. Es un diagnóstico de priorización; no sustituye los estados financieros de la empresa.</p>
    </section>`;
}

// =====================================================================================
//  Ventanas (modales)
// =====================================================================================
function abrir(html, cls = '', mantener = false) {
    const m = $('#modal');
    const antes = mantener && !m.hidden && $('.m-caja', m) ? $('.m-caja', m).scrollTop : 0;
    m.className = 'modal ' + cls; m.dataset.afinar = '';
    m.innerHTML = `<div class="m-fondo" data-a="cerrar"></div><div class="m-caja" role="dialog" aria-modal="true"><button class="m-x" data-a="cerrar" aria-label="Cerrar">×</button>${html}</div>`;
    m.hidden = false; document.body.classList.add('quieto');
    const c = $('.m-caja', m); if (c) c.scrollTop = antes;
}
function cerrar() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; m.dataset.afinar = ''; document.body.classList.remove('quieto'); }

function libreLinea(L) {
    L = L || {};
    const est = L.estado === 'calc' ? '<span class="calc-pill">Calculando…</span>' : L.estado === 'error' ? '<span class="error">No se pudo interpretar. Tóquela para reintentar.</span>' : esc(L.nota || '');
    return `<p class="libre-txt">«${esc(L.texto || '')}» ${est}</p>`;
}
function mLibre(id, i, desdeAfinar) {
    const f = FR[id], st = fr(id), L = st.r[i] === 'x' ? (st.libre[i] || {}) : {};
    abrir(`<p class="lbl">${icon(id, 'mini')} ${esc(f.t)}</p><h2>${esc(f.q[i][0])}</h2>
      <p class="sub">Escríbalo con sus palabras, si ninguna opción describe su caso. Lo interpretamos y lo sumamos con la misma regla que las opciones.</p>
      <label class="campo"><span>Su respuesta</span><textarea id="libreTxt" rows="3" maxlength="500" placeholder="Ej.: vendemos a crédito solo a 3 clientes grandes y pagan a 45 días">${esc(L.texto || '')}</textarea></label>
      <div class="m-pie"><button class="btn ghost" data-a="${desdeAfinar ? 'afinar' : 'cerrar'}" data-f="${id}">Cancelar</button><button class="btn" data-a="libre-ok" data-f="${id}" data-i="${i}" ${desdeAfinar ? 'data-m="1"' : ''}>Calcular</button></div>`, 'chico');
    setTimeout(() => { const t = $('#libreTxt'); if (t) t.focus(); }, 60);
}
async function interpretar(id, i) {
    const f = FR[id], st = fr(id), L = st.libre[i];
    if (!L || !L.texto) return;
    const antes = calc(id);
    L.estado = 'calc'; guardar(false); render(); refrescarAfinar(id);
    let r;
    try {
        const res = await fetch('/.netlify/functions/rinde-interpretar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            frente: f.t + ' (' + f.fin + ')', pregunta: f.q[i][0], opciones: f.q[i][1].map(o => ({ t: o[0], f: o[1] })), texto: L.texto,
            negocio: negTxt(S.perfil) + (S.perfil.detalle ? ' · ' + S.perfil.detalle : '') }) });
        r = await res.json().catch(() => ({}));
        if (!res.ok || !Number.isFinite(Number(r.factor))) throw new Error(r.error || 'Error');
    } catch (_e) { r = null; }
    if (st.r[i] !== 'x' || st.libre[i] !== L) return;   // la cambió mientras tanto
    if (!r) { L.estado = 'error'; guardar(); render(); refrescarAfinar(id); toast('No se pudo interpretar su respuesta. Puede reintentar.'); return; }
    Object.assign(L, { estado: 'ok', factor: Number(r.factor), nota: r.nota || '', parecida: r.parecida || '' });
    guardar(); track('respuesta_libre', { frente: id, i, factor: L.factor });
    const ahora = calc(id), dMin = ahora.min - antes.min, dMax = ahora.max - antes.max;
    render(); refrescarAfinar(id);
    toast(dMax >= 1 ? `+${rango(dMin, dMax)} al mes en ${f.t}` : `Bien: según su respuesta, aquí no hay fuga en ${f.t.toLowerCase()}`);
}
function refrescarAfinar(id) { const m = $('#modal'); if (!m.hidden && m.dataset.afinar === id) mAfinar(id, true); }
function mAfinar(id, mantener) {
    if (!mantener) track('frente_abierto', { frente: id });
    const f = FR[id], st = fr(id);
    abrir(`<p class="lbl">${icon(id, 'mini')} ${esc(f.t)}</p><h2>Revisar este frente</h2><p class="sub">${esc(f.fin)}. Cada respuesta puede destapar una parte de la fuga; si lo tiene bajo control, no suma nada.</p>
      ${f.q.map((qq, i) => `<div class="pregunta"><p>${esc(qq[0])}</p><div class="opciones fila">${opsDe(qq).map(({ o, k }) => `<button class="opc chip ${o[1] === 0 ? 'na' : ''} ${st.r[i] === k ? 'on' : ''}" data-a="resp" data-f="${id}" data-i="${i}" data-k="${k}" data-m="1">${esc(o[0])}</button>`).join('')}<button class="opc chip otra ${st.r[i] === 'x' ? 'on' : ''}" data-a="libre" data-f="${id}" data-i="${i}" data-m="1">Otra respuesta…</button></div>${st.r[i] === 'x' ? libreLinea(st.libre[i]) : ''}</div>`).join('')}
      <div class="m-pie"><span class="vivo">${(() => { const x = calc(id); return `Encontrado: <b>${rangoF(x.min, x.max)}</b> al mes · ${x.calculando ? '<span class="calc-pill">Calculando…</span>' : x.conf}`; })()}</span><button class="btn" data-a="cerrar">Listo</button></div>`, '', mantener);
    $('#modal').dataset.afinar = id;
}

function mPorque(id) {
    const x = calc(id), f = FR[id], v = ventasMes(), st = fr(id);
    const resp = f.q.map((qq, i) => { const pt = x.partes[i]; const extra = st.r[i] === 'x' && st.libre[i] && st.libre[i].nota ? ` <i>(${esc(st.libre[i].nota)})</i>` : '';
        return pt ? `<li>${esc(qq[0])} <b>${esc(respTexto(f, st, i))}</b>${extra} → ${pt.max < 1 ? 'no suma fuga' : `suma ${rango(pt.min, pt.max)}`}</li>` : `<li class="sut">${esc(qq[0])} → ${st.r[i] === 'x' ? 'calculando su respuesta escrita' : 'sin responder'} (suma 0)</li>`; }).join('');
    abrir(`<p class="lbl">${icon(id, 'mini')} ${esc(f.t)}</p><h2>¿De dónde sale este número?</h2>
      <ol class="calc">
        <li>Ventas mensuales que usamos: <b>${dinero(redondo(v))}</b>${S.perfil.exacta ? ' (las que usted escribió)' : ' (punto medio del rango que eligió)'}</li>
        <li>En negocios parecidos, esta fuga (${esc(f.fin.toLowerCase())}) suele estar entre <b>${f.base[0]}% y ${f.base[1]}%</b> de las ventas. Se reparte entre sus ${f.q.length} preguntas.</li>
        <li>Ajuste por su tipo de negocio${id === 'personal' ? ' y tamaño' : id === 'sedes' ? ' y número de sedes' : ''}: <b>× ${Math.round(x.peso * 100) / 100}</b></li>
        <li>Factor de prudencia (preferimos quedarnos cortos): <b>× ${PRUDENCIA}</b></li>
        <li>El frente empieza en cero. Cada respuesta suma su parte según la gravedad: una buena práctica no suma nada, una respuesta intermedia suma su parte completa y una mala hasta un poco más del doble.<ul>${resp}</ul></li>
      </ol>
      <p class="resul">Encontrado: <b>${rangoF(x.min, x.max)}</b> al mes${x.max >= 1 ? ` · ${rangoPts(x.min / v * 100, x.max / v * 100)} puntos de rentabilidad` : ''}.</p>
      <p class="disc">Los porcentajes de referencia son aproximados y sirven para priorizar, no para la contabilidad. Si conoce la cifra real de su empresa, anótela en las notas del plan.</p>`);
}

function mMenu(id) {
    abrir(`<h2>${esc(FR[id].t)}</h2><div class="lista-b">
      <button class="opc linea" data-a="afinar" data-f="${id}">Afinar el número</button>
      <button class="opc linea" data-a="porque" data-f="${id}">¿De dónde sale el número?</button>
      <button class="opc linea" data-a="ocultar" data-f="${id}">Esto no aplica a mi empresa (ocultar)</button></div>`, 'chico');
}

// ---------- Plan ----------
function mPlan(id, cargando, error, mantener) {
    const f = FR[id], x = calc(id), st = fr(id), p = st.plan;
    const cab = `<p class="lbl">${icon(id, 'mini')} ${esc(f.t)} · ${rango(x.min, x.max)} al mes</p>`;
    if (cargando) return abrir(`${cab}<h2>Preparando su plan…</h2><div class="cargando"><i></i><i></i><i></i></div><p class="sub">Estamos armando pasos concretos para su empresa. Toma unos segundos.</p>`, 'plan');
    if (!p) return abrir(`${cab}<h2>Plan para recuperarlo</h2>${error ? `<p class="error">${esc(error)}</p>` : ''}<button class="btn" data-a="gen" data-f="${id}">Intentar de nuevo</button>`, 'plan');
    const ex = st.extra || {};
    const ya = (t) => S.acciones.some(a => a.frente === id && a.titulo === t);
    abrir(`${cab}<h2>Plan para recuperarlo</h2>
      <p class="resumen-p">${esc(p.resumen)}</p>
      <div class="victoria"><p class="lbl">Victoria rápida · esta semana</p><h3>${esc(p.victoria.titulo)}</h3><p>${esc(p.victoria.detalle)}</p>
        <button class="btn ${ya(p.victoria.titulo) ? 'ghost' : ''}" data-a="agregar" data-f="${id}" data-t="v" ${ya(p.victoria.titulo) ? 'disabled' : ''}>${ya(p.victoria.titulo) ? '✓ En sus acciones' : 'Agregar a mis acciones'}</button></div>
      <h3 class="h3s">Señales que puede revisar hoy</h3><ul class="senales">${p.senales.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      <h3 class="h3s">Pasos</h3><ol class="pasos">${p.pasos.map((s, i) => `<li><div><b>${esc(s.titulo)}</b><p>${esc(s.detalle)}</p><span class="cuando">En ${s.dias} día${s.dias === 1 ? '' : 's'}</span></div>
        <button class="lnk" data-a="agregar" data-f="${id}" data-t="${i}" ${ya(s.titulo) ? 'disabled' : ''}>${ya(s.titulo) ? '✓ Agregado' : '+ Agregar'}</button></li>`).join('')}</ol>
      <div class="plantilla"><p class="lbl">Mensaje listo · para ${esc(p.plantilla.para)}</p><pre id="plant">${esc(p.plantilla.texto)}</pre><button class="btn ghost" data-a="copiar">Copiar mensaje</button></div>
      <p class="medir"><b>Cómo saber si funciona:</b> ${esc(p.medir)}</p>
      <div class="afinar-ia"><h3 class="h3s">Para afinar su plan</h3><p class="sub">Responda en una línea lo que sepa y actualice el plan.</p>
        ${p.preguntas.map((q, i) => `<label class="campo"><span>${esc(q)}</span><input data-pq="${i}" maxlength="280" value="${esc(ex[q] || '')}"></label>`).join('')}
        <label class="campo"><span>Notas suyas sobre este frente <em>(opcional: cifras reales, contexto)</em></span><textarea id="notas" maxlength="600" rows="2">${esc(st.notas || '')}</textarea></label>
        ${error ? `<p class="error">${esc(error)}</p>` : ''}
        <button class="btn" data-a="regen" data-f="${id}">Actualizar plan</button></div>`, 'plan', mantener);
}

function mBloqueado(id) {
    track('bloqueo_visto', { frente: id, freeFrente: ACCESO.freeFrente || null });
    const x = calc(id), T = totales();
    abrir(`<p class="lbl">${icon(id, 'mini')} ${esc(FR[id].t)} · ${rango(x.min, x.max)} al mes</p>
      <h2>Desbloquee el plan de todos sus frentes</h2>
      <div class="borroso" aria-hidden="true"><p>████████ ██████ ████ ███████ ██ ████████ ███ ████</p><p>██████ ███ ██████████ █████ ██ ███████</p><p>█████ ██████ ███ ███████████ ██████ ██</p></div>
      <p>Usted ya vio el plan de muestra de <b>${esc(FR[ACCESO.freeFrente] ? FR[ACCESO.freeFrente].t : 'un frente')}</b>. En total lleva encontrado <b>${rangoF(T.enc.min, T.enc.max)}</b> al mes en fugas.</p>
      <button class="btn full" data-a="precios">Ver planes</button>`, 'chico');
}

// ---------- Precios y pago ----------
async function mPrecios() {
    track('precios_visto');
    const T = totales();
    if (!CONF) { try { CONF = await (await fetch(conClave('/.netlify/functions/rinde-config'))).json(); } catch (_e) { CONF = { plans: [] }; } }
    const plans = CONF.plans || [];
    const visibles = plans.filter(p => !p.hidden), sel = UI.planSel || (visibles[1] && visibles[1].id) || (plans[0] && plans[0].id);
    UI.planSel = sel;
    abrir(`<h2>Recupere lo que se está yendo</h2>
      <p class="sub">${T.enc.max >= 1 ? `Fugas encontradas: <b>${rango(T.enc.min, T.enc.max)}</b> al mes (${rangoPts(T.pts.min, T.pts.max)} puntos de rentabilidad).` : 'Revise sus frentes para ver cuánto se le está yendo.'} Elija por cuánto tiempo quiere acceso completo.</p>
      <div class="planes">${plans.map(p => `<button class="plan-c ${p.id === sel ? 'on' : ''} ${p.hidden ? 'oculto' : ''}" data-a="plan-sel" data-p="${p.id}"><b>${esc(p.label)}</b><span class="precio">US$${Number(p.usd) % 1 || p.hidden ? Number(p.usd).toFixed(2) : Number(p.usd).toFixed(0)}</span><small>${esc(p.note || '')}</small></button>`).join('')}</div>
      <ul class="incluye"><li>Plan a la medida de cada frente, con pasos, fechas y mensajes listos</li><li>Planes que se afinan con sus respuestas, todas las veces que quiera</li><li>Acciones con calendario y registro de lo recuperado</li><li>Informe en PDF para socios o contador</li></ul>
      <p class="nota">Pago único con PayPal (o tarjeta a través de PayPal). No se renueva solo.${CFG.garantia ? ' ' + esc(CFG.garantia) : ''}${CFG.contacto ? ' ' + esc(CFG.contacto) + '.' : ''} <a href="/privacidad/#pagos" target="_blank" rel="noopener">Condiciones</a></p>
      ${USER ? '<div id="pp"></div>' : '<button class="btn full" data-a="login-pagar">Crear cuenta o entrar para pagar</button>'}`, 'chico');
    if (USER) pintarPaypal();
}
let ppCargado = null;
function cargarPaypal() {
    if (ppCargado) return ppCargado;
    ppCargado = new Promise((ok, mal) => {
        if (!CONF || !CONF.clientId) return mal(new Error('PayPal no está configurado.'));
        const s = document.createElement('script');
        s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CONF.clientId)}&currency=USD&intent=capture&components=buttons`;
        s.onload = () => ok(window.paypal); s.onerror = () => { ppCargado = null; mal(new Error('No se pudo cargar PayPal.')); };
        document.head.appendChild(s);
    });
    return ppCargado;
}
async function pintarPaypal() {
    const box = $('#pp'); if (!box) return;
    box.innerHTML = '<p class="sub">Cargando PayPal…</p>';
    try {
        const paypal = await cargarPaypal();
        box.innerHTML = '';
        paypal.Buttons({
            style: { layout: 'vertical', shape: 'pill', label: 'pay' },
            createOrder: async () => {
                const r = await api('rinde-pay-create', { plan: UI.planSel, k: CLAVE || undefined });
                if (!r.orderID) throw new Error(r.error || 'No se pudo iniciar el pago');
                track('pago_iniciado', { plan: UI.planSel });
                return r.orderID;
            },
            onApprove: async (data) => {
                box.innerHTML = '<p class="sub">Confirmando su pago…</p>';
                const r = await api('rinde-pay-capture', { orderID: data.orderID });
                if (r.ok) { ACCESO = r.access || ACCESO; track('pago_ok', { plan: UI.planSel }); cerrar(); render(); toast('¡Listo! Ya tiene acceso a todos los planes.'); }
                else { box.innerHTML = `<p class="error">${esc(r.error || 'No se pudo confirmar el pago.')}</p>`; track('pago_error'); }
            },
            onCancel: () => track('pago_cancelado'),
            onError: (e) => { box.insertAdjacentHTML('afterbegin', `<p class="error">Hubo un problema con PayPal. Intente de nuevo.</p>`); console.error(e); }
        }).render(box);
    } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

function mHecho(id) {
    const a = S.acciones.find(z => z.id === id); if (!a) return;
    abrir(`<h2>¡Bien hecho!</h2><p class="sub">${esc(a.titulo)}</p>
      <label class="campo"><span>¿Cuánto recuperó o ahorró, más o menos? (${mon().s}) <em>Opcional</em></span><input id="monto" inputmode="numeric" placeholder="0"></label>
      <div class="opciones fila"><button class="opc chip on" data-a="tipo" data-v="una">Una sola vez</button><button class="opc chip" data-a="tipo" data-v="mes">Cada mes</button></div>
      <div class="m-pie"><button class="btn ghost" data-a="cerrar">Cancelar</button><button class="btn" data-a="hecho-ok" data-id="${id}">Guardar</button></div>`, 'chico');
}

// Menú de empresa (arriba, junto al nombre): cambiar de empresa, agregar otra, editar datos y limpiar el proyecto.
function menuEmp() {
    const otras = Object.entries(E.empresas).filter(([id, x]) => id !== E.activa && x.perfil);
    return `<div class="emp-menu" role="menu">
      <p class="emp-m-lbl">Empresa abierta</p><p class="emp-m-act">${esc(nombreEmp(S))}</p>
      ${otras.length ? `<p class="emp-m-lbl">Cambiar a</p>${otras.map(([id, x]) => `<button role="menuitem" data-a="emp-abrir" data-id="${id}">${icon('sedes', 'mini')} ${esc(nombreEmp(x))}</button>`).join('')}` : ''}
      <hr><button role="menuitem" class="emp-m-nueva" data-a="emp-nueva">＋ Agregar empresa</button>
      <button role="menuitem" data-a="perfil">✎ Editar datos de la empresa</button>
      <button role="menuitem" data-a="limpiar">↺ Limpiar proyecto</button>
    </div>`;
}
function mEmpresas() {
    const lista = Object.entries(E.empresas).filter(([, x]) => x.perfil);
    abrir(`<h2>Sus empresas</h2><p class="sub">Cada empresa tiene su propio diagnóstico, planes y acciones.${ACCESO.active ? ' Su plan cubre todas.' : ''}</p>
      <div class="lista-b">${lista.map(([id, x]) => { const n = negObj(x.perfil);
        return `<button class="opc linea emp-op ${id === E.activa ? 'on' : ''}" data-a="emp-abrir" data-id="${id}"><b>${esc(nombreEmp(x))}</b><span>${[x.perfil.nombre && n ? n.t : '', id === E.activa ? 'Abierta ahora' : ''].filter(Boolean).join(' · ')}</span></button>`; }).join('')}
        <button class="opc linea emp-nueva" data-a="emp-nueva">+ Agregar empresa</button></div>
      <div class="lista-b"><button class="opc linea" data-a="perfil">Editar datos de «${esc(nombreEmp(S))}»</button><button class="opc linea" data-a="limpiar">Limpiar proyecto de «${esc(nombreEmp(S))}»</button></div>`, 'chico');
}
function mLimpiar() {
    abrir(`<h2>Limpiar proyecto</h2><p class="sub">De «${esc(nombreEmp(S))}». Elija qué borrar. No se puede deshacer.</p>
      <div class="lista-b">
        <button class="opc linea" data-a="limpiar-resp"><b>Empezar el diagnóstico de nuevo</b><span>Borra respuestas, planes y acciones. Conserva el nombre, tipo de negocio, tamaño y ventas.</span></button>
        <button class="opc linea" data-a="limpiar-todo"><b>Borrar todo</b><span>Deja el proyecto vacío y vuelve a preguntar los datos de la empresa.</span></button>
        ${Object.keys(E.empresas).filter(k => k !== E.activa && E.empresas[k].perfil).length ? '<button class="opc linea peligro" data-a="emp-eliminar"><b>Eliminar esta empresa</b><span>La quita de su lista, con todo su diagnóstico.</span></button>' : ''}
      </div><div class="m-pie"><button class="btn ghost" data-a="cerrar">Cancelar</button></div>`, 'chico');
}
function mEliminar() {
    abrir(`<h2>¿Eliminar «${esc(nombreEmp(S))}»?</h2><p class="sub">Se borran su diagnóstico, planes, acciones y lo recuperado. No se puede deshacer.</p>
      <div class="m-pie"><button class="btn ghost" data-a="cerrar">Cancelar</button><button class="btn peligro" data-a="emp-eliminar-ok">Sí, eliminar</button></div>`, 'chico');
}

function mCuenta() {
    abrir(`<h2>Mi cuenta</h2><p class="sub">${esc(USER.email || '')}</p>
      ${ACCESO.active ? `<p><span class="pill ok">Plan activo</span> ${ACCESO.admin ? '(administrador)' : `hasta el ${new Date(ACCESO.paidUntil).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`}</p>` : `<p>Evaluación${ACCESO.freeFrente ? ` · plan de muestra: <b>${esc(FR[ACCESO.freeFrente] ? FR[ACCESO.freeFrente].t : '')}</b>` : ''}</p><button class="btn full" data-a="precios">Ver planes</button>`}
      <div class="lista-b"><button class="opc linea" data-a="empresas">Mis empresas (${Object.values(E.empresas).filter(x => x.perfil).length}) · agregar o cambiar</button><button class="opc linea" data-a="perfil">Editar datos de la empresa</button><button class="opc linea" data-a="limpiar">Limpiar proyecto</button><button class="opc linea" data-a="logout">Cerrar sesión</button></div>
      <p class="disc">¿Dudas o soporte? ${esc(CFG.contacto)}${CFG.whatsapp ? ` · <a href="https://wa.me/${CFG.whatsapp}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}</p>
      <p class="disc">Su diagnóstico se guarda en su cuenta y puede abrirlo desde el teléfono o la computadora.</p>`, 'chico');
}

// =====================================================================================
//  Servidor
// =====================================================================================
async function token() {
    const u = window.netlifyIdentity && netlifyIdentity.currentUser();
    if (!u) return null;
    try { return await u.jwt(); } catch (_e) { return u.token && u.token.access_token; }
}
async function api(fn, body, method) {
    const t = await token();
    const h = { 'Content-Type': 'application/json' };
    if (t) h.Authorization = 'Bearer ' + t;
    try {
        const r = await fetch('/.netlify/functions/' + fn, { method: method || (body ? 'POST' : 'GET'), headers: h, body: body ? JSON.stringify(body) : undefined });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return Object.assign({ status: r.status }, d, { error: d.error || 'Error ' + r.status });
        return d;
    } catch (_e) { return { error: 'Sin conexión. Revise su internet e intente de nuevo.' }; }
}
async function bajar() {
    const r = await api('rinde-data');
    if (r.error) return;
    ACCESO = r.access || ACCESO;
    const remoto = normalizar(r.data);
    if (remoto && Object.values(remoto.empresas).some(x => x.perfil) && (!hayDatos() || (remoto.actualizado || 0) > (E.actualizado || 0))) {
        E = remoto; S = E.empresas[E.activa];
        try { localStorage.setItem(KEY2, JSON.stringify(E)); } catch (_e) {}
        if (S.perfil && UI.vista !== 'onb') UI.vista = 'app';
    } else if (hayDatos()) await subir();
    render();
}
async function subir() { if (!USER || !hayDatos()) return; const r = await api('rinde-data', { data: E }); if (r.error && r.status !== 401) console.warn('[rinde] no se pudo guardar en la nube', r.error); }

async function generarPlan(id) {
    const x = calc(id), st = fr(id), p = S.perfil, f = FR[id];
    mPlan(id, true);
    const extra = Object.entries(st.extra || {}).filter(([, v]) => v).map(([q, a]) => ({ q, a }));
    const r = await api('rinde-plan', {
        frente: id,
        nivel: nivel(), finanzas: resumenFin(),
        perfil: { negocio: negTxt(p), detalle: p.detalle || '', personas: (PERSONAS.find(n => n.id === p.personas) || {}).t,
            ventas: corto(ventasMes()), moneda: mon().s + ' ' + (p.moneda || ''), pais: '' },
        datos: { titulo: f.t + ' (' + f.fin + ') — ' + f.f, rango: rangoF(x.min, x.max) + ' (' + rangoPts(x.min / (ventasMes() || 1) * 100, x.max / (ventasMes() || 1) * 100) + ' puntos de margen sobre ventas)', respuestas: f.q.map((qq, i) => st.r[i] != null ? { q: qq[0], a: respTexto(f, st, i) } : null).filter(Boolean), extra, notas: st.notas || '' }
    });
    if (r.status === 401) { pendiente = { tipo: 'plan', id }; cerrar(); return pedirLogin('signup'); }
    if (r.status === 402) { if (r.freeFrente) ACCESO.freeFrente = r.freeFrente; render(); return mBloqueado(id); }
    if (r.error || !r.plan) { track('plan_error', { frente: id }); return mPlan(id, false, r.message || r.error); }
    st.plan = r.plan; st.planEn = Date.now();
    if (r.free) ACCESO.freeFrente = id;
    guardar(); track('plan_ok', { frente: id, free: !!r.free });
    render(); mPlan(id);
}

// Resumen financiero en texto para los planes de la IA (solo cifras ya calculadas aquí).
function resumenFin() {
    const F = finanzas(), k = indicadores();
    const t = [`Margen EBITDA ${pctTxt(F.base.margen)} % (${F.base.real ? 'real' : 'referencia del sector'})`, F.T.enc.max >= 1 ? `potencial ${pctTxt(F.margenPot[0])}–${pctTxt(F.margenPot[1])} %` : ''];
    if (k) t.push(...[k.mb != null ? `margen bruto ${pctTxt(k.mb)} %` : '', k.dso != null ? `DSO ${Math.round(k.dso)} días (ref. ${refSector().dso})` : '', k.dio != null ? `DIO ${Math.round(k.dio)} días (ref. ${refSector().dio})` : '',
        k.dpo != null ? `DPO ${Math.round(k.dpo)} días` : '', k.ccc != null ? `ciclo de caja ${Math.round(k.ccc)} días` : '', k.roe != null ? `ROE ${pctTxt(k.roe)} %` : '', k.atrapado >= 1 ? `efectivo atrapado ${corto(k.atrapado)}` : '']);
    if (F.nivel === 'grande' && F.T.enc.max >= 1) t.push(`valor de empresa en juego ${rango(F.valor[0], F.valor[1])} a ${MULTIPLO[0]}–${MULTIPLO[1]}× EBITDA (ilustrativo)`);
    return t.filter(Boolean).join('; ');
}
function pedirLogin(modo) {
    if (!window.netlifyIdentity) return toast('No se pudo cargar el inicio de sesión. Recargue la página.');
    track('login_visto', { modo });
    netlifyIdentity.open(modo || 'login');
}

// =====================================================================================
//  Eventos
// =====================================================================================
document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (UI.menu && (!b || b.dataset.a !== 'emp-menu')) { UI.menu = false; if (!b) { render(); return; } }
    if (!b) return;
    const a = b.dataset.a, id = b.dataset.f;
    if (b.tagName === 'A') e.preventDefault();
    switch (a) {
        case 'empezar': case 'perfil': empezarOnb(); track(a === 'empezar' ? 'empezar' : 'editar_perfil'); break;
        case 'empresas': mEmpresas(); break;
        case 'emp-menu': UI.menu = !UI.menu; render(); track('menu_empresa', { abierto: UI.menu }); break;
        case 'emp-abrir': cerrar(); abrirEmpresa(b.dataset.id); track('empresa_cambiada'); break;
        case 'emp-nueva': { guardar(false); const nid = nuevoId(); E.empresas[nid] = nuevo(); E.activa = nid; S = E.empresas[nid]; limpiarVacias(); UI.tab = 'panel'; empezarOnb(); track('empresa_nueva', { empresas: Object.keys(E.empresas).length }); break; }
        case 'limpiar': mLimpiar(); break;
        case 'cifras-ok': {
            const c = {};
            CIFRAS.forEach(([k]) => { const el = $('#cif-' + k); if (!el) return; const t = el.value.trim(); if (!t) return; const neg = /^-/.test(t), n = Number(t.replace(/[^\d]/g, '')); if (Number.isFinite(n) && t.replace(/[^\d]/g, '')) c[k] = neg ? -n : n; });
            if (!(c.ventas > 0)) { toast('Anote al menos las ventas netas de los últimos 12 meses.'); const v = $('#cif-ventas'); if (v) v.focus(); break; }
            S.cifras = c; guardar(); track('cifras_guardadas', { campos: Object.keys(c).length, nivel: nivel() }); render(); window.scrollTo(0, 0);
            toast('Indicadores calculados con sus cifras reales.'); break;
        }
        case 'cifras-borrar': delete S.cifras; guardar(); track('cifras_borradas'); render(); toast('Cifras borradas: se vuelve a la referencia del sector.'); break;
        case 'limpiar-resp': {
            S = Object.assign(nuevo(), { perfil: S.perfil, creado: S.creado }); guardar(); cerrar(); UI.vista = 'app'; UI.tab = 'panel'; render(); window.scrollTo(0, 0);
            track('proyecto_limpiado', { modo: 'respuestas' }); toast('Listo: empezamos otra vez desde cero, con los mismos datos de la empresa.'); break;
        }
        case 'limpiar-todo': { S = nuevo(); guardar(); track('proyecto_limpiado', { modo: 'todo' }); empezarOnb(); toast('Proyecto borrado. Cuéntenos de nuevo sobre su empresa.'); break; }
        case 'emp-eliminar': mEliminar(); break;
        case 'emp-eliminar-ok': {
            const ids = Object.keys(E.empresas).filter(k => k !== E.activa && E.empresas[k].perfil);
            if (!ids.length) break;
            delete E.empresas[E.activa]; E.activa = ids[0]; S = E.empresas[ids[0]]; guardar(); cerrar(); UI.vista = 'app'; UI.tab = 'panel'; render(); window.scrollTo(0, 0);
            track('empresa_eliminada'); toast('Empresa eliminada.'); break;
        }
        case 'onb-set': {
            const k = b.dataset.k; let v = b.dataset.v;
            leerOnb(); if (k === 'ventas') { v = Number(v); UI.borrador.exacta = 0; }
            if (k === 'negocios') { const l = UI.borrador.negocios, i = l.indexOf(v); if (i >= 0) l.splice(i, 1); else l.push(v); }
            else UI.borrador[k] = v;
            render(); break;
        }
        case 'onb-atras': leerOnb(); UI.paso--; render(); break;
        case 'onb-cancelar': { const otra = Object.keys(E.empresas).find(k => k !== E.activa && E.empresas[k].perfil); if (otra) { delete E.empresas[E.activa]; E.activa = otra; S = E.empresas[otra]; guardar(false); } UI.vista = S.perfil ? 'app' : 'inicio'; render(); window.scrollTo(0, 0); break; }
        case 'onb-sig': {
            leerOnb(); track('paso_listo', { paso: UI.paso });
            if (UI.paso < 3) { UI.paso++; render(); window.scrollTo(0, 0); break; }
            const nuevoPerfil = !S.perfil;
            S.perfil = { nombre: UI.borrador.nombre || '', negocios: UI.borrador.negocios.slice(), negocio: UI.borrador.negocios[0], detalle: UI.borrador.detalle, personas: UI.borrador.personas, sedes: UI.borrador.sedes, ventas: UI.borrador.ventas == null ? 2 : UI.borrador.ventas, exacta: UI.borrador.exacta || 0, moneda: UI.borrador.moneda };
            guardar(); UI.vista = 'app'; UI.tab = 'panel'; render(); window.scrollTo(0, 0);
            track(nuevoPerfil ? 'diagnostico_listo' : 'perfil_editado', { negocio: negsDe(S.perfil).join('+'), personas: S.perfil.personas, ventas: S.perfil.ventas, empresas: Object.keys(E.empresas).length });
            break;
        }
        case 'tab': if (UI.tab !== b.dataset.tab) track('pestana', { tab: b.dataset.tab }); UI.tab = b.dataset.tab; if (UI.vista !== 'app' && S.perfil) UI.vista = 'app'; render(); window.scrollTo(0, 0); break;
        case 'resp': {
            const st = fr(id), i = Number(b.dataset.i), k = Number(b.dataset.k);
            const antes = calc(id);
            st.r[i] = k; delete st.libre[i]; guardar(); track('respuesta', { frente: id, i, k });
            const ahora = calc(id), dMin = ahora.min - antes.min, dMax = ahora.max - antes.max;
            const aviso = dMax >= 1 ? `+${rango(dMin, dMax)} al mes en ${FR[id].t}` : dMax <= -1 ? `${FR[id].t}: la fuga bajó a ${rangoF(ahora.min, ahora.max)}` : `Bien: aquí no hay fuga en ${FR[id].t.toLowerCase()}`;
            if (b.dataset.m) { render(); mAfinar(id, true); } else { render(); }
            toast(aviso);
            break;
        }
        case 'afinar': mAfinar(id); break;
        case 'libre': {
            const st = fr(id), i = Number(b.dataset.i);
            if (st.r[i] === 'x' && st.libre[i] && st.libre[i].estado === 'error') { interpretar(id, i); break; }
            mLibre(id, i, !!b.dataset.m); break;
        }
        case 'libre-ok': {
            const t = (($('#libreTxt') || {}).value || '').trim();
            if (t.length < 2) { $('#libreTxt').focus(); break; }
            const st = fr(id), i = Number(b.dataset.i);
            st.r[i] = 'x'; st.libre[i] = { texto: t.slice(0, 500), estado: 'calc' }; guardar();
            if (b.dataset.m) mAfinar(id); else cerrar();
            render(); interpretar(id, i); break;
        }
        case 'porque': mPorque(id); track('porque', { frente: id }); break;
        case 'menu': mMenu(id); break;
        case 'ocultar': track('frente_oculto', { frente: id }); fr(id).oculto = true; guardar(); cerrar(); render(); toast('Frente oculto. Puede volver a mostrarlo abajo.'); break;
        case 'mostrar': track('frente_mostrado', { frente: id }); fr(id).oculto = false; guardar(); render(); break;
        case 'plan': {
            if (calc(id).n === 0) { mAfinar(id); break; }
            track('plan_click', { frente: id });
            const st = fr(id);
            if (st.plan) { mPlan(id); break; }
            if (!USER) { track('cuenta_pedida', { frente: id }); pendiente = { tipo: 'plan', id }; abrir(`<h2>Su plan está a un paso</h2><p class="sub">Cree su cuenta para ver el plan completo de <b>${esc(FR[id].t)}</b> y guardar su diagnóstico en el teléfono y la computadora.</p><button class="btn full" data-a="login-signup">Crear cuenta</button><button class="btn ghost full" data-a="login">Ya tengo cuenta</button><p class="disc">La evaluación incluye el plan completo de un frente. Le recomendamos el de mayor impacto.</p>`, 'chico'); break; }
            if (!puedeVer(id)) { mBloqueado(id); break; }
            generarPlan(id); break;
        }
        case 'gen': generarPlan(id); break;
        case 'regen': {
            const st = fr(id); st.extra = st.extra || {};
            (st.plan && st.plan.preguntas || []).forEach((q, i) => { const inp = document.querySelector(`[data-pq="${i}"]`); if (inp) st.extra[q] = inp.value.trim(); });
            const n = $('#notas'); if (n) st.notas = n.value.trim();
            guardar(); generarPlan(id); break;
        }
        case 'agregar': {
            const st = fr(id), p = st.plan; if (!p) break;
            const t = b.dataset.t, paso = t === 'v' ? { titulo: p.victoria.titulo, detalle: p.victoria.detalle, dias: 3 } : p.pasos[Number(t)];
            if (!paso || S.acciones.some(z => z.frente === id && z.titulo === paso.titulo)) break;
            S.acciones.push({ id: uid(), frente: id, titulo: paso.titulo, detalle: paso.detalle, fecha: masDias(Math.max(1, Math.min(60, paso.dias || 3))), hecho: false });
            guardar(); track('accion_agregada', { frente: id }); render(); mPlan(id, false, null, true); toast('Agregado a sus acciones.'); break;
        }
        case 'copiar': { const t = $('#plant').textContent; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Mensaje copiado.'), () => toast('Seleccione el texto y cópielo.')); break; }
        case 'hecho': mHecho(b.dataset.id); break;
        case 'tipo': document.querySelectorAll('[data-a="tipo"]').forEach(x => x.classList.toggle('on', x === b)); break;
        case 'hecho-ok': {
            const ac = S.acciones.find(z => z.id === b.dataset.id); if (!ac) break;
            const n = Number(String(($('#monto') || {}).value || '').replace(/[^\d]/g, '')) || 0;
            const tipo = ($('[data-a="tipo"].on') || {}).dataset ? $('[data-a="tipo"].on').dataset.v : 'una';
            Object.assign(ac, { hecho: true, hechoEn: hoyISO(), monto: n, tipo });
            guardar(); cerrar(); render(); track('accion_hecha', { frente: ac.frente, monto: n > 0 }); toast(n ? 'Sumado a lo recuperado.' : '¡Una menos!'); break;
        }
        case 'deshacer': { const ac = S.acciones.find(z => z.id === b.dataset.id); if (ac) { ac.hecho = false; ac.monto = 0; guardar(); render(); } break; }
        case 'borrar-acc': S.acciones = S.acciones.filter(z => z.id !== b.dataset.id); guardar(); render(); break;
        case 'ics': descargarIcs(S.acciones.find(z => z.id === b.dataset.id)); break;
        case 'mes': { const base = UI.mes ? new Date(UI.mes + '-01T12:00:00') : new Date(); base.setMonth(base.getMonth() + Number(b.dataset.d)); UI.mes = isoLocal(base).slice(0, 7); render(); break; }
        case 'imprimir': track('pdf'); window.print(); break;
        case 'precios': mPrecios(); break;
        case 'plan-sel': UI.planSel = b.dataset.p; document.querySelectorAll('.plan-c').forEach(x => x.classList.toggle('on', x === b)); break;
        case 'login': cerrar(); pedirLogin('login'); break;
        case 'login-signup': cerrar(); pedirLogin('signup'); break;
        case 'login-pagar': pendiente = { tipo: 'precios' }; cerrar(); pedirLogin('signup'); break;
        case 'cuenta': mCuenta(); break;
        case 'logout': track('logout'); cerrar(); netlifyIdentity.logout(); break;
        case 'cerrar': cerrar(); break;
    }
});
document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.a === 'fecha') { const ac = S.acciones.find(z => z.id === t.dataset.id); if (ac && t.value) { ac.fecha = t.value; guardar(); render(); } }
    if (t.dataset.a === 'onb-moneda') { leerOnb(); UI.borrador.moneda = t.value; render(); }
});
document.addEventListener('input', (e) => {
    if (e.target.id === 'exacta') { const n = Number(e.target.value.replace(/[^\d]/g, '')) || 0; const s = $('[data-a="onb-sig"]'); if (s) s.disabled = !(n > 0 || UI.borrador.ventas != null); }
});
document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (!$('#modal').hidden) cerrar(); else if (UI.menu) { UI.menu = false; render(); } });

function leerOnb() {
    const b = UI.borrador; if (!b) return;
    const d = $('#detalle'); if (d) b.detalle = d.value.trim().slice(0, 120);
    const nm = $('#nombreEmp'); if (nm) b.nombre = nm.value.trim().slice(0, 60);
    const x = $('#exacta'); if (x) { const n = Number(x.value.replace(/[^\d]/g, '')) || 0; if (n > 0) { b.exacta = n; b.ventas = null; } }
    const m = $('#moneda'); if (m) b.moneda = m.value;
}

function descargarIcs(a) {
    if (!a) return;
    const d = a.fecha.replace(/-/g, ''), n = new Date(a.fecha + 'T12:00:00'); n.setDate(n.getDate() + 1);
    const d2 = isoLocal(n).replace(/-/g, '');
    const limpia = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rinde//ES', 'BEGIN:VEVENT', `UID:${a.id}@rinde`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
        `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${limpia('Rinde: ' + a.titulo)}`, `DESCRIPTION:${limpia(a.detalle)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const l = document.createElement('a'); l.href = url; l.download = 'rinde-accion.ics'; document.body.appendChild(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000); track('ics');
}

// =====================================================================================
//  Arranque
// =====================================================================================
function alEntrar(u) {
    USER = u ? { email: u.email, id: u.id } : null;
    if (!USER) { ACCESO = { active: false, freeFrente: null }; render(); return; }
    bajar().then(() => {
        const p = pendiente; pendiente = null;
        if (p && p.tipo === 'plan') { const st = fr(p.id); if (st.plan) mPlan(p.id); else if (puedeVer(p.id)) generarPlan(p.id); else mBloqueado(p.id); }
        else if (p && p.tipo === 'precios') mPrecios();
    });
}
if (window.netlifyIdentity) {
    netlifyIdentity.on('init', (u) => { if (u) alEntrar(u); });
    netlifyIdentity.on('login', (u) => { netlifyIdentity.close(); track('login_ok'); alEntrar(u); });
    netlifyIdentity.on('logout', () => { alEntrar(null); toast('Sesión cerrada. Su diagnóstico sigue en este dispositivo.'); });
    netlifyIdentity.init({ locale: 'es' });
}
fetch(conClave('/.netlify/functions/rinde-config')).then(r => r.json()).then(c => { const antes = monedaVisitante(); CONF = c; if (UI.vista === 'inicio' && monedaVisitante() !== antes) render(); }).catch(() => {});
track(S.perfil ? 'visita_vuelta' : 'visita_nueva', { ref: document.referrer ? document.referrer.slice(0, 120) : null, utm: (location.search.match(/utm_campaign=([\w.-]{1,40})/) || [])[1] || null, ad: (location.search.match(/utm_content=([\w.-]{1,40})/) || [])[1] || null, fb: /fbclid=/.test(location.search) });
const inicioPagina = Date.now();
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    let T = null; try { T = S.perfil ? totales() : null; } catch (_e) {}
    track('salida', { seg: Math.round((Date.now() - inicioPagina) / 1000), vista: UI.vista, tab: UI.tab, paso: UI.vista === 'onb' ? UI.paso : null,
        resp: T ? T.resp : 0, acciones: S.acciones.length, cuenta: !!USER, plan: !!ACCESO.active });
});
window.addEventListener('error', (e) => { track('error_js', { m: String(e.message || '').slice(0, 160), l: e.lineno || null }); });
if (S.perfil) Object.entries(S.fr || {}).forEach(([id, st]) => { if (FR[id] && st.libre) Object.keys(st.libre).forEach(i => { if (st.r[i] === 'x' && st.libre[i].estado === 'calc') setTimeout(() => interpretar(id, Number(i)), 300); }); });
render();
})();
