// «¿Quién eres?»: genera el informe EN EL SERVIDOR y lo manda por correo, sin que la persona tenga que quedarse mirando la pantalla.
// El sufijo «-background» hace que Netlify responda 202 enseguida y deje correr esta función hasta 15 minutos (las funciones normales
// se cortan a ~26 s). Aquí se encadenan los mismos pasos de siempre (eje → 5 partes → cierre → carta + correo) llamando a sus
// funciones en proceso, con reintentos largos si la IA falla. Si todo falla, te llega un aviso con el correo de la persona.
const store = require('./_lib/store');
const { send, esc, isEmail, OWNER, FROM_OWNER } = require('./_lib/qer-email');
const axisFn = require('./qer-generate-map').handler;
const partFn = require('./qer-generate-map-part').handler;
const finalFn = require('./qer-generate-map-finalize').handler;
const leadFn = require('./qer-lead').handler;

const APPS = new Set(['quien-eres']);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function call(handler, body, headers) {
    const r = await handler({ httpMethod: 'POST', headers: headers || {}, body: JSON.stringify(body) });
    let d = {}; try { d = JSON.parse(r.body || '{}'); } catch (_e) { /* cuerpo no JSON */ }
    if (r.statusCode >= 400) throw Object.assign(new Error(d.error || `status ${r.statusCode}`), { status: r.statusCode });
    return d;
}
async function withRetries(fn, tries, pauseMs) {
    let last;
    for (let i = 0; i < tries; i++) {
        try { return await fn(); } catch (e) { last = e; if (i < tries - 1) await sleep(pauseMs * (i + 1)); }
    }
    throw last;
}
const log = async (id, anon, name, meta, app) => { try { await store.logEvent(id, 'anon', anon, name, meta, null, app); } catch (e) { console.error('[qer-start] evento no guardado:', e.message); } };

exports.handler = async (event) => {
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'bad json' }; }
    const email = String(b.email || '').trim().toLowerCase();
    const app = APPS.has(b.app) ? b.app : 'quien-eres';
    const anonId = String(b.anonId || '').slice(0, 80) || ('bg-' + Date.now());
    if (!isEmail(email) || !b.payload || !Array.isArray(b.payload.answers)) return { statusCode: 400, body: 'invalid' };
    const consent = b.consent === true;
    const headers = event.headers || {}; // incluye x-nf-geo (país) para elegir SINPE o PayPal
    const t0 = Date.now();
    await log(anonId, anonId, 'report_queued', { email, answered: b.payload.answers.filter(a => a && a.answer).length }, app);

    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const axis = await withRetries(() => call(axisFn, b.payload, headers), 3, 4000);
            await Promise.all([0, 1, 2, 3, 4].map(part => withRetries(() => call(partFn, { readingId: axis.readingId, part }, headers), 4, 4000)));
            await withRetries(() => call(finalFn, { readingId: axis.readingId }, headers), 3, 3000);
            const lead = await withRetries(() => call(leadFn, { readingId: axis.readingId, email, consent, app, anonId }, headers), 2, 3000);
            await log(anonId, anonId, 'report_bg_done', { seconds: Math.round((Date.now() - t0) / 1000), attempt, ok: !!lead.ok, reason: lead.reason }, app);
            return { statusCode: 200, body: 'ok' };
        } catch (e) {
            lastErr = e;
            console.error(`[qer-start] intento ${attempt + 1}: ${e.message}`);
            await log(anonId, anonId, 'report_bg_error', { attempt, reason: String(e.message).slice(0, 200) }, app);
            await sleep(15000 * (attempt + 1));
        }
    }
    await log(anonId, anonId, 'report_bg_failed', { email, reason: String(lastErr && lastErr.message).slice(0, 200), seconds: Math.round((Date.now() - t0) / 1000) }, app);
    try {
        await send({ from: FROM_OWNER(), to: OWNER(), subject: `[Informe NO generado] ${email}`,
            html: `<p>No se pudo generar el informe de <b>${esc(email)}</b> después de varios intentos (${esc(String(lastErr && lastErr.message).slice(0, 200))}). Pídele que lo intente de nuevo o escríbele.</p>`,
            text: `No se pudo generar el informe de ${email}: ${lastErr && lastErr.message}` });
    } catch (_e) { /* el aviso es un extra */ }
    return { statusCode: 200, body: 'failed' };
};
