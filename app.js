// ==========================================
// 1. INICIALIZACIÓN DEL GRAFO (VIS.JS)
// ==========================================
const container = document.getElementById('network-container');
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);
let currentDocumentText = "";
let selectedDensity = 'auto'; 
let sourceNodeForSynergy = null;
const synergyBanner = document.getElementById('synergyBanner');

// Paleta de colores suaves y elegantes
const elegantPalette = [
    { background: '#fdfbf7', border: '#cbd5e1' }, // Crema / Marfil
    { background: '#f8fafc', border: '#94a3b8' }, // Gris azulado
    { background: '#f0f9ff', border: '#bae6fd' }, // Celeste muy suave
    { background: '#f5f3ff', border: '#ddd6fe' }, // Lavanda pastel
    { background: '#fffbeb', border: '#fcd34d' }, // Amarillo pastel muy sutil
    { background: '#f0fdf4', border: '#bbf7d0' }, // Menta tenue
    { background: '#fef2f2', border: '#fecaca' }  // Rosa pálido
];

function getRandomColor() {
    return elegantPalette[Math.floor(Math.random() * elegantPalette.length)];
}

let network = new vis.Network(container, { nodes, edges }, {
    layout: { hierarchical: false },
    physics: {
        enabled: false,
        solver: 'repulsion',
        repulsion: { nodeDistance: 220, springLength: 200, springConstant: 0.05 }
    },
    nodes: { 
        shape: 'box', 
        margin: { top: 16, bottom: 16, left: 20, right: 20 },
        font: { 
            multi: 'md', 
            size: 16, 
            face: 'Inter, sans-serif', 
            color: '#334155',
            bold: { color: '#0f172a', size: 18, face: 'Inter, sans-serif' } 
        },
        borderWidth: 1.5,
        shadow: { enabled: true, color: 'rgba(0, 0, 0, 0.08)', size: 8, x: 2, y: 2 },
        shapeProperties: { borderRadius: 12 }
    },
    edges: { 
        arrows: { to: { enabled: true, scaleFactor: 0.8 } },
        color: { color: '#94a3b8', highlight: '#64748b', hover: '#cbd5e1' },
        font: { 
            size: 14, face: 'Inter, sans-serif', color: '#475569', strokeWidth: 3, 
            strokeColor: '#fbfcfd', align: 'middle'
        },
        width: 1.5,
        dashes: [4, 4],
        smooth: { type: 'dynamic' } // Curvatura orgánica y adaptativa para que no se vean todas iguales
    },
    interaction: { hover: true }
});

function stopPhysicsAndUnlock() {
    network.setOptions({ physics: { enabled: false } });
    const allNodes = nodes.get();
    nodes.update(allNodes.map(n => ({ id: n.id, fixed: { x: false, y: false } })));
}

network.on("stabilizationIterationsDone", stopPhysicsAndUnlock);
network.on("stabilized", stopPhysicsAndUnlock);

const DEFAULT_MAX_WIDTH = 250;
const DEFAULT_MAX_HEIGHT = 90;

// ==========================================
// 2. REFERENCIAS UI Y NOTIFICADOR
// ==========================================
const topicInput = document.getElementById('topicInput');
const actionMenu = document.getElementById('actionMenu');
const loaderOverlay = document.getElementById('loaderOverlay');
const loaderText = document.getElementById('loaderText');
const connectionBanner = document.getElementById('connectionBanner');
const storeModal = document.getElementById('storeModal');
const authWallModal = document.getElementById('authWallModal');
const landscapeToggle = document.getElementById('landscapeToggle');
const mainHeader = document.getElementById('mainHeader');

let selectedNodeId = null;
let sourceNodeForConnection = null;

function showLoader(msg) {
    if (loaderText && loaderOverlay) {
        loaderText.innerText = msg;
        loaderOverlay.classList.add('show');
    }
}

function hideLoader() {
    if (loaderOverlay) {
        loaderOverlay.classList.remove('show');
    }
}

landscapeToggle?.addEventListener('click', () => {
    mainHeader.classList.toggle('force-show');
    if (mainHeader.classList.contains('force-show')) {
        landscapeToggle.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>';
    } else {
        landscapeToggle.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>';
    }
});

// ==========================================
// 3. PERSISTENCIA AUTOMÁTICA Y TELEMETRÍA
// ==========================================
let sessionId = localStorage.getItem('gk_session_id') || ('s_' + Math.random().toString(36).substring(2, 9));
localStorage.setItem('gk_session_id', sessionId);
let currentProjectId = localStorage.getItem('gk_current_project_id');
let nodesTracked = parseInt(localStorage.getItem('gk_nodes_tracked') || '0', 10);

async function saveCurrentProjectToBin() {
    if (!currentUser) return; // BLOQUEO ESTRICTO: Invitados no guardan

    const userIdentifier = currentUser.id;
    const userName = currentUser.user_metadata?.full_name || currentUser.email;
    const projectData = { owner: userName, email: currentUser.email, nodes: nodes.get(), edges: edges.get() };
    
    // Asignar título basado en el primer nodo raíz
    let projectTitle = nodes.get().length > 0 ? (nodes.get()[0].baseTitle || "Mi Esquema") : "Esquema sin título";

    try {
        const response = await fetch('/.netlify/functions/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: currentProjectId || null, title: projectTitle, data: projectData, user: userIdentifier })
        });
        const resData = await response.json();
        
        if (response.ok && resData.projectId) {
            currentProjectId = resData.projectId;
            localStorage.setItem('gk_current_project_id', currentProjectId);

            // Actualizar catálogo local de proyectos para este usuario
            let catalog = JSON.parse(localStorage.getItem(`gk_projects_${userIdentifier}`) || '[]');
            const existingIndex = catalog.findIndex(p => p.id === currentProjectId);
            const updatedEntry = { id: currentProjectId, title: projectTitle, date: new Date().toISOString() };
            
            if (existingIndex >= 0) catalog[existingIndex] = updatedEntry;
            else catalog.push(updatedEntry);
            
            localStorage.setItem(`gk_projects_${userIdentifier}`, JSON.stringify(catalog));
        }
    } catch (err) { console.error("Error al sincronizar:", err); }
}

nodes.on('*', () => {
    clearTimeout(window._binSaveTimer);
    window._binSaveTimer = setTimeout(() => saveCurrentProjectToBin(), 2000);
});

function trackNodeUsage(topicName) {
    if (nodesTracked >= 50) return;
    nodesTracked++;
    localStorage.setItem('gk_nodes_tracked', nodesTracked.toString());
    fetch('/.netlify/functions/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicName, sessionId: sessionId })
    }).catch(() => {});
}

// ==========================================
// 4. AUTENTICACIÓN Y SALDOS
// ==========================================
let currentUser = null;
let isAdmin = localStorage.getItem('gk_is_admin') === 'true';
let availableNodes = 0;

