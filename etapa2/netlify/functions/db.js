const { getUser } = require('./_lib/auth');
const store = require('./_lib/store');

const json = (statusCode, obj) => ({
    statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj)
});

exports.handler = async function (event, context) {
    const user = getUser(context);
    if (!user) return json(401, { error: 'auth_required' });

    // ==========================================
    // LISTAR MIS PROYECTOS (?list=1)
    // Reemplaza el catálogo que antes vivía solo en localStorage.
    // ==========================================
    if (event.httpMethod === 'GET' && event.queryStringParameters?.list) {
        try {
            const rows = await store.listProjects(user.id);
            return json(200, {
                projects: rows.map(r => ({
                    id: r.id, title: r.title, nodeCount: r.node_count, date: r.updated_at
                }))
            });
        } catch (err) {
            console.error('[db] list', err.message);
            return json(503, { error: 'db_unavailable' });
        }
    }

    // ==========================================
    // CARGAR PROYECTO (GET ?projectId=...)
    // ==========================================
    if (event.httpMethod === 'GET') {
        const projectId = event.queryStringParameters?.projectId;
        if (!projectId) return json(400, { error: 'Falta el ID del proyecto' });

        try {
            // getProject ya filtra por owner=user.id: si el proyecto es de otra persona, esto da null.
            const row = await store.getProject(projectId, user.id);
            if (!row) return json(404, { error: 'Proyecto no encontrado' });
            return json(200, { data: row.data, title: row.title });
        } catch (err) {
            console.error('[db] get', err.message);
            return json(503, { error: 'db_unavailable' });
        }
    }

    // ==========================================
    // GUARDAR PROYECTO (POST)
    // ==========================================
    if (event.httpMethod === 'POST') {
        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON inválido' }); }

        const { projectId, title, data } = body;
        const safeTitle = String(title || 'Sin título').slice(0, 120);
        const nodeCount = Array.isArray(data?.nodes) ? data.nodes.length : 0;

        try {
            if (projectId) {
                const updated = await store.updateProject(projectId, user.id, safeTitle, data, nodeCount);
                if (updated) return json(200, { success: true, projectId: updated.id });
                // No existía o no era del usuario: lo tratamos como proyecto nuevo en vez de
                // sobrescribir silenciosamente el de otra persona.
            }
            const created = await store.createProject(user.id, safeTitle, data, nodeCount);
            return json(200, { success: true, projectId: created.id });
        } catch (err) {
            console.error('[db] save', err.message);
            return json(503, { error: 'db_unavailable' });
        }
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
