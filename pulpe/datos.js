/* La Pulpe · datos del juego: productos, vecinos, mejoras, barrios, eventos y frases ticas.
   Montos en colones. Todo lo que se ajusta para balancear el juego está aquí. */
'use strict';

const DIA_INI = 6 * 60, DIA_FIN = 20 * 60;          // la pulpe abre de 6:00 a 20:00 (minutos del día)
const TEMPORADA = 30, SEMANA = 7;                    // días de la temporada y de la semana de prueba (gratis)
const DINERO_INI = 70000;

// cat: desayuno | antojo | noche | despensa · vida: días antes de dañarse (0 = no se daña) · vidaRefri: con refri
// req: mejora necesaria para venderlo · pack: unidades por pedido · col: color en el estante
const PRODUCTOS = [
    { id: 'pan', n: 'Pan', e: '🥖', costo: 340, ref: 550, dem: 1.25, cat: 'desayuno', vida: 1, pack: 10, col: '#d9a25b', forma: 'pan' },
    { id: 'leche', n: 'Leche', e: '🥛', costo: 560, ref: 900, dem: 1.1, cat: 'desayuno', vida: 2, vidaRefri: 6, pack: 6, col: '#f4f1e8', forma: 'caja' },
    { id: 'huevos', n: 'Huevos', e: '🥚', costo: 1920, ref: 3100, dem: 0.55, cat: 'desayuno', vida: 9, pack: 6, col: '#e9d3b0', forma: 'carton' },
    { id: 'cafe', n: 'Café', e: '☕', costo: 1490, ref: 2400, dem: 0.55, cat: 'desayuno', vida: 0, pack: 6, col: '#7a4a2a', forma: 'bolsa' },
    { id: 'tortillas', n: 'Tortillas', e: '🫓', costo: 680, ref: 1100, dem: 0.65, cat: 'desayuno', vida: 3, vidaRefri: 6, pack: 6, col: '#e8cf8f', forma: 'bolsa' },
    { id: 'natilla', n: 'Natilla', e: '🥣', costo: 775, ref: 1250, dem: 0.5, cat: 'desayuno', vida: 1, vidaRefri: 6, pack: 6, col: '#ffffff', forma: 'vaso', req: 'refri' },
    { id: 'arroz', n: 'Arroz', e: '🍚', costo: 590, ref: 950, dem: 1.0, cat: 'despensa', vida: 0, pack: 10, col: '#f7f3ea', forma: 'bolsa' },
    { id: 'frijoles', n: 'Frijoles', e: '🫘', costo: 775, ref: 1250, dem: 0.85, cat: 'despensa', vida: 0, pack: 10, col: '#4b2a2a', forma: 'bolsa' },
    { id: 'azucar', n: 'Azúcar', e: '🧂', costo: 525, ref: 850, dem: 0.55, cat: 'despensa', vida: 0, pack: 10, col: '#f0e9ff', forma: 'bolsa' },
    { id: 'aceite', n: 'Aceite', e: '🫒', costo: 1240, ref: 2000, dem: 0.4, cat: 'despensa', vida: 0, pack: 6, col: '#e6c229', forma: 'botella' },
    { id: 'jabon', n: 'Jabón', e: '🧼', costo: 525, ref: 850, dem: 0.4, cat: 'despensa', vida: 0, pack: 8, col: '#7ec8e3', forma: 'caja' },
    { id: 'papel', n: 'Papel higiénico', e: '🧻', costo: 1490, ref: 2400, dem: 0.35, cat: 'despensa', vida: 0, pack: 6, col: '#ffffff', forma: 'rollo' },
    { id: 'gaseosa', n: 'Gaseosa', e: '🥤', costo: 560, ref: 900, dem: 1.0, cat: 'noche', vida: 0, pack: 12, col: '#c0392b', forma: 'botella' },
    { id: 'birra', n: 'Birra', e: '🍺', costo: 680, ref: 1100, dem: 1.05, cat: 'noche', vida: 0, pack: 12, col: '#d4a017', forma: 'lata', req: 'patente' },
    { id: 'papas', n: 'Papitas', e: '🍟', costo: 405, ref: 650, dem: 0.9, cat: 'antojo', vida: 0, pack: 12, col: '#f39c12', forma: 'bolsa' },
    { id: 'galletas', n: 'Galletas', e: '🍪', costo: 280, ref: 450, dem: 0.85, cat: 'antojo', vida: 0, pack: 12, col: '#a0522d', forma: 'caja' },
    { id: 'confites', n: 'Confites', e: '🍬', costo: 45, ref: 100, dem: 1.35, cat: 'antojo', vida: 0, pack: 50, col: '#e84393', forma: 'confite' },
    { id: 'helado', n: 'Helado', e: '🍦', costo: 465, ref: 750, dem: 0.95, cat: 'antojo', vida: 0, pack: 12, col: '#fd79a8', forma: 'vaso', req: 'congelador' }
];
const PROD = Object.fromEntries(PRODUCTOS.map(p => [p.id, p]));

