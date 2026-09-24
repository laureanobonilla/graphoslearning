// ==========================================
// 1. INICIALIZACIÓN DEL GRAFO (VIS.JS)
// ==========================================
const container = document.getElementById('network-container');
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);
let currentDocumentText = "";
let selectedDensity = 'auto'; // Ahora "auto" es el por defecto
let sourceNodeForSynergy = null;
const synergyBanner = document.getElementById('synergyBanner');
let network = new vis.Network(container, { nodes, edges }, {
    layout: { hierarchical: false },
    physics: {
        enabled: false,
        solver: 'repulsion',
        repulsion: { nodeDistance: 220, springLength: 200, springConstant: 0.05 }
    },
    nodes: { 
        shape: 'box', 
        margin: { top: 16, bottom: 16, left: 20, right: 20 },
        font: { 
            multi: 'md', 
            size: 18, // Letra más grande para el estilo a mano
            face: 'Kalam, cursive', 
            color: '#1e293b',
            bold: { color: '#0f172a', size: 20, face: 'Kalam' } 
        },
        borderWidth: 2,
        color: {
            border: '#f59e0b', // Naranja/Amarillo cálido
            background: '#fef08a', // Fondo estilo Post-it amarillo
            highlight: { border: '#ea580c', background: '#fde047' },
            hover: { border: '#fb923c', background: '#fef9c3' }
        },
        shadow: { enabled: true, color: 'rgba(0, 0, 0, 0.15)', size: 10, x: 4, y: 4 },
        shapeProperties: { 
            borderRadius: 25, // Bordes muy redondeados (casi pastilla)
            borderDashes: [8, 4] // Efecto de trazado a lápiz/marcador discontinuo
        }
    },
    edges: { 
        arrows: { to: { enabled: true, scaleFactor: 0.8 } },
        color: { color: '#94a3b8', highlight: '#64748b', hover: '#cbd5e1' },
        font: { 
            size: 14, 
            face: 'Kalam, cursive',
            color: '#475569', 
            strokeWidth: 3, 
            strokeColor: '#fbfcfd',
            align: 'middle'
        },
        width: 2,
        dashes: [6, 4], // Flechas punteadas dinámicas
        smooth: { type: 'curvedCW', roundness: 0.3 } // Líneas curvas orgánicas en vez de rectas
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
// ==========================================
// PERSISTENCIA AUTOMÁTICA EN BINS (JSONBIN)
// ==========================================
let currentProjectId = localStorage.getItem('gk_current_project_id');

async function saveCurrentProjectToBin() {
    if (isAdmin) return;

    const userIdentifier = currentUser ? currentUser.id : sessionId;
    
    // Obtenemos el nombre o correo del usuario logueado, o "Invitado" si no ha iniciado sesión
    const userName = currentUser ? (currentUser.user_metadata?.full_name || currentUser.email) : "Invitado";

    const projectData = {
        owner: userName,
        email: currentUser ? currentUser.email : null,
        nodes: nodes.get(),
        edges: edges.get()
    };

    let projectTitle = "Mapa Conceptual";
    const allNodes = nodes.get();
    if (allNodes.length > 0) {
        projectTitle = allNodes[0].baseTitle || allNodes[0].label || "Mi Esquema";
    }

    try {
        const response = await fetch('/.netlify/functions/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: currentProjectId || null,
                title: projectTitle,
                data: projectData,
                user: userIdentifier
            })
        });

        const resData = await response.json();
        if (response.ok && resData.projectId) {
            currentProjectId = resData.projectId;
            if (currentUser) {
                localStorage.setItem(`gk_bin_user_${currentUser.id}`, currentProjectId);
            } else {
                localStorage.setItem('gk_guest_bin_id', currentProjectId);
            }
            localStorage.setItem('gk_current_project_id', currentProjectId);
        }
    } catch (err) {
        console.error("Error al sincronizar el proyecto en JSONBin:", err);
    }
}

// Disparar guardado con un pequeño retraso (debounce) cuando el grafo cambie
nodes.on('*', () => {
    clearTimeout(window._binSaveTimer);
    window._binSaveTimer = setTimeout(() => {
        saveCurrentProjectToBin();
    }, 2000);
});
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
// 4. AUTENTICACIÓN (NETLIFY IDENTITY), SALDOS Y TIENDA
// ==========================================
let currentUser = null;
let isAdmin = localStorage.getItem('gk_is_admin') === 'true';
let availableNodes = 0;

