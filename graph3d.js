// ==========================================
// CAPA DE COMPATIBILIDAD: vis-network (2D) -> 3d-force-graph (3D)
// ==========================================
// app.js y lab.js fueron escritos contra la API de vis-network (DataSet + Network).
// En vez de reescribir los ~80 puntos donde llaman nodes.add/update/get,
// edges.add/get, network.getPositions/focus/fit/canvasToDOM/on/..., este archivo
// implementa esa MISMA API por encima de 3d-force-graph (que a su vez usa
// three.js + d3-force-3d). Así el resto del código sigue funcionando sin tocarse;
// solo cambia el bloque de inicialización en app.js (sección 1).
//
// Qué da 3d-force-graph "gratis" y por qué se eligió para este pedido:
// - Es un layout verdaderamente 3D: bajo repulsión, los nodos se reparten en
//   los tres ejes (no solo x/y), así que cuando el esquema crece y no cabe en
//   ancho, el exceso de nodos naturalmente "se va hacia atrás" en profundidad
//   (eje Z), tal como se pidió.
// - Trae cámara orbital (OrbitControls) integrada: arrastrar con el mouse rota
//   la vista en cualquier dirección alrededor del esquema; la rueda hace zoom.
//   Eso cubre "navegar por ellos en forma circular en todas direcciones" sin
//   código adicional.
//
// Lo que NO es 1:1 con vis-network (limitaciones conocidas de este cambio):
// - Las etiquetas de nodo ya no son cajas HTML con rich-text; son sprites de
//   texto (three-spritetext) en el espacio 3D. El texto en **negritas** vía
//   "*texto*" se simplifica a texto plano (se quitan los asteriscos).
// - selectNodes() / canvasToDOM() / getViewPosition() son aproximaciones
//   razonables (ver comentarios en cada método) en vez de equivalentes exactos.

