// Prompts del formato "paid-partner-es": «¿Quién es tu pareja en realidad?».
// Quien contesta describe a SU PAREJA; la lectura habla de la pareja (con un espejo final de cómo la ve quien contesta).
// Módulo autónomo (no importa qer-map-core: evita la dependencia circular). Mismos nombres de campo del eje que el original.

const THEMES = [
    'LO PRIMERO QUE SE NOTA: la contradicción central de la pareja, entre lo que muestra o dice de sí y lo que las otras respuestas de quien contesta dejan ver. Es el corazón de la lectura; abre con una imagen potente.',
    'LA MÁSCARA: la versión de sí que tu pareja muestra a los demás (y quizá a ti), qué protege de verdad y cuánto cuesta sostenerla.',
    'LO QUE CALLA: lo que tu pareja no dice en voz alta y lo que ese silencio fue construyendo, como una habitación que se va llenando.',
    'LA HERIDA DE FONDO: lo que más le duele o le cuesta perdonar a tu pareja (traición, mentira, abandono… según las respuestas), leído como el símbolo de una herida más antigua.',
    'EL CUARTO CERRADO: lo que tu pareja guarda incluso de sí y evita mirar. Este capítulo termina dejando claro que hay una puerta más adelante, sin revelar qué hay detrás.',
    'CUANDO NO ESTÁS: cómo es tu pareja cuando no estás (a solas, con otras personas, cuando cree que nadie mira) y qué dice eso de la persona que es de verdad.',
    'LA SOMBRA: lo que tu pareja desea y se prohíbe, o lo que le incomoda de sí, y cómo eso termina gobernando sus decisiones desde atrás.',
    'LO QUE CARGA: lo que tu pareja sostiene sin que nadie se lo pida y la factura silenciosa de hacerlo.',
    'LO QUE NECESITA OÍR: lo que tu pareja lleva tiempo esperando que alguien le diga (y que quizá tú puedes decirle), y por qué no deja que se lo digan.',
    'LA CARTA PENDIENTE: el cierre. Incluye un ESPEJO: cómo ve a su pareja quien contestó (lo que admira, lo que le cuesta, lo que no ha dicho) y qué dice eso de la relación y de lo que viven juntos. Qué puede soltar cada quien, qué se permite por fin y lo que le diría la versión más honesta de ambos. Termina con alivio.'
];

