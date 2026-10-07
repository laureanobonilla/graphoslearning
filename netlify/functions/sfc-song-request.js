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
const { appOf, kindOf, STYLES, STYLES_EN, SONG_SCHEMA, validSong, songPrompt, cleanName, normalizePhone } = require('./_lib/sfc-song');

const FALLBACK_TO_EMAIL = 'bonillapretiz@gmail.com';
const MAX_PER_HOUR = 2;
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,200}\.[^\s@<>]{2,}$/;
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
    if (!apiKey) { console.error('[sfc-song-request] falta RESEND_API_KEY'); return json(503, { error: T('No pudimos registrar tu solicitud ahora. Escríbeme por WhatsApp.', "We couldn't register your request right now. Please try again in a moment.") }); }

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const en = body.lang === 'en';
    const T = (es, eng) => (en ? eng : es);
    const songId = String(body.songId || '');
    const rawStyle = String(body.style || '');
    const viaWhatsapp = body.via === 'whatsapp';
    const phone = viaWhatsapp ? '' : normalizePhone(body.phone);
    const emailRaw = String(body.email || '').trim();
    const email = emailRaw.length <= 120 && EMAIL_RE.test(emailRaw) ? emailRaw : '';
    const wantsName = String(body.name || '').trim() !== '';
    const name = cleanName(body.name);
    if (wantsName && !name) return json(400, { error: T('Escribe solo tu nombre (letras, hasta 30).', 'Please type just your name (letters only, up to 30).') });
    if (!UUID_RE.test(songId)) return json(400, { error: T('Solicitud inválida', 'Invalid request') });
    if (!viaWhatsapp && !phone && !email) return json(400, { error: en ? 'Please check your email address.' : 'Revisa tu número: incluye el código de tu país, por ejemplo +598 99 123 456.' });
    if (body.consent !== true) return json(400, { error: T('Falta tu permiso para que te escriba.', 'We need your permission to contact you.') });

    const t0 = Date.now();
    const country = countryOf(event);
    try {
        const base = await getReading(songId);
        if (!base || base.format !== 'song' || !base.lyrics) return json(404, { error: T('Esa canción ya no está disponible. Escríbeme por WhatsApp y lo resolvemos.', 'That song is no longer available. Please make a new one.') });

        const kind = kindOf(base.kind);
        const gift = kind !== 'self';
        const styleList = kind === 'couple' ? STYLES_EN : STYLES;
        const surprise = kind === 'couple' ? 'Surprise me' : 'Sorpréndeme';
        const style = styleList.includes(rawStyle) ? rawStyle : surprise;
        const APP = appOf(kind);
        let used = 0;
        try { used = await store.countEventsLastHour(songId, 'song_request_sent'); } catch (e) { console.error('[sfc-song-request] conteo', e.message); }
        if (used >= MAX_PER_HOUR) return json(429, { error: T('Ya recibí tu solicitud. Te escribo pronto por WhatsApp.', "I already got your request. I'll email you very soon.") });

        // Con nombre: la letra se rehace con él. Si falla, se manda la original y se avisa en el correo.
        let named = null;
        if (kind === 'self' && name && Array.isArray(base.answers) && base.answers.length) {
            try {
                const wantedStyle = style === surprise ? base.style : style;
                named = await generateWithRetries(songPrompt(base.answers, wantedStyle, name), SONG_SCHEMA, validSong,
                    { tag: 'sfc-song-request', maxOutputTokens: 1800, deadline: t0 + LYRICS_BUDGET_MS });
            } catch (err) { console.error('[sfc-song-request] letra con nombre falló:', err.message); }
        }
        const finalStyle = style === surprise ? (named?.style || base.style || style) : style;

        const partner = gift ? String(base.partner || '') : '';
        const digits = phone ? phone.slice(1) : '';
        const firstMsg = kind === 'couple' ? `Hi! This is the sample for «${base.title}» (${finalStyle}) that you asked for. Tell me honestly what you feel when you hear it.` : `Hola, soy quien hizo ${kind === 'pareja' ? '"Si tu pareja fuera una canción"' : kind === 'cumple' ? '"Una canción para su cumpleaños"' : '"Si fueras una canción"'} y pediste que suene «${base.title}» (${finalStyle}). Ya tengo una primera muestra. ¿Te la envío por aquí?`;
        const waLink = `https://wa.me/${digits}?text=${encodeURIComponent(firstMsg)}`;
        const text = [
            `Nueva solicitud de canción · ${kind === 'pareja' ? 'PAREJA (regalo)' : kind === 'cumple' ? 'CUMPLEAÑOS (regalo)' : kind === 'couple' ? 'COUPLE (EN, USA, regalo)' : 'Si fueras una canción'}`,
            ``,
            ...(viaWhatsapp
                ? [`SOLO ABRIÓ WHATSAPP (no dejó teléfono): es una INTENCIÓN, no un pedido confirmado.`,
                   `Solo cuenta si te llega su mensaje con el código ${songId}. Muchas personas abren WhatsApp y no lo envían; si no llega, no hay forma de contactarla.`]
                : [...(email ? [`EMAIL (responde aquí, en inglés): ${email}`, `Para contestar: mailto:${email}?subject=${encodeURIComponent('Your song «' + base.title + '»')}`] : []),
                   ...(phone ? [`Teléfono: ${phone}`,
                   `WhatsApp (toca para escribirle con el mensaje listo): ${waLink}`] : [])]),
            `Estilo pedido: ${style}${style === surprise ? ` (la letra sugiere: ${finalStyle})` : ''}`,
            ...(gift
                ? [`${kind === 'cumple' ? 'Nombre de quien cumple años' : kind === 'couple' ? 'Partner name (en la letra)' : 'Nombre de la pareja'} (ya va en la letra): ${partner || '(no guardado)'}`, `Es un REGALO: quien la pide la va a dar. No hace falta rehacer la letra.`]
                : []),
            ...(kind === 'self' ? [`Nombre en la canción: ${name ? name + (named ? '' : ' (NO se pudo rehacer la letra con el nombre: va la original, ponlo tú)') : '(no quiere nombre)'}`] : []),
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
                subject: `Canción (${kind === 'pareja' ? 'Pareja' : kind === 'cumple' ? 'Cumpleaños' : kind === 'couple' ? 'COUPLE EN' : 'Si fueras…'})${viaWhatsapp ? ' (clic WhatsApp, sin número)' : ''}: ${base.title} · ${finalStyle}${phone ? ' · ' + phone : ''}${email ? ' · ' + email : ''}`,
                text
            })
        });
        if (!res.ok) {
            console.error('[sfc-song-request] Resend', res.status, await res.text().catch(() => ''));
            try { await store.logEvent(songId, 'anon', songId, 'song_request_failed', { reason: `resend_${res.status}`, country, source: 'server' }, null, APP); } catch (_e) { /* no crítico */ }
            return json(502, { error: T('No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbeme por WhatsApp.', "We couldn't register your request. Please try again.") });
        }
        try { await store.logEvent(songId, 'anon', songId, 'song_request_sent', { style, kind, hasName: !!name || !!partner, nameApplied: !!named, via: viaWhatsapp ? 'whatsapp' : (email ? 'email' : 'form'), country, source: 'server' }, null, APP); }
        catch (e) { console.error('[sfc-song-request] evento', e.message); }
        return json(200, { ok: true });
    } catch (err) {
        console.error('[sfc-song-request]', err.message);
        return json(502, { error: T('No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbeme por WhatsApp.', "We couldn't register your request. Please try again.") });
    }
};
