// /tu-app/ paso 2: la persona deja su correo. Se le confirma, se le manda al DUEÑO la especificación para construir la app
// y todo queda en `events` (event_name = 'tuapp_lead'). Idempotente.
const { getReading, saveReading } = require('./_lib/qer-readings-store');
const { isEmail, send, OWNER, FROM_OWNER, FROM_CUSTOMER } = require('./_lib/qer-email');
const core = require('./_lib/tuapp-core');
const store = require('./_lib/store');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
let windowStart = Date.now(), count = 0;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const id = String(body.id || ''), email = String(body.email || '').trim().toLowerCase(), consent = body.consent === true;
    const anonId = String(body.anonId || '').slice(0, 64) || id;
    if (!UUID_RE.test(id) || !isEmail(email) || !consent) return json(400, { error: 'invalid' });
    if (Date.now() - windowStart > 3600 * 1000) { windowStart = Date.now(); count = 0; }
    if (++count > 80) return json(429, { error: 'too_many' });
    try {
        const r = await getReading(id);
        if (!r || r.format !== 'tuapp' || !r.proposal) return json(404, { error: 'not_found' });
        if (r.lead) return json(200, { ok: true, already: true });
        const a = r.proposal, c = core.customerEmail(a);
        const confirmed = !!(await send({ from: FROM_CUSTOMER(), to: email, subject: c.subject, html: c.html, text: c.text, replyTo: OWNER() })).ok;
        const m = core.ownerEmail({ email, consent, confirmed, proposal: a, transcript: r.transcript, id });
        const owner = await send({ from: FROM_OWNER(), to: OWNER(), subject: m.subject, html: m.html, text: m.text });
        const { paid, ...rest } = r;
        try { await saveReading(id, { ...rest, lead: { email, at: Date.now() } }); } catch (e) { console.error('[tuapp-lead] marca no guardada:', e.message); }
        try { await store.logEvent(anonId, 'anon', anonId, 'tuapp_lead', { email, consent, confirmed, ownerMailed: !!owner.ok, appName: a.appName, tagline: a.tagline, problem: a.problemSummary, complexity: a.complexity, suggestedPrice: a.suggestedPrice, sensitive: a.sensitive || undefined, id }, null, 'tu-app'); } catch (e) { console.error('[tuapp-lead] evento no guardado:', e.message); }
        return json(200, { ok: true, confirmed });
    } catch (err) {
        console.error('[tuapp-lead]', err.message);
        return json(502, { error: 'send_failed' });
    }
};
