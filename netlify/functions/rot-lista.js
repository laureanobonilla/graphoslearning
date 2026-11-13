// «Rótulo»: lista de espera de la versión sin marca de agua (mide cuánta gente pagaría antes de construir el cobro).
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const isEmail = (s) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s);
const hits = new Map();
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const email = String(b.email || '').trim().toLowerCase(); if (!isEmail(email)) return json(400, { error: 'Escribe un correo válido.' });
    const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || '')) || 'x', now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 3600e3); h.push(now); hits.set(ip, h); if (h.length > 8) return json(429, { error: 'Demasiados intentos.' });
    const plan = ['mensual', 'paquete', 'otro'].includes(b.plan) ? b.plan : 'mensual', url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    try {
        const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rot_lista?on_conflict=email`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ email, plan }) });
        if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + (await r.text()).slice(0, 150));
        return json(200, { ok: true });
    } catch (e) { console.error('[rot-lista]', e.message); return json(502, { error: 'No se pudo guardar. Intenta de nuevo.' }); }
};
