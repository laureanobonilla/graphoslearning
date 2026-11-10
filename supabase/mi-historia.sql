-- Perfil «Mi historia»: claves de acceso y fotos privadas. Ejecuta UNA vez en Supabase → SQL Editor (es seguro repetirlo).
create table if not exists public.perfil_claves (
  id         bigserial primary key,
  code_hash  text not null unique,          -- SHA-256 de la clave (la clave en sí no se guarda)
  label      text not null default '',      -- a quién se la diste (para saber de quién es)
  active     boolean not null default true, -- apágala si alguien la comparte
  uses       int not null default 0,
  created_at timestamptz not null default now(),
  last_used  timestamptz
);
create table if not exists public.perfil_fotos (
  id         bigserial primary key,
  path       text not null unique,          -- ruta dentro del bucket privado
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
alter table public.perfil_claves enable row level security;   -- sin políticas: solo el servidor accede
alter table public.perfil_fotos  enable row level security;

-- Bucket PRIVADO para las fotos sin censura (nunca se sirven en público; solo con enlaces temporales).
insert into storage.buckets (id, name, public) values ('perfil-privado', 'perfil-privado', false) on conflict (id) do update set public = false;
