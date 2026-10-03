# ¿Quién eres en realidad?

Cuestionario de 16 preguntas (mezcla de opción única, respuesta corta y "una
palabra a partir de una imagen") que termina en una lectura de personalidad
generada con IA a partir de las respuestas reales de la persona. Se muestra
gratis el inicio de la lectura; el resto se desbloquea con un pago único de
$2.99 (ajustable) vía PayPal, sin necesidad de crear cuenta.

**Esta app vive dentro del mismo sitio de Netlify que Graphikosmos.** No es
un sitio aparte: es esta carpeta (`quien-eres/`), servida en la misma URL
del sitio, en la ruta `/quien-eres/`. Por ejemplo, si Graphikosmos está en
`https://tu-sitio.netlify.app/`, esta app queda en
`https://tu-sitio.netlify.app/quien-eres/` — esa es la URL que se promociona.

## Por qué no es un sitio separado

Netlify sirve cualquier carpeta estática dentro del sitio publicado sin
configuración extra (no hay un catch-all de SPA que lo bloquee), así que
agregar una app nueva es tan simple como agregar una carpeta con su propio
`index.html`. Esto evita:

- Crear y mantener un sitio de Netlify nuevo.
- Copiar a mano las variables de entorno (`GEMINI_API_KEY`,
  `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`) en un sitio
  aparte — aquí ya están configuradas para Graphikosmos y esta app las
  reutiliza directamente.
- Pagar o administrar un dominio/sitio adicional.

## Qué se reutiliza de Graphikosmos (y qué es nuevo)

- **PayPal**: las funciones de esta app (`qer-paypal-config.js`,
  `qer-paypal-create-order.js`, `qer-paypal-capture-order.js`) usan
  `netlify/functions/_lib/paypal.js` — el mismo archivo que ya usa
  Graphikosmos, sin duplicar código. El patrón de "nunca confiar en lo que
  diga el navegador sobre el precio o si se pagó" es el mismo: el precio
  vive solo en el servidor (`_lib/qer-pricing.js`) y la captura se vuelve a
  verificar contra PayPal antes de entregar nada.
- **Gemini**: `qer-generate-reading.js` reutiliza el mismo patrón que ya
  usa Graphikosmos (paquete `@google/genai`, misma idea de lista de
  modelos con reintento automático si uno está saturado).
- **Nuevo, solo para esta app**: todas las funciones y archivos de esta app
  llevan el prefijo `qer-` (de "¿Quién Eres en Realidad?") precisamente
  para poder convivir en la misma carpeta `netlify/functions/` que las
  funciones de Graphikosmos sin pisarse los nombres.
- **Lo que NO se reutilizó, a propósito**: el login con Netlify Identity y
  el saldo de nodos en Supabase de Graphikosmos. Aquí no hace falta
  cuenta — el "producto" es una sola lectura, identificada por un id
  (`readingId`), no un saldo permanente — así que se usa **Netlify Blobs**
  (`@netlify/blobs`, ya agregado a `package.json` del sitio) en vez de una
  base de datos: no requiere ninguna configuración aparte, funciona solo
  con desplegar.

## Variable de entorno nueva (solo para esta app)

Una sola variable nueva, opcional, se agrega a las que ya tiene el sitio:

| Variable | Para qué | Si no se pone |
|---|---|---|
| `READING_PRICE_USD` | Precio de la lectura completa | Usa `2.99` por defecto |

No hace falta tocar `GEMINI_API_KEY`, `PAYPAL_CLIENT_ID`,
`PAYPAL_CLIENT_SECRET` ni `PAYPAL_ENV` — ya existen en el sitio para
Graphikosmos y esta app los lee directamente.

## Al desplegar

Netlify detecta `netlify/functions/` del sitio automáticamente (ya está en
el `netlify.toml`/configuración existente de Graphikosmos). No hace falta
ningún paso extra más allá de que la carpeta `quien-eres/` y las nuevas
funciones `qer-*` queden dentro del mismo despliegue.

## Antes de cobrar de verdad

- Probar primero con `PAYPAL_ENV=sandbox` y una cuenta de prueba de PayPal
  Developer, para confirmar que crear orden → aprobar → capturar →
  desbloquear la lectura funciona de punta a punta.
- Esta sesión no tiene forma de abrir un navegador real para ver cómo se
  ve/siente la app (ni de probar el SDK de PayPal, que corre en el
  navegador) — se construyó con cuidado pero sin verificación visual.
  Antes de compartirla, ábrela en tu teléfono y hacé el cuestionario
  completo al menos una vez, incluyendo un pago de prueba en sandbox.
- `@netlify/blobs` guarda cada lectura por 24 horas (ver `TTL_MS` en
  `_lib/qer-readings-store.js`) — si alguien hace el cuestionario y tarda
  más de un día en decidir pagar, tendría que hacerlo de nuevo. Se puede
  alargar ese número si hace falta.

## Decisiones que tomé por mi cuenta (cambiables)

- **16 preguntas en vez de 10**: a propósito, para que responder sea un
  pequeño esfuerzo — cuanto más invierte la persona antes de llegar al
  resultado, más intolerable le resulta no saber qué dice la lectura al
  final. Las preguntas nuevas (2 de opción única, 2 de respuesta corta, 2
  de imagen) siguen el mismo criterio que las originales: cada una debería
  revelar algo que la persona no sabía que estaba respondiendo.
- **Precio: $2.99** — un precio de impulso, pensado para que decidir pagar
  sea una decisión pequeña. Cambialo con `READING_PRICE_USD` sin tocar
  código.
- **Sin cuenta ni email**: minimiza la fricción para comprar rápido, pero
  también significa que no hay forma de recuperar una lectura ya pagada si
  se pierde el `readingId` (ej. se cierra la pestaña a media lectura). Si
  prefieres poder reenviarle la lectura a alguien por correo más tarde,
  habría que agregar un campo de email opcional antes de pagar.
- **Diseño**: estética "a la luz de una vela" (tinta/berenjena oscura,
  acentos en bronce envejecido, un rojo vino SOLO en el momento de pago)
  con una máscara agrietada como motivo — tomado literalmente de tu propia
  idea ("quién se esconde detrás de tu máscara").
- **Tono de la lectura**: le pedí a la IA que use detalles concretos de
  las respuestas reales (no genérico tipo horóscopo) y que nunca use
  etiquetas clínicas ("trastorno", "patología", etc.) — esto es
  entretenimiento/autoconocimiento, no una evaluación psicológica real, y
  así se lo dice también a quien hace el cuestionario, abajo de la
  lectura.

## Ideas para una colección de apps parecidas

Ver la sección correspondiente en `LEEME_ETAPA_2.md` (en la raíz del
proyecto) para un listado de otras apps de cuestionario/revelación que
podrían reutilizar exactamente esta misma plataforma (PayPal + Gemini +
Netlify Blobs) con el mismo patrón de pago único sin cuenta.
