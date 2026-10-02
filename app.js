// ==========================================
// 0. COBRO MANUAL (temporal, mientras PayPal no habilite tarjeta de invitado)
// ==========================================
// La tienda ya NO muestra el botón de pago automático: muestra estos datos de
// contacto para que el cliente escriba, pague por otro medio, y tú le
// acredites los nodos a mano (ver LEEME_ETAPA_2.md, sección 11). Reemplaza
// estos 2 valores por los tuyos reales antes de publicar.
const SUPPORT_WHATSAPP_NUMBER = '50600000000'; // Código de país + número, solo dígitos, sin "+" ni espacios (ej. Costa Rica: 506XXXXXXXX) — PENDIENTE: poner el número real
const SUPPORT_EMAIL = 'bonillapretiz@gmail.com';
// Déjalo en false: la integración de PayPal (createOrder/captureOrder, ya
// verificada en el servidor) queda intacta y sin usar. Cuando PayPal habilite
// el pago con tarjeta de invitado para tu cuenta (o integres Paddle/Lemon
// Squeezy), basta con poner esto en true para que el botón vuelva a aparecer.
const AUTOMATIC_PAYMENTS_ENABLED = false;

// ==========================================
// 1. INICIALIZACIÓN DEL GRAFO (VIS.JS)
// ==========================================
const container = document.getElementById('network-container');
let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);
let currentDocumentText = "";
let selectedDensity = 'auto';
let sourceNodeForSynergy = null;
const synergyBanner = document.getElementById('synergyBanner');

// Paleta pensada para flotar sobre el lienzo oscuro ("cosmos"): tarjetas claras
// que se leen como pequeñas fichas iluminadas, no el pastel tenue de antes
// (que estaba calibrado para un fondo blanco).
const elegantPalette = [
    { background: '#fdfbf7', border: '#cbd5e1' }, // Crema / Marfil
    { background: '#eef2ff', border: '#a5b4fc' }, // Lavanda-azul
    { background: '#ecfeff', border: '#67e8f9' }, // Celeste cristal
    { background: '#f5f3ff', border: '#c4b5fd' }, // Lavanda
    { background: '#fffbeb', border: '#fcd34d' }, // Amarillo cálido
    { background: '#ecfdf5', border: '#6ee7b7' }, // Menta
    { background: '#fff1f2', border: '#fda4af' }  // Rosa
];

function getRandomColor() {
    return elegantPalette[Math.floor(Math.random() * elegantPalette.length)];
}

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
            size: 16,
            face: 'Inter, sans-serif',
            color: '#334155',
            bold: { color: '#0f172a', size: 18, face: 'Inter, sans-serif' }
        },
        borderWidth: 1.5,
        // Sombra oscura clásica → resplandor: sobre fondo negro una sombra negra
        // es invisible; un halo tenue es lo que hace que la tarjeta "flote".
        shadow: { enabled: true, color: 'rgba(79, 209, 197, 0.18)', size: 14, x: 0, y: 0 },
        shapeProperties: { borderRadius: 12 }
    },
    edges: {
        arrows: { to: { enabled: true, scaleFactor: 0.8 } },
        color: { color: '#4a5178', highlight: '#4fd1c5', hover: '#8b7cf6' },
        font: {
            size: 14, face: 'Inter, sans-serif', color: '#c7d2e8', strokeWidth: 3,
            strokeColor: '#0a0e1a', align: 'middle'
        },
        width: 1.5,
        dashes: [4, 4],
        smooth: { type: 'dynamic' } // Curvatura orgánica y adaptativa para que no se vean todas iguales
    },
    interaction: { hover: true, multiselect: true, selectConnectedEdges: true }
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
const loaderOverlay = document.getElementById('loaderOverlay');
const loaderText = document.getElementById('loaderText');
const connectionBanner = document.getElementById('connectionBanner');
const storeModal = document.getElementById('storeModal');

// Rellena el bloque de "compra manual" (paquete elegido, correo del usuario,
// enlaces de WhatsApp/correo ya con el mensaje armado) cada vez que se abre
// la tienda o se cambia de paquete.
function updateManualPurchaseBox() {
    const selected = document.querySelector('input[name="nodePackage"]:checked');
    const labelEl = selected?.closest('label');
    const title = labelEl?.querySelector('p.font-bold')?.innerText?.trim() || 'Paquete';
    const nodesText = labelEl?.querySelector('p.text-indigo-600')?.innerText?.trim() || '';
    const price = selected?.dataset?.price || '';
    const packageLabel = `${title} (${nodesText}) — $${price}`;
    const userEmail = (typeof currentUser !== 'undefined' && currentUser?.email) ? currentUser.email : '(tu correo de la cuenta)';

    // El nombre corto (sin precio) es lo que se usa en la frase "Para activar
    // el Pase de Estudio...". El precio/nodos solo hace falta en el mensaje
    // que se manda, no repetido en esa frase.
    const labelSpan = document.getElementById('manualPurchasePackageLabel');
    if (labelSpan) labelSpan.innerText = title;

    const emailAddressEl = document.getElementById('manualPurchaseEmailAddress');
    if (emailAddressEl) emailAddressEl.innerText = SUPPORT_EMAIL;

    const message = `Hola, quiero activar el paquete "${packageLabel}" en mi cuenta de Graphikosmos. Mi correo de la cuenta es: ${userEmail}`;
    const waLink = document.getElementById('manualPurchaseWhatsapp');
    const mailLink = document.getElementById('manualPurchaseEmail');
    if (waLink) waLink.href = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    if (mailLink) mailLink.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Activar paquete — ' + packageLabel)}&body=${encodeURIComponent(message)}`;
}
document.querySelectorAll('input[name="nodePackage"]').forEach(r => r.addEventListener('change', updateManualPurchaseBox));

function openStoreModal() {
    storeModal?.classList.remove('hidden');
    storeModal?.classList.add('flex');
    updateManualPurchaseBox();
}

const authWallModal = document.getElementById('authWallModal');
const landscapeToggle = document.getElementById('landscapeToggle');
const mainHeader = document.getElementById('mainHeader');

let selectedNodeId = null;
let sourceNodeForConnection = null;
// Pila de niveles cuando se navega dentro de un subesquema (ver sección
// "SUBESQUEMAS" más abajo). Cada elemento es el nivel "padre" al que se vuelve
// al salir: { nodes, edges, collapsedNodeId, label }.
let schemeStack = [];

let loaderInterval = null;

function showLoader(msg) {
    if (loaderText && loaderOverlay) {
        loaderText.innerText = msg;
        loaderOverlay.classList.add('show');
        
        const steps = [
            msg,
            "Analizando jerarquía conceptual...",
            "Conectando nodos y relaciones...",
            "Organizando niveles en el lienzo..."
        ];
        let stepIdx = 0;
        clearInterval(loaderInterval);
        loaderInterval = setInterval(() => {
            stepIdx = (stepIdx + 1) % steps.length;
            loaderText.innerText = steps[stepIdx];
        }, 2200);
    }
}

function hideLoader() {
    clearInterval(loaderInterval);
    if (loaderOverlay) {
        loaderOverlay.classList.remove('show');
    }
}

landscapeToggle?.addEventListener('click', () => {
    mainHeader.classList.toggle('force-show');
    if (mainHeader.classList.contains('force-show')) {
        landscapeToggle.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>';
    } else {
        landscapeToggle.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>';
    }
});

// ==========================================
// 3. PERSISTENCIA AUTOMÁTICA Y TELEMETRÍA
// ==========================================
let sessionId = localStorage.getItem('gk_session_id') || ('s_' + Math.random().toString(36).substring(2, 9));
localStorage.setItem('gk_session_id', sessionId);
let currentProjectId = null;
localStorage.removeItem('gk_current_project_id');
let nodesTracked = parseInt(localStorage.getItem('gk_nodes_tracked') || '0', 10);


function trackNodeUsage(topicName) {
    if (nodesTracked >= 50) return;
    nodesTracked++;
    localStorage.setItem('gk_nodes_tracked', nodesTracked.toString());
    updateSurpriseButtonVisibility(); // Oculta el botón de prueba tras el primer uso

    fetch('/.netlify/functions/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicName, sessionId: sessionId })
    }).catch(() => {});
}

// ==========================================
// 4. AUTENTICACIÓN Y SALDOS
// El saldo real vive en el servidor (Supabase). El cliente solo refleja el último
// valor que el servidor le confirmó; nunca lo calcula ni lo decide por su cuenta.
// ==========================================
let currentUser = null;
let isAdmin = false;          // Ahora la confirma el servidor (rol/email en el JWT), no localStorage.
let availableNodes = 0;
let isGuestUser = true;       // true = sin sesión; el saldo de invitado lo controla una cookie HttpOnly.
let balanceKnown = false;     // evita parpadeos de "0 Nodos" antes de la primera respuesta del servidor.

// El JWT de Netlify Identity cacheado en currentUser.token.access_token se emite al
// iniciar sesión y expira (normalmente en 1h); usarlo tal cual causaba 401 en
// sesiones largas. currentUser.jwt() lo refresca sola si hace falta — por eso
// authHeaders ahora es async y todo lo que la llama hace await.
async function getAuthToken() {
    if (!currentUser) return null;
    try {
        if (typeof currentUser.jwt === 'function') return await currentUser.jwt();
    } catch (_err) { /* si falla el refresco, se cae al token cacheado */ }
    return currentUser?.token?.access_token || null;
}

// Cabeceras de autenticación para toda llamada a nuestras funciones de Netlify.
// Con sesión, incluye el JWT de Netlify Identity (recién refrescado si hacía
// falta); el servidor lo verifica por su cuenta.
async function authHeaders(extra = {}) {
    const headers = { 'Content-Type': 'application/json', ...extra };
    const token = await getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// Wrapper único para llamar a nuestras funciones: agrega auth y cookies, y nunca lanza
// si la función responde con un error controlado (402/429/503) — deja que el llamador decida.
async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
        ...options,
        credentials: 'same-origin',
        headers: await authHeaders(options.headers)
    });
    let data = null;
    try { data = await res.json(); } catch { /* respuesta sin cuerpo JSON */ }
    return { ok: res.ok, status: res.status, data: data || {} };
}

// ==========================================
// REGISTRO DE EVENTOS (embudo de uso): ver netlify/functions/track-event.js.
// "Dispara y olvida" a propósito — nunca se espera su resultado ni se deja
// que un fallo de red lo note el usuario. anonId identifica el NAVEGADOR
// (no a la persona) para poder seguir "qué hizo antes de tener cuenta" aunque
// pase de invitado a usuario logueado a mitad de sesión.
function getAnonId() {
    try {
        let id = localStorage.getItem('gk_anon_id');
        if (!id) { id = crypto.randomUUID(); localStorage.setItem('gk_anon_id', id); }
        return id;
    } catch { return null; }
}
function track(eventName, metadata = {}) {
    (async () => {
        try {
            const headers = await authHeaders();
            await fetch('/.netlify/functions/track-event', {
                method: 'POST',
                credentials: 'same-origin',
                keepalive: true, // para que sobreviva si el usuario navega fuera justo después
                headers,
                body: JSON.stringify({ event: eventName, anonId: getAnonId(), metadata })
            });
        } catch (_err) { /* nunca debe notarse en la UI */ }
    })();
}

// Señal de "se fue" (no de "se rindió": eso no se puede saber con certeza, se
// infiere después viendo cuál fue su último evento antes de este). `sendBeacon`
// no permite mandar el header de sesión, así que esto siempre queda atribuido
// como invitado aunque haya cuenta — es una limitación aceptada a cambio de
// que SÍ llegue al servidor incluso si la pestaña se cierra en ese instante.
let pageEnterTime = Date.now();
document.addEventListener('pagehide', () => {
    try {
        const body = JSON.stringify({
            event: 'page_left',
            anonId: getAnonId(),
            metadata: { seconds_on_page: Math.round((Date.now() - pageEnterTime) / 1000), had_nodes: typeof nodes !== 'undefined' ? nodes.length > 0 : null }
        });
        navigator.sendBeacon?.('/.netlify/functions/track-event', new Blob([body], { type: 'application/json' }));
    } catch (_err) { /* nunca debe notarse en la UI */ }
});