if (window.netlifyIdentity) {
    netlifyIdentity.init({ locale: 'es' });
    currentUser = netlifyIdentity.currentUser();
    initializeBalance();
    updateAuthUI();
    
    netlifyIdentity.on('init', user => { currentUser = user; initializeBalance(); updateAuthUI(); });
    netlifyIdentity.on('login', user => { 
        currentUser = user; 
        authWallModal?.classList.add('hidden'); 
        netlifyIdentity.close(); 
        initializeBalance(); updateAuthUI(); 
    });
    netlifyIdentity.on('logout', () => { currentUser = null; initializeBalance(); updateAuthUI(); });
}

function initializeBalance() {
    if (isAdmin) { updateCounterDisplay(); return; }
    
    if (currentUser) {
        let storedBalance = parseInt(localStorage.getItem(`gk_balance_${currentUser.id}`), 10);
        if (isNaN(storedBalance)) { 
            storedBalance = 15; // <-- Reducido a 15 para usuarios logueados
            localStorage.setItem(`gk_balance_${currentUser.id}`, storedBalance); 
        }
        availableNodes = storedBalance;
    } else {
        let guestBalance = parseInt(localStorage.getItem('gk_guest_balance'), 10);
        if (isNaN(guestBalance)) { 
            guestBalance = 15; 
            localStorage.setItem('gk_guest_balance', guestBalance); 
        }
        availableNodes = guestBalance;
    }
    updateCounterDisplay();
}

function updateAuthUI() {
    const loginText = document.getElementById('loginText');
    const userStatusDot = document.getElementById('userStatusDot');
    const btnProjects = document.getElementById('btnProjects'); // Botón Proyectos
    
    if (!loginText || !userStatusDot) return;
    
    if (currentUser) {
        loginText.innerText = currentUser.user_metadata?.full_name?.split(' ')[0] || "Mi Cuenta";
        userStatusDot.className = 'w-2 h-2 rounded-full bg-indigo-500';
        if (btnProjects) { btnProjects.classList.remove('hidden'); btnProjects.classList.add('flex'); }
    } else {
        loginText.innerText = "Iniciar Sesión";
        userStatusDot.className = 'w-2 h-2 rounded-full bg-slate-300';
        if (btnProjects) { btnProjects.classList.add('hidden'); btnProjects.classList.remove('flex'); }
    }
}

document.getElementById('btnLogin')?.addEventListener('click', () => {
    if (currentUser) netlifyIdentity.open(); else netlifyIdentity.open('login');
});

document.getElementById('btnTriggerNetlifyLogin')?.addEventListener('click', () => {
    authWallModal?.classList.add('hidden');
    netlifyIdentity.open('login');
});

document.getElementById('closeAuthWall')?.addEventListener('click', () => {
    authWallModal?.classList.add('hidden');
});

function requireAuth(actionDescription) {
    if (currentUser || isAdmin) return true;
    if (authWallModal) { authWallModal.classList.remove('hidden'); authWallModal.classList.add('flex'); }
    if (actionMenu) actionMenu.classList.add('hidden');
    return false;
}

function updateCounterDisplay() {
    const display = document.getElementById('nodeCountDisplay');
    const dot = document.getElementById('statusDot');
    if (!display || !dot) return;
    if (isAdmin) {
        display.innerText = 'Admin (∞)';
        dot.className = 'w-2 h-2 rounded-full bg-purple-500';
        return;
    }
    display.innerText = `${availableNodes} Nodos`;
    if (availableNodes <= 0) dot.className = 'w-2 h-2 rounded-full bg-red-500';
    else if (availableNodes < 10 && currentUser) dot.className = 'w-2 h-2 rounded-full bg-amber-500';
    else dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
}

function consumeNodes(amount) {
    if (isAdmin) return;
    availableNodes -= amount;
    if (availableNodes < 0) availableNodes = 0;
    if (currentUser) localStorage.setItem(`gk_balance_${currentUser.id}`, availableNodes);
    else localStorage.setItem('gk_guest_balance', availableNodes);
    updateCounterDisplay();
}

function checkBalance(cost) {
    if (isAdmin) return true;
    if (availableNodes < cost) {
        if (!currentUser) requireAuth("procesar este esquema");
        else {
            if (actionMenu) actionMenu.classList.add('hidden');
            storeModal?.classList.remove('hidden'); storeModal?.classList.add('flex');
        }
        return false;
    }
    return true;
}

// ==========================================
// 6. GENERACIÓN DE ESQUEMA EN 3 NIVELES Y NODOS
// ==========================================
function renderThreeLevelTree(data) {
    if (nodes.length > 0) { nodes.clear(); edges.clear(); }
    
    const viewCenter = network.getViewPosition();
    const rootX = viewCenter.x;
    const rootY = viewCenter.y - 220;

    const root = data.root;
    const branches = data.branches || [];
    const subBranches = data.subBranches || [];

    // 1. Crear Raíz (Nivel 1)
    nodes.add({
        id: root.id, label: `*${root.label}*`, baseTitle: root.label,
        color: getRandomColor(), definition: root.definition || null,
        x: rootX, y: rootY, fixed: { x: false, y: false }
    });
    trackNodeUsage(root.label);

    // 2. Agrupar Sub-ramas (Nivel 3) por cada Rama (Nivel 2) para calcular el ancho real
    const childrenByBranch = {};
    branches.forEach(b => { childrenByBranch[b.id] = []; });
    subBranches.forEach(sb => {
        if (childrenByBranch[sb.parentId]) {
            childrenByBranch[sb.parentId].push(sb);
        } else if (branches.length > 0) {
            childrenByBranch[branches[0].id].push(sb);
        }
    });

    const subSpacing = 230; // Espacio horizontal entre nodos de Nivel 3
    const branchWidths = branches.map(b => {
        const count = childrenByBranch[b.id].length;
        return Math.max(1, count) * subSpacing;
    });

    const totalTreeWidth = branchWidths.reduce((sum, w) => sum + w, 0);
    let currentLeftX = rootX - (totalTreeWidth / 2);

    const branchY = rootY + 180;
    const subBranchY = branchY + 180;

    // 3. Posicionar Nivel 2 y Nivel 3 simétricamente sin colisiones
    branches.forEach((branch, idx) => {
        const sectionWidth = branchWidths[idx];
        const branchX = currentLeftX + (sectionWidth / 2);

        nodes.add({
            id: branch.id, label: `*${branch.label}*`, baseTitle: branch.label,
            color: getRandomColor(), definition: branch.definition || null,
            x: branchX, y: branchY, fixed: { x: false, y: false }
        });
        edges.add({ from: root.id, to: branch.id, label: branch.relationship });
        trackNodeUsage(branch.label);

        const subs = childrenByBranch[branch.id];
        const startSubX = branchX - (((subs.length - 1) * subSpacing) / 2);

        subs.forEach((sub, sIdx) => {
            const subX = startSubX + (sIdx * subSpacing);
            nodes.add({
                id: sub.id, label: `*${sub.label}*`, baseTitle: sub.label,
                color: getRandomColor(), definition: sub.definition || null,
                x: subX, y: subBranchY + (sIdx % 2 === 0 ? 0 : 35), // Ligero escalonado para legibilidad
                fixed: { x: false, y: false }
            });
            edges.add({ from: branch.id, to: sub.id, label: sub.relationship });
            trackNodeUsage(sub.label);
        });

        currentLeftX += sectionWidth;
    });

    network.setOptions({ physics: { enabled: false } });
    network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
}

