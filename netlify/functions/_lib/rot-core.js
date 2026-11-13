// «Rótulo»: planes, precios (los fija EL SERVIDOR) y acceso a Supabase para los códigos de compra.
const crypto = require('crypto');
const { CRC_PER_USD } = require('./currency');
// >>> EDITA AQUÍ los precios y lo que incluye cada plan. <<<
const PLANS = {
    paquete: { id: 'paquete', usd: 12, creditos: 10, dias: null, nombre: 'Paquete de 10 videos', detalle: '10 videos sin marca de agua. No vence.' },
    mensual: { id: 'mensual', usd: 19, creditos: 150, dias: 30, nombre: 'Plan mensual', detalle: 'Videos sin marca durante 30 días (hasta 150).' }
};
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const ipOf = (e) => (e.headers && (e.headers['x-nf-client-connection-ip'] || (e.headers['x-forwarded-for'] || '').split(',')[0].trim())) || 'unknown';
const countryOf = (event) => { try { const g = JSON.parse(Buffer.from(String((event.headers || {})['x-nf-geo'] || ''), 'base64').toString('utf8')); return (g && g.country && g.country.code) || ''; } catch { return ''; } };
function cfg() { const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY; if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY'); return { url: url.replace(/\/$/, ''), key }; }
async function sb(path, opt = {}) {
    const { url, key } = cfg();
    const res = await fetch(`${url}${path}`, { ...opt, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) } });
    const text = await res.text(); if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
}
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sin letras que se confunden (I, L, O, 0, 1)
function newCode() { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ALPHA[b[i] % ALPHA.length]; return `ROT-${s.slice(0, 4)}-${s.slice(4)}`; }   // número de recibo de cada compra
const { getUser } = require('./auth');
const hashIp = (ip) => crypto.createHash('sha256').update('rot:' + ip).digest('hex').slice(0, 24);
const today = () => new Date().toISOString().slice(0, 10);
// Quién llama: Netlify Identity valida la firma del JWT y deja al usuario en context.clientContext.user.
const userOf = (context) => { const u = getUser(context); return u && u.email ? { id: u.id, email: String(u.email).toLowerCase() } : null; };
// Compras de una cuenta (por id de cuenta, o por correo si el dueño regaló un paquete a mano). Devuelve lo que le queda.
async function cuenta(u) {
    const rows = await sb(`/rest/v1/rot_codigos?or=(uid.eq.${encodeURIComponent(u.id)},and(uid.is.null,email.eq.${encodeURIComponent(u.email)}))&select=tipo,creditos,usados,vence`) || [];
    const vivas = rows.filter((r) => r.creditos > r.usados && (!r.vence || new Date(r.vence) > new Date()));
    const restantes = vivas.reduce((a, r) => a + (r.creditos - r.usados), 0), vencen = vivas.filter((r) => r.vence).map((r) => r.vence).sort()[0] || null;
    return { restantes, vence: vencen, compras: rows.length };
}
// Gasta UN video de la compra que vence primero. Devuelve cuántos le quedan en total, o -1 si no tenía.
const gastarCuenta = async (u) => Number(await sb('/rest/v1/rpc/rot_gastar_cuenta', { method: 'POST', body: JSON.stringify({ p_uid: u.id, p_email: u.email }) }));
// Contadores atómicos de uso gratis: reservan un uso (devuelve el nuevo total, o -1 si ya llegó al máximo) y se pueden devolver si algo falla.
const contar = async (clave, max) => Number(await sb('/rest/v1/rpc/rot_contar', { method: 'POST', body: JSON.stringify({ p_clave: clave, p_max: max }) }));
const devolver = (clave) => sb('/rest/v1/rpc/rot_devolver', { method: 'POST', body: JSON.stringify({ p_clave: clave }) }).catch(() => {});
const priceView = (country) => { const out = {}; Object.values(PLANS).forEach((p) => { out[p.id] = { id: p.id, usd: p.usd, nombre: p.nombre, detalle: p.detalle, crc: country === 'CR' ? Math.ceil(p.usd * CRC_PER_USD / 100) * 100 : null }; }); return out; };
const FREE_DAILY = Number(process.env.ROT_GRATIS_DIA || 5);
module.exports = { PLANS, json, ipOf, countryOf, sb, newCode, userOf, hashIp, today, cuenta, gastarCuenta, contar, devolver, priceView, FREE_DAILY };
