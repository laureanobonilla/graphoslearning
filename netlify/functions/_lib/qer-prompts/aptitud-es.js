// Prompts del formato "paid-aptitud-es": «Descubre cómo ser mejor profesional y ganar más dinero» (/aptitud/).
// Examen de aptitudes de 15 a 50 preguntas (aptitud/config.js). El informe tiene 10 partes en 4 rubros:
//   A. Tus aptitudes fuertes y cómo explorarlas (partes 1-3)
//   B. Lo que te frena (parte 4)
//   C. Cómo aprender lo que necesitas: ruta y métodos (partes 5-7)
//   D. Cómo convertirlo en ingresos (partes 8-10)
// Módulo autónomo (no importa qer-map-core: evita la dependencia circular). Mismos campos del eje que los demás formatos.

// Ejercicios con respuesta correcta. La clave es el texto EXACTO de la pregunta en aptitud/config.js.
const KEY = {
    'Ejercicio rápido: si 3 cuadernos cuestan 2.400, ¿cuánto cuestan 5?': { area: 'numérico', ok: '4.000' },
    'Completa la serie: 2, 6, 12, 20, 30, …': { area: 'lógico (series)', ok: '42' },
    'Todos los vendedores de la tienda usan uniforme. Ana usa uniforme. ¿Qué podemos asegurar?': { area: 'lógico (deducción)', ok: 'No podemos asegurar si Ana es vendedora' },
    '¿Cuál de estas palabras NO pertenece al grupo?': { area: 'verbal (categorías)', ok: 'Clavo' },
    'Un producto costaba 10.000. Sube un 20 % y luego baja un 20 %. ¿Cuánto cuesta ahora?': { area: 'numérico (porcentajes)', ok: '9.600' },
    'Si hoy es miércoles, ¿qué día será dentro de 10 días?': { area: 'atención y cálculo', ok: 'Sábado' },
    'Pedro es más alto que Luis. Luis es más alto que Marco. ¿Quién es el más bajo?': { area: 'lógico (relaciones)', ok: 'Marco' },
    'Elige la palabra que completa mejor la frase: «Para rendir más, primero hay que ___ las tareas».': { area: 'verbal (comprensión)', ok: 'Priorizar' },
    'Cuatro personas terminan un trabajo en 6 días. Al mismo ritmo, ¿en cuántos días lo terminan 8 personas?': { area: 'numérico (proporciones)', ok: '3' }
};

const THEMES = [
    // A. Aptitudes
    'TU APTITUD PRINCIPAL: la fortaleza más clara que muestran sus respuestas y sus ejercicios. Di cuál es, en qué respuestas se nota (conecta al menos dos respuestas lejanas) y por qué vale dinero en el mercado. Es el corazón del informe.',
    'TUS OTRAS FORTALEZAS: dos aptitudes más que se ven en sus respuestas, cómo se combinan con la principal y qué tipo de trabajos o servicios aprovechan esa combinación.',
    'CÓMO EXPLORAR TUS FORTALEZAS: tres experimentos pequeños y concretos (de 1 a 2 semanas cada uno) para comprobar en la práctica qué aptitud le rinde más, con qué señal sabrá que funcionó.',
    // B. Lo que frena
    'LO QUE TE ESTÁ FRENANDO: el patrón real que sus respuestas dejan ver (por ejemplo dejar cosas a medias, cobrar poco, evitar vender, estudiar sin método), dicho con respeto, y tres maneras prácticas de desactivarlo.',
    // C. Aprendizaje
    'CÓMO APRENDES DE VERDAD: su forma de aprender según sus respuestas (qué le funciona y qué le hace olvidar o abandonar) y el método de estudio concreto que mejor le va, con detalles: cuánto tiempo por sesión, cómo tomar notas, cómo repasar. Si le sirven los esquemas, puedes sugerir hacer mapas mentales (por ejemplo con Graphikosmos), sin insistir.',
    'QUÉ APRENDER PRIMERO: las tres habilidades que, por su perfil y su meta, más podrían subir sus ingresos, en orden de prioridad, y por qué esas y no otras. Responde también, si encaja aquí, la pregunta que hizo sobre su futuro profesional.',
    'TU RUTA DE 90 DÍAS: un plan paso a paso, en tres etapas de 30 días (cada etapa en su propio párrafo, que empiece con "Días 1 a 30:", "Días 31 a 60:" y "Días 61 a 90:"), ajustado al tiempo que dijo tener por semana, con tipos de recursos concretos (cursos cortos gratuitos o de bajo costo, videos, libros, práctica con personas reales).',
    // D. Ingresos
    'CÓMO CONVERTIRLO EN INGRESOS: tres caminos realistas para ganar más con sus aptitudes (por ejemplo un servicio que puede ofrecer, un ascenso o cambio de puesto, un pequeño negocio en paralelo), cada uno con qué necesita, cuánto tarda en dar frutos y cómo empezar. Nada de promesas de dinero fácil.',
    'TU PRIMER PASO ESTA SEMANA: una sola acción concreta para los próximos 7 días, pequeña pero que mueva la aguja, explicada paso a paso, y cómo cobrar o poner precio a lo que ofrece si aplica.',
    'TU PLAN EN UNA PÁGINA: el cierre. Resume en pocas frases su aptitud principal, lo que lo frena, qué aprender, su ruta y su primer paso, y termina con una frase que dé confianza y ganas de empezar hoy.'
];

