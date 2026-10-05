// Paso 2 de 3: escribe 2 ocasiones y las guarda en el servidor (`<readingId>-p<n>`). No devuelve texto.
const { saveReading, getReading } = require('./_lib/qer-readings-store');
const { generateWithRetries } = require('./_lib/qer-gemini');
const { json, TIME_BUDGET_MS, UUID_RE, CHUNKS, NODES_SCHEMA, chunkPrompt, validNode, packNode } = require('./_lib/vst-core');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const readingId = String(body.readingId || ''), part = Number(body.part);
    if (!UUID_RE.test(readingId) || !Number.isInteger(part) || part < 0 || part >= CHUNKS.length) return json(400, { error: 'Solicitud inválida' });

    const t0 = Date.now();
    try {
        const base = await getReading(readingId);
        if (!base || base.format !== 'vestirte' || !base.profile) return json(404, { error: 'Esa lectura ya no está disponible.' });
        const idxs = CHUNKS[part];
        const result = await generateWithRetries(
            chunkPrompt(base.transcript || '', base.profile, idxs), NODES_SCHEMA,
            d => d && Array.isArray(d.nodes) && d.nodes.length === idxs.length && d.nodes.every(validNode),
            { tag: `vst-part-${part}`, maxOutputTokens: 4096, temperature: 0.8, deadline: t0 + TIME_BUDGET_MS });
        await saveReading(`${readingId}-p${part}`, { part, nodes: result.nodes.map(packNode), full: [] });
        console.log(`[vst-part] parte ${part} lista en ${Date.now() - t0} ms`);
        return json(200, { ok: true, part });
    } catch (err) {
        console.error(`[vst-part] parte ${part} falló tras ${Date.now() - t0} ms:`, err.message);
        return json(502, { error: `No se pudo armar tu resultado (parte ${part + 1}). Detalle técnico: ${String(err.message || err).slice(0, 250)}` });
    }
};
