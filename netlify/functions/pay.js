// Compra de gemas con enlaces de PayPal y URL de retorno con ficha (?pago=FICHA).
//
// Flujo:
//  1. La app llama action:'intent' {packageId, from} con la sesión iniciada: se registra una "intención de
//     compra" de ESA cuenta (evento pay_intent con un id único) y se devuelve el enlace de PayPal.
//  2. Al pagar, PayPal devuelve a la persona a /?pago=FICHA. La app llama action:'claim' {token}.
//  3. Aquí se identifica el paquete por la ficha y se acredita UNA vez por intención (payments.order_id es
//     clave primaria: credit_nodes no suma dos veces el mismo "rd:<intención>"). Sin intención reciente de ese
//     mismo paquete no se acredita nada: quien solo conozca una URL de retorno no consigue gemas.
// Límite que se acepta por ahora: la ficha NO prueba que PayPal cobrara. Cada acreditación queda como evento
// payment_success (con correo e intención) para cuadrarla contra los cobros de PayPal.
const crypto = require('crypto');
const { getUser } = require('./_lib/auth');
const { GEM_PACKAGES, GEMS_PER_NODE, findGemPackageByToken } = require('./_lib/packages');
const store = require('./_lib/store');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const INTENT_TTL_MS = 6 * 60 * 60 * 1000;
// Tiempo de espera entre compras: lo fija el paquete de la ÚLTIMA compra (4,99 → 6 h, 9,99 → 24 h, 19,99 → 48 h).
// Frena que alguien reutilice la URL de retorno una y otra vez para juntar gemas. Los pagos antiguos (otros
// montos) no imponen espera.
async function cooldownFor(userId) {
    const last = await store.lastPayment(userId);
    if (!last) return null;
    const pk = Object.values(GEM_PACKAGES).find((p) => Number(p.usd).toFixed(2) === Number(last.amount).toFixed(2));
    if (!pk) return null;
    const until = new Date(last.created_at).getTime() + pk.cooldownHours * 3600 * 1000;
    return until > Date.now() ? { until: new Date(until).toISOString(), msLeft: until - Date.now() } : null;
}
const FROM_OK = new Set(['graphikosmos', 'idiomas', 'oraculo']);

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const user = getUser(context);
    if (!user) return json(401, { error: 'auth_required' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const from = FROM_OK.has(body.from) ? body.from : 'graphikosmos';

    try {
        if (body.action === 'packages') {
            return json(200, { gemsPerNode: GEMS_PER_NODE, packages: Object.values(GEM_PACKAGES).map((p) => ({ id: p.id, gems: p.gems, usd: p.usd })) });
        }

        if (body.action === 'intent') {
            const pkg = GEM_PACKAGES[String(body.packageId)];
            if (!pkg) return json(400, { error: 'paquete_invalido' });
            if (user.isAdmin) return json(200, { url: pkg.url, intent: null });
            const cd = await cooldownFor(user.id);
            if (cd) return json(429, { error: 'cooldown', until: cd.until, msLeft: cd.msLeft });
            const recent = await store.countEventsLastHour(user.id, 'pay_intent');
            if (recent >= 10) return json(429, { error: 'rate_limited' });
            const intent = crypto.randomUUID();
            await store.logEvent(user.id, 'user', null, 'pay_intent', { intent, packageId: pkg.id, from }, user.email, 'graphikosmos');
            return json(200, { url: pkg.url, intent });
        }

        if (body.action === 'claim') {
            const pkg = findGemPackageByToken(body.token);
            if (!pkg) {
                store.logEvent(user.id, 'user', null, 'pay_invalid_token', {}, user.email, 'graphikosmos').catch(() => {});
                return json(400, { error: 'ficha_invalida' });
            }
            if (!user.isAdmin) {
                const cd = await cooldownFor(user.id);
                if (cd) {
                    store.logEvent(user.id, 'user', null, 'pay_blocked_cooldown', { packageId: pkg.id, until: cd.until }, user.email, 'graphikosmos').catch(() => {});
                    return json(429, { error: 'cooldown', until: cd.until, msLeft: cd.msLeft });
                }
            }
            const since = new Date(Date.now() - INTENT_TTL_MS).toISOString();
            const intents = (await store.recentEvents(user.id, 'pay_intent', since, 10))
                .filter((e) => e.metadata && e.metadata.packageId === pkg.id && e.metadata.intent);
            let chosen = null, alreadyClaimed = null;
            for (const ev of intents) {
                const order = 'rd:' + ev.metadata.intent;
                if (await store.paymentExists(order)) { alreadyClaimed = alreadyClaimed || ev; continue; }
                chosen = ev; break;
            }
            if (!chosen) {
                if (alreadyClaimed) {
                    const balance = await store.ensureProfile(user.id, user.email);
                    return json(200, { success: true, already: true, balance, from: alreadyClaimed.metadata.from || 'graphikosmos', gemsAdded: 0 });
                }
                store.logEvent(user.id, 'user', null, 'pay_unmatched', { packageId: pkg.id }, user.email, 'graphikosmos').catch(() => {});
                return json(404, { error: 'no_intent' });
            }
            const balance = await store.creditNodes(user.id, pkg.nodes, 'rd:' + chosen.metadata.intent, pkg.usd);
            await store.logEvent(user.id, 'user', null, 'payment_success', { intent: chosen.metadata.intent, packageId: pkg.id, usd: pkg.usd, gems: pkg.gems, nodesAdded: pkg.nodes, via: 'redirect' }, user.email, 'graphikosmos').catch(() => {});
            return json(200, { success: true, balance, from: chosen.metadata.from || 'graphikosmos', gemsAdded: pkg.gems, nodesAdded: pkg.nodes });
        }

        return json(400, { error: 'accion_invalida' });
    } catch (err) {
        console.error('[pay]', err.message);
        return json(503, { error: 'pay_unavailable' });
    }
};
