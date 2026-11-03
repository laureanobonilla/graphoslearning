// «Profundiza»: preguntas de completar que se generan según lo que la persona no domina.
// Acción «cloze»: una definición breve de un término con espacios en blanco en palabras clave (más o menos según el nivel).
// Cada definición puede traer una curiosidad o historia poco contada (solo si el modelo está seguro de que es cierta).
// Acción «outline»: divide el tema central en N partes (10 / 25 / 65 según el nivel) para estudiarlo por completo.
// Acción «track»: registra el recorrido (app «profundiza»). No guarda texto de la persona.
const { generateWithRetries } = require('./_lib/qer-gemini');
const store = require('./_lib/store');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

const WIN = 10 * 60 * 1000, hits = new Map();
function limited(key, max) { const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < WIN); h.push(now); hits.set(key, h); if (hits.size > 800) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > WIN) hits.delete(k); return h.length > max; }
const EVENTS = new Set(['prf_landing', 'prf_start', 'prf_cloze_shown', 'prf_cloze_ok', 'prf_cloze_fail', 'prf_descend', 'prf_return', 'prf_done', 'prf_giveup', 'prf_error', 'prf_resumed', 'prf_part_done', 'prf_outline', 'prf_minor', 'prf_curiosity']);
const cleanAnon = (a) => { const s = String(a || '').slice(0, 64); return /^[\w-]{8,64}$/.test(s) ? s : ''; };
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

const LEVELS = {
    beginner: { blanks: [1, 2], words: '25 a 40', style: 'vocabulario sencillo, frases cortas, como para alguien que empieza' },
    intermediate: { blanks: [3, 3], words: '40 a 60', style: 'vocabulario de un curso introductorio' },
    advanced: { blanks: [4, 5], words: '55 a 80', style: 'vocabulario técnico preciso, como para alguien que ya conoce el tema' }
};
const SCHEMA = { type: 'OBJECT', properties: {
    term: { type: 'STRING', description: 'El nombre del concepto en el idioma pedido (si la persona lo escribió en otro idioma, tradúcelo). Nombre natural, máximo 6 palabras, sin comillas.' },
    text: { type: 'STRING', description: 'La definición con los espacios marcados como [[1]], [[2]]… (cada marca reemplaza UNA palabra o un término de máximo dos palabras).' },
    blanks: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        n: { type: 'INTEGER' },
        answers: { type: 'ARRAY', items: { type: 'STRING' }, description: 'La palabra correcta primero y SOLO variantes de forma (singular/plural, con o sin artículo, abreviatura o grafía alternativa de la misma palabra). NUNCA sinónimos ni palabras relacionadas: si la persona escribe un sinónimo debe contar como incorrecto.' },
        meaning: { type: 'STRING', description: 'Qué significa esa palabra, en una frase simple de máximo 25 palabras, SIN usar la palabra.' },
        crucial: { type: 'BOOLEAN', description: 'true SOLO si entender esta palabra es necesario para comprender el TEMA CENTRAL que se estudia (por ejemplo «régimen» para «revolución rusa»). false si es una palabra general que no hace falta estudiar para ese tema (por ejemplo «hombre», «persona», «grupo», «época», «cambio»).' }
    }, required: ['n', 'answers', 'meaning', 'crucial'] } },
    curiosityKind: { type: 'STRING', enum: ['curiosity', 'untold', 'none'], description: 'curiosity = dato curioso; untold = historia poco contada o poco divulgada pero importante para entender el tema; none = no hay nada que valga la pena o no estás seguro de que sea cierto.' },
    curiosity: { type: 'STRING', description: 'Texto de 30 a 70 palabras con la curiosidad o la historia poco contada, o cadena vacía si curiosityKind es none.' }
}, required: ['term', 'text', 'blanks', 'curiosityKind', 'curiosity'] };

