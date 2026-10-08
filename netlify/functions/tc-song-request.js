// «tu-cancion»: registra lo que la persona armó y, cuando ya quiere recibir la muestra, te manda el correo.
//  via 'draft'    → solo guarda el borrador (letra propia lista para revisar): sin correo.
//  via 'whatsapp' → abrió WhatsApp (sin número): es una INTENCIÓN; se guarda y te llega correo marcado así.
//  via 'phone'    → dejó su número: se guarda y te llega el correo con el número y el enlace a WhatsApp.
// TODO queda en la tabla tc_songs (supabase/tu-cancion.sql) y en events (app = 'tu-cancion'). Si la tabla aún no existe,
// el correo sale igual y el registro completo se guarda como evento `tc_record_fallback`.
const store = require('./_lib/store');
const { json, UUID_RE, scrub, scrubOne, countryOf, saveSong, cleanBrief, priceFor } = require('./_lib/tc-core');
const { cleanName, normalizePhone } = require('./_lib/qer-song');

const FALLBACK_TO_EMAIL = 'bonillapretiz@gmail.com';
const MAX_EMAILS_PER_HOUR = 3;
const pick = (main, other) => (other ? `${main ? main + ' / ' : ''}${other}` : main);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const id = String(body.id || '');
    const via = ['draft', 'whatsapp', 'phone'].includes(body.via) ? body.via : '';
    if (!UUID_RE.test(id) || !via) return json(400, { error: 'Solicitud inválida' });
    const anonId = typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : '';
    const brief = cleanBrief(body.brief);
    const name = brief.named ? cleanName(brief.name) : '';
    if (brief.named && !name) return json(400, { error: 'Escribe solo el nombre (letras, hasta 30).' });
    const lyrics = scrub(body.lyrics, 2600), lyricsFinal = scrub(body.lyricsFinal, 3200), title = scrubOne(body.title, 90) || 'Sin título';
    const phone = via === 'phone' ? normalizePhone(body.phone) : null;
    if (via === 'phone' && !phone) return json(400, { error: 'Revisa tu número: incluye el código de tu país, por ejemplo +506 8888 1234.' });
    if (via !== 'draft' && body.consent !== true) return json(400, { error: 'Falta tu permiso para que te escriba.' });
    if (!lyricsFinal && !lyrics) return json(400, { error: 'Falta la letra.' });
    const country = countryOf(event), price = priceFor(country);
    const utm = { campaign: scrubOne(body.utm && body.utm.campaign, 40), ad: scrubOne(body.utm && body.utm.ad, 40) };
    const status = via === 'draft' ? 'own_lyrics_ready' : via === 'whatsapp' ? 'whatsapp_intent' : 'requested';

    // 1) Registro completo (tabla) — nunca debe impedir el correo.
    const row = { id, status, anon_id: anonId || null, country: country || null, price_text: price.text, price_amount: price.amount, price_currency: price.currency,
        has_own_lyrics: brief.hasOwnLyrics, reason: brief.reasonOther || brief.reason || null, person_name: name || null, rhythm: brief.rhythmOther || brief.rhythm || null,
        details: brief.details || null, notes: brief.notes || null, brief, title, lyrics_final: lyricsFinal || lyrics, utm,
        ...(brief.hasOwnLyrics ? { lyrics } : {}), ...(via !== 'draft' ? { via } : {}), ...(phone ? { phone } : {}) };
    let saved = true;
    try { await saveSong(row); } catch (e) {
        saved = false; console.error('[tc-song-request] tabla', e.message);
        try { await store.logEvent(id, 'anon', anonId || null, 'tc_record_fallback', { stage: status, ...row, lyrics_final: String(row.lyrics_final).slice(0, 2500), lyrics: String(row.lyrics || '').slice(0, 2500) }, null, 'tu-cancion'); } catch (_e) { /* no crítico */ }
    }
    if (via === 'draft') return json(200, { ok: true });

    // 2) Correo
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) { console.error('[tc-song-request] falta RESEND_API_KEY'); return json(503, { error: 'No pudimos registrar tu solicitud ahora. Escríbeme por WhatsApp.' }); }
    let used = 0;
    try { used = await store.countEventsLastHour(id, 'tc_request_sent'); } catch (e) { console.error('[tc-song-request] conteo', e.message); }
    if (used >= MAX_EMAILS_PER_HOUR) return json(429, { error: 'Ya recibí tu solicitud. Te escribo pronto por WhatsApp.' });

    const digits = phone ? phone.slice(1) : '';
    const firstMsg = `Hola, soy quien hace "tu canción". Ya recibí tu pedido de «${title}»${brief.rhythm || brief.rhythmOther ? ` (${pick(brief.rhythm, brief.rhythmOther)})` : ''}. Voy a preparar una primera muestra. ¿Te la envío por aquí?`;
    const text = [
        `Nueva solicitud · tu canción · ${via === 'phone' ? 'CON TELÉFONO' : 'SOLO ABRIÓ WHATSAPP'}`,
        ``,
        ...(via === 'whatsapp'
            ? [`SOLO ABRIÓ WHATSAPP (no dejó teléfono): es una INTENCIÓN, no un pedido confirmado.`, `Solo cuenta si te llega su mensaje con el código ${id.slice(0, 8)}. Todo lo que armó queda guardado igual (tabla tc_songs, id ${id}).`]
            : [`Teléfono: ${phone}`, `WhatsApp (toca para escribirle con el mensaje listo): https://wa.me/${digits}?text=${encodeURIComponent(firstMsg)}`]),
        ``,
        `Aceptó el precio (casilla marcada): ${body.priceAck === true ? 'SÍ' : 'no consta'}`,
        `Precio que vio: ${price.text}${price.provisional ? ' (PRECIO PROVISIONAL de su país: revisa tc-core.js)' : ''} · País (aprox.): ${country || 'desconocido'}`,
        `Código: ${id}`,
        ``,
        `Tipo: ${brief.hasOwnLyrics ? 'TRAJO SU PROPIA LETRA' : 'Letra escrita por la IA a partir de sus respuestas'}`,
        `Ritmo: ${pick(brief.rhythm, brief.rhythmOther) || '(no dijo)'}`,
        `Razón: ${pick(brief.reason, brief.reasonOther) || '(no aplica)'}`,
        ...(brief.named ? [`Nombre dedicado: ${name}`] : []),
        ...(brief.qualities.length || brief.qualitiesOther ? [`Lo que la hace especial: ${[...brief.qualities, brief.qualitiesOther].filter(Boolean).join('; ')}`] : []),
        ...(brief.feeling || brief.feelingOther ? [`Quiere que se sienta: ${pick(brief.feeling, brief.feelingOther)}`] : []),
        ...brief.extra.map(e => `${e.q} → ${[...e.a, e.other].filter(Boolean).join('; ')}`),
        ...(brief.details ? [`Detalles suyos: ${brief.details}`] : []),
        ...(brief.notes ? [`Otra observación: ${brief.notes}`] : []),
        ...(utm.campaign || utm.ad ? [`Campaña: ${utm.campaign || '-'} · anuncio: ${utm.ad || '-'}`] : []),
        ``,
        `=== LETRA CON LA QUE ENVIÓ${lyricsFinal && lyrics && lyricsFinal !== lyrics ? ' (la EDITÓ)' : ''} ===\nTítulo: ${title}\n\n${lyricsFinal || lyrics}`,
        ...(lyricsFinal && lyrics && lyricsFinal !== lyrics ? [``, `=== LETRA ORIGINAL (antes de editar) ===\n${lyrics}`] : []),
        ``,
        `Registro en la base de datos: ${saved ? 'guardado en tc_songs' : 'LA TABLA tc_songs NO EXISTE O FALLÓ: guardado como evento tc_record_fallback (corre supabase/tu-cancion.sql)'}.`,
        `Recordatorio: haz la muestra parcial, envíala y solo entonces habla de precio (la persona ya sabe que cuesta ${price.text} y que no paga hasta escucharla).`
    ].join('\n');
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'Graphikosmos <onboarding@resend.dev>', to: [process.env.FEEDBACK_TO_EMAIL || FALLBACK_TO_EMAIL],
                subject: `Tu canción${via === 'whatsapp' ? ' (clic WhatsApp, sin número)' : ''}: ${title} · ${pick(brief.rhythm, brief.rhythmOther) || 'sin ritmo'}${phone ? ' · ' + phone : ''} · ${price.text}`,
                text
            })
        });
        if (!res.ok) {
            console.error('[tc-song-request] Resend', res.status, await res.text().catch(() => ''));
            try { await store.logEvent(id, 'anon', anonId || null, 'tc_request_failed', { reason: `resend_${res.status}`, via, country, source: 'server' }, null, 'tu-cancion'); } catch (_e) { /* no crítico */ }
            return json(502, { error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbeme por WhatsApp.' });
        }
        try { await saveSong({ id, email_sent: true }); } catch (_e) { /* no crítico */ }
        try { await store.logEvent(id, 'anon', anonId || null, 'tc_request_sent', { via, status, rhythm: row.rhythm, hasOwnLyrics: brief.hasOwnLyrics, named: brief.named, edited: !!(lyricsFinal && lyrics && lyricsFinal !== lyrics), price: price.text, country, saved, source: 'server' }, null, 'tu-cancion'); }
        catch (e) { console.error('[tc-song-request] evento', e.message); }
        return json(200, { ok: true });
    } catch (err) {
        console.error('[tc-song-request]', err.message);
        return json(502, { error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo o escríbeme por WhatsApp.' });
    }
};
