-- «tu-cancion»: cómo la usan. Corre cada bloque por separado en Supabase → SQL Editor.
-- Cambia la fecha de 'desde' si quieres otro rango (hora de Costa Rica).

-- 1) EMBUDO: cuántas personas (únicas) llegaron a cada punto, de la entrada al envío.
with ev as (
  select anon_id, event_name, metadata, created_at
  from public.events
  where app = 'tu-cancion'
    and created_at >= (date '2026-10-30')::timestamp at time zone 'America/Costa_Rica'
    and coalesce(metadata->>'likelyBot','false') <> 'true'
), pasos(orden, etapa, evento) as (values
  (1,  'Abrió la página',               'landing_viewed'),
  (2,  'Tocó empezar',                  'cta_clicked'),
  (3,  'Escuchó el ejemplo del inicio', 'hero_play_clicked'),
  (4,  'Escuchó algún ejemplo',         'example_played'),
  (5,  'Eligió para qué es',            'reason_chosen'),
  (6,  'Eligió el ritmo',               'rhythm_chosen'),
  (7,  'Pidió generar la letra',        'lyrics_generating'),
  (8,  'Le salió la letra',             'lyrics_generated'),
  (9,  'Falló la generación',           'lyrics_failed'),
  (10, 'Llegó a revisar la letra',      'review_shown'),
  (11, 'Editó la letra',                'edit_saved'),
  (12, 'Regeneró la letra',             'regen_clicked'),
  (13, 'Tocó enviar (pide correo)',     'send_opened'),
  (14, 'Escribió un correo inválido',   'email_invalid'),
  (15, 'Vio la ventana "no pagas nada"','price_modal_shown'),
  (16, 'Se devolvió desde la ventana',  'price_modal_back'),
  (17, 'Confirmó y envió',              'request_confirmed'),
  (18, 'Falló el envío',                'request_failed')
)
select p.orden, p.etapa,
       count(distinct e.anon_id) as personas,
       count(e.*)                as veces
from pasos p left join ev e on e.event_name = p.evento
group by p.orden, p.etapa order by p.orden;

-- 2) HASTA DÓNDE LLEGÓ CADA PERSONA (el último paso del cuestionario que vio).
select anon_id,
       min(created_at at time zone 'America/Costa_Rica') as primera_vez_cr,
       max(created_at at time zone 'America/Costa_Rica') as ultima_vez_cr,
       count(*)                                          as acciones,
       (array_agg(metadata->>'step' order by created_at desc) filter (where event_name = 'step_viewed'))[1] as ultimo_paso,
       bool_or(event_name = 'lyrics_generated')  as vio_letra,
       bool_or(event_name = 'send_opened')       as llego_a_correo,
       bool_or(event_name = 'request_confirmed') as envio,
       max(metadata->>'country')                 as pais
from public.events
where app = 'tu-cancion'
  and created_at >= (date '2026-10-30')::timestamp at time zone 'America/Costa_Rica'
  and anon_id is not null
group by anon_id
having bool_or(coalesce(metadata->>'likelyBot','false') <> 'true' or event_name <> 'landing_viewed')
order by ultima_vez_cr desc;

-- 3) DÓNDE SE QUEDAN: cuántas personas vieron cada paso del cuestionario.
select metadata->>'step' as paso, count(distinct anon_id) as personas, min(created_at at time zone 'America/Costa_Rica') as desde
from public.events
where app = 'tu-cancion' and event_name = 'step_viewed'
  and created_at >= (date '2026-10-30')::timestamp at time zone 'America/Costa_Rica'
group by 1 order by personas desc;

-- 4) LO QUE YA ENVIARON (pedidos reales, con la letra). Los datos del cliente llegan a tu correo de Resend.
select creada_cr, status, country, price_text, reason, person_name, rhythm, via, title, email_sent
from public.tc_songs_friendly
where creada_cr >= timestamp '2026-10-30'
order by creada_cr desc;
