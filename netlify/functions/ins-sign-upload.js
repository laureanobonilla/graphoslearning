// tu-pista: firma la subida directa del audio a Cloudinary (privado).
const store = require('./_lib/store');
const core = require('./_lib/ins-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || ''), size = Number(b.size) || 0, type = String(b.contentType || '');
    if (!core.UUID_RE.test(jobId)) return core.json(400, { error: 'Solicitud inválida' });
    if (!core.AUDIO_TYPES.test(type)) return core.json(400, { error: 'Ese formato no se puede usar. Prueba con mp3, m4a o wav.' });
    if (size <= 0 || size > core.MAX_BYTES) return core.json(400, { error: `El audio es muy pesado (máximo ${Math.round(core.MAX_BYTES / 1048576)} MB).` });
    if (!core.cldConfigured()) { console.error('[ins-sign-upload] Cloudinary no configurado'); return core.json(503, { error: 'El servicio aún no está listo. Intenta más tarde.' }); }
    const ipKey = core.hashIp(core.ipOf(event));
    try {
        if ((await store.countEventsLastHour(ipKey, 'ins_sign')) >= 10) return core.json(429, { error: 'Demasiados intentos seguidos. Espera un momento y vuelve a intentar.' });
        await store.logEvent(ipKey, 'anon', jobId, 'ins_sign', { size }, null, 'tu-pista');
    } catch (e) { console.error('[ins-sign-upload] límite', e.message); }
    return core.json(200, core.signUpload(`ins/${jobId}/audio-${require('crypto').randomBytes(4).toString('hex')}`));
};
