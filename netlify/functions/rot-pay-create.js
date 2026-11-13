// «Rótulo»: crea la orden de PayPal con el precio que fija el servidor.
const { PLANS, json } = require('./_lib/rot-core');
const { createOrder } = require('./_lib/paypal');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const plan = PLANS[String(b.plan || '')]; if (!plan) return json(400, { error: 'Plan no válido.' });
    try { return json(200, { orderID: await createOrder(plan.usd.toFixed(2), 'rot:' + plan.id, 'USD') }); }
    catch (e) { console.error('[rot-pay-create]', e.message); return json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' }); }
};
