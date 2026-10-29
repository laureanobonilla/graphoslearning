// Datos públicos para /quien-eres/: precio y número de WhatsApp (solo dígitos, con código de país) para pedir el enlace de pago.
const { READING_PRICE } = require('./_lib/ses-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const whatsapp = String(process.env.SES_WHATSAPP || '').replace(/\D/g, '');
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }, body: JSON.stringify({ priceUsd: READING_PRICE, whatsapp }) };
};
