# Etapa 2 — Paneles flotantes + subesquemas + rediseño + YouTube/Wikipedia

## 10. Registro de eventos de uso (embudo completo, sesión de hoy)

Pediste poder ver qué hace cada usuario desde su primera visita: si se rinde,
si intentó pagar y no pudo, etc. Quedó implementado como **solo datos,
consultables con SQL** en Supabase (la opción que elegiste) — sin panel
visual dentro de la app por ahora.

### Cómo funciona (y por qué no afecta la velocidad de la app)

- Nueva tabla `events` en Supabase (agregada a `supabase/schema.sql` —
  acuérdate de volver a correr ese archivo para que se cree).
- Una función nueva, `track(nombreDeEvento, metadata)` en `app.js`, que manda
  el evento a una función de servidor nueva (`track-event.js`) **sin esperar
  la respuesta ni poder fallar visiblemente**: es "dispara y olvida" a
  propósito. Si Supabase estuviera caído, el usuario no lo notaría en nada —
  la app sigue funcionando igual, el evento simplemente no quedaría guardado.
- Esta función NO pasa por el sistema de facturación: no cuesta nodos, no
  tiene límite de uso (si algún día se nota abuso/spam de eventos, se le
  puede poner el mismo límite por hora que ya tienen las funciones de IA).
- Cada evento queda asociado a quien lo generó: el usuario (si tiene cuenta)
  o el invitado (misma identidad que ya usa el sistema de saldo), más un
  `anon_id` por navegador que persiste aunque pase de invitado a cuenta
  registrada a mitad de sesión — así puedes seguir "qué hizo antes de
  registrarse" cruzando por ese id.
- **Nunca se guarda el texto que el usuario escribe o pega** (ni el tema, ni
  el documento, ni el enlace) — solo datos de forma: longitud, tipo, si fue
  éxito o error. Es intencional, por privacidad.

### Qué queda registrado hoy

| Evento | Cuándo se dispara |
|---|---|
| `first_visit` | Primera vez que alguien abre la app en ese navegador |
| `return_visit` | Cualquier visita después de la primera |
| `login_wall_shown` | Se le muestra el muro de "inicia sesión" (incluye por qué, en `metadata.reason`) |
| `login_success` | Inicia sesión correctamente |
| `schema_generate_attempt` / `_success` / `_error` | Cada vez que pide generar un esquema (tema, texto largo o video), y cómo terminó |
| `youtube_transcript_success` / `_error` | Intento de extraer subtítulos de un video |
| `paywall_shown` | Se le muestra la tienda porque se quedó sin saldo |
| `payment_order_created` / `_create_failed` | Se creó (o falló crear) una orden de PayPal — registrado en el servidor, no en el navegador |
| `payment_cancelled` | Cerró la ventana de PayPal sin terminar de pagar |
| `payment_failed` | El pago no se completó o el monto no coincidía (con el motivo en `metadata.reason`) |
| `payment_success` | Pago confirmado y nodos acreditados |
| `page_left` | Se fue de la página (cierra la pestaña, navega fuera) — incluye cuánto tiempo estuvo y si llegó a tener nodos en el lienzo |

Es fácil agregar más eventos después (cualquier clic que quieras poder ver) —
solo es una línea `track('nombre_del_evento', { lo que quieras guardar })`.

### Cómo ver el embudo (ejemplos de consultas, en el SQL Editor de Supabase)

**Conteo simple por evento, para tener una foto general:**
```sql
select event_name, count(*) 
from events 
where created_at > now() - interval '7 days'
group by event_name 
order by count(*) desc;
```

**Quién vio el muro de pago y nunca volvió a pagar (se "rindió" en el paywall):**
```sql
select e1.actor_id, e1.created_at as vio_paywall
from events e1
where e1.event_name = 'paywall_shown'
  and not exists (
    select 1 from events e2
    where e2.actor_id = e1.actor_id
      and e2.event_name = 'payment_success'
      and e2.created_at > e1.created_at
  )
order by e1.created_at desc;
```

**Pagos que fallaron y por qué, últimos 30 días:**
```sql
select actor_id, created_at, metadata->>'reason' as motivo, metadata
from events
where event_name = 'payment_failed' and created_at > now() - interval '30 days'
order by created_at desc;
```

**Embudo completo de un usuario o invitado específico (reemplaza el id):**
```sql
select event_name, created_at, metadata
from events
where actor_id = 'guest:xxxxxxxx-xxxx-...'  -- o el "sub" de su cuenta
order by created_at asc;
```

**Tasa de conversión visita → primer esquema generado (aproximada):**
```sql
select
  count(*) filter (where event_name = 'first_visit')            as visitas_nuevas,
  count(*) filter (where event_name = 'schema_generate_success') as esquemas_generados
from events
where created_at > now() - interval '7 days';
```

### Limitación honesta

"Se rindió" no es algo que el navegador pueda avisar con certeza — solo se
puede *inferir* viendo cuál fue el último evento de alguien antes de que
dejara de aparecer (ej. la consulta del paywall de arriba). El evento
`page_left` ayuda (dice cuánto tiempo estuvo y si llegó a generar algo), pero
no reemplaza esa inferencia. Si más adelante quieres algo más preciso —por
ejemplo, un panel visual en vez de SQL, o alertas automáticas— se puede
construir sobre esta misma tabla sin tener que cambiar nada de lo ya hecho.

## 9. PayPal verificado en el servidor + lista antes de promocionar (sesión de hoy)

### El problema que había

El botón de PayPal cobraba de verdad (el dinero sí llegaba), pero **quién
recibía los nodos lo decidía el navegador**: en cuanto el SDK de PayPal decía
"aprobado", el propio JavaScript de la página sumaba los nodos a
`localStorage`, sin que el servidor verificara nada. Cualquiera con las
herramientas de desarrollador abiertas podía llamar esa misma función y
regalarse nodos sin pagar un centavo — el saldo que de verdad gastaban las
funciones de IA vive en Supabase, pero el que entregaba la compra vivía en el
navegador. Dos sistemas de saldo distintos que no se hablaban entre sí.

### Qué se hizo

Ahora el pago se confirma **en el servidor**, con tres archivos nuevos:

- `_lib/packages.js` — el catálogo real de paquetes (nodos y precio en USD).
  Es la única fuente de verdad: aunque alguien edite el HTML de la tienda o
  intercepte la llamada, el servidor nunca va a cobrar ni acreditar algo que
  no esté en esta lista con ese precio exacto.
- `_lib/paypal.js` — llama a la API REST real de PayPal (no al SDK del
  navegador) para crear y capturar órdenes, usando credenciales
  confidenciales que solo el servidor conoce.
- `paypal-create-order.js` / `paypal-capture-order.js` — las dos funciones
  que el botón de PayPal llama ahora: una crea la orden con el precio que fijó
  el servidor, la otra confirma que PayPal de verdad cobró ese monto exacto y
  **solo entonces** llama a `credit_nodes` en Supabase (la misma función que
  ya existía preparada en `supabase/schema.sql`, pero que nunca se usaba).
  Las dos exigen sesión iniciada (los invitados no pueden comprar).

El flujo con tarjeta/PayPal real del usuario no cambia visualmente en nada —
sigue siendo el mismo botón. Lo que cambió es invisible: antes el navegador se
auto-otorgaba el crédito, ahora el crédito solo lo otorga Supabase después de
que el servidor confirma con PayPal que el dinero entró.

### Lo que TÚ tienes que hacer (yo no tengo acceso a tus cuentas)

**1. Variables de entorno nuevas en Netlify** (Site settings → Environment
variables), además de las que ya tenías de Etapa 1:

