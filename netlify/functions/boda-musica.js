// Música de la misa de Kari y Lau: tabla comparativa (Supabase, tabla boda_musica + carpeta boda-musica para videos subidos).
// Cada cambio toca UNA fila y solo los campos enviados, así Kari y Lau no se pisan entre sí.
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const BUCKET = 'boda-musica';
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, n);
const hits = new Map(), ups = new Map();
function limit(map, ip, ms, max) { const now = Date.now(), h = (map.get(ip) || []).filter((t) => now - t < ms); h.push(now); map.set(ip, h); if (map.size > 500) for (const [k, v] of map) if (now - v[v.length - 1] > ms) map.delete(k); return h.length > max; }

function cfg() { const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY; if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY'); return { url: url.replace(/\/$/, ''), key }; }
async function sb(path, opt = {}) {
    const { url, key } = cfg();
    const res = await fetch(`${url}${path}`, { ...opt, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
}
const COLS = 'id,titulo,medios,precio,extra,nota_k,nota_l';
const MAX_MEDIOS = 12;
const list = () => sb(`/rest/v1/boda_musica?select=${COLS}&order=id.asc`);

// Enlaces: solo http(s). A los de Instagram se les quitan los parámetros de seguimiento (?utm_...).
function cleanLink(u) {
    let x; try { x = new URL(String(u || '').trim()); } catch { return null; }
    if (!/^https?:$/.test(x.protocol)) return null;
    if (/(^|\.)instagram\.com$/.test(x.hostname)) x.search = '';
    return x.toString().slice(0, 500);
}
const num = (v, lo, hi, int) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); if (!Number.isFinite(n) || n < lo || n > hi) return undefined; return int ? Math.round(n) : Math.round(n * 100) / 100; };
// Un «medio» es un video (subido aquí o de los iniciales del sitio) o un enlace http(s).
function medio(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.tipo === 'link') { const u = cleanLink(m.url); return u ? { tipo: 'link', url: u } : null; }
    if (m.tipo === 'video') {
        const p = String(m.url || ''), own = `${cfg().url}/storage/v1/object/public/${BUCKET}/`;
        if (p.length > 500 || !(p.startsWith(own) || p.startsWith('/boda-kari-lau/videos/'))) return null;
        return { tipo: 'video', url: p };
    }
    return null;
}
const prefijo = () => `${cfg().url}/storage/v1/object/public/${BUCKET}/`;
const borrarArchivos = (medios) => Promise.all((medios || []).filter((m) => m.tipo === 'video' && m.url.startsWith(prefijo())).map((m) => sb(`/storage/v1/object/${BUCKET}/${m.url.slice(prefijo().length)}`, { method: 'DELETE' }).catch(() => {})));
// Valida solo los campos presentes; devuelve { o } o { error }.
function fields(b, esNuevo) {
    const o = {};
    if ('titulo' in b) o.titulo = clean(b.titulo, 120);
    if ('extra' in b) o.extra = clean(b.extra, 300);
    if ('precio' in b) { const n = num(b.precio, 0, 1e8, false); if (n === undefined) return { error: 'precio' }; o.precio = n; }
    for (const k of ['nota_k', 'nota_l']) if (k in b) { const n = num(b[k], 1, 10, true); if (n === undefined) return { error: 'nota' }; o[k] = n; }
    if (esNuevo) {
        const ms = (Array.isArray(b.medios) ? b.medios : []).slice(0, MAX_MEDIOS).map(medio);
        if (!ms.length || ms.some((m) => !m)) return { error: 'medio' };
        o.medios = ms;
        if (!o.titulo) o.titulo = 'Nueva opción';
    }
    return { o };
}
const filaMedios = async (id) => { const r = (await sb(`/rest/v1/boda_musica?id=eq.${id}&select=medios`))[0]; return r ? (r.medios || []) : null; };

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'json' }); }
    const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim())) || 'unknown';
    if (limit(hits, ip, 60000, 90)) return json(429, { error: 'demasiadas' });
    try {
        const a = String(b.action || ''), id = Number(b.id);
        if (a === 'list') return json(200, { rows: await list() });
        if (a === 'signUpload') {
            if (limit(ups, ip, 3600000, 12)) return json(429, { error: 'demasiadas' });
            const name = String(b.name || 'video').toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(-60);
            if (!/\.(mp4|mov|m4v|webm)$/.test(name)) return json(400, { error: 'formato' });
            const path = `${Date.now()}-${name}`;
            const r = await sb(`/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', body: '{}' });
            return json(200, { uploadUrl: `${cfg().url}/storage/v1${r.url}`, publicUrl: `${cfg().url}/storage/v1/object/public/${BUCKET}/${path}` });
        }
        if (a === 'add') {
            const f = fields(b, true); if (f.error) return json(400, { error: f.error });
            await sb('/rest/v1/boda_musica', { method: 'POST', body: JSON.stringify({ id: Date.now(), ...f.o }) });
            return json(200, { rows: await list() });
        }
        if (a === 'update') {
            if (!Number.isSafeInteger(id)) return json(400, { error: 'id' });
            const f = fields(b, false); if (f.error) return json(400, { error: f.error });
            await sb(`/rest/v1/boda_musica?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ ...f.o, updated_at: new Date().toISOString() }) });
            return json(200, { rows: await list() });
        }
        if (a === 'addMedio') {
            if (!Number.isSafeInteger(id)) return json(400, { error: 'id' });
            const m = medio(b), cur = await filaMedios(id); if (!m) return json(400, { error: 'medio' }); if (cur == null) return json(404, { error: 'id' });
            if (cur.length >= MAX_MEDIOS) return json(400, { error: 'maximo' });
            await sb(`/rest/v1/boda_musica?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ medios: cur.concat(m), updated_at: new Date().toISOString() }) });
            return json(200, { rows: await list() });
        }
        if (a === 'delMedio') {
            const i = Number(b.i); if (!Number.isSafeInteger(id) || !Number.isInteger(i)) return json(400, { error: 'id' });
            const cur = await filaMedios(id); if (cur == null || i < 0 || i >= cur.length) return json(404, { error: 'id' });
            await sb(`/rest/v1/boda_musica?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ medios: cur.filter((_, k) => k !== i), updated_at: new Date().toISOString() }) });
            await borrarArchivos([cur[i]]);
            return json(200, { rows: await list() });
        }
        if (a === 'delete') {
            if (!Number.isSafeInteger(id)) return json(400, { error: 'id' });
            const cur = await filaMedios(id);
            await sb(`/rest/v1/boda_musica?id=eq.${id}`, { method: 'DELETE' });
            await borrarArchivos(cur);   // si había videos subidos, también se borran los archivos
            return json(200, { rows: await list() });
        }
        return json(400, { error: 'accion' });
    } catch (e) { console.error('[boda-musica]', e.message); return json(502, { error: 'no_disponible' }); }
};
