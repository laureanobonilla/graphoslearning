-- Rótulo: lista de espera para la versión sin marca de agua (mide interés antes de construir el cobro).
create table if not exists rot_lista (email text primary key, plan text not null default 'mensual', created_at timestamptz not null default now());
alter table rot_lista enable row level security;
-- Sin políticas: solo la función de Netlify (clave de servicio) puede escribir/leer.
