-- te-engana: una fila por persona (aid), sin bots y sin tus visitas. p1..p27 = opcion elegida (contando desde 1).
-- Cambia la hora de corte si quieres mirar desde otro momento.
select
  left(aid, 6) as persona,
  pais,
  min(creado) at time zone 'America/Costa_Rica' as llego_cr,
  max(creado) at time zone 'America/Costa_Rica' as ultima_actividad_cr,
  round(extract(epoch from (max(creado) - min(creado))) / 60.0, 1) as minutos,
  coalesce(max(n) filter (where evento = 'pregunta'), 0) as hasta_la_pregunta,
  bool_or(evento = 'completo') as termino,
  bool_or(evento = 'gancho') as vio_el_gancho,
  bool_or(evento = 'sinpe_subir') as toco_subir_sinpe,
  bool_or(evento = 'sinpe_error') as fallo_al_subir,
  bool_or(evento = 'pago_inicio') as toco_paypal,
  bool_or(evento = 'sinpe_ok') as pago_sinpe,
  bool_or(evento = 'pago_ok') as pago,
  bool_or(evento = 'informe_visto') as vio_el_informe,
  max(n) filter (where evento = 'informe_scroll') as scroll_pct,
  bool_or(evento = 'salida') as cerro_la_pagina,
  max(r + 1) filter (where evento = 'pregunta' and n = 1) as p1,
  max(r + 1) filter (where evento = 'pregunta' and n = 2) as p2,
  max(r + 1) filter (where evento = 'pregunta' and n = 3) as p3,
  max(r + 1) filter (where evento = 'pregunta' and n = 4) as p4,
  max(r + 1) filter (where evento = 'pregunta' and n = 5) as p5,
  max(r + 1) filter (where evento = 'pregunta' and n = 6) as p6,
  max(r + 1) filter (where evento = 'pregunta' and n = 7) as p7,
  max(r + 1) filter (where evento = 'pregunta' and n = 8) as p8,
  max(r + 1) filter (where evento = 'pregunta' and n = 9) as p9,
  max(r + 1) filter (where evento = 'pregunta' and n = 10) as p10,
  max(r + 1) filter (where evento = 'pregunta' and n = 11) as p11,
  max(r + 1) filter (where evento = 'pregunta' and n = 12) as p12,
  max(r + 1) filter (where evento = 'pregunta' and n = 13) as p13,
  max(r + 1) filter (where evento = 'pregunta' and n = 14) as p14,
  max(r + 1) filter (where evento = 'pregunta' and n = 15) as p15,
  max(r + 1) filter (where evento = 'pregunta' and n = 16) as p16,
  max(r + 1) filter (where evento = 'pregunta' and n = 17) as p17,
  max(r + 1) filter (where evento = 'pregunta' and n = 18) as p18,
  max(r + 1) filter (where evento = 'pregunta' and n = 19) as p19,
  max(r + 1) filter (where evento = 'pregunta' and n = 20) as p20,
  max(r + 1) filter (where evento = 'pregunta' and n = 21) as p21,
  max(r + 1) filter (where evento = 'pregunta' and n = 22) as p22,
  max(r + 1) filter (where evento = 'pregunta' and n = 23) as p23,
  max(r + 1) filter (where evento = 'pregunta' and n = 24) as p24,
  max(r + 1) filter (where evento = 'pregunta' and n = 25) as p25,
  max(r + 1) filter (where evento = 'pregunta' and n = 26) as p26,
  max(r + 1) filter (where evento = 'pregunta' and n = 27) as p27
from vuelta_eventos
where creado >= timestamptz '2026-11-27 10:53:00-06'
  and bot = false
  and yo  = false
  and aid is not null
group by aid, pais
having max(n) filter (where evento = 'pregunta') > 0
order by llego_cr desc;
