-- =====================================================================================================
-- ANUNCIOS: qué pasa con cada campaña / localidad / anuncio.  Supabase → SQL Editor.
-- IMPORTANTE: el editor solo muestra el resultado de la ÚLTIMA consulta. Selecciona UNA consulta (de "-- N)" hasta su ";") y dale Run.
--
-- Qué cambiar:
--   · la app:      'couple-song' (inglés/EE. UU.) · 'pareja-cancion' · 'cumple-cancion'   (está en cada consulta, en "app = ...")
--   · el periodo:  interval '3 days'
--
-- Para que haya campaña y localidad, los enlaces de los anuncios llevan parámetros (uno por campaña/anuncio):
--   https://TUSITIO.netlify.app/couple-song/?utm_campaign=tx&utm_content=v1
--   https://TUSITIO.netlify.app/couple-song/?utm_campaign=fl&utm_content=v1
--   https://TUSITIO.netlify.app/couple-song/?utm_campaign=ne&utm_content=v2     (utm_campaign = grupo/localidad, utm_content = anuncio)
-- La región (estado) y la ciudad las pone el servidor a partir de la IP; no se guarda la IP.
-- Solo las visitas posteriores a subir esta versión traen campaña/región.
-- =====================================================================================================


-- 1) EMBUDO POR CAMPAÑA Y ANUNCIO (personas distintas, sin bots) --------------------------------------
select coalesce(nullif(metadata->>'campaign',''), '(sin campaña)') as campana,
       coalesce(nullif(metadata->>'ad',''), '-')                  as anuncio,
       count(distinct anon_id) filter (where event_name = 'landing_viewed' and coalesce(metadata->>'likelyBot','false') <> 'true') as visitas,
       count(distinct anon_id) filter (where event_name = 'quiz_started')            as empezaron,
       count(distinct anon_id) filter (where event_name = 'name_entered')            as pusieron_nombre,
       count(distinct anon_id) filter (where event_name = 'quiz_submitted')          as terminaron,
       count(distinct anon_id) filter (where event_name = 'song_cta_clicked')        as abrieron_oferta,
       count(distinct anon_id) filter (where event_name = 'song_request_confirmed')  as pidieron_con_contacto
from public.events
where app = 'couple-song'
  and created_at >= now() - interval '3 days'
group by 1, 2
order by visitas desc;


-- 2) LO MISMO POR ESTADO / CIUDAD (para comparar localidades) ------------------------------------------
select coalesce(metadata->>'country','?') as pais,
       coalesce(metadata->>'region','?')  as estado,
       coalesce(metadata->>'city','?')    as ciudad,
       count(distinct anon_id) filter (where event_name = 'landing_viewed' and coalesce(metadata->>'likelyBot','false') <> 'true') as visitas,
       count(distinct anon_id) filter (where event_name = 'quiz_started')           as empezaron,
       count(distinct anon_id) filter (where event_name = 'quiz_submitted')         as terminaron,
       count(distinct anon_id) filter (where event_name = 'song_request_confirmed') as pidieron
from public.events
where app = 'couple-song'
  and created_at >= now() - interval '3 days'
group by 1, 2, 3
order by visitas desc
limit 40;


-- 3) COSTO POR RESULTADO: escribe lo que gastaste en cada campaña (USD) en la lista VALUES -------------
with gasto(campana, usd) as (
  values ('tx', 15.00), ('fl', 15.00), ('ne', 15.00)          -- <-- EDITA: campaña, dólares gastados
),
f as (
  select metadata->>'campaign' as campana,
         count(distinct anon_id) filter (where event_name = 'landing_viewed' and coalesce(metadata->>'likelyBot','false') <> 'true') as visitas,
         count(distinct anon_id) filter (where event_name = 'quiz_submitted')         as terminaron,
         count(distinct anon_id) filter (where event_name = 'song_request_confirmed') as pedidos
  from public.events
  where app = 'couple-song' and created_at >= now() - interval '7 days'
  group by 1
)
select g.campana, g.usd as gastado,
       f.visitas, f.terminaron, f.pedidos,
       round(g.usd / nullif(f.visitas, 0), 2)    as costo_por_visita,
       round(g.usd / nullif(f.terminaron, 0), 2) as costo_por_cuestionario,
       round(g.usd / nullif(f.pedidos, 0), 2)    as costo_por_pedido
