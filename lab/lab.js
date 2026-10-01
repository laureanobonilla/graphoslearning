// ==========================================
// /LAB/LAB.JS - EXTENSIONES Y OVERRIDES SOBRE /APP.JS
// ==========================================

// Helper para hacer "override" limpio del evento click de un botón existente en app.js
function overrideClick(elementId, newHandler) {
    const oldEl = document.getElementById(elementId);
    if (!oldEl) return null;
    const newEl = oldEl.cloneNode(true);
    oldEl.parentNode.replaceChild(newEl, oldEl);
    newEl.addEventListener('click', newHandler);
    return newEl;
}

// 1. Inyectar visualmente los botones exclusivos de /lab en el menú si no existen en el HTML
(function injectLabUI() {
    const synergyBtn = document.getElementById('btnMenuSynergy');
    if (synergyBtn && !document.getElementById('btnMenuAntithesis')) {
        synergyBtn.insertAdjacentHTML('afterend', `
            <button id="btnMenuAntithesis" class="w-full px-3.5 py-2 hover:bg-rose-50/80 text-rose-900 font-medium text-xs text-left flex items-center justify-between transition-colors border-t border-rose-100/50">
                <span>⚡ Cuestionar / Antítesis</span>
                <span class="text-rose-600/80 text-[10px] uppercase font-bold tracking-wider">Crítica</span>
            </button>
            <button id="btnMenuChallenge" class="w-full px-3.5 py-2 hover:bg-emerald-50/80 text-emerald-900 font-medium text-xs text-left flex items-center justify-between transition-colors border-t border-emerald-100/50">
                <span>🧠 Ponme a prueba</span>
                <span class="text-emerald-600/80 text-[10px] uppercase font-bold tracking-wider">Reto</span>
            </button>
        `);
    }

    // Inyectar barra "Tu Cosmos" en el modal de proyectos
    const projectsList = document.getElementById('projectsList');
    if (projectsList && !document.getElementById('cosmosRankTitle')) {
        projectsList.parentElement.insertAdjacentHTML('beforebegin', `
            <div class="px-6 py-3 bg-indigo-950 text-white flex justify-between items-center text-xs shrink-0">
                <div class="flex items-center gap-2">
                    <span class="text-base">🌌</span>
                    <div>
                        <p class="font-bold text-indigo-200 uppercase tracking-wider text-[10px]">Rango Intelectual</p>
                        <p id="cosmosRankTitle" class="font-extrabold text-white text-xs">Explorador Conceptual</p>
                    </div>
                </div>
                <div class="flex gap-4 text-right">
                    <div>
                        <p id="cosmosTotalProjects" class="font-extrabold text-amber-400 text-sm">0</p>
                        <p class="text-[10px] text-indigo-300">Mapas</p>
                    </div>
                    <div>
                        <p id="cosmosTotalNodes" class="font-extrabold text-emerald-400 text-sm">0</p>
                        <p class="text-[10px] text-indigo-300">Conceptos</p>
                    </div>
                </div>
            </div>
        `);
    }
})();