// 4.1 Inicializar Netlify Identity
if (window.netlifyIdentity) {
    netlifyIdentity.init({ locale: 'es' });
    
    // Sincronización inmediata al cargar
    currentUser = netlifyIdentity.currentUser();
    initializeBalance();
    updateAuthUI();
    
    netlifyIdentity.on('init', user => {
        currentUser = user;
        initializeBalance();
        updateAuthUI();
    });

    netlifyIdentity.on('login', user => {
        currentUser = user;
        document.getElementById('authWallModal').classList.add('hidden');
        document.getElementById('authWallModal').classList.remove('flex');
        netlifyIdentity.close();
        initializeBalance();
        updateAuthUI();
    });

    netlifyIdentity.on('logout', () => {
        currentUser = null;
        initializeBalance();
        updateAuthUI();
    });
}

function initializeBalance() {
    if (isAdmin) {
        updateCounterDisplay();
        return;
    }

    if (currentUser) {
        // Usuario logueado
        let storedBalance = parseInt(localStorage.getItem(`gk_balance_${currentUser.id}`), 10);
        if (isNaN(storedBalance)) {
            storedBalance = 50; 
            localStorage.setItem(`gk_balance_${currentUser.id}`, storedBalance);
        }
        availableNodes = storedBalance;
    } else {
        // Invitado (Guardamos su saldo temporal para que sí se rebajen y no se reinicien al recargar)
        let guestBalance = parseInt(localStorage.getItem('gk_guest_balance'), 10);
        if (isNaN(guestBalance)) {
            guestBalance = 15;
            localStorage.setItem('gk_guest_balance', guestBalance);
        }
        availableNodes = guestBalance;
    }
    updateCounterDisplay();
}

function updateAuthUI() {
    const loginText = document.getElementById('loginText');
    const userStatusDot = document.getElementById('userStatusDot');
    if (!loginText || !userStatusDot) return;
    
    if (currentUser) {
        loginText.innerText = currentUser.user_metadata?.full_name?.split(' ')[0] || "Mi Cuenta";
        userStatusDot.className = 'w-2 h-2 rounded-full bg-indigo-500';
    } else {
        loginText.innerText = "Iniciar Sesión";
        userStatusDot.className = 'w-2 h-2 rounded-full bg-slate-300';
    }
}

// 4.2 Interacciones de Autenticación
// 4.2 Interacciones de Autenticación
document.getElementById('btnLogin')?.addEventListener('click', () => {
    if (currentUser) netlifyIdentity.open();
    else netlifyIdentity.open('login');
});

// Botón de Continuar (Cierra el muro y abre Netlify)
document.getElementById('btnTriggerNetlifyLogin')?.addEventListener('click', () => {
    const wallModal = document.getElementById('authWallModal');
    if (wallModal) {
        wallModal.classList.add('hidden');
        wallModal.classList.remove('flex');
    }
    netlifyIdentity.open('login');
});

// Botón de Volver al mapa (Solo cierra el muro)
document.getElementById('closeAuthWall')?.addEventListener('click', () => {
    const wallModal = document.getElementById('authWallModal');
    if (wallModal) {
        wallModal.classList.add('hidden');
        wallModal.classList.remove('flex');
    }
});

function requireAuth(actionDescription) {
    if (currentUser || isAdmin) return true;
    
    const reasonEl = document.getElementById('authWallReason');
    if(reasonEl) reasonEl.innerText = actionDescription;
    
    const wallModal = document.getElementById('authWallModal');
    if (wallModal) {
        wallModal.classList.remove('hidden');
        wallModal.classList.add('flex');
    }
    if (actionMenu) actionMenu.classList.add('hidden');
    return false;
}

// 4.3 Control de Saldo y Tienda
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
    } else if (availableNodes < 10 && currentUser) {
        dot.className = 'w-2 h-2 rounded-full bg-amber-500';
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
    }
}

function consumeNodes(amount) {
    if (isAdmin) return;
    
    availableNodes -= amount;
    if (availableNodes < 0) availableNodes = 0;
    
    // Aquí es donde se garantiza el guardado correcto tanto para invitados como usuarios
    if (currentUser) {
        localStorage.setItem(`gk_balance_${currentUser.id}`, availableNodes);
    } else {
        localStorage.setItem('gk_guest_balance', availableNodes);
    }
    
    updateCounterDisplay();
}

