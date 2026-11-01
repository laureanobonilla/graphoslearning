# ¿Tienes cara de culo?

La persona se toma una selfie (o elige una de la galería) y recibe gratis la respuesta: SÍ o NO, al azar, en una tarjeta con marca de agua lista para compartir. El porqué (un informe forense que la IA escribe mirando su foto) queda borroso y cuesta US$2.99 (PayPal o tarjeta, sin registro). Desde que entra, una barra arriba ofrece instalar la app: en Android con Chrome se instala con un toque; en iPhone o dentro de Facebook/Instagram muestra los pasos.

Dirección: `https://graphoslearning.netlify.app/cara/`

## Para ponerla en marcha (una sola vez)

1. **Base de datos:** ejecuta `supabase/cara.sql` en Supabase → SQL Editor.
2. **Variables en Netlify:** no hace falta ninguna nueva. Usa las que ya existen: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `RESEND_API_KEY`.
   Opcionales: `CARA_PRICE_USD` (por defecto 2.99), `CARA_PROB_SI` (probabilidad de que salga SÍ, por defecto 0.5) y `CARA_MAX_PER_DAY` (análisis gratis por IP al día, por defecto 25).
3. **Anuncios:** arriba del `<script>` de `cara/index.html` hay tres campos vacíos: `META_PIXEL_ID`, `GOOGLE_TAG_ID` y `GOOGLE_PURCHASE_SEND_TO`. Pega ahí tus IDs y la página manda sola los eventos `ViewContent` (vio su veredicto), `InitiateCheckout` (tocó pagar) y `Purchase` (pagó, con el monto).

## Enlaces para los anuncios

Agrega `?ref=NOMBRE` al enlace de cada anuncio (por ejemplo `/cara/?ref=fb-selfie1`). Ese nombre queda guardado en cada análisis y en cada pago, así sabes qué anuncio vende. Lo que llega por los enlaces compartidos entra como `ref=compartido`.

## Cómo ver los números

En Supabase:
- `cara_resumen_diario`: análisis, pagos, % de conversión y dólares por día.
- `cara_jobs_friendly`: cada análisis con su veredicto, país, origen y si pagó.

Cada pago también te llega por correo.

## Privacidad y seguridad

- La respuesta la sortea el servidor antes de llamar a la IA; la IA solo escribe el porqué.
- La foto **no se guarda en ningún lado**: viaja reducida a la función, la IA la mira y se descarta. Solo queda el texto.
- Si la IA ve a alguien que parece menor de 18, desnudez o ninguna cara, no da veredicto.
- Las reglas de humor (nada sobre peso, piel, etnia, discapacidad, edad, género, ni sexual) están en `netlify/functions/_lib/cara-core.js`, en `PROMPT`. Ahí mismo se cambia el tono.

## Archivos

- `cara/`: página, icono, manifest y service worker (para que se pueda instalar).
- `netlify/functions/cara-*.js` y `_lib/cara-core.js`: IA, cobro y lectura del informe.
- `supabase/cara.sql`: tabla y vistas.
- `sfc-track-event.js`: se agregó `cara` a la lista de apps para registrar sus eventos.
