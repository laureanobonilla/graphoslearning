-- =====================================================================================================
-- APPS DE PAGO «¿Quién eres?»: quien-eres · who-are-you · quien-es-tu-pareja · who-is-your-partner
-- Supabase → SQL Editor. El editor solo muestra la ÚLTIMA consulta: selecciona UNA (de "-- N)" hasta su ";") y Run.
-- Las apps nuevas marcan variant='paid' en cada evento: los filtros lo usan para NO mezclar los datos viejos de quien-eres (versión de canciones).
-- Cambia la app en "app = '...'" (o usa  app in (...)) y el periodo en  interval '3 days'.
-- Todo sale de la tabla `events`; cada persona es un `anon_id` (navegador). Se excluyen bots (likelyBot).
-- =====================================================================================================

-- 1) EMBUDO COMPLETO por app (personas distintas) -------------------------------------------------------
select app,
  count(distinct anon_id) filter (where event_name='landing_viewed' and coalesce(metadata->>'likelyBot','false')<>'true') as visitas,
  count(distinct anon_id) filter (where event_name='quiz_started')              as empezaron,
  count(distinct anon_id) filter (where event_name='finish_early_offered')      as llegaron_a_15,
  count(distinct anon_id) filter (where event_name='quiz_finished_early')       as terminaron_en_15_a_24,
  count(distinct anon_id) filter (where event_name='reading_generated_success') as vieron_lectura_gratis,
  count(distinct anon_id) filter (where event_name='read_more_clicked')         as tocaron_seguir_leyendo,
  count(distinct anon_id) filter (where event_name='paywall_in_view')           as vieron_el_pago,
  count(distinct anon_id) filter (where event_name in ('sinpe_upload_clicked','paypal_link_clicked','paypal_link_missing')) as intentaron_pagar,
  count(distinct anon_id) filter (where event_name='payment_unlocked_client')   as desbloquearon
from public.events
where app in ('quien-eres','who-are-you','quien-es-tu-pareja','who-is-your-partner') and metadata->>'variant'='paid'
  and created_at >= now() - interval '3 days'
group by app order by app;

-- 2) DÓNDE SE VA LA GENTE: cuántos llegaron a cada pregunta (1-25) --------------------------------------
select (metadata->>'questionIndex')::int as pregunta,
       count(distinct anon_id) as personas,
       round(avg((metadata->>'seconds')::numeric),1) as seg_promedio,
       count(*) filter (where metadata->>'custom'='true') as respuestas_otra
from public.events
where app = 'quien-eres' and metadata->>'variant'='paid' and event_name = 'question_answered'
  and created_at >= now() - interval '3 days'
group by 1 order by 1;

-- 3) PAÍS Y MÉTODO: quién desbloqueó y cómo (confianza, sin verificar pago) ----------------------------
select created_at at time zone 'America/Costa_Rica' as hora_cr, app,
       metadata->>'method' as metodo, metadata->>'country' as pais_servidor, metadata->>'clientCountry' as pais_cliente,
       metadata->>'shownAmount' as monto_mostrado, anon_id
from public.events
where event_name = 'payment_unlocked_trust' and created_at >= now() - interval '7 days'
order by created_at desc;

-- 4) FOTOS DE SINPE SUBIDAS, con señales de sospecha (para decidir si vale la pena validar) -------------
--    sospecha_* = true cuando algo no cuadra con un comprobante recién hecho:
--      foto_vieja: el archivo se creó hace más de 120 min · muy_rapido: subió en menos de 25 s desde que vio el pago
--      sin_copiar_numero: nunca tocó "copiar número" (no prueba nada por sí solo)
select created_at at time zone 'America/Costa_Rica' as hora_cr, anon_id,
       metadata->>'name' as archivo, metadata->>'type' as tipo,
       round((metadata->>'size')::numeric/1024) as kb, (metadata->>'w')||'x'||(metadata->>'h') as dimensiones,
       (metadata->>'ageMin')::int as edad_archivo_min, (metadata->>'secondsSincePanel')::int as seg_desde_pago,
       (metadata->>'attempt')::int as intento, metadata->>'copiedPhone' as copio_numero,
       ((metadata->>'ageMin') is null or (metadata->>'ageMin')::int > 120) as sospecha_foto_vieja,
       ((metadata->>'secondsSincePanel')::int < 25)                         as sospecha_muy_rapido,
       ((metadata->>'size')::numeric < 15000 or (metadata->>'w')::int < 300) as sospecha_muy_chica
from public.events
where event_name = 'sinpe_photo_selected' and created_at >= now() - interval '7 days'
order by created_at desc;

-- 4b) INTENTOS RECHAZADOS (archivo que no era imagen) -------------------------------------------------
select created_at at time zone 'America/Costa_Rica' as hora_cr, anon_id, metadata->>'name' as archivo, metadata->>'type' as tipo
from public.events where event_name = 'sinpe_file_rejected' and created_at >= now() - interval '7 days'
order by created_at desc;

-- 5) CONTRASTE CON LA REALIDAD: desbloqueos de SINPE por día vs. lo que veas en tu app del banco ---------
select (created_at at time zone 'America/Costa_Rica')::date as dia, count(*) as desbloqueos_sinpe
from public.events
where event_name = 'payment_unlocked_trust' and metadata->>'method' = 'sinpe_photo'
group by 1 order by 1 desc;

-- 6) PAYPAL: cuántos tocaron el botón, por país, y cuántos toparon con «aún no disponible» ---------------
select metadata->>'country' as pais, event_name, count(distinct anon_id) as personas
from public.events
where event_name in ('paypal_shown','paypal_link_clicked','paypal_link_missing','paypal_popup_blocked')
  and created_at >= now() - interval '7 days'
group by 1,2 order by 1,2;

-- 7) POR QUÉ NO PAGAN (botón «¿Qué te frena?») + quienes saltaron el pago ---------------------------------
select app, coalesce(metadata->>'reason','(saltó sin elegir motivo)') as motivo, count(distinct anon_id) as personas
from public.events
where event_name in ('paywall_skip_reason','paywall_skipped') and metadata->>'variant'='paid' and created_at >= now() - interval '7 days'
group by 1,2 order by 1, 3 desc;

-- 8) LÍNEA DE TIEMPO DE UNA PERSONA (pega su anon_id) -------------------------------------------------
select created_at at time zone 'America/Costa_Rica' as hora_cr, event_name,
       metadata->>'questionIndex' as pregunta, left(coalesce(metadata->>'answer',''),80) as respuesta, metadata
from public.events
where anon_id = 'PEGA-AQUI-EL-ANON-ID'
order by created_at;

-- 9) ARQUETIPOS Y LECTURAS que se generaron (para ver qué se le muestra a la gente) ----------------------
select created_at at time zone 'America/Costa_Rica' as hora_cr, app, anon_id, metadata->>'archetypeName' as arquetipo,
       metadata->>'freeChapters' as capitulos_gratis
from public.events where event_name = 'paywall_shown' and metadata->>'variant'='paid' and created_at >= now() - interval '3 days'
order by created_at desc;

-- 10) RESPUESTAS «OTRA» escritas por la gente en las preguntas de elegir (para mejorar las opciones) -----
select (metadata->>'questionIndex')::int as pregunta, metadata->>'question' as texto_pregunta, metadata->>'answer' as escribio
from public.events
where event_name='question_answered' and metadata->>'custom'='true' and app='quien-eres' and metadata->>'variant'='paid'
  and created_at >= now() - interval '7 days'
order by 1, created_at desc;
