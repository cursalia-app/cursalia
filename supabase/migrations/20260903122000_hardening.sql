-- Hardening del esquema inicial. Silencia todos los advisors WARN/INFO sin
-- cambiar semántica: policies siguen decidiendo lo mismo, funciones siguen
-- devolviendo lo mismo. Solo cambia el plan de ejecución y la superficie.

-- 1. search_path fijo en las dos funciones que faltaban.
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

-- 2. webhook_events: policy explícita denegatoria para autenticados. La tabla
-- ya la usaba solo service_role, pero declararlo cierra el aviso "RLS enabled
-- no policy" y deja el contrato claro para quien lea el esquema.
create policy webhook_events_deny_all on public.webhook_events
  for all to anon, authenticated using (false) with check (false);

-- 3. Envuelve auth.uid() / is_admin() en subselects para que Postgres los
-- evalúe una vez por consulta, no una vez por fila. Cambio de rendimiento,
-- no de semántica.

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

-- 4. Catálogo: separar el "for all" en insert/update/delete evita que la misma
-- policy compita con la de select para el rol authenticated (aviso de
-- "multiple_permissive_policies" en SELECT).

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

-- 5. FKs sin índice. Los tres son campos que se filtran por FK en consultas
-- reales del panel y del servicio de auditoría.
create index if not exists audit_log_actor_id_idx    on public.audit_log    (actor_id);
create index if not exists book_progress_book_id_idx on public.book_progress (book_id);
create index if not exists courses_owner_id_idx      on public.courses      (owner_id);
