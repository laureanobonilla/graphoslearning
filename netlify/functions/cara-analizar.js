// «¿Tienes cara de culo?»: recibe la foto (base64, ya reducida en el navegador) y devuelve la respuesta.
// La foto vive en memoria durante esta llamada y se descarta: no va a Cloudinary, ni a Supabase, ni a los registros.
// REGLA: la respuesta (SÍ/NO) es al azar, así que NUNCA se le niega a nadie por una falla de la IA:
//   1) la IA mira la foto y escribe el porqué;  2) si falla, lo escribe sin la foto;  3) si también falla, se usa un informe ya escrito.
const core = require('./_lib/cara-core');
const { generateWithRetries } = require('./_lib/qer-gemini');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const t0 = Date.now();
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido', codigo: 'json' }); }
    const jobId = String(b.jobId || ''), img = String(b.image || '');
    if (!core.UUID_RE.test(jobId)) return core.json(400, { error: 'Solicitud inválida', codigo: 'id' });
    if (!/^[A-Za-z0-9+/=]{2000,}$/.test(img) || img.length > core.MAX_IMG_CHARS) return core.json(400, { error: 'No pudimos leer esa foto. Prueba con otra.', codigo: 'foto_invalida' });

    const ipHash = core.hashIp(core.ipOf(event)), country = core.countryOf(event) || null;
    try {
        if (await core.countToday(ipHash) >= core.MAX_PER_DAY) return core.json(429, { error: 'El laboratorio necesita descansar. Vuelve mañana para analizar más caras.', codigo: 'limite' });
    } catch (e) { console.error('[cara-analizar] conteo', e.message); }   // si falla el conteo, se sigue

    const si = core.sortear();
    let r = null, fuente = 'foto', fallaIA = null;

    // 1) Con la foto
    try {
        const parts = [{ inlineData: { mimeType: 'image/jpeg', data: img } }, { text: core.PROMPT(si) }];
        const d = await generateWithRetries([{ role: 'user', parts }], core.SCHEMA, core.valido, { tag: 'cara-foto', maxOutputTokens: 1600, deadline: t0 + 14000, attemptMs: 10000 });
        const sf = d.safety || {};
        if (sf.appearsUnder18) return core.json(422, { error: 'Esta app es solo para mayores de 18. Prueba con la foto de un adulto.', codigo: 'menor' });
        if (sf.explicit) return core.json(422, { error: 'Esa foto no la podemos analizar. Prueba con una selfie normal.', codigo: 'explicita' });
        if (sf.notAPerson) return core.json(422, { error: 'No encontramos ninguna cara en esa foto. Prueba con una selfie de frente.', codigo: 'sin_cara' });
        r = core.normalizar(d);
    } catch (e) { fallaIA = e.message; console.error('[cara-analizar] IA con foto falló:', e.message); }

    // 2) Sin la foto (la IA a veces se niega a bromear sobre una persona real, o tarda demasiado)
    if (!r) {
        try {
            const d = await generateWithRetries(core.PROMPT_SIN_FOTO(si), core.SCHEMA, core.valido, { tag: 'cara-texto', maxOutputTokens: 1400, deadline: t0 + 23000, attemptMs: 8000 });
            r = core.normalizar(d); fuente = 'texto';
        } catch (e) { console.error('[cara-analizar] IA sin foto falló:', e.message); }
    }
    // 3) Informe ya escrito
    if (!r) { r = core.plantilla(si); fuente = 'plantilla'; }

    const job = { id: jobId, anon_id: String(b.anonId || '').slice(0, 64) || null, country, ip_hash: ipHash, ref: String(b.ref || '').replace(/[^\w.-]/g, '').slice(0, 40) || null, veredicto: si ? 'si' : 'no', certeza: r.certeza, informe: Object.assign({}, r.informe, { fuente, fallaIA: fallaIA ? String(fallaIA).slice(0, 200) : undefined }) };
    try { await core.saveJob(job); }
    catch (e) {
        // Sin base de datos no se puede cobrar después, pero la persona igual ve su respuesta (sin ofrecerle pagar).
        console.error('[cara-analizar] no se pudo guardar', e.message);
        return core.json(200, Object.assign(core.vistaGratis(job), { pagable: false, fuente }));
    }
    return core.json(200, Object.assign(core.vistaGratis(job), { fuente }));
};
