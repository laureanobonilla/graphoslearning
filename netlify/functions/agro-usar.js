// «Agro»: hace UN cálculo y gasta UN crédito. Primero valida los datos (si están mal no se cobra nada), luego gasta el crédito
// de forma atómica y solo entonces entrega el resultado. Si el servidor falla después de gastarlo, el crédito se devuelve.
const { json, Err, normCode, HERRAMIENTAS, CALC, MOTIVOS, estadoDe, falloDeCodigo, sb } = require('./_lib/agro-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const herr = HERRAMIENTAS.includes(b.herramienta) ? b.herramienta : null; if (!herr) return json(400, { error: 'Herramienta desconocida.' });
    const codigo = normCode(b.codigo);
    if (!codigo) { if (await falloDeCodigo(event)) return json(429, { error: 'Demasiados intentos. Intente más tarde o escríbame.' }); return json(404, { motivo: 'no_existe', error: MOTIVOS.no_existe }); }
    let resultado;
    try { resultado = CALC[herr](b.datos && typeof b.datos === 'object' ? b.datos : {}); }
    catch (e) { if (e instanceof Err) return json(e.status, { error: e.message }); console.error('[agro-usar] calc', e); return json(400, { error: 'No se pudo calcular con esos datos.' }); }
    let r;
    try { r = Number(await sb('/rest/v1/rpc/agro_gastar', { method: 'POST', body: JSON.stringify({ p_codigo: codigo, p_herramienta: herr }) })); }
    catch (e) { console.error('[agro-usar] gastar', e.message); return json(502, { error: 'No se pudo revisar el código. Intente de nuevo; no se le cobró nada.' }); }
    if (r < 0) {
        const motivo = r === -2 ? 'vencido' : r === -3 ? 'sin_creditos' : r === -4 ? 'demasiado_uso' : 'no_existe';
        if (motivo === 'no_existe' && await falloDeCodigo(event)) return json(429, { error: 'Demasiados intentos. Intente más tarde o escríbame.' });
        return json(r === -1 ? 404 : 402, { motivo, error: MOTIVOS[motivo] });
    }
    let estado = null; try { estado = await estadoDe(codigo); } catch (e) { /* el resultado ya está pagado: se entrega igual */ }
    const ilim = estado ? !!estado.ilimitado : r === 999999;
    return json(200, { resultado, ilimitado: ilim, restantes: ilim ? null : r, vence: estado ? estado.vence : null, creditos: estado ? estado.creditos : null });
};
