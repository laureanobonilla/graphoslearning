// ==========================================
// 0. COBRO MANUAL (temporal, mientras PayPal no habilite tarjeta de invitado)
// ==========================================
// La tienda ya NO muestra el botón de pago automático: muestra estos datos de
// contacto para que el cliente escriba, pague por otro medio, y tú le
// acredites los nodos a mano (ver LEEME_ETAPA_2.md, sección 11). Reemplaza
// estos 2 valores por los tuyos reales antes de publicar.
const SUPPORT_WHATSAPP_NUMBER = '50687772993'; // Código de país + número, solo dígitos, sin "+" ni espacios (ej. Costa Rica: 506XXXXXXXX)
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

// ==========================================
// DESHACER (Ctrl/Cmd+Z): cualquier cambio que el usuario haga en el esquema
// (crear/editar/borrar un nodo o una flecha, generar un esquema completo,
// arrastrar un nodo a otra posición...) debe poder regresarse a como estaba
// justo antes de esa acción.
//
// Enfoque: en vez de modificar cada uno de los muchos lugares del código que
// llaman a nodes.add/update/remove/clear o edges.add/update/remove/clear, se
// envuelven esos 4 métodos UNA sola vez aquí mismo, justo donde nacen los
// DataSets. Cada envoltura, antes de dejar pasar la llamada real, guarda una
// "foto" (snapshot) de cómo estaba TODO el esquema (todos los nodos y todas
// las flechas) en ese instante — así no importa cuál función interna haya
// disparado el cambio, ni si el día de mañana se agrega una nueva.
//
// Para que "generar un esquema completo" (que internamente llama a
// nodes.add/edges.add muchas veces, una por cada rama/sub-rama) cuente como
// UNA sola acción deshacer-ble y no como una entrada distinta por cada nodo,
// se usa una ventana corta: la primera mutación de un grupo toma la foto y
// abre la ventana; cualquier otra mutación que llegue mientras esa ventana
// sigue abierta (es decir, en el mismo tick síncrono) NO toma una foto nueva.
// La ventana se cierra sola con un setTimeout(…, 0), lo que agrupa bien las
// acciones típicas (un clic = una tanda de cambios síncronos) sin necesidad
// de marcar a mano cada función que muta el esquema.
// ==========================================
const MAX_UNDO_STEPS = 40;
let undoStack = [];
let isApplyingUndo = false;
let undoSnapshotWindowOpen = false;

function snapshotSchemaState() {
    return { nodeData: nodes.get(), edgeData: edges.get() };
}

function captureUndoSnapshotIfNeeded() {
    if (isApplyingUndo || undoSnapshotWindowOpen) return;
    undoSnapshotWindowOpen = true;
    undoStack.push(snapshotSchemaState());
    if (undoStack.length > MAX_UNDO_STEPS) undoStack.shift();
    refreshUndoButtonState();
    setTimeout(() => { undoSnapshotWindowOpen = false; }, 0);
}

// Envuelve add/update/remove/clear de un DataSet para que cada llamada real
// quede precedida por una foto del estado (si hace falta, ver arriba).
function wireUndoTracking(dataset) {
    ['add', 'update', 'remove', 'clear'].forEach((method) => {
        const original = dataset[method].bind(dataset);
        dataset[method] = function (...args) {
            captureUndoSnapshotIfNeeded();
            return original(...args);
        };
    });
}
wireUndoTracking(nodes);
wireUndoTracking(edges);

function refreshUndoButtonState() {
    const btn = document.getElementById('btnUndo');
    if (btn) btn.disabled = undoStack.length === 0;
}

// Regresa el esquema completo (nodos + flechas) a como estaba justo antes de
// la última acción del usuario. No es un "deshacer campo por campo": restaura
// la foto entera, así que cualquier tipo de cambio (crear, editar, borrar,
// mover, generar en lote) se deshace de la misma forma.
function performUndo() {
    if (!undoStack.length) return;
    const snapshot = undoStack.pop();
    isApplyingUndo = true;
    try {
        nodes.clear();
        edges.clear();
        if (snapshot.nodeData.length) nodes.add(snapshot.nodeData);
        if (snapshot.edgeData.length) edges.add(snapshot.edgeData);
    } finally {
        isApplyingUndo = false;
    }
    refreshUndoButtonState();
    if (typeof network !== 'undefined' && network) network.redraw();
}

document.getElementById('btnUndo')?.addEventListener('click', performUndo);
document.addEventListener('keydown', (e) => {
    const key = e.key ? e.key.toLowerCase() : '';
    if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        // No interferir si el foco está en un campo de texto donde Ctrl/Cmd+Z
        // tiene su propio significado normal (deshacer texto escrito, no el esquema).
        const tag = document.activeElement ? document.activeElement.tagName : '';
        const isEditableField = tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable);
        if (isEditableField) return;
        e.preventDefault();
        performUndo();
    }
});

let currentDocumentText = "";
let selectedDensity = 'auto';
// Cómo se acomodan las ramas/sub-ramas al generar un esquema nuevo — "tree"
// (el árbol de bloques de siempre) es el default; "solar" es el acomodo
// radial en prueba. Se cambia con el selector "Modo" de la cabecera.
let schemaLayoutMode = 'tree';
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

