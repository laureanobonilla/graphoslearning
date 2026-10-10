// Piezas compartidas de la generación del mapa (temas, reglas, esquemas y
// prompts). La generación va en TRES tipos de llamada separadas, cada una con
// su propio tiempo máximo de función, orquestadas por el navegador:
//   1. qer-generate-map          → el eje (arquetipo, contradicción, frase final)
//   2. qer-generate-map-part x5  → 2 rubros cada una, en paralelo
//   3. qer-generate-map-finalize → ensambla y guarda; devuelve solo lo público
// Antes todo iba en una sola llamada y se pasaba del tiempo máximo de Netlify.
const FREE_COUNT = 3;
const TIME_BUDGET_MS = 24000; // cada función tiene su propio presupuesto (Netlify corta a ~26 s)
const TOTAL_NODES = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
const CHUNKS = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]]; // 5 llamadas en paralelo de 2 rubros

const RULES = `Género: NO asumas el género de la persona ni escribas para un solo género. Evita adjetivos, participios y artículos con marca de género dirigidos a ella (en vez de "estás cansada" usa "el cansancio que cargas"; en vez de "eres sensible" usa "tu sensibilidad"). En el nombre del arquetipo usa sustantivos o formas neutras ("El Guardián" → "Quien guarda…", "Tu Faro Interior"). Solo usa género si sus respuestas lo declaran de forma explícita.
Tono: íntimo, perceptivo y teatral, en segunda persona ("tú"), como alguien que de verdad leyó cada respuesta y conecta detalles entre ellas — nunca como un horóscopo que le quedaría bien a cualquiera. Cita o parafrasea respuestas reales de la persona.

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



// ================== FORMATO "LECTURA" (texto en capítulos) ==================
// Mismo andamiaje de 3 pasos que el mapa, pero cada "nodo" es un CAPÍTULO de una
// lectura de texto: 10 capítulos, los 5 primeros gratis (con el texto completo)
// y los 5 últimos cerrados — de los cerrados solo se ve título, gancho y cuántas
// palabras tienen. Los capítulos cerrados son más largos, para que lo oculto
// sea siempre más de la mitad del texto y nadie pague por "lo que faltaba poco".
// Cuántos capítulos (de 10) se leen completos sin pagar. Se puede cambiar SIN tocar código con la
// variable de entorno READING_FREE_COUNT en Netlify (1 a 9); si no está, son 5. Solo afecta a las
// lecturas que se generen a partir de ahora: las ya generadas conservan lo que se les dio.
const READING_FREE_COUNT = Math.min(9, Math.max(1, parseInt(process.env.READING_FREE_COUNT, 10) || 5));
// LECTURA 100% GRATIS (por defecto): todos los capítulos se entregan completos, sin pago. La monetización
// pasa a ser la canción (qer-song-request). Para volver al modelo con paywall: READING_ALL_FREE=false en Netlify.
// READING_FREE_COUNT sigue marcando el largo de los capítulos (los primeros más cortos) y, con el paywall
// activo, cuántos se leen gratis.
const READING_ALL_FREE = String(process.env.READING_ALL_FREE || '').toLowerCase() !== 'false';
const READING_OPEN_COUNT = READING_ALL_FREE ? TOTAL_NODES : READING_FREE_COUNT;
const READING_THEMES = [
    'LO PRIMERO QUE SE NOTA: la contradicción central entre lo que la persona dice de sí misma y lo que sus otras respuestas dejan ver. Es el corazón de la lectura; abre con una imagen potente.',
    'LA MÁSCARA: la versión de sí misma que muestra a los demás, a quién protege de verdad y cuánto cuesta sostenerla.',
    'LO QUE CALLA: lo que no dice en voz alta y lo que ese silencio fue construyendo por dentro, como una habitación que se va llenando.',
    'LA HERIDA DE FONDO: lo que más le duele o le cuesta perdonar (traición, mentira, abandono… según sus respuestas) leído como el símbolo de una herida más antigua que la que cree.',
    'EL CUARTO CERRADO: lo que guarda aun de sí misma, lo que evita mirar. Este capítulo termina dejando claro que hay una puerta más adelante (sin revelar qué hay detrás).',
    'CUANDO NADIE VE: cómo es de verdad a solas y qué dice eso de la persona que más se parece a ella misma.',
    'LA SOMBRA: lo que desea y se prohíbe, y cómo ese deseo prohibido termina gobernando sus decisiones desde atrás.',
    'LO QUE CARGA POR OTROS: lo que sostiene sin que nadie se lo pida y la factura silenciosa de hacerlo.',
    'LO QUE NECESITA OÍR: lo que lleva años esperando que alguien le diga, y por qué no deja que se lo digan.',
    'LA CARTA PENDIENTE: el cierre catártico. Qué puede soltar, qué se le permite por fin, y lo que le diría su versión más honesta. Termina con alivio.'
];

const READING_RULES = `Género: NO asumas el género de la persona ni escribas para un solo género. Evita adjetivos, participios y artículos con marca de género dirigidos a ella (en vez de "estás cansada" usa "el cansancio que cargas"; en vez de "eres sensible" usa "tu sensibilidad"). En el nombre del arquetipo usa sustantivos o formas neutras ("El Guardián" → "Quien guarda…", "Tu Faro Interior"). Solo usa género si sus respuestas lo declaran de forma explícita.
Tono: íntimo, perceptivo y teatral, en segunda persona ("tú"), como alguien que leyó con atención cada una de sus respuestas y por fin las unió — jamás como un horóscopo que le quedaría bien a cualquiera.

