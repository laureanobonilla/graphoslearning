// «Envíamela por correo»: manda la lectura YA PAGADA (el servidor lo comprueba) a un correo que la persona escribe.
// Sirve sobre todo para quien pagó por SINPE (no hay correo de PayPal) o quiere otra dirección. Limitado a pocos
// envíos por lectura para que no sirva de cañón de correo a terceros.
const { getReading } = require('./_lib/qer-readings-store');
const { fullView } = require('./_lib/qer-reading-view');
const { deliverReading, isEmail } = require('./_lib/qer-email');
const store = require('./_lib/store');

const APPS = new Set(['quien-eres', 'who-are-you', 'quien-es-tu-pareja', 'who-is-your-partner']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PER_READING = 4;
const sent = new Map(); // por instancia de la función: freno básico, no un contador exacto
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const baseUrl = (event) => String(process.env.URL || (event.headers && (event.headers.origin || (event.headers.host ? 'https://' + event.headers.host : ''))) || '').replace(/\/$/, '');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const readingId = String(body.readingId || '');
    const email = String(body.email || '').trim();
    const app = APPS.has(body.app) ? body.app : 'quien-eres';
    if (!UUID_RE.test(readingId) || !isEmail(email)) return json(400, { error: 'invalid_email' });
    if ((sent.get(readingId) || 0) >= MAX_PER_READING) return json(429, { error: 'too_many' });
    try {
        const reading = await getReading(readingId);
        if (!reading || !reading.paid) return json(403, { error: 'not_paid' });
        sent.set(readingId, (sent.get(readingId) || 0) + 1);
        const link = baseUrl(event) ? `${baseUrl(event)}/${app}/?r=${encodeURIComponent(readingId)}` : '';
        const out = await deliverReading({ view: fullView(reading), format: reading.format, to: email, link, ownerNote: `Copia pedida desde la página (${app}) · lectura ${readingId}` });
        try { await store.logEvent(readingId, 'anon', readingId, 'reading_emailed', { app, ok: !!(out.customer && out.customer.ok), reason: out.customer && !out.customer.ok ? out.customer.reason : undefined }, null, app); } catch (_e) { /* no crítico */ }
        // Si la entrega al cliente falló pero la copia al dueño sí salió, se avisa con claridad (el dueño la reenvía).
        return json(200, { ok: !!(out.customer && out.customer.ok), ownerCopy: !!(out.owner && out.owner.ok), reason: out.customer && !out.customer.ok ? out.customer.reason : undefined });
    } catch (err) {
        console.error('[qer-email-reading]', err.message);
        return json(502, { error: 'send_failed' });
    }
};
