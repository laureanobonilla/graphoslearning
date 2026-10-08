-- =====================================================================================================
-- HERRAMIENTAS (fuga-de-tiempo · nivel-ia · ideas-posts): tabla donde queda cada respuesta, paso a paso.
-- Supabase → SQL Editor → pega todo y Run. Una sola vez (se puede repetir sin problema).
-- Cada persona = una fila (sid). La fila se va llenando mientras responde; si se va a la mitad, lo respondido queda.
-- =====================================================================================================
create table if not exists public.hf_responses (
  sid             text primary key,
  tool            text not null,                       -- fuga-de-tiempo | nivel-ia | ideas-posts
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  country         text,
  step            int  not null default 0,             -- el paso más lejano al que llegó (0 = empezó)
  total_steps     int,
  completed       boolean not null default false,      -- llegó al resultado
  answers         jsonb not null default '{}'::jsonb,  -- todo lo que respondió
  ai              jsonb,                               -- lo que la IA le devolvió (resumen)
  contact_email   text,
  contact_whatsapp text,
  utm             jsonb not null default '{}'::jsonb,  -- {campaign, ad}
  email_sent      boolean not null default false
);
alter table public.hf_responses enable row level security;     -- sin políticas: solo se lee con la llave de servidor
create index if not exists hf_responses_tool_created on public.hf_responses (tool, created_at desc);
create index if not exists hf_responses_contact on public.hf_responses (created_at desc) where contact_email is not null or contact_whatsapp is not null;

create or replace view public.hf_responses_friendly as
select created_at at time zone 'America/Costa_Rica' as hora_cr, tool, country, step, total_steps, completed,
       contact_email, contact_whatsapp, utm->>'campaign' as campana, utm->>'ad' as anuncio, answers, ai, sid
from public.hf_responses order by created_at desc;
