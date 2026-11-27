// «¿Te está engañando tu pareja?»: una sola función con varias acciones.
//   preguntas  → textos de las preguntas (sin puntajes)
//   enviar     → guarda las respuestas y devuelve SOLO el gancho (sin cifra ni conclusión)
//   crear      → crea la orden de PayPal (el precio lo decide el servidor)
//   capturar   → cobra; si PayPal confirma el monto, marca pagado y devuelve el informe
//   ver        → devuelve el informe solo si esa sesión ya está pagada (para volver más tarde)
//   evento     → registro del embudo
const crypto = require('crypto');
const { json, sb, countryOf } = require('./_lib/rot-core');
const { createOrder, captureOrder } = require('./_lib/paypal');
const core = require('./_lib/vuelta-core');

const PRECIO = (() => { const n = Number(process.env.VUELTA_PRICE_USD || '4.99'); return Number.isFinite(n) && n >= 0.5 ? n.toFixed(2) : '4.99'; })();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|meta-external|facebot|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\//i;
const BUCKET = 'vuelta-comprobantes';
function tipoImagen(b) {   // «cualquier imagen»: solo se comprueba que sea una imagen de verdad, no que sea un comprobante real
    if (b.length < 200) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['image/jpeg', 'jpg'];
    if (b[0] === 0x89 && b.slice(1, 4).toString() === 'PNG') return ['image/png', 'png'];
    if (b.slice(0, 4).toString() === 'GIF8') return ['image/gif', 'gif'];
    if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return ['image/webp', 'webp'];
    if (b.slice(4, 8).toString() === 'ftyp') return ['image/heic', 'heic'];
    return null;
}
const SINPE_WIN = 60 * 60 * 1000, sinpeHits = new Map();
function sinpeLimit(ip) { const now = Date.now(), h = (sinpeHits.get(ip) || []).filter((t) => now - t < SINPE_WIN); h.push(now); sinpeHits.set(ip, h); return h.length > 12; }
const EVENTOS = new Set(['visita', 'inicio', 'pregunta', 'completo', 'gancho', 'pago_inicio', 'pago_ok', 'pago_cancelado', 'pago_error', 'sinpe_ok', 'sinpe_subir', 'sinpe_error', 'informe_visto', 'informe_scroll', 'salida']);

