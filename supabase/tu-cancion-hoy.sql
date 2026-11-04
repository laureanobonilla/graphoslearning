-- «tu-cancion» desde el 4 nov 2026 a las 11:45 (hora de Costa Rica). Corre cada bloque por separado en Supabase → SQL Editor.
-- Para otra hora, cambia la fecha en las 3 consultas:  timestamp '2026-11-04 11:45'

-- 1) EMBUDO (personas únicas por paso, con los pasos del pago nuevo)
with ev as (
  select coalesce(anon_id, actor_id) as quien, event_name, metadata, created_at
  from public.events
  where app = 'tu-cancion'
    and created_at >= timestamp '2026-11-04 11:45' at time zone 'America/Costa_Rica'
    and coalesce(metadata->>'likelyBot','false') <> 'true'
), pasos(orden, etapa, evento) as (values
  (1,  'Abrió la página',                  'landing_viewed'),
  (2,  'Tocó empezar',                     'cta_clicked'),
  (3,  'Escuchó algún ejemplo',            'example_played'),
  (4,  'Eligió para qué es',               'reason_chosen'),
  (5,  'Eligió el ritmo',                  'rhythm_chosen'),
  (6,  'Pidió generar la letra',           'lyrics_generating'),
  (7,  'Le salió la letra',                'lyrics_generated'),
  (8,  'Falló la generación',              'lyrics_failed'),
  (9,  'Llegó a revisar la letra',         'review_shown'),
  (10, 'Tocó enviar (pide correo)',        'send_opened'),
  (11, 'Escribió un correo inválido',      'email_invalid'),
  (12, 'Vio la ventana de pago',           'price_modal_shown'),
  (13, 'Se devolvió desde el pago',        'price_modal_back'),
  (14, 'Tocó pagar (se creó la orden)',    'pay_started'),
  (15, 'Canceló en PayPal',                'pay_cancelled'),
  (16, 'Error en el pago',                 'pay_error'),
  (17, 'PAGÓ (confirmado en pantalla)',    'pay_confirmed'),
  (18, 'Cobrado pero falló confirmar',     'pay_capture_failed')
)
select p.orden, p.etapa, count(distinct e.quien) as personas, count(e.*) as veces
from pasos p left join ev e on e.event_name = p.evento
group by p.orden, p.etapa order by p.orden;

-- 2) PAGOS REALES (lo que cobró PayPal). El correo del cliente está aquí y en tu correo de Resend.
select created_at at time zone 'America/Costa_Rica' as hora_cr,
       metadata->>'amount' as monto, metadata->>'currency' as moneda,
       metadata->>'email' as correo_cliente, metadata->>'payer' as pagador_paypal,
       nullif(metadata->>'flag','') as aviso, metadata->>'orderID' as orden
from public.events
where app = 'tu-cancion' and event_name = 'tc_paid'
  and created_at >= timestamp '2026-11-04 11:45' at time zone 'America/Costa_Rica'
order by created_at desc;
-- Si alguna fila de aquí NO tiene su correo "PAGADA" en tu bandeja, busca en:  select * from public.events where event_name = 'tc_paid_email_failed' order by created_at desc;

-- 3) CADA PERSONA: hasta dónde llegó
select coalesce(anon_id, actor_id)                                   as quien,
       min(created_at at time zone 'America/Costa_Rica')             as primera_vez_cr,
       max(created_at at time zone 'America/Costa_Rica')             as ultima_vez_cr,
       max(metadata->>'country')                                     as pais,
       bool_or(event_name = 'lyrics_generated')                      as vio_letra,
       bool_or(event_name = 'send_opened')                           as llego_a_correo,
       bool_or(event_name = 'price_modal_shown')                     as vio_pago,
       bool_or(event_name = 'pay_started')                           as toco_pagar,
       bool_or(event_name in ('pay_confirmed','tc_paid'))            as pago
from public.events
where app = 'tu-cancion' and created_at >= timestamp '2026-11-04 11:45' at time zone 'America/Costa_Rica'
  and anon_id is not null
group by coalesce(anon_id, actor_id)
order by ultima_vez_cr desc;
