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
const EVENTOS = new Set(['visita', 'inicio', 'pregunta', 'completo', 'gancho', 'pago_inicio', 'pago_ok', 'pago_cancelado', 'pago_error', 'salida']);

exports.handler = async (event) => {
    if (event.httpMethod === 'GET') {
        const clientId = process.env.PAYPAL_CLIENT_ID;
        if (!clientId) return json(503, { error: 'PayPal no está configurado.' });
        return json(200, { clientId, precio: PRECIO, preguntas: core.publicBank() });
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
            const post = (o) => sb('/rest/v1/vuelta_eventos', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(o) });
            // Si aún no se corrió el SQL con las columnas nuevas, se guarda igual sin ellas.
            try { await post(Object.assign({}, fila, ext)); } catch (e) { console.error('[vuelta] evento con columnas nuevas falló:', e.message); await post(fila); }
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
