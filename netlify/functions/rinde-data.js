// Rinde: guarda y devuelve el proyecto de la persona (un solo JSON por cuenta) y su estado de acceso.
// GET  → { data, updatedAt, access }
// POST { data } → guarda (máx. ~300 KB)
const core = require('./_lib/rinde-core');
const MAX_BYTES = 300 * 1024;

exports.handler = async (event, context) => {
    const user = core.requireUser(context);
    if (!user) return core.json(401, { error: 'Inicie sesión para guardar su diagnóstico.' });
    try {
        if (event.httpMethod === 'GET') {
            const row = await core.one('rinde_projects', 'user_id', user.id);
            const access = await core.getAccess(user);
            return core.json(200, { data: row ? row.data : null, updatedAt: row ? row.updated_at : null, access, email: user.email });
        }
        if (event.httpMethod === 'POST') {
            if ((event.body || '').length > MAX_BYTES) return core.json(413, { error: 'El proyecto es demasiado grande.' });
            let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
            if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return core.json(400, { error: 'Datos inválidos' });
            await core.upsert('rinde_projects', { user_id: user.id, email: user.email, data: b.data });
            return core.json(200, { ok: true, updatedAt: new Date().toISOString() });
        }
        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (e) {
        console.error('[rinde-data]', e.message);
        return core.json(502, { error: 'No se pudo conectar con la base de datos. Sus datos siguen guardados en este dispositivo.' });
    }
};
