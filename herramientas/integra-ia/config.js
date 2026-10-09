// «¿Se puede conectar tu software con IA?»: las preguntas básicas para saber si un software existente se puede integrar con IA.
// Respuestas guardadas: software, tipo, tipo_otro, donde, salida, mantiene, objetivo, objetivo_otro, sensibles, detalle, pagaria, viabilidad{puntaje,nivel,areas}.
const OPT = {
  donde: [['En la nube (entro por internet)', 3], ['Una parte en la nube y otra en mi equipo', 2], ['En una computadora o servidor de mi negocio', 1], ['No lo sé', 1]],
  salida: [['Tiene conexiones con otros programas (API, Zapier, etc.)', 3], ['Puedo exportar los datos a Excel o CSV', 2], ['Solo puedo verlos en la pantalla', 0], ['No lo sé', 1]],
  mantiene: [['Lo hizo un programador y tengo el código', 3], ['Es un programa comercial (lo compré o pago suscripción)', 2], ['Lo hizo un programador y no tengo el código', 1], ['No lo sé', 1]]
};
const DIM = { donde: 'Dónde vive', salida: 'Acceso a los datos', mantiene: 'Quién lo controla' };
const LEVELS = [[0, 'Hay que revisar', 'Antes de pensar en IA hay que confirmar cómo sacar los datos y quién puede tocar el sistema. Se puede resolver, pero conviene mirarlo con calma.'],
  [4, 'Viable con ajustes', 'Hay un camino razonable. Faltan algunos detalles por confirmar, pero no parece un bloqueo.'],
  [7, 'Muy viable', 'Tu software tiene lo que hace falta para conectarse con IA de forma bastante directa.']];
