// tu-pista: estado del trabajo. Si Replicate ya terminó, guarda la pista completa y un fragmento de 30 s (una sola vez).
const core = require('./_lib/ins-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const id = String((event.queryStringParameters || {}).job || '');
    if (!core.UUID_RE.test(id)) return core.json(400, { error: 'Solicitud inválida' });
    try {
        let job = await core.getJob(id);
        if (!job) return core.json(404, { error: 'No encontramos este trabajo.' });
        if (job.status === 'processing' && job.prediction_id) {
            const pred = await core.getPrediction(job.prediction_id);
            if (pred.status === 'failed' || pred.status === 'canceled') {
                console.error('[ins-status] Replicate falló', id, String(pred.error || '').slice(0, 300));
                job = { ...job, status: 'failed', error: 'No pudimos separar este audio. Prueba con otro archivo.' }; await core.saveJob({ id, status: 'failed', error: String(pred.error || 'falló').slice(0, 300) });
            } else if (pred.status === 'succeeded') {
                const url = core.pickInstrumental(pred.output);
                if (!url) { console.error('[ins-status] salida inesperada', JSON.stringify(pred.output).slice(0, 300)); await core.saveJob({ id, status: 'failed', error: 'salida inesperada de Replicate' }); job = { ...job, status: 'failed' }; }
                else {
                    const fullId = `ins/${id}/pista-instrumental.mp3`, prevId = `ins/${id}/fragmento.mp3`;
                    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
                    const secs = job.seconds || Math.max(core.PREVIEW_SEC, Math.round(buf.length / 24000)), bps = buf.length / secs;
                    const start = Math.max(0, Math.min(secs * 0.3, secs - core.PREVIEW_SEC - 1));
                    const slice = core.mp3Slice(buf, start, core.PREVIEW_SEC, bps);
                    await Promise.all([core.uploadRaw(fullId, buf), core.uploadRaw(prevId, slice)]);
                    await core.saveJob({ id, status: 'ready', instr_id: fullId, preview_id: prevId });
                    job = { ...job, status: 'ready' };
                }
            }
        }
        return core.json(200, core.publicJob(job));
    } catch (e) {
        console.error('[ins-status]', e.message);
        return core.json(200, { id, status: 'processing', paid: false, retry: true });   // un fallo puntual no tira el trabajo: el navegador vuelve a preguntar
    }
};
