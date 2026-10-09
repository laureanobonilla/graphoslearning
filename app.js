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
    return { nodeData: nodes.get(), edgeData: plainEdges() };
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
// Default: sistema solar (decisión de producto 2026-10-04); si la persona ya
// eligió otro modo antes, se respeta lo guardado.
let schemaLayoutMode = (() => {
    try { const v = localStorage.getItem('gk_layout_mode'); if (v === 'tree' || v === 'solar') return v; } catch {}
    return 'solar';
})();
let sourceNodeForSynergy = null;
const synergyBanner = document.getElementById('synergyBanner');

// Paleta (2026-10-08): tarjetas oscuras de cristal con borde luminoso, a juego con
// el lienzo "cosmos" y con /aprender/. La letra clara es el default global; los
// nodos de relleno claro (guardados de antes o recoloreados) reciben letra oscura
// sola — ver fixNodeFontContrast.
const elegantPalette = [
    { background: '#1b2140', border: '#8b7cf6' }, // Violeta
    { background: '#0f2f33', border: '#4fd1c5' }, // Turquesa
    { background: '#2a2414', border: '#f2b366' }, // Ámbar
    { background: '#2d1830', border: '#f472b6' }, // Rosa
    { background: '#14301f', border: '#4ade80' }, // Verde
    { background: '#162a44', border: '#60a5fa' }  // Azul
];

function getRandomColor() {
    return elegantPalette[Math.floor(Math.random() * elegantPalette.length)];
}

// Color por NIVEL (2026-10-04): cada nivel del esquema tiene su propio tono,
// y un nodo nuevo nunca hereda el tono de su padre. El color se decide UNA
// vez, al crear el nodo — nunca se recolorea después (ni al agregar niveles
// nuevos ni al reabrir un proyecto), así lo que la persona cambie a mano se
// queda como lo dejó.
const LEVEL_PALETTE = [
    { background: '#0f2f33', border: '#4fd1c5' }, // 0 raíz: turquesa
    { background: '#1b2140', border: '#8b7cf6' }, // 1: violeta
    { background: '#2a2414', border: '#f2b366' }, // 2: ámbar
    { background: '#2d1830', border: '#f472b6' }, // 3: rosa
    { background: '#14301f', border: '#4ade80' }, // 4: verde
    { background: '#2f1f14', border: '#fb923c' }  // 5: naranja (luego vuelve a empezar)
];
function colorForDepth(depth, parentColor) {
    const n = LEVEL_PALETTE.length;
    let idx = ((depth % n) + n) % n;
    const parentBg = parentColor && (parentColor.background || (typeof parentColor === 'string' ? parentColor : null));
    // Si el padre (p. ej. recoloreado a mano) ya tiene justo este tono, saltar al siguiente.
    if (parentBg && LEVEL_PALETTE[idx].background.toLowerCase() === String(parentBg).toLowerCase()) idx = (idx + 1) % n;
    return { ...LEVEL_PALETTE[idx] };
}
function colorForChildOf(parentId) {
    const parent = nodes.get(parentId);
    const depth = (computeNodeDepths().get(parentId) ?? 0) + 1;
    return colorForDepth(depth, parent && parent.color);
}

// ==========================================
// 1.b MICRO-SONIDO AL CREAR NODOS (togglable, Web Audio sintetizado — sin
// archivos de audio que cargar)
// ==========================================
// Default: sonido encendido en escritorio (decisión de producto 2026-10-04);
// se respeta lo que la persona haya elegido antes, y en pantallas chicas
// (modo móvil) arranca apagado para no sorprender con ruido.
let soundEnabled = (() => {
    try { const v = localStorage.getItem('gk_sound'); if (v === 'on') return true; if (v === 'off') return false; } catch {}
    return !window.matchMedia('(max-width: 780px)').matches;
})();
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
            color: '#dfe4f6',
            bold: { color: '#ffffff', size: 18, face: 'Sora, Inter, sans-serif' }
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
    // Guardar las posiciones finales en el dataset: sin esto, lo que el motor
    // acomodó (o lo que se arrastró) no llegaba a los datos guardados.
    try { network.storePositions(); } catch { /* no crítico */ }
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
    const userEmail = (typeof currentUser !== 'undefined' && currentUser?.email) ? currentUser.email : tr("js.sin_iniciar_sesion");

    const emailAddressEl = document.getElementById('manualPurchaseEmailAddress');
    if (emailAddressEl) emailAddressEl.innerText = SUPPORT_EMAIL;
    const emailLinkEl = document.getElementById('manualPurchaseEmailLink');
    if (emailLinkEl) emailLinkEl.href = `mailto:${SUPPORT_EMAIL}`;

    // Mensaje profesional: no menciona que "se acabó" nada (eso suena a
    // cobro automático o a una queja), sino que la persona quiere seguir
    // usando la herramienta — es información para quien responde por
    // WhatsApp, que es quien conversa el paquete/precio.
    const message = tr("js.hola_uso_graphikosmos_y_me", { userEmail });
    const waLink = document.getElementById('manualPurchaseWhatsapp');
    if (waLink) waLink.href = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

    // Si ya hay sesión, no tiene sentido pedirle el correo de nuevo — se
    // precarga (sigue siendo editable) en el formulario que manda el correo
    // de verdad (ver sendFeedbackRequest / send-feedback.js más abajo).
    const rechargeEmailInput = document.getElementById('rechargeRequestEmail');
    if (rechargeEmailInput && !rechargeEmailInput.value && currentUser?.email) {
        rechargeEmailInput.value = currentUser.email;
    }
}

function openStoreModal() {
    storeModal?.classList.remove('hidden');
    storeModal?.classList.add('flex');
    updateManualPurchaseBox();
}

// ==========================================
// ENVÍO DE CORREO REAL DESDE EL SERVIDOR (Resend) — a diferencia del enlace
// de WhatsApp de arriba (que abre TU cliente y depende de que vos le des
// "enviar"), esto manda el correo de una vez, desde netlify/functions/
// send-feedback.js. Se usa tanto para el formulario de "seguir usando la
// app" de la Tienda como para el modal de Sugerencias/Comentarios.
// ==========================================
async function sendFeedbackRequest(kind, { email, message }, statusEl, submitBtn) {
    if (statusEl) { statusEl.textContent = tr("js.enviando"); statusEl.className = 'text-xs text-slate-500 min-h-[1em]'; }
    if (submitBtn) submitBtn.disabled = true;
    try {
        const { ok, data } = await apiFetch('/.netlify/functions/send-feedback', {
            method: 'POST',
            body: JSON.stringify({ kind, email, message })
        });
        if (!ok) {
            if (statusEl) {
                statusEl.textContent = data?.error === 'rate_limited'
                    ? tr("js.ya_nos_escribiste_varias_veces")
                    : tr("js.no_se_pudo_enviar_intenta");
                statusEl.className = 'text-xs text-rose-500 min-h-[1em]';
            }
            return false;
        }
        return true;
    } catch (err) {
        console.error(err);
        if (statusEl) { statusEl.textContent = tr("js.no_se_pudo_enviar_revisa"); statusEl.className = 'text-xs text-rose-500 min-h-[1em]'; }
        return false;
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// Formulario de "seguir usando la app" dentro de la Tienda (reemplaza el
// mailto: que antes había ahí — ver index.html, storeModal).
document.getElementById('rechargeRequestForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('rechargeRequestEmail');
    const statusEl = document.getElementById('rechargeRequestStatus');
    const submitBtn = document.getElementById('btnRechargeRequestSend');
    const email = emailInput?.value.trim() || '';
    if (!email) return;

    const message = `El usuario quiere seguir usando Graphikosmos y pide que le contactemos con las opciones disponibles.`;
    const sent = await sendFeedbackRequest('recharge_request', { email, message }, statusEl, submitBtn);
    if (sent) {
        // No se llama track('...') aquí: el servidor (send-feedback.js) ya
        // registra el evento "feedback_sent" una sola vez por envío exitoso
        // (lo usa también para el límite anti-spam) — duplicarlo del lado
        // del cliente solo inflaría el conteo sin agregar información.
        if (statusEl) { statusEl.textContent = tr("js.listo_te_vamos_a_escribir"); statusEl.className = 'text-xs text-emerald-600 min-h-[1em] font-semibold'; }
        if (emailInput) emailInput.disabled = true;
        if (submitBtn) submitBtn.disabled = true;
    }
});

// ==========================================
// MODAL DE SUGERENCIAS / COMENTARIOS
// ==========================================
const feedbackModal = document.getElementById('feedbackModal');

function openFeedbackModal() {
    feedbackModal?.classList.remove('hidden');
    feedbackModal?.classList.add('flex');
    // Vuelve a mostrar el formulario (por si la última vez que se abrió había
    // quedado en el estado "enviado" de una sugerencia anterior).
    document.getElementById('feedbackForm')?.classList.remove('hidden');
    document.getElementById('feedbackForm')?.classList.add('flex');
    document.getElementById('feedbackSentView')?.classList.add('hidden');
    document.getElementById('feedbackSentView')?.classList.remove('flex');
    const emailInput = document.getElementById('feedbackEmail');
    if (emailInput && !emailInput.value && currentUser?.email) emailInput.value = currentUser.email;
    track('feedback_modal_opened');
}
function closeFeedbackModal() {
    feedbackModal?.classList.add('hidden');
    feedbackModal?.classList.remove('flex');
}

document.getElementById('btnFeedback')?.addEventListener('click', openFeedbackModal);
document.getElementById('closeFeedback')?.addEventListener('click', closeFeedbackModal);
feedbackModal?.addEventListener('mousedown', (e) => { if (e.target === feedbackModal) closeFeedbackModal(); });

document.getElementById('feedbackForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageInput = document.getElementById('feedbackMessage');
    const emailInput = document.getElementById('feedbackEmail');
    const statusEl = document.getElementById('feedbackStatus');
    const submitBtn = document.getElementById('btnFeedbackSend');
    const message = messageInput?.value.trim() || '';
    if (!message) return;

    const sent = await sendFeedbackRequest('feedback', { email: emailInput?.value.trim() || '', message }, statusEl, submitBtn);
    if (sent) {
        // Igual que en el formulario de la Tienda: el servidor ya registra
        // "feedback_sent" una vez por envío, no hace falta duplicarlo aquí.
        document.getElementById('feedbackForm')?.classList.add('hidden');
        document.getElementById('feedbackForm')?.classList.remove('flex');
        document.getElementById('feedbackSentView')?.classList.remove('hidden');
        document.getElementById('feedbackSentView')?.classList.add('flex');
        setTimeout(() => {
            closeFeedbackModal();
            if (messageInput) messageInput.value = '';
            if (statusEl) { statusEl.textContent = ''; }
        }, 2200);
    }
});

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

function showAppDialog({ title = '', message = '', mode = 'alert', defaultValue = '', okText, cancelText = tr("js.cancelar") }) {
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
        if (appDialogOk) appDialogOk.textContent = okText || (isPrompt ? tr("js.guardar") : tr("js.entendido"));
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
            tr("js.analizando_jerarquia_conceptual"),
            tr("js.conectando_nodos_y_relaciones"),
            tr("js.organizando_niveles_en_el_lienzo")
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

// Nombre legible para identificar al actor en la tabla `events` de Supabase
// sin tener que leer un UUID larguísimo cada vez. Mientras es invitado, es un
// nombre corto generado una sola vez por navegador y guardado en localStorage
// (p. ej. "Cometa-482"); en cuanto hay sesión iniciada, se manda el correo en
// su lugar — así, viendo la tabla `events` (o la vista `events_friendly`, ver
// supabase/schema.sql), se puede filtrar/leer directamente por "quién" sin
// tener que cruzar con `profiles`/`guests` a mano por el id. No sustituye a
// `anonId` (que sigue siendo el identificador estable que se cruza entre
// tablas): es solo la etiqueta legible para ojos humanos.
const DISPLAY_NAME_WORDS = ['Nébula', 'Cometa', 'Aurora', 'Cuarzo', 'Ámbar', 'Solsticio', 'Brisa', 'Lince', 'Ópalo', 'Ónix', 'Ágora', 'Ventisca', 'Céfiro', 'Ígneo', 'Tucán'];
function getGuestDisplayName() {
    try {
        let name = localStorage.getItem('gk_display_name');
        if (!name) {
            const word = DISPLAY_NAME_WORDS[Math.floor(Math.random() * DISPLAY_NAME_WORDS.length)];
            name = `${word}-${Math.floor(100 + Math.random() * 900)}`;
            localStorage.setItem('gk_display_name', name);
        }
        return name;
    } catch { return tr("js.invitado"); }
}
function getDisplayName() {
    if (typeof currentUser !== 'undefined' && currentUser?.email) return currentUser.email;
    return getGuestDisplayName();
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
                body: JSON.stringify({ event: eventName, anonId: getAnonId(), displayName: getDisplayName(), metadata: { lang: I18N.lang, ...metadata } })
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
            displayName: getDisplayName(),
            metadata: { seconds_on_page: Math.round((Date.now() - pageEnterTime) / 1000), had_nodes: typeof nodes !== 'undefined' ? nodes.length > 0 : null }
        });
        navigator.sendBeacon?.('/.netlify/functions/track-event', new Blob([body], { type: 'application/json' }));
    } catch (_err) { /* nunca debe notarse en la UI */ }
});

const RELATED_EDGE_LABELS = new Set(['relacionado', 'related']);
function isRelatedEdgeLabel(l) { return RELATED_EDGE_LABELS.has(l); }

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
        // El servidor responde (prompts de Gemini) en el idioma de la página.
        if (target.includes('/.netlify/functions/gemini') && typeof options.body === 'string') {
            try { finalOptions.body = JSON.stringify({ ...JSON.parse(options.body), lang: I18N.lang }); } catch (_e) { /* cuerpo no JSON: se envía igual */ }
        }

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
    netlifyIdentity.init({ locale: I18N.lang });
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
        appAlert(tr("js.estas_generando_muy_rapido_espera"));
        return true;
    }
    if (status === 401) {
        requireAuth(tr("js.procesar_este_esquema"));
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
        loginText.innerText = currentUser.user_metadata?.full_name?.split(' ')[0] || tr("js.mi_cuenta");
        userStatusDot.className = 'w-2 h-2 rounded-full bg-indigo-500';
    } else {
        loginText.innerText = tr("js.iniciar_sesion");
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
    display.innerText = tr("js.nodos", { availableNodes });
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
        if (isGuestUser) requireAuth(tr("js.procesar_este_esquema"));
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

// Descendientes "de jerarquía" de un nodo (hijos, nietos…): sigue solo las
// flechas padre→hijo; los vínculos 'relacionado' (cruzados, entre ramas
// distintas) NO cuentan, para que mover un nodo no arrastre otra rama que
// solo está enlazada con él.
function getHierarchyDescendants(parentId) {
    const children = new Map();
    edges.get().forEach(e => {
        if (isRelatedEdgeLabel(e.label)) return;
        if (!children.has(e.from)) children.set(e.from, []);
        children.get(e.from).push(e.to);
    });
    const seen = new Set([parentId]);
    const queue = [parentId];
    const out = [];
    while (queue.length) {
        const id = queue.shift();
        (children.get(id) || []).forEach(c => {
            if (!seen.has(c)) { seen.add(c); out.push(c); queue.push(c); }
        });
    }
    return out;
}

// Cuánto hay que desplazar un nodo (junto con su descendencia) para que un
// esquema radial de radio `needed` centrado en él no pise al resto del
// esquema. Función pura: recibe posiciones {id:{x,y}} y devuelve {dx,dy}
// (0,0 si ya hay espacio, o si no hay "resto" contra el que chocar).
function computeSolarClearance(positions, attachId, movingIds, needed) {
    const moving = new Set(movingIds);
    const others = Object.keys(positions).filter(id => !moving.has(id));
    const p0 = positions[attachId];
    if (!p0 || !others.length) return { dx: 0, dy: 0 };
    let cx = 0, cy = 0;
    others.forEach(id => { cx += positions[id].x; cy += positions[id].y; });
    cx /= others.length; cy /= others.length;
    let ux = p0.x - cx, uy = p0.y - cy;
    const len = Math.hypot(ux, uy);
    if (len < 1) { ux = 1; uy = 0; } else { ux /= len; uy /= len; }
    const minDistTo = (x, y) => others.reduce((m, id) => Math.min(m, Math.hypot(positions[id].x - x, positions[id].y - y)), Infinity);
    const fits = (d) => {
        if (minDistTo(p0.x + ux * d, p0.y + uy * d) < needed) return false;
        // La descendencia que se mueve con él tampoco debe quedar pegada a otras ramas.
        return movingIds.every(id => id === attachId || minDistTo(positions[id].x + ux * d, positions[id].y + uy * d) >= 150);
    };
    if (fits(0)) return { dx: 0, dy: 0 };
    let d = 0;
    while (d < 5000 && !fits(d)) d += 40;
    return { dx: ux * d, dy: uy * d };
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
    // 2026-10-04: el RELLENO ahora lo da el nivel (un tono distinto por nivel);
    // cuando hay cita, el BORDE conserva el color del resaltado del lector
    // (o el acento del panel), que es lo que sigue uniendo nodo y fragmento.
    const baseDepth = attachToNodeId ? (computeNodeDepths().get(attachToNodeId) ?? 0) : 0;
    const attachColor = attachToNodeId ? (nodes.get(attachToNodeId) || {}).color : null;
    const appearanceFor = (hasQuote, level) => {
        const lvl = colorForDepth(baseDepth + level, level === 1 ? attachColor : null);
        if (hasQuote) {
            const hc = nextHighlightColor();
            return {
                color: { background: lvl.background, border: (multiPanelMode && originAccent) ? originAccent : hc.node.border },
                highlightColorIdx: hc.idx
            };
        }
        return { color: lvl, highlightColorIdx: null };
    };

    // IDs de los nodos que se agregan EN ESTA llamada (para el "asentado"
    // orgánico de física al final — ver settleNewNodesOrganically más abajo —
    // y para la vista previa de importancia por grado de conexión).
    const newNodeIds = [];

    const root = data.root;
    const branches = data.branches || [];
    const subBranches = data.subBranches || [];
    // DETECCIÓN DE HUECOS: conceptos que el propio Gemini señaló como
    // mencionados-pero-no-desarrollados en este esquema (ver "gaps" en
    // gemini.js, action parse_text). Puede no venir (p. ej. analyze_text no
    // lo genera) — en ese caso ningún nodo queda marcado, ver gapsForNode.
    const allGaps = Array.isArray(data.gaps) ? data.gaps : [];
    const gapsForNode = (nodeId) => allGaps.filter(g => g.relatedNodeId === nodeId);

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
        // En sistema solar el esquema nuevo ocupa un círculo grande alrededor
        // del nodo: antes de generarlo, se aleja el nodo (con toda su
        // descendencia actual) del resto del esquema para que no se traslapen.
        if (isSolarMode) {
            const movingIds = [attachToNodeId, ...getHierarchyDescendants(attachToNodeId)];
            const { dx, dy } = computeSolarClearance(network.getPositions(), attachToNodeId, movingIds, solarTotalWidth / 2 + 90);
            if (dx || dy) {
                const before = network.getPositions(movingIds);
                movingIds.forEach(id => network.moveNode(id, before[id].x + dx, before[id].y + dy));
            }
        }
        const existingPos = network.getPositions([attachToNodeId])[attachToNodeId];
        rootId = attachToNodeId;
        rootX = existingPos.x;
        rootY = existingPos.y;
    } else if (nodes.length > 1) {
        const shouldClear = await appConfirm(tr("js.ya_tienes_un_esquema_en"), {
            title: tr("js.limpiar_el_lienzo"),
            okText: tr("js.si_crear_proyecto_nuevo"),
            cancelText: tr("js.no_agregar_al_actual")
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
        const rootAppearance = appearanceFor(!!(root.sourceQuote && root.sourceQuote.trim()), 0);
        const rootGaps = gapsForNode(root.id);
        nodes.add({
            id: root.id, label: `*${root.label}*`, baseTitle: root.label,
            color: rootAppearance.color, definition: root.definition || null,
            x: rootX, y: rootY, fixed: { x: false, y: false },
            widthConstraint: { minimum: 140, maximum: 220 },
            sourceQuote: root.sourceQuote || '', originPanelId: originPanelId,
            highlightColorIdx: rootAppearance.highlightColorIdx, depthLevel: 0,
            gaps: rootGaps,
            ...(rootGaps.length ? { shapeProperties: { borderDashes: [7, 4] } } : {})
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

        const branchAppearance = appearanceFor(!!(branch.sourceQuote && branch.sourceQuote.trim()), 1);
        const branchGaps = gapsForNode(branch.id);
        nodes.add({
            id: branch.id, label: `*${branch.label}*`, baseTitle: branch.label,
            color: branchAppearance.color, definition: branch.definition || null,
            x: branchX, y: branchY, fixed: { x: false, y: false },
            widthConstraint: { minimum: 130, maximum: 200 },
            sourceQuote: branch.sourceQuote || '', originPanelId: originPanelId,
            highlightColorIdx: branchAppearance.highlightColorIdx, depthLevel: 1,
            gaps: branchGaps,
            ...(branchGaps.length ? { shapeProperties: { borderDashes: [7, 4] } } : {})
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

            const subAppearance = appearanceFor(!!(sub.sourceQuote && sub.sourceQuote.trim()), 2);
            const subGaps = gapsForNode(sub.id);
            nodes.add({
                id: sub.id, label: `*${sub.label}*`, baseTitle: sub.label,
                color: subAppearance.color, definition: sub.definition || null,
                x: subX, y: subY, fixed: { x: false, y: false },
                widthConstraint: { minimum: 120, maximum: 185 },
                sourceQuote: sub.sourceQuote || '', originPanelId: originPanelId,
                highlightColorIdx: subAppearance.highlightColorIdx, depthLevel: 2,
                gaps: subGaps,
                ...(subGaps.length ? { shapeProperties: { borderDashes: [7, 4] } } : {})
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
    const { originPanelId = null, attachToNodeId = null, welcome = false } = opts;
    // Verificamos que tenga al menos saldo disponible para iniciar. El primer
    // esquema del asistente de bienvenida es gratis ("welcome_schema" en
    // billing.js): si por lo que sea el servidor no lo puede dejar gratis, lo
    // cobra como uno normal y responde igual — por eso aquí no se bloquea.
    if (!welcome && !checkBalance(1)) return;

    const isLong = topicText.trim().split(/\s+/).length >= 25;
    // "topicPreview": para "topic" (un tema corto escrito a mano, como
    // "Segunda Guerra Mundial") es el tema completo — no hay nada que
    // proteger, es justo lo que se quiere poder reportar ("qué tipo de
    // esquema generó este usuario"). Para "text" (documento largo pegado) NO
    // se manda el texto en sí (ver el principio de privacidad al inicio de
    // track-event.js) — en su lugar se manda `globalDocumentContext`, la
    // etiqueta corta que la propia app ya detecta sola para ese documento,
    // que es justamente un resumen apto para reportes.
    const topicPreview = isLong ? (globalDocumentContext || null) : topicText.trim().slice(0, 60);
    track('schema_generate_attempt', { mode: isLong ? 'text' : 'topic', length: topicText.length, layoutMode: schemaLayoutMode, topicPreview });

    showLoader(tr("js.estructurando_esquema"));
    if (topicInput) topicInput.value = '';

    try {
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: welcome ? 'welcome_schema' : 'parse_text', text: topicText })
        });
        if (!ok) {
            if (!handleBillingError(status, data)) appAlert(data?.error || tr("js.intenta_de_nuevo_en_unos"));
            track('schema_generate_error', { mode: isLong ? 'text' : 'topic', message: String(data?.error || status).slice(0, 120), layoutMode: schemaLayoutMode, topicPreview });
            return;
        }

        // Si se parte de un nodo existente, esa raíz ya estaba pagada (no se
        // crea un nodo nuevo para ella), así que no se vuelve a cobrar.
        const totalNodes = (attachToNodeId ? 0 : 1) + (data.branches?.length || 0) + (data.subBranches?.length || 0);

        await renderThreeLevelTree(data, { originPanelId, attachToNodeId });
        applyServerBalance(data); consumeNodes(totalNodes);
        track('schema_generate_success', { mode: isLong ? 'text' : 'topic', nodes: totalNodes, layoutMode: schemaLayoutMode, topicPreview });
    } catch (err) {
        console.error(err);
        track('schema_generate_error', { mode: isLong ? 'text' : 'topic', message: String(err?.message || '').slice(0, 120), layoutMode: schemaLayoutMode, topicPreview });
        appAlert(tr("js.intenta_de_nuevo_en_unos"));
    } finally {
        hideLoader();
    }
}

// --- Analizar Texto (distinto de "Generar Esquema"): en vez de estructurar
// lo que el texto DICE, lo analiza desde una lente elegida por el usuario
// (ver ANALYSIS_TYPE_LABELS y analyzeTypeMenu en index.html). Reutiliza
// deliberadamente el mismo renderThreeLevelTree/checkBalance/billing que
// generateFullSchemaFromTopic — el backend (gemini.js, action
// 'analyze_text') devuelve la misma forma de árbol de 3 niveles, solo que
// con contenido analítico en vez de expositivo.
const ANALYSIS_TYPE_LABELS = {
    critico: tr("js.argumentativo_critico"),
    academico: tr("js.academico_de_investigacion"),
    literario: tr("js.literario"),
    retorico: tr("js.retorico_persuasivo"),
    comparativo: tr("js.comparativo_de_posturas"),
    custom: tr("js.personalizado")
};

async function generateTextAnalysis(textContent, analysisType, customType, opts = {}) {
    if (!textContent) return;
    if (!checkBalance(1)) return;

    const { originPanelId = null, attachToNodeId = null } = opts;
    const analysisLabel = ANALYSIS_TYPE_LABELS[analysisType] || tr("js.personalizado");
    // Mismo principio de privacidad que generateFullSchemaFromTopic: nunca se
    // manda el texto en sí a la tabla de eventos, solo el contexto corto que
    // la app ya detecta sola (o, si no hay, el tipo de análisis elegido).
    const topicPreview = globalDocumentContext || (analysisType === 'custom' ? (customType || '').slice(0, 60) : analysisLabel);
    track('schema_analyze_attempt', {
        analysisType, customType: analysisType === 'custom' ? (customType || '').slice(0, 80) : null,
        length: textContent.length, layoutMode: schemaLayoutMode, topicPreview
    });

    showLoader(tr("js.analizando_texto", { analysisLabel }));

    try {
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'analyze_text', text: textContent, analysisType, customType: customType || '' })
        });
        if (!ok) {
            if (!handleBillingError(status, data)) appAlert(data?.error || tr("js.intenta_de_nuevo_en_unos"));
            track('schema_analyze_error', { analysisType, message: String(data?.error || status).slice(0, 120), topicPreview });
            return;
        }

        const totalNodes = (attachToNodeId ? 0 : 1) + (data.branches?.length || 0) + (data.subBranches?.length || 0);

        await renderThreeLevelTree(data, { originPanelId, attachToNodeId });
        applyServerBalance(data); consumeNodes(totalNodes);
        track('schema_analyze_success', { analysisType, nodes: totalNodes, topicPreview });
    } catch (err) {
        console.error(err);
        track('schema_analyze_error', { analysisType, message: String(err?.message || '').slice(0, 120), topicPreview });
        appAlert(tr("js.intenta_de_nuevo_en_unos"));
    } finally {
        hideLoader();
    }
}

// --- Menú de "🔎 Analizar Texto": un solo menú compartido (ver
// analyzeTypeMenu en index.html) reposicionado junto al botón que lo abrió,
// sea el del lector principal o el de cualquier lector clonado. Guarda en
// analyzeMenuContext de qué lector (textEl/panelId/onTitle) salió el pedido,
// para que runTextAnalysis sepa qué texto leer cuando se elige una opción.
let analyzeMenuContext = null;

function openAnalyzeMenu(anchorBtn, context) {
    const menu = document.getElementById('analyzeTypeMenu');
    if (!menu || !anchorBtn) return;
    analyzeMenuContext = context;
    const customInput = menu.querySelector('[data-role="analyzeCustomInput"]');
    if (customInput) customInput.value = '';
    menu.classList.remove('hidden');
    menu.classList.add('flex');

    const rect = anchorBtn.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 288;
    const menuHeight = menu.offsetHeight || 280;
    let left = Math.min(rect.left, window.innerWidth - menuWidth - 8);
    let top = rect.bottom + 6;
    if (top + menuHeight > window.innerHeight - 8) top = rect.top - menuHeight - 6; // no cabe abajo: se abre hacia arriba
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
}

function closeAnalyzeMenu() {
    const menu = document.getElementById('analyzeTypeMenu');
    menu?.classList.add('hidden');
    menu?.classList.remove('flex');
    analyzeMenuContext = null;
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('analyzeTypeMenu');
    if (!menu || menu.classList.contains('hidden')) return;
    if (e.target.closest('#analyzeTypeMenu') || e.target.closest('[data-role="btnAnalyzeText"]')) return;
    closeAnalyzeMenu();
});

