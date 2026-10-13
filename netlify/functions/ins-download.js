// tu-pista: pista completa. Solo si el trabajo ya está pagado (verificado con PayPal en el servidor).
const store = require('./_lib/store');
const core = require('./_lib/ins-core');
exports.handler = async (event) => {
    const id = String((event.queryStringParameters || {}).job || '');
    if (!core.UUID_RE.test(id)) return { statusCode: 400, body: 'Solicitud inválida' };
    try {
        const job = await core.getJob(id);
        if (!job || !job.instr_id) return { statusCode: 404, body: 'No disponible' };
        if (!job.paid) return { statusCode: 402, body: 'Falta el pago' };
        try { await core.saveJob({ id, downloads: (job.downloads || 0) + 1 }); await store.logEvent(id, 'anon', job.anon_id || null, 'ins_downloaded', {}, null, 'tu-pista'); } catch (_e) { /* no crítico */ }
        return { statusCode: 302, headers: { Location: core.rawUrl(job.instr_id, { attachment: true, hours: 1 }), 'Cache-Control': 'no-store' }, body: '' };
    } catch (e) { console.error('[ins-download]', e.message); return { statusCode: 500, body: 'Error' }; }
};
