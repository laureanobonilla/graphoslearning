// /tu-app/ paso 1: respuestas → propuesta de app (lo que verá la persona) + especificación (solo para el dueño, queda guardada en el servidor).
const crypto = require('crypto');
const { saveReading } = require('./_lib/qer-readings-store');
const { generateWithRetries, sanitizeAnswers } = require('./_lib/qer-gemini');
const core = require('./_lib/tuapp-core');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const answers = sanitizeAnswers(body.answers);
    if (!answers || answers.length < 5) return json(400, { error: 'Faltan respuestas.' });
    const transcript = answers.map(a => `P: ${a.question}\nR: ${a.answer}`).join('\n\n');
    const t0 = Date.now();
    try {
        const a = await generateWithRetries(core.prompt(transcript), core.SCHEMA, core.validate, { tag: 'tuapp', maxOutputTokens: 3072, deadline: t0 + 23000, attemptMs: 15000 });
        const id = crypto.randomUUID();
        await saveReading(id, { format: 'tuapp', transcript, proposal: a });
        console.log(`[tuapp-propose] ${Date.now() - t0} ms`);
        return json(200, { id, proposal: { problemSummary: a.problemSummary, appName: a.appName, tagline: a.tagline, features: a.features.slice(0, 3), sampleScreen: { title: a.sampleScreen.title, lines: a.sampleScreen.lines.slice(0, 4) }, whyItFits: a.whyItFits } });
    } catch (err) {
        console.error('[tuapp-propose]', err.message);
        return json(502, { error: 'No se pudo armar tu propuesta. Inténtalo de nuevo.' });
    }
};