async function runTextAnalysis(analysisType, customType) {
    const context = analyzeMenuContext;
    closeAnalyzeMenu();
    if (!context) return;

    let textContent = context.textEl ? context.textEl.innerText.trim() : "";
    if (!textContent || textContent.length < 3) return appAlert(tr("js.escribe_un_tema_pega_un"));

    textContent = await resolveTextOrWebLink(textContent, { targetTextEl: context.textEl, onTitle: context.onTitle });
    if (textContent === null) return;

    if (context.panelId === 'main') { currentDocumentText = textContent; updateReaderEmptyHint(); }
    await generateTextAnalysis(textContent, analysisType, customType, { originPanelId: context.panelId });
}

document.querySelectorAll('#analyzeTypeMenu .analyze-option').forEach(btn => {
    btn.addEventListener('click', () => runTextAnalysis(btn.dataset.analysisType, null));
});
(() => {
    const menu = document.getElementById('analyzeTypeMenu');
    const customInput = menu?.querySelector('[data-role="analyzeCustomInput"]');
    const goBtn = menu?.querySelector('[data-role="btnAnalyzeCustomGo"]');
    const submitCustom = () => {
        const customType = customInput?.value.trim();
        if (!customType) { customInput?.focus(); return; }
        runTextAnalysis('custom', customType);
    };
    goBtn?.addEventListener('click', submitCustom);
    customInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitCustom(); });
    customInput?.addEventListener('click', (e) => e.stopPropagation());
})();

document.getElementById('btnAnalyzeReaderText')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('analyzeTypeMenu');
    const alreadyOpenForMain = analyzeMenuContext?.panelId === 'main' && menu && !menu.classList.contains('hidden');
    if (alreadyOpenForMain) { closeAnalyzeMenu(); return; }
    openAnalyzeMenu(e.currentTarget, {
        textEl: readerTextMode,
        panelId: 'main',
        onTitle: (title) => {
            if (!globalDocumentContext) {
                globalDocumentContext = title;
                if (docContextInput) docContextInput.value = title;
                updateDocContextChip();
            }
        }
    });
});

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
    nodes.add({ id: topic, label: `*${topic}*`, baseTitle: topic, color: colorForDepth(0), x: spot.x, y: spot.y, fixed: { x: false, y: false } });
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
    if (!requireAuth(tr("js.profundizar_en_conceptos_relacionados"))) return;

    const currentNode = nodes.get(selectedNodeId);
    const topicName = currentNode.baseTitle || selectedNodeId;

    // Si es un nodo de Incógnita (❓), al expandirlo revelamos la respuesta
    if (currentNode && currentNode.isMystery) {
        if (!checkBalance(1)) return;
        showLoader(tr("js.revelando_incognita"));
        try {
            const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'custom_prompt',
                    topic: topicName,
                    contextPath: getContextPath(selectedNodeId),
                    customRequest: tr("js.responde_de_forma_clara_reveladora", { topicName }),
                    documentContext: globalDocumentContext || currentDocumentText
                })
            });
            if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || tr("js.no_se_pudo_resolver_la")); return; }
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
                edges.add({ from: selectedNodeId, to: newId, label: tr("js.se_explica_por") });
                if (!firstAnswer) firstAnswer = { id: newId, title: item.title, content: item.content };
                createdCount++;
            });
            nodes.update({ id: selectedNodeId, isMystery: false });
            applyServerBalance(data); consumeNodes(createdCount);
            if (firstAnswer) showContentInFloatingPanel(firstAnswer.id, firstAnswer.title, firstAnswer.content);
        } catch { appAlert(tr("js.error_al_resolver_la_incognita")); } finally { hideLoader(); }
        return;
    }

    const nodeCountVal = document.getElementById('nodeCount')?.value || 'auto';
    const maxNodes = nodeCountVal === 'auto' ? tr("js.entre_3_y_5_segun") : parseInt(nodeCountVal, 10);
    const estimatedCost = nodeCountVal === 'auto' ? 4 : maxNodes;
    if (!checkBalance(estimatedCost)) return;

    if (currentNode && currentNode.expanded) return;
    showLoader(tr("js.generando_conceptos_relacionados"));

    try {
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({
                action: 'expand',
                topic: topicName,
                contextPath: getContextPath(selectedNodeId),
                maxNodes,
                includeCuriosity: false, // ya no se generan nodos de incógnita (❓) al expandir; el código que revela incógnitas viejas se mantiene para proyectos guardados
                documentContext: globalDocumentContext || currentDocumentText
            })
        });
        if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || tr("js.no_se_pudieron_generar_conceptos")); return; }
        nodes.update(nodes.get().map(n => ({ id: n.id, fixed: { x: true, y: true } })));
        const parentPos = network.getPositions([selectedNodeId])[selectedNodeId];
        network.setOptions({ physics: { enabled: true } });

        let createdCount = 0;
        const expandChildColor = colorForChildOf(selectedNodeId);
        (data.concepts || []).forEach((concept, idx) => {
            const cId = nodes.get(concept.id) ? `${concept.id}_${Date.now()}_${idx}` : concept.id;
            nodes.update({
                id: cId, label: `*${concept.label}*`, baseTitle: concept.label,
                color: expandChildColor, expanded: false,
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
                label: tr("js.incognita", { question: data.curiosityHook.question }),
                baseTitle: data.curiosityHook.question,
                isMystery: true,
                color: { background: '#faf5ff', border: '#a855f7' },
                shapeProperties: { borderRadius: 10, borderDashes: [4, 4] },
                widthConstraint: { minimum: 170, maximum: 230 },
                x: parentPos.x + 120, y: parentPos.y + 120, fixed: { x: false, y: false }
            });
            edges.add({ from: selectedNodeId, to: hookId, label: tr("js.plantea_duda"), dashes: true, color: { color: '#a855f7' } });
        }

        nodes.update({ id: selectedNodeId, expanded: true });
        applyServerBalance(data); consumeNodes(createdCount);
        setTimeout(() => { stopPhysicsAndUnlock(); }, 1200);
    } catch { appAlert(tr("js.error_al_conectar_con_el")); } finally { hideLoader(); }
});

// ==========================================
// 8. GENERAR EJEMPLOS MANUALMENTE
// ==========================================
document.getElementById('btnMenuExamples')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;

    const nodeCountVal = document.getElementById('nodeCount')?.value || 'auto';
    const maxNodes = nodeCountVal === 'auto' ? tr("js.varios_entre_3_y_5") : parseInt(nodeCountVal, 10);
    const estimatedCost = nodeCountVal === 'auto' ? 4 : maxNodes;
    if (!checkBalance(estimatedCost)) return;

    const contextPath = getContextPath(selectedNodeId);
    const currentNode = nodes.get(selectedNodeId);
    const topicName = currentNode.baseTitle || selectedNodeId;

    showLoader(tr("js.buscando_casos_practicos"));

    try {
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'examples', topic: topicName, contextPath, maxNodes, documentContext: globalDocumentContext || currentDocumentText })
        });
        if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || tr("js.no_se_pudieron_generar_ejemplos")); return; }
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
    } catch { appAlert(tr("js.error_al_conectar_con_el")); } finally { hideLoader(); }
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
// Momento (Date.now()) en que el menú contextual se mostró por última vez —
// ver el guard en wireMenuGroup más abajo: evita que un hover "heredado" del
// clic que abrió el menú dispare un submenú de inmediato.
let actionMenuOpenedAt = 0;

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

    groupEl.addEventListener('mouseenter', () => {
        // Si el cursor ya estaba quieto exactamente sobre esta fila en el
        // instante en que el menú contextual apareció (porque el menú se
        // posiciona cerca de donde se hizo clic en el nodo, y a veces esa
        // fila cae justo ahí), algunos navegadores disparan "mouseenter" de
        // una vez, sin que el usuario haya movido el mouse — eso abría el
        // submenú solo, dando la falsa impresión de que el menú funciona con
        // hover en vez de con clic. Por eso se ignora el hover mientras el
        // menú lleve menos de 300ms abierto; un hover de verdad (el usuario
        // moviendo el mouse hacia esta fila después de eso) sigue abriendo
        // el submenú normalmente.
        if (Date.now() - actionMenuOpenedAt < 300) return;
        openGroup();
    });
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
    // Modo "unir con flecha" iniciado desde un panel (botón 🔗): el siguiente
    // clic en un nodo completa la flecha; un clic en el fondo cancela.
    if (panelLinkSourceKey) {
        if (params.nodes.length > 0) completePanelLink('node', params.nodes[0]);
        else cancelPanelLinkMode();
        return;
    }
    if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0];

        // --- SUBESQUEMA: un clic navega DENTRO de él ---
        // (antes abría el menú de acciones de nodo y había que usar doble clic).
        // Se respeta Shift/Ctrl/Cmd (armar una selección) y los modos de espera
        // de "vincular" para no romper esos flujos.
        {
            const clicked = nodes.get(clickedNodeId);
            const ev = (params.event && params.event.srcEvent) || {};
            const modifier = ev.shiftKey || ev.ctrlKey || ev.metaKey;
            if (clicked && clicked.isSubscheme && !modifier && !awaitingLinkTargetClick && !sourceNodeForConnection) {
                actionMenu.style.visibility = 'hidden';
                actionMenu.classList.add('hidden');
                selectedNodeId = null;
                enterSubscheme(clickedNodeId);
                return;
            }
        }

        // --- 0. VINCULAR FRAGMENTO SUBRAYADO COMO HIJO DE UN NODO EXISTENTE ---
        // Si el usuario pulsó "🔗 Vincular a nodo..." en el tooltip de selección,
        // el próximo clic en un nodo (sea cual sea) se interpreta como el nodo
        // padre elegido, en vez de disparar sinergia/otras acciones de clic.
        if (awaitingLinkTargetClick && pendingLinkSelection) {
            awaitingLinkTargetClick = false;
            document.body.classList.remove('gk-picking-link-target');
            const { text: topic, panelId, offsetHint } = pendingLinkSelection;
            pendingLinkSelection = null;
            if (!checkBalance(1)) return;

            const parentNode = nodes.get(clickedNodeId);
            const parentPos = network.getPositions([clickedNodeId])[clickedNodeId];
            const spot = findFreeSpot(parentPos.x, parentPos.y + 130, 150);
            const nodeId = topic;

            if (!nodes.get(nodeId)) {
                // Mismo color "de cita" y mismo resaltado permanente (gk-coverage-mark)
                // que ya usan los nodos generados por IA — ver appearanceForManualQuote
                // y el comentario junto a highlightCoverageForPanel. Antes este nodo no
                // guardaba sourceQuote/originPanelId y se resaltaba con un envoltorio
                // aparte que, sobre la vista de PDF, rompía el posicionamiento de los
                // <span> de la capa de texto (el bug del traslape reportado).
                const appearance = appearanceForManualQuote(panelId);
                nodes.add({
                    id: nodeId, label: `*${topic}*`, baseTitle: topic, color: appearance.color,
                    x: spot.x, y: spot.y, fixed: { x: false, y: false },
                    sourceQuote: topic, originPanelId: panelId,
                    highlightColorIdx: appearance.highlightColorIdx, sourceQuoteOffset: offsetHint
                });
                trackNodeUsage(topic); consumeNodes(1);
            }
            edges.add({ from: clickedNodeId, to: nodeId, label: tr("js.del_texto") });
            highlightCoverageForPanel(panelId);
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

            showLoader(tr("js.calculando_convergencia"));
            try {
                const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'synergy', topic: topicA, topicB: topicB, density: document.getElementById('nodeCount')?.value || 'auto' })
                });
                if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || tr("js.no_se_pudo_generar_la")); return; }

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
            } catch (err) { appAlert(tr("js.intenta_de_nuevo_en_unos_2")); } finally { hideLoader(); }
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

            showLoader(tr("js.generando_puente_conceptual"));
            try {
                const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'connect', topic: topicA, topicB: topicB })
                });
                if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || tr("js.no_se_pudo_generar_el")); return; }

                const posA = network.getPositions([nodeA.id])[nodeA.id];
                const posB = network.getPositions([nodeB.id])[nodeB.id];
                const midX = (posA.x + posB.x) / 2;
                const midY = (posA.y + posB.y) / 2;

                const bridge = data.bridge;
                if (!nodes.get(bridge.id)) {
                    nodes.add({ id: bridge.id, label: `*${bridge.label}*`, baseTitle: bridge.label, x: midX, y: midY, fixed: { x: false, y: false }, color: colorForChildOf(nodeA.id) });
                    trackNodeUsage(bridge.label);
                    applyServerBalance(data); consumeNodes(1);
                }
                edges.add({ from: nodeA.id, to: bridge.id, label: bridge.relFromA });
                edges.add({ from: bridge.id, to: nodeB.id, label: bridge.relToB });
            } catch (err) { appAlert(tr("js.intenta_de_nuevo_en_unos_2")); } finally { hideLoader(); }
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
        // DETECCIÓN DE HUECOS: mostrar el botón solo si este nodo tiene
        // huecos detectados, y siempre cerrar/vaciar la caja de huecos del
        // nodo anterior (igual que ya se hace con customPromptBox más abajo).
        if (typeof btnMenuShowGaps !== 'undefined' && btnMenuShowGaps) {
            const clickedNodeData2 = nodes.get(clickedNodeId);
            const hasGaps = !!(clickedNodeData2 && Array.isArray(clickedNodeData2.gaps) && clickedNodeData2.gaps.length);
            btnMenuShowGaps.classList.toggle('hidden', !hasGaps);
            gapsBox?.classList.add('hidden'); gapsBox?.classList.remove('flex');
        }
        const nodePosition = network.getPositions([selectedNodeId])[selectedNodeId];
        const DOMCoords = network.canvasToDOM(nodePosition);
        const containerRect = container.getBoundingClientRect();
        
        actionMenu.style.visibility = 'hidden';
        actionMenu.classList.remove('hidden');
        actionMenuOpenedAt = Date.now();

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
// Al arrastrar un nodo, toda su descendencia (hijos, nietos…) se mueve con él,
// conservando su posición relativa. Con Alt/Opción presionada se mueve solo el nodo.
let dragFollowers = null;
network.on('dragStart', (params) => {
    actionMenu.style.visibility = 'hidden'; actionMenu.classList.add('hidden');
    if (params.nodes.length > 0) nodes.update({ id: params.nodes[0], fixed: { x: false, y: false } });
    dragFollowers = null;
    // Con varios nodos seleccionados, vis-network ya mueve toda la selección.
    if (params.nodes.length !== 1) return;
    if (params.event && params.event.srcEvent && params.event.srcEvent.altKey) return;
    const id = params.nodes[0];
    const ids = getHierarchyDescendants(id);
    if (!ids.length) return;
    dragFollowers = { id, ids, start: network.getPositions([id, ...ids]) };
});
network.on('dragging', () => {
    if (!dragFollowers) return;
    const { id, ids, start } = dragFollowers;
    const cur = network.getPositions([id])[id];
    if (!cur) return;
    const dx = cur.x - start[id].x, dy = cur.y - start[id].y;
    ids.forEach(cid => { if (start[cid]) network.moveNode(cid, start[cid].x + dx, start[cid].y + dy); });
});
network.on('dragEnd', () => {
    dragFollowers = null;
    // Guarda las posiciones nuevas en los datos (y dispara el autoguardado).
    try { network.storePositions(); } catch { /* no crítico */ }
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
        if (subschemeSelectionCount) subschemeSelectionCount.innerText = tr("js.nodos_seleccionados", { count });
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
        if (schemeBreadcrumbLabel) schemeBreadcrumbLabel.innerText = tr("js.dentro_de", { label: top.label });
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

    const allEdges = plainEdges();
    const internalEdges = allEdges.filter(e => selectedSet.has(e.from) && selectedSet.has(e.to));
    const bridgeEdges = allEdges.filter(e => (selectedSet.has(e.from) || selectedSet.has(e.to)) && !(selectedSet.has(e.from) && selectedSet.has(e.to)));

    const innerNodes = nodes.get(selectedIds);
    const positions = network.getPositions(selectedIds);
    let sumX = 0, sumY = 0;
    selectedIds.forEach(id => { sumX += positions[id].x; sumY += positions[id].y; });
    const centerX = sumX / selectedIds.length;
    const centerY = sumY / selectedIds.length;

    const subTitle = (innerNodes[0] && innerNodes[0].baseTitle) || tr("js.subesquema");
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
        edges: plainEdges(),
        collapsedNodeId: nodeId,
        label: node.baseTitle || tr("js.subesquema"),
        panelState: serializeFloatingPanels()
    });
    closeAllFloatingPanels();

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
    const freshEdges = plainEdges();
    const freshPositions = network.getPositions(freshNodes.map(n => n.id));

    const restoredNodes = frame.nodes.map(n => {
        if (n.id !== frame.collapsedNodeId) return n;
        return {
            ...n,
            subSchemeData: { nodes: freshNodes, edges: freshEdges },
            label: `📦 ${n.baseTitle || tr("js.subesquema")}`,
            image: generateSubschemeThumbnail(freshNodes, freshEdges, freshPositions)
        };
    });

    isClearingCanvas = true;
    nodes.clear();
    edges.clear();
    closeAllFloatingPanels();
    nodes.add(restoredNodes);
    edges.add(frame.edges);
    restoreFloatingPanels(frame.panelState);
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
    { mark: { bg: 'rgba(79, 209, 197, 0.28)', border: '#2dd4bf' }, node: { background: '#0f2f33', border: '#2dd4bf' } },
    { mark: { bg: 'rgba(250, 204, 21, 0.26)', border: '#fbbf24' }, node: { background: '#2a2414', border: '#fbbf24' } },
    { mark: { bg: 'rgba(129, 140, 248, 0.30)', border: '#818cf8' }, node: { background: '#1b2140', border: '#818cf8' } },
    { mark: { bg: 'rgba(244, 114, 182, 0.28)', border: '#f472b6' }, node: { background: '#2d1830', border: '#f472b6' } },
    { mark: { bg: 'rgba(74, 222, 128, 0.26)', border: '#4ade80' }, node: { background: '#14301f', border: '#4ade80' } },
    { mark: { bg: 'rgba(251, 146, 60, 0.28)', border: '#fb923c' }, node: { background: '#2f1f14', border: '#fb923c' } },
];
let highlightColorCounter = 0;
function nextHighlightColor() {
    const idx = highlightColorCounter % highlightColorPalette.length;
    highlightColorCounter++;
    return { idx, mark: highlightColorPalette[idx].mark, node: highlightColorPalette[idx].node };
}

// Mismo criterio de color que usan los nodos generados por IA a partir de un
// documento (ver appearanceFor dentro de renderThreeLevelTree): el nodo se
// colorea a juego con el resaltado que va a tener su cita en el lector, y si
// hay más de un panel de lectura abierto, el borde respeta el acento de ESE
// panel. Se usa para los nodos creados A MANO desde una selección (⚡ Crear
// elemento / 🔗 Vincular a nodo), que antes no participaban de este esquema
// de colores ni del resaltado permanente — ver el comentario junto a
// highlightCoverageForPanel sobre por qué eso rompía la navegación texto↔nodo.
function appearanceForManualQuote(panelId) {
    const hc = nextHighlightColor();
    const multiPanelMode = readerPanelRegistry.size > 1;
    const originAccent = panelId ? readerPanelRegistry.get(panelId)?.accent : null;
    return {
        color: { background: hc.node.background, border: (multiPanelMode && originAccent) ? originAccent : hc.node.border },
        highlightColorIdx: hc.idx
    };
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
// Qué tags cuentan como "bloque" (fuerzan un salto de línea en el texto
// plano que se arma para comparar/ubicar citas): los mismos que puede
// producir tanto el toolbar de formato del lector como la extracción de un
// PDF o de un enlace web con formato (ver más abajo). <br> se trata aparte,
// inserta un salto sin ser un ancestro de bloque.
const BLOCK_BREAK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE']);

function nearestBlockAncestor(node, containerEl) {
    let el = node.parentElement;
    while (el && el !== containerEl) {
        if (BLOCK_BREAK_TAGS.has(el.tagName)) return el;
        el = el.parentElement;
    }
    return containerEl;
}

// Arma, a partir del DOM actual de un panel de lectura (que ya puede tener
// negrita, títulos, listas... ver el toolbar de formato y la importación de
// PDF/enlaces con formato), un texto plano "de trabajo" y un índice de qué
// nodo de texto real del DOM corresponde a cada posición de ese texto.
//
// Es el mismo truco que ya se había probado para la vista de PDF (antes
// pdfPageSpanIndex/wrapPdfTextRange, cuando el PDF se dibujaba aparte —
// ahora generalizado a CUALQUIER HTML dentro del editor): permite agregar
// un <mark> de resaltado alrededor de una cita SIN destruir el resto del
// formato reescribiendo todo el innerHTML desde cero, que es justo lo que
// hacía la versión anterior de esta función (buildHighlightedMarkup) — y
// por qué crear un nodo desde el texto habría borrado la negrita/títulos
// que un PDF o un enlace recién importado trajera.
//
// No se usa el innerText nativo del navegador como referencia porque no hay
// forma de mapear una posición de vuelta a un nodo del DOM con la API
// nativa — así que se define un criterio propio de "salto de línea" y se
// usa SIEMPRE el mismo, tanto para obtener "el texto de este panel" como
// para ubicar una cita dentro de él (mientras ambos usos sean consistentes
// entre sí, no hace falta que calce byte a byte con el innerText real).
function buildEditableTextIndex(containerEl) {
    let text = '';
    const index = []; // [{start, end, node}]
    const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    let node;
    let lastBlock = null;
    while ((node = walker.nextNode())) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'BR') text += '\n';
            continue;
        }
        const content = node.nodeValue;
        if (!content) continue;
        const block = nearestBlockAncestor(node, containerEl);
        if (lastBlock !== null && block !== lastBlock && text && !text.endsWith('\n')) text += '\n';
        lastBlock = block;
        index.push({ start: text.length, end: text.length + content.length, node });
        text += content;
    }
    return { text, index };
}

