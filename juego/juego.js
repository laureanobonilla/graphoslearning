// ============================================================================
// Graphikosmos 3D — vuelo en primera persona por tus propios esquemas.
//
// Esto NO llama a ningún backend ni gasta nodos: lee los mismos datos que la
// app principal ya guarda en localStorage (ver saveCurrentProjectToBin en
// app.js) — gk_projects_<userKey> (catálogo) y gk_proj_snapshot_<id> (nodos y
// flechas completos) — y los dibuja como una escena 3D con three.js (CDN,
// versión pineada, ver el importmap en index.html). Todo corre en el
// navegador de la persona; no hay nada nuevo que configurar en Netlify.
//
// Como la app principal guarda el proyecto bajo la clave del usuario activo
// (currentUser.id, o 'guest_local' para invitados) y aquí no hay sesión de
// Netlify Identity cargada, recorremos TODAS las claves gk_projects_* que
// haya en este navegador — así el picker muestra lo mismo sin importar con
// qué cuenta se guardó, igual que ya se ve todo en un mismo navegador.
// ============================================================================
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ---------------------------------------------------------------------------
// 1. Localizar y cargar el proyecto guardado
// ---------------------------------------------------------------------------

function findAllSavedProjects() {
    // Reúne el catálogo de cada clave gk_projects_<userKey> presente en este
    // navegador. project.id es único (timestamp+random o id de nube), así que
    // no hay riesgo real de choque entre cuentas distintas guardadas aquí.
    const found = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('gk_projects_')) continue;
        try {
            const catalog = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(catalog)) {
                catalog.forEach(p => found.push(p));
            }
        } catch { /* clave corrupta, se ignora */ }
    }
    // Más reciente primero.
    found.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return found;
}

function loadSnapshot(projectId) {
    try {
        const raw = localStorage.getItem(`gk_proj_snapshot_${projectId}`);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

// ---------------------------------------------------------------------------
// 2. UI: pantalla de selección + pantalla de instrucciones
// ---------------------------------------------------------------------------

const pickerScreen = document.getElementById('pickerScreen');
const introScreen = document.getElementById('introScreen');
const projectListEl = document.getElementById('projectList');
const introProjName = document.getElementById('introProjName');
const loadErrorEl = document.getElementById('loadError');

let pendingProject = null; // { id, title, snapshot }

function showLoadError(msg) {
    loadErrorEl.textContent = msg;
    loadErrorEl.style.display = 'block';
    setTimeout(() => { loadErrorEl.style.display = 'none'; }, 5000);
}

function renderPicker() {
    const projects = findAllSavedProjects();
    if (projects.length === 0) {
        projectListEl.innerHTML = '';
        const empty = document.createElement('div');
        empty.id = 'emptyState';
        empty.innerHTML = 'Todavía no tenés esquemas guardados en este navegador.<br>Volvé a <a href="../index.html">Graphikosmos</a>, armá o abrí un mapa, y guardalo — después aparecerá aquí.';
        projectListEl.appendChild(empty);
        return;
    }
    projectListEl.innerHTML = '';
    projects.forEach(p => {
        const item = document.createElement('div');
        item.className = 'proj-item';
        const dateStr = p.date ? new Date(p.date).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        item.innerHTML = `
            <div>
                <div class="proj-title">${escapeHtml(p.title || 'Esquema sin título')}</div>
                <div class="proj-meta">${p.nodeCount || 0} nodos · ${dateStr}</div>
            </div>
            <div class="proj-go">✈️</div>
        `;
        item.addEventListener('click', () => selectProject(p.id, p.title));
        projectListEl.appendChild(item);
    });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function selectProject(id, title) {
    const snapshot = loadSnapshot(id);
    if (!snapshot || !Array.isArray(snapshot.nodes) || snapshot.nodes.length === 0) {
        showLoadError('No se pudo cargar ese esquema (o no tiene nodos todavía).');
        return;
    }
    pendingProject = { id, title: title || 'Mi Esquema', snapshot };
    introProjName.textContent = pendingProject.title;
    pickerScreen.style.display = 'none';
    introScreen.style.display = 'flex';
}

document.getElementById('introBack').addEventListener('click', (e) => {
    e.preventDefault();
    introScreen.style.display = 'none';
    pickerScreen.style.display = 'flex';
});

document.getElementById('btnExitFly').addEventListener('click', () => {
    exitFlight();
});

// Soporte de deep-link: /juego/?id=<projectId> — usado por el botón "🌌 3D"
// que ya está en la lista de "Mis Proyectos" de la app principal.
function tryDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) return false;
    const snapshot = loadSnapshot(id);
    if (!snapshot || !Array.isArray(snapshot.nodes) || snapshot.nodes.length === 0) {
        // El id no está en ESTE navegador (p. ej. se guardó en otra máquina) —
        // no es un error grave, simplemente mostramos el picker normal.
        return false;
    }
    const catalogGuess = findAllSavedProjects().find(p => p.id === id);
    selectProject(id, catalogGuess ? catalogGuess.title : 'Mi Esquema');
    return true;
}

document.getElementById('btnStartFly').addEventListener('click', () => {
    if (!pendingProject) return;
    introScreen.style.display = 'none';
    startFlight(pendingProject);
});

// ---------------------------------------------------------------------------
// 3. Escena three.js — se construye una sola vez; cada vuelo rellena nodos/edges
// ---------------------------------------------------------------------------

let renderer, scene, camera, composer, controls;
let flightActive = false;
let animId = null;

const hud = document.getElementById('hud');
const hudTitle = document.getElementById('hudTitle');
const hudCounter = document.getElementById('hudCounter');
const btnExitFly = document.getElementById('btnExitFly');
const lockOverlay = document.getElementById('lockOverlay');
const nodePanel = document.getElementById('nodePanel');
const nodePanelTitle = document.getElementById('nodePanelTitle');
const nodePanelBody = document.getElementById('nodePanelBody');

const canvas = document.getElementById('gameCanvas');

function initRenderer() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05040d, 0.012);

    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2000);

    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.5, 0.15);
    composer.addPass(bloomPass);

    window.addEventListener('resize', onResize);
}

