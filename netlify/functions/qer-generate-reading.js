// Recibe las respuestas del cuestionario y le pide a Gemini que las
// interprete en una "lectura" personalizada (no un diagnóstico real, es
// contenido de entretenimiento/autoconocimiento — ver el aviso en el propio
// texto que se genera). Reutiliza el mismo patrón que netlify/functions/
// gemini.js de la otra app (mismo paquete @google/genai, misma lista de
// modelos con reintento) pero con un prompt y un esquema de salida propios,
// pensados para esto.
//
// La lectura se guarda en el servidor (ver _lib/readings-store.js) y a quien
// pidió esto solo se le devuelve la "entrada" gratuita (el gancho + los
// primeros párrafos) — el resto se entrega únicamente después de pagar, en
// paypal-capture-order.js. Así, aunque alguien abra las herramientas de
// desarrollador, nunca ve el texto completo en la respuesta de esta llamada.
const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');
const { saveReading } = require('./_lib/qer-readings-store');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.6-flash'];

async function generateWithFallback(payload) {
    let lastError = null;
    for (let i = 0; i < FALLBACK_MODELS.length; i++) {
        try {
            return await ai.models.generateContent({ ...payload, model: FALLBACK_MODELS[i] });
        } catch (err) {
            lastError = err;
            const msg = (err.message || '').toLowerCase();
            const retryable = ['503', 'unavailable', '429', 'high demand', 'overloaded', 'internal'].some(s => msg.includes(s));
            if (!retryable) throw err;
            if (i < FALLBACK_MODELS.length - 1) await new Promise(r => setTimeout(r, 800));
        }
    }
    throw lastError;
}

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

// Límites generosos pero no infinitos: esto nunca debería recibir más que
// las respuestas de un cuestionario corto, así que un body enorme es, en el
// mejor caso, un error del cliente y, en el peor, alguien probando a ver qué
// pasa si manda megabytes de texto.
const MAX_ANSWERS = 30;
const MAX_ANSWER_LEN = 600;
const MAX_QUESTION_LEN = 300;

function sanitizeAnswers(answers) {
    if (!Array.isArray(answers)) return null;
    const clean = answers.slice(0, MAX_ANSWERS).map(a => ({
        question: String(a?.question || '').slice(0, MAX_QUESTION_LEN),
        answer: String(a?.answer || '').slice(0, MAX_ANSWER_LEN)
    })).filter(a => a.question && a.answer);
    return clean.length ? clean : null;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const answers = sanitizeAnswers(body.answers);
    if (!answers) return json(400, { error: 'Faltan las respuestas del cuestionario.' });

    const transcript = answers.map((a, i) => `${i + 1}. ${a.question}\nRespuesta: ${a.answer}`).join('\n\n');

    const schema = {
        type: 'OBJECT',
        properties: {
            archetypeName: { type: 'STRING', description: 'Nombre del arquetipo revelado: 2 a 4 palabras, evocador y específico (nunca genérico tipo "persona reflexiva"). En español.' },
            hookLine: { type: 'STRING', description: 'Una sola frase, intrigante, que abre la lectura — el "gancho" antes de los párrafos.' },
            teaser: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Exactamente 2 párrafos (strings), cada uno de 70 a 120 palabras, que abren la interpretación con detalles concretos tomados de las respuestas reales de la persona — no genéricos ni de horóscopo.' },
            full: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Entre 4 y 6 párrafos más (strings) que continúan y profundizan la interpretación, cada uno de 70 a 130 palabras, siguiendo revelando cosas específicas basadas en las respuestas.' },
            closingLine: { type: 'STRING', description: 'Una frase final memorable que cierra la lectura, en segunda persona.' }
        },
        required: ['archetypeName', 'hookLine', 'teaser', 'full', 'closingLine']
    };

    const prompt = `Eres quien escribe las lecturas de "¿Quién eres en realidad?", una experiencia de autoconocimiento (no un diagnóstico clínico) que interpreta las respuestas de un cuestionario para revelarle a la persona un arquetipo de quién es "detrás de su máscara".

Respuestas de la persona:
${transcript}

Escribe su lectura en español, en segunda persona ("tú"), con un tono íntimo, perceptivo y un poco teatral — como alguien que de verdad prestó atención a cada respuesta y conecta detalles entre ellas, no como un horóscopo genérico que le quedaría bien a cualquiera. Usa detalles CONCRETOS de sus respuestas reales (cita o parafrasea algo que dijo) en al menos la mitad de los párrafos. Está permitido señalar una contradicción o un punto incómodo si las respuestas lo sugieren — una lectura que solo halaga no se siente real. Nunca inventes datos personales que la persona no dio (edad, nombre, relaciones, etc.) ni hagas diagnósticos o etiquetas clínicas (nada de "trastorno", "patología" ni similares): esto es una interpretación de personalidad con fines de entretenimiento/reflexión, no una evaluación psicológica real.`;

    try {
        const response = await generateWithFallback({
            contents: prompt,
            config: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.95 }
        });

        let reading;
        try { reading = JSON.parse(response.text); } catch { throw new Error('La IA devolvió un formato inesperado.'); }

        if (!reading.archetypeName || !Array.isArray(reading.teaser) || !Array.isArray(reading.full)) {
            throw new Error('La lectura generada quedó incompleta.');
        }

        const readingId = crypto.randomUUID();
        await saveReading(readingId, reading);

        return json(200, {
            readingId,
            archetypeName: reading.archetypeName,
            hookLine: reading.hookLine,
            teaser: reading.teaser
        });
    } catch (err) {
        console.error('[generate-reading]', err.message);
        return json(502, { error: 'No se pudo generar tu lectura en este momento. Intenta de nuevo en un momento.' });
    }
};
