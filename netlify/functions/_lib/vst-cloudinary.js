// Cloudinary para "Vestirte": guarda las fotos en modo PRIVADO (type=authenticated):
// ninguna URL sin firma funciona, así que nadie puede verlas por adivinar un enlace.
// Solo el panel de administración (vst-admin.js, protegido con VST_ADMIN_KEY) las lee.
//
// Variables de entorno (Netlify → Site settings → Environment variables):
//   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
const crypto = require('crypto');

function cfg() {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME, key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud || !key || !secret) throw new Error('Faltan CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET');
    return { cloud, key, secret };
}
const isConfigured = () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

// Firma de la API: sha1 de "k=v&k=v" (claves ordenadas, sin file/api_key/resource_type) + secreto.
function sign(params, secret) {
    const base = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== '').sort().map(k => `${k}=${params[k]}`).join('&');
    return crypto.createHash('sha1').update(base + secret).digest('hex');
}

// Sube una imagen (data URI JPEG) como privada. Devuelve el public_id.
async function uploadPrivate(dataUri, publicId) {
    const { cloud, key, secret } = cfg();
    const timestamp = Math.floor(Date.now() / 1000);
    const toSign = { public_id: publicId, timestamp, type: 'authenticated', overwrite: 'true' };
    const body = new URLSearchParams({ ...toSign, file: dataUri, api_key: key, signature: sign(toSign, secret) });
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Cloudinary ${res.status}: ${data?.error?.message || 'error'}`);
    return data.public_id;
}

// Borra por public_id (Admin API, autenticación básica).
async function deleteMany(publicIds) {
    if (!publicIds.length) return 0;
    const { cloud, key, secret } = cfg();
    const qs = publicIds.map(p => `public_ids[]=${encodeURIComponent(p)}`).join('&');
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/image/authenticated?${qs}`, {
        method: 'DELETE',
        headers: { Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64') }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Cloudinary delete ${res.status}: ${data?.error?.message || 'error'}`);
    return Object.values(data.deleted || {}).filter(v => v === 'deleted').length;
}

// Descarga los bytes de una imagen privada con una URL firmada (solo desde el servidor).
async function fetchPrivate(publicId) {
    const { cloud, secret } = cfg();
    const sig = crypto.createHash('sha1').update(publicId + secret).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').slice(0, 8);
    const res = await fetch(`https://res.cloudinary.com/${cloud}/image/authenticated/s--${sig}--/${publicId}.jpg`);
    if (!res.ok) throw new Error(`Cloudinary fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

module.exports = { isConfigured, uploadPrivate, deleteMany, fetchPrivate, sign };
