// Helper de Gemini para la variante "mapa" de ¿Quién eres en realidad?.
// Es una copia independiente del patrón de qer-generate-reading.js (para no
// tocar la versión que ya está en producción): reintenta con el siguiente
// modelo si la llamada falla, se cuelga, O si el JSON sale roto/incompleto.
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.6-flash'];

// Los modelos "flash" recientes "piensan" antes de responder, y ese pensamiento
// cuenta como tiempo (y como tokens de salida) aunque no se vea: en una tarea
// que solo redacta, eso volvía tardías hasta las llamadas cortas. Se intenta
// primero apagar/reducir el pensamiento; si el modelo rechaza ese parámetro
// (400), se prueba el siguiente y se recuerda el que funcionó.
const THINKING_LADDER = [{ thinkingBudget: 0 }, { thinkingLevel: 'low' }, null];
let thinkingIdx = 0;
const isThinkingConfigError = (err) => /thinking|budget|level/i.test(err.message || '') && /(400|invalid|not supported|unsupported)/i.test(err.message || '');

async function callOnce(model, prompt, schema, temperature, maxOutputTokens, timeoutMs) {
    for (; thinkingIdx < THINKING_LADDER.length; thinkingIdx++) {
        const thinking = THINKING_LADDER[thinkingIdx];
        const call = ai.models.generateContent({
            contents: prompt,
            model,
            config: { responseMimeType: 'application/json', responseSchema: schema, temperature, maxOutputTokens, ...(thinking ? { thinkingConfig: thinking } : {}) }
        });
        try {
            if (!timeoutMs) return await call;
            call.catch(() => {}); // si pierde la carrera, que su error tardío no quede sin atender
            let timer;
            try {
                return await Promise.race([call, new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error(`tiempo agotado (${Math.round(timeoutMs / 1000)} s) esperando a ${model}`), { isTimeout: true })), timeoutMs); })]);
            } finally { clearTimeout(timer); }
        } catch (err) {
            if (thinking && isThinkingConfigError(err)) {
                console.error(`[qer-gemini] ${model} rechazó thinkingConfig ${JSON.stringify(thinking)}: ${err.message}`);
                continue; // probar el siguiente escalón de la escalera
            }
            throw err;
        }
    }
    throw new Error('Ninguna configuración de pensamiento fue aceptada');
}

async function generateWithRetries(prompt, schema, validate, { tag = 'qer-gemini', maxOutputTokens = 4096, temperature = 0.85, deadline = null, attemptMs = 24000 } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt < FALLBACK_MODELS.length; attempt++) {
        // `deadline` (ms epoch): Netlify corta la función a los ~26 s y devuelve un
        // 502 genérico. Mejor rendirse antes y devolver un error claro.
        if (deadline && Date.now() > deadline - 2500) {
            throw lastError || new Error(`[${tag}] se acabó el tiempo disponible`);
        }
        // Cada intento tiene su propio tope: una llamada colgada no puede gastarse
        // todo el presupuesto; se abandona y se prueba con el siguiente modelo.
        const timeoutMs = deadline ? Math.max(2500, Math.min(attemptMs, deadline - Date.now())) : undefined;
        const t0 = Date.now();
        let response;
        try {
            response = await callOnce(FALLBACK_MODELS[attempt], prompt, schema, temperature, maxOutputTokens, timeoutMs);
        } catch (err) {
            lastError = err;
            const msg = (err.message || '').toLowerCase();
            const retryable = err.isTimeout || ['503', 'unavailable', '429', 'high demand', 'overloaded', 'internal'].some(s => msg.includes(s));
            console.error(`[${tag}] intento ${attempt + 1} (${FALLBACK_MODELS[attempt]}, ${Date.now() - t0} ms): llamada falló (${retryable ? 'reintentable' : 'NO reintentable'}): ${err.message}`);
            if (!retryable) throw err;
            if (!err.isTimeout && attempt < FALLBACK_MODELS.length - 1) await new Promise(r => setTimeout(r, 600));
            continue;
        }
        console.log(`[${tag}] intento ${attempt + 1} (${FALLBACK_MODELS[attempt]}) respondió en ${Date.now() - t0} ms`);
        let data;
        try { data = JSON.parse(response.text); }
        catch {
            lastError = new Error(`JSON inválido (finishReason: ${response?.candidates?.[0]?.finishReason || 'desconocido'})`);
            console.error(`[${tag}] intento ${attempt + 1}: ${lastError.message}`);
            continue;
        }
        if (!validate(data)) {
            lastError = new Error('Respuesta incompleta');
            console.error(`[${tag}] intento ${attempt + 1}: ${lastError.message}`);
            continue;
        }
        return data;
    }
    throw lastError || new Error('No se pudo generar tras varios intentos.');
}

const MAX_ANSWERS = 60, MAX_ANSWER_LEN = 600, MAX_QUESTION_LEN = 300;
function sanitizeAnswers(answers) {
    if (!Array.isArray(answers)) return null;
    const clean = answers.slice(0, MAX_ANSWERS).map(a => ({
        question: String(a?.question || '').slice(0, MAX_QUESTION_LEN),
        answer: String(a?.answer || '').slice(0, MAX_ANSWER_LEN)
    })).filter(a => a.question && a.answer);
    return clean.length ? clean : null;
}

module.exports = { generateWithRetries, sanitizeAnswers };
