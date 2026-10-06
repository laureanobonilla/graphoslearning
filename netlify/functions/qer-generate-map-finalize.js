// Paso 3 de 3: junta el eje y las partes, guarda el mapa completo en el
// servidor y devuelve SOLO lo público (texto únicamente en los rubros gratis).
const { saveReading, getReading } = require('./_lib/qer-readings-store');
const { json, UUID_RE, CHUNKS, formatOf, wordCount, publicNodes } = require('./_lib/qer-map-core');

function payloadOf(readingId, base, nodes) {
    const freeWords = nodes.filter(n => n.free).reduce((a, n) => a + wordCount(n.text), 0);
    const hiddenWords = nodes.filter(n => !n.free).reduce((a, n) => a + wordCount(n.text), 0) + wordCount(base.closingLine);
    const allOpen = nodes.every(n => n.free);
    return { readingId, format: base.format || 'map', archetypeName: base.archetypeName, hookLine: base.hookLine, ...(allOpen ? { closingLine: base.closingLine } : {}), nodes: publicNodes(nodes), stats: { freeWords, hiddenWords, hiddenCount: nodes.filter(n => !n.free).length } };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const readingId = String(body.readingId || '');
    if (!UUID_RE.test(readingId)) return json(400, { error: 'Solicitud inválida' });

    try {
        const base = await getReading(readingId);
        if (!base) return json(404, { error: 'Ese mapa ya no está disponible.' });

        // Idempotente: si ya está ensamblado NO se vuelve a guardar (guardar de
        // nuevo reiniciaría la marca de "pagado" de esa lectura).
        if (base.map) {
            return json(200, payloadOf(readingId, base, base.map.nodes));
        }

        const parts = await Promise.all(CHUNKS.map((_, i) => getReading(`${readingId}-p${i}`)));
        const missing = parts.map((p, i) => (p && Array.isArray(p.nodes) ? null : i)).filter(i => i !== null);
        if (missing.length) return json(409, { error: 'Faltan partes del mapa.', missing });

        const nodes = parts.flatMap(p => p.nodes).map((n, i) => ({
            id: i, label: String(n.label).slice(0, 60), hook: String(n.hook), text: String(n.text), free: i < formatOf(base.format).freeCount
        }));

        await saveReading(readingId, {
            format: base.format || 'map',
            archetypeName: base.archetypeName, hookLine: base.hookLine, closingLine: base.closingLine,
            full: [], map: { nodes }
        });
        return json(200, payloadOf(readingId, base, nodes));
    } catch (err) {
        console.error('[generate-map-finalize]', err.message);
        return json(502, { error: `No se pudo armar tu resultado (final). Detalle técnico: ${String(err.message || err).slice(0, 250)}` });
    }
};
