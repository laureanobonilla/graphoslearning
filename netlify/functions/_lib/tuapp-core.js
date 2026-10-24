// /tu-app/: la persona cuenta un problema, la IA le diseña la propuesta de una app a su medida (se la muestra en pantalla)
// y, al mismo tiempo, le prepara al DUEÑO la especificación para construirla. La especificación nunca viaja al navegador.
const { esc } = require('./qer-email');

const STACK = `LO QUE EL DUEÑO YA TIENE Y SABE HACER (la app solo puede usar esto):
- Página web que se instala como app en el celular (PWA), HTML/JS sin frameworks pesados. No apps de tienda, no WhatsApp/SMS, no calendarios, bancos ni redes sociales conectadas.
- Funciones de servidor (Netlify Functions) y base de datos Supabase (guardar datos por persona, historial, progreso; cuentas con correo).
- IA de texto (Gemini): entiende y redacta, resume, clasifica, convierte lo que la persona escribe en planes, listas, plantillas, mensajes, evaluaciones y retroalimentación.
- Cobro con PayPal, envío de correos (Resend), recordatorios por correo.
NO propongas: imágenes o video generados, reconocimiento en vivo, mercados de dos lados, chats entre personas, integraciones con otros servicios, ni nada que sea consejo médico, psicológico, legal o financiero como tal.`;

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        problemSummary: { type: 'STRING', description: 'El problema de la persona, hablándole de tú, en 1 o 2 frases claras y empáticas, con sus propias palabras cuando se pueda («Lo que te pesa es…»).' },
        appName: { type: 'STRING', description: 'Nombre corto y atractivo de la app (máx. 28 caracteres).' },
        tagline: { type: 'STRING', description: 'Una frase de máx. 12 palabras que dice qué hace por ella.' },
        features: { type: 'ARRAY', description: 'Exactamente 3 cosas concretas que haría la app, hablándole de tú.', items: { type: 'OBJECT', properties: { title: { type: 'STRING', description: 'Máx. 5 palabras.' }, text: { type: 'STRING', description: 'Una frase concreta.' } }, required: ['title', 'text'] } },
        sampleScreen: { type: 'OBJECT', description: 'Ejemplo de una pantalla de la app con datos de ejemplo creíbles para el caso de la persona.', properties: { title: { type: 'STRING' }, lines: { type: 'ARRAY', items: { type: 'STRING' }, description: '3 o 4 líneas cortas, como las vería en la pantalla.' } }, required: ['title', 'lines'] },
        whyItFits: { type: 'STRING', description: 'Por qué esta app encaja con su caso, en una frase, apoyada en algo que contestó.' },
        buildSpec: { type: 'STRING', description: 'PARA EL DUEÑO (la persona nunca lo ve): instrucciones listas para pegar en Claude Code y construir esta app con el stack descrito. Incluye: objetivo, usuario, pantallas, flujo, datos que guarda Supabase, qué le pide a Gemini (con el prompt base), cómo se cobra, y qué dejar fuera de la primera versión. Entre 200 y 400 palabras.' },
        complexity: { type: 'STRING', enum: ['simple', 'media', 'compleja'] },
        suggestedPrice: { type: 'STRING', description: 'Precio sugerido y modelo (por mes, único o por uso) en USD, coherente con lo que ella dijo que le parecería justo.' },
        sensitive: { type: 'STRING', description: 'Vacío salvo que sus respuestas muestren una situación delicada (crisis, duelo, violencia, salud grave). Entonces una frase explicando por qué NO conviene ofrecerle nada comercial.' }
    },
    required: ['problemSummary', 'appName', 'tagline', 'features', 'sampleScreen', 'whyItFits', 'buildSpec', 'complexity', 'suggestedPrice', 'sensitive']
};
const validate = (d) => d && d.appName && d.problemSummary && Array.isArray(d.features) && d.features.length >= 3 && d.sampleScreen && Array.isArray(d.sampleScreen.lines) && d.buildSpec;

