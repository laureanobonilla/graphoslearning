// Total real recaudado en una página de aportes (suma de pay_completed), para la barra de metas.
// Solo devuelve el total y la cantidad de aportes: ningún dato de quién aportó.
const store = require('./_lib/store');
const core = require('./_lib/apoyo-core');

exports.handler = async (event) => {
    const app = core.cleanApp((event.queryStringParameters || {}).app);
    if (!app) return core.json(400, { error: 'Página inválida' });
    try {
        const rows = await store.table(`events?app=eq.${encodeURIComponent(app)}&event_name=eq.pay_completed&select=metadata&limit=10000`);
        const cur = core.currencyOf(app);
        let total = 0, count = 0;
        (rows || []).forEach((r) => {
            const m = r.metadata || {};
            const v = Number(m.amount);
            if (isFinite(v) && v > 0 && (!m.currency || m.currency === cur)) { total += v; count++; }
        });
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
            body: JSON.stringify({ total: Math.round(total * 100) / 100, count, currency: cur })
        };
    } catch (err) {
        console.error('[apoyo-progress]', err.message);
        return core.json(502, { error: 'No se pudo leer el progreso' });
    }
};
