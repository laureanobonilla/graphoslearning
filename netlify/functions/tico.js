// Travesía Tica: entrega al juego todas las preguntas, retos y textos que viven en Supabase (tablas tico_*).
// El juego no genera nada con IA: todo sale de la base de datos. Se pueden agregar/editar filas desde Supabase sin tocar el código.
const json = (statusCode, obj, cache) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': cache || 'no-store' }, body: JSON.stringify(obj) });
async function sb(path) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
}
exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    try {
        const [etapas, preguntas, ordenes, lugares, textos] = await Promise.all([
            sb('tico_etapas?select=clave,orden,nombre,apodo,intro,dato,lat,lon&order=orden.asc'),
            sb('tico_preguntas?select=id,etapa,categoria,dificultad,pregunta,opciones,correcta,explicacion&activa=eq.true'),
            sb('tico_ordenes?select=id,titulo,items&activa=eq.true'),
            sb('tico_lugares?select=id,etapa,nombre,pista,lat,lon&activa=eq.true'),
            sb('tico_textos?select=clave,valor')
        ]);
        const T = {}; textos.forEach((t) => { T[t.clave] = t.valor; });
        return json(200, { etapas, preguntas, ordenes, lugares, textos: T }, 'public, max-age=120');
    } catch (e) { console.error('[tico]', e.message); return json(502, { error: 'no_disponible' }); }
};
