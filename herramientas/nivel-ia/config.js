// «¿Qué tan listo está tu negocio para la IA?»: 6 preguntas con puntaje (0 a 3 cada una = máximo 18) + 5 de contexto.
// Respuestas guardadas: tamano, sector, sector_otro, d1, d2, p1, h1, h2, a1, cuello, cuello_otro, software_actual, pagaria, puntaje, nivel, areas.
const Q = {
  d1: { dim: 'Datos', title: '¿Dónde guardas la información de tus clientes y ventas?', opts: ['En mi cabeza o en papel', 'En el WhatsApp y las notas del celular', 'En Excel u hojas de cálculo', 'En un sistema o programa'] },
  d2: { dim: 'Datos', title: '¿Qué tan fácil es saber cuánto vendiste este mes?', opts: ['No lo sé con claridad', 'Tengo que revisar varias cosas', 'Lo saco en unos minutos', 'Lo veo al instante'] },
  p1: { dim: 'Procesos', title: '¿Cuántas tareas repites a mano cada semana?', opts: ['Muchísimas', 'Varias', 'Pocas', 'Casi ninguna'] },
  h1: { dim: 'Herramientas', title: '¿Cuánto usas herramientas digitales (agenda, pagos, facturación)?', opts: ['Casi nada', 'Algunas sueltas', 'Varias, un poco conectadas', 'Todo bastante integrado'] },
  h2: { dim: 'Herramientas', title: '¿Usas inteligencia artificial hoy (ChatGPT, Gemini, Claude…)?', opts: ['Nunca', 'Lo probé alguna vez', 'Una vez por semana más o menos', 'A diario en mi trabajo'] },
  a1: { dim: 'Actitud', title: '¿Cuánto tiempo al mes podrías dedicar a mejorar cómo trabajas?', opts: ['Nada', '1 a 2 horas', '3 a 8 horas', 'Más de 8 horas'] }
};
const DIMS = { Datos: ['d1', 'd2'], Procesos: ['p1'], Herramientas: ['h1', 'h2'], Actitud: ['a1'] };
const LEVELS = [[0, 'Punto de partida', 'Tu negocio todavía depende mucho de tu memoria y del trabajo manual. Es la mejor etapa para ordenar lo básico: cada mejora se nota enseguida.'],
  [5, 'Explorando', 'Ya usas algunas herramientas, pero poco conectadas. Con un par de ajustes puedes ahorrar horas cada semana.'],
  [10, 'En marcha', 'Tienes buena base. Estás listo para automatizar tareas concretas y usar IA donde más tiempo te quita.'],
  [15, 'Listo para escalar', 'Tu negocio está ordenado y abierto a mejorar. El siguiente salto es conectar todo y dejar que la IA haga lo repetitivo.']];
const TIPS = { Datos: 'Junta tus clientes y ventas en un solo lugar (aunque sea una hoja de cálculo bien ordenada). Sin datos ordenados, ninguna herramienta ayuda.',
  Procesos: 'Escribe los pasos de la tarea que más repites. Una tarea bien descrita es una tarea que se puede automatizar.',
  Herramientas: 'Prueba una herramienta de IA para una tarea pequeña (responder mensajes, redactar publicaciones) durante una semana y mide el tiempo ahorrado.',
  Actitud: 'Reserva una hora fija al mes para mejorar un proceso. Pequeñas mejoras constantes superan a grandes proyectos que nunca se empiezan.' };