async function generateFullSchemaFromTopic(topicText) {
    if (!topicText) return;
    // Verificamos que tenga al menos saldo disponible para iniciar
    if (!checkBalance(1)) return;
    
    showLoader(`Estructurando esquema de 3 niveles...`);
    if (topicInput) topicInput.value = '';

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'parse_text', text: topicText })
        });
        if (!response.ok) throw new Error("Error en el servidor");
        
        const data = await response.json();
        const totalNodes = 1 + (data.branches?.length || 0) + (data.subBranches?.length || 0);

        renderThreeLevelTree(data);
        consumeNodes(totalNodes);
    } catch (err) {
        console.error(err);
        alert('Intenta de nuevo en unos segundos');
    } finally {
        hideLoader();
    }
}

function insertSingleNode(topic) {
    if (!checkBalance(1)) return;
    const viewCenter = network.getViewPosition();
    const spawnX = viewCenter.x + 200 + (Math.random() * 50); 
    const spawnY = viewCenter.y + (Math.random() * 100 - 50);
    nodes.add({ id: topic, label: `*${topic}*`, baseTitle: topic, color: getRandomColor(), x: spawnX, y: spawnY, fixed: { x: false, y: false } });
    trackNodeUsage(topic); consumeNodes(1); topicInput.value = '';
    setTimeout(() => { network.focus(topic, { scale: 1.0, animation: { duration: 600 }}); }, 50);
}

function handleTopicInput() {
    const topic = topicInput.value.trim();
    if (!topic) return;
    // Si el lienzo está vacío, el primer nodo genera un esquema completo de 3 niveles
    if (nodes.length === 0) {
        generateFullSchemaFromTopic(topic);
    } else {
        insertSingleNode(topic);
    }
}

document.getElementById('btnGenerate')?.addEventListener('click', handleTopicInput);
document.getElementById('topicInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleTopicInput(); });


// ==========================================
// 7. EXPANDIR RAMAS MANUALMENTE (Lógica 'Auto')
// ==========================================
function getContextPath(nodeId) {
    let path = [nodeId]; let current = nodeId;
    for (let i = 0; i < 5; i++) {
        let parentEdges = edges.get({ filter: e => e.to === current });
        if (parentEdges.length === 0) break;
        current = parentEdges[0].from; path.unshift(current);
    }
    return path.map(id => { const n = nodes.get(id); return n ? (n.baseTitle || id) : id; }).join(' > ');
}

document.getElementById('btnMenuExpand')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    if (!requireAuth("profundizar en conceptos relacionados")) return; 

    const nodeCountVal = document.getElementById('nodeCount').value;
    const maxNodes = nodeCountVal === 'auto' ? 'entre 3 y 6 (según relevancia)' : parseInt(nodeCountVal, 10);
    const estimatedCost = nodeCountVal === 'auto' ? 4 : maxNodes;
    if (!checkBalance(estimatedCost)) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    const topicName = currentNode.baseTitle || selectedNodeId;

    if (currentNode && currentNode.expanded) return;
    showLoader('Generando conceptos conexos...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'expand', topic: topicName, contextPath, maxNodes, documentContext: globalDocumentContext || currentDocumentText})
        });
        const data = await response.json();
        nodes.update(nodes.get().map(n => ({ id: n.id, fixed: { x: true, y: true } })));
        const parentPos = network.getPositions([selectedNodeId])[selectedNodeId];
        network.setOptions({ physics: { enabled: true } });

        let createdCount = 0;
        (data.concepts || []).forEach(concept => {
            if (!nodes.get(concept.id)) {
                nodes.add({ id: concept.id, label: `*${concept.label}*`, baseTitle: concept.label, color: getRandomColor(), expanded: false, x: parentPos.x, y: parentPos.y, fixed: { x: false, y: false } });
                edges.add({ from: selectedNodeId, to: concept.id, label: concept.relationship });
                trackNodeUsage(concept.label); createdCount++;
            }
        });
        nodes.update({ id: selectedNodeId, expanded: true });
        consumeNodes(createdCount);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1200);
    } catch { alert("Error al conectar con el servicio."); } finally { hideLoader(); }
});

// ==========================================
// 8. GENERAR EJEMPLOS MANUALMENTE
// ==========================================
document.getElementById('btnMenuExamples')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const nodeCountVal = document.getElementById('nodeCount').value;
    const maxNodes = nodeCountVal === 'auto' ? 'varios (entre 3 y 5 representativos)' : parseInt(nodeCountVal, 10);
    const estimatedCost = nodeCountVal === 'auto' ? 4 : maxNodes;
    if (!checkBalance(estimatedCost)) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    const topicName = currentNode.baseTitle || selectedNodeId;

    showLoader('Buscando casos prácticos...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'examples', topic: topicName, contextPath, maxNodes, documentContext: globalDocumentContext || currentDocumentText })
        });
        const data = await response.json();
        nodes.update(nodes.get().map(n => ({ id: n.id, fixed: { x: true, y: true } })));
        const parentPos = network.getPositions([selectedNodeId])[selectedNodeId];
        network.setOptions({ physics: { enabled: true } });

        let createdCount = 0;
        (data.examples || []).forEach(example => {
            if (!nodes.get(example.id)) {
                nodes.add({ 
                    id: example.id, label: `*Ejemplo:*\n${example.label}`, baseTitle: example.label, expanded: false, x: parentPos.x, y: parentPos.y, fixed: { x: false, y: false },
                    color: { background: '#ffffff', border: '#e2e8f0' }, shapeProperties: { borderRadius: 8, borderDashes: [4, 4] }
                });
                edges.add({ from: selectedNodeId, to: example.id, label: example.relationship, color: { color: '#cbd5e1' }, dashes: true });
                trackNodeUsage(example.label); createdCount++;
            }
        });
        consumeNodes(createdCount);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1200);
    } catch { alert("Error al conectar con el servicio."); } finally { hideLoader(); }
});

