-- GRAPHIKOSMOS: ¿se usa el rizoma? (últimos 14 días). Supabase → SQL Editor → Run.
-- Una fila por acción: cuántas personas (navegadores) la hicieron y qué porcentaje de quienes vieron el rizoma.
-- Si casi nadie pasa de «vio el rizoma», conviene dejarlo plegado por defecto y dar más espacio al mapa.
with e as (
  select coalesce(anon_id, actor_id::text) as quien, event_name, metadata
  from public.events
  where created_at >= now() - interval '14 days'
    and event_name in ('rhizome_view', 'rhizome_pick', 'rhizome_toggle', 'rhizome_color', 'rhizome_guide_click', 'rhizome_route_start', 'rhizome_route_step',
                       'rhizome_route_done', 'rhizome_route_close', 'rhizome_practice', 'lectura_toggle', 'lectura_brecha', 'lectura_brecha_ia',
                       'lectura_puente_agregado', 'lectura_practicar', 'lectura_md', 'defs_kc_ready', 'defs_kc_open', 'defs_kc_inline')
), base as (select count(distinct quien) as n from e where event_name = 'rhizome_view')
select case event_name
         when 'rhizome_view' then '01 Vio el rizoma'
         when 'rhizome_pick' then '02 Tocó un concepto del rizoma'
         when 'rhizome_guide_click' then '03 Usó la frase guía'
         when 'rhizome_route_start' then '04 Empezó la ruta de estudio'
         when 'rhizome_route_step' then '05 Avanzó en la ruta'
         when 'rhizome_route_done' then '06 Terminó la ruta'
         when 'rhizome_practice' then '07 Fue a practicar desde el rizoma'
         when 'lectura_brecha_ia' then '08 Pidió explicar una brecha (1 nodo)'
         when 'lectura_puente_agregado' then '09 Agregó un puente al mapa'
         when 'lectura_toggle' then '10 Abrió/cerró la lectura'
         when 'rhizome_toggle' then '11 Plegó/desplegó el rizoma'
         when 'defs_kc_open' then '12 Abrió un concepto clave'
         when 'defs_kc_inline' then '13 Tocó un concepto subrayado'
         else '99 ' || event_name end                                         as accion,
       count(distinct quien)                                                    as personas,
       count(*)                                                                 as veces,
       round(100.0 * count(distinct quien) / nullif((select n from base), 0), 1) as pct_de_quienes_lo_vieron
from e group by event_name order by 1;
