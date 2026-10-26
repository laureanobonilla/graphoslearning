// Confirma el pago con PayPal en el servidor y SOLO entonces suma las sesiones (una orden se puede acreditar una sola vez).
const { captureOrder } = require('./_lib/paypal');
const acp = require('./_lib/acp-store');
const store = require('./_lib/store');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const aid = acp.cleanAnon(body.anonId), orderID = String(body.orderID || '');
    if (!aid || !orderID) return json(400, { error: 'Solicitud inválida' });
    try {
        if ((await acp.orderAnon(orderID)) !== acp.key(aid)) return json(400, { error: 'Esa orden no corresponde a este dispositivo.' });
        const st = await acp.getState(aid);
        if ((st.paidOrders || []).includes(orderID)) return json(200, { ok: true, credits: st.credits, again: true });
        const order = await captureOrder(orderID);
        if (order.status !== 'COMPLETED') return json(402, { error: `El pago no se completó (estado: ${order.status}).` });
        const cap = order.purchase_units?.[0]?.payments?.captures?.[0];
        if (!cap || cap.amount?.currency_code !== 'USD' || Number(cap.amount.value) < Number(acp.PRICE) - 0.01) return json(402, { error: 'El monto pagado no corresponde al precio.' });
        st.paidOrders = (st.paidOrders || []).concat(orderID).slice(-20); st.credits += acp.PACK; await acp.saveState(aid, st);
        try { await store.logEvent(aid, 'anon', aid, 'acp_paid', { amount: cap.amount.value, sessions: acp.PACK, payerEmail: order.payer?.email_address || null, orderID }, null, 'desahogo'); } catch (_e) { /* no crítico */ }
        return json(200, { ok: true, credits: st.credits });
    } catch (err) { console.error('[acompanar-pay-capture]', err.message); return json(502, { error: 'No se pudo confirmar el pago. Si el cargo sí se hizo, escríbenos y te lo resolvemos.' }); }
};
