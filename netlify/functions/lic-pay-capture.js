// «Licitaciones»: cobra la orden y, SOLO si PayPal confirmó el cobro, desbloquea el análisis. Se puede llamar varias veces sin cobrar dos veces.
// Si PayPal cobró pero el monto no coincide, se desbloquea igual y se marca con una alerta (para que lo revises en lic_jobs.pay).
const { json, UUID_RE, countryOf, chargeFor, sb, getJob } = require('./_lib/lic-core');
const { captureOrder, getOrder } = require('./_lib/paypal');
const { send, OWNER, FROM_OWNER, FROM_CUSTOMER, esc } = require('./_lib/qer-email');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const id = String(b.id || ''), orderID = String(b.orderID || '');
    if (!UUID_RE.test(id) || !/^[A-Z0-9]{8,40}$/i.test(orderID)) return json(400, { error: 'Solicitud inválida' });
    try {
        const job = await getJob(id); if (!job) return json(404, { error: 'No encontré ese análisis.' });
        if (job.status === 'pagado') return json(200, { ok: true, already: true });
        const o = await getOrder(orderID), pu = o.purchase_units && o.purchase_units[0];
        if (!pu || pu.custom_id !== id) return json(400, { error: 'Esa orden no corresponde a este análisis. No se te cobró.' });
        const order = o.status === 'COMPLETED' ? o : await captureOrder(orderID);
        if (order.status !== 'COMPLETED') return json(402, { error: `PayPal no completó el pago (estado: ${order.status}). No se te cobró.` });
        const cap = order.purchase_units && order.purchase_units[0] && order.purchase_units[0].payments && order.purchase_units[0].payments.captures && order.purchase_units[0].payments.captures[0];
        const paid = cap && cap.amount ? Number(cap.amount.value) : NaN, cur = cap && cap.amount ? cap.amount.currency_code : '';
        const exp = chargeFor(countryOf(event) || job.country);
        const flag = !cap ? 'no se pudo leer el monto' : (cur !== exp.currency || paid + 0.01 < Number(exp.value)) ? `monto distinto del esperado (${exp.text})` : '';
        const payer = (order.payer && order.payer.email_address) || '';
        await sb(`/rest/v1/lic_jobs?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'pagado', paid_at: new Date().toISOString(), pay: { orderID, amount: paid, currency: cur, payer, flag } }) });
        // Avisos (no críticos: si fallan, el análisis ya quedó desbloqueado)
        const link = `${process.env.URL || 'https://graphoslearning.netlify.app'}/licitaciones/?id=${id}`;
        try { await send({ from: FROM_OWNER(), to: OWNER(), subject: `💰 Licitaciones: pago de ${paid} ${cur}${flag ? ' ⚠ ' + flag : ''}`, html: `<p>Se pagó el análisis de <b>${esc(job.filename)}</b> (${esc(job.country || '?')}).</p><p>Pagador: ${esc(payer)}<br>Orden: ${esc(orderID)}</p>${flag ? `<p><b>⚠ ${esc(flag)}</b></p>` : ''}<p><a href="${link}">Ver el análisis</a></p>`, text: `Pago ${paid} ${cur}. ${job.filename}. ${payer}. ${link}` }); } catch (_e) { /* ya está en la base */ }
        if (job.email) { try { await send({ from: FROM_CUSTOMER(), to: job.email, subject: 'Tu análisis de licitación está listo', html: `<p>Gracias por tu compra. Tu análisis completo de <b>${esc(job.filename)}</b> queda guardado en este enlace (guárdalo):</p><p><a href="${link}">${link}</a></p><p>Recuerda que es una herramienta de apoyo: verifica todo contra el cartel oficial antes de presentar tu oferta.</p>`, text: `Tu análisis completo: ${link}`, replyTo: OWNER() }); } catch (_e) { /* no crítico */ } }
        return json(200, { ok: true });
    } catch (e) { console.error('[lic-pay-capture]', e.message); return json(502, { error: 'No pudimos confirmar tu pago todavía. Si te cobraron, tu análisis se desbloqueará; recarga en un momento o escríbeme.', reintentar: true }); }
};
