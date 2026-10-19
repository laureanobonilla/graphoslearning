// Rinde: Client ID público de PayPal y los planes con el precio del tamaño de empresa que pide el navegador (?nivel=).
// Es solo para mostrar: al pagar, rinde-pay-create vuelve a decidir el precio con las empresas guardadas en la cuenta.
const core = require('./_lib/rinde-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const qs = event.queryStringParameters || {}, nivel = core.nivelOk(qs.nivel);
    const plans = core.planesPara(qs.k, nivel).map(([id, p]) => ({ id, label: p.label, months: p.months, days: p.days || 0, usd: p.usd, note: p.note, hidden: !!p.hidden }));
    return core.json(200, { clientId: process.env.PAYPAL_CLIENT_ID || null, nivel, plans, country: core.countryOf(event) || null });
};
