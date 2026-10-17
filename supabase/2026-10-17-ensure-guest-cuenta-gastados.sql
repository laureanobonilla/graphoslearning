-- ensure_guest corregido: un invitado nuevo nace con 0 si desde su IP (últimas N horas) ya hubo
-- p_ip_cap invitados que GASTARON, o si se crearon p_ip_cap*4 invitados (anti-scripts sin cookie).
create or replace function public.ensure_guest(p_guest text, p_ip text, p_initial integer, p_ip_cap integer, p_ip_window_hours integer) returns integer language plpgsql as $$
declare v integer; spent_from_ip integer; created_from_ip integer; start_balance integer;
begin
  select balance into v from public.guests where guest_id = p_guest;
  if found then update public.guests set ip = coalesce(p_ip, ip), last_seen = now() where guest_id = p_guest; return v; end if;
  select count(*) into spent_from_ip from public.guests g where g.ip = p_ip and g.created_at > now() - make_interval(hours => p_ip_window_hours)
     and exists (select 1 from public.usage_log u where u.user_id = 'guest:' || g.guest_id and u.cost > 0);
  select count(*) into created_from_ip from public.guests g where g.ip = p_ip and g.created_at > now() - make_interval(hours => p_ip_window_hours);
  start_balance := case when spent_from_ip >= p_ip_cap or created_from_ip >= p_ip_cap * 4 then 0 else p_initial end;
  insert into public.guests(guest_id, ip, balance) values (p_guest, p_ip, start_balance) on conflict (guest_id) do nothing;
  select balance into v from public.guests where guest_id = p_guest; return v;
end $$;
