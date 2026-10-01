# Etapa 2 — Paneles flotantes + subesquemas + rediseño + YouTube/Wikipedia

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