// 2. OVERRIDE de "Conceptos Relacionados" (Agrega Brecha de Curiosidad / Nodo Incógnita)
overrideClick('btnMenuExpand', async () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    if (!requireAuth("profundizar en conceptos relacionados")) return;

    const currentNode = nodes.get(selectedNodeId);
    const topicName = currentNode.baseTitle || selectedNodeId;

    // Resolver incógnita si el usuario hace clic en expandir sobre un nodo de misterio
    if (currentNode && currentNode.isMystery) {
        if (!checkBalance(1)) return;
        showLoader('Revelando incógnita...');
        try {
            const response = await fetch('/.netlify/functions/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'custom_prompt',
                    topic: topicName,
                    contextPath: getContextPath(selectedNodeId),
                    customRequest: `Responde de forma clara, reveladora y directa a esta incógnita: ${topicName}`,
                    documentContext: globalDocumentContext || currentDocumentText
                })
            });
            const data = await response.json();
            const parentPos = network.getPositions([selectedNodeId])[selectedNodeId];
            let createdCount = 0;
            let firstAnswer = null;
            // Nodo pequeño siempre; el contenido real se abre en su propio panel flotante.
            (data.nodes || []).forEach((item, idx) => {
                const newId = item.id || `ans_${Date.now()}_${idx}`;
                nodes.add({
                    id: newId,
                    label: `*💡 ${item.title}*`,
                    baseTitle: item.title,
                    definition: item.content || null,
                    color: { background: '#fffbeb', border: '#f59e0b' },
                    x: parentPos.x, y: parentPos.y + 140,
                    widthConstraint: { minimum: 150, maximum: 240 }
                });
                edges.add({ from: selectedNodeId, to: newId, label: 'se explica por' });
                if (!firstAnswer) firstAnswer = { id: newId, title: item.title, content: item.content };
                createdCount++;
            });
            nodes.update({ id: selectedNodeId, isMystery: false });
            applyServerBalance(data); consumeNodes(createdCount);
            if (firstAnswer) showContentInFloatingPanel(firstAnswer.id, firstAnswer.title, firstAnswer.content);
        } catch { alert("Error al resolver la incógnita."); } finally { hideLoader(); }
        return;
    }

    const nodeCountVal = document.getElementById('nodeCount').value;
    const maxNodes = nodeCountVal === 'auto' ? 'entre 3 y 5 (según relevancia)' : parseInt(nodeCountVal, 10);
    const estimatedCost = nodeCountVal === 'auto' ? 4 : maxNodes;
    if (!checkBalance(estimatedCost)) return;

    if (currentNode && currentNode.expanded) return;
    showLoader('Generando conceptos e incógnitas...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'expand',
                topic: topicName,
                contextPath: getContextPath(selectedNodeId),
                maxNodes,
                includeCuriosity: true,
                documentContext: globalDocumentContext || currentDocumentText
            })
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
                trackNodeUsage(concept.label);
                createdCount++;
            }
        });

        if (data.curiosityHook && data.curiosityHook.question) {
            const hookId = `mystery_${Date.now()}`;
            nodes.add({
                id: hookId,
                label: `*❓ Incógnita:*\n${data.curiosityHook.question}`,
                baseTitle: data.curiosityHook.question,
                isMystery: true,
                color: { background: '#faf5ff', border: '#a855f7' },
                shapeProperties: { borderRadius: 10, borderDashes: [4, 4] },
                widthConstraint: { minimum: 170, maximum: 230 },
                x: parentPos.x + 120, y: parentPos.y + 120, fixed: { x: false, y: false }
            });
            edges.add({ from: selectedNodeId, to: hookId, label: 'plantea duda', dashes: true, color: { color: '#a855f7' } });
        }

        nodes.update({ id: selectedNodeId, expanded: true });
        applyServerBalance(data); consumeNodes(createdCount);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1200);
    } catch { alert("Error al conectar con el servicio."); } finally { hideLoader(); }
});

// 3. "Usar Definición" ya no necesita override: ver nota debajo.
// La versión Lab reutiliza exactamente el mismo sistema de paneles flotantes de
// app.js (openFloatingPanel / showDefinitionInFloatingPanel), así que este override
// ya no necesita reimplementar nada: basta con no sobreescribir el handler de app.js.
// (Antes aquí había una copia completa que abría el panel único "nodeDetailPanel";
// se elimina para evitar divergencia entre las dos copias del mismo flujo.)

// 4. "Antítesis" y "Ponme a prueba" ya NO se registran aquí por separado.
// Antes esta sección volvía a hacer document.getElementById(...).addEventListener(...)
// sobre los MISMOS botones que app.js ya escucha, así que cada clic disparaba dos
// llamadas a Gemini y creaba los nodos duplicados (y gastaba el doble de nodos).
// app.js ya cubre ambos botones -incluyendo el reto socrático sobre el nuevo
// sistema de paneles flotantes-, así que aquí no hace falta nada más.

document.getElementById('btnProjects')?.addEventListener('click', () => {
    const userKey = typeof getActiveUserKey === 'function' ? getActiveUserKey() : (currentUser ? currentUser.id : 'guest_local');
    const catalog = JSON.parse(localStorage.getItem(`gk_projects_${userKey}`) || '[]');
    const totalTracked = parseInt(localStorage.getItem('gk_nodes_tracked') || '0', 10) + nodes.length;

    const elProjects = document.getElementById('cosmosTotalProjects');
    const elNodes = document.getElementById('cosmosTotalNodes');
    const elRank = document.getElementById('cosmosRankTitle');

    if (elProjects) elProjects.innerText = catalog.length;
    if (elNodes) elNodes.innerText = totalTracked;
    if (elRank) {
        if (totalTracked > 100) elRank.innerText = "Polímata Maestro 🌌";
        else if (totalTracked > 40) elRank.innerText = "Arquitecto de Ideas 🏛️";
        else if (totalTracked > 15) elRank.innerText = "Analista Sintético 🔭";
        else elRank.innerText = "Explorador Conceptual 🌱";
    }
});