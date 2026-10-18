// Destila: transcribe y resume UN audio con Gemini (una sola llamada). El audio llega en base64, se usa y se descarta.
// El audio 0 de cada lote es gratis; los demás solo si el lote está pagado. Un audio ya hecho no se vuelve a cobrar a Gemini.
const store = require('./_lib/store');
const core = require('./_lib/dst-core');
const { generateWithRetries } = require('./_lib/qer-gemini');
exports.handler = async (event) => {
    const t0 = Date.now();
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(413, { error: 'Ese audio es demasiado pesado.' }); }
    const jobId = String(b.jobId || ''), idx = Math.floor(Number(b.index));
    if (!core.UUID_RE.test(jobId) || !(idx >= 0)) return core.json(400, { error: 'Solicitud inválida' });
    const data = typeof b.data === 'string' ? b.data.replace(/^data:[^,]*,/, '') : '';
    const bytes = Math.floor(data.length * 3 / 4);
    if (!data || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 200))) return core.json(400, { error: 'No llegó el audio. Vuelve a elegirlo.' });
    if (bytes > core.MAX_BYTES) return core.json(413, { error: `Este audio pesa más de ${core.MAX_BYTES / 1048576} MB. Recórtalo o súbelo en partes.` });
    if (Number(b.seconds) > core.MAX_MIN * 60 + 5) return core.json(400, { error: `Este audio dura más de ${core.MAX_MIN} minutos. Recórtalo o súbelo en partes.` });
    const mime = core.geminiMime(b.type, b.name);
    if (!mime) return core.json(400, { error: 'Ese formato no se puede leer. Usa las notas de voz de WhatsApp (.opus) o mp3, m4a o wav.' });
    if (!process.env.GEMINI_API_KEY) { console.error('[dst-audio] falta GEMINI_API_KEY'); return core.json(503, { error: 'El servicio aún no está listo. Intenta más tarde.' }); }
    const sender = core.scrubOne(b.sender, 80), sentAt = core.scrubOne(b.date, 40), ipKey = core.hashIp(core.ipOf(event));
    try {
        const job = await core.getJob(jobId);
        if (!job) return core.json(404, { error: 'No encontramos este lote. Vuelve a empezar.' });
        if (idx >= job.count) return core.json(400, { error: 'Este audio no es parte del lote.' });
        if (idx > 0 && !job.paid) return core.json(402, { error: 'Para los demás audios falta el pago.' });
        const done = await core.getItem(jobId, idx);
        if (done) return core.json(200, core.publicItem(done));
        if (!job.paid) {
            try { if ((await store.countEventsLastHour(ipKey, 'dst_free_audio')) >= 6) return core.json(429, { error: 'Ya probaste varios audios gratis seguidos. Espera un rato o desbloquea el lote.' }); } catch (e) { console.error('[dst-audio] límite', e.message); }
        }
        const contents = [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data } }, { text: core.itemPrompt(sender, sentAt) }] }];
        const r = await generateWithRetries(contents, core.ITEM_SCHEMA, d => d && typeof d.transcripcion === 'string' && typeof d.idea_principal === 'string' && d.idea_principal.trim(),
            { tag: 'dst-audio', maxOutputTokens: 8192, deadline: t0 + 24500, attemptMs: 21000 });
        const row = { job_id: jobId, idx, sender: sender || null, sent_at: sentAt || null, seconds: Math.round(Number(b.seconds) || 0) || null, bytes,
            transcript: core.scrub(r.transcripcion, 30000), idea: core.scrubOne(r.idea_principal, 400), points: core.cleanList(r.puntos, 4, 300), actions: core.cleanList(r.acciones, 8, 300), no_speech: r.sin_voz === true };
        await core.saveItem(row);
        try { await store.logEvent(ipKey, 'anon', job.anon_id || null, job.paid ? 'dst_audio' : 'dst_free_audio', { idx, seconds: row.seconds, kb: Math.round(bytes / 1024), ms: Date.now() - t0 }, null, 'destila'); } catch (_e) { /* no crítico */ }
        return core.json(200, core.publicItem(row));
    } catch (e) {
        console.error('[dst-audio]', jobId, idx, e.message);
        const slow = /tiempo|timeout|deadline/i.test(e.message);
        return core.json(502, { error: slow ? 'Este audio tardó demasiado. Si es muy largo, recórtalo; si no, vuelve a intentarlo.' : 'No pudimos leer este audio. Vuelve a intentarlo.', retry: true });
    }
};
