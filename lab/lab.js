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
            (data.nodes || []).forEach((item, idx) => {
                const newId = item.id || `ans_${Date.now()}_${idx}`;
                const hasContent = item.content && item.content.trim().length > 0;
                nodes.add({
                    id: newId,
                    label: hasContent ? `*💡 ${item.title}*\n────────────────────\n${item.content}` : `*💡 ${item.title}*`,
                    baseTitle: item.title,
                    definition: item.content || null,
                    isExpandedDef: hasContent,
                    color: { background: '#fffbeb', border: '#f59e0b' },
                    x: parentPos.x, y: parentPos.y + 140,
                    widthConstraint: hasContent ? { minimum: 380, maximum: 460 } : { minimum: 150, maximum: 240 }
                });
                edges.add({ from: selectedNodeId, to: newId, label: 'se explica por' });
                createdCount++;
            });
            nodes.update({ id: selectedNodeId, isMystery: false });
            consumeNodes(createdCount);
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
        consumeNodes(createdCount);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1200);
    } catch { alert("Error al conectar con el servicio."); } finally { hideLoader(); }
});

// 3. OVERRIDE de "Usar Definición" (Pistas interactivas clickeables)
function formatInteractiveDefinition(rawText, parentNodeId) {
    const safeHtml = rawText.replace(/\n/g, '<br>');
    return safeHtml.replace(/\[\[(.*?)\]\]/g, (match, term) => {
        return `<button class="inline-flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-400/50 px-1.5 py-0.5 rounded-md font-semibold text-xs transition-all cursor-pointer mx-0.5 btn-inline-concept" data-term="${term}" data-parent="${parentNodeId}">⚡ ${term}</button>`;
    });
}

overrideClick('btnMenuOpenPanel', async () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    const currentNode = nodes.get(selectedNodeId);
    const title = currentNode.baseTitle || selectedNodeId;
    let definitionText = currentNode.definition;

    if (!definitionText || !definitionText.includes('[[')) {
        showLoader('Redactando definición interactiva...');
        try {
            const response = await fetch('/.netlify/functions/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'define',
                    topic: title,
                    interactive: true,
                    contextPath: getContextPath(selectedNodeId),
                    documentContext: globalDocumentContext || currentDocumentText
                })
            });
            const data = await response.json();
            definitionText = data.definition;
            nodes.update({ id: selectedNodeId, definition: definitionText, baseTitle: title });
        } catch { alert("Error al obtener definición."); return; } finally { hideLoader(); }
    }

    detailNodeTitle.innerText = title;
    nodeDetailContent.innerHTML = `
        <p class="mb-2 font-bold text-amber-400 text-base">${title}</p>
        <p class="text-[11px] text-slate-400 mb-4">💡 Haz clic en los conceptos resaltados con ⚡ para agregarlos al mapa.</p>
        <div class="leading-relaxed text-slate-200">${formatInteractiveDefinition(definitionText, selectedNodeId)}</div>
    `;
    nodeDetailPanel.classList.remove('hidden');
    activeNodeDetailId = selectedNodeId;

    nodeDetailContent.querySelectorAll('.btn-inline-concept').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const term = e.currentTarget.dataset.term;
            const parentId = e.currentTarget.dataset.parent;
            if (!checkBalance(1)) return;

            const parentPos = network.getPositions([parentId])[parentId] || network.getViewPosition();
            if (!nodes.get(term)) {
                nodes.add({
                    id: term, label: `*${term}*`, baseTitle: term, color: getRandomColor(),
                    x: parentPos.x + (Math.random() * 180 - 90), y: parentPos.y + 140,
                    fixed: { x: false, y: false }
                });
                edges.add({ from: parentId, to: term, label: 'involucra' });
                trackNodeUsage(term);
                consumeNodes(1);
                network.focus(term, { scale: 1.0, animation: { duration: 500 } });
            }
            e.currentTarget.innerText = `✓ ${term}`;
        });
    });
});

