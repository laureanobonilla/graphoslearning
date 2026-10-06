// Registro de eventos de uso para "¿Quién eres en realidad?" — a dónde
// llega cada visitante en el cuestionario (hasta qué pregunta, con todas
// sus respuestas) y si intentó pagar y no pudo (y por qué). Se guarda en la
// MISMA tabla `events` de Supabase que ya usa Graphikosmos (ver
// supabase/schema.sql) — no hace falta ninguna variable de entorno nueva,
// solo las mismas SUPABASE_URL / SUPABASE_SERVICE_KEY que ya existen en
// este sitio. La columna `app = 'quien-eres'` es lo que separa estos
// eventos de los de Graphikosmos en la misma tabla.
//
// A diferencia de track-event.js (Graphikosmos), que a propósito NUNCA
// guarda el texto que escribe la persona (solo datos de forma, por
// privacidad), aquí SÍ se guardan las respuestas completas del cuestionario
// — es justo lo que se pidió para poder leer "todas sus respuestas" de
// cada sesión. Es una decisión consciente, no un descuido: si más adelante
// se prefiere no guardar el texto de respuestas abiertas, basta con que el
// cliente (app.js) deje de mandar `answer` en la metadata — el resto del
// embudo (hasta qué pregunta llegó, si pagó, si falló el pago) sigue
// funcionando igual sin ese campo.
//
// Mismos tres principios que track-event.js:
//   1. Nunca debe poder romper ni frenar la experiencia: si Supabase falla,
//      responde 200 igual.
//   2. Es deliberadamente liviana: no pasa por facturación ni tiene límite
//      de uso propio.
//   3. anonId identifica el NAVEGADOR (no a la persona) y lo genera/guarda
//      el cliente — ver ensureAnonId() en app.js.
const store = require('./_lib/store');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

const EVENT_NAME_RE = /^[a-z0-9_:]{1,60}$/;
const MAX_METADATA_JSON_LENGTH = 4000; // un poco más holgado que track-event.js: aquí sí viaja el texto de las respuestas

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const eventName = String(body.event || '');
    if (!EVENT_NAME_RE.test(eventName)) return json(400, { error: 'Nombre de evento no válido' });

    const anonId = typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : null;
    if (!anonId) return json(400, { error: 'Falta anonId' });

    let metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    if (JSON.stringify(metadata).length > MAX_METADATA_JSON_LENGTH) {
        metadata = { truncated: true };
    }

    // País de la visita (solo el código de 2 letras, p. ej. MX, UY, CR): Netlify lo manda en la cabecera
    // x-nf-geo (JSON en base64). Sirve para comparar el rendimiento del anuncio por país. Si no viene, no se añade.
    try {
        const h = event.headers || {};
        const raw = h['x-nf-geo'] || h['X-Nf-Geo'];
        const code = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))?.country?.code : (h['x-country'] || h['X-Country']);
        if (code && /^[A-Za-z]{2}$/.test(String(code)) && !metadata.country) metadata = { ...metadata, country: String(code).toUpperCase() };
    } catch (_e) { /* el país es un extra: nunca debe romper el registro */ }

    try {
        // Sin cuentas ni invitados con saldo en esta app: el anon_id hace
        // también de actor_id, con actor_kind = 'anon' (ver el ajuste al
        // check de la columna en supabase/schema.sql).
        await store.logEvent(anonId, 'anon', anonId, eventName, metadata, null, 'quien-eres');
    } catch (err) {
        console.error('[qer-track-event]', err.message);
    }

    return json(200, { ok: true });
};
