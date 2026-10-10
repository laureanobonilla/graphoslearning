// Tabla `vst_sessions` de Supabase (ver supabase/vestirte.sql): una fila por sesión de
// "Vestirte", con las respuestas, el perfil, las rutas (no las imágenes) de las fotos en
// Cloudinary y las marcas de seguridad. Las lecturas pagables siguen en qer_readings.
function cfg() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}
const H = (key, extra) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(extra || {}) });

async function req(path, opts) {
    const { url, key } = cfg();
    const res = await fetch(`${url}/rest/v1/${path}`, { ...opts, headers: H(key, opts && opts.headers) });
    if (!res.ok) throw new Error(`Supabase ${path.split('?')[0]} ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

const saveSession = (row) => req('vst_sessions', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
const getSession = async (id) => (await req(`vst_sessions?id=eq.${encodeURIComponent(id)}&select=*`))[0] || null;
const updateSession = (id, patch) => req(`vst_sessions?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
const listSessions = (limit = 60) => req(`vst_sessions?select=*&order=created_at.desc&limit=${limit}`);
const listExpired = (beforeIso) => req(`vst_sessions?select=id,photos&photos_deleted_at=is.null&created_at=lt.${encodeURIComponent(beforeIso)}&limit=200`);
const paidMap = async (ids) => {
    if (!ids.length) return {};
    const rows = await req(`qer_readings?id=in.(${ids.map(encodeURIComponent).join(',')})&select=id,paid`);
    return Object.fromEntries((rows || []).map(r => [r.id, !!r.paid]));
};

module.exports = { saveSession, getSession, updateSession, listSessions, listExpired, paidMap };
