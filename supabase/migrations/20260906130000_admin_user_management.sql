-- Gestión completa de usuarios desde el panel.
--
-- Dos operaciones nuevas:
--   admin_toggle_admin      - promover o degradar el rol
--   admin_soft_delete_user  - "derecho al olvido" (RGPD)
--
-- La eliminación es blanda por diseño: si borráramos con CASCADE por auth.users
-- perderíamos los pagos, la trazabilidad y las comisiones, que son datos
-- contables. En su lugar anonimizamos el PII (email, IP), cortamos accesos y
-- liberamos dispositivos. La anonimización de auth.users se hace desde el
-- server action con la Admin API de Supabase.

create or replace function public.admin_toggle_admin(
  target_user_id uuid,
  make_admin     boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  -- Un admin no puede quitarse a sí mismo el rol: evita quedarnos sin admins
  -- por accidente. Hay que hacerlo desde otra cuenta admin.
  if make_admin is false and target_user_id = auth.uid() then
    raise exception 'cannot_demote_self' using errcode = 'check_violation';
  end if;

  update public.profiles
     set is_admin = make_admin
   where id = target_user_id
     and deleted_at is null;

  if not found then
    raise exception 'user_not_found' using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (
    auth.uid(),
    case when make_admin then 'admin_granted' else 'admin_revoked' end,
    'profile',
    target_user_id,
    jsonb_build_object('is_admin', make_admin)
  );
end;
$$;

revoke execute on function public.admin_toggle_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_toggle_admin(uuid, boolean) to authenticated;

create or replace function public.admin_soft_delete_user(
  target_user_id uuid,
  reason         text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  anon_email    text;
  existing_email text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'cannot_delete_self' using errcode = 'check_violation';
  end if;

  select email into existing_email
    from public.profiles
   where id = target_user_id and deleted_at is null;

  if existing_email is null then
    raise exception 'user_not_found' using errcode = 'no_data_found';
  end if;

  -- Email estable y único, sin colisión con nada real: el UUID del usuario
  -- va literal en el local-part y el dominio es local. Al ser único, cumple
  -- el UNIQUE constraint de profiles.email sin necesidad de nulls.
  anon_email := 'deleted-' || target_user_id::text || '@cursalia.local';

  update public.profiles
     set email                = anon_email,
         deleted_at           = now(),
         trial_started_at     = null,
         signup_ip            = null,
         is_admin             = false,
         external_customer_id = null,
         referred_by          = null
   where id = target_user_id;

  -- Corta suscripciones activas: el acceso caduca al instante.
  update public.subscriptions
     set status = 'canceled',
         canceled_at = now(),
         current_period_end = least(current_period_end, now())
   where user_id = target_user_id
     and status = 'active';

  -- Libera todos los dispositivos: si el usuario volviera con un fresh signup
  -- (mismo email, cuenta nueva) no quedaría bloqueado por límite.
  update public.user_devices
     set released_at = now()
   where user_id = target_user_id
     and released_at is null;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (
    auth.uid(),
    'user_deleted',
    'profile',
    target_user_id,
    jsonb_build_object(
      'reason', reason,
      'previous_email_hash', encode(digest(existing_email, 'sha256'), 'hex')
    )
  );

  return jsonb_build_object(
    'user_id',    target_user_id,
    'anon_email', anon_email
  );
end;
$$;

revoke execute on function public.admin_soft_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_soft_delete_user(uuid, text) to authenticated;
