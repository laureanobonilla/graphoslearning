// Precios y reglas de las 3 apps de canciones (fuente única: _lib/cs-core.js).
const { json, publicConfig, currencyInfo, countryOf } = require('./_lib/cs-core');
exports.handler = async (event) => {
    const q = event.queryStringParameters || {};
    const c = publicConfig(String(q.app || ''));
    if (!c) return json(400, { error: 'App no válida' });
    let country = countryOf(event); if (q.pais && /^[A-Za-z]{2}$/.test(q.pais)) country = q.pais.toUpperCase();   // ?pais=MX para probar
    return json(200, { ...c, cur: currencyInfo(country) });
};
