// «tu-audio»: app multifunción. Herramientas:
//   pista (quitar la voz), voz (solo la voz), limpiar (quitar ruido) → Replicate; letra → Replicate (Whisper);
//   ajustar (tono, velocidad, recorte, MP3) → todo en el navegador de la persona, aquí solo se registra el pago.
// Tabla aud_jobs: supabase/tu-audio.sql. Variables: REPLICATE_API_TOKEN (+ opcionales REPLICATE_MODEL, REPLICATE_WHISPER_MODEL,
// REPLICATE_DENOISE_MODEL [opcional: otro modelo para «limpiar»; por defecto resemble-ai/resemble-enhance], REPLICATE_DENOISE_INPUT, AUD_PRICE_*).
const crypto = require('crypto');
const ins = require('./ins-core');
const cs = ins;

// Acceso libre del dueño: abrir /tu-audio/?k=CLAVE (se recuerda en ese navegador). Con la clave correcta el trabajo nace como pagado.
// Puede cambiarse con la variable AUD_FREE_KEY de Netlify; si no existe se usa esta.
const FREE_KEY = process.env.AUD_FREE_KEY || 'aud-JTsodYbJsuMy';
const freeKeyOk = (k) => { const a = Buffer.from(String(k || '')), b = Buffer.from(FREE_KEY); return a.length === b.length && crypto.timingSafeEqual(a, b); };

const TOOLS = {
    pista:   { price: process.env.AUD_PRICE_PISTA   || '4.99', server: true,  kind: 'audio' },
    voz:     { price: process.env.AUD_PRICE_VOZ     || '4.99', server: true,  kind: 'audio' },
    limpiar: { price: process.env.AUD_PRICE_LIMPIAR || '4.99', server: true,  kind: 'audio' },
    letra:   { price: process.env.AUD_PRICE_LETRA   || '1.99', server: true,  kind: 'text' },
    ajustar: { price: process.env.AUD_PRICE_AJUSTAR || '1.99', server: false, kind: 'local' }
};
const toolOk = (t) => !!TOOLS[t] && (!TOOLS[t].needs || !!process.env[TOOLS[t].needs]);
const availableTools = () => Object.keys(TOOLS).filter(toolOk).reduce((o, t) => (o[t] = TOOLS[t].price, o), {});

// ---------- Supabase (aud_jobs) ----------
function sb() { const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY; if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY'); return { url: url.replace(/\/$/, ''), key }; }
async function saveJob(row) {
    const { url, key } = sb();
    const res = await fetch(`${url}/rest/v1/aud_jobs?on_conflict=id`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) });
    if (!res.ok) throw new Error(`aud_jobs HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}
async function getJob(id) {
    const { url, key } = sb();
    const res = await fetch(`${url}/rest/v1/aud_jobs?id=eq.${encodeURIComponent(id)}&select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`aud_jobs HTTP ${res.status}`);
    return (await res.json())[0] || null;
}