// ==========================================
// 1.b MICRO-SONIDO AL CREAR NODOS (togglable, Web Audio sintetizado — sin
// archivos de audio que cargar)
// ==========================================
let soundEnabled = false;
let audioCtxSingleton = null;
function getAudioCtx() {
    if (!audioCtxSingleton) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtxSingleton = new AC();
    }
    if (audioCtxSingleton.state === 'suspended') audioCtxSingleton.resume();
    return audioCtxSingleton;
}
// Un "tin" breve y suave (campanita de cristal), no un beep genérico.
function playChime(freq = 880) {
    if (!soundEnabled) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
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

// Rellena el bloque de contacto (enlace de WhatsApp con mensaje ya armado, y
// el correo visible como texto) cada vez que se abre la tienda. Deliberadamente
// no menciona paquete ni precio: eso se conversa por chat, no se expone en la UI
// como si fuera un cobro automático (ver nota en index.html, modal storeModal).
function updateManualPurchaseBox() {
    const userEmail = (typeof currentUser !== 'undefined' && currentUser?.email) ? currentUser.email : '(sin iniciar sesión)';

    const emailAddressEl = document.getElementById('manualPurchaseEmailAddress');
    if (emailAddressEl) emailAddressEl.innerText = SUPPORT_EMAIL;
    const emailLinkEl = document.getElementById('manualPurchaseEmailLink');
    if (emailLinkEl) emailLinkEl.href = `mailto:${SUPPORT_EMAIL}`;

    const message = `Hola! 👋 Ya usé mis nodos disponibles en Graphikosmos y quiero seguir creando esquemas. Mi correo de la cuenta es: ${userEmail}`;
    const waLink = document.getElementById('manualPurchaseWhatsapp');
    if (waLink) waLink.href = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

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

// ==========================================
// DIÁLOGOS PROPIOS DE LA APP (reemplazan alert/confirm/prompt nativos)
// ==========================================
// Los diálogos nativos del navegador (alert/confirm/prompt) se ven fuera de
// estilo, bloquean TODA la pestaña mientras están abiertos (incluida la
// animación del loader) y no se pueden personalizar. appAlert/appConfirm/
// appPrompt hacen exactamente lo mismo (avisar, pedir sí/no, pedir un texto)
// pero con el modal propio #appDialogModal — mismo estilo que el resto de
// modales de la app — y devuelven una Promise en vez de bloquear el hilo:
//   await appAlert("mensaje")              // antes: appAlert("mensaje")
//   if (await appConfirm("¿Seguro?")) {...} // antes: if (confirm("¿Seguro?")) {...}
//   const t = await appPrompt("Nombre:", "valor actual") // antes: prompt(...)
// Solo puede haber un diálogo visible a la vez: si se pide uno mientras otro
// sigue abierto (o pendiente), se encola y espera su turno en vez de pisarlo.
const appDialogModal = document.getElementById('appDialogModal');
const appDialogTitle = document.getElementById('appDialogTitle');
const appDialogMessage = document.getElementById('appDialogMessage');
const appDialogInput = document.getElementById('appDialogInput');
const appDialogCancel = document.getElementById('appDialogCancel');
const appDialogOk = document.getElementById('appDialogOk');

let dialogQueue = Promise.resolve();

function showAppDialog({ title = '', message = '', mode = 'alert', defaultValue = '', okText, cancelText = 'Cancelar' }) {
    const run = () => new Promise((resolve) => {
        if (!appDialogModal) {
            // Red de seguridad por si el HTML no cargó este modal por algún motivo:
            // en vez de dejar al usuario sin ningún aviso, caemos al nativo del navegador.
            if (mode === 'confirm') resolve(confirm(message));
            else if (mode === 'prompt') resolve(prompt(message, defaultValue));
            else { alert(message); resolve(undefined); }
            return;
        }

        const isPrompt = mode === 'prompt';
        const isConfirm = mode === 'confirm' || isPrompt;

        if (appDialogTitle) {
            appDialogTitle.textContent = title;
            appDialogTitle.classList.toggle('hidden', !title);
        }
        if (appDialogMessage) appDialogMessage.textContent = message;
        if (appDialogOk) appDialogOk.textContent = okText || (isPrompt ? 'Guardar' : 'Entendido');
        if (appDialogInput) {
            appDialogInput.classList.toggle('hidden', !isPrompt);
            if (isPrompt) appDialogInput.value = defaultValue || '';
        }
        if (appDialogCancel) {
            appDialogCancel.classList.toggle('hidden', !isConfirm);
            appDialogCancel.textContent = cancelText;
        }

        appDialogModal.classList.remove('hidden');
        appDialogModal.classList.add('flex');

        const cleanup = () => {
            appDialogModal.classList.add('hidden');
            appDialogModal.classList.remove('flex');
            appDialogOk.removeEventListener('click', onOk);
            appDialogCancel.removeEventListener('click', onCancel);
            appDialogInput.removeEventListener('keydown', onKeydown);
        };
        const onOk = () => {
            cleanup();
            if (mode === 'prompt') resolve(appDialogInput.value);
            else resolve(mode === 'confirm' ? true : undefined);
        };
        const onCancel = () => {
            cleanup();
            if (mode === 'prompt') resolve(null);
            else resolve(mode === 'confirm' ? false : undefined);
        };
        const onKeydown = (e) => {
            if (e.key === 'Enter' && (!isPrompt || document.activeElement === appDialogInput)) { e.preventDefault(); onOk(); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        };

        appDialogOk.addEventListener('click', onOk);
        appDialogCancel.addEventListener('click', onCancel);
        appDialogInput.addEventListener('keydown', onKeydown);

        setTimeout(() => { (isPrompt ? appDialogInput : appDialogOk)?.focus(); }, 30);
    });

    const result = dialogQueue.then(run);
    dialogQueue = result.catch(() => {});
    return result;
}

function appAlert(message, opts = {}) {
    return showAppDialog({ ...opts, message, mode: 'alert' });
}
function appConfirm(message, opts = {}) {
    return showAppDialog({ ...opts, message, mode: 'confirm' });
}
function appPrompt(message, defaultValue = '', opts = {}) {
    return showAppDialog({ ...opts, message, defaultValue, mode: 'prompt' });
}

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
// Devuelve true si ya se manejó (el llamador no debe seguir con su propio appAlert()).
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
        appAlert('Estás generando muy rápido. Espera un minuto y vuelve a intentar.');
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
// "Asentado" orgánico: en vez de que los nodos nuevos aparezcan ya fijos en
// su posición final (geométrica, rígida), los dejamos libres un instante con
// física suave encendida SOLO para ellos — los nodos ya existentes quedan
// fijos mientras tanto para no desordenar el resto del esquema — y dejamos
// que decanten a un acomodo natural. El listener global ya existente
// (stopPhysicsAndUnlock, arriba) apaga la física y libera TODOS los nodos en
// cuanto el motor se estabiliza, así que no hace falta duplicar esa lógica.
function settleNewNodesOrganically(newIds) {
    if (!newIds || !newIds.length) return;
    // El "sonido al crear nodos" (toggle de la cabecera) solo sonaba para
    // creaciones de UN nodo a la vez (flashNewNode, usado por "Conceptos
    // Relacionados", extraer del texto, etc.) — pero NUNCA para el caso más
    // común de todos: generar un esquema completo, que crea varios nodos de
    // golpe y pasa por AQUÍ, no por flashNewNode. Por eso con el sonido
    // encendido "nunca sonaba nada" en el uso normal. Un "tin" por nodo, en
    // cascada (no los varios a la vez, que sonaría como un acorde feo), con
    // un tono levemente distinto cada vez para que no se sienta repetitivo.
    newIds.forEach((id, i) => {
        setTimeout(() => playChime(600 + Math.random() * 200), i * 65);
    });
    const allIds = nodes.getIds();
    const updates = allIds.map(id => ({
        id,
        fixed: newIds.includes(id) ? { x: false, y: false } : { x: true, y: true }
    }));
    nodes.update(updates);
    network.setOptions({
        physics: {
            enabled: true,
            solver: 'repulsion',
            // `nodeDistance` más grande que el tamaño real de las tarjetas:
            // así el solver sigue empujando a dos nodos aunque ya no se
            // vean superpuestos a simple vista, dejando más aire entre
            // ellos en vez de conformarse con el primer "ya no se tocan".
            repulsion: { nodeDistance: 190, centralGravity: 0.015, springLength: 140, springConstant: 0.03, damping: 0.4 },
            stabilization: { enabled: true, iterations: 180, fit: false }
        }
    });
    // Respaldo: si por lo que sea el motor nunca dispara "stabilized" (p.ej.
    // ya estaba perfectamente quieto), forzamos el apagado tras un momento.
    setTimeout(() => { stopPhysicsAndUnlock(); }, 2000);
}

async function renderThreeLevelTree(data, opts = {}) {
    const { originPanelId = null, attachToNodeId = null } = opts;
    // Si hay más de un panel de lectura registrado, coloreamos el borde de
    // cada nodo según de qué panel vino, para que se note a simple vista qué
    // parte del esquema salió de cuál texto. Con un solo panel en juego no
    // cambiamos nada del aspecto visual de siempre.
    const multiPanelMode = readerPanelRegistry.size > 1 && !!originPanelId;
    const originAccent = originPanelId ? readerPanelRegistry.get(originPanelId)?.accent : null;
    // Si el nodo trae una cita del texto, lo coloreamos a juego con el color
    // que va a usarse para resaltar esa misma cita en el lector (ver
    // highlightColorPalette más abajo) — así el color conecta visualmente el
    // nodo con el fragmento exacto de donde salió. Si no hay cita (esquema
    // generado solo a partir de un tema, sin documento), seguimos usando la
    // paleta aleatoria de siempre.
    const appearanceFor = (hasQuote) => {
        if (hasQuote) {
            const hc = nextHighlightColor();
            return {
                color: { background: hc.node.background, border: (multiPanelMode && originAccent) ? originAccent : hc.node.border },
                highlightColorIdx: hc.idx
            };
        }
        return { color: getRandomColor(), highlightColorIdx: null };
    };

    // IDs de los nodos que se agregan EN ESTA llamada (para el "asentado"
    // orgánico de física al final — ver settleNewNodesOrganically más abajo —
    // y para la vista previa de importancia por grado de conexión).
    const newNodeIds = [];

    const root = data.root;
    const branches = data.branches || [];
    const subBranches = data.subBranches || [];

    // Estos cálculos solo dependen de los datos del esquema nuevo (no del
    // lienzo), así que se adelantan: los necesitamos YA para saber qué tan
    // ancho va a quedar el árbol y poder ubicarlo sin pisar lo que ya hay
    // (ver más abajo, "agregar al actual").
    const childrenByBranch = {};
    branches.forEach(b => { childrenByBranch[b.id] = []; });
    subBranches.forEach(sb => {
        if (childrenByBranch[sb.parentId]) {
            childrenByBranch[sb.parentId].push(sb);
        } else if (branches.length > 0) {
            childrenByBranch[branches[0].id].push(sb);
        }
    });

    // Dos modos de acomodo, elegidos con el selector "Modo" de la cabecera
    // (default: "tree", el árbol de bloques de siempre). "solar" es el
    // acomodo radial en prueba (ramas en órbita alrededor de la raíz).
    const isSolarMode = (typeof schemaLayoutMode !== 'undefined' && schemaLayoutMode === 'solar');
    const branchCount = Math.max(1, branches.length);

    // --- Modo "Árbol": ramas en bloques horizontales, de arriba hacia abajo. ---
    const colSpacing = 200;
    const rowSpacing = 110;
    const branchGap = 80; // separación limpia entre grupos de ramas
    const branchWidths = branches.map(b => {
        const count = childrenByBranch[b.id].length;
        const cols = count <= 1 ? 1 : 2; // Máximo 2 columnas por cada rama de Nivel 2
        return (cols * colSpacing) + branchGap;
    });
    const treeTotalWidth = branchWidths.reduce((sum, w) => sum + w, 0);

    // --- Modo "Sistema solar": ramas en órbita alrededor de la raíz,
    // repartidas en círculo, y cada sub-rama en una órbita más pequeña
    // alrededor de SU rama — en abanico hacia afuera (nunca hacia el
    // centro), para que no se cruce con las ramas vecinas.
    const minBranchSpacing = 230; // separación mínima centro a centro entre ramas vecinas en su órbita
    const branchOrbitRadius = branchCount <= 1 ? 220 : Math.max(220, (branchCount * minBranchSpacing) / (2 * Math.PI));
    const subOrbitRadius = 180;
    const maxSubSpread = branchCount > 1 ? (2 * Math.PI / branchCount) * 0.85 : (Math.PI * 0.75);
    const solarTotalWidth = (branchOrbitRadius + subOrbitRadius + 110) * 2;

    // Ancho/diámetro aproximado que va a ocupar el árbol completo en el modo
    // activo — se usa para ubicarlo sin pisar lo que ya haya en el lienzo
    // (ver "agregar al actual" más abajo).
    const totalTreeWidth = isSolarMode ? solarTotalWidth : treeTotalWidth;

    let rootX, rootY, rootId;
    const viewCenter = network.getViewPosition();

    if (attachToNodeId && nodes.get(attachToNodeId)) {
        // "Generar esquema completo a partir de aquí" sobre un nodo que ya
        // existe en el lienzo: el esquema nuevo PARTE de ese nodo (no se crea
        // una raíz aparte ni se pregunta si limpiar el lienzo — siempre se
        // agrega alrededor del nodo elegido).
        const existingPos = network.getPositions([attachToNodeId])[attachToNodeId];
        rootId = attachToNodeId;
        rootX = existingPos.x;
        rootY = existingPos.y;
    } else if (nodes.length > 1) {
        const shouldClear = await appConfirm("Ya tienes un esquema en el lienzo. ¿Deseas limpiar el lienzo existente antes de generar el nuevo?", {
            title: '¿Limpiar el lienzo?',
            okText: 'Sí, crear proyecto nuevo',
            cancelText: 'No, agregar al actual'
        });
        if (shouldClear) {
            isClearingCanvas = true;
            clearTimeout(window._binSaveTimer);
            currentProjectId = null;
            localStorage.removeItem('gk_current_project_id');
            nodes.clear();
            edges.clear();
            isClearingCanvas = false;
            rootX = viewCenter.x;
            rootY = viewCenter.y - (isSolarMode ? 0 : 200); // en modo árbol se empuja arriba (crece hacia abajo); en modo solar queda centrado (crece en todas direcciones)
            rootId = root.id;
        } else {
            // "Agregar al actual": antes esto sumaba un offset fijo (900px) al
            // centro de la vista, que no era confiable — si el esquema que ya
            // estaba ahí era más ancho que eso (o la vista no estaba centrada
            // sobre él, p. ej. porque el usuario la movió, o porque este
            // esquema nuevo se generó desde un segundo panel de lector), el
            // árbol nuevo terminaba traslapado con el que ya había. Ahora se
            // calcula el borde derecho REAL de todo lo que ya existe en el
            // lienzo (con sus posiciones actuales, muevan o no) y el árbol
            // nuevo se ubica a la derecha de ESE borde, con margen de sobra
            // para su propio ancho — así nunca se superponen, sin importar
            // desde qué panel se generó ni dónde esté mirando la cámara.
            const existingPositions = Object.values(network.getPositions());
            const rightEdge = existingPositions.length > 0
                ? Math.max(...existingPositions.map(p => p.x)) + 140 // +140 ≈ mitad del ancho máximo de un nodo
                : viewCenter.x;
            const margin = 220;
            rootX = rightEdge + margin + (totalTreeWidth / 2);
            rootY = viewCenter.y - (isSolarMode ? 0 : 200); // en modo árbol se empuja arriba (crece hacia abajo); en modo solar queda centrado (crece en todas direcciones)
            rootId = root.id;
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
        rootX = viewCenter.x;
        rootY = viewCenter.y - (isSolarMode ? 0 : 200); // en modo árbol se empuja arriba (crece hacia abajo); en modo solar queda centrado (crece en todas direcciones)
        rootId = root.id;
    }

    // Reducir el Modo Lector a su tamaño mínimo (300px) para maximizar el lienzo
    if (readerPanel && !readerPanel.classList.contains('hidden')) {
        readerPanel.classList.remove('w-1/3');
        readerPanel.style.flex = 'none';
        readerPanel.style.width = '300px';
        if (typeof network !== 'undefined') network.redraw();
    }

    // 2. Crear Raíz (Nivel 1) — salvo que el esquema esté partiendo de un
    // nodo que YA existe en el lienzo (attachToNodeId): en ese caso ese nodo
    // ya es la raíz, no se crea uno nuevo aparte ni se toca su texto.
    if (!attachToNodeId) {
        const rootAppearance = appearanceFor(!!(root.sourceQuote && root.sourceQuote.trim()));
        nodes.add({
            id: root.id, label: `*${root.label}*`, baseTitle: root.label,
            color: rootAppearance.color, definition: root.definition || null,
            x: rootX, y: rootY, fixed: { x: false, y: false },
            widthConstraint: { minimum: 140, maximum: 220 },
            sourceQuote: root.sourceQuote || '', originPanelId: originPanelId,
            highlightColorIdx: rootAppearance.highlightColorIdx, depthLevel: 0
        });
        trackNodeUsage(root.label);
        newNodeIds.push(root.id);
    }

    // 4. Posicionar Nivel 2 (ramas) y Nivel 3 (sub-ramas), según el modo activo.
    let currentLeftX = rootX - (treeTotalWidth / 2); // solo lo usa el modo "Árbol"
    const branchYTree = rootY + 150;
    const subBranchBaseYTree = branchYTree + 140;

    branches.forEach((branch, idx) => {
        let branchX, branchY, branchAngle = null;
        if (isSolarMode) {
            // Empezamos arriba (como las 12 del reloj) y repartimos el resto
            // en círculo, en sentido horario.
            branchAngle = branchCount === 1
                ? -Math.PI / 2
                : (idx * (2 * Math.PI / branchCount)) - Math.PI / 2;
            branchX = rootX + branchOrbitRadius * Math.cos(branchAngle);
            branchY = rootY + branchOrbitRadius * Math.sin(branchAngle);
        } else {
            const sectionWidth = branchWidths[idx];
            branchX = currentLeftX + (sectionWidth / 2);
            branchY = branchYTree;
        }

        const branchAppearance = appearanceFor(!!(branch.sourceQuote && branch.sourceQuote.trim()));
        nodes.add({
            id: branch.id, label: `*${branch.label}*`, baseTitle: branch.label,
            color: branchAppearance.color, definition: branch.definition || null,
            x: branchX, y: branchY, fixed: { x: false, y: false },
            widthConstraint: { minimum: 130, maximum: 200 },
            sourceQuote: branch.sourceQuote || '', originPanelId: originPanelId,
            highlightColorIdx: branchAppearance.highlightColorIdx, depthLevel: 1
        });
        edges.add({ from: rootId, to: branch.id, label: branch.relationship });
        trackNodeUsage(branch.label);
        newNodeIds.push(branch.id);

        const subs = childrenByBranch[branch.id];
        const subSpread = isSolarMode && subs.length > 1 ? Math.min(maxSubSpread, (subs.length - 1) * 0.55) : 0;
        const subCols = !isSolarMode ? (subs.length <= 1 ? 1 : 2) : null;

        subs.forEach((sub, sIdx) => {
            let subX, subY;
            if (isSolarMode) {
                // Las lunas se reparten centradas en la misma dirección de su
                // rama (la que mira hacia afuera de la raíz), nunca hacia adentro.
                const t = subs.length === 1 ? 0 : (sIdx / (subs.length - 1)) - 0.5;
                const subAngle = branchAngle + (t * subSpread);
                subX = branchX + subOrbitRadius * Math.cos(subAngle);
                subY = branchY + subOrbitRadius * Math.sin(subAngle);
            } else {
                const row = Math.floor(sIdx / subCols);
                const col = sIdx % subCols;
                // Si es la última fila y quedó un nodo impar suelto, lo centramos bajo su rama
                const isLastOdd = (sIdx === subs.length - 1) && (subs.length % 2 !== 0) && (subCols === 2);
                const offsetX = isLastOdd ? 0 : (col === 0 ? -colSpacing / 2 : colSpacing / 2);
                subX = branchX + (subCols === 1 ? 0 : offsetX);
                subY = subBranchBaseYTree + (row * rowSpacing);
            }

            const subAppearance = appearanceFor(!!(sub.sourceQuote && sub.sourceQuote.trim()));
            nodes.add({
                id: sub.id, label: `*${sub.label}*`, baseTitle: sub.label,
                color: subAppearance.color, definition: sub.definition || null,
                x: subX, y: subY, fixed: { x: false, y: false },
                widthConstraint: { minimum: 120, maximum: 185 },
                sourceQuote: sub.sourceQuote || '', originPanelId: originPanelId,
                highlightColorIdx: subAppearance.highlightColorIdx, depthLevel: 2
            });
            edges.add({ from: branch.id, to: sub.id, label: sub.relationship });
            trackNodeUsage(sub.label);
            newNodeIds.push(sub.id);
        });

        if (!isSolarMode) currentLeftX += branchWidths[idx];
    });

    network.setOptions({ physics: { enabled: false } });

    // Dejamos que los nodos recién creados decanten con un asentado físico
    // breve y suave, en vez de quedar ya "congelados" en su posición final.
    settleNewNodesOrganically(newNodeIds);

    // Resaltar de forma permanente, en el panel de lectura de origen, los
    // fragmentos que ya quedaron convertidos en nodos de este esquema.
    if (originPanelId) highlightCoverageForPanel(originPanelId);

    // Esperamos un instante a que el DOM reajuste los 300px del lector para encuadrar de cerca.
    // Si el esquema partió de un nodo existente dentro de algo más grande, no
    // tiene sentido alejar la cámara para que quepa TODO el lienzo — mejor
    // quedarse encuadrados cerca de ese nodo y lo que se le acaba de agregar.
    setTimeout(() => {
        if (attachToNodeId) {
            network.focus(attachToNodeId, { scale: 0.85, animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
        } else {
            network.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
        }
    }, 60);

    // Una sola sugerencia descartable de vínculo entre nodos cuyas citas
    // quedaron muy cerca en el texto original.
    if (originPanelId) {
        setTimeout(() => suggestProximityLinks(originPanelId), 700);
    }
}

async function generateFullSchemaFromTopic(topicText, opts = {}) {
    if (!topicText) return;
    // Verificamos que tenga al menos saldo disponible para iniciar
    if (!checkBalance(1)) return;

    const { originPanelId = null, attachToNodeId = null } = opts;
    const isLong = topicText.trim().split(/\s+/).length >= 25;
    track('schema_generate_attempt', { mode: isLong ? 'text' : 'topic', length: topicText.length });

    showLoader(`Estructurando esquema...`);
    if (topicInput) topicInput.value = '';

    try {
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'parse_text', text: topicText })
        });
        if (!ok) {
            if (!handleBillingError(status, data)) appAlert(data?.error || 'Intenta de nuevo en unos segundos.');
            track('schema_generate_error', { mode: isLong ? 'text' : 'topic', message: String(data?.error || status).slice(0, 120) });
            return;
        }

        // Si se parte de un nodo existente, esa raíz ya estaba pagada (no se
        // crea un nodo nuevo para ella), así que no se vuelve a cobrar.
        const totalNodes = (attachToNodeId ? 0 : 1) + (data.branches?.length || 0) + (data.subBranches?.length || 0);

        await renderThreeLevelTree(data, { originPanelId, attachToNodeId });
        applyServerBalance(data); consumeNodes(totalNodes);
        track('schema_generate_success', { mode: isLong ? 'text' : 'topic', nodes: totalNodes });
    } catch (err) {
        console.error(err);
        track('schema_generate_error', { mode: isLong ? 'text' : 'topic', message: String(err?.message || '').slice(0, 120) });
        appAlert('Intenta de nuevo en unos segundos.');
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
    playChime();
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

// Campo pequeño de la cabecera: SIEMPRE crea un solo nodo en solitario con
// exactamente lo que se escribió, sin importar si es un tema corto, un texto
// largo o un enlace web. Generar un esquema completo a partir de un tema
// (investigándolo) o de un documento/enlace es una capacidad exclusiva del
// Modo Lector (ver btnParseReaderText más abajo) — aquí arriba el usuario
// espera que lo escrito aparezca tal cual como un nodo nuevo, nada más.
async function handleTopicInput() {
    const raw = topicInput.value.trim();
    if (!raw) return;
    insertSingleNode(raw);
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
            const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'custom_prompt',
                    topic: topicName,
                    contextPath: getContextPath(selectedNodeId),
                    customRequest: `Responde de forma clara, reveladora y directa a esta incógnita: ${topicName}`,
                    documentContext: globalDocumentContext || currentDocumentText
                })
            });
            if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || 'No se pudo resolver la incógnita.'); return; }
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
        } catch { appAlert("Error al resolver la incógnita."); } finally { hideLoader(); }
        return;
    }

    const nodeCountVal = document.getElementById('nodeCount')?.value || 'auto';
    const maxNodes = nodeCountVal === 'auto' ? 'entre 3 y 5 (según relevancia)' : parseInt(nodeCountVal, 10);
    const estimatedCost = nodeCountVal === 'auto' ? 4 : maxNodes;
    if (!checkBalance(estimatedCost)) return;

    if (currentNode && currentNode.expanded) return;
    showLoader('Generando conceptos e incógnitas...');

    try {
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({
                action: 'expand',
                topic: topicName,
                contextPath: getContextPath(selectedNodeId),
                maxNodes,
                includeCuriosity: true,
                documentContext: globalDocumentContext || currentDocumentText
            })
        });
        if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || 'No se pudieron generar conceptos relacionados.'); return; }
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
    } catch { appAlert("Error al conectar con el servicio."); } finally { hideLoader(); }
});

