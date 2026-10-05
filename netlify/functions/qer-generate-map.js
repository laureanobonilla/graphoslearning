// Paso 1 de 3 del mapa de ¿Quién eres en realidad?: fija el EJE (arquetipo,
// contradicción central, frase final) y deja guardado el registro base. Ver
// _lib/qer-map-core.js para el panorama completo de los pasos.
const crypto = require('crypto');
const { saveReading } = require('./_lib/qer-readings-store');
const { generateWithRetries, sanitizeAnswers } = require('./_lib/qer-gemini');
const { json, TIME_BUDGET_MS, transcriptOf, AXIS_SCHEMA, validAxis, axisPrompt } = require('./_lib/qer-map-core');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const answers = sanitizeAnswers(body.answers);
    if (!answers) return json(400, { error: 'Faltan las respuestas del cuestionario.' });

    const t0 = Date.now();
    try {
        const axis = await generateWithRetries(axisPrompt(transcriptOf(answers)), AXIS_SCHEMA, validAxis,
            { tag: 'map-axis', maxOutputTokens: 1024, temperature: 0.85, deadline: t0 + TIME_BUDGET_MS });
        console.log(`[generate-map] eje listo en ${Date.now() - t0} ms`);

        const readingId = crypto.randomUUID();
        // Registro base ("etapa eje"): sin `map` todavía; finalize lo completa.
        await saveReading(readingId, {
            stage: 'axis',
            archetypeName: axis.archetypeName,
            hookLine: axis.hookLine,
            closingLine: axis.closingLine,
            axis: axis.axis,
            full: []
        });
        return json(200, { readingId, archetypeName: axis.archetypeName, hookLine: axis.hookLine, axis: axis.axis });
    } catch (err) {
        console.error(`[generate-map] falló tras ${Date.now() - t0} ms:`, err.message);
        return json(502, { error: `No se pudo armar tu mapa (paso 1). Detalle técnico: ${String(err.message || err).slice(0, 250)}` });
    }
};
