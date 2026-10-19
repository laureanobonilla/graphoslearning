// Rinde: crea la orden de PayPal por el precio del plan que decide EL SERVIDOR y la liga a la cuenta.
const core = require('./_lib/rinde-core');
const { createOrder } = require('./_lib/paypal');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const user = core.requireUser(context);
    if (!user) return core.json(401, { error: 'Inicie sesión para activar su plan.' });
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const planId = String(b.plan || '');
    if (!core.PLANS[planId]) return core.json(400, { error: 'Plan no válido' });
    if (core.PLANS[planId].hidden && !core.testKeyOk(b.k)) return core.json(400, { error: 'Plan no válido' });   // el plan de prueba solo con la clave del dueño
    try {
        const nivel = await core.nivelCuenta(user, b.nivel);
        const plan = core.planNivel(planId, nivel);
        const orderID = await createOrder(plan.usd);
        // Se guarda ANTES de devolverla: es lo que impide usar una orden ajena para activar esta cuenta.
        await core.upsert('rinde_orders', { order_id: orderID, user_id: user.id, email: user.email, plan: planId, usd: Number(plan.usd), status: 'created' });   // el monto queda fijado en la orden
        await core.evento(user, 'srv_orden_creada', { plan: planId, usd: Number(plan.usd), nivel, orderID });
        return core.json(200, { orderID, usd: plan.usd, nivel });
    } catch (e) {
        console.error('[rinde-pay-create]', e.message);
        return core.json(502, { error: 'No se pudo iniciar el pago. Intente de nuevo en un momento.' });
    }
};