const RULES = `Idioma: español neutro latinoamericano. Tutea a la persona ("tú"). Nada de voseo ni de vosotros.
Género: NO asumas el género de la persona. Evita adjetivos y participios con marca de género dirigidos a ella (en vez de "estás preparado" usa "tienes lo necesario"; en vez de "eres organizada" usa "tu orden"). Solo usa género si sus respuestas lo declaran.
Tono: un orientador profesional cálido, directo y práctico, que de verdad leyó todas las respuestas. Concreto, nunca genérico: cada idea debe apoyarse en algo que la persona respondió o escribió. Que se sienta escrito para ESTA persona y no para cualquiera.

SOBRE LAS RESPUESTAS: la mayoría son opciones elegidas de una lista (a veces escritas por la persona con sus palabras), más algunas respuestas abiertas, que pesan más. No repitas las opciones como si fueran frases suyas (nada de "elegiste…" ni "marcaste…"): lee los PATRONES entre respuestas y conecta respuestas lejanas entre sí. Cuando cites, usa lo que la persona escribió con sus palabras. Puede haber respondido entre 15 y 50 preguntas: usa lo que haya; si respondió pocas, apóyate más en sus respuestas abiertas y no inventes lo que falta.

SOBRE LOS EJERCICIOS: algunas preguntas son ejercicios con respuesta correcta; vienen marcados con [EJERCICIO] y si acertó o no. Úsalos con tacto para estimar su razonamiento numérico, lógico y verbal: un error no es un defecto, es una pista de qué practicar. "No estoy seguro" cuenta como no respondido.

MUY IMPORTANTE sobre la honestidad: es una orientación, no una prueba psicométrica oficial. No inventes datos personales que no dio (edad, país, títulos, empresas). No prometas ingresos ni cifras de dinero concretas; habla de caminos y de pasos. Nada de etiquetas clínicas. Si recomiendas recursos, describe el tipo (curso corto gratuito, video, libro, práctica con clientes) en vez de inventar nombres de cursos o instituciones.

MUY IMPORTANTE sobre el lenguaje: palabras sencillas, frases cortas y medianas, nada de jerga de recursos humanos ni de coaching vacío ("sal de tu zona de confort", "cree en ti"). Debe entenderse al vuelo desde el celular. Usa ejemplos concretos y verbos de acción.`;

function transcriptOf(answers) {
    let tried = 0, right = 0;
    const lines = answers.map((a, i) => {
        const k = KEY[a.question];
        if (!k) return `${i + 1}. ${a.question}\nRespuesta: ${a.answer}`;
        const ans = String(a.answer || '').trim();
        const unsure = !ans || /^no estoy seguro$/i.test(ans);
        if (!unsure) { tried++; if (ans === k.ok) right++; }
        const verdict = unsure ? 'no lo intentó' : (ans === k.ok ? 'CORRECTA' : `incorrecta (la correcta es ${k.ok})`);
        return `${i + 1}. [EJERCICIO ${k.area}] ${a.question}\nRespuesta: ${ans || '(sin respuesta)'} → ${verdict}`;
    });
    const summary = tried ? `\n\nRESUMEN DE EJERCICIOS: ${right} correctas de ${tried} intentadas.` : '';
    return lines.join('\n\n') + summary;
}

