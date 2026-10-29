// «Profundiza»: preguntas de completar que se generan según lo que la persona no domina.
// Acción «cloze»: una definición breve de un término con espacios en blanco en palabras clave (más o menos según el nivel).
// Acción «track»: registra el recorrido (app «profundiza»). No guarda texto de la persona.
const { generateWithRetries } = require('./_lib/qer-gemini');
const store = require('./_lib/store');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

const WIN = 10 * 60 * 1000, hits = new Map();
function limited(key, max) { const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < WIN); h.push(now); hits.set(key, h); if (hits.size > 800) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > WIN) hits.delete(k); return h.length > max; }
const EVENTS = new Set(['prf_landing', 'prf_start', 'prf_cloze_shown', 'prf_cloze_ok', 'prf_cloze_fail', 'prf_descend', 'prf_return', 'prf_done', 'prf_giveup', 'prf_error', 'prf_resumed']);
const cleanAnon = (a) => { const s = String(a || '').slice(0, 64); return /^[\w-]{8,64}$/.test(s) ? s : ''; };
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

const LEVELS = {
    beginner: { blanks: [1, 2], words: '25 a 40', style: 'vocabulario sencillo, frases cortas, como para alguien que empieza' },
    intermediate: { blanks: [3, 3], words: '40 a 60', style: 'vocabulario de un curso introductorio' },
    advanced: { blanks: [4, 5], words: '55 a 80', style: 'vocabulario técnico preciso, como para alguien que ya conoce el tema' }
};
const SCHEMA = { type: 'OBJECT', properties: {
    text: { type: 'STRING', description: 'La definición con los espacios marcados como [[1]], [[2]]… (cada marca reemplaza UNA palabra o un término de máximo dos palabras).' },
    blanks: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        n: { type: 'INTEGER' },
        answers: { type: 'ARRAY', items: { type: 'STRING' }, description: 'La palabra correcta primero y hasta 3 variantes igual de correctas (sinónimo exacto, singular/plural).' },
        meaning: { type: 'STRING', description: 'Qué significa esa palabra, en una frase simple de máximo 25 palabras, SIN usar la palabra.' }
    }, required: ['n', 'answers', 'meaning'] } }
}, required: ['text', 'blanks'] };

