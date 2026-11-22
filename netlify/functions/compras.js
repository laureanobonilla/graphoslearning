// Compras de las casas (Paola, Abue y Casita). Supabase: compras_productos (catálogo común), compras_items (por casa), compras_historial.
// La app calcula los avisos; aquí solo se guardan los datos y se validan. Cada acción toca una fila para que dos personas no se pisen.
const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
const CASAS = ['paola', 'abue', 'casita'];
const CATS = ['Frutas', 'Verduras y hortalizas', 'Carnes y pollo', 'Pescado y mariscos', 'Embutidos', 'Lácteos y huevos', 'Panadería y tortillas', 'Granos y básicos', 'Pastas y harinas', 'Enlatados y conservas', 'Salsas y condimentos', 'Café y té', 'Desayuno y dulces', 'Snacks', 'Bebidas', 'Congelados', 'Limpieza del hogar', 'Lavandería', 'Papel y desechables', 'Cuidado personal', 'Bebé', 'Mascotas', 'Farmacia y botiquín', 'Cocina y hogar', 'Otros'];
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => clean(s, 200).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');   // igual que nombre_norm en SQL (ñ→n, ü→u)
const hits = new Map();
function limited(ip) { const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 60000); h.push(now); hits.set(ip, h); if (hits.size > 500) for (const [k, v] of hits) if (now - v[v.length - 1] > 60000) hits.delete(k); return h.length > 150; }

