// «Rótulo»: estado de la cuenta (videos disponibles y cuántos gratis le quedan hoy).
const { json, userOf, cuenta, FREE_DAILY, today, sb } = require('./_lib/rot-core');
exports.handler = async (event, context) => {
    const u = userOf(context); if (!u) return json(200, { logueado: false });
    try {
        const c = await cuenta(u), r = await sb(`/rest/v1/rot_limites?clave=eq.${encodeURIComponent('u:' + u.id + ':' + today())}&select=n`);
        return json(200, { logueado: true, email: u.email, restantes: c.restantes, vence: c.vence, gratisHoy: Math.max(0, FREE_DAILY - ((r && r[0] && r[0].n) || 0)) });
    } catch (e) { console.error('[rot-cuenta]', e.message); return json(502, { error: 'No se pudo leer tu cuenta.' }); }
};
