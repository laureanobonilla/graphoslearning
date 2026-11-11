// «Licitaciones»: crea el trabajo y entrega un enlace temporal para subir el PDF directo al almacenamiento privado (sin pasar por la función).
const crypto = require('crypto');
const { json, ipOf, hashIp, countryOf, sb, cfg, MAX_PDF, PREVIEWS_PER_IP_HOUR, DAILY_MAX, clip } = require('./_lib/lic-core');
const isEmail = (s) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s);
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const size = Number(b.size), name = clip(b.filename, 120) || 'cartel.pdf';
    if (!/\.pdf$/i.test(name)) return json(400, { error: 'El archivo debe ser un PDF.' });
    if (!Number.isFinite(size) || size < 1000) return json(400, { error: 'El PDF parece estar vacío.' });
    if (size > MAX_PDF) return json(400, { error: `El PDF pesa más de ${Math.floor(MAX_PDF / 1048576)} MB. Comprímelo o sube solo las secciones principales del cartel.` });
    const email = isEmail(String(b.email || '').trim()) ? String(b.email).trim().toLowerCase() : null;
    try {
        const ipH = hashIp(ipOf(event)), since = new Date(Date.now() - 3600e3).toISOString(), day = new Date(Date.now() - 864e5).toISOString();
        const mine = await sb(`/rest/v1/lic_jobs?select=id&ip_hash=eq.${ipH}&created_at=gte.${since}&limit=${PREVIEWS_PER_IP_HOUR + 1}`);
        if (mine.length >= PREVIEWS_PER_IP_HOUR) return json(429, { error: 'Has analizado varios carteles seguidos. Espera un rato e inténtalo de nuevo.' });
        const today = await sb(`/rest/v1/lic_jobs?select=id&created_at=gte.${day}&limit=${DAILY_MAX + 1}`);
        if (today.length >= DAILY_MAX) return json(503, { error: 'Hoy hay mucha demanda y ya no puedo analizar más carteles gratis. Vuelve mañana.' });
        const id = crypto.randomUUID(), path = `${id}.pdf`;
        await sb('/rest/v1/lic_jobs', { method: 'POST', body: JSON.stringify({ id, filename: name, path, size_bytes: size, ip_hash: ipH, country: countryOf(event) || null, email }) });
        const r = await sb(`/storage/v1/object/upload/sign/licitaciones/${path}`, { method: 'POST', body: '{}' });
        return json(200, { id, uploadUrl: `${cfg().url}/storage/v1${r.url}` });
    } catch (e) { console.error('[lic-init]', e.message); return json(502, { error: 'No se pudo preparar la subida. Intenta de nuevo.' }); }
};