// Cuánto se antoja cada tipo de producto a cada hora (multiplicador de la demanda).
function curvaHora(cat, h) {
    if (cat === 'desayuno') return h < 9 ? 2.2 : h < 11 ? 1.0 : h < 16 ? 0.45 : 0.7;
    if (cat === 'antojo') return h < 10 ? 0.4 : h < 14 ? 0.9 : h < 18 ? 1.8 : 1.0;
    if (cat === 'noche') return h < 12 ? 0.35 : h < 17 ? 0.9 : 1.9;
    return h < 8 ? 0.6 : h < 18 ? 1.05 : 0.9;   // despensa
}
// Afluencia de gente según la hora (picos de la mañana y la tarde).
function afluencia(h) { return h < 7 ? 0.7 : h < 9 ? 1.5 : h < 12 ? 0.9 : h < 14 ? 1.1 : h < 16 ? 0.8 : h < 19 ? 1.45 : 1.0; }

const MEJORAS = [
    { id: 'refri', n: 'Refrigeradora', e: '🧊', costo: 35000, luz: 600, d: 'La leche, la natilla y las tortillas duran más; gaseosa y birra frías se venden 30 % más. Permite vender natilla.' },
    { id: 'vitrina', n: 'Vitrina de confites', e: '🍭', costo: 22000, d: 'Los antojos (confites, galletas, papitas) se venden 35 % más.' },
    { id: 'rotulo', n: 'Rótulo luminoso', e: '💡', costo: 18000, luz: 300, d: 'Llega 12 % más gente, sobre todo de noche.' },
    { id: 'datafono', n: 'Datáfono y SINPE', e: '💳', costo: 15000, d: 'Se acabó el «no tengo menudo»: cada cliente gasta un poco más.' },
    { id: 'servicios', n: 'Recargas y pago de recibos', e: '📱', costo: 12000, d: 'Uno de cada cuatro clientes hace una recarga o paga un recibo: comisión de ₡150 cada vez.' },
    { id: 'congelador', n: 'Congelador', e: '🍦', costo: 45000, luz: 700, d: 'Permite vender helados (se venden como pan caliente con calor).' },
    { id: 'rejas', n: 'Rejas', e: '🔒', costo: 28000, d: 'Se acabaron los robos.' },
    { id: 'patente', n: 'Patente de licores', e: '🍺', costo: 60000, d: 'Permite vender birra. Los días de partido, se vende el doble.' },
    { id: 'planta', n: 'Planta eléctrica', e: '🔌', costo: 50000, d: 'Con apagón, la refri y el congelador siguen funcionando.' },
    { id: 'soda', n: 'Sodita de gallo pinto', e: '🍳', costo: 70000, d: 'En la mañana vende gallo pinto (gasta arroz, frijoles y huevos): unos ₡900 de ganancia por plato.' },
    { id: 'ampliacion', n: 'Ampliación', e: '🏗️', costo: 90000, d: '20 % más gente, caben 2 personas más en la fila y los estantes guardan 60 % más.' },
    { id: 'fachada', n: 'Pintar la fachada', e: '🎨', costo: 15000, d: 'La pulpe se ve bonita: +6 de reputación.' }
];
const MEJ = Object.fromEntries(MEJORAS.map(m => [m.id, m]));
const SALARIO_AYUDANTE = 6000;

