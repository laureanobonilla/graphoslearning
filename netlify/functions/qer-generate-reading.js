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

// Esta lectura es un JSON mucho más largo (archetypeName + hookLine + hasta
// 8 párrafos) que cualquier otra llamada a Gemini de este proyecto, y se
// pidió con temperature alta (0.95) para que no suene genérica — pero esa
// combinación (salida larga + mucha "creatividad") es justo la que más
// fácil rompe el formato JSON pedido, o se corta a medio párrafo si el
// modelo gasta de más generando. Una versión anterior solo reintentaba si
// la LLAMADA a Gemini fallaba (503/429/etc.) — si Gemini respondía "bien"
// pero el JSON quedaba roto o incompleto, eso nunca se reintentaba, y la
// persona veía "no se pudo armar la lectura" a la primera mala suerte (esto
// es lo que pasaba: el error 502 era justo esto). generateReadingWithRetries()
// envuelve todo el
// intento (llamada + parseo + validación de forma) y, si el JSON sale
// roto o incompleto, lo vuelve a intentar con el siguiente modelo de la
// lista en vez de rendirse de una.
async function generateReadingWithRetries(prompt, schema) {
    let lastError = null;
    for (let attempt = 0; attempt < FALLBACK_MODELS.length; attempt++) {
        let response;
        try {
            response = await ai.models.generateContent({
                contents: prompt,
                model: FALLBACK_MODELS[attempt],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.85,
                    maxOutputTokens: 4096
                }
            });
        } catch (err) {
            lastError = err;
            const msg = (err.message || '').toLowerCase();
            const retryable = ['503', 'unavailable', '429', 'high demand', 'overloaded', 'internal'].some(s => msg.includes(s));
            console.error(`[generate-reading] intento ${attempt + 1}: la llamada a ${FALLBACK_MODELS[attempt]} falló (${retryable ? 'reintentable' : 'NO reintentable'}): ${err.message}`);
            if (!retryable) throw err;
            if (attempt < FALLBACK_MODELS.length - 1) await new Promise(r => setTimeout(r, 800));
            continue;
        }

        const finishReason = response?.candidates?.[0]?.finishReason;
        let reading;
        try {
            reading = JSON.parse(response.text);
        } catch {
            lastError = new Error(`JSON inválido (finishReason: ${finishReason || 'desconocido'})`);
            console.error(`[generate-reading] intento ${attempt + 1}: ${lastError.message}. Primeros 200 caracteres de la respuesta: ${String(response.text || '').slice(0, 200)}`);
            if (attempt < FALLBACK_MODELS.length - 1) await new Promise(r => setTimeout(r, 400));
            continue;
        }

        if (!reading.archetypeName || !Array.isArray(reading.teaser) || reading.teaser.length < 1 ||
            !reading.lockedHook || !Array.isArray(reading.full) || reading.full.length < 1) {
            lastError = new Error(`Lectura incompleta (finishReason: ${finishReason || 'desconocido'})`);
            console.error(`[generate-reading] intento ${attempt + 1}: ${lastError.message}.`);
            if (attempt < FALLBACK_MODELS.length - 1) await new Promise(r => setTimeout(r, 400));
            continue;
        }

        return reading;
    }
    throw lastError || new Error('No se pudo generar la lectura tras varios intentos.');
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
            archetypeName: { type: 'STRING', description: 'Nombre del arquetipo revelado: 2 a 4 palabras, evocador y específico (nunca genérico tipo "persona reflexiva"), pero con PALABRAS SENCILLAS Y COTIDIANAS — nunca términos académicos, técnicos o rebuscados (nada de "cartografía defensiva", "arquitectura emocional" ni construcciones similares de ensayo). En español.' },
            hookLine: { type: 'STRING', description: 'Una sola frase, intrigante, que abre la lectura — el "gancho" antes de los párrafos.' },
            teaser: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Exactamente 2 párrafos (strings) que abren la interpretación con detalles concretos tomados de las respuestas reales de la persona — no genéricos ni de horóscopo. El primero de 70 a 120 palabras, cerrado. El SEGUNDO termina A MEDIA IDEA, interrumpido justo cuando está a punto de nombrar o explicar algo concreto (no en un punto final redondo) — como si se cortara la hoja ahí mismo. Nunca termines este segundo párrafo con una idea resuelta.' },
            lockedHook: { type: 'STRING', description: 'Una sola frase, en segunda persona, que le dice a la persona ESPECÍFICAMENTE qué va a descubrir en la parte pagada — nombrando algo concreto de sus propias respuestas (ej. "Todavía no te dije por qué [detalle concreto de su respuesta]", o "Falta la parte de ti que se nota en [algo que contestó]"). Nunca genérica ("tu lectura continúa", "hay más por descubrir") — tiene que sonar imposible de haber escrito sin haber leído SUS respuestas en particular.' },
            full: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Entre 4 y 6 párrafos más (strings) que continúan y profundizan la interpretación, cada uno de 70 a 130 palabras, siguiendo revelando cosas específicas basadas en las respuestas. El primero de estos párrafos debe retomar y cerrar la idea a medias con la que terminó el segundo párrafo del teaser.' },
            closingLine: { type: 'STRING', description: 'Una frase final memorable que cierra la lectura, en segunda persona.' }
        },
        required: ['archetypeName', 'hookLine', 'teaser', 'lockedHook', 'full', 'closingLine']
    };

    const prompt = `Eres quien escribe las lecturas de "¿Quién eres en realidad?", una experiencia de autoconocimiento (no un diagnóstico clínico) que interpreta las respuestas de un cuestionario para revelarle a la persona un arquetipo de quién es "detrás de su máscara".

Respuestas de la persona:
${transcript}

Escribe su lectura en español, en segunda persona ("tú"), con un tono íntimo, perceptivo y un poco teatral — como alguien que de verdad prestó atención a cada respuesta y conecta detalles entre ellas, no como un horóscopo genérico que le quedaría bien a cualquiera. Usa detalles CONCRETOS de sus respuestas reales (cita o parafrasea algo que dijo) en al menos la mitad de los párrafos. Está permitido señalar una contradicción o un punto incómodo si las respuestas lo sugieren — una lectura que solo halaga no se siente real. Nunca inventes datos personales que la persona no dio (edad, nombre, relaciones, etc.) ni hagas diagnósticos o etiquetas clínicas (nada de "trastorno", "patología" ni similares): esto es una interpretación de personalidad con fines de entretenimiento/reflexión, no una evaluación psicológica real.

MUY IMPORTANTE sobre el lenguaje: quien lee esto no es un público académico — usa palabras sencillas, cotidianas, las que usarías hablando con un amigo. "Teatral" significa dramatismo emocional (el peso de lo que dice, las pausas, la intriga), NUNCA vocabulario rebuscado. Evita por completo construcciones de ensayo o tesis — nada de frases tipo "cartografía defensiva", "arquitectura emocional", "dialéctica de...", "la dicotomía entre...", ni sustantivos abstractos encadenados con "de" ("la geometría de tu silencio"). Si una frase necesitaría que alguien pare a pensar qué significa, está mal — tiene que entenderse al vuelo, en una sola lectura rápida desde el celular.

MUY IMPORTANTE sobre el corte entre lo gratis y lo pagado: el segundo párrafo de "teaser" tiene que quedar interrumpido a media idea — justo cuando está a punto de revelar o nombrar algo concreto, no en una frase redonda. Y "lockedHook" (lo que ve la persona junto al botón de pago) tiene que nombrar ESE algo concreto que falta, usando un detalle real de sus respuestas, nunca una frase genérica tipo "tu lectura continúa" — tiene que sentirse imposible de haber escrito sin haber leído sus respuestas específicas.`;

    try {
        const reading = await generateReadingWithRetries(prompt, schema);

        const readingId = crypto.randomUUID();
        await saveReading(readingId, reading);

        return json(200, {
            readingId,
            archetypeName: reading.archetypeName,
            hookLine: reading.hookLine,
            teaser: reading.teaser,
            lockedHook: reading.lockedHook
        });
    } catch (err) {
        console.error('[generate-reading]', err.message);
        // TEMPORAL mientras se diagnostica el error 502 reportado: se manda el
        // motivo técnico real (truncado) en vez de un mensaje genérico, para
        // poder ver la causa exacta directo en la pantalla de error de la app
        // sin tener que entrar al panel de Netlify a buscar los logs. Una vez
        // confirmado qué lo causa, esto se puede volver a dejar genérico.
        return json(502, { error: `No se pudo generar tu lectura. Detalle técnico: ${String(err.message || err).slice(0, 300)}` });
    }
};
