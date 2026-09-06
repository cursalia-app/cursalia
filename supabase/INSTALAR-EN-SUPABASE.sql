-- ============================================================
-- CURSALIA - INSTALACIÓN COMPLETA DE LA BASE DE DATOS
--
-- Copia TODO este archivo y pégalo en el SQL Editor de Supabase.
-- Se ejecuta una sola vez, sobre un proyecto recién creado.
-- ============================================================

-- ---------- 1. ESQUEMA, FUNCIONES, TRIGGERS Y SEGURIDAD ----------

-- Cursalia — esquema inicial.
-- Toda tabla lleva sus policies RLS en este mismo archivo: no existe tabla sin proteger.
-- La regla de acceso (RN-02) vive UNA sola vez, en public.has_content_access.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Ajustes en caliente
-- ---------------------------------------------------------------------------

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('trial_duration_minutes',      '30'::jsonb),
  ('max_devices',                 '4'::jsonb),
  ('entry_commission_cents',      '3000'::jsonb),
  ('grace_period_days',           '3'::jsonb),
  ('device_release_cooldown_days','30'::jsonb),
  ('subscription_price_cents',    '2900'::jsonb);

-- Lectura de ajustes desde SQL. security definer para que las policies puedan
-- usarla sin depender de los permisos del llamante.
create or replace function public.get_setting_int(setting_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (value #>> '{}')::integer from public.app_settings where key = setting_key;
$$;

-- ---------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null unique,
  trial_started_at      timestamptz,
  referred_by           uuid references public.profiles(id),
  external_customer_id  text unique,
  signup_ip             inet,
  is_admin              boolean not null default false,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  constraint profiles_no_self_referral check (referred_by is null or referred_by <> id)
);

create index profiles_referred_by_idx on public.profiles (referred_by);
create index profiles_external_customer_id_idx on public.profiles (external_customer_id);
create index profiles_email_idx on public.profiles (email);

-- Rol de administrador. security definer porque las policies de profiles la usan:
-- leerla con RLS activo provocaría recursión infinita.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Suscripciones y pagos
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.profiles(id) on delete cascade,
  status                    text not null check (status in ('active','past_due','canceled','expired')),
  current_period_end        timestamptz,
  past_due_since            timestamptz,
  external_subscription_id  text unique,
  canceled_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);
create index subscriptions_status_idx on public.subscriptions (status);

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  type                 text not null check (type in ('entry','recurring')),
  amount_cents         integer not null check (amount_cents >= 0),
  currency             text not null default 'EUR',
  external_payment_id  text not null unique,
  paid_at              timestamptz not null,
  created_at           timestamptz not null default now()
);

create index payments_user_id_idx on public.payments (user_id);
create index payments_type_idx on public.payments (type);

-- ---------------------------------------------------------------------------
-- LA regla de acceso (RN-02). Única implementación. Prohibido replicarla en TypeScript.
-- ---------------------------------------------------------------------------

create or replace function public.has_content_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
  );
$$;

-- Momento exacto en que caduca el acceso. Acota la caducidad de las URLs firmadas (RN-07).
create or replace function public.access_expires_at(uid uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
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
  );
$$;

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  position    integer not null default 0,
  status      text not null default 'draft' check (status in ('draft','published','archived')),
  created_at  timestamptz not null default now()
);

