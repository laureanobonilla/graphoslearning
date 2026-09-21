const container = document.getElementById('network-container');
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);

// Configuración estética con soporte para Markdown (multi: 'md')
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
        font: { multi: 'md', size: 15, face: 'Inter, sans-serif', color: '#1e293b', bold: { color: '#3730a3', size: 16 } },
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

// Función para liberar todos los nodos con seguridad absoluta
function stopPhysicsAndUnlock() {
    network.setOptions({ physics: { enabled: false } });
    const allNodes = nodes.get();
    // Usamos {x: false, y: false} para asegurar que Vis.js lo entienda en todos los navegadores
    const unlockUpdates = allNodes.map(n => ({ id: n.id, fixed: { x: false, y: false } }));
    nodes.update(unlockUpdates);
}

network.on("stabilizationIterationsDone", stopPhysicsAndUnlock);
network.on("stabilized", stopPhysicsAndUnlock);

const topicInput = document.getElementById('topicInput');
const actionMenu = document.getElementById('actionMenu');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');

let selectedNodeId = null;

function showLoader(msg) {
    loaderText.innerText = msg;
    loader.classList.add('show');
}
function hideLoader() {
    loader.classList.remove('show');
}

// Generar nodo raíz
document.getElementById('btnGenerate').addEventListener('click', async () => {
    const topic = topicInput.value.trim();
    if (!topic) return;
    
    nodes.clear();
    edges.clear();
    network.setOptions({ physics: { enabled: true } });
    
    nodes.add({ id: topic, label: `*${topic}*`, baseTitle: topic, fixed: { x: false, y: false } });

    setTimeout(() => {
        network.focus(topic, {
            scale: 1.2,
            animation: { duration: 800, easingFunction: 'easeInOutQuad' }
        });
    }, 100);
});
// --- LÓGICA PARA GENERAR EJEMPLOS ---
document.getElementById('btnMenuExamples').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const contextPath = getContextPath(selectedNodeId);
    const maxNodes = parseInt(document.getElementById('nodeCount').value) || 3;
    
    showLoader('Buscando ejemplos prácticos...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'examples', topic: selectedNodeId, contextPath, maxNodes })
        });
        const data = await response.json();
        
        // Bloquear nodos temporalmente
        const existingNodes = nodes.get();
        nodes.update(existingNodes.map(n => ({ id: n.id, fixed: { x: true, y: true } })));

        const parentPos = network.getPositions([selectedNodeId])[selectedNodeId];
        network.setOptions({ physics: { enabled: true } });
        
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
                    
                    // FORMATO VISUAL ESPECÍFICO PARA EJEMPLOS (Post-it amarillo)
                    color: {
                        background: '#fef3c7', // Ámbar claro
                        border: '#f59e0b',     // Ámbar fuerte
                        highlight: { background: '#fde68a', border: '#d97706' },
                        hover: { background: '#fffbeb', border: '#d97706' }
                    },
                    font: { color: '#92400e' }, // Texto café/ámbar oscuro
                    shapeProperties: { borderDashes: [5, 5] } // Borde punteado
                });
                
                edges.add({ 
                    from: selectedNodeId, 
                    to: example.id, 
                    label: example.relationship,
                    color: { color: '#f59e0b', highlight: '#d97706' },
                    dashes: true // Flecha de conexión punteada
                });
            }
        });

        // Desbloqueo de seguridad
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1500);

    } catch (err) { alert("Error de conexión"); } finally { hideLoader(); }
});
function getContextPath(nodeId) {
    let path = [nodeId];
    let current = nodeId;
    for(let i = 0; i < 5; i++) {
        let parentEdges = edges.get({ filter: e => e.to === current });
        if (parentEdges.length === 0) break;
        current = parentEdges[0].from;
        path.unshift(current);
    }
    return path.join(' > ');
}

network.on('click', function (params) {
    if (params.nodes.length > 0) {
        selectedNodeId = params.nodes[0];
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

// SEGURO DE VIDA 1: Si el usuario intenta arrastrar, desbloquear el nodo inmediatamente
network.on('dragStart', (params) => {
    actionMenu.classList.add('hidden');
    if (params.nodes.length > 0) {
        nodes.update({ id: params.nodes[0], fixed: { x: false, y: false } });
    }
});

const DEFAULT_MAX_WIDTH = 250;
const DEFAULT_MAX_HEIGHT = 90;

document.getElementById('btnMenuExpand').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    const maxNodes = parseInt(document.getElementById('nodeCount').value) || 3;
    
    if (currentNode && currentNode.expanded) return;
    showLoader('Generando conceptos...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'expand', topic: selectedNodeId, contextPath, maxNodes })
        });
        const data = await response.json();
        
        // Bloqueamos los nodos existentes solo momentáneamente
        const existingNodes = nodes.get();
        nodes.update(existingNodes.map(n => ({ id: n.id, fixed: { x: true, y: true } })));

        const parentPos = network.getPositions([selectedNodeId])[selectedNodeId];
        network.setOptions({ physics: { enabled: true } });
        
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
                    fixed: { x: false, y: false } // Los nuevos nacen libres
                });
                edges.add({ from: selectedNodeId, to: concept.id, label: concept.relationship });
            }
        });
        nodes.update({ id: selectedNodeId, expanded: true });

        // SEGURO DE VIDA 2: Forzar el desbloqueo general 1.5s después de expandir
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1500);

    } catch (err) { alert("Error de conexión"); } finally { hideLoader(); }
});

document.getElementById('btnMenuDefine').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    const title = currentNode.baseTitle || selectedNodeId;
    
    if (currentNode && currentNode.definition) return;

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
    } catch (err) { alert("Error de conexión"); } finally { hideLoader(); }
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

const btnPlus = document.getElementById('btnSizePlus');
if (btnPlus) btnPlus.addEventListener('click', () => resizeNode(50));

const btnMinus = document.getElementById('btnSizeMinus');
if (btnMinus) btnMinus.addEventListener('click', () => resizeNode(-50));
