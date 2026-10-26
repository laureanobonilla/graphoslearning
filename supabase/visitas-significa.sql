-- SIGNIFICA: lista cada visita desde las 3:55 pm de hoy (hora de Costa Rica) con la hora y todos los parámetros del enlace,
-- para saber de qué anuncio vino (y si es del viejo). Cambia la hora si quieres otra.
select (created_at at time zone 'America/Costa_Rica') as hora_cr,
       metadata->>'source'   as utm_source,
       metadata->>'medium'   as utm_medium,
       metadata->>'campaign' as utm_campaign,
       metadata->>'content'  as utm_content,
       metadata->>'term'     as utm_term,
       metadata->>'fbclid'   as trae_fbclid,
       metadata->>'inapp'    as navegador_de,
       metadata->>'os'       as sistema,
       metadata->>'country'  as pais,
       metadata->>'w'        as ancho_pantalla,
       left(anon_id, 6)      as persona
from public.events
where app = 'significa' and event_name = 'opened' and created_at >= timestamptz '2026-10-26 15:55:00-06'
order by created_at desc;
