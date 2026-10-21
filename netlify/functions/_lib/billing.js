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
    'm_map', 'm_welcome', 'glossary', 'm_text',
    // Escritorio: texto breve de solo lectura que acompaña a un esquema generado desde un tema (gratis).
    'topic_text', 'views', 'rhizome',
    // Rizoma › Lectura del mapa: explicar cómo se conectan dos grupos de ideas que casi no se tocan (1 nodo).
    'bridge_gap',
    // Definiciones › conceptos clave que el mapa da por sabidos (filtrar candidatos y definirlos; gratis).
    'key_concepts',
    // Documentos muy largos: resumen por fragmentos (gratis); el esquema final se cobra como parse_text.
    'long_outline',
    // Idiomas (/idiomas/): mapa de bloques con rol gramatical (se cobra por nodo) y palabra suelta en contexto (gratis).
    'lang_map', 'lang_word',
    // Oráculo del Caos (/oraculo/): 5 señales gratis al día con tono al azar; elegir el tono o pasar de 5 cuesta 1 nodo.
    'oracle',
    // Escribir (/escribir/): preguntas de desarrollo (gratis) y retroalimentación de una respuesta (1 nodo).
    'esc_questions', 'esc_feedback', 'esc_analyze', 'lens', 'lens_step'
]);

// Acciones que hoy son gratis para el usuario (siguen contando para el límite por hora).
const FREE = new Set(['key_concepts', 'define', 'simple_explanation', 'socratic_question', 'extract_key_terms', 'onboarding_text', 'welcome_schema', 'glossary', 'long_outline', 'lang_word', 'topic_text', 'views', 'rhizome', 'esc_questions', 'esc_analyze']);
// Saldo mínimo para empezar (el costo real se calcula con la respuesta).
// analyze_text usa el mismo mínimo que parse_text: genera un árbol de 3
// niveles igual de completo, solo que analítico en vez de expositivo.
const LENS_COST = 6;   // una lente (genio / claridad) cuesta lo mismo; se cobra solo si el resultado llega completo
const MIN_BALANCE = { lens: LENS_COST, parse_text: 5, synergy: 3, antithesis: 2, analyze_text: 5, m_map: 4, m_text: 4, lang_map: 5 };

const LIMITS = { topic: 500, topicB: 500, contextPath: 2000, customRequest: 1500,
                 question: 1500, userAnswer: 4000, text: 60000, documentContext: 12000,
                 analysisType: 30, customType: 200, purpose: 60, level: 30, question: 600, studyLang: 10, word: 60, sentence: 400 };

// Día de Costa Rica (UTC-6) para la cuota gratis del oráculo.
const ORACLE_FREE_PER_DAY = Number(process.env.ORACLE_FREE_PER_DAY || 5);
// SIN RESTRICCIÓN (temporal, pedido del dueño): el oráculo es gratis e ilimitado mientras esto sea true.
// Para restaurar el límite diario: poner ORACLE_UNLIMITED=0 en Netlify, o cambiar el default a false.
const ORACLE_UNLIMITED = String(process.env.ORACLE_UNLIMITED == null ? '1' : process.env.ORACLE_UNLIMITED) !== '0';
// Las señales gastadas antes de esta fecha no cuentan al restaurar el límite (reinicio del contador).
const ORACLE_COUNT_FROM = process.env.ORACLE_COUNT_FROM || '2026-10-11T15:10:00Z';
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
        case 'bridge_gap':        return d.explicacion ? 1 : 0;
        case 'custom_prompt':     return len(d.nodes);
        case 'antithesis':        return len(d.critiques);
        case 'socratic_evaluate': return 1;
        case 'extract_key_terms': return len(d.terms);
        case 'analyze_text':      return d.root ? 1 + len(d.branches) + len(d.subBranches) : 0;
        case 'm_map':             return d.root ? 1 + len(d.branches) + len(d.subBranches) : 0;
        case 'm_text':            return d.root ? 1 + len(d.branches) + len(d.subBranches) : 0;
        case 'lang_map':          return d.root ? 1 + len(d.branches) + len(d.subBranches) : 0;
        case 'esc_feedback':      return (d.criteria || d.skipped) ? 1 : 0;
        case 'lens':              return (d.lens && (d.steps || d.analogies || d.nodes)) ? LENS_COST : 0;
        case 'lens_step':         return d.metaphor ? 1 : 0;   // «otra metáfora» de un paso
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