const FALLBACK = {
  'Tiene conexiones con otros programas (API, Zapier, etc.)': 'Como tu software ya se conecta con otros programas, la IA puede leer y escribir ahí directamente. Lo primero es revisar qué datos expone y con qué permisos.',
  'Puedo exportar los datos a Excel o CSV': 'Puedes empezar sacando los datos en un archivo cada cierto tiempo y dejar que la IA los analice o responda sobre ellos. Después se puede automatizar ese envío.',
  'Solo puedo verlos en la pantalla': 'Si solo se ve en pantalla, primero habría que encontrar una forma de sacar los datos (una exportación, una base de datos o un reporte). Es el punto clave por confirmar.',
  'No lo sé': 'Lo primero es averiguar si tu software permite exportar datos o conectarse con otros programas. Con eso se sabe qué tan directo sería.'
};
window.HF_CFG = {
  tool: 'integra-ia', app: 'hf-integra-ia', brand: 'Software + IA',
  intro: { h1: '¿Se puede conectar tu software con IA?', lead: 'Cuéntanos qué programa usas y cómo funciona. Te decimos qué tan viable es conectarlo con IA y cómo se haría.', start: 'Revisar mi software', facts: ['Toma unos 3 minutos', 'No necesitas saber de tecnología', 'Si no sabes algo, elige «No lo sé»'] },
  steps: [
    { id: 'software', key: 'software', type: 'text', single: true, title: '¿Qué programa o sistema quieres conectar con IA?', hint: 'Su nombre o cómo lo llamas.', placeholder: 'Ej.: Odoo, mi Excel de ventas, un sistema hecho a mi medida' },
    { id: 'tipo', key: 'tipo', type: 'choice', other: true, title: '¿Qué tipo de programa es?', options: ['Hojas de cálculo (Excel, Google Sheets)', 'Facturación o contabilidad', 'Ventas o clientes (CRM)', 'Inventario o punto de venta', 'Citas o reservas', 'Tienda en línea', 'Sistema hecho a la medida'] },
    { id: 'donde', key: 'donde', type: 'choice', title: '¿Dónde está guardado y funcionando?', options: OPT.donde.map(o => o[0]) },
    { id: 'salida', key: 'salida', type: 'choice', title: '¿Se pueden sacar o enviar datos desde ese programa?', hint: 'Por ejemplo, exportar a Excel o conectarlo con otra herramienta.', options: OPT.salida.map(o => o[0]) },
    { id: 'mantiene', key: 'mantiene', type: 'choice', title: '¿Quién lo creó o lo controla?', options: OPT.mantiene.map(o => o[0]) },
    { id: 'objetivo', key: 'objetivo', type: 'choice', other: true, title: '¿Qué te gustaría que hiciera la IA con ese programa?', options: ['Responder preguntas de mis clientes', 'Leer facturas o documentos y pasarlos al sistema', 'Hacerme resúmenes y reportes', 'Buscar información en mis datos escribiendo una pregunta', 'Avisarme o recomendarme qué hacer', 'Hacer tareas repetitivas por mí'] },
    { id: 'sensibles', key: 'sensibles', type: 'choice', title: '¿Guarda datos delicados de tus clientes (pagos, salud, documentos de identidad)?', options: ['Sí, bastantes', 'Algunos', 'Casi ninguno'] },
    { id: 'detalle', key: 'detalle', type: 'text', optional: true, title: '¿Hay algo más que debamos saber?', hint: 'Cualquier detalle de cómo lo usas hoy. Puedes saltarla.', placeholder: 'Ej.: lo usan 4 personas y el proveedor ya no da soporte' },
    { id: 'pago', key: 'pagaria', type: 'choice', title: 'Si alguien lo conectara por ti, ¿cuánto invertirías (una sola vez)?', hint: 'Solo para orientarnos.', options: ['Todavía no lo sé', 'Hasta US$200', 'US$200 a 500', 'US$500 a 1,500', 'Más de US$1,500'] }
  ],
  ai: { mode: 'integra', blocking: false }, finishLabel: 'Ver mi revisión',
  renderResult(body, api) {
    const { A, h } = api;
    const pts = (k) => { const o = OPT[k].find(x => x[0] === A[k]); return o ? o[1] : 0; };
    const keys = Object.keys(OPT); let total = 0; keys.forEach(k => { total += pts(k); });
    const lvl = LEVELS.slice().reverse().find(l => total >= l[0]);
    A.viabilidad = { puntaje: total, nivel: lvl[1], areas: keys.map(k => `${DIM[k]} ${pts(k)}/3`).join(', ') };
    body.appendChild(h('p', 'tag', 'Tu revisión'));
    const L = h('div', 'ledger'); L.appendChild(h('p', 'label', 'Qué tan viable se ve'));
    const big = h('div', 'big'); const num = h('span', '', '0'); big.append(num, h('span', 'cur', ' / 9')); L.appendChild(big);
    const sub = h('p', 'sub'); sub.innerHTML = `<b>${lvl[1]}</b>`; L.appendChild(sub); L.appendChild(h('p', 'sub', lvl[2])); body.appendChild(L);
    api.countUp(num, total, (n) => String(Math.round(n)), 900);
    const weakest = keys.slice().sort((a, b) => pts(a) - pts(b))[0];
    const bars = h('div', 'bars'); keys.forEach(k => bars.appendChild(api.bar(DIM[k], `${pts(k)} de 3`, (pts(k) / 3) * 100, k === weakest))); body.appendChild(bars);
    const card = h('div', 'card'); card.appendChild(h('h3', '', 'Cómo se conectaría')); const inner = h('div'); inner.appendChild(api.skeleton()); card.appendChild(inner); body.appendChild(card);
    const fallback = () => { inner.textContent = ''; inner.appendChild(h('p', '', FALLBACK[A.salida] || FALLBACK['No lo sé'])); if (A.sensibles === 'Sí, bastantes') inner.appendChild(h('p', '', 'Como guarda datos delicados, habría que cuidar permisos y qué información se envía a la IA.')); };
    api.ai('integra').then(d => {
      inner.textContent = ''; inner.appendChild(h('p', '', d.summary)); inner.appendChild(h('p', '', d.approach));
      const ul = h('ul'); d.steps.forEach(t => { const li = h('li'); li.appendChild(h('b', '', t.title)); li.appendChild(document.createTextNode(t.body)); ul.appendChild(li); }); inner.appendChild(ul);
      const w = h('p', ''); w.appendChild(h('b', '', 'Qué cuidar: ')); w.appendChild(document.createTextNode(d.watch)); inner.appendChild(w);
      api.saveAi({ summary: d.summary }); api.track('ai_ok', { mode: 'integra' });
    }).catch((e) => { fallback(); api.track('ai_failed', { mode: 'integra', status: e.status || 0 }); });
  },
  fine: 'Es una revisión orientativa, basada en lo que respondiste. Para confirmarla hay que mirar el programa en concreto.',
  contact: { title: '¿Quieres que revisemos tu caso contigo?', text: 'Si dejas tu correo o WhatsApp, te escribimos con una revisión de tu software y los siguientes pasos.', thanks: '¡Gracias! Te escribiremos pronto.' }
};
