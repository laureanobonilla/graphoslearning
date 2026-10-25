// /significa/: la persona dice UNA palabra (o un término) en voz alta; Gemini la escucha y devuelve qué significa.
// Recibe un WAV corto (16 kHz, mono) en base64. El navegador lo lee en voz alta con la voz del dispositivo.
const { generateWithRetries } = require('./_lib/qer-gemini');
const store = require('./_lib/store');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

const MAX_B64 = 900000;                 // ~650 KB de audio: de sobra para 8 s a 16 kHz
const WINDOW_MS = 10 * 60 * 1000, MAX_PER_WINDOW = 30;   // freno básico por IP (por instancia de la función)
const hits = new Map();
function limited(ip) {
    const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
    h.push(now); hits.set(ip, h);
    if (hits.size > 500) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > WINDOW_MS) hits.delete(k);
    return h.length > MAX_PER_WINDOW;
}

const SCHEMA = {
    type: 'OBJECT',
    properties: {
        understood: { type: 'BOOLEAN', description: 'false si el audio no tiene una palabra o término entendible (silencio, ruido, varias frases sin relación).' },
        word: { type: 'STRING', description: 'La palabra o término dicho, escrito correctamente en su idioma (con tildes y mayúsculas solo si corresponde). Vacío si no se entendió.' },
        wordLang: { type: 'STRING', description: 'Etiqueta BCP-47 del idioma en que se DIJO la palabra: es, en, pt, fr, it, de, ja...' },
        definition: { type: 'STRING', description: 'Qué significa, SIEMPRE EN ESPAÑOL, sea cual sea el idioma en que se dijo la palabra: 1 a 3 frases claras (máximo 45 palabras), sin listas ni markdown y sin repetir la palabra al inicio. Si la palabra NO es del español, empieza indicando el idioma y su equivalente en español (por ejemplo «En inglés, significa…» o «Del inglés: …») y luego explica. Si tiene varios sentidos, da primero el más común.' }
    },
    required: ['understood', 'word', 'wordLang', 'definition']
};
const PROMPT = 'Escucha el audio: una persona dice una palabra o un término (puede ser un nombre propio, un concepto o una expresión corta). Puede estar en cualquier idioma. Identifica qué dijo y explica qué significa SIEMPRE EN ESPAÑOL, aunque la palabra sea de otro idioma. Habla de forma sencilla, como a alguien curioso. Si no hay una palabra o término entendible, devuelve understood=false.';
const valid = (d) => d && typeof d.understood === 'boolean' && (!d.understood || (d.word && d.definition));

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const audio = typeof body.audio === 'string' ? body.audio : '';
    if (!audio || audio.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(audio)) return json(400, { error: 'audio_invalido' });
    const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim())) || 'unknown';
    if (limited(ip)) return json(429, { error: 'demasiadas' });
    const anonId = String(body.anonId || '').slice(0, 64) || 'anon';
    const t0 = Date.now();
    try {
        const contents = [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: audio } }, { text: PROMPT }] }];
        const d = await generateWithRetries(contents, SCHEMA, valid, { tag: 'significa', maxOutputTokens: 600, deadline: t0 + 22000, attemptMs: 12000 });
        const out = d.understood
            ? { understood: true, word: String(d.word).trim().slice(0, 80), wordLang: /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(d.wordLang || '') ? d.wordLang : 'es', definition: String(d.definition).trim().slice(0, 500) }
            : { understood: false };
        try { await store.logEvent(anonId, 'anon', anonId, 'significa_lookup', { understood: out.understood, word: out.word, lang: out.wordLang, ms: Date.now() - t0 }, null, 'significa'); } catch (_e) { /* el registro nunca debe romper la respuesta */ }
        return json(200, out);
    } catch (err) {
        console.error('[significa]', err.message);
        return json(502, { error: 'no_disponible' });
    }
};