function lev(a, b) { const m = a.length, n = b.length, d = []; for (let i = 0; i <= m; i++) d[i] = [i]; for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
const norm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
const LANGS = { es: 'español', en: 'inglés', de: 'alemán', fr: 'francés' };
function prompt(term, topic, parent, lvl, variant, avoid, lang, part) {
    const L = LEVELS[lvl], central = topic || term;
    return `Eres un profesor que crea ejercicios de completar para estudiar. Escribe TODO el texto de salida (la definición, las respuestas y los significados) en ${LANGS[lang]}, con ortografía y tildes/diéresis correctas${lang === 'es' ? '' : '; la persona está aprendiendo el tema en ese idioma, así que usa vocabulario natural y no traduzcas términos técnicos de forma rara'}.
Concepto a definir: «${term}» (la persona pudo escribirlo en otro idioma: en «term» devuélvelo en ${LANGS[lang]}, y trabaja con ese nombre). ${topic && norm(topic) !== norm(term) ? `El TEMA CENTRAL que se estudia es «${topic}»${parent ? ` y la persona llegó aquí porque no supo la palabra «${term}» dentro de una definición de «${parent}»` : ''}.` : `El TEMA CENTRAL que se estudia es «${central}».`}${part ? ` Esta es la parte ${part.k} de ${part.n} del estudio de «${topic}»: explica «${term}» tal como importa para entender «${topic}».` : ''}
Redacta UNA definición clara y correcta de «${term}» de ${L.words} palabras (${L.style}). No empieces con «${term}» como título: es un texto corrido.
Después reemplaza entre ${L.blanks[0]} y ${L.blanks[1]} palabras de ese texto por marcas [[1]], [[2]]… (una marca por palabra o término de máximo dos palabras).
Qué ocultar: SOLO términos CRUCIALES para entender el tema central «${central}»: conceptos, nombres propios, hechos, procesos o magnitudes que alguien que estudia «${central}» de verdad necesita saber (para «revolución rusa», por ejemplo, «régimen», «zar», «bolcheviques»). NO ocultes palabras generales que no hace falta estudiar para ese tema (como «hombre», «persona», «grupo», «época», «cambio», «forma»), ni verbos comunes, artículos, preposiciones o conectores.
Marca «crucial» con honestidad: true solo si esa palabra es necesaria para entender «${central}». Si la definición ya no tiene palabras cruciales (porque es un concepto muy básico), igual oculta las palabras con más significado, pero márcalas con crucial=false.
Reglas: no ocultes «${term}» ni una palabra que sea casi igual. La palabra oculta no debe aparecer en ninguna otra parte del texto. Que el texto con los espacios todavía permita deducir la respuesta. Cada espacio: la respuesta correcta primero en «answers» y, si acaso, variantes de FORMA de esa misma palabra (plural, grafía), nunca sinónimos; «meaning» explica en una frase qué significa esa palabra sin usarla.
Además, añade UNA curiosidad o historia poco contada sobre «${term}» (campos «curiosityKind» y «curiosity»), para ver el asunto desde otra perspectiva: un dato curioso (curiosity) o una historia poco divulgada pero importante para entender el tema (untold), por ejemplo un hecho, un personaje o una situación que casi no se cuenta y que cambia cómo se entiende el asunto. Reglas: debe ser VERDADERA y comprobable; si no estás seguro, o el concepto no tiene nada así (muchas materias no lo tienen), usa curiosityKind «none» y «curiosity» vacío. No inventes cifras, fechas ni citas; si no recuerdas el dato exacto, no lo pongas. Nada irrelevante, trivial ni morboso: debe ayudar a entender o recordar el tema «${central}». De 30 a 70 palabras, en ${LANGS[lang]}, sin repetir la definición y SIN usar las palabras ocultas de los espacios.${parent ? ' Como este concepto es un paso para entender otro, pon una curiosidad solo si es realmente buena.' : ''}
${variant ? `Esta es la versión ${variant}: redáctala distinta a las anteriores y oculta otras palabras si es posible.` : ''}${avoid && avoid.length ? ` Evita parecerte a estos textos: ${avoid.map((a) => '«' + a + '»').join(' ')}.` : ''}`;
}
// Solo se aceptan variantes de FORMA de la respuesta principal (plural, grafía, artículo); los sinónimos se descartan aunque el modelo los proponga.
function cpl(a, b) { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }
function strict(list) {
    const first = list[0], f = norm(first), out = [first];
    for (const v of list.slice(1)) {
        const x = norm(v), core = x.replace(/^(the|a|an|le|la|les|l|un|une|der|die|das|ein|eine|el|los|las|una|unos|unas) /, ''), fc = f.replace(/^(the|a|an|le|la|les|l|un|une|der|die|das|ein|eine|el|los|las|una|unos|unas) /, '');
        if (!x || x === f || out.some((o) => norm(o) === x)) continue;
        if (core === fc || lev(core, fc) <= Math.max(1, Math.floor(fc.length / 6)) || (Math.abs(core.length - fc.length) <= 3 && cpl(core, fc) >= Math.max(4, Math.min(core.length, fc.length) - 2))) out.push(v);
    }
    return out.slice(0, 3);
}
const OUTLINE = { type: 'OBJECT', properties: {
    topic: { type: 'STRING', description: 'El nombre del tema central en el idioma pedido, natural, máximo 8 palabras, sin comillas.' },
    parts: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Los aspectos del tema, cada uno de 1 a 7 palabras.' }
}, required: ['topic', 'parts'] };
const PARTS = { beginner: 10, intermediate: 25, advanced: 65 };
function outlinePrompt(topic, lvl, n, lang) {
    return `Eres un profesor que arma un temario para estudiar a fondo un tema. Escribe todo en ${LANGS[lang]}, con ortografía correcta.
Tema central: «${topic}» (la persona pudo escribirlo en otro idioma: en «topic» devuélvelo en ${LANGS[lang]}).
Nivel: ${lvl === 'beginner' ? 'principiante (lo esencial)' : lvl === 'intermediate' ? 'intermedio (como un curso introductorio)' : 'avanzado (completo y detallado, como para dominar el tema)'}.
Escribe EXACTAMENTE ${n} partes distintas para estudiar «${topic}»: conceptos clave, causas, personajes, hechos, procesos, consecuencias, términos técnicos… lo que haga falta según el tema.
Reglas: cada parte es un concepto concreto que se pueda definir en un párrafo corto (por ejemplo, para «revolución rusa»: «Zarismo», «Nicolás II», «Bolcheviques», «Revolución de Febrero»…). Nada de partes vagas como «Introducción», «Conclusión», «Otros aspectos» o «Resumen». Sin repetir ideas. Ordénalas de lo más fundamental a lo más específico, para que cada una ayude a entender las siguientes. No incluyas el propio tema «${topic}» como parte.`;
}
function validate(d, lvl) {
    if (!d || typeof d.text !== 'string' || !Array.isArray(d.blanks) || typeof d.term !== 'string' || d.term.trim().length < 2) return false;
    const L = LEVELS[lvl], marks = [...d.text.matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]));
    if (marks.length < L.blanks[0] || marks.length > L.blanks[1] + 1 || new Set(marks).size !== marks.length) return false;
    for (const n of marks) { const b = d.blanks.find((x) => Number(x.n) === n); if (!b || !Array.isArray(b.answers) || !b.answers.length || !b.answers[0] || !String(b.meaning || '').trim()) return false; }
    const rest = norm(d.text.replace(/\[\[\d+\]\]/g, ' ')), tn = norm(d.term);
    for (const n of marks) { const a = norm(d.blanks.find((x) => Number(x.n) === n).answers[0]); if (!a || a === tn || (' ' + rest + ' ').includes(' ' + a + ' ')) return false; }
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
        if (a === 'outline') {
            if (limited(ip + 'o', 12)) return json(429, { error: 'demasiadas' });
            const topic = clean(body.topic, 80), lvl = LEVELS[body.level] ? body.level : 'beginner', lang = LANGS[body.lang] ? body.lang : 'es', n = PARTS[lvl];
            if (topic.length < 2) return json(400, { error: 'tema' });
            const tn = norm(topic), t0 = Date.now();
            const ok = (d) => d && typeof d.topic === 'string' && Array.isArray(d.parts) && d.parts.map((x) => clean(x, 70)).filter((x) => x.length >= 2 && norm(x) !== tn && norm(x) !== norm(d.topic)).length >= Math.ceil(n * 0.9);
            const d = await generateWithRetries(outlinePrompt(topic, lvl, n, lang), OUTLINE, ok, { tag: 'profundiza-outline', maxOutputTokens: 3000, deadline: t0 + 24000, attemptMs: 14000 });
            const seen = new Set(), parts = [];
            d.parts.map((x) => clean(x, 70).replace(/[«»"“”„]/g, '').replace(/^\d+[.)-]\s*/, '').trim()).forEach((x) => { const k = norm(x); if (x.length >= 2 && k !== tn && k !== norm(d.topic) && !seen.has(k)) { seen.add(k); parts.push(x); } });
            return json(200, { topic: clean(d.topic, 80).replace(/[«»"“”„]/g, '').trim() || topic, level: lvl, parts: parts.slice(0, n), ms: Date.now() - t0 });
        }
        if (a === 'cloze') {
            if (limited(ip + 'c', 60)) return json(429, { error: 'demasiadas' });
            const term = clean(body.term, 80), topic = clean(body.topic, 80), parent = clean(body.parent, 80), lvl = LEVELS[body.level] ? body.level : 'beginner';
            if (term.length < 2) return json(400, { error: 'termino' });
            const lang = LANGS[body.lang] ? body.lang : 'es', variant = Math.min(5, Math.max(0, parseInt(body.variant, 10) || 0)), avoid = (Array.isArray(body.avoid) ? body.avoid : []).slice(0, 2).map((x) => clean(x, 160)).filter(Boolean);
            const pk = parseInt(body.partK, 10), pn = parseInt(body.partN, 10), part = pk > 0 && pn >= pk && pn <= 100 ? { k: pk, n: pn } : null;
            const t0 = Date.now();
            const d = await generateWithRetries(prompt(term, topic, parent, lvl, variant, avoid, lang, part), SCHEMA, (x) => validate(x, lvl), { tag: 'profundiza', maxOutputTokens: 1800, deadline: t0 + 22000, attemptMs: 9000 });
            const marks = [...d.text.matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]));
            const blanks = marks.map((n, i) => { const b = d.blanks.find((x) => Number(x.n) === n); return { n: i + 1, old: n, answers: strict(b.answers.map((s) => clean(s, 60)).filter(Boolean)), meaning: clean(b.meaning, 220), crucial: b.crucial !== false }; });
            // se renumera 1..k en orden de aparición (con marcas temporales para evitar choques)
            let text = d.text; blanks.forEach((b) => { text = text.split('[[' + b.old + ']]').join('{#' + b.n + '#}'); }); text = text.replace(/\{#(\d+)#\}/g, '[[$1]]');
            const kind = d.curiosityKind === 'untold' ? 'untold' : d.curiosityKind === 'curiosity' ? 'curiosity' : '', cur = clean(d.curiosity, 520);
            const hide = blanks.some((b) => { const a = norm(b.answers[0]); return a.length > 3 && (' ' + norm(cur) + ' ').includes(' ' + a + ' '); });   // si delata una respuesta oculta, se descarta
            return json(200, { term: clean(d.term, 80).replace(/[«»"“”„]/g, '').trim() || term, asked: term, curiosity: kind && cur.length >= 40 && !hide ? { kind, text: cur } : null, level: lvl, lang, text: clean(text, 900), blanks: blanks.map(({ n, answers, meaning, crucial }) => ({ n, answers, meaning, crucial })), ms: Date.now() - t0 });
        }
        return json(400, { error: 'accion' });
    } catch (err) {
        console.error('[profundiza]', a, err.message);
        return json(502, { error: 'no_disponible' });
    }
};