LA PERSONA RESPONDIÓ MUCHAS PREGUNTAS ABIERTAS. Úsalas: cita o parafrasea frases reales suyas (entre comillas cuando sirva) y conecta respuestas lejanas entre sí (la de la pregunta 4 con la de la 37…). Esas conexiones inesperadas son lo que la va a sorprender.

CÓMO SE ESCRIBE CADA CAPÍTULO:
1. Abre con una IMAGEN concreta y cotidiana (una puerta entreabierta, una casa con un cuarto sin luz, una deuda que nadie cobra, un espejo empañado, agua quieta, una maleta que nunca se desarma) que traduzca algo que la persona dijo.
2. Tradúcelo como METÁFORA: lo que respondió es la sombra; tú describes el objeto que la proyecta, una realidad más honda, más oscura y más interesante que la que cree vivir.
3. Da un GIRO que sorprenda: "lo que parece X en realidad es Y". Que haya al menos una frase que la persona querría subrayar y mandarle a alguien.
4. Cierra con ALIVIO: una frase que libera, que le da permiso o nombra lo que por fin puede soltar. La lectura entera es una catarsis, no un regaño.

MUY IMPORTANTE sobre el lenguaje: palabras sencillas y cotidianas, las de un amigo que habla en serio. La profundidad viene de las IMÁGENES y de los giros, nunca de vocabulario técnico ni de sustantivos abstractos encadenados ("arquitectura emocional", "dialéctica", "cartografía defensiva"). Frases cortas y medianas. Debe entenderse al vuelo desde el celular.

MUY IMPORTANTE sobre la honestidad: habla de lo que SUS RESPUESTAS dejan ver, no de certezas absolutas. Nunca inventes hechos personales que no dio (edad, nombres, historia). Nada de diagnósticos ni etiquetas clínicas ("trastorno", "trauma", "depresión", "adicta", "narcisista"…): es una interpretación simbólica con fines de autoconocimiento y entretenimiento.

MUY IMPORTANTE sobre lo delicado: si alguna respuesta menciona duelo, abuso, una adicción o daño, trátala con respeto: no la uses como golpe dramático ni la conviertas en etiqueta, y haz que la catarsis sea de alivio y de permiso, nunca de culpa.`;

const READING_NODES_SCHEMA = {
    type: 'OBJECT',
    properties: {
        nodes: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    label: { type: 'STRING', description: 'Título del capítulo: de 3 a 7 palabras sencillas, evocador y específico de esta persona (ej. "La puerta que dejas entornada"). Máx. 52 caracteres.' },
                    hook: { type: 'STRING', description: 'De 12 a 20 palabras, en segunda persona. Es lo que se ve si el capítulo está cerrado: nombra un símbolo o un detalle concreto de SUS respuestas y deja claro que hay más detrás, SIN revelarlo ni resolverlo. Nunca genérico.' },
                    text: { type: 'STRING', description: 'El capítulo completo, en 2 o 3 párrafos separados por una línea en blanco. Sigue la estructura indicada en el prompt (imagen, metáfora, giro, alivio).' }
                },
                required: ['label', 'hook', 'text']
            }
        }
    },
    required: ['nodes']
};

function readingAxisPrompt(transcript) {
    return `Eres quien escribe "¿Quién eres en realidad?", una experiencia de autoconocimiento. La lectura es un texto largo en 10 capítulos, escrito a partir de 50 respuestas abiertas.

Respuestas de la persona:
${transcript}

${READING_RULES}

Ahora define SOLO el eje de la lectura. Busca UNA contradicción real entre lo que la persona dice de sí misma y lo que sus otras respuestas dejan ver, y detecta los dos o tres temas que se repiten a lo largo de sus respuestas (por ejemplo la traición, la mentira, el cansancio de sostenerlo todo). Nunca inventes un "secreto". El nombre del arquetipo debe nacer de ESA contradicción específica y evitar por completo el campo guardián/vigilante/centinela/vigía/protector/pilar. La frase final debe ser catártica.`;
}

function readingChunkPrompt(transcript, axis, indexes, opts) {
    const freeCount = (opts && opts.freeCount) || READING_FREE_COUNT;
    const paywall = opts && typeof opts.paywall === 'boolean' ? opts.paywall : !READING_ALL_FREE;
    const list = indexes.map((idx, k) => {
        const words = idx < freeCount ? '120 a 150 palabras' : '150 a 190 palabras';
        // El último capítulo que se lee completo sin pagar cierra con una pregunta abierta (suspenso narrativo):
        // la última frase deja pendiente algo concreto sobre ESA persona, sin responderlo.
        const cliff = paywall && idx === freeCount - 1
            ? ' ÚLTIMA FRASE OBLIGATORIA: termina este capítulo con una sola frase que deje abierta una pregunta concreta sobre ESTA persona, basada en algo que escribió (algo que el capítulo no resuelve ni explica). No la respondas, no menciones capítulos siguientes, lectura, pago ni desbloqueo.'
            : '';
        return `${k + 1}. (${words}) ${READING_THEMES[idx]}${cliff}`;
    }).join('\n');
    return `Eres quien escribe "¿Quién eres en realidad?", una experiencia de autoconocimiento. La lectura es un texto largo en 10 capítulos; tú escribes SOLO los capítulos que se te piden ahora.

