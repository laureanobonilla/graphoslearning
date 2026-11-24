// «¿Te está dando vuelta?»: banco de preguntas, puntaje y lectura. Todo el puntaje vive AQUÍ (servidor):
// al navegador solo se le mandan los textos de las preguntas y opciones, nunca cuánto pesa cada una.
// Es una estimación de entretenimiento/orientación basada en lo que la persona observa; no es una prueba.

const AREAS = {
    t: 'Tiempo y ausencias',
    c: 'Celular y secretos',
    a: 'Cambios de ánimo',
    i: 'Cercanía e intimidad',
    e: 'Gente y entorno',
    d: 'Detalles y antecedentes'
};

// q: pregunta · a: área · w: peso · o: [[texto, puntos 0-3], ...]   (a === 'x' → no suma a la probabilidad)
const B = [
    { a: 'x', w: 0, q: '¿Qué fue lo primero que te hizo dudar?', o: [['Llega más tarde o desaparece ratos', 0], ['Cuida su celular de una forma distinta', 0], ['Cambió la manera de tratarme', 0], ['Vi o me contaron algo concreto', 0], ['Una corazonada, sin una razón clara', 0], ['Todavía no sé si dudo de verdad', 0]] },
    { a: 't', w: 2, q: 'En una semana normal, ¿cuántas horas pasa tu pareja fuera de la casa sin ti? (sin contar trabajo ni estudio)', o: [['Casi ninguna', 0], ['Entre 1 y 5 horas', 1], ['Entre 6 y 12 horas', 2], ['Más de 12 horas', 3]] },
    { a: 'c', w: 2, q: 'Cuando le suena una notificación estando contigo, ¿qué hace?', o: [['La lee o la contesta sin problema', 0], ['La mira rápido y sigue con lo que hacía', 1], ['Voltea el celular o lo aleja', 2], ['Se va a otro cuarto a contestar', 3]] },
    { a: 't', w: 2, q: 'Cuando llega tarde, ¿cómo lo explica?', o: [['Casi nunca llega tarde', 0], ['Avisa antes y la explicación tiene sentido', 0], ['Avisa, pero cada vez con menos detalles', 1], ['Me da explicaciones distintas cada vez', 3], ['Se molesta si le pregunto', 3]] },
    { a: 'c', w: 2, q: '¿Cambió la clave o el bloqueo de su celular en los últimos meses?', o: [['No que yo sepa', 0], ['Sí, pero me dijo la nueva', 1], ['Sí, y no me la dio', 3], ['Antes la sabía y ahora ya no', 3], ['Nunca la he sabido ni la he pedido', 1]] },
    { a: 'a', w: 2, q: '¿Cómo ha cambiado su ánimo contigo últimamente?', o: [['Está igual que siempre', 0], ['Más irritable por cualquier cosa', 2], ['Más cariñoso/a de repente, sin motivo claro', 2], ['Más distante o frío/a', 3], ['Está aquí, pero como ausente', 2]] },
    { a: 'e', w: 2, q: '¿Hay alguien de quien tu pareja habla distinto que antes?', o: [['No, nadie en particular', 0], ['Un compañero/a de trabajo, nada raro', 1], ['Alguien que antes no mencionaba y ahora nombra mucho', 2], ['Alguien de quien hablaba mucho y dejó de mencionar de golpe', 3]] },
    { a: 'i', w: 2, q: 'Comparada con hace un año, ¿cómo está la intimidad entre ustedes?', o: [['Igual o mejor', 0], ['Un poco menos frecuente', 1], ['Mucho menos, sin una explicación', 3], ['Distinta: cosas nuevas que antes no hacía', 2], ['Evita el contacto cada vez más', 3]] },
    { a: 'c', w: 2, q: '¿Con qué frecuencia lo/la ves sonriendo o escribiendo en el celular y lo guarda cuando te acercas?', o: [['Nunca', 0], ['Algunas veces', 1], ['Seguido', 2], ['Casi siempre que estamos juntos', 3]] },
    { a: 't', w: 2, q: '¿Hay un día u horario en el que es difícil ubicar a tu pareja?', o: [['No, casi siempre sé dónde está', 0], ['A veces tarda en contestar, nada más', 1], ['Sí, hay un horario que se repite', 3], ['Sí, y se molesta si lo menciono', 3]] },
    { a: 'd', w: 1, q: '¿Has notado gastos o movimientos que no logras explicar? (efectivo, tarjeta, regalos, comidas, hospedajes)', o: [['Nada raro', 0], ['Gastos pequeños sin explicación', 1], ['Cargos en lugares que no conozco', 3], ['Cambios en sus finanzas que no quiere aclarar', 3], ['No tengo cómo saberlo', 1]] },
    { a: 'a', w: 1, q: 'Si le haces una pregunta directa sobre dónde estuvo, ¿cómo reacciona?', o: [['Contesta con calma', 0], ['Contesta, pero con prisa', 1], ['Se pone a la defensiva', 2], ['Voltea la pregunta o dice que eres celoso/a', 3], ['Se enoja y cambia de tema', 3]] },
    { a: 'e', w: 2, q: '¿Cambió su círculo de gente en el último año?', o: [['No, son los mismos de siempre', 0], ['Hay gente nueva, y me la presenta', 0], ['Hay gente nueva que no me presenta', 2], ['Sale más con amigos y a mí no me invitan', 2], ['Me deja fuera de planes que antes compartíamos', 3]] },
    { a: 'd', w: 1, q: '¿Cambió su forma de arreglarse o su rutina personal?', o: [['No, igual que siempre', 0], ['Se cuida más, pero lo hace por sí mismo/a', 1], ['Se arregla más sobre todo para salir sin mí', 3], ['Cambió de perfume, ropa o estilo sin explicarlo', 2]] },
    { a: 'c', w: 1, q: 'En redes sociales o chats, ¿has notado algo distinto?', o: [['Nada', 0], ['Ya no sube nada de nosotros', 2], ['Alguien que siempre le da like o le comenta', 2], ['Borra conversaciones o chats', 3], ['Abrió o cerró cuentas sin avisar', 3]] },
    { a: 'x', w: 0, q: 'Pensando en esta duda, ¿cómo la sientes en tu cuerpo?', o: [['Me quita el sueño', 0], ['Me da ansiedad al revisar el celular', 0], ['Me dan ganas de preguntar y me aguanto', 0], ['La siento, pero la mayoría del tiempo puedo seguir normal', 0]] },
    { a: 't', w: 1, q: '¿Cómo son sus viajes, reuniones o salidas «de trabajo»?', o: [['Los conozco y los puedo confirmar', 0], ['Hay más de los normales, pero con sentido', 1], ['Aparecen planes nuevos seguido, con poco detalle', 2], ['Cuando pregunto por detalles, se complican las respuestas', 3]] },
    { a: 'a', w: 1, q: '¿Cómo discuten últimamente?', o: [['Igual que siempre', 0], ['Menos que antes, como si no le importara', 2], ['Me culpa de cosas que antes no le molestaban', 3], ['Más seguido, por detalles pequeños', 2]] },
    { a: 'i', w: 1, q: '¿Cambió la manera en que se expresa cariño entre ustedes?', o: [['No, seguimos igual', 0], ['Menos mensajes o detalles', 1], ['Ya casi no dice «te quiero» o lo dice mecánico', 2], ['Exagera el cariño, como compensando algo', 2]] },
    { a: 'e', w: 1, q: '¿Alguien cercano (amistad, familia) te ha dicho o insinuado algo?', o: [['No, nadie', 0], ['Comentarios vagos, que no sé si tomar en serio', 2], ['Me lo dijeron de frente', 3], ['Sí, pero no confío en quien lo dijo', 1]] },
    { a: 'd', w: 2, q: '¿Ha habido antes una infidelidad de tu pareja, en esta u otra relación?', o: [['No, nunca', 0], ['No lo sé', 1], ['En una relación anterior', 2], ['En esta relación, y lo hablamos', 3]] },
    { a: 'c', w: 1, q: '¿Mantiene el celular en silencio, boca abajo o «no molestar» cuando está contigo?', o: [['No, normal', 0], ['A veces', 1], ['Casi siempre', 2], ['Siempre, y antes no lo hacía', 3]] },
    { a: 't', w: 1, q: '¿Dejó de compartir su ubicación o cambió sus horarios de conexión?', o: [['No, nada cambió', 0], ['No uso eso con mi pareja', 0], ['Dejó de compartirla sin avisar', 3], ['Está «en línea» a horas en que dice dormir o trabajar', 2]] },
    { a: 'i', w: 1, q: 'Cuando hablan del futuro (viajes, casa, planes), ¿cómo responde?', o: [['Con ganas, hace planes conmigo', 0], ['Normal, sin más', 1], ['Cambia de tema o evita compromisos', 2], ['Pone excusas cada vez que se habla del tema', 3]] },
    { a: 'e', w: 1, q: '¿Te incluye en su vida: planes, familia, fotos, amistades?', o: [['Sí, como siempre', 0], ['Menos que antes', 2], ['Rara vez', 3], ['Me presenta como «amigo/a» o evita presentarme', 3]] },
    { a: 'x', w: 1.5, q: 'Si tuvieras que apostar hoy, ¿qué crees que pasa?', o: [['Creo que no pasa nada; estoy inseguro/a', 0], ['No sé qué creer', 1], ['Algo está pasando', 2], ['Estoy casi seguro/a de que me engaña', 3]] },
    { a: 'x', w: 0, q: 'Si se confirmara, ¿qué es lo que más te pesaría?', o: [['La mentira', 0], ['Que fuera alguien cercano', 0], ['Perder la relación', 0], ['No haber hecho caso a mi intuición', 0]] }
];

