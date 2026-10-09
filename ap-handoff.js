// «aprender» → Graphikosmos: entrega el texto (o, si no hubo, solo el tema) que la persona preparó en /aprender/.
// GET ?sid=<uuid>. El código es un UUID que solo conoce esa persona; no devuelve nada más que su propio texto.
const { UUID_RE, json, scrubOne } = require('./_lib/hf-core');
const { getText, claim, getAnswers } = require('./_lib/ap-core');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };
    const sid = String((event.queryStringParameters || {}).sid || '');
    if (!UUID_RE.test(sid)) return json(400, { error: 'Código inválido' });
    try {
        const row = await getText(sid);
        if (row && row.text) { const first = !row.claimed_at; if (first) await claim(sid); return json(200, { ok: true, title: row.title || '', text: row.text, style: row.style || '', first }); }
        const a = await getAnswers(sid);
        const tema = a ? scrubOne(a.tema, 200) : '';
        if (tema) return json(200, { ok: true, title: tema, text: '', topic: tema, first: true });
        return json(404, { error: 'No encontrado' });
    } catch (e) { console.error('[ap-handoff]', e.message); return json(404, { error: 'No encontrado' }); }
};