// Deshace los <mark> de resaltado anteriores de un panel, dejando su texto
// (y cualquier otro formato que tuvieran alrededor) tal cual estaba — paso
// previo antes de recalcular los resaltados desde cero.
function unwrapCoverageMarks(containerEl) {
    containerEl.querySelectorAll('mark.gk-coverage-mark').forEach(mark => {
        const parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize(); // fusiona los text nodes vecinos de nuevo en uno solo
    });
}

// Envuelve en un <mark> (mismo estilo que usan los nodos con cita — idea 6)
// el fragmento [seg.start, seg.end) de un índice ya calculado (ver
// buildEditableTextIndex). Un mismo segmento puede caer repartido entre
// varios nodos de texto si cruza, por ejemplo, de texto normal a negrita.
function wrapEditableTextRange(index, seg) {
    const hc = highlightColorPalette[(seg.colorIdx != null ? seg.colorIdx : 0) % highlightColorPalette.length].mark;
    index.forEach(entry => {
        const overlapStart = Math.max(seg.start, entry.start);
        const overlapEnd = Math.min(seg.end, entry.end);
        if (overlapEnd <= overlapStart) return;
        const textNode = entry.node;
        if (!textNode || !textNode.parentNode) return;
        const localStart = overlapStart - entry.start;
        const localEnd = overlapEnd - entry.start;
        try {
            const range = document.createRange();
            range.setStart(textNode, localStart);
            range.setEnd(textNode, localEnd);
            const mark = document.createElement('mark');
            mark.className = 'gk-coverage-mark';
            mark.dataset.nodeId = seg.nodeId;
            mark.style.backgroundColor = hc.bg;
            mark.style.borderBottomColor = hc.border;
            mark.dataset.baseBg = hc.bg;
            mark.dataset.baseBorder = hc.border;
            range.surroundContents(mark);
        } catch (err) { /* un nodo con estructura rara — se omite ese fragmento nada más */ }
    });
}

// Dado un texto base y una lista de citas {quote, nodeId, colorIdx}, calcula
// los intervalos [start,end) FINALES ya resueltos (sin solapes) donde cada
// uno debería quedar envuelto en un <mark> — sin tocar el DOM todavía (eso
// lo hace wrapEditableTextRange, arriba).
// Si el mismo texto aparece más de una vez en el documento (un título que se
// repite, una palabra común, dos párrafos parecidos...), buscar solo "la
// primera aparición" puede marcar un lugar que no tiene nada que ver con el
// que el usuario de verdad señaló — este era el origen del bug reportado
// como "a veces sí marca, pero en zonas erróneas, hay un traslape
// inconsistente". Cuando se conoce dónde cayó la selección real al crear el
// nodo (offsetHint — ver sourceQuoteOffset, calculado en
// computeOffsetHintForSelection), se usa esa posición para elegir la
// aparición más CERCANA en vez de siempre la primera. Sin esa pista (p. ej.
// nodos generados por IA, que nunca tuvieron una selección real de por
// medio) se mantiene el comportamiento de siempre.
function findBestQuoteOccurrence(baseText, quote, offsetHint) {
    const first = baseText.indexOf(quote);
    if (first === -1 || offsetHint == null) return first;
    let best = first, bestDist = Math.abs(first - offsetHint);
    let next = baseText.indexOf(quote, first + 1);
    while (next !== -1) {
        const dist = Math.abs(next - offsetHint);
        if (dist < bestDist) { best = next; bestDist = dist; }
        next = baseText.indexOf(quote, next + 1);
    }
    return best;
}

function resolveQuoteSegments(baseText, quotes) {
    const seen = new Set();
    const uniqueQuotes = [];
    quotes.forEach(q => {
        const key = (q.quote || '').trim();
        if (key && key.length > 2 && !seen.has(key)) { seen.add(key); uniqueQuotes.push({ ...q, quote: key }); }
    });

    // Ubicamos cada cita en el texto base (en el mismo dominio ya escapado si
    // aplica, para que las posiciones calcen exactamente con ese texto).
    const matches = [];
    uniqueQuotes.forEach(({ quote, nodeId, colorIdx, offsetHint }) => {
        const idx = findBestQuoteOccurrence(baseText, quote, offsetHint);
        if (idx === -1) return;
        matches.push({ start: idx, end: idx + quote.length, nodeId, colorIdx, length: quote.length });
    });
    if (!matches.length) return [];

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
    return placed;
}

// Texto "crudo" de un panel de lectura — centraliza esto en un solo lugar
// para que cualquier función que necesite "todo el texto de este panel"
// (resaltado de cobertura, sugerencia de vínculos por cercanía, generar un
// esquema...) lo pida siempre igual. Un PDF importado (ver "IMPORTAR PDF"
// más abajo) ya NO es un modo aparte: su texto se extrae una sola vez al
// importarlo y queda viviendo aquí mismo, en el mismo <div contenteditable>
// que el texto pegado a mano — por eso basta con un solo camino para todos.
function getPanelRawText(entry) {
    if (!entry || !entry.textEl) return '';
    return buildEditableTextIndex(entry.textEl).text;
}

// Recalcula el resaltado permanente de un panel: deshace los <mark>
// anteriores y envuelve de nuevo los fragmentos que correspondan a las
// citas actuales — SIN tocar ningún otro formato (negrita, títulos...) que
// el panel ya tuviera, a diferencia de la versión anterior de esta función
// (que reescribía todo el innerHTML desde texto plano escapado).
function highlightCoverageForPanel(panelId) {
    const entry = readerPanelRegistry.get(panelId);
    if (!entry || !entry.textEl) return;
    const quotes = [];
    nodes.getIds().forEach(id => {
        const n = nodes.get(id);
        if (n && n.originPanelId === panelId && n.sourceQuote) quotes.push({ quote: n.sourceQuote, nodeId: id, colorIdx: n.highlightColorIdx, offsetHint: n.sourceQuoteOffset });
    });
    if (quotes.length === 0) return;

    unwrapCoverageMarks(entry.textEl);
    const { text: rawText, index } = buildEditableTextIndex(entry.textEl);
    if (!rawText || !rawText.trim()) return;
    const placed = resolveQuoteSegments(rawText, quotes);
    placed.forEach(seg => wrapEditableTextRange(index, seg));
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
        // Se resuelve el textEl ACTUAL del panel en cada scroll (no el que
        // había al momento de llamar wireScrollFocus) por si en algún
        // momento cambiara de referencia.
        debounceTimer = setTimeout(() => {
            const entry = readerPanelRegistry.get(panelId);
            updateScrollFocus(panelId, contentContainer, (entry && entry.textEl) || textEl);
        }, 180);
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
    const rawText = getPanelRawText(entry);
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
        <span>${tr('toast.link_suggest', { a: labelA, b: labelB })}</span>
        <button id="gkLinkSuggestAccept" class="bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded font-semibold shrink-0">${tr('toast.link')}</button>
        <button id="gkLinkSuggestDismiss" class="bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded shrink-0">${tr('toast.dismiss')}</button>
    `;
    document.body.appendChild(toast);
    document.getElementById('gkLinkSuggestAccept')?.addEventListener('click', () => {
        const alreadyLinked = edges.get({ filter: e => (e.from === idA && e.to === idB) || (e.from === idB && e.to === idA) }).length > 0;
        if (!alreadyLinked) edges.add({ from: idA, to: idB, label: tr("js.relacionado"), dashes: [2, 3], color: { color: '#94a3b8' } });
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
        appAlert(tr("js.este_nodo_no_quedo_vinculado"));
        return;
    }
    const entry = readerPanelRegistry.get(node.originPanelId);
    if (!entry || !entry.root || !document.body.contains(entry.root)) {
        appAlert(tr("js.no_se_encontro_el_panel"));
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
        appAlert(tr("js.no_se_pudo_ubicar_la"));
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
// data-base-bg/data-base-border, puestos por wrapEditableTextRange).
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
let pendingLinkSelection = null; // { text, panelId, offsetHint }

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
const floatingPanelAnchors = new Map(); // panelKey -> { worldPoint, anchorNodeId } — el nodo real al que llega la flecha
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
//
// panelKey es la clave del panel en openFloatingPanels/floatingPanelAnchors
// (puede ser sintética, como "simple_<id>" o "socratic_<id>_<timestamp>",
// para que convivan varios paneles del mismo nodo). anchorNodeId es el ID
// de nodo REAL al que debe apuntar la flecha — antes se asumía que ambos
// eran el mismo valor, así que para cualquier panel con una clave sintética
// `nodes.get(panelKey)` nunca encontraba el nodo y la flecha simplemente no
// se dibujaba (el panel quedaba flotando sin anclar a nada). Si no se pasa,
// se usa panelKey como antes (caso de "Ver definición", donde sí coinciden).
function anchorFloatingPanelToWorld(panelKey, el, anchorNodeId) {
    const realAnchorId = anchorNodeId || panelKey;
    if (!network || !el || !nodes.get(realAnchorId)) return;
    const screenPoint = { x: el.offsetLeft, y: el.offsetTop + 20 };
    const worldPoint = network.DOMtoCanvas(screenPoint);
    // Se guarda también la posición RELATIVA al nodo: así el panel se mueve
    // con su nodo (al arrastrarlo, al arrastrar a su padre con descendientes,
    // al reacomodar el esquema), igual que cualquier otro nodo hijo.
    const nodePos = (network.getPositions([realAnchorId]) || {})[realAnchorId] || { x: 0, y: 0 };
    floatingPanelAnchors.set(panelKey, { worldPoint, anchorNodeId: realAnchorId, offset: { x: worldPoint.x - nodePos.x, y: worldPoint.y - nodePos.y } });
}

// Nodos extraídos del TEXTO de un panel flotante: la flecha sale del panel (no
// del nodo original). Mientras el panel está abierto, la arista real
// original→hijo se oculta (hidden + _panelHidden) para no dibujar dos flechas;
// al cerrar el panel reaparece, así la relación padre→hijo nunca se pierde.
const panelChildLinks = new Map(); // childId -> { panelKey, edgeId }

// Copia de las aristas SIN el ocultamiento temporal, para guardar/deshacer/
// colapsar: una arista nunca debe persistir "oculta" por un panel que ya no existe.
function plainEdges(list) {
    return (list || edges.get()).map(e => {
        if (!e._panelHidden) return e;
        const { hidden, _panelHidden, ...rest } = e;
        return rest;
    });
}

function releasePanelLink(childId) {
    const link = panelChildLinks.get(childId);
    if (!link) return;
    panelChildLinks.delete(childId);
    if (edges.get(link.edgeId)) edges.update({ id: link.edgeId, hidden: false, _panelHidden: false });
}

// Crea un nodo hijo que "sale" del panel: lo coloca pasando el panel (en la
// dirección nodo → panel) y lo une con una flecha que nace en el panel. La
// arista real origen→hijo se conserva (oculta mientras el panel esté abierto).
// Devuelve false si ya existía un nodo con ese nombre.
function spawnNodeFromPanel(panelEl, panelKey, originId, topic, edgeLabel) {
    if (nodes.get(topic)) return false;
    const parentPos = (network.getPositions([originId]) || {})[originId] || { x: 0, y: 0 };
    let spawn = { x: parentPos.x + 250, y: parentPos.y + (Math.random() * 100 - 50) };
    if (panelEl && panelEl.isConnected) {
        const rect = panelEl.getBoundingClientRect();
        const host = (floatingPanelsLayer || network.body.container).getBoundingClientRect();
        const cx = rect.left - host.left + rect.width / 2;
        const cy = rect.top - host.top + rect.height / 2;
        const nodeDom = network.canvasToDOM(parentPos);
        let dx = cx - nodeDom.x, dy = cy - nodeDom.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
        const toEdge = Math.min((rect.width / 2) / (Math.abs(dx) || 1e-6), (rect.height / 2) / (Math.abs(dy) || 1e-6));
        const jitter = (Math.random() - 0.5) * 60;
        spawn = network.DOMtoCanvas({ x: cx + dx * (toEdge + 120) - dy * jitter, y: cy + dy * (toEdge + 120) + dx * jitter });
    }
    nodes.add({
        id: topic, label: `*${topic}*`, baseTitle: topic, color: colorForChildOf(originId),
        x: spawn.x, y: spawn.y,
        fixed: { x: false, y: false },
        widthConstraint: { minimum: 150, maximum: 250 }, heightConstraint: { minimum: 50, maximum: 90 }
    });
    if (panelKey) {
        const edgeId = `pe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        edges.add({ id: edgeId, from: originId, to: topic, label: edgeLabel, hidden: true, _panelHidden: true });
        panelChildLinks.set(topic, { panelKey, edgeId });
        updateFloatingPanelAnchors();
    } else {
        edges.add({ from: originId, to: topic, label: edgeLabel });
    }
    return true;
}

// ---- Flechas que el usuario une a mano entre un panel y un nodo / otro panel ----
// { id, from: panelKey, to: nodeId|panelKey, toType: 'node'|'panel' }
let panelLinks = [];
let panelLinkSourceKey = null;

function panelLinkBanner(show) {
    let b = document.getElementById('panelLinkBanner');
    if (!b) {
        b = document.createElement('div');
        b.id = 'panelLinkBanner';
        b.className = 'hidden';
        b.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:100000;background:#0f172a;color:#fbbf24;border:1px solid #fbbf24;border-radius:10px;padding:8px 14px;font-size:12px;font-family:sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)';
        b.textContent = tr("js.elige_el_nodo_o_panel");
        document.body.appendChild(b);
    }
    b.classList.toggle('hidden', !show);
}
function cancelPanelLinkMode() {
    if (panelLinkSourceKey && openFloatingPanels.get(panelLinkSourceKey)) openFloatingPanels.get(panelLinkSourceKey).el.classList.remove('gk-panel-linking');
    panelLinkSourceKey = null;
    panelLinkBanner(false);
}
function startPanelLinkMode(key) {
    if (panelLinkSourceKey === key) { cancelPanelLinkMode(); return; }
    cancelPanelLinkMode();
    panelLinkSourceKey = key;
    const p = openFloatingPanels.get(key);
    if (p) p.el.classList.add('gk-panel-linking');
    panelLinkBanner(true);
}
function completePanelLink(toType, toId) {
    const from = panelLinkSourceKey;
    if (!from || (toType === 'panel' && toId === from)) return;
    const i = panelLinks.findIndex(l => l.from === from && l.to === toId && l.toType === toType);
    if (i >= 0) panelLinks.splice(i, 1); // unir dos veces lo mismo = quitar la flecha
    else panelLinks.push({ id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, from, to: toId, toType });
    cancelPanelLinkMode();
    updateFloatingPanelAnchors();
    triggerAutoSave();
}
function panelKeyOfElement(el) {
    for (const [key, p] of openFloatingPanels.entries()) if (p.el === el) return key;
    return null;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelLinkSourceKey) cancelPanelLinkMode(); });
// En modo "unir": un clic en OTRO panel completa la flecha panel → panel.
document.addEventListener('mousedown', (e) => {
    if (!panelLinkSourceKey) return;
    const target = e.target.closest && e.target.closest('.gk-floating-panel');
    if (!target) return;
    const key = panelKeyOfElement(target);
    if (!key) return;
    e.preventDefault();
    e.stopPropagation();
    if (key === panelLinkSourceKey) { cancelPanelLinkMode(); return; }
    completePanelLink('panel', key);
}, true);

// Rectángulo (en píxeles de pantalla, relativo a la capa de paneles) de un extremo de flecha.
function linkEndpointBox(type, id) {
    if (type === 'panel') {
        const p = openFloatingPanels.get(id);
        if (!p) return null;
        const el = p.el;
        return { cx: el.offsetLeft + el.offsetWidth / 2, cy: el.offsetTop + el.offsetHeight / 2, hw: el.offsetWidth / 2, hh: el.offsetHeight / 2 };
    }
    if (!nodes.get(id)) return null;
    const pos = (network.getPositions([id]) || {})[id];
    if (!pos) return null;
    const c = network.canvasToDOM(pos);
    let hw = 0, hh = 0;
    const box = network.getBoundingBox(id);
    if (box) {
        const a = network.canvasToDOM({ x: box.left, y: box.top }), b = network.canvasToDOM({ x: box.right, y: box.bottom });
        hw = Math.abs(b.x - a.x) / 2; hh = Math.abs(b.y - a.y) / 2;
    }
    return { cx: c.x, cy: c.y, hw, hh };
}

// ---- Guardar / restaurar los paneles junto con el proyecto ----
function serializeFloatingPanels() {
    const panels = [];
    for (const [key, p] of openFloatingPanels.entries()) {
        const anchor = floatingPanelAnchors.get(key);
        const meta = p.meta;
        if (!anchor || !meta) continue;
        const anchorNode = nodes.get(anchor.anchorNodeId);
        if (!anchorNode) continue;
        // Definición / explicación: solo si ya hay contenido guardado en el nodo
        // (si todavía estaba "cargando", no hay nada que restaurar sin llamar a la IA).
        if (meta.kind === 'definition' && !anchorNode.definition) continue;
        if (meta.kind === 'simple' && !anchorNode.simpleExplanation) continue;
        const minimized = p.contentEl.classList.contains('hidden');
        const rec = {
            key, kind: meta.kind, anchorNodeId: anchor.anchorNodeId,
            offset: anchor.offset || { x: 0, y: 0 },
            w: p.el.offsetWidth,
            h: minimized ? (parseInt(p.el.dataset.fullHeight, 10) || 420) : p.el.offsetHeight,
            minimized
        };
        if (meta.kind === 'content') { rec.title = meta.title; rec.content = meta.content; }
        if (meta.kind === 'socratic') {
            rec.topicName = meta.topicName; rec.question = meta.question;
            rec.answer = p.contentEl.querySelector('#socraticInput')?.value || '';
            const fb = p.contentEl.querySelector('#socraticFeedbackBox');
            rec.feedbackHtml = fb && !fb.classList.contains('hidden') ? fb.innerHTML : '';
        }
        panels.push(rec);
    }
    const keys = new Set(panels.map(r => r.key));
    return {
        panels,
        childLinks: Array.from(panelChildLinks.entries()).filter(([, l]) => keys.has(l.panelKey)).map(([childId, l]) => ({ childId, panelKey: l.panelKey, edgeId: l.edgeId })),
        links: panelLinks.filter(l => keys.has(l.from) && (l.toType === 'panel' ? keys.has(l.to) : !!nodes.get(l.to))).map(l => ({ ...l }))
    };
}

function closeAllFloatingPanels() {
    cancelPanelLinkMode();
    Array.from(openFloatingPanels.keys()).forEach(closeFloatingPanel);
    panelLinks = [];
}

function restoreFloatingPanels(state) {
    if (!state || !Array.isArray(state.panels)) return;
    for (const rec of state.panels) {
        if (!nodes.get(rec.anchorNodeId)) continue;
        try {
            if (rec.kind === 'definition') showDefinitionInFloatingPanel(rec.anchorNodeId);
            else if (rec.kind === 'simple') showSimpleExplanationInFloatingPanel(rec.anchorNodeId);
            else if (rec.kind === 'content') showContentInFloatingPanel(rec.key, rec.title, rec.content);
            else if (rec.kind === 'socratic') buildSocraticPanel(rec.key, rec.anchorNodeId, rec.topicName, rec.question, rec);
        } catch (err) { console.warn('[paneles] no se pudo restaurar', rec.key, err); }
        const panel = openFloatingPanels.get(rec.key);
        if (!panel) continue;
        if (rec.w) panel.el.style.width = `${rec.w}px`;
        if (rec.h) panel.el.style.height = `${rec.h}px`;
        const anchor = floatingPanelAnchors.get(rec.key);
        if (anchor && rec.offset) anchor.offset = { ...rec.offset };
        if (rec.minimized) panel.el.querySelector('.fp-minimize')?.click();
    }
    (state.childLinks || []).forEach(l => {
        if (!openFloatingPanels.has(l.panelKey) || !nodes.get(l.childId) || !edges.get(l.edgeId)) return;
        panelChildLinks.set(l.childId, { panelKey: l.panelKey, edgeId: l.edgeId });
        edges.update({ id: l.edgeId, hidden: true, _panelHidden: true });
    });
    panelLinks = (state.links || []).filter(l => openFloatingPanels.has(l.from) && (l.toType === 'panel' ? openFloatingPanels.has(l.to) : !!nodes.get(l.to)));
    updateFloatingPanelAnchors();
}

// Punto donde un rayo desde el centro (cx,cy) con dirección (dx,dy) sale de un rectángulo hw×hh.
function rayRectExit(cx, cy, hw, hh, dx, dy) {
    const t = Math.min(hw / (Math.abs(dx) || 1e-6), hh / (Math.abs(dy) || 1e-6));
    return { x: cx + dx * t, y: cy + dy * t };
}

// Se llama en cada redibujado del lienzo (pan, zoom, arrastre de nodos...):
// recoloca cada panel anclado según su punto del mundo guardado, y vuelve a
// dibujar la flecha que lo conecta con el nodo que lo originó.
function updateFloatingPanelAnchors() {
    if (!network || !floatingPanelAnchors.size) { if (floatingPanelsArrowSvg) floatingPanelsArrowSvg.innerHTML = ''; return; }
    const svg = ensureFloatingPanelsArrowSvg();
    const lines = [];
    for (const [panelKey, anchor] of Array.from(floatingPanelAnchors.entries())) {
        const panel = openFloatingPanels.get(panelKey);
        const node = nodes.get(anchor.anchorNodeId);
        // Si el nodo al que pertenece el panel ya no existe (se borró, se
        // limpió el lienzo, se cambió de nivel), el panel se va con él.
        if (!node) { if (panel) closeFloatingPanel(panelKey); else floatingPanelAnchors.delete(panelKey); continue; }
        if (!panel) { floatingPanelAnchors.delete(panelKey); continue; }
        const positions = network.getPositions([anchor.anchorNodeId]);
        const nodePos = positions && positions[anchor.anchorNodeId];
        if (!nodePos) continue;
        if (anchor.offset) anchor.worldPoint = { x: nodePos.x + anchor.offset.x, y: nodePos.y + anchor.offset.y };
        const domPoint = network.canvasToDOM(anchor.worldPoint);
        panel.el.style.left = `${domPoint.x}px`;
        panel.el.style.top = `${domPoint.y - 20}px`;
        const nodeDom = network.canvasToDOM(nodePos);
        lines.push(`<line x1="${nodeDom.x}" y1="${nodeDom.y}" x2="${domPoint.x}" y2="${domPoint.y}" stroke="#4fd1c5" stroke-width="1.5" stroke-dasharray="5,4" marker-end="url(#gkFloatingPanelArrowHead)" />`);
    }
    for (const [childId, link] of Array.from(panelChildLinks.entries())) {
        const panel = openFloatingPanels.get(link.panelKey);
        if (!panel || !nodes.get(childId)) { releasePanelLink(childId); continue; }
        const childPos = network.getPositions([childId])[childId];
        if (!childPos) continue;
        const el = panel.el;
        const pcx = el.offsetLeft + el.offsetWidth / 2, pcy = el.offsetTop + el.offsetHeight / 2;
        const childDom = network.canvasToDOM(childPos);
        let dx = childDom.x - pcx, dy = childDom.y - pcy;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const from = rayRectExit(pcx, pcy, el.offsetWidth / 2, el.offsetHeight / 2, dx, dy);
        let to = childDom;
        const box = network.getBoundingBox(childId);
        if (box) {
            const a = network.canvasToDOM({ x: box.left, y: box.top }), b = network.canvasToDOM({ x: box.right, y: box.bottom });
            const hw = Math.abs(b.x - a.x) / 2, hh = Math.abs(b.y - a.y) / 2;
            if (hw > 0 && hh > 0) { const e = rayRectExit(childDom.x, childDom.y, hw, hh, -dx, -dy); to = { x: e.x - dx * 3, y: e.y - dy * 3 }; }
        }
        lines.push(`<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#4fd1c5" stroke-width="2" marker-end="url(#gkFloatingPanelArrowHead)" />`);
    }
    for (const link of panelLinks.slice()) {
        const a = linkEndpointBox('panel', link.from);
        const b = linkEndpointBox(link.toType, link.to);
        if (!a || !b) { panelLinks = panelLinks.filter(l => l !== link); continue; }
        let dx = b.cx - a.cx, dy = b.cy - a.cy;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const p1 = rayRectExit(a.cx, a.cy, a.hw, a.hh, dx, dy);
        const p2 = (b.hw > 0 && b.hh > 0) ? rayRectExit(b.cx, b.cy, b.hw, b.hh, -dx, -dy) : { x: b.cx, y: b.cy };
        lines.push(`<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x - dx * 3}" y2="${p2.y - dy * 3}" stroke="#fbbf24" stroke-width="2" stroke-dasharray="2,5" stroke-linecap="round" marker-end="url(#gkPanelLinkArrowHead)" />`);
    }
    svg.innerHTML = `
        <defs>
            <marker id="gkFloatingPanelArrowHead" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 Z" fill="#4fd1c5" />
            </marker>
            <marker id="gkPanelLinkArrowHead" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 Z" fill="#fbbf24" />
            </marker>
        </defs>
        ${lines.join('')}
    `;
}
network.on('afterDrawing', () => updateFloatingPanelAnchors());

