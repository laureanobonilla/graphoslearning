// «Rótulo»: mensajes al dueño por correo. Dos usos:
//  · la persona escribe (ayuda, idea, no pudo pagar) → tipo 'ayuda' | 'idea' | 'pago'
//  · aviso automático y silencioso cuando un pago falla → tipo 'auto' (así se entera aunque la persona no escriba nada)
// Llega a FEEDBACK_TO_EMAIL (por defecto bonillapretiz@gmail.com). Con "responder" se contesta directo a la persona.
const { json, ipOf, countryOf, userOf, hashIp, today, contar } = require('./_lib/rot-core');
const { send, OWNER, FROM_OWNER, esc, isEmail } = require('./_lib/qer-email');
const TIPOS = { ayuda: 'Pregunta o problema', idea: 'Sugerencia', pago: 'No pudo pagar', auto: 'Pago fallido (aviso automático)' };
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const tipo = TIPOS[b.tipo] ? b.tipo : 'ayuda', u = userOf(context), ip = ipOf(event);
    const mensaje = String(b.mensaje || '').trim().slice(0, 3000);
    if (tipo !== 'auto' && mensaje.length < 3) return json(400, { error: 'Escribe tu mensaje.' });
    const email = isEmail(b.email) ? String(b.email).trim() : (u ? u.email : '');
    if (tipo !== 'auto' && !email) return json(400, { error: 'Escribe tu correo para poder responderte.' });
    // tope diario por persona (cuenta o conexión); si el contador no responde, no se bloquea a nadie
    try { const n = await contar(`ct:${tipo === 'auto' ? 'a' : 'm'}:${u ? u.id : hashIp(ip)}:${today()}`, tipo === 'auto' ? 6 : 8); if (n < 0) return json(429, { error: 'Ya recibimos varios mensajes tuyos hoy. Te respondemos pronto.' }); } catch (e) { /* sigue */ }
    const c = b.ctx && typeof b.ctx === 'object' ? b.ctx : {};
    const filas = [['Tipo', TIPOS[tipo]], ['Cuenta', u ? u.email : 'sin cuenta'], ['Correo para responder', email || '—'], ['País', countryOf(event) || '—'], ['Plan', clip(c.plan, 40) || '—'], ['Paso', clip(c.paso, 60) || '—'], ['Error', clip(c.error, 300) || '—'], ['Dispositivo', clip(c.ua, 160) || '—']];
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">${mensaje ? `<p style="font-size:16px;white-space:pre-wrap">${esc(mensaje)}</p><hr>` : ''}<table style="font-size:14px;border-collapse:collapse">${filas.map((f) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${f[0]}</td><td>${esc(f[1])}</td></tr>`).join('')}</table></div>`;
    const text = (mensaje ? mensaje + '\n\n' : '') + filas.map((f) => `${f[0]}: ${f[1]}`).join('\n');
    const r = await send({ from: FROM_OWNER(), to: OWNER(), subject: `${tipo === 'auto' ? '⚠️' : '✉️'} Rótulo: ${TIPOS[tipo]}${u ? ' · ' + u.email : ''}`, html, text, replyTo: email || undefined });
    if (!r.ok) { console.error('[rot-contacto] no se pudo enviar', r.reason, '|', tipo, email, mensaje.slice(0, 500)); return json(502, { error: 'No se pudo enviar el mensaje. Inténtalo de nuevo en un rato.' }); }
    return json(200, { ok: true });
};