// ==========================================
// 8. GENERAR EJEMPLOS MANUALMENTE
// ==========================================
document.getElementById('btnMenuExamples')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const nodeCountVal = document.getElementById('nodeCount')?.value || 'auto';
    const maxNodes = nodeCountVal === 'auto' ? 'varios (entre 3 y 5 representativos)' : parseInt(nodeCountVal, 10);
    const estimatedCost = nodeCountVal === 'auto' ? 4 : maxNodes;
    if (!checkBalance(estimatedCost)) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    const topicName = currentNode.baseTitle || selectedNodeId;

    showLoader('Buscando casos prácticos...');

    try {
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'examples', topic: topicName, contextPath, maxNodes, documentContext: globalDocumentContext || currentDocumentText })
        });
        if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || 'No se pudieron generar ejemplos.'); return; }
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
    } catch { appAlert("Error al conectar con el servicio."); } finally { hideLoader(); }
});

// ==========================================
// 13. EVENTOS DEL CANVAS (MENÚ DINÁMICO, VÍNCULOS Y SINERGIA)
// ==========================================

// Resalta el nodo sobre el que se abrió el menú contextual (borde y sombra
// más marcados) para que se sienta que el menú "salió" de ese nodo y no de
// cualquier parte. Se revierte solo, apenas el menú se oculta por cualquier
// motivo (otra acción, clic afuera, Esc, zoom, etc.) gracias al observer de
// abajo, así que no hay que acordarse de limpiarlo en cada lugar que cierra
// el menú.
let menuHighlightedNodeId = null;
let menuHighlightedOriginalStyle = null; // { color, borderWidth, shadow } del nodo, para restaurar EXACTO al cerrar
function setNodeMenuHighlight(nodeId) {
    if (menuHighlightedNodeId && menuHighlightedNodeId !== nodeId) clearNodeMenuHighlight();
    const node = nodes.get(nodeId);
    if (!node) return;
    menuHighlightedNodeId = nodeId;
    menuHighlightedOriginalStyle = { color: node.color, borderWidth: node.borderWidth, shadow: node.shadow };
    // Un color de borde bien contrastante (ámbar) además de más grueso/con más
    // sombra — solo con grosor/sombra no se notaba lo suficiente, sobre todo
    // una vez que vis.js aplica su propio estilo de "nodo seleccionado" encima.
    // También se fija `color.highlight` al mismo ámbar para que ese estilo de
    // "seleccionado" no lo tape con otra cosa.
    const bg = (node.color && node.color.background) || '#fdfbf7';
    nodes.update({
        id: nodeId,
        borderWidth: 5,
        color: { background: bg, border: '#fbbf24', highlight: { background: bg, border: '#fbbf24' } },
        shadow: { enabled: true, color: 'rgba(251, 191, 36, 0.85)', size: 34, x: 0, y: 0 }
    });
}
function clearNodeMenuHighlight() {
    if (!menuHighlightedNodeId) return;
    const id = menuHighlightedNodeId;
    const original = menuHighlightedOriginalStyle;
    menuHighlightedNodeId = null;
    menuHighlightedOriginalStyle = null;
    if (nodes.get(id) && original) {
        nodes.update({ id, color: original.color, borderWidth: original.borderWidth, shadow: original.shadow });
    }
    // Por si el grado de conexión cambió mientras el menú estaba abierto
    // (poco común, pero posible), dejamos que el cálculo de importancia
    // (sección 22) recalcule grosor/sombra "normales" de paso.
    scheduleImportanceStyling();
}
new MutationObserver(() => {
    if (actionMenu.classList.contains('hidden') && menuHighlightedNodeId) clearNodeMenuHighlight();
}).observe(actionMenu, { attributes: true, attributeFilter: ['class'] });

// --- Submenús del menú contextual ("Enlazar" / "Generar") ------------------
// Cada grupo (el <div class="gk-menu-group"> que envuelve un botón-cabecera
// y su submenú) se abre al pasar el mouse por encima (con un pequeño margen
// antes de cerrarse, para poder mover el cursor hacia el submenú sin que se
// cierre de golpe) y también con un clic/toque, para que funcione igual en
// pantallas táctiles donde no existe el "hover". Solo un grupo puede estar
// abierto a la vez.
function closeAllMenuGroups(exceptEl = null) {
    document.querySelectorAll('.gk-menu-group .gk-submenu').forEach(sub => {
        if (sub !== exceptEl) sub.classList.add('hidden');
    });
}

function positionSubmenu(groupEl, submenuEl) {
    // Por omisión se abre a la derecha del menú principal; si no hay espacio,
    // se abre a la izquierda en su lugar — igual que ya hace el propio menú
    // contextual al aparecer.
    submenuEl.style.left = '100%';
    submenuEl.style.right = 'auto';
    submenuEl.style.marginLeft = '4px';
    submenuEl.style.marginRight = '';
    const rect = submenuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
        submenuEl.style.left = 'auto';
        submenuEl.style.right = '100%';
        submenuEl.style.marginLeft = '';
        submenuEl.style.marginRight = '4px';
    }
}

function wireMenuGroup(groupEl) {
    const submenuId = groupEl.dataset.submenu;
    const submenuEl = document.getElementById(submenuId);
    const headerBtn = groupEl.querySelector('button[id^="btnMenu"]');
    if (!submenuEl || !headerBtn) return;

    let closeTimer = null;
    const openGroup = () => {
        clearTimeout(closeTimer);
        closeAllMenuGroups(submenuEl);
        submenuEl.classList.remove('hidden');
        positionSubmenu(groupEl, submenuEl);
    };
    const scheduleClose = () => {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => submenuEl.classList.add('hidden'), 220);
    };

    groupEl.addEventListener('mouseenter', openGroup);
    groupEl.addEventListener('mouseleave', scheduleClose);
    headerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !submenuEl.classList.contains('hidden');
        if (isOpen) submenuEl.classList.add('hidden');
        else openGroup();
    });
}
document.querySelectorAll('.gk-menu-group').forEach(wireMenuGroup);
// Al cerrarse el menú principal (por cualquier motivo), cerramos también
// cualquier submenú que hubiera quedado abierto dentro de él.
new MutationObserver(() => {
    if (actionMenu.classList.contains('hidden')) closeAllMenuGroups();
}).observe(actionMenu, { attributes: true, attributeFilter: ['class'] });

network.on('click', async function (params) {
    if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0];

        // --- 0. VINCULAR FRAGMENTO SUBRAYADO COMO HIJO DE UN NODO EXISTENTE ---
        // Si el usuario pulsó "🔗 Vincular a nodo..." en el tooltip de selección,
        // el próximo clic en un nodo (sea cual sea) se interpreta como el nodo
        // padre elegido, en vez de disparar sinergia/otras acciones de clic.
        if (awaitingLinkTargetClick && pendingLinkSelection) {
            awaitingLinkTargetClick = false;
            document.body.classList.remove('gk-picking-link-target');
            const { text: topic, range: rangeToHighlight } = pendingLinkSelection;
            pendingLinkSelection = null;
            if (!checkBalance(1)) return;

            const parentNode = nodes.get(clickedNodeId);
            const parentPos = network.getPositions([clickedNodeId])[clickedNodeId];
            const spot = findFreeSpot(parentPos.x, parentPos.y + 130, 150);
            const nodeId = topic;

            if (!nodes.get(nodeId)) {
                nodes.add({
                    id: nodeId, label: `*${topic}*`, baseTitle: topic, color: getRandomColor(),
                    x: spot.x, y: spot.y, fixed: { x: false, y: false }
                });
                trackNodeUsage(topic); consumeNodes(1);
            }
            edges.add({ from: clickedNodeId, to: nodeId, label: 'del texto' });
            activeSelectionRange = rangeToHighlight;
            highlightSelectedTextAndLink(nodeId);
            selectedNodeId = nodeId;
            setTimeout(() => flashNewNode(nodeId), 50);
            return;
        }

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
                const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'synergy', topic: topicA, topicB: topicB, density: document.getElementById('nodeCount')?.value || 'auto' })
                });
                if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || 'No se pudo generar la sinergia.'); return; }

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

                // La generación sigue siendo exactamente la misma (mismo llamado a
                // Gemini, mismo costo en nodos vía totalNodes/consumeNodes): el servidor
                // sigue pensando en "puentes" intermedios entre A/B y el nodo de sinergia.
                // Lo único que cambia es que ya NO se dibujan esos puentes como nodos
                // aparte en el lienzo — se conecta directo A → Sinergia y B → Sinergia,
                // usando el nombre del puente como la etiqueta de ese enlace, para no
                // perder la idea que representaba sin ensuciar el esquema con nodos de más.
                (data.pathsFromA || []).forEach(bridge => {
                    edges.add({ from: nodeA.id, to: synNode.id, label: bridge.label, dashes: [4, 3], color: { color: '#d946ef' } });
                });

                (data.pathsFromB || []).forEach(bridge => {
                    edges.add({ from: nodeB.id, to: synNode.id, label: bridge.label, dashes: [4, 3], color: { color: '#d946ef' } });
                });

                applyServerBalance(data); consumeNodes(totalNodes);
                setTimeout(() => { stopPhysicsAndUnlock(); }, 1800);
            } catch (err) { appAlert("Intenta de nuevo en unos segundos"); } finally { hideLoader(); }
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
                const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'connect', topic: topicA, topicB: topicB })
                });
                if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || 'No se pudo generar el vínculo.'); return; }

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
            } catch (err) { appAlert("Intenta de nuevo en unos segundos"); } finally { hideLoader(); }
            return; // ¡Este return detiene el código para que NO abra el menú!
        }

        // --- 3. MOSTRAR MENÚ CONTEXTUAL ---
        selectedNodeId = clickedNodeId;

        // Para que el menú se sienta como que "salió" de este nodo (y no de
        // cualquier parte), lo resaltamos mientras el menú esté abierto —
        // ver setNodeMenuHighlight/clearNodeMenuHighlight más abajo.
        setNodeMenuHighlight(clickedNodeId);
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
        // Si el usuario había pedido "Vincular a nodo..." y en vez de clickear
        // un nodo le dio clic al lienzo vacío, cancelamos ese modo en vez de
        // dejarlo esperando para siempre.
        if (awaitingLinkTargetClick) {
            awaitingLinkTargetClick = false;
            pendingLinkSelection = null;
            document.body.classList.remove('gk-picking-link-target');
        }
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

// ==========================================
// REGISTRO DE PANELES DE LECTOR + INTERACTIVIDAD TEXTO↔ESQUEMA
// ==========================================
// Cada panel de lectura (el principal "main" y cada clon ➕) queda registrado
// aquí con una referencia a su propio <div> de texto y un color de acento
// propio. Esto es lo que permite, una vez generado un esquema: (a) saber en
// cuál panel buscar la cita de un nodo ("📍 Ver en el texto"), (b) resaltar
// de forma permanente en el texto los fragmentos que ya se convirtieron en
// nodos, y (c) colorear el borde de cada nodo según de qué panel vino, con
// resaltado al pasar el mouse por la cabecera de ese panel.
const panelAccentPalette = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#8b5cf6'];
const readerPanelRegistry = new Map(); // panelId -> { root, textEl, accent }

// Paleta de colores de "resaltado" — se usa TANTO para el fondo del <mark>
// en el texto COMO para el color del nodo correspondiente en el esquema, así
// el color conecta visualmente un nodo con su fragmento de origen. Se repite
// en ciclo si hay más nodos-con-cita que colores en la paleta.
const highlightColorPalette = [
    { mark: { bg: 'rgba(79, 209, 197, 0.32)', border: '#0d9488' }, node: { background: '#d4f6f1', border: '#0d9488' } },
    { mark: { bg: 'rgba(250, 204, 21, 0.35)', border: '#ca8a04' }, node: { background: '#fef3c7', border: '#ca8a04' } },
    { mark: { bg: 'rgba(129, 140, 248, 0.32)', border: '#4f46e5' }, node: { background: '#e0e7ff', border: '#4f46e5' } },
    { mark: { bg: 'rgba(244, 114, 182, 0.30)', border: '#db2777' }, node: { background: '#fce7f3', border: '#db2777' } },
    { mark: { bg: 'rgba(74, 222, 128, 0.30)', border: '#15803d' }, node: { background: '#dcfce7', border: '#15803d' } },
    { mark: { bg: 'rgba(251, 146, 60, 0.32)', border: '#c2410c' }, node: { background: '#ffedd5', border: '#c2410c' } },
];
let highlightColorCounter = 0;
function nextHighlightColor() {
    const idx = highlightColorCounter % highlightColorPalette.length;
    highlightColorCounter++;
    return { idx, mark: highlightColorPalette[idx].mark, node: highlightColorPalette[idx].node };
}