// Un panel flotante pertenece a su nodo: si el nodo desaparece (por cualquier
// vía: Supr, menú, "eliminar con hijos", subesquema, limpiar), el panel se
// cierra con él. Se revisa en el siguiente ciclo para no cerrar paneles cuando
// un nodo se quita y se vuelve a poner en la misma operación (rearmados).
function closeOrphanFloatingPanels() {
    for (const [key, anchor] of Array.from(floatingPanelAnchors.entries())) {
        if (openFloatingPanels.has(key) && !nodes.get(anchor.anchorNodeId)) closeFloatingPanel(key);
    }
}
nodes.on('remove', () => setTimeout(closeOrphanFloatingPanels, 0));

// Selección de paneles (se marcan al pulsar su cabecera) para poder cerrarlos con Supr.
let selectedFloatingPanelKey = null;
function selectFloatingPanel(key) {
    if (selectedFloatingPanelKey && openFloatingPanels.get(selectedFloatingPanelKey)) {
        openFloatingPanels.get(selectedFloatingPanelKey).el.classList.remove('gk-panel-selected');
    }
    selectedFloatingPanelKey = key;
    if (key && openFloatingPanels.get(key)) openFloatingPanels.get(key).el.classList.add('gk-panel-selected');
}
document.addEventListener('mousedown', (e) => {
    if (!selectedFloatingPanelKey) return;
    const inHeader = e.target.closest && e.target.closest('.gk-floating-panel .fp-header');
    if (!inHeader) selectFloatingPanel(null);
});

function closeFloatingPanel(nodeId) {
    const panel = openFloatingPanels.get(nodeId);
    if (!panel) return;
    panel.el.remove();
    openFloatingPanels.delete(nodeId);
    floatingPanelAnchors.delete(nodeId);
    if (selectedFloatingPanelKey === nodeId) selectedFloatingPanelKey = null;
    if (panelLinkSourceKey === nodeId) cancelPanelLinkMode();
    panelLinks = panelLinks.filter(l => l.from !== nodeId && !(l.toType === 'panel' && l.to === nodeId));
    for (const [childId, link] of Array.from(panelChildLinks.entries())) {
        if (link.panelKey === nodeId) releasePanelLink(childId);
    }
    updateFloatingPanelAnchors();
    triggerAutoSave();
}

function focusFloatingPanel(nodeId) {
    const panel = openFloatingPanels.get(nodeId);
    if (!panel) return;
    floatingPanelCount++;
    panel.el.style.zIndex = String(500 + floatingPanelCount);
}

// Crea (o enfoca, si ya existe) la ventana flotante de un nodo y devuelve sus
// referencias de título/contenido para que el llamador las rellene.
//
// nodeId es la clave con la que se registra el panel (puede ser sintética:
// ver showSimpleExplanationInFloatingPanel/btnMenuChallenge). anchorNodeId,
// si se pasa, es el nodo real del mapa al que debe apuntar la flecha cuando
// difiere de nodeId — por defecto es el mismo nodeId (caso normal).
function openFloatingPanel(nodeId, title, anchorNodeId) {
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
            <button class="fp-link text-amber-300 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800 transition-colors" title="${tr('panel.link_title')}">🔗</button>
            <button class="fp-minimize text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800 transition-colors" title="${tr('panel.minimize')}">—</button>
            <button class="fp-close text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800 transition-colors" title="${tr('panel.close')}">✕</button>
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
    //
    // El `height: auto` por sí solo no bastaba: la clase `min-h-[160px]` (que
    // existe para que el panel abierto nunca quede demasiado chico) seguía
    // forzando una altura mínima de 160px aunque el contenido estuviera
    // oculto, así que el panel "minimizado" quedaba con la cabecera arriba y
    // un espacio vacío grande debajo rellenando esos 160px. La solución es
    // anular también `min-height` (a 0) mientras está minimizado, y
    // restaurarla al expandir.
    el.querySelector('.fp-link')?.addEventListener('click', () => startPanelLinkMode(nodeId));
    el.addEventListener('mouseup', () => triggerAutoSave()); // mover / redimensionar el panel
    const minimizeBtn = el.querySelector('.fp-minimize');
    let isMinimized = false;
    let heightBeforeMinimize = null;
    minimizeBtn.addEventListener('click', () => {
        isMinimized = !isMinimized;
        if (isMinimized) {
            heightBeforeMinimize = el.style.height || `${el.offsetHeight}px`;
            el.dataset.fullHeight = heightBeforeMinimize;
            el.style.height = 'auto';
            el.style.minHeight = '0px';
            el.style.resize = 'none';
            contentEl.classList.add('hidden');
            minimizeBtn.textContent = '▢';
            minimizeBtn.title = tr("js.restaurar");
        } else {
            el.style.height = heightBeforeMinimize || '';
            el.style.minHeight = '';
            el.style.resize = '';
            contentEl.classList.remove('hidden');
            minimizeBtn.textContent = '—';
            minimizeBtn.title = tr("js.minimizar");
        }
        if (typeof network !== 'undefined' && network) network.redraw();
    });
    el.addEventListener('mousedown', () => focusFloatingPanel(nodeId));

    // Arrastre simple: el usuario puede reposicionar cada panel para aprovechar el
    // espacio de pantalla y comparar varias definiciones a la vez lado a lado.
    let dragState = null;
    headerEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        selectFloatingPanel(nodeId);
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
        anchorFloatingPanelToWorld(nodeId, el, anchorNodeId);
        updateFloatingPanelAnchors();
    });
    document.addEventListener('mouseup', () => { dragState = null; });

    wireResizeRedraw(el);
    // Ancla el panel, recién nacido, al punto del mapa donde cayó — así la
    // flecha aparece desde ya y el panel viaja con el nodo si se hace pan/zoom.
    anchorFloatingPanelToWorld(nodeId, el, anchorNodeId);

    const panel = { el, contentEl, titleEl, meta: null };
    openFloatingPanels.set(nodeId, panel);
    triggerAutoSave();
    return panel;
}

let globalDocumentContext = "";
let activeSelectedText = "";
let activeSelectionRange = null;
// De qué panel de lectura viene la selección activa ('main' o 'panel-N' —
// ver readerPanelRegistry) y, cuando se pudo calcular, en qué posición
// GLOBAL del texto cayó esa selección real — necesario para que un nodo
// creado a mano (⚡ Crear elemento / 🔗 Vincular a nodo) quede de verdad
// vinculado a esa cita. Por ahora siempre queda en null para texto plano
// (incluido el texto extraído de un PDF o importado de un enlace): se
// resuelve por la primera aparición del texto en el documento, como
// siempre — el campo queda listo por si en el futuro hiciera falta
// desambiguar repeticiones con la posición real del clic.
let activeSelectionPanelId = null;
let activeSelectionOffsetHint = null;
let activeNodeDetailId = null;
let activeNodePanelEl = null; // el panel flotante donde se hizo la selección (para sacar el nodo nuevo desde ahí)
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
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
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
        activeSelectionPanelId = 'main';
        activeSelectionOffsetHint = null; // texto plano: se sigue resolviendo por primera aparición, como siempre
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
wireRichPaste(readerTextMode);

// Tamaño de TODO el texto del lector (zoom) — ver wireRtfToolbar más abajo.
// Declarado aquí (antes de la primera llamada a wireRtfToolbar) porque un
// `const` no se "adelanta" como una función: si se dejaran junto a la
// definición de wireRtfToolbar (que está más abajo en el archivo), esta
// primera llamada fallaría con "Cannot access before initialization".
const READER_ZOOM_KEY = 'gk_reader_zoom';
const READER_ZOOM_BASE_REM = 0.875; // equivalente al "text-sm" original
const READER_ZOOM_MIN = 70, READER_ZOOM_MAX = 200, READER_ZOOM_STEP = 10;

wireRtfToolbar(readerPanel?.querySelector('[data-role="rtfToolbar"]'), readerTextMode);

// ==========================================
// IMPORTAR PDF: se EXTRAE el texto del PDF (con su formato aproximado —
// párrafos, encabezados, negrita/cursiva cuando se puede detectar) y se
// inserta en el mismo editor de texto plano del Modo Lector (readerTextMode).
// A partir de ahí, para el resto de la app, un PDF importado es
// indistinguible de texto pegado a mano: misma selección, mismo resaltado
// permanente, mismo camino de generación de esquema.
//
// Antes se intentó "dibujar" el PDF (un <canvas> por página + una capa de
// texto invisible encima para poder seleccionar, como cualquier lector de
// PDF). Se abandonó ese enfoque: el orden interno en que un PDF guarda sus
// fragmentos de texto no siempre coincide con el orden de lectura visual, y
// eso rompía tanto la selección nativa del navegador (que sigue el orden del
// DOM, no la posición en pantalla) como el texto usado para generar el
// esquema — produciendo selecciones y resaltados en el lugar equivocado. Es
// un modo ADICIONAL y OPCIONAL: mientras el usuario no suba un PDF, el Modo
// Lector funciona exactamente igual que siempre.
// ==========================================
const btnImportPdf = document.getElementById('btnImportPdf');
const pdfFileInput = document.getElementById('pdfFileInput');
const pdfRangeBar = document.getElementById('pdfRangeBar');
const pdfRangeFrom = document.getElementById('pdfRangeFrom');
const pdfRangeTo = document.getElementById('pdfRangeTo');
const pdfRangeTotal = document.getElementById('pdfRangeTotal');
const pdfRangeFileName = document.getElementById('pdfRangeFileName');
const btnPdfRangeLoad = document.getElementById('btnPdfRangeLoad');
const btnPdfRangeCancel = document.getElementById('btnPdfRangeCancel');

// Escapa texto plano para poder insertarlo de forma segura dentro de un
// string de HTML (usado tanto para el texto extraído de un PDF como, más
// abajo, para el HTML importado de una página web).
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Tope del rango que se ofrece por default al elegir un PDF (el usuario
// puede ampliarlo a mano antes de darle "Cargar") — páginas de más no se
// extraen de entrada para no volver pesado un PDF largo sin que el usuario
// lo haya pedido explícitamente.
const MAX_PDF_DEFAULT_PAGES = 20;

let activePdfDoc = null;       // documento pdf.js actualmente elegido (antes de "Cargar")
let pdfCurrentFileName = '';

async function handlePdfFileSelected(file) {
    if (!file) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
        appAlert(tr("js.elegi_un_archivo_pdf"));
        return;
    }
    showLoader(tr("js.leyendo_el_pdf"));
    try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        activePdfDoc = doc;
        pdfCurrentFileName = file.name;
        if (pdfRangeFileName) pdfRangeFileName.textContent = file.name;
        if (pdfRangeTotal) pdfRangeTotal.textContent = String(doc.numPages);
        if (pdfRangeFrom) { pdfRangeFrom.max = String(doc.numPages); pdfRangeFrom.value = '1'; }
        if (pdfRangeTo) { pdfRangeTo.max = String(doc.numPages); pdfRangeTo.value = String(Math.min(doc.numPages, MAX_PDF_DEFAULT_PAGES)); }
        pdfRangeBar?.classList.remove('hidden');
        pdfRangeBar?.classList.add('flex');
        track('pdf_import_selected', { pages: doc.numPages, sizeKb: Math.round(file.size / 1024) });
    } catch (err) {
        console.error(err);
        appAlert(tr("js.no_se_pudo_leer_ese"));
        track('pdf_import_error', { stage: 'read', message: String(err?.message || '').slice(0, 120) });
    } finally {
        hideLoader();
    }
}

btnImportPdf?.addEventListener('click', () => pdfFileInput?.click());
pdfFileInput?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    handlePdfFileSelected(file);
    e.target.value = ''; // para poder volver a elegir el mismo archivo más tarde si hace falta
});
btnPdfRangeCancel?.addEventListener('click', () => {
    pdfRangeBar?.classList.add('hidden');
    pdfRangeBar?.classList.remove('flex');
    activePdfDoc = null;
});

// Agrupa los items de page.getTextContent() (fragmentos de texto con su
// posición x/y) en líneas visuales, ordenadas de arriba hacia abajo y, dentro
// de cada línea, de izquierda a derecha. item.transform es la matriz de
// transformación de pdf.js: transform[4]/transform[5] son x/y (el eje Y
// crece hacia arriba), y Math.hypot(transform[2], transform[3]) es la
// altura aproximada de la fuente — se usa como referencia de tamaño para
// agrupar líneas y, más abajo, para detectar encabezados.
function groupPdfItemsIntoLines(items) {
    const withPos = (items || [])
        .filter(it => typeof it.str === 'string')
        .map(it => ({
            item: it,
            x: it.transform[4],
            y: it.transform[5],
            height: Math.hypot(it.transform[2], it.transform[3]) || 1
        }));
    if (withPos.length === 0) return [];
    withPos.sort((a, b) => b.y - a.y);
    const lines = [];
    withPos.forEach(entry => {
        let line = lines[lines.length - 1];
        const tolerance = Math.max(2, entry.height * 0.4);
        if (!line || Math.abs(entry.y - line.y) > tolerance) {
            line = { y: entry.y, items: [] };
            lines.push(line);
        }
        line.items.push(entry);
    });
    lines.forEach(line => line.items.sort((a, b) => a.x - b.x));
    return lines;
}

// Intenta adivinar si un fragmento de texto va en negrita/cursiva a partir
// del nombre interno de su fuente. Es un indicio débil: muchos PDFs no
// incluyen "Bold"/"Italic" en el nombre de la fuente, y page.commonObjs
// normalmente solo se termina de llenar durante un render() real — que esta
// extracción ya no hace — así que puede no detectar nada en varios
// documentos. Nunca lanza error: en el peor caso simplemente no marca
// negrita/cursiva donde sí la había en el PDF original.
function guessPdfItemStyle(page, item) {
    try {
        const fontObj = page.commonObjs.get(item.fontName);
        const name = String(fontObj?.name || item.fontName || '').toLowerCase();
        return {
            bold: /bold|black|heavy|semibold/.test(name),
            italic: /italic|oblique/.test(name)
        };
    } catch {
        return { bold: false, italic: false };
    }
}

function medianOfNumbers(numbers) {
    if (!numbers || numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Extrae el texto (NO lo dibuja) de fromPage..toPage y lo inserta como HTML
// dentro de readerTextMode, reconstruyendo párrafos/encabezados/negrita de
// forma aproximada a partir de la posición y el tamaño de cada fragmento de
// texto. Desde este momento, para el resto de la app, el PDF importado es
// exactamente lo mismo que texto pegado a mano en el Modo Lector: mismo
// editor, misma selección, mismo sistema de resaltado permanente y de
// generación de esquema (ver highlightCoverageForPanel/getPanelRawText).
async function extractPdfRangeIntoReader(fromPage, toPage) {
    if (!activePdfDoc) return;
    showLoader(tr("js.extrayendo_texto_de_las_paginas", { fromPage, toPage }));
    try {
        const pagesData = [];
        for (let pageNum = fromPage; pageNum <= toPage; pageNum++) {
            const page = await activePdfDoc.getPage(pageNum);
            const content = await page.getTextContent();
            pagesData.push({ page, lines: groupPdfItemsIntoLines(content.items) });
        }

        // Altura "normal" de línea de cuerpo de texto, para distinguir
        // encabezados (fragmentos notablemente más grandes) del resto.
        const allHeights = [];
        pagesData.forEach(({ lines }) => lines.forEach(line => line.items.forEach(it => allHeights.push(it.height))));
        const bodyHeight = medianOfNumbers(allHeights) || 10;

        const htmlParts = [];
        pagesData.forEach(({ page, lines }, pageIdx) => {
            if (pagesData.length > 1) {
                htmlParts.push(`<p style="color:#9ca3af;font-size:0.85em;margin:0.6em 0;">— página ${fromPage + pageIdx} —</p>`);
            }
            let paragraphLines = [];
            let prevLine = null;

            const flushParagraph = () => {
                if (paragraphLines.length === 0) return;
                const isHeading = paragraphLines.length === 1 && paragraphLines[0].maxHeight > bodyHeight * 1.18;
                const innerHtml = paragraphLines.map(l => l.html).join(' ');
                if (isHeading) {
                    const tag = paragraphLines[0].maxHeight > bodyHeight * 1.6 ? 'h2' : 'h3';
                    htmlParts.push(`<${tag}>${innerHtml}</${tag}>`);
                } else {
                    htmlParts.push(`<p>${innerHtml}</p>`);
                }
                paragraphLines = [];
            };

            lines.forEach(line => {
                // Une las "palabras" (fragmentos) de la línea, insertando un
                // espacio cuando hay un salto horizontal notable entre uno y
                // el siguiente — pdf.js no siempre guarda el espacio como su
                // propio fragmento de texto.
                let lineHtml = '';
                let maxHeight = 0;
                let prevItemEnd = null;
                line.items.forEach(entry => {
                    const { item } = entry;
                    maxHeight = Math.max(maxHeight, entry.height);
                    const text = item.str || '';
                    if (!text) { prevItemEnd = entry.x + (item.width || 0); return; }
                    let piece = escapeHtml(text);
                    const style = guessPdfItemStyle(page, item);
                    if (style.bold) piece = `<strong>${piece}</strong>`;
                    if (style.italic) piece = `<em>${piece}</em>`;
                    if (prevItemEnd != null) {
                        const gap = entry.x - prevItemEnd;
                        if (gap > entry.height * 0.22 && !/^\s/.test(text) && !lineHtml.endsWith(' ')) lineHtml += ' ';
                    }
                    lineHtml += piece;
                    prevItemEnd = entry.x + (item.width || 0);
                });
                if (!lineHtml.trim()) { prevLine = line; return; }

                // Un hueco vertical notable respecto a la línea anterior se
                // interpreta como salto de párrafo.
                if (prevLine && (prevLine.y - line.y) > bodyHeight * 1.6) flushParagraph();
                paragraphLines.push({ html: lineHtml, maxHeight });
                prevLine = line;
            });
            flushParagraph();
        });

        const extractedHtml = htmlParts.join('\n');
        if (!extractedHtml.trim()) {
            appAlert(tr("js.no_se_encontro_texto_en"));
            track('pdf_import_error', { stage: 'extract', message: 'empty' });
            return;
        }

        readerTextMode.innerHTML = extractedHtml;
        updateReaderEmptyHint();

        globalDocumentContext = tr("js.pag", { file: pdfCurrentFileName || 'PDF', fromPage, toPage });
        if (docContextInput) docContextInput.value = globalDocumentContext;
        updateDocContextChip();

        pdfRangeBar?.classList.add('hidden');
        pdfRangeBar?.classList.remove('flex');
        activePdfDoc = null;
        track('pdf_import_success', { pages: (toPage - fromPage + 1) });
    } catch (err) {
        console.error(err);
        appAlert(tr("js.no_se_pudo_extraer_el"));
        track('pdf_import_error', { stage: 'extract', message: String(err?.message || '').slice(0, 120) });
    } finally {
        hideLoader();
    }
}

btnPdfRangeLoad?.addEventListener('click', () => {
    if (!activePdfDoc) return;
    const total = activePdfDoc.numPages;
    let from = Math.max(1, Math.min(total, parseInt(pdfRangeFrom?.value, 10) || 1));
    let to = Math.max(1, Math.min(total, parseInt(pdfRangeTo?.value, 10) || total));
    if (from > to) { const t = from; from = to; to = t; }
    extractPdfRangeIntoReader(from, to);
});

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
            id: nodeId, label: `*${text}*`, baseTitle: text, color: colorForDepth(0),
            x: canvasPos.x, y: canvasPos.y, fixed: { x: false, y: false }
        });
        trackNodeUsage(text); consumeNodes(1);
    }
    selectedNodeId = nodeId;
    setTimeout(() => flashNewNode(nodeId), 50);
    track('node_created_via_drag');
});

// ÚNICO BOTÓN AL SUBRAYAR EN EL LECTOR ("⚡ Crear elemento en esquema")
//
// Crear un nodo desde una selección de texto se resuelve igual que un nodo
// generado por IA a partir de un documento: se guarda
// sourceQuote/originPanelId/highlightColorIdx (más sourceQuoteOffset si se
// pudo calcular — ver el listener 'mouseup' de readerTextMode/paneles
// clonados, donde se arma a partir del Range real de la selección) y se
// llama a highlightCoverageForPanel, que envuelve ese fragmento con un
// <mark> preservando el resto del formato del panel (ver
// buildEditableTextIndex/wrapEditableTextRange).
document.getElementById('tipBtnCreateNode')?.addEventListener('click', () => {
    if (!activeSelectedText) return;
    selectionTooltip.classList.add('hidden');
    const topic = activeSelectedText;
    const panelId = activeSelectionPanelId || 'main';
    const offsetHint = activeSelectionOffsetHint;
    activeSelectedText = ""; activeSelectionRange = null; activeSelectionPanelId = null; activeSelectionOffsetHint = null;

    if (!checkBalance(1)) return;

    const viewCenter = network.getViewPosition();
    const nodeId = topic;

    if (!nodes.get(nodeId)) {
        const appearance = appearanceForManualQuote(panelId);
        nodes.add({
            id: nodeId, label: `*${topic}*`, baseTitle: topic, color: appearance.color,
            x: viewCenter.x + (Math.random() * 100 - 50), y: viewCenter.y + (Math.random() * 100 - 50),
            fixed: { x: false, y: false },
            sourceQuote: topic, originPanelId: panelId,
            highlightColorIdx: appearance.highlightColorIdx, sourceQuoteOffset: offsetHint
        });
        trackNodeUsage(topic); consumeNodes(1);
    }
    highlightCoverageForPanel(panelId);
    selectedNodeId = nodeId;
});

