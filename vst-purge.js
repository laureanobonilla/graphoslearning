// Borra las fotos que pasaron el plazo de conservación (VST_PHOTO_RETENTION_DAYS, por defecto 30).
// Programada una vez al día (ver el fragmento de netlify.toml en vestirte/LEEME.md); también se
// puede lanzar a mano desde el panel de administración. Borrar de más es imposible: solo toca
// sesiones con fotos y con más antigüedad que el plazo.
const cld = require('./_lib/vst-cloudinary');
const { listExpired, updateSession } = require('./_lib/vst-store');

async function runPurge() {
    const days = Math.max(1, Number(process.env.VST_PHOTO_RETENTION_DAYS) || 30);
    const before = new Date(Date.now() - days * 86400000).toISOString();
    const rows = await listExpired(before);
    let sessions = 0, photos = 0;
    for (const r of rows) {
        const ids = (Array.isArray(r.photos) ? r.photos : []).map(p => p.public_id).filter(Boolean);
        try {
            if (ids.length) photos += await cld.deleteMany(ids);
            await updateSession(r.id, { photos: [], photos_deleted_at: new Date().toISOString(), deleted_reason: 'retention' });
            sessions++;
        } catch (e) { console.error('[vst-purge]', r.id, e.message); }
    }
    return { days, sessions, photos };
}

exports.runPurge = runPurge;
exports.handler = async () => {
    try {
        const r = await runPurge();
        console.log('[vst-purge]', JSON.stringify(r));
        return { statusCode: 200, body: JSON.stringify(r) };
    } catch (e) {
        console.error('[vst-purge]', e.message);
        return { statusCode: 500, body: 'error' };
    }
};
