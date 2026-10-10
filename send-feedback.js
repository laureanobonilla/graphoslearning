// Manda un correo REAL, de una vez, desde el servidor — a diferencia del
// enlace de WhatsApp o del mailto: de la Tienda (que abren el cliente de LA
// PERSONA que usa la app y dependen de que ella le dé "enviar"), esto llama
// a la API de Resend y entrega el correo sin que nadie tenga que hacer nada
// más. Se usa desde dos lugares del frontend (ver app.js):
//   - El modal de "Sugerencias / Comentarios" (botón 💬 del encabezado).
//   - El formulario "o te escribimos nosotros" dentro de la Tienda (antes
//     era un enlace mailto:, ver storeModal en index.html).
//
// Requiere la variable de entorno RESEND_API_KEY (cuenta gratis en
// resend.com — ver LEEME_ETAPA_2.md). Mientras no se verifique un dominio
// propio en Resend, el remitente de prueba (onboarding@resend.dev) SOLO
// puede entregar al correo con el que te registraste ahí — por eso
// FEEDBACK_TO_EMAIL debe ser esa misma dirección (si no se define, se usa
// el correo de soporte de abajo como respaldo).
const { getUser } = require('./_lib/auth');
const { getOrCreateGuestId, buildSetCookie } = require('./_lib/guest');
const store = require('./_lib/store');

const json = (statusCode, obj, extraHeaders) => ({
    statusCode, headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) }, body: JSON.stringify(obj)
});

const MAX_MESSAGE_LENGTH = 4000;
const MAX_EMAIL_LENGTH = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KIND_LABELS = {
    feedback: 'Sugerencia / comentario',
    recharge_request: 'Quiere seguir usando la app (sin saldo)'
};
// Tope sencillo: no más de 5 correos por actor (usuario o invitado) en una
// hora — evita que alguien dispare el formulario en bucle y sature el
// correo de destino o la cuenta de Resend. No usa withBilling (esto no
// cuesta nodos ni es una acción de IA), así que se chequea a mano.
const MAX_FEEDBACK_PER_HOUR = 5;
const FALLBACK_TO_EMAIL = 'bonillapretiz@gmail.com';

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.error('[send-feedback] Falta la variable de entorno RESEND_API_KEY');
        return json(503, { error: 'feedback_unavailable' });
    }

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const kind = KIND_LABELS[body.kind] ? body.kind : 'feedback';
    const message = String(body.message || '').trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message) return json(400, { error: 'El mensaje está vacío' });

    const replyEmail = String(body.email || '').trim().slice(0, MAX_EMAIL_LENGTH);
    if (replyEmail && !EMAIL_RE.test(replyEmail)) return json(400, { error: 'Ese correo no parece válido' });

    const user = getUser(context);
    const cookieHeaders = {};
    let actorId, actorKind, actorLabel;
    if (user) {
        actorId = user.id;
        actorKind = 'user';
        actorLabel = user.email || user.id;
    } else {
        const { guestId, isNew } = getOrCreateGuestId(event);
        actorId = `guest:${guestId}`;
        actorKind = 'guest';
        actorLabel = replyEmail || `guest:${guestId}`;
        if (isNew) cookieHeaders['Set-Cookie'] = buildSetCookie(guestId);
    }

    try {
        const recent = await store.countEventsLastHour(actorId, 'feedback_sent');
        if (recent >= MAX_FEEDBACK_PER_HOUR) return json(429, { error: 'rate_limited' }, cookieHeaders);
    } catch (err) {
        // Si el chequeo mismo falla (p. ej. Supabase lento), no bloqueamos el
        // envío por eso — el límite es una protección extra, no la función
        // principal de este endpoint.
        console.error('[send-feedback] no se pudo chequear el límite:', err.message);
    }

    const toEmail = process.env.FEEDBACK_TO_EMAIL || FALLBACK_TO_EMAIL;
    const subject = `Graphikosmos — ${KIND_LABELS[kind]}`;
    const textBody = [
        `Tipo: ${KIND_LABELS[kind]}`,
        `De: ${actorLabel}${replyEmail && replyEmail !== actorLabel ? ` (responder a: ${replyEmail})` : ''}`,
        '',
        message
    ].join('\n');

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'Graphikosmos <onboarding@resend.dev>',
                to: [toEmail],
                reply_to: replyEmail || undefined,
                subject,
                text: textBody
            })
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error('[send-feedback] Resend respondió con error:', res.status, errText);
            return json(502, { error: 'No se pudo enviar el correo.' }, cookieHeaders);
        }
    } catch (err) {
        console.error('[send-feedback]', err.message);
        return json(502, { error: 'No se pudo enviar el correo.' }, cookieHeaders);
    }

    // Disparar y olvidar, igual que track-event.js: si esto falla no debe
    // romper la respuesta — el correo ya salió, que es lo que importa. Las
    // cuentas admin (ver ADMIN_EMAILS en _lib/auth.js) no quedan en la tabla
    // `events` — son pruebas propias, no clientes reales — pero el correo sí
    // se manda igual, por si el dueño está probando el formulario de verdad.
    if (!user?.isAdmin) {
        try { await store.logEvent(actorId, actorKind, null, 'feedback_sent', { kind }, actorLabel); } catch (err) {
            console.error('[send-feedback] no se pudo registrar el evento:', err.message);
        }
    }

    return json(200, { ok: true }, cookieHeaders);
};
