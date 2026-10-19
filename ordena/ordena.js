/* =====================================================================================
   Ordena — encuentra las horas que se te escapan cada semana y recupéralas.
   Hermana de Rinde (/rinde/), pero para la vida personal: mismo motor, misma cuenta, mismo cobro.
   Todo el diagnóstico se calcula AQUÍ con fórmulas fijas (horas de referencia × respuestas);
   la IA (función ordena-plan) solo redacta planes, preguntas y mensajes. Así cada cifra se puede explicar.
   ===================================================================================== */
(function () {
'use strict';

// >>> EDITA AQUÍ: quién está detrás de la app (si "nombre" queda vacío, la sección no se muestra) <<<
const CFG = {
    fundador: { nombre: '', rol: '', texto: '', contacto: '' },
    garantia: 'Si en los primeros 7 días sientes que no te sirvió, te devolvemos tu dinero. Solo escríbenos.',
    contacto: 'WhatsApp +506 8777-2993 · bonillapretiz@gmail.com',   // correo o WhatsApp de soporte (se muestra en el pie, en precios y en «Mi cuenta»)
    whatsapp: '50687772993'
};

const SEMANA_DESPIERTO = 112;   // horas despiertas en una semana (16 h × 7): base del «% de tu tiempo»

// ---------- Perfil ----------
const SITUACIONES = [
    { id: 'empleo', t: 'Trabajo para otros', d: 'Empleo con horario o por metas' },
    { id: 'propio', t: 'Trabajo por mi cuenta', d: 'Negocio propio, independiente o freelance' },
    { id: 'estudio', t: 'Estudio', d: 'Colegio, universidad o cursos' },
    { id: 'mixto', t: 'Estudio y trabajo', d: 'Las dos cosas a la vez' },
    { id: 'hogar', t: 'Cuido la casa o a mi familia', d: 'Hijos, padres, la casa' },
    { id: 'busco', t: 'Estoy buscando trabajo', d: 'O cambiando de rumbo' }
];
const DEPENDEN = [{ id: 'd1', t: 'Solo yo', k: 0.85 }, { id: 'd2', t: 'Pareja o familiares', k: 1 }, { id: 'd3', t: 'Hijos pequeños', k: 1.25 }, { id: 'd4', t: 'Hijos y otras personas', k: 1.35 }];
const LUGARES = [{ id: 'fuera', t: 'Fuera de casa' }, { id: 'casa', t: 'Desde casa' }, { id: 'ambos', t: 'Un poco de cada' }];
const METAS = [
    { id: 'descanso', t: 'Descansar de verdad' }, { id: 'familia', t: 'Estar con mi familia' }, { id: 'estudiar', t: 'Estudiar o aprender algo' },
    { id: 'salud', t: 'Hacer ejercicio y cuidarme' }, { id: 'proyecto', t: 'Un proyecto propio' }, { id: 'ingresos', t: 'Ganar más dinero' }
];

// Pesos por situación. Orden: celular, mensajes, pendientes, semana, compromisos, casa, traslados, energia, tramites
const PESOS = {
    empleo: [1, 1.1, 1, 1, 1, 0.9, 1, 1, 1], propio: [1, 1.4, 1.2, 1.3, 1.1, 0.8, 0.8, 1.1, 1.2], estudio: [1.3, 1, 0.9, 1.2, 0.8, 0.5, 0.9, 1.1, 0.6],
    mixto: [1, 1.1, 1.2, 1.3, 1.1, 0.7, 1.1, 1.3, 0.9], hogar: [1, 0.8, 1.2, 1, 0.9, 1.5, 0.5, 1.1, 1.1], busco: [1.3, 0.8, 1, 1.4, 0.7, 0.9, 0.4, 1, 1]
};
const PRUDENCIA = 0.7;   // factor global conservador: preferimos quedarnos cortos a exagerar

const IC = {
    celular: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
    mensajes: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
    pendientes: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2"/><circle cx="5" cy="18" r="1"/>',
    semana: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7.5 14h3M13.5 14h3M7.5 17.5h3"/>',
    compromisos: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    casa: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    traslados: '<path d="M5 17h14l-1.5-6.5A2 2 0 0 0 15.6 9H8.4a2 2 0 0 0-1.9 1.5z"/><circle cx="8" cy="17.5" r="1.8"/><circle cx="16" cy="17.5" r="1.8"/>',
    energia: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    tramites: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'
};

// Frentes: base = horas por semana que suelen perderse ahí con respuestas «normales» [mín, máx]; p = índice en PESOS
const FRENTES = [
    { id: 'celular', fin: 'Tiempo de pantalla que no decidiste', t: 'Celular y redes', f: 'Ratos que se alargan sin que lo notes', base: [3, 6], p: 0,
      q: [['¿Cuánto usas el celular fuera del trabajo o el estudio?', [['Menos de 2 horas al día', 0.5], ['De 2 a 4 horas', 1], ['Más de 4 horas', 1.6], ['No lo sé', 1.3]]],
          ['¿Revisas el celular apenas despiertas o justo antes de dormir?', [['Casi nunca', 0.5], ['A veces', 1], ['Siempre', 1.5]]],
          ['¿Tienes encendidas las notificaciones de redes sociales?', [['Casi todas apagadas', 0.5], ['Algunas', 1], ['Todas', 1.4]]]] },
    { id: 'mensajes', fin: 'Interrupciones y cambio constante de tarea', t: 'Mensajes e interrupciones', f: 'Contestar todo al instante y no terminar nada', base: [1.5, 4], p: 1,
      q: [['¿Contestas los mensajes apenas llegan?', [['No, los reviso a ciertas horas', 0.5], ['Depende', 1], ['Sí, casi siempre', 1.4], ['Solo los de trabajo o familia', 0.7, 0.5]]],
          ['¿Cuántos grupos de WhatsApp activos tienes?', [['Menos de 5', 0.5], ['De 5 a 15', 1], ['Más de 15', 1.4]]],
          ['¿Logras concentrarte una hora seguida sin interrupciones?', [['Sí, a diario', 0.5], ['A veces', 1], ['Casi nunca', 1.5]]]] },
    { id: 'pendientes', fin: 'Olvidos, repeticiones y búsquedas', t: 'Pendientes y olvidos', f: 'Cosas que se olvidan, se hacen dos veces o se buscan', base: [1, 3], p: 2, dep: true,
      q: [['¿Dónde anotas tus pendientes?', [['En una sola lista o app', 0.5], ['En varios lados', 1], ['Los llevo en la cabeza', 1.5]]],
          ['¿Se te olvidan pagos, citas o encargos?', [['Casi nunca', 0.5], ['A veces', 1], ['Seguido', 1.6]]],
          ['¿Pierdes tiempo buscando cosas (llaves, papeles, archivos)?', [['Casi nunca', 0.5], ['A veces', 1], ['Todos los días', 1.4]]]] },
    { id: 'semana', fin: 'Planificación semanal y prioridades', t: 'Planificar tu semana', f: 'Improvisar cada día qué hacer', base: [1.5, 4], p: 3,
      q: [['¿Planificas tu semana?', [['Sí, cada semana', 0.5], ['A veces', 1], ['Nunca', 1.5], ['Solo lo más importante', 0.7, 0.5]]],
          ['Al empezar el día, ¿sabes cuáles son tus 3 cosas más importantes?', [['Sí', 0.5], ['A veces', 1], ['No', 1.4]]],
          ['¿Terminas el día sintiendo que no avanzaste en lo importante?', [['Casi nunca', 0.5], ['A veces', 1], ['Casi siempre', 1.5]]]] },
    { id: 'compromisos', fin: 'Límites y compromisos que no aportan', t: 'Compromisos y decir que sí', f: 'Aceptar más de lo que cabe en tu semana', base: [1, 3], p: 4, dep: true,
      q: [['¿Te cuesta decir que no?', [['No', 0.5], ['A veces', 1], ['Mucho', 1.5]]],
          ['¿Llegas tarde o con prisa a tus compromisos?', [['Casi nunca', 0.5], ['A veces', 1], ['Seguido', 1.4]]],
          ['¿Tienes reuniones o actividades que no te aportan?', [['Pocas', 0.5], ['Algunas', 1], ['Muchas', 1.4]]]] },
    { id: 'casa', fin: 'Compras, comidas y mandados', t: 'Casa y mandados', f: 'Salidas sueltas y decisiones de último minuto', base: [1, 3], p: 5, dep: true,
      q: [['¿Haces una lista antes de ir al súper?', [['Siempre', 0.5], ['A veces', 1], ['Nunca', 1.4], ['Otra persona hace las compras', 0, 4]]],
          ['¿Cuántas veces a la semana sales por un mandado suelto?', [['0 o 1', 0.5], ['2 o 3', 1], ['4 o más', 1.5]]],
          ['¿Decides qué comer el mismo día?', [['No, lo planeo', 0.5], ['A veces', 1], ['Casi siempre', 1.3], ['Otra persona se encarga', 0, 4]]]] },
    { id: 'traslados', fin: 'Tiempo de viaje y tráfico', t: 'Traslados', f: 'Horas de viaje mal planeadas o sin aprovechar', base: [1, 3], p: 6,
      q: [['¿Cuánto tardas en ir y volver de tu trabajo o estudio?', [['Menos de 30 minutos', 0.5], ['De 30 a 90 minutos', 1], ['Más de 90 minutos', 1.6], ['Casi no me traslado', 0, -1]]],
          ['¿Aprovechas el viaje (escuchar algo, planear, descansar)?', [['Sí', 0.5], ['A veces', 1], ['No', 1.3], ['Casi no me traslado', 0, 4]]],
          ['¿Sales en horas de mucho tráfico pudiendo evitarlas?', [['No', 0.5], ['A veces', 1], ['Casi siempre', 1.4], ['Mi horario no me deja elegir', 0.8, 1.5], ['Casi no me traslado', 0, 4]]]] },
    { id: 'energia', fin: 'Sueño, energía y foco', t: 'Sueño y energía', f: 'Cansancio que te hace rendir menos', base: [2, 5], p: 7,
      q: [['¿Cuántas horas duermes de lunes a viernes?', [['7 o más', 0.5], ['De 6 a 7', 1], ['Menos de 6', 1.6]]],
          ['¿Usas tu mejor hora del día para lo más importante?', [['Sí', 0.5], ['No lo he pensado', 1], ['La uso en otras cosas', 1.3], ['Mi horario no me deja elegir', 0.8, 1.5]]],
          ['¿Haces pausas o algo de movimiento durante el día?', [['Sí', 0.5], ['A veces', 1], ['Casi nunca', 1.4]]]] },
    { id: 'tramites', fin: 'Pagos, recargos y papeles pendientes', t: 'Pagos y trámites', f: 'Pagar tarde, hacer filas y trámites que se arrastran', base: [0.5, 1.5], p: 8,
      q: [['¿Tus pagos fijos están automatizados o con recordatorio?', [['Sí', 0.5], ['Algunos', 1], ['No', 1.4], ['No tengo pagos fijos', 0, 4]]],
          ['¿Has pagado recargos o multas este año por olvido?', [['No', 0.5], ['Una vez', 1], ['Varias', 1.5]]],
          ['¿Tienes trámites pendientes desde hace más de un mes?', [['No', 0.5], ['Uno', 1], ['Varios', 1.4]]]] }
];
const FR = Object.fromEntries(FRENTES.map(f => [f.id, f]));

// ---------- Estado ----------
const KEY = 'ordena.v1';
const nuevo = () => ({ v: 1, perfil: null, fr: {}, acciones: [], creado: Date.now(), actualizado: Date.now() });
let S = cargar();
let UI = { vista: S.perfil ? 'app' : 'inicio', tab: 'panel', paso: 1, borrador: null, mes: null };
let USER = null, ACCESO = { active: false, freeFrente: null }, CONF = null, guardarT = null, pendiente = null;

function cargar() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return Object.assign(nuevo(), s); } catch (_e) {} return nuevo(); }
function guardar(sync = true) {
    S.actualizado = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_e) {}
    if (sync && USER) { clearTimeout(guardarT); guardarT = setTimeout(subir, 1200); }
}
const fr = (id) => { const st = (S.fr[id] = S.fr[id] || { r: {}, oculto: false, plan: null, extra: {} }); st.libre = st.libre || {}; return st; };
// Opciones en el orden en que se muestran: el 3er dato de una opción es su posición en pantalla (si no hay, su índice).
// Las opciones nuevas se agregan AL FINAL de la lista (las respuestas guardadas son índices) y se ubican con ese dato.
const opsDe = (qq) => qq[1].map((o, k) => ({ o, k })).sort((a, b) => (a.o[2] != null ? a.o[2] : a.k) - (b.o[2] != null ? b.o[2] : b.k));
const respTexto = (f, st, i) => (st.r[i] === 'x' ? '«' + ((st.libre[i] || {}).texto || '') + '»' : (f.q[i][1][st.r[i]] || [''])[0]);

