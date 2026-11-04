// SuperLiveChat: datos públicos que el navegador necesita para iniciar sesión (URL de Supabase y clave "anon", que es pública por diseño).
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const url = process.env.SUPABASE_URL || '', anonKey = process.env.SUPABASE_ANON_KEY || '';
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ url, anonKey, ok: !!(url && anonKey), paypalClientId: process.env.PAYPAL_CLIENT_ID || null }) };
};
