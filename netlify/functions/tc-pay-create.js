// «tu-cancion»: crea la orden de PayPal por el precio que fija EL SERVIDOR (US$100, o su equivalente en la moneda del país si PayPal la acepta).
// La orden lleva el código del pedido (custom_id) para reconocerla al cobrar.
const store = require('./_lib/store');
const { json, UUID_RE, countryOf, chargeFor } = require('./_lib/tc-core');
const { createOrder } = require('./_lib/paypal');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const id = String(b.id || ''); if (!UUID_RE.test(id)) return json(400, { error: 'Solicitud inválida' });
    try {
        let n = 0; try { n = await store.countEventsLastHour(id, 'tc_pay_created'); } catch (_e) { /* no crítico */ }
        if (n >= 10) return json(429, { error: 'Demasiados intentos de pago. Espera un rato e inténtalo de nuevo.' });
        const ch = chargeFor(countryOf(event));
        const orderID = await createOrder(ch.value, id, ch.currency);
        try { await store.logEvent(id, 'anon', null, 'tc_pay_created', { orderID, amount: ch.value, currency: ch.currency }, null, 'tu-cancion'); } catch (_e) { /* no crítico */ }
        return json(200, { orderID });
    } catch (e) { console.error('[tc-pay-create]', e.message); return json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' }); }
};