function checkBalance(cost) {
    if (isAdmin) return true;
    
    if (availableNodes < cost) {
        if (!currentUser) {
            requireAuth("procesar este esquema");
        } else {
            if (actionMenu) actionMenu.classList.add('hidden');
            openStore();
        }
        return false;
    }
    return true;
}

function openStore() {
    storeModal.classList.remove('hidden');
    storeModal.classList.add('flex');
}

function closeStoreModal() {
    storeModal.classList.add('hidden');
    storeModal.classList.remove('flex');
}

// 4.4 Eventos Preservados (Sinergia, Tienda y Admin)
document.getElementById('btnMenuSynergy')?.addEventListener('click', () => {
    sourceNodeForSynergy = selectedNodeId;
    actionMenu.classList.add('hidden');
    synergyBanner.classList.remove('hidden');
});

synergyBanner?.addEventListener('click', () => {
    sourceNodeForSynergy = null;
    synergyBanner.classList.add('hidden');
});

document.getElementById('nodeCounterBtn')?.addEventListener('click', openStore);
document.getElementById('closeStore')?.addEventListener('click', closeStoreModal);

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
let selectedPrice = "5.00";
let selectedNodeAmount = 200;

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
        style: { 
            layout: 'vertical', // Vertical permite que se desplieguen los botones de tarjeta integrados
            color: 'gold', 
            shape: 'rect', 
            label: 'checkout', // Cambiado a checkout para abrir pasarela general de pago y tarjeta
            height: 45 
        },
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

                showLoader('Registrando licencia y actualizando cuenta...');
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
                if (currentUser) {
                    localStorage.setItem(`gk_balance_${currentUser.id}`, availableNodes);
                } else {
                    localStorage.setItem('gk_balance', availableNodes);
                }
                
                await saveCurrentProjectToBin();

                updateCounterDisplay();
                closeStoreModal();

                alert(`¡Pago completado! Se agregaron ${selectedNodeAmount} nodos a tu cuenta.\nTu clave es: ${licenseKey}`);
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

// ==========================================
// FUNCIÓN PARA INSERTAR UN NODO INDIVIDUAL (Lienzo Ocupado)
// ==========================================
function insertSingleNode(topic) {
    if (!checkBalance(1)) return;

    // Buscamos el centro de la cámara y lo desplazamos ligeramente a la derecha 
    // para que no caiga exactamente encima del nodo que el usuario esté mirando
    const viewCenter = network.getViewPosition();
    const spawnX = viewCenter.x + 200 + (Math.random() * 50); 
    const spawnY = viewCenter.y + (Math.random() * 100 - 50);

    nodes.add({ 
        id: topic, 
        label: `*${topic}*`, 
        baseTitle: topic, 
        x: spawnX, 
        y: spawnY,
        fixed: { x: false, y: false },
        color: { background: '#ffffff', border: '#e2e8f0' } // Estilo de nodo base
    });

    trackNodeUsage(topic);
    consumeNodes(1);
    topicInput.value = '';

    // Llevamos la cámara suavemente hacia el nuevo nodo
    setTimeout(() => {
        network.focus(topic, {
            scale: 1.0,
            animation: { duration: 600, easingFunction: 'easeInOutQuad' }
        });
    }, 50);
}

// ==========================================
// EVENTOS DE ENTRADA (Controlador de Flujo)
// ==========================================
function handleTopicInput() {
    const topic = topicInput.value.trim();
    if (!topic) return;

    if (nodes.length === 0) {
        // Lienzo en blanco: Despliega el poder de la IA con un árbol completo
        generateFullSchemaFromTopic(topic);
    } else {
        // Lienzo en uso: Solo inserta la pieza para no destruir el trabajo
        insertSingleNode(topic);
    }
}

// Evento del botón Generar de la barra
document.getElementById('btnGenerate')?.addEventListener('click', handleTopicInput);

// Soporte para tecla Enter en el input
document.getElementById('topicInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleTopicInput();
});

// ==========================================
// 14. PANTALLA DE BIENVENIDA Y SORPRÉNDEME
// ==========================================
const welcomeScreen = document.getElementById('welcomeScreen');
let hasDismissedWelcomeScreen = false;

function dismissWelcomeScreen() {
    if (hasDismissedWelcomeScreen) return;
    welcomeScreen.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => {
        welcomeScreen.classList.add('hidden');
        hasDismissedWelcomeScreen = true;
    }, 500);
}

