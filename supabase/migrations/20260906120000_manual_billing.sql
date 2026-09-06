-- Cobro manual mensual.
--
-- El pago se gestiona fuera de la aplicación (transferencia, Bizum, lo que
-- sea). Cursalia solo sabe DOS cosas: hasta qué fecha se ha pagado, y quién
-- lo tramitó. El admin extiende el acceso desde el panel; cuando la fecha
-- pasa, el acceso se corta solo, porque `has_content_access` mira la fecha.
--
-- Con esto el modelo pasa de "el proveedor manda un webhook y activa" a
-- "el admin cobra fuera y marca aquí que se cobró". El resto del sistema
-- (RLS, guards, URLs firmadas, comisiones de afiliado) sigue intacto: solo
-- cambia quién dispara la actualización.

-- ---------------------------------------------------------------------------
-- 1. Bug latente: la regla de acceso miraba el status sin comprobar la fecha.
--    Un 'active' con current_period_end en el pasado seguía dando acceso, lo
--    cual con pagos automáticos rara vez pasaba, pero con pagos manuales es
--    exactamente el escenario normal cuando alguien no renueva.
-- ---------------------------------------------------------------------------

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
          -- Un acceso activo requiere fecha de fin en el futuro. Sin fecha,
          -- no hay acceso: la cuenta no puede quedarse en 'active' eterno
          -- por error de datos.
          (s.status = 'active'
            and s.current_period_end is not null
            and s.current_period_end > now())
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

-- ---------------------------------------------------------------------------
-- 2. Extensión del acceso.
--    Suma `months` meses al fin del periodo actual, o a la fecha de hoy si el
--    periodo ya venció (o no existía). Opcionalmente registra un pago con
--    importe manual, que dispara la comisión de afiliado como cualquier otro
--    pago legítimo. Toda la operación es una única transacción.
-- ---------------------------------------------------------------------------

create or replace function public.admin_extend_access(
  target_user_id uuid,
  months         integer default 1,
  amount_cents   integer default null,
  note           text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts     timestamptz := now();
  base_ts    timestamptz;
  new_end    timestamptz;
  existing   record;
  new_sub_id uuid;
  payment_id uuid;
  affiliate_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if months is null or months < 1 or months > 24 then
    raise exception 'invalid_months' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id and deleted_at is null) then
    raise exception 'user_not_found' using errcode = 'no_data_found';
  end if;

  select id, current_period_end
    into existing
    from public.subscriptions
   where user_id = target_user_id
   order by created_at desc
   limit 1;

  base_ts := greatest(coalesce(existing.current_period_end, now_ts), now_ts);
  new_end := base_ts + (months || ' months')::interval;

  if existing.id is not null then
    update public.subscriptions
       set status = 'active',
           current_period_end = new_end,
           past_due_since = null,
           canceled_at = null
     where id = existing.id;
  else
    insert into public.subscriptions (user_id, status, current_period_end)
      values (target_user_id, 'active', new_end)
      returning id into new_sub_id;
  end if;

  -- Pago opcional: solo si el admin declaró importe. Sin importe, es un
  -- ajuste (cortesía, corrección) y no debe generar comisión.
  if amount_cents is not null and amount_cents > 0 then
    insert into public.payments (
      user_id, type, amount_cents, currency, external_payment_id, paid_at
    ) values (
      target_user_id,
      'recurring',
      amount_cents,
      'EUR',
      -- Prefijo 'manual:' para distinguir de los external_payment_id que
      -- vendrían de una pasarela real, y que sigan bajo el unique constraint.
      'manual:' || gen_random_uuid()::text,
      now_ts
    )
    returning id into payment_id;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (
    auth.uid(),
    'access_extended',
    'subscription',
    coalesce(existing.id, new_sub_id),
    jsonb_build_object(
      'user_id', target_user_id,
      'months', months,
      'from', existing.current_period_end,
      'to', new_end,
      'payment_id', payment_id,
      'amount_cents', amount_cents,
      'note', note
    )
  );

  return jsonb_build_object(
    'subscription_id', coalesce(existing.id, new_sub_id),
    'current_period_end', new_end,
    'payment_id', payment_id
  );
end;
$$;

revoke execute on function public.admin_extend_access(uuid, integer, integer, text)
  from public, anon;
grant execute on function public.admin_extend_access(uuid, integer, integer, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Corte inmediato del acceso.
--    Marca la suscripción como cancelada y adelanta la fecha de fin a ahora.
--    Efecto: `has_content_access` devuelve false en la siguiente petición,
--    RLS deja de servir contenido, las URLs firmadas nuevas ya no salen.
--    Las URLs ya emitidas caducan solas en <=4h por diseño.
-- ---------------------------------------------------------------------------

create or replace function public.admin_revoke_access(
  target_user_id uuid,
  reason         text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts   timestamptz := now();
  existing record;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  select id, current_period_end, status
    into existing
    from public.subscriptions
   where user_id = target_user_id
   order by created_at desc
   limit 1;

  if existing.id is null then
    raise exception 'no_subscription' using errcode = 'no_data_found';
  end if;

  update public.subscriptions
     set status = 'canceled',
         canceled_at = now_ts,
         current_period_end = least(current_period_end, now_ts)
   where id = existing.id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (
    auth.uid(),
    'access_revoked',
    'subscription',
    existing.id,
    jsonb_build_object(
      'user_id', target_user_id,
      'previous_status', existing.status,
      'previous_end', existing.current_period_end,
      'reason', reason
    )
  );

  return jsonb_build_object('subscription_id', existing.id, 'canceled_at', now_ts);
end;
$$;

revoke execute on function public.admin_revoke_access(uuid, text) from public, anon;
grant execute on function public.admin_revoke_access(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Vencimientos próximos, para que el admin sepa a quién revisar.
--    Devuelve tanto los que caducan pronto como los que ya caducaron y no se
--    han renovado. `days_ahead` marca la ventana futura; los pasados se
--    incluyen sin límite porque son los urgentes.
-- ---------------------------------------------------------------------------

create or replace function public.admin_upcoming_expirations(days_ahead integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into result
  from (
    select
      s.id as subscription_id,
      s.user_id,
      p.email,
      s.current_period_end,
      case
        when s.current_period_end < now() then 'expired'
        else 'upcoming'
      end as kind,
      -- Días restantes; negativo si ya venció.
      extract(day from (s.current_period_end - now()))::integer as days_left
    from public.subscriptions s
    join public.profiles p on p.id = s.user_id
    where s.status = 'active'
      and s.current_period_end is not null
      and s.current_period_end < now() + (days_ahead || ' days')::interval
      and p.deleted_at is null
    order by s.current_period_end asc
    limit 100
  ) t;

  return result;
end;
$$;

revoke execute on function public.admin_upcoming_expirations(integer) from public, anon;
grant execute on function public.admin_upcoming_expirations(integer) to authenticated;
