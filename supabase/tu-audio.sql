-- ==========================================================================================
-- «tu-audio» (app multifunción): trabajos y pagos. Ejecuta UNA vez en Supabase → SQL Editor (es seguro repetirlo).
-- ==========================================================================================
create table if not exists public.aud_jobs (
  id             text primary key,                 -- código del trabajo (UUID del navegador)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  tool           text not null,                    -- pista | voz | ajustar | letra | limpiar
  status         text not null default 'uploaded', -- uploaded | processing | ready | failed
  price_usd      numeric,
  anon_id        text,
  country        text,
  audio_id       text,                             -- audio original en Cloudinary (privado)
  seconds        integer,
  prediction_id  text,
  result_id      text,                             -- resultado completo (Cloudinary, privado)
  preview_id     text,                             -- fragmento de 30 s
  result_text    text,                             -- letra (herramienta «letra»)
  error          text,
  paypal_order   text,
  paid           boolean not null default false,
  paid_at        timestamptz,
  paid_amount_usd numeric,
  payer_email    text,
  downloads      integer not null default 0,
  last_adjust    jsonb                             -- tono/velocidad/recorte con que se descargó
);
alter table public.aud_jobs add column if not exists admin_note text;   -- nota tuya (pantalla /mantenimiento/)
alter table public.aud_jobs enable row level security;
create index if not exists aud_jobs_created on public.aud_jobs (created_at desc);
create index if not exists aud_jobs_order on public.aud_jobs (paypal_order);

drop view if exists public.aud_jobs_friendly;
create view public.aud_jobs_friendly as
  select id, (created_at at time zone 'America/Costa_Rica') as creado_cr, tool, status, seconds, country, price_usd, paid, paid_amount_usd, payer_email, downloads, last_adjust, error
  from public.aud_jobs order by created_at desc;