// "🔗 Vincular a nodo...": en vez de crear el nodo suelto de una vez, guarda la
// selección (con su panel y offsetHint — ver arriba) y entra en modo
// "esperando clic en el nodo destino" — el próximo clic sobre un nodo
// (interceptado al inicio de network.on('click', ...)) crea el nodo nuevo YA
// conectado como hijo de ese nodo elegido, con el mismo resaltado permanente.
document.getElementById('tipBtnLinkToNode')?.addEventListener('click', () => {
    if (!activeSelectedText) return;
    selectionTooltip.classList.add('hidden');
    pendingLinkSelection = { text: activeSelectedText, panelId: activeSelectionPanelId || 'main', offsetHint: activeSelectionOffsetHint };
    activeSelectedText = ""; activeSelectionRange = null; activeSelectionPanelId = null; activeSelectionOffsetHint = null;
    awaitingLinkTargetClick = true;
    document.body.classList.add('gk-picking-link-target');
    appAlert(tr("js.ahora_haz_clic_en_el"));
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
    const btnAnalyze = q('btnAnalyzeText');
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
            activeSelectionPanelId = panelId;
            activeSelectionOffsetHint = null; // texto plano: se sigue resolviendo por primera aparición, como siempre
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
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
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
        if (await appConfirm(tr("js.deseas_limpiar_el_texto_y"))) {
            localContext = "";
            if (textEl) textEl.innerText = "";
            if (contextInput) contextInput.value = "";
            editRow?.classList.add('hidden');
            updateChip(); updateEmptyHintLocal();
        }
    });

    btnAdd?.addEventListener('click', () => createExtraReaderPanel());

    // Mismo menú compartido #analyzeTypeMenu que usa el lector principal
    // (ver openAnalyzeMenu/runTextAnalysis más arriba en este archivo) — cada
    // lector clonado solo le pasa SU PROPIO textEl/onTitle como contexto.
    btnAnalyze?.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.getElementById('analyzeTypeMenu');
        const alreadyOpenForThis = analyzeMenuContext?.panelId === panelId && menu && !menu.classList.contains('hidden');
        if (alreadyOpenForThis) { closeAnalyzeMenu(); return; }
        openAnalyzeMenu(e.currentTarget, {
            textEl,
            panelId,
            onTitle: (t) => { if (!localContext) { localContext = t; if (contextInput) contextInput.value = t; updateChip(); } }
        });
    });

    btnGenerate?.addEventListener('click', async () => {
        let textContent = textEl ? textEl.innerText.trim() : "";
        if (!textContent || textContent.length < 3) return appAlert(tr("js.escribe_un_tema_pega_un"));

        textContent = await resolveTextOrWebLink(textContent, {
            targetTextEl: textEl,
            onTitle: (t) => { if (!localContext) { localContext = t; if (contextInput) contextInput.value = t; updateChip(); } }
        });
        if (textContent === null) return;
        updateEmptyHintLocal();

        await generateFullSchemaFromTopic(textContent, { originPanelId: panelId });
    });

    wireDragToCanvas(textEl);
    wireRichPaste(textEl);
    wireRtfToolbar(q('rtfToolbar'), textEl);
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
    // Importar PDF es una funcionalidad SOLO del panel "main" (el estado del
    // PDF activo es global, no por panel) — se quitan esos controles del
    // clon en vez de dejar un botón que se vería igual pero no haría nada
    // (nunca se le conecta ningún listener, porque ese cableado se hizo una
    // sola vez contra el #btnImportPdf original antes de clonar).
    clone.querySelectorAll('[data-role="btnImportPdf"], [data-role="pdfFileInput"], [data-role="pdfRangeBar"]').forEach(el => el.remove());

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
    panel.meta = { kind: 'content', title, content: String(content || '') };
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
    panel.meta = { kind: 'definition' };

    const cacheIsUsable = definitionText && (defSource === 'wikipedia' || defSource === 'pregenerated' || definitionText.includes('[['));
    if (!cacheIsUsable) {
        panel.contentEl.innerHTML = `
            <div class="flex flex-col items-center justify-center gap-3 py-6">
                <div class="relative w-8 h-8">
                    <div class="absolute inset-0 border-[3px] border-slate-700 rounded-full"></div>
                    <div class="absolute inset-0 border-[3px] border-[#4fd1c5] rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p class="text-slate-400 text-xs italic">${tr('def.writing')}</p>
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
            if (!ok) { panel.contentEl.innerHTML = `<p class="text-rose-400 text-xs">${tr('def.err_get')}</p>`; return; }
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
            panel.contentEl.innerHTML = `<p class="text-rose-400 text-xs">${tr('def.err_get_generic')}</p>`;
            return;
        }
    }

    if (defSource === 'wikipedia') {
        panel.contentEl.innerHTML = `
            ${wikiImage ? `<img src="${wikiImage}" alt="${title}" class="w-full h-32 object-cover rounded-lg mb-3 border border-slate-700">` : ''}
            <p class="leading-relaxed text-slate-200">${definitionText}</p>
            <p class="mt-3 text-[10px] text-slate-500">${tr('def.source')}: ${wikiUrl ? `<a href="${wikiUrl}" target="_blank" rel="noopener" class="underline hover:text-slate-300">Wikipedia</a>` : 'Wikipedia'}</p>
        `;
        return;
    }

    const hasInteractiveHints = definitionText.includes('[[');
    panel.contentEl.innerHTML = `
        ${hasInteractiveHints ? `<p class="text-[11px] text-slate-400 mb-3">${tr('def.hint')}</p>` : ''}
        <div class="leading-relaxed text-slate-200">${formatInteractiveDefinition(definitionText, nodeId)}</div>
    `;

    panel.contentEl.querySelectorAll('.btn-inline-concept').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const term = e.currentTarget.dataset.term;
            const parentId = e.currentTarget.dataset.parent;
            if (!checkBalance(1)) return;

            if (!nodes.get(term)) {
                spawnNodeFromPanel(panel.el, nodeId, parentId, term, tr("js.involucra"));
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

    const newText = await appPrompt(tr("js.editar_texto_del_nodo"), currentPlainText, { title: tr("js.editar_texto") });
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

    // Tercer argumento: el nodo real al que debe apuntar la flecha (antes se
    // omitía y, como panelKey no es un id de nodo real, la flecha nunca se
    // dibujaba para este panel — ver anchorFloatingPanelToWorld).
    const panel = openFloatingPanel(panelKey, `💡 ${title}`, nodeId);
    panel.el.dataset.nodeId = nodeId;
    panel.meta = { kind: 'simple' };
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
                <p class="text-slate-400 text-xs italic">${tr('def.preparing_simple')}</p>
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
            if (!ok) { panel.contentEl.innerHTML = `<p class="text-rose-400 text-xs">${tr('def.err_simple')}</p>`; return; }
            applyServerBalance(data);
            simple = { definition: data.definition, analogy: data.analogy, example: data.example };
            nodes.update({ id: nodeId, simpleExplanation: simple });
        } catch (err) {
            panel.contentEl.innerHTML = `<p class="text-rose-400 text-xs">${tr('def.err_simple_generic')}</p>`;
            return;
        }
    }

    const esc = (s) => String(s || '').replace(/\n/g, '<br>');
    panel.contentEl.innerHTML = `
        <div class="flex flex-col gap-4">
            <div>
                <p class="text-[10px] font-bold text-lime-400 uppercase tracking-wider mb-1">${tr('def.simple_words')}</p>
                <p class="leading-relaxed text-slate-200">${esc(simple.definition)}</p>
            </div>
            <div class="bg-lime-500/10 border border-lime-500/20 rounded-lg p-3">
                <p class="text-[10px] font-bold text-lime-400 uppercase tracking-wider mb-1">${tr('def.its_like')}</p>
                <p class="leading-relaxed text-slate-200 text-[13px]">${esc(simple.analogy)}</p>
            </div>
            <div>
                <p class="text-[10px] font-bold text-lime-400 uppercase tracking-wider mb-1">${tr('def.for_example')}</p>
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
        activeNodePanelEl = panelEl;
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

    // Nodo REAL del que deriva el concepto. Los paneles con clave sintética
    // (reto socrático, etc.) guardan su nodo real en floatingPanelAnchors.
    const panelEl = activeNodePanelEl;
    activeNodePanelEl = null;
    const panelKey = panelKeyOfElement(panelEl);
    let originId = activeNodeDetailId;
    if (panelKey && floatingPanelAnchors.get(panelKey)) originId = floatingPanelAnchors.get(panelKey).anchorNodeId;
    if (!nodes.get(originId)) return;

    // El nodo nace DESDE EL PANEL y la flecha sale de él (ver spawnNodeFromPanel).
    if (spawnNodeFromPanel(panelEl, panelKey, originId, childTopic, tr("js.deriva_en"))) {
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

// Convierte texto plano (con saltos de línea "sueltos", como el que viene de
// copiar un PDF o un .txt con corte fijo de columna, o el que ya se había
// guardado de un proyecto antes del editor con formato) en párrafos reales
// (<p>...</p>) en vez de insertarlo tal cual con sus saltos de línea
// incluidos. Esto es justo lo que permite que el texto se vuelva a acomodar
// solo al ancho del panel (al ensancharlo o angostarlo): un salto de línea
// "suelto" dentro de lo que es el mismo párrafo se trata como un simple
// espacio (se UNE, no se corta ahí), y solo una línea en blanco de verdad
// (dos o más saltos de línea seguidos) se conserva como el límite real entre
// un párrafo y el siguiente.
function textToParagraphHtml(text) {
    const paragraphs = String(text || '')
        .replace(/\r\n?/g, '\n')
        .split(/\n[ \t]*\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .map(p => `<p>${escapeHtml(p).replace(/\n+/g, ' ')}</p>`);
    return paragraphs.join('');
}

// Lista blanca de etiquetas que se conservan al traer el HTML de un artículo
// (ver sanitizeImportedHtml) — deliberadamente angosta: alcanza para que un
// artículo normal (párrafos, encabezados, negrita/cursiva, listas, citas) se
// vea parecido al original, sin arrastrar nada que pueda romper el editor o
// inyectar comportamiento (scripts, estilos inline con position/float raros,
// imágenes rotas que dejen huecos, etc.) — el editor del lector es texto con
// formato simple, no un visor de páginas web completo.
const IMPORTED_HTML_ALLOWED_TAGS = new Set([
    'P', 'BR', 'H1', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'U',
    'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'SPAN'
]);

// Limpia el HTML que devuelve Readability (o el que trae un copy/paste desde
// otra página — ver el listener 'paste' de readerTextMode) antes de
// insertarlo: quita cualquier etiqueta fuera de la lista blanca (conservando
// su TEXTO, no solo borrándola entera — así no se pierde contenido, solo el
// marcado que no interesa) y, de las que sí se dejan, solo conserva el
// atributo href en los enlaces (nada de estilos inline, clases, ids, on*,
// etc. que pudieran traer de la página de origen).
function sanitizeImportedHtml(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html || '';

    const stripDisallowed = (node) => {
        Array.from(node.childNodes).forEach(child => {
            if (child.nodeType === Node.ELEMENT_NODE) {
                stripDisallowed(child);
                if (!IMPORTED_HTML_ALLOWED_TAGS.has(child.tagName)) {
                    while (child.firstChild) node.insertBefore(child.firstChild, child);
                    node.removeChild(child);
                    return;
                }
                Array.from(child.attributes).forEach(attr => {
                    if (!(child.tagName === 'A' && attr.name === 'href')) child.removeAttribute(attr.name);
                });
                if (child.tagName === 'A') child.setAttribute('target', '_blank');
            } else if (child.nodeType !== Node.TEXT_NODE) {
                node.removeChild(child); // comentarios, etc.
            }
        });
    };
    stripDisallowed(wrapper);
    return wrapper.innerHTML;
}

// ==========================================
// BARRA DE FORMATO (RTF) DEL EDITOR DEL LECTOR
// ==========================================
// Conecta los botones/el selector de tamaño de un panel (ver [data-role=
// "rtfToolbar"] en index.html) con document.execCommand sobre el textEl de
// ESE panel — así el usuario puede, además del texto que llega formateado
// de un PDF o un enlace, darle negrita/cursiva/encabezados/listas a mano,
// como en cualquier editor de texto con formato simple.
//
// El truco de siempre para no perder la selección activa del editor al usar
// un botón de una barra de herramientas: un mousedown sobre un <button>
// movería el foco (y con él, la selección de texto dentro del
// contenteditable) ANTES de que el 'click' llegue a ejecutar el comando —
// se previene ese mousedown por default, así el foco/selección nunca se
// mueven y para cuando llega el click, execCommand actúa sobre lo que el
// usuario de verdad tenía seleccionado. Un <select> es distinto: necesita su
// mousedown nativo para poder desplegarse, así que en vez de prevenirlo se
// guarda la selección actual (con un Range real) y se restaura justo antes
// de ejecutar el comando en su 'change'.
// Tamaño de TODO el texto del lector (zoom), distinto del selector "Tamaño de
// letra" de arriba: ese usa execCommand y solo afecta la selección activa;
// esto cambia el font-size base de todo #readerTextMode. El valor se guarda
// en localStorage para que el próximo panel (o el mismo, recargando la
// página) arranque con el último tamaño elegido.
function wireRtfToolbar(toolbarEl, textEl) {
    if (!toolbarEl || !textEl) return;

    let zoomPct = Number(localStorage.getItem(READER_ZOOM_KEY)) || 100;
    const zoomOutBtn = toolbarEl.querySelector('[data-role="btnZoomOut"]');
    const zoomInBtn = toolbarEl.querySelector('[data-role="btnZoomIn"]');
    const zoomLabel = toolbarEl.querySelector('[data-role="zoomLabel"]');
    const applyReaderZoom = () => {
        textEl.style.fontSize = (READER_ZOOM_BASE_REM * zoomPct / 100).toFixed(3) + 'rem';
        if (zoomLabel) zoomLabel.textContent = zoomPct + '%';
    };
    applyReaderZoom();
    zoomOutBtn?.addEventListener('click', () => {
        zoomPct = Math.max(READER_ZOOM_MIN, zoomPct - READER_ZOOM_STEP);
        applyReaderZoom();
        localStorage.setItem(READER_ZOOM_KEY, String(zoomPct));
    });
    zoomInBtn?.addEventListener('click', () => {
        zoomPct = Math.min(READER_ZOOM_MAX, zoomPct + READER_ZOOM_STEP);
        applyReaderZoom();
        localStorage.setItem(READER_ZOOM_KEY, String(zoomPct));
    });

    let savedRange = null;
    const saveSelection = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && textEl.contains(sel.anchorNode)) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }
    };
    const restoreSelection = () => {
        if (!savedRange) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
    };
    textEl.addEventListener('mouseup', saveSelection);
    textEl.addEventListener('keyup', saveSelection);

    toolbarEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) { e.preventDefault(); return; }
        if (e.target.closest('select')) saveSelection();
    });

    toolbarEl.querySelectorAll('button[data-cmd]').forEach(btn => {
        btn.addEventListener('click', () => {
            textEl.focus();
            restoreSelection();
            document.execCommand(btn.dataset.cmd, false, btn.dataset.value || null);
            saveSelection();
        });
    });

    const sizeSelect = toolbarEl.querySelector('select[data-cmd="fontSize"]');
    sizeSelect?.addEventListener('change', () => {
        textEl.focus();
        restoreSelection();
        document.execCommand('fontSize', false, sizeSelect.value);
        saveSelection();
        // El selector siempre vuelve a "Normal": no representa el tamaño del
        // texto donde está el cursor ahora, solo el que se aplicará la
        // próxima vez que se use — mostrar el valor recién aplicado daría la
        // falsa impresión de ser un estado permanente del selector.
        sizeSelect.value = '3';
    });
}

// Pegar (Ctrl+V) contenido copiado de otra página SOBRESCRIBE el
// comportamiento nativo del navegador: por default, pegar sobre un
// contenteditable trae el HTML tal cual lo armó la página de origen
// (estilos inline, clases, spans de Google Docs/Word, etc.), lo que podría
// romper tanto la apariencia del lector como el sistema de resaltado (que
// asume el HTML "limpio" que produce sanitizeImportedHtml). Se intercepta el
// evento y se inserta, en su lugar, el HTML del portapapeles ya sanitizado
// (si el origen ofreció texto con formato) o el texto plano si no.
function wireRichPaste(textEl) {
    if (!textEl) return;
    textEl.addEventListener('paste', (e) => {
        const cd = e.clipboardData;
        if (!cd) return; // sin clipboardData (muy raro hoy en día): se deja el default nativo
        const html = cd.getData('text/html');
        const plain = cd.getData('text/plain');
        if (!html && !plain) return;
        e.preventDefault();
        if (html && html.trim()) {
            document.execCommand('insertHTML', false, sanitizeImportedHtml(html));
            return;
        }
        // Sin HTML (portapapeles solo con texto plano): si trae más de un
        // párrafo (una línea en blanco entre ellos) se inserta como
        // párrafos reales, igual que el texto que llega de un PDF o un
        // enlace — así cada uno se puede reacomodar solo al ancho del
        // panel. Si es una sola "idea" cortada en varias líneas (texto
        // copiado de algo con ancho fijo de columna, sin líneas en blanco),
        // se unen con espacios y se inserta como texto corrido normal, sin
        // forzar ningún corte de línea en medio del párrafo donde se pegó.
        const normalized = plain.replace(/\r\n?/g, '\n');
        if (/\n[ \t]*\n/.test(normalized)) {
            document.execCommand('insertHTML', false, textToParagraphHtml(normalized));
        } else {
            document.execCommand('insertText', false, normalized.replace(/\n+/g, ' '));
        }
    });
}

// Si lo que se pasó es un enlace web, le pide al backend que extraiga el
// artículo de esa página y devuelve el TEXTO PLANO en su lugar (mismo
// mecanismo para el Modo Lector y para el campo pequeño de arriba, así ambos
// pueden recibir un enlace indistintamente); el texto plano es lo que se usa
// para generar el esquema. Cuando el backend también pudo traer el HTML del
// artículo (article.content de Readability — ver read-webpage.js), se
// sanitiza (sanitizeImportedHtml) y se inserta en el editor en su lugar del
// texto plano, para conservar párrafos/encabezados/negrita aproximados al
// original; si no vino HTML, se inserta el texto plano como siempre. Devuelve
// null si falló (y ya mostró la alerta correspondiente).
// Generalizada para servir tanto al panel principal como a cualquier panel de
// lector adicional: en vez de escribir directo sobre el textarea/contexto del
// panel principal (lo que mezclaría resultados si se llamaba desde un clon),
// recibe a qué elemento de texto escribir el resultado (targetTextEl) y un
// callback para el título detectado (onTitle), cada panel pasa los suyos.
async function resolveTextOrWebLink(raw, { targetTextEl = null, onTitle = null } = {}) {
    if (!looksLikeWebLink(raw)) return raw;

    showLoader(tr("js.leyendo_la_pagina"));
    try {
        const resp = await fetch('/.netlify/functions/read-webpage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: raw })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || tr("js.no_se_pudo_leer_esa"));
        let textForSchema = data.text;
        if (targetTextEl) {
            if (data.contentHtml && data.contentHtml.trim()) {
                targetTextEl.innerHTML = sanitizeImportedHtml(data.contentHtml);
            } else {
                // Sin HTML con formato del backend: se arma al menos en
                // párrafos reales (ver textToParagraphHtml) en vez de
                // insertar el texto con sus saltos de línea sueltos — así
                // también puede reacomodarse solo al ancho del panel.
                targetTextEl.innerHTML = textToParagraphHtml(data.text);
            }
            // El esquema y el resaltado posterior deben basarse en el MISMO
            // texto que de verdad quedó en el panel: el HTML insertado (con
            // o sin formato) no es carácter-por-carácter idéntico al texto
            // plano que mandó el backend (varían saltos de línea/espacios
            // alrededor de párrafos) — se recalcula leyendo el DOM recién
            // insertado con el mismo criterio que usará luego
            // highlightCoverageForPanel (buildEditableTextIndex), para que
            // las citas que devuelva la IA se puedan ubicar de verdad ahí.
            textForSchema = buildEditableTextIndex(targetTextEl).text;
        }
        if (data.title && onTitle) onTitle(data.title);
        track('webpage_read_success');
        return textForSchema;
    } catch (err) {
        track('webpage_read_error', { message: String(err?.message || '').slice(0, 160) });
        appAlert(err.message || tr("js.no_se_pudo_leer_esa"));
        return null;
    } finally {
        hideLoader();
    }
}

document.getElementById('btnParseReaderText')?.addEventListener('click', async () => {
    let textContent = readerTextMode.innerText.trim();
    if (!textContent || textContent.length < 3) return appAlert(tr("js.escribe_un_tema_pega_un"));

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

// ==========================================
// MODO MÓVIL — pantalla simplificada para celulares (ver el CSS y el HTML de
// #mobileShell en index.html). NO es una app distinta: reutiliza exactamente
// las mismas funciones de backend/generación que ya usa la de escritorio
// (generateFullSchemaFromTopic, resolveTextOrWebLink, handlePdfFileSelected,
// extractPdfRangeIntoReader) — la única diferencia es que en vez de mostrar
// el resultado en el lienzo (invisible en una pantalla chica), lo muestra con
// el Recorrido Guiado a pantalla completa (startTour con skipMapPhase:true).
// readerTextMode sigue existiendo en el DOM aunque esté oculto por CSS en
// escritorio-no-aplica-aquí; aquí se usa igual, como "buffer" de trabajo,
// exactamente como ya lo usa btnParseReaderText arriba.
const mobilePasteInput = document.getElementById('mobilePasteInput');
const mobilePdfInput = document.getElementById('mobilePdfInput');
const btnMobilePdf = document.getElementById('btnMobilePdf');
const mobilePdfLabel = document.getElementById('mobilePdfLabel');
const btnMobileGenerate = document.getElementById('btnMobileGenerate');

// Nombre del PDF ya cargado en espera de generarse (si el usuario elige PDF
// en vez de pegar texto). null mientras no haya ningún PDF elegido.
let mobilePdfPendingFile = null;

btnMobilePdf?.addEventListener('click', () => mobilePdfInput?.click());
mobilePdfInput?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    mobilePdfPendingFile = file;
    if (mobilePdfLabel) mobilePdfLabel.textContent = file.name;
    // Elegir un PDF y pegar texto son alternativas — si había texto pegado,
    // se descarta visualmente para que quede claro cuál de los dos se va a
    // usar al tocar "Crear mi esquema".
    if (mobilePasteInput) mobilePasteInput.value = '';
    e.target.value = '';
});

async function runMobileGeneration() {
    const pastedRaw = (mobilePasteInput?.value || '').trim();

    if (!pastedRaw && !mobilePdfPendingFile) {
        appAlert(tr("js.pega_un_texto_un_tema"));
        return;
    }

    let textContent = null;

    if (mobilePdfPendingFile) {
        // 1) Carga el PDF (misma función que usa el botón de escritorio) —
        //    esto deja el archivo listo en activePdfDoc.
        await handlePdfFileSelected(mobilePdfPendingFile);
        if (!activePdfDoc) return; // handlePdfFileSelected ya mostró el error si lo hubo

        // 2) En escritorio el usuario elige el rango de páginas a mano; en
        //    móvil, para no pedirle una decisión más, se toman directo las
        //    primeras páginas (hasta MAX_PDF_DEFAULT_PAGES) — igual que el
        //    valor que el propio selector de escritorio deja puesto por
        //    defecto.
        const totalPages = activePdfDoc.numPages;
        const toPage = Math.min(totalPages, MAX_PDF_DEFAULT_PAGES);
        await extractPdfRangeIntoReader(1, toPage);
        if (!readerTextMode.innerText.trim()) return; // ya se mostró el error si lo hubo

        textContent = readerTextMode.innerText.trim();
    } else {
        // Mismo camino que btnParseReaderText: si "pastedRaw" es un enlace,
        // resolveTextOrWebLink lo descarga y deja su texto listo; si no, lo
        // devuelve tal cual.
        textContent = await resolveTextOrWebLink(pastedRaw, {
            targetTextEl: readerTextMode,
            onTitle: (title) => {
                if (!globalDocumentContext) {
                    globalDocumentContext = title;
                    if (docContextInput) docContextInput.value = title;
                    updateDocContextChip();
                }
            }
        });
        if (textContent === null) return; // resolveTextOrWebLink ya mostró el error
    }

    currentDocumentText = textContent;
    mobilePdfPendingFile = null;
    if (mobilePdfLabel) mobilePdfLabel.textContent = tr("js.subir_un_pdf");

    await generateFullSchemaFromTopic(textContent, { originPanelId: 'main' });

    // Con el esquema ya armado, se muestra de inmediato en modo Recorrido —
    // en móvil no hay lienzo visible donde "verlo" de otra forma.
    const rootIds = getCanvasRootIds();
    if (rootIds.length) startTour(rootIds, { skipMapPhase: true });
}

btnMobileGenerate?.addEventListener('click', runMobileGeneration);

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
// El campo de tema de la cabecera queda por encima del asistente (z-30 vs
// z-20): si alguien lo usa directamente en vez de seguir el asistente, se
// respeta esa salida rápida igual que antes.
topicInput?.addEventListener('focus', dismissWelcomeScreen);
nodes.on('*', () => { if (nodes.length > 0 && !hasDismissedWelcomeScreen) dismissWelcomeScreen(); });

// Temas precargados para las sugerencias del paso 1 y para "probar al azar"
const hookTopics = [
    tr("js.la_paradoja_de_fermi"), tr("js.el_mito_de_la_caverna"), tr("js.computacion_cuantica"),
    tr("js.filosofia_estoica"), tr("js.neuroplasticidad"), tr("js.inteligencia_artificial_general"),
    tr("js.economia_conductual"), tr("js.la_teoria_de_cuerdas"), tr("js.imperio_romano")
];

// ==========================================
// ASISTENTE DE BIENVENIDA (5 preguntas, solo primera vez)
// ==========================================
// En vez de soltar al usuario frente a un lienzo vacío en su primerísima
// visita, le preguntamos 1) el campo que quiere explorar (teclado), 2) para
// qué lo estudia, 3) qué otras áreas le interesan (lista grande, hasta 3),
// 4) qué tanto sabe y 5) una duda que le intrigue (teclado, opcional). Con
// eso la IA escribe un TEXTO de estudio alineado con sus intereses (acción
// gratuita "onboarding_text"), el texto queda en el Modo Lector y de él sale
// el primer esquema (acción gratuita "welcome_schema", una vez por persona —
// ver billing.js). Al terminar se avisa que fue un EJEMPLO de uso y que el
// texto es de una IA. "Ya tengo un texto, un enlace o un PDF" salta las
// preguntas y usa lo que la persona traiga (flujo de siempre).
// Registro (ver track-event.js): se manda el paso en que está, el propósito,
// el nivel y las ÁREAS elegidas de la lista (categorías, no texto personal).
// Lo escrito con teclado NUNCA se manda, solo si lo hubo y su longitud.
const ONB_STEP_IDS = { 1: 'onbStep1', 2: 'onbStep2', 3: 'onbStep3', 4: 'onbStep4', 5: 'onbStep5', source: 'onbStepSource', gen: 'onbGenerating' };
const onbTopicInput = document.getElementById('onbTopicInput');
const onbNext1 = document.getElementById('onbNext1');
const onbNext2 = document.getElementById('onbNext2');
const onbNext4 = document.getElementById('onbNext4');
const onbQuestionInput = document.getElementById('onbQuestionInput');
const onbSourceInput = document.getElementById('onbSourceInput');
const onbPdfInput = document.getElementById('onbPdfInput');
const btnOnbPdf = document.getElementById('btnOnbPdf');
const onbPdfLabel = document.getElementById('onbPdfLabel');

const ONB_PURPOSE_LABELS = {
    exam: tr("js.preparar_un_examen_o_un"),
    research: tr("js.una_tesis_o_una_investigacion"),
    teach: tr("js.ensenarlo_a_otras_personas"),
    work: tr("js.su_trabajo_o_su_profesion"),
    curiosity: tr("js.curiosidad_personal")
};
const ONB_LEVEL_LABELS = {
    beginner: tr("js.principiante_esta_empezando"),
    intermediate: tr("js.intermedio_conoce_lo_basico"),
    advanced: tr("js.avanzado_tiene_bastante_base")
};
// Lista grande de áreas (categorías fijas: es lo que se guarda en el registro).
const ONB_AREAS = [
    tr("js.historia"), tr("js.filosofia"), tr("js.psicologia"), tr("js.sociologia"), tr("js.antropologia"), tr("js.ciencia_politica"),
    tr("js.economia"), tr("js.derecho"), tr("js.educacion"), tr("js.comunicacion"), tr("js.linguistica"), tr("js.literatura"),
    tr("js.arte"), tr("js.musica"), tr("js.arquitectura_y_diseno"), tr("js.teologia_y_religiones"), tr("js.etica"),
    tr("js.matematicas"), tr("js.estadistica"), tr("js.fisica"), tr("js.quimica"), tr("js.biologia"), tr("js.medicina_y_salud"),
    tr("js.neurociencia"), tr("js.ecologia_y_ambiente"), tr("js.geografia"), tr("js.astronomia"), tr("js.geologia"),
    tr("js.computacion"), tr("js.inteligencia_artificial"), tr("js.ingenieria"), tr("js.administracion_y_negocios"),
    tr("js.contabilidad_y_finanzas"), tr("js.mercadeo"), tr("js.trabajo_social"), tr("js.agricultura")
];

let onbPurpose = null;
let onbLevel = null;
const onbAreas = new Set();
let onbPdfPendingFile = null;
let onbCurrentStep = 1;

function setOnbStep(n) {
    onbCurrentStep = n;
    Object.entries(ONB_STEP_IDS).forEach(([key, id]) => {
        document.getElementById(id)?.classList.toggle('hidden', String(key) !== String(n));
    });
    const dots = document.getElementById('onbProgressDots');
    const numeric = typeof n === 'number';
    dots?.classList.toggle('hidden', !numeric);
    if (numeric) {
        document.querySelectorAll('#onbProgressDots [data-dot]').forEach((dot) => {
            const active = parseInt(dot.dataset.dot, 10) <= n;
            dot.classList.toggle('bg-slate-900', active);
            dot.classList.toggle('bg-slate-200', !active);
        });
    }
    track('onboarding_step', { step: String(n) });
}

// Paso 1: campo de estudio + sugerencias al azar
const onbChipsContainer = document.getElementById('onbSuggestionChips');
if (onbChipsContainer) {
    const shuffled = [...hookTopics].sort(() => 0.5 - Math.random());
    shuffled.slice(0, 3).forEach(topic => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = "bg-white border border-slate-200 text-slate-600 px-3.5 py-1.5 rounded-full text-xs font-bold hover:border-slate-400 hover:text-slate-900 transition-colors shadow-sm";
        chip.innerText = topic;
        chip.onclick = () => {
            if (onbTopicInput) { onbTopicInput.value = topic; onbTopicInput.dispatchEvent(new Event('input')); }
        };
        onbChipsContainer.appendChild(chip);
    });
}
onbTopicInput?.addEventListener('input', () => {
    if (onbNext1) onbNext1.disabled = !onbTopicInput.value.trim();
});
onbTopicInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && onbTopicInput.value.trim()) setOnbStep(2); });
onbNext1?.addEventListener('click', () => { if (onbTopicInput?.value.trim()) setOnbStep(2); });

