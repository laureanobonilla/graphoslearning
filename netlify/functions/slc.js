// SuperLiveChat: toda la lógica del servidor (perfiles, fotos, descubrir, matches, chat, gemas, videollamadas).
// El navegador manda  Authorization: Bearer <JWT de Supabase Auth>  y  { action, ... }. Aquí se verifica quién es y se usa la clave de servicio.
// Tablas y funciones SQL: supabase/superlivechat.sql
const crypto = require('crypto');
const { generateWithRetries } = require('./_lib/qer-gemini');
const { createOrder, captureOrder } = require('./_lib/paypal');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const fail = (code, msg, extra) => Object.assign(new Error(msg), { http: code, extra });
const nf = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f<>]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, n);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ----- Reglas del negocio -----
const GEMS_PER_MIN = 2000;                 // un minuto de videollamada = 2.000 gemas ≈ US$1
const PACKS = {                            // el precio lo decide SIEMPRE el servidor
    g1: { usd: '4.99',  gems: 10000 },     // 5 min
    g2: { usd: '9.99',  gems: 21000 },     // 10,5 min
    g3: { usd: '14.99', gems: 33000 },     // 16,5 min
    g4: { usd: '24.99', gems: 58000 },     // 29 min
    g5: { usd: '49.99', gems: 125000 }     // 62,5 min
};
const MAX_PHOTOS = 6, ONLINE_MS = 3 * 60 * 1000, RING_MS = 40 * 1000;

// ----- Límites sencillos en memoria (por instancia) -----
const hits = new Map();
function limited(key, max, win) { const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < win); h.push(now); hits.set(key, h); if (hits.size > 3000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > win) hits.delete(k); return h.length > max; }

// ----- Supabase -----
function env() { const url = (process.env.SUPABASE_URL || '').replace(/\/$/, ''), key = process.env.SUPABASE_SERVICE_KEY || ''; if (!url || !key) throw fail(503, 'Servicio no configurado'); return { url, key }; }
async function sb(method, path, body, extra) {
    const { url, key } = env();
    const r = await fetch(url + '/rest/v1/' + path, { method, headers: Object.assign({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, extra || {}), body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    if (!r.ok) { const e = new Error('db ' + r.status + ' ' + t.slice(0, 300)); e.status = r.status; e.body = t; throw e; }
    return t ? JSON.parse(t) : null;
}
const rpc = (name, args) => sb('POST', 'rpc/' + name, args);
const q = (v) => encodeURIComponent(v);
async function verifyJwt(token) {
    const { url, key } = env();
    const r = await fetch(url + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
}
async function signPaths(paths) {   // → { path: url }
    const out = {}; const list = [...new Set(paths.filter(Boolean))];
    if (!list.length) return out;
    const { url, key } = env();
    const r = await fetch(url + '/storage/v1/object/sign/slc-photos', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 * 3, paths: list }) });
    if (!r.ok) { console.error('[slc] firmar fotos', r.status); return out; }
    const arr = await r.json();
    for (const it of arr || []) if (it.signedURL && it.path) out[it.path] = url + '/storage/v1' + it.signedURL;
    return out;
}
async function upload(path, buf) {
    const { url, key } = env();
    const r = await fetch(url + '/storage/v1/object/slc-photos/' + path, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: buf });
    if (!r.ok) throw new Error('storage ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
async function removeFiles(paths) {
    if (!paths.length) return;
    const { url, key } = env();
    try { await fetch(url + '/storage/v1/object/slc-photos', { method: 'DELETE', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) }); } catch (e) { console.error('[slc] borrar archivos', e.message); }
}

// ----- Utilidades -----
const ageOf = (iso) => { const d = new Date(iso + 'T00:00:00Z'); if (isNaN(d)) return -1; const n = new Date(); let a = n.getUTCFullYear() - d.getUTCFullYear(); if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) a--; return a; };
const countryOf = (event) => { try { const h = event.headers || {}; const raw = h['x-nf-geo']; const c = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))?.country?.code : ''; return c && /^[A-Za-z]{2}$/.test(c) ? String(c).toUpperCase() : ''; } catch { return ''; } };
const ordered = (a, b) => (a < b ? [a, b] : [b, a]);
const compatible = (me, o) => (me.seeking === 'b' || me.seeking === o.gender) && (o.seeking === 'b' || o.seeking === me.gender);
const publicOf = (p, photo) => ({ id: p.user_id, name: p.name, gender: p.gender, age: ageOf(p.birthdate), country: p.country || '', bio: p.bio || '', online: !!p.last_seen && Date.now() - new Date(p.last_seen).getTime() < ONLINE_MS, photo: photo || null });
async function getProfile(id) { const r = await sb('GET', 'slc_profiles?user_id=eq.' + q(id) + '&select=*&limit=1'); return r && r[0] || null; }
async function isBlocked(a, b) { const r = await sb('GET', `slc_blocks?or=(and(blocker.eq.${a},blocked.eq.${b}),and(blocker.eq.${b},blocked.eq.${a}))&select=blocker&limit=1`); return !!(r && r.length); }
async function firstPhotos(ids) {   // user_id → path de la primera foto aprobada
    const map = {}; if (!ids.length) return map;
    const rows = await sb('GET', `slc_photos?user_id=in.(${ids.join(',')})&status=eq.approved&select=user_id,path,pos,created_at&order=pos.asc,created_at.asc`);
    for (const r of rows || []) if (!map[r.user_id]) map[r.user_id] = r.path;
    return map;
}
async function approvedPhotos(id) { return (await sb('GET', `slc_photos?user_id=eq.${id}&status=eq.approved&select=id,path&order=pos.asc,created_at.asc`)) || []; }
async function refreshStatus(id) {   // activo solo si tiene al menos una foto aprobada
    const p = await getProfile(id); if (!p || p.status === 'suspended') return p;
    const n = (await approvedPhotos(id)).length;
    const st = n > 0 ? 'active' : 'incomplete';
    if (st !== p.status) await sb('PATCH', 'slc_profiles?user_id=eq.' + q(id), { status: st }, { Prefer: 'return=minimal' });
    return Object.assign(p, { status: st });
}
const needActive = (p) => { if (!p) throw fail(403, 'Primero completa tu perfil.', { codigo: 'sin_perfil' }); if (p.status === 'suspended') throw fail(403, 'Tu cuenta está suspendida.', { codigo: 'suspendida' }); if (p.status !== 'active') throw fail(403, 'Sube una foto aprobada para empezar a interactuar.', { codigo: 'sin_foto' }); return p; };
async function eligibleOther(me, otherId) {   // la otra persona existe, está activa, es compatible y no hay bloqueo
    if (!UUID.test(String(otherId || ''))) throw fail(400, 'Solicitud inválida');
    const o = await getProfile(otherId);
    if (!o || o.status !== 'active' || otherId === me.user_id) throw fail(404, 'Esa persona ya no está disponible.');
    if (!compatible(me, o) || await isBlocked(me.user_id, otherId)) throw fail(404, 'Esa persona ya no está disponible.');
    return o;
}
async function convOf(a, b, create) {
    const [x, y] = ordered(a, b);
    const r = await sb('GET', `slc_convs?a=eq.${x}&b=eq.${y}&select=id&limit=1`);
    if (r && r[0]) return r[0].id;
    if (!create) return null;
    try { const c = await sb('POST', 'slc_convs', { a: x, b: y }, { Prefer: 'return=representation' }); return c[0].id; }
    catch (e) { const r2 = await sb('GET', `slc_convs?a=eq.${x}&b=eq.${y}&select=id&limit=1`); if (r2 && r2[0]) return r2[0].id; throw e; }
}