function cfg() { const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY; if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY'); return { url: url.replace(/\/$/, ''), key }; }
async function sb(path, opt = {}) {
    const { url, key } = cfg();
    const res = await fetch(`${url}${path}`, { ...opt, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
}
const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const price = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= 1e8 ? Math.round(n * 100) / 100 : undefined; };
const fecha = (v) => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null; const d = new Date(v + 'T00:00:00Z'); return d.getUTCFullYear() >= 2024 && d.getUTCFullYear() <= 2100 && d.toISOString().slice(0, 10) === v ? v : null; };
const addDias = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const PCOLS = 'id,nombre,categoria,periodo_dias,basico,alias';
const ICOLS = 'casa,producto_id,fijo,pendiente,periodo_dias,periodos,ultima_compra,cubre_hasta,precio,nota,posponer_hasta';
async function estado() {
    const [productos, items, hist] = await Promise.all([
        sb(`/rest/v1/compras_productos?select=${PCOLS}&order=nombre.asc&limit=5000`),
        sb(`/rest/v1/compras_items?select=${ICOLS}&limit=10000`),
        sb(`/rest/v1/compras_historial?select=id,casa,producto_id,fecha,periodos,precio&order=creado.desc&limit=120`)]);
    return { productos, items, historial: hist, categorias: CATS };
}
const one = async (casa, pid) => (await sb(`/rest/v1/compras_items?casa=eq.${casa}&producto_id=eq.${pid}&select=${ICOLS}`))[0] || null;
// Crea la fila si no existe y aplica los cambios; así «agregar» y «editar» comparten camino.
async function upsertItem(casa, pid, cambios) {
    const cur = await one(casa, pid);
    if (!cur) return (await sb('/rest/v1/compras_items', { method: 'POST', body: JSON.stringify({ casa, producto_id: pid, ...cambios }) }))[0];
    if (!Object.keys(cambios).length) return cur;
    return (await sb(`/rest/v1/compras_items?casa=eq.${casa}&producto_id=eq.${pid}`, { method: 'PATCH', body: JSON.stringify(cambios) }))[0];
}
// Solo los campos presentes y válidos; { error } si alguno viene mal.
function camposItem(b) {
    const o = {};
    for (const k of ['fijo', 'pendiente']) if (k in b) o[k] = !!b[k];
    if ('periodo_dias' in b) { if (b.periodo_dias === null || b.periodo_dias === '') o.periodo_dias = null; else { const n = int(b.periodo_dias, 1, 730); if (n == null) return { error: 'periodo' }; o.periodo_dias = n; } }
    if ('precio' in b) { const p = price(b.precio); if (p === undefined) return { error: 'precio' }; o.precio = p; }
    if ('nota' in b) o.nota = clean(b.nota, 200);
    if ('posponer_hasta' in b) { if (b.posponer_hasta === null) o.posponer_hasta = null; else { const f = fecha(b.posponer_hasta); if (!f) return { error: 'fecha' }; o.posponer_hasta = f; } }
    return { o };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    let b; try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'json' }); }
    const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim())) || 'unknown';
    if (limited(ip)) return json(429, { error: 'demasiadas' });
    try {
        const a = String(b.action || '');
        if (a === 'estado') return json(200, await estado());
        const casa = String(b.casa || ''), pid = Number(b.producto_id);
        if (!CASAS.includes(casa)) return json(400, { error: 'casa' });
        const necesitaProducto = ['item', 'comprar', 'quitar'].includes(a);
        if (necesitaProducto && !Number.isSafeInteger(pid)) return json(400, { error: 'producto' });

        // Agregar o editar un producto de la casa (lista fija, pendiente, periodo propio, precio, nota, posponer).
        if (a === 'item') { const c = camposItem(b); if (c.error) return json(400, { error: c.error }); if (!(await sb(`/rest/v1/compras_productos?id=eq.${pid}&select=id`))[0]) return json(404, { error: 'producto' }); return json(200, { item: await upsertItem(casa, pid, c.o) }); }

        // Producto que no estaba en el catálogo: se crea para todas las casas y se agrega a esta. Si ya existía con ese nombre, se reutiliza.
        if (a === 'nuevo') {
            const nombre = clean(b.nombre, 80); if (nombre.length < 2) return json(400, { error: 'nombre' });
            const per = int(b.periodo_dias, 1, 730) || 30, cat = CATS.includes(b.categoria) ? b.categoria : 'Otros';
            let p = (await sb(`/rest/v1/compras_productos?nombre_norm=eq.${encodeURIComponent(norm(nombre))}&select=${PCOLS}`))[0];
            const nuevo = !p;
            if (!p) p = (await sb('/rest/v1/compras_productos', { method: 'POST', body: JSON.stringify({ nombre, categoria: cat, periodo_dias: per }) }))[0];
            const c = camposItem({ fijo: !!b.fijo, pendiente: b.pendiente !== false }); const item = await upsertItem(casa, p.id, c.o);
            return json(200, { producto: p, item, nuevo });
        }
        // Editar el producto del catálogo (nombre, categoría, periodo estándar): vale para todas las casas.
        if (a === 'producto') {
            const o = {}; if ('nombre' in b) { const n = clean(b.nombre, 80); if (n.length < 2) return json(400, { error: 'nombre' }); o.nombre = n; }
            if ('categoria' in b) { if (!CATS.includes(b.categoria)) return json(400, { error: 'categoria' }); o.categoria = b.categoria; }
            if ('periodo_dias' in b) { const n = int(b.periodo_dias, 1, 730); if (n == null) return json(400, { error: 'periodo' }); o.periodo_dias = n; }
            if (!Number.isSafeInteger(Number(b.id)) || !Object.keys(o).length) return json(400, { error: 'id' });
            try { return json(200, { producto: (await sb(`/rest/v1/compras_productos?id=eq.${Number(b.id)}`, { method: 'PATCH', body: JSON.stringify(o) }))[0] }); }
            catch (e) { if (/23505|duplicate/.test(e.message)) return json(409, { error: 'repetido' }); throw e; }
        }
        // Compré: queda anotado cuántos periodos alcanza y hasta cuándo. Se guarda el estado anterior para poder deshacer.
        if (a === 'comprar') {
            const per = int(b.periodos, 1, 60), f = fecha(b.fecha), pr = price(b.precio); if (!per || !f || pr === undefined) return json(400, { error: 'datos' });
            const prod = (await sb(`/rest/v1/compras_productos?id=eq.${pid}&select=periodo_dias`))[0]; if (!prod) return json(404, { error: 'producto' });
            const cur = await one(casa, pid), dias = (cur && cur.periodo_dias) || prod.periodo_dias, hasta = addDias(f, dias * per);
            const prev = cur ? { fijo: cur.fijo, pendiente: cur.pendiente, periodos: cur.periodos, ultima_compra: cur.ultima_compra, cubre_hasta: cur.cubre_hasta, precio: cur.precio, posponer_hasta: cur.posponer_hasta, existia: true } : { existia: false };
            const cambios = { pendiente: false, periodos: per, ultima_compra: f, cubre_hasta: hasta, posponer_hasta: null }; if (pr != null) cambios.precio = pr;
            const item = await upsertItem(casa, pid, cambios);
            const h = (await sb('/rest/v1/compras_historial', { method: 'POST', body: JSON.stringify({ casa, producto_id: pid, fecha: f, periodos: per, precio: pr, prev }) }))[0];
            return json(200, { item, historial_id: h.id });
        }
        if (a === 'deshacer') {
            const hid = Number(b.historial_id); if (!Number.isSafeInteger(hid)) return json(400, { error: 'id' });
            const h = (await sb(`/rest/v1/compras_historial?id=eq.${hid}&casa=eq.${casa}&select=*`))[0]; if (!h) return json(404, { error: 'id' });
            const p = h.prev || {};
            if (p.existia === false) await sb(`/rest/v1/compras_items?casa=eq.${casa}&producto_id=eq.${h.producto_id}`, { method: 'DELETE' });
            else { const { existia, ...rest } = p; await sb(`/rest/v1/compras_items?casa=eq.${casa}&producto_id=eq.${h.producto_id}`, { method: 'PATCH', body: JSON.stringify(rest) }); }
            await sb(`/rest/v1/compras_historial?id=eq.${hid}`, { method: 'DELETE' });
            return json(200, { ok: true });
        }
        // Sacar de la casa: borra su fila (el producto sigue en el catálogo y su historial se conserva).
        if (a === 'quitar') { await sb(`/rest/v1/compras_items?casa=eq.${casa}&producto_id=eq.${pid}`, { method: 'DELETE' }); return json(200, { ok: true }); }
        // Pone en la lista fija de la casa todos los productos «básicos» del catálogo que aún no estén.
        if (a === 'basicos') {
            const base = await sb(`/rest/v1/compras_productos?basico=eq.true&select=id&limit=500`);
            const ya = new Set((await sb(`/rest/v1/compras_items?casa=eq.${casa}&select=producto_id&limit=10000`)).map((r) => r.producto_id));
            const nuevos = base.filter((p) => !ya.has(p.id)).map((p) => ({ casa, producto_id: p.id, fijo: true }));
            if (nuevos.length) await sb('/rest/v1/compras_items', { method: 'POST', body: JSON.stringify(nuevos) });
            return json(200, { agregados: nuevos.length });
        }
        // Onboarding: a todo lo fijo que aún no tiene fecha se le anota «ya tengo N periodos» desde la fecha dada (sin historial de compra).
        if (a === 'registrar') {
            const f = fecha(b.fecha), per = int(b.periodos, 1, 12) || 1; if (!f) return json(400, { error: 'fecha' });
            const [its, prods] = await Promise.all([sb(`/rest/v1/compras_items?casa=eq.${casa}&fijo=eq.true&cubre_hasta=is.null&select=producto_id,periodo_dias&limit=2000`), sb('/rest/v1/compras_productos?select=id,periodo_dias&limit=5000')]);
            const dias = new Map(prods.map((p) => [p.id, p.periodo_dias]));
            for (let i = 0; i < its.length; i += 10) await Promise.all(its.slice(i, i + 10).map((it) => sb(`/rest/v1/compras_items?casa=eq.${casa}&producto_id=eq.${it.producto_id}`, { method: 'PATCH', body: JSON.stringify({ ultima_compra: f, cubre_hasta: addDias(f, (it.periodo_dias || dias.get(it.producto_id) || 30) * per), periodos: per }) })));
            return json(200, { registrados: its.length });
        }
        return json(400, { error: 'accion' });
    } catch (e) { console.error('[compras]', e.message); return json(502, { error: 'no_disponible' }); }
};