// Escape rápido: probar con un tema al azar sin contestar nada
document.getElementById('onbSkipToRandom')?.addEventListener('click', () => {
    const randomTopic = hookTopics[Math.floor(Math.random() * hookTopics.length)];
    track('onboarding_skip_random');
    dismissWelcomeScreen();
    generateFullSchemaFromTopic(randomTopic, { originPanelId: 'main', welcome: true }).then(() => { if (typeof maybeStartCoachTour === 'function') maybeStartCoachTour('onboarding'); });
});
// Salida: ya traigo mi propio texto / enlace / PDF
document.getElementById('onbGoSource')?.addEventListener('click', () => { track('onboarding_go_source'); setOnbStep('source'); });
document.getElementById('onbBackSource')?.addEventListener('click', () => setOnbStep(1));

// Pasos 2 y 4: una sola opción
function wireSingleChoice(containerId, onPick) {
    document.querySelectorAll(`#${containerId} .onb-depth-option`).forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll(`#${containerId} .onb-depth-option`).forEach(b => b.classList.toggle('is-selected', b === btn));
            onPick(btn.dataset.value);
        });
    });
}
wireSingleChoice('onbPurposeOptions', (v) => { onbPurpose = v; if (onbNext2) onbNext2.disabled = false; });
wireSingleChoice('onbLevelOptions', (v) => { onbLevel = v; if (onbNext4) onbNext4.disabled = false; });
document.getElementById('onbBack2')?.addEventListener('click', () => setOnbStep(1));
onbNext2?.addEventListener('click', () => { if (onbPurpose) setOnbStep(3); });

// Paso 3: lista grande de áreas con buscador, hasta 3 (opcional)
const ONB_MAX_AREAS = 3;
const onbAreaChips = document.getElementById('onbAreaChips');
const onbAreaSearch = document.getElementById('onbAreaSearch');
const onbAreaCount = document.getElementById('onbAreaCount');
function renderOnbAreas() {
    if (!onbAreaChips) return;
    const q = (onbAreaSearch?.value || '').trim().toLowerCase();
    onbAreaChips.innerHTML = '';
    const full = onbAreas.size >= ONB_MAX_AREAS;
    ONB_AREAS.filter(a => !q || a.toLowerCase().includes(q)).forEach((area) => {
        const selected = onbAreas.has(area);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'onb-area-chip px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-slate-400 transition-colors'
            + (selected ? ' is-selected' : '') + (!selected && full ? ' is-disabled' : '');
        chip.textContent = area;
        chip.addEventListener('click', () => {
            if (onbAreas.has(area)) onbAreas.delete(area);
            else if (onbAreas.size < ONB_MAX_AREAS) onbAreas.add(area);
            renderOnbAreas();
        });
        onbAreaChips.appendChild(chip);
    });
    if (!onbAreaChips.children.length) onbAreaChips.innerHTML = '<p class="text-xs text-slate-400 py-2">' + tr('onb.no_area') + '</p>';
    if (onbAreaCount) onbAreaCount.textContent = `${onbAreas.size}/${ONB_MAX_AREAS}`;
}
renderOnbAreas();
onbAreaSearch?.addEventListener('input', renderOnbAreas);
document.getElementById('onbBack3')?.addEventListener('click', () => setOnbStep(2));
document.getElementById('onbNext3')?.addEventListener('click', () => setOnbStep(4));

document.getElementById('onbBack4')?.addEventListener('click', () => setOnbStep(3));
onbNext4?.addEventListener('click', () => { if (onbLevel) setOnbStep(5); });
document.getElementById('onbBack5')?.addEventListener('click', () => setOnbStep(4));

// Salida con fuente propia: PDF
btnOnbPdf?.addEventListener('click', () => onbPdfInput?.click());
onbPdfInput?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    onbPdfPendingFile = file;
    if (onbPdfLabel) onbPdfLabel.textContent = file.name;
    if (onbSourceInput) onbSourceInput.value = ''; // alternativas, no se combinan
    e.target.value = '';
});

// Aviso final: esto fue un ejemplo y el texto es de una IA
const onbExampleNote = document.getElementById('onbExampleNote');
function showOnbExampleNote() { onbExampleNote?.classList.remove('hidden'); }
document.getElementById('onbExampleNoteClose')?.addEventListener('click', () => onbExampleNote?.classList.add('hidden'));

// Camino con preguntas: texto generado por IA → Modo Lector → primer esquema gratis
async function runOnboardingGeneration() {
    const field = (onbTopicInput?.value || '').trim();
    if (!field) { setOnbStep(1); return; }
    const question = (onbQuestionInput?.value || '').trim();
    const areas = [...onbAreas];

    track('onboarding_completed', {
        purpose: onbPurpose, level: onbLevel, areas,
        fieldLength: field.length, hasQuestion: !!question, questionLength: question.length
    });
    setOnbStep('gen');

    let title = null, generatedText = null;
    try {
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({
                action: 'onboarding_text',
                topic: field,
                purpose: ONB_PURPOSE_LABELS[onbPurpose] || '',
                level: ONB_LEVEL_LABELS[onbLevel] || '',
                areas,
                question
            })
        });
        if (ok && data && typeof data.text === 'string' && data.text.trim().length > 200) {
            title = (data.title || '').trim() || field;
            generatedText = data.text.trim();
        } else {
            track('onboarding_text_error', { status: String(status) });
        }
    } catch (err) {
        track('onboarding_text_error', { status: 'network' });
    }

    let textForSchema = field; // respaldo: si el texto falla, se arma desde el tema como siempre
    if (generatedText) {
        readerTextMode.innerHTML = textToParagraphHtml(generatedText);
        updateReaderEmptyHint();
        // El esquema y el resaltado deben basarse en el MISMO texto que quedó en el panel
        textForSchema = buildEditableTextIndex(readerTextMode).text || generatedText;
        currentDocumentText = textForSchema;
        if (!globalDocumentContext) {
            globalDocumentContext = title;
            if (docContextInput) docContextInput.value = title;
            updateDocContextChip();
        }
    } else {
        currentDocumentText = field;
    }

    dismissWelcomeScreen();
    await generateFullSchemaFromTopic(textForSchema, { originPanelId: 'main', welcome: true });
    if (generatedText) openReaderPanel();
    showOnbExampleNote();
    if (typeof maybeStartCoachTour === 'function') maybeStartCoachTour('onboarding');
}
document.getElementById('btnOnbFinish')?.addEventListener('click', runOnboardingGeneration);

// Camino con fuente propia (texto / enlace / PDF): el flujo de siempre
async function runOnboardingFromSource() {
    const sourceRaw = (onbSourceInput?.value || '').trim();
    if (!sourceRaw && !onbPdfPendingFile) { appAlert(tr("js.pega_un_texto_o_un")); return; }
    let textContent = null;

    if (onbPdfPendingFile) {
        await handlePdfFileSelected(onbPdfPendingFile);
        if (!activePdfDoc) return;
        const toPage = Math.min(activePdfDoc.numPages, MAX_PDF_DEFAULT_PAGES);
        await extractPdfRangeIntoReader(1, toPage);
        if (!readerTextMode.innerText.trim()) return;
        textContent = readerTextMode.innerText.trim();
    } else {
        textContent = await resolveTextOrWebLink(sourceRaw, {
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
    }

    track('onboarding_source_used', { kind: onbPdfPendingFile ? 'pdf' : (looksLikeWebLink(sourceRaw) ? 'link' : 'text') });
    currentDocumentText = textContent;
    dismissWelcomeScreen();
    await generateFullSchemaFromTopic(textContent, { originPanelId: 'main', welcome: true });
    openReaderPanel();
    if (typeof maybeStartCoachTour === 'function') maybeStartCoachTour('onboarding');
}
document.getElementById('btnOnbFinishSource')?.addEventListener('click', runOnboardingFromSource);

// ==========================================
// LLEGADA DESDE /aprender/ ("Entiéndelo"): el texto ya viene escrito a la medida de la persona
// ==========================================
// La página /aprender/ hace un cuestionario, la IA escribe el texto (netlify/functions/ap-generate.js)
// y abre esta app con ?aprende=<código>. Aquí se recoge ese texto (ap-handoff.js) y se hace lo MISMO que si
// la persona hubiera pulsado "Generar Esquema" con él: el texto queda en el Modo Lector (con sus partes
// subrayadas) y de él sale el esquema. Si algo falla, la app queda como si hubiera entrado normal.
const APRENDE_SID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let cameFromAprende = false;
async function runAprendeHandoff() {
    let sid = '', fallbackTopic = '';
    try {
        const qp = new URLSearchParams(location.search);
        sid = qp.get('aprende') || '';
        if (qp.get('tour') === '1') window.__gkForceTour = true;   // para volver a ver el tour al probar
        qp.delete('tour');
        fallbackTopic = (qp.get('t') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (sid) { qp.delete('aprende'); qp.delete('ref'); qp.delete('t'); const rest = qp.toString(); history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash); }
    } catch (_e) { /* ok */ }
    if (!APRENDE_SID_RE.test(sid)) return;
    cameFromAprende = true;
    track('aprende_handoff', { sid, firstVisit: isFirstTimeUser });
    showLoader(tr('aprende.abriendo'));
    let title = '', text = '', topic = fallbackTopic;
    // Primero lo que Entiéndelo dejó en este mismo navegador (no depende del servidor)...
    try {
        const pend = JSON.parse(localStorage.getItem('gk_ap_pending') || 'null');
        if (pend && pend.sid === sid && typeof pend.text === 'string' && pend.text.length >= 200) { title = String(pend.title || '').trim(); text = pend.text.trim(); topic = title || topic; }
        localStorage.removeItem('gk_ap_pending');
    } catch (_e) { /* ok */ }
    // ...y si no está, se pide al servidor.
    if (text.length < 200) try {
        const res = await fetch('/.netlify/functions/ap-handoff?sid=' + encodeURIComponent(sid), { credentials: 'same-origin' });
        const d = res.ok ? await res.json() : null;
        if (d && d.ok) { title = String(d.title || '').trim(); text = String(d.text || '').trim(); topic = String(d.topic || topic || title).trim(); }
    } catch (_e) { /* se sigue con el tema de la URL, si lo hay */ }
    hideLoader();
    if (text.length < 200 && !topic) { track('aprende_handoff_empty', { sid }); return; }   // no hubo nada: queda la bienvenida de siempre
    dismissWelcomeScreen();
    let textForSchema = topic;
    if (text.length >= 200) {
        readerTextMode.innerHTML = textToParagraphHtml(text);
        updateReaderEmptyHint();
        textForSchema = buildEditableTextIndex(readerTextMode).text || text;
        currentDocumentText = textForSchema;
        if (!globalDocumentContext) { globalDocumentContext = title || topic; if (docContextInput) docContextInput.value = globalDocumentContext; updateDocContextChip(); }
    } else { currentDocumentText = topic; }
    track('aprende_schema_start', { sid, withText: text.length >= 200 });
    await generateFullSchemaFromTopic(textForSchema, { originPanelId: 'main', welcome: true });
    if (text.length >= 200) openReaderPanel();
    showOnbExampleNote();
    if (typeof maybeStartCoachTour === 'function') maybeStartCoachTour('aprende');
}
runAprendeHandoff();

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

// Borrado de uno o varios nodos (menú contextual y tecla Supr), con la misma
// pregunta de "¿eliminar también sus hijos?". Los paneles flotantes de cada
// nodo se cierran solos (ver closeOrphanFloatingPanels).
let deleteFlowBusy = false;
async function deleteNodesFlow(ids) {
    if (deleteFlowBusy) return;
    deleteFlowBusy = true;
    try {
        const base = (ids || []).filter(id => nodes.get(id));
        if (!base.length) return;
        const baseSet = new Set(base);
        const desc = new Set();
        base.forEach(id => getAllDescendants(id).forEach(d => { if (!baseSet.has(d)) desc.add(d); }));

        let toRemove = base;
        if (desc.size > 0) {
            const msg = base.length === 1
                ? tr("js.este_nodo_tiene_sub_nodo", { size: desc.size })
                : tr("js.estos_nodos_tienen_sub_nodo", { length: base.length, size: desc.size });
            const deleteAll = await appConfirm(msg, {
                title: base.length === 1 ? tr("js.eliminar_nodo_y_sus_hijos") : tr("js.eliminar_nodos_y_sus_hijos"),
                okText: tr("js.eliminar_todo"), cancelText: base.length === 1 ? tr("js.solo_este_nodo") : tr("js.solo_los_marcados")
            });
            if (deleteAll) toRemove = [...base, ...desc];
        }
        nodes.remove(toRemove);
    } finally {
        deleteFlowBusy = false;
    }
}

document.getElementById('btnMenuDelete')?.addEventListener('click', async () => {
    if (!selectedNodeId) return;
    const id = selectedNodeId;
    actionMenu.classList.add('hidden');
    await deleteNodesFlow([id]);
    selectedNodeId = null;
});

// Tecla Supr: cierra el panel flotante marcado, o elimina los nodos marcados.
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete') return;
    const ae = document.activeElement;
    const tag = ae ? ae.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (ae && ae.isContentEditable)) return;
    if (deleteFlowBusy) return;

    if (selectedFloatingPanelKey && openFloatingPanels.has(selectedFloatingPanelKey)) {
        e.preventDefault();
        closeFloatingPanel(selectedFloatingPanelKey);
        return;
    }
    const ids = network.getSelectedNodes ? network.getSelectedNodes() : [];
    if (!ids || !ids.length) return;
    e.preventDefault();
    actionMenu.classList.add('hidden');
    deleteNodesFlow(ids).then(() => { selectedNodeId = null; });
});

// ==========================================
// NUEVO: SONIDO, BÚSQUEDA RÁPIDA, REPLAY, MODO FOCO, MODO PRESENTACIÓN,
// MINIMAPA, ESTILO POR IMPORTANCIA Y AURA DE RAMA
// ==========================================

// --- Modo de acomodo del esquema (Árbol / Sistema solar) ---
const schemaLayoutSelectEl = document.getElementById('schemaLayoutMode');
if (schemaLayoutSelectEl) schemaLayoutSelectEl.value = schemaLayoutMode; // refleja el default / lo guardado
schemaLayoutSelectEl?.addEventListener('change', (e) => {
    schemaLayoutMode = e.target.value;
    try { localStorage.setItem('gk_layout_mode', schemaLayoutMode); } catch {}
    track('layout_mode_changed', { mode: schemaLayoutMode, nodes: nodes.length });
    relayoutExistingMap(schemaLayoutMode);
});

// Reacomoda el mapa que ya está en el lienzo al modo elegido (Árbol / Cerebro).
// Cada raíz (nodo sin padre, siguiendo solo las flechas de jerarquía) se queda
// donde está y su descendencia se recoloca a su alrededor; los vínculos
// 'relacionado' no cuentan como jerarquía. Los movimientos se animan y quedan
// en el historial de deshacer como una sola acción.
function relayoutExistingMap(mode) {
    if (!network || nodes.length < 2) return;
    const children = new Map(), hasParent = new Set();
    edges.get().forEach(e => {
        if (isRelatedEdgeLabel(e.label)) return;
        if (!children.has(e.from)) children.set(e.from, []);
        children.get(e.from).push(e.to);
        hasParent.add(e.to);
    });
    const cur = network.getPositions();
    const target = {};
    const done = new Set();
    const roots = nodes.getIds().filter(id => !hasParent.has(id) && (children.get(id) || []).length);
    const kids = (id) => (children.get(id) || []).filter(c => nodes.get(c));

    roots.forEach(rootId => {
        const rp = cur[rootId]; if (!rp) return;
        target[rootId] = { x: rp.x, y: rp.y };
        done.add(rootId);
        if (mode === 'solar') {
            const top = kids(rootId).filter(c => !done.has(c));
            const n = Math.max(1, top.length);
            const R = n <= 1 ? 220 : Math.max(220, (n * 230) / (2 * Math.PI));
            const place = (id, x, y, ang, spreadMax, depth) => {
                target[id] = { x, y }; done.add(id);
                const ch = kids(id).filter(c => !done.has(c));
                if (!ch.length) return;
                const spread = ch.length > 1 ? Math.min(spreadMax, (ch.length - 1) * 0.55) : 0;
                const rr = depth === 1 ? 180 : 160;
                ch.forEach((c, i) => {
                    const t = ch.length === 1 ? 0 : (i / (ch.length - 1)) - 0.5;
                    const a = ang + t * spread;
                    place(c, x + rr * Math.cos(a), y + rr * Math.sin(a), a, spread || spreadMax * 0.6, depth + 1);
                });
            };
            const maxSpread = n > 1 ? (2 * Math.PI / n) * 0.85 : Math.PI * 0.75;
            top.forEach((c, i) => {
                const a = n === 1 ? -Math.PI / 2 : (i * 2 * Math.PI / n) - Math.PI / 2;
                place(c, rp.x + R * Math.cos(a), rp.y + R * Math.sin(a), a, maxSpread, 1);
            });
        } else {
            // Árbol: cada subárbol ocupa el ancho de sus hojas, de arriba hacia abajo.
            const W = 200;
            const memo = new Map();
            const width = (id, seen = new Set()) => {
                if (memo.has(id)) return memo.get(id);
                seen.add(id);
                const ch = kids(id).filter(c => !seen.has(c));
                const w = ch.length ? Math.max(W, ch.reduce((a, c) => a + width(c, seen), 0)) : W;
                memo.set(id, w); return w;
            };
            const place = (id, cx, y) => {
                target[id] = { x: cx, y }; done.add(id);
                const ch = kids(id).filter(c => !done.has(c));
                if (!ch.length) return;
                const total = ch.reduce((a, c) => a + width(c), 0);
                let left = cx - total / 2;
                ch.forEach(c => { const w = width(c); place(c, left + w / 2, y + 140); left += w; });
            };
            const top = kids(rootId).filter(c => !done.has(c));
            const total = top.reduce((a, c) => a + width(c), 0);
            let left = rp.x - total / 2;
            top.forEach(c => { const w = width(c); place(c, left + w / 2, rp.y + 150); left += w; });
        }
    });

    const ids = Object.keys(target);
    if (!ids.length) return;
    network.setOptions({ physics: { enabled: false } });
    const from = {}; ids.forEach(id => { from[id] = cur[id]; });
    const t0 = performance.now(), DUR = 600;
    const ease = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const step = (now) => {
        const k = Math.min(1, (now - t0) / DUR), e = ease(k);
        ids.forEach(id => {
            const a = from[id], b = target[id]; if (!a || !nodes.get(id)) return;
            network.moveNode(id, a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e);
        });
        if (k < 1) requestAnimationFrame(step);
        else {
            // Guarda las posiciones finales en el dataset (persistencia + un paso de deshacer).
            nodes.update(ids.filter(id => nodes.get(id)).map(id => ({ id, x: target[id].x, y: target[id].y })));
            network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
        }
    };
    requestAnimationFrame(step);
}

// --- Sonido al crear nodos (togglable) ---
const btnSoundToggle = document.getElementById('btnSoundToggle');
const soundToggleIcon = document.getElementById('soundToggleIcon');
// Refleja en la cabecera el estado inicial (puede ser encendido por default).
if (soundToggleIcon) soundToggleIcon.textContent = soundEnabled ? '🔊' : '🔇';
if (btnSoundToggle) btnSoundToggle.title = tr("js.sonido_al_crear_nodos", { state: soundEnabled ? tr("js.encendido") : tr("js.apagado") });
btnSoundToggle?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    try { localStorage.setItem('gk_sound', soundEnabled ? 'on' : 'off'); } catch {}
    if (soundToggleIcon) soundToggleIcon.textContent = soundEnabled ? '🔊' : '🔇';
    if (btnSoundToggle) btnSoundToggle.title = tr("js.sonido_al_crear_nodos", { state: soundEnabled ? tr("js.encendido") : tr("js.apagado") });
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
        searchPaletteResults.innerHTML = `<div class="px-4 py-3 text-xs text-slate-500 font-sans">${tr('search.no_results')}</div>`;
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

// ==========================================
// RECORRIDO GUIADO: presentación de pantalla completa que va nodo por nodo,
// solo (como pidió el usuario), raíz → cada rama completa → la siguiente
// rama (no "por niveles"). Cada nodo pasa por 3 fases en ciclo:
//   1. MAPA: se ve el lienzo real completo (network.fit) con el nodo
//      siguiente resaltado con un pulso — para no perder la orientación de
//      "a dónde voy" antes de "entrar".
//   2. TÍTULO: tarjeta opaca de pantalla completa, solo el título, lo más
//      grande posible.
//   3. CONTENIDO: misma tarjeta, con la definición y la explicación sencilla
//      del nodo (reutiliza exactamente los mismos endpoints/caché que
//      "Ver definición"/"Explicación sencilla" — ver ensureNodeContent).
// Cada fase dura unos segundos calculados según cuánto hay que leer (ver
// tourReadingDurationMs), con pausa/avance/retroceso manual disponibles en
// todo momento (barra de abajo, o Espacio/flechas/Esc).
// ==========================================
let tourState = null; // { order, index, playing, cancelCurrentWait, mapDurationMs, lastHighlightedId, enabledPresentationMode }

// Construye el orden de visita a partir de uno o más nodos de partida:
// profundidad primero, rama completa antes de pasar a la siguiente — igual
// que leer un índice de arriba hacia abajo. Usa las mismas `edges` del
// lienzo (from = padre, to = hijo) que ya arma renderThreeLevelTree.
function buildTourOrder(startIds) {
    const allEdges = edges.get();
    const childrenOf = new Map();
    allEdges.forEach(e => {
        if (!childrenOf.has(e.from)) childrenOf.set(e.from, []);
        childrenOf.get(e.from).push(e.to);
    });
    const order = [];
    const seen = new Set();
    function dfs(id) {
        if (seen.has(id) || !nodes.get(id)) return;
        seen.add(id);
        order.push(id);
        (childrenOf.get(id) || []).forEach(dfs);
    }
    (startIds || []).forEach(dfs);
    return order;
}

// Para el recorrido de TODO el lienzo (botón de la cabecera): las raíces son
// los nodos sin ningún padre — cada esquema generado por separado es una
// raíz distinta, y un nodo suelto sin conexiones es su propia "rama" de un
// solo lugar. Se recorren en el orden en que se crearon.
function getCanvasRootIds() {
    const allIds = nodes.getIds();
    const hasParent = new Set(edges.get().map(e => e.to));
    return allIds.filter(id => !hasParent.has(id));
}

// Quita las marcas "[[término]]" de pistas interactivas (ver define() en
// gemini.js) que puedan venir de una definición ya cacheada de antes del
// recorrido — en la tarjeta de pantalla completa no hay nada que clickear,
// así que se muestran solo como texto plano.
function stripTourMarkup(text) {
    return String(text || '').replace(/\[\[(.*?)\]\]/g, '$1');
}

