-- =====================================================================================================
-- «herramientas» (fuga-de-tiempo, nivel-ia, ideas-posts): consultas para ver TODO.
-- Supabase → SQL Editor: selecciona UNA consulta (de "-- N)" hasta su ";") y Run.
-- Antes: corre UNA vez supabase/herramientas.sql. Cambia  interval '7 days'  al periodo que quieras.
-- Cada persona = una fila en hf_responses (se va completando pregunta a pregunta); los pasos están en events (app = 'hf-...').
-- OJO: con pocas respuestas (menos de ~30 por herramienta) son anécdotas, no estadística.
-- =====================================================================================================

-- 1) RESUMEN por herramienta ---------------------------------------------------------------------------
select tool, count(*) as personas, count(*) filter (where completed) as terminaron,
       count(*) filter (where contact_email is not null or contact_whatsapp is not null) as dejaron_contacto
from public.hf_responses where created_at > now() - interval '7 days' group by tool order by personas desc;

-- 2) EMBUDO por herramienta (personas distintas, desde events) -----------------------------------------
select app,
  count(distinct anon_id) filter (where event_name='landing_viewed')   as visitas,
  count(distinct anon_id) filter (where event_name='start_clicked')    as empezaron,
  count(distinct anon_id) filter (where event_name='completed')        as terminaron,
  count(distinct anon_id) filter (where event_name='result_viewed')    as vieron_resultado,
  count(distinct anon_id) filter (where event_name='contact_submitted') as dejaron_contacto
from public.events where app like 'hf-%' and created_at > now() - interval '7 days' group by app order by app;

-- 3) DÓNDE SE QUEDAN (última pregunta vista por quienes no terminaron) ---------------------------------
select tool, step, count(*) as personas from public.hf_responses
where not completed and created_at > now() - interval '7 days' group by tool, step order by tool, step;

-- 4) CUÁNTO PAGARÍAN (pagaria) por herramienta ---------------------------------------------------------
select tool, answers->>'pagaria' as pagaria, count(*) from public.hf_responses
where answers ? 'pagaria' and created_at > now() - interval '7 days' group by 1,2 order by 1,3 desc;

-- 5) FUGA DE TIEMPO: tareas que más repiten (texto libre, con horas) -----------------------------------
select created_at at time zone 'America/Costa_Rica' as hora, answers->>'rol' as rol, t->>'t' as tarea, t->>'h' as horas_sem
from public.hf_responses, jsonb_array_elements(case when jsonb_typeof(answers->'tareas')='array' then answers->'tareas' else '[]'::jsonb end) t
where tool='fuga-de-tiempo' and coalesce(t->>'t','')<>'' order by 1 desc limit 300;

-- 6) FUGA DE TIEMPO: qué harían con una varita mágica + qué software pagan/odian ----------------------
select created_at at time zone 'America/Costa_Rica' as hora, answers->>'rol' as rol, answers->>'varita' as varita, answers->>'software_actual' as software, answers->'resultado'->>'anual_usd' as perdida_anual_usd
from public.hf_responses where tool='fuga-de-tiempo' and (answers ? 'varita' or answers ? 'software_actual') order by 1 desc limit 300;

-- 7) NIVEL DE IA: distribución de puntajes, tamaño y sector --------------------------------------------
select answers->>'nivel' as nivel, answers->>'tamano' as tamano, answers->>'sector' as sector, count(*), round(avg((answers->>'puntaje')::numeric),1) as puntaje_prom
from public.hf_responses where tool='nivel-ia' and answers ? 'puntaje' group by 1,2,3 order by 4 desc;

-- 8) NIVEL DE IA: mayores cuellos de botella y software actual -----------------------------------------
select answers->>'cuello' as cuello, count(*) from public.hf_responses where tool='nivel-ia' and answers ? 'cuello' group by 1 order by 2 desc;
select created_at at time zone 'America/Costa_Rica' as hora, answers->>'sector' as sector, answers->>'software_actual' as software
from public.hf_responses where tool='nivel-ia' and coalesce(answers->>'software_actual','')<>'' order by 1 desc limit 300;

-- 9) IDEAS DE POSTS: negocios y desafíos ---------------------------------------------------------------
select created_at at time zone 'America/Costa_Rica' as hora, answers->>'negocio' as negocio, answers->>'publico' as publico, answers->>'meta' as meta, answers->>'desafio' as desafio
from public.hf_responses where tool='ideas-posts' order by 1 desc limit 300;
select answers->>'desafio' as desafio, count(*) from public.hf_responses where tool='ideas-posts' and answers ? 'desafio' group by 1 order by 2 desc;

-- 10) CONTACTOS (quienes dejaron correo/WhatsApp) ------------------------------------------------------
select * from public.hf_responses_friendly where contact_email is not null or contact_whatsapp is not null order by 1 desc;

-- 11) POR CAMPAÑA de Facebook (Facebook pone el número solo) ------------------------------------------
select utm->>'campaign' as campana, utm->>'ad' as anuncio, tool, count(*) as personas, count(*) filter (where completed) as terminaron
from public.hf_responses where created_at > now() - interval '7 days' group by 1,2,3 order by 4 desc;

-- 12) TODO lo de una persona (cambia el código) --------------------------------------------------------
-- select * from public.hf_responses where sid = 'PEGA-AQUI-EL-CODIGO';