// ==========================================
// 13. EVENTOS DEL CANVAS (MENÚ DINÁMICO, VÍNCULOS Y SINERGIA)
// ==========================================
network.on('click', async function (params) {
    if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0];
        
        // --- 1. LÓGICA DE SINERGIA (FUSIÓN) ---
        if (sourceNodeForSynergy && sourceNodeForSynergy !== clickedNodeId) {
            const nodeA = nodes.get(sourceNodeForSynergy);
            const nodeB = nodes.get(clickedNodeId);
            const topicA = nodeA.baseTitle || sourceNodeForSynergy;
            const topicB = nodeB.baseTitle || clickedNodeId;
            
            sourceNodeForSynergy = null;
            const banner = document.getElementById('synergyBanner');
            if(banner) banner.classList.add('hidden');

            showLoader('Calculando convergencia...');
            try {
                const response = await fetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'synergy', topic: topicA, topicB: topicB, density: document.getElementById('nodeCount')?.value || 'auto' })
                });
                if(!response.ok) throw new Error("Error de red");
                const data = await response.json();

                const totalNodes = 1 + (data.pathsFromA?.length || 0) + (data.pathsFromB?.length || 0);
                if (!checkBalance(totalNodes)) return;

                nodes.update(nodes.get().map(n => ({ id: n.id, fixed: { x: true, y: true } })));
                network.setOptions({ physics: { enabled: true } });

                const posA = network.getPositions([nodeA.id])[nodeA.id];
                const posB = network.getPositions([nodeB.id])[nodeB.id];
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                const synNode = data.synergy;
                if (!nodes.get(synNode.id)) {
                    nodes.add({
                        id: synNode.id, label: `*🌟 Sinergia:*\n${synNode.label}`, baseTitle: synNode.label,
                        x: midX, y: midY, fixed: { x: false, y: false },
                        color: { background: '#faf5ff', border: '#d946ef', highlight: { background: '#fdf4ff', border: '#c026d3' } },
                        font: { color: '#4a044e', bold: { color: '#701a75', size: 16 } },
                        borderWidth: 2, shadow: { enabled: true, color: 'rgba(217, 70, 239, 0.2)', size: 20 }
                    });
                    trackNodeUsage(synNode.label);
                }

                (data.pathsFromA || []).forEach(bridge => {
                    if (!nodes.get(bridge.id)) {
                        nodes.add({ id: bridge.id, label: `*${bridge.label}*`, baseTitle: bridge.label, x: posA.x + (midX - posA.x)/2 + (Math.random()*40-20), y: posA.y + (midY - posA.y)/2 + (Math.random()*40-20), fixed: { x: false, y: false }, color: getRandomColor() });
                        trackNodeUsage(bridge.label);
                    }
                    edges.add({ from: nodeA.id, to: bridge.id, label: bridge.relFromA });
                    edges.add({ from: bridge.id, to: synNode.id, label: bridge.relToSynergy });
                });

                (data.pathsFromB || []).forEach(bridge => {
                    if (!nodes.get(bridge.id)) {
                        nodes.add({ id: bridge.id, label: `*${bridge.label}*`, baseTitle: bridge.label, x: posB.x + (midX - posB.x)/2 + (Math.random()*40-20), y: posB.y + (midY - posB.y)/2 + (Math.random()*40-20), fixed: { x: false, y: false }, color: getRandomColor() });
                        trackNodeUsage(bridge.label);
                    }
                    edges.add({ from: nodeB.id, to: bridge.id, label: bridge.relFromB });
                    edges.add({ from: bridge.id, to: synNode.id, label: bridge.relToSynergy });
                });

                consumeNodes(totalNodes);
                setTimeout(() => { stopPhysicsAndUnlock(); }, 1800);
            } catch (err) { alert("Intenta de nuevo en unos segundos"); } finally { hideLoader(); }
            return; // ¡Este return detiene el código para que NO abra el menú!
        }

        // --- 2. LÓGICA DE VINCULAR CON... ---
        if (sourceNodeForConnection && sourceNodeForConnection !== clickedNodeId) {
            const nodeA = nodes.get(sourceNodeForConnection);
            const nodeB = nodes.get(clickedNodeId);
            const topicA = nodeA.baseTitle || sourceNodeForConnection;
            const topicB = nodeB.baseTitle || clickedNodeId;
            
            sourceNodeForConnection = null;
            const banner = document.getElementById('connectionBanner');
            if(banner) banner.classList.add('hidden');

            if (!checkBalance(1)) return;

            showLoader('Generando puente conceptual...');
            try {
                const response = await fetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'connect', topic: topicA, topicB: topicB })
                });
                if(!response.ok) throw new Error("Error de red");
                const data = await response.json();

                const posA = network.getPositions([nodeA.id])[nodeA.id];
                const posB = network.getPositions([nodeB.id])[nodeB.id];
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                const bridge = data.bridge;
                if (!nodes.get(bridge.id)) {
                    nodes.add({ id: bridge.id, label: `*${bridge.label}*`, baseTitle: bridge.label, x: midX, y: midY, fixed: { x: false, y: false }, color: getRandomColor() });
                    trackNodeUsage(bridge.label);
                    consumeNodes(1);
                }
                edges.add({ from: nodeA.id, to: bridge.id, label: bridge.relFromA });
                edges.add({ from: bridge.id, to: nodeB.id, label: bridge.relToB });
            } catch (err) { alert("Intenta de nuevo en unos segundos"); } finally { hideLoader(); }
            return; // ¡Este return detiene el código para que NO abra el menú!
        }

        // --- 3. MOSTRAR MENÚ CONTEXTUAL ---
        selectedNodeId = clickedNodeId;
        const nodePosition = network.getPositions([selectedNodeId])[selectedNodeId];
        const DOMCoords = network.canvasToDOM(nodePosition);
        const containerRect = container.getBoundingClientRect();
        
        actionMenu.style.visibility = 'hidden';
        actionMenu.classList.remove('hidden');
        
        const menuWidth = actionMenu.offsetWidth || 200;
        const menuHeight = actionMenu.offsetHeight || 300;
        
        let topPos = containerRect.top + DOMCoords.y - menuHeight - 15;
        let leftPos = containerRect.left + DOMCoords.x - (menuWidth / 2);
        
        if (topPos < 10) { topPos = containerRect.top + DOMCoords.y + 40; } // Desplegar debajo si no cabe arriba
        if (leftPos < 10) leftPos = 10;
        if (leftPos + menuWidth > window.innerWidth - 10) leftPos = window.innerWidth - menuWidth - 10;
        
        actionMenu.style.left = leftPos + 'px';
        actionMenu.style.top = topPos + 'px';
        actionMenu.style.visibility = 'visible';

        // LÓGICA DE VISIBILIDAD DE BOTONES
        const actualNode = nodes.get(selectedNodeId);
        const isExpanded = actualNode && actualNode.isExpandedDef === true;
        
        const btnExpand = document.getElementById('btnMenuExpandDef');
        const btnCollapse = document.getElementById('btnMenuCollapseDef');
        const btnOpenPanel = document.getElementById('btnMenuOpenPanel');
        
        if (isExpanded) {
            if (btnExpand) { btnExpand.classList.add('hidden'); btnExpand.classList.remove('flex'); }
            if (btnCollapse) { btnCollapse.classList.remove('hidden'); btnCollapse.classList.add('flex'); }
            if (btnOpenPanel) { btnOpenPanel.classList.remove('hidden'); btnOpenPanel.classList.add('flex'); }
        } else {
            if (btnExpand) { btnExpand.classList.remove('hidden'); btnExpand.classList.add('flex'); }
            if (btnCollapse) { btnCollapse.classList.add('hidden'); btnCollapse.classList.remove('flex'); }
            if (btnOpenPanel) { btnOpenPanel.classList.add('hidden'); btnOpenPanel.classList.remove('flex'); }
        }

    } else {
        actionMenu.classList.add('hidden');
        selectedNodeId = null;
    }
});

