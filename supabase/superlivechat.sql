-- ==========================================================================================================
-- SuperLiveChat: red social de citas (descubrir, matches, chat gratis, videollamada con gemas).
-- Ejecuta este archivo UNA vez en Supabase → SQL Editor. Es seguro repetirlo.
-- Todo el acceso pasa por las funciones de Netlify con la clave de servicio; las tablas quedan cerradas (RLS sin políticas).
-- Además hay que crear en Netlify la variable SUPABASE_ANON_KEY (la clave "anon public") y activar el login en Supabase (ver LEEME).
-- ==========================================================================================================
create table if not exists public.slc_profiles (
  user_id     uuid primary key,                                   -- id de Supabase Auth
  email       text,
  name        text not null,
  gender      text not null check (gender in ('m','f')),
  seeking     text not null check (seeking in ('m','f','b')),     -- a quién busca: hombres, mujeres o ambos
  birthdate   date not null,
  country     text,                                               -- se detecta solo (código de 2 letras)
  bio         text not null default '',
  status      text not null default 'incomplete' check (status in ('incomplete','active','suspended')),  -- active = ya tiene una foto aprobada
  gems        int  not null default 0 check (gems >= 0),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz,
  adult_ok_at timestamptz                                         -- cuándo marcó que es mayor de edad
);
create table if not exists public.slc_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.slc_profiles(user_id) on delete cascade,
  path        text not null,                                      -- ruta en el bucket privado slc-photos
  pos         int  not null default 0,
  status      text not null default 'pending' check (status in ('pending','approved','review','rejected')),
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists slc_photos_user on public.slc_photos (user_id, status, pos);
create table if not exists public.slc_likes (
  from_id uuid not null, to_id uuid not null, kind text not null check (kind in ('like','pass')), created_at timestamptz not null default now(),
  primary key (from_id, to_id)
);
create index if not exists slc_likes_to on public.slc_likes (to_id, kind);
create table if not exists public.slc_matches (
  a uuid not null, b uuid not null, created_at timestamptz not null default now(), primary key (a, b), check (a < b)
);
create table if not exists public.slc_convs (
  id bigserial primary key, a uuid not null, b uuid not null, created_at timestamptz not null default now(), unique (a, b), check (a < b)
);
create table if not exists public.slc_msgs (
  id bigserial primary key, conv bigint not null references public.slc_convs(id) on delete cascade, sender uuid not null,
  body text not null, created_at timestamptz not null default now(), read_at timestamptz
);
create index if not exists slc_msgs_conv on public.slc_msgs (conv, id);
create table if not exists public.slc_blocks (
  blocker uuid not null, blocked uuid not null, created_at timestamptz not null default now(), primary key (blocker, blocked)
);
create table if not exists public.slc_reports (
  id bigserial primary key, reporter uuid not null, reported uuid not null, reason text not null, detail text,
  created_at timestamptz not null default now(), handled boolean not null default false
);
create table if not exists public.slc_calls (
  id uuid primary key default gen_random_uuid(), caller uuid not null, callee uuid not null,
  status text not null default 'ringing' check (status in ('ringing','active','ended','declined','missed')),
  created_at timestamptz not null default now(), answered_at timestamptz, ended_at timestamptz, last_tick_at timestamptz,
  minutes_billed int not null default 0, gems_spent int not null default 0, end_reason text
);
create index if not exists slc_calls_callee on public.slc_calls (callee, status, created_at desc);
create table if not exists public.slc_signals (
  id bigserial primary key, call uuid not null references public.slc_calls(id) on delete cascade, from_id uuid not null,
  kind text not null, payload jsonb, created_at timestamptz not null default now()
);
create index if not exists slc_signals_call on public.slc_signals (call, id);
create table if not exists public.slc_gem_tx (
  id bigserial primary key, user_id uuid not null, delta int not null, kind text not null, ref text, created_at timestamptz not null default now()
);
create unique index if not exists slc_gem_tx_once on public.slc_gem_tx (kind, ref) where kind in ('purchase','call','bonus');   -- no se acredita ni cobra dos veces lo mismo
create table if not exists public.slc_orders (
  order_id text primary key, user_id uuid not null, pack text not null, gems int not null, usd numeric not null,
  status text not null default 'created', created_at timestamptz not null default now()
);
alter table public.slc_profiles enable row level security;  alter table public.slc_photos  enable row level security;
alter table public.slc_likes    enable row level security;  alter table public.slc_matches enable row level security;
alter table public.slc_convs    enable row level security;  alter table public.slc_msgs    enable row level security;
alter table public.slc_blocks   enable row level security;  alter table public.slc_reports enable row level security;
alter table public.slc_calls    enable row level security;  alter table public.slc_signals enable row level security;
alter table public.slc_gem_tx   enable row level security;  alter table public.slc_orders  enable row level security;

-- Fotos: bucket PRIVADO (las fotos se ven solo con enlaces firmados que da el servidor).
insert into storage.buckets (id, name, public) values ('slc-photos', 'slc-photos', false) on conflict (id) do nothing;

-- Gemas: suma o resta de forma atómica y deja el movimiento anotado. Devuelve el saldo nuevo, o -1 si no alcanza (o ya estaba registrado).
create or replace function public.slc_gems(p_user uuid, p_delta int, p_kind text, p_ref text default null) returns int
language plpgsql security definer set search_path = public as $$
declare nb int;
begin
  update slc_profiles set gems = gems + p_delta where user_id = p_user and gems + p_delta >= 0 returning gems into nb;
  if nb is null then return -1; end if;
  begin
    insert into slc_gem_tx (user_id, delta, kind, ref) values (p_user, p_delta, p_kind, p_ref);
  exception when unique_violation then
    update slc_profiles set gems = gems - p_delta where user_id = p_user;   -- ya estaba registrado: se deshace
    return -2;
  end;
  return nb;