// ----- Moderación de fotos con IA -----
const MOD_SCHEMA = { type: 'OBJECT', properties: {
    faceVisible: { type: 'BOOLEAN', description: 'true si hay UNA persona real con la cara claramente visible (no dibujo, no foto de pantalla, no famoso en póster, no objeto).' },
    appearsUnder18: { type: 'BOOLEAN', description: 'true si la persona parece menor de 18 años o tienes duda razonable.' },
    explicit: { type: 'BOOLEAN', description: 'true si hay desnudez, ropa interior o contenido sexual, genitales, o violencia/sangre.' },
    hasContactInfo: { type: 'BOOLEAN', description: 'true si se ve un número de teléfono, usuario de red social, QR o publicidad escrita.' },
    multiplePeople: { type: 'BOOLEAN', description: 'true si hay varias personas y no se sabe cuál es el dueño del perfil.' },
    note: { type: 'STRING', description: 'Una frase corta en español que explique la decisión.' } },
    required: ['faceVisible', 'appearsUnder18', 'explicit', 'hasContactInfo', 'multiplePeople', 'note'] };
const MOD_PROMPT = 'Eres moderador de una app de citas para adultos. Mira la foto de perfil y responde con el JSON pedido. Sé estricto con menores de edad y desnudez; sé justo con el resto: una persona sonriendo en la playa o con gafas de sol puestas en la cabeza es válida, pero con gafas oscuras tapando los ojos NO se considera cara claramente visible.';
async function moderate(b64) {
    const parts = [{ inlineData: { mimeType: 'image/jpeg', data: b64 } }, { text: MOD_PROMPT }];
    const d = await generateWithRetries([{ role: 'user', parts }], MOD_SCHEMA, (x) => x && typeof x.faceVisible === 'boolean' && typeof x.appearsUnder18 === 'boolean' && typeof x.explicit === 'boolean', { tag: 'slc-foto', maxOutputTokens: 600, deadline: Date.now() + 20000, attemptMs: 9000 });
    if (d.appearsUnder18) return { status: 'rejected', reason: 'La foto parece de una persona menor de 18 años. SuperLiveChat es solo para mayores de edad.' };
    if (d.explicit) return { status: 'rejected', reason: 'No se permiten fotos con desnudez, ropa interior o contenido sexual.' };
    if (!d.faceVisible) return { status: 'rejected', reason: 'No se ve tu cara con claridad. Sube una foto tuya, de frente y sin lentes oscuros.' };
    if (d.hasContactInfo) return { status: 'rejected', reason: 'La foto muestra datos de contacto o publicidad. Sube otra sin textos.' };
    if (d.multiplePeople) return { status: 'rejected', reason: 'Aparece más de una persona. Sube una foto en la que se vea que eres tú.' };
    return { status: 'approved', reason: clean(d.note, 200) };
}

