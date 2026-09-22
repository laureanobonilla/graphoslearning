// ==========================================
// 1. INICIALIZACIÓN DEL GRAFO (VIS.JS)
// ==========================================
const container = document.getElementById('network-container');
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);
let currentDocumentText = "";
let selectedDensity = 'auto'; // Ahora "auto" es el por defecto

let network = new vis.Network(container, { nodes, edges }, {
    layout: { hierarchical: false },
    physics: {
        enabled: false,
        solver: 'repulsion',
        repulsion: { nodeDistance: 240, springLength: 220, springConstant: 0.04 }
    },
    nodes: { 
        shape: 'box', 
        margin: { top: 14, bottom: 14, left: 18, right: 18 },
        font: { 
            multi: 'md', 
            size: 14, 
            face: 'Plus Jakarta Sans, Inter, -apple-system, sans-serif', 
            color: '#0f172a',
            bold: { color: '#090d16', size: 15, face: 'Plus Jakarta Sans' } 
        },
        borderWidth: 1,
        color: {
            border: '#e2e8f0',
            background: '#ffffff',
            highlight: { border: '#0f172a', background: '#f8fafc' },
            hover: { border: '#94a3b8', background: '#ffffff' }
        },
        shadow: { enabled: true, color: 'rgba(15, 23, 42, 0.04)', size: 16, x: 0, y: 8 },
        shapeProperties: { borderRadius: 10 }
    },
    edges: { 
        arrows: { to: { enabled: true, scaleFactor: 0.6 } },
        color: { color: '#cbd5e1', highlight: '#475569', hover: '#94a3b8' },
        font: { 
            size: 11, 
            face: 'Inter, sans-serif',
            color: '#64748b', 
            strokeWidth: 4, 
            strokeColor: '#fbfcfd',
            align: 'middle'
        },
        smooth: { type: 'continuous', roundness: 0.5 }
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



let selectedNodeId = null;
let sourceNodeForConnection = null;

const DEFAULT_MAX_WIDTH = 250;
const DEFAULT_MAX_HEIGHT = 90;

// ==========================================
// 2. REFERENCIAS UI Y NOTIFICADOR
// ==========================================
const topicInput = document.getElementById('topicInput');
const actionMenu = document.getElementById('actionMenu');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
const connectionBanner = document.getElementById('connectionBanner');
const storeModal = document.getElementById('storeModal');
const helpModal = document.getElementById('helpModal');
const textSchemaModal = document.getElementById('textSchemaModal');
const rawTextInput = document.getElementById('rawTextInput');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');


let selectedNodeId = null;
let sourceNodeForConnection = null;

const DEFAULT_MAX_WIDTH = 250;
const DEFAULT_MAX_HEIGHT = 90;

// Nuevo Loader de Pantalla Completa
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

// Control del modo Inmersivo (Landscape) en móviles
landscapeToggle?.addEventListener('click', () => {
    mainHeader.classList.toggle('force-show');
    // Cambia el ícono del botón dependiendo del estado
    if (mainHeader.classList.contains('force-show')) {
        landscapeToggle.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>';
    } else {
        landscapeToggle.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>';
    }
});

// ==========================================
// 3. TELEMETRÍA (PRIMEROS 50 NODOS)
// ==========================================
let sessionId = localStorage.getItem('gk_session_id');
if (!sessionId) {
    sessionId = 's_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('gk_session_id', sessionId);
}

let nodesTracked = parseInt(localStorage.getItem('gk_nodes_tracked') || '0', 10);

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
// 4. SALDO, LICENCIAS Y ADMIN
// ==========================================
let isAdmin = localStorage.getItem('gk_is_admin') === 'true';
let availableNodes = parseInt(localStorage.getItem('gk_balance'), 10);

if (isNaN(availableNodes)) {
    availableNodes = 50;
    localStorage.setItem('gk_trial_started', 'true');
    localStorage.setItem('gk_balance', availableNodes);
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
    if (availableNodes <= 0) {
        dot.className = 'w-2 h-2 rounded-full bg-red-500';
    } else if (availableNodes < 10) {
        dot.className = 'w-2 h-2 rounded-full bg-amber-500';
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
    }
}
updateCounterDisplay();

function openStore() {
    storeModal.classList.remove('hidden');
    storeModal.classList.add('flex');
}

function closeStoreModal() {
    storeModal.classList.add('hidden');
    storeModal.classList.remove('flex');
}

function consumeNodes(amount) {
    if (isAdmin) return;
    availableNodes -= amount;
    if (availableNodes < 0) availableNodes = 0;
    localStorage.setItem('gk_balance', availableNodes);
    updateCounterDisplay();
}

function checkBalance(cost) {
    if (isAdmin) return true;
    if (availableNodes < cost) {
        if (actionMenu) actionMenu.classList.add('hidden');
        openStore();
        return false;
    }
    return true;
}

document.getElementById('nodeCounterBtn')?.addEventListener('click', openStore);
document.getElementById('closeStore')?.addEventListener('click', closeStoreModal);

// Acceso de Administrador
document.getElementById('btnAdminAccess')?.addEventListener('click', async () => {
    const inputPass = prompt("Ingresa la clave de administración:");
    if (!inputPass) return;

    showLoader('Verificando acceso...');
    try {
        const res = await fetch('/.netlify/functions/admin-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: inputPass })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            isAdmin = true;
            localStorage.setItem('gk_is_admin', 'true');
            updateCounterDisplay();
            alert("Acceso administrador concedido. Nodos ilimitados.");
        } else {
            alert("Contraseña incorrecta.");
        }
    } catch {
        alert("Error de autenticación.");
    } finally {
        hideLoader();
    }
});

// ==========================================
// 5. PAYPAL Y PAQUETES
// ==========================================
let selectedPrice = "15.00";
let selectedNodeAmount = 1000;

document.querySelectorAll('.package-card').forEach(card => {
    card.addEventListener('click', (e) => {
        document.querySelectorAll('.package-card').forEach(c => {
            c.classList.remove('border-2', 'border-slate-900', 'bg-slate-900', 'text-white');
            c.classList.add('border', 'border-slate-200', 'bg-slate-50/40', 'text-slate-900');
        });
        const target = e.currentTarget;
        target.classList.remove('border', 'border-slate-200', 'bg-slate-50/40');
        target.classList.add('border-2', 'border-slate-900', 'bg-slate-900', 'text-white');
        
        selectedPrice = target.dataset.price;
        selectedNodeAmount = parseInt(target.dataset.nodes, 10);
    });
});

if (window.paypal) {
    paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
        createOrder: function(data, actions) {
            return actions.order.create({
                purchase_units: [{
                    description: `Graphikosmos - ${selectedNodeAmount} Nodos`,
                    amount: { currency_code: 'USD', value: selectedPrice }
                }]
            });
        },
        onApprove: function(data, actions) {
            return actions.order.capture().then(async function(details) {
                const licenseKey = 'GK-' + Math.random().toString(36).substring(2, 10).toUpperCase();

                showLoader('Registrando licencia...');
                try {
                    await fetch('/.netlify/functions/license', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'create',
                            licenseKey: licenseKey,
                            nodesToAdd: selectedNodeAmount
                        })
                    });
                } catch (e) {
                    console.error('Error registrando en la nube:', e);
                } finally {
                    hideLoader();
                }

                availableNodes += selectedNodeAmount;
                localStorage.setItem('gk_license', licenseKey);
                localStorage.setItem('gk_balance', availableNodes);
                updateCounterDisplay();
                closeStoreModal();

                alert(`¡Pago completado! Se agregaron ${selectedNodeAmount} nodos.\nTu clave es: ${licenseKey}`);
            });
        },
        onError: function(err) {
            console.error('Error PayPal:', err);
            alert('No se pudo procesar la transacción.');
        }
    }).render('#paypal-button-container');
}

