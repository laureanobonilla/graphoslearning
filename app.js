// Configuración inicial del Grafo (Vis.js)
const container = document.getElementById('network-container');
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);
let network = new vis.Network(container, { nodes, edges }, {
    layout: {
        hierarchical: {
            enabled: true,
            direction: 'UD', // Up-Down (De arriba hacia abajo)
            sortMethod: 'directed', // Sigue la dirección de las flechas
            levelSeparation: 150, // Distancia vertical
            nodeSpacing: 250      // Distancia horizontal
        }
    },
    physics: {
        enabled: true,
        hierarchicalRepulsion: {
            nodeDistance: 200,
            avoidOverlap: 1
        }
    },
    nodes: { 
        shape: 'box', 
        margin: 12, 
        font: { size: 16 },
        borderWidth: 2
    },
    edges: { 
        arrows: 'to', 
        smooth: { type: 'cubicBezier' } // Evita líneas rectas rígidas
    }
});

// Referencias UI
const topicInput = document.getElementById('topicInput');
const sidePanel = document.getElementById('sidePanel');
const panelTitle = document.getElementById('panelTitle');
const panelContent = document.getElementById('panelContent');

let currentProjectId = null; // Guardará el ID de JSONBin si ya está guardado

// Generar nodo raíz
document.getElementById('btnGenerate').addEventListener('click', async () => {
    const topic = topicInput.value.trim();
    if (!topic) return;
    
    nodes.clear();
    edges.clear();
    nodes.add({ id: topic, label: topic, level: 0 });
});

// Interacción con el grafo
network.on('doubleClick', async function (params) {
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        await expandNode(nodeId);
    }
});

network.on('click', async function (params) {
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        await showDefinition(nodeId);
    } else {
        closePanel();
    }
});

// 1. Expansión con bandera de estado
async function expandNode(nodeId) {
    const currentNode = nodes.get(nodeId);
    
    // Si ya fue expandido previamente, no consultamos al API de nuevo
    if (currentNode && currentNode.expanded) {
        return;
    }

    const response = await fetch('/.netlify/functions/gemini', {
        method: 'POST',
        body: JSON.stringify({ action: 'expand', topic: nodeId })
    });
    const data = await response.json();
    
    data.concepts.forEach(concept => {
        if (!nodes.get(concept.id)) {
            nodes.add({ id: concept.id, label: concept.label, expanded: false, definition: null });
            edges.add({ from: nodeId, to: concept.id, label: concept.relationship });
        }
    });

    // Marcamos el nodo como ya expandido
    nodes.update({ id: nodeId, expanded: true });
}

// 2. Definición con caché en memoria
async function showDefinition(nodeId) {
    const currentNode = nodes.get(nodeId);
    panelTitle.innerText = currentNode.label || nodeId;
    sidePanel.classList.remove('translate-x-full');

    // Si ya tenemos la definición guardada en el nodo, la mostramos al instante
    if (currentNode && currentNode.definition) {
        panelContent.innerHTML = currentNode.definition;
        return;
    }

    panelContent.innerHTML = 'Cargando definición...';

    const response = await fetch('/.netlify/functions/gemini', {
        method: 'POST',
        body: JSON.stringify({ action: 'define', topic: nodeId })
    });
    const data = await response.json();

    // Guardamos la definición en el nodo para futuros clics
    nodes.update({ id: nodeId, definition: data.definition });
    panelContent.innerHTML = data.definition;
}

document.getElementById('btnClosePanel').addEventListener('click', closePanel);
function closePanel() { sidePanel.classList.add('translate-x-full'); }

// Guardar en JSONBin
document.getElementById('btnSave').addEventListener('click', async () => {
    const graphData = {
        nodes: nodes.get(),
        edges: edges.get()
    };
    
    const response = await fetch('/.netlify/functions/db', {
        method: 'POST',
        body: JSON.stringify({
            projectId: currentProjectId,
            title: nodes.get()[0]?.label || "Proyecto sin título",
            data: graphData,
            user: "usuario_demo" // Aquí luego puedes enlazar un sistema de login real
        })
    });
    const result = await response.json();
    currentProjectId = result.projectId;
    alert("Proyecto guardado correctamente");
});
