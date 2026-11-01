// «¿De qué tienes cara?»: devuelve un análisis guardado (al recargar la página). El informe completo solo si ya está pagado.
const core = require('./_lib/cara-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const jobId = String((event.queryStringParameters || {}).id || '');
    if (!core.UUID_RE.test(jobId)) return core.json(400, { error: 'Solicitud inválida' });
    try {
        const job = await core.getJob(jobId);
        if (!job) return core.json(404, { error: 'No existe.' });
        return core.json(200, job.paid ? { ...core.vistaGratis(job), informe: job.informe } : core.vistaGratis(job));
    } catch (e) { console.error('[cara-informe]', e.message); return core.json(502, { error: 'No se pudo leer el informe.' }); }
};
