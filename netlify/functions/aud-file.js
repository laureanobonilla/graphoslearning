// tu-audio: enlace del audio resultado. kind=preview (fragmento de 30 s, siempre) o kind=full (completo, solo si ya pagó).
const core = require('./_lib/aud-core');
exports.handler = async (event) => {
    const q = event.queryStringParameters || {}, id = String(q.job || ''), kind = q.kind === 'full' ? 'full' : 'preview';
    if (!core.UUID_RE.test(id)) return core.json(400, { error: 'Solicitud inválida' });
    try {
        const job = await core.getJob(id);
        if (!job || job.status !== 'ready' || !job.result_id) return core.json(404, { error: 'No disponible' });
        if (kind === 'full' && !job.paid) return core.json(402, { error: 'Falta el pago' });
        const pid = kind === 'full' ? job.result_id : job.preview_id;
        return core.json(200, { url: core.deliveryUrl(pid), format: /\.wav$/.test(pid) ? 'wav' : 'mp3' }, { 'Cache-Control': 'no-store' });
    } catch (e) { console.error('[aud-file]', e.message); return core.json(500, { error: 'Error' }); }
};
