// tu-audio: crea el trabajo. «ajustar» no sube nada (se hace en el navegador); las demás verifican el audio subido y lo mandan a Replicate.
const store = require('./_lib/store');
const core = require('./_lib/aud-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || ''), tool = String(b.tool || ''), anonId = typeof b.anonId === 'string' ? b.anonId.slice(0, 64) : null;
    if (!core.UUID_RE.test(jobId) || !core.toolOk(tool)) return core.json(400, { error: 'Solicitud inválida' });
    const T = core.TOOLS[tool], ipKey = core.hashIp(core.ipOf(event));
    try {
        const existing = await core.getJob(jobId).catch(() => null);
        if (existing && existing.status !== 'uploaded') return core.json(200, core.publicJob(existing));   // ya iniciado: no se paga otra vez a Replicate

        if (!T.server) {   // ajustar: solo se registra el trabajo para poder cobrarlo
            try { if ((await store.countEventsLastHour(ipKey, 'aud_started')) >= 20) return core.json(429, { error: 'Demasiados intentos seguidos. Espera un rato.' }); } catch (e) { console.error('[aud-start] límite', e.message); }
            const row = { id: jobId, tool, status: 'ready', price_usd: Number(T.price), anon_id: anonId, country: core.countryOf(event) || null, seconds: Math.round(Number(b.audioSeconds) || 0) || null };
            await core.saveJob(row);
            try { await store.logEvent(ipKey, 'anon', jobId, 'aud_started', { tool }, null, 'tu-audio'); } catch (_e) { /* no crítico */ }
            return core.json(200, core.publicJob(row));
        }

        const publicId = String(b.audio && b.audio.publicId || '');
        if (!publicId.startsWith(`aud/${jobId}/audio-`) || !/^[\w\-\/]+$/.test(publicId)) return core.json(400, { error: 'Solicitud inválida' });
        if (b.consent !== true) return core.json(400, { error: 'Marca la casilla que confirma que el audio es tuyo o que tienes permiso para usarlo.' });
        if (!core.cldConfigured() || !process.env.REPLICATE_API_TOKEN) { console.error('[aud-start] faltan credenciales (Cloudinary/Replicate)'); return core.json(503, { error: 'El servicio aún no está listo. Intenta más tarde.' }); }
        try { if ((await store.countEventsLastHour(ipKey, 'aud_started')) >= 6) return core.json(429, { error: 'Hiciste varios audios seguidos. Espera un rato e inténtalo de nuevo.' }); } catch (e) { console.error('[aud-start] límite', e.message); }
        let info = null, rt = 'video';
        for (const t of ['video', 'raw']) { info = await core.resourceInfo(publicId, t); if (info) { rt = t; break; } }
        if (!info) return core.json(400, { error: 'No encontramos tu audio. Vuelve a subirlo.' });
        const seconds = Number(info.duration) || Math.min(Number(b.audioSeconds) || 0, core.MAX_MIN * 60);
        if (seconds && seconds > core.MAX_MIN * 60 + 5) return core.json(400, { error: `El audio dura más de ${core.MAX_MIN} minutos. Sube uno más corto.` });
        if (seconds && seconds < core.MIN_SEC) return core.json(400, { error: `El audio es muy corto (mínimo ${core.MIN_SEC} segundos).` });
        const predictionId = await core.startPrediction(tool, core.downloadUrl(publicId, rt, info.format || '', 1));
        const row = { id: jobId, tool, status: 'processing', price_usd: Number(T.price), anon_id: anonId, country: core.countryOf(event) || null, audio_id: publicId, seconds: seconds ? Math.round(seconds) : null, prediction_id: predictionId };
        await core.saveJob(row);
        try { await store.logEvent(ipKey, 'anon', jobId, 'aud_started', { tool, seconds: row.seconds }, null, 'tu-audio'); } catch (_e) { /* no crítico */ }
        return core.json(200, core.publicJob(row));
    } catch (e) { console.error('[aud-start]', e.message); return core.json(502, { error: 'No pudimos empezar a procesar tu audio. Inténtalo de nuevo en un momento.' }); }
};