// Cerrar al hacer clic en cualquier parte fuera de la caja central del modal
welcomeScreen?.addEventListener('click', (e) => {
    if (e.target === welcomeScreen) {
        dismissWelcomeScreen();
    }
});

topicInput?.addEventListener('focus', dismissWelcomeScreen);
nodes.on('*', () => {
    if (nodes.length > 0 && !hasDismissedWelcomeScreen) {
        dismissWelcomeScreen();
    }
});

const hookTopics = [
    "La Paradoja de Fermi", "El Mito de la Caverna", "Computación Cuántica",
    "Filosofía Estoica", "Neuroplasticidad", "Inteligencia Artificial General",
    "Economía Conductual", "La Teoría de Cuerdas", "Imperio Romano"
];

// Variable para controlar que la ventana de bienvenida solo salga al inicio
let hasDismissedWelcomeScreen = false;


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
    // CORRECCIÓN: Convertir los IDs internos a los textos reales para la IA
    return path.map(id => {
        const n = nodes.get(id);
        return n ? (n.baseTitle || id) : id;
    }).join(' > ');
}

document.getElementById('btnMenuExpand').addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    if (!requireAuth("profundizar en conceptos relacionados")) return; // <-- GUARDIA
    // ...resto del código

    const maxNodes = parseInt(document.getElementById('nodeCount').value, 10) || 3;
    if (!checkBalance(maxNodes)) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    // CORRECCIÓN: Usar el texto real, no el ID
    const topicName = currentNode.baseTitle || selectedNodeId;

    if (currentNode && currentNode.expanded) return;
    showLoader('Generando conceptos conexos...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'expand', 
                topic: topicName, // Enviamos el texto real
                contextPath, 
                maxNodes,
                documentContext: globalDocumentContext || currentDocumentText})
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
    const currentNode = nodes.get(selectedNodeId);
    // CORRECCIÓN: Usar el texto real
    const topicName = currentNode.baseTitle || selectedNodeId;

    showLoader('Buscando casos prácticos...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'examples', 
                topic: topicName, // Enviamos el texto real
                contextPath, 
                maxNodes,
                documentContext: globalDocumentContext || currentDocumentText  })
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
                        background: '#fafaf9', border: '#d6d3d1',
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
// ==========================================
// GESTIÓN DE DEFINICIONES Y CONTRACCIÓN DE NODOS
// ==========================================
document.getElementById('btnMenuDefine')?.addEventListener('click', async () => {
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const currentNode = nodes.get(selectedNodeId);
    const title = currentNode.baseTitle || selectedNodeId;

    // 1. SI YA TIENE DEFINICIÓN: Alternar entre contraer (solo título) o expandir (mostrar en grafo) y abrir panel lateral
    if (currentNode && currentNode.definition) {
        if (currentNode.isExpandedDef) {
            // Contraer el nodo en el grafo (mostrar solo título base)
            nodes.update({
                id: selectedNodeId,
                label: `*${title}*`,
                isExpandedDef: false,
                widthConstraint: { minimum: 150, maximum: 250 },
                heightConstraint: { minimum: 50, maximum: 90 }
            });
            // Si el panel lateral estaba mostrando este nodo, lo cerramos
            if (activeNodeDetailId === selectedNodeId) {
                nodeDetailPanel.classList.add('hidden');
                activeNodeDetailId = null;
            }
        } else {
            // Expandir el nodo en el grafo con su definición
            const expandedLabel = `*${title}*\n────────────────────\n${currentNode.definition}`;
            nodes.update({
                id: selectedNodeId,
                label: expandedLabel,
                isExpandedDef: true,
                widthConstraint: { minimum: 220, maximum: 280 },
                heightConstraint: { minimum: 150, maximum: 220 }
            });
            
            // Abrir panel lateral izquierdo de lectura profunda
            detailNodeTitle.innerText = title;
            nodeDetailContent.innerHTML = `<p class="mb-3 font-semibold text-amber-200">${title}</p><p>${currentNode.definition.replace(/\n/g, '<br>')}</p>`;
            nodeDetailPanel.classList.remove('hidden');
            activeNodeDetailId = selectedNodeId;
        }
        return;
    }

    // 2. SI NO TIENE DEFINICIÓN: Consultarla a la IA por primera vez
    const contextPath = getContextPath(selectedNodeId);
    showLoader('Redactando definición...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'define', 
                topic: title, 
                contextPath,
                documentContext: (globalDocumentContext || currentDocumentText || "").slice(0, 6000) 
            })
        });
        
        const responseText = await response.text();
        if (!response.ok) throw new Error(responseText);
        
        const data = JSON.parse(responseText);
        const newLabel = `*${title}*\n────────────────────\n${data.definition}`;

        // Guardamos la definición en el nodo y lo marcamos como expandido
        nodes.update({ 
            id: selectedNodeId, 
            baseTitle: title,
            definition: data.definition, 
            label: newLabel,
            isExpandedDef: true,
            shape: 'box',
            fixed: { x: false, y: false },
            widthConstraint: { minimum: 220, maximum: 280 },
            heightConstraint: { minimum: 150, maximum: 220 }
        });

        // Abrir panel lateral de lectura profunda automáticamente
        detailNodeTitle.innerText = title;
        nodeDetailContent.innerHTML = `<p class="mb-3 font-semibold text-amber-200">${title}</p><p>${data.definition.replace(/\n/g, '<br>')}</p>`;
        nodeDetailPanel.classList.remove('hidden');
        activeNodeDetailId = selectedNodeId;

    } catch (err) {
        console.error("Error al obtener la definición:", err);
        alert("Error al obtener la definición. Revisa la consola.");
    } finally {
        hideLoader();
    }
});

