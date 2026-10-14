// tu-audio: estado del trabajo. Si Replicate ya terminó, guarda el resultado completo y un fragmento de 30 s (o la letra), una sola vez.
const core = require('./_lib/aud-core');
async function download(url) { const r = await fetch(url); if (!r.ok) throw new Error(`descarga HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const id = String((event.queryStringParameters || {}).job || '');
    if (!core.UUID_RE.test(id)) return core.json(400, { error: 'Solicitud inválida' });
    try {
        let job = await core.getJob(id);
        if (!job) return core.json(404, { error: 'No encontramos este trabajo.' });
        if (job.status === 'processing' && job.prediction_id) {
            const pred = await core.getPrediction(job.prediction_id), fail = async (why, log) => { console.error('[aud-status]', id, log || why); await core.saveJob({ id, status: 'failed', error: String(log || why).slice(0, 300) }); job = { ...job, status: 'failed', error: why }; };
            if (pred.status === 'failed' || pred.status === 'canceled') await fail('No pudimos procesar este audio. Prueba con otro archivo.', pred.error || 'falló');
            else if (pred.status === 'succeeded') {
                if (job.tool === 'letra') {
                    const text = core.pickText(pred.output).trim();
                    if (!text) await fail('No se encontró letra en este audio.', 'sin texto: ' + JSON.stringify(pred.output).slice(0, 200));
                    else { await core.saveJob({ id, status: 'ready', result_text: text.slice(0, 20000) }); job = { ...job, status: 'ready' }; }
                } else {
                    const url = job.tool === 'limpiar' ? core.firstAudioUrl(pred.output) : core.pickStem(pred.output, job.tool === 'voz');
                    if (!url) await fail('No pudimos procesar este audio.', 'salida inesperada: ' + JSON.stringify(pred.output).slice(0, 300));
                    else {
                        const buf = await download(url), wav = !core.isMp3(buf) && core.isWav(buf), ext = wav ? 'wav' : 'mp3';
                        const fullId = `aud/${id}/resultado.${ext}`, prevId = `aud/${id}/fragmento.${ext}`;
                        const secs = job.seconds || Math.max(core.PREVIEW_SEC, Math.round(buf.length / 24000));
                        const start = Math.max(0, Math.min(secs * 0.3, secs - core.PREVIEW_SEC - 1));
                        const slice = wav ? core.wavSlice(buf, start, core.PREVIEW_SEC) : core.mp3Slice(buf, start, core.PREVIEW_SEC, buf.length / secs);
                        if (!slice) await fail('No pudimos procesar este audio.', 'no se pudo cortar el fragmento');
                        else { await Promise.all([core.uploadRaw(fullId, buf, wav ? 'audio/wav' : 'audio/mpeg'), core.uploadRaw(prevId, slice, wav ? 'audio/wav' : 'audio/mpeg')]); await core.saveJob({ id, status: 'ready', result_id: fullId, preview_id: prevId }); job = { ...job, status: 'ready' }; }
                    }
                }
            }
        }
        return core.json(200, core.publicJob(job));
    } catch (e) { console.error('[aud-status]', e.message); return core.json(200, { id, status: 'processing', paid: false, retry: true }); }
};
