// Destila: crea (o actualiza mientras no esté pagado) el lote: cuántos audios trae → precio fijado por el servidor.
// El primer lote de cada persona (hasta TRIAL_MAX audios) nace pagado con monto 0 (trial=true).
const store = require('./_lib/store');
const core = require('./_lib/dst-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || ''), count = Math.floor(Number(b.count) || 0), anonId = typeof b.anonId === 'string' ? b.anonId.slice(0, 64) : null;
    if (!core.UUID_RE.test(jobId) || count < 1) return core.json(400, { error: 'Solicitud inválida' });
    if (count > core.MAX_AUDIOS) return core.json(400, { error: `Son demasiados audios para un solo lote (máximo ${core.MAX_AUDIOS}). Divídelos en dos.` });
    const free = core.freeKeyOk(b.key), ipKey = core.hashIp(core.ipOf(event));
    try {
        const job = await core.getJob(jobId);
        if (job && job.paid) {   // ya pagado: el número de audios queda fijo (solo puede bajar)
            if (count > job.count) return core.json(409, { error: `Este lote ya está pagado para ${job.count} audios. Para más, empieza un lote nuevo.` });
            return core.json(200, core.publicJob(job, await core.getItems(jobId)));
        }
        if (!job) {
            try { if (!free && (await store.countEventsLastHour(ipKey, 'dst_started')) >= 12) return core.json(429, { error: 'Empezaste muchos lotes seguidos. Espera un rato e inténtalo de nuevo.' }); } catch (e) { console.error('[dst-start] límite', e.message); }
            try { await store.logEvent(ipKey, 'anon', anonId, 'dst_started', { count }, null, 'destila'); } catch (_e) { /* no crítico */ }
        }
        // Primer lote gratis: solo al crear el lote, si trae hasta TRIAL_MAX audios y nunca usó el suyo.
        let trial = false;
        if (!job && !free && core.TRIAL_MAX > 0 && count <= core.TRIAL_MAX) { try { trial = !(await core.trialUsed(anonId, ipKey)); } catch (e) { console.error('[dst-start] prueba', e.message); } }
        const now = new Date().toISOString();
        const row = { id: jobId, count, price_usd: Number(core.priceFor(count)), ...(job ? {} : { anon_id: anonId, ip_hash: ipKey, country: core.countryOf(event) || null }),
            ...(free ? { paid: true, paid_at: now, paid_amount_usd: 0, free: true } : {}), ...(trial ? { paid: true, paid_at: now, paid_amount_usd: 0, trial: true } : {}) };
        if (trial) { try { await store.logEvent(ipKey, 'anon', anonId, 'dst_trial', { count }, null, 'destila'); } catch (_e) { /* no crítico */ } }
        await core.saveJob(row);
        return core.json(200, core.publicJob({ ...(job || {}), ...row }, job ? await core.getItems(jobId) : []));
    } catch (e) { console.error('[dst-start]', e.message); return core.json(502, { error: 'No pudimos empezar. Inténtalo de nuevo en un momento.' }); }
};
