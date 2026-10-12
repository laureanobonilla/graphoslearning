// Servicio de canciones (3 apps: tu-voz, tu-voz-video, tu-cancion-video): piezas compartidas.
// Archivos (audio y foto) van a Cloudinary en modo PRIVADO (type=authenticated), con la firma hecha aquí en el servidor.
// El registro va a la tabla cs_orders (supabase/servicio-canciones.sql) y a events (app = la de cada página).
const crypto = require('crypto');
const { json, UUID_RE, scrub, scrubOne, ipOf, hashIp, countryOf } = require('./tc-core');

// >>> EDITA AQUÍ los precios (colones). Lo que ve la persona sale de cs-config. <<<
const APPS = {
    'tu-voz':          { label: 'Ponle música a tu voz',        audio: true,  video: false, perMinute: 9900 },
    'tu-voz-video':    { label: 'Tu voz, tu canción y tu video', audio: true,  video: true,  perMinute: 9900, perMinuteVideo: 18900 },
    'tu-cancion-video': { label: 'Tu canción cantada por ti',    audio: false, video: true,  flat: 9900, flatVideo: 29900 }
};
const MAX_AUDIO_MIN = 10;                       // minutos máximos por pedido
const MAX_AUDIO_BYTES = 60 * 1024 * 1024, MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const AUDIO_TYPES = /^audio\/(mpeg|mp3|mp4|x-m4a|m4a|aac|wav|x-wav|wave|webm|ogg|opus|flac|x-flac|3gpp|3gpp2|amr)$$/i;
const PHOTO_TYPES = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;

const money = (n) => '₡' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
// Precio proporcional a la duración (1:15 = 1,25 minutos), redondeado hacia arriba a los ₡100; mínimo 1 minuto.
const exactMinutes = (seconds) => Math.max(1, (Number(seconds) || 0) / 60);
const billedMinutes = (seconds) => Math.ceil(exactMinutes(seconds) - 0.0001);   // entero, para la tabla
const roundUp100 = (n) => Math.ceil(Math.round(n * 100) / 100 / 100 - 1e-9) * 100;
function priceOf(app, withVideo, seconds) {
    const a = APPS[app]; if (!a) return null;
    if (a.audio) {
        const per = withVideo && a.video ? a.perMinuteVideo : a.perMinute, em = exactMinutes(seconds), amount = roundUp100(em * per);
        return { minutes: billedMinutes(seconds), exactMinutes: Math.round(em * 100) / 100, perMinute: per, amount, text: money(amount) };
    }
    const amount = withVideo ? a.flatVideo : a.flat;
    return { minutes: null, exactMinutes: null, perMinute: null, amount, text: money(amount) };
}
const publicConfig = (app) => { const a = APPS[app]; if (!a) return null; return { app, label: a.label, audio: a.audio, video: a.video, perMinute: a.perMinute || null, perMinuteVideo: a.perMinuteVideo || null, flat: a.flat || null, flatVideo: a.flatVideo || null, maxAudioMin: MAX_AUDIO_MIN, texts: { perMinute: a.perMinute ? money(a.perMinute) : null, perMinuteVideo: a.perMinuteVideo ? money(a.perMinuteVideo) : null, flat: a.flat ? money(a.flat) : null, flatVideo: a.flatVideo ? money(a.flatVideo) : null } }; };

// ---- Cloudinary ----
function cld() {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME, key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud || !key || !secret) throw new Error('Faltan CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET');
    return { cloud, key, secret };
}
const cldConfigured = () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
function sign(params, secret) {
    const base = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== '').sort().map(k => `${k}=${params[k]}`).join('&');
    return crypto.createHash('sha1').update(base + secret).digest('hex');
}
// Firma para que el NAVEGADOR suba directo a Cloudinary (el archivo no pasa por Netlify: sin el límite de 6 MB).
function signUpload(publicId) {
    const { cloud, key, secret } = cld();
    const timestamp = Math.floor(Date.now() / 1000), toSign = { public_id: publicId, timestamp, type: 'authenticated' };
    return { cloud, apiKey: key, timestamp, signature: sign(toSign, secret), publicId, type: 'authenticated', uploadUrl: `https://api.cloudinary.com/v1_1/${cloud}/auto/upload` };
}
// Datos del archivo ya subido (para verificar que existe y medir la duración del audio en el servidor).
async function resourceInfo(publicId, resourceType) {
    const { cloud, key, secret } = cld();
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/${resourceType}/authenticated/${publicId.split('/').map(encodeURIComponent).join('/')}`, { headers: { Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64') } });
    if (!res.ok) return null;
    return res.json().catch(() => null);
}
// Enlace de descarga firmado (vale 30 días) para el correo.
function downloadUrl(publicId, resourceType, format, days = 30) {
    const { cloud, key, secret } = cld();
    const p = { public_id: publicId, type: 'authenticated', timestamp: Math.floor(Date.now() / 1000), expires_at: Math.floor(Date.now() / 1000) + days * 86400, attachment: 'true' };
    if (format) p.format = format;
    const signature = sign(p, secret);
    return `https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/download?` + new URLSearchParams({ ...p, api_key: key, signature }).toString();
}

// ---- Tabla cs_orders ----
function sbCfg() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}
async function saveOrder(row) {
    const { url, key } = sbCfg();
    const res = await fetch(`${url}/rest/v1/cs_orders?on_conflict=id`, {
        method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...row, updated_at: new Date().toISOString() })
    });
    if (!res.ok) throw new Error(`cs_orders HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[A-Za-z]{2,}$/;
const cleanEmail = (s) => { const v = String(s || '').trim().toLowerCase(); return v.length <= 254 && EMAIL_RE.test(v) ? v : ''; };

module.exports = { roundUp100, exactMinutes, APPS, MAX_AUDIO_MIN, MAX_AUDIO_BYTES, MAX_PHOTO_BYTES, AUDIO_TYPES, PHOTO_TYPES, money, billedMinutes, priceOf, publicConfig,
    cldConfigured, signUpload, resourceInfo, downloadUrl, saveOrder, cleanEmail, json, UUID_RE, scrub, scrubOne, ipOf, hashIp, countryOf };
