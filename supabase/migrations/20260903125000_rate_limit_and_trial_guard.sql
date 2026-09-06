-- Dos defensas nuevas contra abuso:
--   (a) rate_limit_events + check_rate_limit para frenar bombas contra los
--       endpoints de autenticación y de firma de URLs.
--   (b) handle_email_confirmed respeta un cooldown por IP antes de arrancar la
--       prueba, para que una sola persona no monte 100 cuentas y descargue el
--       catálogo con trials encadenados.

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limit_events (
  bucket     text not null,
  actor      text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup
  on public.rate_limit_events (bucket, actor, created_at desc);

alter table public.rate_limit_events enable row level security;

-- Nadie autenticado ni anónimo debe leer o escribir en esta tabla. Toda la
-- interacción pasa por la función check_rate_limit, que corre como definer.
create policy rate_limit_events_deny_all on public.rate_limit_events
  for all to anon, authenticated using (false) with check (false);

/**
 * Rate limit atómico: si en los últimos `window_seconds` este `actor` ha
 * disparado menos de `max_events` en `bucket`, registra uno más y devuelve
 * true. Si ya llegó al límite, devuelve false sin registrar.
 *
 * Se limpian dentro de la misma llamada los eventos fuera de la ventana para
 * este bucket+actor, así la tabla no crece sin control incluso sin cron.
 */
create or replace function public.check_rate_limit(
  bucket text,
  actor text,
  max_events integer,
  window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts      timestamptz := now();
  event_count integer;
begin
  delete from public.rate_limit_events e
   where e.bucket = check_rate_limit.bucket
     and e.actor  = check_rate_limit.actor
     and e.created_at < now_ts - make_interval(secs => window_seconds);

  select count(*) into event_count
    from public.rate_limit_events e
   where e.bucket = check_rate_limit.bucket
     and e.actor  = check_rate_limit.actor;

  if event_count >= max_events then
    return false;
  end if;

  insert into public.rate_limit_events (bucket, actor)
    values (check_rate_limit.bucket, check_rate_limit.actor);
  return true;
end;
$$;

revoke execute on function public.check_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trial guard por IP
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value) values
  ('trial_ip_cooldown_hours', '24'::jsonb)
on conflict (key) do nothing;

-- Al confirmar el correo, si desde la misma IP se arrancó otro trial dentro del
-- cooldown, se registra el intento y NO se arranca la prueba. La cuenta queda
-- creada; simplemente no obtiene los 30 minutos gratis. Un cliente legítimo
-- pagará y empezará su suscripción sin problema.
create or replace function public.handle_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cooldown_hours integer;
  same_ip_recent boolean;
  my_ip          inet;
begin
  if new.email_confirmed_at is null or old.email_confirmed_at is not null then
    return new;
  end if;

  select signup_ip into my_ip from public.profiles where id = new.id;

  if my_ip is not null then
    cooldown_hours := public.get_setting_int('trial_ip_cooldown_hours');

    select exists (
      select 1 from public.profiles p
      where p.signup_ip = my_ip
        and p.id <> new.id
        and p.trial_started_at is not null
        and p.trial_started_at > now() - make_interval(hours => cooldown_hours)
    ) into same_ip_recent;

    if same_ip_recent then
      insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
      values (new.id, 'trial_blocked_ip_reuse', 'profile', new.id,
              jsonb_build_object('signup_ip', my_ip::text,
                                 'cooldown_hours', cooldown_hours));
      return new;
    end if;
  end if;

  update public.profiles
    set trial_started_at = coalesce(trial_started_at, now())
    where id = new.id;
  return new;
end;
$$;

-- signup_ip solo lo pone el servidor. Extendemos el trigger de protección de
-- perfil para revertir cualquier intento del usuario de editarlo desde su
-- sesión.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  new.is_admin             := old.is_admin;
  new.trial_started_at     := old.trial_started_at;
  new.referred_by          := old.referred_by;
  new.external_customer_id := old.external_customer_id;
  new.email                := old.email;
  new.signup_ip            := old.signup_ip;
  return new;
end;
$$;
