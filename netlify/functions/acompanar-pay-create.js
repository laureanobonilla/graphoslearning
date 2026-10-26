// Orden de PayPal del paquete de sesiones de /desahogo/. El monto lo fija el servidor (acp-store).
const { createOrder } = require('./_lib/paypal');
const acp = require('./_lib/acp-store');
const store = require('./_lib/store');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const aid = acp.cleanAnon(body.anonId); if (!aid) return json(400, { error: 'Solicitud inválida' });
    try {
        const orderID = await createOrder(acp.PRICE); await acp.linkOrder(orderID, aid);
        try { await store.logEvent(aid, 'anon', aid, 'acp_pay_click', { price: acp.PRICE }, null, 'desahogo'); } catch (_e) { /* no crítico */ }
        return json(200, { orderID });
    } catch (err) { console.error('[acompanar-pay-create]', err.message); return json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' }); }
};
