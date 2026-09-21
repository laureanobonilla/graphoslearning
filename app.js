const container = document.getElementById('network-container');
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);

// Configuración estética y física del Grafo
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
        font: { size: 15, face: 'Inter, sans-serif', color: '#1e293b' },
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


network.on("stabilizationIterationsDone", function () {
    network.setOptions({ physics: { enabled: false } });
});
network.on("stabilized", function () {
    network.setOptions({ physics: { enabled: false } });
});

// Referencias UI
const topicInput = document.getElementById('topicInput');
const sidePanel = document.getElementById('sidePanel');
const panelTitle = document.getElementById('panelTitle');
const panelContent = document.getElementById('panelContent');
const actionMenu = document.getElementById('actionMenu');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');

let currentProjectId = null;
let selectedNodeId = null;

// Control del Loader Visual
function showLoader(msg) {
    loaderText.innerText = msg;
    loader.classList.add('show');
}
function hideLoader() {
    loader.classList.remove('show');
}

// Generar nodo raíz y centrar
document.getElementById('btnGenerate').addEventListener('click', async () => {
    const topic = topicInput.value.trim();
    if (!topic) return;
    
    nodes.clear();
    edges.clear();

    // 2. AGREGAR ESTA LÍNEA: Encender físicas momentáneamente
    network.setOptions({ physics: { enabled: true } });
    
    nodes.add({ id: topic, label: topic });

    setTimeout(() => {
        network.focus(topic, {
            scale: 1.2,
            animation: { duration: 800, easingFunction: 'easeInOutQuad' }
        });
    }, 100);
});

// Obtener contexto jerárquico
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

// Eventos de interacción con el lienzo
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

// Botón de Expandir
document.getElementById('btnMenuExpand').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    
    if (currentNode && currentNode.expanded) return;

    showLoader('Generando conceptos conexos...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'expand', topic: selectedNodeId, contextPath })
        });
        const data = await response.json();
        
        // 3. AGREGAR ESTA LÍNEA: Encender físicas para que los nuevos se separen
        network.setOptions({ physics: { enabled: true } });
        
        data.concepts.forEach(concept => {
            if (!nodes.get(concept.id)) {
                nodes.add({ id: concept.id, label: concept.label, expanded: false });
                edges.add({ from: selectedNodeId, to: concept.id, label: concept.relationship });
            }
        });

        nodes.update({ id: selectedNodeId, expanded: true });
    } catch (err) {
        alert("Error al conectar con la IA.");
    } finally {
        hideLoader();
    }
});

// Botón de Definir
document.getElementById('btnMenuDefine').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    
    panelTitle.innerText = currentNode.label || selectedNodeId;
    sidePanel.classList.remove('translate-x-full');

    if (currentNode && currentNode.definition) {
        panelContent.innerHTML = currentNode.definition;
        return;
    }

    panelContent.innerHTML = '<span class="text-slate-400">Generando definición detallada...</span>';
    showLoader('Redactando definición...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'define', topic: selectedNodeId, contextPath })
        });
        const data = await response.json();

        nodes.update({ id: selectedNodeId, definition: data.definition });
        panelContent.innerHTML = data.definition;
    } catch (err) {
        panelContent.innerHTML = '<span class="text-red-500">Error al obtener la definición.</span>';
    } finally {
        hideLoader();
    }
});

document.getElementById('btnClosePanel').addEventListener('click', () => {
    sidePanel.classList.add('translate-x-full');
});
