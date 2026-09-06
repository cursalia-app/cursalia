-- Smoke test de seguridad.
-- Se ejecuta después de aplicar migraciones para verificar que los guards
-- defensivos y las policies siguen en su sitio.
--
-- Uso (elige uno):
--   psql "$DATABASE_URL" -f supabase/security-smoke.sql
--   supabase db execute --file supabase/security-smoke.sql
--   O bien pegar en el SQL Editor de Supabase.
--
-- Cada bloque termina con RAISE si detecta una anomalía. Silencio = todo bien.

do $$
declare
  guarded_access boolean;
  guarded_expiry timestamptz;
  null_access    boolean;
  null_expiry    timestamptz;
begin
  -- 1) Guard defensivo: un uid ajeno sin sesión NUNCA debe pasar.
  select public.has_content_access('00000000-0000-0000-0000-000000000001'::uuid)
    into guarded_access;
  select public.access_expires_at('00000000-0000-0000-0000-000000000001'::uuid)
    into guarded_expiry;

  if guarded_access is not false then
    raise exception 'guard roto: has_content_access(uid_ajeno) devolvió %', guarded_access;
  end if;
  if guarded_expiry is not null then
    raise exception 'guard roto: access_expires_at(uid_ajeno) devolvió %', guarded_expiry;
  end if;

  -- 2) uid nulo también debe rechazarse.
  select public.has_content_access(null) into null_access;
  select public.access_expires_at(null)  into null_expiry;

  if null_access is not false then
    raise exception 'guard roto: has_content_access(null) devolvió %', null_access;
  end if;
  if null_expiry is not null then
    raise exception 'guard roto: access_expires_at(null) devolvió %', null_expiry;
  end if;
end $$;

-- 3) RLS activo en todas las tablas del esquema public.
do $$
declare
  tabla record;
begin
  for tabla in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = tabla.tablename and c.relrowsecurity
    ) then
      raise exception 'tabla sin RLS: %', tabla.tablename;
    end if;
  end loop;
end $$;

-- 4) webhook_events sigue con su policy denegatoria.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'webhook_events'
      and policyname = 'webhook_events_deny_all'
  ) then
    raise exception 'falta la policy webhook_events_deny_all';
  end if;
end $$;

-- 5) Los tres índices de FK están puestos.
do $$
declare
  missing text;
begin
  select string_agg(idx, ', ') into missing
  from (values
    ('audit_log_actor_id_idx'),
    ('book_progress_book_id_idx'),
    ('courses_owner_id_idx')
  ) as expected(idx)
  where not exists (
    select 1 from pg_indexes where schemaname='public' and indexname = expected.idx
  );

  if missing is not null then
    raise exception 'faltan índices de FK: %', missing;
  end if;
end $$;

-- 6) Los triggers no son ejecutables como RPC por anon/authenticated.
do $$
declare
  leaked text;
begin
  select string_agg(proname, ', ') into leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('handle_new_user','handle_email_confirmed','enforce_device_limit')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if leaked is not null then
    raise exception 'triggers ejecutables como RPC: %', leaked;
  end if;
end $$;

-- 7) Rate limiting existe y no está expuesto a anon/authenticated.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='check_rate_limit'
  ) then
    raise exception 'falta la función check_rate_limit';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='check_rate_limit'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) then
    raise exception 'check_rate_limit expuesta a authenticated';
  end if;

  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='rate_limit_events_lookup'
  ) then
    raise exception 'falta el índice rate_limit_events_lookup';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='rate_limit_events' and policyname='rate_limit_events_deny_all'
  ) then
    raise exception 'falta la policy rate_limit_events_deny_all';
  end if;
end $$;

-- 8) Setting del cooldown de trial por IP presente.
do $$
begin
  if not exists (select 1 from public.app_settings where key='trial_ip_cooldown_hours') then
    raise exception 'falta app_settings.trial_ip_cooldown_hours';
  end if;
end $$;

select 'OK: guards, RLS, policies, índices, rate limit y trial guard verificados' as resultado;
