// Piezas compartidas de "Vestirte": ocasiones, esquemas y prompts. Mismo andamiaje de 3 pasos
// que quien-eres (perfil → 5 partes → finalize) y reutiliza su almacén (qer_readings), el pago de
// PayPal y qer-get-reading: el texto de las ocasiones cerradas nunca sale del servidor.
const { UUID_RE, TIME_BUDGET_MS, json, transcriptOf } = require('./qer-map-core');

const SLOTS = ['rostro', 'frente', 'espalda', 'perfil', 'torso'];
const SLOT_LABEL = {
    rostro: 'Rostro de cerca (color de ojos, forma del rostro, tono de piel)',
    frente: 'Cuerpo entero de frente (proporciones frontales)',
    espalda: 'Cuerpo entero de espaldas (hombros, espalda, caderas)',
    perfil: 'Cuerpo entero de perfil (postura y perfil)',
    torso: 'De la cintura para arriba, vestido/a, de frente (hombros, cuello, largo de torso)'
};
const MAX_PHOTO_B64 = 1_300_000; // ~1 MB por foto ya reducida en el navegador

// Las 10 ocasiones. Gratis: la MÁS usada (0) y la MENOS usada (9).
const OCCASIONS = [
    'DÍA A DÍA (la ocasión más usada): lo que se pone entre semana para moverse, hacer mandados y estar cómodo/a sin verse descuidado/a.',
    'TRABAJO U OFICINA: verse competente y a gusto durante ocho horas, según el ambiente que describió.',
    'SALIDA CON AMIGOS: café, almuerzo, cine o paseo; casual pero con intención.',
    'CITA: primera cita o cena especial; lo que lo/la hace sentir seguro/a y destacar sin disfrazarse.',
    'REUNIÓN FAMILIAR Y CELEBRACIONES: cumpleaños, domingos, visitas; cómodo/a, presentable y apropiado/a para varias generaciones.',
    'ENTREVISTA O PRESENTACIÓN IMPORTANTE: proyectar confianza y criterio desde el primer minuto.',
    'VIAJE Y TURISMO: caminar mucho, clima cambiante, maletas livianas, prendas que combinan entre sí.',
    'DEPORTE Y AIRE LIBRE: prendas que se mueven con el cuerpo y se ven bien, sin parecer disfraz.',
    'FIESTA O NOCHE DE BAILE: llamar la atención con estilo, aguantar horas y moverse libre.',
    'BODA Y EVENTOS DE ETIQUETA (la ocasión menos usada): elegante, apropiado/a al código de vestimenta y memorable.'
];
const FREE_IDS = [0, 9];
const CHUNKS = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]];
const TIERS = ['cara', 'intermedia', 'barata'];

const RULES = `Género: usa el estilo de ropa que la persona pidió (femenina, masculina, neutra/mixta) y no asumas nada más; evita marcas de género en el trato ("estás lista/o" → "tu look está listo").
Tono: de estilista de confianza: cálido, concreto y práctico. Segunda persona ("tú"). Palabras sencillas.
Cuerpo: describe SIEMPRE en positivo y en términos de proporciones y de qué prendas, cortes y largos las favorecen. Nada de juicios sobre peso, "defectos", "disimular" ni "adelgazar"; no comentes atractivo físico. No inventes datos que no se ven ni se dijeron (edad exacta, medidas, historia).
Colores: nombra colores reales y comunes (azul petróleo, verde oliva, terracota, marfil…) y da un hex razonable para cada uno.
Honestidad: las fotos son una guía, no una medición; si algo no se aprecia bien, trabaja con lo que sí se ve.`;

