// Paso 3 de 3: junta el perfil y las partes, guarda el resultado completo y devuelve SOLO lo público
// (texto únicamente de las ocasiones gratis: la más usada y la menos usada).
const { saveReading, getReading } = require('./_lib/qer-readings-store');
const { json, UUID_RE, CHUNKS, FREE_IDS, publicNodes, wordCount } = require('./_lib/vst-core');

function payloadOf(readingId, base, nodes) {
    const hidden = nodes.filter(n => !n.free);
    return {
        readingId, format: 'vestirte', archetypeName: base.styleName || base.archetypeName, hookLine: base.hookLine,
        palette: (base.profile && base.profile.bestColors) || [], avoid: (base.profile && base.profile.avoidColors) || [],
        nodes: publicNodes(nodes),
        stats: { hiddenCount: hidden.length, hiddenWords: hidden.reduce((a, n) => a + wordCount(n.plain), 0) }
    };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const readingId = String(body.readingId || '');
    if (!UUID_RE.test(readingId)) return json(400, { error: 'Solicitud inválida' });
    try {
        const base = await getReading(readingId);
        if (!base || base.format !== 'vestirte') return json(404, { error: 'Ese resultado ya no está disponible.' });
        // Idempotente: guardar de nuevo reiniciaría la marca de "pagado".
        if (base.map) return json(200, payloadOf(readingId, base, base.map.nodes));

        const parts = await Promise.all(CHUNKS.map((_, i) => getReading(`${readingId}-p${i}`)));
        const missing = parts.map((p, i) => (p && Array.isArray(p.nodes) ? null : i)).filter(i => i !== null);
        if (missing.length) return json(409, { error: 'Faltan partes del resultado.', missing });

        const nodes = parts.flatMap(p => p.nodes).map((n, i) => ({ id: i, label: n.label, hook: n.hook, text: n.text, plain: n.plain, free: FREE_IDS.includes(i) }));
        await saveReading(readingId, {
            format: 'vestirte', archetypeName: base.archetypeName, styleName: base.styleName, hookLine: base.hookLine,
            closingLine: base.closingLine, profile: base.profile, full: [], map: { nodes }
        });
        return json(200, payloadOf(readingId, base, nodes));
    } catch (err) {
        console.error('[vst-finalize]', err.message);
        return json(502, { error: `No se pudo armar tu resultado (final). Detalle técnico: ${String(err.message || err).slice(0, 250)}` });
    }
};