// Interceptor de red: en vez de editar cada uno de los ~18 fetch() a gemini.js/db.js/
// balance.js repartidos por app.js (cada uno maneja sus errores distinto),
// añadimos aquí el token de sesión a todos ellos y capturamos en un solo lugar los
// errores de saldo/sesión (402/429/401) que ahora decide el servidor.
(function installBillingFetchInterceptor() {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function (url, options = {}) {
        const target = typeof url === 'string' ? url : (url?.url || '');
        const isOurFn = target.includes('/.netlify/functions/gemini')
            || target.includes('/.netlify/functions/db')
            || target.includes('/.netlify/functions/balance');
        if (!isOurFn) return nativeFetch(url, options);

        const finalOptions = { ...options, credentials: 'same-origin', headers: await authHeaders(options.headers) };

        return nativeFetch(url, finalOptions).then(res => {
            const isBillingError = target.includes('/.netlify/functions/gemini')
                && (res.status === 402 || res.status === 429 || res.status === 401);
            if (!isBillingError) return res;

            return res.clone().json().catch(() => ({})).then(data => {
                handleBillingError(res.status, data);
                // El código que llamó a fetch() sigue en su propio try/catch: lanzamos para
                // que ese catch corra (y oculte el loader), sin dejar que intente leer
                // data.branches/data.concepts/etc. de un cuerpo que no los tiene.
                throw new Error('billing_blocked');
            });
        });
    };
})();

if (window.netlifyIdentity) {
    netlifyIdentity.init({ locale: 'es' });
    currentUser = netlifyIdentity.currentUser();
    refreshBalanceFromServer();
    updateAuthUI();

    netlifyIdentity.on('init', user => { currentUser = user; refreshBalanceFromServer(); updateAuthUI(); });
    netlifyIdentity.on('login', user => {
        currentUser = user;
        authWallModal?.classList.add('hidden');
        netlifyIdentity.close();
        refreshBalanceFromServer(); updateAuthUI();
        track('login_success');
    });
    netlifyIdentity.on('logout', () => { currentUser = null; refreshBalanceFromServer(); updateAuthUI(); });
}

// Pide el saldo real al servidor. No gasta nodos: solo consulta.
async function refreshBalanceFromServer() {
    const { ok, data } = await apiFetch('/.netlify/functions/balance');
    if (!ok) { balanceKnown = false; return; }

    isAdmin = data.kind === 'admin';
    isGuestUser = data.kind === 'guest';
    availableNodes = typeof data.balance === 'number' ? data.balance : 0;
    balanceKnown = true;
    updateCounterDisplay();
}

// Aplica el saldo que ya vino en la respuesta de una acción de IA (gemini.js lo incluye
// siempre), para no tener que hacer una llamada extra a /balance tras cada acción.
function applyServerBalance(data) {
    if (!data) return;
    if (typeof data.balance === 'number') availableNodes = data.balance;
    isAdmin = !!data.admin;
    isGuestUser = !!data.guest;
    balanceKnown = true;
    updateCounterDisplay();
}

// Interpreta un error 402/429 devuelto por gemini.js y muestra el panel correcto.
// Devuelve true si ya se manejó (el llamador no debe seguir con su propio alert()).
function handleBillingError(status, data) {
    if (status === 402 && data?.error === 'guest_limit_reached') {
        if (typeof data.balance === 'number') { availableNodes = data.balance; updateCounterDisplay(); }
        requireAuth('guest_limit_reached');
        return true;
    }
    if (status === 402 && data?.error === 'insufficient_balance') {
        if (typeof data.balance === 'number') { availableNodes = data.balance; updateCounterDisplay(); }
        if (actionMenu) actionMenu.classList.add('hidden');
        track('paywall_shown', { reason: 'insufficient_balance' });
        openStoreModal();
        return true;
    }
    if (status === 429) {
        alert('Estás generando muy rápido. Espera un minuto y vuelve a intentar.');
        return true;
    }
    if (status === 401) {
        requireAuth('procesar este esquema');
        return true;
    }
    return false;
}

function updateSurpriseButtonVisibility() {
    const btnSurprise = document.getElementById('btnSurprise');
    if (!btnSurprise) return;

    const hasUsedAppBefore = parseInt(localStorage.getItem('gk_nodes_tracked') || '0', 10) > 0;

    // Solo mostrar si NO está logueado y es la primera vez que usa la app
    if (!currentUser && !hasUsedAppBefore) {
        btnSurprise.classList.remove('hidden');
        btnSurprise.classList.add('flex');
    } else {
        btnSurprise.classList.add('hidden');
        btnSurprise.classList.remove('flex');
    }
}

function updateAuthUI() {
    const loginText = document.getElementById('loginText');
    const userStatusDot = document.getElementById('userStatusDot');
    const btnProjects = document.getElementById('btnProjects');
    
    if (!loginText || !userStatusDot) return;
    
    if (currentUser) {
        loginText.innerText = currentUser.user_metadata?.full_name?.split(' ')[0] || "Mi Cuenta";
        userStatusDot.className = 'w-2 h-2 rounded-full bg-indigo-500';
    } else {
        loginText.innerText = "Iniciar Sesión";
        userStatusDot.className = 'w-2 h-2 rounded-full bg-slate-300';
    }

    if (btnProjects) {
        btnProjects.classList.remove('hidden');
        btnProjects.classList.add('flex');
    }

    // Verificar si debe mostrarse "Generar esquema de prueba"
    updateSurpriseButtonVisibility();
}

document.getElementById('btnLogin')?.addEventListener('click', () => {
    if (currentUser) netlifyIdentity.open(); else netlifyIdentity.open('login');
});

document.getElementById('btnTriggerNetlifyLogin')?.addEventListener('click', () => {
    authWallModal?.classList.add('hidden');
    netlifyIdentity.open('login');
});

document.getElementById('closeAuthWall')?.addEventListener('click', () => {
    authWallModal?.classList.add('hidden');
});

function requireAuth(actionDescription) {
    if (currentUser || isAdmin) return true;
    if (authWallModal) { authWallModal.classList.remove('hidden'); authWallModal.classList.add('flex'); }
    if (actionMenu) actionMenu.classList.add('hidden');
    track('login_wall_shown', { reason: actionDescription || null });
    return false;
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
    if (availableNodes <= 0) dot.className = 'w-2 h-2 rounded-full bg-red-500';
    else if (availableNodes < 10 && currentUser) dot.className = 'w-2 h-2 rounded-full bg-amber-500';
    else dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
}

// Ya NO descuenta nada por su cuenta: el saldo real que devuelve gemini.js (vía
// applyServerBalance) es la única fuente de verdad. Esto solo queda por compatibilidad
// con el resto de app.js/lab.js, que sigue llamando consumeNodes(n) tras cada acción.
function consumeNodes(_amount) { /* no-op: ver applyServerBalance() */ }

// Chequeo optimista en el cliente, solo para evitar una llamada de red innecesaria
// cuando es obvio que no alcanza. El servidor vuelve a validar todo en cada llamada
// y es quien realmente decide (ver handleBillingError).
function checkBalance(cost) {
    if (isAdmin) return true;
    if (!balanceKnown) return true; // aún no sabemos el saldo real: dejamos que el servidor decida
    if (availableNodes < cost) {
        if (isGuestUser) requireAuth("procesar este esquema");
        else {
            if (actionMenu) actionMenu.classList.add('hidden');
            track('paywall_shown', { reason: 'checkBalance_client_side' });
            openStoreModal();
        }
        return false;
    }
    return true;
}

// ==========================================
// 6. GENERACIÓN DE ESQUEMA EN 3 NIVELES Y NODOS
// ==========================================
function renderThreeLevelTree(data) {
    let offsetX = 0;

    if (nodes.length > 1) {
        const shouldClear = confirm("Ya tienes un esquema en el lienzo. ¿Deseas limpiar el lienzo existente antes de generar el nuevo?\n\n• Aceptar: Crea un proyecto nuevo aparte.\n• Cancelar: Conserva tus nodos actuales y agrega el nuevo esquema a un lado.");
        if (shouldClear) {
            isClearingCanvas = true;
            clearTimeout(window._binSaveTimer);
            currentProjectId = null;
            localStorage.removeItem('gk_current_project_id');
            nodes.clear();
            edges.clear();
            isClearingCanvas = false;
        } else {
            offsetX = 900; // Si cancela, se suma al mismo proyecto actual
        }
    } else {
        // Si el lienzo tenía 0 o 1 nodo, SIEMPRE inicia como un proyecto nuevo independiente
        isClearingCanvas = true;
        clearTimeout(window._binSaveTimer);
        currentProjectId = null;
        localStorage.removeItem('gk_current_project_id');
        nodes.clear();
        edges.clear();
        isClearingCanvas = false;
    }
    
    // Reducir el Modo Lector a su tamaño mínimo (300px) para maximizar el lienzo
    if (readerPanel && !readerPanel.classList.contains('hidden')) {
        readerPanel.classList.remove('w-1/3');
        readerPanel.style.flex = 'none';
        readerPanel.style.width = '300px';
        if (typeof network !== 'undefined') network.redraw();
    }

    const viewCenter = network.getViewPosition();
    const rootX = viewCenter.x + offsetX;
    const rootY = viewCenter.y - 200;

    const root = data.root;
    const branches = data.branches || [];
    const subBranches = data.subBranches || [];

    // 2. Crear Raíz (Nivel 1) con ancho controlado para mantener compacidad
    nodes.add({
        id: root.id, label: `*${root.label}*`, baseTitle: root.label,
        color: getRandomColor(), definition: root.definition || null,
        x: rootX, y: rootY, fixed: { x: false, y: false },
        widthConstraint: { minimum: 140, maximum: 220 }
    });
    trackNodeUsage(root.label);

    // 3. Agrupar Sub-ramas (Nivel 3) por cada Rama (Nivel 2)
    const childrenByBranch = {};
    branches.forEach(b => { childrenByBranch[b.id] = []; });
    subBranches.forEach(sb => {
        if (childrenByBranch[sb.parentId]) {
            childrenByBranch[sb.parentId].push(sb);
        } else if (branches.length > 0) {
            childrenByBranch[branches[0].id].push(sb);
        }
    });

    // Distribuimos las sub-ramas en máximo 2 columnas por rama para que el árbol no se estire a lo ancho
    const colSpacing = 185; 
    const rowSpacing = 95;  
    const branchGap = 60;   // Separación limpia entre grupos de ramas

    const branchWidths = branches.map(b => {
        const count = childrenByBranch[b.id].length;
        const cols = count <= 1 ? 1 : 2; // Máximo 2 columnas por cada rama de Nivel 2
        return (cols * colSpacing) + branchGap;
    });

    const totalTreeWidth = branchWidths.reduce((sum, w) => sum + w, 0);
    let currentLeftX = rootX - (totalTreeWidth / 2);

    const branchY = rootY + 150;
    const subBranchBaseY = branchY + 140;

    // 4. Posicionar Nivel 2 y Nivel 3 en bloques compactos
    branches.forEach((branch, idx) => {
        const sectionWidth = branchWidths[idx];
        const branchX = currentLeftX + (sectionWidth / 2);

        nodes.add({
            id: branch.id, label: `*${branch.label}*`, baseTitle: branch.label,
            color: getRandomColor(), definition: branch.definition || null,
            x: branchX, y: branchY, fixed: { x: false, y: false },
            widthConstraint: { minimum: 130, maximum: 200 }
        });
        edges.add({ from: root.id, to: branch.id, label: branch.relationship });
        trackNodeUsage(branch.label);

        const subs = childrenByBranch[branch.id];
        const cols = subs.length <= 1 ? 1 : 2;

        subs.forEach((sub, sIdx) => {
            const row = Math.floor(sIdx / cols);
            const col = sIdx % cols;
            
            // Si es la última fila y quedó un nodo impar suelto, lo centramos bajo su rama
            const isLastOdd = (sIdx === subs.length - 1) && (subs.length % 2 !== 0) && (cols === 2);
            const offsetX = isLastOdd ? 0 : (col === 0 ? -colSpacing / 2 : colSpacing / 2);

            const subX = branchX + (cols === 1 ? 0 : offsetX);
            const subY = subBranchBaseY + (row * rowSpacing);

            nodes.add({
                id: sub.id, label: `*${sub.label}*`, baseTitle: sub.label,
                color: getRandomColor(), definition: sub.definition || null,
                x: subX, y: subY, fixed: { x: false, y: false },
                widthConstraint: { minimum: 120, maximum: 185 }
            });
            edges.add({ from: branch.id, to: sub.id, label: sub.relationship });
            trackNodeUsage(sub.label);
        });

        currentLeftX += sectionWidth;
    });

    network.setOptions({ physics: { enabled: false } });
    
    // Esperamos un instante a que el DOM reajuste los 300px del lector para encuadrar de cerca
    setTimeout(() => {
        network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
    }, 60);
}

