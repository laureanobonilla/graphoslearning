-- =====================================================================================================
-- RINDE y ORDENA: seguir a cada cliente.   Supabase → SQL Editor.
-- El editor solo muestra el resultado de la ÚLTIMA consulta: selecciona UNA (de "-- N)" hasta su ";") y dale Run.
--
-- Está escrito para RINDE. Para ORDENA: Ctrl+H y reemplaza la palabra  rinde  por  ordena  en todo el archivo
-- (cambia el app, los nombres de eventos y las tablas rinde_access → ordena_access, etc.).
--
-- Cómo se identifica a la persona:
--   · Antes de crear cuenta: por anon_id (un id aleatorio de su navegador).
--   · Con cuenta: por actor_id (su usuario) y actor_label (su correo). Su anon_id se mantiene, así que se puede ver
--     también lo que hizo ANTES de registrarse.
--   · Los eventos que empiezan con rinde_srv_ los escribe el servidor (sesión, plan, orden y pago): no dependen
--     del navegador y siempre traen el correo.
--   · Las cuentas de administrador no generan eventos desde el navegador (son pruebas propias).
-- =====================================================================================================


-- 1) CLIENTES REGISTRADOS: una fila por cuenta, con lo que hizo y si pagó --------------------------------
with cuentas as (
  select user_id, email from public.rinde_projects
  union select user_id, email from public.rinde_access
  union select actor_id, actor_label from public.events where app = 'rinde' and actor_kind = 'user'
), c as (
  select user_id, max(email) as correo from cuentas group by user_id
), ids as (   -- todos los navegadores (anon_id) que usó cada cuenta
  select distinct actor_id as user_id, anon_id from public.events where app = 'rinde' and actor_kind = 'user' and anon_id is not null
), ev as (
  select c.user_id, e.event_name, e.created_at, e.metadata
  from c join public.events e on e.app = 'rinde'
   and (e.actor_id = c.user_id or e.anon_id in (select anon_id from ids where ids.user_id = c.user_id))
)
select c.correo,
       (min(ev.created_at) at time zone 'America/Costa_Rica')::timestamp(0)                     as llego,
       (max(ev.created_at) at time zone 'America/Costa_Rica')::timestamp(0)                     as ultima_vez,
       count(*) filter (where ev.event_name = 'rinde_respuesta')                                as respuestas,
       count(*) filter (where ev.event_name = 'rinde_srv_plan_listo')                           as planes_hechos,
       a.free_frente                                                                            as frente_gratis,
       bool_or(ev.event_name = 'rinde_bloqueo_visto')                                           as vio_candado,
       bool_or(ev.event_name = 'rinde_precios_visto')                                           as vio_precios,
       bool_or(ev.event_name = 'rinde_srv_orden_creada')                                        as intento_pagar,
       coalesce(sum((ev.metadata->>'usd')::numeric) filter (where ev.event_name = 'rinde_srv_pago_confirmado'), 0) as pago_usd,
       (a.paid_until at time zone 'America/Costa_Rica')::date                                   as plan_hasta,
       count(*) filter (where ev.event_name = 'rinde_accion_hecha')                             as acciones_hechas,
       (array_agg(ev.event_name order by ev.created_at desc))[1]                                as ultimo_evento
from c
left join ev on ev.user_id = c.user_id
left join public.rinde_access a on a.user_id = c.user_id
group by c.correo, a.free_frente, a.paid_until
order by max(ev.created_at) desc nulls last;


-- 2) RECORRIDO COMPLETO DE UN CLIENTE (cambia el correo) — incluye lo que hizo antes de crear la cuenta ---
with u as (
  select distinct actor_id, anon_id from public.events
  where app = 'rinde' and actor_kind = 'user' and lower(actor_label) = lower('CORREO@DEL-CLIENTE.COM')
)
select (e.created_at at time zone 'America/Costa_Rica')::timestamp(0) as cuando,
       replace(e.event_name, 'rinde_', '')                           as que_hizo,
       e.metadata
from public.events e
where e.app = 'rinde'
  and (e.actor_id in (select actor_id from u) or e.anon_id in (select anon_id from u where anon_id is not null))
order by e.created_at;


-- 3) A QUIÉN CONTACTAR: cuentas que mostraron interés (pidieron plan, vieron el candado o los precios) y no han pagado
select max(e.actor_label)                                                                    as correo,
       (max(e.created_at) at time zone 'America/Costa_Rica')::timestamp(0)                   as ultima_vez,
       bool_or(e.event_name = 'rinde_srv_plan_listo')                                        as uso_plan_gratis,
       bool_or(e.event_name = 'rinde_bloqueo_visto')                                         as vio_candado,
       bool_or(e.event_name = 'rinde_precios_visto')                                         as vio_precios,
       bool_or(e.event_name = 'rinde_srv_orden_creada')                                      as abrio_paypal,
       bool_or(e.event_name = 'rinde_pago_cancelado')                                        as cancelo_paypal,
       string_agg(distinct e.metadata->>'frente', ', ') filter (where e.metadata ? 'frente') as frentes_que_vio