create table public.courses (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories(id) on delete restrict,
  owner_id     uuid references public.profiles(id),
  title        text not null,
  slug         text not null unique,
  description  text,
  cover_url    text,
  status       text not null default 'draft' check (status in ('draft','published','archived')),
  position     integer not null default 0,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

create index courses_category_id_idx on public.courses (category_id);
create index courses_status_idx on public.courses (status);
create index courses_published_at_idx on public.courses (published_at desc);

-- "Tema" en la interfaz.
create table public.modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  title       text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index modules_course_position_idx on public.modules (course_id, position);

-- "Capítulo" en la interfaz. Nunca guarda archivos: solo la referencia externa.
create table public.lessons (
  id                uuid primary key default gen_random_uuid(),
  module_id         uuid not null references public.modules(id) on delete cascade,
  title             text not null,
  position          integer not null default 0,
  video_provider    text not null default 'bunny',
  video_id          text,
  duration_seconds  integer,
  is_published      boolean not null default false,
  created_at        timestamptz not null default now()
);

create index lessons_module_position_idx on public.lessons (module_id, position);

create table public.books (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  author           text,
  slug             text not null unique,
  description      text,
  cover_url        text,
  file_provider    text not null default 'bunny_storage',
  file_path        text not null,
  page_count       integer not null check (page_count > 0),
  is_downloadable  boolean not null default false,
  status           text not null default 'draft' check (status in ('draft','published','archived')),
  position         integer not null default 0,
  published_at     timestamptz,
  created_at       timestamptz not null default now()
);

create index books_status_idx on public.books (status);
create index books_published_at_idx on public.books (published_at desc);

-- ---------------------------------------------------------------------------
-- Progreso — siempre en la hoja. Los agregados se calculan, nunca se almacenan.
-- ---------------------------------------------------------------------------

create table public.lesson_progress (
  user_id                uuid not null references public.profiles(id) on delete cascade,
  lesson_id              uuid not null references public.lessons(id) on delete cascade,
  last_position_seconds  integer not null default 0 check (last_position_seconds >= 0),
  completed_at           timestamptz,
  updated_at             timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index lesson_progress_recent_idx on public.lesson_progress (user_id, updated_at desc);
create index lesson_progress_lesson_idx on public.lesson_progress (lesson_id);

create table public.book_progress (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  book_id       uuid not null references public.books(id) on delete cascade,
  last_page     integer not null default 1 check (last_page >= 1),
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index book_progress_recent_idx on public.book_progress (user_id, updated_at desc);

-- RN-06: un curso archivado sigue siendo visible para quien ya tiene progreso en él.
-- security definer para poder mirar el progreso desde la policy de courses.
create or replace function public.has_course_progress(course uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id
    join public.modules m on m.id = l.module_id
    where lp.user_id = uid and m.course_id = course
  );
$$;

create or replace function public.has_book_progress(book uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.book_progress bp where bp.user_id = uid and bp.book_id = book
  );
$$;

-- Visibilidad de un curso, resuelta en un solo sitio para que modules y lessons
-- la hereden sin duplicar la condición.
create or replace function public.course_is_visible(course uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.courses c
    where c.id = course
      and (
        c.status = 'published'
        or public.is_admin()
        or (c.status = 'archived' and public.has_course_progress(c.id, auth.uid()))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Dispositivos
-- ---------------------------------------------------------------------------

create table public.user_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  fingerprint   text not null,
  user_agent    text,
  last_seen_at  timestamptz not null default now(),
  released_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create index user_devices_user_id_idx on public.user_devices (user_id);

-- RN-08. El límite se impone en la base de datos, nunca contando desde la aplicación:
-- dos altas simultáneas con 3 dispositivos no pueden dejar 5.
create or replace function public.enforce_device_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
  max_allowed  integer;
begin
  if new.released_at is not null then
    return new;
  end if;

  -- Serializa las altas del mismo usuario dentro de la transacción.
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  max_allowed := public.get_setting_int('max_devices');

  select count(*) into active_count
  from public.user_devices d
  where d.user_id = new.user_id and d.released_at is null and d.id <> new.id;

  if active_count >= max_allowed then
    raise exception 'device_limit_reached' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger user_devices_enforce_limit
  before insert on public.user_devices
  for each row execute function public.enforce_device_limit();

-- ---------------------------------------------------------------------------
-- Afiliados
-- ---------------------------------------------------------------------------

create table public.affiliate_profiles (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  code          text not null unique,
  activated_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create table public.commissions (
  id                 uuid primary key default gen_random_uuid(),
  affiliate_user_id  uuid not null references public.profiles(id) on delete cascade,
  referred_user_id   uuid not null references public.profiles(id) on delete cascade,
  payment_id         uuid not null unique references public.payments(id) on delete restrict,
  amount_cents       integer not null check (amount_cents >= 0),
  status             text not null default 'pending' check (status in ('pending','approved','paid','rejected')),
  created_at         timestamptz not null default now(),
  -- RN-11: una sola comisión por referido, jamás dos.
  constraint commissions_one_per_referral unique (referred_user_id)
);

create index commissions_affiliate_idx on public.commissions (affiliate_user_id);
create index commissions_status_idx on public.commissions (status);

-- El código de afiliado nunca se expone con un SELECT abierto: solo se resuelve.
create or replace function public.resolve_referral_code(referral_code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id from public.affiliate_profiles a where a.code = upper(referral_code);
$$;

-- ---------------------------------------------------------------------------
-- Trazabilidad
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles(id) on delete set null,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  diff         jsonb,
  created_at   timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

-- Idempotencia del webhook de pagos (RN-14).
create table public.webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  external_event_id  text not null unique,
  payload            jsonb not null,
  processed_at       timestamptz,
  error              text,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers de ciclo de vida
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger lesson_progress_touch before update on public.lesson_progress
  for each row execute function public.touch_updated_at();
create trigger book_progress_touch before update on public.book_progress
  for each row execute function public.touch_updated_at();
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Alta de perfil al registrarse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RN-03: la prueba arranca al verificar el correo, no al registrarse.
-- Idempotente: si ya hay fecha, no se toca.
create or replace function public.handle_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles
      set trial_started_at = coalesce(trial_started_at, now())
      where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update on auth.users
  for each row execute function public.handle_email_confirmed();

-- El usuario puede editar su perfil, pero no puede regalarse acceso, rol ni afiliación.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  new.is_admin         := old.is_admin;
  new.trial_started_at := old.trial_started_at;
  new.referred_by      := old.referred_by;
  new.external_customer_id := old.external_customer_id;
  new.email            := old.email;
  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.app_settings        enable row level security;
alter table public.profiles            enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.payments            enable row level security;
alter table public.categories          enable row level security;
alter table public.courses             enable row level security;
alter table public.modules             enable row level security;
alter table public.lessons             enable row level security;
alter table public.books               enable row level security;
alter table public.lesson_progress     enable row level security;
alter table public.book_progress       enable row level security;
alter table public.user_devices        enable row level security;
alter table public.affiliate_profiles  enable row level security;
alter table public.commissions         enable row level security;
alter table public.audit_log           enable row level security;
alter table public.webhook_events      enable row level security;

-- app_settings: legibles por cualquier autenticado, escribibles solo por admin.
create policy app_settings_select on public.app_settings
  for select to authenticated using (true);
create policy app_settings_update on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy app_settings_insert on public.app_settings
  for insert to authenticated with check (public.is_admin());

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- subscriptions y payments: solo lectura propia. Se escriben desde el webhook.
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy payments_select on public.payments
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- categories
create policy categories_select on public.categories
  for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy categories_write on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- courses: RN-06 incluido.
create policy courses_select on public.courses
  for select to anon, authenticated using (
    status = 'published'
    or public.is_admin()
    or (status = 'archived' and public.has_course_progress(id, auth.uid()))
  );
create policy courses_write on public.courses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- modules y lessons heredan la visibilidad del curso.
create policy modules_select on public.modules
  for select to anon, authenticated using (public.course_is_visible(course_id));
create policy modules_write on public.modules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Solo METADATOS. La URL del vídeo jamás sale de aquí: la emite /api/video/[lessonId].
create policy lessons_select on public.lessons
  for select to anon, authenticated using (
    public.is_admin()
    or (is_published and public.course_is_visible((select m.course_id from public.modules m where m.id = module_id)))
  );
create policy lessons_write on public.lessons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- books
create policy books_select on public.books
  for select to anon, authenticated using (
    status = 'published'
    or public.is_admin()
    or (status = 'archived' and public.has_book_progress(id, auth.uid()))
  );
create policy books_write on public.books
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Progreso: solo el propio. Nunca se borra.
create policy lesson_progress_select on public.lesson_progress
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy lesson_progress_insert on public.lesson_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy lesson_progress_update on public.lesson_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy book_progress_select on public.book_progress
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy book_progress_insert on public.book_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy book_progress_update on public.book_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Dispositivos: se ven y se liberan, pero se dan de alta desde el servidor.
create policy user_devices_select on public.user_devices
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy user_devices_delete on public.user_devices
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Afiliados
create policy affiliate_profiles_select on public.affiliate_profiles
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy commissions_select on public.commissions
  for select to authenticated using (affiliate_user_id = auth.uid() or public.is_admin());
create policy commissions_update on public.commissions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Auditoría: solo lectura y solo para administradores.
create policy audit_log_select on public.audit_log
  for select to authenticated using (public.is_admin());

-- webhook_events no lleva ninguna policy: solo service_role puede tocarla.

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on public.categories, public.courses, public.modules, public.lessons, public.books to anon, authenticated;
grant select on public.app_settings, public.profiles, public.subscriptions, public.payments,
                public.affiliate_profiles, public.commissions, public.audit_log, public.user_devices to authenticated;
grant insert, update on public.profiles, public.lesson_progress, public.book_progress to authenticated;
grant select on public.lesson_progress, public.book_progress to authenticated;
grant delete on public.user_devices to authenticated;
grant insert, update, delete on public.categories, public.courses, public.modules, public.lessons, public.books to authenticated;
grant update, insert on public.app_settings to authenticated;
grant update on public.commissions to authenticated;

revoke execute on function public.get_setting_int(text) from anon;
grant execute on function public.has_content_access(uuid) to authenticated;
grant execute on function public.access_expires_at(uuid) to authenticated;
grant execute on function public.resolve_referral_code(text) to anon, authenticated;

-- ---------- 2. OPERACIONES DEL PANEL DE ADMINISTRACIÓN ----------

-- Operaciones de administración que deben ocurrir en UNA transacción.
-- Se exponen como RPC para que el panel no pueda dejarlas a medias.

-- Reordena en bloque: la posición de cada fila es su índice en el array.
-- Se usa al arrastrar en el panel; el orden nunca es alfabético.
create or replace function public.reorder_entity(entity text, ordered_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  case entity
    when 'category' then
      update public.categories c
        set position = idx.position
        from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) - 1 as position) idx
        where c.id = idx.id;
    when 'course' then
      update public.courses c
        set position = idx.position
        from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) - 1 as position) idx
        where c.id = idx.id;
    when 'module' then
      update public.modules m
        set position = idx.position
        from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) - 1 as position) idx
        where m.id = idx.id;
    when 'lesson' then
      update public.lessons l
        set position = idx.position
        from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) - 1 as position) idx
        where l.id = idx.id;
    when 'book' then
      update public.books b
        set position = idx.position
        from (select unnest(ordered_ids) as id, generate_subscripts(ordered_ids, 1) - 1 as position) idx
        where b.id = idx.id;
    else
      raise exception 'unknown_entity: %', entity;
  end case;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (auth.uid(), 'reorder', entity, null, jsonb_build_object('ordered_ids', to_jsonb(ordered_ids)));
