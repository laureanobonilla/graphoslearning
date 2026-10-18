// Destila: crea la orden de PayPal por el precio que fijó el servidor y la liga a este lote.
const core = require('./_lib/dst-core');
const { createOrder } = require('./_lib/paypal');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || '');
    if (!core.UUID_RE.test(jobId)) return core.json(400, { error: 'Solicitud inválida' });
    try {
        const job = await core.getJob(jobId);
        if (!job) return core.json(404, { error: 'No encontramos este lote.' });
        if (job.paid) return core.json(409, { error: 'Ya está pagado.' });
        const orderID = await createOrder(Number(job.price_usd).toFixed(2));
        await core.saveJob({ id: jobId, paypal_order: orderID, paypal_amount_usd: Number(job.price_usd) });   // ANTES de devolverlo: amarra la orden a este lote y su precio
        return core.json(200, { orderID });
    } catch (e) { console.error('[dst-pay-create]', e.message); return core.json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' }); }
};
