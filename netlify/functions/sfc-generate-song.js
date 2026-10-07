// "Si fueras una canción": recibe las respuestas del cuestionario (elegir + texto libre opcional), escribe la letra con
// Gemini, la guarda en el servidor (misma tabla qer_readings, con format:'song') y la devuelve. Esa letra es GRATIS y se
// muestra completa; lo que se ofrece después es la versión cantada (ver sfc-song-request.js).
// - Límite: por IP y por navegador (anonId), para que la generación gratuita no se pueda abusar.
// - Las respuestas se guardan SOLO en qer_readings (72 h): sirven para rehacer la letra con el nombre si lo pide. No van a `events`.
// Variables: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY (ya existen).
const crypto = require('crypto');
const store = require('./_lib/store');
const { saveReading } = require('./_lib/qer-readings-store');
const { generateWithRetries } = require('./_lib/qer-gemini');
const { json } = require('./_lib/qer-map-core');
const { appOf, kindOf, sanitizeSongAnswers, SONG_SCHEMA, validSong, songPrompt, partnerPrompt, birthdayPrompt, coupleEnPrompt, SONG_SCHEMA_EN, validSongEn, cleanName } = require('./_lib/sfc-song');

const BUDGET_MS = 22000;
const MAX_PER_HOUR_IP = 10;   // varias personas pueden compartir IP (redes móviles): holgado
const MAX_PER_HOUR_ANON = 4;

const ipOf = (event) => {
    const h = event.headers || {};
    const raw = h['x-nf-client-connection-ip'] || h['X-Nf-Client-Connection-Ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'unknown';
    return String(raw).trim().slice(0, 64);
};
const countryOf = (event) => {
    try {
        const h = event.headers || {};
        const raw = h['x-nf-geo'] || h['X-Nf-Geo'];
        return raw ? (JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))?.country?.code || '') : '';
    } catch { return ''; }
};
// No se guarda la IP en claro: solo un hash corto, suficiente para contar.
const hashIp = (ip) => 'ip:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 20);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const en = body.kind === 'couple';
    const answers = sanitizeSongAnswers(body.answers);
    if (!answers) return json(400, { error: en ? 'Missing answers: please answer at least 5 questions.' : 'Faltan respuestas: contesta al menos 5 preguntas.' });
    // kind 'pareja' o 'cumple' (regalos): el nombre es obligatorio y va en la letra. Cualquier otro valor = versión para uno mismo.
    const kind = kindOf(body.kind);
    const gift = kind !== 'self';
    const APP = appOf(kind);
    const partner = gift ? cleanName(body.partner) : '';
    if (gift && !partner) return json(400, { error: kind === 'couple' ? "Please type just your partner's first name (letters only, up to 30)." : kind === 'cumple' ? 'Escribe solo el nombre de quien cumple años (letras, hasta 30).' : 'Escribe solo el nombre de tu pareja (letras, hasta 30).' });
    const anonId = typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : '';
    const t0 = Date.now();
    const ipKey = hashIp(ipOf(event));
    const country = countryOf(event);

    try {
        // Límites (si el conteo falla, se deja pasar: un error de la base no debe bloquear a una persona real).
        try {
            const [byIp, byAnon] = await Promise.all([
                store.countEventsLastHour(ipKey, 'sfc_song_generated'),
                anonId ? store.countEventsLastHour(anonId, 'sfc_song_generated') : 0
            ]);
            if (byIp >= MAX_PER_HOUR_IP || byAnon >= MAX_PER_HOUR_ANON) return json(429, { error: en ? 'You made several songs in a short time. Please try again in a little while.' : 'Ya hiciste varias canciones en poco tiempo. Vuelve a intentarlo en un rato.' });
        } catch (e) { console.error('[sfc-generate-song] conteo', e.message); }

        const song = await generateWithRetries((kind === 'pareja' ? partnerPrompt(answers, 'Sorpréndeme', partner) : kind === 'cumple' ? birthdayPrompt(answers, 'Sorpréndeme', partner) : kind === 'couple' ? coupleEnPrompt(answers, 'Surprise me', partner) : songPrompt(answers, 'Sorpréndeme', '')), en ? SONG_SCHEMA_EN : SONG_SCHEMA, en ? validSongEn : validSong,
            { tag: 'sfc-generate-song', maxOutputTokens: 1800, deadline: t0 + BUDGET_MS });
        const clean = {
            format: 'song',
            kind,
            ...(partner ? { partner } : {}),
            title: String(song.title).replace(/["“”]/g, '').trim().slice(0, 80),
            subtitle: String(song.subtitle).trim().slice(0, 140),
            style: song.style,
            lyrics: String(song.lyrics).trim().slice(0, 2300),
            answers
        };
        const songId = crypto.randomUUID();
        await saveReading(songId, clean);
        try {
            const meta = { source: 'server', kind, country, seconds: Math.round((Date.now() - t0) / 1000), answered: answers.length };
            // Dos filas: una por IP y otra por navegador, que son las claves del límite.
            await store.logEvent(ipKey, 'anon', anonId || null, 'sfc_song_generated', meta, null, APP);
            if (anonId) await store.logEvent(anonId, 'anon', anonId, 'sfc_song_generated', meta, null, APP);
        } catch (e) { console.error('[sfc-generate-song] evento', e.message); }
        return json(200, { songId, title: clean.title, subtitle: clean.subtitle, style: clean.style, lyrics: clean.lyrics });
    } catch (err) {
        console.error('[sfc-generate-song]', err.message);
        return json(502, { error: en ? "We couldn't write your song right now. Your answers are still saved: please try again." : 'No pudimos escribir tu canción ahora. Tus respuestas siguen guardadas: inténtalo de nuevo.' });
    }
};
