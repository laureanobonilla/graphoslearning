// Confirma con PayPal (en el servidor) el pago de la membresía de /significa/ y solo entonces activa los días de acceso.
const { captureOrder } = require('./_lib/paypal');
const sig = require('./_lib/sig-store');
const store = require('./_lib/store');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    if (process.env.SIG_PAYPAL !== '1') return json(403, { error: 'El cobro en la app está desactivado por ahora.' });
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const aid = sig.cleanAnon(body.anonId), orderID = String(body.orderID || '');
    if (!aid || !orderID) return json(400, { error: 'Solicitud inválida' });
    try {
        // La orden tiene que ser la creada PARA este dispositivo (nunca se confía solo en lo que mande el request).
        if ((await sig.orderAnon(orderID)) !== sig.key(aid)) return json(400, { error: 'Esa orden no corresponde a este dispositivo.' });
        const st = await sig.getState(aid);
        const order = await captureOrder(orderID);
        if (order.status !== 'COMPLETED') return json(402, { error: `El pago no se completó (estado: ${order.status}).` });
        const cap = order.purchase_units?.[0]?.payments?.captures?.[0];
        if (!cap || cap.amount?.currency_code !== 'USD' || Number(cap.amount.value) < Number(st.price) - 0.01) {
            console.error('[significa-pay-capture] monto no coincide', { orderID, got: cap && cap.amount, want: st.price });
            return json(402, { error: 'El monto pagado no corresponde al precio.' });
        }
        if (!sig.isMember(st)) { st.paidUntil = Date.now() + sig.DAYS * 86400000; st.paidAt = new Date().toISOString(); await sig.saveState(aid, st); }   // repetir la llamada no extiende nada
        try { await store.logEvent(aid, 'anon', aid, 'significa_paid', { price: st.price, amount: cap.amount.value, count: st.count, payerEmail: order.payer?.email_address || null, orderID }, null, 'significa'); } catch (_e) { /* no crítico */ }
        return json(200, { ok: true, days: sig.DAYS });
    } catch (err) {
        console.error('[significa-pay-capture]', err.message); try { await store.logEvent(aid, 'anon', aid, 'significa_pay_error', { stage: 'capture', message: String(err.message).slice(0, 160) }, null, 'significa'); } catch (_e) { /* no crítico */ }
        return json(502, { error: 'No se pudo confirmar el pago. Si el cargo sí se hizo, escríbenos y te lo resolvemos.' });
    }
};
