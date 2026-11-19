// «Agro»: precios y datos de pago para mostrar en la página (los fija el servidor, en _lib/agro-core.js).
const { json, TRIAL, PACKS, SINPE, WHATSAPP } = require('./_lib/agro-core');
exports.handler = async () => json(200, { trial: TRIAL, packs: PACKS, sinpe: SINPE(), whatsapp: WHATSAPP() });
