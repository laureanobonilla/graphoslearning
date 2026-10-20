// La Pulpe: Client ID público de PayPal y el pase (el precio lo decide _lib/pulpe-core.js).
const core = require('./_lib/pulpe-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const plans = core.planesPara((event.queryStringParameters || {}).k).map(([id, p]) => ({ id, label: p.label, usd: p.usd, note: p.note, hidden: !!p.hidden }));
    return core.json(200, { clientId: process.env.PAYPAL_CLIENT_ID || null, plans, freeDays: core.FREE_DAYS, country: core.countryOf(event) || null });
};
