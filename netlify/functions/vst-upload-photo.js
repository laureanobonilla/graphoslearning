// Sube UNA foto en cuanto la persona la elige (no al final), para que no se pierda si algo falla
// después. Va a Cloudinary como privada y deja registrada la ruta en `vst_sessions`.
// Sin sessionId crea la sesión y devuelve el id (que luego usa la generación como readingId).
const crypto = require('crypto');
const cld = require('./_lib/vst-cloudinary');
const { getSession, saveSession, updateSession } = require('./_lib/vst-store');
const { SLOTS, MAX_PHOTO_B64, UUID_RE, json } = require('./_lib/vst-core');

const JPEG_PREFIX = 'data:image/jpeg;base64,';

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    if (body.consent !== true || body.adult !== true) return json(400, { error: 'Hace falta confirmar que tienes 18 años o más y aceptar el uso de tus fotos.' });
    const slot = String(body.slot || '');
    if (!SLOTS.includes(slot)) return json(400, { error: 'Foto no reconocida.' });
    const photo = body.photo;
    if (typeof photo !== 'string' || !photo.startsWith(JPEG_PREFIX + '/9j/') || photo.length - JPEG_PREFIX.length > MAX_PHOTO_B64) return json(400, { error: 'La foto no tiene un formato válido.' });
    if (!cld.isConfigured()) { console.error('[vst-upload] Cloudinary no configurado'); return json(500, { error: 'El servicio de fotos aún no está configurado. Vuelve más tarde.' }); }

    let sessionId = body.sessionId ? String(body.sessionId) : null;
    if (sessionId && !UUID_RE.test(sessionId)) return json(400, { error: 'Sesión no válida.' });
    try {
        let session = sessionId ? await getSession(sessionId) : null;
        if (sessionId && !session) sessionId = null; // id desconocido: se empieza una sesión nueva
        if (session && session.deleted_reason === 'blocked') return json(403, { error: 'Esta sesión fue cerrada. Empieza de nuevo.', blocked: true });
        if (!sessionId) sessionId = crypto.randomUUID();

        const publicId = `vestirte/${sessionId}/${slot}`;
        try { await cld.uploadPrivate(photo, publicId); } catch { await cld.uploadPrivate(photo, publicId); } // un reintento

        const photos = (session && Array.isArray(session.photos) ? session.photos : []).filter(x => x.slot !== slot).concat({ slot, public_id: publicId });
        const answers = Array.isArray(body.answers) ? body.answers.slice(0, 20).map(a => ({ question: String(a?.question || '').slice(0, 300), answer: String(a?.answer || '').slice(0, 600) })).filter(a => a.question) : null;
        if (session) await updateSession(sessionId, { photos, photos_deleted_at: null, deleted_reason: null, ...(answers && answers.length ? { answers } : {}) });
        else await saveSession({ id: sessionId, anon_id: typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : null, photos, ...(answers && answers.length ? { answers } : {}) });
        return json(200, { sessionId, slot, uploaded: photos.map(x => x.slot) });
    } catch (err) {
        console.error('[vst-upload]', err.message);
        return json(502, { error: 'No se pudo guardar la foto. Revisa tu conexión e inténtalo de nuevo.' });
    }
};
