// Pantalla de mantenimiento: lista y actualiza pedidos de las 4 apps (tu-cancion, tu-voz, tu-voz-video, tu-cancion-video).
// Solo entra quien inicia sesión (Netlify Identity) con el correo del dueño o uno de ADMIN_EMAILS.
const { getUser } = require('./_lib/auth');
const core = require('./_lib/cs-core');
const OWNER = 'bonillapretiz@gmail.com';
const STATUSES = ['nuevo', 'contactado', 'muestra_enviada', 'pagado', 'entregado', 'cancelado'];
const APPS = ['tu-cancion', 'tu-voz', 'tu-voz-video', 'tu-cancion-video'];
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

function sb() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), h: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
async function rest(path, opt) {
    const { url, h } = sb();
    const res = await fetch(`${url}/rest/v1/${path}`, { ...opt, headers: { ...h, ...((opt && opt.headers) || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
}
const tableOf = (app) => (app === 'tu-cancion' ? 'tc_songs' : 'cs_orders');

function fromTc(r) {
    return { app: 'tu-cancion', id: r.id, created_at: r.created_at, kind: r.status === 'requested' ? 'pedido' : 'intención WhatsApp', name: r.person_name || '', phone: r.phone || '', email: '',
        with_video: false, price_text: r.price_text || '', price_amount: Number(r.price_amount) || 0, currency: r.price_currency || 'CRC', title: r.title || '', rhythm: r.rhythm || '', notes: [r.details, r.notes].filter(Boolean).join('\n'),
        lyrics: r.lyrics_final || r.lyrics || '', has_files: false, country: r.country || '', fulfil_status: r.fulfil_status, paid: !!r.paid, paid_amount: r.paid_amount == null ? null : Number(r.paid_amount), admin_note: r.admin_note || '' };
}
function fromCs(r) {
    return { app: r.app, id: r.id, created_at: r.created_at, kind: 'pedido', name: r.contact_name || '', phone: r.phone || '', email: r.email || '', with_video: !!r.with_video, price_text: r.price_text || '', price_amount: Number(r.price_amount) || 0, currency: 'CRC',
        title: r.title || '', rhythm: (r.brief && (r.brief.rhythmOther || r.brief.rhythm)) || '', notes: r.notes || '', lyrics: r.lyrics_final || r.lyrics || '', has_files: !!(r.audio_id || r.photo_id), has_audio: !!r.audio_id, has_photo: !!r.photo_id,
        audio_seconds: r.audio_seconds || null, country: r.country || '', fulfil_status: r.fulfil_status, paid: !!r.paid, paid_amount: r.paid_amount == null ? null : Number(r.paid_amount), admin_note: r.admin_note || '' };
}

exports.handler = async (event, context) => {
    const user = getUser(context);
    if (!user) return json(401, { error: 'Inicia sesión.' });
    if ((user.email || '').toLowerCase() !== OWNER && !user.isAdmin) return json(403, { error: 'Este correo no tiene acceso.' });
    try {
        if (event.httpMethod === 'GET') {
            const q = event.queryStringParameters || {};
            if (q.action === 'links') {
                const id = String(q.id || '');
                if (!/^[\w-]{8,64}$/.test(id)) return json(400, { error: 'Id inválido' });
                const rows = await rest(`cs_orders?id=eq.${encodeURIComponent(id)}&select=audio_id,photo_id`);
                const r = rows && rows[0]; if (!r) return json(404, { error: 'No encontrado' });
                const out = {};
                for (const [kind, pid, types] of [['audio', r.audio_id, ['video', 'raw']], ['photo', r.photo_id, ['image']]]) {
                    if (!pid) continue;
                    for (const rt of types) { const info = await core.resourceInfo(pid, rt); if (info) { out[kind] = core.downloadUrl(pid, rt, info.format || '', 1); break; } }
                }
                return json(200, out);
            }
            const [tc, cs] = await Promise.all([
                rest('tc_songs?status=in.(requested,whatsapp_intent)&order=created_at.desc&limit=500').catch(e => { console.error('[mnt] tc_songs', e.message); return null; }),
                rest('cs_orders?order=created_at.desc&limit=500').catch(e => { console.error('[mnt] cs_orders', e.message); return null; })
            ]);
            const needsSql = (tc && tc[0] && tc[0].fulfil_status === undefined) || (cs && cs[0] && cs[0].fulfil_status === undefined);
            const orders = [...(tc || []).map(fromTc), ...(cs || []).map(fromCs)].map(o => ({ ...o, fulfil_status: o.fulfil_status || 'nuevo' })).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
            return json(200, { orders, statuses: STATUSES, tablesMissing: { tc_songs: tc === null, cs_orders: cs === null }, needsSql: !!needsSql });
        }
        if (event.httpMethod === 'POST') {
            let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
            const app = String(b.app || ''), id = String(b.id || '');
            if (!APPS.includes(app) || !/^[\w-]{8,64}$/.test(id)) return json(400, { error: 'Solicitud inválida' });
            const patch = {};
            if (b.fulfil_status !== undefined) { if (!STATUSES.includes(b.fulfil_status)) return json(400, { error: 'Estado inválido' }); patch.fulfil_status = b.fulfil_status; }
            if (b.paid !== undefined) { patch.paid = b.paid === true; patch.paid_at = patch.paid ? new Date().toISOString() : null; }
            if (b.paid_amount !== undefined) {
                if (b.paid_amount === null || b.paid_amount === '') patch.paid_amount = null;
                else { const n = Number(b.paid_amount); if (!isFinite(n) || n < 0 || n > 1e9) return json(400, { error: 'Monto inválido' }); patch.paid_amount = n; }
            }
            if (b.admin_note !== undefined) patch.admin_note = String(b.admin_note || '').slice(0, 1500);
            if (!Object.keys(patch).length) return json(400, { error: 'Nada que guardar' });
            const rows = await rest(`${tableOf(app)}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
            if (!rows || !rows.length) return json(404, { error: 'No encontrado' });
            return json(200, { ok: true, saved: patch });
        }
        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (e) {
        console.error('[mnt-orders]', e.message);
        const missing = /fulfil_status|paid|admin_note|column/i.test(e.message);
        return json(500, { error: missing ? 'Falta correr supabase/mantenimiento.sql en Supabase.' : 'Error del servidor.' });
    }
};
