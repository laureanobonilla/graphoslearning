// Helper de Gemini para la variante "mapa" de ¿Quién eres en realidad?.
// Es una copia independiente del patrón de qer-generate-reading.js (para no
// tocar la versión que ya está en producción): reintenta con el siguiente
// modelo si la llamada falla O si el JSON sale roto/incompleto.
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.6-flash'];

async function generateWithRetries(prompt, schema, validate, { tag = 'qer-gemini', maxOutputTokens = 4096, temperature = 0.85, deadline = null } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt < FALLBACK_MODELS.length; attempt++) {
        // `deadline` (ms epoch): Netlify corta la función a los ~26 s y devuelve un
        // 502 genérico sin explicación. Mejor rendirse nosotros un poco antes y
        // devolver un error claro.
        if (deadline && Date.now() > deadline - 1500) {
            throw lastError || new Error(`[${tag}] se acabó el tiempo disponible antes de poder reintentar`);
        }
        const timeoutMs = deadline ? Math.max(3000, deadline - Date.now()) : undefined;
        let response;
        try {
            const call = ai.models.generateContent({
                contents: prompt,
                model: FALLBACK_MODELS[attempt],
                config: { responseMimeType: 'application/json', responseSchema: schema, temperature, maxOutputTokens }
            });
            // Límite propio (en vez de httpOptions.timeout, que la API de Gemini
            // rechaza si es menor a 10 s): si la llamada se cuelga, nos rendimos
            // antes de que Netlify corte la función con un 502 sin explicación.
            if (timeoutMs) {
                call.catch(() => {}); // si pierde la carrera, que su error tardío no quede sin atender
                let timer;
                try {
                    response = await Promise.race([call, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('NOREINTENTO: tiempo agotado esperando a Gemini')), timeoutMs); })]);
                } finally { clearTimeout(timer); }
            } else {
                response = await call;
            }
        } catch (err) {
            lastError = err;
            const msg = (err.message || '').toLowerCase();
            const retryable = !(err.message || '').startsWith('NOREINTENTO') && ['503', 'unavailable', '429', 'high demand', 'overloaded', 'internal'].some(s => msg.includes(s));
            console.error(`[${tag}] intento ${attempt + 1}: llamada falló (${retryable ? 'reintentable' : 'NO reintentable'}): ${err.message}`);
            if (!retryable) throw err;
            if (attempt < FALLBACK_MODELS.length - 1) await new Promise(r => setTimeout(r, 800));
            continue;
        }
        let data;
        try { data = JSON.parse(response.text); }
        catch {
            lastError = new Error(`JSON inválido (finishReason: ${response?.candidates?.[0]?.finishReason || 'desconocido'})`);
            console.error(`[${tag}] intento ${attempt + 1}: ${lastError.message}`);
            if (attempt < FALLBACK_MODELS.length - 1) await new Promise(r => setTimeout(r, 400));
            continue;
        }
        if (!validate(data)) {
            lastError = new Error('Respuesta incompleta');
            console.error(`[${tag}] intento ${attempt + 1}: ${lastError.message}`);
            if (attempt < FALLBACK_MODELS.length - 1) await new Promise(r => setTimeout(r, 400));
            continue;
        }
        return data;
    }
    throw lastError || new Error('No se pudo generar tras varios intentos.');
}

const MAX_ANSWERS = 30, MAX_ANSWER_LEN = 600, MAX_QUESTION_LEN = 300;
function sanitizeAnswers(answers) {
    if (!Array.isArray(answers)) return null;
    const clean = answers.slice(0, MAX_ANSWERS).map(a => ({
        question: String(a?.question || '').slice(0, MAX_QUESTION_LEN),
        answer: String(a?.answer || '').slice(0, MAX_ANSWER_LEN)
    })).filter(a => a.question && a.answer);
    return clean.length ? clean : null;
}

module.exports = { generateWithRetries, sanitizeAnswers };
