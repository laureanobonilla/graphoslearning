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
    if (isAdmin) return;
    const userIdentifier = currentUser ? currentUser.id : sessionId;
    const userName = currentUser ? (currentUser.user_metadata?.full_name || currentUser.email) : "Invitado";
    const projectData = { owner: userName, email: currentUser?.email || null, nodes: nodes.get(), edges: edges.get() };
    let projectTitle = nodes.get().length > 0 ? (nodes.get()[0].baseTitle || "Mi Esquema") : "Mapa Conceptual";

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
        }
    } catch (err) {}
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
        if (isNaN(storedBalance)) { storedBalance = 50; localStorage.setItem(`gk_balance_${currentUser.id}`, storedBalance); }
        availableNodes = storedBalance;
    } else {
        let guestBalance = parseInt(localStorage.getItem('gk_guest_balance'), 10);
        if (isNaN(guestBalance)) { guestBalance = 15; localStorage.setItem('gk_guest_balance', guestBalance); }
        availableNodes = guestBalance;
    }
    updateCounterDisplay();
}

function updateAuthUI() {
    const loginText = document.getElementById('loginText');
    const userStatusDot = document.getElementById('userStatusDot');
    if (!loginText || !userStatusDot) return;
    if (currentUser) {
        loginText.innerText = currentUser.user_metadata?.full_name?.split(' ')[0] || "Mi Cuenta";
        userStatusDot.className = 'w-2 h-2 rounded-full bg-indigo-500';
    } else {
        loginText.innerText = "Iniciar Sesión";
        userStatusDot.className = 'w-2 h-2 rounded-full bg-slate-300';
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
// 6. GENERACIÓN DESDE BARRA SUPERIOR O INPUT
// ==========================================
async function generateFullSchemaFromTopic(topicText) {
    if (!topicText) return;
    if (!checkBalance(10)) return;
    showLoader(`Estructurando esquema...`);
    topicInput.value = '';

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'parse_text', text: topicText, density: 'auto' })
        });
        const data = await response.json();
        const totalNodes = 1 + (data.branches?.length || 0) + (data.examples?.length || 0);
        if (!checkBalance(totalNodes)) return;

        if (nodes.length > 0) { nodes.clear(); edges.clear(); }
        const viewCenter = network.getViewPosition();
        const rootX = viewCenter.x; const rootY = viewCenter.y - 120;

        const root = data.root;
        nodes.add({ id: root.id, label: `*${root.label}*`, baseTitle: root.label, color: getRandomColor(), definition: root.definition || null, x: rootX, y: rootY, fixed: { x: false, y: false } });
        trackNodeUsage(root.label);

        const branches = data.branches || [];
        const branchSpacing = 280;
        const totalBranchWidth = (branches.length - 1) * branchSpacing;
        const startBranchX = rootX - (totalBranchWidth / 2);
        const branchY = rootY + 160;
        const branchPositions = {};

        branches.forEach((branch, index) => {
            const bx = startBranchX + (index * branchSpacing);
            branchPositions[branch.id] = { x: bx, y: branchY, exampleCount: 0 };
            nodes.add({ id: branch.id, label: `*${branch.label}*`, baseTitle: branch.label, color: getRandomColor(), x: bx, y: branchY, fixed: { x: false, y: false } });
            edges.add({ from: root.id, to: branch.id, label: branch.relationship });
            trackNodeUsage(branch.label);
        });

        const examples = data.examples || [];
        examples.forEach(ex => {
            const parentPos = branchPositions[ex.targetId] || { x: rootX, y: branchY, exampleCount: 0 };
            parentPos.exampleCount++;
            nodes.add({
                id: ex.id, label: `*Ejemplo:*\n${ex.label}`, baseTitle: ex.label, x: parentPos.x, y: parentPos.y + (parentPos.exampleCount * 110), fixed: { x: false, y: false },
                color: { background: '#ffffff', border: '#e2e8f0' }, shapeProperties: { borderRadius: 8, borderDashes: [4, 4] }
            });
            const target = nodes.get(ex.targetId) ? ex.targetId : root.id;
            edges.add({ from: target, to: ex.id, label: ex.relationship, color: { color: '#cbd5e1' }, dashes: true });
            trackNodeUsage(ex.label);
        });

        consumeNodes(totalNodes);
        network.setOptions({ physics: { enabled: false } });
        network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
    } catch (err) { alert('Hubo un error al generar el esquema.'); } finally { hideLoader(); }
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
    insertSingleNode(topic); 
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
// 13. EVENTOS DEL CANVAS (MENÚ DINÁMICO)
// ==========================================
network.on('click', async function (params) {
    if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0];
        
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

        // --- LÓGICA CORREGIDA DE VISIBILIDAD DE BOTONES ---
        // Extraemos el nodo real de la base de datos usando su ID
        const actualNode = nodes.get(selectedNodeId);
        const isExpanded = actualNode && actualNode.isExpandedDef === true;
        
        const btnExpand = document.getElementById('btnMenuExpandDef');
        const btnCollapse = document.getElementById('btnMenuCollapseDef');
        const btnOpenPanel = document.getElementById('btnMenuOpenPanel');
        
        if (isExpanded) {
            // Si el nodo SÍ está expandido, ocultamos "Expandir" y mostramos los otros dos
            if (btnExpand) { btnExpand.classList.add('hidden'); btnExpand.classList.remove('flex'); }
            if (btnCollapse) { btnCollapse.classList.remove('hidden'); btnCollapse.classList.add('flex'); }
            if (btnOpenPanel) { btnOpenPanel.classList.remove('hidden'); btnOpenPanel.classList.add('flex'); }
        } else {
            // Si el nodo NO está expandido, mostramos "Expandir" y ocultamos los otros dos
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
    if (!textContent || textContent.length < 15) return alert("El lector está vacío.");
    currentDocumentText = textContent;
    if (!checkBalance(6)) return;
    showLoader(`Generando árbol estructurado desde el lector...`);
    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST', body: JSON.stringify({ action: 'parse_text', text: textContent, density: document.getElementById('nodeCount').value || 'auto' })
        });
        const data = await response.json();
        const totalNodes = 1 + (data.branches?.length || 0) + (data.examples?.length || 0);
        if (!checkBalance(totalNodes)) return;
        if (nodes.length > 0) { nodes.clear(); edges.clear(); }
        
        const root = data.root; const rootX = network.getViewPosition().x; const rootY = network.getViewPosition().y - 120;
        nodes.add({ id: root.id, label: `*${root.label}*`, baseTitle: root.label, color: getRandomColor(), x: rootX, y: rootY }); trackNodeUsage(root.label);

        const branches = data.branches || []; const branchSpacing = 280; const startBranchX = rootX - ((branches.length - 1) * branchSpacing / 2);
        const branchPositions = {};
        branches.forEach((branch, index) => {
            const bx = startBranchX + (index * branchSpacing); branchPositions[branch.id] = { x: bx, y: rootY + 160, exampleCount: 0 };
            nodes.add({ id: branch.id, label: `*${branch.label}*`, baseTitle: branch.label, color: getRandomColor(), x: bx, y: rootY + 160 });
            edges.add({ from: root.id, to: branch.id, label: branch.relationship }); trackNodeUsage(branch.label);
        });

        (data.examples || []).forEach(ex => {
            const p = branchPositions[ex.targetId] || { x: rootX, y: rootY + 160, exampleCount: 0 }; p.exampleCount++;
            nodes.add({ id: ex.id, label: `*Ejemplo:*\n${ex.label}`, baseTitle: ex.label, x: p.x, y: p.y + (p.exampleCount * 110), color: { background: '#ffffff', border: '#e2e8f0' }, shapeProperties: { borderRadius: 8, borderDashes: [4, 4] } });
            edges.add({ from: ex.targetId || root.id, to: ex.id, label: ex.relationship, color: { color: '#cbd5e1' }, dashes: true }); trackNodeUsage(ex.label);
        });
        consumeNodes(totalNodes);
        network.setOptions({ physics: { enabled: false } }); network.fit({ animation: { duration: 600 } });
    } catch (err) { alert('No se pudo procesar.'); } finally { hideLoader(); }
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