(function () {
    if (typeof THREE === 'undefined' || typeof ForceGraph3D === 'undefined' || typeof SpriteText === 'undefined') {
        const missing = [
            typeof THREE === 'undefined' && 'three.js',
            typeof ForceGraph3D === 'undefined' && '3d-force-graph',
            typeof SpriteText === 'undefined' && 'three-spritetext'
        ].filter(Boolean).join(', ');
        console.error(`[graph3d] No cargaron estas librerías: ${missing}. Revisa los <script> en el HTML (y la consola, por si una de ellas dio su propio error antes de este).`);
        // Mensaje visible en pantalla en vez de un lienzo negro mudo: así, si vuelve a
        // romperse por otra razón (CDN caído, versión incompatible, etc.), se nota de
        // inmediato en vez de parecer que la app "no hace nada".
        const container = document.getElementById('network-container');
        if (container) {
            container.innerHTML = `<div style="color:#fca5a5;background:#1e293b;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:sans-serif;font-size:13px;">
                No se pudo cargar el lienzo 3D (faltó: ${missing}).<br>Revisa la consola del navegador para más detalle.
            </div>`;
        }
        // No definimos Graph3DDataSet/Graph3DNetworkShim: app.js fallará al construirlos.
        // Es preferible un error claro de "faltó cargar la librería" a uno silencioso.
        return;
    }

    // ---------- DataSet: reemplazo mínimo de vis.DataSet ----------
    class Graph3DDataSet {
        constructor(initial) {
            this._map = new Map();
            this._listeners = [];
            (initial || []).forEach(item => this._map.set(item.id, { ...item }));
        }
        get(arg) {
            if (arg === undefined) return Array.from(this._map.values());
            if (Array.isArray(arg)) return arg.map(id => this._map.get(id)).filter(Boolean);
            if (typeof arg === 'object' && arg.filter) return Array.from(this._map.values()).filter(arg.filter);
            return this._map.get(arg) || null;
        }
        getIds() { return Array.from(this._map.keys()); }
        add(itemOrItems) {
            const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
            items.forEach(item => this._map.set(item.id, { ...item }));
            this._emit(items);
            return items.map(i => i.id);
        }
        update(itemOrItems) {
            const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
            items.forEach(item => {
                const existing = this._map.get(item.id) || { id: item.id };
                this._map.set(item.id, { ...existing, ...item });
            });
            this._emit(items);
            return items.map(i => i.id);
        }
        remove(idOrIds) {
            const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
            ids.forEach(id => this._map.delete(id));
            this._emit(ids.map(id => ({ id })));
            return ids;
        }
        clear() {
            this._map.clear();
            this._emit([]);
        }
        get length() { return this._map.size; }
        // vis soporta on(event, cb); esta app solo usa el patrón on('*', cb), así que
        // cualquier nombre de evento dispara el mismo callback.
        on(_event, cb) { this._listeners.push(cb); }
        _emit(items) { this._listeners.forEach(cb => { try { cb('update', { items: items.map(i => i.id) }); } catch (e) { console.error(e); } }); }
    }

    // Limpia el markdown simple ("*negrita*") que usaba vis-network, para texto plano en 3D.
    function plainText(label) {
        return String(label || '').replace(/\*/g, '');
    }

    // ---------- NetworkShim: reemplazo de vis.Network sobre ForceGraph3D ----------
    class Graph3DNetworkShim {
        constructor(container, data, options) {
            this.nodesDS = data.nodes;
            this.edgesDS = data.edges;
            this._listeners = {}; // { eventName: [cb, ...] }
            this._highlightedId = null;
            this._dragging = false;
            this._sourceMenuEl = document.getElementById('actionMenu');

            const self = this;

            this.graph = ForceGraph3D()(container)
                .backgroundColor('#0b0f19')
                .nodeId('id')
                .nodeLabel(() => '') // el texto va en el sprite 3D, no en el tooltip nativo
                .nodeThreeObject(node => self._buildNodeSprite(node))
                .nodeThreeObjectExtend(false)
                .linkSource('from')
                .linkTarget('to')
                .linkColor(link => (link.color && link.color.color) || '#64748b')
                .linkWidth(1.1)
                .linkOpacity(0.55)
                .linkDirectionalArrowLength(5)
                .linkDirectionalArrowRelPos(1)
                .linkCurvature(0.15)
                .linkThreeObjectExtend(true)
                .linkThreeObject(link => self._buildLinkSprite(link))
                .linkPositionUpdate((sprite, { start, end }) => {
                    if (!sprite) return;
                    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: (start.z + end.z) / 2 };
                    Object.assign(sprite.position, mid);
                })
                .onNodeClick(node => self._dispatch('click', { nodes: [node.id] }))
                .onBackgroundClick(() => self._dispatch('click', { nodes: [] }))
                .onNodeDrag(node => {
                    if (!self._dragging) { self._dragging = true; self._dispatch('dragStart', { nodes: [node.id] }); }
                })
                .onNodeDragEnd(node => {
                    self._dragging = false;
                    // Al soltar, el nodo queda fijo donde cayó (igual que vis-network);
                    // el resto del código lo "libera" explícitamente cuando corresponde.
                    node.fx = node.x; node.fy = node.y; node.fz = node.z;
                })
                .onEngineStop(() => { self._dispatch('stabilizationIterationsDone'); self._dispatch('stabilized'); });

            this.graph.graphData({ nodes: [], links: [] });

            // Física: arranca "caliente" para que los primeros nodos encuentren sitio;
            // setOptions({physics:{enabled:false}}) la enfría (ver stopPhysicsAndUnlock).
            this.graph.d3VelocityDecay(0.35);
            this._physicsEnabled = true;

            // Semilla de profundidad: sin un empuje inicial en Z, muchos layouts de fuerza
            // caen en un plano casi plano. El jitter de spawn en syncGraphData (más abajo)
            // le da a la simulación libertad real de usar los tres ejes desde el principio
            // (así los nodos "quedan atrás" cuando el esquema crece).

            // Rotación orbital libre en todas direcciones: ya viene con OrbitControls.
            const controls = this.graph.controls();
            if (controls) {
                controls.addEventListener('change', () => self._dispatch('zoom'));
            }

            // Mantiene el lienzo del tamaño de su contenedor si la ventana cambia.
            const resize = () => this.graph.width(container.clientWidth).height(container.clientHeight);
            window.addEventListener('resize', resize);
            resize();

            // Sincroniza nodesDS/edgesDS (nuestro DataSet shim) -> graphData real.
            const syncGraphData = () => {
                const nodeList = this.nodesDS.get().map(n => {
                    const existing = this._findNode(n.id);
                    const base = existing || {
                        x: (Math.random() - 0.5) * 60,
                        y: (Math.random() - 0.5) * 60,
                        z: (Math.random() - 0.5) * 60 // jitter de profundidad inicial, ver nota arriba
                    };
                    const merged = { ...base, ...n };
                    // Traducción del "fixed" de vis-network al pineo nativo fx/fy/fz.
                    if (n.fixed && (n.fixed.x || n.fixed.y)) {
                        merged.fx = base.x; merged.fy = base.y; merged.fz = base.z;
                    } else if (n.fixed && n.fixed.x === false && n.fixed.y === false) {
                        delete merged.fx; delete merged.fy; delete merged.fz;
                    } else if (existing) {
                        // conserva el pineo que ya tuviera si no se especifica fixed de nuevo
                        if ('fx' in existing) merged.fx = existing.fx;
                        if ('fy' in existing) merged.fy = existing.fy;
                        if ('fz' in existing) merged.fz = existing.fz;
                    }
                    return merged;
                });
                const linkList = this.edgesDS.get().map(e => ({ ...e }));
                this.graph.graphData({ nodes: nodeList, links: linkList });
            };
            this._findNode = id => (this.graph.graphData().nodes || []).find(n => n.id === id);

            this.nodesDS.on('*', syncGraphData);
            this.edgesDS.on('*', syncGraphData);
        }

        _buildNodeSprite(node) {
            const bg = (node.color && node.color.background) || '#1e293b';
            const border = (node.color && node.color.border) || '#475569';
            const fg = (node.font && node.font.color) || '#0f172a';
            const text = new SpriteText(plainText(node.label));
            text.color = fg;
            text.backgroundColor = bg;
            text.borderColor = node.id === this._highlightedId ? '#f59e0b' : border;
            text.borderWidth = node.id === this._highlightedId ? 2.5 : 1.2;
            text.borderRadius = 6;
            text.padding = 6;
            text.textHeight = 4.2;
            return text;
        }

        _buildLinkSprite(link) {
            if (!link.label) return null;
            const sprite = new SpriteText(String(link.label));
            sprite.color = '#cbd5e1';
            sprite.textHeight = 2.2;
            sprite.backgroundColor = 'rgba(11,15,25,0.75)';
            sprite.padding = 1.5;
            return sprite;
        }

        // ---- Métodos usados por app.js/lab.js, con la misma firma que vis.Network ----

        getPositions(ids) {
            const out = {};
            (ids || []).forEach(id => {
                const n = this._findNode(id);
                out[id] = n ? { x: n.x || 0, y: n.y || 0, z: n.z || 0 } : { x: 0, y: 0, z: 0 };
            });
            return out;
        }

        // Proyecta una posición 3D a coordenadas de pantalla (px), para posicionar el
        // menú contextual HTML sobre el nodo. Aproximación estándar de three.js.
        canvasToDOM(pos) {
            const camera = this.graph.camera();
            const renderer = this.graph.renderer();
            const vector = new THREE.Vector3(pos.x || 0, pos.y || 0, pos.z || 0);
            vector.project(camera);
            const rect = renderer.domElement.getBoundingClientRect();
            return {
                x: (vector.x * 0.5 + 0.5) * rect.width,
                y: (-vector.y * 0.5 + 0.5) * rect.height
            };
        }

        // vis-network no tiene equivalente exacto 3D; se usa como ancla aproximada de
        // "hacia dónde mira el usuario ahora", para ubicar nodos nuevos sin padre.
        getViewPosition() {
            const controls = this.graph.controls();
            const target = controls && controls.target ? controls.target : { x: 0, y: 0, z: 0 };
            return { x: target.x, y: target.y, z: target.z };
        }

        focus(nodeId, opts) {
            const n = this._findNode(nodeId);
            if (!n) return;
            const distance = 160;
            const ratio = 1 + distance / Math.max(Math.hypot(n.x, n.y, n.z), 1);
            const duration = (opts && opts.animation && opts.animation.duration) || 600;
            this.graph.cameraPosition(
                { x: n.x * ratio, y: n.y * ratio, z: n.z * ratio },
                { x: n.x, y: n.y, z: n.z },
                duration
            );
        }

        fit(opts) {
            const duration = (opts && opts.animation && opts.animation.duration) || 0;
            this.graph.zoomToFit(duration, 60);
        }

        selectNodes(ids) {
            this._highlightedId = (ids && ids[0]) || null;
            this.graph.nodeThreeObject(node => this._buildNodeSprite(node)); // fuerza redibujo del acceso
            this.graph.refresh();
        }

        redraw() { this.graph.refresh(); }

        setOptions(opts) {
            if (opts && opts.physics) {
                this._physicsEnabled = !!opts.physics.enabled;
                this.graph.d3AlphaTarget(this._physicsEnabled ? 0.25 : 0);
            }
        }

        on(eventName, cb) {
            if (!this._listeners[eventName]) this._listeners[eventName] = [];
            this._listeners[eventName].push(cb);
        }

        _dispatch(eventName, payload) {
            (this._listeners[eventName] || []).forEach(cb => { try { cb(payload); } catch (e) { console.error(e); } });
        }
    }

    window.Graph3DDataSet = Graph3DDataSet;
    window.Graph3DNetworkShim = Graph3DNetworkShim;
})();
