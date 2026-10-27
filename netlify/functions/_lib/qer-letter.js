// Carta final del informe de ¿Quién eres?: una carta cálida, escrita a partir de las respuestas reales de la persona.
// Habla de lo valioso de ser alguien con SUS características concretas. No menciona pagos ni presiona.
const SCHEMA = {
    type: 'OBJECT',
    properties: {
        greeting: { type: 'STRING', description: 'Una o dos frases de bienvenida cálidas para abrir el informe (máx. 35 palabras), en segunda persona, sin nombre propio.' },
        paragraphs: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Exactamente 4 párrafos de 50 a 90 palabras cada uno, que forman la carta.' },
        farewell: { type: 'STRING', description: 'Una despedida breve y cariñosa (máx. 14 palabras).' }
    },
    required: ['greeting', 'paragraphs', 'farewell']
};
const validate = (d) => d && typeof d.greeting === 'string' && d.greeting.trim() && Array.isArray(d.paragraphs) && d.paragraphs.length >= 3 && d.paragraphs.every(x => typeof x === 'string' && x.trim().length > 40);
const clean = (d) => ({ greeting: d.greeting.trim(), paragraphs: d.paragraphs.slice(0, 5).map(x => x.trim()), farewell: String(d.farewell || '').trim() });

function prompt(transcript, archetype) {
    return `Escribe la carta final del informe personal de alguien que acaba de contestar un cuestionario de autoconocimiento. Su arquetipo se llama "${archetype || 'sin nombre'}".

Sus respuestas:
${transcript}

Quien escribe combina dos miradas: la de un psicólogo cálido que escucha sin juzgar y la de un buen diseñador que cuida cada detalle para que quien lee se sienta cuidado. Tono: cercano, sincero, tierno, en español, en segunda persona, con palabras de todos los días (como a un amigo querido), sin tecnicismos ni frases de ensayo.

Reglas:
- La carta tiene que sonar imposible de haber sido escrita sin leer ESTAS respuestas: cita o parafrasea al menos tres detalles concretos que la persona dijo.
- A lo largo de los 4 párrafos, de forma gradual y natural, ve mostrando por qué es valioso que exista alguien con esas características concretas suyas: qué aporta a quienes lo rodean, qué hace posible, qué dejaría de existir sin esa forma suya de ser. Que sea verdad y esté sostenido por sus respuestas, no un elogio genérico ni exagerado.
- Incluye al menos una cosa útil y concreta que pueda hacer esta semana para cuidarse.
- Nunca inventes datos que no dio (edad, nombre, familia). Sin diagnósticos ni etiquetas clínicas.
- No menciones dinero, pagos, contribuciones ni "ayudar a otros a recibir esto". No presiones ni generes culpa.
- No uses signos de exclamación en exceso ni emojis.`;
}
module.exports = { SCHEMA, validate, clean, prompt };
