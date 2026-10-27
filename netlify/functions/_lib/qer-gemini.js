// Helper de Gemini para la variante "mapa" de ¿Quién eres en realidad?.
// Es una copia independiente del patrón de qer-generate-reading.js (para no
// tocar la versión que ya está en producción): reintenta con el siguiente
// modelo si la llamada falla, se cuelga, O si el JSON sale roto/incompleto.
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// Se alternan modelos con intentos cortos: si el primero se cuelga (pasó el 26/10 a las 22:00: tres generaciones seguidas
// agotaron 24 s con gemini-3.8-flash), el segundo y el tercero sí tienen tiempo de responder dentro del presupuesto.
const CLAUDE = 'claude'; // marcador: respaldo con la API de Anthropic (solo si hay ANTHROPIC_API_KEY y el pedido es texto)
const FALLBACK_MODELS = ['gemini-3.8-flash', CLAUDE, 'gemini-3.6-flash', 'gemini-3.8-flash'];
const CLAUDE_MODEL = () => process.env.QER_CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

// El esquema de Gemini usa tipos en mayúsculas (OBJECT, STRING…); la API de Anthropic pide JSON Schema normal.
function toJsonSchema(sc) {
    if (Array.isArray(sc)) return sc.map(toJsonSchema);
    if (!sc || typeof sc !== 'object') return sc;
    const out = {};
    for (const [k, v] of Object.entries(sc)) out[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : (k === 'properties' && v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toJsonSchema(pv)])) : toJsonSchema(v));
    return out;
}

// Llama a Claude pidiéndole la respuesta como «herramienta» con el esquema, y devuelve algo con la misma forma que la respuesta
// de Gemini ({ text: '<json>' }) para que el resto del flujo no cambie.
async function callClaude(prompt, schema, maxOutputTokens, timeoutMs) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw Object.assign(new Error('Sin ANTHROPIC_API_KEY'), { skip: true });
    if (typeof prompt !== 'string') throw Object.assign(new Error('Pedido no es solo texto'), { skip: true });
    const ac = new AbortController();
    const timer = timeoutMs ? setTimeout(() => ac.abort(), timeoutMs) : null;
    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST', signal: ac.signal,
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
                model: CLAUDE_MODEL(), max_tokens: Math.max(512, maxOutputTokens || 2048),
                tools: [{ name: 'responder', description: 'Entrega la respuesta final con el formato pedido.', input_schema: toJsonSchema(schema) }],
                tool_choice: { type: 'tool', name: 'responder' },
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!res.ok) throw Object.assign(new Error(`Claude ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`), { soft: true });
        const data = await res.json();
        const block = (data.content || []).find(b => b.type === 'tool_use');
        if (!block || !block.input) throw Object.assign(new Error(`Claude sin resultado (stop_reason: ${data.stop_reason || '?'})`), { soft: true });
        return { text: JSON.stringify(block.input), candidates: [{ finishReason: data.stop_reason }] };
    } catch (err) {
        if (err.name === 'AbortError') throw Object.assign(new Error(`tiempo agotado (${Math.round((timeoutMs || 0) / 1000)} s) esperando a Claude`), { isTimeout: true });
        throw err;
    } finally { if (timer) clearTimeout(timer); }
}

// Los modelos "flash" recientes "piensan" antes de responder, y ese pensamiento
// cuenta como tiempo (y como tokens de salida) aunque no se vea: en una tarea
// que solo redacta, eso volvía tardías hasta las llamadas cortas. Se intenta
// primero reducirlo al mínimo con thinkingLevel (thinkingBudget quedó obsoleto y los modelos nuevos lo rechazan
// con 400; tampoco se mandan temperature/topP/topK: Google los fija por defecto); si el modelo rechaza ese parámetro
// (400), se prueba el siguiente y se recuerda el que funcionó.
const THINKING_LADDER = [{ thinkingLevel: 'minimal' }, { thinkingLevel: 'low' }, null];
let thinkingIdx = 0;
const isThinkingConfigError = (err) => /thinking|budget|level/i.test(err.message || '') && /(400|invalid|not supported|unsupported)/i.test(err.message || '');

async function callOnce(model, prompt, schema, maxOutputTokens, timeoutMs) {
    for (; thinkingIdx < THINKING_LADDER.length; thinkingIdx++) {
        const thinking = THINKING_LADDER[thinkingIdx];
        const call = ai.models.generateContent({
            contents: prompt,
            model,
            config: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens, ...(thinking ? { thinkingConfig: thinking } : {}) }
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

async function generateWithRetries(prompt, schema, validate, { tag = 'qer-gemini', maxOutputTokens = 4096, deadline = null, attemptMs = 24000 } = {}) {
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
            response = FALLBACK_MODELS[attempt] === CLAUDE
                ? await callClaude(prompt, schema, maxOutputTokens, timeoutMs)
                : await callOnce(FALLBACK_MODELS[attempt], prompt, schema, maxOutputTokens, timeoutMs);
        } catch (err) {
            if (err.skip) { console.log(`[${tag}] se omite Claude: ${err.message}`); continue; } // sin clave o pedido no textual: no cuenta como fallo
            lastError = err;
            const msg = (err.message || '').toLowerCase();
            const retryable = err.isTimeout || err.soft || ['503', 'unavailable', '429', 'high demand', 'overloaded', 'internal', 'not found', 'not_found'].some(s => msg.includes(s));
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

module.exports = { generateWithRetries, sanitizeAnswers, _toJsonSchema: toJsonSchema, _callClaude: callClaude };
