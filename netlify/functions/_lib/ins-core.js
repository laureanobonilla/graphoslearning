// «tu-pista»: quita la voz de un audio y entrega la pista instrumental en MP3 (se cobra por PayPal).
// Flujo: la persona sube su audio a Cloudinary (privado, firma del servidor) → ins-start lo manda a Replicate (Demucs)
// → ins-status guarda la pista completa y un fragmento de 30 s en Cloudinary → PayPal → ins-download entrega la pista completa.
// Tabla ins_jobs: supabase/tu-pista.sql. Variables: REPLICATE_API_TOKEN (+ las de Cloudinary, PayPal, Supabase, Resend ya existentes).
const cs = require('./cs-core');

const PRICE_USD = process.env.INS_PRICE_USD || '4.99';
const MAX_MIN = 8, MIN_SEC = 10, MAX_BYTES = 40 * 1024 * 1024, PREVIEW_SEC = 30;
const AUDIO_TYPES = cs.AUDIO_TYPES;
const MODEL = process.env.REPLICATE_MODEL || 'ryan5453/demucs';

// ---------- Supabase (tabla ins_jobs) ----------
function sb() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}
async function saveJob(row) {
    const { url, key } = sb();
    const res = await fetch(`${url}/rest/v1/ins_jobs?on_conflict=id`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) });
    if (!res.ok) throw new Error(`ins_jobs HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}
async function getJob(id) {
    const { url, key } = sb();
    const res = await fetch(`${url}/rest/v1/ins_jobs?id=eq.${encodeURIComponent(id)}&select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`ins_jobs HTTP ${res.status}`);
    const rows = await res.json(); return rows[0] || null;
}
async function jobByOrder(orderId) {
    const { url, key } = sb();
    const res = await fetch(`${url}/rest/v1/ins_jobs?paypal_order=eq.${encodeURIComponent(orderId)}&select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`ins_jobs HTTP ${res.status}`);
    const rows = await res.json(); return rows[0] || null;
}

// ---------- Replicate ----------
const REP = 'https://api.replicate.com/v1';
const repHeaders = () => { if (!process.env.REPLICATE_API_TOKEN) throw new Error('Falta REPLICATE_API_TOKEN'); return { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' }; };
let versionCache = null;
async function modelVersion() {
    if (process.env.REPLICATE_VERSION) return process.env.REPLICATE_VERSION;
    if (versionCache) return versionCache;
    const res = await fetch(`${REP}/models/${MODEL}`, { headers: repHeaders() });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.latest_version || !d.latest_version.id) throw new Error(`Replicate: no se pudo leer el modelo ${MODEL} (${res.status})`);
    return (versionCache = d.latest_version.id);
}
async function startSeparation(audioUrl) {
    const version = await modelVersion();
    // stem=vocals → dos pistas: la voz y "todo lo demás" (la instrumental).
    const res = await fetch(`${REP}/predictions`, { method: 'POST', headers: repHeaders(), body: JSON.stringify({ version, input: { audio: audioUrl, stem: 'vocals', output_format: 'mp3', mp3_bitrate: 192 } }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.id) throw new Error(`Replicate rechazó el trabajo (${res.status}): ${JSON.stringify(d).slice(0, 300)}`);
    return d.id;
}
async function getPrediction(id) {
    const res = await fetch(`${REP}/predictions/${encodeURIComponent(id)}`, { headers: repHeaders() });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Replicate HTTP ${res.status}`);
    return d;
}
// La salida puede ser un texto (url), una lista o un objeto {vocals, other/no_vocals...}. Se toma la que NO es la voz.
function pickInstrumental(out) {
    const isUrl = (v) => typeof v === 'string' && /^https?:\/\//.test(v);
    if (isUrl(out)) return out;
    if (Array.isArray(out)) { const l = out.filter(isUrl); return l.find(u => !/vocal/i.test(u)) || null; }
    if (out && typeof out === 'object') {
        const keys = Object.keys(out).filter(k => isUrl(out[k]));
        const k = keys.find(k => /^(no_vocals|other|instrumental|accompaniment|backing)$/i.test(k)) || keys.find(k => !/vocal/i.test(k));
        return k ? out[k] : null;
    }
    return null;
}

// ---------- Cloudinary (archivos "raw", privados) ----------
async function uploadRaw(publicId, source, mime) {
    const { cloud, key, secret } = cs.cld();
    const timestamp = Math.floor(Date.now() / 1000), params = { public_id: publicId, timestamp, type: 'authenticated' };
    const fd = new FormData();
    fd.append('file', typeof source === 'string' ? source : new Blob([source], { type: mime || 'audio/mpeg' }), typeof source === 'string' ? undefined : publicId.split('/').pop());
    fd.append('api_key', key); fd.append('timestamp', String(timestamp)); fd.append('signature', cs.sign(params, secret)); fd.append('public_id', publicId); fd.append('type', 'authenticated');
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/raw/upload`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Cloudinary raw/upload HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return res.json();
}
// Enlace firmado de descarga (raw). attachment=true fuerza "descargar"; false deja que el navegador lo reproduzca.
function rawUrl(publicId, { attachment = true, hours = 1 } = {}) {
    const { cloud, key, secret } = cs.cld(), now = Math.floor(Date.now() / 1000);
    const p = { public_id: publicId, type: 'authenticated', timestamp: now, expires_at: now + Math.round(hours * 3600) };
    if (attachment) p.attachment = 'true';
    return `https://api.cloudinary.com/v1_1/${cloud}/raw/download?` + new URLSearchParams({ ...p, api_key: key, signature: cs.sign(p, secret) }).toString();
}

// Recorta ~secs segundos de un MP3 (CBR) a partir de startSec, empezando en un encabezado de cuadro válido.
function mp3Slice(buf, startSec, secs, bytesPerSec) {
    let from = Math.max(0, Math.min(buf.length - 1, Math.floor(startSec * bytesPerSec)));
    for (let i = from; i < Math.min(buf.length - 1, from + 4096); i++) if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) { from = i; break; }
    return buf.subarray(from, Math.min(buf.length, from + Math.floor(secs * bytesPerSec)));
}

const publicJob = (j) => ({ id: j.id, status: j.status, paid: !!j.paid, seconds: j.seconds || null, error: j.status === 'failed' ? (j.error || 'No pudimos separar este audio.') : null });

module.exports = { ...cs, PRICE_USD, MAX_MIN, MIN_SEC, MAX_BYTES, PREVIEW_SEC, AUDIO_TYPES, saveJob, getJob, jobByOrder, startSeparation, getPrediction, pickInstrumental, uploadRaw, rawUrl, mp3Slice, publicJob };