// Al cerrar el panel lateral de detalles, contraemos opcionalmente el nodo vinculado
closeDetailPanel?.addEventListener('click', () => {
    if (activeNodeDetailId) {
        const currentNode = nodes.get(activeNodeDetailId);
        if (currentNode) {
            const title = currentNode.baseTitle || activeNodeDetailId;
            nodes.update({
                id: activeNodeDetailId,
                label: `*${title}*`,
                isExpandedDef: false,
                widthConstraint: { minimum: 150, maximum: 250 },
                heightConstraint: { minimum: 50, maximum: 90 }
            });
        }
    }
    nodeDetailPanel.classList.add('hidden');
    activeNodeDetailId = null;
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
    if (!requireAuth("analizar documentos extensos")) return; // <-- GUARDIA
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
// LÓGICA DE SINERGIA (FUSIÓN)
        if (sourceNodeForSynergy && sourceNodeForSynergy !== clickedNode) {
            const nodeA = nodes.get(sourceNodeForSynergy);
            const nodeB = nodes.get(clickedNode);
            
            const topicA = nodeA.baseTitle || sourceNodeForSynergy;
            const topicB = nodeB.baseTitle || clickedNode;
            
            sourceNodeForSynergy = null;
            synergyBanner.classList.add('hidden');

            showLoader('Calculando convergencia...');

            try {
                // Hacemos el fetch al nuevo endpoint
                const response = await fetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ 
                        action: 'synergy', 
                        topic: topicA, 
                        topicB: topicB,
                        density: selectedDensity 
                    })
                });
                const data = await response.json();

                // Calcular costo: 1 (Sinergia) + N (Rutas A) + M (Rutas B)
                const totalNodes = 1 + (data.pathsFromA?.length || 0) + (data.pathsFromB?.length || 0);
                if (!checkBalance(totalNodes)) return;

                // CONGELAMOS la red existente para que no se desacomode el árbol
                const existingNodes = nodes.get();
                nodes.update(existingNodes.map(n => ({ id: n.id, fixed: { x: true, y: true } })));
                // Encendemos las físicas SOLO para que los nuevos puentes se acomoden solos
                network.setOptions({ physics: { enabled: true } });

                const posA = network.getPositions([nodeA.id])[nodeA.id];
                const posB = network.getPositions([nodeB.id])[nodeB.id];
                
                // Ubicamos el nodo Sinergia exactamente en el punto medio
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                // 1. Crear nodo central Sinergia (Diseño estelar)
                const synNode = data.synergy;
                if (!nodes.get(synNode.id)) {
                    nodes.add({
                        id: synNode.id,
                        label: `*🌟 Sinergia:*\n${synNode.label}`,
                        baseTitle: synNode.label,
                        x: midX, y: midY,
                        fixed: { x: false, y: false },
                        color: { 
                            background: '#faf5ff', // fuchsia-50
                            border: '#d946ef',     // fuchsia-500
                            highlight: { background: '#fdf4ff', border: '#c026d3' }
                        },
                        font: { color: '#4a044e', bold: { color: '#701a75', size: 16 } },
                        borderWidth: 2,
                        shadow: { enabled: true, color: 'rgba(217, 70, 239, 0.2)', size: 20 }
                    });
                    trackNodeUsage(synNode.label);
                }

                // 2. Crear las rutas desde A
                (data.pathsFromA || []).forEach(bridge => {
                    if (!nodes.get(bridge.id)) {
                        nodes.add({
                            id: bridge.id, label: `*${bridge.label}*`, baseTitle: bridge.label,
                            x: posA.x + (midX - posA.x) / 2 + (Math.random() * 40 - 20),
                            y: posA.y + (midY - posA.y) / 2 + (Math.random() * 40 - 20),
                            fixed: { x: false, y: false },
                            color: { background: '#f8fafc', border: '#e2e8f0' }
                        });
                        trackNodeUsage(bridge.label);
                    }
                    edges.add({ from: nodeA.id, to: bridge.id, label: bridge.relFromA });
                    edges.add({ from: bridge.id, to: synNode.id, label: bridge.relToSynergy });
                });

                // 3. Crear las rutas desde B
                (data.pathsFromB || []).forEach(bridge => {
                    if (!nodes.get(bridge.id)) {
                        nodes.add({
                            id: bridge.id, label: `*${bridge.label}*`, baseTitle: bridge.label,
                            x: posB.x + (midX - posB.x) / 2 + (Math.random() * 40 - 20),
                            y: posB.y + (midY - posB.y) / 2 + (Math.random() * 40 - 20),
                            fixed: { x: false, y: false },
                            color: { background: '#f8fafc', border: '#e2e8f0' }
                        });
                        trackNodeUsage(bridge.label);
                    }
                    edges.add({ from: nodeB.id, to: bridge.id, label: bridge.relFromB });
                    edges.add({ from: bridge.id, to: synNode.id, label: bridge.relToSynergy });
                });

                consumeNodes(totalNodes);
                
                // Estabilizar el grafo y volver a congelar
                setTimeout(() => { stopPhysicsAndUnlock(); }, 1800);

            } catch (err) {
                console.error(err);
                alert("Error al procesar la convergencia.");
            } finally {
                hideLoader();
            }
            return;
        }
        // LÓGICA DE VINCULAR DOS NODOS
        if (sourceNodeForConnection && sourceNodeForConnection !== clickedNode) {
            const nodeA = nodes.get(sourceNodeForConnection);
            const nodeB = nodes.get(clickedNode);
            
            // CORRECCIÓN: Extraer nombres reales
            const topicA = nodeA.baseTitle || sourceNodeForConnection;
            const topicB = nodeB.baseTitle || clickedNode;
            
            sourceNodeForConnection = null;
            connectionBanner.classList.add('hidden');

            if (!checkBalance(1)) return;

            showLoader('Generando puente conceptual...');

            try {
                const response = await fetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'connect', topic: topicA, topicB: topicB })
                });
                const data = await response.json();

                const posA = network.getPositions([nodeA.id])[nodeA.id];
                const posB = network.getPositions([nodeB.id])[nodeB.id];
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
                
                edges.add({ from: nodeA.id, to: bridge.id, label: bridge.relFromA });
                edges.add({ from: bridge.id, to: nodeB.id, label: bridge.relToB });
            } catch {
                alert("Error al conectar los nodos.");
            } finally {
                hideLoader();
            }
            return;
        }

        // MOSTRAR MENÚ FLOTANTE

        selectedNodeId = clickedNode;
        const nodePosition = network.getPositions([selectedNodeId])[selectedNodeId];
        const DOMCoords = network.canvasToDOM(nodePosition);
        
        // Obtenemos las coordenadas relativas del contenedor del grafo en la pantalla
        const containerRect = container.getBoundingClientRect();
        
        // Posicionamos el menú sumando el offset del contenedor para que caiga exactamente sobre el nodo
        actionMenu.style.left = (containerRect.left + DOMCoords.x - 40) + 'px';
        actionMenu.style.top = (containerRect.top + DOMCoords.y - 60) + 'px';
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
// ==========================================
// MODO LECTOR ACTIVO - TEXTO LIBRE Y CONTEXTO
// ==========================================
const btnToggleReader = document.getElementById('btnToggleReader');
const readerPanel = document.getElementById('readerPanel');
const readerTextMode = document.getElementById('readerTextMode');
const selectionTooltip = document.getElementById('selectionTooltip');
const panelResizer = document.getElementById('panelResizer');
const tooltipPreview = document.getElementById('tooltipSelectedTextPreview');
const docContextInput = document.getElementById('docContextInput');

