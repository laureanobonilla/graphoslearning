// Confirma con PayPal (en el servidor, nunca con lo que diga el navegador)
// que la orden se pagó de verdad, y SOLO entonces devuelve el resto de la
// lectura (los párrafos que estaban guardados en el servidor, nunca
// enviados al navegador hasta este momento — ver generate-reading.js).
const { captureOrder } = require('./_lib/paypal');
const { READING_PRICE_USD } = require('./_lib/qer-pricing');
const { getReading, getReadingIdForOrder, markPaid } = require('./_lib/qer-readings-store');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const { orderID } = body;
    const readingId = String(body.readingId || '');
    if (!orderID || !readingId) return json(400, { error: 'Solicitud inválida' });

    // La orden tiene que ser la que de verdad se creó PARA esta lectura (ver
    // paypal-create-order.js) — nunca se confía en el readingId que mande
    // este mismo request por su cuenta, porque alguien podría mandar el
    // orderID de UN pago real junto con el readingId de la lectura de OTRA
    // persona para desbloquearla gratis.
    const linkedReadingId = await getReadingIdForOrder(orderID);
    if (linkedReadingId !== readingId) {
        return json(400, { error: 'Esa orden no corresponde a esta lectura.' });
    }

    try {
        const order = await captureOrder(orderID);
        if (order.status !== 'COMPLETED') {
            return json(402, { error: `El pago no se completó (estado: ${order.status}).` });
        }

        const captured = order.purchase_units?.[0]?.payments?.captures?.[0];
        const paidAmount = captured?.amount?.value;
        const paidCurrency = captured?.amount?.currency_code;
        if (paidCurrency !== 'USD' || Number(paidAmount) < Number(READING_PRICE_USD) - 0.01) {
            console.error('[paypal-capture-order] monto no coincide', { orderID, paidAmount, paidCurrency });
            return json(402, { error: 'El monto pagado no corresponde al precio de la lectura.' });
        }

        // markPaid simplemente reescribe el registro con paid:true — llamarlo
        // dos veces para la misma lectura (ej. el usuario recarga la página
        // después de pagar) no tiene ningún efecto distinto a llamarlo una
        // vez, así que no hace falta una verificación extra de "ya estaba
        // pagada" para que esto sea seguro de repetir.
        const reading = await markPaid(readingId);
        if (!reading) return json(404, { error: 'Esa lectura ya no está disponible.' });

        return json(200, {
            full: reading.full,
            closingLine: reading.closingLine
        });
    } catch (err) {
        console.error('[paypal-capture-order]', err.message);
        return json(502, { error: 'No se pudo confirmar el pago con PayPal. Si el cargo sí se hizo, escríbenos y te lo resolvemos a mano.' });
    }
};
