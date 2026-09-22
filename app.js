// ==========================================
// 1. INICIALIZACIÓN DEL GRAFO (VIS.JS)
// ==========================================
const container = document.getElementById('network-container');
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);

let network = new vis.Network(container, { nodes, edges }, {
    layout: { hierarchical: false },
    physics: {
        enabled: true,
        solver: 'repulsion',
        repulsion: { nodeDistance: 220, springLength: 200, springConstant: 0.05 }
    },
    nodes: { 
        shape: 'box', 
        margin: { top: 12, bottom: 12, left: 16, right: 16 },
        font: { 
            multi: 'md', 
            size: 15, 
            face: 'Inter, sans-serif', 
            color: '#1e293b', 
            bold: { color: '#3730a3', size: 16 } 
        },
        borderWidth: 1,
        color: {
            border: '#cbd5e1',
            background: '#ffffff',
            highlight: { border: '#6366f1', background: '#f8fafc' },
            hover: { border: '#94a3b8', background: '#f1f5f9' }
        },
        shadow: { enabled: true, color: 'rgba(15, 23, 42, 0.08)', size: 10, x: 0, y: 4 },
        shapeProperties: { borderRadius: 8 }
    },
    edges: { 
        arrows: 'to', 
        color: { color: '#94a3b8', highlight: '#6366f1' },
        font: { size: 12, color: '#64748b', strokeWidth: 3, strokeColor: '#ffffff' },
        smooth: { type: 'continuous' } 
    },
    interaction: { hover: true }
});

// Desbloquear nodos y apagar físicas al estabilizarse
function stopPhysicsAndUnlock() {
    network.setOptions({ physics: { enabled: false } });
    const allNodes = nodes.get();
    const unlockUpdates = allNodes.map(n => ({ id: n.id, fixed: { x: false, y: false } }));
    nodes.update(unlockUpdates);
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
// 3. SISTEMA DE SALDO Y LICENCIAS
// ==========================================
let currentLicense = localStorage.getItem('gk_license') || 'FREE_TRIAL';
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

function consumeNodes(amount) {
    availableNodes -= amount;
    if (availableNodes < 0) availableNodes = 0;
    localStorage.setItem('gk_balance', availableNodes);
    updateCounterDisplay();
}

function checkBalance(cost) {
    if (availableNodes < cost) {
        if (actionMenu) actionMenu.classList.add('hidden');
        if (storeModal) storeModal.classList.remove('hidden');
        return false;
    }
    return true;
}

// Abrir / Cerrar Tienda
document.getElementById('nodeCounterBtn')?.addEventListener('click', () => {
    storeModal.classList.remove('hidden');
});
document.getElementById('closeStore')?.addEventListener('click', () => {
    storeModal.classList.add('hidden');
});

// ==========================================
// 4. TIENDA Y PAGOS CON PAYPAL
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
        style: {
            layout: 'vertical',
            color:  'gold',
            shape:  'rect',
            label:  'paypal'
        },
        createOrder: function(data, actions) {
            return actions.order.create({
                purchase_units: [{
                    description: `Graphikosmos - ${selectedNodeAmount} Nodos`,
                    amount: {
                        currency_code: 'USD',
                        value: selectedPrice
                    }
                }]
            });
        },
        onApprove: function(data, actions) {
            return actions.order.capture().then(function(details) {
                const licenseKey = 'GK-' + Math.random().toString(36).substring(2, 10).toUpperCase();
                
                availableNodes += selectedNodeAmount;
                currentLicense = licenseKey;

                localStorage.setItem('gk_license', licenseKey);
                localStorage.setItem('gk_balance', availableNodes);
                updateCounterDisplay();

                storeModal.classList.add('hidden');
                alert(
                    `¡Pago acreditado con éxito, ${details.payer.name.given_name}!\n\n` +
                    `Se agregaron ${selectedNodeAmount} nodos a tu cuenta.\n` +
                    `Tu clave de licencia es: ${licenseKey}\n` +
                    `Consérvala para sincronizar tu saldo en otros navegadores.`
                );
            });
        },
        onError: function(err) {
            console.error('Error en PayPal:', err);
            alert('No se pudo procesar la transacción con PayPal.');
        }
    }).render('#paypal-button-container');
}

// Sincronizar clave manual (simulación local inicial)
document.getElementById('btnVerifyLicense')?.addEventListener('click', () => {
    const key = document.getElementById('licenseInput').value.trim().toUpperCase();
    if (!key) return;
    
    // Si coincide con la clave guardada en este equipo
    if (key === localStorage.getItem('gk_license')) {
        alert('Licencia activa verificada.');
    } else {
        alert('Clave no encontrada localmente. Cuando conectemos JSONBin se validará en la nube.');
    }
});

// ==========================================
// 5. RUTAS Y CONTEXTO JERÁRQUICO
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

