-- =====================================================================================================
-- «tu-cancion»: consultas para ver TODO. Supabase → SQL Editor (selecciona UNA consulta, de "-- N)" hasta su ";", y Run).
-- Antes: corre UNA vez supabase/tu-cancion.sql (crea la tabla tc_songs). Cambia  interval '7 days'  al periodo que quieras.
-- Las personas están en la tabla  tc_songs  (lo que armaron) y en  events  (app = 'tu-cancion', cada paso).
-- =====================================================================================================

-- 1) TODAS LAS CANCIONES, lo más nuevo primero (horas de Costa Rica) -------------------------------------
select * from public.tc_songs_friendly order by 1 desc limit 100;

-- 2) SOLO LAS QUE LLEGARON A TI (dejaron teléfono) --------------------------------------------------------
select * from public.tc_songs_friendly where status = 'requested' order by 1 desc;

-- 3) INTENCIONES de WhatsApp (abrieron WhatsApp; solo cuenta si te llega su mensaje con el código) ------
select id, created_at at time zone 'America/Costa_Rica' as hora, country, title, rhythm, price_text
from public.tc_songs where status = 'whatsapp_intent' order by created_at desc;

-- 4) EMBUDO por pasos (personas distintas) ----------------------------------------------------------------
select
  count(distinct anon_id) filter (where event_name='landing_viewed' and coalesce(metadata->>'likelyBot','false')<>'true') as visitas,
  count(distinct anon_id) filter (where event_name='examples_clicked')  as tocaron_ejemplos,
  count(distinct anon_id) filter (where event_name='example_played')    as escucharon_ejemplo,
  count(distinct anon_id) filter (where event_name='cta_clicked')       as tocaron_quiero_mi_cancion,
  count(distinct anon_id) filter (where event_name='reason_chosen' or (event_name='has_lyrics_chosen' and metadata->>'hasOwn'='true')) as contestaron_primera_pregunta,
  count(distinct anon_id) filter (where event_name in ('lyrics_generated','own_lyrics_ready')) as llegaron_a_la_letra,
  count(distinct anon_id) filter (where event_name='edit_saved')        as editaron,
  count(distinct anon_id) filter (where event_name='send_opened')       as abrieron_enviar,
  count(distinct anon_id) filter (where event_name='price_shown')       as vieron_precio_al_enviar,
  count(distinct anon_id) filter (where event_name='price_ack')         as marcaron_acepto_precio,
  count(distinct anon_id) filter (where event_name='whatsapp_clicked')  as tocaron_whatsapp,
  count(distinct anon_id) filter (where event_name='request_submitted') as dejaron_telefono
from public.events where app='tu-cancion' and created_at >= now() - interval '7 days';

-- 5) DÓNDE SE VA LA GENTE: qué paso vieron por última vez (paso → personas) --------------------------------
select metadata->>'step' as paso, count(distinct anon_id) as personas
from public.events where app='tu-cancion' and event_name='step_viewed' and created_at >= now() - interval '7 days'
group by 1 order by 2 desc;

-- 6) POR PAÍS y precio que vieron ----------------------------------------------------------------------------
select country, price_text, count(*) as canciones, count(*) filter (where status='requested') as con_telefono
from public.tc_songs where created_at >= now() - interval '7 days' group by 1,2 order by 3 desc;

-- 7) RITMOS y RAZONES más pedidos -----------------------------------------------------------------------------
select rhythm, count(*) as veces from public.tc_songs where rhythm is not null group by 1 order by 2 desc;
-- (para razones, cambia rhythm por reason)

-- 8) ¿Trajeron su propia letra o la escribió la IA? ------------------------------------------------------------
select has_own_lyrics, status, count(*) from public.tc_songs group by 1,2 order by 1,2;

-- 9) Correos que fallaron o registros que fueron al respaldo (tabla no creada / error) -------------------------
select created_at at time zone 'America/Costa_Rica' as hora, event_name, metadata
from public.events where app='tu-cancion' and event_name in ('tc_request_failed','tc_record_fallback') order by created_at desc limit 50;
