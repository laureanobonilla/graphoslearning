// Desbloqueo "de confianza" para las apps de pago de "¿Quién eres?" (quien-eres, who-are-you, quien-es-tu-pareja,
// who-is-your-partner). NO verifica el pago: el cliente avisa que subió una foto del SINPE o que tocó el botón de
// PayPal y aquí se marca la lectura como pagada. Es una decisión consciente (sin reclamos, sin redirecciones);
// cada desbloqueo queda en `events` como `payment_unlocked_trust` con el método y el país, para poder comparar
// después con los SINPE y pagos de PayPal reales.
const store = require('./_lib/store');
const { getReading, markPaid } = require('./_lib/qer-readings-store');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = new Set(['sinpe_photo', 'paypal_usd', 'paypal_eur']);
const APPS = new Set(['quien-eres', 'who-are-you', 'quien-es-tu-pareja', 'who-is-your-partner']);
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

function countryOf(event) {
    try {
        const h = event.headers || {};
        const raw = h['x-nf-geo'] || h['X-Nf-Geo'];
        const c = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))?.country?.code : null;
        return c && /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : null;
    } catch (_e) { return null; }
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const readingId = String(body.readingId || '');
    const method = String(body.method || '');
    const app = APPS.has(body.app) ? body.app : 'quien-eres';
    if (!UUID_RE.test(readingId) || !METHODS.has(method)) return json(400, { error: 'Solicitud inválida' });
    try {
        if (!(await getReading(readingId))) return json(404, { error: 'This reading is no longer available. / Esa lectura ya no está disponible.' });
        const reading = await markPaid(readingId);
        if (!reading) return json(404, { error: 'This reading is no longer available. / Esa lectura ya no está disponible.' });
        const meta = { method, country: countryOf(event), clientCountry: String(body.clientCountry || '').slice(0, 2).toUpperCase() || null, shownAmount: String(body.shownAmount || '').slice(0, 30), evidence: (body.evidence && typeof body.evidence === 'object' && JSON.stringify(body.evidence).length < 1200) ? body.evidence : null };
        try { await store.logEvent(readingId, 'anon', readingId, 'payment_unlocked_trust', meta, null, app); }
        catch (err) { console.error('[qer-unlock] evento', err.message); }
        return json(200, {
            paid: true, closingLine: reading.closingLine,
            ...(reading.map ? { mapTexts: reading.map.nodes.map(n => ({ id: n.id, text: n.text })) } : {})
        });
    } catch (err) {
        console.error('[qer-unlock]', err.message);
        return json(502, { error: 'Could not unlock right now. / No se pudo desbloquear en este momento.' });
    }
};