async function generateFullSchemaFromTopic(topicText) {
    if (!topicText) return;
    // Verificamos que tenga al menos saldo disponible para iniciar
    if (!checkBalance(1)) return;

    const isLong = topicText.trim().split(/\s+/).length >= 25;
    track('schema_generate_attempt', { mode: isLong ? 'text' : 'topic', length: topicText.length });

    showLoader(`Estructurando esquema...`);
    if (topicInput) topicInput.value = '';

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'parse_text', text: topicText })
        });
        if (!response.ok) throw new Error("Error en el servidor");

        const data = await response.json();
        const totalNodes = 1 + (data.branches?.length || 0) + (data.subBranches?.length || 0);

        renderThreeLevelTree(data);
        applyServerBalance(data); consumeNodes(totalNodes);
        track('schema_generate_success', { mode: isLong ? 'text' : 'topic', nodes: totalNodes });
    } catch (err) {
        console.error(err);
        track('schema_generate_error', { mode: isLong ? 'text' : 'topic', message: String(err?.message || '').slice(0, 120) });
        alert('Intenta de nuevo en unos segundos');
    } finally {
        hideLoader();
    }
}

// Busca un punto cerca de (centerX, centerY) que no quede encima de ningún
// nodo existente, probando en espiral hacia afuera. Sin esto, un nodo nuevo
// podía caer justo sobre otro ya puesto ahí y el usuario no veía que se había
// agregado nada.
function findFreeSpot(centerX, centerY, minDist = 170) {
    const positions = Object.values(network.getPositions());
    const farEnough = (x, y) => positions.every(p => Math.hypot(p.x - x, p.y - y) >= minDist);
    if (farEnough(centerX, centerY)) return { x: centerX, y: centerY };
    for (let i = 1; i <= 16; i++) {
        const angle = i * 0.9;
        const radius = minDist * (0.9 + i * 0.35);
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        if (farEnough(x, y)) return { x, y };
    }
    // Si el lienzo está realmente saturado, al menos lo alejamos bastante del centro.
    return { x: centerX + 260, y: centerY + (Math.random() * 120 - 60) };
}

// Pulso visual breve (agranda y resalta el borde un par de veces) para que sea
// obvio que un nodo nuevo acaba de aparecer, incluso si ya hay muchos en pantalla.
function flashNewNode(nodeId, baseSize = 25) {
    let tick = 0;
    const totalTicks = 6;
    const pulse = setInterval(() => {
        if (!nodes.get(nodeId)) { clearInterval(pulse); return; }
        const highlighted = tick % 2 === 0;
        nodes.update({
            id: nodeId,
            size: highlighted ? baseSize * 1.7 : baseSize,
            borderWidth: highlighted ? 6 : 2,
            shadow: highlighted ? { enabled: true, color: 'rgba(79, 209, 197, 0.55)', size: 25 } : { enabled: false }
        });
        tick++;
        if (tick >= totalTicks) {
            clearInterval(pulse);
            if (nodes.get(nodeId)) nodes.update({ id: nodeId, size: baseSize, borderWidth: 2, shadow: { enabled: false } });
        }
    }, 220);
}

function insertSingleNode(topic) {
    if (!checkBalance(1)) return;
    const viewCenter = network.getViewPosition();
    const spot = findFreeSpot(viewCenter.x, viewCenter.y);
    nodes.add({ id: topic, label: `*${topic}*`, baseTitle: topic, color: getRandomColor(), x: spot.x, y: spot.y, fixed: { x: false, y: false } });
    trackNodeUsage(topic); consumeNodes(1); topicInput.value = '';
    setTimeout(() => {
        network.focus(topic, { scale: 1.1, animation: { duration: 600 } });
        flashNewNode(topic);
    }, 50);
}

// Campo pequeño de la cabecera: es el único punto de entrada para "generar",
// esté el lienzo vacío o no. Un tema corto se investiga (esquema completo);
// un texto largo o un enlace de YouTube se usa tal cual, fiel a ese contenido
// (igual que el Modo Lector, solo que sin tener que abrir ese panel aparte).
// Si el lienzo YA tiene contenido y lo escrito es un tema corto, se mantiene
// el agregado rápido de un solo nodo suelto (no gasta tokens de IA de más).
async function handleTopicInput() {
    const raw = topicInput.value.trim();
    if (!raw) return;

    if (looksLikeYouTubeLink(raw)) {
        topicInput.value = '';
        const text = await resolveTextOrYouTubeLink(raw);
        if (text === null) return;
        currentDocumentText = text;
        await generateFullSchemaFromTopic(text);
        return;
    }

    const isLongText = raw.split(/\s+/).length >= 25;
    if (nodes.length === 0 || isLongText) {
        if (isLongText) currentDocumentText = raw;
        generateFullSchemaFromTopic(raw);
    } else {
        insertSingleNode(raw);
    }
}

document.getElementById('btnGenerate')?.addEventListener('click', handleTopicInput);
document.getElementById('topicInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleTopicInput(); });


// ==========================================
// 7. EXPANDIR RAMAS MANUALMENTE (Lógica 'Auto')
// ==========================================
function getContextPath(nodeId) {
    let path = [nodeId]; let current = nodeId;
    for (let i = 0; i < 5; i++) {
        let parentEdges = edges.get({ filter: e => e.to === current });
        if (parentEdges.length === 0) break;
        current = parentEdges[0].from; path.unshift(current);
    }
    return path.map(id => { const n = nodes.get(id); return n ? (n.baseTitle || id) : id; }).join(' > ');
}

document.getElementById('btnMenuExpand')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    if (!requireAuth("profundizar en conceptos relacionados")) return;

    const currentNode = nodes.get(selectedNodeId);
    const topicName = currentNode.baseTitle || selectedNodeId;

    // Si es un nodo de Incógnita (❓), al expandirlo revelamos la respuesta
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
            // El nodo se mantiene pequeño siempre (sin inflarse con el contenido);
            // el contenido real se abre en su propio panel flotante a continuación.
            (data.nodes || []).forEach((item, idx) => {
                const newId = item.id || `ans_${Date.now()}_${idx}`;
                nodes.update({
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
        (data.concepts || []).forEach((concept, idx) => {
            const cId = nodes.get(concept.id) ? `${concept.id}_${Date.now()}_${idx}` : concept.id;
            nodes.update({
                id: cId, label: `*${concept.label}*`, baseTitle: concept.label,
                color: getRandomColor(), expanded: false,
                x: parentPos.x, y: parentPos.y, fixed: { x: false, y: false }
            });
            edges.add({ from: selectedNodeId, to: cId, label: concept.relationship });
            trackNodeUsage(concept.label);
            createdCount++;
        });

        // Nodo gratuito de Brecha de Curiosidad
        if (data.curiosityHook && data.curiosityHook.question) {
            const hookId = `mystery_${Date.now()}`;
            nodes.update({
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

// ==========================================
// 8. GENERAR EJEMPLOS MANUALMENTE
// ==========================================
document.getElementById('btnMenuExamples')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const nodeCountVal = document.getElementById('nodeCount').value;
    const maxNodes = nodeCountVal === 'auto' ? 'varios (entre 3 y 5 representativos)' : parseInt(nodeCountVal, 10);
    const estimatedCost = nodeCountVal === 'auto' ? 4 : maxNodes;
    if (!checkBalance(estimatedCost)) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    const topicName = currentNode.baseTitle || selectedNodeId;

    showLoader('Buscando casos prácticos...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'examples', topic: topicName, contextPath, maxNodes, documentContext: globalDocumentContext || currentDocumentText })
        });
        const data = await response.json();
        nodes.update(nodes.get().map(n => ({ id: n.id, fixed: { x: true, y: true } })));
        const parentPos = network.getPositions([selectedNodeId])[selectedNodeId];
        network.setOptions({ physics: { enabled: true } });

        let createdCount = 0;
        (data.examples || []).forEach(example => {
            if (!nodes.get(example.id)) {
                nodes.add({ 
                    id: example.id, label: `*Ejemplo:*\n${example.label}`, baseTitle: example.label, expanded: false, x: parentPos.x, y: parentPos.y, fixed: { x: false, y: false },
                    color: { background: '#ffffff', border: '#e2e8f0' }, shapeProperties: { borderRadius: 8, borderDashes: [4, 4] }
                });
                edges.add({ from: selectedNodeId, to: example.id, label: example.relationship, color: { color: '#cbd5e1' }, dashes: true });
                trackNodeUsage(example.label); createdCount++;
            }
        });
        applyServerBalance(data); consumeNodes(createdCount);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1200);
    } catch { alert("Error al conectar con el servicio."); } finally { hideLoader(); }
});

// ==========================================
// 13. EVENTOS DEL CANVAS (MENÚ DINÁMICO, VÍNCULOS Y SINERGIA)
// ==========================================
network.on('click', async function (params) {
    if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0];

        // --- 1. LÓGICA DE SINERGIA (FUSIÓN) ---
        if (sourceNodeForSynergy && sourceNodeForSynergy !== clickedNodeId) {
            const nodeA = nodes.get(sourceNodeForSynergy);
            const nodeB = nodes.get(clickedNodeId);
            const topicA = nodeA.baseTitle || sourceNodeForSynergy;
            const topicB = nodeB.baseTitle || clickedNodeId;
            
            sourceNodeForSynergy = null;
            const banner = document.getElementById('synergyBanner');
            if(banner) banner.classList.add('hidden');

            showLoader('Calculando convergencia...');
            try {
                const response = await fetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'synergy', topic: topicA, topicB: topicB, density: document.getElementById('nodeCount')?.value || 'auto' })
                });
                if(!response.ok) throw new Error("Error de red");
                const data = await response.json();

                const totalNodes = 1 + (data.pathsFromA?.length || 0) + (data.pathsFromB?.length || 0);
                if (!checkBalance(totalNodes)) return;

                nodes.update(nodes.get().map(n => ({ id: n.id, fixed: { x: true, y: true } })));
                network.setOptions({ physics: { enabled: true } });

                const posA = network.getPositions([nodeA.id])[nodeA.id];
                const posB = network.getPositions([nodeB.id])[nodeB.id];
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                const synNode = data.synergy;
                if (!nodes.get(synNode.id)) {
                    // Igual que con las antítesis: el nodo muestra solo el título corto
                    // y la explicación completa queda como "definition" pregenerada,
                    // visible en el panel flotante vía "Ver definición".
                    nodes.add({
                        id: synNode.id, label: `*🌟 ${synNode.label}*`, baseTitle: synNode.label,
                        definition: synNode.explanation || synNode.label,
                        definitionSource: 'pregenerated',
                        x: midX, y: midY, fixed: { x: false, y: false },
                        color: { background: '#faf5ff', border: '#d946ef', highlight: { background: '#fdf4ff', border: '#c026d3' } },
                        font: { color: '#4a044e', bold: { color: '#701a75', size: 16 } },
                        borderWidth: 2, shadow: { enabled: true, color: 'rgba(217, 70, 239, 0.2)', size: 20 }
                    });
                    trackNodeUsage(synNode.label);
                }

                (data.pathsFromA || []).forEach(bridge => {
                    if (!nodes.get(bridge.id)) {
                        nodes.add({ id: bridge.id, label: `*${bridge.label}*`, baseTitle: bridge.label, x: posA.x + (midX - posA.x)/2 + (Math.random()*40-20), y: posA.y + (midY - posA.y)/2 + (Math.random()*40-20), fixed: { x: false, y: false }, color: getRandomColor() });
                        trackNodeUsage(bridge.label);
                    }
                    edges.add({ from: nodeA.id, to: bridge.id, label: bridge.relFromA });
                    edges.add({ from: bridge.id, to: synNode.id, label: bridge.relToSynergy });
                });

                (data.pathsFromB || []).forEach(bridge => {
                    if (!nodes.get(bridge.id)) {
                        nodes.add({ id: bridge.id, label: `*${bridge.label}*`, baseTitle: bridge.label, x: posB.x + (midX - posB.x)/2 + (Math.random()*40-20), y: posB.y + (midY - posB.y)/2 + (Math.random()*40-20), fixed: { x: false, y: false }, color: getRandomColor() });
                        trackNodeUsage(bridge.label);
                    }
                    edges.add({ from: nodeB.id, to: bridge.id, label: bridge.relFromB });
                    edges.add({ from: bridge.id, to: synNode.id, label: bridge.relToSynergy });
                });

                applyServerBalance(data); consumeNodes(totalNodes);
                setTimeout(() => { stopPhysicsAndUnlock(); }, 1800);
            } catch (err) { alert("Intenta de nuevo en unos segundos"); } finally { hideLoader(); }
            return; // ¡Este return detiene el código para que NO abra el menú!
        }

        // --- 2. LÓGICA DE VINCULAR CON... ---
        if (sourceNodeForConnection && sourceNodeForConnection !== clickedNodeId) {
            const nodeA = nodes.get(sourceNodeForConnection);
            const nodeB = nodes.get(clickedNodeId);
            const topicA = nodeA.baseTitle || sourceNodeForConnection;
            const topicB = nodeB.baseTitle || clickedNodeId;
            
            sourceNodeForConnection = null;
            const banner = document.getElementById('connectionBanner');
            if(banner) banner.classList.add('hidden');

            if (!checkBalance(1)) return;

            showLoader('Generando puente conceptual...');
            try {
                const response = await fetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'connect', topic: topicA, topicB: topicB })
                });
                if(!response.ok) throw new Error("Error de red");
                const data = await response.json();

                const posA = network.getPositions([nodeA.id])[nodeA.id];
                const posB = network.getPositions([nodeB.id])[nodeB.id];
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                const bridge = data.bridge;
                if (!nodes.get(bridge.id)) {
                    nodes.add({ id: bridge.id, label: `*${bridge.label}*`, baseTitle: bridge.label, x: midX, y: midY, fixed: { x: false, y: false }, color: getRandomColor() });
                    trackNodeUsage(bridge.label);
                    applyServerBalance(data); consumeNodes(1);
                }
                edges.add({ from: nodeA.id, to: bridge.id, label: bridge.relFromA });
                edges.add({ from: bridge.id, to: nodeB.id, label: bridge.relToB });
            } catch (err) { alert("Intenta de nuevo en unos segundos"); } finally { hideLoader(); }
            return; // ¡Este return detiene el código para que NO abra el menú!
        }

        // --- 3. MOSTRAR MENÚ CONTEXTUAL ---
        selectedNodeId = clickedNodeId;
        // "Expandir subesquema" solo aplica a un nodo colapsado (ver sección SUBESQUEMAS).
        if (typeof btnMenuExpandSub !== 'undefined' && btnMenuExpandSub) {
            const clickedNodeData = nodes.get(clickedNodeId);
            btnMenuExpandSub.classList.toggle('hidden', !(clickedNodeData && clickedNodeData.isSubscheme));
        }
        const nodePosition = network.getPositions([selectedNodeId])[selectedNodeId];
        const DOMCoords = network.canvasToDOM(nodePosition);
        const containerRect = container.getBoundingClientRect();
        
        actionMenu.style.visibility = 'hidden';
        actionMenu.classList.remove('hidden');
        
        const menuWidth = actionMenu.offsetWidth || 200;
        const menuHeight = actionMenu.offsetHeight || 300;
        
        let topPos = containerRect.top + DOMCoords.y - menuHeight - 15;
        let leftPos = containerRect.left + DOMCoords.x - (menuWidth / 2);
        
        if (topPos < 10) { topPos = containerRect.top + DOMCoords.y + 40; } // Desplegar debajo si no cabe arriba
        if (leftPos < 10) leftPos = 10;
        if (leftPos + menuWidth > window.innerWidth - 10) leftPos = window.innerWidth - menuWidth - 10;
        
        actionMenu.style.left = leftPos + 'px';
        actionMenu.style.top = topPos + 'px';
        actionMenu.style.visibility = 'visible';
        // "Ver definición" ya no alterna entre expandir-en-el-nodo y colapsar: siempre
        // abre (o enfoca) el panel flotante de este nodo, así que no necesita lógica
        // de visibilidad condicional como antes.

    } else {
        actionMenu.classList.add('hidden');
        selectedNodeId = null;
    }
});

