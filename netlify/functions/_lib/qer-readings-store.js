// Guarda cada lectura generada (el resultado del cuestionario, ya interpretado
// por Gemini) el tiempo suficiente para que, si la persona paga, el servidor
// pueda entregarle el texto completo sin tener que volver a llamar a la IA
// (que además podría generar algo distinto la segunda vez).
//
// CAMBIO IMPORTANTE respecto a la primera versión: antes esto usaba Netlify
// Blobs (@netlify/blobs), elegido a propósito para no tener que crear ni
// configurar nada además de desplegar. En la práctica, en este sitio
// concreto, Netlify Blobs falló en producción con el error "The environment
// has not been configured to use Netlify Blobs" — un problema del lado de
// Netlify (hay varios reportes iguales en su foro de soporte, de cuentas
// donde Blobs no queda bien aprovisionado), no de este código. En vez de
// seguir depurando a ciegas un servicio de terceros que no está respondiendo
// como documenta, se cambió a guardar esto en **Supabase** — la misma base
// de datos que ya usa Graphikosmos en este sitio, con las mismas variables
// de entorno (SUPABASE_URL, SUPABASE_SERVICE_KEY) ya configuradas, así que
// no hace falta configurar nada nuevo tampoco. Requiere correr
// supabase/schema.sql (trae las tablas `qer_readings` y `qer_orders`).
//
// Las funciones que se usan desde afuera (saveReading, getReading,
// linkOrderToReading, getReadingIdForOrder, markPaid) tienen exactamente la
// misma firma que antes, así que qer-generate-reading.js,
// qer-paypal-create-order.js y qer-paypal-capture-order.js no necesitaron
// ningún cambio.
const TTL_MS = 24 * 60 * 60 * 1000;

function cfg() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}

function authHeaders(key, extra) {
    return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(extra || {}) };
}

async function upsert(table, row) {
    const { url, key } = cfg();
    const res = await fetch(`${url}/rest/v1/${table}`, {
        method: 'POST',
        headers: authHeaders(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(row)
    });
    if (!res.ok) throw new Error(`Supabase ${table} ${res.status}: ${await res.text()}`);
}

async function selectOne(table, idColumn, idValue) {
    const { url, key } = cfg();
    const res = await fetch(`${url}/rest/v1/${table}?${idColumn}=eq.${encodeURIComponent(idValue)}&select=*`, {
        headers: authHeaders(key)
    });
    if (!res.ok) throw new Error(`Supabase ${table} ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    return rows[0] || null;
}

async function saveReading(id, reading) {
    await upsert('qer_readings', { id, reading, paid: false });
}

async function getReading(id) {
    const row = await selectOne('qer_readings', 'id', id);
    if (!row) return null;
    if (Date.now() - new Date(row.created_at).getTime() > TTL_MS) return null;
    return { ...row.reading, paid: row.paid };
}

// Asocia una orden de PayPal con la lectura que se supone que esa orden
// desbloquea — así, al capturar el pago, no basta con que la orden esté
// COMPLETED: también tiene que ser la orden que de verdad se creó PARA esa
// lectura (y no, por ejemplo, el id de la orden de la lectura de otra
// persona, copiado a mano en una llamada directa a la función).
async function linkOrderToReading(orderId, readingId) {
    await upsert('qer_orders', { order_id: orderId, reading_id: readingId });
}

async function getReadingIdForOrder(orderId) {
    const row = await selectOne('qer_orders', 'order_id', orderId);
    if (!row) return null;
    if (Date.now() - new Date(row.created_at).getTime() > TTL_MS) return null;
    return row.reading_id;
}

async function markPaid(id) {
    const { url, key } = cfg();
    const res = await fetch(`${url}/rest/v1/qer_readings?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: authHeaders(key, { Prefer: 'return=representation' }),
        body: JSON.stringify({ paid: true })
    });
    if (!res.ok) throw new Error(`Supabase qer_readings ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    const row = rows[0];
    if (!row) return null;
    return { ...row.reading, paid: row.paid };
}

module.exports = { saveReading, getReading, linkOrderToReading, getReadingIdForOrder, markPaid };
