// PÁGINA DE PRUEBA DEL DUEÑO (/quien-eres/prueba/): en vez de pagar, genera/arma la lectura completa y la manda a
// bonillapretiz@gmail.com (FEEDBACK_TO_EMAIL). NO marca nada como pagado y, sin la clave de pruebas, tampoco
// devuelve el texto al navegador: es una página pública, así que no puede servir de desbloqueo gratis.
// Clave opcional: variable QER_TEST_KEY en Netlify + abrir la página con ?k=ESA_CLAVE. Con clave válida la página
// también muestra el desbloqueo completo (todo lo que vería quien pagó).
const { getReading } = require('./_lib/qer-readings-store');
const { fullView } = require('./_lib/qer-reading-view');
const { deliverReading, OWNER } = require('./_lib/qer-email');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPS = new Set(['quien-eres', 'who-are-you', 'quien-es-tu-pareja', 'who-is-your-partner']);
const MAX_PER_HOUR = 12;
let windowStart = Date.now(), count = 0; // por instancia: freno básico contra abuso
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const baseUrl = (event) => String(process.env.URL || (event.headers && (event.headers.origin || (event.headers.host ? 'https://' + event.headers.host : ''))) || '').replace(/\/$/, '');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const readingId = String(body.readingId || '');
    const app = APPS.has(body.app) ? body.app : 'quien-eres';
    if (!UUID_RE.test(readingId)) return json(400, { error: 'Solicitud inválida' });
    const needKey = String(process.env.QER_TEST_KEY || '');
    const keyOk = !!needKey && String(body.key || '') === needKey;
    if (needKey && body.key && !keyOk) return json(403, { error: 'Clave de pruebas incorrecta' });
    if (Date.now() - windowStart > 3600 * 1000) { windowStart = Date.now(); count = 0; }
    if (++count > MAX_PER_HOUR) return json(429, { error: 'Demasiados envíos de prueba en esta hora.' });
    try {
        const reading = await getReading(readingId);
        if (!reading || !reading.map) return json(404, { error: 'Esa lectura ya no está disponible.' });
        const view = fullView(reading);
        const link = baseUrl(event) ? `${baseUrl(event)}/${app}/?r=${encodeURIComponent(readingId)}` : '';
        const out = await deliverReading({ view, format: reading.format, to: '', link, ownerNote: `PRUEBA (${app}) · sin pago · lectura ${readingId}` });
        const ok = !!(out.owner && out.owner.ok);
        return json(200, { ok, to: OWNER(), reason: ok ? undefined : (out.owner && out.owner.reason) || 'send_failed', ...(keyOk ? { unlocked: view } : {}) });
    } catch (err) {
        console.error('[qer-owner-send]', err.message);
        return json(502, { error: 'No se pudo armar el envío de prueba.' });
    }
};
