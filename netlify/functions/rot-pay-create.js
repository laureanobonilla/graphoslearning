// «Rótulo»: crea la orden de PayPal con el precio que fija el servidor. La compra queda ligada a la cuenta que la inició.
const { PLANS, json, userOf } = require('./_lib/rot-core');
const { createOrder } = require('./_lib/paypal');
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const u = userOf(context); if (!u) return json(401, { error: 'Entra a tu cuenta para comprar.', registro: true });
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const plan = PLANS[String(b.plan || '')]; if (!plan) return json(400, { error: 'Plan no válido.' });
    try { return json(200, { orderID: await createOrder(plan.usd.toFixed(2), `rot:${plan.id}:${u.id}`, 'USD') }); }
    catch (e) { console.error('[rot-pay-create]', e.message); return json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' }); }
};
