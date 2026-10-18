// Destila: estado del lote (para volver a abrir el enlace). Sin pago solo se ve el primer audio.
const core = require('./_lib/dst-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const id = String((event.queryStringParameters || {}).job || '');
    if (!core.UUID_RE.test(id)) return core.json(400, { error: 'Solicitud inválida' });
    try {
        const job = await core.getJob(id);
        if (!job) return core.json(404, { error: 'No encontramos este lote.' });
        return core.json(200, core.publicJob(job, await core.getItems(id)));
    } catch (e) { console.error('[dst-status]', e.message); return core.json(500, { error: 'Error' }); }
};
