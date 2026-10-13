-- ==========================================================================================
-- «tu-pista»: trabajos de separación de voz y pagos. Ejecuta UNA vez en Supabase → SQL Editor (es seguro repetirlo).
-- ==========================================================================================
create table if not exists public.ins_jobs (
  id             text primary key,                 -- código del trabajo (UUID del navegador); también es el "enlace" de la persona
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  status         text not null default 'uploaded', -- uploaded | processing | ready | failed
  anon_id        text,
  country        text,
  audio_id       text,                             -- audio original en Cloudinary (privado)
  seconds        integer,
  prediction_id  text,                             -- trabajo en Replicate
  instr_id       text,                             -- pista completa (Cloudinary, privado)
  preview_id     text,                             -- fragmento de 30 s
  error          text,
  paypal_order   text,
  paid           boolean not null default false,
  paid_at        timestamptz,
  paid_amount_usd numeric,
  payer_email    text,
  downloads      integer not null default 0
);
alter table public.ins_jobs enable row level security;
create index if not exists ins_jobs_created on public.ins_jobs (created_at desc);
create index if not exists ins_jobs_order on public.ins_jobs (paypal_order);

drop view if exists public.ins_jobs_friendly;
create view public.ins_jobs_friendly as
  select id, (created_at at time zone 'America/Costa_Rica') as creado_cr, status, seconds, country, paid, paid_amount_usd, payer_email, downloads, error
  from public.ins_jobs order by created_at desc;
