// Crea la orden de PayPal que desbloquea UN retrato (el precio lo decide el servidor).
const { createOrder } = require('./_lib/paypal');
const { getReading, linkOrderToReading } = require('./_lib/qer-readings-store');
const store = require('./_lib/store');
const S = require('./_lib/ses-core');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const id = String(body.id || ''); if (!S.ID_RE.test(id)) return json(400, { error: 'Falta el id.' });
    const r = await getReading(id);
    if (!r || !r.ses) return json(404, { error: 'Ese retrato ya no está disponible.' });
    if (r.paid || r.free) return json(409, { error: 'Este retrato ya está abierto.' });
    try {
        const orderID = await createOrder(S.READING_PRICE);
        await linkOrderToReading(orderID, id);
        try { await store.logEvent(id, 'anon', String(body.anonId || id).slice(0, 64), 'ses_paypal_order_created', { id }, null, 'quien-eres-sesion'); } catch (_e) { /* no crítico */ }
        return json(200, { orderID });
    } catch (err) { console.error('[ses-pay-create]', err.message); return json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' }); }
};
