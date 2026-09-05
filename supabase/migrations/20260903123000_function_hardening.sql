-- Cerrar la superficie de las funciones SECURITY DEFINER.
-- Dos frentes: (a) los triggers no deben ser callables como RPC, (b) las
-- funciones que reciben uid como parámetro deben rechazar consultar a un
-- tercero. Ninguna llamada legítima del código pasa un uid ajeno.

-- 1. Triggers: revoke a todo lo que no sea el propietario y el service_role.
--    Postgres graba las funciones con EXECUTE para PUBLIC por defecto; hay
--    que retirarlo explícitamente.
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.handle_email_confirmed()   from public, anon, authenticated;
revoke execute on function public.enforce_device_limit()     from public, anon, authenticated;

-- 2. Funciones internas: solo se llaman desde policies (que corren como el
--    propio motor) o desde el service_role. Nadie las necesita vía REST.
revoke execute on function public.course_is_visible(uuid)         from public, anon, authenticated;
revoke execute on function public.has_course_progress(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.has_book_progress(uuid, uuid)   from public, anon, authenticated;
revoke execute on function public.is_admin()                      from public, anon, authenticated;
revoke execute on function public.get_setting_int(text)           from public, authenticated;

-- 3. Guard defensivo en las funciones que aceptan `uid`. Un anon o un usuario
--    autenticado no debe poder preguntar por el estado de otra cuenta. Las
--    policies RLS y el propio código siempre pasan auth.uid(), así que este
--    guard no rompe nada legítimo.

create or replace function public.has_content_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when uid is null then false
    when uid <> (select auth.uid()) and not (select public.is_admin()) then false
    else exists (
      select 1 from public.subscriptions s
      where s.user_id = uid
        and (
          s.status = 'active'
          or (
            s.status = 'past_due'
            and s.past_due_since is not null
            and s.past_due_since > now()
                - (public.get_setting_int('grace_period_days') || ' days')::interval
          )
        )
    )
    or exists (
      select 1 from public.profiles p
      where p.id = uid
        and p.deleted_at is null
        and p.trial_started_at is not null
        and now() < p.trial_started_at
                    + (public.get_setting_int('trial_duration_minutes') || ' minutes')::interval
    )
  end;
$$;

create or replace function public.access_expires_at(uid uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when uid is null then null
    when uid <> (select auth.uid()) and not (select public.is_admin()) then null
    else greatest(
      coalesce((
        select max(
          case
            when s.status = 'active' then s.current_period_end
            when s.status = 'past_due' then s.past_due_since
                 + (public.get_setting_int('grace_period_days') || ' days')::interval
          end
        )
        from public.subscriptions s where s.user_id = uid
      ), '-infinity'::timestamptz),
      coalesce((
        select p.trial_started_at
               + (public.get_setting_int('trial_duration_minutes') || ' minutes')::interval
        from public.profiles p where p.id = uid and p.trial_started_at is not null
      ), '-infinity'::timestamptz)
    )
  end;
$$;
