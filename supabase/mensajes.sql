-- Mensajes entre usuarios de Graphikosmos. Ejecute UNA vez en Supabase → SQL Editor (es seguro repetirlo).
create table if not exists public.msg_users (
  user_id    text primary key,                 -- id de Netlify Identity
  handle     text not null,                    -- nombre visible (nunca el correo)
  last_seen  timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.msg_users enable row level security;

create table if not exists public.msg_messages (
  id         bigserial primary key,
  from_id    text not null,                    -- user_id, o 'staff:<alias>' cuando responde el equipo
  to_id      text not null,                    -- user_id, o 'staff:<alias>' cuando se le escribe al equipo
  body       text not null default '',
  image      text,                             -- imagen reducida (data URL jpeg)
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists msg_to_idx   on public.msg_messages (to_id, created_at desc);
create index if not exists msg_from_idx on public.msg_messages (from_id, created_at desc);
alter table public.msg_messages enable row level security;