// Tiempo de lectura cómodo según cuánto texto hay, con un piso y un techo
// para que ni un nodo casi vacío pase en un parpadeo ni uno muy largo se
// quede pegado demasiado tiempo.
function tourReadingDurationMs(text, { min = 3500, max = 16000, perWordMs = 340 } = {}) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(min, Math.min(max, words * perWordMs));
}

// Trae (o reutiliza) la definición y la explicación sencilla de un nodo —
// mismos dos endpoints y la misma caché en el propio nodo (node.definition/
// node.simpleExplanation) que usan showDefinitionInFloatingPanel/
// showSimpleExplanationInFloatingPanel, así que si la persona ya las había
// abierto antes a mano, el recorrido no vuelve a gastar una llamada. Pide la
// definición SIN marcas interactivas (interactive:false) porque aquí no hay
// nada que clickear — ver stripTourMarkup para el caso en que ya estaba
// cacheada CON marcas de antes.
async function ensureNodeContent(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return null;
    const title = node.baseTitle || nodeId;
    const tasks = [];

    let definitionText = node.definition;
    const defSource = node.definitionSource || 'gemini';
    const defCacheUsable = !!definitionText;
    if (!defCacheUsable) {
        tasks.push((async () => {
            try {
                const { ok, data } = await apiFetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'define', topic: title, interactive: false,
                        contextPath: getContextPath(nodeId),
                        documentContext: globalDocumentContext || currentDocumentText
                    })
                });
                if (ok) {
                    applyServerBalance(data);
                    definitionText = data.definition;
                    nodes.update({ id: nodeId, baseTitle: title, definition: definitionText, definitionSource: data.source || 'gemini' });
                }
            } catch (err) { console.error('[recorrido] no se pudo traer la definición:', err.message); }
        })());
    }

    let simple = node.simpleExplanation;
    if (!simple) {
        tasks.push((async () => {
            try {
                const { ok, data } = await apiFetch('/.netlify/functions/gemini', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'simple_explanation', topic: title,
                        contextPath: getContextPath(nodeId),
                        documentContext: globalDocumentContext || currentDocumentText
                    })
                });
                if (ok) {
                    applyServerBalance(data);
                    simple = { definition: data.definition, analogy: data.analogy, example: data.example };
                    nodes.update({ id: nodeId, simpleExplanation: simple });
                }
            } catch (err) { console.error('[recorrido] no se pudo traer la explicación sencilla:', err.message); }
        })());
    }

    if (tasks.length) await Promise.all(tasks);
    return { title, definition: definitionText, defSource, simple };
}

// Espera cancelable y pausable: mientras tourState.playing sea false no
// descuenta tiempo (se queda "congelada" hasta reanudar), y si se pide saltar
// a otro nodo a mano (Siguiente/Anterior) se resuelve de inmediato con
// tourState.cancelCurrentWait, sin esperar el resto del tiempo.
function tourWait(ms) {
    return new Promise(resolve => {
        let remaining = ms;
        let lastTick = Date.now();
        (function tick() {
            if (!tourState) return; // se salió del recorrido mientras esperaba
            if (tourState.cancelCurrentWait) { tourState.cancelCurrentWait = false; resolve(); return; }
            const now = Date.now();
            if (tourState.playing) remaining -= (now - lastTick);
            lastTick = now;
            if (remaining <= 0) { resolve(); return; }
            tourState.waitTimeoutId = setTimeout(tick, 100);
        })();
    });
}

function tourUpdateProgress() {
    const el = document.getElementById('tourProgress');
    if (!el || !tourState) return;
    const total = tourState.order.length;
    el.textContent = `${Math.min(tourState.index + 1, total)} / ${total}`;
}

let tourHighlightTimer = null;
function highlightTourTargetNode(nodeId) {
    if (tourHighlightTimer) { clearInterval(tourHighlightTimer); tourHighlightTimer = null; }
    if (tourState?.lastHighlightedId && nodes.get(tourState.lastHighlightedId)) {
        nodes.update({ id: tourState.lastHighlightedId, borderWidth: 2, shadow: { enabled: false } });
    }
    if (!nodeId || !tourState) return;
    tourState.lastHighlightedId = nodeId;
    let tick = 0;
    tourHighlightTimer = setInterval(() => {
        if (!nodes.get(nodeId)) { clearInterval(tourHighlightTimer); return; }
        const on = tick % 2 === 0;
        nodes.update({
            id: nodeId, borderWidth: on ? 6 : 3,
            shadow: on ? { enabled: true, color: 'rgba(79, 209, 197, 0.65)', size: 22 } : { enabled: false }
        });
        tick++;
    }, 420);
}

function tourShowMapPhase(nodeId) {
    const node = nodes.get(nodeId);
    document.getElementById('tourCard')?.classList.add('hidden');
    document.getElementById('tourCard')?.classList.remove('flex');
    const captionTitle = document.getElementById('tourMapCaptionTitle');
    if (captionTitle) captionTitle.textContent = node?.baseTitle || nodeId;
    document.getElementById('tourMapCaption')?.classList.remove('hidden');

    network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
    setTimeout(() => highlightTourTargetNode(nodeId), 520);
}

function tourShowTitlePhase(node) {
    document.getElementById('tourMapCaption')?.classList.add('hidden');
    const card = document.getElementById('tourCard');
    const inner = document.getElementById('tourCardInner');
    card.classList.remove('hidden'); card.classList.add('flex');
    inner.innerHTML = `
        <h1 class="font-heading font-bold text-[#eef1fb] leading-[1.05] text-center" style="font-size: clamp(2.4rem, 7.5vw, 6.5rem);">
            ${escapeHtml(node.baseTitle || node.id)}
        </h1>
    `;
}

function tourShowContentPhase(node, content) {
    document.getElementById('tourMapCaption')?.classList.add('hidden');
    const card = document.getElementById('tourCard');
    const inner = document.getElementById('tourCardInner');
    card.classList.remove('hidden'); card.classList.add('flex');

    const title = node.baseTitle || node.id;
    const def = stripTourMarkup(content?.definition) || tr("js.no_se_pudo_obtener_una");
    const simple = content?.simple;

    inner.innerHTML = `
        <p class="text-[#4fd1c5] font-bold uppercase tracking-wider text-center" style="font-size: clamp(0.85rem, 1.6vw, 1.1rem);">${escapeHtml(title)}</p>
        <p class="text-[#eef1fb] leading-snug font-medium text-center" style="font-size: clamp(1.6rem, 3.6vw, 2.8rem);">${escapeHtml(def)}</p>
        ${simple ? `
        <div class="w-full bg-lime-500/10 border border-lime-500/25 rounded-2xl px-6 py-5 md:px-10 md:py-7 mt-2">
            <p class="text-lime-400 font-bold uppercase tracking-wider mb-2 text-center" style="font-size: clamp(0.8rem, 1.4vw, 1rem);">${tr('def.simple_words')}</p>
            <p class="text-slate-100 leading-snug text-center" style="font-size: clamp(1.3rem, 2.8vw, 2rem);">${escapeHtml(simple.definition || '')}</p>
            ${simple.analogy ? `<p class="text-slate-300 italic mt-3 text-center" style="font-size: clamp(1.05rem, 2.1vw, 1.5rem);">${tr('tour.like', { analogy: escapeHtml(simple.analogy) })}</p>` : ''}
        </div>` : ''}
    `;
}

function tourShowEndCard() {
    highlightTourTargetNode(null);
    document.getElementById('tourMapCaption')?.classList.add('hidden');
    const card = document.getElementById('tourCard');
    const inner = document.getElementById('tourCardInner');
    card.classList.remove('hidden'); card.classList.add('flex');
    inner.innerHTML = `
        <p style="font-size: clamp(2.5rem, 6vw, 4rem);">🏁</p>
        <h1 class="font-heading text-3xl md:text-5xl font-bold text-[#eef1fb] text-center">${tr('tour.end')}</h1>
        <p class="text-slate-400 text-center" style="font-size: clamp(1rem, 1.6vw, 1.25rem);">${tourState.order.length === 1 ? tr('tour.visited_one') : tr('tour.visited_many', { n: tourState.order.length })}</p>
    `;
    const playBtn = document.getElementById('tourBtnPlayPause');
    if (playBtn) playBtn.textContent = '↺';
    tourState.playing = false;
    tourState.index = tourState.order.length;
    tourUpdateProgress();
}

async function tourRunNode(index) {
    if (!tourState || index >= tourState.order.length) { tourShowEndCard(); return; }
    tourState.index = index;
    const nodeId = tourState.order[index];
    const node = nodes.get(nodeId);
    if (!node) { tourRunNode(index + 1); return; } // nodo borrado mientras tanto: se salta

    tourUpdateProgress();

    // Dispara el fetch de contenido ya mismo, en paralelo a la fase de mapa
    // y título, para que esté listo (o casi) cuando llegue la fase de
    // contenido en vez de mostrar una tarjeta en blanco mientras carga.
    const contentPromise = ensureNodeContent(nodeId);

    // skipMapPhase: el recorrido iniciado desde el Modo Móvil (ver esa
    // sección más abajo) nunca muestra el lienzo (#network-container está
    // oculto por CSS en pantallas chicas), así que la fase de "zoom hacia
    // el nodo" no tiene nada que mostrar — se salta directo al título.
    if (!tourState.skipMapPhase) {
        tourShowMapPhase(nodeId);
        await tourWait(tourState.mapDurationMs);
        if (!tourState || tourState.index !== index) return;
    }

    tourShowTitlePhase(node);
    await tourWait(tourReadingDurationMs(node.baseTitle || nodeId, { min: 1800, max: 4200, perWordMs: 420 }));
    if (!tourState || tourState.index !== index) return;

    const content = await contentPromise;
    if (!tourState || tourState.index !== index) return;
    tourShowContentPhase(node, content);
    const contentPreview = `${content?.definition || ''} ${content?.simple?.definition || ''} ${content?.simple?.analogy || ''}`;
    await tourWait(tourReadingDurationMs(contentPreview, { min: 5000, max: 20000, perWordMs: 330 }));
    if (!tourState || tourState.index !== index) return;

    tourRunNode(index + 1);
}

function tourNext() {
    if (!tourState) return;
    if (tourState.index >= tourState.order.length) return; // ya está en la tarjeta final
    tourState.cancelCurrentWait = true;
    tourRunNode(Math.min(tourState.index + 1, tourState.order.length));
}
function tourPrev() {
    if (!tourState) return;
    tourState.cancelCurrentWait = true;
    tourRunNode(Math.max(tourState.index - 1, 0));
}

function startTour(nodeIds, opts = {}) {
    const order = buildTourOrder(nodeIds);
    if (!order.length) { appAlert(tr("js.no_hay_nada_que_recorrer")); return; }

    tourState = {
        order, index: -1, playing: true, cancelCurrentWait: false,
        mapDurationMs: 2200, lastHighlightedId: null,
        enabledPresentationMode: !presentationModeActive,
        // skipMapPhase: el recorrido iniciado desde el Modo Móvil pasa esto
        // en true porque #network-container está oculto por CSS — no hay
        // lienzo que mostrar en la fase de "mapa" (ver tourRunNode).
        skipMapPhase: !!opts.skipMapPhase
    };

    document.getElementById('tourOverlay')?.classList.remove('hidden');
    const playBtn = document.getElementById('tourBtnPlayPause');
    if (playBtn) playBtn.textContent = '⏸';

    // Mismo modo visual que "Presentación" (oculta cabecera y paneles
    // flotantes) para que no compitan con el recorrido — solo se activa si
    // no estaba ya encendido, y solo el recorrido lo vuelve a apagar al salir.
    if (tourState.enabledPresentationMode) togglePresentationMode();

    track('tour_started', { nodeCount: order.length });
    tourRunNode(0);
}

function exitTour() {
    if (!tourState) return;
    tourState.cancelCurrentWait = true;
    const wasPresentationFromTour = tourState.enabledPresentationMode;
    highlightTourTargetNode(null);

    document.getElementById('tourOverlay')?.classList.add('hidden');
    document.getElementById('tourMapCaption')?.classList.add('hidden');
    const card = document.getElementById('tourCard');
    card?.classList.add('hidden'); card?.classList.remove('flex');

    tourState = null;
    if (wasPresentationFromTour) togglePresentationMode(true);
}

document.getElementById('btnStartTour')?.addEventListener('click', () => startTour(getCanvasRootIds()));
document.getElementById('btnMenuStartTour')?.addEventListener('click', () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    startTour([selectedNodeId]);
});

document.getElementById('tourBtnExit')?.addEventListener('click', exitTour);
document.getElementById('tourBtnNext')?.addEventListener('click', tourNext);
document.getElementById('tourBtnPrev')?.addEventListener('click', tourPrev);
document.getElementById('tourBtnPlayPause')?.addEventListener('click', () => {
    if (!tourState) return;
    const playBtn = document.getElementById('tourBtnPlayPause');
    if (tourState.index >= tourState.order.length) { // terminó: reinicia desde el principio
        tourState.index = -1; tourState.playing = true;
        if (playBtn) playBtn.textContent = '⏸';
        tourRunNode(0);
        return;
    }
    tourState.playing = !tourState.playing;
    if (playBtn) playBtn.textContent = tourState.playing ? '⏸' : '▶️';
});

document.addEventListener('keydown', (e) => {
    if (!tourState) return;
    if (e.key === 'Escape') { exitTour(); return; }
    if (e.key === ' ') { e.preventDefault(); document.getElementById('tourBtnPlayPause')?.click(); return; }
    if (e.key === 'ArrowRight') { tourNext(); return; }
    if (e.key === 'ArrowLeft') { tourPrev(); return; }
});

// ==========================================
// MODO QUIZ: autoevaluación nodo por nodo, independiente del Recorrido
// Guiado (no comparte tourState/startTour — ver comentario en el botón
// #btnStartQuiz en index.html). Reutiliza buildTourOrder/getCanvasRootIds/
// ensureNodeContent/stripTourMarkup porque esas son independientes de
// tourState: solo calculan el orden de nodos y traen/cachean su contenido,
// no tocan ni dependen del estado del recorrido.
// ==========================================
let quizState = null; // { order, index, correctCount, answeredCount, revealed }

function quizUpdateProgress() {
    const el = document.getElementById('quizProgress');
    if (!el || !quizState) return;
    el.textContent = `${Math.min(quizState.index + 1, quizState.order.length)} / ${quizState.order.length}`;
}

function quizShowQuestionPhase(node) {
    const inner = document.getElementById('quizCardInner');
    if (!inner) return;
    const title = node.baseTitle || node.id;
    inner.innerHTML = `
        <p class="text-[#4fd1c5] font-bold uppercase tracking-wider text-center" style="font-size: clamp(0.8rem, 1.4vw, 1rem);">${tr('quiz.question_of', { i: quizState.index + 1, n: quizState.order.length })}</p>
        <h1 class="font-heading font-bold text-[#eef1fb] leading-[1.15] text-center" style="font-size: clamp(1.8rem, 5vw, 3.6rem);">${tr('quiz.what_is', { title: escapeHtml(title) })}</h1>
        <p class="text-slate-400 text-center" style="font-size: clamp(0.95rem, 1.6vw, 1.15rem);">${tr('quiz.think')}</p>
        <button id="quizBtnReveal" class="mt-4 bg-[#4fd1c5] hover:bg-[#6fe0d6] text-[#0a0e1a] px-6 py-3.5 rounded-xl font-bold text-base shadow-[0_0_20px_rgba(79,209,197,0.25)] transition-all active:scale-95">${tr('quiz.show_answer')}</button>
    `;
    document.getElementById('quizBtnReveal')?.addEventListener('click', quizReveal);
}

function quizShowAnswerPhase(node, content) {
    const inner = document.getElementById('quizCardInner');
    if (!inner) return;
    const title = node.baseTitle || node.id;
    const def = stripTourMarkup(content?.definition) || tr("js.no_se_pudo_obtener_una");
    const simple = content?.simple;
    inner.innerHTML = `
        <p class="text-[#4fd1c5] font-bold uppercase tracking-wider text-center" style="font-size: clamp(0.8rem, 1.4vw, 1rem);">${escapeHtml(title)}</p>
        <p class="text-[#eef1fb] leading-snug font-medium text-center" style="font-size: clamp(1.3rem, 2.8vw, 2.2rem);">${escapeHtml(def)}</p>
        ${simple ? `
        <div class="w-full bg-lime-500/10 border border-lime-500/25 rounded-2xl px-6 py-5 mt-1">
            <p class="text-lime-400 font-bold uppercase tracking-wider mb-2 text-center" style="font-size: clamp(0.75rem, 1.2vw, 0.9rem);">${tr('def.simple_words')}</p>
            <p class="text-slate-100 leading-snug text-center" style="font-size: clamp(1.05rem, 2vw, 1.4rem);">${escapeHtml(simple.definition || '')}</p>
        </div>` : ''}
        <div class="flex flex-col sm:flex-row gap-2.5 mt-4 w-full max-w-md">
            <button id="quizBtnKnew" class="flex-1 bg-lime-500/15 border border-lime-500/40 hover:bg-lime-500/25 text-lime-300 px-5 py-3 rounded-xl font-bold text-sm transition-colors active:scale-95">${tr('quiz.knew')}</button>
            <button id="quizBtnDidntKnow" class="flex-1 bg-rose-500/15 border border-rose-500/40 hover:bg-rose-500/25 text-rose-300 px-5 py-3 rounded-xl font-bold text-sm transition-colors active:scale-95">${tr('quiz.didnt_know')}</button>
        </div>
    `;
    document.getElementById('quizBtnKnew')?.addEventListener('click', () => quizAnswer(true));
    document.getElementById('quizBtnDidntKnow')?.addEventListener('click', () => quizAnswer(false));
}

function quizShowEndCard() {
    const inner = document.getElementById('quizCardInner');
    if (!inner || !quizState) return;
    const { correctCount, answeredCount } = quizState;
    const pct = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;
    inner.innerHTML = `
        <p style="font-size: clamp(2.5rem, 6vw, 4rem);">${pct >= 70 ? '🎉' : '📚'}</p>
        <h1 class="font-heading text-3xl md:text-5xl font-bold text-[#eef1fb] text-center">${tr('quiz.done')}</h1>
        <p class="text-slate-300 text-center" style="font-size: clamp(1.1rem, 2vw, 1.4rem);">${tr('quiz.score', { ok: correctCount, total: answeredCount, pct })}</p>
        <button id="quizBtnRetry" class="mt-4 bg-[#4fd1c5] hover:bg-[#6fe0d6] text-[#0a0e1a] px-6 py-3.5 rounded-xl font-bold text-base shadow-[0_0_20px_rgba(79,209,197,0.25)] transition-all active:scale-95">${tr('quiz.retry')}</button>
    `;
    document.getElementById('quizBtnRetry')?.addEventListener('click', () => startQuiz(quizState.order, { isRetry: true }));
    quizState.index = quizState.order.length;
    quizUpdateProgress();
    track('quiz_finished', { correctCount, answeredCount, pct });
}

function quizRunNode(index) {
    if (!quizState || index >= quizState.order.length) { quizShowEndCard(); return; }
    quizState.index = index;
    quizState.revealed = false;
    const nodeId = quizState.order[index];
    const node = nodes.get(nodeId);
    if (!node) { quizRunNode(index + 1); return; } // nodo borrado mientras tanto: se salta

    quizUpdateProgress();
    quizState.contentPromise = ensureNodeContent(nodeId); // se pide ya mismo, en paralelo a que piense la respuesta
    quizShowQuestionPhase(node);
}

async function quizReveal() {
    if (!quizState || quizState.revealed) return;
    quizState.revealed = true;
    const nodeId = quizState.order[quizState.index];
    const node = nodes.get(nodeId);
    if (!node) return;
    const content = await quizState.contentPromise;
    if (!quizState || quizState.order[quizState.index] !== nodeId) return; // se salió/avanzó mientras cargaba
    quizShowAnswerPhase(node, content);
}

function quizAnswer(knewIt) {
    if (!quizState) return;
    quizState.answeredCount++;
    if (knewIt) quizState.correctCount++;
    quizRunNode(quizState.index + 1);
}

function startQuiz(nodeIds, opts = {}) {
    const order = opts.isRetry ? nodeIds : buildTourOrder(nodeIds);
    if (!order.length) { appAlert(tr("js.no_hay_nada_para_el")); return; }

    quizState = { order, index: -1, correctCount: 0, answeredCount: 0, revealed: false };
    document.getElementById('quizOverlay')?.classList.remove('hidden');
    document.getElementById('quizOverlay')?.classList.add('flex');
    track('quiz_started', { nodeCount: order.length });
    quizRunNode(0);
}

function exitQuiz() {
    if (!quizState) return;
    document.getElementById('quizOverlay')?.classList.add('hidden');
    document.getElementById('quizOverlay')?.classList.remove('flex');
    quizState = null;
}

document.getElementById('btnStartQuiz')?.addEventListener('click', () => startQuiz(getCanvasRootIds()));
document.getElementById('btnMenuStartQuiz')?.addEventListener('click', () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    startQuiz([selectedNodeId]);
});
document.getElementById('quizBtnExit')?.addEventListener('click', exitQuiz);
document.addEventListener('keydown', (e) => {
    if (!quizState) return;
    if (e.key === 'Escape') { exitQuiz(); return; }
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

// --- Estilo visual por jerarquía: peso por PROFUNDIDAD del nodo en el grafo
// (antes era por número de conexiones, y una rama con muchos hijos acababa
// pesando más que la raíz) ---
let importanceStylingTimer = null;
function scheduleImportanceStyling() {
    clearTimeout(importanceStylingTimer);
    importanceStylingTimer = setTimeout(applyImportanceStyling, 220);
}
// Profundidad REAL de cada nodo, calculada del grafo (no asignada al crearlo):
// así, si se agregan niveles después (Conceptos relacionados, ejemplos,
// huecos…), la jerarquía visual se reajusta sola. Los enlaces "relacionado"
// (cruces entre ramas) no cuentan, porque no son parentesco.
function computeNodeDepths() {
    const depth = new Map();
    const children = new Map();
    const hasParent = new Set();
    edges.get().forEach(e => {
        if (isRelatedEdgeLabel(e.label)) return;
        if (!children.has(e.from)) children.set(e.from, []);
        children.get(e.from).push(e.to);
        hasParent.add(e.to);
    });
    const queue = [];
    nodes.getIds().forEach(id => { if (!hasParent.has(id)) { depth.set(id, 0); queue.push(id); } });
    while (queue.length) {
        const id = queue.shift();
        (children.get(id) || []).forEach(c => {
            if (!depth.has(c)) { depth.set(c, depth.get(id) + 1); queue.push(c); }
        });
    }
    return depth; // nodos en ciclos sin raíz quedan sin entrada → se tratan como 0
}

// Peso visual por profundidad: el padre SIEMPRE pesa más que sus hijos. No se
// tocan los colores (el color enlaza cada nodo con su resaltado en el lector y
// puede haberlo elegido la persona): el peso va en tamaño de letra, borde,
// márgenes y halo.
const DEPTH_STYLE = [
    { font: 24, bold: 26, border: 5,   glow: 34, margin: { top: 24, bottom: 24, left: 30, right: 30 } }, // 0 raíz
    { font: 19, bold: 21, border: 3.5, glow: 22, margin: { top: 19, bottom: 19, left: 24, right: 24 } }, // 1
    { font: 16, bold: 18, border: 2,   glow: 14, margin: { top: 16, bottom: 16, left: 20, right: 20 } }, // 2
    { font: 14, bold: 15, border: 1.5, glow: 10, margin: { top: 13, bottom: 13, left: 17, right: 17 } }, // 3
    { font: 13, bold: 14, border: 1.2, glow: 7,  margin: { top: 11, bottom: 11, left: 15, right: 15 } }  // 4+
];
function applyImportanceStyling() {
    const all = nodes.get();
    if (!all.length) return;
    const depths = computeNodeDepths();
    const styleFor = (d) => DEPTH_STYLE[Math.min(d, DEPTH_STYLE.length - 1)];
    const nodeUpdates = all.map(n => {
        const st = styleFor(depths.get(n.id) ?? 0);
        return {
            id: n.id,
            borderWidth: st.border,
            margin: st.margin,
            font: { size: st.font, bold: { size: st.bold } },
            shadow: { enabled: true, color: 'rgba(79, 209, 197, 0.18)', size: st.glow, x: 0, y: 0 }
        };
    });
    nodes.update(nodeUpdates);

    // Grosor de enlace según el nivel del extremo más profundo (los cruces
    // "relacionado" conservan su estilo propio).
    const edgeUpdates = [];
    edges.get().forEach(e => {
        if (isRelatedEdgeLabel(e.label)) return;
        if (!depths.has(e.from) || !depths.has(e.to)) return;
        const deeper = Math.max(depths.get(e.from), depths.get(e.to));
        const width = deeper <= 1 ? 3.6 : deeper === 2 ? 2.4 : 1.6;
        edgeUpdates.push({ id: e.id, width });
    });
    if (edgeUpdates.length) edges.update(edgeUpdates);
}
// Contraste automático del texto del nodo según su relleno (2026-10-08): los nodos
// ahora son oscuros (letra clara por defecto), pero los guardados de antes o los
// recoloreados a mano pueden tener relleno claro → esos llevan letra oscura. Solo
// toca nodos sin color de letra propio y es idempotente (no se re-dispara solo).
function fillLuminance(hex) {
    if (typeof hex !== 'string' || hex[0] !== '#') return null;
    const h = hex.slice(1), v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16);
    if (Number.isNaN(v)) return null;
    return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
}
let fixingNodeFonts = false;
function fixNodeFontContrast() {
    if (fixingNodeFonts) return;
    const ups = [];
    nodes.get().forEach(n => {
        if (n.shape === 'image') return;
        const bg = n.color && (typeof n.color === 'string' ? n.color : n.color.background);
        const lum = fillLuminance(bg);
        if (lum === null || lum <= 0.6) return;          // relleno oscuro: letra clara (default global)
        if (n.font && n.font.color) return;              // ya tiene color de letra propio
        ups.push({ id: n.id, font: Object.assign({}, n.font || {}, { color: '#334155', bold: Object.assign({}, (n.font && n.font.bold) || {}, { color: '#0f172a' }) }) });
    });
    if (!ups.length) return;
    fixingNodeFonts = true;
    try { nodes.update(ups); } finally { fixingNodeFonts = false; }
}
let fontFixTimer = null;
const scheduleFontFix = () => { clearTimeout(fontFixTimer); fontFixTimer = setTimeout(fixNodeFontContrast, 30); };
nodes.on('add', scheduleFontFix);
nodes.on('update', scheduleFontFix);
fixNodeFontContrast();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { try { network.redraw(); } catch (_e) { /* ok */ } });
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
        tr("js.vas_a_limpiar_el_lienzo") +
        tr("js.deseas_que_lo_proximo_que"),
        { title: tr("js.limpiar_el_lienzo"), okText: tr("js.si_proyecto_nuevo"), cancelText: tr("js.no_seguir_en_este") }
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
    const hasText = !!(readerTextMode && readerTextMode.innerText.trim() !== "");
    const hasContext = !!globalDocumentContext;

    if (!hasText && !hasContext) return;

    if (await appConfirm(tr("js.deseas_limpiar_el_texto_y_2"))) {
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
        appAlert(tr("js.el_lienzo_esta_vacio"));
        return;
    }
    actionMenu.classList.add('hidden');
    showLoader(tr("js.preparando_captura"));
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
            appAlert(tr("js.error_al_exportar_la_imagen"));
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