document.getElementById('btnVerifyLicense')?.addEventListener('click', async () => {
    const key = document.getElementById('licenseInput').value.trim().toUpperCase();
    if (!key) return;

    showLoader('Verificando licencia en la nube...');
    try {
        const res = await fetch('/.netlify/functions/license', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verify', licenseKey: key })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            availableNodes = data.balance;
            localStorage.setItem('gk_license', data.licenseKey);
            localStorage.setItem('gk_balance', availableNodes);
            updateCounterDisplay();
            closeStoreModal();
            alert(`¡Licencia sincronizada! Saldo restaurado: ${availableNodes} nodos.`);
        } else {
            alert('La clave ingresada no es válida o no existe.');
        }
    } catch {
        alert('Error al conectar con el servidor.');
    } finally {
        hideLoader();
    }
});

// ==========================================
// 6. GENERACIÓN COMPLETA DESDE INPUT O SORPRESA
// ==========================================
async function generateFullSchemaFromTopic(topicText) {
    if (!topicText) return;

    // Validación de cobro preventiva (estimada: máximo 10 nodos)
    if (!checkBalance(10)) return;

    showLoader(`Estructurando esquema...`);
    topicInput.value = '';

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'parse_text', 
                text: topicText,
                density: selectedDensity 
            })
        });
        const data = await response.json();

        const totalNodes = 1 + (data.branches?.length || 0) + (data.examples?.length || 0);
        if (!checkBalance(totalNodes)) return;

        // Limpiar el lienzo actual si lo hubiera para centrar la nueva idea principal
        if (nodes.length > 0) {
            nodes.clear();
            edges.clear();
        }

        const viewCenter = network.getViewPosition();
        const rootX = viewCenter.x;
        const rootY = viewCenter.y - 120;

        // 1. Nodo Raíz
        const root = data.root;
        nodes.add({
            id: root.id,
            label: `*${root.label}*`,
            baseTitle: root.label,
            definition: root.definition || null,
            x: rootX,
            y: rootY,
            fixed: { x: false, y: false }
        });
        trackNodeUsage(root.label);

        // 2. Ramas en fila horizontal
        const branches = data.branches || [];
        const branchSpacing = 280;
        const totalBranchWidth = (branches.length - 1) * branchSpacing;
        const startBranchX = rootX - (totalBranchWidth / 2);
        const branchY = rootY + 160;

        const branchPositions = {};

        branches.forEach((branch, index) => {
            const bx = startBranchX + (index * branchSpacing);
            const by = branchY;
            branchPositions[branch.id] = { x: bx, y: by, exampleCount: 0 };

            nodes.add({
                id: branch.id,
                label: `*${branch.label}*`,
                baseTitle: branch.label,
                definition: branch.definition || null,
                x: bx,
                y: by,
                fixed: { x: false, y: false }
            });
            edges.add({ from: root.id, to: branch.id, label: branch.relationship });
            trackNodeUsage(branch.label);
        });

        // 3. Ejemplos colgando de ramas
        const examples = data.examples || [];
        examples.forEach(ex => {
            const parentPos = branchPositions[ex.targetId] || { x: rootX, y: branchY, exampleCount: 0 };
            parentPos.exampleCount++;
            
            const exX = parentPos.x;
            const exY = parentPos.y + (parentPos.exampleCount * 110);

            nodes.add({
                id: ex.id,
                label: `*Ejemplo:*\n${ex.label}`,
                baseTitle: ex.label,
                definition: ex.definition || null,
                x: exX,
                y: exY,
                fixed: { x: false, y: false },
                color: {
                    background: '#fafaf9', border: '#d6d3d1',
                    highlight: { background: '#f5f5f4', border: '#78716c' },
                    hover: { background: '#ffffff', border: '#a8a29e' }
                },
                font: { color: '#44403c', bold: { color: '#292524', size: 14 } },
                shapeProperties: { borderRadius: 10, borderDashes: [4, 4] }
            });

            const target = nodes.get(ex.targetId) ? ex.targetId : root.id;
            edges.add({
                from: target, to: ex.id, label: ex.relationship,
                color: { color: '#cbd5e1', highlight: '#78716c' }, dashes: true
            });
            trackNodeUsage(ex.label);
        });

        consumeNodes(totalNodes);
        currentDocumentText = ""; // Es un tema libre, no hay documento base
        
        network.setOptions({ physics: { enabled: false } });
        network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });

    } catch (err) {
        console.error(err);
        alert('Hubo un error al generar el esquema.');
    } finally {
        hideLoader();
    }
}

