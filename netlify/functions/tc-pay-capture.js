// «tu-cancion»: cobra (captura) la orden y, SOLO si el cobro se completó, te manda el correo con el pedido (tc-song-request.run).
// REGLA DE ORO: si PayPal cobró, el pedido te llega siempre (aunque el monto no coincida: se marca con ⚠). Se puede llamar varias veces sin cobrar dos veces ni mandar dos correos.
const store = require('./_lib/store');
const { json, UUID_RE, countryOf, chargeFor, scrubOne } = require('./_lib/tc-core');
const { captureOrder, getOrder } = require('./_lib/paypal');
const { run } = require('./tc-song-request');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const id = String(b.id || ''), orderID = String(b.orderID || '');
    if (!UUID_RE.test(id) || !/^[A-Z0-9]{8,40}$/i.test(orderID)) return json(400, { error: 'Solicitud inválida' });
    try {
        let sent = 0; try { sent = await store.countEventsLastHour(id, 'tc_request_sent'); } catch (_e) { /* sigue */ }
        if (sent > 0) return json(200, { ok: true, already: true });
        const o = await getOrder(orderID);
        const pu = o.purchase_units && o.purchase_units[0];
        if (!pu || pu.custom_id !== id) return json(400, { error: 'Esa orden no corresponde a este pedido. No se te cobró.' });
        const order = o.status === 'COMPLETED' ? o : await captureOrder(orderID);
        if (order.status !== 'COMPLETED') return json(402, { error: `PayPal no completó el pago (estado: ${order.status}). No se te cobró.` });
        const cap = order.purchase_units && order.purchase_units[0] && order.purchase_units[0].payments && order.purchase_units[0].payments.captures && order.purchase_units[0].payments.captures[0];
        const paid = cap && cap.amount ? Number(cap.amount.value) : NaN, cur = cap && cap.amount ? cap.amount.currency_code : '';
        const exp = chargeFor(countryOf(event));
        const flag = !cap ? 'no se pudo leer el monto' : (cur !== exp.currency || paid + 0.01 < Number(exp.value)) ? `monto distinto del esperado (${exp.text})` : '';
        if (flag) console.error('[tc-pay-capture] ', flag, orderID, cur, paid);
        const text = cap ? `${paid} ${cur}` : '(monto desconocido)';
        const payer = (order.payer && order.payer.email_address) || '';
        try { await store.logEvent(id, 'anon', null, 'tc_paid', { orderID, amount: paid, currency: cur, payer, email: String(b.email || '').slice(0, 120), flag }, null, 'tu-cancion'); } catch (e) { console.error('[tc-pay-capture] evento', e.message); }
        const r = await run(event, b, { orderID, text, payer: scrubOne(payer, 120), flag });
        if (r.statusCode >= 400) {   // ya cobró: no se le dice al cliente que falló; queda en el evento tc_paid con su correo y en los logs
            console.error('[tc-pay-capture] COBRADO pero el correo/registro falló', orderID, r.statusCode, r.body);
            try { await store.logEvent(id, 'anon', null, 'tc_paid_email_failed', { orderID, status: r.statusCode, email: String(b.email || '').slice(0, 120) }, null, 'tu-cancion'); } catch (_e) { /* ya está en logs */ }
        }
        return json(200, { ok: true });
    } catch (e) { console.error('[tc-pay-capture]', e.message); return json(502, { error: 'No pudimos confirmar tu pago todavía. Si te cobraron, no te preocupes: escríbeme por WhatsApp y lo resuelvo.', reintentar: true }); }
};
