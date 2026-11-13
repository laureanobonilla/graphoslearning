// «Rótulo»: dice si un código sirve y cuántos videos le quedan.
const { json, ipOf, estado, normCode } = require('./_lib/rot-core');
const hits = new Map();
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const ip = ipOf(event), now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 3600e3); h.push(now); hits.set(ip, h); if (h.length > 30) return json(429, { error: 'Demasiados intentos. Espera un rato.' });
    try { const e = await estado(normCode(b.codigo)); if (!e) return json(404, { error: 'No encontré ese código. Revisa que esté completo (ROT-XXXX-XXXX).' }); if (e.vencido) return json(410, { error: 'Ese código ya venció.' }); return json(200, e); }
    catch (e) { console.error('[rot-codigo]', e.message); return json(502, { error: 'No se pudo revisar el código. Intenta de nuevo.' }); }
};
