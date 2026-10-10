-- =====================================================================================================
-- REINICIAR LOS REGISTROS para volver a medir el comportamiento desde cero.
-- Supabase → SQL Editor → pega TODO el archivo, cambia los true/false de abajo y Run (corre completo, una sola vez).
--
-- LO QUE HACE POR DEFECTO (lo seguro): borra los eventos de Graphikosmos, su registro de uso y lo de /aprender/.
-- LO QUE NO TOCA POR DEFECTO: cuentas, saldos, pagos y proyectos de clientes (v_cuentas = false), invitados,
--   las demás apps y herramientas.
-- ANTES DE BORRAR hace una copia en el esquema «respaldo» (tablas con la fecha y hora en el nombre), a la que
--   solo se entra desde el panel de Supabase (no está expuesta a la web). Si quieres borrar definitivamente,
--   v_respaldo := false.
-- v_antes_de: solo se borra lo creado ANTES de esa fecha. Por defecto, ahora mismo (= todo lo que hay).
--   Para conservar lo nuevo cuando ya hay clientes reales: pon la fecha del lanzamiento, ej. '2026-10-10 00:00-06'.
-- Al final muestra cuántos registros quedan en cada tabla.
-- =====================================================================================================
do $$
declare
  v_eventos      boolean := true;    -- events con app='graphikosmos' (primera visita, esquemas, tour, pagos intentados…)
  v_uso          boolean := true;    -- usage_log (historial de nodos gastados; reinicia también el límite por hora)
  v_aprender     boolean := true;    -- /aprender/: hf_responses con tool='aprende' + ap_texts + events app='hf-aprende'
  v_movil        boolean := true;    -- events con app='graphikosmos-mobile' (versión móvil /m/)
  v_invitados    boolean := false;   -- guests: los invitados vuelven a recibir sus nodos gratis (también quien ya los gastó)
  v_otras_apps   boolean := false;   -- events de TODAS las demás apps (tu-cancion, quien-eres, hf-…) y hf_responses de otras herramientas
  v_cuentas      boolean := false;   -- ⚠ profiles (saldos), payments (pagos de PayPal), projects (proyectos guardados). NO si hay clientes reales
  v_respaldo     boolean := true;
  v_antes_de     timestamptz := now();
  sfx text := to_char(now() at time zone 'America/Costa_Rica', 'YYYYMMDD_HH24MISS');
  n bigint;
begin
  if v_respaldo then create schema if not exists respaldo; end if;

  if v_eventos then
    if v_respaldo then execute format('create table respaldo.events_graphikosmos_%s as select * from public.events where app = %L and created_at < %L', sfx, 'graphikosmos', v_antes_de); end if;
    delete from public.events where app = 'graphikosmos' and created_at < v_antes_de; get diagnostics n = row_count;
    raise notice 'events de Graphikosmos borrados: %', n;
  end if;

  if v_uso then
    if v_respaldo then execute format('create table respaldo.usage_log_%s as select * from public.usage_log where created_at < %L', sfx, v_antes_de); end if;
    delete from public.usage_log where created_at < v_antes_de; get diagnostics n = row_count;
    raise notice 'usage_log borrado: %', n;
  end if;

  if v_aprender then
    if to_regclass('public.ap_texts') is not null then
      if v_respaldo then execute format('create table respaldo.ap_texts_%s as select * from public.ap_texts where created_at < %L', sfx, v_antes_de); end if;
      delete from public.ap_texts where created_at < v_antes_de; get diagnostics n = row_count; raise notice 'ap_texts borrado: %', n;
    end if;
    if to_regclass('public.hf_responses') is not null then
      if v_respaldo then execute format('create table respaldo.hf_aprende_%s as select * from public.hf_responses where tool = %L and created_at < %L', sfx, 'aprende', v_antes_de); end if;
      delete from public.hf_responses where tool = 'aprende' and created_at < v_antes_de; get diagnostics n = row_count; raise notice 'hf_responses (aprende) borrado: %', n;
    end if;
    delete from public.events where app = 'hf-aprende' and created_at < v_antes_de; get diagnostics n = row_count; raise notice 'events hf-aprende borrados: %', n;
  end if;

  if v_movil then
    if v_respaldo then execute format('create table respaldo.events_movil_%s as select * from public.events where app = %L and created_at < %L', sfx, 'graphikosmos-mobile', v_antes_de); end if;
    delete from public.events where app = 'graphikosmos-mobile' and created_at < v_antes_de; get diagnostics n = row_count; raise notice 'events móvil borrados: %', n;
  end if;

  if v_invitados then
    if v_respaldo then execute format('create table respaldo.guests_%s as select * from public.guests where created_at < %L', sfx, v_antes_de); end if;
    delete from public.guests where created_at < v_antes_de; get diagnostics n = row_count;
    raise notice 'guests borrados: %  (ojo: su cookie «gk_welcome» sigue en sus navegadores, así que el esquema de bienvenida gratis solo será gratis a navegadores nuevos)', n;
  end if;

  if v_otras_apps then
    if v_respaldo then execute format('create table respaldo.events_otras_apps_%s as select * from public.events where app not in (%L, %L, %L) and created_at < %L', sfx, 'graphikosmos', 'hf-aprende', 'graphikosmos-mobile', v_antes_de); end if;
    delete from public.events where app not in ('graphikosmos', 'hf-aprende', 'graphikosmos-mobile') and created_at < v_antes_de; get diagnostics n = row_count; raise notice 'events de otras apps borrados: %', n;
    if to_regclass('public.hf_responses') is not null then
      delete from public.hf_responses where tool <> 'aprende' and created_at < v_antes_de; get diagnostics n = row_count; raise notice 'hf_responses de otras herramientas borrado: %', n;
    end if;
  end if;

  if v_cuentas then
    raise warning '⚠ v_cuentas = true: se borran saldos, pagos y proyectos de clientes. El respaldo queda en el esquema respaldo.';
    if v_respaldo then
      execute format('create table respaldo.profiles_%s as select * from public.profiles', sfx);
      execute format('create table respaldo.payments_%s as select * from public.payments', sfx);
      execute format('create table respaldo.projects_%s as select * from public.projects', sfx);
    end if;
    delete from public.payments; delete from public.projects; delete from public.profiles;
  end if;
end $$;

-- Cuántos registros quedan -----------------------------------------------------------------------------
select 'events (graphikosmos)' as tabla, count(*) as filas from public.events where app = 'graphikosmos'
union all select 'events (todas las apps)', count(*) from public.events
union all select 'usage_log', count(*) from public.usage_log
union all select 'guests', count(*) from public.guests
union all select 'profiles', count(*) from public.profiles
union all select 'payments', count(*) from public.payments
union all select 'projects', count(*) from public.projects
union all select 'hf_responses', count(*) from public.hf_responses
union all select 'ap_texts', count(*) from public.ap_texts;

-- Para ver otra vez la primera visita en TU navegador: abre una ventana privada, o borra los datos del sitio
-- (localStorage: gk_has_visited, gk_coach_seen2, gk_anon_id, gk_display_name; y la cookie gk_guest).
-- Para borrar para siempre los respaldos cuando ya no los necesites:  drop schema respaldo cascade;
