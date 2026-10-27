-- Qué sistema de IA respondió en Graphikosmos (evento ai_call, desde 2026-10-27 13:50 hora de Costa Rica).
-- 1) Resumen por día: cuántas llamadas respondió cada sistema y cuántas fallaron del todo.
select (created_at at time zone 'America/Costa_Rica')::date as dia,
       metadata->>'provider' as sistema, metadata->>'model' as modelo,
       count(*) as llamadas, count(*) filter (where metadata->>'ok' = 'false') as fallidas,
       round(avg((metadata->>'ms')::numeric)) as ms_promedio
from public.events
where event_name = 'ai_call' and app = 'graphikosmos'
group by 1, 2, 3
order by 1 desc, llamadas desc;

-- 2) Por acción: cuáles necesitaron el respaldo de Claude o fallaron.
select metadata->>'action' as accion,
       count(*) as llamadas,
       count(*) filter (where metadata->>'provider' = 'anthropic') as con_claude,
       count(*) filter (where metadata->>'ok' = 'false') as fallidas
from public.events
where event_name = 'ai_call' and app = 'graphikosmos'
group by 1
order by fallidas desc, con_claude desc;

-- 3) Últimas llamadas que NO respondió Gemini a la primera (respaldo o error), con el motivo.
select created_at at time zone 'America/Costa_Rica' as hora_cr,
       metadata->>'action' as accion, metadata->>'provider' as sistema, metadata->>'model' as modelo,
       metadata->>'attempt' as intento, metadata->>'ms' as ms, metadata->>'error' as error, metadata->>'claude_error' as error_claude
from public.events
where event_name = 'ai_call' and app = 'graphikosmos'
  and (metadata->>'provider' <> 'google' or metadata->>'attempt' <> '1' or metadata->>'ok' = 'false')
order by created_at desc
limit 50;
