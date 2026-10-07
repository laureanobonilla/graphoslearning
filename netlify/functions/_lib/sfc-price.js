// Precio recomendado para el correo del dueño. NO se muestra al cliente ni cambia lo que cobra la página:
// es una sugerencia para decidir la oferta después de que la persona oiga la muestra.
// >>> EDITA AQUÍ los precios (son hipótesis para empezar, no datos). <<<
const PRICES = {
    CR:     { currency: 'CRC', base: 6900, mid: 9900, high: 14900, label: 'Costa Rica' },
    USD_ES: { currency: 'USD', base: 15,   mid: 22,   high: 32,    label: 'resto de Latinoamérica/España (USD)' },
    USD_EN: { currency: 'USD', base: 49,   mid: 69,   high: 99,    label: 'inglés (EE. UU. y otros)' }
};
// nivel por ocasión: base = sin urgencia emocional, mid = fecha señalada, high = momento único (se paga más por hacerlo bien)
const OCCASIONS_ES = { 'Aniversario': 'mid', 'Cumpleaños de mi pareja': 'mid', 'San Valentín': 'mid', 'Pedir matrimonio': 'high', 'Boda': 'high', 'Solo porque sí': 'base' };
const OCCASIONS_EN = { 'Anniversary': 'mid', 'Birthday': 'mid', "Valentine's Day": 'mid', 'Proposal': 'high', 'Wedding': 'high', 'Just because': 'base' };
const TIER_NAME = { base: 'precio base', mid: 'fecha señalada', high: 'momento único' };

const money = (n, cur) => (cur === 'CRC' ? '₡' : '$') + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function occasionOf(kind, raw) {
    const list = kind === 'couple' ? OCCASIONS_EN : (kind === 'pareja' ? OCCASIONS_ES : null);
    const v = String(raw || '').trim();
    return list && Object.prototype.hasOwnProperty.call(list, v) ? v : '';
}

function suggestPrice({ kind, country, occasion }) {
    const table = kind === 'couple' ? PRICES.USD_EN : (String(country || '').toUpperCase() === 'CR' ? PRICES.CR : PRICES.USD_ES);
    const list = kind === 'couple' ? OCCASIONS_EN : OCCASIONS_ES;
    const occ = occasionOf(kind, occasion);
    const tier = occ ? list[occ] : 'base';
    const amount = table[tier];
    const text = `PRECIO RECOMENDADO: ${money(amount, table.currency)}${table.currency === 'USD' ? ' USD' : ''} ` +
        `(${occ ? `ocasión: ${occ} → ${TIER_NAME[tier]}` : (kind === 'cumple' ? 'cumpleaños → precio base' : 'no indicó ocasión → precio base')}; mercado: ${table.label}; base ${money(table.base, table.currency)}, ` +
        `fecha señalada ${money(table.mid, table.currency)}, momento único ${money(table.high, table.currency)}).\n` +
        `Es una sugerencia para empezar: ajústala a tu criterio, y recuerda hablar de precio solo después de que oiga la muestra.`;
    return { amount, currency: table.currency, tier, occasion: occ, short: money(amount, table.currency), text };
}

module.exports = { PRICES, OCCASIONS_ES, OCCASIONS_EN, occasionOf, suggestPrice };
