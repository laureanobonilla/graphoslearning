-- Ejecutar en Supabase > SQL Editor. Solo el servidor (service_role) toca estas tablas.

create table if not exists public.profiles (
  user_id    text primary key,                       -- id de Netlify Identity (claim "sub")
  email      text,
  balance    integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  order_id   text primary key,                       -- id de orden de PayPal: evita acreditar dos veces
  user_id    text not null,
  nodes      integer not null,
  amount     numeric(10,2) not null,
  created_at timestamptz not null default now()
);

-- Invitados sin cuenta: identificados por una cookie HttpOnly (gk_guest), no por localStorage,
-- para que no puedan editar su propio saldo desde la consola del navegador.
create table if not exists public.guests (
  guest_id   text primary key,
  ip         text,
  balance    integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
create index if not exists guests_ip_time on public.guests (ip, created_at);

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  owner      text not null,                          -- user_id (sub de Netlify Identity)
  title      text not null default 'Sin título',
  data       jsonb not null,
  node_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_owner on public.projects (owner, updated_at desc);

create table if not exists public.usage_log (
  id         bigserial primary key,
  user_id    text not null,
  action     text not null,
  cost       integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists usage_log_user_time on public.usage_log (user_id, created_at desc);

-- Sin políticas + RLS activado = nadie con la clave pública (anon) puede leer ni escribir.
alter table public.profiles  enable row level security;
alter table public.payments  enable row level security;
alter table public.guests    enable row level security;
alter table public.projects  enable row level security;
alter table public.usage_log enable row level security;

create or replace function public.ensure_profile(p_user text, p_email text, p_initial integer)
returns integer language plpgsql as $$
declare v integer;
begin
  insert into public.profiles(user_id, email, balance)
  values (p_user, p_email, p_initial)
  on conflict (user_id) do nothing;
  select balance into v from public.profiles where user_id = p_user;
  return v;
end $$;

-- Descuento atómico. Si el costo supera el saldo, deja el saldo en 0 (la llamada a la IA ya se hizo).
create or replace function public.spend_nodes(p_user text, p_cost integer, p_action text)
returns integer language plpgsql as $$
declare v integer;
begin
  update public.profiles
     set balance = greatest(balance - greatest(p_cost, 0), 0)
   where user_id = p_user
   returning balance into v;
  insert into public.usage_log(user_id, action, cost) values (p_user, p_action, greatest(p_cost, 0));
  return v;
end $$;

-- Acreditación idempotente: si la orden ya fue registrada, no suma otra vez.
create or replace function public.credit_nodes(p_user text, p_nodes integer, p_order text, p_amount numeric)
returns integer language plpgsql as $$
declare v integer; inserted integer;
begin
  insert into public.payments(order_id, user_id, nodes, amount)
  values (p_order, p_user, p_nodes, p_amount)
  on conflict (order_id) do nothing;
  get diagnostics inserted = row_count;

  insert into public.profiles(user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  if inserted = 1 then
    update public.profiles set balance = balance + p_nodes where user_id = p_user;
  end if;
  select balance into v from public.profiles where user_id = p_user;
  return v;
end $$;

-- Crea el invitado si no existe. Si ya hay p_ip_cap identidades de invitado creadas
-- desde la misma IP en las últimas p_ip_window_hours horas, la nueva nace con saldo 0
-- (pasa directo al muro de login) en vez de con saldo gratis, para frenar el
-- "borro cookies y repito". Un invitado ya existente nunca se ve afectado por este tope.
create or replace function public.ensure_guest(
  p_guest text, p_ip text, p_initial integer, p_ip_cap integer, p_ip_window_hours integer
) returns integer language plpgsql as $$
declare v integer; recent_from_ip integer; start_balance integer;
begin
  select balance into v from public.guests where guest_id = p_guest;
  if found then
    update public.guests set ip = coalesce(p_ip, ip), last_seen = now() where guest_id = p_guest;
    return v;
  end if;

  select count(*) into recent_from_ip from public.guests
   where ip = p_ip and created_at > now() - make_interval(hours => p_ip_window_hours);

  start_balance := case when recent_from_ip >= p_ip_cap then 0 else p_initial end;

  insert into public.guests(guest_id, ip, balance) values (p_guest, p_ip, start_balance);
  return start_balance;
end $$;

create or replace function public.spend_guest_nodes(p_guest text, p_cost integer, p_action text)
returns integer language plpgsql as $$
declare v integer;
begin
  update public.guests
     set balance = greatest(balance - greatest(p_cost, 0), 0), last_seen = now()
   where guest_id = p_guest
   returning balance into v;
  insert into public.usage_log(user_id, action, cost) values ('guest:' || p_guest, p_action, greatest(p_cost, 0));
  return v;
end $$;

create or replace function public.usage_last_hour(p_user text)
returns integer language sql stable as $$
  select count(*)::integer from public.usage_log
   where user_id = p_user and created_at > now() - interval '1 hour';
$$;

-- ==========================================
-- REGISTRO DE EVENTOS (embudo de uso: primera visita, qué hace, dónde se
-- atasca o abandona, intentos de pago fallidos/exitosos, etc.)
-- ==========================================
-- actor_id sigue la misma convención que usage_log.user_id: el "sub" de
-- Netlify Identity si hay cuenta, o 'guest:<uuid>' si es un invitado (mismo
-- id que ya se usa para su saldo), para poder cruzar ambas tablas si hace
-- falta. anon_id es un identificador por NAVEGADOR (no por persona: cambia si
-- borra cookies o usa otro dispositivo) que persiste aunque cambie de
-- invitado a usuario logueado a mitad de sesión, para poder seguir el hilo
-- de "qué hizo antes de crear cuenta".
create table if not exists public.events (
  id         bigserial primary key,
  actor_id   text not null,
  actor_kind text not null check (actor_kind in ('user', 'guest')),
  anon_id    text,
  event_name text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_actor_time on public.events (actor_id, created_at desc);
create index if not exists events_name_time  on public.events (event_name, created_at desc);
create index if not exists events_anon_time  on public.events (anon_id, created_at desc);
alter table public.events enable row level security;

create or replace function public.log_event(p_actor text, p_kind text, p_anon text, p_event text, p_metadata jsonb)
returns void language plpgsql as $$
begin
  insert into public.events(actor_id, actor_kind, anon_id, event_name, metadata)
  values (p_actor, p_kind, p_anon, p_event, coalesce(p_metadata, '{}'::jsonb));
end $$;

revoke all on function public.ensure_profile(text,text,integer)             from public, anon, authenticated;
revoke all on function public.spend_nodes(text,integer,text)                from public, anon, authenticated;
revoke all on function public.credit_nodes(text,integer,text,numeric)       from public, anon, authenticated;
revoke all on function public.ensure_guest(text,text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.spend_guest_nodes(text,integer,text)          from public, anon, authenticated;
revoke all on function public.usage_last_hour(text)                         from public, anon, authenticated;
revoke all on function public.log_event(text,text,text,text,jsonb)          from public, anon, authenticated;
