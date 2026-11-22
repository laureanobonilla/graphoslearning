-- Música de la misa (boda de Kari y Lau). Ejecuta en Supabase → SQL Editor (es seguro repetirlo, también si ya habías corrido la versión anterior).
-- Cada fila es un grupo y puede tener varios videos o enlaces (columna «medios»).
create table if not exists public.boda_musica (
  id         bigint primary key,
  titulo     text not null default '',
  tipo       text not null default 'video' check (tipo in ('video','link')),   -- versión anterior; ya no se usa
  url        text not null default '',                                         -- versión anterior; ya no se usa
  medios     jsonb not null default '[]'::jsonb,                               -- [{"tipo":"video"|"link","url":"..."}]
  precio     numeric check (precio is null or (precio >= 0 and precio <= 100000000)),
  extra      text not null default '',
  nota_k     smallint check (nota_k is null or (nota_k between 1 and 10)),
  nota_l     smallint check (nota_l is null or (nota_l between 1 and 10)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.boda_musica add column if not exists medios jsonb not null default '[]'::jsonb;
alter table public.boda_musica enable row level security;   -- sin políticas: solo se accede desde el servidor

-- Carpeta pública para los videos que se suban desde la página (50 MB por archivo)
insert into storage.buckets (id, name, public, file_size_limit)
values ('boda-musica', 'boda-musica', true, 52428800)
on conflict (id) do nothing;

-- Opciones iniciales: Rúa (los 4 videos) y el reel de Instagram. No pisa lo que ya exista.
insert into public.boda_musica (id, titulo, medios) values
 (1, 'Rúa', '[{"tipo":"video","url":"/boda-kari-lau/videos/v1.mp4"},{"tipo":"video","url":"/boda-kari-lau/videos/v2.mp4"},{"tipo":"video","url":"/boda-kari-lau/videos/v3.mp4"},{"tipo":"video","url":"/boda-kari-lau/videos/v4.mp4"}]'::jsonb),
 (5, 'Opción 5 · Reel de Instagram', '[{"tipo":"link","url":"https://www.instagram.com/reel/DeWbWqpxMC2/"}]'::jsonb)
on conflict (id) do nothing;

-- Si ya habías corrido la versión anterior: pasa el video o enlace de cada fila a «medios»…
update public.boda_musica
   set medios = jsonb_build_array(jsonb_build_object('tipo', tipo, 'url', url))
 where medios = '[]'::jsonb and url <> '';

-- …y junta las filas 1 a 4 en «Rúa» (4 videos). Solo borra las filas 2, 3 y 4 si siguen con su nombre original «Opción N» y sin precio, notas ni instrumentación (si ya las editaste, no las toca).
update public.boda_musica
   set medios = '[{"tipo":"video","url":"/boda-kari-lau/videos/v1.mp4"},{"tipo":"video","url":"/boda-kari-lau/videos/v2.mp4"},{"tipo":"video","url":"/boda-kari-lau/videos/v3.mp4"},{"tipo":"video","url":"/boda-kari-lau/videos/v4.mp4"}]'::jsonb,
       titulo = case when titulo like 'Opción 1%' then 'Rúa' else titulo end
 where id = 1 and jsonb_array_length(medios) = 1 and medios->0->>'url' = '/boda-kari-lau/videos/v1.mp4';

delete from public.boda_musica
 where id in (2, 3, 4) and url like '/boda-kari-lau/videos/v%.mp4'
   and titulo like 'Opción %' and precio is null and extra = '' and nota_k is null and nota_l is null
   and exists (select 1 from public.boda_musica where id = 1 and jsonb_array_length(medios) = 4);
