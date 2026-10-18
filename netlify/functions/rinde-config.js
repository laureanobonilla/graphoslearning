// Rinde: Client ID público de PayPal y los planes (precios los decide _lib/rinde-core.js).
const core = require('./_lib/rinde-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const plans = Object.entries(core.PLANS).map(([id, p]) => ({ id, label: p.label, months: p.months, usd: p.usd, note: p.note }));
    return core.json(200, { clientId: process.env.PAYPAL_CLIENT_ID || null, plans, country: core.countryOf(event) || null });
};
