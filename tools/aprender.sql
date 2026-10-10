-- =====================================================================================================
-- «aprender» (/aprender/ → Graphikosmos): consultas para ver TODO el recorrido.
-- Supabase → SQL Editor: selecciona UNA consulta (de "-- N)" hasta su ";") y Run.
-- Antes: corre UNA vez supabase/herramientas.sql y supabase/aprender.sql.
-- Cambia  interval '7 days'  al periodo que quieras (o usa una hora fija: created_at >= '2026-10-08 12:00-06').
-- Qué hay y dónde:
--   · hf_responses (tool = 'aprende'): lo que respondió cada persona (una fila por persona, se llena paso a paso).
--   · ap_texts: el texto que se le escribió.
--   · events con app = 'hf-aprende': los pasos en la página /aprender/.
--   · events con app = 'graphikosmos': lo que hizo después en Graphikosmos. Se cruzan por anon_id (el mismo navegador)
--     y por el evento aprende_handoff, que trae el código (sid) de la persona.
-- Con pocas personas (menos de ~30) son anécdotas, no estadística: léelas una por una.
-- =====================================================================================================

-- 1) RESUMEN: cuántos empezaron, terminaron y llegaron a Graphikosmos -----------------------------------
select
  (select count(*) from public.hf_responses where tool='aprende' and created_at > now() - interval '7 days')                           as personas_con_alguna_respuesta,
  (select count(*) from public.hf_responses where tool='aprende' and completed and created_at > now() - interval '7 days')            as terminaron_cuestionario,
  (select count(*) from public.ap_texts where created_at > now() - interval '7 days')                                                  as textos_generados,
  (select count(*) from public.ap_texts where claimed_at is not null and created_at > now() - interval '7 days')                       as llegaron_a_graphikosmos,
  (select count(distinct h.anon_id) from public.events h where h.app='graphikosmos' and h.event_name='aprende_handoff' and h.created_at > now() - interval '7 days'
     and exists (select 1 from public.events e where e.app='graphikosmos' and e.anon_id=h.anon_id and e.event_name='schema_generate_success' and e.created_at >= h.created_at)) as con_esquema_generado;

-- 2) EMBUDO en la página (personas distintas) ----------------------------------------------------------
select
  count(distinct anon_id) filter (where event_name='landing_viewed')  as visitas,
  count(distinct anon_id) filter (where event_name='start_clicked')   as empezaron,
  count(distinct anon_id) filter (where event_name='step_viewed' and metadata->>'step'='q1')        as vieron_pregunta_1,
  count(distinct anon_id) filter (where event_name='step_viewed' and metadata->>'step'='estilo')    as llegaron_al_estilo,
  count(distinct anon_id) filter (where event_name='completed')       as terminaron,
  count(distinct anon_id) filter (where event_name='generate_ok')     as texto_listo,
  count(distinct anon_id) filter (where event_name='redirect')        as pasaron_a_graphikosmos
from public.events where app='hf-aprende' and created_at > now() - interval '7 days';

-- 3) DÓNDE SE QUEDAN: personas que vieron cada paso ------------------------------------------------------
select metadata->>'step' as paso, count(distinct anon_id) as personas
from public.events where app='hf-aprende' and event_name='step_viewed' and created_at > now() - interval '7 days'
group by 1 order by 2 desc;

-- 4) QUÉ QUIEREN ENTENDER (las materias con las que puedes mercadear) ------------------------------------
select created_at at time zone 'America/Costa_Rica' as hora, country, answers->>'tema' as tema, answers->>'proposito' as para_que,
       answers->>'nivel' as nivel, answers->>'estilo' as estilo, completed
from public.hf_responses where tool='aprende' and answers ? 'tema' order by created_at desc limit 500;

-- 5) DÓNDE SE LES DIFICULTA (las 3 preguntas que propuso la IA y lo que contestaron) --------------------
select answers->>'tema' as tema, answers->>'q1' as pregunta_1, answers->>'a1' as respuesta_1, answers->>'a1_otro' as otra_1,
       answers->>'q2' as pregunta_2, answers->>'a2' as respuesta_2, answers->>'a2_otro' as otra_2,
       answers->>'q3' as pregunta_3, answers->>'a3' as respuesta_3, answers->>'a3_otro' as otra_3
from public.hf_responses where tool='aprende' and answers ? 'q1' order by created_at desc limit 300;