let globalDocumentContext = "";
let activeSelectedText = "";
let activeSelectionRange = null;

// Capturar el contexto global en tiempo real
docContextInput?.addEventListener('input', (e) => {
    globalDocumentContext = e.target.value.trim();
});

// Mostrar / Ocultar Panel Lector
btnToggleReader?.addEventListener('click', () => {
    readerPanel.classList.toggle('hidden');
    setTimeout(() => { if (typeof network !== 'undefined') network.redraw(); }, 200);
});

// Acceso rápido desde la pantalla de bienvenida
document.getElementById('btnWelcomeReader')?.addEventListener('click', () => {
    dismissWelcomeScreen();
    document.getElementById('btnToggleReader')?.click();
});

// Redimensionar panel izquierdo arrastrando el borde
let isResizing = false;
panelResizer?.addEventListener('mousedown', (e) => {
    isResizing = true;
    e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = e.clientX;
    if (newWidth > 250 && newWidth < window.innerWidth * 0.75) {
        readerPanel.style.width = `${newWidth}px`;
    }
});
window.addEventListener('mouseup', () => { isResizing = false; });

// Detectar selección de texto en el panel libre
readerTextMode?.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 2) {
        activeSelectedText = text;
        activeSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

        if (tooltipPreview) tooltipPreview.innerText = `"${text.substring(0, 25)}..."`;

        selectionTooltip.style.left = `${e.pageX - 60}px`;
        selectionTooltip.style.top = `${e.pageY - 70}px`;
        selectionTooltip.classList.remove('hidden');
    } else {
        selectionTooltip.classList.add('hidden');
    }
});

