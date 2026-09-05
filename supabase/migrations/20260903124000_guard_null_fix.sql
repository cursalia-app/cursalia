-- Fix del guard defensivo en has_content_access y access_expires_at.
-- La versión anterior escribía `uid <> auth.uid()`, pero cuando auth.uid()
-- es null (rol anon sin sesión) esa comparación produce NULL, no true,
-- y el CASE caía al `else` en vez de bloquear. Se detectó con smoke test:
-- access_expires_at para un uid arbitrario devolvía '-infinity' en vez
-- de null. Ahora se afirma la condición positiva: solo pasa si es admin
-- o si hay sesión Y el uid coincide.

create or replace function public.has_content_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select public.is_admin())
      or (uid is not null and uid = (select auth.uid()))
    then exists (
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
    else false
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
    when (select public.is_admin())
      or (uid is not null and uid = (select auth.uid()))
    then greatest(
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
    else null
  end;
$$;