function applyPanelAccent(root, accent) {
    if (!root) return;
    const headerEl = root.querySelector('[data-role="header"]');
    if (headerEl) headerEl.style.borderLeft = `4px solid ${accent}`;
}

function registerReaderPanel(panelId, root, textEl, accent) {
    readerPanelRegistry.set(panelId, { root, textEl, accent });
    if (root) root.dataset.panelId = panelId;
    applyPanelAccent(root, accent);
}

// Resalta (atenuando el resto) los nodos que vinieron de un panel concreto,
// al pasar el mouse por su cabecera. clearPanelHighlight() quita el efecto.
function highlightPanelNodes(panelId) {
    const ids = nodes.getIds();
    nodes.update(ids.map(id => {
        const n = nodes.get(id);
        return { id, opacity: (n && n.originPanelId === panelId) ? 1 : 0.2 };
    }));
}
function clearPanelHighlight() {
    const ids = nodes.getIds();
    nodes.update(ids.map(id => ({ id, opacity: 1 })));
}

function wirePanelHoverHighlight(root, panelId) {
    const headerEl = root?.querySelector('[data-role="header"]');
    headerEl?.addEventListener('mouseenter', () => highlightPanelNodes(panelId));
    headerEl?.addEventListener('mouseleave', () => clearPanelHighlight());
}

// --- Resaltado permanente de cobertura (Idea 2) ---------------------------
function escapeHtmlForMark(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Reconstruye el HTML del panel de texto envolviendo en <mark> cada cita que
// ya quedó convertida en un nodo del esquema, con el MISMO color que su nodo
// correspondiente (idea 6). No reescribe nada si ninguna cita calza (p. ej.
// esquemas generados solo a partir de un tema, sin texto).
function buildHighlightedMarkup(rawText, quotes) {
    const baseText = escapeHtmlForMark(rawText);
    const seen = new Set();
    const uniqueQuotes = [];
    quotes.forEach(q => {
        const key = (q.quote || '').trim();
        if (key && key.length > 2 && !seen.has(key)) { seen.add(key); uniqueQuotes.push({ ...q, quote: key }); }
    });

    // Ubicamos cada cita en el texto base (en el mismo dominio ya escapado,
    // para que las posiciones calcen exactamente).
    const matches = [];
    uniqueQuotes.forEach(({ quote, nodeId, colorIdx }) => {
        const escaped = escapeHtmlForMark(quote);
        const idx = baseText.indexOf(escaped);
        if (idx === -1) return;
        matches.push({ start: idx, end: idx + escaped.length, nodeId, colorIdx, length: escaped.length });
    });
    if (!matches.length) return baseText;

    // Cuando dos citas se solapan, la más CORTA es casi siempre la más
    // específica/precisa (por ejemplo, un nodo nuevo generado "a partir de"
    // un nodo existente suele describir un fragmento más puntual dentro de
    // la cita más amplia de ese nodo original) — así que la dejamos ganar
    // ese pedazo de texto, y la cita más larga se queda solo con lo que le
    // sobra alrededor, en vez de perder el fragmento entero o taparlo.
    matches.sort((a, b) => a.length - b.length);
    const placed = []; // intervalos finales, ya sin solapes: {start, end, nodeId, colorIdx}
    matches.forEach(m => {
        let segments = [{ start: m.start, end: m.end }];
        placed.forEach(p => {
            const next = [];
            segments.forEach(seg => {
                if (p.end <= seg.start || p.start >= seg.end) { next.push(seg); return; } // sin solape con lo ya colocado
                if (p.start > seg.start) next.push({ start: seg.start, end: Math.min(p.start, seg.end) });
                if (p.end < seg.end) next.push({ start: Math.max(p.end, seg.start), end: seg.end });
            });
            segments = next;
        });
        segments.filter(s => s.end > s.start).forEach(seg => {
            placed.push({ start: seg.start, end: seg.end, nodeId: m.nodeId, colorIdx: m.colorIdx });
        });
    });
    placed.sort((a, b) => a.start - b.start);

    // Reconstruimos el HTML final intercalando texto plano y <mark>.
    let result = '';
    let cursor = 0;
    placed.forEach(seg => {
        if (seg.start < cursor) return; // seguridad ante algún borde raro
        result += baseText.slice(cursor, seg.start);
        const hc = highlightColorPalette[(seg.colorIdx != null ? seg.colorIdx : 0) % highlightColorPalette.length].mark;
        const fragment = baseText.slice(seg.start, seg.end);
        result += `<mark class="gk-coverage-mark" data-node-id="${seg.nodeId}" `
            + `style="background-color:${hc.bg}; border-bottom-color:${hc.border};" `
            + `data-base-bg="${hc.bg}" data-base-border="${hc.border}">`
            + fragment + `</mark>`;
        cursor = seg.end;
    });
    result += baseText.slice(cursor);
    return result;
}

function highlightCoverageForPanel(panelId) {
    const entry = readerPanelRegistry.get(panelId);
    if (!entry || !entry.textEl) return;
    const rawText = entry.textEl.innerText;
    if (!rawText || !rawText.trim()) return;
    const quotes = [];
    nodes.getIds().forEach(id => {
        const n = nodes.get(id);
        if (n && n.originPanelId === panelId && n.sourceQuote) quotes.push({ quote: n.sourceQuote, nodeId: id, colorIdx: n.highlightColorIdx });
    });
    if (quotes.length === 0) return;
    entry.textEl.innerHTML = buildHighlightedMarkup(rawText, quotes);
}

// --- Geometría de paneles: qué parte del lienzo está realmente libre ------
// Se recalcula en cada llamada (nunca se guarda en caché) para que tome en
// cuenta de inmediato cualquier panel que el usuario haya movido, agrandado
// o cerrado justo antes.
function getVisibleOverlayRects(containerRect) {
    return [...document.querySelectorAll('.reader-panel-instance, .gk-floating-panel')]
        .filter(el => !el.classList.contains('hidden') && el.offsetWidth > 0 && el.offsetHeight > 0)
        .map(el => el.getBoundingClientRect())
        .filter(r => r.right > containerRect.left && r.left < containerRect.right && r.bottom > containerRect.top && r.top < containerRect.bottom);
}

// Resta un rectángulo "hueco" de un rectángulo base, devolviendo hasta 4
// pedazos rectangulares con lo que queda (el método correcto de resta de
// rectángulos, no solo un bounding-box aproximado — eso es lo que fallaba
// antes cuando un panel quedaba en una esquina en vez de pegado a un borde
// completo: el bounding-box de varios paneles sueltos "comía" espacio que en
// realidad seguía libre).
function subtractRect(rect, hole) {
    if (hole.right <= rect.left || hole.left >= rect.right || hole.bottom <= rect.top || hole.top >= rect.bottom) {
        return [rect]; // no se tocan
    }
    const pieces = [];
    if (hole.top > rect.top) pieces.push({ left: rect.left, right: rect.right, top: rect.top, bottom: hole.top });
    if (hole.bottom < rect.bottom) pieces.push({ left: rect.left, right: rect.right, top: hole.bottom, bottom: rect.bottom });
    const midTop = Math.max(rect.top, hole.top), midBottom = Math.min(rect.bottom, hole.bottom);
    if (hole.left > rect.left) pieces.push({ left: rect.left, right: hole.left, top: midTop, bottom: midBottom });
    if (hole.right < rect.right) pieces.push({ left: hole.right, right: rect.right, top: midTop, bottom: midBottom });
    return pieces.filter(p => p.right - p.left > 0.5 && p.bottom - p.top > 0.5);
}

function computeFreeRects(containerRect, overlays) {
    let free = [containerRect];
    overlays.forEach(hole => {
        const next = [];
        free.forEach(r => next.push(...subtractRect(r, hole)));
        free = next;
    });
    return free;
}

// El rectángulo libre más grande (por área), o el lienzo completo si no hay
// paneles encima o no quedó ningún espacio libre razonable.
function pickBestFreeRect(containerRect, overlays, minSize = 90) {
    if (!overlays.length) return containerRect;
    const free = computeFreeRects(containerRect, overlays)
        .filter(r => (r.right - r.left) >= minSize && (r.bottom - r.top) >= minSize);
    if (!free.length) return containerRect;
    free.sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top));
    return free[0];
}

function isPointFree(x, y, overlays) {
    return !overlays.some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
}

// ¿Este nodo ya se ve bien en el lienzo ahora mismo (dentro del área visible
// y no tapado por ningún panel), con un margen para que no cuenten los que
// apenas se asoman recortados en el borde?
function isNodeVisibleOnCanvas(nodeId, margin = 30) {
    const positions = network.getPositions([nodeId]);
    const pos = positions[nodeId];
    if (!pos) return false;
    const containerRect = container.getBoundingClientRect();
    const dom = network.canvasToDOM(pos);
    const x = containerRect.left + dom.x, y = containerRect.top + dom.y;
    if (x < containerRect.left + margin || x > containerRect.right - margin ||
        y < containerRect.top + margin || y > containerRect.bottom - margin) return false;
    const overlays = getVisibleOverlayRects(containerRect);
    return isPointFree(x, y, overlays);
}

// --- Enfocar un nodo evitando que quede tapado por un panel -------------
// Si el nodo al que vamos a saltar (desde un clic en el texto) quedaría
// detrás del panel de lectura o de un panel flotante abierto, no basta con
// centrar el lienzo en él de la forma normal — hay que correr la cámara
// hacia el espacio libre del lienzo que SÍ se ve, para que el nodo termine
// visible y no oculto bajo el panel.
function focusNodeAvoidingOverlays(nodeId, opts = {}) {
    const { scale: fixedScale = 1.25, duration = 500, keepScale = false } = opts;
    const scale = keepScale ? network.getScale() : fixedScale;
    const positions = network.getPositions([nodeId]);
    const nodePos = positions[nodeId];
    if (!nodePos) return;
    const containerRect = container.getBoundingClientRect();
    const overlays = getVisibleOverlayRects(containerRect);
    const animation = { duration, easingFunction: 'easeInOutQuad' };

    const naiveX = containerRect.left + containerRect.width / 2;
    const naiveY = containerRect.top + containerRect.height / 2;
    if (!overlays.length || isPointFree(naiveX, naiveY, overlays)) {
        if (keepScale) network.moveTo({ position: nodePos, scale, animation });
        else network.focus(nodeId, { scale, animation });
        return;
    }

    const best = pickBestFreeRect(containerRect, overlays);
    const safeCenterX = (best.left + best.right) / 2;
    const safeCenterY = (best.top + best.bottom) / 2;
    const deltaDomX = safeCenterX - naiveX;
    const deltaDomY = safeCenterY - naiveY;
    const adjustedPosition = { x: nodePos.x - deltaDomX / scale, y: nodePos.y - deltaDomY / scale };
    network.moveTo({ position: adjustedPosition, scale, animation });
}

// Variante para VARIOS nodos a la vez: encuadra (ajustando el zoom) el
// espacio libre del lienzo para que todos queden visibles de una vez,
// en vez de ir uno por uno.
function fitNodesAvoidingOverlays(nodeIds, opts = {}) {
    const { duration = 500, maxScale = 1.4, minScale = 0.25 } = opts;
    const validIds = nodeIds.filter(id => nodes.get(id));
    if (!validIds.length) return;
    if (validIds.length === 1) { focusNodeAvoidingOverlays(validIds[0], { keepScale: true, duration }); return; }

    const positions = network.getPositions(validIds);
    const pts = Object.values(positions);
    const margin = 70;
    const minX = Math.min(...pts.map(p => p.x)) - margin, maxX = Math.max(...pts.map(p => p.x)) + margin;
    const minY = Math.min(...pts.map(p => p.y)) - margin, maxY = Math.max(...pts.map(p => p.y)) + margin;
    const worldW = Math.max(1, maxX - minX), worldH = Math.max(1, maxY - minY);

    const containerRect = container.getBoundingClientRect();
    const overlays = getVisibleOverlayRects(containerRect);
    const target = pickBestFreeRect(containerRect, overlays);
    const targetW = target.right - target.left, targetH = target.bottom - target.top;

    let scale = Math.min(targetW / worldW, targetH / worldH);
    scale = Math.max(minScale, Math.min(maxScale, scale));

    const worldCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const naiveX = containerRect.left + containerRect.width / 2;
    const naiveY = containerRect.top + containerRect.height / 2;
    const safeCenterX = (target.left + target.right) / 2;
    const safeCenterY = (target.top + target.bottom) / 2;
    const deltaDomX = safeCenterX - naiveX;
    const deltaDomY = safeCenterY - naiveY;
    const adjustedPosition = { x: worldCenter.x - deltaDomX / scale, y: worldCenter.y - deltaDomY / scale };
    network.moveTo({ position: adjustedPosition, scale, animation: { duration, easingFunction: 'easeInOutQuad' } });
}

// --- Clic en un fragmento resaltado → acercamiento al nodo (Idea 4) -------
// Delegado en el <div> de texto (no en cada <mark>, porque el HTML se
// reconstruye entero cada vez que se resalta cobertura nueva).
function wireMarkClickToFocusNode(textEl) {
    textEl?.addEventListener('click', (e) => {
        const mark = e.target.closest('mark.gk-coverage-mark');
        if (!mark) return;
        const nodeId = mark.dataset.nodeId;
        if (!nodeId || !nodes.get(nodeId)) return;
        network.selectNodes([nodeId]);
        focusNodeAvoidingOverlays(nodeId, { scale: 1.25, duration: 500 });
        flashNewNode(nodeId);
    });
}

// --- Enfocar el esquema según por dónde se va leyendo (Idea 3) -----------
// Mientras el usuario hace scroll dentro de un panel de lectura, se detecta
// qué citas resaltadas están actualmente visibles y se resaltan (atenuando
// el resto) los nodos correspondientes en el lienzo — así el esquema "sigue"
// la lectura sin que haya que ir buscando manualmente cuál nodo toca. Además,
// si alguno de esos nodos no se ve en el lienzo ahora mismo (porque hay zoom
// hacia otra zona, o quedó tapado por un panel), la cámara se traslada sola
// para dejarlo visible — y si son varios, se hace zoom para que entren todos.
function wireScrollFocus(panelId, contentContainer, textEl) {
    if (!contentContainer || !textEl || !panelId) return;
    let debounceTimer = null;
    contentContainer.addEventListener('scroll', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => updateScrollFocus(panelId, contentContainer, textEl), 180);
    });
}

