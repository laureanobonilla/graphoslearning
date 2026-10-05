-- "Vestirte": sesiones con fotos. Ejecutar una vez en Supabase → SQL Editor.
-- Solo el servidor (service key) accede; RLS activado y sin políticas = nadie más puede leer.
create table if not exists public.vst_sessions (
  id uuid primary key,
  created_at timestamptz not null default now(),
  anon_id text,
  answers jsonb,
  profile jsonb,
  photos jsonb not null default '[]'::jsonb,   -- [{slot, public_id}] (rutas privadas en Cloudinary, no las imágenes)
  flags jsonb,
  photos_deleted_at timestamptz,
  deleted_reason text
);
alter table public.vst_sessions enable row level security;
create index if not exists vst_sessions_created_idx on public.vst_sessions (created_at desc);
