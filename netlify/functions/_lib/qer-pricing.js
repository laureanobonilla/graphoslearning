// Precio de la lectura completa (un solo producto). Se cambia desde Netlify sin tocar código con la variable de
// entorno QER_PRICE_USD (o la antigua READING_PRICE_USD); si no hay ninguna, US$9.99 — el mismo precio que
// anunciaba el cliente antes de que el servidor verificara el pago. El cliente lee este valor de
// /.netlify/functions/qer-paypal-config, así que servidor y pantalla nunca se desincronizan.
const raw = String(process.env.QER_PRICE_USD || process.env.READING_PRICE_USD || '9.99').trim();
const n = Number(raw);
const READING_PRICE_USD = Number.isFinite(n) && n >= 0.5 ? n.toFixed(2) : '9.99';

module.exports = { READING_PRICE_USD };
