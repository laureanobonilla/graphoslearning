-- ¿Quién eres? — sesión. SOLO 2 consultas. No hay nada que preparar: usa la tabla events que ya existe.
-- Pega UNA consulta, selecciónala y dale Run. Horas en hora de Costa Rica.

-- 1) UNA FILA POR PERSONA (la más reciente arriba): cuándo entró, cuándo fue lo último que hizo,
--    por qué pregunta va, si usó micrófono, si vio el muro, si tocó "Seguir leyendo", si pagó y de qué país.
select
  to_char(min(created_at) at time zone 'America/Costa_Rica', 'DD-Mon HH24:MI')  as entro,
  to_char(max(created_at) at time zone 'America/Costa_Rica', 'DD-Mon HH24:MI')  as ultima_actividad,
  coalesce(max((metadata->>'n')::int) filter (where event_name = 'ses_answer'), 0) as pregunta_alcanzada,
  bool_or(event_name in ('ses_mic_used'))            as uso_microfono,
  bool_or(event_name = 'ses_crisis')                 as crisis,
  bool_or(event_name = 'ses_portrait_ready')         as llego_al_retrato,
  bool_or(event_name = 'ses_paywall_seen')           as vio_muro,
  bool_or(event_name = 'ses_continue_clicked')       as toco_seguir_leyendo,
  bool_or(event_name = 'ses_paypal_ready')           as vio_paypal,
  bool_or(event_name = 'ses_paid')                   as pago,
  max(metadata->>'country')                          as pais,
  anon_id as persona
from public.events
where app = 'quien-eres-sesion'
group by anon_id
order by min(created_at) desc;

-- 2) EMBUDO RESUMIDO: cuántas personas llegaron a cada paso (y % respecto a los que empezaron).
with p as (
  select anon_id,
    bool_or(event_name = 'ses_start') as empezo,
    coalesce(max((metadata->>'n')::int) filter (where event_name = 'ses_answer'), 0) as n,
    bool_or(event_name = 'ses_mic_used') as mic,
    bool_or(event_name = 'ses_portrait_ready') as retrato,
    bool_or(event_name = 'ses_paywall_seen') as muro,
    bool_or(event_name = 'ses_continue_clicked') as seguir,
    bool_or(event_name = 'ses_paypal_ready') as paypal,
    bool_or(event_name = 'ses_paid') as pago
  from public.events where app = 'quien-eres-sesion' group by anon_id
), t as (select count(*) filter (where empezo) as base from p)
select paso, personas, round(100.0 * personas / nullif((select base from t), 0), 1) as pct_de_los_que_empezaron from (
  select 1 as o, 'Empezaron' as paso, count(*) filter (where empezo) as personas from p
  union all select 2, 'Contestaron 5 preguntas', count(*) filter (where n >= 5) from p
  union all select 3, 'Contestaron 8', count(*) filter (where n >= 8) from p
  union all select 4, 'Contestaron las 12', count(*) filter (where n >= 12) from p
  union all select 5, 'Usaron el micrófono', count(*) filter (where mic) from p
  union all select 6, 'Recibieron su retrato', count(*) filter (where retrato) from p
  union all select 7, 'Vieron el muro', count(*) filter (where muro) from p
  union all select 8, 'Tocaron "Seguir leyendo"', count(*) filter (where seguir) from p
  union all select 9, 'Vieron PayPal', count(*) filter (where paypal) from p
  union all select 10, 'Pagaron', count(*) filter (where pago) from p
) x order by o;