network.on('zoom', () => { actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden'); });
network.on('dragStart', (params) => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (params.nodes.length > 0) nodes.update({ id: params.nodes[0], fixed: { x: false, y: false } });
});

// ==========================================
// SUBESQUEMAS: agrupar una selección de nodos en un solo nodo colapsado
// (con una miniatura del subesquema dibujada dentro) y poder navegar dentro
// de él como si fuera el esquema principal, con una forma de volver.
// ==========================================
const subschemeActionBar = document.getElementById('subschemeActionBar');
const subschemeSelectionCount = document.getElementById('subschemeSelectionCount');
const schemeBreadcrumb = document.getElementById('schemeBreadcrumb');
const schemeBreadcrumbLabel = document.getElementById('schemeBreadcrumbLabel');
const btnMenuExpandSub = document.getElementById('btnMenuExpandSub');

// Dibuja una miniatura muy simple (puntos = nodos, líneas = conexiones) del
// subesquema, para mostrarla dentro del nodo colapsado en el lienzo principal.
function generateSubschemeThumbnail(subNodes, subEdges, positions) {
    // Resolución del canvas más alta que el tamaño visual final en el lienzo
    // (ver `size` en el nodo colapsado) para que no se vea borroso al escalar.
    const W = 220, H = 220;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#eef2ff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#c7d2fe';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    if (!subNodes.length) return canvas.toDataURL('image/png');

    const xs = subNodes.map(n => (positions[n.id] && positions[n.id].x) || 0);
    const ys = subNodes.map(n => (positions[n.id] && positions[n.id].y) || 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = (maxX - minX) || 1;
    const rangeY = (maxY - minY) || 1;
    const pad = 16;
    const toCanvas = (x, y) => ({
        cx: pad + ((x - minX) / rangeX) * (W - pad * 2),
        cy: pad + ((y - minY) / rangeY) * (H - pad * 2)
    });

    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth = 1;
    subEdges.forEach(e => {
        const a = positions[e.from], b = positions[e.to];
        if (!a || !b) return;
        const ca = toCanvas(a.x, a.y), cb = toCanvas(b.x, b.y);
        ctx.beginPath();
        ctx.moveTo(ca.cx, ca.cy);
        ctx.lineTo(cb.cx, cb.cy);
        ctx.stroke();
    });

    subNodes.forEach(n => {
        const pos = positions[n.id];
        if (!pos) return;
        const c = toCanvas(pos.x, pos.y);
        ctx.beginPath();
        ctx.arc(c.cx, c.cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = (n.color && n.color.background) || '#6366f1';
        ctx.fill();
        ctx.strokeStyle = (n.color && n.color.border) || '#4338ca';
        ctx.lineWidth = 1.2;
        ctx.stroke();
    });

    return canvas.toDataURL('image/png');
}

function updateSubschemeActionBar() {
    if (!subschemeActionBar) return;
    const count = network.getSelectedNodes().length;
    if (count >= 2) {
        subschemeActionBar.classList.remove('hidden');
        if (subschemeSelectionCount) subschemeSelectionCount.innerText = `${count} nodos seleccionados`;
    } else {
        subschemeActionBar.classList.add('hidden');
    }
}
network.on('select', updateSubschemeActionBar);
network.on('deselectNode', updateSubschemeActionBar);
network.on('click', updateSubschemeActionBar); // cubre clic en fondo vacío (limpia selección)

function updateSchemeBreadcrumb() {
    if (!schemeBreadcrumb) return;
    if (schemeStack.length === 0) {
        schemeBreadcrumb.classList.add('hidden');
    } else {
        schemeBreadcrumb.classList.remove('hidden');
        const top = schemeStack[schemeStack.length - 1];
        if (schemeBreadcrumbLabel) schemeBreadcrumbLabel.innerText = `Dentro de: ${top.label}`;
    }
}

// Toma la selección actual (2+ nodos) y la colapsa en un solo nodo "subesquema".
// Las conexiones que iban hacia fuera de la selección ("puentes") se reconectan
// al nuevo nodo colapsado, para no perder cómo se relacionaba con el resto.
function convertSelectionToSubscheme() {
    const selectedIds = network.getSelectedNodes();
    if (selectedIds.length < 2) return;
    const selectedSet = new Set(selectedIds);

    // Si alguno de estos nodos tenía su definición abierta en un panel flotante,
    // se cierra: ya no estará en el lienzo principal sino dentro del subesquema.
    if (typeof closeFloatingPanel === 'function') {
        selectedIds.forEach(id => closeFloatingPanel(id));
    }

    const allEdges = edges.get();
    const internalEdges = allEdges.filter(e => selectedSet.has(e.from) && selectedSet.has(e.to));
    const bridgeEdges = allEdges.filter(e => (selectedSet.has(e.from) || selectedSet.has(e.to)) && !(selectedSet.has(e.from) && selectedSet.has(e.to)));

    const innerNodes = nodes.get(selectedIds);
    const positions = network.getPositions(selectedIds);
    let sumX = 0, sumY = 0;
    selectedIds.forEach(id => { sumX += positions[id].x; sumY += positions[id].y; });
    const centerX = sumX / selectedIds.length;
    const centerY = sumY / selectedIds.length;

    const subTitle = (innerNodes[0] && innerNodes[0].baseTitle) || 'Subesquema';
    const subId = `subscheme_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const thumbnail = generateSubschemeThumbnail(innerNodes, internalEdges, positions);

    // Quita del lienzo los nodos agrupados y SOLO sus conexiones internas
    // (las que van hacia fuera del grupo se conservan, ver más abajo).
    const internalIds = internalEdges.map(e => e.id);
    nodes.remove(selectedIds);
    if (internalIds.length) edges.remove(internalIds);

    nodes.add({
        id: subId,
        // Título corto y directo sobre qué hay adentro, sin relleno.
        label: `📦 ${subTitle}`,
        baseTitle: subTitle,
        isSubscheme: true,
        subSchemeData: { nodes: innerNodes, edges: internalEdges },
        x: centerX, y: centerY, fixed: { x: false, y: false },
        // Más grande que un nodo normal a propósito: adentro lleva una miniatura
        // pintada del subesquema, que necesita espacio para distinguirse.
        shape: 'image', image: thumbnail, size: 60,
        shapeProperties: { useBorderWithImage: true },
        color: { background: '#eef2ff', border: '#6366f1' },
        font: { color: '#eef1fb', size: 15, bold: { color: '#ffffff', size: 15 }, vadjust: 14 }
    });

    // Las conexiones que iban hacia un nodo ahora agrupado se redirigen al
    // nuevo nodo colapsado, para que la relación con el resto del esquema no se pierda.
    bridgeEdges.forEach(e => {
        const updated = { ...e };
        delete updated.id; // que vis-network le asigne uno nuevo, limpio
        if (selectedSet.has(e.from)) updated.from = subId;
        if (selectedSet.has(e.to)) updated.to = subId;
        edges.add(updated);
    });
    const bridgeIds = bridgeEdges.map(e => e.id).filter(id => id !== undefined);
    if (bridgeIds.length) edges.remove(bridgeIds);

    network.unselectAll();
    updateSubschemeActionBar();
}

// Entra a ver un subesquema como si fuera el esquema principal: guarda el
// nivel actual en la pila y carga en el lienzo los nodos/aristas guardados
// dentro del nodo colapsado.
function enterSubscheme(nodeId) {
    const node = nodes.get(nodeId);
    if (!node || !node.subSchemeData) return;

    schemeStack.push({
        nodes: nodes.get(),
        edges: edges.get(),
        collapsedNodeId: nodeId,
        label: node.baseTitle || 'Subesquema'
    });

    const innerNodes = (node.subSchemeData.nodes || []).map(n => ({ ...n }));
    const innerEdges = (node.subSchemeData.edges || []).map(e => ({ ...e }));

    isClearingCanvas = true;
    nodes.clear();
    edges.clear();
    nodes.add(innerNodes);
    edges.add(innerEdges);
    isClearingCanvas = false;

    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    updateSchemeBreadcrumb();
    setTimeout(() => network.fit({ animation: { duration: 500 } }), 50);
}

// Vuelve al nivel anterior, guardando dentro del nodo colapsado lo que haya
// cambiado mientras se navegaba dentro del subesquema (incluida su miniatura).
function exitSubscheme() {
    if (schemeStack.length === 0) return;
    const frame = schemeStack.pop();

    const freshNodes = nodes.get();
    const freshEdges = edges.get();
    const freshPositions = network.getPositions(freshNodes.map(n => n.id));

    const restoredNodes = frame.nodes.map(n => {
        if (n.id !== frame.collapsedNodeId) return n;
        return {
            ...n,
            subSchemeData: { nodes: freshNodes, edges: freshEdges },
            label: `📦 ${n.baseTitle || 'Subesquema'}`,
            image: generateSubschemeThumbnail(freshNodes, freshEdges, freshPositions)
        };
    });

    isClearingCanvas = true;
    nodes.clear();
    edges.clear();
    nodes.add(restoredNodes);
    edges.add(frame.edges);
    isClearingCanvas = false;

    updateSchemeBreadcrumb();
    setTimeout(() => network.fit({ animation: { duration: 500 } }), 50);

    // Solo se guarda en la nube/local cuando se está de vuelta en el nivel raíz
    // (ver guardas en triggerAutoSave/saveCurrentProjectToBin más abajo).
    if (schemeStack.length === 0) triggerAutoSave();
}

document.getElementById('btnMakeSubscheme')?.addEventListener('click', convertSelectionToSubscheme);
document.getElementById('btnExitSubscheme')?.addEventListener('click', exitSubscheme);
btnMenuExpandSub?.addEventListener('click', () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (selectedNodeId) enterSubscheme(selectedNodeId);
});
network.on('doubleClick', (params) => {
    if (params.nodes.length > 0) {
        const n = nodes.get(params.nodes[0]);
        if (n && n.isSubscheme) enterSubscheme(n.id);
    }
});

// ==========================================
// MODO LECTOR ACTIVO - TEXTO LIBRE Y RESIZER
// ==========================================
const btnToggleReader = document.getElementById('btnToggleReader');
const readerPanel = document.getElementById('readerPanel');
const readerPanelHeader = document.getElementById('readerPanelHeader');
const readerTextMode = document.getElementById('readerTextMode');
const selectionTooltip = document.getElementById('selectionTooltip');
const docContextInput = document.getElementById('docContextInput');
const docContextChip = document.getElementById('docContextChip');
const docContextChipText = document.getElementById('docContextChipText');
const docContextEditRow = document.getElementById('docContextEditRow');

const floatingPanelsLayer = document.getElementById('floatingPanelsLayer');
const nodeSelectionTooltip = document.getElementById('nodeSelectionTooltip');
const nodeTooltipPreview = document.getElementById('nodeTooltipPreview');
const nodeBtnExtractChild = document.getElementById('nodeBtnExtractChild');

// ==========================================
// PANELES FLOTANTES DE DEFINICIÓN
// Ya no hay un panel único "nodeDetailPanel" que se reemplaza cada vez (eso forzaba
// a elegir entre perder la definición anterior o recargar visualmente el esquema).
// Cada "Ver definición" abre su propia ventana flotante, apilada en cascada, que el
// usuario puede arrastrar, minimizar o cerrar sin afectar a las demás ni al lienzo.
// ==========================================
let floatingPanelCount = 0;
const openFloatingPanels = new Map(); // nodeId -> { el, contentEl, titleEl }

function closeFloatingPanel(nodeId) {
    const panel = openFloatingPanels.get(nodeId);
    if (!panel) return;
    panel.el.remove();
    openFloatingPanels.delete(nodeId);
}

function focusFloatingPanel(nodeId) {
    const panel = openFloatingPanels.get(nodeId);
    if (!panel) return;
    floatingPanelCount++;
    panel.el.style.zIndex = String(500 + floatingPanelCount);
}

// Crea (o enfoca, si ya existe) la ventana flotante de un nodo y devuelve sus
// referencias de título/contenido para que el llamador las rellene.
function openFloatingPanel(nodeId, title) {
    const existing = openFloatingPanels.get(nodeId);
    if (existing) { focusFloatingPanel(nodeId); return existing; }

    const offset = openFloatingPanels.size % 6;
    const el = document.createElement('div');
    el.className = 'absolute w-80 max-h-[70vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col pointer-events-auto select-text';
    el.style.left = `${24 + offset * 36}px`;
    el.style.top = `${24 + offset * 36}px`;
    el.style.zIndex = String(500 + (++floatingPanelCount));

    el.innerHTML = `
        <div class="fp-header px-3 py-2 bg-slate-950 border-b border-slate-800 rounded-t-xl flex justify-between items-center gap-2 cursor-move select-none">
            <h3 class="fp-title text-xs font-bold font-heading text-[#4fd1c5] uppercase tracking-wider truncate flex-1"></h3>
            <button class="fp-minimize text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800 transition-colors" title="Minimizar">—</button>
            <button class="fp-close text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800 transition-colors" title="Cerrar">✕</button>
        </div>
        <div class="fp-content flex-1 overflow-auto p-4 text-slate-200 text-sm leading-relaxed font-sans select-text"></div>
    `;
    floatingPanelsLayer.appendChild(el);

    const titleEl = el.querySelector('.fp-title');
    const contentEl = el.querySelector('.fp-content');
    const headerEl = el.querySelector('.fp-header');
    titleEl.innerText = title;

    el.querySelector('.fp-close').addEventListener('click', () => closeFloatingPanel(nodeId));
    el.querySelector('.fp-minimize').addEventListener('click', () => {
        contentEl.classList.toggle('hidden');
    });
    el.addEventListener('mousedown', () => focusFloatingPanel(nodeId));

    // Arrastre simple: el usuario puede reposicionar cada panel para aprovechar el
    // espacio de pantalla y comparar varias definiciones a la vez lado a lado.
    let dragState = null;
    headerEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        dragState = { startX: e.clientX, startY: e.clientY, left: el.offsetLeft, top: el.offsetTop };
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragState) return;
        el.style.left = `${dragState.left + (e.clientX - dragState.startX)}px`;
        el.style.top = `${dragState.top + (e.clientY - dragState.startY)}px`;
    });
    document.addEventListener('mouseup', () => { dragState = null; });

    const panel = { el, contentEl, titleEl };
    openFloatingPanels.set(nodeId, panel);
    return panel;
}

let globalDocumentContext = "";
let activeSelectedText = "";
let activeSelectionRange = null;
let activeNodeDetailId = null;
let activeNodeSelectionRange = null;
let activeNodeSelectedText = "";

// El contexto ya no se le pide al usuario de entrada: se detecta solo (del texto
// pegado o del título del video) y solo se muestra como una línea discreta con
// un link de "editar" para quien quiera ajustarlo a mano.
function updateDocContextChip() {
    if (!docContextChip) return;
    if (globalDocumentContext) {
        docContextChip.classList.remove('hidden');
        docContextChip.classList.add('flex');
        if (docContextChipText) docContextChipText.innerText = globalDocumentContext.length > 60 ? globalDocumentContext.slice(0, 60) + '…' : globalDocumentContext;
    } else {
        docContextChip.classList.add('hidden');
        docContextChip.classList.remove('flex');
    }
}

docContextInput?.addEventListener('input', (e) => {
    globalDocumentContext = e.target.value.trim();
    updateDocContextChip();
});

document.getElementById('btnEditContext')?.addEventListener('click', () => {
    docContextEditRow.classList.remove('hidden');
    docContextEditRow.classList.add('flex');
    if (docContextInput) { docContextInput.value = globalDocumentContext; docContextInput.focus(); }
});

// Panel flotante de Lectura: abrir/cerrar, traer al frente y arrastrar — mismo
// espíritu que los paneles flotantes de definición, pero con su propio marcado
// estático en el HTML en vez de crearse dinámicamente.
function openReaderPanel() {
    readerPanel.classList.remove('hidden');
    readerPanel.style.zIndex = String(500 + (++floatingPanelCount));
    btnToggleReader.innerHTML = '<span>📖</span> Ocultar Modo Lector';
    setTimeout(() => { if (typeof network !== 'undefined') network.redraw(); }, 200);
}
function closeReaderPanel() {
    readerPanel.classList.add('hidden');
    btnToggleReader.innerHTML = '<span>📖</span> Pegar documento / video (Modo Lector)';
    setTimeout(() => { if (typeof network !== 'undefined') network.redraw(); }, 200);
}

btnToggleReader?.addEventListener('click', () => {
    if (readerPanel.classList.contains('hidden')) openReaderPanel(); else closeReaderPanel();
});
document.getElementById('btnCloseReader')?.addEventListener('click', closeReaderPanel);
readerPanel?.addEventListener('mousedown', () => {
    readerPanel.style.zIndex = String(500 + (++floatingPanelCount));
});

// Arrastre del panel flotante desde su cabecera (igual que los paneles de definición).
let readerDragState = null;
readerPanelHeader?.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    readerDragState = { startX: e.clientX, startY: e.clientY, left: readerPanel.offsetLeft, top: readerPanel.offsetTop };
    e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
    if (!readerDragState) return;
    readerPanel.style.left = `${Math.max(0, readerDragState.left + (e.clientX - readerDragState.startX))}px`;
    readerPanel.style.top = `${Math.max(0, readerDragState.top + (e.clientY - readerDragState.startY))}px`;
});
document.addEventListener('mouseup', () => { readerDragState = null; });

document.addEventListener('mouseup', () => { 
    if (isResizing) {
        isResizing = false; 
        document.body.style.userSelect = '';
        setTimeout(() => { if (typeof network !== 'undefined') network.redraw(); }, 50);
    }
});

readerTextMode?.addEventListener('input', () => {
    const content = readerTextMode.innerText.trim();
    currentDocumentText = content;
    if (!globalDocumentContext && content.length > 20) {
        globalDocumentContext = content.split(/\s+/).slice(0, 6).join(' ') + '...';
        if (docContextInput) docContextInput.value = globalDocumentContext;
        updateDocContextChip();
    }
});

readerTextMode?.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    if (text.length > 2) {
        activeSelectedText = text;
        activeSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        document.getElementById('tooltipSelectedTextPreview').innerText = `"${text.substring(0, 25)}..."`;
        selectionTooltip.style.left = `${e.pageX - 60}px`;
        selectionTooltip.style.top = `${e.pageY - 70}px`;
        selectionTooltip.classList.remove('hidden');
    } else {
        selectionTooltip.classList.add('hidden');
    }
});

document.addEventListener('mousedown', (e) => {
    if (!selectionTooltip.contains(e.target) && !readerPanel.contains(e.target)) selectionTooltip.classList.add('hidden');
});

function highlightSelectedTextAndLink(nodeId) {
    if (!activeSelectionRange) return;
    try {
        const span = document.createElement('span');
        span.className = "bg-indigo-100 hover:bg-indigo-200 text-indigo-900 rounded px-1 transition-colors cursor-pointer border-b-2 border-indigo-300";
        span.appendChild(activeSelectionRange.extractContents());
        activeSelectionRange.insertNode(span);
        span.addEventListener('click', () => {
            if (nodes.get(nodeId)) {
                network.selectNodes([nodeId]);
                network.focus(nodeId, { scale: 1.2, animation: { duration: 600 }});
            }
        });
    } catch (err) {}
}

// ÚNICO BOTÓN AL SUBRAYAR EN EL LECTOR
document.getElementById('tipBtnCreateNode')?.addEventListener('click', () => {
    if (!activeSelectedText) return;
    selectionTooltip.classList.add('hidden');
    const topic = activeSelectedText; const rangeToHighlight = activeSelectionRange;
    activeSelectedText = ""; activeSelectionRange = null;

    if (!checkBalance(1)) return;

    const viewCenter = network.getViewPosition();
    const nodeId = topic;

    if (!nodes.get(nodeId)) {
        nodes.add({
            id: nodeId, label: `*${topic}*`, baseTitle: topic, color: getRandomColor(),
            x: viewCenter.x + (Math.random() * 100 - 50), y: viewCenter.y + (Math.random() * 100 - 50),
            fixed: { x: false, y: false }
        });
        trackNodeUsage(topic); consumeNodes(1);
    }
    activeSelectionRange = rangeToHighlight;
    highlightSelectedTextAndLink(nodeId);
    selectedNodeId = nodeId;
});

function formatInteractiveDefinition(rawText, parentNodeId) {
    const safeHtml = rawText.replace(/\n/g, '<br>');
    return safeHtml.replace(/\[\[(.*?)\]\]/g, (match, term) => {
        return `<button class="inline-flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-400/50 px-1.5 py-0.5 rounded-md font-semibold text-xs transition-all cursor-pointer mx-0.5 btn-inline-concept" data-term="${term}" data-parent="${parentNodeId}">⚡ ${term}</button>`;
    });
}

// Muestra contenido YA GENERADO (respuesta de una incógnita, resultado de un prompt
// personalizado, síntesis de un reto socrático) en un panel flotante, sin volver a
// llamar a la IA. A diferencia de showDefinitionInFloatingPanel, nunca sobreescribe
// node.definition ni pasa por el flujo de "definición interactiva".
function showContentInFloatingPanel(nodeId, title, content) {
    const panel = openFloatingPanel(nodeId, title);
    panel.el.dataset.nodeId = nodeId;
    const safeHtml = String(content || '').replace(/\n/g, '<br>');
    panel.contentEl.innerHTML = `<div class="leading-relaxed text-slate-200">${safeHtml}</div>`;
}

// Pide (o reutiliza) la definición interactiva de un nodo y la muestra en su propio
// panel flotante, sin tocar el nodo en el lienzo. Se usa desde el menú "Ver definición"
// para conceptos normales (no para contenido ya generado, ver función anterior).
async function showDefinitionInFloatingPanel(nodeId) {
    const currentNode = nodes.get(nodeId);
    if (!currentNode) return;
    const title = currentNode.baseTitle || nodeId;
    let definitionText = currentNode.definition;
    // "gemini" trae pistas interactivas "[[término]]"; "wikipedia" es un
    // extracto plano con imagen/atribución (ver gemini.js → lookupWikipedia).
    let defSource = currentNode.definitionSource || 'gemini';
    let wikiImage = currentNode.wikiImage || null;
    let wikiUrl = currentNode.wikiUrl || null;

    const panel = openFloatingPanel(nodeId, title);
    panel.el.dataset.nodeId = nodeId;

    const cacheIsUsable = definitionText && (defSource === 'wikipedia' || defSource === 'pregenerated' || definitionText.includes('[['));
    if (!cacheIsUsable) {
        panel.contentEl.innerHTML = `
            <div class="flex flex-col items-center justify-center gap-3 py-6">
                <div class="relative w-8 h-8">
                    <div class="absolute inset-0 border-[3px] border-slate-700 rounded-full"></div>
                    <div class="absolute inset-0 border-[3px] border-[#4fd1c5] rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p class="text-slate-400 text-xs italic">Redactando definición…</p>
            </div>
        `;
        try {
            const { ok, data } = await apiFetch('/.netlify/functions/gemini', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'define',
                    topic: title,
                    interactive: true,
                    contextPath: getContextPath(nodeId),
                    documentContext: globalDocumentContext || currentDocumentText
                })
            });
            if (!ok) { panel.contentEl.innerHTML = `<p class="text-rose-400 text-xs">No se pudo obtener la definición.</p>`; return; }
            applyServerBalance(data);
            definitionText = data.definition;
            defSource = data.source || 'gemini';
            wikiImage = data.image || null;
            wikiUrl = data.sourceUrl || null;
            nodes.update({
                id: nodeId, baseTitle: title, definition: definitionText,
                definitionSource: defSource, wikiImage, wikiUrl
            });
        } catch (err) {
            panel.contentEl.innerHTML = `<p class="text-rose-400 text-xs">Error al obtener definición.</p>`;
            return;
        }
    }

    if (defSource === 'wikipedia') {
        panel.contentEl.innerHTML = `
            ${wikiImage ? `<img src="${wikiImage}" alt="${title}" class="w-full h-32 object-cover rounded-lg mb-3 border border-slate-700">` : ''}
            <p class="leading-relaxed text-slate-200">${definitionText}</p>
            <p class="mt-3 text-[10px] text-slate-500">Fuente: ${wikiUrl ? `<a href="${wikiUrl}" target="_blank" rel="noopener" class="underline hover:text-slate-300">Wikipedia</a>` : 'Wikipedia'}</p>
        `;
        return;
    }

    const hasInteractiveHints = definitionText.includes('[[');
    panel.contentEl.innerHTML = `
        ${hasInteractiveHints ? `<p class="text-[11px] text-slate-400 mb-3">💡 Haz clic en los conceptos resaltados con ⚡ para agregarlos al mapa.</p>` : ''}
        <div class="leading-relaxed text-slate-200">${formatInteractiveDefinition(definitionText, nodeId)}</div>
    `;

    panel.contentEl.querySelectorAll('.btn-inline-concept').forEach(btn => {
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
            e.currentTarget.classList.replace('bg-amber-500/20', 'bg-emerald-500/30');
            e.currentTarget.classList.replace('text-amber-300', 'text-emerald-300');
            e.currentTarget.innerText = `✓ ${term}`;
        });
    });
}

document.getElementById('btnMenuOpenPanel')?.addEventListener('click', () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    showDefinitionInFloatingPanel(selectedNodeId);
});

// EXTRACCIÓN DE NODOS DESDE CUALQUIER PANEL FLOTANTE ABIERTO.
// Antes esto escuchaba sobre un único nodeDetailContent; ahora puede haber varios
// paneles abiertos a la vez, así que delegamos el evento sobre la capa que los
// contiene a todos y resolvemos a cuál pertenece la selección.
floatingPanelsLayer?.addEventListener('mouseup', (e) => {
    const panelEl = e.target.closest('[data-node-id]');
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (panelEl && text.length > 2) {
        activeNodeSelectedText = text;
        activeNodeDetailId = panelEl.dataset.nodeId;
        activeNodeSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (nodeTooltipPreview) nodeTooltipPreview.innerText = `"${text.substring(0, 20)}..."`;
        nodeSelectionTooltip.style.left = `${e.clientX - 20}px`;
        nodeSelectionTooltip.style.top = `${e.clientY - 50}px`;
        nodeSelectionTooltip.classList.remove('hidden');
    } else {
        nodeSelectionTooltip.classList.add('hidden');
    }
});

document.addEventListener('mousedown', (e) => {
    if (nodeSelectionTooltip && !nodeSelectionTooltip.contains(e.target) && !floatingPanelsLayer?.contains(e.target)) {
        nodeSelectionTooltip.classList.add('hidden');
    }
});

nodeBtnExtractChild?.addEventListener('click', () => {
    if (!activeNodeSelectedText || !activeNodeDetailId) return;
    nodeSelectionTooltip.classList.add('hidden');

    const childTopic = activeNodeSelectedText;
    activeNodeSelectedText = ""; activeNodeSelectionRange = null;

    if (!checkBalance(1)) return;

    const parentPos = network.getPositions([activeNodeDetailId])[activeNodeDetailId];
    const newId = childTopic;

    if (!nodes.get(newId)) {
        nodes.add({
            id: newId, label: `*${childTopic}*`, baseTitle: childTopic, color: getRandomColor(),
            x: parentPos.x + 250, y: parentPos.y + (Math.random() * 100 - 50),
            fixed: { x: false, y: false },
            widthConstraint: { minimum: 150, maximum: 250 }, heightConstraint: { minimum: 50, maximum: 90 }
        });
        edges.add({ from: activeNodeDetailId, to: newId, label: 'deriva en' });
        trackNodeUsage(childTopic); consumeNodes(1);
    }
});

// ==========================================
// GENERAR ESQUEMA COMPLETO A PARTIR DEL TEXTO DEL LECTOR
// ==========================================
// Detecta (en el cliente, sin validar a fondo) si lo pegado es un enlace de
// YouTube en vez de texto, para decidir si hay que pedirle al backend la
// transcripción antes de generar el esquema.
function looksLikeYouTubeLink(str) {
    const t = (str || '').trim();
    return t.length > 0 && t.length < 300 && !/\s/.test(t) && /(youtube\.com\/|youtu\.be\/)/i.test(t);
}

// Si lo que se pasó es un enlace de YouTube, extrae sus subtítulos y devuelve
// ESE texto en su lugar (mismo mecanismo para el Modo Lector y para el campo
// pequeño de arriba, así ambos pueden recibir un enlace indistintamente).
// Devuelve null si falló (y ya mostró la alerta correspondiente).
async function resolveTextOrYouTubeLink(raw, { fillReaderPanel } = {}) {
    if (!looksLikeYouTubeLink(raw)) return raw;

    showLoader('Extrayendo subtítulos del video...');
    try {
        const resp = await fetch('/.netlify/functions/youtube-transcript', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: raw })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'No se pudo obtener la transcripción de ese video.');
        if (fillReaderPanel && readerTextMode) readerTextMode.innerText = data.text;
        if (data.title && !globalDocumentContext) {
            globalDocumentContext = data.title;
            if (docContextInput) docContextInput.value = data.title;
            updateDocContextChip();
        }
        track('youtube_transcript_success');
        return data.text;
    } catch (err) {
        track('youtube_transcript_error', { message: String(err?.message || '').slice(0, 160) });
        alert(err.message || "No se pudo extraer el texto de ese video.");
        return null;
    } finally {
        hideLoader();
    }
}

document.getElementById('btnParseReaderText')?.addEventListener('click', async () => {
    let textContent = readerTextMode.innerText.trim();
    if (!textContent || textContent.length < 3) return alert("Escribe un tema, pega un texto o el enlace de un video de YouTube en el lector.");

    textContent = await resolveTextOrYouTubeLink(textContent, { fillReaderPanel: true });
    if (textContent === null) return;

    currentDocumentText = textContent;
    await generateFullSchemaFromTopic(textContent);
});

// ==========================================
// 15. PANTALLA DE BIENVENIDA (SOLO EN LA PRIMERA VISITA)
// ==========================================
const welcomeScreen = document.getElementById('welcomeScreen');
const isFirstTimeUser = !localStorage.getItem('gk_has_visited') && parseInt(localStorage.getItem('gk_nodes_tracked') || '0', 10) === 0;
let hasDismissedWelcomeScreen = !isFirstTimeUser;

// Solo mostramos el cuadro "¿Qué vamos a explorar hoy?" si es su primera vez entrando
if (isFirstTimeUser && welcomeScreen) {
    welcomeScreen.classList.remove('hidden');
    welcomeScreen.classList.add('flex');
    localStorage.setItem('gk_has_visited', 'true');
    track('first_visit');
} else {
    track('return_visit');
}

function dismissWelcomeScreen() {
    if (hasDismissedWelcomeScreen || !welcomeScreen) return;
    localStorage.setItem('gk_has_visited', 'true');
    welcomeScreen.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => { 
        welcomeScreen.classList.add('hidden'); 
        welcomeScreen.classList.remove('flex');
        hasDismissedWelcomeScreen = true; 
    }, 500);
}

welcomeScreen?.addEventListener('click', (e) => { if (e.target === welcomeScreen) dismissWelcomeScreen(); });
topicInput?.addEventListener('focus', dismissWelcomeScreen);
document.getElementById('btnWelcomeReader')?.addEventListener('click', () => {
    dismissWelcomeScreen();
    openReaderPanel();
});
nodes.on('*', () => { if (nodes.length > 0 && !hasDismissedWelcomeScreen) dismissWelcomeScreen(); });

// Temas precargados para la sorpresa
const hookTopics = [
    "La Paradoja de Fermi", "El Mito de la Caverna", "Computación Cuántica",
    "Filosofía Estoica", "Neuroplasticidad", "Inteligencia Artificial General",
    "Economía Conductual", "La Teoría de Cuerdas", "Imperio Romano"
];

// Generar los 3 botones de sugerencias al azar
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

// Botón de Sorpréndeme
document.getElementById('btnSurprise')?.addEventListener('click', () => {
    const randomTopic = hookTopics[Math.floor(Math.random() * hookTopics.length)];
    // Enviaremos el tema al azar directamente al generador principal
    generateFullSchemaFromTopic(randomTopic);
});

// Función auxiliar para encontrar todos los descendientes (hijos, nietos, etc.) de un nodo
function getAllDescendants(parentNodeId) {
    const descendants = new Set();
    const queue = [parentNodeId];

    while (queue.length > 0) {
        const currentId = queue.shift();
        const childEdges = edges.get({ filter: e => e.from === currentId });
        
        childEdges.forEach(edge => {
            if (!descendants.has(edge.to) && edge.to !== parentNodeId) {
                descendants.add(edge.to);
                queue.push(edge.to);
            }
        });
    }
    return Array.from(descendants);
}

document.getElementById('btnMenuDelete')?.addEventListener('click', () => {
    if (!selectedNodeId) return;

    const descendants = getAllDescendants(selectedNodeId);

    if (descendants.length > 0) {
        const deleteAll = confirm(
            `Este nodo tiene ${descendants.length} sub-nodo(s) conectado(s).\n\n` +
            `• Presiona "Aceptar" para eliminar el nodo y TODOS sus hijos.\n` +
            `• Presiona "Cancelar" para eliminar ÚNICAMENTE este nodo y conservar sus hijos.`
        );

        if (deleteAll) {
            nodes.remove([selectedNodeId, ...descendants]);
        } else {
            nodes.remove(selectedNodeId);
        }
    } else {
        nodes.remove(selectedNodeId);
    }

    actionMenu.classList.add('hidden');
    selectedNodeId = null;
});

// ==========================================
// HERRAMIENTAS: ELIMINAR, LIMPIAR GRAFO, LIMPIAR LECTOR Y CAPTURAR
// ==========================================

// 1. Limpiar el Grafo (Botón de la barra superior)
document.getElementById('btnClear')?.addEventListener('click', async () => {
    if (nodes.length === 0) return;

    // Asegurar que el estado actual quede guardado antes de limpiar
    await saveCurrentProjectToBin();

    const createNewProject = confirm(
        "Vas a limpiar el lienzo actual.\n\n" +
        "¿Deseas generar un NUEVO proyecto para lo próximo que hagas?\n\n" +
        "• Aceptar: Conserva este esquema en 'Mis Proyectos' y empieza a guardar en un proyecto aparte.\n" +
        "• Cancelar: Limpia el lienzo pero sigue guardando sobre este mismo proyecto."
    );

    isClearingCanvas = true;
    clearTimeout(window._binSaveTimer);

    if (createNewProject) {
        currentProjectId = null;
        localStorage.removeItem('gk_current_project_id');
    }

    nodes.clear();
    edges.clear();
    currentDocumentText = "";
    actionMenu.classList.add('hidden');
    if (typeof connectionBanner !== 'undefined' && connectionBanner) {
        connectionBanner.classList.add('hidden');
    }
    sourceNodeForConnection = null;
    selectedNodeId = null;
    schemeStack = [];
    updateSchemeBreadcrumb();
    isClearingCanvas = false;
});


// 2. Limpiar SOLO el panel del Lector (Botón nuevo a la par de Generar Esquema)
document.getElementById('btnClearReader')?.addEventListener('click', () => {
    const hasText = readerTextMode && readerTextMode.innerText.trim() !== "";
    const hasContext = !!globalDocumentContext;

    if (!hasText && !hasContext) return;

    if (confirm("¿Deseas limpiar el texto y el contexto del panel de lectura?")) {
        currentDocumentText = "";
        globalDocumentContext = "";
        if (readerTextMode) readerTextMode.innerText = "";
        if (docContextInput) docContextInput.value = "";
        docContextEditRow?.classList.add('hidden');
        updateDocContextChip();
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
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = canvas.width;
            exportCanvas.height = canvas.height;
            const ctx = exportCanvas.getContext('2d');

            ctx.fillStyle = '#f8fafc'; // Fondo elegante
            ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
            ctx.drawImage(canvas, 0, 0);

            const downloadLink = document.createElement('a');
            downloadLink.download = `Graphikosmos-${new Date().toISOString().slice(0, 10)}.png`;
            downloadLink.href = exportCanvas.toDataURL('image/png');
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        } catch {
            alert("Error al exportar la imagen.");
        } finally {
            hideLoader();
        }
    }, 150);
});

// (El escalado +/- de nodos "expandidos en el lienzo" ya no existe: ningún nodo se
// infla con contenido ahora, todo el contenido vive en paneles flotantes. Los botones
// +/- del menú siguen en el HTML pero ya no tienen listener — ver LEEME_ETAPA_2.md.)

// ==========================================
// ACTIVADORES DE SINERGIA Y VINCULACIÓN MANUAL
// ==========================================

// 1. Iniciar Sinergia (Fusión)
document.getElementById('btnMenuSynergy')?.addEventListener('click', () => {
    sourceNodeForSynergy = selectedNodeId;
    actionMenu.style.visibility = 'hidden'; 
    actionMenu.classList.add('hidden');
    
    const banner = document.getElementById('synergyBanner');
    if (banner) banner.classList.remove('hidden');
});

// Cancelar Sinergia tocando el banner
document.getElementById('synergyBanner')?.addEventListener('click', (e) => {
    sourceNodeForSynergy = null;
    e.currentTarget.classList.add('hidden');
});

// 2. Iniciar Vinculación simple
document.getElementById('btnMenuConnect')?.addEventListener('click', () => {
    sourceNodeForConnection = selectedNodeId;
    actionMenu.style.visibility = 'hidden'; 
    actionMenu.classList.add('hidden');
    
    const banner = document.getElementById('connectionBanner');
    if (banner) banner.classList.remove('hidden');
});

// Cancelar Vinculación tocando el banner
document.getElementById('connectionBanner')?.addEventListener('click', (e) => {
    sourceNodeForConnection = null;
    e.currentTarget.classList.add('hidden');
});



// ==========================================
// GUARDADO AUTOMÁTICO Y GESTOR DE PROYECTOS
// ==========================================
let isClearingCanvas = false;

function getActiveUserKey() {
    return currentUser ? currentUser.id : 'guest_local';
}

function showSaveFeedback(state) {
    const icon = document.getElementById('saveStatusIcon');
    const text = document.getElementById('saveStatusText');
    if (!icon || !text) return;

    if (state === 'saving') {
        icon.innerText = '⏳';
        text.innerText = 'Guardando...';
    } else if (state === 'saved') {
        icon.innerText = '✅';
        text.innerText = 'Guardado';
        setTimeout(() => {
            icon.innerText = '📁';
            text.innerText = 'Mis Proyectos';
        }, 1800);
    }
}

async function saveCurrentProjectToBin() {
    // Mientras se navega dentro de un subesquema (schemeStack no vacío), lo que
    // se ve en el lienzo es solo ESE fragmento, no el proyecto completo: guardarlo
    // tal cual sobrescribiría el esquema principal con el subesquema. Se guarda
    // de nuevo automáticamente en cuanto se vuelve al nivel raíz (ver exitSubscheme).
    if (isClearingCanvas || schemeStack.length > 0 || nodes.length === 0) return;

    showSaveFeedback('saving');
    const userKey = getActiveUserKey();
    const allNodes = nodes.get();
    const allEdges = edges.get();

    const firstNode = allNodes[0];
    const projectTitle = firstNode.baseTitle || firstNode.label?.replace(/\*/g, '').split('\n')[0] || "Mi Esquema";

    // Si aún no tiene ID de proyecto, generamos uno nuevo único
    if (!currentProjectId) {
        currentProjectId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        localStorage.setItem('gk_current_project_id', currentProjectId);
    }

    // Congelamos el ID de este proyecto específico para esta operación
    const targetProjectId = currentProjectId;

    const projectData = {
        owner: currentUser ? (currentUser.user_metadata?.full_name || currentUser.email) : 'Invitado',
        email: currentUser ? currentUser.email : 'local',
        nodes: allNodes,
        edges: allEdges
    };

    // 1. Guardado instantáneo en catálogo local
    let catalog = JSON.parse(localStorage.getItem(`gk_projects_${userKey}`) || '[]');
    const existingIndex = catalog.findIndex(p => p.id === targetProjectId);
    const entry = {
        id: targetProjectId,
        title: projectTitle,
        date: new Date().toISOString(),
        nodeCount: allNodes.length
    };

    if (existingIndex >= 0) {
        catalog[existingIndex] = entry;
    } else {
        catalog.push(entry);
    }

    localStorage.setItem(`gk_projects_${userKey}`, JSON.stringify(catalog));
    localStorage.setItem(`gk_proj_snapshot_${targetProjectId}`, JSON.stringify(projectData));

    // 2. Sincronización en la nube (JSONBin) si está logueado
    if (currentUser) {
        try {
            const isCloudId = !targetProjectId.startsWith('local_');
            const response = await fetch('/.netlify/functions/db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: isCloudId ? targetProjectId : null,
                    title: projectTitle,
                    data: projectData,
                    user: currentUser.id
                })
            });
            const resData = await response.json();

            if (response.ok && resData.projectId) {
                const cloudId = resData.projectId;

                // Reemplazar el ID temporal por el ID de la nube en el catálogo
                let freshCatalog = JSON.parse(localStorage.getItem(`gk_projects_${userKey}`) || '[]');
                const idx = freshCatalog.findIndex(p => p.id === targetProjectId);
                if (idx >= 0) {
                    freshCatalog[idx].id = cloudId;
                    localStorage.setItem(`gk_projects_${userKey}`, JSON.stringify(freshCatalog));
                }
                localStorage.setItem(`gk_proj_snapshot_${cloudId}`, JSON.stringify(projectData));

                // Solo actualizar currentProjectId si el usuario sigue trabajando en este mismo mapa
                if (currentProjectId === targetProjectId) {
                    currentProjectId = cloudId;
                    localStorage.setItem('gk_current_project_id', cloudId);
                }
            }
        } catch (err) {
            console.error("Error al sincronizar en la nube:", err);
        }
    }

    showSaveFeedback('saved');
}

function triggerAutoSave() {
    if (isClearingCanvas || schemeStack.length > 0 || nodes.length === 0) return;
    clearTimeout(window._binSaveTimer);
    window._binSaveTimer = setTimeout(() => saveCurrentProjectToBin(), 1200);
}

// Disparar guardado automático al crear/modificar nodos o conexiones
nodes.on('*', triggerAutoSave);
edges.on('*', triggerAutoSave);

// Abrir modal de Mis Proyectos
const projectsModal = document.getElementById('projectsModal');
document.getElementById('btnProjects')?.addEventListener('click', () => {
    renderProjectsList();
    projectsModal.classList.remove('hidden');
    projectsModal.classList.add('flex');
});

document.getElementById('closeProjectsModal')?.addEventListener('click', () => {
    projectsModal.classList.add('hidden');
    projectsModal.classList.remove('flex');
});

function renderProjectsList() {
    const listContainer = document.getElementById('projectsList');
    const noProjectsMsg = document.getElementById('noProjectsMsg');
    const userKey = getActiveUserKey();
    const catalog = JSON.parse(localStorage.getItem(`gk_projects_${userKey}`) || '[]');

    // Actualizar estadísticas de "Tu Cosmos" en la cabecera del modal
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

    listContainer.innerHTML = '';
    // ... (el resto de tu función renderProjectsList queda igual)
    if (catalog.length === 0) {
        noProjectsMsg.classList.remove('hidden');
    } else {
        noProjectsMsg.classList.add('hidden');
        catalog.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(proj => {
            const isCurrent = proj.id === currentProjectId;
            const item = document.createElement('div');
            item.className = `flex justify-between items-center bg-white border ${isCurrent ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-200'} p-3 rounded-xl hover:border-indigo-300 transition-colors shadow-sm`;
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">📄</div>
                    <div>
                        <h4 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                            ${proj.title}
                            ${isCurrent ? '<span class="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase">Actual</span>' : ''}
                        </h4>
                        <p class="text-[10px] text-slate-400">Último guardado: ${new Date(proj.date).toLocaleString()}</p>
                    </div>
                </div>
                <div class="flex items-center gap-1.5">
                    <button class="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg font-bold transition-colors btn-load-proj" data-id="${proj.id}">
                        Abrir
                    </button>
                </div>
            `;
            listContainer.appendChild(item);
        });

        document.querySelectorAll('.btn-load-proj').forEach(btn => {
            btn.addEventListener('click', (e) => loadProjectById(e.currentTarget.dataset.id));
        });
    }
}

async function loadProjectById(projectId) {
    projectsModal.classList.add('hidden');
    projectsModal.classList.remove('flex');
    showLoader("Cargando tu proyecto...");

    try {
        // 1. Intentar cargar desde respaldo instantáneo local
        const localRaw = localStorage.getItem(`gk_proj_snapshot_${projectId}`);
        if (localRaw) {
            const record = JSON.parse(localRaw);
            applyLoadedProject(projectId, record);
            return;
        }

        // 2. Si no está en local, pedirlo a la nube
        const response = await fetch(`/.netlify/functions/db?projectId=${projectId}`);
        if (!response.ok) throw new Error("No se pudo cargar");
        const resData = await response.json();
        if (resData.data) {
            applyLoadedProject(projectId, resData.data);
        }
    } catch (err) {
        alert("Error al abrir el proyecto.");
    } finally {
        hideLoader();
    }
}

function applyLoadedProject(projectId, record) {
    isClearingCanvas = true;
    schemeStack = [];
    updateSchemeBreadcrumb();
    nodes.clear();
    edges.clear();
    if (record.nodes) nodes.add(record.nodes);
    if (record.edges) edges.add(record.edges);
    currentProjectId = projectId;
    localStorage.setItem('gk_current_project_id', currentProjectId);
    isClearingCanvas = false;
    network.fit({ animation: { duration: 600 } });
}

document.getElementById('btnNewProject')?.addEventListener('click', () => {
    if (nodes.length > 0) {
        if (!confirm("¿Deseas iniciar un esquema completamente en blanco en un proyecto aparte?")) return;
    }
    isClearingCanvas = true;
    schemeStack = [];
    updateSchemeBreadcrumb();
    clearTimeout(window._binSaveTimer);
    currentProjectId = null;
    localStorage.removeItem('gk_current_project_id');
    nodes.clear();
    edges.clear();
    isClearingCanvas = false;

    projectsModal.classList.add('hidden');
    projectsModal.classList.remove('flex');
});

// ==========================================
// 16. TIENDA Y PAYPAL (CIERRE Y COBRO)
// ==========================================
document.getElementById('closeStore')?.addEventListener('click', () => {
    document.getElementById('storeModal').classList.add('hidden');
    document.getElementById('storeModal').classList.remove('flex');
});

// El pago se verifica siempre en el servidor (netlify/functions/paypal-create-order.js
// y paypal-capture-order.js), que a su vez acredita en Supabase (_lib/store.js →
// credit_nodes, idempotente por orderID). El navegador nunca decide el precio ni
// suma nodos por su cuenta: solo muestra el botón y refleja el saldo que el
// servidor confirme. Antes esto se calculaba enteramente en el cliente y se
// guardaba en localStorage — cualquiera podía regalarse nodos desde la consola.
//
// El SDK de PayPal mismo tampoco viene con un client-id fijo en el HTML: se pide a
// /.netlify/functions/paypal-config (que lee PAYPAL_CLIENT_ID del servidor) y se
// carga aquí dinámicamente — así el id que usa el botón del navegador y el que usan
// las llamadas reales a la API de PayPal son siempre el mismo, sin tener que
// recordar actualizar dos lugares a mano.
async function loadPaypalSdk() {
    if (window.paypal) return true;
    try {
        const res = await fetch('/.netlify/functions/paypal-config');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.clientId) {
            console.error('[paypal] no se pudo obtener el client-id de PayPal', data);
            return false;
        }
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(data.clientId)}&currency=USD`;
            s.onload = resolve;
            s.onerror = () => reject(new Error('No se pudo cargar el SDK de PayPal.'));
            document.head.appendChild(s);
        });
        return !!window.paypal;
    } catch (err) {
        console.error('[paypal] no se pudo cargar el SDK', err);
        return false;
    }
}

(async function initPaypalButtons() {
    // Pago automático apagado por ahora (ver sección 11 del LEEME): el
    // contenedor '#paypal-button-container' queda oculto en el HTML y esta
    // función no hace nada hasta que AUTOMATIC_PAYMENTS_ENABLED vuelva a true.
    if (!AUTOMATIC_PAYMENTS_ENABLED) return;
    const loaded = await loadPaypalSdk();
    // Sin SDK (ej. PAYPAL_CLIENT_ID no configurado todavía), el contenedor de
    // botones simplemente queda vacío en vez de romper el resto de la tienda.
    if (!loaded) return;

    paypal.Buttons({
        createOrder: async function () {
            if (!requireAuth('comprar nodos')) {
                // requireAuth ya mostró el muro de login; cancelamos esta orden.
                throw new Error('auth_required');
            }
            const selected = document.querySelector('input[name="nodePackage"]:checked');
            const { ok, status, data } = await apiFetch('/.netlify/functions/paypal-create-order', {
                method: 'POST',
                body: JSON.stringify({ packageId: selected.value })
            });
            if (!ok) {
                if (status === 401) requireAuth('comprar nodos');
                else alert(data?.error || 'No se pudo iniciar la compra. Intenta de nuevo.');
                throw new Error('create_order_failed');
            }
            return data.orderID;
        },
        onApprove: async function (data) {
            const selected = document.querySelector('input[name="nodePackage"]:checked');
            const result = await apiFetch('/.netlify/functions/paypal-capture-order', {
                method: 'POST',
                body: JSON.stringify({ orderID: data.orderID, packageId: selected.value })
            });
            if (!result.ok) {
                alert(result.data?.error || 'No se pudo confirmar el pago. Si el cargo sí se hizo, escríbenos para acreditarte los nodos.');
                return;
            }

            // El saldo que importa es el que confirma el servidor, no una suma local.
            if (typeof result.data.balance === 'number') { availableNodes = result.data.balance; updateCounterDisplay(); }
            alert(`¡Éxito! Se han añadido ${result.data.nodesAdded} nodos a tu cuenta.`);

            document.getElementById('storeModal').classList.add('hidden');
            document.getElementById('storeModal').classList.remove('flex');
        },
        onCancel: function () {
            // El usuario cerró la ventana de PayPal sin terminar: "intentó pagar
            // pero no pudo/no quiso" en el sentido más literal.
            track('payment_cancelled');
        },
        onError: function (err) {
            console.error('[paypal]', err);
            if (!/auth_required|create_order_failed/.test(String(err?.message))) {
                alert('Ocurrió un problema con PayPal. Intenta de nuevo en un momento.');
            }
        }
    }).render('#paypal-button-container');
})();

// ==========================================
// 17. PETICIÓN PERSONALIZADA POR NODO
// ==========================================
const btnMenuCustom = document.getElementById('btnMenuCustom');
const customPromptBox = document.getElementById('customPromptBox');
const customPromptInput = document.getElementById('customPromptInput');
const btnSendCustomPrompt = document.getElementById('btnSendCustomPrompt');

btnMenuCustom?.addEventListener('click', (e) => {
    e.stopPropagation();
    customPromptBox.classList.toggle('hidden');
    customPromptBox.classList.toggle('flex');
    if (!customPromptBox.classList.contains('hidden')) {
        customPromptInput.focus();
    }
});

// Ocultar el cuadro de texto cuando se cierre o abra el menú en otro nodo
network.on('click', () => {
    if (customPromptBox) {
        customPromptBox.classList.add('hidden');
        customPromptBox.classList.remove('flex');
    }
});

btnSendCustomPrompt?.addEventListener('click', async () => {
    const customRequest = customPromptInput.value.trim();
    if (!customRequest || !selectedNodeId) return;

    const originNodeId = selectedNodeId;

    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    customPromptBox.classList.add('hidden');
    customPromptBox.classList.remove('flex');

    if (!requireAuth("realizar peticiones personalizadas")) return;
    if (!checkBalance(1)) return;

    const currentNode = nodes.get(originNodeId);
    const topicName = currentNode.baseTitle || originNodeId;
    const contextPath = getContextPath(originNodeId);

    showLoader('Desarrollando tu petición...');

    try {
        const response = await fetch('/.netlify/functions/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'custom_prompt',
                topic: topicName,
                contextPath,
                customRequest,
                documentContext: globalDocumentContext || currentDocumentText
            })
        });

        if (!response.ok) throw new Error("Error en la respuesta");
        const data = await response.json();
        const generatedItems = data.nodes || [];

        if (!checkBalance(generatedItems.length)) return;

        // Bloquear nodos existentes temporalmente para que no salten
        nodes.update(nodes.get().map(n => ({ id: n.id, fixed: { x: true, y: true } })));
        const parentPos = network.getPositions([originNodeId])[originNodeId];
        network.setOptions({ physics: { enabled: true } });

        // 1. CREAR NODO INTERMEDIO CON LA PETICIÓN DEL USUARIO
        const queryNodeId = `query_${Date.now()}`;
        const queryX = parentPos.x;
        const queryY = parentPos.y + 130;

        nodes.add({
            id: queryNodeId,
            label: `*✨ Petición:*\n"${customRequest}"`,
            baseTitle: customRequest,
            x: queryX,
            y: queryY,
            fixed: { x: false, y: false },
            color: { background: '#eef2ff', border: '#818cf8' }, // Tono índigo suave distintivo
            shapeProperties: { borderRadius: 10, borderDashes: [3, 3] },
            widthConstraint: { minimum: 160, maximum: 240 }
        });

        edges.add({
            from: originNodeId,
            to: queryNodeId,
            label: 'consulta',
            color: { color: '#818cf8' },
            dashes: true
        });

        // 2. CREAR LOS NODOS DE RESPUESTA CONECTADOS AL NODO INTERMEDIO
        // Los nodos se mantienen pequeños siempre; el contenido largo (si lo hay) se
        // abre en su propio panel flotante, sin inflar el nodo en el lienzo.
        let createdCount = 0;
        let firstLongAnswer = null;
        generatedItems.forEach((item, idx) => {
            const newNodeId = item.id || `${originNodeId}_res_${Date.now()}_${idx}`;
            if (!nodes.get(newNodeId)) {
                const hasLongContent = item.content && item.content.trim().length > 0;
                const offsetX = (idx - ((generatedItems.length - 1) / 2)) * 220;

                nodes.add({
                    id: newNodeId,
                    label: `*${item.title}*`,
                    baseTitle: item.title,
                    definition: item.content || null,
                    color: getRandomColor(),
                    x: queryX + offsetX,
                    y: queryY + 150,
                    fixed: { x: false, y: false },
                    widthConstraint: { minimum: 150, maximum: 250 }
                });

                edges.add({
                    from: queryNodeId,
                    to: newNodeId,
                    label: item.relationship
                });

                trackNodeUsage(item.title);
                createdCount++;
                if (hasLongContent && !firstLongAnswer) {
                    firstLongAnswer = { id: newNodeId, title: item.title, content: item.content };
                }
            }
        });

        customPromptInput.value = '';
        applyServerBalance(data); consumeNodes(createdCount);
        if (firstLongAnswer) showContentInFloatingPanel(firstLongAnswer.id, firstLongAnswer.title, firstLongAnswer.content);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1400);
    } catch (err) {
        console.error(err);
        alert("Intenta de nuevo en unos segundos");
    } finally {
        hideLoader();
    }
});
// ==========================================
// 19. MODAL DE AYUDA / GUÍA DE USO
// ==========================================
const helpModal = document.getElementById('helpModal');