network.on('zoom', () => { actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden'); });
network.on('dragStart', (params) => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (params.nodes.length > 0) nodes.update({ id: params.nodes[0], fixed: { x: false, y: false } });
});

// ==========================================
// MODO LECTOR ACTIVO - TEXTO LIBRE Y RESIZER
// ==========================================
const btnToggleReader = document.getElementById('btnToggleReader');
const readerPanel = document.getElementById('readerPanel');
const readerTextMode = document.getElementById('readerTextMode');
const selectionTooltip = document.getElementById('selectionTooltip');
const panelResizer = document.getElementById('panelResizer');
const docContextInput = document.getElementById('docContextInput');

const nodeDetailPanel = document.getElementById('nodeDetailPanel');
const detailNodeTitle = document.getElementById('detailNodeTitle');
const nodeDetailContent = document.getElementById('nodeDetailContent');
const closeDetailPanel = document.getElementById('closeDetailPanel'); 
const nodeSelectionTooltip = document.getElementById('nodeSelectionTooltip');
const nodeTooltipPreview = document.getElementById('nodeTooltipPreview');
const nodeBtnExtractChild = document.getElementById('nodeBtnExtractChild');

let globalDocumentContext = "";
let activeSelectedText = "";
let activeSelectionRange = null;
let activeNodeDetailId = null;
let activeNodeSelectionRange = null;
let activeNodeSelectedText = "";

docContextInput?.addEventListener('input', (e) => { globalDocumentContext = e.target.value.trim(); });

btnToggleReader?.addEventListener('click', () => {
    readerPanel.classList.toggle('hidden');
    
    // Cambiar texto según el estado del panel
    const isHidden = readerPanel.classList.contains('hidden');
    btnToggleReader.innerHTML = isHidden 
        ? '<span>📖</span> Mostrar Modo Lector' 
        : '<span>📖</span> Ocultar Modo Lector';
        
    setTimeout(() => { if (typeof network !== 'undefined') network.redraw(); }, 200);
});

// Resizer 100% Funcional (Matemática relativa para que no brinque)
let isResizing = false;
let startX = 0;
let startWidth = 0;

panelResizer?.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = readerPanel.offsetWidth; // Guardamos el ancho inicial real
    document.body.style.userSelect = 'none'; // Prevenir selección al arrastrar
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = startWidth + (e.clientX - startX); 
    if (newWidth > 250 && newWidth < window.innerWidth * 0.75) {
        readerPanel.classList.remove('w-1/3'); // <-- Actualizado para quitar w-1/3
        readerPanel.style.flex = 'none';
        readerPanel.style.width = `${newWidth}px`;
    }
});

document.addEventListener('mouseup', () => { 
    if (isResizing) {
        isResizing = false; 
        document.body.style.userSelect = '';
        setTimeout(() => { if (typeof network !== 'undefined') network.redraw(); }, 50);
    }
});

readerTextMode?.addEventListener('input', () => {
    const content = readerTextMode.innerText.trim();
    currentDocumentText = content;
    if (!docContextInput.value && content.length > 20) {
        docContextInput.value = content.split(/\s+/).slice(0, 6).join(' ') + '...';
        globalDocumentContext = docContextInput.value;
    }
});

readerTextMode?.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text.length > 2) {
        activeSelectedText = text;
        activeSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        document.getElementById('tooltipSelectedTextPreview').innerText = `"${text.substring(0, 25)}..."`;
        selectionTooltip.style.left = `${e.pageX - 60}px`;
        selectionTooltip.style.top = `${e.pageY - 70}px`;
        selectionTooltip.classList.remove('hidden');
    } else {
        selectionTooltip.classList.add('hidden');
    }
});

document.addEventListener('mousedown', (e) => {
    if (!selectionTooltip.contains(e.target) && !readerPanel.contains(e.target)) selectionTooltip.classList.add('hidden');
});

function highlightSelectedTextAndLink(nodeId) {
    if (!activeSelectionRange) return;
    try {
        const span = document.createElement('span');
        span.className = "bg-indigo-100 hover:bg-indigo-200 text-indigo-900 rounded px-1 transition-colors cursor-pointer border-b-2 border-indigo-300";
        span.appendChild(activeSelectionRange.extractContents());
        activeSelectionRange.insertNode(span);
        span.addEventListener('click', () => {
            if (nodes.get(nodeId)) {
                network.selectNodes([nodeId]);
                network.focus(nodeId, { scale: 1.2, animation: { duration: 600 }});
            }
        });
    } catch (err) {}
}

// ÚNICO BOTÓN AL SUBRAYAR EN EL LECTOR
document.getElementById('tipBtnCreateNode')?.addEventListener('click', () => {
    if (!activeSelectedText) return;
    selectionTooltip.classList.add('hidden');
    const topic = activeSelectedText; const rangeToHighlight = activeSelectionRange;
    activeSelectedText = ""; activeSelectionRange = null;

    if (!checkBalance(1)) return;

    const viewCenter = network.getViewPosition();
    const nodeId = topic;

    if (!nodes.get(nodeId)) {
        nodes.add({
            id: nodeId, label: `*${topic}*`, baseTitle: topic, color: getRandomColor(),
            x: viewCenter.x + (Math.random() * 100 - 50), y: viewCenter.y + (Math.random() * 100 - 50),
            fixed: { x: false, y: false }
        });
        trackNodeUsage(topic); consumeNodes(1);
    }
    activeSelectionRange = rangeToHighlight;
    highlightSelectedTextAndLink(nodeId);
    selectedNodeId = nodeId;
});

