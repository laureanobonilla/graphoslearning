// Aportes voluntarios de las páginas de canciones (/una-mano/, /me-levanto/).
// El monto lo elige la persona; el servidor solo lo valida (mínimo y máximo).
const store = require('./store');

const APPS = ['una-mano', 'me-levanto', 'mi-musica'];
// Moneda de cada página (la decide el servidor, nunca el navegador)
const CURRENCY = { 'una-mano': 'USD', 'me-levanto': 'EUR', 'mi-musica': 'USD' };
const MIN_USD = 1;
const MAX_USD = 500;

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

function cleanApp(app) { return APPS.includes(app) ? app : null; }
function currencyOf(app) { return CURRENCY[app] || 'USD'; }
function cleanAnon(a) { return (typeof a === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(a)) ? a : null; }
function cleanAmount(v) {
    const n = Math.round(Number(v) * 100) / 100;
    if (!isFinite(n) || n < MIN_USD || n > MAX_USD) return null;
    return n.toFixed(2);
}
function countryOf(event) {
    try {
        const h = event.headers || {};
        const raw = h['x-nf-geo'] || h['X-Nf-Geo'];
        const code = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))?.country?.code : (h['x-country'] || h['X-Country']);
        return (code && /^[A-Za-z]{2}$/.test(String(code))) ? String(code).toUpperCase() : null;
    } catch (_e) { return null; }
}
// Registrar nunca debe romper el pago.
async function log(app, anon, name, metadata) {
    try { await store.logEvent(anon, 'anon', anon, name, metadata || {}, null, app); }
    catch (err) { console.error('[apoyo log]', err.message); }
}

module.exports = { APPS, CURRENCY, MIN_USD, MAX_USD, json, cleanApp, currencyOf, cleanAnon, cleanAmount, countryOf, log };
