const { getUser } = require('./_lib/auth');
const { getOrCreateGuestId, buildSetCookie } = require('./_lib/guest');
const store = require('./_lib/store');
const { pdfMaxPages } = require('./_lib/packages');

const json = (statusCode, obj, extraHeaders) => ({
    statusCode, headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) }, body: JSON.stringify(obj)
});

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

    const user = getUser(context);

    if (user) {
        if (user.isAdmin) return json(200, { kind: 'admin', balance: null, pdfMaxPages: pdfMaxPages(0, true) });
        try {
            const balance = await store.ensureProfile(user.id, user.email);
            let maxUsd = 0; try { maxUsd = await store.maxPaymentUsd(user.id); } catch (_e) { /* sin dato: límite base */ }
            return json(200, { kind: 'user', balance, pdfMaxPages: pdfMaxPages(maxUsd, false) });
        } catch (err) {
            console.error('[balance]', err.message);
            return json(503, { error: 'billing_unavailable' });
        }
    }

    // Invitado: identificarlo por cookie (o crearle una) y devolver su saldo, sin gastar nodos.
    const { guestId, isNew, ip } = getOrCreateGuestId(event);
    const cookieHeaders = isNew ? { 'Set-Cookie': buildSetCookie(guestId) } : {};
    try {
        const balance = await store.ensureGuest(guestId, ip);
        return json(200, { kind: 'guest', balance, pdfMaxPages: pdfMaxPages(0, false) }, cookieHeaders);
    } catch (err) {
        console.error('[balance]', err.message);
        return json(503, { error: 'billing_unavailable' }, cookieHeaders);
    }
};