// ---------- Utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[id] || ''}</svg>`;
const uid = () => Math.random().toString(36).slice(2, 10);
const anonId = (() => { try { let a = localStorage.getItem('ordena.anon'); if (!a) { a = 'a' + uid() + uid(); localStorage.setItem('ordena.anon', a); } return a; } catch (_e) { return null; } })();
function track(ev, meta) {
    try { fetch('/.netlify/functions/track-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'ordena_' + ev, anonId, app: 'ordena', metadata: meta || {} }), keepalive: true }).catch(() => {}); } catch (_e) {}
}
// Horas: «45 min», «2,5 h», «12 h». Redondeo a medias horas (o a 5 minutos por debajo de una hora).
const num = (x) => String(x).replace('.', ',');
function hNum(n) { const a = Math.abs(n); if (a >= 10) return num(Math.round(n)); return num(Math.round(n * 2) / 2); }
function horas(n) { if (!(n > 0)) return '0 h'; if (Math.abs(n) < 1) return Math.max(0, Math.round(n * 60 / 5) * 5) + ' min'; return hNum(n) + ' h'; }
function rango(a, b) {
    if (b < 1) return `${horas(a)} – ${horas(b)}`;
    if (a < 1) return `${horas(a)} – ${horas(b)}`;
    const x = hNum(a), y = hNum(b);
    return x === y ? `${x} h` : `${x} – ${y} h`;
}
const rangoF = (a, b) => (b < 1 / 12 ? '0 h' : rango(a, b));   // «0 h» mientras no se haya encontrado nada
const pct = (n) => num(Math.round(n / SEMANA_DESPIERTO * 1000) / 10);
const rangoPct = (a, b) => `${pct(a)} – ${pct(b)} %`;
const anual = (a, b) => `${num(Math.round(a * 52))} – ${num(Math.round(b * 52))} horas (unas ${Math.round(a * 52 / 8)} a ${Math.round(b * 52 / 8)} jornadas de 8 horas)`;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 3200); }
const isoLocal = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const hoyISO = () => isoLocal(new Date());
const masDias = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return isoLocal(x); };
const fechaBonita = (iso) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (_e) { return iso; } };
const tOf = (lista, id) => (lista.find(x => x.id === id) || {}).t || '';

// ---------- Motor de cálculo ----------
function pesoDe(f, p = S.perfil) {
    let peso = (PESOS[p.situacion] || PESOS.empleo)[f.p];
    if (f.dep) peso *= (DEPENDEN.find(x => x.id === p.dependen) || DEPENDEN[1]).k;
    if (f.id === 'traslados') peso *= p.lugar === 'casa' ? 0.15 : p.lugar === 'ambos' ? 0.6 : 1;
    if (f.id === 'mensajes' && p.lugar === 'casa') peso *= 1.1;
    return peso;
}
const aplica = (f, p = S.perfil) => pesoDe(f, p) > 0.2;
// DESDE CERO HACIA ARRIBA: cada frente empieza en 0. Cada pregunta respondida «destapa» su parte:
// parte = (horas de referencia × prudencia × peso) ÷ nº de preguntas, multiplicada por la gravedad de la respuesta.
// Una buena costumbre (factor ≤ 0,5) no suma nada; la respuesta «normal» (factor 1) suma su parte; una mala, hasta ~2,2 veces.
const gravedad = (factor) => Math.max(0, Math.min(2.2, (factor - 0.5) / 0.5));
function calc(id) {
    const f = FR[id], st = fr(id), peso = pesoDe(f), nq = f.q.length, v = PRUDENCIA * peso;
    let min = 0, max = 0, n = 0, calculando = false;
    const partes = f.q.map((qq, i) => {
        const r = st.r[i];
        let factor = null;
        if (r === 'x') {   // respuesta escrita: la IA la ubica en la misma escala (ordena-interpretar)
            const L = st.libre[i] || {};
            n++;
            if (L.estado === 'ok' && Number.isFinite(L.factor)) factor = L.factor;
            else { if (L.estado === 'calc') calculando = true; return null; }
        } else {
            if (r == null || !qq[1][r]) return null;
            n++; factor = qq[1][r][1];
        }
        const g = gravedad(factor), a = v * f.base[0] / nq * g, b = v * f.base[1] / nq * g;
        min += a; max += b;
        return { min: a, max: b, g };
    });
    const potencial = v * (f.base[0] + f.base[1]) / 2;
    return { id, min, max, n, total: nq, partes, potencial, peso, calculando,
        conf: n === 0 ? 'Sin revisar' : n < nq ? 'En revisión' : 'Revisado', cc: n === 0 ? 'sin' : n < nq ? 'en' : 'rev' };
}
function todos() {
    if (!S.perfil) return [];
    return FRENTES.filter(f => aplica(f) && !fr(f.id).oculto).map(f => calc(f.id)).sort((a, b) => b.potencial - a.potencial);
}
function totales() {
    const l = todos();
    const enc = l.reduce((a, x) => ({ min: a.min + x.min, max: a.max + x.max }), { min: 0, max: 0 });
    const resp = l.reduce((a, x) => a + x.n, 0), posibles = l.reduce((a, x) => a + x.total, 0);
    let unaVez = 0, semanal = 0;
    S.acciones.forEach(a => { if (a.hecho && a.monto > 0) { if (a.tipo === 'semana') semanal += a.monto; else unaVez += a.monto; } });
    return { l, enc, resp, posibles, calculando: l.some(x => x.calculando), revisado: posibles ? Math.round(100 * resp / posibles) : 0, unaVez, semanal };
}
function siguientePregunta() {
    for (const x of todos()) { const st = fr(x.id); const i = FR[x.id].q.findIndex((_, k) => st.r[k] == null); if (i >= 0) return { id: x.id, i }; }
    return null;
}
const puedeVer = (id) => ACCESO.active || (USER && (ACCESO.freeFrente === id || !ACCESO.freeFrente));

