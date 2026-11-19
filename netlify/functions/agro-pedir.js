// «Agro»: mensajes al dueño por correo: pedir la prueba de 1 día, avisar que ya pagó (SINPE) o hacer una pregunta.
const { json, ipOf, hashIp, today, contar, txt, SINPE } = require('./_lib/agro-core');
const { send, OWNER, FROM_OWNER, esc, isEmail } = require('./_lib/qer-email');
const TIPOS = { prueba: 'Pide prueba de 1 día', pago: 'Dice que ya pagó / quiere pagar', ayuda: 'Pregunta o problema' };
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const tipo = TIPOS[b.tipo] ? b.tipo : 'ayuda', ip = ipOf(event);
    const nombre = txt(b.nombre, 80), contacto = txt(b.contacto, 120), mensaje = String(b.mensaje || '').trim().slice(0, 2000);
    if (!nombre) return json(400, { error: 'Escriba su nombre.' });
    if (contacto.replace(/\D/g, '').length < 7 && !isEmail(contacto)) return json(400, { error: 'Escriba su número de WhatsApp o su correo para poder responderle.' });
    try { const n = await contar(`ag:ct:${tipo}:${hashIp(ip)}:${today()}`, 6); if (n < 0) return json(429, { error: 'Ya recibí varios mensajes suyos hoy. Le respondo pronto.' }); } catch (e) { /* si el contador no responde no se bloquea a nadie */ }
    const filas = [['Tipo', TIPOS[tipo]], ['Nombre', nombre], ['WhatsApp o correo', contacto], ['Su código', txt(b.codigo, 20) || '—'], ['Paquete', txt(b.paquete, 80) || '—'], ['Comprobante SINPE', txt(b.comprobante, 60) || '—'], ['Dispositivo', txt(b.ua, 160) || '—']];
    const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">${mensaje ? `<p style="font-size:16px;white-space:pre-wrap">${esc(mensaje)}</p><hr>` : ''}<table style="font-size:14px;border-collapse:collapse">${filas.map((f) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${f[0]}</td><td>${esc(f[1])}</td></tr>`).join('')}</table><p style="color:#666;font-size:13px">Para darle o recargarle créditos: /agro/admin.html</p></div>`;
    const text = (mensaje ? mensaje + '\n\n' : '') + filas.map((f) => `${f[0]}: ${f[1]}`).join('\n');
    const r = await send({ from: FROM_OWNER(), to: OWNER(), subject: `🌱 Agro: ${TIPOS[tipo]} · ${nombre}`, html, text, replyTo: isEmail(contacto) ? contacto : undefined });
    if (!r.ok) { console.error('[agro-pedir] no se pudo enviar', r.reason, '|', tipo, nombre, contacto, mensaje.slice(0, 300)); return json(502, { error: 'No se pudo enviar el mensaje. Intente de nuevo en un rato.' }); }
    return json(200, { ok: true });
};
