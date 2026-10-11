// Catálogo único de paquetes de pago. Esta es la ÚNICA fuente de verdad sobre
// cuánto cuesta cada paquete y cuántos nodos acredita — el HTML de la tienda
// (index.html) tiene los mismos números para que el usuario los vea antes de
// pagar, pero lo que de verdad se cobra y se acredita se decide siempre aquí,
// en el servidor. Si alguien edita el HTML desde la consola del navegador para
// pedir, por ejemplo, 600 nodos al precio de 50, el servidor simplemente no
// conoce ese paquete con ese precio y rechaza la orden.
const PACKAGES = {
    '50': { nodes: 50, usd: '7.99' },
    '120': { nodes: 120, usd: '14.99' },
    '600': { nodes: 600, usd: '59.99' }
};


// ==========================================
// GEMAS (paquetes con enlace de pago de PayPal + URL de retorno con "ficha").
// El saldo en la base sigue contándose en NODOS; la gema es solo la unidad que ve la persona:
// 1 nodo = GEMS_PER_NODE gemas. Cada paquete acredita nodes = gems / GEMS_PER_NODE.
// "token" es la ficha que PayPal pone en la URL al volver (?pago=TOKEN); define qué paquete se compró.
// Ver pay.js: la ficha sola NO acredita nada, hace falta además una intención de compra reciente
// de esa misma cuenta (se crea al pulsar el paquete dentro de la app).
// ==========================================
const GEMS_PER_NODE = 250;
const GEM_PACKAGES = {
    g15:  { id: 'g15',  gems: 15000,  usd: '4.99',  cooldownHours: 6,  token: '1k29394856678',    url: 'https://www.paypal.com/ncp/payment/Z4LSQ42QGWQFG' },
    g40:  { id: 'g40',  gems: 40000,  usd: '9.99',  cooldownHours: 24, token: 'j3j4jjU76k288',    url: 'https://www.paypal.com/ncp/payment/LPZLV5MM36KU4' },
    g100: { id: 'g100', gems: 100000, usd: '19.99', cooldownHours: 48, token: 'ki455ffdsfg6763xy', url: 'https://www.paypal.com/ncp/payment/94PTU9KLHLEJW' }
};
Object.values(GEM_PACKAGES).forEach((p) => { p.nodes = Math.round(p.gems / GEMS_PER_NODE); });
// Regalo inicial en NODOS (250 gemas por nodo): el INVITADO recibe 15.000 gemas = 60 nodos; una cuenta nueva
// ya no recibe regalo (tras registrarse hay que comprar). Las variables de entorno de Netlify, si existen, mandan.
function envNodes(name, fallback) {
    const v = process.env[name];
    return v === undefined || String(v).trim() === '' ? fallback : Number(v);
}
const freeGuestNodes = () => envNodes('GUEST_FREE_NODES', 60);
const freeUserNodes = () => envNodes('INITIAL_FREE_NODES', 0);

function findGemPackageByToken(token) {
    const t = String(token || '');
    return Object.values(GEM_PACKAGES).find((p) => p.token === t) || null;
}

module.exports = { PACKAGES, GEMS_PER_NODE, GEM_PACKAGES, findGemPackageByToken, freeGuestNodes, freeUserNodes };
