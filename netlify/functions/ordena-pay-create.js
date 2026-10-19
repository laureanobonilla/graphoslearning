// Ordena: crea la orden de PayPal por el precio del plan que decide EL SERVIDOR y la liga a la cuenta.
const core = require('./_lib/ordena-core');
const { createOrder } = require('./_lib/paypal');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const user = core.requireUser(context);
    if (!user) return core.json(401, { error: 'Inicia sesión para activar tu plan.' });
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const planId = String(b.plan || '');
    const plan = core.PLANS[planId];
    if (!plan) return core.json(400, { error: 'Plan no válido' });
    if (plan.hidden && !core.testKeyOk(b.k)) return core.json(400, { error: 'Plan no válido' });   // el plan de prueba solo con la clave del dueño
    try {
        const orderID = await createOrder(plan.usd);
        // Se guarda ANTES de devolverla: es lo que impide usar una orden ajena para activar esta cuenta.
        await core.upsert('ordena_orders', { order_id: orderID, user_id: user.id, email: user.email, plan: planId, usd: Number(plan.usd), status: 'created' });
        return core.json(200, { orderID });
    } catch (e) {
        console.error('[ordena-pay-create]', e.message);
        if (core.faltaTabla(e)) return core.json(503, { error: core.MSG_FALTA_TABLA, message: core.MSG_FALTA_TABLA });
        return core.json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' });
    }
};