end $$;

-- Personas para descubrir / lista: respeta a quién busca cada uno, bloqueos y país; las que están en línea salen primero.
create or replace function public.slc_feed(p_me uuid, p_mode text, p_country text, p_limit int, p_offset int)
returns table (user_id uuid, name text, gender text, age int, country text, bio text, last_seen timestamptz, online boolean, photo_path text, n_photos int)
language sql security definer set search_path = public as $$
  select p.user_id, p.name, p.gender, date_part('year', age(p.birthdate))::int, p.country, p.bio, p.last_seen,
         coalesce(p.last_seen > now() - interval '3 minutes', false),
         (select ph.path from slc_photos ph where ph.user_id = p.user_id and ph.status = 'approved' order by ph.pos, ph.created_at limit 1),
         (select count(*)::int from slc_photos ph where ph.user_id = p.user_id and ph.status = 'approved')
  from slc_profiles p join slc_profiles me on me.user_id = p_me
  where p.user_id <> p_me and p.status = 'active' and me.status = 'active'
    and (me.seeking = 'b' or me.seeking = p.gender) and (p.seeking = 'b' or p.seeking = me.gender)
    and not exists (select 1 from slc_blocks b where (b.blocker = p_me and b.blocked = p.user_id) or (b.blocker = p.user_id and b.blocked = p_me))
    and (coalesce(p_country, '') = '' or p.country = p_country)
    and (p_mode <> 'discover' or not exists (select 1 from slc_likes l where l.from_id = p_me and l.to_id = p.user_id))
  order by coalesce(p.last_seen > now() - interval '3 minutes', false) desc, p.last_seen desc nulls last, p.created_at desc
  limit greatest(1, least(p_limit, 40)) offset greatest(0, p_offset);
$$;

-- Conversaciones (con match o mensajes directos) con último mensaje y no leídos.
create or replace function public.slc_convs(p_me uuid)
returns table (conv bigint, other uuid, name text, photo_path text, online boolean, last_body text, last_at timestamptz, last_mine boolean, unread int, matched boolean)
language sql security definer set search_path = public as $$
  select c.id, o.user_id, o.name,
         (select ph.path from slc_photos ph where ph.user_id = o.user_id and ph.status = 'approved' order by ph.pos, ph.created_at limit 1),
         coalesce(o.last_seen > now() - interval '3 minutes', false), lm.body, coalesce(lm.created_at, c.created_at), coalesce(lm.sender = p_me, false),
         (select count(*)::int from slc_msgs m where m.conv = c.id and m.sender <> p_me and m.read_at is null),
         exists (select 1 from slc_matches mt where mt.a = case when p_me < o.user_id then p_me else o.user_id end and mt.b = case when p_me < o.user_id then o.user_id else p_me end)
  from slc_convs c
  join slc_profiles o on o.user_id = case when c.a = p_me then c.b else c.a end
  left join lateral (select m.body, m.created_at, m.sender from slc_msgs m where m.conv = c.id order by m.id desc limit 1) lm on true
  where (c.a = p_me or c.b = p_me)
    and not exists (select 1 from slc_blocks b where (b.blocker = p_me and b.blocked = o.user_id) or (b.blocker = o.user_id and b.blocked = p_me))
  order by coalesce(lm.created_at, c.created_at) desc limit 100;
$$;
revoke all on function public.slc_gems(uuid,int,text,text) from public, anon, authenticated;
revoke all on function public.slc_feed(uuid,text,text,int,int) from public, anon, authenticated;
revoke all on function public.slc_convs(uuid) from public, anon, authenticated;

-- ---------- Vistas para ti (administrador) ----------
create or replace view public.slc_resumen as
  select coalesce(country,'?') as pais, gender as genero, count(*) as personas,
         count(*) filter (where status = 'active') as activas,
         count(*) filter (where last_seen > now() - interval '3 minutes') as en_linea
  from public.slc_profiles group by 1, 2 order by 3 desc;
create or replace view public.slc_fotos_por_revisar as
  select ph.id, ph.created_at at time zone 'America/Costa_Rica' as hora_cr, p.name, p.email, ph.path, ph.reason
  from public.slc_photos ph join public.slc_profiles p using (user_id) where ph.status = 'review' order by ph.created_at;
create or replace view public.slc_reportes_abiertos as
  select r.id, r.created_at at time zone 'America/Costa_Rica' as hora_cr, r.reason, r.detail,
         a.name as quien_reporta, b.name as reportado, b.email as correo_reportado, r.reported
  from public.slc_reports r left join public.slc_profiles a on a.user_id = r.reporter left join public.slc_profiles b on b.user_id = r.reported
  where not r.handled order by r.created_at;
create or replace view public.slc_ventas as
  select (created_at at time zone 'America/Costa_Rica')::date as dia, count(*) as compras, sum(usd) as usd, sum(gems) as gemas
  from public.slc_orders where status = 'paid' group by 1 order by 1 desc;
-- Para aprobar una foto en revisión:  update slc_photos set status='approved' where id='...';  y  update slc_profiles set status='active' where user_id='...';
-- Para suspender a alguien:           update slc_profiles set status='suspended' where user_id='...';