// ==========================================
// DEFINICIONES - TRES ACCIONES INDEPENDIENTES
// ==========================================
document.getElementById('btnMenuOpenPanel')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    const currentNode = nodes.get(selectedNodeId);
    const title = currentNode.baseTitle || selectedNodeId;
    let definitionText = currentNode.definition;

    if (!definitionText) {
        showLoader('Redactando definición...');
        try {
            const response = await fetch('/.netlify/functions/gemini', {
                method: 'POST', body: JSON.stringify({ action: 'define', topic: title, contextPath: getContextPath(selectedNodeId), documentContext: globalDocumentContext || currentDocumentText })
            });
            const data = await response.json(); definitionText = data.definition;
            nodes.update({ id: selectedNodeId, definition: definitionText, baseTitle: title });
        } catch (err) { alert("Error al obtener definición."); return; } finally { hideLoader(); }
    }
    detailNodeTitle.innerText = title;
    nodeDetailContent.innerHTML = `<p class="mb-3 font-semibold text-slate-800">${title}</p><p>${definitionText.replace(/\n/g, '<br>')}</p>`;
    nodeDetailPanel.classList.remove('hidden');
    activeNodeDetailId = selectedNodeId;
});

document.getElementById('btnMenuExpandDef')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    const currentNode = nodes.get(selectedNodeId);
    const title = currentNode.baseTitle || selectedNodeId;
    let definitionText = currentNode.definition;

    if (!definitionText) {
        showLoader('Redactando definición...');
        try {
            const response = await fetch('/.netlify/functions/gemini', {
                method: 'POST', body: JSON.stringify({ action: 'define', topic: title, contextPath: getContextPath(selectedNodeId), documentContext: globalDocumentContext || currentDocumentText })
            });
            const data = await response.json(); definitionText = data.definition;
        } catch (err) { alert("Error al obtener definición."); return; } finally { hideLoader(); }
    }
    nodes.update({ 
        id: selectedNodeId, baseTitle: title, definition: definitionText, 
        label: `*${title}*\n────────────────────\n${definitionText}`,
        isExpandedDef: true, shape: 'box',
        widthConstraint: { minimum: 480, maximum: 550 }, // <-- Ahora nace muy ancho y no tan alto
        heightConstraint: false // Permite que la altura se acomode sola al texto
    });
});

document.getElementById('btnMenuCollapseDef')?.addEventListener('click', () => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    const currentNode = nodes.get(selectedNodeId);
    nodes.update({
        id: selectedNodeId, label: `*${currentNode.baseTitle || selectedNodeId}*`, isExpandedDef: false,
        widthConstraint: { minimum: 150, maximum: 250 }, heightConstraint: false
    });
});

closeDetailPanel?.addEventListener('click', () => {
    nodeDetailPanel.classList.add('hidden');
    activeNodeDetailId = null;
});

// EXTRACCIÓN DE NODOS DESDE EL PANEL DE DEFINICIÓN (PANEL DERECHO)
nodeDetailContent?.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 2) {
        activeNodeSelectedText = text;
        activeNodeSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (nodeTooltipPreview) nodeTooltipPreview.innerText = `"${text.substring(0, 20)}..."`;
        nodeSelectionTooltip.style.left = `${e.offsetX - 20}px`;
        nodeSelectionTooltip.style.top = `${e.offsetY - 50}px`;
        nodeSelectionTooltip.classList.remove('hidden');
    } else {
        nodeSelectionTooltip.classList.add('hidden');
    }
});

document.addEventListener('mousedown', (e) => {
    if (nodeSelectionTooltip && !nodeSelectionTooltip.contains(e.target) && !nodeDetailContent?.contains(e.target)) {
        nodeSelectionTooltip.classList.add('hidden');
    }
});

nodeBtnExtractChild?.addEventListener('click', () => {
    if (!activeNodeSelectedText || !activeNodeDetailId) return;
    nodeSelectionTooltip.classList.add('hidden');

    const childTopic = activeNodeSelectedText;
    activeNodeSelectedText = ""; activeNodeSelectionRange = null;

    if (!checkBalance(1)) return;

    const parentPos = network.getPositions([activeNodeDetailId])[activeNodeDetailId];
    const newId = childTopic;

    if (!nodes.get(newId)) {
        nodes.add({
            id: newId, label: `*${childTopic}*`, baseTitle: childTopic, color: getRandomColor(),
            x: parentPos.x + 250, y: parentPos.y + (Math.random() * 100 - 50),
            fixed: { x: false, y: false },
            widthConstraint: { minimum: 150, maximum: 250 }, heightConstraint: { minimum: 50, maximum: 90 }
        });
        edges.add({ from: activeNodeDetailId, to: newId, label: 'deriva en' });
        trackNodeUsage(childTopic); consumeNodes(1);
    }
});

// ==========================================
// GENERAR ESQUEMA COMPLETO A PARTIR DEL TEXTO DEL LECTOR
// ==========================================
document.getElementById('btnParseReaderText')?.addEventListener('click', async () => {
    const textContent = readerTextMode.innerText.trim();
    if (!textContent || textContent.length < 3) return alert("Escribe un tema o pega un texto en el lector.");
    
    currentDocumentText = textContent;
    await generateFullSchemaFromTopic(textContent);
});

// ==========================================
// 15. PANTALLA DE BIENVENIDA Y SORPRÉNDEME
// ==========================================
const welcomeScreen = document.getElementById('welcomeScreen');
let hasDismissedWelcomeScreen = false;

function dismissWelcomeScreen() {
    if (hasDismissedWelcomeScreen) return;
    welcomeScreen.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => { welcomeScreen.classList.add('hidden'); hasDismissedWelcomeScreen = true; }, 500);
}

welcomeScreen?.addEventListener('click', (e) => { if (e.target === welcomeScreen) dismissWelcomeScreen(); });
topicInput?.addEventListener('focus', dismissWelcomeScreen);
document.getElementById('btnWelcomeReader')?.addEventListener('click', () => { 
    dismissWelcomeScreen(); 
    readerPanel.classList.remove('hidden'); 
});
nodes.on('*', () => { if (nodes.length > 0 && !hasDismissedWelcomeScreen) dismissWelcomeScreen(); });

// Temas precargados para la sorpresa
const hookTopics = [
    "La Paradoja de Fermi", "El Mito de la Caverna", "Computación Cuántica",
    "Filosofía Estoica", "Neuroplasticidad", "Inteligencia Artificial General",
    "Economía Conductual", "La Teoría de Cuerdas", "Imperio Romano"
];

// Generar los 3 botones de sugerencias al azar
const chipsContainer = document.getElementById('suggestionChips');
if (chipsContainer) {
    const shuffled = [...hookTopics].sort(() => 0.5 - Math.random());
    shuffled.slice(0, 3).forEach(topic => {
        const chip = document.createElement('button');
        chip.className = "bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-full text-xs font-bold hover:border-slate-400 hover:text-slate-900 transition-colors shadow-sm";
        chip.innerText = topic;
        chip.onclick = () => generateFullSchemaFromTopic(topic);
        chipsContainer.appendChild(chip);
    });
}