from public.events e
where e.app = 'rinde' and e.actor_kind = 'user' and e.created_at >= now() - interval '30 days'
group by e.actor_id
having bool_or(e.event_name in ('rinde_srv_plan_listo', 'rinde_bloqueo_visto', 'rinde_precios_visto', 'rinde_srv_orden_creada'))
   and not bool_or(e.event_name = 'rinde_srv_pago_confirmado')
order by max(e.created_at) desc;


-- 4) EMBUDO: cuántas personas llegan a cada paso (últimos 7 días) ------------------------------------------
with e as (
  select coalesce(anon_id, actor_id) as quien, actor_id, actor_kind, event_name, metadata
  from public.events where app = 'rinde' and created_at >= now() - interval '7 days'
), f as (
  select 1 as n, 'Visitó la página' as paso,             count(distinct quien) filter (where event_name in ('rinde_visita_nueva', 'rinde_visita_vuelta')) as personas from e
  union all select 2,  'Tocó «Empezar»',                 count(distinct quien) filter (where event_name = 'rinde_empezar') from e
  union all select 3,  'Terminó el paso 1 (negocio)',    count(distinct quien) filter (where event_name = 'rinde_paso_listo' and metadata->>'paso' = '1') from e
  union all select 4,  'Vio su diagnóstico',             count(distinct quien) filter (where event_name = 'rinde_diagnostico_listo') from e
  union all select 5,  'Respondió alguna pregunta',      count(distinct quien) filter (where event_name = 'rinde_respuesta') from e
  union all select 6,  'Pidió un plan',                  count(distinct quien) filter (where event_name = 'rinde_plan_click') from e
  union all select 7,  'Se le pidió crear cuenta',       count(distinct quien) filter (where event_name = 'rinde_cuenta_pedida') from e
  union all select 8,  'Entró con su cuenta',            count(distinct actor_id) filter (where event_name = 'rinde_srv_sesion') from e
  union all select 9,  'Recibió su plan gratis',         count(distinct actor_id) filter (where event_name = 'rinde_srv_plan_listo' and metadata->>'gratis' = 'true') from e
  union all select 10, 'Vio el candado',                 count(distinct quien) filter (where event_name = 'rinde_bloqueo_visto') from e
  union all select 11, 'Vio los precios',                count(distinct quien) filter (where event_name = 'rinde_precios_visto') from e
  union all select 12, 'Abrió PayPal',                   count(distinct actor_id) filter (where event_name = 'rinde_srv_orden_creada') from e
  union all select 13, 'PAGÓ',                           count(distinct actor_id) filter (where event_name = 'rinde_srv_pago_confirmado') from e
)
select paso, personas,
       round(100.0 * personas / nullif(first_value(personas) over (order by n), 0), 1) as pct_de_visitas,
       round(100.0 * personas / nullif(lag(personas) over (order by n), 0), 1)          as pct_del_paso_anterior
from f order by n;


-- 5) DÓNDE SE VAN: última pantalla y tiempo de quienes salieron sin crear cuenta (últimos 7 días) ------------
select coalesce(metadata->>'vista', '?') || coalesce(' · paso ' || (metadata->>'paso'), '') || coalesce(' · ' || nullif(metadata->>'tab', 'panel'), '') as donde,
       count(distinct anon_id)                                                    as personas,
       round(avg((metadata->>'seg')::numeric))                                    as segundos_promedio,
       round(avg((metadata->>'resp')::numeric), 1)                                as respuestas_promedio
from public.events
where app = 'rinde' and event_name = 'rinde_salida' and metadata->>'cuenta' = 'false' and created_at >= now() - interval '7 days'
group by 1 order by personas desc;


-- 6) VENTAS ------------------------------------------------------------------------------------------------
select (created_at at time zone 'America/Costa_Rica')::timestamp(0) as cuando, actor_label as correo,
       metadata->>'plan' as plan, (metadata->>'usd')::numeric as usd, metadata->>'pagador' as correo_paypal,
       (metadata->>'hasta')::timestamptz::date as acceso_hasta
from public.events
where app = 'rinde' and event_name = 'rinde_srv_pago_confirmado'
order by created_at desc;


-- 7) PROBLEMAS: errores de planes, pagos y de la página (últimos 7 días) ----------------------------------
select (created_at at time zone 'America/Costa_Rica')::timestamp(0) as cuando, coalesce(actor_label, anon_id) as quien,
       replace(event_name, 'rinde_', '') as que, metadata
from public.events
where app = 'rinde' and created_at >= now() - interval '7 days'
  and event_name in ('rinde_srv_plan_error', 'rinde_srv_pago_fallido', 'rinde_error_js', 'rinde_plan_error', 'rinde_pago_error')
order by created_at desc limit 100;


