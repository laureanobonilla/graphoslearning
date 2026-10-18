# Examen de aptitudes: «Descubre cómo ser mejor profesional y ganar más dinero»

Dos versiones con las mismas 50 preguntas (`aptitud/config.js`). Con 25 respuestas ya se puede terminar; seguir hasta 50 da un resultado más preciso. Hay 9 ejercicios con respuesta correcta (números, lógica y lenguaje); su clave está en `netlify/functions/_lib/qer-prompts/aptitud-es.js` y debe coincidir **letra por letra** con el texto de la pregunta.

## /aptitud/ — versión de pago

Usa el mismo motor y el mismo cobro que «¿Quién eres?» (`qer-shared/qer-app.js`, funciones `qer-*`, precio `QER_PRICE_USD`), con estilo propio (azul noche y verde, sin rojo).

1. Examen → informe generado con IA en 10 partes, todas cerradas.
2. Se ven: el nombre del perfil, la aptitud más fuerte con su puntaje y el título y adelanto de cada parte.
3. **Conocer más** → pantalla «Esto es lo que recibes», con los 4 rubros:
   - Tus aptitudes fuertes y cómo explorarlas (partes 1 a 3)
   - Lo que te frena (parte 4)
   - Cómo aprender lo que necesitas: método, qué aprender primero, ruta de 90 días (partes 5 a 7)
   - Cómo convertirlo en ingresos y tu primer paso (partes 8 a 10)
4. Pago: **pide el correo antes de pagar** (los botones de PayPal no se activan sin un correo válido). El servidor verifica el pago con PayPal, abre el informe en la página y lo manda a ese correo, con copia al dueño.

- Página de prueba del dueño: `/aptitud/prueba/?k=<QER_TEST_KEY>` (respuestas de ejemplo, no cobra, manda el informe a tu correo).
- Para regenerar `index.html` y la prueba después de cambiar la plantilla o los textos: `python3 tools/build_aptitud.py`.

## /aptitud-gratis/ — versión gratis que lleva a Graphikosmos

Mismo examen, resultado corto (función `apt-gratis`): perfil, 5 aptitudes, 2 fortalezas y 4 áreas para ganar más. Una de las 4 siempre es **aprender mejor**, marcada como «Empieza por aquí». Al final propone un tema y el botón **Crear mi mapa mental gratis** lleva a Graphikosmos con el mismo boleto de prueba que usa `/aprender/` desde el anuncio (`hf-save`, tool `aprende`): en computadora a `/?aprende=…`, en teléfono a `/m/?aprende=…`. Un mapa gratis; para más, registro y saldo como siempre.

## Eventos

En la tabla `events`, con `app = 'aptitud'` o `app = 'aptitud-gratis'`.
