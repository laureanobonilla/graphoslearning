-- Una mano (/una-mano/): lo que necesita la base de datos para registrar eventos.
-- Usa la MISMA tabla `events` de las demás apps (app = 'una-mano').
-- Se puede correr varias veces sin riesgo: solo crea lo que falte, no borra datos.

-- 1. Tabla de eventos (si no existiera)
create table if not exists public.events (
  id         bigserial primary key,
  actor_id   text not null,
  actor_kind text not null,
  anon_id    text,
  event_name text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;

-- 2. Columnas que usa la función de registro
alter table public.events add column if not exists actor_label text;
alter table public.events add column if not exists app text not null default 'graphikosmos';

-- 3. Permitir visitas anónimas (sin cuenta)
alter table public.events drop constraint if exists events_actor_kind_check;
alter table public.events add constraint events_actor_kind_check
  check (actor_kind in ('user', 'guest', 'anon'));

-- 4. Índices para que las consultas por app sean rápidas
create index if not exists events_anon_time      on public.events (anon_id, created_at desc);
create index if not exists events_app_time       on public.events (app, created_at desc);
create index if not exists events_app_event_time on public.events (app, event_name, created_at desc);

-- 5. Función que llama el sitio para guardar cada evento
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

-- 6. Prueba: inserta un evento de prueba y lo muestra
select public.log_event('prueba-sql', 'anon', 'prueba-sql', 'sql_test', '{"nota":"prueba"}'::jsonb, null, 'una-mano');
select id, app, event_name, created_at from public.events
where app = 'una-mano' order by id desc limit 5;