-- 6) PROPÓSITO, NIVEL Y ESTILO (distribuciones) ---------------------------------------------------------
select 'proposito' as campo, answers->>'proposito' as valor, count(*) from public.hf_responses where tool='aprende' and answers ? 'proposito' group by 2
union all select 'nivel', answers->>'nivel', count(*) from public.hf_responses where tool='aprende' and answers ? 'nivel' group by 2
union all select 'estilo', answers->>'estilo', count(*) from public.hf_responses where tool='aprende' and answers ? 'estilo' group by 2
order by 1, 3 desc;

-- 7) ¿LA IA PROPUSO LAS PREGUNTAS o se usaron las de respaldo? y cuánto tardó el texto -------------------
select event_name, coalesce(metadata->>'fallback','-') as respaldo, count(*) as veces, round(avg((metadata->>'seconds')::numeric),1) as segundos_prom
from public.events where app='hf-aprende' and event_name in ('ai_q_shown','generate_ok','generate_failed') and created_at > now() - interval '7 days'
group by 1,2 order by 1,2;

-- 8) EN GRAPHIKOSMOS: qué pasó con quienes llegaron desde /aprender/ -------------------------------------
select h.created_at at time zone 'America/Costa_Rica' as hora, h.metadata->>'sid' as sid, h.metadata->>'firstVisit' as primera_vez,
       (select count(*) from public.events e where e.app='graphikosmos' and e.anon_id=h.anon_id and e.created_at >= h.created_at) as eventos_despues,
       (select bool_or(e.event_name='schema_generate_success') from public.events e where e.app='graphikosmos' and e.anon_id=h.anon_id and e.created_at >= h.created_at) as esquema_ok
from public.events h where h.app='graphikosmos' and h.event_name='aprende_handoff' and h.created_at > now() - interval '7 days'
order by h.created_at desc;

-- 9) LO QUE HICIERON DESPUÉS en Graphikosmos (eventos de esas personas, por tipo) -----------------------
select e.event_name, count(*) as veces, count(distinct e.anon_id) as personas
from public.events e
where e.app='graphikosmos' and e.created_at > now() - interval '7 days'
  and e.anon_id in (select anon_id from public.events where app='graphikosmos' and event_name='aprende_handoff')
group by 1 order by 2 desc;

-- 10) EL TOUR GUIADO: cuántos lo vieron, hasta dónde llegaron, cuántos lo saltaron -----------------------
select event_name, coalesce(metadata->>'step', metadata->>'at', metadata->>'from') as detalle, coalesce(metadata->>'via','') as como, count(*) as veces, count(distinct anon_id) as personas
from public.events where app='graphikosmos' and event_name like 'coach_%' and created_at > now() - interval '7 days'
group by 1,2,3 order by 1,2,3;

-- 11) POR CAMPAÑA / ANUNCIO de Facebook (Facebook pone el número solo) --------------------------------
select utm->>'campaign' as campana, utm->>'ad' as anuncio, count(*) as personas, count(*) filter (where completed) as terminaron
from public.hf_responses where tool='aprende' and created_at > now() - interval '7 days' group by 1,2 order by 3 desc;

-- 12) TODO de una persona (cambia el código) -------------------------------------------------------------
-- select * from public.hf_responses where sid = 'PEGA-AQUI-EL-CODIGO';
-- select title, left(text, 600) from public.ap_texts where sid = 'PEGA-AQUI-EL-CODIGO';

-- 13) ACTIVIDAD JUNTA: Entiéndelo + Graphikosmos en una sola línea de tiempo, persona por persona -----------
--     «persona» = los primeros 8 caracteres de su anon_id (el mismo navegador, antes y después del traspaso).
--     Cambia las 24 horas al periodo que quieras; para una sola persona agrega:  and anon_id::text like 'abc12345%'
select to_char(created_at at time zone 'America/Costa_Rica', 'MM-DD HH24:MI:SS') as hora,
       left(anon_id::text, 8) as persona,
       case app when 'hf-aprende' then 'Entiéndelo' else 'Graphikosmos' end as donde,
       event_name as evento,
       coalesce(metadata->>'step', metadata->>'mode', metadata->>'reason', metadata->>'layoutMode', metadata->>'at', '') as detalle
from public.events
where app in ('hf-aprende', 'graphikosmos') and created_at > now() - interval '24 hours'
order by anon_id, created_at;

-- 14) RESUMEN POR PERSONA: qué hizo en cada lado ---------------------------------------------------------------
select left(anon_id::text, 8) as persona,
       to_char(min(created_at) at time zone 'America/Costa_Rica', 'MM-DD HH24:MI') as primera_actividad,
       count(*) filter (where app = 'hf-aprende') as eventos_entiendelo,
       count(*) filter (where app = 'graphikosmos') as eventos_graphikosmos,
       bool_or(event_name = 'completed') as termino_cuestionario,
       bool_or(event_name = 'aprende_handoff') as llego_a_graphikosmos,
       bool_or(event_name = 'schema_generate_success') as se_genero_esquema,
       bool_or(event_name = 'coach_completed') as completo_tour,
       bool_or(event_name = 'coach_skipped') as salto_tour
