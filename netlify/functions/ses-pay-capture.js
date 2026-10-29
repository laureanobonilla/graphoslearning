// Confirma el pago con PayPal (en el servidor) y SOLO entonces entrega el retrato completo.
const { captureOrder } = require('./_lib/paypal');
const { getReading, getReadingIdForOrder, markPaid } = require('./_lib/qer-readings-store');
const store = require('./_lib/store');
const S = require('./_lib/ses-core');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const { orderID } = body; const id = String(body.id || '');
    if (!orderID || !S.ID_RE.test(id)) return json(400, { error: 'Solicitud inválida' });
    const linked = await getReadingIdForOrder(orderID);
    if (linked !== id) return json(400, { error: 'Esa orden no corresponde a este retrato.' });
    try {
        const order = await captureOrder(orderID);
        if (order.status !== 'COMPLETED') return json(402, { error: `El pago no se completó (estado: ${order.status}).` });
        const cap = order.purchase_units?.[0]?.payments?.captures?.[0];
        if (cap?.amount?.currency_code !== 'USD' || Number(cap?.amount?.value) < Number(S.READING_PRICE) - 0.01) return json(402, { error: 'El monto pagado no corresponde al precio.' });
        const r = await markPaid(id);
        if (!r) return json(404, { error: 'Ese retrato ya no está disponible.' });
        try { await store.logEvent(id, 'anon', String(body.anonId || id).slice(0, 64), 'ses_paid', { id, amount: cap.amount.value, payerEmail: String(order.payer?.email_address || '').slice(0, 120) || null }, null, 'quien-eres-sesion'); } catch (_e) { /* no crítico */ }
        return json(200, S.view(r, true));
    } catch (err) { console.error('[ses-pay-capture]', err.message); return json(502, { error: 'No se pudo confirmar el pago con PayPal. Si el cargo sí se hizo, escríbenos y te lo resolvemos.' }); }
};
