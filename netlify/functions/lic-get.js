// «Licitaciones»: estado de un análisis. La vista previa es pública para quien tiene el enlace; las partes completas SOLO si ya pagó.
const { json, UUID_RE, sb, getJob } = require('./_lib/lic-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const id = String(b.id || ''); if (!UUID_RE.test(id)) return json(400, { error: 'Solicitud inválida' });
    try {
        const job = await getJob(id); if (!job) return json(404, { error: 'No encontré ese análisis.' });
        const out = { id, filename: job.filename, status: job.status, preview: job.preview || null, parts: {} };
        if (job.status === 'pagado') for (const r of await sb(`/rest/v1/lic_parts?job_id=eq.${id}&select=part,data`)) out.parts[r.part] = r.data;
        return json(200, out);
    } catch (e) { console.error('[lic-get]', e.message); return json(502, { error: 'No se pudo cargar.' }); }
};
