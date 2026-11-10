// Panel privado de «Mi historia»: crear/anular claves y subir las fotos sin censura. Protegido con PERFIL_ADMIN (variable de entorno).
const crypto = require('crypto');
const { sha } = require('./perfil.js');
const BUCKET = 'perfil-privado';
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const fails = new Map();
function cfg() { const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY; if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY'); return { url: url.replace(/\/$/, ''), key }; }
async function sb(path, opt = {}) {
    const { url, key } = cfg();
    const res = await fetch(`${url}${path}`, { ...opt, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
}
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const randCode = () => { const A = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (const n of crypto.randomBytes(10)) s += A[n % A.length]; return s.slice(0, 5) + '-' + s.slice(5); };

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim())) || 'unknown';
    const f = (fails.get(ip) || []).filter((t) => Date.now() - t < 600000);
    if (f.length >= 8) return json(429, { error: 'espera' });
    const admin = process.env.PERFIL_ADMIN;
    if (!admin || admin.length < 8) return json(503, { error: 'sin_configurar' });
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'json' }); }
    if (!same(b.pass || '', admin)) { f.push(Date.now()); fails.set(ip, f); return json(401, { error: 'clave' }); }
    try {
        const a = b.action;
        if (a === 'state' || !a) {
            const claves = await sb('/rest/v1/perfil_claves?select=id,label,active,uses,created_at,last_used&order=id.desc');
            const fotos = await sb('/rest/v1/perfil_fotos?select=id,path,sort&order=sort.asc,id.asc');
            return json(200, { claves, fotos });
        }
        if (a === 'createCode') {
            const code = String(b.code || '').trim() || randCode();
            if (code.length < 4) return json(400, { error: 'corta' });
            await sb('/rest/v1/perfil_claves', { method: 'POST', body: JSON.stringify({ code_hash: sha(code), label: String(b.label || '').slice(0, 80) }) });
            return json(200, { code });   // única vez que se ve la clave
        }
        if (a === 'setActive') { await sb(`/rest/v1/perfil_claves?id=eq.${Number(b.id)}`, { method: 'PATCH', body: JSON.stringify({ active: !!b.active }) }); return json(200, { ok: true }); }
        if (a === 'signUpload') {
            const name = String(b.name || 'foto').toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(-60);
            const path = `${Date.now()}-${name}`;
            const r = await sb(`/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', body: '{}' });
            return json(200, { path, uploadUrl: `${cfg().url}/storage/v1${r.url}` });
        }
        if (a === 'addPhoto') { await sb('/rest/v1/perfil_fotos', { method: 'POST', body: JSON.stringify({ path: String(b.path), sort: Number(b.sort) || 0 }) }); return json(200, { ok: true }); }
        if (a === 'deletePhoto') {
            const rows = await sb(`/rest/v1/perfil_fotos?id=eq.${Number(b.id)}&select=path`);
            if (rows && rows[0]) { await sb(`/storage/v1/object/${BUCKET}/${rows[0].path}`, { method: 'DELETE' }).catch(() => {}); await sb(`/rest/v1/perfil_fotos?id=eq.${Number(b.id)}`, { method: 'DELETE' }); }
            return json(200, { ok: true });
        }
        return json(400, { error: 'accion' });
    } catch (e) { console.error('[perfil-admin]', e.message); return json(502, { error: 'no_disponible' }); }
};
