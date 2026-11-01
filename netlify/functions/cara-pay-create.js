// «¿De qué tienes cara?»: crea la orden de PayPal por el precio del SERVIDOR y la liga a este análisis.
const core = require('./_lib/cara-core');
const { createOrder } = require('./_lib/paypal');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || '');
    if (!core.UUID_RE.test(jobId)) return core.json(400, { error: 'Solicitud inválida' });
    try {
        const job = await core.getJob(jobId);
        if (!job) return core.json(404, { error: 'Ese análisis ya no existe. Sube la foto otra vez.' });
        if (job.paid) return core.json(409, { error: 'Este informe ya está pagado.' });
        const orderID = await createOrder(core.PRICE_USD, jobId);   // el jobId viaja dentro de la orden: sirve de respaldo al cobrar
        await core.saveJob({ id: jobId, paypal_order: orderID });   // ANTES de devolverlo: impide usar un pago ajeno para este informe
        return core.json(200, { orderID });
    } catch (e) { console.error('[cara-pay-create]', e.message); return core.json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' }); }
};
