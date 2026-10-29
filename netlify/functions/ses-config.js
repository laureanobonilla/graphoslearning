// Client ID público de PayPal y precio del retrato para /quien-eres/sesion/ (el precio vive solo en el servidor).
const { READING_PRICE } = require('./_lib/ses-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const clientId = process.env.PAYPAL_CLIENT_ID;
    if (!clientId) return { statusCode: 503, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'PAYPAL_CLIENT_ID no está configurado.' }) };
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, body: JSON.stringify({ clientId, priceUsd: READING_PRICE }) };
};
