-- ==========================================================================================
-- Servicio de canciones (3 apps: tu-voz, tu-voz-video, tu-cancion-video): tabla de pedidos.
-- Ejecuta este archivo UNA vez en Supabase → SQL Editor. Es seguro repetirlo.
-- Si no existe todavía, las apps NO se rompen: el correo sale igual y el pedido se guarda como evento
-- `cs_record_fallback` en `events` hasta que corras este script.
-- Los archivos (audio y foto) NO están aquí: viven en Cloudinary en modo privado; aquí queda su identificador.
-- ==========================================================================================
create table if not exists public.cs_orders (
  id             text primary key,                -- código del pedido (UUID del navegador)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  app            text,                            -- tu-voz | tu-voz-video | tu-cancion-video
  status         text not null default 'requested', -- requested | sample_sent | paid | cancelled (lo cambias tú a mano)
  anon_id        text,
  country        text,
  contact_name   text,
  phone          text,
  email          text,
  with_video     boolean default false,
  audio_seconds  integer,
  billed_minutes integer,
  price_amount   numeric,                         -- en colones
  price_text     text,
  audio_id       text,                            -- identificador en Cloudinary
  photo_id       text,
  title          text,
  lyrics         text,
  lyrics_final   text,
  brief          jsonb,
  notes          text,
  utm            jsonb,
  email_sent     boolean default false
);
alter table public.cs_orders enable row level security;
create index if not exists cs_orders_created on public.cs_orders (created_at desc);
create index if not exists cs_orders_status on public.cs_orders (status, created_at desc);

drop view if exists public.cs_orders_friendly;
create view public.cs_orders_friendly as
  select id, (created_at at time zone 'America/Costa_Rica') as creado_cr, app, status,
         contact_name, phone, email, with_video, audio_seconds, billed_minutes, price_text, title, country, email_sent
  from public.cs_orders order by created_at desc;

-- Para marcar avance:  update public.cs_orders set status = 'sample_sent' where id = '...';