// 4. EXTENSIONES NUEVAS: Antítesis, Reto Socrático y Estadísticas de Tu Cosmos
document.getElementById('btnMenuAntithesis')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    if (!requireAuth("explorar antítesis y pensamiento crítico")) return;
    if (!checkBalance(2)) return;

    const originId = selectedNodeId;
    const topicName = nodes.get(originId).baseTitle || originId;

    showLoader('Buscando contradicciones y límites teóricos...');
    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'antithesis', topic: topicName, contextPath: getContextPath(originId) })
        });
        const data = await response.json();
        const parentPos = network.getPositions([originId])[originId];
        network.setOptions({ physics: { enabled: true } });

        let count = 0;
        (data.critiques || []).forEach((crit, idx) => {
            const cId = crit.id || `anti_${Date.now()}_${idx}`;
            if (!nodes.get(cId)) {
                nodes.add({
                    id: cId, label: `*⚡ Antítesis:*\n${crit.label}`, baseTitle: crit.label,
                    color: { background: '#fff1f2', border: '#f43f5e' },
                    x: parentPos.x + ((idx - 1) * 180), y: parentPos.y + 150, fixed: { x: false, y: false }
                });
                edges.add({ from: originId, to: cId, label: crit.relationship, color: { color: '#f43f5e' }, dashes: [5, 5] });
                trackNodeUsage(crit.label); count++;
            }
        });
        consumeNodes(count);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1200);
    } catch { alert("Error al generar antítesis."); } finally { hideLoader(); }
});

document.getElementById('btnMenuChallenge')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    if (!requireAuth("activar el reto socrático")) return;

    const originId = selectedNodeId;
    const topicName = nodes.get(originId).baseTitle || originId;

    showLoader('Formulando desafío socrático...');
    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'socratic_question', topic: topicName, contextPath: getContextPath(originId) })
        });
        const data = await response.json();

        detailNodeTitle.innerText = `🧠 Reto Socrático: ${topicName}`;
        nodeDetailContent.innerHTML = `
            <div class="bg-slate-800/90 border border-emerald-500/40 rounded-xl p-4 mb-4">
                <p class="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">Desafío de Comprensión</p>
                <p class="text-slate-100 text-sm font-medium leading-relaxed">${data.question}</p>
            </div>
            <textarea id="socraticInput" rows="4" placeholder="Escribe tu deducción o argumento aquí..." class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 mb-3"></textarea>
            <button id="btnSubmitSocratic" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-lg">
                Validar mi Razonamiento (+Nodo de Dominio)
            </button>
            <div id="socraticFeedbackBox" class="hidden mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 leading-relaxed"></div>
        `;
        nodeDetailPanel.classList.remove('hidden');

        document.getElementById('btnSubmitSocratic')?.addEventListener('click', async () => {
            const userAnswer = document.getElementById('socraticInput').value.trim();
            if (userAnswer.length < 5) return alert("Escribe una respuesta breve para evaluar.");
            if (!checkBalance(1)) return;

            showLoader('Evaluando tu argumento...');
            try {
                const evalRes = await fetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'socratic_evaluate', topic: topicName, question: data.question, userAnswer })
                });
                const evalData = await evalRes.json();

                const fbBox = document.getElementById('socraticFeedbackBox');
                fbBox.innerHTML = `<p class="font-bold text-amber-400 mb-1">🌟 Veredicto:</p><p>${evalData.feedback}</p>`;
                fbBox.classList.remove('hidden');

                const parentPos = network.getPositions([originId])[originId];
                const masteryId = `mastery_${Date.now()}`;
                nodes.add({
                    id: masteryId, label: `*🏆 Dominio:*\n${evalData.masteryNodeTitle}`,
                    baseTitle: evalData.masteryNodeTitle,
                    definition: `Tu síntesis: "${userAnswer}"\n\nRetroalimentación: ${evalData.feedback}`,
                    color: { background: '#fefce8', border: '#eab308' }, borderWidth: 2.5,
                    x: parentPos.x, y: parentPos.y + 150, fixed: { x: false, y: false }
                });
                edges.add({ from: originId, to: masteryId, label: 'síntesis propia', color: { color: '#eab308' } });
                consumeNodes(1);
            } catch { alert("Error al evaluar."); } finally { hideLoader(); }
        });
    } catch { alert("Error al iniciar el reto."); } finally { hideLoader(); }
});

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