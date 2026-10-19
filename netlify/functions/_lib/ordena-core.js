// «Ordena» (/ordena/): encuentra las horas que se te escapan cada semana y recupéralas (hermana personal de Rinde).
// Piezas compartidas por las funciones ordena-*. Usa las MISMAS variables de entorno que ya tiene Graphikosmos:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV, GEMINI_API_KEY,
//   y opcionalmente RESEND_API_KEY + FEEDBACK_TO_EMAIL (aviso por correo de cada pago).
// Tablas: supabase/ordena.sql (correr UNA vez en Supabase → SQL Editor).
const crypto = require('crypto');
const { getUser } = require('./auth');
const { json, scrub, scrubOne, countryOf } = require('./tc-core');

// >>> EDITA AQUÍ los planes y precios (US$, lo que cobra PayPal). Son pagos únicos: no hay renovación automática. <<<
const PLANS = {
    mes:       { label: '1 mes',    months: 1,  usd: '5.00',  note: 'Para probar' },
    trimestre: { label: '3 meses',  months: 3,  usd: '12.00', note: 'El más elegido' },
    anio:      { label: '12 meses', months: 12, usd: '39.00', note: 'Ahorra 35%' },
    // Plan OCULTO para que el dueño pruebe el cobro real por US$1 (un día de acceso). Solo existe con la clave del dueño:
    // abrir /ordena/?k=CLAVE (se recuerda en ese navegador). La clave se puede cambiar con la variable ORDENA_TEST_KEY de Netlify.
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
    await q(`${table}?on_conflict=${table === 'ordena_orders' ? 'order_id' : 'user_id'}`, { method: 'POST', body: { ...row, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
}
async function one(table, col, val) {
    const rows = await q(`${table}?${col}=eq.${enc(val)}&select=*&limit=1`);
    return rows && rows[0] || null;
}

// ---------- Acceso (plan pagado y frente gratis) ----------
async function getAccess(user) {
    const row = await one('ordena_access', 'user_id', user.id);
    const until = row && row.paid_until ? new Date(row.paid_until) : null;
    // TEMPORAL (prueba de cobro): estas cuentas de administrador se tratan como clientes normales (sin acceso ilimitado).
    // Para devolverles el acceso ilimitado, vaciar la lista.
    const comoCliente = ['bonillapretiz@gmail.com'].includes(String(user.email || '').toLowerCase());
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
const TEST_KEY = process.env.ORDENA_TEST_KEY || 'ordena-fZEeRPX6wxo';
const testKeyOk = (k) => { const a = Buffer.from(String(k || '')), b = Buffer.from(TEST_KEY); return a.length === b.length && crypto.timingSafeEqual(a, b); };
// Planes que puede ver/comprar esta persona: los visibles, más los ocultos si trae la clave del dueño.
const planesPara = (k) => Object.entries(PLANS).filter(([, p]) => !p.hidden || testKeyOk(k));

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

// ¿El error es porque faltan las tablas de Ordena en Supabase (no se corrió supabase/ordena.sql)?
const faltaTabla = (e) => /PGRST205|42P01|does not exist|Could not find the table|schema cache/i.test(String(e && e.message || e));
const MSG_FALTA_TABLA = 'Ordena todavía no está lista: falta crear su base de datos (correr supabase/ordena.sql en Supabase).';

// Evento del servidor ligado a la cuenta (correo en actor_label). Nunca rompe la respuesta si falla.
async function evento(user, nombre, meta) {
    try { await require('./store').logEvent(user.id, 'user', null, 'ordena_' + nombre, meta || {}, user.email || null, 'ordena'); }
    catch (e) { console.error('[ordena] evento', nombre, e.message); }
}

module.exports = { evento, faltaTabla, MSG_FALTA_TABLA, PLANS, testKeyOk, planesPara, json, scrub, scrubOne, countryOf, q, upsert, one, getAccess, extendFrom, requireUser, getUser };
