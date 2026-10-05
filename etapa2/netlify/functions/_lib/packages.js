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

module.exports = { PACKAGES };