from public.events
where app in ('hf-aprende', 'graphikosmos') and created_at > now() - interval '7 days'
group by anon_id
order by min(created_at) desc;

-- 15) EL FLUJO COMPLETO: de la página de Entiéndelo hasta lo que hacen dentro de Graphikosmos -----------------
--     Una fila por etapa, con las personas (navegadores distintos) que entraron por Entiéndelo en el periodo.
--     «pct» es sobre las que vieron la página. Cambia  interval '7 days'  al periodo que quieras.
with base as (
  select distinct anon_id from public.events
  where app = 'hf-aprende' and event_name = 'landing_viewed' and created_at > now() - interval '7 days'
), ev as (
  select e.anon_id, e.app, e.event_name, e.created_at from public.events e join base b using (anon_id)
  where e.app in ('hf-aprende', 'graphikosmos') and e.created_at > now() - interval '8 days'
), hand as (
  select anon_id, min(created_at) as t from ev where app = 'graphikosmos' and event_name = 'aprende_handoff' group by anon_id
), etapas(orden, etapa, personas) as (
  select 1, 'Vieron la página de Entiéndelo', (select count(*) from base)
  union all select 2, 'Empezaron (clic en Empezar)',          (select count(distinct anon_id) from ev where event_name = 'start_clicked')
  union all select 3, 'Terminaron las preguntas',              (select count(distinct anon_id) from ev where event_name = 'completed')
  union all select 4, 'Texto a su medida listo',               (select count(distinct anon_id) from ev where event_name = 'generate_ok')
  union all select 5, 'Llegaron a Graphikosmos',               (select count(*) from hand)
  union all select 6, 'Se les generó el esquema',              (select count(distinct h.anon_id) from hand h join ev e on e.anon_id = h.anon_id and e.app = 'graphikosmos' and e.event_name = 'schema_generate_success' and e.created_at >= h.t)
  union all select 7, 'Empezaron el tour guiado',              (select count(distinct h.anon_id) from hand h join ev e on e.anon_id = h.anon_id and e.event_name = 'coach_started' and e.created_at >= h.t)
  union all select 8, 'Terminaron el tour',                    (select count(distinct h.anon_id) from hand h join ev e on e.anon_id = h.anon_id and e.event_name = 'coach_completed' and e.created_at >= h.t)
  union all select 9, 'Siguieron usando Graphikosmos (otra acción distinta al traspaso, tour y esquema inicial)',
                       (select count(distinct h.anon_id) from hand h join ev e on e.anon_id = h.anon_id and e.app = 'graphikosmos' and e.created_at > h.t
                        and e.event_name not in ('aprende_handoff','aprende_schema_start','schema_generate_attempt','schema_generate_success','schema_generate_error','coach_started','coach_step','coach_step_done','coach_completed','coach_skipped','first_visit','return_visit'))
  union all select 10, 'Volvieron otro día a Graphikosmos',    (select count(distinct h.anon_id) from hand h join ev e on e.anon_id = h.anon_id and e.app = 'graphikosmos' and e.created_at::date > h.t::date)
  union all select 11, 'Vieron el aviso de pago o de iniciar sesión', (select count(distinct h.anon_id) from hand h join ev e on e.anon_id = h.anon_id and e.event_name in ('paywall_shown','login_wall_shown') and e.created_at >= h.t)
)
select orden, etapa, personas, round(100.0 * personas / nullif((select count(*) from base), 0), 0) as pct
from etapas order by orden;

-- 16) ACTIVIDAD GENERAL POR DÍA, de ambas ---------------------------------------------------------------------
select (created_at at time zone 'America/Costa_Rica')::date as dia,
       count(distinct anon_id) filter (where app = 'hf-aprende')   as personas_entiendelo,
       count(distinct anon_id) filter (where app = 'graphikosmos') as personas_graphikosmos,
       count(distinct anon_id) filter (where event_name = 'aprende_handoff') as llegaron_desde_entiendelo,
       count(*) filter (where event_name = 'schema_generate_success') as esquemas_generados,
       count(*) filter (where event_name in ('paywall_shown', 'login_wall_shown')) as avisos_de_pago_o_login
from public.events
where app in ('hf-aprende', 'graphikosmos') and created_at > now() - interval '14 days'
group by 1 order by 1 desc;
