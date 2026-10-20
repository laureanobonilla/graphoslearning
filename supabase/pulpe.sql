-- ==========================================================================================
-- «La Pulpe» (/pulpe/): juego de administrar una pulpería tica. Partidas guardadas, récords, pase pagado y órdenes de PayPal.
-- Ejecute UNA vez en Supabase → SQL Editor (es seguro repetirlo).
-- ==========================================================================================
create table if not exists public.pulpe_saves (
  user_id     text primary key,               -- id de Netlify Identity (la misma cuenta de Graphikosmos)
  email       text,
  data        jsonb not null default '{}'::jsonb,   -- la partida completa
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.pulpe_saves enable row level security;

create table if not exists public.pulpe_access (
  user_id     text primary key,
  email       text,
  plan        text,
  paid_until  timestamptz,                    -- el pase de dueño es para siempre (fecha muy lejana)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.pulpe_access enable row level security;

create table if not exists public.pulpe_orders (
  order_id        text primary key,
  user_id         text not null,
  email           text,
  plan            text not null,
  usd             numeric,
  status          text not null default 'created',   -- created | paid
  paid_at         timestamptz,
  paid_amount_usd numeric,
  payer_email     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.pulpe_orders enable row level security;
create index if not exists pulpe_orders_user on public.pulpe_orders (user_id);

-- Récords: una fila por temporada terminada (o por la semana gratis). La tabla de posiciones toma el mejor de cada persona.
create table if not exists public.pulpe_scores (
  id          bigserial primary key,
  user_id     text not null,
  nombre      text not null,                  -- nombre de la pulpería (el que se muestra)
  barrio      text not null,
  modo        text not null,                  -- semana (7 días) | temporada (30 días)
  puntaje     bigint not null,                -- patrimonio final en colones
  dias        integer not null,
  resumen     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.pulpe_scores enable row level security;
create index if not exists pulpe_scores_rank on public.pulpe_scores (modo, puntaje desc);
create index if not exists pulpe_scores_user on public.pulpe_scores (user_id);

drop view if exists public.pulpe_ventas;
create view public.pulpe_ventas with (security_invoker = true) as
  select (paid_at at time zone 'America/Costa_Rica') as pagado_cr, email, plan, paid_amount_usd, payer_email
  from public.pulpe_orders where status = 'paid' order by paid_at desc;
