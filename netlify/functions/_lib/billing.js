// Envuelve un handler de IA: resuelve quién llama (usuario logueado o invitado por cookie),
// revisa saldo y límite de uso en el servidor, ejecuta la llamada real y descuenta
// del saldo según lo que realmente se generó. Nunca confía en nada que mande el cliente
// sobre su propio saldo.

const KNOWN = new Set([
    'parse_text', 'expand', 'examples', 'synergy', 'connect', 'define',
    'simple_explanation', 'custom_prompt', 'antithesis', 'socratic_question', 'socratic_evaluate',
    'extract_key_terms', 'analyze_text',
    // Asistente de bienvenida (primera visita): el texto de ejemplo y el primer
    // esquema son gratis, ver la lógica de "welcomeFree" en withBilling.
    'onboarding_text', 'welcome_schema',
    // Móvil (/m/): mapa de 2 niveles ('m_welcome' = el primero, gratis una vez) y glosario de varios términos.
    'm_map', 'm_welcome', 'glossary',
    // Documentos muy largos: resumen por fragmentos (gratis); el esquema final se cobra como parse_text.
    'long_outline',
    // Idiomas (/idiomas/): mapa de bloques con rol gramatical (se cobra por nodo) y palabra suelta en contexto (gratis).
    'lang_map', 'lang_word',
    // Oráculo del Caos (/oraculo/): 5 señales gratis al día con tono al azar; elegir el tono o pasar de 5 cuesta 1 nodo.
    'oracle'
]);

// Acciones que hoy son gratis para el usuario (siguen contando para el límite por hora).
const FREE = new Set(['define', 'simple_explanation', 'socratic_question', 'extract_key_terms', 'onboarding_text', 'welcome_schema', 'glossary', 'long_outline', 'lang_word']);
// Saldo mínimo para empezar (el costo real se calcula con la respuesta).
// analyze_text usa el mismo mínimo que parse_text: genera un árbol de 3
// niveles igual de completo, solo que analítico en vez de expositivo.
const MIN_BALANCE = { parse_text: 5, synergy: 3, antithesis: 2, analyze_text: 5, m_map: 4, lang_map: 5 };

const LIMITS = { topic: 500, topicB: 500, contextPath: 2000, customRequest: 1500,
                 question: 1500, userAnswer: 4000, text: 60000, documentContext: 12000,
                 analysisType: 30, customType: 200, purpose: 60, level: 30, question: 600, studyLang: 10, word: 60, sentence: 400 };

// Día de Costa Rica (UTC-6) para la cuota gratis del oráculo.
const ORACLE_FREE_PER_DAY = Number(process.env.ORACLE_FREE_PER_DAY || 5);
function dayStartIso() {
    const off = 6 * 3600 * 1000, now = Date.now();
    return new Date(Math.floor((now - off) / 86400000) * 86400000 + off).toISOString();
}

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
        case 'extract_key_terms': return len(d.terms);
        case 'analyze_text':      return d.root ? 1 + len(d.branches) + len(d.subBranches) : 0;
        case 'm_map':             return d.root ? 1 + len(d.branches) : 0;
        case 'lang_map':          return d.root ? 1 + len(d.branches) + len(d.subBranches) : 0;
        // 'welcome_schema' y 'onboarding_text' caen en default: 0 (gratis).
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

function json(statusCode, obj, extraHeaders, cookies) {
    const res = { statusCode, headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) }, body: JSON.stringify(obj) };
    // Varias cookies en una misma respuesta (identidad de invitado + marca de
    // "ya usó el esquema de bienvenida"): Netlify necesita multiValueHeaders.
    if (cookies && cookies.length) {
        if (cookies.length === 1) res.headers['Set-Cookie'] = cookies[0];
        else res.multiValueHeaders = { 'Set-Cookie': cookies };
    }
    return res;
}

