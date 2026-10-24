// «¿Quién eres?» como captación: cuando la persona deja su correo para recibir su resultado, una segunda llamada a la IA
// lee sus respuestas y le propone AL DUEÑO una app sencilla que se pueda construir con lo que ya existe en este sitio
// (páginas estáticas + Netlify Functions + Supabase + Gemini + PayPal + Resend; Cloudinary y Replicate existen pero no se
// usan para esto). El resultado va al correo del dueño; la persona nunca lo ve.
const { esc } = require('./qer-email');

const STACK = `LO QUE EL DUEÑO YA TIENE Y SABE HACER (solo puedes proponer apps que se construyan con esto, sin nada más):
- Páginas web (HTML/JS, se instalan como app en el celular, PWA). No apps de tienda (App Store/Google Play), no WhatsApp/SMS, no calendarios ni bancos ni redes sociales conectadas.
- Funciones de servidor (Netlify Functions) y base de datos Supabase (guardar datos por persona, historial, progreso, cuentas con correo).
- IA de texto (Gemini): entiende y redacta texto, resume, clasifica, convierte lo que la persona escribe en planes, listas, plantillas, mensajes, cuestionarios, retroalimentación, mapas mentales, evaluaciones. También puede leer una foto de un documento o una nota si hace falta, pero evita depender de eso.
- Cobro con PayPal (y SINPE manual en Costa Rica), envío de correos (Resend), recordatorios por correo.
- Ya construyó, con ese mismo patrón «la persona responde o pega algo → la IA entrega un resultado → pago»: un informe de aptitudes, un organizador de tareas, un analizador de CV/trabajo, un generador de canciones personalizadas, un oráculo, y Graphikosmos (mapas mentales y estudio con IA).
NO propongas: generación o edición de imágenes o video, reconocimiento en vivo, mercados con dos lados (compradores y vendedores), chats entre personas, integraciones con otros servicios, nada que requiera aprobación legal o médica, ni consejos médicos/psicológicos/financieros/legales como producto.`;

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        profileBrief: { type: 'STRING', description: 'Quién parece ser esta persona, en 2 o 3 frases, en español neutro y sin etiquetas clínicas.' },
        pains: { type: 'ARRAY', description: 'Entre 2 y 4 puntos donde esta persona probablemente siente dolor o necesita ayuda práctica, ordenados de más a menos fuerte.', items: { type: 'OBJECT', properties: {
            pain: { type: 'STRING', description: 'El dolor, en una frase concreta y cotidiana.' },
            evidence: { type: 'STRING', description: 'Qué respuesta suya lo sostiene (cita corta de lo que escribió o eligió).' } }, required: ['pain', 'evidence'] } },
        app: { type: 'OBJECT', description: 'La app que mejor encaja con su dolor principal.', properties: {
            name: { type: 'STRING', description: 'Nombre corto y atractivo para la app.' },
            promise: { type: 'STRING', description: 'Qué le promete, en una sola frase que ella entendería.' },
            whatItDoes: { type: 'STRING', description: 'Qué hace, en 3 o 4 frases concretas: qué escribe o elige la persona y qué recibe.' },
            howToBuild: { type: 'STRING', description: 'Cómo se construiría con el stack del dueño: pantallas principales, qué guarda Supabase, qué hace Gemini. Máximo 5 líneas.' },
            complexity: { type: 'STRING', enum: ['simple', 'media', 'compleja'], description: 'simple = 1 a 3 días, una pantalla y una llamada a la IA; media = una semana; compleja = más.' },
            howToCharge: { type: 'STRING', description: 'Cómo cobrarla (pago único, suscripción o por uso) y un precio razonable en USD según lo que muestran sus respuestas sobre lo que pagaría.' } },
            required: ['name', 'promise', 'whatItDoes', 'howToBuild', 'complexity', 'howToCharge'] },
        simplerIdea: { type: 'OBJECT', description: 'Una versión aún más pequeña o alternativa para probar con ella primero (puede ser solo una página).', properties: {
            name: { type: 'STRING' }, promise: { type: 'STRING' } }, required: ['name', 'promise'] },
        openingMessage: { type: 'STRING', description: 'Primer correo para escribirle, entre 60 y 100 palabras, en tono cálido y sobrio. Debe decir de dónde salió su correo (que lo dejó para recibir su resultado de ¿Quién eres en realidad?), ofrecer probar gratis la app con un enlace marcado como [ENLACE], y poder ignorarse sin presión. Nada de «hemos analizado tu psicología»: solo que, por lo que contó, pensó que esto podría servirle.' },
        payingSignal: { type: 'STRING', enum: ['alta', 'media', 'baja'], description: 'Qué tan probable es que pague, según sus respuestas sobre dinero, el viaje y lo que hace por sus pendientes; sé cauteloso: no hay pregunta directa sobre pagos.' },
        payingReason: { type: 'STRING', description: 'En una frase, por qué esa señal.' },
        sensitive: { type: 'STRING', description: 'Déjalo vacío salvo que las respuestas muestren una situación delicada (tristeza profunda, crisis, duelo reciente, violencia, problemas graves de salud). En ese caso explica en una frase por qué NO conviene escribirle con una oferta comercial.' }
    },
    required: ['profileBrief', 'pains', 'app', 'simplerIdea', 'openingMessage', 'payingSignal', 'payingReason', 'sensitive']
};
const validate = (d) => d && d.app && d.app.name && d.app.whatItDoes && Array.isArray(d.pains) && d.pains.length && d.openingMessage;