// Evento del botón Generar de la barra
document.getElementById('btnGenerate')?.addEventListener('click', () => {
    generateFullSchemaFromTopic(topicInput.value.trim());
});

// Soporte para tecla Enter en el input
document.getElementById('topicInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') generateFullSchemaFromTopic(topicInput.value.trim());
});

// ==========================================
// 14. PANTALLA DE BIENVENIDA Y SORPRÉNDEME
// ==========================================
const welcomeScreen = document.getElementById('welcomeScreen');

const hookTopics = [
    "La Paradoja de Fermi", "El Mito de la Caverna", "Computación Cuántica",
    "Filosofía Estoica", "Neuroplasticidad", "Inteligencia Artificial General",
    "Economía Conductual", "La Teoría de Cuerdas", "Imperio Romano"
];

// Variable para controlar que la ventana de bienvenida solo salga al inicio
let hasDismissedWelcomeScreen = false;

function dismissWelcomeScreen() {
    if (hasDismissedWelcomeScreen) return; // Si ya se fue, no vuelve a ejecutar
    
    welcomeScreen.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => {
        welcomeScreen.classList.add('hidden');
        hasDismissedWelcomeScreen = true; // Marcamos como cerrada por el resto de la sesión
    }, 500);
}

// Escuchamos si el usuario escribe o interactúa para quitarla preventivamente
topicInput.addEventListener('focus', dismissWelcomeScreen);

