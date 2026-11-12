// Cobra el aporte ya aprobado y registra el resultado: pagado, o por qué falló.
const { getOrder, captureOrderDetailed } = require('./_lib/paypal');
const core = require('./_lib/apoyo-core');

const FRIENDLY = {
    INSTRUMENT_DECLINED: 'Tu banco rechazó la tarjeta. Prueba con otra tarjeta o con tu cuenta de PayPal.',
    PAYER_ACTION_REQUIRED: 'Falta confirmar el pago con tu banco. Intenta de nuevo.',
    TRANSACTION_REFUSED: 'El pago fue rechazado. Prueba con otra tarjeta.',
    PAYER_CANNOT_PAY: 'PayPal no permitió este pago. Prueba con otra tarjeta.'
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const app = core.cleanApp(body.app), anon = core.cleanAnon(body.anonId), orderID = String(body.orderID || '');
    if (!app || !anon || !/^[A-Z0-9]{8,40}$/.test(orderID)) return core.json(400, { error: 'Solicitud inválida' });
    const country = core.countryOf(event);
    try {
        // La orden tiene que ser de esta página y de este navegador.
        const existing = await getOrder(orderID);
        if (existing?.purchase_units?.[0]?.custom_id !== `${app}|${anon}`) return core.json(400, { error: 'Esa orden no corresponde a este dispositivo.' });

        const r = await captureOrderDetailed(orderID);
        if (!r.ok) {
            await core.log(app, anon, 'pay_failed', { step: 'capture', issue: r.issue, message: String(r.message).slice(0, 300), orderID, country });
            return core.json(402, { error: FRIENDLY[r.issue] || 'No se pudo completar el pago. Intenta de nuevo.', issue: r.issue });
        }
        const order = r.order;
        const cap = order?.purchase_units?.[0]?.payments?.captures?.[0];
        if (order.status !== 'COMPLETED' || !cap || cap.status === 'DECLINED') {
            await core.log(app, anon, 'pay_failed', { step: 'capture', issue: cap?.status || order.status, orderID, country });
            return core.json(402, { error: 'El pago no se completó. Intenta de nuevo.', issue: cap?.status || order.status });
        }
        if (!r.again) {
            await core.log(app, anon, 'pay_completed', {
                amount: cap.amount?.value, currency: cap.amount?.currency_code, orderID, country,
                payerCountry: order.payer?.address?.country_code || null,
                payerName: order.payer?.name?.given_name || null,
                payerEmail: order.payer?.email_address || null,
                pending: cap.status === 'PENDING'
            });
        }
        return core.json(200, { ok: true, amount: cap.amount?.value, currency: cap.amount?.currency_code, pending: cap.status === 'PENDING' });
    } catch (err) {
        console.error('[apoyo-pay-capture]', err.message);
        await core.log(app, anon, 'pay_failed', { step: 'capture_exception', message: String(err.message).slice(0, 300), orderID, country });
        return core.json(502, { error: 'No se pudo confirmar el pago. Si el cargo sí se hizo, escríbenos y te lo resolvemos.' });
    }
};
