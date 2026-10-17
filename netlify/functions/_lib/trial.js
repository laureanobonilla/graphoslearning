// Esquema de prueba: un invitado (sin cuenta) solo puede generar UN esquema, y solo si llegó por el anuncio
// (Aprender). Todo lo demás exige cuenta. La verdad vive en el servidor (Supabase), no en cookies del navegador:
//   - «boleto» = el código (sid) de Aprender: su fila en hf_responses debe traer señal de anuncio (utm.campaign/ad)
//     y no haberse usado antes (evento trial_used con actor_id = sid).
//   - «tiene prueba» = existe un evento trial_used cuyo metadata.guest es este invitado.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET_MAX_AGE_H = 48;

function cfg() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}
async function get(path) {
    const { url, key } = cfg();
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`trial ${res.status}`);
    return res.json();
}

// ¿Esta fila de Aprender viene de un anuncio? (sin consultar si ya se usó)
async function adRow(sid) {
    if (!UUID_RE.test(String(sid || ''))) return null;
    const rows = await get(`hf_responses?sid=eq.${encodeURIComponent(sid)}&tool=eq.aprende&select=utm,created_at`);
    const r = Array.isArray(rows) && rows[0];
    if (!r) return null;
    const u = r.utm || {};
    if (!(u.campaign || u.ad)) return null;
    if (r.created_at && Date.now() - new Date(r.created_at).getTime() > TICKET_MAX_AGE_H * 3600 * 1000) return null;
    return r;
}
// Boleto válido = viene de anuncio y no se ha usado. Devuelve true/false.
async function ticketValid(sid) {
    if (!(await adRow(sid))) return false;
    const used = await get(`events?actor_id=eq.${encodeURIComponent(sid)}&event_name=eq.trial_used&select=id&limit=1`);
    return !(Array.isArray(used) && used.length);
}
async function guestHasTrial(guestId) {
    const rows = await get(`events?event_name=eq.trial_used&metadata->>guest=eq.${encodeURIComponent(guestId)}&select=id&limit=1`);
    return Array.isArray(rows) && rows.length > 0;
}

module.exports = { UUID_RE, adRow, ticketValid, guestHasTrial };