// Escuchamos cambios en el grafo para quitarla en cuanto se genera el primer nodo
nodes.on('*', () => {
    if (nodes.length > 0 && !hasDismissedWelcomeScreen) {
        dismissWelcomeScreen();
    }
});

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

document.getElementById('btnSurprise')?.addEventListener('click', () => {
    const randomTopic = hookTopics[Math.floor(Math.random() * hookTopics.length)];
    // Forzamos densidad Media o Alta para los "sorprendeme" para que se vea impresionante
    selectedDensity = Math.random() > 0.5 ? 'high' : 'medium'; 
    generateFullSchemaFromTopic(randomTopic);
});

document.getElementById('btnWelcomeDoc')?.addEventListener('click', () => {
    document.getElementById('btnOpenTextModal').click();
});

nodes.on('*', toggleWelcomeScreen);

// ==========================================
// 7. EXPANDIR RAMAS MANUALMENTE
// ==========================================
function getContextPath(nodeId) {
    let path = [nodeId];
    let current = nodeId;
    for (let i = 0; i < 5; i++) {
        let parentEdges = edges.get({ filter: e => e.to === current });
        if (parentEdges.length === 0) break;
        current = parentEdges[0].from;
        path.unshift(current);
    }
    return path.join(' > ');
}

document.getElementById('btnMenuExpand').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const maxNodes = parseInt(document.getElementById('nodeCount').value, 10) || 3;
    if (!checkBalance(maxNodes)) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);

    if (currentNode && currentNode.expanded) return;
    showLoader('Generando conceptos conexos...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'expand', 
                topic: selectedNodeId, 
                contextPath, 
                maxNodes,
                documentContext: currentDocumentText // <-- Contexto del documento
            })
        });
        const data = await response.json();

        const existingNodes = nodes.get();
        nodes.update(existingNodes.map(n => ({ id: n.id, fixed: { x: true, y: true } })));

        const parentPos = network.getPositions([selectedNodeId])[selectedNodeId];
        network.setOptions({ physics: { enabled: true } });

        let createdCount = 0;
        data.concepts.forEach(concept => {
            if (!nodes.get(concept.id)) {
                nodes.add({ 
                    id: concept.id, 
                    label: `*${concept.label}*`, 
                    baseTitle: concept.label,
                    expanded: false,
                    boxWidth: DEFAULT_MAX_WIDTH,
                    boxHeight: DEFAULT_MAX_HEIGHT,
                    x: parentPos.x, 
                    y: parentPos.y,
                    fixed: { x: false, y: false }
                });
                edges.add({ from: selectedNodeId, to: concept.id, label: concept.relationship });
                trackNodeUsage(concept.label);
                createdCount++;
            }
        });

        nodes.update({ id: selectedNodeId, expanded: true });
        consumeNodes(createdCount);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1200);
    } catch {
        alert("Error al conectar con el servicio.");
    } finally {
        hideLoader();
    }
});