// ----- Acciones -----
const A = {};

A.me = async (ctx) => {
    let p = ctx.profile;
    const out = { user: { id: ctx.user.id, email: ctx.user.email }, profile: null, photos: [], packs: Object.entries(PACKS).map(([id, v]) => ({ id, usd: v.usd, gems: v.gems, minutes: Math.round(v.gems / GEMS_PER_MIN * 10) / 10 })), gemsPerMin: GEMS_PER_MIN, ice: iceServers() };
    if (!p) return out;
    const patch = { last_seen: new Date().toISOString() }; if (!p.country && ctx.country) { patch.country = ctx.country; p.country = ctx.country; }
    await sb('PATCH', 'slc_profiles?user_id=eq.' + q(p.user_id), patch, { Prefer: 'return=minimal' });
    const ph = await sb('GET', `slc_photos?user_id=eq.${p.user_id}&select=id,path,status,reason,pos&order=pos.asc,created_at.asc`) || [];
    const urls = await signPaths(ph.map((x) => x.path));
    out.profile = { name: p.name, gender: p.gender, seeking: p.seeking, birthdate: p.birthdate, age: ageOf(p.birthdate), country: p.country || '', bio: p.bio, status: p.status, gems: p.gems };
    out.photos = ph.map((x) => ({ id: x.id, url: urls[x.path] || null, status: x.status, reason: x.reason }));
    return out;
};
function iceServers() {
    const l = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    if (process.env.SLC_TURN_URL) l.push({ urls: process.env.SLC_TURN_URL.split(',').map((s) => s.trim()), username: process.env.SLC_TURN_USER || '', credential: process.env.SLC_TURN_PASS || '' });
    return l;
}

A.saveProfile = async (ctx, b) => {
    const name = clean(b.name, 30), bio = clean(b.bio, 300);
    if (name.length < 2) throw fail(400, 'Escribe tu nombre (mínimo 2 letras).');
    const seeking = ['m', 'f', 'b'].includes(b.seeking) ? b.seeking : null; if (!seeking) throw fail(400, 'Elige a quién quieres conocer.');
    const ex = ctx.profile;
    if (ex) {   // el género y la fecha de nacimiento no se cambian después (el género decide quién paga las llamadas)
        await sb('PATCH', 'slc_profiles?user_id=eq.' + q(ex.user_id), { name, bio, seeking }, { Prefer: 'return=minimal' });
        return { ok: true };
    }
    if (b.adult !== true) throw fail(400, 'Debes confirmar que eres mayor de edad.');
    const gender = b.gender === 'm' || b.gender === 'f' ? b.gender : null; if (!gender) throw fail(400, 'Elige hombre o mujer.');
    const bd = String(b.birthdate || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) throw fail(400, 'Escribe tu fecha de nacimiento.');
    const age = ageOf(bd); if (age < 18) throw fail(403, 'SuperLiveChat es solo para mayores de 18 años.', { codigo: 'menor' }); if (age > 99) throw fail(400, 'Revisa tu fecha de nacimiento.');
    await sb('POST', 'slc_profiles', { user_id: ctx.user.id, email: ctx.user.email || null, name, gender, seeking, birthdate: bd, country: ctx.country || null, bio, adult_ok_at: new Date().toISOString(), last_seen: new Date().toISOString() }, { Prefer: 'return=minimal,resolution=ignore-duplicates' });
    return { ok: true };
};