// Tope al texto del Modo Lector que se guarda junto con el proyecto (ver
// saveCurrentProjectToBin/applyLoadedProject más abajo). Guardarlo NO es caro
// en sí — Supabase lo guarda como una columna jsonb normal, y hasta un
// documento largo (unas pocas decenas de miles de caracteres) no pesa casi
// nada comparado con, por ejemplo, un esquema de 40 nodos. Lo que sí podría
// salir caro es guardar un documento ENORME (un libro entero pegado, una
// transcripción larguísima de YouTube) que se vuelve a mandar completo en
// cada autoguardado — y el autoguardado se dispara por cualquier cambio en
// el esquema (agregar un nodo, moverlo...), no solo cuando el texto cambia.
// Este tope (~200,000 caracteres, de sobra para casi cualquier documento
// normal) evita ese caso extremo sin complicar el autoguardado con lógica de
// "¿cambió el texto o no?".
const MAX_SAVED_READER_TEXT_LENGTH = 200000;

function getActiveUserKey() {
    return currentUser ? currentUser.id : 'guest_local';
}

function showSaveFeedback(state) {
    const icon = document.getElementById('saveStatusIcon');
    const text = document.getElementById('saveStatusText');
    if (!icon || !text) return;

    if (state === 'saving') {
        icon.innerText = '⏳';
        text.innerText = tr("js.guardando");
    } else if (state === 'saved') {
        icon.innerText = '✅';
        text.innerText = tr("js.guardado");
        setTimeout(() => {
            icon.innerText = '📁';
            text.innerText = tr("js.mis_proyectos");
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
    const allEdges = plainEdges();

    const firstNode = allNodes[0];
    const projectTitle = firstNode.baseTitle || firstNode.label?.replace(/\*/g, '').split('\n')[0] || tr("js.mi_esquema");

    // Si aún no tiene ID de proyecto, generamos uno nuevo único
    if (!currentProjectId) {
        currentProjectId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        localStorage.setItem('gk_current_project_id', currentProjectId);
    }

    // Congelamos el ID de este proyecto específico para esta operación
    const targetProjectId = currentProjectId;

    // El texto del Modo Lector (y su "contexto" detectado) ahora SÍ se guarda
    // junto con el esquema — antes solo se guardaban nodos/flechas, así que
    // al reabrir un proyecto el lienzo volvía pero el texto original no (ver
    // applyLoadedProject). Con tope de tamaño — ver MAX_SAVED_READER_TEXT_LENGTH.
    const readerTextToSave = readerTextMode ? readerTextMode.innerText.slice(0, MAX_SAVED_READER_TEXT_LENGTH) : '';
    const projectData = {
        owner: currentUser ? (currentUser.user_metadata?.full_name || currentUser.email) : tr("js.invitado"),
        email: currentUser ? currentUser.email : 'local',
        nodes: allNodes,
        edges: allEdges,
        readerText: readerTextToSave,
        documentContext: globalDocumentContext || '',
        panelState: serializeFloatingPanels()
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
            console.error(tr("js.error_al_sincronizar_en_la"), err);
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
        if (totalTracked > 100) elRank.innerText = tr("js.polimata_maestro");
        else if (totalTracked > 40) elRank.innerText = tr("js.arquitecto_de_ideas");
        else if (totalTracked > 15) elRank.innerText = tr("js.analista_sintetico");
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
                            ${isCurrent ? '<span class="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase">' + tr('proj.current') + '</span>' : ''}
                        </h4>
                        <p class="text-[10px] text-slate-400">${tr('proj.last_saved')}: ${new Date(proj.date).toLocaleString()}</p>
                    </div>
                </div>
                <div class="flex items-center gap-1.5">
                    <button class="text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg font-bold transition-colors btn-load-proj" data-id="${proj.id}">
                        ${tr('proj.open')}
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
    showLoader(tr("js.cargando_tu_proyecto"));

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
        if (!response.ok) throw new Error(tr("js.no_se_pudo_cargar"));
        const resData = await response.json();
        if (resData.data) {
            applyLoadedProject(projectId, resData.data);
        }
    } catch (err) {
        appAlert(tr("js.error_al_abrir_el_proyecto"));
    } finally {
        hideLoader();
    }
}

function applyLoadedProject(projectId, record) {
    isClearingCanvas = true;
    schemeStack = [];
    updateSchemeBreadcrumb();
    closeAllFloatingPanels();
    nodes.clear();
    edges.clear();
    if (record.nodes) nodes.add(record.nodes);
    if (record.edges) edges.add(record.edges);
    // Paneles flotantes (definiciones, explicaciones, retos...) guardados con el proyecto.
    restoreFloatingPanels(record.panelState);
    // Restaura el texto del Modo Lector guardado junto con este proyecto (ver
    // saveCurrentProjectToBin). Proyectos guardados ANTES de este cambio no
    // tienen `readerText` — en ese caso se deja el lector como estaba (no se
    // borra un texto que el usuario pudiera tener ahí sin querer).
    if (typeof record.readerText === 'string' && readerTextMode) {
        // Se reconstruye en párrafos reales (ver textToParagraphHtml) en vez
        // de con innerText tal cual: el texto guardado (ver
        // saveCurrentProjectToBin, que lo toma leyendo .innerText) puede
        // traer saltos de línea sueltos entre párrafos, y con innerText esos
        // saltos se habrían vuelto cortes de línea FORZADOS que no se
        // acomodan al ancho del panel al reabrir el proyecto.
        readerTextMode.innerHTML = textToParagraphHtml(record.readerText);
        globalDocumentContext = record.documentContext || '';
        updateDocContextChip();
        if (readerEmptyHint) readerEmptyHint.classList.toggle('hidden', readerTextMode.innerText.trim() !== '');
    }
    currentProjectId = projectId;
    localStorage.setItem('gk_current_project_id', currentProjectId);
    isClearingCanvas = false;
    network.fit({ animation: { duration: 600 } });
}

document.getElementById('btnNewProject')?.addEventListener('click', async () => {
    if (nodes.length > 0) {
        if (!await appConfirm(tr("js.deseas_iniciar_un_esquema_completamente"))) return;
    }
    isClearingCanvas = true;
    schemeStack = [];
    updateSchemeBreadcrumb();
    clearTimeout(window._binSaveTimer);
    currentProjectId = null;
    localStorage.removeItem('gk_current_project_id');
    closeAllFloatingPanels();
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
            s.onerror = () => reject(new Error(tr("js.no_se_pudo_cargar_el")));
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
            if (!requireAuth(tr("js.comprar_nodos"))) {
                // requireAuth ya mostró el muro de login; cancelamos esta orden.
                throw new Error('auth_required');
            }
            const selected = document.querySelector('input[name="nodePackage"]:checked');
            const { ok, status, data } = await apiFetch('/.netlify/functions/paypal-create-order', {
                method: 'POST',
                body: JSON.stringify({ packageId: selected.value })
            });
            if (!ok) {
                if (status === 401) requireAuth(tr("js.comprar_nodos"));
                else appAlert(data?.error || tr("js.no_se_pudo_iniciar_la"));
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
                appAlert(result.data?.error || tr("js.no_se_pudo_confirmar_el"));
                return;
            }

            // El saldo que importa es el que confirma el servidor, no una suma local.
            if (typeof result.data.balance === 'number') { availableNodes = result.data.balance; updateCounterDisplay(); }
            appAlert(tr("js.exito_se_han_anadido_nodos", { nodesAdded: result.data.nodesAdded }));

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
                appAlert(tr("js.ocurrio_un_problema_con_paypal"));
            }
        }
    }).render('#paypal-button-container');
})();

// ==========================================
// DETECCIÓN DE HUECOS
// ==========================================
// Cada nodo puede traer node.gaps (ver gapsForNode en renderThreeLevelTree):
// conceptos que el propio Gemini señaló como mencionados-pero-no-
// desarrollados al armar el esquema. El botón del menú contextual
// (#btnMenuShowGaps) solo se muestra si el nodo tiene huecos (ver el click
// sobre nodos, sección "MOSTRAR MENÚ CONTEXTUAL"); al abrirlo, se listan
// aquí con un botón por hueco para expandirlo directo como sub-nodo nuevo
// (reutiliza generateFullSchemaFromTopic con attachToNodeId, igual que
// "Generar esquema completo a partir de aquí").
const btnMenuShowGaps = document.getElementById('btnMenuShowGaps');
const gapsBox = document.getElementById('gapsBox');

btnMenuShowGaps?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = gapsBox.classList.contains('hidden');
    if (isHidden && selectedNodeId) {
        const node = nodes.get(selectedNodeId);
        const gaps = (node?.gaps) || [];
        gapsBox.innerHTML = gaps.map((gap, idx) => `
            <div class="border border-[#2c3458] bg-[#161c35] rounded-lg px-2.5 py-2">
                <p class="text-[#eef1fb] font-bold text-xs mb-0.5">${escapeHtml(gap.term)}</p>
                <p class="text-[#9aa3c7] text-[11px] leading-snug mb-1.5">${escapeHtml(gap.note)}</p>
                <button data-gap-idx="${idx}" class="btnFillGap w-full bg-[#1d2442] hover:bg-[#262f55] border border-[#2c3458] text-[#9db4ff] text-[11px] font-semibold py-1.5 rounded-md transition-colors">${tr('gaps.generate')}</button>
            </div>
        `).join('') || `<p class="text-[#5b6388] text-xs px-1">${tr('gaps.none')}</p>`;

        gapsBox.querySelectorAll('.btnFillGap').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const gapIdx = parseInt(btn.dataset.gapIdx, 10);
                const gap = gaps[gapIdx];
                if (!gap) return;
                const parentNodeId = selectedNodeId;
                actionMenu.style.visibility = 'hidden';
                actionMenu.classList.add('hidden');
                gapsBox.classList.add('hidden'); gapsBox.classList.remove('flex');
                await generateFullSchemaFromTopic(gap.term, { attachToNodeId: parentNodeId });
            });
        });
    }
    gapsBox.classList.toggle('hidden');
    gapsBox.classList.toggle('flex');
});

// Ocultar la caja de huecos cuando se cierre o abra el menú en otro nodo
network.on('click', () => {
    if (gapsBox) { gapsBox.classList.add('hidden'); gapsBox.classList.remove('flex'); }
});

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

    if (!requireAuth(tr("js.realizar_peticiones_personalizadas"))) return;
    if (!checkBalance(1)) return;

    const currentNode = nodes.get(originNodeId);
    const topicName = currentNode.baseTitle || originNodeId;
    const contextPath = getContextPath(originNodeId);

    showLoader(tr("js.desarrollando_tu_peticion"));

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

        if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || tr("js.no_se_pudo_procesar_tu")); return; }
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
            label: tr("js.peticion", { customRequest }),
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
            label: tr("js.consulta"),
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
                    color: colorForChildOf(queryNodeId),
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
        appAlert(tr("js.intenta_de_nuevo_en_unos_2"));
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
    if (!requireAuth(tr("js.explorar_antitesis_y_pensamiento_critico"))) return;
    if (!checkBalance(2)) return;

    const originId = selectedNodeId;
    const topicName = nodes.get(originId).baseTitle || originId;

    showLoader(tr("js.buscando_contradicciones_y_limites_teoricos"));
    try {
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'antithesis', topic: topicName, contextPath: getContextPath(originId) })
        });
        if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || tr("js.no_se_pudo_generar_la_2")); return; }
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
    } catch { appAlert(tr("js.error_al_generar_antitesis")); } finally { hideLoader(); }
});


// Panel del reto socrático. Se separa en función para poder reconstruirlo al
// reabrir un proyecto (saved = { answer, feedbackHtml } del panel guardado).
function buildSocraticPanel(challengePanelId, originId, topicName, question, saved) {
    const panel = openFloatingPanel(challengePanelId, tr("js.reto_socratico", { topicName }), originId);
    panel.el.dataset.nodeId = challengePanelId;
    panel.meta = { kind: 'socratic', topicName, question };
    panel.contentEl.innerHTML = `
        <div class="bg-slate-800/90 border border-emerald-500/40 rounded-xl p-4 mb-4">
            <p class="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">${tr('soc.challenge')}</p>
            <p class="text-slate-100 text-sm font-medium leading-relaxed">${question}</p>
        </div>
        <textarea id="socraticInput" rows="4" placeholder="${tr('soc.placeholder')}" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 mb-3"></textarea>
        <button id="btnSubmitSocratic" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-lg">
            ${tr('soc.submit')}
        </button>
        <div id="socraticFeedbackBox" class="hidden mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 leading-relaxed"></div>
    `;
    if (saved) {
        const input = panel.contentEl.querySelector('#socraticInput');
        if (input && saved.answer) input.value = saved.answer;
        if (saved.feedbackHtml) {
            const fb = panel.contentEl.querySelector('#socraticFeedbackBox');
            fb.innerHTML = saved.feedbackHtml;
            fb.classList.remove('hidden');
        }
    }

    panel.contentEl.querySelector('#btnSubmitSocratic')?.addEventListener('click', async () => {
        const userAnswer = panel.contentEl.querySelector('#socraticInput').value.trim();
        if (userAnswer.length < 5) return appAlert(tr("js.escribe_una_respuesta_breve_para"));
        if (!checkBalance(1)) return;

        showLoader(tr("js.evaluando_tu_argumento"));
        try {
            const { ok: evalOk, status: evalStatus, data: evalData } = await apiFetch('/.netlify/functions/gemini', {
                method: 'POST',
                body: JSON.stringify({ action: 'socratic_evaluate', topic: topicName, question, userAnswer })
            });
            if (!evalOk) { if (!handleBillingError(evalStatus, evalData)) appAlert(evalData?.error || tr("js.no_se_pudo_evaluar_tu")); return; }

            const fbBox = panel.contentEl.querySelector('#socraticFeedbackBox');
            fbBox.innerHTML = `<p class="font-bold text-amber-400 mb-1">${tr('soc.verdict')}</p><p>${evalData.feedback}</p>`;
            fbBox.classList.remove('hidden');

            const parentPos = network.getPositions([originId])[originId];
            const masteryId = `mastery_${Date.now()}`;
            const masterySynthesis = tr("js.tu_sintesis_retroalimentacion", { userAnswer, feedback: evalData.feedback });
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
            edges.add({ from: originId, to: masteryId, label: tr("js.sintesis_propia"), color: { color: '#eab308' } });
            applyServerBalance(evalData); consumeNodes(1);
            showContentInFloatingPanel(masteryId, `🏆 ${evalData.masteryNodeTitle}`, masterySynthesis);
        } catch { appAlert(tr("js.error_al_evaluar")); } finally { hideLoader(); }
    });
    return panel;
}
document.getElementById('btnMenuChallenge')?.addEventListener('click', async () => {
    actionMenu.style.visibility = 'hidden';
    actionMenu.classList.add('hidden');
    if (!selectedNodeId) return;
    if (!requireAuth(tr("js.activar_el_reto_socratico"))) return;

    const originId = selectedNodeId;
    const topicName = nodes.get(originId).baseTitle || originId;

    showLoader(tr("js.formulando_desafio_socratico"));
    try {
        const { ok, status, data } = await apiFetch('/.netlify/functions/gemini', {
            method: 'POST',
            body: JSON.stringify({ action: 'socratic_question', topic: topicName, contextPath: getContextPath(originId) })
        });
        if (!ok) { if (!handleBillingError(status, data)) appAlert(data?.error || tr("js.no_se_pudo_iniciar_el")); return; }

        buildSocraticPanel(`socratic_${originId}_${Date.now()}`, originId, topicName, data.question, null);
    } catch { appAlert(tr("js.error_al_iniciar_el_reto")); } finally { hideLoader(); }
});

// ==========================================
// INFORME EN RTF
// ==========================================
// Un .rtf del esquema que haya en el lienzo en este momento (se vuelve a armar cada vez que se
// pide, así que siempre refleja los cambios). Cada nodo es un subtítulo; el tamaño baja con la
// profundidad (el nodo central es el más grande) y lleva el nivel de esquema de Word
// (\outlinelevel) para que aparezca en el panel de navegación. Debajo de cada subtítulo:
// definición, explicación sencilla, analogía y ejemplo práctico, tomados de la caché del propio
// nodo (node.definition / node.simpleExplanation) o, si faltan, pedidos con ensureNodeContent
// (los mismos endpoints que "Ver definición" y "Explicación sencilla").
// Los nodos "*Ejemplo:*" creados con ⚡ no son subtítulos: se listan como ejemplos de su padre.

function reportPlainText(t) {
  return String(t || '')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\*\*?/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function rtfEscape(text) {
  let out = '';
  for (const ch of String(text || '')) {
    if (ch === '\\') out += '\\\\';
    else if (ch === '{') out += '\\{';
    else if (ch === '}') out += '\\}';
    else if (ch === '\n') out += '\\line ';
    else if (ch === '\r') continue;
    else if (ch.codePointAt(0) < 128) out += ch;
    else {
      for (let i = 0; i < ch.length; i++) {          // unidades UTF-16, en 16 bits con signo
        let u = ch.charCodeAt(i); if (u > 32767) u -= 65536;
        out += `\\u${u}?`;
      }
    }
  }
  return out;
}

function isReportExampleNode(n) { return /^\*?(Ejemplo|Example):\*?/i.test(String(n?.label || '').trim()); }

// Árbol del informe: [{id,title,depth,examples:[texto]}] en orden de lectura (raíz → rama completa).
function collectReportNodes() {
  const childrenOf = new Map();
  edges.get().forEach(e => { if (!childrenOf.has(e.from)) childrenOf.set(e.from, []); childrenOf.get(e.from).push(e.to); });
  const list = [], seen = new Set();
  function walk(id, depth) {
    const n = nodes.get(id);
    if (!n || seen.has(id)) return;
    seen.add(id);
    const kids = (childrenOf.get(id) || []).filter(k => nodes.get(k));
    const examples = kids.map(k => nodes.get(k)).filter(isReportExampleNode).map(k => reportPlainText(k.baseTitle || k.label));
    list.push({ id, title: reportPlainText(n.baseTitle || n.label) || String(id), depth, examples });
    kids.filter(k => !isReportExampleNode(nodes.get(k))).forEach(k => walk(k, depth + 1));
  }
  getCanvasRootIds().forEach(id => walk(id, 0));
  return list;
}

// Tamaños (en medios puntos): el central es el más grande.
const REPORT_HEADING_SIZES = [44, 34, 28, 24];

function buildReportRtf(items, contentById) {
  const rtf = [];
  rtf.push('{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss\\fcharset0 Calibri;}{\\f1\\froman\\fcharset0 Cambria;}}');
  rtf.push('{\\colortbl;\\red27\\green42\\blue65;\\red15\\green118\\blue110;\\red100\\green116\\blue139;}');
  const mainTitle = items.length ? items[0].title : tr("js.esquema");
  rtf.push(`\\pard\\sa120\\f1\\cf3\\fs20 ${rtfEscape(tr('rpt.generated'))} \\u8226? ${rtfEscape(new Date().toLocaleDateString(I18N.lang))}\\par`);
  items.forEach(it => {
    const c = contentById.get(it.id) || {};
    const size = REPORT_HEADING_SIZES[Math.min(it.depth, REPORT_HEADING_SIZES.length - 1)];
    const level = Math.min(it.depth, 8);
    rtf.push(`\\pard\\keepn\\sb${it.depth === 0 ? 360 : 280}\\sa100\\outlinelevel${level}\\f1\\b\\cf1\\fs${size} ${rtfEscape(it.title)}\\b0\\par`);
    const label = (t) => `\\pard\\sb80\\sa40\\f0\\b\\cf2\\fs22 ${rtfEscape(t)}\\b0\\par`;
    const body = (t) => `\\pard\\sa100\\qj\\f0\\cf1\\fs22 ${rtfEscape(t)}\\par`;
    const def = reportPlainText(c.definition);
    const s = c.simple || {};
    if (def) { rtf.push(label(tr("js.definicion"))); rtf.push(body(def)); }
    if (s.definition) { rtf.push(label(tr("js.explicacion_sencilla"))); rtf.push(body(reportPlainText(s.definition))); }
    if (s.analogy) { rtf.push(label(tr("js.analogia"))); rtf.push(body(reportPlainText(s.analogy))); }
    if (s.example || it.examples.length) {
      rtf.push(label(tr("js.ejemplos_practicos")));
      if (s.example) rtf.push(`\\pard\\li360\\fi-240\\sa60\\f0\\cf1\\fs22 \\u8226? ${rtfEscape(reportPlainText(s.example))}\\par`);
      it.examples.forEach(e => rtf.push(`\\pard\\li360\\fi-240\\sa60\\f0\\cf1\\fs22 \\u8226? ${rtfEscape(e)}\\par`));
    }
    if (!def && !s.definition) rtf.push(`\\pard\\sa100\\f0\\i\\cf3\\fs20 ${rtfEscape(tr('rpt.no_definition'))}\\i0\\par`);
  });
  rtf.push('}');
  return { text: rtf.join('\n'), mainTitle };
}

let reportBusy = false;
async function exportReportRtf() {
  if (reportBusy) return;
  const items = collectReportNodes();
  if (!items.length) { appAlert(tr("js.todavia_no_hay_un_esquema")); return; }
  const missing = items.filter(it => { const n = nodes.get(it.id); return !n.definition || !n.simpleExplanation; });
  let generate = false;
  if (missing.length) {
    generate = await appConfirm(
      tr("js.de_nodos_todavia_no_tienen", { missing: missing.length, total: items.length }) +
      tr("js.si_las_generas_se_usan") +
      tr("js.si_no_el_informe_incluye"),
      { title: tr("js.armar_el_informe"), okText: tr("js.generar_lo_que_falta", { missing: missing.length }), cancelText: tr("js.solo_lo_que_ya_existe") });
  }
  reportBusy = true;
  const contentById = new Map();
  try {
    if (generate) {
      let done = 0;
      showLoader(tr("js.preparando_el_contenido_del_informe", { missing: missing.length }));
      const queue = missing.slice();
      const worker = async () => {
        while (queue.length) {
          const it = queue.shift();
          try { await ensureNodeContent(it.id); } catch (e) { console.error('[informe]', e.message); }
          done++; if (loaderText) loaderText.innerText = tr("js.preparando_el_contenido_del_informe_2", { done, missing: missing.length });
        }
      };
      // Dos a la vez: cada nodo hace 2 llamadas; más que eso arriesga topes de uso de la IA.
      await Promise.all([worker(), worker()]);
      clearInterval(loaderInterval); // el texto de progreso no debe rotar por los mensajes del cargador
    }
    items.forEach(it => {
      const n = nodes.get(it.id);
      contentById.set(it.id, { definition: n.definition, simple: n.simpleExplanation });
    });
    const { text, mainTitle } = buildReportRtf(items, contentById);
    const safeName = mainTitle.replace(/[\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || tr("js.esquema");
    const blob = new Blob([text], { type: 'application/rtf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `Informe - ${safeName}.rtf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { track('report_exported', { nodes: items.length, generated: generate ? missing.length : 0 }); } catch { /* no crítico */ }
  } finally {
    hideLoader(); reportBusy = false;
  }
}
document.getElementById('btnExportReport')?.addEventListener('click', exportReportRtf);
