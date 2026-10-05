// Registro de uso de "Vestirte" en la misma tabla `events` (app = 'vestirte'). Igual que
// qer-track-event.js, nunca debe romper la experiencia. A diferencia de las respuestas, JAMÁS
// recibe ni guarda fotos.
const store = require('./_lib/store');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const EVENT_NAME_RE = /^[a-z0-9_:]{1,60}$/;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const eventName = String(body.event || '');
    if (!EVENT_NAME_RE.test(eventName)) return json(400, { error: 'Nombre de evento no válido' });
    const anonId = typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : null;
    if (!anonId) return json(400, { error: 'Falta anonId' });
    let metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    if (JSON.stringify(metadata).length > 4000) metadata = { truncated: true };
    try { await store.logEvent(anonId, 'anon', anonId, eventName, metadata, null, 'vestirte'); }
    catch (err) { console.error('[vst-track-event]', err.message); }
    return json(200, { ok: true });
};