// ---------- Paso 1: perfil de estilo (con las fotos) ----------
const PROFILE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        safety: {
            type: 'OBJECT',
            properties: {
                appearsUnder18: { type: 'BOOLEAN', description: 'true si la persona de las fotos aparenta claramente ser menor de 18 años.' },
                explicit: { type: 'BOOLEAN', description: 'true si alguna foto muestra desnudez, ropa interior como única prenda o contenido sexual.' },
                notAPerson: { type: 'BOOLEAN', description: 'true si las fotos no muestran a una persona real (dibujos, objetos, famosos de revista, pantallas, etc.) o si no parecen la misma persona.' },
                unusableSlots: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Fotos (rostro, frente, espalda, perfil, torso) que no muestran lo pedido o están demasiado oscuras/borrosas.' }
            },
            required: ['appearsUnder18', 'explicit', 'notAPerson', 'unusableSlots']
        },
        styleName: { type: 'STRING', description: 'Nombre del perfil de estilo: 2 a 4 palabras evocadoras y específicas (ej. "Elegancia relajada", "Clásico con filo"). En español.' },
        hookLine: { type: 'STRING', description: 'Una frase en segunda persona, atractiva y concreta, que presenta su perfil de estilo.' },
        summary: { type: 'STRING', description: 'Interno, 4 a 6 frases: proporciones y silueta (positivas), tono de piel y subtono (cálido/frío/neutro), color de ojos y cabello, forma del rostro, postura, estatura aproximada si la dio, y qué cortes/largos/escotes/telas la favorecen.' },
        bestColors: {
            type: 'ARRAY',
            items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, hex: { type: 'STRING', description: 'Formato #RRGGBB' } }, required: ['name', 'hex'] },
            description: '6 colores que mejor le quedan por su tono de piel, ojos y cabello.'
        },
        avoidColors: {
            type: 'ARRAY',
            items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, hex: { type: 'STRING' } }, required: ['name', 'hex'] },
            description: '3 colores que le conviene usar lejos del rostro o evitar.'
        },
        closingLine: { type: 'STRING', description: 'Frase final breve y animada sobre su look completo.' }
    },
    required: ['safety', 'styleName', 'hookLine', 'summary', 'bestColors', 'avoidColors', 'closingLine']
};

function profilePrompt(transcript, slots) {
    return `Eres estilista personal y escribes la lectura de "Vestirte". Recibes ${slots.length} fotos de la MISMA persona, vestida, en este orden:
${slots.map((s, i) => `Foto ${i + 1}: ${SLOT_LABEL[s]}`).join('\n')}

Respuestas de la persona:
${transcript}

${RULES}

Primero revisa la seguridad (campo "safety"): marca appearsUnder18 solo si es claro que es menor de 18; explicit si hay desnudez o contenido sexual; notAPerson si no son fotos de una persona real; y lista en unusableSlots las fotos que no sirven. Si hay cualquiera de las tres primeras, igual rellena los demás campos con texto breve y neutral.
Después define su perfil de estilo: silueta y proporciones en positivo, tono de piel y subtono, ojos, cabello, forma del rostro, y su paleta (6 colores que le favorecen y 3 a evitar cerca del rostro).`;
}

// ---------- Paso 2: ocasiones ----------
const OPTION_SCHEMA = {
    type: 'OBJECT',
    properties: {
        title: { type: 'STRING', description: 'Nombre corto del conjunto (máx. 40 caracteres).' },
        pieces: { type: 'ARRAY', items: { type: 'STRING' }, description: '3 a 5 prendas concretas con corte/largo/tela (ej. "pantalón recto de lino, cintura alta").' },
        colors: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, hex: { type: 'STRING', description: '#RRGGBB' } }, required: ['name', 'hex'] }, description: '2 a 4 colores del conjunto, tomados de su paleta.' },
        style: { type: 'STRING', description: 'Una frase (máx. 20 palabras) con el estilo y por qué le favorece.' },
        tip: { type: 'STRING', description: 'Un consejo práctico (máx. 20 palabras): accesorio, calzado o cómo ahorrar en esta opción.' }
    },
    required: ['title', 'pieces', 'colors', 'style', 'tip']
};
const NODES_SCHEMA = {
    type: 'OBJECT',
    properties: {
        nodes: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    label: { type: 'STRING', description: 'Nombre de la ocasión (máx. 34 caracteres).' },
                    hook: { type: 'STRING', description: '10 a 16 palabras en segunda persona que despiertan curiosidad por esa ocasión, mencionando un color o prenda clave de SU perfil, sin revelar las opciones.' },
                    why: { type: 'STRING', description: '1 a 2 frases: qué buscar en esta ocasión para SU silueta y SUS colores.' },
                    options: { type: 'ARRAY', items: OPTION_SCHEMA, description: 'EXACTAMENTE 3 opciones, en este orden: 1) cara (inversión alta, calidad y materiales nobles), 2) intermedia, 3) barata (accesible, tiendas de ropa económica o segunda mano).' }
                },
                required: ['label', 'hook', 'why', 'options']
            }
        }
    },
    required: ['nodes']
};

