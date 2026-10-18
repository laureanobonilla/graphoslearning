// Destila: PayPal Client ID público, precios por lote y límites.
const core = require('./_lib/dst-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const anonId = String((event.queryStringParameters || {}).anon || '').slice(0, 64);
    let trial = false;
    if (core.TRIAL_MAX > 0) { try { trial = !(await core.trialUsed(anonId || null, core.hashIp(core.ipOf(event)))); } catch (e) { console.error('[dst-config] prueba', e.message); } }
    return core.json(200, { trial, trialMax: core.TRIAL_MAX, clientId: process.env.PAYPAL_CLIENT_ID || null, ready: !!process.env.GEMINI_API_KEY, tiers: core.TIERS, maxAudios: core.MAX_AUDIOS, maxMb: core.MAX_BYTES / 1048576, maxMin: core.MAX_MIN });
};
