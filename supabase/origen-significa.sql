-- SIGNIFICA: de dónde vienen las visitas y cuáles de verdad prueban la app (por ubicación del anuncio, dispositivo y navegador).
-- Solo cuenta visitas desde las 3:00 pm de hoy (hora de Costa Rica), cuando empieza a registrarse el origen.
with e as (
  select coalesce(anon_id, actor_id) as quien, event_name as ev, metadata as m
  from public.events where app = 'significa' and created_at >= timestamptz '2026-10-26 15:00:00-06'
),
o as (   -- una fila por persona con su origen (de su primera apertura)
  select distinct on (quien) quien,
    coalesce(nullif(m->>'term',''), nullif(m->>'campaign',''), case when m->>'fbclid'='1' then 'facebook (sin ubicación)' end, case when m->>'gclid'='1' then 'google' end, 'directo / otro') as origen,
    case when m->>'inapp' <> '' then 'navegador de '||(m->>'inapp') else 'navegador normal' end as navegador,
    coalesce(m->>'os','?') as sistema, coalesce(m->>'country','?') as pais
  from e join (select quien as q, 1 from e where ev='opened' group by quien) z on z.q = e.quien where ev = 'opened'
),
a as (   -- qué hizo cada persona
  select quien,
    bool_or(ev='record_start') as toco_mic,
    bool_or(ev='mic_error')    as nego_mic,
    bool_or(ev='typed_lookup') as escribio,
    bool_or(ev='significa_lookup') as busco
  from e group by quien
),
base as (select o.*, a.toco_mic, a.nego_mic, a.escribio, a.busco from o left join a using (quien))
select 'por ubicación del anuncio' as vista, origen as grupo, count(*) as visitas,
  count(*) filter (where toco_mic or escribio) as "tocaron el círculo o escribieron",
  count(*) filter (where busco) as "buscaron una palabra",
  count(*) filter (where nego_mic) as "negaron el micrófono",
  round(100.0*count(*) filter (where busco)/count(*),1) as "% que probó"
from base group by origen
union all select 'por navegador', navegador, count(*), count(*) filter (where toco_mic or escribio), count(*) filter (where busco), count(*) filter (where nego_mic), round(100.0*count(*) filter (where busco)/count(*),1) from base group by navegador
union all select 'por sistema', sistema, count(*), count(*) filter (where toco_mic or escribio), count(*) filter (where busco), count(*) filter (where nego_mic), round(100.0*count(*) filter (where busco)/count(*),1) from base group by sistema
union all select 'por país', pais, count(*), count(*) filter (where toco_mic or escribio), count(*) filter (where busco), count(*) filter (where nego_mic), round(100.0*count(*) filter (where busco)/count(*),1) from base group by pais
order by 1, 3 desc;
