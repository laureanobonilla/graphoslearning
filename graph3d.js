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

    // ---------- Jerarquía por profundidad (para que el árbol se note en 3D) ----------
    // El layout de fuerzas por sí solo no sabe qué es "padre" y qué es "hijo": todos
    // los nodos se repelen igual y el árbol se vuelve una nube sin orden. Para que
    // 1) los hijos queden pegados visualmente a su padre y
    // 2) se note una jerarquía clara (capas por profundidad alrededor de cada raíz),
    // calculamos la profundidad (BFS) de cada nodo respecto a la raíz de SU propio
    // árbol (un nodo sin padres entrantes) y la usamos en una fuerza radial propia:
    // cada nodo es empujado a mantenerse a una distancia de ~profundidad*radialStep
    // de su raíz, en vez de dejarlo flotar a cualquier distancia. Como puede haber
    // varios esquemas independientes a la vez en el mismo lienzo (ver "offsetX" en
    // app.js), cada árbol calcula su radio respecto a SU PROPIA raíz, no al origen
    // global del lienzo, así los esquemas no se atraen entre sí.
    function computeHierarchy(nodeList, linkList) {
        const childrenOf = new Map();
        const hasParent = new Set();
        nodeList.forEach(n => childrenOf.set(n.id, []));
        linkList.forEach(l => {
            const from = (l.from !== undefined) ? l.from : l.source;
            const to = (l.to !== undefined) ? l.to : l.target;
            if (childrenOf.has(from)) childrenOf.get(from).push(to);
            hasParent.add(to);
        });
        const idToNode = new Map(nodeList.map(n => [n.id, n]));
        const roots = nodeList.filter(n => !hasParent.has(n.id)).map(n => n.id);
        const visited = new Set();
        roots.forEach(rootId => {
            const queue = [{ id: rootId, depth: 0 }];
            while (queue.length) {
                const { id, depth } = queue.shift();
                if (visited.has(id)) continue;
                visited.add(id);
                const node = idToNode.get(id);
                if (node) { node.__depth = depth; node.__rootId = rootId; }
                (childrenOf.get(id) || []).forEach(childId => {
                    if (!visited.has(childId)) queue.push({ id: childId, depth: depth + 1 });
                });
            }
        });
        // Nodos sueltos que ninguna BFS tocó (p.ej. ciclos raros): raíz de sí mismos.
        nodeList.forEach(n => {
            if (!visited.has(n.id)) { n.__depth = 0; n.__rootId = n.id; }
        });
    }

    // Fuerza d3 personalizada: empuja cada nodo a quedar a distancia
    // depth * radialStep de la posición ACTUAL de su raíz (no de un punto fijo), para
    // que varios esquemas en el mismo lienzo no se junten entre sí.
    function makeHierarchicalRadialForce(radialStep) {
        let nodes = [];
        let byId = new Map();
        function force(alpha) {
            for (const n of nodes) {
                const depth = n.__depth || 0;
                if (!depth) continue; // la raíz no se empuja a sí misma
                const anchor = byId.get(n.__rootId) || { x: 0, y: 0, z: 0 };
                const dx = (n.x || 0) - (anchor.x || 0);
                const dy = (n.y || 0) - (anchor.y || 0);
                const dz = (n.z || 0) - (anchor.z || 0);
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
                const targetR = depth * radialStep;
                const k = (targetR - dist) / dist * alpha * 0.9;
                n.vx = (n.vx || 0) + dx * k;
                n.vy = (n.vy || 0) + dy * k;
                n.vz = (n.vz || 0) + dz * k;
            }
        }
        force.initialize = (_nodes) => {
            nodes = _nodes;
            byId = new Map(nodes.map(n => [n.id, n]));
        };
        return force;
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

            // Ajuste de fuerzas para que se note la jerarquía en vez de una nube pareja:
            // - link: corto y firme, para que cada hijo quede pegado visualmente a su padre.
            // - charge: repulsión suave, solo para separar hermanos, no para dispersar el árbol.
            // - center: SE DESACTIVA. Por defecto 3d-force-graph atrae todo al origen del
            //   lienzo; con varios esquemas en la misma pantalla (ver "offsetX" en app.js)
            //   eso los iría juntando entre sí con el tiempo. Cada árbol ya se mantiene
            //   compacto solo con "hierRadial" (ver abajo), centrado en SU propia raíz.
            // - hierRadial: fuerza propia que acomoda a cada nodo en "capas" (una esfera
            //   por nivel de profundidad) alrededor de la raíz de su propio árbol.
            const linkForce = this.graph.d3Force('link');
            if (linkForce) { linkForce.distance(55).strength(0.85); }
            const chargeForce = this.graph.d3Force('charge');
            if (chargeForce) { chargeForce.strength(-45).distanceMax(240); }
            this.graph.d3Force('center', null);
            this.graph.d3Force('hierRadial', makeHierarchicalRadialForce(68));

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
                computeHierarchy(nodeList, linkList); // asigna __depth/__rootId por nodo
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
