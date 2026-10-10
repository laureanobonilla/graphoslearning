// Devuelve el país de la visita (código de 2 letras) según la cabecera x-nf-geo de Netlify.
// Lo usa la pantalla de pago de las apps "¿Quién eres?" para decidir entre SINPE (Costa Rica) y PayPal.
// Si no hay dato, devuelve country: null y el cliente intenta adivinar por la zona horaria.
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
exports.handler = async (event) => {
    let code = null;
    try {
        const h = event.headers || {};
        const raw = h['x-nf-geo'] || h['X-Nf-Geo'];
        code = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))?.country?.code : (h['x-country'] || h['X-Country']);
    } catch (_e) { /* extra: nunca debe romper */ }
    return json(200, { country: code && /^[A-Za-z]{2}$/.test(String(code)) ? String(code).toUpperCase() : null });
};