function prompt(transcript) {
    return `Eres el diseñador de producto de una sola persona (el dueño de un sitio de apps con IA). Alguien acaba de contarle un problema que quiere resolver y qué le parecería justo pagar. Diseña la app personalizada que lo resuelve.

Reglas:
- UN problema concreto, una app simple (una a tres pantallas, una o dos llamadas a la IA). Si hay dos ideas, la más simple.
- Habla a la persona de tú, con sus propias palabras. Nada de jerga técnica en lo que ella verá (problemSummary, appName, tagline, features, sampleScreen, whyItFits).
- Nunca prometas resultados médicos, financieros ni legales; la app ayuda a organizar, entender, decidir o practicar.
- buildSpec y suggestedPrice son para el dueño: sé técnico y práctico.

${STACK}

RESPUESTAS DE LA PERSONA:
${transcript}`;
}

const line = (l, v) => v ? `<p style="margin:4px 0"><b>${esc(l)}:</b> ${esc(v)}</p>` : '';
function ownerEmail({ email, consent, confirmed, proposal: a, transcript, id }) {
    const box = 'background:#f6f6f6;border-radius:8px;padding:10px 12px;margin:10px 0';
    const warn = [];
    if (!consent) warn.push('NO marcó que acepta que le escriban: no le ofrezcas nada más.');
    if (a.sensitive) warn.push('Situación delicada: ' + a.sensitive);
    const h = ['<div style="font-family:Arial,sans-serif;max-width:660px;margin:0 auto;color:#222;line-height:1.5;font-size:15px">'];
    if (warn.length) h.push(`<p style="background:#fde8e8;border:1px solid #e3a0a0;border-radius:8px;padding:10px 12px"><b>Ojo:</b> ${warn.map(esc).join('<br>')}</p>`);
    h.push(`<h2 style="margin:0 0 4px">${esc(a.appName)}</h2><p style="margin:0 0 10px;color:#555">${esc(email)} · ${confirmed ? 'se le mandó confirmación' : 'la confirmación a su correo NO salió'}</p>`);
    h.push(`<p><b>${esc(a.tagline)}</b></p>`, line('Su problema', a.problemSummary), line('Complejidad', a.complexity), line('Precio sugerido', a.suggestedPrice), line('Por qué encaja', a.whyItFits));
    h.push('<h3 style="margin:16px 0 4px">Lo que le mostramos</h3><ul style="margin:0;padding-left:20px">' + a.features.map(f => `<li><b>${esc(f.title)}</b>: ${esc(f.text)}</li>`).join('') + '</ul>');
    h.push(`<h3 style="margin:16px 0 4px">Especificación para Claude Code</h3><div style="${box};white-space:pre-wrap;font-size:13px">${esc(a.buildSpec)}</div>`);
    h.push(`<h3 style="margin:16px 0 4px">Sus respuestas</h3><div style="${box};white-space:pre-wrap;font-size:13px">${esc(transcript)}</div><p style="color:#999;font-size:12px">Propuesta ${esc(id)} · en events: event_name = 'tuapp_lead'.</p></div>`);
    return { subject: `[Tu app] ${a.appName} · ${email}${warn.length ? ' · OJO' : ''}`, html: h.join(''), text: `${email}\n${a.appName} — ${a.tagline}\n${a.problemSummary}\n\n${a.buildSpec}\n\n${warn.join('\n')}` };
}
function customerEmail(a) {
    const html = `<div style="font-family:Georgia,serif;max-width:540px;margin:0 auto;color:#222;line-height:1.65"><h1 style="font-size:24px;margin:0 0 8px">${esc(a.appName)}</h1><p style="color:#555;font-style:italic;margin:0 0 16px">${esc(a.tagline)}</p><p>Gracias por contarnos tu problema. Estamos preparando tu app y te escribiremos a este correo cuando esté lista para que la pruebes.</p><p style="color:#999;font-size:12px;margin-top:24px">Recibes este correo porque lo dejaste en graphoslearning.netlify.app/tu-app. Si no quieres más mensajes, responde con la palabra «no».</p></div>`;
    return { subject: `Tu app: ${a.appName}`, html, text: `${a.appName}\n${a.tagline}\n\nGracias por contarnos tu problema. Estamos preparando tu app y te escribiremos a este correo cuando esté lista.\n\nSi no quieres más mensajes, responde con la palabra «no».` };
}
module.exports = { SCHEMA, validate, prompt, ownerEmail, customerEmail };
