-- ==========================================================================================
-- «Destila» (notas de voz de WhatsApp → transcripción + idea principal): lotes y audios.
-- Ejecuta UNA vez en Supabase → SQL Editor (es seguro repetirlo).
-- El audio NUNCA se guarda: solo el texto que sale de él, para que la persona pueda volver a su enlace.
-- ==========================================================================================
create table if not exists public.dst_jobs (
  id                text primary key,                 -- código del lote (UUID del navegador)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  count             integer not null,                 -- cuántos audios trae el lote (fija el precio)
  price_usd         numeric,
  anon_id           text,
  country           text,
  free              boolean not null default false,   -- abierto con la clave del dueño (?k=)
  paypal_order      text,
  paypal_amount_usd numeric,                          -- precio al momento de crear la orden
  paid              boolean not null default false,
  paid_at           timestamptz,
  paid_amount_usd   numeric,
  payer_email       text,
  general           jsonb,                            -- idea general {idea, topics, actions:[{who,what}], pending}
  general_key       text,                             -- qué audios entraron en esa idea general (índices)
  general_count     integer,
  admin_note        text                              -- nota tuya (pantalla /mantenimiento/)
);
alter table public.dst_jobs enable row level security;
create index if not exists dst_jobs_created on public.dst_jobs (created_at desc);
create index if not exists dst_jobs_order on public.dst_jobs (paypal_order);

create table if not exists public.dst_items (
  job_id      text not null references public.dst_jobs(id) on delete cascade,
  idx         integer not null,                       -- posición del audio en el lote (0 = el gratis)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  sender      text,                                   -- quién lo mandó (si vino del ZIP del chat)
  sent_at     text,                                   -- cuándo, tal como lo escribe WhatsApp
  seconds     integer,
  bytes       integer,
  transcript  text,
  idea        text,
  points      jsonb,
  actions     jsonb,
  no_speech   boolean not null default false,
  primary key (job_id, idx)
);
alter table public.dst_items enable row level security;

drop view if exists public.dst_jobs_friendly;
create view public.dst_jobs_friendly with (security_invoker = true) as   -- con invoker: no queda expuesta por la API pública
  select j.id, (j.created_at at time zone 'America/Costa_Rica') as creado_cr, j.count as audios, (select count(*) from public.dst_items i where i.job_id = j.id) as hechos,
         j.country, j.price_usd, j.paid, j.paid_amount_usd, j.payer_email, j.free, (j.general is not null) as con_idea_general
  from public.dst_jobs j order by j.created_at desc;

-- Limpieza opcional (privacidad): borra los textos de lotes de más de 30 días. Puedes correrla a mano cuando quieras:
-- delete from public.dst_jobs where created_at < now() - interval '30 days';
