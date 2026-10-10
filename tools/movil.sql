-- =====================================================================================================
-- Graphikosmos MÓVIL (/m/): informe de uso. Supabase → SQL Editor: selecciona UNA consulta y Run.
-- No necesita SQL previo: los eventos van a public.events con app = 'graphikosmos-mobile'.
-- Cambia  interval '7 days'  al periodo que quieras. Los eventos de cuentas administradoras no se guardan.
-- Con pocas personas (menos de ~30) son anécdotas, no estadística.
-- =====================================================================================================

-- 1) EMBUDO (personas distintas = navegadores distintos) -----------------------------------------------
select
  count(distinct anon_id) filter (where event_name='m_home_viewed')                          as entraron,
  count(distinct anon_id) filter (where event_name='m_generate_clicked')                     as intentaron_generar,
  count(distinct anon_id) filter (where event_name='m_map_ok')                               as vieron_su_mapa,
  count(distinct anon_id) filter (where event_name='m_node_tapped')                          as tocaron_un_nodo,
  count(distinct anon_id) filter (where event_name='m_expand_ok')                            as ampliaron_un_nodo,
  count(distinct anon_id) filter (where event_name='m_defs_opened')                          as abrieron_definiciones,
  count(distinct anon_id) filter (where event_name='m_defs_section')                         as abrieron_sencillo_o_ejemplo,
  count(distinct anon_id) filter (where event_name='m_capture')                              as capturaron,
  count(distinct anon_id) filter (where event_name='m_login_success')                        as iniciaron_sesion,
  count(distinct anon_id) filter (where event_name='m_paywall_shown')                        as vieron_limite,
  count(distinct anon_id) filter (where event_name='m_contact_sent')                         as dejaron_correo
from public.events where app='graphikosmos-mobile' and created_at > now() - interval '7 days';

-- 2) DE DÓNDE LLEGAN (ref=aprende viene de /aprender/; utm_* de los anuncios) --------------------------
select coalesce(metadata->>'ref','(directo)') as ref, coalesce(metadata->>'utm_source','-') as utm_source, coalesce(metadata->>'utm_campaign','-') as utm_campaign,
       count(distinct anon_id) as personas
from public.events where app='graphikosmos-mobile' and event_name='m_home_viewed' and created_at > now() - interval '7 days'
group by 1,2,3 order by 4 desc;

-- 3) QUÉ TEMAS ESCRIBEN ----------------------------------------------------------------------------------
select created_at, actor_label as quien, metadata->>'topicPreview' as tema
from public.events where app='graphikosmos-mobile' and event_name='m_generate_clicked' and created_at > now() - interval '7 days'
order by created_at desc limit 200;

-- 4) CUÁNTAS VECES GENERAN / AMPLÍAN POR PERSONA y cuánto tarda la IA -----------------------------------
select actor_label as quien,
       count(*) filter (where event_name='m_map_ok' and (metadata->>'depth')::int = 0) as mapas_nuevos,
       count(*) filter (where event_name='m_expand_ok')                                 as ampliaciones,
       count(*) filter (where event_name='m_defs_opened')                               as veces_definiciones,
       count(*) filter (where event_name='m_map_error' or event_name='m_defs_error')    as errores,
       round(avg((metadata->>'ms')::numeric) filter (where event_name in ('m_map_ok','m_expand_ok')) / 1000, 1) as seg_promedio_ia
from public.events where app='graphikosmos-mobile' and created_at > now() - interval '7 days'
group by 1 order by 2 desc, 3 desc;

-- 5) QUÉ SE EXPANDE: profundidad máxima alcanzada por persona --------------------------------------------
select actor_label as quien, max((metadata->>'depth')::int) as profundidad_maxima
from public.events where app='graphikosmos-mobile' and event_name in ('m_map_ok','m_expand_ok') and created_at > now() - interval '7 days'
group by 1 order by 2 desc;

-- 6) USO DE "VER DEFINICIONES": qué secciones abren ---------------------------------------------------------
select metadata->>'section' as seccion, count(*) filter (where (metadata->>'open')::boolean) as aperturas, count(distinct anon_id) as personas
from public.events where app='graphikosmos-mobile' and event_name='m_defs_section' and created_at > now() - interval '7 days'
group by 1 order by 2 desc;

-- 7) LÍMITE Y CONTACTO: quién se quedó sin nodos y quién dejó su correo --------------------------------------
select created_at, actor_label as quien, event_name, metadata->>'reason' as motivo, metadata->>'where' as donde
from public.events where app='graphikosmos-mobile' and event_name in ('m_paywall_shown','m_contact_sent','m_contact_whatsapp','m_login_success') and created_at > now() - interval '7 days'
order by created_at desc limit 200;

-- 8) ERRORES (para ver si algo falla en teléfonos) --------------------------------------------------------------
select created_at, actor_label as quien, event_name, metadata->>'kind' as tipo, metadata->>'where' as donde
from public.events where app='graphikosmos-mobile' and event_name in ('m_map_error','m_defs_error') and created_at > now() - interval '7 days'
order by created_at desc limit 100;

-- 9) RECORRIDO COMPLETO de una persona (cambia el nombre, p. ej. 'Cometa-482' o su correo) ----------------------
select created_at, event_name, metadata - 'lang' as detalle
from public.events where app='graphikosmos-mobile' and actor_label = 'Cometa-482'
order by created_at;

-- 10) ACTIVIDAD POR DÍA -----------------------------------------------------------------------------------------
select created_at::date as dia, count(distinct anon_id) as personas, count(*) filter (where event_name='m_map_ok') as mapas, count(*) filter (where event_name='m_expand_ok') as ampliaciones
from public.events where app='graphikosmos-mobile' and created_at > now() - interval '30 days'
group by 1 order by 1 desc;