const N = B.length;

// Versión pública: sin puntajes.
const publicBank = () => B.map((b, i) => ({ n: i + 1, q: b.q, o: b.o.map(x => x[0]) }));

// Valida las respuestas (índices) y las convierte en puntajes.
function normalizar(resp) {
    if (!Array.isArray(resp) || resp.length !== N) return null;
    const out = [];
    for (let i = 0; i < N; i++) {
        const k = Number(resp[i]);
        if (!Number.isInteger(k) || k < 0 || k >= B[i].o.length) return null;
        out.push(k);
    }
    return out;
}

function calcular(resp) {
    const ar = {};
    for (const k of Object.keys(AREAS)) ar[k] = { s: 0, w: 0 };
    let ctxS = 0, ctxW = 0;
    const items = [];
    resp.forEach((k, i) => {
        const b = B[i], pts = b.o[k][1];
        items.push({ i, pts, w: b.w });
        if (b.a === 'x') { if (b.w) { ctxS += (pts / 3) * b.w; ctxW += b.w; } return; }
        ar[b.a].s += (pts / 3) * b.w; ar[b.a].w += b.w;
    });
    const area = {}; let sum = 0, wsum = 0, altas = 0;
    for (const k of Object.keys(AREAS)) {
        const v = ar[k].w ? ar[k].s / ar[k].w : 0;
        area[k] = v; sum += v * ar[k].w; wsum += ar[k].w;
        if (v >= 0.55) altas++;
    }
    let raw = wsum ? sum / wsum : 0;
    // Las señales que se juntan en varias áreas pesan más que una sola aislada.
    raw += Math.max(0, altas - 2) * 0.035;
    // Tu propia intuición pesa poco: es lo que tú crees, no lo que observas.
    const intu = ctxW ? ctxS / ctxW : 0;
    raw = raw * 0.93 + intu * 0.07;
    const pct = Math.max(3, Math.min(92, Math.round(raw * 100 * 1.08)));
    return { pct, area, altas, intu, items };
}