// ==========================================
// 6. GENERAR TEMA RAÍZ / PARALELO
// ==========================================
document.getElementById('btnGenerate').addEventListener('click', async () => {
    const topic = topicInput.value.trim();
    if (!topic) return;

    if (!checkBalance(1)) return;

    // Congelar nodos existentes para evitar reacomodos
    const existingNodes = nodes.get();
    nodes.update(existingNodes.map(n => ({ id: n.id, fixed: { x: true, y: true } })));

    // Desfase aleatorio cerca del centro de vista
    const viewCenter = network.getViewPosition();
    const randomX = viewCenter.x + (Math.random() * 160 - 80);
    const randomY = viewCenter.y + (Math.random() * 160 - 80);

    network.setOptions({ physics: { enabled: true } });

    nodes.add({ 
        id: topic, 
        label: `*${topic}*`, 
        baseTitle: topic, 
        x: randomX,
        y: randomY,
        fixed: { x: false, y: false }
    });

    consumeNodes(1);
    topicInput.value = '';

    setTimeout(() => {
        network.focus(topic, {
            scale: 1.1,
            animation: { duration: 600, easingFunction: 'easeInOutQuad' }
        });
    }, 100);

    setTimeout(() => { stopPhysicsAndUnlock(); }, 1200);
});

// ==========================================
// 7. EXPANDIR RAMAS (CONCEPTOS TEÓRICOS)
// ==========================================
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
                createdCount++;
            }
        });

        nodes.update({ id: selectedNodeId, expanded: true });
        consumeNodes(createdCount);

        setTimeout(() => { stopPhysicsAndUnlock(); }, 1500);
    } catch (err) {
        alert("Error al conectar con el servicio.");
    } finally {
        hideLoader();
    }
});

// ==========================================
// 8. GENERAR EJEMPLOS PRÁCTICOS
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
                        background: '#fef3c7',
                        border: '#f59e0b',
                        highlight: { background: '#fde68a', border: '#d97706' },
                        hover: { background: '#fffbeb', border: '#d97706' }
                    },
                    font: { color: '#92400e' },
                    shapeProperties: { borderDashes: [5, 5] }
                });
                
                edges.add({ 
                    from: selectedNodeId, 
                    to: example.id, 
                    label: example.relationship,
                    color: { color: '#f59e0b', highlight: '#d97706' },
                    dashes: true
                });
                createdCount++;
            }
        });

        consumeNodes(createdCount);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1500);
    } catch (err) {
        alert("Error al conectar con el servicio.");
    } finally {
        hideLoader();
    }
});

// ==========================================
// 9. CARGAR DEFINICIÓN EN EL NODO
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
    } catch (err) {
        alert("Error al obtener la definición.");
    } finally {
        hideLoader();
    }
});

// ==========================================
// 10. MODO CONEXIÓN ENTRE DOS NODOS
// ==========================================
document.getElementById('btnMenuConnect').addEventListener('click', () => {
    sourceNodeForConnection = selectedNodeId;
    actionMenu.classList.add('hidden');
    connectionBanner.classList.remove('hidden');
});

connectionBanner.addEventListener('click', () => {
    sourceNodeForConnection = null;
    connectionBanner.classList.add('hidden');
});

// ==========================================
// 11. ELIMINAR NODO
// ==========================================
document.getElementById('btnMenuDelete').addEventListener('click', () => {
    if (selectedNodeId) {
        nodes.remove(selectedNodeId);
    }
    actionMenu.classList.add('hidden');
    selectedNodeId = null;
});

// ==========================================
// 12. CONTROLES DE TAMAÑO (+ / -)
// ==========================================
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
// 13. ACCIONES GLOBALES (LIMPIAR Y CAPTURAR)
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
        alert("El lienzo está vacío. Genera algunos nodos primero.");
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
        } catch (err) {
            console.error(err);
            alert("No se pudo exportar la imagen.");
        } finally {
            hideLoader();
        }
    }, 150);
});

// ==========================================
// 14. EVENTOS DEL CANVAS (CLIC, ARRASTRE, ZOOM)
// ==========================================
network.on('click', async function (params) {
    if (params.nodes.length > 0) {
        const clickedNode = params.nodes[0];

        // Resolución del modo conexión
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

                network.setOptions({ physics: { enabled: true } });

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
                        color: { background: '#e0e7ff', border: '#6366f1' }
                    });
                    consumeNodes(1);
                }
                
                edges.add({ from: nodeA, to: bridge.id, label: bridge.relFromA });
                edges.add({ from: bridge.id, to: nodeB, label: bridge.relToB });

                setTimeout(() => { stopPhysicsAndUnlock(); }, 1500);
            } catch (err) {
                alert("Error al conectar los nodos.");
            } finally {
                hideLoader();
            }
            return;
        }

        // Selección ordinaria de nodo
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

// Garantizar libertad de movimiento al arrastrar
network.on('dragStart', (params) => {
    actionMenu.classList.add('hidden');
    if (params.nodes.length > 0) {
        nodes.update({ id: params.nodes[0], fixed: { x: false, y: false } });
    }
});