// Ocultar tooltip al hacer clic fuera
document.addEventListener('mousedown', (e) => {
    if (!selectionTooltip.contains(e.target) && !readerPanel.contains(e.target)) {
        selectionTooltip.classList.add('hidden');
    }
});

// Vincular texto seleccionado a nodo del grafo (Interacción bidireccional)
function highlightAndBindSelectedText(spanElement, nodeId) {
    spanElement.style.cursor = 'pointer';
    spanElement.title = "Haz clic para enfocar este nodo en el grafo";
    
    spanElement.addEventListener('click', () => {
        if (nodes.get(nodeId)) {
            network.selectNodes([nodeId]);
            network.focus(nodeId, {
                scale: 1.2,
                animation: { duration: 600, easingFunction: 'easeInOutQuad' }
            });
            
            selectedNodeId = nodeId;
            const pos = network.getPositions([nodeId])[nodeId];
            const domCoords = network.canvasToDOM(pos);
            actionMenu.style.left = domCoords.x + 'px';
            actionMenu.style.top = (domCoords.y - 40) + 'px';
            actionMenu.classList.remove('hidden');
        }
    });
}

function highlightSelectedTextAndLink(nodeId) {
    if (!activeSelectionRange) return;
    try {
        const span = document.createElement('span');
        span.className = "bg-amber-200/95 hover:bg-amber-300 text-slate-900 rounded px-1 transition-colors cursor-pointer border-b-2 border-amber-400";
        span.appendChild(activeSelectionRange.extractContents());
        activeSelectionRange.insertNode(span);
        
        highlightAndBindSelectedText(span, nodeId);
    } catch (err) {
        console.error("Error al resaltar texto:", err);
    }
}

function createNodeFromReader(actionType) {
    if (!activeSelectedText) return;
    selectionTooltip.classList.add('hidden');

    const topic = activeSelectedText;
    const rangeToHighlight = activeSelectionRange;
    
    activeSelectedText = "";
    activeSelectionRange = null;

    if (!checkBalance(1)) return;

    const viewCenter = network.getViewPosition();
    const spawnX = viewCenter.x + (Math.random() * 100 - 50);
    const spawnY = viewCenter.y + (Math.random() * 100 - 50);

    const nodeId = topic;

    if (!nodes.get(nodeId)) {
        nodes.add({
            id: nodeId,
            label: `*📄 Lector:*\n${topic}`,
            baseTitle: topic,
            x: spawnX,
            y: spawnY,
            fixed: { x: false, y: false },
            color: { background: '#fef3c7', border: '#f59e0b' }
        });
        trackNodeUsage(topic);
        consumeNodes(1);
    }

    activeSelectionRange = rangeToHighlight;
    highlightSelectedTextAndLink(nodeId);

    selectedNodeId = nodeId;
    if (actionType === 'expand') {
        document.getElementById('btnMenuExpand').click();
    } else if (actionType === 'examples') {
        document.getElementById('btnMenuExamples').click();
    } else if (actionType === 'define') {
        document.getElementById('btnMenuDefine').click();
    }
}

