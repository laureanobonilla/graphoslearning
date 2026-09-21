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
        // multi: 'md' nos permite usar *texto* para negritas
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

function stopPhysicsAndUnlock() {
    network.setOptions({ physics: { enabled: false } });
    const allNodes = nodes.get();
    const unlockUpdates = allNodes.map(n => ({ id: n.id, fixed: false }));
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
    
    // Lo guardamos con formato bold Markdown (*texto*)
    nodes.add({ id: topic, label: `*${topic}*`, baseTitle: topic });

    setTimeout(() => {
        network.focus(topic, {
            scale: 1.2,
            animation: { duration: 800, easingFunction: 'easeInOutQuad' }
        });
    }, 100);
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
network.on('dragStart', () => actionMenu.classList.add('hidden'));

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
        
        const existingNodes = nodes.get();
        nodes.update(existingNodes.map(n => ({ id: n.id, fixed: true })));

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
                    y: parentPos.y
                });
                edges.add({ from: selectedNodeId, to: concept.id, label: concept.relationship });
            }
        });
        nodes.update({ id: selectedNodeId, expanded: true });
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

        // Estilo diagrama de clases: Título en negrita, separador y texto
        const newLabel = `*${title}*\n────────────────────\n${data.definition}`;

        nodes.update({ 
            id: selectedNodeId, 
            baseTitle: title,
            definition: data.definition, 
            label: newLabel,
            shape: 'box',
            fixed: false, // Asegura que el nodo se pueda mover
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
        // Al actualizar tamaño, forzamos que se mantenga libre
        nodes.update({ 
            id: selectedNodeId,
            boxWidth: newWidth,
            boxHeight: newHeight,
            fixed: false,
            widthConstraint: { maximum: newWidth },
            heightConstraint: { maximum: newHeight, valign: 'top' }
        });
    }
}

const btnPlus = document.getElementById('btnSizePlus');
if (btnPlus) btnPlus.addEventListener('click', () => resizeNode(50));

const btnMinus = document.getElementById('btnSizeMinus');
if (btnMinus) btnMinus.addEventListener('click', () => resizeNode(-50));
