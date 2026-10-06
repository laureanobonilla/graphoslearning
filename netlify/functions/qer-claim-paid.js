// Desbloqueo por REDIRECCIÓN, para el enlace de pago de PayPal (paypal.com/ncp/links), que no puede enviar
// el código de la lectura ni avisar por IPN. El enlace redirige a  /quien-eres/?pagado=<CLAVE>  después de un
// pago exitoso; la página manda esa clave aquí y, si coincide con PAYPAL_RETURN_TOKEN (variable de entorno,
// solo la conoce quien configura el enlace), la lectura se marca como pagada.
// OJO: esto NO verifica el pago contra PayPal (el enlace no lo permite). Cada desbloqueo queda registrado como
// `payment_unlocked_by_redirect` para poder compararlo luego con los pagos reales del panel de PayPal.
const crypto = require('crypto');
const store = require('./_lib/store');
const { getReading, markPaid } = require('./_lib/qer-readings-store');

// Clave por defecto (la misma que va en la URL de redireccionamiento del enlace de pago). Si se define la variable
// de entorno PAYPAL_RETURN_TOKEN en Netlify, esa tiene prioridad y se puede rotar sin tocar el código.
const DEFAULT_RETURN_TOKEN = 'graphos-7k2m9x4q';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const sameToken = (a, b) => {
    const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
};
async function logEv(readingId, name, metadata) {
    try { await store.logEvent(readingId, 'anon', readingId, name, { ...metadata, source: 'redirect' }, null, 'quien-eres'); }
    catch (err) { console.error('[qer-claim-paid] evento', err.message); }
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const expected = String(process.env.PAYPAL_RETURN_TOKEN || DEFAULT_RETURN_TOKEN);
    if (expected.length < 8) return json(503, { error: 'Desbloqueo por redirección no configurado.' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const readingId = String(body.readingId || '');
    if (!UUID_RE.test(readingId) || !body.token) return json(400, { error: 'Solicitud inválida' });

    if (!sameToken(body.token, expected)) {
        await logEv(readingId, 'payment_redirect_rejected', { reason: 'clave' });
        return json(403, { error: 'Clave no válida.' });
    }
    try {
        if (!(await getReading(readingId))) return json(404, { error: 'Esa lectura ya no está disponible.' });
        const reading = await markPaid(readingId);
        if (!reading) return json(404, { error: 'Esa lectura ya no está disponible.' });
        await logEv(readingId, 'payment_unlocked_by_redirect', {});
        return json(200, {
            paid: true, closingLine: reading.closingLine,
            ...(reading.map ? { mapTexts: reading.map.nodes.map(n => ({ id: n.id, text: n.text })) } : {})
        });
    } catch (err) {
        console.error('[qer-claim-paid]', err.message);
        return json(502, { error: 'No se pudo confirmar en este momento.' });
    }
};
