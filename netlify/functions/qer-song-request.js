// "Quiero mi canción": la persona deja su teléfono (con código de país) y su estilo preferido. Aquí se escribe la
// letra con Gemini y se manda TODO a tu correo con Resend (teléfono, enlace directo a WhatsApp, estilo, código de
// lectura y letra). Después tú le escribes con una muestra parcial y, si le gusta, cobras la versión completa.
// - El teléfono NO se guarda en la base de datos (ni en `events`): solo viaja en el correo.
// - Si Gemini falla o tarda, el correo sale igual (sin letra): nunca se pierde un contacto por eso.
// - Si el correo falla, se responde error para que la persona pueda reintentar (no se le dice que quedó listo).
// - Límite: 2 solicitudes por hora por lectura.
// Variables: RESEND_API_KEY (ya existe por send-feedback.js), FEEDBACK_TO_EMAIL (opcional), GEMINI_API_KEY.
const store = require('./_lib/store');
const { getReading } = require('./_lib/qer-readings-store');
const { generateWithRetries } = require('./_lib/qer-gemini');
const { json, UUID_RE } = require('./_lib/qer-map-core');
const { STYLES, normalizePhone, LYRICS_SCHEMA, validLyrics, lyricsPrompt } = require('./_lib/qer-song');

const FALLBACK_TO_EMAIL = 'bonillapretiz@gmail.com';
const MAX_PER_HOUR = 2;
const LYRICS_BUDGET_MS = 17000; // deja margen para el correo dentro del límite de la función

const countryOf = (event) => {
    try {
        const h = event.headers || {};
        const raw = h['x-nf-geo'] || h['X-Nf-Geo'];
        return raw ? (JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))?.country?.code || '') : '';
    } catch { return ''; }
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) { console.error('[qer-song-request] falta RESEND_API_KEY'); return json(503, { error: 'No pudimos registrar tu solicitud ahora. Escríbeme por WhatsApp.' }); }

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const readingId = String(body.readingId || '');
    const style = STYLES.includes(body.style) ? body.style : 'Sorpréndeme';
    const phone = normalizePhone(body.phone);
    if (!UUID_RE.test(readingId)) return json(400, { error: 'Solicitud inválida' });
    if (!phone) return json(400, { error: 'Revisa tu número: incluye el código de tu país, por ejemplo +598 99 123 456.' });
    if (body.consent !== true) return json(400, { error: 'Falta tu permiso para que te escriba.' });

    const t0 = Date.now();
    const country = countryOf(event);
    try {
        const base = await getReading(readingId);
        const freeNodes = base?.map?.nodes?.filter(n => n.free && n.text) || [];
        if (!base || !base.archetypeName) return json(404, { error: 'Esa lectura ya no está disponible. Escríbeme por WhatsApp y lo resolvemos.' });

        let used = 0;
        try { used = await store.countEventsLastHour(readingId, 'song_request_sent'); } catch (e) { console.error('[qer-song-request] conteo', e.message); }
        if (used >= MAX_PER_HOUR) return json(429, { error: 'Ya recibí tu solicitud. Te escribo pronto por WhatsApp.' });

        // 1) La letra (si falla, se sigue sin ella).
        let lyrics = null;
        if (freeNodes.length) {
            try {
                lyrics = await generateWithRetries(lyricsPrompt(base, freeNodes, style), LYRICS_SCHEMA, validLyrics,
                    { tag: 'song-request', maxOutputTokens: 1600, temperature: 0.9, deadline: t0 + LYRICS_BUDGET_MS });
            } catch (err) { console.error('[qer-song-request] letra falló:', err.message); }
        }
        const title = lyrics ? String(lyrics.title).replace(/["“”]/g, '').trim().slice(0, 80) : '';
        const letra = lyrics ? String(lyrics.lyrics).trim().slice(0, 1900) : '';

        // 2) El correo para ti.
        const digits = phone.slice(1);
        const firstMsg = `Hola, soy quien hizo ¿Quién eres en realidad? y pediste tu canción. Ya tengo una primera muestra de "${title || 'tu canción'}" (${style}). ¿Te la envío por aquí?`;
        const waLink = `https://wa.me/${digits}?text=${encodeURIComponent(firstMsg)}`;
        const text = [
            `Nueva solicitud de canción`,
            ``,
            `Teléfono: ${phone}`,
            `WhatsApp (toca para escribirle con el mensaje listo): ${waLink}`,
            `Estilo: ${style}`,
            `País (aprox.): ${country || 'desconocido'}`,
            `Arquetipo: ${base.archetypeName}`,
            `Código de lectura: ${readingId}`,
            ``,
            letra ? `Título: ${title}\n\n${letra}` : `(La letra no se pudo generar: escríbela tú o usa el SQL de LEEME 53 más tarde.)`,
            ``,
            `Recordatorio: haz la muestra parcial, envíala y solo entonces habla de precio.`
        ].join('\n');

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'Graphikosmos <onboarding@resend.dev>',
                to: [process.env.FEEDBACK_TO_EMAIL || FALLBACK_TO_EMAIL],
                subject: `Canción: ${title || base.archetypeName} · ${style} · ${phone}`,
                text
            })
        });
        if (!res.ok) {
            console.error('[qer-song-request] Resend', res.status, await res.text().catch(() => ''));
            try { await store.logEvent(readingId, 'anon', readingId, 'song_request_failed', { reason: `resend_${res.status}`, country, source: 'server' }, null, 'quien-eres'); } catch (_e) { /* no crítico */ }
            return json(502, { error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbeme por WhatsApp.' });
        }
        try { await store.logEvent(readingId, 'anon', readingId, 'song_request_sent', { style, hasLyrics: !!letra, country, source: 'server' }, null, 'quien-eres'); }
        catch (e) { console.error('[qer-song-request] evento', e.message); }
        return json(200, { ok: true });
    } catch (err) {
        console.error('[qer-song-request]', err.message);
        return json(502, { error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbeme por WhatsApp.' });
    }
};
