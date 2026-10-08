// Textos y preguntas de «¿Quién es tu pareja en realidad?» (ES, sobre tu pareja). Lo lee /qer-shared/qer-app.js.
window.QER_CFG = {
 "app": "quien-es-tu-pareja",
 "lang": "es",
 "locale": "es",
 "format": "paid-partner-es",
 "kind": "partner",
 "freeCount": 3,
 "totalChapters": 10,
 "acts": [
  "Lo que muestra",
  "Lo que calla",
  "Cuando no estás",
  "Lo que necesita",
  "Lo que vive entre ustedes"
 ],
 "t": {
  "doc_title": "¿Quién es tu pareja en realidad?",
  "doc_desc": "Un cuestionario directo sobre la persona que tienes al lado. Al final, una lectura escrita sobre tu pareja, a partir de lo que tú has visto de cerca.",
  "cover_title": "¿Quién es tu pareja en realidad?",
  "cover_sub": "Son 25 preguntas sobre tu pareja, de una en una, que casi nadie se detiene a responder de verdad. Mientras más honestas sean tus respuestas, más te va a sorprender lo que sigue.",
  "cover_meta": "Gratis para empezar · Sin registrarte",
  "btn_start": "Empezar",
  "btn_resume": "Continuar donde quedaste (pregunta {n} de {total})",
  "btn_next": "Siguiente",
  "back_aria": "Anterior",
  "act_label": "Parte {a} de {acts} · {title}",
  "short_hint": "Escribe con libertad. Si prefieres no responder, escribe \"paso\" y sigues.",
  "loading_steps": [
   "Leyendo lo que hay debajo de tus respuestas…",
   "Uniendo lo que contaste en un lado con lo que contaste en otro…",
   "Escribiendo la lectura de tu pareja…",
   "Casi terminada…"
  ],
  "err_retry": "Intentar de nuevo",
  "err_title": "La lectura de tu pareja no pudo terminar de armarse.",
  "err_detail": "Intenta de nuevo en un momento.",
  "locked_intro": "La lectura de tu pareja sigue aquí. Esto es lo que viene:",
  "words": "{n} palabras",
  "pay_commitment": "Ya respondiste {n} preguntas sobre tu pareja",
  "pay_hook": "{n} capítulos de la lectura de tu pareja siguen cerrados",
  "pay_hook_none": "La lectura de tu pareja continúa",
  "pay_price_pre": "Desbloquea los capítulos que faltan por",
  "pay_checking_country": "Preparando el pago…",
  "sinpe_title": "Pago con SINPE Móvil",
  "sinpe_step1": "Haz un SINPE Móvil por {amount} al número {phone}.",
  "sinpe_step2": "Toma una foto o captura del comprobante.",
  "sinpe_step3": "Súbela aquí y la lectura completa se abre al instante.",
  "sinpe_copy": "Copiar número",
  "sinpe_copied": "Número copiado",
  "sinpe_upload": "Subir foto del comprobante",
  "sinpe_receiving": "Recibiendo tu comprobante…",
  "sinpe_bad_file": "Elige una imagen: la foto o captura de tu comprobante.",
  "sinpe_note": "Pago único. Sin cuenta ni tarjeta.",
  "paypal_btn_local": "Pagar {local} con PayPal",
  "paypal_btn_plain": "Pagar {amount} con PayPal",
  "paypal_note_local": "PayPal cobra {amount}; en tu moneda son aprox. {local} al cambio de hoy.",
  "paypal_note_plain": "PayPal cobra {amount}. Puedes pagar con tarjeta o con tu cuenta.",
  "paypal_unavailable": "El pago con PayPal todavía no está disponible en tu país. Escríbeme y te ayudo a desbloquear la lectura.",
  "paypal_opened": "Se abrió PayPal en otra pestaña. La lectura ya se está abriendo…",
  "paypal_blocked": "Tu navegador bloqueó la ventana de PayPal. Permite las ventanas emergentes y toca el botón otra vez.",
  "unlock_error": "No pudimos abrir la lectura en este momento. Intenta de nuevo o escríbeme.",
  "help_lead": "¿Algún problema para pagar? Escríbeme y lo resolvemos; la lectura queda guardada.",
  "help_wa": "WhatsApp",
  "help_mail": "Correo",
  "help_wa_msg": "Hola, quiero desbloquear la lectura de mi pareja{arch}. Mi código es: {id}.",
  "help_mail_subject": "Desbloquear la lectura de mi pareja",
  "skip_btn": "No desbloquear por ahora",
  "skipped_text": "Está bien. Puedes seguir leyendo los capítulos que ya están abiertos.",
  "skipped_help": "Si lo que te frenó fue el pago, escríbeme y lo resolvemos:",
  "reason_title": "¿Qué te frena? Elige una — nos ayuda mucho",
  "reasons": {
   "precio": "Me parece caro",
   "metodo_pago": "No me sirve el método de pago",
   "solo_ver": "Solo quería ver el resultado",
   "sin_interes": "No me interesó seguir"
  },
  "reason_thanks": "Gracias, de verdad.",
  "show_pay_btn": "Volver a ver cómo desbloquear el resto",
  "redo_btn": "Hacer el cuestionario de nuevo",
  "unlocked_badge": "✦ Lectura completa",
  "share_btn": "Compartir el arquetipo de mi pareja",
  "share_text_arch": "Según \"¿Quién es tu pareja en realidad?\", el arquetipo de mi pareja es: {arch}. Descubre el de la tuya.",
  "share_text_generic": "¿Quieres saber quién es en realidad la persona que tienes al lado? Hice este cuestionario sobre mi pareja y me sorprendió.",
  "share_title": "¿Quién es tu pareja en realidad?",
  "copied": "Copiado — pégalo donde quieras compartirlo.",
  "disclaimer": "Esta lectura es una experiencia de reflexión con fines de entretenimiento, inspirada en lo que tú respondiste — no es un diagnóstico psicológico. Refleja tu mirada sobre otra persona, no la verdad sobre ella.",
  "finish_early_note": "Ya llevas lo suficiente para una lectura. Pero cada respuesta más la hace más profunda y más tuya; te animo a llegar hasta el final.",
  "finish_early_btn": "Ya tengo suficiente: ver mi lectura ahora",
  "other_option": "Otra (escríbela)",
  "other_placeholder": "Escribe lo tuyo"
 },
 "questions": [
  {
   "id": "c1",
   "type": "choice",
   "act": 1,
   "prompt": "Cuando tu pareja llega a un lugar con mucha gente, ¿qué hace normalmente?",
   "options": [
    "Saluda a todo el mundo y se suelta enseguida",
    "Busca a alguien conocido y se queda cerca",
    "Se pega a ti y espera a que tú des el primer paso",
    "Observa todo en silencio antes de hablar con alguien",
    "Va directo a la comida, la bebida o el celular",
    "Se vuelve el centro de la conversación",
    "Actúa con seguridad aunque se nota que le cuesta",
    "Busca la salida más cercana y calcula cuánto falta para irse"
   ]
  },
  {
   "id": "c2",
   "type": "choice",
   "act": 1,
   "prompt": "Cuando alguien le pregunta \"¿cómo estás?\", ¿qué suele contestar tu pareja?",
   "options": [
    "\"Bien, todo bien\" y cambia de tema",
    "\"Con sueño\" o \"cansancio\", sin dar más detalles",
    "\"Con mucho trabajo\" o \"mucha carga\"",
    "Cuenta todo con lujo de detalles",
    "Contesta con un chiste",
    "\"Más o menos\", y deja la frase en el aire",
    "Pregunta \"¿y tú?\" para no hablar de sí",
    "Depende de quién pregunte: con unas personas habla en serio y con otras no"
   ]
  },
  {
   "id": "c3",
   "type": "choice",
   "act": 1,
   "prompt": "¿Qué hace tu pareja con más frecuencia solo para quedar bien con alguien?",
   "options": [
    "Dice que sí aunque quiere decir que no",
    "Se ríe de algo que no le da risa",
    "Se guarda su opinión para no discutir",
    "Hace favores que no le tocaban",
    "Exagera lo bien que le va",
    "Da la razón sin estar de acuerdo",
    "Se muestra más amable de lo que se siente",
    "Nada: dice lo que piensa aunque incomode"
   ]
  },
  {
   "id": "c4",
   "type": "choice",
   "act": 1,
   "prompt": "Si tuvieras que describir en una palabra la imagen que tu pareja da ante los demás, ¿cuál se acerca más?",
   "options": [
    "Seguridad",
    "Simpatía",
    "Calma",
    "Fortaleza",
    "Independencia",
    "Perfección",
    "Humor",
    "Reserva",
    "Generosidad",
    "Tranquilidad total, como si nada le afectara"
   ]
  },
  {
   "id": "q1",
   "type": "short",
   "act": 1,
   "prompt": "Termina la frase: \"La gente cree que mi pareja es..., pero en realidad es...\"",
   "placeholder": "Las dos partes, aunque no calcen"
  },
  {
   "id": "c5",
   "type": "choice",
   "act": 2,
   "prompt": "¿Qué tema esquiva más tu pareja cuando sale en una conversación?",
   "options": [
    "El dinero",
    "Su familia",
    "Su pasado",
    "Sus planes a futuro",
    "Lo que siente",
    "Su salud o su cansancio",
    "Alguna persona en particular",
    "Los problemas entre ustedes",
    "El trabajo",
    "Ninguno: habla de todo con naturalidad"
   ]
  },
  {
   "id": "c6",
   "type": "choice",
   "act": 2,
   "prompt": "Cuando algo le duele de verdad, ¿qué hace tu pareja en los primeros minutos?",
   "options": [
    "Se queda en silencio",
    "Se pone a hacer cosas para distraerse",
    "Se aísla en otro cuarto o sale a caminar",
    "Hace una broma",
    "Se enoja con quien tenga cerca",
    "Se guarda el problema y después lo cuenta",
    "Se pone a escuchar música o a mirar el celular",
    "Llora o busca un abrazo",
    "Habla de inmediato, sin guardarse nada",
    "Dice que está bien aunque se nota que no"
   ]
  },
  {
   "id": "c7",
   "type": "choice",
   "act": 2,
   "prompt": "¿Qué mentira piadosa te dice tu pareja con más frecuencia?",
   "options": [
    "\"No pasa nada\"",
    "\"Estoy bien\"",
    "\"No me molesta\"",
    "\"Ya casi llego\"",
    "\"Me encantó\" (un regalo, una comida, un plan)",
    "\"No me pasa nada con eso\"",
    "\"No tengo hambre\" o \"no necesito nada\"",
    "\"No es importante\"",
    "\"Luego te cuento\"",
    "Casi nunca me miente, ni siquiera de forma piadosa"
   ]
  },
  {
   "id": "c8",
   "type": "choice",
   "act": 2,
   "prompt": "¿Qué es lo que más le cuesta perdonar a tu pareja en los demás?",
   "options": [
    "Una mentira",
    "Una traición",
    "Que lo dejen a solas cuando necesitaba compañía",
    "Una falta de respeto",
    "Que no cumplan lo que prometieron",
    "Que lo/la ignoren",
    "La indiferencia",
    "Que hablen mal a sus espaldas",
    "Que lo/la comparen con otras personas",
    "Casi todo lo perdona, aunque le deje una marca"
   ]
  },
  {
   "id": "q2",
   "type": "short",
   "act": 2,
   "prompt": "¿Qué es lo que nunca te ha dicho y sientes que está ahí, entre ustedes?",
   "placeholder": "Una sola línea basta"
  },
  {
   "id": "c9",
   "type": "choice",
   "act": 3,
   "prompt": "¿Qué suele hacer tu pareja cuando cree que nadie la está mirando?",
   "options": [
    "Cantar o bailar",
    "Mirar el celular durante horas",
    "Hablar a solas o ensayar conversaciones",
    "Comer lo que normalmente no come",
    "Quedarse mirando a la nada",
    "Ordenar o limpiar sin parar",
    "Ver videos o series que nunca reconocería",
    "Revisar sus redes o mensajes una y otra vez",
    "Dormir o descansar de verdad",
    "Es exactamente igual con público que sin público"
   ]
  },
  {
   "id": "c10",
   "type": "choice",
   "act": 3,
   "prompt": "Cuando tu pareja pasa un rato a solas, ¿cómo imaginas que es?",
   "options": [
    "En paz y feliz de tener silencio",
    "Se aburre y busca con quién hablar",
    "Se pone a pensar demasiado",
    "Aprovecha para hacer lo que más le gusta",
    "Siente soledad aunque no lo diga",
    "Su creatividad se despierta",
    "Se descuida: no come, no duerme bien",
    "Se pone a recordar el pasado",
    "Se pone triste y no lo muestra",
    "No tengo idea: a solas es un misterio para mí"
   ]
  },
  {
   "id": "c11",
   "type": "choice",
   "act": 3,
   "prompt": "Comparada con cómo es contigo, ¿cómo es tu pareja con su familia o sus amistades?",
   "options": [
    "Con más alegría y más suelto",
    "Con más seriedad y reserva",
    "Igual que conmigo",
    "Más humor y más ocurrencias",
    "Mucho más en silencio, casi irreconocible",
    "Cuidando y midiendo cada palabra",
    "Con más dureza o frialdad",
    "Más cariño y más expresividad",
    "Como si volviera a otra época",
    "Más esfuerzo por quedar bien, casi perfecto"
   ]
  },
  {
   "id": "c12",
   "type": "choice",
   "act": 3,
   "prompt": "Cuando discuten, ¿qué hace tu pareja con más frecuencia?",
   "options": [
    "Se queda en silencio",
    "Sube el tono",
    "Se va del lugar",
    "Cambia de tema o hace una broma",
    "Da la razón para terminar rápido",
    "Recuerda cosas del pasado",
    "Se explica con mucha calma",
    "Llora",
    "Se cierra y tarda días en volver a hablar",
    "Busca resolverlo en el momento y abrazarse después"
   ]
  },
  {
   "id": "q3",
   "type": "short",
   "act": 3,
   "prompt": "¿Qué guarda tu pareja (un objeto, un mensaje, una foto, un recuerdo) que no ha podido soltar?",
   "placeholder": "Lo que sabes que conserva"
  },
  {
   "id": "c13",
   "type": "choice",
   "act": 4,
   "prompt": "¿Qué detalle pequeño hace que tu pareja sienta que le importa a alguien?",
   "options": [
    "Que le pregunten cómo le fue",
    "Un mensaje sin motivo",
    "Que recuerden algo que dijo hace tiempo",
    "Que le preparen su comida favorita",
    "Un abrazo largo",
    "Que le escuchen sin interrumpir",
    "Que le den su espacio sin reproches",
    "Un regalo pequeño e inesperado",
    "Que le digan que está haciendo un buen trabajo",
    "Que simplemente se queden a su lado en silencio"
   ]
  },
  {
   "id": "c14",
   "type": "choice",
   "act": 4,
   "prompt": "¿Qué carga tu pareja por los demás que nadie le pidió cargar?",
   "options": [
    "Las preocupaciones de la familia",
    "El dinero de la casa",
    "Mantener la paz en todo momento",
    "Los problemas de sus amistades",
    "Las expectativas de sus padres",
    "Ser siempre quien resuelve",
    "Cuidar el ánimo de todos",
    "Que todo salga bien en el trabajo",
    "Los errores de otras personas",
    "No carga nada de más: sabe soltar"
   ]
  },
  {
   "id": "c15",
   "type": "choice",
   "act": 4,
   "prompt": "¿Qué cosa buena le cuesta más aceptar a tu pareja?",
   "options": [
    "Un elogio",
    "Un regalo",
    "Que le cuiden",
    "Descansar sin sentir culpa",
    "Pedir ayuda",
    "Un éxito",
    "Que le digan \"te quiero\"",
    "Ser el centro de atención",
    "Que las cosas salgan fáciles",
    "Nada: acepta lo bueno con gusto"
   ]
  },
  {
   "id": "c16",
   "type": "choice",
   "act": 4,
   "prompt": "¿Cuándo se le nota a tu pareja más en paz y más al natural?",
   "options": [
    "Con una persona en particular",
    "En la naturaleza o en la calle",
    "En su casa, en pijama",
    "Cocinando o haciendo algo con las manos",
    "Escuchando música",
    "Con niños o con animales",
    "Cuando termina un día de trabajo",
    "Cuando está contigo, sin nadie más",
    "De viaje, lejos de la rutina",
    "Casi nunca: siempre parece en alerta"
   ]
  },
  {
   "id": "q4",
   "type": "short",
   "act": 4,
   "prompt": "¿Qué necesita tu pareja que alguien le diga y crees que nunca le han dicho?",
   "placeholder": "Las palabras exactas, en una línea"
  },
  {
   "id": "c17",
   "type": "choice",
   "act": 5,
   "prompt": "¿Qué es lo que más admiras de tu pareja?",
   "options": [
    "Su forma de reírse",
    "Su fuerza",
    "Su honestidad",
    "Su paciencia",
    "Su inteligencia",
    "Su generosidad",
    "Cómo se levanta después de caer",
    "Su manera de cuidar a los suyos",
    "Su creatividad",
    "Su calma en los momentos difíciles"
   ]
  },
  {
   "id": "c18",
   "type": "choice",
   "act": 5,
   "prompt": "¿Qué te cuesta más decirle a tu pareja?",
   "options": [
    "Que me hizo daño algo que dijo",
    "Que necesito más tiempo juntos",
    "Que necesito más tiempo para mí",
    "Que me preocupa su manera de afrontar algo",
    "Que no estoy de acuerdo",
    "Que estoy con poca energía",
    "Que tengo miedo de algo",
    "Lo mucho que le quiero",
    "Una disculpa pendiente",
    "Nada: le digo todo lo que pienso"
   ]
  },
  {
   "id": "c19",
   "type": "choice",
   "act": 5,
   "prompt": "Cuando se hace un silencio largo entre ustedes, ¿qué suele pasar?",
   "options": [
    "Es un silencio cómodo, de los que se disfrutan",
    "Alguien rompe el hielo con un chiste",
    "Me pongo a adivinar qué le pasa",
    "Siento que debo medir lo que digo",
    "Cada quien se va a su teléfono",
    "Uno de los dos se va a otro cuarto",
    "Esperamos a que se pase solo",
    "Hablamos y aclaramos las cosas",
    "Se vuelve más tenso con las horas",
    "Casi nunca nos quedamos en silencio"
   ]
  },
  {
   "id": "c20",
   "type": "choice",
   "act": 5,
   "prompt": "¿Qué tema se repite en sus discusiones sin llegar a resolverse?",
   "options": [
    "El dinero",
    "El tiempo que pasan juntos",
    "Las tareas de la casa",
    "La familia de alguno de los dos",
    "Los celos o la confianza",
    "La forma de comunicarse",
    "Los planes a futuro",
    "Los hábitos o costumbres de cada quien",
    "Cosas del pasado que reaparecen",
    "No se repite ninguno: lo que discutimos queda resuelto"
   ]
  },
  {
   "id": "q5",
   "type": "short",
   "act": 5,
   "prompt": "Última pregunta: si esta lectura pudiera decirte una sola cosa que necesitas oír sobre tu pareja o sobre lo que viven juntos, ¿cuál sería?",
   "placeholder": "Lo que más necesitas escuchar"
  }
 ],
 "finishEarlyAfter": 15
};