function openHelpModal() {
    if (!helpModal) return;
    helpModal.classList.remove('hidden');
    helpModal.classList.add('flex');
}

function closeHelp() {
    if (!helpModal) return;
    helpModal.classList.add('hidden');
    helpModal.classList.remove('flex');
}

document.getElementById('btnHelp')?.addEventListener('click', openHelpModal);
document.getElementById('closeHelpModal')?.addEventListener('click', closeHelp);
document.getElementById('btnGotItHelp')?.addEventListener('click', closeHelp);

// Cerrar también si el usuario hace clic en el fondo oscuro fuera de la tarjeta
helpModal?.addEventListener('click', (e) => {
    if (e.target === helpModal) closeHelp();
});

// ==========================================
// 20. PENSAMIENTO CRÍTICO (ANTÍTESIS) Y RETO SOCRÁTICO
// ==========================================
document.getElementById('btnMenuAntithesis')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
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
        nodes.update(nodes.get().map(n => ({ id: n.id, fixed: { x: true, y: true } })));
        const parentPos = network.getPositions([originId])[originId];
        network.setOptions({ physics: { enabled: true } });

        let count = 0;
        (data.critiques || []).forEach((crit, idx) => {
            const cId = crit.id && !nodes.get(crit.id) ? crit.id : `anti_${Date.now()}_${idx}`;
            // El nodo solo lleva el título corto (⚡ + nombre de la teoría/autor/
            // fenómeno). La crítica completa (crit.explanation) se guarda como
            // "definition" pregenerada, para que "Ver definición" la muestre en
            // el panel flotante sin volver a llamar a Gemini (ver más abajo el
            // ajuste de cacheIsUsable/defSource === 'pregenerated').
            nodes.update({
                id: cId,
                label: `*⚡ ${crit.label}*`,
                baseTitle: crit.label,
                definition: crit.explanation || crit.label,
                definitionSource: 'pregenerated',
                color: { background: '#fff1f2', border: '#f43f5e' },
                x: parentPos.x + ((idx - 1) * 180),
                y: parentPos.y + 150,
                fixed: { x: false, y: false }
            });
            edges.add({ from: originId, to: cId, label: crit.relationship, color: { color: '#f43f5e' }, dashes: [5, 5] });
            trackNodeUsage(crit.label);
            count++;
        });
        applyServerBalance(data); consumeNodes(count);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1200);
    } catch { alert("Error al generar antítesis."); } finally { hideLoader(); }
});

