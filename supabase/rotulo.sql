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

-- ============ CUENTAS (v2): las compras quedan ligadas a la cuenta, ya no hay que guardar un código ============
alter table rot_codigos add column if not exists uid text;
create index if not exists rot_codigos_uid on rot_codigos (uid);
create index if not exists rot_codigos_email on rot_codigos (lower(email));
-- Contadores de uso gratis (por conexión, o por cuenta y día).
create table if not exists rot_limites (clave text primary key, n int not null default 0, actualizado timestamptz not null default now());
alter table rot_limites enable row level security;
-- Reserva un uso: devuelve el nuevo total, o -1 si ya llegó al máximo. Es atómico (dos solicitudes a la vez no se pasan del límite).
create or replace function rot_contar(p_clave text, p_max int) returns int language plpgsql security definer as $$
declare r int;
begin
  insert into rot_limites (clave, n) values (p_clave, 1)
  on conflict (clave) do update set n = rot_limites.n + 1, actualizado = now() where rot_limites.n < p_max
  returning n into r;
  return coalesce(r, -1);
end $$;
create or replace function rot_devolver(p_clave text) returns void language sql security definer as $$
  update rot_limites set n = greatest(n - 1, 0) where clave = p_clave;
$$;
-- Gasta UN video de la compra que vence primero (las que no vencen, al final). Devuelve cuántos le quedan en total, o -1 si no tenía.
create or replace function rot_gastar_cuenta(p_uid text, p_email text) returns int language plpgsql security definer as $$
declare c text; r int;
begin
  select codigo into c from rot_codigos
   where (uid = p_uid or (uid is null and lower(email) = lower(p_email)))
     and usados < creditos and (vence is null or vence > now())
   order by vence nulls last, creado limit 1 for update skip locked;
  if c is null then return -1; end if;
  update rot_codigos set usados = usados + 1 where codigo = c;
  select coalesce(sum(creditos - usados), 0) into r from rot_codigos
   where (uid = p_uid or (uid is null and lower(email) = lower(p_email))) and usados <= creditos and (vence is null or vence > now());
  return r;
end $$;
revoke all on function rot_contar(text, int), rot_devolver(text), rot_gastar_cuenta(text, text) from public, anon, authenticated;
-- Para regalar videos a un correo (por ejemplo, si te pagan por otro medio): el cliente solo tiene que entrar con ese correo.
-- insert into rot_codigos (codigo, tipo, creditos, email) values ('ROT-REGALO-001', 'paquete', 10, 'cliente@correo.com');
