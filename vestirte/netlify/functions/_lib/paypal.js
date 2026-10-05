// Acceso a la API REST de PayPal (Orders v2) — solo desde el servidor.
// Usa credenciales "confidenciales" (Client ID + Secret) que NUNCA deben
// llegar al navegador: son distintas del Client ID público que ya usa el
// botón de PayPal en index.html (ese solo sirve para pintar el botón, no
// para cobrar nada por su cuenta).
//
// Variables de entorno necesarias en Netlify:
//   PAYPAL_CLIENT_ID      — igual que el "client-id" del <script> de index.html
//   PAYPAL_CLIENT_SECRET  — el secreto de esa misma app, de "Live" (o "Sandbox"
//                           mientras se prueba), del dashboard de PayPal Developer
//   PAYPAL_ENV            — "sandbox" mientras se prueba; cualquier otro valor
//                           (o ausente) usa el entorno real ("live")
const PAYPAL_API_BASE = (process.env.PAYPAL_ENV === 'sandbox')
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

async function getAccessToken() {
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!id || !secret) throw new Error('Faltan PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET en las variables de entorno.');

    const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    const data = await res.json();
    if (!res.ok) throw new Error('No se pudo autenticar con PayPal: ' + (data.error_description || res.status));
    return data.access_token;
}

// Crea la orden con el monto que decidió EL SERVIDOR (ver packages.js), nunca
// con un monto que mande el cliente.
async function createOrder(usdAmount) {
    const token = await getAccessToken();
    const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [{ amount: { currency_code: 'USD', value: usdAmount } }]
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error('PayPal rechazó la creación de la orden: ' + (data.message || res.status));
    return data.id; // orderID
}

async function getOrder(orderId, tokenIn) {
    const token = tokenIn || (await getAccessToken());
    const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error('No se pudo leer la orden de PayPal: ' + (data.message || res.status));
    return data;
}

// Captura (cobra de verdad) la orden ya aprobada por el pagador. Si el cliente
// llega a llamar esto dos veces para la misma orden (ej. por una reconexión),
// PayPal responde con el error "ORDER_ALREADY_CAPTURED" en vez de cobrar de
// nuevo — en ese caso simplemente se lee la orden ya capturada, sin fallar.
async function captureOrder(orderId) {
    const token = await getAccessToken();
    const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (!res.ok) {
        const issue = data?.details?.[0]?.issue;
        if (issue === 'ORDER_ALREADY_CAPTURED') return await getOrder(orderId, token);
        throw new Error('PayPal rechazó la captura del pago: ' + (data.message || issue || res.status));
    }
    return data;
}

module.exports = { createOrder, captureOrder, getOrder };
