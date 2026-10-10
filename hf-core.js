// «herramientas»: piezas compartidas por hf-save y hf-ai.
const { UUID_RE, json, scrub, scrubOne, countryOf, ipOf, hashIp } = require('./tc-core');

const TOOLS = ['fuga-de-tiempo', 'nivel-ia', 'ideas-posts', 'integra-ia', 'aprende'];
const APP_OF = { 'fuga-de-tiempo': 'hf-fuga-tiempo', 'nivel-ia': 'hf-nivel-ia', 'ideas-posts': 'hf-ideas-posts', 'integra-ia': 'hf-integra-ia', 'aprende': 'hf-aprende' };

// Limpia lo que escribe la persona: objetos de poca profundidad, textos acotados. Todo es DATO, nunca instrucción.
function cleanValue(v, depth = 0) {
    if (typeof v === 'string') return scrub(v, 700);
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v) && depth < 2) return v.slice(0, 12).map(x => cleanValue(x, depth + 1)).filter(x => x !== null && x !== '');
    if (v && typeof v === 'object' && depth < 2) return cleanAnswers(v, depth + 1);
    return null;
}
function cleanAnswers(o, depth = 0) {
    const out = {};
    if (!o || typeof o !== 'object') return out;
    Object.keys(o).slice(0, 40).forEach(k => {
        if (!/^[a-z0-9_]{1,40}$/i.test(k)) return;
        const v = cleanValue(o[k], depth);
        if (v !== null && v !== '' && !(Array.isArray(v) && !v.length)) out[k] = v;
    });
    return out;
}
const cleanEmail = (s) => { const e = scrubOne(s, 120).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : ''; };
const cleanWhatsapp = (s) => { const t = scrubOne(s, 30); const d = t.replace(/\D/g, ''); return d.length >= 8 && d.length <= 15 ? (t.startsWith('+') ? '+' + d : d) : ''; };

function sbCfg() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}
// Inserta o actualiza por sid. Solo se pisan las columnas que vienen en `row`.
async function saveRow(row) {
    const { url, key } = sbCfg();
    const res = await fetch(`${url}/rest/v1/hf_responses?on_conflict=sid`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...row, updated_at: new Date().toISOString() })
    });
    if (!res.ok) throw new Error(`hf_responses HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}
// El paso más lejano al que llegó no debe retroceder si la persona vuelve atrás.
async function currentStep(sid) {
    try {
        const { url, key } = sbCfg();
        const res = await fetch(`${url}/rest/v1/hf_responses?sid=eq.${encodeURIComponent(sid)}&select=step,completed,contact_email,contact_whatsapp`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
        if (!res.ok) return null;
        const rows = await res.json();
        return rows && rows[0] ? rows[0] : null;
    } catch { return null; }
}
module.exports = { sbCfg, TOOLS, APP_OF, UUID_RE, json, scrub, scrubOne, countryOf, ipOf, hashIp, cleanAnswers, cleanEmail, cleanWhatsapp, saveRow, currentStep };