// ==========================================
// 8. GENERAR EJEMPLOS MANUALMENTE
// ==========================================
document.getElementById('btnMenuExamples').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const maxNodes = parseInt(document.getElementById('nodeCount').value, 10) || 3;
    if (!checkBalance(maxNodes)) return;

    const contextPath = getContextPath(selectedNodeId);
    showLoader('Buscando casos prácticos...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'examples', 
                topic: selectedNodeId, 
                contextPath, 
                maxNodes,
                documentContext: currentDocumentText // <-- Contexto del documento
            })
        });
        const data = await response.json();

        const existingNodes = nodes.get();
        nodes.update(existingNodes.map(n => ({ id: n.id, fixed: { x: true, y: true } })));

        const parentPos = network.getPositions([selectedNodeId])[selectedNodeId];
        network.setOptions({ physics: { enabled: true } });

        let createdCount = 0;
        data.examples.forEach(example => {
            if (!nodes.get(example.id)) {
                nodes.add({ 
                    id: example.id, 
                    label: `*Ejemplo:*\n${example.label}`, 
                    baseTitle: example.label,
                    expanded: false,
                    boxWidth: DEFAULT_MAX_WIDTH,
                    boxHeight: DEFAULT_MAX_HEIGHT,
                    x: parentPos.x, 
                    y: parentPos.y,
                    fixed: { x: false, y: false },
                    color: {
                        background: '#fafaf9',
                        border: '#d6d3d1',
                        highlight: { background: '#f5f5f4', border: '#78716c' },
                        hover: { background: '#ffffff', border: '#a8a29e' }
                    },
                    font: { color: '#44403c', bold: { color: '#292524', size: 14 } },
                    shapeProperties: { borderRadius: 10, borderDashes: [4, 4] }
                });
                
                edges.add({ 
                    from: selectedNodeId, 
                    to: example.id, 
                    label: example.relationship,
                    color: { color: '#cbd5e1', highlight: '#78716c' },
                    dashes: true
                });
                trackNodeUsage(example.label);
                createdCount++;
            }
        });

        consumeNodes(createdCount);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1200);
    } catch {
        alert("Error al conectar con el servicio.");
    } finally {
        hideLoader();
    }
});

// ==========================================
// 9. DEFINICIÓN, CONECTAR, ELIMINAR Y TAMAÑO
// ==========================================
document.getElementById('btnMenuDefine').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const currentNode = nodes.get(selectedNodeId);
    const title = currentNode.baseTitle || selectedNodeId;

    // Si ya tiene definición precargada del documento, mostrarla de inmediato
    if (currentNode && currentNode.definition) {
        if (!currentNode.label.includes('──────────')) {
            const newLabel = `*${title}*\n────────────────────\n${currentNode.definition}`;
            nodes.update({ 
                id: selectedNodeId, 
                label: newLabel,
                shape: 'box',
                fixed: { x: false, y: false },
                widthConstraint: { maximum: currentNode.boxWidth || DEFAULT_MAX_WIDTH },
                heightConstraint: { maximum: currentNode.boxHeight || DEFAULT_MAX_HEIGHT, valign: 'top' }
            });
        }
        return;
    }

    const contextPath = getContextPath(selectedNodeId);
    showLoader('Redactando definición...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'define', 
                topic: selectedNodeId, 
                contextPath,
                documentContext: currentDocumentText // <-- Contexto del documento
            })
        });
        const data = await response.json();

        const newLabel = `*${title}*\n────────────────────\n${data.definition}`;

        nodes.update({ 
            id: selectedNodeId, 
            baseTitle: title,
            definition: data.definition, 
            label: newLabel,
            shape: 'box',
            fixed: { x: false, y: false },
            widthConstraint: { maximum: currentNode.boxWidth || DEFAULT_MAX_WIDTH },
            heightConstraint: { maximum: currentNode.boxHeight || DEFAULT_MAX_HEIGHT, valign: 'top' }
        });
    } catch {
        alert("Error al obtener la definición.");
    } finally {
        hideLoader();
    }
});

