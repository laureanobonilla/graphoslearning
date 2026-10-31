// «jingle-negocio»: firma la subida directa del logo a Cloudinary (privada), igual que cs-sign-upload.
const store = require('./_lib/store');
const cs = require('./_lib/cs-core');
const { json, UUID_RE, ipOf, hashIp } = require('./_lib/jn-core');
const MAX_PER_HOUR = 10;
const LOGO_TYPES = /^image\/(jpeg|jpg|png|webp|svg\+xml|heic|heif)$/i, MAX_LOGO_BYTES = 10 * 1024 * 1024;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const orderId = String(b.orderId || ''), size = Number(b.size) || 0, type = String(b.contentType || '');
    if (!UUID_RE.test(orderId)) return json(400, { error: 'Solicitud inválida' });
    if (!LOGO_TYPES.test(type)) return json(400, { error: 'Suba el logo en formato JPG, PNG, WEBP o SVG.' });
    if (size <= 0 || size > MAX_LOGO_BYTES) return json(400, { error: 'El logo es muy pesado (máximo 10 MB).' });
    if (!cs.cldConfigured()) { console.error('[jn-sign-upload] Cloudinary no configurado'); return json(503, { error: 'La subida del logo no está lista. Puede enviarlo después por WhatsApp.' }); }
    const ipKey = hashIp(ipOf(event));
    try {
        if ((await store.countEventsLastHour(ipKey, 'jn_sign')) >= MAX_PER_HOUR) return json(429, { error: 'Demasiados intentos seguidos. Espere un momento.' });
        await store.logEvent(ipKey, 'anon', orderId, 'jn_sign', { size }, null, 'jingle-negocio');
    } catch (e) { console.error('[jn-sign-upload] límite', e.message); }
    const rnd = require('crypto').randomBytes(4).toString('hex');
    return json(200, cs.signUpload(`jn/${orderId}/logo-${rnd}`));
};
