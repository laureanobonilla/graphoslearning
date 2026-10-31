-- ==========================================================================================
-- «jingle-negocio»: pedidos de jingles para negocios (logo / nombre / personalizada).
-- Ejecute este archivo UNA vez en Supabase → SQL Editor. Es seguro repetirlo.
-- Si la tabla no existe, la app no se rompe: el correo sale igual y el registro queda como evento `jn_record_fallback`.
-- ==========================================================================================
create table if not exists public.jn_orders (
  id            text primary key,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  status        text not null default 'draft',     -- draft | generated | requested | paid | delivered
  anon_id       text,
  country       text,
  rubro         text,
  option        text,                              -- logo | nombre | propia
  exclusive     boolean default false,
  price_text    text,
  price_amount  numeric,
  business      text,
  rhythm        text,
  details       text,
  brief         jsonb,
  title         text,
  lyrics        text,                              -- letra generada por la IA (opción propia)
  lyrics_final  text,                              -- letra con la que envió (si la editó)
  logo_id       text,                              -- id privado del logo en Cloudinary
  phone         text,
  contact_name  text,
  utm           jsonb,
  email_sent    boolean default false
);
alter table public.jn_orders enable row level security;
create index if not exists jn_orders_created on public.jn_orders (created_at desc);
create index if not exists jn_orders_status on public.jn_orders (status, created_at desc);

drop view if exists public.jn_orders_friendly;
create view public.jn_orders_friendly as
  select id, (created_at at time zone 'America/Costa_Rica') as creado_cr, status, business, rubro, option, exclusive, price_text,
         contact_name, phone, rhythm, title, details, logo_id, email_sent, brief, lyrics_final
  from public.jn_orders order by created_at desc;
