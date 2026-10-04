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
  el saldo de nodos de Graphikosmos. Aquí no hace falta cuenta — el
  "producto" es una sola lectura, identificada por un id (`readingId`), no
  un saldo permanente.
- **La lectura se guarda en Supabase** (tablas `qer_readings` y
  `qer_orders`, ver `supabase/schema.sql`) — la misma base de datos que ya
  usa Graphikosmos en este sitio, mismas variables de entorno
  (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`), nada nuevo que configurar.
  **Antes esto usaba Netlify Blobs** (a propósito, para no tocar Supabase
  para nada en esta app) pero en producción falló con "The environment has
  not been configured to use Netlify Blobs" — un problema de
  aprovisionamiento del lado de Netlify, no de este código (ver el
  comentario al inicio de `_lib/qer-readings-store.js`). Moverlo a Supabase,
  que ya está funcionando en este sitio, fue más rápido y confiable que
  seguir depurando a ciegas un servicio de terceros que no respondía como
  documenta.

## Registro de uso: hasta dónde llega cada visitante, y los pagos fallidos

Cada visitante (sin necesidad de cuenta) queda registrado en la misma tabla
`events` de Supabase que ya usa Graphikosmos — mismas variables de entorno
(`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`), ya configuradas en este sitio, sin
nada nuevo que agregar. Lo único que hace falta es volver a correr
`supabase/schema.sql` completo en el SQL Editor de Supabase (es seguro de
repetir — usa `if not exists`/`create or replace` en todo, no borra ni
duplica nada existente): agrega una columna `app` a la tabla para poder
separar los eventos de esta app de los de Graphikosmos en la misma consulta.

**Importante — a diferencia del registro de Graphikosmos (que a propósito
nunca guarda el texto que escribe la persona, por privacidad)**: aquí sí se
guarda la respuesta completa de cada pregunta, porque fue justo lo que se
pidió ("quiero saber todas sus respuestas"). Es una decisión consciente:
si en algún momento prefieres no guardar el texto literal de las respuestas
abiertas, se puede quitar con un solo cambio en `app.js` (la llamada
`track('question_answered', ...)`) sin afectar el resto del embudo.

Eventos que quedan registrados (todos con `app = 'quien-eres'`):

| Evento | Cuándo |
|---|---|
| `quiz_started` | Toca "Empezar" en la portada |
| `question_answered` | Cada vez que responde una pregunta y pasa a la siguiente — incluye `questionIndex` (1 a 16), la pregunta y su respuesta completa |
| `reading_generated_success` / `_error` | Se generó la lectura, o falló (con el motivo exacto en `reason` — esto es lo que antes era invisible cuando daba el error 502) |
| `paywall_shown` | Ve la pantalla de "lectura parcial + botón de pago" |
| `payment_order_created` / `_create_failed` | Se creó (o falló crear) la orden de PayPal |
| `payment_cancelled` | Cerró la ventana de PayPal sin terminar |
| `payment_captured_success` / `_failed` | El pago se confirmó, o falló la confirmación (con el motivo) |

### Consultas de ejemplo (SQL Editor de Supabase)

**¿Hasta qué pregunta llegó cada visitante, y si pagó?** (ya armada como
vista, por comodidad):
```sql
select * from public.quien_eres_funnel order by last_event_at desc limit 50;
```

**Todas las respuestas de una sesión específica** (reemplaza el anon_id):
```sql
select metadata->>'questionIndex' as pregunta, metadata->>'question' as texto, metadata->>'answer' as respuesta
from public.events
where app = 'quien-eres' and anon_id = 'PEGA-AQUÍ-EL-ANON-ID' and event_name = 'question_answered'
order by (metadata->>'questionIndex')::int;
```

**Quién intentó pagar y no pudo, y por qué (últimos 7 días):**
```sql
select created_at, anon_id, event_name, metadata->>'reason' as motivo
from public.events
where app = 'quien-eres'
  and event_name in ('payment_order_create_failed', 'payment_captured_failed')
  and created_at > now() - interval '7 days'
order by created_at desc;
```

**Dónde se atasca más la gente (en qué pregunta abandona más seguido):**
```sql
select last_question_answered, count(*) as cuántos
from public.quien_eres_funnel
where not paid
group by last_question_answered
order by last_question_answered;
```

**Cuántos abren el link pero ni siquiera tocan "Empezar"** (rebote en la
portada — útil para saber si el problema es la portada o el cuestionario):
```sql
select count(*) as entran_pero_no_empiezan
from public.quien_eres_funnel
where questions_answered = 0;
```

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
- Cada lectura se considera válida por 24 horas (ver `TTL_MS` en
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
Supabase) con el mismo patrón de pago único sin cuenta.
