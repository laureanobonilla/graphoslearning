// Variante "mapa" de ¿Quién eres en realidad?. En vez de un texto lineal,
// genera un centro (el arquetipo) y ~6 "revelaciones" satélite. Solo 2 llegan
// con su texto; de las demás el navegador recibe ÚNICAMENTE la etiqueta y un
// gancho corto. El texto bloqueado vive en el servidor (Supabase) y solo sale
// por qer-paypal-capture-order / qer-get-reading cuando el pago está
// confirmado — nunca en la respuesta de esta función.
const crypto = require('crypto');
const { saveReading } = require('./_lib/qer-readings-store');
const { generateWithRetries, sanitizeAnswers } = require('./_lib/qer-gemini');

const FREE_COUNT = 2;
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        archetypeName: { type: 'STRING', description: 'Nombre del arquetipo: 2 a 4 palabras, evocador y específico de ESTA persona, con palabras sencillas y cotidianas. NUNCA basado en guardián/guardiana/vigilante/centinela/vigía/protector/pilar. En español.' },
        hookLine: { type: 'STRING', description: 'Una sola frase intrigante, en segunda persona, que presenta el centro del mapa (la contradicción de la persona).' },
        nodes: {
            type: 'ARRAY',
            description: 'Entre 5 y 7 revelaciones (idealmente 6). La PRIMERA es la contradicción central; la SEGUNDA es la más fácil de reconocerse; las demás son las que más intrigan.',
            items: {
                type: 'OBJECT',
                properties: {
                    label: { type: 'STRING', description: 'Etiqueta de 1 a 3 palabras sencillas (ej. "Lo que callas", "Tu máscara", "Cuando nadie ve"). Máx. 24 caracteres.' },
                    hook: { type: 'STRING', description: 'De 10 a 16 palabras, en segunda persona. Nombra algo concreto de SUS respuestas y deja claro que hay algo más, SIN revelarlo ni resolverlo. Nunca genérica.' },
                    text: { type: 'STRING', description: 'La revelación completa: 60 a 90 palabras, segunda persona, concreta, citando o parafraseando algo que la persona dijo.' }
                },
                required: ['label', 'hook', 'text']
            }
        },
        closingLine: { type: 'STRING', description: 'Una frase final memorable, en segunda persona, que cierra el mapa.' }
    },
    required: ['archetypeName', 'hookLine', 'nodes', 'closingLine']
};

function validMap(d) {
    return d && d.archetypeName && d.hookLine && d.closingLine && Array.isArray(d.nodes) &&
        d.nodes.length >= 5 && d.nodes.length <= 7 &&
        d.nodes.every(n => n && n.label && n.hook && n.text && String(n.text).length > 80);
}

function buildPrompt(transcript) {
    return `Eres quien escribe "¿Quién eres en realidad?", una experiencia de autoconocimiento (no un diagnóstico clínico). Esta vez la lectura no es un texto lineal sino un MAPA: un centro (el arquetipo de la persona) y varias revelaciones que orbitan a su alrededor.

Respuestas de la persona:
${transcript}

Tono: íntimo, perceptivo y un poco teatral, en segunda persona ("tú"), como alguien que de verdad prestó atención y conecta detalles entre respuestas. Usa detalles CONCRETOS de sus respuestas (cita o parafrasea). Nunca inventes datos personales que no dio ni hagas diagnósticos o etiquetas clínicas.

MUY IMPORTANTE sobre el centro: busca en las respuestas UNA contradicción real entre lo que la persona dice de sí misma y lo que sus otras respuestas dejan ver. Esa tensión es el centro del mapa (hookLine y primera revelación). Tiene que estar de verdad en sus respuestas: nunca inventes un "secreto". Si las respuestas son pobres, apóyate en las que tengan algo concreto.

MUY IMPORTANTE sobre el nombre del arquetipo: evita por completo el campo de guardián/vigilante/centinela/vigía/protector/pilar. Debe salir de la contradicción ESPECÍFICA de esta persona.

MUY IMPORTANTE sobre el lenguaje: palabras sencillas, las de un amigo hablando. Nada de construcciones de ensayo ("cartografía defensiva", "arquitectura emocional", "la dicotomía entre..."). Debe entenderse al vuelo desde el celular.

MUY IMPORTANTE sobre las revelaciones: cada una es un ángulo DISTINTO de la misma persona (lo que calla, su máscara, lo que haría si nadie se enterara, lo que no perdona, lo que ven los demás, lo que evita sentir, etc., según lo que sus respuestas sustenten). Cada una debe poder leerse sola. El "hook" de cada una (lo que se ve cuando está bloqueada) debe nombrar algo concreto de SUS respuestas y dejar claro que falta algo, sin adelantar el contenido del "text". Las etiquetas son cortas y distintas entre sí.`;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const answers = sanitizeAnswers(body.answers);
    if (!answers) return json(400, { error: 'Faltan las respuestas del cuestionario.' });
    const transcript = answers.map((a, i) => `${i + 1}. ${a.question}\nRespuesta: ${a.answer}`).join('\n\n');

    try {
        const data = await generateWithRetries(buildPrompt(transcript), SCHEMA, validMap, { tag: 'generate-map', maxOutputTokens: 4096 });

        const nodes = data.nodes.map((n, i) => ({
            id: i,
            label: String(n.label).slice(0, 28),
            hook: String(n.hook),
            text: String(n.text),
            free: i < FREE_COUNT
        }));

        const readingId = crypto.randomUUID();
        // `full: []` mantiene compatible el formato con capture/get-reading.
        await saveReading(readingId, {
            archetypeName: data.archetypeName,
            hookLine: data.hookLine,
            closingLine: data.closingLine,
            full: [],
            map: { nodes }
        });

        return json(200, {
            readingId,
            archetypeName: data.archetypeName,
            hookLine: data.hookLine,
            // El texto SOLO viaja en los nodos gratis.
            nodes: nodes.map(n => n.free
                ? { id: n.id, label: n.label, hook: n.hook, free: true, text: n.text }
                : { id: n.id, label: n.label, hook: n.hook, free: false })
        });
    } catch (err) {
        console.error('[generate-map]', err.message);
        return json(502, { error: 'No se pudo armar tu mapa. Intenta de nuevo en un momento.' });
    }
};

exports.FREE_COUNT = FREE_COUNT;
