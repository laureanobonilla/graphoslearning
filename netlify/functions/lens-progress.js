// Guarda y devuelve el progreso de las lentes de la persona (requiere cuenta). Si la tabla aún no existe responde 503
// y el cliente sigue funcionando solo con el almacenamiento del navegador.
const { getUser } = require('./_lib/auth');
const store = require('./_lib/store');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const LENSES = ['genio', 'camino', 'claridad'], LEVELS = ['principiante', 'intermedio', 'avanzado'];
const MAX_ROWS = 60, MAX_BYTES = 70000;

exports.handler = async function (event, context) {
    const user = getUser(context);
    if (!user) return json(401, { error: 'auth_required' });
    try {
        if (event.httpMethod === 'GET') {
            return json(200, { items: await store.listLensProgress(user.id, 40) });
        }
        if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
        if ((event.body || '').length > MAX_BYTES + 2000) return json(413, { error: 'too_large' });
        let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_json' }); }
        const key = String(b.key || '').slice(0, 220), lens = String(b.lens || '');
        if (!key || !LENSES.includes(lens) || !b.data || typeof b.data !== 'object') return json(400, { error: 'bad_request' });
        const done = b.done && typeof b.done === 'object' && !Array.isArray(b.done) ? b.done : {};
        if (JSON.stringify(b.data).length + JSON.stringify(done).length > MAX_BYTES) return json(413, { error: 'too_large' });
        const level = LEVELS.includes(b.level) ? b.level : 'intermedio';
        await store.upsertLensProgress(user.id, { key, lens, topic: String(b.topic || (b.data && b.data.topic) || '').slice(0, 200), level, t: Math.max(0, Math.floor(Number(b.t) || Date.now())), data: b.data, done });
        await store.pruneLensProgress(user.id, MAX_ROWS).catch(() => {});
        return json(200, { ok: true });
    } catch (err) {
        console.error('[lens-progress]', err.message);
        return json(503, { error: 'db_unavailable' });
    }
};
