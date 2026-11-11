-- «Licitaciones»: análisis de carteles de contratación pública. Ejecuta UNA vez en Supabase → SQL Editor (es seguro repetirlo).
create table if not exists public.lic_jobs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  filename    text not null default '',
  path        text not null,                 -- ruta del PDF en el bucket privado «licitaciones»
  size_bytes  bigint not null default 0,
  ip_hash     text,
  country     text,
  email       text,
  status      text not null default 'subido' check (status in ('subido','previo','pagado')),
  preview     jsonb,                          -- lo que se ve gratis
  paid_at     timestamptz,
  pay         jsonb                           -- orden de PayPal, monto, moneda, marca de alerta si no coincide
);
create index if not exists lic_jobs_ip_idx on public.lic_jobs (ip_hash, created_at);
create index if not exists lic_jobs_created_idx on public.lic_jobs (created_at);

create table if not exists public.lic_parts (  -- lo que se desbloquea al pagar, por partes
  job_id     uuid not null references public.lic_jobs(id) on delete cascade,
  part       text not null check (part in ('requisitos','documentos','alertas','borradores')),
  data       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (job_id, part)
);
alter table public.lic_jobs  enable row level security;   -- sin políticas: solo el servidor accede
alter table public.lic_parts enable row level security;

insert into storage.buckets (id, name, public) values ('licitaciones', 'licitaciones', false) on conflict (id) do update set public = false;

-- Consulta rápida de ventas:
--   select created_at, filename, country, email, pay->>'amount' as monto, pay->>'currency' as moneda, pay->>'flag' as alerta from lic_jobs where status='pagado' order by paid_at desc;
