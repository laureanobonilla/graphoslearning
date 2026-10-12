// Recibe el pedido terminado de cualquiera de las 3 apps: valida (contacto obligatorio), mide el audio en el servidor,
// calcula el precio, lo registra (tabla cs_orders + events) y te manda el correo con audio/letra/foto.
const store = require('./_lib/store');
const core = require('./_lib/cs-core');
const { normalizePhone, cleanName } = require('./_lib/qer-song');
const { cleanBrief } = require('./_lib/tc-core');
const { json, UUID_RE, APPS, scrub, scrubOne } = core;

const FALLBACK_TO_EMAIL = 'bonillapretiz@gmail.com';
const MAX_ORDERS_PER_HOUR = 4;

// Verifica un archivo que dice haber subido: debe estar en la carpeta de ESTE pedido y existir en Cloudinary.
async function checkFile(f, app, orderId, kind) {
    if (!f || typeof f !== 'object') return null;
    const publicId = String(f.publicId || '');
    if (!publicId.startsWith(`cs/${app}/${orderId}/${kind}-`) || !/^[\w\-\/]+$/.test(publicId)) return null;
    for (const rt of kind === 'audio' ? ['video', 'raw'] : ['image']) {
        const info = await core.resourceInfo(publicId, rt);
        if (info) return { publicId, resourceType: rt, format: info.format || '', bytes: info.bytes || 0, duration: Number(info.duration) || 0 };
    }
    return null;
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const app = String(b.app || ''), cfg = APPS[app], orderId = String(b.orderId || '');
    if (!cfg || !UUID_RE.test(orderId)) return json(400, { error: 'Solicitud inválida' });

    // Contacto: teléfono o correo, al menos uno (sin esto no se envía nada).
    const phone = b.phone ? normalizePhone(b.phone) : null;
    const email = b.email ? core.cleanEmail(b.email) : '';
    if (b.phone && !phone) return json(400, { error: 'Revisa tu número: incluye el código de tu país, por ejemplo +506 8888 1234.' });
    if (b.email && !email) return json(400, { error: 'Revisa tu correo: parece que le falta algo.' });
    if (!phone && !email) return json(400, { error: 'Déjanos tu teléfono o tu correo para poder enviarte la muestra.' });
    if (b.priceAck !== true) return json(400, { error: 'Marca la casilla para confirmar que entiendes el precio.' });
    const withVideo = cfg.video && b.video === true;
    if (withVideo && b.photoConsent !== true) return json(400, { error: 'Confirma que la foto es tuya o que la persona te dio permiso.' });
    const name = scrubOne(b.contactName, 60);
    const notes = scrub(b.notes, 1500);
    const anonId = typeof b.anonId === 'string' ? b.anonId.slice(0, 64) : '';
    const country = core.countryOf(event);

    // Letra (solo la app que la genera).
    let lyrics = '', lyricsFinal = '', title = '', brief = null;
    if (!cfg.audio) {
        lyrics = scrub(b.lyrics, 2600); lyricsFinal = scrub(b.lyricsFinal, 3200) || lyrics; title = scrubOne(b.title, 90) || 'Sin título';
        if (!lyricsFinal) return json(400, { error: 'Falta la letra.' });
        brief = cleanBrief(b.brief);
        if (brief.named && !cleanName(brief.name)) return json(400, { error: 'Escribe solo el nombre (letras, hasta 30).' });
    }

    if (!core.cldConfigured()) { console.error('[cs-submit] Cloudinary no configurado'); return json(503, { error: 'No pudimos registrar tu pedido ahora. Intenta más tarde.' }); }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) { console.error('[cs-submit] falta RESEND_API_KEY'); return json(503, { error: 'No pudimos registrar tu pedido ahora. Intenta más tarde.' }); }

    const ipKey = core.hashIp(core.ipOf(event));
    try { if ((await store.countEventsLastHour(ipKey, 'cs_submitted')) >= MAX_ORDERS_PER_HOUR) return json(429, { error: 'Ya recibimos tus pedidos. Te escribimos pronto.' }); }
    catch (e) { console.error('[cs-submit] límite', e.message); }

    // Archivos
    let audio = null, photo = null;
    try {
        if (cfg.audio) {
            audio = await checkFile(b.audio, app, orderId, 'audio');
            if (!audio) return json(400, { error: 'No encontramos tu audio. Vuelve a subirlo.' });
        }
        if (withVideo) {
            photo = await checkFile(b.photo, app, orderId, 'photo');
            if (!photo) return json(400, { error: 'No encontramos tu foto. Vuelve a subirla (es necesaria para el video).' });
        }
    } catch (e) { console.error('[cs-submit] archivos', e.message); return json(502, { error: 'No pudimos revisar tus archivos. Inténtalo de nuevo.' }); }

    // Duración: la mide Cloudinary; si no la da, se usa la del navegador (acotada).
    let seconds = audio ? (audio.duration || Math.min(Number(b.audioSeconds) || 0, core.MAX_AUDIO_MIN * 60)) : 0;
    if (audio && seconds > core.MAX_AUDIO_MIN * 60 + 5) return json(400, { error: `El audio dura más de ${core.MAX_AUDIO_MIN} minutos. Envíanos un fragmento más corto o escríbenos.` });
    const price = core.priceOf(app, withVideo, seconds);

    const row = { id: orderId, app, status: 'requested', anon_id: anonId || null, country: country || null, contact_name: name || null, phone: phone || null, email: email || null,
        with_video: withVideo, audio_seconds: audio ? Math.round(seconds) : null, billed_minutes: price.minutes, price_amount: price.amount, price_text: price.text,
        audio_id: audio ? audio.publicId : null, photo_id: photo ? photo.publicId : null, title: title || null, lyrics: lyrics || null, lyrics_final: lyricsFinal || null,
        brief: brief, notes: notes || null, utm: { campaign: scrubOne(b.utm && b.utm.campaign, 40), ad: scrubOne(b.utm && b.utm.ad, 40) } };
    let saved = true;
    try { await core.saveOrder(row); } catch (e) {
        saved = false; console.error('[cs-submit] tabla', e.message);
        try { await store.logEvent(orderId, 'anon', anonId || null, 'cs_record_fallback', { ...row, lyrics: String(row.lyrics || '').slice(0, 2500), lyrics_final: String(row.lyrics_final || '').slice(0, 2500) }, null, app); } catch (_e) { /* no crítico */ }
    }

    // Correo
    const contactLines = [];
    if (phone) { const wa = `Hola${name ? ' ' + name : ''}, soy quien hace tu canción. Ya recibí tu pedido. Voy a preparar una muestra y te la envío por aquí.`; contactLines.push(`Teléfono: ${phone}`, `WhatsApp (toca para escribirle con el mensaje listo): https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(wa)}`); }
    if (email) contactLines.push(`Correo: ${email}`);
    const dl = (f) => core.downloadUrl(f.publicId, f.resourceType, f.format);
    const text = [
        `Nuevo pedido · ${cfg.label} · ${withVideo ? 'CON VIDEO' : 'solo canción'}`,
        ``,
        ...(name ? [`Nombre: ${name}`] : []),
        ...contactLines,
        ``,
        `Precio que aceptó ver: ${price.text}${price.minutes ? ` (${price.minutes} min × ${core.money(price.perMinute)})` : ''} — NO se le cobra hasta que reciba una muestra.`,
        ...(audio ? [`Duración del audio: ${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`] : []),
        `Código: ${orderId} · País (aprox.): ${country || 'desconocido'}`,
        ``,
        ...(audio ? [`AUDIO (descarga, vale 30 días): ${dl(audio)}`] : []),
        ...(photo ? [`FOTO DE SU ROSTRO (descarga, vale 30 días): ${dl(photo)}`, `Confirmó que la foto es suya o que tiene permiso de la persona. Úsala solo para este video.`] : []),
        ...(withVideo && !photo ? [`(quiso video pero no hay foto)`] : []),
        ...(notes ? [``, `Notas de la persona: ${notes}`] : []),
        ...(brief ? [``, `Ritmo: ${brief.rhythmOther || brief.rhythm || '(no dijo)'}`, `Razón: ${brief.reasonOther || brief.reason || '(no aplica)'}`, ...(brief.named ? [`Nombre dedicado: ${cleanName(brief.name)}`] : []), ...(brief.details ? [`Detalles suyos: ${brief.details}`] : []),
            ``, `=== LETRA${lyricsFinal && lyrics && lyricsFinal !== lyrics ? ' (la EDITÓ)' : ''} ===`, `Título: ${title}`, ``, lyricsFinal] : []),
        ``,
        `Registro: ${saved ? 'guardado en la tabla cs_orders' : 'LA TABLA cs_orders NO EXISTE O FALLÓ: guardado como evento cs_record_fallback (corre supabase/servicio-canciones.sql)'}.`
    ].join('\n');
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Graphikosmos <onboarding@resend.dev>', to: [process.env.FEEDBACK_TO_EMAIL || FALLBACK_TO_EMAIL],
                subject: `Pedido ${cfg.label}${withVideo ? ' + VIDEO' : ''} · ${price.text} · ${phone || email}`, text, ...(email ? { reply_to: email } : {}) })
        });
        if (!res.ok) {
            console.error('[cs-submit] Resend', res.status, await res.text().catch(() => ''));
            try { await store.logEvent(ipKey, 'anon', orderId, 'cs_failed', { reason: `resend_${res.status}`, app }, null, app); } catch (_e) { /* no crítico */ }
            return json(502, { error: 'No pudimos registrar tu pedido. Inténtalo de nuevo en un momento.' });
        }
    } catch (err) { console.error('[cs-submit]', err.message); return json(502, { error: 'No pudimos registrar tu pedido. Inténtalo de nuevo en un momento.' }); }
    try { await core.saveOrder({ id: orderId, email_sent: true }); } catch (_e) { /* no crítico */ }
    try { await store.logEvent(ipKey, 'anon', orderId, 'cs_submitted', { app, withVideo, price: price.amount, minutes: price.minutes, saved, hasPhone: !!phone, hasEmail: !!email }, null, app); } catch (e) { console.error('[cs-submit] evento', e.message); }
    return json(200, { ok: true, price: price.text, minutes: price.minutes, seconds: Math.round(seconds) });
};