const choiceStep = (k) => ({ id: k, key: k, type: 'choice', title: Q[k].title, options: Q[k].opts });
window.HF_CFG = {
  tool: 'nivel-ia', app: 'hf-nivel-ia', brand: 'Nivel de IA',
  intro: { h1: '¿Qué tan listo está tu negocio para usar IA?', lead: 'Responde unas preguntas rápidas y te damos tu puntaje, tus áreas más débiles y 3 consejos para el siguiente paso.', start: 'Hacer el test', facts: ['Toma 2 minutos, casi todo es tocar una opción', 'Sin registrarte', 'Resultado al instante'] },
  steps: [
    { id: 'tamano', key: 'tamano', type: 'choice', title: '¿Cuántas personas trabajan contigo?', options: ['Solo yo', '2 a 5 personas', '6 a 20 personas', 'Más de 20'] },
    { id: 'sector', key: 'sector', type: 'choice', other: true, title: '¿A qué se dedica tu negocio?', options: ['Comercio o tienda', 'Restaurante o comida', 'Servicios profesionales', 'Belleza y salud', 'Educación o cursos', 'Construcción o mantenimiento', 'Tecnología o marketing', 'Venta por redes sociales'] },
    choiceStep('d1'), choiceStep('d2'), choiceStep('p1'), choiceStep('h1'), choiceStep('h2'), choiceStep('a1'),
    { id: 'cuello', key: 'cuello', type: 'choice', other: true, title: '¿Cuál es tu mayor cuello de botella hoy?', options: ['Conseguir clientes', 'Responder y dar seguimiento', 'Controlar inventario', 'Cobrar y facturar', 'Organizar mi tiempo', 'Coordinar a mi equipo', 'Controlar gastos y números', 'Crear contenido'] },
    { id: 'software', key: 'software_actual', type: 'text', single: true, optional: true, title: '¿Pagas algún programa que te parezca complicado o al que le falten cosas?', hint: 'Escribe cuál y qué le falta. Puedes saltarla.', placeholder: 'Ej.: mi programa de facturación, no me deja…' },
    { id: 'pago', key: 'pagaria', type: 'choice', title: 'Si una herramienta resolviera tu cuello de botella, ¿cuánto pagarías al mes?', hint: 'Responde con sinceridad: no estamos vendiendo nada ahora.', options: ['No pagaría', 'Hasta US$10', 'US$10 a 30', 'US$30 a 100', 'Más de US$100'] }
  ],
  ai: { mode: 'ia', blocking: false }, finishLabel: 'Ver mi puntaje',
  renderResult(body, api) {
    const { A, h } = api;
    const pts = (k) => Math.max(0, Q[k].opts.indexOf(A[k]));
    const dimPts = {}, dimMax = {}; let total = 0;
    Object.keys(DIMS).forEach(d => { dimPts[d] = DIMS[d].reduce((s, k) => s + pts(k), 0); dimMax[d] = DIMS[d].length * 3; total += dimPts[d]; });
    const lvl = LEVELS.slice().reverse().find(l => total >= l[0]);
    A.puntaje = total; A.nivel = lvl[1]; A.areas = Object.keys(DIMS).map(d => `${d} ${dimPts[d]}/${dimMax[d]}`).join(', ');
    body.appendChild(h('p', 'tag', 'Tu nivel de preparación para la IA'));
    const L = h('div', 'ledger'); L.appendChild(h('p', 'label', 'Tu puntaje'));
    const big = h('div', 'big'); const num = h('span', '', '0'); big.append(num, h('span', 'cur', ' / 18')); L.appendChild(big);
    const sub = h('p', 'sub'); sub.innerHTML = `Nivel: <b>${lvl[1]}</b>`; L.appendChild(sub); L.appendChild(h('p', 'sub', lvl[2])); body.appendChild(L);
    api.countUp(num, total, (n) => String(Math.round(n)), 900);
    const weakest = Object.keys(DIMS).slice().sort((a, b) => dimPts[a] / dimMax[a] - dimPts[b] / dimMax[b])[0];
    const bars = h('div', 'bars'); Object.keys(DIMS).forEach(d => bars.appendChild(api.bar(d, `${dimPts[d]} de ${dimMax[d]}`, (dimPts[d] / dimMax[d]) * 100, d === weakest))); body.appendChild(bars);
    const card = h('div', 'card'); card.appendChild(h('h3', '', '3 consejos para tu siguiente paso')); const inner = h('div'); inner.appendChild(api.skeleton()); card.appendChild(inner); body.appendChild(card);
    const fallback = () => { inner.textContent = ''; const ul = h('ul'); [weakest].concat(Object.keys(DIMS).filter(d => d !== weakest)).slice(0, 3).forEach(d => { const li = h('li'); li.appendChild(h('b', '', d)); li.appendChild(document.createTextNode(TIPS[d])); ul.appendChild(li); }); inner.appendChild(ul); };
    api.ai('ia').then(d => {
      inner.textContent = ''; inner.appendChild(h('p', '', d.summary)); const ul = h('ul'); d.tips.forEach(t => { const li = h('li'); li.appendChild(h('b', '', t.title)); li.appendChild(document.createTextNode(t.body)); ul.appendChild(li); }); inner.appendChild(ul);
      api.saveAi({ summary: d.summary }); api.track('ai_ok', { mode: 'ia' });
    }).catch((e) => { fallback(); api.track('ai_failed', { mode: 'ia', status: e.status || 0 }); });
  },
  fine: 'Es un test orientativo de 6 preguntas, no una auditoría.',
  contact: { title: '¿Quieres que te avisemos cuando tengamos una herramienta para tu cuello de botella?', text: 'Si dejas tu correo o WhatsApp, te escribimos cuando una herramienta sirva para lo tuyo.', thanks: '¡Gracias! Te escribiremos cuando tengamos algo para ti.' }
};
