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

## Archivos modificados en esta ronda

- `app.js` — `findFreeSpot`/`flashNewNode` (nodo suelto visible);
  `insertSingleNode` actualizado; spinner en el panel de "Ver definición";
  handlers de Antítesis y Sinergia actualizados para título corto +
  `definition` pregenerada; `cacheIsUsable` y el render del panel reconocen
  `definitionSource: 'pregenerated'`.
- `netlify/functions/gemini.js` — esquemas de `antithesis` y `synergy` ahora
  piden `label` (corto) y `explanation` (completo) por separado, con las
  instrucciones del prompt actualizadas.
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
