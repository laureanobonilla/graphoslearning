// Acceso a Supabase por REST (sin dependencias). Usa la clave service_role: SOLO en el servidor.
function cfg() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    return { url: url.replace(/\/$/, ''), key };
}

function authHeaders(key, extra) {
    return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

async function rpc(name, args) {
    const { url, key } = cfg();
    const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: authHeaders(key, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(args)
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${name} ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
}

// Llamada REST directa a una tabla (usada para /projects, filtrando siempre por owner
// para que un usuario nunca pueda leer ni pisar el proyecto de otro).
async function table(path, options = {}) {
    const { url, key } = cfg();
    const res = await fetch(`${url}/rest/v1/${path}`, {
        ...options,
        headers: authHeaders(key, { 'Content-Type': 'application/json', ...(options.headers || {}) })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${path} ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
}

module.exports = {
    ensureProfile: (id, email) =>
        rpc('ensure_profile', { p_user: id, p_email: email, p_initial: Number(process.env.INITIAL_FREE_NODES || 50) }),
    spendNodes: (id, cost, action) => rpc('spend_nodes', { p_user: id, p_cost: cost, p_action: action }),
    creditNodes: (id, nodes, order, amount) =>
        rpc('credit_nodes', { p_user: id, p_nodes: nodes, p_order: order, p_amount: amount }),
    usageLastHour: id => rpc('usage_last_hour', { p_user: id }),

    ensureGuest: (guestId, ip) => rpc('ensure_guest', {
        p_guest: guestId, p_ip: ip,
        p_initial: Number(process.env.GUEST_FREE_NODES || 15),
        p_ip_cap: Number(process.env.GUEST_IP_CAP || 3),
        p_ip_window_hours: Number(process.env.GUEST_IP_WINDOW_HOURS || 24)
    }),
    spendGuestNodes: (guestId, cost, action) => rpc('spend_guest_nodes', { p_guest: guestId, p_cost: cost, p_action: action }),

    // Registro de eventos de uso (ver track-event.js). El llamador decide si
    // espera esto o lo dispara sin esperar — nunca debe bloquear ni romper
    // nada si Supabase está lento o falla. actorLabel es solo la etiqueta
    // legible (correo, o nombre aleatorio de invitado) para no tener que leer
    // actor_id a mano — ver columna actor_label en supabase/schema.sql.
    logEvent: (actorId, actorKind, anonId, eventName, metadata, actorLabel) =>
        rpc('log_event', { p_actor: actorId, p_kind: actorKind, p_anon: anonId || null, p_event: eventName, p_metadata: metadata || {}, p_label: actorLabel || null }),

    // --- Proyectos (siempre filtrados por owner=ownerId; nunca por el id que manda el cliente solo) ---
    async getProject(id, ownerId) {
        const rows = await table(`projects?id=eq.${id}&owner=eq.${encodeURIComponent(ownerId)}&select=*`);
        return rows && rows[0] ? rows[0] : null;
    },
    async listProjects(ownerId) {
        return table(`projects?owner=eq.${encodeURIComponent(ownerId)}&select=id,title,node_count,updated_at&order=updated_at.desc`);
    },
    async createProject(ownerId, title, data, nodeCount) {
        const rows = await table('projects', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ owner: ownerId, title, data, node_count: nodeCount })
        });
        return rows[0];
    },
    // PATCH filtrado por owner: si el proyecto no es del usuario, 0 filas se actualizan (no hay error, ni fuga).
    async updateProject(id, ownerId, title, data, nodeCount) {
        const rows = await table(`projects?id=eq.${id}&owner=eq.${encodeURIComponent(ownerId)}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ title, data, node_count: nodeCount, updated_at: new Date().toISOString() })
        });
        return rows && rows[0] ? rows[0] : null; // null => no existía o no era del dueño
    }
};