document.getElementById('btnMenuConnect').addEventListener('click', () => {
    sourceNodeForConnection = selectedNodeId;
    actionMenu.classList.add('hidden');
    connectionBanner.classList.remove('hidden');
});

connectionBanner.addEventListener('click', () => {
    sourceNodeForConnection = null;
    connectionBanner.classList.add('hidden');
});

document.getElementById('btnMenuDelete').addEventListener('click', () => {
    if (selectedNodeId) nodes.remove(selectedNodeId);
    actionMenu.classList.add('hidden');
    selectedNodeId = null;
});

function resizeNode(increment) {
    if (!selectedNodeId) return;
    const currentNode = nodes.get(selectedNodeId);
    
    const newWidth = (currentNode.boxWidth || DEFAULT_MAX_WIDTH) + increment;
    const newHeight = (currentNode.boxHeight || DEFAULT_MAX_HEIGHT) + increment;

    if (currentNode.definition) {
        nodes.update({ 
            id: selectedNodeId,
            boxWidth: newWidth,
            boxHeight: newHeight,
            fixed: { x: false, y: false },
            widthConstraint: { maximum: newWidth },
            heightConstraint: { maximum: newHeight, valign: 'top' }
        });
    }
}

document.getElementById('btnSizePlus')?.addEventListener('click', () => resizeNode(50));
document.getElementById('btnSizeMinus')?.addEventListener('click', () => resizeNode(-50));

// ==========================================
// 10. LIMPIAR, CAPTURAR Y AYUDA
// ==========================================
document.getElementById('btnClear')?.addEventListener('click', () => {
    if (nodes.length === 0) return;
    if (confirm("¿Deseas vaciar todo el esquema actual?")) {
        nodes.clear();
        edges.clear();
        currentDocumentText = ""; // <-- Se limpia la memoria del documento
        actionMenu.classList.add('hidden');
        if (connectionBanner) connectionBanner.classList.add('hidden');
        sourceNodeForConnection = null;
        selectedNodeId = null;
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
            if (!canvas) throw new Error("Canvas no disponible");

            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = canvas.width;
            exportCanvas.height = canvas.height;
            const ctx = exportCanvas.getContext('2d');

            ctx.fillStyle = '#fbfcfd';
            ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
            ctx.drawImage(canvas, 0, 0);

            const imageUri = exportCanvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            
            downloadLink.download = `Graphikosmos-${dateStr}.png`;
            downloadLink.href = imageUri;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        } catch {
            alert("No se pudo exportar la imagen.");
        } finally {
            hideLoader();
        }
    }, 150);
});

document.getElementById('btnHelp')?.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
    helpModal.classList.add('flex');
});
document.getElementById('closeHelp')?.addEventListener('click', () => {
    helpModal.classList.add('hidden');
    helpModal.classList.remove('flex');
});



document.querySelectorAll('.density-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.density-btn').forEach(b => {
            b.classList.remove('bg-white', 'text-slate-900', 'shadow-xs', 'font-semibold');
            b.classList.add('text-slate-600', 'font-medium');
        });
        const target = e.currentTarget;
        target.classList.remove('text-slate-600', 'font-medium');
        target.classList.add('bg-white', 'text-slate-900', 'shadow-xs', 'font-semibold');
        selectedDensity = target.dataset.density;
    });
});

document.getElementById('btnOpenTextModal')?.addEventListener('click', () => {
    rawTextInput.value = '';
    textSchemaModal.classList.remove('hidden');
    textSchemaModal.classList.add('flex');
});

document.getElementById('closeTextModal')?.addEventListener('click', () => {
    textSchemaModal.classList.add('hidden');
    textSchemaModal.classList.remove('flex');
});

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-slate-900'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-slate-900'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-slate-900');
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
});

async function extractTextFromPDF(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 20); // Límite de seguridad
    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
}

async function extractTextFromDocx(arrayBuffer) {
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
}

