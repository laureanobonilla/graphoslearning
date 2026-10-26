-- SIGNIFICA: uso, qué buscan, embudo de pago por precio y problemas de cobro. Una sola consulta (hora de Costa Rica).
with e as (
  select coalesce(anon_id, actor_id) as quien, event_name as ev, metadata as m, created_at,
         (created_at at time zone 'America/Costa_Rica')::date as dia
  from public.events where app = 'significa'
),
p as (   -- una fila por persona (dispositivo)
  select quien, min(created_at) as primera, count(distinct dia) as dias,
    count(*) filter (where ev = 'significa_lookup' and m->>'understood' = 'true') as busq,
    bool_or(ev = 'significa_paywall_shown') as vio_cobro,
    bool_or(ev = 'significa_pay_click')     as clic_pago,
    bool_or(ev = 'significa_paid')          as pago
  from e group by quien
),
r as (
  -- 1) RESUMEN
  select 10 as o, '1 RESUMEN' as seccion, 'Personas que abrieron la app' as concepto, count(*)::text as valor, '' as detalle from p
  union all select 11, '1 RESUMEN', 'Personas que buscaron al menos 1 palabra', count(*)::text, round(100.0*count(*) filter (where busq>=1)/nullif(count(*),0))::text||'% de las que abrieron' from p where busq>=1
  union all select 12, '1 RESUMEN', 'Personas con 5 o más búsquedas', count(*)::text, '' from p where busq>=5
  union all select 13, '1 RESUMEN', 'Personas con 10 o más búsquedas', count(*)::text, '' from p where busq>=10
  union all select 14, '1 RESUMEN', 'Personas que llegaron al límite gratis (15)', count(*)::text, '' from p where busq>=15
  union all select 15, '1 RESUMEN', 'Personas que volvieron otro día', count(*)::text, round(100.0*count(*)/nullif((select count(*) from p where busq>=1),0))::text||'% de las que buscaron' from p where dias>=2 and busq>=1
  union all select 16, '1 RESUMEN', 'Búsquedas entendidas (total)', coalesce(sum(busq),0)::text, 'promedio '||coalesce(round(avg(busq) filter (where busq>=1),1)::text,'0')||' por persona activa' from p
  union all select 17, '1 RESUMEN', 'Personas que vieron el cobro', count(*)::text, '' from p where vio_cobro
  union all select 18, '1 RESUMEN', 'Personas que tocaron PayPal', count(*)::text, '' from p where clic_pago
  union all select 19, '1 RESUMEN', 'Personas que pagaron', count(*)::text, '' from p where pago

  -- 2) POR DÍA
  union all select 20, '2 POR DÍA', dia::text, count(distinct quien) filter (where ev='opened')::text||' abrieron',
     count(*) filter (where ev='significa_lookup' and m->>'understood'='true')||' búsquedas · '||count(distinct quien) filter (where ev='significa_lookup')||' personas buscaron · '||count(*) filter (where ev='significa_paid')||' pagos' from e group by dia

  -- 3) CÓMO LA USAN
  union all select 30, '3 USO', 'Búsquedas por voz', count(*)::text, '' from e where ev='significa_lookup' and m->>'via'='voz'
  union all select 31, '3 USO', 'Búsquedas escritas', count(*)::text, '' from e where ev='significa_lookup' and m->>'via'='texto'
  union all select 32, '3 USO', 'No se entendió la palabra', count(*)::text, round(100.0*count(*)/nullif((select count(*) from e where ev='significa_lookup'),0))::text||'% de las búsquedas' from e where ev='significa_lookup' and m->>'understood'='false'
  union all select 33, '3 USO', 'Veces que tocaron el micrófono sin que se escuchara voz', count(*)::text, '' from e where ev='no_speech'
  union all select 34, '3 USO', 'Error de micrófono (permiso o falta de micrófono)', count(*)::text, coalesce(string_agg(distinct m->>'name', ', '),'') from e where ev='mic_error'
  union all select 35, '3 USO', 'Errores al buscar', count(*)::text, coalesce(string_agg(distinct m->>'reason', ' | '),'') from e where ev='lookup_error'
  union all select 36, '3 USO', 'Tiempo de respuesta típico (mediana, ms)', coalesce(round(percentile_cont(.5) within group (order by (m->>'ms')::int))::text,'-'), 'el 90% responde en '||coalesce(round(percentile_cont(.9) within group (order by (m->>'ms')::int))::text,'-')||' ms' from e where ev='significa_lookup' and m->>'ms' is not null
  union all select 37, '3 USO', 'Pidieron "otro significado"', count(*)::text, '' from e where ev='alt_clicked'
  union all select 38, '3 USO', 'Tocaron "Detener"', count(*)::text, '' from e where ev='stopped'
  union all select 39, '3 USO', 'Abrieron la opción de escribir', count(*)::text, '' from e where ev='type_opened'
  union all select 40, '3 USO', 'País: '||coalesce(m->>'country','?'), count(distinct quien)::text||' personas', '' from e where ev='opened' group by m->>'country'

  -- 4) QUÉ BUSCAN
  union all select 50, '4 IDIOMAS', coalesce(m->>'lang','?'), count(*)::text, round(100.0*count(*)/nullif(sum(count(*)) over (),0))::text||'%' from e where ev='significa_lookup' and m->>'understood'='true' group by m->>'lang'
  union all (select 60, '5 PALABRAS MÁS BUSCADAS', lower(m->>'word'), count(*)::text, count(distinct quien)::text||' personas' from e where ev='significa_lookup' and m->>'understood'='true' and m->>'word' <> '' group by lower(m->>'word') order by count(*) desc, 3 limit 40)
  union all (select 70, '6 PALABRAS CON VARIOS SIGNIFICADOS (las que piden más "otro significado")', lower(m->>'word'), count(*)::text, 'otros significados encontrados: '||coalesce(max((m->>'n')::int),0) from e where ev='significa_alts' and m->>'word' <> '' group by lower(m->>'word') order by count(*) desc limit 15)

  -- 7) EMBUDO DEL COBRO POR PRECIO
  union all select 80, '7 COBRO POR PRECIO', 'US$'||(m->>'price'), count(distinct quien) filter (where ev='significa_paywall_shown')::text||' vieron el cobro',
     count(distinct quien) filter (where ev='significa_pay_click')||' tocaron PayPal · '||count(distinct quien) filter (where ev='significa_paid')||' pagaron'
     from e where ev in ('significa_paywall_shown','significa_pay_click','significa_paid') group by m->>'price'
  union all select 81, '7 COBRO POR PRECIO', 'Ingresos totales (US$)', coalesce(sum((m->>'amount')::numeric),0)::text, count(*)||' pagos' from e where ev='significa_paid'

  -- 8) PROBLEMAS AL PAGAR (todo lo que aparezca aquí merece revisarse)
  union all select 90, '8 PROBLEMAS DE PAGO', 'Llegaron al límite y NUNCA vieron el cobro (¿se bloqueó mal?)', count(*)::text, 'debería ser 0' from p where busq>=15 and not vio_cobro
  union all select 91, '8 PROBLEMAS DE PAGO', 'Personas a las que no cargó PayPal', count(distinct quien)::text, 'comparar con las que vieron el cobro: '||(select count(*) from p where vio_cobro) from e where ev='paypal_load_failed'
  union all select 92, '8 PROBLEMAS DE PAGO', 'Tocaron PayPal y NO pagaron', count(*)::text, 'abandono o fallo; con cancelación explícita: '||(select count(distinct quien) from e where ev='paypal_cancelled') from p where clic_pago and not pago
  union all select 93, '8 PROBLEMAS DE PAGO', 'Error del botón de PayPal', count(*)::text, coalesce(string_agg(distinct m->>'reason',' | '),'') from e where ev='paypal_error'
  union all select 94, '8 PROBLEMAS DE PAGO', 'No cargó el SDK de PayPal', count(*)::text, '' from e where ev='paypal_load_failed'
  union all select 95, '8 PROBLEMAS DE PAGO', 'Falló la confirmación del pago (¡revisar si hubo cargo!)', count(*)::text, coalesce(string_agg(distinct (m->>'status')||': '||(m->>'error'),' | '),'') from e where ev='pay_capture_failed'
  union all select 96, '8 PROBLEMAS DE PAGO', 'Error en el servidor al pagar: '||coalesce(m->>'stage','?'), count(*)::text, coalesce(string_agg(distinct m->>'message',' | '),'') from e where ev='significa_pay_error' group by m->>'stage'
  union all select 97, '8 PROBLEMAS DE PAGO', 'Pagos de personas distintas con el mismo correo de PayPal (posibles repetidos)', count(*)::text, '' from (select m->>'payerEmail' from e where ev='significa_paid' and m->>'payerEmail' is not null group by 1 having count(distinct quien)>1) z
)
select seccion, concepto, valor, detalle from r order by o, (case when o = 20 then 0 else coalesce(substring(valor from '^\d+')::int, 0) end) desc, concepto desc;
