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

-- actor_label: una etiqueta LEGIBLE para humanos (el correo si hay sesión, o
-- un nombre aleatorio tipo "Cometa-482" generado una sola vez por navegador
-- para invitados — ver getDisplayName en app.js). Antes, para saber "quién"
-- hizo algo en esta tabla había que leer actor_id (un id larguísimo de
-- Netlify Identity, o "guest:<uuid>") y cruzarlo a mano con `profiles`. Con
-- esta columna ya no hace falta: se puede filtrar/leer directamente por
-- nombre. Nunca se usa para nada de seguridad ni de saldo — eso sigue
-- siendo exclusivamente actor_id, que el servidor calcula de la sesión real.
-- "if not exists" para que este script se pueda volver a correr sobre una
-- base de datos que ya tenía la tabla `events` de antes de este cambio.
alter table public.events add column if not exists actor_label text;
create index if not exists events_label_time on public.events (actor_label, created_at desc);

-- ==========================================
-- TABLA DE EVENTOS COMPARTIDA ENTRE TODAS LAS APPS DE LA COLECCIÓN
-- ==========================================
-- La misma tabla `events` de arriba (ya usada por Graphikosmos) ahora sirve
-- para CUALQUIER app nueva del mismo sitio ("¿Quién eres en realidad?" y las
-- que sigan) sin tener que crear una tabla ni unas variables de entorno
-- nuevas por app — todas comparten el mismo proyecto de Supabase.
--
-- IMPORTANTE: este bloque va ANTES de crear la vista `events_friendly` (más
-- abajo) porque esa vista lee la columna `app` — si se intentara crear la
-- vista antes de que la columna exista, Supabase la rechaza con
-- "column app does not exist", aunque el "create table" de arriba sí se
-- haya corrido bien. El orden de los `alter table` importa.
--
-- Dos cambios para que una app SIN cuentas ni invitados con saldo (como
-- "¿Quién eres en realidad?") pueda registrar eventos igual:
--
-- 1. Columna `app`: de qué app de la colección viene el evento. Por defecto
--    'graphikosmos', para no afectar ninguna fila ni llamada existente.
alter table public.events add column if not exists app text not null default 'graphikosmos';
create index if not exists events_app_time       on public.events (app, created_at desc);
create index if not exists events_app_event_time on public.events (app, event_name, created_at desc);

-- 2. actor_kind ahora también acepta 'anon': para una app sin login ni
--    sistema de invitados con saldo, no hay un actor_id "real" — solo el id
--    por navegador (anon_id), que aquí se usa también como actor_id. Se
--    busca el nombre exacto que Postgres le puso al check (el que crea por
--    defecto `create table` al no nombrarlo) para poder reemplazarlo sin
--    duplicar uno nuevo con otro nombre.
alter table public.events drop constraint if exists events_actor_kind_check;
alter table public.events add constraint events_actor_kind_check
  check (actor_kind in ('user', 'guest', 'anon'));

-- Se reemplaza la función anterior (de 5 parámetros, sin p_label/p_app) por
-- esta de 7: en Postgres, agregar un parámetro nuevo crea una función
-- DISTINTA en vez de reemplazar la vieja (la sobrecarga queda por
-- nombre+tipos de parámetros), así que primero se borran las versiones
-- viejas (de 5 y de 6 parámetros) para no dejar funciones log_event
-- huérfanas sueltas.
drop function if exists public.log_event(text, text, text, text, jsonb);
drop function if exists public.log_event(text, text, text, text, jsonb, text);

create or replace function public.log_event(
  p_actor text, p_kind text, p_anon text, p_event text, p_metadata jsonb,
  p_label text default null, p_app text default 'graphikosmos'
)
returns void language plpgsql as $$
begin
  insert into public.events(actor_id, actor_kind, anon_id, event_name, metadata, actor_label, app)
  values (p_actor, p_kind, p_anon, p_event, coalesce(p_metadata, '{}'::jsonb), p_label, coalesce(p_app, 'graphikosmos'));
end $$;

