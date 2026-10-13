// tu-pista: fragmento de 30 s (no es la pista completa) → redirige a un enlace firmado de 1 hora.
const core = require('./_lib/ins-core');
exports.handler = async (event) => {
    const id = String((event.queryStringParameters || {}).job || '');
    if (!core.UUID_RE.test(id)) return { statusCode: 400, body: 'Solicitud inválida' };
    try {
        const job = await core.getJob(id);
        if (!job || !job.preview_id) return { statusCode: 404, body: 'No disponible' };
        return { statusCode: 302, headers: { Location: core.rawUrl(job.preview_id, { attachment: false, hours: 1 }), 'Cache-Control': 'no-store' }, body: '' };
    } catch (e) { console.error('[ins-preview]', e.message); return { statusCode: 500, body: 'Error' }; }
};