function updateScrollFocus(panelId, contentContainer, textEl) {
    const marks = textEl.querySelectorAll('mark.gk-coverage-mark');
    if (!marks.length) return;
    const containerRect = contentContainer.getBoundingClientRect();
    const visibleIds = new Set();
    marks.forEach(mark => {
        const r = mark.getBoundingClientRect();
        if (r.bottom > containerRect.top && r.top < containerRect.bottom) {
            const id = mark.dataset.nodeId;
            if (id) visibleIds.add(id);
        }
    });
    const allIds = nodes.getIds();
    const updates = [];
    allIds.forEach(id => {
        const n = nodes.get(id);
        if (n && n.originPanelId === panelId) {
            updates.push({ id, opacity: visibleIds.size === 0 ? 1 : (visibleIds.has(id) ? 1 : 0.3) });
        }
    });
    if (updates.length) nodes.update(updates);

    // Si lo que se está leyendo ahora corresponde a nodo(s) que no se ven en
    // el lienzo (zoom/paneo hacia otra parte, o tapados por un panel), traer
    // la cámara hacia ellos. Si ya se ven todos, no se mueve nada.
    if (visibleIds.size > 0) {
        const idsHere = [...visibleIds].filter(id => nodes.get(id));
        const allAlreadyVisible = idsHere.length > 0 && idsHere.every(id => isNodeVisibleOnCanvas(id));
        if (idsHere.length > 0 && !allAlreadyVisible) {
            fitNodesAvoidingOverlays(idsHere, { duration: 550 });
        }
    }
}

// --- Sugerir vínculo entre nodos cercanos en el texto (Idea 8) ------------
// Si dos nodos del mismo esquema (y del mismo panel de origen) tienen sus
// citas muy cerca una de la otra dentro del texto original, probablemente
// están relacionados aunque hayan caído en ramas distintas del árbol. Se
// ofrece UNA sugerencia descartable (nunca se fuerza el vínculo) por cada
// esquema generado desde un documento.
function suggestProximityLinks(originPanelId) {
    const entry = readerPanelRegistry.get(originPanelId);
    if (!entry || !entry.textEl) return;
    const rawText = entry.textEl.innerText;
    if (!rawText) return;

    const candidates = [];
    nodes.getIds().forEach(id => {
        const n = nodes.get(id);
        if (n && n.originPanelId === originPanelId && n.sourceQuote) {
            const idx = rawText.indexOf(n.sourceQuote);
            if (idx !== -1) candidates.push({ id, idx, len: n.sourceQuote.length });
        }
    });
    candidates.sort((a, b) => a.idx - b.idx);

    let best = null;
    for (let i = 0; i < candidates.length - 1; i++) {
        const a = candidates[i], b = candidates[i + 1];
        const gap = b.idx - (a.idx + a.len);
        if (gap < 0 || gap > 160) continue;
        const alreadyLinked = edges.get({ filter: e => (e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id) }).length > 0;
        if (alreadyLinked) continue;
        if (!best || gap < best.gap) best = { a: a.id, b: b.id, gap };
    }
    if (best) showLinkSuggestionToast(best.a, best.b);
}

function showLinkSuggestionToast(idA, idB) {
    const nodeA = nodes.get(idA), nodeB = nodes.get(idB);
    if (!nodeA || !nodeB) return;
    document.getElementById('gkLinkSuggestionToast')?.remove();

    const toast = document.createElement('div');
    toast.id = 'gkLinkSuggestionToast';
    toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] bg-slate-950 border border-indigo-500/40 text-white text-xs rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-[90vw]';
    const labelA = (nodeA.baseTitle || idA);
    const labelB = (nodeB.baseTitle || idB);
    toast.innerHTML = `
        <span>💡 "${labelA}" y "${labelB}" aparecen muy cerca en el texto. ¿Vincularlos?</span>
        <button id="gkLinkSuggestAccept" class="bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded font-semibold shrink-0">Vincular</button>
        <button id="gkLinkSuggestDismiss" class="bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded shrink-0">Descartar</button>
    `;
    document.body.appendChild(toast);
    document.getElementById('gkLinkSuggestAccept')?.addEventListener('click', () => {
        const alreadyLinked = edges.get({ filter: e => (e.from === idA && e.to === idB) || (e.from === idB && e.to === idA) }).length > 0;
        if (!alreadyLinked) edges.add({ from: idA, to: idB, label: 'relacionado', dashes: [2, 3], color: { color: '#94a3b8' } });
        toast.remove();
    });
    document.getElementById('gkLinkSuggestDismiss')?.addEventListener('click', () => toast.remove());
    setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 14000);
}

// --- "📍 Ver en el texto" (Idea 1) ------------------------------------------
function locateNodeInText(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return;
    if (!node.originPanelId || !node.sourceQuote) {
        appAlert('Este nodo no quedó vinculado a ninguna cita del texto (puede venir de un tema escrito a mano, no de un documento).');
        return;
    }
    const entry = readerPanelRegistry.get(node.originPanelId);
    if (!entry || !entry.root || !document.body.contains(entry.root)) {
        appAlert('No se encontró el panel de lectura de origen de este nodo (puede que lo hayas cerrado).');
        return;
    }
    if (entry.root.classList.contains('hidden')) openReaderPanel();
    entry.root.style.zIndex = String(500 + (++floatingPanelCount));
    entry.root.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });

    let mark = entry.textEl?.querySelector(`mark[data-node-id="${nodeId}"]`);
    if (!mark) {
        // El resaltado permanente puede no existir todavía (p. ej. nodo creado
        // antes de esta función) — lo generamos al vuelo para este nodo.
        highlightCoverageForPanel(node.originPanelId);
        mark = entry.textEl?.querySelector(`mark[data-node-id="${nodeId}"]`);
    }
    if (!mark) {
        appAlert('No se pudo ubicar la cita exacta dentro del texto actual (puede que lo hayas editado).');
        return;
    }
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashMark(mark);
    // El nodo mismo puede haber quedado atenuado por el enfoque-por-scroll
    // (sección 20c/24b) si su cita no estaba visible en el texto — ahora que
    // SÍ la acabamos de traer a la vista, lo restauramos de una vez en vez de
    // esperar a que el listener de scroll lo note por su cuenta.
    if (nodes.get(nodeId)) nodes.update({ id: nodeId, opacity: 1 });
}

// Destella un <mark> (fondo amarillo brillante un instante) y luego restaura
// su color de resaltado normal (el que le corresponde según su nodo — ver
// data-base-bg/data-base-border, puestos por buildHighlightedMarkup).
function flashMark(mark) {
    if (!mark) return;
    mark.style.backgroundColor = 'rgba(250, 204, 21, 0.65)';
    mark.style.borderBottomColor = '#ca8a04';
    setTimeout(() => {
        mark.style.backgroundColor = mark.dataset.baseBg || '';
        mark.style.borderBottomColor = mark.dataset.baseBorder || '';
    }, 2200);
}

// --- "🔗 Vincular a nodo..." desde el tooltip de selección (Idea 5) --------
let awaitingLinkTargetClick = false;
let pendingLinkSelection = null; // { text, range }

const floatingPanelsLayer = document.getElementById('floatingPanelsLayer');
const nodeSelectionTooltip = document.getElementById('nodeSelectionTooltip');
const nodeTooltipPreview = document.getElementById('nodeTooltipPreview');
const nodeBtnExtractChild = document.getElementById('nodeBtnExtractChild');

// Registramos el panel principal con el primer color de acento. Los paneles
// adicionales (➕) se registran al crearse, en createExtraReaderPanel().
registerReaderPanel('main', readerPanel, readerTextMode, panelAccentPalette[0]);
wirePanelHoverHighlight(readerPanel, 'main');

// ==========================================
// PANELES FLOTANTES DE DEFINICIÓN
// Ya no hay un panel único "nodeDetailPanel" que se reemplaza cada vez (eso forzaba
// a elegir entre perder la definición anterior o recargar visualmente el esquema).
// Cada "Ver definición" abre su propia ventana flotante, apilada en cascada, que el
// usuario puede arrastrar, minimizar o cerrar sin afectar a las demás ni al lienzo.
// ==========================================
// Arranca en 1 (no 0) porque el Modo Lector ya nace visible con z-index 501
// (= 500 + 1) directamente en el HTML. Si este contador arrancara en 0, el
// primer panel de definición que se abra también calcularía 500 + 1 = 501 y
// quedaría empatado con el Modo Lector en vez de competir correctamente.
let floatingPanelCount = 1;
const openFloatingPanels = new Map(); // nodeId -> { el, contentEl, titleEl }

// ============================================================
// Paneles de definición "anclados" al mapa (flecha + seguimiento)
// Cada panel de definición queda asociado al nodo que lo originó: una
// flecha dibujada en SVG apunta de ese nodo al panel, y al mover/hacer zoom
// en el lienzo el panel SIGUE la posición del nodo (como si fuera parte del
// mapa). El tamaño del panel en pantalla NO cambia con el zoom — solo su
// posición — así el texto adentro sigue siendo legible sin importar cuánto
// se aleje o acerque el mapa (si también se achicara con el zoom, se
// volvería illegible al alejar mucho). El panel sigue cerrándose con la X
// y sigue sin ser un nodo real de vis-network: solo "viaja" junto al mapa.
// ============================================================
const floatingPanelAnchors = new Map(); // nodeId -> punto en coordenadas del MUNDO (canvas) al que llega la flecha
let floatingPanelsArrowSvg = null;

function ensureFloatingPanelsArrowSvg() {
    if (floatingPanelsArrowSvg) return floatingPanelsArrowSvg;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'floatingPanelsArrowSvg');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.overflow = 'visible';
    // Se inserta como PRIMER hijo de floatingPanelsLayer: como ningún panel
    // le pone z-index explícito menor a 500, el SVG (sin z-index, "auto")
    // siempre queda detrás de todos ellos sin tener que calcular nada.
    floatingPanelsLayer.insertBefore(svg, floatingPanelsLayer.firstChild);
    floatingPanelsArrowSvg = svg;
    return svg;
}

// Guarda en qué punto del MUNDO (coordenadas del lienzo, no de la pantalla)
// "vive" el panel de un nodo, a partir de su posición actual en pantalla.
// Se llama al crear el panel y mientras se arrastra, para que quede
// "pegado" al punto del mapa donde el usuario lo dejó.
function anchorFloatingPanelToWorld(nodeId, el) {
    if (!network || !el || !nodes.get(nodeId)) return;
    const screenPoint = { x: el.offsetLeft, y: el.offsetTop + 20 };
    floatingPanelAnchors.set(nodeId, network.DOMtoCanvas(screenPoint));
}

// Se llama en cada redibujado del lienzo (pan, zoom, arrastre de nodos...):
// recoloca cada panel anclado según su punto del mundo guardado, y vuelve a
// dibujar la flecha que lo conecta con el nodo que lo originó.
function updateFloatingPanelAnchors() {
    if (!network || !floatingPanelAnchors.size) { if (floatingPanelsArrowSvg) floatingPanelsArrowSvg.innerHTML = ''; return; }
    const svg = ensureFloatingPanelsArrowSvg();
    const lines = [];
    for (const [nodeId, worldPoint] of Array.from(floatingPanelAnchors.entries())) {
        const panel = openFloatingPanels.get(nodeId);
        const node = nodes.get(nodeId);
        if (!panel || !node) { floatingPanelAnchors.delete(nodeId); continue; }
        const domPoint = network.canvasToDOM(worldPoint);
        panel.el.style.left = `${domPoint.x}px`;
        panel.el.style.top = `${domPoint.y - 20}px`;

        const positions = network.getPositions([nodeId]);
        const nodePos = positions && positions[nodeId];
        if (!nodePos) continue;
        const nodeDom = network.canvasToDOM(nodePos);
        lines.push(`<line x1="${nodeDom.x}" y1="${nodeDom.y}" x2="${domPoint.x}" y2="${domPoint.y}" stroke="#4fd1c5" stroke-width="1.5" stroke-dasharray="5,4" marker-end="url(#gkFloatingPanelArrowHead)" />`);
    }
    svg.innerHTML = `
        <defs>
            <marker id="gkFloatingPanelArrowHead" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 Z" fill="#4fd1c5" />
            </marker>
        </defs>
        ${lines.join('')}
    `;
}
network.on('afterDrawing', () => updateFloatingPanelAnchors());