end;
$$;

-- Cambia el estado y graba published_at SOLO en la primera publicación.
create or replace function public.set_content_status(entity text, target_id uuid, new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  if new_status not in ('draft','published','archived') then
    raise exception 'unknown_status: %', new_status;
  end if;

  case entity
    when 'category' then
      select status into previous from public.categories where id = target_id;
      update public.categories set status = new_status where id = target_id;
    when 'course' then
      select status into previous from public.courses where id = target_id;
      update public.courses
        set status = new_status,
            published_at = case
              when new_status = 'published' then coalesce(published_at, now())
              else published_at
            end
        where id = target_id;
    when 'book' then
      select status into previous from public.books where id = target_id;
      update public.books
        set status = new_status,
            published_at = case
              when new_status = 'published' then coalesce(published_at, now())
              else published_at
            end
        where id = target_id;
    else
      raise exception 'unknown_entity: %', entity;
  end case;

  if previous is null then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, diff)
  values (auth.uid(), 'change_status', entity, target_id,
          jsonb_build_object('from', previous, 'to', new_status));
end;
$$;

grant execute on function public.reorder_entity(text, uuid[]) to authenticated;
grant execute on function public.set_content_status(text, uuid, text) to authenticated;

-- ---------- 3. HARDENING: PLAN DE RLS Y SUPERFICIE DE FUNCIONES ----------