-- Vista de conveniencia para leer la tabla a mano desde el SQL Editor de
-- Supabase sin tener que escribir el coalesce cada vez: "who" ya prioriza el
-- nombre legible y solo cae al id crudo para eventos viejos (de antes de
-- ese cambio) que no tienen actor_label. Ejemplos de uso en
-- LEEME_ETAPA_2.md, sección correspondiente a esta ronda de cambios.
--
-- "drop + create" en vez de "create or replace": Postgres no deja que
-- "create or replace view" cambie el ORDEN o el NOMBRE de columnas que la
-- vista ya tenía (solo deja agregar columnas nuevas al final) — y agregar
-- `app` justo después de `created_at` corre a `who` de lugar, lo cual
-- Postgres interpreta como "renombrar" la columna 2 y lo rechaza (error
-- 42P16). Una vista no guarda datos propios, así que borrarla y
-- recrearla es seguro y no pierde nada.
drop view if exists public.events_friendly;
create view public.events_friendly as
  select
    created_at,
    app,
    coalesce(actor_label, actor_id) as who,
    actor_kind,
    event_name,
    metadata
  from public.events
  order by created_at desc;

-- Vista propia del embudo de "¿Quién eres en realidad?": qué tan lejos
-- llegó cada visitante (hasta qué número de pregunta, de 1 a 16) y si llegó
-- a pagar. Un visitante que nunca generó la lectura ni pagó simplemente no
-- tiene fila en last_question_answered más allá de donde se quedó.
drop view if exists public.quien_eres_funnel;
create view public.quien_eres_funnel as
  select
    anon_id,
    max((metadata->>'questionIndex')::int) filter (where event_name = 'question_answered') as last_question_answered,
    count(*) filter (where event_name = 'question_answered') as questions_answered,
    bool_or(event_name = 'reading_generated_success') as generated_reading,
    bool_or(event_name = 'paywall_shown') as saw_paywall,
    bool_or(event_name in ('payment_order_create_failed', 'payment_captured_failed')) as had_payment_problem,
    bool_or(event_name = 'payment_captured_success') as paid,
    min(created_at) as first_event_at,
    max(created_at) as last_event_at
  from public.events
  where app = 'quien-eres'
  group by anon_id
  order by max(created_at) desc;

-- ==========================================
-- LECTURAS DE "¿QUIÉN ERES EN REALIDAD?" (reemplaza a Netlify Blobs)
-- ==========================================
-- La primera versión guardaba esto en Netlify Blobs, justamente para no
-- depender de Supabase en esta app. En producción, Netlify Blobs falló con
-- "The environment has not been configured to use Netlify Blobs" (un
-- problema de aprovisionamiento de Netlify, no de la app — ver el comentario
-- al inicio de netlify/functions/_lib/qer-readings-store.js). Como Supabase
-- ya está funcionando en este mismo sitio, se movió aquí: dos tablas chicas,
-- sin relación con las de Graphikosmos.
--
-- `id`/`order_id` son texto (no bigserial) porque los genera el código
-- (un UUID para la lectura, el orderID real de PayPal para la orden), no la
-- base de datos.
create table if not exists public.qer_readings (
  id         text primary key,
  reading    jsonb not null,
  paid       boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.qer_readings enable row level security;

create table if not exists public.qer_orders (
  order_id   text primary key,
  reading_id text not null,
  created_at timestamptz not null default now()
);
alter table public.qer_orders enable row level security;

-- Ambas sin TTL automático en la base (el código ya ignora cualquier fila de
-- más de 24h, ver TTL_MS en _lib/qer-readings-store.js) — si en algún
-- momento se quiere borrar de verdad las filas viejas para no acumular
-- basura, esta consulta se puede correr a mano o programar:
--   delete from public.qer_readings where created_at < now() - interval '2 days';
--   delete from public.qer_orders   where created_at < now() - interval '2 days';

revoke all on function public.ensure_profile(text,text,integer)             from public, anon, authenticated;
revoke all on function public.spend_nodes(text,integer,text)                from public, anon, authenticated;
revoke all on function public.credit_nodes(text,integer,text,numeric)       from public, anon, authenticated;
revoke all on function public.ensure_guest(text,text,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.spend_guest_nodes(text,integer,text)          from public, anon, authenticated;
revoke all on function public.usage_last_hour(text)                         from public, anon, authenticated;
revoke all on function public.log_event(text,text,text,text,jsonb,text,text) from public, anon, authenticated;