// Política de prueba para invitados (ver _lib/trial.js). TRIAL_POLICY=off en el entorno la apaga sin redeploy de código.
const TRIAL_POLICY = process.env.TRIAL_POLICY !== 'off';
// Fuera de la política: otras apps que comparten este backend.
const TRIAL_EXEMPT = new Set(['oracle', 'lang_map', 'lang_word', 'esc_questions', 'esc_feedback', 'esc_analyze']);
// Practicar y Escribir (/escribir/): un invitado solo entra si llegó redirigido (anuncio o desde Graphikosmos: `entry` = 'ad'|'gk');
// entrando directo debe tener cuenta. Con esa entrada tiene una prueba rápida de CADA modo (Practicar: 1 tanda de preguntas y 3 respuestas
// evaluadas; Escribir: 6 párrafos analizados). Se cuenta en la tabla events (esc_trial_q / _fb / _an), por invitado.
const ESC_QUOTA = {
    esc_questions: { ev: 'esc_trial_q', max: 1 },
    esc_feedback:  { ev: 'esc_trial_fb', max: 3 },
    esc_analyze:   { ev: 'esc_trial_an', max: 6 }
};
const ESC_EVENTS = Object.values(ESC_QUOTA).map((q) => q.ev);
const ESC_SINCE = '2020-01-01T00:00:00Z';
// Crear esquemas nuevos: exige cuenta aunque ya haya usado su prueba.
const TRIAL_NEW_SCHEMA = new Set(['parse_text', 'analyze_text', 'long_outline', 'onboarding_text', 'm_text', 'lens', 'lens_step']);

// Ejemplo gratis para quien llega desde Facebook (2026-10-21): UNA vez por invitado, de cualquier tarjeta (mapa o lente), sin registrarse
// y sin gastar saldo. Después sigue la regla de siempre (lo demás exige cuenta). TRIAL_FB=off lo apaga sin tocar código.
const TRIAL_FB = process.env.TRIAL_FB !== 'off';
const FB_TRIAL_ACTIONS = new Set(['parse_text', 'lens']);

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
        isNew,
        setCookie: isNew ? deps.buildSetCookie(guestId) : null
    };
}

// Primer contacto de una cuenta: lo que le quedaba de invitado en este navegador pasa a su saldo (una vez por cuenta).
// Nunca rompe nada: si la función de Supabase aún no existe o falla, se sigue con el saldo normal.
async function claimGuestIfAny(event, user, balance, store, getExistingGuestId) {
    try {
        if (!store.claimGuestBalance || !getExistingGuestId) return balance;
        const gid = getExistingGuestId(event);
        if (!gid) return balance;
        const moved = Number(await store.claimGuestBalance(user.id, gid)) || 0;
        if (moved > 0) {
            try { await store.logEvent(user.id, 'user', null, 'guest_balance_claimed', { nodes: moved }, user.email || null, 'graphikosmos'); } catch (_e) { /* ok */ }
            return (Number(balance) || 0) + moved;
        }
    } catch (err) { console.error('[billing] claim guest:', err.message); }
    return balance;
}

