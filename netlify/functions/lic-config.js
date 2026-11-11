// «Licitaciones»: precio que debe ver quien visita (en su moneda) y el Client ID público de PayPal.
const { json, countryOf, chargeFor, PRICE_USD, MAX_PDF } = require('./_lib/lic-core');
exports.handler = async (event) => {
    let country = countryOf(event);
    const o = event.queryStringParameters && event.queryStringParameters.pais;
    if (o && /^[A-Za-z]{2}$/.test(o)) country = o.toUpperCase();
    return json(200, { country: country || null, usd: PRICE_USD, charge: chargeFor(country), paypalClientId: process.env.PAYPAL_CLIENT_ID || null, maxMb: Math.floor(MAX_PDF / 1048576) });
};
