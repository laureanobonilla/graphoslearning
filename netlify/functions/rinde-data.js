// Rinde: guarda y devuelve los proyectos de la persona (un solo JSON por cuenta) y su estado de acceso.
// data = { v: 2, activa, empresas: { id: proyecto } } (varias empresas); las cuentas antiguas traen un solo proyecto (v: 1)
// y el navegador lo convierte solo.
// GET  → { data, updatedAt, access }
// POST { data } → guarda (máx. ~1,5 MB)
const core = require('./_lib/rinde-core');
const MAX_BYTES = 1536 * 1024, MAX_EMPRESAS = 30;

exports.handler = async (event, context) => {
    const user = core.requireUser(context);
    if (!user) return core.json(401, { error: 'Inicie sesión para guardar su diagnóstico.' });
    try {
        if (event.httpMethod === 'GET') {
            const row = await core.one('rinde_projects', 'user_id', user.id);
            const access = await core.getAccess(user);
            await core.evento(user, 'srv_sesion', { tieneDatos: !!row, plan: access.active, freeFrente: access.freeFrente || null });
            return core.json(200, { data: row ? row.data : null, updatedAt: row ? row.updated_at : null, access, email: user.email });
        }
        if (event.httpMethod === 'POST') {
            if ((event.body || '').length > MAX_BYTES) return core.json(413, { error: 'El proyecto es demasiado grande.' });
            let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
            if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return core.json(400, { error: 'Datos inválidos' });
            if (b.data.v === 2 && (!b.data.empresas || typeof b.data.empresas !== 'object' || Object.keys(b.data.empresas).length > MAX_EMPRESAS)) return core.json(400, { error: `Puede tener hasta ${MAX_EMPRESAS} empresas.` });
            await core.upsert('rinde_projects', { user_id: user.id, email: user.email, data: b.data });
            return core.json(200, { ok: true, updatedAt: new Date().toISOString() });
        }
        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (e) {
        console.error('[rinde-data]', e.message);
        return core.json(502, { error: 'No se pudo conectar con la base de datos. Sus datos siguen guardados en este dispositivo.' });
    }
};