const nivel = (v) => (v >= 0.6 ? 'alto' : v >= 0.3 ? 'medio' : 'bajo');
const banda = (p) => (p >= 70 ? 'Alta' : p >= 45 ? 'Moderada a alta' : p >= 25 ? 'Moderada' : 'Baja');

// Lectura corta por área y nivel. Siempre incluye una explicación alternativa: casi ninguna señal es una prueba.
const TXT = {
    t: {
        alto: 'Hay ausencias largas o poco claras, y las explicaciones no siempre calzan. Eso es una señal que vale la pena observar, pero también aparece en trabajos exigentes, estudios, deudas o problemas que alguien no se atreve a contar.',
        medio: 'Hay algunos huecos de tiempo que no terminas de ubicar. Por sí solos son comunes; lo que importa es si se repiten en un mismo patrón.',
        bajo: 'Sus horarios y salidas, tal como los describes, son bastante claros. En esta área tus respuestas no muestran señales fuertes.'
    },
    c: {
        alto: 'El celular se maneja con mucho cuidado cuando estás cerca. Puede indicar que hay algo que no quiere que veas, pero también ocurre con sorpresas, conversaciones sobre otros temas o simple necesidad de privacidad.',
        medio: 'Hay algunos gestos con el celular que te llaman la atención. Son frecuentes y, solos, no dicen mucho.',
        bajo: 'Su relación con el celular, como la describes, es bastante abierta. Aquí tus respuestas pesan poco.'
    },
    a: {
        alto: 'Hay un cambio de ánimo claro hacia ti: distancia, irritabilidad o culpa que antes no estaba. Es una de las señales más ambiguas, porque el estrés, la depresión o un problema de la relación producen lo mismo.',
        medio: 'Notas algunos cambios de ánimo. Pueden venir de muchas cosas que nada tienen que ver con otra persona.',
        bajo: 'El trato y el ánimo se mantienen parecidos a lo de siempre, según tú. Poca señal en esta área.'
    },
    i: {
        alto: 'Cambió la cercanía entre ustedes: menos contacto, menos cariño o cambios que antes no estaban. Aunque puede tener otras causas (cansancio, salud, rutina), es una de las áreas en las que más conviene hablar.',
        medio: 'Hay algo de enfriamiento o cambio en la cercanía. Es común en etapas de estrés o rutina.',
        bajo: 'La cercanía y el cariño se mantienen, según tus respuestas. Esto juega a favor de la confianza.'
    },
    e: {
        alto: 'Hay cambios en su entorno social y en el lugar que tú ocupas en él. Aquí también pesa lo que otras personas te han insinuado, que muchas veces es solo rumor.',
        medio: 'Hay algunos cambios en su círculo o en cómo te incluye, sin un patrón firme todavía.',
        bajo: 'Te incluye en su vida y su entorno no ha cambiado mucho. Poca señal aquí.'
    },
    d: {
        alto: 'Los detalles (gastos, apariencia, antecedentes) suman puntos. Los antecedentes explican por qué dudas, pero no prueban que algo esté pasando ahora.',
        medio: 'Hay algunos detalles sueltos que te llaman la atención. Por sí mismos, no dicen mucho.',
        bajo: 'Pocos detalles raros y sin antecedentes que pesen. Esta área no preocupa.'
    }
};

