// Firma una subida directa a Cloudinary (privada) para el audio o la foto de un pedido.
const store = require('./_lib/store');
const core = require('./_lib/cs-core');
const { json, UUID_RE, APPS } = core;
const MAX_PER_HOUR = 10;
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const app = String(b.app || ''), kind = String(b.kind || ''), orderId = String(b.orderId || '');
    if (!APPS[app] || !UUID_RE.test(orderId) || !['audio', 'photo'].includes(kind)) return json(400, { error: 'Solicitud inválida' });
    if (kind === 'audio' && !APPS[app].audio) return json(400, { error: 'Esta página no recibe audio.' });
    if (kind === 'photo' && !APPS[app].video) return json(400, { error: 'Esta página no recibe foto.' });
    const size = Number(b.size) || 0, type = String(b.contentType || '');
    if (kind === 'audio') {
        if (!core.AUDIO_TYPES.test(type)) return json(400, { error: 'Ese formato de audio no se puede usar. Prueba con mp3, m4a, wav o un video mp4.' });
        if (size <= 0 || size > core.MAX_AUDIO_BYTES) return json(400, { error: 'El archivo es muy pesado (máximo 100 MB).' });
    } else {
        if (!core.PHOTO_TYPES.test(type)) return json(400, { error: 'Sube la foto en formato JPG, PNG o WEBP.' });
        if (size <= 0 || size > core.MAX_PHOTO_BYTES) return json(400, { error: 'La foto es muy pesada (máximo 10 MB).' });
    }
    if (!core.cldConfigured()) { console.error('[cs-sign-upload] Cloudinary no configurado'); return json(503, { error: 'El envío de archivos aún no está listo. Intenta más tarde.' }); }
    const ipKey = core.hashIp(core.ipOf(event));
    try {
        if ((await store.countEventsLastHour(ipKey, 'cs_sign')) >= MAX_PER_HOUR) return json(429, { error: 'Demasiados intentos seguidos. Espera un momento y vuelve a intentar.' });
        await store.logEvent(ipKey, 'anon', orderId, 'cs_sign', { app, kind, size }, null, app);
    } catch (e) { console.error('[cs-sign-upload] límite', e.message); }
    const rnd = require('crypto').randomBytes(4).toString('hex');
    return json(200, core.signUpload(`cs/${app}/${orderId}/${kind}-${rnd}`));
};
