// Piezas compartidas de la oferta de canción: estilos permitidos, validación de teléfono y el prompt de la letra.
// La letra se escribe SOLO con el arquetipo, el gancho y los capítulos ya abiertos (gratis): nunca con los
// capítulos cerrados ni con las respuestas literales del cuestionario.
const STYLES = ['Balada suave', 'Pop', 'Acústica', 'Rock suave', 'Bolero', 'Urbano suave', 'Sorpréndeme'];

// Acepta "+598 99 123 456", "+598-99123456", "00598 99123456"… y devuelve "+59899123456" (E.164) o null.
function normalizePhone(raw) {
    let s = String(raw || '').trim().replace(/[\s().\-]/g, '');
    if (s.startsWith('00')) s = '+' + s.slice(2);
    if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
    return s;
}

// Nombre opcional que la persona quiere en la letra: solo letras (cualquier idioma), espacios, apóstrofo y guion,
// máx. 30 caracteres. Nada más pasa: así no puede colarse texto que le dé órdenes al modelo.
function cleanName(raw) {
    const s = String(raw || '').normalize('NFC').replace(/\s+/g, ' ').trim();
    if (!s || s.length > 30) return '';
    return /^[\p{L}][\p{L} '’-]*$/u.test(s) ? s : '';
}

const LYRICS_SCHEMA = {
    type: 'OBJECT',
    properties: {
        title: { type: 'STRING', description: 'Título de la canción: 2 a 6 palabras, sin comillas.' },
        lyrics: { type: 'STRING', description: 'La letra completa con marcas entre corchetes en líneas propias: [Verso 1], [Estribillo], [Verso 2], [Estribillo], [Puente], [Estribillo]. Entre 16 y 28 líneas cantables, rima sencilla, sin pasar de 1100 caracteres en total.' }
    },
    required: ['title', 'lyrics']
};
const validLyrics = d => d && d.title && d.lyrics && String(d.lyrics).length > 250 && String(d.lyrics).length < 2200;

function lyricsPrompt(base, freeNodes, style, name) {
    const chapters = freeNodes.map(n => `- ${n.label}: ${String(n.text).replace(/\s+/g, ' ').slice(0, 520)}`).join('\n');
    return `Eres letrista. Escribe la letra de una canción en español para una persona, inspirada en su "lectura" simbólica de autoconocimiento (no es un diagnóstico).

Arquetipo de la persona: ${base.archetypeName}
Frase que la presenta: ${base.hookLine}
Fragmentos de su lectura:
${chapters}

Estilo musical pedido: ${style === 'Sorpréndeme' ? 'elige tú el estilo que mejor le quede a esta historia' : style}.

Reglas:
${name ? `- La persona pidió que la canción lleve su nombre: «${name}». Es una DEDICATORIA: el primer verso empieza nombrándola («${name}») y la canción se le dirige a ella en segunda persona ("tú", "te"), como una carta cantada. Inclúyelo tal cual está escrito, 2 o 3 veces en total (por ejemplo en el estribillo). Úsalo solo como nombre: no deduzcas su género ni inventes nada a partir de él.\n` : ''}${name ? '- Íntima y concreta; usa las imágenes de la lectura (puertas, espejos, cuartos, agua…), no explicaciones.' : '- Escríbela en PRIMERA PERSONA ("yo", "me", "mi"), como si la persona misma la cantara: que suene a lo que esa persona diría de sí, no a lo que alguien le dice. Íntima y concreta; usa las imágenes de la lectura (puertas, espejos, cuartos, agua…), no explicaciones.'}
- QUE SEA SUYA DESDE EL PRIMER VERSO: las dos primeras líneas deben llevar algo que solo esta persona reconocería (la imagen de su arquetipo, su gancho o un detalle concreto de los fragmentos), no versos que le sirvan a cualquiera ("tu corazón", "el tiempo pasa", "hay una luz"). El título también debe sonar a ella. Prueba: si esas dos líneas funcionarían igual para otra persona, reescríbelas.
- NO asumas el género de la persona: evita adjetivos y participios con marca de género dirigidos a ella.
- NO inventes nombres (salvo el que se te dio arriba), edades, lugares ni hechos personales. Nada de diagnósticos ni palabras clínicas.
- Si aparece duelo, abuso o daño, trátalo con respeto; que la canción termine en alivio y permiso, nunca en culpa.
- Palabras sencillas y cantables, versos cortos, rima natural (no forzada). Un estribillo fácil de recordar.
- Estructura con marcas entre corchetes en líneas propias: [Verso 1], [Estribillo], [Verso 2], [Estribillo], [Puente], [Estribillo].`;
}

module.exports = { STYLES, normalizePhone, cleanName, LYRICS_SCHEMA, validLyrics, lyricsPrompt };
