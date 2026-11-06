// Pendientes de la boda de Kari y Lau. La lista vive en Supabase (tabla boda_tareas); el navegador nunca ve claves.
// Cada cambio es una operación sobre UNA tarea (no se reescribe toda la lista), así Kari y Lau no se pisan entre sí.
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const WHO = ['Ambos', 'Kari', 'Lau'];
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, n);
const hits = new Map();
function limited(ip) { const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 60000); h.push(now); hits.set(ip, h); if (hits.size > 500) for (const [k, v] of hits) if (now - v[v.length - 1] > 60000) hits.delete(k); return h.length > 60; }

async function sb(path, opt = {}) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, { ...opt, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
}
const COLS = 'id,title,assignee,notes,completed';
const list = () => sb(`boda_tareas?select=${COLS}&order=id.asc`);   // los ids crecen con el tiempo: queda el orden de creación

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'json' }); }
    const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim())) || 'unknown';
    if (limited(ip)) return json(429, { error: 'demasiadas' });
    try {
        const a = String(b.action || ''), id = Number(b.id);
        if (a === 'list') return json(200, { tasks: await list() });
        if (a === 'add' || a === 'update') {
            const title = clean(b.title, 300), assignee = WHO.includes(b.assignee) ? b.assignee : 'Ambos', notes = clean(b.notes, 600);
            if (title.length < 2) return json(400, { error: 'titulo' });
            if (a === 'add') await sb('boda_tareas', { method: 'POST', body: JSON.stringify({ id: Date.now(), title, assignee, notes, completed: false }) });
            else { if (!Number.isSafeInteger(id)) return json(400, { error: 'id' }); await sb(`boda_tareas?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ title, assignee, notes, updated_at: new Date().toISOString() }) }); }
            return json(200, { tasks: await list() });
        }
        if (a === 'toggle') {
            if (!Number.isSafeInteger(id) || typeof b.completed !== 'boolean') return json(400, { error: 'solicitud' });
            await sb(`boda_tareas?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ completed: b.completed, updated_at: new Date().toISOString() }) });
            return json(200, { tasks: await list() });
        }
        if (a === 'delete') {
            if (!Number.isSafeInteger(id)) return json(400, { error: 'id' });
            await sb(`boda_tareas?id=eq.${id}`, { method: 'DELETE' });
            return json(200, { tasks: await list() });
        }
        return json(400, { error: 'accion' });
    } catch (e) { console.error('[boda]', e.message); return json(502, { error: 'no_disponible' }); }
};
