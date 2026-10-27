// «¿Quién eres?» con correo: recibe el correo que la persona dejó para recibir su resultado y hace TRES cosas:
//  1) le manda su lectura completa (Resend);
//  2) le pide a la IA que lea sus respuestas y proponga al DUEÑO una app que ofrecerle (_lib/qer-lead-core.js);
//  3) manda ese análisis al correo del dueño y lo deja en `events` (event_name = 'qer_lead') para poder consultarlo con SQL.
// Si el paso 1 falla (p. ej. el dominio de Resend sin verificar) devuelve ok:false y la página muestra el resultado en pantalla.
// El paso 2 y 3 se hacen igual aunque falle el 1. Idempotente: si ya se entregó, no vuelve a enviar nada.
const { getReading, saveReading } = require('./_lib/qer-readings-store');
const { fullView } = require('./_lib/qer-reading-view');
const { deliverReading, isEmail, send, OWNER, FROM_OWNER } = require('./_lib/qer-email');
const { generateWithRetries } = require('./_lib/qer-gemini');
const lead = require('./_lib/qer-lead-core');
const letterLib = require('./_lib/qer-letter');
const store = require('./_lib/store');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPS = new Set(['quien-eres']);
const MAX_PER_HOUR = 60;
let windowStart = Date.now(), count = 0; // por instancia: freno básico
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const readingId = String(body.readingId || '');
    const email = String(body.email || '').trim().toLowerCase();
    const app = APPS.has(body.app) ? body.app : 'quien-eres';
    const consent = body.consent === true;
    const anonId = String(body.anonId || '').slice(0, 80) || readingId;
    if (!UUID_RE.test(readingId) || !isEmail(email)) return json(400, { error: 'invalid_email' });
    if (Date.now() - windowStart > 3600 * 1000) { windowStart = Date.now(); count = 0; }
    if (++count > MAX_PER_HOUR) return json(429, { error: 'too_many' });
    const t0 = Date.now();
    try {
        const reading = await getReading(readingId);
        if (!reading || !reading.map || reading.format !== 'free-self-es') return json(404, { error: 'not_found' });
        if (reading.lead && reading.lead.delivered) return json(200, { ok: true, already: true });

        const view = fullView(reading);
        const transcript = String(reading.transcript || '').slice(0, 9000);
        const deadline = t0 + 22000;

        // Carta final (si la IA no alcanza, el informe sale igual, sin carta).
        const letterP = transcript
            ? generateWithRetries(letterLib.prompt(transcript, reading.archetypeName), letterLib.SCHEMA, letterLib.validate, { tag: 'qer-letter', maxOutputTokens: 2048, deadline, attemptMs: 15000 }).then(letterLib.clean).catch(err => { console.error('[qer-lead] carta falló:', err.message); return null; })
            : Promise.resolve(null);
        // El análisis para el dueño y la carta se piden a la vez; el correo sale en cuanto está la carta.
        // El análisis de «qué app ofrecerle» queda APAGADO (lo importante es que el informe llegue). Para volver a encenderlo: QER_LEAD_ANALYSIS=1 en Netlify.
        const analysisP = (transcript && process.env.QER_LEAD_ANALYSIS === '1')
            ? generateWithRetries(lead.prompt(transcript, reading.archetypeName), lead.SCHEMA, lead.validate, { tag: 'qer-lead', maxOutputTokens: 3072, deadline, attemptMs: 15000 }).catch(err => { console.error('[qer-lead] análisis falló:', err.message); return null; })
            : Promise.resolve(null);
        const letter = await letterP;
        view.designed = true; view.letter = letter; view.readingId = readingId;
        try { const raw = (event.headers || {})['x-nf-geo']; view.country = raw ? String((JSON.parse(Buffer.from(raw, 'base64').toString('utf8')).country || {}).code || '').toUpperCase() : ''; } catch (_e) { view.country = ''; }
        const mail = await deliverReading({ view, format: reading.format, to: email, link: '', skipOwner: true });
        const analysis = await analysisP;
        const delivered = !!(mail.customer && mail.customer.ok);
        const reason = delivered ? undefined : (mail.customer ? mail.customer.reason : 'correo no válido');

        const m = lead.renderOwnerEmail({ email, consent, delivered, deliveryReason: reason, archetype: reading.archetypeName, analysis, transcript, readingId });
        const ownerMail = await send({ from: FROM_OWNER(), to: OWNER(), subject: m.subject, html: m.html, text: m.text });

        try { await saveReading(readingId, { ...stripPaid(reading), lead: { email, consent, delivered, at: Date.now() } }); } catch (e) { console.error('[qer-lead] no se guardó la marca:', e.message); }
        try {
            await store.logEvent(readingId, 'anon', anonId, 'qer_lead', {
                email, consent, delivered, deliveryReason: reason, ownerMailed: !!ownerMail.ok, analyzed: !!analysis, archetype: reading.archetypeName,
                appName: analysis && analysis.app.name, appPromise: analysis && analysis.app.promise, complexity: analysis && analysis.app.complexity,
                payingSignal: analysis && analysis.payingSignal, sensitive: analysis && analysis.sensitive || undefined, pains: analysis && analysis.pains.map(p => p.pain), readingId
            }, null, app);
        } catch (e) { console.error('[qer-lead] evento no guardado:', e.message); }
        console.log(`[qer-lead] ${Date.now() - t0} ms · entrega ${delivered} · análisis ${!!analysis} · dueño ${!!ownerMail.ok}`);
        return json(200, { ok: delivered, reason });
    } catch (err) {
        console.error('[qer-lead]', err.message);
        return json(502, { error: 'send_failed' });
    }
};
function stripPaid(r) { const { paid, ...rest } = r; return rest; }