function chunkPrompt(transcript, profile, indexes) {
    const list = indexes.map((idx, k) => `${k + 1}. ${OCCASIONS[idx]}`).join('\n');
    return `Eres estilista personal y escribes la lectura de "Vestirte". Debes recomendar ropa para ocasiones concretas, a partir del perfil visual y las respuestas de la persona.

Respuestas de la persona:
${transcript}

PERFIL DE ESTILO (ya definido):
Nombre: ${profile.styleName}
${profile.summary}
Colores que le favorecen: ${(profile.bestColors || []).map(c => c.name).join(', ')}
Colores a evitar cerca del rostro: ${(profile.avoidColors || []).map(c => c.name).join(', ')}

${RULES}

Escribe EXACTAMENTE ${indexes.length} ocasiones, en este orden:
${list}

Cada ocasión lleva 3 opciones (cara, intermedia, barata) que dan el MISMO look en tres niveles de presupuesto, respetando su presupuesto habitual, su clima, su talla y lo que dijo que ama u odia. Sé específico/a con prendas y colores; no uses marcas. Sé breve: la utilidad está en lo concreto.`;
}

const normHex = (h, fallback = '#9a9a9a') => /^#[0-9a-fA-F]{6}$/.test(String(h || '').trim()) ? String(h).trim().toLowerCase() : fallback;
const cleanColors = (arr, max) => (Array.isArray(arr) ? arr : []).slice(0, max).filter(c => c && c.name).map(c => ({ name: String(c.name).slice(0, 32), hex: normHex(c.hex) }));

function validNode(n) {
    return n && n.label && n.hook && n.why && Array.isArray(n.options) && n.options.length === 3 &&
        n.options.every(o => o && o.title && Array.isArray(o.pieces) && o.pieces.length >= 2 && Array.isArray(o.colors) && o.colors.length >= 2 && o.style && o.tip);
}

// Convierte una ocasión del modelo en lo que se guarda: `text` es JSON (el cliente lo dibuja) y
// `plain` es solo para contar palabras.
function packNode(n) {
    const options = n.options.slice(0, 3).map((o, i) => ({
        tier: TIERS[i],
        title: String(o.title).slice(0, 60),
        pieces: o.pieces.slice(0, 5).map(p => String(p).slice(0, 120)),
        colors: cleanColors(o.colors, 4),
        style: String(o.style).slice(0, 220),
        tip: String(o.tip).slice(0, 220)
    }));
    const text = JSON.stringify({ why: String(n.why).slice(0, 320), options });
    const plain = [n.why, ...options.flatMap(o => [o.title, ...o.pieces, o.style, o.tip])].join(' ');
    return { label: String(n.label).slice(0, 40), hook: String(n.hook), text, plain };
}

const wordCount = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

// Lo único que viaja al navegador: texto SOLO en las ocasiones gratis.
function publicNodes(nodes) {
    return nodes.map(n => n.free
        ? { id: n.id, label: n.label, hook: n.hook, free: true, words: wordCount(n.plain), text: n.text }
        : { id: n.id, label: n.label, hook: n.hook, free: false, words: wordCount(n.plain) });
}

module.exports = { SLOTS, SLOT_LABEL, MAX_PHOTO_B64, OCCASIONS, FREE_IDS, CHUNKS, TIERS, PROFILE_SCHEMA, NODES_SCHEMA, profilePrompt, chunkPrompt, validNode, packNode, publicNodes, cleanColors, wordCount, UUID_RE, TIME_BUDGET_MS, json, transcriptOf };