-- Fija search_path en las dos funciones-trigger que faltaban.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  new.is_admin         := old.is_admin;
  new.trial_started_at := old.trial_started_at;
  new.referred_by      := old.referred_by;
  new.external_customer_id := old.external_customer_id;
  new.email            := old.email;
  return new;
end;
$$;

-- webhook_events: policy explícita denegatoria para autenticados. Solo
-- service_role puede tocar la tabla; declararlo cierra el aviso y deja el
-- contrato claro.
create policy webhook_events_deny_all on public.webhook_events
  for all to anon, authenticated using (false) with check (false);

-- Envuelve auth.uid() / is_admin() en subselects para que Postgres los
-- evalúe una vez por consulta, no una vez por fila.

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));

drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

drop policy subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy courses_select on public.courses;
create policy courses_select on public.courses
  for select to anon, authenticated using (
    status = 'published'
    or (select public.is_admin())
    or (status = 'archived' and public.has_course_progress(id, (select auth.uid())))
  );

drop policy books_select on public.books;
create policy books_select on public.books
  for select to anon, authenticated using (
    status = 'published'
    or (select public.is_admin())
    or (status = 'archived' and public.has_book_progress(id, (select auth.uid())))
  );

drop policy lesson_progress_select on public.lesson_progress;
create policy lesson_progress_select on public.lesson_progress
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy lesson_progress_insert on public.lesson_progress;
create policy lesson_progress_insert on public.lesson_progress
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy lesson_progress_update on public.lesson_progress;
create policy lesson_progress_update on public.lesson_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy book_progress_select on public.book_progress;
create policy book_progress_select on public.book_progress
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy book_progress_insert on public.book_progress;
create policy book_progress_insert on public.book_progress
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy book_progress_update on public.book_progress;
create policy book_progress_update on public.book_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy user_devices_select on public.user_devices;
create policy user_devices_select on public.user_devices
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy user_devices_delete on public.user_devices;
create policy user_devices_delete on public.user_devices
  for delete to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy affiliate_profiles_select on public.affiliate_profiles;