async function handleFileUpload(file) {
    showLoader('Extrayendo texto del archivo...');
    try {
        const fileName = file.name.toLowerCase();
        let extractedText = '';

        if (fileName.endsWith('.txt')) {
            extractedText = await file.text();
        } else if (fileName.endsWith('.pdf')) {
            const buffer = await file.arrayBuffer();
            extractedText = await extractTextFromPDF(buffer);
        } else if (fileName.endsWith('.docx')) {
            const buffer = await file.arrayBuffer();
            extractedText = await extractTextFromDocx(buffer);
        } else if (fileName.endsWith('.zip')) {
            const buffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(buffer);
            let combined = '';

            for (let relativePath in zip.files) {
                const zipEntry = zip.files[relativePath];
                if (!zipEntry.dir) {
                    const entryName = zipEntry.name.toLowerCase();
                    if (entryName.endsWith('.txt')) {
                        const t = await zipEntry.async('text');
                        combined += `\n--- Archivo: ${zipEntry.name} ---\n` + t;
                    } else if (entryName.endsWith('.docx')) {
                        const b = await zipEntry.async('arraybuffer');
                        const t = await extractTextFromDocx(b);
                        combined += `\n--- Archivo: ${zipEntry.name} ---\n` + t;
                    } else if (entryName.endsWith('.pdf')) {
                        const b = await zipEntry.async('arraybuffer');
                        const t = await extractTextFromPDF(b);
                        combined += `\n--- Archivo: ${zipEntry.name} ---\n` + t;
                    }
                }
            }
            extractedText = combined;
        }

        // Truncado de seguridad para evitar superar el timeout de Netlify
        const words = extractedText.trim().split(/\s+/);
        if (words.length > 7000) {
            extractedText = words.slice(0, 7000).join(' ') + '\n[... Texto delimitado a las primeras 7000 palabras ...]';
        }

        rawTextInput.value = extractedText;
    } catch (err) {
        console.error(err);
        alert('No se pudo extraer el texto del archivo.');
    } finally {
        hideLoader();
    }
}

// ==========================================
// 12. GENERACIÓN DEL ÁRBOL JERÁRQUICO
// ==========================================
document.getElementById('btnProcessText')?.addEventListener('click', async () => {
    const textContent = rawTextInput.value.trim();
    if (!textContent) return;
    currentDocumentText = textContent;
    // Validación de cobro preventiva
    const estimatedMinCost = selectedDensity === 'low' ? 4 : selectedDensity === 'high' ? 10 : 6;
    if (!checkBalance(estimatedMinCost)) return;

    textSchemaModal.classList.add('hidden');
    textSchemaModal.classList.remove('flex');
    showLoader(`Generando árbol estructurado...`);

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'parse_text', 
                text: textContent,
                density: selectedDensity 
            })
        });
        const data = await response.json();

        // 1. Calcular total de nodos y confirmar saldo exacto
        const totalNodes = 1 + (data.branches?.length || 0) + (data.examples?.length || 0);
        if (!checkBalance(totalNodes)) return;

        // 2. Congelar nodos previos
        const existingNodes = nodes.get();
        nodes.update(existingNodes.map(n => ({ id: n.id, fixed: { x: true, y: true } })));

        // 3. Posicionar Raíz en la cabecera
        const viewCenter = network.getViewPosition();
        const rootX = viewCenter.x;
        const rootY = viewCenter.y - 120;

        const root = data.root;
        nodes.add({
            id: root.id,
            label: `*${root.label}*`,
            baseTitle: root.label,
            definition: root.definition || null,
            x: rootX,
            y: rootY,
            fixed: { x: false, y: false }
        });
        trackNodeUsage(root.label);

        // 4. Posicionar Ramas en fila horizontal uniforme
        const branches = data.branches || [];
        const branchSpacing = 280;
        const totalBranchWidth = (branches.length - 1) * branchSpacing;
        const startBranchX = rootX - (totalBranchWidth / 2);
        const branchY = rootY + 160;

        const branchPositions = {};

        branches.forEach((branch, index) => {
            const bx = startBranchX + (index * branchSpacing);
            const by = branchY;
            branchPositions[branch.id] = { x: bx, y: by, exampleCount: 0 };

            nodes.add({
                id: branch.id,
                label: `*${branch.label}*`,
                baseTitle: branch.label,
                definition: branch.definition || null,
                x: bx,
                y: by,
                fixed: { x: false, y: false }
            });
            edges.add({ from: root.id, to: branch.id, label: branch.relationship });
            trackNodeUsage(branch.label);
        });

        // 5. Posicionar Ejemplos en columna debajo de su respectiva rama
        const examples = data.examples || [];
        examples.forEach(ex => {
            const parentPos = branchPositions[ex.targetId] || { x: rootX, y: branchY, exampleCount: 0 };
            parentPos.exampleCount++;
            
            const exX = parentPos.x;
            const exY = parentPos.y + (parentPos.exampleCount * 110);

            nodes.add({
                id: ex.id,
                label: `*Ejemplo:*\n${ex.label}`,
                baseTitle: ex.label,
                definition: ex.definition || null,
                x: exX,
                y: exY,
                fixed: { x: false, y: false },
                color: {
                    background: '#fafaf9',
                    border: '#d6d3d1',
                    highlight: { background: '#f5f5f4', border: '#78716c' },
                    hover: { background: '#ffffff', border: '#a8a29e' }
                },
                font: { color: '#44403c', bold: { color: '#292524', size: 14 } },
                shapeProperties: { borderRadius: 10, borderDashes: [4, 4] }
            });

            const target = nodes.get(ex.targetId) ? ex.targetId : root.id;
            edges.add({
                from: target,
                to: ex.id,
                label: ex.relationship,
                color: { color: '#cbd5e1', highlight: '#78716c' },
                dashes: true
            });
            trackNodeUsage(ex.label);
        });

        // Consumir créditos del usuario
        consumeNodes(totalNodes);

        // Desactivar físicas para mantener la disposición del árbol intacta
        network.setOptions({ physics: { enabled: false } });
        network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });

    } catch (err) {
        console.error(err);
        alert('No se pudo procesar el esquema desde el documento.');
    } finally {
        hideLoader();
    }
});

