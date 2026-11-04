-- «Dilo Pachuco»: chat donde cada mensaje se convierte en la jerga de un país. Ejecuta UNA vez en Supabase → SQL Editor (es seguro repetirlo).
create table if not exists public.pc_rooms (
  id          text primary key,
  created_at  timestamptz not null default now(),
  country     text,                       -- país con el que se abrió la sala
  anon_id     text
);
create table if not exists public.pc_msgs (
  id          bigserial primary key,
  room        text not null references public.pc_rooms(id) on delete cascade,
  created_at  timestamptz not null default now(),
  author      text not null,              -- id anónimo de quien escribió
  author_name text not null,
  country     text not null,              -- jerga usada
  level       int  not null default 3,    -- 1 suave · 2 marcado · 3 full pachuco
  original    text not null,              -- lo que la persona escribió
  slang       text not null,              -- lo que se envió
  fallback    boolean not null default false  -- true si la IA no pudo convertirlo y se envió tal cual
);
alter table public.pc_rooms enable row level security;
alter table public.pc_msgs  enable row level security;
create index if not exists pc_msgs_room on public.pc_msgs (room, id);
create index if not exists pc_msgs_time on public.pc_msgs (created_at desc);

-- Vista cómoda (hora de Costa Rica)
drop view if exists public.pc_msgs_friendly;
create view public.pc_msgs_friendly as
  select m.id, (m.created_at at time zone 'America/Costa_Rica') as hora_cr, m.room, m.author_name, m.country, m.level, m.original, m.slang, m.fallback
  from public.pc_msgs m order by m.id desc;