function prompt(transcript, archetype) {
    return `Eres el asesor de producto de una sola persona (el dueño de un sitio de apps con IA). Una persona acaba de contestar un cuestionario de autoconocimiento («¿Quién eres en realidad?», 31 preguntas) y dejó su correo para recibir su resultado. Tu trabajo: leer sus respuestas y decirle al dueño en qué le duele a esta persona y qué app SIMPLE podría ofrecerle.

Cómo leer las respuestas:
- Las respuestas abiertas pesan más que las opciones elegidas.
- Las preguntas PRÁCTICAS (lo que posterga, lo que le quita tiempo, lo que olvida, lo tedioso de su semana, «alguien debería inventar algo para…», cómo aprende, qué le daría pereza de un negocio) son la señal MÁS directa de qué app necesita: busca lo que se repite entre ellas.
- Hay una pregunta sobre un viaje por el que pagaría, con su «porque»: es la mejor pista de qué valora y cuánto gasta. No hay pregunta directa sobre pagos: deduce la señal de pago del resto con cautela.
- Busca dolores prácticos y cotidianos (organización, tiempo, dinero, estudio, trabajo, relaciones, hábitos, ansiedad por decidir), no grandes temas existenciales. La app debe resolver UN problema concreto, no «mejorar su vida».
- Prefiere lo simple. Si dos ideas empatan, la que tenga una sola pantalla y una llamada a la IA.

${STACK}

Arquetipo que ya se le dio en su resultado: ${archetype || '(sin dato)'}

RESPUESTAS DE LA PERSONA:
${transcript}`;
}

const line = (label, v) => v ? `<p style="margin:4px 0"><b>${esc(label)}:</b> ${esc(v)}</p>` : '';
function renderOwnerEmail({ email, consent, delivered, deliveryReason, archetype, analysis, transcript, readingId }) {
    const a = analysis, box = 'background:#f6f6f6;border-radius:8px;padding:10px 12px;margin:10px 0';
    const warn = [];
    if (!consent) warn.push('NO marcó que acepta que le escriban con propuestas: no le ofrezcas nada.');
    if (a && a.sensitive) warn.push('Situación delicada: ' + a.sensitive);
    const parts = ['<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#222;line-height:1.5;font-size:15px">'];
    if (warn.length) parts.push(`<p style="background:#fde8e8;border:1px solid #e3a0a0;border-radius:8px;padding:10px 12px"><b>Ojo:</b> ${warn.map(esc).join('<br>')}</p>`);
    parts.push(`<h2 style="margin:0 0 4px">${esc(a ? a.app.name : 'Lead de ¿Quién eres?')}</h2>`);
    parts.push(`<p style="margin:0 0 10px;color:#555">${esc(email)} · arquetipo: ${esc(archetype || '—')} · ${delivered ? 'su resultado se le envió' : 'su resultado NO se pudo enviar (' + esc(deliveryReason || 'error') + ')'}</p>`);
    if (a) {
        parts.push(`<div style="${box}"><b>Quién parece ser</b><br>${esc(a.profileBrief)}</div>`);
        parts.push('<h3 style="margin:16px 0 4px">Dónde le duele</h3><ol style="margin:0;padding-left:20px">' + a.pains.map(p => `<li><b>${esc(p.pain)}</b><br><span style="color:#666">${esc(p.evidence)}</span></li>`).join('') + '</ol>');
        parts.push('<h3 style="margin:16px 0 4px">App que le ofrecerías</h3>');
        parts.push(line('Promesa', a.app.promise), line('Qué hace', a.app.whatItDoes), line('Cómo construirla', a.app.howToBuild), line('Complejidad', a.app.complexity), line('Cómo cobrarla', a.app.howToCharge));
        parts.push(`<p style="margin:10px 0 0"><b>Versión más pequeña para probar primero:</b> ${esc(a.simplerIdea.name)} — ${esc(a.simplerIdea.promise)}</p>`);
        parts.push(`<p style="margin:10px 0 0"><b>Señal de pago:</b> ${esc(a.payingSignal)} — ${esc(a.payingReason)}</p>`);
        parts.push(`<h3 style="margin:16px 0 4px">Primer mensaje (cámbialo [ENLACE])</h3><div style="${box};white-space:pre-wrap">${esc(a.openingMessage)}</div>`);
    } else parts.push('<p style="background:#fff7e0;border:1px solid #e6cf8a;border-radius:8px;padding:10px 12px">La IA no pudo analizar sus respuestas esta vez. Abajo están todas, léelas tú o vuelve a correr el análisis.</p>');
    parts.push(`<h3 style="margin:18px 0 4px">Sus respuestas completas</h3><div style="${box};white-space:pre-wrap;font-size:13px">${esc(transcript || '(no disponible)')}</div>`);
    parts.push(`<p style="color:#999;font-size:12px">Lectura ${esc(readingId)}. Todo queda también en la tabla events (event_name = 'qer_lead').</p></div>`);
    const text = a ? `${email}\nApp: ${a.app.name} — ${a.app.promise}\nComplejidad: ${a.app.complexity}\n\nMensaje:\n${a.openingMessage}\n\n${warn.join('\n')}` : `${email}\n(sin análisis)\n\n${transcript || ''}`;
    return { subject: `[Lead] ${a ? a.app.name : 'sin análisis'} · ${email}${warn.length ? ' · OJO' : ''}`, html: parts.join(''), text };
}

module.exports = { SCHEMA, validate, prompt, renderOwnerEmail };
