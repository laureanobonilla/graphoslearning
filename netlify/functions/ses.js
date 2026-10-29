// «¿Quién eres? — sesión»: siguiente pregunta (con tarjeta), retrato con bloqueo en el servidor, recuperar y registrar el embudo.
// Nada del retrato bloqueado sale de aquí hasta que el pago se confirme (ver ses-pay-capture.js) o la persona hable de dolor (gratis).
const crypto = require('crypto');
const { generateWithRetries } = require('./_lib/qer-gemini');
const { saveReading, getReading } = require('./_lib/qer-readings-store');
const store = require('./_lib/store');
const S = require('./_lib/ses-core');
const { makePortrait } = require('./_lib/ses-portrait');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

const WIN = 10 * 60 * 1000, hits = new Map();
function limited(key, max) { const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < WIN); h.push(now); hits.set(key, h); if (hits.size > 800) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > WIN) hits.delete(k); return h.length > max; }
const EVENTS = new Set(['ses_landing', 'ses_start', 'ses_answer', 'ses_card_shown', 'ses_wait', 'ses_mic_opened', 'ses_mic_used', 'ses_mic_unsupported', 'ses_crisis', 'ses_portrait_requested', 'ses_portrait_ready', 'ses_portrait_shown', 'ses_mic_error', 'ses_portrait_error', 'ses_paywall_seen', 'ses_continue_clicked', 'ses_paypal_ready', 'ses_paypal_error', 'ses_paid_client', 'ses_wa_clicked', 'ses_unlock_try', 'ses_resumed', 'ses_copied', 'ses_shared']);
const cleanAnon = (a) => { const s = String(a || '').slice(0, 64); return /^[\w-]{8,64}$/.test(s) ? s : ''; };

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const anon = cleanAnon(body.anonId); if (!anon) return json(400, { error: 'solicitud' });
    const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim())) || 'unknown';
    const log = async (ev, md) => { try { await store.logEvent(anon, 'anon', anon, ev, md || {}, null, 'quien-eres-sesion'); } catch (_e) { /* no crítico */ } };
    const a = String(body.action || '');
    const lang = S.langOf(body.lang);
    try {
        if (a === 'track') {
            const name = String(body.event || ''); if (!EVENTS.has(name)) return json(400, { error: 'evento' });
            let md = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
            if (JSON.stringify(md).length > 1200) md = { truncated: true };
            try { const h = event.headers || {}; const raw = h['x-nf-geo'] || h['X-Nf-Geo']; const code = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))?.country?.code : null; if (code && /^[A-Za-z]{2}$/.test(code)) md = { ...md, country: String(code).toUpperCase() }; } catch (_e) { /* extra */ }
            await log(name, md); return json(200, { ok: true });
        }
        if (a === 'next') {
            if (limited(ip + 'n', 60)) return json(429, { error: 'demasiadas' });
            const items = S.sanitize(body.answers); if (items.length < 2) return json(400, { error: 'pocas_respuestas' });
            const crisisNow = S.hasCrisis(items);
            const t0 = Date.now();
            const d = await generateWithRetries(S.nextPrompt(items, lang, S.cleanAvoid(body.avoid)), S.NEXT_SCHEMA, (x) => x && typeof x.card === 'string' && x.card.trim() && typeof x.question === 'string' && x.question.trim() && typeof x.crisis === 'boolean', { tag: 'ses-next', maxOutputTokens: 500, deadline: t0 + 22000, attemptMs: 9000 });
            const crisis = d.crisis === true || crisisNow;
            if (crisis) await log('ses_crisis', { n: items.length, where: 'next' });
            return json(200, { card: String(d.card).trim().slice(0, 320), question: String(d.question).trim().slice(0, 260), placeholder: String(d.placeholder || '').trim().slice(0, 80), crisis, ms: Date.now() - t0 });
        }
        if (a === 'portrait') {
            if (limited(ip + 'p', 8)) return json(429, { error: 'demasiadas' });
            const items = S.sanitize(body.answers); if (items.length < 5) return json(400, { error: 'pocas_respuestas' });
            const { r, crisis, ms } = await makePortrait(items, lang);
            await log('ses_portrait_ready', 'ses_portrait_shown', 'ses_mic_error', { id: r.id, free: crisis, n: items.length, ms });
            if (crisis) await log('ses_crisis', { n: items.length, where: 'portrait' });
            return json(200, { crisis, ...S.view(r, false) });
        }
        if (a === 'get') {
            const id = String(body.id || ''); if (!S.ID_RE.test(id)) return json(400, { error: 'id' });
            const r = await getReading(id); if (!r || !r.ses) return json(404, { error: 'no_disponible' });
            if (r.failed) return json(200, { failed: true });
            await log('ses_resumed', { id, paid: !!r.paid });
            return json(200, S.view(r, !!r.paid));
        }
        if (a === 'unlock') {
            if (limited(ip + 'u', 12)) return json(429, { error: 'demasiadas' });
            const id = String(body.id || ''); if (!S.ID_RE.test(id)) return json(400, { error: 'id' });
            if (!process.env.SES_UNLOCK_SECRET) return json(503, { error: 'sin_configurar' });
            const r = await getReading(id); if (!r || !r.ses || r.failed) return json(404, { error: 'no_disponible' });
            if (!S.codeMatches(id, body.code)) { await log('ses_unlock_bad', { id }); return json(403, { error: 'contrasena' }); }
            await log('ses_unlocked', { id });
            return json(200, S.view(r, true));
        }
        return json(400, { error: 'accion' });
    } catch (err) {
        console.error('[ses]', a, err.message);
        await log(a === 'portrait' ? 'ses_portrait_error' : 'ses_error', { action: a, why: String(err.message).slice(0, 100) });
        return json(502, { error: 'no_disponible' });
    }
};