function onResize() {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
}

// --- Fondo: estrellas + nebulosas, para que el vacío entre nodos no se sienta vacío ---

function buildStarfield() {
    const starCount = 2600;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        const r = 300 + Math.random() * 900;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: true, transparent: true, opacity: 0.85 });
    const stars = new THREE.Points(geo, mat);
    stars.name = 'gk_stars';
    scene.add(stars);
}

function makeNebulaSprite(color, x, y, z, scale, opacity) {
    const size = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, color + 'cc');
    grad.addColorStop(0.5, color + '33');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(scale, scale, 1);
    sprite.name = 'gk_nebula';
    return sprite;
}

function buildNebulae() {
    const palette = ['#6366f1', '#67e8f9', '#f472b6', '#34d399', '#fbbf24'];
    for (let i = 0; i < 9; i++) {
        const color = palette[i % palette.length];
        const x = (Math.random() - 0.5) * 700;
        const y = (Math.random() - 0.5) * 300;
        const z = (Math.random() - 0.5) * 700;
        const scale = 140 + Math.random() * 220;
        scene.add(makeNebulaSprite(color, x, y, z, scale, 0.35 + Math.random() * 0.25));
    }
}

// --- Etiquetas de texto como sprites (canvas -> textura) ---

function makeLabelSprite(text, colorHex) {
    const paddingX = 18, fontSize = 30;
    const cvMeasure = document.createElement('canvas').getContext('2d');
    cvMeasure.font = `700 ${fontSize}px -apple-system, Segoe UI, Roboto, sans-serif`;
    const textWidth = Math.min(cvMeasure.measureText(text).width, 480);

    const canvasEl = document.createElement('canvas');
    const w = Math.ceil(textWidth + paddingX * 2);
    const h = fontSize + 24;
    canvasEl.width = w;
    canvasEl.height = h;
    const ctx = canvasEl.getContext('2d');
    ctx.font = `700 ${fontSize}px -apple-system, Segoe UI, Roboto, sans-serif`;

    // Fondo de "placa" translúcida para que se lea sobre cualquier fondo estelar.
    ctx.fillStyle = 'rgba(8, 6, 22, 0.72)';
    roundRect(ctx, 0, 0, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = colorHex + '99';
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, w - 2, h - 2, 12);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    let label = text;
    while (ctx.measureText(label).width > w - paddingX * 2 && label.length > 3) {
        label = label.slice(0, -2) + '…';
    }
    ctx.fillText(label, w / 2, h / 2 + 2);

    const tex = new THREE.CanvasTexture(canvasEl);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    const aspect = w / h;
    const spriteHeight = 2.6;
    sprite.scale.set(spriteHeight * aspect, spriteHeight, 1);
    return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ---------------------------------------------------------------------------
// 4. Construcción del grafo 3D a partir de nodes/edges guardados
// ---------------------------------------------------------------------------

const DISCOVER_RADIUS = 6.5;     // distancia a la que un nodo se da por "descubierto"
const LAYER_SPACING = 26;        // separación en Z por nivel de profundidad (BFS)
const RING_BASE_RADIUS = 7;      // radio base del anillo en XY para cada nivel

let activeGraph = null; // { group, nodeMeshes: Map<id,{mesh,label,node,depth}>, edgeLines: [], totalDiscoverable, discoveredCount }

function clearActiveGraph() {
    if (activeGraph && activeGraph.group) {
        scene.remove(activeGraph.group);
    }
    activeGraph = null;
}

function buildGraphFromSnapshot(snapshot) {
    clearActiveGraph();

    const rawNodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
    const rawEdges = Array.isArray(snapshot.edges) ? snapshot.edges : [];
    if (rawNodes.length === 0) return null;

    // --- BFS desde el nodo raíz (el primero, igual criterio que usa app.js
    // para el título del proyecto) para asignar "profundidad" -> eje Z.
    // Así, volar hacia adelante se siente como ir "más adentro" del tema.
    const byId = new Map(rawNodes.map(n => [String(n.id), n]));
    const adjacency = new Map();
    rawNodes.forEach(n => adjacency.set(String(n.id), []));
    rawEdges.forEach(e => {
        const a = String(e.from), b = String(e.to);
        if (adjacency.has(a)) adjacency.get(a).push(b);
        if (adjacency.has(b)) adjacency.get(b).push(a);
    });

    const rootId = String(rawNodes[0].id);
    const depth = new Map([[rootId, 0]]);
    const queue = [rootId];
    while (queue.length) {
        const cur = queue.shift();
        const d = depth.get(cur);
        for (const nb of adjacency.get(cur) || []) {
            if (!depth.has(nb)) { depth.set(nb, d + 1); queue.push(nb); }
        }
    }
    // Nodos inalcanzables desde la raíz (gráfico desconectado) → los mandamos
    // a un nivel extra al final en vez de dejarlos todos apilados en Z=0.
    let maxDepth = 0;
    depth.forEach(d => { if (d > maxDepth) maxDepth = d; });
    rawNodes.forEach(n => { if (!depth.has(String(n.id))) depth.set(String(n.id), maxDepth + 1); });

    // Agrupar por nivel para distribuir en un anillo y evitar superposición.
    const byDepth = new Map();
    depth.forEach((d, id) => {
        if (!byDepth.has(d)) byDepth.set(d, []);
        byDepth.get(d).push(id);
    });

    const group = new THREE.Group();
    const nodeMeshes = new Map();

    byDepth.forEach((ids, d) => {
        const z = -d * LAYER_SPACING;
        const ringRadius = d === 0 ? 0 : RING_BASE_RADIUS + Math.sqrt(ids.length) * 5.5;
        ids.forEach((id, i) => {
            const node = byId.get(id);
            if (!node) return;
            let x, y;
            if (d === 0) { x = 0; y = 0; }
            else {
                const angle = (i / ids.length) * Math.PI * 2 + d * 0.6; // offset para no alinear todos los anillos
                x = Math.cos(angle) * ringRadius;
                y = Math.sin(angle) * ringRadius * 0.6; // achatado en Y para sensación de "vuelo horizontal"
            }
            // Un poco de variación orgánica para que no se vea perfectamente geométrico.
            x += (Math.random() - 0.5) * 2.5;
            y += (Math.random() - 0.5) * 2.5;

            const colorHex = (node.color && node.color.border) ? node.color.border : '#a5b4fc';
            const color = new THREE.Color(colorHex);

            const isRoot = d === 0;
            const radius = isRoot ? 1.6 : 0.95;
            const geo = new THREE.IcosahedronGeometry(radius, 1);
            const mat = new THREE.MeshStandardMaterial({
                color, emissive: color, emissiveIntensity: isRoot ? 1.4 : 0.9,
                roughness: 0.35, metalness: 0.2
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            group.add(mesh);

            // Halo (esfera translúcida más grande) para que el nodo se vea
            // como un punto de luz incluso de lejos, antes de distinguir la forma.
            const haloGeo = new THREE.SphereGeometry(radius * 2.2, 12, 12);
            const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false });
            const halo = new THREE.Mesh(haloGeo, haloMat);
            mesh.add(halo);

            const labelText = (node.baseTitle || (node.label || '').replace(/\*/g, '').split('\n')[0] || 'Nodo').trim();
            const label = makeLabelSprite(labelText, colorHex);
            label.position.set(0, radius + 1.5, 0);
            mesh.add(label);

            nodeMeshes.set(id, { mesh, label, node, depth: d, discovered: isRoot, labelText });
        });
    });

    // El nodo raíz arranca "descubierto" (es el punto de partida, tiene sentido
    // que ya se vea su nombre sin tener que acercarse).
    const edgeLines = [];
    rawEdges.forEach(e => {
        const a = nodeMeshes.get(String(e.from));
        const b = nodeMeshes.get(String(e.to));
        if (!a || !b) return;
        const points = [a.mesh.position.clone(), b.mesh.position.clone()];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const colorHex = (a.node.color && a.node.color.border) ? a.node.color.border : '#818cf8';
        const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(colorHex), transparent: true, opacity: 0.45 });
        const line = new THREE.Line(geo, mat);
        group.add(line);
        edgeLines.push(line);
    });

    scene.add(group);

    activeGraph = {
        group, nodeMeshes, edgeLines,
        totalDiscoverable: nodeMeshes.size,
        discoveredCount: 1 // la raíz ya cuenta
    };
    return activeGraph;
}

