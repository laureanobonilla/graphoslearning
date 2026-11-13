// «Rótulo»: planes con precio (US$ y equivalente en colones para Costa Rica) y el Client ID público de PayPal.
const { json, countryOf, priceView } = require('./_lib/rot-core');
exports.handler = async (event) => json(200, { planes: priceView(countryOf(event)), paypalClientId: process.env.PAYPAL_CLIENT_ID || null });
