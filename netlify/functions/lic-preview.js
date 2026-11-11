// «Licitaciones»: lectura rápida y GRATIS del cartel (ficha + 3 requisitos + cuántos hay en total). Lo demás se desbloquea al pagar.
const { generateWithRetries } = require('./_lib/qer-gemini');
const { json, UUID_RE, sb, getJob, downloadPdf, pdfContents, SCHEMAS, OUT_TOKENS, promptFor, validators, clip } = require('./_lib/lic-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const t0 = Date.now();
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const id = String(b.id || ''); if (!UUID_RE.test(id)) return json(400, { error: 'Solicitud inválida' });
    try {
        const job = await getJob(id); if (!job) return json(404, { error: 'No encontré ese análisis.' });
        if (job.preview) return json(200, { preview: job.preview, status: job.status });
        const buf = await downloadPdf(job.path);
        if (buf.slice(0, 5).toString() !== '%PDF-') return json(400, { error: 'Ese archivo no es un PDF válido.' });
        const d = await generateWithRetries(pdfContents(buf, promptFor('preview')), SCHEMAS.preview, validators.preview, { tag: 'lic-preview', maxOutputTokens: OUT_TOKENS.preview, deadline: t0 + 24000, attemptMs: 20000 });
        const p = d.valido
            ? { valido: true, entidad: clip(d.entidad, 160), objeto: clip(d.objeto, 300), numero: clip(d.numero, 80), modalidad: clip(d.modalidad, 80), presupuesto: clip(d.presupuesto, 80), fechaLimite: clip(d.fechaLimite, 80),
                totalRequisitos: Math.max(0, Math.min(200, Number(d.totalRequisitos) || 0)), totalDocumentos: Math.max(0, Math.min(100, Number(d.totalDocumentos) || 0)), totalAlertas: Math.max(0, Math.min(50, Number(d.totalAlertas) || 0)),
                muestra: (d.muestra || []).slice(0, 3).map((m) => ({ texto: clip(m.texto, 300), ref: clip(m.ref, 60) })) }
            : { valido: false };
        await sb(`/rest/v1/lic_jobs?id=eq.${id}&status=eq.subido`, { method: 'PATCH', body: JSON.stringify({ preview: p, status: 'previo' }) });
        return json(200, { preview: p, status: 'previo' });
    } catch (e) { console.error('[lic-preview]', e.message); return json(502, { error: 'No pude leer el cartel esta vez. Inténtalo de nuevo; si el PDF es una imagen escaneada, puede que no se pueda leer.', reintentar: true }); }
};
