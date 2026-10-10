// «tu-cancion»: país de la visita y precio que debe ver. El precio sale de _lib/tc-core.js (PRICES).
const { json, countryOf, priceFor } = require('./_lib/tc-core');
exports.handler = async (event) => {
    let country = countryOf(event);
    const o = event.queryStringParameters && event.queryStringParameters.pais;
    if (o && /^[A-Za-z]{2}$/.test(o)) country = o.toUpperCase();
    return json(200, { country: country || null, price: priceFor(country) });
};