// ---------------------------------------------------------------------------
// 5. Movimiento en primera persona (PointerLockControls + WASD manual)
// ---------------------------------------------------------------------------

const moveState = { forward: false, back: false, left: false, right: false, up: false, down: false, boost: false };
const velocity = new THREE.Vector3();
const BASE_SPEED = 14;     // unidades/seg
const BOOST_MULT = 2.6;
const DAMPING = 5.5;       // qué tan rápido frena al soltar teclas

function onKeyDown(e) {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveState.forward = true; break;
        case 'KeyS': case 'ArrowDown': moveState.back = true; break;
        case 'KeyA': case 'ArrowLeft': moveState.left = true; break;
        case 'KeyD': case 'ArrowRight': moveState.right = true; break;
        case 'Space': moveState.up = true; e.preventDefault(); break;
        case 'ShiftLeft': case 'ShiftRight': moveState.down = true; moveState.boost = true; break;
    }
}
function onKeyUp(e) {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveState.forward = false; break;
        case 'KeyS': case 'ArrowDown': moveState.back = false; break;
        case 'KeyA': case 'ArrowLeft': moveState.left = false; break;
        case 'KeyD': case 'ArrowRight': moveState.right = false; break;
        case 'Space': moveState.up = false; break;
        case 'ShiftLeft': case 'ShiftRight': moveState.down = false; moveState.boost = false; break;
    }
}

