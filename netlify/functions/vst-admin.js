// Panel privado: solo con la clave VST_ADMIN_KEY (cabecera x-admin-key). Sin clave configurada,
// todo responde 503. Las fotos se piden una a una y viajan como bytes: nunca hay una URL pública.
const crypto = require('crypto');
const cld = require('./_lib/vst-cloudinary');
const { listSessions, paidMap, getSession, updateSession } = require('./_lib/vst-store');
const { runPurge } = require('./vst-purge');
const { json, UUID_RE, SLOTS } = require('./_lib/vst-core');

function authorized(event) {
    const expected = process.env.VST_ADMIN_KEY;
    if (!expected) return null;
    const got = String(event.headers['x-admin-key'] || event.headers['X-Admin-Key'] || '');
    const a = crypto.createHash('sha256').update(got).digest(), b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
}
const PHOTO_ID_RE = new RegExp(`^vestirte/[0-9a-f-]{36}/(${SLOTS.join('|')})$`);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const ok = authorized(event);
    if (ok === null) return json(503, { error: 'VST_ADMIN_KEY no está configurada en Netlify.' });
    if (!ok) { await new Promise(r => setTimeout(r, 600)); return json(401, { error: 'Clave incorrecta.' }); }

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    try {
        if (body.action === 'list') {
            const rows = await listSessions(Math.min(Number(body.limit) || 60, 200));
            const paid = await paidMap(rows.map(r => r.id)).catch(() => ({}));
            return json(200, { sessions: rows.map(r => ({ ...r, paid: !!paid[r.id] })) });
        }
        if (body.action === 'photo') {
            const pid = String(body.publicId || '');
            if (!PHOTO_ID_RE.test(pid)) return json(400, { error: 'Foto no válida' });
            const buf = await cld.fetchPrivate(pid);
            return { statusCode: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' }, body: buf.toString('base64'), isBase64Encoded: true };
        }
        if (body.action === 'delete') {
            const id = String(body.id || '');
            if (!UUID_RE.test(id)) return json(400, { error: 'Id no válido' });
            const s = await getSession(id);
            if (!s) return json(404, { error: 'No existe' });
            const ids = (Array.isArray(s.photos) ? s.photos : []).map(p => p.public_id);
            if (ids.length) await cld.deleteMany(ids);
            await updateSession(id, { photos: [], photos_deleted_at: new Date().toISOString(), deleted_reason: 'admin' });
            return json(200, { ok: true });
        }
        if (body.action === 'purge') return json(200, await runPurge());
        return json(400, { error: 'Acción desconocida' });
    } catch (err) {
        console.error('[vst-admin]', err.message);
        return json(502, { error: String(err.message).slice(0, 200) });
    }
};
