// Eventos de uso de "Si fueras una canción". Igual que qer-track-event.js pero con app = 'si-fueras-cancion', para
// que sus exports y sus consultas no se mezclen con los de "¿Quién eres en realidad?".
// A diferencia de aquella, NO se guarda el texto que la persona escribe ni qué opciones eligió: solo el avance
// (qué pregunta, cuántas opciones, si usó "ninguna" o escribió algo) y lo que pasa con la oferta de la canción.
// Nunca debe romper la experiencia: si Supabase falla, responde 200 igual.
const store = require('./_lib/store');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const EVENT_NAME_RE = /^[a-z0-9_:]{1,60}$/;
const MAX_METADATA_JSON_LENGTH = 1500;
const APPS = new Set(['si-fueras-cancion', 'pareja-cancion', 'cumple-cancion', 'couple-song', 'tu-cancion']);   // cada versión escribe con su propio `app`

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const eventName = String(body.event || '');
    if (!EVENT_NAME_RE.test(eventName)) return json(400, { error: 'Nombre de evento no válido' });
    const anonId = typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : null;
    if (!anonId) return json(400, { error: 'Falta anonId' });

    const APP = APPS.has(body.app) ? body.app : 'si-fueras-cancion';
    let metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    // Defensa extra: aunque el cliente no lo mande, aquí se descartan los campos que podrían traer texto de la persona.
    delete metadata.answer; delete metadata.other; delete metadata.picks; delete metadata.name; delete metadata.phone; delete metadata.email; delete metadata.region; delete metadata.city;
    if (JSON.stringify(metadata).length > MAX_METADATA_JSON_LENGTH) metadata = { truncated: true };

    try {
        const h = event.headers || {};
        const raw = h['x-nf-geo'] || h['X-Nf-Geo'];
        const geo = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) : null;
        const code = geo ? geo.country?.code : (h['x-country'] || h['X-Country']);
        const extra = {};
        if (code && /^[A-Za-z]{2}$/.test(String(code)) && !metadata.country) extra.country = String(code).toUpperCase();
        // Región y ciudad aproximadas (de la IP, nunca la IP): sirven para comparar localidades en las pruebas de anuncios.
        const region = geo && geo.subdivision && geo.subdivision.code;
        if (region && /^[A-Za-z0-9-]{1,6}$/.test(String(region)) && !metadata.region) extra.region = String(region).toUpperCase();
        const city = geo && geo.city;
        if (city && /^[\p{L} .'’-]{1,40}$/u.test(String(city)) && !metadata.city) extra.city = String(city);
        if (Object.keys(extra).length) metadata = { ...metadata, ...extra };
    } catch (_e) { /* el país es un extra */ }

    try { await store.logEvent(anonId, 'anon', anonId, eventName, metadata, null, APP); }
    catch (err) { console.error('[sfc-track-event]', err.message); }
    return json(200, { ok: true });
};