function closeFloatingPanel(nodeId) {
    const panel = openFloatingPanels.get(nodeId);
    if (!panel) return;
    panel.el.remove();
    openFloatingPanels.delete(nodeId);
    floatingPanelAnchors.delete(nodeId);
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

    // El escalón de posición usaba openFloatingPanels.size (cuántos paneles
    // hay abiertos AHORA), así que al cerrar uno y abrir otro se repetía el
    // mismo "size" y el panel nuevo caía exactamente encima del anterior.
    // Usamos floatingPanelCount (el contador global que solo crece, nunca
    // vuelve a 0) para que cada panel nuevo caiga en un escalón distinto al
    // de cualquier otro que siga abierto, sin importar cuántos se hayan
    // cerrado entre medio. El módulo también sube de 6 a 10 escalones para
    // que haya más posiciones antes de que el patrón se repita.
    const offset = floatingPanelCount % 10;
    const el = document.createElement('div');
    // "resize" + "overflow-hidden" + un ancho/alto explícitos (no solo
    // max-*) son lo que hace que el navegador dibuje el asa de resize nativa
    // en la esquina — el mismo truco que ya usaba el panel del lector.
    el.className = 'gk-floating-panel absolute w-[340px] max-w-[92vw] h-[420px] max-h-[80vh] min-w-[260px] min-h-[160px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col pointer-events-auto select-text resize overflow-hidden';
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
    // Minimizar de verdad: antes solo se escondía el texto de adentro pero el
    // panel seguía ocupando el mismo espacio grande en pantalla (su altura fija
    // no cambiaba). Ahora, al minimizar, el panel se encoge a solo su cabecera
    // (altura automática) y se desactiva el asa de resize mientras está así —
    // no tiene sentido redimensionar un panel que no muestra contenido. Al
    // restaurar vuelve exactamente a la altura que tenía antes de minimizarlo.
    const minimizeBtn = el.querySelector('.fp-minimize');
    let isMinimized = false;
    let heightBeforeMinimize = null;
    minimizeBtn.addEventListener('click', () => {
        isMinimized = !isMinimized;
        if (isMinimized) {
            heightBeforeMinimize = el.style.height || `${el.offsetHeight}px`;
            el.style.height = 'auto';
            el.style.resize = 'none';
            contentEl.classList.add('hidden');
            minimizeBtn.textContent = '▢';
            minimizeBtn.title = 'Restaurar';
        } else {
            el.style.height = heightBeforeMinimize || '';
            el.style.resize = '';
            contentEl.classList.remove('hidden');
            minimizeBtn.textContent = '—';
            minimizeBtn.title = 'Minimizar';
        }
        if (typeof network !== 'undefined' && network) network.redraw();
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
        // Mientras se arrastra, se re-ancla en cada frame al punto del mapa
        // bajo el panel: así, al terminar de moverlo, queda "pegado" a su
        // nueva posición y no salta de vuelta a la anterior en el próximo
        // pan/zoom. IMPORTANTE: arrastrar el panel es un gesto de mouse puro
        // (no mueve ni hace zoom al lienzo), así que NUNCA dispara el evento
        // 'afterDrawing' de vis-network — por eso antes la flecha se quedaba
        // apuntando al lugar viejo hasta el próximo redibujado del mapa (un
        // clic, un pan, etc.). Por eso aquí se llama a updateFloatingPanelAnchors()
        // a mano, en cada movimiento del mouse, para que la flecha se seabra
        // se redibuje en vivo junto con el panel y no se quede atrás.
        anchorFloatingPanelToWorld(nodeId, el);
        updateFloatingPanelAnchors();
    });
    document.addEventListener('mouseup', () => { dragState = null; });

    wireResizeRedraw(el);
    // Ancla el panel, recién nacido, al punto del mapa donde cayó — así la
    // flecha aparece desde ya y el panel viaja con el nodo si se hace pan/zoom.
    anchorFloatingPanelToWorld(nodeId, el);

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
    btnToggleReader.innerHTML = '<span>📖</span> Pegar documento / enlace (Modo Lector)';
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

// (Antes había aquí un listener de 'mouseup' que revisaba una variable
// `isResizing` que nunca se llegó a declarar ni a poner en `true` en ningún
// lado — quedó de un intento anterior y disparaba un ReferenceError en
// CADA mouseup de toda la página. Lo que de verdad hace falta — redibujar
// el lienzo después de agrandar/achicar un panel con el asa nativa del
// navegador (el "resize" de CSS) — se resuelve mejor con un ResizeObserver,
// ver wireResizeRedraw más abajo, que no depende de interceptar el mouse.
function wireResizeRedraw(el) {
    if (!el || typeof ResizeObserver === 'undefined') return;
    let redrawTimer = null;
    new ResizeObserver(() => {
        clearTimeout(redrawTimer);
        redrawTimer = setTimeout(() => { if (typeof network !== 'undefined') network.redraw(); }, 120);
    }).observe(el);
}
wireResizeRedraw(readerPanel);

const readerEmptyHint = document.getElementById('readerEmptyHint');
function updateReaderEmptyHint() {
    if (!readerEmptyHint || !readerTextMode) return;
    readerEmptyHint.classList.toggle('hidden', readerTextMode.innerText.trim() !== "");
}

readerTextMode?.addEventListener('input', () => {
    const content = readerTextMode.innerText.trim();
    currentDocumentText = content;
    if (!globalDocumentContext && content.length > 20) {
        globalDocumentContext = content.split(/\s+/).slice(0, 6).join(' ') + '...';
        if (docContextInput) docContextInput.value = globalDocumentContext;
        updateDocContextChip();
    }
    updateReaderEmptyHint();
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
    // ".reader-panel-instance" cubre tanto el panel principal como cualquier
    // panel adicional (clon) que el usuario haya abierto con el botón ➕.
    if (!selectionTooltip.contains(e.target) && !e.target.closest('.reader-panel-instance')) selectionTooltip.classList.add('hidden');
});

// --- Arrastrar un fragmento subrayado directo al lienzo (Idea 4) ----------
// Los navegadores ya permiten arrastrar una selección de texto dentro de un
// <div contenteditable> de forma nativa (arranca un 'dragstart' con
// "text/plain" = el texto seleccionado), así que no se necesita ningún
// atributo especial: basta con escuchar 'dragstart' en el texto (para poder
// ocultar el tooltip mientras se arrastra) y 'drop' en el lienzo, donde se
// convierte la posición del mouse a coordenadas del canvas con
// network.DOMtoCanvas() y se crea el nodo justo ahí.
function wireDragToCanvas(textEl) {
    textEl?.addEventListener('dragstart', (e) => {
        const text = window.getSelection().toString().trim();
        if (!text) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', text);
        selectionTooltip.classList.add('hidden');
    });
}
wireDragToCanvas(readerTextMode);

container.addEventListener('dragover', (e) => { e.preventDefault(); });
container.addEventListener('drop', (e) => {
    e.preventDefault();
    const text = (e.dataTransfer.getData('text/plain') || '').trim();
    if (!text || text.length < 2) return;
    if (!checkBalance(1)) return;

    const rect = container.getBoundingClientRect();
    const canvasPos = network.DOMtoCanvas({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const nodeId = text;
    if (!nodes.get(nodeId)) {
        nodes.add({
            id: nodeId, label: `*${text}*`, baseTitle: text, color: getRandomColor(),
            x: canvasPos.x, y: canvasPos.y, fixed: { x: false, y: false }
        });
        trackNodeUsage(text); consumeNodes(1);
    }
    selectedNodeId = nodeId;
    setTimeout(() => flashNewNode(nodeId), 50);
    track('node_created_via_drag');
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
                focusNodeAvoidingOverlays(nodeId, { scale: 1.2, duration: 600 });
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

// "🔗 Vincular a nodo...": en vez de crear el nodo suelto de una vez, guarda la
// selección y entra en modo "esperando clic en el nodo destino" — el próximo
// clic sobre un nodo (interceptado al inicio de network.on('click', ...))
// crea el nodo nuevo YA conectado como hijo de ese nodo elegido.
document.getElementById('tipBtnLinkToNode')?.addEventListener('click', () => {
    if (!activeSelectedText) return;
    selectionTooltip.classList.add('hidden');
    pendingLinkSelection = { text: activeSelectedText, range: activeSelectionRange };
    activeSelectedText = ""; activeSelectionRange = null;
    awaitingLinkTargetClick = true;
    document.body.classList.add('gk-picking-link-target');
    appAlert('Ahora haz clic en el nodo del esquema al que quieres vincular este fragmento como hijo.');
});

// ==========================================
// PANELES DE LECTOR ADICIONALES (clones independientes del Modo Lector)
// ==========================================
// El usuario puede abrir más de un "Modo Lector" a la vez con el botón ➕ de
// la cabecera (en el panel principal o en cualquiera de los adicionales) para
// pegar dos o más textos/enlaces distintos y generar varios esquemas por
// separado. Cada panel adicional es una COPIA del panel principal con su
// propio texto (vive directo en su propio textEl, el <div contenteditable>
// clonado) y su propio contexto de documento (localContext, variable local a
// esta función) — nada se comparte entre paneles ni con el principal
// (globalDocumentContext/currentDocumentText), así que el texto o el contexto
// de uno nunca puede terminar mezclado con el de otro.
let extraReaderPanelCount = 0;

function wireReaderPanelClone(root, panelId) {
    const q = (role) => root.querySelector(`[data-role="${role}"]`);
    const header = q('header');
    const btnAdd = q('btnAdd');
    const btnClear = q('btnClearReader');
    const btnClose = q('btnClose');
    const btnGenerate = q('btnGenerate');
    const textEl = q('textMode');
    const emptyHint = q('emptyHint');
    const chip = q('docContextChip');
    const chipText = q('docContextChipText');
    const btnEditContext = q('btnEditContext');
    const editRow = q('docContextEditRow');
    const contextInput = q('docContextInput');
    const contentContainer = q('contentContainer');

    let localContext = "";

    function updateChip() {
        if (!chip) return;
        if (localContext) {
            chip.classList.remove('hidden'); chip.classList.add('flex');
            if (chipText) chipText.innerText = localContext.length > 60 ? localContext.slice(0, 60) + '…' : localContext;
        } else {
            chip.classList.add('hidden'); chip.classList.remove('flex');
        }
    }
    function updateEmptyHintLocal() {
        if (!emptyHint || !textEl) return;
        emptyHint.classList.toggle('hidden', textEl.innerText.trim() !== "");
    }

    contextInput?.addEventListener('input', (e) => { localContext = e.target.value.trim(); updateChip(); });
    btnEditContext?.addEventListener('click', () => {
        editRow?.classList.remove('hidden'); editRow?.classList.add('flex');
        if (contextInput) { contextInput.value = localContext; contextInput.focus(); }
    });

    textEl?.addEventListener('input', () => {
        const content = textEl.innerText.trim();
        if (!localContext && content.length > 20) {
            localContext = content.split(/\s+/).slice(0, 6).join(' ') + '...';
            if (contextInput) contextInput.value = localContext;
            updateChip();
        }
        updateEmptyHintLocal();
    });

    // Igual que en el panel principal: subrayar texto aquí también permite
    // crear un nodo vinculado a esa selección (mismo tooltip compartido y
    // mismo botón "⚡ Crear elemento en esquema", ver más abajo en el archivo
    // — solo puede haber una selección activa a la vez, así que reusarlo es
    // seguro y no mezcla nada entre paneles).
    textEl?.addEventListener('mouseup', (e) => {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text.length > 2) {
            activeSelectedText = text;
            activeSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            const preview = document.getElementById('tooltipSelectedTextPreview');
            if (preview) preview.innerText = `"${text.substring(0, 25)}..."`;
            selectionTooltip.style.left = `${e.pageX - 60}px`;
            selectionTooltip.style.top = `${e.pageY - 70}px`;
            selectionTooltip.classList.remove('hidden');
        } else {
            selectionTooltip.classList.add('hidden');
        }
    });

    // Arrastre desde la cabecera, igual que el panel principal.
    let dragState = null;
    header?.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        dragState = { startX: e.clientX, startY: e.clientY, left: root.offsetLeft, top: root.offsetTop };
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragState) return;
        root.style.left = `${Math.max(0, dragState.left + (e.clientX - dragState.startX))}px`;
        root.style.top = `${Math.max(0, dragState.top + (e.clientY - dragState.startY))}px`;
    });
    document.addEventListener('mouseup', () => { dragState = null; });
    root.addEventListener('mousedown', () => { root.style.zIndex = String(500 + (++floatingPanelCount)); });

    btnClose?.addEventListener('click', () => {
        if (panelId) readerPanelRegistry.delete(panelId);
        root.remove();
    });
    btnClear?.addEventListener('click', async () => {
        const hasText = textEl && textEl.innerText.trim() !== "";
        if (!hasText && !localContext) return;
        if (await appConfirm("¿Deseas limpiar el texto y el contexto de este lector?")) {
            localContext = "";
            if (textEl) textEl.innerText = "";
            if (contextInput) contextInput.value = "";
            editRow?.classList.add('hidden');
            updateChip(); updateEmptyHintLocal();
        }
    });

    btnAdd?.addEventListener('click', () => createExtraReaderPanel());

    btnGenerate?.addEventListener('click', async () => {
        let textContent = textEl ? textEl.innerText.trim() : "";
        if (!textContent || textContent.length < 3) return appAlert("Escribe un tema, pega un texto o el enlace de una página web en el lector.");

        textContent = await resolveTextOrWebLink(textContent, {
            targetTextEl: textEl,
            onTitle: (t) => { if (!localContext) { localContext = t; if (contextInput) contextInput.value = t; updateChip(); } }
        });
        if (textContent === null) return;
        updateEmptyHintLocal();

        await generateFullSchemaFromTopic(textContent, { originPanelId: panelId });
    });

    wireDragToCanvas(textEl);
    wireMarkClickToFocusNode(textEl);
    wireScrollFocus(panelId, contentContainer, textEl);

    updateEmptyHintLocal();
    wirePanelHoverHighlight(root, panelId);
}

function createExtraReaderPanel() {
    extraReaderPanelCount++;
    // cloneNode(true) copia el DOM TAL CUAL está en ese momento — si el panel
    // que se clonó ya tenía texto/contexto escrito, el clon nacía con esa
    // misma copia en vez de empezar vacío. Un panel nuevo siempre debe
    // arrancar en blanco, así que se limpia explícitamente después de clonar.
    const clone = readerPanel.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

    const cloneText = clone.querySelector('[data-role="textMode"]');
    if (cloneText) cloneText.innerText = '';
    const cloneChip = clone.querySelector('[data-role="docContextChip"]');
    if (cloneChip) { cloneChip.classList.add('hidden'); cloneChip.classList.remove('flex'); }
    const cloneChipText = clone.querySelector('[data-role="docContextChipText"]');
    if (cloneChipText) cloneChipText.innerText = '';
    const cloneEditRow = clone.querySelector('[data-role="docContextEditRow"]');
    if (cloneEditRow) { cloneEditRow.classList.add('hidden'); cloneEditRow.classList.remove('flex'); }
    const cloneContextInput = clone.querySelector('[data-role="docContextInput"]');
    if (cloneContextInput) cloneContextInput.value = '';
    const cloneEmptyHint = clone.querySelector('[data-role="emptyHint"]');
    if (cloneEmptyHint) cloneEmptyHint.classList.remove('hidden');

    const n = extraReaderPanelCount;
    const titleEl = clone.querySelector('[data-role="title"]');
    if (titleEl) titleEl.innerText = `📖 Modo Lector ${n + 1}`;
    const cascade = n % 8;
    clone.style.left = `${56 + cascade * 44}px`;
    clone.style.top = `${136 + cascade * 44}px`;
    clone.style.zIndex = String(500 + (++floatingPanelCount));
    floatingPanelsLayer.appendChild(clone);

    const panelId = `panel-${n}`;
    const accent = panelAccentPalette[n % panelAccentPalette.length];
    registerReaderPanel(panelId, clone, cloneText, accent);
    wireReaderPanelClone(clone, panelId);
    wireResizeRedraw(clone);
    return clone;
}

document.querySelector('#readerPanel [data-role="btnAdd"]')?.addEventListener('click', () => createExtraReaderPanel());

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

// Último ítem del menú de un nodo: toma el texto del nodo (su baseTitle, el
// mismo texto "limpio" que usa ✏️ Editar texto) y lo trata exactamente como si
// se hubiera escrito en el campo "Generar" de la cabecera y se hubiera
// presionado el botón — misma función (generateFullSchemaFromTopic), mismo
// costo, mismo diálogo de "¿limpiar el lienzo?" si ya hay algo más en el
// lienzo, y el mismo arreglo de posicionamiento para que el esquema nuevo no
// se traslape con lo que ya había (ver renderThreeLevelTree).
document.getElementById('btnMenuFullSchema')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    const node = nodes.get(selectedNodeId);
    if (!node) return;
    const topic = node.baseTitle || selectedNodeId;
    // El esquema nuevo PARTE de este nodo existente (attachToNodeId): no se
    // crea una raíz aparte ni se pregunta si limpiar el lienzo, siempre se
    // agrega directo alrededor de este nodo. Si el nodo ya venía de un panel
    // de lectura, conservamos esa herencia para que lo nuevo también quede
    // tageado/resaltable con ese mismo panel.
    await generateFullSchemaFromTopic(topic, { originPanelId: node.originPanelId || null, attachToNodeId: selectedNodeId });
});

