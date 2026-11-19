// «Agro»: panel del dueño. Crear códigos (prueba o pago), recargar cuando alguien paga por SINPE, ver el uso y desactivar.
// Se protege con la clave AGRO_ADMIN_KEY (o, si no existe, ADMIN_PASSWORD) en las variables de Netlify.
const crypto = require('crypto');
const { json, sb, ipOf, hashIp, today, contar, Err, newCode, normCode, TRIAL, PACKS, txt } = require('./_lib/agro-core');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const claveOk = (dada) => { const real = process.env.AGRO_ADMIN_KEY || process.env.ADMIN_PASSWORD; return !!real && !!dada && crypto.timingSafeEqual(sha(dada), sha(real)); };
const dias = (n) => new Date(Date.now() + n * 86400000).toISOString();
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    if (!(process.env.AGRO_ADMIN_KEY || process.env.ADMIN_PASSWORD)) return json(503, { error: 'Falta la variable AGRO_ADMIN_KEY en Netlify.' });
    const clave = (event.headers && (event.headers['x-agro-admin'] || event.headers['X-Agro-Admin'])) || '';
    if (!claveOk(clave)) { try { if ((await contar(`ag:adm:${hashIp(ipOf(event))}:${today()}`, 15)) < 0) return json(429, { error: 'Demasiados intentos.' }); } catch (e) {} return json(401, { error: 'Clave incorrecta.' }); }
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    try {
        if (b.accion === 'listar') {
            const rows = await sb('/rest/v1/agro_codigos?select=codigo,nota,tipo,creditos,usados,vence,activo,creado,ultimo_uso,recargas&order=creado.desc&limit=300');
            return json(200, { codigos: rows || [], packs: PACKS, trial: TRIAL });
        }
        if (b.accion === 'crear') {
            const tipo = b.tipo === 'pago' ? 'pago' : 'prueba';
            const creditos = Math.round(Number(b.creditos)), nd = Number(b.dias);
            if (!(creditos >= 1 && creditos <= 5000)) throw new Err('Créditos: entre 1 y 5000.');
            if (!(nd > 0 && nd <= 1000)) throw new Err('Días de vigencia: entre 0,04 y 1000.');
            let codigo = newCode(); for (let i = 0; i < 3; i++) { const ex = await sb(`/rest/v1/agro_codigos?codigo=eq.${codigo}&select=codigo`); if (!ex || !ex.length) break; codigo = newCode(); }
            await sb('/rest/v1/agro_codigos', { method: 'POST', body: JSON.stringify({ codigo, nota: txt(b.nota, 120), tipo, creditos, vence: dias(nd) }) });
            return json(200, { ok: true, codigo, creditos, vence: dias(nd) });
        }
        if (b.accion === 'recargar') {
            const codigo = normCode(b.codigo), creditos = Math.round(Number(b.creditos)), nd = Number(b.dias);
            if (!codigo) throw new Err('Código inválido.'); if (!(creditos >= 1 && creditos <= 5000)) throw new Err('Créditos: entre 1 y 5000.'); if (!(nd > 0 && nd <= 1000)) throw new Err('Días: entre 0,04 y 1000.');
            const rows = await sb(`/rest/v1/agro_codigos?codigo=eq.${codigo}&select=creditos,usados,vence,recargas`); const c = rows && rows[0]; if (!c) throw new Err('Ese código no existe.', 404);
            // Lo que le sobraba NO se pierde: se suman los créditos nuevos a los que le quedaban y se renueva la vigencia.
            const nuevoVence = new Date(Math.max(Date.now() + nd * 86400000, c.vence ? new Date(c.vence).getTime() : 0)).toISOString();
            await sb(`/rest/v1/agro_codigos?codigo=eq.${codigo}`, { method: 'PATCH', body: JSON.stringify({ creditos: c.creditos + creditos, vence: nuevoVence, activo: true, tipo: 'pago', recargas: (c.recargas || 0) + 1 }) });
            return json(200, { ok: true, codigo, restantes: c.creditos + creditos - c.usados, vence: nuevoVence });
        }
        if (b.accion === 'activar' || b.accion === 'desactivar') {
            const codigo = normCode(b.codigo); if (!codigo) throw new Err('Código inválido.');
            await sb(`/rest/v1/agro_codigos?codigo=eq.${codigo}`, { method: 'PATCH', body: JSON.stringify({ activo: b.accion === 'activar' }) }); return json(200, { ok: true });
        }
        throw new Err('Acción desconocida.');
    } catch (e) { if (e instanceof Err) return json(e.status, { error: e.message }); console.error('[agro-admin]', e.message); return json(502, { error: 'No se pudo completar: ' + e.message.slice(0, 160) }); }
};