// Botón de Sorpréndeme
document.getElementById('btnSurprise')?.addEventListener('click', () => {
    const randomTopic = hookTopics[Math.floor(Math.random() * hookTopics.length)];
    // Enviaremos el tema al azar directamente al generador principal
    generateFullSchemaFromTopic(randomTopic);
});

// ==========================================
// HERRAMIENTAS: ELIMINAR, LIMPIAR, ESCALA Y CAPTURAR
// ==========================================
document.getElementById('btnMenuDelete')?.addEventListener('click', () => {
    if (selectedNodeId) nodes.remove(selectedNodeId);
    actionMenu.classList.add('hidden');
    selectedNodeId = null;
});

// ==========================================
// HERRAMIENTAS: ELIMINAR, LIMPIAR GRAFO, LIMPIAR LECTOR Y CAPTURAR
// ==========================================

// 1. Limpiar el Grafo (Botón de la barra superior)
document.getElementById('btnClear')?.addEventListener('click', () => {
    if (nodes.length === 0) return;
    if (confirm("¿Deseas vaciar todo el esquema actual?")) {
        nodes.clear();
        edges.clear();
        currentDocumentText = ""; 
        actionMenu.classList.add('hidden');
        if (typeof connectionBanner !== 'undefined' && connectionBanner) {
            connectionBanner.classList.add('hidden');
        }
        sourceNodeForConnection = null;
        selectedNodeId = null;
    }
});

// 2. Limpiar SOLO el panel del Lector (Botón nuevo a la par de Generar Esquema)
document.getElementById('btnClearReader')?.addEventListener('click', () => {
    const hasText = readerTextMode && readerTextMode.innerText.trim() !== "";
    const hasContext = docContextInput && docContextInput.value.trim() !== "";

    if (!hasText && !hasContext) return; 

    if (confirm("¿Deseas limpiar el texto y el contexto del panel de lectura?")) {
        currentDocumentText = ""; 
        globalDocumentContext = "";
        if (readerTextMode) readerTextMode.innerText = "";
        if (docContextInput) docContextInput.value = "";
    }
});

document.getElementById('btnCapture')?.addEventListener('click', () => {
    if (nodes.length === 0) {
        alert("El lienzo está vacío.");
        return;
    }
    actionMenu.classList.add('hidden');
    showLoader('Preparando captura...');
    network.fit({ animation: false });

    setTimeout(() => {
        try {
            const canvas = container.querySelector('canvas');
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = canvas.width;
            exportCanvas.height = canvas.height;
            const ctx = exportCanvas.getContext('2d');

            ctx.fillStyle = '#f8fafc'; // Fondo elegante
            ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
            ctx.drawImage(canvas, 0, 0);

            const downloadLink = document.createElement('a');
            downloadLink.download = `Graphikosmos-${new Date().toISOString().slice(0, 10)}.png`;
            downloadLink.href = exportCanvas.toDataURL('image/png');
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        } catch {
            alert("Error al exportar la imagen.");
        } finally {
            hideLoader();
        }
    }, 150);
});

// Aumentar o reducir tamaño del nodo
function resizeNode(increment) {
    if (!selectedNodeId) return;
    const currentNode = nodes.get(selectedNodeId);
    if (currentNode && currentNode.isExpandedDef) {
        const minW = (currentNode.widthConstraint?.minimum || 280) + increment;
        nodes.update({ 
            id: selectedNodeId,
            widthConstraint: { minimum: minW, maximum: minW + 70 }
        });
    }
}

document.getElementById('btnSizePlus')?.addEventListener('click', () => resizeNode(40));
document.getElementById('btnSizeMinus')?.addEventListener('click', () => resizeNode(-40));

// ==========================================
// ACTIVADORES DE SINERGIA Y VINCULACIÓN MANUAL
// ==========================================

// 1. Iniciar Sinergia (Fusión)
document.getElementById('btnMenuSynergy')?.addEventListener('click', () => {
    sourceNodeForSynergy = selectedNodeId;
    actionMenu.style.visibility = 'hidden'; 
    actionMenu.classList.add('hidden');
    
    const banner = document.getElementById('synergyBanner');
    if (banner) banner.classList.remove('hidden');
});

// Cancelar Sinergia tocando el banner
document.getElementById('synergyBanner')?.addEventListener('click', (e) => {
    sourceNodeForSynergy = null;
    e.currentTarget.classList.add('hidden');
});

// 2. Iniciar Vinculación simple
document.getElementById('btnMenuConnect')?.addEventListener('click', () => {
    sourceNodeForConnection = selectedNodeId;
    actionMenu.style.visibility = 'hidden'; 
    actionMenu.classList.add('hidden');
    
    const banner = document.getElementById('connectionBanner');
    if (banner) banner.classList.remove('hidden');
});

// Cancelar Vinculación tocando el banner
document.getElementById('connectionBanner')?.addEventListener('click', (e) => {
    sourceNodeForConnection = null;
    e.currentTarget.classList.add('hidden');
});

// ==========================================
// GESTOR DE PROYECTOS (CARGAR Y CREAR)
// ==========================================
const projectsModal = document.getElementById('projectsModal');

document.getElementById('btnProjects')?.addEventListener('click', () => {
    if (!currentUser) return;
    renderProjectsList();
    projectsModal.classList.remove('hidden');
    projectsModal.classList.add('flex');
});

document.getElementById('closeProjectsModal')?.addEventListener('click', () => {
    projectsModal.classList.add('hidden');
    projectsModal.classList.remove('flex');
});

