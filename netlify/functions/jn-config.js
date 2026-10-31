// «jingle-negocio»: precios que ve la persona (salen de _lib/jn-core.js).
const { publicConfig, json } = require('./_lib/jn-core');
exports.handler = async () => json(200, publicConfig());