A.addPhoto = async (ctx, b) => {
    const p = ctx.profile; if (!p) throw fail(403, 'Primero completa tu perfil.');
    if (p.status === 'suspended') throw fail(403, 'Tu cuenta está suspendida.');
    const img = String(b.image || '');
    if (!/^[A-Za-z0-9+/=]{2000,}$/.test(img) || img.length > 4_500_000) throw fail(400, 'No pudimos leer esa foto. Prueba con otra.');
    if (limited('ph:' + p.user_id, 12, 3600 * 1000)) throw fail(429, 'Subiste muchas fotos seguidas. Espera un rato e inténtalo de nuevo.');
    const mine = await sb('GET', `slc_photos?user_id=eq.${p.user_id}&status=in.(approved,pending,review)&select=id,pos&order=pos.desc`) || [];
    if (mine.length >= MAX_PHOTOS) throw fail(400, `Puedes tener hasta ${MAX_PHOTOS} fotos. Borra una para subir otra.`);
    let verdict, ia = true;
    try { verdict = await moderate(img); } catch (e) { console.error('[slc] moderación falló', e.message); verdict = { status: 'review', reason: 'Pendiente de revisión manual' }; ia = false; }
    if (verdict.status === 'rejected') return { ok: false, rejected: true, reason: verdict.reason };
    const path = `${p.user_id}/${crypto.randomUUID()}.jpg`;
    await upload(path, Buffer.from(img, 'base64'));
    const pos = mine.length ? mine[0].pos + 1 : 0;
    const row = await sb('POST', 'slc_photos', { user_id: p.user_id, path, pos, status: verdict.status, reason: verdict.reason }, { Prefer: 'return=representation' });
    const st = await refreshStatus(p.user_id);
    return { ok: true, status: verdict.status, reviewed: ia, id: row[0].id, profileStatus: st && st.status };
};
A.deletePhoto = async (ctx, b) => {
    const p = ctx.profile; if (!p || !UUID.test(String(b.id || ''))) throw fail(400, 'Solicitud inválida');
    const r = await sb('DELETE', `slc_photos?id=eq.${b.id}&user_id=eq.${p.user_id}`, undefined, { Prefer: 'return=representation' });
    await removeFiles((r || []).map((x) => x.path));
    await refreshStatus(p.user_id);
    return { ok: true };
};
A.makeMain = async (ctx, b) => {
    const p = ctx.profile; if (!p || !UUID.test(String(b.id || ''))) throw fail(400, 'Solicitud inválida');
    const all = await sb('GET', `slc_photos?user_id=eq.${p.user_id}&select=id,pos&order=pos.asc`) || [];
    const lowest = all.length ? all[0].pos : 0;
    await sb('PATCH', `slc_photos?id=eq.${b.id}&user_id=eq.${p.user_id}`, { pos: lowest - 1 }, { Prefer: 'return=minimal' });
    return { ok: true };
};

