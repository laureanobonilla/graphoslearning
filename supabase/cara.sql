-- ==========================================================================================
-- «¿De qué tienes cara?»: análisis y pagos. Ejecuta UNA vez en Supabase → SQL Editor (es seguro repetirlo).
-- La FOTO nunca se guarda: aquí solo queda el texto que escribió la IA.
-- ==========================================================================================
create table if not exists public.cara_jobs (
  id               text primary key,          -- UUID del navegador
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  anon_id          text,
  country          text,
  ip_hash          text,                      -- para el tope diario de análisis gratis (nunca la IP)
  ref              text,                      -- de dónde vino: campaña de anuncio o «compartido»
  veredicto        text,
  certeza          integer,
  informe          jsonb,
  paypal_order     text,
  paid             boolean not null default false,
  paid_at          timestamptz,
  paid_amount_usd  numeric,
  payer_email      text
);
alter table public.cara_jobs enable row level security;
create index if not exists cara_jobs_created on public.cara_jobs (created_at desc);
create index if not exists cara_jobs_ip on public.cara_jobs (ip_hash, created_at desc);
create index if not exists cara_jobs_order on public.cara_jobs (paypal_order);

-- Vista para revisar rápido: cuántos análisis, de dónde y cuántos pagaron.
drop view if exists public.cara_jobs_friendly;
create view public.cara_jobs_friendly as
  select (created_at at time zone 'America/Costa_Rica') as creado_cr, veredicto, certeza, country, ref, paid, paid_amount_usd, payer_email
  from public.cara_jobs order by created_at desc;

-- Resumen por día: análisis, pagos, conversión y plata.
drop view if exists public.cara_resumen_diario;
create view public.cara_resumen_diario as
  select date(created_at at time zone 'America/Costa_Rica') as dia,
         count(*) as analisis,
         count(*) filter (where paid) as pagos,
         round(100.0 * count(*) filter (where paid) / nullif(count(*), 0), 1) as conversion_pct,
         coalesce(sum(paid_amount_usd), 0) as usd
  from public.cara_jobs group by 1 order by 1 desc;
