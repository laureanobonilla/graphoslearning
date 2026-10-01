// Registro de eventos de uso: primera visita, qué hace el usuario, dónde se
// atasca, intentos de pago fallidos/exitosos, etc. — para poder ver el embudo
// completo después con una consulta SQL en Supabase (ver supabase/schema.sql,
// tabla `events`, y los ejemplos de consultas en LEEME_ETAPA_2.md).
//
// Principios de este archivo:
//   1. Nunca debe poder romper ni frenar la experiencia del usuario: si
//      Supabase falla, esto responde 200 igual (el navegador dispara el
//      evento y sigue sin esperar ni reintentar).
//   2. No es una función de facturación: no pasa por withBilling, no cuesta
//      nodos, no tiene límite de uso — es deliberadamente liviana. Si en el
//      futuro se abusa de ella (spam de eventos), se le puede agregar un
//      límite por IP/guestId igual al de las demás funciones.
//   3. Guarda lo mínimo necesario: nombre del evento + metadata corta. Nunca
//      el texto completo que el usuario pegó o escribió (privacidad) — solo
//      datos de forma (longitud, tipo, si fue éxito o error).
const { getUser } = require('./_lib/auth');
const { getOrCreateGuestId, buildSetCookie } = require('./_lib/guest');
const store = require('./_lib/store');

const json = (statusCode, obj, extraHeaders) => ({
    statusCode, headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) }, body: JSON.stringify(obj)
});

// Nombres de evento razonables: minúsculas, números, "_" y ":" — nada de
// texto libre ni de tamaño arbitrario, para que la tabla no acabe con un
// nombre de evento distinto por cada typo del cliente.
const EVENT_NAME_RE = /^[a-z0-9_:]{1,60}$/;
const MAX_METADATA_JSON_LENGTH = 2000;

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const eventName = String(body.event || '');
    if (!EVENT_NAME_RE.test(eventName)) return json(400, { error: 'Nombre de evento no válido' });

    // anonId: identifica el NAVEGADOR (no a la persona) para poder seguir el
    // hilo de "qué hizo antes de tener cuenta" aunque pase de invitado a
    // usuario logueado a mitad de sesión. Lo genera y guarda el cliente
    // (localStorage), no es sensible — no es una cookie de sesión.
    const anonId = typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : null;

    let metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    if (JSON.stringify(metadata).length > MAX_METADATA_JSON_LENGTH) metadata = { truncated: true };

    const user = getUser(context);
    const cookieHeaders = {};
    let actorId, actorKind;

    if (user) {
        actorId = user.id;
        actorKind = 'user';
    } else {
        const { guestId, isNew } = getOrCreateGuestId(event);
        actorId = `guest:${guestId}`;
        actorKind = 'guest';
        if (isNew) cookieHeaders['Set-Cookie'] = buildSetCookie(guestId);
    }

    try {
        await store.logEvent(actorId, actorKind, anonId, eventName, metadata);
    } catch (err) {
        // No dejamos que un problema de base de datos se note en la app: solo
        // se registra en los logs del servidor para poder revisarlo luego.
        console.error('[track-event]', err.message);
    }

    return json(200, { ok: true }, cookieHeaders);
};
