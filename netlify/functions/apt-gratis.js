// Versión GRATIS del examen de aptitudes (/aptitud-gratis/): un resultado corto (perfil, 5 aptitudes, 2 fortalezas y
// 4 áreas para ganar más) y un tema para el primer mapa mental en Graphikosmos. Una sola llamada a Gemini.
// Las respuestas se leen con el mismo formato de transcripción del informe de pago (ejercicios calificados).
const { generateWithRetries, sanitizeAnswers } = require('./_lib/qer-gemini');
const { transcriptOf } = require('./_lib/qer-prompts/aptitud-es');
const { json, scrubOne, ipOf, hashIp, countryOf } = require('./_lib/tc-core');
const store = require('./_lib/store');

const MAX_PER_HOUR_IP = 8;

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        perfil: { type: 'STRING', description: 'Nombre del perfil profesional: de 2 a 5 palabras sencillas que combinen sus dos aptitudes más fuertes. Sin marca de género.' },
        resumen: { type: 'STRING', description: 'Dos frases, en segunda persona, concretas y apoyadas en sus respuestas: qué hace bien y hacia dónde puede crecer.' },
        aptitudes: {
            type: 'ARRAY', description: 'Exactamente 5 aptitudes (no rasgos de personalidad), de las que más se noten en sus respuestas.',
            items: { type: 'OBJECT', properties: {
                nombre: { type: 'STRING', description: 'Una de: Razonamiento numérico, Razonamiento lógico, Comunicación, Persuasión y ventas, Creatividad, Organización, Trato con personas, Habilidad práctica, Aprendizaje autónomo, Liderazgo, Habilidad digital, Enseñar a otros.' },
                puntaje: { type: 'INTEGER', description: 'De 20 a 95. El razonamiento numérico y lógico deben reflejar el resultado de los ejercicios. Varía los puntajes.' }
            }, required: ['nombre', 'puntaje'] }
        },
        fortalezas: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Exactamente 2 fortalezas, una frase cada una, apoyadas en algo concreto que respondió.' },
        areas: {
            type: 'ARRAY', description: 'Exactamente 4 áreas que, trabajadas, le ayudarían a ganar más dinero. UNA de ellas (y solo una) debe ser sobre APRENDER MEJOR: estudiar con método, entender y retener más rápido, organizar lo que aprende. Las otras 3 son distintas (por ejemplo vender, cobrar, una habilidad técnica, disciplina, contactos).',
            items: { type: 'OBJECT', properties: {
                titulo: { type: 'STRING', description: 'De 2 a 6 palabras.' },
                porque: { type: 'STRING', description: 'Una frase: por qué esta área le ayudaría a ganar más, apoyada en sus respuestas.' },
                aprender: { type: 'BOOLEAN', description: 'true SOLO en el área de aprender mejor.' }
            }, required: ['titulo', 'porque', 'aprender'] }
        },
        tema: { type: 'STRING', description: 'Un tema concreto para su primer mapa mental de estudio, de 2 a 8 palabras, el que más rápido le acercaría a ganar más según sus respuestas (ej. "Cómo poner precio a un servicio", "Excel para pequeños negocios").' },
        tema_porque: { type: 'STRING', description: 'Una frase: por qué empezar por ese tema.' }
    },
    required: ['perfil', 'resumen', 'aptitudes', 'fortalezas', 'areas', 'tema', 'tema_porque']
};

const valid = (d) => d && d.perfil && Array.isArray(d.aptitudes) && d.aptitudes.length >= 3 && Array.isArray(d.areas) && d.areas.length >= 3 && d.tema;

function clean(d) {
    const areas = d.areas.slice(0, 4).map(a => ({ titulo: scrubOne(a.titulo, 60), porque: scrubOne(a.porque, 240), aprender: !!a.aprender }));
    let i = areas.findIndex(a => a.aprender);
    if (i < 0) { i = areas.length - 1; areas[i].aprender = true; }
    areas.forEach((a, k) => { a.aprender = k === i; });
    return {
        perfil: scrubOne(d.perfil, 60), resumen: scrubOne(d.resumen, 400),
        aptitudes: d.aptitudes.slice(0, 5).map(a => ({ nombre: scrubOne(a.nombre, 26), puntaje: Math.max(5, Math.min(99, Math.round(Number(a.puntaje) || 0))) })).filter(a => a.nombre),
        fortalezas: (Array.isArray(d.fortalezas) ? d.fortalezas : []).slice(0, 2).map(f => scrubOne(f, 240)).filter(Boolean),
        areas, tema: scrubOne(d.tema, 90), tema_porque: scrubOne(d.tema_porque, 240)
    };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    if ((event.body || '').length > 40000) return json(413, { error: 'Demasiado grande' });
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const answers = sanitizeAnswers(body.answers);
    if (!answers || answers.filter(a => a.answer && a.answer !== 'paso').length < 10) return json(400, { error: 'Faltan respuestas.' });

    const ipKey = hashIp(ipOf(event));
    try { if (await store.countEventsLastHour(ipKey, 'apt_free_generated') >= MAX_PER_HOUR_IP) return json(429, { error: 'Demasiadas solicitudes. Intenta en un rato.' }); }
    catch (e) { console.error('[apt-gratis] conteo', e.message); }

    const prompt = `Eres orientador profesional. Una persona hizo un examen de aptitudes (preguntas de opción, algunas abiertas y ejercicios calificados). Con sus respuestas, escribe un RESULTADO CORTO y gratuito.

Respuestas:
${transcriptOf(answers)}

Reglas: español neutro latinoamericano, tutea ("tú"), sin voseo. No asumas su género. Frases cortas y concretas, apoyadas en lo que respondió; nada genérico ni de coaching vacío. No prometas ingresos ni cifras de dinero. No inventes datos personales. Las opciones elegidas de una lista no son frases suyas: no digas "elegiste…"; si citas, cita lo que escribió con sus palabras. "No estoy seguro" cuenta como no respondido. Es una orientación, no una prueba oficial.`;
    const t0 = Date.now();
    try {
        const d = await generateWithRetries(prompt, SCHEMA, valid, { tag: 'apt-gratis', maxOutputTokens: 1800, deadline: t0 + 24000, attemptMs: 20000 });
        const out = clean(d);
        try { await store.logEvent(ipKey, 'anon', typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : null, 'apt_free_generated', { answered: answers.length, perfil: out.perfil, tema: out.tema, country: countryOf(event) || null }, null, 'aptitud-gratis'); } catch (_e) { /* no crítico */ }
        return json(200, out);
    } catch (e) {
        console.error('[apt-gratis]', e.message);
        return json(502, { error: 'No pudimos armar tu resultado en este momento. Intenta de nuevo en un minuto.' });
    }
};
