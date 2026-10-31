// «jingle-negocio»: registra el pedido y le manda a usted un correo con todo (y el enlace de WhatsApp listo).
//  via 'draft'    → solo guarda el avance (sin correo).
//  via 'whatsapp' → dejó su número de WhatsApp: pedido completo, sale el correo.
// Todo queda en jn_orders (supabase/jingle-negocio.sql) y en events (app = 'jingle-negocio'). Si la tabla aún no existe,
// el correo sale igual y el registro se guarda como evento `jn_record_fallback`.
const store = require('./_lib/store');
const cs = require('./_lib/cs-core');
const core = require('./_lib/jn-core');
const { normalizePhone } = require('./_lib/qer-song');
const { json, UUID_RE, scrub, scrubOne } = core;

const FALLBACK_TO_EMAIL = 'bonillapretiz@gmail.com';
const MAX_EMAILS_PER_HOUR = 3;
const LOGO_ID_RE = /^jn\/[0-9a-f-]{36}\/logo-[0-9a-f]{8}$/i;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const id = String(body.id || ''), via = ['draft', 'whatsapp'].includes(body.via) ? body.via : '';
    if (!UUID_RE.test(id) || !via) return json(400, { error: 'Solicitud inválida' });
    const anonId = typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : '';
    const b = core.cleanBrief(body.brief);
    if (!b.rubro || !b.option) return json(400, { error: 'Elija el tipo de negocio y la opción.' });
    if (b.business.length < 2) return json(400, { error: 'Escriba el nombre de su negocio.' });
    const lyrics = scrub(body.lyrics, 2200), lyricsFinal = scrub(body.lyricsFinal, 2600), title = scrubOne(body.title, 90);
    const logoId = LOGO_ID_RE.test(String(body.logoId || '')) && String(body.logoId).includes(id) ? String(body.logoId) : '';
    const phone = via === 'whatsapp' ? normalizePhone(body.phone) : null;
    if (via === 'whatsapp' && !phone) return json(400, { error: 'Revise su número: incluya el código de país, por ejemplo +506 8888 1234.' });
    const contactName = scrubOne(body.contactName, 40);
    if (via !== 'draft' && body.priceAck !== true) return json(400, { error: 'Falta confirmar el precio.' });
    const country = core.countryOf(event), price = core.priceOf(b.option);
    const utm = { campaign: scrubOne(body.utm && body.utm.campaign, 40), ad: scrubOne(body.utm && body.utm.ad, 40) };
    const status = via === 'draft' ? 'draft' : 'requested';

    const row = { id, status, anon_id: anonId || null, country: country || null, rubro: b.rubroLabel, option: b.option,
        price_text: price.text, price_amount: price.amount, business: b.business, rhythm: core.rhythmText(b) || null, details: b.details || null,
        brief: b, utm, ...(title ? { title } : {}), ...(lyricsFinal || lyrics ? { lyrics_final: lyricsFinal || lyrics } : {}),
        ...(logoId ? { logo_id: logoId } : {}), ...(phone ? { phone } : {}), ...(contactName ? { contact_name: contactName } : {}) };
    let saved = true;
    try { await core.saveOrder(row); } catch (e) {
        saved = false; console.error('[jn-request] tabla', e.message);
        try { await store.logEvent(id, 'anon', anonId || null, 'jn_record_fallback', { stage: status, ...row }, null, 'jingle-negocio'); } catch (_e) { /* no crítico */ }
    }
    if (via === 'draft') return json(200, { ok: true });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) { console.error('[jn-request] falta RESEND_API_KEY'); return json(503, { error: 'No pudimos registrar su pedido ahora. Escríbanos por WhatsApp.' }); }
    let used = 0;
    try { used = await store.countEventsLastHour(id, 'jn_request_sent'); } catch (e) { console.error('[jn-request] conteo', e.message); }
    if (used >= MAX_EMAILS_PER_HOUR) return json(429, { error: 'Ya recibimos su pedido. Le escribimos pronto por WhatsApp.' });

    let logoLink = '';
    if (logoId) { try { logoLink = cs.downloadUrl(logoId, 'image'); } catch (e) { console.error('[jn-request] logo', e.message); } }
    const optLabel = core.OPTIONS[b.option].label;
    const firstMsg = `Hola${contactName ? ' ' + contactName : ''}, le escribo por el jingle de ${b.business} (${optLabel.toLowerCase()}). El total es ${price.text}. Para empezar, puede hacer el SINPE Móvil a este número y me envía el comprobante por aquí.`;
    const text = [
        `Nuevo pedido · Jingle para negocio · ${optLabel.toUpperCase()}`,
        ``,
        `Negocio: ${b.business}${b.pronounce ? ` (se pronuncia: ${b.pronounce})` : ''}`,
        `Rubro: ${b.rubroLabel}`,
        ...(b.canton ? [`Cantón: ${b.canton}`] : []),
        `Contacto: ${contactName || '(sin nombre)'} · ${phone}`,
        `WhatsApp con mensaje listo: https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(firstMsg)}`,
        ``,
        `Precio aceptado: ${price.text}`,
        `Logo: ${logoLink ? `subido · descarga (30 días): ${logoLink}` : 'no subió logo'}`,
        ...(b.slogan ? [`Eslogan: ${b.slogan}`] : []),
        ...(b.phoneInSong ? [`Teléfono para la canción: ${b.phoneInSong}`] : []),
        ...(core.rhythmText(b) ? [`Ritmo: ${core.rhythmText(b)}`] : []),
        ...(b.details ? [`Lo que contó del negocio: ${b.details}`] : []),
        ...(b.notes ? [`Observaciones: ${b.notes}`] : []),
        ...(utm.campaign || utm.ad ? [`Campaña: ${utm.campaign || '-'} · anuncio: ${utm.ad || '-'}`] : []),
        `Código: ${id}`,
        ...(lyricsFinal || lyrics ? [``, `=== LETRA${lyricsFinal && lyrics && lyricsFinal !== lyrics ? ' (la EDITÓ)' : ''} ===\nTítulo: ${title || '-'}\n\n${lyricsFinal || lyrics}`] : []),
        ``,
        `Qué hacer: ${b.option === 'logo' ? 'poner su logo y datos al video del rubro y entregar.' : b.option === 'nombre' ? 'regenerar la canción del rubro con el nombre del negocio, ponerle el logo y entregar.' : 'producir la canción con esta letra y ritmo, ponerle el logo y entregar.'}`,
        `Registro: ${saved ? 'guardado en jn_orders' : 'LA TABLA jn_orders NO EXISTE O FALLÓ: guardado como evento jn_record_fallback (corra supabase/jingle-negocio.sql)'}.`
    ].join('\n');
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Graphikosmos <onboarding@resend.dev>', to: [process.env.FEEDBACK_TO_EMAIL || FALLBACK_TO_EMAIL],
                subject: `Jingle: ${b.business} · ${b.rubroLabel} · ${b.option} · ${price.text} · ${phone}`, text })
        });
        if (!res.ok) {
            console.error('[jn-request] Resend', res.status, await res.text().catch(() => ''));
            return json(502, { error: 'No pudimos registrar su pedido. Inténtelo de nuevo o escríbanos por WhatsApp.' });
        }
        try { await core.saveOrder({ id, email_sent: true }); } catch (_e) { /* no crítico */ }
        try { await store.logEvent(id, 'anon', anonId || null, 'jn_request_sent', { option: b.option, rubro: b.rubro, logo: !!logoId, price: price.text, country, saved, source: 'server' }, null, 'jingle-negocio'); }
        catch (e) { console.error('[jn-request] evento', e.message); }
        return json(200, { ok: true, price: price.text });
    } catch (err) {
        console.error('[jn-request]', err.message);
        return json(502, { error: 'No pudimos registrar su pedido. Inténtelo de nuevo o escríbanos por WhatsApp.' });
    }
};