document.getElementById('btnMenuChallenge')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
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

        // Panel propio para el reto (no es la definición de ningún nodo existente,
        // así que usa un id sintético para no chocar con el panel de otro nodo).
        const challengePanelId = `socratic_${originId}_${Date.now()}`;
        const panel = openFloatingPanel(challengePanelId, `🧠 Reto Socrático: ${topicName}`);
        panel.el.dataset.nodeId = challengePanelId;
        panel.contentEl.innerHTML = `
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

        panel.contentEl.querySelector('#btnSubmitSocratic')?.addEventListener('click', async () => {
            const userAnswer = panel.contentEl.querySelector('#socraticInput').value.trim();
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

                const fbBox = panel.contentEl.querySelector('#socraticFeedbackBox');
                fbBox.innerHTML = `<p class="font-bold text-amber-400 mb-1">🌟 Veredicto:</p><p>${evalData.feedback}</p>`;
                fbBox.classList.remove('hidden');

                const parentPos = network.getPositions([originId])[originId];
                const masteryId = `mastery_${Date.now()}`;
                const masterySynthesis = `Tu síntesis: "${userAnswer}"\n\nRetroalimentación: ${evalData.feedback}`;
                // Nodo pequeño como el resto; la síntesis completa se abre en su propio panel.
                nodes.update({
                    id: masteryId,
                    label: `*🏆 Dominio:*\n${evalData.masteryNodeTitle}`,
                    baseTitle: evalData.masteryNodeTitle,
                    definition: masterySynthesis,
                    color: { background: '#fefce8', border: '#eab308' },
                    borderWidth: 2.5,
                    x: parentPos.x, y: parentPos.y + 150,
                    fixed: { x: false, y: false }
                });
                edges.add({ from: originId, to: masteryId, label: 'síntesis propia', color: { color: '#eab308' } });
                applyServerBalance(evalData); consumeNodes(1);
                showContentInFloatingPanel(masteryId, `🏆 ${evalData.masteryNodeTitle}`, masterySynthesis);
            } catch { alert("Error al evaluar."); } finally { hideLoader(); }
        });
    } catch { alert("Error al iniciar el reto."); } finally { hideLoader(); }
});