document.getElementById('tipBtnExpand')?.addEventListener('click', () => createNodeFromReader('expand'));
document.getElementById('tipBtnExamples')?.addEventListener('click', () => createNodeFromReader('examples'));
document.getElementById('tipBtnDefine')?.addEventListener('click', () => createNodeFromReader('define'));

// ==========================================
// PANEL LATERAL DE DEFINICIÓN Y EXTRACCIÓN DE NODOS
// ==========================================
const nodeDetailPanel = document.getElementById('nodeDetailPanel');
const detailNodeTitle = document.getElementById('detailNodeTitle');
const nodeDetailContent = document.getElementById('nodeDetailContent');
const closeDetailPanel = document.getElementById('closeDetailPanel');
const nodeSelectionTooltip = document.getElementById('nodeSelectionTooltip');
const nodeTooltipPreview = document.getElementById('nodeTooltipPreview');
const nodeBtnExtractChild = document.getElementById('nodeBtnExtractChild');

let activeNodeDetailId = null;
let activeNodeSelectionRange = null;
let activeNodeSelectedText = "";

// Cerrar panel de detalle
closeDetailPanel?.addEventListener('click', () => {
    nodeDetailPanel.classList.add('hidden');
    activeNodeDetailId = null;
});

// Modificamos el evento de clic en los nodos para que además abra este panel si tiene definición
// (O puedes abrirlo siempre que el nodo tenga definición o al hacer doble clic / opción del menú)
document.getElementById('btnMenuDefine')?.addEventListener('click', () => {
    // Cuando cargues la definición, además de actualizar el canvas, abrimos el panel lateral para lectura profunda
    if (selectedNodeId) {
        const node = nodes.get(selectedNodeId);
        if (node && node.definition) {
            detailNodeTitle.innerText = node.baseTitle || selectedNodeId;
            nodeDetailContent.innerHTML = `<p class="mb-3 font-semibold text-amber-200">${node.baseTitle}</p><p>${node.definition.replace(/\n/g, '<br>')}</p>`;
            nodeDetailPanel.classList.remove('hidden');
            activeNodeDetailId = selectedNodeId;
        }
    }
});

// Detectar selección de texto dentro del panel de definición del nodo
nodeDetailContent?.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 2) {
        activeNodeSelectedText = text;
        activeNodeSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

        if (nodeTooltipPreview) nodeTooltipPreview.innerText = `"${text.substring(0, 20)}..."`;

        nodeSelectionTooltip.style.left = `${e.offsetX - 20}px`;
        nodeSelectionTooltip.style.top = `${e.offsetY - 50}px`;
        nodeSelectionTooltip.classList.remove('hidden');
    } else {
        nodeSelectionTooltip.classList.add('hidden');
    }
});

// Crear nodo hijo a partir del texto seleccionado en la definición
nodeBtnExtractChild?.addEventListener('click', () => {
    if (!activeNodeSelectedText || !activeNodeDetailId) return;
    nodeSelectionTooltip.classList.add('hidden');

    const childTopic = activeNodeSelectedText;
    activeNodeSelectedText = "";
    activeNodeSelectionRange = null;

    if (!checkBalance(1)) return;

    const parentPos = network.getPositions([activeNodeDetailId])[activeNodeDetailId];
    const newId = childTopic;

    if (!nodes.get(newId)) {
        nodes.add({
            id: newId,
            label: `*${childTopic}*`,
            baseTitle: childTopic,
            x: parentPos.x + 250,
            y: parentPos.y + (Math.random() * 100 - 50),
            fixed: { x: false, y: false },
            widthConstraint: { minimum: 200, maximum: 260 },
            heightConstraint: { minimum: 80, maximum: 160 }
        });

        // Creamos la flecha directa desde el nodo padre (origen de la definición) hacia este nuevo sub-concepto
        edges.add({
            from: activeNodeDetailId,
            to: newId,
            label: 'deriva en'
        });

        trackNodeUsage(childTopic);
        consumeNodes(1);
    }
});