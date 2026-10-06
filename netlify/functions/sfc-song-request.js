// "Si fueras una canción": la persona ya vio su letra y pide que SUENE. Llega a tu correo (Resend) con teléfono o
// aviso de WhatsApp, estilo, nombre opcional y la letra. Después le escribes con una muestra parcial y, si le gusta,
// cobras la versión completa. Mismas reglas que qer-song-request.js:
// - via:'whatsapp' = pidió por el botón de WhatsApp (sin teléfono; ella te escribe con el código).
// - Con nombre (body.name) se REHACE la letra con su nombre a partir de las respuestas guardadas; el correo trae las dos versiones.
// - El teléfono y el nombre NO se guardan en la base de datos: solo viajan en el correo.
// - Si Gemini falla o tarda, el correo sale igual con la letra original: nunca se pierde un contacto por eso.
// - Si el correo falla, se responde error para que la persona reintente.
// - Límite: 2 solicitudes por hora por canción.
const store = require('./_lib/store');
const { getReading } = require('./_lib/qer-readings-store');
const { generateWithRetries } = require('./_lib/qer-gemini');
const { json, UUID_RE } = require('./_lib/qer-map-core');
const { APP, STYLES, SONG_SCHEMA, validSong, songPrompt, cleanName, normalizePhone } = require('./_lib/sfc-song');

const FALLBACK_TO_EMAIL = 'bonillapretiz@gmail.com';
const MAX_PER_HOUR = 2;
const LYRICS_BUDGET_MS = 17000;

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
    if (!apiKey) { console.error('[sfc-song-request] falta RESEND_API_KEY'); return json(503, { error: 'No pudimos registrar tu solicitud ahora. Escríbeme por WhatsApp.' }); }

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const songId = String(body.songId || '');
    const style = STYLES.includes(body.style) ? body.style : 'Sorpréndeme';
    const viaWhatsapp = body.via === 'whatsapp';
    const phone = viaWhatsapp ? '' : normalizePhone(body.phone);
    const wantsName = String(body.name || '').trim() !== '';
    const name = cleanName(body.name);
    if (wantsName && !name) return json(400, { error: 'Escribe solo tu nombre (letras, hasta 30).' });
    if (!UUID_RE.test(songId)) return json(400, { error: 'Solicitud inválida' });
    if (!viaWhatsapp && !phone) return json(400, { error: 'Revisa tu número: incluye el código de tu país, por ejemplo +598 99 123 456.' });
    if (body.consent !== true) return json(400, { error: 'Falta tu permiso para que te escriba.' });

    const t0 = Date.now();
    const country = countryOf(event);
    try {
        const base = await getReading(songId);
        if (!base || base.format !== 'song' || !base.lyrics) return json(404, { error: 'Esa canción ya no está disponible. Escríbeme por WhatsApp y lo resolvemos.' });

        let used = 0;
        try { used = await store.countEventsLastHour(songId, 'song_request_sent'); } catch (e) { console.error('[sfc-song-request] conteo', e.message); }
        if (used >= MAX_PER_HOUR) return json(429, { error: 'Ya recibí tu solicitud. Te escribo pronto por WhatsApp.' });

        // Con nombre: la letra se rehace con él. Si falla, se manda la original y se avisa en el correo.
        let named = null;
        if (name && Array.isArray(base.answers) && base.answers.length) {
            try {
                const wantedStyle = style === 'Sorpréndeme' ? base.style : style;
                named = await generateWithRetries(songPrompt(base.answers, wantedStyle, name), SONG_SCHEMA, validSong,
                    { tag: 'sfc-song-request', maxOutputTokens: 1800, deadline: t0 + LYRICS_BUDGET_MS });
            } catch (err) { console.error('[sfc-song-request] letra con nombre falló:', err.message); }
        }
        const finalStyle = style === 'Sorpréndeme' ? (named?.style || base.style || style) : style;

        const digits = phone ? phone.slice(1) : '';
        const firstMsg = `Hola, soy quien hizo "Si fueras una canción" y pediste que suene «${base.title}» (${finalStyle}). Ya tengo una primera muestra. ¿Te la envío por aquí?`;
        const waLink = `https://wa.me/${digits}?text=${encodeURIComponent(firstMsg)}`;
        const text = [
            `Nueva solicitud de canción · Si fueras una canción`,
            ``,
            ...(viaWhatsapp
                ? [`PIDIÓ POR EL BOTÓN DE WHATSAPP (no dejó teléfono).`,
                   `Espera su mensaje en tu WhatsApp: traerá el código ${songId}. Si no lo envía, no hay forma de contactarla.`]
                : [`Teléfono: ${phone}`,
                   `WhatsApp (toca para escribirle con el mensaje listo): ${waLink}`]),
            `Estilo pedido: ${style}${style === 'Sorpréndeme' ? ` (la letra sugiere: ${finalStyle})` : ''}`,
            `Nombre en la canción: ${name ? name + (named ? '' : ' (NO se pudo rehacer la letra con el nombre: va la original, ponlo tú)') : '(no quiere nombre)'}`,
            `País (aprox.): ${country || 'desconocido'}`,
            `Código de canción: ${songId}`,
            ``,
            ...(named ? [`=== LETRA CON SU NOMBRE ===\nTítulo: ${String(named.title).replace(/["“”]/g, '').trim()}\n\n${String(named.lyrics).trim().slice(0, 2300)}\n`] : []),
            `=== LETRA QUE VIO EN PANTALLA ===\nTítulo: ${base.title}\n${base.subtitle || ''}\n\n${base.lyrics}`,
            ``,
            `Recordatorio: haz la muestra parcial, envíala y solo entonces habla de precio.`
        ].join('\n');

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'Graphikosmos <onboarding@resend.dev>',
                to: [process.env.FEEDBACK_TO_EMAIL || FALLBACK_TO_EMAIL],
                subject: `Canción (Si fueras…)${viaWhatsapp ? ' WhatsApp' : ''}: ${base.title} · ${finalStyle}${phone ? ' · ' + phone : ''}`,
                text
            })
        });
        if (!res.ok) {
            console.error('[sfc-song-request] Resend', res.status, await res.text().catch(() => ''));
            try { await store.logEvent(songId, 'anon', songId, 'song_request_failed', { reason: `resend_${res.status}`, country, source: 'server' }, null, APP); } catch (_e) { /* no crítico */ }
            return json(502, { error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbeme por WhatsApp.' });
        }
        try { await store.logEvent(songId, 'anon', songId, 'song_request_sent', { style, hasName: !!name, nameApplied: !!named, via: viaWhatsapp ? 'whatsapp' : 'form', country, source: 'server' }, null, APP); }
        catch (e) { console.error('[sfc-song-request] evento', e.message); }
        return json(200, { ok: true });
    } catch (err) {
        console.error('[sfc-song-request]', err.message);
        return json(502, { error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbeme por WhatsApp.' });
    }
};