const BARRIOS = {
    barrio: { n: 'Desamparados', d: 'El barrio de toda la vida: de todo un poco, mucho fiado.', pase: false, gente: 1.0, tolera: 1.0, fiado: 1.2, pared: '#9fd3b4', pared2: '#7fbf9c', piso: '#c9a27a', cielo: 1.0,
        dem: {} },
    puerto: { n: 'Limón', d: 'Calor, buena vibra y rice and beans: más gaseosa, helado y arroz con frijoles; poca tolerancia a precios altos.', pase: true, gente: 1.15, tolera: 0.88, fiado: 1.0, pared: '#f5d76e', pared2: '#e8c14a', piso: '#b9875a', calor: 0.45,
        dem: { gaseosa: 1.4, helado: 1.5, arroz: 1.3, frijoles: 1.3, cafe: 0.7, birra: 1.2 } },
    playa: { n: 'Tamarindo', d: 'Turistas que pagan más, pero la gente varía mucho de un día a otro y la luz es más cara.', pase: true, gente: 0.95, tolera: 1.35, fiado: 0.4, pared: '#bfe6f2', pared2: '#9dd3e6', piso: '#e3cfa6', calor: 0.4, luzExtra: 900,
        dem: { birra: 1.6, helado: 1.5, gaseosa: 1.3, papas: 1.3, frijoles: 0.6, huevos: 0.7, natilla: 0.5 } }
};

// Vecinos habituales: confianza (prob. de pagar el fiado) oculta; se descubre con el historial.
const VECINOS = [
    ['Doña Cande', 0.92, 'leche,pan,cafe'], ['Don Chepe', 0.55, 'birra,papas'], ['Doña Mireya', 0.85, 'arroz,frijoles,aceite'], ['Don Toño', 0.7, 'cafe,pan,huevos'],
    ['la profe Marielos', 0.95, 'galletas,leche,papel'], ['Juanca el del taller', 0.6, 'gaseosa,papas,birra'], ['Kevin', 0.35, 'confites,gaseosa,papas'], ['Dayana', 0.8, 'leche,tortillas,natilla'],
    ['Don Beto', 0.45, 'birra,gaseosa'], ['Doña Lela', 0.9, 'arroz,azucar,cafe'], ['el mae Brayan', 0.3, 'confites,papas,gaseosa'], ['Yorleny', 0.75, 'jabon,papel,arroz'],
    ['Don Eliécer', 0.65, 'huevos,tortillas,pan'], ['Doña Flory', 0.88, 'natilla,pan,leche'], ['Chalo', 0.4, 'birra,papas'], ['Wendy', 0.7, 'helado,confites,galletas'],
    ['Don Memo', 0.8, 'cafe,azucar'], ['Doña Tere', 0.93, 'frijoles,arroz,huevos'], ['Jeffrey', 0.5, 'gaseosa,helado,papas'], ['Hazel', 0.78, 'galletas,leche'],
    ['Don Rigo', 0.58, 'birra,cafe'], ['Doña Zeneida', 0.87, 'arroz,aceite,jabon'], ['Randall', 0.48, 'gaseosa,papas,confites'], ['Yendry', 0.72, 'tortillas,natilla,pan']
].map(([n, conf, fav], i) => ({ id: 'v' + i, n, conf, fav: fav.split(',') }));

const PIELES = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0704a'];
const ROPAS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22', '#34495e', '#fd79a8', '#16a085', '#d35400', '#2c3e50'];