const WELCOME_COOKIE = 'gk_welcome';
function hasWelcomeCookie(event) {
    const raw = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
    return new RegExp('(?:^|;\\s*)' + WELCOME_COOKIE + '=1(?:;|$)').test(raw);
}
function buildWelcomeCookie() {
    return `${WELCOME_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; Secure; SameSite=Lax`;
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
        rateLimitGuest: Number(process.env.GUEST_RATE_LIMIT_PER_HOUR || 40),
        ...overrides
    };

    return async function handler(event, context) {
        if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

        let action = body.action;
        if (!KNOWN.has(action)) return json(400, { error: 'Acción no válida' });

        const identity = await resolveIdentity(event, context, deps);
        const cookieHeaders = identity.setCookie ? { 'Set-Cookie': identity.setCookie } : {};

        sanitize(body);

        let balance = null;
        let welcomeFree = false;
        let oracleFree = false, oracleFreeLeft = 0;
        if ((action === 'welcome_schema' || action === 'm_welcome') && identity.isAdmin) welcomeFree = true;
        if (!identity.isAdmin) {
            try {
                balance = identity.kind === 'user'
                    ? await deps.store.ensureProfile(identity.id, identity.email)
                    : await deps.store.ensureGuest(identity.guestId, identity.ip);

                const limit = identity.kind === 'user' ? deps.rateLimitUser : deps.rateLimitGuest;
                const used = await deps.store.usageLastHour(identity.id);
                if (used >= limit) {
                    // used/limit se devuelven para poder ver el número real (diagnóstico en móvil).
                    return json(429, { error: 'rate_limited', balance, used, limit }, cookieHeaders);
                }
            } catch (err) {
                console.error('[billing] error de base de datos:', err.message);
                return json(503, { error: 'billing_unavailable' }, cookieHeaders);
            }

            // Esquema de bienvenida GRATIS, una sola vez por persona: solo si no
            // trae la marca de haberlo usado y aún no ha gastado nada de su saldo
            // inicial. Si no cumple, se cobra como un parse_text normal (nunca se
            // rechaza: es mejor cobrar que dejar a alguien sin esquema).
            if (action === 'welcome_schema' || action === 'm_welcome') {
                const paidAction = action === 'm_welcome' ? 'm_map' : 'parse_text';
                const initial = identity.kind === 'user'
                    ? require('./packages').freeUserNodes()
                    : require('./packages').freeGuestNodes();
                if (!hasWelcomeCookie(event) && balance >= initial) welcomeFree = true;
                else { action = paidAction; body.action = paidAction; }
            }

            // Oráculo: las primeras ORACLE_FREE_PER_DAY señales del día (con tono al azar) no cuestan nada.
            if (action === 'oracle') {
                const day = dayStartIso();
                let usedToday = 0;
                try { usedToday = await deps.store.countEventsSince(identity.id, 'oracle_used', day); } catch (err) { usedToday = ORACLE_FREE_PER_DAY; }
                const wantsTone = body.tone && body.tone !== 'auto';
                oracleFree = !wantsTone && usedToday < ORACLE_FREE_PER_DAY;
                oracleFreeLeft = Math.max(0, ORACLE_FREE_PER_DAY - usedToday);
            }
            const min = (action === 'oracle' && oracleFree) ? 0 : (FREE.has(action) ? 0 : (MIN_BALANCE[action] || 1));
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

        let cost = computeCost(action, data);
        if (action === 'oracle') {
            cost = (data.care || oracleFree || identity.isAdmin) ? 0 : 1;
            if (!data.care && !identity.isAdmin) {
                try { await deps.store.logEvent(identity.id, identity.kind, null, 'oracle_used', { free: oracleFree, tone: data.tone, rarity: data.rarity }, identity.email || null, 'oraculo'); } catch (err) { console.error('[billing] oracle_used:', err.message); }
                if (oracleFree) oracleFreeLeft = Math.max(0, oracleFreeLeft - 1);
            }
            data.freeLeft = identity.isAdmin ? ORACLE_FREE_PER_DAY : (data.care ? oracleFreeLeft : oracleFreeLeft);
        }
        if (!identity.isAdmin) {
            try {
                balance = identity.kind === 'user'
                    ? await deps.store.spendNodes(identity.id, cost, action)
                    : await deps.store.spendGuestNodes(identity.guestId, cost, action);
            } catch (err) {
                console.error('[billing] no se pudo descontar:', err.message);
            }
        }

        const outCookies = [identity.setCookie, (welcomeFree && !identity.isAdmin) ? buildWelcomeCookie() : null].filter(Boolean);
        return json(200, { ...data, balance, cost, admin: !!identity.isAdmin, guest: identity.kind === 'guest' }, null, outCookies);
    };
}

module.exports = { withBilling, computeCost, KNOWN, hasWelcomeCookie };
