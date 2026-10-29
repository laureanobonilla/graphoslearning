// «¿Quién eres? — sesión»: genera el retrato EN SEGUNDO PLANO. El sufijo «-background» hace que Netlify responda 202 enseguida y deje
// correr la función hasta 15 minutos (las normales se cortan a ~26 s y con 30 respuestas no alcanzaba). La pantalla pregunta por el
// resultado con la acción «get» de ses.js: 404 = todavía escribiéndose, {failed:true} = no se pudo.
const { getReading, saveReading } = require('./_lib/qer-readings-store');
const store = require('./_lib/store');
const S = require('./_lib/ses-core');
const { makePortrait } = require('./_lib/ses-portrait');
const cleanAnon = (a) => { const s = String(a || '').slice(0, 64); return /^[\w-]{8,64}$/.test(s) ? s : ''; };

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'JSON inválido' }; }
    const anon = cleanAnon(body.anonId), id = String(body.id || ''), lang = S.langOf(body.lang), items = S.sanitize(body.answers);
    if (!anon || !S.ID_RE.test(id) || items.length < 5) return { statusCode: 400, body: 'solicitud' };
    const log = async (ev, md) => { try { await store.logEvent(anon, 'anon', anon, ev, md || {}, null, 'quien-eres-sesion'); } catch (_e) { /* no crítico */ } };
    try {
        if (await getReading(id)) return { statusCode: 202, body: '' };   // ya existe (reintento): no se genera dos veces
        const { crisis, ms, r } = await makePortrait(items, lang, { id, budgetMs: 150000, attemptMs: 50000 });
        await log('ses_portrait_ready', { id, free: crisis, n: items.length, ms, bg: 1 });
        if (crisis) await log('ses_crisis', { n: items.length, where: 'portrait' });
        void r;
    } catch (err) {
        console.error('[ses-portrait-background]', err.message);
        try { await saveReading(id, { ses: true, id, failed: true, created: Date.now() }); } catch (_e) { /* ok */ }
        await log('ses_portrait_error', { action: 'portrait', why: String(err.message).slice(0, 100), n: items.length, bg: 1 });
    }
    return { statusCode: 202, body: '' };
};
