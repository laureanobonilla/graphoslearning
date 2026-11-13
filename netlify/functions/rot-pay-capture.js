// «Rótulo»: cobra la orden y, SOLO si PayPal confirmó el cobro por el monto correcto, abona los videos a la cuenta que compró.
// Se puede llamar varias veces con la misma orden: nunca abona dos veces ni cobra dos veces.
const { PLANS, json, sb, newCode, userOf, cuenta } = require('./_lib/rot-core');
const { captureOrder, getOrder } = require('./_lib/paypal');
const { send, OWNER, FROM_OWNER, FROM_CUSTOMER, esc } = require('./_lib/qer-email');
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const u = userOf(context); if (!u) return json(401, { error: 'Entra a tu cuenta para completar la compra.', registro: true });
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const orderID = String(b.orderID || ''); if (!/^[A-Z0-9]{8,40}$/i.test(orderID)) return json(400, { error: 'Solicitud inválida' });
    const done = async () => { const c = await cuenta(u); return json(200, { ok: true, restantes: c.restantes, vence: c.vence }); };
    try {
        const ya = await sb(`/rest/v1/rot_codigos?orden=eq.${orderID}&select=uid&limit=1`); if (ya && ya[0]) return ya[0].uid === u.id ? await done() : json(403, { error: 'Esa orden pertenece a otra cuenta.' });
        const o = await getOrder(orderID), pu = o.purchase_units && o.purchase_units[0], m = /^rot:(\w+):(.+)$/.exec((pu && pu.custom_id) || ''), plan = m && PLANS[m[1]];
        if (!plan) return json(400, { error: 'Esa orden no corresponde a un plan de Rótulo. No se te cobró.' });
        if (m[2] !== u.id) return json(403, { error: 'Esa orden la inició otra cuenta. No se te cobró.' });
        const order = o.status === 'COMPLETED' ? o : await captureOrder(orderID);
        if (order.status !== 'COMPLETED') return json(402, { error: `PayPal no completó el pago (estado: ${order.status}). No se te cobró.` });
        const cap = order.purchase_units[0].payments && order.purchase_units[0].payments.captures && order.purchase_units[0].payments.captures[0];
        const paid = cap && cap.amount ? Number(cap.amount.value) : NaN, cur = cap && cap.amount ? cap.amount.currency_code : '';
        if (!(cur === 'USD' && paid + 0.001 >= plan.usd)) { console.error('[rot-pay-capture] monto inesperado', paid, cur, orderID); return json(409, { error: 'El monto pagado no coincide con el plan. Escríbeme con tu número de orden: ' + orderID }); }
        const vence = plan.dias ? new Date(Date.now() + plan.dias * 864e5).toISOString() : null, payer = (order.payer && order.payer.email_address) || '';
        const row = { codigo: newCode(), uid: u.id, tipo: plan.id, creditos: plan.creditos, vence, email: u.email, orden: orderID, pagado: paid, moneda: cur };
        try { await sb('/rest/v1/rot_codigos', { method: 'POST', body: JSON.stringify(row) }); } catch (e) { const again = await sb(`/rest/v1/rot_codigos?orden=eq.${orderID}&select=uid&limit=1`); if (!(again && again[0])) throw e; }   // otra llamada la abonó primero
        try { await send({ from: FROM_CUSTOMER(), to: u.email, subject: 'Tu compra en Rótulo', html: `<p>¡Gracias por tu compra! Ya tienes <b>${plan.creditos} videos</b> disponibles en tu cuenta (${esc(u.email)}). Entra a Rótulo con ese correo y descarga tus videos.</p><p>Recibo: ${esc(row.codigo)}</p>`, text: `Tu compra en Rótulo quedó abonada a tu cuenta ${u.email}. Recibo ${row.codigo}`, replyTo: OWNER() }); } catch (_e) { /* no crítico: los videos ya están en la cuenta */ }
        try { await send({ from: FROM_OWNER(), to: OWNER(), subject: `💰 Rótulo: ${plan.nombre} (US$${paid})`, html: `<p>${esc(plan.nombre)} · US$${paid}<br>Cuenta: ${esc(u.email)}<br>Pagador PayPal: ${esc(payer)}<br>Orden: ${esc(orderID)}</p>`, text: `${plan.nombre} US$${paid} ${u.email} ${orderID}` }); } catch (_e) { /* no crítico */ }
        return await done();
    } catch (e) { console.error('[rot-pay-capture]', e.message); return json(502, { error: 'No pudimos confirmar tu pago todavía. Si te cobraron, escríbeme con tu comprobante de PayPal y te abono los videos.', reintentar: true }); }
};
