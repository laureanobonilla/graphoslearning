// La Pulpe: récords.
// GET  ?modo=semana|temporada → { top: [mejor puntaje por persona, 50], mio: { puntaje, puesto } }
// POST { modo, puntaje, dias, nombre, barrio, resumen } → guarda un récord (con sesión).
// El juego corre en el navegador, así que el servidor solo pone topes de lo posible para frenar trampas burdas.
const core = require('./_lib/pulpe-core');
const MODOS = { semana: 7, temporada: 30 };
const BARRIOS = ['barrio', 'puerto', 'playa'];
// Tope de patrimonio alcanzable (colones): muy holgado para el juego honesto, imposible a mano.
const TOPE = (dias) => 60000 + dias * 900000;

exports.handler = async (event, context) => {
    try {
        if (event.httpMethod === 'GET') {
            const modo = MODOS[(event.queryStringParameters || {}).modo] ? event.queryStringParameters.modo : 'semana';
            const rows = await core.q(`pulpe_scores?modo=eq.${modo}&select=user_id,nombre,barrio,puntaje,dias,created_at&order=puntaje.desc&limit=400`) || [];
            const seen = new Set(), top = [];
            rows.forEach(r => { if (seen.has(r.user_id) || top.length >= 50) return; seen.add(r.user_id); top.push({ nombre: r.nombre, barrio: r.barrio, puntaje: Number(r.puntaje), dias: r.dias, fecha: r.created_at, uid: r.user_id }); });
            const user = core.getUser(context); let mio = null;
            if (user) {
                const m = await core.q(`pulpe_scores?modo=eq.${modo}&user_id=eq.${encodeURIComponent(user.id)}&select=puntaje&order=puntaje.desc&limit=1`);
                if (m && m[0]) {
                    const best = Number(m[0].puntaje);
                    const above = await core.q(`pulpe_scores?modo=eq.${modo}&puntaje=gt.${best}&select=user_id&limit=5000`) || [];
                    mio = { puntaje: best, puesto: new Set(above.map(r => r.user_id).filter(id => id !== user.id)).size + 1 };
                }
            }
            return core.json(200, { modo, top: top.map(({ uid, ...r }) => ({ ...r, yo: !!(user && uid === user.id) })), mio });
        }
        if (event.httpMethod === 'POST') {
            const user = core.requireUser(context);
            if (!user) return core.json(401, { error: 'Inicia sesión para guardar tu récord.' });
            let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
            const modo = MODOS[b.modo] ? b.modo : null, dias = Math.round(Number(b.dias) || 0), puntaje = Math.round(Number(b.puntaje) || 0);
            if (!modo || dias !== MODOS[modo]) return core.json(400, { error: 'Récord inválido' });
            if (!(puntaje > 0) || puntaje > TOPE(dias)) { await core.evento(user, 'srv_record_rechazado', { modo, puntaje }); return core.json(400, { error: 'Ese puntaje no es posible.' }); }
            if (modo === 'temporada') { const a = await core.getAccess(user); if (!a.active) return core.json(402, { error: 'La temporada completa es parte del pase.' }); }
            // Freno simple: máximo 20 récords por día por cuenta.
            const desde = new Date(Date.now() - 86400000).toISOString();
            const hoy = await core.q(`pulpe_scores?user_id=eq.${encodeURIComponent(user.id)}&created_at=gte.${desde}&select=id&limit=25`) || [];
            if (hoy.length >= 20) return core.json(429, { error: 'Muchos récords por hoy. Sigue mañana.' });
            const nombre = core.scrubOne(b.nombre, 40) || 'Pulpería sin nombre';
            const barrio = BARRIOS.includes(b.barrio) ? b.barrio : 'barrio';
            const r = (b.resumen && typeof b.resumen === 'object') ? b.resumen : {}, num = (v) => Math.max(0, Math.min(1e10, Math.round(Number(v) || 0)));
            const resumen = { ventas: num(r.ventas), clientes: num(r.clientes), fiadoPerdido: num(r.fiadoPerdido), mejoras: num(r.mejoras), reputacion: num(r.reputacion) };
            await core.q('pulpe_scores', { method: 'POST', body: { user_id: user.id, nombre, barrio, modo, puntaje, dias, resumen }, prefer: 'return=minimal' });
            await core.evento(user, 'srv_record', { modo, puntaje, barrio });
            return core.json(200, { ok: true });
        }
        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (e) {
        console.error('[pulpe-score]', e.message);
        if (core.faltaTabla(e)) return core.json(503, { error: core.MSG_FALTA_TABLA });
        return core.json(502, { error: 'No se pudieron cargar los récords.' });
    }
};
