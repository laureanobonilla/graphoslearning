// Crea la orden de PayPal para desbloquear UNA lectura concreta. A
// diferencia de la tienda de nodos de la otra app (que vendía paquetes a
// elegir y necesitaba saber a qué cuenta acreditarlos), aquí no hace falta
// login: el producto es "el resto de esta lectura", identificada por
// readingId, y el precio es siempre el mismo (ver _lib/pricing.js) — así que
// no hay nada que el cliente pueda manipular para pagar menos de lo debido.
const { createOrder } = require('./_lib/paypal');
const { READING_PRICE_USD } = require('./_lib/qer-pricing');
const { getReading, linkOrderToReading } = require('./_lib/qer-readings-store');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const readingId = String(body.readingId || '');
    if (!readingId) return json(400, { error: 'Falta el id de la lectura.' });

    const reading = await getReading(readingId);
    if (!reading) return json(404, { error: 'Esa lectura ya no está disponible — hacé el cuestionario de nuevo.' });
    if (reading.paid) return json(409, { error: 'Esta lectura ya fue desbloqueada.' });

    try {
        const orderID = await createOrder(READING_PRICE_USD);
        // Se guarda la asociación orden↔lectura ANTES de devolver el orderID:
        // es lo que impide, al capturar el pago, que se desbloquee una
        // lectura distinta a la que de verdad se pagó (ver paypal-capture-order.js).
        await linkOrderToReading(orderID, readingId);
        return json(200, { orderID });
    } catch (err) {
        console.error('[paypal-create-order]', err.message);
        return json(502, { error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' });
    }
};
