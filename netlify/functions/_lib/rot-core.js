// «Rótulo»: planes, precios (los fija EL SERVIDOR) y acceso a Supabase para los códigos de compra.
const crypto = require('crypto');
const { CRC_PER_USD } = require('./currency');
// >>> EDITA AQUÍ los precios y lo que incluye cada plan. <<<
const PLANS = {
    paquete: { id: 'paquete', usd: 5, creditos: 10, dias: null, nombre: 'Paquete de 10 videos', detalle: '10 videos sin marca de agua. No vence.' },
    mensual: { id: 'mensual', usd: 9, creditos: 150, dias: 30, nombre: 'Plan mensual', detalle: 'Videos sin marca durante 30 días (hasta 150).' }
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
function newCode() { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ALPHA[b[i] % ALPHA.length]; return `ROT-${s.slice(0, 4)}-${s.slice(4)}`; }
const CODE_RE = /^ROT-[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const normCode = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
// Estado de un código: {ok, tipo, restantes, vence} o null si no existe / venció / se agotó.
async function estado(codigo) {
    if (!CODE_RE.test(codigo)) return null;
    const r = await sb(`/rest/v1/rot_codigos?codigo=eq.${codigo}&select=codigo,tipo,creditos,usados,vence&limit=1`); const c = r && r[0]; if (!c) return null;
    const vencido = c.vence && new Date(c.vence) < new Date(), restantes = Math.max(0, c.creditos - c.usados);
    return { ok: !vencido && restantes > 0, tipo: c.tipo, restantes, vence: c.vence, vencido: !!vencido };
}
const gastar = async (codigo) => Number(await sb('/rest/v1/rpc/rot_gastar', { method: 'POST', body: JSON.stringify({ p_codigo: codigo }) }));
const priceView = (country) => { const out = {}; Object.values(PLANS).forEach((p) => { out[p.id] = { id: p.id, usd: p.usd, nombre: p.nombre, detalle: p.detalle, crc: country === 'CR' ? Math.ceil(p.usd * CRC_PER_USD / 100) * 100 : null }; }); return out; };
module.exports = { PLANS, json, ipOf, countryOf, sb, newCode, CODE_RE, normCode, estado, gastar, priceView };
