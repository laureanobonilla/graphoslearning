-- ==========================================================================================
-- «Ordena» (/ordena/): diagnósticos, acceso pagado y órdenes de PayPal. Hermana personal de Rinde.
-- Ejecute UNA vez en Supabase → SQL Editor (es seguro repetirlo).
-- ==========================================================================================
create table if not exists public.ordena_projects (
  user_id     text primary key,               -- id de Netlify Identity (la misma cuenta de Graphikosmos)
  email       text,
  data        jsonb not null default '{}'::jsonb,   -- todo el diagnóstico: perfil, respuestas, planes, acciones
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.ordena_projects enable row level security;

create table if not exists public.ordena_access (
  user_id     text primary key,
  email       text,
  plan        text,                           -- mes | trimestre | anio (último comprado)
  paid_until  timestamptz,                    -- acceso completo hasta esta fecha
  free_frente text,                           -- el frente que eligió ver gratis
  free_gens   integer not null default 0,     -- veces que generó ese plan gratis (tope en ordena-plan.js)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.ordena_access enable row level security;

create table if not exists public.ordena_orders (
  order_id        text primary key,           -- id de la orden de PayPal
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
alter table public.ordena_orders enable row level security;
create index if not exists ordena_orders_user on public.ordena_orders (user_id);

-- Vista cómoda para revisar ventas (hora de Costa Rica).
drop view if exists public.ordena_ventas;
-- security_invoker: la vista respeta la seguridad de la tabla, así nadie con la clave pública puede leer las ventas.
create view public.ordena_ventas with (security_invoker = true) as
  select (paid_at at time zone 'America/Costa_Rica') as pagado_cr, email, plan, paid_amount_usd, payer_email
  from public.ordena_orders where status = 'paid' order by paid_at desc;
