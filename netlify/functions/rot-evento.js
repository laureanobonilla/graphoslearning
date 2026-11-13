// «Rótulo»: contador anónimo de pasos (cuántas personas llegan a cada paso, y si vienen del navegador interno de Facebook/Instagram).
// No guarda datos personales: solo suma 1 a una clave "ev:fecha:paso:origen" en rot_limites. Se lee en Supabase con:
//   select clave, n from rot_limites where clave like 'ev:%' order by clave desc;
const { json, today, contar } = require('./_lib/rot-core');
const PASOS = new Set(['rot_visit', 'rot_video_ready', 'rot_export_click', 'rot_auth_open', 'rot_auth_google', 'rot_auth_email', 'rot_nomark_click', 'rot_plan_pick', 'rot_paid', 'rot_pay_fail', 'rot_contact_open', 'rot_contact_sent', 'rot_exported', 'rot_install_offer', 'rot_inapp_banner', 'rot_inapp_copy', 'rot_inapp_open']);
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'x' }); }
    if (!PASOS.has(b.e)) return json(400, { error: 'x' });
    try { await contar(`ev:${today()}:${b.e}:${b.app ? 'app' : 'nav'}`, 1e9); } catch (e) { /* no importa */ }
    return json(200, { ok: true });
};