-- 8) POR CAMPAÑA Y ANUNCIO (los enlaces de los anuncios deben llevar ?utm_campaign=…&utm_content=…) --------
with origen as (
  select distinct on (anon_id) anon_id, coalesce(metadata->>'utm', '(sin campaña)') as campana, coalesce(metadata->>'ad', '-') as anuncio
  from public.events where app = 'rinde' and event_name in ('rinde_visita_nueva', 'rinde_visita_vuelta') and created_at >= now() - interval '14 days'
  order by anon_id, created_at
)
select o.campana, o.anuncio, count(distinct o.anon_id) as visitas,
       count(distinct e.anon_id) filter (where e.event_name = 'rinde_diagnostico_listo') as diagnosticos,
       count(distinct e.anon_id) filter (where e.event_name = 'rinde_cuenta_pedida')     as pidieron_plan,
       count(distinct e.anon_id) filter (where e.event_name = 'rinde_login_ok')          as crearon_cuenta,
       count(distinct e.anon_id) filter (where e.event_name = 'rinde_pago_ok')           as pagaron
from origen o left join public.events e on e.anon_id = o.anon_id and e.app = 'rinde'
group by 1, 2 order by visitas desc;


-- 9) RINDE: qué hace cada visitante (últimos 7 días). Una fila por persona, la más reciente arriba.
-- Para ver más días, cambia '7 days'. Las cuentas de administrador no aparecen.
with ev as (
  select coalesce(anon_id, actor_id::text) as quien, actor_label, event_name, metadata, created_at,
         replace(event_name, 'rinde_', '') as e
  from public.events
  where app = 'rinde' and created_at >= now() - interval '7 days'
    and event_name not like 'rinde_srv_%'   -- los del servidor repiten lo mismo sin el id del navegador
), pasos as (   -- recorrido sin repetir el mismo paso seguido (10 respuestas seguidas = «respuesta×10»)
  select quien, e, created_at, metadata,
         case when e = lag(e) over (partition by quien order by created_at) then 0 else 1 end as nuevo
  from ev
), grupos as (
  select quien, e, min(created_at) as t, count(*) as n,
         max(coalesce(metadata->>'frente', metadata->>'tab', metadata->>'paso')) as det
  from (select *, sum(nuevo) over (partition by quien order by created_at) as g from pasos) x
  group by quien, g, e
)
select
  (min(ev.created_at) at time zone 'America/Costa_Rica')::timestamp(0)                                  as llego,
  max(ev.actor_label)                                                                                   as correo,
  coalesce(max(ev.metadata->>'utm') filter (where ev.e like 'visita%'),
           case when bool_or((ev.metadata->>'fb')::boolean) filter (where ev.e like 'visita%') then 'facebook' end,
           max(split_part(split_part(ev.metadata->>'ref', '://', 2), '/', 1)) filter (where ev.e like 'visita%'),
           'directo')                                                                                   as origen,
  max(ev.metadata->>'negocio') filter (where ev.e = 'diagnostico_listo')                                as negocio,
  case max(ev.metadata->>'personas') filter (where ev.e = 'diagnostico_listo')
    when 'p1' then '1-5' when 'p2' then '6-20' when 'p3' then '21-50' when 'p4' then '51-200' when 'p5' then '201-1000' when 'p6' then '+1000' end as personas,
  case
    when bool_or(ev.e = 'pago_ok')            then '9 · PAGÓ'
    when bool_or(ev.e = 'pago_iniciado')      then '8 · abrió PayPal'
    when bool_or(ev.e = 'precios_visto')      then '7 · vio precios'
    when bool_or(ev.e = 'plan_ok')            then '6 · recibió un plan'
    when bool_or(ev.e = 'login_ok')           then '5 · creó cuenta / entró'
    when bool_or(ev.e = 'plan_click')         then '4 · pidió un plan'
    when bool_or(ev.e = 'respuesta')          then '3 · respondió preguntas'
    when bool_or(ev.e = 'diagnostico_listo')  then '2 · terminó el perfil'
    when bool_or(ev.e = 'empezar')            then '1 · tocó empezar'
    else '0 · solo miró la portada' end                                                                 as llego_hasta,
  count(*) filter (where ev.e = 'respuesta')                                                            as respuestas,
  count(*) filter (where ev.e = 'respuesta_libre')                                                      as resp_escritas,
  string_agg(distinct ev.metadata->>'frente', ', ') filter (where ev.e in ('respuesta', 'frente_abierto', 'plan_click')) as frentes,
  string_agg(distinct ev.metadata->>'tab', ', ') filter (where ev.e = 'pestana')                        as pestanas,
  bool_or(ev.e = 'cifras_guardadas')                                                                    as anoto_cifras,
  max((ev.metadata->>'seg')::int) filter (where ev.e = 'salida')                                        as segundos,
  (array_agg(coalesce(ev.metadata->>'vista', '') || coalesce(' · ' || nullif(ev.metadata->>'tab', 'panel'), '') || coalesce(' · paso ' || (ev.metadata->>'paso'), '')
     order by ev.created_at desc) filter (where ev.e = 'salida'))[1]                                     as salio_desde,
  count(*) filter (where ev.e in ('error_js', 'plan_error', 'pago_error'))                              as errores,
  (select string_agg(g.e || case when g.n > 1 then '×' || g.n else '' end || coalesce('(' || g.det || ')', ''), ' → ' order by g.t)
     from grupos g where g.quien = ev.quien)                                                            as recorrido
from ev
group by ev.quien
order by max(ev.created_at) desc
limit 200;
