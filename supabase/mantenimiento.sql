-- ==========================================================================================
-- Pantalla de mantenimiento (/mantenimiento/): estado del cliente y pagos en las 4 apps de canciones.
-- Ejecuta UNA vez en Supabase → SQL Editor. Es seguro repetirlo. Requiere haber corrido antes
-- tu-cancion.sql y servicio-canciones.sql.
-- ==========================================================================================
alter table public.tc_songs  add column if not exists fulfil_status text not null default 'nuevo';
alter table public.tc_songs  add column if not exists paid          boolean not null default false;
alter table public.tc_songs  add column if not exists paid_amount   numeric;
alter table public.tc_songs  add column if not exists paid_at       timestamptz;
alter table public.tc_songs  add column if not exists admin_note    text;

alter table public.cs_orders add column if not exists fulfil_status text not null default 'nuevo';
alter table public.cs_orders add column if not exists paid          boolean not null default false;
alter table public.cs_orders add column if not exists paid_amount   numeric;
alter table public.cs_orders add column if not exists paid_at       timestamptz;
alter table public.cs_orders add column if not exists admin_note    text;

-- fulfil_status: nuevo | contactado | muestra_enviada | pagado | entregado | cancelado
