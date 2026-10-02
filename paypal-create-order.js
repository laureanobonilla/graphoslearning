// Crea una orden de PayPal para un paquete de nodos. El precio NUNCA viene del
// cliente: se mira en el catálogo del servidor (_lib/packages.js) a partir de
// un simple "packageId". Así, aunque alguien manipule el HTML de la tienda o
// intercepte la llamada, no puede pedir que se cree una orden por menos de lo
// que el paquete realmente cuesta.
const { getUser } = require('./_lib/auth');
const { PACKAGES } = require('./_lib/packages');
const { createOrder } = require('./_lib/paypal');
const store = require('./_lib/store');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    // Los invitados no pueden comprar sin cuenta: si perdieran la cookie de
    // invitado no habría a quién acreditarle los nodos después. El cliente debe
    // mostrar el muro de login antes de llegar aquí; esto es la confirmación
    // del servidor, que es la que realmente importa.
    const user = getUser(context);
    if (!user) return json(401, { error: 'auth_required' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

    const pkg = PACKAGES[String(body.packageId)];
    if (!pkg) return json(400, { error: 'Paquete no válido' });

    try {
        const orderID = await createOrder(pkg.usd);
        // Se registra aquí (servidor) y no solo en el navegador, para que el
        // evento quede aunque el usuario cierre la pestaña justo después de
        // que PayPal le muestre su propio formulario de pago.
        store.logEvent(user.id, 'user', null, 'payment_order_created', { packageId: String(body.packageId), usd: pkg.usd }).catch(() => {});
        return json(200, { orderID });
    } catch (err) {
        console.error('[paypal-create-order]', err.message);
        store.logEvent(user.id, 'user', null, 'payment_order_create_failed', { packageId: String(body.packageId) }).catch(() => {});
        return json(502, { error: 'No se pudo crear la orden de pago. Intenta de nuevo en un momento.' });
    }
};