| Variable | Valor |
|---|---|
| `PAYPAL_CLIENT_ID` | El Client ID de tu app de PayPal. **Ya no hace falta tocar `index.html` para esto** (ver abajo) — con poner esta variable alcanza para que el botón y los cobros reales usen el mismo id. |
| `PAYPAL_CLIENT_SECRET` | El "Secret" de esa misma app, en el [Dashboard de PayPal Developer](https://developer.paypal.com/dashboard/applications) → Apps & Credentials |
| `PAYPAL_ENV` | Déjala sin definir (o en cualquier valor que no sea `sandbox`) para cobros reales. Ponla en `sandbox` solo mientras pruebes con una cuenta de prueba. |

  ⚠️ El Client ID y el Secret tienen que ser **de la misma app y el mismo
  entorno** (los dos de "Live", o los dos de "Sandbox"). Si mezclas un Client
  ID de Live con un Secret de Sandbox (o viceversa), la creación de la orden
  fallará.

  **Novedad de esta sesión**: antes, el Client ID vivía hardcodeado en
  `index.html` (en el `<script src="https://www.paypal.com/sdk/js?client-id=...">`)
  — totalmente aparte de `PAYPAL_CLIENT_ID`, que ya existía para las llamadas
  reales a la API. Eran dos copias del mismo dato en dos lugares distintos:
  fácil que alguien cambiara uno para probar en Sandbox y se le olvidara el
  otro, y el pago quedara roto a medias (el botón de un entorno, el cobro real
  de otro). Ahora **solo existe `PAYPAL_CLIENT_ID`**: una función nueva,
  `paypal-config.js`, se lo entrega al navegador (es un dato público, no hay
  problema en exponerlo — el Client ID siempre va visible en la URL del SDK en
  cualquier sitio que use PayPal), y `app.js` carga el botón de PayPal con ese
  mismo id dinámicamente, en vez de con uno fijo escrito en el HTML.

**2. Confirmar que la tabla `payments` y la función `credit_nodes` existen en
tu Supabase real.** Están en `supabase/schema.sql`, pero es posible que nunca
se hayan ejecutado en tu base de datos porque antes no se usaban. El archivo
es seguro de volver a correr completo en el SQL Editor de Supabase aunque ya
tengas las otras tablas — usa `create table if not exists` y
`create or replace function`, así que no borra ni duplica nada que ya tengas.

**3. Probar con una compra real pequeña antes de promocionar.** Yo no tengo
forma de probar esto en vivo desde este entorno (no tengo salida de red hacia
PayPal ni acceso a tu cuenta de Netlify/Supabase), así que esto sí depende de
que lo verifiques tú: compra el paquete más barato, confirma que el saldo que
aparece en la app sube, y revisa en Supabase (tabla `payments`) que quedó un
registro con el `order_id` de esa compra.
  - Si quieres probar sin arriesgar dinero real primero: crea una app de
    "Sandbox" en el dashboard de PayPal, y en Netlify cambia temporalmente
    `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` por los de esa app de prueba, más
    `PAYPAL_ENV=sandbox`. Como ahora todo sale de esas mismas variables (ya no
    hay nada que editar en `index.html`), con cambiar esas tres variables en
    Netlify y volver a desplegar alcanza. Cuando confirmes que funciona,
    vuelve a poner el `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` reales y quita
    (o cambia) `PAYPAL_ENV`.

### Otras cosas que revisé antes de decir "ya puedes promocionar"

- **Funciones huérfanas de versiones anteriores** (`track.js`, `license.js`,
  `admin-auth.js`, que habían quedado señaladas como pendientes de borrar en
  Etapa 1): ya no existen en esta carpeta — quedaron limpias.
- **Límites de uso por hora** (`RATE_LIMIT_PER_HOUR`, `GUEST_RATE_LIMIT_PER_HOUR`)
  y **cupos gratis** (`INITIAL_FREE_NODES`, `GUEST_FREE_NODES`, `GUEST_IP_CAP`)
  ya estaban bien pensados desde Etapa 1 para aguantar un pico de tráfico de
  lanzamiento; no hizo falta tocarlos.
- **No agregué** límite de uso a `paypal-create-order`/`paypal-capture-order`
  en sí mismas (solo exigen sesión iniciada) — con tráfico normal de
  promoción no debería ser un problema, pero si llegas a ver abuso (alguien
  creando órdenes en bucle) avísame y le pongo el mismo límite por hora que
  tienen las funciones de IA.
- **Pendiente, sin resolver (no bloquea el lanzamiento)**: la extracción de
  subtítulos de YouTube sigue limitada por el bloqueo anti-bot de YouTube a
  IPs de servidor (ver sección 8) — el resto de la app no depende de eso para
  funcionar, así que no es necesario resolverlo antes de promocionar.

## 8. YouTube "LOGIN_REQUIRED" y ajustes al nodo de subesquema (sesión de hoy)

- **YouTube: por qué da "LOGIN_REQUIRED" en videos públicos.** Confirmaste que
  el error exacto es `Ese video no está disponible (LOGIN_REQUIRED)` incluso
  en videos que sí tienen subtítulos y son públicos. Investigándolo: esto NO
  es que el video en particular tenga un problema — es que **YouTube está
  tratando la petición del servidor (la IP de Netlify) como la de un bot** y
  le exige "iniciar sesión" para cualquier video, sin importar cuál sea. Es un
  bloqueo cada vez más agresivo de YouTube contra tráfico que no viene de un
  navegador real con IP residencial, y afecta por igual a los tres mecanismos
  que probamos (cliente Android, cliente Web, y leer el HTML de la página) —
  los tres dependen de la misma IP del servidor.
  - **Esto no tiene una solución confiable desde una función de servidor
    gratuita.** Las únicas formas reales de evitarlo serían: (a) iniciar
    sesión con una cuenta de YouTube real y mantener esa sesión viva en el
    servidor (frágil, en contra de los términos de uso, y puede terminar en
    que esa cuenta sea bloqueada), o (b) pagar por un servicio de proxies
    residenciales (tiene costo recurrente y añade complejidad). Ninguna de las
    dos es algo que recomiende implementar para esta app.
  - **Lo que sí se hizo**: ahora, cuando las tres estrategias fallan
    específicamente por este bloqueo, el mensaje de error ya no es confuso
    ("no disponible") — explica la causa real y da la alternativa práctica:
    **copiar la transcripción manualmente**. En YouTube, debajo del video →
    "⋯ Más" → "Mostrar transcripción" → copiar ese texto y pegarlo directo en
    el Modo Lector (o en el campo pequeño de la cabecera, si es corto). Eso
    sigue funcionando siempre, sin depender de nada de esto.
  - Si en el futuro un video específico sí logra extraerse (porque ese
    bloqueo de YouTube no es parejo todo el tiempo para todas las IPs), el
    código ya está listo para aprovecharlo — no hubo que revertir nada, solo
    se aclaró el mensaje cuando falla por esta razón puntual.

- **Nodo de subesquema: se quitó el "link rápido" dentro del lienzo.** El
  nodo "⬅ Volver" que se agregó la vez pasada dentro del subesquema (con sus
  flechas-puente) se sintió como una caja suelta que no aportaba — ya se quitó
  por completo. Volver a salir del subesquema se hace solo con la pastilla
  "← Volver" de arriba del lienzo (como al principio).
- **Nodo de subesquema: más grande y con título corto.** El nodo colapsado en
  el esquema principal ahora es notablemente más grande (para que la
  miniatura pintada adentro se distinga de verdad) y su etiqueta es un título
  corto y directo ("📦 Nombre del subesquema"), sin el conteo de nodos ni
  relleno adicional.

## 7. Modo Lector flotante + un solo campo de "generar" (sesión de hoy)

- **El Modo Lector ya no va fijo a un costado** ocupando siempre un tercio de
  la pantalla: ahora es una **ventana flotante** (como los paneles de
  definición), que se abre solo cuando se necesita — con "📖 Pegar documento /
  video" en la segunda fila de la cabecera, o "Abrir Lector Activo" en la
  pantalla de bienvenida — y se puede arrastrar, redimensionar (desde la
  esquina inferior derecha) y cerrar. Al estar cerrada, el lienzo usa toda la
  pantalla.
- **Se quitó el campo "Contexto:" de la vista principal.** El contexto para
  desambiguar definiciones (ej. distinguir "Mercurio" el planeta del elemento)
  sigue detectándose solo, igual que antes, pero ya no es un campo que haya
  que mirar o llenar: ahora es una línea muy discreta ("📎 Contexto: ...") que
  solo aparece una vez que hay algo detectado, con un link de "editar" para
  quien quiera ajustarlo a mano. Antes ocupaba espacio y atención aunque el
  usuario nunca necesitara tocarlo.
- **Un solo campo para "generar", siempre visible, funcione el lienzo vacío o
  no:** el campo pequeño de la cabecera (antes "Agregar") ahora:
  - Si escribes un **tema corto** (ej. "La célula"): investiga y genera un
    esquema completo de 3 niveles — igual si el lienzo está vacío o si ya
    tiene otros esquemas.
    - *Excepción deliberada:* si el lienzo ya tiene contenido y el texto es
      corto, se agrega un solo nodo suelto (sin gastar IA de más) — tú decides
      si expandirlo luego desde el menú del nodo ("Conceptos Relacionados").
      Esto es a propósito, para no disparar un esquema completo cada vez que
      quieres agregar una sola idea a un mapa que ya tienes armado.
  - Si pegas un **texto largo** (25+ palabras) o un **enlace de YouTube**:
    genera el esquema fiel a ESE contenido exactamente como el Modo Lector —
    ya no hace falta abrir el panel del lector solo para eso.
  - Un texto de ayuda (al pasar el mouse sobre el campo, y una pista discreta
    en la segunda fila de la cabecera) explica esta regla, para que sepas qué
    esperar sin tener que adivinarlo.
  - El Modo Lector (ahora flotante) sigue existiendo para cuando de verdad
    quieres **leer y resaltar** un documento largo mientras construyes el
    esquema (seleccionar texto → "⚡ Crear elemento en esquema"), no solo para
    generarlo una vez.

## 6. Últimos arreglos (sesión de hoy)

- **401 en `/.netlify/functions/db`**: la causa era que `authHeaders()` leía el
  token de sesión (`currentUser.token.access_token`) cacheado desde el login,
  que expira (~1h). Ahora usa `await currentUser.jwt()`, el método de Netlify
  Identity que **refresca el token automáticamente** si ya venció, con el
  valor cacheado solo como respaldo si `.jwt()` llega a fallar. `authHeaders`,
  `apiFetch` y el interceptor global de `fetch` pasaron a ser `async` para
  poder esperar ese refresco antes de cada llamada.
- **422 "ese video no tiene subtítulos" en videos que sí los tienen (ahora con
  más intentos)**: el primer intento de arreglo (usar el endpoint interno
  `youtubei/v1/player` simulando el cliente "WEB") seguía fallando — lo más
  probable es que YouTube bloquee cada vez más ese cliente específico cuando
  la petición no viene de un navegador real (sin eso, YouTube a veces devuelve
  "no disponible" aunque el video sí tenga subtítulos). Ahora se intentan
  **tres estrategias en orden**, quedándose con la primera que funcione:
  1. El mismo endpoint interno, pero simulando el cliente de la **app de
     Android** de YouTube — en la práctica, el que menos verificaciones
     anti-bot tiene desde un servidor.
  2. El mismo endpoint simulando el cliente "WEB" (el intento anterior).
  3. Como último recurso, leer el HTML de la página del video y extraer el
     bloque de datos del reproductor de ahí.
  - **Importante — no pude verificarlo en vivo**: este entorno de trabajo no
    tiene salida a youtube.com (lo confirmé al intentarlo), así que no puedo
    probar si YouTube efectivamente acepta estas peticiones en este momento.
    Avísame con el mensaje de error exacto si sigue sin funcionar con algún
    video — esa es la única forma de que yo sepa qué estrategia sigue
    fallando y pueda ajustarla.
  - Sigue sin ser una API oficial documentada — es inherentemente frágil
    porque depende de mecanismos internos de YouTube que pueden cambiar sin
    avisar.
- **Miniatura del subesquema y navegación dentro de él**: tres ajustes a lo ya
  descrito en la sección 2:
  1. La miniatura ya no fuerza un rectángulo de 150×150 distinto a los demás
     nodos: ahora usa el mismo mecanismo de tamaño (`size`) que cualquier nodo
     imagen de vis-network, así que se ve del mismo tamaño que un nodo normal
     del lienzo.
  2. Al entrar a un subesquema aparece, dentro del propio lienzo, un nodo
     "⬅ Volver" (línea punteada violeta) — un link rápido para salir sin tener
     que usar la pastilla de arriba. Hace lo mismo que esa pastilla.
  3. Las conexiones que ese grupo tenía con el resto del esquema (las que se
     redirigen al nodo colapsado cuando se ve desde afuera) ahora también se
     ven **desde adentro**: se dibujan como flechas punteadas hacia/desde el
     nodo "⬅ Volver", en la misma dirección que tenían originalmente, para no
     perder de vista cómo se conecta este fragmento con el resto del mapa.

## 3. Rediseño visual ("consola futurista", sin 3D)

Se mantiene `vis-network` 2D (nada de 3D), pero se rehizo el aspecto general:

- **Tipografía**: `Sora` para títulos (antes Plus Jakarta Sans), `Inter` para
  cuerpo (igual que antes), y `IBM Plex Mono` solo para números reales
  (contador de nodos) — no decorativo, es telemetría real.
- **Paleta**: la app pasa a un tema oscuro "cosmos" (`#0a0e1a`/`#11162b`) con
  dos acentos — cian `#4fd1c5` y violeta `#8b7cf6` — en vez de un solo color
  neón. Los nodos del mapa siguen siendo tarjetas claras (como antes), pero
  ahora se leen como fichas iluminadas flotando sobre el fondo oscuro, con un
  resplandor sutil en vez de la sombra gris que no se veía sobre negro.
- **Lienzo**: fondo con una retícula fina de puntos (como una carta estelar) y
  una "aurora" de dos manchas de color que deriva muy lento detrás de los
  nodos — es el único efecto de movimiento no disparado por el usuario, sutil
  y en bucle largo (36s), y respeta `prefers-reduced-motion`.
- **Cabecera**: se rediseñó el layout de arriba. Antes eran dos filas con el
  buscador compitiendo en tamaño con "Limpiar". Ahora la fila principal tiene
  al buscador como protagonista (con resplandor cian al enfocar), con el logo
  a la izquierda y un clúster compacto de estado a la derecha (sesión,
  proyectos, capturar, ayuda, contador de nodos con punto pulsante). La
  segunda fila queda solo para "Modo Lector" y "Limpiar", como acciones
  discretas de texto, no botones compitiendo por atención.
- **Menú contextual de nodos**: pasa a ser parte de la "consola" (oscuro, con
  borde fino cian), igual que los paneles flotantes de definición (que ya
  eran oscuros). Los modales de lectura (Ayuda, Tienda, Mis Proyectos,
  Bienvenida) se dejaron como tarjetas claras a propósito: son "documentos"
  que se leen, no parte del instrumento — library de diseño deliberada, no
  un rediseño a medias.

## 4. YouTube → subtítulos → esquema (Modo Lector)

En vez de pegar texto, ahora puedes pegar el enlace de un video de YouTube en
el Modo Lector y presionar "Generar Esquema": el backend extrae los
subtítulos públicos del video (`netlify/functions/youtube-transcript.js`) y
ESE texto es el que se usa para "agotar" el esquema — exactamente como si
hubieras pegado un artículo.

- No usa Whisper ni ninguna API de pago: lee los subtítulos que YouTube ya
  expone públicamente en la página del video (sin API key). Si el video no
  tiene subtítulos (ni automáticos), se avisa con un mensaje claro para que
  pegues el texto a mano.
- Prioriza subtítulos en español; si no hay, usa los que estén disponibles
  (incluyendo autogenerados).
- El título del video se autocompleta como "Contexto" si ese campo estaba
  vacío, para ayudar a desambiguar definiciones después.
- **Limitación conocida**: esto es scraping de una estructura pública de
  YouTube, no una API oficial documentada — si YouTube cambia el formato de
  su página, esta función puede dejar de funcionar y habría que ajustarla.

## 5. Definiciones gratis y factualmente precisas vía Wikipedia

Para "Ver definición", el orden de prioridad ahora es:

1. **Si hay un documento de base** (texto pegado, o transcripción de un video
   ya cargada en el Modo Lector): la definición se agota de ESE texto con
   Gemini, igual que antes. Wikipedia no entra en juego aquí — el texto que
   trajiste manda.
2. **Si NO hay documento de base**: antes de llamar a Gemini, el backend
   (`netlify/functions/_lib/wikipedia.js`) intenta traer el resumen de
   Wikipedia para ese concepto — gratis, sin gastar tokens, y con la
   precisión factual de una fuente real en vez de lo que el LLM "recuerde".
   Si el nodo es una entidad reconocida (persona, lugar, evento, obra), el
   panel muestra el primer párrafo de Wikipedia **con su foto principal** y
   un enlace de atribución abajo.
   - Si el título no existe tal cual o es una página de desambiguación
     (ej. "Mercurio"), se usa el nodo raíz del esquema como pista de contexto
     para buscar el artículo correcto (ej. "Mercurio" + "Sistema Solar" →
     el planeta, no el elemento ni el dios romano).
   - Prueba primero en español, y si no encuentra nada razonable, en inglés.
   - Si Wikipedia no tiene nada razonable, se recurre a Gemini exactamente
     como antes (con sus pistas interactivas "[[término]]" para seguir
     explorando desde la definición).
3. Esta acción sigue siendo gratuita para el usuario en ambos casos (ya lo
   era desde Etapa 1); lo que cambia es que ahora, cuando aplica, no le
   cuesta tokens de Gemini a la app tampoco.

## 0. Qué cambió de rumbo en esta etapa (importante)

- Se probó migrar el lienzo a 3D (`3d-force-graph`), pero no funcionó bien en la
  práctica (ver conversación) y **se revirtió por completo**: el lienzo vuelve a
  ser `vis-network` 2D, exactamente como estaba antes de esa prueba.
- Se eliminó la carpeta `/lab` (`lab/index.html`, `lab/lab.js`). Ya no existen dos
  versiones de la app: **solo hay una, en la raíz** (`index.html` + `app.js`). Todo
  lo que hacía `lab.js` (los botones "Antítesis"/"Ponme a prueba", la barra "Tu
  Cosmos" en Mis Proyectos, el manejo de incógnitas al expandir) ya estaba
  duplicado o mejorado dentro de `app.js`/`index.html`, así que no se perdió nada
  al borrarlo — al contrario, eliminaba un bug real de doble-clic que ya existía
  (`lab.js` y `app.js` escuchaban los mismos botones por separado).

## 1. Paneles flotantes (ya no hay "expandir definición")

- "Ver definición" ya no infla el nodo en el lienzo: abre una **ventana flotante**
  propia sobre el mapa (arrastrable, minimizable, cerrable). Se pueden tener varias
  abiertas a la vez, apiladas en cascada, para comparar definiciones lado a lado.
- Las respuestas de incógnitas (❓), los resultados de "Prompt personalizado" y la
  síntesis del reto socrático (🏆) ya no se incrustan como texto largo dentro del
  nodo: el nodo queda pequeño y su contenido se abre automáticamente en un panel
  flotante apenas se genera.
- Se eliminó todo el sistema de "expandir/contraer en el nodo" (`isExpandedDef`,
  los botones de escala +/-, "Ver aquí"/"Contraer").

## 2. Subesquemas (nuevo)

Se puede tomar una selección de nodos y convertirla en un **subesquema**: un solo
nodo colapsado, con una miniatura dibujada dentro de él (puntos = nodos, líneas =
conexiones), que se puede volver a abrir y navegar como si fuera el esquema
principal.

### Cómo se usa

1. **Selecciona 2 o más nodos** con Ctrl/Cmd + clic (el multiselección ya estaba
   habilitado en `vis-network`). Al llegar a 2, aparece arriba una barra: *"N
   nodos seleccionados — 📦 Convertir en subesquema"*.
2. Al convertir: esos nodos y sus conexiones **entre sí** desaparecen del lienzo
   principal y se reemplazan por **un solo nodo** con la miniatura del grupo
   dentro. Las conexiones que iban desde/hacia afuera del grupo (hacia nodos que
   no estaban seleccionados) se conservan, pero ahora apuntan al nodo colapsado
   en vez de al nodo específico que tenían adentro.
3. **Para entrar al subesquema**: doble clic sobre el nodo colapsado, o clic
   derecho/menú → "🔍 Expandir subesquema". El lienzo cambia para mostrar *solo*
   ese subesquema, como si fuera el mapa principal (puedes expandir nodos,
   generar sinergia, etc. con total normalidad ahí dentro).
4. **Para volver**: aparece una pastilla arriba a la izquierda, *"← Volver —
   Dentro de: <nombre>"*. Al volver, lo que hayas cambiado dentro del subesquema
   (nodos agregados, editados, etc.) se guarda de nuevo dentro del nodo colapsado
   y su miniatura se redibuja para reflejarlo.
5. Los subesquemas se pueden anidar (un subesquema puede contener otro
   subesquema adentro), y navegar entre varios niveles con la misma pastilla de
   "Volver" repetida.

### Cómo se guardó esto sin arriesgar tus proyectos

- Mientras estás *dentro* de un subesquema, el autoguardado se desactiva (no se
  sobrescribe el proyecto completo con solo el fragmento que estás viendo). En
  cuanto vuelves al nivel principal, se guarda automáticamente de nuevo.
- Un subesquema es solo datos dentro del nodo colapsado (`subSchemeData: {nodes,
  edges}`), así que viaja con el proyecto normal al guardarlo/cargarlo — no
  necesitó cambios en el backend ni en Supabase.
- Abrir "Mis Proyectos", cargar otro proyecto, o usar "Limpiar"/"Nuevo proyecto"
  reinicia la navegación de subesquemas al nivel principal, para no dejar un
  estado "a medias" de un proyecto anterior mezclado con el nuevo.

### Limitaciones conocidas

- La miniatura es deliberadamente simple (un canvas 2D con puntos y líneas, sin
  colores de texto ni etiquetas) — es una referencia visual rápida, no un mapa
  en miniatura navegable.
- Si arrastras nodos para reordenarlos dentro de un subesquema, esa disposición
  se conserva la próxima vez que lo abras (se guarda tal cual la dejaste).
- No hay (todavía) una forma de "deshacer" convertir en subesquema desde la UI;
  si te equivocas, entra al subesquema (doble clic), copia mentalmente lo que
  haya, y vuelve a crear esos nodos sueltos a mano, o pídeme que agregue un
  botón de "deshacer agrupación" si lo necesitas seguido.

## Archivos modificados en esta etapa

- `app.js` — paneles flotantes; sección nueva "SUBESQUEMAS" (agrupar selección,
  entrar/salir, miniatura); guardas de autoguardado actualizadas para no guardar
  mientras se navega dentro de un subesquema.
- `index.html` — capa de paneles flotantes (reemplaza el panel único); barra para
  convertir selección en subesquema; pastilla de navegación "Volver"; botón
  "Expandir subesquema" en el menú contextual; se quitaron los botones de escala
  +/- (ya sin uso); texto de ayuda actualizado.
- Se eliminó `/lab` por completo (ver sección 0).

## 11. Ronda de ajustes: nodos visibles, Antítesis/Sinergia cortas, animación de carga, y pagos

### a) Nodo suelto ("Generar") ahora siempre visible

Antes, `insertSingleNode` ponía el nodo nuevo a un desplazamiento fijo del
centro de la vista, así que si ya había otro nodo justo ahí, el nuevo quedaba
tapado y parecía que no había pasado nada.

Ahora:
- `findFreeSpot(...)` revisa las posiciones de todos los nodos existentes y,
  si el punto candidato está muy cerca de alguno, prueba puntos en espiral
  hacia afuera hasta encontrar uno libre (o, en el peor caso, se aleja bastante
  del centro).
- `flashNewNode(...)` hace que el nodo nuevo "pulse" (agranda/achica su borde
  un par de veces) justo después de aparecer, además del zoom/encuadre que ya
  existía. Esto es la misma idea que el punto (d) de abajo: que sea imposible
  no notar que algo acaba de pasar.

### b) y c) Antítesis y Sinergia: título corto en el nodo, texto completo en el panel

Antes, el nodo de una antítesis o de una sinergia mostraba el párrafo
completo generado por la IA como etiqueta — ocupaba mucho espacio y
desbalanceaba el mapa.

Ahora el backend (`gemini.js`) devuelve dos campos separados:
- `label`: un título corto (2-6 palabras) — el nombre de la teoría/autor/
  fenómeno (antítesis) o del concepto cumbre (sinergia). Esto es lo único que
  se ve en el nodo.
- `explanation`: el desarrollo completo (2-4 oraciones). Se guarda en el nodo
  como `definition` con `definitionSource: 'pregenerated'`, y aparece en el
  panel flotante al usar "Ver definición" — sin volver a llamarle a Gemini,
  porque el texto ya existe.

(`definitionSource: 'pregenerated'` es un valor nuevo que ya reconoce
`showDefinitionInFloatingPanel`: lo trata igual que una definición en caché,
así que no se re-genera ni se le pide "contexto" de más.)

Nota: las sinergias tienen, además del nodo central, "nodos puente"
(`pathsFromA`/`pathsFromB`) que ya eran cortos por diseño (conectores de 1 a 3
palabras) — esos no se tocaron porque no presentaban el problema.

### d) Animación visible mientras se redacta una definición

El panel flotante de "Ver definición" mostraba solo un texto en cursiva
("Redactando definición…") sin ningún movimiento — fácil de interpretar como
que la app se quedó colgada. Se le agregó un spinner (anillo girando) igual en
espíritu al que ya existía en el loader de pantalla completa, pero a tamaño de
panel.

### e) Error de tarjeta rechazada en PayPal (`scf_recoverable_page_error_on_submit`)

Este error ("no hemos podido asociar esta tarjeta") ocurre **dentro del propio
componente de PayPal** (`xo-card-fields` / `standardcardfields`) — es decir,
antes de que la tarjeta llegue siquiera a `paypal-capture-order.js`. El código
de esta app no participa en esa decisión; PayPal la toma internamente.

La causa más probable (no se puede confirmar sin acceso a tu panel de PayPal)
es que la cuenta de PayPal del negocio todavía no tenga habilitado el pago con
tarjeta de invitado ("Advanced/Standard Card Fields" o "Checkout avanzado")
para tu país/categoría de cuenta — que una cuenta personal reciba pagos por
link es un producto distinto ("PayPal.Me" o enlaces de pago) al de aceptar
tarjetas de invitado dentro de un sitio propio vía la API de Orders.

Qué revisar en tu panel de PayPal (Account Settings → Website Payments /
Checkout Settings, o contactando soporte de PayPal directamente):
1. Que la cuenta sea de tipo **Business** (no Personal) — el checkout de
   tarjetas de invitado dentro de un sitio propio solo está disponible para
   cuentas de negocio.
2. Si el panel menciona "Advanced Checkout" o "Card payments" como una
   capacidad separada que haya que solicitar/activar — en varios países
   Latinoamericanos esto requiere aprobación adicional de PayPal, a veces
   indefinidamente limitada (ej. solo PayPal Checkout estándar, sin tarjetas de
   invitado).
3. Confirmar con soporte de PayPal (chat/soporte de la cuenta business) si tu
   país está habilitado para "Guest Checkout con tarjeta" — esto es
   independiente de que ya puedas *cobrar* con otros métodos de PayPal.

Mientras se resuelve o se confirma esto con soporte de PayPal, el botón de
PayPal normal (sin tarjeta de invitado, pagando con cuenta de PayPal) debería
seguir funcionando para quien sí tenga cuenta de PayPal — el problema parece
limitarse específicamente al módulo de tarjeta de invitado.

### f) Pago manual activado (automático queda listo pero apagado)

Siguiendo tu decisión, la tienda ya **no** muestra precios ni paquetes: es
deliberadamente solo un botón "Escribir por WhatsApp" (con mensaje ya
redactado, mencionando el correo de la cuenta del cliente) y, debajo, el
correo como texto plano ("o envía un correo a bonillapretiz@gmail.com") para
quien prefiera esa vía o no tenga WhatsApp a mano. El precio se conversa por
chat, no se muestra en la app — así evitas que la pantalla parezca un cobro
automático cuando en realidad es una conversación.

Antes de publicar, edita estas 2 líneas al inicio de `app.js` (sección "0.
COBRO MANUAL") con tus datos reales:

```js
const SUPPORT_WHATSAPP_NUMBER = '50600000000'; // código de país + número, solo dígitos
const SUPPORT_EMAIL = 'tu-correo@dominio.com';
```

Toda la integración automática con PayPal (crear orden, capturar, verificar
en el servidor) **sigue intacta y sin borrar** — solo está apagada con una
bandera:

```js
const AUTOMATIC_PAYMENTS_ENABLED = false;
```

El día que PayPal habilite tarjeta de invitado para tu cuenta (o integres
Paddle/Lemon Squeezy reusando el mismo patrón), basta con poner esa bandera
en `true` para que el botón de pago vuelva a aparecer — no hay que reconstruir
nada.

### g) Mientras tanto: cobro manual + acreditar nodos a mano

Para manejar unos pocos compradores por hora mientras se resuelve lo de
tarjetas, la idea de "pido el correo, cobro por otro medio, y acredito nodos
después" es viable, pero `credit_nodes` (la función de Supabase que usa
`paypal-capture-order.js`) necesita el `user_id` de Netlify Identity del
comprador, no su correo.

No existe todavía una herramienta para esto — habría que construir una (una
función protegida solo para el admin, que busque el usuario por correo en la
tabla de perfiles y llame a `credit_nodes` con su `user_id`). Si quieres que la
construya, dime y la agrego en la próxima ronda; mientras tanto puedes hacerlo
a mano desde el panel de Supabase (tabla `profiles` para encontrar el
`user_id` por correo, y la función `credit_nodes` desde el SQL Editor).

### h) Alternativas a PayPal para una cuenta en Costa Rica

Investigado y verificado (no de memoria):
- **Stripe**: confirmado que **no** acepta cuentas de negocio en Costa Rica
  (no aparece en `stripe.com/global`, que sí lista países vecinos como Brasil
  y México). Tenías razón en tu duda.
- **Paddle**: sí acepta vendedores de Costa Rica — su lista de países NO
  soportados (ayuda oficial de Paddle) no incluye Costa Rica. Paddle actúa
  como "Merchant of Record" (factura y cobra en su nombre, se encarga de
  impuestos), lo cual simplifica bastante el papeleo. Pasos generales: crear
  cuenta en paddle.com → verificación de identidad/negocio → integrar su
  Checkout (similar a como está PayPal ahora: crear producto/precio, botón de
  checkout, webhook de confirmación de pago en una función de Netlify).
- **Lemon Squeezy**: confirmado que soporta pagos/retiros para vendedores en
  Costa Rica (también actúa como Merchant of Record, similar a Paddle).

De estas dos últimas, Paddle y Lemon Squeezy son alternativas razonables a
PayPal si el problema de tarjetas de invitado no se resuelve pronto. Si quieres,
en la próxima ronda puedo dejar lista la integración con cualquiera de las dos
(siguiendo el mismo patrón server-verificado que ya tiene PayPal: crear sesión
de pago en el servidor, verificar el webhook/captura, acreditar nodos solo ahí).

## 12. Explicación Sencilla (nueva, tipo "explícamelo como si no supiera nada")

Nuevo ítem en el menú de un nodo: **💡 Explicación sencilla**, junto a "Ver
definición" pero deliberadamente distinto:

- **"Ver definición"** sigue siendo la explicación rigurosa/técnica (o el
  extracto de Wikipedia).
- **"Explicación sencilla"** es otra cosa: sin jerga, con una analogía de la
  vida cotidiana y un ejemplo concreto — pensada para alguien que nunca ha
  oído el tema. El backend (`gemini.js`, acción `simple_explanation`) le pide
  explícitamente a la IA que evite tecnicismos y use comparaciones de todos
  los días (cocinar, el tráfico, deportes, etc.), nunca otra jerga técnica
  para "explicar" la primera.

**Es un panel flotante, como pediste, pero visualmente distinto** al de "Ver
definición": acento verde-lima en vez de turquesa, con tres bloques
separados y etiquetados (*"En palabras simples"*, *"🔗 Es como..."* para la
analogía, y *"Por ejemplo"*) en vez de un párrafo corrido. Así, aunque
tengas los dos paneles abiertos a la vez para el mismo nodo (sí se puede:
cada uno vive en su propia ventana), se distinguen de un vistazo.

Como "Ver definición", esta función es **gratis** (no gasta nodos) — se
agregó a la lista `FREE` en `_lib/billing.js`, igual que las definiciones.
La respuesta se guarda en el nodo (`simpleExplanation`) para no volver a
gastar una llamada a Gemini si se abre otra vez.

## 13. Bug importante: varias funciones no mandaban el login, y por eso fallaban mal al quedarse sin saldo

Esto explica los dos problemas que reportaste seguidos (el JSON crudo de
`insufficient_balance`, y que viendo sesión como admin te salía
`guest_limit_reached`).

**La causa real:** en el código original, bastantes acciones — generar el
esquema inicial, "Conceptos Relacionados", "Ejemplos Prácticos", "Generar
Sinergia", "Vincular con...", "Prompt personalizado", "Cuestionar/Antítesis"
y el "Reto Socrático" — llamaban a la función de Gemini con un `fetch()` a
secas, en vez de con `apiFetch` (el ayudante que ya existía en el código y
que sí le agrega el token de sesión). Como nunca mandaban ese token, el
servidor **nunca te reconocía como usuario logueado ni como admin en esas
acciones concretas** — siempre te trataba como invitado anónimo, sin
importar que hubieras iniciado sesión. Por eso, estando logueado como admin,
te salió `guest_limit_reached` en vez de que tu cuenta se saltara el límite.

Además, esas mismas funciones tampoco revisaban si la respuesta del servidor
era un error (402/429/401): agarraban el JSON tal cual y seguían de largo,
así que cuando sí fallaban por falta de saldo, el usuario no veía la tienda
ni el muro de login — veía el mensaje genérico "Intenta de nuevo en unos
segundos" (o, en algunos casos, ni siquiera eso: la acción simplemente no
hacía nada, en silencio).

**El arreglo:** las 10 llamadas afectadas en `app.js` ahora usan `apiFetch`
(con lo que el token de sesión sí viaja) y revisan la respuesta con
`handleBillingError(status, data)` antes de seguir — la misma función que ya
usaban "Ver definición" y otras acciones que sí funcionaban bien. Con esto:

- Un usuario logueado (o admin) se reconoce correctamente en **todas** las
  acciones, no solo en algunas.
- Sin saldo (`insufficient_balance`): se abre la tienda — el bloque de
  WhatsApp/correo que armamos — en vez de un mensaje genérico.
- Invitado que agotó su límite (`guest_limit_reached`): se abre el muro de
  inicio de sesión, no la tienda (un invitado no puede comprar sin cuenta).
- Demasiadas peticiones seguidas (429): su propio aviso, como antes.

## 14. Se quitó YouTube, se agregó "leer una página web"

YouTube bloquea sistemáticamente los pedidos que vienen de un servidor (no
de un navegador real), así que la extracción de subtítulos nunca funcionó de
forma confiable — quedó documentado en la sección 8, y ahora, siguiendo tu
pedido, se quitó de la interfaz. `netlify/functions/youtube-transcript.js`
se queda en el proyecto sin usar (por si algún día quieres retomarlo), pero
ya no se llama desde ningún lado.

**En su lugar:** el Modo Lector ahora acepta un enlace a una página web
(artículo, noticia, blog, etc.), además del texto pegado a mano. La
nueva función `netlify/functions/read-webpage.js`:

1. Descarga esa página en el servidor.
2. Extrae el texto principal del artículo con `@mozilla/readability` — la
   misma librería que usa el "Modo lectura" de Firefox para quedarse solo con
   el contenido y descartar menús, anuncios, barras laterales, etc.
3. Ese texto se usa exactamente igual que si lo hubieras pegado a mano: se
   "agota" con Gemini para generar el esquema.

A diferencia de YouTube, la mayoría de páginas de artículos/noticias **sí**
permiten que un servidor las lea — no tienen el mismo nivel de protección
anti-bot. Igual puede fallar en casos puntuales (una página que carga el
texto con JavaScript después, un muro de pago/login, un sitio que si
bloquea accesos automatizados) — en esos casos, el error dice claramente qué
pasó e invita a pegar el texto a mano en su lugar.

**Antes de desplegar**, instala las 2 dependencias nuevas (ve al `package.json`
de la raíz del proyecto):
```
npm install
```
Netlify también las instala solo al desplegar, siempre que `package.json`
esté en el repo (ya lo está, con `@mozilla/readability` y `jsdom` agregados).

> La nota que había aquí, sin resolver, preguntaba si el campo "Generar" de
> arriba debía siempre intentar un esquema completo a partir de un tema corto.
> Tu respuesta fue que no — "Generar" de arriba debe **siempre** crear un
> solo nodo suelto, nunca un esquema completo. Ver sección 15, donde quedó
> implementado.

## 15. "Generar" de arriba ahora SIEMPRE crea un solo nodo, y los paneles flotantes ya no se tapan entre sí

Dos ajustes pedidos directamente sobre el comportamiento anterior:

### a) El campo "Generar" de la cabecera ya solo crea un nodo suelto

Antes, `handleTopicInput()` (en `app.js`) tenía lógica para decidir "¿esto es
un tema corto para investigar, o un texto largo/enlace para usar tal cual?" —
y hasta probaba si el lienzo estaba vacío para decidir si disparaba un
esquema completo. Eso hacía que el campo de arriba, a veces, generara un
esquema completo en vez de un solo nodo, lo cual no es lo que esperabas de
ese campo.

Ahora `handleTopicInput()` hace una sola cosa, siempre: toma exactamente lo
que escribiste y crea un nodo nuevo en el lienzo con ese texto (via
`insertSingleNode()`), sin investigar nada ni distinguir temas cortos de
textos largos o enlaces. Generar un esquema completo a partir de un tema,
un texto largo pegado o un enlace a una página web sigue existiendo, pero
**solo** dentro del Modo Lector (el botón "🌐 Generar Esquema del texto o
tema" del panel de lectura) — que es donde ya tenía sentido "investigar" en
vez de solo anotar algo. También actualicé el placeholder, el título (tooltip)
del campo y el texto de ayuda de la cabecera para que digan esto con claridad.

Los demás puntos de entrada a "generar esquema completo" (el botón 🎲 de
sorpresa, las sugerencias de tema de la pantalla de bienvenida) no se
tocaron — siguen funcionando igual que antes, porque no pasan por
`handleTopicInput()`.

### b) Los paneles flotantes ya no quedan debajo de sus iguales ni del Modo Lector

Había dos causas distintas para que un panel nuevo (definición, Explicación
sencilla, Reto Socrático) apareciera tapado por otro, o exactamente en el
mismo lugar que otro:

1. **Bug de contexto de apilamiento en CSS (la causa de "por debajo de
   otro")**: el Modo Lector vivía en el HTML como **hermano** de la capa de
   paneles flotantes (`#floatingPanelsLayer`), no como hijo suyo. Esa capa
   tiene `position: absolute` + un `z-index` propio (20), y en CSS eso crea
   su propio "contexto de apilamiento": todo lo que esté DENTRO de esa capa
   compite en z-index solo entre sí, sin que nada de fuera pueda intercalarse
   — ni para quedar arriba, ni para quedar abajo. El Modo Lector, al estar
   fuera, siempre terminaba por encima o por debajo de TODOS los paneles de
   definición, sin importar cuál se hubiera tocado de último (el sistema que
   sube el z-index al hacer clic en un panel para traerlo al frente nunca
   lograba ponerlo por encima del Modo Lector, porque viven en "mundos"
   distintos de apilamiento). Arreglado moviendo el `#readerPanel` para que
   sea hijo de `#floatingPanelsLayer` en el HTML: ahora compite de igual a
   igual con los demás paneles por el mismo z-index compartido, y el que se
   tocó de último manda, sea cual sea.

2. **Bug de posición repetida (la causa de "en el mismo lugar")**: cada panel
   nuevo se colocaba en un escalón de posición calculado con
   `openFloatingPanels.size % 6` — es decir, "cuántos paneles hay abiertos
   AHORA". El problema: si cerrabas un panel y abrías otro, ese número volvía
   a repetirse, y el panel nuevo caía exactamente en el mismo escalón (mismo
   `left`/`top` en pantalla) que uno que seguía abierto. Arreglado usando en
   su lugar el contador global que nunca se reinicia (`floatingPanelCount`,
   el mismo que ya se usaba para el z-index), así cada panel nuevo cae en un
   escalón distinto al de cualquier otro que siga abierto, sin importar
   cuántos se hayan cerrado entre medio. De paso subí el ciclo de 6 a 10
   escalones para que el patrón de cascada tarde más en repetirse.

## Archivos modificados en esta ronda

- `app.js` — `findFreeSpot`/`flashNewNode` (nodo suelto visible);
  `insertSingleNode` actualizado; spinner en el panel de "Ver definición";
  handlers de Antítesis y Sinergia actualizados para título corto +
  `definition` pregenerada; `cacheIsUsable` y el render del panel reconocen
  `definitionSource: 'pregenerated'`.
- `netlify/functions/gemini.js` — esquemas de `antithesis` y `synergy` ahora
  piden `label` (corto) y `explanation` (completo) por separado, con las
  instrucciones del prompt actualizadas; nueva acción `simple_explanation`
  (sección 12 de este documento).
- `netlify/functions/_lib/billing.js` — `simple_explanation` agregada a
  `KNOWN` y a `FREE` (no gasta nodos, igual que `define`).
- `app.js` — las 10 llamadas a `gemini.js` que usaban `fetch()` directo
  (parse_text, expand, examples, synergy, connect, custom_prompt ×2,
  antithesis, socratic_question, socratic_evaluate) ahora usan `apiFetch` y
  `handleBillingError` (sección 13 de este documento).
- `netlify/functions/read-webpage.js` (nuevo) — lee una página web y extrae
  su texto principal (sección 14).
- `app.js` — `looksLikeYouTubeLink`/`resolveTextOrYouTubeLink` reemplazadas
  por `looksLikeWebLink`/`resolveTextOrWebLink`, usadas tanto en el campo de
  la cabecera como en el Modo Lector.
- `index.html` — textos de la cabecera y el Modo Lector actualizados (ya no
  mencionan YouTube/video, mencionan enlaces web).
- `package.json` — agregadas las dependencias `@mozilla/readability` y
  `jsdom`.
- `app.js` — bloque "0. COBRO MANUAL" (constantes `SUPPORT_WHATSAPP_NUMBER`,
  `SUPPORT_EMAIL`, `AUTOMATIC_PAYMENTS_ENABLED`); `updateManualPurchaseBox()` y
  `openStoreModal()` nuevas; `initPaypalButtons` ahora respeta
  `AUTOMATIC_PAYMENTS_ENABLED`.
- `index.html` — la tienda ya no lista paquetes con precio: el botón de
  PayPal y las 3 tarjetas de paquete se reemplazaron por un botón de
  WhatsApp (con el logo oficial) y el correo como texto plano debajo. El
  contenedor de PayPal queda oculto pero intacto en el HTML. **Nota para
  cuando se reactive el pago automático**: ese flujo (`createOrder`/
  `onApprove` en `app.js`) espera un `input[name="nodePackage"]` marcado, que
  ya no existe en este HTML — habrá que devolverle al modal algún selector de
  paquete/precio en ese momento.

## 16. Siete ajustes sobre "Limpiar", el Modo Lector, Sinergia y edición de nodos

### a) "Limpiar" ahora también cierra los paneles flotantes (y no toca el Modo Lector)

Antes, "Limpiar" (botón de la barra superior) borraba todos los nodos/enlaces
del lienzo pero dejaba abiertos los paneles flotantes de "Ver definición",
"Explicación sencilla", etc. — quedaban "huérfanos", apuntando a nodos que ya
no existían. Ahora Limpiar también los cierra a todos. El Modo Lector (el
panel principal y cualquier panel adicional, ver punto g) **no se toca**: si
ya tenías un texto o enlace pegado ahí, sigue intacto después de limpiar el
lienzo.

### b) El Modo Lector ahora se ve abierto desde que entras a la app

Antes había que hacer clic en "Pegar documento / enlace (Modo Lector)" para
verlo. Ahora nace visible, en la posición y con una forma más cuadrada
(480×560px) — es el punto de partida recomendado para generar tu primer
esquema, así que no tenía sentido que estuviera escondido.

### c) El botón azul ahora dice solo "Generar Esquema"

Antes decía "Generar Esquema del texto o tema" — se acortó a "Generar
Esquema", sin perder funcionalidad.

### d) Pista de inicio dentro del lector, con el enlace resaltado

El cuadro de texto del lector ahora muestra, mientras está vacío: "Pega aquí
un texto o **🔗 un enlace**", con la parte del enlace resaltada en un color
aparte (morado/índigo) y una insignia "Recomendado" — para que, de un
vistazo, quede claro que pegar un enlace es una vía fuerte y es el mejor
punto de partida, sin dejar de mencionar que un texto pegado a mano también
funciona. Desaparece sola en cuanto escribes o pegas algo.

### e) Ahora se puede editar el texto de un nodo

Nuevo ítem **✏️ Editar texto** en el menú de cualquier nodo (junto a "Ver
definición"). Abre un cuadro simple para escribir el nuevo texto (ya viene
con el texto actual, sin los `*` de negrita), y al guardar actualiza tanto lo
que se ve en el lienzo como el título interno del nodo (usado en menús,
definiciones futuras, etc.). Si el nodo tenía un ícono especial al inicio
(🌟 de Sinergia, ⚡ de Antítesis), se conserva.

### f) Sinergia ya no agrega nodos "puente" intermedios

La generación es exactamente la misma de antes (mismo llamado a Gemini,
mismo costo en nodos) — el servidor sigue pensando en "puentes" conceptuales
entre los dos temas que fusionas y el nodo de Sinergia resultante. Lo único
que cambió es que esos puentes ya no se dibujan como nodos aparte en el
lienzo: ahora se conecta directo cada tema original → el nodo de Sinergia,
usando el nombre de cada puente como la etiqueta de esa línea (en vez de
como un nodo), para no perder la idea sin ensuciar el esquema con nodos de
más.

### g) Se pueden abrir varios lectores a la vez, sin que se mezclen

Nuevo botón **➕** en la cabecera del Modo Lector (en el panel principal y en
cualquier panel adicional). Cada clic abre una copia independiente del
panel: su propio cuadro de texto, su propio contexto de documento detectado,
y su propio botón "Generar Esquema" — nada se comparte entre paneles. Puedes
pegar un texto/enlace en uno, otro texto/enlace distinto en otro, y generar
dos (o más) esquemas por separado sin que el contenido de uno se filtre al
otro. Cada panel adicional se cierra con su propia ✕ sin afectar a los demás.

**Limitación conocida, menor:** el "contexto de documento" que usan después
las definiciones/ejemplos de un nodo (para desambiguar, ej. "Mercurio" el
planeta vs. el elemento) sigue siendo uno solo para toda la app — viene del
panel principal. Si generas dos esquemas distintos desde dos lectores, las
definiciones de ambos usarán ese mismo contexto general. No es un problema
nuevo (la app nunca distinguió contexto por esquema), pero vale mencionarlo
por si en algún momento quieres que cada esquema "recuerde" su propio
contexto por separado — sería un cambio más grande, avísame si te interesa.

## 17. Los alert()/confirm()/prompt() del navegador ahora son modales propios de la app

Quedó pendiente de una recomendación anterior: todos los avisos, preguntas de
sí/no y cuadros para escribir texto que usaba la app venían de las funciones
nativas del navegador (`alert()`, `confirm()`, `prompt()`) — esos cuadros
grises, feos, que bloquean TODA la pestaña (hasta la animación del loader se
congelaba) y que no se pueden vestir con el estilo de la app. Ya se
reemplazaron **todos** (34 `alert()`, 6 `confirm()`, 1 `prompt()` — cada uno
revisado uno por uno) por un modal propio, `#appDialogModal` en `index.html`,
con el mismo estilo que los demás modales de la app (la tienda, el muro de
login, la ayuda).

### Cómo funciona

Tres funciones nuevas en `app.js` (sección "DIÁLOGOS PROPIOS DE LA APP",
cerca del principio del archivo), que se usan igual que las nativas pero con
`await` porque el modal no bloquea el código — espera a que el usuario haga
clic:

```js
await appAlert("mensaje");                       // antes: alert("mensaje")
if (await appConfirm("¿Seguro?")) { ... }         // antes: if (confirm("¿Seguro?")) { ... }
const texto = await appPrompt("Nombre:", "valor") // antes: prompt("Nombre:", "valor")
```

Cada `confirm()`/`prompt()` que se reemplazó vivía dentro de una función que
no era `async` (los `alert()` no necesitaban esto porque no se usa su
resultado) — esas funciones/manejadores de clic se marcaron `async` para
poder usar `await` ahí. Verifiqué con el intérprete de Node que no quedó
ningún `await` fuera de una función `async` (eso sí sería un error real, sin
excepción) antes de entregar esta versión.

### Detalle de diseño

- Solo puede haber un diálogo visible a la vez: si se pide uno mientras otro
  ya está abierto (p. ej. dos errores seguidos de la red), se encola y
  espera su turno en vez de superponerse o perderse.
- Funciona con teclado: Enter confirma (el botón principal), Escape cancela.
- Si por algún motivo el HTML del modal no cargara, hay una red de
  seguridad que cae de vuelta a los diálogos nativos del navegador en vez de
  dejar al usuario sin ningún aviso — no debería pasar nunca en condiciones
  normales, pero es más seguro que fallar en silencio.
- Los textos de los botones ahora pueden ser específicos en vez del genérico
  "Aceptar/Cancelar" (ej. "Sí, nuevo proyecto" / "No, seguir en este"), lo
  que hace más claro qué hace cada opción sin tener que leer un párrafo de
  explicación dentro del mensaje.

### Otras recomendaciones de antes que sigan sin implementarse

Hice memoria repasando este mismo documento (LEEME) en busca de cualquier
otra recomendación mía que hubiera quedado "pendiente, sin resolver" — y lo
único que encontré con esas palabras es la extracción de subtítulos de
YouTube (sección 7/8), que ya no aplica: ese flujo se **quitó por completo**
de la app (sección 14) y se reemplazó por la lectura de páginas web. No hay
ninguna otra recomendación mía registrada aquí como pendiente.

Debo ser honesto en un punto: el historial de conversación de antes de hoy
se resume automáticamente cuando crece demasiado (así sigo funcionando sin
perder el hilo del proyecto), y ese resumen no necesariamente capturó cada
comentario suelto que haya hecho en su momento — como evidentemente pasó con
esta recomendación de los modales, que no quedé con un registro escrito de
ella hasta que la mencionaste ahora. Si recuerdas alguna otra sugerencia
mía de sesiones anteriores que no se haya hecho, dímela y la reviso.

## 18. Dos bugs del lector adicional (➕): texto copiado y esquemas traslapados

### a) Un panel de lector nuevo ya no copia el texto del que lo originó

`createExtraReaderPanel()` clona el HTML del panel principal con
`cloneNode(true)` para crear cada panel adicional — pero eso clona el DOM
**tal cual está en ese momento**, así que si el panel de donde hiciste clic
en ➕ ya tenía texto escrito, el panel nuevo nacía con una copia de ese mismo
texto en vez de empezar vacío. Ahora, justo después de clonar, se limpian
explícitamente el texto, el contexto detectado y la pista de inicio del
clon, así que todo panel nuevo arranca siempre en blanco, sin importar qué
tenía el panel desde el que lo abriste.

### b) Dos esquemas generados desde paneles distintos ya no se traslapan

`renderThreeLevelTree()` (la función que dibuja el árbol de un esquema
nuevo) usaba un desplazamiento fijo de 900px desde el centro de la vista
cuando elegías "agregar al actual" en vez de limpiar el lienzo. Ese número
fijo fallaba en más de un caso: si el esquema que ya estaba ahí era más
ancho que 900px, o si la cámara no estaba centrada exactamente sobre él
(por ejemplo, porque lo generaste desde un segundo panel de lector con la
vista en otro lado), el esquema nuevo terminaba cayendo parcialmente encima
del que ya existía — justo lo que viste.

Ahora, en vez de un número fijo, se calcula el **borde derecho real** de
absolutamente todo lo que ya hay en el lienzo (usando las posiciones
actuales de los nodos, se hayan movido o no) y el esquema nuevo se coloca
a la derecha de ese borde, con margen de sobra calculado a partir del ancho
que va a ocupar el árbol nuevo (según cuántas ramas/sub-ramas tenga). Así
los dos esquemas quedan siempre completamente separados, sin importar desde
qué panel de lector se generó cada uno ni hacia dónde esté mirando la
cámara en ese momento.

## 19. Nuevo ítem de menú: "Generar esquema completo a partir de aquí"

Al hacer clic en un nodo, al final de la lista de acciones (justo antes del
pie con "Eliminar") hay un ítem nuevo: **🌐 Generar esquema completo a
partir de aquí**. Toma el texto de ese nodo y lo trata exactamente como si
lo hubieras escrito en el campo "Generar" de la cabecera y hubieras
presionado el botón — llama a la misma función de siempre
(`generateFullSchemaFromTopic`), así que el comportamiento es idéntico en
todo: mismo costo en nodos, mismo diálogo de "¿deseas limpiar el lienzo?" si
ya hay algo más dibujado, y el mismo arreglo reciente de posicionamiento
(sección 18b) para que el esquema nuevo no se traslape con lo que ya había.

Es útil para "profundizar en serio" sobre un concepto que surgió como nodo
suelto o como parte de otro esquema — en vez de limitarte a Conceptos
Relacionados/Ejemplos (que agregan unos pocos nodos), genera un árbol
completo nuevo a partir de ese concepto, igual de completo que si hubieras
empezado desde cero con ese tema.

## 20. Interactividad texto↔esquema

Esta ronda conecta el texto pegado en el Modo Lector con el esquema generado
a partir de él, para que dejen de ser dos cosas separadas. La base: cuando
generas un esquema **desde un documento** (no desde un tema corto escrito a
mano), cada nodo guarda una `sourceQuote` — una cita literal y breve, copiada
tal cual del texto, que es la evidencia de por qué ese nodo existe — y un
`originPanelId`, que identifica de cuál Modo Lector (el principal o alguno de
los adicionales ➕) salió. Lo demás de esta sección se apoya en esos dos
datos. (Nota: la primera versión de esta ronda incluía además "Sugerir
términos clave" y un revelado animado nodo-por-nodo; ambas se quitaron en la
sección 21 porque no funcionaban bien.)

### a) 📍 "Ver en el texto" (ítem del menú de nodo)

Al hacer clic en cualquier nodo que venga de un documento, hay un botón
**📍 Ver en el texto** (justo después de "✏️ Editar texto"). Al pulsarlo, la
app abre (o enfoca, si ya estaba abierto) el panel de lectura exacto de donde
salió ese nodo, hace scroll hasta la cita correspondiente y la destella en
amarillo un par de segundos. Si el nodo no vino de un documento, avisa que no
tiene una cita asociada.

### b) Resaltado permanente de "lo que ya se convirtió en nodo", a juego de color con su nodo

Después de generar un esquema desde un documento, cada cita que se usó para
crear un nodo queda subrayada de forma permanente en el texto — y con el
**mismo color** que el nodo correspondiente en el lienzo (ver sección 21c).
De un vistazo ves qué partes del documento ya "pasaron" al esquema, cuáles
todavía no, y cuál nodo le corresponde a cuál fragmento por el color.

### c) Clic en un fragmento resaltado → acercamiento a su nodo

Si haces clic sobre cualquier fragmento ya resaltado en el texto, la cámara
del lienzo se acerca y selecciona el nodo correspondiente, con un pequeño
destello para ubicarlo de inmediato. Es el camino inverso a "Ver en el
texto": de texto a esquema en vez de esquema a texto.

### d) El esquema "sigue" la lectura según por dónde vas con el scroll

Mientras haces scroll dentro de un panel de lectura, los nodos cuyas citas
están actualmente visibles en pantalla se resaltan en el lienzo y el resto
del esquema se atenúa — así, sin hacer nada más que leer, siempre tienes a
la vista qué parte del esquema corresponde a lo que estás leyendo en ese
momento.

### e) Arrastrar un fragmento subrayado directo al lienzo

Además del tooltip "⚡ Crear elemento en esquema", puedes seleccionar un
fragmento en cualquier panel de lectura y arrastrarlo (como arrastrarías
cualquier texto seleccionado) y soltarlo en el lienzo. El nodo nuevo se crea
exactamente en el punto donde lo soltaste.

### f) "🔗 Vincular a nodo..." — adjuntar la selección como hijo de un nodo ya existente

El tooltip de selección del lector tiene un segundo botón. Antes, "⚡ Crear
elemento en esquema" siempre dejaba el nodo nuevo suelto. Con
**🔗 Vincular a nodo...**, la app espera a que hagas clic en cualquier nodo
del lienzo y crea el nodo nuevo ya conectado como hijo de ese nodo elegido.
Si en vez de un nodo le das clic al lienzo vacío, se cancela sin crear nada.

### g) Sugerencia descartable: "estos dos fragmentos están cerca, ¿los vinculo?"

Después de generar un esquema desde un documento, si dos nodos de ramas
distintas tienen sus citas muy cerca una de la otra en el texto original (y
todavía no están conectados), aparece un aviso discreto abajo del lienzo:
*"'X' y 'Y' aparecen muy cerca en el texto. ¿Vincularlos?"*, con botones
**Vincular** / **Descartar**. Nunca se crea el vínculo solo, y el aviso
desaparece solo a los 14 segundos si no lo atiendes.

## 21. Correcciones y dos ideas nuevas sobre lo anterior

### a) Se quitó el revelado animado ("esquema armándose en vivo")

No se veía bien, así que se quitó por completo. Los esquemas vuelven a
aparecer de una sola vez, como siempre.

### b) Se quitó "🔑 Sugerir términos clave"

Tampoco funcionaba bien, así que se quitó el botón, los chips y la llamada a
la IA que los generaba. (La acción `extract_key_terms` sigue existiendo en el
servidor por si en el futuro quieres retomar esta idea con otro enfoque, pero
ya no la llama nada del frontend.)

### c) Los nodos ahora toman el color del resaltado de su cita en el texto

Antes, el color de cada nodo era aleatorio (de una paleta neutra) y el
resaltado del texto era siempre el mismo verde agua. Ahora hay una paleta de
6 colores de resaltado (teal, amarillo, índigo, rosa, verde, naranja) que se
reparte en ciclo entre los nodos que SÍ tienen una cita del documento — y esa
cita, en el texto, se pinta exactamente con ese mismo color. Así el color deja
de ser decorativo y se vuelve una pista visual: nodos del mismo color
destacado remiten al mismo tipo de fragmento, y es fácil emparejar "este
nodo" con "ese pedazo de texto" solo por el color, sin tener que hacer clic.
Los colores se repiten cíclicamente si hay más nodos que colores en la
paleta — eso es intencional, no un error. (Los esquemas generados solo a
partir de un tema corto, sin documento de por medio, siguen usando la paleta
neutra de siempre, porque no hay ningún texto con el que hacer juego.)

### d) "Generar esquema completo a partir de aquí" ya no pregunta por limpiar, y parte del nodo existente

Dos ajustes al ítem de menú **🌐 Generar esquema completo a partir de aquí**
(sección 19):

1. Ya **no** pregunta "¿Deseas limpiar el lienzo?" — siempre se agrega al
   esquema actual, porque tiene sentido: estás expandiendo un nodo que ya
   está ahí, no empezando de cero.
2. El esquema nuevo **parte directamente del nodo que ya tenías** en vez de
   crear una raíz aparte y dejarla flotando sin relación visual con el resto.
   Las ramas nuevas se conectan directo a ese nodo existente (que conserva su
   texto, color y posición tal cual estaban) y se acomodan alrededor de él;
   la cámara se acerca a esa zona en vez de alejarse para que quepa todo el
   lienzo.

### Archivos tocados en esta ronda (20 y 21 juntas)

- `netlify/functions/gemini.js`: `parse_text` pide y devuelve `sourceQuote`
  por nodo; queda también `extract_key_terms` (sin usarse desde el frontend,
  ver 21b).
- `netlify/functions/_lib/billing.js`: `extract_key_terms` registrada como
  acción conocida y gratuita (sin usarse desde el frontend).
- `app.js`: registro de paneles de lectura (`readerPanelRegistry`), paleta de
  colores de resaltado compartida entre nodo y texto, resaltado de cobertura,
  "Ver en el texto", clic en texto resaltado → nodo, enfoque por scroll,
  arrastrar al lienzo, "Vincular a nodo...", sugerencia de vínculo por
  proximidad, y la nueva lógica de `attachToNodeId` en
  `renderThreeLevelTree`/`generateFullSchemaFromTopic`.
- `index.html`: nuevo botón del menú ("📍 Ver en el texto"), nuevo botón del
  tooltip de selección ("🔗 Vincular a nodo..."), estilos del resaltado de
  texto (ahora con color dinámico en vez de uno fijo).

## 22. Experiencia, organicidad y claridad de importancia (sin 3D ni layout tipo sistema solar, por ahora)

A partir del brainstorm de 4 preguntas, se implementó todo lo que no
necesitaba 3D ni el layout radial tipo "sistema solar" (esos dos quedan
pendientes, a propósito, para evaluarlos aparte).

### Experiencia de usuario más interesante

- **Buscador rápido (Ctrl/Cmd+K o botón "🔍 Buscar")**: abre una paleta de
  búsqueda flotante; escribes parte del texto de un nodo y aparece en la
  lista; clic (o Enter sobre un resultado) y la cámara salta directo a ese
  nodo, con el mismo pulso visual que al crear un nodo nuevo. `Esc` la cierra.
- **"▶️ Replay"**: reproduce la aparición del esquema actual, nodo por nodo,
  en orden de profundidad (primero las raíces, luego ramas, luego
  sub-ramas) — útil para explicar el esquema a alguien más sin tener que
  reconstruirlo desde cero.
- **"🎯 Modo foco"**: calcula qué nodos son los más conectados (el 30% con
  más vínculos) y atenúa el resto al 22% de opacidad, para que resalte de
  un vistazo qué es lo más central del esquema. Se puede prender/apagar.
- **"🖥️ Presentación"**: oculta la barra superior y todos los paneles
  (lector y flotantes) y deja solo el lienzo visible — ideal para mostrar el
  esquema en una pantalla compartida sin que distraigan los controles. Un
  botón "✕ Salir de presentación" (o `Esc`) la cierra y todo vuelve a
  aparecer exactamente como estaba.
- **Sonido opcional ("🔇/🔊")**: una campanita de cristal muy breve
  (sintetizada con Web Audio, no es un archivo de audio) que suena cada vez
  que aparece un nodo nuevo, en cualquier función de la app (no solo al
  generar esquemas). Apagado por omisión; se prende con el botón.
- **Minimapa** (esquina inferior derecha): una vista reducida de todo el
  esquema con un recuadro que marca qué parte de ese esquema estás viendo
  ahora. Clic en cualquier punto del minimapa y la cámara viaja ahí.
- **Zoom semántico**: si acercas mucho la cámara a un nodo que ya tiene una
  definición generada, aparece automáticamente un adelanto de esa
  definición junto al nodo (sin tener que hacer clic en nada). Al alejar la
  cámara o quitar el cursor del nodo, desaparece solo.

### Organicidad

- **Asentado físico orgánico**: cuando se agregan nodos nuevos (al generar
  un esquema, o añadir uno a partir de un nodo existente), ya no aparecen
  "congelados" en su posición geométrica final — quedan libres un instante
  con una física suave de repulsión mientras el resto del esquema se queda
  fijo, y decantan a un acomodo natural antes de asentarse solos (reutiliza
  el mismo mecanismo que ya apagaba la física automáticamente al
  estabilizarse).
- **Conectores curvos**: esto en realidad ya estaba — las líneas entre
  nodos siempre han sido curvas dinámicas (`smooth: { type: 'dynamic' }`),
  no se necesitó ningún cambio.
- **Aura por rama**: cada rama principal y sus sub-ramas ahora tienen un
  halo de color muy suave (del mismo color del borde de la rama) dibujado
  detrás de ellas en el lienzo, como una "burbuja" que agrupa visualmente
  ese conjunto sin necesidad de dibujar un contorno duro ni mover nada.

### Claridad de importancia de conceptos

- **Tamaño/sombra por grado de conexión**: los nodos con más vínculos se
  dibujan con un borde más grueso y una sombra más amplia que los nodos con
  pocos o ningún vínculo — se recalcula solo, en vivo, cada vez que se
  agrega o quita un nodo o una conexión.
- **Grosor de enlace por jerarquía**: las conexiones raíz→rama se dibujan
  más gruesas que las de rama→sub-rama, reforzando visualmente qué nivel es
  más "principal". (Las conexiones de otras funciones — ejemplos,
  antítesis, sugerencias de vínculo, etc. — no se tocan, conservan su
  estilo propio.)
- El "Modo foco" de la sección anterior también cumple este propósito desde
  otro ángulo (atenuar lo periférico en vez de resaltar lo central).

### Archivos tocados en esta ronda

- `app.js`: `settleNewNodesOrganically`, bloque completo de sonido
  (`playChime`/`soundEnabled`), buscador rápido, "Replay", "Modo foco",
  "Modo presentación", minimapa (dibujo + clic-para-navegar), zoom semántico
  (`hoverNode`/`blurNode`/`zoom`),
  `applyImportanceStyling` (enganchada a los eventos `add`/`remove` de los
  DataSets de nodos y aristas), aura por rama (hook `beforeDrawing` del
  lienzo), y el campo `depthLevel` (0/1/2) agregado a cada nodo al crearlo
  en `renderThreeLevelTree` (usado por el orden del Replay, el grosor de
  enlace y la agrupación por rama).
- `index.html`: botones nuevos en la barra superior ("🔍 Buscar", "▶️
  Replay", "🎯 Modo foco", "🖥️ Presentación", sonido), botón flotante
  "✕ Salir de presentación", paleta de búsqueda (`#searchPalette`) y
  minimapa (`#minimapContainer`/`#minimapCanvas`).

### Pendiente, a propósito

- Layout tipo "sistema solar" (radial) — no implementado aún, para
  comparar primero cómo se ve todo lo anterior con el layout actual.
- 3D — no implementado, mismo motivo.

## 23. Dos ajustes finos sobre texto↔esquema

### a) Si el nodo al que se salta queda tapado por un panel, la cámara se corre para que se vea

Antes, al hacer clic en un fragmento resaltado del texto (o en un texto
vinculado manualmente a un nodo), el lienzo simplemente se centraba en ese
nodo — y si el panel del lector (u otro panel flotante) estaba encima de esa
zona del lienzo, el nodo podía terminar "centrado" pero tapado detrás del
panel. Ahora, antes de saltar, se revisa si el centrado normal caería tapado
por algún panel visible; si es así, la cámara se corre hacia el espacio
libre del lienzo que sí se ve (el borde con más espacio: derecha, izquierda,
arriba o abajo del panel) en vez de hacia el centro geométrico, para que el
nodo quede realmente visible.

### b) Al generar nodos nuevos más precisos, el resaltado del texto ahora se reparte entre el nodo viejo y el nuevo

Antes, si un nodo ya tenía una cita amplia resaltada en el texto y luego se
generaba (p. ej. con "🌐 Generar esquema completo a partir de aquí") un nodo
nuevo cuya cita era un fragmento más preciso DENTRO de esa misma cita
amplia, el resaltado completo se quedaba apuntando solo al nodo original —
el nodo nuevo, aunque más exacto para ese pedacito de texto, no se reflejaba
en el resaltado. Ahora, cuando dos citas se solapan, la más corta (casi
siempre la más específica) se queda con ese fragmento puntual del texto, y
la cita más amplia conserva el resto a su alrededor — así el resaltado
termina repartido entre ambos nodos, cada uno dueño de la parte que describe
con más precisión.

### Archivos tocados

- `app.js`: nueva función `focusNodeAvoidingOverlays` (usada por el clic en
  texto resaltado y por el texto vinculado manualmente a un nodo); reescritura
  de `buildHighlightedMarkup` para resolver solapes por especificidad en vez
  de simplemente priorizar la cita más larga.

## 24. El esquema ahora "sigue" al texto también cuando el nodo está fuera de pantalla, y el cálculo de espacio libre quedó más preciso

### a) El cálculo de "espacio libre" ya toma en cuenta bien los paneles movidos o agrandados

El ajuste anterior (sección 23a) calculaba el espacio libre asumiendo que
los paneles tapaban franjas completas del lienzo (todo el borde izquierdo,
todo el borde superior, etc.). Si movías el panel del lector a, por ejemplo,
una esquina (sin que tocara un borde entero), ese cálculo subestimaba el
espacio libre real y terminaba centrando el nodo igual detrás del panel.
Ahora se calcula el espacio libre de verdad: se resta el área exacta de cada
panel visible del lienzo (como "recortar" un hueco de una hoja) y se usa el
pedazo libre más grande que quede, sin importar en qué esquina o posición
esté el panel. Esto se recalcula cada vez — si moviste o agrandaste el
panel justo antes de hacer clic en el texto, ya lo toma en cuenta.

### b) Al leer, si el nodo correspondiente no se ve en el lienzo, la cámara se mueve sola

Antes, el "enfoque por scroll" (sección 20c) solo atenuaba/resaltaba nodos
según qué cita estuviera visible en el texto, pero nunca movía la cámara —
si el esquema estaba con zoom en otra parte, el nodo correspondiente se
resaltaba pero seguía sin verse. Ahora, cada vez que el scroll trae a la
vista una cita nueva, se revisa si el nodo (o nodos) correspondientes ya se
ven bien en el lienzo (dentro del área visible y sin quedar tapados por
ningún panel). Si no se ven:

- **Un solo nodo**: la cámara se traslada hasta dejarlo visible, sin tocar
  el nivel de zoom actual (solo "paneo", como pediste).
- **Varios nodos a la vez**: se hace zoom (ajustando la escala) para que
  todos entren a la vez en el espacio libre del lienzo, en vez de mostrar
  solo uno.

Si los nodos ya se ven bien, no se mueve nada — para no estar moviendo la
cámara de más mientras lees algo cuyo esquema ya está a la vista.

### Archivos tocados

- `app.js`: `getVisibleOverlayRects`, `subtractRect`/`computeFreeRects`/
  `pickBestFreeRect` (resta real de rectángulos en vez del cálculo por
  bandas), `isPointFree`/`isNodeVisibleOnCanvas`, `fitNodesAvoidingOverlays`
  (encuadre de varios nodos a la vez), y `updateScrollFocus` ahora también
  dispara el traslado/zoom automático cuando corresponde.

## 25. Prueba: layout tipo "sistema solar" (radial)

A pedido tuyo, se activó como PRUEBA (para ver cómo se siente) el layout
radial que habíamos dejado pendiente: en vez del árbol de bloques
horizontales de siempre, las ramas ahora quedan repartidas en círculo
alrededor de la raíz (como planetas orbitando el sol), y las sub-ramas de
cada rama se abren en abanico hacia afuera de esa rama (como lunas), nunca
hacia el centro, para no cruzarse con las ramas vecinas.

Esto reemplaza directamente el acomodo anterior (no quedó como opción
alternable) — si no te convence, avísame y lo revierto al árbol de bloques
de antes sin problema; no se perdió ese código, solo se reemplazó.

Detalles:
- El radio de la órbita de las ramas crece solo si hay muchas (para que no
  queden amontonadas); con una sola rama, igual queda separada de la raíz.
- Después de ubicarlas, sigue aplicándose el mismo asentado físico orgánico
  de la sección 22 — así que el resultado final no es un círculo
  perfectamente geométrico, decanta un poco para verse más natural.
- "Agregar al actual" (cuando ya hay algo en el lienzo) sigue calculando
  bien el espacio para que el nuevo "sistema" no se traslape con el que ya
  existía, usando el radio total del nuevo árbol en vez del ancho que usaba
  el layout anterior.

### Archivos tocados

- `app.js`: `renderThreeLevelTree` — se reemplazó el cálculo de posiciones
  de ramas/sub-ramas (antes en bloques horizontales por columnas) por el
  cálculo radial (órbitas); el resto de la función (creación de nodos,
  colores, asentado orgánico, encuadre de cámara, etc.) no cambió.

## 26. Número de WhatsApp real + pantalla de contacto más elegante

### a) El botón de WhatsApp ahora sí te contacta a ti

El número que tenía el botón era un número de relleno (`50600000000`) que
dejé puesto desde el inicio como ejemplo — nunca era tu número real, así
que si alguien le daba clic, WhatsApp intentaba abrir ese número ficticio
(que probablemente ni existe) y el mensaje nunca te llegaba. Ya quedó
puesto tu número real: `50687772993`.

### b) La pantalla de "ya se te acabaron los nodos" quedó más elegante

Antes era un bloque simple con texto chico. Ahora:

- Encabezado más cálido: **"Contáctanos para seguir usando la aplicación"**,
  con una frase corta debajo invitando a escribir.
- El ícono de WhatsApp quedó más grande y nítido, con un efecto sutil al
  pasar el mouse por encima del botón.
- El correo (`bonillapretiz@gmail.com`) ahora se ve grande y en negrita,
  separado del botón de WhatsApp con un pequeño divisor "o al correo" — y
  además es clicable (abre el programa de correo directo, con `mailto:`).
- El mensaje que se manda por WhatsApp también quedó más cercano: "¡Hola! 👋
  Ya usé mis nodos disponibles en Graphikosmos y quiero seguir creando
  esquemas. Mi correo de la cuenta es: ...".

### Archivos tocados

- `app.js`: `SUPPORT_WHATSAPP_NUMBER` con el número real; mensaje de
  WhatsApp con tono más cercano; `updateManualPurchaseBox` ahora también
  rellena el `href` del correo (`mailto:`).
- `index.html`: rediseño completo del bloque de contacto dentro de
  `#storeModal` (ícono, encabezado, botón de WhatsApp, divisor, correo
  grande y clicable).

## 27. El nodo se resalta mientras su menú está abierto (y "Ver en el texto" ya restaura su opacidad)

Primer intento: hacer que CADA clic en un nodo saltara también al texto —
pero pensándolo mejor, para eso ya existe el botón del menú ("📍 Ver en el
texto"), así que esa parte se revirtió. Lo que sí hacía falta era otra cosa:
que al hacer clic en un nodo y abrírsele el menú, se sintiera que el menú
"salió" de ese nodo — ahora mismo no quedaba claro cuál nodo estaba
seleccionado.

- Mientras el menú contextual está abierto, el nodo sobre el que se abrió
  queda con un borde y un resplandor más marcados, para que sea evidente de
  cuál nodo salió el menú.
- Apenas el menú se cierra (por cualquier motivo: elegir una acción, hacer
  clic afuera, hacer zoom, etc.), el nodo vuelve solo a su aspecto normal
  — recalculado con el mismo criterio de importancia de la sección 22 (borde
  y sombra según cuántas conexiones tiene), no un valor fijo.
- De paso quedó un ajuste chico en "📍 Ver en el texto": si el nodo estaba
  atenuado por el enfoque-por-scroll (sección 24b) porque su cita no estaba
  en la parte visible del texto, al usar ese botón el nodo recupera su
  opacidad normal de inmediato, sin esperar a que el scroll lo note por su
  cuenta.

### Archivos tocados

- `app.js`: `setNodeMenuHighlight`/`clearNodeMenuHighlight` (con un
  observador que limpia el resaltado en cuanto el menú se oculta, sin
  importar por dónde se cerró); `locateNodeInText` ahora también restaura
  la opacidad del nodo al usarlo.

## 28. Menú del nodo reorganizado en grupos + se quitó el selector de Densidad/Ramas

### a) Menú más corto, con dos submenús

El menú que aparece al hacer clic en un nodo tenía demasiados ítems sueltos
al mismo nivel. Ahora queda así:

**Siempre visibles:**
1. Ver definición
2. 💡 Explicación sencilla
3. Prompt personalizado
4. 🌐 Generar esquema completo a partir de aquí
5. ✏️ Editar
6. 🔗 **Enlazar** (al pasar el mouse, o con un toque en pantallas táctiles,
   despliega: *Vincular con...*, *Generar Sinergia con...*, *Ver en el texto*)
7. ✨ **Generar** (despliega: *Conceptos Relacionados*, *Cuestionar/Antítesis*,
   *Ponme a prueba*, *Ejemplos Prácticos*)
8. Eliminar (al pie, como siempre)

("🔍 Expandir subesquema" sigue apareciendo, pero solo para los nodos que
SÍ son un subesquema colapsado — igual que antes.)

Cada submenú se abre solo (nunca dos a la vez), se posiciona a la derecha
del menú principal o a la izquierda si no hay espacio, y todas las acciones
de adentro son exactamente las mismas de siempre (mismo costo, mismo
comportamiento) — solo cambió dónde viven dentro del menú.

### b) Se quitó el selector de "Densidad / Ramas"

Vivía arriba del menú del nodo y dejaba elegir cuántas ramas pedirle a la IA
(2 a 6, o "Auto"). Como no se iba a usar, se quitó del menú — el
comportamiento por defecto ("Auto": la IA decide cuántas según relevancia)
queda fijo, igual que ya era el valor por omisión.

### Archivos tocados

- `index.html`: reestructuración completa de `#actionMenu` (se quitó el
  selector de densidad; "Vincular con...", "Generar Sinergia con..." y "Ver
  en el texto" pasaron a vivir dentro de `#submenuLink`; "Conceptos
  Relacionados", "Cuestionar/Antítesis", "Ponme a prueba" y "Ejemplos
  Prácticos" pasaron a vivir dentro de `#submenuGenerate`; "Editar texto" se
  renombró a solo "Editar").
- `app.js`: `wireMenuGroup`/`closeAllMenuGroups`/`positionSubmenu` (lógica
  genérica de apertura/cierre y posicionamiento de los submenús); las dos
  líneas que leían `document.getElementById('nodeCount').value` directo
  (sin ese elemento ya habrían roto "Conceptos Relacionados" y "Ejemplos
  Prácticos") ahora usan `?.value || 'auto'`, así que siguen funcionando
  exactamente igual que con el selector, solo que siempre en modo Auto.

## 29. Siete arreglos de ronda: error de `isResizing`, "Modo" de acomodo del esquema, nodo marcado, menos traslape, paneles resizables, paneles "pegados" al mapa, y Deshacer

Ronda grande de siete pedidos relacionados con la usabilidad del lienzo.

### a) Error `ReferenceError: isResizing is not defined`

El mensaje de la consola no mentía: en `app.js` había quedado un
`document.addEventListener('mouseup', ...)` de un intento anterior que
revisaba una variable `isResizing` que nunca se llegó a declarar ni a poner
en `true` en ningún lado. Como el listener estaba en `document` (no en un
panel en particular), disparaba ese error en **cada** mouseup de toda la
página — no solo al redimensionar un panel.

Se quitó ese bloque muerto. Lo que sí hacía falta — redibujar el lienzo
después de agrandar o achicar un panel con el asa nativa del navegador (el
`resize` de CSS) — se resolvió con un `ResizeObserver` (`wireResizeRedraw`),
que no depende de interceptar el mouse y es el mecanismo correcto para esto.

Importante: este error **no** era la causa de que los submenús "Enlazar"/
"Generar" no aparecieran al pasar el mouse (ver siguiente punto) — eran dos
fallas independientes, las dos ya corregidas.

### b) Los submenús "Enlazar"/"Generar" no se desplegaban con el hover

La causa real: `#actionMenu` (el menú del nodo) tenía la clase
`overflow-hidden`, que recorta cualquier contenido que se salga de su
recuadro — incluyendo los submenús, que se posicionan *fuera* de ese
recuadro (a la derecha o a la izquierda) para no tapar el menú principal. La
lógica de mostrar/ocultar en JavaScript (`wireMenuGroup`, `positionSubmenu`,
de la ronda anterior) funcionaba bien; el submenú simplemente quedaba
invisible porque su propio contenedor lo recortaba antes de que llegara a
verse en pantalla. Se quitó `overflow-hidden` de `#actionMenu`.

### c) El acomodo "sistema solar" ahora es un modo opcional, no el único

En la prueba anterior (sección 25), el acomodo radial ("sistema solar") se
había colado como el único comportamiento al generar un esquema. Ahora hay
un selector **"Modo"** en la cabecera, junto a los demás controles:

- 🌳 **Árbol** — el acomodo de bloques de siempre, de arriba hacia abajo.
  Es el valor por omisión.
- 🪐 **Sistema solar** — el acomodo radial (ramas "orbitando" la raíz,
  sub-ramas orbitando su rama). Sigue disponible para quien quiera probarlo.

`renderThreeLevelTree()` (la función que calcula dónde va cada nodo nuevo)
ahora calcula las posiciones de dos formas distintas según el modo activo,
pero comparte todo lo demás (creación de nodos, flechas, animación de
aparición, etc.) — cambiar el modo no duplica lógica, solo cambia la
matemática de "dónde cae cada cosa".

### d) El nodo donde se abrió el menú ahora se marca con más fuerza

Antes solo se le engrosaba el borde y se le agregaba una sombra turquesa, y
al parecer no se notaba lo suficiente. Ahora, mientras el menú de un nodo
está abierto, ese nodo también cambia de color de borde a un ámbar muy
contrastante (`#fbbf24`), además del borde más grueso y la sombra — un
cambio mucho más difícil de pasar por alto. Al cerrar el menú (por cualquier
motivo: clic afuera, Escape, elegir una opción) se restaura exactamente el
color/borde/sombra originales del nodo, no una aproximación.

*(Nota: no fue posible probarlo en vivo en un navegador real desde este
entorno de trabajo — si al probarlo en tu máquina el resaltado sigue sin
notarse, avísame y lo hacemos aún más fuerte.)*

### e) Menos traslape entre nodos

Se aumentó la distancia mínima que la física del lienzo (el "acomodo
orgánico" que ya existía, sección anterior) intenta mantener entre nodos
nuevos: de 140 a 190 unidades de separación objetivo, con una fuerza de
repulsión y un tiempo de estabilización más largos (de 120 a 180
iteraciones) para que de verdad llegue a acomodarse así antes de soltar los
nodos. No es una garantía matemática de cero traslapes en absolutamente
todos los casos (dos nodos con texto muy largo siempre pueden llegar a
tocarse), pero sí hace bastante más difícil que ocurra en el uso normal.

*(Misma nota que el punto anterior: ajuste "a ciegas", sin poder verlo en un
navegador real desde aquí — es la dirección correcta, pero si en la
práctica sigue sintiéndose apretado, se puede subir más.)*

### f) Todos los paneles flotantes son redimensionables

Antes solo el Modo Lector tenía el asa de "agrandar/achicar" en la esquina.
Ahora **todos** los paneles flotantes de definición (los que abre "Ver
definición", "Explicación sencilla", "Ponme a prueba", etc.) y los lectores
adicionales (botón ➕) tienen el mismo comportamiento: una esquina
arrastrable para cambiar el tamaño, usando el mismo truco CSS (`resize` +
`overflow-hidden` + ancho/alto explícitos) que ya tenía el panel del
lector, más el nuevo `wireResizeRedraw` del punto (a) para que el lienzo se
redibuje bien después de soltar el asa.

### g) Los paneles de definición ahora son parte del mapa

Pedido: que una flecha señale al nodo del que salió cada panel de
definición, y que el panel "viaje" con el mapa al hacer pan/zoom — sin
volverse un nodo de verdad (sigue sin ser parte del grafo de vis-network, y
se sigue cerrando con la ✕, igual que siempre).

Cómo quedó: cada panel de definición guarda un punto "ancla" en las
coordenadas del **mundo** (las mismas coordenadas internas que usan los
nodos, no las de la pantalla). En cada redibujado del lienzo —al mover el
mapa, hacer zoom, o arrastrar un nodo— ese punto se vuelve a traducir a
coordenadas de pantalla (`network.canvasToDOM`) y el panel se reposiciona
ahí; al mismo tiempo se dibuja una flecha turquesa punteada, en una capa
SVG, desde la posición actual del nodo hasta el panel. Si arrastrás el panel
a otro lugar, su ancla se actualiza al nuevo punto del mapa donde lo
dejaste, así que sigue viajando desde ahí en el próximo pan/zoom.

**Una aclaración importante** sobre "se movieran como nodos": el panel
cambia de **posición** junto con el mapa (igual que un nodo), pero su
**tamaño en pantalla no cambia con el zoom** — el texto de adentro queda
siempre del mismo tamaño en píxeles, nunca se encoge ni se agranda. Esto es
a propósito: si el panel también se achicara al alejar el mapa, el texto se
volvería ilegible justo cuando hay más esquema visible (que es cuando más
se suele alejar). Si se prefiere que también cambie de tamaño con el zoom,
se puede ajustar, pero se perdería legibilidad en esos casos.

### h) Deshacer (Ctrl/Cmd+Z)

Nuevo botón **↩️ Deshacer** en la cabecera (se deshabilita solo cuando no
hay nada que deshacer), más el atajo de teclado Ctrl+Z / Cmd+Z (se
desactiva automáticamente si el foco está en un campo de texto, como el
Modo Lector, para no interferir con el deshacer normal de texto del
navegador).

Cómo funciona: cada vez que cualquier parte de la app agrega, edita, borra o
limpia nodos o flechas, se guarda automáticamente una "foto" completa de
cómo estaba el esquema justo *antes* de ese cambio. Al presionar Deshacer,
se restaura la foto más reciente. Como la foto es del esquema completo (no
solo del último campo que cambió), un solo Deshacer revierte tanto un
cambio chiquito (editar el texto de un nodo) como uno grande (generar un
esquema entero de un tirón, que internamente crea muchos nodos y flechas de
golpe) — cada clic del usuario cuenta como **una** acción deshacer-ble, sin
importar cuántas piezas internas haya tocado.

Se guardan hasta 40 pasos atrás. No hay todavía un botón de "Rehacer"
(Deshacer el Deshacer) — no se pidió, pero se puede agregar después si hace
falta.

### Archivos tocados

- `app.js`: bloque muerto de `isResizing` eliminado y reemplazado por
  `wireResizeRedraw` (ResizeObserver); `schemaLayoutMode` + rama "solar" en
  `renderThreeLevelTree`; `setNodeMenuHighlight`/`clearNodeMenuHighlight`
  con cambio de color de borde; `settleNewNodesOrganically` con distancias
  mayores; `wireResizeRedraw` aplicado también a `openFloatingPanel` y
  `createExtraReaderPanel`; nuevo bloque de anclaje de paneles
  (`floatingPanelAnchors`, `anchorFloatingPanelToWorld`,
  `updateFloatingPanelAnchors`, `ensureFloatingPanelsArrowSvg`) enganchado a
  `network.on('afterDrawing', ...)`; nuevo bloque de Deshacer
  (`wireUndoTracking`, `captureUndoSnapshotIfNeeded`, `performUndo`) que
  envuelve `nodes`/`edges` (`add`/`update`/`remove`/`clear`) justo donde se
  crean los `DataSet`.
- `index.html`: se quitó `overflow-hidden` de `#actionMenu`; nuevo selector
  "Modo" (🌳 Árbol / 🪐 Sistema solar) en la cabecera; nuevo botón
  "↩️ Deshacer" en la cabecera.

## 30. Cinco correcciones sobre la ronda anterior: flecha en vivo, minimizar de verdad, menú sin iconos, submenú ilegible, sonido que no sonaba — y una animación de entrada nueva

### a) La flecha del panel de definición llegaba tarde

Al arrastrar un panel de definición, la flecha hacia su nodo de origen se
quedaba apuntando al lugar viejo hasta que pasaba algo que redibujara el
mapa (un clic, un pan...). La causa: arrastrar el panel es un gesto de
mouse puro sobre el DOM — nunca mueve ni hace zoom al lienzo — así que
nunca disparaba el evento `afterDrawing` de vis-network, que era el único
momento en que se recalculaba la flecha. Se corrigió llamando a esa misma
función de recálculo (`updateFloatingPanelAnchors`) directamente en cada
movimiento del mouse mientras se arrastra el panel, además de en
`afterDrawing` — así la flecha ahora se mueve en vivo, a la par del panel.

### b) Minimizar un panel de definición no lo achicaba

El botón "—" solo escondía el texto de adentro, pero el panel seguía
ocupando el mismo espacio grande en pantalla porque tenía una altura fija.
Ahora, al minimizar, el panel de verdad se encoge a solo su cabecera
(altura automática) y se desactiva el asa de redimensionar mientras está
así (no tiene sentido agrandar un panel vacío); el botón cambia a "▢" para
indicar que está minimizado. Al volver a pulsarlo, recupera exactamente la
altura que tenía antes de minimizarse.

### c) Se quitaron todos los iconos y etiquetas del menú del nodo

Tanto en el menú principal como en los submenús "Enlazar" y "Generar": ya
no hay emojis al inicio de cada opción (💡, 🌐, ✏️, 🔗, ✨, 🧠, ⚡, 📍, 🔍,
el ícono de basurero de "Eliminar") ni las etiquetas pequeñas a la derecha
("Panel flotante", "Fácil", "Libre", "IA", "Entrar", "Origen", "Crítica",
"Reto", "Ej", los iconos sueltos usados como etiqueta). Cada opción quedó
como texto simple. Se conservó únicamente el "›" de "Enlazar" y "Generar",
porque no es un ícono decorativo sino el indicador de que esa fila abre un
submenú.

### d) Texto invisible en los submenús "Enlazar"/"Generar"

La causa: esos submenús usan la clase genérica `.glass-dock`, pensada en
otras partes de la app para paneles **claros** (fondo blanco translúcido).
`#actionMenu` tenía su propia regla que lo oscurecía, pero esa regla no
alcanzaba a los submenús (son elementos distintos, no descendientes del
mismo selector), así que quedaban con fondo blanco y el texto claro del
menú (pensado para fondo oscuro) se perdía casi por completo encima. Se
igualaron `#submenuLink` y `#submenuGenerate` al mismo fondo oscuro de
`#actionMenu` para que no se note el cambio de un menú al otro.

### e) El sonido no sonaba nunca

El interruptor de sonido sí funcionaba (de hecho suena una campanita de
confirmación apenas se activa), pero la función que reproduce el sonido
(`playChime`, dentro de `flashNewNode`) solo estaba conectada a las
creaciones de **un** nodo a la vez (Conceptos Relacionados, extraer del
texto, etc.) — nunca al caso más común de todos: **generar un esquema
completo**, que crea varios nodos de golpe y pasa por una función
distinta (`settleNewNodesOrganically`) que nunca llamaba a `playChime`.
Por eso con el sonido encendido "nunca sonaba nada" en el uso normal. Se
agregó ahí un "tin" por cada nodo nuevo, en cascada (no todos a la vez,
que sonaría como un acorde feo) y con un tono levemente distinto cada vez
para que no se sienta repetitivo.

### f) Nueva animación de entrada

Al cargar la app aparece, una sola vez, una pantalla de bienvenida breve:
el logo "Γ" (el mismo degradado turquesa→violeta de la cabecera, aquí
agrandado) aparece en el centro con dos puntitos de color orbitando
alrededor a velocidades distintas. Después de un momento todo "se
acomoda": las órbitas se encogen hacia el centro y se desvanecen, el logo
da un pequeño rebote de asentamiento, y toda la pantalla se funde a
transparente para revelar la app debajo. Un clic o cualquier tecla la salta
de inmediato, por si alguien no quiere esperar los ~1.8 segundos que dura
completa. Vive en su propio bloque de CSS/JS, independiente de `app.js`,
así que arranca y termina sola aunque el resto de la app tarde en cargar
(y si `#introSplash` no existiera por algún motivo, el script simplemente
no hace nada, sin romper el resto de la página). También respeta
`prefers-reduced-motion` (quita las órbitas giratorias para quien lo tenga
activado en su sistema).

### Archivos tocados

- `app.js`: `updateFloatingPanelAnchors()` ahora también se llama desde el
  propio `mousemove` del arrastre de paneles de definición, no solo desde
  `afterDrawing`; botón "fp-minimize" reescrito para encoger/restaurar la
  altura real del panel (`el.style.height`, `el.style.resize`) en vez de
  solo esconder el contenido; `settleNewNodesOrganically` ahora llama a
  `playChime` por cada nodo nuevo, en cascada.
- `index.html`: `#actionMenu` y sus submenús reescritos sin iconos ni
  etiquetas; nueva regla CSS que oscurece `#submenuLink`/`#submenuGenerate`
  igual que `#actionMenu`; nuevo `#introSplash` (markup + CSS + script de
  orquestación) justo después de abrir `<body>` y antes de `</body>`.

## 31. Menú más compacto, submenú que ya no se abre solo, nombre legible en los eventos, y el texto del Modo Lector ahora se guarda con el proyecto

### a) Menú contextual más chico

Antes cada fila usaba `px-3.5 py-2` con texto `text-xs` (~34px de alto por
fila). Como el texto de cada opción es corto, no hacía falta tanto aire:
ahora son `px-2.5 py-1` con texto `text-[11px]` (~22px por fila), y el ancho
mínimo del menú bajó de 220px a 160px (140px en los submenús). El menú
completo queda bastante por debajo de la mitad del alto que tenía antes.

### b) El submenú ya no se "auto-abría" con el primer clic

Causa: el menú contextual se posiciona justo encima (o justo debajo, si no
cabe arriba) del punto donde se hizo clic en el nodo. Si ese punto caía
sobre la fila de "Enlazar" o "Generar" justo cuando el menú aparecía, el
navegador disparaba `mouseenter` de inmediato — sin que el usuario moviera
el mouse — y el submenú se abría solo, dando la falsa impresión de que el
menú funciona con hover en vez de con clic. Ahora se ignora cualquier hover
que llegue durante los primeros 300ms después de que el menú contextual
aparece; pasado ese margen, el hover real (mover el mouse hacia esa fila a
propósito) vuelve a abrir el submenú con normalidad, igual que antes.

### c) Nombre legible en los eventos (en vez de solo IDs larguísimos)

Pedido: poder rastrear en la tabla `events` de Supabase quién hizo qué, sin
tener que leer un ID larguísimo (el "sub" de Netlify Identity, o
`guest:<uuid>`) cada vez.

Ahora cada navegador genera, una sola vez, un nombre corto y legible (p. ej.
`Cometa-482`, guardado en `localStorage` bajo `gk_display_name`) que viaja
junto con cada evento. En cuanto el usuario inicia sesión, ese nombre se
reemplaza automáticamente por su correo en los eventos siguientes (los
eventos *anteriores* al login quedan con el nombre de invitado que tenían
en ese momento — no se reescribe el pasado). La nueva columna se llama
`actor_label`.

**Importante — esto necesita correr un script en Supabase**: abrí
`supabase/schema.sql`, copiá desde el comentario `-- actor_label:` hasta el
`revoke all on function public.log_event(...)` del final, y corrélo en el
SQL Editor de Supabase. Es seguro volver a correr el archivo completo
también — todo usa `if not exists`/`create or replace`, no borra datos. Si
no corrés esta migración, los eventos seguirán guardándose igual (el
nombre legible simplemente no se guardaría).

También se agregó una vista `events_friendly` (en el mismo archivo) para
poder escribir, en el SQL Editor:

```sql
select * from public.events_friendly limit 50;
select * from public.events_friendly where who = 'Cometa-482' order by created_at desc;
```

sin tener que escribir el `coalesce(actor_label, actor_id)` cada vez.

Sobre el otro punto del pedido ("si un usuario hizo un esquema de cierto
tipo, ¿cómo lo sé?"): los eventos `schema_generate_attempt/success/error`
ya traían `mode` ('topic' o 'text') y `nodes`/`length`; ahora también traen
`layoutMode` (🌳 árbol o 🪐 sistema solar, según el selector "Modo" de la
cabecera) y `topicPreview` — el tema completo si era un tema corto escrito a
mano (p. ej. "Segunda Guerra Mundial", no hay nada que proteger ahí, es
justo el dato que querías poder reportar), o la etiqueta corta que la app ya
detecta sola para un documento largo pegado (nunca el documento completo —
ver el principio de privacidad al inicio de `track-event.js`). Con esto ya
se puede responder "¿qué clase de esquemas genera la gente?" filtrando por
`event_name = 'schema_generate_success'` y mirando `metadata->>'topicPreview'`.

### d) El texto del Modo Lector ahora se guarda (y se recupera) con el proyecto

Antes, al guardar un proyecto solo se guardaban los nodos y las flechas — el
texto que estaba pegado en el Modo Lector se perdía al reabrir el proyecto
más tarde. Ahora `saveCurrentProjectToBin` también guarda `readerText` (el
contenido del Modo Lector) y `documentContext` (la etiqueta corta
detectada, como "Capítulo 3 del libro..."), y `applyLoadedProject` los
restaura al abrir el proyecto — igual que ya pasaba con nodos y flechas.

**Sobre el costo, tu pregunta del punto 4**: guardarlo NO sale caro por el
*almacenamiento* en sí — es una columna `jsonb` normal en Postgres/Supabase,
y hasta un documento largo (digamos, unas 30-40 páginas de texto) pesa unos
pocos cientos de KB, que no es nada comparado con lo que ya cuesta la base
de datos en general. Donde SÍ podría salir caro es si alguien pega un
documento *enorme* (un libro entero, una transcripción de horas de
YouTube) y eso se re-envía completo en *cada* autoguardado — y el
autoguardado se dispara con cualquier cambio en el esquema (mover un nodo,
agregar uno), no solo cuando el texto cambia. Para evitar ese caso extremo
sin complicar la lógica del autoguardado, se le puso un tope de ~200,000
caracteres (`MAX_SAVED_READER_TEXT_LENGTH` en `app.js`) — de sobra para
cualquier documento normal, pero sin dejar la puerta abierta a guardar algo
desproporcionado una y otra vez. Si en algún momento preferís un tope
distinto, es una sola constante para cambiar.

### Archivos tocados

- `index.html`: `#actionMenu` y sus submenús con paddings/tamaños de texto
  reducidos; `min-w` del menú y los submenús bajado.
- `app.js`: guard de 300ms en `wireMenuGroup` (`actionMenuOpenedAt`) para el
  hover "heredado" del clic; `getDisplayName`/`getGuestDisplayName` nuevos,
  enviados en cada `track(...)` como `displayName`; `schema_generate_*`
  ahora incluyen `layoutMode` y `topicPreview`; `saveCurrentProjectToBin`
  guarda `readerText`/`documentContext` (con tope
  `MAX_SAVED_READER_TEXT_LENGTH`); `applyLoadedProject` los restaura.
- `netlify/functions/track-event.js`: acepta y sanitiza `displayName` del
  body, lo pasa a `store.logEvent`.
- `netlify/functions/_lib/store.js`: `logEvent` acepta un sexto argumento
  `actorLabel` y lo manda como `p_label` al RPC.
- `supabase/schema.sql`: nueva columna `events.actor_label` (+ índice);
  `log_event` reescrita con el parámetro `p_label`; nueva vista
  `events_friendly`. **Requiere correr el script actualizado en Supabase**
  (ver punto c arriba).

## 32. El menú de verdad quedó angosto, y ahora se puede importar un PDF y esquematizarlo manteniendo el aspecto original

### a) El menú contextual: el problema real era el ancho, no el alto

En la ronda anterior solo había reducido el padding y la letra (el alto).
Lo que hacía ver el menú "grueso" era otra cosa: el botón más largo
("Generar esquema completo a partir de aquí") no tenía un ancho fijo, solo
un ancho *mínimo* (`min-w`), así que el menú se estiraba hasta donde
hiciera falta para que ese texto entrara en una sola línea, y todos los
demás botones quedaban igual de anchos por estar dentro del mismo
contenedor.

Cambié ese `min-w` por un ancho fijo (`w-[130px]` en el menú principal,
`w-[120px]` en los submenús), bastante por debajo de la mitad del ancho
anterior. Ahora el texto largo simplemente envuelve a una segunda línea en
vez de ensanchar el menú.

### b) Importar un PDF y esquematizarlo tal cual se ve (no como texto plano)

Hay un botón nuevo, 📄, al inicio del Panel Lector. Al usarlo:

1. Eliges un PDF de tu computador.
2. Aparece una barra pidiendo un rango de páginas (de la X a la Y, con el
   total de páginas del archivo a la vista) — así nunca se procesan de
   golpe documentos enormes.
3. Al confirmar, esas páginas se dibujan en el panel **como las vería un
   navegador**: mismo diseño, mismas imágenes, mismo color. No es una
   conversión a texto plano.
4. Sobre ese dibujo puedes seleccionar texto exactamente igual que antes:
   aparece el mismo menú de "⚡ Crear elemento" / "🔗 Vincular a nodo", y al
   generar el esquema completo, al hacer clic en un nodo del lienzo su cita
   se resalta en amarillo sobre la página del PDF — igual que se resalta
   hoy sobre el texto plano.

Técnicamente, el PDF se dibuja en un `<canvas>` (la imagen) con una capa de
texto invisible pero seleccionable encima (igual a como lo hace Firefox
cuando abres un PDF directo en el navegador). Esa capa de texto es la que
permite seleccionar, vincular y resaltar — nunca se reescribe la página,
solo se envuelven fragmentos de texto en marcas, para no romper el dibujo
de abajo. Toda la funcionalidad que ya existía en el Panel Lector (generar
esquema, crear nodos desde una selección, vincular, resaltar al hacer clic
en un nodo, auto-scroll al nodo activo) se reutiliza sin duplicar lógica:
simplemente ahora puede apuntar al PDF en vez de al texto plano, y nunca a
los dos a la vez.

**Esto no toca nada de lo que ya funcionaba.** Si nunca subes un PDF, el
Panel Lector se comporta exactamente igual que antes (texto plano, pegar,
arrastrar, etc.). El modo PDF solo se activa si el usuario sube uno, y
"🧹 Limpiar" lo cierra y vuelve al modo de texto normal.

### c) Limitaciones honestas de esta primera versión

- **PDFs escaneados (solo imagen, sin texto real detrás):** si el PDF no
  tiene una capa de texto (por ejemplo, es solo fotos de páginas escaneadas
  sin OCR), no hay nada que seleccionar ni resaltar — se ve la página pero
  no se puede marcar texto sobre ella. Esto es una limitación del PDF en
  sí, no de la app.
- **Documentos muy largos:** por diseño, se pide un rango de páginas antes
  de dibujar nada, en vez de intentar renderizar un PDF de 300 páginas de
  una sola vez (sería lento y pesado). Si necesitas otro rango después,
  puedes volver a importar el mismo PDF y elegir otro.
- **Guardado del proyecto:** al guardar un proyecto, se guarda el *texto*
  que se extrajo de las páginas elegidas (reutilizando el campo que ya
  guarda el texto del Panel Lector), pero no el archivo PDF original ni su
  apariencia visual. Si vuelves a abrir ese proyecto más tarde, el texto
  del documento está ahí (y los nodos siguen vinculados a sus citas), pero
  el Panel Lector se ve como texto plano, no como las páginas dibujadas del
  PDF. Si quieres volver a ver el PDF con su formato, tendrías que
  importarlo de nuevo desde el archivo.

### Archivos tocados

- `index.html`: ancho fijo en `#actionMenu` y submenús (en vez de
  `min-w`); botón 📄 "Importar PDF", input de archivo oculto, barra de
  rango de páginas, y el contenedor `#readerPdfView` dentro del Panel
  Lector; CSS para las páginas del PDF y su capa de texto.
- `app.js`: carga y dibujo del PDF con `pdf.js` (`renderPdfPageRange`),
  construcción del índice de texto a partir de lo ya dibujado
  (`rebuildPdfSpanIndex`), resaltado por envoltura de rangos de texto
  (`wrapPdfTextRange`, `applyCoverageMarksToPdfView`,
  `unwrapPdfCoverageMarks`), salida del modo PDF (`exitPdfMode`), y los
  ajustes necesarios para que el resto de funciones del Panel Lector (buscar
  dónde quedó un nodo, resaltar al hacer scroll, generar el esquema, limpiar,
  paneles extra) sigan funcionando igual sin importar si el panel está
  mostrando texto plano o un PDF.

## 33. La flecha faltaba en dos paneles del menú contextual, y "Minimizar" dejaba un hueco vacío debajo del encabezado

### a) La flecha de "Ver definición" no llegaba a todos los paneles

Los paneles flotantes que abre el menú contextual ("Ver definición",
"Explicación sencilla", "Ponme a prueba") comparten la misma función de
creación (`openFloatingPanel`), así que en teoría todos deberían dibujar la
misma flecha punteada hacia el nodo que los originó. En la práctica, dos de
los tres no la mostraban:

- **"Explicación sencilla"** y **"Ponme a prueba"** necesitan poder tener su
  propio panel abierto *al mismo tiempo* que el de "Ver definición" para el
  mismo nodo (uno no debe cerrar o reemplazar al otro), así que a cada uno
  se le asigna una clave distinta a la del nodo real — por ejemplo
  `simple_<id-del-nodo>` o `socratic_<id-del-nodo>_<momento>` — para que no
  se pisen entre sí en el registro interno de paneles abiertos.
- El código que ancla la flecha al nodo, sin embargo, asumía que esa clave
  *era* el id del nodo, y buscaba un nodo con ese nombre exacto en el mapa.
  Como `simple_...` o `socratic_...` nunca son ids reales de ningún nodo,
  esa búsqueda fallaba en silencio y la flecha simplemente nunca se
  dibujaba para esos dos paneles — quedaban flotando sin ninguna conexión
  visual con el nodo del que salieron.

La solución fue separar ambos conceptos: la clave con la que se identifica
y se guarda el panel (para que pueda haber varios a la vez) por un lado, y
el nodo real al que debe apuntar la flecha por otro. Ahora "Ver definición"
sigue funcionando igual que siempre (son el mismo valor), y "Explicación
sencilla" / "Ponme a prueba" reciben explícitamente el nodo real como un
tercer dato al crear el panel — así la flecha ya aparece y se comporta
igual en los tres casos: sigue al nodo si se mueve, se redibuja al hacer
zoom/pan, etc.

### b) "Minimizar" dejaba un hueco vacío debajo del encabezado

El botón "—" (minimizar) ya escondía el contenido del panel y achicaba su
altura a "automática", pero el panel seguía teniendo una altura *mínima*
fijada (para que, abierto normalmente, nunca quede demasiado chiquito) que
seguía aplicando incluso con el contenido oculto. El resultado: el
encabezado quedaba arriba, pero debajo se mantenía ese espacio mínimo vacío
en blanco — el panel no se veía realmente "recogido".

La corrección anula también esa altura mínima mientras el panel está
minimizado (vuelve a 0), y la restaura al expandirlo de nuevo. Ahora
minimizar deja ver solo el encabezado, sin espacio sobrante debajo, igual
en los tres paneles (definición, explicación sencilla, reto socrático).

Verifiqué ambos arreglos reproduciendo el CSS exacto de estos paneles fuera
de la app (ya que el entorno donde trabajo no puede cargar Tailwind desde
su CDN) y confirmando con un navegador real que, antes del cambio, minimizar
dejaba 160px de alto (el mínimo fijado) en vez de encogerse al tamaño real
del encabezado (~55px), y que después del cambio sí se encoge correctamente
y se restaura a la altura exacta de antes de minimizar.

### Archivos tocados

- `app.js`: `anchorFloatingPanelToWorld`/`updateFloatingPanelAnchors`
  ahora separan la clave del panel del nodo real al que apunta la flecha
  (`anchorNodeId`); `openFloatingPanel` acepta un tercer argumento opcional
  con ese nodo real; `showSimpleExplanationInFloatingPanel` y el manejador
  de "Ponme a prueba" (`btnMenuChallenge`) ahora lo pasan explícitamente.
  El botón de minimizar de `openFloatingPanel` también anula `min-height`
  mientras el panel está minimizado (y la restaura al expandir).

## 34. Mensaje de WhatsApp más profesional, botón de "Subir PDF" llamativo, y zoom en el visor de PDF

### a) Mensaje de WhatsApp

El mensaje que se armaba solo al abrir la tienda (botón "Escribir por
WhatsApp") decía "Ya usé mis nodos disponibles... quiero seguir creando
esquemas" — sonaba a que algo se agotó o se cobró mal, en vez de a alguien
que simplemente quiere seguir usando la herramienta. Se cambió a:

> "Hola, uso Graphikosmos y me gustaría seguir utilizándolo. ¿Podrían
> contarme las opciones disponibles para continuar? Mi correo de cuenta
> es: ..."

Sigue sin mencionar paquetes ni precios en el mensaje (eso se conversa por
chat, como ya estaba decidido), pero con un tono de interés genuino en
seguir usando la app en vez de una queja.

### b) El botón de "Subir PDF" ahora se nota

Antes era un ícono gris (📄) idéntico en estilo a los botones de
➕ (otro lector), 🧹 (limpiar) y ✕ (cerrar) — una función importante y poco
común (poder leer y esquematizar un PDF real, con su formato, no solo su
texto) quedaba visualmente al mismo nivel que "cerrar el panel". Ahora
tiene su propio color sólido (rojo/rosa) y dice "📄 Subir PDF" en vez de
ser solo un ícono — se distingue de un vistazo del resto de los botones.

### c) Zoom en el visor de PDF

Ya se podía importar y leer un PDF con su formato real, pero el tamaño en
pantalla era fijo (ajustado al ancho del panel al momento de cargarlo) —
no había manera de acercarse si el texto se veía chico. Ahora, mientras hay
un PDF cargado, aparecen controles 🔍－ / 100% / 🔍＋ en la esquina del
panel para acercar o alejar la página.

Importante: acercar o alejar NO le vuelve a pedir nada a `pdf.js` ni
redibuja el `<canvas>` — sería lento y, al dibujarse ya a mayor resolución
de la que se ve (por la pantalla de alta densidad, ver ronda anterior), no
hace falta. En vez de eso, cada página quedó dentro de un envoltorio cuyo
tamaño sí cambia con el zoom (para que aparezca scroll de verdad) mientras
la página en sí (canvas + capa de texto de selección) solo se escala
visualmente con un `transform: scale()` — exactamente como el zoom nativo
de un navegador. Como esto no toca ni el canvas ni los `<span>` de texto,
seleccionar, vincular a un nodo y ver los resaltados sigue funcionando
igual sin importar el zoom activo. El zoom se resetea a 100% cada vez que
se carga un nuevo rango de páginas.

Verifiqué el mecanismo del zoom (que el contenedor realmente crece/encoge y
habilita el scroll, y que la página se reposiciona centrada) con una prueba
en un navegador real, ya que mi entorno de trabajo no puede cargar
Tailwind desde su CDN para probar la página completa.

### Archivos tocados

- `app.js`: mensaje de WhatsApp reescrito en `updateManualPurchaseBox`;
  nuevo estado de zoom (`pdfZoomScale`, `applyPdfZoom`) y sus botones
  (`btnPdfZoomIn`/`btnPdfZoomOut`); `renderPdfPageRange` ahora envuelve
  cada página en un `.gk-pdf-page-outer` (tamaño real, cambia con el zoom)
  más la `.gk-pdf-page` de siempre (tamaño fijo, solo se escala visualmente);
  `exitPdfMode` resetea el zoom y oculta sus controles;
  `createExtraReaderPanel` también quita los controles de zoom del clon
  (son solo del panel "main", igual que el resto de lo de PDF).
- `index.html`: botón `#btnImportPdf` con color sólido y texto "Subir PDF";
  nuevos controles `#pdfZoomControls`/`#btnPdfZoomIn`/`#btnPdfZoomOut`/
  `#pdfZoomLabel`; CSS de `.gk-pdf-page-outer`.

## 35. Botón de Sugerencias/Comentarios que manda un correo real (Resend), y el formulario de la Tienda deja de depender de tu cliente de correo

### a) Nuevo botón "💬 Sugerencias"

Hay un botón nuevo en la cabecera, junto a "?" (Ayuda), que abre un modal
simple: un cuadro de texto para escribir cualquier idea, error o comentario,
y un campo de correo opcional (si querés que te respondamos). Al enviarlo,
el mensaje llega como un correo real a la bandeja de quien administra la
app — no abre WhatsApp ni tu programa de correo, lo manda el servidor
directamente.

### b) El formulario "para seguir usando la app" también manda correo de una vez

Antes, en la Tienda, la opción "o al correo" era un enlace `mailto:` — abría
TU programa de correo (si tenías uno configurado) con el mensaje ya escrito,
pero dependía de que vos le dieras "enviar". Eso fallaba sobre todo en
celulares o navegadores sin un cliente de correo configurado. Ahora es un
campo de correo + botón "Enviar": al confirmarlo, el correo sale de una vez
desde el servidor, igual que el de Sugerencias. El botón de WhatsApp (que sí
funcionaba bien) se mantiene como está.

### c) Cómo funciona por dentro (y qué hace falta configurar)

Ambos formularios llaman a una función nueva,
`netlify/functions/send-feedback.js`, que usa **Resend** (un servicio de
envío de correo) para mandar el mensaje. Esto necesita una variable de
entorno `RESEND_API_KEY` configurada en Netlify (cuenta gratis en
resend.com) — sin ella, la función responde con un error claro en vez de
fallar en silencio.

Un detalle importante de cómo funciona Resend mientras no se verifique un
dominio propio: el remitente de prueba (`onboarding@resend.dev`) solo puede
entregar correos a la dirección con la que te registraste en Resend. Por
eso el destino del correo se puede fijar con la variable `FEEDBACK_TO_EMAIL`
(si no se define, usa `bonillapretiz@gmail.com` como respaldo) — debe ser
esa misma dirección de tu cuenta de Resend. El día que quieran mandar a
otra dirección o usar un dominio propio como remitente, hay que verificar
ese dominio en Resend y ajustar el `from` en `send-feedback.js`.

Protecciones agregadas para que esto no se pueda abusar:

- Tope de 5 correos por hora por persona (usuario o invitado), reutilizando
  la tabla `events` que ya existe (`countEventsLastHour` en `_lib/store.js`)
  en vez de crear una tabla aparte solo para esto.
- Validación del correo de respuesta (si se escribe uno, tiene que tener
  forma de correo) y topes de longitud en el mensaje.
- Cada envío exitoso también queda registrado como evento `feedback_sent`
  en la tabla `events` (con qué tipo de formulario fue), así que también
  sirve como parte del embudo de uso.

### Sobre el mensaje "Intenta de nuevo en unos segundos"

Revisé todo el código que puede abrir el panel de la Tienda por falta de
saldo (tanto el chequeo optimista en el navegador como la respuesta del
servidor cuando de verdad no alcanza el saldo): en los dos casos, el código
está escrito explícitamente para NO mostrar ese mensaje genérico antes de
abrir el panel — se salta esa alerta a propósito. No encontré, leyendo el
código, el camino exacto que produce lo que describiste. Quedó pendiente:
si vuelve a pasar, lo más útil sería anotar qué botón se usó justo antes
(¿"Generar Esquema" con un documento largo? ¿una opción del menú contextual
de un nodo?) y si tenías sesión iniciada o eras invitado — con ese detalle
sí se puede encontrar el camino exacto en el código en vez de adivinar un
arreglo a ciegas que podría no tocar el problema real.

### Archivos tocados

- `netlify/functions/send-feedback.js` (nuevo): recibe `{ kind, email,
  message }`, valida y manda el correo vía la API de Resend, con tope anti-
  spam y registro del evento.
- `netlify/functions/_lib/store.js`: nueva función `countEventsLastHour`
  (cuenta eventos de un actor en la última hora, para el tope anti-spam).
- `app.js`: `sendFeedbackRequest` (helper compartido por los dos
  formularios), `openFeedbackModal`/`closeFeedbackModal`, los listeners de
  `#feedbackForm` y `#rechargeRequestForm`; `updateManualPurchaseBox`
  precarga el correo si ya hay sesión iniciada.
- `index.html`: botón `#btnFeedback` en la cabecera; modal nuevo
  `#feedbackModal`; el bloque `mailto:` de la Tienda se reemplaza por el
  formulario `#rechargeRequestForm`.

## 36. Más nodos gratis para quien todavía no se loguea — se hace desde Netlify, no desde el código

Se consideró subir el regalo de nodos de un invitado (sin cuenta) de 15 a
50 editando el valor por defecto en el código, pero ese valor por defecto
solo se usa si la variable de entorno `GUEST_FREE_NODES` NO está definida
en Netlify — y es más simple y más directo cambiarla ahí (Site settings →
Environment variables) que editar código para algo que ya es configurable.
El código se dejó exactamente como estaba (respaldo en 15, por si algún día
se borra la variable de Netlify sin querer).

## 37. Las cuentas admin ya no quedan registradas en la tabla `events`

Las dos cuentas del dueño de la app (las que están, o se agreguen, en la
variable de entorno `ADMIN_EMAILS` — ver `_lib/auth.js`) dejan de aparecer
en la tabla `events`. Antes, cada vez que el dueño probaba la app quedaba
una fila más ahí, mezclada con la de clientes reales — lo que hacía más
difícil leer el embudo de uso real (cuántas visitas, qué tan seguido se
atasca la gente, etc.) sin tener que filtrar manualmente esas cuentas cada
vez.

Ahora, tanto `track-event.js` (el registro general de eventos) como
`send-feedback.js` (sugerencias y el formulario de la Tienda) chequean si
quien llama es una cuenta admin y, si lo es, responden 200 OK igual (nunca
debe notarse en la app) pero SIN escribir nada en `events`. El correo de
sugerencias sí se sigue enviando normalmente aunque sea una cuenta admin
— lo único que se omite es la fila en la tabla.

**Importante:** esto depende de que esas dos cuentas (`bonillapretiz@gmail.com`
y `laureanobonilla@aol.com`) estén en la variable de entorno `ADMIN_EMAILS`
en Netlify (separadas por coma si hay más de una). Si no lo están, hay que
agregarlas ahí — el código ya está listo para una vez que esa variable las
incluya. Dicho sea de paso, esto también las vuelve cuentas "admin" en el
resto de la app (nodos ilimitados, saldo infinito) — es el mismo mecanismo
que ya existía para administradores, así que no es un comportamiento nuevo,
solo se extendió para que también filtre `events`.

Esto NO toca nada de `usage_log` (el consumo real de nodos por IA) ni de
`projects` (tus esquemas guardados): esas tablas ya excluían a las cuentas
admin desde antes (`billing.js` se salta por completo el descuento de
saldo si `identity.isAdmin` es cierto), y los proyectos se siguen guardando
igual que siempre para cualquier cuenta, admin o no.

### Archivos tocados

- `netlify/functions/track-event.js`: si `getUser(context).isAdmin` es
  cierto, responde 200 sin llamar a `store.logEvent`.
- `netlify/functions/send-feedback.js`: misma exclusión, pero solo para el
  registro del evento — el correo se sigue mandando igual.


## 38. `/juego` (vuelo 3D por los esquemas) — se quitó

Se había construido una sección `/juego/` con un vuelo en primera persona
por los esquemas guardados (three.js, nodos como esferas brillantes,
flechas como líneas, nebulosas y bloom). Se decidió quitarla: se eliminó
la carpeta `juego/` por completo y el botón "🌌 3D" que se había agregado
en `renderProjectsList()` (`app.js`), junto a "Abrir" en cada proyecto
guardado. No queda ningún rastro de la funcionalidad — ni archivos, ni
referencias, ni variables de entorno (no había agregado ninguna).

## 39. Navegador de páginas dentro del PDF ya cargado

Ahora, mientras estás viendo un PDF en el Modo Lector, aparece una barrita
flotante abajo al centro con "‹ [número] / total ›" — igual que cualquier
lector de PDF normal: las flechas saltan a la página anterior/siguiente, y
también podés escribir directamente el número de página y presionar Enter
(o simplemente hacer click afuera) para saltar ahí. El número también se
actualiza solo mientras haces scroll a mano, para que siempre refleje dónde
estás.

**Límite importante:** el salto es dentro del RANGO de páginas que ya
elegiste cargar (ver el selector "de página X a Y" al importar el PDF), no
de todo el documento — solo esas páginas existen de verdad en pantalla. El
"/ total" de la derecha sí muestra el total real de páginas del PDF, para
que sea obvio si hay más páginas del documento que no se cargaron (en ese
caso, habría que "Subir PDF" de nuevo con un rango distinto). Dentro del
rango cargado, el número de página que usa el navegador es el número REAL
de esa página en el PDF (no su posición dentro del rango) — así que si
cargaste de la página 40 a la 60, escribir "45" te lleva a la página 45
tal cual, no a la 45ª página del rango.

### Archivos tocados

- `index.html`: barra nueva `#pdfPageNavControls` (botones `‹`/`›`, input
  de número de página, total), flotando sobre `#readerContentContainer`,
  junto a los controles de zoom existentes.
- `app.js`: cada página renderizada ahora se marca con
  `data-page-num="<n>"` (el número real de esa página, ver
  `renderPdfPageRange`); `goToPdfPage(n)` hace `scrollIntoView` a la página
  pedida y actualiza el input; un listener de scroll en `#readerPdfView`
  mantiene el número sincronizado mientras se navega a mano; se oculta
  junto con el resto de los controles de PDF al salir del modo PDF
  (`exitPdfMode`) y se excluye de los paneles de lectura adicionales
  (`createExtraReaderPanel`), ya que es una funcionalidad solo del panel
  "main" (el único con un PDF activo).

## 40. Arreglo: resaltar/vincular texto del lector no funcionaba bien en el PDF

Se reportaron dos problemas relacionados, ambos con la misma causa de fondo:

1. Un nodo creado a mano desde una selección del lector (⚡ "Crear elemento
   en esquema", o 🔗 "Vincular a nodo...") nunca quedaba de verdad
   conectado con su cita: "Ver en el texto" no lo encontraba, y no
   participaba del resaltado permanente que sí tienen los nodos que vienen
   de un esquema generado por IA.
2. Sobre la vista de PDF específicamente: al seleccionar un fragmento,
   a veces el resaltado terminaba superpuesto con otro texto distinto, como
   si una selección "se traslapara" con otra — y en otros casos sí marcaba
   algo, pero en una zona del documento que no tenía nada que ver con lo
   seleccionado.

### Causa

Ese botón nunca guardaba `sourceQuote`/`originPanelId` en el nodo (los
campos que SÍ usan los nodos de IA para el sistema de resaltado) — en vez
de eso, envolvía el fragmento seleccionado con su propio `<span>` suelto
(`Range.extractContents()` + `insertNode()`). Sobre texto plano eso no se
notaba mucho, pero sobre la vista de PDF es un problema serio: cada
fragmento de texto ahí vive en un `<span>` posicionado de forma ABSOLUTA
(carácter por carácter, para calzar exacto sobre el dibujo de la página).
Si la selección empezaba o terminaba a mitad de uno de esos `<span>`,
`extractContents()` lo PARTE en dos — y la mitad nueva hereda el mismo
estilo de posición absoluta que el `<span>` original, así que las dos
mitades terminan dibujadas exactamente en el mismo lugar: de ahí el
"traslape".

Aparte, la función que busca dónde cae una cita dentro del texto
(`resolveQuoteSegments`, usada tanto para texto plano como para PDF) se
quedaba siempre con la PRIMERA aparición de ese texto en todo el
documento. Si la misma palabra o frase aparece más de una vez (algo muy
común), un nodo podía terminar marcado en un lugar del documento que no
tiene nada que ver con lo que el usuario señaló — el segundo síntoma
reportado ("a veces sí marca, pero en zonas erróneas").

### Arreglo

- Crear un nodo desde una selección (en cualquiera de los dos botones)
  ahora guarda `sourceQuote`, `originPanelId` y un color de la misma
  paleta que ya usan los nodos de IA (`appearanceForManualQuote`), y llama
  a `highlightCoverageForPanel` — la misma función ya probada que, sobre
  PDF, envuelve el texto DENTRO de los `<span>` existentes sin partirlos
  (`wrapPdfTextRange`), en vez del envoltorio aparte de antes.
- Para desambiguar texto repetido, se guarda además `sourceQuoteOffset`: la
  posición exacta donde cayó la selección real al crear el nodo (solo se
  puede calcular con precisión sobre la vista de PDF, mapeando la
  selección a los mismos `<span>` que ya se usan para indexar el texto —
  ver `computeOffsetHintForSelection`). `resolveQuoteSegments` ahora, si
  tiene esa pista, elige la aparición de ese texto más CERCANA a donde en
  realidad se seleccionó, en vez de siempre la primera del documento.
- Como consecuencia, estos nodos ahora sí funcionan con "Ver en el texto",
  el resaltado permanente, el clic-para-enfocar-nodo y el seguimiento del
  esquema por scroll — todo lo que ya tenían los nodos generados por IA.

### Límite que sigue igual

Para texto PLANO (no PDF) se sigue usando el criterio de siempre (primera
aparición) — no se reportó como un problema ahí, y no hay una forma tan
directa de calcular una posición exacta dentro de un `<div
contenteditable>` sin arriesgar romper algo que ya funciona bien. Si en el
futuro aparece el mismo síntoma con texto plano, se puede extender el
mismo mecanismo de `sourceQuoteOffset` para ese caso.

### Archivos tocados

- `app.js`: `appearanceForManualQuote` (color consistente para nodos
  manuales), `findBestQuoteOccurrence` (elige la aparición más cercana a
  un offset conocido), `resolveQuoteSegments`/`highlightCoverageForPanel`
  (ahora usan y propagan ese offset), `computeOffsetHintForSelection`
  (calcula el offset real de una selección sobre la vista de PDF), los
  tres listeners de `mouseup` que arman una selección (texto principal,
  PDF, paneles de lectura adicionales), y los handlers de "⚡ Crear
  elemento"/"🔗 Vincular a nodo..." (ahora guardan sourceQuote/
  originPanelId/sourceQuoteOffset y usan highlightCoverageForPanel). Se
  eliminó `highlightSelectedTextAndLink` (la función con el envoltorio
  manual que causaba el traslape), que ya no se usa en ningún lado.

## 41. Arreglo más de fondo: el PDF se leía en el orden "del archivo", no en el orden visual real

El arreglo anterior (sección 40) no fue suficiente — seguía pasando que el
resaltado marcaba una zona del texto que no era la que se había
seleccionado con el mouse, y el esquema generado desde un PDF no parecía
seguir el texto real. Investigando más a fondo apareció la causa de raíz,
distinta a la de la sección 40 (esa seguía siendo válida y se queda, pero
no alcanzaba).

### La causa real

Cualquier PDF guarda su texto en el orden en que fue "dibujado" al crear
el archivo — que casi nunca es exactamente el orden de lectura visual. Un
pie de página, una nota al pie o un encabezado pueden quedar guardados en
medio del texto del cuerpo, aunque visualmente aparezcan antes o después.
Es una limitación conocida de cualquier lector/extractor de PDF, no algo
particular de esta app.

El problema es que, mientras los fragmentos de texto invisibles (los
`<span>` que se superponen al dibujo de la página para poder seleccionar)
quedaran en ESE orden "de archivo":

- **Seleccionar con el mouse** no funcionaba bien, porque la selección de
  texto del navegador sigue el orden en que los elementos están guardados
  internamente (el DOM), NO la posición en pantalla. Si dos palabras se
  ven juntas visualmente pero están lejos una de otra en el orden interno
  del archivo, arrastrar el mouse entre ellas podía terminar marcando un
  fragmento de texto completamente distinto.
- **Generar un esquema desde el PDF** usaba ese mismo texto desordenado
  como entrada para la IA — así que el resultado dejaba de seguir la
  estructura real del documento, lo cual calza con lo que se observó
  ("parece que genera un esquema... según el tema que detecta" en vez de
  seguir el texto).

### El arreglo

Pdf.js (la librería que dibuja cada página) sigue siendo quien decide
DÓNDE va cada fragmento de texto en pantalla — eso no se tocó, es trabajo
ya resuelto y probado de esa librería. Lo que se agregó es un paso
adicional, justo después de que termina de dibujar: los mismos elementos
(sin recrearlos ni cambiarles ningún estilo) se reordenan por su posición
visual real — primero por línea, de arriba hacia abajo, y dentro de una
misma línea, de izquierda a derecha. Es el mismo criterio que sigue
cualquier persona leyendo un documento de una sola columna.

Con ese reordenamiento, tanto la selección con el mouse como el texto que
se usa para generar esquemas (`pdfFullText`) ahora siguen el orden visual
real del documento.

### Límite honesto

Este arreglo asume un documento de **una sola columna** de texto corrido
(como el que se ve en la imagen que se compartió — un libro/ensayo
normal). Un PDF con varias columnas (como un periódico o un paper
académico a dos columnas) necesitaría un criterio más complejo (agrupar
primero por columna, y recién después por línea) que esto todavía no
cubre — si el documento tiene ese formato, el mismo síntoma podría seguir
apareciendo ahí.

**Nota honesta sobre verificación:** este sandbox no tiene forma de cargar
pdf.js para probar visualmente el resultado (el proxy de este entorno
bloquea ese CDN para las pruebas automatizadas de este chat — el sitio ya
publicado en Netlify no tiene esa restricción). El diagnóstico se hizo
leyendo con cuidado cómo arma pdf.js la capa de texto y cómo la usa el
resto del código (selección nativa del navegador, `rebuildPdfSpanIndex`,
generación de esquema), y el arreglo solo reordena elementos que pdf.js ya
posicionó correctamente — pero conviene probarlo con el PDF real donde se
notó el problema para confirmar que, en efecto, se resolvió.

### Archivos tocados

- `app.js`: nueva función `reorderTextLayerToVisualOrder`, llamada justo
  después de que `pdfjsLib.renderTextLayer` termina de dibujar cada página
  (dentro de `renderPdfPageRange`).

## 42. Se abandona el "PDF dibujado" — ahora se extrae el texto (y se mejora el pegado de enlaces/portapapeles con formato, y una barra de estilo tipo RTF)

A pesar de los dos arreglos anteriores (secciones 40 y 41), el problema
seguía apareciendo con el PDF real del usuario: la selección seguía
marcando una zona distinta a la señalada con el mouse, y el resaltado
nodo↔texto seguía sin funcionar bien. La decisión, con buen criterio, fue
dejar de insistir en que "dibujar" el PDF (como un visor de PDF normal,
con su página y una capa de texto invisible encima) funcione de forma
confiable, y cambiar de enfoque por completo.

### El cambio de enfoque

Ya no se dibuja el PDF. Ahora se **extrae su texto** (con `pdf.js`, pero
usando `page.getTextContent()` en vez de `page.render()`) y ese texto se
inserta, con un formato aproximado al original (párrafos, encabezados,
negrita/cursiva cuando se puede detectar), **directamente en el mismo
editor de texto del Modo Lector** que ya se usaba para pegar texto a
mano. A partir de ahí, para el resto de la app, un PDF importado es
indistinguible de texto pegado: misma selección nativa del navegador,
mismo sistema de resaltado permanente, mismo camino de generación de
esquema. Todo el código de la sección "IMPORTAR PDF" que dibujaba
páginas (canvas + capa de texto + zoom + navegador de páginas + su
propio sistema de marcas) se quitó.

Cómo queda el flujo: se elige el PDF y el rango de páginas (igual que
antes, con la misma barra para escribir "de la página X a la Y"), pero
al apretar "Cargar" ya no se dibuja nada — se lee el texto de esas
páginas y aparece en el cuadro de texto de siempre, listo para generar
el esquema o para editarlo a mano antes.

Cómo se reconstruyen párrafos/encabezados/negrita a partir del texto
"suelto" que da `getTextContent()` (una lista de fragmentos con su
posición x/y, sin ninguna noción de "párrafo" o "título"):

- Los fragmentos se agrupan en **líneas** por su posición vertical, y
  dentro de una línea se ordenan de izquierda a derecha — igual que el
  reordenamiento visual de la sección 41, pero aplicado directo sobre
  las coordenadas que da `pdf.js`, no sobre `<span>` ya dibujados.
- Un salto vertical notable entre una línea y la siguiente se interpreta
  como salto de **párrafo**.
- Una línea sola, notablemente más grande que el cuerpo del texto
  (altura de letra muy por encima de la mediana del documento), se
  convierte en un **encabezado** (`<h2>`/`<h3>` según cuán grande sea).
- Se intenta detectar **negrita/cursiva** por el nombre interno de la
  fuente de cada fragmento (si contiene "Bold", "Italic", etc.) — ver el
  límite honesto más abajo, esto es lo menos confiable de todo el
  cambio.

### Límite honesto: la negrita/cursiva puede no detectarse casi nunca

La única forma práctica de saber si un fragmento de texto de un PDF va
en negrita/cursiva, sin dibujar la página, es mirar el nombre interno de
su fuente (p. ej. `Helvetica-Bold`). Muchos PDFs (sobre todo los
generados por conversores de Word/Google Docs/LaTeX) SÍ nombran así sus
fuentes, pero muchos otros no — y antes esa información normalmente se
terminaba de completar durante `page.render()` (que ya no se llama en
este flujo). Esto significa que, en la práctica, es probable que la
negrita/cursiva del documento original NO se reproduzca en varios PDFs,
aunque el resto del formato (párrafos, encabezados por tamaño) sí debería
funcionar razonablemente bien. No se intentó "inventar" una señal más
confiable porque cualquier alternativa (analizar el trazo del glyph,
etc.) está fuera de lo que `pdf.js` ofrece sin dibujar.

### Enlaces web: el mismo criterio — traer el formato, no solo el texto

`read-webpage.js` (la función que lee un artículo/noticia cuando se pega
un enlace) ahora también devuelve `article.content` — el HTML del
artículo ya "limpiado" por Readability (sin menús/anuncios, pero
CONSERVANDO párrafos, encabezados, negrita, listas, etc.), además del
texto plano de siempre. En el cliente, ese HTML se sanitiza con una
lista blanca de etiquetas (`sanitizeImportedHtml` — párrafos,
encabezados, negrita/cursiva/subrayado, listas, citas y enlaces; CUALQUIER
otra etiqueta se quita conservando su texto, y a los enlaces que
sobreviven solo se les deja el atributo `href`, nada de estilos/clases/
`onclick` que pudieran traer de la página de origen) y se inserta en el
editor en vez del texto plano. Si por algún motivo Readability no trae
HTML (algunos artículos solo devuelven texto), se sigue insertando el
texto plano como siempre — nunca se rompe el camino anterior.

Como la IA genera el esquema a partir de un texto exacto y después hay
que volver a encontrar esas mismas citas dentro del editor para
resaltarlas, y el HTML con formato no es carácter-por-carácter idéntico
al texto plano de Readability (los saltos de línea/espacios alrededor de
párrafos y encabezados pueden variar un poco), el texto que se manda a
generar el esquema se recalcula leyendo el HTML YA insertado en el panel
(con el mismo criterio — `buildEditableTextIndex` — que usa después el
resaltado), en vez de usar el texto plano del backend tal cual. Así los
dos lados (lo que ve la IA y lo que se busca después en el editor) parten
siempre del mismo texto.

También se agregó soporte de **pegado con formato** (Ctrl+V): antes,
pegar texto copiado de otra página dejaba que el navegador insertara el
HTML crudo de esa página (con sus estilos/clases propias, lo que podía
verse raro o interferir con el resaltado). Ahora se intercepta el pegado
y se inserta, en su lugar, ese mismo HTML ya pasado por
`sanitizeImportedHtml` (o el texto plano si el origen no ofreció HTML) —
es la opción de "copy-paste con RTF" que se pidió como alternativa a la
detección automática por enlace.

### Barra de formato (RTF) en el editor

Se agregó una barra de herramientas simple arriba del editor del Modo
Lector (y de cada lector adicional que se abra con ➕, cada uno con la
suya, independiente): **negrita, cursiva, subrayado, título grande/
mediano, volver a párrafo normal, lista con viñetas, lista numerada,
tamaño de letra (4 tamaños) y quitar formato**. Funciona con
`document.execCommand` (la misma API que usan editores simples como este
desde hace años en cualquier navegador) sobre el texto que esté
seleccionado dentro del editor en ese momento.

Un detalle de implementación para que esto funcione bien: hacer clic en
un botón de la barra, por default, le quitaría el foco (y la selección de
texto) al editor antes de que el clic termine de procesarse — así que se
previene ese comportamiento en los botones normales (para que la
selección se mantenga intacta) y, para el selector de tamaño (que sí
necesita su comportamiento nativo para poder desplegarse), se guarda la
selección justo antes de que se abra y se restaura justo antes de aplicar
el tamaño elegido.

### Qué NO se tocó (para que quede claro el alcance)

- El **guardado/apertura de proyectos** sigue guardando y restaurando el
  texto del lector como texto PLANO (sin el formato). Esto significa que
  la negrita/encabezados/etc. que se vean en la sesión actual (de un PDF,
  un enlace, o puestos a mano con la barra de formato) **no sobreviven**
  a día de hoy si se guarda el proyecto y se vuelve a abrir más tarde —
  el texto vuelve, pero aplanado a texto simple. No se tocó este camino
  en este cambio por ser una zona más sensible (persistencia de
  proyectos) que conviene no modificar a ciegas sin poder probarla en
  este entorno; queda identificado como una mejora pendiente razonable
  para una próxima vuelta si hace falta que el formato también se guarde.
- Los documentos de **varias columnas** (PDF tipo periódico/paper
  académico) pueden seguir agrupando líneas de columnas distintas como si
  fueran una sola — la extracción agrupa por posición vertical/horizontal
  simple, igual que el reordenamiento de la sección 41, y hereda la misma
  limitación.

### Nota honesta sobre verificación

Como en los cambios anteriores sobre PDF, este sandbox no tiene forma de
cargar `pdf.js` para probar visualmente el resultado (el proxy de este
entorno bloquea ese CDN). Se validó que el archivo no tiene errores de
sintaxis y que el HTML sigue balanceado, y se revisó con cuidado la
lógica de agrupado en líneas/párrafos/encabezados contra cómo
`page.getTextContent()` documenta sus datos — pero conviene probar con un
PDF real (sobre todo uno con negrita/cursiva, para confirmar si ese
detalle en particular se nota o no) y con un enlace real a un
artículo/noticia para confirmar que el formato se vea razonable.

### Archivos tocados

- `app.js`: se quitó toda la maquinaria de "dibujar" el PDF (zoom,
  navegador de páginas, `renderPdfPageRange`, `exitPdfMode`, el sistema
  de marcas específico del PDF, `computeOffsetHintForSelection`,
  `reorderTextLayerToVisualOrder`). En su lugar: `groupPdfItemsIntoLines`,
  `guessPdfItemStyle`, `medianOfNumbers`, `extractPdfRangeIntoReader`
  (nuevas), y se simplificaron los puntos que antes distinguían "modo
  PDF" del texto plano (`btnParseReaderText`, `btnClearReader`) porque ya
  no existe esa distinción. También nuevas: `escapeHtml`,
  `sanitizeImportedHtml`, `wireRichPaste`, `wireRtfToolbar`; y
  `resolveTextOrWebLink` ahora inserta HTML sanitizado cuando el backend
  lo trae.
- `index.html`: se quitaron `#readerPdfView`, `#pdfZoomControls` y
  `#pdfPageNavControls` (con su CSS), se actualizó el texto del botón
  "Subir PDF", y se agregó la barra de formato (`[data-role="rtfToolbar"]`)
  arriba del editor.
- `netlify/functions/read-webpage.js`: ahora también devuelve
  `contentHtml` (el `article.content` de Readability, recortado por las
  dudas) además del texto plano de siempre.

## 43. El menú contextual había quedado demasiado angosto y apretado

La sección 32 arregló que el renglón más largo estirara todo el menú de
lado a lado, pero se fue al otro extremo: quedó tan angosto (130px/120px)
y con filas tan bajas (22px, letra de 11px) que resultaba incómodo
leerlo y hacerle clic. Se ensanchó a 220px (menú principal) y 200px (los
submenús "Enlazar"/"Generar") — sigue sin tener un ancho que se adapte
solo al contenido, pero ahora con más aire el texto largo envuelve a 2
líneas sin que el menú se vea apretado — y cada fila pasó de
`px-2.5 py-1 text-[11px]` a `px-3.5 py-2.5 text-sm`, así que además de
verse más grande, cada opción es un blanco de clic notablemente más
cómodo. No hizo falta tocar nada de `app.js`: el posicionamiento del menú
y de sus submenús ya se calcula en caliente con `offsetWidth`/
`getBoundingClientRect()`, nunca con un ancho fijo a mano, así que un
menú más ancho sigue abriéndose del lado correcto (derecha o izquierda
según el espacio disponible) sin ningún ajuste adicional.

### Archivos tocados

- `index.html`: anchos y tamaños de `#actionMenu`, `#submenuLink` y
  `#submenuGenerate` y de todos los botones dentro de ellos.

## 44. El texto del lector no se reacomodaba al ensanchar/angostar el panel

El editor del Modo Lector tenía `white-space: pre-wrap`, pensado
originalmente para que un texto pegado a mano respetara sus saltos de
línea. El problema (bien señalado por el usuario): cualquier salto de
línea "suelto" que quedara en el texto —de un párrafo copiado con corte
fijo de columna, o del texto que `innerText = "..."` convierte en `<br>`
al asignarlo programáticamente (ver abajo)— se mostraba como un corte de
línea FORZADO, que no se movía ni se reacomodaba al ensanchar o angostar
el panel. Un `<br>`/salto real no es "responsive": siempre corta ahí,
sea cual sea el ancho disponible.

### El arreglo

En vez de depender de saltos de línea sueltos + `white-space: pre-wrap`,
el texto se arma en **párrafos reales** (`<p>...</p>`, uno por cada grupo
de líneas separado por una línea en blanco de verdad) — ver
`textToParagraphHtml` en `app.js`. Un párrafo de verdad reacomoda sus
propias palabras solo, al ancho que tenga el panel en ese momento, sin
que haga falta ningún truco de CSS. Se quitó `whitespace-pre-wrap` de
`#readerTextMode` y se le agregó el CSS que le faltaba para que párrafos/
encabezados/listas/citas se vean como tales (Tailwind resetea esos
márgenes y tamaños a 0 por default, así que sin esto se habrían visto
todos "pegados", sin aire entre ellos ni diferencia de tamaño en los
títulos).

## 45. Nueva app en el mismo sitio: "¿Quién eres en realidad?" (`quien-eres/`)

Se agregó, dentro de este mismo proyecto/sitio de Netlify, una app
completamente distinta de Graphikosmos: un cuestionario de personalidad
de 16 preguntas que termina en una lectura generada con Gemini, con un
cobro único vía PayPal para desbloquear la lectura completa. Vive en la
carpeta `quien-eres/` y queda publicada en `/quien-eres/` del mismo sitio
(no es un sitio de Netlify aparte — ver `quien-eres/README.md` para el
detalle completo de por qué y cómo).

Para que convivan sin pisarse, todas las funciones y archivos nuevos de
esta app llevan el prefijo `qer-` (`netlify/functions/qer-*.js`,
`netlify/functions/_lib/qer-pricing.js`,
`netlify/functions/_lib/qer-readings-store.js`). Reutiliza de verdad (sin
copiar) `netlify/functions/_lib/paypal.js`, que ya usa Graphikosmos. La
lectura generada se guarda en **Supabase** (tablas `qer_readings` y
`qer_orders`) — la primera versión usaba Netlify Blobs para no tocar
Supabase en esta app, pero falló en producción con un error de
aprovisionamiento del lado de Netlify (ver `quien-eres/README.md`), así
que se movió a Supabase, que ya está probado y funcionando en este mismo
sitio. No se agregó ninguna dependencia nueva a `package.json` por esto
(se quitó `@netlify/blobs`, que ya no se usa).

Variable de entorno nueva y opcional: `READING_PRICE_USD` (si no se
pone, usa `2.99`). El resto de variables (`GEMINI_API_KEY`,
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`,
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) ya existen en este sitio para
Graphikosmos y esta app nueva las reutiliza directo, sin configurar nada
aparte.

### Ideas para una colección de apps parecidas

La misma plataforma que soporta "¿Quién eres en realidad?" (PayPal de
pago único sin cuenta + Gemini generando contenido personalizado +
Supabase guardando el resultado temporalmente) sirve, sin cambiar la
arquitectura, para cualquier app con esta forma: **cuestionario o input
corto de la persona → IA genera algo personalizado y con "gancho" → se
muestra una probada gratis → se cobra un monto pequeño para ver el
resto.** Algunas variantes concretas, cada una como su propia carpeta
`algo-/` + funciones `algo-*.js`:

- **"¿Qué dice tu letra de ti?"** — la persona sube una foto de algo
  escrito a mano (Gemini sí puede leer imágenes); el análisis
  grafológico "revela" rasgos de personalidad. Gancho fuerte porque la
  letra se siente íntima y nadie la ha mirado con esos ojos antes.
- **"Tu yo del futuro te escribe una carta"** — unas pocas preguntas
  sobre miedos/metas actuales, y la IA redacta una carta en primera
  persona "desde dentro de 10 años". La parte pagada es el resto de la
  carta (suele cortar justo en la parte más reveladora).
- **"¿Cuál es tu arquetipo de pareja ideal?"** — cuestionario sobre cómo
  ama/discute/se reconcilia la persona; la lectura describe el tipo de
  pareja con la que de verdad conecta (y con cuál chocaría). Buen
  potencial de compartirse en redes porque la gente discute sobre su
  resultado con su pareja actual.
- **"¿Qué edad tiene tu alma?"** / **"¿En qué año deberías haber
  nacido?"** — formato más liviano/viral, mismo motor: preguntas de
  gustos y decisiones chicas, resultado con una "edad" o "época" y una
  explicación que se siente hecha a medida.
- **"Decodificador de sueños"** — la persona describe un sueño reciente
  en texto libre (no cuestionario de opciones, sino el campo de
  respuesta corta que ya existe en esta app); la IA da una
  interpretación simbólica con el mismo patrón de probada gratis + pago
  para el análisis completo.
- **"¿Qué tan compatible eres con [tu mejor amigo / tu jefe / tu
  signo]?"** — dos personas responden por separado (o una responde "por"
  la otra) y se compara; el resultado combinado es lo que se cobra.

Todas reutilizarían exactamente el mismo patrón de tres piezas (PayPal +
Gemini + Blobs) que ya está probado en `quien-eres/`, cambiando solo las
preguntas, el prompt de Gemini y el diseño visual — así que cada app
nueva de la colección sería, en esfuerzo, mucho más rápida de armar que
la primera.

Se aplicó en los tres lugares donde entra texto con saltos de línea
"sueltos":

1. **Pegar enlace web** (cuando Readability no trae HTML con formato):
   antes `innerText = texto`, ahora se arma en párrafos.
2. **Pegar (Ctrl+V) texto plano** sin formato: si trae más de un párrafo
   (línea en blanco entre ellos) se inserta en párrafos reales; si es una
   sola idea cortada en varias líneas (sin línea en blanco), se unen con
   espacios y se inserta corrido, sin forzar ningún corte en medio de un
   párrafo existente.
3. **Abrir un proyecto guardado**: el texto que se guardó (como texto
   plano, ver limitación de la sección 42) se reconstruye en párrafos al
   volver a abrirlo, en vez de con los saltos de línea sueltos que traía.

El texto que ya entraba como HTML con formato real (PDF extraído, enlace
con `article.content`, pegado con formato) no tenía este problema — ya
usaba párrafos propios y sigue igual.

### Archivos tocados

- `index.html`: se quitó `whitespace-pre-wrap` de `#readerTextMode` y se
  agregó el CSS de párrafos/encabezados/listas/citas/enlaces dentro de
  él.
- `app.js`: nueva función `textToParagraphHtml`; se usa en
  `resolveTextOrWebLink` (reemplaza el `innerText = ...` del camino sin
  HTML), en `wireRichPaste` (pegado de texto plano) y en
  `applyLoadedProject` (restaurar el texto guardado de un proyecto).

## 46. Nueva app: "Vestirte" (`vestirte/`)
10 preguntas + 5 fotos con ropa puesta → perfil de estilo → 10 ocasiones (2 gratis, 8 de pago; cada una con opción cara, intermedia y barata). Reutiliza la generación en 3 pasos, el almacén y el pago de quien-eres. Fotos privadas en Cloudinary, panel en `/vestirte/admin/`, borrado por la persona y limpieza automática. Instrucciones completas: `vestirte/LEEME.md`; SQL: `supabase/vestirte.sql`.

## 47. Graphikosmos: botón "Informe" (.rtf)
Cabecera → 📄 Informe. Descarga un .rtf del esquema actual (se rearma cada vez): un subtítulo por nodo (el central es el más grande, y Word los muestra en su panel de navegación), con definición, explicación sencilla, analogía y ejemplos prácticos (el ejemplo de la explicación sencilla más los nodos "Ejemplo:" hijos). Si faltan definiciones, pregunta si generarlas (mismos servicios y saldo que al abrirlas a mano) o usar solo lo existente.

## 48. Versión en inglés (Graphikosmos) — una sola app, dos idiomas

**Qué hay:** `https://…/en/` abre la MISMA app (mismo `index.html`, mismo `app.js`) en inglés. No hay carpeta `en/` con código copiado: `_redirects` hace que `/en`, `/en/` y `/en/*` sirvan `/index.html` (status 200, la URL no cambia).

**Cómo decide el idioma** (`i18n/core.js`): `?lang=en|es` > ruta que empieza por `/en` > español. Pone `<html lang>`, expone `tr('clave', {param})` y aplica los atributos del HTML.

**Dónde están los textos**
- `i18n/es.js` e `i18n/en.js`: mismas claves (459). Si falta una en inglés se muestra el español.
- HTML: `data-i18n="clave"` (contenido), `data-i18n-title|placeholder|aria-label|alt="clave"`. El texto español sigue escrito en el HTML como respaldo; el catálogo manda.
- JS: `tr('js.algo')` / `tr('quiz.score', {ok, total, pct})`; los `{param}` se reemplazan.
- Prefijos: `ui.` y `meta.` (HTML), `js.` (mensajes de app.js), el resto agrupado por zona (`def.`, `quiz.`, `tour.`, `soc.`, `proj.`, `rpt.`…).

**Backend:** el cliente añade `lang` a toda llamada a `gemini.js` (en el interceptor de `fetch`). `gemini.js` antepone UNA instrucción "responde en inglés" (`LANG_DIRECTIVES`) a cada prompt; los prompts siguen escritos en español y no se duplican. Los errores del servidor son códigos que el cliente traduce. Los eventos de `track-event` llevan `metadata.lang` para separar el tráfico EN/ES.

**Informe .rtf:** las etiquetas y la fecha salen en el idioma activo; los nodos "Ejemplo:" / "Example:" se detectan en ambos.

**Añadir un idioma:** crear `i18n/xx.js` (copiar es.js y traducir), agregar `'xx'` a `SUPPORTED` en `core.js`, `LANG_DIRECTIVES.xx` en `gemini.js`, un `<script>` en `index.html` y la regla en `_redirects`.

**Al añadir un texto nuevo:** poner la clave en AMBOS catálogos. Prueba rápida: abrir `/?lang=en` y buscar español.

**Subir a GitHub:** `_redirects` y la carpeta `i18n/` en la RAÍZ del repo (junto a `index.html`), más `index.html`, `app.js` y `netlify/functions/gemini.js` actualizados.

## 49. Logs del pago (¿Quién eres? y Vestirte)

Eventos nuevos (tabla `events`, se leen igual que los demás): `paypal_sdk_loaded` / `paypal_sdk_failed` (con `reason`: `config HTTP 500`, `config sin clientId`, error de carga del script), `paypal_buttons_ready`, `paypal_buttons_rendered` (`visible`, `height`), `paypal_not_eligible`, `paypal_render_failed`, `paypal_button_clicked`, `paypal_error`, además de los que ya existían (`payment_order_created`, `payment_captured_success`, `payment_cancelled`…).

Cómo leerlos tras `paywall_shown`: sin `paypal_sdk_loaded` → no cargó el pago; con `buttons_rendered` pero sin `button_clicked` → lo vieron y no quisieron pagar (oferta/precio); `button_clicked` sin `order_created` → falla al crear la orden; `order_created` sin `captured_success` → falla o abandono dentro de PayPal.

## 50. ¿Quién eres?: arranque más fácil (datos del 5-6 oct)

Con 39 personas que contestaron la pregunta 1, se perdían 4 en la pregunta 2 ("¿Qué hiciste esta semana solo para quedar bien con alguien?") y 3 en la 8 ("¿De qué cosa de tu vida hablas como si ya estuviera resuelta…?"); de la 10 en adelante casi nadie se iba. Cambio: las 3 primeras preguntas pasan a ser de elegir (`c1`, `c2`, `c3`, versiones de las antiguas q9, q5 y q10) y las opciones avanzan solas a los 380 ms (Atrás sigue disponible). Siguen siendo 50 preguntas; el avance guardado pasa a `qer_quiz_progress_v4` (quien estaba a medias empieza de nuevo). Para medir: comparar con el embudo anterior (39 → 24 en la pregunta 10); los eventos `question_answered` de esas tres traen `questionType: 'choice'`.

## 51. ¿Quién eres?: pago alternativo por WhatsApp / correo + país en los eventos

En el muro de pago, debajo de PayPal, hay un recuadro "¿No puedes o no quieres pagar con PayPal?…" con botones de **WhatsApp (+506 8777-2993)** y **correo (bonillapretiz@gmail.com)**. El mensaje ya lleva el nombre del arquetipo y el **código de la lectura** (UUID) y el precio se muestra en el recuadro (se sincroniza con `READING_PRICE_USD`). Eventos: `contact_whatsapp_clicked`, `contact_email_clicked`.

**Para desbloquear a mano** cuando alguien te pague por otro medio (en Supabase → SQL Editor):
```sql
update qer_readings set paid = true where id = 'CÓDIGO-QUE-TE-ENVIÓ';
```
La persona abre de nuevo la página **desde el mismo navegador** y su lectura aparece completa (se retoma sola). Una lectura sin pagar se conserva **72 h** (antes 24 h) y una pagada no caduca; en el navegador se recuerda hasta 71 h.

**País:** `qer-track-event.js` añade `metadata.country` (código de 2 letras, de la cabecera `x-nf-geo` de Netlify) a cada evento nuevo.

**Recordatorio si el pago falla.** PayPal sigue siendo la vía principal y el recuadro de contacto está visible desde el inicio. Si el pago se cancela, da error, PayPal no carga/no es elegible o falla la confirmación, el recuadro se resalta, cambia su texto ("el pago no se completó… escríbeme") y la pantalla se desplaza hasta él. También hay enlaces de contacto en el aviso de "no ahora" (`#skippedNote`).

**Eventos registrados (todo queda en `events`):** `altpay_shown` (se mostró el recuadro), `altpay_nudged` (`reason`: `cancelled` | `error`), `contact_whatsapp_clicked` y `contact_email_clicked` (`from`: `altWhatsapp`/`altEmail` = recuadro principal, `altWhatsapp2`/`altEmail2` = aviso de "no ahora"), además de `paypal_button_clicked`, `paypal_error`, `payment_cancelled`, `payment_captured_failed`, `paypal_not_eligible`, `paypal_render_failed`, `paypal_sdk_failed`.

## 52. ¿Quién eres?: botón de pago "clásico" (tarjeta como invitado) + aviso automático IPN

**Por qué:** el pago con tarjeta de los botones inteligentes (API) falla con "no se pudo agregar la tarjeta" (ver 11e). El botón clásico abre la página de PayPal, donde sí se puede pagar con tarjeta como invitado.

**Cómo funciona:** el botón amarillo "Pagar con tarjeta o PayPal" envía a PayPal el código de la lectura en `custom`. Al pagar, PayPal llama a `netlify/functions/qer-paypal-ipn.js`, que (1) pide a PayPal confirmar que el aviso es auténtico, (2) exige estado Completed, USD, monto >= `READING_PRICE_USD` y que el dinero entró a `PAYPAL_RECEIVER_EMAIL`, (3) comprueba que la lectura exista, y recién entonces pone `paid = true`. La persona vuelve a `/quien-eres/?pago=ok`, y la página consulta cada 3 s (hasta 90 s) si el servidor ya la marcó pagada. Si no llega, se resalta el contacto por WhatsApp/correo. Nunca se confía en `?pago=ok`: es solo un aviso de que la persona volvió.

**Configuración en Netlify (variables de entorno):** `PAYPAL_RECEIVER_EMAIL` = el correo PRINCIPAL de la cuenta de PayPal que cobra (si falta, el botón clásico no aparece y el IPN rechaza todo). `READING_PRICE_USD` = el precio. Opcional: `PAYPAL_ENV=sandbox` para pruebas. Después, nuevo deploy.
En PayPal (opcional, refuerzo): Perfil → Configuración de la cuenta → Notificaciones → Notificaciones instantáneas de pago, URL `https://graphoslearning.netlify.app/.netlify/functions/qer-paypal-ipn`. Y revisar "PayPal Account Optional" (pago sin cuenta) en Preferencias de pagos del sitio web.

**Eventos nuevos:** `classic_pay_shown`, `classic_pay_clicked`, `payment_return`, `payment_return_confirmed` (con segundos), `payment_return_timeout`, `payment_cancelled` (via `classic`), `payment_ipn_rejected` (con `reason`: no_verificado, monto, moneda, receptor, estado_*, sin_codigo_de_lectura, lectura_no_existe) y `payment_captured_success` con `via: ipn`. Los eventos del IPN usan el código de la lectura como `anon_id`.
**Si alguien pagó y no se desbloqueó:** busca `payment_ipn_rejected` con su código y mira `reason`; si el pago es válido, desbloquea con el SQL de la sección 51. Reembolsos o contracargos NO revocan el acceso automáticamente.

### 52b. Desbloqueo por redirección (enlace de pago de PayPal, sin verificar)
El enlace de pago de PayPal (paypal.com/ncp/links) no puede llevar el código de la lectura ni avisar por IPN. Opción pragmática: en ese enlace, "URL de redireccionamiento automático" = `https://graphoslearning.netlify.app/quien-eres/?pagado=TU_CLAVE`. La clave por defecto está en el código (`graphos-7k2m9x4q`, en `qer-claim-paid.js`), así que no hace falta configurar nada; si defines `PAYPAL_RETURN_TOKEN` en Netlify, esa tiene prioridad (útil para cambiarla sin tocar código; mínimo 8 caracteres). La página manda la clave a `qer-claim-paid.js`; si coincide, la lectura de ese navegador se marca pagada y se abre sola.
**Límite conocido:** no verifica el pago contra PayPal; quien conozca la clave (la ve cualquiera que pague) o comparta esa dirección puede abrir lecturas. Cada desbloqueo queda en `events` como `payment_unlocked_by_redirect` (y los intentos con clave mala como `payment_redirect_rejected`): compara su cantidad con los pagos del panel de PayPal. Si cambia la clave, cámbiala en las dos partes (PayPal y Netlify). Solo funciona en el mismo navegador donde se hizo el cuestionario.

**Estado actual del botón amarillo (decisión del 6-oct):** abre directamente el enlace de pago `https://www.paypal.com/ncp/payment/VTF7CY432WXJ8` (constante `PAYPAL_PAY_LINK` en `quien-eres/app.js`) y el desbloqueo es por redirección (52b), no por IPN. El precio lo fija ese enlace en PayPal: debe coincidir con `READING_PRICE_USD`. El formulario con IPN (`qer-paypal-ipn.js`, sección 52) quedó como alternativa más estricta, sin uso por ahora; no hace falta `PAYPAL_RECEIVER_EMAIL`.