// ==========================================
// 13. EVENTOS DEL CANVAS (CLIC, ARRASTRE, ZOOM)
// ==========================================
network.on('click', async function (params) {
    if (params.nodes.length > 0) {
        const clickedNode = params.nodes[0];

        if (sourceNodeForConnection && sourceNodeForConnection !== clickedNode) {
            const nodeA = sourceNodeForConnection;
            const nodeB = clickedNode;
            sourceNodeForConnection = null;
            connectionBanner.classList.add('hidden');

            if (!checkBalance(1)) return;

            showLoader('Generando puente conceptual...');

            try {
                const response = await fetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'connect', topic: nodeA, topicB: nodeB })
                });
                const data = await response.json();

                const posA = network.getPositions([nodeA])[nodeA];
                const posB = network.getPositions([nodeB])[nodeB];
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                const bridge = data.bridge;
                if (!nodes.get(bridge.id)) {
                    nodes.add({
                        id: bridge.id,
                        label: `*${bridge.label}*`,
                        baseTitle: bridge.label,
                        x: midX, 
                        y: midY,
                        boxWidth: DEFAULT_MAX_WIDTH,
                        boxHeight: DEFAULT_MAX_HEIGHT,
                        fixed: { x: false, y: false },
                        color: { background: '#f1f5f9', border: '#cbd5e1' }
                    });
                    trackNodeUsage(bridge.label);
                    consumeNodes(1);
                }
                
                edges.add({ from: nodeA, to: bridge.id, label: bridge.relFromA });
                edges.add({ from: bridge.id, to: nodeB, label: bridge.relToB });
            } catch {
                alert("Error al conectar los nodos.");
            } finally {
                hideLoader();
            }
            return;
        }

        selectedNodeId = clickedNode;
        const DOMCoords = network.canvasToDOM(network.getPositions([selectedNodeId])[selectedNodeId]);
        actionMenu.style.left = DOMCoords.x + 'px';
        actionMenu.style.top = (DOMCoords.y - 30) + 'px';
        actionMenu.classList.remove('hidden');
    } else {
        actionMenu.classList.add('hidden');
        selectedNodeId = null;
    }
});

network.on('zoom', () => actionMenu.classList.add('hidden'));

network.on('dragStart', (params) => {
    actionMenu.classList.add('hidden');
    if (params.nodes.length > 0) {
        nodes.update({ id: params.nodes[0], fixed: { x: false, y: false } });
    }
});