Respuestas de la persona:
${transcript}

EJE DE LA LECTURA (ya decidido; todos los capítulos deben ser coherentes con esto, sin contradecirlo ni repetirlo):
${axis.axis}
Arquetipo: ${axis.archetypeName}

${READING_RULES}

Escribe EXACTAMENTE ${indexes.length} capítulos, en este orden, uno por cada tema, respetando la extensión indicada entre paréntesis:
${list}

Cada capítulo debe poder leerse solo, usar imágenes DISTINTAS a las de los demás y apoyarse en respuestas concretas de la persona. El "hook" es lo que se ve cuando el capítulo está cerrado: tiene que intrigar nombrando algo concreto de sus respuestas o el símbolo, sin adelantar lo que dice el "text".`;
}

const FORMATS = {
    map:     { freeCount: FREE_COUNT,         themes: THEMES,         chunkPrompt, axisPrompt,                   nodesSchema: NODES_SCHEMA,         minChars: () => 250 },
    reading: { freeCount: READING_OPEN_COUNT, themes: READING_THEMES, chunkPrompt: readingChunkPrompt, axisPrompt: readingAxisPrompt, nodesSchema: READING_NODES_SCHEMA, minChars: (idx) => (idx < READING_FREE_COUNT ? 500 : 650) }
};
// ---- Formatos CON MURO DE PAGO (3 de 10 capítulos abiertos), uno por app: quien-eres, who-are-you,
// quien-es-tu-pareja, who-is-your-partner. Cada uno trae su propio idioma/tema de prompts. ----
const PAID_FREE_COUNT = 0; // todos los capítulos salen cerrados (solo se ve un adelanto de 10 palabras)
const paidMin = (idx) => (idx < PAID_FREE_COUNT ? 500 : 650);
const PAID_ES_NOTE = '\n\nNOTA SOBRE LAS RESPUESTAS: la mayoría son opciones elegidas de una lista (a veces escritas por la persona) más 5 respuestas abiertas, que pesan más. No cites ni repitas literalmente las opciones como si fueran frases suyas (nada de «elegiste…»): lee los PATRONES entre ellas y conviértelos en imágenes y metáforas sorprendentes. Cuando cites, usa sobre todo lo que la persona escribió.';
FORMATS['paid-self-es'] = {
    freeCount: PAID_FREE_COUNT, themes: READING_THEMES, transcriptOf, axisSchema: AXIS_SCHEMA,
    axisPrompt: (t) => readingAxisPrompt(t).replace(/\b50 respuestas/g, '25 respuestas') + PAID_ES_NOTE, nodesSchema: READING_NODES_SCHEMA, minChars: paidMin,
    chunkPrompt: (t, a, i) => readingChunkPrompt(t, a, i, { freeCount: PAID_FREE_COUNT, paywall: true }) + PAID_ES_NOTE
};
function registerPaid(name, file) {
    try {
        const m = require(file);
        FORMATS[name] = {
            freeCount: PAID_FREE_COUNT, transcriptOf: m.transcriptOf, axisSchema: m.AXIS_SCHEMA,
            axisPrompt: m.axisPrompt, nodesSchema: m.NODES_SCHEMA, minChars: paidMin,
            chunkPrompt: (t, a, i) => m.chunkPrompt(t, a, i, { freeCount: PAID_FREE_COUNT })
        };
    } catch (err) { console.error('[qer-map-core] formato', name, 'no disponible:', err.message); }
}
registerPaid('paid-self-en', './qer-prompts/self-en');
registerPaid('paid-partner-es', './qer-prompts/partner-es');
registerPaid('paid-partner-en', './qer-prompts/partner-en');
const formatOf = (name) => FORMATS[name] || FORMATS.map;
const isKnownFormat = (name) => Object.prototype.hasOwnProperty.call(FORMATS, name);

const wordCount = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

// Lo único que puede viajar al navegador: texto SOLO en los nodos gratis.
function publicNodes(nodes) {
    return nodes.map(n => n.free
        ? { id: n.id, label: n.label, hook: n.hook, free: true, words: wordCount(n.text), text: n.text }
        : { id: n.id, label: n.label, hook: n.hook, free: false, words: wordCount(n.text) });
}

module.exports = { isKnownFormat, formatOf, wordCount, READING_FREE_COUNT, FREE_COUNT, TIME_BUDGET_MS, TOTAL_NODES, UUID_RE, json, THEMES, CHUNKS, transcriptOf, AXIS_SCHEMA, validAxis, axisPrompt, NODES_SCHEMA, chunkPrompt, publicNodes };