async function decorate(rows, extra) {
    const urls = await signPaths(rows.map((r) => r.photo_path));
    return rows.map((r) => Object.assign({ id: r.user_id || r.other, name: r.name, gender: r.gender, age: r.age, country: r.country || '', bio: r.bio || '', online: !!r.online, photo: r.photo_path ? urls[r.photo_path] || null : null, nPhotos: r.n_photos }, extra ? extra(r) : {}));
}
A.feed = async (ctx, b) => {
    const me = needActive(ctx.profile);
    const mode = b.mode === 'people' ? 'people' : 'discover';
    const country = /^[A-Za-z]{2}$/.test(String(b.country || '')) ? String(b.country).toUpperCase() : '';
    const rows = await rpc('slc_feed', { p_me: me.user_id, p_mode: mode, p_country: country, p_limit: mode === 'discover' ? 12 : 30, p_offset: Math.max(0, Math.min(5000, parseInt(b.offset, 10) || 0)) });
    return { people: await decorate(rows || []) };
};
A.countries = async (ctx) => {
    needActive(ctx.profile);
    const rows = await sb('GET', 'slc_profiles?status=eq.active&country=not.is.null&select=country&limit=5000') || [];
    const c = {}; for (const r of rows) c[r.country] = (c[r.country] || 0) + 1;
    return { countries: Object.entries(c).sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, n })) };
};
A.profile = async (ctx, b) => {
    const me = needActive(ctx.profile);
    const o = await eligibleOther(me, b.id);
    const ph = await approvedPhotos(o.user_id);
    const urls = await signPaths(ph.map((x) => x.path));
    const conv = await convOf(me.user_id, o.user_id, false);
    const [x, y] = ordered(me.user_id, o.user_id);
    const m = await sb('GET', `slc_matches?a=eq.${x}&b=eq.${y}&select=a&limit=1`);
    return { person: Object.assign(publicOf(o), { photos: ph.map((z) => urls[z.path]).filter(Boolean), photo: urls[ph[0] && ph[0].path] || null }), conv, matched: !!(m && m.length) };
};
A.like = async (ctx, b) => {
    const me = needActive(ctx.profile);
    if (limited('lk:' + me.user_id, 200, 3600 * 1000)) throw fail(429, 'Vas muy rápido. Espera un momento.');
    const o = await eligibleOther(me, b.to);
    const kind = b.kind === 'pass' ? 'pass' : 'like';
    await sb('POST', 'slc_likes?on_conflict=from_id,to_id', { from_id: me.user_id, to_id: o.user_id, kind }, { Prefer: 'return=minimal,resolution=merge-duplicates' });
    if (kind === 'pass') return { ok: true, matched: false };
    const back = await sb('GET', `slc_likes?from_id=eq.${o.user_id}&to_id=eq.${me.user_id}&kind=eq.like&select=from_id&limit=1`);
    if (!(back && back.length)) return { ok: true, matched: false };
    const [x, y] = ordered(me.user_id, o.user_id);
    await sb('POST', 'slc_matches', { a: x, b: y }, { Prefer: 'return=minimal,resolution=ignore-duplicates' });
    const conv = await convOf(me.user_id, o.user_id, true);
    const ph = await firstPhotos([o.user_id]); const urls = await signPaths([ph[o.user_id]]);
    return { ok: true, matched: true, conv, person: publicOf(o, urls[ph[o.user_id]]) };
};
A.convs = async (ctx) => {
    const me = needActive(ctx.profile);
    const rows = await rpc('slc_convs', { p_me: me.user_id }) || [];
    const urls = await signPaths(rows.map((r) => r.photo_path));
    return { convs: rows.map((r) => ({ conv: r.conv, id: r.other, name: r.name, photo: urls[r.photo_path] || null, online: r.online, last: r.last_body || '', lastAt: r.last_at, lastMine: r.last_mine, unread: r.unread, matched: r.matched })) };
};
async function convFor(me, b) {   // valida que la conversación sea mía
    const id = parseInt(b.conv, 10); if (!id) throw fail(400, 'Solicitud inválida');
    const r = await sb('GET', `slc_convs?id=eq.${id}&select=id,a,b&limit=1`); const c = r && r[0];
    if (!c || (c.a !== me.user_id && c.b !== me.user_id)) throw fail(404, 'Conversación no encontrada.');
    const otherId = c.a === me.user_id ? c.b : c.a;
    if (await isBlocked(me.user_id, otherId)) throw fail(403, 'No puedes escribir a esta persona.');
    return { id: c.id, otherId };
}
A.messages = async (ctx, b) => {
    const me = needActive(ctx.profile); const c = await convFor(me, b);
    const after = Math.max(0, parseInt(b.after, 10) || 0);
    const rows = await sb('GET', `slc_msgs?conv=eq.${c.id}&id=gt.${after}&select=id,sender,body,created_at,read_at&order=id.asc&limit=200`) || [];
    if (rows.some((m) => m.sender !== me.user_id && !m.read_at)) await sb('PATCH', `slc_msgs?conv=eq.${c.id}&sender=neq.${me.user_id}&read_at=is.null`, { read_at: new Date().toISOString() }, { Prefer: 'return=minimal' });
    const o = await getProfile(c.otherId);
    return { msgs: rows.map((m) => ({ id: m.id, mine: m.sender === me.user_id, body: m.body, at: m.created_at, read: !!m.read_at })), other: o ? { id: o.user_id, name: o.name, online: !!o.last_seen && Date.now() - new Date(o.last_seen).getTime() < ONLINE_MS, gender: o.gender } : null };
};
A.send = async (ctx, b) => {
    const me = needActive(ctx.profile);
    const body = clean(b.body, 1000); if (!body) throw fail(400, 'Escribe un mensaje.');
    if (limited('msg:' + me.user_id, 40, 60 * 1000)) throw fail(429, 'Estás escribiendo muy rápido. Espera unos segundos.');
    let conv;
    if (b.conv) { const c = await convFor(me, b); conv = c.id; await eligibleOther(me, c.otherId); }
    else { const o = await eligibleOther(me, b.to); conv = await convOf(me.user_id, o.user_id, true); }
    const r = await sb('POST', 'slc_msgs', { conv, sender: me.user_id, body }, { Prefer: 'return=representation' });
    return { ok: true, conv, id: r[0].id };
};
A.block = async (ctx, b) => {
    const me = ctx.profile; if (!me || !UUID.test(String(b.id || ''))) throw fail(400, 'Solicitud inválida');
    await sb('POST', 'slc_blocks', { blocker: me.user_id, blocked: b.id }, { Prefer: 'return=minimal,resolution=ignore-duplicates' });
    return { ok: true };
};
A.report = async (ctx, b) => {
    const me = ctx.profile; if (!me || !UUID.test(String(b.id || ''))) throw fail(400, 'Solicitud inválida');
    if (limited('rp:' + me.user_id, 10, 3600 * 1000)) throw fail(429, 'Ya enviaste varios reportes. Los revisaremos pronto.');
    const reason = ['fake', 'minor', 'nudity', 'harass', 'scam', 'other'].includes(b.reason) ? b.reason : 'other';
    await sb('POST', 'slc_reports', { reporter: me.user_id, reported: b.id, reason, detail: clean(b.detail, 500) || null }, { Prefer: 'return=minimal' });
    if (b.block !== false) await A.block(ctx, b);
    return { ok: true };
};

