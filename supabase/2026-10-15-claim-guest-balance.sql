-- ==========================================
-- Pasar el saldo de invitado a la cuenta al registrarse (2026-10-15)
-- Una sola vez por cuenta: lo que le quede al invitado de ESTE navegador (cookie gk_guest) se suma a su cuenta.
-- Es seguro de repetir. Si esta función aún no existe, el servidor lo ignora y todo sigue como antes.
-- ==========================================
alter table public.profiles add column if not exists guest_claimed_at timestamptz;

create or replace function public.claim_guest_balance(p_user text, p_guest text)
returns integer language plpgsql as $$
declare g integer; done timestamptz;
begin
  insert into public.profiles(user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  select guest_claimed_at into done from public.profiles where user_id = p_user for update;
  if done is not null then return 0; end if;
  update public.profiles set guest_claimed_at = now() where user_id = p_user;
  select balance into g from public.guests where guest_id = p_guest for update;
  if g is null or g <= 0 then return 0; end if;
  update public.guests set balance = 0 where guest_id = p_guest;
  update public.profiles set balance = balance + g where user_id = p_user;
  return g;
end $$;
revoke all on function public.claim_guest_balance(text,text) from public, anon, authenticated;
