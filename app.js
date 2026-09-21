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


// Valores por defecto para el tamaño de las cajas con texto
const DEFAULT_MAX_WIDTH = 250;
const DEFAULT_MAX_HEIGHT = 80;

// Botón de Expandir (Ahora lee el input numérico)
document.getElementById('btnMenuExpand').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    // Leer el número seleccionado por el usuario
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
                    label: concept.label, 
                    baseTitle: concept.label, // Guardamos el nombre original sin la definición
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

// Botón de Definición (Inyecta en el canvas y corta el texto)
document.getElementById('btnMenuDefine').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    const title = currentNode.baseTitle || currentNode.label; // Respaldo del título original
    
    if (currentNode && currentNode.definition) return; // Si ya la tiene, no hace nada

    showLoader('Redactando definición...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'define', topic: selectedNodeId, contextPath })
        });
        const data = await response.json();

        // Inyectamos el título original, dos saltos de línea y el texto plano
        const newLabel = `${title}\n\n${data.definition}`;

        nodes.update({ 
            id: selectedNodeId, 
            baseTitle: title,
            definition: data.definition, 
            label: newLabel,
            shape: 'box',
            widthConstraint: { maximum: currentNode.boxWidth || DEFAULT_MAX_WIDTH },
            // valign: top empuja el texto hacia arriba, lo que sobra abajo se corta
            heightConstraint: { maximum: currentNode.boxHeight || DEFAULT_MAX_HEIGHT, valign: 'top' }
        });
    } catch (err) { alert("Error de conexión"); } finally { hideLoader(); }
});

// Controles para cambiar el tamaño del nodo seleccionado
function resizeNode(increment) {
    if (!selectedNodeId) return;
    const currentNode = nodes.get(selectedNodeId);
    
    // Aumentamos o reducimos el área en 50px
    const newWidth = (currentNode.boxWidth || DEFAULT_MAX_WIDTH) + increment;
    const newHeight = (currentNode.boxHeight || DEFAULT_MAX_HEIGHT) + increment;

    // Solo actualizamos si el nodo ya tiene una definición inyectada
    if (currentNode.definition) {
        nodes.update({ 
            id: selectedNodeId,
            boxWidth: newWidth,
            boxHeight: newHeight,
            widthConstraint: { maximum: newWidth },
            heightConstraint: { maximum: newHeight, valign: 'top' }
        });
    }
}

document.getElementById('btnSizePlus').addEventListener('click', () => resizeNode(50));
document.getElementById('btnSizeMinus').addEventListener('click', () => resizeNode(-50));

const btnPlus = document.getElementById('btnSizePlus');
if (btnPlus) {
    btnPlus.addEventListener('click', () => resizeNode(50));
}

const btnMinus = document.getElementById('btnSizeMinus');
if (btnMinus) {
    btnMinus.addEventListener('click', () => resizeNode(-50));
}
