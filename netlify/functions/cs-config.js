// Precios y reglas de las 3 apps de canciones (fuente única: _lib/cs-core.js).
const { json, publicConfig } = require('./_lib/cs-core');
exports.handler = async (event) => {
    const c = publicConfig(String((event.queryStringParameters || {}).app || ''));
    return c ? json(200, c) : json(400, { error: 'App no válida' });
};
