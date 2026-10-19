// «Rinde» (/rinde/): encuentre fugas de dinero en su empresa y recupérelo.
// Piezas compartidas por las funciones rinde-*. Usa las MISMAS variables de entorno que ya tiene Graphikosmos:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV, GEMINI_API_KEY,
//   y opcionalmente RESEND_API_KEY + FEEDBACK_TO_EMAIL (aviso por correo de cada pago).
// Tablas: supabase/rinde.sql (correr UNA vez en Supabase → SQL Editor).
const crypto = require('crypto');
const { getUser } = require('./auth');
const { json, scrub, scrubOne, countryOf } = require('./tc-core');

// >>> EDITA AQUÍ los planes y precios (US$, lo que cobra PayPal). Son pagos únicos: no hay renovación automática. <<<
// El precio depende del tamaño de la empresa (pyme / mediana / grande), que el navegador calcula con el perfil
// (personas y ventas) y guarda en cada empresa. Se cobra según la empresa MÁS grande de la cuenta.
const PRECIOS = {
    pyme:    { mes: '19.00',  trimestre: '45.00',  anio: '149.00' },
    mediana: { mes: '49.00',  trimestre: '129.00', anio: '390.00' },
    grande:  { mes: '149.00', trimestre: '390.00', anio: '1190.00' }
};
const NIVELES = ['pyme', 'mediana', 'grande'];
const PLANS = {
    mes:       { label: '1 mes',   months: 1,  usd: PRECIOS.pyme.mes,       note: 'Para probar a fondo' },
    trimestre: { label: '3 meses', months: 3,  usd: PRECIOS.pyme.trimestre, note: 'El más elegido' },
    anio:      { label: '12 meses', months: 12, usd: PRECIOS.pyme.anio,      note: 'Ahorra 35%' },
    // Plan OCULTO para que el dueño pruebe el cobro real por US$1 (un día de acceso). Solo existe con la clave del dueño:
    // abrir /rinde/?k=CLAVE (se recuerda en ese navegador). La clave se puede cambiar con la variable RINDE_TEST_KEY de Netlify.
    prueba:    { label: 'Prueba del dueño', months: 0, days: 1, usd: '1.00', note: '1 día · solo con tu clave', hidden: true }
};

// ---------- Supabase (REST con la clave de servicio: SOLO en el servidor) ----------
function sb() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}
async function q(path, { method = 'GET', body, prefer } = {}) {
    const { url, key } = sb();
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${path.split('?')[0]} ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
}
const enc = encodeURIComponent;
async function upsert(table, row) {
    await q(`${table}?on_conflict=${table === 'rinde_orders' ? 'order_id' : 'user_id'}`, { method: 'POST', body: { ...row, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
}
async function one(table, col, val) {
    const rows = await q(`${table}?${col}=eq.${enc(val)}&select=*&limit=1`);
    return rows && rows[0] || null;
}

// ---------- Acceso (plan pagado y frente gratis) ----------
async function getAccess(user) {
    const row = await one('rinde_access', 'user_id', user.id);
    const until = row && row.paid_until ? new Date(row.paid_until) : null;
    // TEMPORAL (prueba de cobro): estas cuentas de administrador se tratan como clientes normales (sin acceso ilimitado).
    // Para devolverles el acceso ilimitado, vaciar la lista.
    const comoCliente = [].includes(String(user.email || '').toLowerCase());
    const admin = !!user.isAdmin && !comoCliente;
    const active = !!(admin || (until && until > new Date()));
    return {
        active,
        admin,
        plan: row && row.plan || null,
        paidUntil: until ? until.toISOString() : null,
        freeFrente: row && row.free_frente || null
    };
}

// Extiende el acceso: si todavía tiene días pagados, se suman al final; si no, desde hoy.
const TEST_KEY = process.env.RINDE_TEST_KEY || 'rinde-MnCfYEKhvS8';
const testKeyOk = (k) => { const a = Buffer.from(String(k || '')), b = Buffer.from(TEST_KEY); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const nivelOk = (n) => (NIVELES.includes(n) ? n : 'pyme');
const mayorNivel = (...l) => NIVELES[Math.max(0, ...l.map(n => NIVELES.indexOf(n)))];
// Precio de un plan para un tamaño de empresa (el plan oculto de prueba siempre cuesta lo mismo).
function planNivel(id, nivel) {
    const p = PLANS[id]; if (!p) return null;
    if (p.hidden) return { ...p };
    const usd = PRECIOS[nivelOk(nivel)][id], mes = Number(PRECIOS[nivelOk(nivel)].mes);
    const ahorro = Math.round((1 - Number(usd) / (mes * p.months)) * 100);
    return { ...p, usd, note: id === 'anio' ? `Ahorra ${ahorro}%` : p.note };
}
// Planes que puede ver/comprar esta persona: los visibles, más los ocultos si trae la clave del dueño.
const planesPara = (k, nivel) => Object.keys(PLANS).filter(id => !PLANS[id].hidden || testKeyOk(k)).map(id => [id, planNivel(id, nivel)]);
// Tamaño que se cobra: el mayor entre lo que dice el navegador y las empresas guardadas en la cuenta.
async function nivelCuenta(user, nivelCliente) {
    const l = [nivelOk(nivelCliente)];
    try {
        const row = await one('rinde_projects', 'user_id', user.id), d = row && row.data;
        if (d && d.empresas && typeof d.empresas === 'object') Object.values(d.empresas).forEach(x => { if (x && x.nivel) l.push(nivelOk(x.nivel)); });
        else if (d && d.nivel) l.push(nivelOk(d.nivel));
    } catch (_e) {}
    return mayorNivel(...l);
}

function extendFrom(current, months, days) {
    const now = new Date();
    const base = current && new Date(current) > now ? new Date(current) : now;
    const d = new Date(base); d.setMonth(d.getMonth() + (months || 0)); if (days) d.setDate(d.getDate() + days);
    return d.toISOString();
}

// Exige sesión de Netlify Identity (la misma de Graphikosmos).
function requireUser(context) {
    const user = getUser(context);
    return user || null;
}

// Evento del servidor ligado a la cuenta (correo en actor_label). Nunca rompe la respuesta si falla.
async function evento(user, nombre, meta) {
    try { await require('./store').logEvent(user.id, 'user', null, 'rinde_' + nombre, meta || {}, user.email || null, 'rinde'); }
    catch (e) { console.error('[rinde] evento', nombre, e.message); }
}

module.exports = { evento, PLANS, PRECIOS, testKeyOk, planesPara, planNivel, nivelCuenta, nivelOk, json, scrub, scrubOne, countryOf, q, upsert, one, getAccess, extendFrom, requireUser, getUser };
