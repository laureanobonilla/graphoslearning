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
        color: {
            border: '#cbd5e1', // Gris suave
            background: '#f8fafc', // Tono marfil/gris muy limpio y elegante
            highlight: { border: '#94a3b8', background: '#f1f5f9' },
            hover: { border: '#94a3b8', background: '#f1f5f9' }
        },
        shadow: { enabled: true, color: 'rgba(0, 0, 0, 0.08)', size: 8, x: 2, y: 2 },
        shapeProperties: { 
            borderRadius: 12,
            borderDashes: false
        }
    },
    edges: { 
        arrows: { to: { enabled: true, scaleFactor: 0.8 } },
        color: { color: '#94a3b8', highlight: '#64748b', hover: '#cbd5e1' },
        font: { 
            size: 14, 
            face: 'Inter, sans-serif',
            color: '#475569', 
            strokeWidth: 3, 
            strokeColor: '#fbfcfd',
            align: 'middle'
        },
        width: 1.5,
        dashes: [4, 4],
        smooth: { type: 'curvedCW', roundness: 0.2 }
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
    const reasonEl = document.getElementById('authWallReason');
    if(reasonEl) reasonEl.innerText = actionDescription;
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
        nodes.add({ id: root.id, label: `*${root.label}*`, baseTitle: root.label, definition: root.definition || null, x: rootX, y: rootY, fixed: { x: false, y: false } });
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
            nodes.add({ id: branch.id, label: `*${branch.label}*`, baseTitle: branch.label, x: bx, y: branchY, fixed: { x: false, y: false } });
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
    nodes.add({ id: topic, label: `*${topic}*`, baseTitle: topic, x: spawnX, y: spawnY, fixed: { x: false, y: false } });
    trackNodeUsage(topic); consumeNodes(1); topicInput.value = '';
    setTimeout(() => { network.focus(topic, { scale: 1.0, animation: { duration: 600 }}); }, 50);
}

function handleTopicInput() {
    const topic = topicInput.value.trim();
    if (!topic) return;
    if (nodes.length === 0) generateFullSchemaFromTopic(topic); else insertSingleNode(topic);
}

document.getElementById('btnGenerate')?.addEventListener('click', handleTopicInput);
document.getElementById('topicInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleTopicInput(); });


// ==========================================
// 7. EXPANDIR RAMAS MANUALMENTE (CON LÓGICA AUTO CORRECTA)
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
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    if (!requireAuth("profundizar en conceptos relacionados")) return; 

    // Magia AUTO: Enviamos el prompt dinámico en vez de parseInt('auto')
    const nodeCountVal = document.getElementById('nodeCount').value;
    const maxNodes = nodeCountVal === 'auto' ? 'entre 3 y 6 (según lo que consideres relevante)' : parseInt(nodeCountVal, 10);
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
                nodes.add({ id: concept.id, label: `*${concept.label}*`, baseTitle: concept.label, expanded: false, x: parentPos.x, y: parentPos.y, fixed: { x: false, y: false } });
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
// 8. GENERAR EJEMPLOS MANUALMENTE (CON LÓGICA AUTO CORRECTA)
// ==========================================
document.getElementById('btnMenuExamples')?.addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const nodeCountVal = document.getElementById('nodeCount').value;
    const maxNodes = nodeCountVal === 'auto' ? 'varios (entre 3 y 5 ejemplos representativos)' : parseInt(nodeCountVal, 10);
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
// 13. EVENTOS DEL CANVAS (MENÚ FLOTANTE Y SINERGIA)
// ==========================================
network.on('click', async function (params) {
    if (params.nodes.length > 0) {
        const clickedNode = params.nodes[0];
        
        // MOSTRAR MENÚ FLOTANTE
        selectedNodeId = clickedNode;
        const nodePosition = network.getPositions([selectedNodeId])[selectedNodeId];
        const DOMCoords = network.canvasToDOM(nodePosition);
        const containerRect = container.getBoundingClientRect();
        
        actionMenu.style.left = (containerRect.left + DOMCoords.x - 40) + 'px';
        actionMenu.style.top = (containerRect.top + DOMCoords.y - 60) + 'px';
        actionMenu.classList.remove('hidden');
    } else {
        actionMenu.classList.add('hidden');
        selectedNodeId = null;
    }
});
network.on('zoom', () => actionMenu.classList.add('hidden'));
network.on('dragStart', (params) => {
    actionMenu.classList.add('hidden');
    if (params.nodes.length > 0) nodes.update({ id: params.nodes[0], fixed: { x: false, y: false } });
});

// ==========================================
// MODO LECTOR ACTIVO - TEXTO LIBRE, CONTEXTO Y IA
// ==========================================
const btnToggleReader = document.getElementById('btnToggleReader');
const readerPanel = document.getElementById('readerPanel');
const readerTextMode = document.getElementById('readerTextMode');
const selectionTooltip = document.getElementById('selectionTooltip');
const docContextInput = document.getElementById('docContextInput');

const nodeDetailPanel = document.getElementById('nodeDetailPanel');
const detailNodeTitle = document.getElementById('detailNodeTitle');
const nodeDetailContent = document.getElementById('nodeDetailContent');
const closeDetailPanel = document.getElementById('closeDetailPanel'); 

let globalDocumentContext = "";
let activeSelectedText = "";
let activeSelectionRange = null;
let activeNodeDetailId = null;

docContextInput?.addEventListener('input', (e) => { globalDocumentContext = e.target.value.trim(); });

btnToggleReader?.addEventListener('click', () => {
    readerPanel.classList.toggle('hidden');
    setTimeout(() => { if (typeof network !== 'undefined') network.redraw(); }, 200);
});

// IA REDACTAR TEXTO LARGO (Usando directamente el Contexto)
document.getElementById('btnAiGenerateText')?.addEventListener('click', async () => {
    const topicIdea = docContextInput.value.trim();
    if (!topicIdea) {
        alert("Por favor, escribe primero un tema o idea central en el campo de 'Contexto' superior.");
        docContextInput.focus();
        return;
    }
    showLoader('Redactando texto exhaustivo (esto puede tomar unos segundos)...');
    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'define', 
                topic: `Redacta un texto académico, sumamente detallado, profundo y extenso de al menos 5 a 8 párrafos completos sobre: ${topicIdea}. Explora antecedentes, conceptos clave, implicaciones y conclusiones para un análisis exhaustivo. No te limites, sé enciclopédico.`, 
                contextPath: topicIdea,
                documentContext: "" 
            })
        });
        const data = await response.json();
        if (data.definition) {
            readerTextMode.innerText = data.definition;
            currentDocumentText = data.definition;
        }
    } catch (err) { alert("No se pudo generar el texto masivo."); } finally { hideLoader(); }
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

