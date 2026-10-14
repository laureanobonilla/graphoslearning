// tu-audio: letra. Sin pago solo las primeras líneas; con pago, todo el texto.
const core = require('./_lib/aud-core');
exports.handler = async (event) => {
    const id = String((event.queryStringParameters || {}).job || '');
    if (!core.UUID_RE.test(id)) return core.json(400, { error: 'Solicitud inválida' });
    try {
        const job = await core.getJob(id);
        if (!job || job.status !== 'ready' || !job.result_text) return core.json(404, { error: 'No disponible' });
        const p = core.textPreview(job.result_text);
        return core.json(200, { paid: !!job.paid, totalLines: p.totalLines, text: job.paid ? job.result_text : p.preview }, { 'Cache-Control': 'no-store' });
    } catch (e) { console.error('[aud-text]', e.message); return core.json(500, { error: 'Error' }); }
};
