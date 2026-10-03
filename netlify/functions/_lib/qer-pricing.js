// Precio de la lectura completa. Un solo producto (no un catálogo de
// paquetes como en la otra app) — se puede ajustar desde Netlify sin tocar
// código (variable de entorno READING_PRICE_USD), pero si no está puesta
// usa este valor por default. $2.99 es un precio de impulso a propósito:
// la idea es que decidir pagar sea una decisión pequeña, no una compra que
// alguien se detenga a pensar.
const READING_PRICE_USD = process.env.READING_PRICE_USD || '2.99';

module.exports = { READING_PRICE_USD };