function withBilling(raw, overrides = {}) {
    const deps = {
        getUser: require('./auth').getUser,
        getOrCreateGuestId: require('./guest').getOrCreateGuestId,
        buildSetCookie: require('./guest').buildSetCookie,
        getExistingGuestId: require('./guest').getExistingGuestId,
        store: require('./store'),
        trial: require('./trial'),
        // Fijos a propósito (2026-10-16): quien explora mucho (definiciones, 'ver más') llegaba a 80 en 4 minutos.
        // El gasto lo limita el saldo; esto solo frena abuso. Ya no dependen de variables de Netlify.
        rateLimitUser: 300,
        // Fijo a propósito (2026-10-15): con 20 un invitado nuevo lo alcanzaba al minuto de llegar. Ya no depende de la variable de Netlify.
        rateLimitGuest: 300,
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
        const ticket = typeof body.ticket === 'string' ? body.ticket.slice(0, 40) : '';
        delete body.ticket;
        const entry = (body.entry === 'ad' || body.entry === 'gk') ? body.entry : '';
        delete body.entry;

        let balance = null;
        let welcomeFree = false;
        let consumeTicket = null;
        let fbTrial = false;
        let escTrialEvent = null;
        let oracleFree = false, oracleFreeLeft = 0;
        if ((action === 'welcome_schema' || action === 'm_welcome') && identity.isAdmin) welcomeFree = true;
        if (!identity.isAdmin) {
            try {
                balance = identity.kind === 'user'
                    ? await deps.store.ensureProfile(identity.id, identity.email)
                    : await deps.store.ensureGuest(identity.guestId, identity.ip);
                if (identity.kind === 'user') balance = await claimGuestIfAny(event, identity, balance, deps.store, deps.getExistingGuestId);

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

            // POLÍTICA DE PRUEBA (invitados): un solo esquema de prueba, solo con boleto de anuncio; el resto exige cuenta.
            // Verificado en Supabase (ver _lib/trial.js), no con cookies. Si la verificación falla, se pide cuenta (nunca se regala).
            if (identity.kind === 'guest' && TRIAL_POLICY && !TRIAL_EXEMPT.has(action)) {
                const isWelcome = action === 'welcome_schema' || action === 'm_welcome';
                let allowed = false, hasTrial = false;
                try {
                    hasTrial = await deps.trial.guestHasTrial(identity.guestId);
                    if (!hasTrial && hasWelcomeCookie(event) && !identity.isNew) hasTrial = true;   // quien ya tenía su esquema antes de esta regla puede seguir con él
                    if (isWelcome && !hasTrial && ticket && await deps.trial.ticketValid(ticket)) { allowed = true; consumeTicket = ticket; }
                    else if (!isWelcome && hasTrial && !TRIAL_NEW_SCHEMA.has(action)) allowed = true;
                    else if (TRIAL_FB && !isWelcome && !hasTrial && FB_TRIAL_ACTIONS.has(action) && deps.trial.guestFromFacebook && await deps.trial.guestFromFacebook(identity.guestId)) { allowed = true; fbTrial = true; }
                } catch (err) { console.error('[billing] verificación de prueba:', err.message); }
                if (!allowed) {
                    const reason = isWelcome ? (hasTrial ? 'trial_used' : 'no_ticket') : (TRIAL_NEW_SCHEMA.has(action) ? 'new_schema' : 'no_trial');
                    return json(402, { error: 'guest_limit_reached', reason, registration_required: true, balance }, cookieHeaders);
                }
                if (isWelcome) { welcomeFree = true; }
            }

            // Practicar / Escribir para invitados: solo si llegaron redirigidos y dentro de la prueba rápida de cada modo.
            if (identity.kind === 'guest' && TRIAL_POLICY && ESC_QUOTA[action]) {
                const q = ESC_QUOTA[action];
                let allowed = false, reason = 'direct';
                try {
                    const used = await deps.store.countEventsSince(identity.id, q.ev, ESC_SINCE);
                    let started = entry !== '';
                    if (!started) {
                        for (const ev of ESC_EVENTS) { if (await deps.store.countEventsSince(identity.id, ev, ESC_SINCE) > 0) { started = true; break; } }   // ya empezó su prueba antes
                    }
                    if (started) { allowed = used < q.max; reason = 'esc_trial_over'; }
                } catch (err) { console.error('[billing] prueba de Escribir:', err.message); }
                if (!allowed) return json(402, { error: 'guest_limit_reached', reason, registration_required: true, balance }, cookieHeaders);
                escTrialEvent = q.ev;
            }

            // Esquema de bienvenida GRATIS, una sola vez por persona: solo si no
            // trae la marca de haberlo usado y aún no ha gastado nada de su saldo
            // inicial. Si no cumple, se cobra como un parse_text normal (nunca se
            // rechaza: es mejor cobrar que dejar a alguien sin esquema).
            if ((action === 'welcome_schema' || action === 'm_welcome') && !(identity.kind === 'guest' && TRIAL_POLICY && consumeTicket)) {
                const paidAction = action === 'm_welcome' ? 'm_map' : 'parse_text';
                const initial = identity.kind === 'user'
                    ? require('./packages').freeUserNodes()
                    : require('./packages').freeGuestNodes();
                if (!hasWelcomeCookie(event) && balance >= initial) welcomeFree = true;
                else { action = paidAction; body.action = paidAction; }
            }

            // Oráculo: las primeras ORACLE_FREE_PER_DAY señales del día (con tono al azar) no cuestan nada.
            if (action === 'oracle') {
                let day = dayStartIso();
                if (day < ORACLE_COUNT_FROM) day = ORACLE_COUNT_FROM;
                let usedToday = 0;
                try { usedToday = await deps.store.countEventsSince(identity.id, 'oracle_used', day); } catch (err) { usedToday = ORACLE_FREE_PER_DAY; }
                const wantsTone = body.tone && body.tone !== 'auto';
                oracleFree = ORACLE_UNLIMITED || (!wantsTone && usedToday < ORACLE_FREE_PER_DAY);
                oracleFreeLeft = ORACLE_UNLIMITED ? ORACLE_FREE_PER_DAY : Math.max(0, ORACLE_FREE_PER_DAY - usedToday);
            }
            const min = (fbTrial || (action === 'oracle' && oracleFree)) ? 0 : (FREE.has(action) ? 0 : (MIN_BALANCE[action] || 1));
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

        let cost = fbTrial ? 0 : computeCost(action, data);
        if (action === 'oracle') {
            cost = (data.care || oracleFree || identity.isAdmin) ? 0 : 1;
            if (!data.care && !identity.isAdmin) {
                try { await deps.store.logEvent(identity.id, identity.kind, null, 'oracle_used', { free: oracleFree, tone: data.tone, rarity: data.rarity }, identity.email || null, 'oraculo'); } catch (err) { console.error('[billing] oracle_used:', err.message); }
                if (oracleFree && !ORACLE_UNLIMITED) oracleFreeLeft = Math.max(0, oracleFreeLeft - 1);
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

        if (escTrialEvent && !identity.isAdmin) {
            try { await deps.store.logEvent(identity.id, 'guest', null, escTrialEvent, { entry }, null, 'escribir'); }
            catch (err) { console.error('[billing] no se pudo registrar la prueba de Escribir:', err.message); }
        }

        if (consumeTicket && !identity.isAdmin) {
            try { await deps.store.logEvent(consumeTicket, 'anon', null, 'trial_used', { guest: identity.guestId, action }, null, 'graphikosmos'); }
            catch (err) { console.error('[billing] no se pudo registrar la prueba:', err.message); }
        }

        if (fbTrial && !identity.isAdmin && data && !data.error && computeCost(action, data) > 0) {   // solo se gasta la prueba si de verdad se generó algo
            try { await deps.store.logEvent(identity.id, 'guest', null, 'trial_used', { guest: identity.guestId, action, via: 'facebook' }, null, 'graphikosmos'); }
            catch (err) { console.error('[billing] no se pudo registrar la prueba de Facebook:', err.message); }
        }

        const outCookies = [identity.setCookie, (welcomeFree && !identity.isAdmin) ? buildWelcomeCookie() : null].filter(Boolean);
        return json(200, { ...data, balance, cost, admin: !!identity.isAdmin, guest: identity.kind === 'guest' }, null, outCookies);
    };
}

module.exports = { withBilling, computeCost, KNOWN, hasWelcomeCookie };
