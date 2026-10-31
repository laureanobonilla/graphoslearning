// «jingle-negocio»: piezas compartidas por las funciones jn-*.
// Registro en la tabla jn_orders (supabase/jingle-negocio.sql) y en events (app = 'jingle-negocio').
const { json, UUID_RE, scrub, scrubOne, ipOf, hashIp, countryOf } = require('./tc-core');

// >>> EDITA AQUÍ los precios (colones). Lo que ve la persona sale de jn-config. <<<
const OPTIONS = {
    logo:   { label: 'La canción del anuncio con su logo', price: 12900 },
    nombre: { label: 'La canción del anuncio con el nombre de su negocio', price: 24900 },
    propia: { label: 'Una canción totalmente personalizada', price: 34900 }
};

// >>> EDITA AQUÍ los rubros (deben coincidir con RUBROS de jingle-negocio/app.js). <<<
const RUBROS = {
    enderezado: 'Taller de enderezado y pintura', taller: 'Taller mecánico', lavacar: 'Lavacar',
    barberia: 'Barbería', salon: 'Salón de belleza / uñas', soda: 'Soda / restaurante',
    panaderia: 'Panadería / repostería', gimnasio: 'Gimnasio', veterinaria: 'Veterinaria / tienda de mascotas',
    ferreteria: 'Ferretería', otro: 'Otro'
};
const RHYTHMS = ['Cumbia', 'Reguetón', 'Merengue', 'Salsa', 'Pop', 'Rock', 'Bachata', 'Tropical / Calypso', 'Balada'];

const money = (n) => '₡' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
function priceOf(option) {
    const o = OPTIONS[option]; if (!o) return null;
    return { amount: o.price, text: money(o.price) };
}
const publicConfig = () => ({
    options: Object.fromEntries(Object.entries(OPTIONS).map(([k, v]) => [k, { label: v.label, price: v.price, text: money(v.price) }]))
});

// Lo que manda el navegador es DATO, nunca instrucción: todo se limpia y se acota.
function cleanBrief(b) {
    b = b && typeof b === 'object' ? b : {};
    const option = OPTIONS[b.option] ? b.option : '';
    const rubro = RUBROS[b.rubro] ? b.rubro : '';
    return {
        rubro, rubroLabel: rubro === 'otro' ? scrubOne(b.rubroOther, 80) || 'Otro' : (RUBROS[rubro] || ''), rubroOther: scrubOne(b.rubroOther, 80),
        option,
        business: scrubOne(b.business, 60), pronounce: scrubOne(b.pronounce, 60), canton: scrubOne(b.canton, 60),
        slogan: scrubOne(b.slogan, 120), phoneInSong: scrubOne(b.phoneInSong, 30),
        details: scrub(b.details, 1500),
        rhythm: RHYTHMS.includes(b.rhythm) ? b.rhythm : (b.rhythm === 'Otro' ? 'Otro' : ''), rhythmOther: scrubOne(b.rhythmOther, 80),
        notes: scrub(b.notes, 800)
    };
}
const rhythmText = (b) => (b.rhythm === 'Otro' ? b.rhythmOther : b.rhythm) || '';

function sbCfg() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}
// Inserta o actualiza (por id). Solo se pisan las columnas que vienen en `row`.
async function saveOrder(row) {
    const { url, key } = sbCfg();
    const res = await fetch(`${url}/rest/v1/jn_orders?on_conflict=id`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...row, updated_at: new Date().toISOString() })
    });
    if (!res.ok) throw new Error(`jn_orders HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

module.exports = { OPTIONS, RUBROS, RHYTHMS, money, priceOf, publicConfig, cleanBrief, rhythmText, saveOrder, json, UUID_RE, scrub, scrubOne, ipOf, hashIp, countryOf };
