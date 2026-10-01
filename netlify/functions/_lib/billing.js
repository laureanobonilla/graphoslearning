// Envuelve un handler de IA: resuelve quién llama (usuario logueado o invitado por cookie),
// revisa saldo y límite de uso en el servidor, ejecuta la llamada real y descuenta
// del saldo según lo que realmente se generó. Nunca confía en nada que mande el cliente
// sobre su propio saldo.

const KNOWN = new Set([
    'parse_text', 'expand', 'examples', 'synergy', 'connect', 'define',
    'custom_prompt', 'antithesis', 'socratic_question', 'socratic_evaluate'
]);

// Acciones que hoy son gratis para el usuario (siguen contando para el límite por hora).
const FREE = new Set(['define', 'socratic_question']);
// Saldo mínimo para empezar (el costo real se calcula con la respuesta).
const MIN_BALANCE = { parse_text: 5, synergy: 3, antithesis: 2 };

const LIMITS = { topic: 500, topicB: 500, contextPath: 2000, customRequest: 1500,
                 question: 1500, userAnswer: 4000, text: 60000, documentContext: 12000 };

const len = a => (Array.isArray(a) ? a.length : 0);

function computeCost(action, d) {
    switch (action) {
        case 'parse_text':        return d.root ? 1 + len(d.branches) + len(d.subBranches) : 0;
        case 'expand':            return len(d.concepts);            // la incógnita (curiosityHook) es gratis
        case 'examples':          return len(d.examples);
        case 'synergy':           return d.synergy ? 1 + len(d.pathsFromA) + len(d.pathsFromB) : 0;
        case 'connect':           return d.bridge ? 1 : 0;
        case 'custom_prompt':     return len(d.nodes);
        case 'antithesis':        return len(d.critiques);
        case 'socratic_evaluate': return 1;
        default:                  return 0;
    }
}

function sanitize(body) {
    for (const [k, max] of Object.entries(LIMITS)) {
        if (body[k] === undefined || body[k] === null) continue;
        body[k] = String(body[k]).slice(0, max);
    }
    if (typeof body.maxNodes === 'number') body.maxNodes = Math.min(Math.max(body.maxNodes, 1), 10);
}

function json(statusCode, obj, extraHeaders) {
    return { statusCode, headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) }, body: JSON.stringify(obj) };
}

// Resuelve la identidad de quien llama: usuario de Netlify Identity si hay sesión,
// si no, un invitado identificado por cookie HttpOnly (ver _lib/guest.js).
async function resolveIdentity(event, context, deps) {
    const user = deps.getUser(context);
    if (user) return { kind: 'user', id: user.id, email: user.email, isAdmin: user.isAdmin, setCookie: null };

    const { guestId, isNew, ip } = deps.getOrCreateGuestId(event);
    return {
        kind: 'guest',
        id: `guest:${guestId}`,
        guestId, ip, isAdmin: false,
        setCookie: isNew ? deps.buildSetCookie(guestId) : null
    };
}

function withBilling(raw, overrides = {}) {
    const deps = {
        getUser: require('./auth').getUser,
        getOrCreateGuestId: require('./guest').getOrCreateGuestId,
        buildSetCookie: require('./guest').buildSetCookie,
        store: require('./store'),
        rateLimitUser: Number(process.env.RATE_LIMIT_PER_HOUR || 60),
        rateLimitGuest: Number(process.env.GUEST_RATE_LIMIT_PER_HOUR || 20),
        ...overrides
    };

    return async function handler(event, context) {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

        const action = body.action;
        if (!KNOWN.has(action)) return json(400, { error: 'Acción no válida' });

        const identity = await resolveIdentity(event, context, deps);
        const cookieHeaders = identity.setCookie ? { 'Set-Cookie': identity.setCookie } : {};

        sanitize(body);

        let balance = null;
        if (!identity.isAdmin) {
            try {
                balance = identity.kind === 'user'
                    ? await deps.store.ensureProfile(identity.id, identity.email)
                    : await deps.store.ensureGuest(identity.guestId, identity.ip);

                const limit = identity.kind === 'user' ? deps.rateLimitUser : deps.rateLimitGuest;
                if ((await deps.store.usageLastHour(identity.id)) >= limit) {
                    return json(429, { error: 'rate_limited', balance }, cookieHeaders);
                }
            } catch (err) {
                console.error('[billing] error de base de datos:', err.message);
                return json(503, { error: 'billing_unavailable' }, cookieHeaders);
            }

            const min = FREE.has(action) ? 0 : (MIN_BALANCE[action] || 1);
            if (balance < min) {
                // Para invitados sin saldo, el cliente debe mostrar el muro de login,
                // no la tienda (los invitados no pueden comprar sin cuenta).
                const errorCode = identity.kind === 'guest' ? 'guest_limit_reached' : 'insufficient_balance';
                return json(402, { error: errorCode, balance, needed: min }, cookieHeaders);
            }
        }

        const result = await raw({ ...event, body: JSON.stringify(body) }, context);
        if (result.statusCode !== 200) return { ...result, headers: { ...(result.headers || {}), ...cookieHeaders } };

        let data;
        try { data = JSON.parse(result.body); } catch { return result; }

        const cost = computeCost(action, data);
        if (!identity.isAdmin) {
            try {
                balance = identity.kind === 'user'
                    ? await deps.store.spendNodes(identity.id, cost, action)
                    : await deps.store.spendGuestNodes(identity.guestId, cost, action);
            } catch (err) {
                console.error('[billing] no se pudo descontar:', err.message);
            }
        }

        return json(200, { ...data, balance, cost, admin: !!identity.isAdmin, guest: identity.kind === 'guest' }, cookieHeaders);
    };
}

module.exports = { withBilling, computeCost, KNOWN };
