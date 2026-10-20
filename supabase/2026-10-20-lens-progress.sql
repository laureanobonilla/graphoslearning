-- Progreso de las lentes (camino, genio, claridad) guardado en la cuenta: sobrevive entre dispositivos
-- y permite mostrar «tu siguiente paso» al volver. Correr una vez en el SQL Editor de Supabase.
create table if not exists public.lens_progress (
  owner      text   not null,                     -- user_id (sub de Netlify Identity)
  key        text   not null,                     -- lente|nivel|idioma|tema (la misma clave que usa el navegador)
  lens       text   not null,
  topic      text   not null default '',
  level      text   not null default 'intermedio',
  t          bigint not null default 0,           -- marca de tiempo (ms) de la última modificación en el cliente
  data       jsonb  not null,                     -- el resultado de la lente
  done       jsonb  not null default '{}'::jsonb, -- lo que la persona ya dominó
  updated_at timestamptz not null default now(),
  primary key (owner, key)
);
create index if not exists lens_progress_owner_t on public.lens_progress (owner, t desc);
-- Sin políticas + RLS activado = nadie con la clave pública (anon) puede leer ni escribir; solo el servidor.
alter table public.lens_progress enable row level security;
