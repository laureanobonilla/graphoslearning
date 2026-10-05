// Mapa de ¿Quién eres en realidad?: un centro (el arquetipo) y 10
// "revelaciones" simbólicas alrededor. Solo 3 llegan con su texto; de las
// demás el navegador recibe ÚNICAMENTE la etiqueta y un gancho corto. El
// texto bloqueado vive en el servidor (Supabase) y solo sale por
// qer-paypal-capture-order / qer-get-reading cuando el pago está confirmado
// — nunca en la respuesta de esta función.
//
// Para que 10 textos largos no excedan el tiempo máximo de la función, la
// generación va en dos pasos: (1) una llamada corta fija el eje de la
// lectura (arquetipo, contradicción central, frase final) y (2) varias
// llamadas EN PARALELO escriben los rubros, todas partiendo de ese mismo eje
// para que no se contradigan entre sí.
const crypto = require('crypto');
const { saveReading } = require('./_lib/qer-readings-store');
const { generateWithRetries, sanitizeAnswers } = require('./_lib/qer-gemini');

const FREE_COUNT = 3;
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

// Los 10 rubros, en orden. Cada uno es un ángulo distinto del inconsciente de
// la misma persona; el orden importa (los 3 primeros son los gratis).
const THEMES = [
    'LA CONTRADICCIÓN CENTRAL: lo que la persona dice de sí misma frente a lo que sus otras respuestas dejan ver. Es el corazón del mapa.',
    'LA MÁSCARA: la versión de sí misma que muestra a los demás y qué protege realmente esa máscara.',
    'LO QUE CALLA: lo que no dice en voz alta y qué le pasa al silencio que guarda (el que ella misma crea).',
    'LA HERIDA QUE NO CIERRA: lo que le cuesta perdonar (traición, mentira, deslealtad, según sus respuestas) leído como el símbolo de una herida más antigua.',
    'LA MENTIRA QUE SE REPITE: la frase con la que se tranquiliza y qué esconde detrás.',
    'LA SOMBRA: lo que se prohíbe querer, hacer o sentir, y que por eso mismo la gobierna.',
    'LO QUE CARGA POR OTROS: lo que protege y sostiene (personas, paz) y el costo oculto de hacerlo.',
    'CUANDO NADIE VE: cómo es de verdad cuando no hay público, leído como la parte más honesta de ella.',
    'EL HAMBRE DE SER VISTA: qué necesita que alguien vea de ella y por qué no deja que pase.',
    'LA CARTA PENDIENTE: lo que le debe decir a su yo del pasado y a su yo de ahora; el cierre catártico del mapa.'
];
const CHUNKS = [[0, 1, 2, 3], [4, 5, 6], [7, 8, 9]];

const RULES = `Tono: íntimo, perceptivo y teatral, en segunda persona ("tú"), como alguien que de verdad leyó cada respuesta y conecta detalles entre ellas — nunca como un horóscopo que le quedaría bien a cualquiera. Cita o parafrasea respuestas reales de la persona.

MUY IMPORTANTE sobre el lenguaje: palabras sencillas y cotidianas, las de un amigo que habla en serio. La profundidad viene de IMÁGENES CONCRETAS (una puerta cerrada, una casa con un cuarto sin luz, una deuda que nadie cobra, un espejo, agua quieta, un invitado que no se va), nunca de vocabulario técnico ni de sustantivos abstractos encadenados ("arquitectura emocional", "dialéctica", "cartografía defensiva"). Debe entenderse al vuelo desde el celular.

MUY IMPORTANTE sobre la honestidad: habla de lo que SUS RESPUESTAS dejan ver, no de certezas absolutas. Nunca inventes hechos personales que no dio (edad, nombres, relaciones, historia). Nada de diagnósticos ni etiquetas clínicas ("trastorno", "trauma", "depresión", "adicta", "alcohólica"…): es una interpretación simbólica con fines de autoconocimiento y entretenimiento.

MUY IMPORTANTE sobre lo delicado: si alguna respuesta menciona duelo, abuso, una adicción o daño, trátala con respeto: no la uses como golpe dramático ni la conviertas en etiqueta, y haz que la catarsis sea de alivio y de permiso, nunca de culpa.

Las respuestas a "¿qué es lo primero que ves?" son proyecciones: puedes usarlas como símbolo ligero, sin darles significados clínicos.`;

function transcriptOf(answers) {
    return answers.map((a, i) => `${i + 1}. ${a.question}\nRespuesta: ${a.answer}`).join('\n\n');
}

// ---------- Paso 1: el eje ----------
const AXIS_SCHEMA = {
    type: 'OBJECT',
    properties: {
        archetypeName: { type: 'STRING', description: 'Nombre del arquetipo: 2 a 4 palabras, evocador y específico de ESTA persona, con palabras sencillas. NUNCA basado en guardián/guardiana/vigilante/centinela/vigía/protector/pilar. En español.' },
        hookLine: { type: 'STRING', description: 'Una sola frase intrigante, en segunda persona, que presenta el centro del mapa.' },
        axis: { type: 'STRING', description: 'En 2 a 3 frases (interno, no se muestra): la contradicción real que une las respuestas — qué dice la persona de sí y qué dejan ver sus otras respuestas, citando las respuestas que chocan.' },
        closingLine: { type: 'STRING', description: 'Una frase final memorable, catártica, en segunda persona, que cierra el mapa.' }
    },
    required: ['archetypeName', 'hookLine', 'axis', 'closingLine']
};
const validAxis = d => d && d.archetypeName && d.hookLine && d.axis && d.closingLine;