from gasto g left join f using (campana)
order by g.campana;


-- 4) VENTAS POR CAMPAÑA (une song_paid con el pedido original por el código de la canción) --------------
-- Requiere haber registrado la venta con:  select public.log_event('<CODIGO>','anon',null,'song_paid',
--   '{"amount_usd":49,"method":"paypal","country":"US","kind":"couple","source":"manual"}'::jsonb,null,'couple-song');
select coalesce(c.metadata->>'campaign','(sin campaña)') as campana,
       coalesce(c.metadata->>'ad','-')                    as anuncio,
       count(*)                                           as ventas,
       sum(coalesce((p.metadata->>'amount_usd')::numeric, 0)) as usd,
       sum(coalesce((p.metadata->>'amount_crc')::numeric, 0)) as crc
from public.events p
join public.events c on c.event_name = 'song_request_confirmed' and c.metadata->>'songId' = p.actor_id
where p.event_name = 'song_paid' and p.app = 'couple-song'
group by 1, 2
order by ventas desc;


-- 5) TRÁFICO HORA POR HORA (para ver si el presupuesto se agotó o el anuncio dejó de entregar) --------------
select date_trunc('hour', created_at at time zone 'America/Costa_Rica') as hora_cr,
       count(distinct anon_id) filter (where event_name = 'landing_viewed' and coalesce(metadata->>'likelyBot','false') <> 'true') as visitas,
       count(distinct anon_id) filter (where event_name = 'quiz_started')           as empezaron,
       count(distinct anon_id) filter (where event_name = 'song_request_confirmed') as pedidos
from public.events
where app = 'couple-song' and created_at >= now() - interval '3 days'
group by 1
order by 1 desc;


-- 6) DÓNDE ABANDONAN EL CUESTIONARIO (personas que respondieron cada pregunta) ---------------------------
select (metadata->>'questionIndex')::int as pregunta,
       count(distinct anon_id)          as personas,
       round(avg((metadata->>'seconds')::numeric), 1) as segundos_promedio,
       count(*) filter (where (metadata->>'usedNone')::boolean) as dijeron_ninguna
from public.events
where app = 'couple-song' and event_name = 'question_answered' and created_at >= now() - interval '3 days'
group by 1
order by 1;


-- 7) TODOS LOS PEDIDOS RECIENTES (qué estilo, por dónde llegó, de qué campaña) --------------------------
select c.created_at at time zone 'America/Costa_Rica' as hora_cr,
       c.metadata->>'campaign' as campana, c.metadata->>'ad' as anuncio,
       c.metadata->>'region' as estado, c.metadata->>'city' as ciudad,
       c.metadata->>'style' as estilo, left(c.metadata->>'songId', 8) as codigo
from public.events c
where c.app = 'couple-song' and c.event_name = 'song_request_confirmed' and c.created_at >= now() - interval '14 days'
order by c.created_at desc;


-- 8) (apps en español) CLICS EN WHATSAPP vs PEDIDOS CON NÚMERO -----------------------------------------------
select app,
       count(distinct anon_id) filter (where event_name = 'song_whatsapp_clicked')  as clics_whatsapp,
       count(distinct anon_id) filter (where event_name = 'song_request_confirmed') as pedidos_con_numero,
       count(*)                filter (where event_name = 'song_paid')              as ventas
from public.events
where app in ('pareja-cancion', 'cumple-cancion') and created_at >= now() - interval '7 days'
group by 1;