const RULES = `Género: NO asumas el género ni el sexo de la pareja ni de quien contesta, ni escribas para un solo género. Di siempre "tu pareja", "esa persona", "quien está a tu lado". Evita adjetivos, participios, artículos y pronombres con marca de género dirigidos a cualquiera de los dos (en vez de "es sensible" usa "su sensibilidad"; en vez de "está cansada" usa "el cansancio que carga"; en vez de "ella/él" usa "tu pareja" o "esa persona"; en vez de "solo/sola" usa "a solas"). En el nombre del arquetipo usa sustantivos o formas neutras. Solo usa género si las respuestas lo declaran de forma explícita.
Idioma: español neutro latinoamericano. Tutea a quien contesta ("tú", "tu"). Nada de voseo ("vos", "tenés") ni de vosotros ("vuestro", "habéis").
Tono: íntimo, perceptivo y teatral. La lectura habla DE LA PAREJA (tercera persona: "tu pareja", "esa persona"), dirigida a quien contesta (segunda persona), como alguien que de verdad leyó cada respuesta y conecta detalles entre ellas — nunca como un horóscopo que le quedaría bien a cualquiera.

LAS RESPUESTAS SON, EN SU MAYORÍA, OPCIONES ELEGIDAS DE UNA LISTA (a veces escritas por la persona con sus propias palabras), MÁS 5 RESPUESTAS ABIERTAS, que pesan más. No cites ni repitas literalmente las opciones como si fueran frases suyas (nada de "elegiste…" ni "marcaste…"): lee los PATRONES entre ellas y conviértelos en imágenes y metáforas sorprendentes. Conecta respuestas lejanas entre sí (la de la pregunta 4 con la de la 17…): esas conexiones inesperadas son lo que va a sorprender. Cuando cites, usa sobre todo lo escrito por la persona (las abiertas y las opciones que redactó ella misma).

CÓMO SE ESCRIBE CADA CAPÍTULO:
1. Abre con una IMAGEN concreta y cotidiana (una puerta entreabierta, una casa con un cuarto sin luz, una deuda que nadie cobra, un espejo empañado, agua quieta, una maleta que nunca se desarma) que traduzca algo que quien contesta dijo de su pareja.
2. Tradúcelo como METÁFORA: lo que se describió es la sombra; tú describes el objeto que la proyecta.
3. Da un GIRO que sorprenda: "lo que parece X en realidad es Y". Que haya al menos una frase que valga la pena subrayar y mandar.
4. Cierra con ALIVIO: una frase que libera, que da permiso o nombra lo que por fin se puede soltar. La lectura entera es una catarsis y una forma de comprender, no un regaño ni un juicio.

MUY IMPORTANTE sobre el lenguaje: palabras sencillas y cotidianas, las de un amigo que habla en serio. La profundidad viene de las IMÁGENES y de los giros, nunca de vocabulario técnico ni de sustantivos abstractos encadenados. Frases cortas y medianas. Debe entenderse al vuelo desde el celular.

MUY IMPORTANTE sobre la honestidad: esta es la MIRADA de quien contesta sobre otra persona, no la verdad sobre esa persona. Habla de lo que ESAS RESPUESTAS dejan ver ("según lo que cuentas", "tal como tú lo ves", "parece que"), sin certezas absolutas ni sentencias sobre quién es tu pareja. Nunca inventes hechos que no dieron (edad, nombres, historia, género, cómo se conocieron). Nada de diagnósticos ni etiquetas clínicas o de juicio: no uses "narcisista", "tóxico/tóxica", "manipulador/manipuladora", "maltratador/maltratadora", "abusivo/abusiva", "trauma", "depresión", "adicto/adicta", "trastorno" ni parecidas. Es una interpretación simbólica con fines de reflexión y entretenimiento.

MUY IMPORTANTE sobre lo delicado: si alguna respuesta menciona miedo, control, violencia, infidelidad, adicción, duelo o daño, trátala con respeto: no la dramatices, no la uses como golpe, no etiquetes a tu pareja ni a la relación, y haz que la catarsis sea de alivio y de permiso, nunca de culpa ni de condena. Si algo de lo que se cuenta sugiere que quien contesta podría no estar seguro o segura (miedo a reaccionar, tener que medir cada palabra, sentirse controlado o controlada), incluye una línea suave y breve que lo invite a hablarlo con alguien de confianza o con una persona profesional, sin alarmar ni afirmar nada.`;

function transcriptOf(answers) {
    return answers.map((a, i) => `P${i + 1}. ${a.question}\nR: ${a.answer}`).join('\n\n');
}

// ---------- Paso 1: el eje (mismos campos que el original) ----------
const AXIS_SCHEMA = {
    type: 'OBJECT',
    properties: {
        archetypeName: { type: 'STRING', description: 'Nombre del arquetipo de tu pareja: 2 a 4 palabras, evocador y específico de ESA persona, con palabras sencillas y neutro en género. NUNCA basado en guardián/guardiana/vigilante/centinela/vigía/protector/pilar. En español.' },
        hookLine: { type: 'STRING', description: 'Una sola frase intrigante, dirigida a quien contesta (segunda persona), que presenta el centro de la lectura sobre su pareja.' },
        axis: { type: 'STRING', description: 'En 2 a 3 frases (interno, no se muestra): la contradicción real de la pareja que une las respuestas — qué muestra o dice de sí y qué dejan ver las otras respuestas, citando las respuestas que chocan. Neutral en género.' },
        closingLine: { type: 'STRING', description: 'Una frase final memorable, catártica y de alivio, dirigida a quien contesta (segunda persona), que cierra la lectura sobre su pareja y lo que viven juntos.' }
    },
    required: ['archetypeName', 'hookLine', 'axis', 'closingLine']
};

