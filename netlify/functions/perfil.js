// «Mi historia»: valida la clave en el servidor y, solo si es correcta, entrega enlaces TEMPORALES a las fotos privadas.
// Las fotos sin censura viven en un bucket privado de Supabase: no están en el repo ni en una URL pública.
const crypto = require('crypto');
const BUCKET = 'perfil-privado';
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const sha = (s) => crypto.createHash('sha256').update('perfil:' + String(s).trim().toLowerCase()).digest('hex');
const hits = new Map();
function limited(ip, max) { const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 60000); h.push(now); hits.set(ip, h); if (hits.size > 500) for (const [k, v] of hits) if (now - v[v.length - 1] > 60000) hits.delete(k); return h.length > max; }

function cfg() { const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY; if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY'); return { url: url.replace(/\/$/, ''), key }; }
async function sb(path, opt = {}) {
    const { url, key } = cfg();
    const res = await fetch(`${url}${path}`, { ...opt, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
}
async function signedUrls(paths, seconds) {
    if (!paths.length) return [];
    const { url } = cfg();
    const r = await sb(`/storage/v1/object/sign/${BUCKET}`, { method: 'POST', body: JSON.stringify({ expiresIn: seconds, paths }) });
    return (r || []).map((x) => (x.signedURL ? `${url}/storage/v1${x.signedURL}` : null)).filter(Boolean);
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'json' }); }
    const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim())) || 'unknown';
    if (limited(ip, 12)) return json(429, { error: 'espera' });   // frena adivinar claves
    try {
        if (b.action !== 'unlock') return json(400, { error: 'accion' });
        const code = String(b.code || '').trim();
        if (code.length < 4 || code.length > 80) return json(200, { ok: false });
        const rows = await sb(`/rest/v1/perfil_claves?select=id,uses&code_hash=eq.${sha(code)}&active=eq.true&limit=1`);
        if (!rows || !rows.length) return json(200, { ok: false });
        await sb(`/rest/v1/perfil_claves?id=eq.${rows[0].id}`, { method: 'PATCH', body: JSON.stringify({ uses: (rows[0].uses || 0) + 1, last_used: new Date().toISOString() }) });
        const fotos = await sb('/rest/v1/perfil_fotos?select=path&order=sort.asc,id.asc');
        const urls = await signedUrls((fotos || []).map((f) => f.path), 3600);
        return json(200, { ok: true, fotos: urls });
    } catch (e) { console.error('[perfil]', e.message); return json(502, { error: 'no_disponible' }); }
};
exports.sha = sha;
