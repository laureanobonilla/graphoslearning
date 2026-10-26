// Crea la orden de PayPal de la membresía de /significa/. El monto lo decide el SERVIDOR (el precio que le tocó a ese dispositivo).
const { createOrder } = require('./_lib/paypal');
const sig = require('./_lib/sig-store');
const store = require('./_lib/store');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const aid = sig.cleanAnon(body.anonId);
    if (!aid) return json(400, { error: 'Solicitud inválida' });
    try {
        const st = await sig.getState(aid);
        if (sig.isMember(st)) return json(409, { error: 'Ya tienes la membresía activa.' });
        if (!st.price) return json(400, { error: 'Aún no corresponde pagar.' });
        const orderID = await createOrder(st.price.toFixed(2));
        await sig.linkOrder(orderID, aid);
        try { await store.logEvent(aid, 'anon', aid, 'significa_pay_click', { price: st.price }, null, 'significa'); } catch (_e) { /* no crítico */ }
        return json(200, { orderID, price: st.price });
    } catch (err) {
        console.error('[significa-pay-create]', err.message); try { await store.logEvent(aid, 'anon', aid, 'significa_pay_error', { stage: 'create', message: String(err.message).slice(0, 160) }, null, 'significa'); } catch (_e) { /* no crítico */ }
        return json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' });
    }
};
