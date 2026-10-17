-- 2026-10-17 · El tope de invitados por IP ahora cuenta SOLO a los que de verdad gastaron nodos.
--
-- Problema: cada visita nueva dispara varias llamadas a la vez (saldo, generación, etc.) y cada una, sin cookie
-- todavía, creaba su propio invitado. Una sola visita gastaba el tope de 3 por IP, y la siguiente persona
-- detrás de esa IP (casa, universidad, operador móvil) nacía con saldo 0 y veía el muro de login sin haber usado nada.
--
-- Ahora: el tope cuenta invitados de esa IP, en la ventana, que tengan al menos un gasto > 0 en usage_log.
-- Los duplicados que nunca gastaron ya no cuentan. Quien reinicia cookies para repetir sí sigue frenado.
-- No hay que cambiar la app. Para ajustar el tope: variable de Netlify GUEST_IP_CAP (hoy 3 por defecto).

create or replace function public.ensure_guest(
  p_guest text, p_ip text, p_initial integer, p_ip_cap integer, p_ip_window_hours integer
) returns integer language plpgsql as $$
declare v integer; recent_from_ip integer; start_balance integer;
begin
  select balance into v from public.guests where guest_id = p_guest;
  if found then
    update public.guests set ip = coalesce(p_ip, ip), last_seen = now() where guest_id = p_guest;
    return v;
  end if;

  select count(*) into recent_from_ip
    from public.guests g
   where g.ip = p_ip
     and g.created_at > now() - make_interval(hours => p_ip_window_hours)
     and exists (
       select 1 from public.usage_log u
        where u.user_id = 'guest:' || g.guest_id and u.cost > 0
     );

  start_balance := case when recent_from_ip >= p_ip_cap then 0 else p_initial end;

  insert into public.guests(guest_id, ip, balance) values (p_guest, p_ip, start_balance)
  on conflict (guest_id) do nothing;
  select balance into v from public.guests where guest_id = p_guest;
  return v;
end $$;
