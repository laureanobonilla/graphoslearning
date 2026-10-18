// «Rinde» (/rinde/): encuentre dónde se le va el dinero a su empresa y recupérelo.
// Piezas compartidas por las funciones rinde-*. Usa las MISMAS variables de entorno que ya tiene Graphikosmos:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV, GEMINI_API_KEY,
//   y opcionalmente RESEND_API_KEY + FEEDBACK_TO_EMAIL (aviso por correo de cada pago).
// Tablas: supabase/rinde.sql (correr UNA vez en Supabase → SQL Editor).
const { getUser } = require('./auth');
const { json, scrub, scrubOne, countryOf } = require('./tc-core');

// >>> EDITA AQUÍ los planes y precios (US$, lo que cobra PayPal). Son pagos únicos: no hay renovación automática. <<<
const PLANS = {
    mes:       { label: '1 mes',   months: 1,  usd: '19.00',  note: 'Para probar a fondo' },
    trimestre: { label: '3 meses', months: 3,  usd: '45.00',  note: 'El más elegido' },
    anio:      { label: '12 meses', months: 12, usd: '149.00', note: 'Ahorra 35%' }
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
    const active = !!(user.isAdmin || (until && until > new Date()));
    return {
        active,
        admin: !!user.isAdmin,
        plan: row && row.plan || null,
        paidUntil: until ? until.toISOString() : null,
        freeFrente: row && row.free_frente || null
    };
}

// Extiende el acceso: si todavía tiene días pagados, se suman al final; si no, desde hoy.
function extendFrom(current, months) {
    const now = new Date();
    const base = current && new Date(current) > now ? new Date(current) : now;
    const d = new Date(base); d.setMonth(d.getMonth() + months);
    return d.toISOString();
}

// Exige sesión de Netlify Identity (la misma de Graphikosmos).
function requireUser(context) {
    const user = getUser(context);
    return user || null;
}

module.exports = { PLANS, json, scrub, scrubOne, countryOf, q, upsert, one, getAccess, extendFrom, requireUser, getUser };
