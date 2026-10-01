# Etapa 2 — Paneles flotantes + lienzo 3D

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
- **Bug corregido de paso:** "Antítesis" y "Ponme a prueba" se disparaban DOS veces
  por clic (`app.js` y `lab.js` escuchaban cada uno el mismo botón por separado),
  generando nodos duplicados y gastando el doble de nodos en cada uso. Ahora solo
  hay un listener por botón.

## 2. Lienzo 3D

### Qué se usó y por qué

Se cambió `vis-network` (2D) por **3d-force-graph** (sobre three.js), con
**three-spritetext** para el texto de los nodos. Se eligió esta combinación en vez
de three.js puro porque ya trae resuelto exactamente lo que pediste:

- **Navegación circular en todas direcciones**: la cámara orbital (OrbitControls)
  viene integrada — arrastrar con el mouse rota la vista alrededor del esquema en
  cualquier dirección, la rueda hace zoom.
- **Profundidad real**: a diferencia de vis-network (que solo reparte nodos en X/Y),
  3d-force-graph es un layout de fuerzas verdaderamente 3D. Cuando el esquema crece,
  el exceso de nodos se reparte también en el eje Z — quedan "atrás" en vez de
  amontonarse solo a los lados — sin necesitar lógica adicional para forzarlo.

### Cómo se integró sin reescribir toda la app

`app.js` y `lab.js` tienen cerca de 80 puntos que llaman a la API de vis-network
(`nodes.add/update/get`, `edges.add/get`, `network.getPositions/focus/fit/...`).
En vez de tocar cada uno, se creó **`graph3d.js`**: una capa de compatibilidad que
implementa esa misma API (mismos nombres de método, mismas firmas) pero por debajo
usa 3d-force-graph. Así, **el único cambio real en `app.js` fue su bloque de
inicialización** (sección 1): donde antes decía `new vis.DataSet([])` y
`new vis.Network(...)`, ahora dice `new Graph3DDataSet([])` y
`new Graph3DNetworkShim(...)`. Todo lo demás —generar esquemas, sinergia, vincular
nodos, el menú contextual, arrastrar, fijar nodos— sigue funcionando porque llama a
los mismos métodos de siempre.

### Limitaciones conocidas de este cambio (para que las tengas presentes)

- **El texto en negritas (`*texto*`) ya no se renderiza en negrita**: en 3D el
  texto de cada nodo es un sprite (three-spritetext), no HTML con rich-text, así
  que por ahora se muestra como texto plano (se quitan los asteriscos). Si esto
  importa visualmente, se puede mejorar generando un sprite con dos tamaños de
  fuente para título/cuerpo.
- **Se perdió la selección múltiple por recuadro (Shift + arrastrar)** que existía
  en vis-network. Se verificó que el código nunca la usaba funcionalmente (solo
  estaba documentada en el modal de ayuda, que ya se actualizó); no afecta ninguna
  función real de la app, pero si la quieres de vuelta en 3D habría que
  construirla a mano (no viene con la librería).
- `canvasToDOM`, `getViewPosition()` y `focus()` son **aproximaciones** razonables
  a sus equivalentes 2D (ver comentarios en `graph3d.js`), no una traducción exacta
  — cubren los mismos usos que tenía la app (posicionar el menú contextual sobre un
  nodo, enfocar la cámara en un nodo, ubicar nodos nuevos sin padre), pero si en el
  futuro se usan para algo más fino puede que haya que ajustarlos.
- Las propiedades de estilo 2D que ya no aplican (`shapeProperties`,
  `widthConstraint`, `heightConstraint`, `shadow`) quedaron en el código pero el
  renderer 3D las ignora — no rompen nada, son datos muertos en los nodos.

### Qué falta probar (no pude correr un navegador real desde aquí)

Esta es una migración de librería grande y el entorno donde trabajé no tiene
navegador para verlo correr de verdad. Antes de reemplazar producción, prueba
específicamente:

1. Que el mapa cargue y los nodos aparezcan (no una pantalla negra vacía).
2. Generar un esquema inicial, expandir un nodo, usar sinergia y "vincular con...".
3. Que el menú contextual aparezca pegado al nodo clickeado (no desplazado).
4. Arrastrar un nodo y soltarlo — debe quedar fijo ahí.
5. Orbitar con el mouse y hacer zoom con la rueda.
6. Que "Ver definición" abra el panel flotante correcto para el nodo clickeado.

Si algo de esto falla, dime exactamente qué ves (o un screenshot) y lo ajusto —
los puntos más delicados de esta migración son el posicionamiento del menú
contextual (`canvasToDOM`) y el comportamiento de fijar/soltar nodos (`fixed` →
`fx/fy/fz`), así que son los primeros lugares donde miraría si algo no calza.

## Archivos nuevos / modificados en esta etapa

- **Nuevo:** `graph3d.js` — la capa de compatibilidad vis-network → 3d-force-graph.
- `app.js` — paneles flotantes (reemplaza el panel único), bloque de
  inicialización del grafo actualizado para usar `graph3d.js`.
- `lab/lab.js` — mismos ajustes de paneles flotantes; se eliminó el listener
  duplicado de "Antítesis"/"Ponme a prueba".
- `index.html` y `lab/index.html` — se reemplazó el panel único por la capa de
  paneles flotantes, se quitaron los botones de escala +/- (ya sin uso), se
  actualizó el texto de ayuda sobre controles del lienzo, y se cambiaron los
  `<script>` de `vis-network` por `three` + `three-spritetext` + `3d-force-graph`.
