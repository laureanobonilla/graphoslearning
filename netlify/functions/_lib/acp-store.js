// Estado de cada dispositivo en /desahogo/ (sesiones usadas, créditos, sesión en curso, resumen para continuar y ánimo).
// Reutiliza qer_readings / qer_orders con prefijo 'acp:' (sin SQL nuevo). NUNCA se guarda la conversación completa en `events`.
const FREE = Number(process.env.ACP_FREE || 1);               // sesiones gratis
const PACK = Number(process.env.ACP_PACK || 3);               // sesiones por paquete
const PRICE = String(process.env.ACP_PRICE || '9.99');        // USD por paquete
const MAX_TURNS = 14, WRAP_AT = 11, IDLE_MS = 90 * 60 * 1000;

function cfg() { const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY; if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY'); return { url: url.replace(/\/$/, ''), key }; }
const H = (key, e) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(e || {}) });
async function sel(table, col, val) { const { url, key } = cfg(); const r = await fetch(`${url}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}&select=*`, { headers: H(key) }); if (!r.ok) throw new Error(`Supabase ${table} ${r.status}`); return (await r.json())[0] || null; }
async function up(table, row) { const { url, key } = cfg(); const r = await fetch(`${url}/rest/v1/${table}`, { method: 'POST', headers: H(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(row) }); if (!r.ok) throw new Error(`Supabase ${table} ${r.status}: ${await r.text()}`); }
const key = (a) => 'acp:' + String(a).slice(0, 64);
const cleanAnon = (a) => { const s = String(a || '').slice(0, 64); return /^[\w-]{8,64}$/.test(s) ? s : ''; };
const blank = () => ({ used: 0, credits: 0, cur: null, memory: '', moods: [] });

async function getState(anon) {
    const row = await sel('qer_readings', 'id', key(anon)); const s = Object.assign(blank(), (row && row.reading) || {});
    if (s.cur && Date.now() - (s.cur.last || s.cur.start) > IDLE_MS) s.cur = null;     // sesión abandonada
    return s;
}
const saveState = (anon, s) => up('qer_readings', { id: key(anon), reading: s, paid: s.credits > 0 });
const needsPay = (s) => s.used >= FREE && s.credits <= 0;
const linkOrder = (orderId, anon) => up('qer_orders', { order_id: orderId, reading_id: key(anon) });
async function orderAnon(orderId) { const r = await sel('qer_orders', 'order_id', orderId); return r ? r.reading_id : null; }
async function deleteState(anon) { const { url, key: k } = cfg(); const st = await getState(anon); st.cur = null; st.memory = ''; st.moods = []; await saveState(anon, st); return st; }

module.exports = { FREE, PACK, PRICE, MAX_TURNS, WRAP_AT, cleanAnon, key, getState, saveState, needsPay, linkOrder, orderAnon, deleteState };
