// Paso 2 de 3: escribe 2 rubros del mapa y los guarda en el servidor bajo un
// id propio (`<readingId>-p<n>`). NO devuelve el texto: solo { ok:true }.
// Así el texto de los rubros bloqueados nunca pasa por el navegador.
const { saveReading, getReading } = require('./_lib/qer-readings-store');
const { generateWithRetries, sanitizeAnswers } = require('./_lib/qer-gemini');
const { json, TIME_BUDGET_MS, UUID_RE, CHUNKS, transcriptOf, NODES_SCHEMA, chunkPrompt } = require('./_lib/qer-map-core');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const readingId = String(body.readingId || '');
    const part = Number(body.part);
    const answers = sanitizeAnswers(body.answers);
    if (!UUID_RE.test(readingId) || !Number.isInteger(part) || part < 0 || part >= CHUNKS.length || !answers) {
        return json(400, { error: 'Solicitud inválida' });
    }

    const t0 = Date.now();
    try {
        // El eje se lee del servidor (no se confía en lo que mande el navegador).
        const base = await getReading(readingId);
        if (!base || !base.axis) return json(404, { error: 'Ese mapa ya no está disponible.' });
        const axis = { archetypeName: base.archetypeName, axis: base.axis };

        const idxs = CHUNKS[part];
        const result = await generateWithRetries(
            chunkPrompt(transcriptOf(answers), axis, idxs),
            NODES_SCHEMA,
            d => d && Array.isArray(d.nodes) && d.nodes.length === idxs.length &&
                d.nodes.every(n => n && n.label && n.hook && n.text && String(n.text).length > 250),
            { tag: `map-part-${part}`, maxOutputTokens: 2048, temperature: 0.85, deadline: t0 + TIME_BUDGET_MS }
        );
        await saveReading(`${readingId}-p${part}`, { part, nodes: result.nodes, full: [] });
        console.log(`[generate-map-part] parte ${part} lista en ${Date.now() - t0} ms`);
        return json(200, { ok: true, part });
    } catch (err) {
        console.error(`[generate-map-part] parte ${part} falló tras ${Date.now() - t0} ms:`, err.message);
        return json(502, { error: `No se pudo armar tu mapa (parte ${part + 1}). Detalle técnico: ${String(err.message || err).slice(0, 250)}` });
    }
};
