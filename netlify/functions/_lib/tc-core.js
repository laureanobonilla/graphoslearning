// «tu-cancion»: piezas compartidas por las funciones tc-*.
const crypto = require('crypto');

// >>> EDITA AQUÍ los precios. Costa Rica paga CR_CRC colones; los demás países, el equivalente de BASE_CRC colones en su
// moneda (tipos de cambio aproximados en _lib/currency.js). <<<
const { currencyOf, convertCrc, fmtMoney } = require('./currency');
const CR_CRC = 3900, BASE_CRC = 9900;
const PRICES = { CR: { amount: CR_CRC, currency: 'CRC' }, BASE_CRC };
const priceFor = (country) => {
    const c = String(country || '').toUpperCase();
    if (c === 'CR') return { amount: CR_CRC, currency: 'CRC', text: fmtMoney('CRC', CR_CRC), provisional: false };
    const cur = currencyOf(c), amount = convertCrc(BASE_CRC, cur);
    return { amount, currency: cur, text: fmtMoney(cur, amount), provisional: !c };   // sin país detectado: se avisa en el correo
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
// Quita caracteres de control y comillas "de código". Lo que viene del navegador es DATO, nunca instrucción.
const scrub = (s, max) => String(s == null ? '' : s).normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>`{}\\]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
const scrubOne = (s, max) => scrub(s, max).replace(/\s*\n\s*/g, ' ');
const list = (a, n, max) => (Array.isArray(a) ? a : []).slice(0, n).map(x => scrubOne(x, max)).filter(Boolean);

const countryOf = (event) => {
    try {
        const h = event.headers || {};
        const raw = h['x-nf-geo'] || h['X-Nf-Geo'];
        const c = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))?.country?.code : (h['x-country'] || '');
        return c && /^[A-Za-z]{2}$/.test(c) ? String(c).toUpperCase() : '';
    } catch { return ''; }
};
const ipOf = (event) => {
    const h = event.headers || {};
    return String(h['x-nf-client-connection-ip'] || h['X-Nf-Client-Connection-Ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'unknown').trim().slice(0, 64);
};
const hashIp = (ip) => 'ip:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 20);

// ---- Registro en la tabla tc_songs (supabase/tu-cancion.sql) -------------------------------------------------
function sbCfg() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}
// Inserta o actualiza (por id). Solo se pisan las columnas que vienen en `row`.
async function saveSong(row) {
    const { url, key } = sbCfg();
    const res = await fetch(`${url}/rest/v1/tc_songs?on_conflict=id`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...row, updated_at: new Date().toISOString() })
    });
    if (!res.ok) throw new Error(`tc_songs HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

// Limpia el cuestionario que manda el navegador (todo texto acotado).
function cleanBrief(b) {
    b = b && typeof b === 'object' ? b : {};
    return {
        hasOwnLyrics: b.hasOwnLyrics === true,
        reason: scrubOne(b.reason, 80), reasonOther: scrubOne(b.reasonOther, 200),
        named: b.named === true, name: scrubOne(b.name, 30),
        qualities: list(b.qualities, 12, 90), qualitiesOther: scrubOne(b.qualitiesOther, 200),
        feeling: scrubOne(b.feeling, 90), feelingOther: scrubOne(b.feelingOther, 200),
        extra: (Array.isArray(b.extra) ? b.extra : []).slice(0, 4).map(e => ({ q: scrubOne(e && e.q, 200), a: list(e && e.a, 10, 120), other: scrubOne(e && e.other, 200) })).filter(e => e.q),
        rhythm: scrubOne(b.rhythm, 60), rhythmOther: scrubOne(b.rhythmOther, 120),
        details: scrub(b.details, 1500), notes: scrub(b.notes, 1200)
    };
}
module.exports = { PRICES, priceFor, UUID_RE, json, scrub, scrubOne, list, countryOf, ipOf, hashIp, saveSong, cleanBrief };
