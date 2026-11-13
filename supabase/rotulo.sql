-- Rótulo: lista de espera para la versión sin marca de agua (mide interés antes de construir el cobro).
create table if not exists rot_lista (email text primary key, plan text not null default 'mensual', created_at timestamptz not null default now());
alter table rot_lista enable row level security;
-- Sin políticas: solo la función de Netlify (clave de servicio) puede escribir/leer.

-- ============ COBRO ============
-- Un código por compra. creditos = videos incluidos; usados = videos ya hechos; vence = null si no vence.
create table if not exists rot_codigos (
  codigo text primary key, tipo text not null check (tipo in ('paquete','mensual')),
  creditos int not null default 0, usados int not null default 0, vence timestamptz,
  email text, orden text unique, pagado numeric, moneda text, creado timestamptz not null default now()
);
alter table rot_codigos enable row level security;
-- Gasta UN video del código de forma atómica (dos videos a la vez no pueden pasarse del límite). Devuelve cuántos quedan, o -1.
create or replace function rot_gastar(p_codigo text) returns int language plpgsql security definer as $$
declare r int;
begin
  update rot_codigos set usados = usados + 1
   where codigo = p_codigo and usados < creditos and (vence is null or vence > now())
   returning creditos - usados into r;
  return coalesce(r, -1);
end $$;
revoke all on function rot_gastar(text) from public, anon, authenticated;
-- Para dar un código a mano (por ejemplo, si te pagan por SINPE Móvil): cambia el código y el correo y ejecuta
-- insert into rot_codigos (codigo, tipo, creditos, email) values ('ROT-ABCD-EFGH', 'paquete', 10, 'cliente@correo.com');
