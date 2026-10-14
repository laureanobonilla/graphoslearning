// tu-audio: PayPal Client ID público, herramientas disponibles con su precio y los límites.
const core = require('./_lib/aud-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const clientId = process.env.PAYPAL_CLIENT_ID;
    if (!clientId) return core.json(503, { error: 'PayPal aún no está configurado.' });
    return core.json(200, { clientId, tools: core.availableTools(), previewSec: core.PREVIEW_SEC, maxMin: core.MAX_MIN, minSec: core.MIN_SEC, maxMb: Math.round(core.MAX_BYTES / 1048576) });
};
