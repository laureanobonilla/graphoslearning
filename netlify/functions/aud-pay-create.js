// tu-audio: crea la orden de PayPal por el precio fijo del servidor y la liga a este trabajo.
const core = require('./_lib/aud-core');
const { createOrder } = require('./_lib/paypal');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || '');
    if (!core.UUID_RE.test(jobId)) return core.json(400, { error: 'Solicitud inválida' });
    try {
        const job = await core.getJob(jobId);
        if (!job || job.status !== 'ready') return core.json(409, { error: 'Todavía no está listo.' });
        if (job.paid) return core.json(409, { error: 'Ya está pagado.' });
        const orderID = await createOrder(String(job.price_usd));
        await core.saveJob({ id: jobId, paypal_order: orderID });   // ANTES de devolverlo: es lo que impide usar un pago ajeno para este trabajo
        return core.json(200, { orderID });
    } catch (e) { console.error('[aud-pay-create]', e.message); return core.json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' }); }
};
