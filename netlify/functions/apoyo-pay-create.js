// Crea la orden de PayPal de un aporte voluntario (monto elegido por la persona, validado aquí).
const { createOrder } = require('./_lib/paypal');
const core = require('./_lib/apoyo-core');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const app = core.cleanApp(body.app), anon = core.cleanAnon(body.anonId), amount = core.cleanAmount(body.amount);
    if (!app || !anon) return core.json(400, { error: 'Solicitud inválida' });
    if (!amount) return core.json(400, { error: `El monto debe estar entre $${core.MIN_USD} y $${core.MAX_USD}.` });
    const country = core.countryOf(event);
    try {
        const orderID = await createOrder(amount, `${app}|${anon}`);
        await core.log(app, anon, 'pay_order_created', { amount, orderID, country });
        return core.json(200, { orderID });
    } catch (err) {
        console.error('[apoyo-pay-create]', err.message);
        await core.log(app, anon, 'pay_failed', { step: 'create', amount, country, message: String(err.message).slice(0, 300) });
        return core.json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' });
    }
};
