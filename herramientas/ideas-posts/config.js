// «5 ideas de publicaciones»: la persona cuenta qué vende, la IA escribe 5 publicaciones. La pregunta del desafío es obligatoria (es la que nos interesa).
// Respuestas guardadas: negocio, publico, publico_otro, meta, desafio, desafio_otro, pagaria.
window.HF_CFG = {
  tool: 'ideas-posts', app: 'hf-ideas-posts', brand: 'Ideas de publicaciones',
  intro: { h1: '5 publicaciones listas para tu negocio, en 1 minuto', lead: 'Cuéntanos qué vendes y te escribimos 5 ideas con texto y sugerencia de foto, para copiar y pegar en Facebook o Instagram.', start: 'Quiero mis 5 ideas', facts: ['Gratis', 'Sin registrarte', 'Textos listos para copiar'] },
  steps: [
    { id: 'negocio', key: 'negocio', type: 'text', min: 4, max: 220, title: '¿Qué vendes o qué haces?', hint: 'Con una o dos frases basta.', placeholder: 'Ej.: Vendo postres caseros por encargo en San José', rows: 3 },
    { id: 'publico', key: 'publico', type: 'choice', other: true, title: '¿A quién le quieres vender?', options: ['Mujeres', 'Hombres', 'Familias', 'Jóvenes', 'Empresas', 'Profesionales', 'Personas de mi zona'] },
    { id: 'meta', key: 'meta', type: 'choice', title: '¿Qué quieres lograr con tus publicaciones?', options: ['Que me escriban más por mensaje', 'Vender un producto concreto', 'Que más gente me conozca', 'Que mis clientes vuelvan'] },
    { id: 'desafio', key: 'desafio', type: 'choice', other: true, title: '¿Cuál es tu mayor desafío técnico para vender más hoy?', hint: 'Lo usamos para crear mejores herramientas. Mientras tanto, preparamos tus ideas.', finishLabel: 'Escribir mis 5 ideas',
      options: ['No tengo tiempo de publicar', 'No sé qué publicar', 'No sé usar herramientas de diseño', 'Contesto mensajes a mano y tardo', 'No sé medir qué me funciona', 'Llevo pedidos o citas a mano', 'Cobrar y facturar es un lío', 'Mi página o tienda en línea'] }
  ],
  ai: { mode: 'posts', blocking: true, loadingText: 'Escribiendo tus 5 publicaciones…' }, finishLabel: 'Escribir mis 5 ideas',
  resultQuestion: { key: 'pagaria', title: 'Si una herramienta hiciera esto sola cada semana, ¿cuánto pagarías al mes?', options: ['No pagaría', 'Hasta US$10', 'US$10 a 30', 'US$30 a 100', 'Más de US$100'] },
  renderResult(body, api, data, ctl) {
    const { h } = api; let again = false;
    body.appendChild(h('p', 'tag', 'Tus 5 ideas de publicaciones'));
    (data.posts || []).forEach((p, i) => {
      const c = h('article', 'post'); c.appendChild(h('span', 'ang', p.angle || `Idea ${i + 1}`)); c.appendChild(h('p', 'hk', p.hook)); c.appendChild(h('p', 'cp', p.copy));
      const v = h('p', 'vs'); v.innerHTML = '<b>Foto o video:</b> '; v.appendChild(document.createTextNode(p.visual)); c.appendChild(v);
      const b = h('button', 'btn ghost sm', 'Copiar texto'); b.type = 'button';
      b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(p.hook + '\n\n' + p.copy); b.textContent = '¡Copiado!'; } catch { const ta = document.createElement('textarea'); ta.value = p.hook + '\n\n' + p.copy; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); b.textContent = '¡Copiado!'; } catch { b.textContent = 'Selecciona y copia'; } ta.remove(); } api.track('post_copied', { n: i + 1 }); setTimeout(() => { b.textContent = 'Copiar texto'; }, 1800); });
      c.appendChild(b); body.appendChild(c);
    });
    const more = h('button', 'btn ghost', 'Quiero otras 5 ideas'); more.type = 'button'; more.style.marginBottom = '18px';
    more.addEventListener('click', () => { if (again) return; again = true; api.track('more_clicked', {}); ctl.again(); }); body.appendChild(more);
    api.saveAi({ hooks: (data.posts || []).map(p => p.hook) });
  },
  fine: 'Revisa y ajusta cada texto antes de publicar: pon tus precios, datos y tu estilo.',
  contact: { title: '¿Quieres que te avisemos cuando podamos hacer esto por ti cada semana?', text: 'Estamos creando una herramienta que prepara tus publicaciones sola. Si dejas tu correo o WhatsApp, te avisamos.', thanks: '¡Gracias! Te avisaremos cuando esté lista.' }
};
