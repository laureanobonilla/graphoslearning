-- =====================================================================================================
-- «¿Quién eres?» con informe por correo + contribución voluntaria. Supabase → SQL Editor.
-- El editor solo muestra la ÚLTIMA consulta: selecciona UNA (de "-- N)" hasta su ";") y Run.
-- Desde el despliegue del informe: 2026-10-26 21:48 (Costa Rica). Cambia la fecha si quieres otro periodo.
-- OJO: los clics en los botones de contribución NO se registran (el botón está en el correo). Lo que pagaron se ve en
--      PayPal y en tus SINPE recibidos; el SQL te dice cuántos informes se entregaron, para sacar la tasa real.
-- =====================================================================================================

-- 1) EMBUDO (personas distintas) ------------------------------------------------------------------------
select
  count(distinct anon_id) filter (where event_name='landing_viewed' and coalesce(metadata->>'likelyBot','false')<>'true') as visitas,
  count(distinct anon_id) filter (where event_name='quiz_started')             as empezaron,
  count(distinct anon_id) filter (where event_name='finish_early_offered')     as pudieron_salir_antes,
  count(distinct anon_id) filter (where event_name='reading_generated_success') as lectura_generada,
  count(distinct anon_id) filter (where event_name='lead_gate_shown')          as vieron_pedir_correo,
  count(distinct anon_id) filter (where event_name='lead_email_given')         as dieron_correo,
  count(distinct anon_id) filter (where event_name='qer_lead')                 as informes_procesados,
  count(distinct anon_id) filter (where event_name='qer_lead' and metadata->>'delivered'='true') as informes_entregados
from public.events
where app='quien-eres' and created_at >= '2026-10-26 21:48:00-06';

-- 2) ¿LLEGAN LOS CORREOS? entregados vs fallidos y por qué ------------------------------------------------
select metadata->>'delivered' as entregado, coalesce(metadata->>'deliveryReason','ok') as motivo, count(*) as informes
from public.events
where app='quien-eres' and event_name='qer_lead' and created_at >= '2026-10-26 21:48:00-06'
group by 1,2 order by informes desc;

-- 3) VISITAS POR PAÍS (para saber cuántos ven SINPE y cuántos PayPal) -----------------------------------
select coalesce(metadata->>'country','?') as pais,
       count(distinct anon_id) as visitas,
       count(distinct anon_id) filter (where event_name='quiz_started') as empezaron
from public.events
where app='quien-eres' and event_name in ('landing_viewed','quiz_started')
  and coalesce(metadata->>'likelyBot','false')<>'true' and created_at >= '2026-10-26 21:48:00-06'
group by 1 order by visitas desc;

-- 4) DÓNDE SE VA LA GENTE: cuántos llegaron a cada pregunta --------------------------------------------
select (metadata->>'questionIndex')::int as pregunta, count(distinct anon_id) as personas
from public.events
where app='quien-eres' and event_name='question_answered' and created_at >= '2026-10-26 21:48:00-06'
group by 1 order by 1;

-- 5) LOS ÚLTIMOS INFORMES (arquetipo, correo, si se entregó) -------------------------------------------
select created_at at time zone 'America/Costa_Rica' as hora_cr,
       metadata->>'email' as correo, metadata->>'archetype' as arquetipo,
       metadata->>'delivered' as entregado, metadata->>'deliveryReason' as motivo
from public.events
where app='quien-eres' and event_name='qer_lead' and created_at >= '2026-10-26 21:48:00-06'
order by created_at desc limit 50;

-- =====================================================================================================
-- 6) EMBUDO DEL APORTE (caritas → página de gracias → monto → «ya aporté»). Una persona = un informe (readingId).
--    «ya aporté» es lo que la persona dice; la plata real la confirmas en PayPal / SINPE.
-- =====================================================================================================
select
  count(distinct actor_id) filter (where event_name='qer_lead' and metadata->>'delivered'='true') as informes_entregados,
  count(distinct actor_id) filter (where event_name='gracias_viewed')           as abrieron_la_pagina,
  count(distinct actor_id) filter (where event_name='gracias_viewed' and (metadata->>'score') is not null) as tocaron_una_carita,
  count(distinct actor_id) filter (where event_name='feedback_text_sent')       as dejaron_comentario,
  count(distinct actor_id) filter (where event_name='contrib_amount_selected')  as eligieron_monto,
  count(distinct actor_id) filter (where event_name in ('sinpe_number_copied','paypal_clicked')) as copiaron_sinpe_o_fueron_a_paypal,
  count(distinct actor_id) filter (where event_name='contrib_claimed')          as dicen_que_aportaron,
  count(distinct actor_id) filter (where event_name='share_clicked')            as compartieron
from public.events
where app='quien-eres' and created_at >= '2026-10-27 10:00:00-06';

-- 7) QUÉ SINTIERON Y QUÉ ESCRIBIERON (una fila por respuesta) ----------------------------------------------
select created_at at time zone 'America/Costa_Rica' as hora_cr, metadata->>'country' as pais,
       metadata->>'score' as carita_1_a_5, metadata->>'text' as comentario
from public.events
where app='quien-eres' and event_name='feedback_text_sent' and created_at >= '2026-10-27 10:00:00-06'
order by created_at desc;

-- 8) DISTRIBUCIÓN DE CARITAS (1 = nada … 5 = mucho) ---------------------------------------------------------
select metadata->>'score' as carita, count(distinct actor_id) as personas
from public.events
where app='quien-eres' and event_name='gracias_viewed' and (metadata->>'score') is not null and created_at >= '2026-10-27 10:00:00-06'
group by 1 order by 1;
