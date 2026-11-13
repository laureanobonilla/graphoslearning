// «Rótulo»: autoriza la descarga de UN video y descuenta un crédito del código. Sin código válido con saldo no hay descarga.
const { json, estado, gastar, normCode, ipOf } = require('./_lib/rot-core');
const hits = new Map();
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const ip = ipOf(event), now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 3600e3); h.push(now); hits.set(ip, h); if (h.length > 60) return json(429, { error: 'Demasiados intentos. Espera un rato.' });
    const codigo = normCode(b.codigo);
    try {
        const e = await estado(codigo); if (!e) return json(402, { error: 'Código no válido.' }); if (!e.ok) return json(402, { error: e.vencido ? 'Tu código ya venció.' : 'A tu código ya no le quedan videos.' });
        const left = await gastar(codigo); if (left < 0) return json(402, { error: 'A tu código ya no le quedan videos.' });
        return json(200, { ok: true, restantes: left });
    } catch (x) { console.error('[rot-exportar]', x.message); return json(502, { error: 'No se pudo autorizar la descarga. Intenta de nuevo.' }); }
};