document.getElementById('btnMenuLocateText')?.addEventListener('click', () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    locateNodeInText(selectedNodeId);
});

// Editar el texto de un nodo existente. El usuario ve/edita el texto "limpio"
// (sin los * de negrita ni el ícono/prefijo que algunos nodos especiales traen,
// como 🌟 en Sinergia o ⚡ en Antítesis), y al guardar reconstruimos el label
// conservando ese mismo prefijo si lo había, para no perder la pista visual de
// qué tipo de nodo es.
document.getElementById('btnMenuEditText')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    const node = nodes.get(selectedNodeId);
    if (!node) return;

    const currentLabel = String(node.label || '');
    // Detecta un prefijo tipo "*🌟 " o "*" al inicio del label para conservarlo.
    const prefixMatch = currentLabel.match(/^\*((?:\p{Emoji_Presentation}|\p{Extended_Pictographic})\s)?/u);
    const prefixEmoji = (prefixMatch && prefixMatch[1]) ? prefixMatch[1] : '';
    const currentPlainText = node.baseTitle || currentLabel.replace(/^\*/, '').replace(/\*$/, '').replace(/^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})\s/u, '');

    const newText = await appPrompt('Editar texto del nodo:', currentPlainText, { title: '✏️ Editar texto' });
    if (newText === null) return; // canceló
    const trimmed = newText.trim();
    if (!trimmed) return;

    nodes.update({
        id: selectedNodeId,
        label: `*${prefixEmoji}${trimmed}*`,
        baseTitle: trimmed
    });
});

// ==========================================
// EXPLICACIÓN SENCILLA (ELI5): definición en palabras simples + analogía +
// ejemplo, para quien no domina el tema. Es un panel flotante aparte del de
// "Ver definición" (puede haber uno de cada uno abierto a la vez para el mismo
// nodo), con su propio estilo para que no se confundan de un vistazo.
// ==========================================
async function showSimpleExplanationInFloatingPanel(nodeId) {
    const currentNode = nodes.get(nodeId);
    if (!currentNode) return;
    const title = currentNode.baseTitle || nodeId;
    // Clave distinta a la del nodo "crudo" para que este panel y el de "Ver
    // definición" puedan convivir abiertos al mismo tiempo sin pisarse.
    const panelKey = `simple_${nodeId}`;

    const panel = openFloatingPanel(panelKey, `💡 ${title}`);
    panel.el.dataset.nodeId = nodeId;
    // Acento visual distinto (verde-lima) para diferenciarlo del panel de
    // definición normal (teal) con solo mirar el borde/título.
    panel.el.classList.add('border-lime-600/40');
    panel.titleEl.classList.remove('text-[#4fd1c5]');
    panel.titleEl.classList.add('text-lime-400');

    let simple = currentNode.simpleExplanation;
    if (!simple) {
        panel.contentEl.innerHTML = `
            <div class="flex flex-col items-center justify-center gap-3 py-6">
                <div class="relative w-8 h-8">
                    <div class="absolute inset-0 border-[3px] border-slate-700 rounded-full"></div>
                    <div class="absolute inset-0 border-[3px] border-lime-400 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p class="text-slate-400 text-xs italic">Preparando una explicación sencilla…</p>
            </div>
        `;
        try {
            const { ok, data } = await apiFetch('/.netlify/functions/gemini', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'simple_explanation',
                    topic: title,
                    contextPath: getContextPath(nodeId),
                    documentContext: globalDocumentContext || currentDocumentText
                })
            });
            if (!ok) { panel.contentEl.innerHTML = `<p class="text-rose-400 text-xs">No se pudo generar la explicación.</p>`; return; }
            applyServerBalance(data);
            simple = { definition: data.definition, analogy: data.analogy, example: data.example };
            nodes.update({ id: nodeId, simpleExplanation: simple });
        } catch (err) {
            panel.contentEl.innerHTML = `<p class="text-rose-400 text-xs">Error al generar la explicación.</p>`;
            return;
        }
    }

    const esc = (s) => String(s || '').replace(/\n/g, '<br>');
    panel.contentEl.innerHTML = `
        <div class="flex flex-col gap-4">
            <div>
                <p class="text-[10px] font-bold text-lime-400 uppercase tracking-wider mb-1">En palabras simples</p>
                <p class="leading-relaxed text-slate-200">${esc(simple.definition)}</p>
            </div>
            <div class="bg-lime-500/10 border border-lime-500/20 rounded-lg p-3">
                <p class="text-[10px] font-bold text-lime-400 uppercase tracking-wider mb-1">🔗 Es como...</p>
                <p class="leading-relaxed text-slate-200 text-[13px]">${esc(simple.analogy)}</p>
            </div>
            <div>
                <p class="text-[10px] font-bold text-lime-400 uppercase tracking-wider mb-1">Por ejemplo</p>
                <p class="leading-relaxed text-slate-200 text-[13px]">${esc(simple.example)}</p>
            </div>
        </div>
    `;
}

document.getElementById('btnMenuSimpleExplain')?.addEventListener('click', () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    showSimpleExplanationInFloatingPanel(selectedNodeId);
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
// Detecta (en el cliente, sin validar a fondo) si lo pegado es un enlace web
// en vez de texto, para decidir si hay que pedirle al backend que lo lea
// antes de generar el esquema. Antes esto intentaba lo mismo con enlaces de
// YouTube (ver netlify/functions/youtube-transcript.js, que se deja en el
// proyecto sin usar) — se quitó porque YouTube bloquea sistemáticamente los
// pedidos que vienen de un servidor, así que nunca funcionó de forma
// confiable. Leer una página web normal (artículo, noticia) es mucho más
// viable desde un servidor.
function looksLikeWebLink(str) {
    const t = (str || '').trim();
    if (!t || t.length > 2000 || /\s/.test(t)) return false;
    return /^https?:\/\//i.test(t);
}

// Si lo que se pasó es un enlace web, le pide al backend que extraiga el
// texto principal de esa página y devuelve ESE texto en su lugar (mismo
// mecanismo para el Modo Lector y para el campo pequeño de arriba, así ambos
// pueden recibir un enlace indistintamente). Devuelve null si falló (y ya
// mostró la alerta correspondiente).
// Generalizada para servir tanto al panel principal como a cualquier panel de
// lector adicional: en vez de escribir directo sobre el textarea/contexto del
// panel principal (lo que mezclaría resultados si se llamaba desde un clon),
// recibe a qué elemento de texto escribir el resultado (targetTextEl) y un
// callback para el título detectado (onTitle), cada panel pasa los suyos.
async function resolveTextOrWebLink(raw, { targetTextEl = null, onTitle = null } = {}) {
    if (!looksLikeWebLink(raw)) return raw;

    showLoader('Leyendo la página...');
    try {
        const resp = await fetch('/.netlify/functions/read-webpage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: raw })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'No se pudo leer esa página.');
        if (targetTextEl) targetTextEl.innerText = data.text;
        if (data.title && onTitle) onTitle(data.title);
        track('webpage_read_success');
        return data.text;
    } catch (err) {
        track('webpage_read_error', { message: String(err?.message || '').slice(0, 160) });
        appAlert(err.message || "No se pudo leer esa página.");
        return null;
    } finally {
        hideLoader();
    }
}

document.getElementById('btnParseReaderText')?.addEventListener('click', async () => {
    let textContent = readerTextMode.innerText.trim();
    if (!textContent || textContent.length < 3) return appAlert("Escribe un tema, pega un texto o el enlace de una página web en el lector.");

    textContent = await resolveTextOrWebLink(textContent, {
        targetTextEl: readerTextMode,
        onTitle: (title) => {
            if (!globalDocumentContext) {
                globalDocumentContext = title;
                if (docContextInput) docContextInput.value = title;
                updateDocContextChip();
            }
        }
    });
    if (textContent === null) return;
    updateReaderEmptyHint();

    currentDocumentText = textContent;
    await generateFullSchemaFromTopic(textContent, { originPanelId: 'main' });
});

wireMarkClickToFocusNode(readerTextMode);
wireScrollFocus('main', document.getElementById('readerContentContainer'), readerTextMode);

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

document.getElementById('btnMenuDelete')?.addEventListener('click', async () => {
    if (!selectedNodeId) return;

    const descendants = getAllDescendants(selectedNodeId);

    if (descendants.length > 0) {
        const deleteAll = await appConfirm(
            `Este nodo tiene ${descendants.length} sub-nodo(s) conectado(s).`,
            { title: '¿Eliminar nodo y sus hijos?', okText: 'Eliminar todo', cancelText: 'Solo este nodo' }
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
// NUEVO: SONIDO, BÚSQUEDA RÁPIDA, REPLAY, MODO FOCO, MODO PRESENTACIÓN,
// MINIMAPA, ESTILO POR IMPORTANCIA Y AURA DE RAMA
// ==========================================

// --- Modo de acomodo del esquema (Árbol / Sistema solar) ---
document.getElementById('schemaLayoutMode')?.addEventListener('change', (e) => {
    schemaLayoutMode = e.target.value;
});

// --- Sonido al crear nodos (togglable) ---
const btnSoundToggle = document.getElementById('btnSoundToggle');
const soundToggleIcon = document.getElementById('soundToggleIcon');
btnSoundToggle?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    if (soundToggleIcon) soundToggleIcon.textContent = soundEnabled ? '🔊' : '🔇';
    if (btnSoundToggle) btnSoundToggle.title = `Sonido al crear nodos: ${soundEnabled ? 'encendido' : 'apagado'}`;
    if (soundEnabled) { getAudioCtx(); playChime(660); }
});

// --- Buscador rápido de nodos (Ctrl/Cmd+K) ---
const searchPalette = document.getElementById('searchPalette');
const searchPaletteInput = document.getElementById('searchPaletteInput');
const searchPaletteResults = document.getElementById('searchPaletteResults');
function openSearchPalette() {
    if (!searchPalette) return;
    searchPalette.classList.remove('hidden');
    searchPalette.classList.add('flex');
    searchPaletteInput.value = '';
    renderSearchResults('');
    setTimeout(() => searchPaletteInput?.focus(), 30);
}
function closeSearchPalette() {
    if (!searchPalette) return;
    searchPalette.classList.add('hidden');
    searchPalette.classList.remove('flex');
}
function renderSearchResults(query) {
    if (!searchPaletteResults) return;
    const q = query.trim().toLowerCase();
    const all = nodes.get();
    const matches = (q
        ? all.filter(n => (n.baseTitle || n.id || '').toLowerCase().includes(q))
        : all
    ).slice(0, 40);
    if (!matches.length) {
        searchPaletteResults.innerHTML = `<div class="px-4 py-3 text-xs text-slate-500 font-sans">Sin resultados.</div>`;
        return;
    }
    searchPaletteResults.innerHTML = matches.map(n => `
        <button type="button" data-node-id="${n.id}" class="gk-search-result w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800 transition-colors font-sans border-b border-slate-800/60 last:border-0 truncate">
            ${(n.baseTitle || n.id || '').toString().replace(/</g, '&lt;')}
        </button>
    `).join('');
}
searchPaletteInput?.addEventListener('input', (e) => renderSearchResults(e.target.value));
searchPaletteResults?.addEventListener('click', (e) => {
    const btn = e.target.closest('.gk-search-result');
    if (!btn) return;
    const nodeId = btn.dataset.nodeId;
    closeSearchPalette();
    if (nodeId && nodes.get(nodeId)) {
        network.selectNodes([nodeId]);
        network.focus(nodeId, { scale: 1.2, animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
        flashNewNode(nodeId);
    }
});
searchPalette?.addEventListener('click', (e) => { if (e.target === searchPalette) closeSearchPalette(); });
document.getElementById('btnSearchNodes')?.addEventListener('click', openSearchPalette);
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searchPalette && !searchPalette.classList.contains('hidden')) closeSearchPalette();
        else openSearchPalette();
    } else if (e.key === 'Escape' && searchPalette && !searchPalette.classList.contains('hidden')) {
        closeSearchPalette();
    }
});

// --- "Replay": re-anima la aparición del esquema actual, nodo por nodo ---
document.getElementById('btnReplay')?.addEventListener('click', async () => {
    const all = nodes.get();
    if (!all.length) return;
    // Orden de aparición: por profundidad (raíces primero) y, dentro de cada
    // nivel, por el orden en que ya existen — así el replay respeta la misma
    // jerarquía con la que se construyó el esquema.
    const order = [...all].sort((a, b) => (a.depthLevel ?? 1) - (b.depthLevel ?? 1));
    const originalOpacities = new Map(order.map(n => [n.id, n.opacity ?? 1]));
    nodes.update(order.map(n => ({ id: n.id, opacity: 0.06 })));
    for (const n of order) {
        if (!nodes.get(n.id)) continue;
        nodes.update({ id: n.id, opacity: originalOpacities.get(n.id) ?? 1 });
        flashNewNode(n.id, n.size || 25);
        await new Promise(r => setTimeout(r, 180));
    }
});

// --- Modo foco: resalta los conceptos más conectados, atenúa el resto ---
let focusModeActive = false;
function toggleFocusMode() {
    focusModeActive = !focusModeActive;
    const btn = document.getElementById('btnFocusMode');
    if (btn) btn.classList.toggle('ring-2', focusModeActive);
    if (btn) btn.classList.toggle('ring-[#4fd1c5]', focusModeActive);
    if (!focusModeActive) {
        nodes.update(nodes.getIds().map(id => ({ id, opacity: 1 })));
        return;
    }
    const all = nodes.get();
    const degrees = all.map(n => ({ id: n.id, degree: network.getConnectedEdges(n.id).length }));
    const sorted = [...degrees].sort((a, b) => b.degree - a.degree);
    const topCount = Math.max(1, Math.ceil(sorted.length * 0.3));
    const importantIds = new Set(sorted.slice(0, topCount).map(d => d.id));
    nodes.update(all.map(n => ({ id: n.id, opacity: importantIds.has(n.id) ? 1 : 0.22 })));
}
document.getElementById('btnFocusMode')?.addEventListener('click', toggleFocusMode);

// --- Modo presentación: oculta toda la interfaz, deja solo el lienzo ---
let presentationModeActive = false;
function togglePresentationMode(forceOff = false) {
    presentationModeActive = forceOff ? false : !presentationModeActive;
    const header = document.getElementById('mainHeader');
    const exitBtn = document.getElementById('btnExitPresentation');
    const panels = document.querySelectorAll('.reader-panel-instance, .gk-floating-panel');
    if (presentationModeActive) {
        header?.classList.add('hidden');
        panels.forEach(p => { p.dataset.gkWasHidden = p.classList.contains('hidden') ? '1' : '0'; p.classList.add('hidden'); });
        exitBtn?.classList.remove('hidden');
    } else {
        header?.classList.remove('hidden');
        panels.forEach(p => { if (p.dataset.gkWasHidden !== '1') p.classList.remove('hidden'); delete p.dataset.gkWasHidden; });
        exitBtn?.classList.add('hidden');
    }
}
document.getElementById('btnPresentationMode')?.addEventListener('click', () => togglePresentationMode());
document.getElementById('btnExitPresentation')?.addEventListener('click', () => togglePresentationMode(true));
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && presentationModeActive) togglePresentationMode(true);
});