const norm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
const LANGS = { es: 'español', en: 'inglés', de: 'alemán', fr: 'francés' };
function prompt(term, topic, parent, lvl, variant, avoid, lang) {
    const L = LEVELS[lvl];
    return `Eres un profesor que crea ejercicios de completar para estudiar. Escribe TODO el texto de salida (la definición, las respuestas y los significados) en ${LANGS[lang]}, con ortografía y tildes/diéresis correctas${lang === 'es' ? '' : '; la persona está aprendiendo el tema en ese idioma, así que usa vocabulario natural y no traduzcas términos técnicos de forma rara'}.
Concepto a definir: «${term}». ${topic && norm(topic) !== norm(term) ? `Se está estudiando el tema «${topic}»${parent ? ` y la persona llegó aquí porque no supo la palabra «${term}» dentro de una definición de «${parent}»` : ''}.` : ''}
Redacta UNA definición clara y correcta de «${term}» de ${L.words} palabras (${L.style}). No empieces con «${term}» como título: es un texto corrido.
Después reemplaza entre ${L.blanks[0]} y ${L.blanks[1]} palabras de ese texto por marcas [[1]], [[2]]… (una marca por palabra o término de máximo dos palabras).
Qué ocultar: prioriza los términos más propios del tema (sustantivos técnicos, nombres propios, magnitudes, procesos con nombre) porque son lo que de verdad hay que saber. Evita verbos comunes, artículos, preposiciones y conectores. Si la definición no tiene palabras especiales, oculta las que más carga de significado tengan.
Reglas: no ocultes «${term}» ni una palabra que sea casi igual. La palabra oculta no debe aparecer en ninguna otra parte del texto. Que el texto con los espacios todavía permita deducir la respuesta. Cada espacio: la respuesta correcta primero en «answers» y hasta 3 variantes igual de correctas; «meaning» explica en una frase qué significa esa palabra sin usarla.
${variant ? `Esta es la versión ${variant}: redáctala distinta a las anteriores y oculta otras palabras si es posible.` : ''}${avoid && avoid.length ? ` Evita parecerte a estos textos: ${avoid.map((a) => '«' + a + '»').join(' ')}.` : ''}`;
}
function validate(d, lvl) {
    if (!d || typeof d.text !== 'string' || !Array.isArray(d.blanks)) return false;
    const L = LEVELS[lvl], marks = [...d.text.matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]));
    if (marks.length < L.blanks[0] || marks.length > L.blanks[1] + 1 || new Set(marks).size !== marks.length) return false;
    for (const n of marks) { const b = d.blanks.find((x) => Number(x.n) === n); if (!b || !Array.isArray(b.answers) || !b.answers.length || !b.answers[0] || !String(b.meaning || '').trim()) return false; }
    const rest = norm(d.text.replace(/\[\[\d+\]\]/g, ' '));
    for (const n of marks) { const a = norm(d.blanks.find((x) => Number(x.n) === n).answers[0]); if (!a || (' ' + rest + ' ').includes(' ' + a + ' ')) return false; }
    return d.text.length > 60;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const anon = cleanAnon(body.anonId); if (!anon) return json(400, { error: 'solicitud' });
    const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim())) || 'unknown';
    const a = String(body.action || '');
    try {
        if (a === 'track') {
            const name = String(body.event || ''); if (!EVENTS.has(name)) return json(400, { error: 'evento' });
            let md = body.metadata && typeof body.metadata === 'object' ? body.metadata : {}; if (JSON.stringify(md).length > 800) md = { truncated: true };
            try { await store.logEvent(anon, 'anon', anon, name, md, null, 'profundiza'); } catch (_e) { /* no crítico */ }
            return json(200, { ok: true });
        }
        if (a === 'cloze') {
            if (limited(ip + 'c', 60)) return json(429, { error: 'demasiadas' });
            const term = clean(body.term, 80), topic = clean(body.topic, 80), parent = clean(body.parent, 80), lvl = LEVELS[body.level] ? body.level : 'beginner';
            if (term.length < 2) return json(400, { error: 'termino' });
            const lang = LANGS[body.lang] ? body.lang : 'es', variant = Math.min(5, Math.max(0, parseInt(body.variant, 10) || 0)), avoid = (Array.isArray(body.avoid) ? body.avoid : []).slice(0, 2).map((x) => clean(x, 160)).filter(Boolean);
            const t0 = Date.now();
            const d = await generateWithRetries(prompt(term, topic, parent, lvl, variant, avoid, lang), SCHEMA, (x) => validate(x, lvl), { tag: 'profundiza', maxOutputTokens: 1200, deadline: t0 + 22000, attemptMs: 9000 });
            const marks = [...d.text.matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]));
            const blanks = marks.map((n, i) => { const b = d.blanks.find((x) => Number(x.n) === n); return { n: i + 1, old: n, answers: b.answers.map((s) => clean(s, 60)).filter(Boolean).slice(0, 4), meaning: clean(b.meaning, 220) }; });
            // se renumera 1..k en orden de aparición (con marcas temporales para evitar choques)
            let text = d.text; blanks.forEach((b) => { text = text.split('[[' + b.old + ']]').join('{#' + b.n + '#}'); }); text = text.replace(/\{#(\d+)#\}/g, '[[$1]]');
            return json(200, { term, level: lvl, lang, text: clean(text, 900), blanks: blanks.map(({ n, answers, meaning }) => ({ n, answers, meaning })), ms: Date.now() - t0 });
        }
        return json(400, { error: 'accion' });
    } catch (err) {
        console.error('[profundiza]', a, err.message);
        return json(502, { error: 'no_disponible' });
    }
};
