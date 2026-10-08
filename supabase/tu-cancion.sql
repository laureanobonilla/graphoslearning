-- ==========================================================================================
-- «tu-cancion»: tabla donde queda registrado TODO lo que la persona armó (borrador, intención de WhatsApp o pedido).
-- Ejecuta este archivo UNA vez en Supabase → SQL Editor. Es seguro repetirlo.
-- La app también guarda el recorrido paso a paso en `events` (app = 'tu-cancion'), igual que las demás.
-- Si esta tabla no existe todavía, la app NO se rompe: el correo sale igual y el registro completo se guarda como
-- evento `tc_record_fallback` en `events` (metadata) hasta que corras este script.
-- ==========================================================================================
create table if not exists public.tc_songs (
  id            text primary key,                 -- código de la canción (UUID generado en el navegador)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  status        text not null default 'draft',    -- draft | generated | own_lyrics_ready | whatsapp_intent | requested
  anon_id       text,
  country       text,
  price_text    text,                             -- lo que vio la persona, p. ej. ₡9.900
  price_amount  numeric,
  price_currency text,
  has_own_lyrics boolean,
  reason        text,                             -- para qué es
  person_name   text,                             -- nombre dedicado (si lo dio)
  rhythm        text,
  details       text,                             -- detalles escritos a mano
  notes         text,                             -- otra observación
  brief         jsonb,                            -- todas las respuestas del cuestionario, tal cual
  title         text,
  lyrics        text,                             -- letra original (la generada o la pegada)
  lyrics_final  text,                             -- letra con la que envió (si la editó)
  phone         text,
  via           text,                             -- whatsapp | phone
  utm           jsonb,
  email_sent    boolean default false
);
alter table public.tc_songs enable row level security;
create index if not exists tc_songs_created on public.tc_songs (created_at desc);
create index if not exists tc_songs_status on public.tc_songs (status, created_at desc);

-- Vista cómoda: lo último primero, con la hora de Costa Rica.
drop view if exists public.tc_songs_friendly;
create view public.tc_songs_friendly as
  select id, (created_at at time zone 'America/Costa_Rica') as creada_cr, (updated_at at time zone 'America/Costa_Rica') as actualizada_cr,
         status, country, price_text, has_own_lyrics, reason, person_name, rhythm, phone, via, title, details, notes, email_sent, brief, lyrics, lyrics_final
  from public.tc_songs order by created_at desc;