exports.handler = async (event) => {
    if (event.httpMethod === 'GET') {
        const clientId = process.env.PAYPAL_CLIENT_ID;
        if (!clientId) return json(503, { error: 'PayPal no está configurado.' });
        return json(200, { clientId, precio: PRECIO, pais: countryOf(event) || '', preguntas: core.publicBank() });
    }
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const pais = countryOf(event) || null;
    try {
        if (b.accion === 'evento') {
            if (!EVENTOS.has(b.evento)) return json(200, { ok: true });
            const ua = String((event.headers && (event.headers['user-agent'] || event.headers['User-Agent'])) || '');
            const bot = b.wd === true || !ua || BOT.test(ua);
            const fila = { sid: UUID.test(b.sid || '') ? b.sid : null, evento: b.evento, n: Number.isInteger(b.n) ? b.n : null, pais };
            const ext = { aid: /^[\w-]{8,40}$/.test(b.aid || '') ? b.aid : null, bot, yo: b.yo === true };
            const r = Number.isInteger(b.r) && b.r >= 0 && b.r < 20 ? b.r : null;   // opción elegida (0 = la primera)
            const post = (o) => sb('/rest/v1/vuelta_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(o) });
            // Si falta alguna columna nueva en la base, se guarda con lo que sí exista.
            try { await post(Object.assign({}, fila, ext, { r })); }
            catch (e1) {
                console.error('[vuelta] evento completo falló:', e1.message);
                try { await post(Object.assign({}, fila, ext)); } catch (e2) { await post(fila); }
            }
            return json(200, { ok: true });
        }

        if (b.accion === 'enviar') {
            const resp = core.normalizar(b.respuestas);
            if (!resp) return json(400, { error: 'Faltan respuestas.' });
            const rep = core.reporte(resp);
            const rows = await sb('/rest/v1/vuelta_sesiones', { method: 'POST', body: JSON.stringify({ respuestas: resp, pct: rep.pct, pais }) });
            return json(200, { id: rows[0].id, gancho: core.gancho(resp), precio: PRECIO });
        }

        const id = String(b.id || '');
        if (!UUID.test(id)) return json(400, { error: 'Solicitud inválida.' });
        const rows = await sb(`/rest/v1/vuelta_sesiones?id=eq.${id}&select=*`);
        const ses = rows && rows[0];
        if (!ses) return json(404, { error: 'Esa sesión ya no existe.' });

        if (b.accion === 'ver') {
            if (!ses.pagado) return json(402, { error: 'Aún no está desbloqueado.', gancho: core.gancho(ses.respuestas), precio: PRECIO });
            return json(200, { reporte: core.reporte(ses.respuestas) });
        }

        if (b.accion === 'sinpe') {
            if (ses.pagado) return json(200, { reporte: core.reporte(ses.respuestas) });
            const ipx = (event.headers && (event.headers['x-nf-client-connection-ip'] || '')) || 'x';
            if (sinpeLimit(ipx)) return json(429, { error: 'Demasiados intentos. Espera un rato.' });
            const raw = String(b.imagen || '');
            if (raw.length < 300 || raw.length > 4400000 || !/^[A-Za-z0-9+/=\s]+$/.test(raw)) return json(400, { error: 'Sube una imagen (captura o foto del comprobante).' });
            const buf = Buffer.from(raw, 'base64'), tp = tipoImagen(buf);
            if (!tp) return json(400, { error: 'Sube una imagen (captura o foto del comprobante).' });
            const ruta = `${id}.${tp[1]}`;
            let guardado = null;
            try {   // se guarda para que puedas revisarlo; si falla, igual se desbloquea
                const base = process.env.SUPABASE_URL.replace(/\/$/, ''), key = process.env.SUPABASE_SERVICE_KEY;
                const rr = await fetch(`${base}/storage/v1/object/${BUCKET}/${ruta}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': tp[0], 'x-upsert': 'true' }, body: buf });
                if (rr.ok) guardado = ruta; else console.error('[vuelta] comprobante no guardado', rr.status);
            } catch (e) { console.error('[vuelta] comprobante no guardado', e.message); }
            const ahora = new Date().toISOString();
            try { await sb(`/rest/v1/vuelta_sesiones?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ pagado: true, pagado_en: ahora, metodo: 'sinpe', comprobante: guardado }) }); }
            catch (e) { await sb(`/rest/v1/vuelta_sesiones?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ pagado: true, pagado_en: ahora }) }); }
            return json(200, { reporte: core.reporte(ses.respuestas) });
        }

        if (b.accion === 'crear') {
            if (ses.pagado) return json(200, { pagado: true });
            const orderID = await createOrder(PRECIO, id);
            await sb(`/rest/v1/vuelta_sesiones?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ order_id: orderID }) });
            return json(200, { orderID });
        }

        if (b.accion === 'capturar') {
            if (ses.pagado) return json(200, { reporte: core.reporte(ses.respuestas) });
            const orderID = String(b.orderID || '');
            // La orden debe ser la que el servidor creó para ESTA sesión.
            if (!orderID || orderID !== ses.order_id) return json(400, { error: 'Esa orden no corresponde a esta sesión.' });
            const order = await captureOrder(orderID);
            if (order.status !== 'COMPLETED') return json(402, { error: `El pago no se completó (estado: ${order.status}).` });
            const cap = order.purchase_units && order.purchase_units[0] && order.purchase_units[0].payments && order.purchase_units[0].payments.captures && order.purchase_units[0].payments.captures[0];
            if (!cap || cap.amount.currency_code !== 'USD' || Number(cap.amount.value) < Number(PRECIO) - 0.01) return json(402, { error: 'El monto pagado no corresponde.' });
            await sb(`/rest/v1/vuelta_sesiones?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ pagado: true, pagado_en: new Date().toISOString(), monto_usd: Number(cap.amount.value) }) });
            return json(200, { reporte: core.reporte(ses.respuestas) });
        }
        return json(400, { error: 'Acción no válida.' });
    } catch (e) {
        console.error('[vuelta]', b && b.accion, e.message);
        return json(502, { error: 'No se pudo completar. Intenta de nuevo en un momento. Si el cobro sí se hizo, escríbenos y lo resolvemos.' });
    }
};