// ----- Gemas y PayPal -----
A.payCreate = async (ctx, b) => {
    const me = ctx.profile; if (!me) throw fail(403, 'Primero completa tu perfil.');
    const pack = PACKS[b.pack]; if (!pack) throw fail(400, 'Paquete inválido');
    if (limited('pay:' + me.user_id, 15, 3600 * 1000)) throw fail(429, 'Demasiados intentos. Espera un momento.');
    const orderID = await createOrder(pack.usd, 'slc:' + me.user_id + ':' + b.pack);
    await sb('POST', 'slc_orders', { order_id: orderID, user_id: me.user_id, pack: b.pack, gems: pack.gems, usd: pack.usd }, { Prefer: 'return=minimal' });
    return { orderID };
};
A.payCapture = async (ctx, b) => {
    const me = ctx.profile; const orderID = String(b.orderID || '');
    if (!me || !/^[A-Z0-9]{8,40}$/i.test(orderID)) throw fail(400, 'Solicitud inválida');
    const rows = await sb('GET', `slc_orders?order_id=eq.${q(orderID)}&user_id=eq.${me.user_id}&select=*&limit=1`); const ord = rows && rows[0];
    if (!ord) throw fail(404, 'No encontramos esa compra. No se te cobró.');
    if (ord.status === 'paid') return { ok: true, gems: (await getProfile(me.user_id)).gems, added: 0 };
    const order = await captureOrder(orderID);
    if (order.status !== 'COMPLETED') throw fail(402, 'PayPal no completó el pago. No se te cobró.');
    const cap = order.purchase_units && order.purchase_units[0] && order.purchase_units[0].payments && order.purchase_units[0].payments.captures && order.purchase_units[0].payments.captures[0];
    const paid = cap && cap.amount && cap.amount.currency_code === 'USD' ? Number(cap.amount.value) : 0;
    // Si PayPal cobró, las gemas se acreditan SIEMPRE, en proporción a lo pagado (por si alguien manipuló el monto, nunca se regala de más).
    const gems = paid + 0.001 >= Number(ord.usd) ? ord.gems : Math.floor(ord.gems * (paid / Number(ord.usd)));
    if (paid + 0.001 < Number(ord.usd)) console.error('[slc] monto distinto', orderID, paid, ord.usd);
    const nb = await rpc('slc_gems', { p_user: me.user_id, p_delta: gems, p_kind: 'purchase', p_ref: orderID });
    await sb('PATCH', `slc_orders?order_id=eq.${q(orderID)}`, { status: 'paid' }, { Prefer: 'return=minimal' });
    return { ok: true, gems: nb >= 0 ? nb : (await getProfile(me.user_id)).gems, added: nb >= 0 ? gems : 0 };
};

