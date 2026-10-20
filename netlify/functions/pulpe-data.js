// La Pulpe: guarda y devuelve la partida de la persona (un JSON por cuenta) y si tiene el pase.
// GET  → { data, updatedAt, access }      POST { data } → guarda (máx. ~250 KB)
const core = require('./_lib/pulpe-core');
const MAX_BYTES = 250 * 1024;
exports.handler = async (event, context) => {
    const user = core.requireUser(context);
    if (!user) return core.json(401, { error: 'Inicia sesión para guardar tu partida.' });
    try {
        if (event.httpMethod === 'GET') {
            const row = await core.one('pulpe_saves', 'user_id', user.id);
            const access = await core.getAccess(user);
            await core.evento(user, 'srv_sesion', { tieneDatos: !!row, pase: access.active });
            return core.json(200, { data: row ? row.data : null, updatedAt: row ? row.updated_at : null, access, email: user.email });
        }
        if (event.httpMethod === 'POST') {
            if ((event.body || '').length > MAX_BYTES) return core.json(413, { error: 'La partida es demasiado grande.' });
            let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
            if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return core.json(400, { error: 'Datos inválidos' });
            await core.upsert('pulpe_saves', { user_id: user.id, email: user.email, data: b.data });
            return core.json(200, { ok: true, updatedAt: new Date().toISOString() });
        }
        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (e) {
        console.error('[pulpe-data]', e.message);
        if (core.faltaTabla(e)) return core.json(503, { error: core.MSG_FALTA_TABLA });
        return core.json(502, { error: 'No se pudo conectar con la base de datos. Tu partida sigue guardada en este dispositivo.' });
    }
};
