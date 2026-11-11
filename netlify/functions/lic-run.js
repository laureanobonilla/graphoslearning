// «Licitaciones»: genera UNA parte del análisis completo (requisitos, documentos, alertas o borradores). Solo si ya pagó.
// Se hace por partes (el navegador las pide en paralelo) para respetar el límite de ~26 s de las funciones.
const { generateWithRetries } = require('./_lib/qer-gemini');
const { json, UUID_RE, sb, getJob, downloadPdf, pdfContents, PARTS, SCHEMAS, OUT_TOKENS, promptFor, validators, clip } = require('./_lib/lic-core');
const cleanVal = (v) => Array.isArray(v) ? v.map(cleanVal) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cleanVal(x)])) : typeof v === 'string' ? clip(v, 4000) : v;
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const t0 = Date.now();
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const id = String(b.id || ''), part = String(b.part || '');
    if (!UUID_RE.test(id) || !PARTS.includes(part)) return json(400, { error: 'Solicitud inválida' });
    try {
        const job = await getJob(id); if (!job) return json(404, { error: 'No encontré ese análisis.' });
        if (job.status !== 'pagado') return json(402, { error: 'Este análisis aún no está desbloqueado.' });
        const have = await sb(`/rest/v1/lic_parts?job_id=eq.${id}&part=eq.${part}&select=data&limit=1`);
        if (have && have[0]) return json(200, { part, data: have[0].data });
        const buf = await downloadPdf(job.path);
        const d = await generateWithRetries(pdfContents(buf, promptFor(part)), SCHEMAS[part], validators[part], { tag: 'lic-' + part, maxOutputTokens: OUT_TOKENS[part], deadline: t0 + 24500, attemptMs: 22000 });
        const data = cleanVal(d);
        await sb('/rest/v1/lic_parts?on_conflict=job_id,part', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ job_id: id, part, data }) });
        return json(200, { part, data });
    } catch (e) { console.error('[lic-run]', part, e.message); return json(502, { error: 'Esta parte tardó más de lo normal. Se reintenta sola.', reintentar: true }); }
};
