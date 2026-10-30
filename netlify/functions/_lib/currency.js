// Monedas por país y conversión desde colones (compartido por tu-cancion y las apps de canciones con audio).
// Los precios base están en colones (₡). A cada país se le muestra el equivalente en su moneda, redondeado hacia arriba
// a un número "limpio" (step). Los tipos de cambio son APROXIMADOS y fijos: edita CRC_PER_USD y PER_USD cuando quieras.
const CRC_PER_USD = 510;
const CURRENCIES = {   // perUSD = unidades de esa moneda por 1 US$; step = redondeo; dots = separador de miles "."
    CRC: { symbol: '₡', perUSD: CRC_PER_USD, step: 100, dots: true },  USD: { symbol: 'US$', perUSD: 1, step: 1 },
    MXN: { symbol: 'MX$', perUSD: 19, step: 10 },   GTQ: { symbol: 'Q', perUSD: 7.7, step: 5 },    HNL: { symbol: 'L', perUSD: 26, step: 10 },
    NIO: { symbol: 'C$', perUSD: 36.8, step: 10 },  COP: { symbol: 'COL$', perUSD: 4000, step: 1000, dots: true }, PEN: { symbol: 'S/', perUSD: 3.6, step: 1 },
    CLP: { symbol: 'CLP$', perUSD: 950, step: 500, dots: true }, ARS: { symbol: 'AR$', perUSD: 1300, step: 1000, dots: true }, UYU: { symbol: '$U', perUSD: 40, step: 10, dots: true },
    BOB: { symbol: 'Bs', perUSD: 6.9, step: 5, dots: true }, PYG: { symbol: '₲', perUSD: 7500, step: 5000, dots: true }, DOP: { symbol: 'RD$', perUSD: 62, step: 50 },
    EUR: { symbol: '€', perUSD: 0.88, step: 1, dots: true }, BRL: { symbol: 'R$', perUSD: 5.5, step: 1, dots: true }, CAD: { symbol: 'CA$', perUSD: 1.38, step: 1 }, GBP: { symbol: '£', perUSD: 0.75, step: 1 },
    AUD: { symbol: 'AU$', perUSD: 1.5, step: 1 }, NZD: { symbol: 'NZ$', perUSD: 1.65, step: 1 }, CHF: { symbol: 'CHF ', perUSD: 0.85, step: 1 }
};
const COUNTRY_CUR = { CR: 'CRC', US: 'USD', PA: 'USD', EC: 'USD', SV: 'USD', PR: 'USD', VE: 'USD', MX: 'MXN', GT: 'GTQ', HN: 'HNL', NI: 'NIO', CO: 'COP', PE: 'PEN', CL: 'CLP', AR: 'ARS', UY: 'UYU', BO: 'BOB', PY: 'PYG', DO: 'DOP',
    BR: 'BRL', CA: 'CAD', GB: 'GBP', ES: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR', IE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR', MT: 'EUR', CY: 'EUR', HR: 'EUR', AU: 'AUD', NZ: 'NZD', CH: 'CHF' };
const currencyOf = (country) => COUNTRY_CUR[String(country || '').toUpperCase()] || 'USD';
const fmtMoney = (cur, n) => { const c = CURRENCIES[cur] || CURRENCIES.USD, t = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, c.dots ? '.' : ','); return c.symbol + t; };
// De colones a la moneda indicada (redondeo hacia arriba al "step" de esa moneda).
function convertCrc(crc, cur) { const c = CURRENCIES[cur] || CURRENCIES.USD; if (cur === 'CRC') return Math.ceil(crc / 100 - 1e-9) * 100; return Math.ceil((crc * (c.perUSD / CRC_PER_USD)) / c.step - 1e-9) * c.step; }
const displayPrice = (crc, cur) => { const code = CURRENCIES[cur] ? cur : 'USD'; return fmtMoney(code, convertCrc(crc, code)); };
const currencyInfo = (country) => { const code = currencyOf(country), c = CURRENCIES[code]; return { code, symbol: c.symbol, perCrc: c.perUSD / CRC_PER_USD, step: c.step, dots: !!c.dots, country: country || null }; };


module.exports = { CRC_PER_USD, CURRENCIES, COUNTRY_CUR, currencyOf, fmtMoney, convertCrc, displayPrice, currencyInfo };
