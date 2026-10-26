-- SIGNIFICA: resultados del anuncio NUEVO. Cuenta solo visitas desde las 3:55 pm de hoy (hora de Costa Rica).
-- Si el anuncio nuevo sale más tarde, cambia la hora de la línea "created_at >=" para que no entren visitas del anuncio anterior.
with e as (
  select coalesce(anon_id, actor_id) as quien, event_name as ev, metadata as m, created_at
  from public.events where app = 'significa' and created_at >= timestamptz '2026-10-26 15:55:00-06'
),
o as (   -- una fila por persona: de dónde llegó (su primera apertura)
  select distinct on (quien) quien, created_at as t_abrio,
    coalesce(nullif(m->>'term',''), nullif(m->>'campaign',''), case when m->>'fbclid'='1' then 'facebook (sin ubicación en el enlace)' end, case when m->>'gclid'='1' then 'google' end, 'directo / otro') as origen,
    case when m->>'inapp' <> '' then 'navegador de '||(m->>'inapp') else 'navegador normal' end as navegador,
    coalesce(m->>'os','?') as sistema, coalesce(m->>'country','?') as pais
  from e where ev = 'opened' order by quien, created_at
),
a as (   -- qué hizo cada persona
  select quien,
    bool_or(ev='record_start') as toco_mic,
    bool_or(ev='mic_error')    as nego_mic,
    bool_or(ev='typed_lookup') as escribio,
    count(*) filter (where ev='significa_lookup' and m->>'understood'='true') as busquedas,
    min(created_at) filter (where ev='significa_lookup') as t_busco,
    bool_or(ev='significa_paywall_shown') as vio_cobro,
    bool_or(ev='significa_paid') as pago
  from e group by quien
),
b as (select o.*, coalesce(a.toco_mic,false) as toco_mic, coalesce(a.nego_mic,false) as nego_mic, coalesce(a.escribio,false) as escribio,
             coalesce(a.busquedas,0) as busquedas, a.t_busco, coalesce(a.vio_cobro,false) as vio_cobro, coalesce(a.pago,false) as pago
      from o left join a using (quien))
select vista, grupo, count(*) as visitas,
  count(*) filter (where toco_mic or escribio) as "tocaron el círculo o escribieron",
  count(*) filter (where busquedas>=1) as "buscaron 1 o más",
  count(*) filter (where busquedas>=3) as "buscaron 3 o más",
  count(*) filter (where busquedas>=10) as "buscaron 10 o más",
  count(*) filter (where nego_mic) as "negaron el micrófono",
  count(*) filter (where vio_cobro) as "vieron el cobro",
  count(*) filter (where pago) as "pagaron",
  round(100.0*count(*) filter (where busquedas>=1)/count(*),1) as "% que probó",
  round(percentile_cont(.5) within group (order by extract(epoch from (t_busco - t_abrio))) filter (where t_busco is not null))::text as "seg. hasta su primera búsqueda (mediana)"
from (
  select '1 TOTAL' as vista, 'todas las visitas' as grupo, b.* from b
  union all select '2 POR ANUNCIO / UBICACIÓN', origen, b.* from b
  union all select '3 POR NAVEGADOR', navegador, b.* from b
  union all select '4 POR SISTEMA', sistema, b.* from b
  union all select '5 POR PAÍS', pais, b.* from b
) x
group by vista, grupo
order by vista, count(*) desc;
