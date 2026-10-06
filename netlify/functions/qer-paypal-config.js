// Expone el Client ID público de PayPal al navegador, para que app.js pueda
// cargar el SDK de PayPal sin tener ese id escrito a mano en index.html.
//
// Esto es seguro de exponer: un "Client ID" de PayPal es, por diseño, un dato
// público (literalmente va en la URL del SDK que cualquiera puede ver en el
// código fuente de cualquier sitio que use PayPal) — lo confidencial es el
// PAYPAL_CLIENT_SECRET, que nunca sale de netlify/functions/_lib/paypal.js.
//
// La ventaja de hacerlo así en vez de escribir el id directo en el HTML: hay
// un solo lugar (la variable de entorno PAYPAL_CLIENT_ID) que decide el id
// que usan TANTO el botón del navegador COMO las llamadas reales a la API de
// PayPal (paypal-create-order.js / paypal-capture-order.js) — así no puede
// pasar que uno quede desincronizado del otro (ej. cambiar a un id de
// Sandbox para probar y olvidar que el HTML seguía con el de Live).
const { READING_PRICE_USD } = require('./_lib/qer-pricing');

const json = (statusCode, obj) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    body: JSON.stringify(obj)
});

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const clientId = process.env.PAYPAL_CLIENT_ID;
    if (!clientId) return json(503, { error: 'PAYPAL_CLIENT_ID no está configurado en el servidor.' });

    // Se manda también el precio (igual que paypal-create-order.js lo lee de
    // _lib/pricing.js) para que el cliente muestre siempre la cifra real,
    // sin tener que mantenerla a mano y sincronizada en el HTML.
    // `classicBusiness`: correo de la cuenta que cobra, para el botón que abre la página de PayPal (acepta
    // tarjeta como invitado y avisa por IPN, ver qer-paypal-ipn.js). Si no está definido, ese botón no se muestra.
    const classicBusiness = String(process.env.PAYPAL_RECEIVER_EMAIL || '').trim() || undefined;
    return json(200, { clientId, priceUsd: READING_PRICE_USD, classicBusiness });
};
