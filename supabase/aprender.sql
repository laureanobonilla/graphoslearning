-- =====================================================================================================
-- APRENDER (la página /aprender/ que lleva a Graphikosmos): tabla donde queda el texto generado para cada persona.
-- Supabase → SQL Editor → pega todo y Run. Una sola vez (se puede repetir sin problema).
-- REQUIERE que ya hayas corrido supabase/herramientas.sql (las respuestas del cuestionario van en hf_responses, tool = 'aprende').
-- =====================================================================================================
create table if not exists public.ap_texts (
  sid         text primary key,                        -- el mismo código de la fila en hf_responses
  title       text,
  text        text not null,
  style       text,                                    -- estilo elegido (académico, claro, narrativo, conciso)
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz                              -- cuándo lo abrió Graphikosmos por primera vez
);
alter table public.ap_texts enable row level security;  -- sin políticas: solo el servidor lo toca
create index if not exists ap_texts_created on public.ap_texts (created_at desc);