create policy affiliate_profiles_select on public.affiliate_profiles
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy commissions_select on public.commissions;
create policy commissions_select on public.commissions
  for select to authenticated using (affiliate_user_id = (select auth.uid()) or (select public.is_admin()));

drop policy commissions_update on public.commissions;
create policy commissions_update on public.commissions
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated using ((select public.is_admin()));

drop policy app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy app_settings_insert on public.app_settings;
create policy app_settings_insert on public.app_settings
  for insert to authenticated with check ((select public.is_admin()));

-- Catálogo: separar el "for all" en insert/update/delete evita el aviso de
-- "multiple_permissive_policies" en SELECT.

drop policy categories_write on public.categories;
create policy categories_insert on public.categories
  for insert to authenticated with check ((select public.is_admin()));
create policy categories_update on public.categories
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy categories_delete on public.categories
  for delete to authenticated using ((select public.is_admin()));

drop policy courses_write on public.courses;
create policy courses_insert on public.courses
  for insert to authenticated with check ((select public.is_admin()));
create policy courses_update on public.courses
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy courses_delete on public.courses
  for delete to authenticated using ((select public.is_admin()));

drop policy modules_write on public.modules;
create policy modules_insert on public.modules
  for insert to authenticated with check ((select public.is_admin()));
create policy modules_update on public.modules
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy modules_delete on public.modules
  for delete to authenticated using ((select public.is_admin()));

drop policy lessons_write on public.lessons;
create policy lessons_insert on public.lessons
  for insert to authenticated with check ((select public.is_admin()));
create policy lessons_update on public.lessons
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy lessons_delete on public.lessons
  for delete to authenticated using ((select public.is_admin()));

drop policy books_write on public.books;
create policy books_insert on public.books
  for insert to authenticated with check ((select public.is_admin()));
create policy books_update on public.books
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy books_delete on public.books
  for delete to authenticated using ((select public.is_admin()));

create index if not exists audit_log_actor_id_idx    on public.audit_log    (actor_id);
create index if not exists book_progress_book_id_idx on public.book_progress (book_id);
create index if not exists courses_owner_id_idx      on public.courses      (owner_id);

-- Cierra la superficie de las funciones SECURITY DEFINER: triggers ocultos
-- del REST y guard defensivo en las funciones que aceptan `uid`.

revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.handle_email_confirmed()   from public, anon, authenticated;
revoke execute on function public.enforce_device_limit()     from public, anon, authenticated;

