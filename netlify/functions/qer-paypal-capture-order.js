// Confirma con PayPal (en el servidor, nunca con lo que diga el navegador) que la orden se pagó de verdad, y SOLO
// entonces entrega la lectura completa (el texto vive en el servidor y no viaja al navegador antes de este momento).
// Además manda la lectura por correo al correo que PayPal da del pagador, con copia al dueño (ver _lib/qer-email.js).
const { captureOrder } = require('./_lib/paypal');
const { READING_PRICE_USD } = require('./_lib/qer-pricing');
const { getReading, getReadingIdForOrder, markPaid } = require('./_lib/qer-readings-store');
const { fullView } = require('./_lib/qer-reading-view');
const { deliverReading, isEmail } = require('./_lib/qer-email');
const store = require('./_lib/store');

const APPS = new Set(['quien-eres', 'who-are-you', 'quien-es-tu-pareja', 'who-is-your-partner', 'aptitud']);
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const baseUrl = (event) => String(process.env.URL || (event.headers && (event.headers.origin || (event.headers.host ? 'https://' + event.headers.host : ''))) || '').replace(/\/$/, '');
const mask = (e) => String(e).replace(/^(.).*(@.*)$/, '$1•••$2');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const { orderID } = body;
    const readingId = String(body.readingId || '');
    const app = APPS.has(body.app) ? body.app : 'quien-eres';
    if (!orderID || !readingId) return json(400, { error: 'Solicitud inválida' });

    // La orden tiene que ser la que de verdad se creó PARA esta lectura (ver qer-paypal-create-order.js): nunca se
    // confía en el readingId que mande este mismo request, porque alguien podría mandar el orderID de UN pago real
    // junto con el readingId de la lectura de OTRA persona.
    const linkedReadingId = await getReadingIdForOrder(orderID);
    if (linkedReadingId !== readingId) {
        return json(400, { error: 'Esa orden no corresponde a esta lectura. / This order does not match this reading.' });
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
            return json(402, { error: 'El monto pagado no corresponde al precio de la lectura. / The amount paid does not match the price.' });
        }

        // markPaid reescribe el registro con paid:true: llamarlo dos veces para la misma lectura no tiene efecto distinto.
        const reading = await markPaid(readingId);
        if (!reading) return json(404, { error: 'Esa lectura ya no está disponible. / This reading is no longer available.' });

        const view = fullView(reading);
        const payerEmail = String(order.payer?.email_address || '').trim();
        // Correo que la persona escribió ANTES de pagar (apps con askEmail, p. ej. /aptitud/): tiene prioridad sobre el de PayPal.
        const typedEmail = isEmail(String(body.email || '')) ? String(body.email).trim() : '';
        const toEmail = typedEmail || (isEmail(payerEmail) ? payerEmail : '');
        const link = baseUrl(event) ? `${baseUrl(event)}/${app}/?r=${encodeURIComponent(readingId)}` : '';
        // Correo: mejor esfuerzo. Si falla, la persona ya tiene su lectura en pantalla y el dueño recibe la copia.
        let emailed = false;
        try {
            const sent = await deliverReading({ view, format: reading.format, to: toEmail, link,
                ownerNote: `Pago PayPal de US$${paidAmount} (${app}) · pagador: ${payerEmail || '(PayPal no dio correo)'}${typedEmail ? ' · correo escrito: ' + typedEmail : ''} · lectura ${readingId}` });
            emailed = !!(sent.customer && sent.customer.ok);
            try { await store.logEvent(readingId, 'anon', readingId, 'payment_verified_paypal', { amount: paidAmount, app, payerEmail: payerEmail || null, typedEmail: typedEmail || null, emailedCustomer: emailed, emailedOwner: !!(sent.owner && sent.owner.ok), customerReason: sent.customer && !sent.customer.ok ? sent.customer.reason : undefined }, null, app); } catch (_e) { /* no crítico */ }
        } catch (err) { console.error('[paypal-capture-order] correo', err.message); }

        return json(200, { ...view, emailedTo: emailed ? mask(toEmail) : null, payerEmail: toEmail || null });
    } catch (err) {
        console.error('[paypal-capture-order]', err.message);
        return json(502, { error: 'No se pudo confirmar el pago con PayPal. Si el cargo sí se hizo, escríbenos y te lo resolvemos a mano. / We could not confirm the payment. If you were charged, contact us.' });
    }
};