function reporte(resp) {
    const r = calcular(resp);
    const areas = Object.keys(AREAS).map(k => ({ k, nombre: AREAS[k], v: Math.round(r.area[k] * 100), nivel: nivel(r.area[k]), texto: TXT[k][nivel(r.area[k])] }))
        .sort((x, y) => y.v - x.v);
    const pesan = r.items.filter(x => x.pts >= 2 && B[x.i].a !== 'x').sort((x, y) => (y.pts * y.w) - (x.pts * x.w) || x.i - y.i).slice(0, 5)
        .map(x => ({ q: B[x.i].q, r: B[x.i].o[resp[x.i]][0], area: AREAS[B[x.i].a] }));
    const favor = r.items.filter(x => x.pts === 0 && B[x.i].a !== 'x' && x.w >= 2).slice(0, 4)
        .map(x => ({ q: B[x.i].q, r: B[x.i].o[resp[x.i]][0] }));
    const doble = resp[N - 1];   // qué le pesaría más
    const pesaria = B[N - 1].o[doble][0];
    return { pct: r.pct, banda: banda(r.pct), altas: r.altas, areas, pesan, favor, pesaria };
}

// Lo único que se ve gratis: sin cifra y sin conclusión.
function gancho(resp) {
    const r = calcular(resp);
    const orden = Object.keys(AREAS).sort((x, y) => r.area[y] - r.area[x]);
    const top = orden[0];
    const notables = Object.keys(AREAS).filter(k => r.area[k] >= 0.3).length;
    const nombre = AREAS[top];
    return {
        conectadas: Math.max(notables, 1),
        inicial: nombre.charAt(0),
        palabras: nombre.split(' ').length,
        total: Object.keys(AREAS).length
    };
}

module.exports = { AREAS, N, publicBank, normalizar, reporte, gancho };
