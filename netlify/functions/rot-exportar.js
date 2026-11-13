// «Rótulo»: autoriza la descarga de UN video y descuenta un video de la cuenta. Sin sesión y sin saldo no hay descarga.
const { json, userOf, gastarCuenta, ipOf } = require('./_lib/rot-core');
const hits = new Map();
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const u = userOf(context); if (!u) return json(401, { error: 'Entra a tu cuenta para descargar.', registro: true });
    const k = u.id, now = Date.now(), h = (hits.get(k) || []).filter((t) => now - t < 3600e3); h.push(now); hits.set(k, h); if (h.length > 60) return json(429, { error: 'Demasiados intentos. Espera un rato.' });
    try { const left = await gastarCuenta(u); if (left < 0) return json(402, { error: 'No tienes videos disponibles. Elige un plan para descargar.', sinSaldo: true }); return json(200, { ok: true, restantes: left }); }
    catch (x) { console.error('[rot-exportar]', x.message); return json(502, { error: 'No se pudo autorizar la descarga. Intenta de nuevo.' }); }
};