const AXIS_SCHEMA = {
    type: 'OBJECT',
    properties: {
        archetypeName: { type: 'STRING', description: 'Nombre del perfil profesional de esta persona: de 2 a 5 palabras sencillas que combinen sus dos aptitudes más fuertes (ej. "Organizador que enseña", "Mente práctica y vendedora"). Sin marca de género. En español.' },
        hookLine: { type: 'STRING', description: 'Una sola frase, en segunda persona, que nombra algo concreto y valioso de su perfil y deja claro que el informe le dice cómo aprovecharlo para ganar más. Sin prometer dinero.' },
        axis: { type: 'STRING', description: 'Interno (no se muestra), 3 a 5 frases: su aptitud principal y dos secundarias con las respuestas que las respaldan, el resultado de los ejercicios, cómo aprende, qué lo frena, su meta de ingresos y el tiempo que tiene por semana.' },
        closingLine: { type: 'STRING', description: 'Una frase final, en segunda persona, que dé confianza y ganas de dar el primer paso hoy. Sin promesas de dinero.' }
    },
    required: ['archetypeName', 'hookLine', 'axis', 'closingLine']
};

const NODES_SCHEMA = {
    type: 'OBJECT',
    properties: {
        nodes: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    label: { type: 'STRING', description: 'Título de la parte: de 3 a 7 palabras sencillas y específicas de esta persona (ej. "Tu talento para ordenar el caos"). Máx. 52 caracteres.' },
                    hook: { type: 'STRING', description: 'De 12 a 20 palabras, en segunda persona. Es lo que se ve antes de pagar: nombra algo concreto de SUS respuestas y anticipa qué encontrará en esta parte (un método, un camino, un paso), SIN darlo.' },
                    text: { type: 'STRING', description: 'La parte completa, en 3 o 4 párrafos separados por una línea en blanco, de 160 a 230 palabras en total. Práctica y concreta, apoyada en sus respuestas.' }
                },
                required: ['label', 'hook', 'text']
            }
        }
    },
    required: ['nodes']
};

function axisPrompt(transcript) {
    return `Eres quien escribe el informe del examen "Descubre cómo ser mejor profesional y ganar más dinero". Con las respuestas de la persona armas un informe de orientación profesional en 10 partes: sus aptitudes fuertes y cómo explorarlas, lo que la frena, cómo aprender lo que necesita (ruta y métodos) y cómo convertirlo en ingresos.

Respuestas de la persona:
${transcript}

${RULES}

Ahora define SOLO el eje del informe: su perfil profesional (nombre), la frase de entrada, el resumen interno y la frase final.

Rellena también "traits": exactamente 5 APTITUDES (no rasgos de personalidad) con su puntaje de 20 a 95, elegidas de esta lista según lo que más se note en sus respuestas: "Razonamiento numérico", "Razonamiento lógico", "Comunicación", "Persuasión y ventas", "Creatividad", "Organización", "Trato con personas", "Habilidad práctica", "Aprendizaje autónomo", "Liderazgo", "Habilidad digital", "Enseñar a otros". El razonamiento numérico y lógico debe reflejar el resultado de los ejercicios. Varía los puntajes (no todos parecidos). "keyword": una sola palabra que resume su perfil profesional. "quote": una frase de 10 a 18 palabras que lo define como profesional.`;
}

function chunkPrompt(transcript, axis, indexes) {
    const list = indexes.map((idx, k) => `${k + 1}. (parte ${idx + 1} de 10) ${THEMES[idx]}`).join('\n');
    return `Eres quien escribe el informe del examen "Descubre cómo ser mejor profesional y ganar más dinero". El informe tiene 10 partes; tú escribes SOLO las que se te piden ahora.

Respuestas de la persona:
${transcript}

EJE DEL INFORME (ya decidido; todo debe ser coherente con esto, sin repetirlo palabra por palabra):
${axis.axis}
Perfil: ${axis.archetypeName}

${RULES}

Escribe EXACTAMENTE ${indexes.length} partes, en este orden, una por cada tema:
${list}

Cada parte debe poder leerse sola, no repetir los consejos de las otras partes y apoyarse en respuestas concretas de la persona. Cuando des pasos o listas, pon cada paso en su propio párrafo o línea, empezando con un número ("1.", "2.", "3."). El "hook" es lo que se ve antes de pagar: tiene que dar ganas de leer la parte, sin adelantar lo que dice el "text".`;
}

module.exports = { THEMES, KEY, transcriptOf, AXIS_SCHEMA, axisPrompt, NODES_SCHEMA, chunkPrompt };