function renderProjectsList() {
    const listContainer = document.getElementById('projectsList');
    const noProjectsMsg = document.getElementById('noProjectsMsg');
    const catalog = JSON.parse(localStorage.getItem(`gk_projects_${currentUser.id}`) || '[]');

    listContainer.innerHTML = '';
    if (catalog.length === 0) {
        noProjectsMsg.classList.remove('hidden');
    } else {
        noProjectsMsg.classList.add('hidden');
        // Ordenar del más reciente al más antiguo
        catalog.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(proj => {
            const item = document.createElement('div');
            item.className = "flex justify-between items-center bg-white border border-slate-200 p-3 rounded-xl hover:border-indigo-300 transition-colors shadow-sm";
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">📄</div>
                    <div>
                        <h4 class="text-sm font-bold text-slate-800">${proj.title}</h4>
                        <p class="text-[10px] text-slate-400">Última mod: ${new Date(proj.date).toLocaleDateString()}</p>
                    </div>
                </div>
                <button class="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg font-bold transition-colors btn-load-proj" data-id="${proj.id}">
                    Abrir
                </button>
            `;
            listContainer.appendChild(item);
        });

        document.querySelectorAll('.btn-load-proj').forEach(btn => {
            btn.addEventListener('click', (e) => loadProjectFromCloud(e.target.dataset.id));
        });
    }
}

async function loadProjectFromCloud(projectId) {
    if (nodes.length > 0) {
        if (!confirm("Se reemplazará el esquema actual. Asegúrate de haber guardado cambios. ¿Deseas continuar?")) return;
    }

    showLoader('Descargando proyecto desde la nube...');
    try {
        // Tu función Netlify /db debe soportar peticiones GET recibiendo el projectId
        const response = await fetch(`/.netlify/functions/db?projectId=${projectId}`);
        if (!response.ok) throw new Error("No se pudo obtener el proyecto");
        
        const resData = await response.json();
        
        nodes.clear();
        edges.clear();
        if (resData.data?.nodes) nodes.add(resData.data.nodes);
        if (resData.data?.edges) edges.add(resData.data.edges);

        currentProjectId = projectId;
        localStorage.setItem('gk_current_project_id', currentProjectId);
        
        projectsModal.classList.add('hidden');
        projectsModal.classList.remove('flex');
        network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
    } catch (err) {
        alert('Error al cargar el proyecto. Revisa la consola o asegúrate de que el servidor responde a GET.');
        console.error(err);
    } finally {
        hideLoader();
    }
}

document.getElementById('btnNewProject')?.addEventListener('click', () => {
    if (nodes.length > 0) {
        if (!confirm("¿Deseas iniciar un esquema completamente en blanco?")) return;
    }
    nodes.clear();
    edges.clear();
    currentProjectId = null;
    localStorage.removeItem('gk_current_project_id');
    
    projectsModal.classList.add('hidden');
    projectsModal.classList.remove('flex');
});

// ==========================================
// 16. TIENDA Y PAYPAL (CIERRE Y COBRO)
// ==========================================
document.getElementById('closeStore')?.addEventListener('click', () => {
    document.getElementById('storeModal').classList.add('hidden');
    document.getElementById('storeModal').classList.remove('flex');
});

if (window.paypal) {
    paypal.Buttons({
        createOrder: function(data, actions) {
            // Buscamos cuál paquete seleccionó el usuario y leemos su data-price
            const selected = document.querySelector('input[name="nodePackage"]:checked');
            return actions.order.create({
                purchase_units: [{ amount: { value: selected.dataset.price } }]
            });
        },
        onApprove: function(data, actions) {
            return actions.order.capture().then(function(details) {
                // Leemos cuántos nodos añadir según el 'value' del botón seleccionado
                const selected = document.querySelector('input[name="nodePackage"]:checked');
                const addedNodes = parseInt(selected.value, 10);
                
                // Sumar los nodos al saldo actual
                availableNodes += addedNodes;
                
                // Guardar en la cuenta correspondiente
                if (currentUser) {
                    localStorage.setItem(`gk_balance_${currentUser.id}`, availableNodes);
                } else {
                    localStorage.setItem('gk_guest_balance', availableNodes);
                }
                
                updateCounterDisplay();
                alert(`¡Éxito, ${details.payer.name.given_name}! Se han añadido ${addedNodes} nodos a tu cuenta.`);
                
                // Cerrar modal
                document.getElementById('storeModal').classList.add('hidden');
                document.getElementById('storeModal').classList.remove('flex');
            });
        }
    }).render('#paypal-button-container');
}

// ==========================================
// 17. PETICIÓN PERSONALIZADA POR NODO
// ==========================================
const btnMenuCustom = document.getElementById('btnMenuCustom');
const customPromptBox = document.getElementById('customPromptBox');
const customPromptInput = document.getElementById('customPromptInput');
const btnSendCustomPrompt = document.getElementById('btnSendCustomPrompt');

btnMenuCustom?.addEventListener('click', (e) => {
    e.stopPropagation();
    customPromptBox.classList.toggle('hidden');
    customPromptBox.classList.toggle('flex');
    if (!customPromptBox.classList.contains('hidden')) {
        customPromptInput.focus();
    }
});

// Ocultar el cuadro de texto cuando se cierre o abra el menú en otro nodo
network.on('click', () => {
    if (customPromptBox) {
        customPromptBox.classList.add('hidden');
        customPromptBox.classList.remove('flex');
    }
});

btnSendCustomPrompt?.addEventListener('click', async () => {
    const customRequest = customPromptInput.value.trim();
    if (!customRequest || !selectedNodeId) return;

    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    customPromptBox.classList.add('hidden');
    customPromptBox.classList.remove('flex');

    if (!requireAuth("realizar peticiones personalizadas a la IA")) return;
    if (!checkBalance(1)) return;

    const currentNode = nodes.get(selectedNodeId);
    const topicName = currentNode.baseTitle || selectedNodeId;
    const contextPath = getContextPath(selectedNodeId);

    showLoader('Procesando tu solicitud...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'custom_prompt',
                topic: topicName,
                contextPath,
                customRequest,
                documentContext: globalDocumentContext || currentDocumentText
            })
        });

        if (!response.ok) throw new Error("Error en la respuesta");
        const data = await response.json();
        const generatedItems = data.nodes || [];

        if (!checkBalance(generatedItems.length)) return;

        nodes.update(nodes.get().map(n => ({ id: n.id, fixed: { x: true, y: true } })));
        const parentPos = network.getPositions([selectedNodeId])[selectedNodeId];
        network.setOptions({ physics: { enabled: true } });

        let createdCount = 0;
        generatedItems.forEach((item, idx) => {
            const newNodeId = item.id || `${selectedNodeId}_custom_${Date.now()}_${idx}`;
            if (!nodes.get(newNodeId)) {
                const hasLongContent = item.content && item.content.trim().length > 0;
                const nodeLabel = hasLongContent 
                    ? `*${item.title}*\n────────────────────\n${item.content}`
                    : `*${item.title}*`;

                nodes.add({
                    id: newNodeId,
                    label: nodeLabel,
                    baseTitle: item.title,
                    definition: item.content || null,
                    isExpandedDef: hasLongContent,
                    color: getRandomColor(),
                    x: parentPos.x + (Math.random() * 80 - 40),
                    y: parentPos.y + 150,
                    fixed: { x: false, y: false },
                    widthConstraint: hasLongContent ? { minimum: 420, maximum: 500 } : { minimum: 150, maximum: 250 }
                });

                edges.add({
                    from: selectedNodeId,
                    to: newNodeId,
                    label: item.relationship
                });

                trackNodeUsage(item.title);
                createdCount++;
            }
        });

        customPromptInput.value = '';
        consumeNodes(createdCount);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1400);
    } catch (err) {
        console.error(err);
        alert("Intenta de nuevo en unos segundos");
    } finally {
        hideLoader();
    }
});