const FRASES = {
    saludo: ['¡Buenas!', '¡Upe!', 'Buenas, ¿cómo le va?', 'Pura vida', '¡Qué hubo!', 'Buenas, diay'],
    caro: ['¡Diay, qué caro!', '¡Upe, qué carero!', 'Mae, eso está muy caro', '¡Qué robo!'],
    noHay: ['¿No hay? Qué torta', 'Diay, ¿no tiene?', 'Qué sal, ¿no hay?', 'Pucha, ¿se acabó?'],
    feliz: ['¡Tuanis!', '¡Pura vida!', 'Gracias, mae', '¡Qué chiva!', 'Dios se lo pague'],
    seVa: ['Diay, mejor me voy', 'Qué fila, mae…', 'Mejor voy al chino', 'Ya vengo… (no vuelve)'],
    fiado: ['¿Me lo apunta, porfa?', '¿Me fía hasta la quincena?', 'Apúntemelo, ¿sí?', '¿Me lo deja en la cuenta?'],
    excusa: ['Mañana sin falta le pago', 'Es que no ha caído la quincena', 'Diay, ahorita no ando nada', 'El viernes le pago, palabra', 'Mi marido le paga', 'Ay, se me olvidó la billetera'],
    paga: ['Tome, aquí está lo del fiado', 'Ahí le pago, gracias por esperar', 'Cuentas claras, amistades largas']
};

// Eventos del día. prob se evalúa cada mañana; algunos tienen condiciones.
const EVENTOS = [
    { id: 'lluvia', n: 'Aguacero', e: '🌧️', prob: 0.3, d: 'Llueve: viene menos gente, pero se vende más café y pan.' },
    { id: 'calor', n: 'Calorón', e: '☀️', prob: 0.22, d: 'Hace un calor de aquellos: helados, gaseosas y birras vuelan.' },
    { id: 'sele', n: 'Juega la Sele', e: '⚽', prob: 0.15, d: 'Hoy a las 7 p. m. juega la Selección: en la noche se vende el doble de birra, gaseosa y papitas.' },
    { id: 'apagon', n: 'Apagón', e: '🔦', prob: 0.08, d: 'Se va la luz unas horas: sin planta eléctrica, lo refrigerado se puede dañar.' },
    { id: 'inspector', n: 'Inspector de Salud', e: '🩺', prob: 0.1, d: 'Viene el inspector del Ministerio de Salud: más vale que la pulpe esté limpia.' },
    { id: 'ladron', n: 'Rondan los amigos de lo ajeno', e: '🦹', prob: 0.07, d: 'Andan robando en el barrio. Sin rejas, la caja corre peligro.' },
    { id: 'chismosa', n: 'La vecina chismosa', e: '🗣️', prob: 0.12, d: 'Hoy viene Doña Chusa: si la atiende bien, le hace buena fama; si no, mala.' },
    { id: 'camion', n: 'El camión no vino', e: '🚚', prob: 0.08, d: 'Un proveedor quedó mal: hoy no se pueden pedir bebidas.' },
    { id: 'turno', n: 'Turno en la plaza', e: '🎡', prob: 0.05, d: 'Hay turno en la plaza: 50 % más gente todo el día.' }
];
const EV = Object.fromEntries(EVENTOS.map(e => [e.id, e]));

const LOGROS = [
    { id: 'primera', n: 'Abrió la pulpe', d: 'Terminar el primer día' },
    { id: 'cien', n: 'Pulpe llena', d: 'Atender 100 clientes en un día' },
    { id: 'rico', n: 'Ya me puedo jubilar', d: 'Llegar a ₡500.000 de patrimonio' },
    { id: 'millon', n: 'Millonario de barrio', d: 'Llegar a ₡1.000.000 de patrimonio' },
    { id: 'querido', n: 'El más querido', d: 'Reputación de 90 o más' },
    { id: 'cobrador', n: 'Cobrador implacable', d: 'Cobrar ₡50.000 de fiado' },
    { id: 'cero', n: 'Cuentas claras', d: 'Terminar una semana sin fiado pendiente' },
    { id: 'apagon', n: 'Luz propia', d: 'Pasar un apagón con planta eléctrica' },
    { id: 'todas', n: 'La pulpe soñada', d: 'Comprar todas las mejoras' },
    { id: 'temporada', n: 'Temporada completa', d: 'Llegar al día 30' }
];
