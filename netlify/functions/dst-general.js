// Destila: idea general de los audios ya transcritos del lote (solo lotes pagados). Se guarda; se rehace si cambian los audios.
const store = require('./_lib/store');
const core = require('./_lib/dst-core');
const { generateWithRetries } = require('./_lib/qer-gemini');
exports.handler = async (event) => {
    const t0 = Date.now();
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || '');
    if (!core.UUID_RE.test(jobId)) return core.json(400, { error: 'Solicitud inválida' });
    const pick = Array.isArray(b.indexes) ? new Set(b.indexes.map(Number).filter(n => n >= 0)) : null;   // solo los que la persona marcó
    try {
        const job = await core.getJob(jobId);
        if (!job) return core.json(404, { error: 'No encontramos este lote.' });
        if (!job.paid) return core.json(402, { error: 'La idea general se desbloquea con el pago.' });
        const items = (await core.getItems(jobId)).filter(it => !it.no_speech && (!pick || pick.has(it.idx)));
        if (items.length < 2) return core.json(400, { error: 'Marca al menos dos audios ya transcritos.' });
        const key = items.map(it => it.idx).join(',');
        if (job.general && job.general_key === key) return core.json(200, { general: job.general, generalCount: items.length });
        const r = await generateWithRetries(core.generalPrompt(items), core.GENERAL_SCHEMA, d => d && typeof d.idea_general === 'string' && d.idea_general.trim(),
            { tag: 'dst-general', maxOutputTokens: 4096, deadline: t0 + 24500 });
        const general = { idea: core.scrub(r.idea_general, 1500), topics: core.cleanList(r.temas, 8, 120),
            actions: (Array.isArray(r.acciones) ? r.acciones : []).slice(0, 20).map(a => ({ who: core.scrubOne(a && a.quien, 80), what: core.scrubOne(a && a.que, 300) })).filter(a => a.what),
            pending: core.cleanList(r.pendientes, 10, 300) };
        await core.saveJob({ id: jobId, general, general_key: key, general_count: items.length });
        try { await store.logEvent(core.hashIp(core.ipOf(event)), 'anon', job.anon_id || null, 'dst_general', { n: items.length, ms: Date.now() - t0 }, null, 'destila'); } catch (_e) { /* no crítico */ }
        return core.json(200, { general, generalCount: items.length });
    } catch (e) { console.error('[dst-general]', jobId, e.message); return core.json(502, { error: 'No pudimos armar la idea general. Inténtalo de nuevo.' }); }
};
