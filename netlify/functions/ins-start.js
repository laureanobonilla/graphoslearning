// tu-pista: verifica el audio subido y lo manda a separar.
const store = require('./_lib/store');
const core = require('./_lib/ins-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || ''), publicId = String(b.audio && b.audio.publicId || '');
    if (!core.UUID_RE.test(jobId) || !publicId.startsWith(`ins/${jobId}/audio-`) || !/^[\w\-\/]+$/.test(publicId)) return core.json(400, { error: 'Solicitud inválida' });
    if (b.consent !== true) return core.json(400, { error: 'Marca la casilla que confirma que el audio es tuyo o que tienes permiso para usarlo.' });
    if (!core.cldConfigured() || !process.env.REPLICATE_API_TOKEN) { console.error('[ins-start] faltan credenciales (Cloudinary/Replicate)'); return core.json(503, { error: 'El servicio aún no está listo. Intenta más tarde.' }); }
    const ipKey = core.hashIp(core.ipOf(event));
    try { if ((await store.countEventsLastHour(ipKey, 'ins_started')) >= 4) return core.json(429, { error: 'Hiciste varios audios seguidos. Espera un rato e inténtalo de nuevo.' }); } catch (e) { console.error('[ins-start] límite', e.message); }
    try {
        const existing = await core.getJob(jobId).catch(() => null);
        if (existing && existing.status !== 'uploaded') return core.json(200, core.publicJob(existing));   // ya iniciado: no se cobra otra vez a Replicate
        let info = null, rt = 'video';
        for (const t of ['video', 'raw']) { info = await core.resourceInfo(publicId, t); if (info) { rt = t; break; } }
        if (!info) return core.json(400, { error: 'No encontramos tu audio. Vuelve a subirlo.' });
        const seconds = Number(info.duration) || Math.min(Number(b.audioSeconds) || 0, core.MAX_MIN * 60);
        if (seconds && seconds > core.MAX_MIN * 60 + 5) return core.json(400, { error: `El audio dura más de ${core.MAX_MIN} minutos. Sube uno más corto.` });
        if (seconds && seconds < core.MIN_SEC) return core.json(400, { error: `El audio es muy corto (mínimo ${core.MIN_SEC} segundos).` });
        const audioUrl = core.downloadUrl(publicId, rt, info.format || '', 1);
        const predictionId = await core.startSeparation(audioUrl);
        const row = { id: jobId, status: 'processing', anon_id: typeof b.anonId === 'string' ? b.anonId.slice(0, 64) : null, country: core.countryOf(event) || null, audio_id: publicId, seconds: seconds ? Math.round(seconds) : null, prediction_id: predictionId };
        await core.saveJob(row);
        try { await store.logEvent(ipKey, 'anon', jobId, 'ins_started', { seconds: row.seconds }, null, 'tu-pista'); } catch (_e) { /* no crítico */ }
        return core.json(200, core.publicJob({ ...row }));
    } catch (e) {
        console.error('[ins-start]', e.message);
        return core.json(502, { error: 'No pudimos empezar a separar tu audio. Inténtalo de nuevo en un momento.' });
    }
};