// =====================================================================================
//  Pantallas
// =====================================================================================
function render() {
    const app = $('#app');
    if (UI.vista === 'inicio') app.innerHTML = vInicio();
    else if (UI.vista === 'onb') app.innerHTML = vOnb();
    else app.innerHTML = vApp();
}
function cabecera(enApp) {
    return `<header class="top">
      <a class="marca" href="#" data-a="${enApp ? 'tab' : 'nada'}" data-tab="panel">${logo()}<span>Ordena</span></a>
      <div class="top-d">
        ${enApp ? `<nav class="tabs-d">${tabsHTML()}</nav>` : ''}
        ${enApp && S.perfil ? `<div class="emp-wrap"><button class="emp-btn" data-a="emp-menu" aria-haspopup="menu" aria-expanded="${UI.menu ? 'true' : 'false'}">${icon('semana', 'mini')}<span class="emp-txt"><small>Mi semana</small><span>${esc(tOf(SITUACIONES, S.perfil.situacion))}</span></span><b aria-hidden="true">▾</b></button>${UI.menu ? `<div class="emp-menu" role="menu">
          <p class="emp-m-lbl">Tu diagnóstico</p><p class="emp-m-act">${esc(tOf(SITUACIONES, S.perfil.situacion))} · para ${esc(tOf(METAS, S.perfil.meta).toLowerCase())}</p><hr>
          <button role="menuitem" data-a="perfil">✎ Editar mis datos</button>
          <button role="menuitem" data-a="limpiar">↺ Empezar de nuevo</button>
          <button role="menuitem" data-a="tab" data-tab="informe">▤ Ver mi resumen</button></div>` : ''}</div>` : ''}
        ${USER ? `<button class="btn-q" data-a="cuenta">${ACCESO.active ? '<span class="pill ok">Plan activo</span>' : ''}<span class="mail">${esc(USER.email || 'Mi cuenta')}</span></button>`
               : `<button class="btn-q" data-a="login">Entrar</button>`}
      </div></header>`;
}
const logo = () => `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="currentColor"/><circle cx="32" cy="33" r="17" fill="none" stroke="var(--oro)" stroke-width="5"/><path d="M32 22v11l7 5" fill="none" stroke="var(--oro)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function tabsHTML() {
    const t = [['panel', 'Panel', '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>'], ['acciones', 'Acciones', '<path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>'], ['informe', 'Resumen', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>']];
    const pend = S.acciones.filter(a => !a.hecho).length;
    return t.map(([id, n, p]) => `<button class="tab ${UI.tab === id ? 'on' : ''}" data-a="tab" data-tab="${id}"><svg class="ic" viewBox="0 0 24 24">${p}</svg><span>${n}</span>${id === 'acciones' && pend ? `<b class="badge">${pend}</b>` : ''}</button>`).join('');
}

// ---------- Inicio (página de presentación) ----------
function vInicio() {
    const F = CFG.fundador;
    const ejemplo = [['celular', 'Celular y redes', '3 – 6 h', 72], ['semana', 'Planificar tu semana', '1,5 – 3,5 h', 42], ['mensajes', 'Mensajes e interrupciones', '1 – 2,5 h', 30]];
    return `${cabecera(false)}
    <main class="inicio">
      <section class="hero">
        <p class="eyebrow">Organización personal</p>
        <h1>Encuentra las horas que se te escapan cada semana.<br><em>Y recupéralas.</em></h1>
        <p class="lead">Empezamos en cero. Con cada pregunta de un toque, Ordena destapa cuántas horas se te van en el celular, los mensajes, los pendientes, los mandados y el cansancio, y qué cambiar primero.</p>
        <div class="cta-row"><button class="btn xl" data-a="empezar">Empezar · 1 minuto</button><span class="nota">Gratis. Sin registrarte para ver el resultado.</span></div>
      </section>
      <section class="demo" aria-label="Ejemplo de resultado">
        <div class="demo-top"><span>Ejemplo: estudia y trabaja, tras 9 respuestas</span><strong>5,5 – 12 h <small>por semana · 5 a 11 % de su tiempo despierto</small></strong></div>
        ${ejemplo.map(([id, t, r, w]) => `<div class="demo-row">${icon(id)}<span class="dt">${t}</span><span class="bar"><i style="width:${w}%"></i></span><span class="dr">${r}</span></div>`).join('')}
      </section>
      <section class="tres">
        <div><b>1</b><h3>Cuéntanos de tu semana</h3><p>Si trabajas o estudias, quién depende de ti y para qué quieres más tiempo. Tres toques.</p></div>
        <div><b>2</b><h3>Destapa tus fugas de tiempo</h3><p>Cada frente empieza en cero. Cada respuesta suma las horas que se te van ahí, y ves el total crecer.</p></div>
        <div><b>3</b><h3>Recupéralas paso a paso</h3><p>Un plan concreto para tu vida, mensajes listos para usar y un registro de las horas que ya recuperaste.</p></div>
      </section>
      <section class="porque">
        <h2>Por qué confiar en las cifras</h2>
        <ul>
          <li><b>Cada número se puede explicar.</b> Toca "¿De dónde sale?" y mira el cálculo. No es una adivinanza de la inteligencia artificial.</li>
          <li><b>Nada inflado.</b> Todo empieza en cero y solo sumamos horas cuando tus respuestas lo muestran, con rangos prudentes.</li>
          <li><b>Tus datos son tuyos.</b> No pedimos tu nombre, ni tus contactos, ni acceso a tu celular. Se guardan en tu dispositivo, y en tu cuenta privada si decides crear una. <a href="/privacidad/">Así cuidamos tus datos</a>.</li>
        </ul>
      </section>
      ${F.nombre ? `<section class="fundador"><h2>Quién está detrás</h2><p><b>${esc(F.nombre)}</b>${F.rol ? ' · ' + esc(F.rol) : ''}</p>${F.texto ? `<p>${esc(F.texto)}</p>` : ''}${F.contacto ? `<p class="nota">${esc(F.contacto)}</p>` : ''}</section>` : ''}
      <section class="faq">
        <h2>Preguntas frecuentes</h2>
        <details><summary>¿Cuánto cuesta?</summary><p>El diagnóstico es gratis, y también el plan completo de un frente. Para ver los planes de todos los frentes, con seguimiento, hay planes desde US$5 por un mes. Es un pago único: no se renueva solo.</p></details>
        <details><summary>¿Es otra app de tareas?</summary><p>No. Ordena no te pide que anotes todo tu día. Te ayuda a ver dónde se te va el tiempo, a decidir qué cambiar primero y a medir lo que recuperas.</p></details>
        <details><summary>¿Sirve si estudio, trabajo o cuido a mi familia?</summary><p>Sí. Ordena ajusta los frentes según tu situación, quién depende de ti y si trabajas desde casa. Lo que no aplica a tu vida, no aparece.</p></details>
        <details><summary>¿Y si el número no se parece a mi realidad?</summary><p>Cada cifra sale solo de tus respuestas: puedes cambiarlas cuando quieras, ver el cálculo exacto u ocultar un frente que no te aplica.</p></details>
      </section>
      <section class="cierre"><h2>¿Cuántas horas se te escapan cada semana?</h2><button class="btn xl" data-a="empezar">Averiguarlo ahora</button></section>
      <footer class="pie">Ordena · ${new Date().getFullYear()}${CFG.contacto ? ' · ' + esc(CFG.contacto) : ''} · <a href="/privacidad/">Privacidad y condiciones</a></footer>
    </main>`;
}

// ---------- Onboarding (3 pasos) ----------
function vOnb() {
    const b = UI.borrador;
    const prog = `<div class="prog"><i style="width:${UI.paso * 33.3}%"></i></div><p class="paso-n">Paso ${UI.paso} de 3</p>`;
    let cuerpo = '';
    if (UI.paso === 1) {
        cuerpo = `<h2>¿Cómo es tu semana?</h2>
        <div class="opciones grid2">${SITUACIONES.map(n => `<button class="opc ${b.situacion === n.id ? 'on' : ''}" data-a="onb-set" data-k="situacion" data-v="${n.id}"><b>${n.t}</b><span>${n.d}</span></button>`).join('')}</div>
        ${b.situacion ? `<label class="campo"><span>En una línea, ¿a qué te dedicas? <em>(opcional)</em></span><input id="detalle" maxlength="120" value="${esc(b.detalle || '')}" placeholder="Ej.: enfermera con turnos, estudio ingeniería de noche"></label>` : ''}`;
    } else if (UI.paso === 2) {
        cuerpo = `<h2>¿Quién depende de ti?</h2>
        <p class="sub">Personas que cuidas o atiendes en tu día a día.</p>
        <div class="opciones fila">${DEPENDEN.map(n => `<button class="opc chip ${b.dependen === n.id ? 'on' : ''}" data-a="onb-set" data-k="dependen" data-v="${n.id}">${n.t}</button>`).join('')}</div>
        <h3 class="h3s">¿Dónde trabajas o estudias?</h3>
        <div class="opciones fila">${LUGARES.map(n => `<button class="opc chip ${b.lugar === n.id ? 'on' : ''}" data-a="onb-set" data-k="lugar" data-v="${n.id}">${n.t}</button>`).join('')}</div>`;
    } else {
        cuerpo = `<h2>Si recuperas tiempo, ¿para qué lo quieres?</h2>
        <p class="sub">Tu plan va a apuntar a esto.</p>
        <div class="opciones grid2">${METAS.map(n => `<button class="opc linea ${b.meta === n.id ? 'on' : ''}" data-a="onb-set" data-k="meta" data-v="${n.id}">${n.t}</button>`).join('')}</div>`;
    }
    const listo = (UI.paso === 1 && b.situacion) || (UI.paso === 2 && b.dependen && b.lugar) || (UI.paso === 3 && b.meta);
    return `${cabecera(false)}<main class="onb">${prog}${cuerpo}
      <div class="onb-nav">${UI.paso > 1 ? '<button class="btn ghost" data-a="onb-atras">Atrás</button>' : (S.perfil ? '<button class="btn ghost" data-a="onb-cancelar">Cancelar</button>' : '<span></span>')}
      <button class="btn" data-a="onb-sig" ${listo ? '' : 'disabled'}>${UI.paso === 3 ? 'Ver mi diagnóstico' : 'Siguiente'}</button></div></main>`;
}

// ---------- App ----------
function vApp() {
    let c = '';
    if (UI.tab === 'panel') c = vPanel();
    else if (UI.tab === 'acciones') c = vAcciones();
    else c = vInforme();
    return `${cabecera(true)}<main class="app">${c}</main><nav class="tabs-m">${tabsHTML()}</nav>`;
}
function recuperadoTxt(T) {
    if (T.semanal && T.unaVez) return `${horas(T.semanal)} por semana`;
    if (T.semanal) return `${horas(T.semanal)} por semana`;
    return horas(T.unaVez);
}
function vPanel() {
    const T = totales(), sig = siguientePregunta(), max = Math.max(...T.l.map(x => x.max), 1);
    const sit = tOf(SITUACIONES, S.perfil.situacion), meta = tOf(METAS, S.perfil.meta);
    const ocultos = FRENTES.filter(f => aplica(f) && fr(f.id).oculto);
    return `
    <section class="resumen">
      <div class="r-enc"><p class="lbl">Horas que se te escapan</p><p class="big">${rangoF(T.enc.min, T.enc.max)}${T.calculando ? ' <span class="calc-pill">Calculando…</span>' : ''}</p><p class="per">cada semana · ${esc(sit)}</p>
        <p class="anual">${T.enc.max < 1 / 12 ? 'Responde las preguntas rápidas: cada una puede destapar horas que se te van.' : `Al año: ${anual(T.enc.min, T.enc.max)} · ${rangoPct(T.enc.min, T.enc.max)} de tu tiempo despierto`}</p></div>
      <div class="r-rec"><p class="lbl">Recuperado</p><p class="big verde">${recuperadoTxt(T)}</p><p class="per">${T.semanal && T.unaVez ? `y ${horas(T.unaVez)} una sola vez · ` : ''}${T.semanal || T.unaVez ? 'para: ' + esc(meta.toLowerCase()) : 'Marca acciones como hechas para verlo crecer'}</p></div>
      <div class="r-prec"><p class="lbl">Semana revisada</p><div class="meter"><i style="width:${T.revisado}%"></i></div><p class="per">${T.resp} de ${T.posibles} preguntas · ${T.revisado === 0 ? 'empieza por la pregunta rápida' : T.revisado < 100 ? 'el total puede seguir subiendo' : 'revisión completa'}</p></div>
    </section>
    ${sig ? `<section class="pdia"><div><p class="lbl">Pregunta rápida · ${esc(FR[sig.id].t)}</p><p class="pq">${esc(FR[sig.id].q[sig.i][0])}</p></div>
      <div class="opciones fila">${opsDe(FR[sig.id].q[sig.i]).map(({ o, k }) => `<button class="opc chip ${o[1] === 0 ? 'na' : ''}" data-a="resp" data-f="${sig.id}" data-i="${sig.i}" data-k="${k}">${esc(o[0])}</button>`).join('')}<button class="opc chip otra" data-a="libre" data-f="${sig.id}" data-i="${sig.i}">Otra respuesta…</button></div></section>` : ''}
    <section class="tarjetas">${T.l.map((x, idx) => tarjeta(x, idx, max)).join('')}</section>
    ${ocultos.length ? `<p class="ocultos">Ocultos: ${ocultos.map(f => `<button class="lnk" data-a="mostrar" data-f="${f.id}">${esc(f.t)}</button>`).join(' · ')}</p>` : ''}
    <p class="disc">Cada frente empieza en cero y suma solo lo que muestran tus respuestas, con horas de referencia prudentes. Sirve para decidir por dónde empezar; tu semana real puede variar. <button class="lnk" data-a="perfil">Editar mis datos</button> · <button class="lnk" data-a="limpiar">Empezar de nuevo</button></p>`;
}
function tarjeta(x, idx, max) {
    const f = FR[x.id], st = fr(x.id), libre = ACCESO.active || !ACCESO.freeFrente || ACCESO.freeFrente === x.id, tienePlan = !!st.plan;
    const accs = S.acciones.filter(a => a.frente === x.id), hechas = accs.filter(a => a.hecho).length;
    const cero = x.n === 0;
    return `<article class="card ${idx === 0 ? 'top1' : ''} ${cero ? 'cero' : ''}">
      <header><span class="ci">${icon(x.id)}</span><div><h3>${esc(f.t)}</h3><p class="fin">${esc(f.fin)}</p><p>${esc(f.f)}</p></div>
        <button class="mas" data-a="menu" data-f="${x.id}" aria-label="Opciones">⋯</button></header>
      <p class="monto">${rangoF(x.min, x.max)}<small> /semana</small>${x.calculando ? ' <span class="calc-pill">Calculando…</span>' : ''}</p>
      <div class="bar"><i style="left:${x.min / max * 100}%;width:${x.max < 1 / 12 ? 0 : Math.max(2, (x.max - x.min) / max * 100)}%"></i></div>
      <div class="meta"><span class="conf c-${x.cc}">${x.conf}</span>${x.n > 0 && x.n < x.total ? `<button class="lnk" data-a="afinar" data-f="${x.id}">Seguir revisando (${x.total - x.n})</button>` : ''}
        ${x.n > 0 ? `<button class="lnk sut" data-a="porque" data-f="${x.id}">¿De dónde sale?</button>` : ''}</div>
      ${accs.length ? `<p class="avance">${hechas} de ${accs.length} acciones hechas</p>` : ''}
      ${cero ? `<button class="btn ghost full" data-a="afinar" data-f="${x.id}">Revisar este frente · ${x.total} preguntas</button>`
        : `<button class="btn ${libre || tienePlan ? '' : 'lock'} full" data-a="plan" data-f="${x.id}">${tienePlan ? 'Ver mi plan' : libre ? (!ACCESO.active && !ACCESO.freeFrente ? 'Ver plan gratis' : 'Ver plan para recuperarlas') : '🔒 Ver plan para recuperarlas'}</button>`}
    </article>`;
}
function vAcciones() {
    const pend = S.acciones.filter(a => !a.hecho).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    const hechas = S.acciones.filter(a => a.hecho).sort((a, b) => (b.hechoEn || '').localeCompare(a.hechoEn || ''));
    const hoy = hoyISO(), semana = masDias(7);
    const grupos = [['Atrasadas', pend.filter(a => a.fecha < hoy)], ['Esta semana', pend.filter(a => a.fecha >= hoy && a.fecha <= semana)], ['Más adelante', pend.filter(a => a.fecha > semana)]];
    if (!S.acciones.length) return `<section class="vacio"><h2>Tus acciones</h2><p>Aquí aparecerán los pasos que elijas de cada plan, con su fecha. Abre un plan y toca "Agregar a mis acciones".</p><button class="btn" data-a="tab" data-tab="panel">Ir al panel</button></section>`;
    return `<section class="acc">
      <div class="acc-l"><h2>Tus acciones</h2>
        ${grupos.filter(g => g[1].length).map(([n, l]) => `<h3 class="gh ${n === 'Atrasadas' ? 'rojo' : ''}">${n}</h3>${l.map(filaAccion).join('')}`).join('')}
        ${hechas.length ? `<h3 class="gh">Hechas</h3>${hechas.map(filaAccion).join('')}` : ''}</div>
      <div class="acc-cal">${calendario()}</div>
    </section>`;
}
function filaAccion(a) {
    return `<div class="accion ${a.hecho ? 'hecha' : ''}">
      <button class="check" data-a="${a.hecho ? 'deshacer' : 'hecho'}" data-id="${a.id}" aria-label="${a.hecho ? 'Marcar como pendiente' : 'Marcar como hecha'}">${a.hecho ? '✓' : ''}</button>
      <div class="ab"><p class="at">${esc(a.titulo)}</p><p class="as">${icon(a.frente, 'mini')} ${esc(FR[a.frente] ? FR[a.frente].t : '')} · ${a.hecho ? (a.monto ? 'Recuperaste ' + horas(a.monto) + (a.tipo === 'semana' ? ' por semana' : '') : 'Hecha') : fechaBonita(a.fecha)}</p></div>
      ${a.hecho ? '' : `<div class="aa"><button class="lnk" data-a="ics" data-id="${a.id}" title="Agregar a tu calendario">📅</button><input type="date" value="${a.fecha}" data-a="fecha" data-id="${a.id}" aria-label="Fecha"></div>`}
      <button class="x" data-a="borrar-acc" data-id="${a.id}" aria-label="Quitar">×</button>
    </div>`;
}
function calendario() {
    const base = UI.mes ? new Date(UI.mes + '-01T12:00:00') : new Date();
    const y = base.getFullYear(), m = base.getMonth(), first = new Date(y, m, 1), dias = new Date(y, m + 1, 0).getDate();
    const off = (first.getDay() + 6) % 7, hoy = hoyISO(), key = `${y}-${String(m + 1).padStart(2, '0')}`;
    let cells = '';
    for (let i = 0; i < off; i++) cells += '<span></span>';
    for (let d = 1; d <= dias; d++) {
        const iso = `${key}-${String(d).padStart(2, '0')}`, n = S.acciones.filter(a => a.fecha === iso && !a.hecho).length;
        cells += `<span class="${iso === hoy ? 'hoy' : ''} ${n ? 'tiene' : ''}" title="${n ? n + ' acción(es)' : ''}">${d}${n ? `<i>${n}</i>` : ''}</span>`;
    }
    return `<div class="cal"><div class="cal-h"><button class="lnk" data-a="mes" data-d="-1">‹</button><b>${(t => t.charAt(0).toUpperCase() + t.slice(1))(first.toLocaleDateString('es', { month: 'long', year: 'numeric' }).replace(' De ', ' de '))}</b><button class="lnk" data-a="mes" data-d="1">›</button></div>
      <div class="cal-g">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<em>${d}</em>`).join('')}${cells}</div></div>`;
}
function vInforme() {
    const T = totales(), max = Math.max(...T.l.map(x => x.max), 1), p = S.perfil;
    return `<section class="informe">
      <div class="inf-h"><div><h2>Tu semana, en horas</h2><p class="sub">${esc(tOf(SITUACIONES, p.situacion))}${p.detalle ? ' · ' + esc(p.detalle) : ''} · depende de ti: ${esc(tOf(DEPENDEN, p.dependen).toLowerCase())} · para: ${esc(tOf(METAS, p.meta).toLowerCase())} · ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
        <button class="btn ghost no-print" data-a="imprimir">Descargar PDF</button></div>
      <div class="kpis"><div><p class="lbl">Se escapan por semana</p><p class="big">${rangoF(T.enc.min, T.enc.max)}</p></div><div><p class="lbl">Al año</p><p class="big">${T.enc.max < 1 / 12 ? '0 h' : `${num(Math.round(T.enc.min * 52))} – ${num(Math.round(T.enc.max * 52))} h`}</p></div><div><p class="lbl">De tu tiempo despierto</p><p class="big">${T.enc.max < 1 / 12 ? '0 %' : rangoPct(T.enc.min, T.enc.max)}</p></div><div><p class="lbl">Recuperado</p><p class="big verde">${recuperadoTxt(T)}</p></div></div>
      <p class="sub">Semana revisada: ${T.resp} de ${T.posibles} preguntas (${T.revisado}%). Los frentes sin revisar aparecen en cero.</p>
      <div class="tabla-w"><table class="tabla"><thead><tr><th>Frente</th><th>Horas por semana</th><th class="h-bar"></th><th class="h-prec">% de tu tiempo</th><th>Acciones</th></tr></thead><tbody>
      ${T.l.map(x => { const a = S.acciones.filter(z => z.frente === x.id); return `<tr><td>${icon(x.id, 'mini')} ${esc(FR[x.id].t)}<br><small class="fin">${esc(FR[x.id].fin)}</small></td><td class="num">${x.n ? rangoF(x.min, x.max) : '<span class="sut">Sin revisar</span>'}</td><td class="h-bar"><span class="bar"><i style="left:${x.min / max * 100}%;width:${x.max < 1 / 12 ? 0 : Math.max(2, (x.max - x.min) / max * 100)}%"></i></span></td><td class="h-prec">${x.max < 1 / 12 ? '—' : rangoPct(x.min, x.max)}</td><td>${a.filter(z => z.hecho).length}/${a.length}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${T.l.filter(x => fr(x.id).plan).map(x => { const pl = fr(x.id).plan; return `<div class="inf-plan"><h3>${icon(x.id, 'mini')} ${esc(FR[x.id].t)}</h3><p>${esc(pl.resumen)}</p><p><b>Primer paso:</b> ${esc(pl.victoria.titulo)}. ${esc(pl.victoria.detalle)}</p><p><b>Cómo medirlo:</b> ${esc(pl.medir)}</p></div>`; }).join('')}
      <p class="disc">Cada frente parte de cero y suma solo lo que muestran tus respuestas, sobre horas de referencia prudentes según tu situación. «% de tu tiempo» = horas por semana sobre unas ${SEMANA_DESPIERTO} horas despiertas a la semana. Es una guía para decidir por dónde empezar.</p>
    </section>`;
}

// =====================================================================================
//  Ventanas (modales)
// =====================================================================================
function abrir(html, cls = '', mantener = false) {
    const m = $('#modal');
    const antes = mantener && !m.hidden && $('.m-caja', m) ? $('.m-caja', m).scrollTop : 0;
    m.className = 'modal ' + cls; m.dataset.afinar = '';
    m.innerHTML = `<div class="m-fondo" data-a="cerrar"></div><div class="m-caja" role="dialog" aria-modal="true"><button class="m-x" data-a="cerrar" aria-label="Cerrar">×</button>${html}</div>`;
    m.hidden = false; document.body.classList.add('quieto');
    const c = $('.m-caja', m); if (c) c.scrollTop = antes;
}
function cerrar() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; m.dataset.afinar = ''; document.body.classList.remove('quieto'); }

function libreLinea(L) {
    L = L || {};
    const est = L.estado === 'calc' ? '<span class="calc-pill">Calculando…</span>' : L.estado === 'error' ? '<span class="error">No se pudo interpretar. Tócala para reintentar.</span>' : esc(L.nota || '');
    return `<p class="libre-txt">«${esc(L.texto || '')}» ${est}</p>`;
}
function mLibre(id, i, desdeAfinar) {
    const f = FR[id], st = fr(id), L = st.r[i] === 'x' ? (st.libre[i] || {}) : {};
    abrir(`<p class="lbl">${icon(id, 'mini')} ${esc(f.t)}</p><h2>${esc(f.q[i][0])}</h2>
      <p class="sub">Escríbelo con tus palabras, si ninguna opción describe tu caso. Lo interpretamos y lo sumamos con la misma regla que las opciones.</p>
      <label class="campo"><span>Tu respuesta</span><textarea id="libreTxt" rows="3" maxlength="500" placeholder="Ej.: entre semana casi no lo uso, pero el fin de semana se me van horas">${esc(L.texto || '')}</textarea></label>
      <div class="m-pie"><button class="btn ghost" data-a="${desdeAfinar ? 'afinar' : 'cerrar'}" data-f="${id}">Cancelar</button><button class="btn" data-a="libre-ok" data-f="${id}" data-i="${i}" ${desdeAfinar ? 'data-m="1"' : ''}>Calcular</button></div>`, 'chico');
    setTimeout(() => { const t = $('#libreTxt'); if (t) t.focus(); }, 60);
}
async function interpretar(id, i) {
    const f = FR[id], st = fr(id), L = st.libre[i];
    if (!L || !L.texto) return;
    const antes = calc(id);
    L.estado = 'calc'; guardar(false); render(); refrescarAfinar(id);
    let r;
    try {
        const res = await fetch('/.netlify/functions/ordena-interpretar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            frente: f.t + ' (' + f.fin + ')', pregunta: f.q[i][0], opciones: f.q[i][1].map(o => ({ t: o[0], f: o[1] })), texto: L.texto,
            situacion: tOf(SITUACIONES, S.perfil.situacion) + (S.perfil.detalle ? ' · ' + S.perfil.detalle : '') }) });
        r = await res.json().catch(() => ({}));
        if (!res.ok || !Number.isFinite(Number(r.factor))) throw new Error(r.error || 'Error');
    } catch (_e) { r = null; }
    if (st.r[i] !== 'x' || st.libre[i] !== L) return;
    if (!r) { L.estado = 'error'; guardar(); render(); refrescarAfinar(id); toast('No se pudo interpretar tu respuesta. Puedes reintentar.'); return; }
    Object.assign(L, { estado: 'ok', factor: Number(r.factor), nota: r.nota || '', parecida: r.parecida || '' });
    guardar(); track('respuesta_libre', { frente: id, i, factor: L.factor });
    const ahora = calc(id), dMin = ahora.min - antes.min, dMax = ahora.max - antes.max;
    render(); refrescarAfinar(id);
    toast(dMax >= 1 / 12 ? `+${rango(dMin, dMax)} por semana en ${f.t}` : `Bien: según tu respuesta, aquí no se te escapa tiempo`);
}
function refrescarAfinar(id) { const m = $('#modal'); if (!m.hidden && m.dataset.afinar === id) mAfinar(id, true); }
function mAfinar(id, mantener) {
    const f = FR[id], st = fr(id);
    abrir(`<p class="lbl">${icon(id, 'mini')} ${esc(f.t)}</p><h2>Revisar este frente</h2><p class="sub">${esc(f.fin)}. Cada respuesta puede destapar horas que se te van; si lo tienes bajo control, no suma nada.</p>
      ${f.q.map((qq, i) => `<div class="pregunta"><p>${esc(qq[0])}</p><div class="opciones fila">${opsDe(qq).map(({ o, k }) => `<button class="opc chip ${o[1] === 0 ? 'na' : ''} ${st.r[i] === k ? 'on' : ''}" data-a="resp" data-f="${id}" data-i="${i}" data-k="${k}" data-m="1">${esc(o[0])}</button>`).join('')}<button class="opc chip otra ${st.r[i] === 'x' ? 'on' : ''}" data-a="libre" data-f="${id}" data-i="${i}" data-m="1">Otra respuesta…</button></div>${st.r[i] === 'x' ? libreLinea(st.libre[i]) : ''}</div>`).join('')}
      <div class="m-pie"><span class="vivo">${(() => { const x = calc(id); return `Encontrado: <b>${rangoF(x.min, x.max)}</b> por semana · ${x.calculando ? '<span class="calc-pill">Calculando…</span>' : x.conf}`; })()}</span><button class="btn" data-a="cerrar">Listo</button></div>`, '', mantener);
    $('#modal').dataset.afinar = id;
}
function mPorque(id) {
    const x = calc(id), f = FR[id], st = fr(id), p = S.perfil;
    const resp = f.q.map((qq, i) => { const pt = x.partes[i]; const extra = st.r[i] === 'x' && st.libre[i] && st.libre[i].nota ? ` <i>(${esc(st.libre[i].nota)})</i>` : '';
        return pt ? `<li>${esc(qq[0])} <b>${esc(respTexto(f, st, i))}</b>${extra} → ${pt.max < 1 / 12 ? 'no suma tiempo' : `suma ${rango(pt.min, pt.max)}`}</li>` : `<li class="sut">${esc(qq[0])} → ${st.r[i] === 'x' ? 'calculando tu respuesta escrita' : 'sin responder'} (suma 0)</li>`; }).join('');
    const ajustes = [tOf(SITUACIONES, p.situacion).toLowerCase(), f.dep ? 'quién depende de ti' : '', f.id === 'traslados' || f.id === 'mensajes' ? 'dónde trabajas o estudias' : ''].filter(Boolean).join(', ');
    abrir(`<p class="lbl">${icon(id, 'mini')} ${esc(f.t)}</p><h2>¿De dónde sale este número?</h2>
      <ol class="calc">
        <li>En personas con rutinas parecidas, aquí (${esc(f.fin.toLowerCase())}) se suelen ir entre <b>${num(f.base[0])} y ${num(f.base[1])} horas por semana</b>. Se reparte entre sus ${f.q.length} preguntas.</li>
        <li>Ajuste por tu situación (${esc(ajustes)}): <b>× ${num(Math.round(x.peso * 100) / 100)}</b></li>
        <li>Factor de prudencia (preferimos quedarnos cortos): <b>× ${num(PRUDENCIA)}</b></li>
        <li>El frente empieza en cero. Cada respuesta suma su parte según la gravedad: una buena costumbre no suma nada, una respuesta intermedia suma su parte completa y una mala hasta un poco más del doble.<ul>${resp}</ul></li>
      </ol>
      <p class="resul">Encontrado: <b>${rangoF(x.min, x.max)}</b> por semana${x.max >= 1 / 12 ? ` · ${rangoPct(x.min, x.max)} de tu tiempo despierto` : ''}.</p>
      <p class="disc">Las horas de referencia son aproximadas y sirven para priorizar. Si mides tu tiempo real (por ejemplo, el tiempo de pantalla del celular), anótalo en las notas del plan.</p>`);
}
function mMenu(id) {
    abrir(`<h2>${esc(FR[id].t)}</h2><div class="lista-b">
      <button class="opc linea" data-a="afinar" data-f="${id}">Afinar el número</button>
      <button class="opc linea" data-a="porque" data-f="${id}">¿De dónde sale el número?</button>
      <button class="opc linea" data-a="ocultar" data-f="${id}">Esto no aplica a mi vida (ocultar)</button></div>`, 'chico');
}

// ---------- Plan ----------
function mPlan(id, cargando, error, mantener) {
    const f = FR[id], x = calc(id), st = fr(id), p = st.plan;
    const cab = `<p class="lbl">${icon(id, 'mini')} ${esc(f.t)} · ${rangoF(x.min, x.max)} por semana</p>`;
    if (cargando) return abrir(`${cab}<h2>Preparando tu plan…</h2><div class="cargando"><i></i><i></i><i></i></div><p class="sub">Estamos armando pasos concretos para tu semana. Toma unos segundos.</p>`, 'plan');
    if (!p) return abrir(`${cab}<h2>Plan para recuperarlas</h2>${error ? `<p class="error">${esc(error)}</p>` : ''}<button class="btn" data-a="gen" data-f="${id}">Intentar de nuevo</button>`, 'plan');
    const ex = st.extra || {};
    const ya = (t) => S.acciones.some(a => a.frente === id && a.titulo === t);
    abrir(`${cab}<h2>Plan para recuperarlas</h2>
      <p class="resumen-p">${esc(p.resumen)}</p>
      <div class="victoria"><p class="lbl">Victoria rápida · esta semana</p><h3>${esc(p.victoria.titulo)}</h3><p>${esc(p.victoria.detalle)}</p>
        <button class="btn ${ya(p.victoria.titulo) ? 'ghost' : ''}" data-a="agregar" data-f="${id}" data-t="v" ${ya(p.victoria.titulo) ? 'disabled' : ''}>${ya(p.victoria.titulo) ? '✓ En tus acciones' : 'Agregar a mis acciones'}</button></div>
      <h3 class="h3s">Señales que puedes revisar hoy</h3><ul class="senales">${p.senales.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
      <h3 class="h3s">Pasos</h3><ol class="pasos">${p.pasos.map((s, i) => `<li><div><b>${esc(s.titulo)}</b><p>${esc(s.detalle)}</p><span class="cuando">En ${s.dias} día${s.dias === 1 ? '' : 's'}</span></div>
        <button class="lnk" data-a="agregar" data-f="${id}" data-t="${i}" ${ya(s.titulo) ? 'disabled' : ''}>${ya(s.titulo) ? '✓ Agregado' : '+ Agregar'}</button></li>`).join('')}</ol>
      <div class="plantilla"><p class="lbl">Listo para usar · ${esc(p.plantilla.para)}</p><pre id="plant">${esc(p.plantilla.texto)}</pre><button class="btn ghost" data-a="copiar">Copiar</button></div>
      <p class="medir"><b>Cómo saber si funciona:</b> ${esc(p.medir)}</p>
      <div class="afinar-ia"><h3 class="h3s">Para afinar tu plan</h3><p class="sub">Responde en una línea lo que sepas y actualiza el plan.</p>
        ${p.preguntas.map((q, i) => `<label class="campo"><span>${esc(q)}</span><input data-pq="${i}" maxlength="280" value="${esc(ex[q] || '')}"></label>`).join('')}
        <label class="campo"><span>Tus notas sobre este frente <em>(opcional: horarios, contexto, lo que ya intentaste)</em></span><textarea id="notas" maxlength="600" rows="2">${esc(st.notas || '')}</textarea></label>
        ${error ? `<p class="error">${esc(error)}</p>` : ''}
        <button class="btn" data-a="regen" data-f="${id}">Actualizar plan</button></div>`, 'plan', mantener);
}
function mBloqueado(id) {
    const x = calc(id), T = totales();
    abrir(`<p class="lbl">${icon(id, 'mini')} ${esc(FR[id].t)} · ${rangoF(x.min, x.max)} por semana</p>
      <h2>Desbloquea el plan de todos tus frentes</h2>
      <div class="borroso" aria-hidden="true"><p>████████ ██████ ████ ███████ ██ ████████ ███ ████</p><p>██████ ███ ██████████ █████ ██ ███████</p><p>█████ ██████ ███ ███████████ ██████ ██</p></div>
      <p>Ya viste el plan gratuito de <b>${esc(FR[ACCESO.freeFrente] ? FR[ACCESO.freeFrente].t : 'un frente')}</b>. En total llevas encontradas <b>${rangoF(T.enc.min, T.enc.max)}</b> por semana que se te escapan.</p>
      <button class="btn full" data-a="precios">Ver planes</button>`, 'chico');
}

// ---------- Precios y pago ----------
async function mPrecios() {
    track('precios_visto');
    const T = totales();
    if (!CONF) { try { CONF = await (await fetch('/.netlify/functions/ordena-config')).json(); } catch (_e) { CONF = { plans: [] }; } }
    const plans = CONF.plans || [];
    const sel = UI.planSel || (plans[1] && plans[1].id) || (plans[0] && plans[0].id);
    UI.planSel = sel;
    abrir(`<h2>Recupera tu tiempo</h2>
      <p class="sub">${T.enc.max >= 1 / 12 ? `Se te escapan <b>${rango(T.enc.min, T.enc.max)}</b> por semana (${rangoPct(T.enc.min, T.enc.max)} de tu tiempo despierto).` : 'Revisa tus frentes para ver cuántas horas se te escapan.'} Elige por cuánto tiempo quieres acceso completo.</p>
      <div class="planes">${plans.map(p => `<button class="plan-c ${p.id === sel ? 'on' : ''}" data-a="plan-sel" data-p="${p.id}"><b>${esc(p.label)}</b><span class="precio">US$${Number(p.usd) % 1 ? Number(p.usd).toFixed(2) : Number(p.usd).toFixed(0)}</span><small>${esc(p.note || '')}</small></button>`).join('')}</div>
      <ul class="incluye"><li>Plan a tu medida para cada frente, con pasos, fechas y mensajes listos</li><li>Planes que se afinan con tus respuestas, todas las veces que quieras</li><li>Acciones con calendario y registro de las horas recuperadas</li><li>Resumen en PDF</li></ul>
      <p class="nota">Pago único con PayPal (o tarjeta a través de PayPal). No se renueva solo.${CFG.garantia ? ' ' + esc(CFG.garantia) : ''}${CFG.contacto ? ' ' + esc(CFG.contacto) + '.' : ''} <a href="/privacidad/#pagos" target="_blank" rel="noopener">Condiciones</a></p>
      ${USER ? '<div id="pp"></div>' : '<button class="btn full" data-a="login-pagar">Crear cuenta o entrar para pagar</button>'}`, 'chico');
    if (USER) pintarPaypal();
}
let ppCargado = null;
function cargarPaypal() {
    if (ppCargado) return ppCargado;
    ppCargado = new Promise((ok, mal) => {
        if (!CONF || !CONF.clientId) return mal(new Error('PayPal no está configurado.'));
        const s = document.createElement('script');
        s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CONF.clientId)}&currency=USD&intent=capture&components=buttons`;
        s.onload = () => ok(window.paypal); s.onerror = () => { ppCargado = null; mal(new Error('No se pudo cargar PayPal.')); };
        document.head.appendChild(s);
    });
    return ppCargado;
}
async function pintarPaypal() {
    const box = $('#pp'); if (!box) return;
    box.innerHTML = '<p class="sub">Cargando PayPal…</p>';
    try {
        const paypal = await cargarPaypal();
        box.innerHTML = '';
        paypal.Buttons({
            style: { layout: 'vertical', shape: 'pill', label: 'pay' },
            createOrder: async () => {
                const r = await api('ordena-pay-create', { plan: UI.planSel });
                if (!r.orderID) throw new Error(r.error || 'No se pudo iniciar el pago');
                track('pago_iniciado', { plan: UI.planSel });
                return r.orderID;
            },
            onApprove: async (data) => {
                box.innerHTML = '<p class="sub">Confirmando tu pago…</p>';
                const r = await api('ordena-pay-capture', { orderID: data.orderID });
                if (r.ok) { ACCESO = r.access || ACCESO; track('pago_ok', { plan: UI.planSel }); cerrar(); render(); toast('¡Listo! Ya tienes acceso a todos los planes.'); }
                else { box.innerHTML = `<p class="error">${esc(r.error || 'No se pudo confirmar el pago.')}</p>`; track('pago_error'); }
            },
            onCancel: () => track('pago_cancelado'),
            onError: (e) => { box.insertAdjacentHTML('afterbegin', `<p class="error">Hubo un problema con PayPal. Intenta de nuevo.</p>`); console.error(e); }
        }).render(box);
    } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}
