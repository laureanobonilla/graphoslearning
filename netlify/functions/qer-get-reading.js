// Recupera una lectura YA PAGADA. Existe para un solo caso: alguien paga,
// pero pierde la conexión o recarga la página justo después de pagar, antes
// de que el navegador llegue a mostrar el texto completo que devolvió
// paypal-capture-order.js. Sin esto, esa persona pagó de verdad pero no
// tiene forma de volver a ver lo que compró — tendría que escribir a pedir
// que se lo resuelvan a mano. Con esto, basta con que vuelva a abrir el
// link (ver resumePendingReadingIfAny en app.js) dentro de las 24h.
//
// Solo entrega el texto completo si `paid` es true en el servidor — nunca
// confía en nada que diga el navegador sobre si pagó o no (mismo principio
// que el resto de esta app). El único "secreto" que hace falta para pedir
// esto es el propio readingId (un UUID), que ya actúa como el único control
// de acceso de toda la app (igual que paypal-capture-order.js) — no hay
// cuentas ni contraseñas que agregar encima.
const { getReading } = require('./_lib/qer-readings-store');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const readingId = String(body.readingId || '');
    if (!readingId) return json(400, { error: 'Falta readingId' });

    try {
        const reading = await getReading(readingId);
        if (!reading) return json(404, { error: 'Esa lectura ya no está disponible (pasaron más de 24h).' });

        if (!reading.paid) {
            // No pagó (o el pago no se confirmó) — no se entrega nada más que
            // lo que ya tenía gratis desde el principio.
            return json(200, { paid: false });
        }

        return json(200, { paid: true, full: reading.full, closingLine: reading.closingLine });
    } catch (err) {
        console.error('[get-reading]', err.message);
        return json(502, { error: 'No se pudo recuperar tu lectura en este momento.' });
    }
};
