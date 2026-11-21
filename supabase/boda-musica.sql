-- Música de la misa (boda de Kari y Lau). Ejecuta UNA vez en Supabase → SQL Editor (es seguro repetirlo).
create table if not exists public.boda_musica (
  id         bigint primary key,
  titulo     text not null default '',
  tipo       text not null default 'video' check (tipo in ('video','link')),
  url        text not null default '',
  precio     numeric check (precio is null or (precio >= 0 and precio <= 100000000)),
  extra      text not null default '',
  nota_k     smallint check (nota_k is null or (nota_k between 1 and 10)),
  nota_l     smallint check (nota_l is null or (nota_l between 1 and 10)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.boda_musica enable row level security;   -- sin políticas: solo se accede desde el servidor

-- Carpeta pública para los videos que se suban desde la página (50 MB por archivo).
insert into storage.buckets (id, name, public, file_size_limit)
values ('boda-musica', 'boda-musica', true, 52428800)
on conflict (id) do nothing;

-- Las 5 opciones iniciales: 4 videos (están en el sitio) y el reel de Instagram. No pisa lo que ya exista.
insert into public.boda_musica (id, titulo, tipo, url) values
 (1, 'Opción 1 · Violines',            'video', '/boda-kari-lau/videos/v1.mp4'),
 (2, 'Opción 2 · Voz con acompañamiento', 'video', '/boda-kari-lau/videos/v2.mp4'),
 (3, 'Opción 3 · Ensamble de cuerdas', 'video', '/boda-kari-lau/videos/v3.mp4'),
 (4, 'Opción 4 · Cantante solista',    'video', '/boda-kari-lau/videos/v4.mp4'),
 (5, 'Opción 5 · Reel de Instagram',   'link',  'https://www.instagram.com/reel/DeWbWqpxMC2/')
on conflict (id) do nothing;