function mHecho(id) {
    const a = S.acciones.find(z => z.id === id); if (!a) return;
    abrir(`<h2>¡Bien hecho!</h2><p class="sub">${esc(a.titulo)}</p>
      <label class="campo"><span>¿Cuántas horas te ahorra, más o menos? <em>Opcional</em></span><input id="monto" inputmode="decimal" placeholder="Ej.: 1,5"></label>
      <div class="opciones fila"><button class="opc chip on" data-a="tipo" data-v="semana">Cada semana</button><button class="opc chip" data-a="tipo" data-v="una">Una sola vez</button></div>
      <div class="m-pie"><button class="btn ghost" data-a="cerrar">Cancelar</button><button class="btn" data-a="hecho-ok" data-id="${id}">Guardar</button></div>`, 'chico');
}
function mCuenta() {
    abrir(`<h2>Mi cuenta</h2><p class="sub">${esc(USER.email || '')}</p>
      ${ACCESO.active ? `<p><span class="pill ok">Plan activo</span> ${ACCESO.admin ? '(administrador)' : `hasta el ${new Date(ACCESO.paidUntil).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`}</p>` : `<p>Plan gratuito${ACCESO.freeFrente ? ` · frente gratis: <b>${esc(FR[ACCESO.freeFrente] ? FR[ACCESO.freeFrente].t : '')}</b>` : ''}</p><button class="btn full" data-a="precios">Ver planes</button>`}
      <div class="lista-b"><button class="opc linea" data-a="perfil">Editar mis datos</button><button class="opc linea" data-a="limpiar">Empezar de nuevo</button><button class="opc linea" data-a="logout">Cerrar sesión</button></div>
      <p class="disc">¿Dudas o soporte? ${esc(CFG.contacto)}${CFG.whatsapp ? ` · <a href="https://wa.me/${CFG.whatsapp}" target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}</p>
      <p class="disc">Tu diagnóstico se guarda en tu cuenta y puedes abrirlo desde el teléfono o la computadora.</p>`, 'chico');
}
function mLimpiar() {
    abrir(`<h2>Empezar de nuevo</h2><p class="sub">Elige qué borrar. No se puede deshacer.</p>
      <div class="lista-b">
        <button class="opc linea" data-a="limpiar-resp"><b>Repetir el diagnóstico</b><span>Borra respuestas, planes y acciones. Conserva tu situación, quién depende de ti y tu meta.</span></button>
        <button class="opc linea" data-a="limpiar-todo"><b>Borrar todo</b><span>Deja todo vacío y vuelve a preguntar cómo es tu semana.</span></button>
      </div><div class="m-pie"><button class="btn ghost" data-a="cerrar">Cancelar</button></div>`, 'chico');
}

// =====================================================================================
//  Servidor
// =====================================================================================
async function token() {
    const u = window.netlifyIdentity && netlifyIdentity.currentUser();
    if (!u) return null;
    try { return await u.jwt(); } catch (_e) { return u.token && u.token.access_token; }
}
async function api(fn, body, method) {
    const t = await token();
    const h = { 'Content-Type': 'application/json' };
    if (t) h.Authorization = 'Bearer ' + t;
    try {
        const r = await fetch('/.netlify/functions/' + fn, { method: method || (body ? 'POST' : 'GET'), headers: h, body: body ? JSON.stringify(body) : undefined });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return Object.assign({ status: r.status }, d, { error: d.error || 'Error ' + r.status });
        return d;
    } catch (_e) { return { error: 'Sin conexión. Revisa tu internet e intenta de nuevo.' }; }
}
async function bajar() {
    const r = await api('ordena-data');
    if (r.error) return;
    ACCESO = r.access || ACCESO;
    const remoto = r.data;
    if (remoto && remoto.v === 1 && remoto.perfil && (!S.perfil || (remoto.actualizado || 0) > (S.actualizado || 0))) {
        S = Object.assign(nuevo(), remoto); guardar(false);
        if (UI.vista !== 'app') UI.vista = 'app';
    } else if (S.perfil) await subir();
    render();
}
async function subir() { if (!USER || !S.perfil) return; const r = await api('ordena-data', { data: S }); if (r.error && r.status !== 401) console.warn('[ordena] no se pudo guardar en la nube', r.error); }

async function generarPlan(id) {
    const x = calc(id), st = fr(id), p = S.perfil, f = FR[id];
    mPlan(id, true);
    const extra = Object.entries(st.extra || {}).filter(([, v]) => v).map(([q, a]) => ({ q, a }));
    const r = await api('ordena-plan', {
        frente: id,
        perfil: { situacion: tOf(SITUACIONES, p.situacion), detalle: p.detalle || '', dependen: tOf(DEPENDEN, p.dependen), lugar: tOf(LUGARES, p.lugar), meta: tOf(METAS, p.meta) },
        datos: { titulo: f.t + ' (' + f.fin + ') — ' + f.f, rango: rangoF(x.min, x.max) + ' por semana (' + rangoPct(x.min, x.max) + ' de su tiempo despierto)', respuestas: f.q.map((qq, i) => st.r[i] != null ? { q: qq[0], a: respTexto(f, st, i) } : null).filter(Boolean), extra, notas: st.notas || '' }
    });
    if (r.status === 401) { pendiente = { tipo: 'plan', id }; cerrar(); return pedirLogin('signup'); }
    if (r.status === 402) { if (r.freeFrente) ACCESO.freeFrente = r.freeFrente; render(); return mBloqueado(id); }
    if (r.error || !r.plan) { track('plan_error', { frente: id }); return mPlan(id, false, r.message || r.error); }
    st.plan = r.plan; st.planEn = Date.now();
    if (r.free) ACCESO.freeFrente = id;
    guardar(); track('plan_ok', { frente: id, free: !!r.free });
    render(); mPlan(id);
}
function pedirLogin(modo) {
    if (!window.netlifyIdentity) return toast('No se pudo cargar el inicio de sesión. Recarga la página.');
    track('login_visto', { modo });
    netlifyIdentity.open(modo || 'login');
}

// =====================================================================================
//  Eventos
// =====================================================================================
function empezarOnb() {
    UI.borrador = Object.assign({ situacion: null, detalle: '', dependen: null, lugar: null, meta: null }, S.perfil || {});
    UI.paso = 1; UI.vista = 'onb'; cerrar(); render(); window.scrollTo(0, 0);
}
document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (UI.menu && (!b || b.dataset.a !== 'emp-menu')) { UI.menu = false; if (!b) { render(); return; } }
    if (!b) return;
    const a = b.dataset.a, id = b.dataset.f;
    if (b.tagName === 'A') e.preventDefault();
    switch (a) {
        case 'emp-menu': UI.menu = !UI.menu; render(); break;
        case 'empezar': case 'perfil': empezarOnb(); track(a === 'empezar' ? 'empezar' : 'editar_perfil'); break;
        case 'onb-set': { leerOnb(); UI.borrador[b.dataset.k] = b.dataset.v; render(); break; }
        case 'onb-atras': leerOnb(); UI.paso--; render(); break;
        case 'onb-cancelar': UI.vista = S.perfil ? 'app' : 'inicio'; render(); window.scrollTo(0, 0); break;
        case 'onb-sig': {
            leerOnb();
            if (UI.paso < 3) { UI.paso++; render(); window.scrollTo(0, 0); break; }
            const nuevoPerfil = !S.perfil, B = UI.borrador;
            S.perfil = { situacion: B.situacion, detalle: B.detalle || '', dependen: B.dependen, lugar: B.lugar, meta: B.meta };
            guardar(); UI.vista = 'app'; UI.tab = 'panel'; render(); window.scrollTo(0, 0);
            track(nuevoPerfil ? 'diagnostico_listo' : 'perfil_editado', { situacion: S.perfil.situacion, dependen: S.perfil.dependen, lugar: S.perfil.lugar, meta: S.perfil.meta });
            break;
        }
        case 'tab': UI.tab = b.dataset.tab; if (UI.vista !== 'app' && S.perfil) UI.vista = 'app'; render(); window.scrollTo(0, 0); break;
        case 'resp': {
            const st = fr(id), i = Number(b.dataset.i), k = Number(b.dataset.k);
            const antes = calc(id);
            st.r[i] = k; delete st.libre[i]; guardar(); track('respuesta', { frente: id, i, k });
            const ahora = calc(id), dMin = ahora.min - antes.min, dMax = ahora.max - antes.max;
            const aviso = dMax >= 1 / 12 ? `+${rango(dMin, dMax)} por semana en ${FR[id].t}` : dMax <= -1 / 12 ? `${FR[id].t}: bajó a ${rangoF(ahora.min, ahora.max)} por semana` : `Bien: aquí no se te escapa tiempo`;
            if (b.dataset.m) { render(); mAfinar(id, true); } else { render(); }
            toast(aviso);
            break;
        }
        case 'afinar': mAfinar(id); break;
        case 'libre': {
            const st = fr(id), i = Number(b.dataset.i);
            if (st.r[i] === 'x' && st.libre[i] && st.libre[i].estado === 'error') { interpretar(id, i); break; }
            mLibre(id, i, !!b.dataset.m); break;
        }
        case 'libre-ok': {
            const t = (($('#libreTxt') || {}).value || '').trim();
            if (t.length < 2) { $('#libreTxt').focus(); break; }
            const st = fr(id), i = Number(b.dataset.i);
            st.r[i] = 'x'; st.libre[i] = { texto: t.slice(0, 500), estado: 'calc' }; guardar();
            if (b.dataset.m) mAfinar(id); else cerrar();
            render(); interpretar(id, i); break;
        }
        case 'porque': mPorque(id); track('porque', { frente: id }); break;
        case 'menu': mMenu(id); break;
        case 'ocultar': fr(id).oculto = true; guardar(); cerrar(); render(); toast('Frente oculto. Puedes volver a mostrarlo abajo.'); break;
        case 'mostrar': fr(id).oculto = false; guardar(); render(); break;
        case 'plan': {
            if (calc(id).n === 0) { mAfinar(id); break; }
            track('plan_click', { frente: id });
            const st = fr(id);
            if (st.plan) { mPlan(id); break; }
            if (!USER) { pendiente = { tipo: 'plan', id }; abrir(`<h2>Tu plan está a un paso</h2><p class="sub">Crea tu cuenta gratis para ver el plan completo de <b>${esc(FR[id].t)}</b> y guardar tu diagnóstico en el teléfono y la computadora.</p><button class="btn full" data-a="login-signup">Crear cuenta gratis</button><button class="btn ghost full" data-a="login">Ya tengo cuenta</button><p class="disc">El plan gratuito incluye un frente completo. Te recomendamos el más grande.</p>`, 'chico'); break; }
            if (!puedeVer(id)) { mBloqueado(id); break; }
            generarPlan(id); break;
        }
        case 'gen': generarPlan(id); break;
        case 'regen': {
            const st = fr(id); st.extra = st.extra || {};
            (st.plan && st.plan.preguntas || []).forEach((q, i) => { const inp = document.querySelector(`[data-pq="${i}"]`); if (inp) st.extra[q] = inp.value.trim(); });
            const n = $('#notas'); if (n) st.notas = n.value.trim();
            guardar(); generarPlan(id); break;
        }
        case 'agregar': {
            const st = fr(id), p = st.plan; if (!p) break;
            const t = b.dataset.t, paso = t === 'v' ? { titulo: p.victoria.titulo, detalle: p.victoria.detalle, dias: 3 } : p.pasos[Number(t)];
            if (!paso || S.acciones.some(z => z.frente === id && z.titulo === paso.titulo)) break;
            S.acciones.push({ id: uid(), frente: id, titulo: paso.titulo, detalle: paso.detalle, fecha: masDias(Math.max(1, Math.min(60, paso.dias || 3))), hecho: false });
            guardar(); track('accion_agregada', { frente: id }); render(); mPlan(id, false, null, true); toast('Agregado a tus acciones.'); break;
        }
        case 'copiar': { const t = $('#plant').textContent; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Copiado.'), () => toast('Selecciona el texto y cópialo.')); break; }
        case 'hecho': mHecho(b.dataset.id); break;
        case 'tipo': document.querySelectorAll('[data-a="tipo"]').forEach(x => x.classList.toggle('on', x === b)); break;
        case 'hecho-ok': {
            const ac = S.acciones.find(z => z.id === b.dataset.id); if (!ac) break;
            const n = Math.max(0, Math.min(80, Number(String(($('#monto') || {}).value || '').replace(',', '.').replace(/[^\d.]/g, '')) || 0));
            const sel = $('[data-a="tipo"].on'), tipo = sel ? sel.dataset.v : 'semana';
            Object.assign(ac, { hecho: true, hechoEn: hoyISO(), monto: Math.round(n * 4) / 4, tipo });
            guardar(); cerrar(); render(); track('accion_hecha', { frente: ac.frente, horas: n > 0 }); toast(n ? 'Sumado a lo recuperado.' : '¡Una menos!'); break;
        }
        case 'deshacer': { const ac = S.acciones.find(z => z.id === b.dataset.id); if (ac) { ac.hecho = false; ac.monto = 0; guardar(); render(); } break; }
        case 'borrar-acc': S.acciones = S.acciones.filter(z => z.id !== b.dataset.id); guardar(); render(); break;
        case 'ics': descargarIcs(S.acciones.find(z => z.id === b.dataset.id)); break;
        case 'mes': { const base = UI.mes ? new Date(UI.mes + '-01T12:00:00') : new Date(); base.setMonth(base.getMonth() + Number(b.dataset.d)); UI.mes = isoLocal(base).slice(0, 7); render(); break; }
        case 'imprimir': track('pdf'); window.print(); break;
        case 'precios': mPrecios(); break;
        case 'plan-sel': UI.planSel = b.dataset.p; document.querySelectorAll('.plan-c').forEach(x => x.classList.toggle('on', x === b)); break;
        case 'limpiar': mLimpiar(); break;
        case 'limpiar-resp': {
            S = Object.assign(nuevo(), { perfil: S.perfil, creado: S.creado }); guardar(); cerrar(); UI.vista = 'app'; UI.tab = 'panel'; render(); window.scrollTo(0, 0);
            track('limpiado', { modo: 'respuestas' }); toast('Listo: empezamos otra vez desde cero.'); break;
        }
        case 'limpiar-todo': { S = nuevo(); guardar(); track('limpiado', { modo: 'todo' }); empezarOnb(); break; }
        case 'login': cerrar(); pedirLogin('login'); break;
        case 'login-signup': cerrar(); pedirLogin('signup'); break;
        case 'login-pagar': pendiente = { tipo: 'precios' }; cerrar(); pedirLogin('signup'); break;
        case 'cuenta': mCuenta(); break;
        case 'logout': cerrar(); netlifyIdentity.logout(); break;
        case 'cerrar': cerrar(); break;
    }
});
document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.a === 'fecha') { const ac = S.acciones.find(z => z.id === t.dataset.id); if (ac && t.value) { ac.fecha = t.value; guardar(); render(); } }
});
document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (!$('#modal').hidden) cerrar(); else if (UI.menu) { UI.menu = false; render(); } });
function leerOnb() { const b = UI.borrador; if (!b) return; const d = $('#detalle'); if (d) b.detalle = d.value.trim().slice(0, 120); }

function descargarIcs(a) {
    if (!a) return;
    const d = a.fecha.replace(/-/g, ''), n = new Date(a.fecha + 'T12:00:00'); n.setDate(n.getDate() + 1);
    const d2 = isoLocal(n).replace(/-/g, '');
    const limpia = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ordena//ES', 'BEGIN:VEVENT', `UID:${a.id}@ordena`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
        `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${limpia('Ordena: ' + a.titulo)}`, `DESCRIPTION:${limpia(a.detalle)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const l = document.createElement('a'); l.href = url; l.download = 'ordena-accion.ics'; document.body.appendChild(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000); track('ics');
}

// =====================================================================================
//  Arranque
// =====================================================================================
function alEntrar(u) {
    USER = u ? { email: u.email, id: u.id } : null;
    if (!USER) { ACCESO = { active: false, freeFrente: null }; render(); return; }
    bajar().then(() => {
        const p = pendiente; pendiente = null;
        if (p && p.tipo === 'plan') { const st = fr(p.id); if (st.plan) mPlan(p.id); else if (puedeVer(p.id)) generarPlan(p.id); else mBloqueado(p.id); }
        else if (p && p.tipo === 'precios') mPrecios();
    });
}
if (window.netlifyIdentity) {
    netlifyIdentity.on('init', (u) => { if (u) alEntrar(u); });
    netlifyIdentity.on('login', (u) => { netlifyIdentity.close(); track('login_ok'); alEntrar(u); });
    netlifyIdentity.on('logout', () => { alEntrar(null); toast('Sesión cerrada. Tu diagnóstico sigue en este dispositivo.'); });
    netlifyIdentity.init({ locale: 'es' });
}
fetch('/.netlify/functions/ordena-config').then(r => r.json()).then(c => { CONF = c; }).catch(() => {});
track(S.perfil ? 'visita_vuelta' : 'visita_nueva');
if (S.perfil) Object.entries(S.fr || {}).forEach(([id, st]) => { if (FR[id] && st.libre) Object.keys(st.libre).forEach(i => { if (st.r[i] === 'x' && st.libre[i].estado === 'calc') setTimeout(() => interpretar(id, Number(i)), 300); }); });
render();
})();