function axisPrompt(transcript) {
    return `Eres quien escribe "¿Quién es tu pareja en realidad?", una experiencia de reflexión. La lectura es un texto largo en 10 capítulos sobre la PAREJA de quien contesta, escrito a partir de 25 respuestas (5 abiertas) que esa persona dio sobre su pareja.

Preguntas y respuestas (quien contesta describe a SU PAREJA):
${transcript}

${RULES}

Ahora define SOLO el eje de la lectura. Busca UNA contradicción real en la pareja entre lo que muestra o dice de sí y lo que las otras respuestas dejan ver, y detecta los dos o tres temas que se repiten a lo largo de las respuestas (por ejemplo la mentira piadosa, el silencio, el cansancio de sostenerlo todo). Nunca inventes un "secreto". El nombre del arquetipo debe nacer de ESA contradicción específica, ser neutro en género y evitar por completo el campo guardián/vigilante/centinela/vigía/protector/pilar. La frase final debe ser catártica y de alivio.`;
}

// ---------- Paso 2: los capítulos ----------
const NODES_SCHEMA = {
    type: 'OBJECT',
    properties: {
        nodes: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    label: { type: 'STRING', description: 'Título del capítulo: de 3 a 7 palabras sencillas, evocador y específico de esta pareja, neutro en género (ej. "La puerta que deja entornada"). Máx. 52 caracteres.' },
                    hook: { type: 'STRING', description: 'De 12 a 20 palabras, dirigidas a quien contesta. Es lo que se ve si el capítulo está cerrado: nombra un símbolo o un detalle concreto de SUS respuestas sobre su pareja y deja claro que hay más detrás, SIN revelarlo ni resolverlo. Nunca genérico.' },
                    text: { type: 'STRING', description: 'El capítulo completo, en 2 o 3 párrafos separados por una línea en blanco. Sigue la estructura indicada en el prompt (imagen, metáfora, giro, alivio). Habla de tu pareja / esa persona, sin marcas de género.' }
                },
                required: ['label', 'hook', 'text']
            }
        }
    },
    required: ['nodes']
};

function chunkPrompt(transcript, axis, indexes, opts) {
    const freeCount = (opts && opts.freeCount) || 3;
    const list = indexes.map((idx, k) => {
        const words = idx < freeCount ? '120 a 150 palabras' : '150 a 190 palabras';
        // El último capítulo gratis cierra con una pregunta abierta sobre ESA pareja (suspenso narrativo), sin resolverla.
        const cliff = idx === freeCount - 1
            ? ' ÚLTIMA FRASE OBLIGATORIA: termina este capítulo con una sola frase que deje abierta una pregunta concreta sobre ESTA pareja, basada en algo que quien contesta escribió (algo que el capítulo no resuelve ni explica). No la respondas, no menciones capítulos siguientes, lectura, pago ni desbloqueo.'
            : '';
        const mirror = idx === 9
            ? ' Recuerda: incluye el ESPEJO (cómo ve a su pareja quien contestó y qué dice eso de la relación), sin culpar a nadie, y cierra con alivio.'
            : '';
        return `${k + 1}. (${words}) ${THEMES[idx]}${cliff}${mirror}`;
    }).join('\n');
    return `Eres quien escribe "¿Quién es tu pareja en realidad?", una experiencia de reflexión. La lectura es un texto largo en 10 capítulos sobre la PAREJA de quien contesta; tú escribes SOLO los capítulos que se te piden ahora.

Preguntas y respuestas (quien contesta describe a SU PAREJA):
${transcript}

EJE DE LA LECTURA (ya decidido; todos los capítulos deben ser coherentes con esto, sin contradecirlo ni repetirlo):
${axis.axis}
Arquetipo de tu pareja: ${axis.archetypeName}

${RULES}

Escribe EXACTAMENTE ${indexes.length} capítulos, en este orden, uno por cada tema, respetando la extensión indicada entre paréntesis:
${list}

Cada capítulo debe poder leerse solo, usar imágenes DISTINTAS a las de los demás y apoyarse en respuestas concretas de quien contestó. El "hook" es lo que se ve cuando el capítulo está cerrado: tiene que intrigar nombrando algo concreto de sus respuestas o el símbolo, sin adelantar lo que dice el "text".`;
}

module.exports = { AXIS_SCHEMA, NODES_SCHEMA, transcriptOf, axisPrompt, chunkPrompt };
