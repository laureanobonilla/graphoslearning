// «Calculadora de fuga de tiempo»: horas repetidas × valor de tu hora = lo que pierdes al año.
// Respuestas guardadas: rol, rol_otro, tareas[{t,h}], valor_hora, varita, software_actual, pagaria, resultado{anual_usd,horas_semana,dias}.
const HORA = { 'Menos de US$5': 3, 'US$5 a 10': 7.5, 'US$10 a 25': 17.5, 'US$25 a 50': 37.5, 'Más de US$50': 60, 'No sé': 10 };
const money = (n) => Math.round(n).toLocaleString('en-US');
window.HF_CFG = {
  tool: 'fuga-de-tiempo', app: 'hf-fuga-tiempo', brand: 'Fuga de tiempo',
  intro: { h1: '¿Cuánto te cuesta repetir lo mismo cada semana?', lead: 'Cuéntanos tus 3 tareas más repetidas y calculamos cuánto dinero y cuántos días de trabajo se te van al año.', start: 'Calcular mi fuga', facts: ['Toma 2 minutos', 'Sin registrarte', 'Resultado al instante, con un plan para empezar'] },
  steps: [
    { id: 'rol', key: 'rol', type: 'choice', other: true, title: '¿Qué describe mejor lo que haces?', hint: 'Elige lo más cercano.',
      options: ['Tengo un negocio con local', 'Vendo por redes sociales o en línea', 'Soy profesional independiente', 'Dirijo un equipo pequeño', 'Manejo procesos en una empresa', 'Estoy empezando a emprender'] },
    { id: 'tareas', key: 'tareas', type: 'tasks', title: '¿Qué 3 tareas repites más cada semana?', hint: 'Las que haces una y otra vez. Pon cuántas horas te toman.',
      chips: ['Contestar WhatsApp', 'Pasar datos a Excel', 'Hacer cotizaciones o facturas', 'Agendar citas', 'Publicar en redes', 'Llevar el inventario', 'Cobrar y dar seguimiento'] },
    { id: 'hora', key: 'valor_hora', type: 'choice', title: '¿Cuánto vale una hora de tu tiempo?', hint: 'Un aproximado, en dólares. Lo usamos solo para calcular.',
      options: ['Menos de US$5', 'US$5 a 10', 'US$10 a 25', 'US$25 a 50', 'Más de US$50', 'No sé'] },
    { id: 'varita', key: 'varita', type: 'text', optional: true, title: 'Si tuvieras una varita mágica para resolver UN problema administrativo de tu negocio, ¿cuál sería?', hint: 'Esto nos ayuda a decirte qué automatizar primero. Puedes saltarla.', placeholder: 'Por ejemplo: que los pedidos de WhatsApp pasen solos a mi hoja de ventas' },
    { id: 'software', key: 'software_actual', type: 'text', single: true, optional: true, title: '¿Pagas algún programa que te parezca complicado o al que le falten cosas?', hint: 'Escribe cuál y qué le falta. Puedes saltarla.', placeholder: 'Ej.: mi sistema de facturación, no me deja…' },
    { id: 'pago', key: 'pagaria', type: 'choice', title: 'Si algo resolviera ese problema por ti, ¿cuánto pagarías al mes?', hint: 'Responde con sinceridad: no estamos vendiendo nada ahora.', finishLabel: 'Ver mi resultado',
      options: ['No pagaría', 'Hasta US$10', 'US$10 a 30', 'US$30 a 100', 'Más de US$100'] }
  ],
  ai: { mode: 'plan', blocking: false },
  finishLabel: 'Ver mi resultado',
  renderResult(body, api, _ai) {
    const { A, h } = api;
    const tareas = (A.tareas || []).filter(t => t.t && t.t.trim().length >= 2).map(t => ({ t: t.t.trim(), h: Number(t.h) || 0 }));
    const weekly = tareas.reduce((s, t) => s + t.h, 0), rate = HORA[A.valor_hora] || 10, annualHours = weekly * 52, cost = annualHours * rate, days = Math.round(annualHours / 8);
    A.resultado = { anual_usd: Math.round(cost), horas_semana: Math.round(weekly * 10) / 10, dias: days };
    body.appendChild(h('p', 'tag', 'Tu fuga de tiempo'));
    const L = h('div', 'ledger'); L.appendChild(h('p', 'label', 'Lo que pierdes al año repitiendo lo mismo'));
    const big = h('div', 'big'); const cur = h('span', 'cur', 'US$'); const num = h('span', '', '0'); big.append(cur, num); L.appendChild(big);
    const sub = h('p', 'sub'); sub.innerHTML = `${weekly} h por semana = <b>${days} días de trabajo</b> al año.`; L.appendChild(sub); body.appendChild(L);
    api.countUp(num, cost, money);
    const bars = h('div', 'bars'); const top = Math.max(...tareas.map(t => t.h));
    tareas.forEach(t => bars.appendChild(api.bar(t.t, `${t.h} h/sem · US$${money(t.h * 52 * rate)}/año`, (t.h / top) * 100, t.h === top && tareas.length > 1)));
    body.appendChild(bars);
    const card = h('div', 'card'); card.appendChild(h('h3', '', 'Qué simplificar primero')); const inner = h('div'); inner.appendChild(api.skeleton()); card.appendChild(inner); body.appendChild(card);
    const topTask = tareas.slice().sort((a, b) => b.h - a.h)[0];
    const fallback = () => { inner.textContent = ''; inner.appendChild(h('p', '', `Empieza por «${topTask.t}»: es la que más horas te quita (${topTask.h} h por semana).`)); inner.appendChild(h('p', '', 'Haz hoy una lista de los pasos exactos que repites cada vez. Esa lista es el primer paso para automatizarla.')); };
    api.ai('plan').then(d => {
      inner.textContent = ''; inner.appendChild(h('p', '', d.headline)); const ul = h('ul');
      d.ideas.forEach(i => { const li = h('li'); li.appendChild(h('b', '', i.task)); li.appendChild(document.createTextNode(i.idea)); ul.appendChild(li); }); inner.appendChild(ul);
      const f = h('p'); f.style.marginTop = '12px'; f.innerHTML = '<b>Primer paso para hoy:</b> '; f.appendChild(document.createTextNode(d.first_step)); inner.appendChild(f);
      api.saveAi({ headline: d.headline, first_step: d.first_step }); api.track('ai_ok', { mode: 'plan' });
    }).catch((e) => { fallback(); api.track('ai_failed', { mode: 'plan', status: e.status || 0 }); });
  },
  fine: 'Estimación: horas por semana × 52 × el valor de tu hora. Ajústala a tu realidad.',
  contact: { title: '¿Quieres que te avisemos cuando exista una herramienta para esto?', text: 'Estamos creando herramientas para las tareas que más tiempo quitan. Si dejas tu correo o WhatsApp, te escribimos cuando una sirva para lo tuyo. Es opcional.', thanks: '¡Gracias! Te escribiremos cuando tengamos algo para tus tareas.' }
};
