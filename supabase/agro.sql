-- «Agro»: calculadoras para agricultores con código de acceso y créditos (se cobran por SINPE Móvil, a mano).
-- Pega esto en el SQL Editor de Supabase y ejecútalo una vez.
create table if not exists agro_codigos (
  codigo text primary key,
  nota text not null default '',                       -- nombre o contacto de la persona (solo lo ves tú)
  tipo text not null default 'prueba' check (tipo in ('prueba','pago')),
  creditos int not null default 0,                     -- créditos totales concedidos
  usados int not null default 0,                       -- créditos gastados
  vence timestamptz,                                   -- null = no vence
  activo boolean not null default true,
  creado timestamptz not null default now(),
  ultimo_uso timestamptz,
  recargas int not null default 0                      -- cuántas veces pagó y se le recargó
);
alter table agro_codigos enable row level security;    -- sin políticas: solo las funciones de Netlify (clave de servicio) entran
create table if not exists agro_usos (id bigserial primary key, codigo text not null, herramienta text not null, creado timestamptz not null default now());
alter table agro_usos enable row level security;
create index if not exists agro_usos_codigo on agro_usos (codigo, creado desc);

-- Gasta UN crédito de forma atómica (dos cálculos a la vez no pueden pasarse del límite).
-- Devuelve: créditos que le quedan (>= 0)  |  -1 código no existe o desactivado  |  -2 vencido  |  -3 sin créditos
create or replace function agro_gastar(p_codigo text, p_herramienta text) returns int language plpgsql security definer as $$
declare c agro_codigos%rowtype;
begin
  select * into c from agro_codigos where codigo = upper(trim(p_codigo)) for update;
  if not found or not c.activo then return -1; end if;
  if c.vence is not null and c.vence <= now() then return -2; end if;
  if c.usados >= c.creditos then return -3; end if;
  update agro_codigos set usados = usados + 1, ultimo_uso = now() where codigo = c.codigo;
  insert into agro_usos (codigo, herramienta) values (c.codigo, left(coalesce(p_herramienta,''), 20));
  return c.creditos - c.usados - 1;
end $$;
-- Devuelve un crédito si el cálculo falló después de gastarlo.
create or replace function agro_devolver(p_codigo text) returns void language sql security definer as $$
  update agro_codigos set usados = greatest(usados - 1, 0) where codigo = upper(trim(p_codigo));
$$;
revoke all on function agro_gastar(text, text), agro_devolver(text) from public, anon, authenticated;
-- Para crear o recargar códigos usa la página /agro/admin.html (no hace falta escribir SQL a mano).