// ---------------------------------------------------------------------------
// 6. Ciclo de vuelo: entrar, animar, descubrir nodos, salir
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();
let currentProjectTitle = '';

function startFlight(project) {
    initRenderer();
    if (scene.getObjectByName('gk_stars') == null) {
        buildStarfield();
        buildNebulae();
    }

    const graph = buildGraphFromSnapshot(project.snapshot);
    if (!graph) { showLoadError('Ese esquema no tiene nodos.'); pickerScreen.style.display = 'flex'; return; }

    currentProjectTitle = project.title;
    hudTitle.textContent = project.title;
    updateCounterHud();

    // Cámara arranca un poco atrás y arriba del nodo raíz, mirando hacia la escena.
    camera.position.set(0, 2.2, 14);
    camera.lookAt(0, 0, 0);
    velocity.set(0, 0, 0);

    if (!controls) {
        controls = new PointerLockControls(camera, document.body);
        controls.addEventListener('lock', () => { lockOverlay.style.display = 'none'; });
        controls.addEventListener('unlock', () => {
            if (flightActive) lockOverlay.style.display = 'flex';
        });
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    lockOverlay.addEventListener('click', requestLock);

    hud.style.display = 'block';
    btnExitFly.style.display = 'block';
    flightActive = true;
    clock.start();
    requestLock();
    if (!animId) animate();
}

function requestLock() {
    try { controls.lock(); } catch { /* algunos navegadores tiran si ya está en otro estado; se ignora */ }
}

function exitFlight() {
    flightActive = false;
    hud.style.display = 'none';
    btnExitFly.style.display = 'none';
    lockOverlay.style.display = 'none';
    nodePanel.classList.remove('visible');
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    lockOverlay.removeEventListener('click', requestLock);
    try { controls && controls.unlock(); } catch { /* no-op */ }
    Object.keys(moveState).forEach(k => moveState[k] = false);

    pendingProject = null;
    pickerScreen.style.display = 'flex';
    renderPicker();
}

function updateCounterHud() {
    if (!activeGraph) return;
    hudCounter.textContent = `${activeGraph.discoveredCount} / ${activeGraph.totalDiscoverable} nodos`;
}

let lastDiscoveredId = null;
let panelHideTimer = null;

function checkDiscovery() {
    if (!activeGraph) return;
    let closest = null;
    let closestDist = Infinity;
    activeGraph.nodeMeshes.forEach((entry, id) => {
        const dist = camera.position.distanceTo(entry.mesh.position);
        if (dist < closestDist) { closestDist = dist; closest = { id, entry, dist }; }
    });
    if (!closest) return;

    if (closestDist < DISCOVER_RADIUS) {
        if (!closest.entry.discovered) {
            closest.entry.discovered = true;
            activeGraph.discoveredCount++;
            updateCounterHud();
        }
        if (lastDiscoveredId !== closest.id) {
            lastDiscoveredId = closest.id;
            showNodePanel(closest.entry);
        }
    } else if (closestDist > DISCOVER_RADIUS * 2.2 && lastDiscoveredId === closest.id) {
        lastDiscoveredId = null;
        hideNodePanelSoon();
    }
}

function showNodePanel(entry) {
    clearTimeout(panelHideTimer);
    nodePanelTitle.textContent = entry.labelText;
    const def = entry.node.definition;
    nodePanelBody.textContent = def ? String(def).slice(0, 400) : 'Este nodo no tiene una definición guardada todavía.';
    nodePanel.classList.add('visible');
}

function hideNodePanelSoon() {
    clearTimeout(panelHideTimer);
    panelHideTimer = setTimeout(() => nodePanel.classList.remove('visible'), 400);
}

function animate() {
    animId = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);

    if (flightActive && controls && controls.isLocked) {
        const speed = BASE_SPEED * (moveState.boost ? BOOST_MULT : 1);

        const dir = new THREE.Vector3();
        if (moveState.forward) dir.z -= 1;
        if (moveState.back) dir.z += 1;
        if (moveState.left) dir.x -= 1;
        if (moveState.right) dir.x += 1;
        if (dir.lengthSq() > 0) dir.normalize();

        // dir está en espacio local de la cámara (forward = -Z); lo pasamos a
        // velocidad objetivo y amortiguamos hacia ella para que el vuelo se
        // sienta con algo de inercia, no como un cursor pegado al teclado.
        const targetVel = dir.multiplyScalar(speed);
        velocity.x += (targetVel.x - velocity.x) * Math.min(1, dt * DAMPING);
        velocity.z += (targetVel.z - velocity.z) * Math.min(1, dt * DAMPING);

        let vertical = 0;
        if (moveState.up) vertical += 1;
        if (moveState.down && !moveState.boost) vertical -= 1; // shift solo = boost; shift+espacio no baja
        velocity.y += ((vertical * speed) - velocity.y) * Math.min(1, dt * DAMPING);

        controls.moveRight(velocity.x * dt);
        controls.moveForward(-velocity.z * dt);
        camera.position.y += velocity.y * dt;

        checkDiscovery();
    }

    if (activeGraph) {
        // Las etiquetas (sprites) ya se auto-orientan hacia la cámara por
        // naturaleza de THREE.Sprite; solo las atenuamos con la distancia
        // para que no compitan visualmente cuando están muy lejos.
        activeGraph.nodeMeshes.forEach(entry => {
            const dist = camera.position.distanceTo(entry.mesh.position);
            entry.label.material.opacity = dist < 60 ? 1 : Math.max(0.08, 60 / dist);
        });
    }

    composer.render();
}

// ---------------------------------------------------------------------------
// 7. Arranque
// ---------------------------------------------------------------------------

renderPicker();
if (!tryDeepLink()) {
    pickerScreen.style.display = 'flex';
}
