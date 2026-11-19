// «Agro»: ¿cuántos créditos le quedan a este código? (no gasta ninguno)
const { json, normCode, estadoDe, falloDeCodigo, MOTIVOS } = require('./_lib/agro-core');
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Solicitud inválida' }); }
    const codigo = normCode(b.codigo); if (!codigo) { if (await falloDeCodigo(event)) return json(429, { error: 'Demasiados intentos. Intente más tarde o escríbame.' }); return json(404, { motivo: 'no_existe', error: MOTIVOS.no_existe }); }
    try {
        const e = await estadoDe(codigo);
        if (!e) { if (await falloDeCodigo(event)) return json(429, { error: 'Demasiados intentos. Intente más tarde o escríbame.' }); return json(404, { motivo: 'no_existe', error: MOTIVOS.no_existe }); }
        return json(200, { codigo, ...e });
    } catch (err) { console.error('[agro-estado]', err.message); return json(502, { error: 'No se pudo revisar el código. Intente de nuevo.' }); }
};
