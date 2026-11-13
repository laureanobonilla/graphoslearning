// «Rótulo»: cobra la orden y, SOLO si PayPal confirmó el cobro por el monto correcto, crea el código de acceso.
// Se puede llamar varias veces con la misma orden: devuelve el mismo código (nunca crea dos ni cobra dos veces).
const { PLANS, json, sb, newCode } = require('./_lib/rot-core');
const { captureOrder, getOrder } = require('./_lib/paypal');
const { send, OWNER, FROM_OWNER, FROM_CUSTOMER, esc } = require('./_lib/qer-email');
const view = (c) => ({ ok: true, codigo: c.codigo, tipo: c.tipo, restantes: Math.max(0, c.creditos - c.usados), vence: c.vence });
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const orderID = String(b.orderID || ''); if (!/^[A-Z0-9]{8,40}$/i.test(orderID)) return json(400, { error: 'Solicitud inválida' });
    try {
        const ya = await sb(`/rest/v1/rot_codigos?orden=eq.${orderID}&select=*&limit=1`); if (ya && ya[0]) return json(200, view(ya[0]));
        const o = await getOrder(orderID), pu = o.purchase_units && o.purchase_units[0], m = /^rot:(\w+)$/.exec((pu && pu.custom_id) || ''), plan = m && PLANS[m[1]];
        if (!plan) return json(400, { error: 'Esa orden no corresponde a un plan de Rótulo. No se te cobró.' });
        const order = o.status === 'COMPLETED' ? o : await captureOrder(orderID);
        if (order.status !== 'COMPLETED') return json(402, { error: `PayPal no completó el pago (estado: ${order.status}). No se te cobró.` });
        const cap = order.purchase_units[0].payments && order.purchase_units[0].payments.captures && order.purchase_units[0].payments.captures[0];
        const paid = cap && cap.amount ? Number(cap.amount.value) : NaN, cur = cap && cap.amount ? cap.amount.currency_code : '';
        if (!(cur === 'USD' && paid + 0.001 >= plan.usd)) { console.error('[rot-pay-capture] monto inesperado', paid, cur, orderID); return json(409, { error: 'El monto pagado no coincide con el plan. Escríbeme con tu número de orden: ' + orderID }); }
        const payer = (order.payer && order.payer.email_address) || '', vence = plan.dias ? new Date(Date.now() + plan.dias * 864e5).toISOString() : null;
        const row = { codigo: newCode(), tipo: plan.id, creditos: plan.creditos, vence, email: payer || null, orden: orderID, pagado: paid, moneda: cur };
        let c; try { c = (await sb('/rest/v1/rot_codigos', { method: 'POST', body: JSON.stringify(row) }))[0]; }
        catch (e) { const again = await sb(`/rest/v1/rot_codigos?orden=eq.${orderID}&select=*&limit=1`); if (again && again[0]) return json(200, view(again[0])); throw e; }   // otra llamada la creó primero
        const msg = `Tu código de Rótulo: ${c.codigo}`;
        if (payer) { try { await send({ from: FROM_CUSTOMER(), to: payer, subject: 'Tu código de Rótulo', html: `<p>¡Gracias por tu compra! Tu código es:</p><p style="font:800 24px monospace">${esc(c.codigo)}</p><p>${esc(plan.detalle)} Pégalo en Rótulo (“Ya tengo un código”). Guarda este correo.</p>`, text: msg, replyTo: OWNER() }); } catch (_e) { /* no crítico: el código ya se mostró en pantalla */ } }
        try { await send({ from: FROM_OWNER(), to: OWNER(), subject: `💰 Rótulo: ${plan.nombre} (US$${paid})`, html: `<p>${esc(plan.nombre)} · US$${paid}<br>Pagador: ${esc(payer)}<br>Orden: ${esc(orderID)}<br>Código: ${esc(c.codigo)}</p>`, text: `${plan.nombre} US$${paid} ${payer} ${c.codigo}` }); } catch (_e) { /* no crítico */ }
        return json(200, view(c));
    } catch (e) { console.error('[rot-pay-capture]', e.message); return json(502, { error: 'No pudimos confirmar tu pago todavía. Si te cobraron, escríbeme con tu comprobante de PayPal y te doy tu código.', reintentar: true }); }
};
