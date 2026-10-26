// Estado de cada dispositivo en /significa/ (cuántas definiciones pidió, qué precio de membresía le tocó y hasta cuándo
// está pagada). Reutiliza las tablas que ya existen (qer_readings y qer_orders) con ids prefijados: no hace falta SQL nuevo.
//   qer_readings.id = 'sig:<anonId>'  → reading = { count, price, paidUntil, seen, paidAt }
//   qer_orders.order_id = <orden de PayPal> → reading_id = 'sig:<anonId>'
const FREE = Number(process.env.SIG_FREE || 50);
const PRICES = [2.99, 5.99, 8.99, 11.99, 14.99, 17.99, 20.99];   // 7 precios, de $3 en $3
const DAYS = Number(process.env.SIG_DAYS || 30);

function cfg() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}
const H = (key, extra) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(extra || {}) });
async function sel(table, col, val) {
    const { url, key } = cfg();
    const r = await fetch(`${url}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}&select=*`, { headers: H(key) });
    if (!r.ok) throw new Error(`Supabase ${table} ${r.status}`);
    return (await r.json())[0] || null;
}
async function up(table, row) {
    const { url, key } = cfg();
    const r = await fetch(`${url}/rest/v1/${table}`, { method: 'POST', headers: H(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(row) });
    if (!r.ok) throw new Error(`Supabase ${table} ${r.status}: ${await r.text()}`);
}
const key = (anon) => 'sig:' + String(anon).slice(0, 64);
const cleanAnon = (a) => { const s = String(a || '').slice(0, 64); return /^[\w-]{8,64}$/.test(s) ? s : ''; };

async function getState(anon) {
    const row = await sel('qer_readings', 'id', key(anon));
    const s = (row && row.reading) || {};
    return { count: Number(s.count) || 0, price: PRICES.includes(s.price) ? s.price : null, paidUntil: Number(s.paidUntil) || 0, seen: !!s.seen, paidAt: s.paidAt || null };
}
async function saveState(anon, s) { await up('qer_readings', { id: key(anon), reading: s, paid: !!(s.paidUntil && s.paidUntil > Date.now()) }); }
const isMember = (s) => s.paidUntil > Date.now();
const blocked = (s) => !isMember(s) && s.count >= FREE;
const randomPrice = () => PRICES[Math.floor(Math.random() * PRICES.length)];
const linkOrder = (orderId, anon) => up('qer_orders', { order_id: orderId, reading_id: key(anon) });
async function orderAnon(orderId) { const r = await sel('qer_orders', 'order_id', orderId); return r ? r.reading_id : null; }

module.exports = { FREE, PRICES, DAYS, cleanAnon, key, getState, saveState, isMember, blocked, randomPrice, linkOrder, orderAnon };
