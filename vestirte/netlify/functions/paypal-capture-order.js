// Confirma con PayPal (en el servidor, no en lo que diga el navegador) que una
// orden se pagó de verdad, y solo entonces acredita los nodos en Supabase.
// Antes de este archivo, el botón de PayPal en app.js sumaba los nodos
// directamente en localStorage del navegador en cuanto el SDK de PayPal decía
// "aprobado" — sin que el servidor verificara nada. Cualquiera podía abrir las
// herramientas de desarrollador y llamar esa misma función de JS para
// regalarse nodos sin pagar. Ahora el saldo real (Supabase) solo cambia aquí.
const { getUser } = require('./_lib/auth');
const { PACKAGES } = require('./_lib/packages');
const { captureOrder } = require('./_lib/paypal');
const store = require('./_lib/store');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const user = getUser(context);
    if (!user) return json(401, { error: 'auth_required' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const { orderID } = body;
    const pkg = PACKAGES[String(body.packageId)];
    if (!orderID || !pkg) return json(400, { error: 'Solicitud inválida' });

    try {
        const order = await captureOrder(orderID);

        if (order.status !== 'COMPLETED') {
            store.logEvent(user.id, 'user', null, 'payment_failed', { orderID, reason: 'not_completed', status: order.status }).catch(() => {});
            return json(402, { error: `El pago no se completó (estado: ${order.status}).` });
        }

        // Verificamos el monto REALMENTE cobrado contra el precio del paquete que
        // el servidor fijó al crear la orden (ver paypal-create-order.js) — nunca
        // contra el packageId que mande este mismo request, que sí podría estar
        // manipulado. Esto cierra la posibilidad de pagar por el paquete barato y
        // luego pedir acá que se acredite el paquete caro.
        const captured = order.purchase_units?.[0]?.payments?.captures?.[0];
        const paidAmount = captured?.amount?.value;
        const paidCurrency = captured?.amount?.currency_code;
        if (paidCurrency !== 'USD' || Number(paidAmount) < Number(pkg.usd) - 0.01) {
            console.error('[paypal-capture-order] monto no coincide', { orderID, paidAmount, paidCurrency, expectedPackage: body.packageId, expectedUsd: pkg.usd });
            store.logEvent(user.id, 'user', null, 'payment_failed', { orderID, reason: 'amount_mismatch' }).catch(() => {});
            return json(402, { error: 'El monto pagado no corresponde al paquete solicitado.' });
        }

        // Idempotente de verdad en la base: payments.order_id es primary key, así
        // que si esta función se llama dos veces para la misma orden (ej. el
        // usuario cierra la pestaña justo después de pagar y PayPal reintenta el
        // webhook, o el navegador reintenta la llamada), solo se acredita una vez.
        const balance = await store.creditNodes(user.id, pkg.nodes, orderID, paidAmount);
        store.logEvent(user.id, 'user', null, 'payment_success', { orderID, packageId: String(body.packageId), usd: paidAmount, nodesAdded: pkg.nodes }).catch(() => {});
        return json(200, { success: true, balance, nodesAdded: pkg.nodes });
    } catch (err) {
        console.error('[paypal-capture-order]', err.message);
        store.logEvent(user.id, 'user', null, 'payment_failed', { orderID, reason: 'exception', message: String(err.message || '').slice(0, 160) }).catch(() => {});
        return json(502, { error: 'No se pudo confirmar el pago con PayPal. Si el cargo sí se hizo, escríbenos y te acreditamos los nodos a mano.' });
    }
};