function axisPrompt(transcript) {
    return `Eres quien escribe "¿Quién eres en realidad?", una experiencia de autoconocimiento. La lectura es un MAPA simbólico del inconsciente de la persona: un centro y 10 revelaciones.

Respuestas de la persona:
${transcript}

${RULES}

Ahora define SOLO el eje del mapa. Busca UNA contradicción real entre lo que la persona dice de sí misma y lo que sus otras respuestas dejan ver. Si en sus respuestas aparece con fuerza un tema recurrente (por ejemplo, la traición o la mentira), úsalo como columna del eje. Nunca inventes un "secreto". El nombre del arquetipo debe nacer de ESA contradicción específica y evitar por completo el campo guardián/vigilante/centinela/vigía/protector/pilar.`;
}

// ---------- Paso 2: los rubros ----------
const NODES_SCHEMA = {
    type: 'OBJECT',
    properties: {
        nodes: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    label: { type: 'STRING', description: 'Etiqueta de 1 a 3 palabras sencillas y evocadoras (ej. "Tu máscara", "Lo que callas", "La puerta cerrada"). Máx. 24 caracteres.' },
                    hook: { type: 'STRING', description: 'De 10 a 16 palabras, en segunda persona. Nombra un símbolo o un detalle concreto de SUS respuestas y deja claro que hay algo más detrás, SIN revelarlo ni resolverlo. Nunca genérico.' },
                    text: { type: 'STRING', description: 'La revelación completa: 95 a 130 palabras, segunda persona. Estructura: parte de una respuesta real (cítala), la traduce en un símbolo concreto, nombra lo que ese símbolo revela de fondo (incómodo pero cierto) y termina con una frase catártica que libera.' }
                },
                required: ['label', 'hook', 'text']
            }
        }
    },
    required: ['nodes']
};

function chunkPrompt(transcript, axis, indexes) {
    const list = indexes.map((idx, k) => `${k + 1}. ${THEMES[idx]}`).join('\n');
    return `Eres quien escribe "¿Quién eres en realidad?", una experiencia de autoconocimiento. La lectura es un MAPA simbólico del inconsciente de la persona; cada "revelación" traduce sus respuestas como si fueran metáforas de una realidad más honda, más oscura y más interesante que la que cree vivir, pero reveladora y catártica: lo que respondió es la sombra, y tú describes el objeto que la proyecta.

Respuestas de la persona:
${transcript}

EJE DEL MAPA (ya decidido; todas las revelaciones deben ser coherentes con esto, sin contradecirlo ni repetirlo):
${axis.axis}
Arquetipo: ${axis.archetypeName}

${RULES}

Escribe EXACTAMENTE ${indexes.length} revelaciones, en este orden, una por cada rubro:
${list}

Cada revelación debe poder leerse sola, usar un símbolo DISTINTO a las demás y apoyarse en respuestas concretas de la persona (cita o parafrasea). El "hook" es lo que se ve cuando la revelación está bloqueada: tiene que intrigar nombrando algo concreto de sus respuestas o el símbolo, sin adelantar lo que dice el "text".`;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const answers = sanitizeAnswers(body.answers);
    if (!answers) return json(400, { error: 'Faltan las respuestas del cuestionario.' });
    const transcript = transcriptOf(answers);

    try {
        const axis = await generateWithRetries(axisPrompt(transcript), AXIS_SCHEMA, validAxis, { tag: 'map-axis', maxOutputTokens: 1024, temperature: 0.85 });

        const parts = await Promise.all(CHUNKS.map((idxs, c) => generateWithRetries(
            chunkPrompt(transcript, axis, idxs),
            NODES_SCHEMA,
            d => d && Array.isArray(d.nodes) && d.nodes.length === idxs.length &&
                d.nodes.every(n => n && n.label && n.hook && n.text && String(n.text).length > 250),
            { tag: `map-nodes-${c}`, maxOutputTokens: 3072, temperature: 0.85 }
        )));

        const flat = parts.flatMap(p => p.nodes);
        const nodes = flat.map((n, i) => ({
            id: i,
            label: String(n.label).slice(0, 28),
            hook: String(n.hook),
            text: String(n.text),
            free: i < FREE_COUNT
        }));

        const readingId = crypto.randomUUID();
        // `full: []` mantiene compatible el formato con capture/get-reading.
        await saveReading(readingId, {
            archetypeName: axis.archetypeName,
            hookLine: axis.hookLine,
            closingLine: axis.closingLine,
            full: [],
            map: { nodes }
        });

        return json(200, {
            readingId,
            archetypeName: axis.archetypeName,
            hookLine: axis.hookLine,
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
