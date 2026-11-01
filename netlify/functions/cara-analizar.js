// «¿De qué tienes cara?»: recibe la foto (base64, ya reducida en el navegador), la manda a la IA y guarda SOLO el texto.
// La foto vive en memoria durante esta llamada y se descarta: no va a Cloudinary, ni a Supabase, ni a los registros.
const core = require('./_lib/cara-core');
const { generateWithRetries } = require('./_lib/qer-gemini');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const t0 = Date.now();
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return core.json(400, { error: 'JSON inválido' }); }
    const jobId = String(b.jobId || ''), img = String(b.image || '');
    if (!core.UUID_RE.test(jobId)) return core.json(400, { error: 'Solicitud inválida' });
    if (!/^[A-Za-z0-9+/=]{2000,}$/.test(img) || img.length > core.MAX_IMG_CHARS) return core.json(400, { error: 'No pudimos leer esa foto. Prueba con otra.' });

    const ipHash = core.hashIp(core.ipOf(event)), country = core.countryOf(event) || null;
    try {
        if (await core.countToday(ipHash) >= core.MAX_PER_DAY) return core.json(429, { error: 'El laboratorio necesita descansar. Vuelve mañana para analizar más caras.' });
    } catch (e) { console.error('[cara-analizar] conteo', e.message); }   // si falla el conteo, se sigue

    try {
        const parts = [{ inlineData: { mimeType: 'image/jpeg', data: img } }, { text: core.PROMPT }];
        const d = await generateWithRetries([{ role: 'user', parts }], core.SCHEMA, core.valido, { tag: 'cara', maxOutputTokens: 1600, deadline: t0 + 24000, attemptMs: 15000 });
        const sf = d.safety || {};
        if (sf.appearsUnder18) return core.json(422, { error: 'Esta app es solo para mayores de 18. Prueba con la foto de un adulto.', motivo: 'menor' });
        if (sf.explicit) return core.json(422, { error: 'Esa foto no la podemos analizar. Prueba con una selfie normal.', motivo: 'explicita' });
        if (sf.notAPerson) return core.json(422, { error: 'No encontramos ninguna cara en esa foto. Prueba con una selfie de frente.', motivo: 'sin_cara' });
        const r = core.normalizar(d);
        const job = { id: jobId, anon_id: String(b.anonId || '').slice(0, 64) || null, country, ip_hash: ipHash, ref: String(b.ref || '').replace(/[^\w.-]/g, '').slice(0, 40) || null, veredicto: r.veredicto, certeza: r.certeza, informe: r.informe };
        await core.saveJob(job);
        return core.json(200, core.vistaGratis(job));
    } catch (e) {
        console.error('[cara-analizar]', e.message);
        return core.json(502, { error: 'El laboratorio se trabó un momento. Inténtalo otra vez.' });
    }
};
