# SuperLiveChat — puesta en marcha (una sola vez)

1. **SQL**: Supabase → SQL Editor → pega y ejecuta `supabase/superlivechat.sql` (crea tablas, el bucket privado `slc-photos`, funciones y vistas para ti).
2. **Netlify → Environment variables**: agrega `SUPABASE_ANON_KEY` (Supabase → Settings → API → *anon public*). Ya deberían existir `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, la clave de Gemini y `RESEND`. Vuelve a desplegar.
3. **Supabase → Authentication**
   - *Providers → Google*: actívalo (Client ID y Secret de Google Cloud; en Google agrega como redirect `https://<tu-proyecto>.supabase.co/auth/v1/callback`).
   - *URL Configuration*: Site URL `https://graphoslearning.netlify.app`; Redirect URLs: `https://graphoslearning.netlify.app/superlivechat/`.
   - *Email → Templates → Magic Link*: incluye el código en el cuerpo con `{{ .Token }}` (por ejemplo: «Tu código de SuperLiveChat es {{ .Token }}»).
   - *SMTP Settings*: configura Resend como SMTP propio (el de Supabase por defecto envía muy pocos correos por hora).
4. **Fotos de portada**: sube `superlivechat/img/hero-woman.jpg` y `superlivechat/img/hero-man.jpg` (personas reales con permiso o con licencia). Mientras no existan se ve una silueta.
5. **Videollamadas fuera de casa (opcional pero recomendado)**: variables `SLC_TURN_URL` (ej. `turn:servidor:3478`), `SLC_TURN_USER`, `SLC_TURN_PASS`. Sin servidor TURN, algunas redes móviles/corporativas no conectan.
6. **Administración**: en Supabase → Table editor: vistas `slc_resumen`, `slc_fotos_por_revisar`, `slc_reportes_abiertos`, `slc_ventas`. Comandos para aprobar o suspender están al final del SQL.

Reglas de gemas: 1 minuto = 2.000 gemas (≈ US$1). Paquetes: US$4.99→10.000 · US$9.99→21.000 · US$14.99→33.000 · US$24.99→58.000 · US$49.99→125.000 (se cambian en `PACKS` de `netlify/functions/slc.js`). Paga siempre el hombre (llame o conteste); la mujer nunca. Dos hombres: paga quien llama.
