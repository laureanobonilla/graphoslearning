// «herramientas»: guarda lo que la persona va respondiendo (una fila por persona, se va completando).
// Si deja correo o WhatsApp, te llega un correo con todo (igual que tus otras apps).
const store = require('./_lib/store');
const { TOOLS, APP_OF, UUID_RE, json, scrubOne, countryOf, ipOf, hashIp, cleanAnswers, cleanEmail, cleanWhatsapp, saveRow, currentStep } = require('./_lib/hf-core');

const FALLBACK_TO_EMAIL = 'bonillapretiz@gmail.com';
const MAX_NEW_SESSIONS_PER_HOUR_IP = 40;
const MAX_EMAILS_PER_HOUR = 3;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    if ((event.body || '').length > 24000) return json(413, { error: 'Demasiado grande' });
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const sid = String(body.sid || ''), tool = String(body.tool || '');
    if (!UUID_RE.test(sid) || !TOOLS.includes(tool)) return json(400, { error: 'Solicitud inválida' });
    const country = countryOf(event), ipKey = hashIp(ipOf(event)), app = APP_OF[tool];
    const anonId = typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : sid;

    // Freno a quien intente crear sesiones sin parar (solo se revisa al abrir una sesión nueva).
    if (body.first === true) {
        try {
            if (await store.countEventsLastHour(ipKey, 'hf_session') >= MAX_NEW_SESSIONS_PER_HOUR_IP) return json(429, { error: 'Demasiadas solicitudes' });
            await store.logEvent(ipKey, 'anon', anonId, 'hf_session', { tool, source: 'server' }, null, app);
        } catch (e) { console.error('[hf-save] conteo', e.message); }
    }

    const prev = await currentStep(sid);
    const step = Math.max(prev ? prev.step || 0 : 0, Math.min(40, parseInt(body.step, 10) || 0));
    const row = { sid, tool, country: country || null, step, total_steps: Math.min(40, parseInt(body.total, 10) || null) || null,
        answers: cleanAnswers(body.answers), utm: { campaign: scrubOne(body.utm && body.utm.campaign, 40), ad: scrubOne(body.utm && body.utm.ad, 40) } };
    if (body.completed === true) row.completed = true;
    if (body.ai && typeof body.ai === 'object') row.ai = cleanAnswers(body.ai);
    const email = cleanEmail(body.contact && body.contact.email), whatsapp = cleanWhatsapp(body.contact && body.contact.whatsapp);
    if (email) row.contact_email = email;
    if (whatsapp) row.contact_whatsapp = whatsapp;
    if (body.contact && (body.contact.email || body.contact.whatsapp) && !email && !whatsapp) return json(400, { error: 'Revisa tu correo o tu WhatsApp (con código de país).' });

    let saved = true;
    try { await saveRow(row); }
    catch (e) {
        saved = false; console.error('[hf-save] tabla', e.message);
        try { await store.logEvent(sid, 'anon', anonId, 'hf_record_fallback', { tool, step, completed: !!row.completed, answers: row.answers, contact: !!(email || whatsapp), country }, null, app); } catch (_e) { /* no crítico */ }
    }
    if (!(email || whatsapp)) return json(200, { ok: true });

    // Correo: solo cuando deja contacto.
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) { console.error('[hf-save] falta RESEND_API_KEY'); return json(200, { ok: true, emailed: false }); }
    try { if (await store.countEventsLastHour(sid, 'hf_contact_sent') >= MAX_EMAILS_PER_HOUR) return json(200, { ok: true, emailed: false }); } catch (e) { console.error('[hf-save] conteo correo', e.message); }
    const lines = [`Nuevo contacto · herramienta «${tool}»`, ``, `Correo: ${email || '(no dejó)'}`, `WhatsApp: ${whatsapp || '(no dejó)'}`, `País (aprox.): ${country || 'desconocido'}`,
        ...(row.utm.campaign || row.utm.ad ? [`Campaña: ${row.utm.campaign || '-'} · anuncio: ${row.utm.ad || '-'}`] : []), `Código: ${sid}`, ``, `=== LO QUE RESPONDIÓ ===`,
        ...Object.entries(row.answers).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`),
        ...(row.ai ? [``, `=== LO QUE LA IA LE DIJO ===`, JSON.stringify(row.ai, null, 1).slice(0, 1800)] : []), ``,
        `Registro en la base de datos: ${saved ? 'guardado en hf_responses' : 'LA TABLA hf_responses NO EXISTE O FALLÓ: guardado como evento hf_record_fallback (corre supabase/herramientas.sql)'}.`];
    try {
        const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Graphikosmos <onboarding@resend.dev>', to: [process.env.FEEDBACK_TO_EMAIL || FALLBACK_TO_EMAIL], subject: `Contacto · ${tool} · ${email || whatsapp}`, text: lines.join('\n') }) });
        if (!res.ok) { console.error('[hf-save] Resend', res.status); return json(200, { ok: true, emailed: false }); }
        try { await saveRow({ sid, tool, email_sent: true }); } catch (_e) { /* no crítico */ }
        try { await store.logEvent(sid, 'anon', anonId, 'hf_contact_sent', { tool, source: 'server', country, saved }, null, app); } catch (_e) { /* no crítico */ }
        return json(200, { ok: true, emailed: true });
    } catch (e) { console.error('[hf-save] correo', e.message); return json(200, { ok: true, emailed: false }); }
};