// --- Minimapa: vista reducida de todo el lienzo con clic-para-navegar ---
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas?.getContext('2d');
function drawMinimap() {
    if (!minimapCtx || !minimapCanvas) return;
    const w = minimapCanvas.width, h = minimapCanvas.height;
    minimapCtx.clearRect(0, 0, w, h);
    const allIds = nodes.getIds();
    if (!allIds.length) return;
    const positions = network.getPositions(allIds);
    const xs = Object.values(positions).map(p => p.x);
    const ys = Object.values(positions).map(p => p.y);
    const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60;
    const minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 60;
    const spanX = Math.max(1, maxX - minX), spanY = Math.max(1, maxY - minY);
    const scale = Math.min(w / spanX, h / spanY);
    const toMini = (x, y) => ({
        mx: (x - minX) * scale + (w - spanX * scale) / 2,
        my: (y - minY) * scale + (h - spanY * scale) / 2
    });
    // Puntos de los nodos.
    minimapCtx.fillStyle = 'rgba(79, 209, 197, 0.85)';
    allIds.forEach(id => {
        const { mx, my } = toMini(positions[id].x, positions[id].y);
        minimapCtx.beginPath();
        minimapCtx.arc(mx, my, 2.2, 0, Math.PI * 2);
        minimapCtx.fill();
    });
    // Rectángulo de la vista actual.
    const viewPos = network.getViewPosition();
    const scaleFactor = network.getScale();
    const canvasRect = container.getBoundingClientRect();
    const halfW = (canvasRect.width / scaleFactor) / 2;
    const halfH = (canvasRect.height / scaleFactor) / 2;
    const topLeft = toMini(viewPos.x - halfW, viewPos.y - halfH);
    const bottomRight = toMini(viewPos.x + halfW, viewPos.y + halfH);
    minimapCtx.strokeStyle = 'rgba(255,255,255,0.85)';
    minimapCtx.lineWidth = 1.5;
    minimapCtx.strokeRect(topLeft.mx, topLeft.my, bottomRight.mx - topLeft.mx, bottomRight.my - topLeft.my);
    minimapCtx._bounds = { minX, minY, scale, w, h, spanX, spanY };
}
minimapCanvas?.addEventListener('click', (e) => {
    const b = minimapCanvas._bounds;
    if (!b) return;
    const rect = minimapCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left, clickY = e.clientY - rect.top;
    const offsetX = (b.w - b.spanX * b.scale) / 2, offsetY = (b.h - b.spanY * b.scale) / 2;
    const worldX = (clickX - offsetX) / b.scale + b.minX;
    const worldY = (clickY - offsetY) / b.scale + b.minY;
    network.moveTo({ position: { x: worldX, y: worldY }, animation: { duration: 350, easingFunction: 'easeInOutQuad' } });
});
network.on('afterDrawing', () => drawMinimap());
setInterval(drawMinimap, 1500);

// --- Zoom semántico: al acercar mucho la cámara a un nodo con definición,
// aparece un adelanto de esa definición sin tener que abrir nada ---
let semanticZoomEl = null;
function ensureSemanticZoomEl() {
    if (semanticZoomEl) return semanticZoomEl;
    const el = document.createElement('div');
    el.id = 'gkSemanticZoomPreview';
    el.className = 'hidden fixed z-[220] max-w-[260px] bg-slate-900/95 border border-[#4fd1c5]/50 rounded-lg shadow-xl px-3 py-2 text-xs text-slate-200 leading-relaxed pointer-events-none font-sans';
    document.body.appendChild(el);
    semanticZoomEl = el;
    return el;
}
const SEMANTIC_ZOOM_THRESHOLD = 1.7;
network.on('hoverNode', (params) => {
    if (network.getScale() < SEMANTIC_ZOOM_THRESHOLD) return;
    const node = nodes.get(params.node);
    const def = node && node.definition;
    if (!def) return;
    const el = ensureSemanticZoomEl();
    const domPos = network.canvasToDOM(network.getPositions([params.node])[params.node]);
    const canvasRect = container.getBoundingClientRect();
    el.style.left = `${canvasRect.left + domPos.x + 16}px`;
    el.style.top = `${canvasRect.top + domPos.y - 10}px`;
    el.textContent = def.length > 220 ? def.slice(0, 220) + '…' : def;
    el.classList.remove('hidden');
});
network.on('blurNode', () => { if (semanticZoomEl) semanticZoomEl.classList.add('hidden'); });
network.on('zoom', () => {
    if (semanticZoomEl && network.getScale() < SEMANTIC_ZOOM_THRESHOLD) semanticZoomEl.classList.add('hidden');
});

// --- Estilo visual por importancia: tamaño/sombra por grado de conexión,
// grosor de enlace reforzando la jerarquía por profundidad ---
let importanceStylingTimer = null;
function scheduleImportanceStyling() {
    clearTimeout(importanceStylingTimer);
    importanceStylingTimer = setTimeout(applyImportanceStyling, 220);
}
function applyImportanceStyling() {
    const all = nodes.get();
    if (!all.length) return;
    const nodeUpdates = all.map(n => {
        const degree = network.getConnectedEdges(n.id).length;
        const borderWidth = Math.min(5, 1.5 + degree * 0.45);
        const shadowSize = Math.min(32, 12 + degree * 2.5);
        return { id: n.id, borderWidth, shadow: { enabled: true, color: 'rgba(79, 209, 197, 0.18)', size: shadowSize, x: 0, y: 0 } };
    });
    nodes.update(nodeUpdates);

    // Grosor de enlace: solo tocamos los que forman parte del árbol principal
    // (ambos extremos con depthLevel conocido), para no pisar colores/estilos
    // ya puestos a propósito por otras funciones (antítesis, ejemplos, etc.).
    const allEdges = edges.get();
    const edgeUpdates = [];
    allEdges.forEach(e => {
        const fromNode = nodes.get(e.from), toNode = nodes.get(e.to);
        if (!fromNode || !toNode) return;
        if (typeof fromNode.depthLevel !== 'number' || typeof toNode.depthLevel !== 'number') return;
        const deeperLevel = Math.max(fromNode.depthLevel, toNode.depthLevel);
        const width = deeperLevel <= 1 ? 3 : 2.2;
        edgeUpdates.push({ id: e.id, width });
    });
    if (edgeUpdates.length) edges.update(edgeUpdates);
}
nodes.on('add', scheduleImportanceStyling);
nodes.on('remove', scheduleImportanceStyling);
edges.on('add', scheduleImportanceStyling);
edges.on('remove', scheduleImportanceStyling);

// --- Agrupación visual por rama: un "aura" suave detrás de cada rama y sus
// sub-nodos, para que se lea de un vistazo qué pertenece a qué grupo ---
function hexToRgba(hex, alpha) {
    if (!hex || hex[0] !== '#') return `rgba(79, 209, 197, ${alpha})`;
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
network.on('beforeDrawing', (ctx) => {
    const all = nodes.get();
    const branches = all.filter(n => n.depthLevel === 1);
    if (!branches.length) return;
    branches.forEach(branch => {
        const connectedSubIds = network.getConnectedNodes(branch.id).filter(id => {
            const n = nodes.get(id);
            return n && n.depthLevel === 2;
        });
        const groupIds = [branch.id, ...connectedSubIds];
        if (groupIds.length < 2) return; // Sin sub-nodos no hace falta aura.
        const positions = network.getPositions(groupIds);
        const pts = Object.values(positions);
        const minX = Math.min(...pts.map(p => p.x)) - 70;
        const maxX = Math.max(...pts.map(p => p.x)) + 70;
        const minY = Math.min(...pts.map(p => p.y)) - 50;
        const maxY = Math.max(...pts.map(p => p.y)) + 50;
        const borderColor = (branch.color && branch.color.border) || '#4fd1c5';
        ctx.save();
        ctx.beginPath();
        const r = 28;
        const w = maxX - minX, h = maxY - minY;
        ctx.moveTo(minX + r, minY);
        ctx.arcTo(maxX, minY, maxX, minY + h, r);
        ctx.arcTo(maxX, maxY, minX, maxY, r);
        ctx.arcTo(minX, maxY, minX, minY, r);
        ctx.arcTo(minX, minY, maxX, minY, r);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(borderColor, 0.07);
        ctx.fill();
        ctx.restore();
    });
});

// ==========================================
// HERRAMIENTAS: ELIMINAR, LIMPIAR GRAFO, LIMPIAR LECTOR Y CAPTURAR
// ==========================================

// 1. Limpiar el Grafo (Botón de la barra superior)
document.getElementById('btnClear')?.addEventListener('click', async () => {
    if (nodes.length === 0) return;

    // Asegurar que el estado actual quede guardado antes de limpiar
    await saveCurrentProjectToBin();

    const createNewProject = await appConfirm(
        "Vas a limpiar el lienzo actual. Este esquema ya quedó guardado en 'Mis Proyectos'.\n\n" +
        "¿Deseas que lo próximo que hagas se guarde en un proyecto NUEVO, aparte de este?",
        { title: '¿Limpiar el lienzo?', okText: 'Sí, proyecto nuevo', cancelText: 'No, seguir en este' }
    );

    isClearingCanvas = true;
    clearTimeout(window._binSaveTimer);

    if (createNewProject) {
        currentProjectId = null;
        localStorage.removeItem('gk_current_project_id');
    }

    nodes.clear();
    edges.clear();
    // El Modo Lector NO se toca: si el usuario ya tenía un texto/enlace pegado
    // ahí, sigue intacto después de limpiar. Por eso currentDocumentText se
    // vuelve a sincronizar con lo que haya en el lector en vez de vaciarse.
    currentDocumentText = readerTextMode ? readerTextMode.innerText.trim() : "";
    // Limpiar el lienzo también debe cerrar los paneles flotantes de
    // definición/explicación/reto (quedaban "huérfanos", apuntando a nodos que
    // ya no existen) — pero sin tocar el panel del Modo Lector, que es aparte.
    Array.from(openFloatingPanels.keys()).forEach(closeFloatingPanel);
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
document.getElementById('btnClearReader')?.addEventListener('click', async () => {
    const hasText = readerTextMode && readerTextMode.innerText.trim() !== "";
    const hasContext = !!globalDocumentContext;

    if (!hasText && !hasContext) return;

    if (await appConfirm("¿Deseas limpiar el texto y el contexto del panel de lectura?")) {
        currentDocumentText = "";
        globalDocumentContext = "";
        if (readerTextMode) readerTextMode.innerText = "";
        updateReaderEmptyHint();
        if (docContextInput) docContextInput.value = "";
        docContextEditRow?.classList.add('hidden');
        updateDocContextChip();
    }
});

document.getElementById('btnCapture')?.addEventListener('click', () => {
    if (nodes.length === 0) {
        appAlert("El lienzo está vacío.");
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
            appAlert("Error al exportar la imagen.");
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
        appAlert("Error al abrir el proyecto.");
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

document.getElementById('btnNewProject')?.addEventListener('click', async () => {
    if (nodes.length > 0) {
        if (!await appConfirm("¿Deseas iniciar un esquema completamente en blanco en un proyecto aparte?")) return;
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
                else appAlert(data?.error || 'No se pudo iniciar la compra. Intenta de nuevo.');
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
                appAlert(result.data?.error || 'No se pudo confirmar el pago. Si el cargo sí se hizo, escríbenos para acreditarte los nodos.');
                return;
            }

            // El saldo que importa es el que confirma el servidor, no una suma local.
            if (typeof result.data.balance === 'number') { availableNodes = result.data.balance; updateCounterDisplay(); }
            appAlert(`¡Éxito! Se han añadido ${result.data.nodesAdded} nodos a tu cuenta.`);

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
                appAlert('Ocurrió un problema con PayPal. Intenta de nuevo en un momento.');
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
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({
                action: 'custom_prompt',
                topic: topicName,
                contextPath,
                customRequest,
                documentContext: globalDocumentContext || currentDocumentText
            })
        });

        if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || 'No se pudo procesar tu petición.'); return; }
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
        appAlert("Intenta de nuevo en unos segundos");
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
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'antithesis', topic: topicName, contextPath: getContextPath(originId) })
        });
        if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || 'No se pudo generar la antítesis.'); return; }
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
    } catch { appAlert("Error al generar antítesis."); } finally { hideLoader(); }
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
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'socratic_question', topic: topicName, contextPath: getContextPath(originId) })
        });
        if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || 'No se pudo iniciar el reto.'); return; }

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
            if (userAnswer.length < 5) return appAlert("Escribe una respuesta breve para evaluar.");
            if (!checkBalance(1)) return;

            showLoader('Evaluando tu argumento...');
            try {
                const { ok: evalOk, status: evalStatus, data: evalData } = await apiFetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'socratic_evaluate', topic: topicName, question: data.question, userAnswer })
                });
                if (!evalOk) { if (!handleBillingError(evalStatus, evalData)) appAlert(evalData?.error || 'No se pudo evaluar tu respuesta.'); return; }

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
            } catch { appAlert("Error al evaluar."); } finally { hideLoader(); }
        });
    } catch { appAlert("Error al iniciar el reto."); } finally { hideLoader(); }
});