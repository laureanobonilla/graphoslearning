// Textos y preguntas de «¿Quién eres en realidad?» (ES, sobre ti). Lo lee /qer-shared/qer-app.js.
window.QER_CFG = {
 "app": "quien-eres",
 "lang": "es",
 "locale": "es",
 "format": "paid-self-es",
 "kind": "self",
 "freeCount": 3,
 "totalChapters": 10,
 "acts": [
  "Lo que muestras",
  "Lo que callas",
  "Cuando nadie ve",
  "Lo que necesitas",
  "Lo que viene"
 ],
 "t": {
  "doc_title": "¿Quién eres en realidad?",
  "doc_desc": "Un cuestionario directo que no te deja escapar con respuestas fáciles. Al final, una lectura escrita para ti — no para cualquiera.",
  "cover_title": "¿Quién eres en realidad?",
  "cover_sub": "No es un test cualquiera. Son 25 preguntas, de una en una, que casi nadie se atreve a responder de verdad. Mientras más verdad pongas, más te va a sorprender lo que sigue.",
  "cover_meta": "Gratis para empezar · Sin registrarte",
  "btn_start": "Empezar",
  "btn_resume": "Continuar donde quedaste (pregunta {n} de {total})",
  "btn_next": "Siguiente",
  "back_aria": "Anterior",
  "act_label": "Parte {a} de {acts} · {title}",
  "short_hint": "Escribe con libertad. Si prefieres no responder, escribe \"paso\" y sigues.",
  "loading_steps": [
   "Leyendo lo que hay debajo de tus respuestas…",
   "Uniendo lo que dijiste en un lado con lo que dijiste en otro…",
   "Escribiendo tu lectura…",
   "Casi lista…"
  ],
  "err_retry": "Intentar de nuevo",
  "err_title": "Tu lectura no pudo terminar de armarse.",
  "err_detail": "Intenta de nuevo en un momento.",
  "locked_intro": "Tu lectura sigue aquí. Esto es lo que viene:",
  "words": "{n} palabras",
  "pay_commitment": "Ya respondiste {n} preguntas sobre ti",
  "pay_hook": "{n} capítulos de tu lectura siguen cerrados",
  "pay_hook_none": "Tu lectura continúa",
  "pay_price_pre": "Desbloquea los capítulos que faltan por",
  "pay_checking_country": "Preparando el pago…",
  "sinpe_title": "Pago con SINPE Móvil",
  "sinpe_step1": "Haz un SINPE Móvil por {amount} al número {phone}.",
  "sinpe_step2": "Toma una foto o captura del comprobante.",
  "sinpe_step3": "Súbela aquí y tu lectura completa se abre al instante.",
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
  "paypal_unavailable": "El pago con PayPal todavía no está disponible en tu país. Escríbeme y te ayudo a desbloquear tu lectura.",
  "paypal_opened": "Se abrió PayPal en otra pestaña. Tu lectura ya se está abriendo…",
  "paypal_blocked": "Tu navegador bloqueó la ventana de PayPal. Permite las ventanas emergentes y toca el botón otra vez.",
  "unlock_error": "No pudimos abrir tu lectura en este momento. Intenta de nuevo o escríbeme.",
  "help_lead": "¿Algún problema para pagar? Escríbeme y lo resolvemos; tu lectura queda guardada.",
  "help_wa": "WhatsApp",
  "help_mail": "Correo",
  "help_wa_msg": "Hola, quiero desbloquear mi lectura{arch}. Mi código es: {id}.",
  "help_mail_subject": "Desbloquear mi lectura",
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
  "share_btn": "Compartir mi arquetipo",
  "share_text_arch": "Según \"¿Quién eres en realidad?\", mi arquetipo es: {arch}. Descúbrelo tú también.",
  "share_text_generic": "¿Quieres saber quién se esconde detrás de tu máscara? Hice este cuestionario y me sorprendió.",
  "share_title": "¿Quién eres en realidad?",
  "copied": "Copiado — pégalo donde quieras compartirlo.",
  "disclaimer": "Esta lectura es una experiencia de autoconocimiento con fines de entretenimiento, inspirada en tus respuestas — no es un diagnóstico psicológico.",
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
   "prompt": "Cuando llegas a un lugar con mucha gente, ¿qué haces primero?",
   "options": [
    "Saludo a todos y animo el ambiente",
    "Busco a alguien conocido y me pego a esa persona",
    "Me voy a un rincón a observar",
    "Reviso el celular para tener algo que hacer",
    "Me ofrezco a ayudar en algo para tener una función",
    "Hago un chiste para romper el hielo",
    "Me quedo cerca de la puerta por si quiero irme",
    "Aparento seguridad aunque por dentro me tiemble todo",
    "Escucho primero y hablo cuando ya me ubiqué"
   ]
  },
  {
   "id": "c2",
   "type": "choice",
   "act": 1,
   "prompt": "Si alguien que te conoce poco tuviera que describirte con una sola palabra, ¿cuál sería la más probable?",
   "options": [
    "Simpático",
    "Serio",
    "Tranquilo",
    "Responsable",
    "Reservado",
    "Divertido",
    "Amable",
    "Intenso",
    "Distante",
    "Confiable"
   ]
  },
  {
   "id": "c3",
   "type": "choice",
   "act": 1,
   "prompt": "Alguien te pide un favor que no te conviene. ¿Qué haces?",
   "options": [
    "Digo que sí y luego me arrepiento",
    "Digo que sí y lo hago con gusto",
    "Pongo una excusa",
    "Digo que lo pienso y desaparezco",
    "Digo que no sin rodeos",
    "Acepto, pero lo hago a medias",
    "Pregunto a otra persona qué haría en mi lugar",
    "Digo que sí y me lo cobro después en silencio"
   ]
  },
  {
   "id": "c4",
   "type": "choice",
   "act": 1,
   "prompt": "Alguien te pregunta «¿cómo estás?» y no estás bien. ¿Qué contestas normalmente?",
   "options": [
    "«Bien, ¿y tú?»",
    "«Con mucho trabajo, pero aquí vamos»",
    "Cuento un resumen alegre del día",
    "Cambio de tema rápido",
    "Hago un chiste",
    "Digo la verdad completa",
    "Digo la verdad a medias",
    "«Ahí, como siempre»",
    "Respondo con otra pregunta"
   ]
  },
  {
   "id": "q1",
   "type": "short",
   "act": 1,
   "prompt": "Termina la frase: «La gente cree que soy…, pero en realidad soy…»",
   "placeholder": "Las dos partes, aunque no calcen"
  },
  {
   "id": "c5",
   "type": "choice",
   "act": 2,
   "prompt": "Algo de una persona cercana te molestó. ¿Qué haces con eso?",
   "options": [
    "Lo digo en el momento",
    "Lo digo días después, ya más tranquilo",
    "Lo escribo, pero no lo envío",
    "Me lo guardo y me alejo un poco",
    "Se lo cuento a otra persona",
    "Lo digo en broma",
    "Lo dejo pasar hasta que exploto",
    "Cambio mi trato sin explicar por qué",
    "Hago como si nada"
   ]
  },
  {
   "id": "c6",
   "type": "choice",
   "act": 2,
   "prompt": "De todo lo que sientes, ¿qué es lo que más te callas?",
   "options": [
    "Que necesito ayuda",
    "Que estoy triste",
    "Que algo me dio miedo",
    "Que me dolió un comentario",
    "Que admiro a alguien",
    "Que quiero algo distinto de lo que tengo",
    "Que estoy enojado",
    "Que extraño a alguien",
    "Que me da vergüenza algo que hice"
   ]
  },
  {
   "id": "c7",
   "type": "choice",
   "act": 2,
   "prompt": "¿Cuál de estas frases te cruza la cabeza más seguido sin que la digas?",
   "options": [
    "«No quiero molestar»",
    "«Nadie lo haría como yo»",
    "«Ya se me pasará»",
    "«Ojalá se den cuenta solos»",
    "«No es para tanto»",
    "«¿Y si me equivoco?»",
    "«Ojalá alguien me preguntara de verdad»",
    "«No me toca quejarme»",
    "«Ya no puedo más con esto»"
   ]
  },
  {
   "id": "c8",
   "type": "choice",
   "act": 2,
   "prompt": "Cuando algo te duele, ¿qué se nota por fuera?",
   "options": [
    "Trabajo más",
    "Duermo o me aíslo",
    "Me distraigo con comida o con el celular",
    "Salgo a caminar o hago ejercicio",
    "Hago bromas",
    "Me ocupo de los problemas de otros",
    "Lloro a solas",
    "Me pongo irritable",
    "Salgo de fiesta",
    "Hago planes para el futuro y no miro el presente"
   ]
  },
  {
   "id": "q2",
   "type": "short",
   "act": 2,
   "prompt": "Completa sin pensarlo mucho: «Lo que más me cuesta perdonar en alguien es…»",
   "placeholder": "Lo primero que se te venga"
  },
  {
   "id": "c9",
   "type": "choice",
   "act": 3,
   "prompt": "Un sábado sin planes, sin obligaciones y sin que nadie sepa de ti. ¿Qué haces de verdad?",
   "options": [
    "Me quedo en cama",
    "Veo series una tras otra",
    "Ordeno y limpio",
    "Salgo a caminar sin rumbo",
    "Cocino algo rico",
    "Reviso redes sin parar",
    "Avanzo trabajo pendiente",
    "Me dedico a un pasatiempo",
    "Hablo con alguien por horas",
    "Duermo casi todo el día"
   ]
  },
  {
   "id": "c10",
   "type": "choice",
   "act": 3,
   "prompt": "Por fin estás solo en casa. ¿Qué cambia en ti?",
   "options": [
    "Me relajo y me suelto",
    "Pongo música alta y canto",
    "Siento un vacío",
    "Pienso en lo que pasó durante el día",
    "Hablo conmigo en voz alta",
    "Reviso el celular esperando mensajes",
    "Me pongo a ordenar",
    "No cambia nada, soy igual",
    "Me siento más ligero",
    "Me siento solo"
   ]
  },
  {
   "id": "c11",
   "type": "choice",
   "act": 3,
   "prompt": "¿Qué sueles hacer a escondidas?",
   "options": [
    "Comer lo que «no debería»",
    "Revisar perfiles de gente de mi pasado",
    "Releer mensajes viejos",
    "Ensayar conversaciones en mi cabeza",
    "Llorar",
    "Gastar en cosas que no cuento",
    "Imaginar otra vida",
    "Escribir cosas que nadie lee",
    "Posponer lo importante",
    "Nada: soy igual en público y en privado"
   ]
  },
  {
   "id": "c12",
   "type": "choice",
   "act": 3,
   "prompt": "¿Qué pensamiento te visita más justo antes de dormir?",
   "options": [
    "Lo que debí haber dicho",
    "Todo lo que me falta por hacer",
    "Lo que los demás pueden pensar de mí",
    "Una persona que extraño",
    "El miedo a lo que viene",
    "Un recuerdo muy viejo",
    "Ideas y planes nuevos",
    "Nada, me duermo enseguida",
    "Si estoy haciendo bien mi vida",
    "Las preocupaciones de dinero"
   ]
  },
  {
   "id": "q3",
   "type": "short",
   "act": 3,
   "prompt": "Termina la frase: «Si de verdad nadie fuera a enterarse, por fin me atrevería a…»",
   "placeholder": "Lo que hoy no te permites"
  },
  {
   "id": "c13",
   "type": "choice",
   "act": 4,
   "prompt": "Tuviste un día muy pesado. ¿Qué te vendría mejor?",
   "options": [
    "Que alguien me abrace sin preguntar nada",
    "Que me escuchen sin darme consejos",
    "Estar solo en silencio",
    "Que alguien me diga que lo hice bien",
    "Que me quiten una tarea de encima",
    "Salir a distraerme",
    "Un plan claro para resolverlo",
    "Dormir",
    "Que alguien se encargue de mí un rato",
    "Que me dejen en paz"
   ]
  },
  {
   "id": "c14",
   "type": "choice",
   "act": 4,
   "prompt": "¿Qué es lo que más te cuesta pedir?",
   "options": [
    "Ayuda",
    "Un abrazo",
    "Perdón",
    "Tiempo para mí",
    "Dinero prestado",
    "Que me escuchen",
    "Que me incluyan o me elijan",
    "Que me digan que me quieren",
    "Descanso",
    "Un favor grande"
   ]
  },
  {
   "id": "c15",
   "type": "choice",
   "act": 4,
   "prompt": "Alguien te cuida o te elogia de verdad. ¿Qué sientes?",
   "options": [
    "Incomodidad",
    "Ganas de devolver el favor enseguida",
    "Lo disfruto sin más",
    "Pienso que se equivoca conmigo",
    "Pena",
    "Desconfianza, ¿qué querrá?",
    "Quiero más",
    "Cambio de tema",
    "Me emociono, pero lo disimulo",
    "Ganas de llorar"
   ]
  },
  {
   "id": "c16",
   "type": "choice",
   "act": 4,
   "prompt": "¿Qué detalle te hace sentir que le importas a alguien?",
   "options": [
    "Que recuerde algo pequeño sobre mí",
    "Que me busque sin motivo",
    "Que me diga palabras claras de cariño",
    "Que me ayude en algo concreto",
    "Que me regale su tiempo",
    "Que me abrace",
    "Que me defienda",
    "Que me deje ser como soy",
    "Que me pregunte cómo estoy y espere la respuesta",
    "Que me confíe un secreto"
   ]
  },
  {
   "id": "q4",
   "type": "short",
   "act": 4,
   "prompt": "¿Qué haces por los demás que casi nadie te agradece?",
   "placeholder": "Algo que ya haces sin pensar"
  },
  {
   "id": "c17",
   "type": "choice",
   "act": 5,
   "prompt": "Dentro de cinco años, ¿qué te gustaría que fuera distinto?",
   "options": [
    "Mi trabajo o mis estudios",
    "Mi relación de pareja",
    "Mi relación con mi familia",
    "El lugar donde vivo",
    "Mi salud",
    "La forma en que me trato",
    "Mi situación de dinero",
    "Mis amistades",
    "Cómo uso mi tiempo libre",
    "Nada, estoy bien así"
   ]
  },
  {
   "id": "c18",
   "type": "choice",
   "act": 5,
   "prompt": "¿Qué te frena más para cambiar eso?",
   "options": [
    "El miedo a equivocarme",
    "La falta de dinero",
    "La falta de tiempo",
    "Lo que dirían los demás",
    "La costumbre",
    "El cansancio",
    "No saber por dónde empezar",
    "Las personas que dependen de mí",
    "No creer que me lo merezco",
    "Esperar el momento perfecto"
   ]
  },
  {
   "id": "c19",
   "type": "choice",
   "act": 5,
   "prompt": "Si hoy pudieras soltar una sola cosa para siempre, ¿cuál sería?",
   "options": [
    "Una culpa",
    "Un resentimiento",
    "La necesidad de agradar",
    "El miedo a fallar",
    "Una relación",
    "Un trabajo o una responsabilidad",
    "El perfeccionismo",
    "La necesidad de controlarlo todo",
    "La nostalgia",
    "Una promesa que ya no quiero cumplir"
   ]
  },
  {
   "id": "c20",
   "type": "choice",
   "act": 5,
   "prompt": "¿Qué te gustaría que digan de ti dentro de muchos años?",
   "options": [
    "Que ayudé a mucha gente",
    "Que fui auténtico",
    "Que fui valiente",
    "Que hice reír a los demás",
    "Que fui constante",
    "Que cuidé a los míos",
    "Que creé algo que duró",
    "Que fui libre",
    "Que dejé paz a mi alrededor",
    "Que logré lo que quería"
   ]
  },
  {
   "id": "q5",
   "type": "short",
   "act": 5,
   "prompt": "Última pregunta: si esta lectura pudiera decirte una sola cosa que necesitas oír, ¿cuál sería?",
   "placeholder": "Lo que más necesitas escuchar"
  }
 ],
 "finishEarlyAfter": 15
};
