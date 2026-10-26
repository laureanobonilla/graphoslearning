// Mensajes entre usuarios (buzón: se reciben aunque la otra persona no esté conectada) + cuentas del Equipo.
// El Equipo son nombres de rol (Soporte, Guía de estudio, Creador): los mensajes que se les escriben le llegan al dueño
// (usuario admin), que responde en nombre del rol. Solo se muestra «en línea» cuando el dueño de verdad está conectado.
const { getUser } = require('./_lib/auth');
const { send, esc, OWNER, FROM_OWNER } = require('./_lib/qer-email');
const store = require('./_lib/store');
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

const STAFF = {
    'staff:creador': { name: 'Creador de Graphikosmos', role: 'Equipo' },
    'staff:soporte': { name: 'Soporte', role: 'Equipo' },
    'staff:guia': { name: 'Guía de estudio', role: 'Equipo' }
};
const ONLINE_MS = 75 * 1000, MAX_BODY = 1000, MAX_IMG = 260000;
const T = (path, opt) => store.table(path, opt);
const q = encodeURIComponent;
const handleOf = (user) => { const base = String(user.email || 'usuario').split('@')[0].replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 14) || 'usuario'; return base; };

async function ownerOnline() {          // el dueño = alguna cuenta admin con latido reciente
    const rows = await T(`msg_users?select=user_id,last_seen&handle=eq.${q('​admin')}&limit=1`).catch(() => []);
    return !!(rows && rows[0] && Date.now() - new Date(rows[0].last_seen).getTime() < ONLINE_MS);
}

