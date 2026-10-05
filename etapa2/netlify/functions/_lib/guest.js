const crypto = require('crypto');

const COOKIE_NAME = 'gk_guest';

function parseCookies(header) {
    const out = {};
    (header || '').split(';').forEach(part => {
        const i = part.indexOf('=');
        if (i === -1) return;
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    });
    return out;
}

function getClientIp(event) {
    // Netlify inyecta esta cabecera con la IP real del visitante.
    return event.headers['x-nf-client-connection-ip']
        || (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || 'unknown';
}

// Devuelve { guestId, isNew, ip } y, si es nuevo, el visitante debe recibir un Set-Cookie
// (ver buildSetCookie) para que la próxima petición ya traiga su identidad.
function getOrCreateGuestId(event) {
    const cookies = parseCookies(event.headers.cookie || event.headers.Cookie);
    const existing = cookies[COOKIE_NAME];
    if (existing && /^[a-f0-9-]{36}$/i.test(existing)) {
        return { guestId: existing, isNew: false, ip: getClientIp(event) };
    }
    return { guestId: crypto.randomUUID(), isNew: true, ip: getClientIp(event) };
}

function buildSetCookie(guestId) {
    const oneYear = 60 * 60 * 24 * 365;
    return `${COOKIE_NAME}=${guestId}; Path=/; Max-Age=${oneYear}; HttpOnly; Secure; SameSite=Lax`;
}

module.exports = { getOrCreateGuestId, buildSetCookie, COOKIE_NAME };
