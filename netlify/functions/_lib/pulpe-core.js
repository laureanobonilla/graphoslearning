// «La Pulpe» (/pulpe/): juego de administrar una pulpería tica. Piezas compartidas por las funciones pulpe-*.
// Usa las MISMAS variables de entorno que el resto del sitio: SUPABASE_URL, SUPABASE_SERVICE_KEY, PAYPAL_CLIENT_ID,
// PAYPAL_CLIENT_SECRET, PAYPAL_ENV y opcionalmente RESEND_API_KEY + FEEDBACK_TO_EMAIL (aviso de cada pago).
// Tablas: supabase/pulpe.sql (correr UNA vez en Supabase → SQL Editor).
const crypto = require('crypto');
const { getUser } = require('./auth');
const { json, scrub, scrubOne, countryOf } = require('./tc-core');

// >>> EDITA AQUÍ el precio del pase (US$, lo que cobra PayPal). Pago único, para siempre. <<<
const PLANS = {
    pase:   { label: 'Pase de dueño', forever: true, usd: '3.99', note: 'Para siempre · temporada completa, 3 barrios y modo libre' },
    // Plan OCULTO para probar el cobro real por US$1. Solo con la clave del dueño: abrir /pulpe/?k=CLAVE.
    prueba: { label: 'Prueba del dueño', forever: true, usd: '1.00', note: 'Solo con tu clave', hidden: true }
};
const FREE_DAYS = 7;   // días que se juegan sin pase (la «semana de prueba»)

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
    await q(`${table}?on_conflict=${table === 'pulpe_orders' ? 'order_id' : 'user_id'}`, { method: 'POST', body: { ...row, updated_at: new Date().toISOString() }, prefer: 'resolution=merge-duplicates,return=minimal' });
}
async function one(table, col, val) {
    const rows = await q(`${table}?${col}=eq.${enc(val)}&select=*&limit=1`);
    return rows && rows[0] || null;
}

async function getAccess(user) {
    const row = await one('pulpe_access', 'user_id', user.id);
    const until = row && row.paid_until ? new Date(row.paid_until) : null;
    const admin = !!user.isAdmin;
    return { active: !!(admin || (until && until > new Date())), admin, plan: row && row.plan || null };
}

const TEST_KEY = process.env.PULPE_TEST_KEY || 'pulpe-Q7mWz3rTx9';
const testKeyOk = (k) => { const a = Buffer.from(String(k || '')), b = Buffer.from(TEST_KEY); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const planesPara = (k) => Object.entries(PLANS).filter(([, p]) => !p.hidden || testKeyOk(k));
const FOREVER = '2099-12-31T23:59:59.000Z';

function requireUser(context) { return getUser(context) || null; }
const faltaTabla = (e) => /PGRST205|42P01|does not exist|Could not find the table|schema cache/i.test(String(e && e.message || e));
const MSG_FALTA_TABLA = 'La Pulpe todavía no está lista: falta crear su base de datos (correr supabase/pulpe.sql en Supabase).';

async function evento(user, nombre, meta) {
    try { await require('./store').logEvent(user.id, 'user', null, 'pulpe_' + nombre, meta || {}, user.email || null, 'pulpe'); }
    catch (e) { console.error('[pulpe] evento', nombre, e.message); }
}

module.exports = { evento, faltaTabla, MSG_FALTA_TABLA, PLANS, FREE_DAYS, FOREVER, testKeyOk, planesPara, json, scrub, scrubOne, countryOf, q, upsert, one, getAccess, requireUser, getUser };