exports.handler = async (event, context) => {
    const user = getUser(context);
    if (!user) return json(401, { error: 'login' });
    const qs = event.queryStringParameters || {};
    let body = {}; if (event.httpMethod === 'POST') { try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); } }
    const a = qs.a || body.a;
    const me = user.id, now = new Date().toISOString();
    try {
        if (a === 'ping') {                         // latido: marca «en línea» y crea el nombre visible la primera vez
            const rows = await T(`msg_users?user_id=eq.${q(me)}&select=handle`);
            const handle = user.isAdmin ? '​admin' : (rows && rows[0] ? rows[0].handle : handleOf(user));
            await T('msg_users?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: me, handle, last_seen: now }) });
            return json(200, { ok: true });
        }
        if (a === 'list') {
            const since = new Date(Date.now() - 30 * 86400000).toISOString();
            const [users, unreadRows, online] = await Promise.all([
                T(`msg_users?select=user_id,handle,last_seen&last_seen=gte.${q(since)}&user_id=neq.${q(me)}&handle=neq.${q('​admin')}&order=last_seen.desc&limit=80`),
                T(`msg_messages?to_id=eq.${q(me)}&read_at=is.null&select=from_id&limit=500`),
                ownerOnline()
            ]);
            const unread = {}; (unreadRows || []).forEach((r) => { unread[r.from_id] = (unread[r.from_id] || 0) + 1; });
            const staff = Object.entries(STAFF).map(([id, s]) => ({ id, name: s.name, badge: s.role, online, unread: unread[id] || 0 }));
            const list = (users || []).map((u) => ({ id: u.user_id, name: u.handle, online: Date.now() - new Date(u.last_seen).getTime() < ONLINE_MS, unread: unread[u.user_id] || 0 }));
            return json(200, { staff, users: list, totalUnread: Object.values(unread).reduce((x, y) => x + y, 0), isAdmin: !!user.isAdmin });
        }
        if (a === 'thread') {
            const w = String(qs.with || '').slice(0, 120); if (!w) return json(400, { error: 'falta' });
            const rows = await T(`msg_messages?or=(and(from_id.eq.${q(me)},to_id.eq.${q(w)}),and(from_id.eq.${q(w)},to_id.eq.${q(me)}))&select=id,from_id,body,image,created_at&order=created_at.desc&limit=60`);
            T(`msg_messages?to_id=eq.${q(me)}&from_id=eq.${q(w)}&read_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ read_at: now }) }).catch(() => {});
            return json(200, { messages: (rows || []).reverse().map((m) => ({ id: m.id, mine: m.from_id === me, body: m.body, image: m.image, at: m.created_at })) });
        }
        if (a === 'send') {
            const to = String(body.to || '').slice(0, 120), text = String(body.body || '').trim().slice(0, MAX_BODY);
            const image = typeof body.image === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.image) && body.image.length <= MAX_IMG ? body.image : null;
            if (!to || (!text && !image) || to === me) return json(400, { error: 'vacío' });
            if (to.startsWith('staff:')) { if (!STAFF[to]) return json(400, { error: 'destino' }); }
            else if (!(await T(`msg_users?user_id=eq.${q(to)}&select=user_id`))[0]) return json(404, { error: 'destino' });
            const recent = await T(`msg_messages?from_id=eq.${q(me)}&created_at=gte.${q(new Date(Date.now() - 10 * 60000).toISOString())}&select=id&limit=40`);
            if ((recent || []).length >= 30) return json(429, { error: 'demasiados' });
            await T('msg_messages', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ from_id: me, to_id: to, body: text, image }) });
            if (to.startsWith('staff:')) {            // al dueño le llega también por correo
                const who = (await T(`msg_users?user_id=eq.${q(me)}&select=handle`))[0];
                send({ from: FROM_OWNER(), to: OWNER(), subject: `Mensaje para ${STAFF[to].name}`, text: `${who ? who.handle : 'Un usuario'} (${user.email || me}) escribió a «${STAFF[to].name}»:\n\n${text}${image ? '\n\n[incluye imagen]' : ''}\n\nResponde desde Graphikosmos → Mensajes.`, html: `<p><b>${esc(who ? who.handle : 'Un usuario')}</b> (${esc(user.email || me)}) escribió a «${esc(STAFF[to].name)}»:</p><p>${esc(text).replace(/\n/g, '<br>')}</p>${image ? '<p>[incluye imagen]</p>' : ''}<p>Responde desde Graphikosmos → Mensajes.</p>` }).catch(() => {});
            }
            try { await store.logEvent(me, 'user', null, 'msg_sent', { to: to.startsWith('staff:') ? to : 'user', image: !!image }, user.email || null, 'graphikosmos'); } catch (_e) { /* no crítico */ }
            return json(200, { ok: true });
        }
        // ---- solo el dueño (admin) ----
        if (!user.isAdmin) return json(403, { error: 'admin' });
        if (a === 'inbox') {          // conversaciones dirigidas al Equipo, agrupadas por persona
            const rows = await T(`msg_messages?or=(to_id.like.staff:*,from_id.like.staff:*)&select=id,from_id,to_id,body,image,created_at&order=created_at.desc&limit=300`);
            const names = {}; (await T('msg_users?select=user_id,handle&limit=1000')).forEach((u) => { names[u.user_id] = u.handle; });
            const convs = {};
            (rows || []).forEach((m) => { const person = m.from_id.startsWith('staff:') ? m.to_id : m.from_id, alias = m.from_id.startsWith('staff:') ? m.from_id : m.to_id, k = person + '|' + alias; (convs[k] = convs[k] || { person, name: names[person] || 'usuario', alias, aliasName: (STAFF[alias] || {}).name, last: m.created_at, msgs: [] }).msgs.unshift({ fromTeam: m.from_id.startsWith('staff:'), body: m.body, image: m.image, at: m.created_at }); });
            return json(200, { conversations: Object.values(convs).sort((x, y) => (y.last > x.last ? 1 : -1)) });
        }
        if (a === 'reply') {
            const as = String(body.as || ''), to = String(body.to || '').slice(0, 120), text = String(body.body || '').trim().slice(0, MAX_BODY);
            if (!STAFF[as] || !to || !text) return json(400, { error: 'datos' });
            await T('msg_messages', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ from_id: as, to_id: to, body: text }) });
            return json(200, { ok: true });
        }
        if (a === 'between') {        // mensajes entre usuarios (se avisa a todos en el chat que pueden revisarse)
            const rows = await T(`msg_messages?from_id=not.like.staff:*&to_id=not.like.staff:*&select=from_id,to_id,body,image,created_at&order=created_at.desc&limit=200`);
            const names = {}; (await T('msg_users?select=user_id,handle&limit=1000')).forEach((u) => { names[u.user_id] = u.handle; });
            return json(200, { messages: (rows || []).map((m) => ({ from: names[m.from_id] || '?', to: names[m.to_id] || '?', body: m.body, image: !!m.image, at: m.created_at })) });
        }
        return json(400, { error: 'acción' });
    } catch (err) {
        console.error('[msg]', err.message);
        return json(503, { error: 'no_disponible' });
    }
};
