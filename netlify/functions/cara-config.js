// «¿De qué tienes cara?»: Client ID público de PayPal (el mismo de las otras apps) y precio.
const core = require('./_lib/cara-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    return core.json(200, { clientId: process.env.PAYPAL_CLIENT_ID || null, priceUsd: core.PRICE_USD });
};