// ----- Videollamadas -----
// Quién paga: el hombre, siempre (llame o conteste). La mujer nunca paga. Si son dos hombres, paga quien llama.
// Cobro: cada minuto se cobra al INICIAR (2.000 gemas). Un hombre sin gemas para un minuto no puede llamar ni contestar.
function payerOf(call, profiles) { const c = profiles[call.caller], e = profiles[call.callee]; if (!c || !e) return null; if (c.gender === 'm') return c.user_id; if (e.gender === 'm') return e.user_id; return null; }
async function callRow(id, me) {
    if (!UUID.test(String(id || ''))) throw fail(400, 'Solicitud inválida');
    const r = await sb('GET', `slc_calls?id=eq.${id}&select=*&limit=1`); const c = r && r[0];
    if (!c || (c.caller !== me.user_id && c.callee !== me.user_id)) throw fail(404, 'Llamada no encontrada.');
    return c;
}
async function endCall(c, status, reason) {
    if (['ended', 'declined', 'missed'].includes(c.status)) return c;
    const patch = { status, ended_at: new Date().toISOString(), end_reason: reason };
    const r = await sb('PATCH', `slc_calls?id=eq.${c.id}&status=eq.${c.status}`, patch, { Prefer: 'return=representation' });
    return (r && r[0]) || Object.assign({}, c, patch);
}
async function billCall(c, profiles) {   // cobra los minutos iniciados que falten; devuelve la llamada (terminada si no alcanzaron las gemas)
    if (c.status !== 'active') return c;
    const payer = payerOf(c, profiles); if (!payer) return c;
    const due = Math.floor((Date.now() - new Date(c.answered_at).getTime()) / 60000) + 1;
    let billed = c.minutes_billed;
    while (billed < due) {
        const n = billed + 1;
        const nb = await rpc('slc_gems', { p_user: payer, p_delta: -GEMS_PER_MIN, p_kind: 'call', p_ref: c.id + ':' + n });
        if (nb === -2) { billed = n; continue; }                     // ya estaba cobrado por otra petición
        if (nb === -1) { const e = await endCall(c, 'ended', 'gems'); return Object.assign(e, { minutes_billed: billed, gems_spent: billed * GEMS_PER_MIN }); }
        billed = n;
    }
    if (billed !== c.minutes_billed) { await sb('PATCH', `slc_calls?id=eq.${c.id}`, { minutes_billed: billed, gems_spent: billed * GEMS_PER_MIN }, { Prefer: 'return=minimal' }); c.minutes_billed = billed; c.gems_spent = billed * GEMS_PER_MIN; }
    return c;
}
A.callStart = async (ctx, b) => {
    const me = needActive(ctx.profile);
    const o = await eligibleOther(me, b.to);
    if (!(await convOf(me.user_id, o.user_id, false))) throw fail(403, 'Primero escríbele un mensaje para poder llamar.');
    if (limited('call:' + me.user_id, 10, 10 * 60 * 1000)) throw fail(429, 'Has llamado muchas veces seguidas. Espera un momento.');
    const profiles = { [me.user_id]: me, [o.user_id]: o };
    const payer = payerOf({ caller: me.user_id, callee: o.user_id }, profiles);
    if (payer === me.user_id && me.gems < GEMS_PER_MIN) throw fail(402, 'Necesitas gemas para llamar: un minuto cuesta ' + nf(GEMS_PER_MIN) + ' gemas.', { codigo: 'sin_gemas' });
    const busy = await sb('GET', `slc_calls?or=(status.eq.active,and(status.eq.ringing,created_at.gt.${new Date(Date.now() - RING_MS).toISOString()}))&or=(caller.eq.${o.user_id},callee.eq.${o.user_id})&select=id&limit=1`);
    if (busy && busy.length) throw fail(409, o.name + ' está en otra llamada ahora mismo.');
    const mine = await sb('GET', `slc_calls?or=(status.eq.active,and(status.eq.ringing,created_at.gt.${new Date(Date.now() - RING_MS).toISOString()}))&or=(caller.eq.${me.user_id},callee.eq.${me.user_id})&select=id&limit=1`);
    if (mine && mine.length) throw fail(409, 'Ya tienes una llamada en curso.');
    const r = await sb('POST', 'slc_calls', { caller: me.user_id, callee: o.user_id }, { Prefer: 'return=representation' });
    return { ok: true, id: r[0].id, youPay: payer === me.user_id, name: o.name };
};
A.ping = async (ctx) => {   // latido: marca "en línea" y avisa de llamadas entrantes y mensajes sin leer
    const p = ctx.profile; if (!p) return { ok: true };
    await sb('PATCH', 'slc_profiles?user_id=eq.' + q(p.user_id), { last_seen: new Date().toISOString() }, { Prefer: 'return=minimal' });
    if (p.status !== 'active') return { ok: true, gems: p.gems, incoming: null, unread: 0 };
    const since = new Date(Date.now() - RING_MS).toISOString();
    const inc = await sb('GET', `slc_calls?callee=eq.${p.user_id}&status=eq.ringing&created_at=gt.${since}&select=id,caller,created_at&order=created_at.desc&limit=1`);
    let incoming = null;
    if (inc && inc[0]) {
        const o = await getProfile(inc[0].caller);
        if (o && !(await isBlocked(p.user_id, o.user_id))) { const ph = await firstPhotos([o.user_id]); const u = await signPaths([ph[o.user_id]]); incoming = { id: inc[0].id, from: publicOf(o, u[ph[o.user_id]]), youPay: p.gender === 'm' && o.gender !== 'm' ? true : (p.gender === 'm' && o.gender === 'm' ? false : false), canAnswer: !(p.gender === 'm' && o.gender !== 'm') || p.gems >= GEMS_PER_MIN }; }
    }
    const un = await rpc('slc_convs', { p_me: p.user_id });
    return { ok: true, gems: p.gems, incoming, unread: (un || []).reduce((s, c) => s + (c.unread || 0), 0) };
};
A.callAnswer = async (ctx, b) => {
    const me = needActive(ctx.profile); let c = await callRow(b.id, me);
    if (c.callee !== me.user_id) throw fail(403, 'Solicitud inválida');
    if (c.status !== 'ringing' || Date.now() - new Date(c.created_at).getTime() > RING_MS + 5000) throw fail(410, 'La llamada ya terminó.');
    const o = await getProfile(c.caller); const profiles = { [me.user_id]: me, [o.user_id]: o };
    if (payerOf(c, profiles) === me.user_id && me.gems < GEMS_PER_MIN) throw fail(402, 'Necesitas gemas para contestar: un minuto cuesta ' + nf(GEMS_PER_MIN) + ' gemas.', { codigo: 'sin_gemas' });
    const now = new Date().toISOString();
    const r = await sb('PATCH', `slc_calls?id=eq.${c.id}&status=eq.ringing`, { status: 'active', answered_at: now, last_tick_at: now }, { Prefer: 'return=representation' });
    if (!r || !r[0]) throw fail(410, 'La llamada ya terminó.');
    c = await billCall(r[0], profiles);
    if (c.status !== 'active') throw fail(402, 'No alcanzaron las gemas.', { codigo: 'sin_gemas' });
    return { ok: true, youPay: payerOf(c, profiles) === me.user_id };
};
A.callDecline = async (ctx, b) => { const me = ctx.profile; if (!me) throw fail(403, 'Solicitud inválida'); const c = await callRow(b.id, me); await endCall(c, c.caller === me.user_id ? 'missed' : 'declined', 'declined'); return { ok: true }; };
A.callEnd = async (ctx, b) => { const me = ctx.profile; if (!me) throw fail(403, 'Solicitud inválida'); const c = await callRow(b.id, me); await endCall(c, c.status === 'ringing' ? (c.caller === me.user_id ? 'missed' : 'declined') : 'ended', clean(b.reason, 30) || 'hangup'); return { ok: true }; };
A.callSignal = async (ctx, b) => {
    const me = ctx.profile; if (!me) throw fail(403, 'Solicitud inválida'); const c = await callRow(b.id, me);
    if (!['ringing', 'active'].includes(c.status)) throw fail(410, 'La llamada ya terminó.');
    const kind = ['offer', 'answer', 'ice'].includes(b.kind) ? b.kind : null; if (!kind) throw fail(400, 'Solicitud inválida');
    const payload = JSON.stringify(b.payload || {}); if (payload.length > 20000) throw fail(400, 'Solicitud inválida');
    await sb('POST', 'slc_signals', { call: c.id, from_id: me.user_id, kind, payload: b.payload || {} }, { Prefer: 'return=minimal' });
    return { ok: true };
};
A.callPoll = async (ctx, b) => {   // estado + señales de la otra persona + cobro de minutos
    const me = ctx.profile; if (!me) throw fail(403, 'Solicitud inválida'); let c = await callRow(b.id, me);
    if (c.status === 'ringing' && Date.now() - new Date(c.created_at).getTime() > RING_MS + 5000) c = await endCall(c, 'missed', 'no_answer');
    if (c.status === 'active') {
        const other = await getProfile(c.caller === me.user_id ? c.callee : c.caller);
        c = await billCall(c, { [me.user_id]: await getProfile(me.user_id), [other.user_id]: other });
        if (c.status === 'active') await sb('PATCH', `slc_calls?id=eq.${c.id}`, { last_tick_at: new Date().toISOString() }, { Prefer: 'return=minimal' });
    }
    const after = Math.max(0, parseInt(b.after, 10) || 0);
    const sig = await sb('GET', `slc_signals?call=eq.${c.id}&from_id=neq.${me.user_id}&id=gt.${after}&select=id,kind,payload&order=id.asc&limit=100`) || [];
    const fresh = await getProfile(me.user_id);
    const other = await getProfile(c.caller === me.user_id ? c.callee : c.caller);
    return { status: c.status, reason: c.end_reason || '', minutes: c.minutes_billed, gemsSpent: c.gems_spent, gems: fresh.gems, youPay: payerOf(c, { [fresh.user_id]: fresh, [other.user_id]: other }) === me.user_id, signals: sig, answeredAt: c.answered_at };
};

