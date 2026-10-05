// Precio de la lectura completa. Un solo producto (no un catálogo de
// paquetes como en la otra app) — se puede ajustar desde Netlify sin tocar
// código (variable de entorno READING_PRICE_USD), pero si no está puesta
// usa este valor por default. $9.99 desde el 2026-10-04 (antes $2.99, un precio de impulso, que no convirtió):
// la idea es que decidir pagar sea una decisión pequeña, no una compra que
// alguien se detenga a pensar.
const READING_PRICE_USD = process.env.READING_PRICE_USD || '9.99';

module.exports = { READING_PRICE_USD };
