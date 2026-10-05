# Vestirte

App de recomendación de ropa: 10 preguntas + 5 fotos → perfil de estilo → 10 ocasiones (2 gratis: la más usada y la menos usada; 8 de pago, con opción cara / intermedia / barata).

## 1. Imágenes de las siluetas (carpeta `vestirte/img/`)
| Archivo | Qué debe mostrar |
|---|---|
| `guia-rostro.png` | Rostro de cerca |
| `guia-frente.png` | Cuerpo entero de frente |
| `guia-espalda.png` | Cuerpo entero de espaldas |
| `guia-perfil.png` | Cuerpo entero de perfil |
| `guia-torso.png` | De la cintura para arriba, de frente, con camiseta/top puesto |

Proporción recomendada 3:4 (vertical), fondo transparente o blanco. Mientras falten, la página muestra una silueta genérica.

## 2. Variables de entorno en Netlify
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `VST_ADMIN_KEY` (clave larga que tú inventas para el panel), y opcional `VST_PHOTO_RETENTION_DAYS` (por defecto 30; si la cambias, actualiza el texto "hasta 30 días" en `app.js`).
Ya existentes y reutilizadas: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`, las de PayPal.

## 3. Base de datos
Ejecuta `supabase/vestirte.sql` en el SQL Editor de Supabase.

## 4. Ver las fotos
`https://TU-SITIO/vestirte/admin/` → escribe `VST_ADMIN_KEY`. Las fotos están en Cloudinary como **privadas** (`authenticated`): no existe ninguna URL pública; el panel las pide al servidor una a una.

## 5. Borrado automático (opcional pero recomendado)
En `netlify.toml`:
```
[functions."vst-purge"]
  schedule = "@daily"
```
También puedes pulsar "Borrar fotos vencidas" en el panel.

## Seguridad incorporada
Casillas de mayoría de edad y consentimiento; fotos siempre con ropa; la IA revisa cada lote y, si ve a un menor, desnudez o algo que no es una persona, borra las fotos y no guarda nada; las fotos nunca se guardan en el navegador; la persona puede borrarlas desde su resultado.