// ÚNICO BOTÓN AL SUBRAYAR
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
            id: nodeId, label: `*${topic}*`, baseTitle: topic,
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
// 1. Ver en Panel Lateral
document.getElementById('btnMenuOpenPanel')?.addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
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

// 2. Expandir (Caja cuadrada en el grafo)
document.getElementById('btnMenuExpandDef')?.addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
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
        widthConstraint: { minimum: 280, maximum: 350 } // Ancho masivo forzado = Adiós columna vertical
    });
});

// 3. Contraer Local
document.getElementById('btnMenuCollapseDef')?.addEventListener('click', () => {
    actionMenu.classList.add('hidden');
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
        nodes.add({ id: root.id, label: `*${root.label}*`, baseTitle: root.label, x: rootX, y: rootY }); trackNodeUsage(root.label);

        const branches = data.branches || []; const branchSpacing = 280; const startBranchX = rootX - ((branches.length - 1) * branchSpacing / 2);
        const branchPositions = {};
        branches.forEach((branch, index) => {
            const bx = startBranchX + (index * branchSpacing); branchPositions[branch.id] = { x: bx, y: rootY + 160, exampleCount: 0 };
            nodes.add({ id: branch.id, label: `*${branch.label}*`, baseTitle: branch.label, x: bx, y: rootY + 160 });
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

const welcomeScreen = document.getElementById('welcomeScreen');
let hasDismissedWelcomeScreen = false;
function dismissWelcomeScreen() {
    if (hasDismissedWelcomeScreen) return;
    welcomeScreen.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => { welcomeScreen.classList.add('hidden'); hasDismissedWelcomeScreen = true; }, 500);
}
welcomeScreen?.addEventListener('click', (e) => { if (e.target === welcomeScreen) dismissWelcomeScreen(); });
topicInput?.addEventListener('focus', dismissWelcomeScreen);
document.getElementById('btnWelcomeReader')?.addEventListener('click', () => { dismissWelcomeScreen(); readerPanel.classList.remove('hidden'); });
nodes.on('*', () => { if (nodes.length > 0 && !hasDismissedWelcomeScreen) dismissWelcomeScreen(); });