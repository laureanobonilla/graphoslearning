// La persona pide borrar SUS fotos ahora. El readingId (UUID) es el único "secreto" de la sesión,
// igual que en el resto de la app. Borra en Cloudinary y deja constancia en la fila.
const cld = require('./_lib/vst-cloudinary');
const { getSession, updateSession } = require('./_lib/vst-store');
const { json, UUID_RE } = require('./_lib/vst-core');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const id = String(body.readingId || '');
    if (!UUID_RE.test(id)) return json(400, { error: 'Solicitud inválida' });
    try {
        const s = await getSession(id);
        if (!s) return json(404, { error: 'No encontramos esa sesión.' });
        const ids = (Array.isArray(s.photos) ? s.photos : []).map(p => p.public_id).filter(Boolean);
        if (ids.length) await cld.deleteMany(ids);
        await updateSession(id, { photos: [], photos_deleted_at: new Date().toISOString(), deleted_reason: 'user' });
        return json(200, { ok: true, deleted: ids.length });
    } catch (err) {
        console.error('[vst-delete-photos]', err.message);
        return json(502, { error: 'No se pudieron borrar las fotos ahora. Inténtalo de nuevo en un momento.' });
    }
};