A.deleteAccount = async (ctx) => {
    const p = ctx.profile; const { url, key } = env();
    if (p) { const ph = await sb('GET', `slc_photos?user_id=eq.${p.user_id}&select=path`) || []; await removeFiles(ph.map((x) => x.path)); await sb('DELETE', 'slc_profiles?user_id=eq.' + q(p.user_id), undefined, { Prefer: 'return=minimal' }); }
    await fetch(url + '/auth/v1/admin/users/' + ctx.user.id, { method: 'DELETE', headers: { apikey: key, Authorization: 'Bearer ' + key } });
    return { ok: true };
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }
    const h = event.headers || {}; const auth = h.authorization || h.Authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return json(401, { error: 'Inicia sesión para continuar.', codigo: 'sin_sesion' });
    const fn = A[b.action]; if (!fn || b.action.startsWith('_')) return json(400, { error: 'Acción desconocida' });
    try {
        const user = await verifyJwt(token);
        if (!user) return json(401, { error: 'Tu sesión venció. Entra de nuevo.', codigo: 'sin_sesion' });
        if (!user.email_confirmed_at && !user.confirmed_at) return json(403, { error: 'Confirma tu correo para continuar.', codigo: 'sin_confirmar' });
        if (limited('ip:' + user.id, 600, 60 * 1000)) return json(429, { error: 'Demasiadas solicitudes.' });
        const profile = await getProfile(user.id);
        return json(200, await fn({ user, profile, country: countryOf(event) }, b));
    } catch (e) {
        if (e.http) return json(e.http, Object.assign({ error: e.message }, e.extra || {}));
        console.error('[slc]', b.action, e.message);
        return json(500, { error: 'Algo falló de nuestro lado. Inténtalo de nuevo.' });
    }
};
exports._t = { A, PACKS, GEMS_PER_MIN, payerOf, ageOf, compatible };