// ---------- Replicate ----------
const REP = 'https://api.replicate.com/v1';
const repHeaders = () => { if (!process.env.REPLICATE_API_TOKEN) throw new Error('Falta REPLICATE_API_TOKEN'); return { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' }; };
const versions = {};
async function versionOf(model, override) {
    if (override) return override;
    if (versions[model]) return versions[model];
    const res = await fetch(`${REP}/models/${model}`, { headers: repHeaders() });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.latest_version || !d.latest_version.id) throw new Error(`Replicate: no se pudo leer el modelo ${model} (${res.status})`);
    return (versions[model] = d.latest_version.id);
}
function replicateInput(tool, audioUrl) {
    if (tool === 'pista' || tool === 'voz') return { model: process.env.REPLICATE_MODEL || 'ryan5453/demucs', version: process.env.REPLICATE_VERSION, input: { audio: audioUrl, stem: 'vocals', output_format: 'mp3', mp3_bitrate: 192 } };
    if (tool === 'letra') return { model: process.env.REPLICATE_WHISPER_MODEL || 'openai/whisper', version: process.env.REPLICATE_WHISPER_VERSION, input: { audio: audioUrl, transcription: 'plain text', translate: false, language: 'auto' } };
    // «Limpiar ruido»: por defecto resemble-ai/resemble-enhance con denoise_flag (solo quita el ruido, no regenera la voz).
    // Si se define REPLICATE_DENOISE_MODEL se usa ese otro modelo (entrada: «audio» + lo de REPLICATE_DENOISE_INPUT).
    let extra = {}; try { extra = JSON.parse(process.env.REPLICATE_DENOISE_INPUT || '{}'); } catch (_e) { /* se ignora */ }
    if (process.env.REPLICATE_DENOISE_MODEL) return { model: process.env.REPLICATE_DENOISE_MODEL, version: process.env.REPLICATE_DENOISE_VERSION, input: { audio: audioUrl, ...extra } };
    return { model: 'resemble-ai/resemble-enhance', version: process.env.REPLICATE_DENOISE_VERSION, input: { input_audio: audioUrl, denoise_flag: true, ...extra } };
}
async function startPrediction(tool, audioUrl) {
    const r = replicateInput(tool, audioUrl), version = await versionOf(r.model, r.version);
    const res = await fetch(`${REP}/predictions`, { method: 'POST', headers: repHeaders(), body: JSON.stringify({ version, input: r.input }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.id) throw new Error(`Replicate rechazó el trabajo (${res.status}): ${JSON.stringify(d).slice(0, 300)}`);
    return d.id;
}
async function getPrediction(id) {
    const res = await fetch(`${REP}/predictions/${encodeURIComponent(id)}`, { headers: repHeaders() });
    const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(`Replicate HTTP ${res.status}`); return d;
}
const isUrl = (v) => typeof v === 'string' && /^https?:\/\//.test(v);
// Demucs con stem=vocals devuelve la voz y «todo lo demás». wantVocals decide cuál se toma.
function pickStem(out, wantVocals) {
    const urls = [];
    if (isUrl(out)) urls.push(['', out]);
    else if (Array.isArray(out)) out.forEach((u) => isUrl(u) && urls.push(['', u]));
    else if (out && typeof out === 'object') Object.keys(out).forEach((k) => isUrl(out[k]) && urls.push([k, out[k]]));
    if (!urls.length) return null;
    const isV = ([k, u]) => /(^|[^a-z])vocals?([^a-z]|$)/i.test(k || u.split('/').pop()) && !/no[_-]?vocals?/i.test(k || u.split('/').pop());
    const pick = urls.find((p) => wantVocals ? isV(p) : !isV(p));
    return pick ? pick[1] : (urls.length === 1 && !wantVocals ? urls[0][1] : null);
}
function firstAudioUrl(out) {
    if (isUrl(out)) return out;
    if (Array.isArray(out)) return out.find(isUrl) || null;
    if (out && typeof out === 'object') { const k = Object.keys(out).find((x) => isUrl(out[x])); return k ? out[k] : null; }
    return null;
}
function pickText(out) {
    if (typeof out === 'string') return out;
    if (out && Array.isArray(out.segments) && out.segments.length) return out.segments.map((s) => String(s.text || '').trim()).filter(Boolean).join('\n');
    if (out && typeof out === 'object') return String(out.transcription || out.text || '');
    return '';
}

// ---------- Archivos ----------
// Enlace de entrega firmado (res.cloudinary.com) para que el NAVEGADOR lo lea (reproducir y procesar). No lleva vencimiento:
// solo se entrega al navegador cuando corresponde (fragmento: siempre; completo: solo si ya pagó).
function deliveryUrl(publicId) {
    const { cloud, secret } = cs.cld();
    const sig = crypto.createHash('sha1').update(publicId + secret).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').slice(0, 8);
    return `https://res.cloudinary.com/${cloud}/raw/authenticated/s--${sig}--/${publicId}`;
}
// Recorta unos segundos de un WAV PCM (para el fragmento de «limpiar» si el modelo entrega WAV).
function wavSlice(buf, startSec, secs) {
    if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return null;
    let p = 12, fmt = null, data = null;
    while (p + 8 <= buf.length) { const id = buf.toString('ascii', p, p + 4), sz = buf.readUInt32LE(p + 4); if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(p + 10), sr: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) }; if (id === 'data') { data = { at: p + 8, sz: Math.min(sz, buf.length - p - 8) }; break; } p += 8 + sz + (sz & 1); }
    if (!fmt || !data) return null;
    const frame = fmt.ch * (fmt.bits / 8), from = Math.floor(startSec * fmt.sr) * frame, len = Math.floor(secs * fmt.sr) * frame;
    const body = buf.subarray(data.at + Math.min(from, Math.max(0, data.sz - len)), data.at + Math.min(data.sz, from + len));
    const head = Buffer.alloc(44);   // encabezado canónico PCM (el original puede traer bloques extra como LIST)
    head.write('RIFF', 0, 'ascii'); head.writeUInt32LE(36 + body.length, 4); head.write('WAVEfmt ', 8, 'ascii'); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(fmt.ch, 22);
    head.writeUInt32LE(fmt.sr, 24); head.writeUInt32LE(fmt.sr * frame, 28); head.writeUInt16LE(frame, 32); head.writeUInt16LE(fmt.bits, 34); head.write('data', 36, 'ascii'); head.writeUInt32LE(body.length, 40);
    return Buffer.concat([head, body]);
}
const isMp3 = (b) => b.length > 4 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));
const isWav = (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF';

// Texto de la letra: fragmento visible antes de pagar (las primeras líneas).
function textPreview(text) { const lines = String(text || '').split('\n').filter(Boolean); return { preview: lines.slice(0, Math.min(6, Math.max(2, Math.ceil(lines.length * 0.2)))).join('\n'), totalLines: lines.length }; }

const publicJob = (j) => ({ id: j.id, tool: j.tool, status: j.status, paid: !!j.paid, price: j.price_usd != null ? String(j.price_usd) : null, seconds: j.seconds || null, error: j.status === 'failed' ? (j.error || 'No pudimos procesar este audio.') : null });

module.exports = { ...ins, freeKeyOk, TOOLS, toolOk, availableTools, saveJob, getJob, startPrediction, getPrediction, pickStem, firstAudioUrl, pickText, deliveryUrl, wavSlice, isMp3, isWav, textPreview, publicJob };
