// Aviso automático de pago (IPN) de PayPal para el botón "clásico" (página de PayPal, que sí
// acepta tarjeta como invitado). Cuando alguien paga, PayPal llama a ESTA función desde sus
// servidores con los datos del pago; solo si PayPal confirma que el aviso es auténtico y el pago
// cumple todas las condiciones, se marca la lectura como pagada (qer_readings.paid = true).
//
// Seguridad (nada de esto confía en el navegador):
//   1. Se le devuelve a PayPal el mismo mensaje (cmd=_notify-validate) y solo se sigue si responde VERIFIED.
//   2. payment_status = Completed, moneda USD y monto >= READING_PRICE_USD.
//   3. El pago entró a NUESTRA cuenta (PAYPAL_RECEIVER_EMAIL) — evita avisos de pagos a otro comercio.
//   4. `custom` trae el código de la lectura (UUID) y esa lectura existe.
//   5. txn_id se guarda en qer_orders: un mismo aviso repetido no hace nada distinto.
//
// Variables de entorno: PAYPAL_RECEIVER_EMAIL (el correo de la cuenta de PayPal que cobra),
// PAYPAL_ENV (opcional, "sandbox" para pruebas), READING_PRICE_USD, SUPABASE_*.
// Si algo falla de nuestro lado devolvemos 500 para que PayPal reintente (lo hace durante días).
const store = require('./_lib/store');
const { READING_PRICE_USD } = require('./_lib/qer-pricing');
const { getReading, markPaid, linkOrderToReading, getReadingIdForOrder } = require('./_lib/qer-readings-store');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPN_VERIFY_URL = process.env.PAYPAL_ENV === 'sandbox'
    ? 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr'
    : 'https://ipnpb.paypal.com/cgi-bin/webscr';

const ok = (body = 'OK') => ({ statusCode: 200, body });

async function logIpn(readingId, eventName, metadata) {
    try {
        const id = readingId || 'ipn';
        await store.logEvent(id, 'anon', id, eventName, { ...metadata, source: 'ipn' }, null, 'quien-eres');
    } catch (err) { console.error('[qer-paypal-ipn] no se pudo registrar el evento', err.message); }
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    const params = new URLSearchParams(rawBody);
    const readingId = String(params.get('custom') || '').trim();
    const txnId = String(params.get('txn_id') || '').trim();

    const expectedEmail = String(process.env.PAYPAL_RECEIVER_EMAIL || '').trim().toLowerCase();
    if (!expectedEmail) {
        console.error('[qer-paypal-ipn] falta PAYPAL_RECEIVER_EMAIL');
        return { statusCode: 500, body: 'config' };
    }

    // 1) Que PayPal confirme que el aviso es suyo.
    let verdict;
    try {
        const res = await fetch(IPN_VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'graphoslearning-ipn' },
            body: `cmd=_notify-validate&${rawBody}`
        });
        verdict = (await res.text()).trim();
    } catch (err) {
        console.error('[qer-paypal-ipn] no se pudo validar con PayPal', err.message);
        return { statusCode: 500, body: 'verify' }; // PayPal reintenta
    }
    if (verdict !== 'VERIFIED') {
        await logIpn(UUID_RE.test(readingId) ? readingId : null, 'payment_ipn_rejected', { reason: 'no_verificado', verdict: verdict.slice(0, 40) });
        return ok(); // aviso falso o inválido: no se reintenta
    }

    // 2-4) Condiciones del pago.
    const status = params.get('payment_status');
    const currency = params.get('mc_currency');
    const amount = Number(params.get('mc_gross'));
    const receiver = String(params.get('receiver_email') || params.get('business') || '').trim().toLowerCase();
    const reject = async (reason, extra) => {
        console.error('[qer-paypal-ipn] rechazado:', reason, { txnId, readingId, status, currency, amount, receiver });
        await logIpn(UUID_RE.test(readingId) ? readingId : null, 'payment_ipn_rejected', { reason, txnId, status, currency, amount, ...(extra || {}) });
        return ok();
    };

    if (status !== 'Completed') return reject('estado_' + String(status).toLowerCase().slice(0, 30));
    if (currency !== 'USD') return reject('moneda');
    if (!(amount >= Number(READING_PRICE_USD) - 0.01)) return reject('monto', { esperado: READING_PRICE_USD });
    if (receiver !== expectedEmail) return reject('receptor');
    if (!UUID_RE.test(readingId)) return reject('sin_codigo_de_lectura');
    if (!txnId) return reject('sin_txn_id');

    try {
        const previous = await getReadingIdForOrder(txnId);
        if (previous && previous === readingId) return ok(); // aviso repetido: ya estaba procesado
        const existing = await getReading(readingId);
        if (!existing) return reject('lectura_no_existe');

        await linkOrderToReading(txnId, readingId);
        const reading = await markPaid(readingId);
        if (!reading) return reject('lectura_no_existe');
        await logIpn(readingId, 'payment_captured_success', { via: 'ipn', txnId, amount, paywallVersion: 'read1' });
        return ok();
    } catch (err) {
        console.error('[qer-paypal-ipn]', err.message);
        return { statusCode: 500, body: 'store' }; // PayPal reintenta
    }
};
