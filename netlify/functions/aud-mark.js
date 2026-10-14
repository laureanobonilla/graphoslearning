// tu-audio: anota una descarga (solo trabajos pagados) con los ajustes usados, para tus estadísticas.
const store = require('./_lib/store');
const core = require('./_lib/aud-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const id = String(b.jobId || ''); if (!core.UUID_RE.test(id)) return core.json(400, { error: 'Solicitud inválida' });
    try {
        const job = await core.getJob(id); if (!job || !job.paid) return core.json(402, { error: 'Falta el pago' });
        const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
        const adj = { semitones: Math.round(num(b.semitones, -12, 12)), speed: Math.round(num(b.speed, 0.5, 2) * 100) / 100 || 1, trimmed: b.trimmed === true, format: b.format === 'wav' ? 'wav' : 'mp3' };
        await core.saveJob({ id, downloads: (job.downloads || 0) + 1, last_adjust: adj });
        try { await store.logEvent(id, 'anon', job.anon_id || null, 'aud_downloaded', { tool: job.tool, ...adj }, null, 'tu-audio'); } catch (_e) { /* no crítico */ }
        return core.json(200, { ok: true });
    } catch (e) { console.error('[aud-mark]', e.message); return core.json(500, { error: 'Error' }); }
};