revoke execute on function public.course_is_visible(uuid)         from public, anon, authenticated;
revoke execute on function public.has_course_progress(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.has_book_progress(uuid, uuid)   from public, anon, authenticated;
revoke execute on function public.is_admin()                      from public, anon, authenticated;
revoke execute on function public.get_setting_int(text)           from public, authenticated;

-- El guard es una condición afirmativa, no `uid <> auth.uid()`: comparar
-- contra null en SQL da NULL (lógica de tres valores), y el CASE caería al
-- ELSE dejando pasar consultas anónimas. Se exige explícitamente admin o
-- coincidencia con auth.uid().
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

-- ---------- 4. RATE LIMITING Y TRIAL GUARD POR IP ----------

create table if not exists public.rate_limit_events (
  bucket     text not null,
  actor      text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup
  on public.rate_limit_events (bucket, actor, created_at desc);

alter table public.rate_limit_events enable row level security;

create policy rate_limit_events_deny_all on public.rate_limit_events
  for all to anon, authenticated using (false) with check (false);

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

insert into public.app_settings (key, value) values
  ('trial_ip_cooldown_hours', '24'::jsonb)
on conflict (key) do nothing;

-- Al confirmar el correo, si desde la misma IP se arrancó otro trial dentro del
-- cooldown, se registra el intento y NO se arranca la prueba. La cuenta queda
-- creada; simplemente no obtiene los 30 minutos gratis.
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

-- signup_ip solo lo pone el servidor. El trigger de protección revierte
-- cualquier intento del usuario de editarlo desde su sesión.
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

-- ---------- 5. BÚSQUEDA GLOBAL DEL CATÁLOGO ----------

create extension if not exists unaccent;

create or replace function public.search_catalog(query text, max_results integer default 5)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select
      trim(coalesce(query, ''))                                        as raw,
      '%' || unaccent(lower(trim(coalesce(query, '')))) || '%'         as pattern,
      unaccent(lower(trim(coalesce(query, '')))) || '%'                as prefix
  ),
  matched_courses as (
    select
      c.id, c.slug, c.title, cat.name as category_name, c.cover_url,
      case when unaccent(lower(c.title)) like q.prefix then 0 else 1 end as rank
    from public.courses c
    join public.categories cat on cat.id = c.category_id
    cross join q
    where length(q.raw) > 0
      and unaccent(lower(coalesce(c.title, '') || ' ' ||
                         coalesce(c.description, '') || ' ' ||
                         cat.name)) like q.pattern
    order by rank, c.title
    limit greatest(max_results, 1)
  ),
  matched_books as (
    select
      b.id, b.slug, b.title, b.author, b.cover_url,
      case when unaccent(lower(b.title)) like q.prefix then 0 else 1 end as rank
    from public.books b
    cross join q
    where length(q.raw) > 0
      and unaccent(lower(coalesce(b.title, '') || ' ' ||
                         coalesce(b.author, '') || ' ' ||
                         coalesce(b.description, ''))) like q.pattern
    order by rank, b.title
    limit greatest(max_results, 1)
  )
  select jsonb_build_object(
    'courses', coalesce((select jsonb_agg(to_jsonb(matched_courses) - 'rank') from matched_courses), '[]'::jsonb),
    'books',   coalesce((select jsonb_agg(to_jsonb(matched_books)   - 'rank') from matched_books),   '[]'::jsonb)
  );
$$;

grant execute on function public.search_catalog(text, integer) to anon, authenticated;

-- ---------- 6. CATEGORÍAS DE EJEMPLO ----------

-- Datos mínimos para arrancar en local.
-- No crea usuarios: eso lo hace Supabase Auth al registrarse desde /registro.
-- Para convertir a alguien en administrador, después de que se registre:
--   update public.profiles set is_admin = true where email = 'tu@correo.com';

insert into public.categories (name, slug, position, status) values
  ('Inteligencia Artificial', 'inteligencia-artificial', 0, 'published'),
  ('Programación',            'programacion',            1, 'published'),
  ('Marketing Digital',       'marketing-digital',       2, 'published'),
  ('Diseño',                  'diseno',                  3, 'published'),
  ('Negocio',                 'negocio',                 4, 'published')
on conflict (slug) do nothing;
