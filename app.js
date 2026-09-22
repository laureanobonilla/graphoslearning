// ==========================================
// 1. INICIALIZACIÓN DEL GRAFO (VIS.JS)
// ==========================================
const container = document.getElementById('network-container');
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);


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
        shadow: { 
            enabled: true, 
            color: 'rgba(15, 23, 42, 0.04)', 
            size: 16, 
            x: 0, 
            y: 8 
        },
        shapeProperties: { borderRadius: 10 }
    },
    edges: { 
        arrows: {
            to: { enabled: true, scaleFactor: 0.6 }
        },
        color: { 
            color: '#cbd5e1', 
            highlight: '#475569', 
            hover: '#94a3b8' 
        },
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
    interaction: { 
        hover: true,
        tooltipDelay: 100
    }
});

function stopPhysicsAndUnlock() {
    network.setOptions({ physics: { enabled: false } });
    const allNodes = nodes.get();
    nodes.update(allNodes.map(n => ({ id: n.id, fixed: { x: false, y: false } })));
}

network.on("stabilizationIterationsDone", stopPhysicsAndUnlock);
network.on("stabilized", stopPhysicsAndUnlock);

// ==========================================
// 2. REFERENCIAS UI Y NOTIFICADOR
// ==========================================
const topicInput = document.getElementById('topicInput');
const actionMenu = document.getElementById('actionMenu');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
const connectionBanner = document.getElementById('connectionBanner');
const storeModal = document.getElementById('storeModal');

let selectedNodeId = null;
let sourceNodeForConnection = null;

const DEFAULT_MAX_WIDTH = 250;
const DEFAULT_MAX_HEIGHT = 90;

function showLoader(msg) {
    if (loaderText && loader) {
        loaderText.innerText = msg;
        loader.classList.add('show');
    }
}

function hideLoader() {
    if (loader) loader.classList.remove('show');
}

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
    if (nodesTracked >= 50) return; // Límite ampliado a 50 nodos por usuario

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

// Acceso Seguro de Admin
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
            alert("Acceso administrador concedido. Nodos ilimitados activados.");
        } else {
            alert("Contraseña incorrecta.");
        }
    } catch {
        alert("Error al verificar credenciales.");
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
            c.classList.remove('border-2', 'border-indigo-500', 'bg-indigo-50');
            c.classList.add('border', 'border-slate-200');
        });
        const target = e.currentTarget;
        target.classList.remove('border', 'border-slate-200');
        target.classList.add('border-2', 'border-indigo-500', 'bg-indigo-50');
        
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
                currentLicense = licenseKey;

                localStorage.setItem('gk_license', licenseKey);
                localStorage.setItem('gk_balance', availableNodes);
                updateCounterDisplay();
                closeStoreModal();

                alert(`¡Pago completado! Se agregaron ${selectedNodeAmount} nodos.\nTu clave es: ${licenseKey}\nConsérvala para sincronizar tu saldo en otros dispositivos.`);
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
            currentLicense = data.licenseKey;
            availableNodes = data.balance;
            localStorage.setItem('gk_license', currentLicense);
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
// 6. GENERAR NODO RAÍZ (SIN REVOLVER EL LIENZO)
// ==========================================
document.getElementById('btnGenerate').addEventListener('click', async () => {
    const topic = topicInput.value.trim();
    if (!topic) return;

    if (!checkBalance(1)) return;

    // Calculamos el centro actual donde el usuario tiene la cámara puesta
    const viewCenter = network.getViewPosition();
    const spawnX = viewCenter.x + (Math.random() * 80 - 40);
    const spawnY = viewCenter.y + (Math.random() * 80 - 40);

    // Agregamos directamente en posición fija SIN activar el motor de físicas
    nodes.add({ 
        id: topic, 
        label: `*${topic}*`, 
        baseTitle: topic, 
        x: spawnX, 
        y: spawnY,
        fixed: { x: false, y: false }
    });

    trackNodeUsage(topic);
    consumeNodes(1);
    topicInput.value = '';

    // Enfoque suave hacia el nuevo nodo sin alterar los demás
    setTimeout(() => {
        network.focus(topic, {
            scale: 1.0,
            animation: { duration: 600, easingFunction: 'easeInOutQuad' }
        });
    }, 50);
});

// ==========================================
// 7. EXPANDIR RAMAS
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
            body: JSON.stringify({ action: 'expand', topic: selectedNodeId, contextPath, maxNodes })
        });
        const data = await response.json();

        // Congelar nodos existentes para que solo se muevan los nuevos
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
// 8. GENERAR EJEMPLOS
// ==========================================
document.getElementById('btnMenuExamples').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const maxNodes = parseInt(document.getElementById('nodeCount').value, 10) || 3;
    if (!checkBalance(maxNodes)) return;

    const contextPath = getContextPath(selectedNodeId);
    showLoader('Buscando ejemplos prácticos...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'examples', topic: selectedNodeId, contextPath, maxNodes })
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
                    font: { 
                        color: '#44403c',
                        bold: { color: '#292524', size: 14 }
                    },
                    shapeProperties: { borderRadius: 10, borderDashes: [4, 4] }
                });
                
                edges.add({ 
                    from: selectedNodeId, 
                    to: example.id, 
                    label: example.relationship,
                    color: { color: '#f59e0b', highlight: '#d97706' },
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
// 9. DEFINICIÓN, CONEXIONES Y TAMAÑO
// ==========================================
document.getElementById('btnMenuDefine').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const currentNode = nodes.get(selectedNodeId);
    if (currentNode && currentNode.definition) return;

    const contextPath = getContextPath(selectedNodeId);
    const title = currentNode.baseTitle || selectedNodeId;

    showLoader('Redactando definición...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'define', topic: selectedNodeId, contextPath })
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
// 10. LIMPIAR Y CAPTURAR
// ==========================================
document.getElementById('btnClear')?.addEventListener('click', () => {
    if (nodes.length === 0) return;
    if (confirm("¿Deseas vaciar todo el esquema actual?")) {
        nodes.clear();
        edges.clear();
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

            ctx.fillStyle = '#f8fafc';
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

// ==========================================
// 11. EVENTOS DE RED
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
                        color: {
                            background: '#f1f5f9',
                            border: '#cbd5e1',
                            highlight: { background: '#e2e8f0', border: '#475569' }
                        },
                        font: { color: '#1e293b' }
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