// «Licitaciones»: crea la orden de PayPal por el precio que fija EL SERVIDOR (lic-core.PRICE_USD), en la moneda del país si PayPal la acepta.
const { json, UUID_RE, countryOf, chargeFor, getJob } = require('./_lib/lic-core');
const { createOrder } = require('./_lib/paypal');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const id = String(b.id || ''); if (!UUID_RE.test(id)) return json(400, { error: 'Solicitud inválida' });
    try {
        const job = await getJob(id); if (!job) return json(404, { error: 'No encontré ese análisis.' });
        if (job.status === 'pagado') return json(200, { already: true });
        if (!job.preview || !job.preview.valido) return json(400, { error: 'Primero hay que leer un cartel válido.' });
        const ch = chargeFor(countryOf(event) || job.country);
        return json(200, { orderID: await createOrder(ch.value, id, ch.currency) });
    } catch (e) { console.error('[lic-pay-create]', e.message); return json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' }); }
};
