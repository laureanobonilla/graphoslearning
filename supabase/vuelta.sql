-- «¿Te está dando vuelta?» Ejecuta en Supabase → SQL Editor. Es seguro repetirlo.
create table if not exists public.vuelta_sesiones (
  id          uuid primary key default gen_random_uuid(),
  respuestas  jsonb not null,
  pct         integer,
  pagado      boolean not null default false,
  pagado_en   timestamptz,
  order_id    text,
  monto_usd   numeric,
  pais        text,
  creado      timestamptz not null default now()
);
create table if not exists public.vuelta_eventos (
  id      bigint generated always as identity primary key,
  sid     text,
  evento  text not null,
  n       integer,
  pais    text,
  creado  timestamptz not null default now()
);
create index if not exists vuelta_eventos_ev on public.vuelta_eventos (evento, creado);
alter table public.vuelta_sesiones enable row level security;
alter table public.vuelta_eventos enable row level security;
-- Sin políticas: solo el servidor (service key) lee y escribe.
