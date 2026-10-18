// Destila: PayPal Client ID público, precios por lote y límites.
const core = require('./_lib/dst-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    return core.json(200, { clientId: process.env.PAYPAL_CLIENT_ID || null, ready: !!process.env.GEMINI_API_KEY, tiers: core.TIERS, maxAudios: core.MAX_AUDIOS, maxMb: core.MAX_BYTES / 1048576, maxMin: core.MAX_MIN });
};
